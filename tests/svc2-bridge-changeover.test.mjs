// Service wave 2, W-BRIDGE: the change-over between the old delivery path (SERVICE_DELIVERED, row wsc_<job>) and the
// receipts path (rows wscr_<no>), fail-closed reading, marker rows, the reused-number guard, the truth table of
// P4 3.3 as corrected by plan 2.16 / C-MONEY, and the Expense Sync tab. Expected values are typed by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExpense } from './lib/fix-s07-expense-harness.mjs';
import {
  makeBridge, FY, TODAY, sar, src, srf, rrv, shard, closedJob, openStmts, rowsOf, live, noMarker, markers, sumRows, oldSource, FY_P2
} from './lib/svc2-bridge-seed.mjs';

const OPEN = openStmts();
const world = (extra = {}) => Object.assign({ tanishq_statements: OPEN }, extra);
const oldRows = (b, job) => b.ledger().filter((x) => x.sourceRef === 'wsc_' + job);
const incomeOf = (b) => sumRows(b.ledger(), 'income') - 0;
const deliveredEvents = (b) => b.events('SERVICE_DELIVERED');

/* ---------------------------------------------------------------- B11 to B15 */
test('B11 a closed job with a live receipt makes no delivery event and no wsc_ income; the other cases behave as before', () => {
  const b = makeBridge(world({
    saagar_wsf_v2: [closedJob('PAID'), closedJob('OLD'), closedJob('REFUNDONLY', { delivery: { finalAmt: 300, payMode: 'UPI', collectDate: TODAY } }), closedJob('REVONLY', { delivery: { finalAmt: 450, payMode: 'Cash', collectDate: TODAY } })],
    [FY]: shard(
      sar('SAR/26-27/0001', 'PAID', 10000),
      srf('SRF/26-27/0001', { jobId: 'REFUNDONLY', amountPaise: 2000 }),
      sar('SAR/26-27/0002', 'REVONLY', 5000), rrv('SAR/26-27/0002')
    )
  }));
  b.run();
  const ev = deliveredEvents(b).map((e) => e.payload.cid).sort();
  assert.deepEqual(ev, ['OLD', 'REFUNDONLY', 'REVONLY']);
  assert.equal(oldRows(b, 'PAID').filter((x) => x.void !== true).length, 0);
  assert.equal(live(oldRows(b, 'OLD')).length, 1);
  assert.equal(live(oldRows(b, 'OLD'))[0].amount, 777);
  assert.equal(live(oldRows(b, 'REFUNDONLY'))[0].amount, 300);
  assert.equal(live(oldRows(b, 'REVONLY'))[0].amount, 450);
});

test('B12 an unreadable shard stops Service posting and emitting for the whole cycle, and nothing is lost afterwards', () => {
  const good = shard(sar('SAR/26-27/0001', 'PAID', 10000));
  const b = makeBridge(world({
    saagar_wsf_v2: [closedJob('PAID'), closedJob('OLD')],
    [FY]: '[{"n":1,"k":"SAR"',            // cut off in the middle: not valid JSON
    saagar_bus: [{ id: 'SERVICE_DELIVERED:HELD@2026-11-11T05:00:00Z', type: 'SERVICE_DELIVERED', at: '2026-11-11T05:00:00.000Z', src: 'wsc', consumed: {}, rd: '2026-11-11', payload: { cid: 'HELD', closedAt: '2026-11-11T05:00:00Z', date: '2026-11-11', amount: 321, mode: 'Cash' } }]
  }));
  b.run();
  assert.equal(deliveredEvents(b).filter((e) => e.payload.cid !== 'HELD').length, 0, 'no delivery event for any job');
  assert.ok(!deliveredEvents(b)[0].consumed.expense, 'the old unconsumed event stays unconsumed');
  assert.equal(b.ledger().length, 0);
  const it = b.items().filter((i) => i.area === 'Expense' && i.sev === 'high');
  assert.equal(it.length, 1);
  assert.equal(it[0].msg, '1 service money record(s) could not be read and were not posted - ask support');
  assert.equal(b.ctx.SaagarBridge.serviceMoney().ok, false);
  // a shard that is valid JSON but not a list is also damaged
  b.set(FY, '{"a":1}');
  b.run();
  assert.equal(b.ledger().length, 0);
  // fixed: normal next cycle, nothing doubled
  b.set(FY, good);
  b.run();
  const rows = noMarker(b.ledger()).map((x) => [x.sourceRef, x.amount]);
  assert.deepEqual(rows.sort(), [['wsc_HELD', 321], ['wsc_OLD', 777], ['wscr_SAR/26-27/0001', 100]].sort());
  assert.equal(oldRows(b, 'PAID').filter((x) => x.void !== true).length, 0);
  const keep = b.raw('gm_expenses');
  b.run();
  assert.equal(b.raw('gm_expenses'), keep);
});

