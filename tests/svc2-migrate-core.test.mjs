// Service wave 2, old-data bring-in (www/service-billing-migrate.js). P8 tests M1 to M18 as corrected by the plan:
// there is no ADV_LEGACY and no MIGRATION_RUN record, so M6 and M7 become "nothing is written for advances".
// The REAL store runs over an in-memory adapter. The billing documents layer is a FAKE that follows the plan's docs
// contract (importLegacy(items, ctx), one all-or-nothing append per call, items {ref, body}). Invented data only.
// Expected values are typed by hand from the plan and the spec, never copied from the code under test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { Store, makeClock, makeAdapter, openStore, put, ACTORS } from './lib/svc1-store-harness.mjs';
import { loadReport } from './lib/fix-s02-load.mjs';

const require = createRequire(import.meta.url);
const Migrate = require('../www/service-billing-migrate.js');
const R = loadReport().R;

const sess = (tier, extra = {}) => Object.freeze(Object.assign({ ok: true, tier, role: tier === 'owner' ? 'Owner' : 'Technician', actorName: 'Test Person', isOwner: tier === 'owner', isManager: tier === 'manager' }, extra));
const OWNER = sess('owner');
const MANAGER = sess('manager', { role: 'Store Manager' });
const STAFF = sess('staff');
const NONE = Object.freeze({ ok: false, tier: 'none', role: '', actorName: '', isOwner: false, isManager: false });

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const pad = (n, w) => String(n).padStart(w, '0');

// ---- invented old jobs (the fake customer words below must never reach a stored record) ----
const FAKE_NAME = 'Zz Invented Person';
const FAKE_PHONE = '5550100123';
const FAKE_ADDR = 'Plot 0, Nowhere Lane, Faketown';
export function mkCase(i, over = {}) {
  const id = over.id || 'WS-2026-' + pad(i, 3);
  const c = {
    id, status: 'closed', invoiceNo: 'SV/2026-27/' + pad(i, 4),
    custName: FAKE_NAME, custMobile: FAKE_PHONE, custAddr: FAKE_ADDR, brand: 'Testbrand', model: 'T-' + i,
    lineItems: [{ desc: 'Battery change', qty: 1, unit: 1000, total: 1000 }], subTotal: '1000', gst: '18',
    delivery: { finalAmt: '1180', payMode: 'Cash', collectDate: '2026-05-02' }, closedAt: '2026-05-02T10:00:00.000Z',
    corrections: []
  };
  Object.assign(c, over);
  return c;
}
// the page glue stand-in: legacyInput(jobId) built from the case, never carrying the customer block
function legacyFrom(c) {
  const snap = c.invoiceSnapshot;
  const valid = snap && snap.v === 1 && snap.figs && snap.firm && snap.customer && snap.delivery && Array.isArray(snap.lines);
  try {
    const s = valid ? snap : R.makeInvoiceSnapshot(Object.assign({}, c), c.invoiceNo, 'live');
    return {
      ok: true, basis: valid ? 'SNAPSHOT_V1' : 'LIVE_CASE', invoiceDate: s.invoiceDate, figs: s.figs,
      payMode: s.delivery.payMode, lineCount: s.lines.length, correctionCount: (c.corrections || []).length,
      snapshotSha: valid ? Store.sha256Hex(JSON.stringify(snap)) : null
    };
  } catch (e) {
    return { ok: false, code: 'SNAPSHOT_UNBUILDABLE' };
  }
}
export const withSnapshot = (c) => Object.assign(c, { invoiceSnapshot: R.makeInvoiceSnapshot(Object.assign({}, c), c.invoiceNo) });

// strict body shape check (stands in for docs.validateLegacyBody): exact keys, whole numbers
const strictBody = (b) => {
  const keys = Object.keys(b);
  if (keys.slice().sort().join(',') !== Migrate.BODY_KEYS.slice().sort().join(',')) return { ok: false, code: 'KEYS' };
  for (const k of keys) if (/Paise$/.test(k) && !Number.isInteger(b[k])) return { ok: false, code: 'PAISE' };
  if (b.igstPaise !== 0 || !Array.isArray(b.warn)) return { ok: false, code: 'SHAPE' };
  return { ok: true };
};

// fake billing documents layer: ONE all-or-nothing append per call, skips refs already stored
function fakeDocs(store) {
  const d = { calls: 0, sizes: [], seenRecords: 0, failAtRecord: 0, failCall: 0, afterCall: null, lastCtx: null };
  d.importLegacy = (items, ctx) => {
    d.calls += 1; d.lastCtx = ctx; d.sizes.push(items.length);
    const first = d.seenRecords + 1; d.seenRecords += items.length;
    if (d.failAtRecord && d.failAtRecord >= first && d.failAtRecord <= d.seenRecords) return { ok: false, code: 'SVCS_STORAGE_UNAVAILABLE' };
    if (d.failCall && d.failCall === d.calls) return { ok: false, code: 'SVCS_STORAGE_UNAVAILABLE' };
    const fresh = items.filter((it) => !store.findRef('invoices', it.ref));
    let out = { ok: true, written: 0, skipped: items.length };
    if (fresh.length) {
      const res = put(store, 'invoices', fresh.map((it) => ({ k: 'INV_LEGACY', r: it.ref, b: it.body })), { actor: ACTORS.owner });
      if (!res.ok) return { ok: false, code: res.code };
      out = { ok: true, written: fresh.length, skipped: items.length - fresh.length };
    }
    if (d.afterCall) { const f = d.afterCall; d.afterCall = null; f(d.calls); }
    return out;
  };
  return d;
}

