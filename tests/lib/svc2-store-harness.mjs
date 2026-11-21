// tests/lib/svc2-store-harness.mjs
// Helpers for the Phase 2 store tests (streams invoices and receipts, new number series, series seed).
// Builds on the Phase 1 harness (read only). Invented data only: no customer name, mobile, GSTIN or PAN anywhere.
import { createRequire } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, makeClock, makeAdapter, newStore, openStore, put, postNumbered, expectFail, expectOk, parseShard, forgeChain
} from './svc1-store-harness.mjs';

export { Store, ACTORS, makeClock, makeAdapter, newStore, openStore, put, postNumbered, expectFail, expectOk, parseShard, forgeChain };

const require = createRequire(import.meta.url);
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const STORE_PATH = `${ROOT}/www/service-stores-store.js`;
export const P = Store.SVCS_PREFIX;
export const plain = (v) => JSON.parse(JSON.stringify(v));

// The committed Phase 1 store (commit 031841f), read with git. Returns null when git or the commit is not available.
export const PHASE1_COMMIT = '031841f';
export const PHASE1_SHA256 = '74b0f1583393c404a2b549223459801c437df1e0a620e7d0110518836dc70f6d';
export function loadPhase1Store() {
  let r;
  try {
    r = spawnSync('git', ['show', PHASE1_COMMIT + ':www/service-stores-store.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } catch (e) { return null; }
  if (!r || r.status !== 0 || typeof r.stdout !== 'string' || r.stdout.length < 1000) return null;
  if (Store.sha256Hex(r.stdout) !== PHASE1_SHA256) return null;
  const box = { module: { exports: {} } };
  vm.runInNewContext(r.stdout, box);
  return box.module.exports;
}

// One numbered posting through the real flow: ask for the time, ask for the number, append.
export function postInvoice(store, body = {}, extra = {}) {
  return postNumbered(store, 'SV', 'invoices', 'INV_ISSUE', Object.assign({ jobId: 'J-1', docDate: '2026-11-18', totalPaise: 118000 }, body), extra);
}
export function postCredit(store, body = {}, extra = {}) {
  return postNumbered(store, 'SCN', 'invoices', 'CN_ISSUE', Object.assign({ jobId: 'J-1', mode: 'FULL', totalPaise: 5000 }, body), extra);
}
export function postAdvance(store, body = {}, extra = {}) {
  return postNumbered(store, 'SAR', 'receipts', 'SAR', Object.assign({ jobId: 'J-1', amountPaise: 50000, payMode: 'Cash' }, body), extra);
}
export function postReceipt(store, body = {}, extra = {}) {
  return postNumbered(store, 'SRC', 'receipts', 'SRC', Object.assign({ jobId: 'J-1', invoiceNo: 'SV/2026-27/0001', amountPaise: 68000, payMode: 'UPI' }, body), extra);
}
export function postRefund(store, body = {}, extra = {}) {
  return postNumbered(store, 'SRF', 'receipts', 'SRF', Object.assign({ jobId: 'J-1', amountPaise: 1000, payMode: 'Cash', reason: 'test refund' }, body), extra);
}

export function seedItem(series, fy, last, r) {
  const it = { k: 'SERIES_SEED', b: { seriesSeed: { series, fy, last } } };
  if (r) it.r = r;
  return it;
}

// A seed alone, in its own write.
export function putSeed(store, stream, series, fy, last, extra = {}) {
  return put(store, stream, seedItem(series, fy, last), extra);
}

// The one batch the billing layer sends at the first new invoice: [seed, invoice with the number after the seed].
export function seedAndInvoice(store, last, fy = '2026-27', body = {}) {
  const t = store.nextAt('invoices');
  assert.equal(t.ok, true, JSON.stringify(t));
  const no = 'SV/' + fy + '/' + String(last + 1).padStart(4, '0');
  return put(store, 'invoices', [
    seedItem('SV', fy, last),
    { k: 'INV_ISSUE', series: 'SV', b: Object.assign({ no, jobId: 'J-1', docDate: '2026-11-18' }, body) }
  ], { at: t.at });
}

// ---- hand-made damage that keeps the chain valid where a test needs it ----

const NL = String.fromCharCode(10);
export function recHash(stream, rec) {
  return Store.sha256Hex([stream, rec.p, rec.n, rec.at, rec.k, rec.r || '', Store.canonicalText(rec.a), Store.canonicalText(rec.b)].join(NL));
}

// Rewrites one shard after `mutate(records)` and recomputes p and h of every record of the shard (the shard must be the
// first one of its stream, or `prevH` is given). Then fixes the head row of that stream to the new last record.
export function resealShard(adapter, stream, key, mutate, prevH = '0'.repeat(64)) {
  const recs = JSON.parse(adapter.data.get(key));
  mutate(recs);
  let p = prevH;
  for (const rec of recs) { rec.p = p; rec.h = recHash(stream, rec); p = rec.h; }
  adapter.data.set(key, JSON.stringify(recs));
  const rows = JSON.parse(adapter.data.get(Store.HEAD_KEY));
  for (const row of rows) if (row.s === stream && row.key === key) { row.h = p; row.n = recs[recs.length - 1].n; row.at = recs[recs.length - 1].at; }
  adapter.data.set(Store.HEAD_KEY, '[' + rows.map((x) => '{"s":"' + x.s + '","rev":' + x.rev + ',"n":' + x.n + ',"h":"' + x.h + '","at":"' + x.at + '","key":"' + x.key + '"}').join(',') + ']');
  return p;
}

// ---- one healthy store with both new streams over two financial years and several parts ----
// Counts are fixed by the recipe, so tests can type them by hand:
//   invoices FY2026-27: seed 41 + SV 0042, then 100 more invoices (SV 0043..0142), 2 credit notes (SCN 0001, 0002), 2 estimates
//   receipts FY2026-27: 3 advances (SAR 0001..0003), 2 receipts (SRC 0001, 0002), 1 refund (SRF 0001), then 90 more receipts (SRC 0003..0092)
//   FY2027-28 (after 5 April 2027): SV 0001, SCN 0001, SAR 0001, SRC 0001, SRF 0001
export const FILLER = 'q'.repeat(380);
export function buildTwoYears() {
  const clock = makeClock('2026-09-10T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  for (let i = 1; i <= 3; i++) { clock.advance(1000); expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: i, unitCostPaise: 100 + i }, { r: 'REF:grn:' + i })); }
  clock.advance(1000);
  expectOk(seedAndInvoice(store, 41));
  for (let i = 0; i < 100; i++) { clock.advance(1000); expectOk(postInvoice(store, { filler: FILLER, i }, { r: 'REF:inv:' + i })); }
  for (let i = 0; i < 2; i++) { clock.advance(1000); expectOk(postCredit(store, { invoiceNo: 'SV/2026-27/0042' })); }
  for (let i = 0; i < 2; i++) { clock.advance(1000); expectOk(put(store, 'invoices', { k: 'EST_SAVE', b: { jobId: 'J-' + i, version: 1, note: 'estimate ' + i } })); }
  for (let i = 0; i < 3; i++) { clock.advance(1000); expectOk(postAdvance(store)); }
  for (let i = 0; i < 2; i++) { clock.advance(1000); expectOk(postReceipt(store)); }
  clock.advance(1000); expectOk(postRefund(store));
  for (let i = 0; i < 90; i++) { clock.advance(1000); expectOk(postReceipt(store, { filler: FILLER, i }, { r: 'REF:rct:' + i })); }
  clock.set('2027-04-05T05:00:00.000Z');
  expectOk(postInvoice(store)); clock.advance(1000);
  expectOk(postCredit(store)); clock.advance(1000);
  expectOk(postAdvance(store)); clock.advance(1000);
  expectOk(postReceipt(store)); clock.advance(1000);
  expectOk(postRefund(store)); clock.advance(1000);
  return { adapter, clock, store };
}

export { require };
export function readSrc() { return fs.readFileSync(STORE_PATH, 'utf8'); }
