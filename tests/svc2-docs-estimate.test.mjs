// Service wave 2, billing documents: estimate versions (P3 tests 1 to 10, group A). REAL store, FIFO, masters, calc, money.
// Expected values are typed by hand: P1 Rs 118.00 including 18 % GST, P2 Rs 50.00 excluding, L1 labour Rs 100.00 excluding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, expectFail, expectOk, unchanged, gstinOf, Calc, OWNER, MANAGER, CASHIER, TECH, GREETER, TRAINEE, NONE } from './lib/svc2-docs-env.mjs';

const est = (env, input, session = MANAGER, extra = {}) => env.bill.saveEstimate(input, env.ctx(session, extra));
const L = (kind, code, qty, extra = {}) => ({ kind, code, qty, ...extra });

test('1 save a 3-line estimate: version 1, figures equal the hand figures, one record on the chain, one write', () => {
  const env = makeEnv().seed();
  env.openAll();
  const lines = [L('PART', 'P1', 2), L('LABOUR', 'L1', 1), L('OTHER', '', 1, { name: 'Gift pouch', unitPricePaise: 5000, priceBasis: 'EXCL', hsnSac: '9987', rateBp: 1800 })];
  const before = env.count();
  const r = expectOk(est(env, { jobId: 'J-1', lines, note: 'first quote' }));
  // P1 2 x 118.00 incl: 236.00 (taxable 200.00, GST 36.00); L1 100.00 + 18.00; other 50.00 + 9.00 = 59.00. Total 236 + 118 + 59 = 413.00
  assert.equal(r.estimate.version, 1);
  assert.equal(r.estimate.bill.totals.totalPaise, 41300);
  assert.equal(r.estimate.bill.totals.taxablePaise, 35000);
  assert.equal(r.estimate.bill.totals.cgstPaise, 3150);
  assert.equal(r.estimate.bill.totals.sgstPaise, 3150);
  assert.equal(r.estimate.bill.totals.roundOffPaise, 0);
  assert.equal(r.state, 'DRAFT');
  const hand = Calc.computeBill({
    lines: [
      { kind: 'PART', code: 'P1', name: 'Part P1', hsnSac: '9114', rateBp: 1800, priceBasis: 'INCL', unitPricePaise: 11800, qty: 2 },
      { kind: 'LABOUR', code: 'L1', name: 'Labour L1', hsnSac: '9987', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 10000, qty: 1 },
      { kind: 'OTHER', code: '', name: 'Gift pouch', hsnSac: '9987', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 5000, qty: 1 }
    ], billDiscountPaise: 0, sellerStateCode: '27', recipientStateCode: '27', recipientGstin: ''
  });
  const rec = env.store.read('invoices').records;
  assert.equal(rec.length, 1);
  assert.equal(rec[0].k, 'EST_SAVE');
  assert.deepEqual(JSON.parse(JSON.stringify(rec[0].b.bill)), JSON.parse(JSON.stringify(hand)));
  assert.equal(rec[0].b.docDate, '2026-11-18');
  assert.equal(env.store.verifyAll().ok, true);
  assert.equal(env.count() - before, 3, 'shard, head and device mark: one posting');
});

test('2 a part or labour without tax details is refused with the line number; with tax added later it works', () => {
  const env = makeEnv().seed();
  env.addPart('PX', { hsn: '', gstRateBp: null });
  env.addLabour('LX', { sac: '', gstRateBp: null });
  let r = unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P2', 1), L('PART', 'PX', 1)] }));
  expectFail(r, 'TAX_DETAILS_MISSING');
  assert.deepEqual(r.detail, { lineNo: 2, code: 'PX' });
  r = unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('LABOUR', 'LX', 1)] }));
  expectFail(r, 'TAX_DETAILS_MISSING');
  assert.equal(r.detail.lineNo, 1);
  env.editRow('part', 'PX', { hsn: '9114', gstRateBp: 1800, priceIncludesTax: true, sellPricePaise: 1000 });
  expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'PX', 1)] }));
});

test('3 inactive part, unknown part and unknown labour are refused', () => {
  const env = makeEnv().seed();
  env.addPart('PI');
  env.setActive('part', 'PI', false);
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'PI', 1)] })), 'PART_INACTIVE');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'NOPE', 1)] })), 'PART_UNKNOWN');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('LABOUR', 'NOPE', 1)] })), 'LABOUR_UNKNOWN');
});

test('4 a typed price on a master line that differs from the master is refused; the same price is accepted', () => {
  const env = makeEnv().seed();
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1, { unitPricePaise: 9900 })] })), 'PRICE_NOT_FROM_MASTER');
  expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1, { unitPricePaise: 11800 })] }));
});

test('5 an other line needs a typed tax code and rate; 11 other lines are refused; staff and the technician cannot add one', () => {
  const env = makeEnv().seed();
  const other = (extra = {}) => L('OTHER', '', 1, { name: 'Misc work', unitPricePaise: 1000, priceBasis: 'EXCL', hsnSac: '9987', rateBp: 1800, ...extra });
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [other({ hsnSac: '' })] })), 'TAX_DETAILS_MISSING');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [other({ rateBp: undefined })] })), 'TAX_DETAILS_MISSING');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [other({ priceBasis: undefined })] })), 'TAX_DETAILS_MISSING');
  const eleven = [];
  for (let i = 0; i < 11; i += 1) eleven.push(other({ name: 'Misc ' + i }));
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: eleven })), 'TOO_MANY_OTHER_LINES');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [other()] }, TECH)), 'NOT_ALLOWED');
  expectOk(est(env, { jobId: 'J-1', lines: eleven.slice(0, 10) }));
});

