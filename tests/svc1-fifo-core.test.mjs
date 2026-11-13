import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const F = require('../www/service-stores-fifo.js');
const SRC_URL = new URL('../www/service-stores-fifo.js', import.meta.url);

// ---------- invented sessions and helpers ----------

const OWNER = { ok: true, isOwner: true, isManager: true, role: 'Store Manager', tier: 'owner', actorName: 'Test Owner' };
const MANAGER = { ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Test Manager' };
const STAFF = { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Staff' };
const BROKEN = { ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' };
const O = { session: OWNER, reauth: true };
const O0 = { session: OWNER, reauth: false };
const M = { session: MANAGER };
const S = { session: STAFF };

const BASE = Date.UTC(2026, 10, 2, 4, 30, 0);
const at = (n) => new Date(BASE + n * 1000).toISOString();
const ID = (n) => 'MV' + String(n).padStart(8, '0');
const L1 = ID(1);
const L2 = ID(2);

function post(st, r) {
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = F.applyMovement(st, r.movement);
  assert.equal(a.ok, true, JSON.stringify(a));
  return r.movement;
}
const rcv = (st, code, qty, cost, n, grn = 'G1', line = 1, ctx = M, extra = {}) =>
  F.planReceipt(st, { partCode: code, qty, unitCostPaise: cost, at: at(n), ref: { grnNo: grn, lineNo: line }, ...extra }, ctx);
const iss = (st, code, qty, n, job = 'J-1', extra = {}, ctx = M) =>
  F.planIssueToJob(st, { partCode: code, qty, at: at(n), ref: { jobId: job }, ...extra }, ctx);
const ret = (st, issueId, qty, n, job = 'J-1', extra = {}, ctx = M) =>
  F.planReturnFromJob(st, { issueId, qty, at: at(n), ref: { jobId: job }, ...extra }, ctx);
const csl = (st, code, qty, n, sale = 'S-1', extra = {}, ctx = M) =>
  F.planCounterSale(st, { partCode: code, qty, at: at(n), ref: { saleRef: sale }, ...extra }, ctx);
const adj = (st, direction, code, qty, reason, n, extra = {}, ctx = M) =>
  F.planAdjustment(st, { direction, partCode: code, qty, reason, at: at(n), ...extra }, ctx);
const rev = (st, id, n, note = 'fix it', ctx = M, extra = {}) =>
  F.planReversal(st, { reverses: id, at: at(n), note, ...extra }, ctx);
const opn = (st, code, qty, cost, n, ctx = O) =>
  F.planOpening(st, { partCode: code, qty, unitCostPaise: cost, at: at(n) }, ctx);

function expectFail(r, code, detail) {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.code, code, JSON.stringify(r));
  assert.ok(typeof r.message === 'string' && r.message.length > 0);
  if (detail) assert.deepEqual(r.detail, detail);
}
const parts = (st) => F.exportState(st).parts;
const clone = (x) => JSON.parse(JSON.stringify(x));

// Fixture F1: steps 1..6 of the spec.
function f1(upTo = 6) {
  const st = F.emptyState();
  const mvs = [];
  const steps = [
    () => rcv(st, 'TEST-001', 10, 10000, 0, 'G1', 1),
    () => rcv(st, 'TEST-001', 5, 12000, 1, 'G1', 2),
    () => iss(st, 'TEST-001', 12, 2, 'J-1'),
    () => ret(st, ID(3), 4, 3, 'J-1'),
    () => iss(st, 'TEST-001', 3, 4, 'J-2'),
    () => rev(st, ID(5), 5, 'wrong job')
  ];
  for (let i = 0; i < upTo; i++) mvs.push(post(st, steps[i]()));
  return { st, mvs };
}

function checkInvariants(st, code, mvsOfPart) {
  const p = F.exportState(st).parts[code];
  let q = 0;
  let v = 0;
  for (const m of mvsOfPart) {
    q += m.qty;
    v += m.valuePaise;
  }
  if (!p) {
    assert.equal(q, 0);
    assert.equal(v, 0);
    return;
  }
  assert.equal(p.qty, q, code + ' I1');
  assert.equal(p.valuePaise, v, code + ' I2');
  let lv = 0;
  for (const l of p.layers) {
    lv += l.qtyLeft * l.unitCostPaise;
    assert.ok(l.qtyLeft >= 0 && l.qtyLeft <= l.qtyIn - l.settled, code + ' I4');
  }
  let open = 0;
  for (const d of p.debts) {
    lv -= d.qty * d.unitCostPaise;
    assert.ok(d.qty >= 0 && d.qty <= d.qtyOrig, code + ' debt range');
    open += d.qty;
  }
  assert.equal(p.valuePaise, lv, code + ' I3');
  if (p.qty < 0) assert.ok(open > 0, code + ' I5');
}

function eachNumber(v, fn) {
  if (typeof v === 'number') fn(v);
  else if (Array.isArray(v)) v.forEach((x) => eachNumber(x, fn));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => eachNumber(v[k], fn));
}

// ---------- A. Helpers ----------

test('T01 normalizePartCode', () => {
  assert.equal(F.normalizePartCode(' ab-01 '), 'AB-01');
  assert.equal(F.normalizePartCode('00123'), '00123');
  for (const bad of ['', 'a b', 'A'.repeat(41), 123, null, undefined, {}, '-A', '.A']) {
    assert.equal(F.normalizePartCode(bad), '');
  }
  assert.equal(F.normalizePartCode('A'.repeat(40)), 'A'.repeat(40));
  assert.equal(F.normalizePartCode('x.y/z#1'), '');
  assert.equal(F.normalizePartCode('x.y/z_1'), 'X.Y/Z_1');
  assert.equal(F.normalizePartCode('x.y/z-1'), 'X.Y/Z-1');
});

test('T02 isIsoInstant', () => {
  assert.equal(F.isIsoInstant('2026-11-02T04:30:00.000Z'), true);
  for (const bad of ['2026-11-02', '2026-11-02T04:30:00Z', '2026-13-02T04:30:00.000Z', '2026-02-30T04:30:00.000Z',
    '2026-11-02 04:30:00.000Z', '2026-11-02T24:00:00.000Z', '2026-11-02T04:60:00.000Z', 5, null, undefined]) {
    assert.equal(F.isIsoInstant(bad), false, String(bad));
  }
  assert.equal(F.isIsoInstant('2028-02-29T00:00:00.000Z'), true);
  assert.equal(F.isIsoInstant('2026-02-29T00:00:00.000Z'), false);
});

test('T03 unitCostFromTotal rounds half up in integer paise', () => {
  const table = [[10005, 10, 1001, -5], [10004, 10, 1000, 4], [1, 3, 0, 1], [2, 3, 1, -1], [100, 3, 33, 1],
    [101, 3, 34, -1], [5, 2, 3, -1], [0, 5, 0, 0], [10000, 1, 10000, 0]];
  for (const [t, q, u, r] of table) {
    const x = F.unitCostFromTotal(t, q);
    assert.equal(x.ok, true);
    assert.equal(x.unitCostPaise, u, t + '/' + q);
    assert.equal(x.remainderPaise, r, t + '/' + q);
    assert.equal(Object.is(x.remainderPaise, -0), false);
  }
  expectFail(F.unitCostFromTotal(-1, 2), 'BAD_AMOUNT');
  expectFail(F.unitCostFromTotal(1.5, 2), 'BAD_AMOUNT');
  expectFail(F.unitCostFromTotal(1e12 + 1, 2), 'BAD_AMOUNT');
  expectFail(F.unitCostFromTotal(100, 0), 'BAD_QTY');
  expectFail(F.unitCostFromTotal(100, 2.5), 'BAD_QTY');
});

test('T04 avgCostPaise', () => {
  assert.equal(F.avgCostPaise(80000, 7), 11429);
  assert.equal(F.avgCostPaise(100, 3), 33);
  assert.equal(F.avgCostPaise(101, 3), 34);
  assert.equal(F.avgCostPaise(0, 5), 0);
  assert.equal(F.avgCostPaise(5, 0), null);
  assert.equal(F.avgCostPaise(-10000, 2), null);
});

test('T05 India date helpers', () => {
  assert.equal(F.istDate('2026-11-02T18:29:59.999Z'), '2026-11-02');
  assert.equal(F.istDate('2026-11-02T18:30:00.000Z'), '2026-11-03');
  assert.equal(F.istDayEndInstant('2026-11-02'), '2026-11-02T18:29:59.999Z');
  assert.equal(F.istDayEndInstant('2026-02-30'), '');
  assert.equal(F.istDayEndInstant('x'), '');
  assert.equal(F.istDate('nope'), '');
});

test('T06 ledgerKeyForAt', () => {
  assert.equal(F.ledgerKeyForAt('2026-11-30T19:00:00.000Z'), 'saagar_svcs_ledger_v1_2026-12');
  assert.equal(F.ledgerKeyForAt('2026-03-31T18:29:59.999Z'), 'saagar_svcs_ledger_v1_2026-03');
  assert.equal(F.ledgerKeyForAt('x'), '');
});

// ---------- B. Opening ----------

test('T07 opening by the Owner with PIN', () => {
  const st = F.emptyState();
  const r = opn(st, 'TEST-001', 10, 10000, 0);
  assert.equal(r.ok, true);
  const m = r.movement;
  assert.equal(m.type, 'opening');
  assert.equal(m.seq, 1);
  assert.equal(m.id, 'MV00000001');
  assert.equal(m.qty, 10);
  assert.equal(m.valuePaise, 100000);
  assert.equal(m.newLayerId, 'MV00000001');
  assert.equal(m.unitCostPaise, 10000);
  assert.equal(m.docDate, '2026-11-02');
  assert.equal(m.approval.by, 'Test Owner');
  assert.equal(m.actor.name, 'Test Owner');
  assert.equal(Object.isFrozen(m), true);
  assert.deepEqual(F.exportState(st).parts, {});
  post(st, r);
  assert.equal(F.partBalance(st, 'TEST-001').qty, 10);
});

test('T08 second opening for the same part', () => {
  const st = F.emptyState();
  post(st, opn(st, 'TEST-001', 10, 10000, 0));
  expectFail(opn(st, 'TEST-001', 5, 10000, 1), 'OPENING_EXISTS');
});

test('T09 opening after a receipt', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-001', 5, 10000, 0));
  expectFail(opn(st, 'TEST-001', 5, 10000, 1), 'OPENING_AFTER_ACTIVITY');
});

test('T10 opening needs the Owner and the PIN', () => {
  const st = F.emptyState();
  expectFail(F.planOpening(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0) }, O0), 'REAUTH_REQUIRED');
  expectFail(F.planOpening(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0) }, { session: MANAGER, reauth: true }), 'ROLE_DENIED');
  expectFail(F.planOpening(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0) }, { session: STAFF, reauth: true }), 'ROLE_DENIED');
});

test('T11 opening quantity 0', () => {
  expectFail(opn(F.emptyState(), 'TEST-001', 0, 10000, 0), 'QTY_INVALID');
});

test('T12 opening is not reversible, an adjustment fixes it', () => {
  const st = F.emptyState();
  const o = post(st, opn(st, 'TEST-001', 10, 10000, 0));
  expectFail(rev(st, o.id, 1, 'wrong count'), 'OPENING_NOT_REVERSIBLE');
  expectFail(rev(st, o.id, 1, 'wrong count', O), 'OPENING_NOT_REVERSIBLE');
  const a = post(st, adj(st, 'down', 'TEST-001', 2, 'count_correction', 2));
  assert.equal(a.valuePaise, -20000);
  assert.equal(F.partBalance(st, 'TEST-001').qty, 8);
});

