'use strict';
/*
 * Deterministic test-data generator. Re-run with `npm run gen:data`.
 * Outputs (all in this folder):
 *   seed.json            40 stored requests across every status, with consistent workflow history
 *   requests.csv         same data in the CSV export format (for Excel / Jira / BI testing)
 *   valid-payload.json   a minimal-but-complete POST /api/requests body
 *   edge-cases.json      valid payloads that stress rendering/encoding (unicode, max lengths, HTML)
 *   invalid-payloads.json  payloads the API must reject, each with the field(s) expected to fail
 */
const fs = require('node:fs');
const path = require('node:path');
const Rules = require('../public/js/rules.js');
const { toCsv } = require('../server/app.js');

const OUT = __dirname;
let s = 20260923; // fixed seed
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickSome = (arr, min, max) => {
  const n = min + Math.floor(rand() * (max - min + 1));
  return [...arr].sort(() => rand() - 0.5).slice(0, n);
};

const PEOPLE = [
  ['Priya Raman', 'Finance'], ['Marcus Bell', 'Sales'], ['Aiko Tanaka', 'Marketing'], ['Diego Alvarez', 'Operations'],
  ['Hannah Okafor', 'Customer Support'], ['Tomás Silva', 'HR'], ['Grace Liu', 'Legal & Compliance'], ['Sam Patel', 'IT'],
  ['Noah Fischer', 'Product'], ['Leila Haddad', 'Finance'], ['Owen Murphy', 'Sales'], ['Zoë Kowalski', 'Customer Support'],
];
const ASSIGNEES = ['Jordan Kim (PM)', 'Alex Rivera (PM)', 'Casey Morgan (BA)', 'Taylor Brooks (PM)'];

