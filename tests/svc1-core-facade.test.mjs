// tests/svc1-core-facade.test.mjs
// Service Stores core facade (www/service-stores-core.js), tested against the REAL store, FIFO and masters files.
// The documents layer is replaced by a recording stand-in; documents are posted with the kit in tests/lib/svc1-core-kit.mjs.
// Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreLib, Store, Masters, OWNER, MANAGER, STAFF, BROKEN, makeEnv, makeFakeDocsLib, makeAdapter, makeClock,
  buildStandard, standardParts, kitOldRegister, kitOldMove, kitScrapSignoff, kitIssue, kitReceipt, kitOpening, kitPropose,
  kitCounter, kitAdjust, kitDecide, kitReverse, kitReturn
} from './lib/svc1-core-kit.mjs';

const METHODS_READ = [
  ['listParts', (c, x) => c.listParts({}, x)], ['getPart', (c, x) => c.getPart('P-ONE', x)], ['listLabour', (c, x) => c.listLabour({}, x)],
  ['ledger', (c, x) => c.ledger('P-ONE', {}, x)], ['listOpening', (c, x) => c.listOpening(x)], ['listReceipts', (c, x) => c.listReceipts({}, x)],
  ['getDoc', (c, x) => c.getDoc('GRN/26-27/0001', x)], ['jobParts', (c, x) => c.jobParts('JOB-1', x)],
  ['listCounterSales', (c, x) => c.listCounterSales({ all: true }, x)], ['listAdjustments', (c, x) => c.listAdjustments({}, x)],
  ['listOldParts', (c, x) => c.listOldParts({}, x)], ['reorderList', (c, x) => c.reorderList(x)], ['history', (c, x) => c.history('part', 'P-ONE', x)],
  ['reportData', (c, x) => c.reportData('svcStockList', {}, x)]
];

function allValuesOf(obj, key, out = []) {
  if (Array.isArray(obj)) { for (const v of obj) allValuesOf(v, key, out); return out; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === key) out.push(obj[k]);
      allValuesOf(obj[k], key, out);
    }
  }
  return out;
}

test('F01 create refuses bad options and missing libraries', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const cases = { get: () => null };
  assert.equal(CoreLib.create().ok, false);
  assert.equal(CoreLib.create().code, 'CORE_ARGS_INVALID');
  assert.equal(CoreLib.create({ adapter: {}, now: clock.now, cases }).code, 'CORE_ARGS_INVALID');
  assert.equal(CoreLib.create({ adapter, now: 5, cases }).code, 'CORE_ARGS_INVALID');
  assert.equal(CoreLib.create({ adapter, now: clock.now }).code, 'CORE_ARGS_INVALID');
  assert.equal(CoreLib.create({ adapter, now: clock.now, cases: {} }).code, 'CORE_ARGS_INVALID');
  const noDocs = CoreLib.create({ adapter, now: clock.now, cases });
  assert.equal(noDocs.ok, false);
  assert.equal(noDocs.code, 'CORE_LIBS_MISSING');
  assert.deepEqual(noDocs.detail, ['docs']);
  assert.equal(typeof noDocs.message, 'string');
  const ok = CoreLib.create({ adapter, now: clock.now, cases, libs: { docs: makeFakeDocsLib() } });
  assert.equal(ok.ok, true);
  assert.ok(Object.isFrozen(ok.core));
  assert.equal(ok.core.version, 1);
});

test('F02 exact facade method names of plan 2.13', () => {
  const env = makeEnv();
  const names = ['status', 'reopen', 'acknowledgeRestore', 'listParts', 'getPart', 'listLabour', 'savePart', 'setPartActive', 'removePart',
    'saveLabour', 'setLabourActive', 'removeLabour', 'planBulk', 'commitBulk', 'history', 'ledger', 'listOpening', 'proposeOpening',
    'approveOpening', 'rejectOpening', 'withdrawOpening', 'receiveGoods', 'listReceipts', 'getDoc', 'reverseDoc', 'issueToJob',
    'returnFromJob', 'jobParts', 'jobHasParts', 'counterSale', 'listCounterSales', 'proposeAdjustment', 'listAdjustments',
    'approveAdjustment', 'rejectAdjustment', 'withdrawAdjustment', 'registerOldPart', 'listOldParts', 'oldPartNextStates',
    'moveOldPart', 'signOffScrap', 'reorderList', 'settings', 'setConfig', 'can', 'reportData'];
  for (const n of names) assert.equal(typeof env.core[n], 'function', n);
  assert.deepEqual(Object.keys(env.core).filter((k) => k !== 'version').sort(), names.slice().sort());
});

test('F03 the store opens lazily, once, and only when storage is authoritative', () => {
  const env = makeEnv();
  assert.equal(env.docsLib.openCalls, 0);
  assert.equal(env.adapter.setCount, 0);
  env.adapter.auth = false;
  const r = env.core.listParts({}, env.manager());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(env.docsLib.openCalls, 0);
  assert.equal(env.core.jobHasParts('JOB-1').ok, false);
  const st = env.core.status();
  assert.equal(st.ready, false);
  assert.equal(st.integrity.code, 'SVCS_STORAGE_UNAVAILABLE');
  env.adapter.auth = true;
  assert.equal(env.core.listParts({}, env.manager()).ok, true);
  assert.equal(env.docsLib.openCalls, 1);
  env.core.listParts({}, env.manager());
  env.core.status();
  assert.equal(env.docsLib.openCalls, 1);
  env.adapter.auth = false;
  assert.equal(env.core.listParts({}, env.manager()).code, 'SVCS_STORAGE_UNAVAILABLE');
});

test('F04 a broken session is refused by every read and write, with no storage touched', () => {
  const env = makeEnv();
  const before = env.adapter.setCount;
  for (const [name, call] of METHODS_READ) {
    for (const bad of [BROKEN, null, undefined, { ok: true, tier: 'owner', isOwner: false }, { ok: true, tier: 'manager', isManager: false }, { ok: true, tier: 'god' }]) {
      const r = call(env.core, { session: bad });
      assert.equal(r.ok, false, name);
      assert.ok(r.code === 'SESSION_REQUIRED' || (name === 'reportData' && r.code === 'SESSION_REQUIRED'), name + ' ' + JSON.stringify(r));
    }
    assert.equal(call(env.core, null).ok, false, name);
    assert.equal(call(env.core, undefined).ok, false, name);
  }
  for (const m of ['proposeOpening', 'receiveGoods', 'issueToJob', 'counterSale', 'registerOldPart']) {
    assert.equal(env.core[m]({}, { session: BROKEN }).code, 'SESSION_REQUIRED', m);
  }
  assert.equal(env.core.savePart({ code: 'X' }, { session: BROKEN }).code, 'SESSION_REQUIRED');
  assert.equal(env.core.removePart('X', 'reason here', { session: BROKEN }).code, 'SESSION_REQUIRED');
  assert.equal(env.adapter.setCount, before);
  assert.equal(env.docsLib.calls.filter((c) => c.method !== 'can').length, 0);
});