// ---------- C. Receipt ----------

test('T13 two receipts build two layers', () => {
  const { st } = f1(2);
  const p = parts(st)['TEST-001'];
  assert.equal(p.qty, 15);
  assert.equal(p.valuePaise, 160000);
  assert.equal(p.lastCostPaise, 12000);
  assert.equal(p.layers.length, 2);
  assert.equal(p.layers[0].qtyLeft, 10);
  assert.equal(p.layers[1].qtyLeft, 5);
});

test('T14 unit cost 0 is accepted', () => {
  const st = F.emptyState();
  const m = post(st, rcv(st, 'TEST-001', 4, 0, 0));
  assert.equal(m.valuePaise, 0);
  assert.equal(Object.is(m.valuePaise, -0), false);
  assert.equal(m.qty, 4);
  assert.equal(F.layersForPart(st, 'TEST-001')[0].unitCostPaise, 0);
});

test('T15 duplicate GRN line', () => {
  const st = F.emptyState();
  const first = post(st, rcv(st, 'TEST-001', 5, 100, 0, 'G1', 1));
  expectFail(rcv(st, 'TEST-001', 5, 100, 1, 'G1', 1), 'DUPLICATE_REF');
  post(st, rcv(st, 'TEST-002', 5, 100, 1, 'G1', 1));
  post(st, rev(st, first.id, 2, 'wrong receipt'));
  post(st, rcv(st, 'TEST-001', 5, 100, 3, 'G1', 1));
});

test('T16 receipt references', () => {
  const st = F.emptyState();
  const base = { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0) };
  expectFail(F.planReceipt(st, { ...base, ref: { lineNo: 1 } }, M), 'REF_REQUIRED');
  expectFail(F.planReceipt(st, { ...base, ref: { grnNo: 'G1' } }, M), 'REF_REQUIRED');
  expectFail(F.planReceipt(st, { ...base }, M), 'REF_REQUIRED');
  for (const bad of [0, 1.5, '1', 10000, -1]) {
    expectFail(F.planReceipt(st, { ...base, ref: { grnNo: 'G1', lineNo: bad } }, M), 'REF_INVALID');
  }
  expectFail(F.planReceipt(st, { ...base, ref: { grnNo: 'G1', lineNo: 1, phone: '9' } }, M), 'REF_INVALID');
  expectFail(F.planReceipt(st, { ...base, ref: { grnNo: '', lineNo: 1 } }, M), 'REF_INVALID');
  expectFail(F.planReceipt(st, { ...base, ref: 'G1' }, M), 'REF_INVALID');
  const ok = F.planReceipt(st, { ...base, ref: { grnNo: ' G1 ', lineNo: 1, supplierInvoiceNo: 'INV-9' } }, M);
  assert.equal(ok.ok, true);
  assert.equal(ok.movement.ref.grnNo, 'G1');
  assert.equal(ok.movement.ref.supplierInvoiceNo, 'INV-9');
});

test('T17 quantity rules', () => {
  const st = F.emptyState();
  for (const bad of [0, -1, 1.5, '3', 1000001, NaN, Infinity, null, undefined]) {
    expectFail(rcv(st, 'TEST-001', bad, 100, 0), 'QTY_INVALID');
  }
  assert.equal(rcv(st, 'TEST-001', 1000000, 100, 0).ok, true);
  assert.equal(rcv(st, 'TEST-001', 1, 100, 0).ok, true);
});

test('T18 unit cost rules', () => {
  const st = F.emptyState();
  for (const bad of [1.5, -1, '100', 100000001, NaN, null]) {
    expectFail(rcv(st, 'TEST-001', 1, bad, 0), 'COST_INVALID');
  }
  expectFail(F.planReceipt(st, { partCode: 'TEST-001', qty: 1, at: at(0), ref: { grnNo: 'G', lineNo: 1 } }, M), 'COST_REQUIRED');
  assert.equal(rcv(st, 'TEST-001', 1000000, 100000000, 0).ok, true);
});

test('T19 time rules', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-001', 1, 100, 10));
  expectFail(rcv(st, 'TEST-001', 1, 100, 9, 'G2'), 'AT_BEFORE_LAST');
  assert.equal(rcv(st, 'TEST-001', 1, 100, 10, 'G2').ok, true);
  expectFail(F.planReceipt(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: '2026-11-02', ref: { grnNo: 'G', lineNo: 1 } }, M), 'AT_INVALID');
  expectFail(F.planReceipt(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, ref: { grnNo: 'G', lineNo: 1 } }, M), 'AT_INVALID');
});

test('T20 unknown input keys are refused', () => {
  const st = F.emptyState();
  expectFail(rcv(st, 'TEST-001', 1, 100, 0, 'G1', 1, M, { price: 5 }), 'INPUT_INVALID');
  expectFail(iss(st, 'TEST-001', 1, 0, 'J', { colour: 'red' }), 'INPUT_INVALID');
  expectFail(F.planReceipt(st, 'x', M), 'INPUT_INVALID');
  expectFail(F.planReceipt(st, [], M), 'INPUT_INVALID');
  expectFail(F.planReceipt(st, null, M), 'INPUT_INVALID');
  expectFail(rcv(st, 'bad code', 1, 100, 0), 'PART_CODE_INVALID');
});

// ---------- D. Issue (FIFO) ----------

test('T21 issue 12 takes the oldest layer first', () => {
  const { st, mvs } = f1(3);
  const m = mvs[2];
  assert.deepEqual(m.layers, [{ layerId: L1, qty: 10, unitCostPaise: 10000 }, { layerId: L2, qty: 2, unitCostPaise: 12000 }]);
  assert.equal(m.qty, -12);
  assert.equal(m.valuePaise, -124000);
  assert.equal(m.debt, null);
  const p = parts(st)['TEST-001'];
  assert.equal(p.qty, 3);
  assert.equal(p.valuePaise, 36000);
  assert.equal(p.layers[0].qtyLeft, 0);
  assert.equal(p.layers[1].qtyLeft, 3);
});

test('T22 issue everything that is left', () => {
  const { st } = f1(3);
  post(st, iss(st, 'TEST-001', 3, 3, 'J-2'));
  const p = parts(st)['TEST-001'];
  assert.equal(p.qty, 0);
  assert.equal(p.valuePaise, 0);
  assert.equal(F.layersForPart(st, 'TEST-001', { onlyOpen: true }).length, 0);
  assert.equal(F.balances(st).length, 0);
});

test('T23 partial layer', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-001', 10, 10000, 0));
  const m = post(st, iss(st, 'TEST-001', 4, 1));
  assert.deepEqual(m.layers, [{ layerId: L1, qty: 4, unitCostPaise: 10000 }]);
  assert.equal(m.valuePaise, -40000);
  assert.equal(F.layersForPart(st, 'TEST-001')[0].qtyLeft, 6);
});

test('T24 issue across three layers', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-001', 2, 10000, 0, 'G1', 1));
  post(st, rcv(st, 'TEST-001', 3, 11000, 1, 'G1', 2));
  post(st, rcv(st, 'TEST-001', 4, 12000, 2, 'G1', 3));
  const m = post(st, iss(st, 'TEST-001', 6, 3));
  assert.deepEqual(m.layers, [
    { layerId: ID(1), qty: 2, unitCostPaise: 10000 },
    { layerId: ID(2), qty: 3, unitCostPaise: 11000 },
    { layerId: ID(3), qty: 1, unitCostPaise: 12000 }]);
  assert.equal(m.valuePaise, -65000);
  const p = parts(st)['TEST-001'];
  assert.equal(p.qty, 3);
  assert.equal(p.valuePaise, 36000);
});

test('T25 first in first out, not last in first out', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-001', 5, 10000, 0, 'G1', 1));
  post(st, rcv(st, 'TEST-001', 5, 8000, 1, 'G1', 2));
  const m = post(st, iss(st, 'TEST-001', 1, 2));
  assert.deepEqual(m.layers, [{ layerId: L1, qty: 1, unitCostPaise: 10000 }]);
});

test('T26 not enough stock', () => {
  const { st } = f1(2);
  expectFail(iss(st, 'TEST-001', 16, 5), 'INSUFFICIENT_STOCK', { available: 15, requested: 16 });
  expectFail(iss(st, 'TEST-009', 1, 5), 'INSUFFICIENT_STOCK', { available: 0, requested: 1 });
  assert.equal(iss(st, 'TEST-001', 15, 5).ok, true);
});

test('T27 issue needs a job and a valid role', () => {
  const { st } = f1(2);
  expectFail(F.planIssueToJob(st, { partCode: 'TEST-001', qty: 1, at: at(5) }, M), 'REF_REQUIRED');
  expectFail(F.planIssueToJob(st, { partCode: 'TEST-001', qty: 1, at: at(5), ref: {} }, M), 'REF_REQUIRED');
  assert.equal(iss(st, 'TEST-001', 1, 5, 'J-1', {}, S).ok, true);
  expectFail(iss(st, 'TEST-001', 1, 5, 'J-1', {}, { session: BROKEN }), 'SESSION_INVALID');
  const normal = iss(st, 'TEST-001', 12, 5);
  const flagged = iss(st, 'TEST-001', 12, 5, 'J-1', { allowNegative: false }, O);
  assert.deepEqual(flagged.movement.layers, normal.movement.layers);
  assert.equal(flagged.movement.override, null);
  expectFail(iss(st, 'TEST-001', 99, 5, 'J-1', { allowNegative: false }), 'INSUFFICIENT_STOCK');
});

test('T28 a reversed receipt layer is never used', () => {
  const st = F.emptyState();
  const r = post(st, rcv(st, 'TEST-001', 5, 10000, 0));
  post(st, rev(st, r.id, 1, 'wrong receipt'));
  expectFail(iss(st, 'TEST-001', 1, 2), 'INSUFFICIENT_STOCK');
  const l = F.layersForPart(st, 'TEST-001')[0];
  assert.equal(l.voided, true);
  assert.equal(l.qtyLeft, 0);
});

// ---------- E. Return ----------

test('T29 return goes back to the layers it came from, last consumed first', () => {
  const { st, mvs } = f1(4);
  const m = mvs[3];
  assert.deepEqual(m.layers, [{ layerId: L2, qty: 2, unitCostPaise: 12000 }, { layerId: L1, qty: 2, unitCostPaise: 10000 }]);
  assert.equal(m.qty, 4);
  assert.equal(m.valuePaise, 44000);
  assert.equal(m.returnsOf, ID(3));
  const p = parts(st)['TEST-001'];
  assert.equal(p.qty, 7);
  assert.equal(p.valuePaise, 80000);
  assert.equal(p.layers[0].qtyLeft, 2);
  assert.equal(p.layers[1].qtyLeft, 5);
  assert.equal(F.avgCostPaise(80000, 7), 11429);
});

test('T30 net cost of a job after a return', () => {
  const { mvs } = f1(4);
  const u = F.jobUsage(mvs, 'J-1');
  assert.equal(u.ok, true);
  assert.equal(u.issuedQty, 12);
  assert.equal(u.returnedQty, 4);
  assert.equal(u.netQty, 8);
  assert.equal(u.netValuePaise, 80000);
  assert.equal(u.netValuePaise, 8 * 10000);
  assert.deepEqual(u.byPart.map((x) => x.partCode), ['TEST-001']);
});

