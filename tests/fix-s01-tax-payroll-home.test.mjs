// tests/fix-s01-tax-payroll-home.test.mjs
// S01: Home figures and report numbers in www/index.html:
// U14-04 (Cash tile, Net today), U11-F05 (due today is not overdue), U10-F05 (payroll summary),
// U07-F08 (warranty reminder), U09-F05 (leave today), U01-L1 (heroINR).
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fn, between, loadPolicy, sandbox, shell } from './lib/fix-s01-extract.mjs';

process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const POLICY = loadPolicy();

test('U14-04: computeQmsDay separates Cash-mode purchases from total sales', () => {
  const customers = [
    { entryTime: '2026-11-12T10:00', outcome: 'Purchase', purchaseAmount: 37000, paymentMode: 'Cash' },
    { entryTime: '2026-11-12T11:00', outcome: 'Purchase', purchaseAmount: 21000, paymentMode: 'Card' },
    { entryTime: '2026-11-12T12:00', outcome: 'Purchase', purchaseAmount: 48500, paymentMode: 'UPI' },
    { entryTime: '2026-11-12T13:00', outcome: 'Purchase', purchaseAmount: 91500, paymentMode: 'Mixed' },
    { entryTime: '2026-11-12T14:00', outcome: 'Non Purchase' },
    { entryTime: '2026-11-11T10:00', outcome: 'Purchase', purchaseAmount: 999, paymentMode: 'Cash' }
  ];
  const ctx = sandbox({ qmsState: () => ({ customers, cros: [] }) }, fn('computeQmsDay'));
  const day = ctx.computeQmsDay('2026-11-12', customers);
  assert.equal(day.cashSales, 37000);
  assert.equal(day.sales, 198000);
  assert.equal(day.purchases, 4);
});

test('U14-04: the Home Cash tile reads qmsCash and Net adds Expense income', () => {
  assert.ok(shell.includes("[heroINR(b.qmsCash||0),"), 'Cash tile');
  assert.ok(shell.includes("const net=(Number(b.qmsSales)||0)+(Number(b.incomeTodayAmount)||0)-(Number(b.expenseTodayAmount)||0);"), 'Net');
  assert.ok(!shell.includes("[heroINR(b.qmsSales||0),"), 'old tile gone');
  const net = (b) => (Number(b.qmsSales) || 0) + (Number(b.incomeTodayAmount) || 0) - (Number(b.expenseTodayAmount) || 0);
  assert.equal(net({ qmsSales: 198000, incomeTodayAmount: 29000, expenseTodayAmount: 800 }), 226200);
});

test('U14-04: buildTodayBrief sums the day Expense income and keeps qmsSales as total sales', () => {
  const body = between("  const expAll=briefJson('gm_expenses',[]);", "  const statements=briefJson");
  const rowsSrc = [
    { type: 'expense', date: '2026-11-12', amount: 800 },
    { type: 'income', date: '2026-11-12', amount: 29000 },
    { type: 'income', date: '2026-11-12', amount: 111, void: true },
    { type: 'income', date: '2026-11-10', amount: 5 }
  ];
  const run = new vm.Script(`(function(out,t,selection,branches,briefJson,briefScopeRows,window){ ${body}\n return out; })`);
  const f = run.runInNewContext({});
  const out = f({}, '2026-11-12', {}, [], () => rowsSrc, (o, rows) => rows, { SaagarDashboardPolicy: POLICY });
  assert.equal(out.incomeTodayAmount, 29000);
  assert.equal(out.expenseTodayAmount, 800);
  const out2 = f({}, '2026-11-12', {}, [], () => rowsSrc, (o, rows) => rows, {});
  assert.equal(out2.incomeTodayAmount, 0, 'no policy file: income is 0, the brief still builds');
  assert.equal(out2.expenseTodayAmount, 800);
  assert.ok(shell.includes("'Income':'expense'"), 'Income scope label hidden from roles without Expense');
  assert.ok(shell.includes('out.qmsCash=day.cashSales;'));
  assert.ok(shell.includes('out.qmsSales=day.sales;'));
});

function taxCtx(items, todayIso) {
  const state = { compliance: { F1: { 2026: items } }, firms: [] };
  return sandbox({ tryJSON: JSON.parse, safeGet: () => JSON.stringify(state), todayIso: () => todayIso },
    fn('dueLocal'), fn('computeTaxStatus'));
}

test('U11-F05: an item due today is not overdue; yesterday is; +3 days is this week', () => {
  const ctx = taxCtx({
    a: { dueDate: '2026-11-12' }, b: { dueDate: '2026-11-11' }, c: { dueDate: '2026-11-15' }, d: { dueDate: '2026-11-12', done: true }, e: { dueDate: '2026-11-12', na: true }
  }, '2026-11-12');
  const s = ctx.computeTaxStatus();
  assert.equal(s.overdue, 1);
  assert.equal(s.dueWeek, 2);
  assert.equal(s.done, 1);
});

