// Service wave 2, durability fix, independent audit (H-durability-audit): the gaps the audit found in the DURABILITY GLUE block and their fixes.
// A1 first start before the store is ready (the move of old data into the native store runs then) holds the module behind the notice.
// A2 a field missing from _status() never turns the notice on by itself. A3 a settled legacy store is not polled every second.
// A4 to A6 every job-list save (a new job, a watch taken in, a close, a follow-up, a workboard move) is flushed at once, not on the 6 s timer.
// A7 nothing is printed while a money or document record is still being saved. A8 when the notice lifts the case list is read again.
// A9 the time figures and the late Stores core. Invented data only. SVC2_DURABILITY_PAGE (optional) points at a mutated copy of the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = process.env.SVC2_DURABILITY_PAGE || path.resolve(here, '../www/modules/service/index.html');
const page = fs.readFileSync(PAGE_PATH, 'utf8');
const START = '// ─── DURABILITY GLUE';
const BLOCK = page.slice(page.indexOf(START), page.indexOf('var svbBillingRef = null;', page.indexOf(START)));
const BILL_START = '// ─── BILLING GLUE (Service wave 2; the libraries are loaded in <head>) ─────────────';
const BILL_BLOCK = page.slice(page.indexOf(BILL_START), page.indexOf('// ─── STORES GLUE (Service Stores, Phase 1; the libraries are loaded in <head>) ─────────────'));
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attrs = {}; this.listeners = {}; this.id = ''; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(n, f) { this.listeners[n] = f; }
  click() { if (this.listeners.click) this.listeners.click(); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  find(id) { return this.id === id ? this : this.children.map(c => c.find && c.find(id)).find(Boolean) || null; }
}
function makeDoc() {
  const body = new El('body');
  return { body, createElement: t => new El(t), getElementById: id => body.find(id) };
}

// status: fields over a ready, settled native store. flush(n): the n-th flush answer. Globals: extra page globals (saveDB and so on).
function env({ status = {}, flush = null, noStatus = false, authoritative = true, globals = {}, code = BLOCK } = {}) {
  const doc = makeDoc();
  const log = { flushes: 0, statusCalls: 0, writes: 0, saves: 0, commits: 0, reloads: 0 };
  const st = Object.assign({ ready: true, dirty: false, dirtyKeys: 0, rows: 100, nativeRows: 100, hasFS: true, persistenceMode: 'native-incremental', storageBlocked: false }, status);
  const store = {
    _status: () => { log.statusCalls += 1; return Object.assign({}, st); },
    flush: () => { log.flushes += 1; return flush ? flush(log.flushes) : Promise.resolve(true); },
    authoritative: () => authoritative
  };
  if (noStatus) delete store._status;
  const g = Object.assign({
    console: { warn() {}, log() {}, error() {} }, document: doc, setTimeout, clearTimeout, Date, Promise,
    setInterval: () => 7,   // a timer id; the one-second guard tick is driven by hand
    svsCoreRef: null
  }, globals);
  g.window = { parent: { SaagarStore: store } };
  const ctx = vm.createContext(g);
  vm.runInContext(code, ctx);
  ctx.SVCD_FLUSH_MS = 40; ctx.SVCD_RETRY_MS = 60;
  return { ctx, g, log, doc, st, store };
}
const banner = e => e.doc.getElementById('svcd-banner');
const shown = e => !!banner(e) && banner(e).style.display !== 'none';

