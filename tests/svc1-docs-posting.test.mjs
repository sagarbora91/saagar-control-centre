// Service Stores docs layer: goods receipt, issue, return, counter sale, numbering, FIFO layers, time.
// Real store, real FIFO, real masters. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Docs, Fifo, Store, Masters, makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, KEEPER, CASHIER
} from './lib/svc1-docs-env.mjs';

const D = Docs;

function ledgerRecords(env) {
  const r = env.store.read('ledger');
  assert.equal(r.ok, true);
  return r.records;
}
const stdLine = (partCode, extra = {}) => ({ partCode, qtyReceived: 10, unitCostPaise: 1000, ...extra });

test('financialYear: April to March, India date, bad input gives empty text', () => {
  assert.equal(D.financialYear('2026-04-01'), '2026-27');
  assert.equal(D.financialYear('2027-03-31'), '2026-27');
  assert.equal(D.financialYear('2027-04-01'), '2027-28');
  assert.equal(D.financialYear('2026-11-14'), '2026-27');
  assert.equal(D.financialYear('2099-12-31'), '2099-00');
  assert.equal(D.financialYear('abc'), '');
  assert.equal(D.financialYear('2026-02-30'), '');
  assert.equal(D.financialYear(''), '');
  assert.equal(D.financialYear(null), '');
  assert.equal(D.financialYear(20260401), '');
  // an instant is read as its India date (UTC+05:30)
  assert.equal(D.financialYear('2027-03-31T18:29:59.000Z'), '2026-27');
  assert.equal(D.financialYear('2027-03-31T18:30:00.000Z'), '2027-28');
});

test('create: refuses missing or wrong dependencies with DEPS_INVALID', () => {
  const env = makeEnv();
  const good = { store: env.store, fifo: Fifo, masters: Masters, now: env.clock.now, cases: env.cases };
  for (const bad of [
    null, undefined, 5, {}, { ...good, store: null }, { ...good, store: {} }, { ...good, fifo: {} }, { ...good, fifo: null },
    { ...good, masters: {} }, { ...good, now: 'x' }, { ...good, cases: {} }, { ...good, cases: null }
  ]) {
    const r = D.create(bad);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'DEPS_INVALID');
    assert.equal(typeof r.message, 'string');
  }
  // the store may be given as the createStore result as well
  const wrapped = Store.createStore(env.adapter, { now: env.clock.now });
  assert.equal(D.create({ ...good, store: wrapped }).ok, true);
});

test('open on an empty store: clean, nothing blocked, status has zero counts', () => {
  const env = makeEnv({ parts: ['P-1'] });
  const o = env.open();
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
  const s = env.docs.status();
  assert.equal(s.opened, true);
  assert.equal(s.blocked, false);
  assert.equal(s.lastSeq, 0);
  assert.equal(s.counts.movements, 0);
  assert.deepEqual(env.docs.config().storeRoles, []);
  assert.equal(env.docs.config().adjustLimitPaise, 0);
});

test('GRN: one ledger record, one movement per line, numbered, FIFO layer per line', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  const before = ledgerRecords(env).length;
  const r = expectOk(env.docs.receiveGoods({
    supplierInvoiceNo: 'INV/77', supplierInvoiceDate: '2026-11-10', note: 'box 1',
    lines: [{ partCode: 'p-1', qtyInvoiced: 12, qtyReceived: 10, unitCostPaise: 1000 }, { partCode: 'P-2', qtyReceived: 5, unitCostPaise: 2500 }]
  }, env.ctx(MANAGER)));
  const recs = ledgerRecords(env);
  assert.equal(recs.length, before + 1, 'exactly one record for the whole document');
  const rec = recs[recs.length - 1];
  assert.equal(rec.k, 'GRN');
  assert.equal(rec.b.no, 'GRN/26-27/0001');
  assert.equal(r.doc.no, 'GRN/26-27/0001');
  assert.equal(r.doc.state, 'POSTED');
  assert.equal(rec.b.supplierName, 'Titan');
  assert.equal(rec.b.supplierInvoiceNo, 'INV/77');
  assert.equal(rec.b.supplierInvoiceDate, '2026-11-10');
  assert.equal(rec.b.docDate, '2026-11-13');
  assert.equal(rec.b.note, 'box 1');
  assert.deepEqual(rec.b.lines[0], { partCode: 'P-1', qtyInvoiced: 12, qtyReceived: 10, qtyShort: 2, unitCostPaise: 1000 });
  assert.deepEqual(rec.b.lines[1], { partCode: 'P-2', qtyInvoiced: null, qtyReceived: 5, qtyShort: 0, unitCostPaise: 2500 });
  assert.equal(rec.b.mv.length, 2);
  rec.b.mv.forEach((m, i) => {
    assert.equal(m.type, 'receipt');
    assert.equal(m.ref.grnNo, rec.b.no);
    assert.equal(m.ref.lineNo, i + 1);
    assert.equal(m.at, rec.at, 'every movement shares the record time');
  });
  assert.equal(rec.b.mv[0].valuePaise, 10000);
  assert.equal(rec.b.mv[1].valuePaise, 12500);
  assert.equal(env.onHand('P-1'), 10);
  assert.equal(env.value('P-2'), 12500);
  assert.equal(rec.a.t, 'manager');
  assert.equal(rec.a.m, 'Test Manager');
});

