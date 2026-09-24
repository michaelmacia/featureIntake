import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import styled from 'styled-components';
import {
  Alert, Button, Checkbox, Chip, FormControlLabel, Link, Option, ProgressStep, ProgressStepper,
  Select, TextArea, TextField,
} from '@lowes-tech/bds-react';
import { ENUMS, computePriority, validateRequest } from '@shared/rules.js';
import { api, fmtDate, readLocal, writeLocal } from '../api.js';
import { PriorityBadge } from '../components/Badges.jsx';
import { Actions, Card, FieldError, Lede, Page, Row, Stack } from '../components/Layout.jsx';
import { SubmittedView } from '../components/SubmittedView.jsx';
import { useFeatures } from '../useMeta.js';

const DRAFT_KEY = 'featureIntake.draft.v1';

const STEPS = [
  { title: 'About you', fields: ['requesterName', 'requesterEmail', 'department'] },
  { title: 'The request', fields: ['title', 'category', 'problem', 'proposedSolution', 'affectedSystems'] },
  { title: 'Impact & urgency', fields: ['businessValue', 'successMetrics', 'usersAffected', 'revenueImpact', 'urgency', 'targetDate', 'urgencyReason', 'regulatory'] },
  { title: 'Review', fields: [] },
];

const LABELS = {
  requesterName: 'Name', requesterEmail: 'Email', department: 'Department', title: 'Title', category: 'Category',
  problem: 'Problem', proposedSolution: 'Proposed solution', affectedSystems: 'Systems', businessValue: 'Business value',
  successMetrics: 'Success metrics', usersAffected: 'People affected', revenueImpact: '$ impact', urgency: 'Urgency',
  targetDate: 'Needed by', urgencyReason: 'Why critical', regulatory: 'Regulatory driver',
};

const EMPTY = {
  requesterName: '', requesterEmail: '', department: '', title: '', category: '', problem: '', proposedSolution: '',
  affectedSystems: [], businessValue: '', successMetrics: '', usersAffected: '', revenueImpact: '', urgency: '',
  targetDate: '', urgencyReason: '', regulatory: false,
};

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const GroupLabel = styled.span`
  display: block;
  font-weight: var(--bds-font-weight-medium);
  margin-bottom: 0.5rem;
`;

const Counter = styled.p`
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--bds-color-text-secondary);
`;

const ScoreBox = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 8px;
  background: var(--bds-color-surface-subdued);
  color: var(--bds-color-text-secondary);
  font-size: 0.9rem;
`;

const ReviewList = styled.dl`
  margin: 0;
  > div {
    display: grid;
    grid-template-columns: 11rem 1fr auto;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--bds-color-border-subdued);
    @media (max-width: 600px) { grid-template-columns: 1fr auto; dt { grid-column: 1 / -1; } }
  }
  dt { color: var(--bds-color-text-secondary); }
  dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

const StepperWrap = styled.div`
  margin-bottom: 1.5rem;
  overflow-x: auto;
`;

function loadDraft() {
  const saved = readLocal(DRAFT_KEY, null);
  return saved ? { ...EMPTY, ...saved } : null;
}