test('A1 first start before the store is ready (old data being moved into the native store): the notice is on; a desktop browser is not held', () => {
  // a fresh install or the first start after an update: storage-core moves the old data into the native store BEFORE it says ready,
  // and reports persistenceMode legacy-snapshot meanwhile. A job saved then is not carried into the native store.
  assert.equal(env({ status: { ready: false, persistenceMode: 'legacy-snapshot', hasFS: true } }).ctx.svcdFirstLoadOpen(), true);
  const e = env({ status: { ready: false, persistenceMode: 'legacy-snapshot', hasFS: true } });
  assert.equal(e.ctx.svcdGuardTick(), true);
  assert.match(e.doc.getElementById('svcd-prep').textContent, /Preparing storage for first use, please wait/);
  // a desktop browser (no file store) at its own start: never held
  assert.equal(env({ status: { ready: false, persistenceMode: 'legacy-snapshot', hasFS: false } }).ctx.svcdFirstLoadOpen(), false);
  // blocked stays with the existing "storage unavailable" state
  assert.equal(env({ status: { ready: false, persistenceMode: 'blocked', storageBlocked: true, hasFS: true } }).ctx.svcdFirstLoadOpen(), false);
});

test('A2 a field missing from _status() never turns the notice on by itself (no flicker on a normal edit)', () => {
  const normal = { dirty: true, dirtyKeys: 6, rows: 6576, nativeRows: 6576 };   // the real data size: a missing field must not read as zero
  const drop = (k) => { const e = env({ status: normal }); delete e.st[k]; return e.ctx.svcdFirstLoadOpen(); };
  assert.equal(drop('nativeRows'), false, 'no nativeRows: the gap is unknown, not "all rows"');
  assert.equal(drop('rows'), false, 'no rows');
  assert.equal(drop('dirtyKeys'), false, 'no dirtyKeys');
  assert.equal(drop('ready'), false, 'no ready field: not read as "not ready"');
  assert.equal(drop('persistenceMode'), false, 'no mode');
  // the real first-load figures of the emulator still turn it on
  assert.equal(env({ status: { dirty: true, dirtyKeys: 6577, rows: 6577, nativeRows: 2 } }).ctx.svcdFirstLoadOpen(), true);
  assert.equal(env({ status: { dirty: true, dirtyKeys: 3, rows: 6577, nativeRows: 2 } }).ctx.svcdFirstLoadOpen(), true, 'the gap alone');
});

test('A3 a settled legacy store (its _status() reads the whole database) is not asked again every second', () => {
  const e = env({ status: { persistenceMode: 'legacy-snapshot', ready: true } });
  e.ctx.svcdGuardTick();
  const after1 = e.log.statusCalls;
  for (let i = 0; i < 5; i += 1) e.ctx.svcdGuardTick();
  assert.equal(e.log.statusCalls, after1, 'no more _status() calls from the guard once a ready legacy store was seen');
  // a native store is still watched (a restore or a first load can start later)
  const n = env({});
  n.ctx.svcdGuardTick();
  const a = n.log.statusCalls;
  n.ctx.svcdGuardTick();
  assert.ok(n.log.statusCalls > a);
});

test('A4 a job saved from the job form is flushed at once (not on the 6 s timer); "Saving..." shows; a failure shows the warning; the save runs once', async () => {
  let release;
  const e = env({ flush: () => new Promise(r => { release = r; }), globals: { saveDB: function () { e.log.saves += 1; } } });
  e.ctx.saveDB();
  assert.equal(e.log.saves, 1, 'the page save ran once');
  assert.equal(e.log.flushes, 1, 'the flush was asked for at once');
  assert.ok(shown(e) && /Saving\.\.\./.test(banner(e).textContent));
  release(false);
  await tick(10);
  assert.match(banner(e).textContent, /not yet safely saved/);
  assert.equal(e.log.saves, 1, 'a retry never saves the job again');
  e.store.flush = () => { e.log.flushes += 1; return Promise.resolve(true); };
  banner(e).find('svcd-retry').click();
  await tick(10);
  assert.equal(shown(e), false);
});

