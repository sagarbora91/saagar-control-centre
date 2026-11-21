// Service wave 2, billing documents: customer approval of an estimate (P3 tests 11 to 15, group B). REAL store, calc, masters.
// P1 is Rs 118.00 including GST: one piece 11800 paise, two pieces 23600.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, CASHIER, TECH, GREETER } from './lib/svc2-docs-env.mjs';

const est = (env, qty, extra = {}, session = MANAGER) => env.bill.saveEstimate({ jobId: 'J-1', lines: [{ kind: 'PART', code: 'P1', qty }], ...extra }, env.ctx(session));
const approve = (env, input, session = MANAGER) => env.bill.recordApproval({ jobId: 'J-1', method: 'CALL', ...input }, env.ctx(session));
const DAY = 86400000;

test('11 approve the latest version: the amount is the version total; a typed different amount is refused', () => {
  const env = makeEnv().seed();
  est(env, 1);
  expectFail(unchanged(env, () => approve(env, { version: 1, amountPaise: 11799 })), 'AMOUNT_MISMATCH');
  const r = expectOk(approve(env, { version: 1, amountPaise: 11800, takenByName: 'Asha Desk', evidence: 'chat 10:40', note: 'ok by call' }));
  assert.equal(r.approval.amountPaise, 11800);
  assert.equal(r.approval.version, 1);
  assert.equal(r.approval.method, 'CALL');
  assert.deepEqual(r.approval.takenBy, { name: 'Asha Desk' });
  assert.equal(r.approval.approvedAt, '2026-11-18T05:00:00.000Z');
  assert.equal(r.approval.supersedes, '');
  assert.equal(r.state, 'APPROVED');
  const rec = env.store.read('invoices').records[1];
  assert.equal(rec.k, 'EST_APPROVE');
  assert.equal(rec.b.estimateId, env.store.read('invoices').records[0].id);
  // the name given in the form is the staff name, never a customer name; no customer field exists in the record
  assert.equal(Object.keys(rec.b).some((k) => /^(cust|customer|mobile|phone|address|email)/i.test(k)), false);
});

test('12 older or unknown version, method other without evidence and bad times are refused', () => {
  const env = makeEnv().seed();
  est(env, 1);
  est(env, 2);
  expectFail(unchanged(env, () => approve(env, { version: 1 })), 'ESTIMATE_NOT_LATEST');
  expectFail(unchanged(env, () => approve(env, { version: 3 })), 'ESTIMATE_NOT_FOUND');
  expectFail(unchanged(env, () => approve(env, { version: 0 })), 'ESTIMATE_NOT_FOUND');
  expectFail(unchanged(env, () => approve(env, { version: 2, method: 'OTHER' })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => approve(env, { version: 2, method: 'OTHER', evidence: 'ab' })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => approve(env, { version: 2, method: 'FAX' })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => approve(env, { version: 2, approvedAt: '2026-11-18T05:00:01.000Z' })), 'APPROVAL_TIME_INVALID');
  expectFail(unchanged(env, () => approve(env, { version: 2, approvedAt: '2026-11-18T04:59:59.000Z' })), 'APPROVAL_TIME_INVALID');
  expectFail(unchanged(env, () => approve(env, { version: 2, approvedAt: 'not a time' })), 'APPROVAL_TIME_INVALID');
  env.clock.advance(9 * DAY);
  const eightDaysOld = new Date(env.clock.ms() - 8 * DAY).toISOString();
  expectFail(unchanged(env, () => approve(env, { version: 2, approvedAt: eightDaysOld })), 'APPROVAL_TIME_INVALID');
  const sixDaysOld = new Date(env.clock.ms() - 6 * DAY).toISOString();
  expectOk(approve(env, { version: 2, approvedAt: sixDaysOld, method: 'OTHER', evidence: 'slip 14' }));
});

test('13 state machine: none, draft, approved, re-approval needed above the approved amount, still approved at or below it', () => {
  const env = makeEnv().seed();
  const view = () => env.bill.estimateView('J-1', env.ctx(MANAGER));
  assert.equal(view().state, 'NONE');
  est(env, 1);
  assert.equal(view().state, 'DRAFT');
  assert.equal(view().needsAmountPaise, 11800);
  approve(env, { version: 1 });
  assert.equal(view().state, 'APPROVED');
  assert.equal(view().approvedPaise, 11800);
  est(env, 2, { reason: 'second battery needed' });
  let v = view();
  assert.equal(v.state, 'REAPPROVAL_NEEDED');
  assert.equal(v.approvedPaise, 11800);
  assert.equal(v.approvedVersion, 1);
  assert.equal(v.totalPaise, 23600);
  assert.equal(v.needsAmountPaise, 23600);
  approve(env, { version: 2 });
  assert.equal(view().state, 'APPROVED');
  est(env, 1, { reason: 'back to one battery' });
  v = view();
  assert.equal(v.state, 'APPROVED');
  assert.equal(v.totalPaise, 11800);
  assert.equal(v.approvedPaise, 23600);
  assert.equal(v.needsAmountPaise, 0);
  assert.equal(v.approvals.length, 2);
  assert.equal(v.approvals[1].supersedes, v.approvals[0].id);
});

test('14 who may record an approval: estimate staff, billing staff, manager, owner; not the greeter', () => {
  const env = makeEnv().seed();
  est(env, 1);
  expectFail(unchanged(env, () => approve(env, { version: 1 }, GREETER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => approve(env, { version: 1 }, CASHIER)), 'NOT_ALLOWED');
  expectOk(approve(env, { version: 1 }, TECH));
  const env2 = makeEnv().seed();
  est(env2, 1);
  env2.setConfig({ billingRoles: ['Cashier'] });
  expectOk(approve(env2, { version: 1 }, CASHIER));
  const env3 = makeEnv().seed();
  est(env3, 1);
  expectOk(approve(env3, { version: 1 }, OWNER));
  const env4 = makeEnv().seed();
  est(env4, 1);
  expectOk(approve(env4, { version: 1 }, MANAGER));
});

test('15 approving the same version twice is refused; no estimate at all is ESTIMATE_NOT_FOUND; a closed job is refused', () => {
  const env = makeEnv().seed();
  expectFail(unchanged(env, () => approve(env, { version: 1 })), 'ESTIMATE_NOT_FOUND');
  est(env, 1);
  expectOk(approve(env, { version: 1 }));
  expectFail(unchanged(env, () => approve(env, { version: 1 })), 'ALREADY_APPROVED');
  env.jobs.get('J-1').status = 'closed';
  expectFail(unchanged(env, () => approve(env, { version: 1 })), 'JOB_CLOSED');
});

test('12b Stage E round 4 (R-flows-1): a time typed in the estimate minute is the estimate time; an earlier minute is still refused; no time means now', () => {
  const env = makeEnv().seed();
  env.clock.advance(30000); // the estimate is saved at 05:00:30
  est(env, 1);
  expectFail(unchanged(env, () => approve(env, { version: 1, approvedAt: '2026-11-18T04:59:00.000Z' })), 'APPROVAL_TIME_INVALID');
  const r = expectOk(approve(env, { version: 1, approvedAt: '2026-11-18T05:00:00.000Z' }));
  assert.equal(r.approval.approvedAt, '2026-11-18T05:00:30.000Z', 'same minute: the approval takes the estimate second');
  const env2 = makeEnv().seed();
  env2.clock.advance(45000);
  est(env2, 1);
  const r2 = expectOk(approve(env2, { version: 1 }));
  assert.equal(r2.approval.approvedAt, '2026-11-18T05:00:45.000Z', 'no time given: now, never before the estimate');
});
