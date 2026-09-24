import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Button, Spinner, TextArea } from '@lowes-tech/bds-react';
import { computePriority, validateRequest } from '@shared/rules.js';
import { api, readLocal, writeLocal } from '../api.js';
import { DraftPanel } from '../components/DraftPanel.jsx';
import { Lede, Page } from '../components/Layout.jsx';
import { SubmittedView } from '../components/SubmittedView.jsx';

const STORE_KEY = 'featureIntake.assistant.v1';

const EMPTY_DRAFT = {
  title: '', category: '', problem: '', proposedSolution: '', affectedSystems: [], businessValue: '', successMetrics: '',
  usersAffected: '', revenueImpact: '', urgency: '', targetDate: '', urgencyReason: '', regulatory: false,
};
const EMPTY_IDENTITY = { requesterName: '', requesterEmail: '', department: '' };

const EXAMPLES = [
  'Finance re-keys every closed Salesforce deal into SAP by hand. It takes days and causes invoice errors.',
  'Our support team can’t see a customer’s order history without opening three different tools.',
  'We need a report for auditors showing who has access to financial systems each quarter.',
];

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 1.5rem;
  align-items: start;
  @media (max-width: 960px) { grid-template-columns: 1fr; }
  > aside { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; }
  @media (max-width: 960px) { > aside { position: static; max-height: none; } }
`;

const Start = styled.div`
  max-width: 760px;
  margin: 0 auto;
`;

const Examples = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0 1.5rem;
  > span { font-size: 0.85rem; color: var(--bds-color-text-secondary); }
  button {
    all: unset;
    cursor: pointer;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--bds-color-border-subdued);
    border-radius: 8px;
    background: var(--bds-color-surface-default);
    color: var(--bds-color-text-primary);
    font-size: 0.95rem;
    &:hover { border-color: var(--bds-color-border-interactive); }
    &:focus-visible { outline: 2px solid var(--bds-color-border-interactive); }
  }
`;

const Chat = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 60vh;
  background: var(--bds-color-surface-default);
  border: 1px solid var(--bds-color-border-subdued);
  border-radius: 8px;
  box-shadow: var(--bds-shadows-shadow-01);
`;

const Log = styled.ol`
  list-style: none;
  margin: 0;
  padding: 1.25rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
`;

const Bubble = styled.li`
  max-width: 85%;
  padding: 0.75rem 1rem;
  border-radius: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
  ${({ $role }) => ($role === 'user'
    ? 'align-self: flex-end; background: var(--bds-color-surface-dark-blue); color: #fff; border-bottom-right-radius: 4px;'
    : 'align-self: flex-start; background: var(--bds-color-surface-subdued); border-bottom-left-radius: 4px;')}
`;

const Who = styled.span`
  display: block;
  font-size: 0.75rem;
  margin-bottom: 0.2rem;
  opacity: 0.8;
`;

const Suggestions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 1.25rem 0.75rem;
`;

const Composer = styled.form`
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--bds-color-border-subdued);
  > :first-child { flex: 1; }
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
  h1 { margin: 0; }
  a { color: var(--bds-color-text-interactive); }
`;

function loadSaved() {
  const s = readLocal(STORE_KEY, null);
  return {
    messages: Array.isArray(s?.messages) ? s.messages : [],
    draft: { ...EMPTY_DRAFT, ...(s?.draft || {}) },
    identity: { ...EMPTY_IDENTITY, ...(s?.identity || {}) },
    suggestions: Array.isArray(s?.suggestions) ? s.suggestions : [],
  };
}

