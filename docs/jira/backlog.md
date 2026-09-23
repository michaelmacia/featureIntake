# Feature Intake — Jira Backlog

> Generated from `docs/jira/backlog.js`. Import `jira-import.csv` via **Jira settings → System → External System Import → CSV**.
> Map columns: *Issue Id → Issue Id*, *Parent Id → Parent* (links stories to epics), each *Labels* column → Labels, *Story Points → Story point estimate*, *Epic Name* → Epic Name (company-managed projects only; ignore it for team-managed).

| Epic | Release | Stories | Points |
|---|---|---|---|
| Intake Form | MVP | 7 | 19 |
| Triage Board | MVP | 7 | 21 |
| Platform, API & Scoring | MVP | 4 | 14 |
| Quality & Operations | MVP | 4 | 10 |
| Integrations & Notifications | Phase 2 | 6 | 23 |
| AI Concept Mocks | MVP | 6 | 18 |
| **Total** | | **34** | **105** |

## Intake Form _(MVP)_

Business users can submit a complete, validated feature request in under 5 minutes.

### Multi-step intake wizard

**Priority:** High · **Points:** 5 · **Labels:** frontend, intake

> As a business user I want the form split into short steps so that I am not overwhelmed and can see my progress.

**Acceptance criteria**

- [ ] Given I open the intake page, then I see 4 steps: About you, The request, Impact & urgency, Review
- [ ] Given I am on a step with missing required fields, when I click Continue, then I stay on the step and see errors
- [ ] Given I am on step 2 or later, when I click Back, then my entered values are preserved
- [ ] The stepper shows the current step (aria-current="step") and completed steps

### Client-side validation with accessible error summary

**Priority:** High · **Points:** 3 · **Labels:** frontend, intake, a11y

> As a business user I want clear, specific error messages so that I can fix problems quickly.

**Acceptance criteria**

- [ ] Validation rules are shared with the server (single rules module)
- [ ] An error summary lists every problem with links to the fields and receives focus
- [ ] Each invalid field has aria-invalid and aria-describedby pointing to its message
- [ ] Errors re-validate on blur and as I type after a field has been touched

### Autosave draft on the device

**Priority:** Medium · **Points:** 2 · **Labels:** frontend, intake

> As a business user I want my draft saved automatically so that I do not lose work if I close the tab.

**Acceptance criteria**

- [ ] Form values are saved to localStorage 400ms after the last change
- [ ] Reopening the page restores the draft and shows "Restored your draft"
- [ ] The draft is cleared after a successful submission
- [ ] If storage is unavailable the form still works

### Conditional fields for Critical urgency

**Priority:** Medium · **Points:** 2 · **Labels:** frontend, intake, rules

> As a triage lead I want Critical requests to include a justification and date so that urgency claims can be verified.

**Acceptance criteria**

- [ ] When urgency is Critical, a "Why is this critical?" field appears and is required (min 10 chars)
- [ ] When urgency is Critical, target date becomes required
- [ ] The server enforces the same rule (422 with field errors)

### Review step and submission confirmation

**Priority:** High · **Points:** 3 · **Labels:** frontend, intake

> As a business user I want to review my answers and receive a reference number so that I can follow up.

**Acceptance criteria**

- [ ] Review step shows every answered field with an Edit link back to its step
- [ ] Review step shows the initial priority band and score
- [ ] After submit I see my reference (FR-YYYY-NNNN) and priority band
- [ ] Server-side validation errors are shown if submission is rejected

### Live priority estimate

**Priority:** Low · **Points:** 1 · **Labels:** frontend, intake

> As a business user I want to see how my impact answers affect priority so that I understand how requests are ranked.

**Acceptance criteria**

- [ ] Once people affected, $ impact and urgency are chosen, the estimate appears under the fields
- [ ] The estimate states that triage may adjust it

### Accessibility and responsive layout (WCAG 2.1 AA)

**Priority:** High · **Points:** 3 · **Labels:** frontend, a11y

