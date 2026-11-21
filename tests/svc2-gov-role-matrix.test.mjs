// Service wave 2, governance T6: the single role table of PLAN-service-wave-2.md 2.11 over every S15 session, run against the REAL billing facade.
// Sessions come from tests/lib/fix-s15-role-table.mjs (10 shell sessions plus 5 broken ones) and are turned into session() answers by the real
// www/shared/module-runtime.js. The expected answers below are written from the plan table, not read from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realSession, tierOf, loadApi, BILLING } from './lib/svc2-gov-common.mjs';
import { makeBillingEnv, seedFlow, govJobs, jsonOf, estimateAndApprove } from './lib/svc2-gov-env.mjs';
import { SESSIONS, BROKEN } from './lib/fix-s15-role-table.mjs';

const ALL = [...SESSIONS.map((s) => ({ name: s.name, kind: 'shell', read: s.read })), ...BROKEN.map((s) => ({ name: 'BROKEN ' + s.name, kind: 'broken', read: s.read }))];
const sessionOf = (e) => realSession(e.read);
const ownerS = () => realSession(SESSIONS[0].read);
const managerS = () => realSession(SESSIONS.find((x) => x.name === 'role Store Manager').read);
const roleS = (name) => realSession(SESSIONS.find((x) => x.name === 'role ' + name).read);

// Plan 2.11, one row per action id. cfg = {billingRoles, estimateRoles, storeRoles}. Returns {ok, pin?}.  pin undefined = not pinned down by the plan table.
function expected(action, s, cfg) {
  const t = tierOf(s);
  if (t === 'none') return { ok: false };
  const own = t === 'owner', mgr = t === 'manager';
  const staff = t === 'staff';
  const billing = staff && cfg.billingRoles.indexOf(s.role) >= 0;
  const est = staff && cfg.estimateRoles.indexOf(s.role) >= 0;
  const store = staff && cfg.storeRoles.indexOf(s.role) >= 0;
  switch (action) {
    case 'VIEW_STATUS': return { ok: true, pin: false };
    case 'VIEW': case 'VIEW_AMOUNTS': return { ok: billing || mgr || own, pin: false };
    case 'VIEW_COST': case 'VIEW_SUMMARY': case 'VIEW_LISTS': case 'VIEW_REGISTERS': return { ok: mgr || own, pin: false };
    case 'EST_SAVE': case 'EST_APPROVE': return { ok: est || billing || mgr || own, pin: false };
    case 'EST_OTHER_LINE': case 'ADD_OTHER_LINE': return { ok: mgr || own, pin: false };
    case 'INV_APPROVAL_OVERRIDE': case 'APPROVAL_OVERRIDE': case 'NOT_IN_CCPT': return { ok: own, pin: own };
    case 'RECEIPT_TAKE': case 'RECEIPT_ADVANCE': case 'RECEIPT_BALANCE': return { ok: billing || mgr || own, pin: false };
    case 'COUNTER_RECEIPT': return { ok: store || billing || mgr || own, pin: false };
    case 'INV_ISSUE': return { ok: billing || mgr || own, pin: false };
    case 'DISCOUNT': return { ok: own || (mgr && cfg.limit > 0) };   // a Manager may discount only inside a limit the Owner set; at Rs 0 nothing is inside it
    case 'DISCOUNT_ABOVE_LIMIT': return { ok: own, pin: own };
    case 'INV_ISSUE_NOT_IN_CCPT': return { ok: own, pin: own };
    case 'CCPT_LINK': case 'CCPT_ADD': return { ok: billing || mgr || own };
    case 'CCPT_CHANGE': return { ok: own, pin: own };
    case 'INV_CANCEL': case 'CN_ISSUE': case 'REFUND': case 'REVERSE_REFUND': case 'NCS_CANCEL': case 'JOB_VOID': case 'DECIDE_LEGACY': case 'IMPORT_LEGACY': case 'BCFG_SET':
      return { ok: own, pin: own };
    case 'REVERSE_RECEIPT': return { ok: mgr || own, pin: false };
    case 'NCS_ISSUE': return { ok: mgr || own, pin: false };
    case 'RETURN': case 'CN_RETURN': case 'CN_STOCK_RETURN': return { ok: store || mgr || own, pin: false };
    default: throw new Error('no expectation for action ' + action + ': the plan table has no row for it (add a row to the test, or the action is not in plan 2.11)');
  }
}

