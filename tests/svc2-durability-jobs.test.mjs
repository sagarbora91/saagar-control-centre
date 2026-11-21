// Service wave 2, durability fix for jobs (H-durability-jobs, findings P1 and P2 of the emulator re-test H-emulator section 7).
// P2: a job saved from the job form (doSave, closeCase) holds the screen until SaagarStore.flush() answered true: a cover "Saving the job, please
// wait", the Phase 1 "saved" toast waits, the job card print, Proforma, tax invoice and WhatsApp offer wait or are refused, leaving the form waits;
// a failure shows the red warning and "Try saving again", as for money. Desktop and tests (no file store) are unchanged.
// P1: a DummyData build (parent __DEMO_SEED_ACTIVE true) is "preparing" until the demo seed set its marker (the seed writes its own case list over
// the page's, demo-seed.js 627); job writes from staff actions are refused while preparing, the notice is on from the page's first tick and lifts
// by itself. Status figures are the emulator's (smoke-d1b T1-samples, smoke-d2b st0). Invented data only.
// SVC2_DURABILITY_PAGE (optional) points at a mutated copy of the page (mutation check).
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
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
// The block's retry timers run on this tracked setTimeout, so a test that fails half way never leaves a retry loop keeping Node alive.
const live = new Set();
const vmSetTimeout = (f, ms) => { const h = setTimeout(() => { live.delete(h); f(); }, ms); live.add(h); return h; };
const vmClearTimeout = (h) => { live.delete(h); clearTimeout(h); };
test.afterEach(() => { for (const h of live) clearTimeout(h); live.clear(); });

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

// A fake Service page: the job-form functions call the page globals by name (through g, the vm global), as the real page does.
function env({ status = {}, flush = null, seed = undefined, marker = 'v4_730d_50w', hasGet = true, page: withPage = true, runTick = false } = {}) {
  const doc = makeDoc();
  const log = { flushes: 0, saves: 0, toasts: [], views: [], prints: 0, notifies: 0, raw: {}, commits: 0, reloads: 0, flushesAtSave: [] };
  const st = Object.assign({ ready: true, dirty: false, dirtyKeys: 0, rows: 6566, nativeRows: 6566, hasFS: true, persistenceMode: 'native-incremental', storageBlocked: false }, status);
  const kv = { saagar_demo_seeded: marker };
  const store = {
    _status: () => Object.assign({}, st),
    flush: () => { log.flushes += 1; return flush ? flush(log.flushes) : Promise.resolve(true); },
    authoritative: () => true
  };
  if (hasGet) store.get = k => (Object.prototype.hasOwnProperty.call(kv, k) ? kv[k] : null);
  const parent = { SaagarStore: store };
  if (seed !== undefined) parent.__DEMO_SEED_ACTIVE = seed;
  const g = {
    console: { warn() {}, log() {}, error() {} }, document: doc, setTimeout: vmSetTimeout, clearTimeout: vmClearTimeout, Date, Promise,
    setInterval: runTick ? () => 7 : undefined, svsCoreRef: null
  };
  if (!runTick) delete g.setInterval;
  const hit = (name) => { log.raw[name] = (log.raw[name] || 0) + 1; };
  if (withPage) Object.assign(g, {
    saveDB() { log.saves += 1; },
    toast(m) { log.toasts.push(String(m)); },
    showView(id) { log.views.push(id); },
    offerReadyNotify() { log.notifies += 1; },
    // doSave: validate, change the list, saveDB(), then the Phase 1 toast, the screen refresh and the "ready" WhatsApp offer
    doSave() { hit('doSave'); g.saveDB(); log.flushesAtSave.push(log.flushes); g.toast('✓ Saved — WS-2026-0001'); g.offerReadyNotify('WS-2026-0001'); },
    closeCase() { hit('closeCase'); g.saveDB(); g.toast('✅ Case closed — WS-2026-0001'); setTimeout(() => g.showView('dash'), 5); },
    svcFinishDelete() { hit('svcFinishDelete'); g.saveDB(); },
    markEstimateApproved() { hit('markEstimateApproved'); g.saveDB(); },
    addFollowUp() { hit('addFollowUp'); g.saveDB(); },
    taxInvoiceById() { hit('taxInvoiceById'); },
    logWhatsAppFollowUp() { hit('logWhatsAppFollowUp'); g.saveDB(); },
    doPrint() { log.prints += 1; }, doProforma() { log.prints += 1; }, doTaxInvoice() { log.prints += 1; },
    printById() { log.prints += 1; }, printProformaById() { log.prints += 1; },
    svcD3CommitCases(x) { log.commits += 1; return x === 'ok'; },
    svcD3RestorePersistedDb() { log.reloads += 1; }
  });
  g.window = { parent };
  const ctx = vm.createContext(g);
  vm.runInContext(BLOCK, ctx);
  ctx.SVCD_FLUSH_MS = 40; ctx.SVCD_RETRY_MS = 60;
  return { ctx, g, log, doc, st, kv, store, parent };
}
const el = (e, id) => e.doc.getElementById(id);
const on = (e, id) => !!el(e, id) && el(e, id).style.display !== 'none';

