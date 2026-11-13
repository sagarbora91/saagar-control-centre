// Service Stores docs layer: opening stock, adjustments with approval, reject, withdraw, races, Stores settings.
// Real store, real FIFO, real masters. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Docs, Fifo, Store, Masters, makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, MANAGER2, KEEPER, CASHIER
} from './lib/svc1-docs-env.mjs';

const line = (partCode, extra = {}) => ({ partCode, qty: 10, unitCostPaise: 1000, ...extra });
function ledger(env) { return env.store.read('ledger').records; }
function docsRecs(env) { return env.store.read('docs').records; }
function withKeeper(env) {
  expectOk(env.docs.setConfig({ storeRoles: ['Assistant Technician'] }, env.ctxPin(OWNER)));
}
function adj(env, lines, note = 'shelf count differs', session = MANAGER) {
  return env.docs.proposeAdjustment({ lines, note }, env.ctx(session));
}

test('opening: Manager or a named store role proposes, no stock moves, a plain role cannot', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(CASHIER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(KEEPER))), 'NOT_ALLOWED');
  withKeeper(env);
  const ledgerBefore = ledger(env).length;
  const p = expectOk(env.docs.proposeOpening({ lines: [line('P-1'), line('P-2', { qty: 3, unitCostPaise: 700 })], note: 'first count' }, env.ctx(KEEPER)));
  assert.match(p.proposalId, /^DOC-\d{6}$/);
  assert.equal(p.proposal.state, 'PROPOSED');
  assert.equal(p.proposal.kind, 'OPN');
  assert.equal(p.proposal.by.name, 'Test Keeper');
  assert.equal(ledger(env).length, ledgerBefore, 'a proposal writes to docs, not to the ledger');
  assert.equal(env.onHand('P-1'), 0);
  const rec = docsRecs(env).filter((r) => r.id === p.proposalId)[0];
  assert.equal(rec.k, 'OPN_PROPOSE');
  assert.deepEqual(rec.b.lines, [{ partCode: 'P-1', qty: 10, unitCostPaise: 1000 }, { partCode: 'P-2', qty: 3, unitCostPaise: 700 }]);
  assert.equal(env.docs.pending().openings.length, 1);
  assert.equal(env.docs.listProposals({ kind: 'OPN', state: 'PROPOSED' }).proposals.length, 1);
});

test('opening: field refusals', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  const call = (lines, note = '') => unchanged(env, () => env.docs.proposeOpening({ lines, note }, env.ctx(MANAGER)));
  expectFail(call([]), 'LINES_REQUIRED');
  expectFail(call(Array.from({ length: 101 }, (_, i) => line('P-1'))), 'TOO_MANY_LINES');
  expectFail(call([line('P-1'), line('p-1')]), 'DUPLICATE_LINE');
  expectFail(call([line('P-1', { unitCostPaise: 0 })]), 'COST_REQUIRED');
  expectFail(call([line('P-1', { unitCostPaise: undefined })]), 'COST_REQUIRED');
  expectFail(call([line('P-1', { qty: 0 })]), 'QTY_INVALID');
  expectFail(call([line('P-1', { qty: 100001 })]), 'QTY_INVALID');
  expectFail(call([line('NOPE')]), 'PART_UNKNOWN');
  expectFail(call([line('P-1')], 'n'.repeat(201)), 'INPUT_INVALID');
  expectFail(env.docs.proposeOpening(null, env.ctx(MANAGER)), 'INPUT_INVALID');
});