test('F05 status: ready, counts, financial year, opening count, pending proposals', () => {
  const env = makeEnv();
  const s0 = env.core.status();
  assert.equal(s0.ok, true);
  assert.equal(s0.ready, true);
  assert.equal(s0.blocked, false);
  assert.equal(s0.fy, '2026-27');
  assert.equal(s0.openingSetCount, 0);
  assert.equal(s0.integrity.ok, true);
  assert.deepEqual(s0.problems, []);
  buildStandard(env);
  const s = env.core.status();
  assert.equal(s.openingSetCount, 2);
  assert.equal(s.counts.parts, 3);
  assert.equal(s.counts.ledger, 7);
  assert.equal(s.counts.pendingProposals, 1);
  assert.equal(s.integrity.lastEntryAt, '2026-11-13T05:30:00.000Z');
  assert.equal(env.core.status().ready, true);
});

test('F06 listParts: rows, FIFO figures, groups and totals', () => {
  const env = makeEnv();
  buildStandard(env);
  const r = env.core.listParts({}, env.manager());
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.code), ['P-ONE', 'P-THREE', 'P-TWO']);
  const one = r.rows[0];
  assert.equal(one.onHand, 3);
  assert.equal(one.valuePaise, 3600);
  assert.equal(one.lastCostPaise, 1200);
  assert.equal(one.openingSet, true);
  assert.equal(one.rev, 1);
  assert.equal(one.taxPending, true);
  assert.equal(r.rows[1].openingSet, false);
  assert.deepEqual(r.totals, { parts: 3, pieces: 10, valuePaise: 7700 });
  assert.deepEqual(r.groups, ['Battery', 'Glass', 'Strap']);
  assert.equal(r.total, 3);
  for (const k of ['code', 'name', 'group', 'unit', 'hsn', 'gstRateBp', 'sellPricePaise', 'priceIncludesTax', 'reorderLevel', 'reorderQty', 'bin', 'flags', 'active', 'taxPending', 'rev', 'onHand', 'openingSet', 'valuePaise', 'lastCostPaise']) {
    assert.ok(Object.prototype.hasOwnProperty.call(one, k), k);
  }
});

test('F07 listParts: text, group, active, state filters and paging', () => {
  const env = makeEnv();
  buildStandard(env);
  const c = env.core;
  const m = env.manager();
  assert.deepEqual(c.listParts({ text: 'strap' }, m).rows.map((x) => x.code), ['P-TWO']);
  assert.deepEqual(c.listParts({ group: 'glass' }, m).rows.map((x) => x.code), ['P-THREE']);
  assert.deepEqual(c.listParts({ state: 'low' }, m).rows.map((x) => x.code), ['P-ONE', 'P-THREE']);
  assert.deepEqual(c.listParts({ state: 'out' }, m).rows.map((x) => x.code), []);
  const p = c.listParts({ offset: 1, limit: 1 }, m);
  assert.deepEqual(p.rows.map((x) => x.code), ['P-THREE']);
  assert.equal(p.total, 3);
  assert.equal(p.totals.pieces, 10);
  assert.equal(c.listParts({ limit: 100000 }, m).limit, 500);
  assert.equal(c.listParts({ offset: -4, limit: 'x' }, m).offset, 0);
  assert.equal(c.setPartActive('P-TWO', false, 'not stocked now', m).ok, true);
  assert.deepEqual(c.listParts({ active: 'true' }, m).rows.map((x) => x.code), ['P-ONE', 'P-THREE']);
  assert.deepEqual(c.listParts({ active: 'false' }, m).rows.map((x) => x.code), ['P-TWO']);
  assert.equal(c.listParts({ active: 'all' }, m).total, 3);
});

test('F08 out-of-stock filter and negative stock are reported', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-TWO', qty: 2, unitCostPaise: 500 }]);
  kitOpening(env.kit, [{ partCode: 'P-TWO', qty: 2, unitCostPaise: 500 }], pid);
  env.clock.set('2026-11-02T06:00:00.000Z');
  const iss = kitIssue(env.kit, 'JOB-9', [{ partCode: 'P-TWO', qty: 2 }]);
  assert.equal(iss.movements.length, 1);
  const r = env.core.listParts({ state: 'out' }, env.manager());
  assert.deepEqual(r.rows.map((x) => x.code).sort(), ['P-ONE', 'P-THREE', 'P-TWO']);
  assert.equal(env.core.listParts({}, env.manager()).rows.find((x) => x.code === 'P-TWO').onHand, 0);
});

test('F09 cost fields are null for staff and visible for Store Manager and Owner', () => {
  const env = makeEnv();
  const refs = buildStandard(env);
  const keys = ['valuePaise', 'lastCostPaise', 'unitCostPaise', 'totalPaise', 'valueInPaise', 'valueOutPaise', 'balanceValuePaise',
    'totalValuePaise', 'totalAbsPaise', 'estCostPaise', 'lastReceiptCostPaise', 'lineValuePaise', 'valueEffectPaise', 'balValuePaise'];
  const calls = [
    (x) => env.core.listParts({}, x), (x) => env.core.getPart('P-ONE', x), (x) => env.core.listOpening(x),
    (x) => env.core.listReceipts({}, x), (x) => env.core.getDoc('GRN/26-27/0001', x), (x) => env.core.getDoc('ISS/26-27/0001', x),
    (x) => env.core.getDoc('ADJ/26-27/0001', x), (x) => env.core.getDoc('OPN/26-27/0001', x), (x) => env.core.getDoc('CSL/26-27/0001', x),
    (x) => env.core.jobParts('JOB-1', x), (x) => env.core.listAdjustments({}, x), (x) => env.core.reorderList(x),
    (x) => env.core.listCounterSales({ all: true }, x), (x) => env.core.getDoc(refs.adjP, x),
    (x) => env.core.reportData('svcStockList', {}, x), (x) => env.core.reportData('svcReorderList', {}, x),
    (x) => env.core.reportData('svcGoodsReceipt', { grnNo: 'GRN/26-27/0001' }, x)
  ];
  for (const call of calls) {
    const staff = call(env.staff());
    assert.equal(staff.ok, true, JSON.stringify(staff).slice(0, 200));
    for (const k of keys) {
      for (const v of allValuesOf(staff, k)) assert.equal(v, null, k + ' leaked to staff in ' + JSON.stringify(staff).slice(0, 300));
    }
  }
  const mgrParts = env.core.listParts({}, env.manager());
  assert.equal(mgrParts.rows[0].valuePaise, 3600);
  const ownParts = env.core.listParts({}, env.owner());
  assert.equal(ownParts.totals.valuePaise, 7700);
  assert.equal(env.core.listParts({}, env.staff()).totals.valuePaise, null);
  assert.equal(env.core.listParts({}, env.staff()).totals.pieces, 10);
});