test('J1 job form on a device: the cover shows, the "saved" toast, print, WhatsApp offer and leaving the form all wait until the flush answered true', async () => {
  let release;
  const e = env({ flush: () => new Promise(r => { release = r; }) });
  e.ctx.doSave();
  assert.equal(e.log.saves, 1, 'the job was written once');
  assert.deepEqual(e.log.flushesAtSave, [1], 'the real save was asked for in the same tick, before the form did anything else');
  assert.ok(on(e, 'svcd-hold'), 'the cover is shown');
  assert.match(el(e, 'svcd-hold').textContent, /Saving the job, please wait\. Do not close the app\./);
  assert.ok(on(e, 'svcd-banner') && /Saving\.\.\./.test(el(e, 'svcd-banner').textContent), 'the blue Saving banner too');
  assert.equal(e.log.toasts.some(t => /Saved/.test(t)), false, 'no "saved" toast before the real save');
  assert.equal(e.log.notifies, 0, 'the WhatsApp offer waits');
  for (const p of ['doPrint', 'doProforma', 'doTaxInvoice', 'printById', 'printProformaById', 'taxInvoiceById']) e.ctx[p]('WS-2026-0001');
  assert.equal(e.log.prints, 0, 'no job card, Proforma or invoice while the job is being saved');
  assert.equal(e.log.raw.taxInvoiceById || 0, 0);
  assert.match(e.log.toasts.join(' | '), /Saving the job, please wait\. Nothing can be printed, shared or closed until the job is safely saved\./);
  e.ctx.showView('dash');
  assert.deepEqual(e.log.views, [], 'leaving the form waits');
  e.ctx.showView('form');
  assert.deepEqual(e.log.views, ['form'], 'staying on the form is not held');
  e.ctx.doSave();
  assert.equal(e.log.raw.doSave, 1, 'a second press while saving is refused, nothing is saved twice');
  release(true);
  await tick(5);
  assert.equal(on(e, 'svcd-hold'), false, 'the cover lifts');
  assert.equal(on(e, 'svcd-banner'), false);
  assert.ok(e.log.toasts.includes('✓ Saved — WS-2026-0001'), 'the "saved" toast shows now, after the real save');
  assert.equal(e.log.notifies, 1, 'the WhatsApp offer runs now');
  assert.deepEqual(e.log.views, ['form', 'dash'], 'the held view change runs now');
  e.ctx.doPrint();
  assert.equal(e.log.prints, 1, 'printing works again');
});

test('J2 the job save fails: the red warning and "Try saving again" show, the cover says it is not yet saved; the retry saves it, the job is written once', async () => {
  let answer = false;
  const e = env({ flush: () => Promise.resolve(answer) });
  e.ctx.doSave();
  await tick(10);
  assert.match(el(e, 'svcd-banner').textContent, /This record is not yet safely saved/);
  assert.ok(el(e, 'svcd-banner').find('svcd-retry'), 'the retry button');
  assert.ok(on(e, 'svcd-hold'));
  assert.match(el(e, 'svcd-hold').textContent, /This job is not yet safely saved\. Keep the app open/);
  assert.equal(e.log.toasts.some(t => /Saved/.test(t)), false);
  answer = true;
  el(e, 'svcd-banner').find('svcd-retry').click();
  await tick(10);
  assert.equal(on(e, 'svcd-hold'), false);
  assert.equal(on(e, 'svcd-banner'), false);
  assert.equal(e.log.saves, 1, 'the retry never writes the job again');
  assert.ok(e.log.toasts.includes('✓ Saved — WS-2026-0001'));
});

test('J3 a flush that never answers ends in the warning (no endless "saving" without a word) and keeps trying by itself', async () => {
  let n = 0;
  const e = env({ flush: (k) => { n = k; return k < 3 ? new Promise(() => {}) : Promise.resolve(true); } });
  e.ctx.doSave();
  await tick(55);
  assert.match(el(e, 'svcd-banner').textContent, /not yet safely saved/, 'the 10 s attempt limit (40 ms here) turned it into the warning');
  await tick(400);
  assert.ok(n >= 3, 'tried again by itself');
  assert.equal(on(e, 'svcd-hold'), false, 'released after the later true answer');
});

