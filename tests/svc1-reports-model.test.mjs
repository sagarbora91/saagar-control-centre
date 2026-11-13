// Service Stores reports (group reports): model tests. Data only from opts.svcData; money in integer paise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain, text, tableOf, kpi, notes, empties, attns, ok, stockRow, stockData, ledgerA, ledgerB, grnData, adjData, oldData, TODAY } from './lib/svc1-reports-fixtures.mjs';

const deepEqual = (a, b) => assert.deepStrictEqual(plain(a), plain(b));
const build = (role, type, opts) => { const { R } = load(role); return R._buildModel(type, opts); };
const headers = (m) => m.blocks[0];

// ---------------------------------------------------------------- stock list
test('stock list, manager: FIFO chip, cost columns, foot equals the paise sum', () => {
  const m = build('manager', 'svcStockList', { svcData: stockData() });
  assert.equal(headers(m).chip, 'FIFO valuation');
  const t = tableOf(m);
  assert.ok(t.head[0].includes('Avg cost (FIFO)') && t.head[0].includes('Stock value (FIFO)'));
  const vi = t.head[0].indexOf('Stock value (FIFO)'), oi = t.head[0].indexOf('On hand');
  const rawSum = t.raw.reduce((a, r) => a + r[vi], 0);
  assert.equal(rawSum, 100000 + 9100 + 123456 + 0);
  assert.equal(t.foot[0][vi], '₹2,325.56');
  assert.equal(t.foot[0][oi], String(10 + 2 + 1 - 1));
  assert.ok(t.raw.every((r) => r.every((x) => Number.isInteger(x))));
  assert.equal(kpi(m, 'Stock value (FIFO)').value, '₹2,325.56');
  deepEqual(plain(t.money), [vi]);
  assert.ok(t.numCols.includes(oi) && t.numCols.includes(t.head[0].indexOf('Avg cost (FIFO)')));
  assert.equal(t.fmt[vi](123456), '₹1,234.56');
});

test('stock list: 45.50 prints with paise, 1,234.56 prints in full', () => {
  const m = build('owner', 'svcStockList', { svcData: stockData() });
  const t = tableOf(m), ai = t.head[0].indexOf('Avg cost (FIFO)'), vi = t.head[0].indexOf('Stock value (FIFO)');
  const r = t.body.find((x) => x[1] === 'P-0002');
  assert.equal(r[ai], '₹45.50');
  const s = t.body.find((x) => x[1] === '0042');
  assert.equal(s[vi], '₹1,234.56');
});

test('stock list, technician: no cost columns, quantities identical to the manager run', () => {
  const man = plain(build('manager', 'svcStockList', { svcData: stockData() }));
  const tec = plain(build('technician', 'svcStockList', { svcData: stockData() }));
  assert.equal(tec.blocks[0].chip, 'Quantities only');
  const t = tec.blocks.find((b) => b.t === 'table');
  assert.ok(!t.head[0].some((h) => /cost|value/i.test(h)));
  assert.ok(!t.money && !t.raw);
  assert.ok(tec.blocks.find((b) => b.t === 'kpi').items.every((i) => !/value/i.test(i.label)));
  assert.ok(notes(tec).some((n) => /Cost and value are shown to the Store Manager and the Owner only/.test(n)));
  const mt = man.blocks.find((b) => b.t === 'table');
  const oi = t.head[0].indexOf('On hand'), moi = mt.head[0].indexOf('On hand');
  deepEqual(t.body.map((r) => [r[1], r[oi]]), mt.body.map((r) => [r[1], r[moi]]));
  assert.ok(!/₹/.test(JSON.stringify(tec)), 'no rupee amount reaches a quantity-only print');
});

