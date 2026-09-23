# Feature Intake

**One front door for every feature request.** Business users submit ideas through a short guided form. Product triage reviews each one within 5 business days, scores it the same way, and routes it into the delivery backlog.

| | |
|---|---|
| **App (local)** | `http://localhost:3000` (form) · `http://localhost:3000/requests` (triage board) |
| **Product owner** | _TBD_ |
| **Engineering lead** | _TBD_ |
| **Jira project** | `FEAT` (import: `docs/jira/jira-import.csv`) |
| **Status** | MVP built, Phase 2 planned |

![Triage board](../mocks/screenshots/triage-board.png)

## Page tree

| Page | What's in it | Audience |
|---|---|---|
| [01 · Product Requirements (PRD)](01-product-requirements.md) | Problem, goals, personas, requirements, scope, success metrics | Everyone |
| [02 · Solution Architecture](02-solution-architecture.md) | Context, components, sequences, lifecycle, target state, security | Engineering, Architecture |
| [03 · API Reference](03-api-reference.md) | Endpoints, examples, error model | Engineering, integrators |
| [04 · Data Model](04-data-model.md) | Fields, enums, ERD for Phase 2 | Engineering, Data |
| [05 · Intake & Triage Process](05-intake-and-triage-process.md) | How to submit, how triage works, SLAs, RACI | Business users, PMs |
| [06 · Test Strategy](06-test-strategy.md) | Test levels, test data, UAT scripts | QA, Engineering |
| [07 · Runbook](07-runbook.md) | Run, deploy, back up, troubleshoot | Operations |
| [08 · Decision Log](08-decision-log.md) | Architecture decision records | Engineering |

## Other artefacts in the repository

| Artefact | Location |
|---|---|
| Jira epics & stories (CSV import + readable backlog) | `docs/jira/` |
| OpenAPI 3 spec | `docs/api/openapi.yaml` |
| Architecture diagram sources (Mermaid) | `docs/architecture/*.mmd` |
| UI screenshots and Phase 2 mockups | `docs/mocks/` |
| Test data (seed, CSV, valid/edge/invalid payloads) | `test-data/` |

## At a glance

- **For requesters:** 4 short steps, about 5 minutes. Drafts save automatically. You get a reference number such as `FR-2026-0042`.
- **For triage:** a filterable board, an automatic priority score (P1–P4), a guarded status workflow, a full audit trail, and CSV export.
- **Next (Phase 2):** SSO, auto-created Jira epics, email/Teams notifications, a "My requests" page for requesters, and PostgreSQL.
