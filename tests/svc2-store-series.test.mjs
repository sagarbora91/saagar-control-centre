// Service wave 2, store: number series SV (long year form), SCN, SAR, SRC, SRF, and the one-time series seed.
// Expected numbers are typed by hand from plan section 2.3 and the P1-storage spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, P, makeClock, makeAdapter, newStore, openStore, put, postNumbered, expectOk, expectFail,
  postInvoice, postCredit, postAdvance, postReceipt, postRefund, putSeed, seedItem, seedAndInvoice, forgeChain
} from './lib/svc2-store-harness.mjs';

const AT = '2026-11-18T05:00:00.000Z';
const fresh = (iso = AT) => { const clock = makeClock(iso); const adapter = makeAdapter(); return { clock, adapter, store: openStore(adapter, clock) }; };
const noOf = (res) => res.records[0].b.no;

test('T2S-9 SV format: SV/2026-27/0001, width 4, longest allowed is SV/2026-27/99999 (16 characters)', () => {
  const { clock, adapter, store } = fresh();
  assert.equal(noOf(expectOk(postInvoice(store))), 'SV/2026-27/0001');
  clock.advance(1000);
  const second = expectOk(postInvoice(store));
  assert.equal(noOf(second), 'SV/2026-27/0002');
  assert.equal(noOf(second).length, 15);
  assert.deepEqual(plainOf(store.lastNumber('SV', AT)), { ok: true, fy: '2026-27', last: 2 });
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0003');
  // 9,999 then 10,000 (the width is a minimum)
  clock.advance(1000);
  expectOk(putSeed(store, 'invoices', 'SV', '2026-27', 9998));
  clock.advance(1000);
  assert.equal(noOf(expectOk(postInvoice(store))), 'SV/2026-27/9999');
  clock.advance(1000);
  const tenK = expectOk(postInvoice(store));
  assert.equal(noOf(tenK), 'SV/2026-27/10000');
  assert.equal(noOf(tenK).length, 16);
  // 99,999 is the last one that fits
  clock.advance(1000);
  expectOk(putSeed(store, 'invoices', 'SV', '2026-27', 99998));
  clock.advance(1000);
  const last = expectOk(postInvoice(store));
  assert.equal(noOf(last), 'SV/2026-27/99999');
  assert.equal(noOf(last).length, 16);
  expectFail(store.nextNumber('SV', AT), 'SVCS_SERIES_TOO_LONG');
  // a caller that builds the 100,000th number itself is refused too, and nothing is written
  clock.advance(1000);
  const sets = adapter.setCount;
  expectFail(put(store, 'invoices', { k: 'INV_ISSUE', series: 'SV', b: { no: 'SV/2026-27/100000' } }), 'SVCS_SERIES_TOO_LONG');
  assert.equal(adapter.setCount, sets);
  // reopened from storage: same counter
  const again = openStore(adapter, clock);
  assert.equal(again.lastNumber('SV', AT).last, 99999);
  // a seed of 99,999 itself is allowed and leaves no number for the year
  const other = fresh();
  expectOk(putSeed(other.store, 'invoices', 'SV', '2026-27', 99999));
  expectFail(other.store.nextNumber('SV', AT), 'SVCS_SERIES_TOO_LONG');
});

function plainOf(v) { return JSON.parse(JSON.stringify(v)); }

test('T2S-9b the other four series use the short form with width 4', () => {
  const { clock, store } = fresh();
  assert.equal(noOf(expectOk(postCredit(store))), 'SCN/26-27/0001');
  clock.advance(1000);
  assert.equal(noOf(expectOk(postAdvance(store))), 'SAR/26-27/0001');
  clock.advance(1000);
  assert.equal(noOf(expectOk(postReceipt(store))), 'SRC/26-27/0001');
  clock.advance(1000);
  assert.equal(noOf(expectOk(postRefund(store))), 'SRF/26-27/0001');
  clock.advance(1000);
  assert.equal(noOf(expectOk(postAdvance(store))), 'SAR/26-27/0002');
  assert.equal(noOf(expectOk(postCredit(store))), 'SCN/26-27/0002');
  // each series counts alone, on its own stream
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0001');
  assert.equal(store.nextNumber('SRC', AT).no, 'SRC/26-27/0002');
  assert.equal(store.nextNumber('SRF', AT).no, 'SRF/26-27/0002');
  assert.equal(store.nextNumber('GRN', AT).no, 'GRN/26-27/0001');
});

