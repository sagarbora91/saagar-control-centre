// Service wave 2, W-REP: the seven customer papers (bill summary, tax invoice, credit note, receipt, refund voucher, warranty sheet) and the v1 invoice pin.
// P6 section 14 tests 1 to 39, as corrected by PLAN section 3 C-REP and PLAN-AMENDMENTS AM-4. Expected values are typed by hand from the worked example.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReport, REPORT_SOURCE } from './lib/fix-s02-load.mjs';
import * as F from './lib/svc2-reports-fixtures.mjs';

const { plain, text, tableOf, tables, notes, empties, hdr, kv, kvPairs, sections, alltext } = F;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const build = (type, data, role = 'owner', extra = {}) => plain(F.load(role).R._buildModel(type, Object.assign({ svcData: data }, F.ARGS[type] || {}, extra)));
const failCode = (m) => { const e = m.blocks.find((b) => b.t === 'empty'); const x = e && /\[RPT_([A-Z_]+)\]/.exec(e.text); return x ? x[1] : ''; };
const noDigits = (m) => !/[0-9]/.test(JSON.stringify(plain(m)).replace(/\\u[0-9a-f]{4}/gi, ''));
const SV = 'SV/2026-27/0001';

// ---------------------------------------------------------------- 1 to 6 tax invoice
test('T01 tax invoice: title, chip, customer copy, GSTIN in the sub line', () => {
  const m = build('serviceTaxInvoiceV2', F.invData());
  assert.equal(m.orientation, 'portrait');
  assert.equal(hdr(m).title, 'TAX INVOICE');
  assert.equal(hdr(m).chip, SV);
  assert.equal(hdr(m).chipKind, 'locked');
  assert.equal(hdr(m).customerCopy, true);
  assert.ok(hdr(m).sub.includes('27ZZZZZ9999Z1Z5'));
});

test('T02 tax invoice: nine columns in order, HSN and SAC cells, foot discount, taxable and GST', () => {
  const t = tableOf(build('serviceTaxInvoiceV2', F.invData()));
  assert.deepEqual(t.head[0], ['Sr', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Discount', 'Taxable value', 'GST %', 'GST amount']);
  assert.deepEqual(t.body.map((r) => r[2]), ['8506', '9987', '9113']);
  assert.equal(t.body[0][1], 'BAT-SR626 \u00b7 Battery SR626');
  assert.equal(t.body[1][1], 'Movement service');
  assert.equal(t.body[2][3], '2 pc');
  assert.deepEqual(t.body.map((r) => r[7]), ['18%', '18%', '12%']);
  assert.deepEqual(t.foot[0], ['', 'TOTAL (3)', '', '', '', '\u20b9100.00', '\u20b92,016.66', '', '\u20b9323.00']);
  assert.deepEqual(t.money, [5, 6, 8]);
  assert.deepEqual(t.raw.map((r) => [r[5], r[6], r[8]]), [[0, 25000, 4500], [10000, 110000, 19800], [0, 66666, 8000]]);
  const raw = F.load('owner').R._buildModel('serviceTaxInvoiceV2', F.opts('serviceTaxInvoiceV2')).blocks.find((b) => b.t === 'table');
  assert.equal(raw.fmt[6](123456), '\u20b91,234.56');
  assert.equal(typeof raw.fmt[5], 'function');
  assert.equal(typeof raw.fmt[8], 'function');
});

test('T03 tax summary, same state: 12 percent first then 18, CGST and SGST columns, no IGST', () => {
  const m = build('serviceTaxInvoiceV2', F.invData());
  const t = tableOf(m, 1);
  assert.deepEqual(t.head[0], ['GST rate', 'Taxable value', 'CGST', 'SGST', 'Total tax']);
  assert.deepEqual(t.body, [['12% (6% + 6%)', '\u20b9666.66', '\u20b940.00', '\u20b940.00', '\u20b980.00'], ['18% (9% + 9%)', '\u20b91,350.00', '\u20b9121.50', '\u20b9121.50', '\u20b9243.00']]);
  assert.deepEqual(t.foot[0], ['TOTAL', '\u20b92,016.66', '\u20b9161.50', '\u20b9161.50', '\u20b9323.00']);
  assert.ok(!t.head[0].includes('IGST'));
  assert.equal(kv(m, 'Total CGST'), '\u20b9161.50');
  assert.equal(kv(m, 'Total SGST'), '\u20b9161.50');
  assert.equal(kv(m, 'Total tax'), '\u20b9323.00');
  assert.equal(kv(m, 'Supply'), 'Within state (CGST + SGST)');
});

test('T04 other-state supply: IGST column and Total IGST, no CGST or SGST', () => {
  const m = build('serviceTaxInvoiceV2', F.invData({}, true));
  const t = tableOf(m, 1);
  assert.deepEqual(t.head[0], ['GST rate', 'Taxable value', 'IGST', 'Total tax']);
  assert.deepEqual(t.body[0], ['12%', '\u20b9666.66', '\u20b980.00', '\u20b980.00']);
  assert.deepEqual(t.body[1], ['18%', '\u20b91,350.00', '\u20b9243.00', '\u20b9243.00']);
  assert.equal(kv(m, 'Total IGST'), '\u20b9323.00');
  assert.equal(kv(m, 'Total CGST'), undefined);
  assert.equal(kv(m, 'Total SGST'), undefined);
  assert.equal(kv(m, 'Supply'), 'Inter-state (IGST)');
  assert.equal(kv(m, 'Place of supply'), 'Karnataka (29)');
});

test('T05 totals: round off, invoice total, advance, balance, words', () => {
  const m = build('serviceTaxInvoiceV2', F.invData());
  assert.equal(kv(m, 'Round off'), '\u20b90.34');
  assert.equal(kv(m, 'Invoice total'), '\u20b92,340.00');
  assert.equal(kv(m, 'Less: advance received'), '\u20b9500.00');
  assert.equal(kv(m, 'Balance payable'), '\u20b91,840.00');
  assert.ok(notes(m).includes('Amount in words: Rupees Two Thousand Three Hundred Forty Only'));
  assert.deepEqual(kvPairs(m).filter((p) => p[2] === 'big').map((p) => p[0]), ['Invoice total', 'Balance payable']);
  assert.ok(sections(m).includes('Advances set off'));
});

test('T06 discount shown when above zero, absent at zero; round off absent at zero', () => {
  assert.equal(kv(build('serviceTaxInvoiceV2', F.invData()), 'Discount given (already deducted)'), '\u20b9100.00');
  const ls = F.lines(false); ls[1].discountPaise = 0; ls[1].unitPricePaise = 110000;
  const m = build('serviceTaxInvoiceV2', F.invData({ lines: ls, roundOffPaise: 0, totalPaise: 233966, balancePaise: 183966 }));
  assert.equal(kv(m, 'Discount given (already deducted)'), undefined);
  assert.equal(kv(m, 'Round off'), undefined);
  assert.equal(kv(m, 'Invoice total'), '\u20b92,339.66');
});

// ---------------------------------------------------------------- 7 and 8 the old (version 1) invoice stays exactly as it was
test('T07 the v1 builder ignores a version 2 snapshot (legacy note, live case)', () => {
  const ORG = { firms: [{ name: 'Saagar Traders', gstin: '27ABCDE1234F1Z5', address: 'Station Road, Latur' }] };
  const c = { id: 'WS-1', custName: 'Ana Tester', custMobile: '9000000001', custAddr: 'Latur', brand: 'Zed', model: 'Chrono', subTotal: 300, gst: 18,
    lineItems: [{ desc: 'Battery change', qty: 1, unit: 300, total: 300 }], invoiceNo: 'WS-2026-002', delivery: { collectDate: '2026-11-12', finalAmt: 300 },
    invoiceSnapshot: { v: 2, figs: { total: 1 }, firm: {}, customer: {}, delivery: {}, lines: [] } };
  const { R } = loadReport({ storage: { saagar_wsf_v2: [c], saagar_org_master_v1: ORG } });
  const s = JSON.stringify(R._buildModel('serviceTaxInvoice', { id: 'WS-1', invoiceNo: 'WS-2026-002' }));
  assert.ok(s.includes('before invoice records were frozen'));
});

test('T08 v1 byte pin: the six models and the snapshot equal the fixture made from the unedited file; the two source slices keep their hashes', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/service-wave-2/p6-v1-invoice-models.json'), 'utf8'));
  assert.equal(fx.cases.length, 7);
  const ORG = { firms: [{ name: 'Saagar Traders', gstin: '27ABCDE1234F1Z5', address: 'Station Road, Latur' }] };
  for (const c of fx.cases) {
    const { R } = loadReport({ storage: { saagar_wsf_v2: [c.input], saagar_org_master_v1: ORG } });
    const model = R._buildModel('serviceTaxInvoice', { id: c.input.id, invoiceNo: c.name === 'snapshot-backed' ? 'WS-2026-002' : c.input.invoiceNo });
    assert.equal(JSON.stringify(plain(model)), JSON.stringify(c.model), c.name);
    const snap = plain(R.makeInvoiceSnapshot(Object.assign({}, c.input, { invoiceSnapshot: undefined }), 'WS-2026-002'));
    snap.issuedAt = c.snapshot.issuedAt;
    assert.equal(JSON.stringify(snap), JSON.stringify(c.snapshot), c.name + ' snapshot');
  }
  const a = REPORT_SOURCE.indexOf('  function invoiceFigures('), b = REPORT_SOURCE.indexOf('  /* ---------- Service Stores reports (SVC1)');
  const c1 = REPORT_SOURCE.indexOf('    serviceTaxInvoice: function (o) {'), d1 = REPORT_SOURCE.indexOf('    /* ===== SERVICE STORES (SVC1)');
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  assert.equal(REPORT_SOURCE.slice(a, b).length, 2865);
  assert.equal(sha(REPORT_SOURCE.slice(a, b)), '4f7d42bd5714e186657dd3e8d55d08abe32a51ecd94d8e02e9ba737159f8df72');
  assert.equal(REPORT_SOURCE.slice(c1, d1).length, 5023);
  assert.equal(sha(REPORT_SOURCE.slice(c1, d1)), 'f613bdafa4f0a8a641fc18eebd6c1573166a1a0d40a687e8274d6abd13706df2');
});

// ---------------------------------------------------------------- 9 to 16
test('T09 customer GSTIN prints when present and "Not registered" when absent; the bill record GSTIN is used when the page glue sent none', () => {
  const withG = build('serviceTaxInvoiceV2', F.invData({}, false, { billTo: Object.assign({}, F.BILL_TO, { gstin: '27YYYYY8888Y1Z3' }) }));
  assert.equal(kv(withG, 'GSTIN'), '27YYYYY8888Y1Z3');
  assert.equal(kv(build('serviceTaxInvoiceV2', F.invData()), 'GSTIN'), 'Not registered');
  assert.equal(kv(build('serviceTaxInvoiceV2', F.invData({ recipientGstin: '27YYYYY8888Y1Z3' })), 'GSTIN'), '27YYYYY8888Y1Z3');
  assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({}, false, { billTo: Object.assign({}, F.BILL_TO, { gstin: 'NOT-A-GSTIN' }) }))), 'READ_FAILED');
});