test('stock list: zero rows hidden unless includeZero or a reorder level; inactive stock stays visible', () => {
  let m = build('manager', 'svcStockList', { svcData: stockData() });
  let codes = tableOf(m).body.map((r) => r[1]);
  assert.ok(!codes.includes('ZERO-1'));
  m = build('manager', 'svcStockList', { svcData: stockData(), includeZero: true });
  codes = tableOf(m).body.map((r) => r[1]);
  assert.ok(codes.includes('ZERO-1'));
  const rows = [stockRow({ partCode: 'LVL-1', onHand: 0, reorderLevel: 5, valuePaise: 0 }), stockRow({ partCode: 'OLD-1', active: false, onHand: 3, reorderLevel: 0, valuePaise: 3000 }),
    stockRow({ partCode: 'OLD-2', active: false, onHand: 0, reorderLevel: 4, valuePaise: 0 })];
  m = build('manager', 'svcStockList', { svcData: stockData(rows) });
  codes = tableOf(m).body.map((r) => r[1]);
  deepEqual([...codes].sort(), ['LVL-1', 'OLD-1']);
});

test('stock list: Negative, Below reorder, Inactive, OK and flagged rows', () => {
  const rows = [stockRow({ partCode: 'A1', onHand: -1, reorderLevel: 0, valuePaise: 0 }), stockRow({ partCode: 'A2', onHand: 2, reorderLevel: 3, valuePaise: 2000 }),
    stockRow({ partCode: 'A3', onHand: 9, reorderLevel: 3, valuePaise: 9000 }), stockRow({ partCode: 'A4', active: false, onHand: 9, reorderLevel: 0, valuePaise: 9000 })];
  const m = plain(build('manager', 'svcStockList', { svcData: stockData(rows) }));
  const t = m.blocks.find((b) => b.t === 'table'), si = t.head[0].indexOf('Status');
  deepEqual(t.body.map((r) => r[si]), ['Negative', 'Below reorder', 'OK', 'Inactive']);
  deepEqual(t.flagRows, [true, true, false, false]);
  assert.equal(m.blocks.find((b) => b.t === 'kpi').items.find((i) => i.label === 'Negative stock').value, '1');
});

test('stock list: sorted by group then code, case-insensitive; leading zero kept; group filter', () => {
  const rows = BIGROWS();
  const m = plain(build('manager', 'svcStockList', { svcData: stockData(rows) }));
  const t = m.blocks.find((b) => b.t === 'table');
  assert.equal(t.body.length, 12);
  const pairs = t.body.map((r) => r[3] + '|' + r[1]);
  const sorted = pairs.slice().sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; });
  deepEqual(pairs, sorted);
  assert.ok(t.body.some((r) => r[1] === '0042'));
  const g = plain(build('manager', 'svcStockList', { svcData: stockData(rows), group: 'beta' }));
  assert.ok(g.blocks.find((b) => b.t === 'table').body.every((r) => r[3] === 'Beta'));
});
function BIGROWS() {
  const rows = [];
  ['Gamma', 'alpha', 'Beta'].forEach((g, gi) => { for (let i = 0; i < 4; i++) rows.push(stockRow({ partCode: i === 0 && gi === 1 ? '0042' : 'X' + (4 - i) + g[0].toUpperCase(), group: g, onHand: i + 1, valuePaise: (i + 1) * 100 })); });
  return rows;
}

test('stock list: unknown asOf, future asOf and bad dates are refused', () => {
  for (const asOf of ['2026-13-01', '2026-11-14', 'abc', '2026-02-30']) {
    const m = build('manager', 'svcStockList', { svcData: stockData(), asOf });
    assert.match(text(m), /RPT_PERIOD_INVALID/, asOf);
    assert.ok(!m.blocks.some((b) => b.t === 'table'));
  }
});

test('stock list: avg cost rounds halves up in integer paise; negative stock shows no avg', () => {
  const rows = [stockRow({ partCode: 'H1', onHand: 2, valuePaise: 101, reorderLevel: 0 }), stockRow({ partCode: 'H2', onHand: 3, valuePaise: 100, reorderLevel: 0 }), stockRow({ partCode: 'H3', onHand: -2, valuePaise: 0, reorderLevel: 0 })];
  const t = tableOf(build('manager', 'svcStockList', { svcData: stockData(rows) }));
  const ai = t.head[0].indexOf('Avg cost (FIFO)');
  deepEqual(t.body.map((r) => r[ai]), ['₹0.51', '₹0.33', '—']);
});

