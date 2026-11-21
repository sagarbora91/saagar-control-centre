// Service wave 2, W-P1: the three small edits to the Phase 1 docs layer.
//   1. a new counter sale carries rcptDue:true only when a billing port is wired in (old ones and port-less ones never do)
//      and a sale with rcptDue:true is never reversed when no port is present (audit ruling, fail closed)
//   2. a return that carries a credit note number is accepted on an invoiced or closed job ONLY when the
//      billing port says ok; the original FIFO cost layers come back
//   3. a counter sale with rcptDue:true is reversed only when the billing port says ok
// Real store, real FIFO, real masters, real docs. Invented data only. Expected figures are typed by hand.
// FIFO worked by hand (part P-1):
//   receipt A: 3 pieces at 1000 paise      receipt B: 5 pieces at 1200 paise
//   issue 4 pieces to the job: 3 x 1000 + 1 x 1200 = 4200 paise; layer A is empty, layer B holds 4
//   stock value after the issue = 4 x 1200 = 4800
//   return 4 pieces (credit note): layers come back newest first: 1 x 1200 into B, then 3 x 1000 into A
//   = 4200 paise, stock value = 3 x 1000 + 5 x 1200 = 9000 (the same as before the issue)
//   return 2 pieces first: 1 x 1200 into B and 1 x 1000 into A = 2200; value = 1 x 1000 + 5 x 1200 = 7000
//   then the other 2 pieces: 2 x 1000 into A = 2000; value = 3 x 1000 + 5 x 1200 = 9000
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  Store, Fifo, Masters, Docs, OWNER, MANAGER, makeClock, makeAdapter, partInput, expectFail, expectOk
} from './lib/svc1-docs-env.mjs';

const require = createRequire(import.meta.url);
const CN = 'SCN/26-27/0001';
const JOB = 'WS-1';

function kit(opts = {}) {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = opts.adapter || makeAdapter();
  const created = Store.createStore(adapter, { now: clock.now });
  assert.equal(created.ok, true, JSON.stringify(created));
  const store = created.store;
  const jobs = new Map([[JOB, { id: JOB, status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }]]);
  const cases = { get: (id) => (jobs.has(id) ? jobs.get(id) : null) };
  const deps = { store, fifo: Fifo, masters: Masters, now: clock.now, cases };
  if ('port' in opts) deps.billingPort = opts.port;
  const docsLib = opts.docsLib || Docs;
  const docs = docsLib.create(deps);
  assert.equal(docs.ok, true, JSON.stringify(docs));
  let n = 0;
  const k = {
    clock, adapter, store, jobs, docs,
    ctx(session, extra = {}) { n += 1; return { session, stepUp: undefined, clientRef: 'p1e-' + n.toString(36) + '-' + n, ...extra }; },
    ctxPin(session) { return k.ctx(session, { stepUp: { ok: true, at: clock.ms() } }); },
    addPart(code, extra = {}) {
      n += 1;
      const r = Masters.createRow(store, { session: MANAGER, stepUp: undefined, clientRef: 'p1e-m' + n, now: clock.now }, 'part', partInput(code, extra));
      assert.equal(r.ok, true, JSON.stringify(r));
    },
    grn(partCode, qty, cost) {
      n += 1;
      return expectOk(docs.receiveGoods({
        supplierInvoiceNo: 'SUP-' + n, supplierInvoiceDate: '2026-11-10', lines: [{ partCode, qtyInvoiced: qty, qtyReceived: qty, unitCostPaise: cost }]
      }, k.ctx(MANAGER)));
    },
    issue(partCode, qty) { return expectOk(docs.issueToJob({ jobId: JOB, lines: [{ partCode, qty }] }, k.ctx(MANAGER))); },
    // a counter sale needs a saleable part
    sale(partCode, qty, price) {
      return expectOk(docs.counterSale({ payMode: 'CASH', lines: [{ partCode, qty, unitPricePaise: price }] }, k.ctx(MANAGER)));
    },
    invoiceTheJob() { jobs.set(JOB, { id: JOB, status: 'closed', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'pending', stub: false }); },
    value(code) { return Fifo.partBalance(docs.fifoState(), code).valuePaise; },
    onHand(code) { return Fifo.partBalance(docs.fifoState(), code).qty; },
    text() { return JSON.stringify(Array.from(adapter.data.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))); }
  };
  return k;
}