test('T10 customer mobile prints when present, is absent when empty (tax invoice, summary, credit note)', () => {
  for (const [type, d, dn] of [['serviceTaxInvoiceV2', F.invData(), F.invData({}, false, { billTo: Object.assign({}, F.BILL_TO, { mobile: '' }) })],
    ['serviceBillSummary', F.ccptData(), F.ccptData({}, { billTo: Object.assign({}, F.BILL_TO, { mobile: '' }) })],
    ['serviceCreditNote', F.cnData(), F.cnData({}, { billTo: Object.assign({}, F.BILL_TO, { mobile: '' }) })]]) {
    assert.equal(kv(build(type, d), 'Mobile'), '9000000001', type);
    assert.equal(kv(build(type, dn), 'Mobile'), undefined, type);
  }
});

test('T11 a line with no HSN or SAC gives an amber warning and the bill still builds', () => {
  const ls = F.lines(false); ls[0].hsn = '';
  const m = build('serviceTaxInvoiceV2', F.invData({ lines: ls }));
  const n = m.blocks.find((b) => b.t === 'note' && /HSN or SAC is missing/.test(b.text));
  assert.ok(n && /on 1 line\(s\)/.test(n.text) && Array.isArray(n.color));
  assert.equal(tableOf(m).body[0][2], '-');
});

test('T12 empty supplier GSTIN: RPT_GSTIN_MISSING, no table, no digit in the model', () => {
  const m = build('serviceTaxInvoiceV2', F.invData({ firm: Object.assign({}, F.FIRM, { gstin: '' }) }));
  assert.equal(failCode(m), 'GSTIN_MISSING');
  assert.equal(tables(m).length, 0);
  assert.ok(noDigits(m));
});

test('T13 wrong document: CCPT into the tax invoice, SAAGAR into the summary, rebuilt into either', () => {
  assert.equal(failCode(build('serviceTaxInvoiceV2', F.ccptData())), 'WRONG_DOC');
  assert.ok(empties(build('serviceTaxInvoiceV2', F.ccptData()))[0].includes('Open the Service bill summary instead.'));
  assert.equal(failCode(build('serviceBillSummary', F.invData())), 'WRONG_DOC');
  assert.ok(empties(build('serviceBillSummary', F.invData()))[0].includes('Open the Tax Invoice instead.'));
  assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({ rebuilt: true }))), 'WRONG_DOC');
  assert.equal(failCode(build('serviceBillSummary', F.ccptData({ rebuilt: true }))), 'WRONG_DOC');
  assert.ok(empties(build('serviceBillSummary', F.ccptData({ rebuilt: true })))[0].includes('Open this bill with the old invoice print.'));
  assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({ v: 1 }))), 'WRONG_DOC');
  assert.equal(failCode(build('serviceTaxInvoiceV2', Object.assign(F.invData(), { kind: 'CREDIT_NOTE' }))), 'WRONG_DOC');
});

