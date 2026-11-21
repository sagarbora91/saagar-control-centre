// Test environment for the Service Stores masters tests.
// Uses the REAL store file (www/service-stores-store.js) over an in-memory adapter when that file exists.
// Until then (or when SVC1_MASTERS_FAKE=1) it uses a strict fake that follows the agreed store contract
// (plan section 2.3 and 2.4): integer-only canonical bodies, expectRev, refs, actor, 200-item batches.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(here, '..', '..', 'www', 'service-stores-store.js');

export const masters = require('../../www/service-stores-masters.js');

export const OWNER = Object.freeze({ ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'Test Owner' });
export const MANAGER = Object.freeze({ ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Test Manager' });
export const STAFF = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Staff' });
export const NONE = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });

const FORBIDDEN_KEY = /^(mobile|phone|email|address|custname|customername|customermobile|aadhaar|pan)$/i;
const BANNED_PROTO = /^(__proto__|constructor|prototype)$/;

function canonical(value, depth) {
  if (depth > 8) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= 400 ? value : undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) {
      const c = canonical(v, depth + 1);
      if (c === undefined) return undefined;
      out.push(c);
    }
    return out;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (FORBIDDEN_KEY.test(k) || BANNED_PROTO.test(k)) return undefined;
      if (value[k] === undefined) return undefined;
      const c = canonical(value[k], depth + 1);
      if (c === undefined) return undefined;
      out[k] = c;
    }
    return out;
  }
  return undefined;
}

function makeFakeStore(clock) {
  const streams = { parts: [], labour: [] };
  const revs = { parts: 0, labour: 0 };
  const codes = { parts: 'PRT', labour: 'LAB' };
  let failNext = null;
  const store = {
    backend: 'fake',
    head(stream) { return { rev: revs[stream] || 0, n: streams[stream].length, h: String(streams[stream].length), at: '', key: '' }; },
    read(stream) {
      if (!streams[stream]) return { ok: false, code: 'SVCS_ARGS_INVALID' };
      return { ok: true, records: streams[stream].map((r) => JSON.parse(JSON.stringify(r))), rev: revs[stream], n: streams[stream].length, h: String(streams[stream].length) };
    },
    findRef(stream, ref) {
      const hit = streams[stream].find((r) => r.r === ref);
      return hit ? JSON.parse(JSON.stringify(hit)) : null;
    },
    append(stream, items, opts) {
      if (failNext) { const f = failNext; failNext = null; return { ok: false, status: 'BLOCKED', code: f }; }
      if (!streams[stream] || !Array.isArray(items) || items.length < 1 || items.length > 200) return { ok: false, code: 'SVCS_ARGS_INVALID' };
      if (!opts || !Number.isInteger(opts.expectRev) || opts.expectRev < 0) return { ok: false, code: 'SVCS_ARGS_INVALID' };
      const a = opts.actor;
      if (!a || !['owner', 'manager', 'staff'].includes(a.t) || typeof a.r !== 'string' || a.r.length > 40 || typeof a.m !== 'string' || a.m.length > 60) {
        return { ok: false, code: 'SVCS_ACTOR_INVALID' };
      }
      if (opts.expectRev !== revs[stream]) return { ok: false, code: 'SVCS_REV_CONFLICT', detail: String(revs[stream]) };
      const refs = new Set(streams[stream].map((r) => r.r).filter(Boolean));
      const out = [];
      let n = streams[stream].length;
      for (const item of items) {
        if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(item.k)) return { ok: false, code: 'SVCS_ARGS_INVALID' };
        if (item.r !== undefined) {
          if (!/^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,63}$/.test(item.r)) return { ok: false, code: 'SVCS_ARGS_INVALID' };
          if (refs.has(item.r)) return { ok: false, code: 'SVCS_DUPLICATE_REF' };
          refs.add(item.r);
        }
        if (item.b && Object.prototype.hasOwnProperty.call(item.b, 'no')) return { ok: false, code: 'SVCS_ARGS_INVALID' };
        const body = canonical(item.b, 1);
        if (body === undefined || body === null || Array.isArray(body)) return { ok: false, code: 'SVCS_BODY_NOT_CANONICAL' };
        n += 1;
        const rec = { n, id: codes[stream] + '-' + String(n).padStart(6, '0'), at: clock.iso(), k: item.k, a: { t: a.t, r: a.r, m: a.m }, b: body };
        if (item.r !== undefined) rec.r = item.r;
        out.push(rec);
      }
      for (const r of out) streams[stream].push(r);
      revs[stream] += 1;
      return { ok: true, records: out.map((r) => JSON.parse(JSON.stringify(r))), rev: revs[stream], n, h: String(n), warnings: [] };
    },
    failNextAppend(code) { failNext = code; },
    snapshot() { return JSON.stringify(streams); },
    dump() { return streams; }
  };
  return store;
}

