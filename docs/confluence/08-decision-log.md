# Feature Intake — Decision Log

| ID | Decision | Status | Date |
|---|---|---|---|
| ADR-001 | Zero-dependency Node.js server with vanilla JS front end | Accepted | 2026-09-23 |
| ADR-002 | One rules module shared by browser and server | Accepted | 2026-09-23 |
| ADR-003 | JSON file store for MVP behind a repository interface | Accepted | 2026-09-23 |
| ADR-004 | Ship MVP without in-app auth, behind SSO proxy / VPN | Accepted (temporary) | 2026-09-23 |
| ADR-005 | Additive, explainable priority score | Accepted | 2026-09-23 |
| ADR-006 | Transactional outbox for Jira and notifications | Proposed (Phase 2) | 2026-09-23 |
| ADR-007 | AI concept mocks generated asynchronously with Claude, rendered sandboxed | Accepted | 2026-09-23 |
| ADR-008 | React front end on Lowe's Backyard design system | Accepted | 2026-09-24 |
| ADR-009 | AI-guided conversational intake as the default, with the form as fallback | Accepted | 2026-09-24 |

---

### ADR-001 — Zero-dependency Node.js server with vanilla JS front end

**Context.** The app is two screens and about ten endpoints. The team wants something any developer can run immediately and that has no supply-chain surface to patch.
**Decision.** Use Node's built-in `http`, `fs` and `node:test`, with plain HTML/CSS/JS in the browser. No framework and no build step.
**Consequences.** + No `npm install`, nothing to patch, and fast startup. − Routing and DOM helpers are hand-written (about 50 lines). If the UI grows past about 5 screens, revisit this and consider React or Vue with Vite.
**Superseded for the front end by ADR-008** (React + Backyard). The server keeps using only Node built-ins plus the Anthropic SDK.
**Amended by ADR-007:** one runtime dependency, `@anthropic-ai/sdk`, for concept mocks. The app still runs without an API key; mocks simply switch off.

### ADR-002 — One rules module shared by browser and server

**Context.** Validation that differs between client and server causes "the form said OK but submit failed" bugs.
**Decision.** `shared/rules.js` (originally a UMD module in `public/js/`, now an ES module) is a single module holding enums, limits, validation, scoring and transitions. The React app imports it; the server loads it with `require` (Node 22.12+ can `require` an ES module).
**Consequences.** + Rules can't drift apart, and one test suite covers both. − The module must stay free of runtime-specific APIs.

### ADR-003 — JSON file store for MVP behind a repository interface

**Context.** Expected volume is hundreds of requests per year. A database adds provisioning, credentials and cost before the process is proven.
**Decision.** Keep requests in memory and persist them to one JSON file with atomic temp-file-then-rename writes, serialised through a promise queue. All access goes through `Store` (`list/get/insert/save`).
**Consequences.** + Nothing to provision, and backup is a file copy. − Only one instance can run, and there is no concurrent-writer safety across processes. Phase 2 moves to PostgreSQL behind the same interface.

### ADR-004 — Ship MVP without in-app auth

**Context.** SSO needs an IT app registration, which has a lead time. The pilot is internal.
**Decision.** Deploy behind the existing SSO reverse proxy / VPN. Triage identifies itself through the "Acting as" field, which is recorded in history.
**Consequences.** + Unblocks the pilot. − Anyone who can reach the app can triage, and "actor" is self-declared. **This must not reach company-wide rollout without Phase 2 SSO (story "SSO login").**

### ADR-005 — Additive, explainable priority score

**Context.** Multiplicative models (RICE-style) are hard for business users to reason about and let a single zero dominate the result.
**Decision.** The score is reach (0–35) + value (0–35) + urgency (0–30) + a regulatory bonus (15), capped at 100, with fixed bands.
**Consequences.** + A requester can predict the result, and the form shows it live. − It is coarse. Effort is not included, because requesters can't estimate it; triage weighs effort in the meeting.