test('T14 integrity: every broken bill is refused with RPT_BILL_CHECK and no figure', () => {
  const cases = {
    'line total off by one paisa': () => { const ls = F.lines(false); ls[0].totalPaise += 1; return F.invData({ lines: ls, totalPaise: 234001, balancePaise: 184001 }); },
    'tax on a line wrong by Rs 1': () => { const ls = F.lines(false); ls[0].cgstPaise += 100; ls[0].totalPaise += 100; return F.invData({ lines: ls, totalPaise: 234100, balancePaise: 184100 }); },
    'round off of 100': () => F.invData({ roundOffPaise: 100, totalPaise: 234066, balancePaise: 184066 }),
    'balance not total minus advance': () => F.invData({ balancePaise: 184001 }),
    'negative balance': () => F.invData({ advances: [{ receiptNo: 'SAR/26-27/0001', date: '2026-11-10', amountPaise: 250000 }], advanceSetOffPaise: 250000, balancePaise: -16000 }),
    'IGST on same-state supply': () => { const ls = F.lines(false); ls[0].cgstPaise = 0; ls[0].sgstPaise = 2250; ls[0].igstPaise = 2250; return F.invData({ lines: ls }); },
    'supply type disagrees with the state codes': () => F.invData({ supply: 'INTER', lines: F.lines(true) }),
    'total is not the sum plus round off': () => F.invData({ totalPaise: 234100, balancePaise: 184100 }),
    'advance set off is not the sum of the advances': () => F.invData({ advanceSetOffPaise: 40000, balancePaise: 194000 })
  };
  for (const k of Object.keys(cases)) {
    const m = build('serviceTaxInvoiceV2', cases[k]());
    assert.equal(failCode(m), 'BILL_CHECK', k);
    assert.ok(noDigits(m), k + ': no digit in the refusal');
    assert.equal(tables(m).length, 0, k);
  }
  const s = build('serviceBillSummary', F.ccptData({ roundOffPaise: 100, totalPaise: 234066, balancePaise: 184066 }));
  assert.equal(failCode(s), 'BILL_CHECK');
  assert.ok(noDigits(s));
});

test('T14a (A-REP 2) a real calc bill with a bill discount prints: the bill discount is GST-inclusive, the line discount (list - net) is not', async () => {
  const { Calc } = await import('./lib/svc2-calc-load.mjs');
  // by hand: two EXCL lines at 18 percent, Rs 1,000 and Rs 500, bill discount Rs 590 (inclusive) = Rs 500 off before GST
  const b = Calc.computeBill({ lines: [
    { kind: 'PART', code: 'P1', name: 'Crown', hsnSac: '9114', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 100000, qty: 1 },
    { kind: 'LABOUR', code: 'L1', name: 'Service', hsnSac: '9987', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 50000, qty: 1 }], billDiscountPaise: 59000, sellerStateCode: '27' });
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.equal(b.totals.totalPaise, 118000, 'Rs 1,770 less Rs 590');
  const sumLineDisc = b.lines.reduce((a, l) => a + l.listPaise - l.netPaise, 0);
  assert.ok(b.totals.billDiscountPaise > sumLineDisc, 'the two discount figures are on different bases');
  const ls = b.lines.map((l) => ({ kind: l.kind, partCode: l.code, desc: l.name, hsn: l.hsnSac, unit: 'Pcs', qty: l.qty, unitPricePaise: l.unitPricePaise, priceBasis: l.priceBasis,
    discountPaise: l.listPaise - l.netPaise, taxablePaise: l.taxablePaise, rateBp: l.rateBp, cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise, igstPaise: l.igstPaise, totalPaise: l.totalPaise }));
  const data = F.invData({ lines: ls, billDiscountPaise: b.totals.billDiscountPaise, roundOffPaise: b.totals.roundOffPaise, totalPaise: b.totals.totalPaise, advances: [], advanceSetOffPaise: 0, balancePaise: b.totals.totalPaise });
  for (const [type, d] of [['serviceTaxInvoiceV2', data], ['serviceBillSummary', F.ccptData({ lines: ls, billDiscountPaise: b.totals.billDiscountPaise, roundOffPaise: b.totals.roundOffPaise, totalPaise: b.totals.totalPaise, advances: [], advanceSetOffPaise: 0, balancePaise: b.totals.totalPaise })]]) {
    const m = build(type, d);
    assert.equal(failCode(m), '', type);
    assert.equal(kv(m, type === 'serviceTaxInvoiceV2' ? 'Invoice total' : 'Bill total'), '₹1,180.00');
  }
  // the field is still type checked
  for (const bad of [-1, 1.5, '590']) assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({ billDiscountPaise: bad }))), 'READ_FAILED', String(bad));
});

test('T14b corrected tolerance (C-REP-3 / AM-4): 2 * |tax*10000 - taxable*rate| <= n * (10000 + rate), n = chargeable lines at that rate', () => {
  const mk = (taxes) => {   // each line: taxable 2000 at 18 percent, tax given
    const ls = taxes.map((t) => ({ kind: 'PART', partCode: '', desc: 'Test part', hsn: '9113', unit: '', qty: 1, unitPricePaise: 2000, priceBasis: 'EXCL', discountPaise: 0,
      taxablePaise: 2000, rateBp: 1800, cgstPaise: Math.ceil(t / 2), sgstPaise: Math.floor(t / 2), igstPaise: 0, totalPaise: 2000 + t }));
    const sum = ls.reduce((a, l) => a + l.totalPaise, 0), total = Math.round(sum / 100) * 100;
    return F.invData({ lines: ls, roundOffPaise: total - sum, totalPaise: total, advances: [], advanceSetOffPaise: 0, balancePaise: total });
  };
  assert.equal(failCode(build('serviceTaxInvoiceV2', mk([361]))), 'BILL_CHECK');            // one line, off by one paisa: 20000 > 11800
  assert.equal(failCode(build('serviceTaxInvoiceV2', mk([360, 361]))), '');                 // two lines, off by one paisa: 20000 <= 23600
  assert.equal(failCode(build('serviceTaxInvoiceV2', mk([361, 361]))), 'BILL_CHECK');       // two lines, off by two: 40000 > 23600
  assert.equal(failCode(build('serviceTaxInvoiceV2', mk([360, 360, 360]))), '');            // exact
  // a no-charge zero-value line is not a chargeable line, so it adds no allowance
  const m1 = mk([361]); m1.invoice.lines.push({ kind: 'OTHER', partCode: '', desc: 'Free check', hsn: '9987', unit: '', qty: 1, unitPricePaise: 0, priceBasis: 'EXCL', discountPaise: 0,
    taxablePaise: 0, rateBp: 1800, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 });
  assert.equal(failCode(build('serviceTaxInvoiceV2', m1)), 'BILL_CHECK');
});

test('T15 cancelled invoice: red note, CANCELLED chip in the draft colour, cancelled date', () => {
  const m = build('serviceTaxInvoiceV2', F.invData({ status: 'CANCELLED', cancelledDate: '2026-11-18' }));
  const n = m.blocks.find((b) => b.t === 'note');
  assert.equal(n.text, 'THIS DOCUMENT IS CANCELLED. IT IS NOT VALID.');
  assert.deepEqual(n.color, [192, 57, 43]);
  assert.equal(hdr(m).chip, 'CANCELLED ' + SV);
  assert.equal(hdr(m).chipKind, 'draft');
  assert.ok(notes(m).includes('Cancelled on 18-11-2026.'));
  assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({ status: 'VOID' }))), 'READ_FAILED');
});

