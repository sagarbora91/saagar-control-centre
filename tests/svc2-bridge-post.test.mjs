// Service wave 2, W-BRIDGE: posting rules of the bridge (P4 12.3 B01-B10, B16-B19, B22 as corrected by plan 2.16).
// Expected values are typed by hand from the plan and the spec, never copied from the bridge output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  makeBridge, FY, FY_P2, TODAY, sar, src, srf, rrv, shard, closedJob, openStmts, rowsOf, noMarker, markers, newSource
} from './lib/svc2-bridge-seed.mjs';

const REF1 = 'wscr_SAR/26-27/0001';
const seed1 = (extra = {}) => Object.assign({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 123457, TODAY, { payMode: 'UPI', payRef: 'UPI-12345' })), tanishq_statements: openStmts() }, extra);

test('B01 one advance makes one income row with exactly the bound fields', () => {
  const b = makeBridge(seed1());
  b.run();
  const rows = noMarker(b.ledger());
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: 'e_wscr_SAR_26-27_0001', type: 'income', date: TODAY, amount: 1234.57, category: 'Service Income', mode: 'UPI',
    vendor: '', firm: '', description: 'Service advance SAR/26-27/0001 - job J1', notes: 'Pay ref: UPI-12345', billPhoto: null,
    source: 'wsc', sourceRef: REF1, void: false, createdAt: '2026-11-12T06:00:00.000Z', createdBy: 'bridge', editLog: []
  });
});

test('B02 replay: three runs, the ledger is written once and is byte identical after the first run', () => {
  const b = makeBridge(seed1());
  b.run();
  const first = b.raw('gm_expenses');
  const busFirst = b.raw('saagar_bus');
  assert.equal(b.writes.gm_expenses, 1);
  b.run(); b.run();
  assert.equal(b.raw('gm_expenses'), first);
  assert.equal(b.writes.gm_expenses, 1);
  assert.equal(b.raw('saagar_bus'), busFirst);
  assert.equal(noMarker(b.ledger()).length, 1);
});

test('B03 advance, counter-free receipt and refund: types, categories, amounts, modes', () => {
  const b = makeBridge({
    [FY]: shard(
      sar('SAR/26-27/0001', 'J1', 10000, TODAY, { payMode: 'Cash' }),
      src('SRC/26-27/0001', { jobId: 'J1', invoiceNo: 'SV/2026-27/0001', amountPaise: 25050, payMode: 'Other' }),
      srf('SRF/26-27/0001', { jobId: 'J1', amountPaise: 4000, payMode: 'Bank Transfer', reason: 'part returned' })
    ),
    tanishq_statements: openStmts()
  });
  b.run();
  const rows = noMarker(b.ledger());
  assert.deepEqual(rows.map((r) => [r.sourceRef, r.type, r.category, r.mode, r.amount]), [
    ['wscr_SAR/26-27/0001', 'income', 'Service Income', 'Cash', 100],
    ['wscr_SRC/26-27/0001', 'income', 'Service Income', 'Bank', 250.5],
    ['wscr_SRF/26-27/0001', 'expense', 'Miscellaneous', 'Bank', 40]
  ]);
  assert.equal(rows[1].description, 'Service receipt SRC/26-27/0001 - job J1 - invoice SV/2026-27/0001');
  assert.equal(rows[2].description, 'Service refund SRF/26-27/0001 - job J1 - part returned');
});

test('B03b a counter receipt names the sale, not a job', () => {
  const b = makeBridge({ [FY]: shard(src('SRC/26-27/0001', { saleNo: 'CSL/26-27/0001', amountPaise: 9000, payMode: 'UPI' })), tanishq_statements: openStmts() });
  b.run();
  const rows = noMarker(b.ledger());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'Counter sale receipt SRC/26-27/0001 - sale CSL/26-27/0001');
  assert.equal(rows[0].amount, 90);
  assert.equal(markers(b.ledger()).length, 0, 'a counter receipt has no job, so no marker row');
});

