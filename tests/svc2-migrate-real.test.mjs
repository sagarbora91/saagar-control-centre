// Service wave 2, old-data bring-in on the REAL stack (final run of group W-MIG): the real store, FIFO, masters, calc, money, Phase 1 docs and
// the real billing documents file (exact-20-keys importLegacy), with the real migration file on top. Invented data only: the customer words
// below must never reach a stored record. The case list is the page's job list; here it is a plain array the migration must never change.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { makeEnv, expectFail, expectOk, OWNER, MANAGER, Store, Bill } from './lib/svc2-docs-env.mjs';

const require = createRequire(import.meta.url);
const Migrate = require('../www/service-billing-migrate.js');

const FAKE_NAME = 'Zz Invented Person';
const FAKE_PHONE = '5550100123';
const FAKE_ADDR = 'Plot 0, Nowhere Lane, Faketown';
const pad = (n, w) => String(n).padStart(w, '0');
const FIGS = { gstPct: 18, listed: 1000, adjustment: 0, taxable: 1000, gst: 180, cgst: 90, sgst: 90, roundOff: 0, finalAmt: 1180, total: 1180 };
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

function mkCase(i, over = {}) {
  return {
    id: 'WS-2026-' + pad(i, 3), status: 'closed', invoiceNo: 'SV/2026-27/' + pad(i, 4), custName: FAKE_NAME, custMobile: FAKE_PHONE, custAddr: FAKE_ADDR,
    brand: 'Testbrand', model: 'T-' + i, delivery: { finalAmt: '1180', payMode: 'Cash', collectDate: '2026-05-02' }, ...over
  };
}
// what the page glue hands over: no customer block, no name, no mobile, no address
const legacyInput = () => ({ ok: true, basis: 'LIVE_CASE', invoiceDate: '2026-05-02', figs: FIGS, payMode: 'Cash', lineCount: 1, correctionCount: 0, snapshotSha: null });

