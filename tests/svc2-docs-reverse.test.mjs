// Service wave 2, billing documents: cancel, credit note, credit stock return (AM-3), zero-rupee note (AM-4), void, no-charge sheet,
// old bills (P3 tests 36 to 45, group D). REAL store, FIFO, masters, Phase 1 docs (edited), calc, money. Figures worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, CASHIER } from './lib/svc2-docs-env.mjs';

const P = (code, qty, d = 0) => ({ partCode: code, qty, discountPaise: d });
const LB = (code, qty) => ({ code, qty, discountPaise: 0 });
const lp = (code, qty) => ({ kind: 'PART', code, qty });
const ll = (code, qty) => ({ kind: 'LABOUR', code, qty });
const billOf = (env, input, session = MANAGER) => expectOk(env.bill.issueInvoice(input, env.ctx(session))).invoice;
function job(env, id, lines, issues = []) {
  env.job(id);
  env.estimateApproved(id, lines);
  for (const [code, qty, extra] of issues) env.issue(id, [{ partCode: code, qty }], extra || {});
  return id;
}
const cnOf = (env, invoiceNo, request, extra = {}, session = OWNER, pin = true) => env.bill.issueCreditNote({
  invoiceNo, mode: request.kind === 'FULL' ? 'FULL' : 'PARTIAL', reasonClass: 'RETURN', reason: 'goods came back', request, ...extra
}, pin ? env.ctxPin(session) : env.ctx(session));
const mvIds = (env, id) => env.stock.jobStock(id).issues.map((i) => i.movementId);
const retCn = (env, jobId, cn, mv, qty) => env.stock.returnFromJob({ jobId, creditNoteNo: cn, lines: [{ issueMovementId: mv, qty, returnReason: 'UNUSED' }] }, env.ctx(MANAGER));

test('36 cancel: Owner with PIN on the same day; the number stays used, parts fall back to unbilled, a new bill takes the next number, the estimate is editable again', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lp('P1', 1), ll('L1', 1)], [['P1', 1]]);
  const inv = billOf(env, { jobId: 'J-1', parts: [P('P1', 1)], labour: [LB('L1', 1)] });
  assert.equal(inv.no, 'SV/2026-27/0001');
  const r = expectOk(env.bill.cancelInvoice(inv.no, 'wrong customer billed', env.ctxPin(OWNER)));
  assert.equal(r.invoice.state, 'CANCELLED');
  assert.equal(r.invoice.cancel.reason, 'wrong customer billed');
  assert.equal(env.bill.activeInvoiceNo('J-1'), '');
  assert.equal(env.bill.isLocked('J-1'), false);
  assert.deepEqual(env.bill.issueOutcomes('J-1', env.ctx(MANAGER)).outcomes.map((o) => o.outcome), ['UNBILLED']);
  assert.equal(env.bill.unbilledIssues(env.ctx(MANAGER)).rows.length, 1);
  expectOk(env.bill.saveEstimate({ jobId: 'J-1', lines: [lp('P1', 1)], reason: 'rework the quote' }, env.ctx(MANAGER)));
  const again = billOf(env, { jobId: 'J-1', parts: [P('P1', 1)], labour: [LB('L1', 1)], approvalOverrideReason: 'estimate was reworked' }, OWNER);
  assert.equal(again.no, 'SV/2026-27/0002');
}, undefined);

