// Service Stores docs layer: checks added by the docs audit (2026-11-13).
// A stale screen never posts on an old plan; forged reversals and mislabelled numbers block the books;
// a value is read once so the value checked is the value used; views are copies.
// REAL store, FIFO and masters files. Invented data only. No PIN is typed: a step-up stamp is made by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Docs, Fifo, Masters, Store, makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER } from './lib/svc1-docs-env.mjs';

const stdLine = (partCode, extra = {}) => ({ partCode, qtyReceived: 10, unitCostPaise: 1000, ...extra });
const inv = (n) => ({ supplierInvoiceNo: 'INV-' + n, supplierInvoiceDate: '2026-11-10' });

test('a write by another screen between the checks and the append: the append is locked to the planned revision', () => {
  const seen = [];
  const env = makeEnv({
    parts: ['P-1'],
    wrapStore: (real) => ({
      ...real,
      append(stream, items, opts) { seen.push({ stream, expectRev: opts.expectRev }); return real.append(stream, items, opts); }
    })
  });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  const planned = env.docs.status().revs.ledger;
  const other = env.reopen();
  let fired = false;
  const realGet = env.cases.get;
  env.cases.get = (id) => {
    if (!fired) {
      fired = true;
      expectOk(other.receiveGoods({ ...inv('RACE'), lines: [stdLine('P-1', { qtyReceived: 5, unitCostPaise: 2000 })] }, { session: MANAGER, clientRef: 'svs-race-other' }));
    }
    return realGet(id);
  };
  seen.length = 0;
  const r = env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 2 }] }, env.ctx(MANAGER, { clientRef: 'svs-race-mine' }));
  expectFail(r, 'SVCS_REV_CONFLICT');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].stream, 'ledger');
  assert.equal(seen[0].expectRev, planned, 'the lock must be the revision the plan was built on, not a fresh head read');
  // the screen reloaded by itself; a retry posts once on the fresh books
  const again = expectOk(env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 2 }] }, env.ctx(MANAGER, { clientRef: 'svs-race-mine' })));
  assert.equal(again.replayed, undefined);
  assert.equal(env.onHand('P-1'), 13);
  assert.equal(env.reopen().status().blocked, false);
});

// Writes a hash-valid record straight through the real store (what a forger with storage access could do).
function forgeRev(env, body) {
  const t = env.store.nextAt('ledger');
  const h = env.store.head('ledger');
  const res = env.store.append('ledger', [{ k: 'REV', b: { docDate: '2026-11-13', note: '', pinAt: null, ...body(t.at) } }],
    { expectRev: h.rev, actor: { t: 'owner', r: 'Owner', m: 'Forger' }, at: t.at });
  assert.equal(res.ok, true, JSON.stringify(res));
}
function revMove(env, movementId, at) {
  const p = Fifo.planReversal(env.docs.fifoState(), { reverses: movementId, at, note: 'forged reversal' }, { session: OWNER, reauth: true });
  assert.equal(p.ok, true, JSON.stringify(p));
  return p.movement;
}

