# Feature Intake — Decision Log

| ID | Decision | Status | Date |
|---|---|---|---|
| ADR-001 | Zero-dependency Node.js server with vanilla JS front end | Accepted | 2026-09-23 |
| ADR-002 | One rules module shared by browser and server | Accepted | 2026-09-23 |
| ADR-003 | JSON file store for MVP behind a repository interface | Accepted | 2026-09-23 |
| ADR-004 | Ship MVP without in-app auth, behind SSO proxy / VPN | Accepted (temporary) | 2026-09-23 |
| ADR-005 | Additive, explainable priority score | Accepted | 2026-09-23 |
| ADR-006 | Transactional outbox for Jira and notifications | Proposed (Phase 2) | 2026-09-23 |

---

### ADR-001 — Zero-dependency Node.js server with vanilla JS front end

**Context.** The app is two screens and about ten endpoints. The team wants something any developer can run immediately and that has no supply-chain surface to patch.
**Decision.** Use Node's built-in `http`, `fs` and `node:test`, with plain HTML/CSS/JS in the browser. No framework and no build step.
**Consequences.** + No `npm install`, nothing to patch, and fast startup. − Routing and DOM helpers are hand-written (about 50 lines). If the UI grows past about 5 screens, revisit this and consider React or Vue with Vite.

### ADR-002 — One rules module shared by browser and server

**Context.** Validation that differs between client and server causes "the form said OK but submit failed" bugs.
**Decision.** `public/js/rules.js` is a UMD module holding enums, limits, validation, scoring and transitions. The browser loads it with a script tag; the server loads it with `require`.
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

### ADR-006 — Transactional outbox for Jira and notifications (proposed)

**Context.** A status change must not fail because Jira or email is down, and it must not be lost either.
**Decision.** Write an `outbox_event` row in the same transaction as the status change. A worker delivers it with exponential backoff and moves it to a dead-letter queue after 8 attempts.
**Consequences.** + Reliable and observable. − Adds a worker process and a table. Delivery is eventually consistent, so the Jira key appears a few seconds after approval.