test('F10 getPart returns the part, movement flag and open cost layers (cost roles only)', () => {
  const env = makeEnv();
  buildStandard(env);
  const m = env.core.getPart('p-one', env.manager());
  assert.equal(m.ok, true);
  assert.equal(m.part.code, 'P-ONE');
  assert.equal(m.hasMovements, true);
  assert.deepEqual(m.layers.map((l) => [l.grnNo, l.qtyReceived, l.qtyRemaining, l.unitCostPaise, l.date]), [['GRN/26-27/0001', 5, 3, 1200, '2026-11-03']]);
  assert.equal(env.core.getPart('P-ONE', env.staff()).layers, null);
  assert.equal(env.core.getPart('NOPE', env.manager()).ok, false);
  assert.equal(env.core.getPart('NOPE', env.manager()).code, 'NOT_FOUND');
});

test('F11 masters writes: create, edit with expected revision, deactivate; roles', () => {
  const env = makeEnv();
  const m = env.manager();
  const base = { code: 'N-1', name: 'New strap', group: 'Strap', unit: 'pc', sellPricePaise: 3000, priceIncludesTax: true };
  assert.equal(env.core.savePart(base, env.staff()).code, 'ROLE_DENIED');
  const c = env.core.savePart(base, m);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.row.rev, 1);
  assert.equal(env.core.savePart(base, m).code, 'PART_CODE_DUPLICATE');
  const e = env.core.savePart({ code: 'N-1', name: 'New strap 2', expectedRev: 1, reason: 'name change' }, m);
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal(e.row.rev, 2);
  assert.equal(e.row.name, 'New strap 2');
  const stale = env.core.savePart({ code: 'N-1', name: 'New strap 3', expectedRev: 1, reason: 'stale write' }, m);
  assert.equal(stale.code, 'REV_CONFLICT');
  const priceNoReason = env.core.savePart({ code: 'N-1', sellPricePaise: 3500, expectedRev: 2 }, m);
  assert.equal(priceNoReason.ok, false);
  assert.equal(priceNoReason.code, 'REASON_REQUIRED');
  assert.equal(env.core.setPartActive('N-1', false, 'no longer sold', m).ok, true);
  assert.equal(env.core.getPart('N-1', m).part.active, false);
  assert.equal(env.core.setPartActive('N-1', true, 'sold again', m).ok, true);
  const lab = env.core.saveLabour({ code: 'L-1', name: 'Battery change', group: 'Labour', unit: 'job', ratePaise: 10000, priceIncludesTax: true }, m);
  assert.equal(lab.ok, true, JSON.stringify(lab));
  assert.equal(env.core.listLabour({}, env.staff()).rows.length, 1);
  assert.equal(env.core.setLabourActive('L-1', false, 'old rate card', m).ok, true);
  assert.equal(env.core.listLabour({ active: 'false' }, m).total, 1);
});

test('F12 removePart needs Owner, a fresh step-up stamp, no movements, no references', () => {
  const env = makeEnv();
  buildStandard(env);
  const own = env.owner();
  env.core.savePart({ code: 'U-1', name: 'Unused', group: 'Misc', unit: 'pc', sellPricePaise: 100, priceIncludesTax: false }, env.manager());
  const stamp = (offset) => ({ ok: true, at: env.clock.ms + offset });
  assert.equal(env.core.removePart('U-1', 'created by mistake', env.manager({ stepUp: stamp(0) })).code, 'ROLE_DENIED');
  assert.equal(env.core.removePart('U-1', 'created by mistake', own).code, 'PIN_REQUIRED');
  assert.equal(env.core.removePart('U-1', 'created by mistake', env.owner({ stepUp: stamp(-120001) })).code, 'PIN_REQUIRED');
  assert.equal(env.core.removePart('U-1', 'created by mistake', env.owner({ stepUp: stamp(1000) })).code, 'PIN_REQUIRED');
  assert.equal(env.core.removePart('U-1', 'created by mistake', env.owner({ stepUp: { ok: false, at: env.clock.ms } })).code, 'PIN_REQUIRED');
  // a caller cannot hand in its own clock
  assert.equal(env.core.removePart('U-1', 'created by mistake', env.owner({ stepUp: stamp(-200000), now: () => new Date(env.clock.ms - 150000) })).code, 'PIN_REQUIRED');
  assert.equal(env.core.removePart('P-ONE', 'wrong code entered', env.owner({ stepUp: stamp(0) })).code, 'HAS_MOVEMENTS');
  assert.equal(env.core.removePart('U-1', 'abc', env.owner({ stepUp: stamp(0) })).code, 'REASON_REQUIRED');
  const ok = env.core.removePart('U-1', 'created by mistake', env.owner({ stepUp: stamp(-120000) }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(env.core.getPart('U-1', env.manager()).code, 'NOT_FOUND');
});

test('F13 removePart is refused when a proposal or an old part names the code, and when the documents layer is in doubt', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  const stamp = () => ({ ok: true, at: env.clock.ms });
  kitPropose(env.kit, 'ADJ', [{ partCode: 'P-TWO', qtyDelta: -1, reason: 'LOST', unitCostPaise: null, valuePaise: 100 }], { valuePaise: 100 });
  assert.equal(env.core.removePart('P-TWO', 'wrong code entered', env.owner({ stepUp: stamp() })).code, 'HAS_REFERENCES');
  kitOldRegister(env.kit, { partCode: 'P-THREE', jobId: 'JOB-3' });
  assert.equal(env.core.removePart('P-THREE', 'wrong code entered', env.owner({ stepUp: stamp() })).code, 'HAS_REFERENCES');
  env.docsLib.referencedAnswer = true;
  assert.equal(env.core.removePart('P-ONE', 'wrong code entered', env.owner({ stepUp: stamp() })).code, 'HAS_REFERENCES');
  env.docsLib.referencedAnswer = false;
  env.docsLib.movementsAnswer = 'maybe';
  assert.equal(env.core.removePart('P-ONE', 'wrong code entered', env.owner({ stepUp: stamp() })).code, 'HAS_MOVEMENTS');
  env.docsLib.movementsAnswer = false;
  assert.equal(env.core.removePart('P-ONE', 'wrong code entered', env.owner({ stepUp: stamp() })).ok, true);
});

test('F14 bulk create: plan then commit through the facade', () => {
  const env = makeEnv();
  const text = Masters.templateExample('part');
  const plan = env.core.planBulk('part', text, env.manager());
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 400));
  assert.equal(env.core.planBulk('parts', text, env.manager()).ok, true);
  assert.equal(env.core.planBulk('weird', text, env.manager()).code, 'CORE_ARGS_INVALID');
  assert.equal(env.core.planBulk('part', text, env.staff()).ok, false);
  const done = env.core.commitBulk(plan, env.manager());
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 400));
  assert.ok(env.core.listParts({}, env.manager()).total >= 1);
});

test('F15 history is for Store Manager and Owner only', () => {
  const env = makeEnv();
  buildStandard(env);
  assert.equal(env.core.history('part', 'P-ONE', env.staff()).code, 'ROLE_DENIED');
  const h = env.core.history('part', 'P-ONE', env.manager());
  assert.equal(h.ok, true);
  assert.equal(h.entries.length, 1);
  assert.equal(env.core.history('stuff', 'P-ONE', env.manager()).code, 'CORE_ARGS_INVALID');
});

