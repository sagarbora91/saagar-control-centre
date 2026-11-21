// Service wave 2, W-REP: parity, roles, hub, export path, source guards, hostile data, render smoke. P6 section 14 tests 59 to 73.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReport, fakeJsPdf, HUB_TYPES, REPORT_SOURCE } from './lib/fix-s02-load.mjs';
import * as F from './lib/svc2-reports-fixtures.mjs';

const { plain } = F;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = REPORT_SOURCE;
const SEARCH = fs.readFileSync(path.join(HERE, '..', 'www/shared/shell-search.js'), 'utf8');
const SEVEN = ['serviceBillSummary', 'serviceTaxInvoiceV2', 'serviceCreditNote', 'serviceReceipt', 'serviceRefundVoucher', 'serviceWarrantySheet', 'serviceUnbilledIssues'];
const THREE = ['serviceDaySummary', 'serviceAdvancesHeld', 'serviceRevenue'];
const failCode = (m) => { const e = m.blocks.find((b) => b.t === 'empty'); const x = e && /\[RPT_([A-Z_]+)\]/.exec(e.text); return x ? x[1] : ''; };
const lit = (src) => { const m = /var\s+REPORT_MODULE\s*=\s*(\{[\s\S]*?\n\s*\});/.exec(src); return Function('return ' + m[1].replace(/;$/, ''))(); };
const block = () => { const a = SRC.indexOf('/* ---------- Service bills, receipts and money prints (SVC2)'), b = SRC.indexOf('  var META = {'); assert.ok(a > 0 && b > a); return SRC.slice(a, b); };

test('T59 REPORT_MODULE: ten rows with the agreed values here, the same keys in shell-search with an empty string for the three owner-level types', () => {
  const a = lit(SRC), b = lit(SEARCH);
  for (const t of SEVEN) { assert.equal(a[t], 'service', t); assert.equal(b[t], 'service', t); }
  for (const t of THREE) { assert.equal(a[t], '*', t); assert.equal(b[t], '', t); }
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  const m = /var\s+REPORT_MODULE\s*=\s*(\{[\s\S]*?\n\s*\});/.exec(SRC)[1];
  assert.ok(!m.slice(0, -4).includes('\n  };'), 'no earlier closing line inside the literal');
  assert.equal(a.serviceTaxInvoice, 'service');
  // none of the new names starts with svc (Phase 1 governance T4.8 compares that family with the six Stores types)
  for (const t of F.ALL_TYPES) assert.ok(!/^svc[A-Z]/.test(t));
});

