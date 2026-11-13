// Service wave 1, governance T6: the role table of PLAN section 2.10 over every S15 session, run against the REAL core and documents layers.
// Sessions come from tests/lib/fix-s15-role-table.mjs and are turned into session() answers by the real www/shared/module-runtime.js.
// The expected answers below are written from the plan table, not read from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exists } from './lib/svc1-gov-common.mjs';
import { realSession } from './lib/svc1-gov-common.mjs';
import { makeGovEnv, jsonOf, seedFlow, leakyJob } from './lib/svc1-gov-env.mjs';
import { SESSIONS, BROKEN } from './lib/fix-s15-role-table.mjs';

const ALL = [...SESSIONS.map((s) => ({ name: s.name, kind: 'shell', read: s.read })), ...BROKEN.map((s) => ({ name: 'BROKEN ' + s.name, kind: 'broken', read: s.read }))];
const sessionOf = (e) => realSession(e.read);

const tierOf = (s) => (!s.ok ? 'none' : s.isOwner ? 'owner' : s.isManager ? 'manager' : 'staff');

// Plan 2.10, one row per action name of the documents layer (and the extra names of the core). cfg = {storeRoles, limit}.
// Returns {ok, pin} or {ok:false}. pin undefined = not pinned down by the plan table (only ok is checked).
function expected(action, s, cfg) {
  const t = tierOf(s);
  if (t === 'none') return { ok: false };
  const own = t === 'owner', mgr = t === 'manager';
  const storeClass = t === 'staff' && cfg.storeRoles.indexOf(s.role) >= 0;
  const stock = own || mgr || storeClass;
  switch (action) {
    case 'VIEW': case 'VIEW_QTY': return { ok: true, pin: false };
    case 'VIEW_COST': case 'VIEW_LEDGER': case 'MASTERS_EDIT': case 'MASTER_EDIT': return { ok: own || mgr, pin: false };
    case 'MASTERS_REMOVE': case 'MASTER_REMOVE': return { ok: own, pin: own ? true : false };
    case 'OPENING_PROPOSE': case 'RECEIVE': case 'ISSUE': case 'RETURN': case 'COUNTER_SALE': case 'ADJUST_PROPOSE': case 'OLD_REGISTER':
      return { ok: stock, pin: false };
    case 'OPENING_APPROVE': return { ok: own, pin: own };
    case 'NEGATIVE_OVERRIDE': return { ok: own, pin: own };
    case 'ADJUST_APPROVE': return own ? { ok: true, pin: true } : mgr ? { ok: cfg.limit > 0, pin: false } : { ok: false };
    case 'ADJUST_APPROVE_WRITEOFF': return { ok: own, pin: own };
    case 'PROPOSAL_REJECT': return { ok: own || mgr, pin: false };
    case 'PROPOSAL_WITHDRAW': return { ok: stock };
    case 'REVERSE_GRN': case 'REVERSE_ADJUST': return { ok: own, pin: own };
    case 'REVERSE_COUNTER_SALE': return { ok: own || mgr };
    case 'REVERSE_OPENING': case 'REVERSE_ISSUE': case 'REVERSE_RETURN': return { ok: false };
    case 'OLD_MOVE': return { ok: own || mgr, pin: false };
    case 'SCRAP_SIGNOFF': case 'CONFIG_EDIT': case 'ACK_RESTORE': case 'RESTORE_ACK': case 'CLOCK_OVERRIDE': return { ok: own, pin: own };
    default: throw new Error('no expectation for ' + action);
  }
}

const CORE_EXTRA = ['VIEW_QTY', 'VIEW_LEDGER', 'MASTER_EDIT', 'MASTER_REMOVE', 'RESTORE_ACK'];
const CONFIGS = [
  { name: 'default (no store roles, limit 0)', storeRoles: [], limit: 0 },
  { name: 'store roles Cashier and Technician, limit 0', storeRoles: ['Cashier', 'Technician'], limit: 0 },
  { name: 'no store roles, Manager limit 500000 paise', storeRoles: [], limit: 500000 },
  { name: 'every non-manager shell role named, limit 500000', storeRoles: ['Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'], limit: 500000 }
];