test('T16 line cap: 301 lines refuse, 300 build', () => {
  const mk = (n) => {
    const ls = []; for (let i = 0; i < n; i++) ls.push({ kind: 'OTHER', partCode: '', desc: 'Line ' + i, hsn: '9987', unit: '', qty: 1, unitPricePaise: 100, priceBasis: 'EXCL', discountPaise: 0, taxablePaise: 100, rateBp: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 100 });
    return F.invData({ lines: ls, roundOffPaise: 0, totalPaise: 100 * n, advances: [], advanceSetOffPaise: 0, balancePaise: 100 * n });
  };
  assert.equal(failCode(build('serviceTaxInvoiceV2', mk(301))), 'TOO_MANY_ROWS');
  const m = build('serviceTaxInvoiceV2', mk(300));
  assert.equal(failCode(m), '');
  assert.equal(tableOf(m).body.length, 300);
});

// ---------------------------------------------------------------- 17 to 21 bill summary
test('T17 bill summary: exact title, amber notes, CCPT number, no HSN, no CGST or SGST, table totals', () => {
  const m = build('serviceBillSummary', F.ccptData());
  assert.equal(hdr(m).title, 'SERVICE BILL SUMMARY (NOT A TAX INVOICE)');
  assert.equal(hdr(m).chip, SV);
  const ns = m.blocks.filter((b) => b.t === 'note' && Array.isArray(b.color)).map((b) => b.text);
  assert.ok(ns.some((x) => x.includes('It is not a tax invoice')));
  assert.ok(ns.some((x) => x.includes('CCPT invoice no: CC-INV-5001')));
  assert.equal(kv(m, 'Our bill no'), SV);
  assert.equal(kv(m, 'CCPT invoice no'), 'CC-INV-5001');
  assert.equal(kv(m, 'CCPT job order no'), 'CC-JOB-77');
  const t = tableOf(m);
  assert.deepEqual(t.head[0], ['Sr', 'Description', 'Qty', 'Rate', 'Discount', 'Value before GST', 'GST', 'Amount']);
  assert.ok(!t.head[0].includes('HSN/SAC'));
  assert.deepEqual(t.foot[0], ['', 'TOTAL (3)', '', '', '\u20b9100.00', '\u20b92,016.66', '\u20b9323.00', '\u20b92,339.66']);
  assert.equal(kv(m, 'Value before GST'), '\u20b92,016.66');
  assert.equal(kv(m, 'GST'), '\u20b9323.00');
  assert.equal(kv(m, 'Bill total'), '\u20b92,340.00');
  assert.equal(kv(m, 'Balance'), '\u20b91,840.00');
  assert.ok(!/CGST|SGST|IGST|GSTIN|HSN/.test(alltext(m).join('|')));
  assert.equal(failCode(build('serviceBillSummary', F.ccptData({ ccptInvoiceNo: '<script>x</script>'.repeat(10) }))), '');
});

test('T18 bill summary without a CCPT number: "Not recorded" and the "not recorded yet" sentence', () => {
  const m = build('serviceBillSummary', F.ccptData({ ccptInvoiceNo: '', ccptJobNo: '' }));
  assert.equal(kv(m, 'CCPT invoice no'), 'Not recorded');
  assert.equal(kv(m, 'CCPT job order no'), 'Not recorded');
  assert.ok(notes(m).some((x) => x.includes('The CCPT invoice number is not recorded yet.')));
});

test('T19 bill summary: "tax invoice" appears only inside "not a tax invoice"', () => {
  const s = alltext(build('serviceBillSummary', F.ccptData())).join('\n');
  const stripped = s.replace(/NOT A TAX INVOICE/g, '').replace(/not a tax invoice/g, '').replace(/The tax invoice for this service is issued by the service centre \(CCPT\)\./g, '');
  assert.ok(!/tax invoice/i.test(stripped), stripped.match(/.{20}tax invoice.{20}/i));
});

test('T20 long addresses print in full through a paragraph on both bills', () => {
  const addr = 'Plot 1, ' + 'Long Street Name, '.repeat(8) + 'Testville';
  assert.ok(addr.length > 120 && addr.length < 240);
  for (const [type, d] of [['serviceBillSummary', F.ccptData({}, { billTo: Object.assign({}, F.BILL_TO, { address: addr }) })], ['serviceTaxInvoiceV2', F.invData({}, false, { billTo: Object.assign({}, F.BILL_TO, { address: addr }) })]]) {
    const m = build(type, d);
    assert.ok(m.blocks.some((b) => b.t === 'para' && b.text === addr), type);
  }
});

test('T21 dates print as DD-MM-YYYY; a malformed date prints a dash and does not throw', () => {
  const m = build('serviceTaxInvoiceV2', F.invData({ invoiceDate: '2026-02-30' }));
  assert.equal(kv(m, 'Invoice Date'), '-');
  assert.equal(kv(build('serviceTaxInvoiceV2', F.invData()), 'Invoice Date'), '18-11-2026');
  assert.equal(tableOf(build('serviceTaxInvoiceV2', F.invData()), 2).body[0][1], '10-11-2026');
});

// ---------------------------------------------------------------- 22 to 24 credit note
test('T22 credit note (own tax invoice): title, against bill, tables, total, round off, words', () => {
  const m = build('serviceCreditNote', F.cnData());
  assert.equal(hdr(m).title, 'CREDIT NOTE');
  assert.equal(hdr(m).chip, 'SCN/2026-27/0001');
  assert.equal(kv(m, 'Against bill no'), SV);
  assert.equal(kv(m, 'Reason'), 'Return of part');
  const t = tableOf(m);
  assert.deepEqual(t.head[0], ['Sr', 'Description', 'HSN/SAC', 'Qty', 'Taxable value credited', 'GST %', 'GST credited']);
  assert.deepEqual(t.foot[0], ['', 'TOTAL (1)', '', '', '\u20b9333.33', '', '\u20b940.00']);
  assert.deepEqual(tableOf(m, 1).body, [['12% (6% + 6%)', '\u20b9333.33', '\u20b920.00', '\u20b920.00', '\u20b940.00']]);
  assert.equal(kv(m, 'Round off'), '\u20b9-0.33');
  assert.equal(kv(m, 'Credit note total'), '\u20b9373.00');
  assert.ok(notes(m).includes('Amount in words: Rupees Three Hundred Seventy Three Only'));
  assert.ok(notes(m).includes('This credit note reduces the bill shown above by the amount shown.'));
});

test('T23 credit note on a CCPT bill: not a GST credit note, amber CCPT sentence, supplier GSTIN not required', () => {
  const m = build('serviceCreditNote', F.cnData({ billedIn: 'CCPT', ccptInvoiceNo: 'CC-INV-5001', firm: Object.assign({}, F.FIRM, { gstin: '' }), placeOfSupplyCode: '' }));
  assert.equal(hdr(m).title, 'SERVICE CREDIT NOTE (NOT A GST CREDIT NOTE)');
  assert.ok(notes(m).some((x) => x.includes('The service centre (CCPT) issues any tax credit note for CCPT invoice CC-INV-5001.')));
  assert.equal(kv(m, 'CCPT invoice no'), 'CC-INV-5001');
  assert.equal(failCode(build('serviceCreditNote', F.cnData({ firm: Object.assign({}, F.FIRM, { gstin: '' }) }))), 'GSTIN_MISSING');
});

