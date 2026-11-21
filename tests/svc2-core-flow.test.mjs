// Service wave 2, billing core facade: one job end to end (estimate, approval, advance, bill, balance, close check),
// credit note with refund, the day summary, user context on every screen read, counter-sale reversal order, the credit-return port.
// REAL: store, FIFO, masters, Phase 1 docs and core (with share), calc, money, billing core. The bill layer is the kit stand-in
// (the real file is checked in svc2-core-realstack when it loads). Figures by hand:
//   Battery 250.00 + Service 1,000.00, both 18 % on top: taxable 1,250.00, tax 225.00 (CGST 112.50, SGST 112.50), total 1,475.00.
//   Credit of line 1 (battery): 250.00 + 45.00 = 295.00. Credit of line 2 (service): 1,000.00 + 180.00 = 1,180.00.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  build, OWNER, MANAGER, DESK, TECH, TRAINEE, NONE, PART_LINE, LABOUR_LINE, BILL_TOTAL, Fifo, partInput, good, refused, ref
} from './lib/svc2-core-kit.mjs';

const TODAY = '2026-11-18';

function jobEnv(extra = {}) {
  const e = build({ docs: 'fake', migrate: null, ...extra });
  e.cases.add('WS-1');
  return e;
}
function billedJob(e, advance = 50000) {
  const c = e.core;
  good(c.saveEstimate({ jobId: 'WS-1', lines: [{ kind: 'PART', code: 'P-1', qty: 1 }, { kind: 'LABOUR', code: 'L-1', qty: 1 }], reason: 'first estimate for the job' }, e.ctx()));
  good(c.recordApproval({ jobId: 'WS-1', version: 1, method: 'IN_PERSON', takenByName: 'Test Cashier', approvedAt: '2026-11-18T05:00:00.000Z', amountPaise: BILL_TOTAL }, e.ctx()));
  if (advance) good(c.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: advance, payMode: 'Cash' }, e.ctx({ clientRef: ref('adv') })));
  return good(c.issueBill({ jobId: 'WS-1', mode: 'CCPT_BILLED', ccptInvoiceNo: 'T-1', lines: [PART_LINE, LABOUR_LINE] }, e.ctx()));
}