test('F16 ledger per part: Store Manager and Owner only; figures follow the FIFO layers', () => {
  const env = makeEnv();
  buildStandard(env);
  assert.equal(env.core.ledger('P-ONE', {}, env.staff()).code, 'ROLE_DENIED');
  const r = env.core.ledger('P-ONE', { from: '2026-11-01', to: '2026-11-13' }, env.manager());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.rows.map((x) => [x.docType, x.docNo, x.qtyIn, x.qtyOut, x.balanceQty, x.balanceValuePaise]), [
    ['OPENING', 'OPN/26-27/0001', 10, 0, 10, 10000],
    ['GRN', 'GRN/26-27/0001', 5, 0, 15, 16000],
    ['ISSUE', 'ISS/26-27/0001', 0, 12, 3, 3600],
    ['RETURN', 'RET/26-27/0001', 1, 0, 4, 4800],
    ['COUNTER', 'CSL/26-27/0001', 0, 1, 3, 3600],
    ['ADJUST', 'ADJ/26-27/0001', 0, 1, 2, 2400],
    ['REVERSAL', 'CSL/26-27/0001', 1, 0, 3, 3600]
  ]);
  assert.equal(r.rows[2].valueOutPaise, 12400);
  assert.equal(r.rows[2].jobId, 'JOB-1');
  assert.equal(r.rows[4].reversed, true);
  assert.equal(r.rows[6].isReversal, true);
  assert.equal(r.rows[6].reversalOf, 'CSL/26-27/0001');
  assert.deepEqual(r.opening, { qty: 0, valuePaise: 0 });
  assert.deepEqual(r.closing, { qty: 3, valuePaise: 3600 });
  assert.equal(r.onHand, 3);
  assert.equal(r.total, 7);
  assert.deepEqual(r.layers.map((l) => l.qtyRemaining), [3]);
  const mid = env.core.ledger('P-ONE', { from: '2026-11-04', to: '2026-11-06' }, env.owner());
  assert.deepEqual(mid.opening, { qty: 15, valuePaise: 16000 });
  assert.deepEqual(mid.closing, { qty: 4, valuePaise: 4800 });
  assert.equal(mid.rows.length, 2);
  const page = env.core.ledger('P-ONE', { offset: 5, limit: 1 }, env.manager());
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].docType, 'ADJUST');
  assert.equal(page.total, 7);
});

test('F17 ledger refuses bad dates and unknown parts; a day boundary follows India time', () => {
  const env = makeEnv();
  buildStandard(env);
  const m = env.manager();
  assert.equal(env.core.ledger('P-ONE', { from: '2026-13-01' }, m).code, 'ARG_INVALID');
  assert.equal(env.core.ledger('P-ONE', { from: '2026-11-10', to: '2026-11-09' }, m).code, 'ARG_INVALID');
  assert.equal(env.core.ledger('NOPE', {}, m).code, 'PART_UNKNOWN');
  assert.equal(env.core.ledger('', {}, m).code, 'PART_UNKNOWN');
  // the receipt was posted at 06:00 UTC = 11:30 India on 2026-11-03
  const day = env.core.ledger('P-ONE', { from: '2026-11-03', to: '2026-11-03' }, m);
  assert.deepEqual(day.rows.map((x) => x.docType), ['GRN']);
  const before = env.core.ledger('P-ONE', { from: '2026-11-02', to: '2026-11-02' }, m);
  assert.deepEqual(before.rows, []);
  assert.deepEqual(before.opening, { qty: 10, valuePaise: 10000 });
  assert.deepEqual(before.closing, { qty: 10, valuePaise: 10000 });
});

test('F18 documents: opening proposals, receipts, counter sales, getDoc', () => {
  const env = makeEnv();
  const refs = buildStandard(env);
  const o = env.core.listOpening(env.manager());
  assert.equal(o.ok, true);
  assert.equal(o.openingSetCount, 2);
  assert.equal(o.rows.length, 1);
  assert.equal(o.rows[0].state, 'POSTED');
  assert.equal(o.rows[0].no, 'OPN/26-27/0001');
  assert.equal(o.rows[0].proposalId, refs.op);
  assert.equal(o.rows[0].pieces, 14);
  assert.equal(o.rows[0].valuePaise, 12000);
  const g = env.core.listReceipts({}, env.manager());
  assert.equal(g.total, 1);
  assert.equal(g.rows[0].no, 'GRN/26-27/0001');
  assert.equal(g.rows[0].supplierInvoiceNo, 'INV-1');
  assert.equal(g.rows[0].shortPieces, 3);
  assert.equal(g.rows[0].pieces, 8);
  assert.equal(g.rows[0].totalPaise, 8100);
  assert.equal(env.core.listReceipts({ text: 'inv-1' }, env.manager()).total, 1);
  assert.equal(env.core.listReceipts({ text: 'zzz' }, env.manager()).total, 0);
  assert.equal(env.core.listReceipts({ status: 'REVERSED' }, env.manager()).total, 0);
  assert.equal(env.core.listCounterSales({ date: '2026-11-07' }, env.manager()).total, 1);
  assert.equal(env.core.listCounterSales({ date: '2026-11-08' }, env.manager()).total, 0);
  assert.equal(env.core.listCounterSales({ date: 'x' }, env.manager()).code, 'ARG_INVALID');
  const csl = env.core.listCounterSales({ all: true }, env.manager()).rows[0];
  assert.equal(csl.status, 'REVERSED');
  assert.equal(csl.payMode, 'CASH');
  assert.equal(csl.amountPaise, 3300);
  assert.equal(csl.moneyPosted, false);
  assert.equal(csl.reversal.reason, 'sale was cancelled');
  assert.equal(csl.reversal.date, '2026-11-10');
  const d = env.core.getDoc('GRN/26-27/0001', env.manager());
  assert.equal(d.ok, true);
  assert.deepEqual(d.doc.lines.map((l) => [l.partCode, l.qtyInvoiced, l.qtyReceived, l.qtyShort, l.unitCostPaise, l.valuePaise]), [
    ['P-ONE', 8, 5, 3, 1200, 6000], ['P-THREE', null, 3, 0, 700, 2100]
  ]);
  assert.equal(d.doc.lines[0].name, 'Test battery');
  assert.equal(env.core.getDoc('nope/1', env.manager()).code, 'DOC_NOT_FOUND');
  assert.equal(env.core.getDoc('', env.manager()).code, 'CORE_ARGS_INVALID');
  assert.equal(env.core.getDoc('DOC-999999', env.manager()).code, 'DOC_NOT_FOUND');
  const iss = env.core.getDoc('iss/26-27/0001', env.manager()).doc;
  assert.equal(iss.jobId, 'JOB-1');
  assert.equal(iss.lines[0].valuePaise, 12400);
  assert.equal(iss.totalPaise, 12400);
});

