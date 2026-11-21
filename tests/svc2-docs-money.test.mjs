// Service wave 2, billing documents with the money layer: the hand scenarios, AM-5 (role lists, day summary figures),
// N1 (an advance set off on a live bill) and N2 (an advance larger than the bill). REAL store, FIFO, Phase 1 docs, calc and money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, CASHIER } from './lib/svc2-docs-env.mjs';

const P = (code, qty) => ({ partCode: code, qty, discountPaise: 0 });
const LB = (code, qty) => ({ code, qty, discountPaise: 0 });
const lp = (code, qty) => ({ kind: 'PART', code, qty });
const ll = (code, qty) => ({ kind: 'LABOUR', code, qty });
const mgr = (env) => env.ctx(MANAGER);

test('hand scenario: estimate, approval, advance, bill over two FIFO layers, balance, partial credit note with a part back, refund', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  // S1 estimate: 4 batteries at Rs 118.00 incl 18 % = 472.00 (taxable 400.00) plus labour 100.00 + 18.00 = 590.00 in all
  const e = expectOk(env.bill.saveEstimate({ jobId: 'J-1', lines: [lp('P1', 4), ll('L1', 1)] }, mgr(env))).estimate;
  assert.equal(e.bill.totals.totalPaise, 59000);
  assert.equal(e.bill.totals.taxablePaise, 50000);
  // S2 approval: exactly the estimate total
  const a = expectOk(env.bill.recordApproval({ jobId: 'J-1', version: 1, method: 'WHATSAPP', takenByName: 'Test Desk' }, mgr(env))).approval;
  assert.equal(a.amountPaise, 59000);
  // S3 advance Rs 100.00 in cash
  assert.equal(env.advance('J-1', 10000).receipt.no, 'SAR/26-27/0001');
  // S4 issue 4 batteries: 3 x 100.00 (first layer) + 1 x 120.00 (second layer) = 420.00 of stock cost
  env.issue('J-1', [{ partCode: 'P1', qty: 4 }]);
  const mv = env.stock.movements().filter((m) => m.type === 'issue_job')[0];
  assert.deepEqual(mv.layers.map((l) => [l.qty, l.unitCostPaise]), [[3, 10000], [1, 12000]]);
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-1', parts: [P('P1', 4)], labour: [LB('L1', 1)] }, env.ctx(MANAGER))).invoice;
  assert.equal(inv.totalPaise, 59000);
  assert.equal(inv.bill.totals.cgstPaise, 4500);
  assert.equal(inv.bill.totals.sgstPaise, 4500);
  assert.equal(inv.bill.totals.roundOffPaise, 0);
  assert.equal(inv.stock[0].costPaise, 42000);
  assert.deepEqual(inv.setOff, { advancePaise: 10000, receipts: [{ no: 'SAR/26-27/0001', amountPaise: 10000 }] });
  assert.equal(inv.balanceDuePaise, 49000);
  assert.equal(env.money.jobMoney('J-1').outstandingPaise, 49000);
  // S5 balance Rs 490.00 by UPI
  expectOk(env.money.takeBalance({ jobId: 'J-1', invoiceNo: inv.no, amountPaise: 49000, payMode: 'UPI' }, env.ctx(OWNER)));
  const jm = env.money.jobMoney('J-1');
  assert.equal(jm.netPaise, 59000);
  assert.equal(jm.outstandingPaise, 0);
  // S6 credit note for 1 of 4 batteries, the part goes back: taxable 100.00 + 18.00 = 118.00
  const cn = expectOk(env.bill.issueCreditNote({
    invoiceNo: inv.no, mode: 'PARTIAL', reasonClass: 'RETURN', reason: 'customer returned one battery', request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, stock: [{ lineNo: 1, qty: 1 }]
  }, env.ctxPin(OWNER))).creditNote;
  assert.equal(cn.totalPaise, 11800);
  assert.equal(cn.credit.taxablePaise, 10000);
  assert.equal(env.stockValue('P1'), 24000);
  expectOk(env.stock.returnFromJob({ jobId: 'J-1', creditNoteNo: cn.no, lines: [{ issueMovementId: mv.id, qty: 1, returnReason: 'UNUSED' }] }, mgr(env)));
  // the piece goes back to the layer it left last (120.00): shelf 3 x 120.00
  assert.equal(env.onHand('P1'), 3);
  assert.equal(env.stockValue('P1'), 36000);
  const cos = expectOk(env.bill.costOfSales({}, mgr(env)));
  assert.deepEqual(cos.invoices, [{ no: inv.no, partsPaise: 42000, creditPaise: 12000, netPaise: 30000 }]);
  // S7 refund: paid 590.00, now owed 590.00 - 118.00 = 472.00, so at most 118.00 goes back
  assert.equal(env.money.jobMoney('J-1').refundablePaise, 11800);
  const refund = (amt) => env.money.refund({ jobId: 'J-1', amountPaise: amt, payMode: 'Cash', reason: 'credit note refund', cnNo: cn.no }, env.ctxPin(OWNER));
  expectFail(unchanged(env, () => refund(11801)), 'REFUND_EXCEEDS_REFUNDABLE');
  expectOk(refund(11800));
  const after = env.money.jobMoney('J-1');
  assert.equal(after.netPaise, 47200);
  assert.equal(after.outstandingPaise, 0);
  assert.equal(after.refundablePaise, 0);
  // the day figures come from this layer: bills issued, credit notes, receipts, refunds
  const day = env.money.daySummary('2026-11-18', mgr(env));
  assert.deepEqual(day.invoicesIssued, { available: true, count: 1, paise: 59000, cancelled: 0 });
  assert.deepEqual(day.creditNotes, { available: true, count: 1, paise: 11800 });
  assert.equal(day.receipts.total, 59000);
  assert.equal(day.refunds.total, 11800);
  assert.equal(day.netAll, 47200);
  assert.deepEqual(day.notAvailable, []);
  assert.equal(env.bill.activeInvoiceNo('J-1'), inv.no);
});