test('end to end: estimate, approval, advance, bill, balance, close check', () => {
  const e = jobEnv();
  const c = e.core;
  assert.equal(c.closeCheck('WS-1').legacy, true, 'a job with no record closes the old way');
  good(c.saveEstimate({ jobId: 'WS-1', lines: [{ kind: 'PART', code: 'P-1', qty: 1 }], reason: 'first estimate for the job' }, e.ctx()));
  let j = good(c.getJob('WS-1', e.ctx())).job;
  assert.equal(j.state, 'estimate');
  good(c.recordApproval({ jobId: 'WS-1', version: 1, method: 'IN_PERSON', takenByName: 'Test Cashier', approvedAt: '2026-11-18T05:00:00.000Z', amountPaise: BILL_TOTAL }, e.ctx()));
  j = good(c.getJob('WS-1', e.ctx())).job;
  assert.equal(j.state, 'approved');
  assert.equal(j.approval.by, 'Test Cashier');
  assert.equal(j.approval.amountPaise, BILL_TOTAL);
  const adv = good(c.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 50000, payMode: 'Cash' }, e.ctx({ clientRef: ref('adv') })));
  assert.equal(adv.receipt.no, 'SAR/26-27/0001');
  j = good(c.getJob('WS-1', e.ctx())).job;
  assert.equal(j.heldPaise, 50000);
  assert.equal(j.paidPaise, 50000);
  const bill = good(c.issueBill({ jobId: 'WS-1', mode: 'CCPT_BILLED', ccptInvoiceNo: 'T-1', lines: [PART_LINE, LABOUR_LINE] }, e.ctx()));
  assert.equal(bill.invoice.bill.totals.totalPaise, BILL_TOTAL);
  assert.equal(bill.invoice.setOff.advancePaise, 50000);
  assert.equal(bill.invoice.balanceDuePaise, 97500);
  j = good(c.getJob('WS-1', e.ctx())).job;
  assert.equal(j.state, 'billed');
  assert.equal(j.duePaise, 97500);
  assert.equal(j.billNo, 'SV/2026-27/0001');
  assert.equal(j.heldPaise, 0);
  assert.equal(j.actions.takeBalance, true);
  assert.equal(j.actions.takeAdvance, 'INVOICE_EXISTS_USE_BALANCE');
  assert.equal(j.actions.issueBill, 'INVOICE_ALREADY_ISSUED');
  assert.equal(j.actions.cancelBill, true);
  assert.deepEqual(c.closeCheck('WS-1'), { ok: true, legacy: false, mayClose: false, why: 'BALANCE_DUE', dueNowPaise: 97500, billNo: 'SV/2026-27/0001', noCharge: false });
  // over-payment by one paisa is refused and nothing is written
  const before = e.text();
  refused(c.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97501, payMode: 'UPI' }, e.ctx({ clientRef: ref('bal') })), 'RECEIPT_EXCEEDS_BALANCE');
  assert.equal(e.text(), before);
  const bal = good(c.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97500, payMode: 'UPI', payRef: 'UPI123' }, e.ctx({ clientRef: ref('bal') })));
  assert.equal(bal.receipt.no, 'SRC/26-27/0001');
  assert.deepEqual(c.closeCheck('WS-1'), { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: 'SV/2026-27/0001', noCharge: false });
  j = good(c.getJob('WS-1', e.ctx())).job;
  assert.equal(j.state, 'paid');
  assert.equal(j.duePaise, 0);
  assert.equal(j.actions.takeBalance, 'NOTHING_DUE');
  assert.equal(c.taxRoute('WS-1').route, 'summary');
  assert.deepEqual(c.activeInvoiceNo('WS-1'), { ok: true, no: 'SV/2026-27/0001' });
  assert.deepEqual(c.jobBilled('WS-1'), { ok: true, billed: true, no: 'SV/2026-27/0001' });
  assert.deepEqual(c.jobHasRecords('WS-1'), { ok: true, has: true, reasons: ['INVOICE', 'MONEY'], anyRecord: true });
});

test('the session and the PIN stamp that reach the bill layer come from the provider (DEF-1), the clientRef from the caller', () => {
  const e = jobEnv();
  e.as(MANAGER);
  good(e.core.saveEstimate({ jobId: 'WS-1', lines: [] }, { session: OWNER, clientRef: 'abc-1234', stepUp: { ok: true, at: 5 } }));
  const call = e.docsLib.calls.filter((x) => x.method === 'saveEstimate')[0];
  const lowCtx = call.args[1];
  assert.equal(lowCtx.session.tier, 'manager');
  assert.equal(lowCtx.session.isOwner, false);
  assert.equal(lowCtx.stepUp, null, 'a made-up stamp is dropped');
  assert.equal(lowCtx.clientRef, 'abc-1234');
  assert.equal(Object.isFrozen(lowCtx.session), true);
});

test('the same clientRef is a replay: money returns the saved receipt, no second record', () => {
  const e = jobEnv();
  const d = { jobId: 'WS-1', kind: 'advance', amountPaise: 2500, payMode: 'Cash' };
  const a = good(e.core.takeReceipt(d, e.ctx({ clientRef: 'dup-ref-1' })));
  const b = good(e.core.takeReceipt(d, e.ctx({ clientRef: 'dup-ref-1' })));
  assert.equal(a.receipt.no, b.receipt.no);
  assert.equal(b.replayed, true);
  assert.equal(good(e.core.getJob('WS-1', e.ctx())).job.receipts.length, 1);
});