const CONFIGS = [
  { name: 'default (billing roles none, estimate roles Technician and Assistant Technician)', billingRoles: [], estimateRoles: ['Technician', 'Assistant Technician'], storeRoles: [], limit: 0 },
  { name: 'billing roles Cashier and CRO, estimate roles Trainee, store role Greeter', billingRoles: ['Cashier', 'CRO'], estimateRoles: ['Trainee'], storeRoles: ['Greeter'], limit: 5000 },
  { name: 'billing role Technician, no estimate roles, store roles Cashier and Technician', billingRoles: ['Technician'], estimateRoles: [], storeRoles: ['Cashier', 'Technician'], limit: 0 }
];

function envWith(cfg) {
  const env = makeBillingEnv({ jobs: govJobs() });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const owner = ownerS();
  const a = env.bill.setConfig({ discountLimitPaise: cfg.limit, billingRoles: cfg.billingRoles, estimateRoles: cfg.estimateRoles }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.ok(a.ok === true || a.code === 'NO_CHANGE', 'owner sets the billing config: ' + JSON.stringify(a));
  if (cfg.storeRoles.length) {
    const b = env.core1.setConfig({ adjustLimitPaise: 0, storeRoles: cfg.storeRoles }, env.ctx(owner, { stepUp: env.stamp() }));
    assert.equal(b.ok, true, 'owner sets the Phase 1 store roles: ' + JSON.stringify(b));
  }
  return env;
}
function actionList(env) {
  const names = new Set();
  for (const lib of [env.libs.docsLib, env.libs.moneyLib]) {
    const ra = lib.ROLE_ACTIONS;
    assert.ok(Array.isArray(ra) || (ra && typeof ra === 'object'), 'a billing layer exports ROLE_ACTIONS');
    for (const a of (Array.isArray(ra) ? ra : Object.keys(ra))) names.add(a);
  }
  return [...names].sort();
}

test('T6.0 the session table is the S15 table: 10 shell sessions and 5 broken ones, mapped by the real runtime', () => {
  assert.equal(SESSIONS.length, 10);
  assert.equal(BROKEN.length, 5);
  assert.equal(ALL.filter((e) => sessionOf(e).isOwner).length, 2);
  for (const e of ALL.filter((x) => x.kind === 'broken')) {
    const s = sessionOf(e);
    if (e.name.includes('truthy but not true')) { assert.equal(s.ok, true); assert.equal(s.tier, 'staff'); assert.equal(s.isManager, false, 'a truthy value is not a manager'); }
    else { assert.equal(s.ok, false, e.name); assert.equal(s.tier, 'none', e.name); }
  }
  assert.equal(sessionOf(ALL.find((e) => e.name === 'role Store Manager')).tier, 'manager');
  assert.equal(sessionOf(ALL.find((e) => e.name === 'role Cashier')).tier, 'staff');
});

for (const cfg of CONFIGS) {
  test(`T6.1 can() matrix, ${cfg.name}: every session times every action equals the plan table`, () => {
    const env = envWith(cfg);
    const actions = actionList(env);
    assert.ok(actions.length >= 20, 'the billing layers name their actions (docs and money)');
    const wrong = [];
    for (const e of ALL) {
      const s = sessionOf(e);
      for (const a of actions) {
        const want = expected(a, s, cfg);
        const got = env.bill.can(a, s);
        if (!got || typeof got.ok !== 'boolean') { wrong.push(`${e.name} ${a}: no boolean ok`); continue; }
        if (got.ok !== want.ok) wrong.push(`${e.name} ${a}: ok ${got.ok}, plan says ${want.ok}`);
        else if (want.ok && want.pin !== undefined && got.needsPin !== want.pin) wrong.push(`${e.name} ${a}: needsPin ${got.needsPin}, plan says ${want.pin}`);
        if (!want.ok && tierOf(s) === 'none' && got.code !== 'SESSION_REQUIRED') wrong.push(`${e.name} ${a}: broken session must give SESSION_REQUIRED, got ${got.code}`);
        if (!got.ok && typeof got.code !== 'string') wrong.push(`${e.name} ${a}: a refusal carries a code`);
      }
    }
    assert.deepEqual(wrong.slice(0, 15), [], `${wrong.length} wrong answers`);
  });
}

test('T6.2 deny by default: an action name the plan does not know is refused for everyone, even the Owner', () => {
  const env = envWith(CONFIGS[0]);
  for (const e of ALL) for (const a of ['NO_SUCH_ACTION', 'ADMIN', '', 'EST_SAVE ', '__proto__', 'constructor']) {
    const r = env.bill.can(a, sessionOf(e));
    assert.equal(r.ok, false, `${e.name} must not be allowed "${a}"`);
  }
});

test('T6.3 can() never trusts an inconsistent session object: a tier that disagrees with the flags, a truthy text, junk or nothing is refused for every Owner-only row (the real session here is a Cashier)', () => {
  const env = envWith(CONFIGS[0]);
  env.as(roleS('Cashier'));   // a missing argument falls back to the provider, which holds a plain Cashier
  const forged = [
    { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'owner', actorName: 'x' },
    { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'manager', actorName: 'x' },
    { ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'none', actorName: 'x' },
    { ok: 'true', isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'x' },
    { ok: true, isOwner: false, isManager: false, role: 'Store Manager', tier: 'staff', actorName: 'x' },
    { ok: true, isOwner: 'yes', isManager: 1, role: 'Cashier', tier: 'owner', actorName: 'x' },
    null, undefined, 'owner', 42, {}
  ];
  for (const f of forged) {
    for (const a of ['INV_CANCEL', 'CN_ISSUE', 'REFUND', 'JOB_VOID', 'BCFG_SET', 'IMPORT_LEGACY', 'DECIDE_LEGACY', 'VIEW_COST', 'VIEW_SUMMARY', 'NOT_IN_CCPT', 'APPROVAL_OVERRIDE']) {
      assert.equal(env.bill.can(a, f).ok, false, JSON.stringify(f) + ' must not be allowed ' + a);
    }
  }
  env.as(sessionOf(ALL.find((e) => e.name === 'BROKEN no shell session API')));
  assert.equal(env.bill.can('INV_CANCEL').code, 'SESSION_REQUIRED', 'no argument and a broken provider session: SESSION_REQUIRED');
});

// ----- the single role table is the money layer's table too -----
test('T6.4 docs and money agree: the facade answers every money action exactly as the money layer table of plan 2.11 says (one table, no second copy)', () => {
  const env = envWith(CONFIGS[1]);
  const cfg = CONFIGS[1];
  const moneyActions = Array.from(env.libs.moneyLib.ROLE_ACTIONS);
  const map = { VIEW_STATUS: 'VIEW_STATUS', VIEW_AMOUNTS: 'VIEW_AMOUNTS', RECEIPT_TAKE: 'RECEIPT_TAKE', COUNTER_RECEIPT: 'COUNTER_RECEIPT', REVERSE_RECEIPT: 'REVERSE_RECEIPT', REVERSE_REFUND: 'REVERSE_REFUND', REFUND: 'REFUND', DECIDE_LEGACY: 'DECIDE_LEGACY', VIEW_SUMMARY: 'VIEW_SUMMARY' };
  const wrong = [];
  for (const e of ALL) {
    const s = sessionOf(e);
    for (const a of moneyActions) {
      assert.ok(map[a], 'no expectation for money action ' + a);
      const want = expected(map[a], s, cfg);
      const got = env.bill.can(a, s);
      if (got.ok !== want.ok) wrong.push(`${e.name} ${a}: ok ${got.ok}, plan says ${want.ok}`);
    }
  }
  assert.deepEqual(wrong.slice(0, 10), []);
});

// ----- writes: a refusal writes nothing -----
function seeded() {
  const env = makeBillingEnv({ jobs: govJobs() });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const owner = ownerS();
  const manager = managerS();
  seedFlow(env, { owner, manager });
  const cfg = env.bill.setConfig({ discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician', 'Assistant Technician'] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(cfg.ok, true, JSON.stringify(cfg));
  return { env, owner, manager };
}
const estimate = (jobId) => ({ jobId, lines: [{ kind: 'LABOUR', code: 'LAB-1', qty: 1 }], recipientGstin: '', recipientStateCode: '27', reason: '', note: '' });

test('T6.5 broken sessions: every billing write and every read is refused with SESSION_REQUIRED and storage is byte-for-byte unchanged', () => {
  const { env } = seeded();
  const before = env.fingerprint();
  const sets = env.adapter.setCount;
  const B = env.bill;
  const probes = [
    ['saveEstimate', (c) => B.saveEstimate(estimate('WS-2026-008'), c)],
    ['takeReceipt', (c) => B.takeReceipt({ jobId: 'WS-2026-001', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, c)],
    ['voidJob', (c) => B.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, c)],
    ['setConfig', (c) => B.setConfig({ discountLimitPaise: 100, billingRoles: [], estimateRoles: [] }, c)],
    ['getJob', (c) => B.getJob('WS-2026-001', c)],
    ['daySummary', (c) => B.daySummary('2026-11-13', c)],
    ['listBills', (c) => B.listBills({}, c)],
    ['advancesHeld', (c) => B.advancesHeld({}, c)]
  ];
  const failures = [];
  for (const e of ALL.filter((x) => x.kind === 'broken' && !x.name.includes('truthy'))) {
    const s = sessionOf(e);
    env.pin(0);
    for (const [name, call] of probes) {
      const r = call(env.ctx(s, { stepUp: env.stamp() }));
      if (!r || r.ok !== false) failures.push(e.name + ' ' + name + ' was not refused');
      else if (r.code !== 'SESSION_REQUIRED') failures.push(e.name + ' ' + name + ' gave ' + r.code);
    }
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.equal(env.adapter.setCount, sets, 'no storage write at all');
  assert.equal(env.fingerprint(), before);
});

test('T6.6 staff roles: a role in no list is refused every write and sees no amounts; each listed role gets exactly its own rows; nothing is written on a refusal', () => {
  const { env } = seeded();
  const B = env.bill;
  const trainee = roleS('Trainee'), tech = roleS('Technician'), cashier = roleS('Cashier');
  const before = env.fingerprint();
  const sets = env.adapter.setCount;
  // plain staff (Trainee, in no list)
  assert.equal(B.saveEstimate(estimate('WS-2026-008'), env.ctx(trainee)).ok, false, 'a role in no list cannot save an estimate');
  assert.equal(B.takeReceipt({ jobId: 'WS-2026-001', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, env.ctx(trainee)).ok, false);
  assert.equal(B.getJob('WS-2026-001', env.ctx(trainee)).ok === true && JSON.stringify(B.getJob('WS-2026-001', env.ctx(trainee))).includes('totalPaise'), false, 'no amounts for plain staff');
  // estimate staff (Technician): estimate yes, receipt no, issue no
  assert.equal(B.takeReceipt({ jobId: 'WS-2026-001', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, env.ctx(tech)).ok, false, 'estimate staff cannot take money');
  // billing staff (Cashier): receipt yes, cancel no, discount no, void no
  assert.equal(B.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, env.ctx(cashier, { stepUp: env.stamp() })).ok, false);
  assert.equal(env.adapter.setCount, sets, 'the refusals so far wrote nothing');
  assert.equal(env.fingerprint(), before);
  const est = B.saveEstimate(estimate('WS-2026-008'), env.ctx(tech));
  assert.equal(est.ok, true, 'estimate staff saves an estimate: ' + JSON.stringify(est));
  const rc = B.takeReceipt({ jobId: 'WS-2026-008', kind: 'advance', amountPaise: 5000, payMode: 'Cash', payRef: '', note: '' }, env.ctx(cashier));
  assert.equal(rc.ok, true, 'billing staff takes an advance: ' + JSON.stringify(rc));
});

test('T6.7 Store Manager discount: refused at the default limit of Rs 0, allowed within a limit the Owner sets, refused above it; staff can never discount', () => {
  const { env, owner, manager } = seeded();
  const B = env.bill;
  const cashier = roleS('Cashier');
  estimateAndApprove(env, manager, 'WS-2026-009', [{ kind: 'LABOUR', code: 'LAB-1', qty: 1 }]);
  const draft = B.prepareBill('WS-2026-009', env.ctx(manager));
  assert.equal(draft.ok, true, JSON.stringify(draft));
  const mk = (disc) => Object.assign({ mode: 'CCPT_BILLED', ccptInvoiceNo: 'CCPT-INV-0009', notInCcptReason: '', approvalOverrideReason: '', note: '' }, draft.draft || draft.input || draft, { jobId: 'WS-2026-009', billDiscountPaise: disc, discountReason: disc ? 'invented goodwill' : '' });
  const before = env.fingerprint();
  assert.equal(B.issueBill(mk(100), env.ctx(manager)).ok, false, 'limit 0: the Manager cannot discount');
  assert.equal(B.issueBill(mk(100), env.ctx(cashier)).ok, false, 'billing staff cannot discount');
  assert.equal(env.fingerprint(), before, 'refusals wrote nothing');
  const set = B.setConfig({ discountLimitPaise: 10000, billingRoles: ['Cashier'], estimateRoles: ['Technician'] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(B.issueBill(mk(20000), env.ctx(manager)).ok, false, 'above the Rs 100 limit the Manager is refused');
  assert.equal(B.issueBill(mk(100), env.ctx(cashier)).ok, false, 'billing staff still cannot discount');
  const ok = B.issueBill(mk(100), env.ctx(manager));
  assert.equal(ok.ok, true, 'within the limit the Manager may: ' + JSON.stringify(ok));
});

test('T6.8 the billing role list is read fresh: a role added or removed by the Owner changes the answer at once; Store Manager cannot be put in the list', () => {
  const env = envWith(CONFIGS[0]);
  const owner = ownerS();
  const cashier = roleS('Cashier');
  assert.equal(env.bill.can('RECEIPT_TAKE', cashier).ok, false, 'default: no billing roles');
  let r = env.bill.setConfig({ discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician'] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.bill.can('RECEIPT_TAKE', cashier).ok, true, 'added: allowed at once');
  r = env.bill.setConfig({ discountLimitPaise: 0, billingRoles: [], estimateRoles: ['Technician'] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, true);
  assert.equal(env.bill.can('RECEIPT_TAKE', cashier).ok, false, 'removed: refused at once');
  const before = env.fingerprint();
  r = env.bill.setConfig({ discountLimitPaise: 0, billingRoles: ['Store Manager'], estimateRoles: [] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, false, 'Store Manager inside billingRoles is refused');
  r = env.bill.setConfig({ discountLimitPaise: 0, billingRoles: ['Owner'], estimateRoles: [] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, false, 'Owner inside billingRoles is refused');
  r = env.bill.setConfig({ discountLimitPaise: -1, billingRoles: [], estimateRoles: [] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, false, 'a negative limit is refused');
  r = env.bill.setConfig({ discountLimitPaise: 100000001, billingRoles: [], estimateRoles: [] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, false, 'a limit above Rs 10,00,000 is refused');
  assert.equal(env.fingerprint(), before, 'refusals wrote nothing');
});

test('T6.9 each layer exports its ROLE_ACTIONS frozen, every name is a plain upper-case id, and every name of either list is covered by the plan table of this test (deny by default)', () => {
  const docs = loadApi(BILLING.find((f) => f.key === 'docs'));
  const money = loadApi(BILLING.find((f) => f.key === 'money'));
  assert.ok(docs && money, 'waiting on writers: billing docs and money');
  for (const [name, lib] of [['docs', docs], ['money', money]]) {
    assert.ok(lib.ROLE_ACTIONS, name + ' exports ROLE_ACTIONS');
    assert.equal(Object.isFrozen(lib.ROLE_ACTIONS), true, name + ' ROLE_ACTIONS is frozen');
    const list = Array.isArray(lib.ROLE_ACTIONS) ? lib.ROLE_ACTIONS : Object.keys(lib.ROLE_ACTIONS);
    for (const a of list) {
      assert.match(a, /^[A-Z][A-Z0-9_]+$/, a);
      assert.doesNotThrow(() => expected(a, { ok: true, isOwner: true, isManager: true, role: 'Store Manager' }, CONFIGS[0]), 'the plan table has a row for ' + a);
    }
  }
  void jsonOf;
});
