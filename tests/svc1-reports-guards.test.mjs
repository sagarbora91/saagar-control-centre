// Service Stores reports (group reports): failures, CSV, roles, parity and source guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReport, fakeJsPdf, HUB_TYPES } from './lib/fix-s02-load.mjs';
import { load, plain, text, tableOf, ok, stockRow, stockData, ledgerA, grnData, adjData, oldData, TODAY, todayIso, BIG } from './lib/svc1-reports-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'www/saagar-report.js'), 'utf8');
const SEARCH = fs.readFileSync(path.join(ROOT, 'www/shared/shell-search.js'), 'utf8');
const pdfGlobals = (log) => { const B = fakeJsPdf(log); return { jspdf: { jsPDF: class extends B { splitTextToSize(t) { return [String(t)]; } } } }; };
const deepEqual = (a, b) => assert.deepStrictEqual(plain(a), plain(b));
const TYPES = ['svcStockList', 'svcPartLedger', 'svcReorderList', 'svcGoodsReceipt', 'svcAdjustmentRegister', 'svcDefectiveRegister'];
const ARGS = { svcStockList: {}, svcPartLedger: { partCode: 'P-0001' }, svcReorderList: {}, svcGoodsReceipt: { grnNo: 'GRN/26-27/0007' }, svcAdjustmentRegister: { month: '2026-11' }, svcDefectiveRegister: { month: '2026-11' } };
const GOOD = () => ({ svcStockList: stockData(), svcPartLedger: ledgerA(), svcReorderList: stockData([stockRow({ onHand: 1, reorderLevel: 5 })]), svcGoodsReceipt: grnData(),
  svcAdjustmentRegister: adjData(), svcDefectiveRegister: oldData() });
const build = (role, type, extra) => load(role).R._buildModel(type, Object.assign({}, ARGS[type], extra));

// ---------------------------------------------------------------- failure codes
test('missing svcData: every type shows the UNAVAILABLE body, no table, no throw', () => {
  for (const t of TYPES) {
    for (const bad of [undefined, null]) {
      const m = build('manager', t, { svcData: bad });
      const s = text(m);
      assert.match(s, /The stores data engine is not available on this device\. \[RPT_UNAVAILABLE\]/, t);
      assert.ok(!m.blocks.some((b) => b.t === 'table' || b.t === 'kpi'), t);
    }
  }
  const m = load('manager').R._buildModel('svcStockList');          // no options at all
  assert.match(text(m), /RPT_UNAVAILABLE/);
});

test('reader NOT_READY shows the opening-stock text for every type', () => {
  for (const t of TYPES) assert.match(text(build('manager', t, { svcData: { ok: false, code: 'NOT_READY' } })), /Opening stock has not been set yet\. \[RPT_NOT_READY\]/, t);
});

test('reader CHAIN_BROKEN (and store chain codes): no figure from the fixture reaches the model', () => {
  const codes = ['CHAIN_BROKEN', 'SVCS_CHAIN_BREAK', 'SVCS_HEAD_AHEAD', 'SVCS_SHARD_MISSING', 'SVCS_BLOCKED', 'SVCS_FIFO_MISMATCH', 'SVCS_WATERMARK_FORK'];
  for (const t of TYPES) {
    for (const code of codes) {
      const s = text(build('manager', t, { svcData: Object.assign(GOOD()[t], { ok: false, code }) }));
      assert.match(s, /RPT_CHAIN_BROKEN/, t + code);
      assert.ok(!/[0-9]/.test(s.replace(/RPT_CHAIN_BROKEN/, '')), t + ' ' + code + ' ' + s);
    }
  }
});

test('other reader codes: PART_UNKNOWN, GRN_UNKNOWN, ASOF_UNSUPPORTED pass through; the rest are READ_FAILED', () => {
  assert.match(text(build('manager', 'svcPartLedger', { svcData: { ok: false, code: 'PART_UNKNOWN' } })), /That part code was not found\. \[RPT_PART_UNKNOWN\]/);
  assert.match(text(build('manager', 'svcGoodsReceipt', { svcData: { ok: false, code: 'GRN_UNKNOWN' } })), /That goods receipt was not found\. \[RPT_GRN_UNKNOWN\]/);
  assert.match(text(build('manager', 'svcStockList', { svcData: { ok: false, code: 'ASOF_UNSUPPORTED' } })), /Stock as at a past date is not available\. \[RPT_ASOF_UNSUPPORTED\]/);
  for (const code of ['ARG_INVALID', 'SOMETHING_ELSE', undefined, 42, '']) {
    assert.match(text(build('manager', 'svcStockList', { svcData: { ok: false, code } })), /The stores records could not be read\. \[RPT_READ_FAILED\]/, String(code));
  }
});

