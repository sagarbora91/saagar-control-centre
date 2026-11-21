// Service wave 2, W-BRIDGE: end to end. The REAL money module and the REAL store write a day of receipts; the shard text
// is copied into the bridge harness (P4 12.4 X01-X03). Expected figures are typed by hand (paise).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build, adv, good, OWNER, MANAGER, CASHIER, TECH } from './lib/svc2-money-kit.mjs';
import { makeBridge, FY, TODAY, closedJob, noMarker, markers, sumRows } from './lib/svc2-bridge-seed.mjs';

const D = '2026-11-18';
const NOW18 = '2026-11-18T06:00:00.000Z';
const OPEN18 = { [D]: { date: D, closed: false } };

function aDay() {
  const h = build();
  h.cases.add('J1').add('J2').add('J3').add('J4');
  adv(h, 'J1', 150000, 'Cash');                                  // SAR/26-27/0001
  adv(h, 'J2', 80050, 'UPI');                                    // SAR/26-27/0002
  h.view.issue('J2', 200000, 'SV/2026-27/0001');
  good(h.api.takeBalance({ jobId: 'J2', invoiceNo: 'SV/2026-27/0001', amountPaise: 119950, payMode: 'Card' }, h.ctx(OWNER)));   // SRC/26-27/0001
  adv(h, 'J3', 9999, 'Cash');                                    // SAR/26-27/0003, reversed below
  good(h.api.reverse({ no: 'SAR/26-27/0003', reason: 'wrong job picked' }, h.ctx(MANAGER)));
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: D, amountPaise: 35000, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 35000, payMode: 'Cash' }, h.ctx(MANAGER)));            // SRC/26-27/0002
  adv(h, 'J4', 5000, 'Bank');                                    // SAR/26-27/0004
  good(h.api.refund({ jobId: 'J1', amountPaise: 20000, payMode: 'Cash', reason: 'part not needed', advanceNo: 'SAR/26-27/0001' }, h.pin(OWNER)));   // SRF/26-27/0001
  good(h.api.refund({ jobId: 'J4', amountPaise: 5000, payMode: 'Bank', reason: 'job cancelled', advanceNo: 'SAR/26-27/0004' }, h.pin(OWNER)));       // SRF/26-27/0002
  return h;
}
const shards = (h) => Object.fromEntries([...h.adapter.data.entries()].filter(([k]) => /^saagar_svcs_receipts_v1_FY/.test(k)));
const bridgeFor = (h, extra = {}) => makeBridge(Object.assign({ tanishq_statements: OPEN18 }, shards(h), extra), { now: NOW18 });

test('X00 the bridge reads the real store records: nothing is "bad", every receipt is seen', () => {
  const h = aDay();
  const b = bridgeFor(h);
  b.run();
  const s = b.ctx.SaagarBridge.serviceMoney();
  assert.equal(s.ok, true);
  assert.equal(s.bad, 0);
  assert.equal(s.receipts, 8, 'SAR x4, SRC x2, SRF x2 (the reversal record is not a receipt)');
});

test('X01 the Service day summary equals the sums of the live Expense rows of the day, per mode and type, to the paisa', () => {
  const h = aDay();
  const b = bridgeFor(h);
  b.run(); b.run(); b.run();
  const sum = h.api.daySummary(D, h.ctx(OWNER));
  assert.equal(sum.ok, true);
  // by hand: Cash 150000 + 35000, UPI 80050, Card 119950, Bank 5000 (the 9999 advance was reversed)
  assert.deepEqual([sum.receipts.Cash, sum.receipts.UPI, sum.receipts.Card, sum.receipts.Bank, sum.receipts.total], [185000, 80050, 119950, 5000, 390000]);
  assert.deepEqual([sum.refunds.Cash, sum.refunds.Bank, sum.refunds.total], [20000, 5000, 25000]);
  const rows = b.ledger();
  for (const m of ['Cash', 'UPI', 'Card', 'Bank']) {
    assert.equal(sumRows(rows, 'income', m), sum.receipts[m], 'income ' + m);
    assert.equal(sumRows(rows, 'expense', m), sum.refunds[m], 'expense ' + m);
  }
  assert.equal(sumRows(rows, 'income'), 390000);
  assert.equal(sumRows(rows, 'expense'), 25000);
  // the advance that was reversed before the bridge ever ran has no row at all; every row is dated the day
  assert.equal(rows.some((x) => x.sourceRef === 'wscr_SAR/26-27/0003'), false);
  assert.ok(noMarker(rows).every((x) => x.date === D));
  assert.equal(noMarker(rows).length, 7);
  assert.deepEqual(markers(rows).map((x) => x.sourceRef), ['wsc_J1', 'wsc_J2', 'wsc_J4'], 'one marker per job with a live receipt; J3 was reversed');
  assert.equal(b.writes.gm_expenses, 1);
});