test('T31 two partial returns equal one return', () => {
  const a = f1(3);
  post(a.st, ret(a.st, ID(3), 2, 3));
  post(a.st, ret(a.st, ID(3), 2, 4));
  const b = f1(4);
  assert.deepEqual(parts(a.st), parts(b.st));
});

test('T32 outstanding quantity of an issue', () => {
  const { st } = f1(4);
  expectFail(ret(st, ID(3), 9, 6), 'RETURN_EXCEEDS_ISSUE', { outstanding: 8 });
  assert.equal(ret(st, ID(3), 8, 6).ok, true);
});

test('T33 return refusals', () => {
  const { st } = f1(4);
  expectFail(ret(st, ID(1), 1, 6), 'ISSUE_NOT_JOB');
  expectFail(ret(st, 'MV99999999', 1, 6), 'ISSUE_NOT_FOUND');
  expectFail(ret(st, ID(3), 1, 6, 'J-1', { partCode: 'TEST-002' }), 'PART_MISMATCH');
  assert.equal(ret(st, ID(3), 1, 6, 'J-1', { partCode: 'test-001' }).ok, true);
  expectFail(ret(st, ID(3), 1, 6, 'J-9'), 'RETURN_JOB_MISMATCH');
  expectFail(F.planReturnFromJob(st, { issueId: ID(3), qty: 1, at: at(6) }, M), 'REF_REQUIRED');
  const s2 = F.emptyState();
  post(s2, rcv(s2, 'TEST-001', 5, 100, 0));
  const i = post(s2, iss(s2, 'TEST-001', 2, 1));
  post(s2, rev(s2, i.id, 2, 'wrong job'));
  expectFail(ret(s2, i.id, 1, 3), 'ISSUE_REVERSED');
  const c = post(s2, csl(s2, 'TEST-001', 1, 4));
  expectFail(ret(s2, c.id, 1, 5), 'ISSUE_NOT_JOB');
  const rv = F.exportState(s2);
  assert.equal(rv.lastSeq, 4);
});

test('T34 returned units are issued again oldest first', () => {
  const { st } = f1(4);
  const m = post(st, iss(st, 'TEST-001', 3, 5, 'J-3'));
  assert.deepEqual(m.layers, [{ layerId: L1, qty: 2, unitCostPaise: 10000 }, { layerId: L2, qty: 1, unitCostPaise: 12000 }]);
  assert.equal(m.valuePaise, -32000);
});

// ---------- F. Counter sale ----------

test('T35 counter sale is a stock movement', () => {
  const { st } = f1(2);
  expectFail(F.planCounterSale(st, { partCode: 'TEST-001', qty: 2, at: at(5) }, M), 'REF_REQUIRED');
  const m = post(st, csl(st, 'TEST-001', 2, 5, 'S-1'));
  assert.equal(m.type, 'counter_sale');
  assert.deepEqual(m.layers, [{ layerId: L1, qty: 2, unitCostPaise: 10000 }]);
  assert.equal(m.valuePaise, -20000);
  assert.equal(m.ref.saleRef, 'S-1');
});

test('T36 counter sale limits and reversal', () => {
  const { st } = f1(2);
  expectFail(csl(st, 'TEST-001', 16, 5), 'INSUFFICIENT_STOCK', { available: 15, requested: 16 });
  const before = clone(parts(st));
  const m = post(st, csl(st, 'TEST-001', 2, 5));
  post(st, rev(st, m.id, 6, 'sale cancelled'));
  assert.deepEqual(parts(st), before);
});

// ---------- G. Adjustments ----------

test('T37 adjustment up', () => {
  const { st } = f1(2);
  const m = post(st, adj(st, 'up', 'TEST-001', 2, 'found', 5));
  assert.equal(m.type, 'adjust_up');
  assert.equal(m.unitCostPaise, 12000);
  assert.equal(m.valuePaise, 24000);
  assert.equal(m.newLayerId, m.id);
  assert.equal(m.reason, 'found');
  expectFail(adj(st, 'up', 'TEST-002', 3, 'found', 6), 'COST_REQUIRED');
  const w = post(st, adj(st, 'up', 'TEST-002', 3, 'found', 6, { unitCostPaise: 500 }));
  assert.equal(w.valuePaise, 1500);
});

test('T38 adjustment down', () => {
  const { st } = f1(2);
  const m = post(st, adj(st, 'down', 'TEST-001', 3, 'lost', 5));
  assert.equal(m.type, 'adjust_down');
  assert.deepEqual(m.layers, [{ layerId: L1, qty: 3, unitCostPaise: 10000 }]);
  assert.equal(m.valuePaise, -30000);
});

test('T39 adjustment reasons and direction', () => {
  const { st } = f1(2);
  expectFail(adj(st, 'down', 'TEST-001', 1, 'found', 5), 'REASON_INVALID');
  expectFail(adj(st, 'up', 'TEST-001', 1, 'lost', 5), 'REASON_INVALID');
  expectFail(adj(st, 'up', 'TEST-001', 1, undefined, 5), 'REASON_REQUIRED');
  expectFail(adj(st, 'down', 'TEST-001', 1, '', 5), 'REASON_REQUIRED');
  expectFail(adj(st, 'up', 'TEST-001', 1, 7, 5), 'REASON_INVALID');
  expectFail(adj(st, 'sideways', 'TEST-001', 1, 'lost', 5), 'DIRECTION_INVALID');
  for (const r of F.REASONS_UP) assert.equal(adj(st, 'up', 'TEST-001', 1, r, 5).ok, true, r);
  for (const r of F.REASONS_DOWN) assert.equal(adj(st, 'down', 'TEST-001', 1, r, 5).ok, true, r);
});

test('T40 adjustment roles (Manager and Owner, no PIN; Staff denied)', () => {
  const { st } = f1(2);
  assert.equal(adj(st, 'up', 'TEST-001', 1, 'found', 5, {}, M).ok, true);
  assert.equal(adj(st, 'down', 'TEST-001', 1, 'lost', 5, {}, M).ok, true);
  assert.equal(adj(st, 'down', 'TEST-001', 1, 'lost', 5, {}, O0).ok, true);
  expectFail(adj(st, 'up', 'TEST-001', 1, 'found', 5, {}, S), 'ROLE_DENIED');
  expectFail(adj(st, 'down', 'TEST-001', 1, 'lost', 5, {}, S), 'ROLE_DENIED');
  expectFail(adj(st, 'down', 'TEST-001', 1, 'lost', 5, {}, { session: BROKEN }), 'SESSION_INVALID');
});

test('T41 adjustment down above stock and proposer name', () => {
  const { st } = f1(2);
  expectFail(adj(st, 'down', 'TEST-001', 16, 'lost', 5), 'INSUFFICIENT_STOCK', { available: 15, requested: 16 });
  const m = post(st, adj(st, 'down', 'TEST-001', 1, 'lost', 5, { proposedBy: 'Test Staff' }));
  assert.equal(m.proposedBy, 'Test Staff');
  assert.equal(m.approval.by, 'Test Manager');
  expectFail(adj(st, 'down', 'TEST-001', 1, 'lost', 6, { proposedBy: '' }), 'INPUT_INVALID');
});

// ---------- H. Reversal ----------

test('T42 reversal restores the same layers', () => {
  const before = f1(4);
  const { st, mvs } = f1(6);
  const r = mvs[5];
  assert.deepEqual(parts(st), parts(before.st));
  assert.equal(r.qty, 3);
  assert.equal(r.valuePaise, 32000);
  assert.equal(r.reverses, ID(5));
  assert.deepEqual(r.layers, mvs[4].layers);
  assert.equal(r.type, 'reversal');
});

test('T43 reversing a return needs its layers to be intact', () => {
  const a = f1(4);
  post(a.st, rev(a.st, ID(4), 5, 'wrong return'));
  assert.equal(F.partBalance(a.st, 'TEST-001').qty, 3);
  assert.equal(F.partBalance(a.st, 'TEST-001').valuePaise, 36000);
  const b = f1(4);
  post(b.st, iss(b.st, 'TEST-001', 7, 5, 'J-5'));
  expectFail(rev(b.st, ID(4), 6, 'wrong return'), 'LAYER_PARTLY_CONSUMED');
});

test('T44 reversing a receipt', () => {
  const st = F.emptyState();
  const r = post(st, rcv(st, 'TEST-001', 5, 10000, 0));
  const r2 = post(st, rev(st, r.id, 1, 'wrong receipt'));
  assert.equal(r2.valuePaise, -50000);
  assert.equal(F.partBalance(st, 'TEST-001').valuePaise, 0);
  const s2 = F.emptyState();
  const q = post(s2, rcv(s2, 'TEST-001', 5, 10000, 0));
  const i = post(s2, iss(s2, 'TEST-001', 2, 1));
  expectFail(rev(s2, q.id, 2, 'wrong receipt'), 'LAYER_PARTLY_CONSUMED');
  post(s2, rev(s2, i.id, 2, 'wrong job'));
  post(s2, rev(s2, q.id, 3, 'wrong receipt'));
  assert.equal(F.partBalance(s2, 'TEST-001').qty, 0);
});

test('T45 an issue with returns cannot be reversed first', () => {
  const { st } = f1(4);
  expectFail(rev(st, ID(3), 5, 'wrong job'), 'ISSUE_HAS_RETURNS');
  post(st, rev(st, ID(4), 5, 'wrong return'));
  post(st, rev(st, ID(3), 6, 'wrong job'));
  assert.equal(F.partBalance(st, 'TEST-001').qty, 15);
  assert.equal(F.partBalance(st, 'TEST-001').valuePaise, 160000);
});

test('T46 reversal refusals', () => {
  const { st } = f1(6);
  expectFail(rev(st, ID(6), 7, 'again'), 'CANNOT_REVERSE_REVERSAL');
  expectFail(rev(st, ID(5), 7, 'again'), 'ALREADY_REVERSED');
  expectFail(rev(st, 'MV99999999', 7, 'again'), 'MOVEMENT_NOT_FOUND');
});

test('T47 reversal role, reason', () => {
  const { st } = f1(5);
  assert.equal(rev(st, ID(5), 6, 'wrong job', M).ok, true);
  assert.equal(rev(st, ID(5), 6, 'wrong job', O0).ok, true);
  expectFail(rev(st, ID(5), 6, 'wrong job', S), 'ROLE_DENIED');
  expectFail(rev(st, ID(5), 6, '', M), 'REASON_REQUIRED');
  expectFail(rev(st, ID(5), 6, 'ab', M), 'REASON_REQUIRED');
  expectFail(rev(st, ID(5), 6, '  a ', M), 'REASON_REQUIRED');
  expectFail(F.planReversal(st, { at: at(6), note: 'abc' }, M), 'INPUT_INVALID');
  const ok = rev(st, ID(5), 6, 'wrong job', M, { ref: { grnNo: 'REV/26-27/0001', lineNo: 1 } });
  assert.equal(ok.movement.ref.grnNo, 'REV/26-27/0001');
  assert.equal(ok.movement.note, 'wrong job');
});

