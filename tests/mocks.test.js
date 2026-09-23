'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../server/store');
const { createApp } = require('../server/app');
const { MockService, createClaudeGenerator, extractHtml, sanitizeHtml, buildPrompt } = require('../server/mockgen');
const valid = require('../test-data/valid-payload.json');

const SAMPLE = '<!doctype html><html><head><style>body{font:14px system-ui}</style></head><body><h1>Invoice sync</h1></body></html>';
const quiet = { info() {}, error() {} };

async function startServer({ generator } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-mock-'));
  const store = new Store(path.join(dir, 'requests.json')).load();
  const mocks = new MockService({ store, dir: path.join(dir, 'mocks'), generator, log: quiet });
  const server = createApp({ store, mocks, now: () => new Date('2026-09-23T15:00:00Z') });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { call, mocks, store, close: () => new Promise((r) => server.close(r)) };
}

// ---- pure helpers ----

test('extractHtml: tagged, fenced, bare, and missing', () => {
  assert.equal(extractHtml(`Sure!\n<mock_html>\n${SAMPLE}\n</mock_html>`), SAMPLE);
  assert.equal(extractHtml('```html\n' + SAMPLE + '\n```'), SAMPLE);
  assert.equal(extractHtml(`noise ${SAMPLE} trailing`), SAMPLE);
  assert.throws(() => extractHtml('I cannot draw that.'), /did not contain an HTML document/);
});

test('sanitizeHtml strips active content and external loads, keeps styling and SVG', () => {
  const dirty = `<!doctype html><html><head>
    <meta http-equiv="refresh" content="0;url=https://evil.example">
    <link rel="stylesheet" href="https://evil.example/x.css">
    <style>@import url("https://evil.example/y.css"); .a{background:url(https://evil.example/t.png)} .b{background:url(data:image/png;base64,AAAA)}</style>
    <script>alert(1)</script><script src="https://evil.example/z.js"></script>
    </head><body onload="steal()">
    <a href="javascript:alert(2)">x</a><button onclick='go()'>Go</button>
    <iframe src="https://evil.example"></iframe><form action="https://evil.example"><input value="kept"></form>
    <svg width="10" height="10"><path d="M0 0h10"/></svg></body></html>`;
  const clean = sanitizeHtml(dirty);
  for (const bad of ['<script', 'alert(1)', 'evil.example', 'onload', 'onclick', 'javascript:', '<iframe', '<form', 'http-equiv', '@import', '<link']) {
    assert.ok(!clean.includes(bad), `still contains ${bad}`);
  }
  assert.match(clean, /<style>/);
  assert.match(clean, /<svg width="10"/);
  assert.match(clean, /<input value="kept">/);
  assert.match(clean, /data:image\/png;base64/);
});

test('buildPrompt fences user content and appends reviewer feedback', () => {
  const p = buildPrompt({ ...valid, id: 'FR-2026-0001' }, 'Show it in SAP');
  assert.match(p, /^<feature_request>\n\{/);
  assert.match(p, /"id": "FR-2026-0001"/);
  assert.ok(!p.includes('requesterEmail'), 'personal contact details are not sent');
  assert.match(p, /<reviewer_feedback>\nShow it in SAP\n<\/reviewer_feedback>/);
});

// ---- Claude generator against a fake SDK client ----

function fakeClient(message) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params) {
          calls.push(params);
          const listeners = {};
          return {
            request_id: 'req_fake123',
            on(event, fn) { (listeners[event] ||= []).push(fn); return this; },
            finalMessage: async () => { (listeners.connect || []).forEach((fn) => fn()); return message; },
          };
        },
      },
    },
  };
}

test('Claude generator reports acceptance with the API request ID', async () => {
  const client = fakeClient({ model: 'claude-opus-5', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: SAMPLE }] });
  const accepted = [];
  await createClaudeGenerator({ client })({ ...valid, id: 'FR-1' }, { onAccepted: (info) => accepted.push(info) });
  assert.deepEqual(accepted, [{ requestId: 'req_fake123' }]);
});