test('takeReceipt: kind must be advance or balance; a balance without a bill is refused; the bill number is found by the core', () => {
  const e = jobEnv();
  refused(e.core.takeReceipt({ jobId: 'WS-1', kind: 'other', amountPaise: 1, payMode: 'Cash' }, e.ctx()), 'BCORE_ARGS_INVALID');
  refused(e.core.takeReceipt(null, e.ctx()), 'BCORE_ARGS_INVALID');
  refused(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 100, payMode: 'Cash' }, e.ctx({ clientRef: ref() })), 'INVOICE_REQUIRED');
  billedJob(e, 0);
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 100, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
});

test('credit note with refund: the note first, then the refund; the job closes with nothing due', () => {
  const e = jobEnv();
  billedJob(e);
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97500, payMode: 'UPI' }, e.ctx({ clientRef: ref() })));
  const r = good(e.core.issueCreditNote({
    invoiceNo: 'SV/2026-27/0001', mode: 'LINES', reasonClass: 'RETURN', reason: 'battery returned unused',
    request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, stock: [{ lineNo: 1, qty: 1 }],
    refund: { amountPaise: 29500, payMode: 'Cash', payRef: '' }
  }, e.pinCtx({ clientRef: ref('cn') })));
  assert.equal(r.creditNote.no, 'SCN/26-27/0001');
  assert.equal(r.creditNote.credit.totalPaise, 29500);
  assert.equal(r.refund.no, 'SRF/26-27/0001');
  assert.equal(r.refund.amountPaise, 29500);
  assert.equal(r.refund.cnNo, 'SCN/26-27/0001');
  assert.equal(r.creditNotRefunded, false);
  const j = good(e.core.getJob('WS-1', e.ctx())).job;
  assert.equal(j.paidPaise, 118000);
  assert.equal(j.duePaise, 0);
  assert.equal(j.refundablePaise, 0);
  assert.equal(j.creditNotes.length, 1);
  assert.equal(j.refunds.length, 1);
  // the "refund" key is not passed to the bill layer
  const call = e.docsLib.calls.filter((x) => x.method === 'issueCreditNote')[0];
  assert.equal('refund' in call.args[0], false);
});

test('credit note whose refund fails: the note stays, the answer says credit not refunded, the money stays refundable', () => {
  const e = jobEnv();
  billedJob(e);
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97500, payMode: 'UPI' }, e.ctx({ clientRef: ref() })));
  // 300.00 asked for a 295.00 credit
  const r = good(e.core.issueCreditNote({
    invoiceNo: 'SV/2026-27/0001', mode: 'LINES', reasonClass: 'PRICE', reason: 'price corrected at the desk',
    request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, refund: { amountPaise: 30000, payMode: 'Cash', payRef: '' }
  }, e.pinCtx({ clientRef: ref('cn') })));
  assert.equal(r.creditNotRefunded, true);
  assert.equal(r.refund, null);
  assert.equal(r.refundFailed.code, 'REFUND_EXCEEDS_REFUNDABLE');
  assert.ok(r.warnings.includes('CREDIT_NOT_REFUNDED'));
  const j = good(e.core.getJob('WS-1', e.ctx())).job;
  assert.equal(j.creditNotes.length, 1);
  assert.equal(j.refundablePaise, 29500);
  // the Owner can refund exactly the credit afterwards
  good(e.core.refund({ jobId: 'WS-1', amountPaise: 29500, payMode: 'Cash', reason: 'credit note refund', cnNo: 'SCN/26-27/0001' }, e.pinCtx({ clientRef: ref('rf') })));
  assert.equal(good(e.core.getJob('WS-1', e.ctx())).job.refundablePaise, 0);
});

test('credit note without the PIN: the note is refused by the Owner-only rule only when the role is wrong; a missing PIN fails the refund step alone', () => {
  const e = jobEnv();
  billedJob(e);
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97500, payMode: 'UPI' }, e.ctx({ clientRef: ref() })));
  const r = good(e.core.issueCreditNote({
    invoiceNo: 'SV/2026-27/0001', mode: 'LINES', reasonClass: 'PRICE', reason: 'price corrected at the desk',
    request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, refund: { amountPaise: 29500, payMode: 'Cash', payRef: '' }
  }, e.ctx({ clientRef: ref('cn') })));
  assert.equal(r.creditNotRefunded, true);
  assert.equal(r.refundFailed.code, 'PIN_REQUIRED');
  e.as(MANAGER);
  refused(e.core.issueCreditNote({ invoiceNo: 'SV/2026-27/0001', mode: 'FULL', reasonClass: 'OTHER', reason: 'a long reason', request: { kind: 'FULL' } }, e.ctx()), 'NOT_ALLOWED');
});

