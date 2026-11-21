// Service wave 2, W-P1: the `share` hook of the Phase 1 core.
//   - share must be a function, else CORE_ARGS_INVALID (a value that is given is never ignored)
//   - share is called once, after docs is built, with a frozen {store, docs, ready, setBillingPort}
//   - docs gets a delegating billingPort only when share is given; without share the docs layer gets exactly
//     the five deps Phase 1 gave it, so behaviour is as before
//   - the port target can be set once; before it is set both port functions answer null (the docs layer refuses)
// Real store, FIFO, masters, docs and core. Invented data only. Figures by hand:
//   P-1: 3 pieces at 1000 paise, then 5 at 1200; issue 4 to the job = 3 x 1000 + 1 x 1200 = 4200; value left 4800;
//   full credit return of 4 pieces puts the value back to 3 x 1000 + 5 x 1200 = 9000.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Store, Fifo, Masters, Docs, MANAGER, partInput, makeAdapter } from './lib/svc1-docs-env.mjs';

const require = createRequire(import.meta.url);
const Core = require('../www/service-stores-core.js');
const JOB = 'WS-1';
const CN = 'SCN/26-27/0001';

function makeCore(extra = {}, record) {
  const adapter = makeAdapter();
  let ms = Date.parse('2026-11-13T05:00:00.000Z');
  const jobs = new Map([[JOB, { id: JOB, status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }]]);
  const docsLib = record
    ? Object.freeze({ create(deps) { record.push(deps); return Docs.create(deps); } })
    : Docs;
  const libs = { store: Store, fifo: Fifo, masters: Masters, docs: docsLib };
  const res = Core.create({ adapter, now: () => new Date(ms), cases: { get: (id) => (jobs.has(id) ? jobs.get(id) : null) }, libs, storeOptions: { watermark: false }, ...extra });
  return { res, adapter, jobs, tick: (n = 1000) => { ms += n; }, text: () => JSON.stringify(Array.from(adapter.data.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))) };
}
let refN = 0;
const ctx = (session = MANAGER) => { refN += 1; return { session, clientRef: 'p1e-core-' + refN }; };

test('share that is not a function is refused with CORE_ARGS_INVALID and names the field', () => {
  for (const bad of ['x', 5, {}, null, true, []]) {
    const { res } = makeCore({ share: bad });
    assert.equal(res.ok, false, String(bad));
    assert.equal(res.code, 'CORE_ARGS_INVALID');
    assert.equal(res.detail, 'share');
  }
  assert.equal(makeCore({ share: undefined }).res.ok, true, 'undefined means not given');
});

test('share is called once at create, with one frozen handle that has exactly store, docs, ready and setBillingPort', () => {
  const seen = [];
  const { res } = makeCore({ share: (h) => { seen.push(h); } });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(seen.length, 1);
  const h = seen[0];
  assert.deepEqual(Object.keys(h).sort(), ['docs', 'ready', 'setBillingPort', 'store']);
  assert.equal(Object.isFrozen(h), true);
  assert.throws(() => { h.store = null; }, TypeError);
  assert.throws(() => { h.extra = 1; }, TypeError);
  assert.equal(typeof h.store.append, 'function');
  assert.equal(typeof h.docs.counterSale, 'function');
  assert.equal(typeof h.ready, 'function');
  // using the core afterwards never calls share again
  res.core.status();
  res.core.reopen();
  assert.equal(seen.length, 1);
});

test('the handle is given after docs exists and before any open: ready() opens the store and answers {ok:true}', () => {
  let h = null;
  let opened = null;
  const { res } = makeCore({ share: (x) => { h = x; opened = x.docs.status ? x.docs.status() : null; } });
  assert.equal(res.ok, true);
  assert.equal(typeof h.docs.open, 'function');
  assert.notEqual(opened && opened.ok === true && opened.ready === true, true, 'not opened yet at hand-over');
  assert.deepEqual(h.ready(), { ok: true });
});

test('a share hook that throws makes create fail closed with CORE_INTERNAL', () => {
  const { res } = makeCore({ share: () => { throw new Error('boom'); } });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'CORE_INTERNAL');
});

test('without share the docs layer is created with exactly the five Phase 1 deps; with share it also gets a billing port', () => {
  const a = [];
  assert.equal(makeCore({}, a).res.ok, true);
  assert.equal(a.length, 1);
  assert.deepEqual(Object.keys(a[0]).sort(), ['cases', 'fifo', 'masters', 'now', 'store']);
  const b = [];
  assert.equal(makeCore({ share: () => {} }, b).res.ok, true);
  assert.equal(b.length, 1);
  assert.deepEqual(Object.keys(b[0]).sort(), ['billingPort', 'cases', 'fifo', 'masters', 'now', 'store']);
  assert.deepEqual(Object.keys(b[0].billingPort).sort(), ['creditReturn', 'saleReversible']);
  // before a target is set both answer null
  assert.equal(b[0].billingPort.creditReturn(JOB, CN, []), null);
  assert.equal(b[0].billingPort.saleReversible('CSL/26-27/0001'), null);
});