test('B04 closed days: post on the day, else today with a note, else wait with one Home item', () => {
  const D10 = '2026-11-10';
  const mk = (stm, date) => makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 5000, date)), tanishq_statements: stm });
  // open day: posted on its own day
  let b = mk(openStmts({ [D10]: { date: D10, closed: false } }), D10);
  b.run();
  assert.equal(noMarker(b.ledger())[0].date, D10);
  assert.doesNotMatch(noMarker(b.ledger())[0].description, /taken/);
  // taken day closed, today open: posted today
  b = mk(openStmts({ [D10]: { date: D10, closed: true } }), D10);
  b.run();
  let row = noMarker(b.ledger())[0];
  assert.equal(row.date, TODAY);
  assert.equal(row.description, 'Service advance SAR/26-27/0001 - job J1 - taken 2026-11-10');
  // both closed: nothing posted, one med Cash item, no frozen word
  b = mk({ [D10]: { date: D10, closed: true }, [TODAY]: { date: TODAY, closed: true } }, D10);
  b.run();
  assert.equal(b.ledger().length, 0);
  const held = b.items().filter((i) => i.area === 'Cash' && i.sev === 'med' && /service receipt/.test(i.msg));
  assert.equal(held.length, 1);
  assert.equal(held[0].msg, '1 service receipt(s) are waiting to be posted - the cash statement is closed. They post by themselves when a day is open. Do not add them by hand.');
  assert.doesNotMatch(held[0].msg, /mismatch|open lead/i);
  // the day opens: posted once, item gone; another run changes nothing
  b.set('tanishq_statements', { [D10]: { date: D10, closed: true }, [TODAY]: { date: TODAY, closed: false } });
  b.run();
  assert.equal(noMarker(b.ledger()).length, 1);
  assert.equal(b.items().filter((i) => /service receipt/.test(i.msg)).length, 0);
  const after = b.raw('gm_expenses');
  b.run();
  assert.equal(b.raw('gm_expenses'), after);
});

test('B04b a tax-locked month never holds a receipt: it posts on the open day', () => {
  const b = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 5000, '2026-10-20')), tanishq_statements: openStmts(), gm_tax_feed: { '2026-10': { gstEstimate: 1 } } });
  b.run();
  const rows = noMarker(b.ledger());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-20');
});

test('B05 an Expense void of the row: not posted again, the drift item appears', () => {
  const b = makeBridge(seed1());
  b.run();
  const led = b.ledger(); led.find((x) => x.sourceRef === REF1).void = true; b.set('gm_expenses', led);
  b.run();
  assert.equal(rowsOf(b, REF1).length, 1);
  assert.equal(rowsOf(b, REF1)[0].void, true);
  const it = b.items().filter((i) => i.sev === 'high' && i.area === 'Cash' && /service receipt/.test(i.msg));
  assert.equal(it.length, 1);
  assert.equal(it[0].msg, '1 service receipt(s) differ from the cash book (changed or voided in Expense) - review them');
});

test('B06 an edited amount: not posted again, the drift item appears', () => {
  const b = makeBridge(seed1());
  b.run();
  const led = b.ledger(); led.find((x) => x.sourceRef === REF1).amount = 999; b.set('gm_expenses', led);
  b.run();
  assert.equal(rowsOf(b, REF1).length, 1);
  assert.equal(rowsOf(b, REF1)[0].amount, 999);
  assert.equal(b.items().filter((i) => i.sev === 'high' && i.area === 'Cash' && /service receipt/.test(i.msg)).length, 1);
});

test('B07 a failed ledger write leaves no row and one failure item; the next run posts once; the third changes nothing', () => {
  const b = makeBridge(seed1());
  b.failNext('gm_expenses');
  b.run();
  assert.equal(b.ledger().length, 0);
  const it = b.items().filter((i) => i.sev === 'high' && i.area === 'Cash' && /service receipt/.test(i.msg));
  assert.equal(it.length, 1);
  assert.equal(it[0].msg, '1 service receipt(s) could not be saved to the cash book - they will be tried again');
  b.run();
  assert.equal(noMarker(b.ledger()).length, 1);
  assert.equal(b.items().filter((i) => /service receipt/.test(i.msg)).length, 0);
  const after = b.raw('gm_expenses');
  b.run();
  assert.equal(b.raw('gm_expenses'), after);
});

