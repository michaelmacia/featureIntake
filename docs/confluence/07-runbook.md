# Feature Intake — Runbook

## Run locally

Requirements: Node.js 22.12 or later (the server `require`s the shared ES-module rules).

```bash
npm install     # server (@anthropic-ai/sdk) and front end (React, Vite, Backyard)
npm run seed    # optional: load 40 demo requests into data/requests.json
npm run dev     # development: API on :3000 + Vite on http://localhost:5173 with hot reload
npm run build   # build the React app into web/dist
npm start       # production: API + built app on http://localhost:3000  (form)  and  /requests  (triage board)
npm test        # server tests (rules, API, concept mocks)
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `HOST` | `127.0.0.1` | Interface to listen on. Loopback only by default because the MVP has no login; use `0.0.0.0` in a container behind SSO/VPN |
| `STATIC_DIR` | `./web/dist` | Built React app to serve |
| `DATA_FILE` | `./data/requests.json` | Where requests are stored. Mock HTML goes in `mocks/` beside it |
| `ANTHROPIC_API_KEY` | — | Claude API key for concept mocks |
| `MOCKS` | `auto` | `auto` = on when a key is set; `on`; `off` |
| `MOCK_MODEL` | `claude-opus-5` | Model used for mocks |
| `MOCK_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max`. Higher is better quality but a longer wait |
| `ASSIST` | `auto` | Intake assistant: `auto` = on when a key is set; `on`; `off` (then `/` serves the form) |
| `ASSIST_MODEL` | `claude-opus-5` | Model for intake chat turns |
| `ASSIST_EFFORT` | `low` | Chat turns should feel quick; raise if questioning is too shallow |

The startup log says whether the intake assistant and concept mocks are on.

## Intake assistant

- **Flow:** each chat message is one `POST /api/assist`, which makes one Claude call with a structured-output schema. The server sanitises the returned field updates with the shared rules before merging. Nothing is stored until the request is submitted; then the transcript is saved on the request.
- **Log line per turn:** `assistant turn N in …ms; updated title, problem, …`.
- **Cost:** one call per message. A typical intake is 3 to 6 turns. The conversation prefix is prompt-cached between turns.
- **Failures:** the browser shows the error with **Try again**. The requester can also switch to `/form` at any time; their chat draft stays on their device.

## Concept mocks

- **Flow:** on submit, the request gets `mock.status = pending` and is queued (2 at a time). The server calls Claude, which returns a single HTML page. That page is sanitised and saved to `mocks/<id>.html`, and the status becomes `ready` or `failed`. Submission never waits on this step.
- **Restarts:** anything still `pending` at startup is re-queued.
- **Cost:** roughly one request per submission, plus one per "Regenerate". Token usage is logged per mock (`mock FR-… ready in …ms { input, output }`).
- **Log lines per mock:** `queued`, then `accepted by Claude API (request req_…) after …ms; generating...` once the API returns 200, then `ready` or `failed`. "Accepted" also sets `mock.acceptedAt` and `mock.requestId` while the status is still `pending`.
- **Refusals:** requests use the API's server-side fallback (`fallbacks: "default"`). If every model declines, the status is `failed` with a readable reason.
- **Security:** mock HTML is untrusted. It is served with `Content-Security-Policy: sandbox; default-src 'none'`, shown in an `<iframe sandbox>`, and has scripts, handlers and external URLs stripped.

## Deploy (MVP)

The MVP is a single instance, because the JSON file store is not safe to share between processes.

Example container:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY shared ./shared
COPY web ./web
RUN npm run build && npm prune --omit=dev
COPY server ./server
COPY test-data/seed.json ./test-data/seed.json
ENV DATA_FILE=/data/requests.json PORT=3000 HOST=0.0.0.0
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/index.js"]
```

Mount a persistent volume at `/data`. **Put the app behind the corporate SSO proxy or VPN.** The MVP has no authentication of its own.

Claude-backed endpoints are rate limited per client IP: 30 assistant turns a minute, and 10 submissions or mock regenerations per 10 minutes when mocks are on. Behind a proxy every user shares the proxy's IP, so raise the limits (`DEFAULT_RATE_LIMITS` in `server/app.js`) or key them on the authenticated user once SSO lands.

## Health and monitoring

| Check | How | Healthy |
|---|---|---|
| Liveness | `GET /api/health` | `200 {"status":"ok"}` |
| Data file | Size and mtime of `DATA_FILE` | Grows with submissions; mtime changes after each write |
| Errors | Process stderr | No `Error` stack traces |

## Backup and restore

- **Backup:** copy `DATA_FILE` on a schedule (for example hourly, keeping 30 days). Writes are atomic (temp file then rename), so a copy is always a complete file.
- **Restore:** stop the app, replace `DATA_FILE` with the backup, and start the app. Check the count in `/api/health`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `EADDRINUSE` on start | Port busy | `PORT=3001 npm start`, or stop the other process |
| Board empty after deploy | New empty volume | Restore a backup, or `npm run seed` for demos only |
| `SyntaxError` reading data on start | Data file hand-edited or corrupted | Restore the latest backup. Atomic writes prevent this in normal operation |
| 422 on submit that "looks fine" | Server rule failed (for example a past date after midnight) | Read `fields` in the response; the UI shows it in the error summary |
| 413 on submit | Body > 100 KB | Shorten long text fields; limits are 4000 characters |
| Page says "The web app has not been built yet" | `web/dist` is missing | Run `npm run build` (or use `npm run dev` during development) |
| Scripts not loading | An inline `<script>` was added, which CSP blocks | Keep all code in `web/src`; Vite bundles it |
| `/` shows the form, not the chat | Assistant is off (no key, or `ASSIST=off`) | Check the startup log; set `ANTHROPIC_API_KEY` |
| Chat says "The assistant is unavailable right now (400)" | Usually account-level (billing) or a rejected request | Search the server log for the reference. Fix billing, then **Try again** |
| Chat reply is slow | High `ASSIST_EFFORT` or API load | Keep `ASSIST_EFFORT=low`; check API status |
| No concept mock section appears | Mocks are off (no `ANTHROPIC_API_KEY`, or `MOCKS=off`) | Check the startup log; set the key |
| Mock says "not authorised" | Bad or missing API key | Fix `ANTHROPIC_API_KEY` and restart, then click **Try again** |
| Mock says "rejected the request (400)" | Usually account-level: e.g. "credit balance is too low" in the server log | Search the server log for the reference ID. Fix billing at console.anthropic.com → Plans & Billing, then click **Try again** on each failed request |
| Mock says "busy" | API rate limit | Wait a minute and click **Try again** (the SDK already retries twice) |
| Mock stuck on "Sketching…" | Server restarted mid-generation, or a very slow request | Pending mocks resume on restart; lower `MOCK_EFFORT` to shorten waits |
| Excel shows odd characters | Opened CSV via an import wizard with the wrong encoding | Open by double-click (the file has a UTF-8 BOM), or choose UTF-8 |

## Common admin tasks

- **Change a dropdown list** (for example add a department): edit `ENUMS` in `shared/rules.js`, run `npm test` and `npm run build`, and deploy. Existing requests keep their old values.
- **Change the scoring weights:** edit `computePriority` in `rules.js` and update the band-boundary tests. Existing scores are not recalculated. Write a one-off script if you need that.
- **Fix a wrong status:** use the triage board, or `PATCH /api/requests/{id}` with a valid transition. Don't edit the data file while the app is running, because the in-memory copy will overwrite your change.