// A port that records what it was asked and answers as told.
function makePort(answer) {
  const calls = [];
  const port = {
    calls,
    creditReturn(jobId, cn, lines) { calls.push(['creditReturn', jobId, cn, JSON.parse(JSON.stringify(lines))]); return typeof answer === 'function' ? answer('creditReturn') : answer; },
    saleReversible(no) { calls.push(['saleReversible', no]); return typeof answer === 'function' ? answer('saleReversible') : answer; }
  };
  return port;
}

// Stock set up as in the header: A 3 @ 1000, B 5 @ 1200, 4 issued to the open job, job then invoiced and closed.
function stocked(opts = {}) {
  const k = kit(opts);
  k.addPart('P-1');
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-1', 3, 1000);
  k.clock.advance(1000);
  k.grn('P-1', 5, 1200);
  k.clock.advance(1000);
  const iss = k.issue('P-1', 4);
  k.issueId = iss.doc.mv[0].id;
  k.invoiceTheJob();
  k.clock.advance(1000);
  return k;
}
const retInput = (k, qty, extra = {}) => ({ jobId: JOB, creditNoteNo: CN, lines: [{ issueMovementId: k.issueId, qty, returnReason: 'UNUSED' }], ...extra });

test('hand figures before any return: issue costs 4200 paise, stock value is 4800, 4 pieces are left', () => {
  const k = stocked({ port: makePort({ ok: true }) });
  assert.equal(k.onHand('P-1'), 4);
  assert.equal(k.value('P-1'), 4800);
});

test('credit return: refused with JOB_CLOSED when the docs layer has no billing port, storage untouched', () => {
  const k = stocked();
  const before = k.text();
  const r = expectFail(k.docs.returnFromJob(retInput(k, 4), k.ctx(MANAGER)), 'JOB_CLOSED');
  assert.equal(r.detail.port, 'NO_PORT');
  assert.equal(k.text(), before);
});

test('return without a credit note on an invoiced or closed job is refused exactly as in Phase 1, even with a port that says ok', () => {
  const port = makePort({ ok: true });
  const k = stocked({ port });
  const before = k.text();
  const r = expectFail(k.docs.returnFromJob({ jobId: JOB, lines: [{ issueMovementId: k.issueId, qty: 1, returnReason: 'UNUSED' }] }, k.ctx(MANAGER)), 'JOB_CLOSED');
  assert.deepEqual(r.detail, { jobId: JOB });
  assert.equal(k.text(), before);
  assert.equal(port.calls.length, 0, 'the port is not asked about an ordinary return');
});

test('credit return: refused with JOB_CLOSED when the port says no, answers nothing, answers a non-object or throws', () => {
  const answers = [
    [{ ok: false, code: 'CREDIT_RETURN_INVALID' }, 'CREDIT_RETURN_INVALID'],
    [{ ok: false }, 'NO_ANSWER'],
    [null, 'NO_ANSWER'],
    ['yes', 'NO_ANSWER'],
    [{ ok: 'true' }, 'NO_ANSWER'],
    [{ ok: 1 }, 'NO_ANSWER']
  ];
  for (const [answer, why] of answers) {
    const k = stocked({ port: makePort(answer) });
    const before = k.text();
    const r = expectFail(k.docs.returnFromJob(retInput(k, 4), k.ctx(MANAGER)), 'JOB_CLOSED');
    assert.equal(r.detail.port, why, JSON.stringify(answer));
    assert.equal(k.text(), before, 'a refusal writes nothing');
  }
  const thrower = { creditReturn() { throw new Error('boom'); }, saleReversible() { return { ok: true }; } };
  const k2 = stocked({ port: thrower });
  const before2 = k2.text();
  expectFail(k2.docs.returnFromJob(retInput(k2, 4), k2.ctx(MANAGER)), 'JOB_CLOSED');
  assert.equal(k2.text(), before2);
});

