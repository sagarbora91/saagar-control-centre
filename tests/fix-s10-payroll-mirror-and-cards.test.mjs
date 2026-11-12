import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayroll, loadState, row } from './lib/fix-s10-payroll-harness.mjs';

const KEY = 'payroll_suite_v1_2026';
const blob = p => JSON.parse(p.ls.getItem(KEY));
const three = () => [row(), row({ id: 2, empId: 'GM002', name: 'Ravi', gross: 15000 }), row({ id: 3, empId: 'GM003', name: 'Manish', gross: 30000, active: false })];

// ---------- F-05 (module side) ----------
test('F-05 a retired employee adds nothing to the figures other modules sum', () => {
  const p = createPayroll(); loadState(p, { rows: three() });
  p.run('saveState(false)');
  const rows = blob(p).rows;
  const retired = rows.find(r => r.empId === 'GM003');
  assert.deepEqual([retired.net, retired.pf, retired.esic, retired.pt, retired.grossPayable], [0, 0, 0, 0, 0]);
  const activeNet = p.run('payTotals().T.net');
  const sum = rows.reduce((s, r) => s + (r.net || 0), 0);
  assert.ok(Math.abs(sum - activeNet) < 0.05, `blob net ${sum} vs module ${activeNet}`);
  assert.equal(retired.active, false, 'the row itself is kept');
});

test('S10-1 CR-F1 active rows mirror pfER and esicER (employer shares); retired rows carry 0', () => {
  const p = createPayroll(); loadState(p, { rows: three() });
  p.run('saveState(false)');
  const rows = blob(p).rows;
  const act = rows.filter(r => r.active !== false && r.firm === 'GM');
  assert.ok(act.length > 0);
  for (const r of act) {
    const c = p.run('gmComputed(state.rows.find(x=>x.empId==="' + r.empId + '"))');
    assert.equal(r.pfER, Math.round((c.pfEmpr + Number.EPSILON) * 100) / 100);
    assert.equal(r.esicER, Math.round((c.esicEmpr + Number.EPSILON) * 100) / 100);
  }
  assert.ok(act.some(r => r.pfER > 0), 'at least one employer PF share is non-zero');
  const retired = rows.find(r => r.empId === 'GM003');
  assert.equal(retired.pfER, 0); assert.equal(retired.esicER, 0);
  assert.ok(!('pfEr' in retired), 'field name is pfER, not pfEr');
});

test('F-05 the stored run status follows the pay-run of the period shown', async () => {
  const p = createPayroll({ reauth: true }); loadState(p, { rows: three() });
  p.run('saveState(false)'); assert.equal(blob(p).meta.run.status, 'draft');
  p.run('state.runs["November-2026"]={status:"approved"};saveState(false)'); assert.equal(blob(p).meta.run.status, 'approved');
  p.el('apApproved').value = 'Owner';
  await p.run('lockRun()'); p.run('saveState(false)');
  assert.equal(blob(p).meta.run.status, 'locked');
  p.run('state.meta.month="December";saveState(false)'); assert.equal(blob(p).meta.run.status, 'draft');
});

// ---------- F-09 / F-10 / F-12 ----------
test('F-09 the Salary tab Total Advance card includes voucher advances', () => {
  const p = createPayroll();
  loadState(p, { advances: [{ id: 5, voucherNo: 'GM/ADV/2026/001', empId: 'GM001', empName: 'Asha', amount: 3000, emi: 0, deductMonth: 'November', deductYear: 2026 }] });
  p.run('renderGM()');
  const cards = p.nodes.get('gm-summary').innerHTML;
  assert.match(cards, /Total Advance<\/div><div class="sc-v">₹3,000</);
  assert.equal(p.nodes.get('ft-gm-adv').textContent, '3,000.00');
});

test('F-09 the Master tab Total Advance tile adds the advance actually deducted', () => {
  const p = createPayroll();
  loadState(p, { advances: [{ id: 5, voucherNo: 'GM/ADV/2026/001', empId: 'GM001', empName: 'Asha', amount: 3000, emi: 0, deductMonth: 'November', deductYear: 2026 }] });
  p.run('renderMasterSummary()');
  assert.match(p.nodes.get('ms-summary').innerHTML, /Total Advance<\/div><div class="sc-v">₹3,000</);
});

test('F-10 on a locked month the cards equal the frozen footer even after a Settings change', async () => {
  const p = createPayroll({ reauth: true }); loadState(p, { rows: three().slice(0, 2) });
  p.el('apApproved').value = 'Owner'; await p.run('lockRun()');
  assert.equal(p.run('isCurLocked()'), true);
  p.run('state.meta.rules.pf.rateEE=15;renderGM()');
  const cards = p.nodes.get('gm-summary').innerHTML;
  const frozen = Math.round(p.run('Object.values(state.runs["November-2026"].snapshot).reduce((s,c)=>s+c.netPayable,0)'));
  const cardNet = Number(/Net (?:Payable|before OT &amp; advance)<\/div><div class="sc-v">₹([\d,]+)</.exec(cards)[1].replace(/,/g, ''));
  assert.equal(cardNet, frozen);
  assert.equal(Math.round(Number(p.nodes.get('ft-gm-net').textContent.replace(/,/g, ''))), frozen);
});

test('F-11 a locked snapshot without the full breakdown shows dashes, not a false zero', () => {
  const p = createPayroll();
  loadState(p, { rows: [row()], runs: { 'November-2026': { status: 'locked', snapshot: { gm001: { totalSalaryDays: 30, grossPayable: 20000, otAmount: 0, pt: 200, pfEE: 1200, esicEE: 0, advance: 0, finalPay: 18600 } } } } });
  p.run('renderGM()');
  const html = p.nodes.get('gm-body').innerHTML;
  assert.match(html, /id="gm-td-0">—<\/td>/);
});

test('F-12 the Salary tab card is named for what it holds', () => {
  const p = createPayroll(); loadState(p); p.run('renderGM()');
  assert.match(p.nodes.get('gm-summary').innerHTML, /Net before OT &amp; advance/);
  p.run('renderApproval()');
  assert.match(p.nodes.get('ap-issues').innerHTML, /Final pay ₹/);
});