test('numbering: own serial per kind, next serial is 0002, nothing skips', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  const a = env.grn([stdLine('P-1')]);
  const b = env.grn([stdLine('P-2')]);
  assert.equal(a.doc.no, 'GRN/26-27/0001');
  assert.equal(b.doc.no, 'GRN/26-27/0002');
  const i = env.issue('WS-1', [{ partCode: 'P-1', qty: 1 }]);
  assert.equal(i.doc.no, 'ISS/26-27/0001');
  const op = env.docs.proposeOpening({ lines: [{ partCode: 'P-1', qty: 1, unitCostPaise: 5 }], note: '' }, env.ctx(MANAGER));
  assert.equal(op.ok, false, 'P-1 has movements, opening refused, and the OPN serial did not move');
  assert.equal(env.grn([stdLine('P-1')]).doc.no, 'GRN/26-27/0003');
});

test('numbering: serial restarts on 1 April in a new shard; 23:59:59 and 00:00:00 India time land apart', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2027-03-31T18:29:50.000Z' });
  const a = env.grn([stdLine('P-1')]);
  assert.equal(a.doc.no, 'GRN/26-27/0001');
  assert.equal(a.doc.docDate, '2027-03-31');
  env.clock.set('2027-03-31T18:30:00.000Z');
  const b = env.grn([stdLine('P-1')]);
  assert.equal(b.doc.no, 'GRN/27-28/0001');
  assert.equal(b.doc.docDate, '2027-04-01');
  const keys = env.adapter.keys().filter((k) => /ledger/.test(k)).sort();
  assert.deepEqual(keys, ['saagar_svcs_ledger_v1_2027-03', 'saagar_svcs_ledger_v1_2027-04']);
  assert.equal(env.docs.listDocs({ fy: '2026-27' }).docs.length, 1);
  assert.equal(env.docs.listDocs({ fy: 'FY2027-28' }).docs.length, 1);
  assert.equal(env.docs.listDocs({ fy: '27-28' }).docs.length, 1);
  assert.equal(env.docs.listDocs({ fy: 'bad' }).code, 'INPUT_INVALID');
});

test('document date is the India date of the record time', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-11-13T20:00:00.000Z' });
  const r = env.grn([stdLine('P-1')]);
  assert.equal(r.doc.docDate, '2026-11-14');
});

test('GRN: refusals, every code, nothing written', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2', 'P-3', 'P-4', 'P-5'] });
  env.clock.advance(1000);
  const base = () => ({ supplierInvoiceNo: 'A-1', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] });
  const call = (patch, session = MANAGER) => unchanged(env, () => env.docs.receiveGoods({ ...base(), ...patch }, env.ctx(session)));
  expectFail(call({ supplierInvoiceNo: '' }), 'SUPPLIER_INVOICE_REQUIRED');
  expectFail(call({ supplierInvoiceNo: undefined }), 'SUPPLIER_INVOICE_REQUIRED');
  expectFail(call({ supplierInvoiceNo: '---' }), 'SUPPLIER_INVOICE_REQUIRED');
  expectFail(call({ supplierInvoiceNo: 'x'.repeat(41) }), 'SUPPLIER_INVOICE_REQUIRED');
  expectFail(call({ supplierInvoiceDate: '2026-11-14' }), 'SUPPLIER_INVOICE_DATE_INVALID');
  expectFail(call({ supplierInvoiceDate: '2019-12-31' }), 'SUPPLIER_INVOICE_DATE_INVALID');
  expectFail(call({ supplierInvoiceDate: '2026-02-30' }), 'SUPPLIER_INVOICE_DATE_INVALID');
  expectFail(call({ supplierInvoiceDate: '10/11/2026' }), 'SUPPLIER_INVOICE_DATE_INVALID');
  expectFail(call({ supplierInvoiceDate: undefined }), 'SUPPLIER_INVOICE_DATE_INVALID');
  expectFail(call({ supplierName: 'y'.repeat(61) }), 'INPUT_INVALID');
  expectFail(call({ note: 'n'.repeat(201) }), 'INPUT_INVALID');
  expectFail(call({ note: 5 }), 'INPUT_INVALID');
  expectFail(call({ docDate: '2026-11-12' }), 'BACKDATE_NOT_ALLOWED');
  expectFail(call({ lines: [] }), 'LINES_REQUIRED');
  expectFail(call({ lines: undefined }), 'LINES_REQUIRED');
  expectFail(call({ lines: Array.from({ length: 101 }, () => stdLine('P-1')) }), 'TOO_MANY_LINES');
  for (const bad of [0, 1.5, 100001, -1, '5', null, undefined, NaN]) {
    expectFail(call({ lines: [stdLine('P-1', { qtyReceived: bad })] }), 'QTY_INVALID');
  }
  expectFail(call({ lines: [stdLine('P-1', { qtyInvoiced: 0 })] }), 'QTY_INVALID');
  expectFail(call({ lines: [stdLine('P-1', { qtyInvoiced: 2.5 })] }), 'QTY_INVALID');
  for (const bad of [0, -5, 1.5, '1000', null, undefined, 100000001]) {
    expectFail(call({ lines: [stdLine('P-1', { unitCostPaise: bad })] }), 'COST_REQUIRED');
  }
  expectFail(call({ lines: [stdLine('NOPE-9')] }), 'PART_UNKNOWN');
  expectFail(call({ lines: [stdLine('bad code!')] }), 'PART_UNKNOWN');
  expectFail(call({ lines: [stdLine(5)] }), 'PART_UNKNOWN');
  expectFail(call({ lines: ['x'] }), 'INPUT_INVALID');
  expectFail(call({ lines: 'x' }), 'LINES_REQUIRED');
  expectFail(env.docs.receiveGoods(null, env.ctx(MANAGER)), 'INPUT_INVALID');
  // one bad line among five rejects the whole document
  const five = [stdLine('P-1'), stdLine('P-2'), stdLine('P-3'), stdLine('P-4', { qtyReceived: 0 }), stdLine('P-5')];
  const r = expectFail(call({ lines: five }), 'QTY_INVALID');
  assert.equal(r.detail.lineNo, 4);
  assert.equal(r.detail.partCode, 'P-4');
  // second pass DEF-4 (J02): the same part twice in one receipt is refused, as for issue, opening and adjustment
  const dup = expectFail(call({ lines: [stdLine('P-1'), stdLine('P-2'), stdLine('p-1')] }), 'DUPLICATE_LINE');
  assert.equal(dup.detail.lineNo, 3);
  assert.equal(dup.detail.partCode, 'P-1');
});