test('credit return, full: accepted when the port says ok; the port is asked with job, credit note and plain line copies; RET body carries the credit note; FIFO restores the original layers (4200 paise, value 9000)', () => {
  const port = makePort({ ok: true });
  const k = stocked({ port });
  const r = expectOk(k.docs.returnFromJob(retInput(k, 4, { note: 'credit note stock' }), k.ctx(MANAGER)));
  assert.deepEqual(port.calls, [['creditReturn', JOB, CN, [{ issueMovementId: k.issueId, qty: 4 }]]]);
  assert.equal(r.doc.kind, 'RET');
  assert.equal(r.doc.jobId, JOB);
  const rec = k.store.read('ledger').records.filter((x) => x.k === 'RET').pop();
  assert.equal(rec.b.creditNoteNo, CN);
  assert.equal(rec.b.jobId, JOB);
  assert.equal(rec.b.mv.length, 1);
  assert.equal(rec.b.mv[0].valuePaise, 4200);
  assert.equal(k.onHand('P-1'), 8);
  assert.equal(k.value('P-1'), 9000);
  // newest layer first: 1 piece at 1200, then 3 at 1000
  assert.deepEqual(rec.b.mv[0].layers.map((l) => [l.qty, l.unitCostPaise]), [[1, 1200], [3, 1000]]);
  // a restart sees the same stock
  const again = Docs.create({ store: Store.createStore(k.adapter, { now: k.clock.now }).store, fifo: Fifo, masters: Masters, now: k.clock.now, cases: { get: (id) => k.jobs.get(id) || null } });
  assert.equal(again.open().ok, true);
  assert.equal(Fifo.partBalance(again.fifoState(), 'P-1').valuePaise, 9000);
});

test('credit return, in two steps: 2 pieces (2200 paise, value 7000) then 2 pieces (2000 paise, value 9000); a third return is refused by FIFO', () => {
  const port = makePort({ ok: true });
  const k = stocked({ port });
  const a = expectOk(k.docs.returnFromJob(retInput(k, 2), k.ctx(MANAGER)));
  assert.equal(k.store.read('ledger').records.filter((x) => x.k === 'RET')[0].b.mv[0].valuePaise, 2200);
  assert.equal(a.doc.kind, 'RET');
  assert.equal(k.value('P-1'), 7000);
  assert.equal(k.onHand('P-1'), 6);
  k.clock.advance(1000);
  expectOk(k.docs.returnFromJob(retInput(k, 2), k.ctx(MANAGER)));
  assert.equal(k.store.read('ledger').records.filter((x) => x.k === 'RET')[1].b.mv[0].valuePaise, 2000);
  assert.equal(k.value('P-1'), 9000);
  assert.equal(k.onHand('P-1'), 8);
  const before = k.text();
  k.clock.advance(1000);
  expectFail(k.docs.returnFromJob(retInput(k, 1), k.ctx(MANAGER)), 'RETURN_EXCEEDS_ISSUE');
  assert.equal(k.text(), before, 'nothing written when FIFO refuses');
});

test('credit return: the port saying ok does not skip the Phase 1 line checks (more than issued, wrong job, unknown line, bad reason)', () => {
  const k = stocked({ port: makePort({ ok: true }) });
  k.jobs.set('WS-2', { id: 'WS-2', status: 'closed', invoiceNo: 'SV/2026-27/0002', paymentStatus: 'pending', stub: false });
  const before = k.text();
  expectFail(k.docs.returnFromJob(retInput(k, 5), k.ctx(MANAGER)), 'RETURN_EXCEEDS_ISSUE');
  expectFail(k.docs.returnFromJob(retInput(k, 1, { jobId: 'WS-2' }), k.ctx(MANAGER)), 'ISSUE_LINE_NOT_FOUND');
  expectFail(k.docs.returnFromJob({ jobId: JOB, creditNoteNo: CN, lines: [{ issueMovementId: 'nope', qty: 1, returnReason: 'UNUSED' }] }, k.ctx(MANAGER)), 'ISSUE_LINE_NOT_FOUND');
  expectFail(k.docs.returnFromJob(retInput(k, 1, { lines: [{ issueMovementId: k.issueId, qty: 1, returnReason: 'BROKEN' }] }), k.ctx(MANAGER)), 'RETURN_REASON_INVALID');
  expectFail(k.docs.returnFromJob(retInput(k, 1, { jobId: 'WS-404' }), k.ctx(MANAGER)), 'JOB_NOT_FOUND');
  assert.equal(k.text(), before);
});

