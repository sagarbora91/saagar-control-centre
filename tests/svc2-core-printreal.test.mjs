// Service wave 2, billing core facade: print data (`printData`) for all ten types, made on the REAL stack (real bill layer, money layer,
// Phase 1 core) and passed through the REAL report model functions (www/saagar-report.js, loaded by tests/lib/fix-s02-load.mjs).
// The page adds `billTo` (plan 2.13); here the test adds an invented one. Figures typed by hand, in paise:
//   J-1  labour L1 100.00 + 18 % = 118.00 (CGST 9.00, SGST 9.00), CCPT billed; advance 50.00 Cash, balance 68.00 UPI.
//   J-2  2 x P2 (50.00 excl 18 %) = taxable 100.00, IGST 18.00, total 118.00 (buyer in state 29), Saagar tax invoice, paid 118.00 Cash;
//        credit note for 1 piece: taxable 50.00 + IGST 9.00 = 59.00, refunded 59.00 Cash.
//   Counter sale of 1 x P2 at 60.00, receipt 60.00 Cash.  J-3: 1 x P2 issued, never billed: cost 20.00.  J-4: advance 30.00 UPI.
//   J-5: old typed advance 25.00.  J-6: no-charge warranty job, 1 x P1 issued, labour on the sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReport } from './lib/fix-s02-load.mjs';
import { realEnv, good, refused, ref, OWNER, MANAGER, DESK, TECH, TRAINEE, NONE, Calc } from './lib/svc2-core-kit.mjs';

const TODAY = '2026-11-18';
const plain = (m) => JSON.parse(JSON.stringify(m));
const todayIso = () => TODAY;
const gstin29 = (() => { const f = '29ABCDE1234F1Z'; return f + Calc.gstinCheckChar(f); })();

function world() {
  const e = realEnv();
  const c = e.core;
  good(c.setConfig({ billingRoles: ['Cashier'] }, e.pinCtx({ clientRef: ref('cfg') })));
  for (const id of ['J-1', 'J-2', 'J-3', 'J-4']) e.cases.add(id);
  e.cases.add('J-5', { typedAdvancePaise: 2500 });
  e.cases.add('J-6', { paymentStatus: 'no_charge_warranty' });
  e.cases.add('J-7', { paymentStatus: 'no_charge_warranty' });
  const iss = (jobId, partCode, qty) => good(e.stores.issueToJob({ jobId, lines: [{ partCode, qty }] }, { session: MANAGER, clientRef: ref('iss') }));
  // a bill needs an estimate and the customer's approval first (the estimate total is the approved amount)
  const approved = (jobId, lines) => {
    e.as(MANAGER);
    const est = good(c.saveEstimate({ jobId, lines }, e.ctx({ clientRef: ref('est') })));
    good(c.recordApproval({ jobId, version: est.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('apr') })));
  };
  approved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  approved('J-2', [{ kind: 'PART', code: 'P2', qty: 2 }]);
  // J-1
  e.as(DESK);
  good(c.takeReceipt({ jobId: 'J-1', kind: 'advance', amountPaise: 5000, payMode: 'Cash' }, e.ctx({ clientRef: ref('a') })));
  good(c.issueBill({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED', ccptInvoiceNo: 'CC-1001' }, e.ctx({ clientRef: ref('b') })));
  good(c.takeReceipt({ jobId: 'J-1', kind: 'balance', amountPaise: 6800, payMode: 'UPI', payRef: 'UPI-0001' }, e.ctx({ clientRef: ref('c') })));
  // J-2
  iss('J-2', 'P2', 2);
  e.as(OWNER);
  good(c.issueBill({
    jobId: 'J-2', parts: [{ partCode: 'P2', qty: 2, discountPaise: 0 }], mode: 'NOT_IN_CCPT', notInCcptReason: 'customer asked for a Saagar invoice', recipientGstin: gstin29
  }, e.pinCtx({ clientRef: ref('d') })));
  good(c.takeReceipt({ jobId: 'J-2', kind: 'balance', amountPaise: 11800, payMode: 'Cash' }, e.ctx({ clientRef: ref('e') })));
  const cn = good(c.issueCreditNote({
    invoiceNo: 'SV/2026-27/0002', mode: 'PARTIAL', reasonClass: 'RETURN', reason: 'customer returned one strap', request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] },
    refund: { amountPaise: 5900, payMode: 'Cash', reason: 'credit note refund' }
  }, e.pinCtx({ clientRef: ref('f') })));
  // counter sale and its receipt
  const sale = good(e.stores.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P2', qty: 1, unitPricePaise: 6000 }] }, { session: MANAGER, clientRef: ref('s') }));
  good(c.takeCounterReceipt({ saleNo: sale.doc.no, amountPaise: 6000, payMode: 'Cash' }, e.ctx({ clientRef: ref('g') })));
  // J-3 unbilled (the list holds jobs that have a billing record, here an estimate), J-4 advance, J-6 no-charge sheet
  e.as(MANAGER);
  good(c.saveEstimate({ jobId: 'J-3', lines: [{ kind: 'PART', code: 'P2', qty: 1 }] }, e.ctx({ clientRef: ref('est3') })));
  iss('J-3', 'P2', 1);
  e.as(OWNER);
  good(c.takeReceipt({ jobId: 'J-4', kind: 'advance', amountPaise: 3000, payMode: 'UPI' }, e.ctx({ clientRef: ref('h') })));
  iss('J-6', 'P1', 1);
  // J-7: a warranty part issued, the sheet not made yet: the list shows it as a WARRANTY row
  e.as(MANAGER);
  good(c.saveEstimate({ jobId: 'J-7', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }] }, e.ctx({ clientRef: ref('est7') })));
  iss('J-7', 'P1', 1);
  e.as(OWNER);
  good(c.issueNoChargeSheet({ jobId: 'J-6', labour: [{ code: 'L1', qty: 1 }] }, e.ctx({ clientRef: ref('i') })));
  return { e, cn: cn.creditNote.no, saleNo: sale.doc.no };
}

