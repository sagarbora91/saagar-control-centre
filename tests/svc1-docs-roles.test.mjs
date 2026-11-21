// Service Stores docs layer: the role table (plan 2.10), broken sessions, step-up, Owner negative override.
// The expected table below is written by hand, separately from the code under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Docs, Fifo, makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, MANAGER2, KEEPER, CASHIER, NONE
} from './lib/svc1-docs-env.mjs';

const SHELL = ['Store Manager', 'Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];
// What SaagarModuleRuntime.session() returns for each shell session (owner unlocked, or a signed-in role).
function moduleSession(isOwner, role) {
  const manager = isOwner || role === 'Store Manager';
  return Object.freeze({
    ok: true, isOwner, isManager: manager, role, tier: isOwner ? 'owner' : (manager ? 'manager' : 'staff'),
    actorName: isOwner ? 'The Owner' : 'Person ' + role
  });
}
const SESSIONS = [
  { name: 'Owner unlocked (shell role Store Manager)', s: moduleSession(true, 'Store Manager'), kind: 'owner' },
  { name: 'Owner unlocked (shell role Cashier)', s: moduleSession(true, 'Cashier'), kind: 'owner' },
  ...SHELL.map((r) => ({ name: 'role ' + r, s: moduleSession(false, r), kind: r === 'Store Manager' ? 'manager' : 'staff' }))
];
const BROKEN = [
  ['undefined', undefined], ['null', null], ['a string', 'owner'], ['a number', 7], ['an array', []], ['empty object', {}],
  ['ok only', { ok: true }], ['ok is 1', { ok: 1, tier: 'owner', isOwner: true, isManager: true }],
  ['owner without isOwner', { ok: true, tier: 'owner', isManager: true, role: 'Owner', actorName: 'x' }],
  ['isOwner is the text true', { ok: true, tier: 'owner', isOwner: 'true', isManager: true, role: 'Owner', actorName: 'x' }],
  ['manager with isManager 1', { ok: true, tier: 'manager', isManager: 1, role: 'Store Manager', actorName: 'x' }],
  ['staff that claims isOwner', { ok: true, tier: 'staff', isOwner: true, isManager: false, role: 'Cashier', actorName: 'x' }],
  ['manager that claims isOwner', { ok: true, tier: 'manager', isOwner: true, isManager: true, role: 'Store Manager', actorName: 'x' }],
  ['tier none', NONE], ['unknown tier', { ok: true, tier: 'admin', isOwner: true, isManager: true }],
  ['a getter that throws', { get ok() { throw new Error('boom'); } }]
];

// hand-written expectations: kind = owner | manager | store | staff
function expected(action, kind, limit) {
  const o = kind === 'owner', m = kind === 'manager', st = kind === 'store';
  const any = o || m || st;
  const yes = (needsPin = false) => ({ ok: true, needsPin });
  const no = (code) => ({ ok: false, needsPin: false, code });
  switch (action) {
    case 'VIEW': return yes();
    case 'VIEW_COST': case 'MASTERS_EDIT': case 'PROPOSAL_REJECT': case 'OLD_MOVE': return (o || m) ? yes() : no('NOT_ALLOWED');
    case 'MASTERS_REMOVE': case 'OPENING_APPROVE': case 'NEGATIVE_OVERRIDE': case 'REVERSE_GRN': case 'REVERSE_ADJUST':
    case 'SCRAP_SIGNOFF': case 'CONFIG_EDIT': case 'ACK_RESTORE': case 'CLOCK_OVERRIDE':
      return o ? yes(true) : no('NOT_ALLOWED');
    case 'OPENING_PROPOSE': case 'RECEIVE': case 'ISSUE': case 'RETURN': case 'COUNTER_SALE': case 'ADJUST_PROPOSE':
    case 'PROPOSAL_WITHDRAW': case 'OLD_REGISTER':
      return any ? yes() : no('NOT_ALLOWED');
    case 'ADJUST_APPROVE':
      if (o) return yes(true);
      if (m) return limit > 0 ? yes() : no('ABOVE_MANAGER_LIMIT');
      return no('NOT_ALLOWED');
    case 'ADJUST_APPROVE_WRITEOFF':
      if (o) return yes(true);
      return m ? no('WRITEOFF_OWNER_ONLY') : no('NOT_ALLOWED');
    case 'REVERSE_COUNTER_SALE': return (o || m) ? yes() : no('NOT_ALLOWED');
    case 'REVERSE_OPENING': case 'REVERSE_ISSUE': case 'REVERSE_RETURN': return no('NOT_REVERSIBLE');
    default: throw new Error('no expectation for ' + action);
  }
}

test('the role table: every action for every shell session, with and without a store role and a Manager limit', async (t) => {
  const env = makeEnv({ parts: ['P-1'] });
  env.open();
  const limits = [0, 5000];
  const roleSets = [[], ['Assistant Technician', 'Technician']];
  assert.equal(Docs.ACTIONS.length, 28);
  for (const roles of roleSets) {
    for (const limit of limits) {
      expectOk(env.docs.setConfig({ storeRoles: roles, adjustLimitPaise: limit }, env.ctxPin(OWNER)));
      for (const sess of SESSIONS) {
        const kind = sess.kind === 'staff' && roles.includes(sess.s.role) ? 'store' : sess.kind;
        for (const action of Docs.ACTIONS) {
          const got = env.docs.can(action, sess.s);
          const want = expected(action, kind, limit);
          const label = `${sess.name} | ${action} | roles=${roles.length} limit=${limit}`;
          assert.equal(got.ok, want.ok, label);
          assert.equal(got.needsPin, want.needsPin, label);
          if (!want.ok) assert.equal(got.code, want.code, label);
        }
      }
    }
  }
  // old draft names map onto the same rules
  assert.deepEqual(env.docs.can('ADJUST_REJECT', MANAGER), env.docs.can('PROPOSAL_REJECT', MANAGER));
  assert.deepEqual(env.docs.can('REVERSE_CSL', MANAGER), env.docs.can('REVERSE_COUNTER_SALE', MANAGER));
  assert.equal(env.docs.can('MAKE_COFFEE', OWNER).code, 'INPUT_INVALID');
  assert.equal(env.docs.can(5, OWNER).code, 'INPUT_INVALID');
  // can() never trusts a broken session
  for (const [name, bad] of BROKEN) {
    const r = env.docs.can('VIEW', bad);
    assert.equal(r.ok, false, name);
    assert.equal(r.code, 'SESSION_REQUIRED', name);
  }
});

test('the role table is enforced by the calls themselves, one call per action, for every shell session', () => {
  for (const sess of SESSIONS) {
    const env = makeEnv({ parts: ['P-1', 'P-2', 'P-3', 'P-4'], saleable: ['P-1'] });
    env.clock.advance(1000);
    expectOk(env.docs.setConfig({ storeRoles: ['Assistant Technician', 'Technician'], adjustLimitPaise: 0 }, env.ctxPin(OWNER)));
    const kind = sess.kind === 'staff' && ['Assistant Technician', 'Technician'].includes(sess.s.role) ? 'store' : sess.kind;
    const anyStore = kind !== 'staff';
    const mgr = kind === 'owner' || kind === 'manager';
    // set-up done by the Manager: stock, an issue, an adjustment proposal, an old part
    env.grn([{ partCode: 'P-1', qtyReceived: 50, unitCostPaise: 1000 }, { partCode: 'P-2', qtyReceived: 50, unitCostPaise: 1000 }]);
    const iss = env.issue('WS-1', [{ partCode: 'P-2', qty: 10 }]);
    const prop = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-2', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], note: 'count differs' }, env.ctx(MANAGER)));
    const prop2 = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-2', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], note: 'count differs' }, env.ctx(MANAGER)));
    const old = expectOk(env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM' }, env.ctx(MANAGER)));
    const grn = env.grn([{ partCode: 'P-3', qtyReceived: 5, unitCostPaise: 100 }]);
    const csl = expectOk(env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 1, unitPricePaise: 100 }] }, env.ctx(MANAGER)));
    const oc = env.ctx.bind(env);
    const check = (label, res, allowed, code = 'NOT_ALLOWED') => {
      if (allowed) assert.equal(res.ok, true, `${sess.name} | ${label} should work: ${JSON.stringify(res).slice(0, 200)}`);
      else { assert.equal(res.ok, false, `${sess.name} | ${label} should be refused`); assert.equal(res.code, code, `${sess.name} | ${label}`); }
    };
    const s = sess.s;
    const guarded = (fn) => unchanged(env, fn);
    const attempt = (label, allowed, fn, code) => check(label, allowed ? fn() : guarded(fn), allowed, code);
    attempt('receive', anyStore, () => env.docs.receiveGoods({ supplierInvoiceNo: 'RL-' + Math.random().toString(36).slice(2), supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-4', qtyReceived: 1, unitCostPaise: 10 }] }, oc(s)));
    attempt('issue', anyStore, () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 1 }] }, oc(s)));
    attempt('return', anyStore, () => env.docs.returnFromJob({ jobId: 'WS-1', lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, oc(s)));
    attempt('counter sale', anyStore, () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 1, unitPricePaise: 100 }] }, oc(s)));
    attempt('propose adjustment', anyStore, () => env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], note: 'count differs' }, oc(s)));
    attempt('register old part', anyStore, () => env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old strap', qty: 1, state: 'SCRAP_PENDING' }, oc(s)));
    attempt('move old part', mgr, () => env.docs.moveOldPart(old.row.no, { to: 'CUSTOMER_RETURNED' }, oc(s)));
    attempt('reject proposal', mgr, () => env.docs.rejectAdjustment(prop.proposalId, 'not needed after all', oc(s)));
    // approving: the Manager has limit 0; the Owner needs a PIN
    attempt('approve (no PIN)', false, () => env.docs.approveAdjustment(prop2.proposalId, oc(s)), kind === 'owner' ? 'PIN_REQUIRED' : (kind === 'manager' ? 'ABOVE_MANAGER_LIMIT' : 'NOT_ALLOWED'));
    attempt('approve (with PIN)', kind === 'owner', () => env.docs.approveAdjustment(prop2.proposalId, env.ctxPin(s)), kind === 'manager' ? 'ABOVE_MANAGER_LIMIT' : 'NOT_ALLOWED');
    attempt('reverse GRN', kind === 'owner', () => env.docs.reverseDoc(grn.doc.no, 'wrong delivery entered', env.ctxPin(s)));
    attempt('reverse counter sale', mgr, () => env.docs.reverseDoc(csl.doc.no, 'wrong part sold', oc(s)));
    attempt('settings', kind === 'owner', () => env.docs.setConfig({ adjustLimitPaise: 10 }, env.ctxPin(s)));
    // withdraw: only the proposer or the Owner; nobody else, whatever their rights
    const wprop = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], note: 'count differs' }, env.ctx(MANAGER2)));
    attempt('withdraw other person proposal', kind === 'owner', () => env.docs.withdrawAdjustment(wprop.proposalId, oc(s)));
  }
});

