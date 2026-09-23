'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../public/js/rules.js');
const valid = require('../test-data/valid-payload.json');
const edgeCases = require('../test-data/edge-cases.json');
const invalidCases = require('../test-data/invalid-payloads.json');

const TODAY = '2026-09-23';
const check = (p) => Rules.validateRequest(p, { today: TODAY });

test('valid payload passes', () => {
  const r = check(valid);
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

for (const { case: name, payload } of edgeCases) {
  test(`edge case accepted: ${name}`, () => {
    const r = check(payload);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
  });
}

for (const { case: name, payload, expectFields } of invalidCases) {
  test(`invalid payload rejected: ${name}`, () => {
    const r = check(payload);
    assert.equal(r.valid, false);
    assert.deepEqual(Object.keys(r.errors).sort(), [...expectFields].sort());
  });
}

test('normalisation: trims, lower-cases email, de-duplicates systems, drops unknown keys', () => {
  const { value } = check({ ...valid, requesterName: '  Priya  ', requesterEmail: 'A@B.COM', affectedSystems: ['SAP', 'SAP'], isAdmin: true });
  assert.equal(value.requesterName, 'Priya');
  assert.equal(value.requesterEmail, 'a@b.com');
  assert.deepEqual(value.affectedSystems, ['SAP']);
  assert.equal('isAdmin' in value, false);
});

test('control characters are stripped', () => {
  const { value } = check({ ...valid, title: 'Bell\u0007 and null\u0000 title' });
  assert.equal(value.title, 'Bell and null title');
});

test('target date equal to today is allowed', () => {
  assert.equal(check({ ...valid, targetDate: TODAY }).valid, true);
});

test('priority: minimum inputs give P4, maximum give P1 capped at 100', () => {
  assert.deepEqual(Rules.computePriority({ usersAffected: '1-10', revenueImpact: 'None', urgency: 'Low', regulatory: false }), { score: 14, band: 'P4' });
  assert.deepEqual(Rules.computePriority({ usersAffected: '1000+', revenueImpact: 'Very High (> $1M)', urgency: 'Critical', regulatory: true }), { score: 100, band: 'P1' });
});

test('priority: band boundaries', () => {
  // 251-1000 (28) + Medium $ (21) + High (20) = 69 -> P2
  assert.deepEqual(Rules.computePriority({ usersAffected: '251-1000', revenueImpact: 'Medium ($50K-$250K)', urgency: 'High' }), { score: 69, band: 'P2' });
  // same + regulatory 15 = 84 -> P1
  assert.equal(Rules.computePriority({ usersAffected: '251-1000', revenueImpact: 'Medium ($50K-$250K)', urgency: 'High', regulatory: true }).band, 'P1');
  // 11-50 (14) + Low $ (14) + Medium (10) = 38 -> P3
  assert.deepEqual(Rules.computePriority({ usersAffected: '11-50', revenueImpact: 'Low (< $50K)', urgency: 'Medium' }), { score: 38, band: 'P3' });
});

test('workflow transitions', () => {
  assert.equal(Rules.canTransition('Submitted', 'In Review'), true);
  assert.equal(Rules.canTransition('Submitted', 'Done'), false);
  assert.equal(Rules.canTransition('Rejected', 'In Review'), true);
  assert.equal(Rules.canTransition('Done', 'In Review'), false);
  // Every status is reachable from Submitted
  const seen = new Set(['Submitted']);
  const queue = ['Submitted'];
  while (queue.length) for (const n of Rules.TRANSITIONS[queue.shift()]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  assert.deepEqual([...seen].sort(), [...Rules.ENUMS.status].sort());
});