const BILL_TO = { name: 'Ana Tester', address: 'Flat 4, Example Lane, Testville', gstin: '', state: 'Maharashtra', stateCode: '27', mobile: '9000000001' };
// what the page glue does (plan 2.13): add billTo to the six customer documents
function withBillTo(type, d) {
  const o = plain(d);
  if (['serviceBillSummary', 'serviceTaxInvoiceV2', 'serviceCreditNote', 'serviceReceipt', 'serviceRefundVoucher', 'serviceWarrantySheet'].includes(type)) o.billTo = Object.assign({}, BILL_TO);
  return o;
}
function model(type, svcData, args) {
  const R = loadReport({ role: 'owner', globals: { todayIso } }).R;
  return plain(R._buildModel(type, Object.assign({ svcData: withBillTo(type, svcData) }, args || {})));
}
const failed = (m) => JSON.stringify(m).includes('[RPT_');
const hdr = (m) => m.blocks[0];
const tables = (m) => m.blocks.filter((b) => b.t === 'table');

test('every type is made on the real stack and accepted by the real report model (no refusal block)', () => {
  const { e, cn, saleNo } = world();
  e.as(OWNER);
  const want = [
    ['serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }],
    ['serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0002' }],
    ['serviceCreditNote', { noteNo: cn }],
    ['serviceReceipt', { receiptNo: 'SAR/26-27/0001' }],
    ['serviceReceipt', { receiptNo: 'SRC/26-27/0001' }],
    ['serviceRefundVoucher', { voucherNo: 'SRF/26-27/0001' }],
    ['serviceWarrantySheet', { jobId: 'J-6' }],
    ['serviceUnbilledIssues', {}],
    ['serviceDaySummary', { date: TODAY }],
    ['serviceAdvancesHeld', {}],
    ['serviceRevenue', { from: TODAY, to: TODAY }]
  ];
  for (const [type, args] of want) {
    const r = good(e.core.printData(type, args, e.ctx()));
    assert.equal(r.svcData.ok, true, type);
    const m = model(type, r.svcData, args);
    assert.equal(failed(m), false, type + ' was refused by the report model: ' + JSON.stringify(m).slice(0, 400));
  }
  assert.ok(saleNo.startsWith('CSL/'));
});

