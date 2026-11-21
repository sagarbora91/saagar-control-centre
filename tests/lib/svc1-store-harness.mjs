// tests/lib/svc1-store-harness.mjs
// Helpers for the Service Stores store tests: in-memory adapter with fault switches, fake clock,
// actors, and small posting helpers. Invented data only.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
export const Store = require('../../www/service-stores-store.js');

export const ACTORS = {
  owner: { t: 'owner', r: 'Owner', m: 'Test Owner' },
  manager: { t: 'manager', r: 'Store Manager', m: 'Test Keeper' },
  staff: { t: 'staff', r: 'Technician', m: 'Test Tech' }
};

export function makeClock(startIso = '2026-11-13T04:30:00.000Z') {
  let cur = new Date(startIso).getTime();
  const c = {
    now: () => new Date(cur).toISOString(),
    set(iso) { cur = new Date(iso).getTime(); return c; },
    advance(ms) { cur += ms; return c; },
    get iso() { return new Date(cur).toISOString(); }
  };
  return c;
}

// In-memory adapter. Switches: auth, failSetFor, corruptNextReadback, killAfter, getHooks.
export function makeAdapter(seed) {
  const data = new Map(seed ? (seed instanceof Map ? seed : Object.entries(seed)) : []);
  const a = {
    data,
    auth: true,
    setCount: 0,
    keysCalls: 0,
    setLog: [],
    getCalls: [],
    killAfter: Infinity,
    failers: [],
    corrupt: [],
    pendingCorrupt: new Set(),
    getHooks: [],
    getItem(k) {
      a.getCalls.push(k);
      let v = data.has(k) ? data.get(k) : null;
      if (v !== null && a.pendingCorrupt.has(k)) { a.pendingCorrupt.delete(k); v = v + ' '; }
      for (const h of a.getHooks) v = h(k, v);
      return v;
    },
    setItem(k, v) {
      if (a.setCount >= a.killAfter) throw Object.assign(new Error('killed'), { code: 'KILLED' });
      for (const f of a.failers) {
        if (f.times > 0 && f.re.test(k)) { f.times -= 1; throw Object.assign(new Error('blocked'), { code: f.code }); }
      }
      data.set(k, String(v));
      a.setCount += 1;
      a.setLog.push(k);
      for (const re of a.corrupt) if (re.test(k)) a.pendingCorrupt.add(k);
    },
    keys() { a.keysCalls += 1; return Array.from(data.keys()); },
    authoritative() { return a.auth; },
    failSetFor(re, opts = {}) { a.failers.push({ re, times: opts.times ?? 1, code: opts.code ?? 'STORAGE_BLOCKED' }); return a; },
    corruptNextReadback(re) { a.corrupt.push(re); return a; },
    snapshot() { return new Map(data); },
    // a second adapter holding a copy of this one's data (a different "screen" uses the same adapter instead)
    copy() { return makeAdapter(new Map(data)); },
    svcsKeys() { return Array.from(data.keys()).filter((k) => /^saagar_svcs_/.test(k)).sort(); }
  };
  return a;
}

export function newStore(adapter, clock, options = {}) {
  const r = Store.createStore(adapter, Object.assign({ now: clock.now }, options));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.store;
}

export function openStore(adapter, clock, options = {}) {
  const s = newStore(adapter, clock, options);
  const o = s.open();
  assert.equal(o.ok, true, JSON.stringify(o));
  return s;
}

// One append with the current head revision.
export function put(store, stream, items, extra = {}) {
  const h = store.head(stream);
  assert.equal(h.ok, true, JSON.stringify(h));
  const arr = Array.isArray(items) ? items : [items];
  return store.append(stream, arr, Object.assign({ expectRev: h.rev, actor: ACTORS.manager }, extra));
}

// A numbered goods receipt line-less posting: asks the store for time and number first.
export function postNumbered(store, series, stream, kind, body = {}, extra = {}) {
  const t = store.nextAt(stream, extra.clockOverride ? { clockOverride: true } : undefined);
  assert.equal(t.ok, true, JSON.stringify(t));
  const n = store.nextNumber(series, t.at);
  assert.equal(n.ok, true, JSON.stringify(n));
  const item = { k: kind, series, b: Object.assign({ no: n.no }, body) };
  if (extra.r) item.r = extra.r;
  return put(store, stream, item, Object.assign({ at: t.at }, extra.opts || {}));
}

export function expectFail(res, code) {
  assert.equal(res.ok, false, 'expected a failure: ' + JSON.stringify(res));
  assert.equal(res.status, 'BLOCKED');
  assert.equal(res.code, code, JSON.stringify(res));
  assert.ok(Object.isFrozen(res));
  return res;
}

