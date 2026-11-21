// S04 U03-F08 (reduced: memoised day filter + timing probe), F10 (31-day reasons), F13 (money tile).
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, qmsSource, run } from './lib/fix-s04-qms.mjs';
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);

const DAY_CODE = [fn('indiaBusinessDateFromIso'), fn('customerBusinessDate'), fn('todaysCustomers')].join('\n') + '\nthis.go=todaysCustomers;';
function dayCtx(customers, viewAsOf = '2026-11-12') {
  const ctx = { state: { customers }, viewAsOf };
  run(ctx, DAY_CODE);
  return ctx;
}
function counted(n, date) {
  let reads = 0;
  const arr = [];
  for (let i = 0; i < n; i++) {
    const c = { id: 'c' + i, entryTime: '2026-11-12T05:00:00.000Z' };
    Object.defineProperty(c, 'businessDate', { enumerable: true, get() { reads++; return i === 7 ? date : '2025-01-01'; } });
    arr.push(c);
  }
  return { arr, reads: () => reads };
}
test('S04-F08 day filter is memoised and invalidates on push, date change and state replacement', () => {
  const { arr, reads } = counted(2000, '2026-11-12');
  const ctx = dayCtx(arr);
  assert.equal(ctx.go().length, 1);
  const r1 = reads();
  assert.ok(r1 >= 2000);
  ctx.go(); assert.equal(reads(), r1, 'second call must not re-read');
  ctx.state.customers.push({ id: 'new', businessDate: '2026-11-12', entryTime: '2026-11-12T06:00:00.000Z' });
  assert.equal(ctx.go().length, 2);
  ctx.viewAsOf = '2025-01-01';
  assert.equal(ctx.go().length, 1999);
  ctx.viewAsOf = '2026-11-12';
  ctx.state = { customers: [{ id: 'z', businessDate: '2026-11-12', entryTime: '2026-11-12T06:00:00.000Z' }] };
  assert.deepEqual(ctx.go().map((c) => c.id), ['z']);
});
test('S04-F08 returned array is a copy: sorting or popping it does not change the next result', () => {
  const ctx = dayCtx([1, 2, 3].map((i) => ({ id: 'c' + i, businessDate: '2026-11-12', entryTime: '2026-11-12T06:00:00.000Z' })));
  const a = ctx.go(); a.pop(); a.reverse();
  assert.deepEqual(ctx.go().map((c) => c.id), ['c1', 'c2', 'c3']);
});
test('S04-F08 timing probe (diagnostic only, 15,738 synthetic customers)', () => {
  const list = [];
  for (let i = 0; i < 15738; i++) list.push({ id: 'c' + i, businessDate: i % 40 === 0 ? '2026-11-12' : '2026-0' + (1 + (i % 9)) + '-10', entryTime: '2026-11-12T06:00:00.000Z' });
  const ctx = dayCtx(list);
  const t = [];
  for (let i = 0; i < 20; i++) { const s = process.hrtime.bigint(); ctx.go(); t.push(Number(process.hrtime.bigint() - s) / 1e6); }
  const first = t[0], rest = t.slice(1).sort((a, b) => a - b);
  const sj = process.hrtime.bigint(); JSON.stringify(list); const stringifyMs = Number(process.hrtime.bigint() - sj) / 1e6;
  console.log(`# S04 probe: first call ${first.toFixed(2)} ms, later calls median ${rest[rest.length >> 1].toFixed(3)} ms, worst ${rest[rest.length - 1].toFixed(3)} ms, JSON.stringify of the list ${stringifyMs.toFixed(1)} ms (browser storage write not measured here)`);
  assert.ok(rest[rest.length >> 1] < first || rest[rest.length >> 1] < 1);
});
test('S04-F08 save() timing probe (diagnostic only; real save() + qms-persistence commit, in-memory storage, synthetic register)', () => {
  // S04-3 probe: median and worst save() time. Node figure only; the seeded-tree browser figure and the
  // emulator figure are taken at the re-test gate. The browser storage write and renderAll are not in this number.
  const persistence = requireCjs('../www/qms-persistence.js');
  const customers = [];
  for (let i = 0; i < 15738; i++) customers.push({ id: 'cust_' + i, queueNo: 'Q-' + String(i % 999).padStart(3, '0'), name: 'Customer ' + i, mobile: '98' + String(10000000 + i).slice(-8), visitType: 'New', businessDate: '2026-0' + (1 + (i % 9)) + '-10', entryTime: '2026-11-12T06:00:00.000Z', allocatedTime: '2026-11-12T06:01:00.000Z', attendStart: '2026-11-12T06:02:00.000Z', exitTime: '2026-11-12T06:20:00.000Z', assignedCroId: 'cro_' + (i % 6), expectedCroId: 'cro_' + (i % 6), status: 'Closed', outcome: i % 3 ? 'Non Purchase' : 'Purchase', purchaseAmount: i % 3 ? 0 : 12500, lostReason: i % 3 ? 'Price' : '', lostValue: i % 3 ? 9000 : 0, note: 'synthetic row for the S04 save probe' });
  const store = new Map();
  const storage = { setItem(k, v) { store.set(k, v); }, getItem(k) { return store.has(k) ? store.get(k) : null; } };
  let renders = 0, n = 0;
  const ctx = {
    STORE_KEY: 'retail_queue_management_v1', localStorage: storage, role: 'SM', state: { settings: {}, customers, audit: [] },
    qmsPersistenceApi: () => persistence, uid: (p) => p + '_' + (++n), renderAll: () => { renders++; },
    qmsRestorePersistedState: () => { throw new Error('restore must not run'); }, toast: () => {},
  };
  run(ctx, fn('save') + '\nthis.save=save;');
  const t = [];
  for (let i = 0; i < 9; i++) { const s = process.hrtime.bigint(); assert.equal(ctx.save('probe.save', { i }), true); t.push(Number(process.hrtime.bigint() - s) / 1e6); }
  const sorted = t.slice().sort((a, b) => a - b);
  const bytes = store.get('retail_queue_management_v1').length;
  console.log(`# S04 save() probe: ${customers.length} customers, ${(bytes / 1048576).toFixed(1)} MB per write, median ${sorted[sorted.length >> 1].toFixed(1)} ms, worst ${sorted[sorted.length - 1].toFixed(1)} ms over ${t.length} saves (Node, in-memory storage; renderAll stubbed)`);
  assert.equal(renders, t.length);
  assert.equal(JSON.parse(store.get('retail_queue_management_v1')).customers.length, customers.length);
});