test('T2S-10 the financial year turns at midnight India time for all five series, and each restarts at 0001', () => {
  const table = [
    ['SV', 'invoices', 'INV_ISSUE', 'SV/2026-27/0001', 'SV/2027-28/0001'],
    ['SCN', 'invoices', 'CN_ISSUE', 'SCN/26-27/0001', 'SCN/27-28/0001'],
    ['SAR', 'receipts', 'SAR', 'SAR/26-27/0001', 'SAR/27-28/0001'],
    ['SRC', 'receipts', 'SRC', 'SRC/26-27/0001', 'SRC/27-28/0001'],
    ['SRF', 'receipts', 'SRF', 'SRF/26-27/0001', 'SRF/27-28/0001']
  ];
  for (const [series, stream, kind, before, after] of table) {
    const { clock, store } = fresh('2027-03-31T18:29:59.000Z'); // 23:59:59 on 31 March in India
    assert.equal(noOf(expectOk(postNumbered(store, series, stream, kind, { jobId: 'J-1' }))), before, series);
    clock.set('2027-03-31T18:30:00.000Z'); // 00:00:00 on 1 April in India
    const r = expectOk(postNumbered(store, series, stream, kind, { jobId: 'J-1' }));
    assert.equal(noOf(r), after, series);
    clock.advance(1000);
    assert.equal(noOf(expectOk(postNumbered(store, series, stream, kind, { jobId: 'J-1' }))), after.replace('0001', '0002'), series);
    // the old year stays readable and keeps its own counter
    assert.equal(store.lastNumber(series, '2027-03-31T18:29:59.000Z').last, 1, series);
    assert.equal(store.lastNumber(series, '2027-03-31T18:30:00.000Z').last, 2, series);
  }
  // each year has its own shard
  const { clock, adapter, store } = fresh('2027-03-31T18:29:59.000Z');
  expectOk(postInvoice(store));
  clock.set('2027-03-31T18:30:00.000Z');
  expectOk(postInvoice(store));
  assert.deepEqual(adapter.svcsKeys().filter((k) => /invoices/.test(k)), [P + 'invoices_v1_FY2026-27', P + 'invoices_v1_FY2027-28']);
  // leap day, 31 December (still the same year in India), and a century year
  const leap = fresh('2028-02-29T10:00:00.000Z').store;
  assert.equal(noOf(expectOk(postInvoice(leap))), 'SV/2027-28/0001');
  assert.equal(noOf(expectOk(postCredit(leap))), 'SCN/27-28/0001');
  const dec = fresh('2026-12-31T18:30:00.000Z').store; // 1 January 2027 in India
  assert.equal(noOf(expectOk(postInvoice(dec))), 'SV/2026-27/0001');
  const century = fresh('2099-03-31T18:30:00.000Z').store; // 1 April 2099 in India
  assert.equal(noOf(expectOk(postInvoice(century))), 'SV/2099-00/0001');
  assert.equal(noOf(expectOk(postCredit(century))), 'SCN/99-00/0001');
  assert.equal(Store.fyLabel('2099-03-31T18:30:00.000Z'), 'FY2099-00');
});