export function expectOk(res) {
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}

// A healthy store spanning three months and several streams. Returns the adapter and the clock.
export function buildHealthy(opts = {}) {
  const clock = makeClock('2026-09-10T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock, opts.storeOptions || {});
  const months = ['2026-09-10T05:00:00.000Z', '2026-10-12T05:00:00.000Z', '2026-11-13T05:00:00.000Z'];
  let seq = 0;
  for (const m of months) {
    clock.set(m);
    for (let i = 0; i < (opts.perMonth || 6); i++) {
      clock.advance(60000);
      seq += 1;
      expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: seq, unitCostPaise: 1000 + seq, note: 'receipt ' + seq }, { r: 'REF:grn:' + seq }));
    }
    clock.advance(60000);
    expectOk(put(store, 'docs', { k: 'OPN_PROPOSE', b: { lines: [{ partCode: 'P' + seq, qty: 1, unitCostPaise: 100 }], note: 'x' }, r: 'REF:doc:' + seq }));
    expectOk(put(store, 'audit', { k: 'NOTE', b: { text: 'month ' + m.slice(0, 7) } }));
  }
  clock.advance(60000);
  expectOk(put(store, 'parts', [
    { k: 'PART_CREATE', b: { code: 'T-1', row: { code: 'T-1', name: 'Test strap', sellPricePaise: 5000 }, changes: [], reason: 'seed', via: 'manual', batchId: 'B1' } },
    { k: 'PART_CREATE', b: { code: 'T-2', row: { code: 'T-2', name: 'Test glass', sellPricePaise: 7000 }, changes: [], reason: 'seed', via: 'manual', batchId: 'B1' } }
  ]));
  expectOk(put(store, 'labour', { k: 'LAB_CREATE', b: { code: 'L-1', row: { code: 'L-1', name: 'Test service', ratePaise: 25000 }, changes: [], reason: 'seed', via: 'manual', batchId: 'B2' } }));
  expectOk(put(store, 'config', { k: 'CONFIG_SET', b: { adjustLimitPaise: 100000, storeRoles: ['Technician'] } }));
  expectOk(put(store, 'defective', { k: 'OLD_REGISTER', series: 'OLD', b: { no: store.nextNumber('OLD', clock.iso).no, jobId: 'J-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM' } }));
  return { adapter, clock, store };
}

export function parseShard(adapter, key) {
  return JSON.parse(adapter.data.get(key));
}

export function ledgerKeys(adapter) {
  return adapter.svcsKeys().filter((k) => /ledger/.test(k));
}

// Writes a valid hash chain straight into the adapter (one shard, head row rev 1) without going through append.
// mk(n) returns {k, b, r?}. Used to reach large counters quickly.
export function forgeChain(adapter, stream, count, mk, atIso = '2026-11-13T05:00:00.000Z', actor = ACTORS.owner) {
  const zero = '0'.repeat(64);
  const aText = Store.canonicalText(actor);
  let p = zero;
  let h = zero;
  const recs = [];
  for (let n = 1; n <= count; n++) {
    const { k, b, r } = mk(n);
    const bText = Store.canonicalText(b);
    const id = Store.STREAMS[stream].code + '-' + String(n).padStart(6, '0');
    const NL = String.fromCharCode(10);
    h = Store.sha256Hex([stream, p, n, atIso, k, (r || ''), aText, bText].join(NL));
    recs.push('{"n":' + n + ',"id":"' + id + '","at":"' + atIso + '","k":"' + k + '"' + (r ? ',"r":' + JSON.stringify(r) : '') +
      ',"a":' + aText + ',"b":' + bText + ',"p":"' + p + '","h":"' + h + '"}');
    p = h;
  }
  const key = Store.shardKey(stream, atIso, 1);
  adapter.data.set(key, '[' + recs.join(',') + ']');
  const rows = adapter.data.has(Store.HEAD_KEY) ? JSON.parse(adapter.data.get(Store.HEAD_KEY)) : [];
  const next = rows.filter((x) => x.s !== stream);
  next.push({ s: stream, rev: 1, n: count, h, at: atIso, key });
  next.sort((a, b) => (a.s < b.s ? -1 : 1));
  adapter.data.set(Store.HEAD_KEY, '[' + next.map((x) => '{"s":"' + x.s + '","rev":' + x.rev + ',"n":' + x.n + ',"h":"' + x.h + '","at":"' + x.at + '","key":"' + x.key + '"}').join(',') + ']');
  return { key, h };
}
