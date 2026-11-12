// tests/fix-s15-runtime.test.mjs
// S15 role model: tests for the three new shared helpers in www/shared/module-runtime.js
// (session, whatsAppLink, seal), the access-stage refresh on manager change, and the remove-burst coalescer.
// Loads the REAL runtime file text. No browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const RUNTIME = fs.readFileSync(new URL('../www/shared/module-runtime.js', import.meta.url), 'utf8');

// A frame whose parent is a separate plain object (the shell).
function frame({ shell = {}, extra = {} } = {}) {
  const win = { location: { origin: 'https://app.local' }, console, ...extra };
  win.parent = shell;
  const ctx = vm.createContext(win);
  win.window = win;
  vm.runInContext(RUNTIME, ctx);
  return win;
}
const snap = (o = {}) => ({ version: 1, isOwner: false, role: 'Cashier', isManager: false, ...o });

test('S15 session(): fail-closed object when the shell session is missing, broken or not an object', () => {
  const closed = { ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' };
  assert.deepEqual({ ...frame({ shell: {} }).SaagarModuleRuntime.session() }, closed);
  assert.deepEqual({ ...frame({ shell: { SaagarOwnerSession: {} } }).SaagarModuleRuntime.session() }, closed);
  assert.deepEqual({ ...frame({ shell: { SaagarOwnerSession: { read() { throw new Error('x'); } } } }).SaagarModuleRuntime.session() }, closed);
  assert.deepEqual({ ...frame({ shell: { SaagarOwnerSession: { read: () => 'owner' } } }).SaagarModuleRuntime.session() }, closed);
  assert.deepEqual({ ...frame({ shell: { SaagarOwnerSession: { read: () => null } } }).SaagarModuleRuntime.session() }, closed);
});

test('S15 session(): tiers, strict booleans, frozen result, re-read every call (never cached)', () => {
  let cur = snap({ isOwner: true, role: 'Cashier', isManager: true });
  const w = frame({ shell: { SaagarOwnerSession: { read: () => cur }, ownerName: () => 'Sagar', activeStaff: () => ({ name: 'Pooja' }) } });
  const rt = w.SaagarModuleRuntime;
  let s = rt.session();
  assert.equal(s.ok, true); assert.equal(s.tier, 'owner'); assert.equal(s.isOwner, true); assert.equal(s.isManager, true);
  assert.equal(s.role, 'Cashier'); assert.equal(s.actorName, 'Sagar');
  assert.equal(Object.isFrozen(s), true);
  cur = snap({ role: 'Store Manager', isManager: true });
  s = rt.session();
  assert.equal(s.tier, 'manager'); assert.equal(s.isOwner, false); assert.equal(s.isManager, true); assert.equal(s.actorName, 'Pooja');
  cur = snap({ role: 'CRO' });
  s = rt.session();
  assert.equal(s.tier, 'staff'); assert.equal(s.isManager, false);
  // truthy-but-not-true values never grant anything
  cur = { isOwner: 'true', isManager: 1, role: 'Others' };
  s = rt.session();
  assert.equal(s.isOwner, false); assert.equal(s.isManager, false); assert.equal(s.tier, 'staff');
  // owner downgrade is visible immediately (idle lock) with no reload
  cur = snap({ isOwner: true, isManager: true });
  assert.equal(rt.session().isOwner, true);
  cur = snap();
  assert.equal(rt.session().isOwner, false);
  // role text is bounded, actor name is bounded
  cur = snap({ role: 'x'.repeat(300) });
  assert.equal(rt.session().role.length, 40);
});

test('S15 session(): in the shell window itself it reads window.SaagarOwnerSession', () => {
  const win = { location: { origin: 'https://app.local' }, console, SaagarOwnerSession: { read: () => snap({ isOwner: true, isManager: true }) } };
  win.parent = win; win.window = win;
  vm.runInContext(RUNTIME, vm.createContext(win));
  assert.equal(win.SaagarModuleRuntime.session().tier, 'owner');
});

test('S15 whatsAppLink(): true only when the shell function resolves exactly true; fails closed otherwise', async () => {
  const calls = [];
  const mk = (impl) => frame({ shell: { openControlledWhatsApp: async (...a) => { calls.push(a); return impl(); } } }).SaagarModuleRuntime;
  const url = 'https://wa.me/919999999999?text=hi';
  assert.equal(await mk(() => true).whatsAppLink(url, 'cro-review-request', 'promotional-review-solicitation'), true);
  assert.deepEqual(calls[0], [url, 'cro-review-request', 'promotional-review-solicitation']);
  assert.equal(await mk(() => false).whatsAppLink(url, 's', 'p'), false);
  assert.equal(await mk(() => 'yes').whatsAppLink(url, 's', 'p'), false);
  assert.equal(await mk(() => undefined).whatsAppLink(url, 's', 'p'), false);
  assert.equal(await mk(() => { throw new Error('boom'); }).whatsAppLink(url, 's', 'p'), false);
  const n = calls.length;
  assert.equal(await mk(() => true).whatsAppLink('https://evil.example/x', 's', 'p'), false);
  assert.equal(await mk(() => true).whatsAppLink(url, '', 'p'), false);
  assert.equal(await mk(() => true).whatsAppLink(url, 's', ''), false);
  assert.equal(calls.length, n, 'refused locally: the shell is never called');
  assert.equal(await frame({ shell: {} }).SaagarModuleRuntime.whatsAppLink(url, 's', 'p'), false);
});

test('S15 seal(): the shell window cannot have its role or PIN gate replaced afterwards; frames cannot seal', () => {
  // the shell window is a plain object here so that property rules are the real JavaScript rules
  const shell = { location: { origin: 'https://app.local' }, console };
  shell.parent = shell;
  shell.SaagarOwnerSession = Object.freeze({ read: () => snap({ isOwner: true, isManager: true }) });
  shell.SaagarReauth = async () => false;
  shell.SaagarAdminPinCheck = () => ({ ok: false });
  const ctx = vm.createContext({ window: shell, location: shell.location, console });
  vm.runInContext(RUNTIME, ctx);
  const names = ['SaagarOwnerSession', 'SaagarReauth', 'SaagarAdminPinCheck'];
  const originals = names.map(n => shell[n]);
  // before sealing, a frame could replace them (this is the hole)
  shell.SaagarReauth = async () => true; assert.notEqual(shell.SaagarReauth, originals[1]); shell.SaagarReauth = originals[1];
  assert.equal(shell.SaagarModuleRuntime.seal(), true);
  const attempts = [
    'window.SaagarOwnerSession = {read:()=>({isOwner:true})}', 'window.SaagarReauth = async()=>true', 'window.SaagarAdminPinCheck = ()=>({ok:true})',
    "Object.defineProperty(window,'SaagarOwnerSession',{value:{}})", 'delete window.SaagarOwnerSession', 'delete window.SaagarReauth'
  ];
  for (const code of attempts) {
    assert.throws(() => vm.runInContext("'use strict';" + code, ctx), (e) => e && e.name === 'TypeError', code);
  }
  assert.deepEqual(names.map(n => shell[n]), originals);
  // a module frame (parent !== window) never seals anything
  const w = frame({ shell: {}, extra: { SaagarReauth: async () => true } });
  assert.equal(w.SaagarModuleRuntime.seal(), false);
  w.SaagarReauth = 1;
  assert.equal(w.SaagarReauth, 1);
});

// ---- access stage refresh on manager change (R-S15-2) ----
function accessHarness(moduleId) {
  let cur = snap();
  const listeners = {};
  const calls = { render: 0 };
  const parent = { SaagarOwnerSession: { read: () => ({ ...cur }) } };
  const win = {
    location: { origin: 'https://app.local' }, console, parent,
    document: { getElementById: () => null, querySelector: () => null },
    st: { mode: 'cro', screen: 'staff' }, toast() {}, commitMode() {}, logout() {},
    renderDash: () => { calls.render++; }, render: () => { calls.render++; },
    addEventListener: (t, h) => { listeners[t] = h; }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(RUNTIME, ctx);
  win.SaagarModuleRuntime.run('access', { schemaVersion: 1, moduleId, nextSteps: [], customerSelectors: [], accessContext: true });
  return { calls, set(v) { cur = v; listeners.message({ source: parent, origin: 'https://app.local', data: { type: 'ST_ACCESS_CONTEXT' } }); } };
}
test('S15 access stage: Service and Expense refresh when the shell switches between Store Manager and Cashier', () => {
  for (const id of ['service', 'expense']) {
    const h = accessHarness(id);
    const base = h.calls.render;
    h.set(snap()); assert.equal(h.calls.render, base, 'unchanged context: no re-render');
    h.set(snap({ role: 'Store Manager', isManager: true })); assert.equal(h.calls.render, base + 1);
    h.set(snap({ role: 'Cashier' })); assert.equal(h.calls.render, base + 2);
    h.set(snap({ role: 'CRO' })); assert.equal(h.calls.render, base + 2, 'role name change with the same tier: no re-render');
  }
});

// ---- remove-burst coalescer (S06 R2) ----
function auditHarness() {
  const rows = [];
  const timers = [];
  let now = 1000;
  const store = {};
  const win = {
    location: { origin: 'https://app.local' }, console,
    localStorage: { setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; }, getItem: (k) => store[k] ?? null },
    SaagarMah4: { audit: (a, k, b, c) => { rows.push([a, k]); } },
    Date: { now: () => now },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }
  };
  win.parent = {}; win.window = win;
  vm.runInContext(RUNTIME, vm.createContext(win));
  win.SaagarModuleRuntime.run('audit', { schemaVersion: 1, moduleId: 'stock', nextSteps: [], customerSelectors: [], accessContext: false });
  return { win, rows, timers, store, advance(ms) { now += ms; } };
}
test('S15 audit stage: a burst of removes is forwarded 20 at a time, marked, then summarised by the next storage write; sets are never coalesced', () => {
  const h = auditHarness();
  for (let i = 0; i < 500; i++) h.win.localStorage.setItem('k' + i, 'v');
  assert.equal(h.rows.filter(r => r[0] === 'module.storage.set').length, 500);
  h.rows.length = 0;
  for (let i = 0; i < 500; i++) h.win.localStorage.removeItem('k' + i);
  assert.equal(h.rows.length, 21, 'first 20 forwarded plus one start marker');
  assert.deepEqual(h.rows[20], ['module.storage.remove', 'bulk:start']);
  assert.equal(h.timers.length, 0, 'no timer is armed (MAH-4 lifecycle counts must not move)');
  h.win.localStorage.setItem('clear-log', 'x');          // the next storage write carries the exact count
  assert.deepEqual(h.rows.slice(21), [['module.storage.remove', 'bulk:480'], ['module.storage.set', 'clear-log']]);
  // a second burst after the window starts clean
  h.advance(2500); h.rows.length = 0;
  h.win.localStorage.removeItem('again');
  assert.deepEqual(h.rows, [['module.storage.remove', 'again']]);
  // a burst followed by a later remove after the window also flushes first (1 earlier + 30 = 31 in one window, 11 suppressed)
  for (let i = 0; i < 30; i++) h.win.localStorage.removeItem('b' + i);
  h.advance(2500); h.rows.length = 0;
  h.win.localStorage.removeItem('late');
  assert.deepEqual(h.rows, [['module.storage.remove', 'bulk:11'], ['module.storage.remove', 'late']]);
});
test('S15 audit stage: a small number of removes is untouched and arms no timer', () => {
  const h = auditHarness();
  for (let i = 0; i < 20; i++) h.win.localStorage.removeItem('k' + i);
  assert.equal(h.rows.length, 20); assert.equal(h.timers.length, 0); assert.equal(h.rows.some(r => String(r[1]).startsWith('bulk:')), false);
});

// ---- source guards that other frozen tests rely on ----
test('S15 runtime source keeps what frozen tests pin', () => {
  assert.equal((RUNTIME.match(/['"]\*['"]/g) || []).length, 2, 'phase1 test: only the two controlled wildcard literals');
  assert.match(RUNTIME, /isOwner===true/);
  assert.match(RUNTIME, /(?:window\.parent|parent).*SaagarReauth|root\.SaagarReauth/);
  assert.equal((RUNTIME.match(/postMessage\s*\(/g) || []).length, 3, 'no new postMessage site (MAH-4 producer counts)');
  assert.deepEqual([...new Set(RUNTIME.match(/ST_[A-Z_]+/g))].sort(), ['ST_ACCESS_CONTEXT','ST_BACK_HOME','ST_OPEN_FEATURE','ST_OPEN_MODULE','ST_PRINT','ST_REPORT','ST_SET_DATE','ST_SHARE','ST_UI_MODE','ST_WA','ST_WA_LINK'], 'no new ST_ token (MAH-4 lexical tokens)');
  assert.doesNotMatch(RUNTIME.slice(RUNTIME.indexOf('access:function(c){')), /moduleId===['"](qms|grooming|cro_audit|payroll|leave|tax|planning|etp)['"]/);
});