test('T24 credit note with a refund shows the voucher block; a refund above the total is refused', () => {
  const m = build('serviceCreditNote', F.cnData({ refund: { voucherNo: 'SRF/26-27/0001', date: '2026-11-18', mode: 'CASH', amountPaise: 37300 } }));
  assert.equal(kv(m, 'Refund voucher'), 'SRF/26-27/0001');
  assert.equal(kv(m, 'Refund date'), '18-11-2026');
  assert.equal(kv(m, 'Paid by'), 'Cash');
  assert.equal(kv(m, 'Refunded'), '\u20b9373.00');
  const bad = build('serviceCreditNote', F.cnData({ refund: { voucherNo: 'SRF/26-27/0001', date: '2026-11-18', mode: 'CASH', amountPaise: 37301 } }));
  assert.equal(failCode(bad), 'BILL_CHECK');
  assert.ok(noDigits(bad));
});

test('T24b credit notes: only checks 1, 2 and 4 apply; a Rs 0 note that takes goods back prints correctly (AM-4)', () => {
  const zero = F.cnData({ lines: [{ kind: 'PART', partCode: 'STRAP-01', desc: 'Strap', hsn: '9113', unit: 'pc', qty: 1, taxablePaise: 0, rateBp: 1200, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 }],
    roundOffPaise: 0, totalPaise: 0, reasonLabel: 'Return of part' });
  const m = build('serviceCreditNote', zero);
  assert.equal(failCode(m), '');
  assert.equal(kv(m, 'Credit note total'), '\u20b90.00');
  assert.ok(notes(m).includes('Amount in words: Rupees Zero Only'));
  assert.ok(notes(m).includes('No money is credited by this note.'));
  assert.ok(!JSON.stringify(plain(m)).includes('-0.00'));
  // a note is not subject to the per-rate tolerance of an invoice: tax 1 paisa above the rate on one line still has to add up line by line (check 1)
  const off = F.cnData({ lines: [{ kind: 'PART', partCode: '', desc: 'Strap', hsn: '9113', unit: 'pc', qty: 1, taxablePaise: 2000, rateBp: 1800, cgstPaise: 181, sgstPaise: 180, igstPaise: 0, totalPaise: 2361 }],
    roundOffPaise: -61, totalPaise: 2300 });
  assert.equal(failCode(build('serviceCreditNote', off)), '');
  const broken = F.cnData({ totalPaise: 37301 });
  assert.equal(failCode(build('serviceCreditNote', broken)), 'BILL_CHECK');
});

test('T24c place of supply is printed from supply.placeOfSupplyStateCode, never from the recipient state (AM-4)', () => {
  const inv = F.invData({ supply: { type: 'INTRA', sellerStateCode: '27', placeOfSupplyStateCode: '27' }, placeOfSupplyCode: undefined, placeOfSupplyState: 'Maharashtra', recipientStateCode: '29' });
  const m = build('serviceTaxInvoiceV2', inv);
  assert.equal(failCode(m), '');
  assert.equal(kv(m, 'Place of supply'), 'Maharashtra (27)');
  assert.ok(!JSON.stringify(plain(m)).includes('(29)'));
  // the recipient field of the input never decides: the plain shape wins nothing over the code given
  assert.equal(kv(build('serviceTaxInvoiceV2', F.invData({ recipientStateCode: '29' }, false, { billTo: Object.assign({}, F.BILL_TO, { stateCode: '' }) })), 'Place of supply'), 'Maharashtra (27)');
  // no place of supply at all: a tax invoice is refused
  assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({ placeOfSupplyCode: '' }))), 'BILL_CHECK');
});

// ---------------------------------------------------------------- 25 to 29 receipts
test('T25 advance receipt: title, netbox, advance sentence, name only, no tax words', () => {
  const m = build('serviceReceipt', F.rcptData());
  assert.equal(hdr(m).title, 'ADVANCE RECEIPT');
  assert.equal(hdr(m).chip, 'SAR/26-27/0001');
  assert.deepEqual(m.blocks.find((b) => b.t === 'netbox'), { t: 'netbox', label: 'Amount received', value: '\u20b9500.00' });
  assert.ok(notes(m).includes('This amount is an advance for the service order shown. It will be set off against the final bill. A bill or tax invoice will be given when the work is complete.'));
  assert.equal(kv(m, 'Received from'), 'Ana Tester');
  assert.ok(!/9000000001/.test(JSON.stringify(plain(m))));
  assert.ok(!/GST|CGST|SGST|IGST/.test(alltext(m).join('|')));
  assert.equal(kv(m, 'Service order'), 'SO-1001');
});

test('T26 balance receipt: title RECEIPT, bill number, CCPT number, totals', () => {
  const m = build('serviceReceipt', F.balRcptData());
  assert.equal(hdr(m).title, 'RECEIPT');
  assert.equal(kv(m, 'Bill no'), SV);
  assert.equal(kv(m, 'CCPT invoice no'), 'CC-INV-5001');
  assert.equal(kv(m, 'Bill total'), '\u20b92,340.00');
  assert.equal(kv(m, 'Paid earlier'), '\u20b9500.00');
  assert.equal(kv(m, 'This receipt'), '\u20b91,840.00');
  assert.equal(kv(m, 'Balance after this receipt'), '\u20b90.00');
  assert.ok(notes(m).includes('This is a receipt for money received. It is not a tax invoice.'));
  assert.equal(kv(build('serviceReceipt', F.balRcptData({ billedIn: 'SAAGAR' })), 'CCPT invoice no'), undefined);
});

test('T27 counter receipt: title, items table and total; an item sum that is not the amount is refused', () => {
  const m = build('serviceReceipt', F.counterData());
  assert.equal(hdr(m).title, 'COUNTER SALE RECEIPT');
  const t = tableOf(m);
  assert.deepEqual(t.head[0], ['Sr', 'Description', 'Qty', 'Amount']);
  assert.deepEqual(t.body, [['1', 'Strap pin', '3', '\u20b960.00'], ['2', 'Battery SR616', '1', '\u20b990.00']]);
  assert.deepEqual(t.foot[0], ['', 'TOTAL', '', '\u20b9150.00']);
  assert.equal(kv(m, 'Service order'), undefined);
  assert.equal(failCode(build('serviceReceipt', F.counterData({ amountPaise: 15001 }))), 'BILL_CHECK');
});

test('T28 a receipt of Rs 0 or less, or with a bad kind, is RPT_READ_FAILED', () => {
  for (const a of [0, -100, 12.5, '100']) assert.equal(failCode(build('serviceReceipt', F.rcptData({ amountPaise: a }))), 'READ_FAILED', String(a));
  assert.equal(failCode(build('serviceReceipt', F.rcptData({ receiptKind: 'REFUND' }))), 'READ_FAILED');
});