test('B12b a second shard that is damaged blocks the whole stream, even if the first one is fine', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedJob('OLD')], [FY]: shard(sar('SAR/26-27/0001', 'J1', 100)), 'saagar_svcs_receipts_v1_FY2026-27_p2': 'not json' }));
  b.run();
  assert.equal(b.ledger().length, 0);
  assert.equal(deliveredEvents(b).length, 0);
});

test('B12c a record the bridge cannot read, naming a job, holds that job (never posts, never consumes the old entry)', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedJob('J1'), closedJob('J2')], [FY]: shard(sar('SAR/26-27/0001', 'J1', 0)) }));
  b.run();
  assert.deepEqual(deliveredEvents(b).map((e) => e.payload.cid), ['J2']);
  assert.equal(live(oldRows(b, 'J1')).length, 0);
  assert.equal(live(oldRows(b, 'J2')).length, 1);
  // an event emitted earlier for J1 stays unconsumed while the bad record exists
  const c = makeBridge(world({
    saagar_wsf_v2: [closedJob('J1')],
    saagar_bus: [{ id: 'SERVICE_DELIVERED:J1@2026-11-12T05:00:00Z', type: 'SERVICE_DELIVERED', at: '2026-11-12T05:00:00.000Z', src: 'wsc', consumed: {}, rd: TODAY, payload: { cid: 'J1', closedAt: '2026-11-12T05:00:00Z', date: TODAY, amount: 777, mode: 'Cash' } }],
    [FY]: shard(sar('SAR/26-27/0001', 'J1', 0))
  }));
  c.run();
  assert.equal(live(oldRows(c, 'J1')).length, 0);
  assert.ok(!deliveredEvents(c)[0].consumed.expense);
  c.set(FY, shard());
  c.run();
  assert.equal(live(oldRows(c, 'J1')).length, 1, 'once the bad record is gone the old entry posts as before');
});

test('B13 an old unconsumed delivery event of a job that now has a live receipt is consumed with no wsc_ row', () => {
  const b = makeBridge(world({
    saagar_bus: [{ id: 'SERVICE_DELIVERED:J1@2026-11-12T05:00:00Z', type: 'SERVICE_DELIVERED', at: '2026-11-12T05:00:00.000Z', src: 'wsc', consumed: {}, rd: TODAY, payload: { cid: 'J1', closedAt: '2026-11-12T05:00:00Z', date: TODAY, amount: 777, mode: 'Cash' } }],
    saagar_wsf_v2: [closedJob('J1')],
    [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000))
  }));
  b.run();
  assert.equal(deliveredEvents(b)[0].consumed.expense, true);
  assert.equal(oldRows(b, 'J1').filter((x) => x.void !== true).length, 0);
  assert.equal(sumRows(b.ledger(), 'income'), 10000);
});

test('B14 an active wsc_ row plus a live receipt: the "twice" item, nothing changed, no marker; two rows with one wscr_ key also count', () => {
  const old = { id: 'e_wsc_J1', type: 'income', date: TODAY, amount: 777, mode: 'Cash', category: 'Service Income', source: 'wsc', sourceRef: 'wsc_J1', void: false, createdAt: '2026-11-12T05:00:00Z', editLog: [] };
  const b = makeBridge(world({ gm_expenses: [old], [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000)) }));
  b.run();
  assert.deepEqual(b.ledger().map((x) => x.sourceRef), ['wsc_J1', 'wscr_SAR/26-27/0001']);
  assert.deepEqual(b.ledger()[0], old);
  const it = b.items().filter((i) => i.area === 'Expense' && i.sev === 'high');
  assert.equal(it.length, 1);
  assert.equal(it[0].msg, '1 service job(s) are in the cash book twice (old delivery entry and receipts) - review in Expense');
  const dup = { id: 'e_dup', type: 'income', date: TODAY, amount: 100, mode: 'Cash', source: 'wsc', sourceRef: 'wscr_SAR/26-27/0001', void: false, description: 'Service advance SAR/26-27/0001 - job J1', createdAt: 'x', editLog: [] };
  const c = makeBridge(world({ gm_expenses: [Object.assign({}, dup, { id: 'e_a' }), Object.assign({}, dup, { id: 'e_b' })], [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000)) }));
  c.run();
  assert.equal(c.items().filter((i) => /in the cash book twice/.test(i.msg)).length, 1);
  assert.equal(c.ledger().filter((x) => x.sourceRef === 'wscr_SAR/26-27/0001').length, 2, 'nothing is removed or added');
});