test('required arguments are checked before data: PART_REQUIRED and GRN_REQUIRED texts', () => {
  const l = load('manager').R;
  assert.match(text(l._buildModel('svcPartLedger', {})), /Open this report from a part in Service Stores\. \[RPT_PART_REQUIRED\]/);
  assert.match(text(l._buildModel('svcGoodsReceipt', {})), /Open this report from a goods receipt\. \[RPT_GRN_REQUIRED\]/);
  assert.match(text(l._buildModel('svcPartLedger', { partCode: '   ', svcData: ledgerA() })), /RPT_PART_REQUIRED/);
});

test('garbage data is READ_FAILED and never throws; reportRowCount stays a number', () => {
  for (const t of TYPES) {
    for (const bad of ['text', 7, true, [], [1, 2], {}, { ok: 'yes' }, { ok: true }, { ok: true, rows: 'x', awaiting: 5, decided: null, open: {}, listed: 1, lines: 'x' }]) {
      const m = build('manager', t, { svcData: bad });
      assert.match(text(m), /RPT_READ_FAILED/, t + JSON.stringify(bad));
      assert.ok(!m.blocks.some((b) => b.t === 'table'));
    }
  }
  const { R } = load('manager');
  assert.equal(typeof R._modelRowCount(R._buildModel('svcStockList', { svcData: 'x' })), 'number');
});

test('data that cannot be copied (cycle, getter that throws) is READ_FAILED', () => {
  const cyc = { ok: true, rows: [] }; cyc.self = cyc;
  assert.match(text(build('manager', 'svcStockList', { svcData: cyc })), /RPT_READ_FAILED/);
  const g = { ok: true }; Object.defineProperty(g, 'rows', { enumerable: true, get() { throw new Error('boom'); } });
  assert.match(text(build('manager', 'svcStockList', { svcData: g })), /RPT_READ_FAILED/);
});

test('rows: 5,000 build, 5,001 are refused with TOO_MANY_ROWS and no table', () => {
  const mk = (n) => BIG(n, (i) => stockRow({ partCode: 'B' + String(i).padStart(5, '0'), onHand: 1, reorderLevel: 2, valuePaise: 100 }));
  const okm = build('manager', 'svcStockList', { svcData: stockData(mk(5000)) });
  assert.equal(tableOf(okm).body.length, 5000);
  const bad = build('manager', 'svcStockList', { svcData: stockData(mk(5001)) });
  assert.match(text(bad), /Too many parts for one print\. Choose a group\. \[RPT_TOO_MANY_ROWS\]/);
  assert.ok(!bad.blocks.some((b) => b.t === 'table'));
  assert.match(text(build('manager', 'svcReorderList', { svcData: stockData(mk(5001)) })), /RPT_TOO_MANY_ROWS/);
  const l = ledgerA(); l.rows = BIG(5001, (i) => Object.assign({}, ledgerA().rows[0], { seq: i + 1 }));
  assert.match(text(build('manager', 'svcPartLedger', { svcData: l })), /RPT_TOO_MANY_ROWS/);
  const a = adjData(); a.decided = BIG(5001, () => adjData().decided[0]);
  assert.match(text(build('manager', 'svcAdjustmentRegister', { svcData: a })), /RPT_TOO_MANY_ROWS/);
  const d = oldData(); d.listed = BIG(5001, () => oldData().listed[0]);
  assert.match(text(build('manager', 'svcDefectiveRegister', { svcData: d })), /RPT_TOO_MANY_ROWS/);
  const g = grnData(); g.lines = BIG(5001, () => grnData().lines[0]);
  assert.match(text(build('manager', 'svcGoodsReceipt', { svcData: g })), /RPT_TOO_MANY_ROWS/);
});