test('F19 adjustments: states, needsOwner and limits', () => {
  const env = makeEnv();
  const refs = buildStandard(env);
  const all = env.core.listAdjustments({}, env.manager());
  assert.equal(all.total, 3);
  const byState = (s) => env.core.listAdjustments({ state: s }, env.manager()).rows;
  assert.equal(byState('POSTED').length, 1);
  assert.equal(byState('PROPOSED').length, 1);
  assert.equal(byState('REJECTED').length, 1);
  assert.equal(byState('WITHDRAWN').length, 0);
  const posted = byState('POSTED')[0];
  assert.equal(posted.no, 'ADJ/26-27/0001');
  assert.equal(posted.proposalId, refs.adjP);
  assert.equal(posted.decidedBy, 'Test Owner');
  assert.equal(posted.reasonClass, 'WRITEOFF');
  const pending = byState('PROPOSED')[0];
  assert.equal(pending.needsOwner, true);
  assert.equal(pending.valuePaise, 500);
  const rej = byState('REJECTED')[0];
  assert.equal(rej.rejectReason, 'not found on recount');
  assert.equal(rej.decidedBy, 'Test Manager');
  env.docsLib.config.adjustLimitPaise = 1000;
  assert.equal(env.core.listAdjustments({ state: 'PROPOSED' }, env.manager()).rows[0].needsOwner, false);
  env.docsLib.config.adjustLimitPaise = 400;
  assert.equal(env.core.listAdjustments({ state: 'PROPOSED' }, env.manager()).rows[0].needsOwner, true);
  const prop = env.core.getDoc(refs.adj2, env.manager());
  assert.equal(prop.ok, true);
  assert.equal(prop.proposal.state, 'PROPOSED');
  assert.equal(prop.proposal.lines[0].qtyDelta, -1);
});

test('F20 a withdrawn proposal and a proposal posted later are tracked from the records', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 3, unitCostPaise: 100 }]);
  assert.equal(env.core.listOpening(env.manager()).rows[0].state, 'PROPOSED');
  kitDecide(env.kit, 'OPN_WITHDRAW', pid, '');
  assert.equal(env.core.listOpening(env.manager()).rows[0].state, 'WITHDRAWN');
  const p2 = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 3, unitCostPaise: 100 }]);
  kitOpening(env.kit, [{ partCode: 'P-ONE', qty: 3, unitCostPaise: 100 }], p2);
  const rows = env.core.listOpening(env.manager()).rows;
  assert.deepEqual(rows.map((r) => r.state), ['POSTED', 'WITHDRAWN']);
  assert.equal(env.core.listOpening(env.manager()).openingSetCount, 1);
});

test('F21 jobParts and jobHasParts: net issued, returns, outstanding per issue', () => {
  const env = makeEnv();
  buildStandard(env);
  const jp = env.core.jobParts('JOB-1', env.staff());
  assert.equal(jp.ok, true);
  assert.equal(jp.totalNet, 11);
  assert.equal(jp.totalValuePaise, null);
  assert.equal(jp.rows[0].valuePaise, null);
  assert.deepEqual(jp.rows[0].issues.map((i) => [i.docNo, i.lineNo, i.qty, i.outstanding]), [['ISS/26-27/0001', 1, 12, 11]]);
  const mgr = env.core.jobParts('JOB-1', env.manager());
  assert.equal(mgr.totalValuePaise, 11200);
  assert.equal(mgr.rows[0].issued, 12);
  assert.equal(mgr.rows[0].returned, 1);
  assert.equal(mgr.rows[0].name, 'Test battery');
  assert.deepEqual(env.core.jobParts('JOB-77', env.manager()).rows, []);
  assert.equal(env.core.jobParts('', env.manager()).code, 'CORE_ARGS_INVALID');
  assert.deepEqual(env.core.jobHasParts('JOB-1'), { ok: true, has: true });
  assert.deepEqual(env.core.jobHasParts('JOB-77'), { ok: true, has: false });
  assert.equal(env.core.jobHasParts('').ok, false);
  assert.equal(env.core.jobHasParts(null).ok, false);
});

test('F22 jobHasParts is false once every part is returned', () => {
  const env = makeEnv();
  const refs = buildStandard(env);
  const mvId = refs.iss.movements[0].id;
  kitReturn(env.kit, 'JOB-1', [{ issueMovementId: mvId, qty: 11 }]);
  assert.deepEqual(env.core.jobHasParts('JOB-1'), { ok: true, has: false });
  const jp = env.core.jobParts('JOB-1', env.manager());
  assert.equal(jp.totalNet, 0);
  assert.equal(jp.rows[0].issues[0].outstanding, 0);
});

test('F23 jobHasParts fails closed: storage not ready, blocked store, damaged ledger', () => {
  const env = makeEnv();
  buildStandard(env);
  assert.equal(env.core.jobHasParts('JOB-1').has, true);
  env.adapter.auth = false;
  const r = env.core.jobHasParts('JOB-1');
  assert.equal(r.ok, false);
  assert.equal(r.has, undefined);
  env.adapter.auth = true;
  assert.equal(env.core.jobHasParts('JOB-1').ok, true);
  // damage one ledger record body: the chain check blocks the store on the next open
  const key = env.adapter.svcsKeys().find((k) => /ledger/.test(k));
  const arr = JSON.parse(env.adapter.data.get(key));
  arr[1].b.note = 'tampered';
  env.adapter.data.set(key, JSON.stringify(arr));
  assert.equal(env.core.reopen().blocked, true);
  const blocked = env.core.jobHasParts('JOB-1');
  assert.equal(blocked.ok, false);
  assert.notEqual(blocked.has, false);
  assert.equal(env.core.listParts({}, env.manager()).ok, false);
  assert.equal(env.core.status().ready, false);
  assert.equal(env.core.status().integrity.ok, false);
  assert.ok(env.core.status().problems.length > 0);
});