test('J4 closing the case: the "Case closed" toast and the move to the case list wait for the real save', async () => {
  let release;
  const e = env({ flush: () => new Promise(r => { release = r; }) });
  e.ctx.closeCase();
  await tick(15);
  assert.ok(on(e, 'svcd-hold'));
  assert.equal(e.log.toasts.some(t => /Case closed/.test(t)), false);
  assert.deepEqual(e.log.views, [], 'the form stays until the save answered');
  release(true);
  await tick(5);
  assert.ok(e.log.toasts.some(t => /Case closed/.test(t)));
  assert.deepEqual(e.log.views, ['dash']);
});

test('J5 desktop browser and tests (no file store, or no parent store): the job form behaves exactly as before', () => {
  for (const status of [{ hasFS: false, persistenceMode: 'legacy-snapshot' }]) {
    const e = env({ status });
    e.ctx.doSave();
    assert.equal(e.log.flushes, 0);
    assert.equal(on(e, 'svcd-hold'), false);
    assert.ok(e.log.toasts.includes('✓ Saved — WS-2026-0001'), 'the toast at once');
    assert.equal(e.log.notifies, 1);
    e.ctx.doPrint(); e.ctx.showView('dash');
    assert.equal(e.log.prints, 1);
    assert.deepEqual(e.log.views, ['dash']);
  }
  const none = env({});
  none.g.window.parent = undefined;
  none.ctx.doSave();
  assert.equal(on(none, 'svcd-hold'), false);
  assert.ok(none.log.toasts.includes('✓ Saved — WS-2026-0001'));
  // a page without these functions: nothing is created
  const bare = env({ page: false });
  assert.equal(typeof bare.ctx.doSave, 'undefined');
  assert.equal(typeof bare.ctx.toast, 'undefined');
});

test('J6 other job-list saves (not the job form) are still flushed at once but do not hold the screen', async () => {
  let release;
  const e = env({ flush: () => new Promise(r => { release = r; }) });
  e.ctx.addFollowUp();
  assert.equal(e.log.flushes, 1);
  assert.equal(on(e, 'svcd-hold'), false);
  e.ctx.doPrint();
  assert.equal(e.log.prints, 1);
  release(true);
  await tick(5);
});

test('J7 P1: a DummyData build is "preparing" until the demo seed has set its marker, with the emulator figures at 26 s and 42 s', () => {
  // smoke-d1b T1-samples at 26 s: ready, native, dirty, 18 keys waiting, 19 rows, 2 in the native store; smoke-d2b st0 at 42 s: 78 / 79 / 2
  const at26 = { dirty: true, dirtyKeys: 18, rows: 19, nativeRows: 2 };
  const at42 = { dirty: true, dirtyKeys: 78, rows: 79, nativeRows: 2 };
  assert.equal(env({ status: at26, seed: true, marker: null }).ctx.svcdFirstLoadOpen(), true, '26 s');
  assert.equal(env({ status: at42, seed: true, marker: null }).ctx.svcdFirstLoadOpen(), true, '42 s');
  assert.equal(env({ status: { dirty: false, dirtyKeys: 0, rows: 3, nativeRows: 2 }, seed: true, marker: null }).ctx.svcdFirstLoadOpen(), true, 'before the seed even started');
  assert.equal(env({ status: at42, seed: true, marker: '' }).ctx.svcdFirstLoadOpen(), true, 'an empty marker is not a marker');
  // the earlier rule alone left these open (the gap of P1)
  assert.equal(env({ status: at42 }).ctx.svcdFirstLoadOpen(), false, 'a plain build (no seed flag) with the same figures: not held');
  assert.equal(env({ status: at42, seed: false, marker: null }).ctx.svcdFirstLoadOpen(), false, 'flag false');
  assert.equal(env({ status: at42, seed: 'true', marker: null }).ctx.svcdFirstLoadOpen(), false, 'only the real boolean true counts, as in the shell');
  // after the seed: the marker is set; the final publish is still covered by the gap and key rules, then it lifts
  assert.equal(env({ status: { dirty: true, dirtyKeys: 6561, rows: 6563, nativeRows: 2 }, seed: true }).ctx.svcdFirstLoadOpen(), true, 'publish running');
  assert.equal(env({ status: { dirty: true, dirtyKeys: 2, rows: 6563, nativeRows: 6563 }, seed: true }).ctx.svcdFirstLoadOpen(), false, 'settled (d1b at 90 s)');
  assert.equal(env({ status: { dirty: false, dirtyKeys: 0 }, seed: true, marker: 'cleared' }).ctx.svcdFirstLoadOpen(), false, 'after a factory reset the marker is "cleared": never held');
  assert.equal(env({ status: { hasFS: false, ...at42 }, seed: true, marker: null }).ctx.svcdFirstLoadOpen(), false, 'desktop: unchanged');
  assert.equal(env({ status: at42, seed: true, marker: null, hasGet: false }).ctx.svcdFirstLoadOpen(), false, 'no get(): unknown, not held');
  // a normal later start of a seeded build: only authority-pending (about 9 s on the emulator), then off at once
  assert.equal(env({ status: { ready: false, persistenceMode: 'authority-pending' }, seed: true }).ctx.svcdFirstLoadOpen(), true);
  assert.equal(env({ status: { dirty: true, dirtyKeys: 3 }, seed: true }).ctx.svcdFirstLoadOpen(), false, 'restart at 23 s (d2b): marker set, 3 keys waiting');
});