test('B08 a reversal voids the row once; a reversal before posting never posts; a closed day holds it', () => {
  const b = makeBridge(seed1());
  b.run();
  b.set(FY, shard(sar('SAR/26-27/0001', 'J1', 123457, TODAY, { payMode: 'UPI' }), rrv('SAR/26-27/0001', { amountPaise: 123457, reason: 'typed twice' })));
  b.run();
  const row = rowsOf(b, REF1)[0];
  assert.equal(row.void, true);
  assert.equal(row.voidReason, 'Service receipt SAR/26-27/0001 was reversed - typed twice');
  assert.equal(row.editLog.length, 1);
  assert.equal(row.editLog[0].by, 'bridge');
  assert.deepEqual(row.editLog[0].old, { void: false });
  assert.deepEqual(row.editLog[0].new, { void: true });
  const after = b.raw('gm_expenses');
  b.run();
  assert.equal(b.raw('gm_expenses'), after);
  assert.equal(b.items().filter((i) => i.sev === 'high').length, 0, 'a voided reversed row is not drift');
  // reversed before it was ever posted
  const c = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 5000), rrv('SAR/26-27/0001')), tanishq_statements: openStmts() });
  c.run();
  assert.equal(rowsOf(c, REF1).length, 0);
  assert.equal(markers(c.ledger()).length, 0, 'no live receipt, so no marker');
  // reversal while the row sits on a closed day: untouched, one high Expense item
  const d = makeBridge(seed1());
  d.run();
  d.set(FY, shard(sar('SAR/26-27/0001', 'J1', 123457, TODAY, { payMode: 'UPI' }), rrv('SAR/26-27/0001')));
  d.set('tanishq_statements', { [TODAY]: { date: TODAY, closed: true } });
  d.run();
  assert.equal(rowsOf(d, REF1)[0].void, false);
  const hi = d.items().filter((i) => i.area === 'Expense' && i.sev === 'high');
  assert.equal(hi.length, 1);
  assert.equal(hi[0].msg, '1 service reversal(s) cannot change a row on a closed day or a tax-locked month - reopen the day or void the row in Expense');
  assert.doesNotMatch(hi[0].msg, /closed or tax-locked/);
  d.set('tanishq_statements', openStmts());
  d.run();
  assert.equal(rowsOf(d, REF1)[0].void, true);
  assert.equal(d.items().filter((i) => i.area === 'Expense' && i.sev === 'high').length, 0);
  // the Owner voids the held row by hand: nothing changes, no item
  const e = makeBridge(seed1());
  e.run();
  e.set(FY, shard(sar('SAR/26-27/0001', 'J1', 123457, TODAY, { payMode: 'UPI' }), rrv('SAR/26-27/0001')));
  e.set('tanishq_statements', { [TODAY]: { date: TODAY, closed: true } });
  e.run();
  const led = e.ledger(); led.find((x) => x.sourceRef === REF1).void = true; e.set('gm_expenses', led);
  const keep = e.raw('gm_expenses');
  e.run();
  assert.equal(e.raw('gm_expenses'), keep);
  assert.equal(e.items().filter((i) => i.area === 'Expense' && i.sev === 'high').length, 0);
});