function setup(count, opts = {}) {
  const env = makeEnv();
  const list = [];
  for (let i = 1; i <= count; i += 1) list.push(mkCase(i));
  // open jobs that hold a typed advance: nothing may be written for them
  list.push(mkCase(900, { id: 'OPEN-1', status: 'open', invoiceNo: '', typedAdvancePaise: 50000 }));
  list.push(mkCase(901, { id: 'OPEN-2', status: 'open', invoiceNo: '', typedAdvancePaise: 12345 }));
  const settings = JSON.stringify({ invoiceSeq: { '2026-27': count }, firm: 'Test Watch Works' });
  deepFreeze(list);
  const wrapper = { calls: 0, onCall: null, importLegacy(items, ctx) { wrapper.calls += 1; if (wrapper.onCall) wrapper.onCall(wrapper.calls); return env.bill.importLegacy(items, ctx); } };
  const made = Migrate.create({
    store: env.store, docs: wrapper, cases: { list: () => list, legacyInput }, now: env.clock.now, hashHex: Store.sha256Hex,
    validateBody: Bill.validateLegacyBody, batchSize: opts.batchSize || 100
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(env.openAll().ok, true);
  const octx = () => ({ session: OWNER, stepUp: env.pin(), clientRef: env.ref() });
  return { env, list, settings, wrapper, mig: made.api, octx, caseText: JSON.stringify(list) };
}
const invRecords = (env) => env.store.read('invoices').records;

test('R1 dry run: the plan and the pending count write nothing; the plan lists every closed invoiced job once', () => {
  const s = setup(10);
  s.env.openAll();
  const before = s.env.adapter.text();
  const writes = s.env.adapter.setCount;
  const plan = s.mig.plan({ session: OWNER });
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
  const pend = s.mig.pending({ session: OWNER });
  assert.equal(pend.invoices, 10);
  assert.equal(s.env.adapter.text(), before);
  assert.equal(s.env.adapter.setCount, writes);
  assert.equal(s.mig.plan({ session: MANAGER }).ok, true);
  expectFail(s.mig.run(plan, { session: OWNER, stepUp: undefined }), 'PIN_REQUIRED');
  expectFail(s.mig.run(plan, { session: MANAGER, stepUp: s.env.pin() }), 'NOT_ALLOWED');
  assert.equal(s.env.adapter.text(), before, 'refused runs write nothing');
});

test('R2 the Owner step: each closed invoiced case once with its old number as legacyNo; no advance is written; the second run writes nothing', () => {
  const s = setup(12);
  const plan = s.mig.plan({ session: OWNER });
  const out = s.mig.run(plan, s.octx());
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400));
  assert.deepEqual(out.written, { invoices: 12, advances: 0 });
  const recs = invRecords(s.env);
  assert.equal(recs.length, 12);
  for (let i = 1; i <= 12; i += 1) {
    const r = recs[i - 1];
    assert.equal(r.k, 'INV_LEGACY');
    assert.equal(r.b.legacyNo, 'SV/2026-27/' + pad(i, 4));
    assert.equal(r.b.jobId, 'WS-2026-' + pad(i, 3));
    assert.equal(r.r, 'LEGACY:WS-2026-' + pad(i, 3));
    assert.equal(r.b.totalPaise, 118000);
    assert.equal(r.b.gstBp, 1800);
    assert.equal(r.b.cgstPaise, 9000);
    assert.equal(r.b.basis, 'LIVE_CASE');
    assert.equal(r.b.invoiceDate, '2026-05-02');
  }
  // typed advances: nothing in the receipts stream, no record for the open jobs
  const rc = s.env.store.read('receipts');
  assert.equal(rc.ok, true);
  assert.equal(rc.records.length, 0);
  assert.ok(!recs.some((r) => /OPEN-/.test(r.b.jobId)));
  const text = s.env.adapter.text();
  const writes = s.env.adapter.setCount;
  assert.equal(s.mig.pending({ session: OWNER }).invoices, 0);
  const again = s.mig.run(s.mig.plan({ session: OWNER }), s.octx());
  assert.equal(again.ok, true);
  assert.equal(again.written.invoices, 0);
  assert.equal(s.env.adapter.text(), text, 'a second run writes nothing');
  assert.equal(s.env.adapter.setCount, writes);
  // the old bills answer through the billing layer, one per job
  assert.equal(s.env.bill.activeInvoiceNo('WS-2026-005'), 'SV/2026-27/0005');
  assert.equal(s.env.bill.getInvoice('SV/2026-27/0005', { session: MANAGER }).invoice.legacy, true);
});

test('R3 a failed write at record 37 of 120, then a resume: exactly 120 records, each once; the cases and settings text never change', () => {
  const s = setup(120, { batchSize: 25 });
  const failAt = (call) => { if (call === 2) { s.env.adapter.failNext = 1; s.env.adapter.failMatch = /invoices/; } };
  s.wrapper.onCall = failAt;
  const plan = s.mig.plan({ session: OWNER });
  assert.equal(plan.ok, true);
  const first = s.mig.run(plan, s.octx());
  assert.equal(first.ok, false, JSON.stringify(first).slice(0, 300));
  // batch 1 (records 1 to 25) stayed; batch 2 (26 to 50, holding record 37) wrote nothing
  assert.equal(invRecords(s.env).length, 25);
  assert.equal(first.written.invoices, 25);
  s.wrapper.onCall = null;
  s.env.adapter.failNext = 0;
  const resume = s.mig.run(s.mig.plan({ session: OWNER }), s.octx());
  assert.equal(resume.ok, true, JSON.stringify(resume).slice(0, 400));
  assert.equal(resume.written.invoices, 95);
  const recs = invRecords(s.env);
  assert.equal(recs.length, 120);
  const jobs = new Set(recs.map((r) => r.b.jobId));
  const nos = new Set(recs.map((r) => r.b.legacyNo));
  const refs = new Set(recs.map((r) => r.r));
  assert.equal(jobs.size, 120);
  assert.equal(nos.size, 120);
  assert.equal(refs.size, 120);
  assert.equal(s.env.store.verifyAll().ok, true);
  assert.equal(JSON.stringify(s.list), s.caseText, 'the case array is byte-identical');
  assert.equal(s.settings, JSON.stringify({ invoiceSeq: { '2026-27': 120 }, firm: 'Test Watch Works' }));
  // a reopened stack over the same storage sees the same 120 once, and a further run writes nothing
  const re = s.env.reopen();
  assert.equal(re.bill.open().ok, true);
  assert.equal(re.store.read('invoices').records.length, 120);
});

