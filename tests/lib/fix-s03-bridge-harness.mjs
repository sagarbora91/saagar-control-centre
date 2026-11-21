import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const bridgeSource = fs.readFileSync(path.join(root, 'www/integration-bridge.js'), 'utf8');

/* Loads www/integration-bridge.js into a vm context with a Map-backed localStorage.
   Values are always kept as JSON strings, so no object crosses the vm realm. */
export function makeBridge(initial = {}, { now = '2026-11-12T06:00:00.000Z', extra = {}, readyState = 'loading' } = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const writes = {};
  let failKey = null;
  let cur = now;
  const ls = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (k === failKey) { failKey = null; throw new Error('quota'); }
      writes[k] = (writes[k] || 0) + 1;
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; }
  };
  const Real = Date;
  class FixedDate extends Real {
    constructor(...a) { super(...(a.length ? a : [cur])); }
    static now() { return new Real(cur).getTime(); }
  }
  const ctx = {
    localStorage: ls,
    document: { readyState, addEventListener() {}, getElementById() { return null; } },
    console: { log() {}, warn() {}, error() {} },
    Date: FixedDate, setTimeout() { return 1; }, setInterval() { return 1; }, addEventListener() {}, ...extra
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(bridgeSource, ctx, { filename: 'integration-bridge.js' });
  return {
    ctx, writes,
    get: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    set: (k, v) => map.set(k, typeof v === 'string' ? v : JSON.stringify(v)),
    del: (k) => map.delete(k),
    failNext: (k) => { failKey = k; },
    setNow: (iso) => { cur = iso; },
    run: () => ctx.SaagarBridge.runNow(),
    setModule: (id) => vm.runInContext('var activeModuleId=' + JSON.stringify(id), ctx),
    json: (expr) => JSON.parse(vm.runInContext('JSON.stringify(' + expr + ')', ctx))
  };
}