export function makeClock(startIso = '2026-11-13T09:30:00.000Z') {
  let ms = Date.parse(startIso);
  return {
    iso() { return new Date(ms).toISOString(); },
    ms() { return ms; },
    set(iso) { ms = Date.parse(iso); },
    tick(by = 1000) { ms += by; }
  };
}

export function makeEnv(options = {}) {
  const clock = makeClock(options.start);
  const useReal = !options.fake && !process.env.SVC1_MASTERS_FAKE && existsSync(storePath);
  let store;
  let backend = 'fake';
  let snapshot;
  let realMap = null;
  const writeFailures = { count: 0 };
  if (useReal) {
    const mod = require(storePath);
    const map = new Map();
    realMap = map;
    const adapter = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { if (writeFailures.count > 0) { writeFailures.count -= 1; const e = new Error('blocked'); e.code = 'STORAGE_BLOCKED'; throw e; } map.set(k, String(v)); },
      keys: () => Array.from(map.keys()),
      authoritative: () => true
    };
    const created = mod.createStore(adapter, { now: () => clock.iso() });
    store = created.store || created;
    const opened = store.open({ replay: () => [] });
    if (!opened || opened.ok !== true || opened.blocked) throw new Error('real store did not open: ' + JSON.stringify(opened));
    backend = 'real';
    snapshot = () => JSON.stringify(Array.from(map.entries()));
  } else {
    store = makeFakeStore(clock);
    snapshot = () => store.snapshot();
  }
  let counter = 0;
  const ctx = (session, extra = {}) => ({
    session,
    stepUp: undefined,
    clientRef: undefined,
    now: () => new Date(clock.ms()),
    ...extra
  });
  const ctxPin = (session, extra = {}) => ctx(session, { stepUp: { ok: true, at: clock.ms() }, ...extra });
  const ref = () => { counter += 1; return 'svs-test-' + counter.toString(36) + 'x' + counter; };
  const failWrites = (n = 1) => { if (backend === 'real') writeFailures.count = n; else store.failNextAppend('SVCS_WRITE_FAILED'); };
  return { store, backend, clock, snapshot, ctx, ctxPin, ref, adapterMap: realMap, failWrites };
}

// A valid invented part input (integer paise, basis points).
export function part(code, extra = {}) {
  return {
    code,
    name: 'Battery 377 (invented ' + code + ')',
    group: 'Battery',
    unit: 'pc',
    hsn: '',
    gstRateBp: null,
    priceIncludesTax: true,
    sellPricePaise: 15000,
    reorderLevel: 0,
    reorderQty: 0,
    bin: '',
    flags: {},
    ...extra
  };
}
export function labour(code, extra = {}) {
  return { code, name: 'Service job (invented ' + code + ')', group: 'Service', unit: 'job', sac: '', gstRateBp: null, priceIncludesTax: true, ratePaise: 50000, ...extra };
}

export const NO_STOCK = Object.freeze({ hasMovements: () => false, isReferenced: () => false, onHand: () => 0 });