test('credit return: a bad credit note number is INPUT_INVALID; null counts as not given; the role rule is the Phase 1 RETURN rule', () => {
  const port = makePort({ ok: true });
  const k = stocked({ port });
  const before = k.text();
  for (const bad of ['', 'scn/26-27/0001', 'SV/2026-27/0001', 'SCN/2026-27/0001', 'SCN/26-27/', 7, {}, ['SCN/26-27/0001']]) {
    const r = expectFail(k.docs.returnFromJob(retInput(k, 1, { creditNoteNo: bad }), k.ctx(MANAGER)), 'INPUT_INVALID');
    assert.equal(r.detail.field, 'creditNoteNo');
  }
  assert.equal(k.text(), before);
  assert.equal(port.calls.length, 0);
  expectFail(k.docs.returnFromJob(retInput(k, 1, { creditNoteNo: null }), k.ctx(MANAGER)), 'JOB_CLOSED');
  // a staff member who is not store-class is refused before the port is asked
  const staff = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Cashier' });
  expectFail(k.docs.returnFromJob(retInput(k, 1), k.ctx(staff)), 'NOT_ALLOWED');
  assert.equal(port.calls.length, 0);
  // the Owner is accepted without a PIN (the credit note already had one)
  expectOk(k.docs.returnFromJob(retInput(k, 1), k.ctx(OWNER)));
});