test('T60 the six customer-copy hunks: customerCopy is read in exactly the five furniture places and nowhere else outside the new block', () => {
  const b = block();
  const rest = SRC.replace(b, '');
  const lines = rest.split('\n').filter((l) => l.includes('customerCopy'));
  assert.equal(lines.length, 4, lines.join('\n'));
  assert.ok(lines.some((l) => l.includes("doc.text(hdr.customerCopy ? SAN.text(hdr.tagline || '') : 'BUSINESS CONTROL CENTRE', L, 54")));
  assert.ok(lines.some((l) => l.includes("doc.text(hdr.customerCopy ? ('Printed ' + stamp()) : genLine(), R, 74")));
  assert.ok(lines.some((l) => l.includes("hdr && hdr.customerCopy ? SAN.text(hdr.footer || 'Computer-generated document') : 'Saagar Traders")));
  assert.ok(lines.some((l) => l.includes("(hdr && hdr.customerCopy ? '' : 'Business Control Centre \u00b7 ') + 'Page '")));
  assert.ok(SRC.includes('function drawFooter(doc, pageW, M, pg, tot, hdr){'));
  assert.ok(SRC.includes('drawFooter(doc,pageW,M,p,tot,hdr);'));
  assert.equal((SRC.match(/drawFooter\(/g) || []).length, 2);
  // the old strings still exist for every other report
  assert.ok(SRC.includes("'Saagar Traders \u00b7 Latur \u00b7 Confidential \u2014 for owner review'"));
  assert.ok(SRC.includes("'BUSINESS CONTROL CENTRE'"));
  assert.ok(SRC.includes('genLine()'));
});

test('T61 META has the ten rows with the agreed titles; list() shows them by role', () => {
  const meta = /var META = \{([\s\S]*?)\n  \};/.exec(SRC)[1];
  const titles = { serviceBillSummary: 'Service \u2014 Bill Summary (not a tax invoice)', serviceTaxInvoiceV2: 'Service \u2014 Tax Invoice', serviceCreditNote: 'Service \u2014 Credit Note',
    serviceReceipt: 'Service \u2014 Receipt', serviceRefundVoucher: 'Service \u2014 Refund Voucher', serviceWarrantySheet: 'Service \u2014 No-charge Warranty Job Sheet',
    serviceUnbilledIssues: 'Service \u2014 Parts Issued, Not Billed', serviceDaySummary: 'Service \u2014 Day Summary', serviceAdvancesHeld: 'Service \u2014 Advances Held', serviceRevenue: 'Service \u2014 Revenue from Bills' };
  for (const t of F.ALL_TYPES) assert.ok(new RegExp('\\n    ' + t + ': \\{ title: \'' + titles[t].replace(/[()]/g, '\\$&') + '\'').test('\n' + meta), t);
  const names = (role) => F.load(role).R.list().map((x) => x.type);
  for (const r of ['owner', 'manager']) for (const t of F.ALL_TYPES) assert.ok(names(r).includes(t), r + ' ' + t);
  const tech = names('technician');
  for (const t of SEVEN) assert.ok(tech.includes(t), 'technician ' + t);
  for (const t of THREE) assert.ok(!tech.includes(t), 'technician ' + t);
  for (const r of ['cashier', 'greeter', 'others', 'cro']) for (const t of F.ALL_TYPES) assert.ok(!names(r).includes(t), r + ' ' + t);
  const entry = F.load('owner').R.list().find((x) => x.type === 'serviceRevenue');
  assert.equal(entry.scope, 'monthly');
});

test('T62 the hub is unchanged: 18 rows for the owner, none of the ten in HUB_TYPES or in the hub HTML', () => {
  for (const t of F.ALL_TYPES) assert.ok(!HUB_TYPES.includes(t), t);
  const h = loadReport({});
  h.R.openHub();
  const html = h.html('modalBody');
  assert.equal((html.match(/class="hub-row"/g) || []).length, 18);
  for (const t of F.ALL_TYPES) assert.ok(!html.includes(t), t);
});

test('T63 the model prints the data date, not opts.date; the file name uses opts.date', () => {
  const h = F.loadPdf('owner', []);
  const m = plain(h.R._buildModel('serviceDaySummary', { svcData: F.dayData({ date: '2026-11-17' }), date: '2026-11-01' }));
  assert.equal(m.blocks[0].period, 'Tuesday, 17 November 2026');
  try { h.R.preview('serviceDaySummary', { svcData: F.dayData({ date: '2026-11-17' }), date: '2026-11-01' }); } catch (e) { /* the on-screen render is not under test */ }
  assert.equal(h.R._pp.fname, 'Saagar_serviceDaySummary_2026-11-01.pdf');
});

test('T64 export path: print asks the export gate once with the report scope and does not print when denied; no CSV for a receipt', async () => {
  const calls = [], printed = [];
  const globals = { SaagarExportControl: { authorize: (meta) => { calls.push(meta); return false; }, beginDelivery: () => true, recordOutcome: () => true } };
  const h = F.loadPdf('owner', [], { globals });
  h.ctx.print = () => printed.push(1);
  try { h.R.preview('serviceReceipt', Object.assign({ svcData: F.rcptData() }, F.ARGS.serviceReceipt)); } catch (e) { /* render is not under test */ }
  await h.R.printPreview();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scopeId, 'report-serviceReceipt');
  assert.equal(calls[0].exportId, 'report-preview-print');
  assert.equal(calls[0].kind, 'print');
  assert.equal(printed.length, 0);
  await h.R.savePreviewCsv();
  assert.equal(calls.length, 1, 'a receipt has no CSV, so the gate is not even asked');
});

