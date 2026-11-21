// Service wave 2, billing core facade: print data (`printData`) in the shapes of the report spec (P6 section 4 with plan 2.15),
// and the same data run through the real report model functions (www/saagar-report.js, loaded by tests/lib/fix-s02-load.mjs).
// Every figure is typed by hand from the bill of tests/lib/svc2-core-kit.mjs: Battery 250.00 + Service 1,000.00, 18 % on top,
// CGST and SGST 112.50 each in total, bill total 1,475.00; advance 500.00 Cash, balance 975.00 UPI; credit of the battery 295.00.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReport } from './lib/fix-s02-load.mjs';
import { build, OWNER, MANAGER, DESK, TECH, TRAINEE, NONE, PART_LINE, LABOUR_LINE, BILL_TOTAL, partInput, good, refused, ref } from './lib/svc2-core-kit.mjs';

const TODAY = '2026-11-18';
const FIRM = { name: 'Test Watch Works', gstin: '27AAAAA0000A1Z5', address: '1 Test Road, Test City', state: 'Maharashtra', stateCode: '27' };

function paidJob(mode = 'CCPT_BILLED') {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 50000, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  e.clock.advance(1000);
  good(e.core.issueBill({ jobId: 'WS-1', mode, ccptInvoiceNo: mode === 'CCPT_BILLED' ? 'T-1' : '', lines: [PART_LINE, LABOUR_LINE], warranty: [{ code: 'P-9', name: 'Gasket', qty: 2 }] }, e.ctx()));
  e.clock.advance(1000);
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'balance', amountPaise: 97500, payMode: 'UPI', payRef: 'UPI-77' }, e.ctx({ clientRef: ref() })));
  return e;
}
const print = (e, type, args, who = OWNER) => { e.as(who); return e.core.printData(type, args, e.ctx()); };