test('broken sessions are refused every write, nothing is written', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'], saleable: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 50, unitCostPaise: 1000 }]);
  const iss = env.issue('WS-1', [{ partCode: 'P-1', qty: 5 }]);
  const prop = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)));
  const open = expectOk(env.docs.proposeOpening({ lines: [{ partCode: 'P-2', qty: 1, unitCostPaise: 5 }] }, env.ctx(MANAGER)));
  const old = expectOk(env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old crown', qty: 1, state: 'SCRAP_PENDING' }, env.ctx(MANAGER)));
  const grn = env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 10 }]);
  const calls = (ctx) => [
    () => env.docs.receiveGoods({ supplierInvoiceNo: 'B-1', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyReceived: 1, unitCostPaise: 10 }] }, ctx),
    () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 1 }] }, ctx),
    () => env.docs.returnFromJob({ jobId: 'WS-1', lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, ctx),
    () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 1, unitPricePaise: 1 }] }, ctx),
    () => env.docs.proposeOpening({ lines: [{ partCode: 'P-2', qty: 1, unitCostPaise: 5 }] }, ctx),
    () => env.docs.approveOpening(open.proposalId, ctx),
    () => env.docs.rejectOpening(open.proposalId, 'not wanted now', ctx),
    () => env.docs.withdrawOpening(open.proposalId, ctx),
    () => env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, ctx),
    () => env.docs.approveAdjustment(prop.proposalId, ctx),
    () => env.docs.rejectAdjustment(prop.proposalId, 'not wanted now', ctx),
    () => env.docs.withdrawAdjustment(prop.proposalId, ctx),
    () => env.docs.reverseDoc(grn.doc.no, 'wrong delivery entered', ctx),
    () => env.docs.registerOldPart({ jobId: 'WS-1', partText: 'x', qty: 1, state: 'HELD_FOR_CLAIM' }, ctx),
    () => env.docs.moveOldPart(old.row.no, { to: 'HELD_FOR_CLAIM', note: 'move it back' }, ctx),
    () => env.docs.signOffScrap({ month: '2026-10', oldNos: [old.row.no] }, ctx),
    () => env.docs.setConfig({ adjustLimitPaise: 5 }, ctx)
  ];
  const pin = env.pin();
  for (const [name, bad] of BROKEN) {
    for (const extra of [{}, { stepUp: pin }]) {
      const ctx = { session: bad, clientRef: env.ref(), ...extra };
      calls(ctx).forEach((fn, i) => {
        const r = unchanged(env, fn);
        assert.equal(r.ok, false, `${name} #${i}`);
        assert.equal(r.code, 'SESSION_REQUIRED', `${name} #${i}`);
      });
    }
  }
  // no ctx at all
  for (const ctx of [undefined, null, 5, 'x', {}]) {
    calls(ctx).forEach((fn, i) => assert.equal(unchanged(env, fn).code, 'SESSION_REQUIRED', `ctx ${String(ctx)} #${i}`));
  }
});

