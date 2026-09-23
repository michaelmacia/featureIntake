/* Triage board: KPIs, filtering, sorting, detail dialog with workflow actions. */
(function () {
  'use strict';
  const { ENUMS, TRANSITIONS } = window.IntakeRules;
  const { api, el, fillSelect, fmtDate, statusClass } = window.App;

  const $ = (id) => document.getElementById(id);
  const state = { sort: '-createdAt', items: [], openId: null };
  const ACTOR_KEY = 'featureIntake.actor';

  fillSelect($('f-status'), ['open', ...ENUMS.status], 'All statuses');
  $('f-status').options[1].textContent = 'All open';
  fillSelect($('f-department'), ENUMS.department, 'All departments');
  try { $('actor').value = localStorage.getItem(ACTOR_KEY) || ''; } catch { /* ignore */ }
  $('actor').addEventListener('change', () => { try { localStorage.setItem(ACTOR_KEY, $('actor').value); } catch { /* ignore */ } });

  function query() {
    const p = new URLSearchParams();
    const add = (k, v) => { if (v) p.set(k, v); };
    add('q', $('q').value.trim());
    add('status', $('f-status').value);
    add('department', $('f-department').value);
    add('priority', $('f-priority').value);
    add('sort', state.sort);
    return p.toString();
  }

  async function load() {
    const qs = query();
    const [list, stats] = await Promise.all([api('/api/requests?' + qs), api('/api/stats')]);
    state.items = list.items;
    $('export').href = '/api/requests/export.csv?' + qs;
    renderKpis(stats);
    renderRows();
  }

  function renderKpis(s) {
    const tile = (label, value, sub) => el('div', { class: 'kpi' }, el('span', { class: 'kpi-label', text: label }),
      el('span', { class: 'kpi-value', text: String(value) }), sub ? el('span', { class: 'kpi-sub', text: sub }) : null);
    $('kpis').replaceChildren(
      tile('Open requests', s.open, `${s.total} total`),
      tile('Awaiting triage', s.byStatus['Submitted'], 'status Submitted'),
      tile('Needs info', s.byStatus['Needs Info'], 'waiting on requester'),
      tile('Open P1', s.openByPriority.P1, `${s.openByPriority.P2} open P2`),
    );
  }

  function renderRows() {
    $('rows').replaceChildren(...state.items.map((r) => el('tr', { tabindex: '0', 'data-id': r.id,
      onclick: () => openDetail(r.id), onkeydown: (e) => { if (e.key === 'Enter') openDetail(r.id); } },
      el('td', {}, el('span', { class: 'mono', text: r.id }), el('br'), el('span', { class: 'muted small', text: fmtDate(r.createdAt) })),
      el('td', {}, el('strong', { text: r.title }), el('br'), el('span', { class: 'muted small', text: `${r.department} · ${r.category} · ${r.requesterName}` })),
      el('td', {}, el('span', { class: 'band band-' + r.priorityBand, text: r.priorityBand }), el('span', { class: 'muted small', text: ' ' + r.priorityScore })),
      el('td', {}, el('span', { class: statusClass(r.status), text: r.status })),
      el('td', { text: r.targetDate ? fmtDate(r.targetDate) : '—' }),
      el('td', { text: r.assignee || '—' }),
    )));
    $('empty').hidden = state.items.length > 0;
    document.querySelectorAll('th .sort').forEach((b) => {
      const key = b.dataset.sort;
      const th = b.closest('th');
      if (state.sort.replace('-', '') === key) th.setAttribute('aria-sort', state.sort.startsWith('-') ? 'descending' : 'ascending');
      else th.removeAttribute('aria-sort');
    });
  }

  // ---- filters & sorting ----
  let t;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  ['f-status', 'f-department', 'f-priority'].forEach((id) => $(id).addEventListener('change', load));
  document.querySelectorAll('th .sort').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    state.sort = state.sort === '-' + key ? key : '-' + key;
    load();
  }));

  // ---- detail dialog ----
  const dlg = $('detail');
  $('d-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { state.openId = null; history.replaceState(null, '', location.pathname); });

  async function openDetail(id) {
    const r = await api('/api/requests/' + encodeURIComponent(id));
    state.openId = id;
    history.replaceState(null, '', '#' + encodeURIComponent(id));
    renderDetail(r);
    if (!dlg.open) dlg.showModal();
  }

  function section(label, text) {
    if (!text) return null;
    return el('section', {}, el('h3', { text: label }), el('p', { class: 'pre', text }));
  }

  function renderDetail(r) {
    $('d-id').textContent = `${r.id} · submitted ${fmtDate(r.createdAt, true)}`;
    $('d-title').textContent = r.title;
    const facts = [
      ['Status', el('span', { class: statusClass(r.status), text: r.status })],
      ['Priority', el('span', {}, el('span', { class: 'band band-' + r.priorityBand, text: r.priorityBand }), ` ${r.priorityScore}/100`)],
      ['Requester', `${r.requesterName} (${r.requesterEmail})`],
      ['Department', r.department],
      ['Category', r.category],
      ['Systems', r.affectedSystems.join(', ')],
      ['People affected', r.usersAffected],
      ['$ impact', r.revenueImpact],
      ['Urgency', r.urgency],
      ['Needed by', r.targetDate ? fmtDate(r.targetDate) : '—'],
      ['Regulatory', r.regulatory ? 'Yes' : 'No'],
      ['Jira', r.jiraKey || '—'],
    ];
    $('d-main').replaceChildren(...[
      el('dl', { class: 'facts' }, facts.map(([k, v]) => el('div', {}, el('dt', { text: k }), el('dd', {}, v)))),
      section('Problem', r.problem),
      section('Proposed solution', r.proposedSolution),
      section('Business value', r.businessValue),
      section('Success metrics', r.successMetrics),
      section('Why critical', r.urgencyReason),
    ].filter(Boolean));

    fillSelect($('t-status'), [r.status, ...TRANSITIONS[r.status]], r.status);
    $('t-status').remove(0); // no blank option: first entry is the current status
    $('t-assignee').value = r.assignee;
    $('t-jira').value = r.jiraKey;
    $('t-note').value = '';
    $('t-error').hidden = true;
    syncNoteRequired();

    const events = [
      ...r.history.map((h) => ({ at: h.at, who: h.actor, text: h.type === 'status'
        ? (h.from ? `moved ${h.from} → ${h.to}` : 'submitted the request')
        : `set ${h.type === 'jiraKey' ? 'Jira key' : h.type} to "${h.to || '(none)'}"` })),
      ...r.comments.map((c) => ({ at: c.at, who: c.author, text: c.text, comment: true })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    $('d-timeline').replaceChildren(...events.map((e) => el('li', { class: e.comment ? 'comment' : '' },
      el('span', { class: 'small muted', text: `${fmtDate(e.at, true)} · ${e.who}` }),
      el('p', { class: 'pre', text: e.text }))));
  }

  function syncNoteRequired() {
    const needs = ['Rejected', 'Needs Info'].includes($('t-status').value) && $('t-status').selectedIndex > 0;
    $('t-note-opt').textContent = needs ? 'Required' : 'Optional';
  }
  $('t-status').addEventListener('change', syncNoteRequired);

  $('triage').addEventListener('submit', async (e) => {
    e.preventDefault();
    const actor = $('actor').value.trim();
    const body = {
      status: $('t-status').value,
      assignee: $('t-assignee').value,
      jiraKey: $('t-jira').value.trim().toUpperCase(),
      note: $('t-note').value,
      actor: actor || undefined,
    };
    try {
      const updated = await api('/api/requests/' + encodeURIComponent(state.openId), {
        method: 'PATCH', body: JSON.stringify(body),
      });
      renderDetail(updated);
      load();
    } catch (err) {
      $('t-error').hidden = false;
      $('t-error').textContent = err.fields ? Object.values(err.fields).join(' ') : err.message;
    }
  });

  load().then(() => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) openDetail(hash).catch(() => {});
  });
})();
