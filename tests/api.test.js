'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../server/store');
const { createApp } = require('../server/app');
const valid = require('../test-data/valid-payload.json');
const seed = require('../test-data/seed.json');
const invalidCases = require('../test-data/invalid-payloads.json');

const FIXED_NOW = new Date('2026-09-23T15:00:00Z');

// A stand-in for the Vite build so server tests never depend on the front end being built.
function makeStaticDir(dir) {
  const web = path.join(dir, 'web');
  fs.mkdirSync(path.join(web, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>Feature Intake</title><div id="root"></div><script type="module" src="/assets/app.js"></script>');
  fs.writeFileSync(path.join(web, 'assets', 'app.js'), 'console.log("app")');
  return web;
}

async function startServer(initial = [], { staticDir } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'));
  const file = path.join(dir, 'requests.json');
  const store = new Store(file).load();
  if (initial.length) await store.replaceAll(structuredClone(initial));
  const server = createApp({ store, now: () => FIXED_NOW, staticDir: staticDir || makeStaticDir(dir) });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { call, file, store, close: () => new Promise((r) => server.close(r)) };
}

test('create, read, list', async (t) => {
  const s = await startServer();
  t.after(s.close);

  const created = await s.call('POST', '/api/requests', { ...valid, status: 'Done', priorityScore: 1 });
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 'FR-2026-0001');
  assert.equal(created.json.status, 'Submitted', 'client cannot set status');
  // 11-50 people (14) + Medium $ (21) + High urgency (20) = 55 -> P2
  assert.equal(created.json.priorityScore, 55, 'server computes the score');
  assert.equal(created.json.priorityBand, 'P2');
  assert.equal(created.headers.get('location'), '/api/requests/FR-2026-0001');

  const got = await s.call('GET', '/api/requests/FR-2026-0001');
  assert.equal(got.json.title, valid.title);

  const second = await s.call('POST', '/api/requests', valid);
  assert.equal(second.json.id, 'FR-2026-0002');

  const list = await s.call('GET', '/api/requests');
  assert.equal(list.json.count, 2);

  await s.store.queue; // flush pending write
  const onDisk = JSON.parse(fs.readFileSync(s.file, 'utf8'));
  assert.equal(onDisk.requests.length, 2);
  assert.equal(onDisk.seq, 2);
});

test('every invalid payload returns 422 with field errors', async (t) => {
  const s = await startServer();
  t.after(s.close);
  for (const { case: name, payload, expectFields } of invalidCases) {
    const r = await s.call('POST', '/api/requests', payload);
    assert.equal(r.status, 422, name);
    assert.deepEqual(Object.keys(r.json.fields).sort(), [...expectFields].sort(), name);
  }
});

test('transport errors: malformed JSON, wrong content type, oversize body, unknown route', async (t) => {
  const s = await startServer();
  t.after(s.close);
  assert.equal((await s.call('POST', '/api/requests', '{nope')).status, 400);
  assert.equal((await s.call('POST', '/api/requests', 'x', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await s.call('POST', '/api/requests', { ...valid, problem: 'x'.repeat(200 * 1024) })).status, 413);
  assert.equal((await s.call('GET', '/api/nope')).status, 404);
  assert.equal((await s.call('GET', '/api/requests/FR-0000-9999')).status, 404);
  assert.equal((await s.call('DELETE', '/api/requests')).status, 405);
});

test('security: cross-site content types are refused and malformed paths are 400s', async (t) => {
  const s = await startServer();
  t.after(s.close);
  // Browsers send these cross-site without a CORS preflight; they must not count as JSON.
  for (const type of ['text/plain; a=application/json', 'text/plain;application/json', 'multipart/form-data; application/json']) {
    assert.equal((await s.call('POST', '/api/requests', valid, { 'Content-Type': type })).status, 415, type);
  }
  assert.equal((await s.call('POST', '/api/requests', valid, { 'Content-Type': 'Application/JSON; charset=utf-8' })).status, 201);
  assert.equal((await s.call('GET', '/api/requests/%E0%A4%A')).status, 400);
  assert.equal((await s.call('GET', '/%E0%A4%A')).status, 400);
});

test('rate limiter: fixed window per bucket and client', () => {
  const { createRateLimiter } = require('../server/app');
  const check = createRateLimiter({ assist: { max: 2, windowMs: 1000 } });
  check('assist', 'a', 0);
  check('assist', 'a', 10);
  assert.throws(() => check('assist', 'a', 20), (e) => e.status === 429 && e.headers['Retry-After'] === '1');
  check('assist', 'b', 20); // other clients have their own budget
  check('assist', 'a', 1000); // new window
  check('other', 'a', 0); // buckets without a limit are not limited
});

test('workflow: valid transitions, note requirements, illegal moves', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const { json: r } = await s.call('POST', '/api/requests', valid);
  const url = `/api/requests/${r.id}`;

  const illegal = await s.call('PATCH', url, { status: 'Done' });
  assert.equal(illegal.status, 422);
  assert.match(illegal.json.fields.status, /Cannot move/);

  const review = await s.call('PATCH', url, { status: 'In Review', assignee: 'Jordan Kim', actor: 'Jordan Kim' });
  assert.equal(review.status, 200);
  assert.equal(review.json.status, 'In Review');
  assert.equal(review.json.assignee, 'Jordan Kim');

  const needsInfoNoNote = await s.call('PATCH', url, { status: 'Needs Info' });
  assert.equal(needsInfoNoNote.status, 422);
  assert.ok(needsInfoNoNote.json.fields.note);

  const needsInfo = await s.call('PATCH', url, { status: 'Needs Info', note: 'How many users?' });
  assert.equal(needsInfo.json.comments.length, 1);

  await s.call('PATCH', url, { status: 'In Review' });
  const approved = await s.call('PATCH', url, { status: 'Approved', jiraKey: 'FEAT-42' });
  assert.equal(approved.json.jiraKey, 'FEAT-42');

  const badKey = await s.call('PATCH', url, { jiraKey: 'not a key' });
  assert.equal(badKey.status, 422);
  const badKeyType = await s.call('PATCH', url, { jiraKey: ['FEAT-1'] });
  assert.equal(badKeyType.status, 422);

  const types = approved.json.history.map((h) => `${h.type}:${h.to}`);
  assert.deepEqual(types, ['status:Submitted', 'status:In Review', 'assignee:Jordan Kim', 'status:Needs Info', 'status:In Review', 'status:Approved', 'jiraKey:FEAT-42']);
});

test('comments endpoint', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const { json: r } = await s.call('POST', '/api/requests', valid);
  const ok = await s.call('POST', `/api/requests/${r.id}/comments`, { text: 'Looks good', actor: 'Casey' });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.comments[0].author, 'Casey');
  assert.equal((await s.call('POST', `/api/requests/${r.id}/comments`, { text: '   ' })).status, 422);
});