test('T48 reversal of adjust_up and adjust_down', () => {
  const st = F.emptyState();
  const all = [];
  all.push(post(st, rcv(st, 'TEST-001', 10, 10000, 0)));
  const up = post(st, adj(st, 'up', 'TEST-001', 3, 'found', 1));
  all.push(up);
  const down = post(st, adj(st, 'down', 'TEST-001', 4, 'damaged', 2));
  all.push(down);
  all.push(post(st, rev(st, down.id, 3, 'mistake')));
  checkInvariants(st, 'TEST-001', all);
  assert.equal(F.partBalance(st, 'TEST-001').qty, 13);
  all.push(post(st, rev(st, up.id, 4, 'mistake')));
  checkInvariants(st, 'TEST-001', all);
  assert.equal(F.partBalance(st, 'TEST-001').qty, 10);
  assert.equal(F.partBalance(st, 'TEST-001').valuePaise, 100000);
});

// ---------- I. Negative stock (Owner override) ----------

function negFixture() {
  const st = F.emptyState();
  const a = post(st, rcv(st, 'TEST-002', 3, 5000, 0));
  const i = post(st, iss(st, 'TEST-002', 5, 1, 'J-1', { allowNegative: true, note: 'cash sale not entered' }, O));
  return { st, a, i };
}

test('T49 Owner override creates a debt', () => {
  const { st, a, i } = negFixture();
  assert.deepEqual(i.layers, [{ layerId: a.id, qty: 3, unitCostPaise: 5000 }, { layerId: 'DEBT:' + i.id, qty: 2, unitCostPaise: 5000 }]);
  assert.deepEqual(i.debt, { qty: 2, unitCostPaise: 5000 });
  assert.equal(i.qty, -5);
  assert.equal(i.valuePaise, -25000);
  assert.equal(i.override.by, 'Test Owner');
  assert.equal(i.approval.by, 'Test Owner');
  const p = parts(st)['TEST-002'];
  assert.equal(p.qty, -2);
  assert.equal(p.valuePaise, -10000);
  assert.equal(F.balances(st)[0].negative, true);
  assert.equal(F.balances(st)[0].avgCostPaise, null);
  assert.deepEqual(p.debts, [{ id: i.id, qtyOrig: 2, qty: 2, unitCostPaise: 5000 }]);
});

test('T50 override needs Owner, PIN and a note', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-002', 3, 5000, 0));
  const extra = { allowNegative: true, note: 'cash sale not entered' };
  expectFail(iss(st, 'TEST-002', 5, 1, 'J-1', extra, M), 'ROLE_DENIED');
  expectFail(iss(st, 'TEST-002', 5, 1, 'J-1', extra, S), 'ROLE_DENIED');
  expectFail(iss(st, 'TEST-002', 5, 1, 'J-1', extra, O0), 'REAUTH_REQUIRED');
  expectFail(iss(st, 'TEST-002', 5, 1, 'J-1', { allowNegative: true }, O), 'REASON_REQUIRED');
  expectFail(iss(st, 'TEST-002', 5, 1, 'J-1', { allowNegative: true, note: 'ab' }, O), 'REASON_REQUIRED');
  expectFail(iss(st, 'TEST-002', 5, 1, 'J-1', { allowNegative: 'yes', note: 'abc' }, O), 'INPUT_INVALID');
  expectFail(csl(st, 'TEST-002', 5, 1, 'S-1', extra, M), 'ROLE_DENIED');
  expectFail(adj(st, 'down', 'TEST-002', 5, 'lost', 1, extra, M), 'ROLE_DENIED');
  assert.equal(csl(st, 'TEST-002', 5, 1, 'S-1', extra, O).ok, true);
  assert.equal(adj(st, 'down', 'TEST-002', 5, 'lost', 1, extra, O).ok, true);
  expectFail(adj(st, 'up', 'TEST-002', 5, 'found', 1, { allowNegative: true, note: 'abc' }, O), 'INPUT_INVALID');
});

test('T51 override on a part that never had a layer', () => {
  const st = F.emptyState();
  const extra = { allowNegative: true, note: 'stock not entered yet' };
  expectFail(iss(st, 'TEST-003', 2, 0, 'J-1', extra, O), 'COST_REQUIRED');
  const m = post(st, iss(st, 'TEST-003', 2, 0, 'J-1', { ...extra, unitCostPaise: 700 }, O));
  assert.deepEqual(m.debt, { qty: 2, unitCostPaise: 700 });
  assert.equal(m.valuePaise, -1400);
  assert.equal(m.qty, -2);
  const s2 = F.emptyState();
  post(s2, rcv(s2, 'TEST-003', 5, 100, 0));
  expectFail(iss(s2, 'TEST-003', 2, 1, 'J-1', { unitCostPaise: 700 }), 'INPUT_INVALID');
  expectFail(iss(s2, 'TEST-003', 9, 1, 'J-1', { ...extra, unitCostPaise: 700 }, O), 'INPUT_INVALID');
  expectFail(iss(s2, 'TEST-003', 2, 1, 'J-1', { ...extra, unitCostPaise: -4 }, O), 'COST_INVALID');
});

test('T52 a later receipt settles the debt first', () => {
  const { st, i } = negFixture();
  const r = post(st, rcv(st, 'TEST-002', 10, 6000, 2, 'G2', 1));
  assert.deepEqual(r.settles, [{ debtId: i.id, qty: 2, debtUnitCostPaise: 5000 }]);
  assert.equal(r.trueUpPaise, 2000);
  assert.equal(r.qty, 10);
  assert.equal(r.valuePaise, 58000);
  const p = parts(st)['TEST-002'];
  assert.equal(p.layers[1].qtyLeft, 8);
  assert.equal(p.layers[1].settled, 2);
  assert.equal(p.qty, 8);
  assert.equal(p.valuePaise, 48000);
  assert.equal(15000 - 25000 + 58000, 48000);
  assert.deepEqual(p.debts[0].qty, 0);
});

test('T53 reversing that receipt re-opens the debt', () => {
  const { st, i } = negFixture();
  const r = post(st, rcv(st, 'TEST-002', 10, 6000, 2, 'G2', 1));
  post(st, rev(st, r.id, 3, 'wrong receipt'));
  const p = parts(st)['TEST-002'];
  assert.equal(p.qty, -2);
  assert.equal(p.valuePaise, -10000);
  assert.equal(p.layers[1].voided, true);
  assert.equal(p.debts[0].qty, 2);
  assert.equal(p.debts[0].id, i.id);
});

test('T54 reversing the override issue', () => {
  const a = negFixture();
  post(a.st, rev(a.st, a.i.id, 2, 'wrong job'));
  const p = parts(a.st)['TEST-002'];
  assert.equal(p.qty, 3);
  assert.equal(p.valuePaise, 15000);
  assert.deepEqual(p.debts, []);
  const b = negFixture();
  post(b.st, rcv(b.st, 'TEST-002', 10, 6000, 2, 'G2', 1));
  expectFail(rev(b.st, b.i.id, 3, 'wrong job'), 'DEBT_ALREADY_SETTLED');
});

test('T55 returning the shortfall part of an override issue', () => {
  const { st, i } = negFixture();
  const m = post(st, ret(st, i.id, 2, 2));
  assert.deepEqual(m.layers, [{ layerId: 'DEBT:' + i.id, qty: 2, unitCostPaise: 5000 }]);
  assert.deepEqual(m.debt, { qty: 2, unitCostPaise: 5000 });
  assert.equal(m.valuePaise, 10000);
  const p = parts(st)['TEST-002'];
  assert.equal(p.qty, 0);
  assert.equal(p.valuePaise, 0);
  post(st, rev(st, m.id, 3, 'wrong return'));
  assert.equal(parts(st)['TEST-002'].qty, -2);
  const b = negFixture();
  post(b.st, rcv(b.st, 'TEST-002', 10, 6000, 2, 'G2', 1));
  expectFail(ret(b.st, b.i.id, 2, 3), 'RETURN_DEBT_SETTLED');
  const r5 = ret(b.st, b.i.id, 5, 3);
  expectFail(r5, 'RETURN_DEBT_SETTLED');
});

test('T56 receipt settles several debts oldest first', () => {
  const st = F.emptyState();
  const extra = { allowNegative: true, note: 'stock not entered yet', unitCostPaise: 700 };
  const d1 = post(st, iss(st, 'TEST-003', 2, 0, 'J-1', extra, O));
  const d2 = post(st, iss(st, 'TEST-003', 3, 1, 'J-2', extra, O));
  const r = post(st, rcv(st, 'TEST-003', 4, 900, 2));
  assert.deepEqual(r.settles, [
    { debtId: d1.id, qty: 2, debtUnitCostPaise: 700 },
    { debtId: d2.id, qty: 2, debtUnitCostPaise: 700 }]);
  assert.equal(r.trueUpPaise, 800);
  assert.equal(r.valuePaise, 2800);
  const p = parts(st)['TEST-003'];
  assert.deepEqual(p.debts.map((d) => d.qty), [0, 1]);
  assert.equal(p.layers[0].qtyLeft, 0);
  assert.equal(p.qty, -1);
  assert.equal(p.valuePaise, -700);
  checkInvariants(st, 'TEST-003', [d1, d2, r]);
});

// ---------- J. Roles ----------

test('T57 role table for every action', () => {
  const sessions = [
    ['owner+pin', { session: OWNER, reauth: true }],
    ['owner', { session: OWNER, reauth: false }],
    ['manager', { session: MANAGER, reauth: true }],
    ['staff', { session: STAFF, reauth: true }],
    ['broken', { session: BROKEN, reauth: true }],
    ['undefined', undefined],
    ['empty', { session: {}, reauth: true }],
    ['owner flag off', { session: { ...OWNER, isOwner: false }, reauth: true }],
    ['manager flag off', { session: { ...MANAGER, isManager: false }, reauth: true }]
  ];
  const SI = 'SESSION_INVALID';
  const table = {
    opening: ['ok', 'REAUTH_REQUIRED', 'ROLE_DENIED', 'ROLE_DENIED', SI, SI, SI, SI, SI],
    receipt: ['ok', 'ok', 'ok', 'ok', SI, SI, SI, SI, SI],
    issue_job: ['ok', 'ok', 'ok', 'ok', SI, SI, SI, SI, SI],
    return_job: ['ok', 'ok', 'ok', 'ok', SI, SI, SI, SI, SI],
    counter_sale: ['ok', 'ok', 'ok', 'ok', SI, SI, SI, SI, SI],
    adjust_up: ['ok', 'ok', 'ok', 'ROLE_DENIED', SI, SI, SI, SI, SI],
    adjust_down: ['ok', 'ok', 'ok', 'ROLE_DENIED', SI, SI, SI, SI, SI],
    reversal: ['ok', 'ok', 'ok', 'ROLE_DENIED', SI, SI, SI, SI, SI],
    negative_override: ['ok', 'REAUTH_REQUIRED', 'ROLE_DENIED', 'ROLE_DENIED', SI, SI, SI, SI, SI]
  };
  assert.deepEqual(Object.keys(table).sort(), Object.keys(F.ACTION_POLICY).sort());
  for (const action of Object.keys(table)) {
    sessions.forEach(([label, ctx], i) => {
      const r = F.authorize(ctx, action);
      const want = table[action][i];
      if (want === 'ok') assert.equal(r.ok, true, action + ' ' + label);
      else expectFail(r, want);
    });
  }
  assert.deepEqual(F.ACTION_POLICY.opening, { minTier: 'owner', reauth: true });
  assert.deepEqual(F.ACTION_POLICY.negative_override, { minTier: 'owner', reauth: true });
  assert.deepEqual(F.ACTION_POLICY.receipt, { minTier: 'staff', reauth: false });
  assert.deepEqual(F.ACTION_POLICY.adjust_down, { minTier: 'manager', reauth: false });
  assert.deepEqual(F.ACTION_POLICY.reversal, { minTier: 'manager', reauth: false });
  expectFail(F.authorize(O, 'no_such_action'), 'INPUT_INVALID');
  expectFail(F.authorize(O, 'toString'), 'INPUT_INVALID');
  // the plan functions use the same table
  const st = F.emptyState();
  for (const [label, ctx] of sessions) {
    const r = F.planReceipt(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0), ref: { grnNo: 'G', lineNo: 1 } }, ctx);
    assert.equal(r.ok, ['owner+pin', 'owner', 'manager', 'staff'].includes(label), label);
  }
});