function build(caseList = [], opts = {}) {
  const clock = makeClock('2026-11-18T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const list = opts.freeze === false ? caseList : deepFreeze(caseList);
  const byId = new Map(list.map((c) => [c.id, c]));
  const settingsText = JSON.stringify({ idHigh: 99, invoiceSeq: { '2026-27': 7 }, deleted: [] });
  const docs = fakeDocs(store);
  const calls = { list: 0, input: 0 };
  const casesApi = {
    list() { calls.list += 1; return list; },
    legacyInput(id) { calls.input += 1; const c = byId.get(id) || list.find((x) => x.id === id); return opts.input ? opts.input(c) : legacyFrom(c); }
  };
  const made = Migrate.create({ store, docs, cases: casesApi, now: clock.now, hashHex: Store.sha256Hex, validateBody: strictBody, batchSize: opts.batchSize });
  assert.equal(made.ok, true, JSON.stringify(made));
  const h = { clock, adapter, store, docs, calls, list, settingsText, mig: made.api };
  h.text = () => JSON.stringify(Array.from(adapter.data.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  h.pin = (session = OWNER, extra = {}) => Object.assign({ session, stepUp: { ok: true, at: Date.parse(clock.iso) } }, extra);
  h.recs = () => { const r = store.read('invoices'); assert.equal(r.ok, true); return r.records.filter((x) => x.k === 'INV_LEGACY'); };
  return h;
}
const refused = (res, code) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.equal(res.code, code, JSON.stringify(res)); assert.ok(res.message.length > 8); return res; };
const good = (res) => { assert.equal(res.ok, true, JSON.stringify(res)); return res; };
const jobs = (n, start = 1) => Array.from({ length: n }, (_, i) => withSnapshot(mkCase(start + i)));
const bodiesOf = (h) => h.recs().map((r) => JSON.stringify(r.b)).sort();

test('M1 the plan is pure: same cases give the same plan twice, cases and storage are not touched', () => {
  const list = jobs(5);
  const before = JSON.stringify(list);
  const h = build(list);
  const setBefore = h.adapter.setCount;
  const a = good(h.mig.plan(h.pin(OWNER)));
  const b = good(h.mig.plan(h.pin(OWNER)));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.invoices.length, 5);
  assert.equal(a.pending.invoices, 5);
  assert.equal(JSON.stringify(list), before);
  assert.equal(h.adapter.setCount, setBefore, 'a plan must not write a single key');
  assert.equal(h.docs.calls, 0);
  // internal read (no context) and counts only
  assert.equal(good(h.mig.plan()).invoices.length, 5);
  assert.deepEqual(good(h.mig.pending()), { ok: true, invoices: 5, alreadyThere: 0, skipped: 0 });
  // order is by job id, ascending
  assert.deepEqual(a.invoices.map((x) => x.jobId), ['WS-2026-001', 'WS-2026-002', 'WS-2026-003', 'WS-2026-004', 'WS-2026-005']);
});

test('M2 an invoiced closed job with a version 1 snapshot: paise are the snapshot figures x 100, 18 is 1800 basis points', () => {
  const c = withSnapshot(mkCase(1));
  const c2 = withSnapshot(mkCase(2, { delivery: { finalAmt: '1180.40', payMode: 'UPI', collectDate: '2026-06-03' }, corrections: [{ at: 'x' }, { at: 'y' }] }));
  const h = build([c, c2]);
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  const [r1, r2] = h.recs();
  assert.equal(r1.r, 'LEGACY:WS-2026-001');
  assert.deepEqual(r1.b, {
    legacyNo: 'SV/2026-27/0001', jobId: 'WS-2026-001', basis: 'SNAPSHOT_V1', invoiceDate: '2026-05-02', gstBp: 1800,
    listedPaise: 100000, adjustmentPaise: 0, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, gstPaise: 18000,
    roundOffPaise: 0, totalPaise: 118000, finalPaise: 118000, payMode: 'Cash', lineCount: 1, correctionCount: 0,
    snapshotSha: Store.sha256Hex(JSON.stringify(c.invoiceSnapshot)), warn: []
  });
  assert.match(r1.b.snapshotSha, /^[0-9a-f]{64}$/);
  // two decimals in the final amount: Rs 1180.40 is 118040 paise, the rounded total stays 118000
  assert.equal(r2.b.finalPaise, 118040);
  assert.equal(r2.b.totalPaise, 118000);
  assert.equal(r2.b.payMode, 'UPI');
  assert.equal(r2.b.correctionCount, 2);
  assert.equal(r2.b.invoiceDate, '2026-06-03');
  assert.deepEqual(Object.keys(r1.b).sort(), Migrate.BODY_KEYS.slice().sort());
  assert.equal(Object.prototype.hasOwnProperty.call(r1.b, 'no'), false, 'the old number must never be in b.no');
});

test('M3 an old WS- number without a snapshot is rebuilt from the case as it stands: basis LIVE_CASE, nothing written on the case', () => {
  const c = mkCase(9, { invoiceNo: 'WS-2026-009', subTotal: '2000', gst: '18', delivery: { finalAmt: '2360', payMode: 'Cash', collectDate: '2026-04-20' } });
  const before = JSON.stringify(c);
  const h = build([c]);
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  const [r] = h.recs();
  assert.equal(r.b.basis, 'LIVE_CASE');
  assert.equal(r.b.snapshotSha, null);
  assert.equal(r.b.legacyNo, 'WS-2026-009');
  // typed by hand: 2000 + 18 % = 2360
  assert.equal(r.b.taxablePaise, 200000);
  assert.equal(r.b.gstPaise, 36000);
  assert.equal(r.b.cgstPaise, 18000);
  assert.equal(r.b.sgstPaise, 18000);
  assert.equal(r.b.totalPaise, 236000);
  assert.equal(r.b.finalPaise, 236000);
  // and they equal what makeInvoiceSnapshot itself returns, times 100
  const f = R.makeInvoiceSnapshot(Object.assign({}, c), 'WS-2026-009', 'live').figs;
  assert.equal(r.b.totalPaise, f.total * 100);
  assert.equal(r.b.gstPaise, f.gst * 100);
  assert.equal(Object.prototype.hasOwnProperty.call(r.b, 'issuedAt'), false);
  assert.equal(JSON.stringify(c), before);
  assert.equal(c.invoiceSnapshot, undefined, 'a snapshot must never be stored on the case');
});

test('M4 GST 150 on a legacy case gives no record and a SNAPSHOT_UNBUILDABLE skip', () => {
  const bad = mkCase(4, { gst: '150' });
  const h = build([bad, withSnapshot(mkCase(5))]);
  const p = good(h.mig.plan(h.pin()));
  assert.deepEqual(p.skipped, [{ jobId: 'WS-2026-004', code: 'SNAPSHOT_UNBUILDABLE', legacyNo: 'SV/2026-27/0004' }]);
  assert.equal(p.invoices.length, 1);
  good(h.mig.run(p, h.pin()));
  assert.equal(h.recs().length, 1);
});

test('M5 a closed case without a number gives nothing; an open case with a number (injected) gives nothing', () => {
  const noNo = mkCase(1, { invoiceNo: '' });
  const noNo2 = mkCase(2); delete noNo2.invoiceNo;
  const spaces = mkCase(3, { invoiceNo: '   ' });
  const openNumbered = mkCase(4, { status: 'open' });
  const h = build([noNo, noNo2, spaces, openNumbered, withSnapshot(mkCase(5))]);
  const p = good(h.mig.plan(h.pin()));
  assert.equal(p.invoices.length, 1);
  assert.equal(p.invoices[0].jobId, 'WS-2026-005');
  assert.equal(p.closedWithoutNumber, 3);
  assert.equal(p.skipped.length, 0);
});

test('M6 and M7 (corrected) nothing is written for advances: no receipt record, no SAR number, no cash-book key, no stream key', () => {
  const openAdv = mkCase(1, { status: 'open', invoiceNo: '', advancePaid: '1,200' });
  const junk = ['abc', '0', '-5'].map((v, i) => mkCase(2 + i, { status: 'open', invoiceNo: '', advancePaid: v }));
  const closedAdv = mkCase(6, { advancePaid: '500' });
  const h = build([openAdv, ...junk, withSnapshot(closedAdv)]);
  const p = good(h.mig.plan(h.pin()));
  assert.equal(Object.prototype.hasOwnProperty.call(p, 'advances'), false);
  assert.equal(p.invoices.length, 1, 'only the closed invoiced job is listed');
  const r = good(h.mig.run(p, h.pin()));
  assert.deepEqual(r.written, { invoices: 1, advances: 0 });
  assert.equal(good(h.store.read('receipts')).records.length, 0);
  assert.equal(good(h.store.lastNumber('SAR', '2026-11-18T05:00:00.000Z')).last, 0);
  assert.equal(h.adapter.svcsKeys().some((k) => /receipts/.test(k)), false);
  assert.equal(Array.from(h.adapter.data.keys()).some((k) => /gm_expenses/.test(k)), false);
  // and no record other than INV_LEGACY exists anywhere in the invoices stream (no ADV_LEGACY, no MIGRATION_RUN)
  const kinds = new Set(good(h.store.read('invoices')).records.map((x) => x.k));
  assert.deepEqual(Array.from(kinds), ['INV_LEGACY']);
  assert.equal(good(h.store.read('audit')).records.length, 0);
});

test('M8 two runs: the second writes zero and reports what was already there; one reference per job', () => {
  const h = build(jobs(7));
  const r1 = good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  assert.equal(r1.written.invoices, 7);
  const calls = h.docs.calls;
  const p2 = good(h.mig.plan(h.pin()));
  assert.equal(p2.pending.invoices, 0);
  assert.equal(p2.alreadyThere, 7);
  const text = h.text();
  const r2 = good(h.mig.run(p2, h.pin()));
  assert.equal(r2.written.invoices, 0);
  assert.equal(r2.alreadyThere, 7);
  assert.equal(h.docs.calls, calls, 'an empty plan must not call the documents layer');
  assert.equal(h.text(), text, 'storage is byte-identical after the second run');
  const refs = h.recs().map((x) => x.r);
  assert.equal(new Set(refs).size, 7);
  assert.deepEqual(good(h.mig.pending()), { ok: true, invoices: 0, alreadyThere: 7, skipped: 0 });
});

test('M9 stop half way: a failed write at record 37 of 120, then resume gives exactly 120 records, each once, same as a clean run', () => {
  const list = jobs(120);
  // clean run for the comparison
  const clean = build(list);
  good(clean.mig.run(good(clean.mig.plan(clean.pin())), clean.pin()));
  assert.equal(clean.docs.calls, 2);
  assert.deepEqual(clean.docs.sizes, [100, 20]);
  // (a) the real batch size of 100: record 37 is in the first batch, which is all or nothing
  const a = build(list);
  a.docs.failAtRecord = 37;
  const bad = refused(a.mig.run(good(a.mig.plan(a.pin())), a.pin()), 'SVCS_STORAGE_UNAVAILABLE');
  assert.deepEqual(bad.written, { invoices: 0, advances: 0 });
  assert.equal(bad.remaining, 120);
  assert.equal(a.recs().length, 0);
  a.docs.failAtRecord = 0;
  assert.equal(good(a.mig.run(good(a.mig.plan(a.pin())), a.pin())).written.invoices, 120);
  assert.equal(a.recs().length, 120);
  assert.deepEqual(bodiesOf(a), bodiesOf(clean));
  // (b) batches of 25: record 37 is in the second batch; the first 25 stay, the rest is finished by the next run
  const b = build(list, { batchSize: 25 });
  b.docs.failAtRecord = 37;
  const half = refused(b.mig.run(good(b.mig.plan(b.pin())), b.pin()), 'SVCS_STORAGE_UNAVAILABLE');
  assert.deepEqual(half.written, { invoices: 25, advances: 0 });
  assert.equal(half.remaining, 95);
  assert.equal(b.recs().length, 25);
  b.docs.failAtRecord = 0;
  const p = good(b.mig.plan(b.pin()));
  assert.equal(p.pending.invoices, 95);
  assert.equal(p.alreadyThere, 25);
  const done = good(b.mig.run(p, b.pin()));
  assert.equal(done.written.invoices, 95);
  const refs = b.recs().map((x) => x.r);
  assert.equal(refs.length, 120);
  assert.equal(new Set(refs).size, 120);
  assert.deepEqual(bodiesOf(b), bodiesOf(clean));
  assert.equal(good(b.store.verifyAll()).ok, true);
  // a thrown error in the documents layer is a plain failure, nothing else
  const c = build(list);
  c.docs.importLegacy = () => { throw new Error('boom'); };
  const t = refused(c.mig.run(good(c.mig.plan(c.pin())), c.pin()), 'WRITE_FAILED');
  assert.equal(t.written.invoices, 0);
});

test('M10 250 invoices: three writes of at most 100, the chain verifies, the shard rolls over', () => {
  const h = build(jobs(250));
  const r = good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  assert.equal(r.written.invoices, 250);
  assert.deepEqual(h.docs.sizes, [100, 100, 50]);
  assert.equal(r.batches, 3);
  assert.equal(h.recs().length, 250);
  assert.equal(good(h.store.verifyAll()).ok, true);
  const keys = h.adapter.svcsKeys().filter((k) => /invoices_v1/.test(k));
  assert.ok(keys.length >= 2, 'expected a second shard, got ' + keys.join(','));
  assert.ok(keys.some((k) => /_p2$/.test(k)));
  // the legacy numbers stay outside the strict series check
  assert.equal(good(h.store.lastNumber('SV', '2026-11-18T05:00:00.000Z')).last, 0);
});

test('M11 the same invoice number on two jobs: neither is brought in (the bill layer keeps one old bill per number); both are listed with a code', () => {
  const h = build([withSnapshot(mkCase(1, { invoiceNo: 'SV/2026-27/0007' })), withSnapshot(mkCase(2, { invoiceNo: 'SV/2026-27/0007' })), withSnapshot(mkCase(3))]);
  const p = good(h.mig.plan(h.pin()));
  assert.deepEqual(p.skipped.map((x) => [x.jobId, x.code, x.legacyNo]), [['WS-2026-001', 'DUPLICATE_LEGACY_NUMBER', 'SV/2026-27/0007'], ['WS-2026-002', 'DUPLICATE_LEGACY_NUMBER', 'SV/2026-27/0007']]);
  assert.equal(p.invoices.length, 1);
  good(h.mig.run(p, h.pin()));
  const recs = h.recs();
  assert.equal(recs.length, 1);
  assert.equal(recs[0].b.jobId, 'WS-2026-003');
  assert.deepEqual(recs[0].b.warn, []);
  // a number already brought in for one job and then found on another job: the other job is left out, never a conflict
  const h2 = build([withSnapshot(mkCase(1, { invoiceNo: 'SV/2026-27/0009' }))], { freeze: false });
  good(h2.mig.run(good(h2.mig.plan(h2.pin())), h2.pin()));
  h2.list.push(withSnapshot(mkCase(2, { invoiceNo: 'SV/2026-27/0009' })));
  const p2 = good(h2.mig.plan(h2.pin()));
  assert.deepEqual(p2.skipped.map((x) => [x.jobId, x.code]), [['WS-2026-002', 'DUPLICATE_LEGACY_NUMBER']]);
  assert.equal(p2.invoices.length, 0);
});

test('M11b LEGACY_CONFLICT from the bill layer stops the run at once: reported as it is, never skipped, never retried past', () => {
  const h = build(jobs(60), { batchSize: 20 });
  const p = good(h.mig.plan(h.pin()));
  const real = h.docs.importLegacy;
  let calls = 0;
  h.docs.importLegacy = (items, ctx) => { calls += 1; return calls === 2 ? { ok: false, code: 'LEGACY_CONFLICT', detail: { index: 3 } } : real(items, ctx); };
  const stop = refused(h.mig.run(p, h.pin()), 'LEGACY_CONFLICT');
  assert.equal(calls, 2, 'no further batch after the conflict');
  assert.equal(stop.stopped, true);
  assert.deepEqual(stop.detail, { index: 3 });
  assert.deepEqual(stop.written, { invoices: 20, advances: 0 });
  assert.equal(stop.remaining, 40);
  assert.equal(/Run it again/.test(stop.message), false, 'not told to just run it again');
  assert.equal(h.recs().length, 20);
});

test('M11c the list goes stale when an old bill changes between the list and the run (number or amounts), not only when references change', () => {
  const list = jobs(3);
  const h = build(list, { freeze: false });
  const p = good(h.mig.plan(h.pin()));
  list[1].invoiceSnapshot = Object.assign({}, list[1].invoiceSnapshot, { figs: Object.assign({}, list[1].invoiceSnapshot.figs, { total: list[1].invoiceSnapshot.figs.total + 1, finalAmt: list[1].invoiceSnapshot.figs.finalAmt + 1 }) });
  const text = h.text();
  refused(h.mig.run(p, h.pin()), 'PLAN_STALE');
  assert.equal(h.text(), text);
  assert.equal(h.recs().length, 0);
  refused(h.mig.run(Object.assign({}, p, { invoices: undefined }), h.pin()), 'PLAN_STALE');
});

test('M12 odd job ids: a hash reference, no throw; a job id that is too long or empty is skipped with a code', () => {
  const odd = withSnapshot(mkCase(1, { id: 'wsc_a b' }));
  const long58 = withSnapshot(mkCase(2, { id: 'WS' + 'x'.repeat(56) }));
  const fits57 = withSnapshot(mkCase(3, { id: 'W' + 'y'.repeat(56) }));
  const tooLong = mkCase(4, { id: 'z'.repeat(61) });
  const empty = mkCase(5, { id: '' });
  const h = build([odd, long58, fits57, tooLong, empty]);
  const p = good(h.mig.plan(h.pin()));
  const byJob = Object.fromEntries(p.invoices.map((x) => [x.jobId, x.ref]));
  const hashRef = (id) => 'LEGACY:h' + Store.sha256Hex(id).slice(0, 20);
  assert.equal(byJob['wsc_a b'], hashRef('wsc_a b'));
  assert.equal(byJob[long58.id], hashRef(long58.id));
  assert.equal(byJob[fits57.id], 'LEGACY:' + fits57.id);
  assert.ok(byJob[fits57.id].length === 64);
  assert.deepEqual(p.skipped.map((s) => s.code).sort(), ['JOB_ID_INVALID', 'JOB_ID_INVALID']);
  good(h.mig.run(p, h.pin()));
  assert.equal(h.recs().length, 3);
  assert.equal(Migrate.refFor('WS-2026-001', Store.sha256Hex), 'LEGACY:WS-2026-001');
  assert.equal(Migrate.refFor('', Store.sha256Hex), '');
  // two cases with the same id: the second is skipped
  const dupe = build([withSnapshot(mkCase(1)), withSnapshot(mkCase(1, { invoiceNo: 'SV/2026-27/0099' }))]);
  const dp = good(dupe.mig.plan(dupe.pin()));
  assert.equal(dp.invoices.length, 1);
  assert.equal(dp.skipped[0].code, 'DUPLICATE_JOB');
});

test('M13 not the Owner, stale or missing PIN stamp, past view, blocked store, bad plan: nothing written, a code returned', () => {
  const h = build(jobs(3));
  const p = good(h.mig.plan(h.pin()));
  const before = h.text();
  const fresh = Date.parse(h.clock.iso);
  refused(h.mig.run(p, h.pin(MANAGER)), 'NOT_ALLOWED');
  refused(h.mig.run(p, h.pin(STAFF)), 'NOT_ALLOWED');
  refused(h.mig.run(p, h.pin(NONE)), 'SESSION_REQUIRED');
  refused(h.mig.run(p, {}), 'SESSION_REQUIRED');
  refused(h.mig.run(p, undefined), 'SESSION_REQUIRED');
  refused(h.mig.run(p, { session: OWNER }), 'PIN_REQUIRED');
  refused(h.mig.run(p, { session: OWNER, stepUp: { ok: true, at: fresh - 120001 } }), 'PIN_REQUIRED');
  refused(h.mig.run(p, { session: OWNER, stepUp: { ok: true, at: fresh + 1 } }), 'PIN_REQUIRED');
  refused(h.mig.run(p, { session: OWNER, stepUp: { ok: false, at: fresh } }), 'PIN_REQUIRED');
  refused(h.mig.run(p, { session: OWNER, stepUp: { ok: true, at: String(fresh) } }), 'PIN_REQUIRED');
  refused(h.mig.run(p, h.pin(OWNER, { pastView: true })), 'PAST_VIEW');
  // a manager claiming to be the owner, and an owner whose flag is missing
  refused(h.mig.run(p, h.pin(Object.freeze(Object.assign({}, MANAGER, { isOwner: true })))), 'SESSION_REQUIRED');
  refused(h.mig.run(p, h.pin(Object.freeze(Object.assign({}, OWNER, { isOwner: false })))), 'SESSION_REQUIRED');
  // a bad plan object
  refused(h.mig.run(null, h.pin()), 'PLAN_INVALID');
  refused(h.mig.run({ ok: false }, h.pin()), 'PLAN_INVALID');
  refused(h.mig.run({ ok: true, refs: [], rev: 'x' }, h.pin()), 'PLAN_INVALID');
  assert.equal(h.docs.calls, 0);
  assert.equal(h.text(), before);
  // plan rights: staff refused, no context at all is an internal read, a broken session is refused
  refused(h.mig.plan({ session: STAFF }), 'NOT_ALLOWED');
  refused(h.mig.plan({ session: NONE }), 'SESSION_REQUIRED');
  refused(h.mig.plan(null), 'SESSION_REQUIRED');
  good(h.mig.plan({ session: MANAGER }));
  refused(h.mig.pending({ session: NONE }), 'SESSION_REQUIRED');
  good(h.mig.pending({ session: STAFF }));
  // blocked store: break the stored text of the invoices shard, then reopen
  // make some records first so a shard exists
  good(h.mig.run(p, h.pin()));
  const adapter3 = h.adapter.copy();
  const k3 = adapter3.svcsKeys().find((k) => /invoices_v1/.test(k));
  const arr = JSON.parse(adapter3.data.get(k3));
  arr[0].b = Object.assign({}, arr[0].b, { totalPaise: 1 });
  adapter3.data.set(k3, JSON.stringify(arr));
  const clock3 = makeClock('2026-11-18T06:00:00.000Z');
  const s3 = Store.createStore(adapter3, { now: clock3.now }).store;
  s3.open();
  assert.equal(s3.status().blocked, true);
  const docs3 = fakeDocs(s3);
  const m3 = Migrate.create({ store: s3, docs: docs3, cases: { list: () => h.list, legacyInput: (id) => legacyFrom(h.list.find((c) => c.id === id)) }, now: clock3.now, hashHex: Store.sha256Hex });
  assert.equal(m3.ok, true);
  const ctx3 = { session: OWNER, stepUp: { ok: true, at: Date.parse(clock3.iso) } };
  const snap3 = adapter3.snapshot();
  refused(m3.api.plan(ctx3), 'STORE_BLOCKED');
  refused(m3.api.run(p, ctx3), 'STORE_BLOCKED');
  assert.equal(docs3.calls, 0);
  assert.deepEqual(adapter3.snapshot(), snap3);
  // a store that was never opened
  const raw = Store.createStore(makeAdapter(), { now: clock3.now }).store;
  const m4 = Migrate.create({ store: raw, docs: docs3, cases: { list: () => [], legacyInput: () => null }, now: clock3.now, hashHex: Store.sha256Hex });
  refused(m4.api.plan(), 'STORE_NOT_READY');
  assert.equal(m4.api.ready(), false);
});

test('M14 no customer name, mobile or address appears in any written record or any stored string', () => {
  const h = build([...jobs(4), withSnapshot(mkCase(5, { custName: 'Aa Other Invented', custMobile: '5550999000' }))]);
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  const all = h.text();
  for (const word of [FAKE_NAME, FAKE_PHONE, FAKE_ADDR, 'Zz Invented', 'Faketown', '5550100', 'Aa Other', '5550999', 'Testbrand', 'Battery change']) assert.equal(all.includes(word), false, word);
  for (const r of h.recs()) {
    assert.deepEqual(Object.keys(r.b).sort(), Migrate.BODY_KEYS.slice().sort());
    for (const k of Object.keys(r.b)) assert.equal(/^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|whatsapp|pan)/i.test(k), false, k);
    assert.equal(Object.prototype.hasOwnProperty.call(r.b, 'no'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(r, 'series'), false);
  }
  // what the documents layer receives is only {ref, body}
  const seen = [];
  const h2 = build(jobs(2));
  const orig = h2.docs.importLegacy;
  h2.docs.importLegacy = (items, ctx) => { seen.push(...items); return orig(items, ctx); };
  good(h2.mig.run(good(h2.mig.plan(h2.pin())), h2.pin()));
  assert.equal(seen.length, 2);
  for (const it of seen) assert.deepEqual(Object.keys(it).sort(), ['body', 'ref']);
});

test('M15 the case list and the settings text are byte-identical before and after (deep-frozen inputs, no write)', () => {
  const list = [...jobs(6), mkCase(7, { status: 'open', invoiceNo: '', advancePaid: '1,200' })];
  const h = build(list); // build deep-freezes the list: any write to a case would throw
  const casesBefore = JSON.stringify(list);
  const settingsBefore = h.settingsText;
  const adapterKeysBefore = new Set(h.adapter.data.keys());
  good(h.mig.plan(h.pin()));
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  assert.equal(JSON.stringify(list), casesBefore);
  assert.equal(h.settingsText, settingsBefore);
  // the only keys written are Service store keys; nothing like the job list or the settings key exists
  for (const k of h.adapter.data.keys()) if (!adapterKeysBefore.has(k)) assert.match(k, /^(saagar_svcs_|st_v2_svcs_)/);
  for (const k of h.adapter.setLog) assert.match(k, /^(saagar_svcs_|st_v2_svcs_)/);
  assert.equal(h.adapter.data.has('saagar_wsf_v2'), false);
  assert.equal(h.adapter.data.has('saagar_wsf_settings_v1'), false);
});

test('M16 a stale revision: another write after the list was made gives PLAN_STALE, nothing written, a re-run works', () => {
  const h = build(jobs(5));
  const p = good(h.mig.plan(h.pin()));
  // another tab appends something to the invoice stream
  good(put(h.store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: [], estimateRoles: ['Technician'] } }));
  const text = h.text();
  refused(h.mig.run(p, h.pin()), 'PLAN_STALE');
  assert.equal(h.text(), text);
  assert.equal(h.docs.calls, 0);
  const p2 = good(h.mig.plan(h.pin()));
  assert.equal(good(h.mig.run(p2, h.pin())).written.invoices, 5);
  // a forged or old list naming other references is stale too
  const h2 = build(jobs(3));
  const q = good(h2.mig.plan(h2.pin()));
  refused(h2.mig.run(Object.assign({}, q, { refs: q.refs.slice(1) }), h2.pin()), 'PLAN_STALE');
  refused(h2.mig.run(Object.assign({}, q, { refs: ['LEGACY:WS-9999-001'].concat(q.refs.slice(1)) }), h2.pin()), 'PLAN_STALE');
  assert.equal(h2.recs().length, 0);
  // a job closed after the list was shown is not silently added
  const list3 = [...jobs(3)];
  const h3 = build(list3, { freeze: false });
  const q3 = good(h3.mig.plan(h3.pin()));
  list3.push(withSnapshot(mkCase(4)));
  refused(h3.mig.run(q3, h3.pin()), 'PLAN_STALE');
  assert.equal(h3.recs().length, 0);
  // a change between two batches stops the run: the finished batches stay, the rest is left for the next run
  const h4 = build(jobs(60), { batchSize: 20 });
  const q4 = good(h4.mig.plan(h4.pin()));
  h4.docs.afterCall = () => good(put(h4.store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] } }));
  const stop = refused(h4.mig.run(q4, h4.pin()), 'PLAN_STALE');
  assert.deepEqual(stop.written, { invoices: 20, advances: 0 });
  assert.equal(stop.remaining, 40);
  assert.equal(h4.recs().length, 20);
  assert.equal(good(h4.mig.run(good(h4.mig.plan(h4.pin())), h4.pin())).written.invoices, 40);
  assert.equal(h4.recs().length, 60);
});

