// tests/svc1-core-reports.test.mjs
// core.reportData(type, args, ctx): the reader shapes of P6 section 3 (plan C-REP-1), money in integer paise, India dates.
// Real store, FIFO and masters; documents posted with the kit. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER, MANAGER, STAFF, BROKEN, makeEnv, buildStandard, standardParts, kitOldRegister, kitOldMove, kitScrapSignoff,
  kitReceipt, kitReverse, kitOpening, kitPropose
} from './lib/svc1-core-kit.mjs';

const TYPES = ['svcStockList', 'svcPartLedger', 'svcReorderList', 'svcGoodsReceipt', 'svcAdjustmentRegister', 'svcDefectiveRegister'];

function walk(obj, fn, key = '') {
  if (Array.isArray(obj)) { obj.forEach((v) => walk(v, fn, key)); return; }
  if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) walk(obj[k], fn, k); return; }
  fn(key, obj);
}

function std() {
  const env = makeEnv();
  const refs = buildStandard(env);
  return { env, refs };
}

test('R01 an unknown report type, a bad session and a bad ctx are refused with reader codes', () => {
  const { env } = std();
  const c = env.core;
  assert.deepEqual([c.reportData('svcNope', {}, env.manager()).ok, c.reportData('svcNope', {}, env.manager()).code], [false, 'ARG_INVALID']);
  assert.equal(c.reportData(5, {}, env.manager()).code, 'ARG_INVALID');
  for (const t of TYPES) {
    assert.equal(c.reportData(t, {}, { session: BROKEN }).code, 'SESSION_REQUIRED', t);
    assert.equal(c.reportData(t, {}, null).code, 'SESSION_REQUIRED', t);
  }
  env.adapter.auth = false;
  assert.equal(c.reportData('svcStockList', {}, env.manager()).code, 'READ_FAILED');
});

test('R02 stock list: P6 StockRow shape, FIFO values, India dates', () => {
  const { env } = std();
  const r = env.core.reportData('svcStockList', {}, env.manager());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.asOf, '2026-11-13');
  assert.equal(r.method, 'FIFO');
  assert.equal(r.costBasis, 'EXCL_GST');
  assert.equal(r.lastMovementDate, '2026-11-10');
  assert.deepEqual(r.rows.map((x) => x.partCode), ['P-ONE', 'P-THREE', 'P-TWO']);
  assert.deepEqual(Object.keys(r.rows[0]), ['partCode', 'desc', 'group', 'unit', 'bin', 'active', 'onHand', 'reorderLevel', 'reorderQty', 'valuePaise', 'lastReceiptCostPaise', 'lastReceiptDate']);
  assert.deepEqual(r.rows.map((x) => [x.onHand, x.valuePaise, x.lastReceiptCostPaise, x.lastReceiptDate]), [
    [3, 3600, 1200, '2026-11-03'], [3, 2100, 700, '2026-11-03'], [4, 2000, null, '']
  ]);
  assert.equal(r.rows[0].desc, 'Test battery');
  assert.equal(r.rows[0].group, 'Battery');
  assert.equal(r.rows[0].bin, 'A1');
  assert.equal(r.rows[0].active, true);
  assert.equal(r.rows[0].reorderLevel, 5);
  assert.equal(r.rows[0].reorderQty, 6);
  assert.equal(r.rows.reduce((s, x) => s + x.valuePaise, 0), 7700);
});

test('R03 stock list for staff has quantities only', () => {
  const { env } = std();
  const r = env.core.reportData('svcStockList', {}, env.staff());
  assert.equal(r.ok, true);
  assert.equal(r.costBasis, '');
  for (const row of r.rows) {
    assert.equal(row.valuePaise, null);
    assert.equal(row.lastReceiptCostPaise, null);
  }
  assert.deepEqual(r.rows.map((x) => x.onHand), [3, 3, 4]);
});