test('37 cancel refusals leave storage identical; money taken after billing does not stop a cancel', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [ll('L1', 1)]);
  const inv = billOf(env, { jobId: 'J-1', labour: [LB('L1', 1)] });
  const c = (no, reason, session = OWNER, pin = true) => env.bill.cancelInvoice(no, reason, pin ? env.ctxPin(session) : env.ctx(session));
  expectFail(unchanged(env, () => c(inv.no, 'wrong job billed', MANAGER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => c(inv.no, 'wrong job billed', OWNER, false)), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => c(inv.no, 'oops')), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => c('SV/2026-27/0099', 'wrong job billed')), 'DOC_NOT_FOUND');
  env.clock.advance(86400000);
  expectFail(unchanged(env, () => c(inv.no, 'wrong job billed')), 'CANCEL_SAME_DAY_ONLY');
  env.clock.advance(-86400000 + 1);
  // money taken on the bill: cancelling is allowed, the money stays held
  expectOk(env.money.takeBalance({ jobId: 'J-1', invoiceNo: inv.no, amountPaise: 5000, payMode: 'Cash' }, env.ctx(OWNER)));
  expectOk(c(inv.no, 'wrong job billed'));
  assert.equal(env.money.jobMoney('J-1').netPaise, 5000);
  expectFail(unchanged(env, () => c(inv.no, 'wrong job billed')), 'STATE_INVALID');
  // a credit note blocks a cancel
  job(env, 'J-2', [ll('L1', 1)]);
  const i2 = billOf(env, { jobId: 'J-2', labour: [LB('L1', 1)] });
  expectOk(cnOf(env, i2.no, { kind: 'LINES', lines: [{ lineNo: 1, taxablePaise: 1000 }] }));
  expectFail(unchanged(env, () => c(i2.no, 'wrong job billed')), 'CANCEL_HAS_CREDIT');
});

test('38 a PIN 121 seconds old and a PIN from the future are refused for every PIN action', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [ll('L1', 1)]);
  const inv = billOf(env, { jobId: 'J-1', labour: [LB('L1', 1)] });
  for (const off of [121000, -1000]) {
    const bad = { session: OWNER, stepUp: { ok: true, at: env.clock.ms() - off }, clientRef: env.ref() };
    const again = () => ({ ...bad, clientRef: env.ref() });
    expectFail(unchanged(env, () => env.bill.cancelInvoice(inv.no, 'wrong job billed', again())), 'PIN_REQUIRED');
    expectFail(unchanged(env, () => env.bill.issueCreditNote({ invoiceNo: inv.no, mode: 'FULL', reasonClass: 'OTHER', reason: 'goods came back' }, again())), 'PIN_REQUIRED');
    expectFail(unchanged(env, () => env.bill.voidJob('J-1', 'customer left the job', again())), 'PIN_REQUIRED');
    expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: 100 }, again())), 'PIN_REQUIRED');
    expectFail(unchanged(env, () => env.bill.cancelNoChargeSheet('INV-000009', 'wrong sheet', again())), 'PIN_REQUIRED');
    expectFail(unchanged(env, () => env.bill.importLegacy([], again())), 'PIN_REQUIRED');
  }
  expectOk(env.bill.cancelInvoice(inv.no, 'wrong job billed', { session: OWNER, stepUp: { ok: true, at: env.clock.ms() - 120000 }, clientRef: env.ref() }));
});

test('39 credit note in full: figures equal the bill, number SCN/26-27/0001, the bill is credited fully, a second note is refused', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lp('P1', 2), ll('L1', 1)], [['P1', 2]]);
  const inv = billOf(env, { jobId: 'J-1', parts: [P('P1', 2)], labour: [LB('L1', 1)] });
  const r = expectOk(cnOf(env, inv.no, { kind: 'FULL' }));
  assert.equal(r.creditNote.no, 'SCN/26-27/0001');
  assert.equal(r.creditNote.totalPaise, 35400);
  assert.equal(r.creditNote.credit.taxablePaise, 30000);
  assert.equal(r.creditNote.credit.cgstPaise, 2700);
  assert.equal(r.creditNote.credit.sgstPaise, 2700);
  assert.equal(r.creditNote.credit.roundOffPaise, 0);
  assert.equal(r.invoice.state, 'CREDITED_FULLY');
  assert.equal(r.invoice.creditedPaise, 35400);
  assert.deepEqual(r.creditNote.request, { kind: 'FULL' });
  const again = cnOf(env, inv.no, { kind: 'FULL' });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'CREDIT_NOTHING');
  assert.equal(env.bill.invoicesOn('2026-11-18').count, 1);
  assert.deepEqual(env.bill.creditNotesOn('2026-11-18'), { ok: true, count: 1, paise: 35400 });
});