test('B15 an Owner deletion tombstone never voids a wscr_ row; the old tombstone void of a wsc_ row still works', () => {
  const tomb = (id) => ({ id, at: '2026-11-12T06:00:01.000Z', by: 'Owner', was: 'closed', ownerPin: true, reason: 'wrong entry', ledgerRef: 'wsc_' + id });
  const b = makeBridge(world({
    saagar_wsf_v2: [closedJob('OLD')],
    [FY]: shard(sar('SAR/26-27/0001', 'PAID', 10000))
  }));
  b.run();
  b.set('saagar_wsf_settings_v1', { deleted: [tomb('PAID'), tomb('OLD')] });
  b.set('saagar_wsf_v2', []);
  b.setNow('2026-11-12T07:00:00.000Z');
  b.run();
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001')[0].void, false);
  assert.equal(oldRows(b, 'OLD')[0].void, true);
  assert.match(oldRows(b, 'OLD')[0].voidReason, /^Service case OLD was deleted/);
  assert.equal(sumRows(b.ledger(), 'income'), 10000);
});

/* ---------------------------------------------------------------- marker rows */
const MARK = (job, over = {}) => Object.assign({
  id: 'e_wscg_' + job, type: 'income', date: TODAY, amount: 0, category: 'Service Income', mode: 'Cash', vendor: '', firm: '',
  description: 'Paid by Service receipts (see the wscr_ rows). Not income.', notes: '', billPhoto: null, source: 'wsc', sourceRef: 'wsc_' + job,
  void: true, voidReason: 'Marker: this job is paid by Service receipts', createdAt: '2026-11-12T06:00:00.000Z', createdBy: 'bridge', editLog: []
}, over);

test('M1 one marker row per job, exact fields, written with the receipts in one write, never twice', () => {
  const b = makeBridge(world({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000), src('SRC/26-27/0001', { jobId: 'J1', invoiceNo: 'SV/2026-27/0001', amountPaise: 5000 }), sar('SAR/26-27/0002', 'J2', 300)) }));
  b.run();
  assert.equal(b.writes.gm_expenses, 1, 'receipts and markers go in one write');
  assert.deepEqual(markers(b.ledger()), [MARK('J1'), MARK('J2')]);
  assert.equal(b.ledger().length, 5);
  const keep = b.raw('gm_expenses');
  b.run(); b.run();
  assert.equal(b.raw('gm_expenses'), keep);
  assert.equal(b.writes.gm_expenses, 1);
});

test('M2 a marker is never written over an existing wsc_ row, active or void', () => {
  const row = (job, over) => Object.assign({ id: 'e_wsc_' + job, type: 'income', date: TODAY, amount: 777, mode: 'Cash', category: 'Service Income', source: 'wsc', sourceRef: 'wsc_' + job, void: false, createdAt: 'x', editLog: [] }, over);
  const b = makeBridge(world({
    gm_expenses: [row('ACTIVE'), row('VOIDED', { void: true })],
    [FY]: shard(sar('SAR/26-27/0001', 'ACTIVE', 100), sar('SAR/26-27/0002', 'VOIDED', 100), sar('SAR/26-27/0003', 'FRESH', 100))
  }));
  b.run();
  assert.deepEqual(markers(b.ledger()).map((x) => x.sourceRef), ['wsc_FRESH'], 'the void row is the marker already; none is added for ACTIVE or VOIDED');
  assert.equal(b.ledger().filter((x) => x.sourceRef === 'wsc_ACTIVE').length, 1);
  assert.equal(b.ledger().filter((x) => x.sourceRef === 'wsc_VOIDED').length, 1);
});

test('M3 an in-book advance gets a marker (the job is receipt-paid) but no money row; a reversed-only job gets none', () => {
  const b = makeBridge(world({ [FY]: shard(sar('SAR/26-27/0001', 'BOOK', 80000, TODAY, { legacy: true, inBook: true }), sar('SAR/26-27/0002', 'GONE', 500), rrv('SAR/26-27/0002')) }));
  b.run();
  assert.deepEqual(b.ledger().map((x) => x.sourceRef), ['wsc_BOOK']);
  assert.equal(sumRows(b.ledger(), 'income'), 0);
});

test('M4 a marker waits for an open day and a counter receipt (no job) gets none', () => {
  const b = makeBridge({ tanishq_statements: { [TODAY]: { date: TODAY, closed: true } }, [FY]: shard(sar('SAR/26-27/0001', 'J1', 100)) });
  b.run();
  assert.equal(b.ledger().length, 0);
  b.set('tanishq_statements', OPEN);
  b.run();
  assert.equal(markers(b.ledger()).length, 1);
  assert.equal(noMarker(b.ledger()).length, 1);
});

test('M5 a marker id never clashes with an existing id', () => {
  const b = makeBridge(world({ gm_expenses: [{ id: 'e_wscg_J1', type: 'expense', date: TODAY, amount: 1, mode: 'Cash', sourceRef: 'hand_1' }], [FY]: shard(sar('SAR/26-27/0001', 'J1', 100)) }));
  b.run();
  assert.equal(markers(b.ledger())[0].id, 'e_wscg_J1_2');
});