test('T58 the role is read on every call and not remembered', () => {
  assert.equal(Object.isFrozen(F), true);
  const st = F.emptyState();
  const input = { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0) };
  expectFail(F.planOpening(st, input, { session: STAFF, reauth: true }), 'ROLE_DENIED');
  assert.equal(F.planOpening(st, input, O).ok, true);
  expectFail(F.planOpening(st, input, { session: STAFF, reauth: true }), 'ROLE_DENIED');
  assert.equal(F.planOpening(st, input, O).ok, true);
  const mutable = { ...OWNER };
  const ctx = { session: mutable, reauth: true };
  assert.equal(F.planOpening(st, input, ctx).ok, true);
  mutable.tier = 'staff';
  mutable.isOwner = false;
  expectFail(F.planOpening(st, input, ctx), 'ROLE_DENIED');
  ctx.reauth = false;
  mutable.tier = 'owner';
  mutable.isOwner = true;
  expectFail(F.planOpening(st, input, ctx), 'REAUTH_REQUIRED');
});

// ---------- K. Replay, validation, tamper ----------

test('T59 replay equals the incremental state', () => {
  const { st, mvs } = f1(6);
  const r = F.replay(clone(mvs));
  assert.equal(r.ok, true);
  assert.deepEqual(F.exportState(r.state), F.exportState(st));
  const v = F.validateLedger(clone(mvs));
  assert.equal(v.ok, true);
  assert.equal(v.count, 6);
  assert.equal(v.lastSeq, 6);
  assert.equal(v.lastAt, at(5));
  assert.deepEqual(F.validateLedger([]), { ok: true, count: 0, lastSeq: 0, lastAt: '' });
});

test('T60 tamper table', () => {
  const { mvs } = f1(6);
  const base = clone(mvs);
  const run = (mutate) => {
    const c = clone(base);
    const out = mutate(c);
    return F.replay(out || c);
  };
  let r = run((c) => { c[2].valuePaise += 1; });
  expectFail(r, 'LEDGER_MISMATCH');
  assert.equal(r.detail.seq, 3);
  r = run((c) => { c[2].layers.reverse(); });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => {
    c[2].layers = [{ layerId: L2, qty: 5, unitCostPaise: 12000 }, { layerId: L1, qty: 7, unitCostPaise: 10000 }];
    c[2].valuePaise = -(60000 + 70000);
  });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => { c.splice(1, 1); });
  expectFail(r, 'LEDGER_GAP');
  r = run((c) => { c[3].seq = 3; c[3].id = ID(3); });
  expectFail(r, 'LEDGER_GAP');
  r = run((c) => { c[3].at = at(1); });
  expectFail(r, 'LEDGER_ORDER');
  r = run((c) => { c[1].type = 'bogus'; });
  expectFail(r, 'LEDGER_BAD_RECORD');
  r = run((c) => { c[1].qty = 1.5; });
  expectFail(r, 'LEDGER_BAD_RECORD');
  r = run((c) => { delete c[1].docDate; });
  expectFail(r, 'LEDGER_BAD_RECORD');
  r = run((c) => { c[5].reverses = 'MV00000099'; });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => { c[0].qty = 11; });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => { c[0].unitCostPaise = 10001; });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => { c[2].override = { by: 'x', note: 'abc' }; });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => { c[5].approval = null; });
  expectFail(r, 'LEDGER_MISMATCH');
  r = run((c) => { c[3].returnsOf = ID(1); });
  expectFail(r, 'LEDGER_MISMATCH');
  expectFail(F.replay('x'), 'LEDGER_BAD_RECORD');
  expectFail(F.replay([null]), 'LEDGER_BAD_RECORD');
  // untouched copy still passes, and hash/prev are tolerated
  const ok = clone(base);
  ok.forEach((m, i) => { m.hash = 'h' + i; m.prev = i ? 'h' + (i - 1) : ''; });
  assert.equal(F.replay(ok).ok, true);
});

test('T61 replay cut-offs', () => {
  const { mvs } = f1(6);
  assert.equal(F.replay(mvs, { untilSeq: 3 }).state.lastSeq, 3);
  assert.equal(F.replay(mvs, { untilAt: at(2) }).state.lastSeq, 3);
  assert.equal(F.replay(mvs, { untilAt: at(2) }).state.lastAt, at(2));
  assert.equal(F.replay(mvs, { untilSeq: 0 }).state.lastSeq, 0);
  assert.equal(F.replay(mvs, { untilSeq: 99 }).state.lastSeq, 6);
  expectFail(F.replay(mvs, { untilAt: 'x' }), 'INPUT_INVALID');
});

test('T62 canonicalString', () => {
  const { mvs } = f1(3);
  const m = clone(mvs[2]);
  const reordered = {};
  Object.keys(m).reverse().forEach((k) => { reordered[k] = m[k]; });
  reordered.hash = 'abc';
  reordered.prev = 'def';
  assert.equal(F.canonicalString(m), F.canonicalString(reordered));
  assert.equal(F.canonicalString(m).includes('abc'), false);
  const changed = { ...m, note: 'x' };
  assert.notEqual(F.canonicalString(m), F.canonicalString(changed));
  assert.equal(JSON.parse(F.canonicalString(m)).id, m.id);
  assert.equal(F.canonicalString(null), '');
  assert.equal(F.canonicalString(m).startsWith('{"v":1,"seq":3,"id":"MV00000003"'), true);
});

test('T63 a planned movement is frozen and apply does not change it', () => {
  const st = F.emptyState();
  const r = rcv(st, 'TEST-001', 3, 100, 0);
  assert.equal(Object.isFrozen(r.movement), true);
  assert.equal(Object.isFrozen(r.movement.layers), true);
  assert.equal(Object.isFrozen(r.movement.ref), true);
  const text = JSON.stringify(r.movement);
  assert.equal(F.applyMovement(st, r.movement).ok, true);
  assert.equal(JSON.stringify(r.movement), text);
  const st2 = F.emptyState();
  const copy = clone(r.movement);
  copy.extra = 1;
  expectFail(F.applyMovement(st2, copy), 'LEDGER_BAD_RECORD');
  const withHash = { ...clone(r.movement), hash: 'a', prev: 'b' };
  assert.equal(F.applyMovement(st2, withHash).ok, true);
  const text2 = JSON.stringify(withHash);
  assert.equal(text2.includes('"hash":"a"'), true);
});

test('T64 a failed apply leaves the state unchanged', () => {
  const { st, mvs } = f1(3);
  const before = JSON.stringify(F.exportState(st));
  const next = rcv(st, 'TEST-001', 1, 100, 6, 'G9', 1).movement;
  const bad = clone(next);
  bad.valuePaise += 5;
  expectFail(F.applyMovement(st, bad), 'LEDGER_MISMATCH');
  assert.equal(JSON.stringify(F.exportState(st)), before);
  assert.equal(st.lastSeq, 3);
  const gap = clone(next);
  gap.seq = 9;
  gap.id = ID(9);
  expectFail(F.applyMovement(st, gap), 'LEDGER_GAP');
  const old = clone(next);
  old.at = at(0);
  expectFail(F.applyMovement(st, old), 'LEDGER_ORDER');
  assert.equal(JSON.stringify(F.exportState(st)), before);
  assert.equal(F.applyMovement(st, next).ok, true);
  assert.equal(mvs.length, 3);
});

// ---------- L. As-of ----------

test('T65 state as of a cut-off equals the state after that step', () => {
  const { mvs } = f1(6);
  for (const [cut, steps] of [[at(0), 1], [at(1), 2], [at(3), 4], [at(5), 6]]) {
    const r = F.stateAsOf(mvs, cut);
    assert.equal(r.ok, true);
    assert.deepEqual(F.exportState(r.state), F.exportState(f1(steps).st), cut);
  }
});

test('T66 date form of as-of uses India end of day', () => {
  const st = F.emptyState();
  const mvs = [];
  mvs.push(post(st, F.planReceipt(st, { partCode: 'TEST-001', qty: 1, unitCostPaise: 100, at: '2026-11-02T18:29:59.999Z', ref: { grnNo: 'G', lineNo: 1 } }, M)));
  mvs.push(post(st, F.planReceipt(st, { partCode: 'TEST-001', qty: 2, unitCostPaise: 100, at: '2026-11-02T19:00:00.000Z', ref: { grnNo: 'G', lineNo: 2 } }, M)));
  assert.equal(mvs[1].docDate, '2026-11-03');
  assert.equal(F.partBalance(F.stateAsOf(mvs, '2026-11-02').state, 'TEST-001').qty, 1);
  assert.equal(F.partBalance(F.stateAsOf(mvs, '2026-11-03').state, 'TEST-001').qty, 3);
  assert.equal(F.partBalance(F.stateAsOf(mvs, '2026-11-02T19:00:00.000Z').state, 'TEST-001').qty, 3);
  assert.equal(F.partBalance(F.stateAsOf(mvs, '2026-11-02T18:59:59.999Z').state, 'TEST-001').qty, 1);
});

test('T67 as-of edge cases', () => {
  const { mvs } = f1(2);
  const r = F.stateAsOf(mvs, '2026-01-01');
  assert.equal(r.ok, true);
  assert.deepEqual(F.balances(r.state), []);
  assert.deepEqual(F.stockValue(r.state), { qty: 0, valuePaise: 0, parts: 0 });
  for (const bad of ['2026-13-01', '', 5, null, undefined, '2026-02-30']) {
    expectFail(F.stateAsOf(mvs, bad), 'ASOF_INVALID');
  }
});

// ---------- M. Reports ----------

test('T68 balances', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-002', 3, 100, 0, 'G1', 1));
  post(st, rcv(st, 'TEST-001', 5, 200, 1, 'G1', 2));
  post(st, rcv(st, 'TEST-003', 2, 300, 2, 'G1', 3));
  post(st, iss(st, 'TEST-003', 2, 3));
  let rows = F.balances(st);
  assert.deepEqual(rows.map((r) => r.partCode), ['TEST-001', 'TEST-002']);
  assert.deepEqual(rows[0], { partCode: 'TEST-001', qty: 5, valuePaise: 1000, avgCostPaise: 200, openLayers: 1,
    oldestOpenLayerId: ID(2), lastCostPaise: 200, negative: false });
  rows = F.balances(st, { includeZero: true });
  assert.deepEqual(rows.map((r) => r.partCode), ['TEST-001', 'TEST-002', 'TEST-003']);
  assert.equal(rows[2].qty, 0);
  assert.equal(rows[2].avgCostPaise, null);
  assert.equal(rows[2].openLayers, 0);
  assert.equal(rows[2].oldestOpenLayerId, null);
  assert.equal(rows[2].lastCostPaise, 300);
  assert.deepEqual(F.stockValue(st), { qty: 8, valuePaise: 1300, parts: 2 });
  const none = F.partBalance(st, 'NOPE-1');
  assert.equal(none.qty, 0);
  assert.equal(none.valuePaise, 0);
  assert.equal(none.negative, false);
  assert.notEqual(none, null);
  assert.deepEqual(F.balances(null), []);
});