export default function IntakePage() {
  const [initialDraft] = useState(loadDraft);
  const [data, setData] = useState(initialDraft || EMPTY);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(() => new Set());
  const [serverErrors, setServerErrors] = useState({});
  const [summary, setSummary] = useState(null); // { title, items: [[field, message]] }
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [draftNote, setDraftNote] = useState(initialDraft ? 'Restored your draft' : '');
  const dirty = useRef(false);
  const summaryRef = useRef(null);
  const today = new Date().toISOString().slice(0, 10);
  const features = useFeatures();

  useEffect(() => { document.title = 'Submit a feature request · Feature Intake'; }, []);

  const errors = useMemo(() => validateRequest(data).errors, [data]);
  const shownError = (f) => (touched.has(f) ? errors[f] || serverErrors[f] : serverErrors[f]);
  const critical = data.urgency === 'Critical';
  const estimate = data.usersAffected && data.revenueImpact && data.urgency ? computePriority(data) : null;

  // Autosave the draft on this device, 400 ms after the last edit.
  useEffect(() => {
    if (!dirty.current || created) return undefined;
    const t = setTimeout(() => { if (writeLocal(DRAFT_KEY, data)) setDraftNote('Draft saved on this device'); }, 400);
    return () => clearTimeout(t);
  }, [data, created]);

  useEffect(() => { if (summary) summaryRef.current?.focus(); }, [summary]);

  function update(field, value) {
    dirty.current = true;
    setData((d) => ({ ...d, [field]: value }));
    setServerErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }
  const touch = (...fields) => setTouched((t) => new Set([...t, ...fields]));

  function errorsFor(stepIndex) {
    return Object.fromEntries(Object.entries(errors).filter(([k]) => STEPS[stepIndex].fields.includes(k)));
  }

  function go(i) {
    setStep(i);
    setSummary(null);
    window.scrollTo({ top: 0 });
  }

  function next() {
    touch(...STEPS[step].fields);
    const errs = errorsFor(step);
    if (Object.keys(errs).length) {
      setSummary({ title: `Please fix ${Object.keys(errs).length === 1 ? '1 issue' : `${Object.keys(errs).length} issues`}`, items: Object.entries(errs) });
      return;
    }
    go(step + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    const firstBad = STEPS.findIndex((s) => s.fields.some((f) => errors[f]));
    if (firstBad !== -1) {
      go(firstBad);
      touch(...STEPS[firstBad].fields);
      const errs = errorsFor(firstBad);
      setSummary({ title: 'Please fix these before submitting', items: Object.entries(errs) });
      return;
    }
    setSubmitting(true);
    try {
      const record = await api('/api/requests', { method: 'POST', body: JSON.stringify(data) });
      writeLocal(DRAFT_KEY, undefined);
      setCreated(record);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setServerErrors(err.fields || {});
      setSummary({ title: err.message, items: Object.entries(err.fields || {}) });
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    dirty.current = false;
    setData(EMPTY);
    setTouched(new Set());
    setServerErrors({});
    setSummary(null);
    setCreated(null);
    setDraftNote('');
    setStep(0);
  }

  function focusField(field) {
    const id = field === 'affectedSystems' ? 'sys-0' : field;
    document.getElementById(id)?.focus();
  }

  // ---- field helpers (Backyard components wired to shared validation) ----
  const described = (f) => (shownError(f) ? { 'aria-invalid': true, 'aria-describedby': `${f}-error` } : {});

  const text = (f, label, { optional, type = 'text', maxLength, autoComplete, placeholder, min } = {}) => (
    <div>
      <TextField
        id={f}
        label={label}
        type={type}
        value={data[f]}
        state={shownError(f) ? 'error' : 'default'}
        maxLength={maxLength}
        min={min}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => update(f, e.target.value)}
        onBlur={() => touch(f)}
        {...described(f)}
      />
      {optional && <Counter>Optional</Counter>}
      <FieldError id={`${f}-error`} message={shownError(f)} />
    </div>
  );

  const area = (f, label, { optional, rows = 4, max = 4000, min } = {}) => (
    <div>
      <TextArea
        id={f}
        label={label}
        rows={rows}
        max={max}
        value={data[f]}
        state={shownError(f) ? 'error' : 'default'}
        onChange={(e) => update(f, e.target.value)}
        onBlur={() => touch(f)}
        {...described(f)}
      />
      {/* Backyard's TextArea shows its own "n / max" counter; add only the rule it doesn't know about. */}
      {(min || optional) && <Counter>{min ? `At least ${min} characters` : 'Optional'}</Counter>}
      <FieldError id={`${f}-error`} message={shownError(f)} />
    </div>
  );

  const select = (f, label) => (
    <div>
      <Select
        id={f}
        label={label}
        value={data[f]}
        state={shownError(f) ? 'error' : 'default'}
        onChange={(e) => { update(f, e.target.value); touch(f); }}
        {...described(f)}
      >
        {[<Option key="" value="" hidden />, ...ENUMS[f].map((o) => <Option key={o} value={o}>{o}</Option>)]}
      </Select>
      <FieldError id={`${f}-error`} message={shownError(f)} />
    </div>
  );

  if (created) return <SubmittedView record={created} onStartOver={startOver} />;

  // ---- wizard ----
  return (
    <Page $narrow>
      <h1>Submit a feature request</h1>
      <Lede>
        Tell us what's slowing your team down. Product triage reviews every request within 5 business days.
        {features?.assistant && <> <RouterLink to="/">Prefer to describe it in your own words?</RouterLink></>}
      </Lede>

      <StepperWrap>
        <ProgressStepper step={step} size="small" direction="row">
          {STEPS.map((s, i) => (
            <ProgressStep key={s.title} title={s.title} onClick={i < step ? () => go(i) : undefined} />
          ))}
        </ProgressStepper>
      </StepperWrap>

      <Card as="form" noValidate onSubmit={handleSubmit}>
        {summary && (
          <div ref={summaryRef} tabIndex={-1} style={{ marginBottom: '1.25rem', outline: 'none' }}>
            <Alert type="error" title={summary.title} noClose multiline>
              {summary.items.length > 0 && (
                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem' }}>
                  {summary.items.map(([f, msg]) => (
                    <li key={f}><Link onClick={() => focusField(f)}>{`${LABELS[f] || f}: ${msg}`}</Link></li>
                  ))}
                </ul>
              )}
            </Alert>
          </div>
        )}

        {step === 0 && (
          <Stack>
            <h2>About you</h2>
            <Row>
              {text('requesterName', 'Your name', { maxLength: 100, autoComplete: 'name' })}
              {text('requesterEmail', 'Work email', { type: 'email', maxLength: 254, autoComplete: 'email' })}
            </Row>
            {select('department', 'Department')}
          </Stack>
        )}

        {step === 1 && (
          <Stack>
            <h2>The request</h2>
            {text('title', 'Request title', { maxLength: 120, placeholder: 'e.g. Auto-sync closed deals to invoicing' })}
            {select('category', 'Category')}
            {area('problem', 'What problem are you trying to solve?', { rows: 5, min: 20 })}
            {area('proposedSolution', 'Do you have a solution in mind?', { rows: 3, optional: true })}
            <div role="group" aria-labelledby="systems-label" {...described('affectedSystems')}>
              <GroupLabel id="systems-label">Which systems are involved?</GroupLabel>
              <Chips>
                {ENUMS.affectedSystems.map((sys, i) => (
                  <Chip
                    key={sys}
                    id={`sys-${i}`}
                    variant="filter"
                    name="affectedSystems"
                    value={sys}
                    label={sys}
                    checked={data.affectedSystems.includes(sys)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      update('affectedSystems', on ? [...data.affectedSystems, sys] : data.affectedSystems.filter((s) => s !== sys));
                      touch('affectedSystems');
                    }}
                  />
                ))}
              </Chips>
              <FieldError id="affectedSystems-error" message={shownError('affectedSystems')} />
            </div>
          </Stack>
        )}

        {step === 2 && (
          <Stack>
            <h2>Impact &amp; urgency</h2>
            {area('businessValue', "What's the business value?", { min: 20 })}
            {area('successMetrics', 'How will we know it worked?', { rows: 2, max: 2000, optional: true })}
            <Row>
              {select('usersAffected', 'How many people are affected?')}
              {select('revenueImpact', 'Estimated annual $ impact')}
            </Row>
            <Row>
              {select('urgency', 'Urgency')}
              {text('targetDate', critical ? 'Needed by (required for Critical)' : 'Needed by', { type: 'date', min: today, optional: !critical })}
            </Row>
            {critical && area('urgencyReason', 'Why is this critical?', { rows: 2, max: 1000, min: 10 })}
            <FormControlLabel
              label="This is driven by a legal, regulatory or audit requirement"
              control={<Checkbox id="regulatory" checked={data.regulatory} onChange={(e, checked) => update('regulatory', checked)} />}
            />
            {estimate && (
              <ScoreBox aria-live="polite">
                Initial priority estimate <PriorityBadge band={estimate.band} score={estimate.score} /> Triage may adjust this.
              </ScoreBox>
            )}
          </Stack>
        )}

        {step === 3 && (
          <Stack>
            <h2>Review &amp; submit</h2>
            <ReviewList>
              {Object.entries(LABELS).map(([f, label]) => {
                let v = data[f];
                if (f === 'regulatory') v = v ? 'Yes' : 'No';
                else if (f === 'affectedSystems') v = v.join(', ');
                else if (f === 'targetDate') v = v ? fmtDate(v) : '';
                if (!v) return null;
                const stepIndex = STEPS.findIndex((s) => s.fields.includes(f));
                return (
                  <div key={f}>
                    <dt>{label}</dt>
                    <dd>{v}</dd>
                    <Link onClick={() => go(stepIndex)} aria-label={`Edit ${label}`} size="small">Edit</Link>
                  </div>
                );
              })}
            </ReviewList>
            {estimate && (
              <ScoreBox>Initial priority <PriorityBadge band={estimate.band} score={estimate.score} /></ScoreBox>
            )}
          </Stack>
        )}

        <Actions>
          {step > 0 && <Button type="button" variant="secondary" onClick={() => go(step - 1)}>Back</Button>}
          <span className="spacer" aria-live="polite">{draftNote}</span>
          <Button type="submit" variant="primary" disabled={submitting}>
            {step < STEPS.length - 1 ? 'Continue' : submitting ? 'Submitting…' : 'Submit request'}
          </Button>
        </Actions>
      </Card>
    </Page>
  );
}