test('opening: approval is Owner only, with a fresh PIN; stamps at the edges of 120 seconds', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const p = expectOk(env.docs.proposeOpening({ lines: [line('P-1')], note: 'count' }, env.ctx(MANAGER)));
  expectFail(unchanged(env, () => env.docs.approveOpening(p.proposalId, env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.approveOpening(p.proposalId, env.ctxPin(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.approveOpening(p.proposalId, env.ctx(OWNER))), 'PIN_REQUIRED');
  const now = env.clock.ms();
  const stamps = [
    [{ ok: true, at: now - 120001 }, false], [{ ok: true, at: now + 1 }, false], [{ ok: false, at: now }, false],
    [{ at: now }, false], [{ ok: true }, false], [{ ok: true, at: 'now' }, false], [{ ok: true, at: now + 0.5 }, false],
    [null, false], ['yes', false], [true, false]
  ];
  for (const [stepUp, good] of stamps) {
    const r = unchanged(env, () => env.docs.approveOpening(p.proposalId, env.ctx(OWNER, { stepUp })));
    assert.equal(r.ok, good, JSON.stringify(stepUp));
    expectFail(r, 'PIN_REQUIRED');
  }
  // exactly 120000 ms old is still fresh
  const a = expectOk(env.docs.approveOpening(p.proposalId, env.ctx(OWNER, { stepUp: { ok: true, at: now - 120000 } })));
  assert.equal(a.doc.kind, 'OPN');
  assert.equal(a.doc.no, 'OPN/26-27/0001');
  assert.equal(a.doc.proposalId, p.proposalId);
  assert.deepEqual(a.doc.approvedBy, { name: 'Test Owner', role: 'Owner' });
  assert.equal(a.doc.pinAt, now - 120000);
  assert.deepEqual(a.doc.lines, [{ partCode: 'P-1', qty: 10, unitCostPaise: 1000 }]);
  assert.equal(a.doc.mv[0].type, 'opening');
  assert.equal(a.doc.mv[0].approval.by, 'Test Owner');
  assert.equal(env.onHand('P-1'), 10);
  assert.equal(env.value('P-1'), 10000);
  assert.equal(env.docs.listProposals({ kind: 'OPN' }).proposals[0].state, 'POSTED');
  assert.equal(env.docs.listProposals({ kind: 'OPN' }).proposals[0].docNo, 'OPN/26-27/0001');
  assert.equal(env.docs.pending().openings.length, 0);
  // a second approval of the same proposal posts nothing
  expectFail(unchanged(env, () => env.docs.approveOpening(p.proposalId, env.ctxPin(OWNER))), 'STATE_INVALID');
});

test('opening: once per part, ever; open proposal holds the part; any movement blocks it, at propose and at approve', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2', 'P-3'] });
  env.clock.advance(1000);
  const a = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(MANAGER)));
  const hold = expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-2'), line('P-1')] }, env.ctx(MANAGER))), 'OPENING_PROPOSAL_OPEN');
  assert.equal(hold.detail.partCode, 'P-1');
  assert.equal(hold.detail.proposalId, a.proposalId);
  assert.equal(hold.detail.lineNo, 2);
  expectOk(env.docs.approveOpening(a.proposalId, env.ctxPin(OWNER)));
  expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(MANAGER))), 'OPENING_ALREADY_SET');
  // a receipt arrives for P-3 between propose and approve
  const b = expectOk(env.docs.proposeOpening({ lines: [line('P-3')] }, env.ctx(MANAGER)));
  env.grn([{ partCode: 'P-3', qtyReceived: 1, unitCostPaise: 500 }]);
  expectFail(unchanged(env, () => env.docs.approveOpening(b.proposalId, env.ctxPin(OWNER))), 'PART_HAS_MOVEMENTS');
  assert.equal(env.docs.listProposals({ kind: 'OPN' }).proposals.filter((p) => p.id === b.proposalId)[0].state, 'PROPOSED');
  // any movement at all, at propose time
  expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-3')] }, env.ctx(MANAGER))), 'PART_HAS_MOVEMENTS');
  // an opening is never reversible, for anyone
  const doc = env.docs.listDocs({ kind: 'OPN' }).docs[0];
  for (const ctx of [env.ctxPin(OWNER), env.ctx(MANAGER)]) expectFail(unchanged(env, () => env.docs.reverseDoc(doc.no, 'wrong count entered', ctx)), 'NOT_REVERSIBLE');
});