test('M17 an older case list restored over newer records: numbers are not reissued, a billed job and a used number are skipped', () => {
  const h = build(jobs(3));
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  assert.equal(good(h.store.lastNumber('SV', '2026-11-18T05:00:00.000Z')).last, 0, 'legacy numbers are outside the strict series');
  // a new-way bill was issued after the backup point: job WS-2026-020 got SV/2026-27/0001 from the store itself
  const t = good(h.store.nextAt('invoices'));
  const no = good(h.store.nextNumber('SV', t.at)).no;
  assert.equal(no, 'SV/2026-27/0001');
  good(put(h.store, 'invoices', { k: 'INV_ISSUE', series: 'SV', b: { no, jobId: 'WS-2026-020', docDate: '2026-11-18' } }, { at: t.at }));
  // the restored (older) case list still shows job 20 as closed and numbered with an old number, and another job using the new number
  const restored = [...jobs(3), withSnapshot(mkCase(20, { invoiceNo: 'WS-2026-020' })), withSnapshot(mkCase(21, { invoiceNo: no }))];
  const h2 = build(restored, { freeze: true });
  // same adapter state: rebuild the migrator over the existing store instead
  const m = Migrate.create({ store: h.store, docs: h.docs, cases: { list: () => restored, legacyInput: (id) => legacyFrom(restored.find((c) => c.id === id)) }, now: h.clock.now, hashHex: Store.sha256Hex, validateBody: strictBody });
  const p = good(m.api.plan(h.pin()));
  assert.equal(p.alreadyThere, 3);
  assert.deepEqual(p.skipped.map((s) => [s.jobId, s.code]).sort(), [['WS-2026-020', 'JOB_ALREADY_BILLED'], ['WS-2026-021', 'NUMBER_USED_BY_NEW_BILL']]);
  assert.equal(p.invoices.length, 0);
  assert.equal(good(m.api.run(p, h.pin())).written.invoices, 0);
  // the next number from the store is still above every number it has issued
  assert.equal(good(h.store.nextNumber('SV', good(h.store.nextAt('invoices')).at)).no, 'SV/2026-27/0002');
  assert.ok(h2);
});