### ADR-007 — AI concept mocks generated asynchronously, rendered sandboxed

**Context.** Requesters struggle to describe UI ideas in prose, and triage often misreads them. A picture shown right after submission lets the requester confirm or correct the idea before anyone spends time on it.
**Decision.** On submit, queue a Claude request (`claude-opus-5`, effort `medium`, streaming, server-side refusal fallback). The prompt fences the request as data and asks for one self-contained HTML page with an "Assumptions" panel. The server extracts and sanitises the HTML, stores it beside the data file, and serves it under `CSP: sandbox; default-src 'none'` for display in `<iframe sandbox>`. Requester and triage can regenerate with feedback. The requester's name and email are not sent.
**Consequences.** + Faster shared understanding, and the Assumptions panel invites correction. − Per-submission API cost and a wait of up to about a minute; request content leaves the company boundary (switch off with `MOCKS=off`); mocks may look more "decided" than they are, so every mock is labelled AI-generated and not a commitment. Alternatives rejected: generating synchronously (blocks submission), and letting the model write React code (needs script execution, which is a much larger attack surface).

### ADR-009 — AI-guided conversational intake as the default

**Context.** Business users don't think in categories, reach buckets and urgency levels; the structured form made them translate their problem into our taxonomy up front, and the answers were often thin ("Needs Info" round trips).
**Decision.** `/` opens with one question, "What do you need?". Each message is a stateless Claude turn (`claude-opus-5`, effort `low`) with a structured-output schema whose enum fields are the real option lists. The model returns a reply, field updates and tap-to-answer suggestions; the server sanitises updates with the shared rules before merging. A live panel shows every field, editable at any time, with readiness decided by `validateRequest`. Identity fields are entered outside the chat and never sent to the model. The transcript is stored with the request. The classic form stays at `/form` and is served at `/` when the assistant is off.
**Consequences.** + Lower effort for requesters, more specific requests (the assistant pushes for numbers), and triage sees the reasoning behind a request. − One API call per message (cost and a few seconds' latency per turn); request text leaves the company boundary (`ASSIST=off` disables it); model quality needs periodic review (UAT-09). Alternatives rejected: a free-text box summarised once at the end (no chance to ask for missing specifics), and an agent that submits on the user's behalf (the requester must stay in control of what is submitted).

### ADR-008 — React front end on Lowe's Backyard design system

**Context.** The UI is moving to the company design system so it looks and behaves like other internal tools, and it has grown past what hand-written DOM code handles comfortably (ADR-001's own threshold).
**Decision.** React 18 + Vite in `web/`, using Backyard (`@lowes-tech/bds-react`, `bds-tokens`, `bds-icons` 1.0.0, MIT) for form controls, the stepper, table, modal, alerts and badges. App layout uses Backyard's `--bds-*` CSS tokens. React Router serves `/` and `/requests`. The Node server is unchanged apart from serving `web/dist` with an SPA fallback.
**Consequences.** + Consistent look, accessible components, faster UI work. − A build step and front-end dependencies. Backyard targets React 16/17 and styled-components 5 and was last published in 2022, so we pin React 18 and styled-components 5.3.11 and must re-check before upgrading React. Its published 1.0.0 packages declare peer ranges (>=2.9.0) they don't satisfy, and npm `overrides` don't fix peer ranges, so the project `.npmrc` sets `legacy-peer-deps=true`; react, react-dom and styled-components are listed explicitly instead of relying on peer auto-install. CSP now allows inline styles (styled-components); scripts remain same-origin only.

### ADR-006 — Transactional outbox for Jira and notifications (proposed)

**Context.** A status change must not fail because Jira or email is down, and it must not be lost either.
**Decision.** Write an `outbox_event` row in the same transaction as the status change. A worker delivers it with exponential backoff and moves it to a dead-letter queue after 8 attempts.
**Consequences.** + Reliable and observable. − Adds a worker process and a table. Delivery is eventually consistent, so the Jira key appears a few seconds after approval.