> As a user of assistive technology or a phone I want the form to be fully usable so that I can submit requests too.

**Acceptance criteria**

- [ ] All controls are keyboard-operable with visible focus
- [ ] Layout works at 360px width without horizontal scrolling
- [ ] Colour contrast meets 4.5:1 for text in light and dark themes
- [ ] axe-core scan reports zero critical or serious issues

## Triage Board _(MVP)_

Product triage can review, prioritise, route and track every request in one place.

### Triage board list with filters and search

**Priority:** High · **Points:** 5 · **Labels:** frontend, triage

> As a triage lead I want to filter and search requests so that I can focus on what needs attention.

**Acceptance criteria**

- [ ] Filter by status (including "All open"), department and priority band
- [ ] Free-text search across ID, title, problem, requester and Jira key
- [ ] Filters combine (AND) and the list updates without reloading the page
- [ ] Empty state is shown when nothing matches

### Sortable columns

**Priority:** Medium · **Points:** 2 · **Labels:** frontend, triage

> As a triage lead I want to sort by priority, date and status so that I can work top-down.

**Acceptance criteria**

- [ ] Clicking a column header sorts descending, clicking again sorts ascending
- [ ] The active sort column exposes aria-sort

### KPI summary tiles

**Priority:** Medium · **Points:** 2 · **Labels:** frontend, triage

> As a product leader I want headline counts so that I can see the state of the intake queue at a glance.

**Acceptance criteria**

- [ ] Tiles show open requests, awaiting triage, needs info, open P1 (with open P2 as a sub-label)
- [ ] Counts come from GET /api/stats and refresh when the list reloads

### Request detail view

**Priority:** High · **Points:** 3 · **Labels:** frontend, triage

> As a triage lead I want to see the full request and its history so that I can make a decision.

**Acceptance criteria**

- [ ] Clicking or pressing Enter on a row opens a modal with all fields
- [ ] The URL hash holds the request ID so a detail view can be linked directly
- [ ] Activity timeline shows status changes, field changes and notes newest first

### Status workflow transitions

**Priority:** Highest · **Points:** 5 · **Labels:** frontend, backend, workflow

> As a triage lead I want to move requests through a defined workflow so that status is consistent and auditable.

**Acceptance criteria**

- [ ] Status dropdown only offers transitions allowed from the current status
- [ ] Moving to Rejected or Needs Info requires a note
- [ ] Illegal transitions are rejected by the API with 422
- [ ] Every change is appended to history with actor and timestamp

### Assign owner and link Jira key

**Priority:** Medium · **Points:** 2 · **Labels:** frontend, backend, triage

> As a triage lead I want to record an owner and the delivery ticket so that requesters can be pointed to progress.

**Acceptance criteria**

- [ ] Assignee is free text up to 80 characters
- [ ] Jira key must match PROJECT-123 format
- [ ] Both changes are recorded in history

### CSV export of filtered list

**Priority:** Medium · **Points:** 2 · **Labels:** backend, triage, reporting

> As a product ops analyst I want to export requests so that I can report on them in Excel or BI tools.

**Acceptance criteria**

- [ ] Export honours the current filters and sort
- [ ] File is UTF-8 with BOM so Excel opens accents correctly
- [ ] Cells starting with = + - @ are prefixed to prevent formula injection

## Platform, API & Scoring _(MVP)_

REST API, persistence, priority scoring and baseline security for the intake service.

### REST API for requests

**Priority:** Highest · **Points:** 5 · **Labels:** backend, api

> As a developer I want a documented REST API so that the UI and future integrations share one backend.

**Acceptance criteria**

- [ ] Endpoints match docs/api/openapi.yaml
- [ ] POST returns 201 with Location header; validation errors return 422 with per-field messages
- [ ] Malformed JSON 400, wrong content type 415, body > 100KB 413
- [ ] Clients cannot set server-owned fields (id, status, score, history)

### Priority scoring engine

**Priority:** High · **Points:** 3 · **Labels:** backend, rules

> As a product leader I want every request scored the same way so that prioritisation is transparent.