test('F24 old part register: states, labels, filters, next states', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-10-20T06:00:00.000Z');
  const a = kitOldRegister(env.kit, { jobId: 'JOB-1', partCode: 'P-ONE', state: 'SCRAP_PENDING' });
  env.clock.set('2026-11-11T06:00:00.000Z');
  const b = kitOldRegister(env.kit, { jobId: 'JOB-2', partText: 'cracked glass', state: 'HELD_FOR_CLAIM', claimRef: 'CLM-1' });
  const c = kitOldRegister(env.kit, { jobId: 'JOB-3', partText: 'old strap', state: 'HELD_FOR_CLAIM' });
  env.clock.set('2026-11-12T06:00:00.000Z');
  kitOldMove(env.kit, c, 'HELD_FOR_CLAIM', 'CUSTOMER_RETURNED', { note: 'given back' });
  kitScrapSignoff(env.kit, '2026-10', [a]);
  const r = env.core.listOldParts({}, env.staff());
  assert.equal(r.ok, true);
  assert.equal(r.total, 3);
  const by = (no) => r.rows.find((x) => x.oldNo === no);
  assert.equal(by(a).state, 'SCRAPPED');
  assert.equal(by(a).stateLabel, 'Scrapped');
  assert.equal(by(a).signoffMonth, '2026-10');
  assert.equal(by(a).desc, 'Test battery');
  assert.equal(by(b).stateLabel, 'Held for claim');
  assert.equal(by(b).bin, 'CLAIM');
  assert.equal(by(b).claimRef, 'CLM-1');
  assert.equal(by(b).desc, 'cracked glass');
  assert.equal(by(c).stateLabel, 'Customer Returned');
  assert.equal(by(c).decidedDate, '2026-11-12');
  assert.equal(by(a).history.length, 2);
  assert.equal(env.core.listOldParts({ state: 'HELD_FOR_CLAIM' }, env.manager()).total, 1);
  assert.equal(env.core.listOldParts({ jobId: 'JOB-3' }, env.manager()).total, 1);
  assert.equal(env.core.listOldParts({ month: '2026-10' }, env.manager()).total, 1);
  assert.equal(env.core.listOldParts({ text: 'clm-1' }, env.manager()).total, 1);
  assert.deepEqual(env.core.oldPartNextStates('HELD_FOR_CLAIM'), ['CUSTOMER_RETURNED', 'SCRAP_PENDING']);
  assert.deepEqual(env.core.oldPartNextStates('SCRAP_PENDING'), ['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED']);
  assert.deepEqual(env.core.oldPartNextStates('SCRAPPED'), []);
  assert.deepEqual(env.core.oldPartNextStates('CUSTOMER_RETURNED'), []);
  assert.deepEqual(env.core.oldPartNextStates('bogus'), []);
});

test('F25 scrap month: pending rows know the month they became pending', () => {
  const env = makeEnv();
  env.clock.set('2026-10-31T19:00:00.000Z');
  const a = kitOldRegister(env.kit, { jobId: 'JOB-1', partText: 'x', state: 'SCRAP_PENDING' });
  const r = env.core.listOldParts({ scrapMonth: '2026-11' }, env.manager());
  assert.equal(r.total, 1, '2026-10-31 19:00 UTC is already 1 November in India');
  assert.equal(r.rows[0].oldNo, a);
  assert.equal(env.core.listOldParts({ scrapUpTo: '2026-11' }, env.manager()).total, 1);
  assert.equal(env.core.listOldParts({ scrapUpTo: '2026-10' }, env.manager()).total, 0);
});

test('F26 reorder list: rows, suggestion, estimate and totals', () => {
  const env = makeEnv();
  buildStandard(env);
  const r = env.core.reorderList(env.manager());
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => [x.partCode, x.onHand, x.reorderLevel, x.shortBy, x.suggestQty, x.estCostPaise]), [
    ['P-ONE', 3, 5, 2, 6, 7200], ['P-THREE', 3, 3, 0, 0, 0]
  ]);
  assert.equal(r.unitsShort, 2);
  assert.equal(r.estCostPaise, 7200);
  const s = env.core.reorderList(env.staff());
  assert.equal(s.rows[0].estCostPaise, null);
  assert.equal(s.rows[0].onHand, 3);
  assert.equal(s.estCostPaise, null);
  env.core.setPartActive('P-ONE', false, 'discontinued item', env.manager());
  assert.deepEqual(env.core.reorderList(env.manager()).rows.map((x) => x.partCode), ['P-THREE']);
});

test('F27 can(): own actions, delegated actions, broken sessions', () => {
  const env = makeEnv();
  const c = env.core;
  assert.deepEqual({ ok: c.can('VIEW', STAFF).ok, pin: c.can('VIEW', STAFF).needsPin }, { ok: true, pin: false });
  assert.equal(c.can('VIEW_COST', STAFF).ok, false);
  assert.equal(c.can('VIEW_COST', STAFF).code, 'ROLE_DENIED');
  assert.equal(c.can('VIEW_QTY', STAFF).ok, true, 'old name maps to VIEW');
  assert.equal(c.can('VIEW_LEDGER', STAFF).ok, false, 'old name maps to VIEW_COST');
  assert.equal(c.can('VIEW_COST', MANAGER).ok, true);
  assert.equal(c.can('VIEW_LEDGER', OWNER).ok, true);
  assert.equal(c.can('MASTERS_EDIT', STAFF).ok, false);
  assert.equal(c.can('MASTERS_EDIT', MANAGER).ok, true);
  assert.equal(c.can('MASTERS_EDIT', MANAGER).needsPin, false);
  assert.equal(c.can('MASTER_EDIT', MANAGER).ok, true, 'old name maps to MASTERS_EDIT');
  assert.equal(c.can('MASTERS_REMOVE', MANAGER).ok, false);
  assert.deepEqual([c.can('MASTERS_REMOVE', OWNER).ok, c.can('MASTERS_REMOVE', OWNER).needsPin], [true, true]);
  for (const a of ['NEGATIVE_OVERRIDE', 'ACK_RESTORE', 'RESTORE_ACK', 'CLOCK_OVERRIDE']) {
    assert.equal(c.can(a, MANAGER).ok, false, a);
    assert.equal(c.can(a, OWNER).needsPin, true, a);
  }
  assert.equal(c.can('OPENING_APPROVE', OWNER).needsPin, true);
  assert.equal(c.can('OPENING_APPROVE', MANAGER).ok, false);
  assert.equal(c.can('RECEIVE', STAFF).ok, true);
  for (const bad of [BROKEN, null, undefined, {}, { ok: true, tier: 'owner' }, { ok: true, tier: 'manager', isManager: true, isOwner: true }, { ok: true, tier: 'staff', isManager: true }]) {
    assert.equal(c.can('VIEW', bad).ok, false);
    assert.equal(c.can('VIEW', bad).code, 'SESSION_REQUIRED');
    assert.equal(c.can('OPENING_APPROVE', bad).ok, false);
  }
  assert.equal(c.can(5, OWNER).ok, false);
  // the documents layer saw a plain copy, not the caller's object
  const seen = env.docsLib.calls.filter((x) => x.method === 'can').pop();
  assert.notEqual(seen.args[1], STAFF);
  assert.equal(seen.args[1].tier, 'staff');
});

test('F28 settings() reads the documents layer config', () => {
  const env = makeEnv({ fake: { config: { adjustLimitPaise: 250000, storeRoles: ['Technician'] } } });
  const s = env.core.settings();
  assert.equal(s.ok, true);
  assert.equal(s.adjustLimitPaise, 250000);
  assert.equal(s.managerAdjustLimitPaise, 250000);
  assert.deepEqual(s.storeRoles, ['Technician']);
  const e2 = makeEnv();
  e2.adapter.auth = false;
  assert.equal(e2.core.settings().ok, false);
});