test('M18 a Phase 1 counter sale from before the cutover stays unposted and no receipt appears', () => {
  const h = build(jobs(3));
  good(put(h.store, 'ledger', { k: 'CSL', b: { amountPaise: 45000, payMode: 'Cash', moneyPosted: false, note: 'old sale' } }));
  const ledgerBefore = JSON.stringify(good(h.store.read('ledger')).records);
  good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
  assert.equal(JSON.stringify(good(h.store.read('ledger')).records), ledgerBefore);
  assert.equal(good(h.store.read('ledger')).records[0].b.moneyPosted, false);
  assert.equal(good(h.store.read('receipts')).records.length, 0);
});

test('damaged snapshots: a damaged version 1 copy falls back to the live case; unreadable figures are skipped with FIGURES_INVALID', () => {
  const damaged = mkCase(1, { invoiceSnapshot: { v: 1, figs: { gstPct: 18 }, lines: 'x' } });
  const h = build([damaged, withSnapshot(mkCase(2))]);
  const p = good(h.mig.plan(h.pin()));
  assert.equal(p.invoices.find((x) => x.jobId === 'WS-2026-001').basis, 'LIVE_CASE');
  assert.equal(p.invoices.find((x) => x.jobId === 'WS-2026-002').basis, 'SNAPSHOT_V1');
  // figures that are not whole amounts, text, or missing
  const mk = (figs) => build([mkCase(1)], { input: () => ({ ok: true, basis: 'SNAPSHOT_V1', invoiceDate: '2026-05-02', figs, payMode: 'Cash', lineCount: 1, correctionCount: 0, snapshotSha: null }) });
  const base = { gstPct: 18, listed: 1000, adjustment: 0, taxable: 1000, gst: 180, cgst: 90, sgst: 90, roundOff: 0, finalAmt: 1180, total: 1180 };
  for (const [name, figs] of [['text', Object.assign({}, base, { total: 'abc' })], ['three decimals', Object.assign({}, base, { finalAmt: 1180.123 })], ['missing', Object.assign({}, base, { cgst: undefined })], ['NaN', Object.assign({}, base, { gst: NaN })], ['object', Object.assign({}, base, { taxable: {} })]]) {
    const q = mk(figs);
    const pp = good(q.mig.plan(q.pin()));
    assert.deepEqual(pp.skipped.map((s) => s.code), ['FIGURES_INVALID'], name);
    assert.equal(pp.invoices.length, 0, name);
  }
  // a missing or rejected rebuild
  for (const input of [null, { ok: false }, { ok: true, basis: 'SOMETHING', figs: base }, { ok: true, basis: 'LIVE_CASE', figs: Object.assign({}, base, { gstPct: 101 }) }, { ok: true, basis: 'LIVE_CASE', figs: Object.assign({}, base, { gstPct: 'x' }) }]) {
    const q = build([mkCase(1)], { input: () => input });
    assert.deepEqual(good(q.mig.plan(q.pin())).skipped.map((s) => s.code), ['SNAPSHOT_UNBUILDABLE']);
  }
  // a throwing lookup
  const th = build([mkCase(1)], { input: () => { throw new Error('boom'); } });
  assert.deepEqual(good(th.mig.plan(th.pin())).skipped.map((s) => s.code), ['SNAPSHOT_UNBUILDABLE']);
});