test('money must be whole paise: a fractional or text amount is READ_FAILED, not rounded', () => {
  for (const v of [1000.5, '1000', null, NaN]) {
    const rows = [stockRow({ valuePaise: v })];
    assert.match(text(build('manager', 'svcStockList', { svcData: stockData(rows) })), /RPT_READ_FAILED/, String(v));
  }
  // a technician never reads the money fields, so they cannot fail or leak
  const rows = [stockRow({ valuePaise: 'junk' })];
  const m = build('technician', 'svcStockList', { svcData: stockData(rows) });
  assert.ok(tableOf(m) && !/junk/.test(text(m)));
});

// ---------------------------------------------------------------- CSV
const csvLines = (t) => t.replace(/^﻿/, '').split('\r\n');

test('stock list CSV: plain numbers, formula guard on text, leading zero kept', () => {
  const rows = [stockRow({ partCode: '0042', desc: '=SUM(A1)', onHand: 12, valuePaise: 455000, reorderLevel: 0 }), stockRow({ partCode: 'N-2', desc: '-ve stock', onHand: -2, valuePaise: 0, reorderLevel: 0 }),
    stockRow({ partCode: 'N-3', desc: '@x', onHand: 4, valuePaise: 9100, reorderLevel: 0 })];
  const { R } = load('manager');
  const csv = R._modelToCsv('svcStockList', { svcData: stockData(rows) });
  const l = csvLines(csv.text);
  assert.equal(l[0], '"Sr","Part code","Description","Group","Bin","On hand","Reorder at","Avg cost (FIFO)","Stock value (FIFO)","Status"');
  const cell = (i, c) => l[i].split('","')[c];
  assert.ok(l[1].includes('"0042"') && l[1].includes('"\'=SUM(A1)"'), l[1]);
  assert.match(l[1], /,"12","0","379\.17","4550\.00","OK"$/);
  assert.ok(l[2].includes('"\'-ve stock"'));
  assert.match(l[2], /,"-2","0","—","0\.00","Negative"$/);
  assert.ok(l[3].includes('"\'@x"'));
  assert.ok(!/₹/.test(csv.text.replace(/^﻿/, '')) );
  assert.ok(l[l.length - 1].startsWith('"","","TOTAL (3)"'));
  assert.equal(cell(1, 1), '0042');
});

test('ledger CSV: two tables with one blank line, negative balance without apostrophe, no plus signs', () => {
  const d = ledgerA({ closing: { qty: 7, valuePaise: 70000 } });
  d.rows[1] = Object.assign({}, d.rows[1], { outQty: 4 });
  const { R } = load('manager');
  const csv = R._modelToCsv('svcPartLedger', { partCode: 'P-0001', svcData: d });
  const l = csvLines(csv.text);
  const blank = l.indexOf('');
  assert.ok(blank > 0 && l[blank + 1].startsWith('"Receipt (GRN no)"'));
  assert.equal(l.filter((x) => x === '').length, 1);
  assert.ok(!/\+/.test(csv.text.replace(/^﻿/, '').replace(/"[^"]*[A-Za-z][^"]*"/g, '"t"')), 'no + in numeric cells');
  const neg = ledgerA();
  neg.rows = [Object.assign({}, neg.rows[1], { seq: 1, balQty: -2, balValuePaise: -20000, outQty: 2, valueOutPaise: 20000 })];
  neg.opening = { qty: 0, valuePaise: 0 }; neg.closing = { qty: -2, valuePaise: -20000 }; neg.layers = [];
  const c2 = R._modelToCsv('svcPartLedger', { partCode: 'P-0001', svcData: neg });
  assert.ok(c2.text.includes('"-2"') && !c2.text.includes('"\'-2"'));
  assert.ok(c2.text.includes('"-200.00"'));
});

