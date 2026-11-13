// svc1 page group: behaviour of the glue block and of the guarded hooks, run in a vm sandbox with fake page globals.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { page, glueEnv } from './lib/svc1-page-source.mjs';
import { extractFunction } from './lib/fix-s08-source.mjs';

const NO_SESSION = { ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' };
const CUSTOMER_KEYS = /name|mobile|phone|addr|email|cust|customer|contact/i;

const sampleDb = () => [
  { id: 'WS-1', status: 'open', brand: 'Titan', model: 'Edge', custName: 'Invented Person', custMobile: '0000000000', custAddr: 'Nowhere' },
  { id: 'WS-2', status: 'closed', invoiceNo: 'SV/2026-27/0001', brand: 'Fastrack', model: 'X', d3Readiness: { paymentStatus: 'no_charge_warranty' } },
  { id: 'wsc_Q1', status: 'open', _bridgeStub: true }
];

// ───────────── svsSession ─────────────
test('svsSession never returns null: runtime result, bridge fallback, and the none shape', () => {
  const owner = Object.freeze({ ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'Test Owner' });
  let e = glueEnv({ SaagarModuleRuntime: { session: () => owner } });
  assert.equal(e.api.svsSession(), owner);

  e = glueEnv({ SaagarModuleRuntime: { session: () => { throw new Error('boom'); } } });
  assert.deepEqual(JSON.parse(JSON.stringify(e.api.svsSession())), NO_SESSION);
  assert.equal(e.log.warns.length, 1);

  e = glueEnv({}); // no runtime, no bridge at all
  assert.deepEqual(JSON.parse(JSON.stringify(e.api.svsSession())), NO_SESSION);

  const mk = read => glueEnv({ SaagarModuleBridge: { ownerSession: { read } } }).api.svsSession();
  assert.deepEqual(JSON.parse(JSON.stringify(mk(() => null))), NO_SESSION);
  assert.deepEqual(JSON.parse(JSON.stringify(mk(() => 'x'))), NO_SESSION);
  assert.deepEqual(JSON.parse(JSON.stringify(mk(() => { throw new Error('x'); }))), NO_SESSION);
  assert.deepEqual(JSON.parse(JSON.stringify(mk(() => ({ isOwner: true, role: 'Owner' })))), { ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(mk(() => ({ isManager: true, role: 'Store Manager' })))), { ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(mk(() => ({ role: 'Cashier' })))), { ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: '' });
  assert.equal(mk(() => ({ isOwner: 'yes' })).isOwner, false, 'only a real true counts as owner');
  assert.equal(mk(() => ({ role: 'x'.repeat(90) })).role.length, 40);
  // a runtime that answers with a non-object falls through to the bridge, then to none
  e = glueEnv({ SaagarModuleRuntime: { session: () => null } });
  assert.deepEqual(JSON.parse(JSON.stringify(e.api.svsSession())), NO_SESSION);
});

// ───────────── svsCaseView ─────────────
test('svsCaseView returns exactly six fields and no customer data', () => {
  const e = glueEnv({ DB: sampleDb() });
  const v1 = e.api.svsCaseView('WS-1');
  assert.deepEqual(Object.keys(v1).sort(), ['id', 'invoiceNo', 'label', 'paymentStatus', 'status', 'stub']);
  assert.deepEqual(JSON.parse(JSON.stringify(v1)), { id: 'WS-1', status: 'open', invoiceNo: '', paymentStatus: '', stub: false, label: 'WS-1 Titan Edge' });
  const v2 = e.api.svsCaseView('WS-2');
  assert.equal(v2.status, 'closed');
  assert.equal(v2.invoiceNo, 'SV/2026-27/0001');
  assert.equal(v2.paymentStatus, 'no_charge_warranty');
  assert.equal(e.api.svsCaseView('wsc_Q1').stub, true);
  assert.equal(e.api.svsCaseView('wsc_Q1').label, 'wsc_Q1');
  assert.equal(e.api.svsCaseView('NOPE'), null);
  assert.equal(e.api.svsCaseView(''), null);
  assert.equal(e.api.svsCaseView(null), null);
  const text = JSON.stringify([v1, v2]);
  assert.equal(/Invented Person|0000000000|Nowhere/.test(text), false);
  Object.keys(v1).filter(k => k !== 'invoiceNo').forEach(k => assert.equal(CUSTOMER_KEYS.test(k) && k !== 'invoiceNo' && k !== 'label' && k !== 'id' && k !== 'stub', false, k));
  // a case with an unexpected status is treated as open; a very long label is cut
  const e2 = glueEnv({ DB: [{ id: 'L1', status: 'weird', brand: 'B'.repeat(200), model: 'M' }] });
  assert.equal(e2.api.svsCaseView('L1').status, 'open');
  assert.ok(e2.api.svsCaseView('L1').label.length <= 80);
});

// ───────────── svsCore (lazy) ─────────────
test('svsCore is lazy, cached, passes the adapter, a clock and a case reader, and never throws', () => {
  const calls = [];
  const adapterToken = { adapter: true };
  const core = { jobHasParts: () => ({ ok: true, has: false }) };
  const windowObj = { marker: 'w' };
  const e = glueEnv({
    DB: sampleDb(), window: windowObj,
    SaagarServiceStoresCore: { create(opts) { calls.push(opts); return { ok: true, core }; } },
    SaagarServiceStoresStore: { adapterFromWindow(w) { assert.equal(w, windowObj); return adapterToken; } }
  });
  assert.equal(calls.length, 0, 'nothing is created at parse time');
  assert.equal(e.api.svsCore(), core);
  assert.equal(e.api.svsCore(), core);
  assert.equal(calls.length, 1, 'created once');
  assert.equal(calls[0].adapter, adapterToken);
  assert.ok(calls[0].now() instanceof Date || typeof calls[0].now().getTime === 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].cases.get('WS-1'))).id, 'WS-1');
  assert.equal(calls[0].cases.get('NOPE'), null);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['adapter', 'cases', 'now', 'session', 'stepUpAt']);
  assert.equal(calls[0].session, e.api.svsSession, 'second pass DEF-1: the core reads the session only through the page');
  assert.equal(calls[0].stepUpAt(), 0, 'no PIN seen yet');

  // libraries missing -> null, no throw
  assert.equal(glueEnv({}).api.svsCore(), null);
  assert.equal(glueEnv({ SaagarServiceStoresCore: {} }).api.svsCore(), null);
  // create fails -> null, not cached, retried on the next call
  let n = 0;
  const e2 = glueEnv({
    SaagarServiceStoresCore: { create() { n += 1; return n === 1 ? { ok: false, code: 'SVCS_X' } : { ok: true, core }; } },
    SaagarServiceStoresStore: { adapterFromWindow: () => ({}) }
  });
  assert.equal(e2.api.svsCore(), null);
  assert.equal(e2.api.svsCore(), core);
  // create throws -> null with a warning
  const e3 = glueEnv({
    SaagarServiceStoresCore: { create() { throw new Error('bad'); } },
    SaagarServiceStoresStore: { adapterFromWindow: () => ({}) }
  });
  assert.equal(e3.api.svsCore(), null);
  assert.equal(e3.log.warns.length, 1);
});