test('F29 write pass-through: a clean ctx, the lower result unchanged, no storage write by the core itself', () => {
  const env = makeEnv();
  const hostile = {
    session: Object.assign(Object.create({ isOwner: true }), { ok: true, tier: 'manager', isManager: true, role: 'Store Manager', actorName: 'Mgr', extra: 'x' }),
    stepUp: { ok: true, at: env.clock.ms, evil: 1 },
    clientRef: 'svs-abc-1',
    now: () => new Date(0),
    reauth: true
  };
  const before = env.adapter.setCount;
  const r = env.core.receiveGoods({ supplierInvoiceNo: 'A' }, hostile);
  assert.deepEqual(r, { ok: true, doc: { no: 'X' } });
  assert.equal(env.adapter.setCount, before);
  const call = env.docsLib.calls.filter((c) => c.method === 'receiveGoods').pop();
  assert.deepEqual(call.args[0], { supplierInvoiceNo: 'A' });
  const cx = call.args[1];
  assert.deepEqual(Object.keys(cx).sort(), ['clientRef', 'now', 'session', 'stepUp']);
  assert.equal(cx.reauth, undefined);
  assert.deepEqual(Object.keys(cx.session).sort(), ['actorName', 'isManager', 'isOwner', 'ok', 'role', 'tier']);
  assert.equal(cx.session.isOwner, false);
  assert.deepEqual(cx.stepUp, { ok: true, at: env.clock.ms });
  assert.equal(cx.clientRef, 'svs-abc-1');
  assert.equal(cx.now().getTime(), env.clock.ms);
  const r2 = env.core.counterSale({ lines: [] }, { session: MANAGER, stepUp: { ok: 'yes', at: 'now' }, clientRef: 'a' });
  assert.equal(r2.ok, true);
  const c2 = env.docsLib.calls.filter((c) => c.method === 'counterSale').pop().args[1];
  assert.equal(c2.stepUp, null);
  assert.equal(c2.clientRef, '');
});

test('F29b the clock-override flag passes only when strictly true, and only as a boolean', () => {
  const env = makeEnv();
  const send = (flag) => {
    env.core.receiveGoods({}, { session: OWNER, stepUp: { ok: true, at: env.clock.ms }, clockOverride: flag });
    return env.docsLib.calls.filter((c) => c.method === 'receiveGoods').pop().args[1];
  };
  assert.equal(send(true).clockOverride, true);
  for (const bad of [false, 1, 'true', {}, [], null, undefined]) assert.equal(Object.prototype.hasOwnProperty.call(send(bad), 'clockOverride'), false, String(bad));
  const inherited = Object.create({ clockOverride: true });
  inherited.session = OWNER;
  env.core.receiveGoods({}, inherited);
  assert.equal(Object.prototype.hasOwnProperty.call(env.docsLib.calls.filter((c) => c.method === 'receiveGoods').pop().args[1], 'clockOverride'), false);
});

test('F30 every documents-layer method is reachable with the plan 2.11 argument order', () => {
  const env = makeEnv();
  const m = env.manager();
  env.core.proposeOpening({ a: 1 }, m);
  env.core.approveOpening('DOC-000001', m);
  env.core.rejectOpening('DOC-000001', 'because', m);
  env.core.withdrawOpening('DOC-000001', m);
  env.core.reverseDoc('GRN/26-27/0001', 'reason text', m);
  env.core.issueToJob({ jobId: 'JOB-1' }, m);
  env.core.returnFromJob({ jobId: 'JOB-1' }, m);
  env.core.proposeAdjustment({ lines: [] }, m);
  env.core.approveAdjustment('DOC-000002', m);
  env.core.rejectAdjustment('DOC-000002', 'because', m);
  env.core.withdrawAdjustment('DOC-000002', m);
  env.core.registerOldPart({ jobId: 'J' }, m);
  env.core.moveOldPart('OLD/26-27/0001', { to: 'SCRAP_PENDING' }, m);
  env.core.signOffScrap({ month: '2026-10', oldNos: [] }, m);
  env.core.setConfig({ adjustLimitPaise: 5 }, m);
  const calls = env.docsLib.calls.filter((c) => c.method !== 'can');
  assert.deepEqual(calls.map((c) => c.method), ['proposeOpening', 'approveOpening', 'rejectOpening', 'withdrawOpening', 'reverseDoc',
    'issueToJob', 'returnFromJob', 'proposeAdjustment', 'approveAdjustment', 'rejectAdjustment', 'withdrawAdjustment',
    'registerOldPart', 'moveOldPart', 'signOffScrap', 'setConfig']);
  assert.deepEqual(calls.map((c) => c.args.length), [2, 2, 3, 2, 3, 2, 2, 2, 2, 3, 2, 2, 3, 2, 2]);
  for (const c of calls) assert.equal(c.args[c.args.length - 1].session.tier, 'manager');
  assert.equal(calls[4].args[1], 'reason text');
});

test('F31 lower-layer refusals pass through unchanged; a revision conflict reopens the store', () => {
  const env = makeEnv({ fake: { results: { receiveGoods: { ok: false, code: 'DUPLICATE_SUPPLIER_INVOICE', message: 'dup', detail: { docNo: 'GRN/26-27/0001' } } } } });
  const r = env.core.receiveGoods({}, env.manager());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DUPLICATE_SUPPLIER_INVOICE');
  assert.deepEqual(r.detail, { docNo: 'GRN/26-27/0001' });
  assert.equal(r.reopened, undefined);
  const before = env.docsLib.openCalls;
  env.core.listParts({}, env.manager());
  assert.equal(env.docsLib.openCalls, before);
  env.docsLib.results.issueToJob = { ok: false, code: 'SVCS_REV_CONFLICT', message: 'moved' };
  const c = env.core.issueToJob({}, env.manager());
  assert.equal(c.code, 'SVCS_REV_CONFLICT');
  assert.equal(c.reopened, true);
  assert.equal(env.docsLib.openCalls, before + 1);
  env.docsLib.results.counterSale = null;
  assert.equal(env.core.counterSale({}, env.manager()).code, 'CORE_INTERNAL');
  env.docsLib.results.counterSale = { ok: false };
  assert.equal(env.core.counterSale({}, env.manager()).code, 'CORE_INTERNAL');
});

test('F32 a lower layer that throws becomes a refusal, never an exception', () => {
  const env = makeEnv();
  const lib = makeFakeDocsLib();
  const clock = makeClock();
  const adapter = makeAdapter();
  const real = lib.create;
  lib.create = (deps) => {
    const api = real(deps);
    api.receiveGoods = () => { throw new Error('boom'); };
    return api;
  };
  const c = CoreLib.create({ adapter, now: clock.now, cases: { get: () => null }, libs: { docs: lib }, storeOptions: { watermark: false } }).core;
  const r = c.receiveGoods({}, { session: MANAGER });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CORE_INTERNAL');
  assert.match(r.detail, /boom/);
  assert.equal(c.status().ready, true);
});

test('F33 another screen can write: the next read sees it, no stale answer is served', () => {
  const env = makeEnv();
  buildStandard(env);
  assert.equal(env.core.listParts({}, env.manager()).rows[0].onHand, 3);
  env.clock.set('2026-11-13T05:40:00.000Z');
  kitReceipt(env.kit, 'INV-2', [{ partCode: 'P-ONE', qtyReceived: 10, unitCostPaise: 1500 }]);
  const before = env.docsLib.openCalls;
  const after = env.core.listParts({}, env.manager());
  assert.equal(after.rows[0].onHand, 13);
  assert.equal(after.rows[0].valuePaise, 3600 + 15000);
  assert.equal(after.rows[0].lastCostPaise, 1500);
  assert.equal(env.docsLib.openCalls, before + 1);
  assert.deepEqual(env.core.jobHasParts('JOB-1'), { ok: true, has: true });
});

