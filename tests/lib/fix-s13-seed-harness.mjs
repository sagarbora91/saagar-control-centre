// Test helper for S13 (new file). Runs www/demo-seed.js in a vm with a fixed clock.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoDir = path.resolve(here, '..', '..');
export const FIXED_NOW = Date.parse('2026-11-12T08:00:00Z');

export function readSeedSource(file) {
  return fs.readFileSync(file || path.join(repoDir, 'www', 'demo-seed.js'), 'utf8');
}

export async function runSeed({ days, walk = 10, source } = {}) {
  const storage = new Map();
  let archive = null;
  let seedPromise = null;
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(FIXED_NOW); else super(...args); }
    static now() { return FIXED_NOW; }
  }
  const localStorage = {
    getItem(key) { return storage.has(String(key)) ? storage.get(String(key)) : null; },
    setItem(key, value) { storage.set(String(key), String(value)); },
    removeItem(key) { storage.delete(String(key)); },
    clear() { storage.clear(); }
  };
  const context = {
    __SEED_DAYS: days,
    __SEED_WALK: walk,
    Date: FixedDate,
    localStorage,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    document: {
      createElement() { throw new Error('no DOM'); },
      createEvent() { throw new Error('no DOM'); },
      body: {}
    }
  };
  context.window = context;
  context.Capacitor = { Plugins: { Filesystem: { async writeFile({ data }) { archive = JSON.parse(data); }, async rename() {} } } };
  if (days >= 300) {
    context.SaagarStore = {
      bulkAsync(fn) { seedPromise = Promise.resolve().then(fn); return seedPromise; },
      bulk(fn) { return fn(); }
    };
  }
  vm.createContext(context);
  vm.runInContext(source || readSeedSource(), context, { filename: 'demo-seed.js', timeout: 20_000 });
  if (days >= 300) { if (!seedPromise) throw new Error('big seed did not use bulkAsync'); await seedPromise; }
  const get = (key) => {
    if (!storage.has(key)) return undefined;
    const v = storage.get(key);
    try { return JSON.parse(v); } catch (_) { return v; }
  };
  return { storage, archive, get };
}

import crypto from 'node:crypto';

const STRIP = new Set(['id', 'sourceRef', 'customerId', 'qmsId', 'leadId', 'caseId']);
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) if (!STRIP.has(k)) out[k] = strip(value[k]);
    return out;
  }
  return value;
}

// SHA-256 over the parts of the seed that this group must NOT move: ledger rows, queue customers
// (live + archive), service cases, payroll rows (not run snapshots) and leaves, with id-like keys removed.
export function stableDigest(run) {
  const queue = run.get('retail_queue_management_v1') || { customers: [] };
  const payroll = run.get('payroll_suite_v1_2026') || {};
  const leave = run.get('leavedesk_v3') || {};
  const parts = {
    expenses: strip(run.get('gm_expenses')),
    customers: strip(queue.customers),
    archive: strip(run.archive || []),
    service: strip(run.get('saagar_wsf_v2')),
    payrollRows: strip(payroll.rows),
    leaves: strip(leave.leaves)
  };
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