test('opening: reject and withdraw free the part, need the right person, and decide only once', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  withKeeper(env);
  const a = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(KEEPER)));
  expectFail(unchanged(env, () => env.docs.rejectOpening(a.proposalId, 'counted wrong', env.ctx(KEEPER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.rejectOpening(a.proposalId, 'abc', env.ctx(MANAGER))), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => env.docs.rejectOpening(a.proposalId, '', env.ctx(MANAGER))), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => env.docs.rejectOpening('DOC-000999', 'counted wrong', env.ctx(MANAGER))), 'DOC_NOT_FOUND');
  expectFail(unchanged(env, () => env.docs.rejectOpening(5, 'counted wrong', env.ctx(MANAGER))), 'DOC_NOT_FOUND');
  const rj = expectOk(env.docs.rejectOpening(a.proposalId, 'counted wrong', env.ctx(MANAGER)));
  assert.equal(rj.proposal.state, 'REJECTED');
  assert.equal(rj.proposal.decision.reason, 'counted wrong');
  assert.equal(rj.proposal.decision.by.name, 'Test Manager');
  expectFail(unchanged(env, () => env.docs.approveOpening(a.proposalId, env.ctxPin(OWNER))), 'STATE_INVALID');
  expectFail(unchanged(env, () => env.docs.withdrawOpening(a.proposalId, env.ctx(KEEPER))), 'STATE_INVALID');
  // the part is free again
  const b = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(KEEPER)));
  // another manager is not the proposer; the proposer and the Owner may withdraw
  expectFail(unchanged(env, () => env.docs.withdrawOpening(b.proposalId, env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.withdrawOpening(b.proposalId, env.ctx(CASHIER))), 'NOT_ALLOWED');
  const w = expectOk(env.docs.withdrawOpening(b.proposalId, env.ctx(KEEPER)));
  assert.equal(w.proposal.state, 'WITHDRAWN');
  const c = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(KEEPER)));
  expectOk(env.docs.withdrawOpening(c.proposalId, env.ctx(OWNER)));
  // no ledger movement for any of that
  assert.equal(ledger(env).length, 0);
  // an adjustment id is not an opening id
  const ad = expectOk(adj(env, [{ partCode: 'P-2', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 100 }]));
  expectFail(env.docs.rejectOpening(ad.proposalId, 'wrong kind of id', env.ctx(MANAGER)), 'DOC_NOT_FOUND');
});

test('opening: the proposer of a manager proposal can withdraw it only by the same name and tier', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const a = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(MANAGER)));
  expectFail(unchanged(env, () => env.docs.withdrawOpening(a.proposalId, env.ctx(MANAGER2))), 'NOT_ALLOWED');
  expectOk(env.docs.withdrawOpening(a.proposalId, env.ctx(MANAGER)));
});

test('second pass D2 (O06, A09): a Store Manager with no staff name can withdraw his own nameless proposal, nobody else can', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  const blank = { ...MANAGER, actorName: '' };
  const a = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(blank)));
  // a named Manager, a Cashier and a nameless staff member of another tier are not the proposer
  expectFail(unchanged(env, () => env.docs.withdrawOpening(a.proposalId, env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.withdrawOpening(a.proposalId, env.ctx({ ...KEEPER, actorName: '' }))), 'NOT_ALLOWED');
  expectOk(env.docs.withdrawOpening(a.proposalId, env.ctx(blank)));
  // the same for an adjustment
  env.grn([{ partCode: 'P-2', qtyReceived: 3, unitCostPaise: 100 }]);
  const p = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-2', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], note: 'shelf count' }, env.ctx(blank)));
  expectFail(unchanged(env, () => env.docs.withdrawAdjustment(p.proposalId, env.ctx(MANAGER2))), 'NOT_ALLOWED');
  expectOk(env.docs.withdrawAdjustment(p.proposalId, env.ctx(blank)));
});