test('tax invoice (Saagar, inter-state): the supply is the calc object, the lines carry the price basis, the figures are the bill', () => {
  const { e } = world();
  e.as(OWNER);
  const d = good(e.core.printData('serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0002' }, e.ctx())).svcData;
  assert.equal('billTo' in d, false, 'billTo is added by the page, never by the core');
  const v = d.invoice;
  assert.deepEqual(v.supply, { type: 'INTER', placeOfSupplyStateCode: '29' });
  assert.equal(v.placeOfSupplyState, 'Karnataka');
  assert.equal(v.recipientGstin, gstin29);
  assert.equal(v.billedIn, 'SAAGAR');
  assert.equal(v.ccptInvoiceNo, '');
  assert.equal(v.lines.length, 1);
  const l = v.lines[0];
  assert.deepEqual([l.kind, l.partCode, l.qty, l.priceBasis, l.unitPricePaise, l.discountPaise, l.taxablePaise, l.rateBp], ['PART', 'P2', 2, 'EXCL', 5000, 0, 10000, 1800]);
  assert.deepEqual([l.cgstPaise, l.sgstPaise, l.igstPaise, l.totalPaise], [0, 0, 1800, 11800]);
  assert.equal(v.totalPaise, 11800);
  assert.equal(v.roundOffPaise, 0);
  assert.equal(v.advanceSetOffPaise, 0);
  assert.equal(v.balancePaise, 11800);
  const m = model('serviceTaxInvoiceV2', d, { invoiceNo: 'SV/2026-27/0002' });
  assert.equal(hdr(m).title, 'TAX INVOICE');
  assert.equal(hdr(m).chip, 'SV/2026-27/0002');
  assert.deepEqual(tables(m)[0].raw.map((r) => [r[5], r[6], r[8]]), [[0, 10000, 1800]]);
});

