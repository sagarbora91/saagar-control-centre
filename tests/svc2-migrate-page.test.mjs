// Service wave 2, old-data bring-in wired EXACTLY as the Service page wires it (audit A-MIG, 2026-11-19): the page's own billing glue
// (svbCases: list, legacyInput, legacyFloor; svbSha; svbPinGate) run in a vm over the REAL Stores, billing, migration and report files.
// The facade gets hashHex and validateLegacyBody the way the page and the facade hand them over. 120 invented closed, invoiced jobs of
// mixed kinds. Invented data only: the customer words below must never reach a stored record.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const PAGE = read('www/modules/service/index.html');
const START = PAGE.indexOf('// ─── BILLING GLUE');
const END = PAGE.indexOf('renderDash();\napplyReadOnlyUI();\nsvsMount();');
const GLUE = PAGE.slice(START, END);
const LIBS = ['service-stores-store', 'service-stores-fifo', 'service-stores-masters', 'service-stores-docs', 'service-stores-core', 'service-billing-calc',
  'service-billing-docs', 'service-billing-money', 'service-billing-migrate', 'service-billing-core'].map((n) => read('www/' + n + '.js'));
const REPORT = read('www/saagar-report.js');

const OWNER = { ok: true, tier: 'owner', role: 'Owner', actorName: 'Test Owner', isOwner: true, isManager: false };
const MANAGER = { ok: true, tier: 'manager', role: 'Store Manager', actorName: 'Test Manager', isOwner: false, isManager: true };
const BROKEN = { ok: false, tier: 'none', role: '', actorName: '', isOwner: false, isManager: false };
const FAKE_NAME = 'Zq Invented Person';
const FAKE_PHONE = '5550199887';
const FAKE_ADDR = 'Plot 9, Nowhere Lane, Faketown';
const GM_EXPENSES = JSON.stringify([{ id: 'gm-1', amount: 500, note: 'test row', at: '2026-04-02' }]);
const pad = (n, w) => String(n).padStart(w, '0');
const plain = (v) => JSON.parse(JSON.stringify(v)); // values from the vm realm

// one world = the page globals the glue needs, over a localStorage Map that can be kept between worlds (a reload)
function world(data, opts = {}) {
  const store = data || new Map();
  const fail = { on: null };
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (fail.on && fail.on(k)) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; }
  };
  const cur = { s: OWNER };
  const rctx = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    console, Blob, URL, setTimeout, clearTimeout };
  rctx.window = rctx;
  vm.createContext(rctx);
  vm.runInContext(REPORT, rctx);
  const g = {
    console: { warn() {}, log() {}, error() {} }, localStorage: ls, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    DB: opts.db || [], editId: null, viewDate: '2026-11-19',
    parseRupee: (v) => { const x = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(x) ? 0 : x; },
    svcD3Reauth: async () => true, isPastView: () => false, todayStr: () => '2026-11-19', toast() {}, showView() {}, openEdit() {}, scrollToSec() {},
    saveDB() {}, nowLocalDT: () => '2026-11-19T10:00',
    svcReloadSettings: () => JSON.parse(store.get('saagar_wsf_settings_v1') || '{}'), SVC_SETTINGS: {},
    SaagarModuleRuntime: { session: () => cur.s },
    SaagarModuleBridge: { report: { makeInvoiceSnapshot: (j, no, b) => rctx.SaagarReport.makeInvoiceSnapshot(j, no, b), preview() {} } },
    Date, Math, JSON, Promise, setTimeout, clearTimeout, setImmediate
  };
  g.byId = (id) => g.DB.find((c) => c.id === id);
  g.window = g;
  g.globalThis = g;
  vm.createContext(g);
  for (const src of LIBS) vm.runInContext(src, g);
  vm.runInContext(GLUE, g);
  const b = g.svbBilling();
  assert.ok(b, 'the facade starts over the real stack');
  const pinGate = vm.runInContext('svbPinGate', g);
  const share = vm.runInContext('svbShareRef', g);
  return { g, b, cur, store, fail, rctx, pinGate, share };
}

