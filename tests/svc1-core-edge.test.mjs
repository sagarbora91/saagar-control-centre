// tests/svc1-core-edge.test.mjs
// Core facade: damaged ledgers, docs-style proposals, two screens on one storage, and size/speed measurements.
// Real store, FIFO and masters. The documents layer is the recording stand-in unless the test says "real docs".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  CoreLib, Store, Fifo, OWNER, MANAGER, STAFF, BROKEN, actorOf, makeEnv, makeAdapter, makeClock, makeFakeDocsLib, buildStandard, standardParts,
  kitPropose, kitOpening, kitReceipt, kitIssue, kitReverse, loadRealDocs, docsExists, openCase
} from './lib/svc1-core-kit.mjs';

const require = createRequire(import.meta.url);

test('E01 a ledger record whose movement does not follow from the FIFO rules makes every figure refuse, with the FIFO code', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 4, unitCostPaise: 100 }]);
  const op = kitOpening(env.kit, [{ partCode: 'P-ONE', qty: 4, unitCostPaise: 100 }], pid);
  assert.ok(op.no);
  // a second record, valid for the store (hash chain) but with a wrong value in its movement
  const bad = JSON.parse(JSON.stringify(op.movements[0]));
  bad.seq = 2;
  bad.id = 'MV00000002';
  bad.valuePaise = 999999;
  bad.newLayerId = 'MV00000002';
  const t = env.kit.store.nextAt('ledger');
  const head = env.kit.store.head('ledger');
  const res = env.kit.store.append('ledger', [{ k: 'GRN', series: 'GRN', b: { no: env.kit.store.nextNumber('GRN', t.at).no, docDate: '2026-11-01', note: '', supplierName: 'X', supplierInvoiceNo: '1', supplierInvoiceDate: '2026-10-30', lines: [{ partCode: 'P-ONE', qtyInvoiced: null, qtyReceived: 4, qtyShort: 0, unitCostPaise: 100 }], mv: [bad] } }],
  { expectRev: head.rev, actor: actorOf(OWNER), at: t.at });
  assert.equal(res.ok, true, JSON.stringify(res));
  const r = env.core.listParts({}, env.manager());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LEDGER_MISMATCH');
  assert.equal(env.core.jobHasParts('JOB-1').ok, false);
  const st = env.core.status();
  assert.equal(st.ready, false);
  assert.equal(st.integrity.code, 'LEDGER_MISMATCH');
  const rep = env.core.reportData('svcStockList', {}, env.manager());
  assert.equal(rep.ok, false);
  assert.equal(rep.code, 'CHAIN_BROKEN');
  assert.equal(rep.detail, 'LEDGER_MISMATCH');
});

test('E02 docs-style adjustment proposals (no stored line value) are valued now: shortage at the layers, excess at the latest cost', () => {
  const env = makeEnv();
  buildStandard(env);
  env.clock.set('2026-11-13T05:40:00.000Z');
  const pid = kitPropose(env.kit, 'ADJ', [
    { partCode: 'P-ONE', qtyDelta: -2, reason: 'LOST', unitCostPaise: null },
    { partCode: 'P-THREE', qtyDelta: 1, reason: 'FOUND', unitCostPaise: null }
  ], { valuePaise: 3100 });
  const row = env.core.listAdjustments({ state: 'PROPOSED' }, env.manager()).rows.find((r) => r.proposalId === pid);
  assert.deepEqual(row.lines.map((l) => [l.partCode, l.qtyDelta, l.valuePaise]), [['P-ONE', -2, 2400], ['P-THREE', 1, 700]]);
  assert.equal(row.valuePaise, 3100);
  assert.equal(row.reasonClass, 'WRITEOFF');
  assert.equal(row.needsOwner, true);
  const reg = env.core.reportData('svcAdjustmentRegister', {}, env.manager());
  const mine = reg.awaiting.filter((a) => a.adjNo === pid);
  assert.deepEqual(mine.map((a) => [a.partCode, a.valueEffectPaise, a.reasonLabel]), [['P-ONE', -2400, 'Lost'], ['P-THREE', 700, 'Found']]);
  const staff = env.core.listAdjustments({ state: 'PROPOSED' }, env.staff()).rows.find((r) => r.proposalId === pid);
  assert.deepEqual(staff.lines.map((l) => l.valuePaise), [null, null]);
  assert.equal(staff.valuePaise, null);
});