test('day summary: figures from the money layer, bill figures from the bill layer, available fields carried unchanged', () => {
  const e = jobEnv();
  billedJob(e);
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97500, payMode: 'UPI' }, e.ctx({ clientRef: ref() })));
  const s = good(e.core.daySummary(TODAY, e.ctx()));
  assert.equal(s.receipts.Cash, 50000);
  assert.equal(s.receipts.UPI, 97500);
  assert.equal(s.receipts.total, 147500);
  assert.equal(s.netCash, 50000);
  assert.equal(s.netAll, 147500);
  assert.deepEqual(s.invoicesIssued, { available: true, count: 1, paise: 147500, cancelled: 0 });
  assert.deepEqual(s.creditNotes, { available: true, count: 0, paise: 0 });
  assert.deepEqual(s.notAvailable, []);
  // when the bill layer cannot answer, the field says "not available" and never shows a zero
  e.docsLib.state.throwOn.add('invoicesOn');
  e.docsLib.state.throwOn.add('creditNotesOn');
  const t = good(e.core.daySummary(TODAY, e.ctx()));
  assert.deepEqual(t.invoicesIssued, { available: false, count: null, paise: null, cancelled: null });
  assert.deepEqual(t.creditNotes, { available: false, count: null, paise: null });
  assert.deepEqual(t.notAvailable, ['invoicesIssued', 'creditNotes']);
  refused(e.core.daySummary('2026-13-45', e.ctx()), 'INPUT_INVALID');
});

test('every screen read passes the user context down: roles apply, a broken session is refused, the bill layer sees the user session', () => {
  const e = jobEnv();
  billedJob(e);
  const lists = [
    (ctx) => e.core.daySummary(TODAY, ctx), (ctx) => e.core.advancesHeld({}, ctx), (ctx) => e.core.listReceipts({}, ctx),
    (ctx) => e.core.legacyAdvances(ctx), (ctx) => e.core.unreceiptedCounterSales(ctx), (ctx) => e.core.listBills({}, ctx),
    (ctx) => e.core.unbilledIssues({}, ctx), (ctx) => e.core.pendingCcpt(ctx), (ctx) => e.core.pendingCreditReturns(ctx)
  ];
  for (const f of lists) {
    e.as(OWNER);
    good(f(e.ctx()));
    e.as(MANAGER);
    good(f(e.ctx()));
    for (const who of [DESK, TECH, TRAINEE]) {
      e.as(who);
      refused(f(e.ctx()), 'NOT_ALLOWED');
    }
    e.as(NONE);
    refused(f(e.ctx()), 'SESSION_REQUIRED');
  }
  e.as(MANAGER);
  e.docsLib.calls.length = 0;
  good(e.core.listBills({}, e.ctx()));
  good(e.core.unbilledIssues({}, e.ctx()));
  good(e.core.pendingCcpt(e.ctx()));
  for (const c of e.docsLib.calls.filter((x) => ['listInvoices', 'unbilledIssues', 'pendingCcpt'].includes(x.method))) {
    const ctx = c.args[c.args.length - 1];
    assert.equal(ctx.session.role, 'Store Manager', c.method);
  }
  // single reads too
  e.as(DESK);
  good(e.core.getBill('SV/2026-27/0001', e.ctx()));
  e.as(TRAINEE);
  refused(e.core.getBill('SV/2026-27/0001', e.ctx()), 'NOT_ALLOWED');
});