test('warnings: figures that do not add up, no collection date, an amount out of range', () => {
  const base = { gstPct: 18, listed: 1000, adjustment: 0, taxable: 1000, gst: 180, cgst: 90, sgst: 90, roundOff: 0, finalAmt: 1180, total: 1180 };
  const run = (figs, date = '2026-05-02') => {
    const h = build([mkCase(1)], { input: () => ({ ok: true, basis: 'SNAPSHOT_V1', invoiceDate: date, figs, payMode: 'Cash', lineCount: 1, correctionCount: 0, snapshotSha: null }) });
    good(h.mig.run(good(h.mig.plan(h.pin())), h.pin()));
    return h.recs()[0].b;
  };
  assert.deepEqual(run(Object.assign({}, base, { total: 1181 })).warn, ['FIGURES_INCONSISTENT']);
  assert.deepEqual(run(base, '').warn, ['NO_COLLECT_DATE']);
  assert.equal(run(base, '').invoiceDate, '');
  assert.deepEqual(run(Object.assign({}, base, { total: -5, finalAmt: -5, taxable: -5, gst: 0, cgst: 0, sgst: 0 })).warn, ['AMOUNT_OUT_OF_RANGE']);
  assert.deepEqual(run(Object.assign({}, base, { taxable: 10000001, gst: 0, cgst: 0, sgst: 0, total: 10000001, finalAmt: 10000001, listed: 10000001 })).warn, ['AMOUNT_OUT_OF_RANGE']);
  // a negative adjustment and round-off are normal
  const b = run(Object.assign({}, base, { listed: 1010, adjustment: -10, roundOff: 0 }));
  assert.deepEqual(b.warn, []);
  assert.equal(b.adjustmentPaise, -1000);
  assert.equal(run(Object.assign({}, base, { total: 1179, roundOff: -1 })).roundOffPaise, -100);
});