test('B09 a refund reversal voids the outflow row', () => {
  const b = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 9000), srf('SRF/26-27/0001', { jobId: 'J1', amountPaise: 4000 })), tanishq_statements: openStmts() });
  b.run();
  b.set(FY, shard(sar('SAR/26-27/0001', 'J1', 9000), srf('SRF/26-27/0001', { jobId: 'J1', amountPaise: 4000 }), rrv('SRF/26-27/0001', { side: 'OUT', amountPaise: 4000 })));
  b.run();
  const row = rowsOf(b, 'wscr_SRF/26-27/0001')[0];
  assert.equal(row.void, true);
  assert.match(row.voidReason, /^Service refund SRF\/26-27\/0001 was reversed/);
  assert.equal(rowsOf(b, 'wscr_SAR/26-27/0001')[0].void, false);
});

test('B10 an in-book advance is never posted and raises no item', () => {
  const b = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 80000, TODAY, { legacy: true, inBook: true })), tanishq_statements: openStmts() });
  b.run(); b.run();
  assert.equal(noMarker(b.ledger()).length, 0);
  assert.equal(b.items().filter((i) => /service/i.test(i.msg)).length, 0);
});

test('B16 two shards and two years are read in order; a changed shard is re-read; an unchanged one is not parsed again', () => {
  let parses = 0;
  const JSONspy = { parse: (s) => { if (typeof s === 'string' && s.charAt(0) === '[' && s.indexOf('"k":"SAR"') > 0) parses++; return JSON.parse(s); }, stringify: JSON.stringify };
  const FY_PREV = 'saagar_svcs_receipts_v1_FY2025-26';
  const b = makeBridge({
    [FY_PREV]: shard(sar('SAR/25-26/0007', 'J0', 1000, '2026-03-30')),
    [FY]: shard(sar('SAR/26-27/0001', 'J1', 2000)),
    tanishq_statements: openStmts({ '2026-03-30': { date: '2026-03-30', closed: false } })
  }, { extra: { JSON: JSONspy } });
  b.run();
  assert.deepEqual(noMarker(b.ledger()).map((r) => r.sourceRef), ['wscr_SAR/25-26/0007', 'wscr_SAR/26-27/0001']);
  const afterFirst = parses;
  assert.ok(afterFirst >= 2);
  b.run();
  assert.equal(parses, afterFirst, 'an idle run parses no money shard');
  b.set(FY_P2, shard(sar('SAR/26-27/0002', 'J2', 3000)));
  b.run();
  assert.deepEqual(noMarker(b.ledger()).map((r) => r.sourceRef), ['wscr_SAR/25-26/0007', 'wscr_SAR/26-27/0001', 'wscr_SAR/26-27/0002']);
  assert.equal(parses, afterFirst + 1, 'only the new shard was parsed');
  b.set(FY, shard(sar('SAR/26-27/0001', 'J1', 2000), sar('SAR/26-27/0003', 'J3', 500)));
  b.run();
  assert.ok(noMarker(b.ledger()).some((r) => r.sourceRef === 'wscr_SAR/26-27/0003'), 'a changed shard length is re-read');
});

test('B17 bad records are skipped and counted; the good ones post', () => {
  const badBody = (over) => sar('SAR/26-27/0009', 'JX', 1000, TODAY, over);
  const b = makeBridge({
    [FY]: shard(
      sar('SAR/26-27/0001', 'J1', 1000),
      badBody({ amountPaise: 0 }), badBody({ amountPaise: 1.5 }), badBody({ amountPaise: 100000001 }),
      badBody({ no: 'SAR-26-27-0009' }), badBody({ docDate: undefined }), rec2('XYZ')
    ),
    tanishq_statements: openStmts()
  });
  b.run();
  assert.deepEqual(noMarker(b.ledger()).map((r) => r.sourceRef), ['wscr_SAR/26-27/0001']);
  const it = b.items().filter((i) => i.area === 'Expense' && i.sev === 'high');
  assert.equal(it.length, 1);
  assert.equal(it[0].msg, '6 service money record(s) could not be read and were not posted - ask support');
  assert.equal(b.ctx.SaagarBridge.serviceMoney().bad, 6);
});
function rec2(k) { return { n: 9, id: 'RCT-000009', at: '2026-11-12T05:00:00.000Z', k, b: { no: 'SAR/26-27/0010', amountPaise: 100, docDate: TODAY }, p: '0', h: '0' }; }