test('J8 P1: the notice is on from the page\'s first tick, refuses every staff job write and the workboard move, then lifts by itself and reads the cases again', () => {
  const e = env({ status: { dirty: true, dirtyKeys: 78, rows: 79, nativeRows: 2 }, seed: true, marker: null, runTick: true });
  assert.ok(on(e, 'svcd-prep'), 'shown by the tick that runs when the page starts');
  assert.match(el(e, 'svcd-prep').textContent, /Preparing storage for first use, please wait/);
  for (const f of ['doSave', 'closeCase', 'svcFinishDelete', 'markEstimateApproved', 'addFollowUp', 'taxInvoiceById', 'logWhatsAppFollowUp']) e.ctx[f]();
  assert.deepEqual(e.log.raw, {}, 'none of the page writers ran');
  assert.equal(e.log.saves, 0, 'nothing was written');
  assert.equal(e.ctx.svcD3CommitCases('ok'), false, 'the workboard move is refused');
  assert.equal(e.log.commits, 0);
  assert.ok(e.log.toasts.length >= 8 && e.log.toasts.every(t => t === 'Preparing storage for first use, please wait. Nothing was changed.'));
  // the seed finished (marker set) and the publish ended
  e.kv.saagar_demo_seeded = 'v4_730d_50w';
  Object.assign(e.st, { dirty: false, dirtyKeys: 0, rows: 6566, nativeRows: 6566 });
  assert.equal(e.ctx.svcdGuardTick(), false);
  assert.equal(on(e, 'svcd-prep'), false, 'lifted by itself');
  assert.equal(e.log.reloads, 1, 'the case list is read again (the seed wrote it after the page opened)');
  e.ctx.doSave();
  assert.equal(e.log.raw.doSave, 1, 'job saves work again');
  assert.equal(e.ctx.svcD3CommitCases('ok'), true);
});

test('J9 P1: the seed rule never hangs: the 10-minute ceiling lifts it; the ceiling figure is unchanged', () => {
  const e = env({ status: { dirty: true, dirtyKeys: 18, rows: 19, nativeRows: 2 }, seed: true, marker: null });
  assert.equal(e.ctx.svcdGuardTick(), true);
  e.ctx.SVCD.prepSince = Date.now() - e.ctx.SVCD_PREP_MAX_MS - 5;
  assert.equal(e.ctx.svcdGuardTick(), false);
  assert.equal(e.ctx.svcdPreparing(), false);
  e.ctx.doSave();
  assert.equal(e.log.raw.doSave, 1, 'after the ceiling a job save goes through (and is still held for its own flush)');
  assert.match(BLOCK, /var SVCD_PREP_MAX_MS = 600000;/);
});

test('J10 the hooked names are real page functions, and the Phase 1 lines stay as they were (the hooks rebind them from the durability block)', () => {
  for (const n of ['doSave', 'closeCase', 'svcFinishDelete', 'markEstimateApproved', 'addFollowUp', 'taxInvoiceById', 'logWhatsAppFollowUp', 'doPrint', 'doProforma',
    'doTaxInvoice', 'printById', 'printProformaById', 'toast', 'showView', 'offerReadyNotify', 'saveDB', 'svcD3CommitCases']) {
    assert.match(page, new RegExp('\\nfunction ' + n + '\\('), n + ' is a top-level function of the page');
  }
  assert.ok(page.includes("  saveDB();\n  persistWatchPhoto(editId || id);   // store/replace/remove the watch photo for this case\n  toast('✓ Saved — ' + (editId || id));"), 'the Phase 1 save and toast lines are unchanged');
  assert.match(BLOCK, /svcdHookJobForm\(\);/);
  assert.match(BLOCK, /'saagar_demo_seeded'/);
  assert.match(BLOCK, /__DEMO_SEED_ACTIVE !== true/);
});
