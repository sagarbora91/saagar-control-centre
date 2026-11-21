// tests/lib/svc2-bridge-seed.mjs
// Helpers for the Service wave 2 bridge tests (www/integration-bridge.js). Invented data only: no real name,
// mobile number, GSTIN or PAN. The harness runs a bridge source (the new file or the 031841f copy) in a vm with a
// Map-backed localStorage, the same way tests/lib/fix-s03-bridge-harness.mjs does, but the source is a parameter.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NEW_FILE = path.join(root, 'www/integration-bridge.js');
export const OLD_FILE = path.join(root, 'tests/fixtures/service-wave-2/bridge-031841f.js');
export const newSource = fs.readFileSync(NEW_FILE, 'utf8');
export const oldSource = fs.readFileSync(OLD_FILE, 'utf8');

export const TODAY = '2026-11-12';
export const NOW = '2026-11-12T06:00:00.000Z';
export const FY = 'saagar_svcs_receipts_v1_FY2026-27';
export const FY_P2 = 'saagar_svcs_receipts_v1_FY2026-27_p2';

/* Runs a bridge source. Values are kept as JSON strings so no object crosses the vm realm. */
export function makeBridge(initial = {}, { now = NOW, source = newSource, extra = {} } = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const writes = {};
  const failures = [];
  let cur = now;
  const ls = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const i = failures.findIndex((f) => f === k);
      if (i >= 0) { failures.splice(i, 1); throw new Error('quota'); }
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
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console: { log() {}, warn() {}, error() {} },
    Date: FixedDate, setTimeout() { return 1; }, setInterval() { return 1; }, addEventListener() {}, ...extra
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'integration-bridge.js' });
  const b = {
    ctx, writes, map,
    get: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    raw: (k) => (map.has(k) ? map.get(k) : null),
    set: (k, v) => map.set(k, typeof v === 'string' ? v : JSON.stringify(v)),
    del: (k) => map.delete(k),
    failNext: (k) => { failures.push(k); },
    setNow: (iso) => { cur = iso; },
    run: () => ctx.SaagarBridge.runNow(),
    setModule: (id) => vm.runInContext('var activeModuleId=' + JSON.stringify(id), ctx),
    // the whole storage as one comparable text (keys sorted)
    dump: () => JSON.stringify([...map.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))),
    ledger: () => b.get('gm_expenses') || [],
    items: () => ((b.get('saagar_exceptions') || {}).items || []),
    events: (type) => (b.get('saagar_bus') || []).filter((e) => e.type === type)
  };
  return b;
}

/* ---- Service receipt records, shaped like the real store writes them (checked against the real store in the e2e test) ---- */
const ZERO = '0'.repeat(64);
export function rec(k, body, n = 1, extra = {}) {
  return Object.assign({
    n, id: 'RCT-' + String(n).padStart(6, '0'), at: '2026-11-12T05:00:00.000Z', k,
    a: { m: 'Test Owner', r: 'Owner', t: 'owner' }, b: body, p: ZERO, h: ('a'.repeat(63) + (n % 10)).slice(0, 64)
  }, extra);
}
export const sar = (no, jobId, amountPaise, docDate = TODAY, extra = {}) =>
  rec('SAR', Object.assign({ amountPaise, docDate, jobId, no, note: '', payMode: 'Cash', payRef: '' }, extra));
export const src = (no, body) => rec('SRC', Object.assign({ amountPaise: 1000, docDate: TODAY, note: '', payMode: 'Cash', payRef: '', no }, body));
export const srf = (no, body) => rec('SRF', Object.assign({ amountPaise: 1000, docDate: TODAY, payMode: 'Cash', payRef: '', reason: 'goods returned', pinAt: 1, no }, body));
export const rrv = (reverses, extra = {}) => rec('RRV', Object.assign({ amountPaise: 1000, docDate: TODAY, pinAt: null, reason: 'wrong amount typed', reverses, side: 'IN' }, extra));
export const shard = (...recs) => recs.map((r, i) => Object.assign({}, r, { n: i + 1, id: 'RCT-' + String(i + 1).padStart(6, '0') }));

/* ---- Service job records of the old (v1) job list and old close form ---- */
export const closedJob = (id, over = {}) => Object.assign({
  id, status: 'closed', closedAt: '2026-11-12T05:00:00Z', custName: 'Test Customer', brand: 'Titan', model: 'Edge',
  delivery: { finalAmt: 777, payMode: 'Cash', collectDate: TODAY }
}, over);
export const openStmts = (extra = {}) => Object.assign({ [TODAY]: { date: TODAY, closed: false } }, extra);

/* ---- small readers ---- */
export const rowsOf = (b, ref) => b.ledger().filter((x) => x.sourceRef === ref);
export const live = (rows) => rows.filter((x) => x && x.void !== true);
export const sumRows = (rows, type, mode) => rows
  .filter((x) => x && x.void !== true && x.type === type && (!mode || x.mode === mode))
  .reduce((s, x) => s + Math.round(x.amount * 100), 0);
export const noMarker = (rows) => rows.filter((x) => !(x.source === 'wsc' && x.void === true && x.amount === 0));
export const markers = (rows) => rows.filter((x) => x.source === 'wsc' && x.void === true && x.amount === 0);