test('setBillingPort: a target without both functions is refused; the first good one is accepted; a second one is refused', () => {
  let h = null;
  assert.equal(makeCore({ share: (x) => { h = x; } }).res.ok, true);
  for (const bad of [null, undefined, 5, {}, { creditReturn() {} }, { saleReversible() {} }, { creditReturn: 1, saleReversible: 2 }]) {
    const r = h.setBillingPort(bad);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CORE_ARGS_INVALID');
    assert.equal(r.detail, 'billingPort');
  }
  const first = { creditReturn: () => ({ ok: true }), saleReversible: () => ({ ok: true }) };
  assert.deepEqual(h.setBillingPort(first), { ok: true });
  const second = h.setBillingPort({ creditReturn: () => ({ ok: false }), saleReversible: () => ({ ok: false }) });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'CORE_ARGS_INVALID');
});

// Full run through the core: parts, receipts, issue, invoice the job, then the credit return and the counter sale.
function stockedCore(opts = {}) {
  let h = null;
  const m = makeCore({ share: (x) => { h = x; } });
  assert.equal(m.res.ok, true, JSON.stringify(m.res));
  const core = m.res.core;
  assert.equal(core.savePart(partInput('P-1'), ctx()).ok, true);
  assert.equal(core.savePart(partInput('P-2', { flags: { counterSaleable: true } }), ctx()).ok, true);
  m.tick();
  const grn = (code, qty, cost, no) => {
    const r = core.receiveGoods({ supplierInvoiceNo: no, supplierInvoiceDate: '2026-11-10', lines: [{ partCode: code, qtyInvoiced: qty, qtyReceived: qty, unitCostPaise: cost }] }, ctx());
    assert.equal(r.ok, true, JSON.stringify(r));
    m.tick();
  };
  grn('P-1', 3, 1000, 'S-1');
  grn('P-1', 5, 1200, 'S-2');
  grn('P-2', 5, 500, 'S-3');
  const iss = core.issueToJob({ jobId: JOB, lines: [{ partCode: 'P-1', qty: 4 }] }, ctx());
  assert.equal(iss.ok, true, JSON.stringify(iss));
  m.tick();
  const sale = core.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 2, unitPricePaise: 900 }] }, ctx());
  assert.equal(sale.ok, true, JSON.stringify(sale));
  m.tick();
  m.jobs.set(JOB, { id: JOB, status: 'closed', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'pending', stub: false });
  return { ...m, core, h, issueId: iss.doc.mv[0].id, saleNo: sale.doc.no };
}
const valueOf = (h, code) => Fifo.partBalance(h.docs.fifoState(), code).valuePaise;

test('through the real core: before billing sets a target, a credit return and a counter-sale reversal are both refused; storage is untouched', () => {
  const s = stockedCore();
  const before = s.text();
  const r = s.core.returnFromJob({ jobId: JOB, creditNoteNo: CN, lines: [{ issueMovementId: s.issueId, qty: 4, returnReason: 'UNUSED' }] }, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'JOB_CLOSED');
  assert.equal(r.detail.port, 'NO_ANSWER');
  const v = s.core.reverseDoc(s.saleNo, 'sold the wrong part', ctx());
  assert.equal(v.ok, false);
  assert.equal(v.code, 'STATE_INVALID');
  assert.equal(v.detail.state, 'RECEIPT_LIVE');
  assert.equal(s.text(), before);
});

test('through the real core with a billing target that says ok: the credit return restores the original layers (value 4800 to 9000) and the sale reverses', () => {
  const s = stockedCore();
  const asked = [];
  const target = {
    creditReturn(jobId, cn, lines) { asked.push(['creditReturn', jobId, cn, lines]); return { ok: true }; },
    saleReversible(no) { asked.push(['saleReversible', no]); return { ok: true }; }
  };
  assert.deepEqual(s.h.setBillingPort(target), { ok: true });
  assert.equal(valueOf(s.h, 'P-1'), 4800);
  const r = s.core.returnFromJob({ jobId: JOB, creditNoteNo: CN, lines: [{ issueMovementId: s.issueId, qty: 4, returnReason: 'UNUSED' }] }, ctx());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(valueOf(s.h, 'P-1'), 9000);
  assert.deepEqual(asked[0], ['creditReturn', JOB, CN, [{ issueMovementId: s.issueId, qty: 4 }]]);
  const v = s.core.reverseDoc(s.saleNo, 'sold the wrong part', ctx());
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(Fifo.partBalance(s.h.docs.fifoState(), 'P-2').qty, 5);
  assert.deepEqual(asked[1], ['saleReversible', s.saleNo]);
});