test('E03 two screens on one storage: a write on one is seen by the other, and a write after a stale read does not fail', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const mk = () => CoreLib.create({ adapter, now: clock.now, cases: { get: () => null }, libs: { docs: makeFakeDocsLib() }, storeOptions: { watermark: false } }).core;
  const a = mk();
  const b = mk();
  const m = { session: MANAGER };
  const part = (code) => ({ code, name: 'Part ' + code, group: 'G', unit: 'pc', sellPricePaise: 0, priceIncludesTax: null });
  assert.equal(a.savePart(part('A-1'), m).ok, true);
  assert.equal(b.listParts({}, m).total, 1, 'b opens lazily and sees A-1');
  assert.equal(a.savePart(part('A-2'), m).ok, true);
  clock.advance(1000);
  assert.equal(b.savePart(part('B-1'), m).ok, true, 'b was stale; the core reopens before the write');
  assert.deepEqual(a.listParts({}, m).rows.map((r) => r.code), ['A-1', 'A-2', 'B-1']);
  assert.deepEqual(b.listParts({}, m).rows.map((r) => r.code), ['A-1', 'A-2', 'B-1']);
});

test('E04 a retry with the same client reference after a lost reply writes once (masters)', () => {
  const env = makeEnv();
  const ctx = env.manager({ clientRef: 'svs-lost-reply-1' });
  const part = { code: 'R-1', name: 'Retry part', group: 'G', unit: 'pc', sellPricePaise: 0, priceIncludesTax: null };
  const first = env.core.savePart(part, ctx);
  assert.equal(first.ok, true);
  const before = env.adapter.setCount;
  const again = env.core.savePart(part, ctx);
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.replayed, true);
  assert.equal(env.adapter.setCount, before, 'nothing was written twice');
  assert.equal(env.core.listParts({}, env.manager()).total, 1);
});

test('E05 a caller cannot widen its rights with extra ctx fields, a forged session object, or an inherited flag', () => {
  const env = makeEnv();
  buildStandard(env);
  const forged = Object.create(OWNER);
  assert.equal(env.core.ledger('P-ONE', {}, { session: forged }).code, 'SESSION_REQUIRED');
  const staffPlus = { session: STAFF, isOwner: true, tier: 'owner', stepUp: { ok: true, at: env.clock.ms } };
  assert.equal(env.core.ledger('P-ONE', {}, staffPlus).code, 'ROLE_DENIED');
  assert.equal(env.core.removePart('P-ONE', 'reason text', staffPlus).code, 'ROLE_DENIED');
  const flipping = { get session() { return env.cases ? STAFF : OWNER; } };
  assert.equal(env.core.listParts({}, flipping).rows[0].valuePaise, null);
  let reads = 0;
  const twoFaced = { ok: true, tier: 'manager', get isManager() { reads += 1; return reads === 1; }, isOwner: false, role: 'Store Manager', actorName: 'x' };
  const r = env.core.ledger('P-ONE', {}, { session: twoFaced });
  assert.equal(r.ok, true);
  assert.ok(reads <= 2, 'the session is read once and copied');
});

test('E06 hostile input to the reads never throws and never leaks', () => {
  const env = makeEnv();
  buildStandard(env);
  const m = env.manager();
  const hostile = [null, undefined, 0, -1, NaN, 'x', {}, [], () => 1, { toString() { throw new Error('boom'); } }, { text: { toString() { throw new Error('boom'); } } }, { offset: 1e308, limit: -5 }];
  for (const q of hostile) {
    for (const call of [
      () => env.core.listParts(q, m), () => env.core.listLabour(q, m), () => env.core.listReceipts(q, m), () => env.core.listCounterSales(q, m),
      () => env.core.listAdjustments(q, m), () => env.core.listOldParts(q, m), () => env.core.ledger('P-ONE', q, m), () => env.core.getDoc(q, m),
      () => env.core.getPart(q, m), () => env.core.jobParts(q, m), () => env.core.jobHasParts(q), () => env.core.reportData('svcStockList', q, m),
      () => env.core.reportData('svcPartLedger', q, m), () => env.core.reportData(q, q, m), () => env.core.oldPartNextStates(q),
      () => env.core.can(q, m.session), () => env.core.history(q, q, m), () => env.core.planBulk(q, q, m), () => env.core.commitBulk(q, m),
      () => env.core.savePart(q, m), () => env.core.removePart(q, q, m), () => env.core.acknowledgeRestore(q, m)
    ]) {
      let r;
      assert.doesNotThrow(() => { r = call(); });
      assert.ok(r === undefined || typeof r === 'object' || Array.isArray(r) || typeof r === 'boolean');
    }
  }
  assert.equal(env.core.status().ready, true);
});