test('R04 stock list as at a past day replays the ledger to the end of that India day', () => {
  const { env } = std();
  const at = (d) => env.core.reportData('svcStockList', { asOf: d }, env.manager());
  const d6 = at('2026-11-06');
  assert.equal(d6.asOf, '2026-11-06');
  assert.equal(d6.lastMovementDate, '2026-11-06');
  assert.deepEqual(d6.rows.map((x) => [x.partCode, x.onHand, x.valuePaise]), [['P-ONE', 4, 4800], ['P-THREE', 3, 2100], ['P-TWO', 4, 2000]]);
  const d7 = at('2026-11-07');
  assert.deepEqual(d7.rows.map((x) => [x.partCode, x.onHand, x.valuePaise]), [['P-ONE', 3, 3600], ['P-THREE', 3, 2100], ['P-TWO', 3, 1500]]);
  const d2 = at('2026-11-02');
  assert.deepEqual(d2.rows.map((x) => [x.partCode, x.onHand, x.valuePaise, x.lastReceiptDate]), [['P-ONE', 10, 10000, ''], ['P-THREE', 0, 0, ''], ['P-TWO', 4, 2000, '']]);
  assert.equal(d2.lastMovementDate, '2026-11-01');
  assert.equal(at('2026-11-14').code, 'ARG_INVALID');
  assert.equal(at('2026-02-30').code, 'ARG_INVALID');
  assert.equal(at('yesterday').code, 'ARG_INVALID');
});

test('R05 stock list filters: group, includeZero, inactive parts with stock', () => {
  const { env } = std();
  const m = env.manager();
  assert.deepEqual(env.core.reportData('svcStockList', { group: 'battery' }, m).rows.map((x) => x.partCode), ['P-ONE']);
  assert.deepEqual(env.core.reportData('svcStockList', { group: 'nothing' }, m).rows, []);
  env.core.savePart({ code: 'Z-0', name: 'No stock', group: 'Misc', unit: 'pc', sellPricePaise: 0, priceIncludesTax: null }, m);
  assert.equal(env.core.reportData('svcStockList', {}, m).rows.some((x) => x.partCode === 'Z-0'), false);
  const inc = env.core.reportData('svcStockList', { includeZero: true }, m);
  assert.equal(inc.rows.some((x) => x.partCode === 'Z-0' && x.onHand === 0 && x.valuePaise === 0), true);
  env.core.setPartActive('P-TWO', false, 'range dropped', m);
  const two = env.core.reportData('svcStockList', {}, m).rows.find((x) => x.partCode === 'P-TWO');
  assert.equal(two.active, false);
  assert.equal(two.onHand, 4);
});

test('R06 reports on an empty store say NOT_READY; a blocked store says CHAIN_BROKEN with no figures', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  for (const t of ['svcStockList', 'svcReorderList']) assert.equal(env.core.reportData(t, {}, env.manager()).code, 'NOT_READY', t);
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, env.manager()).code, 'NOT_READY');
  const e2 = makeEnv();
  buildStandard(e2);
  const key = e2.adapter.svcsKeys().find((k) => /ledger/.test(k));
  const arr = JSON.parse(e2.adapter.data.get(key));
  arr[2].b.note = 'tampered';
  e2.adapter.data.set(key, JSON.stringify(arr));
  e2.core.reopen();
  for (const t of ['svcStockList', 'svcPartLedger', 'svcReorderList', 'svcGoodsReceipt', 'svcAdjustmentRegister']) {
    const r = e2.core.reportData(t, { partCode: 'P-ONE', grnNo: 'GRN/26-27/0001' }, e2.manager());
    assert.equal(r.ok, false, t);
    assert.equal(r.code, 'CHAIN_BROKEN', t);
    assert.equal(r.rows, undefined);
    assert.equal(r.opening, undefined);
  }
});

