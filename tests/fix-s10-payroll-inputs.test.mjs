import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayroll, loadState, row } from './lib/fix-s10-payroll-harness.mjs';

const EVIL = '<img src=x onerror=alert(1)>';
function form(p, v) {
  const map = { advEmp: '0', advAmt: '', advEmi: '', advMonth: 'November', advYear: '2026', advDate: '2026-11-05', advMode: 'Cash', advRef: '', advApprovedBy: 'Owner', advReason: '', ...v };
  Object.entries(map).forEach(([id, value]) => { p.el(id).value = String(value); });
}
const numbers = p => p.run('state.advances.map(a=>a.voucherNo)');

// ---------- F-03 ----------
test('F-03 voucher numbers stay unique after a delete', async () => {
  const p = createPayroll({ reauth: true }); loadState(p);
  for (let i = 0; i < 3; i++) { form(p, { advAmt: 1000 + i }); p.run('createAdvance()'); }
  assert.deepEqual(numbers(p), ['GM/ADV/2026/001', 'GM/ADV/2026/002', 'GM/ADV/2026/003']);
  const firstId = p.run('state.advances[0].id');
  await p.run(`delAdvance(${firstId})`);
  form(p, { advAmt: 1300 }); p.run('createAdvance()');
  const nos = numbers(p);
  assert.equal(new Set(nos).size, nos.length, nos.join(','));
  assert.equal(nos[nos.length - 1], 'GM/ADV/2026/004');
});

test('F-03 the number of a deleted newest voucher is not issued again', async () => {
  const p = createPayroll({ reauth: true }); loadState(p);
  form(p, { advAmt: 1000 }); p.run('createAdvance()');
  form(p, { advAmt: 1100 }); p.run('createAdvance()');
  await p.run(`delAdvance(${p.run('state.advances[1].id')})`);
  form(p, { advAmt: 1200 }); p.run('createAdvance()');
  assert.deepEqual(numbers(p), ['GM/ADV/2026/001', 'GM/ADV/2026/003']);
});

test('F-03 vouchers already stored twice are flagged, not renumbered', () => {
  const p = createPayroll();
  loadState(p, { advances: [{ id: 5, voucherNo: 'GM/ADV/2026/003' }, { id: 6, voucherNo: 'GM/ADV/2026/003' }] });
  assert.deepEqual(numbers(p), ['GM/ADV/2026/003', 'GM/ADV/2026/003']);
  assert.ok(p.run('checkGlobalValidation().some(i=>/used by 2 vouchers/.test(i.text))'));
  assert.equal(p.run('advVoucherNo()'), 'GM/ADV/2026/004');
});

// ---------- F-04 ----------
test('F-04 employee names are escaped in the warnings list', () => {
  const p = createPayroll(); loadState(p, { rows: [row({ name: EVIL, leavesApplied: 6 })] });
  p.run('renderValidation()');
  const html = p.nodes.get('val-list').innerHTML;
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;img'), html);
});

test('F-04 no screen puts a raw name, id, designation, bank text or remark into the page', () => {
  const p = createPayroll({ reauth: true });
  const bad = row({ name: EVIL, empId: EVIL, designation: EVIL, remarks: EVIL, salaryRemark: EVIL, bankName: EVIL, uan: EVIL, paidRef: EVIL, leavesApplied: 6 });
  loadState(p, { rows: [bad], advances: [{ id: 5, voucherNo: EVIL, empId: EVIL, empName: EVIL, amount: 100, reason: EVIL, mode: EVIL, refNo: EVIL, approvedBy: EVIL, deductMonth: 'November', deductYear: 2026 }] });
  p.log.html.length = 0;
  for (const call of ['renderAttendance()', 'renderAttSummary()', 'renderValidation()', 'renderMaster()', 'renderGM()', 'renderAdvances()',
    'renderApproval()', 'renderReports()', 'renderSlipsTab()', 'renderHr()', 'renderFnfPreview()']) {
    try { p.run(call); } catch (e) { /* a missing fake DOM node is not a finding; the write log below is what counts */ }
  }
  const raw = p.log.html.filter(w => /<img\b/i.test(w.html));
  assert.deepEqual(raw.map(w => w.id), [], 'raw <img> written into: ' + raw.map(w => w.id).join(', '));
  assert.ok(p.log.html.length > 5, 'the screens really rendered');
});

test('F-04 an imported text id can not reach an onclick attribute', () => {
  const p = createPayroll();
  loadState(p, { advances: [{ id: '1);alert(1);//', voucherNo: 'GM/ADV/2026/001', empId: 'GM001', empName: 'Asha', amount: 100, deductMonth: 'November', deductYear: 2026 }] });
  p.run('renderAdvances()');
  const html = p.nodes.get('adv-body').innerHTML;
  assert.ok(!html.includes('alert(1)'), html);
});