// ---- 120 invented closed, invoiced jobs of mixed kinds, plus jobs that must never give a record ----
function mkCase(id, no, over = {}) {
  return Object.assign({
    id, status: 'closed', invoiceNo: no, custName: FAKE_NAME, custMobile: FAKE_PHONE, custAddr: FAKE_ADDR, brand: 'Testbrand', model: 'T-' + id,
    lineItems: [{ desc: 'Battery change', qty: 1, unit: 1000, total: 1000 }], subTotal: '1000', gst: '18',
    delivery: { finalAmt: '1180', payMode: 'Cash', collectDate: '2026-05-02' }, closedAt: '2026-05-02T10:00:00.000Z', corrections: []
  }, over);
}
const LONG_ID = 'WS-2026-' + 'L'.repeat(50); // 58 characters: too long for a plain LEGACY:<id> reference (57), fits the 60 limit
function jobsFor(w) {
  const snap = (c) => Object.assign(c, { invoiceSnapshot: w.rctx.SaagarReport.makeInvoiceSnapshot(Object.assign({}, c), c.invoiceNo) });
  const list = [];
  for (let i = 1; i <= 40; i += 1) list.push(snap(mkCase('WS-2026-' + pad(i, 3), 'SV/2026-27/' + pad(i, 4))));            // 40 with a v1 snapshot (FY 2026-27)
  for (let i = 1; i <= 40; i += 1) list.push(mkCase('WS-2025-' + pad(i, 3), 'SV/2025-26/' + pad(i, 4),                      // 40 without one (FY 2025-26)
    { delivery: { finalAmt: '1180', payMode: 'UPI', collectDate: '2025-12-02' } }));
  for (let i = 41; i <= 60; i += 1) list.push(mkCase('WS-2026-' + pad(i, 3), 'SV/2026-27/' + pad(i, 4)));                   // 20 more, FY 2026-27, no snapshot
  for (let i = 1; i <= 8; i += 1) list.push(mkCase('WS-OLD-' + pad(i, 3), 'WS-INV-' + pad(100 + i, 4)));                   // 8 old WS- numbers
  for (let i = 1; i <= 4; i += 1) list.push(Object.assign(mkCase('WS-DMG-' + pad(i, 3), 'SV/2026-27/' + pad(60 + i, 4)),     // 4 damaged snapshots: rebuilt live
    { invoiceSnapshot: { v: 1, figs: { total: 'oops' } } }));
  for (let i = 1; i <= 2; i += 1) list.push(Object.assign(snap(mkCase('WS-BAD-' + pad(i, 3), 'SV/2026-27/' + pad(64 + i, 4))), {})); // 2 frozen snapshots with broken figures
  for (const c of list.filter((x) => x.id.startsWith('WS-BAD-'))) c.invoiceSnapshot = Object.assign({}, c.invoiceSnapshot, { figs: Object.assign({}, c.invoiceSnapshot.figs, { total: 'abc' }) });
  list.push(snap(mkCase(LONG_ID, 'SV/2026-27/0067')));                                                                      // 1 long job id: hashed reference
  list.push(snap(mkCase('WS-DUP-001', 'SV/2026-27/0068')), snap(mkCase('WS-DUP-002', 'SV/2026-27/0068')));                 // 2 jobs share one number
  for (let i = 1; i <= 3; i += 1) list.push(snap(mkCase('WS-MIX-' + pad(i, 3), 'SV/2025-26/' + pad(40 + i, 4))));           // 3 more, FY 2025-26, snapshot
  // closed and invoiced: 40 + 40 + 20 + 8 + 4 + 2 + 1 + 2 + 3 = 120. Expected brought in: 120 - 2 broken figures - 2 shared number = 116.
  list.push(mkCase('WS-CANC-001', 'SV/2025-26/0090', { status: 'cancelled' }));                                              // looks cancelled: not closed
  list.push(mkCase('WS-NONUM-001', '', {}));                                                                                 // closed, no number
  list.push(mkCase('WS-OPEN-001', '', { status: 'open', advancePaid: '1,200' }), mkCase('WS-OPEN-002', '', { status: 'open', advancePaid: '500' })); // typed advances
  return list;
}
const EXPECTED = 116;
const svcsKeys = (w) => [...w.store.keys()].filter((k) => /^saagar_svcs_/.test(k)).sort();
const svcsText = (w) => svcsKeys(w).map((k) => k + '=' + w.store.get(k)).join('\n');
const legacyRecs = (w) => { const r = w.share.store.read('invoices'); assert.equal(r.ok, true); return r.records.filter((x) => x.k === 'INV_LEGACY'); };
const ctx = (extra = {}) => Object.assign({ clientRef: 'mig-' + Math.random().toString(36).slice(2) }, extra);
async function pinned(w) { assert.equal(await w.pinGate.reauth('bring in old invoices'), true); return ctx({ stepUp: { ok: true, at: w.pinGate.at() } }); }

