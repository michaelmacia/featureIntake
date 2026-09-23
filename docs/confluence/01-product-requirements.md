# Feature Intake — Product Requirements (PRD)

| | |
|---|---|
| **Status** | Draft for review |
| **Version** | 0.1 (2026-09-23) |
| **Product owner** | _TBD_ |
| **Stakeholders** | Product Management, Engineering, Business unit leads, IT, Compliance |

## 1. Problem

Feature requests reach the product team through email, chat, hallway conversations and escalations. As a result:

- **Requests get lost.** No single list exists, and requesters chase for updates.
- **Requests are incomplete.** PMs spend the first meeting finding out what problem the requester has, who is affected and what it is worth.
- **Prioritisation is inconsistent.** The loudest or most senior voice wins, not the highest-value request.
- **There is no audit trail.** We cannot show auditors or leadership why a request was accepted or declined.

## 2. Goals and non-goals

**Goals**
1. One front door: 90% of new requests arrive through the form within 3 months of launch.
2. Complete on arrival: fewer than 15% of requests need a "Needs Info" round trip.
3. Fast response: 95% of requests get a first triage decision within 5 business days.
4. Consistent prioritisation: every request carries a transparent score and band.
5. Traceability: every decision has an actor, a timestamp and a reason.

**Non-goals (for now)**
- Delivery tracking after hand-off. Jira remains the delivery system of record.
- Portfolio planning or capacity management.
- Public or customer-facing idea portals.

## 3. Personas

| Persona | Needs | Pain today |
|---|---|---|
| **Priya, Finance manager (requester)** | Get a process fixed without learning product jargon | Doesn't know who to ask; never hears back |
| **Jordan, Product manager (triage)** | Complete, comparable requests; a queue to work through | Chases missing information; requests scattered across the inbox |
| **Morgan, VP Product (leader)** | See the demand, where it comes from and how fast we respond | No data; anecdotes only |
| **Sam, IT / compliance** | Know when requests touch regulated systems | Finds out late |

## 4. User journeys

1. **Submit.** Priya opens the form, enters her details, describes the problem and value, and picks systems, reach and urgency. She reviews her answers and submits. She receives a reference `FR-2026-0042` and an initial priority band. Within about a minute a **concept mock** of her idea appears below the confirmation. If it misses the point, she types "the approval step should happen in SAP, not Salesforce" and regenerates. Triage sees the same mock, so the first conversation starts from a shared picture.
2. **Triage.** Jordan filters the board to *Awaiting triage*, sorts by priority, opens the request, sets it to *In Review* and assigns it to himself. If something is missing, he moves it to *Needs Info* with a question.
3. **Decide.** At the weekly triage meeting the team approves (and links the Jira epic) or rejects (with a reason).
4. **Report.** Morgan checks the KPI tiles and exports CSV for the quarterly review.

## 5. Functional requirements