test('A5 a save that throws (storage refused) is passed on as before and asks for no flush; the workboard commit flushes only when it saved', () => {
  const e = env({ globals: { saveDB: function () { throw new Error('quota'); }, svcD3CommitCases: function (x) { e.log.commits += 1; return x === 'ok'; } } });
  assert.throws(() => e.ctx.saveDB(), /quota/);
  assert.equal(e.log.flushes, 0);
  assert.equal(e.ctx.svcD3CommitCases('no'), false);
  assert.equal(e.log.flushes, 0, 'a refused commit is not flushed');
  assert.equal(e.ctx.svcD3CommitCases('ok'), true);
  assert.equal(e.log.flushes, 1);
  assert.equal(e.log.commits, 2);
  // desktop browser (no file store): no flush, no banner, nothing changes
  const d = env({ status: { hasFS: false, persistenceMode: 'legacy-snapshot' }, globals: { saveDB: function () { d.log.saves += 1; return 'same'; } } });
  assert.equal(d.ctx.saveDB(), 'same');
  assert.equal(d.log.flushes, 0);
  assert.equal(shown(d), false);
  // a page without these functions (the sandboxed tests): nothing is created
  const none = env({});
  assert.equal(typeof none.ctx.saveDB, 'undefined');
});

test('A6 job saves close together: a save made while a flush is waiting is covered by one more flush after it, and the waits do not pile up', async () => {
  const pend = [];
  const e = env({ flush: () => new Promise(r => pend.push(r)), globals: { saveDB: function () { e.log.saves += 1; } } });
  e.ctx.saveDB();
  e.ctx.saveDB();
  e.ctx.saveDB();
  assert.equal(e.log.saves, 3);
  assert.equal(e.log.flushes, 1, 'one wait at a time');
  assert.equal(e.ctx.SVCD.active, 1);
  pend[0](true);
  await tick(5);
  assert.equal(e.log.flushes, 2, 'one more flush, asked AFTER the later saves, so it covers them');
  pend[1](true);
  await tick(5);
  assert.equal(e.log.flushes, 2, 'no further flush');
  assert.equal(e.ctx.SVCD.active, 0);
  assert.equal(shown(e), false);
});

test('A7 nothing is printed while a money or document record is still being saved; printing works again once it is saved', async () => {
  let release;
  const previews = [];
  const toasts = [];
  const e = env({
    code: BILL_BLOCK,
    flush: () => new Promise(r => { release = r; }),
    globals: {
      DB: [], editId: null, viewDate: '2026-11-20', byId: () => null, parseRupee: v => parseFloat(v) || 0, svcD3Reauth: async () => true, isPastView: () => false,
      todayStr: () => '2026-11-20', toast: m => toasts.push(String(m)), showView() {}, openEdit() {}, scrollToSec() {}, nowLocalDT: () => '2026-11-20T10:00',
      svcReloadSettings: () => ({ invoiceSeq: {} }), SaagarModuleBridge: { report: { preview: (t) => previews.push(t) } }
    }
  });
  const facade = { takeReceipt: () => ({ ok: true, result: { no: 'SAR/26-27/0009' } }) };
  const w = e.ctx.svcdWrap(facade, e.ctx.SVCD_WRITES_BILLING, { t: null, w: null }, 'SVCD_PREPARING');
  let got = null;
  Promise.resolve(w.takeReceipt({}, {})).then(r => { got = r; });
  await tick(2);
  assert.equal(got, null);
  assert.equal(e.ctx.svbPrint('serviceReceipt', { svcData: { receipt: { jobId: '' } } }), false, 'refused while the receipt is being saved');
  assert.deepEqual(previews, []);
  assert.match(toasts.join(' | '), /Saving\.\.\. Please wait\. Nothing can be printed/);
  release(true);
  await tick(5);
  assert.equal(got.result.no, 'SAR/26-27/0009');
  assert.equal(e.ctx.svbPrint('serviceReceipt', { svcData: { receipt: { jobId: '' } } }), true);
  assert.deepEqual(previews, ['serviceReceipt']);
});