export default function AssistantIntake() {
  const [initial] = useState(loadSaved);
  const [messages, setMessages] = useState(initial.messages);
  const [draft, setDraft] = useState(initial.draft);
  const [identity, setIdentity] = useState(initial.identity);
  const [suggestions, setSuggestions] = useState(initial.suggestions);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [turnError, setTurnError] = useState('');
  const [updated, setUpdated] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState(null);
  const draftRef = useRef(draft);
  const endRef = useRef(null);

  useEffect(() => { document.title = 'Describe your request · Feature Intake'; }, []);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!created) writeLocal(STORE_KEY, { messages, draft, identity, suggestions });
  }, [messages, draft, identity, suggestions, created]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages, thinking]);

  const errors = useMemo(() => validateRequest({ ...draft, ...identity }).errors, [draft, identity]);
  const estimate = draft.usersAffected && draft.revenueImpact && draft.urgency ? computePriority(draft) : null;

  async function runTurn(convo) {
    setThinking(true);
    setTurnError('');
    setSuggestions([]);
    try {
      const res = await api('/api/assist', { method: 'POST', body: JSON.stringify({ messages: convo, draft: draftRef.current }) });
      // Apply only the fields the assistant changed, so edits made while it was thinking survive.
      setDraft((d) => {
        const next = { ...d };
        for (const f of res.updated) next[f] = res.draft[f];
        return next;
      });
      setUpdated(new Set(res.updated));
      setMessages([...convo, { role: 'assistant', content: res.reply }]);
      setSuggestions(res.suggestions);
    } catch (err) {
      setTurnError(err.message);
    } finally {
      setThinking(false);
    }
  }

  function send(text) {
    const content = text.trim();
    if (!content || thinking) return;
    const convo = [...messages, { role: 'user', content }];
    setMessages(convo);
    setInput('');
    runTurn(convo);
  }

  function editField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
    setUpdated(new Set());
  }

  async function submit() {
    const payload = { ...draft, ...identity };
    if (!validateRequest(payload).valid) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const record = await api('/api/requests', { method: 'POST', body: JSON.stringify({ ...payload, conversation: messages }) });
      writeLocal(STORE_KEY, undefined);
      setCreated(record);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setSubmitError(err.fields ? Object.values(err.fields).join(' ') : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    writeLocal(STORE_KEY, undefined);
    setMessages([]);
    setDraft(EMPTY_DRAFT);
    setSuggestions([]);
    setTurnError('');
    setUpdated(new Set());
    setCreated(null);
    setSubmitError('');
    setInput('');
  }

  if (created) return <SubmittedView record={created} onStartOver={startOver} />;

  // ---- first screen: just describe it ----
  if (messages.length === 0) {
    return (
      <Page>
        <Start>
          <h1>What do you need?</h1>
          <Lede>
            Describe the problem or idea in your own words. I'll ask a few questions and turn it into a complete
            request for the product team. You can review and edit everything before it's submitted.
          </Lede>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <TextArea
              id="describe"
              label="Describe what's slowing you down or what you'd like to be possible"
              rows={6}
              max={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Examples>
              <span>Or start from an example:</span>
              {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => setInput(ex)}>{ex}</button>)}
            </Examples>
            <Toolbar>
              <RouterLink to="/form">Prefer a structured form?</RouterLink>
              <Button type="submit" variant="primary" disabled={!input.trim()}>Start</Button>
            </Toolbar>
          </form>
        </Start>
      </Page>
    );
  }

  // ---- conversation + live draft ----
  const lastIsUser = messages[messages.length - 1]?.role === 'user';
  return (
    <Page>
      <Toolbar>
        <h1>Describe your request</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <RouterLink to="/form">Switch to the form</RouterLink>
          <Button size="small" variant="secondary" onClick={startOver}>Start over</Button>
        </div>
      </Toolbar>
      <Layout>
        <Chat aria-label="Conversation with the intake assistant">
          <Log aria-live="polite">
            {messages.map((m, i) => (
              <Bubble key={i} $role={m.role}>
                <Who>{m.role === 'user' ? 'You' : 'Intake assistant'}</Who>
                {m.content}
              </Bubble>
            ))}
            {thinking && (
              <Bubble $role="assistant" role="status">
                <Spinner show inline small /> Thinking…
              </Bubble>
            )}
            <li ref={endRef} aria-hidden="true" />
          </Log>

          {turnError && (
            <div style={{ padding: '0 1.25rem 1rem' }}>
              <Alert type="error" title="The assistant didn't answer" noClose multiline>{turnError}</Alert>
              {lastIsUser && <Button size="small" variant="secondary" style={{ marginTop: '0.5rem' }} onClick={() => runTurn(messages)}>Try again</Button>}
            </div>
          )}

          {suggestions.length > 0 && !thinking && (
            <Suggestions aria-label="Suggested replies">
              {suggestions.map((s) => (
                <Button key={s} size="small" variant="secondary" shape="rounded" onClick={() => send(s)}>{s}</Button>
              ))}
            </Suggestions>
          )}

          <Composer onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <TextArea
              id="reply"
              label="Your reply"
              rows={2}
              max={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            />
            <Button type="submit" variant="primary" disabled={thinking || !input.trim()}>Send</Button>
          </Composer>
        </Chat>

        <DraftPanel
          draft={draft}
          identity={identity}
          errors={errors}
          updated={updated}
          estimate={estimate}
          onFieldChange={editField}
          onIdentityChange={(f, v) => setIdentity((i) => ({ ...i, [f]: v }))}
          onSubmit={submit}
          submitting={submitting}
          submitError={submitError}
        />
      </Layout>
    </Page>
  );
}