test('T2S-11 a series works only on its own stream and only in its own form', () => {
  const { clock, adapter, store } = fresh();
  const sets = adapter.setCount;
  const item = (series, no) => ({ k: 'TEST', series, b: { no } });
  expectFail(put(store, 'receipts', item('SV', 'SV/2026-27/0001')), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'invoices', item('SAR', 'SAR/26-27/0001')), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'invoices', item('SRC', 'SRC/26-27/0001')), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'receipts', item('SCN', 'SCN/26-27/0001')), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'ledger', item('SV', 'SV/2026-27/0001')), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'invoices', item('GRN', 'GRN/26-27/0001')), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'invoices', item('SNC', 'SNC/26-27/0001')), 'SVCS_ARGS_INVALID');
  assert.equal(adapter.setCount, sets, 'nothing written');
  // the wrong year form for a series is a wrong number, not a number
  expectFail(put(store, 'invoices', item('SV', 'SV/26-27/0001')), 'SVCS_SERIES_MISMATCH');
  expectFail(put(store, 'invoices', item('SCN', 'SCN/2026-27/0001')), 'SVCS_SERIES_MISMATCH');
  assert.equal(adapter.setCount, sets);
  // text that only looks like a number is ordinary text: kept as it is, never counted
  expectOk(put(store, 'ledger', { k: 'TEST', b: { no: 'GRN/2026-27/0001' } }));
  clock.advance(1000);
  expectOk(put(store, 'invoices', { k: 'TEST', b: { no: 'SV/26-27/0001' } }));
  clock.advance(1000);
  expectOk(put(store, 'invoices', { k: 'TEST', b: { no: 'SCN/2026-27/0007' } }));
  clock.advance(1000);
  expectOk(put(store, 'invoices', { k: 'TEST', b: { no: 'XX/2026-27/0001' } }));
  clock.advance(1000);
  expectOk(put(store, 'receipts', { k: 'TEST', b: { no: 'SV/2026-27/0001' } }));
  // none of that moved a counter
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0001');
  assert.equal(store.nextNumber('SCN', AT).no, 'SCN/26-27/0001');
  assert.equal(store.nextNumber('GRN', AT).no, 'GRN/26-27/0001');
  // and the file still opens clean: text in the wrong form is not read as a number
  const o = openStore(makeAdapterCopy(adapter), clock).open();
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
});

function makeAdapterCopy(a) { return a.copy(); }

test('T2S-12 a number the caller guessed is refused, and a number without its series is refused', () => {
  const { clock, adapter, store } = fresh();
  expectOk(postInvoice(store));
  clock.advance(1000);
  const sets = adapter.setCount;
  const tryNo = (series, no, stream = 'invoices') => put(store, stream, { k: 'TEST', series, b: { no } });
  expectFail(tryNo('SV', 'SV/2026-27/0005'), 'SVCS_SERIES_MISMATCH');
  expectFail(tryNo('SV', 'SV/2026-27/0001'), 'SVCS_SERIES_MISMATCH');
  expectFail(tryNo('SV', 'SV/2026-27/2'), 'SVCS_SERIES_MISMATCH');
  expectFail(tryNo('SV', 'SV/2027-28/0002'), 'SVCS_SERIES_MISMATCH');
  expectFail(tryNo('SAR', 'SAR/26-27/0002', 'receipts'), 'SVCS_SERIES_MISMATCH');
  expectFail(put(store, 'invoices', { k: 'TEST', b: { no: 'SV/2026-27/0002' } }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'invoices', { k: 'TEST', b: { no: 'SCN/26-27/0001' } }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'receipts', { k: 'TEST', b: { no: 'SRF/26-27/0001' } }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'ledger', { k: 'TEST', b: { no: 'GRN/26-27/0001' } }), 'SVCS_ARGS_INVALID');
  assert.equal(adapter.setCount, sets, 'nothing written');
  // the right number goes in
  expectOk(put(store, 'invoices', { k: 'TEST', series: 'SV', b: { no: 'SV/2026-27/0002' } }));
  // two numbers of one series in one batch: the second must follow the first
  clock.advance(1000);
  expectOk(put(store, 'invoices', [
    { k: 'TEST', series: 'SV', b: { no: 'SV/2026-27/0003' } },
    { k: 'TEST', series: 'SV', b: { no: 'SV/2026-27/0004' } },
    { k: 'TEST', series: 'SCN', b: { no: 'SCN/26-27/0001' } }
  ]));
  clock.advance(1000);
  expectFail(put(store, 'invoices', [
    { k: 'TEST', series: 'SV', b: { no: 'SV/2026-27/0005' } },
    { k: 'TEST', series: 'SV', b: { no: 'SV/2026-27/0005' } }
  ]), 'SVCS_SERIES_MISMATCH');
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0005');
});