test('unknown type and missing arguments are refused with a code, nothing thrown', () => {
  const e = paidJob();
  refused(print(e, 'svcBillSummary', {}), 'PRINT_TYPE_UNKNOWN');
  refused(print(e, undefined, {}), 'PRINT_TYPE_UNKNOWN');
  refused(print(e, 'serviceBillSummary', {}), 'PRINT_ARGS_INVALID');
  refused(print(e, 'serviceBillSummary', null), 'PRINT_ARGS_INVALID');
  refused(print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0099' }), 'PRINT_NOT_FOUND');
  refused(print(e, 'serviceReceipt', { receiptNo: 'SAR/26-27/0099' }), 'PRINT_NOT_FOUND');
  refused(print(e, 'serviceCreditNote', { creditNoteNo: 'SCN/26-27/0099' }), 'PRINT_NOT_FOUND');
  refused(print(e, 'serviceWarrantySheet', { jobId: 'WS-1' }), 'PRINT_NOT_FOUND');
  refused(print(e, 'serviceDaySummary', { date: '2026-02-30' }), 'PRINT_ARGS_INVALID');
  refused(print(e, 'serviceRevenue', { from: '2026-11-18', to: '2026-11-01' }), 'PRINT_ARGS_INVALID');
});

test('rights: customer documents need amounts rights; summaries need the Owner or the Manager; a broken session gets nothing', () => {
  const e = paidJob();
  const inv = { invoiceNo: 'SV/2026-27/0001' };
  for (const who of [OWNER, MANAGER, DESK]) good(print(e, 'serviceBillSummary', inv, who));
  for (const who of [TECH, TRAINEE]) refused(print(e, 'serviceBillSummary', inv, who), 'NOT_ALLOWED');
  refused(print(e, 'serviceBillSummary', inv, NONE), 'SESSION_REQUIRED');
  for (const type of ['serviceDaySummary', 'serviceAdvancesHeld', 'serviceRevenue']) {
    const args = type === 'serviceRevenue' ? { from: TODAY, to: TODAY } : {};
    good(print(e, type, args, OWNER));
    good(print(e, type, args, MANAGER));
    refused(print(e, type, args, DESK), 'NOT_ALLOWED');
    refused(print(e, type, args, TRAINEE), 'NOT_ALLOWED');
    refused(print(e, type, args, NONE), 'SESSION_REQUIRED');
  }
  // the parts-issued list is a Manager and Owner register (plan 2.11: "not billed yet"); the real rows are tested in svc2-core-prints
  good(print(e, 'serviceUnbilledIssues', {}, OWNER));
  good(print(e, 'serviceUnbilledIssues', {}, MANAGER));
  for (const who of [DESK, TECH, TRAINEE]) refused(print(e, 'serviceUnbilledIssues', {}, who), 'NOT_ALLOWED');
  refused(print(e, 'serviceUnbilledIssues', {}, NONE), 'SESSION_REQUIRED');
});

test('serviceBillSummary: the invoice block, line by line', () => {
  const e = paidJob();
  const r = good(print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }));
  const d = r.svcData;
  assert.equal(d.ok, true);
  assert.equal(d.kind, 'INVOICE');
  assert.equal('billTo' in d, false, 'billTo is added by the page, never by the core');
  assert.equal(d.watch, 'Test watch WS-1');
  const v = d.invoice;
  assert.equal(v.v, 2);
  assert.equal(v.invoiceNo, 'SV/2026-27/0001');
  assert.equal(v.invoiceDate, TODAY);
  assert.equal(v.status, 'ISSUED');
  assert.equal(v.cancelledDate, '');
  assert.equal(v.jobId, 'WS-1');
  assert.equal(v.billedIn, 'CCPT');
  assert.equal(v.ccptInvoiceNo, 'T-1');
  assert.equal(v.rebuilt, false);
  assert.deepEqual(v.supply, { type: 'INTRA', placeOfSupplyStateCode: '27' });
  assert.equal(v.placeOfSupplyState, 'Maharashtra');
  assert.equal(v.placeOfSupplyCode, '27');
  assert.equal(v.reverseCharge, false);
  assert.deepEqual(v.firm, FIRM);
  assert.equal(v.lines.length, 2);
  assert.deepEqual(v.lines[0], {
    kind: 'PART', partCode: 'P-1', desc: 'Battery', hsn: '8506', unit: 'Pcs', qty: 1, unitPricePaise: 25000, priceBasis: 'EXCL', discountPaise: 0,
    taxablePaise: 25000, rateBp: 1800, cgstPaise: 2250, sgstPaise: 2250, igstPaise: 0, totalPaise: 29500
  });
  assert.deepEqual(v.lines[1], {
    kind: 'LABOUR', partCode: 'L-1', desc: 'Service', hsn: '9987', unit: 'Nos', qty: 1, unitPricePaise: 100000, priceBasis: 'EXCL', discountPaise: 0,
    taxablePaise: 100000, rateBp: 1800, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, totalPaise: 118000
  });
  assert.equal(v.billDiscountPaise, 0);
  assert.equal(v.roundOffPaise, 0);
  assert.equal(v.totalPaise, BILL_TOTAL);
  assert.deepEqual(v.advances, [{ receiptNo: 'SAR/26-27/0001', date: TODAY, amountPaise: 50000 }]);
  assert.equal(v.advanceSetOffPaise, 50000);
  assert.equal(v.balancePaise, 97500);
  assert.deepEqual(v.warranty, [{ partCode: 'P-9', desc: 'Gasket', qty: 2 }]);
  assert.deepEqual(d.receipts, [
    { receiptNo: 'SAR/26-27/0001', receiptKind: 'ADVANCE', date: TODAY, mode: 'Cash', amountPaise: 50000 },
    { receiptNo: 'SRC/26-27/0001', receiptKind: 'BALANCE', date: TODAY, mode: 'UPI', amountPaise: 97500 }
  ]);
});

test('the sum of the printed lines is the bill: taxable, tax and total add up by hand', () => {
  const e = paidJob();
  const v = print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }).svcData.invoice;
  const sum = (k) => v.lines.reduce((a, l) => a + l[k], 0);
  assert.equal(sum('taxablePaise'), 125000);
  assert.equal(sum('cgstPaise'), 11250);
  assert.equal(sum('sgstPaise'), 11250);
  assert.equal(sum('igstPaise'), 0);
  assert.equal(sum('totalPaise') + v.roundOffPaise, v.totalPaise);
});