test('GRN: an inactive part is refused, an active one is accepted again after reactivation', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const row = Masters.getRow(env.store, 'part', 'P-1').row;
  const off = Masters.setActive(env.store, env.mctx(MANAGER), 'part', 'P-1', false, 'switched off for test', {});
  assert.equal(off.ok, true, JSON.stringify(off));
  expectFail(unchanged(env, () => env.docs.receiveGoods({ supplierInvoiceNo: 'A', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER))), 'PART_INACTIVE');
  const on = Masters.setActive(env.store, env.mctx(MANAGER), 'part', 'P-1', true, 'back on for test', {});
  assert.equal(on.ok, true, JSON.stringify(on));
  assert.ok(row);
  expectOk(env.docs.receiveGoods({ supplierInvoiceNo: 'A', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
});

test('GRN: duplicate supplier invoice (case, spaces, leading zeros), other supplier, previous FY, reversal frees it', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const first = env.docs.receiveGoods({ supplierName: 'Titan', supplierInvoiceNo: 'ab/0012', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER));
  expectOk(first);
  for (const again of ['AB/0012', ' ab 0012 ', '00ab/0012', 'A.B.0012']) {
    const r = expectFail(unchanged(env, () => env.docs.receiveGoods({ supplierName: ' titan ', supplierInvoiceNo: again, supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER))), 'DUPLICATE_SUPPLIER_INVOICE');
    assert.equal(r.detail.docNo, first.doc.no);
  }
  // same number from another supplier is fine
  expectOk(env.docs.receiveGoods({ supplierName: 'Other Trader', supplierInvoiceNo: 'ab/0012', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
  // reversing the first GRN frees the invoice
  expectOk(env.docs.reverseDoc(first.doc.no, 'entered twice by mistake', env.ctxPin(OWNER)));
  expectOk(env.docs.receiveGoods({ supplierName: 'Titan', supplierInvoiceNo: 'ab/0012', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
});

test('GRN: the duplicate guard looks at this and the previous financial year, not two years back', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-11-13T05:00:00.000Z' });
  expectOk(env.docs.receiveGoods({ supplierInvoiceNo: 'OLD-1', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
  env.clock.set('2027-04-10T05:00:00.000Z');
  const dup = expectFail(env.docs.receiveGoods({ supplierInvoiceNo: 'OLD-1', supplierInvoiceDate: '2027-04-09', lines: [stdLine('P-1')] }, env.ctx(MANAGER)), 'DUPLICATE_SUPPLIER_INVOICE');
  assert.equal(dup.detail.docNo, 'GRN/26-27/0001');
  env.clock.set('2028-04-10T05:00:00.000Z');
  const ok = expectOk(env.docs.receiveGoods({ supplierInvoiceNo: 'OLD-1', supplierInvoiceDate: '2028-04-09', lines: [stdLine('P-1')] }, env.ctx(MANAGER)));
  assert.equal(ok.doc.no, 'GRN/28-29/0001');
});

test('GRN: the same part on two lines is refused; two receipts with two costs make two FIFO layers', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  expectFail(unchanged(env, () => env.docs.receiveGoods({ supplierInvoiceNo: 'TWO-1', supplierInvoiceDate: '2026-11-10',
    lines: [stdLine('P-1', { qtyReceived: 4, unitCostPaise: 1000 }), stdLine('P-1', { qtyReceived: 6, unitCostPaise: 1500 })] }, env.ctx(MANAGER))), 'DUPLICATE_LINE');
  env.grn([stdLine('P-1', { qtyReceived: 4, unitCostPaise: 1000 })]);
  env.grn([stdLine('P-1', { qtyReceived: 6, unitCostPaise: 1500 })]);
  const layers = Fifo.layersForPart(env.docs.fifoState(), 'P-1');
  assert.deepEqual(layers.map((l) => [l.qtyLeft, l.unitCostPaise]), [[4, 1000], [6, 1500]]);
  assert.equal(env.value('P-1'), 4 * 1000 + 6 * 1500);
});

test('issue: one record, job fields, billing default, stub warning, refusals', () => {
  const env = makeEnv({
    parts: ['P-1', 'P-2'],
    jobs: [
      ['WS-1', { id: 'WS-1', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }],
      ['WS-W', { id: 'WS-W', status: 'open', invoiceNo: '', paymentStatus: 'no_charge_warranty', stub: false }],
      ['WS-S', { id: 'WS-S', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: true }],
      ['WS-C', { id: 'WS-C', status: 'closed', invoiceNo: '', paymentStatus: 'paid', stub: false }],
      ['WS-I', { id: 'WS-I', status: 'open', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'pending', stub: false }]
    ]
  });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 20 }), stdLine('P-2', { qtyReceived: 20 })]);
  const a = expectOk(env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 3 }, { partCode: 'P-2', qty: 2 }], note: 'for service' }, env.ctx(KEEPER_WITH_ROLE(env))));
  assert.equal(a.doc.no, 'ISS/26-27/0001');
  assert.equal(a.doc.billing, 'CHARGEABLE');
  assert.equal(a.doc.stub, false);
  assert.equal(a.doc.jobId, 'WS-1');
  assert.deepEqual(a.doc.lines, [{ partCode: 'P-1', qty: 3, override: null }, { partCode: 'P-2', qty: 2, override: null }]);
  a.doc.mv.forEach((m, i) => {
    assert.equal(m.type, 'issue_job');
    assert.equal(m.ref.jobId, 'WS-1');
    assert.equal(m.ref.grnNo, a.doc.no);
    assert.equal(m.ref.lineNo, i + 1);
  });
  assert.equal(env.onHand('P-1'), 17);
  assert.equal(expectOk(env.docs.issueToJob({ jobId: 'WS-W', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER))).doc.billing, 'WARRANTY');
  assert.equal(expectOk(env.docs.issueToJob({ jobId: 'WS-W', billing: 'CHARGEABLE', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER))).doc.billing, 'CHARGEABLE');
  assert.equal(expectOk(env.docs.issueToJob({ jobId: 'WS-1', billing: 'WARRANTY', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER))).doc.billing, 'WARRANTY');
  const stub = expectOk(env.docs.issueToJob({ jobId: 'WS-S', lines: [{ partCode: 'P-1', qty: 1 }] }, env.ctx(MANAGER)));
  assert.equal(stub.doc.stub, true);
  assert.ok(stub.warnings.includes('JOB_IS_STUB'));
  const call = (patch) => unchanged(env, () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 1 }], ...patch }, env.ctx(MANAGER)));
  expectFail(call({ jobId: 'WS-NONE' }), 'JOB_NOT_FOUND');
  expectFail(call({ jobId: '' }), 'JOB_NOT_FOUND');
  expectFail(call({ jobId: undefined }), 'JOB_NOT_FOUND');
  expectFail(call({ jobId: 'WS-C' }), 'JOB_CLOSED');
  expectFail(call({ jobId: 'WS-I' }), 'JOB_CLOSED');
  expectFail(call({ billing: 'FREE' }), 'INPUT_INVALID');
  expectFail(call({ lines: [] }), 'LINES_REQUIRED');
  expectFail(call({ lines: [{ partCode: 'P-1', qty: 1 }, { partCode: 'p-1', qty: 2 }] }), 'DUPLICATE_LINE');
  expectFail(call({ lines: [{ partCode: 'P-1', qty: 0 }] }), 'QTY_INVALID');
  expectFail(call({ lines: [{ partCode: 'P-1', qty: 2.5 }] }), 'QTY_INVALID');
  expectFail(call({ lines: [{ partCode: 'ZZ', qty: 1 }] }), 'PART_UNKNOWN');
  expectFail(call({ lines: [{ partCode: 'P-1', qty: 1, allowNegative: 'yes' }] }), 'INPUT_INVALID');
  expectFail(call({ docDate: '2020-01-01' }), 'BACKDATE_NOT_ALLOWED');
});
function KEEPER_WITH_ROLE(env) {
  // a store keeper is a shell role the Owner has named in Stores settings
  expectOk(env.docs.setConfig({ storeRoles: ['Assistant Technician'] }, env.ctxPin(OWNER)));
  return KEEPER;
}