test('race: Owner approves while a Manager rejects on another screen; only one of them lands', () => {
  let hook = null;
  const env = makeEnv({
    parts: ['P-1'],
    wrapStore: (s) => ({ ...s, findRef: (st, ref) => { if (hook) { const h = hook; hook = null; h(); } return s.findRef(st, ref); } })
  });
  env.clock.advance(1000);
  const p = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(MANAGER)));
  const other = env.reopen();
  // case 1: the competitor rejects after this screen decided to approve
  hook = () => expectOk(other.rejectOpening(p.proposalId, 'counted wrong', { session: MANAGER, clientRef: 'svs-other-1' }));
  const r = expectFail(env.docs.approveOpening(p.proposalId, env.ctxPin(OWNER)), 'SVCS_REV_CONFLICT');
  assert.equal(ledger(env).length, 0, 'nothing was posted');
  assert.equal(env.docs.listProposals({ kind: 'OPN' }).proposals[0].state, 'REJECTED', 'this screen reloaded and sees the rejection');
  assert.ok(r.message);
  // case 2: the competitor approves while this screen rejects
  const q = expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(MANAGER)));
  const other2 = env.reopen();
  hook = () => expectOk(other2.approveOpening(q.proposalId, { session: OWNER, stepUp: { ok: true, at: env.clock.ms() }, clientRef: 'svs-other-2' }));
  expectFail(env.docs.rejectOpening(q.proposalId, 'too late maybe', env.ctx(MANAGER)), 'SVCS_REV_CONFLICT');
  assert.equal(ledger(env).length, 1, 'only the approval is in the ledger');
  assert.equal(env.docs.listProposals({ kind: 'OPN' }).proposals.filter((x) => x.id === q.proposalId)[0].state, 'POSTED');
  assert.equal(env.onHand('P-1'), 10);
  assert.equal(docsRecs(env).filter((x) => x.k === 'OPN_REJECT').length, 1);
});

test('adjustment: values come from FIFO layers; excess at the last layer cost; no layer needs a cost', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 1000 }]);
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 1800 }]);
  // shortage of 7: 5 at 1000 + 2 at 1800
  const s = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -7, reason: 'COUNT_CORRECTION' }]));
  assert.equal(s.valuePaise, 5 * 1000 + 2 * 1800);
  assert.equal(s.needsOwner, true, 'default Manager limit is 0');
  // excess of 3 is valued at the newest layer cost
  const e = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: 3, reason: 'FOUND' }]));
  assert.equal(e.valuePaise, 3 * 1800);
  // a given cost is ignored when a layer exists
  const e2 = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: 2, reason: 'FOUND', unitCostPaise: 9999 }]));
  assert.equal(e2.valuePaise, 2 * 1800);
  // a part that never had a layer needs a cost
  expectFail(unchanged(env, () => adj(env, [{ partCode: 'P-2', qtyDelta: 2, reason: 'FOUND' }])), 'COST_REQUIRED');
  expectFail(unchanged(env, () => adj(env, [{ partCode: 'P-2', qtyDelta: 2, reason: 'FOUND', unitCostPaise: 0 }])), 'COST_REQUIRED');
  const e3 = expectOk(adj(env, [{ partCode: 'P-2', qtyDelta: 2, reason: 'FOUND', unitCostPaise: 640 }]));
  assert.equal(e3.valuePaise, 1280);
  // more than the stock
  const bad = expectFail(unchanged(env, () => adj(env, [{ partCode: 'P-1', qtyDelta: -11, reason: 'LOST' }])), 'INSUFFICIENT_STOCK');
  assert.equal(bad.detail.available, 10);
  assert.equal(bad.detail.requested, 11);
  // approve the excess with a new layer at the last cost
  const a = expectOk(env.docs.approveAdjustment(e3.proposalId, env.ctxPin(OWNER)));
  assert.equal(a.doc.kind, 'ADJ');
  assert.equal(a.doc.no, 'ADJ/26-27/0001');
  assert.equal(a.doc.mv[0].type, 'adjust_up');
  assert.equal(a.doc.mv[0].unitCostPaise, 640);
  assert.deepEqual(a.doc.lines, [{ partCode: 'P-2', qtyDelta: 2, reason: 'FOUND', unitCostPaise: 640, valuePaise: 1280 }]);
  assert.equal(a.doc.reasonClass, 'CORRECTION');
  assert.equal(a.doc.totalAbsPaise, 1280);
  assert.equal(a.doc.proposalId, e3.proposalId);
  assert.equal(a.doc.approval.by, 'Test Owner');
  assert.equal(a.doc.approval.pinAt, env.clock.ms());
  assert.equal(a.doc.approval.limitPaise, 0);
  assert.equal(a.doc.mv[0].proposedBy, 'Test Manager');
});

