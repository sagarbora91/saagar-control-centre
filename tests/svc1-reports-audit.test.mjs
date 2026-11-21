// Service Stores reports: faults found by the Opus audit (hostile inputs). Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, text, tableOf, kpi, stockRow, stockData, ledgerA, grnData, adjData, oldData } from './lib/svc1-reports-fixtures.mjs';

const build = (role, type, opts) => load(role).R._buildModel(type, opts);
const failed = (m) => /\[RPT_READ_FAILED\]/.test(text(m)) && !m.blocks.some((b) => b.t === 'table');

test('audit: money too large to sum safely is refused, never printed as a wrong total', () => {
  const big = 9007199254740990;
  assert.ok(failed(build('manager', 'svcStockList', { svcData: stockData([stockRow({ valuePaise: big }), stockRow({ partCode: 'X2', valuePaise: big })]) })));
  assert.ok(failed(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: ledgerA({ closing: { qty: 7, valuePaise: big } }) })));
  assert.ok(failed(build('manager', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0007', svcData: grnData({ lines: [{ partCode: 'P-0001', desc: '', qtyReceived: 1, qtyShort: 0, unitCostPaise: big, lineValuePaise: big }] }) })));
  const adj = adjData();
  adj.decided[0].valueEffectPaise = big;
  assert.ok(failed(build('manager', 'svcAdjustmentRegister', { month: '2026-11', svcData: adj })));
  // the largest allowed value still prints exactly
  const m = build('manager', 'svcStockList', { svcData: stockData([stockRow({ valuePaise: 1000000000000 })]) });
  assert.equal(kpi(m, 'Stock value (FIFO)').value, '₹10,00,00,00,000.00');
});

test('audit: quantities too large are refused (no 2e+300 in a print)', () => {
  assert.ok(failed(build('technician', 'svcStockList', { svcData: stockData([stockRow({ onHand: 1e300 })]) })));
  assert.ok(failed(build('technician', 'svcDefectiveRegister', { month: '2026-11', svcData: oldData({ listed: [{ regNo: 'OLD/9', date: '2026-11-02', jobId: '', partCode: '', desc: '', qty: 1e12, state: 'SCRAPPED' }] }) })));
});

test('audit: a layer whose value cannot be held safely is refused', () => {
  const m = build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: ledgerA({ layers: [{ layerId: 'L', grnNo: 'G', date: '2026-11-01', qtyReceived: 1e9, qtyRemaining: 1e9, unitCostPaise: 1e12 }] }) });
  assert.ok(failed(m));
  assert.ok(failed(build('manager', 'svcPartLedger', { partCode: 'P-0001', svcData: ledgerA({ layers: [{ layerId: 'L', grnNo: 'G', date: '2026-11-01', qtyReceived: 10, qtyRemaining: -3, unitCostPaise: 10000 }] }) })));
});

test('audit: stock value is never negative and is 0 when nothing is on hand', () => {
  assert.ok(failed(build('manager', 'svcStockList', { svcData: stockData([stockRow({ valuePaise: -50000 })]) })));
  assert.ok(failed(build('manager', 'svcStockList', { svcData: stockData([stockRow({ onHand: -3, valuePaise: 50000 })]) })));
  assert.ok(failed(build('manager', 'svcStockList', { svcData: stockData([stockRow({ onHand: 0, reorderLevel: 2, valuePaise: 1 })]) })));
  // quantities-only viewers do not depend on the value field
  assert.ok(!failed(build('technician', 'svcStockList', { svcData: stockData([stockRow({ onHand: -3, valuePaise: 50000 })]) })));
});

test('audit: reorder estimate that overflows is refused', () => {
  const m = build('manager', 'svcReorderList', { svcData: stockData([stockRow({ onHand: -999999999, reorderLevel: 5, reorderQty: 0, lastReceiptCostPaise: 1000000000000 })]) });
  assert.ok(failed(m));
});

test('audit: the defective register prints only rows inside the period it was read for', () => {
  const data = oldData({ listed: [
    { regNo: 'OLD/26-27/0100', date: '2025-01-01', jobId: 'SO-1', partCode: 'P-0001', desc: 'x', qty: 1, state: 'SCRAPPED', claimRef: '', decidedBy: '', decidedDate: '' },
    { regNo: 'OLD/26-27/0101', date: '2026-11-03', jobId: 'SO-2', partCode: 'P-0001', desc: 'y', qty: 1, state: 'SCRAPPED', claimRef: '', decidedBy: '', decidedDate: '' }] });
  const m = build('technician', 'svcDefectiveRegister', { month: '2026-11', svcData: data });
  const period = tableOf(m, 1);
  assert.equal(period.body.map((r) => r[0]).join('|'), 'OLD/26-27/0101');
  assert.equal(kpi(m, 'Scrapped').value, '1');
});

test('audit: a GRN opened with a lower-case number matches the stored number and prints it', () => {
  const m = build('manager', 'svcGoodsReceipt', { grnNo: 'grn/26-27/0007', svcData: grnData() });
  assert.ok(!/RPT_/.test(text(m)));
  assert.equal(m.blocks[0].chip, 'GRN/26-27/0007');
  assert.ok(failed(build('manager', 'svcGoodsReceipt', { grnNo: 'GRN/26-27/0008', svcData: grnData() })));
});