function seeded(opts = {}) {
  const w0 = world();
  const db = jobsFor(w0);
  const data = new Map(w0.store);
  data.set('saagar_wsf_settings_v1', JSON.stringify({ idHigh: 200, invoiceSeq: { '2026-27': opts.counter === undefined ? 68 : opts.counter, '2025-26': 43 }, deleted: [] }));
  data.set('gm_expenses', GM_EXPENSES);
  const w = world(data, { db });
  return w;
}

test('MP1 dry run through the facade writes nothing; the plan lists exactly the eligible jobs; skips carry their codes', () => {
  const w = seeded();
  const before = [...w.store.entries()].sort().join('\n');
  const dbText = JSON.stringify(w.g.DB);
  const plan = w.b.planMigration(ctx());
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
  assert.equal(plan.invoices.length, EXPECTED);
  const codes = plain(plan.skipped).map((x) => x.jobId + ':' + x.code).sort();
  assert.deepEqual(codes, ['WS-BAD-001:FIGURES_INVALID', 'WS-BAD-002:FIGURES_INVALID', 'WS-DUP-001:DUPLICATE_LEGACY_NUMBER', 'WS-DUP-002:DUPLICATE_LEGACY_NUMBER']);
  // Stage E round 2 (B): each skip comes with the bring-in's plain reason, in the same order as skipped
  const why = plain(plan.skippedWhy);
  assert.equal(why.length, plan.skipped.length);
  for (let i = 0; i < why.length; i++) assert.equal(why[i].jobId, plan.skipped[i].jobId);
  assert.equal(why.find((x) => x.jobId === 'WS-DUP-001').why, 'Another old job carries the same invoice number.');
  assert.equal(why.find((x) => x.jobId === 'WS-BAD-001').why, 'The old invoice figures are damaged or not whole amounts, so this old invoice was left out.');
  assert.equal(plan.closedWithoutNumber, 1);
  assert.equal(plan.invoices.some((x) => /CANC|OPEN/.test(x.jobId)), false);
  const long = plan.invoices.find((x) => x.jobId === LONG_ID);
  assert.match(long.ref, /^LEGACY:h[0-9a-f]{20}$/);
  assert.equal(plan.invoices.filter((x) => x.basis === 'SNAPSHOT_V1').length, 40 + 1 + 3);
  assert.equal(w.b.pendingMigration(ctx()).invoices, EXPECTED);
  assert.equal([...w.store.entries()].sort().join('\n'), before, 'not one byte written by a dry run');
  assert.equal(JSON.stringify(w.g.DB), dbText);
});