test('forged reversals with a valid hash chain block the books', () => {
  const base = () => {
    const env = makeEnv({ parts: ['P-1', 'P-2'] });
    env.clock.advance(1000);
    const g1 = env.grn([stdLine('P-1'), stdLine('P-2')]);
    const g2 = env.grn([stdLine('P-1', { qtyReceived: 4 })]);
    const g3 = env.grn([stdLine('P-2', { qtyReceived: 3 })]);
    const iss = env.issue('WS-1', [{ partCode: 'P-1', qty: 1 }]);
    env.clock.advance(1000);
    return { env, g1, g2, g3, iss };
  };
  const cases = {
    'a reversal of an issue (issues are not reversible)': ({ env, iss }) => forgeRev(env, (at) => {
      const m = revMove(env, iss.doc.mv[0].id, at);
      return { reverses: iss.doc.no, reason: 'forged', lines: [{ movementId: iss.doc.mv[0].id }], mv: [m] };
    }),
    'a reversal that names one receipt but undoes another': ({ env, g2, g3 }) => forgeRev(env, (at) => {
      const m = revMove(env, g2.doc.mv[0].id, at);
      return { reverses: g3.doc.no, reason: 'forged', lines: [{ movementId: g2.doc.mv[0].id }], mv: [m] };
    }),
    'a reversal that undoes only part of a receipt': ({ env, g1 }) => forgeRev(env, (at) => {
      const m = revMove(env, g1.doc.mv[1].id, at);
      return { reverses: g1.doc.no, reason: 'forged', lines: [{ movementId: g1.doc.mv[1].id }], mv: [m] };
    }),
    'a reversal of a posting that does not exist': ({ env, g2 }) => forgeRev(env, (at) => {
      const m = revMove(env, g2.doc.mv[0].id, at);
      return { reverses: 'GRN/26-27/0099', reason: 'forged', lines: [{ movementId: g2.doc.mv[0].id }], mv: [m] };
    })
  };
  for (const [name, run] of Object.entries(cases)) {
    const b = base();
    run(b);
    const o = b.env.docs.open();
    assert.equal(o.ok, true, name);
    assert.equal(o.blocked, true, name);
    assert.ok(o.problems.some((p) => p.code === 'SVCS_FIFO_MISMATCH' && p.stream === 'ledger'), name + ' ' + JSON.stringify(o.problems));
    expectFail(unchanged(b.env, () => b.env.docs.receiveGoods({ ...inv('Q-' + name.length), lines: [stdLine('P-1')] }, b.env.ctx(MANAGER))), 'SVCS_BLOCKED');
  }
  // a genuine reversal still opens cleanly
  const ok = base();
  expectOk(ok.env.docs.reverseDoc(ok.g2.doc.no, 'wrong supplier invoice', ok.env.ctxPin(OWNER)));
  assert.equal(ok.env.docs.open().blocked, false);
  assert.equal(ok.env.reopen().status().blocked, false);
});

test('a posting whose number belongs to another kind blocks the books', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  // an issue record carrying a GRN number: the store accepts it (the series is valid), the replay must not
  const t = env.store.nextAt('ledger');
  const no = env.store.nextNumber('GRN', t.at).no;
  const st = env.docs.fifoState();
  const p = Fifo.planIssueToJob(st, { partCode: 'P-1', qty: 1, at: t.at, ref: { grnNo: no, lineNo: 1, jobId: 'WS-1' } }, { session: MANAGER, reauth: false });
  assert.equal(p.ok, true, JSON.stringify(p));
  const h = env.store.head('ledger');
  const res = env.store.append('ledger', [{ k: 'ISS', series: 'GRN', b: { no, docDate: '2026-11-13', note: '', jobId: 'WS-1', billing: 'CHARGEABLE', stub: false, lines: [{ partCode: 'P-1', qty: 1, override: null }], mv: [p.movement] } }],
    { expectRev: h.rev, actor: { t: 'manager', r: 'Store Manager', m: 'Forger' }, at: t.at });
  assert.equal(res.ok, true, JSON.stringify(res));
  const o = env.docs.open();
  assert.equal(o.blocked, true);
  assert.ok(o.problems.some((x) => x.code === 'SVCS_FIFO_MISMATCH'), JSON.stringify(o.problems));
});

test('the negative override flag and the line cost are read once: a value that changes between reads cannot skip the Owner checks', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 1 })]);
  let reads = 0;
  const line = { partCode: 'P-1', qty: 5 };
  Object.defineProperty(line, 'allowNegative', { enumerable: true, get() { reads += 1; return reads === 1 ? false : true; } });
  let costReads = 0;
  Object.defineProperty(line, 'unitCostPaise', { enumerable: true, get() { costReads += 1; return costReads === 1 ? undefined : 1.5; } });
  const r = unchanged(env, () => env.docs.issueToJob({ jobId: 'WS-1', lines: [line], note: '' }, env.ctxPin(OWNER)));
  expectFail(r, 'INSUFFICIENT_STOCK');
  assert.equal(reads, 1, 'allowNegative must be read exactly once');
  assert.equal(costReads, 1, 'unitCostPaise must be read exactly once');
  assert.equal(env.onHand('P-1'), 1);
});