test('T65 the gate: a manager opening the day summary is asked for no module step-up; a technician outside Service opening a receipt is asked once', () => {
  const m = F.loadPdf('manager', []);
  try { m.R.preview('serviceDaySummary', { svcData: F.dayData() }); } catch (e) { /* render not under test */ }
  assert.deepEqual(m.calls.ensure, []);
  const t = F.loadPdf('technician', []);
  try { t.R.preview('serviceReceipt', Object.assign({ svcData: F.rcptData() }, F.ARGS.serviceReceipt)); } catch (e) { /* render not under test */ }
  assert.deepEqual(t.calls.ensure, ['service']);
  const denied = F.loadPdf('technician', []);
  try { denied.R.preview('serviceDaySummary', { svcData: F.dayData() }); } catch (e) { /* render not under test */ }
  assert.deepEqual(denied.calls.ensure, []);
  assert.ok(denied.calls.toasts.some((x) => /not available for your role/.test(x)));
  assert.ok(denied.calls.audits.some((a) => a[0] === 'access.denied'));
});

test('T66 the cost column cannot be forced by an option', () => {
  const m = plain(F.load('technician').R._buildModel('serviceUnbilledIssues', { svcData: F.unbilledData(), showCost: true, cost: true, role: 'owner', isOwner: true }));
  assert.ok(!JSON.stringify(m).includes('Cost value'));
});

test('T67 source guard on the new block: no forbidden call, no store name, no customer fields, ASCII, LF, no BOM, one createElement site', () => {
  const b = block();
  assert.ok(b.length > 30000);
  for (const bad of ['toISOString', 'postMessage', 'document.write', 'import(', 'fetch(', 'XMLHttpRequest', 'createElement', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'SaagarServiceStores', 'custName', 'custMobile', 'custAddr', 'saagar_svcs_', 'parseFloat', 'Number(', 'Math.round', 'toFixed', '/ 100.0']) {
    assert.ok(!b.includes(bad), bad);
  }
  assert.ok(!/[^\x00-\x7f]/.test(b), 'the new block is ASCII (escapes for the dot and the dash)');
  assert.equal(SRC.split("createElement('script')").length - 1, 1);
  assert.ok(!SRC.includes('\r') && SRC.charCodeAt(0) !== 0xFEFF);
  assert.ok(!SEARCH.includes('\r') && SEARCH.charCodeAt(0) !== 0xFEFF);
  assert.ok(b.trimStart().startsWith('/* ---------- Service bills, receipts and money prints (SVC2)'));
  // it sits outside the Phase 1 guarded region
  const a1 = SRC.indexOf('/* ---------- Service Stores reports (SVC1)'), b1 = SRC.indexOf('/* ---------- per-report builders');
  const at = SRC.indexOf('/* ---------- Service bills, receipts and money prints (SVC2)');
  assert.ok(at > b1 || at < a1);
});

test('T68 no new public SaagarReport key and no new global', () => {
  const { R, ctx } = F.load('owner');
  assert.deepEqual(Object.keys(R).sort(), ['_blocksToCsv', '_buildModel', '_logReport', '_modelRowCount', '_modelToCsv', '_packTypes', '_payrollChooser', '_payrollPick', '_readinessNote', '_renderBlocks',
    '_renderDoc', '_renderPackList', '_renderPdf', '_saveBlob', 'batchSlips', 'build', 'buildBatch', 'canOpen', 'csvCell', 'csvNumber', 'forModule', 'fromHub', 'generate', 'history', 'hubFilter',
    'hubStep', 'hubSyncLabel', 'list', 'makeInvoiceSnapshot', 'openHub', 'pack', 'packSave', 'packSend', 'preview', 'printPreview', 'savePreview', 'savePreviewCsv', 'sharePreview']);
  for (const k of Object.keys(ctx)) assert.ok(!/^svc2|^inr2$|^SVC2/.test(k), k);
  assert.ok(!('inr2' in ctx) && !('svc2BillSummary' in ctx));
});