test('bill summary of a CCPT job: the advance is set off, the receipts are listed oldest first, the figures are the bill', () => {
  const { e } = world();
  e.as(OWNER);
  const d = good(e.core.printData('serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }, e.ctx())).svcData;
  const v = d.invoice;
  assert.equal(v.billedIn, 'CCPT');
  assert.equal(v.ccptInvoiceNo, 'CC-1001');
  assert.deepEqual(v.supply, { type: 'INTRA', placeOfSupplyStateCode: '27' });
  assert.deepEqual([v.totalPaise, v.advanceSetOffPaise, v.balancePaise], [11800, 5000, 6800]);
  assert.deepEqual(v.advances.map((a) => [a.receiptNo, a.amountPaise]), [['SAR/26-27/0001', 5000]]);
  assert.deepEqual(d.receipts.map((r) => [r.receiptNo, r.receiptKind, r.mode, r.amountPaise]), [['SAR/26-27/0001', 'ADVANCE', 'Cash', 5000], ['SRC/26-27/0001', 'BALANCE', 'UPI', 6800]]);
  assert.deepEqual([v.lines[0].cgstPaise, v.lines[0].sgstPaise, v.lines[0].igstPaise], [900, 900, 0]);
  assert.equal(d.watch, 'Test watch J-1');
  // the wrong document for the job is refused, as the page routes by the mode
  const w1 = refused(e.core.printData('serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0001' }, e.ctx()), 'WRONG_DOC');
  const w2 = refused(e.core.printData('serviceBillSummary', { invoiceNo: 'SV/2026-27/0002' }, e.ctx()), 'WRONG_DOC');
  // Stage E round 4 (D-perf-5): both routes for both kinds of job: the right one prints, the wrong one names the right one
  assert.equal(w1.message, 'This job is billed in CCPT. Open the Service bill summary instead.');
  assert.equal(w2.message, 'This job is not billed in CCPT. Open the Tax Invoice instead.');
  good(e.core.printData('serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }, e.ctx()));
  good(e.core.printData('serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0002' }, e.ctx()));
});

test('credit note and refund voucher: lines from the stored note, the refund attached, the place of supply is the bill\'s', () => {
  const { e, cn } = world();
  e.as(OWNER);
  const d = good(e.core.printData('serviceCreditNote', { noteNo: cn }, e.ctx())).svcData;
  const n = d.note;
  assert.deepEqual([n.noteNo, n.invoiceNo, n.billedIn, n.reasonLabel], [cn, 'SV/2026-27/0002', 'SAAGAR', 'Return of part']);
  assert.deepEqual(n.supply, { type: 'INTER', placeOfSupplyStateCode: '29' });
  assert.equal(n.lines.length, 1);
  assert.deepEqual([n.lines[0].qty, n.lines[0].taxablePaise, n.lines[0].igstPaise, n.lines[0].totalPaise], [1, 5000, 900, 5900]);
  assert.equal(n.totalPaise, 5900);
  assert.deepEqual([n.refund.voucherNo, n.refund.mode, n.refund.amountPaise], ['SRF/26-27/0001', 'Cash', 5900]);
  const v = good(e.core.printData('serviceRefundVoucher', { voucherNo: 'SRF/26-27/0001' }, e.ctx())).svcData;
  assert.deepEqual([v.refund.amountPaise, v.refund.againstKind, v.refund.againstNo, v.refund.jobId], [5900, 'CREDIT_NOTE', cn, 'J-2']);
  // the same name by its older spelling still works
  good(e.core.printData('serviceCreditNote', { creditNoteNo: cn }, e.ctx()));
  refused(e.core.printData('serviceCreditNote', {}, e.ctx()), 'PRINT_ARGS_INVALID');
});

test('receipts: advance, balance with the figures of the bill, counter receipt items add up to the amount', () => {
  const { e, saleNo } = world();
  e.as(OWNER);
  const adv = good(e.core.printData('serviceReceipt', { receiptNo: 'SAR/26-27/0001' }, e.ctx())).svcData.receipt;
  assert.deepEqual([adv.receiptKind, adv.amountPaise, adv.mode, adv.jobId], ['ADVANCE', 5000, 'Cash', 'J-1']);
  const bal = good(e.core.printData('serviceReceipt', { receiptNo: 'SRC/26-27/0001' }, e.ctx())).svcData.receipt;
  assert.deepEqual([bal.receiptKind, bal.amountPaise, bal.invoiceNo, bal.invoiceTotalPaise, bal.paidEarlierPaise, bal.balanceAfterPaise], ['BALANCE', 6800, 'SV/2026-27/0001', 11800, 5000, 0]);
  const rcpts = good(e.core.listReceipts({}, e.ctx())).receipts;
  const counter = rcpts.filter((r) => r.saleNo === saleNo)[0];
  const cr = good(e.core.printData('serviceReceipt', { receiptNo: counter.no }, e.ctx())).svcData.receipt;
  assert.equal(cr.receiptKind, 'COUNTER');
  assert.equal(cr.amountPaise, 6000);
  assert.equal(cr.items.reduce((a, i) => a + i.amountPaise, 0), 6000);
  assert.equal(cr.jobId, '');
});

test('lists: day summary with the available fields, advances held with the old typed advance, parts not billed with the cost, revenue', () => {
  const { e } = world();
  e.as(OWNER);
  const day = good(e.core.printData('serviceDaySummary', { date: TODAY }, e.ctx())).svcData;
  assert.equal(day.invoicesAvailable, true);
  assert.equal(day.creditNotesAvailable, true);
  assert.deepEqual(day.advancesHeld.available, true);
  assert.deepEqual(day.invoices.map((i) => [i.invoiceNo, i.billedIn, i.status, i.totalPaise]), [['SV/2026-27/0001', 'CCPT', 'ISSUED', 11800], ['SV/2026-27/0002', 'SAAGAR', 'ISSUED', 11800]]);
  assert.equal(day.creditNotes.length, 1);
  assert.equal(day.creditNotes[0].totalPaise, 5900);
  // receipts of the day: advance 50.00 + balance 68.00 + J-2 118.00 + counter 60.00 + J-4 advance 30.00 = 326.00; refund 59.00
  assert.equal(day.receipts.reduce((a, r) => a + r.amountPaise, 0), 32600);
  assert.equal(day.refunds.reduce((a, r) => a + r.amountPaise, 0), 5900);
  const held = good(e.core.printData('serviceAdvancesHeld', {}, e.ctx())).svcData;
  assert.deepEqual(held.rows.map((r) => [r.origin, r.jobId, r.amountPaise]).sort(), [['LEGACY', 'J-5', 2500], ['RECEIPT', 'J-4', 3000]]);
  const unb = good(e.core.printData('serviceUnbilledIssues', {}, e.ctx())).svcData;
  assert.equal(unb.costBasis, 'EXCL_GST');
  const open = unb.rows.filter((r) => r.outcome === 'OPEN');
  assert.deepEqual(open.map((r) => [r.jobId, r.partCode, r.qtyOpen, r.costPaise, r.issuedDate]), [['J-3', 'P2', 1, 2000, TODAY]]);
  assert.ok(unb.rows.some((r) => r.outcome === 'WARRANTY' && r.jobId === 'J-7' && r.costPaise === 10000));
  const rev = good(e.core.printData('serviceRevenue', { from: TODAY, to: TODAY }, e.ctx())).svcData;
  assert.deepEqual(rev.invoices.map((i) => i.invoiceNo), ['SV/2026-27/0001', 'SV/2026-27/0002']);
  assert.equal(rev.creditNotes.length, 1);
  const m = model('serviceUnbilledIssues', unb, {});
  assert.equal(failed(m), false);
});

test('a Manager sees the unbilled list with cost; the day summary says "not available" when a figure cannot be read; no customer field anywhere', () => {
  const { e } = world();
  e.as(MANAGER);
  const unb = good(e.core.printData('serviceUnbilledIssues', {}, e.ctx())).svcData;
  assert.equal(unb.rows.every((r) => Number.isInteger(r.costPaise)), true);
  for (const who of [DESK, TECH, TRAINEE]) { e.as(who); refused(e.core.printData('serviceUnbilledIssues', {}, e.ctx()), 'NOT_ALLOWED'); }
  e.as(NONE);
  refused(e.core.printData('serviceUnbilledIssues', {}, e.ctx()), 'SESSION_REQUIRED');
  e.as(OWNER);
  const all = JSON.stringify(['serviceBillSummary', 'serviceTaxInvoiceV2'].map((t, i) => e.core.printData(t, { invoiceNo: 'SV/2026-27/000' + (i + 1) }, e.ctx())));
  // plan 2.2: no key starts with a customer word (the seller's own block has name and address; it is the firm, not a customer)
  assert.equal(/"(cust|customer|client|buyer|mobile|phone|msisdn|email|e_mail|whatsapp)[A-Za-z_]*":/i.test(all), false);
  assert.equal(/"pan":/i.test(all), false);
});

test('Stage E (wiring row 17): a credit note issued before the balance receipt lowers the printed balance; a later one does not', () => {
  const { e } = world();
  const c = e.core;
  // J-8: labour L1 x 2 = taxable 200.00 + IGST 36.00 = 236.00 (buyer in state 29, Saagar tax invoice).
  // Credit note for 1 of the 2 (118.00) BEFORE any money; balance receipt 118.00.
  // By hand: bill 236.00 - credit 118.00 - paid earlier 0.00 - this 118.00 = 0.00 (the old figure said 118.00 still due).
  e.cases.add('J-8');
  e.as(MANAGER);
  const est = good(c.saveEstimate({ jobId: 'J-8', lines: [{ kind: 'LABOUR', code: 'L1', qty: 2 }] }, e.ctx({ clientRef: ref('est8') })));
  good(c.recordApproval({ jobId: 'J-8', version: est.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('apr8') })));
  e.as(OWNER);
  const bill = good(c.issueBill({ jobId: 'J-8', labour: [{ code: 'L1', qty: 2, discountPaise: 0 }], mode: 'NOT_IN_CCPT', notInCcptReason: 'customer asked for a Saagar invoice', recipientGstin: gstin29 }, e.pinCtx({ clientRef: ref('b8') })));
  good(c.issueCreditNote({ invoiceNo: bill.invoice.no, mode: 'PARTIAL', reasonClass: 'PRICE', reason: 'one labour charge was not needed', request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] } }, e.pinCtx({ clientRef: ref('cn8') })));
  e.clock.advance(60000); // the receipt is taken a minute after the credit note (only an earlier note counts)
  const rc = good(c.takeReceipt({ jobId: 'J-8', kind: 'balance', amountPaise: 11800, payMode: 'Cash' }, e.ctx({ clientRef: ref('r8') })));
  const r = good(c.printData('serviceReceipt', { receiptNo: rc.receipt.no }, e.ctx())).svcData.receipt;
  assert.deepEqual([r.invoiceTotalPaise, r.creditedEarlierPaise, r.paidEarlierPaise, r.amountPaise, r.balanceAfterPaise], [23600, 11800, 0, 11800, 0]);
  const m = model('serviceReceipt', { ok: true, kind: 'RECEIPT', receipt: r });
  assert.ok(JSON.stringify(m).includes('Less credit notes'), 'the credit note is printed');
  // J-2: paid 118.00 in full first, the credit note and its refund came later: that receipt reprints as before
  const j2 = good(c.listReceipts({ jobId: 'J-2' }, e.ctx())).receipts.filter((x) => x.kind === 'SRC')[0];
  const r2 = good(c.printData('serviceReceipt', { receiptNo: j2.no }, e.ctx())).svcData.receipt;
  assert.deepEqual([r2.invoiceTotalPaise, r2.creditedEarlierPaise, r2.paidEarlierPaise, r2.amountPaise, r2.balanceAfterPaise], [11800, 0, 0, 11800, 0]);
});
