// S07 U06-F03 (characterisation), U06-F06 (zero final amount), U06-F07 (GST basis), U10-F-05 (retired payroll rows),
// S07-3 (voided service rows are not re-posted).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExpense } from './lib/fix-s07-expense-harness.mjs';

const OWNER = { isOwner: true, isManager: true, role: 'Store Manager' };
const CASHIER = { isOwner: false, isManager: false, role: 'Cashier' };
const todayOf = () => loadExpense().today();
const refs = (x) => [...x.run('feedItems().map(function(i){return i.ref+":"+i.posted+":"+i.amount;})')];

test('F03 the QMS source key stays qms_<id> (characterisation, must pass before and after)', () => {
  const t = todayOf();
  const mk = (extra) => ({ outcome: 'purchase', purchaseAmount: 100, exitTime: t, ...extra });
  const x = loadExpense({
    storage: {
      retail_queue_management_v1: { customers: [mk({ id: 'A' }), mk({ id: 'B' }), mk({ mobile: '9876543210' })] },
      gm_expenses: [{ id: 'r1', date: t, type: 'income', amount: 100, mode: 'Cash', category: 'Retail Sale', sourceRef: 'qms_A' }]
    }
  });
  assert.deepEqual(refs(x), ['qms_A:true:100', 'qms_B:false:100', 'qms_9876543210:false:100']);
});

test('F06 a zero or non-numeric final amount is final, never replaced by the estimate', () => {
  const t = todayOf();
  const closed = (id, delivery, extra = {}) => ({ id, status: 'closed', closedAt: t, estTotal: 999, delivery, ...extra });
  const x = loadExpense({
    storage: {
      saagar_wsf_v2: [
        closed('Z', { finalAmt: 0 }), closed('S', { finalAmt: '0' }), closed('N', { finalAmt: -5 }),
        closed('P', { finalAmt: 250 }), closed('E', { finalAmt: '' }), closed('M', undefined)
      ]
    }
  });
  const got = refs(x);
  assert.ok(!got.some((r) => r.startsWith('wsc_Z:')), 'zero');
  assert.ok(!got.some((r) => r.startsWith('wsc_S:')), 'string zero');
  assert.ok(!got.some((r) => r.startsWith('wsc_N:')), 'negative');
  assert.ok(got.includes('wsc_P:false:250'));
  assert.ok(got.includes('wsc_E:false:999'), 'blank final falls back to the estimate, as before');
  assert.ok(got.includes('wsc_M:false:999'), 'no delivery falls back to the estimate, as before');
});

test('S07-3 a voided service row still counts as posted and is not offered again', () => {
  const t = todayOf();
  const x = loadExpense({
    storage: {
      saagar_wsf_v2: [{ id: 'V', status: 'closed', closedAt: t, delivery: { finalAmt: 300 } }],
      gm_expenses: [{ id: 'r1', date: t, type: 'income', amount: 300, mode: 'Cash', category: 'Service Income', sourceRef: 'wsc_V', void: true }]
    }
  });
  assert.deepEqual(refs(x), ['wsc_V:true:300']);
});

test('U10-F-05 the payroll feed skips retired rows', () => {
  const pay = (rows) => ({ meta: { year: 2026, month: 11 }, rows });
  const x = loadExpense({ storage: { payroll_suite_v1_2026: pay([{ firm: 'GM', gross: 1000 }, { firm: 'GM', gross: 500, active: false }, { firm: 'XY', gross: 200 }]) } });
  const items = x.run("feedItems().filter(function(i){return i.src==='payroll';}).map(function(i){return i.ref+'='+i.amount;})");
  assert.deepEqual([...items].sort(), ['pay_2026_11_GM=1000', 'pay_2026_11_XY=200']);
  const none = loadExpense({ storage: { payroll_suite_v1_2026: pay([{ firm: 'GM', gross: 500, active: false }]) } });
  assert.equal(none.run("feedItems().filter(function(i){return i.src==='payroll';}).length"), 0);
});