test('B18 an existing row with the same id but another source gets a numbered id', () => {
  const b = makeBridge(seed1({ gm_expenses: [{ id: 'e_wscr_SAR_26-27_0001', type: 'expense', date: TODAY, amount: 5, mode: 'Cash', sourceRef: 'manual_1', void: false }] }));
  b.run();
  const row = rowsOf(b, REF1)[0];
  assert.equal(row.id, 'e_wscr_SAR_26-27_0001_2');
  assert.equal(b.ledger()[0].id, 'e_wscr_SAR_26-27_0001');
});

test('B19 description enrichment from the old job list; without the job the row still posts', () => {
  const withJob = makeBridge(seed1({ saagar_wsf_v2: [{ id: 'J1', status: 'open', custName: 'Test Customer', brand: 'Titan', model: 'Edge' }] }));
  withJob.run();
  assert.equal(noMarker(withJob.ledger())[0].description, 'Service advance SAR/26-27/0001 - job J1 - Test Customer (Titan Edge)');
  const without = makeBridge(seed1());
  without.run();
  assert.equal(noMarker(without.ledger())[0].description, 'Service advance SAR/26-27/0001 - job J1');
});

test('B19b a legacy advance and a late-day row are described as the plan binds', () => {
  const b = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 5000, TODAY, { legacy: true })), tanishq_statements: openStmts() });
  b.run();
  assert.equal(noMarker(b.ledger())[0].description, 'Service advance SAR/26-27/0001 (earlier advance, confirmed) - job J1');
});

test('B22 the day of a receipt is its own docDate (IST), whatever the device time zone', () => {
  const b = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 5000, '2026-11-11')), tanishq_statements: openStmts({ '2026-11-11': { date: '2026-11-11', closed: false } }) });
  b.run();
  assert.equal(noMarker(b.ledger())[0].date, '2026-11-11');
  const probe = `
    import { makeBridge, FY, shard, sar, noMarker } from ${JSON.stringify(new URL('./lib/svc2-bridge-seed.mjs', import.meta.url).href)};
    const b = makeBridge({ [FY]: shard(sar('SAR/26-27/0001', 'J1', 5000, '2026-11-11')), tanishq_statements: { '2026-11-11': { closed: false }, '2026-11-12': { closed: false } } }, { now: '2026-11-12T06:00:00.000Z' });
    b.run();
    console.log(JSON.stringify(noMarker(b.ledger()).map((r) => [r.date, r.amount, r.sourceRef])));`;
  const outs = ['Asia/Kolkata', 'UTC'].map((tz) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  });
  assert.equal(outs[0], outs[1]);
  assert.equal(outs[0], '[["2026-11-11",50,"wscr_SAR/26-27/0001"]]');
});

test('B-src the bridge file keeps its old facts: no new postMessage, no Service key written, one honest prefix constant', () => {
  assert.equal((newSource.match(/postMessage/g) || []).length, 1);
  assert.equal((newSource.match(/saagar_svcs_/g) || []).length, 1);
  assert.match(newSource, /^ {2}var SVCM_PREFIX='saagar_svcs_';$/m);
  assert.equal(/'saagar_'\s*\+|\+\s*'svcs_'/.test(newSource), false);
  assert.equal(/SVCS_PREFIX/.test(newSource), false);
  const b = makeBridge(seed1());
  b.run(); b.run();
  assert.deepEqual(Object.keys(b.writes).filter((k) => k.startsWith('saagar_svcs_')), []);
  assert.equal(b.raw(FY), JSON.stringify(shard(sar('SAR/26-27/0001', 'J1', 123457, TODAY, { payMode: 'UPI', payRef: 'UPI-12345' }))));
  assert.equal(/\bnew Function\b|\beval\(|\bfetch\(/.test(newSource), false);
  assert.equal(newSource.includes('\r'), false, 'the bridge is LF');
});