test('E07 size and speed: 3,000 parts and 20,000 movements (desktop timings, printed)', () => {
  const clock = makeClock('2026-11-13T05:30:00.000Z');
  const adapter = makeAdapter();
  const created = CoreLib.create({ adapter, now: clock.now, cases: { get: () => null }, libs: { docs: makeFakeDocsLib() }, storeOptions: { watermark: false } });
  const core = created.core;
  const m = { session: MANAGER };
  // 3,000 parts through the bulk path (200 rows a time)
  const header = 'code\tname\tgroup\tunit\thsn\tgst_rate\tsell_price\tprice_includes_tax\treorder_level\treorder_qty\tbin\tflags';
  let t0 = process.hrtime.bigint();
  for (let b = 0; b < 15; b++) {
    const rows = [header];
    for (let i = 0; i < 200; i++) {
      const n = b * 200 + i + 1;
      rows.push(['PERF-' + String(n).padStart(4, '0'), 'Perf part ' + n, 'G' + (n % 10), 'pc', '', '', '10.00', 'yes', String(n % 7), '5', 'A' + (n % 9), ''].join('\t'));
    }
    const plan = core.planBulk('part', rows.join('\n'), m);
    assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
    clock.advance(1000);
    assert.equal(core.commitBulk(plan, m).ok, true);
  }
  const msParts = Number(process.hrtime.bigint() - t0) / 1e6;
  // 20,000 movements: 200 receipts of 100 lines, written straight to the store with one running FIFO state
  const ks = Store.createStore(adapter, { now: clock.now, watermark: false }).store;
  let state = Fifo.emptyState();
  let seqCount = 0;
  t0 = process.hrtime.bigint();
  for (let d = 0; d < 200; d++) {
    clock.advance(60000);
    const at = ks.nextAt('ledger').at;
    const no = ks.nextNumber('GRN', at).no;
    const mv = [];
    const lines = [];
    for (let l = 0; l < 100; l++) {
      const idx = (d * 100 + l) % 3000 + 1;
      const code = 'PERF-' + String(idx).padStart(4, '0');
      const p = Fifo.planReceipt(state, { partCode: code, qty: 3, unitCostPaise: 1000 + l, at, ref: { grnNo: no, lineNo: l + 1 } }, { session: OWNER, reauth: false });
      assert.equal(p.ok, true, JSON.stringify(p));
      assert.equal(Fifo.applyMovement(state, p.movement).ok, true);
      mv.push(p.movement);
      lines.push({ partCode: code, qtyInvoiced: null, qtyReceived: 3, qtyShort: 0, unitCostPaise: 1000 + l });
      seqCount += 1;
    }
    const head = ks.head('ledger');
    const res = ks.append('ledger', [{ k: 'GRN', series: 'GRN', b: { no, docDate: '2026-11-13', note: '', supplierName: 'S', supplierInvoiceNo: 'I' + d, supplierInvoiceDate: '2026-10-01', lines, mv } }],
      { expectRev: head.rev, actor: actorOf(OWNER), at });
    assert.equal(res.ok, true, JSON.stringify(res).slice(0, 300));
  }
  const msLedger = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(seqCount, 20000);
  // first read builds the view, later reads reuse it
  t0 = process.hrtime.bigint();
  const first = core.listParts({ limit: 50 }, m);
  const msFirst = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(first.ok, true, JSON.stringify(first).slice(0, 300));
  assert.equal(first.total, 3000);
  assert.equal(first.totals.pieces, 60000);
  t0 = process.hrtime.bigint();
  const second = core.listParts({ limit: 50, offset: 100 }, m);
  const msSecond = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(second.rows.length, 50);
  t0 = process.hrtime.bigint();
  const rep = core.reportData('svcStockList', {}, m);
  const msReport = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(rep.rows.length, 3000);
  t0 = process.hrtime.bigint();
  clock.advance(60000);
  const at = ks.nextAt('ledger').at;
  const no = ks.nextNumber('GRN', at).no;
  const p = Fifo.planReceipt(state, { partCode: 'PERF-0001', qty: 1, unitCostPaise: 5, at, ref: { grnNo: no, lineNo: 1 } }, { session: OWNER, reauth: false });
  Fifo.applyMovement(state, p.movement);
  ks.append('ledger', [{ k: 'GRN', series: 'GRN', b: { no, docDate: '2026-11-13', note: '', supplierName: 'S', supplierInvoiceNo: 'LAST', supplierInvoiceDate: '2026-10-01', lines: [{ partCode: 'PERF-0001', qtyInvoiced: null, qtyReceived: 1, qtyShort: 0, unitCostPaise: 5 }], mv: [p.movement] } }],
  { expectRev: ks.head('ledger').rev, actor: actorOf(OWNER), at });
  const grown = core.listParts({ limit: 1 }, m);
  const msGrow = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(grown.totals.pieces, 60001);
  console.log('PERF desktop ms: bulk create 3000 parts ' + msParts.toFixed(0) + ', write 20000 movements ' + msLedger.toFixed(0) +
    ', first list (view built) ' + msFirst.toFixed(0) + ', next list ' + msSecond.toFixed(1) + ', stock report 3000 rows ' + msReport.toFixed(0) +
    ', list after one new posting ' + msGrow.toFixed(0));
  assert.ok(msFirst < 4000, 'first list ' + msFirst);
  assert.ok(msSecond < 1000, 'next list ' + msSecond);
  assert.ok(msReport < 2000, 'report ' + msReport);
  assert.ok(msGrow < 1500, 'grow ' + msGrow);
  assert.ok(openCase('x').status === 'open');
});