test('a bill for the wrong type is WRONG_DOC: summary for CCPT jobs only, tax invoice for not-in-CCPT jobs only', () => {
  const e = paidJob('CCPT_BILLED');
  refused(print(e, 'serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0001' }), 'WRONG_DOC');
  const f = paidJob('NOT_IN_CCPT');
  refused(print(f, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }), 'WRONG_DOC');
  const d = good(print(f, 'serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0001' })).svcData;
  assert.equal(d.invoice.billedIn, 'SAAGAR');
  assert.equal(d.invoice.ccptInvoiceNo, '');
});

test('a cancelled bill prints as cancelled with its day', () => {
  const e = paidJob();
  good(e.core.cancelBill({ invoiceNo: 'SV/2026-27/0001', reason: 'wrong bill made' }, e.pinCtx()));
  const v = print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }).svcData.invoice;
  assert.equal(v.status, 'CANCELLED');
  assert.equal(v.cancelledDate, TODAY);
});

test('serviceCreditNote: lines taken from the stored note and the bill, refund voucher attached', () => {
  const e = paidJob();
  e.clock.advance(1000);
  good(e.core.issueCreditNote({
    invoiceNo: 'SV/2026-27/0001', mode: 'LINES', reasonClass: 'RETURN', reason: 'battery returned unused',
    request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, refund: { amountPaise: 29500, payMode: 'Cash', payRef: '' }
  }, e.pinCtx({ clientRef: ref() })));
  const n = good(print(e, 'serviceCreditNote', { creditNoteNo: 'SCN/26-27/0001' })).svcData;
  assert.equal(n.kind, 'CREDIT_NOTE');
  const x = n.note;
  assert.equal(x.noteNo, 'SCN/26-27/0001');
  assert.equal(x.noteDate, TODAY);
  assert.equal(x.invoiceNo, 'SV/2026-27/0001');
  assert.equal(x.invoiceDate, TODAY);
  assert.equal(x.billedIn, 'CCPT');
  assert.equal(x.ccptInvoiceNo, 'T-1');
  assert.equal(x.reasonLabel, 'Return of part');
  assert.deepEqual(x.supply, { type: 'INTRA', placeOfSupplyStateCode: '27' });
  assert.equal(x.placeOfSupplyCode, '27');
  assert.deepEqual(x.lines, [{
    kind: 'PART', partCode: 'P-1', desc: 'Battery', hsn: '8506', unit: 'Pcs', qty: 1, taxablePaise: 25000, rateBp: 1800, cgstPaise: 2250, sgstPaise: 2250, igstPaise: 0,
    totalPaise: 29500
  }]);
  assert.equal(x.roundOffPaise, 0);
  assert.equal(x.totalPaise, 29500);
  assert.deepEqual(x.refund, { voucherNo: 'SRF/26-27/0001', date: TODAY, mode: 'Cash', amountPaise: 29500 });
  assert.equal('reason' in x, false, 'the free-text reason is never sent');
  const v = good(print(e, 'serviceRefundVoucher', { voucherNo: 'SRF/26-27/0001' })).svcData.refund;
  assert.deepEqual(v, {
    voucherNo: 'SRF/26-27/0001', date: TODAY, mode: 'Cash', ref: '', amountPaise: 29500, jobId: 'WS-1', againstKind: 'CREDIT_NOTE', againstNo: 'SCN/26-27/0001',
    paidBy: 'Test Owner'
  });
});