test('R07 part ledger: P6 LedgerRow shape, arithmetic and closing figures', () => {
  const { env } = std();
  const r = env.core.reportData('svcPartLedger', { partCode: 'p-one', from: '2026-11-04' }, env.manager());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.part, { partCode: 'P-ONE', desc: 'Test battery', group: 'Battery', unit: 'pc', bin: 'A1' });
  assert.equal(r.from, '2026-11-04');
  assert.equal(r.to, '2026-11-13');
  assert.equal(r.costBasis, 'EXCL_GST');
  assert.deepEqual(r.opening, { qty: 15, valuePaise: 16000 });
  assert.deepEqual(Object.keys(r.rows[0]), ['seq', 'date', 'docType', 'docNo', 'jobId', 'note', 'inQty', 'outQty', 'valueInPaise', 'valueOutPaise', 'balQty', 'balValuePaise', 'reversed', 'isReversal', 'reversalOf', 'actor']);
  assert.deepEqual(r.rows.map((x) => [x.docType, x.docNo, x.inQty, x.outQty, x.valueInPaise, x.valueOutPaise, x.balQty, x.balValuePaise]), [
    ['ISSUE', 'ISS/26-27/0001', 0, 12, 0, 12400, 3, 3600],
    ['RETURN', 'RET/26-27/0001', 1, 0, 1200, 0, 4, 4800],
    ['COUNTER', 'CSL/26-27/0001', 0, 1, 0, 1200, 3, 3600],
    ['ADJUST', 'ADJ/26-27/0001', 0, 1, 0, 1200, 2, 2400],
    ['REVERSAL', 'CSL/26-27/0001', 1, 0, 1200, 0, 3, 3600]
  ]);
  assert.deepEqual(r.closing, { qty: 3, valuePaise: 3600 });
  // arithmetic the report re-checks
  let q = r.opening.qty;
  let v = r.opening.valuePaise;
  for (const x of r.rows) {
    q = q + x.inQty - x.outQty;
    v = v + x.valueInPaise - x.valueOutPaise;
    assert.equal(x.balQty, q);
    assert.equal(x.balValuePaise, v);
  }
  assert.equal(q, r.closing.qty);
  assert.equal(v, r.closing.valuePaise);
  assert.equal(r.rows[0].jobId, 'JOB-1');
  assert.equal(r.rows[2].reversed, true);
  assert.equal(r.rows[4].isReversal, true);
  assert.equal(r.rows[4].reversalOf, 'CSL/26-27/0001');
  assert.equal(r.rows[4].note, 'sale was cancelled');
  assert.equal(r.rows[0].actor, 'Test Manager');
  assert.equal(r.rows[0].date, '2026-11-05');
});

test('R08 part ledger layers: remaining FIFO layers add up to the closing value when the period ends today', () => {
  const { env } = std();
  const m = env.manager();
  const r = env.core.reportData('svcPartLedger', { partCode: 'P-ONE', from: '2026-11-01' }, m);
  assert.equal(Array.isArray(r.layers), true);
  assert.deepEqual(r.layers, [{ layerId: 'MV00000003', grnNo: 'GRN/26-27/0001', date: '2026-11-03', qtyReceived: 5, qtyRemaining: 3, unitCostPaise: 1200 }]);
  assert.equal(r.layers.reduce((s, l) => s + l.qtyRemaining * l.unitCostPaise, 0), r.closing.valuePaise);
  const past = env.core.reportData('svcPartLedger', { partCode: 'P-ONE', from: '2026-11-01', to: '2026-11-12' }, m);
  assert.equal(past.layers, null);
  assert.equal(past.to, '2026-11-12');
});

test('R09 part ledger arguments: defaults, limits and refusals', () => {
  const { env } = std();
  const m = env.manager();
  const d = env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, m);
  assert.equal(d.from, '2026-04-01');
  assert.equal(d.to, '2026-11-13');
  assert.equal(env.core.reportData('svcPartLedger', {}, m).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 5 }, m).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'NOPE' }, m).code, 'PART_UNKNOWN');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE', from: '2026-11-10', to: '2026-11-09' }, m).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE', to: '2026-11-14' }, m).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE', from: '2023-01-01', to: '2026-11-13' }, m).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE', from: '2023-11-14', to: '2026-11-13' }, m).ok, true, '1100 days is allowed');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, env.staff()).code, 'ROLE_DENIED');
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, env.owner()).ok, true);
});

test('R10 a part with stock but no master row can still be reported', () => {
  const { env } = std();
  env.core.setPartActive('P-THREE', false, 'range dropped', env.manager());
  const r = env.core.reportData('svcPartLedger', { partCode: 'P-THREE' }, env.manager());
  assert.equal(r.ok, true);
  assert.equal(r.closing.qty, 3);
});