test('getJob for staff without amounts: status only, no money figure anywhere', () => {
  const e = jobEnv();
  billedJob(e);
  e.as(TRAINEE);
  const j = good(e.core.getJob('WS-1', e.ctx())).job;
  assert.equal(j.state, 'billed');
  assert.equal(j.amountsHidden, true);
  // A-BCORE: the actions are there (estimate staff need theirs), but for a role with no right each one is its refusal code, never true
  assert.ok(Object.keys(j.actions).length > 0);
  for (const [k, v] of Object.entries(j.actions)) assert.equal(v, 'NOT_ALLOWED', k);
  const text = JSON.stringify(j);
  for (const forbidden of ['97500', '147500', '50000', 'Paise', 'bill"', 'receipts']) assert.equal(text.includes(forbidden), false, forbidden);
});

test('getJob: unknown job, bad id, voided job', () => {
  const e = jobEnv();
  refused(e.core.getJob('NOPE', e.ctx()), 'JOB_NOT_FOUND');
  refused(e.core.getJob('', e.ctx()), 'BCORE_ARGS_INVALID');
  refused(e.core.getJob(5, e.ctx()), 'BCORE_ARGS_INVALID');
  good(e.core.voidJob({ jobId: 'WS-1', reason: 'entered twice by mistake' }, e.pinCtx()));
  const j = good(e.core.getJob('WS-1', e.ctx())).job;
  assert.equal(j.state, 'voided');
  assert.equal(j.voided, true);
  assert.equal(j.actions.takeAdvance, 'JOB_VOIDED');
  assert.equal(j.actions.issueBill, 'JOB_VOIDED');
});

test('no-charge job: the sheet makes the job closable and allows a zero final amount', () => {
  const e = jobEnv();
  e.cases.add('WS-2', { paymentStatus: 'no_charge_warranty' });
  assert.equal(e.core.allowsZeroFinal('WS-2').allows, false);
  const j0 = good(e.core.getJob('WS-2', e.ctx())).job;
  assert.equal(j0.actions.markNoCharge, true);
  assert.equal(j0.actions.issueBill, 'NO_CHARGE_JOB');
  good(e.core.issueNoChargeSheet({ jobId: 'WS-2', labour: [{ code: 'L-1', name: 'Service', qty: 1 }] }, e.ctx()));
  assert.deepEqual(e.core.closeCheck('WS-2'), { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: true });
  assert.deepEqual(e.core.allowsZeroFinal('WS-2'), { ok: true, allows: true });
  assert.equal(e.core.taxRoute('WS-2').route, 'no_charge');
  assert.equal(good(e.core.getJob('WS-2', e.ctx())).job.state, 'no_charge');
  // a job that is not marked no-charge cannot get a sheet from the card
  assert.equal(good(e.core.getJob('WS-1', e.ctx())).job.actions.markNoCharge, 'NOT_NO_CHARGE_JOB');
});

test('issueBill: discount, free-text line and not-in-CCPT rows are checked before the bill layer is called', () => {
  const e = jobEnv();
  const send = (d, who) => { e.as(who); return e.core.issueBill({ jobId: 'WS-1', lines: [PART_LINE], ...d }, e.ctx()); };
  e.docsLib.calls.length = 0;
  refused(send({ billDiscountPaise: 100 }, DESK), 'DISCOUNT_NOT_ALLOWED');
  refused(send({ billDiscountPaise: 100 }, MANAGER), 'ABOVE_MANAGER_LIMIT');
  refused(send({ parts: [{ partCode: 'P-1', qty: 1, discountPaise: 5 }] }, MANAGER), 'ABOVE_MANAGER_LIMIT');
  refused(send({ other: [{ name: 'Courier', qty: 1, unitPricePaise: 100 }] }, DESK), 'NOT_ALLOWED');
  refused(send({ mode: 'NOT_IN_CCPT' }, MANAGER), 'NOT_ALLOWED');
  refused(send({}, TRAINEE), 'NOT_ALLOWED');
  assert.equal(e.docsLib.calls.filter((c) => c.method === 'issueInvoice').length, 0);
  good(send({ mode: 'NOT_IN_CCPT' }, OWNER));
});