test('U11-F05: the Home brief and the firm status use the same local-date rule', () => {
  const tax = between("  const tax=briefJson('taxcal_v2',{});", "  const odb=");
  assert.ok(tax.includes('const now=dueLocal(todayIso());'));
  assert.ok(tax.includes('dueLocal(v.dueDate)'));
  assert.ok(!/new Date\(v\.dueDate\)/.test(tax));
  const firm = fn('computeFirmTaxStatus');
  assert.ok(firm.includes('const now = dueLocal(todayIso());'));
  assert.ok(!/new Date\(v\.dueDate\)/.test(firm));
  assert.ok(!/new Date\(v\.dueDate\)/.test(fn('computeTaxStatus')));
  const state = { compliance: { F1: { 2026: { a: { dueDate: '2026-11-12', name: 'Today' }, b: { dueDate: '2026-11-11', name: 'Yest' } } } } };
  const ctx = sandbox({ tryJSON: JSON.parse, safeGet: () => JSON.stringify(state), todayIso: () => '2026-11-12', getTaxComplianceLabel: k => k }, fn('dueLocal'), fn('computeFirmTaxStatus'));
  const r = ctx.computeFirmTaxStatus('F1', 2026);
  assert.equal(r.overdue, 1);
  assert.equal(r.dueWeek, 1);
});

test('U11-F05: the brief tax segment counts due-today as week, yesterday as overdue', () => {
  const seg = between("  const tax=briefJson('taxcal_v2',{});", "  const odb=");
  const tax = { compliance: { F1: { 2026: { a: { dueDate: '2026-11-12' }, b: { dueDate: '2026-11-11' }, c: { dueDate: '2026-11-17' } } } } };
  const f = new vm.Script(`(function(out,briefJson,todayIso,dueLocal){ ${seg}\n return out; })`).runInNewContext({});
  const ctx = sandbox({}, fn('dueLocal'));
  const out = f({}, () => tax, () => '2026-11-12', ctx.dueLocal);
  assert.equal(out.taxOverdue, 1);
  assert.equal(out.taxDueWeek, 2);
});

test('U10-F05: computePayrollSummary reads active rows and the run status of the sheet month', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push({ gross: 20000, net: 16000, active: i !== 0 });
  const state = { meta: { month: 'November', year: 2026 }, rows, runs: { 'November-2026': { status: 'locked' } } };
  const ctx = sandbox({ SaagarDashboardPolicy: POLICY, tryJSON: JSON.parse, safeGet: () => JSON.stringify(state) }, fn('computePayrollSummary'));
  const s = ctx.computePayrollSummary();
  assert.equal(s.headcount, 14);
  assert.equal(s.net, 14 * 16000);
  assert.equal(s.status, 'locked');
});

test('U07-F08: the Home warranty reminder count uses warrantyDue', () => {
  assert.ok(shell.includes('const _due=SaagarDashboardPolicy.warrantyDue(_cases,_soon);'));
  assert.ok(!shell.includes("f.auto==='warranty'&&f.dueDate&&f.dueDate<=_soon&&!f.done"));
});

test('U09-F05: Home On leave today counts approved and legacy rows, not pending or rejected', () => {
  const seg = between("  const ld=briefJson('leavedesk_v3'", "  // Tax and backup");
  const t = '2026-11-12';
  const ld = { leaves: { [t]: { Legacy: { type: 'CL' }, Approved: { status: 'approved' }, Pending: { status: 'pending' }, Rejected: { status: 'rejected' } } }, employees: [] };
  const f = new vm.Script(`(function(out,t,selection,branches,briefJson,briefScopeRows){ ${seg}\n return out; })`).runInNewContext({});
  const out = f({}, t, {}, [], () => ld, (o, rows) => rows);
  assert.equal(out.leavesToday, 2);
  const ld2 = { leaves: { [t]: ['Anil', 'Bina'] }, employees: [] };
  assert.equal(f({}, t, {}, [], () => ld2, (o, rows) => rows).leavesToday, 2);
});

test('U01-L1: heroINR shows 99,99,999 as 1Cr (not 100L) and 99,99,499 as 99.99L', () => {
  const line = /const heroINR = n => \{[^\n]*\};/.exec(shell);
  assert.ok(line, 'heroINR line');
  assert.ok(line[0].includes('a>=9999500'));
  const f = new vm.Script(`(function(hideAmts){ ${line[0]} return heroINR; })`).runInNewContext({});
  const h = f(false);
  assert.equal(h(9999999), '₹1Cr');
  assert.equal(h(9999499), '₹99.99L');
  assert.equal(h(12500000), '₹1.25Cr');
  assert.equal(h(150000), '₹1.50L');
  assert.equal(h(5000), '₹5,000');
  assert.equal(f(true)(5), '₹ •••');
});