test('technician CSVs have no cost columns', () => {
  const { R } = load('technician');
  for (const t of ['svcStockList', 'svcPartLedger', 'svcReorderList']) {
    const csv = R._modelToCsv(t, Object.assign({ svcData: t === 'svcPartLedger' ? ledgerA() : (t === 'svcReorderList' ? stockData([stockRow({ onHand: 1, reorderLevel: 5 })]) : stockData()) }, ARGS[t]));
    const head = csvLines(csv.text)[0];
    assert.ok(!/cost|value|Value/i.test(head), t + ' ' + head);
    assert.ok(!/₹|\d+\.\d\d"/.test(csv.text), t);
  }
});

test('numCols: columns listed there are written as plain numbers; blocks without it are unchanged', () => {
  const { R } = load('manager');
  const out = R._blocksToCsv({ blocks: [{ t: 'table', head: [['A', 'B', 'C']], body: [['x', '12', '-3'], ['y', '=1+1', '₹1,234.50']], numCols: [1, 2] }] });
  const o = csvLines(out.text);
  assert.equal(o[1], '"x","12","-3"');
  assert.equal(o[2], '"y","\'=1+1","1234.50"');
  const both = R._blocksToCsv({ blocks: [{ t: 'table', head: [['A', 'B', 'C']], body: [['x', '₹5.00', '7']], money: [1], numCols: [2], foot: [['T', '₹5.00', '7']] }] });
  assert.equal(csvLines(both.text)[1], '"x","5.00","7"');
  assert.equal(csvLines(both.text)[2], '"T","5.00","7"');
  const old = R._blocksToCsv({ blocks: [{ t: 'table', head: [['A', 'B']], body: [['x', '—'], ['y', '=1+1']], money: [1] }] });
  assert.equal(old.text, '﻿"A","B"\r\n"x","—"\r\n"y","\'=1+1"');
});

test('CSV buttons: five of the new types have CSV, the goods receipt does not', () => {
  const csvBlock = SRC.slice(SRC.indexOf('var CSV_REPORTS = {'), SRC.indexOf('};', SRC.indexOf('var CSV_REPORTS = {')));
  for (const t of ['svcStockList', 'svcPartLedger', 'svcReorderList', 'svcAdjustmentRegister', 'svcDefectiveRegister']) assert.ok(csvBlock.includes(t + ': true'), t);
  assert.ok(!csvBlock.includes('svcGoodsReceipt'));
});

// ---------------------------------------------------------------- roles
test('list(): owner and manager see all six; technician five without the adjustment register; others none', () => {
  const names = (role) => { const { R } = load(role); return R.list().map((x) => x.type).filter((t) => TYPES.includes(t)).sort(); };
  deepEqual(names('owner'), [...TYPES].sort());
  deepEqual(names('manager'), [...TYPES].sort());
  deepEqual(names('technician'), TYPES.filter((t) => t !== 'svcAdjustmentRegister').sort());
  for (const r of ['cashier', 'greeter', 'others', 'cro']) deepEqual(names(r), []);
});

test('preview of the adjustment register as technician opens nothing; build and model throw the same message', () => {
  const h = load('technician');
  h.R.preview('svcAdjustmentRegister', { svcData: adjData(), month: '2026-11' });
  assert.ok(h.calls.toasts.some((t) => /not available for your role/.test(t)));
  assert.equal(h.calls.openModal, 0);
  assert.throws(() => h.R._buildModel('svcAdjustmentRegister', {}), /not available for your role/);
  assert.throws(() => { h.R.build('svcAdjustmentRegister', {}); }, /not available for your role/);
});

test('reportGate: technician outside Service asks the module PIN once; manager asks nothing for the register', () => {
  const t = load('technician', { globals: Object.assign({ activeModuleId: 'qms' }, pdfGlobals([])) });
  t.R.preview('svcStockList', { svcData: stockData() });
  assert.deepEqual(plain(t.calls.ensure), ['service']);
  const m = load('manager', { globals: Object.assign({ activeModuleId: 'qms' }, pdfGlobals([])) });
  m.R.preview('svcAdjustmentRegister', { svcData: adjData(), month: '2026-11' });
  assert.deepEqual(plain(m.calls.ensure), []);
});

test('cost visibility cannot be forced from the options', () => {
  const m = plain(build('technician', 'svcStockList', { svcData: stockData(), showCost: true, cost: true, role: 'owner', isManager: true }));
  assert.ok(!m.blocks.find((b) => b.t === 'table').head[0].some((h) => /cost|value/i.test(h)));
});

test('cost fails closed: no role model, no session, a broken session', () => {
  const none = loadReport({ globals: { todayIso } });                   // no role model at all
  assert.ok(!/Stock value/.test(JSON.stringify(none.R._buildModel('svcStockList', { svcData: stockData() }))));
  const noSession = loadReport({ role: 'manager', globals: { todayIso } });
  noSession.ctx.__session = null;
  assert.throws(() => noSession.R._buildModel('svcStockList', { svcData: stockData() }), /not available for your role/);
  const broken = loadReport({ role: 'owner', globals: { todayIso } });
  broken.ctx.__session = { isOwner: true, isManager: true, ok: false, tier: 'none', role: 'Owner' };
  assert.ok(!/Stock value/.test(JSON.stringify(broken.R._buildModel('svcStockList', { svcData: stockData() }))));
  const tierNone = loadReport({ role: 'owner', globals: { todayIso } });
  tierNone.ctx.__session = { isOwner: false, isManager: true, tier: 'none', role: 'Store Manager' };
  assert.ok(!/Stock value/.test(JSON.stringify(tierNone.R._buildModel('svcStockList', { svcData: stockData() }))));
});

test('the role is read at every build, never cached', () => {
  const h = load('owner');
  assert.match(JSON.stringify(h.R._buildModel('svcStockList', { svcData: stockData() })), /Stock value/);
  h.ctx.__session = { isOwner: false, isManager: false, role: 'Technician' };
  assert.ok(!/Stock value/.test(JSON.stringify(h.R._buildModel('svcStockList', { svcData: stockData() }))));
});

// ---------------------------------------------------------------- parity, file names, source scans
test('REPORT_MODULE: the six rows have the agreed values here and in shell-search (adjustment register is owner-level)', () => {
  const lit = (src) => { const m = /var\s+REPORT_MODULE\s*=\s*(\{[\s\S]*?\n\s*\});/.exec(src); return Function('return ' + m[1].replace(/;$/, ''))(); };
  const a = lit(SRC), b = lit(SEARCH);
  for (const t of TYPES) {
    const want = t === 'svcAdjustmentRegister' ? '*' : 'service';
    assert.equal(a[t], want, t);
    assert.equal(b[t], want === '*' ? '' : want, t);
  }
  deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  const meta = /var META = \{([\s\S]*?)\n  \};/.exec(SRC)[1];
  for (const t of TYPES) assert.ok(new RegExp('\\n    ' + t + ': \\{ title:').test('\n' + meta), t);
  const r = load('owner').R;
  const titles = Object.fromEntries(r.list().map((x) => [x.type, x.title]));
  assert.equal(titles.svcGoodsReceipt, 'Service Stores — Goods Receipt Note');
});

test('the hub is unchanged: 18 rows for owner, none of the new types in HUB_TYPES', () => {
  for (const t of TYPES) assert.ok(!HUB_TYPES.includes(t));
  const h = loadReport({});
  h.R.openHub();
  assert.equal((h.html('modalBody').match(/class="hub-row"/g) || []).length, 18);
  assert.ok(!/svcStockList|svcPartLedger/.test(h.html('modalBody')));
});

test('file names: ledger and goods receipt carry a clean key; others unchanged', () => {
  const h = load('manager', { globals: pdfGlobals([]) });
  h.R.preview('svcPartLedger', { partCode: 'P/0001 x', date: '2026-11-13', svcData: ledgerA() });
  assert.equal(h.R._pp.fname, 'Saagar_svcPartLedger_P_0001_x_2026-11-13.pdf');
  h.R.preview('svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', date: '2026-11-13', svcData: grnData() });
  assert.equal(h.R._pp.fname, 'Saagar_svcGoodsReceipt_GRN_26-27_0007_2026-11-13.pdf');
  h.R.preview('serviceAging', { date: '2026-11-13' });
  assert.equal(h.R._pp.fname, 'Saagar_serviceAging_2026-11-13.pdf');
  h.R.preview('svcStockList', { date: '2026-11-13', svcData: stockData() });
  assert.equal(h.R._pp.fname, 'Saagar_svcStockList_2026-11-13.pdf');
  h.R.preview('svcPartLedger', { partCode: '///', date: '2026-11-13', svcData: ledgerA() });
  assert.equal(h.R._pp.fname, 'Saagar_svcPartLedger____2026-11-13.pdf'.replace('____', '___'));
});