test('R11 reorder list: StockRow fields plus shortBy, suggestion and estimate', () => {
  const { env } = std();
  const r = env.core.reportData('svcReorderList', {}, env.manager());
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => [x.partCode, x.onHand, x.reorderLevel, x.shortBy, x.suggestQty, x.lastReceiptCostPaise, x.estCostPaise, x.lastReceiptDate]), [
    ['P-ONE', 3, 5, 2, 6, 1200, 7200, '2026-11-03'],
    ['P-THREE', 3, 3, 0, 0, 700, 0, '2026-11-03']
  ]);
  assert.equal(r.rows[0].desc, 'Test battery');
  assert.deepEqual(env.core.reportData('svcReorderList', { group: 'glass' }, env.manager()).rows.map((x) => x.partCode), ['P-THREE']);
  const s = env.core.reportData('svcReorderList', {}, env.staff());
  assert.equal(s.rows[0].lastReceiptCostPaise, null);
  assert.equal(s.rows[0].estCostPaise, null);
  assert.equal(s.rows[0].onHand, 3);
});

test('R12 goods receipt: header and lines in the reader shape', () => {
  const { env } = std();
  const r = env.core.reportData('svcGoodsReceipt', { grnNo: 'grn/26-27/0001' }, env.manager());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.header, {
    grnNo: 'GRN/26-27/0001', date: '2026-11-03', supplier: 'Demo Supplier', invoiceNo: 'INV-1', invoiceDate: '2026-10-30',
    receivedBy: 'Test Manager', status: 'POSTED', reversedDate: '', reversedBy: '', reversalReason: '', costBasis: 'EXCL_GST'
  });
  assert.deepEqual(r.lines, [
    { partCode: 'P-ONE', desc: 'Test battery', qtyReceived: 5, qtyShort: 3, unitCostPaise: 1200, lineValuePaise: 6000 },
    { partCode: 'P-THREE', desc: 'Test glass', qtyReceived: 3, qtyShort: 0, unitCostPaise: 700, lineValuePaise: 2100 }
  ]);
  const s = env.core.reportData('svcGoodsReceipt', { grnNo: 'GRN/26-27/0001' }, env.staff());
  assert.equal(s.header.costBasis, '');
  assert.equal(s.lines[0].unitCostPaise, null);
  assert.equal(s.lines[0].lineValuePaise, null);
  assert.equal(s.lines[0].qtyReceived, 5);
});

test('R13 goods receipt: reversed status, unknown and non-receipt numbers', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-02T06:00:00.000Z');
  const g = kitReceipt(env.kit, 'INV-9', [{ partCode: 'P-ONE', qtyReceived: 5, unitCostPaise: 100 }]);
  env.clock.set('2026-11-04T06:00:00.000Z');
  kitReverse(env.kit, g.no, 'entered twice by mistake');
  const r = env.core.reportData('svcGoodsReceipt', { grnNo: g.no }, env.owner());
  assert.equal(r.header.status, 'REVERSED');
  assert.equal(r.header.reversedDate, '2026-11-04');
  assert.equal(r.header.reversedBy, 'Test Owner');
  assert.equal(r.header.reversalReason, 'entered twice by mistake');
  assert.equal(env.core.reportData('svcGoodsReceipt', { grnNo: 'GRN/26-27/0099' }, env.owner()).code, 'GRN_UNKNOWN');
  assert.equal(env.core.reportData('svcGoodsReceipt', {}, env.owner()).code, 'ARG_INVALID');
  const refs = buildStandardOn(env);
  assert.equal(env.core.reportData('svcGoodsReceipt', { grnNo: refs }, env.owner()).code, 'GRN_UNKNOWN', 'an issue number is not a receipt');
});
function buildStandardOn(env) {
  env.clock.set('2026-11-05T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-TWO', qty: 5, unitCostPaise: 10 }]);
  const o = kitOpening(env.kit, [{ partCode: 'P-TWO', qty: 5, unitCostPaise: 10 }], pid);
  return o.no;
}

