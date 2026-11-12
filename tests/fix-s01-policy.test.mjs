// tests/fix-s01-policy.test.mjs
// S01: the pure helpers added to www/dashboard-policy.js (no DOM, no storage).
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicy } from './lib/fix-s01-extract.mjs';

const P = loadPolicy();

test('U01-F3: stableEmpId is deterministic, case-insensitive and differs per seed', () => {
  assert.equal(typeof P.stableEmpId, 'function');
  assert.equal(P.stableEmpId('EMP001'), P.stableEmpId('EMP001'));
  assert.equal(P.stableEmpId('Asha Patil|SAT'), P.stableEmpId('asha patil|sat'));
  assert.notEqual(P.stableEmpId('EMP001'), P.stableEmpId('EMP002'));
  assert.match(P.stableEmpId('EMP001'), /^emp_s[0-9a-z]+_[0-9a-z]+$/);
});

test('U01-F5: reportCardVisible follows the module map, Owner sees all, unknown title is Owner only', () => {
  const role = { expense: true };
  const vis = id => role[id] === true;
  const seen = t => P.reportCardVisible(t, vis, false);
  assert.equal(seen('Business today'), false);
  assert.equal(seen('Queue & conversion'), false);
  assert.equal(seen('Payroll'), false);
  assert.equal(seen('Employee performance'), false);
  assert.equal(seen('Cash sheet'), true);
  assert.equal(seen('Expense summary'), true);
  assert.equal(seen('Day snapshot'), true);
  assert.equal(seen('Weird card'), false);
  assert.equal(seen(undefined), false);
  const all = ['Business today', 'Day snapshot', 'Queue & conversion', 'Daily staff register', 'Stock register', 'Grooming', 'Cash sheet', 'On leave', 'Employee performance', 'Payroll', 'Expense summary', 'CRO audit scores', 'Grooming trend', 'Service job aging', 'Tax compliance', 'Weird card'];
  for (const t of all) assert.equal(P.reportCardVisible(t, () => false, true), true, t);
  // Employee performance needs grooming AND service AND expense
  const three = { grooming: true, service: true, expense: true };
  assert.equal(P.reportCardVisible('Employee performance', id => three[id] === true, false), true);
  assert.equal(P.reportCardVisible('Employee performance', id => id !== 'service', false), false);
});