test('F-04 the saved HTML snapshot can not be broken out of its data script', () => {
  const p = createPayroll(); loadState(p, { rows: [row({ name: '</script><script>alert(1)</script>' })] });
  p.run('downloadSnapshot()');
  const ds = p.el('__clone_app_data');
  assert.ok(!/<\//.test(ds.textContent), ds.textContent.slice(0, 200));
  assert.equal(JSON.parse(ds.textContent).rows[0].name, '</script><script>alert(1)</script>');
});

// ---------- F-06 ----------
test('F-06 a negative attendance value counts as zero and is flagged', () => {
  const p = createPayroll(); loadState(p, { rows: [row({ absent: -2 })] });
  assert.equal(p.run('calcAttendance(state.rows[0]).totalDeduction'), 0);
  assert.ok(p.run('calcAttendance(state.rows[0]).issues.some(i=>i.type==="risk"&&/outside 0 to 30/.test(i.text))'));
  const base = createPayroll(); loadState(base, { rows: [row()] });
  assert.equal(p.run('calcGM(state.rows[0]).finalPay'), base.run('calcGM(state.rows[0]).finalPay'));
  assert.ok(p.run('runBlockingErrors().length') > 0, 'a stored out-of-range value blocks locking until corrected');
});

test('F-06 typing a negative or too-large value is refused at the input', () => {
  const p = createPayroll(); loadState(p);
  const ev = value => ({ target: { type: 'number', value, dataset: { row: '0', field: 'absent' } } });
  p.ctx.__ev = ev('-2'); p.run('handleAttInput(__ev)');
  assert.equal(p.run('state.rows[0].absent'), 0); assert.match(p.toastText(), /cannot be negative/);
  p.ctx.__ev = ev('99'); p.run('handleAttInput(__ev)');
  assert.equal(p.run('state.rows[0].absent'), 30); assert.match(p.toastText(), /days in the month/);
  p.ctx.__ev = ev('2.5'); p.run('handleAttInput(__ev)');
  assert.equal(p.run('state.rows[0].absent'), 2.5);
});

test('F-06 normal attendance gives exactly the same deductions as before', () => {
  const p = createPayroll(); loadState(p, { rows: [row({ absent: 1.5, halfDay: 2, late: 7, noThumb: 1, leavesApplied: 2 })] });
  const c = p.run('calcAttendance(state.rows[0])');
  assert.equal(c.lateDeduction, 1); assert.equal(c.absentDeduction, 1.5); assert.equal(c.halfDayDeduction, 1);
  assert.equal(c.noThumbDeduction, 0.5); assert.equal(c.totalDeduction, 4);
});

// ---------- F-07 ----------
function setForm(p, over = {}) {
  const v = { setPtMaleExempt: 7500, setPtMaleMid: 10000, setPtMaleMidAmt: 175, setPtStd: 200, setPtFeb: 300, setPtFemaleExempt: 25000, setPfEE: 12, setPfER: 13, setPfCap: 15000, setEsEE: 0.75, setEsER: 3.25, setEsCeil: 21000, setFirmName: 'SAAGAR TRADERS', setSignatory: '', setFirmAddr: '', setFirmContact: '', ...over };
  Object.entries(v).forEach(([id, value]) => { p.el(id).value = String(value); });
}
test('F-07 PF 120 percent, PF -5 percent and blanks are refused and nothing is saved', () => {
  const p = createPayroll(); loadState(p);
  for (const bad of [{ setPfEE: 120 }, { setPfEE: -5 }, { setPfEE: '' }, { setEsEE: 11 }, { setPfCap: 0 }, { setPtStd: 99999 }, { setPtMaleExempt: 20000 }]) {
    setForm(p, bad); p.run('saveSettings()');
    assert.match(p.toastText(), /Settings NOT saved/, JSON.stringify(bad));
    assert.equal(p.run('state.meta.rules.pf.rateEE'), 12, JSON.stringify(bad));
  }
});
test('F-07 the standard figures still save', () => {
  const p = createPayroll(); loadState(p); setForm(p, { setPfEE: 12.5 }); p.run('saveSettings()');
  assert.match(p.toastText(), /Settings saved/); assert.equal(p.run('state.meta.rules.pf.rateEE'), 12.5);
});
test('F-07 bad figures already stored block the lock', () => {
  const p = createPayroll(); loadState(p); p.run('state.meta.rules.pf.rateEE=120');
  assert.ok(p.run('runBlockingErrors().some(e=>e.name==="Settings")'));
});