test('preview never stores the report data (only type, action, date and month are logged)', () => {
  const h = load('manager', { globals: pdfGlobals([]) });
  h.R.preview('svcStockList', { date: '2026-11-13', svcData: stockData() });
  const all = Object.values(h.store).join('|');
  assert.ok(!/P-0001|Crown assembly|valuePaise/.test(all));
});

test('render smoke: every type renders with the fake PDF engine and prints its title', () => {
  for (const t of TYPES) {
    const log = [];
    const { R } = load('manager', { globals: pdfGlobals(log) });
    const doc = R._renderDoc(t, Object.assign({ svcData: GOOD()[t] }, ARGS[t]));
    assert.ok(doc);
    assert.ok(log.some((x) => x.s.length > 3), t);
    assert.ok(log.some((x) => x.s.toUpperCase().includes(t === 'svcGoodsReceipt' ? 'GOODS RECEIPT NOTE' : 'SERVICE STORES')), t);
  }
  const log = [];
  const { R } = load('manager', { globals: pdfGlobals(log) });
  const m = R._buildModel('svcPartLedger', { partCode: 'P-0001', svcData: ledgerA() });
  assert.equal(m.orientation, 'landscape');
  assert.equal(R._buildModel('svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', svcData: grnData() }).orientation, 'portrait');
});