test('the docs layer itself refuses a non-Owner negative override before the FIFO engine is asked', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 1 })]);
  let asked = 0;
  const spyFifo = { ...Fifo, planIssueToJob(...a) { asked += 1; return Fifo.planIssueToJob(...a); } };
  const d2 = Docs.create({ store: Store.createStore(env.adapter, { now: env.clock.now }).store, fifo: spyFifo, masters: Masters, now: env.clock.now, cases: env.cases });
  assert.equal(d2.open().ok, true);
  const line = { partCode: 'P-1', qty: 5, allowNegative: true };
  expectFail(unchanged(env, () => d2.issueToJob({ jobId: 'WS-1', lines: [line], note: 'urgent job' }, env.ctxPin(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => d2.issueToJob({ jobId: 'WS-1', lines: [line], note: 'urgent job' }, env.ctx(OWNER))), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => d2.issueToJob({ jobId: 'WS-1', lines: [line], note: 'ok' }, env.ctxPin(OWNER))), 'OVERRIDE_NOTE_REQUIRED');
  assert.equal(asked, 0, 'no refused override reaches the FIFO engine');
  const ok = expectOk(d2.issueToJob({ jobId: 'WS-1', lines: [line], note: 'urgent job' }, env.ctxPin(OWNER)));
  assert.ok(ok.warnings.includes('NEGATIVE_OVERRIDE_USED'));
  assert.equal(asked, 1);
});

test('a step-up stamp whose time changes between reads is read once and recorded as checked', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const p = expectOk(env.docs.proposeOpening({ lines: [{ partCode: 'P-1', qty: 2, unitCostPaise: 700 }], note: 'count' }, env.ctx(MANAGER)));
  const good = env.clock.ms();
  let n = 0;
  const stamp = { ok: true };
  Object.defineProperty(stamp, 'at', { enumerable: true, get() { n += 1; return n <= 2 ? good : 'not a time'; } });
  const a = env.docs.approveOpening(p.proposalId, { session: OWNER, stepUp: stamp, clientRef: 'svs-stamp-1' });
  if (a.ok) assert.equal(a.doc.pinAt, good, 'the recorded PIN time is a checked stamp');
  else expectFail(a, 'PIN_REQUIRED');
  const recs = env.store.read('ledger').records;
  for (const r of recs) if (r.k === 'OPN') assert.equal(typeof r.b.pinAt, 'number');
});

test('views are copies: changing a returned row does not change the books', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const reg = expectOk(env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM' }, env.ctx(MANAGER)));
  const v1 = env.docs.oldRegister().rows[0];
  v1.history[0].by.name = 'Someone else';
  v1.history.push({ to: 'SCRAPPED' });
  v1.registeredBy.name = 'Someone else';
  const v2 = env.docs.oldRegister().rows[0];
  assert.equal(v2.history.length, 1);
  assert.equal(v2.history[0].by.name, 'Test Manager');
  assert.equal(v2.registeredBy.name, 'Test Manager');
  assert.equal(reg.row.no, v2.no);
  const p = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 100 }], note: 'found one' }, env.ctx(MANAGER)));
  expectOk(env.docs.rejectAdjustment(p.proposalId, 'not found after all', env.ctx(OWNER)));
  const d1 = env.docs.listProposals({ kind: 'ADJ' }).proposals[0];
  d1.decision.reason = 'changed';
  d1.decision.by.name = 'changed';
  const d2 = env.docs.listProposals({ kind: 'ADJ' }).proposals[0];
  assert.equal(d2.decision.reason, 'not found after all');
  assert.equal(d2.decision.by.name, 'Test Owner');
});