test('T29 reference over 24 characters is cut; payment mode labels', () => {
  const m = build('serviceReceipt', F.rcptData());
  assert.equal(kv(m, 'Reference').length, 24);
  assert.equal(kv(m, 'Reference'), 'UPIREF000111222333444...');
  const modes = { upi: 'UPI', CASH: 'Cash', Bank: 'Bank transfer', BANK_TRANSFER: 'Bank transfer', card: 'Card', Cheque: 'Cheque', 'Pay Later': 'Pay Later' };
  for (const k of Object.keys(modes)) assert.equal(kv(build('serviceReceipt', F.rcptData({ mode: k })), 'Payment mode'), modes[k], k);
  assert.equal(kv(build('serviceReceipt', F.rcptData({ ref: '' })), 'Reference'), undefined);
});

// ---------------------------------------------------------------- 30 to 32
test('T30 refund voucher: title, Against text, netbox, signature box', () => {
  const m = build('serviceRefundVoucher', F.refundData());
  assert.equal(hdr(m).title, 'REFUND VOUCHER');
  assert.equal(hdr(m).chip, 'SRF/26-27/0001');
  assert.equal(kv(m, 'Against'), 'Credit note SCN/2026-27/0001');
  assert.equal(kv(build('serviceRefundVoucher', F.refundData({ againstKind: 'ADVANCE', againstNo: 'SAR/26-27/0001' })), 'Against'), 'Advance receipt SAR/26-27/0001');
  assert.equal(kv(build('serviceRefundVoucher', F.refundData({ againstKind: 'SALE', againstNo: 'CSL/26-27/0004' })), 'Against'), 'Counter sale CSL/26-27/0004');
  assert.deepEqual(m.blocks.find((b) => b.t === 'netbox'), { t: 'netbox', label: 'Amount refunded', value: '\u20b9373.00' });
  assert.equal(kv(m, 'Payment mode'), 'Bank transfer');
  assert.equal(m.blocks.find((b) => b.t === 'sign').boxes[0].role, 'Customer signature (refund received)');
  assert.ok(notes(m).includes('The customer has received the amount shown above in full.'));
  assert.equal(failCode(build('serviceRefundVoucher', F.refundData({ amountPaise: 0 }))), 'READ_FAILED');
  assert.equal(failCode(build('serviceRefundVoucher', F.refundData({ againstKind: 'LOAN' }))), 'READ_FAILED');
});

test('T31 warranty sheet: no price anywhere, "No charge", four-column parts table, amber not-a-bill note, name and mobile only', () => {
  const m = build('serviceWarrantySheet', F.sheetData());
  assert.equal(hdr(m).title, 'NO-CHARGE WARRANTY JOB SHEET');
  assert.equal(hdr(m).chip, 'SO-2002');
  assert.equal(hdr(m).period, '15-11-2026');
  assert.equal(kv(m, 'Amount payable'), 'No charge');
  assert.ok(!JSON.stringify(plain(m)).includes('\u20b9'));
  assert.deepEqual(tableOf(m).head[0], ['Sr', 'Part code', 'Description', 'Qty']);
  assert.deepEqual(tableOf(m).body, [['1', 'STEM-01', 'Crown stem', '1'], ['2', 'GASK-02', 'Gasket', '2']]);
  const amber = m.blocks.find((b) => b.t === 'note' && /not a bill or a tax invoice/.test(b.text));
  assert.ok(amber && Array.isArray(amber.color));
  assert.equal(kv(m, 'Name'), 'Ana Tester');
  assert.equal(kv(m, 'Mobile'), '9000000001');
  assert.ok(notes(m).some((x) => x.includes('Warranty on this repair is valid until 15-05-2027.')));
  const hostile = build('serviceWarrantySheet', F.sheetData({ parts: [{ partCode: 'X', desc: 'Gasket', qty: 1, unitPricePaise: 77777, costPaise: 88888 }] }, { billTo: { name: 'Ana Tester', mobile: '9000000001', address: 'HOME-MARK', email: 'a@b.c' } }));
  assert.ok(!/77777|88888|HOME-MARK|a@b\.c/.test(JSON.stringify(plain(hostile))));
});

test('T32 warranty sheet with no parts prints "No parts were used."', () => {
  const m = build('serviceWarrantySheet', F.sheetData({ parts: [] }));
  assert.ok(empties(m).includes('No parts were used.'));
  assert.equal(tables(m).length, 0);
});