test('N2 an advance larger than the bill: the bill is refused with the excess named; the Owner refunds the extra, then the bill issues', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [ll('L1', 1)]);
  env.advance('J-1', 15000);
  const input = { jobId: 'J-1', labour: [LB('L1', 1)] };
  const r = unchanged(env, () => env.bill.issueInvoice(input, env.ctx(MANAGER)));
  expectFail(r, 'ADVANCE_EXCEEDS_BILL');
  assert.deepEqual(r.detail, { heldPaise: 15000, billPaise: 11800, excessPaise: 3200 });
  expectFail(unchanged(env, () => env.bill.previewInvoice(input, env.ctx(MANAGER))), 'ADVANCE_EXCEEDS_BILL');
  // the route: refund the unapplied advance (no bill is live, so no credit note is needed), then bill
  expectFail(unchanged(env, () => env.money.refund({ jobId: 'J-1', amountPaise: 3200, payMode: 'Cash', reason: 'extra advance back' }, env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectOk(env.money.refund({ jobId: 'J-1', amountPaise: 3200, payMode: 'Cash', reason: 'extra advance back' }, env.ctxPin(OWNER)));
  const inv = expectOk(env.bill.issueInvoice(input, env.ctx(MANAGER))).invoice;
  assert.equal(inv.setOff.advancePaise, 11800);
  assert.equal(inv.balanceDuePaise, 0);
  assert.equal(env.money.jobMoney('J-1').outstandingPaise, 0);
  assert.equal(env.money.jobMoney('J-1').refundablePaise, 0);
});

test('N1 a receipt set off on a live bill is flagged and may not be reversed until the bill is cancelled', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [ll('L1', 1)]);
  const adv = env.advance('J-1', 5000).receipt.no;
  assert.deepEqual(env.bill.receiptSetOff(adv), { ok: true, setOff: false, invoiceNo: '' });
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER))).invoice;
  assert.deepEqual(env.bill.receiptSetOff(adv), { ok: true, setOff: true, invoiceNo: inv.no });
  assert.equal(env.bill.docsView().receiptSetOff(adv).setOff, true);
  // the guard the facade must put in front of money.reverse
  const guarded = (no) => (env.bill.receiptSetOff(no).setOff ? { ok: false, code: 'RECEIPT_SET_OFF', message: 'This receipt is set off on a live bill.' } : env.money.reverse({ no, reason: 'wrong receipt typed' }, env.ctx(MANAGER)));
  expectFail(unchanged(env, () => guarded(adv)), 'RECEIPT_SET_OFF');
  assert.deepEqual(env.bill.jobBilling('J-1', mgr(env)).setOffStale, []);
  // if a caller reverses it anyway, the bill is shown as stale with the receipt named
  expectOk(env.money.reverse({ no: adv, reason: 'wrong receipt typed' }, env.ctx(MANAGER)));
  assert.deepEqual(env.bill.jobBilling('J-1', mgr(env)).setOffStale, [adv]);
  // cancelling the bill frees the receipt: a new advance on the cancelled job is reversible through the guard
  const env2 = makeEnv().seed();
  env2.job('J-1');
  env2.estimateApproved('J-1', [ll('L1', 1)]);
  const adv2 = env2.advance('J-1', 5000).receipt.no;
  const inv2 = expectOk(env2.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env2.ctx(MANAGER))).invoice;
  expectOk(env2.bill.cancelInvoice(inv2.no, 'wrong job billed', env2.ctxPin(OWNER)));
  assert.equal(env2.bill.receiptSetOff(adv2).setOff, false);
  expectOk(env2.money.reverse({ no: adv2, reason: 'wrong receipt typed' }, env2.ctx(MANAGER)));
});