test('E08 real docs: the core and the real documents layer agree on proposals, the PIN window and the revision check', { skip: docsExists() ? false : 'documents layer file not present' }, () => {
  const clock = makeClock('2026-11-13T05:30:00.000Z');
  const adapter = makeAdapter();
  const created = CoreLib.create({ adapter, now: clock.now, cases: { get: (id) => (id === 'JOB-1' ? openCase(id) : null) }, libs: { docs: loadRealDocs() }, storeOptions: { watermark: false } });
  assert.equal(created.ok, true, JSON.stringify(created));
  const c = created.core;
  const own = (extra) => Object.assign({ session: OWNER, stepUp: { ok: true, at: clock.ms } }, extra || {});
  const mgr = (extra) => Object.assign({ session: MANAGER }, extra || {});
  assert.equal(c.savePart({ code: 'P-1', name: 'Part one', group: 'G', unit: 'pc', sellPricePaise: 1000, priceIncludesTax: true, flags: { counterSaleable: true } }, mgr()).ok, true);
  const prop = c.proposeOpening({ lines: [{ partCode: 'P-1', qty: 5, unitCostPaise: 200 }], note: 'start' }, mgr({ clientRef: 'real-open-1' }));
  assert.equal(prop.ok, true, JSON.stringify(prop));
  assert.equal(c.listOpening(mgr()).rows[0].state, 'PROPOSED');
  assert.equal(c.approveOpening(prop.proposalId, mgr()).ok, false);
  assert.equal(c.approveOpening(prop.proposalId, { session: OWNER }).code, 'PIN_REQUIRED');
  const done = c.approveOpening(prop.proposalId, own());
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(c.listOpening(mgr()).rows[0].state, 'POSTED');
  assert.equal(c.getPart('P-1', mgr()).part.onHand, 5);
  clock.advance(60000);
  const issue = c.issueToJob({ jobId: 'JOB-1', lines: [{ partCode: 'P-1', qty: 2 }] }, mgr({ clientRef: 'real-issue-1' }));
  assert.equal(issue.ok, true, JSON.stringify(issue));
  assert.deepEqual(c.jobHasParts('JOB-1'), { ok: true, has: true });
  const again = c.issueToJob({ jobId: 'JOB-1', lines: [{ partCode: 'P-1', qty: 2 }] }, mgr({ clientRef: 'real-issue-1' }));
  assert.equal(again.ok, true);
  assert.equal(c.getPart('P-1', mgr()).part.onHand, 3, 'the same client reference posted once');
  assert.equal(c.jobParts('JOB-1', mgr()).rows[0].issues[0].outstanding, 2);
  const over = c.issueToJob({ jobId: 'JOB-1', lines: [{ partCode: 'P-1', qty: 9 }] }, mgr());
  assert.equal(over.ok, false);
  assert.equal(over.code, 'INSUFFICIENT_STOCK');
  assert.equal(c.getPart('P-1', mgr()).part.onHand, 3);
  const old = c.removePart('P-1', 'wrong code entered', own());
  assert.equal(old.code, 'HAS_MOVEMENTS');
  const can = c.can('OPENING_APPROVE', OWNER);
  assert.deepEqual([can.ok, can.needsPin], [true, true]);
  assert.equal(c.can('OPENING_APPROVE', MANAGER).ok, false);
  assert.equal(c.settings().adjustLimitPaise, 0);
});

