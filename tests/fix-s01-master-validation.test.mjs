// tests/fix-s01-master-validation.test.mjs
// S01: staff master (U01-F3, U02-F06), organisation (U02-F07), vendor / customer / brand masters (U02-F08, U02-014).
// Runs the real functions cut out of www/index.html against stubs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, loadPolicy, sandbox, shell } from './lib/fix-s01-extract.mjs';

const POLICY = loadPolicy();

function staffCtx(extra = {}) {
  let stored = [];
  const toasts = [];
  const globals = Object.assign({
    SaagarDashboardPolicy: POLICY,
    firmCode: v => String(v || '').trim().toUpperCase(),
    ownerName: () => '',
    auditLog: () => {},
    renderConfigEmployees: () => {},
    toasts,
    toast: m => toasts.push(String(m)),
    getEmployeeMaster: () => stored.map(x => Object.assign({}, x)),
    saveEmployeeMaster: l => { stored = l.map(x => Object.assign({}, x)); },
    document: { querySelector: () => null }
  }, extra);
  const ctx = sandbox(globals,
    fn('normText'), fn('normLower'), fn('uidEmp'), fn('normalizeEmployee'), fn('nextEmployeeId'),
    fn('findEmployeeIndex'), fn('combineEmployee'), fn('addEmployeeMasterFromForm'), fn('saveEmpRow'));
  ctx.__get = () => stored;
  ctx.__set = l => { stored = l; };
  return ctx;
}

function formDom(ctx, values) {
  const els = {};
  const el = id => (els[id] = els[id] || { value: values[id] ?? '', selectedIndex: 0, textContent: '' });
  ctx.$ = el;
  return els;
}

test('U01-F3: an id-less staff row gets the same id on every read; a stored id is kept', () => {
  const ctx = staffCtx();
  const row = { name: 'Asha Patil', employeeId: 'EMP007', firm: 'sat' };
  const a = ctx.normalizeEmployee(row).id, b = ctx.normalizeEmployee(row).id;
  assert.equal(a, b);
  assert.match(a, /^emp_/);
  assert.notEqual(ctx.normalizeEmployee({ name: 'Asha Patil', employeeId: 'EMP008' }).id, a);
  assert.equal(ctx.normalizeEmployee({ id: 'x', name: 'Q', employeeId: 'E1' }).id, 'x');
  // no code: derived from name plus firm
  const n1 = ctx.normalizeEmployee({ name: 'No Code', firm: 'SAT' }).id;
  assert.equal(n1, ctx.normalizeEmployee({ name: 'No Code', firm: 'SAT' }).id);
  assert.notEqual(n1, ctx.normalizeEmployee({ name: 'No Code', firm: 'HEM' }).id);
});

test('U01-F3: without the policy file the old random id still works (nothing throws)', () => {
  const ctx = staffCtx({ SaagarDashboardPolicy: undefined });
  ctx.window.SaagarDashboardPolicy = undefined;
  const id = ctx.normalizeEmployee({ name: 'A', employeeId: 'E1' }).id;
  assert.match(id, /^emp_/);
});

test('U02-F06: a negative salary is refused on Add; nothing is saved', () => {
  const ctx = staffCtx();
  formDom(ctx, { emName: 'Neg Tester', emSalary: '-500' });
  ctx.addEmployeeMasterFromForm();
  assert.equal(ctx.__get().length, 0);
  assert.ok(ctx.toasts.some(t => /negative/i.test(t)));
});

test('U02-F06: re-adding an existing name keeps the code and the spelling; one row only', () => {
  const ctx = staffCtx();
  formDom(ctx, { emName: 'Zed Tester One', emSalary: '12000' });
  ctx.addEmployeeMasterFromForm();
  assert.equal(ctx.__get().length, 1);
  const first = ctx.__get()[0];
  assert.equal(first.employeeId, 'EMP001');
  formDom(ctx, { emName: 'zed tester one', emSalary: '99999' });
  ctx.addEmployeeMasterFromForm();
  assert.equal(ctx.__get().length, 1);
  assert.equal(ctx.__get()[0].name, 'Zed Tester One');
  assert.equal(ctx.__get()[0].employeeId, 'EMP001');
  assert.equal(ctx.__get()[0].monthlySalary, 12000);
  assert.ok(ctx.toasts.some(t => /already in the master \(EMP001\)/.test(t)), ctx.toasts.join('|'));
});

test('U02-F06: edit mode on an existing row still updates it', () => {
  const ctx = staffCtx();
  formDom(ctx, { emName: 'Edit Me', emSalary: '10000' });
  ctx.addEmployeeMasterFromForm();
  const code = ctx.__get()[0].employeeId;
  formDom(ctx, { emName: 'Edit Me', emSalary: '15000', emEditId: code });
  ctx.addEmployeeMasterFromForm();
  assert.equal(ctx.__get().length, 1);
  assert.equal(ctx.__get()[0].monthlySalary, 15000);
});

test('U02-F06: the inline row Save refuses a negative salary', () => {
  const ctx = staffCtx();
  ctx.__set([ctx.normalizeEmployee({ name: 'Row One', employeeId: 'EMP001', monthlySalary: 100 })]);
  const inp = { dataset: { empField: 'monthlySalary' }, type: 'number', value: '-1' };
  ctx.document = { querySelector: () => ({ querySelectorAll: () => [inp] }) };
  const before = JSON.stringify(ctx.__get());
  ctx.saveEmpRow(0);
  assert.equal(JSON.stringify(ctx.__get()), before);
  assert.ok(ctx.toasts.some(t => /negative/i.test(t)));
  inp.value = '250';
  ctx.saveEmpRow(0);
  assert.equal(ctx.__get()[0].monthlySalary, 250);
});

