/*
 * Shared intake rules: enums, validation, priority scoring and status workflow.
 * Imported by the React app (Vite) and by the Node server (require of an ES module, Node >= 22.12).
 * Keep this file dependency-free so both runtimes execute the exact same rules.
 */

const ENUMS = Object.freeze({
  department: ['Finance', 'Sales', 'Marketing', 'Operations', 'Customer Support', 'HR', 'Legal & Compliance', 'IT', 'Product', 'Other'],
  category: ['New Feature', 'Enhancement', 'Integration', 'Reporting & Analytics', 'Automation', 'Compliance / Regulatory', 'Other'],
  affectedSystems: ['Salesforce', 'SAP', 'Workday', 'ServiceNow', 'Customer Portal', 'Mobile App', 'Data Warehouse', 'Internal Tools', 'Other'],
  usersAffected: ['1-10', '11-50', '51-250', '251-1000', '1000+'],
  revenueImpact: ['None', 'Low (< $50K)', 'Medium ($50K-$250K)', 'High ($250K-$1M)', 'Very High (> $1M)'],
  urgency: ['Low', 'Medium', 'High', 'Critical'],
  status: ['Submitted', 'In Review', 'Needs Info', 'Approved', 'Rejected', 'In Delivery', 'Done'],
});

// Allowed status moves. Anything not listed is rejected by the API.
const TRANSITIONS = Object.freeze({
  'Submitted': ['In Review', 'Rejected'],
  'In Review': ['Needs Info', 'Approved', 'Rejected'],
  'Needs Info': ['In Review', 'Rejected'],
  'Approved': ['In Delivery', 'Rejected'],
  'In Delivery': ['Done'],
  'Rejected': ['In Review'],
  'Done': [],
});

const OPEN_STATUSES = ['Submitted', 'In Review', 'Needs Info', 'Approved', 'In Delivery'];

const TEXT_LIMITS = Object.freeze({
  requesterName: { min: 2, max: 100, required: true, label: 'Your name' },
  title: { min: 5, max: 120, required: true, label: 'Request title' },
  problem: { min: 20, max: 4000, required: true, label: 'Problem statement' },
  proposedSolution: { min: 0, max: 4000, required: false, label: 'Proposed solution' },
  businessValue: { min: 20, max: 4000, required: true, label: 'Business value' },
  successMetrics: { min: 0, max: 2000, required: false, label: 'Success metrics' },
  urgencyReason: { min: 0, max: 1000, required: false, label: 'Urgency justification' },
});

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Strip ASCII control characters except tab / newline / carriage return.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null; // signals wrong type
  return v.replace(CONTROL_RE, '').trim();
}

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validate and normalise an intake submission.
 * @param {object} input raw payload
 * @param {{today?: string}} [opts] today's date (YYYY-MM-DD) for deterministic tests
 * @returns {{valid: boolean, errors: Object<string,string>, value: object}}
 */
function validateRequest(input, opts) {
  const today = (opts && opts.today) || todayISO();
  const errors = {};
  const value = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { _form: 'Request body must be a JSON object.' }, value };
  }

  for (const [field, rule] of Object.entries(TEXT_LIMITS)) {
    const s = cleanText(input[field]);
    if (s === null) { errors[field] = `${rule.label} must be text.`; continue; }
    if (!s) {
      if (rule.required) errors[field] = `${rule.label} is required.`;
      value[field] = '';
      continue;
    }
    if (s.length < rule.min) errors[field] = `${rule.label} must be at least ${rule.min} characters.`;
    else if (s.length > rule.max) errors[field] = `${rule.label} must be ${rule.max} characters or fewer.`;
    value[field] = s;
  }

  const email = cleanText(input.requesterEmail);
  if (email === null || !email) errors.requesterEmail = 'Work email is required.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.requesterEmail = 'Enter a valid email address.';
  value.requesterEmail = (email || '').toLowerCase();

  for (const field of ['department', 'category', 'usersAffected', 'revenueImpact', 'urgency']) {
    const v = cleanText(input[field]);
    if (!v) errors[field] = 'Please choose an option.';
    else if (!ENUMS[field].includes(v)) errors[field] = 'Unknown option selected.';
    value[field] = v || '';
  }

  const systems = input.affectedSystems;
  if (!Array.isArray(systems) || systems.length === 0) {
    errors.affectedSystems = 'Select at least one affected system.';
    value.affectedSystems = [];
  } else {
    const unique = [...new Set(systems.map(cleanText))];
    if (unique.some((s) => !ENUMS.affectedSystems.includes(s))) errors.affectedSystems = 'Unknown system selected.';
    value.affectedSystems = unique.filter((s) => ENUMS.affectedSystems.includes(s));
  }

  if (input.regulatory !== undefined && typeof input.regulatory !== 'boolean') {
    errors.regulatory = 'Regulatory flag must be true or false.';
  }
  value.regulatory = input.regulatory === true;

  const target = cleanText(input.targetDate);
  if (target === null) errors.targetDate = 'Target date must be a date.';
  else if (target) {
    if (!isValidDate(target)) errors.targetDate = 'Use the format YYYY-MM-DD.';
    else if (target < today) errors.targetDate = 'Target date cannot be in the past.';
  }
  value.targetDate = target || '';

  // Business rule: Critical needs a reason and a date so triage can verify it.
  if (value.urgency === 'Critical') {
    if (!value.urgencyReason || value.urgencyReason.length < 10) {
      errors.urgencyReason = 'Explain why this is critical (at least 10 characters).';
    }
    if (!value.targetDate && !errors.targetDate) {
      errors.targetDate = 'Critical requests need a target date.';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, value };
}

/**
 * Priority score 0-100 = reach (0-35) + value (0-35) + urgency (0-30) + regulatory bonus (15), capped.
 * Bands: P1 >= 75, P2 >= 55, P3 >= 35, else P4.
 */
function computePriority(req) {
  const reachIdx = ENUMS.usersAffected.indexOf(req.usersAffected);
  const valueIdx = ENUMS.revenueImpact.indexOf(req.revenueImpact);
  const urgencyPts = { Low: 0, Medium: 10, High: 20, Critical: 30 }[req.urgency] || 0;
  const reach = reachIdx < 0 ? 0 : ((reachIdx + 1) / 5) * 35;
  const value = valueIdx < 0 ? 0 : ((valueIdx + 1) / 5) * 35;
  const score = Math.min(100, Math.round(reach + value + urgencyPts + (req.regulatory ? 15 : 0)));
  const band = score >= 75 ? 'P1' : score >= 55 ? 'P2' : score >= 35 ? 'P3' : 'P4';
  return { score, band };
}

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

export { ENUMS, TRANSITIONS, OPEN_STATUSES, TEXT_LIMITS, validateRequest, computePriority, canTransition, isValidDate };