test('the session is read afresh on every call: a downgrade between two calls takes the right away', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const ctx = env.ctx(MANAGER);
  expectOk(env.docs.receiveGoods({ supplierInvoiceNo: 'S-1', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 10 }] }, ctx));
  ctx.session = CASHIER;
  ctx.clientRef = env.ref();
  expectFail(unchanged(env, () => env.docs.receiveGoods({ supplierInvoiceNo: 'S-2', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 10 }] }, ctx)), 'NOT_ALLOWED');
  ctx.session = MANAGER;
  expectOk(env.docs.receiveGoods({ supplierInvoiceNo: 'S-2', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 10 }] }, ctx));
});

test('a PIN given to the Owner is not worth anything once the session is no longer the Owner', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 10 }]);
  const p = expectOk(env.docs.proposeOpening({ lines: [{ partCode: 'P-2', qty: 1, unitCostPaise: 5 }] }, env.ctx(MANAGER)));
  const stepUp = env.pin();
  const o = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)));
  for (const s of [MANAGER, CASHIER, KEEPER]) {
    expectFail(unchanged(env, () => env.docs.approveAdjustment(o.proposalId, { session: s, stepUp, clientRef: env.ref() })), s === MANAGER ? 'WRITEOFF_OWNER_ONLY' : 'NOT_ALLOWED');
    expectFail(unchanged(env, () => env.docs.setConfig({ adjustLimitPaise: 1 }, { session: s, stepUp, clientRef: env.ref() })), 'NOT_ALLOWED');
    expectFail(unchanged(env, () => env.docs.approveOpening(p.proposalId, { session: s, stepUp, clientRef: env.ref() })), 'NOT_ALLOWED');
    expectFail(unchanged(env, () => env.docs.signOffScrap({ month: '2026-10', oldNos: ['x'] }, { session: s, stepUp, clientRef: env.ref() })), 'NOT_ALLOWED');
  }
  expectOk(env.docs.approveOpening(p.proposalId, { session: OWNER, stepUp, clientRef: env.ref() }));
});