test('40 partial notes by quantity and by amount add up; beyond the rest, a cancelled bill, a warranty line and the wrong roles are refused', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 2 }]);
  const inv = billOf(env, { jobId: 'J-1', labour: [LB('L1', 2)] });
  assert.equal(inv.totalPaise, 23600);
  const n1 = expectOk(cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] })).creditNote;
  assert.equal(n1.totalPaise, 11800);
  assert.equal(env.bill.getInvoice(inv.no, env.ctx(MANAGER)).invoice.state, 'CREDITED_PARTLY');
  // price correction of Rs 10.00 taxable: tax 1.80 gives 11.80; the running round-off makes the note Rs 12.00 (+0.20)
  const n2 = expectOk(cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, taxablePaise: 1000 }] })).creditNote;
  assert.equal(n2.totalPaise, 1200);
  assert.equal(n2.credit.roundOffPaise, 20);
  assert.equal(n2.no, 'SCN/26-27/0002');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, taxablePaise: 9001 }] })), 'CREDIT_EXCEEDS_TAXABLE');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] })), 'CREDIT_EXCEEDS_LINE');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, {}, MANAGER, false)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, {}, OWNER, false)), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, { reasonClass: 'BAD' })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, { mode: 'FULL' })), 'INPUT_INVALID');
  env.setConfig({ billingRoles: ['Cashier'] });
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'FULL' }, {}, CASHIER, false)), 'NOT_ALLOWED');
  job(env, 'J-2', [ll('L1', 1)]);
  const i2 = billOf(env, { jobId: 'J-2', labour: [LB('L1', 1)] });
  expectOk(env.bill.cancelInvoice(i2.no, 'wrong job billed', env.ctxPin(OWNER)));
  expectFail(unchanged(env, () => cnOf(env, i2.no, { kind: 'FULL' })), 'INVOICE_CANCELLED');
  expectFail(unchanged(env, () => cnOf(env, 'SV/2026-27/0077', { kind: 'FULL' })), 'DOC_NOT_FOUND');
});

test('AM-4 a zero-rupee credit note is allowed when it takes a part back and is refused when it takes nothing back', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lp('P1', 2)], [['P1', 2]]);
  const inv = billOf(env, { jobId: 'J-1', parts: [P('P1', 2)] });
  // first the whole price is credited as a price correction (23600), the goods stay with the customer
  const n1 = expectOk(cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, taxablePaise: 20000 }] })).creditNote;
  assert.equal(n1.totalPaise, 23600);
  // now one piece comes back for no money: Rs 0.00
  const req = { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] };
  expectFail(unchanged(env, () => cnOf(env, inv.no, req)), 'CREDIT_EMPTY');
  expectFail(unchanged(env, () => cnOf(env, inv.no, req, { stock: [{ lineNo: 1, qty: 2 }] })), 'INPUT_INVALID');
  const z = expectOk(cnOf(env, inv.no, req, { stock: [{ lineNo: 1, qty: 1 }] })).creditNote;
  assert.equal(z.totalPaise, 0);
  assert.deepEqual(z.stock, [{ lineNo: 1, qty: 1 }]);
  assert.deepEqual(z.request, req);
  // the stored bill and the stored notes pass the calc layer's own checks (verify before storing and before crediting)
  assert.equal(env.bill.verifyCost(inv.no, env.ctx(MANAGER)).ok, true);
  expectOk(retCn(env, 'J-1', z.no, mvIds(env, 'J-1')[0], 1));
  assert.equal(env.onHand('P1'), 5);
});

