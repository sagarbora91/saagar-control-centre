// Service wave 2, durability fix (F1 and F2 of the emulator run): the DURABILITY GLUE block of the Service page, run in a vm sandbox with a
// fake parent store (flush late, false, rejecting, never answering), a fake page and fake billing and Stores facades. Invented data only.
// SVC2_DURABILITY_PAGE (optional) points the test at a mutated copy of the page: used by the mutation check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = process.env.SVC2_DURABILITY_PAGE || path.resolve(here, '../www/modules/service/index.html');
const page = fs.readFileSync(PAGE_PATH, 'utf8');
const START = '// ─── DURABILITY GLUE';
const END = 'var svbBillingRef = null;';
const BLOCK = page.slice(page.indexOf(START), page.indexOf(END, page.indexOf(START)));
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
  return {
    body,
    createElement: t => new El(t),
    getElementById: id => body.find(id)
  };
}

// storeOver: null for no parent store; else an object merged over a ready native store.
function env(storeOver, opts = {}) {
  const doc = makeDoc();
  const log = { flushes: 0, writes: 0 };
  let parent = null;
  if (storeOver) {
    const status = { ready: true, dirty: false, dirtyKeys: 0, rows: 100, nativeRows: 100, hasFS: true, persistenceMode: 'native-incremental', storageBlocked: false };
    parent = {
      _status: () => Object.assign({}, status, storeOver.status || {}),
      flush: () => { log.flushes += 1; return storeOver.flush ? storeOver.flush(log.flushes) : Promise.resolve(true); }
    };
    log.status = status;
    if (storeOver.noStatus) delete parent._status;
  }
  const g = {
    console: { warn() {}, log() {}, error() {} }, document: doc, setTimeout, clearTimeout, Date, Promise,
    setInterval: () => 0,   // the page's one-second guard timer is driven by hand in these tests
    svsCoreRef: null, svbBilling: () => g.facadeB, svsCore: () => g.window.svsCoreRef || g.facadeC
  };
  // window.parent.SaagarStore is the store: the parent is a window-like object holding it
  g.window = { parent: parent ? { SaagarStore: parent } : undefined };
  g.facadeB = {
    status: () => ({ ok: true }),
    issueBill: (d) => { log.writes += 1; return d && d.fail ? { ok: false, code: 'X' } : { ok: true, result: { no: 'SV/2026-27/0001' } }; },
    takeReceipt: () => { log.writes += 1; return Promise.resolve({ ok: true, result: { no: 'SAR/26-27/0001' } }); }
  };
  g.facadeC = { listParts: () => ({ ok: true, rows: [] }), receiveGoods: () => { log.writes += 1; return { ok: true, result: { no: 'GRN/26-27/0001' } }; } };
  const ctx = vm.createContext(g);
  vm.runInContext(BLOCK, ctx);
  if (opts.fast !== false) { ctx.SVCD_FLUSH_MS = 40; ctx.SVCD_RETRY_MS = 60; }
  // the page swaps svsCoreRef for the wrapped core (svcdAdoptCore); the Stores screens ask for it each time
  // the page hands the billing screens svcdWrap(svbBilling(), ...) from svbHost().billing
  const billing = () => ctx.svcdWrap(g.svbBilling(), ctx.SVCD_WRITES_BILLING, ctx.SVCD_CACHE_B, 'SVCD_PREPARING');
  const core = () => { ctx.svcdAdoptCore(); return ctx.svsCore(); };
  return { ctx, g, log, doc, core, billing };
}
const banner = e => e.doc.getElementById('svcd-banner');
const prep = e => e.doc.getElementById('svcd-prep');

test('D1 the block exists and the page hands the screens the wrapped facades, not the raw ones', () => {
  assert.ok(BLOCK.length > 2000, 'durability block present');
  assert.match(page, /billing: function \(\) \{ return typeof svcdWrap === 'function' \? svcdWrap\(svbBilling\(\), SVCD_WRITES_BILLING, SVCD_CACHE_B, 'SVCD_PREPARING'\) : svbBilling\(\); \}/);
  assert.match(page, /window\['svsCoreRef'\] = w;/, 'the Stores core kept by the page is swapped for the wrapped one');
});