test('MP2 roles and PIN: Manager refused, no PIN refused, past view refused, broken session refused; the Owner with a fresh PIN brings each eligible job in exactly once', async () => {
  const w = seeded();
  const plan = w.b.planMigration(ctx());
  const before = svcsText(w);
  w.cur.s = MANAGER;
  assert.equal(w.b.runMigration(plan, ctx({ stepUp: { ok: true, at: Date.now() } })).code, 'NOT_ALLOWED');
  w.cur.s = BROKEN;
  assert.equal(w.b.runMigration(plan, ctx({ stepUp: { ok: true, at: Date.now() } })).code, 'SESSION_REQUIRED');
  w.cur.s = OWNER;
  assert.equal(w.b.runMigration(plan, ctx()).code, 'PIN_REQUIRED', 'no PIN typed: the provider has no stamp');
  assert.equal(w.b.runMigration(plan, ctx({ stepUp: { ok: true, at: Date.now() } })).code, 'PIN_REQUIRED', 'a caller stamp alone is not a PIN');
  const p = await pinned(w);
  assert.equal(w.b.runMigration(plan, Object.assign({}, p, { viewDate: '2026-11-01' })).code, 'PAST_VIEW');
  assert.equal(svcsText(w), before, 'refused runs write nothing');
  const out = w.b.runMigration(plan, p);
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  assert.deepEqual(plain(out.written), { invoices: EXPECTED, advances: 0 });
  const recs = legacyRecs(w);
  assert.equal(recs.length, EXPECTED);
  assert.equal(new Set(recs.map((r) => r.b.jobId)).size, EXPECTED, 'each job once');
  assert.equal(new Set(recs.map((r) => r.b.legacyNo)).size, EXPECTED, 'each old number once');
  assert.equal(new Set(recs.map((r) => r.r)).size, EXPECTED, 'each reference once');
  for (const r of recs) {
    const c = w.g.byId(r.b.jobId);
    assert.equal(r.b.legacyNo, c.invoiceNo, 'old number kept as legacyNo');
    assert.equal(r.r, r.b.jobId === LONG_ID ? r.r : 'LEGACY:' + r.b.jobId);
  }
  // figures by hand: 1,000.00 + 18 % = 1,180.00 = 118,000 paise; 9,000 paise each half
  const one = recs.find((r) => r.b.jobId === 'WS-2026-001');
  assert.deepEqual([one.b.totalPaise, one.b.taxablePaise, one.b.cgstPaise, one.b.sgstPaise, one.b.gstBp, one.b.basis], [118000, 100000, 9000, 9000, 1800, 'SNAPSHOT_V1']);
  const live = recs.find((r) => r.b.jobId === 'WS-2025-001');
  assert.deepEqual([live.b.totalPaise, live.b.basis, live.b.snapshotSha], [118000, 'LIVE_CASE', null]);
  // a second run writes nothing
  const text = svcsText(w);
  const again = w.b.planMigration(ctx());
  assert.equal(again.invoices.length, 0);
  assert.equal(again.alreadyThere, EXPECTED);
  assert.equal(svcsText(w), text);
});

test('MP3 a write failure inside batch 1 (record 37) and inside batch 2 (record 110): finished batches stay, nothing of the failed batch; a resume ends with exactly the right count, each once', async () => {
  // one batch is one append: its shard, then the head, then the watermark (measured). Write 1 is batch 1, write 4 is batch 2.
  for (const [failAt, keep] of [[1, 0], [4, 100]]) {
    const w = seeded();
    let n = 0;
    w.fail.on = (k) => { if (!/^(saagar_svcs_|st_v2_svcs_)/.test(k)) return false; n += 1; return n === failAt; };
    const plan = w.b.planMigration(ctx());
    const stop = w.b.runMigration(plan, await pinned(w));
    assert.equal(stop.ok, false, JSON.stringify(stop).slice(0, 200));
    assert.equal(stop.written.invoices, keep, JSON.stringify(stop));
    assert.equal(stop.remaining, EXPECTED - keep);
    assert.equal(legacyRecs(w).length, keep);
    w.fail.on = null;
    const done = w.b.runMigration(w.b.planMigration(ctx()), await pinned(w));
    assert.equal(done.ok, true, JSON.stringify(done).slice(0, 200));
    assert.equal(done.written.invoices, EXPECTED - keep);
    const recs = legacyRecs(w);
    assert.equal(recs.length, EXPECTED);
    assert.equal(new Set(recs.map((r) => r.b.jobId)).size, EXPECTED);
    assert.equal(new Set(recs.map((r) => r.r)).size, EXPECTED);
    assert.equal(w.share.store.verifyAll().ok, true);
  }
});