test('E09 real docs: the core never reopens after its own writes (only after a write by another screen)', { skip: docsExists() ? false : 'documents layer file not present' }, () => {
  const real = loadRealDocs();
  let opens = 0;
  const counting = {
    version: real.version,
    create(deps) {
      const api = real.create(deps);
      const copy = Object.assign({}, api);
      copy.open = () => { opens += 1; return api.open(); };
      return copy;
    }
  };
  const clock = makeClock('2026-11-13T05:30:00.000Z');
  const adapter = makeAdapter();
  const c = CoreLib.create({ adapter, now: clock.now, cases: { get: (id) => openCase(id) }, libs: { docs: counting }, storeOptions: { watermark: false } }).core;
  const m = { session: MANAGER };
  const o = { session: OWNER, stepUp: { ok: true, at: clock.ms } };
  assert.equal(c.savePart({ code: 'W-1', name: 'W one', group: 'G', unit: 'pc', sellPricePaise: 0, priceIncludesTax: null }, m).ok, true);
  assert.equal(opens, 1);
  const prop = c.proposeOpening({ lines: [{ partCode: 'W-1', qty: 4, unitCostPaise: 300 }], note: 'x' }, m);
  assert.equal(c.approveOpening(prop.proposalId, o).ok, true);
  clock.advance(1000);
  assert.equal(c.issueToJob({ jobId: 'JOB-5', lines: [{ partCode: 'W-1', qty: 1 }] }, m).ok, true);
  assert.equal(c.listParts({}, m).rows[0].onHand, 3);
  assert.equal(c.jobHasParts('JOB-5').has, true);
  assert.equal(c.reportData('svcStockList', {}, m).ok, true);
  assert.equal(opens, 1, 'one open for the whole session of own writes');
  // another screen writes
  const other = CoreLib.create({ adapter, now: clock.now, cases: { get: (id) => openCase(id) }, libs: { docs: real }, storeOptions: { watermark: false } }).core;
  clock.advance(1000);
  assert.equal(other.savePart({ code: 'W-2', name: 'W two', group: 'G', unit: 'pc', sellPricePaise: 0, priceIncludesTax: null }, m).ok, true);
  assert.equal(c.listParts({}, m).total, 2);
  assert.equal(opens, 2);
});