test('issue: not enough stock on any line refuses the whole document with numbers in detail', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 5 }), stdLine('P-2', { qtyReceived: 5 })]);
  const r = expectFail(unchanged(env, () => env.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-1', qty: 5 }, { partCode: 'P-2', qty: 6 }] }, env.ctx(MANAGER))), 'INSUFFICIENT_STOCK');
  assert.equal(r.detail.partCode, 'P-2');
  assert.equal(r.detail.lineNo, 2);
  assert.equal(r.detail.available, 5);
  assert.equal(r.detail.requested, 6);
  assert.equal(r.detail.balance, 5);
  assert.equal(r.detail.wanted, 6);
  assert.equal(env.onHand('P-1'), 5, 'the good first line was not posted');
  // a part that was never received at all
  const env2 = makeEnv({ parts: ['P-9'] });
  expectFail(env2.docs.issueToJob({ jobId: 'WS-1', lines: [{ partCode: 'P-9', qty: 1 }] }, env2.ctx(MANAGER)), 'INSUFFICIENT_STOCK');
});

test('FIFO across layers: issue takes the oldest first, return restores in reverse consumption order, job cost nets out', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 10, unitCostPaise: 1000 })]);
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 10, unitCostPaise: 1500 })]);
  const before = Fifo.exportState(env.docs.fifoState()).parts['P-1'].layers.map((l) => [l.qtyLeft, l.unitCostPaise]);
  assert.deepEqual(before, [[10, 1000], [10, 1500]]);
  env.clock.advance(1000);
  const iss = env.issue('WS-1', [{ partCode: 'P-1', qty: 15 }]);
  assert.deepEqual(iss.doc.mv[0].layers.map((l) => [l.qty, l.unitCostPaise]), [[10, 1000], [5, 1500]]);
  assert.equal(iss.doc.mv[0].valuePaise, -17500);
  assert.equal(env.onHand('P-1'), 5);
  assert.equal(env.value('P-1'), 7500);
  env.clock.advance(1000);
  const ret = expectOk(env.docs.returnFromJob({ jobId: 'WS-1', lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 8, returnReason: 'UNUSED' }] }, env.ctx(MANAGER)));
  assert.deepEqual(ret.doc.mv[0].layers.map((l) => [l.qty, l.unitCostPaise]), [[5, 1500], [3, 1000]], 'the layer consumed last gets its units back first');
  assert.equal(env.onHand('P-1'), 13);
  assert.equal(env.value('P-1'), 3 * 1000 + 10 * 1500);
  const js = env.docs.jobStock('WS-1');
  assert.equal(js.netTotal, 7);
  assert.equal(js.netValuePaise, 7 * 1000, 'the job now costs what a 7-piece issue would have cost');
  assert.deepEqual(js.lines, [{ partCode: 'P-1', issued: 15, returned: 8, net: 7 }]);
  assert.equal(js.issues.length, 1);
  assert.equal(js.issues[0].outstanding, 7);
  assert.equal(js.issues[0].docNo, iss.doc.no);
  // return the rest: the layers look exactly like before the issue
  env.clock.advance(1000);
  expectOk(env.docs.returnFromJob({ jobId: 'WS-1', lines: [{ issueMovementId: iss.doc.mv[0].id, qty: 7, returnReason: 'JOB_CANCELLED' }] }, env.ctx(MANAGER)));
  const after = Fifo.exportState(env.docs.fifoState()).parts['P-1'].layers.map((l) => [l.qtyLeft, l.unitCostPaise]);
  assert.deepEqual(after, before);
  assert.equal(env.docs.jobStock('WS-1').netTotal, 0);
});