function gstWorld({ shell = OWNER, reauth = true, settings = { gstRate: 18 }, extra = [] } = {}) {
  const x = loadExpense({
    shell, reauth,
    storage: {
      gm_role: 'owner', gm_settings: settings,
      gm_expenses: [{ id: 'i1', date: '2026-01-05', type: 'income', amount: 118, mode: 'Cash', category: 'Retail Sale' }, ...extra]
    }
  });
  x.run("CM='2026-01'; renderClose=function(){}; toast=function(){};");
  return x;
}

test('F07 default basis is inclusive: 118 at 18 percent gives 18', async () => {
  const x = gstWorld();
  await x.run('genTaxFeed()');
  const feed = x.json('gm_tax_feed')['2026-01'];
  assert.ok(Math.abs(feed.gstEstimate - 18) < 1e-9);
  assert.equal(feed.incomeGstBasis, 'inclusive');
});

test('F07 exclusive basis keeps the old arithmetic', async () => {
  const x = gstWorld({ settings: { gstRate: 18, gstIncomeBasis: 'exclusive' } });
  await x.run('genTaxFeed()');
  const feed = x.json('gm_tax_feed')['2026-01'];
  assert.ok(Math.abs(feed.gstEstimate - 21.24) < 1e-9);
  assert.equal(feed.incomeGstBasis, 'exclusive');
});

test('F07 mixed categories, inclusive', async () => {
  const x = loadExpense({
    shell: OWNER, reauth: true,
    storage: {
      gm_role: 'owner', gm_settings: { gstRate: 18 }, gm_gst_rates: { 'Retail Sale': 5 },
      gm_expenses: [
        { id: 'i1', date: '2026-01-05', type: 'income', amount: 10000, mode: 'Cash', category: 'Retail Sale' },
        { id: 'i2', date: '2026-01-06', type: 'income', amount: 1000, mode: 'UPI', category: 'Service Income' }
      ]
    }
  });
  x.run("CM='2026-01'; renderClose=function(){}; toast=function(){};");
  await x.run('genTaxFeed()');
  const feed = x.json('gm_tax_feed')['2026-01'];
  assert.ok(Math.abs(feed.gstEstimate - (10000 * 5 / 105 + 1000 * 18 / 118)) < 1e-6);
  assert.ok(Math.abs(feed.gstEstimateByCat['Retail Sale'].estimate - 476.190476) < 1e-5);
});

test('F07 gstOnIncome edge cases', () => {
  const x = loadExpense();
  assert.ok(Math.abs(x.run("gstOnIncome(100,18,'inclusive')") - 15.254237288135593) < 1e-9);
  assert.equal(x.run("gstOnIncome(100,0,'inclusive')"), 0);
  assert.equal(x.run("gstOnIncome(100,-5,'inclusive')"), 0);
  assert.equal(x.run("gstOnIncome(-100,18,'exclusive')"), 0);
  assert.equal(x.run("gstOnIncome(100,18,'exclusive')"), 18);
});

test('F07 only the Owner can change the basis, and it is audited', () => {
  const cashier = gstWorld({ shell: CASHIER });
  cashier.run("saveGstBasis('exclusive')");
  assert.equal(cashier.json('gm_settings').gstIncomeBasis, undefined);

  const owner = gstWorld();
  owner.run("saveGstBasis('exclusive')");
  assert.equal(owner.json('gm_settings').gstIncomeBasis, 'exclusive');
  assert.ok(owner.json('gm_audit', []).some((a) => a.action === 'gst.basis'));
});

test('F07 month screen shows the basis switch and the footnote', () => {
  const x2 = loadExpense({ shell: OWNER, storage: { gm_role: 'owner', gm_settings: { gstRate: 18 }, gm_expenses: [{ id: 'i1', date: '2026-01-05', type: 'income', amount: 118, mode: 'Cash', category: 'Retail Sale' }] } });
  x2.run("CM='2026-01'; isPast=function(){return false;}; renderClose();");
  const html = x2.get('closeC').innerHTML;
  assert.ok(html.includes('id="gstbasis"'));
  assert.ok(html.includes('onchange="saveGstBasis(this.value)"'));
  assert.match(html, /treated as GST-inclusive/);
});

test('F07 a negative default rate is stored as zero', () => {
  const x = gstWorld();
  x.run("saveGst('-4')");
  assert.equal(x.json('gm_settings').gstRate, 0);
});