test('M6 a reversal later does not remove the marker; the old path then posts for a job closed by the old form', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [{ id: 'J1', status: 'open' }], [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000)) }));
  b.run();
  assert.equal(markers(b.ledger()).length, 1);
  b.set(FY, shard(sar('SAR/26-27/0001', 'J1', 10000), rrv('SAR/26-27/0001')));
  b.set('saagar_wsf_v2', [closedJob('J1')]);
  b.run();
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001')[0].void, true);
  const live777 = live(oldRows(b, 'J1'));
  assert.equal(live777.length, 1);
  assert.equal(live777[0].amount, 777);
  assert.equal(sumRows(b.ledger(), 'income'), 77700);
  assert.equal(oldRows(b, 'J1').length, 2, 'the void marker and the real old row');
});

/* ---------------------------------------------------------------- safety on the ledger itself */
test('S1 a ledger that cannot be read is never overwritten', () => {
  const b = makeBridge(world({ gm_expenses: '[{"id":"x"', [FY]: shard(sar('SAR/26-27/0001', 'J1', 100)) }));
  b.run();
  assert.equal(b.raw('gm_expenses'), '[{"id":"x"');
  assert.equal(b.writes.gm_expenses, undefined);
  const c = makeBridge(world({ gm_expenses: '{"a":1}', [FY]: shard(sar('SAR/26-27/0001', 'J1', 100)) }));
  c.run();
  assert.equal(c.raw('gm_expenses'), '{"a":1}');
});

test('S1b (A-BRIDGE) a ledger that cannot be read is never silent: Home says the receipts could not be saved', () => {
  const b = makeBridge(world({ gm_expenses: '[{"id":"x"', [FY]: shard(sar('SAR/26-27/0001', 'J1', 100), sar('SAR/26-27/0002', 'J2', 200)) }));
  b.run();
  assert.equal(b.raw('gm_expenses'), '[{"id":"x"');
  assert.equal(b.ctx.SaagarBridge.serviceMoney().failed, 2);
  const it = b.items().filter((i) => /could not be saved to the cash book/.test(i.msg));
  assert.equal(it.length, 1);
  assert.equal(it[0].sev, 'high');
  assert.match(it[0].msg, /^2 service receipt/);
  // readable again: posts once, item gone
  b.set('gm_expenses', '[]'); b.run(); b.run();
  assert.equal(b.ledger().filter((x) => String(x.sourceRef).indexOf('wscr_') === 0).length, 2);
  assert.equal(b.items().filter((i) => /could not be saved/.test(i.msg)).length, 0);
});

test('S1c (A-BRIDGE 2) an unreadable cash book is NEVER overwritten, also when an old closed job is waiting; the old entry waits and Home says so', () => {
  for (const bad of ['[{"id":"x"', '[1,2', 'not json']) {
    for (const withReceipts of [false, true]) {
      const init = { gm_expenses: bad, saagar_wsf_v2: [closedJob('OLD')] };
      if (withReceipts) init[FY] = shard(sar('SAR/26-27/0001', 'J1', 100));
      const b = makeBridge(world(init));
      b.run(); b.run();
      assert.equal(b.raw('gm_expenses'), bad, 'ledger text kept (' + bad + ', receipts ' + withReceipts + ')');
      const ev = b.events('SERVICE_DELIVERED');
      assert.equal(ev.length, 1);
      assert.ok(!(ev[0].consumed && ev[0].consumed.expense), 'the old entry was not consumed: it waits');
      const it = b.items().filter((i) => /cash book \(Expense\) could not be read/.test(i.msg));
      assert.equal(it.length, 1);
      assert.equal(it[0].sev, 'high');
      // repaired: the old entry posts once, the receipt once
      b.set('gm_expenses', '[]'); b.run(); b.run();
      assert.equal(live(rowsOf(b, 'wsc_OLD')).length, 1);
      assert.equal(live(rowsOf(b, 'wsc_OLD'))[0].amount, 777);
      assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001').length, withReceipts ? 1 : 0);
      assert.equal(b.items().filter((i) => /cash book \(Expense\) could not be read/.test(i.msg)).length, 0);
    }
  }
  // the old bridge did overwrite it (the reason for this test)
  const o = makeBridge(world({ gm_expenses: '[{"id":"x"', saagar_wsf_v2: [closedJob('OLD')] }), { source: oldSource });
  o.run();
  assert.notEqual(o.raw('gm_expenses'), '[{"id":"x"');
  // valid JSON that is not a list: never written (as before, the old consumer stops), the old entry waits, no new Home item (byte-identical to 031841f)
  const nl = makeBridge(world({ gm_expenses: '{"a":1}', saagar_wsf_v2: [closedJob('OLD')] }));
  nl.run(); nl.run();
  assert.equal(nl.raw('gm_expenses'), '{"a":1}');
  assert.equal(nl.items().filter((i) => /cash book \(Expense\) could not be read/.test(i.msg)).length, 0);
  // a key that holds the JSON text null, or nothing, is an empty cash book (as before)
  for (const empty of ['null', '']) {
    const e = makeBridge(world({ gm_expenses: empty, saagar_wsf_v2: [closedJob('OLD')] }));
    e.run();
    assert.equal(live(rowsOf(e, 'wsc_OLD')).length, 1);
    assert.equal(e.items().filter((i) => /cash book \(Expense\) could not be read/.test(i.msg)).length, 0);
  }
});