test('T2S-13 a failed write consumes no number: write error, read-back mismatch and head write error, on both streams', () => {
  for (const [series, stream, kind, nos] of [
    ['SV', 'invoices', 'INV_ISSUE', ['SV/2026-27/0001', 'SV/2026-27/0002', 'SV/2026-27/0003', 'SV/2026-27/0004', 'SV/2026-27/0005']],
    ['SAR', 'receipts', 'SAR', ['SAR/26-27/0001', 'SAR/26-27/0002', 'SAR/26-27/0003', 'SAR/26-27/0004', 'SAR/26-27/0005']]
  ]) {
    const { clock, adapter, store } = fresh();
    const shard = new RegExp(stream + '_v1_FY');
    const post = (ref) => postNumbered(store, series, stream, kind, { jobId: 'J-1' }, ref ? { r: ref } : {});
    assert.equal(noOf(expectOk(post())), nos[0]);
    // the write fails: no number is used, the retry gets the same number
    clock.advance(1000);
    adapter.failSetFor(shard, { times: 1, code: 'STORAGE_BLOCKED' });
    assert.equal(expectFail(post(), 'SVCS_WRITE_FAILED').detail, 'STORAGE_BLOCKED');
    assert.equal(store.read(stream).records.length, 1);
    assert.equal(store.head(stream).rev, 1);
    assert.equal(noOf(expectOk(post())), nos[1], 'same number again after the failed write');
    // the read-back lies: the shard landed, the head did not move, a reopen heals and the number is used
    clock.advance(1000);
    adapter.corruptNextReadback(shard);
    expectFail(post('REF:rb:' + series), 'SVCS_READBACK_MISMATCH');
    assert.equal(store.head(stream).rev, 2);
    adapter.corrupt.length = 0;
    const again = openStore(adapter, clock);
    assert.equal(again.findRef(stream, 'REF:rb:' + series).b.no, nos[2]);
    assert.equal(again.nextNumber(series, clock.iso).no, nos[3]);
    // the head write fails after a good shard write: committed, number used, no reuse after reopen
    clock.advance(1000);
    adapter.failSetFor(/head_v1/, { times: 1, code: 'STORAGE_BLOCKED' });
    const hw = expectFail(postNumbered(again, series, stream, kind, { jobId: 'J-1' }, { r: 'REF:hw:' + series }), 'SVCS_HEAD_WRITE_FAILED');
    assert.equal(hw.committed, true);
    assert.equal(hw.n, 4);
    const third = openStore(adapter, clock);
    assert.equal(third.findRef(stream, 'REF:hw:' + series).b.no, nos[3]);
    assert.equal(third.nextNumber(series, clock.iso).no, nos[4], 'no number is reused');
    assert.equal(third.head(stream).rev, 4);
    assert.equal(third.verifyAll().problems.length, 0);
  }
});

test('T2S-14 a cancelled number stays used: the next invoice gets the next number, also after a reopen', () => {
  const { clock, adapter, store } = fresh();
  const first = expectOk(postInvoice(store, { jobId: 'J-7' }));
  assert.equal(noOf(first), 'SV/2026-27/0001');
  clock.advance(1000);
  expectOk(put(store, 'invoices', { k: 'INV_CANCEL', b: { jobId: 'J-7', invoiceNo: 'SV/2026-27/0001', invoiceId: first.records[0].id, reason: 'wrong job', docDate: '2026-11-18' } }));
  clock.advance(1000);
  assert.equal(noOf(expectOk(postInvoice(store, { jobId: 'J-7' }))), 'SV/2026-27/0002');
  const reopened = openStore(adapter, clock);
  assert.equal(reopened.nextNumber('SV', AT).no, 'SV/2026-27/0003');
  // credit notes and receipts behave the same
  clock.advance(1000);
  expectOk(postCredit(reopened));
  clock.advance(1000);
  expectOk(put(reopened, 'invoices', { k: 'CN_CANCEL', b: { cnNo: 'SCN/26-27/0001' } }));
  clock.advance(1000);
  assert.equal(noOf(expectOk(postCredit(reopened))), 'SCN/26-27/0002');
  clock.advance(1000);
  expectOk(postAdvance(reopened));
  clock.advance(1000);
  expectOk(put(reopened, 'receipts', { k: 'RRV', b: { reverses: 'SAR/26-27/0001', side: 'IN', amountPaise: 50000, reason: 'keyed twice', docDate: '2026-11-18' } }));
  clock.advance(1000);
  assert.equal(noOf(expectOk(postAdvance(reopened))), 'SAR/26-27/0002');
});

