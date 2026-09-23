'use strict';
/*
 * Single source for the Jira backlog. Run `node docs/jira/backlog.js` to regenerate:
 *   jira-import.csv  -> Jira CSV importer (System > External System Import > CSV)
 *   backlog.md       -> human-readable backlog for Confluence / review
 * Descriptions use Jira wiki markup so they render correctly after import.
 */
const fs = require('node:fs');
const path = require('node:path');

const EPICS = [
  { key: 'E1', name: 'Intake Form', release: 'MVP', summary: 'Business users can submit a complete, validated feature request in under 5 minutes.' },
  { key: 'E2', name: 'Triage Board', release: 'MVP', summary: 'Product triage can review, prioritise, route and track every request in one place.' },
  { key: 'E3', name: 'Platform, API & Scoring', release: 'MVP', summary: 'REST API, persistence, priority scoring and baseline security for the intake service.' },
  { key: 'E4', name: 'Quality & Operations', release: 'MVP', summary: 'Automated tests, CI, deployment and monitoring so the service can run in production.' },
  { key: 'E5', name: 'Integrations & Notifications', release: 'Phase 2', summary: 'SSO, Jira sync, email/Teams notifications and a requester self-service view.' },
];

// [epic, summary, points, priority, labels, story, acceptance criteria[]]
const STORIES = [
  ['E1', 'Multi-step intake wizard', 5, 'High', 'frontend,intake',
    'As a business user I want the form split into short steps so that I am not overwhelmed and can see my progress.',
    ['Given I open the intake page, then I see 4 steps: About you, The request, Impact & urgency, Review',
      'Given I am on a step with missing required fields, when I click Continue, then I stay on the step and see errors',
      'Given I am on step 2 or later, when I click Back, then my entered values are preserved',
      'The stepper shows the current step (aria-current="step") and completed steps']],
  ['E1', 'Client-side validation with accessible error summary', 3, 'High', 'frontend,intake,a11y',
    'As a business user I want clear, specific error messages so that I can fix problems quickly.',
    ['Validation rules are shared with the server (single rules module)',
      'An error summary lists every problem with links to the fields and receives focus',
      'Each invalid field has aria-invalid and aria-describedby pointing to its message',
      'Errors re-validate on blur and as I type after a field has been touched']],
  ['E1', 'Autosave draft on the device', 2, 'Medium', 'frontend,intake',
    'As a business user I want my draft saved automatically so that I do not lose work if I close the tab.',
    ['Form values are saved to localStorage 400ms after the last change',
      'Reopening the page restores the draft and shows "Restored your draft"',
      'The draft is cleared after a successful submission',
      'If storage is unavailable the form still works']],
  ['E1', 'Conditional fields for Critical urgency', 2, 'Medium', 'frontend,intake,rules',
    'As a triage lead I want Critical requests to include a justification and date so that urgency claims can be verified.',
    ['When urgency is Critical, a "Why is this critical?" field appears and is required (min 10 chars)',
      'When urgency is Critical, target date becomes required',
      'The server enforces the same rule (422 with field errors)']],
  ['E1', 'Review step and submission confirmation', 3, 'High', 'frontend,intake',
    'As a business user I want to review my answers and receive a reference number so that I can follow up.',
    ['Review step shows every answered field with an Edit link back to its step',
      'Review step shows the initial priority band and score',
      'After submit I see my reference (FR-YYYY-NNNN) and priority band',
      'Server-side validation errors are shown if submission is rejected']],
  ['E1', 'Live priority estimate', 1, 'Low', 'frontend,intake',
    'As a business user I want to see how my impact answers affect priority so that I understand how requests are ranked.',
    ['Once people affected, $ impact and urgency are chosen, the estimate appears under the fields',
      'The estimate states that triage may adjust it']],
  ['E1', 'Accessibility and responsive layout (WCAG 2.1 AA)', 3, 'High', 'frontend,a11y',
    'As a user of assistive technology or a phone I want the form to be fully usable so that I can submit requests too.',
    ['All controls are keyboard-operable with visible focus',
      'Layout works at 360px width without horizontal scrolling',
      'Colour contrast meets 4.5:1 for text in light and dark themes',
      'axe-core scan reports zero critical or serious issues']],

  ['E2', 'Triage board list with filters and search', 5, 'High', 'frontend,triage',
    'As a triage lead I want to filter and search requests so that I can focus on what needs attention.',
    ['Filter by status (including "All open"), department and priority band',
      'Free-text search across ID, title, problem, requester and Jira key',
      'Filters combine (AND) and the list updates without reloading the page',
      'Empty state is shown when nothing matches']],
  ['E2', 'Sortable columns', 2, 'Medium', 'frontend,triage',
    'As a triage lead I want to sort by priority, date and status so that I can work top-down.',
    ['Clicking a column header sorts descending, clicking again sorts ascending',
      'The active sort column exposes aria-sort']],
  ['E2', 'KPI summary tiles', 2, 'Medium', 'frontend,triage',
    'As a product leader I want headline counts so that I can see the state of the intake queue at a glance.',
    ['Tiles show open requests, awaiting triage, needs info, open P1 (with open P2 as a sub-label)',
      'Counts come from GET /api/stats and refresh when the list reloads']],
  ['E2', 'Request detail view', 3, 'High', 'frontend,triage',
    'As a triage lead I want to see the full request and its history so that I can make a decision.',
    ['Clicking or pressing Enter on a row opens a modal with all fields',
      'The URL hash holds the request ID so a detail view can be linked directly',
      'Activity timeline shows status changes, field changes and notes newest first']],
  ['E2', 'Status workflow transitions', 5, 'Highest', 'frontend,backend,workflow',
    'As a triage lead I want to move requests through a defined workflow so that status is consistent and auditable.',
    ['Status dropdown only offers transitions allowed from the current status',
      'Moving to Rejected or Needs Info requires a note',
      'Illegal transitions are rejected by the API with 422',
      'Every change is appended to history with actor and timestamp']],
  ['E2', 'Assign owner and link Jira key', 2, 'Medium', 'frontend,backend,triage',
    'As a triage lead I want to record an owner and the delivery ticket so that requesters can be pointed to progress.',
    ['Assignee is free text up to 80 characters',
      'Jira key must match PROJECT-123 format',
      'Both changes are recorded in history']],
  ['E2', 'CSV export of filtered list', 2, 'Medium', 'backend,triage,reporting',
    'As a product ops analyst I want to export requests so that I can report on them in Excel or BI tools.',
    ['Export honours the current filters and sort',
      'File is UTF-8 with BOM so Excel opens accents correctly',
      'Cells starting with = + - @ are prefixed to prevent formula injection']],

  ['E3', 'REST API for requests', 5, 'Highest', 'backend,api',
    'As a developer I want a documented REST API so that the UI and future integrations share one backend.',
    ['Endpoints match docs/api/openapi.yaml',
      'POST returns 201 with Location header; validation errors return 422 with per-field messages',
      'Malformed JSON 400, wrong content type 415, body > 100KB 413',
      'Clients cannot set server-owned fields (id, status, score, history)']],
  ['E3', 'Priority scoring engine', 3, 'High', 'backend,rules',
    'As a product leader I want every request scored the same way so that prioritisation is transparent.',
    ['Score = reach (0-35) + value (0-35) + urgency (0-30) + regulatory bonus (15), capped at 100',
      'Bands: P1 >= 75, P2 >= 55, P3 >= 35, else P4',
      'Scoring is unit-tested at band boundaries']],
  ['E3', 'Persistence layer with atomic writes', 3, 'High', 'backend,data',
    'As an operator I want data written safely so that a crash never corrupts the request store.',
    ['Writes go to a temp file then rename',
      'Concurrent writes are serialised',
      'IDs are sequential per store and continue after seeded data']],
  ['E3', 'Security baseline', 3, 'Highest', 'backend,security',
    'As the security team I want standard protections in place so that the app passes review.',
    ['CSP, X-Frame-Options, nosniff and Referrer-Policy headers on every response',
      'Static file serving blocks path traversal',
      'All user text rendered with textContent (no innerHTML)',
      'Control characters stripped from input']],

  ['E4', 'Automated unit and API tests', 3, 'High', 'quality',
    'As a developer I want a fast test suite so that I can change the code with confidence.',
    ['npm test runs rules and API tests with no external dependencies',
      'Every case in test-data/invalid-payloads.json is asserted to fail with the expected fields',
      'Tests run in under 5 seconds']],
  ['E4', 'CI pipeline', 2, 'Medium', 'devops',
    'As a developer I want tests to run on every pull request so that regressions are caught before merge.',
    ['Pipeline runs npm test on Node 20 and 22', 'PR cannot merge when tests fail']],
  ['E4', 'Containerise and deploy to staging', 3, 'Medium', 'devops',
    'As an operator I want a repeatable deployment so that staging and production match.',
    ['Dockerfile builds a non-root image', 'DATA_FILE is on a mounted volume', 'Health check uses GET /api/health']],
  ['E4', 'Monitoring and alerting', 2, 'Medium', 'devops,observability',
    'As an operator I want to know when the service is down or erroring so that I can respond before users notice.',
    ['Uptime check on /api/health every minute', 'Alert when 5xx rate > 1% over 5 minutes', 'Structured request logs shipped to central logging']],

  ['E5', 'SSO login with Azure AD / Okta', 5, 'Highest', 'security,integration',
    'As a business user I want to sign in with my company account so that my name and email are pre-filled and verified.',
    ['Unauthenticated users are redirected to the IdP (OIDC)',
      'Requester name, email and department come from the ID token',
      'Triage board requires the "intake-triage" group']],
  ['E5', 'Auto-create Jira epic on approval', 5, 'High', 'integration,jira',
    'As a triage lead I want approving a request to create a Jira epic so that I do not re-key it.',
    ['Moving to Approved creates an epic in the configured project with the request content',
      'The Jira key is saved on the request',
      'Failures are retried and surfaced on the request without blocking the status change']],
  ['E5', 'Email notifications to requester', 3, 'High', 'integration,notifications',
    'As a business user I want an email when my request is received or changes status so that I do not have to chase.',
    ['Emails sent on submit, Needs Info (with the question), Approved, Rejected (with reason) and Done',
      'Emails include the reference and a link to the request',
      'Templates match docs/mocks/wireframes.html']],
  ['E5', 'Teams/Slack alert for P1 submissions', 2, 'Medium', 'integration,notifications',
    'As a triage lead I want P1 requests posted to our channel so that urgent items are seen the same day.',
    ['Webhook fires when a new request scores P1', 'Message includes title, department, score and a link']],
  ['E5', 'My requests page for requesters', 3, 'Medium', 'frontend,intake',
    'As a business user I want to see all my requests and their status so that I know what is happening.',
    ['Lists requests where requesterEmail matches the signed-in user',
      'Requester can answer a Needs Info question, which moves the request back to In Review']],
  ['E5', 'Migrate storage to PostgreSQL', 5, 'Medium', 'backend,data',
    'As an operator I want a managed database so that the service can scale beyond one instance and be backed up.',
    ['Repository interface unchanged; JSON store kept for local development',
      'One-off migration script imports the JSON file',
      'Point-in-time recovery enabled']],
];

