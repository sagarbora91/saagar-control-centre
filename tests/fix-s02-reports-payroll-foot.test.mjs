// S02 U02-F16 (register total foots) and S02-3 / U10-F-05 (retired payroll rows are skipped by the report)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReport } from './lib/fix-s02-load.mjs';

const mk = (id, net) => ({ empId: id, name: 'N' + id, designation: 'D', gross: 0, ot: 0, pt: 0, pf: 0, esic: 0, advance: 0, net });
const tableOf = (m) => m.blocks.find((b) => b.t === 'table');
const kpi = (m, label) => m.blocks.find((b) => b.t === 'kpi').items.find((i) => i.label === label);
const noteTexts = (m) => m.blocks.filter((b) => b.t === 'note').map((b) => b.text);

test('three rows of 0.4 print 0 each; the foot, KPI and carry sums print 0 and the note shows 1.20', () => {
  const { R } = loadReport({});
  const m = R._buildModel('payrollRegister', { rows: [mk('1', 0.4), mk('2', 0.4), mk('3', 0.4)], totals: { net: 1.2 } });
  const t = tableOf(m);
  assert.deepEqual([...t.body.map((r) => r[10])], ['₹0', '₹0', '₹0']);
  assert.equal(t.foot[0][10], '₹0');
  assert.equal(kpi(m, 'Net Payable').value, '₹0');
  const sum = t.raw.reduce((a, r) => a + r[10], 0);
  assert.equal(sum, 0);
  assert.ok(noteTexts(m).some((x) => /Unrounded net payable: ₹1\.20/.test(x)), noteTexts(m).join('|'));
});

test('rows that already foot add no note and print the whole-rupee total', () => {
  const { R } = loadReport({});
  const m = R._buildModel('payrollRegister', { rows: [mk('1', 16000.1), mk('2', 2000.1), mk('3', 2.1)], totals: { net: 18002.3 } });
  const t = tableOf(m);
  assert.deepEqual([...t.body.map((r) => r[10])], ['₹16,000', '₹2,000', '₹2']);
  assert.equal(t.foot[0][10], '₹18,002');
  assert.equal(kpi(m, 'Net Payable').value, '₹18,002');
  assert.ok(!noteTexts(m).some((x) => /Unrounded/.test(x)));
  const ints = R._buildModel('payrollRegister', { rows: [mk('1', 100), mk('2', 200)], totals: { net: 300 } });
  assert.ok(!noteTexts(ints).some((x) => /Unrounded/.test(x)));
});

test('S02-3 the stored-register fallback skips retired rows', () => {
  const rows = [
    { empId: 'E1', name: 'Active One', designation: 'A', grossPayable: 1000, pf: 0, esic: 0, pt: 0, advance: 0, net: 1000 },
    { empId: 'E2', name: 'Retired Two', designation: 'A', grossPayable: 0, pf: 0, esic: 0, pt: 0, advance: 0, net: 0, active: false },
    { empId: 'E3', name: 'Active Three', designation: 'A', grossPayable: 500, pf: 0, esic: 0, pt: 0, advance: 0, net: 500, active: true }
  ];
  const { R } = loadReport({ storage: { payroll_suite_v1_2026: { meta: { month: 'November', year: 2026 }, rows } } });
  const m = R._buildModel('payrollRegister', {});
  const t = tableOf(m);
  assert.equal(t.body.length, 2);
  assert.ok(!JSON.stringify(m).includes('Retired Two'));
  assert.equal(kpi(m, 'Employees').value, '2');
});

test('S02-3 the slip lookup skips retired rows', () => {
  const rows = [
    { empId: 'E1', name: 'Retired First', designation: 'A', grossPayable: 10, net: 10, active: false },
    { empId: 'E2', name: 'Active Second', designation: 'A', grossPayable: 20, net: 20 }
  ];
  const { R } = loadReport({ storage: { payroll_suite_v1_2026: { meta: { month: 'November', year: 2026 }, rows } } });
  const none = JSON.stringify(R._buildModel('payrollSlip', { empId: 'E1' }));
  assert.ok(none.includes('Employee not found'), 'a retired employee has no slip');
  const first = JSON.stringify(R._buildModel('payrollSlip', {}));
  assert.ok(first.includes('Active Second') && !first.includes('Retired First'), 'default slip is the first active row');
  const byIdx = JSON.stringify(R._buildModel('payrollSlip', { empIndex: 0 }));
  assert.ok(byIdx.includes('Employee not found'));
  const ok = JSON.stringify(R._buildModel('payrollSlip', { empId: 'E2' }));
  assert.ok(ok.includes('Active Second'));
});