test('return: every refusal and the record shape', () => {
  const env = makeEnv({
    parts: ['P-1', 'P-2'],
    jobs: [['WS-1', { id: 'WS-1', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }], ['WS-2', { id: 'WS-2', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }]]
  });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 20 }), stdLine('P-2', { qtyReceived: 20 })]);
  const i1 = env.issue('WS-1', [{ partCode: 'P-1', qty: 3 }, { partCode: 'P-2', qty: 2 }]);
  const i2 = env.issue('WS-2', [{ partCode: 'P-1', qty: 4 }]);
  const mv1 = i1.doc.mv[0].id;
  const r1 = expectOk(env.docs.returnFromJob({ jobId: 'WS-1', note: 'not needed', lines: [{ issueMovementId: mv1, qty: 2, returnReason: 'WRONG_PART' }] }, env.ctx(MANAGER)));
  assert.equal(r1.doc.no, 'RET/26-27/0001');
  assert.deepEqual(r1.doc.lines, [{ partCode: 'P-1', qty: 2, issueMovementId: mv1, issueDocNo: i1.doc.no, issueLineNo: 1, returnReason: 'WRONG_PART' }]);
  assert.equal(r1.doc.mv[0].type, 'return_job');
  assert.equal(r1.doc.mv[0].returnsOf, mv1);
  const call = (patch, job = 'WS-1') => unchanged(env, () => env.docs.returnFromJob({ jobId: job, lines: [{ issueMovementId: mv1, qty: 1, returnReason: 'UNUSED' }], ...patch }, env.ctx(MANAGER)));
  const over = expectFail(call({ lines: [{ issueMovementId: mv1, qty: 2, returnReason: 'UNUSED' }] }), 'RETURN_EXCEEDS_ISSUE');
  assert.equal(over.detail.remaining, 1);
  assert.equal(over.detail.outstanding, 1);
  expectFail(call({}, 'WS-2'), 'ISSUE_LINE_NOT_FOUND');
  expectFail(call({ lines: [{ issueMovementId: 'MV99999999', qty: 1, returnReason: 'UNUSED' }] }), 'ISSUE_LINE_NOT_FOUND');
  expectFail(call({ lines: [{ issueMovementId: 7, qty: 1, returnReason: 'UNUSED' }] }), 'ISSUE_LINE_NOT_FOUND');
  expectFail(call({ lines: [{ issueMovementId: 'MV00000001', qty: 1, returnReason: 'UNUSED' }] }), 'ISSUE_LINE_NOT_FOUND');
  expectFail(call({ lines: [{ issueMovementId: mv1, qty: 1, returnReason: 'BROKE' }] }), 'RETURN_REASON_INVALID');
  expectFail(call({ lines: [{ issueMovementId: mv1, qty: 1 }] }), 'RETURN_REASON_INVALID');
  expectFail(call({ lines: [{ issueMovementId: mv1, qty: 0, returnReason: 'UNUSED' }] }), 'QTY_INVALID');
  expectFail(call({ lines: [{ issueMovementId: mv1, qty: 1, returnReason: 'UNUSED' }, { issueMovementId: mv1, qty: 1, returnReason: 'UNUSED' }] }), 'DUPLICATE_LINE');
  expectFail(call({ lines: [] }), 'LINES_REQUIRED');
  expectFail(call({ jobId: 'NOPE' }), 'JOB_NOT_FOUND');
  // the job closes after the issue: no return any more
  env.jobs.set('WS-1', { id: 'WS-1', status: 'closed', invoiceNo: 'SV/2026-27/0007', paymentStatus: 'paid', stub: false });
  expectFail(call({}), 'JOB_CLOSED');
  assert.ok(i2.ok);
});

