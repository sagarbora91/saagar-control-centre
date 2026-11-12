// S02 U02-F03 (CSV header cells, numeric money) and CRIT-07 (one CSV rule)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReport } from './lib/fix-s02-load.mjs';

const lines = (text) => text.replace(/^﻿/, '').split('\r\n');
const row = (id, name, net, extra = {}) => Object.assign({ empId: id, name, designation: 'Cashier', gross: net, ot: 0, pt: 0, pf: 0, esic: 0, advance: 0, net }, extra);

test('payrollRegister CSV: header is one cell per column, money is plain numbers', () => {
  const { R } = loadReport({});
  const rows = [row('E1', 'Asha', 16000), row('E2', 'Bina', 953000), row('E3', 'Chitra', -500)];
  const csv = R._modelToCsv('payrollRegister', { rows, totals: { gross: 968500, net: 968500 }, period: 'November 2026' });
  const l = lines(csv.text);
  assert.equal(l[0], '"Sr","Emp ID","Employee","Designation","Gross","OT","PT","PF (EE)","ESIC","Advance","Net Pay"');
  assert.equal(l[1], '"1","E1","Asha","Cashier","16000","0","0","0","0","0","16000"');
  assert.match(l[2], /"953000"$/);
  assert.match(l[3], /,"-500"$/);
  assert.ok(!/₹/.test(csv.text), 'no rupee sign in money cells');
  const total = l[l.length - 1];
  assert.ok(total.startsWith('"","","TOTAL (3)"'), total);
  assert.match(total, /"968500"$/);
  assert.equal(csv.rowCount, 3);
});

test('text cells keep the formula guard, money cells that are not numeric text fall back to it', () => {
  const { R } = loadReport({});
  const rows = [row('E1', '=HYPERLINK("http://x")', 100), row('E2', '-Dash', 100), row('E3', '@sum', 100)];
  const l = lines(R._modelToCsv('payrollRegister', { rows, totals: {} }).text);
  assert.ok(l[1].includes('"\'=HYPERLINK(""http://x"")"'), l[1]);
  assert.ok(l[2].includes('"\'-Dash"'));
  assert.ok(l[3].includes('"\'@sum"'));
  const out = R._blocksToCsv({ blocks: [{ t: 'table', head: [['A', 'B']], body: [['x', '—'], ['y', '=1+1']], money: [1] }] });
  const o = lines(out.text);
  assert.equal(o[0], '"A","B"');
  assert.equal(o[1], '"x","—"');
  assert.equal(o[2], '"y","\'=1+1"');
});

test('expenseMonthly and leaveRegister CSV carry one header cell per column', () => {
  const month = '2026-11';
  const { R } = loadReport({
    storage: {
      gm_expenses: [{ date: month + '-03', amount: 1500, category: 'Rent', type: 'expense', firm: 'Titan World' }, { date: month + '-04', amount: 9000, category: 'Sales', type: 'income' }],
      leavedesk_v3: { employees: [{ name: 'Asha', empId: 'E1', department: 'Sales' }], leaves: { [month + '-05']: [{ name: 'Asha', type: 'CL', leaveFrom: month + '-05', leaveTo: month + '-06', status: 'approved', reason: 'fever' }] } }
    }
  });
  const ex = lines(R._modelToCsv('expenseMonthly', { month }).text);
  assert.equal(ex[0], '"Category","Amount ₹","%"');
  assert.ok(ex.some((x) => x.startsWith('"Rent","1500"')), ex.join('|'));
  const lv = lines(R._modelToCsv('leaveRegister', { month }).text);
  assert.equal(lv[0].split('","').length, 12);
  assert.ok(lv[0].startsWith('"Sr","Emp ID","Employee"'));
});

test('CRIT-07 public helpers are the one reference rule', () => {
  const { R } = loadReport({});
  assert.equal(R.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(R.csvCell('\t=1'), '"\'\t=1"');
  assert.equal(R.csvCell(' @x'), '"\' @x"');
  assert.equal(R.csvCell('-abc'), '"\'-abc"');
  assert.equal(R.csvCell(-250), '"\'-250"');
  assert.equal(R.csvCell(10), '"10"');
  assert.equal(R.csvNumber('₹-1,250.50'), '"-1250.50"');
  assert.equal(R.csvNumber('₹9,53,000'), '"953000"');
  assert.equal(R.csvNumber(-5), '"-5"');
  assert.equal(R.csvNumber('=1'), R.csvCell('=1'));
  assert.equal(R.csvNumber('—'), R.csvCell('—'));
});