const IDEAS = [
  { title: 'Auto-sync closed-won deals to invoicing', category: 'Integration', systems: ['Salesforce', 'SAP'],
    problem: 'When a deal closes in Salesforce, finance re-keys the order into SAP by hand. It takes 2-3 days and about 4% of invoices have typos in amounts or PO numbers.',
    solution: 'Push closed-won opportunities to SAP as draft sales orders automatically, with a review queue for exceptions.',
    value: 'Removes ~120 hours/month of manual entry and shortens days-sales-outstanding by an estimated 2 days.',
    metrics: 'Invoice creation within 4 hours of close; re-key error rate below 0.5%.' },
  { title: 'Self-service password reset for customer portal', category: 'New Feature', systems: ['Customer Portal'],
    problem: 'Customers who forget their portal password must call support. Password resets are 18% of all tier-1 tickets.',
    solution: 'Email-based reset link with MFA confirmation.', value: 'Deflects ~1,100 tickets per month and improves CSAT for login issues.',
    metrics: 'Password-related tickets down 80% within one quarter.' },
  { title: 'Quarterly SOX access review report', category: 'Compliance / Regulatory', systems: ['Workday', 'SAP', 'Data Warehouse'],
    problem: 'Auditors need a list of who has access to financial systems each quarter. Today IT stitches it together from three exports in spreadsheets.',
    solution: 'Scheduled report joining Workday org data with SAP role assignments.', value: 'Avoids audit findings and saves ~40 hours per quarter of IT and compliance time.',
    metrics: 'Report produced automatically by day 3 of each quarter with zero manual edits.' },
  { title: 'Bulk edit for support ticket tags', category: 'Enhancement', systems: ['ServiceNow'],
    problem: 'Support leads re-tag hundreds of tickets after taxonomy changes, one at a time.',
    solution: '', value: 'Saves team leads about 6 hours a week and keeps reporting categories accurate.', metrics: '' },
  { title: 'Churn-risk dashboard for account managers', category: 'Reporting & Analytics', systems: ['Data Warehouse', 'Salesforce'],
    problem: 'Account managers only learn a customer is unhappy when they fail to renew. Usage and ticket signals exist but are scattered.',
    solution: 'Weekly churn-risk score per account surfaced in Salesforce.', value: 'A 1-point reduction in gross churn is worth about $900K ARR.',
    metrics: 'Gross churn down 1 point year over year; 90% of at-risk accounts contacted within 14 days.' },
  { title: 'Automate new-hire laptop provisioning', category: 'Automation', systems: ['Workday', 'ServiceNow', 'Internal Tools'],
    problem: 'IT learns about new hires from a manager email, sometimes after the start date. 1 in 5 new hires starts without a working laptop.',
    solution: 'Trigger a ServiceNow provisioning ticket when an offer is accepted in Workday.', value: 'Every new hire productive on day one; fewer escalations to IT leadership.',
    metrics: '98% of new hires have equipment on day one.' },
  { title: 'Mobile app: save items to wishlist', category: 'New Feature', systems: ['Mobile App'],
    problem: 'Customers cannot save products to come back to later on mobile, so they screenshot them or abandon the session.',
    solution: 'Heart icon on product cards synced to the customer account.', value: 'Wishlists lift return-visit conversion by 3-5% in industry benchmarks.',
    metrics: 'Return-visit conversion up 3% in 90 days.' },
  { title: 'Commission statements in the sales portal', category: 'Enhancement', systems: ['Salesforce', 'Internal Tools'],
    problem: 'Reps email finance monthly to ask how their commission was calculated, creating ~300 inquiries per cycle.',
    solution: 'Line-item commission breakdown visible to each rep.', value: 'Reduces finance inquiries and disputes; improves rep trust in comp plan.',
    metrics: 'Commission inquiries down 70%.' },
  { title: 'GDPR data-subject request workflow', category: 'Compliance / Regulatory', systems: ['Customer Portal', 'ServiceNow', 'Data Warehouse'],
    problem: 'Data-subject access and deletion requests arrive by email and are tracked in a spreadsheet. We have 30 days to respond and missed two deadlines last year.',
    solution: 'Portal form that opens a tracked case with SLA timers and a checklist per system.', value: 'Avoids regulatory fines (up to 4% of turnover) and reputational damage.',
    metrics: '100% of DSARs answered within 30 days.' },
  { title: 'Marketing campaign ROI report', category: 'Reporting & Analytics', systems: ['Salesforce', 'Data Warehouse'],
    problem: 'Marketing cannot tie pipeline back to campaigns because campaign IDs are lost when leads convert.',
    solution: 'Preserve campaign attribution through lead conversion and expose it in a dashboard.', value: 'Lets us reallocate ~$2M annual spend toward campaigns that actually produce pipeline.',
    metrics: 'Attribution available for 95% of opportunities.' },
  { title: 'Expense receipt capture by photo', category: 'New Feature', systems: ['Mobile App', 'SAP'],
    problem: 'Employees keep paper receipts and upload scans at month end; many are lost, delaying reimbursement.',
    solution: 'Snap a photo in the mobile app and auto-extract amount, date and merchant.', value: 'Faster reimbursements and fewer policy exceptions for missing receipts.', metrics: '' },
  { title: 'Warehouse pick-list optimisation', category: 'Enhancement', systems: ['SAP', 'Internal Tools'],
    problem: 'Pick lists are sorted by order number rather than bin location, so pickers walk the warehouse several times per batch.',
    solution: 'Sort pick lists by walking route.', value: 'Estimated 15% pick-time reduction across 3 warehouses.',
    metrics: 'Average lines picked per hour up 15%.' },
  { title: 'Slack alerts for P1 support tickets', category: 'Integration', systems: ['ServiceNow', 'Internal Tools'],
    problem: 'On-call engineers miss P1 tickets overnight because email alerts are filtered or delayed.',
    solution: '', value: 'Faster response on the incidents that cost us most; protects enterprise SLAs.', metrics: 'P1 acknowledgement under 10 minutes.' },
  { title: 'Contract renewal reminders', category: 'Automation', systems: ['Salesforce'],
    problem: 'Legal and sales lose track of auto-renewal notice windows; last year we auto-renewed two vendor contracts we meant to cancel.',
    solution: 'Reminders 90/60/30 days before notice deadlines.', value: 'Avoids ~$180K a year in unwanted renewals.', metrics: 'Zero unintended renewals.' },
  { title: 'Accessibility fixes for checkout', category: 'Compliance / Regulatory', systems: ['Customer Portal', 'Mobile App'],
    problem: 'An external audit found WCAG 2.1 AA failures in checkout: unlabeled fields and keyboard traps.',
    solution: 'Remediate audit findings and add automated accessibility tests to CI.', value: 'Reduces legal exposure and opens checkout to customers using assistive technology.',
    metrics: 'Zero critical findings on re-audit.' },
];