test('serviceReceipt: advance, balance and counter receipt; a reversed receipt is not printable', () => {
  const e = paidJob();
  const a = good(print(e, 'serviceReceipt', { receiptNo: 'SAR/26-27/0001' })).svcData;
  assert.equal(a.kind, 'RECEIPT');
  assert.deepEqual(a.receipt, {
    receiptNo: 'SAR/26-27/0001', receiptKind: 'ADVANCE', date: TODAY, mode: 'Cash', ref: '', amountPaise: 50000, jobId: 'WS-1', receivedBy: 'Test Owner',
    watch: 'Test watch WS-1'
  });
  const b = good(print(e, 'serviceReceipt', { receiptNo: 'SRC/26-27/0001' })).svcData.receipt;
  assert.deepEqual(b, {
    receiptNo: 'SRC/26-27/0001', receiptKind: 'BALANCE', date: TODAY, mode: 'UPI', ref: 'UPI-77', amountPaise: 97500, jobId: 'WS-1', receivedBy: 'Test Owner',
    watch: 'Test watch WS-1', invoiceNo: 'SV/2026-27/0001', billedIn: 'CCPT', ccptInvoiceNo: 'T-1', invoiceTotalPaise: 147500, paidEarlierPaise: 50000, creditedEarlierPaise: 0, balanceAfterPaise: 0
  });
  good(e.core.reverseReceipt({ no: 'SRC/26-27/0001', reason: 'typed by mistake' }, e.ctx()));
  refused(print(e, 'serviceReceipt', { receiptNo: 'SRC/26-27/0001' }), 'RECEIPT_REVERSED');
  refused(print(e, 'serviceReceipt', { receiptNo: 'SRF/26-27/0001' }), 'PRINT_NOT_FOUND');
});

test('serviceReceipt for a counter sale lists the items', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = (who) => ({ session: who, clientRef: ref('p1') });
  good(e.stores.savePart(partInput('P-2', { flags: { counterSaleable: true } }), s(MANAGER)));
  e.clock.advance(1000);
  good(e.stores.receiveGoods({ supplierInvoiceNo: 'S-3', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-2', qtyInvoiced: 5, qtyReceived: 5, unitCostPaise: 500 }] }, s(MANAGER)));
  e.clock.advance(1000);
  const sale = good(e.stores.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 2, unitPricePaise: 900 }] }, s(MANAGER)));
  good(e.core.takeCounterReceipt({ saleNo: sale.doc.no, amountPaise: 1800, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  const r = good(print(e, 'serviceReceipt', { receiptNo: 'SRC/26-27/0001' })).svcData.receipt;
  assert.equal(r.receiptKind, 'COUNTER');
  assert.deepEqual(r.items, [{ desc: 'Test part P-2', qty: 2, amountPaise: 1800 }], 'A-BCORE: the part name from the master, not its code');
  assert.equal(r.jobId, '');
  assert.equal('invoiceNo' in r, false);
});

test('serviceWarrantySheet: parts only, no price or cost anywhere; job facts come from the page hook', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-2', { paymentStatus: 'no_charge_warranty' });
  e.cases.sheetFacts = () => ({ dateReceived: '2026-11-10', refNo: 'W-77', diagnosis: 'Crown loose', unknownKey: 'x' });
  good(e.core.issueNoChargeSheet({ jobId: 'WS-2', labour: [{ code: 'L-1', name: 'Service', qty: 1 }] }, e.ctx()));
  const d = good(print(e, 'serviceWarrantySheet', { jobId: 'WS-2' })).svcData;
  assert.equal(d.kind, 'WARRANTY_SHEET');
  assert.deepEqual(d.sheet.parts, [{ partCode: 'P-2', desc: 'Gasket', qty: 1 }]);
  assert.equal(d.sheet.dateReceived, '2026-11-10');
  assert.equal(d.sheet.refNo, 'W-77');
  assert.equal(d.sheet.diagnosis, 'Crown loose');
  assert.equal('unknownKey' in d.sheet, false);
  assert.deepEqual(d.firm, { name: 'Test Watch Works', address: '1 Test Road, Test City' });
  assert.equal(/Paise|price|cost/i.test(JSON.stringify(d)), false);
});