function envWith(cfg) {
  assert.ok(exists('www/service-stores-core.js') && exists('www/service-stores-docs.js'), 'waiting on writers: core and docs');
  const env = makeGovEnv();
  const owner = realSession(SESSIONS[0].read);
  assert.equal(env.core.settings().ok, true, 'core opens on a fresh adapter');
  if (cfg.storeRoles.length || cfg.limit) {
    const r = env.core.setConfig({ adjustLimitPaise: cfg.limit, storeRoles: cfg.storeRoles }, env.ctx(owner, { stepUp: env.stamp() }));
    assert.equal(r.ok, true, 'owner sets the config: ' + JSON.stringify(r));
  }
  return env;
}

test('T6.0 the session table is the S15 table: 10 shell sessions and 5 broken ones, mapped by the real runtime', () => {
  assert.equal(SESSIONS.length, 10);
  assert.equal(BROKEN.length, 5);
  const owners = ALL.filter((e) => sessionOf(e).isOwner);
  assert.equal(owners.length, 2);
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
    const docsActions = env.libs.docs.ACTIONS.slice();
    const actions = docsActions.concat(CORE_EXTRA);
    assert.ok(docsActions.length >= 26, 'the documents layer names its actions');
    const wrong = [];
    for (const e of ALL) {
      const s = sessionOf(e);
      for (const a of actions) {
        const want = expected(a, s, cfg);
        const got = env.core.can(a, s);
        if (typeof got.ok !== 'boolean') { wrong.push(`${e.name} ${a}: no boolean ok`); continue; }
        if (got.ok !== want.ok) wrong.push(`${e.name} ${a}: ok ${got.ok}, plan says ${want.ok}`);
        else if (want.ok && want.pin !== undefined && got.needsPin !== want.pin) wrong.push(`${e.name} ${a}: needsPin ${got.needsPin}, plan says ${want.pin}`);
        if (!want.ok && tierOf(s) === 'none' && got.code !== 'SESSION_REQUIRED') wrong.push(`${e.name} ${a}: broken session must give SESSION_REQUIRED, got ${got.code}`);
        if (!got.ok && typeof got.code !== 'string') wrong.push(`${e.name} ${a}: a refusal carries a code`);
      }
    }
    assert.deepEqual(wrong.slice(0, 15), [], `${wrong.length} wrong answers`);
  });
}

test('T6.2 can() never trusts a session object the caller made up: a tier that disagrees with the flags is refused', () => {
  const env = envWith(CONFIGS[0]);
  const forged = [
    { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'owner', actorName: 'x' },
    { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'manager', actorName: 'x' },
    { ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'none', actorName: 'x' },
    { ok: 'true', isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'x' },
    null, undefined, 'owner', 42, {}
  ];
  for (const f of forged) {
    for (const a of ['OPENING_APPROVE', 'CONFIG_EDIT', 'REVERSE_GRN', 'SCRAP_SIGNOFF', 'ADJUST_APPROVE_WRITEOFF', 'VIEW_COST', 'MASTERS_EDIT']) {
      const r = env.core.can(a, f);
      assert.equal(r.ok, false, `${JSON.stringify(f)} must not be allowed ${a}`);
    }
  }
});

// ----- writes: a refusal writes nothing -----
const ownerSession = () => realSession(SESSIONS[0].read);
const managerSession = () => realSession(SESSIONS.find((x) => x.name === 'role Store Manager').read);