// ───────────── DEF-1: the PIN time comes only from a PIN the page saw succeed ─────────────
test('second pass DEF-1: host.reauth sets the core PIN time only when the shell gate resolves exactly true', async () => {
  const calls = [];
  let answer = false;
  const e = glueEnv({
    DB: sampleDb(), window: {},
    svcD3Reauth: async () => answer,
    SaagarServiceStoresCore: { create(opts) { calls.push(opts); return { ok: true, core: {} }; } },
    SaagarServiceStoresStore: { adapterFromWindow: () => ({}) }
  });
  e.api.svsCore();
  const h = e.api.svsHost();
  const at = calls[0].stepUpAt;
  assert.equal(await h.reauth('x'), false);
  assert.equal(at(), 0, 'a refused PIN leaves no stamp');
  answer = 'true';
  assert.equal(await h.reauth('x'), false, 'only a real true counts');
  assert.equal(at(), 0);
  answer = true;
  const t0 = Date.now();
  assert.equal(await h.reauth('x'), true);
  assert.ok(at() >= t0 && at() <= Date.now(), 'stamp set at the time of the PIN');
  // the gate captured at load is used: replacing the global later changes nothing
  e.ctx.svcD3Reauth = async () => true;
  answer = false;
  const before = at();
  assert.equal(await h.reauth('x'), false);
  assert.equal(at(), before);
  assert.equal('svsPinGate' in e.ctx, false, 'the gate is a script-scope const, not a window property');
});