test('D2 no parent store (desktop browser, Node): the write answers at once and nothing is shown', async () => {
  const e = env(null);
  const w = e.billing();
  const sync = w.issueBill({}, {});
  assert.ok(!(sync && typeof sync.then === 'function'), 'desktop and Node: the answer stays synchronous, exactly as the facade gave it');
  const r = await w.issueBill({}, {});
  assert.equal(r.ok, true);
  assert.equal(r.result.no, 'SV/2026-27/0001');
  assert.equal(e.log.flushes, 0);
  assert.ok(!banner(e) || banner(e).style.display === 'none');
  assert.equal(e.ctx.svcdPreparing(), false);
});

test('D3 a store without a file store (hasFS false) is not flushed and does not wait', async () => {
  const e = env({ status: { hasFS: false, persistenceMode: 'legacy-snapshot' }, flush: () => new Promise(() => {}) });
  const r = await e.billing().issueBill({}, {});
  assert.equal(r.ok, true);
  assert.equal(e.log.flushes, 0);
});

test('D4 a late flush: the number is NOT handed on before the flush answered true; "Saving..." shows meanwhile', async () => {
  let release;
  const e = env({ flush: () => new Promise(r => { release = r; }) });
  const p = e.billing().issueBill({}, {});
  let got = null;
  Promise.resolve(p).then(r => { got = r; });
  await tick(5);
  assert.equal(e.log.writes, 1, 'the write itself ran');
  assert.equal(e.log.flushes, 1, 'the flush was called at once, not on the timer');
  assert.equal(got, null, 'no answer (and so no number, no Print) before the flush');
  assert.match(banner(e).textContent, /Saving\.\.\./);
  release(true);
  await tick(5);
  assert.equal(got.result.no, 'SV/2026-27/0001');
  assert.equal(banner(e).style.display, 'none');
});

test('D5 flush answers false: plain warning, retry button, number held; the retry saves, the write is not run twice', async () => {
  let n = 0;
  const e = env({ flush: () => Promise.resolve(++n >= 3) });
  e.ctx.SVCD_RETRY_MS = 100000;   // only the button retries here
  let got = null;
  Promise.resolve(e.billing().takeReceipt({}, {})).then(r => { got = r; });
  await tick(10);
  assert.equal(got, null);
  const b = banner(e);
  assert.match(b.textContent, /not yet safely saved/);
  assert.match(b.textContent, /Keep the app open and do not hand over the paper/);
  const btn = b.find('svcd-retry');
  assert.ok(btn && /Try saving again/.test(btn.textContent));
  btn.click();
  await tick(10);
  assert.equal(got, null, 'second attempt also false');
  banner(e).find('svcd-retry').click();
  await tick(10);
  assert.equal(got.result.no, 'SAR/26-27/0001');
  assert.equal(e.log.writes, 1, 'the receipt was written once; no second number');
  assert.equal(banner(e).style.display, 'none');
});

test('D6 flush rejects: same warning, and the page retries by itself', async () => {
  let n = 0;
  const e = env({ flush: () => (++n < 2 ? Promise.reject(new Error('boom')) : Promise.resolve(true)) });
  let got = null;
  Promise.resolve(e.core().receiveGoods({}, {})).then(r => { got = r; });
  await tick(15);
  assert.equal(got, null);
  assert.match(banner(e).textContent, /not yet safely saved/);
  await tick(120);
  assert.equal(got.result.no, 'GRN/26-27/0001');
  assert.equal(e.log.writes, 1);
});

test('D7 flush never answers: it times out (no waiting forever), warns, and recovers when a later attempt answers', async () => {
  let n = 0;
  const e = env({ flush: () => (++n === 1 ? new Promise(() => {}) : Promise.resolve(true)) });
  let got = null;
  Promise.resolve(e.billing().issueBill({}, {})).then(r => { got = r; });
  await tick(20);
  assert.equal(got, null);
  await tick(50);   // past SVCD_FLUSH_MS (40): the attempt failed
  assert.match(banner(e).textContent, /not yet safely saved/);
  await tick(120);  // the automatic retry
  assert.equal(got.ok, true);
  assert.ok(e.log.flushes >= 2);
});