test('counter sale: movements without a job, amount rules, saleable flag, no override, nothing about money posted', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'], saleable: ['P-2'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 20 }), stdLine('P-2', { qtyReceived: 20, unitCostPaise: 2000 })]);
  const r = expectOk(env.docs.counterSale({
    payMode: 'UPI', ccptInvoiceNo: ' CC/00123 ', note: 'walk-in strap',
    lines: [{ partCode: 'P-2', qty: 3, unitPricePaise: 4500 }]
  }, env.ctx(MANAGER)));
  assert.equal(r.doc.no, 'CSL/26-27/0001');
  assert.equal(r.doc.moneyPosted, false);
  assert.equal(r.doc.payMode, 'UPI');
  assert.equal(r.doc.ccptInvoiceNo, 'CC/00123');
  assert.equal(r.doc.amountPaise, 13500);
  assert.deepEqual(r.doc.lines, [{ partCode: 'P-2', qty: 3, unitPricePaise: 4500, amountPaise: 13500 }]);
  assert.equal(r.doc.mv[0].type, 'counter_sale');
  assert.equal(r.doc.mv[0].ref.saleRef, r.doc.no);
  assert.equal(r.doc.mv[0].ref.jobId, undefined);
  assert.ok(r.warnings.includes('TAX_DETAILS_MISSING'), 'a part without tax details is only a warning on a sale');
  assert.equal(env.onHand('P-2'), 17);
  const call = (patch, session = MANAGER) => unchanged(env, () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 100 }], ...patch }, env.ctx(session)));
  expectFail(call({ amountPaise: 99 }), 'AMOUNT_MISMATCH');
  expectFail(call({ amountPaise: 100.5 }), 'AMOUNT_MISMATCH');
  expectOk(env.docs.counterSale({ payMode: 'CASH', amountPaise: 100, lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 100 }] }, env.ctx(MANAGER)));
  expectFail(call({ payMode: 'CHEQUE' }), 'PAYMODE_INVALID');
  expectFail(call({ payMode: undefined }), 'PAYMODE_INVALID');
  expectFail(call({ ccptInvoiceNo: 'c'.repeat(41) }), 'INPUT_INVALID');
  expectFail(call({ lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: -1 }] }), 'UNIT_PRICE_INVALID');
  expectFail(call({ lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 1.5 }] }), 'UNIT_PRICE_INVALID');
  expectFail(call({ lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: '100' }] }), 'UNIT_PRICE_INVALID');
  expectFail(call({ lines: [{ partCode: 'P-2', qty: 1 }] }), 'UNIT_PRICE_INVALID');
  expectFail(call({ lines: [{ partCode: 'P-1', qty: 1, unitPricePaise: 100 }] }), 'NOT_COUNTER_SALEABLE');
  expectFail(call({ lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 100 }, { partCode: 'P-2', qty: 1, unitPricePaise: 100 }] }), 'DUPLICATE_LINE');
  expectFail(call({ lines: [{ partCode: 'P-2', qty: 18, unitPricePaise: 100 }] }), 'INSUFFICIENT_STOCK');
  // even the Owner with a PIN cannot sell what is not there
  expectFail(unchanged(env, () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 99, unitPricePaise: 100, allowNegative: true }] }, env.ctxPin(OWNER))), 'INSUFFICIENT_STOCK');
  // a free item is allowed, the part cost is still recorded
  const free = expectOk(env.docs.counterSale({ payMode: 'OTHER', lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 0 }] }, env.ctx(MANAGER)));
  assert.equal(free.doc.amountPaise, 0);
  assert.equal(free.doc.mv[0].valuePaise, -2000);
  // a part that is switched off for sale
  assert.equal(JSON.stringify(r.doc).includes('custName'), false);
});