test('filters, search, sorting and stats against seed data', async (t) => {
  const s = await startServer(seed);
  t.after(s.close);

  const open = await s.call('GET', '/api/requests?status=open');
  assert.ok(open.json.items.every((r) => !['Done', 'Rejected'].includes(r.status)));

  const p1 = await s.call('GET', '/api/requests?priority=P1');
  assert.ok(p1.json.items.every((r) => r.priorityBand === 'P1'));

  const search = await s.call('GET', '/api/requests?q=gdpr');
  assert.ok(search.json.count > 0);
  assert.ok(search.json.items.every((r) => /gdpr/i.test(r.title + r.problem)));

  const byScore = await s.call('GET', '/api/requests?sort=-priorityScore');
  const scores = byScore.json.items.map((r) => r.priorityScore);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));

  const stats = await s.call('GET', '/api/stats');
  assert.equal(stats.json.total, seed.length);
  assert.equal(Object.values(stats.json.byStatus).reduce((a, b) => a + b, 0), seed.length);

  // New IDs continue after the highest seeded one
  const created = await s.call('POST', '/api/requests', valid);
  assert.equal(created.json.id, `FR-2026-${String(seed.length + 1).padStart(4, '0')}`);
});

test('CSV export escapes quotes and neutralises formulas', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.call('POST', '/api/requests', { ...valid, title: '=HYPERLINK("http://evil.example","x")' });
  const r = await s.call('GET', '/api/requests/export.csv');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.text, /"'=HYPERLINK\(""http:\/\/evil.example"",""x""\)"/);
});

test('serves the React app: SPA routes, hashed assets, security headers, traversal', async (t) => {
  const s = await startServer();
  t.after(s.close);
  for (const route of ['/', '/requests', '/anything/deep']) {
    const page = await s.call('GET', route);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /<div id="root">/, route);
    assert.equal(page.headers.get('cache-control'), 'no-cache', route);
  }
  const home = await s.call('GET', '/');
  const csp = home.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self';/, 'scripts stay same-origin only');
  assert.match(csp, /style-src 'self' 'unsafe-inline'/, 'styled-components needs inline styles');

  const asset = await s.call('GET', '/assets/app.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.match(asset.headers.get('cache-control'), /immutable/);

  assert.notEqual((await s.call('GET', '/..%2f..%2fpackage.json')).status, 200);
  assert.equal((await s.call('GET', '/missing.js')).status, 404, 'missing files are 404, not the SPA shell');
});

test('explains when the web app has not been built', async (t) => {
  const s = await startServer([], { staticDir: path.join(os.tmpdir(), 'intake-no-build-' + process.pid) });
  t.after(s.close);
  const page = await s.call('GET', '/');
  assert.equal(page.status, 503);
  assert.match(page.text, /npm run build/);
  assert.equal((await s.call('GET', '/api/health')).status, 200, 'API still works');
});
