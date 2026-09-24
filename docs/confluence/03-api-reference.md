# Feature Intake — API Reference

Base URL (local): `http://localhost:3000`. The machine-readable contract is `docs/api/openapi.yaml`; import it into Swagger UI, Postman or Insomnia.

**Conventions**
- Request and response bodies are JSON (`Content-Type: application/json`), except the CSV export.
- Timestamps are ISO-8601 UTC. `targetDate` is `YYYY-MM-DD`.
- IDs look like `FR-2026-0042`: year of creation plus a 4-digit sequence.
- **No authentication in MVP.** For triage actions, `actor` in the body is recorded in history. Phase 2 replaces it with the SSO identity.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness: `{status:"ok", requests:n}` |
| GET | `/api/meta` | Enums, workflow transitions, field limits |
| GET | `/api/stats` | Counts for KPI tiles |
| GET | `/api/requests` | List/filter/search/sort |
| POST | `/api/requests` | Submit a request |
| GET | `/api/requests/export.csv` | CSV of the filtered list |
| GET | `/api/requests/{id}` | One request |
| PATCH | `/api/requests/{id}` | Triage update: status, assignee, jiraKey, note |
| POST | `/api/requests/{id}/comments` | Add a comment |
| POST | `/api/assist` | One intake-assistant turn: `{ messages, draft }` in; reply, merged draft, suggestions and readiness out. `503` when the assistant is off |
| GET | `/api/requests/{id}/mock` | Concept mock status: `disabled`, `none`, `pending`, `ready` or `failed` |
| POST | `/api/requests/{id}/mock` | Regenerate the mock, optionally with `{ "feedback": "…", "actor": "…" }`. Returns `202`; `409` if one is already pending; `503` if mocks are off |
| GET | `/api/requests/{id}/mock.html` | The generated mock page. Sandboxed CSP, so embed it only in `<iframe sandbox>`. `404` until ready |

### Intake assistant

```http
POST /api/assist
Content-Type: application/json

{
  "messages": [{ "role": "user", "content": "Managers can only approve invoices at their desk in SAP." }],
  "draft": { "title": "", "problem": "", "affectedSystems": [] }
}
```

```json
{
  "reply": "Thanks, that's clear. Roughly how many managers approve invoices?",
  "draft": { "title": "Approve invoices from mobile", "problem": "Managers can only approve invoices at their desk in SAP…", "affectedSystems": ["SAP", "Mobile App"], "...": "…" },
  "updated": ["title", "problem", "affectedSystems", "category"],
  "suggestions": ["1-10", "11-50", "51-250", "251-1000", "Not sure"],
  "missing": [{ "field": "businessValue", "message": "Business value is required." }],
  "ready": false,
  "estimate": null
}
```

- The client owns the conversation: send every message so far (starting and ending with a `user` message, max 40, each up to 4000 characters) and the current draft, including the requester's own edits.
- `draft` contains content fields only. Identity fields are ignored and never sent to the model.
- Errors: `422` for a malformed or over-long conversation, `502` with a readable message when the model call fails, `503` when the assistant is off.
- To keep the conversation with the request, include it as `conversation` in `POST /api/requests`. It is stored as `intake: { mode: "assistant", transcript }`.

### Concept mocks

A request created while mocks are enabled comes back with `"mock": { "status": "pending", "requestedAt": "…" }`. Poll `GET …/mock` (the UI polls every 3 seconds) until the status is `ready` or `failed`:

```json
{ "status": "ready", "requestedAt": "2026-09-23T15:00:00.000Z", "completedAt": "2026-09-23T15:00:41.000Z", "model": "claude-opus-5" }
{ "status": "failed", "error": "Mock service is busy. Try again in a minute." }
```

`GET /api/meta` includes `features.mocks: true|false` so clients can hide the feature when it is off.

### List

`GET /api/requests?status=open&priority=P1&department=Finance&q=invoice&sort=-priorityScore`

| Param | Values |
|---|---|
| `status` | any status, or `open` (Submitted, In Review, Needs Info, Approved, In Delivery) |
| `department` | a department value |
| `priority` | `P1`–`P4` |
| `q` | case-insensitive text search over id, title, problem, requester name/email, Jira key |
| `sort` | `createdAt`, `updatedAt`, `priorityScore`, `targetDate`, `title`, `status`; prefix `-` for descending. Default `-createdAt` |