test('S1d (A-BRIDGE 2) a receipts shard whose read throws stops Service posting and emitting; nothing is lost when it reads again', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedJob('PAID'), closedJob('OLD')], [FY]: shard(sar('SAR/26-27/0001', 'PAID', 10000)) }));
  const real = b.ctx.localStorage;
  let boom = true;
  b.ctx.localStorage = { getItem: (k) => { if (boom && k === FY) throw new Error('read fail'); return real.getItem(k); },
    setItem: (k, v) => real.setItem(k, v), removeItem: (k) => real.removeItem(k), key: (i) => real.key(i), get length() { return real.length; } };
  b.run(); b.run();
  assert.equal(b.ledger().length, 0, 'nothing posted');
  assert.equal(b.events('SERVICE_DELIVERED').length, 0, 'nothing emitted');
  assert.equal(b.ctx.SaagarBridge.serviceMoney().ok, false);
  assert.equal(b.items().filter((i) => /could not be read and were not posted/.test(i.msg) && i.sev === 'high').length, 1);
  boom = false; b.run(); b.run();
  assert.equal(live(rowsOf(b, 'wsc_OLD')).length, 1);
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001').length, 1);
  assert.equal(live(rowsOf(b, 'wsc_PAID')).length, 0);
});

test('S1e (A-BRIDGE 2) a receipt record that carries the number of another series is a bad record: not posted, its job waits', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedJob('J1')], [FY]: shard(sar('SRF/26-27/0009', 'J1', 10000), sar('SAR/26-27/0001', 'J2', 500)) }));
  b.run(); b.run();
  assert.equal(rowsOf(b, 'wscr_SRF/26-27/0009').length, 0);
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001').length, 1);
  assert.equal(b.ctx.SaagarBridge.serviceMoney().bad, 1);
  assert.equal(b.events('SERVICE_DELIVERED').length, 0, 'J1 is held: the old entry neither emits nor posts');
  assert.equal(rowsOf(b, 'wsc_J1').length, 0);
});

test('S1f (A-BRIDGE 2) shards are read in order (year, then part) whatever the storage order: rows keep that order, the first copy of a number wins', () => {
  const FY27 = 'saagar_svcs_receipts_v1_FY2027-28';
  const seed = world({});
  seed[FY27] = shard(sar('SAR/27-28/0001', 'J3', 300));
  seed[FY_P2] = shard(sar('SAR/26-27/0002', 'J2', 200), sar('SAR/26-27/0001', 'J9', 999));
  seed[FY] = shard(sar('SAR/26-27/0001', 'J1', 100));
  const b = makeBridge(seed);
  b.run(); b.run();
  assert.deepEqual(noMarker(b.ledger()).map((x) => x.sourceRef + '=' + x.amount), ['wscr_SAR/26-27/0001=1', 'wscr_SAR/26-27/0002=2', 'wscr_SAR/27-28/0001=3']);
  assert.equal(b.ctx.SaagarBridge.serviceMoney().reused, 1, 'the later copy of SAR/26-27/0001 (another amount, another job) is flagged');
});

test('S2 Phase 1 counter sales are never posted: only the receipts stream is read', () => {
  const b = makeBridge(world({
    saagar_svcs_ledger_v1_FY2026: [{ n: 1, k: 'CSL', b: { no: 'CSL/26-27/0001', amountPaise: 90000, payMode: 'Cash', moneyPosted: false } }],
    saagar_svcs_ledger_v1_FY2026_p2: [{ n: 1, k: 'CSL', b: { no: 'CSL/26-27/0002', amountPaise: 1000, rcptDue: true, payMode: 'Cash' } }],
    saagar_svcs_invoices_v1_FY2026: [{ n: 1, k: 'INV_ISSUE', b: { no: 'SV/2026-27/0001', jobId: 'J1' } }]
  }));
  b.run();
  assert.equal(b.ledger().length, 0);
  assert.equal(b.items().filter((i) => /service/i.test(i.msg)).length, 0);
});