test('a PIN stamp helps for the one action only when it is fresh; the clock is the injected clock', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 5, unitCostPaise: 10 }]);
  const stamp = env.pin();
  env.clock.advance(119000);
  const p = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)));
  const done = expectOk(env.docs.approveAdjustment(p.proposalId, { session: OWNER, stepUp: stamp, clientRef: env.ref() }));
  assert.equal(done.doc.approval.pinAt, stamp.at);
  const q = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -1, reason: 'LOST' }], note: 'cannot find' }, env.ctx(MANAGER)));
  env.clock.advance(2000);
  expectFail(unchanged(env, () => env.docs.approveAdjustment(q.proposalId, { session: OWNER, stepUp: stamp, clientRef: env.ref() })), 'PIN_REQUIRED');
});

test('negative stock: Owner override on an issue only, with the PIN and a note of 3 or more characters', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'], saleable: ['P-1'] });
  env.clock.advance(1000);
  env.grn([{ partCode: 'P-1', qtyReceived: 2, unitCostPaise: 1000 }]);
  const over = (extra = {}, ctx = env.ctxPin(OWNER)) => env.docs.issueToJob({ jobId: 'WS-1', note: 'shelf has them', lines: [{ partCode: 'P-1', qty: 5, allowNegative: true }], ...extra }, ctx);
  expectFail(unchanged(env, () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 5 }] }, env.ctxPin(OWNER))), 'INSUFFICIENT_STOCK');
  for (const s of [MANAGER, CASHIER, KEEPER]) expectFail(unchanged(env, () => over({}, env.ctxPin(s))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => over({}, env.ctx(OWNER))), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => over({ note: 'ok' })), 'OVERRIDE_NOTE_REQUIRED');
  expectFail(unchanged(env, () => over({ note: '' })), 'OVERRIDE_NOTE_REQUIRED');
  expectFail(unchanged(env, () => over({ note: undefined })), 'OVERRIDE_NOTE_REQUIRED');
  // a part that never had a layer needs a cost for the shortfall
  expectFail(unchanged(env, () => env.docs.issueToJob({ jobId: 'WS-1', note: 'shelf has them', lines: [{ partCode: 'P-2', qty: 1, allowNegative: true }] }, env.ctxPin(OWNER))), 'COST_REQUIRED');
  const ok2 = expectOk(env.docs.issueToJob({ jobId: 'WS-1', note: 'shelf has them', lines: [{ partCode: 'P-2', qty: 1, allowNegative: true, unitCostPaise: 700 }] }, env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-2'), -1);
  assert.equal(ok2.doc.mv[0].debt.unitCostPaise, 700);
  const r = expectOk(over());
  assert.equal(env.onHand('P-1'), -3);
  assert.equal(r.doc.lines[0].override.note, 'shelf has them');
  assert.equal(r.doc.mv[0].debt.qty, 3);
  assert.equal(r.doc.mv[0].debt.unitCostPaise, 1000);
  assert.equal(r.doc.mv[0].approval.by, 'Test Owner');
  assert.equal(env.value('P-1'), -3000);
  // allowNegative with enough stock changes nothing and records no override
  env.grn([{ partCode: 'P-1', qtyReceived: 10, unitCostPaise: 1300 }]);
  const fine = expectOk(env.docs.issueToJob({ jobId: 'WS-1', note: 'safe anyway', lines: [{ partCode: 'P-1', qty: 2, allowNegative: true }] }, env.ctxPin(OWNER)));
  assert.equal(fine.doc.lines[0].override, null);
  // counter sale and adjustments never go below zero, whoever asks
  expectFail(unchanged(env, () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 99, unitPricePaise: 1, allowNegative: true }] }, env.ctxPin(OWNER))), 'INSUFFICIENT_STOCK');
  expectFail(unchanged(env, () => env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -99, reason: 'LOST', allowNegative: true }], note: 'cannot find' }, env.ctxPin(OWNER))), 'INSUFFICIENT_STOCK');
  // a restart reads the same books
  const again = env.reopen();
  assert.equal(Fifo.partBalance(again.fifoState(), 'P-2').qty, -1);
  assert.equal(again.status().lastSeq, env.docs.status().lastSeq);
});

test('the same shell name can be both a store role and a refused one: a role removed from settings loses the right at once', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  expectOk(env.docs.setConfig({ storeRoles: ['Cashier'] }, env.ctxPin(OWNER)));
  expectOk(env.docs.receiveGoods({ supplierInvoiceNo: 'K-1', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyReceived: 1, unitCostPaise: 10 }] }, env.ctx(CASHIER)));
  expectOk(env.docs.setConfig({ storeRoles: [] }, env.ctxPin(OWNER)));
  expectFail(unchanged(env, () => env.docs.receiveGoods({ supplierInvoiceNo: 'K-2', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyReceived: 1, unitCostPaise: 10 }] }, env.ctx(CASHIER))), 'NOT_ALLOWED');
  // Store Manager as a "store role" has no effect on Manager rights and nobody can add Owner
  expectFail(unchanged(env, () => env.docs.setConfig({ storeRoles: ['Owner'] }, env.ctxPin(OWNER))), 'INPUT_INVALID');
});