// ---------------------------------------------------------------- ledger
test('ledger A: opening, three movements, balances and closing from the reader', () => {
  const m = plain(build('manager', 'svcPartLedger', { partCode: 'p-0001', svcData: ledgerA() }));
  const t = m.blocks.find((b) => b.t === 'table'), h = t.head[0];
  const bi = h.indexOf('Balance'), bv = h.indexOf('Balance value');
  assert.equal(t.body[0][1], 'Opening balance');
  deepEqual(t.body.slice(1).map((r) => r[bi]), ['10', '6', '7']);
  deepEqual(t.body.slice(1).map((r) => r[bv]), ['₹1,000.00', '₹600.00', '₹700.00']);
  assert.equal(t.foot[0][bi], '7');
  assert.equal(t.foot[0][bv], '₹700.00');
  assert.equal(t.body[1][1], 'Goods receipt GRN/26-27/0001');
  assert.equal(t.body[2][1], 'Issue to job ISS/26-27/0001');
  assert.equal(t.body[2][2], 'SO-1001');
  deepEqual([...attns(m)], []);
  assert.equal(m.blocks[0].sub.startsWith('P-0001'), true);
  assert.equal(m.blocks[0].period, '2026-04-01 to ' + TODAY);
});

test('ledger B (FIFO partial layers): issue of 8 shows 840.00; layers table adds up', () => {
  const m = plain(build('owner', 'svcPartLedger', { partCode: 'P-0001', svcData: ledgerB() }));
  const t = m.blocks.filter((b) => b.t === 'table');
  const h = t[0].head[0];
  assert.equal(t[0].body[3][h.indexOf('Value out')], '₹840.00');
  assert.equal(t[1].body.length, 2);
  const lh = t[1].head[0];
  deepEqual(t[1].body.map((r) => r[lh.indexOf('Qty remaining')]), ['0', '3']);
  deepEqual(t[1].body.map((r) => r[lh.indexOf('Value remaining')]), ['₹0.00', '₹360.00']);
  assert.equal(t[1].foot[0][lh.indexOf('Value remaining')], '₹360.00');
  deepEqual(attns(m), []);
});

test('ledger arithmetic: wrong balQty, a one-paisa balValue error and a bad closing all trigger the banner', () => {
  let d = ledgerA(); d.rows[1].balQty = 7;
  let m = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d }));
  assert.ok(attns(m).some((x) => /RPT_LEDGER_ARITH/.test(x) && /row 2/.test(x)));
  assert.equal(m.blocks.find((b) => b.t === 'table').flagRows[2], true);
  d = ledgerA(); d.rows[1].balValuePaise = 60001;
  m = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d }));
  assert.ok(attns(m).some((x) => /RPT_LEDGER_ARITH/.test(x) && /row 2/.test(x)));
  d = ledgerA({ closing: { qty: 7, valuePaise: 70001 } });
  m = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d }));
  assert.ok(attns(m).some((x) => /closing balance/.test(x) && /RPT_LEDGER_ARITH/.test(x)));
  assert.ok(m.blocks.some((b) => b.t === 'table'), 'the print is still produced');
});

test('ledger arithmetic: quantity-only check for a technician', () => {
  const d = ledgerA(); d.rows[2].balQty = 9;
  const m = plain(build('technician', 'svcPartLedger', { partCode: 'P-0001', svcData: d }));
  assert.ok(attns(m).some((x) => /RPT_LEDGER_ARITH/.test(x)));
});

test('ledger layer mismatch by one paisa', () => {
  const d = ledgerA(); d.layers[0].unitCostPaise = 10001;
  const m = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d }));
  assert.ok(attns(m).some((x) => /RPT_LAYER_MISMATCH/.test(x)));
});

test('ledger: reversed original and its reversal row are flagged and labelled', () => {
  const d = ledgerA({
    rows: [
      { seq: 1, date: '2026-11-01', docType: 'GRN', docNo: 'GRN/26-27/0001', jobId: '', note: '', inQty: 10, outQty: 0, valueInPaise: 100000, valueOutPaise: 0, balQty: 10, balValuePaise: 100000, reversed: true, isReversal: false, reversalOf: '', actor: '' },
      { seq: 2, date: '2026-11-02', docType: 'REVERSAL', docNo: '', jobId: '', note: 'wrong lot', inQty: 0, outQty: 10, valueInPaise: 0, valueOutPaise: 100000, balQty: 0, balValuePaise: 0, reversed: false, isReversal: true, reversalOf: 'GRN/26-27/0001', actor: 'Owner' }
    ], closing: { qty: 0, valuePaise: 0 }, layers: []
  });
  const m = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d }));
  const t = m.blocks.find((b) => b.t === 'table');
  assert.equal(t.body[1][1], 'Goods receipt GRN/26-27/0001 (reversed)');
  assert.equal(t.body[2][1], 'Reversal of GRN/26-27/0001');
  deepEqual(t.flagRows, [false, true, true]);
  deepEqual(attns(m), []);
});