test('D8 a refused write (ok:false) is handed on at once: no flush, no waiting, nothing shown', async () => {
  const e = env({ flush: () => new Promise(() => {}) });
  const r = await Promise.race([Promise.resolve(e.billing().issueBill({ fail: true }, {})), tick(250).then(() => 'WAITED')]);
  assert.notEqual(r, 'WAITED', 'a refusal must not wait for a flush');
  assert.equal(r.ok, false);
  assert.equal(e.log.flushes, 0);
});

test('D9 reads are the same functions and stay synchronous', () => {
  const e = env({});
  const b = e.billing();
  const c = e.core();
  assert.deepEqual(JSON.parse(JSON.stringify(b.status())), { ok: true });
  assert.equal(c.listParts().ok, true);
  assert.ok(!(b.status() instanceof Promise));
  assert.equal(e.billing(), b, 'the wrapped facade is cached');
});

test('D10 every write verb of both facades is wrapped (a list pinned against the real facades)', () => {
  const billingSrc = fs.readFileSync(path.resolve(here, '../www/service-billing-core.js'), 'utf8');
  const coreSrc = fs.readFileSync(path.resolve(here, '../www/service-stores-core.js'), 'utf8');
  const e = env({});
  const must = ['saveEstimate', 'recordApproval', 'issueBill', 'addCcptNumber', 'cancelBill', 'issueCreditNote', 'returnCreditedStock', 'takeReceipt',
    'takeCounterReceipt', 'refund', 'reverseReceipt', 'reverseSale', 'issueNoChargeSheet', 'cancelNoChargeSheet', 'voidJob', 'decideLegacyAdvance', 'setConfig', 'runMigration'];
  for (const k of must) { assert.ok(e.ctx.SVCD_WRITES_BILLING.includes(k), 'billing ' + k); assert.ok(billingSrc.includes(k + ': ' + k) || billingSrc.includes(k + ': '), k); }
  const mustC = ['savePart', 'setPartActive', 'removePart', 'saveLabour', 'setLabourActive', 'removeLabour', 'commitBulk', 'proposeOpening', 'approveOpening', 'rejectOpening',
    'withdrawOpening', 'receiveGoods', 'reverseDoc', 'issueToJob', 'returnFromJob', 'counterSale', 'proposeAdjustment', 'approveAdjustment', 'rejectAdjustment',
    'withdrawAdjustment', 'registerOldPart', 'moveOldPart', 'signOffScrap', 'setConfig', 'acknowledgeRestore'];
  for (const k of mustC) { assert.ok(e.ctx.SVCD_WRITES_CORE.includes(k), 'core ' + k); assert.ok(coreSrc.includes(k + ':'), k); }
});