test('R14 adjustment register: awaiting on any date, decided inside the period, signed value effect', () => {
  const { env, refs } = std();
  const r = env.core.reportData('svcAdjustmentRegister', {}, env.manager());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.from, '2026-11-01');
  assert.equal(r.to, '2026-11-13');
  assert.deepEqual(r.awaiting.map((a) => [a.adjNo, a.date, a.partCode, a.qtyDelta, a.reasonCode, a.reasonLabel, a.valueEffectPaise, a.proposedBy, a.status]), [
    [refs.adj2, '2026-11-09', 'P-TWO', -1, 'COUNT_CORRECTION', 'Count correction', -500, 'Test Manager', 'PROPOSED']
  ]);
  assert.deepEqual(r.decided.map((a) => [a.adjNo, a.partCode, a.qtyDelta, a.reasonLabel, a.valueEffectPaise, a.status, a.decidedBy, a.decidedDate, a.approverRole]), [
    ['ADJ/26-27/0001', 'P-ONE', -1, 'Damaged', -1200, 'POSTED', 'Test Owner', '2026-11-08', 'Owner'],
    [refs.adj3, 'P-THREE', 1, 'Found', 700, 'REJECTED', 'Test Manager', '2026-11-09', 'Store Manager']
  ]);
  assert.deepEqual(Object.keys(r.awaiting[0]), ['adjNo', 'date', 'partCode', 'desc', 'qtyDelta', 'reasonCode', 'reasonLabel', 'note', 'valueEffectPaise', 'proposedBy', 'status', 'decidedBy', 'decidedDate', 'approverRole']);
  assert.equal(r.awaiting[0].desc, 'Test strap');
  assert.equal(r.awaiting[0].decidedBy, '');
});

test('R15 adjustment register period, roles and refusals', () => {
  const { env } = std();
  const m = env.manager();
  const late = env.core.reportData('svcAdjustmentRegister', { from: '2026-11-09', to: '2026-11-13' }, m);
  assert.deepEqual(late.decided.map((a) => a.status), ['REJECTED']);
  assert.equal(late.awaiting.length, 1);
  const none = env.core.reportData('svcAdjustmentRegister', { from: '2026-10-01', to: '2026-10-31' }, m);
  assert.deepEqual(none.decided, []);
  assert.equal(none.awaiting.length, 1);
  assert.equal(env.core.reportData('svcAdjustmentRegister', {}, env.staff()).code, 'ROLE_DENIED');
  assert.equal(env.core.reportData('svcAdjustmentRegister', {}, env.owner()).ok, true);
  assert.equal(env.core.reportData('svcAdjustmentRegister', { from: '2026-11-09', to: '2026-11-01' }, m).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcAdjustmentRegister', { from: 'x' }, m).code, 'ARG_INVALID');
});

test('R16 defective register: open items on any date, listed rows by registration date, state filter', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-10-20T06:00:00.000Z');
  const a = kitOldRegister(env.kit, { jobId: 'JOB-1', partCode: 'P-ONE', state: 'SCRAP_PENDING' });
  env.clock.set('2026-11-11T06:00:00.000Z');
  const b = kitOldRegister(env.kit, { jobId: 'JOB-2', partText: 'cracked glass', state: 'HELD_FOR_CLAIM', claimRef: 'CLM-1' });
  const c = kitOldRegister(env.kit, { jobId: 'JOB-3', partText: 'old strap', state: 'HELD_FOR_CLAIM' });
  env.clock.set('2026-11-12T06:00:00.000Z');
  kitOldMove(env.kit, c, 'HELD_FOR_CLAIM', 'CUSTOMER_RETURNED', { note: 'given back' });
  const d = kitOldRegister(env.kit, { partText: 'old crown', state: 'SCRAP_PENDING' });
  const r = env.core.reportData('svcDefectiveRegister', {}, env.staff());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.open.map((x) => [x.regNo, x.state]), [[a, 'SCRAP_PENDING'], [b, 'HELD_FOR_CLAIM'], [d, 'SCRAP_PENDING']]);
  assert.deepEqual(r.listed.map((x) => x.regNo), [b, c, d]);
  assert.deepEqual(Object.keys(r.open[0]), ['regNo', 'date', 'jobId', 'partCode', 'desc', 'qty', 'state', 'claimRef', 'decidedBy', 'decidedDate', 'signoffMonth']);
  const rb = r.listed.find((x) => x.regNo === b);
  assert.equal(rb.claimRef, 'CLM-1');
  assert.equal(rb.desc, 'cracked glass');
  const rc = r.listed.find((x) => x.regNo === c);
  assert.equal(rc.state, 'CUSTOMER_RETURNED');
  assert.equal(rc.decidedDate, '2026-11-12');
  kitScrapSignoff(env.kit, '2026-10', [a]);
  const after = env.core.reportData('svcDefectiveRegister', { from: '2026-10-01', to: '2026-10-31' }, env.manager());
  assert.deepEqual(after.listed.map((x) => [x.regNo, x.state, x.signoffMonth]), [[a, 'SCRAPPED', '2026-10']]);
  assert.deepEqual(after.open.map((x) => x.regNo), [b, d]);
  assert.deepEqual(env.core.reportData('svcDefectiveRegister', { state: 'CUSTOMER_RETURNED' }, env.manager()).listed.map((x) => x.regNo), [c]);
  assert.equal(env.core.reportData('svcDefectiveRegister', { state: 'RECEIVED' }, env.manager()).code, 'ARG_INVALID');
  assert.equal(env.core.reportData('svcDefectiveRegister', { from: '2026-11-30', to: '2026-11-01' }, env.manager()).code, 'ARG_INVALID');
});