test('ledger: missing partCode, wrong part in data, and the reader codes', () => {
  assert.match(text(build('manager', 'svcPartLedger', { svcData: ledgerA() })), /RPT_PART_REQUIRED/);
  assert.match(text(build('manager', 'svcPartLedger', { partCode: 'P-9999', svcData: ledgerA() })), /RPT_READ_FAILED/);
  assert.match(text(build('manager', 'svcPartLedger', { partCode: 'P-9999', svcData: { ok: false, code: 'PART_UNKNOWN' } })), /RPT_PART_UNKNOWN/);
});

test('ledger period: defaults, financial year start, and every refusal', () => {
  const d = (over) => build('manager', 'svcPartLedger', Object.assign({ partCode: 'P-0001', svcData: ledgerA() }, over));
  assert.equal(plain(d({})).blocks[0].period, '2026-04-01 to ' + TODAY);
  assert.equal(plain(d({ from: '2026-04-01', to: '2026-12-31' })).blocks[0].period.includes('RPT'), false);
  assert.match(text(d({ from: '2026-12-01', to: '2026-11-01' })), /RPT_PERIOD_INVALID/);
  assert.match(text(d({ to: '2026-11-14' })), /RPT_PERIOD_INVALID/);
  assert.doesNotMatch(text(d({ from: '2023-11-09', to: TODAY })), /RPT_PERIOD_INVALID/);      // exactly 1,100 days
  assert.match(text(d({ from: '2023-11-08', to: TODAY })), /RPT_PERIOD_INVALID/);           // 1,101 days
  assert.match(text(d({ from: '2023-11-01', to: TODAY })), /RPT_PERIOD_INVALID/);
  assert.match(text(d({ from: '2026-02-30' })), /RPT_PERIOD_INVALID/);
});

test('ledger: to before today hides layers with the note and no mismatch banner', () => {
  const d = ledgerA({ to: '2026-11-10', layers: null });
  const m = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', to: '2026-11-10', svcData: d }));
  assert.equal(m.blocks.filter((b) => b.t === 'table').length, 1);
  assert.ok(notes(m).some((n) => /shown only when the period ends today/.test(n)));
  deepEqual(attns(m), []);
  const d2 = ledgerA({ to: '2026-11-10' });                       // layers supplied but period not ending today
  const m2 = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', to: '2026-11-10', svcData: d2 }));
  assert.equal(m2.blocks.filter((b) => b.t === 'table').length, 1);
});

test('ledger, technician: no value columns and no layers; quantities identical', () => {
  const man = plain(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: ledgerA() }));
  const tec = plain(build('technician', 'svcPartLedger', { partCode: 'P-0001', svcData: ledgerA() }));
  assert.equal(tec.blocks.filter((b) => b.t === 'table').length, 1);
  const t = tec.blocks.find((b) => b.t === 'table');
  assert.ok(!t.head[0].some((h) => /value/i.test(h)));
  assert.ok(!/₹/.test(JSON.stringify(tec)));
  const mt = man.blocks.find((b) => b.t === 'table');
  deepEqual(t.body.map((r) => r[t.head[0].indexOf('Balance')]), mt.body.map((r) => r[mt.head[0].indexOf('Balance')]));
});

test('ledger: a movement date that is not a calendar day, or a text quantity, is READ_FAILED', () => {
  let d = ledgerA(); d.rows[0].date = '2026-11-31';
  assert.match(text(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d })), /RPT_READ_FAILED/);
  d = ledgerA(); d.rows[0].inQty = '10';
  assert.match(text(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d })), /RPT_READ_FAILED/);
  d = ledgerA(); d.rows[0].valueInPaise = 1000.5;
  assert.match(text(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: d })), /RPT_READ_FAILED/);
});