test('E10 an adapter without a write function is refused by the store layer, with its code', () => {
  const clock = makeClock();
  const r = CoreLib.create({ adapter: { getItem() { return null; } }, now: clock.now, cases: { get: () => null }, libs: { docs: makeFakeDocsLib() } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SVCS_ARGS_INVALID');
});

test('E11 the ledger view grows by only the new records (the FIFO engine is not asked to replay what it already knows)', () => {
  let applied = 0;
  const countingFifo = Object.assign({}, Fifo, { applyMovement: (state, mv) => { applied += 1; return Fifo.applyMovement(state, mv); } });
  const clock = makeClock();
  const adapter = makeAdapter();
  const created = CoreLib.create({ adapter, now: clock.now, cases: { get: () => null }, libs: { docs: makeFakeDocsLib(), fifo: countingFifo }, storeOptions: { watermark: false } });
  assert.equal(created.ok, true);
  // build the history on the counting core's own storage through a second store object (the kit)
  const kitStore = Store.createStore(adapter, { now: clock.now, watermark: false }).store;
  const e2 = { clock, kit: { store: kitStore, clock }, core: created.core, manager: () => ({ session: MANAGER }) };
  standardParts(e2, e2.manager());
  const pid = kitPropose(e2.kit, 'OPN', [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }]);
  clock.advance(1000);
  kitOpening(e2.kit, [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }], pid);
  assert.equal(created.core.listParts({}, { session: MANAGER }).totals.pieces, 10);
  const afterFirst = applied;
  assert.ok(afterFirst >= 1);
  created.core.listParts({}, { session: MANAGER });
  created.core.status();
  assert.equal(applied, afterFirst, 'reading again applies nothing');
  clock.advance(60000);
  // the opening is once per part: use a second part
  const pid2 = kitPropose(e2.kit, 'OPN', [{ partCode: 'P-TWO', qty: 3, unitCostPaise: 100 }]);
  clock.advance(1000);
  kitOpening(e2.kit, [{ partCode: 'P-TWO', qty: 3, unitCostPaise: 100 }], pid2);
  assert.equal(created.core.listParts({}, { session: MANAGER }).totals.pieces, 13);
  assert.equal(applied, afterFirst + 1, 'only the one new movement was applied');
});

test('E12 a restored history of the same length but different content is not served from the old view', () => {
  const build = (qty) => {
    const env = makeEnv();
    standardParts(env, env.manager());
    env.clock.set('2026-11-01T06:00:00.000Z');
    const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }]);
    kitOpening(env.kit, [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }], pid);
    env.clock.set('2026-11-03T06:00:00.000Z');
    kitReceipt(env.kit, 'INV-X', [{ partCode: 'P-ONE', qtyReceived: qty, unitCostPaise: 1200 }]);
    return env;
  };
  const a = build(5);
  const b = build(7);
  assert.equal(a.core.listParts({}, a.manager()).totals.pieces, 15);
  for (const k of a.adapter.svcsKeys()) a.adapter.data.delete(k);
  for (const k of b.adapter.svcsKeys()) a.adapter.data.set(k, b.adapter.data.get(k));
  a.core.reopen();
  assert.equal(a.core.listParts({}, a.manager()).totals.pieces, 17);
  assert.equal(a.core.listParts({}, a.manager()).rows[0].valuePaise, 10000 + 7 * 1200);
});

test('E13 a reversed issue leaves the job and the delete guard (ledger level)', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }]);
  kitOpening(env.kit, [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }], pid);
  env.clock.set('2026-11-02T06:00:00.000Z');
  const iss = kitIssue(env.kit, 'JOB-8', [{ partCode: 'P-ONE', qty: 2 }]);
  env.clock.set('2026-11-02T07:00:00.000Z');
  const iss2 = kitIssue(env.kit, 'JOB-8', [{ partCode: 'P-ONE', qty: 1 }]);
  assert.deepEqual(env.core.jobHasParts('JOB-8'), { ok: true, has: true });
  assert.equal(env.core.jobParts('JOB-8', env.manager()).rows[0].issues.length, 2);
  env.clock.set('2026-11-03T06:00:00.000Z');
  kitReverse(env.kit, iss.no, 'issued to the wrong job');
  const mid = env.core.jobParts('JOB-8', env.manager());
  assert.deepEqual(mid.rows[0].issues.map((i) => [i.docNo, i.qty, i.outstanding]), [[iss2.no, 1, 1]]);
  assert.equal(mid.totalNet, 1);
  assert.equal(mid.rows[0].issued, 1);
  assert.deepEqual(env.core.jobHasParts('JOB-8'), { ok: true, has: true });
  env.clock.set('2026-11-03T07:00:00.000Z');
  kitReverse(env.kit, iss2.no, 'issued to the wrong job as well');
  assert.deepEqual(env.core.jobHasParts('JOB-8'), { ok: true, has: false });
  const jp = env.core.jobParts('JOB-8', env.manager());
  assert.deepEqual(jp.rows, []);
  assert.equal(jp.totalNet, 0);
  assert.equal(env.core.listParts({}, env.manager()).rows[0].onHand, 10);
});

