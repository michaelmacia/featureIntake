import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Alert, Badge, Button, Link, Spinner, TextField } from '@lowes-tech/bds-react';
import { api, fmtDate } from '../api.js';

// Mocks are designed for a 1200x900 desktop viewport; we render at that size and scale to fit.
const VIEWPORT_W = 1200;
const VIEWPORT_H = 900;

const Panel = styled.section`
  margin-top: 1.5rem;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
  h3 { margin: 0; }
`;

const FrameWrap = styled.div`
  aspect-ratio: 4 / 3;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--bds-color-border-default);
  border-radius: 8px;
  background: #fff;
  iframe { display: block; border: 0; transform-origin: 0 0; }
`;

const Meta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: 0.5rem 0 1rem;
  font-size: 0.85rem;
  color: var(--bds-color-text-secondary);
`;

const Pending = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px dashed var(--bds-color-border-default);
  border-radius: 8px;
  color: var(--bds-color-text-secondary);
`;

const FeedbackRow = styled.form`
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
  > :first-child { flex: 1 1 280px; }
`;

const Note = styled.p`
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--bds-color-text-tertiary);
`;

function MockFrame({ src }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrap.current;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / VIEWPORT_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <FrameWrap ref={wrap}>
      {/* sandbox with no allow-* flags: no scripts, no same-origin access. The server also sends a sandbox CSP. */}
      <iframe
        src={src}
        sandbox=""
        title="Concept mock UI"
        loading="lazy"
        style={{ width: VIEWPORT_W, height: VIEWPORT_H, transform: `scale(${scale})` }}
      />
    </FrameWrap>
  );
}

/**
 * The AI-generated concept mock for a request: polls while it is generated, shows it sandboxed,
 * and lets the viewer regenerate it with feedback. Renders nothing when the feature is off.
 */
export function ConceptMock({ id, actor }) {
  const base = `/api/requests/${encodeURIComponent(id)}`;
  const [mock, setMock] = useState(null);
  const [feedback, setFeedback] = useState('');

  const refresh = useCallback(async () => {
    try {
      setMock(await api(`${base}/mock`));
    } catch (e) {
      setMock({ status: 'failed', error: e.message });
    }
  }, [base]);

  useEffect(() => {
    setMock(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (mock?.status !== 'pending') return undefined;
    const t = setTimeout(refresh, 3000);
    return () => clearTimeout(t);
  }, [mock, refresh]);

  async function regenerate(text) {
    setMock({ status: 'pending' });
    try {
      await api(`${base}/mock`, { method: 'POST', body: JSON.stringify({ feedback: text, actor }) });
      setFeedback('');
    } catch (e) {
      setMock({ status: 'failed', error: e.message });
      return;
    }
    refresh();
  }

  if (!mock || mock.status === 'disabled') return null;

  let body;
  if (mock.status === 'pending') {
    body = (
      <Pending role="status">
        <Spinner show inline small />
        Sketching a concept mock of this idea. This usually takes under a minute.
      </Pending>
    );
  } else if (mock.status === 'ready') {
    const src = `${base}/mock.html?v=${encodeURIComponent(mock.completedAt || '')}`;
    body = (
      <>
        <MockFrame src={src} />
        <Meta>
          <span>Generated {fmtDate(mock.completedAt, true)}{mock.feedback ? ' · with feedback' : ''}</span>
          <Link as="a" href={src} target="_blank" rel="noopener" size="small">Open full size</Link>
        </Meta>
        <FeedbackRow onSubmit={(e) => { e.preventDefault(); regenerate(feedback.trim()); }}>
          <TextField
            id={`mock-feedback-${id}`}
            label="Not quite right? Say what to change"
            value={feedback}
            maxLength={1000}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <Button type="submit" variant="secondary">Regenerate</Button>
        </FeedbackRow>
      </>
    );
  } else if (mock.status === 'failed') {
    body = (
      <>
        <Alert type="error" title="The concept mock could not be generated" noClose>
          {mock.error || 'Unknown error.'}
        </Alert>
        <Button variant="secondary" onClick={() => regenerate('')} style={{ marginTop: '0.75rem' }}>Try again</Button>
      </>
    );
  } else {
    body = <Button variant="secondary" onClick={() => regenerate('')}>Generate concept mock</Button>;
  }

  return (
    <Panel aria-live="polite">
      <Head>
        <h3>Concept mock</h3>
        <Badge color="dark-blue" variant="outlined">AI-generated</Badge>
      </Head>
      {body}
      <Note>A quick AI sketch to help everyone picture the idea. It is not a design commitment.</Note>
    </Panel>
  );
}