```json
{ "count": 1, "items": [ { "id": "FR-2026-0001", "title": "…", "status": "In Review", "priorityScore": 69, "priorityBand": "P2", "…": "…" } ] }
```

### Submit

```http
POST /api/requests
Content-Type: application/json

{
  "requesterName": "Priya Raman",
  "requesterEmail": "priya.raman@example.com",
  "department": "Finance",
  "title": "Auto-sync closed-won deals to invoicing",
  "category": "Integration",
  "problem": "Finance re-keys every closed deal from Salesforce into SAP by hand, which takes days and introduces errors.",
  "businessValue": "Saves about 120 hours per month and speeds up cash collection.",
  "affectedSystems": ["Salesforce", "SAP"],
  "usersAffected": "11-50",
  "revenueImpact": "Medium ($50K-$250K)",
  "regulatory": false,
  "urgency": "High"
}
```

`201 Created`, `Location: /api/requests/FR-2026-0041`

```json
{
  "id": "FR-2026-0041",
  "status": "Submitted",
  "priorityScore": 55,
  "priorityBand": "P2",
  "assignee": "",
  "jiraKey": "",
  "createdAt": "2026-09-23T15:00:00.000Z",
  "updatedAt": "2026-09-23T15:00:00.000Z",
  "history": [{ "at": "2026-09-23T15:00:00.000Z", "actor": "Priya Raman", "type": "status", "from": null, "to": "Submitted" }],
  "comments": [],
  "...": "all submitted fields, trimmed and normalised"
}
```

The server ignores client-supplied `id`, `status`, `priorityScore`, `history` and any unknown fields.

### Triage update

```http
PATCH /api/requests/FR-2026-0041
Content-Type: application/json

{ "status": "Needs Info", "note": "Roughly how many invoices per month?", "actor": "Jordan Kim" }
```

Rules:
- `status` must be an allowed transition from the current status (see the table below).
- Moving to `Needs Info` or `Rejected` requires a non-empty `note`.
- `jiraKey` must match `^[A-Z][A-Z0-9]+-\d+$` (for example `FEAT-123`) or be empty.
- `assignee` is up to 80 characters.
- Each change adds a `history` entry. A `note` becomes a comment.

| From | Allowed to |
|---|---|
| Submitted | In Review, Rejected |
| In Review | Needs Info, Approved, Rejected |
| Needs Info | In Review, Rejected |
| Approved | In Delivery, Rejected |
| In Delivery | Done |
| Rejected | In Review (reopen) |
| Done | — |

### CSV export

`GET /api/requests/export.csv` accepts the same query parameters as the list. It returns UTF-8 with a BOM (so Excel reads accents correctly) and these columns: `id, createdAt, status, priorityBand, priorityScore, title, category, department, requesterName, requesterEmail, urgency, targetDate, usersAffected, revenueImpact, regulatory, affectedSystems, assignee, jiraKey`. Cells starting with `= + - @` are prefixed with `'`.

## Errors

| Status | When | Body |
|---|---|---|
| 400 | Malformed JSON or malformed URL encoding | `{ "error": "Malformed JSON." }` |
| 404 | Unknown route or request ID | `{ "error": "Request not found." }` |
| 405 | Wrong method | `{ "error": "Method not allowed." }` |
| 413 | Body > 100 KB | `{ "error": "Request body too large." }` |
| 415 | Media type is not exactly `application/json` (parameters like `charset` are fine) | `{ "error": "Content-Type must be application/json." }` |
| 422 | Validation or workflow rule failed | `{ "error": "Validation failed.", "fields": { "title": "Request title must be at least 5 characters." } }` |
| 429 | Too many Claude-backed calls from this client (`/api/assist`; submissions and mock regenerations when mocks are on). Honour `Retry-After` | `{ "error": "Too many requests. Please wait a moment and try again." }` |
| 500 | Unexpected | `{ "error": "Internal server error." }` |

## Try it

```bash
curl -s localhost:3000/api/requests -H "Content-Type: application/json" -d @test-data/valid-payload.json
curl -s "localhost:3000/api/requests?status=open&sort=-priorityScore" | jq '.items[] | {id, title, priorityBand}'
curl -s -X PATCH localhost:3000/api/requests/FR-2026-0001 -H "Content-Type: application/json" -d '{"status":"In Review","assignee":"Jordan Kim","actor":"Jordan Kim"}'
```