// ───────────── svsHost ─────────────
test('svsHost exposes the agreed members and passes no customer field', () => {
  const core = {};
  const e = glueEnv({
    DB: sampleDb(), editId: 'WS-1',
    SaagarModuleBridge: { report: { preview() {} } },
    SaagarServiceStoresCore: { create: () => ({ ok: true, core }) },
    SaagarServiceStoresStore: { adapterFromWindow: () => ({}) },
    SaagarModuleRuntime: { session: () => NO_SESSION }
  });
  const h = e.api.svsHost();
  ['root', 'jobHost', 'session', 'reauth', 'isPast', 'viewDate', 'today', 'nowIso', 'toast', 'job', 'currentJobId', 'jobIds', 'showCases', 'showStores', 'core', 'report']
    .forEach(k => assert.ok(k in h, k));
  assert.equal(h.print, undefined, 'host.print is void');
  assert.equal(h.root.id, 'svs-root');
  assert.equal(h.jobHost.id, 'svs-job-host');
  assert.equal(h.session().tier, 'none');
  assert.equal(h.isPast(), false);
  assert.equal(h.viewDate(), '2026-11-13');
  assert.equal(h.today(), '2026-11-13');
  assert.match(h.nowIso(), /^\d{4}-\d\d-\d\dT/);
  assert.equal(h.currentJobId(), 'WS-1');
  assert.deepEqual(Array.from(h.jobIds()), ['WS-1', 'WS-2', 'wsc_Q1']);
  assert.equal(h.core(), core);
  assert.equal(typeof h.report().preview, 'function');
  h.toast('hello');
  assert.deepEqual(e.log.toasts, ['hello']);
  h.showCases(); h.showStores();
  assert.deepEqual(e.log.shown, ['dash', 'stores']);
  const j = h.job('WS-2');
  assert.deepEqual(Object.keys(j).sort(), ['id', 'invoiceNo', 'label', 'locked', 'paymentStatus', 'status', 'stub']);
  assert.equal(j.locked, true);
  assert.equal(h.job('WS-1').locked, false);
  assert.equal(h.job('NOPE'), null);
  assert.equal(/Invented Person|0000000000|Nowhere/.test(JSON.stringify([h.job('WS-1'), h.job('WS-2')])), false);
  // editId empty -> '', report missing -> null
  const e2 = glueEnv({ DB: [], editId: null, SaagarModuleBridge: {} });
  assert.equal(e2.api.svsHost().currentJobId(), '');
  assert.equal(e2.api.svsHost().report(), null);
  assert.equal(glueEnv({}).api.svsHost().report(), null);
});

test('svsHost.reauth calls the page PIN step-up with the label and returns its answer', async () => {
  const seen = [];
  const e = glueEnv({ svcD3Reauth: async label => { seen.push(label); return true; } });
  assert.equal(await e.api.svsHost().reauth('Approve opening stock'), true);
  assert.deepEqual(seen, ['Approve opening stock']);
  const e2 = glueEnv({ svcD3Reauth: async () => false });
  assert.equal(await e2.api.svsHost().reauth('x'), false);
});