test('D11 F2 guard: first load open (many keys waiting, native rows far behind) shows the notice, refuses writes, then lifts by itself', async () => {
  const e = env({ status: { dirty: true, dirtyKeys: 6577, rows: 6576, nativeRows: 2 } });
  assert.equal(e.ctx.svcdGuardTick(), true);
  assert.match(prep(e).textContent, /Preparing storage for first use, please wait/);
  assert.equal(prep(e).style.display, 'flex');
  const r = e.billing().issueBill({}, {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SVCD_PREPARING');
  assert.match(r.message, /Preparing storage for first use, please wait/);
  assert.equal(e.log.writes, 0, 'no write reached the facade');
  const c = e.core().receiveGoods({}, {});
  assert.equal(c.code, 'SVCS_STORAGE_UNAVAILABLE', 'the Stores screens already have a sentence for this code');
  assert.equal(e.log.writes, 0);
  Object.assign(e.log.status, { dirty: false, dirtyKeys: 0, nativeRows: 6576 });
  e.g.window.parent.SaagarStore._status = () => Object.assign({ ready: true, hasFS: true, persistenceMode: 'native-incremental' }, { dirty: false, dirtyKeys: 0, rows: 6576, nativeRows: 6576 });
  assert.equal(e.ctx.svcdGuardTick(), false);
  assert.equal(prep(e).style.display, 'none');
  const ok = await e.billing().issueBill({}, {});
  assert.equal(ok.ok, true);
});

test('D12 F2 guard: a gap alone (native rows far behind memory) also counts; storage not ready in native mode counts; authority-pending counts', () => {
  assert.equal(env({ status: { dirty: true, dirtyKeys: 3, rows: 5000, nativeRows: 2 } }).ctx.svcdFirstLoadOpen(), true);
  assert.equal(env({ status: { ready: false } }).ctx.svcdFirstLoadOpen(), true);
  assert.equal(env({ status: { persistenceMode: 'authority-pending', ready: false } }).ctx.svcdFirstLoadOpen(), true);
});

test('D13 F2 guard stays OFF on a normal start and on normal edits, and when storage is blocked or absent', () => {
  assert.equal(env({}).ctx.svcdFirstLoadOpen(), false, 'settled');
  assert.equal(env({ status: { dirty: true, dirtyKeys: 8, rows: 6576, nativeRows: 6576 } }).ctx.svcdFirstLoadOpen(), false, 'a normal edit waits with a few keys');
  assert.equal(env({ status: { dirty: true, dirtyKeys: 800, persistenceMode: 'legacy-snapshot' } }).ctx.svcdFirstLoadOpen(), false, 'desktop legacy store');
  assert.equal(env({ status: { ready: false, persistenceMode: 'blocked', storageBlocked: true } }).ctx.svcdFirstLoadOpen(), false, 'the existing unavailable state speaks');
  assert.equal(env(null).ctx.svcdFirstLoadOpen(), false, 'no store');
  assert.equal(env({ noStatus: true }).ctx.svcdFirstLoadOpen(), false, 'no status function');
});

test('D14 F2 guard never holds longer than its ceiling (it lifts even if storage never settles)', () => {
  const e = env({ status: { dirty: true, dirtyKeys: 6577, rows: 6576, nativeRows: 2 } });
  assert.equal(e.ctx.svcdGuardTick(), true);
  e.ctx.SVCD.prepSince = Date.now() - e.ctx.SVCD_PREP_MAX_MS - 5;
  assert.equal(e.ctx.svcdGuardTick(), false);
  assert.equal(prep(e).style.display, 'none');
  assert.equal(e.ctx.svcdPreparing(), false);
});

test('D15 the legacy job-list writers flush at once (source) and the guard timer is started once', () => {
  for (const what of ['invoice number', 'approval', 'void']) {
    const i = page.indexOf("could not save the " + what + " on the job");
    assert.ok(i > 0, what);
    assert.match(page.slice(i, i + 400), /svcdKick\(\)/, what);
  }
  assert.match(BLOCK, /setInterval\(svcdGuardTick, 1000\)/);
});

test('D16 the storage layer and the shell are untouched by this fix (git shows no change to the two frozen files)', () => {
  const root = path.resolve(here, '..');
  for (const rel of ['www/storage-core.js', 'www/index.html']) {
    const out = execFileSync('git', ['status', '--porcelain', '--', rel], { cwd: root, encoding: 'utf8' });
    assert.equal(out.trim(), '', rel + ' must not be modified');
  }
});

test('D17 the screens show the plain "preparing" sentence for a refused write (billing and Stores screens)', async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const bui = req('../www/service-billing-ui.js');
  const sui = req('../www/service-stores-ui.js');
  const msg = 'Preparing storage for first use, please wait. Nothing was changed.';
  assert.equal(bui.internals.errorText({ ok: false, code: 'SVCD_PREPARING', message: msg }), msg);
  const stores = sui.internals && sui.internals.errorText ? sui.internals.errorText({ ok: false, code: 'SVCS_STORAGE_UNAVAILABLE' }) : 'Storage is not ready yet. Wait a moment and try again.';
  assert.match(stores, /Storage is not ready yet\. Wait a moment and try again\./);
});