test('integer paise: very large quantities and prices stay exact, fractions never get in', () => {
  const env = makeEnv({ parts: ['P-1'], saleable: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 100000, unitCostPaise: 100000000 })]);
  assert.equal(env.value('P-1'), 1e13);
  const sale = expectOk(env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 99999, unitPricePaise: 100000000 }] }, env.ctx(MANAGER)));
  assert.equal(sale.doc.amountPaise, 9999900000000);
  assert.equal(Number.isSafeInteger(sale.doc.amountPaise), true);
  assert.equal(sale.doc.mv[0].valuePaise, -9999900000000);
  assert.equal(env.value('P-1'), 100000000);
  // thirds do not exist: unit cost is whole paise, a total is the sum of whole-paise lines
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 3, unitCostPaise: 333 })]);
  env.grn([stdLine('P-1', { qtyReceived: 7, unitCostPaise: 143 })]);
  assert.equal(env.value('P-1'), 100000000 + 3 * 333 + 7 * 143);
  for (const bad of [0.5, 1e21, -1, Infinity]) {
    expectFail(env.docs.receiveGoods({ supplierInvoiceNo: 'Z', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1', { unitCostPaise: bad })] }, env.ctx(MANAGER)), 'COST_REQUIRED');
  }
});

test('a retry with the same clientRef after a lost reply finds the saved record and posts nothing twice', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'], saleable: ['P-2'] });
  env.clock.advance(1000);
  const ctx = env.ctx(MANAGER, { clientRef: 'svs-retry-grn-1' });
  const input = { supplierInvoiceNo: 'R-1', supplierInvoiceDate: '2026-11-10', lines: [stdLine('P-1')] };
  const a = expectOk(env.docs.receiveGoods(input, ctx));
  const n = ledgerRecords(env).length;
  const b = expectOk(unchanged(env, () => env.docs.receiveGoods(input, ctx)));
  assert.equal(b.replayed, true);
  assert.equal(b.doc.no, a.doc.no);
  assert.equal(ledgerRecords(env).length, n);
  // the stock was consumed meanwhile: the retry still answers with the saved document, it does not re-check stock
  env.issue('WS-1', [{ partCode: 'P-1', qty: 10 }]);
  const c = expectOk(env.docs.receiveGoods({ ...input, lines: [stdLine('P-1', { qtyReceived: 1 })] }, ctx));
  assert.equal(c.replayed, true);
  assert.equal(c.doc.no, a.doc.no);
  // the same ref used for a different kind of document is refused
  expectFail(unchanged(env, () => env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-2', qty: 1, unitPricePaise: 1 }] }, ctx)), 'SVCS_DUPLICATE_REF');
  // a bad ref text
  expectFail(env.docs.receiveGoods(input, env.ctx(MANAGER, { clientRef: 'x' })), 'INPUT_INVALID');
  // and a failed write leaves everything as it was, a retry then posts once
  const ref2 = 'svs-retry-grn-2';
  env.adapter.failNext = 1;
  const failed = unchanged(env, () => env.docs.receiveGoods({ ...input, supplierInvoiceNo: 'R-2' }, env.ctx(MANAGER, { clientRef: ref2 })));
  expectFail(failed, 'SVCS_WRITE_FAILED');
  assert.equal(env.docs.status().blocked, false);
  const again = expectOk(env.docs.receiveGoods({ ...input, supplierInvoiceNo: 'R-2' }, env.ctx(MANAGER, { clientRef: ref2 })));
  assert.equal(again.replayed, undefined);
  assert.equal(ledgerRecords(env).filter((r) => r.r === ref2).length, 1);
});

test('time: a clock a little behind is clamped to the last record; more than 24 hours behind needs the Owner with a PIN', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-11-13T05:00:00.000Z' });
  const a = env.grn([stdLine('P-1')]);
  env.clock.set('2026-11-13T04:00:00.000Z');
  const b = env.grn([stdLine('P-1')]);
  assert.equal(b.doc.at, a.doc.at, 'clamped, never earlier than the previous record');
  env.clock.set('2026-11-11T05:00:00.000Z');
  const input = { supplierInvoiceNo: 'T-9', supplierInvoiceDate: '2026-11-09', lines: [stdLine('P-1')] };
  expectFail(unchanged(env, () => env.docs.receiveGoods(input, env.ctx(MANAGER))), 'SVCS_CLOCK_BACK');
  expectFail(unchanged(env, () => env.docs.receiveGoods(input, env.ctx(MANAGER, { clockOverride: true }))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.receiveGoods(input, env.ctx(OWNER, { clockOverride: true }))), 'PIN_REQUIRED');
  const forced = expectOk(env.docs.receiveGoods(input, env.ctxPin(OWNER, { clockOverride: true })));
  assert.equal(forced.doc.at, a.doc.at);
  const rec = ledgerRecords(env).filter((r) => r.b.no === forced.doc.no)[0];
  assert.equal(rec.b.clockOverride, true);
});

test('reads: getDoc, listDocs filters, getDoc by record id, unknown number', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const a = env.grn([stdLine('P-1')]);
  const i = env.issue('WS-1', [{ partCode: 'P-1', qty: 2 }]);
  assert.equal(env.docs.getDoc(a.doc.no).doc.id, a.doc.id);
  assert.equal(env.docs.getDoc(a.doc.id).doc.no, a.doc.no);
  expectFail(env.docs.getDoc('GRN/26-27/9999'), 'DOC_NOT_FOUND');
  expectFail(env.docs.getDoc(5), 'DOC_NOT_FOUND');
  assert.deepEqual(env.docs.listDocs({ kind: 'GRN' }).docs.map((d) => d.no), [a.doc.no]);
  assert.deepEqual(env.docs.listDocs({ kind: 'ISS' }).docs.map((d) => d.no), [i.doc.no]);
  assert.equal(env.docs.listDocs().docs.length, 2);
  assert.deepEqual(env.docs.listDocs({ kind: 'RET' }).docs, []);
  expectFail(env.docs.jobStock(''), 'INPUT_INVALID');
  assert.deepEqual(env.docs.jobStock('NO-SUCH-JOB').lines, []);
});