test('adjustment: field refusals', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 10, unitCostPaise: 1000 }]);
  const call = (lines, note) => unchanged(env, () => env.docs.proposeAdjustment({ lines, note: note === undefined ? 'shelf count differs' : note }, env.ctx(MANAGER)));
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'LOST' }]), 'REASON_SIGN_MISMATCH');
  expectFail(call([{ partCode: 'P-1', qtyDelta: -1, reason: 'FOUND' }]), 'REASON_SIGN_MISMATCH');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'DAMAGED' }]), 'REASON_SIGN_MISMATCH');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'WRITE_OFF' }]), 'REASON_SIGN_MISMATCH');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'OTHER' }]), 'REASON_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1 }]), 'REASON_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 0, reason: 'FOUND' }]), 'QTY_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1.5, reason: 'FOUND' }]), 'QTY_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 100001, reason: 'FOUND' }]), 'QTY_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND' }], 'abc'), 'REASON_REQUIRED');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND' }], ''), 'REASON_REQUIRED');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND' }], 'n'.repeat(201)), 'INPUT_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND' }, { partCode: 'p-1', qtyDelta: 2, reason: 'FOUND' }]), 'DUPLICATE_LINE');
  expectFail(call([]), 'LINES_REQUIRED');
  expectFail(call([{ partCode: 'NOPE', qtyDelta: 1, reason: 'FOUND' }]), 'PART_UNKNOWN');
  expectFail(env.docs.proposeAdjustment(null, env.ctx(MANAGER)), 'INPUT_INVALID');
  expectFail(call([{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND', unitCostPaise: -4 }]), 'COST_REQUIRED');
});

test('adjustment approval: Manager limit 0 by default, then a set limit, write-offs always the Owner, own proposal refused', () => {
  const env = makeEnv({ parts: ['PA', 'PB', 'PC', 'PD'] });
  env.clock.advance(1000);
  env.grn([
    { partCode: 'PA', qtyReceived: 5, unitCostPaise: 49999 }, { partCode: 'PB', qtyReceived: 5, unitCostPaise: 50000 },
    { partCode: 'PC', qtyReceived: 5, unitCostPaise: 50001 }, { partCode: 'PD', qtyReceived: 5, unitCostPaise: 100 }
  ]);
  const mk = (code, delta = -1, reason = 'COUNT_CORRECTION', session = MANAGER) => expectOk(adj(env, [{ partCode: code, qtyDelta: delta, reason }], 'shelf count differs', session));
  const pa = mk('PA'), pb = mk('PB'), pc = mk('PC');
  // default limit 0: the Manager gets ABOVE_MANAGER_LIMIT, the Owner needs the PIN
  expectFail(unchanged(env, () => env.docs.approveAdjustment(pa.proposalId, env.ctx(MANAGER2))), 'ABOVE_MANAGER_LIMIT');
  expectFail(unchanged(env, () => env.docs.approveAdjustment(pa.proposalId, env.ctx(OWNER))), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => env.docs.approveAdjustment(pa.proposalId, env.ctx(CASHIER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.approveAdjustment(pa.proposalId, env.ctx(KEEPER))), 'NOT_ALLOWED');
  // the Manager cannot set the limit; the Owner needs a PIN
  expectFail(unchanged(env, () => env.docs.setConfig({ adjustLimitPaise: 50000 }, env.ctxPin(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.setConfig({ adjustLimitPaise: 50000 }, env.ctx(OWNER))), 'PIN_REQUIRED');
  expectOk(env.docs.setConfig({ adjustLimitPaise: 50000 }, env.ctxPin(OWNER)));
  assert.equal(env.docs.config().adjustLimitPaise, 50000);
  assert.equal(pa.needsOwner, true, 'was computed when the limit was 0');
  assert.equal(env.docs.listProposals({ kind: 'ADJ' }).proposals.filter((p) => p.id === pa.proposalId)[0].needsOwner, false, 'needsOwner follows the current limit');
  // 49,999 and 50,000 pass without a PIN, 50,001 does not
  const a = expectOk(env.docs.approveAdjustment(pa.proposalId, env.ctx(MANAGER2)));
  assert.equal(a.doc.approval.pinAt, null);
  assert.equal(a.doc.approval.limitPaise, 50000);
  assert.equal(a.doc.approval.by, 'Other Manager');
  assert.equal(a.doc.totalAbsPaise, 49999);
  expectOk(env.docs.approveAdjustment(pb.proposalId, env.ctx(MANAGER2)));
  const over = expectFail(unchanged(env, () => env.docs.approveAdjustment(pc.proposalId, env.ctx(MANAGER2))), 'ABOVE_MANAGER_LIMIT');
  assert.equal(over.detail.valuePaise, 50001);
  assert.equal(over.detail.limitPaise, 50000);
  // the Owner can, with a PIN
  expectOk(env.docs.approveAdjustment(pc.proposalId, env.ctxPin(OWNER)));
  // a Manager cannot approve their own proposal, even within the limit
  const own = mk('PD', -1, 'COUNT_CORRECTION', MANAGER);
  expectFail(unchanged(env, () => env.docs.approveAdjustment(own.proposalId, env.ctx(MANAGER))), 'SELF_APPROVAL');
  expectOk(env.docs.approveAdjustment(own.proposalId, env.ctx(MANAGER2)));
  // second pass (D2, D-1): a Manager with no staff name cannot approve, and is told to sign in with a name (not "your own request")
  const noName = { ...MANAGER, actorName: '' };
  const noName2 = { ...MANAGER2, actorName: '' };
  const p2 = mk('PD', -1, 'COUNT_CORRECTION', noName);
  const nn = expectFail(unchanged(env, () => env.docs.approveAdjustment(p2.proposalId, env.ctx(noName2))), 'APPROVER_NAME_REQUIRED');
  assert.match(nn.message, /staff name/);
  // a proposal sent with no name (not by the Owner) could be the approver's own: only the Owner can approve it
  expectFail(unchanged(env, () => env.docs.approveAdjustment(p2.proposalId, env.ctx(MANAGER2))), 'PROPOSER_NAME_MISSING');
  expectOk(env.docs.approveAdjustment(p2.proposalId, env.ctxPin(OWNER)));
  // a Cashier's named proposal: refused for a nameless Manager (name needed), fine for a named one
  const cashierStore = { ...CASHIER };
  expectOk(env.docs.setConfig({ adjustLimitPaise: 50000, storeRoles: ['Cashier'] }, env.ctxPin(OWNER)));
  const p4 = mk('PD', -1, 'COUNT_CORRECTION', cashierStore);
  expectFail(unchanged(env, () => env.docs.approveAdjustment(p4.proposalId, env.ctx(noName2))), 'APPROVER_NAME_REQUIRED');
  expectOk(env.docs.approveAdjustment(p4.proposalId, env.ctx(MANAGER2)));
  // an Owner proposal with no name is approved by a named Manager within the limit (A11)
  const ownerNoName = { ...OWNER, actorName: '' };
  const p5 = mk('PD', -1, 'COUNT_CORRECTION', ownerNoName);
  expectOk(env.docs.approveAdjustment(p5.proposalId, env.ctx(MANAGER2)));
  // the Owner may approve their own proposal
  const p3 = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'PD', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], note: 'owner count' }, env.ctx(OWNER)));
  expectOk(env.docs.approveAdjustment(p3.proposalId, env.ctxPin(OWNER)));
});

test('adjustment: write-off reasons always need the Owner and the PIN, even under the limit', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 20, unitCostPaise: 100 }]);
  expectOk(env.docs.setConfig({ adjustLimitPaise: 1000000 }, env.ctxPin(OWNER)));
  for (const reason of ['DAMAGED', 'LOST', 'WRITE_OFF']) {
    const p = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -1, reason }]));
    assert.equal(p.reasonClass, 'WRITEOFF');
    assert.equal(p.needsOwner, true);
    expectFail(unchanged(env, () => env.docs.approveAdjustment(p.proposalId, env.ctx(MANAGER2))), 'WRITEOFF_OWNER_ONLY');
    expectFail(unchanged(env, () => env.docs.approveAdjustment(p.proposalId, env.ctx(OWNER))), 'PIN_REQUIRED');
    const done = expectOk(env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER)));
    assert.equal(done.doc.reasonClass, 'WRITEOFF');
    assert.equal(done.doc.mv[0].reason, { DAMAGED: 'damaged', LOST: 'lost', WRITE_OFF: 'write_off' }[reason]);
  }
  // one write-off line makes the whole document a write-off
  env.addPart('P-2');
  env.grn([{ partCode: 'P-2', qtyReceived: 5, unitCostPaise: 100 }]);
  const mixed = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -1, reason: 'COUNT_CORRECTION' }, { partCode: 'P-2', qtyDelta: -1, reason: 'LOST' }]));
  assert.equal(mixed.reasonClass, 'WRITEOFF');
  const onlyFix = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: 1, reason: 'FOUND' }, { partCode: 'P-2', qtyDelta: -1, reason: 'WRONG_RECEIPT' }]));
  assert.equal(onlyFix.reasonClass, 'CORRECTION');
});