test('the documents layer says no or skips: the code passes through, skipped copies are counted, a body the checks refuse is left out', () => {
  const h = build(jobs(4));
  h.docs.importLegacy = () => ({ ok: false, code: 'NOT_ALLOWED', detail: { why: 'x' } });
  const r = refused(h.mig.run(good(h.mig.plan(h.pin())), h.pin()), 'NOT_ALLOWED');
  assert.deepEqual(r.detail, { why: 'x' });
  const h2 = build(jobs(4));
  h2.docs.importLegacy = () => ({ ok: true, written: 3, skipped: 1 });
  const ok = good(h2.mig.run(good(h2.mig.plan(h2.pin())), h2.pin()));
  assert.equal(ok.written.invoices, 3);
  assert.equal(ok.alreadyThere, 1);
  // the ctx given to the documents layer is the Owner's own context
  const h3 = build(jobs(1));
  const ctx = h3.pin();
  good(h3.mig.run(good(h3.mig.plan(ctx)), ctx));
  assert.equal(h3.docs.lastCtx, ctx);
  // a validator that refuses
  const clock = makeClock('2026-11-18T05:00:00.000Z');
  const store = openStore(makeAdapter(), clock);
  const m = Migrate.create({ store, docs: fakeDocs(store), cases: { list: () => jobs(2), legacyInput: (id) => legacyFrom(jobs(2).find((c) => c.id === id)) }, now: clock.now, hashHex: Store.sha256Hex, validateBody: () => ({ ok: false, code: 'LEGACY_BODY_INVALID' }) });
  const p = good(m.api.plan());
  assert.deepEqual(p.skipped.map((s) => s.code), ['BODY_INVALID', 'BODY_INVALID']);
  assert.equal(p.skipped[0].detail, 'LEGACY_BODY_INVALID');
});

