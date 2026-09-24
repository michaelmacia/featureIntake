'use strict';
/*
 * HTTP layer: routing, JSON API and static file serving. Uses only Node built-ins.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Rules = require('../shared/rules.js');
const { sanitizeTranscript } = require('./assistant');

const DEFAULT_STATIC_DIR = path.join(__dirname, '..', 'web', 'dist');
const MAX_BODY_BYTES = 100 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  // style-src needs 'unsafe-inline' because Backyard components are styled with styled-components,
  // which injects <style> tags at runtime. Scripts stay locked to same-origin files.
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

class HttpError extends Error {
  constructor(status, message, details, headers) {
    super(message);
    this.status = status;
    this.details = details;
    this.headers = headers;
  }
}

// Claude-backed endpoints cost money per call, so each client IP gets a fixed-window budget.
// The socket address is used, not X-Forwarded-For, which any client can set.
const DEFAULT_RATE_LIMITS = {
  assist: { max: 30, windowMs: 60 * 1000 }, // one call per chat turn
  mocks: { max: 10, windowMs: 10 * 60 * 1000 }, // submissions (which queue a mock) and regenerations
};

function createRateLimiter(limits) {
  const hits = new Map();
  return function check(bucket, key, nowMs = Date.now()) {
    const limit = limits && limits[bucket];
    if (!limit) return;
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset <= nowMs) hits.delete(k);
    const id = `${bucket}|${key}`;
    let entry = hits.get(id);
    if (!entry || entry.reset <= nowMs) { entry = { count: 0, reset: nowMs + limit.windowMs }; hits.set(id, entry); }
    entry.count += 1;
    if (entry.count > limit.max) {
      const retry = Math.ceil((entry.reset - nowMs) / 1000);
      throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', undefined, { 'Retry-After': String(retry) });
    }
  };
}

function decodePath(s) {
  try { return decodeURIComponent(s); } catch { throw new HttpError(400, 'Malformed URL.'); }
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
    // Compare the exact media type. A substring match would accept "text/plain; a=application/json",
    // which browsers send cross-site without a CORS preflight, opening every POST to CSRF.
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return reject(new HttpError(415, 'Content-Type must be application/json.'));
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

function createApp({ store, now = () => new Date(), mocks, assistant, staticDir = DEFAULT_STATIC_DIR, rateLimits = DEFAULT_RATE_LIMITS }) {
  staticDir = path.resolve(staticDir);
  const limit = createRateLimiter(rateLimits);
  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const method = req.method;
    const client = req.socket.remoteAddress || 'unknown';

    if (parts[1] === 'health' && method === 'GET') return send(res, 200, { status: 'ok', requests: store.list().length });
    if (parts[1] === 'meta' && method === 'GET') {
      return send(res, 200, {
        enums: Rules.ENUMS, transitions: Rules.TRANSITIONS, limits: Rules.TEXT_LIMITS,
        features: { mocks: Boolean(mocks && mocks.enabled), assistant: Boolean(assistant && assistant.enabled) },
      });
    }
    if (parts[1] === 'stats' && method === 'GET') return send(res, 200, summarize(store.list()));

    // Conversational intake: one assistant turn. Stateless; nothing is stored until the request is submitted.
    if (parts[1] === 'assist' && parts.length === 2) {
      if (method !== 'POST') throw new HttpError(405, 'Method not allowed.');
      if (!assistant || !assistant.enabled) throw new HttpError(503, 'The intake assistant is not enabled on this server. Use the form at /form.');
      limit('assist', client);
      const body = await readJson(req);
      try {
        return send(res, 200, await assistant.respond({ messages: body.messages, draft: body.draft }));
      } catch (err) {
        throw new HttpError(err.status || 500, err.message);
      }
    }

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
        if (mocks && mocks.enabled) limit('mocks', client);
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
        // Requests built with the assistant keep the conversation so triage can see how the request took shape.
        const transcript = sanitizeTranscript(body.conversation);
        if (transcript) record.intake = { mode: 'assistant', transcript };
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

    const record = store.get(decodePath(parts[2]));
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
        limit('mocks', client);
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

  // Serves the built React app. Real files are served as-is; any other extension-less
  // path (/, /requests, …) gets index.html so client-side routing can take over.
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    const rel = decodePath(url.pathname);
    const file = path.normalize(path.join(staticDir, rel));
    if (!file.startsWith(staticDir + path.sep) && file !== staticDir) throw new HttpError(403, 'Forbidden.');
    const isAsset = path.extname(rel) !== '';
    const target = isAsset ? file : path.join(staticDir, 'index.html');
    fs.readFile(target, (err, buf) => {
      if (err) {
        if (!isAsset) return send(res, 503, 'The web app has not been built yet. Run "npm run build", or use "npm run dev" during development.');
        return send(res, 404, 'Not found');
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
        // Vite fingerprints files under /assets, so they can be cached forever; index.html must not be.
        'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
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
        if (!res.headersSent) send(res, err.status, { error: err.message, ...(err.details ? { fields: err.details } : {}) }, err.headers);
      } else {
        console.error(err);
        if (!res.headersSent) send(res, 500, { error: 'Internal server error.' });
      }
    }
  });
}

module.exports = { createApp, toCsv, filterRequests, summarize, createRateLimiter, DEFAULT_RATE_LIMITS };
