# Feature Intake — Test Strategy

## Levels

| Level | Scope | Tooling | Where |
|---|---|---|---|
| Unit | Validation rules, scoring, workflow transitions | `node:test` | `tests/rules.test.js` |
| API / integration | Every endpoint on a real HTTP server with a temporary data file | `node:test` + `fetch` | `tests/api.test.js` |
| UI (manual, MVP) | Wizard, board, dialog, keyboard, screen reader | UAT scripts below | this page |
| UI (automated, Phase 2) | Happy path and validation in Chromium / WebKit | Playwright + axe-core | `e2e/` (planned) |
| Non-functional | Load (10k requests), security headers, accessibility | k6, OWASP ZAP baseline, axe | CI nightly (planned) |

Run everything: `npm test` (40 tests, about 1 second, no dependencies).

## Test data

All test data is generated deterministically by `test-data/generate.js` (`npm run gen:data`), so every run produces identical files.

| File | Contents | Used by |
|---|---|---|
| `seed.json` | 40 realistic requests across all 7 statuses, 10 departments and 4 bands, with consistent history and comments | `npm run seed`, API tests, demos, UAT |
| `requests.csv` | The same data in export format | Excel/BI checks, Jira import rehearsal |
| `valid-payload.json` | Minimal complete POST body | Unit/API tests, curl examples |
| `edge-cases.json` | 10 **valid** payloads: unicode and emoji, HTML/script text, formula injection, exact min/max lengths, whitespace, duplicate systems, Critical with reason, mixed-case email, unknown fields | Unit tests (must pass); manual XSS/encoding checks |
| `invalid-payloads.json` | 15 **invalid** payloads, each listing the exact fields expected to fail | Unit and API tests (must return 422 with exactly those fields) |

## Coverage map

| Requirement | Automated test |
|---|---|
| FR-02/03 required fields and limits | `invalid payload rejected: *`, `every invalid payload returns 422` |
| FR-04 Critical rules | `Critical without reason or date`, edge case `Critical with reason` |
| FR-07 scoring | `priority: minimum…`, `priority: band boundaries`, `server computes the score` |
| FR-08 filters, search, sort | `filters, search, sorting and stats against seed data` |
| FR-11 workflow | `workflow transitions`, `workflow: valid transitions, note requirements, illegal moves` |
| FR-12 Jira key format | `workflow…` (bad key, wrong type) |
| FR-13 CSV safety | `CSV export escapes quotes and neutralises formulas` |
| Security headers, traversal | `static files, security headers and path traversal` |
| Transport errors 400/404/405/413/415 | `transport errors…` |
| Persistence and ID sequence | `create, read, list`, `New IDs continue after the highest seeded one` |

## UAT scripts

Run `npm run seed` and `npm start` first.

**UAT-01 Submit a complete request**
1. Open `/`. Click **Continue** without entering anything. *Expect:* an error summary with 3 items; focus moves to the summary; fields are outlined.
2. Fill in step 1 with a valid name, email and department, then continue. Fill in steps 2 and 3 with valid data.
3. On Review, click **Edit** next to Title. *Expect:* returns to step 2 with values kept.
4. Submit. *Expect:* a confirmation showing `FR-2026-0041` and a band. The request appears first on `/requests`.

**UAT-02 Critical urgency**
1. On step 3 choose **Critical**. *Expect:* "Why is this critical?" appears and "Needed by" shows *Required*.
2. Continue with both empty. *Expect:* two errors.

**UAT-03 Draft restore**
1. Type in a few fields, close the tab, and reopen `/`. *Expect:* values restored and the "Restored your draft" note shown.

**UAT-04 Triage workflow**
1. On `/requests`, enter your name in *Acting as*. Filter to **Submitted**. Open the top request.
2. Set **In Review**, assignee *you*, and save. *Expect:* the timeline shows 2 entries by you, and the status badge updates in the list.
3. Choose **Needs Info** without a note and save. *Expect:* an error saying a note is required.
4. Add a note and save. Then **In Review**, then **Approved** with Jira key `feat-12`. *Expect:* the key is upper-cased to `FEAT-12` and saved.
5. Confirm the status dropdown never offers illegal moves (for example Submitted → Done).

**UAT-05 Filters and export**
1. Search `GDPR`. Filter **P2**. Sort by Priority.
2. Click **Export CSV** and open it in Excel. *Expect:* only the filtered rows, accents intact, no formulas executed.

**UAT-06 Hostile content**
1. Submit each payload from `edge-cases.json` (via curl or by pasting into the form).
2. Open each on the board. *Expect:* HTML is shown as literal text, no alert fires, and emoji and accents render.

**UAT-07 Accessibility**
1. Complete UAT-01 using only the keyboard.
2. Repeat with NVDA or VoiceOver. *Expect:* step changes, errors and the confirmation are announced.
3. Check the layout at 360 px width and in dark mode.

## Entry and exit criteria

- **Entry:** build deployed to staging and seeded; `npm test` green.
- **Exit:** all UAT scripts pass; no open Sev-1 or Sev-2 defects; axe reports no serious violations.