test('T69 ledger for a part', () => {
  const { st, mvs } = f1(6);
  const r = F.ledgerForPart(mvs, 'test-001');
  assert.equal(r.ok, true);
  assert.deepEqual(r.opening, { qty: 0, valuePaise: 0 });
  assert.equal(r.rows.length, 6);
  r.rows.forEach((row, i) => {
    const b = F.partBalance(f1(i + 1).st, 'TEST-001');
    assert.equal(row.balanceQty, b.qty, 'row ' + i);
    assert.equal(row.balanceValuePaise, b.valuePaise, 'row ' + i);
  });
  assert.equal(r.rows[4].reversedBy, ID(6));
  assert.equal(r.rows[5].reverses, ID(5));
  assert.equal(r.rows[0].reversedBy, null);
  const cut = F.ledgerForPart(mvs, 'TEST-001', { fromAt: at(3) });
  const before = F.partBalance(f1(3).st, 'TEST-001');
  assert.deepEqual(cut.opening, { qty: before.qty, valuePaise: before.valuePaise });
  assert.equal(cut.rows.length, 3);
  assert.equal(cut.rows[0].balanceQty, 7);
  const win = F.ledgerForPart(mvs, 'TEST-001', { fromAt: at(1), toAt: at(2) });
  assert.deepEqual(win.rows.map((x) => x.seq), [2, 3]);
  assert.deepEqual(F.ledgerForPart(mvs, 'TEST-009').rows, []);
  expectFail(F.ledgerForPart(mvs, 'bad code'), 'PART_CODE_INVALID');
  expectFail(F.ledgerForPart(mvs, 'TEST-001', { fromAt: 'x' }), 'ASOF_INVALID');
  expectFail(F.ledgerForPart('x', 'TEST-001'), 'LEDGER_BAD_RECORD');
  assert.equal(st.lastSeq, 6);
});

test('T70 reorder list', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-001', 4, 100, 0));
  const levels = { 'TEST-001': { level: 5, reorderQty: 10 }, 'TEST-009': { level: 3, reorderQty: 6 },
    BAD: { level: -1, reorderQty: 2 }, 'bad code': { level: 1, reorderQty: 1 }, 'TEST-005': { level: 1.5, reorderQty: 1 },
    'TEST-006': 5 };
  let rows = F.reorderList(st, levels);
  assert.deepEqual(rows, [
    { partCode: 'TEST-009', qty: 0, level: 3, reorderQty: 6, shortBy: 3 },
    { partCode: 'TEST-001', qty: 4, level: 5, reorderQty: 10, shortBy: 1 }]);
  post(st, rcv(st, 'TEST-001', 1, 100, 1, 'G1', 2));
  rows = F.reorderList(st, levels);
  assert.deepEqual(rows.map((r) => [r.partCode, r.shortBy]), [['TEST-009', 3], ['TEST-001', 0]]);
  post(st, rcv(st, 'TEST-001', 1, 100, 2, 'G1', 3));
  rows = F.reorderList(st, levels);
  assert.deepEqual(rows.map((r) => r.partCode), ['TEST-009']);
  assert.deepEqual(F.reorderList(st, null), []);
});

test('T71 previews do not change the state', () => {
  const before = f1(2);
  const snapshot = JSON.stringify(F.exportState(before.st));
  const p = F.previewIssue(before.st, 'TEST-001', 12);
  const after = f1(3);
  assert.equal(p.ok, true);
  assert.deepEqual(p.layers, after.mvs[2].layers);
  assert.equal(p.valuePaise, 124000);
  assert.equal(p.shortfallQty, 0);
  assert.equal(JSON.stringify(F.exportState(before.st)), snapshot);
  const big = F.previewIssue(before.st, 'TEST-001', 20);
  assert.equal(big.shortfallQty, 5);
  assert.equal(big.valuePaise, 160000);
  assert.equal(F.previewExcessCostPaise(before.st, 'TEST-001'), 12000);
  assert.equal(F.previewExcessCostPaise(before.st, 'TEST-099'), null);
  expectFail(F.previewIssue(before.st, 'bad code', 1), 'PART_CODE_INVALID');
  expectFail(F.previewIssue(before.st, 'TEST-001', 0), 'QTY_INVALID');
});

// ---------- N. Property and invariants ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRun(seed, ops, nParts, onAccepted) {
  const rnd = mulberry32(seed);
  const pick = (n) => Math.floor(rnd() * n);
  const codes = [];
  for (let i = 1; i <= nParts; i++) codes.push('TP-' + String(i).padStart(3, '0'));
  const st = F.emptyState();
  const all = [];
  const byPart = {};
  const issues = [];
  let t = 0;
  let grn = 0;
  let accepted = 0;
  let rejected = 0;
  const sessions = [O, M, S, O0, { session: BROKEN }];
  for (let n = 0; n < ops; n++) {
    t += pick(3);
    const code = codes[pick(codes.length)];
    const roll = rnd();
    let r;
    const ctx = rnd() < 0.85 ? (roll < 0.04 ? O : (roll < 0.12 ? O : M)) : sessions[pick(sessions.length)];
    if (roll < 0.04) {
      r = F.planOpening(st, { partCode: code, qty: 1 + pick(20), unitCostPaise: 100 * (1 + pick(50)), at: at(t) }, ctx);
    } else if (roll < 0.30) {
      grn += rnd() < 0.05 ? 0 : 1;
      r = F.planReceipt(st, { partCode: code, qty: 1 + pick(15), unitCostPaise: pick(5) === 0 ? 0 : 100 * (1 + pick(60)) + pick(99), at: at(t), ref: { grnNo: 'G' + grn, lineNo: 1 } }, ctx);
    } else if (roll < 0.48) {
      r = F.planIssueToJob(st, { partCode: code, qty: 1 + pick(8), at: at(t), ref: { jobId: 'J-' + (1 + pick(5)) } }, ctx);
    } else if (roll < 0.53) {
      r = F.planIssueToJob(st, { partCode: code, qty: 1 + pick(12), at: at(t), ref: { jobId: 'J-' + (1 + pick(5)) },
        allowNegative: true, note: 'override ' + n, unitCostPaise: 100 * (1 + pick(9)) }, rnd() < 0.8 ? O : ctx);
      if (r.ok === false && r.code === 'INPUT_INVALID') {
        r = F.planIssueToJob(st, { partCode: code, qty: 1 + pick(12), at: at(t), ref: { jobId: 'J-1' }, allowNegative: true, note: 'override ' + n }, O);
      }
    } else if (roll < 0.62) {
      const cand = issues.length ? issues[pick(issues.length)] : null;
      r = cand ? F.planReturnFromJob(st, { issueId: cand.id, qty: 1 + pick(cand.q), at: at(t), ref: { jobId: cand.job } }, ctx)
        : F.planReturnFromJob(st, { issueId: 'MV99999999', qty: 1, at: at(t), ref: { jobId: 'J-1' } }, ctx);
    } else if (roll < 0.70) {
      r = F.planCounterSale(st, { partCode: code, qty: 1 + pick(5), at: at(t), ref: { saleRef: 'S-' + n } }, ctx);
    } else if (roll < 0.75) {
      r = F.planAdjustment(st, { direction: 'up', partCode: code, qty: 1 + pick(4), reason: 'found', at: at(t), unitCostPaise: 100 * (1 + pick(9)) }, ctx);
    } else if (roll < 0.80) {
      r = F.planAdjustment(st, { direction: 'down', partCode: code, qty: 1 + pick(4), reason: 'lost', at: at(t) }, ctx);
    } else if (roll < 0.92) {
      const id = all.length ? all[pick(all.length)].id : 'MV99999999';
      r = F.planReversal(st, { reverses: id, at: at(t), note: 'random reversal' }, ctx);
    } else {
      // deliberately bad requests
      const bad = pick(4);
      if (bad === 0) r = F.planReceipt(st, { partCode: code, qty: 0, unitCostPaise: 5, at: at(t), ref: { grnNo: 'Z', lineNo: 1 } }, M);
      else if (bad === 1) r = F.planIssueToJob(st, { partCode: code, qty: 1, at: at(t) }, M);
      else if (bad === 2) r = F.planReceipt(st, { partCode: code, qty: 1, unitCostPaise: 5, at: at(-5), ref: { grnNo: 'Z', lineNo: 1 } }, M);
      else r = F.planAdjustment(st, { direction: 'up', partCode: code, qty: 1, reason: 'lost', at: at(t) }, M);
    }
    const before = JSON.stringify(F.exportState(st));
    if (r.ok) {
      const a = F.applyMovement(st, r.movement);
      assert.equal(a.ok, true, 'op ' + n + ' ' + JSON.stringify(a) + JSON.stringify(r.movement));
      all.push(r.movement);
      (byPart[r.movement.partCode] = byPart[r.movement.partCode] || []).push(r.movement);
      if (r.movement.type === 'issue_job') issues.push({ id: r.movement.id, q: -r.movement.qty, job: r.movement.ref.jobId });
      checkInvariants(st, r.movement.partCode, byPart[r.movement.partCode]);
      accepted++;
      if (onAccepted) onAccepted(r.movement);
    } else {
      assert.equal(JSON.stringify(F.exportState(st)), before, 'state changed by a rejected op ' + n);
      rejected++;
    }
  }
  return { st, all, byPart, accepted, rejected };
}

test('T72 seeded random run keeps every invariant', () => {
  const run = randomRun(20261113, 2000, 20);
  assert.ok(run.accepted > 600, 'accepted ' + run.accepted);
  assert.ok(run.rejected > 100, 'rejected ' + run.rejected);
  const types = new Set(run.all.map((m) => m.type));
  for (const ty of F.MOVEMENT_TYPES) assert.ok(types.has(ty), 'type not exercised ' + ty);
  assert.ok(run.all.some((m) => m.debt), 'no override debt exercised');
  assert.ok(run.all.some((m) => m.settles.length), 'no debt settlement exercised');
  for (const code of Object.keys(run.byPart)) checkInvariants(run.st, code, run.byPart[code]);
  const stored = clone(run.all);
  const rp = F.replay(stored);
  assert.equal(rp.ok, true, JSON.stringify(rp));
  assert.deepEqual(F.exportState(rp.state), F.exportState(run.st));
  assert.equal(F.validateLedger(stored).ok, true);
  // every second state: as-of replay equals a prefix replay
  const mid = run.all[Math.floor(run.all.length / 2)];
  const prefix = F.replay(stored.filter((m) => m.seq <= mid.seq));
  const asOf = F.stateAsOf(stored, mid.at);
  assert.ok(asOf.state.lastSeq >= mid.seq);
  assert.equal(prefix.ok, true);
});