test('6 duplicate code, 101 lines and bad quantities are refused', () => {
  const env = makeEnv().seed();
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1), L('PART', 'p1', 2)] })), 'DUPLICATE_LINE');
  const many = [];
  for (let i = 0; i < 101; i += 1) many.push(L('LABOUR', 'L1', 1));
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: many })), 'TOO_MANY_LINES');
  for (const q of [0, 10000, 100001, 1.5, -1, '2', null]) expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', q)] })), 'QTY_INVALID');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [] })), 'LINES_REQUIRED');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1), 5] })), 'INPUT_INVALID');
});

test('7 recipient GSTIN: bad format refused; state 27 is INTRA; state 29 is INTER with IGST only; none is INTRA', () => {
  const env = makeEnv().seed();
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)], recipientGstin: 'ABC' })), 'GSTIN_INVALID');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)], recipientGstin: '27ABCDE1234F1Z5' })), 'GSTIN_INVALID');
  let r = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)], recipientGstin: gstinOf('29') }));
  assert.equal(r.estimate.bill.supply.type, 'INTER');
  // P1 1 x 118.00 incl 18 %: taxable 100.00, IGST 18.00, no CGST or SGST
  assert.equal(r.estimate.bill.totals.igstPaise, 1800);
  assert.equal(r.estimate.bill.totals.cgstPaise, 0);
  assert.equal(r.estimate.bill.supply.recipientGstin, gstinOf('29'));
  r = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)], recipientGstin: gstinOf('27') }));
  assert.equal(r.estimate.bill.supply.type, 'INTRA');
  assert.equal(r.estimate.bill.totals.cgstPaise, 900);
  r = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)] }));
  assert.equal(r.estimate.bill.supply.type, 'INTRA');
});

test('8 versions: version 2 points to version 1; same lines is NO_CHANGE; a reason is needed once approved; a master price change does not touch a saved version', () => {
  const env = makeEnv().seed();
  const v1 = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)] })).estimate;
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)] })), 'NO_CHANGE');
  const v2 = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 2)] })).estimate;
  assert.equal(v2.version, 2);
  assert.equal(v2.prevId, v1.id);
  expectOk(env.bill.recordApproval({ jobId: 'J-1', version: 2, method: 'CALL' }, env.ctx(MANAGER)));
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 3)] })), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 3)], reason: 'abc' })), 'REASON_REQUIRED');
  const v3 = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 3)], reason: 'customer wants a third battery' })).estimate;
  assert.equal(v3.version, 3);
  assert.equal(v3.reason, 'customer wants a third battery');
  const text = JSON.stringify(env.store.read('invoices').records[0]);
  env.editRow('part', 'P1', { sellPricePaise: 15000 });
  assert.equal(JSON.stringify(env.store.read('invoices').records[0]), text);
  assert.equal(env.bill.estimateView('J-1', env.ctx(MANAGER)).versions[0].bill.lines[0].unitPricePaise, 11800);
});

test('9 roles: greeter and trainee refused, technician allowed by default, cashier only after the Owner lists the role; broken sessions; closed and void jobs', () => {
  const env = makeEnv().seed();
  env.job('J-2', { status: 'closed' });
  env.job('J-3', { voided: true });
  const one = { jobId: 'J-1', lines: [L('PART', 'P1', 1)] };
  for (const s of [GREETER, TRAINEE]) expectFail(unchanged(env, () => est(env, one, s)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => est(env, one, CASHIER)), 'NOT_ALLOWED');
  for (const s of [NONE, null, undefined, { ok: true, tier: 'owner', isOwner: false }]) expectFail(unchanged(env, () => env.bill.saveEstimate(one, { session: s, clientRef: env.ref() })), 'SESSION_REQUIRED');
  expectOk(est(env, one, TECH));
  expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 2)] }, OWNER));
  expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 3)] }, MANAGER));
  env.setConfig({ billingRoles: ['Cashier'] });
  expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 4)] }, CASHIER));
  expectFail(unchanged(env, () => est(env, { jobId: 'J-2', lines: [L('PART', 'P1', 1)] })), 'JOB_CLOSED');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-3', lines: [L('PART', 'P1', 1)] })), 'JOB_VOIDED');
  expectFail(unchanged(env, () => est(env, { jobId: 'J-9', lines: [L('PART', 'P1', 1)] })), 'JOB_NOT_FOUND');
});

test('10 a retry with the same clientRef returns the saved record and writes nothing; the same ref for an approval is a duplicate', () => {
  const env = makeEnv().seed();
  const a = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)] }, MANAGER, { clientRef: 'REF-EST-0001' }));
  const before = env.text();
  const b = expectOk(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)] }, MANAGER, { clientRef: 'REF-EST-0001' }));
  assert.equal(b.replayed, true);
  assert.equal(b.estimate.id, a.estimate.id);
  assert.equal(env.text(), before);
  expectFail(env.bill.recordApproval({ jobId: 'J-1', version: 1, method: 'CALL' }, env.ctx(MANAGER, { clientRef: 'REF-EST-0001' })), 'SVCS_DUPLICATE_REF');
  assert.equal(env.text(), before);
  expectFail(est(env, { jobId: 'J-1', lines: [L('PART', 'P1', 1)] }, MANAGER, { clientRef: 'x' }), 'INPUT_INVALID');
});