test('a second run started while one is running is refused with BUSY; the flag is released afterwards, even after a failure', () => {
  const h = build(jobs(30), { batchSize: 10 });
  const p = good(h.mig.plan(h.pin()));
  let inner = null;
  h.docs.afterCall = () => { inner = h.mig.run(p, h.pin()); };
  good(h.mig.run(p, h.pin()));
  refused(inner, 'BUSY');
  const h2 = build(jobs(3));
  h2.docs.failCall = 1;
  refused(h2.mig.run(good(h2.mig.plan(h2.pin())), h2.pin()), 'SVCS_STORAGE_UNAVAILABLE');
  h2.docs.failCall = 0;
  good(h2.mig.run(good(h2.mig.plan(h2.pin())), h2.pin()));
});

test('bad set-up is refused when the migrator is made', () => {
  const clock = makeClock();
  const store = openStore(makeAdapter(), clock);
  const ok = { store, docs: fakeDocs(store), cases: { list: () => [], legacyInput: () => null }, now: clock.now, hashHex: Store.sha256Hex };
  assert.equal(Migrate.create(ok).ok, true);
  for (const bad of [null, undefined, 5, {}, Object.assign({}, ok, { store: {} }), Object.assign({}, ok, { docs: {} }), Object.assign({}, ok, { cases: { list() {} } }),
    Object.assign({}, ok, { now: 1 }), Object.assign({}, ok, { hashHex: null }), Object.assign({}, ok, { validateBody: 5 }),
    Object.assign({}, ok, { batchSize: 0 }), Object.assign({}, ok, { batchSize: 101 }), Object.assign({}, ok, { batchSize: 1.5 })]) {
    assert.deepEqual(Migrate.create(bad), { ok: false, code: 'DEPS_INVALID' });
  }
  assert.equal(Migrate.create(Object.assign({}, ok, { batchSize: 100 })).ok, true);
  // a job list that cannot be read is a refusal, not a crash
  const m = Migrate.create(Object.assign({}, ok, { cases: { list: () => { throw new Error('x'); }, legacyInput: () => null } }));
  refused(m.api.plan(), 'CASES_UNAVAILABLE');
  const m2 = Migrate.create(Object.assign({}, ok, { cases: { list: () => 'nope', legacyInput: () => null } }));
  refused(m2.api.plan(), 'CASES_UNAVAILABLE');
  // the exported tables are frozen, every code has a message
  assert.equal(Object.isFrozen(Migrate), true);
  assert.equal(Migrate.BATCH_MAX, 100);
  for (const c of Object.keys(Migrate.CODES)) assert.equal(typeof Migrate.MESSAGES[c], 'string', c);
});