test('A7b a job-list save that is still waiting does not block printing a bill that is already saved', async () => {
  const previews = [];
  let release;
  const e = env({
    code: BILL_BLOCK,
    flush: () => new Promise(r => { release = r; }),
    globals: {
      DB: [], editId: null, viewDate: '2026-11-20', byId: () => null, parseRupee: v => parseFloat(v) || 0, svcD3Reauth: async () => true, isPastView: () => false,
      todayStr: () => '2026-11-20', toast() {}, showView() {}, openEdit() {}, scrollToSec() {}, nowLocalDT: () => '2026-11-20T10:00',
      svcReloadSettings: () => ({ invoiceSeq: {} }), SaagarModuleBridge: { report: { preview: (t) => previews.push(t) } }
    }
  });
  e.ctx.svcdKick();
  assert.equal(e.ctx.SVCD.active, 1);
  assert.equal(e.ctx.svbPrint('serviceBillSummary', { svcData: { invoice: { jobId: '' } } }), true);
  assert.deepEqual(previews, ['serviceBillSummary']);
  release(true);   // end the wait, so no retry timer is left running
  await tick(5);
  assert.equal(e.ctx.SVCD.active, 0);
});

test('A8 when the notice lifts, the case list is read again from storage (the page may have read an empty or old list while storage was pending)', () => {
  const e = env({ status: { ready: false, persistenceMode: 'authority-pending' }, globals: { svcD3RestorePersistedDb: function () { e.log.reloads += 1; } } });
  assert.equal(e.ctx.svcdGuardTick(), true);
  assert.equal(e.ctx.svcdGuardTick(), true);
  assert.equal(e.log.reloads, 0, 'not while it is on');
  Object.assign(e.st, { ready: true, persistenceMode: 'native-incremental' });
  assert.equal(e.ctx.svcdGuardTick(), false);
  assert.equal(e.log.reloads, 1, 'read again once, as it lifts');
  e.ctx.svcdGuardTick();
  assert.equal(e.log.reloads, 1, 'only once');
  // a store that is still not authoritative is not read (it would answer empty)
  const n = env({ status: { ready: false, persistenceMode: 'authority-pending' }, authoritative: false, globals: { svcD3RestorePersistedDb: function () { n.log.reloads += 1; } } });
  n.ctx.svcdGuardTick();
  Object.assign(n.st, { ready: true, persistenceMode: 'native-incremental' });
  n.ctx.svcdGuardTick();
  assert.equal(n.log.reloads, 0);
  // a normal start that never showed the notice reads nothing again
  const q = env({ globals: { svcD3RestorePersistedDb: function () { q.log.reloads += 1; } } });
  q.ctx.svcdGuardTick(); q.ctx.svcdGuardTick();
  assert.equal(q.log.reloads, 0);
});

test('A9 the time figures are the reported ones, a flush answer other than exactly true is "not saved", and a Stores core made late is still wrapped', async () => {
  assert.match(BLOCK, /var SVCD_FLUSH_MS = 10000;/);
  assert.match(BLOCK, /var SVCD_RETRY_MS = 10000;/);
  assert.match(BLOCK, /var SVCD_BULK_KEYS = 500;/);
  assert.match(BLOCK, /var SVCD_PREP_MAX_MS = 600000;/);
  const odd = env({ flush: () => Promise.resolve({ ok: true }) });
  odd.ctx.SVCD_RETRY_MS = 100000;
  assert.equal(await odd.ctx.svcdAttempt(), false, 'an object is not "true"');
  // the Stores core does not exist yet when the page starts; the one-second tick wraps it once it exists
  let core = null;
  const e = env({ globals: { svsCore: () => e.g.window.svsCoreRef || core } });
  e.ctx.SVCD.timer = 7;
  e.ctx.svcdGuardTick();
  assert.ok(!e.g.window.svsCoreRef, 'no core yet, nothing kept');
  core = { receiveGoods: () => ({ ok: true }) };
  e.ctx.svcdGuardTick();
  assert.ok(e.g.window.svsCoreRef && e.g.window.svsCoreRef !== core, 'the late core was swapped for the wrapped one');
});