test('AM-3 credit stock return: never more pieces than the note credited, never the same note twice beyond that, only the credited lines', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lp('P1', 3), lp('P2', 1)], [['P1', 3], ['P2', 1]]);
  const inv = billOf(env, { jobId: 'J-1', parts: [P('P1', 3), P('P2', 1)] });
  const [m1, m2] = mvIds(env, 'J-1');
  assert.equal(env.stockValue('P1'), 36000);
  // stock may not list more pieces than the note credits, a labour-like line, an unknown line or a repeat
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] }, { stock: [{ lineNo: 1, qty: 3 }] })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] }, { stock: [{ lineNo: 9, qty: 1 }] })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] }, { stock: [{ lineNo: 1, qty: 1 }, { lineNo: 1, qty: 1 }] })), 'DUPLICATE_LINE');
  const cn = expectOk(cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] }, { stock: [{ lineNo: 1, qty: 2 }] })).creditNote;
  assert.equal(cn.totalPaise, 23600);
  assert.deepEqual(env.bill.pendingCreditReturns(env.ctx(MANAGER)).rows.map((r) => [r.cnNo, r.partCode, r.creditedQty, r.returnedQty, r.pendingQty]), [[cn.no, 'P1', 2, 0, 2]]);
  const stockBefore = env.text();
  // (a) more than credited in one return: refused by the port, the job is not touched
  const over = retCn(env, 'J-1', cn.no, m1, 3);
  expectFail(over, 'JOB_CLOSED');
  assert.equal(over.detail.port, 'CREDIT_RETURN_INVALID');
  assert.equal(env.text(), stockBefore);
  // a line that was not credited (the P2 piece), another job, and an unknown note
  expectFail(retCn(env, 'J-1', cn.no, m2, 1), 'JOB_CLOSED');
  expectFail(retCn(env, 'J-1', 'SCN/26-27/0099', m1, 1), 'JOB_CLOSED');
  env.job('J-2');
  expectFail(retCn(env, 'J-2', cn.no, m1, 1), 'ISSUE_LINE_NOT_FOUND');
  assert.equal(env.text(), stockBefore);
  // 1 + 1 pieces are fine, the third piece under the same note is refused (b)
  expectOk(retCn(env, 'J-1', cn.no, m1, 1));
  assert.equal(env.bill.pendingCreditReturns(env.ctx(MANAGER)).rows[0].pendingQty, 1);
  expectOk(retCn(env, 'J-1', cn.no, m1, 1));
  assert.deepEqual(env.bill.pendingCreditReturns(env.ctx(MANAGER)).rows, []);
  const third = retCn(env, 'J-1', cn.no, m1, 1);
  expectFail(third, 'JOB_CLOSED');
  assert.equal(third.detail.port, 'CREDIT_RETURN_INVALID');
  // 3 pieces were issued at Rs 100.00 (layer 1) and 2 came back: 1 piece left on the job, value of 5 pieces on the shelf
  assert.equal(env.onHand('P1'), 5);
  // the shelf had 3 pieces at Rs 120.00; the 2 pieces came back to the Rs 100.00 layer they left
  assert.equal(env.stockValue('P1'), 36000 + 20000);
  // the direct port answers the same way
  assert.equal(env.bill.creditReturnCheck('J-1', cn.no, [{ issueMovementId: m1, qty: 1 }]).ok, false);
  assert.equal(env.bill.creditReturnCheck('J-1', cn.no, [{ issueMovementId: m1, qty: 1 }]).code, 'CREDIT_RETURN_INVALID');
  // an ordinary return on the closed job without a credit note is still refused
  expectFail(env.ret('J-1', m1, 1), 'JOB_CLOSED');
});

test('41 stock value after a credit return is exact: the original FIFO layer is restored', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lp('P1', 4)], [['P1', 4]]);
  // issue 4 = 3 x 100.00 + 1 x 120.00 = 420.00; the shelf keeps 2 x 120.00
  assert.equal(env.stockValue('P1'), 24000);
  const inv = billOf(env, { jobId: 'J-1', parts: [P('P1', 4)] });
  assert.equal(inv.stock[0].costPaise, 42000);
  const cn = expectOk(cnOf(env, inv.no, { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] }, { stock: [{ lineNo: 1, qty: 2 }] })).creditNote;
  expectOk(retCn(env, 'J-1', cn.no, mvIds(env, 'J-1')[0], 2));
  // returns go to the layers used last: 1 x 120.00 and 1 x 100.00 = 220.00; the shelf is 240.00 + 220.00
  assert.equal(env.onHand('P1'), 4);
  assert.equal(env.stockValue('P1'), 46000 - 0);
  assert.equal(expectOk(env.bill.verifyCost(inv.no, env.ctx(MANAGER))).partsPaise, 42000);
  assert.equal(expectOk(env.bill.costOfSales({}, env.ctx(MANAGER))).invoices[0].creditPaise, 22000);
});