test('cancel bill and CCPT number: a change of an existing number is an Owner row, a first number is a desk row', () => {
  const e = jobEnv();
  billedJob(e);
  e.as(DESK);
  // the bill was made with a CCPT number already: the desk cannot change it
  refused(e.core.addCcptNumber({ invoiceNo: 'SV/2026-27/0001', ccptInvoiceNo: 'T-2', reason: 'typed wrong earlier' }, e.ctx()), 'NOT_ALLOWED');
  e.docsLib.state.invoices[0].ccptInvoiceNo = '';
  good(e.core.addCcptNumber({ invoiceNo: 'SV/2026-27/0001', ccptInvoiceNo: 'T-2', reason: 'number came later' }, e.ctx()));
  refused(e.core.cancelBill({ invoiceNo: 'SV/2026-27/0001', reason: 'wrong bill made' }, e.ctx()), 'NOT_ALLOWED');
  e.as(OWNER);
  good(e.core.cancelBill({ invoiceNo: 'SV/2026-27/0001', reason: 'wrong bill made' }, e.pinCtx()));
  assert.equal(good(e.core.getJob('WS-1', e.ctx())).job.state, 'cancelled');
  assert.deepEqual(e.core.closeCheck('WS-1'), { ok: true, legacy: false, mayClose: false, why: 'BILL_CANCELLED', dueNowPaise: 0, billNo: '', noCharge: false });
});

test('an old typed advance blocks the bill and the receipts until the Owner decides (money layer rule, shown on the card)', () => {
  const e = jobEnv();
  e.cases.add('WS-3', { typedAdvancePaise: 20000 });
  const j = good(e.core.getJob('WS-3', e.ctx())).job;
  assert.equal(j.legacyTypedPaise, 20000);
  assert.equal(j.actions.takeAdvance, 'LEGACY_ADVANCE_UNCONFIRMED');
  assert.equal(j.actions.issueBill, 'LEGACY_ADVANCE_UNCONFIRMED');
  assert.equal(j.actions.voidJob, 'LEGACY_ADVANCE_UNCONFIRMED');
  refused(e.core.takeReceipt({ jobId: 'WS-3', kind: 'advance', amountPaise: 100, payMode: 'Cash' }, e.ctx({ clientRef: ref() })), 'LEGACY_ADVANCE_UNCONFIRMED');
  const list = good(e.core.legacyAdvances(e.ctx()));
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].typedPaise, 20000);
  good(e.core.decideLegacyAdvance({ jobId: 'WS-3', decision: 'IN_BOOK', amountPaise: 20000 }, e.pinCtx({ clientRef: ref() })));
  e.as(MANAGER);
  refused(e.core.decideLegacyAdvance({ jobId: 'WS-3', decision: 'IN_BOOK', amountPaise: 20000 }, e.ctx({ clientRef: ref() })), 'NOT_ALLOWED');
});

/* ---------------------------------------------------------------- counter sales and credit returns (real Phase 1 core) */

function stocked(e) {
  const s = (who, extra = {}) => ({ session: who, clientRef: ref('p1'), ...extra });
  good(e.stores.savePart(partInput('P-1'), s(MANAGER)));
  good(e.stores.savePart(partInput('P-2', { flags: { counterSaleable: true } }), s(MANAGER)));
  e.clock.advance(1000);
  const grn = (code, qty, cost, no) => { good(e.stores.receiveGoods({ supplierInvoiceNo: no, supplierInvoiceDate: '2026-11-10', lines: [{ partCode: code, qtyInvoiced: qty, qtyReceived: qty, unitCostPaise: cost }] }, s(MANAGER))); e.clock.advance(1000); };
  grn('P-1', 3, 1000, 'S-1');
  grn('P-1', 5, 1200, 'S-2');
  grn('P-2', 5, 500, 'S-3');
  return s;
}
function sale(e, s) {
  const r = good(e.stores.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 2, unitPricePaise: 900 }] }, s(MANAGER)));
  e.clock.advance(1000);
  return r.doc.no;
}
const partQty = (e, code) => Fifo.partBalance(e.handle.docs.fifoState(), code).qty;

