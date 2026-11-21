// Service Stores docs layer: failed writes, blocked stores, forged records, restore fence, a second screen,
// and a seeded property test of random postings through the REAL store and FIFO.
// Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Docs, Fifo, Store, Masters, makeEnv, makeAdapter, expectFail, expectOk, unchanged, OWNER, MANAGER, MANAGER2, KEEPER, CASHIER
} from './lib/svc1-docs-env.mjs';

const ledger = (env) => env.store.read('ledger').records;
const stdLine = (partCode, extra = {}) => ({ partCode, qtyReceived: 10, unitCostPaise: 1000, ...extra });
const inv = (n) => ({ supplierInvoiceNo: 'INV-' + n, supplierInvoiceDate: '2026-11-10' });

function sameBooks(a, b) {
  assert.deepEqual(Fifo.exportState(a.fifoState()), Fifo.exportState(b.fifoState()));
  assert.deepEqual(a.listDocs().docs.map((d) => d.id), b.listDocs().docs.map((d) => d.id));
  assert.deepEqual(a.listProposals().proposals.map((p) => [p.id, p.state]), b.listProposals().proposals.map((p) => [p.id, p.state]));
  assert.deepEqual(a.oldRegister().rows.map((r) => [r.no, r.state]), b.oldRegister().rows.map((r) => [r.no, r.state]));
}

test('a failed shard write: nothing changes in storage or in memory, a retry posts once', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2', 'P-3'], saleable: ['P-2'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 30 }), stdLine('P-2', { qtyReceived: 30 })]);
  const iss = env.issue('WS-1', [{ partCode: 'P-1', qty: 5 }]);
  const prop = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)));
  const ops = [
    ['receive', () => env.docs.receiveGoods({ ...inv('F-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER, { clientRef: 'svs-f-1' }))],
    ['issue', () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER, { clientRef: 'svs-f-2' }))],
    ['return', () => env.docs.returnFromJob({ jobId: 'WS-1', lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, env.ctx(MANAGER, { clientRef: 'svs-f-3' }))],
    ['sale', () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 5 }] }, env.ctx(MANAGER, { clientRef: 'svs-f-4' }))],
    ['propose', () => env.docs.proposeOpening({ lines: [{ partCode: 'P-3', qty: 1, unitCostPaise: 5 }] }, env.ctx(MANAGER, { clientRef: 'svs-f-5' }))],
    ['approve adjustment', () => env.docs.approveAdjustment(prop.proposalId, env.ctxPin(OWNER, { clientRef: 'svs-f-6' }))],
    ['old part', () => env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old', qty: 1, state: 'HELD_FOR_CLAIM' }, env.ctx(MANAGER, { clientRef: 'svs-f-7' }))],
    ['settings', () => env.docs.setConfig({ adjustLimitPaise: 77 }, env.ctxPin(OWNER, { clientRef: 'svs-f-8' }))]
  ];
  for (const [name, fn] of ops) {
    const reference = env.reopen();
    const seq = env.docs.status().lastSeq;
    env.adapter.failNext = 1;
    const r = unchanged(env, fn);
    expectFail(r, 'SVCS_WRITE_FAILED');
    assert.equal(env.docs.status().blocked, false, name);
    assert.equal(env.docs.status().lastSeq, seq, name);
    sameBooks(env.docs, reference);
    const ok = expectOk(fn());
    assert.equal(ok.replayed, undefined, name + ': the failed attempt left nothing, so this one is a real post');
  }
  // every ref now appears exactly once
  for (let i = 1; i <= 4; i++) assert.equal(ledger(env).filter((r) => r.r === 'svs-f-' + i).length, 1);
  sameBooks(env.docs, env.reopen());
});

test('a lost head row: the record is saved, the call says so, and a retry with the same clientRef finds it', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  env.adapter.failNext = 1;
  env.adapter.failMatch = /head/;
  const ctx = env.ctx(MANAGER, { clientRef: 'svs-head-1' });
  const r = expectFail(env.docs.receiveGoods({ ...inv('H-1'), lines: [stdLine('P-1', { qtyReceived: 2 })] }, ctx), 'SVCS_HEAD_WRITE_FAILED');
  assert.equal(r.committed, true);
  assert.match(r.message, /Could not confirm the save/);
  assert.equal(env.docs.status().blocked, false);
  const again = expectOk(env.docs.receiveGoods({ ...inv('H-1'), lines: [stdLine('P-1', { qtyReceived: 2 })] }, ctx));
  assert.equal(again.replayed, true);
  assert.equal(ledger(env).filter((x) => x.r === 'svs-head-1').length, 1);
  assert.equal(env.onHand('P-1'), 12);
  sameBooks(env.docs, env.reopen());
});