const START = Date.UTC(2026, 5, 1); // 2026-06-01
const END = Date.UTC(2026, 8, 22); // 2026-09-22
const PATHS = [
  ['Submitted'],
  ['Submitted', 'In Review'],
  ['Submitted', 'In Review', 'Needs Info'],
  ['Submitted', 'In Review', 'Needs Info', 'In Review', 'Approved'],
  ['Submitted', 'In Review', 'Approved'],
  ['Submitted', 'In Review', 'Approved', 'In Delivery'],
  ['Submitted', 'In Review', 'Approved', 'In Delivery', 'Done'],
  ['Submitted', 'Rejected'],
  ['Submitted', 'In Review', 'Rejected'],
];
const NOTES = {
  'Needs Info': 'Can you share how many records this affects per month and which teams own the process today?',
  'Rejected': 'Duplicate of an item already on the roadmap for next quarter. Linking and closing.',
  'Approved': 'Approved at weekly triage. Sizing with the delivery team next sprint.',
  'In Review': 'Picking this up for review.',
};

const seed = [];
for (let i = 0; i < 40; i++) {
  const idea = IDEAS[i % IDEAS.length];
  const [name, dept] = pick(PEOPLE);
  const created = new Date(START + Math.floor(((END - START) * i) / 40 + rand() * 86400000));
  const urgency = pick(['Low', 'Medium', 'Medium', 'High', 'High', 'Critical']);
  const due = new Date(created.getTime() + (20 + Math.floor(rand() * 150)) * 86400000).toISOString().slice(0, 10);
  const base = {
    requesterName: name,
    requesterEmail: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com',
    department: dept,
    title: i < IDEAS.length ? idea.title : `${idea.title} (${pick(['EMEA', 'APAC', 'North America', 'phase 2'])})`,
    category: idea.category,
    problem: idea.problem,
    proposedSolution: idea.solution,
    businessValue: idea.value,
    successMetrics: idea.metrics,
    affectedSystems: idea.systems,
    usersAffected: pick(Rules.ENUMS.usersAffected),
    revenueImpact: pick(Rules.ENUMS.revenueImpact),
    regulatory: idea.category === 'Compliance / Regulatory',
    urgency,
    targetDate: urgency === 'Critical' || rand() > 0.4 ? due : '',
    urgencyReason: urgency === 'Critical' ? 'Committed to a customer or auditor date; slipping has contractual consequences.' : '',
  };
  const { valid, errors, value } = Rules.validateRequest(base, { today: created.toISOString().slice(0, 10) });
  if (!valid) throw new Error(`Generated invalid seed #${i}: ${JSON.stringify(errors)}`);

  const pathTaken = i === 0 ? PATHS[0] : pick(PATHS);
  const assignee = pathTaken.length > 1 ? pick(ASSIGNEES) : '';
  let t = created.getTime();
  const history = [];
  const comments = [];
  pathTaken.forEach((st, idx) => {
    if (idx > 0) t += (1 + Math.floor(rand() * 5)) * 86400000 + Math.floor(rand() * 8 * 3600000);
    const at = new Date(Math.min(t, END + 86399000)).toISOString();
    history.push({ at, actor: idx === 0 ? name : assignee, type: 'status', from: idx === 0 ? null : pathTaken[idx - 1], to: st });
    if (idx > 0 && NOTES[st]) comments.push({ at, author: assignee, text: NOTES[st] });
    if (st === 'In Review' && pathTaken[idx - 1] === 'Needs Info') comments.push({ at, author: name, text: 'Roughly 2,000 records a month; the Operations team owns it today.' });
  });
  const hasJira = ['Approved', 'In Delivery', 'Done'].includes(pathTaken[pathTaken.length - 1]);
  const { score, band } = Rules.computePriority(value);
  seed.push({
    id: `FR-2026-${String(i + 1).padStart(4, '0')}`,
    ...value,
    status: pathTaken[pathTaken.length - 1],
    priorityScore: score,
    priorityBand: band,
    assignee,
    jiraKey: hasJira ? `FEAT-${100 + i}` : '',
    createdAt: created.toISOString(),
    updatedAt: history[history.length - 1].at,
    history,
    comments,
  });
}