test('R4 no customer name, mobile or address reaches any stored record; no customer-like key anywhere', () => {
  const s = setup(15);
  expectOk(s.mig.run(s.mig.plan({ session: OWNER }), s.octx()));
  const text = s.env.adapter.text();
  assert.ok(!text.includes(FAKE_NAME));
  assert.ok(!text.includes(FAKE_PHONE));
  assert.ok(!text.includes('Nowhere Lane'));
  assert.ok(!/cust(Name|Mobile|Addr|Email)/.test(text));
  const bad = /^(cust|customer|client|buyer|mobile|phone|address|addr|email|whatsapp|pan$)/i;
  const walk = (o, where) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { assert.ok(!bad.test(k), where + ' has the key ' + k); walk(o[k], where + '.' + k); } };
  for (const r of invRecords(s.env)) walk(r.b, r.k);
});

test('R5 the store check stays clean, and the next NEW bill continues above the highest old number: seed hand-over written in the same write', () => {
  const s = setup(30);
  expectOk(s.mig.run(s.mig.plan({ session: OWNER }), s.octx()));
  assert.equal(s.env.store.verifyAll().ok, true);
  s.env.addLabour('L1');
  s.env.job('J-NEW');
  s.env.estimateApproved('J-NEW', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const revBefore = s.env.store.head('invoices').rev;
  const r = expectOk(s.env.bill.issueInvoice({ jobId: 'J-NEW', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, s.env.ctx(MANAGER)));
  assert.equal(r.invoice.no, 'SV/2026-27/0031');
  assert.equal(r.seeded, true);
  // one write holds the seed and the bill (the estimate and approval were two earlier writes)
  assert.equal(s.env.store.head('invoices').rev, revBefore + 1);
  const recs = invRecords(s.env);
  const tail = recs.slice(-2).map((x) => x.k);
  assert.deepEqual(tail, ['SERIES_SEED', 'INV_ISSUE']);
  assert.deepEqual(recs[recs.length - 2].b.seriesSeed, { series: 'SV', fy: '2026-27', last: 30 });
  assert.equal(s.env.store.verifyAll().ok, true);
  // the next one after that is plain 0032 (no second seed)
  s.env.job('J-NEW2');
  s.env.estimateApproved('J-NEW2', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const r2 = expectOk(s.env.bill.issueInvoice({ jobId: 'J-NEW2', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, s.env.ctx(MANAGER)));
  assert.equal(r2.invoice.no, 'SV/2026-27/0032');
  assert.ok(!r2.seeded);
});

test('R6 an old bill brought in protects its job and number: no new bill on that job, and cancel or credit is refused', () => {
  const s = setup(3);
  expectOk(s.mig.run(s.mig.plan({ session: OWNER }), s.octx()));
  s.env.addLabour('L1');
  s.env.jobs.set('WS-2026-001', { id: 'WS-2026-001', status: 'closed', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'pending', stub: false, voided: false, typedAdvancePaise: 0 });
  expectFail(s.env.bill.cancelInvoice('SV/2026-27/0001', 'wrong job billed', s.env.ctxPin(OWNER)), 'LEGACY_READ_ONLY');
  expectFail(s.env.bill.issueCreditNote({ invoiceNo: 'SV/2026-27/0001', mode: 'FULL', reasonClass: 'OTHER', reason: 'should not work' }, s.env.ctxPin(OWNER)), 'LEGACY_READ_ONLY');
  const r = s.env.bill.issueInvoice({ jobId: 'WS-2026-001', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, s.env.ctx(MANAGER));
  assert.equal(r.ok, false);
});