test('T2S-15 the series seed hands an old counter over in one write', () => {
  const { clock, adapter, store } = fresh();
  // legacy counter 41: one batch [seed, invoice 0042], one shard write
  const res = expectOk(seedAndInvoice(store, 41));
  assert.equal(res.records.length, 2);
  assert.equal(res.records[0].id, 'INV-000001');
  assert.equal(res.records[0].k, 'SERIES_SEED');
  assert.deepEqual(plainOf(res.records[0].b), { seriesSeed: { fy: '2026-27', last: 41, series: 'SV' } });
  assert.equal(res.records[1].id, 'INV-000002');
  assert.equal(res.records[1].b.no, 'SV/2026-27/0042');
  assert.equal(res.rev, 1, 'one write is one revision');
  assert.equal(adapter.setLog.filter((k) => k === P + 'invoices_v1_FY2026-27').length, 1, 'one shard write');
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0043');
  assert.equal(store.lastNumber('SV', AT).last, 42);
  // the same value again is a no-op; a lower value is refused
  clock.advance(1000);
  expectOk(putSeed(store, 'invoices', 'SV', '2026-27', 42));
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0043');
  clock.advance(1000);
  const sets = adapter.setCount;
  expectFail(putSeed(store, 'invoices', 'SV', '2026-27', 41), 'SVCS_SERIES_MISMATCH');
  expectFail(putSeed(store, 'invoices', 'SV', '2026-27', 0), 'SVCS_SERIES_MISMATCH');
  assert.equal(adapter.setCount, sets);
  // forward is allowed
  expectOk(putSeed(store, 'invoices', 'SV', '2026-27', 50));
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0051');
  // after a reopen from storage the counter is the same
  const again = openStore(adapter, clock);
  assert.equal(again.lastNumber('SV', AT).last, 50);
  assert.equal(again.nextNumber('SV', AT).no, 'SV/2026-27/0051');
  assert.equal(again.verifyAll().problems.length, 0);
});

test('T2S-15b a seed with the wrong shape is refused and nothing is written', () => {
  const { adapter, store } = fresh();
  const sets = adapter.setCount;
  const bad = [
    { series: 'SV', fy: '2026-27', last: 5, extra: 1 },
    { series: 'SV', fy: '2026-27' },
    { series: 'SV', last: 5 },
    { fy: '2026-27', last: 5 },
    { series: 'SV', fy: '2026-27', last: 1.5 },
    { series: 'SV', fy: '2026-27', last: -1 },
    { series: 'SV', fy: '2026-27', last: 100000 },
    { series: 'SV', fy: '2026-27', last: '5' },
    { series: 'SV', fy: '2026-27', last: null },
    { series: 'SV', fy: '26-27', last: 5 },
    { series: 'SV', fy: '2025-26', last: 5 },
    { series: 'SV', fy: '2027-28', last: 5 },
    { series: 'SV', fy: '2026-28', last: 5 },
    { series: 'SAR', fy: '26-27', last: 5 },
    { series: 'GRN', fy: '26-27', last: 5 },
    { series: 'NOPE', fy: '26-27', last: 5 },
    { series: 'SCN', fy: '2026-27', last: 5 },
    'SV',
    5,
    [],
    ['SV', '2026-27', 5],
    {}
  ];
  for (const sd of bad) {
    expectFail(put(store, 'invoices', { k: 'SERIES_SEED', b: { seriesSeed: sd } }), 'SVCS_ARGS_INVALID');
  }
  // a seed may not carry a series or a number of its own
  expectFail(put(store, 'invoices', { k: 'SERIES_SEED', series: 'SV', b: { seriesSeed: { series: 'SV', fy: '2026-27', last: 5 } } }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'invoices', { k: 'SERIES_SEED', b: { no: 'SV/2026-27/0006', seriesSeed: { series: 'SV', fy: '2026-27', last: 5 } } }), 'SVCS_ARGS_INVALID');
  // a series of the other new stream, and of the Phase 1 streams, is not a seed target here
  expectFail(put(store, 'receipts', { k: 'SERIES_SEED', b: { seriesSeed: { series: 'SV', fy: '2026-27', last: 5 } } }), 'SVCS_ARGS_INVALID');
  assert.equal(adapter.setCount, sets);
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0001');
});