test('42 void: each refusal in turn, then success; a voided job takes nothing more', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [lp('P1', 1)]);
  env.issue('J-1', [{ partCode: 'P1', qty: 1 }]);
  env.advance('J-1', 5000);
  const v = (session = OWNER, pin = true) => env.bill.voidJob('J-1', 'customer left the job', pin ? env.ctxPin(session) : env.ctx(session));
  expectFail(unchanged(env, () => v(MANAGER, false)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => v(OWNER, false)), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => v()), 'VOID_PARTS_OUTSTANDING');
  expectOk(env.ret('J-1', mvIds(env, 'J-1')[0], 1));
  expectFail(unchanged(env, () => v()), 'VOID_MONEY_HELD');
  expectOk(env.money.refund({ jobId: 'J-1', amountPaise: 5000, payMode: 'Cash', reason: 'job cancelled by customer' }, env.ctxPin(OWNER)));
  const r = expectOk(v());
  assert.equal(r.void.state.hadMoney, true);
  assert.equal(r.void.state.hadStock, true);
  assert.equal(r.void.state.hadInvoice, false);
  assert.equal(env.bill.isVoided('J-1'), true);
  expectFail(unchanged(env, () => v()), 'STATE_INVALID');
  expectFail(unchanged(env, () => env.bill.saveEstimate({ jobId: 'J-1', lines: [lp('P1', 1)] }, env.ctx(MANAGER))), 'JOB_VOIDED');
  expectFail(unchanged(env, () => env.stock.issueToJob({ jobId: 'J-1', lines: [{ partCode: 'P1', qty: 1 }] }, env.ctx(MANAGER))), 'JOB_CLOSED');
  expectFail(unchanged(env, () => env.money.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, env.ctx(OWNER))), 'JOB_VOID');
  assert.deepEqual(env.bill.blocksDelete('J-1').reasons.includes('VOIDED'), true);
  // a live bill, a pending credit return and an active sheet each stop a void
  job(env, 'J-2', [lp('P1', 1)], [['P1', 1]]);
  const inv = billOf(env, { jobId: 'J-2', parts: [P('P1', 1)] });
  expectFail(unchanged(env, () => env.bill.voidJob('J-2', 'customer left the job', env.ctxPin(OWNER))), 'VOID_INVOICE_ACTIVE');
  expectOk(cnOf(env, inv.no, { kind: 'FULL' }, { stock: [{ lineNo: 1, qty: 1 }] }));
  expectFail(unchanged(env, () => env.bill.voidJob('J-2', 'customer left the job', env.ctxPin(OWNER))), 'VOID_STOCK_PENDING');
  env.job('J-3', { paymentStatus: 'no_charge_warranty' });
  env.issue('J-3', [{ partCode: 'P2', qty: 1 }]);
  expectOk(env.bill.issueNoChargeSheet({ jobId: 'J-3', labour: [{ code: 'L1', qty: 1 }] }, env.ctx(MANAGER)));
  expectFail(unchanged(env, () => env.bill.voidJob('J-3', 'customer left the job', env.ctxPin(OWNER))), 'VOID_SHEET_ACTIVE');
});

