/* Small helpers shared by both pages. */
(function () {
  'use strict';

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error((body && body.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.fields = body && body.fields;
      throw err;
    }
    return body;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  function fillSelect(select, options, placeholder = 'Select…') {
    select.replaceChildren(el('option', { value: '', text: placeholder }), ...options.map((o) => el('option', { value: o, text: o })));
  }

  function fmtDate(iso, withTime) {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString(undefined, withTime
      ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function statusClass(s) {
    return 'status status-' + s.toLowerCase().replace(/\s+/g, '-');
  }

  // Mocks are designed for a desktop viewport; render at that width and scale to fit the panel.
  const MOCK_VIEWPORT = 1200;
  function fitDesktop(wrap, frame) {
    const fit = () => {
      const scale = Math.min(1, (wrap.clientWidth || MOCK_VIEWPORT) / MOCK_VIEWPORT);
      frame.style.width = `${MOCK_VIEWPORT}px`;
      frame.style.height = `${Math.round(wrap.clientHeight / scale)}px`;
      frame.style.transform = `scale(${scale})`;
    };
    new ResizeObserver(fit).observe(wrap);
  }

  /**
   * Shows a request's AI-generated concept mock inside `container`, polling while it is
   * generated and offering regenerate-with-feedback. Returns a function that stops polling.
   * The mock is rendered in a sandboxed iframe (no scripts, no same-origin access).
   */
  function mountMock(container, id, { actor } = {}) {
    const base = '/api/requests/' + encodeURIComponent(id);
    let timer = null;
    let stopped = false;
    let fid = 0;

    async function refresh() {
      if (stopped) return;
      let m;
      try { m = await api(base + '/mock'); } catch (e) { m = { status: 'failed', error: e.message }; }
      if (stopped) return;
      render(m);
      if (m.status === 'pending') timer = setTimeout(refresh, 3000);
    }

    async function regenerate(feedback) {
      render({ status: 'pending' });
      try {
        await api(base + '/mock', { method: 'POST', body: JSON.stringify({ feedback, actor }) });
      } catch (e) {
        render({ status: 'failed', error: e.message });
        return;
      }
      refresh();
    }

    function feedbackForm(label, button) {
      const inputId = `mock-feedback-${id}-${++fid}`;
      const input = el('input', { id: inputId, maxlength: '1000', placeholder: 'e.g. Show it inside the SAP invoice screen, add an approval step' });
      return el('form', { class: 'mock-feedback', onsubmit: (e) => { e.preventDefault(); regenerate(input.value.trim()); } },
        el('label', { for: inputId, text: label }),
        el('div', { class: 'mock-feedback-row' }, input, el('button', { class: 'btn ghost', type: 'submit', text: button })));
    }

    function render(m) {
      container.hidden = m.status === 'disabled';
      const head = el('div', { class: 'mock-head' }, el('h3', { text: 'Concept mock' }),
        el('span', { class: 'ai-tag', text: 'AI-generated' }));
      let body;
      if (m.status === 'pending') {
        body = el('div', { class: 'mock-pending' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }),
          el('span', { text: 'Sketching a concept mock of this idea. This usually takes under a minute.' }));
      } else if (m.status === 'ready') {
        const src = `${base}/mock.html?v=${encodeURIComponent(m.completedAt || '')}`;
        const frame = el('iframe', { src, sandbox: '', title: 'Concept mock UI', loading: 'lazy' });
        const wrap = el('div', { class: 'mock-frame' }, frame);
        fitDesktop(wrap, frame);
        body = el('div', {},
          wrap,
          el('div', { class: 'mock-meta' },
            el('span', { class: 'muted small', text: `Generated ${fmtDate(m.completedAt, true)}${m.feedback ? ' · with feedback' : ''}` }),
            el('a', { href: src, target: '_blank', rel: 'noopener', class: 'small', text: 'Open full size' })),
          feedbackForm('Not quite right? Say what to change and regenerate', 'Regenerate'));
      } else if (m.status === 'failed') {
        body = el('div', {}, el('p', { class: 'error', text: m.error || 'The mock could not be generated.' }),
          el('button', { class: 'btn ghost', type: 'button', text: 'Try again', onclick: () => regenerate('') }));
      } else {
        body = el('div', {}, el('p', { class: 'muted small', text: 'No concept mock yet for this request.' }),
          el('button', { class: 'btn ghost', type: 'button', text: 'Generate concept mock', onclick: () => regenerate('') }));
      }
      container.replaceChildren(head, body,
        el('p', { class: 'muted small mock-disclaimer', text: 'A quick AI sketch to help everyone picture the idea. It is not a design commitment.' }));
    }

    refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }

  window.App = { api, el, fillSelect, fmtDate, statusClass, mountMock };
})();