test('MockService logs acceptance and records the request ID while still pending', async (t) => {
  const lines = [];
  const log = { info: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-mock-log-'));
  const store = new Store(path.join(dir, 'requests.json')).load();
  let release;
  const gate = new Promise((res) => { release = res; });
  let snapshot;
  const mocks = new MockService({
    store, dir: path.join(dir, 'mocks'), log,
    generator: async (req, { onAccepted }) => {
      onAccepted({ requestId: 'req_live42' });
      snapshot = structuredClone(req.mock);
      await gate;
      return { html: SAMPLE };
    },
  });
  const record = { id: 'FR-2026-0099', ...valid, history: [], comments: [] };
  mocks.request(record);
  await store.insert(record);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(snapshot.status, 'pending', 'accepted, not ready yet');
  assert.equal(snapshot.requestId, 'req_live42');
  assert.ok(snapshot.acceptedAt);
  release();
  await mocks.idle();
  assert.equal(store.get('FR-2026-0099').mock.requestId, 'req_live42');
  assert.ok(lines.some((l) => /^mock FR-2026-0099 queued$/.test(l)));
  assert.ok(lines.some((l) => /^mock FR-2026-0099 accepted by Claude API \(request req_live42\) after \d+ms; generating\.\.\.$/.test(l)), lines.join('\n'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
});

test('Claude generator: request shape and successful reply', async () => {
  const client = fakeClient({
    model: 'claude-opus-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 4000 },
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: `<mock_html>${SAMPLE}</mock_html>` }],
  });
  const gen = createClaudeGenerator({ client, effort: 'low' });
  const out = await gen({ ...valid, id: 'FR-2026-0007' }, {});
  assert.equal(out.html, SAMPLE);
  assert.equal(out.model, 'claude-opus-5');
  const params = client.calls[0];
  assert.equal(params.model, 'claude-opus-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(params.output_config, { effort: 'low' });
  assert.equal(params.max_tokens, 64000);
  assert.match(params.system, /request FR-2026-0007\./);
  assert.equal(params.messages[0].role, 'user');
});

test('Claude generator: refusal and truncation become errors', async () => {
  const refused = createClaudeGenerator({ client: fakeClient({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: {} }) });
  await assert.rejects(refused({ ...valid, id: 'FR-1' }), /declined \(cyber\)/);
  const cut = createClaudeGenerator({ client: fakeClient({ stop_reason: 'max_tokens', content: [], usage: {} }) });
  await assert.rejects(cut({ ...valid, id: 'FR-1' }), /cut off/);
});

test('API errors surface a readable message with the request ID', async (t) => {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiError = Anthropic.APIError.generate(400,
    { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } },
    undefined, new Headers({ 'request-id': 'req_abc' }));
  const s = await startServer({ generator: async () => { throw apiError; } });
  t.after(s.close);
  const { json: r } = await s.call('POST', '/api/requests', valid);
  await s.mocks.idle();
  const m = (await s.call('GET', `/api/requests/${r.id}/mock`)).json;
  assert.equal(m.status, 'failed');
  assert.equal(m.error, 'The mock service rejected the request (400). Reference req_abc; details are in the server log.');
});

// ---- end to end through the API ----

test('submission queues a mock; ready mock is served sandboxed', async (t) => {
  const seen = [];
  let release;
  const gate = new Promise((res) => { release = res; });
  const s = await startServer({
    generator: async (req, opts) => {
      seen.push({ id: req.id, ...opts });
      await gate;
      return { html: SAMPLE.replace('</body>', '<script>x()</script></body>'), model: 'claude-opus-5' };
    },
  });
  t.after(s.close);

  const created = await s.call('POST', '/api/requests', valid);
  assert.equal(created.status, 201, 'submission does not wait for the mock');
  assert.equal(created.json.mock.status, 'pending');
  assert.equal((await s.call('GET', `/api/requests/${created.json.id}/mock.html`)).status, 404);

  release();
  await s.mocks.idle();
  const status = await s.call('GET', `/api/requests/${created.json.id}/mock`);
  assert.equal(status.json.status, 'ready');
  assert.equal(status.json.model, 'claude-opus-5');
  assert.equal(seen[0].id, created.json.id);

  const page = await s.call('GET', `/api/requests/${created.json.id}/mock.html`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /^sandbox; default-src 'none'/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(page.text, /<h1>Invoice sync<\/h1>/);
  assert.ok(!page.text.includes('<script'), 'served HTML is sanitised');

  const meta = await s.call('GET', '/api/meta');
  assert.equal(meta.json.features.mocks, true);
});

test('regenerate with feedback, conflict while pending, and failures', async (t) => {
  let fail = false;
  let release;
  let gate = Promise.resolve();
  const feedbacks = [];
  const s = await startServer({
    generator: async (req, { feedback }) => {
      feedbacks.push(feedback);
      await gate;
      if (fail) throw new Error('boom');
      return { html: SAMPLE };
    },
  });
  t.after(s.close);
  const { json: r } = await s.call('POST', '/api/requests', valid);
  await s.mocks.idle();

  gate = new Promise((res) => { release = res; });
  const regen = await s.call('POST', `/api/requests/${r.id}/mock`, { feedback: 'Add an approval step', actor: 'Jordan Kim' });
  assert.equal(regen.status, 202);
  assert.equal(regen.json.status, 'pending');
  assert.equal((await s.call('POST', `/api/requests/${r.id}/mock`, {})).status, 409, 'no double generation');
  release();
  await s.mocks.idle();
  assert.deepEqual(feedbacks, [undefined, 'Add an approval step']);
  const after = await s.call('GET', `/api/requests/${r.id}`);
  assert.equal(after.json.mock.status, 'ready');
  assert.equal(after.json.mock.feedback, 'Add an approval step');
  assert.equal(after.json.history.at(-1).type, 'mock');
  assert.equal(after.json.history.at(-1).actor, 'Jordan Kim');

  fail = true;
  await s.call('POST', `/api/requests/${r.id}/mock`, {});
  await s.mocks.idle();
  const failed = await s.call('GET', `/api/requests/${r.id}/mock`);
  assert.equal(failed.json.status, 'failed');
  assert.equal(failed.json.error, 'boom');
  assert.equal((await s.call('GET', `/api/requests/${r.id}/mock.html`)).status, 404);
});

test('restart resumes mocks left pending', async (t) => {
  const s = await startServer({ generator: async () => ({ html: SAMPLE }) });
  t.after(s.close);
  const { json: r } = await s.call('POST', '/api/requests', valid);
  await s.mocks.idle();
  s.store.get(r.id).mock = { status: 'pending', requestedAt: '2026-09-23T15:00:00Z' };
  s.mocks.resume();
  await s.mocks.idle();
  assert.equal(s.store.get(r.id).mock.status, 'ready');
});

test('feature disabled: no mock work, clear responses', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const { json: r } = await s.call('POST', '/api/requests', valid);
  assert.equal(r.mock, undefined);
  assert.equal((await s.call('GET', `/api/requests/${r.id}/mock`)).json.status, 'disabled');
  assert.equal((await s.call('POST', `/api/requests/${r.id}/mock`, {})).status, 503);
  assert.equal((await s.call('GET', `/api/requests/${r.id}/mock.html`)).status, 404);
  assert.equal((await s.call('GET', '/api/meta')).json.features.mocks, false);
});