test('E14 real docs: core.can gives the same ok and needsPin as the docs role table for every action and session', { skip: docsExists() ? false : 'documents layer file not present' }, () => {
  const real = loadRealDocs();
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = Store.createStore(adapter, { now: clock.now, watermark: false }).store;
  const Masters = require('../www/service-stores-masters.js');
  const api = real.create({ store, fifo: Fifo, masters: Masters, now: clock.now, cases: { get: () => null } });
  assert.equal(api.ok, true);
  const created = CoreLib.create({ adapter, now: clock.now, cases: { get: () => null }, libs: { docs: real }, storeOptions: { watermark: false } });
  const core = created.core;
  const storeClass = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Technician', tier: 'staff', actorName: 'Tech' });
  const sessions = [OWNER, MANAGER, STAFF, storeClass, BROKEN];
  const names = real.ACTIONS.concat(['OPENING_REJECT', 'ADJUST_REJECT', 'REVERSE_CSL', 'MASTER_EDIT', 'MASTER_REMOVE', 'RESTORE_ACK', 'VIEW_QTY', 'VIEW_LEDGER']);
  const alias = { MASTER_EDIT: 'MASTERS_EDIT', MASTER_REMOVE: 'MASTERS_REMOVE', RESTORE_ACK: 'ACK_RESTORE', VIEW_QTY: 'VIEW', VIEW_LEDGER: 'VIEW_COST' };
  let compared = 0;
  for (const name of names) {
    for (const s of sessions) {
      const mine = core.can(name, s);
      const theirs = api.can(alias[name] || name, s);
      assert.equal(mine.ok, theirs.ok, name + ' ' + s.role);
      assert.equal(mine.needsPin, theirs.needsPin, name + ' ' + s.role);
      compared += 1;
    }
  }
  assert.ok(compared >= 28 * 5);
});

test('E15 real docs: store roles named in Settings are known to core.can on a fresh core without any other call first', { skip: docsExists() ? false : 'documents layer file not present' }, () => {
  const real = loadRealDocs();
  const clock = makeClock();
  const adapter = makeAdapter();
  const mk = () => CoreLib.create({ adapter, now: clock.now, cases: { get: () => null }, libs: { docs: real }, storeOptions: { watermark: false } }).core;
  const first = mk();
  const tech = { ok: true, isOwner: false, isManager: false, role: 'Technician', tier: 'staff', actorName: 'Tech' };
  assert.equal(first.can('RECEIVE', tech).ok, false, 'no store roles yet');
  const set = first.setConfig({ adjustLimitPaise: 50000, storeRoles: ['Technician'] }, { session: OWNER, stepUp: { ok: true, at: clock.ms } });
  assert.equal(set.ok, true, JSON.stringify(set));
  const fresh = mk();
  assert.equal(fresh.can('RECEIVE', tech).ok, true, 'a fresh core opens by itself to read the settings');
  assert.equal(fresh.can('RECEIVE', { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Cash' }).ok, false, 'a role not named stays out');
  assert.equal(fresh.can('ADJUST_APPROVE', MANAGER).ok, true, 'limit above zero lets the Store Manager approve within it');
  assert.equal(fresh.settings().adjustLimitPaise, 50000);
  const off = mk();
  adapter.auth = false;
  assert.equal(off.can('RECEIVE', tech).ok, false, 'storage not ready: no settings, no store role');
  assert.equal(off.can('VIEW', tech).ok, true);
});

test('E16 audit: a write takes ctx only from its fixed position, and the docs layer only ever gets the ctx the core built', () => {
  const env = makeEnv();
  const forgedNow = () => new Date(1);
  const calls = env.docsLib.calls;
  // an extra trailing argument: the staff ctx in the ctx position is the one checked, the Owner ctx after it is ignored
  const r1 = env.core.approveAdjustment('DOC-000001', { session: STAFF, now: forgedNow, stepUp: { ok: true, at: 1 }, clientRef: 'ref-e16-1' }, env.owner({ clientRef: 'ref-e16-2' }));
  assert.equal(r1.ok, true, JSON.stringify(r1));
  const c1 = calls.filter((c) => c.method === 'approveAdjustment');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].args.length, 2, 'exactly the declared arguments plus ctx');
  assert.equal(c1[0].args[0], 'DOC-000001');
  assert.equal(c1[0].args[1].session.tier, 'staff', 'the ctx in the declared position is the one used');
  assert.notEqual(c1[0].args[1].now, forgedNow, 'the core clock, never the caller clock');
  assert.ok(Object.isFrozen(c1[0].args[1].session), 'a plain frozen copy of the session');
  // a missing argument: the ctx is not found in the wrong position, nothing reaches the docs layer
  const before = calls.length;
  const r2 = env.core.rejectOpening('DOC-000001', env.owner({ clientRef: 'ref-e16-3' }));
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'SESSION_REQUIRED');
  const r3 = env.core.moveOldPart('OLD/26-27/0001', env.manager({ clientRef: 'ref-e16-4' }));
  assert.equal(r3.code, 'SESSION_REQUIRED');
  assert.equal(calls.length, before, 'no docs call for a misplaced ctx');
  // the normal shapes still pass through with every argument
  const r4 = env.core.reverseDoc('GRN/26-27/0001', 'wrong supplier', env.owner({ clientRef: 'ref-e16-5' }));
  assert.equal(r4.ok, true);
  const c4 = calls.filter((c) => c.method === 'reverseDoc');
  assert.deepEqual([c4[0].args.length, c4[0].args[0], c4[0].args[1]], [3, 'GRN/26-27/0001', 'wrong supplier']);
  assert.equal(c4[0].args[2].session.tier, 'owner');
});