test('S3 a counter receipt posts as income; the sale that carries rcptDue posts nothing by itself', () => {
  const b = makeBridge(world({
    saagar_svcs_ledger_v1_FY2026: [{ n: 1, k: 'CSL', b: { no: 'CSL/26-27/0001', amountPaise: 9000, rcptDue: true } }],
    [FY]: shard(src('SRC/26-27/0001', { saleNo: 'CSL/26-27/0001', amountPaise: 9000, payMode: 'Card' }))
  }));
  b.run();
  assert.deepEqual(b.ledger().map((x) => [x.sourceRef, x.amount, x.mode]), [['wscr_SRC/26-27/0001', 90, 'Card']]);
});

/* ---------------------------------------------------------------- reused-number guard */
test('R1 a row that holds the number but another amount: nothing is posted, one "seen twice" item', () => {
  const squat = { id: 'e_old', type: 'income', date: TODAY, amount: 50, mode: 'Cash', source: 'wsc', sourceRef: 'wscr_SAR/26-27/0001', void: false, description: 'Service advance SAR/26-27/0001 - job J1', createdAt: 'x', editLog: [] };
  const b = makeBridge(world({ gm_expenses: [squat], [FY]: shard(sar('SAR/26-27/0001', 'J1', 123457)) }));
  b.run();
  assert.equal(b.ledger().filter((x) => x.sourceRef === 'wscr_SAR/26-27/0001').length, 1);
  assert.equal(b.ledger().find((x) => x.id === 'e_old').amount, 50);
  const it = b.items().filter((i) => i.area === 'Expense' && i.sev === 'high' && /seen twice/.test(i.msg));
  assert.equal(it.length, 1);
  assert.equal(it[0].msg, 'Service receipt number seen twice - review in Expense (1)');
});

test('R2 same amount but the description names another job or sale: the same item; the right job and a prefix-lookalike job', () => {
  const rowFor = (desc) => ({ id: 'e_old', type: 'income', date: TODAY, amount: 100, mode: 'Cash', source: 'wsc', sourceRef: 'wscr_SAR/26-27/0001', void: false, description: desc, createdAt: 'x', editLog: [] });
  const seen = (desc, job = 'J1') => {
    const b = makeBridge(world({ gm_expenses: [rowFor(desc)], [FY]: shard(sar('SAR/26-27/0001', job, 10000)) }));
    b.run();
    return b.items().filter((i) => /seen twice/.test(i.msg)).length;
  };
  assert.equal(seen('Service advance SAR/26-27/0001 - job J1'), 0);
  assert.equal(seen('Service advance SAR/26-27/0001 - job J1 - Test Customer (Titan Edge)'), 0);
  assert.equal(seen('Service advance SAR/26-27/0001 - job J7'), 1);
  assert.equal(seen('Service advance SAR/26-27/0001 - job J10'), 1, 'J1 is not J10');
  assert.equal(seen('typed by hand'), 1);
  // counter receipt: the sale must be named
  const b = makeBridge(world({ gm_expenses: [Object.assign(rowFor('Counter sale receipt SRC/26-27/0001 - sale CSL/26-27/0009'), { sourceRef: 'wscr_SRC/26-27/0001' })], [FY]: shard(src('SRC/26-27/0001', { saleNo: 'CSL/26-27/0001', amountPaise: 10000 })) }));
  b.run();
  assert.equal(b.items().filter((i) => /seen twice/.test(i.msg)).length, 1);
});