test('43 no-charge sheet: warranty issues only, cost frozen, no amounts, one at a time, same-day cancel by the Owner with PIN, then again', () => {
  const env = makeEnv().seed();
  env.job('J-1', { paymentStatus: 'no_charge_warranty' });
  env.issue('J-1', [{ partCode: 'P2', qty: 2 }]);
  const sheet = (input = { jobId: 'J-1', labour: [{ code: 'L1', qty: 1 }], note: 'warranty repair' }, session = MANAGER) => env.bill.issueNoChargeSheet(input, env.ctx(session));
  expectFail(unchanged(env, () => sheet(undefined, CASHIER)), 'NOT_ALLOWED');
  const r = expectOk(sheet());
  assert.equal(r.sheet.state, 'ACTIVE');
  assert.equal(r.sheet.totals.partsCostPaise, 4000);
  assert.equal(r.sheet.parts[0].qty, 2);
  const text = JSON.stringify(env.store.read('invoices').records.filter((x) => x.k === 'NCS_ISSUE'));
  assert.equal(/totalPaise|gstRateBp|taxable|cgst|unitPricePaise/.test(text), false);
  expectFail(unchanged(env, () => sheet()), 'SHEET_ALREADY_ISSUED');
  expectFail(unchanged(env, () => env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER))), 'NO_CHARGE_JOB');
  expectFail(unchanged(env, () => env.bill.cancelNoChargeSheet(r.sheet.id, 'wrong sheet made', env.ctx(OWNER))), 'PIN_REQUIRED');
  expectOk(env.bill.cancelNoChargeSheet(r.sheet.id, 'wrong sheet made', env.ctxPin(OWNER)));
  expectFail(unchanged(env, () => env.bill.cancelNoChargeSheet(r.sheet.id, 'wrong sheet made', env.ctxPin(OWNER))), 'STATE_INVALID');
  assert.equal(env.bill.isLocked('J-1'), false);
  expectOk(sheet());
  env.job('J-2');
  expectFail(unchanged(env, () => sheet({ jobId: 'J-2', labour: [{ code: 'L1', qty: 1 }] })), 'NOT_NO_CHARGE_JOB');
  env.job('J-3', { paymentStatus: 'no_charge_warranty' });
  env.issue('J-3', [{ partCode: 'P1', qty: 1 }], { billing: 'CHARGEABLE' });
  expectFail(unchanged(env, () => sheet({ jobId: 'J-3', labour: [{ code: 'L1', qty: 1 }] })), 'ISSUE_BILLING_MISMATCH');
  env.job('J-4', { paymentStatus: 'no_charge_warranty' });
  expectFail(unchanged(env, () => sheet({ jobId: 'J-4' })), 'LINES_REQUIRED');
});

