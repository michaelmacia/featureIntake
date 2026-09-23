'use strict';
/*
 * HTTP layer: routing, JSON API and static file serving. Uses only Node built-ins.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Rules = require('../public/js/rules.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY_BYTES = 100 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
};

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.includes('application/json')) return reject(new HttpError(415, 'Content-Type must be application/json.'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY_BYTES) chunks.push(c); // keep draining past the limit so the 413 reaches the client
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request body too large.'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Malformed JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function actorFrom(req, body) {
  // MVP has no SSO; triage identifies itself via header or body. See PRD "Out of scope".
  const raw = (req.headers['x-user'] || (body && body.actor) || 'Triage team').toString();
  return raw.replace(/[^\w .@'-]/g, '').slice(0, 80) || 'Triage team';
}

function csvCell(v) {
  let s = Array.isArray(v) ? v.join('; ') : v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = ['id', 'createdAt', 'status', 'priorityBand', 'priorityScore', 'title', 'category', 'department',
  'requesterName', 'requesterEmail', 'urgency', 'targetDate', 'usersAffected', 'revenueImpact', 'regulatory',
  'affectedSystems', 'assignee', 'jiraKey'];

function toCsv(rows) {
  return [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

function filterRequests(all, q) {
  let rows = all.slice();
  const status = q.get('status');
  const department = q.get('department');
  const band = q.get('priority');
  const text = (q.get('q') || '').trim().toLowerCase();
  if (status === 'open') rows = rows.filter((r) => Rules.OPEN_STATUSES.includes(r.status));
  else if (status) rows = rows.filter((r) => r.status === status);
  if (department) rows = rows.filter((r) => r.department === department);
  if (band) rows = rows.filter((r) => r.priorityBand === band);
  if (text) {
    rows = rows.filter((r) => [r.id, r.title, r.problem, r.requesterName, r.requesterEmail, r.jiraKey]
      .some((f) => f && String(f).toLowerCase().includes(text)));
  }
  const sort = q.get('sort') || '-createdAt';
  const desc = sort.startsWith('-');
  const key = sort.replace(/^-/, '');
  if (['createdAt', 'updatedAt', 'priorityScore', 'targetDate', 'title', 'status'].includes(key)) {
    rows.sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  }
  return rows;
}

function summarize(all) {
  const byStatus = Object.fromEntries(Rules.ENUMS.status.map((s) => [s, 0]));
  const byBand = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const r of all) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (Rules.OPEN_STATUSES.includes(r.status)) byBand[r.priorityBand] += 1;
  }
  const open = all.filter((r) => Rules.OPEN_STATUSES.includes(r.status)).length;
  return { total: all.length, open, byStatus, openByPriority: byBand };
}

// Generated mocks are untrusted HTML: no scripts, no network, framable only by this app.
const MOCK_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'",
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
};

function mockStatus(record, mocks) {
  if (!mocks || !mocks.enabled) return { status: 'disabled' };
  return record.mock || { status: 'none' };
}

function createApp({ store, now = () => new Date(), mocks }) {
  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const method = req.method;

    if (parts[1] === 'health' && method === 'GET') return send(res, 200, { status: 'ok', requests: store.list().length });
    if (parts[1] === 'meta' && method === 'GET') {
      return send(res, 200, {
        enums: Rules.ENUMS, transitions: Rules.TRANSITIONS, limits: Rules.TEXT_LIMITS,
        features: { mocks: Boolean(mocks && mocks.enabled) },
      });
    }
    if (parts[1] === 'stats' && method === 'GET') return send(res, 200, summarize(store.list()));

    if (parts[1] !== 'requests') throw new HttpError(404, 'Not found.');

    if (parts.length === 2) {
      if (method === 'GET') {
        const rows = filterRequests(store.list(), url.searchParams);
        return send(res, 200, { count: rows.length, items: rows });
      }
      if (method === 'POST') {
        const body = await readJson(req);
        const { valid, errors, value } = Rules.validateRequest(body, { today: now().toISOString().slice(0, 10) });
        if (!valid) throw new HttpError(422, 'Validation failed.', errors);
        const ts = now().toISOString();
        const { score, band } = Rules.computePriority(value);
        const record = {
          id: store.nextId(now()),
          ...value,
          status: 'Submitted',
          priorityScore: score,
          priorityBand: band,
          assignee: '',
          jiraKey: '',
          createdAt: ts,
          updatedAt: ts,
          history: [{ at: ts, actor: value.requesterName, type: 'status', from: null, to: 'Submitted' }],
          comments: [],
        };
        if (mocks && mocks.enabled) mocks.request(record);
        await store.insert(record);
        return send(res, 201, record, { Location: `/api/requests/${record.id}` });
      }
      throw new HttpError(405, 'Method not allowed.');
    }

    if (parts[2] === 'export.csv' && parts.length === 3 && method === 'GET') {
      const rows = filterRequests(store.list(), url.searchParams);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="feature-requests-${now().toISOString().slice(0, 10)}.csv"`,
      });
      return res.end('﻿' + toCsv(rows));
    }

    const record = store.get(decodeURIComponent(parts[2]));
    if (!record) throw new HttpError(404, 'Request not found.');

    if (parts.length === 3) {
      if (method === 'GET') return send(res, 200, record);
      if (method === 'PATCH') {
        const body = await readJson(req);
        const actor = actorFrom(req, body);
        const ts = now().toISOString();
        const errors = {};
        if (body.status !== undefined && body.status !== record.status) {
          if (!Rules.ENUMS.status.includes(body.status)) errors.status = 'Unknown status.';
          else if (!Rules.canTransition(record.status, body.status)) {
            errors.status = `Cannot move from "${record.status}" to "${body.status}".`;
          } else if ((body.status === 'Rejected' || body.status === 'Needs Info') && !String(body.note || '').trim()) {
            errors.note = `A note is required when moving to "${body.status}".`;
          }
        }
        if (body.assignee !== undefined && (typeof body.assignee !== 'string' || body.assignee.length > 80)) {
          errors.assignee = 'Assignee must be text up to 80 characters.';
        }
        if (body.jiraKey !== undefined && (typeof body.jiraKey !== 'string'
          || (body.jiraKey !== '' && !/^[A-Z][A-Z0-9]+-\d+$/.test(body.jiraKey.trim())))) {
          errors.jiraKey = 'Jira key must look like FEAT-123.';
        }
        if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed.', errors);

        if (body.status !== undefined && body.status !== record.status) {
          record.history.push({ at: ts, actor, type: 'status', from: record.status, to: body.status });
          record.status = body.status;
        }
        for (const field of ['assignee', 'jiraKey']) {
          if (body[field] !== undefined && body[field].trim() !== record[field]) {
            record.history.push({ at: ts, actor, type: field, from: record[field], to: body[field].trim() });
            record[field] = body[field].trim();
          }
        }
        if (body.note && String(body.note).trim()) {
          record.comments.push({ at: ts, author: actor, text: String(body.note).trim().slice(0, 2000) });
        }
        record.updatedAt = ts;
        await store.save();
        return send(res, 200, record);
      }
      throw new HttpError(405, 'Method not allowed.');
    }

    if (parts[3] === 'mock' && parts.length === 4) {
      if (method === 'GET') return send(res, 200, mockStatus(record, mocks));
      if (method === 'POST') {
        if (!mocks || !mocks.enabled) throw new HttpError(503, 'Mock generation is not enabled on this server.');
        if (record.mock && record.mock.status === 'pending') throw new HttpError(409, 'A mock is already being generated.');
        const body = await readJson(req);
        const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 1000) : '';
        mocks.request(record, feedback || undefined);
        record.history.push({ at: now().toISOString(), actor: actorFrom(req, body), type: 'mock', from: null, to: feedback ? 'regenerated with feedback' : 'regenerated' });
        await store.save();
        return send(res, 202, record.mock);
      }
      throw new HttpError(405, 'Method not allowed.');
    }

    if (parts[3] === 'mock.html' && parts.length === 4 && (method === 'GET' || method === 'HEAD')) {
      const status = mockStatus(record, mocks);
      if (status.status !== 'ready') throw new HttpError(404, 'No mock available for this request yet.');
      let html;
      try { html = await mocks.readHtml(record.id); } catch { throw new HttpError(404, 'Mock file is missing.'); }
      res.writeHead(200, MOCK_HEADERS);
      return res.end(method === 'HEAD' ? undefined : html);
    }

    if (parts[3] === 'comments' && parts.length === 4 && method === 'POST') {
      const body = await readJson(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text || text.length > 2000) throw new HttpError(422, 'Validation failed.', { text: 'Comment must be 1-2000 characters.' });
      const ts = now().toISOString();
      record.comments.push({ at: ts, author: actorFrom(req, body), text });
      record.updatedAt = ts;
      await store.save();
      return send(res, 201, record);
    }

    throw new HttpError(404, 'Not found.');
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel === '/requests') rel = '/requests.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Forbidden.');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Not found');
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) send(res, err.status, { error: err.message, ...(err.details ? { fields: err.details } : {}) });
      } else {
        console.error(err);
        if (!res.headersSent) send(res, 500, { error: 'Internal server error.' });
      }
    }
  });
}

module.exports = { createApp, toCsv, filterRequests, summarize };