/* ---------------------------------------------------------------- truth table P4 3.3, one test per row */
const closedOld = (id, amt = 777, extra = {}) => closedJob(id, Object.assign({ delivery: { finalAmt: amt, payMode: 'Cash', collectDate: TODAY } }, extra));
test('T01 closed before the wave, row already posted: one wsc_ row, unchanged', () => {
  const posted = { id: 'e_wsc_J1', type: 'income', date: TODAY, amount: 777, mode: 'Cash', category: 'Service Income', source: 'wsc', sourceRef: 'wsc_J1', void: false, createdAt: 'x', editLog: [] };
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1')], gm_expenses: [posted], saagar_bus: [{ id: 'SERVICE_DELIVERED:J1@2026-11-12T05:00:00Z', type: 'SERVICE_DELIVERED', at: '2026-11-12T05:00:00.000Z', src: 'wsc', consumed: { expense: true }, rd: TODAY, payload: { cid: 'J1', closedAt: '2026-11-12T05:00:00Z', date: TODAY, amount: 777 } }] }));
  b.run();
  assert.deepEqual(b.ledger(), [posted]);
});
test('T02 closed before the wave within 7 days, bridge had not run: emits and posts one wsc_ row', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1')] }));
  b.run(); b.run();
  assert.equal(b.ledger().length, 1);
  assert.equal(b.ledger()[0].sourceRef, 'wsc_J1');
  assert.equal(b.ledger()[0].amount, 777);
});
test('T03 closed before the wave and held on a closed day: waits, then posts one row', () => {
  const b = makeBridge({ saagar_wsf_v2: [closedOld('J1')], tanishq_statements: { [TODAY]: { date: TODAY, closed: true } } });
  b.run();
  assert.equal(b.ledger().length, 0);
  b.set('tanishq_statements', OPEN);
  b.run(); b.run();
  assert.deepEqual(b.ledger().map((x) => x.sourceRef), ['wsc_J1']);
});
test('T04 closed more than 7 days ago and never posted: the bridge posts nothing (the Sync tab still offers it)', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1', 777, { closedAt: '2026-11-01T05:00:00Z' })] }));
  b.run();
  assert.equal(b.ledger().length, 0);
  assert.equal(deliveredEvents(b).length, 0);
});
test('T05 open job closed by the old form with no receipt: one wsc_ row for the final amount', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1', 1250)] }));
  b.run();
  assert.deepEqual(b.ledger().map((x) => [x.sourceRef, x.amount]), [['wsc_J1', 1250]]);
});
test('T06 advance A and balance B by receipt, then closed: rows for A and B only, income A+B', () => {
  const b = makeBridge(world({
    saagar_wsf_v2: [closedOld('J1', 777)],
    [FY]: shard(sar('SAR/26-27/0001', 'J1', 20000), src('SRC/26-27/0001', { jobId: 'J1', invoiceNo: 'SV/2026-27/0001', amountPaise: 57700 }))
  }));
  b.run(); b.run();
  assert.deepEqual(noMarker(b.ledger()).map((x) => [x.sourceRef, x.amount]), [['wscr_SAR/26-27/0001', 200], ['wscr_SRC/26-27/0001', 577]]);
  assert.equal(sumRows(b.ledger(), 'income'), 77700);
  assert.equal(deliveredEvents(b).length, 0);
});
test('T07 closed with part unpaid: income is the money received, not the bill', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1', 777)], [FY]: shard(sar('SAR/26-27/0001', 'J1', 25000)) }));
  b.run();
  assert.equal(sumRows(b.ledger(), 'income'), 25000);
});
test('T08 receipts all reversed, then closed by the old form: the old entry posts the final amount', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1', 777)], [FY]: shard(sar('SAR/26-27/0001', 'J1', 25000), rrv('SAR/26-27/0001')) }));
  b.run();
  assert.deepEqual(b.ledger().map((x) => [x.sourceRef, x.amount]), [['wsc_J1', 777]]);
});
test('T09 a refund only (credit note on an old invoiced job): old income stays, one outflow row', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1', 777)], [FY]: shard(srf('SRF/26-27/0001', { jobId: 'J1', amountPaise: 10000 })) }));
  b.run();
  assert.deepEqual(b.ledger().map((x) => [x.sourceRef, x.type, x.amount]), [['wsc_J1', 'income', 777], ['wscr_SRF/26-27/0001', 'expense', 100]]);
});
test('T10 an open job with a typed advance and no receipt: nothing is posted for the advance', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [{ id: 'J1', status: 'open', advancePaid: 500 }] }));
  b.run();
  assert.equal(b.ledger().length, 0);
});
test('T11 owner says "already in the cash book": no money row, ever', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [{ id: 'J1', status: 'open', advancePaid: 500 }], [FY]: shard(sar('SAR/26-27/0001', 'J1', 50000, TODAY, { legacy: true, inBook: true })) }));
  b.run(); b.run();
  assert.equal(sumRows(b.ledger(), 'income'), 0);
  assert.equal(noMarker(b.ledger()).length, 0);
});
test('T12 owner says "post now": one new income row dated the decision day, described as an earlier advance', () => {
  const b = makeBridge(world({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 50000, TODAY, { legacy: true, payMode: 'Bank' })) }));
  b.run(); b.run();
  const r = noMarker(b.ledger());
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].date, r[0].amount, r[0].mode, r[0].description], [TODAY, 500, 'Bank', 'Service advance SAR/26-27/0001 (earlier advance, confirmed) - job J1']);
});
test('T13 a job paid by receipts is deleted by the Owner: no wscr_ row is touched', () => {
  const b = makeBridge(world({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000)), saagar_wsf_settings_v1: { deleted: [{ id: 'J1', at: '2026-11-12T07:00:00.000Z', was: 'closed', ownerPin: true, ledgerRef: 'wsc_J1' }] } }));
  b.run();
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001')[0].void, false);
});
test('T14 one old job and one receipt-paid job in the same cycle: each posts exactly once', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('OLD', 500), closedOld('NEW', 900)], [FY]: shard(src('SRC/26-27/0001', { jobId: 'NEW', invoiceNo: 'SV/2026-27/0001', amountPaise: 90000 })) }));
  b.run(); b.run(); b.run();
  assert.deepEqual(noMarker(b.ledger()).map((x) => [x.sourceRef, x.amount]), [['wsc_OLD', 500], ['wscr_SRC/26-27/0001', 900]]);
});
test('T15 an unconsumed old event for a job that has live receipts: consumed, receipts only', () => {
  const b = makeBridge(world({
    saagar_bus: [{ id: 'SERVICE_DELIVERED:J1', type: 'SERVICE_DELIVERED', at: '2026-11-12T05:30:00.000Z', src: 'wsc', consumed: {}, rd: TODAY, payload: { cid: 'J1', date: TODAY, amount: 777, mode: 'Cash' } }],
    [FY]: shard(sar('SAR/26-27/0001', 'J1', 10000))
  }));
  b.run();
  assert.equal(deliveredEvents(b)[0].consumed.expense, true);
  assert.equal(sumRows(b.ledger(), 'income'), 10000);
});
test('T16 unreadable shard: nothing emitted, nothing consumed, nothing posted', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1')], [FY]: 'broken' }));
  b.run();
  assert.equal(b.ledger().length, 0);
  assert.equal(deliveredEvents(b).length, 0);
});
test('T17 a closed job with an active wsc_ row and later live receipts: receipts post, flagged, nothing auto-fixed', () => {
  const old = { id: 'e_wsc_J1', type: 'income', date: TODAY, amount: 777, mode: 'Cash', category: 'Service Income', source: 'wsc', sourceRef: 'wsc_J1', void: false, createdAt: 'x', editLog: [] };
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1')], gm_expenses: [old], [FY]: shard(sar('SAR/26-27/0001', 'J1', 20000)) }));
  b.run();
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001').length, 1);
  assert.equal(b.ledger()[0].void, false);
  assert.equal(b.items().filter((i) => /in the cash book twice/.test(i.msg)).length, 1);
});