test('T73 all numbers are safe integers and never negative zero', () => {
  const run = randomRun(77, 1200, 8);
  const st = F.emptyState();
  const extras = [];
  extras.push(post(st, rcv(st, 'ZERO-1', 3, 0, 0)));
  extras.push(post(st, iss(st, 'ZERO-1', 2, 1)));
  extras.push(post(st, rev(st, extras[1].id, 2, 'undo it')));
  extras.push(post(st, csl(st, 'ZERO-1', 3, 3)));
  extras.push(post(st, rev(st, extras[3].id, 4, 'undo it')));
  for (const m of run.all.concat(extras)) {
    eachNumber(m, (x) => {
      assert.ok(Number.isSafeInteger(x), m.id + ' ' + x);
      assert.equal(Object.is(x, -0), false, m.id);
    });
  }
  eachNumber(F.exportState(run.st), (x) => {
    assert.ok(Number.isSafeInteger(x));
    assert.equal(Object.is(x, -0), false);
  });
  eachNumber(F.exportState(st), (x) => assert.equal(Object.is(x, -0), false));
});

// ---------- O. Performance ----------

test('T74 twenty thousand movements', () => {
  const rnd = mulberry32(4242);
  const st = F.emptyState();
  const mvs = [];
  const nParts = 200;
  let grn = 0;
  let worstOne = 0;
  for (let i = 0; i < 20000; i++) {
    const code = 'PF-' + String(Math.floor(rnd() * nParts)).padStart(3, '0');
    const p = st.parts[code];
    const stock = p ? p.qty : 0;
    const t0 = process.hrtime.bigint();
    let r;
    if (stock >= 3 && rnd() < 0.55) {
      r = rnd() < 0.8
        ? F.planIssueToJob(st, { partCode: code, qty: 1 + Math.floor(rnd() * 3), at: at(i), ref: { jobId: 'J-' + (i % 50) } }, M)
        : F.planCounterSale(st, { partCode: code, qty: 1, at: at(i), ref: { saleRef: 'S' + i } }, M);
    } else {
      grn++;
      r = F.planReceipt(st, { partCode: code, qty: 2 + Math.floor(rnd() * 6), unitCostPaise: 1000 + Math.floor(rnd() * 500), at: at(i), ref: { grnNo: 'G' + grn, lineNo: 1 } }, M);
    }
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(F.applyMovement(st, r.movement).ok, true);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > worstOne) worstOne = ms;
    mvs.push(r.movement);
  }
  const stored = clone(mvs);
  const time = (fn) => {
    const t0 = process.hrtime.bigint();
    const out = fn();
    return { out, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
  };
  const rp = time(() => F.replay(stored));
  assert.equal(rp.out.ok, true);
  const bal = time(() => F.balances(rp.out.state));
  const busiest = Object.keys(rp.out.state.parts).sort((a, b) => rp.out.state.parts[b].layers.length - rp.out.state.parts[a].layers.length)[0];
  const led = time(() => F.ledgerForPart(stored, busiest));
  const asOf = time(() => F.stateAsOf(stored, stored[10000].at));
  const clo = time(() => F.cloneState(rp.out.state));
  console.log('T74 timings ms: replay ' + rp.ms.toFixed(0) + ', balances ' + bal.ms.toFixed(1) + ', ledgerForPart ' +
    led.ms.toFixed(1) + ', stateAsOf ' + asOf.ms.toFixed(0) + ', cloneState ' + clo.ms.toFixed(1) +
    ', worst plan+apply ' + worstOne.toFixed(1));
  assert.ok(rp.ms < 1500, 'replay ' + rp.ms);
  assert.ok(bal.ms < 100, 'balances ' + bal.ms);
  assert.ok(led.ms < 100, 'ledger ' + led.ms);
  assert.ok(asOf.ms < 1500, 'asOf ' + asOf.ms);
  assert.ok(worstOne < 50, 'plan+apply ' + worstOne);
  assert.deepEqual(F.exportState(rp.out.state), F.exportState(st));
});

test('T75 worst layer case: 5000 one piece layers', () => {
  const st = F.emptyState();
  for (let i = 0; i < 5000; i++) post(st, rcv(st, 'WORST-1', 1, 100 + (i % 7), i, 'G' + i, 1));
  const t0 = process.hrtime.bigint();
  const issue = post(st, iss(st, 'WORST-1', 5000, 6000, 'J-W'));
  const t1 = process.hrtime.bigint();
  const back = post(st, ret(st, issue.id, 5000, 6001, 'J-W'));
  const t2 = process.hrtime.bigint();
  const a = Number(t1 - t0) / 1e6;
  const b = Number(t2 - t1) / 1e6;
  console.log('T75 timings ms: issue 5000 ' + a.toFixed(0) + ', return 5000 ' + b.toFixed(0));
  assert.equal(issue.layers.length, 5000);
  assert.equal(back.layers.length, 5000);
  assert.equal(back.valuePaise, -issue.valuePaise);
  assert.ok(a < 500, 'issue ' + a);
  assert.ok(b < 500, 'return ' + b);
  assert.equal(F.partBalance(st, 'WORST-1').qty, 5000);
  assert.equal(F.layersForPart(st, 'WORST-1', { onlyOpen: true }).length, 5000);
});

// ---------- P. Source hygiene and fuzz ----------

const WRAPPER = [
  '(function (root, factory) {',
  '  var api = factory();',
  "  if (typeof module === 'object' && module.exports) module.exports = api;",
  '  if (root) root.SaagarServiceStoresFifo = api;',
  "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {",
  "  'use strict';"
].join('\n');