// ---------------------------------------------------------------- 33 to 39
test('T33 amount in words: the nine vectors', () => {
  const vec = [[5, 'Rupees Zero and Five Paise Only'], [100, 'Rupees One Only'], [118500, 'Rupees One Thousand One Hundred Eighty Five Only'],
    [123456, 'Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only'], [234000, 'Rupees Two Thousand Three Hundred Forty Only'],
    [10000000, 'Rupees One Lakh Only'], [1000000000, 'Rupees One Crore Only'], [1234567800, 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only']];
  for (const [p, w] of vec) assert.ok(notes(build('serviceReceipt', F.rcptData({ amountPaise: p }))).includes('Amount in words: ' + w), String(p));
  // 0 paise cannot be a receipt: the ninth vector goes through a Rs 0 credit note
  const zero = F.cnData({ lines: [{ kind: 'PART', partCode: '', desc: 'Strap', hsn: '9113', unit: 'pc', qty: 1, taxablePaise: 0, rateBp: 1200, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 }], roundOffPaise: 0, totalPaise: 0 });
  assert.ok(notes(build('serviceCreditNote', zero)).includes('Amount in words: Rupees Zero Only'));
  assert.ok(notes(build('serviceReceipt', F.rcptData({ amountPaise: 999000000000 }))).includes('Amount in words: Rupees Nine Hundred Ninety Nine Crore Only'));
});

test('T34 file names: document number in the name, others unchanged', () => {
  // filename() is not exported: the name is on the preview object
  const names = {};
  const probe = (type, o) => {
    const h = F.loadPdf('owner', []);
    try { h.R.preview(type, Object.assign({ svcData: F.GOOD()[type] }, o)); } catch (e) { /* the on-screen render is not under test */ }
    return h.R._pp && h.R._pp.fname;
  };
  names.inv = probe('serviceTaxInvoiceV2', { invoiceNo: SV, date: '2026-11-18' });
  assert.equal(names.inv, 'Saagar_serviceTaxInvoiceV2_SV_2026-27_0001_2026-11-18.pdf');
  assert.equal(probe('serviceBillSummary', { invoiceNo: SV, date: '2026-11-18' }), 'Saagar_serviceBillSummary_SV_2026-27_0001_2026-11-18.pdf');
  assert.equal(probe('serviceCreditNote', { noteNo: 'SCN/2026-27/0001', date: '2026-11-18' }), 'Saagar_serviceCreditNote_SCN_2026-27_0001_2026-11-18.pdf');
  assert.equal(probe('serviceReceipt', { receiptNo: 'SAR/26-27/0001', date: '2026-11-18' }), 'Saagar_serviceReceipt_SAR_26-27_0001_2026-11-18.pdf');
  assert.equal(probe('serviceRefundVoucher', { voucherNo: 'SRF/26-27/0001', date: '2026-11-18' }), 'Saagar_serviceRefundVoucher_SRF_26-27_0001_2026-11-18.pdf');
  assert.equal(probe('serviceWarrantySheet', { jobId: 'SO-2002', date: '2026-11-18' }), 'Saagar_serviceWarrantySheet_SO-2002_2026-11-18.pdf');
  assert.equal(probe('serviceDaySummary', { date: '2026-11-18' }), 'Saagar_serviceDaySummary_2026-11-18.pdf');
  assert.equal(probe('svcPartLedger', { partCode: 'P-0001', date: '2026-11-18', svcData: undefined }), 'Saagar_svcPartLedger_P-0001_2026-11-18.pdf');
  assert.equal(probe('svcGoodsReceipt', { grnNo: 'GRN/26-27/0001', date: '2026-11-18', svcData: undefined }), 'Saagar_svcGoodsReceipt_GRN_26-27_0001_2026-11-18.pdf');
});

test('T35 every customer paper sets customerCopy; no list model does', () => {
  const { R } = F.load('owner');
  for (const t of F.CUSTOMER_TYPES) assert.equal(hdr(R._buildModel(t, F.opts(t))).customerCopy, true, t);
  for (const t of F.LIST_TYPES) assert.equal(hdr(R._buildModel(t, F.opts(t))).customerCopy, undefined, t);
  for (const t of F.CUSTOMER_TYPES) assert.equal(failCodeOf(R, t), '', t);
  for (const t of F.CUSTOMER_TYPES) assert.equal(hdr(R._buildModel(t, { svcData: { ok: false, code: 'CHAIN_BROKEN' } })).customerCopy, true, t + ' refusal');
});
function failCodeOf(R, t) { const m = R._buildModel(t, F.opts(t)); return failCode(m); }

test('T36 customer copy furniture: "Computer-generated document", no "Confidential", no brand line, no owner name', () => {
  const log = [];
  const { R } = F.loadPdf('owner', log, { globals: { ownerNm: () => F.OWNER_NAME, SaagarOwnerName: F.OWNER_NAME } });
  R._renderDoc('serviceTaxInvoiceV2', F.opts('serviceTaxInvoiceV2'));
  const all = log.map((x) => x.s);
  assert.ok(all.includes('Computer-generated document'));
  assert.ok(!all.some((s) => /Confidential/.test(s)));
  assert.ok(!all.some((s) => /BUSINESS CONTROL CENTRE/.test(s)));
  assert.ok(!all.some((s) => /Business Control Centre/.test(s)));
  assert.ok(!all.some((s) => /Prepared for/.test(s)));
  assert.ok(!all.some((s) => s.includes(F.OWNER_NAME)));
  assert.ok(all.includes('WATCH SERVICE \u00b7 LATUR'));
  assert.ok(all.some((s) => /^Printed /.test(s)));
  assert.ok(all.includes('Page 1 of 1'));
});

test('T37 older reports keep the old furniture byte for byte', () => {
  for (const type of ['serviceAging', 'ownerBrief']) {
    const log = [];
    const { R } = F.loadPdf('owner', log, { globals: { ownerNm: () => F.OWNER_NAME } });
    R._renderDoc(type, {});
    const all = log.map((x) => x.s);
    assert.ok(all.includes('Saagar Traders \u00b7 Latur \u00b7 Confidential \u2014 for owner review'), type);
    assert.ok(all.includes('BUSINESS CONTROL CENTRE'), type);
    assert.ok(all.some((s) => /^Business Control Centre \u00b7 Page 1 of \d+$/.test(s)), type);
    assert.ok(all.some((s) => /^Prepared for .*Generated /.test(s) || /^Generated /.test(s)), type);
  }
});

test('T38 roles: technician and manager build all six papers; a cashier cannot', () => {
  for (const role of ['technician', 'manager', 'owner']) for (const t of F.CUSTOMER_TYPES) assert.equal(failCode(F.load(role).R._buildModel(t, F.opts(t))), '', role + ' ' + t);
  for (const t of F.CUSTOMER_TYPES) {
    assert.throws(() => F.load('cashier').R._buildModel(t, F.opts(t)), /not available for your role/, t);
    assert.throws(() => F.load('greeter').R._buildModel(t, F.opts(t)), /not available for your role/, t);
  }
});

test('T39 no cost, no margin: a hostile bill carrying cost fields prints none of them', () => {
  const d = F.invData();
  d.invoice.lines.forEach((l) => { l.costPaise = 7654321; l.marginPaise = 1234567; l.discountReason = 'REASON-MARK'; });
  d.invoice.costPaise = 7654321; d.invoice.ownerName = 'OWNER-MARK'; d.invoice.reason = 'REASON-MARK';
  const m = build('serviceTaxInvoiceV2', d);
  assert.equal(failCode(m), '');
  const s = JSON.stringify(plain(m));
  assert.ok(!/7654321|76,543\.21|1234567|12,345\.67|REASON-MARK|OWNER-MARK/.test(s));
  const c = F.cnData({ reasonText: 'REASON-MARK', ownerName: 'OWNER-MARK' });
  assert.ok(!/REASON-MARK|OWNER-MARK/.test(text(build('serviceCreditNote', c))));
  assert.equal(kv(build('serviceCreditNote', F.cnData({ reasonLabel: 'free text from the owner' })), 'Reason'), 'Other');
});

test('T40 a stale or hostile data object is refused, not guessed: no data, wrong kind, failure from the store', () => {
  const { R } = F.load('owner');
  for (const t of F.CUSTOMER_TYPES) {
    assert.equal(failCode(R._buildModel(t, {})), 'NO_DATA', t);
    assert.equal(failCode(R._buildModel(t, { svcData: { ok: false, code: 'STORE_HEAD_MISMATCH' } })), 'CHAIN_BROKEN', t);
    assert.equal(failCode(R._buildModel(t, { svcData: { ok: false, code: 'HEAD' } })), 'CHAIN_BROKEN', t);
    assert.equal(failCode(R._buildModel(t, { svcData: { ok: false, code: 'SHARD_GAP' } })), 'CHAIN_BROKEN', t);
    assert.equal(failCode(R._buildModel(t, { svcData: { ok: false, code: 'SOMETHING_ELSE' } })), 'READ_FAILED', t);
    assert.equal(failCode(R._buildModel(t, { svcData: { ok: true, kind: 'NOPE' } })), 'WRONG_DOC', t);
    assert.equal(failCode(R._buildModel(t, { svcData: [] })), 'READ_FAILED', t);
    assert.ok(noDigits(R._buildModel(t, { svcData: { ok: false, code: 'CHAIN_BROKEN' } })), t);
  }
});

test('T39b (A-REP 2) balance receipt: bill total, paid earlier, this receipt and balance after must agree, else refused with no figures', () => {
  // by hand: 2,340.00 - 500.00 - 1,840.00 = 0.00 (the fixture); a balance-after of 1.00 or a paid-earlier of 499.99 does not add up
  assert.equal(failCode(build('serviceReceipt', F.balRcptData())), '');
  for (const over of [{ balanceAfterPaise: 100 }, { paidEarlierPaise: 49999 }, { invoiceTotalPaise: 234001 }]) {
    const m = build('serviceReceipt', F.balRcptData(over));
    assert.equal(failCode(m), 'BILL_CHECK', JSON.stringify(over));
    assert.ok(noDigits(m));
  }
  // a part payment: 2,340.00 - 500.00 - 1,000.00 = 840.00
  const p = build('serviceReceipt', F.balRcptData({ amountPaise: 100000, balanceAfterPaise: 84000 }));
  assert.equal(failCode(p), '');
  assert.equal(kv(p, 'Balance after this receipt'), '₹840.00');
  assert.equal(kv(p, 'Less credit notes'), undefined, 'no credit note: no row');
});

test('T39c Stage E (wiring row 17): a credit note on the bill before this receipt lowers the balance and is printed', () => {
  // by hand: 2,340.00 - credit 340.00 - paid earlier 500.00 - this 1,000.00 = 500.00
  const c = build('serviceReceipt', F.balRcptData({ amountPaise: 100000, creditedEarlierPaise: 34000, balanceAfterPaise: 50000 }));
  assert.equal(failCode(c), '');
  assert.equal(kv(c, 'Less credit notes'), '₹340.00');
  assert.equal(kv(c, 'Balance after this receipt'), '₹500.00');
  // the old figure (credit ignored: 840.00) no longer adds up; a negative or broken credit figure is refused
  assert.equal(failCode(build('serviceReceipt', F.balRcptData({ amountPaise: 100000, creditedEarlierPaise: 34000, balanceAfterPaise: 84000 }))), 'BILL_CHECK');
  assert.equal(failCode(build('serviceReceipt', F.balRcptData({ amountPaise: 100000, creditedEarlierPaise: -1, balanceAfterPaise: 84000 }))), 'READ_FAILED');
});

test('T14c (A-REP 2) the corrected tolerance accepts what the old 10000*n bound refused: 12 percent, taxable 13 paise, tax 1 paisa', () => {
  // by hand: 2 * |1*10000 - 13*1200| = 11200 = 1 * (10000 + 1200): on the bound, accepted. The old bound 10000*1 would refuse it. Taxable 14: 2*|10000-16800| = 13600 > 11200, refused.
  const one = (taxable) => F.invData({ lines: [{ kind: 'PART', partCode: 'P', desc: 'Pin', hsn: '9113', unit: 'pc', qty: 1, unitPricePaise: taxable, priceBasis: 'EXCL', discountPaise: 0,
    taxablePaise: taxable, rateBp: 1200, cgstPaise: 1, sgstPaise: 0, igstPaise: 0, totalPaise: taxable + 1 }], roundOffPaise: 0, totalPaise: taxable + 1, advances: [], advanceSetOffPaise: 0, balancePaise: taxable + 1 });
  assert.equal(failCode(build('serviceTaxInvoiceV2', one(13))), '');
  assert.equal(failCode(build('serviceTaxInvoiceV2', one(14))), 'BILL_CHECK');
});

test('T14d (A-REP 2) a negative money field on a bill line is refused', () => {
  for (const f of ['discountPaise', 'unitPricePaise', 'cgstPaise', 'igstPaise']) {
    const ls = F.lines(false); ls[0][f] = -100;
    assert.equal(failCode(build('serviceTaxInvoiceV2', F.invData({ lines: ls }))), 'READ_FAILED', f);
  }
});

test('T14e (A-REP 2) the tax invoice marks a GST-inclusive rate with * and says so; an exclusive bill has neither', () => {
  const ls = F.lines(false); ls[0].priceBasis = 'INCL';
  const m = build('serviceTaxInvoiceV2', F.invData({ lines: ls }));
  assert.equal(tableOf(m).body[0][4], '₹250.00*');
  assert.equal(tableOf(m).body[1][4], '₹1,200.00');
  assert.ok(notes(m).includes('* This rate includes GST.'));
  assert.ok(!notes(build('serviceTaxInvoiceV2', F.invData())).includes('* This rate includes GST.'));
});

test('T39c (A-REP 2) receipts and refund vouchers never print a mobile number, even when one is sent', () => {
  const M = '9123456780';
  for (const [type, d] of [['serviceReceipt', F.rcptData()], ['serviceReceipt', F.balRcptData()], ['serviceReceipt', F.counterData()], ['serviceRefundVoucher', F.refundData()]]) {
    d.billTo = { name: 'Ana Tester', mobile: M };
    const m = build(type, d);
    assert.equal(failCode(m), '', type);
    assert.ok(!text(m).includes(M), type + ' ' + d.receipt?.receiptKind);
  }
});

// Stage E round 2 (D-tablet-1): the money columns of the bill summary and the tax invoice fit the largest allowed figure on one line.
// Measured the way the engine measures: real jsPDF, the embedded DMSans font, the table font size 9.5 pt and the cell padding 4 + 3.5 pt.
// Not verified here: the final PDF render on the tablet (glyph shaping, the print dialog's own scaling).
test('T60 D-tablet-1: every money column of the two bill tables holds Rs 9,00,000.00 (bold total) and Rs 5,00,000.00* (rate) on one line', async () => {
  const vm = await import('node:vm');
  const WWW = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
  const box = { console, atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'), TextEncoder, TextDecoder, navigator: { userAgent: 'node' } };
  box.window = box; box.self = box; box.globalThis = box;
  vm.createContext(box);
  for (const f of ['jspdf.umd.min.js', 'fonts/DMSans-normal.js', 'fonts/DMSans-bold.js']) vm.runInContext(fs.readFileSync(path.join(WWW, f), 'utf8'), box);
  const doc = new box.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const width = (s, style) => { doc.setFont('DMSans', style); doc.setFontSize(9.5); return doc.getTextWidth(s); };
  const PAD = 4 + 3.5;
  const usable = doc.internal.pageSize.getWidth() - 44 - 44;
  for (const [type, data, moneyCols] of [['serviceBillSummary', F.ccptData(), [3, 4, 5, 6, 7]], ['serviceTaxInvoiceV2', F.invData(), [4, 5, 6, 8]]]) {
    const t = tableOf(build(type, data));
    let fixed = 0;
    for (const [k, s] of Object.entries(t.colStyles)) if (typeof s.cellWidth === 'number') fixed += s.cellWidth;
    assert.ok(usable - fixed >= 90, type + ': the description keeps at least 90 pt (' + (usable - fixed).toFixed(1) + ')');
    for (const c of moneyCols) {
      const w = t.colStyles[c].cellWidth;
      assert.ok(width('₹9,00,000.00', 'bold') + PAD <= w, type + ' column ' + c + ' total');
      assert.ok(width('₹5,00,000.00*', 'normal') + PAD <= w, type + ' column ' + c + ' rate');
      for (const row of t.body.concat(t.foot)) if (typeof row[c] === 'string' && row[c]) assert.ok(width(row[c], 'bold') + PAD <= w, type + ' ' + row[c]);
    }
  }
  // the old width (62 pt) could not hold the bold Rs 4,00,354.00 the tester saw split
  assert.ok(width('₹4,00,354.00', 'bold') + PAD > 62);
});