| ID | Requirement | Priority | Release |
|---|---|---|---|
| FR-01 | Guided 4-step intake form: About you, The request, Impact & urgency, Review | Must | MVP |
| FR-02 | Required fields: name, email, department, title, category, problem, business value, affected systems, people affected, $ impact, urgency | Must | MVP |
| FR-03 | Field validation identical on client and server with specific messages | Must | MVP |
| FR-04 | Critical urgency requires a justification and a target date | Must | MVP |
| FR-05 | Draft autosave on the device; restored on return | Should | MVP |
| FR-06 | Confirmation screen with reference number and initial priority | Must | MVP |
| FR-07 | Automatic priority score (0–100) and band (P1–P4) | Must | MVP |
| FR-08 | Triage board with search, status/department/priority filters and sortable columns | Must | MVP |
| FR-09 | KPI tiles: open, awaiting triage, needs info, open P1/P2 | Should | MVP |
| FR-10 | Request detail with full content and activity timeline | Must | MVP |
| FR-11 | Status workflow with allowed transitions only; note required for Needs Info / Rejected | Must | MVP |
| FR-12 | Assign owner; record Jira key | Must | MVP |
| FR-13 | CSV export of the filtered list | Should | MVP |
| FR-14 | SSO sign-in; requester details pre-filled | Must | Phase 2 |
| FR-15 | Auto-create Jira epic on approval | Should | Phase 2 |
| FR-16 | Email notifications on submit and status change | Must | Phase 2 |
| FR-17 | Teams/Slack alert for new P1 requests | Could | Phase 2 |
| FR-18 | "My requests" page; requester can answer Needs Info | Should | Phase 2 |
| FR-19 | Attachments (screenshots, spreadsheets) up to 10 MB | Could | Phase 2 |
| FR-20 | Duplicate detection: suggest similar existing requests while typing the title | Could | Later |
| FR-21 | After submission, generate an AI concept mock UI of the idea. Show it on the confirmation screen and in triage, labelled as AI-generated and not a commitment | Should | MVP |
| FR-22 | Requester and triage can regenerate the mock with written feedback. Each regeneration is recorded in history | Should | MVP |

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Usability | Median time to submit ≤ 5 minutes; works on phone (360 px) and desktop |
| Accessibility | WCAG 2.1 AA |
| Performance | API p95 < 300 ms for lists up to 10k requests; first page load < 1.5 s on corporate network |
| Availability | 99.5% business hours (MVP), 99.9% (Phase 2) |
| Security | CSP, no inline script, server-side validation, input size limits, SSO in Phase 2 |
| Privacy | Personal data limited to name and work email; 3-year retention after closure |
| Auditability | Every status and ownership change is recorded with actor and time |
| Browser support | Last 2 versions of Edge, Chrome, Firefox, Safari |

## 7. Form content

| Step | Field | Type | Rules |
|---|---|---|---|
| About you | Your name | text | required, 2–100 |
| | Work email | email | required, valid format, lower-cased |
| | Department | select | required, from list |
| The request | Request title | text | required, 5–120 |
| | Category | select | required |
| | Problem statement | textarea | required, 20–4000 |
| | Proposed solution | textarea | optional, ≤ 4000 |
| | Affected systems | multi-select chips | at least 1 |
| Impact & urgency | Business value | textarea | required, 20–4000 |
| | Success metrics | textarea | optional, ≤ 2000 |
| | People affected | select | required: 1-10, 11-50, 51-250, 251-1000, 1000+ |
| | Annual $ impact | select | required: None … > $1M |
| | Urgency | select | required: Low, Medium, High, Critical |
| | Needed by | date | optional, today or later; required if Critical |
| | Why critical | textarea | shown and required (≥ 10) if Critical |
| | Regulatory driver | checkbox | optional |
| Review | — | read-only | Edit links back to each step |

Screenshots: `docs/mocks/screenshots/`. Phase 2 mockups: `docs/mocks/wireframes.html`.

## 8. Success metrics

| Metric | Baseline | Target (3 months) | Source |
|---|---|---|---|
| Share of requests via form | ~0% | ≥ 90% | Form count vs. PM inbox sample |
| Needs Info rate | unknown | < 15% | `/api/stats` byStatus + history |
| Time to first decision (p95) | unknown | ≤ 5 business days | history timestamps |
| Requester satisfaction | — | ≥ 4/5 | post-decision survey (Phase 2) |

## 9. Release plan

| Release | Scope | Target |
|---|---|---|
| **MVP** | Epics E1–E4 (form, board, API/scoring, quality/ops); behind VPN/SSO proxy; pilot with Finance and Sales | Sprint 1–3 |
| **Phase 2** | Epic E5 (SSO, Jira, notifications, My requests, Postgres); company-wide rollout | Sprint 4–6 |

## 10. Assumptions, dependencies, open questions

**Assumptions**
- Triage meets weekly. PMs work the board daily.
- Jira project `FEAT` exists with *Epic* and *Story* issue types.

**Dependencies**
- IT: OIDC app registration (Phase 2).
- Jira admin: API token and project permissions (Phase 2).

**Open questions**
1. Should requesters see other people's requests (transparency) or only their own?
2. Do we allow anonymous submissions? Current answer: no, email is required.
3. Who can override the priority band, and should overrides be a field rather than a note?
4. How long should Needs Info wait before auto-closing? Proposal: 10 business days.