test('T69 empty options never throw for any of the ten types', () => {
  const { R } = F.load('owner');
  for (const t of F.ALL_TYPES) {
    assert.doesNotThrow(() => R._buildModel(t), t);
    assert.doesNotThrow(() => R._buildModel(t, null), t);
    assert.doesNotThrow(() => R._buildModel(t, {}), t);
    assert.equal(failCode(plain(R._buildModel(t))), 'NO_DATA', t);
    assert.equal(R._modelRowCount(R._buildModel(t)), 0);
  }
});

test('T70 render smoke: each type renders with the fake PDF engine, draws its title, and uses its orientation', () => {
  const titles = { serviceBillSummary: 'SERVICE BILL SUMMARY (NOT A TAX INVOICE)', serviceTaxInvoiceV2: 'TAX INVOICE', serviceCreditNote: 'CREDIT NOTE', serviceReceipt: 'ADVANCE RECEIPT',
    serviceRefundVoucher: 'REFUND VOUCHER', serviceWarrantySheet: 'NO-CHARGE WARRANTY JOB SHEET', serviceUnbilledIssues: 'SERVICE \u2014 PARTS ISSUED, NOT BILLED', serviceDaySummary: 'SERVICE DAY SUMMARY',
    serviceAdvancesHeld: 'SERVICE \u2014 ADVANCES HELD', serviceRevenue: 'SERVICE \u2014 REVENUE FROM BILLS' };
  for (const t of F.ALL_TYPES) {
    const log = [], seen = [];
    const B = fakeJsPdf(log);
    const globals = { todayIso: F.todayIso, jspdf: { jsPDF: class extends B { constructor(o) { super(o); seen.push(o && o.orientation); } splitTextToSize(x) { return [String(x)]; } } } };
    const { R } = loadReport({ role: 'owner', globals });
    const doc = R._renderDoc(t, F.opts(t));
    assert.ok(doc, t);
    assert.ok(log.some((x) => x.s === titles[t]), t + ' title drawn');
    assert.equal(seen[0], (t === 'serviceUnbilledIssues' || t === 'serviceRevenue') ? 'landscape' : 'portrait', t);
  }
  // the refusal page also renders
  const log = [];
  const { R } = F.loadPdf('owner', log);
  assert.ok(R._renderDoc('serviceTaxInvoiceV2', { svcData: { ok: false, code: 'CHAIN_BROKEN' } }));
  assert.ok(log.some((x) => /\[RPT_CHAIN_BROKEN\]/.test(x.s)));
});

test('T71 hostile money (a float, a string, above 1e12) is refused with no figure printed, for every type that holds money', () => {
  const put = {
    serviceBillSummary: (v) => { const d = F.ccptData(); d.invoice.lines[0].taxablePaise = v; return d; },
    serviceTaxInvoiceV2: (v) => { const d = F.invData(); d.invoice.lines[0].taxablePaise = v; return d; },
    serviceCreditNote: (v) => { const d = F.cnData(); d.note.totalPaise = v; return d; },
    serviceReceipt: (v) => F.rcptData({ amountPaise: v }),
    serviceRefundVoucher: (v) => F.refundData({ amountPaise: v }),
    serviceWarrantySheet: (v) => F.sheetData({ parts: [{ partCode: 'X', desc: 'Y', qty: v }] }),
    serviceUnbilledIssues: (v) => { const d = F.unbilledData(); d.rows[0].costPaise = v; return d; },
    serviceDaySummary: (v) => { const d = F.dayData(); d.receipts[0].amountPaise = v; return d; },
    serviceAdvancesHeld: (v) => { const d = F.advData(); d.rows[0].amountPaise = v; return d; },
    serviceRevenue: (v) => { const d = F.revData(); d.invoices[0].lines[0].taxablePaise = v; return d; }
  };
  for (const t of F.ALL_TYPES) {
    for (const v of [12.5, '100', 2e12, -1, NaN, null]) {
      if (t === 'serviceWarrantySheet' && v === 12.5) continue;   // a fractional quantity is allowed (three decimals)
      const m = plain(F.load('manager').R._buildModel(t, Object.assign({ svcData: put[t](v) }, F.ARGS[t] || {})));
      const code = failCode(m);
      assert.ok(code === 'READ_FAILED' || code === 'BILL_CHECK', t + ' ' + String(v) + ' -> ' + code);
      assert.ok(!/[0-9]/.test(JSON.stringify(m).replace(/\\u[0-9a-f]{4}/gi, '')), t + ' no figure');
    }
  }
});