test('X02 old rows of two old closed jobs stay; new rows are added; replay is stable', () => {
  const h = aDay();
  const olds = ['OLDA', 'OLDB'].map((id, i) => ({ id: 'e_wsc_' + id, type: 'income', date: '2026-11-17', amount: 500 + i, mode: 'Cash', category: 'Service Income', source: 'wsc', sourceRef: 'wsc_' + id, void: false, createdAt: '2026-11-17T05:00:00.000Z', createdBy: 'bridge', editLog: [] }));
  const b = bridgeFor(h, { gm_expenses: olds, saagar_wsf_v2: [closedJob('OLDA', { closedAt: '2026-11-17T05:00:00Z' }), closedJob('OLDB', { closedAt: '2026-11-17T05:00:00Z' })] });
  b.run();
  assert.deepEqual(b.ledger().slice(0, 2), olds);
  assert.equal(noMarker(b.ledger()).length, 2 + 7);
  const keep = b.dump();
  b.run(); b.run();
  assert.equal(b.dump(), keep);
});

test('X02b a same-day reversal AFTER the row was posted voids it, and the day summary still equals the live rows', () => {
  const h = build();
  h.cases.add('J1');
  adv(h, 'J1', 70000, 'UPI');
  const b = bridgeFor(h);
  b.run();
  assert.equal(sumRows(b.ledger(), 'income', 'UPI'), 70000);
  good(h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong amount typed' }, h.ctx(MANAGER)));
  for (const [k, v] of Object.entries(shards(h))) b.set(k, v);
  b.run(); b.run();
  assert.equal(noMarker(b.ledger())[0].void, true);
  assert.equal(sumRows(b.ledger(), 'income', 'UPI'), h.api.daySummary(D, h.ctx(OWNER)).receipts.UPI);
  assert.equal(sumRows(b.ledger(), 'income', 'UPI'), 0);
});

test('X03 the ledger write fails twice then works: exactly one row per receipt after all runs', () => {
  const h = aDay();
  const b = bridgeFor(h);
  b.failNext('gm_expenses'); b.run();
  assert.equal(b.ledger().length, 0);
  b.failNext('gm_expenses'); b.run();
  assert.equal(b.ledger().length, 0);
  b.run(); b.run();
  assert.equal(noMarker(b.ledger()).length, 7);
  const refs = noMarker(b.ledger()).map((x) => x.sourceRef);
  assert.equal(new Set(refs).size, 7);
  assert.equal(sumRows(b.ledger(), 'income'), 390000);
});

test('X04 the Service page never writes the ledger and the bridge never writes the Service keys', () => {
  const h = aDay();
  const before = JSON.stringify(shards(h));
  const b = bridgeFor(h);
  b.run(); b.run();
  assert.equal(JSON.stringify(Object.fromEntries([...b.map.entries()].filter(([k]) => /^saagar_svcs_/.test(k)))), before);
  assert.deepEqual(Object.keys(b.writes).filter((k) => k.startsWith('saagar_svcs_')), []);
  assert.equal(h.adapter.data.has('gm_expenses'), false);
});

test('X05 a receipt the real money module wrote on the day before the bridge ran is dated its own day (IST docDate)', () => {
  const h = build({ start: '2026-11-17T20:00:00.000Z' });      // 01:30 IST on 18 November
  h.cases.add('J1');
  adv(h, 'J1', 10000, 'Cash');
  const rec = JSON.parse(h.adapter.data.get('saagar_svcs_receipts_v1_FY2026-27'))[0];
  assert.equal(rec.b.docDate, '2026-11-18');
  const b = makeBridge(Object.assign({ tanishq_statements: OPEN18 }, shards(h)), { now: NOW18 });
  b.run();
  assert.equal(noMarker(b.ledger())[0].date, '2026-11-18');
});

test('X06 three receipts hand-checked end to end: an advance, then the balance in two parts by UPI and Card', () => {
  const h = build();
  h.cases.add('JH');
  adv(h, 'JH', 50000, 'Cash');                                   // advance 500.00
  h.view.issue('JH', 120000, 'SV/2026-27/0001');                 // bill 1,200.00
  good(h.api.takeBalance({ jobId: 'JH', invoiceNo: 'SV/2026-27/0001', amountPaise: 30000, payMode: 'UPI' }, h.ctx(OWNER)));
  good(h.api.takeBalance({ jobId: 'JH', invoiceNo: 'SV/2026-27/0001', amountPaise: 40000, payMode: 'Card' }, h.ctx(OWNER)));
  const b = bridgeFor(h);
  b.run();
  assert.deepEqual(noMarker(b.ledger()).map((x) => [x.id, x.type, x.mode, x.amount]), [
    ['e_wscr_SAR_26-27_0001', 'income', 'Cash', 500],
    ['e_wscr_SRC_26-27_0001', 'income', 'UPI', 300],
    ['e_wscr_SRC_26-27_0002', 'income', 'Card', 400]
  ]);
  assert.equal(sumRows(b.ledger(), 'income'), 120000, 'the whole bill is income, counted once');
});