function orgCtx(draft) {
  const writes = [], status = [], published = [];
  const ctx = sandbox({
    SaagarDashboardPolicy: POLICY,
    orgDraft: () => JSON.parse(JSON.stringify(draft)),
    storeKeyForCode: c => 'k_' + c,
    ORG_MASTER_KEY: 'org_key',
    safeSet: (k, v) => { writes.push([k, v]); },
    auditLog: () => {},
    orgStatus: (m, k) => status.push([m, k]),
    SaagarBridge: { publishOrg: () => { published.push(1); return { ok: 1 }; } }
  }, fn('saveOrganisation'), fn('publishOrganisation'));
  return { ctx, writes, status, published };
}

test('U02-F07: a bad organisation is not saved and not published; a good one is', () => {
  const bad = { firms: [{ code: 'SAT', name: 'Saagar' }, { code: '', name: '' }], branches: [{ code: 'WLMHW', name: 'TW' }, { code: '', name: '' }] };
  const t = orgCtx(bad);
  assert.equal(t.ctx.saveOrganisation(), false);
  assert.equal(t.writes.length, 0);
  assert.match(t.status[0][0], /^Not saved - /);
  assert.equal(t.status[0][1], 'warn');
  t.ctx.publishOrganisation();
  assert.equal(t.writes.length, 0);
  assert.equal(t.published.length, 0);
  const good = orgCtx({ firms: [{ code: 'SAT', name: 'Saagar', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5' }], branches: [{ code: 'WLMHW', name: 'TW' }] });
  assert.equal(good.ctx.saveOrganisation(), true);
  assert.equal(good.writes.length, 1);
  good.ctx.publishOrganisation();
  assert.equal(good.published.length, 1);
});

function mastersCtx(values) {
  const masters = { brands: [], vendors: [], customers: [] };
  const toasts = [];
  const els = {};
  const $ = id => (els[id] = els[id] || { value: values[id] ?? '' });
  const ctx = sandbox({
    $, toasts, toast: m => toasts.push(String(m)),
    SaagarDashboardPolicy: POLICY,
    SaagarMasters: { get: n => masters[n], add: (n, o) => masters[n].push(o) },
    auditLog: () => {}, renderMasters: () => {}
  }, fn('masterAdd'));
  return { ctx, masters, toasts, els };
}

test('U02-F08: an invalid vendor GSTIN adds nothing and leaves the typed text in the box', () => {
  const t = mastersCtx({ 'mv-name': 'Vend One', 'mv-gstin': 'NOTAGSTIN' });
  t.ctx.masterAdd('vendors');
  assert.equal(t.masters.vendors.length, 0);
  assert.equal(t.els['mv-gstin'].value, 'NOTAGSTIN');
  assert.equal(t.els['mv-name'].value, 'Vend One');
  assert.ok(t.toasts.some(m => /GSTIN/.test(m)));
});

test('U02-F08: a valid GSTIN is stored upper case and the boxes are cleared; blank is allowed', () => {
  const t = mastersCtx({ 'mv-name': 'Vend Two', 'mv-gstin': '27abcde1234f1z5' });
  t.ctx.masterAdd('vendors');
  assert.equal(t.masters.vendors[0].gstin, '27ABCDE1234F1Z5');
  assert.equal(t.els['mv-gstin'].value, '');
  assert.equal(t.els['mv-name'].value, '');
  const b = mastersCtx({ 'mv-name': 'Vend Three', 'mv-gstin': '' });
  b.ctx.masterAdd('vendors');
  assert.equal(b.masters.vendors.length, 1);
});

test('U02-014: customer mobile "12" is refused; +91 form is stored as 10 digits', () => {
  const bad = mastersCtx({ 'mc-name': 'Cust A', 'mc-mobile': '12' });
  bad.ctx.masterAdd('customers');
  assert.equal(bad.masters.customers.length, 0);
  assert.equal(bad.els['mc-mobile'].value, '12');
  const ok = mastersCtx({ 'mc-name': 'Cust B', 'mc-mobile': '+91 98765 43210' });
  ok.ctx.masterAdd('customers');
  assert.equal(ok.masters.customers[0].mobile, '9876543210');
  const blank = mastersCtx({ 'mc-name': 'Cust C', 'mc-mobile': '' });
  blank.ctx.masterAdd('customers');
  assert.equal(blank.masters.customers[0].mobile, '');
});

test('U02-F08: a duplicate name keeps the input so it can be corrected', () => {
  const t = mastersCtx({ 'mv-name': 'Same', 'mv-gstin': '' });
  t.masters.vendors.push({ name: 'same', gstin: '' });
  t.ctx.masterAdd('vendors');
  assert.equal(t.masters.vendors.length, 1);
  assert.equal(t.els['mv-name'].value, 'Same');
  assert.ok(t.toasts.includes('Already in the master'));
});

test('U05-F-08 (S06 R4): a brand name over 40 characters is refused in the shell Brand Master', () => {
  const long = 'B'.repeat(41);
  const t = mastersCtx({ 'mb-name': long, 'mb-store': 'x' });
  t.ctx.masterAdd('brands');
  assert.equal(t.masters.brands.length, 0);
  assert.ok(t.toasts.some(m => /too long/i.test(m)));
  const ok = mastersCtx({ 'mb-name': 'B'.repeat(40), 'mb-store': 'x' });
  ok.ctx.masterAdd('brands');
  assert.equal(ok.masters.brands.length, 1);
});

test('the shell still names the policy file as a static script', () => {
  assert.ok(shell.includes('<script src="dashboard-policy.js"></script>'));
});