**Acceptance criteria**

- [ ] Score = reach (0-35) + value (0-35) + urgency (0-30) + regulatory bonus (15), capped at 100
- [ ] Bands: P1 >= 75, P2 >= 55, P3 >= 35, else P4
- [ ] Scoring is unit-tested at band boundaries

### Persistence layer with atomic writes

**Priority:** High · **Points:** 3 · **Labels:** backend, data

> As an operator I want data written safely so that a crash never corrupts the request store.

**Acceptance criteria**

- [ ] Writes go to a temp file then rename
- [ ] Concurrent writes are serialised
- [ ] IDs are sequential per store and continue after seeded data

### Security baseline

**Priority:** Highest · **Points:** 3 · **Labels:** backend, security

> As the security team I want standard protections in place so that the app passes review.

**Acceptance criteria**

- [ ] CSP, X-Frame-Options, nosniff and Referrer-Policy headers on every response
- [ ] Static file serving blocks path traversal
- [ ] All user text rendered with textContent (no innerHTML)
- [ ] Control characters stripped from input

## Quality & Operations _(MVP)_

Automated tests, CI, deployment and monitoring so the service can run in production.

### Automated unit and API tests

**Priority:** High · **Points:** 3 · **Labels:** quality

> As a developer I want a fast test suite so that I can change the code with confidence.

**Acceptance criteria**

- [ ] npm test runs rules and API tests with no external dependencies
- [ ] Every case in test-data/invalid-payloads.json is asserted to fail with the expected fields
- [ ] Tests run in under 5 seconds

### CI pipeline

**Priority:** Medium · **Points:** 2 · **Labels:** devops

> As a developer I want tests to run on every pull request so that regressions are caught before merge.

**Acceptance criteria**

- [ ] Pipeline runs npm test on Node 20 and 22
- [ ] PR cannot merge when tests fail

### Containerise and deploy to staging

**Priority:** Medium · **Points:** 3 · **Labels:** devops

> As an operator I want a repeatable deployment so that staging and production match.

**Acceptance criteria**

- [ ] Dockerfile builds a non-root image
- [ ] DATA_FILE is on a mounted volume
- [ ] Health check uses GET /api/health

### Monitoring and alerting

**Priority:** Medium · **Points:** 2 · **Labels:** devops, observability

> As an operator I want to know when the service is down or erroring so that I can respond before users notice.

**Acceptance criteria**

- [ ] Uptime check on /api/health every minute
- [ ] Alert when 5xx rate > 1% over 5 minutes
- [ ] Structured request logs shipped to central logging

## Integrations & Notifications _(Phase 2)_

SSO, Jira sync, email/Teams notifications and a requester self-service view.

### SSO login with Azure AD / Okta

**Priority:** Highest · **Points:** 5 · **Labels:** security, integration

> As a business user I want to sign in with my company account so that my name and email are pre-filled and verified.

**Acceptance criteria**

- [ ] Unauthenticated users are redirected to the IdP (OIDC)
- [ ] Requester name, email and department come from the ID token
- [ ] Triage board requires the "intake-triage" group

### Auto-create Jira epic on approval

**Priority:** High · **Points:** 5 · **Labels:** integration, jira

> As a triage lead I want approving a request to create a Jira epic so that I do not re-key it.

**Acceptance criteria**

- [ ] Moving to Approved creates an epic in the configured project with the request content
- [ ] The Jira key is saved on the request
- [ ] Failures are retried and surfaced on the request without blocking the status change

### Email notifications to requester

**Priority:** High · **Points:** 3 · **Labels:** integration, notifications

> As a business user I want an email when my request is received or changes status so that I do not have to chase.

**Acceptance criteria**

- [ ] Emails sent on submit, Needs Info (with the question), Approved, Rejected (with reason) and Done
- [ ] Emails include the reference and a link to the request
- [ ] Templates match docs/mocks/wireframes.html

### Teams/Slack alert for P1 submissions