test('zero cases: an empty plan, a run that writes nothing and does not call the documents layer', () => {
  const h = build([]);
  const p = good(h.mig.plan(h.pin()));
  assert.equal(p.invoices.length, 0);
  assert.equal(p.pending.invoices, 0);
  const text = h.text();
  const r = good(h.mig.run(p, h.pin()));
  assert.deepEqual(r.written, { invoices: 0, advances: 0 });
  assert.equal(h.docs.calls, 0);
  assert.equal(h.text(), text);
});

test('2,500 cases: planned and brought in, 25 batches of 100, each job once (timed on this PC)', () => {
  const list = Array.from({ length: 2500 }, (_, i) => withSnapshot(mkCase(i + 1, { invoiceNo: 'SV/2026-27/' + pad((i % 9000) + 1, 4) })));
  const h = build(list);
  const t0 = performance.now();
  const p = good(h.mig.plan(h.pin()));
  const t1 = performance.now();
  assert.equal(p.invoices.length, 2500);
  const r = good(h.mig.run(p, h.pin()));
  const t2 = performance.now();
  assert.equal(r.written.invoices, 2500);
  assert.equal(h.docs.sizes.length, 25);
  assert.ok(h.docs.sizes.every((n) => n === 100));
  assert.equal(h.recs().length, 2500);
  assert.equal(new Set(h.recs().map((x) => x.r)).size, 2500);
  // a second run over the full store finds everything and writes nothing
  const t3 = performance.now();
  const p2 = good(h.mig.plan(h.pin()));
  const t4 = performance.now();
  assert.equal(p2.alreadyThere, 2500);
  assert.equal(p2.pending.invoices, 0);
  const v0 = performance.now();
  assert.equal(good(h.store.verifyAll()).ok, true);
  const v1 = performance.now();
  console.log('TIMING 2500 cases on this PC: plan ' + Math.round(t1 - t0) + ' ms, run (25 writes incl. the fake documents layer and the real store) ' + Math.round(t2 - t1) + ' ms, plan again ' + Math.round(t4 - t3) + ' ms, full verify ' + Math.round(v1 - v0) + ' ms');
  assert.ok(t1 - t0 < 20000 && t2 - t1 < 60000);
});