test('T72 hostile text is capped and never throws', () => {
  const big = '<script>alert(1)</script>' + 'A'.repeat(5000), eq = '=cmd|calc';
  const d = F.invData({}, false, { billTo: { name: big, address: big, gstin: '', state: big, stateCode: '27', mobile: big }, watch: big });
  d.invoice.lines[0].desc = big; d.invoice.lines[0].partCode = big; d.invoice.lines[0].hsn = '8506'; d.invoice.jobId = big; d.invoice.ccptInvoiceNo = big;
  const m = plain(F.load('owner').R._buildModel('serviceTaxInvoiceV2', { svcData: d }));
  const s = JSON.stringify(m);
  assert.equal(failCode(m), '');
  assert.ok(s.length < 20000, String(s.length));
  assert.ok(m.blocks.every((b) => typeof b.t === 'string'));
  assert.ok(m.blocks.filter((b) => b.t === 'para').every((b) => b.text.length <= 400));
  const u = F.unbilledData(); u.rows[0].desc = eq; u.rows[0].watch = big;
  assert.doesNotThrow(() => F.load('manager').R._buildModel('serviceUnbilledIssues', { svcData: u }));
  const long = F.invData(); long.invoice.lines[0].hsn = '1234567890123';
  assert.equal(failCode(plain(F.load('owner').R._buildModel('serviceTaxInvoiceV2', { svcData: long }))), 'READ_FAILED');
});

test('T73 measurement only: a 300-line tax invoice and a 5,000-row revenue model (milliseconds are printed, nothing is asserted but that they build)', () => {
  const ls = []; for (let i = 0; i < 300; i++) ls.push({ kind: 'OTHER', partCode: '', desc: 'Line ' + i, hsn: '9987', unit: '', qty: 1, unitPricePaise: 100, priceBasis: 'EXCL', discountPaise: 0, taxablePaise: 100, rateBp: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 100 });
  const inv = F.invData({ lines: ls, roundOffPaise: 0, totalPaise: 30000, advances: [], advanceSetOffPaise: 0, balancePaise: 30000 });
  const { R } = F.load('owner');
  let t0 = Date.now(); const a = R._buildModel('serviceTaxInvoiceV2', { svcData: inv }); const ms1 = Date.now() - t0;
  const docs = []; for (let i = 0; i < 5000; i++) docs.push({ invoiceNo: 'SV/2026-27/' + i, date: '2026-11-' + String(1 + (i % 28)).padStart(2, '0'), status: 'ISSUED', billedIn: i % 2 ? 'CCPT' : 'SAAGAR', roundOffPaise: 0,
    lines: [{ kind: 'PART', rateBp: 1800, taxablePaise: 1000, cgstPaise: 90, sgstPaise: 90, igstPaise: 0 }, { kind: 'LABOUR', rateBp: 1800, taxablePaise: 2000, cgstPaise: 180, sgstPaise: 180, igstPaise: 0 }] });
  t0 = Date.now(); const b = R._buildModel('serviceRevenue', { svcData: F.revData({ invoices: docs, creditNotes: [] }), from: '2026-11-01', to: '2026-11-30' }); const ms2 = Date.now() - t0;
  console.log('T73 timing: 300-line invoice ' + ms1 + ' ms, 5000-row revenue ' + ms2 + ' ms');
  assert.equal(failCode(plain(a)), '');
  assert.equal(failCode(plain(b)), '');
  assert.equal(plain(b).blocks.find((x) => x.t === 'kpi').items[0].value, '5000');
});
