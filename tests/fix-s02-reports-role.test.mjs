// S02 U01-F1 / U02-F01 role gate, U02-066 hub count, S02-1 closure grant, S02-4 REPORT_MODULE table
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadReport, HUB_TYPES, REPORT_SOURCE } from './lib/fix-s02-load.mjs';

const REPORT_MODULE = (() => { const m = /var\s+REPORT_MODULE\s*=\s*(\{[\s\S]*?\n\s*\});/.exec(REPORT_SOURCE); return m ? vm.runInNewContext('(' + m[1] + ')') : {}; })();
const rowsIn = (html) => [...html.matchAll(/fromHub\('([A-Za-z]+)'\)/g)].map((m) => m[1]);

test('S02-4 REPORT_MODULE has a row for every hub type', () => {
  for (const t of HUB_TYPES) assert.ok(Object.prototype.hasOwnProperty.call(REPORT_MODULE, t), t);
  assert.equal(REPORT_MODULE.ownerBrief, '*');
});

test('cashier hub shows only expense reports and the count equals the rows', () => {
  const h = loadReport({ role: 'cashier' });
  h.R.openHub();
  const html = h.html('modalBody');
  assert.deepEqual(rowsIn(html).sort(), ['cashStatement', 'expenseMonthly']);
  for (const bad of ['payrollRegister', 'payrollSlip', 'leaveRegister', 'ownerBrief', 'ownerMonthly', 'weeklyBrief', 'taxReport', 'dsrRegister']) assert.ok(!html.includes(bad), bad);
  assert.match(html, /id="hubCount">2 reports</);
});

test('other low roles see only their own modules reports', () => {
  for (const kind of ['greeter', 'others', 'technician', 'cro']) {
    const h = loadReport({ role: kind });
    h.R.openHub();
    const got = rowsIn(h.html('modalBody')).sort();
    const expected = HUB_TYPES.filter((t) => REPORT_MODULE[t] !== '*' && h.ctx.moduleVisibleForRole(REPORT_MODULE[t])).sort();
    assert.deepEqual(got, expected, kind);
    assert.ok(!got.includes('payrollRegister'), kind);
    const n = /id="hubCount">(\d+) reports</.exec(h.html('modalBody'));
    assert.equal(Number(n[1]), got.length, kind);
  }
});

test('owner and store manager see all 18 rows; manager without payroll loses ownerMonthly only among owner-level', () => {
  for (const kind of ['owner', 'manager']) {
    const h = loadReport({ role: kind });
    h.R.openHub();
    assert.equal(rowsIn(h.html('modalBody')).length, 18, kind);
    assert.match(h.html('modalBody'), /id="hubCount">18 reports</);
  }
  const h = loadReport({ role: 'manager' });
  h.ctx.moduleVisibleForRole = (id) => id !== 'payroll';
  h.R.openHub();
  const got = rowsIn(h.html('modalBody'));
  assert.ok(!got.includes('ownerMonthly'));
  assert.ok(got.includes('ownerBrief') && got.includes('weeklyBrief'));
  assert.ok(!got.includes('payrollRegister'));
});

test('preview of a refused report builds nothing, opens nothing, and the build path throws', () => {
  for (const kind of ['cashier', 'greeter', 'others', 'technician', 'cro']) {
    const h = loadReport({ role: kind });
    h.R.preview('payrollRegister', {});
    assert.equal(h.calls.openModal, 0, kind);
    assert.ok(h.calls.toasts.some((t) => /not available for your role/.test(t)), kind);
    assert.equal(h.R._pp, undefined, kind);
    assert.throws(() => h.R.build('payrollRegister', {}), /not available for your role/, kind);
    assert.throws(() => h.R._buildModel('payrollRegister', {}), /not available for your role/, kind);
  }
});

test('S02-1 a property on the exported object cannot grant a preview', () => {
  const h = loadReport({ role: 'cashier' });
  h.R._grantOnce = 'payrollRegister';
  h.R.preview('payrollRegister', {});
  assert.equal(h.calls.openModal, 0);
  assert.ok(h.calls.toasts.some((t) => /not available/.test(t)));
  h.R._grantOnce = 'payrollSlip';
  h.R.preview('payrollSlip', {});
  assert.equal(h.calls.openModal, 0);
  h.R._payrollPick('E1');
  assert.equal(h.calls.openModal, 0);
  assert.ok(!/this\._grantOnce|self\._grantOnce/.test(REPORT_SOURCE), 'the grant is never read from or written to the exported object');
});

test('S02-1 audit: arming the slip picker from outside cannot skip the payroll step-up', () => {
  const pay = { rows: [{ empId: 'E1', name: 'Asha' }] };
  const h = loadReport({ role: 'manager', ensure: false, storage: { payroll_suite_v1_2026: pay } });
  h.R.build = () => new Promise(() => {});
  h.R._ppPick = {};
  h.R._payrollPick('E1');
  assert.equal(h.R._pp, undefined, 'a property on the exported object does not arm the picker');
  h.R._payrollChooser({});
  h.R._payrollPick('E1');
  assert.equal(h.R._pp, undefined, 'calling the chooser directly (no gated preview) does not arm the picker');
  assert.deepEqual(h.calls.ensure, []);
  h.R.preview('payrollSlip', {});
  assert.deepEqual(h.calls.ensure, ['payroll']);
  h.R._payrollPick('E1');
  assert.equal(h.R._pp, undefined, 'a refused step-up does not arm the picker');
});