test('E17 audit: when the head cannot be read the core reopens instead of answering from memory (delete guard fails closed)', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const pid = kitPropose(env.kit, 'OPN', [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }]);
  kitOpening(env.kit, [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }], pid);
  assert.deepEqual(env.core.jobHasParts('JOB-9'), { ok: true, has: false });
  // another screen issues to JOB-9, then the head row becomes unreadable
  env.clock.set('2026-11-02T06:00:00.000Z');
  kitIssue(env.kit, 'JOB-9', [{ partCode: 'P-ONE', qty: 2 }]);
  env.adapter.data.set(Store.HEAD_KEY, '{not json');
  const r = env.core.jobHasParts('JOB-9');
  assert.notDeepEqual(r, { ok: true, has: false }, 'a stale "no parts" answer would let the job be deleted: ' + JSON.stringify(r));
  if (r.ok === true) assert.equal(r.has, true);
});

test('E18 audit: changing a returned old-part row does not change the register', () => {
  const env = makeEnv();
  standardParts(env, env.manager());
  env.clock.set('2026-11-01T06:00:00.000Z');
  const at = env.kit.store.nextAt('defective');
  const no = env.kit.store.nextNumber('OLD', at.at).no;
  const head = env.kit.store.head('defective');
  const w = env.kit.store.append('defective', [{ k: 'OLD_REGISTER', series: 'OLD', b: { no, jobId: 'JOB-1', partCode: 'P-ONE', partText: '', qty: 1, serialRef: '', state: 'HELD_FOR_CLAIM', claimRef: 'CLM-1', note: 'old cell' } }],
    { expectRev: head.rev, actor: actorOf(MANAGER), at: at.at });
  assert.equal(w.ok, true, JSON.stringify(w));
  const a = env.core.listOldParts({}, env.manager());
  assert.equal(a.rows[0].history[0].to, 'HELD_FOR_CLAIM');
  try { a.rows[0].history[0].to = 'SCRAPPED'; } catch (e) { /* frozen is fine too */ }
  try { a.rows[0].history.push({ to: 'SCRAPPED' }); } catch (e) { /* frozen is fine too */ }
  const b = env.core.listOldParts({}, env.manager());
  assert.equal(b.rows[0].history.length, 1);
  assert.equal(b.rows[0].history[0].to, 'HELD_FOR_CLAIM');
  assert.equal(b.rows[0].state, 'HELD_FOR_CLAIM');
});