const toWiki = (s) => [
  `h4. User story`, s[5], '',
  `h4. Acceptance criteria`, ...s[6].map((a) => `* ${a}`), '',
  `h4. Definition of done`, '* Code reviewed and merged', '* Tests added/updated and passing', '* Docs updated if behaviour changed',
].join('\n');

const csvCell = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
// Jira's CSV importer takes multiple labels as repeated "Labels" columns.
const labelsOf = (s) => ['feature-intake', ...s[4].split(',')];
const LABEL_COLS = Math.max(...STORIES.map((s) => labelsOf(s).length));
const padLabels = (list) => [...list, ...Array(LABEL_COLS - list.length).fill('')];
const header = ['Issue Id', 'Parent Id', 'Issue Type', 'Summary', 'Epic Name', 'Description', 'Priority', 'Story Points', 'Fix Version/s', ...Array(LABEL_COLS).fill('Labels')];
const rows = [header];
EPICS.forEach((e, i) => rows.push([i + 1, '', 'Epic', e.name, e.name, e.summary, 'High', '', e.release, ...padLabels(['feature-intake'])]));
STORIES.forEach((s, i) => {
  const epicIdx = EPICS.findIndex((e) => e.key === s[0]);
  rows.push([100 + i, epicIdx + 1, 'Story', s[1], '', toWiki(s), s[3], s[2], EPICS[epicIdx].release, ...padLabels(labelsOf(s))]);
});
fs.writeFileSync(path.join(__dirname, 'jira-import.csv'), rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');

// Markdown
const md = ['# Feature Intake — Jira Backlog', '',
  '> Generated from `docs/jira/backlog.js`. Import `jira-import.csv` via **Jira settings → System → External System Import → CSV**.',
  '> Map columns: *Issue Id → Issue Id*, *Parent Id → Parent* (links stories to epics), each *Labels* column → Labels, *Story Points → Story point estimate*, *Epic Name* → Epic Name (company-managed projects only; ignore it for team-managed).',
  '', '| Epic | Release | Stories | Points |', '|---|---|---|---|'];
for (const e of EPICS) {
  const st = STORIES.filter((s) => s[0] === e.key);
  md.push(`| ${e.name} | ${e.release} | ${st.length} | ${st.reduce((a, s) => a + s[2], 0)} |`);
}
md.push(`| **Total** | | **${STORIES.length}** | **${STORIES.reduce((a, s) => a + s[2], 0)}** |`, '');
for (const e of EPICS) {
  md.push(`## ${e.name} _(${e.release})_`, '', e.summary, '');
  for (const s of STORIES.filter((x) => x[0] === e.key)) {
    md.push(`### ${s[1]}`, '', `**Priority:** ${s[3]} · **Points:** ${s[2]} · **Labels:** ${s[4].replace(/,/g, ', ')}`, '', `> ${s[5]}`, '', '**Acceptance criteria**', '');
    s[6].forEach((a) => md.push(`- [ ] ${a}`));
    md.push('');
  }
}
fs.writeFileSync(path.join(__dirname, 'backlog.md'), md.join('\n'));
console.log(`Wrote ${EPICS.length} epics and ${STORIES.length} stories`);