test('T2S-15d in a Phase 1 stream a seed body is plain text, exactly as in Phase 1: it never moves a stock number', () => {
  const { clock, adapter, store } = fresh();
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: 1, unitCostPaise: 100 }));
  clock.advance(1000);
  // the Phase 1 store accepted any body field; the seed field is not read there, whatever its shape
  expectOk(put(store, 'ledger', { k: 'TEST', b: { seriesSeed: { series: 'GRN', fy: '26-27', last: 50 } } }));
  clock.advance(1000);
  expectOk(put(store, 'defective', { k: 'TEST', b: { seriesSeed: 'not a seed' } }));
  clock.advance(1000);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { seriesSeed: { series: 'SV', fy: '2026-27', last: 5 } } }));
  assert.equal(store.nextNumber('GRN', AT).no, 'GRN/26-27/0002', 'GRN goes on from 0001, not from 50');
  clock.advance(1000);
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: 2, unitCostPaise: 100 }));
  const again = newStore(adapter.copy(), clock);
  const o = again.open();
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
  assert.equal(again.nextNumber('GRN', AT).no, 'GRN/26-27/0003');
});

test('T2S-15c a seed alone, a seed in the other series, a seed of zero, and the year turning over', () => {
  const { clock, adapter, store } = fresh();
  expectOk(putSeed(store, 'invoices', 'SV', '2026-27', 10));
  clock.advance(1000);
  assert.equal(noOf(expectOk(postInvoice(store))), 'SV/2026-27/0011', 'a seed alone, an invoice in a later call');
  clock.advance(1000);
  expectOk(putSeed(store, 'invoices', 'SCN', '26-27', 7));
  assert.equal(store.nextNumber('SCN', AT).no, 'SCN/26-27/0008');
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0012', 'one series does not move another');
  clock.advance(1000);
  expectOk(putSeed(store, 'receipts', 'SAR', '26-27', 3));
  clock.advance(1000);
  expectOk(putSeed(store, 'receipts', 'SRC', '26-27', 0));
  assert.equal(store.nextNumber('SAR', AT).no, 'SAR/26-27/0004');
  assert.equal(store.nextNumber('SRC', AT).no, 'SRC/26-27/0001');
  // the year turns: a seed is for the year of its own record time only
  clock.set('2027-04-02T05:00:00.000Z');
  const sets = adapter.setCount;
  expectFail(putSeed(store, 'invoices', 'SV', '2026-27', 20), 'SVCS_ARGS_INVALID');
  assert.equal(adapter.setCount, sets);
  assert.equal(store.nextNumber('SV', '2027-04-02T05:00:00.000Z').no, 'SV/2027-28/0001');
  expectOk(putSeed(store, 'invoices', 'SV', '2027-28', 3));
  clock.advance(1000);
  assert.equal(noOf(expectOk(postInvoice(store))), 'SV/2027-28/0004');
  assert.equal(store.lastNumber('SV', AT).last, 11, 'the old year is not changed');
  // everything survives a reopen
  const again = openStore(adapter, clock);
  assert.equal(again.lastNumber('SV', AT).last, 11);
  assert.equal(again.lastNumber('SV', '2027-04-02T05:00:00.000Z').last, 4);
  assert.equal(again.lastNumber('SAR', AT).last, 3);
  assert.equal(again.lastNumber('SRC', AT).last, 0);
  assert.equal(again.verifyAll().problems.length, 0);
});