**Priority:** Medium · **Points:** 2 · **Labels:** integration, notifications

> As a triage lead I want P1 requests posted to our channel so that urgent items are seen the same day.

**Acceptance criteria**

- [ ] Webhook fires when a new request scores P1
- [ ] Message includes title, department, score and a link

### My requests page for requesters

**Priority:** Medium · **Points:** 3 · **Labels:** frontend, intake

> As a business user I want to see all my requests and their status so that I know what is happening.

**Acceptance criteria**

- [ ] Lists requests where requesterEmail matches the signed-in user
- [ ] Requester can answer a Needs Info question, which moves the request back to In Review

### Migrate storage to PostgreSQL

**Priority:** Medium · **Points:** 5 · **Labels:** backend, data

> As an operator I want a managed database so that the service can scale beyond one instance and be backed up.

**Acceptance criteria**

- [ ] Repository interface unchanged; JSON store kept for local development
- [ ] One-off migration script imports the JSON file
- [ ] Point-in-time recovery enabled

## AI Concept Mocks _(MVP)_

Every submission gets an AI-generated concept mock UI that the requester and triage can see and refine.

### Generate a concept mock on submission

**Priority:** High · **Points:** 5 · **Labels:** backend, ai

> As a business user I want to see a sketch of my idea right after I submit it so that I can check the product team will understand it.

**Acceptance criteria**

- [ ] Submitting never waits on the mock; the request is created with mock.status = pending
- [ ] A background queue (2 concurrent) calls claude-opus-5 with the request fenced as data; name and email are not sent
- [ ] The reply HTML is extracted, sanitised and stored; status becomes ready or failed with a readable reason
- [ ] Pending mocks resume after a server restart
- [ ] Feature is off without ANTHROPIC_API_KEY or with MOCKS=off, and the UI hides it

### Show the mock on the confirmation screen

**Priority:** High · **Points:** 3 · **Labels:** frontend, ai

> As a business user I want the mock to appear below my confirmation so that I do not have to go looking for it.

**Acceptance criteria**

- [ ] A "Sketching a concept mock" state shows while pending (polls every 3s)
- [ ] The ready mock renders at desktop width, scaled to fit, with an Open full size link
- [ ] The panel is labelled AI-generated and not a design commitment

### Regenerate the mock with feedback

**Priority:** Medium · **Points:** 3 · **Labels:** frontend, backend, ai

> As a requester or triage PM I want to say what is wrong with the mock and get a new one so that it matches the intent.

**Acceptance criteria**

- [ ] Feedback (up to 1000 chars) is sent to the model with the request
- [ ] Only one generation per request at a time (409 otherwise)
- [ ] Each regeneration is recorded in the request history with the actor

### Show the mock in the triage detail view

**Priority:** Medium · **Points:** 2 · **Labels:** frontend, triage, ai

> As a triage PM I want to see the same mock the requester saw so that we discuss the same picture.

**Acceptance criteria**

- [ ] Detail dialog shows mock status, the mock, and regenerate controls
- [ ] Requests created before the feature was on offer a Generate concept mock button

### Sandbox generated HTML

**Priority:** Highest · **Points:** 3 · **Labels:** security, ai

> As the security team I want AI-generated HTML isolated so that a crafted request cannot attack users.

**Acceptance criteria**

- [ ] Scripts, event handlers, iframes, forms, external URLs and meta refresh are stripped
- [ ] mock.html is served with CSP "sandbox; default-src 'none'" and frame-ancestors 'self'
- [ ] The UI embeds it only in <iframe sandbox> with no allow flags
- [ ] Tests cover each stripped construct

### Mock cost and quality monitoring

**Priority:** Low · **Points:** 2 · **Labels:** observability, ai

> As the product owner I want to see mock usage and failures so that I can manage cost and quality.

**Acceptance criteria**

- [ ] Token usage and duration are logged per mock
- [ ] Weekly count of generated, regenerated and failed mocks
- [ ] Sample 20 mocks a month for a quality review; tune MOCK_EFFORT or the prompt
