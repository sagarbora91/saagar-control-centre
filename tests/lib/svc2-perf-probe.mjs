// Stage E round 3 (D-perf-1): open the whole Service stack in Node on a snapshot of the browser storage and measure each stage.
// Usage (through the memory guard): node --expose-gc tests/lib/svc2-perf-probe.mjs <snapshot.json> [jobId]
// Prints one JSON line per stage: ms, heap growth (MB), JSON.parse calls. Invented data only (the tester's seeded snapshots).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { makeAdapter } from './svc1-store-harness.mjs';
const require = createRequire(import.meta.url);
const W = '../../www/';
const Store = require(W + 'service-stores-store.js');
const Fifo = require(W + 'service-stores-fifo.js');
const Masters = require(W + 'service-stores-masters.js');
const Docs = require(W + 'service-stores-docs.js');
const StoresCore = require(W + 'service-stores-core.js');
const BillingCore = require(W + 'service-billing-core.js');
const Calc = require(W + 'service-billing-calc.js');
const Money = require(W + 'service-billing-money.js');
const Bill = require(W + 'service-billing-docs.js');
const Migrate = require(W + 'service-billing-migrate.js');

export const OWNER = Object.freeze({ ok: true, tier: 'owner', role: 'Owner', actorName: 'Probe Owner', isOwner: true, isManager: false });

// Count JSON.parse calls (the www files run in this realm).
const realParse = JSON.parse;
export const counts = { parse: 0, parseChars: 0 };
JSON.parse = function (t, r) { counts.parse += 1; counts.parseChars += typeof t === 'string' ? t.length : 0; return realParse(t, r); };

export function loadSnapshot(file) {
  const all = realParse(fs.readFileSync(file, 'utf8'));
  const data = new Map();
  for (const [k, v] of Object.entries(all)) if (k.indexOf('saagar_svcs_') === 0 || k === Store.WATERMARK_KEY) data.set(k, String(v));
  let jobs = [];
  try { jobs = realParse(all.saagar_wsf_v2 || '[]'); } catch (e) { jobs = []; }
  return { data, jobs, keys: data.size, bytes: Array.from(data.values()).reduce((a, v) => a + v.length, 0) };
}

export function openStack(snap, opts = {}) {
  const stages = [];
  const gc = () => { if (global.gc) global.gc(); };
  const step = (name, fn) => {
    gc();
    const h0 = process.memoryUsage().heapUsed;
    const p0 = counts.parse;
    const t0 = process.hrtime.bigint();
    const r = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const h1 = process.memoryUsage().heapUsed;
    stages.push({ stage: name, ms: Math.round(ms), heapMB: Math.round((h1 - h0) / 1048576), parses: counts.parse - p0 });
    return r;
  };
  const now = opts.now || (() => new Date(opts.nowIso || '2026-11-19T06:00:00.000Z'));
  const adapter = opts.adapter || makeAdapter(new Map(snap.data));
  const byId = new Map(snap.jobs.map((j) => [String(j.id), j]));
  const cases = {
    get: (id) => {
      const j = byId.get(id);
      return j ? { id, status: j.status === 'closed' || j.status === 'delivered' ? 'closed' : 'open', invoiceNo: j.invoiceNo || '', paymentStatus: j.paymentStatus || 'pending', stub: false, voided: false, typedAdvancePaise: 0, label: id } : null;
    },
    list: () => snap.jobs.map((j) => cases.get(String(j.id))).filter(Boolean),
    legacyFloor: () => 0,
    legacyInput: () => null,
    firm: () => ({ name: 'Probe Works', gstin: '27AAAAA0000A1Z5', address: '1 Probe Road', state: 'Maharashtra', stateCode: '27' })
  };
  let handle = null;
  const made = step('stores core create', () => StoresCore.create({
    adapter, now, cases, libs: { store: Store, fifo: Fifo, masters: Masters, docs: Docs }, share: (h) => { handle = h; }
  }));
  if (!made.ok) throw new Error('stores core: ' + JSON.stringify(made));
  const session = () => OWNER;
  const res = step('billing core create', () => BillingCore.create({
    share: handle, calc: Calc, docsLib: Bill, moneyLib: Money, migrateLib: Migrate, masters: Masters, cases, now, storeLib: Store, session, stepUpAt: opts.stepUpAt || (() => 0)
  }));
  if (!res.ok) throw new Error('billing core: ' + JSON.stringify(res));
  const c = res.core;
  const ctx = { session: OWNER };
  step('share ready', () => handle.ready());
  step('stores status', () => made.core.status(ctx));
  step('billing status', () => c.status(ctx));
  const jid = opts.jobId || (snap.jobs[0] && String(snap.jobs[0].id));
  step('billing getJob', () => c.getJob(jid, ctx));
  step('billing repairLinks', () => c.repairLinks());
  step('migration plan', () => c.planMigration(ctx));
  step('billing status again', () => c.status(ctx));
  return { stages, core: c, stores: made.core, handle, adapter, cases };
}