test('T2S-16 seed and numbered item in one batch: order matters, a seed only moves forward', () => {
  const { clock, adapter, store } = fresh();
  const sets = adapter.setCount;
  const t = store.nextAt('invoices');
  const inv = (no) => ({ k: 'INV_ISSUE', series: 'SV', b: { no, jobId: 'J-1' } });
  // invoice first, seed second: the invoice number was built from the seed, but the seed has not happened yet
  expectFail(put(store, 'invoices', [inv('SV/2026-27/0042'), seedItem('SV', '2026-27', 41)], { at: t.at }), 'SVCS_SERIES_MISMATCH');
  // invoice 0001 then a seed of 0 is a seed below the running counter
  expectFail(put(store, 'invoices', [inv('SV/2026-27/0001'), seedItem('SV', '2026-27', 0)], { at: t.at }), 'SVCS_SERIES_MISMATCH');
  assert.equal(adapter.setCount, sets);
  // the right order works
  const ok = expectOk(put(store, 'invoices', [seedItem('SV', '2026-27', 41), inv('SV/2026-27/0042'), inv('SV/2026-27/0043')], { at: t.at }));
  assert.equal(ok.records.length, 3);
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0044');
  // a seed after an invoice in the same batch may move forward
  clock.advance(1000);
  const t2 = store.nextAt('invoices');
  expectOk(put(store, 'invoices', [inv('SV/2026-27/0044'), seedItem('SV', '2026-27', 60)], { at: t2.at }));
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0061');
  assert.equal(openStore(adapter, clock).nextNumber('SV', AT).no, 'SV/2026-27/0061');
});

test('T2S-17 old invoices brought in under their own numbers never touch the counter', () => {
  const { clock, adapter, store } = fresh();
  const pad4 = (n) => String(n).padStart(4, '0');
  const legacyNo = (i) => (i % 3 === 0 ? 'SV/2026-27/' + pad4(900 - i * 2) : i % 3 === 1 ? 'WS-2025-' + String(i).padStart(3, '0') : 'SV/2025-26/' + pad4((i * 7) % 311 + 1));
  const make = (i) => ({ k: 'INV_LEGACY', r: 'LEGACY:J-' + i, b: { legacyNo: legacyNo(i), jobId: 'J-' + i, basis: 'LIVE_CASE', totalPaise: 100000 + i, gstBp: 1800, warn: [] } });
  const first = [];
  const second = [];
  for (let i = 0; i < 100; i++) first.push(make(i));
  for (let i = 100; i < 150; i++) second.push(make(i));
  expectOk(put(store, 'invoices', first));
  clock.advance(1000);
  expectOk(put(store, 'invoices', second));
  assert.equal(store.read('invoices').records.length, 150);
  assert.equal(store.verifyAll().problems.length, 0);
  assert.equal(openStore(adapter, clock).open().blocked, false);
  assert.equal(store.nextNumber('SV', AT).no, 'SV/2026-27/0001', 'legacy numbers are not parsed');
  // a second run with the same references: duplicate, and findRef finds the old record
  clock.advance(1000);
  expectFail(put(store, 'invoices', [make(3)]), 'SVCS_DUPLICATE_REF');
  expectFail(put(store, 'invoices', first), 'SVCS_DUPLICATE_REF');
  assert.equal(store.findRef('invoices', 'LEGACY:J-3').b.legacyNo, 'SV/2026-27/0894');
  assert.equal(store.findRef('invoices', 'LEGACY:J-147').b.legacyNo, 'SV/2026-27/0606');
  assert.equal(store.findRef('invoices', 'LEGACY:J-149').b.legacyNo, 'SV/2025-26/0111');
  assert.equal(store.findRef('invoices', 'LEGACY:J-4').b.legacyNo, 'WS-2025-004');
  assert.equal(store.read('invoices').records.length, 150);
  // a numbered SV record after them starts from the seed, not from the legacy count
  clock.advance(1000);
  const res = expectOk(seedAndInvoice(store, 41));
  assert.equal(res.records[1].b.no, 'SV/2026-27/0042');
  assert.equal(store.read('invoices').records.length, 152);
  assert.equal(store.verifyAll().problems.length, 0);
  // the hashed reference form fits the reference pattern
  clock.advance(1000);
  expectOk(put(store, 'invoices', { k: 'INV_LEGACY', r: 'LEGACY:h' + Store.sha256Hex('J-weird id').slice(0, 20), b: { legacyNo: 'X-1', jobId: 'J-weird id' } }));
});

