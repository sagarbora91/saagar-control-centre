// tests/lib/svc1-docs-env.mjs
// Test environment for the Service Stores docs layer. Uses the REAL store, FIFO and masters files over an
// in-memory adapter. All data is invented. The Owner PIN is never typed: a step-up stamp is made by hand.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
export const Store = require('../../www/service-stores-store.js');
export const Fifo = require('../../www/service-stores-fifo.js');
export const Masters = require('../../www/service-stores-masters.js');
export const Docs = require('../../www/service-stores-docs.js');

export const OWNER = Object.freeze({ ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'Test Owner' });
export const MANAGER = Object.freeze({ ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Test Manager' });
export const MANAGER2 = Object.freeze({ ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Other Manager' });
export const KEEPER = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Assistant Technician', tier: 'staff', actorName: 'Test Keeper' });
export const CASHIER = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Cashier' });
export const NONE = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });

export function makeClock(startIso = '2026-11-13T05:00:00.000Z') {
  let ms = Date.parse(startIso);
  const c = {
    now: () => new Date(ms),
    ms: () => ms,
    iso: () => new Date(ms).toISOString(),
    set(iso) { ms = Date.parse(iso); return c; },
    advance(by = 1000) { ms += by; return c; }
  };
  return c;
}

// In-memory adapter with a write counter, one-shot failures and a text snapshot (for "storage did not change").
export function makeAdapter(seed) {
  const data = new Map(seed || []);
  const a = {
    data,
    auth: true,
    setCount: 0,
    failNext: 0,
    failMatch: null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (a.failNext > 0 && (!a.failMatch || a.failMatch.test(k))) {
        a.failNext -= 1;
        throw Object.assign(new Error('blocked'), { code: 'STORAGE_BLOCKED' });
      }
      data.set(k, String(v));
      a.setCount += 1;
    },
    keys: () => Array.from(data.keys()),
    authoritative: () => a.auth,
    text: () => JSON.stringify(Array.from(data.entries()).sort((x, y) => (x[0] < y[0] ? -1 : 1))),
    copy: () => makeAdapter(new Map(data))
  };
  return a;
}

export const PIN_CODE_NOTE = 'No PIN is typed anywhere in these tests. A step-up stamp is {ok:true, at:<ms>}.';

export function partInput(code, extra = {}) {
  return {
    code, name: 'Test part ' + code, group: 'Battery', unit: 'pc', hsn: '', gstRateBp: null, priceIncludesTax: true,
    sellPricePaise: 15000, reorderLevel: 0, reorderQty: 0, bin: '', flags: {}, ...extra
  };
}

// opts: {start, adapter, cases, parts: [codes], saleable: [codes]}
export function makeEnv(opts = {}) {
  const clock = makeClock(opts.start);
  const adapter = opts.adapter || makeAdapter();
  const created = Store.createStore(adapter, { now: clock.now });
  assert.equal(created.ok, true, JSON.stringify(created));
  const store = created.store;
  // wrapStore(realStore) -> a store-like object; used by race tests to run a competing action at a chosen call.
  const dealStore = typeof opts.wrapStore === 'function' ? opts.wrapStore(store) : store;
  const jobs = new Map(opts.jobs || [['WS-1', { id: 'WS-1', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }]]);
  const cases = { get: (id) => (jobs.has(id) ? jobs.get(id) : null) };
  const made = Docs.create({ store: dealStore, fifo: Fifo, masters: Masters, now: clock.now, cases });
  assert.equal(made.ok, true, JSON.stringify(made));
  const docs = made;
  let counter = 0;
  const env = {
    clock, adapter, store, docs, jobs, cases,
    ref() { counter += 1; return 'svs-t' + counter.toString(36) + '-' + counter; },
    ctx(session, extra = {}) { return { session, stepUp: undefined, clientRef: env.ref(), ...extra }; },
    pin() { return { ok: true, at: clock.ms() }; },
    ctxPin(session, extra = {}) { return env.ctx(session, { stepUp: env.pin(), ...extra }); },
    mctx(session = MANAGER) { return { session, stepUp: undefined, clientRef: env.ref(), now: clock.now }; },
    addPart(code, extra = {}) {
      const r = Masters.createRow(store, env.mctx(MANAGER), 'part', partInput(code, extra));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r.row;
    },
    open() {
      const r = docs.open();
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    // A second docs instance over the same adapter (what another screen or a restart sees).
    reopen(extra = {}) {
      const c2 = Store.createStore(adapter, { now: clock.now });
      const d2 = Docs.create({ store: c2.store, fifo: Fifo, masters: Masters, now: clock.now, cases: extra.cases || cases });
      assert.equal(d2.ok, true);
      const o = d2.open();
      assert.equal(o.ok, true, JSON.stringify(o));
      return d2;
    },
    // posting helpers (all succeed or the test fails)
    grn(lines, extra = {}, session = MANAGER) {
      invoiceCounter += 1;
      const r = docs.receiveGoods({
        supplierInvoiceNo: 'INV-' + invoiceCounter, supplierInvoiceDate: '2026-11-10', lines, ...extra
      }, env.ctx(session));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    openingPosted(lines, note = 'opening count') {
      const p = docs.proposeOpening({ lines, note }, env.ctx(MANAGER));
      assert.equal(p.ok, true, JSON.stringify(p));
      const a = docs.approveOpening(p.proposalId, env.ctxPin(OWNER));
      assert.equal(a.ok, true, JSON.stringify(a));
      return a;
    },
    issue(jobId, lines, extra = {}, session = MANAGER) {
      const r = docs.issueToJob({ jobId, lines, ...extra }, env.ctx(session));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    onHand(code) { return Fifo.partBalance(docs.fifoState(), code).qty; },
    value(code) { return Fifo.partBalance(docs.fifoState(), code).valuePaise; }
  };
  let invoiceCounter = 0;
  for (const c of opts.parts || []) env.addPart(c, (opts.saleable || []).includes(c) ? { flags: { counterSaleable: true } } : {});
  return env;
}

export function expectFail(res, code) {
  assert.equal(res.ok, false, 'expected a failure, got ' + JSON.stringify(res).slice(0, 300));
  assert.equal(res.code, code, JSON.stringify(res).slice(0, 400));
  assert.equal(typeof res.message, 'string');
  assert.ok(res.message.length > 0);
  return res;
}
export function expectOk(res) {
  assert.equal(res.ok, true, JSON.stringify(res).slice(0, 400));
  return res;
}

// Runs fn and asserts that no storage key changed and no write was made.
export function unchanged(env, fn) {
  const before = env.adapter.text();
  const count = env.adapter.setCount;
  const res = fn();
  assert.equal(env.adapter.setCount, count, 'a refusal must not write');
  assert.equal(env.adapter.text(), before, 'storage text must be identical after a refusal');
  return res;
}