test('44 old bills: imported once, idempotent, shown, protect the job, continue the number, cannot be cancelled or credited', () => {
  const env = makeEnv().seed();
  const legacy = (no, jobId, extra = {}) => ({
    legacyNo: no, jobId, basis: 'SNAPSHOT_V1', invoiceDate: '2026-10-05', gstBp: 1800, listedPaise: 100000, adjustmentPaise: 0, taxablePaise: 84746, cgstPaise: 7627, sgstPaise: 7627,
    igstPaise: 0, gstPaise: 15254, roundOffPaise: 0, totalPaise: 100000, finalPaise: 100000, payMode: 'Cash', lineCount: 2, correctionCount: 0, snapshotSha: null, warn: [], ...extra
  });
  for (const j of ['O-1', 'O-2', 'O-3']) env.job(j, { status: 'closed', invoiceNo: 'x' });
  const items = [{ ref: 'LEGACY:O-1', body: legacy('SV/2026-27/0007', 'O-1') }, { ref: 'LEGACY:O-2', body: legacy('WS-2026-012', 'O-2') }, { ref: 'LEGACY:O-3', body: legacy('OLD 5', 'O-3') }];
  expectFail(unchanged(env, () => env.bill.importLegacy(items, env.ctx(OWNER))), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => env.bill.importLegacy(items, env.ctxPin(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:O-1', body: { ...legacy('SV/2026-27/0007', 'O-1'), igstPaise: 5 } }], env.ctxPin(OWNER))), 'INPUT_INVALID');
  // exactly the plan keys: an extra key (for example a customer field) or a missing key is refused
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:O-1', body: { ...legacy('SV/2026-27/0007', 'O-1'), custName: 'Invented Name' } }], env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:O-1', body: { ...legacy('SV/2026-27/0007', 'O-1'), note: 'x' } }], env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:WRONG', body: legacy('SV/2026-27/0007', 'O-1') }], env.ctxPin(OWNER))), 'INPUT_INVALID');
  const r = expectOk(env.bill.importLegacy(items, env.ctxPin(OWNER)));
  assert.equal(r.written, 3);
  assert.equal(env.store.read('invoices').records.length, 3);
  const again = unchanged(env, () => env.bill.importLegacy(items, env.ctxPin(OWNER)));
  assert.equal(again.written, 0);
  assert.equal(again.skipped.length, 3);
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:O-9', body: legacy('WS-2026-012', 'O-9') }], env.ctxPin(OWNER))), 'LEGACY_CONFLICT');
  const g = expectOk(env.bill.getInvoice('WS-2026-012', env.ctx(MANAGER))).invoice;
  assert.equal(g.legacy, true);
  assert.equal(g.totalPaise, 100000);
  assert.equal(g.state, 'LEGACY');
  assert.equal(env.bill.activeInvoiceNo('O-1'), 'SV/2026-27/0007');
  assert.equal(env.bill.jobBilling('O-1', env.ctx(MANAGER)).activeInvoice.no, 'SV/2026-27/0007');
  expectFail(unchanged(env, () => env.bill.cancelInvoice('SV/2026-27/0007', 'wrong job billed', env.ctxPin(OWNER))), 'LEGACY_READ_ONLY');
  expectFail(unchanged(env, () => cnOf(env, 'SV/2026-27/0007', { kind: 'FULL' })), 'LEGACY_READ_ONLY');
  expectOk(env.bill.linkCcptInvoice({ invoiceNo: 'WS-2026-012', ccptInvoiceNo: 'C-9' }, env.ctx(MANAGER)));
  // the next new bill continues above the highest old number of the year
  job(env, 'J-1', [ll('L1', 1)]);
  const n = expectOk(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)));
  assert.equal(n.invoice.no, 'SV/2026-27/0008');
  assert.equal(n.seeded, true);
});

test('45 blocksDelete: bill (even cancelled), credit note, sheet, approval, money; not a draft estimate; unanswerable when blocked', () => {
  const env = makeEnv().seed();
  env.job('J-2');
  env.bill.saveEstimate({ jobId: 'J-2', lines: [ll('L1', 1)] }, env.ctx(MANAGER));
  assert.deepEqual(env.bill.blocksDelete('J-2'), { ok: true, blocks: false, reasons: [] });
  env.bill.recordApproval({ jobId: 'J-2', version: 1, method: 'CALL' }, env.ctx(MANAGER));
  assert.deepEqual(env.bill.blocksDelete('J-2').reasons, ['APPROVAL']);
  const inv = billOf(env, { jobId: 'J-2', labour: [LB('L1', 1)] });
  expectOk(env.bill.cancelInvoice(inv.no, 'wrong job billed', env.ctxPin(OWNER)));
  assert.equal(env.bill.blocksDelete('J-2').blocks, true);
  assert.ok(env.bill.blocksDelete('J-2').reasons.includes('INVOICE'));
  env.job('J-3');
  env.advance('J-3', 100);
  assert.deepEqual(env.bill.blocksDelete('J-3').reasons, ['MONEY']);
  env.job('J-4', { paymentStatus: 'no_charge_warranty' });
  env.issue('J-4', [{ partCode: 'P2', qty: 1 }]);
  expectOk(env.bill.issueNoChargeSheet({ jobId: 'J-4' }, env.ctx(MANAGER)));
  assert.deepEqual(env.bill.blocksDelete('J-4').reasons, ['SHEET']);
  // a damaged billing record: the layer is blocked and answers {ok:false}
  const key = env.adapter.keys().find((k) => /invoices_v1_FY/.test(k));
  env.adapter.data.set(key, env.adapter.data.get(key).replace('"jobId":"J-2"', '"jobId":"J-9"'));
  const other = env.reopen();
  const r = other.bill.blocksDelete('J-2');
  assert.equal(r.ok, false);
  assert.ok(['SVCS_BLOCKED', 'BILLING_BLOCKED'].includes(r.code));
});