/* ---------------------------------------------------------------- Expense Sync tab (feedItems), through the Expense harness */
const feed = (storage) => [...loadExpense({ storage }).run('feedItems().filter(function(i){return i.src==="wsc";}).map(function(i){return i.ref+":"+i.posted+":"+i.amount;})')];

test('E1 without the marker the Sync tab offers the job again (the hole); with it the job is shown as posted', () => {
  const job = closedOld('J1', 777);
  const before = feed({ saagar_wsf_v2: [job], gm_expenses: [] });
  assert.deepEqual(before, ['wsc_J1:false:777']);
  const b = makeBridge(world({ saagar_wsf_v2: [job], [FY]: shard(sar('SAR/26-27/0001', 'J1', 20000), src('SRC/26-27/0001', { jobId: 'J1', invoiceNo: 'SV/2026-27/0001', amountPaise: 57700 })) }));
  b.run();
  assert.deepEqual(feed({ saagar_wsf_v2: [job], gm_expenses: b.ledger() }), ['wsc_J1:true:777']);
});

test('E2 a legacy closed job without receipts is still offered by the Sync tab exactly as before', () => {
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1', 777, { closedAt: '2026-11-01T05:00:00Z' }), closedOld('J2', 500)], [FY]: shard(sar('SAR/26-27/0001', 'J3', 100)) }));
  b.run();
  assert.deepEqual(feed({ saagar_wsf_v2: [closedOld('J1', 777, { closedAt: '2026-11-01T05:00:00Z' }), closedOld('J2', 500)], gm_expenses: b.ledger() }), ['wsc_J1:false:777', 'wsc_J2:true:500']);
});

test('E3 a marker over nothing never hides a job that has a real active old row: the marker is skipped, the old row posts', () => {
  const old = { id: 'e_wsc_J1', type: 'income', date: TODAY, amount: 777, mode: 'Cash', category: 'Service Income', source: 'wsc', sourceRef: 'wsc_J1', void: false, createdAt: 'x', editLog: [] };
  const b = makeBridge(world({ saagar_wsf_v2: [closedOld('J1')], gm_expenses: [old], [FY]: shard(sar('SAR/26-27/0001', 'J1', 100)) }));
  b.run();
  assert.equal(markers(b.ledger()).length, 0);
  assert.deepEqual(feed({ saagar_wsf_v2: [closedOld('J1')], gm_expenses: b.ledger() }), ['wsc_J1:true:777']);
});

test('E4 the marker does not count in any Expense total: it is void and zero', () => {
  const b = makeBridge(world({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 20000)) }));
  b.run();
  const x = loadExpense({ storage: { gm_expenses: b.ledger() } });
  const day = x.run('JSON.stringify(computeDay("' + TODAY + '"))');
  assert.match(String(day), /"cashIn":200/);
});