// ───────────── UI pass-throughs ─────────────
test('mount, show, refreshJob and onContextChange call the UI when present and only warn when it throws', () => {
  const calls = [];
  const ui = {
    mount(h) { calls.push(['mount', typeof h.session]); }, show() { calls.push(['show']); },
    refreshJob() { calls.push(['refresh']); }, onContextChange() { calls.push(['ctx']); }
  };
  const e = glueEnv({ SaagarServiceStoresUI: ui });
  e.api.svsMount(); e.api.svsShowStores(); e.api.svsRefreshJob(); e.api.svsContextChanged();
  assert.deepEqual(calls, [['mount', 'function'], ['show'], ['refresh'], ['ctx']]);
  assert.equal(e.log.toasts.length, 0);

  const bad = {
    mount() { throw new Error('m'); }, show() { throw new Error('s'); },
    refreshJob() { throw new Error('r'); }, onContextChange() { throw new Error('c'); }
  };
  const e2 = glueEnv({ SaagarServiceStoresUI: bad });
  e2.api.svsMount(); e2.api.svsRefreshJob(); e2.api.svsContextChanged();
  assert.equal(e2.log.warns.length, 3);
  e2.api.svsShowStores();
  assert.equal(e2.log.toasts.length, 1);
  assert.match(e2.log.toasts[0], /Stores could not open/);

  // UI absent: nothing throws; show reports it
  const e3 = glueEnv({});
  e3.api.svsMount(); e3.api.svsRefreshJob(); e3.api.svsContextChanged();
  assert.equal(e3.log.warns.length, 0);
  e3.api.svsShowStores();
  assert.equal(e3.log.toasts.length, 1);
});

// ───────────── svsBlocksDelete ─────────────
function blockEnv(jobHasParts, extra = {}) {
  const calls = [];
  const core = { jobHasParts: id => { calls.push(id); return typeof jobHasParts === 'function' ? jobHasParts(id) : jobHasParts; } };
  const e = glueEnv(Object.assign({
    SaagarServiceStoresUI: { mount() {} },
    SaagarServiceStoresCore: { create: () => ({ ok: true, core }) },
    SaagarServiceStoresStore: { adapterFromWindow: () => ({}) }
  }, extra));
  return { e, calls };
}

test('svsBlocksDelete: blocks and says why when parts are still issued', () => {
  const { e, calls } = blockEnv({ ok: true, has: true });
  assert.equal(e.api.svsBlocksDelete({ id: 'WS-1' }), true);
  assert.deepEqual(calls, ['WS-1']);
  assert.equal(e.log.toasts.length, 1);
  assert.match(e.log.toasts[0], /Parts are still issued to WS-1/);
});

test('svsBlocksDelete: allows the delete only when the core says ok and has === false', () => {
  const { e } = blockEnv({ ok: true, has: false });
  assert.equal(e.api.svsBlocksDelete({ id: 'WS-1' }), false);
  assert.equal(e.log.toasts.length, 0);
});

test('svsBlocksDelete fails closed in every other case', () => {
  const closed = (label, env) => {
    assert.equal(env.e.api.svsBlocksDelete({ id: 'WS-1' }), true, label);
    assert.equal(env.e.log.toasts.length, 1, label + ' toast');
    assert.match(env.e.log.toasts[0], /Could not check issued parts\. Nothing was deleted\./, label);
  };
  closed('ok false', blockEnv({ ok: false, code: 'SVCS_BLOCKED' }));
  closed('null reply', blockEnv(null));
  closed('undefined reply', blockEnv(undefined));
  closed('has not boolean true/false but ok', (() => { const b = blockEnv({ ok: true }); return b; })());
  closed('ok as string', blockEnv({ ok: 'true', has: false }));
  closed('throws', blockEnv(() => { throw new Error('boom'); }));
  closed('core missing', { e: glueEnv({ SaagarServiceStoresUI: { mount() {} } }) });
  closed('ui missing', (() => {
    const core = { jobHasParts: () => ({ ok: true, has: false }) };
    return { e: glueEnv({ SaagarServiceStoresCore: { create: () => ({ ok: true, core }) }, SaagarServiceStoresStore: { adapterFromWindow: () => ({}) } }) };
  })());
  closed('core create fails', { e: glueEnv({ SaagarServiceStoresUI: {}, SaagarServiceStoresCore: { create: () => ({ ok: false, code: 'X' }) }, SaagarServiceStoresStore: { adapterFromWindow: () => ({}) } }) });
  closed('no case', (() => { const b = blockEnv({ ok: true, has: false }); b.e.api.svsBlocksDelete({ id: 'WS-1' }); b.e.log.toasts.length = 0; return { e: { api: { svsBlocksDelete: () => b.e.api.svsBlocksDelete(null) }, log: b.e.log } }; })());
});