test('serviceDaySummary: the day lists, the figures of the money layer, and the "not available" fields carried', () => {
  const e = paidJob();
  const d = good(print(e, 'serviceDaySummary', { date: TODAY })).svcData;
  assert.equal(d.kind, 'DAY_SUMMARY');
  assert.equal(d.date, TODAY);
  assert.deepEqual(d.receipts.map((r) => [r.receiptNo, r.receiptKind, r.mode, r.amountPaise, r.jobId]), [
    ['SAR/26-27/0001', 'ADVANCE', 'Cash', 50000, 'WS-1'], ['SRC/26-27/0001', 'BALANCE', 'UPI', 97500, 'WS-1']
  ]);
  assert.deepEqual(d.refunds, []);
  assert.deepEqual(d.invoices, [{ invoiceNo: 'SV/2026-27/0001', billedIn: 'CCPT', status: 'ISSUED', totalPaise: 147500, jobId: 'WS-1' }]);
  assert.deepEqual(d.creditNotes, []);
  assert.deepEqual(d.advancesHeld, { available: true, count: 0, totalPaise: 0 });
  assert.equal(d.netCashPaise, 50000);
  assert.equal(d.netAllPaise, 147500);
  assert.deepEqual(d.invoicesIssued, { available: true, count: 1, paise: 147500, cancelled: 0 });
  assert.deepEqual(d.notAvailable, []);
  assert.equal(d.invoicesListed, true);
  // the bill layer cannot answer: the data says so, it never shows a silent zero
  e.docsLib.state.throwOn.add('invoicesOn');
  e.docsLib.state.failAll = true;
  const t = good(print(e, 'serviceDaySummary', { date: TODAY })).svcData;
  assert.equal(t.invoicesIssued.available, false);
  assert.equal(t.invoicesIssued.count, null);
  assert.ok(t.notAvailable.includes('invoicesIssued'));
  assert.ok(t.notAvailable.includes('invoices'));
  assert.equal(t.invoicesListed, false);
});

test('serviceAdvancesHeld: an advance on a job with no bill, an old typed advance as LEGACY', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  e.cases.add('WS-3', { typedAdvancePaise: 20000 });
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 50000, payMode: 'UPI' }, e.ctx({ clientRef: ref() })));
  const d = good(print(e, 'serviceAdvancesHeld', {})).svcData;
  assert.equal(d.kind, 'ADVANCES_HELD');
  assert.equal(d.asOf, TODAY);
  assert.deepEqual(d.rows, [
    { receiptNo: 'SAR/26-27/0001', origin: 'RECEIPT', date: TODAY, jobId: 'WS-1', watch: 'Test watch WS-1', jobStatus: 'open', mode: 'UPI', amountPaise: 50000 },
    { receiptNo: '', origin: 'LEGACY', date: TODAY, jobId: 'WS-3', watch: 'Test watch WS-3', jobStatus: 'open', mode: '', amountPaise: 20000 }
  ]);
});

test('serviceRevenue: one row per kind and rate for each bill, credit notes beside them, range by bill day', () => {
  const e = paidJob();
  e.clock.advance(1000);
  good(e.core.issueCreditNote({ invoiceNo: 'SV/2026-27/0001', mode: 'LINES', reasonClass: 'PRICE', reason: 'price corrected at the desk', request: { kind: 'LINES', lines: [{ lineNo: 2, qty: 1 }] } }, e.pinCtx({ clientRef: ref() })));
  const d = good(print(e, 'serviceRevenue', { from: TODAY, to: TODAY })).svcData;
  assert.equal(d.kind, 'REVENUE');
  assert.deepEqual(d.invoices, [{
    invoiceNo: 'SV/2026-27/0001', date: TODAY, status: 'ISSUED', billedIn: 'CCPT', roundOffPaise: 0,
    lines: [
      { kind: 'PART', rateBp: 1800, taxablePaise: 25000, cgstPaise: 2250, sgstPaise: 2250, igstPaise: 0 },
      { kind: 'LABOUR', rateBp: 1800, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0 }
    ]
  }]);
  assert.deepEqual(d.creditNotes, [{
    noteNo: 'SCN/26-27/0001', date: TODAY, invoiceNo: 'SV/2026-27/0001', billedIn: 'CCPT', roundOffPaise: 0,
    lines: [{ kind: 'LABOUR', rateBp: 1800, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0 }]
  }]);
  const none = good(print(e, 'serviceRevenue', { from: '2026-11-01', to: '2026-11-17' })).svcData;
  assert.deepEqual([none.invoices, none.creditNotes], [[], []]);
});