test('AM-5 role lists: Store Manager is refused inside billingRoles and estimateRoles; the latest valid settings win; money and billing agree', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ billingRoles: ['Store Manager'] }, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ estimateRoles: ['Cashier', 'Store Manager'] }, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ billingRoles: ['Cashier', 'Cashier'] }, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ billingRoles: ['Owner'] }, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: -1 }, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: 100000001 }, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: 0 }, env.ctxPin(OWNER))), 'NO_CHANGE');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: 5 }, env.ctxPin(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: 5 }, env.ctx(OWNER))), 'PIN_REQUIRED');
  assert.deepEqual(env.bill.config(), { ok: true, discountLimitPaise: 0, billingRoles: [], estimateRoles: ['Technician', 'Assistant Technician'] });
  expectFail(env.money.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, env.ctx(CASHIER)), 'NOT_ALLOWED');
  env.setConfig({ billingRoles: ['Cashier'], discountLimitPaise: 700 });
  expectOk(env.money.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, env.ctx(CASHIER)));
  assert.equal(env.bill.can('INV_ISSUE', CASHIER).ok, true);
  // a newer record that is not valid (written behind the layer's back) is skipped by both layers
  const rd = env.store.head('invoices');
  const bad = env.store.append('invoices', [{ k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: ['Store Manager'], estimateRoles: [] } }], { expectRev: rd.rev, actor: { t: 'owner', r: 'Owner', m: 'Test Owner' } });
  assert.equal(bad.ok, true);
  assert.deepEqual(env.bill.config().billingRoles, ['Cashier']);
  assert.equal(env.bill.config().discountLimitPaise, 700);
  expectOk(env.money.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, env.ctx(CASHIER)));
  env.setConfig({ billingRoles: [] });
  assert.equal(env.bill.can('INV_ISSUE', CASHIER).ok, false);
  expectFail(env.money.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, env.ctx(CASHIER)), 'NOT_ALLOWED');
  // the settings are one record each and read back after a restart
  assert.deepEqual(env.reopen().bill.config(), env.bill.config());
});