if (process.argv[1] && process.argv[1].endsWith('svc2-perf-probe.mjs')) {
  const snap = loadSnapshot(process.argv[2]);
  const t0 = Date.now();
  const out = openStack(snap, { jobId: process.argv[3] });
  for (const s of out.stages) console.log(JSON.stringify(s));
  console.log(JSON.stringify({ keys: snap.keys, bytes: snap.bytes, jobs: snap.jobs.length, totalMs: Date.now() - t0, peakRssMB: Math.round(process.memoryUsage().rss / 1048576) }));
}

// The page's open-time link repair (svbApplyRepairs), run with the page's own functions on the snapshot's job list.
// saveDB, svcMergeForeignCases and the billing glue come from www/modules/service/index.html; storage is a Map.
export async function pageRepair(snap, core) {
  const vm = await import('node:vm');
  const { extractFunction, service } = await import('./fix-s08-source.mjs');
  const BLOCK_START = '// \u2500\u2500\u2500 BILLING GLUE (Service wave 2; the libraries are loaded in <head>) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
  const PHASE1_START = '// \u2500\u2500\u2500 STORES GLUE (Service Stores, Phase 1; the libraries are loaded in <head>) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
  const block = service.slice(service.indexOf(BLOCK_START), service.indexOf(PHASE1_START));
  const store = new Map([['saagar_wsf_v2', JSON.stringify(snap.jobs)]]);
  const log = { saves: 0, savedChars: 0 };
  const g = {
    console: { warn() {}, log() {}, error() {} }, document: { getElementById: () => null },
    DB: realParse(store.get('saagar_wsf_v2')), STORE_KEY: 'saagar_wsf_v2', SVC_SETTINGS: { deleted: [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { log.saves += 1; log.savedChars += String(v).length; store.set(k, String(v)); } },
    toast() {}, parseRupee: (v) => parseFloat(v) || 0, todayStr: () => '2026-11-19', isPastView: () => false, editId: null, viewDate: '2026-11-19', rowN: 0,
    svcD3Reauth: async () => true, showView() {}, openEdit() {}, scrollToSec() {}, nowLocalDT: () => '2026-11-19T10:00', svcReloadSettings: () => ({ invoiceSeq: {} }), SaagarServiceStoresStore: Store
  };
  g.byId = (id) => g.DB.find((c) => c.id === id);
  const ctx = vm.createContext(g);
  vm.runInContext(extractFunction('svcDeletedIds') + '\n' + extractFunction('svcMergeForeignCases') + '\n' + extractFunction('saveDB') + '\n' + block, ctx);
  ctx.svbBilling = () => core;
  const links = core.repairLinks();
  const rows = Array.isArray(links) ? links : (links && (links.rows || links.links)) || [];
  const t0 = process.hrtime.bigint();
  const h0 = process.memoryUsage().heapUsed;
  const n = ctx.svbApplyRepairs();
  return { stage: 'page svbApplyRepairs', links: rows.length, repaired: n, saves: log.saves, savedMB: Math.round(log.savedChars / 1048576), ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6), heapMB: Math.round((process.memoryUsage().heapUsed - h0) / 1048576) };
}
if (process.argv[1] && process.argv[1].endsWith('svc2-perf-probe.mjs') && process.argv[4] === 'page') {
  const snap = loadSnapshot(process.argv[2]);
  // "stale": the job list lost its bill numbers (an older job-list backup over newer billing): every bill needs the repair
  if (process.argv[5] === 'stale') for (const j of snap.jobs) j.invoiceNo = '';
  const out = openStack(snap, {});
  console.log(JSON.stringify(await pageRepair(snap, out.core)));
}
