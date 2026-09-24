import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Alert, Button, Modal, ModalBody, ModalController, ModalHeader, Option, Select, Spinner, TextArea, TextField,
} from '@lowes-tech/bds-react';
import { TRANSITIONS } from '@shared/rules.js';
import { api, fmtDate } from '../api.js';
import { PriorityBadge, StatusBadge } from '../components/Badges.jsx';
import { ConceptMock } from '../components/ConceptMock.jsx';
import { Stack } from '../components/Layout.jsx';

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1.5rem;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;

const Facts = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.9rem 1.25rem;
  margin: 0;
  dt { font-size: 0.8rem; color: var(--bds-color-text-secondary); }
  dd { margin: 0.2rem 0 0; font-weight: var(--bds-font-weight-medium); overflow-wrap: anywhere; }
`;

const Section = styled.section`
  margin-top: 1.25rem;
  h3 {
    margin: 0 0 0.35rem;
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--bds-color-text-secondary);
  }
  p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

const Side = styled.aside`
  background: var(--bds-color-surface-subdued);
  border-radius: 8px;
  padding: 1.1rem;
`;

const Timeline = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  li { border-left: 2px solid var(--bds-color-border-default); padding: 0 0 0.8rem 0.8rem; }
  small { color: var(--bds-color-text-secondary); }
  p { margin: 0.15rem 0 0; font-size: 0.9rem; white-space: pre-wrap; }
  li.comment p {
    background: var(--bds-color-surface-default);
    border: 1px solid var(--bds-color-border-subdued);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
  }
`;

const Transcript = styled.ol`
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  li { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.9rem; }
`;

function describe(h) {
  if (h.type === 'status') return h.from ? `moved ${h.from} → ${h.to}` : 'submitted the request';
  if (h.type === 'mock') return `asked for a new concept mock (${h.to})`;
  return `set ${h.type === 'jiraKey' ? 'Jira key' : h.type} to "${h.to || '(none)'}"`;
}

function TextSection({ title, text }) {
  if (!text) return null;
  return <Section><h3>{title}</h3><p>{text}</p></Section>;
}

/** Request detail and triage actions, in a Backyard modal. */
export function RequestDetail({ id, actor, onClose, onChanged }) {
  const [r, setR] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ status: '', assignee: '', jiraKey: '', note: '' });
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset(record) {
    setR(record);
    setForm({ status: record.status, assignee: record.assignee, jiraKey: record.jiraKey, note: '' });
  }

  useEffect(() => {
    let live = true;
    setR(null);
    api(`/api/requests/${encodeURIComponent(id)}`)
      .then((record) => live && reset(record))
      .catch((e) => live && setLoadError(e.message));
    return () => { live = false; };
  }, [id]);

  const noteRequired = r && form.status !== r.status && ['Rejected', 'Needs Info'].includes(form.status);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api(`/api/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, jiraKey: form.jiraKey.trim().toUpperCase(), actor: actor || undefined }),
      });
      reset(updated);
      setSaved(true);
      onChanged();
    } catch (err) {
      setSaveError(err.fields ? Object.values(err.fields).join(' ') : err.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => { setSaved(false); setForm((f) => ({ ...f, [key]: e.target.value })); };

  let content;
  if (loadError) content = <Alert type="error" title="Could not load this request" noClose>{loadError}</Alert>;
  else if (!r) content = <Spinner show inline />;
  else {
    const events = [
      ...r.history.map((h) => ({ at: h.at, who: h.actor, text: describe(h) })),
      ...r.comments.map((c) => ({ at: c.at, who: c.author, text: c.text, comment: true })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    content = (
      <Grid>
        <div>
          <Facts>
            <div><dt>Status</dt><dd><StatusBadge status={r.status} /></dd></div>
            <div><dt>Priority</dt><dd><PriorityBadge band={r.priorityBand} score={r.priorityScore} /></dd></div>
            <div><dt>Requester</dt><dd>{r.requesterName}<br /><small>{r.requesterEmail}</small></dd></div>
            <div><dt>Department</dt><dd>{r.department}</dd></div>
            <div><dt>Category</dt><dd>{r.category}</dd></div>
            <div><dt>Systems</dt><dd>{r.affectedSystems.join(', ')}</dd></div>
            <div><dt>People affected</dt><dd>{r.usersAffected}</dd></div>
            <div><dt>$ impact</dt><dd>{r.revenueImpact}</dd></div>
            <div><dt>Urgency</dt><dd>{r.urgency}</dd></div>
            <div><dt>Needed by</dt><dd>{r.targetDate ? fmtDate(r.targetDate) : '—'}</dd></div>
            <div><dt>Regulatory</dt><dd>{r.regulatory ? 'Yes' : 'No'}</dd></div>
            <div><dt>Jira</dt><dd>{r.jiraKey || '—'}</dd></div>
          </Facts>
          <ConceptMock id={r.id} actor={actor || undefined} />
          <TextSection title="Problem" text={r.problem} />
          <TextSection title="Proposed solution" text={r.proposedSolution} />
          <TextSection title="Business value" text={r.businessValue} />
          <TextSection title="Success metrics" text={r.successMetrics} />
          <TextSection title="Why critical" text={r.urgencyReason} />
          {r.intake?.transcript && (
            <Section>
              <details>
                <summary>Intake conversation ({r.intake.transcript.length} messages)</summary>
                <Transcript>
                  {r.intake.transcript.map((m, i) => (
                    <li key={i}><strong>{m.role === 'user' ? r.requesterName : 'Intake assistant'}:</strong> {m.content}</li>
                  ))}
                </Transcript>
              </details>
            </Section>
          )}
        </div>

        <Side>
          <form onSubmit={save} noValidate>
            <Stack $gap="1rem">
              <Select id="t-status" label="Status" value={form.status} onChange={set('status')}>
                {[r.status, ...TRANSITIONS[r.status]].map((s) => <Option key={s} value={s}>{s}</Option>)}
              </Select>
              <TextField id="t-assignee" label="Assignee" value={form.assignee} maxLength={80} onChange={set('assignee')} />
              <TextField id="t-jira" label="Jira key, e.g. FEAT-123" value={form.jiraKey} maxLength={20} onChange={set('jiraKey')} />
              <TextArea
                id="t-note"
                label={noteRequired ? 'Note (required)' : 'Note (optional)'}
                rows={3}
                max={2000}
                value={form.note}
                state={saveError && noteRequired && !form.note.trim() ? 'error' : 'default'}
                onChange={set('note')}
              />
              {saveError && <Alert type="error" title="Not saved" noClose multiline>{saveError}</Alert>}
              {saved && <Alert type="success" title="Changes saved" autoCloseAfter={4000} onClose={() => setSaved(false)} />}
              <Button type="submit" variant="primary" fullWidth disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </Stack>
          </form>
          <Section>
            <h3>Activity</h3>
            <Timeline>
              {events.map((ev, i) => (
                <li key={i} className={ev.comment ? 'comment' : ''}>
                  <small>{fmtDate(ev.at, true)} · {ev.who}</small>
                  <p>{ev.text}</p>
                </li>
              ))}
            </Timeline>
          </Section>
        </Side>
      </Grid>
    );
  }

  return (
    <ModalController
      open
      onClose={onClose}
      modal={
        <Modal size="jumbo">
          <ModalHeader>{r ? `${r.id} · ${r.title}` : id}</ModalHeader>
          <ModalBody>{content}</ModalBody>
        </Modal>
      }
    />
  );
}