test('R17 money is whole paise everywhere, dates are India dates, no customer data in any report', () => {
  const { env, refs } = std();
  kitOldRegister(env.kit, { jobId: 'JOB-1', partText: 'old crown', state: 'HELD_FOR_CLAIM' });
  const calls = [
    ['svcStockList', {}], ['svcStockList', { asOf: '2026-11-06' }], ['svcPartLedger', { partCode: 'P-ONE', from: '2026-11-01' }], ['svcReorderList', {}],
    ['svcGoodsReceipt', { grnNo: 'GRN/26-27/0001' }], ['svcAdjustmentRegister', {}], ['svcDefectiveRegister', {}]
  ];
  for (const [type, args] of calls) {
    for (const who of [env.manager(), env.owner()]) {
      const r = env.core.reportData(type, args, who);
      assert.equal(r.ok, true, type + JSON.stringify(r).slice(0, 200));
      assert.deepEqual(JSON.parse(JSON.stringify(r)), JSON.parse(JSON.stringify(r)));
      walk(r, (key, val) => {
        if (/Paise$/.test(key) && val !== null) assert.ok(Number.isInteger(val), type + ' ' + key + '=' + val);
        if (/(^date$|Date$)/.test(key) && typeof val === 'string' && val !== '') assert.match(val, /^\d{4}-\d{2}-\d{2}$/, type + ' ' + key);
        if (typeof val === 'number') assert.ok(Number.isInteger(val), type + ' ' + key + ' must be an integer');
        assert.ok(!/custName|custMobile|custAddr|mobile|phone|e-?mail|address/i.test(key), 'customer field ' + key);
        if (typeof val === 'string') assert.ok(!/\d{10}/.test(val), type + ' ' + key + ' holds a long digit run');
      });
    }
  }
  assert.ok(refs.csl.no);
});

test('R18 report data is a copy: changing it does not change the next answer', () => {
  const { env } = std();
  const a = env.core.reportData('svcStockList', {}, env.manager());
  assert.ok(Object.isFrozen(a));
  const b = env.core.reportData('svcStockList', {}, env.manager());
  assert.notEqual(a.rows, b.rows);
  assert.deepEqual(a, b);
  a.rows[0].onHand = 999;
  assert.equal(env.core.reportData('svcStockList', {}, env.manager()).rows[0].onHand, 3);
});

test('R19 a role downgrade is seen on the very next call (no cached rights)', () => {
  const { env } = std();
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, env.owner()).ok, true);
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, env.staff()).ok, false);
  assert.equal(env.core.reportData('svcPartLedger', { partCode: 'P-ONE' }, env.manager()).ok, true);
  assert.equal(env.core.reportData('svcStockList', {}, env.staff()).rows[0].valuePaise, null);
  assert.equal(env.core.reportData('svcStockList', {}, env.owner()).rows[0].valuePaise, 3600);
});

test('R20 a large report builds quickly', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 100000, unitCostPaise: 10 }]);
  kitOpening(env.kit, [{ partCode: 'P-ONE', qty: 100000, unitCostPaise: 10 }], pid);
  const t0 = process.hrtime.bigint();
  const r = env.core.reportData('svcStockList', {}, env.manager());
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(r.ok, true);
  assert.ok(ms < 1500, 'took ' + ms + ' ms');
});