// A core that already holds one of everything, so the Owner-only calls below hit real targets (not just "not found").
function seeded(cfg) {
  assert.ok(exists('www/service-stores-core.js') && exists('www/service-stores-docs.js'), 'waiting on writers: core and docs');
  const env = makeGovEnv({ jobs: { 'WS-2026-001': leakyJob('WS-2026-001') } });
  const owner = ownerSession();
  const manager = managerSession();
  const ids = seedFlow(env, { owner, manager });
  if (cfg && (cfg.storeRoles.length || cfg.limit)) {
    const r = env.core.setConfig({ adjustLimitPaise: cfg.limit, storeRoles: cfg.storeRoles }, env.ctx(owner, { stepUp: env.stamp() }));
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  return { env, ids, owner, manager };
}
const ownerPinOps = (ids) => [
  ['approveOpening', (c, x) => c.approveOpening(ids.openingPending, x)],
  ['reverseDoc', (c, x) => c.reverseDoc(ids.grnNo, 'wrong receipt entered', x)],
  ['approveAdjustment', (c, x) => c.approveAdjustment(ids.adjustmentPending, x)],
  ['signOffScrap', (c, x) => c.signOffScrap({ month: '2026-10', oldNos: [ids.oldNo], note: 'month signed off' }, x)],
  ['setConfig', (c, x) => c.setConfig({ adjustLimitPaise: 1000, storeRoles: [] }, x)],
  ['removePart', (c, x) => c.removePart('NEW-2', 'entered by mistake', x)],
  ['removeLabour', (c, x) => c.removeLabour('LAB-1', 'entered by mistake', x)],
  ['acknowledgeRestore', (c, x) => c.acknowledgeRestore({ reason: 'older backup restored on purpose' }, x)]
];
const stockOps = (ids) => [
  ['proposeOpening', (c, x) => c.proposeOpening({ lines: [{ partCode: 'NEW-2', qty: 1, unitCostPaise: 100 }], note: 'x' }, x)],
  ['receiveGoods', (c, x) => c.receiveGoods({ supplierName: 'Titan', supplierInvoiceNo: 'INV-2', supplierInvoiceDate: '2026-11-02', lines: [{ partCode: 'NEW-1', qtyInvoiced: 1, qtyReceived: 1, unitCostPaise: 100 }], note: '' }, x)],
  ['issueToJob', (c, x) => c.issueToJob({ jobId: 'WS-2026-001', billing: 'CHARGEABLE', lines: [{ partCode: 'NEW-1', qty: 1 }], note: '' }, x)],
  ['returnFromJob', (c, x) => c.returnFromJob({ jobId: 'WS-2026-001', lines: [{ issueMovementId: ids.issueMovementId, qty: 1, returnReason: 'UNUSED' }], note: '' }, x)],
  ['counterSale', (c, x) => c.counterSale({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, x)],
  ['proposeAdjustment', (c, x) => c.proposeAdjustment({ lines: [{ partCode: 'NEW-1', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 5000 }], note: 'x' }, x)],
  ['registerOldPart', (c, x) => c.registerOldPart({ jobId: 'WS-2026-001', partCode: 'NEW-1', partText: '', qty: 1, serialRef: '', state: 'HELD_FOR_CLAIM', claimRef: '', note: '' }, x)],
  ['moveOldPart', (c, x) => c.moveOldPart(ids.oldNo, { to: 'CUSTOMER_RETURNED', note: 'handed back' }, x)],
  ['savePart', (c, x) => c.savePart({ code: 'NEW-3', name: 'Invented crown', group: 'Crown', unit: 'pc', reason: 'new part' }, x)],
  ['saveLabour', (c, x) => c.saveLabour({ code: 'LAB-2', name: 'Invented repair', group: 'Service', unit: 'job', reason: 'new item' }, x)],
  ['setPartActive', (c, x) => c.setPartActive('NEW-2', false, 'no longer sold here', x)],
  ['rejectAdjustment', (c, x) => c.rejectAdjustment(ids.adjustmentPending, 'not needed now', x)],
  ['rejectOpening', (c, x) => c.rejectOpening(ids.openingPending, 'not needed now', x)],
  ['withdrawAdjustment', (c, x) => c.withdrawAdjustment(ids.adjustmentPending, x)],
  ['withdrawOpening', (c, x) => c.withdrawOpening(ids.openingPending, x)]
];

test('T6.3 broken and staff sessions: every write is refused and storage is byte-for-byte unchanged', () => {
  const { env, ids } = seeded(CONFIGS[0]);
  const before = env.adapter.fingerprint();
  const sets = env.adapter.setCount;
  const failures = [];
  for (const e of ALL) {
    const s = sessionOf(e);
    if (tierOf(s) === 'owner' || tierOf(s) === 'manager') continue;
    for (const [name, call] of ownerPinOps(ids).concat(stockOps(ids))) {
      const r = call(env.core, env.ctx(s, { stepUp: env.stamp() }));
      if (!r || r.ok !== false) failures.push(e.name + ' ' + name + ' was not refused: ' + JSON.stringify(r).slice(0, 120));
      else if (tierOf(s) === 'none' && r.code !== 'SESSION_REQUIRED') failures.push(e.name + ' ' + name + ': broken session gave ' + r.code);
    }
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.equal(env.adapter.setCount, sets, 'no storage write at all');
  assert.equal(env.adapter.fingerprint(), before);
});

test('T6.4 a Store Manager with a fresh stamp still cannot do an Owner-only action (the stamp is not a role)', () => {
  const { env, ids, manager } = seeded(CONFIGS[0]);
  assert.equal(manager.tier, 'manager');
  const before = env.adapter.fingerprint();
  const sets = env.adapter.setCount;
  for (const [name, call] of ownerPinOps(ids)) {
    const r = call(env.core, env.ctx(manager, { stepUp: env.stamp() }));
    assert.equal(r.ok, false, name + ' must be refused for a Store Manager');
  }
  assert.equal(env.adapter.setCount, sets);
  assert.equal(env.adapter.fingerprint(), before);
});

test('T6.4b a store-class staff role (named by the Owner) with a fresh stamp still cannot do an Owner-only action, and nothing is written', () => {
  const { env, ids } = seeded(CONFIGS[1]);
  const cashier = realSession(SESSIONS.find((x) => x.name === 'role Cashier').read);
  assert.equal(env.core.can('RECEIVE', cashier).ok, true, 'the Cashier is store-class in this config');
  const before = env.adapter.fingerprint();
  const sets = env.adapter.setCount;
  for (const [name, call] of ownerPinOps(ids)) {
    const r = call(env.core, env.ctx(cashier, { stepUp: env.stamp() }));
    assert.equal(r.ok, false, name + ' must be refused for a store-class Cashier');
  }
  assert.equal(env.adapter.setCount, sets);
  assert.equal(env.adapter.fingerprint(), before);
});

test('T6.5 the Owner without a valid stamp gets PIN_REQUIRED on a real target and nothing is written (missing, ok:false, stale, future, junk)', () => {
  const { env, ids, owner } = seeded(CONFIGS[0]);
  const bad = [undefined, null, {}, { ok: false, at: env.clock.ms }, { ok: true }, { ok: true, at: 'now' }, { ok: true, at: env.clock.ms - 120001 }, { ok: true, at: env.clock.ms - 3600000 }, { ok: true, at: env.clock.ms + 1000 }, { ok: 1, at: env.clock.ms }, { ok: true, at: env.clock.ms + 0.5 },
    // gov-audit additions: junk numbers and look-alikes of a fresh stamp
    { ok: true, at: NaN }, { ok: true, at: Infinity }, { ok: true, at: -Infinity }, { ok: true, at: String(env.clock.ms) }, { ok: 'true', at: env.clock.ms },
    { ok: true, at: [env.clock.ms] }, { ok: true, at: new Date(env.clock.ms) }, true, 'ok', env.clock.ms, [true, env.clock.ms], { ok: true, at: env.clock.ms - 120000.5 }];
  const before = env.adapter.fingerprint();
  const sets = env.adapter.setCount;
  const failures = [];
  const skip = new Set(['acknowledgeRestore']); // refused earlier and for another reason when the store is healthy; it still must not write
  for (const stamp of bad) {
    for (const [name, call] of ownerPinOps(ids)) {
      const r = call(env.core, env.ctx(owner, stamp === undefined ? {} : { stepUp: stamp }));
      if (!r || r.ok !== false) failures.push(name + ' with stamp ' + JSON.stringify(stamp) + ' was not refused');
      else if (!skip.has(name) && r.code !== 'PIN_REQUIRED') failures.push(name + ' with stamp ' + JSON.stringify(stamp) + ' gave ' + r.code);
    }
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.equal(env.adapter.setCount, sets);
  assert.equal(env.adapter.fingerprint(), before);
});

test('T6.6 the stamp window is exactly 0 to 120,000 ms: 120,000 is accepted, 120,001 is not (setConfig as the probe)', () => {
  const env = envWith(CONFIGS[0]);
  const owner = ownerSession();
  let r = env.core.setConfig({ adjustLimitPaise: 100, storeRoles: [] }, env.ctx(owner, { stepUp: { ok: true, at: env.clock.ms - 120001 } }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PIN_REQUIRED');
  r = env.core.setConfig({ adjustLimitPaise: 100, storeRoles: [] }, env.ctx(owner, { stepUp: { ok: true, at: env.clock.ms - 120000 } }));
  assert.equal(r.ok, true, JSON.stringify(r));
  r = env.core.setConfig({ adjustLimitPaise: 200, storeRoles: [] }, env.ctx(owner, { stepUp: { ok: true, at: env.clock.ms } }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.core.settings().adjustLimitPaise, 200);
});

test('T6.7 role downgrade between the PIN and the write: the write sees the NEW session and is refused, the same stamp works for the Owner', () => {
  const { env, ids, owner } = seeded(CONFIGS[0]);
  const cashier = realSession(SESSIONS.find((x) => x.name === 'role Cashier').read);
  const stamp = env.stamp();
  const before = env.adapter.fingerprint();
  for (const [name, call] of ownerPinOps(ids)) {
    const r = call(env.core, env.ctx(cashier, { stepUp: stamp }));
    assert.equal(r.ok, false, name + ' after a downgrade to Cashier');
  }
  assert.equal(env.adapter.fingerprint(), before);
  const ok = env.core.approveOpening(ids.openingPending, env.ctx(owner, { stepUp: stamp }));
  assert.equal(ok.ok, true, 'the Owner can use the same stamp, so the refusals above were the role and nothing else: ' + JSON.stringify(ok));
});

test('T6.8 a Store Manager approves a correction only when the Owner set a limit, within it, and never a write-off or an own proposal', () => {
  const { env, ids, manager, owner } = seeded({ name: 'limit', storeRoles: [], limit: 20000 });
  const small = env.core.proposeAdjustment({ lines: [{ partCode: 'NEW-1', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 5000 }], note: 'found one' }, env.ctx(owner));
  assert.equal(small.ok, true, JSON.stringify(small));
  const big = env.core.proposeAdjustment({ lines: [{ partCode: 'NEW-1', qtyDelta: 10, reason: 'FOUND', unitCostPaise: 5000 }], note: 'found ten' }, env.ctx(owner));
  assert.equal(big.ok, true, JSON.stringify(big));
  const own = env.core.proposeAdjustment({ lines: [{ partCode: 'NEW-1', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 5000 }], note: 'my own count' }, env.ctx(manager));
  assert.equal(own.ok, true, JSON.stringify(own));
  const before = env.adapter.fingerprint();
  assert.equal(env.core.approveAdjustment(ids.adjustmentPending, env.ctx(manager)).ok, false, 'write-off class is Owner only');
  assert.equal(env.core.approveAdjustment(big.proposalId, env.ctx(manager)).ok, false, 'above the limit');
  assert.equal(env.core.approveAdjustment(own.proposalId, env.ctx(manager)).ok, false, 'own proposal');
  assert.equal(env.adapter.fingerprint(), before, 'three refusals write nothing');
  const good = env.core.approveAdjustment(small.proposalId, env.ctx(manager));
  assert.equal(good.ok, true, 'within the limit, not own, correction class: ' + JSON.stringify(good));
});

test('T6.9 the Owner can never be named a store role, and a store role gets stock rights only after the Owner names it', () => {
  const env = envWith(CONFIGS[0]);
  const owner = ownerSession();
  const r = env.core.setConfig({ adjustLimitPaise: 0, storeRoles: ['Owner'] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(r.ok, false, 'Owner is not a shell role name');
  const cashier = realSession(SESSIONS.find((x) => x.name === 'role Cashier').read);
  assert.equal(env.core.can('RECEIVE', cashier).ok, false);
  const ok = env.core.setConfig({ adjustLimitPaise: 0, storeRoles: ['Cashier'] }, env.ctx(owner, { stepUp: env.stamp() }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(env.core.can('RECEIVE', cashier).ok, true);
  assert.equal(env.core.can('OPENING_APPROVE', cashier).ok, false, 'a store role never approves');
  assert.equal(env.core.can('ADJUST_APPROVE', cashier).ok, false);
  assert.equal(env.core.can('REVERSE_GRN', cashier).ok, false);
  const trainee = realSession(SESSIONS.find((x) => x.name === 'role Trainee').read);
  assert.equal(env.core.can('RECEIVE', trainee).ok, false, 'other roles stay view-only');
  assert.deepEqual(jsonOf(env.core.settings().storeRoles), ['Cashier']);
});