test('print data holds no customer field and no PAN: no key starts with a customer word', () => {
  const e = paidJob();
  const all = [
    print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }), print(e, 'serviceReceipt', { receiptNo: 'SAR/26-27/0001' }),
    print(e, 'serviceDaySummary', {}), print(e, 'serviceAdvancesHeld', {}), print(e, 'serviceRevenue', { from: TODAY, to: TODAY })
  ];
  const keys = new Set();
  // the supplier firm block is the shop's own business address, named by the report spec; customer details come from the page
  const walk = (v) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'firm') continue; keys.add(k); walk(x); } };
  for (const a of all) walk(good(a).svcData);
  for (const k of keys) assert.equal(/^(cust|customer|client|buyer|mobile|phone|address|addr|email|whatsapp|pan)/i.test(k), false, k);
});

/* ---------------------------------------------------------------- through the real report model functions */

function model(type, svcData, extra = {}) {
  const { R } = loadReport({ role: 'owner', globals: { todayIso: () => TODAY } });
  return R._buildModel(type, { svcData, ...extra });
}
const text = (m) => JSON.stringify(JSON.parse(JSON.stringify(m)));
const failed = (m) => /\[RPT_[A-Z_]+\]/.test(text(m)) && !m.blocks.some((b) => b.t === 'table');
const BILL_TO = { name: 'Test Customer', address: '9 Test Lane, Test City', gstin: '', state: 'Maharashtra', stateCode: '27', mobile: '' };
const hasBuilders = () => {
  try { model('serviceBillSummary', { ok: false, code: 'X' }); return true; } catch (e) { return !/Unknown report/.test(String(e.message)); }
};

test('the report models accept the data of every type (run only when the report file has the builders)', (t) => {
  if (!hasBuilders()) { t.skip('final run pending on W-REP: saagar-report.js has no service* builders yet'); return; }
  const e = paidJob();
  e.clock.advance(1000);
  good(e.core.issueCreditNote({ invoiceNo: 'SV/2026-27/0001', mode: 'LINES', reasonClass: 'RETURN', reason: 'battery returned unused', request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, refund: { amountPaise: 29500, payMode: 'Cash', payRef: '' } }, e.pinCtx({ clientRef: ref() })));
  const withBill = (d) => Object.assign({}, d, { billTo: BILL_TO });
  const cases = [
    ['serviceBillSummary', withBill(print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }).svcData)],
    ['serviceCreditNote', withBill(print(e, 'serviceCreditNote', { creditNoteNo: 'SCN/26-27/0001' }).svcData)],
    ['serviceReceipt', withBill(print(e, 'serviceReceipt', { receiptNo: 'SRC/26-27/0001' }).svcData)],
    ['serviceRefundVoucher', withBill(print(e, 'serviceRefundVoucher', { voucherNo: 'SRF/26-27/0001' }).svcData)],
    ['serviceDaySummary', print(e, 'serviceDaySummary', { date: TODAY }).svcData],
    ['serviceAdvancesHeld', print(e, 'serviceAdvancesHeld', {}).svcData],
    ['serviceUnbilledIssues', print(e, 'serviceUnbilledIssues', {}).svcData],
    ['serviceRevenue', print(e, 'serviceRevenue', { from: TODAY, to: TODAY }).svcData]
  ];
  for (const [type, svcData] of cases) {
    const m = model(type, svcData);
    assert.equal(failed(m), false, type + ' ' + text(m).slice(0, 400));
  }
  const inv = model('serviceBillSummary', withBill(print(e, 'serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }).svcData));
  assert.ok(text(inv).includes('SV/2026-27/0001'));
  assert.ok(/1,475\.00/.test(text(inv)), 'the bill total 1,475.00 is printed');
});

test('the tax invoice model accepts a not-in-CCPT bill with the firm GSTIN (run only when the report file has the builders)', (t) => {
  if (!hasBuilders()) { t.skip('final run pending on W-REP: saagar-report.js has no service* builders yet'); return; }
  const e = paidJob('NOT_IN_CCPT');
  const d = Object.assign({}, print(e, 'serviceTaxInvoiceV2', { invoiceNo: 'SV/2026-27/0001' }).svcData, { billTo: BILL_TO });
  const m = model('serviceTaxInvoiceV2', d);
  assert.equal(failed(m), false, text(m).slice(0, 400));
  assert.ok(/1,475\.00/.test(text(m)));
});
