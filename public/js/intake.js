/* Intake wizard: step navigation, per-step validation, draft autosave, submit. */
(function () {
  'use strict';
  const { ENUMS, validateRequest, computePriority } = window.IntakeRules;
  const { api, el, fillSelect, fmtDate } = window.App;

  const DRAFT_KEY = 'featureIntake.draft.v1';
  const STEP_FIELDS = [
    ['requesterName', 'requesterEmail', 'department'],
    ['title', 'category', 'problem', 'proposedSolution', 'affectedSystems'],
    ['businessValue', 'successMetrics', 'usersAffected', 'revenueImpact', 'urgency', 'targetDate', 'urgencyReason', 'regulatory'],
    [],
  ];
  const LABELS = {
    requesterName: 'Name', requesterEmail: 'Email', department: 'Department', title: 'Title', category: 'Category',
    problem: 'Problem', proposedSolution: 'Proposed solution', affectedSystems: 'Systems', businessValue: 'Business value',
    successMetrics: 'Success metrics', usersAffected: 'People affected', revenueImpact: '$ impact', urgency: 'Urgency',
    targetDate: 'Needed by', urgencyReason: 'Why critical', regulatory: 'Regulatory driver',
  };

  const form = document.getElementById('intake');
  const steps = [...form.querySelectorAll('.step')];
  const stepperItems = [...document.querySelectorAll('#stepper li')];
  const btnNext = document.getElementById('next');
  const btnBack = document.getElementById('back');
  const btnSubmit = document.getElementById('submit');
  const summary = document.getElementById('error-summary');
  let current = 0;
  const touched = new Set();

  // ---- build dynamic controls ----
  form.querySelectorAll('select[data-enum]').forEach((s) => fillSelect(s, ENUMS[s.dataset.enum]));
  const chipBox = document.getElementById('affectedSystems');
  ENUMS.affectedSystems.forEach((sys, i) => {
    const id = 'sys-' + i;
    chipBox.append(el('span', { class: 'chip' },
      el('input', { type: 'checkbox', id, name: 'affectedSystems', value: sys }),
      el('label', { for: id, text: sys })));
  });
  document.getElementById('targetDate').min = new Date().toISOString().slice(0, 10);

  function readForm() {
    const fd = new FormData(form);
    const data = {};
    for (const key of Object.keys(LABELS)) data[key] = fd.get(key) ?? '';
    data.affectedSystems = fd.getAll('affectedSystems');
    data.regulatory = form.regulatory.checked;
    return data;
  }

  function writeForm(data) {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'affectedSystems') form.querySelectorAll('[name=affectedSystems]').forEach((c) => { c.checked = v.includes(c.value); });
      else if (k === 'regulatory') form.regulatory.checked = Boolean(v);
      else if (form.elements[k]) form.elements[k].value = v;
    }
  }

  // ---- validation display ----
  function setFieldError(name, msg) {
    const control = name === 'affectedSystems' ? chipBox : form.elements[name];
    if (!control) return;
    const field = control.closest('.field');
    field.classList.toggle('invalid', Boolean(msg));
    let p = field.querySelector('.error');
    if (msg) {
      if (!p) { p = el('p', { class: 'error', id: name + '-error' }); field.append(p); }
      p.textContent = msg;
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', name + '-error');
    } else {
      p?.remove();
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
    }
  }

  function stepErrors(stepIdx, all) {
    const { errors } = validateRequest(readForm());
    const fields = all ? Object.keys(LABELS) : STEP_FIELDS[stepIdx];
    return Object.fromEntries(Object.entries(errors).filter(([k]) => fields.includes(k)));
  }

  function showErrors(errors) {
    for (const f of STEP_FIELDS[current]) setFieldError(f, errors[f]);
    const entries = Object.entries(errors);
    summary.hidden = entries.length === 0;
    if (entries.length) {
      summary.replaceChildren(el('strong', { text: `Please fix ${entries.length} ${entries.length === 1 ? 'issue' : 'issues'}:` }),
        el('ul', {}, entries.map(([f, m]) => el('li', {}, el('a', { href: '#' + (f === 'affectedSystems' ? 'sys-0' : f), text: `${LABELS[f] || f}: ${m}` })))));
      summary.focus();
    }
  }

  // ---- step navigation ----
  function go(idx) {
    current = idx;
    steps.forEach((s, i) => { s.hidden = i !== idx; });
    stepperItems.forEach((li, i) => {
      li.classList.toggle('active', i === idx);
      li.classList.toggle('complete', i < idx);
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    btnBack.hidden = idx === 0;
    btnNext.hidden = idx === steps.length - 1;
    btnSubmit.hidden = idx !== steps.length - 1;
    summary.hidden = true;
    if (idx === 3) renderReview();
    steps[idx].querySelector('input, select, textarea, dl')?.focus?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  btnNext.addEventListener('click', () => {
    const errs = stepErrors(current);
    STEP_FIELDS[current].forEach((f) => touched.add(f));
    if (Object.keys(errs).length) return showErrors(errs);
    go(current + 1);
  });
  btnBack.addEventListener('click', () => go(current - 1));

  function renderReview() {
    const data = readForm();
    const review = document.getElementById('review');
    review.replaceChildren();
    for (const [k, label] of Object.entries(LABELS)) {
      let v = data[k];
      if (k === 'regulatory') v = v ? 'Yes' : 'No';
      else if (k === 'affectedSystems') v = v.join(', ');
      else if (k === 'targetDate') v = v ? fmtDate(v) : '';
      if (!v) continue;
      const stepIdx = STEP_FIELDS.findIndex((s) => s.includes(k));
      review.append(el('div', { class: 'review-row' },
        el('dt', { text: label }),
        el('dd', {}, el('span', { class: 'pre', text: v }), ' ',
          el('button', { type: 'button', class: 'link', text: 'Edit', 'aria-label': `Edit ${label}`, onclick: () => go(stepIdx) }))));
    }
    const { score, band } = computePriority(data);
    review.append(el('div', { class: 'review-row' }, el('dt', { text: 'Initial priority' }),
      el('dd', {}, el('span', { class: 'band band-' + band, text: band }), ` score ${score}/100`)));
  }

  // ---- live feedback ----
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (touched.has(name)) setFieldError(name, stepErrors(current)[name]);
    const counter = document.querySelector(`[data-count-for="${name}"]`);
    if (counter) counter.textContent = e.target.value.length;
    syncConditional();
    saveDraft();
  });
  form.addEventListener('focusout', (e) => {
    const name = e.target.name;
    if (!name || !STEP_FIELDS[current].includes(name)) return;
    touched.add(name);
    setFieldError(name, stepErrors(current)[name]);
  });
  form.addEventListener('change', () => { syncConditional(); saveDraft(); });

  function syncConditional() {
    const data = readForm();
    const critical = data.urgency === 'Critical';
    document.getElementById('urgencyReason-field').hidden = !critical;
    document.getElementById('targetDate-opt').textContent = critical ? 'Required' : 'Optional';
    const preview = document.getElementById('score-preview');
    if (data.usersAffected && data.revenueImpact && data.urgency) {
      const { score, band } = computePriority(data);
      preview.replaceChildren('Initial priority estimate: ', el('span', { class: 'band band-' + band, text: band }), ` (${score}/100). Triage may adjust this.`);
    } else preview.textContent = '';
  }

  // ---- drafts ----
  let draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(readForm()));
        document.getElementById('draft-note').textContent = 'Draft saved on this device';
      } catch { /* storage unavailable: drafts are a convenience only */ }
    }, 400);
  }
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (saved) { writeForm(saved); document.getElementById('draft-note').textContent = 'Restored your draft'; }
  } catch { /* ignore */ }
  syncConditional();
  ['problem', 'businessValue'].forEach((n) => {
    document.querySelector(`[data-count-for="${n}"]`).textContent = form.elements[n].value.length;
  });

  // ---- submit ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const all = stepErrors(0, true);
    if (Object.keys(all).length) {
      const first = STEP_FIELDS.findIndex((s) => s.some((f) => all[f]));
      go(first);
      STEP_FIELDS[first].forEach((f) => touched.add(f));
      return showErrors(stepErrors(first));
    }
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting…';
    try {
      const created = await api('/api/requests', { method: 'POST', body: JSON.stringify(readForm()) });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      document.getElementById('done-id').textContent = created.id;
      document.getElementById('done-band').textContent = created.priorityBand;
      document.getElementById('done-link').href = '/requests#' + encodeURIComponent(created.id);
      document.getElementById('form-view').hidden = true;
      const done = document.getElementById('done-view');
      done.hidden = false;
      done.focus();
    } catch (err) {
      summary.hidden = false;
      summary.replaceChildren(el('strong', { text: err.message }),
        err.fields ? el('ul', {}, Object.entries(err.fields).map(([f, m]) => el('li', { text: `${LABELS[f] || f}: ${m}` }))) : '');
      summary.focus();
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit request';
    }
  });

  document.getElementById('another').addEventListener('click', () => {
    form.reset();
    touched.clear();
    syncConditional();
    document.getElementById('done-view').hidden = true;
    document.getElementById('form-view').hidden = false;
    go(0);
  });
})();