// ---------------------------------------------------------------- reorder list
test('reorder list: short by, suggested quantity, sort, estimate in paise, unknown cost excluded', () => {
  const rows = [
    stockRow({ partCode: 'R1', onHand: 4, reorderLevel: 10, reorderQty: 3, lastReceiptCostPaise: 1050 }),
    stockRow({ partCode: 'R2', onHand: 4, reorderLevel: 10, reorderQty: 20, lastReceiptCostPaise: 333 }),
    stockRow({ partCode: 'R3', onHand: 0, reorderLevel: 2, reorderQty: 0, lastReceiptCostPaise: null }),
    stockRow({ partCode: 'R4', onHand: 9, reorderLevel: 3 }), stockRow({ partCode: 'R5', onHand: 1, reorderLevel: 0 }),
    stockRow({ partCode: 'R6', active: false, onHand: 0, reorderLevel: 9 })
  ];
  const m = plain(build('manager', 'svcReorderList', { svcData: stockData(rows) }));
  const t = m.blocks.find((b) => b.t === 'table'), h = t.head[0];
  deepEqual(t.body.map((r) => r[1]), ['R1', 'R2', 'R3']);
  const si = h.indexOf('Short by'), gi = h.indexOf('Suggest order'), ei = h.indexOf('Est. cost');
  deepEqual(t.body.map((r) => [r[si], r[gi]]), [['6', '6'], ['6', '20'], ['2', '2']]);
  deepEqual(t.body.map((r) => r[ei]), ['₹63.00', '₹66.60', '—']);
  assert.equal(t.foot[0][ei], '₹129.60');
  assert.ok(notes(m).some((n) => /only the 2 part/.test(n)));
  assert.ok(notes(m).some((n) => /Open orders to Titan are not tracked in Phase 1/.test(n)));
  assert.equal(m.blocks.find((b) => b.t === 'kpi').items.find((i) => i.label === 'Est. order value').value, '₹129.60');
  deepEqual(t.numCols.includes(h.indexOf('Last cost')), true);
});

test('reorder list, technician has no cost; empty list shows the plain text', () => {
  const rows = [stockRow({ partCode: 'R1', onHand: 1, reorderLevel: 5 })];
  const m = plain(build('technician', 'svcReorderList', { svcData: stockData(rows) }));
  const t = m.blocks.find((b) => b.t === 'table');
  assert.ok(!t.head[0].some((h) => /cost/i.test(h)) && !/₹/.test(JSON.stringify(m)));
  const e = build('manager', 'svcReorderList', { svcData: stockData([stockRow({ onHand: 9, reorderLevel: 3 })]) });
  deepEqual([...empties(e)], ['Nothing is at or below its reorder level.']);
});

