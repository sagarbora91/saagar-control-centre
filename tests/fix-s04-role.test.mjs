// S04 U03-F01 / U03-F02: the Queue role is derived from the shell at every guard, never stored, never switchable.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, qmsSource, run } from './lib/fix-s04-qms.mjs';
import { SESSIONS, BROKEN, QMS_EXPECTED, qmsRoleFor } from './lib/fix-s15-role-table.mjs';

const CODE = ['qmsShellSession', 'qmsDerivedRole', 'qmsSyncRole', 'guardPast', 'requireSM', 'switchRole']
  .map(fn).join('\n') + '\nthis.api={qmsDerivedRole,qmsSyncRole,guardPast,requireSM,switchRole};';

const NO_SESSION = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });
function runtimeSessionFrom(read) {
  if (!read || typeof read !== 'object') return NO_SESSION;
  const owner = read.isOwner === true;
  return Object.freeze({ ok: true, isOwner: owner, isManager: owner || read.isManager === true, role: typeof read.role === 'string' ? read.role : '', tier: owner ? 'owner' : 'staff', actorName: '' });
}
function make({ read, viaRuntime = true, past = false }) {
  const toasts = [], saves = [];
  const holder = { read };
  const ownerSession = holder.read === undefined ? undefined : { read() { if (holder.read === 'THROW') throw new Error('x'); return holder.read; } };
  const ctx = {
    role: 'Greeter', state: { role: 'SM' }, toasts, saves, holder,
    isPast: () => past,
    toast: (m, t) => toasts.push({ m, t }),
    save: (a, d) => { saves.push({ a, d }); return true; },
    SaagarModuleBridge: { ownerSession },
  };
  if (viaRuntime) ctx.SaagarModuleRuntime = { session() { if (holder.read === 'THROW') throw new Error('x'); return runtimeSessionFrom(holder.read); } };
  run(ctx, CODE);
  return ctx;
}

test('S04-1 role table through SaagarModuleRuntime.session()', () => {
  for (const s of SESSIONS) assert.equal(make({ read: s.read }).api.qmsDerivedRole(), QMS_EXPECTED[s.name], s.name);
  for (const b of BROKEN) assert.equal(make({ read: b.read }).api.qmsDerivedRole(), 'Greeter', b.name);
});
test('S04-1 role table through the ownerSession fallback when session() is absent', () => {
  for (const s of SESSIONS) assert.equal(make({ read: s.read, viaRuntime: false }).api.qmsDerivedRole(), qmsRoleFor(s.read), s.name);
  for (const b of BROKEN) assert.equal(make({ read: b.read, viaRuntime: false }).api.qmsDerivedRole(), 'Greeter', b.name);
  const noShell = make({ read: undefined, viaRuntime: false });
  assert.equal(noShell.api.qmsDerivedRole(), 'Greeter');
});
test('S04-2 switchRole as Greeter ten times changes nothing and never saves', () => {
  const c = make({ read: SESSIONS.find((s) => s.name === 'role Greeter').read });
  c.api.qmsSyncRole();
  for (let i = 0; i < 10; i++) c.api.switchRole();
  assert.equal(c.role, 'Greeter');
  assert.equal(c.saves.length, 0);
  assert.equal(c.state.role, 'SM', 'state.role must never be written');
});
test('S04-3 hand-assigned role is overridden by the next guard', () => {
  const c = make({ read: SESSIONS.find((s) => s.name === 'role Greeter').read });
  c.role = 'Admin';
  assert.equal(c.api.requireSM(), false);
  assert.equal(c.role, 'Greeter');
  assert.deepEqual(c.toasts.map((t) => t.m), ['SM / Admin access required.']);
});
test('S04-4 role follows the shell on every guard (never cached)', () => {
  const c = make({ read: SESSIONS.find((s) => s.name === 'role Greeter').read });
  c.api.guardPast(); assert.equal(c.role, 'Greeter');
  c.holder.read = SESSIONS[0].read; c.api.guardPast(); assert.equal(c.role, 'Admin');
  c.holder.read = SESSIONS.find((s) => s.name === 'role Store Manager').read; assert.equal(c.api.requireSM(), true); assert.equal(c.role, 'SM');
  c.holder.read = SESSIONS.find((s) => s.name === 'role CRO').read; assert.equal(c.api.requireSM(), false); assert.equal(c.role, 'CRO');
});
test('S04-5 a throwing session() fails closed (Greeter), even if the old bridge could answer', () => {
  const c = make({ read: SESSIONS[0].read });
  c.holder.read = 'THROW';
  assert.equal(c.api.qmsDerivedRole(), 'Greeter');
});
test('S04-6 source: no cycle, no stored role, no ST_ACCESS_CONTEXT listener, buttons keep their identity', () => {
  assert.doesNotMatch(qmsSource, /roles\.indexOf\(role\)\+1/);
  assert.doesNotMatch(qmsSource, /state\.role\s*=\s*role/);
  assert.doesNotMatch(qmsSource, /role\s*=\s*state\.role/);
  assert.match(qmsSource, /let state,role='Greeter',activeView='dashboard',toastTimer;/);
  assert.equal((qmsSource.match(/ST_ACCESS_CONTEXT/g) || []).length, 0);
  assert.match(qmsSource, /data-action="qms-role-switch-sidebar"/);
  assert.match(qmsSource, /data-action="qms-role-switch-topbar"/);
  assert.match(fn('renderAll'), /^function renderAll\(\)\{qmsSyncRole\(\);/);
  assert.match(fn('load'), /qmsSyncRole\(\);qmsRepairSettings\(\)\}/);
});
test('S04-7 addCustomer re-reads the shell role right before its SM/Admin CRO pick (audit correction)', () => {
  const src = fn('addCustomer');
  const sync = src.indexOf('qmsSyncRole();'), gate = src.indexOf("const selectedCro = (role === 'SM' || role === 'Admin')");
  assert.notEqual(gate, -1, 'the SM/Admin CRO pick must still exist');
  assert.ok(sync !== -1 && sync < gate, 'qmsSyncRole() must run before the role gate in addCustomer');
});