test('adjustment: the limit is checked on the value at approval time, not at proposal time', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 1, unitCostPaise: 1000 }]);
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 60000 }]);
  expectOk(env.docs.setConfig({ adjustLimitPaise: 50000 }, env.ctxPin(OWNER)));
  const p = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -1, reason: 'COUNT_CORRECTION' }]));
  assert.equal(p.valuePaise, 1000);
  assert.equal(p.needsOwner, false);
  // the cheap layer is used up on a job; the same shortage now costs 60,000
  env.issue('WS-1', [{ partCode: 'P-1', qty: 1 }]);
  const r = expectFail(unchanged(env, () => env.docs.approveAdjustment(p.proposalId, env.ctx(MANAGER2))), 'ABOVE_MANAGER_LIMIT');
  assert.equal(r.detail.valuePaise, 60000);
  // and the shortage may have become impossible
  const q = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -5, reason: 'COUNT_CORRECTION' }]));
  env.issue('WS-1', [{ partCode: 'P-1', qty: 3 }]);
  expectFail(unchanged(env, () => env.docs.approveAdjustment(q.proposalId, env.ctxPin(OWNER))), 'INSUFFICIENT_STOCK');
});

test('adjustment: reject and withdraw, races, and the ledger stays empty of them', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 100 }]);
  const n = ledger(env).length;
  const p = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }]));
  expectFail(unchanged(env, () => env.docs.rejectAdjustment(p.proposalId, 'abcd', env.ctx(MANAGER2))), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => env.docs.rejectAdjustment(p.proposalId, 'not lost', env.ctx(CASHIER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.withdrawAdjustment(p.proposalId, env.ctx(MANAGER2))), 'NOT_ALLOWED');
  const rj = expectOk(env.docs.rejectAdjustment(p.proposalId, 'found it on the shelf', env.ctx(MANAGER2)));
  assert.equal(rj.proposal.state, 'REJECTED');
  const q = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }]));
  expectOk(env.docs.withdrawAdjustment(q.proposalId, env.ctx(MANAGER)));
  assert.equal(ledger(env).length, n);
  expectFail(unchanged(env, () => env.docs.approveAdjustment(q.proposalId, env.ctxPin(OWNER))), 'STATE_INVALID');
  expectFail(unchanged(env, () => env.docs.approveAdjustment('DOC-000999', env.ctxPin(OWNER))), 'DOC_NOT_FOUND');
  assert.equal(env.docs.listProposals({ kind: 'ADJ', state: 'REJECTED' }).proposals.length, 1);
  assert.equal(env.docs.listProposals({ kind: 'ADJ', state: 'WITHDRAWN' }).proposals.length, 1);
  assert.equal(env.docs.pending().adjustments.length, 0);
});