// ───────────── guarded hooks in the sandbox ─────────────
function delSandbox({ withGuard, guard }) {
  const log = { tomb: [], toasts: [], confirms: 0, guardCalls: [] };
  const g = {
    DB: [{ id: 'OPN', status: 'open' }, { id: 'CLS', status: 'closed' }],
    confirm: () => { log.confirms += 1; return true; },
    prompt: () => 'wrong item booked',
    svcD3Reauth: async () => true,
    svcRecordDeletion: (c, how) => { log.tomb.push({ id: c.id, how }); return true; },
    svcEv: () => null, watchKey: id => 'w|' + id, watchKeyAfter: id => 'a|' + id, readOnlyGuard: () => false,
    toast: m => log.toasts.push(String(m)), renderDash: () => {}, saveDB: () => {}
  };
  if (withGuard) g.svsBlocksDelete = c => { log.guardCalls.push(c && c.id); return guard(c); };
  const code = [
    "function byId(id) { return DB.find(c => c.id === id); }",
    "function svcInvoiceLocked(c) { return !!(c && c.status === 'closed' && c.invoiceNo); }",
    extractFunction('delCase', page), extractFunction('svcDeleteClosedWithApproval', page), extractFunction('svcFinishDelete', page)
  ].join('\n');
  const ctx = vm.createContext(Object.assign({ console }, g));
  vm.runInContext(code, ctx);
  return { ctx, log };
}

test('hooks: without the Stores functions (sandbox of the fix-s08 tests) delete behaves as before', () => {
  const { ctx, log } = delSandbox({ withGuard: false });
  ctx.delCase('OPN');
  assert.deepEqual(log.tomb.map(t => t.id), ['OPN']);
  assert.deepEqual(vm.runInContext('DB.map(c => c.id)', ctx), ['CLS']);
});

test('hooks: delCase stops before the confirm dialog when the guard blocks', () => {
  const { ctx, log } = delSandbox({ withGuard: true, guard: () => true });
  ctx.delCase('OPN');
  assert.equal(log.confirms, 0);
  assert.equal(log.tomb.length, 0);
  assert.deepEqual(vm.runInContext('DB.map(c => c.id)', ctx), ['OPN', 'CLS']);
  assert.deepEqual(log.guardCalls, ['OPN']);
});

test('hooks: delCase deletes and records the tombstone when the guard allows', () => {
  const { ctx, log } = delSandbox({ withGuard: true, guard: () => false });
  ctx.delCase('OPN');
  assert.deepEqual(log.tomb.map(t => t.id), ['OPN']);
  assert.deepEqual(vm.runInContext('DB.map(c => c.id)', ctx), ['CLS']);
});

test('hooks: a delivered case is checked again after the Owner PIN (parts issued while the prompt was open)', async () => {
  let blocked = false;
  const { ctx, log } = delSandbox({ withGuard: true, guard: () => blocked });
  const done = ctx.svcDeleteClosedWithApproval(vm.runInContext("byId('CLS')", ctx));
  blocked = true; // stock appears between the first check and the end of the PIN step
  await done;
  assert.equal(log.tomb.length, 0, 'no tombstone');
  assert.deepEqual(vm.runInContext('DB.map(c => c.id)', ctx), ['OPN', 'CLS']);
  assert.ok(log.guardCalls.length >= 1);
});

test('hooks: invoiced cases still stop at the invoice lock before the Stores guard is asked', () => {
  const { ctx, log } = delSandbox({ withGuard: true, guard: () => false });
  vm.runInContext("DB.push({id:'INV',status:'closed',invoiceNo:'SV/2026-27/0001'})", ctx);
  ctx.delCase('INV');
  assert.equal(log.guardCalls.length, 0);
  assert.equal(log.tomb.length, 0);
  assert.match(log.toasts[0], /cannot be deleted/);
});