test('S02-1 audit: a grant left over (preview never ran) does not skip the role check after a role change', () => {
  const pay = { rows: [{ empId: 'E1', name: 'Asha' }] };
  const h = loadReport({ role: 'owner', storage: { payroll_suite_v1_2026: pay } });
  h.R.build = () => new Promise(() => {});
  h.R.preview('payrollSlip', {});
  const realPreview = h.R.preview;
  h.R.preview = () => {};          // e.g. the shell's PDF-library wrapper failed to load, so preview() never ran
  h.R._payrollPick('E1');
  h.R.preview = realPreview;
  const cashier = { isOwner: false, role: 'Cashier', isManager: false };
  h.ctx.__session = cashier; h.ctx.moduleVisibleForRole = (id) => id === 'expense';
  h.R.preview('payrollSlip', { empId: 'E1' });
  assert.equal(h.R._pp, undefined);
  assert.ok(h.calls.toasts.some((t) => /not available for your role/.test(t)));
});

test('generate and batchSlips are refused for a refused report', async () => {
  const h = loadReport({ role: 'cashier' });
  await h.R.generate('payrollRegister', {});
  await h.R.batchSlips('combined', [{ name: 'A', empId: 'E1' }]);
  assert.ok(h.calls.toasts.filter((t) => /not available/.test(t)).length >= 2);
  assert.ok(!h.calls.toasts.some((t) => /Preparing/.test(t)));
  await assert.rejects(() => h.R.buildBatch('combined', [{ name: 'A' }]), /not available for your role/);
});

test('step-up: a report of another module asks ensureModuleAccess; inside its own module it does not', () => {
  let h = loadReport({ role: 'cashier', ensure: false });
  h.R.preview('cashStatement', {});
  assert.deepEqual(h.calls.ensure, ['expense']);
  assert.equal(h.calls.openModal, 0);
  h = loadReport({ role: 'cashier', ensure: true });
  h.R.build = () => new Promise(() => {});
  h.R.preview('cashStatement', {});
  assert.equal(h.calls.openModal, 1);
  h = loadReport({ role: 'cashier', ensure: false, globals: { activeModuleId: 'expense' } });
  h.R.build = () => new Promise(() => {});
  h.R.preview('cashStatement', {});
  assert.deepEqual(h.calls.ensure, []);
  assert.equal(h.calls.openModal, 1);
});

test('fromHub of a refused report is not added to Recent', () => {
  const h = loadReport({ role: 'cashier' });
  h.R.fromHub('payrollRegister');
  assert.equal(h.store.saagar_rpt_recent, undefined);
  assert.equal(h.calls.openModal, 0);
});

test('list, canOpen, history and the packs follow the role', async () => {
  const h = loadReport({ role: 'cashier', storage: { saagar_rpt_log: [{ t: 'payrollRegister', a: 'view', ts: Date.now() }, { t: 'cashStatement', a: 'view', ts: Date.now() }], saagar_rpt_recent: ['payrollRegister', 'cashStatement'] } });
  assert.deepEqual([...h.R.list().map((x) => x.type)].sort(), ['cashStatement', 'expenseMonthly']);
  assert.equal(h.R.canOpen('payrollRegister'), false);
  assert.equal(h.R.canOpen('cashStatement'), true);
  h.R.history();
  const hist = h.html('modalBody');
  assert.ok(hist.includes('cashStatement') && !hist.includes('payrollRegister'));
  const attempted = [];
  h.R.build = (t) => { attempted.push(t); return Promise.reject(new Error('x')); };
  h.R.pack('monthly');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(attempted, ['expenseMonthly']);
  h.R.openHub();
  const html = h.html('modalBody');
  assert.ok(!html.includes("fromHub('payrollRegister')"));
  const g = loadReport({ role: 'others' });
  g.R.pack('monthly');
  assert.ok(g.calls.toasts.some((t) => /No reports in this pack/.test(t)));
});

test('with no role model loaded every report is allowed', () => {
  const h = loadReport({});
  h.R.openHub();
  assert.equal(rowsIn(h.html('modalBody')).length, 18);
  assert.equal(h.R.list().length, 25);
  assert.equal(h.R.canOpen('payrollRegister'), true);
});

test('payroll slip chooser then pick: one PIN step-up for one slip, grant is cleared', () => {
  const pay = { rows: [{ empId: 'E1', name: 'Asha' }, { empId: 'E2', name: 'Retired Ravi', active: false }, { empId: 'E3', name: 'Mina' }] };
  const h = loadReport({ role: 'owner', storage: { payroll_suite_v1_2026: pay } });
  h.R.build = () => new Promise(() => {});
  h.R.preview('payrollSlip', {});
  assert.deepEqual(h.calls.ensure, ['payroll']);
  const list = h.html('modalBody');
  assert.ok(list.includes('Asha') && list.includes('Mina') && !list.includes('Retired Ravi'), 'slip picker skips retired rows');
  h.R._payrollPick('E1');
  assert.deepEqual(h.calls.ensure, ['payroll'], 'no second step-up for the picked slip');
  assert.equal(Object.prototype.hasOwnProperty.call(h.R, '_grantOnce'), false);
  h.R.preview('payrollSlip', { empId: 'E1' });
  assert.equal(h.calls.ensure.length, 2, 'the grant was one-shot');
});