test('source guards: one createElement site, no forbidden calls, LF, no BOM, no toISOString in the new code', () => {
  assert.equal(SRC.split("createElement('script')").length - 1, 1);
  assert.ok(!SRC.includes('\r') && SRC.charCodeAt(0) !== 0xFEFF);
  const a = SRC.indexOf('/* ---------- Service Stores reports (SVC1)'), b = SRC.indexOf('/* ---------- per-report builders');
  const own = SRC.slice(a, b);
  assert.ok(own.length > 5000);
  for (const bad of ['toISOString', 'postMessage', 'document.write', 'import(', 'fetch(', 'XMLHttpRequest', 'createElement', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'SaagarServiceStores', 'instanceof', 'structuredClone', 'custName', 'custMobile', 'custAddr']) {
    assert.ok(!own.includes(bad), bad);
  }
  assert.ok(own.includes('JSON.parse(JSON.stringify(raw))') && own.includes('Array.isArray'));
  assert.ok(!/\bsaagar_svcs_/.test(SRC));
  const shell = SEARCH;
  assert.ok(!shell.includes('\r') && shell.charCodeAt(0) !== 0xFEFF);
});

test('no new public method on SaagarReport and no new global', () => {
  const { R, ctx } = load('manager');
  const keys = Object.keys(R);
  for (const k of keys) assert.ok(!/^svc/i.test(k), k);
  assert.ok(!('svcStockList' in ctx) && !('inr2' in ctx));
});

test('builders keep going when only some opts are missing (no throw for any type with empty options)', () => {
  const { R } = load('manager');
  for (const t of TYPES) assert.doesNotThrow(() => R._buildModel(t), t);
  for (const t of TYPES) assert.doesNotThrow(() => R._buildModel(t, null), t);
});

test('ok helper sanity', () => assert.equal(ok({}).ok, true));
void TODAY;

test('ROLE_DENIED and SESSION_REQUIRED from the reader show the role text, no figures', () => {
  for (const code of ['ROLE_DENIED', 'SESSION_REQUIRED']) {
    for (const t of TYPES) {
      const s = text(build('manager', t, { svcData: { ok: false, code } }));
      assert.ok(s.includes('Your role is not allowed to see this report. [RPT_ROLE_DENIED]'), t);
      assert.ok(!/[0-9]/.test(s.replace('RPT_ROLE_DENIED', '').replace(/2026/g, '')), t);
    }
  }
});

test('registers print the period the data was read for, and re-filter by it', () => {
  const a = adjData({ from: '2026-10-01', to: '2026-10-31' });
  const m = plain(build('manager', 'svcAdjustmentRegister', { month: '2026-11', svcData: a }));
  assert.equal(m.blocks[0].period, '2026-10-01 to 2026-10-31');
  assert.deepEqual(m.blocks.filter((b) => b.t === 'table')[1].body.map((r) => r[0]), ['ADJ/26-27/0000']);
  const d = oldData({ from: '2026-10-01', to: '2026-10-31' });
  assert.equal(plain(build('manager', 'svcDefectiveRegister', { svcData: d })).blocks[0].period, '2026-10-01 to 2026-10-31');
});