test('T2S-18 guardRevs name the new streams: a ledger or receipts write between plan and save forces a replan', () => {
  const { clock, store } = fresh();
  const guard = () => ({ ledger: store.head('ledger').rev, receipts: store.head('receipts').rev });
  const inv = () => ({ k: 'INV_ISSUE', b: { jobId: 'J-1' } });
  // untouched: passes
  const g0 = guard();
  assert.deepEqual(g0, { ledger: 0, receipts: 0 });
  expectOk(put(store, 'invoices', inv(), { guardRevs: g0 }));
  clock.advance(1000);
  // a ledger write after the plan
  const g1 = guard();
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: 1, unitCostPaise: 100 }));
  clock.advance(1000);
  const c1 = expectFail(put(store, 'invoices', inv(), { guardRevs: g1 }), 'SVCS_REV_CONFLICT');
  assert.equal(c1.detail, 'guard ledger');
  assert.equal(c1.stream, 'invoices');
  // a receipts write after the plan
  const g2 = guard();
  expectOk(postAdvance(store));
  clock.advance(1000);
  const c2 = expectFail(put(store, 'invoices', inv(), { guardRevs: g2 }), 'SVCS_REV_CONFLICT');
  assert.equal(c2.detail, 'guard receipts');
  // after a reload (fresh heads) it passes, and an invoices write guards a receipt the same way
  expectOk(put(store, 'invoices', inv(), { guardRevs: guard() }));
  clock.advance(1000);
  const g3 = { invoices: store.head('invoices').rev };
  expectOk(put(store, 'invoices', inv()));
  clock.advance(1000);
  const c3 = expectFail(put(store, 'receipts', { k: 'TEST', b: {} }, { guardRevs: g3 }), 'SVCS_REV_CONFLICT');
  assert.equal(c3.detail, 'guard invoices');
  expectOk(put(store, 'receipts', { k: 'TEST', b: {} }, { guardRevs: { invoices: store.head('invoices').rev } }));
  // a stale own revision is a conflict as well
  expectFail(store.append('invoices', [inv()], { expectRev: 1, actor: ACTORS.manager }), 'SVCS_REV_CONFLICT');
});

test('T2S-27 numbers of the new series are checked again when the data is read back from storage', () => {
  const { clock, adapter, store } = fresh();
  expectOk(seedAndInvoice(store, 41));
  for (let i = 0; i < 3; i++) { clock.advance(1000); expectOk(postInvoice(store)); }
  clock.advance(1000);
  expectOk(postCredit(store));
  clock.advance(1000);
  expectOk(postAdvance(store));
  const o = newStore(adapter.copy(), clock).open();
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
  assert.deepEqual(o.summary.counts, { audit: 0, config: 0, defective: 0, docs: 0, invoices: 6, labour: 0, ledger: 0, parts: 0, receipts: 1 });
  // forged chains with big numbers verify too (storage-side check of the long form)
  const forged = makeAdapter();
  forgeChain(forged, 'invoices', 300, (n) => ({ k: 'INV_ISSUE', b: { no: 'SV/2026-27/' + String(n).padStart(4, '0'), jobId: 'J-' + n } }));
  const fo = newStore(forged, makeClock(AT)).open();
  assert.equal(fo.blocked, false);
  assert.equal(newStore(forged, makeClock(AT)).lastNumber('SV', AT).last, 300);
  // a stored number whose year text is not the year of its own record time is out of order, even with a valid chain
  for (const [stream, no] of [['invoices', 'SV/2027-28/0001'], ['invoices', 'SCN/27-28/0001'], ['receipts', 'SAR/25-26/0001']]) {
    const wrongYear = makeAdapter();
    forgeChain(wrongYear, stream, 3, (n) => ({ k: 'TEST', b: n === 2 ? { no } : { jobId: 'J-' + n } }));
    const wo = newStore(wrongYear, makeClock(AT)).open();
    assert.equal(wo.blocked, true, no);
    assert.equal(wo.problems[0].code, 'SVCS_SERIES_GAP', no);
    assert.equal(wo.problems[0].stream, stream, no);
    assert.equal(wo.problems[0].n, 2, no);
  }
});