test('storage not ready: every call answers with a code and writes nothing', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  env.adapter.auth = false;
  const r = unchanged(env, () => env.docs.receiveGoods({ ...inv('N-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
  expectFail(r, 'SVCS_STORAGE_UNAVAILABLE');
  expectFail(unchanged(env, () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER))), 'SVCS_STORAGE_UNAVAILABLE');
  env.adapter.auth = true;
  expectOk(env.docs.receiveGoods({ ...inv('N-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
});

test('a damaged shard blocks everything; nothing posts; fixing the storage and reopening unblocks', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  const key = env.adapter.keys().filter((k) => /ledger_v1/.test(k))[0];
  const good = env.adapter.data.get(key);
  env.adapter.data.set(key, good.slice(0, 50) + 'X' + good.slice(51));
  const o = env.docs.open();
  assert.equal(o.ok, true);
  assert.equal(o.blocked, true);
  assert.ok(o.problems.length > 0);
  const calls = [
    () => env.docs.receiveGoods({ ...inv('B-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)),
    () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER)),
    () => env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)),
    () => env.docs.registerOldPart({ jobId: 'WS-1', partText: 'x', qty: 1, state: 'HELD_FOR_CLAIM' }, env.ctx(MANAGER)),
    () => env.docs.setConfig({ adjustLimitPaise: 5 }, env.ctxPin(OWNER)),
    () => env.docs.listDocs(), () => env.docs.getDoc('GRN/26-27/0001'), () => env.docs.jobStock('WS-1'), () => env.docs.pending(),
    () => env.docs.oldRegister(), () => env.docs.fifoState(), () => env.docs.movements()
  ];
  for (const fn of calls) expectFail(unchanged(env, fn), 'SVCS_BLOCKED');
  assert.equal(env.docs.status().blocked, true);
  assert.equal(env.docs.hasMovements('P-1'), true, 'a blocked store answers "has movements" so nothing can be removed');
  assert.equal(env.docs.isReferenced('part', 'P-1'), true);
  assert.equal(env.docs.config().ok, false);
  assert.equal(env.docs.config().adjustLimitPaise, 0);
  assert.equal(env.docs.can('VIEW', OWNER).ok, true);
  env.adapter.data.set(key, good);
  assert.equal(env.docs.open().blocked, false);
  expectOk(env.docs.receiveGoods({ ...inv('B-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
});

// A record with a valid hash chain but a lie inside: written through the real store on purpose.
function forge(env, k, bodyFn, series = 'GRN') {
  const t = env.store.nextAt('ledger');
  const n = env.store.nextNumber(series, t.at);
  const body = bodyFn(n.no, t.at);
  const h = env.store.head('ledger');
  const res = env.store.append('ledger', [{ k, series, b: { no: n.no, ...body } }], { expectRev: h.rev, actor: { t: 'manager', r: 'Store Manager', m: 'Forger' }, at: t.at });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}

test('forged records with a valid hash chain still block the books: wrong value, wrong shape, wrong number, wrong type', () => {
  const makeBase = () => {
    const env = makeEnv({ parts: ['P-1'] });
    env.clock.advance(1000);
    const g = env.grn([stdLine('P-1')]);
    return { env, g };
  };
  const cases = {
    'a movement value changed by one paisa': (g) => (no) => {
      const mv = JSON.parse(JSON.stringify(g.doc.mv[0]));
      mv.id = 'MV00000002'; mv.seq = 2; mv.newLayerId = 'MV00000002'; mv.ref = { grnNo: no, lineNo: 1 }; mv.valuePaise += 1;
      return { docDate: '2026-11-13', note: '', lines: [{ partCode: 'P-1', qtyReceived: 10 }], mv: [mv], supplierName: 'Titan', supplierInvoiceNo: 'Z', supplierInvoiceDate: '2026-11-10' };
    },
    'no movements at all': () => () => ({ docDate: '2026-11-13', note: '', lines: [], mv: [] }),
    'lines and movements differ in number': (g) => () => ({ docDate: '2026-11-13', note: '', lines: [{ partCode: 'P-1' }, { partCode: 'P-1' }], mv: [g.doc.mv[0]] }),
    'movement not tied to the number': (g) => () => ({ docDate: '2026-11-13', note: '', lines: [{ partCode: 'P-1' }], mv: [g.doc.mv[0]] }),
    'a movement of the wrong type for the kind': (g) => (no) => {
      const mv = JSON.parse(JSON.stringify(g.doc.mv[0]));
      mv.type = 'issue_job'; mv.id = 'MV00000002'; mv.seq = 2; mv.ref = { grnNo: no, lineNo: 1, jobId: 'WS-1' };
      return { docDate: '2026-11-13', note: '', lines: [{ partCode: 'P-1' }], mv: [mv] };
    },
    'a repeated movement sequence': (g) => (no) => {
      const mv = JSON.parse(JSON.stringify(g.doc.mv[0]));
      mv.ref = { grnNo: no, lineNo: 1 };
      return { docDate: '2026-11-13', note: '', lines: [{ partCode: 'P-1' }], mv: [mv] };
    }
  };
  for (const [name, make] of Object.entries(cases)) {
    const { env, g } = makeBase();
    forge(env, 'GRN', make(g));
    const o = env.docs.open();
    assert.equal(o.ok, true, name);
    assert.equal(o.blocked, true, name);
    assert.ok(o.problems.some((p) => p.code === 'SVCS_FIFO_MISMATCH' && p.stream === 'ledger'), name + ' ' + JSON.stringify(o.problems));
    expectFail(unchanged(env, () => env.docs.receiveGoods({ ...inv('Q-9'), lines: [stdLine('P-1')] }, env.ctx(MANAGER))), 'SVCS_BLOCKED');
  }
  // an unknown record kind in the ledger blocks too
  const { env } = makeBase();
  const t = env.store.nextAt('ledger');
  const h = env.store.head('ledger');
  assert.equal(env.store.append('ledger', [{ k: 'MYSTERY', b: { lines: [], mv: [] } }], { expectRev: h.rev, actor: { t: 'manager', r: 'x', m: 'y' }, at: t.at }).ok, true);
  assert.equal(env.docs.open().blocked, true);
});

test('restore fence: an older backup blocks the books until the Owner acknowledges', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  const old = new Map(env.adapter.data);
  env.clock.advance(60000);
  env.grn([stdLine('P-1', { qtyReceived: 3 })]);
  // an older backup is restored: the svcs keys go back, the device watermark stays
  for (const k of Array.from(env.adapter.data.keys())) if (/^saagar_svcs_/.test(k)) env.adapter.data.delete(k);
  for (const [k, v] of old) if (/^saagar_svcs_/.test(k)) env.adapter.data.set(k, v);
  const o = env.docs.open();
  assert.equal(o.blocked, true);
  assert.ok(o.problems.some((p) => p.code === 'SVCS_WATERMARK_AHEAD' || p.code === 'SVCS_WATERMARK_FORK'), JSON.stringify(o.problems));
  expectFail(unchanged(env, () => env.docs.receiveGoods({ ...inv('W-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER))), 'SVCS_BLOCKED');
  const ack = env.store.acknowledgeRestore({ actor: { t: 'owner', r: 'Owner', m: 'Test Owner' }, stepUpOk: true, reason: 'restored the backup of yesterday' });
  assert.equal(ack.ok, true, JSON.stringify(ack));
  assert.equal(env.docs.open().blocked, false);
  expectOk(env.docs.receiveGoods({ ...inv('W-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
});

test('a second screen: a stale screen reloads by itself and numbers stay unique', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const other = env.reopen();
  const a = env.grn([stdLine('P-1')]);
  const b = expectOk(other.receiveGoods({ ...inv('S-2'), lines: [stdLine('P-1')] }, { session: MANAGER, clientRef: 'svs-second-1' }));
  const c = env.grn([stdLine('P-1')]);
  assert.deepEqual([a.doc.no, b.doc.no, c.doc.no], ['GRN/26-27/0001', 'GRN/26-27/0002', 'GRN/26-27/0003']);
  assert.equal(env.onHand('P-1'), 30);
  assert.equal(other.fifoState() && Fifo.partBalance(other.fifoState(), 'P-1').qty, 30);
  // an approval seen by one screen only
  const p = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)));
  expectOk(other.approveAdjustment(p.proposalId, { session: OWNER, stepUp: env.pin(), clientRef: 'svs-second-2' }));
  expectFail(unchanged(env, () => env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER))), 'STATE_INVALID');
  sameBooks(env.docs, other);
});

test('an unexpected error is returned as a code, never thrown, and the next call reads storage afresh', () => {
  let boom = false;
  const env = makeEnv({
    parts: ['P-1'],
    wrapStore: (s) => ({ ...s, head: (st) => { if (boom) { boom = false; throw new Error('storage exploded'); } return s.head(st); } })
  });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  boom = true;
  const r = expectFail(env.docs.receiveGoods({ ...inv('X-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)), 'INTERNAL_ERROR');
  assert.match(r.detail.error, /exploded/);
  expectOk(env.docs.receiveGoods({ ...inv('X-1'), lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
  assert.equal(env.onHand('P-1'), 20);
});

test('the open result and status describe the books', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  env.issue('WS-1', [{ partCode: 'P-1', qty: 1 }]);
  const o = env.docs.open();
  assert.equal(o.blocked, false);
  assert.equal(o.summary.movements, 2);
  assert.equal(o.summary.lastSeq, 2);
  const s = env.docs.status();
  assert.equal(s.counts.docs, 2);
  assert.equal(s.revs.ledger, 2);
  assert.equal(s.lastAt, '2026-11-13T05:00:01.000Z');
  assert.equal(Object.isFrozen(env.docs), true);
  assert.equal(env.docs.movements().length, 2);
  const copy = env.docs.movements();
  copy.push('x');
  assert.equal(env.docs.movements().length, 2, 'a copy, not the live list');
});

// ------------------------------------------------------------------------------------------ property test

function rngFor(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function runRandom(seed, wanted) {
  const rnd = rngFor(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const codes = Array.from({ length: 12 }, (_, i) => 'R-' + String(i + 1).padStart(2, '0'));
  const jobs = ['WS-1', 'WS-2', 'WS-3', 'WS-4'];
  const env = makeEnv({
    start: '2027-03-25T06:00:00.000Z',
    jobs: jobs.map((j) => [j, { id: j, status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }])
  });
  env.open();
  for (const c of codes) env.addPart(c, Number(c.slice(2)) % 2 === 0 ? { flags: { counterSaleable: true } } : {});
  expectOk(env.docs.setConfig({ storeRoles: ['Assistant Technician'], adjustLimitPaise: 20000 }, env.ctxPin(OWNER)));
  const stats = { posted: 0, refused: 0, byKind: {}, codes: {} };
  let invoiceNo = 0;
  const note = (r, label) => {
    if (r.ok) { stats.byKind[label] = (stats.byKind[label] || 0) + 1; return; }
    stats.refused += 1;
    stats.codes[r.code] = (stats.codes[r.code] || 0) + 1;
  };
  const plainSession = () => pick([MANAGER, MANAGER2, KEEPER, OWNER]);

  const openers = codes.slice(0, 5);
  for (const c of openers) {
    env.clock.advance(1000);
    const p = expectOk(env.docs.proposeOpening({ lines: [{ partCode: c, qty: int(1, 30), unitCostPaise: int(100, 3000) }], note: 'opening' }, env.ctx(MANAGER)));
    expectOk(env.docs.approveOpening(p.proposalId, env.ctxPin(OWNER)));
  }

  const ops = [
    ['grn', 24, () => {
      const n = int(1, 3), used = [], lines = [];
      for (let i = 0; i < n; i++) lines.push({ partCode: pick(codes), qtyReceived: int(1, 40), unitCostPaise: int(100, 5000), ...(rnd() < 0.3 ? { qtyInvoiced: int(1, 45) } : {}) });
      invoiceNo += 1;
      return env.docs.receiveGoods({ supplierInvoiceNo: 'RI-' + invoiceNo, supplierInvoiceDate: '2027-03-20', lines }, env.ctx(pick([MANAGER, KEEPER, OWNER])));
    }],
    ['iss', 24, () => {
      const lines = [], seen = new Set();
      for (let i = int(1, 2); i > 0; i--) { const c = pick(codes); if (!seen.has(c)) { seen.add(c); lines.push({ partCode: c, qty: int(1, 18) }); } }
      return env.docs.issueToJob({ jobId: pick(jobs), lines }, env.ctx(pick([MANAGER, KEEPER, OWNER])));
    }],
    ['ret', 10, () => {
      const job = pick(jobs);
      const js = env.docs.jobStock(job);
      const open = js.issues.filter((x) => x.outstanding > 0);
      if (!open.length) return { ok: false, code: 'NOTHING_TO_RETURN' };
      const it = pick(open);
      return env.docs.returnFromJob({ jobId: job, lines: [{ issueMovementId: it.movementId, qty: int(1, it.outstanding + (rnd() < 0.1 ? 3 : 0)), returnReason: pick(['UNUSED', 'WRONG_PART', 'JOB_CANCELLED']) }] }, env.ctx(pick([MANAGER, KEEPER])));
    }],
    ['csl', 10, () => env.docs.counterSale({ payMode: pick(['CASH', 'UPI', 'CARD', 'OTHER']), lines: [{ partCode: pick(codes), qty: int(1, 6), unitPricePaise: int(0, 9000) }] }, env.ctx(pick([MANAGER, KEEPER, OWNER])))],
    ['adj', 10, () => {
      const c = pick(codes);
      const down = rnd() < 0.5;
      const reason = down ? pick(['COUNT_CORRECTION', 'WRONG_RECEIPT', 'DAMAGED', 'LOST']) : pick(['FOUND', 'COUNT_CORRECTION']);
      const p = env.docs.proposeAdjustment({ lines: [{ partCode: c, qtyDelta: down ? -int(1, 8) : int(1, 8), reason, unitCostPaise: int(100, 900) }], note: 'count differs' }, env.ctx(pick([MANAGER, KEEPER])));
      if (!p.ok) return p;
      const r = rnd();
      if (r < 0.6) return env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER));
      if (r < 0.75) return env.docs.approveAdjustment(p.proposalId, env.ctx(MANAGER2));
      if (r < 0.9) return env.docs.rejectAdjustment(p.proposalId, 'not needed after all', env.ctx(MANAGER));
      return env.docs.withdrawAdjustment(p.proposalId, env.ctx(OWNER));
    }],
    ['rev', 6, () => {
      const docs = env.docs.listDocs().docs.filter((d) => ['GRN', 'ADJ', 'CSL'].includes(d.kind) && d.state === 'POSTED');
      if (!docs.length) return { ok: false, code: 'NOTHING_TO_REVERSE' };
      return env.docs.reverseDoc(pick(docs).no, 'reversed in a random test', env.ctxPin(OWNER));
    }],
    ['opn', 3, () => {
      const c = pick(codes);
      const p = env.docs.proposeOpening({ lines: [{ partCode: c, qty: int(1, 9), unitCostPaise: int(100, 900) }], note: '' }, env.ctx(pick([MANAGER, KEEPER])));
      if (!p.ok) return p;
      return rnd() < 0.7 ? env.docs.approveOpening(p.proposalId, env.ctxPin(OWNER)) : env.docs.rejectOpening(p.proposalId, 'not needed after all', env.ctx(MANAGER));
    }],
    ['old', 5, () => {
      if (rnd() < 0.5 || !env.docs.oldRegister().rows.length) {
        return env.docs.registerOldPart({ jobId: pick(jobs), partText: 'old part', qty: int(1, 3), state: pick(['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED', 'SCRAP_PENDING']) }, env.ctx(pick([MANAGER, KEEPER])));
      }
      const row = pick(env.docs.oldRegister().rows);
      return env.docs.moveOldPart(row.no, { to: pick(['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED', 'SCRAP_PENDING']), note: 'moved in a random test' }, env.ctx(MANAGER));
    }],
    ['neg', 2, () => env.docs.issueToJob({ jobId: pick(jobs), note: 'shelf has it', lines: [{ partCode: pick(codes), qty: int(30, 80), allowNegative: true, unitCostPaise: 700 }] }, env.ctxPin(OWNER))],
    ['junk', 3, () => env.docs.receiveGoods({ ...inv(1), lines: [{ partCode: pick(codes), qtyReceived: pick([0, -1, 1.5]), unitCostPaise: 10 }] }, env.ctx(MANAGER))]
  ];
  const total = ops.reduce((a, o) => a + o[1], 0);
  const choose = () => { let r = rnd() * total; for (const o of ops) { r -= o[1]; if (r < 0) return o; } return ops[0]; };

  const checkAll = () => {
    const moves = env.docs.movements();
    const state = env.docs.fifoState();
    const qty = {}, val = {};
    moves.forEach((m, i) => {
      assert.equal(m.seq, i + 1, 'sequence has no gap');
      qty[m.partCode] = (qty[m.partCode] || 0) + m.qty;
      val[m.partCode] = (val[m.partCode] || 0) + m.valuePaise;
    });
    for (const code of Object.keys(qty)) {
      const b = Fifo.partBalance(state, code);
      assert.equal(b.qty, qty[code], 'on hand = sum of movements for ' + code);
      assert.equal(b.valuePaise, val[code], 'value = sum of movement values for ' + code);
    }
    const numbers = [];
    for (const d of env.docs.listDocs().docs) if (d.no) numbers.push(d.no);
    for (const r of env.docs.oldRegister().rows) numbers.push(r.no);
    for (const s of env.docs.listSignoffs().signoffs) numbers.push(s.no);
    assert.equal(new Set(numbers).size, numbers.length, 'no number repeats');
    for (const d of env.docs.listDocs().docs) {
      assert.equal(d.lines.length, d.mv.length);
      for (const m of d.mv) assert.equal(env.docs.movements()[m.seq - 1].id, m.id);
    }
    const again = env.reopen();
    sameBooks(env.docs, again);
    const v = env.store.verifyAll({ replay: () => [] });
    assert.equal(v.ok, true);
    assert.equal(v.blocked, false);
  };

  let attempts = 0;
  while (stats.posted < wanted && attempts < wanted * 6) {
    attempts += 1;
    env.clock.advance(rnd() < 0.05 ? int(20, 40) * 3600000 : int(20, 600) * 1000);
    const [label, , fn] = choose();
    const beforeText = env.adapter.text();
    const beforeSeq = env.docs.status().lastSeq;
    const r = fn();
    note(r, label);
    if (r.ok) {
      stats.posted += 1;
    } else if (r.code !== 'NOTHING_TO_RETURN' && r.code !== 'NOTHING_TO_REVERSE') {
      // a refusal changes nothing, except the few steps of a combined action that already succeeded (propose before refuse)
      if (label !== 'adj' && label !== 'opn') {
        assert.equal(env.adapter.text(), beforeText, `a refused ${label} (${r.code}) must leave storage unchanged`);
      }
      assert.equal(env.docs.status().lastSeq, beforeSeq, `a refused ${label} (${r.code}) must not move stock`);
    }
    if (attempts % 120 === 0) checkAll();
  }
  checkAll();
  return { env, stats };
}

test('property: 500 random postings (seed 20261113) keep every book in balance, every refusal changes nothing, restart gives the same books', () => {
  const { env, stats } = runRandom(20261113, 500);
  assert.equal(stats.posted >= 500, true, JSON.stringify(stats));
  for (const k of ['grn', 'iss', 'ret', 'csl', 'adj', 'rev']) assert.ok(stats.byKind[k] > 0, k + ' never happened: ' + JSON.stringify(stats));
  assert.ok(Object.keys(stats.codes).length > 2, 'refusals of several kinds happened');
  // the run crossed 1 April: two FY series exist
  const nos = env.docs.listDocs({ kind: 'GRN' }).docs.map((d) => d.no);
  assert.ok(nos.some((n) => n.startsWith('GRN/26-27/')) && nos.some((n) => n.startsWith('GRN/27-28/')), 'both financial years used: ' + nos.slice(0, 2) + ' ... ' + nos.slice(-2));
  assert.ok(env.adapter.keys().filter((k) => /ledger_v1/.test(k)).length >= 2);
  console.log('property run 1: ' + JSON.stringify(stats));
});

test('property: a second seed (7)', () => {
  const { stats } = runRandom(7, 300);
  assert.equal(stats.posted >= 300, true);
  console.log('property run 2: ' + JSON.stringify(stats));
});