test('U02-F07: validateOrg refuses blank, duplicate, bad PAN and bad GSTIN; the seeded org passes', () => {
  const ok = { firms: [{ code: 'SAT', name: 'Saagar Traders', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5' }], branches: [{ code: 'WLMHW', name: 'Titan World' }] };
  assert.equal(P.validateOrg(ok), '');
  assert.equal(P.validateOrg({ firms: [{ code: 'SAT', name: 'X', pan: '', gstin: '' }], branches: [] }), '');
  assert.match(P.validateOrg({ firms: [{ code: '', name: '' }], branches: [] }), /code is required/);
  assert.match(P.validateOrg({ firms: [{ code: 'A', name: '' }], branches: [] }), /name is required/);
  assert.match(P.validateOrg({ firms: [], branches: [{ code: '', name: 'B' }] }), /Branch 1/);
  assert.match(P.validateOrg({ firms: [{ code: 'SAT', name: 'a' }, { code: 'sat', name: 'b' }], branches: [] }), /used twice/);
  assert.match(P.validateOrg({ firms: [{ code: 'SAT', name: 'a', pan: 'BAD' }], branches: [] }), /PAN/);
  assert.match(P.validateOrg({ firms: [{ code: 'SAT', name: 'a', gstin: 'NOTAGSTIN' }], branches: [] }), /GSTIN/);
  assert.equal(P.validateOrg({ firms: [{ code: 'SAT', name: 'a', pan: 'abcde1234f' }], branches: [] }), '');
  assert.equal(P.validateOrg(null), '');
});

test('U02-F08 / U02-014: masterError and normMobile', () => {
  assert.notEqual(P.masterError('vendors', { gstin: 'NOTAGSTIN' }), '');
  assert.equal(P.masterError('vendors', { gstin: '27ABCDE1234F1Z5' }), '');
  assert.equal(P.masterError('vendors', { gstin: '27abcde1234f1z5' }), '');
  assert.equal(P.masterError('vendors', { gstin: '' }), '');
  assert.notEqual(P.masterError('customers', { mobile: '12' }), '');
  assert.equal(P.masterError('customers', { mobile: '+91 98765 43210' }), '');
  assert.equal(P.masterError('customers', { mobile: '' }), '');
  assert.equal(P.masterError('brands', { name: 'x' }), '');
  assert.equal(P.normMobile('+91 98765 43210'), '9876543210');
  assert.equal(P.normMobile('09876543210'), '9876543210');
  assert.equal(P.normMobile('919876543210'), '9876543210');
  assert.equal(P.normMobile('98765-43210'), '9876543210');
  assert.equal(P.normMobile('5876543210'), '');
  assert.equal(P.normMobile('12'), '');
  assert.equal(P.normMobile(null), '');
});

test('U07 / PAN-GSTIN: isPan and isGstin are format only', () => {
  assert.equal(P.isPan('abcde1234f'), true);
  assert.equal(P.isPan('ABCDE12345'), false);
  assert.equal(P.isGstin('27ABCDE1234F1Z5'), true);
  assert.equal(P.isGstin('27ABCDE1234F1X5'), false);
});

test('U14-04: ledgerDay returns only the asked kind, skips void rows and other dates', () => {
  const rows = [
    { type: 'expense', date: '2026-11-12', amount: 100 },
    { type: 'income', date: '2026-11-12', amount: 29000 },
    { type: 'income', date: '2026-11-12', amount: 5, void: true },
    { type: 'income', date: '2026-11-11', amount: 7 },
    { date: '2026-11-12T10:00:00', amount: 700 },
    null
  ];
  assert.deepEqual(P.ledgerDay(rows, '2026-11-12', 1).map(r => r.amount), [29000]);
  assert.deepEqual(P.ledgerDay(rows, '2026-11-12', 0).map(r => r.amount), [100, 700]);
  assert.equal(P.sumAmount(P.ledgerDay(rows, '2026-11-12', 1)), 29000);
  assert.equal(P.sumAmount(null), 0);
  assert.equal(P.ledgerDay('nope', 'x', 0).length, 0);
});

test('U10-F05: payrollSummary counts active rows only and reads the run status', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push({ gross: 20000, net: 16000 + i, active: i !== 4 });
  const p = { meta: { month: 'November', year: 2026, firmName: 'SAT', run: { status: 'locked' } }, rows, runs: {} };
  const s = P.payrollSummary(p);
  assert.equal(s.headcount, 14);
  assert.equal(s.net, rows.filter(r => r.active).reduce((a, r) => a + r.net, 0));
  assert.equal(s.gross, 14 * 20000);
  assert.equal(s.status, 'draft');                       // the static meta.run is ignored
  p.runs['November-2026'] = { status: 'locked' };
  assert.equal(P.payrollSummary(p).status, 'locked');
  assert.deepEqual(Object.keys(s).sort(), ['firm', 'gross', 'headcount', 'month', 'net', 'status', 'year']);
  assert.equal(P.payrollSummary(null).headcount, 0);
  assert.equal(P.payrollSummary(null).status, 'draft');
});

test('U07-F08: warrantyDue clears on Resolved or done, not on an older Resolved entry', () => {
  const soon = '2026-12-12';
  const rem = { auto: 'warranty', dueDate: '2026-11-22', createdAt: '2026-11-01T10:00:00Z' };
  assert.equal(P.warrantyDue([{ followUps: [rem] }], soon), 1);
  assert.equal(P.warrantyDue([{ followUps: [rem, { outcome: 'Resolved', createdAt: '2026-11-05T10:00:00Z' }] }], soon), 0);
  assert.equal(P.warrantyDue([{ followUps: [Object.assign({}, rem, { done: true })] }], soon), 0);
  assert.equal(P.warrantyDue([{ followUps: [rem, { outcome: 'Resolved', createdAt: '2026-10-01T10:00:00Z' }] }], soon), 1);
  assert.equal(P.warrantyDue([{ followUps: [rem, { outcome: 'Call back', createdAt: '2026-11-05T10:00:00Z' }] }], soon), 1);
  assert.equal(P.warrantyDue([{ followUps: [Object.assign({}, rem, { dueDate: '2027-01-01' })] }], soon), 0);
  assert.equal(P.warrantyDue([{ followUps: [Object.assign({}, rem, { dueDate: '2020-01-01' })] }], soon), 1);
  assert.equal(P.warrantyDue(null, soon), 0);
});

test('the three original functions are unchanged', () => {
  assert.equal(P.moduleVisible('qms', false, { qms: true }), true);
  assert.equal(P.moduleVisible('qms', false, {}), false);
  assert.equal(P.actionModuleId("navigateToModule('grooming')"), 'grooming');
  assert.deepEqual(P.filterModuleItems([{ moduleId: 'a' }, { moduleId: 'b' }], null, false, { a: true }).length, 1);
});