test('through the real core with a target that says no: both stay refused, with the target\'s own code in the detail', () => {
  const s = stockedCore();
  s.h.setBillingPort({ creditReturn: () => ({ ok: false, code: 'CREDIT_RETURN_INVALID' }), saleReversible: () => ({ ok: false, code: 'RECEIPT_LIVE' }) });
  const before = s.text();
  const r = s.core.returnFromJob({ jobId: JOB, creditNoteNo: CN, lines: [{ issueMovementId: s.issueId, qty: 1, returnReason: 'UNUSED' }] }, ctx());
  assert.equal(r.code, 'JOB_CLOSED');
  assert.equal(r.detail.port, 'CREDIT_RETURN_INVALID');
  const v = s.core.reverseDoc(s.saleNo, 'sold the wrong part', ctx());
  assert.equal(v.code, 'STATE_INVALID');
  assert.equal(v.detail.port, 'RECEIPT_LIVE');
  assert.equal(s.text(), before);
});

test('the core without share behaves as Phase 1: a credit-note return on a closed job is JOB_CLOSED with no port, and a counter sale reverses freely', () => {
  const m = makeCore({});
  const core = m.res.core;
  core.savePart(partInput('P-1'), ctx());
  core.savePart(partInput('P-2', { flags: { counterSaleable: true } }), ctx());
  m.tick();
  core.receiveGoods({ supplierInvoiceNo: 'S-1', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-1', qtyInvoiced: 3, qtyReceived: 3, unitCostPaise: 1000 }] }, ctx());
  m.tick();
  core.receiveGoods({ supplierInvoiceNo: 'S-2', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-2', qtyInvoiced: 3, qtyReceived: 3, unitCostPaise: 500 }] }, ctx());
  m.tick();
  const iss = core.issueToJob({ jobId: JOB, lines: [{ partCode: 'P-1', qty: 2 }] }, ctx());
  m.tick();
  const sale = core.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 900 }] }, ctx());
  m.tick();
  m.jobs.set(JOB, { id: JOB, status: 'closed', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'pending', stub: false });
  const r = core.returnFromJob({ jobId: JOB, creditNoteNo: CN, lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, ctx());
  assert.equal(r.code, 'JOB_CLOSED');
  assert.equal(r.detail.port, 'NO_PORT');
  assert.equal(core.reverseDoc(sale.doc.no, 'sold the wrong part', ctx()).ok, true);
});

test('audit ruling: a sale posted through a core WITH share is marked rcptDue; a later core WITHOUT share over the same storage refuses to reverse it (NO_PORT)', () => {
  const s = stockedCore();
  const rec = s.h.store.read('ledger').records.filter((x) => x.k === 'CSL').pop();
  assert.equal(rec.b.rcptDue, true);
  let ms = Date.parse('2026-11-13T05:30:00.000Z');
  const res = Core.create({ adapter: s.adapter, now: () => new Date(ms), cases: { get: (id) => (s.jobs.has(id) ? s.jobs.get(id) : null) }, libs: { store: Store, fifo: Fifo, masters: Masters, docs: Docs }, storeOptions: { watermark: false } });
  assert.equal(res.ok, true, JSON.stringify(res));
  const before = s.text();
  const v = res.core.reverseDoc(s.saleNo, 'sold the wrong part', ctx());
  assert.equal(v.ok, false);
  assert.equal(v.code, 'STATE_INVALID');
  assert.equal(v.detail.state, 'RECEIPT_LIVE');
  assert.equal(v.detail.port, 'NO_PORT');
  assert.equal(s.text(), before);
});

test('audit ruling: a sale posted through a core WITHOUT share has no rcptDue key', () => {
  const m = makeCore({});
  const core = m.res.core;
  core.savePart(partInput('P-2', { flags: { counterSaleable: true } }), ctx());
  m.tick();
  core.receiveGoods({ supplierInvoiceNo: 'S-9', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P-2', qtyInvoiced: 3, qtyReceived: 3, unitCostPaise: 500 }] }, ctx());
  m.tick();
  const sale = core.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 900 }] }, ctx());
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const all = JSON.parse(m.adapter.data.get(Array.from(m.adapter.data.keys()).find((k) => /ledger/.test(k) && m.adapter.data.get(k).indexOf('"CSL"') >= 0)));
  const csl = all.filter((x) => x.k === 'CSL').pop();
  assert.ok(csl, 'the sale record is in storage');
  assert.equal(Object.prototype.hasOwnProperty.call(csl.b, 'rcptDue'), false);
});

test('the core still never exposes the store or the docs layer on its own surface', () => {
  const { res } = makeCore({ share: () => {} });
  for (const k of ['store', 'docs', 'share', 'setBillingPort', 'billingPort', 'ready']) assert.equal(k in res.core, false, k);
});
