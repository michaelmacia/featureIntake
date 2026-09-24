import React, { useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import {
  Alert, Badge, Button, Checkbox, Chip, FormControlLabel, Link, Option, Select, TextArea, TextField,
} from '@lowes-tech/bds-react';
import { ENUMS } from '@shared/rules.js';
import { fmtDate } from '../api.js';
import { PriorityBadge } from './Badges.jsx';

// Order and presentation of the draft fields the assistant helps fill.
export const DRAFT_FIELDS = [
  { field: 'title', label: 'Title', type: 'text', max: 120 },
  { field: 'problem', label: 'Problem', type: 'area', max: 4000 },
  { field: 'businessValue', label: 'Business value', type: 'area', max: 4000 },
  { field: 'category', label: 'Category', type: 'select' },
  { field: 'affectedSystems', label: 'Systems involved', type: 'multi' },
  { field: 'usersAffected', label: 'People affected', type: 'select' },
  { field: 'revenueImpact', label: 'Annual $ impact', type: 'select' },
  { field: 'urgency', label: 'Urgency', type: 'select' },
  { field: 'targetDate', label: 'Needed by', type: 'date', optional: true },
  { field: 'urgencyReason', label: 'Why critical', type: 'area', max: 1000, showIf: (d) => d.urgency === 'Critical' },
  { field: 'successMetrics', label: 'Success metrics', type: 'area', max: 2000, optional: true },
  { field: 'proposedSolution', label: 'Proposed solution', type: 'area', max: 4000, optional: true },
  { field: 'regulatory', label: 'Regulatory or audit driver', type: 'bool', optional: true },
];

const flash = keyframes`
  from { background: var(--bds-color-surface-blue-subdued); }
  to { background: transparent; }
`;

const Panel = styled.aside`
  background: var(--bds-color-surface-default);
  border: 1px solid var(--bds-color-border-subdued);
  border-radius: 8px;
  box-shadow: var(--bds-shadows-shadow-01);
  padding: 1.25rem;
  h2 { margin: 0; font-size: 1.25rem; }
  h3 { margin: 1.25rem 0 0.5rem; font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--bds-color-text-secondary); }
`;

const Progress = styled.div`
  margin: 0.75rem 0 1rem;
  font-size: 0.85rem;
  color: var(--bds-color-text-secondary);
  > div { height: 6px; border-radius: 3px; background: var(--bds-color-surface-subdued); margin-top: 0.4rem; overflow: hidden; }
  > div > span { display: block; height: 100%; background: var(--bds-color-surface-blue); transition: width 0.4s ease; }
`;

const FieldRow = styled.div`
  padding: 0.6rem 0.5rem;
  margin: 0 -0.5rem;
  border-bottom: 1px solid var(--bds-color-border-subdued);
  border-radius: 6px;
  ${({ $flash }) => $flash && css`animation: ${flash} 2.5s ease-out;`}
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const RowHead = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--bds-color-text-secondary);
  > :last-child { margin-left: auto; }
`;

const Value = styled.div`
  margin-top: 0.2rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: ${({ $empty }) => ($empty ? 'var(--bds-color-text-tertiary)' : 'var(--bds-color-text-primary)')};
  font-style: ${({ $empty }) => ($empty ? 'italic' : 'normal')};
`;

const Editor = styled.div`
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  > div:last-child { display: flex; justify-content: flex-end; }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

function display(def, value) {
  if (def.type === 'multi') return value.join(', ');
  if (def.type === 'bool') return value ? 'Yes' : 'No';
  if (def.type === 'date') return value ? fmtDate(value) : '';
  return value;
}

function FieldEditor({ def, value, onChange }) {
  const id = `draft-${def.field}`;
  if (def.type === 'select') {
    return (
      <Select id={id} label={def.label} value={value} onChange={(e) => onChange(e.target.value)}>
        {[<Option key="" value="" hidden />, ...ENUMS[def.field].map((o) => <Option key={o} value={o}>{o}</Option>)]}
      </Select>
    );
  }
  if (def.type === 'multi') {
    return (
      <Chips role="group" aria-label={def.label}>
        {ENUMS.affectedSystems.map((sys, i) => (
          <Chip key={sys} id={`${id}-${i}`} variant="filter" label={sys} value={sys} name={id} checked={value.includes(sys)}
            onChange={(e) => onChange(e.target.checked ? [...value, sys] : value.filter((s) => s !== sys))} />
        ))}
      </Chips>
    );
  }
  if (def.type === 'bool') {
    return (
      <FormControlLabel label="Driven by a legal, regulatory or audit requirement"
        control={<Checkbox id={id} checked={value} onChange={(e, checked) => onChange(checked)} />} />
    );
  }
  if (def.type === 'area') {
    return <TextArea id={id} label={def.label} rows={4} max={def.max} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <TextField id={id} label={def.label} type={def.type === 'date' ? 'date' : 'text'} maxLength={def.max}
      value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

/**
 * The live, structured request built from the conversation. Every field is editable; the
 * requester's edits are sent back to the assistant on the next turn.
 */
export function DraftPanel({
  draft, identity, errors, updated, estimate, onFieldChange, onIdentityChange, onSubmit, submitting, submitError,
}) {
  const [editing, setEditing] = useState(null);
  const visible = DRAFT_FIELDS.filter((d) => !d.showIf || d.showIf(draft));
  const required = visible.filter((d) => !d.optional || errors[d.field]);
  const done = required.filter((d) => !errors[d.field]).length;
  const contentReady = visible.every((d) => !errors[d.field]);
  const identityErrors = ['requesterName', 'requesterEmail', 'department'].filter((f) => errors[f]);

  return (
    <Panel aria-label="Your request">
      <h2>Your request</h2>
      <Progress aria-live="polite">
        {done} of {required.length} required details
        <div><span style={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} /></div>
      </Progress>

      {visible.map((def) => {
        const value = draft[def.field];
        const text = display(def, value);
        const missing = errors[def.field];
        const isEditing = editing === def.field;
        return (
          <FieldRow key={def.field} $flash={updated.has(def.field)} data-field={def.field}>
            <RowHead>
              <span>{def.label}</span>
              {missing && !def.optional && <Badge color="gold" variant="outlined">Needed</Badge>}
              {!missing && text && <Badge color="green" variant="outlined">✓</Badge>}
              {!isEditing && (
                <Link size="small" onClick={() => setEditing(def.field)} aria-label={`Edit ${def.label}`}>Edit</Link>
              )}
            </RowHead>
            {isEditing ? (
              <Editor>
                <FieldEditor def={def} value={value} onChange={(v) => onFieldChange(def.field, v)} />
                {missing && <small style={{ color: 'var(--bds-color-text-red)' }}>{missing}</small>}
                <div><Button size="small" variant="secondary" onClick={() => setEditing(null)}>Done</Button></div>
              </Editor>
            ) : (
              <Value $empty={!text}>{text || (def.optional ? 'Optional' : 'Not yet')}</Value>
            )}
          </FieldRow>
        );
      })}

      {estimate && (
        <p style={{ fontSize: '0.9rem', color: 'var(--bds-color-text-secondary)' }}>
          Initial priority <PriorityBadge band={estimate.band} score={estimate.score} />
        </p>
      )}

      <h3>About you</h3>
      <Stack>
        <TextField id="requesterName" label="Your name" autoComplete="name" maxLength={100} value={identity.requesterName}
          onChange={(e) => onIdentityChange('requesterName', e.target.value)} />
        <TextField id="requesterEmail" label="Work email" type="email" autoComplete="email" maxLength={254} value={identity.requesterEmail}
          onChange={(e) => onIdentityChange('requesterEmail', e.target.value)} />
        <Select id="department" label="Department" value={identity.department} onChange={(e) => onIdentityChange('department', e.target.value)}>
          {[<Option key="" value="" hidden />, ...ENUMS.department.map((d) => <Option key={d} value={d}>{d}</Option>)]}
        </Select>
      </Stack>

      {submitError && <div style={{ marginTop: '1rem' }}><Alert type="error" title="Not submitted" noClose multiline>{submitError}</Alert></div>}

      <div style={{ marginTop: '1.25rem' }}>
        <Button variant="primary" fullWidth disabled={submitting || !contentReady || identityErrors.length > 0} onClick={onSubmit}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
        {!contentReady && <p style={{ fontSize: '0.8rem', color: 'var(--bds-color-text-secondary)', margin: '0.5rem 0 0' }}>Keep chatting, or fill the fields marked Needed.</p>}
        {contentReady && identityErrors.length > 0 && <p style={{ fontSize: '0.8rem', color: 'var(--bds-color-text-secondary)', margin: '0.5rem 0 0' }}>Add your name, work email and department to submit.</p>}
      </div>
    </Panel>
  );
}