test('race: approve loses to a reject on another screen (adjustment)', () => {
  let hook = null;
  const env = makeEnv({
    parts: ['P-1'],
    wrapStore: (s) => ({ ...s, findRef: (st, ref) => { if (hook) { const h = hook; hook = null; h(); } return s.findRef(st, ref); } })
  });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 100 }]);
  const p = expectOk(adj(env, [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }]));
  const other = env.reopen();
  hook = () => expectOk(other.rejectAdjustment(p.proposalId, 'found on shelf', { session: MANAGER, clientRef: 'svs-adj-race-1' }));
  const n = ledger(env).length;
  expectFail(env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER)), 'SVCS_REV_CONFLICT');
  assert.equal(ledger(env).length, n);
  assert.equal(env.onHand('P-1'), 5, 'stock untouched');
  expectFail(unchanged(env, () => env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER))), 'STATE_INVALID');
});

test('adjustment: retry with the same clientRef after a lost reply posts once', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 100 }]);
  const p = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -2, reason: 'COUNT_CORRECTION' }], note: 'count differs' }, env.ctx(MANAGER, { clientRef: 'svs-prop-1' })));
  const p2 = unchanged(env, () => env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -2, reason: 'COUNT_CORRECTION' }], note: 'count differs' }, env.ctx(MANAGER, { clientRef: 'svs-prop-1' })));
  assert.equal(p2.proposalId, p.proposalId);
  assert.equal(p2.replayed, true);
  const a = expectOk(env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER, { clientRef: 'svs-appr-1' })));
  const n = ledger(env).length;
  const a2 = unchanged(env, () => env.docs.approveAdjustment(p.proposalId, env.ctxPin(OWNER, { clientRef: 'svs-appr-1' })));
  assert.equal(a2.replayed, true);
  assert.equal(a2.doc.no, a.doc.no);
  assert.equal(ledger(env).length, n);
  assert.equal(env.onHand('P-1'), 3);
});