test('counter sale: marked for a receipt, listed with no receipt, the receipt takes the sale amount only (store-class staff may take it)', () => {
  const e = build({ docs: 'fake', migrate: null });
  good(e.stores.setConfig({ storeRoles: ['Technician'] }, e.pinCtx({ clientRef: 'sc-cfg-1' })));
  const s = stocked(e);
  const no = sale(e, s);
  assert.equal(no, 'CSL/26-27/0001');
  assert.equal(e.handle.docs.getDoc(no).doc.rcptDue, true);
  const open = good(e.core.unreceiptedCounterSales(e.ctx()));
  assert.deepEqual(open.rows.map((r) => [r.no, r.amountPaise, r.state]), [[no, 1800, 'NO_RECEIPT']]);
  e.as(TECH);
  refused(e.core.takeCounterReceipt({ saleNo: no, amountPaise: 1700, payMode: 'Cash' }, e.ctx({ clientRef: ref() })), 'AMOUNT_MISMATCH');
  const r = good(e.core.takeCounterReceipt({ saleNo: no, amountPaise: 1800, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  assert.equal(r.receipt.no, 'SRC/26-27/0001');
  assert.equal(r.receipt.saleNo, no);
  refused(e.core.takeCounterReceipt({ saleNo: no, amountPaise: 1800, payMode: 'Cash' }, e.ctx({ clientRef: ref() })), 'COUNTER_RECEIPT_EXISTS');
  e.as(TRAINEE);
  refused(e.core.takeCounterReceipt({ saleNo: no, amountPaise: 1800, payMode: 'Cash' }, e.ctx({ clientRef: ref() })), 'NOT_ALLOWED');
});

test('sale reversal, same day: the receipt is reversed first, then the sale; the Phase 1 reversal alone is refused while money is held', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = stocked(e);
  const no = sale(e, s);
  good(e.core.takeCounterReceipt({ saleNo: no, amountPaise: 1800, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  assert.equal(partQty(e, 'P-2'), 3);
  // the Stores core on its own is refused: money first
  const direct = e.stores.reverseDoc(no, 'sold the wrong part', s(OWNER));
  refused(direct, 'STATE_INVALID');
  assert.equal(direct.detail.state, 'RECEIPT_LIVE');
  assert.equal(partQty(e, 'P-2'), 3);
  e.as(MANAGER);
  const r = good(e.core.reverseSale({ saleNo: no, reason: 'sold the wrong part' }, e.ctx({ clientRef: ref('rs') })));
  assert.equal(r.moneyReversed, true);
  assert.equal(partQty(e, 'P-2'), 5);
  const money = good(e.core.listReceipts({}, e.ctx())).receipts;
  assert.deepEqual(money.map((x) => [x.kind, x.status]), [['SRC', 'REVERSED']]);
});

test('sale reversal on a later day: a Manager cannot (refund is an Owner row), the Owner needs the PIN; nothing is half done', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = stocked(e);
  const no = sale(e, s);
  good(e.core.takeCounterReceipt({ saleNo: no, amountPaise: 1800, payMode: 'UPI' }, e.ctx({ clientRef: ref() })));
  e.clock.advance(86400000);
  e.as(MANAGER);
  let before = e.text();
  refused(e.core.reverseSale({ saleNo: no, reason: 'customer came back' }, e.ctx({ clientRef: ref('rs') })), 'NOT_ALLOWED');
  assert.equal(e.text(), before);
  assert.equal(partQty(e, 'P-2'), 3);
  e.as(OWNER);
  before = e.text();
  refused(e.core.reverseSale({ saleNo: no, reason: 'customer came back' }, e.ctx({ clientRef: ref('rs') })), 'PIN_REQUIRED');
  assert.equal(e.text(), before);
  const r = good(e.core.reverseSale({ saleNo: no, reason: 'customer came back' }, e.pinCtx({ clientRef: ref('rs') })));
  assert.equal(r.moneyReversed, true);
  assert.equal(partQty(e, 'P-2'), 5);
  const kinds = good(e.core.listReceipts({}, e.ctx())).receipts.map((x) => x.kind);
  assert.deepEqual(kinds, ['SRC', 'SRF']);
});

test('sale reversal: a sale with no receipt reverses at once; a receipt reversed on its own leaves the sale listed as "receipt reversed"', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = stocked(e);
  const a = sale(e, s);
  const b = sale(e, s);
  e.as(MANAGER);
  const r = good(e.core.reverseSale({ saleNo: a, reason: 'sold the wrong part' }, e.ctx({ clientRef: ref('rs') })));
  assert.equal(r.moneyReversed, false);
  good(e.core.takeCounterReceipt({ saleNo: b, amountPaise: 1800, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  good(e.core.reverseReceipt({ no: 'SRC/26-27/0001', reason: 'typed by mistake' }, e.ctx()));
  const open = good(e.core.unreceiptedCounterSales(e.ctx()));
  assert.deepEqual(open.rows.map((x) => [x.no, x.state, x.receiptNo]), [[b, 'RECEIPT_REVERSED', 'SRC/26-27/0001']]);
  good(e.core.reverseSale({ saleNo: b, reason: 'sold the wrong part' }, e.ctx({ clientRef: ref('rs') })));
  assert.equal(partQty(e, 'P-2'), 5);
  refused(e.core.reverseSale({ saleNo: 'CSL/26-27/0099', reason: 'sold the wrong part' }, e.ctx()), 'SALE_NOT_FOUND');
  refused(e.core.reverseSale({ saleNo: '', reason: 'sold the wrong part' }, e.ctx()), 'BCORE_ARGS_INVALID');
});

test('credit-return port: a credit note of the job lets the Stores core return the parts at their original cost; an unknown note is refused', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = stocked(e);
  e.cases.add('WS-9');
  const iss = good(e.stores.issueToJob({ jobId: 'WS-9', lines: [{ partCode: 'P-1', qty: 4 }] }, s(MANAGER)));
  const value = () => Fifo.partBalance(e.handle.docs.fifoState(), 'P-1').valuePaise;
  assert.equal(value(), 4800);
  const lines = [{ issueMovementId: iss.doc.mv[0].id, qty: 4, returnReason: 'UNUSED' }];
  const bad = e.stores.returnFromJob({ jobId: 'WS-9', creditNoteNo: 'SCN/26-27/0001', lines }, s(MANAGER));
  refused(bad, 'JOB_CLOSED');
  assert.equal(value(), 4800);
  e.docsLib.state.notes.push({ no: 'SCN/26-27/0001', jobId: 'WS-9', invoiceNo: 'x' });
  good(e.stores.returnFromJob({ jobId: 'WS-9', creditNoteNo: 'SCN/26-27/0001', lines }, s(MANAGER)));
  assert.equal(value(), 9000);
  const asked = e.docsLib.calls.filter((c) => c.method === 'creditReturnCheck');
  assert.equal(asked.length, 2);
  assert.equal(asked[1].args[0], 'WS-9');
  assert.equal(asked[1].args[1], 'SCN/26-27/0001');
});

test('the port answers fail closed when the bill layer or money throws', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = stocked(e);
  e.cases.add('WS-9');
  const iss = good(e.stores.issueToJob({ jobId: 'WS-9', lines: [{ partCode: 'P-1', qty: 1 }] }, s(MANAGER)));
  e.docsLib.state.notes.push({ no: 'SCN/26-27/0001', jobId: 'WS-9', invoiceNo: 'x' });
  e.docsLib.state.throwOn.add('creditReturnCheck');
  refused(e.stores.returnFromJob({ jobId: 'WS-9', creditNoteNo: 'SCN/26-27/0001', lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, s(MANAGER)), 'JOB_CLOSED');
});
