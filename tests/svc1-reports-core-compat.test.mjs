// Service Stores reports: the real core facade (reportData) feeds the real report builders.
// Skipped, with the reason, when the core or its test kit is not available. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain, text, tableOf, kpi } from './lib/svc1-reports-fixtures.mjs';

let kit = null, skipWhy = '';
try { kit = await import('./lib/svc1-core-kit.mjs'); } catch (e) { skipWhy = 'core test kit not available: ' + (e && e.message); }

function scene() {
  const env = kit.makeEnv({ start: '2026-11-13T05:30:00.000Z' });
  const mgr = env.manager();
  const mk = (code, name, group, level, qty) => env.core.savePart({ code, name, group, unit: 'pc', sellPricePaise: 5000, priceIncludesTax: true, reorderLevel: level, reorderQty: qty, bin: 'A1' }, mgr);
  assert.equal(mk('P-0001', 'Crown assembly', 'Crowns', 3, 5).ok, true);
  assert.equal(mk('P-0002', 'Battery 377', 'Batteries', 4, 20).ok, true);
  kit.kitOpening(env.kit, [{ partCode: 'P-0001', qty: 6, unitCostPaise: 10000 }, { partCode: 'P-0002', qty: 5, unitCostPaise: 4550 }], 'DOC-000001');
  env.clock.advance(3600 * 1000);
  const grn = kit.kitReceipt(env.kit, 'INV-1', [{ partCode: 'P-0001', qtyInvoiced: 6, qtyReceived: 5, unitCostPaise: 12000 }]);
  env.clock.advance(3600 * 1000);
  kit.kitIssue(env.kit, 'JOB-1', [{ partCode: 'P-0001', qty: 8 }]);
  env.clock.advance(3600 * 1000);
  kit.kitOldRegister(env.kit, { jobId: 'JOB-1', partCode: 'P-0001', qty: 1, claimRef: 'CL-1' });
  return { env, grn: grn.no };
}
const withData = (R, type, data, args) => R._buildModel(type, Object.assign({ svcData: data }, args));

test('stock list, ledger, reorder, receipt, defective: real reader data builds without a read failure', { skip: skipWhy || false }, () => {
  const { env, grn } = scene();
  const mgr = env.manager();
  const { R } = load('manager');
  const stock = env.core.reportData('svcStockList', {}, mgr);
  assert.equal(stock.ok, true, JSON.stringify(stock));
  const m = plain(withData(R, 'svcStockList', stock, {}));
  assert.ok(!/RPT_/.test(JSON.stringify(m)), JSON.stringify(m).slice(0, 300));
  const t = m.blocks.find((b) => b.t === 'table');
  const vi = t.head[0].indexOf('Stock value (FIFO)');
  assert.deepEqual(t.body.map((r) => [r[1], r[t.head[0].indexOf('On hand')], r[vi]]), [['P-0002', '5', '₹227.50'], ['P-0001', '3', '₹360.00']]);
  const led = env.core.reportData('svcPartLedger', { partCode: 'P-0001' }, mgr);
  assert.equal(led.ok, true, JSON.stringify(led));
  const lm = plain(withData(R, 'svcPartLedger', led, { partCode: 'P-0001' }));
  assert.ok(!/RPT_/.test(JSON.stringify(lm)), JSON.stringify(lm).slice(0, 400));
  const lt = lm.blocks.filter((b) => b.t === 'table');
  assert.equal(lt[0].body.length, 4);
  assert.equal(lt[0].body[3][lt[0].head[0].indexOf('Value out')], '₹840.00');
  const re = env.core.reportData('svcReorderList', {}, mgr);
  assert.equal(re.ok, true, JSON.stringify(re));
  assert.ok(!/RPT_/.test(JSON.stringify(plain(withData(R, 'svcReorderList', re, {})))));
  const gr = env.core.reportData('svcGoodsReceipt', { grnNo: grn }, mgr);
  assert.equal(gr.ok, true, JSON.stringify(gr));
  const gm = plain(withData(R, 'svcGoodsReceipt', gr, { grnNo: grn }));
  assert.ok(!/RPT_/.test(JSON.stringify(gm)), JSON.stringify(gm).slice(0, 300));
  const df = env.core.reportData('svcDefectiveRegister', { from: '2026-11-01', to: '2026-11-30' }, mgr);
  assert.equal(df.ok, true, JSON.stringify(df));
  const dm = plain(withData(R, 'svcDefectiveRegister', df, { month: '2026-11' }));
  assert.ok(!/RPT_/.test(JSON.stringify(dm)), JSON.stringify(dm).slice(0, 300));
  assert.equal(kpi(dm, 'Held for claim').value, '1');
  const ad = env.core.reportData('svcAdjustmentRegister', { from: '2026-11-01', to: '2026-11-30' }, mgr);
  assert.equal(ad.ok, true, JSON.stringify(ad));
  assert.ok(!/RPT_/.test(JSON.stringify(plain(withData(R, 'svcAdjustmentRegister', ad, { month: '2026-11' })))));
});

test('the technician reader data has no cost and the report prints quantities only', { skip: skipWhy || false }, () => {
  const { env } = scene();
  const { R } = load('technician');
  const stock = env.core.reportData('svcStockList', {}, env.staff());
  assert.equal(stock.ok, true, JSON.stringify(stock));
  const m = withData(R, 'svcStockList', stock, {});
  assert.ok(tableOf(m) && !/RPT_|₹/.test(text(m)));
});

test('reader failures from the real core map to report bodies', { skip: skipWhy || false }, () => {
  const env = kit.makeEnv({});
  const { R } = load('manager');
  const empty = env.core.reportData('svcStockList', {}, env.manager());
  assert.equal(empty.ok, false);
  assert.match(text(withData(R, 'svcStockList', empty, {})), /RPT_NOT_READY/);
  const denied = env.core.reportData('svcPartLedger', { partCode: 'P-0001' }, env.staff());
  assert.equal(denied.ok, false);
  assert.match(text(withData(R, 'svcPartLedger', denied, { partCode: 'P-0001' })), /RPT_ROLE_DENIED/);
  const nosess = env.core.reportData('svcStockList', {}, { session: kit.BROKEN });
  assert.equal(nosess.ok, false);
  assert.match(text(withData(R, 'svcStockList', nosess, {})), /RPT_ROLE_DENIED/);
});