test('T76 source hygiene and exported surface', () => {
  const src = fs.readFileSync(SRC_URL, 'utf8');
  assert.equal(src.startsWith(WRAPPER + '\n'), true);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.charCodeAt(0) === 0xFEFF, false);
  assert.equal(src.endsWith('});\n') && !src.endsWith('\n\n'), true);
  assert.equal(src.includes('return Object.freeze({'), true);
  const banned = [
    [/=>/, 'arrow'], [/\bconst\b/, 'const'], [/\blet\b/, 'let'], [/`/, 'template'], [/\bclass\b/, 'class'],
    [/\.\.\./, 'spread'], [/\basync\b/, 'async'], [/\bawait\b/, 'await'], [/Date\.now\(/, 'Date.now'],
    [/new Date\(\s*\)/, 'new Date()'], [/Math\.random/, 'random'], [/localStorage/, 'localStorage'],
    [/sessionStorage/, 'sessionStorage'], [/indexedDB/, 'indexedDB'], [/\bwindow\b/, 'window'],
    [/\bdocument\b/, 'document'], [/\bfetch\b/, 'fetch'], [/XMLHttpRequest/, 'xhr'], [/\beval\(/, 'eval'],
    [/\bFunction\(/, 'Function('], [/new Function/, 'new Function'], [/postMessage/, 'postMessage'],
    [/setTimeout|setInterval/, 'timer'], [/\brequire\(/, 'require('], [/\bimport\(/, 'import('],
    [/saagar_svcs_/, 'storage prefix literal'], [/setItem\(/, 'setItem'], [/https?:\/\//, 'url'],
    [/\bST_/, 'ST_ token'], [/WebSocket|sendBeacon/, 'network'], [/CODE_PATTERN/, 'CODE_PATTERN'],
    [/\.(flat|fill|at|includes|find|findIndex|padStart|padEnd|replaceAll|startsWith|endsWith)\(/, 'polyfill-only method'],
    [/Object\.(assign|entries|values|fromEntries)\(/, 'ES2015+ Object method'], [/Number\.(isInteger|isSafeInteger)\(/, 'Number helper'],
    [/structuredClone/, 'structuredClone'], [/\bnew (Map|Set|WeakMap|Promise)\b/, 'ES2015 collection']
  ];
  for (const [re, label] of banned) assert.equal(re.test(src), false, 'banned: ' + label);
  assert.equal(/custName|custMobile|custAddr/.test(src), false);
  const names = ['VERSION', 'MOVEMENT_TYPES', 'ACTION_POLICY', 'REASONS_UP', 'REASONS_DOWN', 'CODES', 'MESSAGES',
    'normalizePartCode', 'isIsoInstant', 'istDate', 'istDayEndInstant', 'ledgerKeyForAt', 'unitCostFromTotal',
    'avgCostPaise', 'emptyState', 'cloneState', 'authorize', 'planOpening', 'planReceipt', 'planIssueToJob',
    'planReturnFromJob', 'planCounterSale', 'planAdjustment', 'planReversal', 'previewIssue',
    'previewExcessCostPaise', 'applyMovement', 'replay', 'validateLedger', 'stateAsOf', 'balances', 'partBalance',
    'stockValue', 'layersForPart', 'ledgerForPart', 'reorderList', 'jobUsage', 'exportState', 'canonicalString'];
  const kinds = { VERSION: 'string', MOVEMENT_TYPES: 'array', REASONS_UP: 'array', REASONS_DOWN: 'array',
    ACTION_POLICY: 'object', CODES: 'object', MESSAGES: 'object' };
  for (const n of names) {
    const want = kinds[n] || 'function';
    const v = F[n];
    const got = Array.isArray(v) ? 'array' : typeof v;
    assert.equal(got, want, n);
  }
  assert.deepEqual(Object.keys(F).sort(), names.slice().sort());
  assert.equal(Object.isFrozen(F), true);
  assert.equal(globalThis.SaagarServiceStoresFifo, F);
  assert.equal(Object.isFrozen(F.CODES), true);
  assert.equal(Object.isFrozen(F.MESSAGES), true);
  assert.equal(Object.isFrozen(F.ACTION_POLICY), true);
  assert.deepEqual(Object.keys(F.CODES).sort(), Object.keys(F.MESSAGES).sort());
  for (const k of Object.keys(F.CODES)) {
    assert.equal(F.CODES[k], k);
    assert.ok(/^[A-Z][A-Za-z0-9 ,.()'-]+$/.test(F.MESSAGES[k]), k);
  }
  assert.equal(Object.keys(F.CODES).length, 41);
  assert.equal(F.VERSION, 'SVCS_FIFO_V1');
});

test('T77 every failure has a code and an English message; nothing throws on junk', () => {
  const junk = [undefined, null, 'x', [], {}, 5, NaN, true, () => 1, { session: 5 }, { __proto__: null }];
  const names = Object.keys(F).filter((k) => typeof F[k] === 'function');
  let failures = 0;
  const check = (name, res) => {
    if (res && typeof res === 'object' && !Array.isArray(res) && res.ok === false) {
      failures++;
      assert.ok(Object.prototype.hasOwnProperty.call(F.CODES, res.code), name + ' ' + res.code);
      assert.ok(typeof res.message === 'string' && res.message.length > 0, name);
      assert.notEqual(res.code, 'INTERNAL_ERROR', name + ' internal error ' + JSON.stringify(res));
    }
  };
  for (const name of names) {
    for (let pos = 0; pos < 3; pos++) {
      for (const j of junk) {
        const args = [F.emptyState(), { partCode: 'TEST-001', qty: 1, unitCostPaise: 1, at: at(0), ref: { grnNo: 'G', lineNo: 1 } }, O];
        args[pos] = j;
        let res;
        assert.doesNotThrow(() => { res = F[name](...args); }, name + ' arg ' + pos);
        check(name, res);
      }
    }
    let res;
    assert.doesNotThrow(() => { res = F[name](); }, name + ' no args');
    check(name, res);
  }
  assert.ok(failures > 100, 'only ' + failures + ' failures seen');
  // a state with damaged internals must not throw either
  const broken = F.emptyState();
  broken.parts.X = 5;
  for (const name of ['planReceipt', 'planIssueToJob', 'planCounterSale', 'planReversal', 'applyMovement']) {
    assert.doesNotThrow(() => F[name](broken, { partCode: 'X', qty: 1, at: at(0), ref: { jobId: 'J', saleRef: 'S' }, reverses: 'MV1', note: 'abc' }, O));
  }
});

// ---------- Q. Clone tests (added by plan C-FIFO-1) ----------

test('C1 cloneState is a deep and independent copy', () => {
  const { st } = f1(4);
  const c = F.cloneState(st);
  assert.notEqual(c, st);
  assert.deepEqual(F.exportState(c), F.exportState(st));
  assert.deepEqual(c.byId, st.byId);
  assert.notEqual(c.parts['TEST-001'], st.parts['TEST-001']);
  assert.notEqual(c.parts['TEST-001'].layers, st.parts['TEST-001'].layers);
  assert.notEqual(c.parts['TEST-001'].layers[0], st.parts['TEST-001'].layers[0]);
  assert.notEqual(c.issues, st.issues);
  assert.notEqual(c.issues[ID(3)], st.issues[ID(3)]);
  const before = JSON.stringify(F.exportState(st));
  post(c, iss(c, 'TEST-001', 3, 5, 'J-9'));
  post(c, rcv(c, 'TEST-002', 5, 100, 6, 'G7', 1));
  post(c, ret(c, ID(3), 4, 7));
  assert.equal(JSON.stringify(F.exportState(st)), before);
  assert.equal(st.lastSeq, 4);
  assert.equal(c.lastSeq, 7);
  // damage to the original afterwards does not reach the clone
  const c2 = F.cloneState(st);
  const snap = JSON.stringify(F.exportState(c2));
  post(st, iss(st, 'TEST-001', 2, 5, 'J-8'));
  st.parts['TEST-001'].layers[1].qtyLeft = 999;
  st.issues[ID(3)].total = 77;
  st.refKeys.zzz = 'x';
  assert.equal(JSON.stringify(F.exportState(c2)), snap);
  assert.equal(c2.issues[ID(3)].total, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(c2.refKeys, 'zzz'), false);
});

test('C2 the clone keeps return limits and reversal bookkeeping', () => {
  const { st } = f1(4);
  const c = F.cloneState(st);
  post(c, ret(c, ID(3), 8, 5));
  expectFail(ret(c, ID(3), 1, 6), 'RETURN_EXCEEDS_ISSUE', { outstanding: 0 });
  expectFail(ret(st, ID(3), 9, 5), 'RETURN_EXCEEDS_ISSUE', { outstanding: 8 });
  assert.equal(ret(st, ID(3), 8, 5).ok, true);
  const c3 = F.cloneState(st);
  post(c3, rev(c3, ID(4), 5, 'wrong return'));
  expectFail(rev(c3, ID(4), 6, 'wrong return'), 'ALREADY_REVERSED');
  assert.equal(rev(st, ID(4), 5, 'wrong return').ok, true);
  const { st: s6 } = f1(6);
  const c6 = F.cloneState(s6);
  expectFail(rev(c6, ID(5), 7, 'again'), 'ALREADY_REVERSED');
  const cr = F.cloneState(f1(2).st);
  expectFail(rcv(cr, 'TEST-001', 1, 1, 9, 'G1', 1), 'DUPLICATE_REF');
});

test('C3 replay equals a build made through clones', () => {
  const live = F.emptyState();
  let current = live;
  const mvs = [];
  const plans = [
    (s) => rcv(s, 'TEST-001', 10, 10000, 0, 'G1', 1),
    (s) => rcv(s, 'TEST-001', 5, 12000, 1, 'G1', 2),
    (s) => iss(s, 'TEST-001', 12, 2, 'J-1'),
    (s) => ret(s, ID(3), 4, 3),
    (s) => iss(s, 'TEST-001', 3, 4, 'J-2'),
    (s) => rev(s, ID(5), 5, 'wrong job')
  ];
  for (const plan of plans) {
    const next = F.cloneState(current);
    const m = post(next, plan(next));
    mvs.push(m);
    current = next;
  }
  const r = F.replay(clone(mvs));
  assert.deepEqual(F.exportState(r.state), F.exportState(current));
  assert.deepEqual(F.exportState(current), F.exportState(f1(6).st));
  assert.equal(live.lastSeq, 0);
});

test('C4 a multi-line document planned on a clone leaves the live state alone when a line fails', () => {
  const { st } = f1(2);
  const before = JSON.stringify(F.exportState(st));
  const work = F.cloneState(st);
  const lines = [{ code: 'TEST-001', qty: 6 }, { code: 'TEST-001', qty: 6 }, { code: 'TEST-001', qty: 6 }];
  const movements = [];
  let failed = null;
  lines.forEach((ln, i) => {
    if (failed) return;
    const r = F.planIssueToJob(work, { partCode: ln.code, qty: ln.qty, at: at(5), ref: { jobId: 'J-1', grnNo: 'ISS/26-27/0001', lineNo: i + 1 } }, M);
    if (!r.ok) { failed = r; return; }
    assert.equal(F.applyMovement(work, r.movement).ok, true);
    movements.push(r.movement);
  });
  expectFail(failed, 'INSUFFICIENT_STOCK', { available: 3, requested: 6 });
  assert.equal(movements.length, 2);
  assert.deepEqual(movements.map((m) => m.seq), [3, 4]);
  assert.deepEqual(movements.map((m) => m.at), [at(5), at(5)]);
  assert.deepEqual(movements.map((m) => m.ref.lineNo), [1, 2]);
  assert.equal(JSON.stringify(F.exportState(st)), before);
  // success path: the clone replaces the live state and equals a replay of both
  const ok = F.cloneState(st);
  const done = [];
  [6, 6].forEach((q, i) => {
    done.push(post(ok, F.planIssueToJob(ok, { partCode: 'TEST-001', qty: q, at: at(5), ref: { jobId: 'J-1', grnNo: 'ISS/26-27/0001', lineNo: i + 1 } }, M)));
  });
  assert.equal(ok.lastSeq, 4);
  assert.deepEqual(F.exportState(F.replay(clone(f1(2).mvs.concat(done))).state), F.exportState(ok));
});

test('C5 cloneState on bad input', () => {
  for (const bad of [undefined, null, 'x', [], {}, 5]) assert.equal(F.cloneState(bad), null);
});

test('C6 ledgerKeyForAt agrees with the store shardKey', (t) => {
  let store = null;
  try {
    store = require('../www/service-stores-store.js');
  } catch (e) {
    store = null;
  }
  if (!store || typeof store.shardKey !== 'function') {
    t.skip('store file not present or has no shardKey');
    return;
  }
  for (const a of ['2026-11-30T19:00:00.000Z', '2026-03-31T18:29:59.999Z', '2026-04-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) {
    assert.equal(F.ledgerKeyForAt(a), store.shardKey('ledger', a), a);
  }
});

// ---------- audit additions: hostile caller objects (each field is read once) ----------

test('H1 a getter on allowNegative cannot give Staff an Owner override', () => {
  const { st } = f1(2);
  let n = 0;
  const input = { partCode: 'TEST-001', qty: 50, at: at(9), ref: { jobId: 'J-1' }, note: 'xxxx' };
  Object.defineProperty(input, 'allowNegative', { enumerable: true, get() { n += 1; return n !== 1; } });
  const r = F.planIssueToJob(st, input, S);
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.ok(r.code === 'INSUFFICIENT_STOCK' || r.code === 'ROLE_DENIED', r.code);
  let m = 0;
  const flip = { partCode: 'TEST-001', qty: 50, at: at(9), ref: { jobId: 'J-1' }, note: 'xxxx' };
  Object.defineProperty(flip, 'allowNegative', { enumerable: true, get() { m += 1; return m === 1; } });
  expectFail(F.planIssueToJob(st, flip, S), 'ROLE_DENIED');
});

test('H2 a getter on at cannot slip under the last entry time', () => {
  const { st } = f1(2);
  let n = 0;
  const input = { partCode: 'TEST-001', qty: 1, ref: { jobId: 'J-1' } };
  Object.defineProperty(input, 'at', { enumerable: true, get() { n += 1; return n <= 3 ? at(20) : at(-100); } });
  const r = F.planIssueToJob(st, input, M);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.movement.at, at(20));
  assert.equal(n, 1);
});

test('H3 inherited and __proto__ keys are not read as input', () => {
  const { st } = f1(2);
  const inherited = Object.create({ at: at(9) });
  Object.assign(inherited, { partCode: 'TEST-001', qty: 1, ref: { jobId: 'J-1' } });
  expectFail(F.planIssueToJob(st, inherited, M), 'AT_INVALID');
  const parsed = JSON.parse('{"__proto__":{"allowNegative":true},"partCode":"TEST-001","qty":1,"at":"' + at(9) + '","ref":{"jobId":"J-1"}}');
  expectFail(F.planIssueToJob(st, parsed, M), 'INPUT_INVALID');
  const adjParsed = JSON.parse('{"__proto__":{"x":1},"direction":"down","partCode":"TEST-001","qty":1,"reason":"lost","at":"' + at(9) + '"}');
  expectFail(F.planAdjustment(st, adjParsed, M), 'INPUT_INVALID');
});

test('H4 a getter session cannot pass one tier check and act as another', () => {
  const { st } = f1(2);
  let n = 0;
  const session = { ok: true, isOwner: true, isManager: true, role: 'x', actorName: 'a' };
  Object.defineProperty(session, 'tier', { enumerable: true, get() { n += 1; return n === 1 ? 'staff' : 'owner'; } });
  const r = F.planOpening(st, { partCode: 'TEST-003', qty: 1, unitCostPaise: 1, at: at(9) }, { session, reauth: true });
  expectFail(r, 'ROLE_DENIED');
});

test('H5 applyMovement reads a record once: a getter cannot pass the checks and commit other numbers', () => {
  const { st } = f1(2);
  const planned = iss(st, 'TEST-001', 2, 9);
  assert.equal(planned.ok, true);
  const rec = clone(planned.movement);
  let n = 0;
  const real = rec.qty;
  delete rec.qty;
  Object.defineProperty(rec, 'qty', { enumerable: true, get() { n += 1; return n === 1 ? real : -15; } });
  const keysOrder = Object.keys(planned.movement);
  const ordered = {};
  for (const k of keysOrder) Object.defineProperty(ordered, k, Object.getOwnPropertyDescriptor(rec, k));
  const r = F.applyMovement(st, ordered);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(n, 1);
  assert.equal(parts(st)['TEST-001'].qty, 13);
});

test('H6 replay refuses a record whose override or approval was added or removed', () => {
  const st = F.emptyState();
  post(st, rcv(st, 'TEST-002', 3, 5000, 0, 'G9', 1));
  const before = F.cloneState(st);
  const over = post(st, iss(st, 'TEST-002', 5, 1, 'J-1', { allowNegative: true, note: 'urgent job' }, O));
  assert.notEqual(over.override, null);
  const stripped = clone(over);
  stripped.override = null;
  expectFail(F.applyMovement(F.cloneState(before), stripped), 'LEDGER_MISMATCH');
  const noApproval = clone(over);
  noApproval.approval = null;
  expectFail(F.applyMovement(F.cloneState(before), noApproval), 'LEDGER_MISMATCH');
  const plain = iss(before, 'TEST-002', 1, 1).movement;
  const added = clone(plain);
  added.override = { by: 'Test Staff', note: 'xxxx' };
  added.approval = { by: 'Test Staff', role: 'Cashier' };
  expectFail(F.applyMovement(F.cloneState(before), added), 'LEDGER_MISMATCH');
  assert.equal(F.applyMovement(F.cloneState(before), clone(plain)).ok, true);
});