test('MP4 the list goes stale when a job changes between the list and the run (amount changed, or a job closed); nothing is written', async () => {
  const w = seeded();
  const plan = w.b.planMigration(ctx());
  const before = svcsText(w);
  w.g.byId('WS-2025-007').delivery.finalAmt = '1190';
  w.g.byId('WS-2025-007').subTotal = '1010';
  assert.equal(w.b.runMigration(plan, await pinned(w)).code, 'PLAN_STALE');
  const plan2 = w.b.planMigration(ctx());
  w.g.DB.push(mkCase('WS-LATE-001', 'SV/2026-27/0091'));
  assert.equal(w.b.runMigration(plan2, await pinned(w)).code, 'PLAN_STALE');
  assert.equal(svcsText(w), before);
});

test('MP5 the job list, the settings and the cash book are byte-identical; no customer word in any record; nothing for typed advances; the store checks pass', async () => {
  const w = seeded();
  const db = JSON.stringify(w.g.DB);
  const settings = w.store.get('saagar_wsf_settings_v1');
  const out = w.b.runMigration(w.b.planMigration(ctx()), await pinned(w));
  assert.equal(out.ok, true);
  assert.equal(JSON.stringify(w.g.DB), db, 'the case array is untouched');
  assert.equal(w.store.get('saagar_wsf_settings_v1'), settings);
  assert.equal(w.store.get('gm_expenses'), GM_EXPENSES, 'the cash book is untouched');
  const text = svcsText(w);
  for (const word of [FAKE_NAME, FAKE_PHONE, FAKE_ADDR, 'Invented', '5550199887']) assert.equal(text.includes(word), false, word);
  for (const r of legacyRecs(w)) for (const k of Object.keys(r.b)) assert.equal(/^(cust|customer|client|buyer|mobile|phone|address|addr|email)/i.test(k), false, k);
  const rc = w.share.store.read('receipts');
  assert.equal(rc.ok, true);
  assert.equal(rc.records.length, 0, 'no receipt, no advance');
  assert.equal(w.share.store.verifyAll().ok, true, 'chain and number-gap checks');
  assert.equal(w.share.store.lastNumber('SV', new Date().toISOString()).last, 0, 'old numbers never enter the strict series');
});

async function nextBill(counter) {
  const w = seeded({ counter });
  assert.equal(w.b.runMigration(w.b.planMigration(ctx()), await pinned(w)).ok, true);
  const M = w.g.SaagarServiceMasters;
  const mctx = { session: MANAGER, now: () => new Date(), clientRef: 'm-L1' };
  assert.equal(M.createRow(w.share.store, mctx, 'labour', { code: 'L1', name: 'Labour L1', group: 'Service', unit: 'job', sac: '9987', gstRateBp: 1800, priceIncludesTax: false, ratePaise: 10000 }).ok, true);
  w.g.DB.push({ id: 'WS-NEW-001', status: 'open', brand: 'Titan', model: 'M1' });
  w.cur.s = MANAGER;
  assert.equal(w.b.saveEstimate({ jobId: 'WS-NEW-001', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }] }, ctx()).ok, true);
  assert.equal(w.b.recordApproval({ jobId: 'WS-NEW-001', version: 1, method: 'CALL', takenByName: 'Test Taker' }, ctx()).ok, true);
  const iss = w.b.issueBill({ jobId: 'WS-NEW-001', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, ctx());
  assert.equal(iss.ok, true, JSON.stringify(iss).slice(0, 300));
  return { w, no: iss.invoice.no };
}