test('Stores settings: Owner with PIN only; validation; last good row wins; persists across a restart; store role can then propose', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  assert.deepEqual(env.docs.config(), { ok: true, adjustLimitPaise: 0, storeRoles: [], warnings: [] });
  for (const session of [MANAGER, CASHIER, KEEPER]) expectFail(unchanged(env, () => env.docs.setConfig({ adjustLimitPaise: 100 }, env.ctxPin(session))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.setConfig({ adjustLimitPaise: 100 }, env.ctx(OWNER))), 'PIN_REQUIRED');
  const bad = [
    { adjustLimitPaise: -1 }, { adjustLimitPaise: 100000001 }, { adjustLimitPaise: 1.5 }, { adjustLimitPaise: '100' },
    { storeRoles: ['Owner'] }, { storeRoles: ['Janitor'] }, { storeRoles: 'Cashier' }, { storeRoles: [5] }
  ];
  for (const patch of bad) expectFail(unchanged(env, () => env.docs.setConfig(patch, env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(env.docs.setConfig(null, env.ctxPin(OWNER)), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(KEEPER))), 'NOT_ALLOWED');
  const first = expectOk(env.docs.setConfig({ adjustLimitPaise: 100000000, storeRoles: ['Assistant Technician', 'Cashier', 'Cashier'] }, env.ctxPin(OWNER)));
  assert.deepEqual(first.config, { adjustLimitPaise: 100000000, storeRoles: ['Assistant Technician', 'Cashier'] });
  // only the fields given change
  const second = expectOk(env.docs.setConfig({ adjustLimitPaise: 250 }, env.ctxPin(OWNER)));
  assert.deepEqual(second.config, { adjustLimitPaise: 250, storeRoles: ['Assistant Technician', 'Cashier'] });
  // nothing to change writes nothing
  const same = unchanged(env, () => env.docs.setConfig({ adjustLimitPaise: 250 }, env.ctxPin(OWNER)));
  assert.equal(same.unchanged, true);
  expectOk(env.docs.proposeOpening({ lines: [line('P-1')] }, env.ctx(KEEPER)));
  expectOk(env.docs.proposeOpening({ lines: [line('P-2', { qty: 1 })] }, env.ctx(CASHIER)));
  // after a restart the same settings are in force
  const again = env.reopen();
  assert.deepEqual(again.config(), { ok: true, adjustLimitPaise: 250, storeRoles: ['Assistant Technician', 'Cashier'], warnings: [] });
  assert.equal(env.store.read('config').records.length, 2);
  // taking the role away takes the right away
  expectOk(env.docs.setConfig({ storeRoles: [] }, env.ctxPin(OWNER)));
  expectFail(unchanged(env, () => env.docs.proposeOpening({ lines: [line('P-1', { qty: 2 })] }, env.ctx(KEEPER))), 'NOT_ALLOWED');
});

test('the Owner may hold a stale-free view: a second screen sees new settings on its next call', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const other = env.reopen();
  expectOk(env.docs.setConfig({ storeRoles: ['Assistant Technician'] }, env.ctxPin(OWNER)));
  assert.deepEqual(other.config().storeRoles, ['Assistant Technician']);
  expectOk(other.proposeOpening({ lines: [line('P-1')] }, { session: KEEPER, clientRef: 'svs-other-keeper' }));
});