test('a normal return on an open job is unchanged: no creditNoteNo key in the record, port not asked', () => {
  const port = makePort({ ok: true });
  const k = kit({ port });
  k.addPart('P-1');
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-1', 3, 1000);
  k.clock.advance(1000);
  const iss = k.issue('P-1', 2);
  k.clock.advance(1000);
  expectOk(k.docs.returnFromJob({ jobId: JOB, lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, k.ctx(MANAGER)));
  const rec = k.store.read('ledger').records.filter((x) => x.k === 'RET').pop();
  assert.equal(Object.prototype.hasOwnProperty.call(rec.b, 'creditNoteNo'), false);
  assert.deepEqual(Object.keys(rec.b).sort(), ['docDate', 'jobId', 'lines', 'mv', 'no', 'note']);
  assert.equal(port.calls.length, 0);
});

test('replayed credit return (same clientRef) returns the first answer and writes nothing', () => {
  const k = stocked({ port: makePort({ ok: true }) });
  const ctx = k.ctx(MANAGER, { clientRef: 'p1e-same-ref' });
  const a = expectOk(k.docs.returnFromJob(retInput(k, 2), ctx));
  const before = k.text();
  const b = expectOk(k.docs.returnFromJob(retInput(k, 2), ctx));
  assert.equal(b.replayed, true);
  assert.equal(b.doc.no, a.doc.no);
  assert.equal(k.text(), before);
});

test('counter sale with a billing port: the sale carries rcptDue:true and moneyPosted:false, and keeps every other Phase 1 key', () => {
  const k = kit({ port: makePort({ ok: true }) });
  k.addPart('P-2', { flags: { counterSaleable: true } });
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-2', 5, 500);
  k.clock.advance(1000);
  const s = k.sale('P-2', 2, 900);
  const rec = k.store.read('ledger').records.filter((x) => x.k === 'CSL').pop();
  assert.equal(rec.b.rcptDue, true);
  assert.equal(rec.b.moneyPosted, false);
  assert.equal(rec.b.amountPaise, 1800);
  assert.deepEqual(Object.keys(rec.b).sort(), ['amountPaise', 'ccptInvoiceNo', 'docDate', 'lines', 'moneyPosted', 'mv', 'no', 'note', 'payMode', 'rcptDue']);
  assert.equal(s.doc.kind, 'CSL');
});

test('counter sale without a billing port (audit ruling): no rcptDue key, exactly the Phase 1 body keys', () => {
  const k = kit();
  k.addPart('P-2', { flags: { counterSaleable: true } });
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-2', 5, 500);
  k.clock.advance(1000);
  k.sale('P-2', 2, 900);
  const rec = k.store.read('ledger').records.filter((x) => x.k === 'CSL').pop();
  assert.equal(Object.prototype.hasOwnProperty.call(rec.b, 'rcptDue'), false);
  assert.deepEqual(Object.keys(rec.b).sort(), ['amountPaise', 'ccptInvoiceNo', 'docDate', 'lines', 'moneyPosted', 'mv', 'no', 'note', 'payMode']);
});

test('fail closed (audit ruling): a sale marked rcptDue, reopened by a docs layer with NO billing port, is refused STATE_INVALID with port NO_PORT; storage untouched', () => {
  const adapter = makeAdapter();
  const k1 = kit({ adapter, port: makePort({ ok: true }) });
  k1.addPart('P-2', { flags: { counterSaleable: true } });
  k1.docs.open();
  k1.clock.advance(1000);
  k1.grn('P-2', 5, 500);
  k1.clock.advance(1000);
  const s = k1.sale('P-2', 2, 900);
  const k2 = kit({ adapter });
  k2.clock.set('2026-11-13T05:10:00.000Z');
  assert.equal(k2.docs.open().ok, true);
  const before = k2.text();
  for (const who of [MANAGER, OWNER]) {
    const ctx = who === OWNER ? k2.ctxPin(OWNER) : k2.ctx(MANAGER);
    const r = expectFail(k2.docs.reverseDoc(s.doc.no, 'sold the wrong part', ctx), 'STATE_INVALID');
    assert.deepEqual(r.detail, { state: 'RECEIPT_LIVE', port: 'NO_PORT' });
  }
  assert.equal(k2.text(), before);
  assert.equal(k2.onHand('P-2'), 3);
});

test('counter sale reversal with a port: refused with STATE_INVALID (RECEIPT_LIVE) unless the port says ok; the stock stays sold', () => {
  const answers = [[{ ok: false, code: 'RECEIPT_LIVE' }, 'RECEIPT_LIVE'], [null, 'NO_ANSWER'], [{ ok: false }, 'NO_ANSWER'], [{ ok: 'yes' }, 'NO_ANSWER']];
  for (const [answer, why] of answers) {
    const port = makePort(answer);
    const k = kit({ port });
    k.addPart('P-2', { flags: { counterSaleable: true } });
    k.docs.open();
    k.clock.advance(1000);
    k.grn('P-2', 5, 500);
    k.clock.advance(1000);
    const s = k.sale('P-2', 2, 900);
    const before = k.text();
    const r = expectFail(k.docs.reverseDoc(s.doc.no, 'sold the wrong part', k.ctx(MANAGER)), 'STATE_INVALID');
    assert.equal(r.detail.state, 'RECEIPT_LIVE');
    assert.equal(r.detail.port, why);
    assert.deepEqual(port.calls, [['saleReversible', s.doc.no]]);
    assert.equal(k.text(), before);
    assert.equal(k.onHand('P-2'), 3);
  }
  const thrower = { creditReturn() { return { ok: true }; }, saleReversible() { throw new Error('boom'); } };
  const k2 = kit({ port: thrower });
  k2.addPart('P-2', { flags: { counterSaleable: true } });
  k2.docs.open();
  k2.clock.advance(1000);
  k2.grn('P-2', 5, 500);
  k2.clock.advance(1000);
  const s2 = k2.sale('P-2', 1, 900);
  const before2 = k2.text();
  expectFail(k2.docs.reverseDoc(s2.doc.no, 'sold the wrong part', k2.ctx(MANAGER)), 'STATE_INVALID');
  assert.equal(k2.text(), before2);
});

test('counter sale reversal with a port that says ok: reversed as in Phase 1 (stock back, value restored)', () => {
  const port = makePort({ ok: true });
  const k = kit({ port });
  k.addPart('P-2', { flags: { counterSaleable: true } });
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-2', 5, 500);
  k.clock.advance(1000);
  const s = k.sale('P-2', 2, 900);
  assert.equal(k.value('P-2'), 1500);
  const r = expectOk(k.docs.reverseDoc(s.doc.no, 'sold the wrong part', k.ctx(MANAGER)));
  assert.equal(r.reversed, s.doc.no);
  assert.equal(k.onHand('P-2'), 5);
  assert.equal(k.value('P-2'), 2500);
  assert.deepEqual(port.calls, [['saleReversible', s.doc.no]]);
});

test('the guard comes after the role check: a cashier is refused NOT_ALLOWED without the port being asked', () => {
  const port = makePort({ ok: true });
  const k = kit({ port });
  k.addPart('P-2', { flags: { counterSaleable: true } });
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-2', 5, 500);
  k.clock.advance(1000);
  const s = k.sale('P-2', 1, 900);
  const cashier = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Cashier' });
  expectFail(k.docs.reverseDoc(s.doc.no, 'sold the wrong part', k.ctx(cashier)), 'NOT_ALLOWED');
  assert.equal(port.calls.length, 0);
});

test('without a billing port dep, a new counter sale reverses exactly as in Phase 1 (nothing is asked)', () => {
  const k = kit();
  k.addPart('P-2', { flags: { counterSaleable: true } });
  k.docs.open();
  k.clock.advance(1000);
  k.grn('P-2', 5, 500);
  k.clock.advance(1000);
  const s = k.sale('P-2', 2, 900);
  expectOk(k.docs.reverseDoc(s.doc.no, 'sold the wrong part', k.ctx(MANAGER)));
  assert.equal(k.onHand('P-2'), 5);
});

test('an old Phase 1 counter sale (made by the build at 031841f, no rcptDue) is unchanged and reverses even when the port refuses everything', () => {
  let oldDocs;
  try {
    const src = execFileSync('git', ['show', '031841f:www/service-stores-docs.js'], { cwd: path.resolve(process.cwd()), maxBuffer: 16 * 1024 * 1024 }).toString('utf8');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc2-p1edit-'));
    const file = path.join(dir, 'old-docs.cjs');
    fs.writeFileSync(file, src);
    oldDocs = require(file);
  } catch (e) {
    assert.fail('could not load the Phase 1 docs build from git (commit 031841f): ' + e.message);
  }
  const adapter = makeAdapter();
  const k1 = kit({ adapter, docsLib: oldDocs });
  k1.addPart('P-2', { flags: { counterSaleable: true } });
  k1.docs.open();
  k1.clock.advance(1000);
  k1.grn('P-2', 5, 500);
  k1.clock.advance(1000);
  const s = k1.sale('P-2', 2, 900);
  const oldRec = k1.store.read('ledger').records.filter((x) => x.k === 'CSL').pop();
  assert.equal(Object.prototype.hasOwnProperty.call(oldRec.b, 'rcptDue'), false);
  // the new build over the same storage, with a port that refuses everything
  const port = makePort({ ok: false, code: 'NOPE' });
  const k2 = kit({ adapter, port });
  k2.clock.set('2026-11-13T05:10:00.000Z');
  assert.equal(k2.docs.open().ok, true);
  assert.equal(k2.onHand('P-2'), 3);
  expectOk(k2.docs.reverseDoc(s.doc.no, 'sold the wrong part', k2.ctx(MANAGER)));
  assert.equal(port.calls.length, 0, 'an old sale is never asked about');
  assert.equal(k2.onHand('P-2'), 5);
});

test('deps: a billing port that is not an object with the two functions is DEPS_INVALID; none, undefined and null are fine', () => {
  const base = () => {
    const clock = makeClock();
    const store = Store.createStore(makeAdapter(), { now: clock.now }).store;
    return { store, fifo: Fifo, masters: Masters, now: clock.now, cases: { get: () => null } };
  };
  for (const bad of [{}, { creditReturn() {} }, { saleReversible() {} }, 'port', 5, () => ({}), { creditReturn: 1, saleReversible: 2 }]) {
    const r = Docs.create({ ...base(), billingPort: bad });
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.code, 'DEPS_INVALID');
    assert.equal(r.detail, 'billingPort');
  }
  assert.equal(Docs.create(base()).ok, true);
  assert.equal(Docs.create({ ...base(), billingPort: undefined }).ok, true);
  assert.equal(Docs.create({ ...base(), billingPort: null }).ok, true);
  assert.equal(Docs.create({ ...base(), billingPort: makePort({ ok: true }) }).ok, true);
});

test('the exported surface of the docs file is unchanged: same CODES, same 28 ACTIONS, no new export', () => {
  assert.deepEqual(Object.keys(Docs).sort(), ['ACTIONS', 'ADJ_REASONS', 'BILLING_MODES', 'CODES', 'KINDS', 'MESSAGES', 'OLD_STATES', 'PAY_MODES', 'RETURN_REASONS', 'SHELL_ROLES', 'STATES', 'create', 'financialYear', 'version']);
  assert.equal(Object.keys(Docs.ACTIONS).length, 28);
});