test('no customer data anywhere in a posted record', () => {
  const env = makeEnv({ parts: ['P-1'], saleable: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 20 })]);
  env.issue('WS-1', [{ partCode: 'P-1', qty: 2 }]);
  expectOk(env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 1, unitPricePaise: 100 }] }, env.ctx(MANAGER)));
  const text = JSON.stringify(ledgerRecords(env));
  for (const bad of ['custName', 'custMobile', 'custAddr', 'customerLabel', 'returnedTo', 'mobile', 'phone', 'email', 'address']) {
    assert.equal(text.toLowerCase().includes(bad.toLowerCase()), false, bad);
  }
});

test('listDocs: paging, newest first, total', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  for (let i = 0; i < 5; i++) { env.clock.advance(1000); env.grn([stdLine('P-1', { qtyReceived: 1 })]); }
  const all = env.docs.listDocs();
  assert.equal(all.total, 5);
  assert.deepEqual(all.docs.map((d) => d.no), ['GRN/26-27/0001', 'GRN/26-27/0002', 'GRN/26-27/0003', 'GRN/26-27/0004', 'GRN/26-27/0005']);
  const page = env.docs.listDocs({ newestFirst: true, offset: 1, limit: 2 });
  assert.equal(page.total, 5);
  assert.deepEqual(page.docs.map((d) => d.no), ['GRN/26-27/0004', 'GRN/26-27/0003']);
  assert.deepEqual(env.docs.listDocs({ offset: 4, limit: 10 }).docs.map((d) => d.no), ['GRN/26-27/0005']);
  assert.deepEqual(env.docs.listDocs({ limit: 0 }).docs, []);
  for (const bad of [{ offset: -1 }, { offset: 1.5 }, { limit: -2 }, { limit: '3' }]) expectFail(env.docs.listDocs(bad), 'INPUT_INVALID');
});

test('a 100-line document of every kind posts as one record, and the next record goes to the next shard when needed', () => {
  const codes = Array.from({ length: 100 }, (_, i) => 'L-' + String(i + 1).padStart(3, '0'));
  const env = makeEnv({ parts: codes, saleable: codes });
  env.clock.advance(1000);
  const lines = codes.map((c) => ({ partCode: c, qtyReceived: 9, unitCostPaise: 1234 }));
  const g = expectOk(env.docs.receiveGoods({ ...inv100(1), lines }, env.ctx(MANAGER)));
  assert.equal(g.doc.mv.length, 100);
  assert.equal(ledgerRecords(env).filter((r) => r.k === 'GRN').length, 1);
  const i = expectOk(env.docs.issueToJob({ jobId: 'WS-1', lines: codes.map((c) => ({ partCode: c, qty: 3 })) }, env.ctx(MANAGER)));
  assert.equal(i.doc.mv.length, 100);
  const r = expectOk(env.docs.returnFromJob({ jobId: 'WS-1', lines: i.doc.mv.map((m) => ({ issueMovementId: m.id, qty: 1, returnReason: 'UNUSED' })) }, env.ctx(MANAGER)));
  assert.equal(r.doc.mv.length, 100);
  const c = expectOk(env.docs.counterSale({ payMode: 'CASH', lines: codes.map((x) => ({ partCode: x, qty: 1, unitPricePaise: 5 })) }, env.ctx(MANAGER)));
  assert.equal(c.doc.amountPaise, 500);
  const o = expectOk(env.docs.reverseDoc(c.doc.no, 'a hundred lines undone', env.ctx(MANAGER)));
  assert.equal(o.doc.mv.length, 100);
  assert.equal(env.onHand('L-001'), 9 - 3 + 1);
  const keys = env.adapter.keys().filter((k) => /ledger_v1/.test(k));
  assert.ok(keys.length >= 2, 'big records rotate to more shards: ' + keys.join());
  const again = env.reopen();
  assert.deepEqual(Fifo.exportState(again.fifoState()), Fifo.exportState(env.docs.fifoState()));
  // 101 is one too many
  expectFail(env.docs.counterSale({ payMode: 'CASH', lines: [...codes, 'L-001'].map((x) => ({ partCode: x, qty: 1, unitPricePaise: 5 })) }, env.ctx(MANAGER)), 'TOO_MANY_LINES');
});
function inv100(n) { return { supplierInvoiceNo: 'BIG-' + n, supplierInvoiceDate: '2026-11-10' }; }