test('F34 reading is cheap after the first build: the ledger view grows only by the new records', () => {
  const env = makeEnv();
  buildStandard(env);
  const first = env.core.listParts({}, env.manager());
  env.clock.set('2026-11-13T05:50:00.000Z');
  kitReceipt(env.kit, 'INV-3', [{ partCode: 'P-TWO', qtyReceived: 2, unitCostPaise: 600 }]);
  const second = env.core.listParts({}, env.manager());
  assert.equal(second.rows.find((r) => r.code === 'P-TWO').onHand, 6);
  assert.equal(second.rows.find((r) => r.code === 'P-ONE').valuePaise, first.rows.find((r) => r.code === 'P-ONE').valuePaise);
  assert.equal(second.totals.pieces, 12);
  assert.equal(second.totals.valuePaise, 7700 + 1200);
});

test('F35 a restore of an older backup blocks Stores until the Owner acknowledges it with the PIN', () => {
  const env = makeEnv({ storeOptions: { watermark: true } });
  const m = env.manager();
  const mk = (code) => env.core.savePart({ code, name: code, group: 'G', unit: 'pc', sellPricePaise: 0, priceIncludesTax: null }, m);
  assert.equal(mk('A-1').ok, true);
  const old = new Map(env.adapter.data);
  assert.equal(mk('A-2').ok, true);
  assert.equal(mk('A-3').ok, true);
  for (const [k, v] of old) if (k.indexOf('saagar_svcs_') === 0) env.adapter.data.set(k, v);
  const st = env.core.reopen();
  assert.equal(st.blocked, true);
  assert.equal(st.watermark, 'AHEAD');
  assert.equal(env.core.listParts({}, m).ok, false);
  const stamp = { ok: true, at: env.clock.ms };
  assert.equal(env.core.acknowledgeRestore({ reason: 'restored the Monday backup' }, env.manager({ stepUp: stamp })).code, 'ROLE_DENIED');
  assert.equal(env.core.acknowledgeRestore({ reason: 'restored the Monday backup' }, env.staff({ stepUp: stamp })).code, 'ROLE_DENIED');
  assert.equal(env.core.acknowledgeRestore({ reason: 'restored the Monday backup' }, { session: BROKEN, stepUp: stamp }).code, 'SESSION_REQUIRED');
  assert.equal(env.core.acknowledgeRestore({ reason: 'restored the Monday backup' }, env.owner()).code, 'PIN_REQUIRED');
  assert.equal(env.core.acknowledgeRestore({ reason: 'restored the Monday backup' }, env.owner({ stepUp: { ok: true, at: env.clock.ms - 130000 } })).code, 'PIN_REQUIRED');
  assert.equal(env.core.status().ready, false);
  const bad = env.core.acknowledgeRestore({ reason: 'no' }, env.owner({ stepUp: stamp }));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'SVCS_ARGS_INVALID');
  const ok = env.core.acknowledgeRestore({ reason: 'restored the Monday backup' }, env.owner({ stepUp: stamp }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(env.core.status().ready, true);
  assert.equal(env.core.listParts({}, m).ok, true);
});

test('F36 results are plain data: no function or live reference escapes', () => {
  const env = makeEnv();
  buildStandard(env);
  const r = env.core.listParts({}, env.manager());
  const text = JSON.stringify(r);
  assert.ok(text.length > 100);
  const row = r.rows[0];
  assert.throws(() => { 'use strict'; row.flags.battery = false; }, TypeError);
  const jp = env.core.jobParts('JOB-1', env.manager());
  jp.rows[0].issues.push({ x: 1 });
  assert.equal(env.core.jobParts('JOB-1', env.manager()).rows[0].issues.length, 1);
});

test('F37 tax-details filter and total, movement flag and history fields on part rows (requests of the masters screen)', () => {
  const env = makeEnv();
  buildStandard(env);
  const m = env.manager();
  env.core.savePart({ code: 'T-OK', name: 'Complete part', group: 'Misc', unit: 'pc', hsn: '9113', gstRateBp: 1800, sellPricePaise: 100, priceIncludesTax: true }, m);
  const all = env.core.listParts({}, m);
  assert.equal(all.total, 4);
  assert.equal(all.taxPendingTotal, 3);
  const pending = env.core.listParts({ taxPending: 'true' }, m);
  assert.deepEqual(pending.rows.map((r) => r.code), ['P-ONE', 'P-THREE', 'P-TWO']);
  assert.equal(pending.total, 3);
  assert.equal(pending.taxPendingTotal, 3);
  assert.equal(pending.totals.pieces, 10);
  const done = env.core.listParts({ taxPending: 'false' }, m);
  assert.deepEqual(done.rows.map((r) => [r.code, r.taxPending, r.hsn, r.gstRateBp]), [['T-OK', false, '9113', 1800]]);
  assert.equal(done.taxPendingTotal, 3, 'the total ignores the tax filter itself');
  assert.equal(env.core.listParts({ taxPending: 'true', group: 'Glass' }, m).taxPendingTotal, 1);
  const one = all.rows.find((r) => r.code === 'P-ONE');
  const ok = all.rows.find((r) => r.code === 'T-OK');
  assert.equal(one.hasMovements, true);
  assert.equal(ok.hasMovements, false);
  assert.equal(one.createdBy, 'Test Manager (Store Manager)');
  assert.equal(typeof one.createdAt, 'string');
  assert.equal(one.deactivatedAt, '');
  const staff = env.core.listParts({}, env.staff()).rows[0];
  for (const k of ['createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deactivatedAt', 'deactivatedBy', 'deactivateReason']) assert.equal(staff[k], null, k);
  assert.equal(staff.hasMovements, true);
  env.core.setPartActive('T-OK', false, 'no longer sold', m);
  assert.equal(env.core.listParts({ active: 'false' }, m).rows[0].deactivateReason, 'no longer sold');
  env.core.saveLabour({ code: 'L-1', name: 'Fit strap', group: 'Labour', unit: 'job', ratePaise: 5000, priceIncludesTax: true }, m);
  env.core.saveLabour({ code: 'L-2', name: 'Fit glass', group: 'Labour', unit: 'job', sac: '9987', gstRateBp: 1800, ratePaise: 9000, priceIncludesTax: true }, m);
  const lab = env.core.listLabour({}, m);
  assert.equal(lab.total, 2);
  assert.equal(lab.taxPendingTotal, 1);
  assert.deepEqual(lab.rows.map((r) => [r.code, r.taxPending]), [['L-1', true], ['L-2', false]]);
  assert.deepEqual(env.core.listLabour({ taxPending: 'true' }, m).rows.map((r) => r.code), ['L-1']);
  assert.deepEqual(env.core.listLabour({ taxPending: 'false' }, m).rows.map((r) => r.code), ['L-2']);
});