const valid = {
  requesterName: 'Priya Raman',
  requesterEmail: 'priya.raman@example.com',
  department: 'Finance',
  title: 'Auto-sync closed-won deals to invoicing',
  category: 'Integration',
  problem: 'Finance re-keys every closed deal from Salesforce into SAP by hand, which takes days and introduces errors.',
  proposedSolution: '',
  businessValue: 'Saves about 120 hours per month and speeds up cash collection.',
  successMetrics: '',
  affectedSystems: ['Salesforce', 'SAP'],
  usersAffected: '11-50',
  revenueImpact: 'Medium ($50K-$250K)',
  regulatory: false,
  urgency: 'High',
  targetDate: '',
  urgencyReason: '',
};

const edge = [
  { case: 'Unicode names and emoji', payload: { ...valid, requesterName: 'Zoë Ødegård-Nakamura 中村', title: 'Support ünïcödé in exports 🚀' } },
  { case: 'HTML/script in free text must render as text', payload: { ...valid, title: '<img src=x onerror=alert(1)> title', problem: '<script>alert("xss")</script> and more text to pass the minimum length.' } },
  { case: 'Spreadsheet formula injection in CSV export', payload: { ...valid, title: '=HYPERLINK("http://evil.example","click")' } },
  { case: 'Exactly max-length title (120)', payload: { ...valid, title: 'T'.repeat(120) } },
  { case: 'Exactly min-length problem (20)', payload: { ...valid, problem: 'x'.repeat(20) } },
  { case: 'Whitespace is trimmed', payload: { ...valid, requesterName: '   Priya   ', title: '   Padded title   ' } },
  { case: 'Duplicate systems are de-duplicated', payload: { ...valid, affectedSystems: ['SAP', 'SAP', 'Salesforce'] } },
  { case: 'Critical with reason and future date', payload: { ...valid, urgency: 'Critical', urgencyReason: 'Audit finding must close by quarter end.', targetDate: '2099-12-31' } },
  { case: 'Email is lower-cased', payload: { ...valid, requesterEmail: 'Priya.Raman@Example.COM' } },
  { case: 'Unknown extra fields are ignored', payload: { ...valid, status: 'Approved', priorityScore: 100, isAdmin: true } },
];

const invalid = [
  { case: 'Empty object', payload: {}, expectFields: ['requesterName', 'requesterEmail', 'department', 'title', 'category', 'problem', 'businessValue', 'affectedSystems', 'usersAffected', 'revenueImpact', 'urgency'] },
  { case: 'Bad email', payload: { ...valid, requesterEmail: 'priya@' }, expectFields: ['requesterEmail'] },
  { case: 'Title too short', payload: { ...valid, title: 'Hi' }, expectFields: ['title'] },
  { case: 'Title too long (121)', payload: { ...valid, title: 'T'.repeat(121) }, expectFields: ['title'] },
  { case: 'Problem too short', payload: { ...valid, problem: 'Too short' }, expectFields: ['problem'] },
  { case: 'Unknown department', payload: { ...valid, department: 'Space Program' }, expectFields: ['department'] },
  { case: 'No systems', payload: { ...valid, affectedSystems: [] }, expectFields: ['affectedSystems'] },
  { case: 'Systems not an array', payload: { ...valid, affectedSystems: 'SAP' }, expectFields: ['affectedSystems'] },
  { case: 'Unknown system', payload: { ...valid, affectedSystems: ['SAP', 'Mainframe'] }, expectFields: ['affectedSystems'] },
  { case: 'Past target date', payload: { ...valid, targetDate: '2020-01-01' }, expectFields: ['targetDate'] },
  { case: 'Impossible date', payload: { ...valid, targetDate: '2099-02-30' }, expectFields: ['targetDate'] },
  { case: 'Critical without reason or date', payload: { ...valid, urgency: 'Critical' }, expectFields: ['urgencyReason', 'targetDate'] },
  { case: 'Regulatory as string', payload: { ...valid, regulatory: 'yes' }, expectFields: ['regulatory'] },
  { case: 'Number instead of text', payload: { ...valid, title: 12345 }, expectFields: ['title'] },
  { case: 'Array body', payload: [valid], expectFields: ['_form'] },
];

const write = (name, data) => fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
write('seed.json', seed);
write('requests.csv', toCsv(seed));
write('valid-payload.json', valid);
write('edge-cases.json', edge);
write('invalid-payloads.json', invalid);

const tally = seed.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log(`Wrote ${seed.length} seed requests`, tally);