test('MP6 the next new bill after the bring-in continues the old counter: highest old number of the year 68 gives 0069; an old counter one ahead (69) gives 0070; a number on any job (even one not brought in) is never reissued', async () => {
  const a = await nextBill(68);
  assert.equal(a.no, 'SV/2026-27/0069');
  assert.equal(a.w.share.store.verifyAll().ok, true);
  const b = await nextBill(69);
  assert.equal(b.no, 'SV/2026-27/0070');
  assert.equal(b.w.share.store.verifyAll().ok, true);
  // the job that looks cancelled holds SV/2025-26/0090: the other year's counter is unaffected here, and this year's 0068 sits on two jobs that were
  // not brought in, yet 0069 is next (case numbers count, brought in or not)
});

test('MP7 a backup from before the bring-in restored afterwards (older job list and settings; the shell never deletes newer keys): the store opens, nothing is pending or brought in twice, and the next bill number does not go back', async () => {
  const w = seeded();
  const M = w.g.SaagarServiceMasters;
  const mctx = { session: MANAGER, now: () => new Date(), clientRef: 'm-L1' };
  assert.equal(M.createRow(w.share.store, mctx, 'labour', { code: 'L1', name: 'Labour L1', group: 'Service', unit: 'job', sac: '9987', gstRateBp: 1800, priceIncludesTax: false, ratePaise: 10000 }).ok, true);
  // the backup: the shell backup rule takes saagar_svcs_* keys (Phase 1 records exist), the job list and the settings
  const backup = new Map([...w.store.entries()].filter(([k]) => /^saagar_svcs_/.test(k)));
  assert.ok(backup.size >= 2, 'the backup holds Phase 1 Service records');
  const oldDb = JSON.stringify(w.g.DB.slice(0, 90));
  assert.equal(w.b.runMigration(w.b.planMigration(ctx()), await pinned(w)).ok, true);
  const restored = new Map(w.store);
  for (const [k, v] of backup) restored.set(k, v);
  restored.set('saagar_wsf_settings_v1', JSON.stringify({ idHigh: 150, invoiceSeq: { '2026-27': 40 }, deleted: [] }));
  const w2 = world(restored, { db: JSON.parse(oldDb) });
  const st = plain(w2.b.status());
  assert.deepEqual([st.ok, st.blocked, st.billingBlocked], [true, false, false], JSON.stringify(st).slice(0, 200));
  const plan = plain(w2.b.planMigration(ctx()));
  assert.equal(plan.ok, true);
  assert.equal(plan.invoices.length, 0, 'nothing pending');
  assert.equal(plan.alreadyThere, 90, 'every restored old job is recognised as already brought in');
  assert.equal(legacyRecs(w2).length, EXPECTED, 'no record lost, none added');
  // the next number: the restored list holds SV/2026-27 up to 0050, the restored counter says 40, the old records hold up to 0067
  w2.g.DB.push({ id: 'WS-NEW-002', status: 'open', brand: 'Titan', model: 'M2' });
  w2.cur.s = MANAGER;
  assert.equal(w2.b.saveEstimate({ jobId: 'WS-NEW-002', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }] }, ctx()).ok, true);
  assert.equal(w2.b.recordApproval({ jobId: 'WS-NEW-002', version: 1, method: 'CALL', takenByName: 'Test Taker' }, ctx()).ok, true);
  const iss = w2.b.issueBill({ jobId: 'WS-NEW-002', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, ctx());
  assert.equal(iss.ok, true, JSON.stringify(iss).slice(0, 200));
  assert.equal(iss.invoice.no, 'SV/2026-27/0068', 'above every number still on the device; the old records keep 0067 from coming back');
});