// ---------------------------------------------------------------- goods receipt
test('goods receipt: locked chip, lines, totals, short note, cost columns', () => {
  const m = plain(build('manager', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', svcData: grnData() }));
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.blocks[0].chip, 'GRN/26-27/0007');
  assert.equal(m.blocks[0].chipKind, 'locked');
  const t = m.blocks.find((b) => b.t === 'table'), h = t.head[0];
  assert.equal(t.body.length, 2);
  assert.equal(t.foot[0][h.indexOf('Line value')], '₹957.50');
  assert.equal(t.foot[0][h.indexOf('Qty received')], '15');
  deepEqual(t.flagRows, [true, false]);
  assert.ok(notes(m).some((n) => /Short supply recorded on 1 line\(s\), 1 piece\(s\)/.test(n)));
  assert.ok(notes(m).some((n) => /Costs are shown excluding GST/.test(n)));
  deepEqual(m.blocks.find((b) => b.t === 'sign').boxes.map((b) => b.role), ['Received by (Store)', 'Checked by (Store Manager)', 'For Saagar Traders']);
});

test('goods receipt reversed: draft chip and the amber reversal note', () => {
  const d = grnData(); d.header.status = 'REVERSED'; d.header.reversedDate = '2026-11-12'; d.header.reversedBy = 'Owner'; d.header.reversalReason = 'Wrong supplier invoice';
  const m = plain(build('owner', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', svcData: d }));
  assert.equal(m.blocks[0].chip, 'REVERSED GRN/26-27/0007');
  assert.equal(m.blocks[0].chipKind, 'draft');
  assert.ok(notes(m).some((n) => n === 'This receipt was reversed on 2026-11-12 by Owner. Reason: Wrong supplier invoice. Its stock effect has been undone.'));
});

test('goods receipt, technician: no unit cost or line value; quantities stay', () => {
  const m = plain(build('technician', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', svcData: grnData() }));
  const t = m.blocks.find((b) => b.t === 'table');
  assert.ok(!t.head[0].includes('Unit cost') && !t.head[0].includes('Line value'));
  assert.ok(t.head[0].includes('Qty received'));
  assert.ok(!/₹/.test(JSON.stringify(m)));
});

test('goods receipt: required number, unknown number, number mismatch, bad status', () => {
  assert.match(text(build('manager', 'svcGoodsReceipt', { svcData: grnData() })), /RPT_GRN_REQUIRED/);
  assert.match(text(build('manager', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0099', svcData: { ok: false, code: 'GRN_UNKNOWN' } })), /RPT_GRN_UNKNOWN/);
  assert.match(text(build('manager', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0001', svcData: grnData() })), /RPT_READ_FAILED/);
  const d = grnData(); d.header.status = 'PENDING';
  assert.match(text(build('manager', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', svcData: d })), /RPT_READ_FAILED/);
});

// ---------------------------------------------------------------- adjustment register
test('adjustment register: awaiting any date, decided only in period, posted-only net, negative text', () => {
  const m = plain(build('manager', 'svcAdjustmentRegister', { month: '2026-11', svcData: adjData() }));
  const ts = m.blocks.filter((b) => b.t === 'table');
  assert.equal(ts.length, 2);
  assert.equal(ts[0].body.length, 1);
  assert.equal(ts[0].body[0][0], 'DOC-000012');
  assert.equal(ts[0].body[0][ts[0].head[0].indexOf('Status')], 'Awaiting approval');
  deepEqual(ts[0].flagRows, [true]);
  deepEqual(ts[1].body.map((r) => r[0]), ['ADJ/26-27/0001', 'ADJ/26-27/0002', 'DOC-000009']);      // 0000 was decided in October
  const vi = ts[1].head[0].indexOf('Value effect');
  assert.equal(ts[1].body[0][vi], '₹-250.00');
  assert.equal(ts[1].body[2][vi], '—');
  assert.equal(ts[1].foot[0][vi], '₹-113.50');             // -250.00 + 136.50, rejected row excluded
  assert.equal(kpi(m, 'Net value effect').value, '₹-113.50');
  assert.equal(kpi(m, 'Awaiting approval').value, '1');
  assert.equal(kpi(m, 'Posted in period').value, '2');
  assert.equal(kpi(m, 'Rejected in period').value, '1');
  assert.ok(ts[1].raw.every((r) => r.every(Number.isInteger)));
  assert.equal(ts[1].raw.reduce((a, r) => a + r[vi], 0), -11350);
});

test('adjustment register: explicit from/to override the month; nothing waiting shows the plain text and an ok tag', () => {
  const d = adjData({ awaiting: [], from: '2026-10-01', to: '2026-10-31' });
  const m = plain(build('owner', 'svcAdjustmentRegister', { from: '2026-10-01', to: '2026-10-31', svcData: d }));
  deepEqual(empties(m)[0], 'No adjustments are waiting for approval.');
  const sec = m.blocks.find((b) => b.t === 'section');
  assert.equal(sec.tag.cls, 'ok');
  deepEqual(m.blocks.find((b) => b.t === 'table').body.map((r) => r[0]), ['ADJ/26-27/0000']);
});

test('adjustment register: period refusals and malformed rows', () => {
  assert.match(text(build('manager', 'svcAdjustmentRegister', { from: '2026-11-01', svcData: adjData() })), /RPT_PERIOD_INVALID/);
  assert.match(text(build('manager', 'svcAdjustmentRegister', { month: '2026-13', svcData: adjData() })), /RPT_PERIOD_INVALID/);
  const d = adjData(); d.awaiting[0].status = 'POSTED';
  assert.match(text(build('manager', 'svcAdjustmentRegister', { month: '2026-11', svcData: d })), /RPT_READ_FAILED/);
  const e = adjData(); e.decided[0].valueEffectPaise = 12.5;
  assert.match(text(build('manager', 'svcAdjustmentRegister', { month: '2026-11', svcData: e })), /RPT_READ_FAILED/);
});

// ---------------------------------------------------------------- defective register
test('defective register: open items from any date, the 4 labels, unknown state verbatim, state filter on the period table only', () => {
  const m = plain(build('technician', 'svcDefectiveRegister', { month: '2026-11', svcData: oldData() }));
  const ts = m.blocks.filter((b) => b.t === 'table');
  assert.equal(ts[0].body.length, 3);
  deepEqual(ts[0].body.map((r) => r[0]), ['OLD/26-27/0002', 'OLD/26-27/0004', 'OLD/26-27/0001']);
  const si = ts[0].head[0].indexOf('State');
  deepEqual(ts[0].body.map((r) => r[si]), ['Scrap pending Owner sign-off', 'Held for claim', 'Held for claim']);
  deepEqual(ts[1].body.map((r) => r[si]), ['Held for claim', 'Customer Returned', 'Scrapped', 'WEIRD_STATE']);
  assert.equal(kpi(m, 'Held for claim').value, '2');
  assert.equal(kpi(m, 'Scrap awaiting sign-off').value, '1');
  assert.equal(kpi(m, 'Customer Returned').value, '1');
  assert.equal(kpi(m, 'Scrapped').value, '1');
  deepEqual(ts[0].flagRows, [true, false, false]);
  const f = plain(build('technician', 'svcDefectiveRegister', { month: '2026-11', state: 'SCRAPPED', svcData: oldData() }));
  const ft = f.blocks.filter((b) => b.t === 'table');
  assert.equal(ft[0].body.length, 3, 'open table is not filtered');
  assert.equal(ft[1].body.length, 1);
  assert.ok(notes(m).some((n) => /Scrap needs the Owner's monthly sign-off/.test(n)));
});

test('defective register: no customer field survives a hostile reader, and no money is printed', () => {
  const d = oldData();
  const bad = { custName: 'SECRET-NAME-91', custMobile: '9999900000', custAddr: 'SECRET-ADDR', customer: { name: 'SECRET-NAME-91' }, email: 'secret@example.test' };
  d.open.forEach((r) => Object.assign(r, bad)); d.listed.forEach((r) => Object.assign(r, bad)); Object.assign(d, bad);
  const m = build('manager', 'svcDefectiveRegister', { month: '2026-11', svcData: d });
  const s = text(m);
  assert.ok(!/SECRET|9999900000|custName|custMobile|custAddr/.test(s));
  assert.ok(!/₹/.test(s));
});

test('hostile fields are ignored in every report', () => {
  const bad = { custName: 'SECRET-NAME-91', custMobile: '9999900000', custAddr: 'SECRET-ADDR' };
  const dress = (d) => { const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { Object.assign(o, bad); Object.keys(o).forEach((k) => walk(o[k])); } }; walk(d); return d; };
  const cases = [['svcStockList', {}, stockData()], ['svcReorderList', {}, stockData([stockRow({ onHand: 1, reorderLevel: 5 })])], ['svcPartLedger', { partCode: 'P-0001' }, ledgerA()],
    ['svcGoodsReceipt', { grnNo: 'GRN/26-27/0007' }, grnData()], ['svcAdjustmentRegister', { month: '2026-11' }, adjData()]];
  for (const [type, opts, data] of cases) {
    const s = text(build('owner', type, Object.assign({ svcData: dress(data) }, opts)));
    assert.ok(!/SECRET|9999900000/.test(s), type);
  }
});

test('the caller object is not changed and the copy is independent', () => {
  const data = stockData();
  const snap = JSON.stringify(data);
  build('manager', 'svcStockList', { svcData: data });
  assert.equal(JSON.stringify(data), snap);
});

test('ok helper sanity', () => deepEqual(ok({ a: 1 }), { ok: true, a: 1 }));