// ---------- F10 ----------
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(11, 0, 0, 0); return d.toISOString(); }
test('S04-F10 lost reasons use the same 31-day window on screen and in print', () => {
  const customers = [
    { entryTime: daysAgo(2), outcome: 'Non Purchase', lostReason: 'Price' }, { entryTime: daysAgo(20), outcome: 'Non Purchase', lostReason: 'Price' },
    { entryTime: daysAgo(20), outcome: 'Non Purchase' }, { entryTime: daysAgo(60), outcome: 'Non Purchase', lostReason: 'Design' }, { entryTime: daysAgo(2), outcome: 'Purchase' },
  ];
  const ctx = { state: { customers }, esc: (s) => String(s) };
  run(ctx, [fn('qmsCustomersInLastDays'), fn('qmsLostReasonCounts'), fn('lostReasonReport'), 'this.api={qmsLostReasonCounts,lostReasonReport};'].join('\n'));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.api.qmsLostReasonCounts())), { Price: 2, 'Not specified': 1 });
  const html = ctx.api.lostReasonReport();
  assert.ok(html.includes('Price') && !html.includes('Design'));
  const empty = { state: { customers: [{ entryTime: daysAgo(60), outcome: 'Non Purchase' }] }, esc: (s) => String(s) };
  run(empty, [fn('qmsCustomersInLastDays'), fn('qmsLostReasonCounts'), fn('lostReasonReport'), 'this.api={lostReasonReport};'].join('\n'));
  assert.match(empty.api.lostReasonReport(), /No non-purchase cases in the last 31 days/);
  const print = fn('printReports');
  assert.match(print, /const lostMap=qmsLostReasonCounts\(\);/);
  assert.match(print, /Non-Purchase Reasons \(Last 31 Days\)/);
  assert.match(print, /No non-purchase cases in the last 31 days/);
  assert.match(qmsSource, /Lost sale analysis · last 31 days/);
  assert.doesNotMatch(qmsSource, /Lost sale analysis · active records/);
});

// ---------- F13 ----------
test('S04-F13 money tile is exact below a crore and Cr above', () => {
  const ctx = {};
  run(ctx, fn('qmsMoneyTile') + '\nthis.t=qmsMoneyTile;');
  assert.equal(ctx.t(0), '0');
  assert.equal(ctx.t(999), '999');
  assert.equal(ctx.t(198000), '1,98,000');
  assert.equal(ctx.t(45678.5), '45,678.5');
  assert.equal(ctx.t(9999999), '99,99,999');
  assert.equal(ctx.t(10000000), '1.00 Cr');
  assert.equal(ctx.t(1000197999), '100.02 Cr');
  assert.equal(ctx.t(NaN), '0');
  assert.doesNotMatch(qmsSource, /toFixed\(1\)\+'k'/);
  assert.match(qmsSource, /₹\$\{qmsMoneyTile\(s\.sales\)\}/);
});
