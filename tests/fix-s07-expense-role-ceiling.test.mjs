// S07 U06-F01: the Expense module role can never exceed the role signed in to the app shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExpense, moduleText } from './lib/fix-s07-expense-harness.mjs';
import { SESSIONS, BROKEN, EXPENSE_EXPECTED, expenseAllowedFor } from './lib/fix-s15-role-table.mjs';

// Audit S07: interface A says every module is held to the one S15 table.
test('F01 role ceiling follows the agreed S15 table for every shell session and every broken session', () => {
  for (const s of SESSIONS) {
    const x = loadExpense({ shell: { isOwner: false } });
    x.context.parent.SaagarOwnerSession.read = () => s.read;
    assert.deepEqual([...x.run('allowedRoles()')], EXPENSE_EXPECTED[s.name], s.name);
  }
  for (const b of BROKEN) {
    const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: false } });
    if (b.read === undefined) delete x.context.parent.SaagarOwnerSession;
    else x.context.parent.SaagarOwnerSession.read = () => { if (b.read === 'THROW') throw new Error('boom'); return b.read; };
    assert.deepEqual([...x.run('allowedRoles()')], expenseAllowedFor(b.read === 'THROW' ? null : b.read), b.name);
    assert.equal(x.run('role()'), 'cashier', b.name);
  }
});

// Audit S07: pattern P re-reads the session after the PIN wait; a session lost during the wait writes nothing.
test('F01 a session lost during the PIN wait blocks reopen and month lock', async () => {
  const shell = { isOwner: true, isManager: true, role: 'Store Manager' };
  const drop = () => { shell.isOwner = false; shell.isManager = false; shell.role = 'Cashier'; return true; };
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell, reauth: drop });
  stubRender(x);
  const today = x.today();
  x.closeDay(today);
  x.run('reopenDay()');
  await x.run("document.getElementById('mok').onclick()");
  assert.equal(x.json('tanishq_statements')[today].closed, true, 'day stays closed');

  shell.isOwner = true; shell.isManager = true; shell.role = 'Store Manager';
  x.storage.setItem('tanishq_statements', JSON.stringify({ [today]: { date: today, closed: false, byStore: { s1: { closed: true } } } }));
  x.run("reopenStoreDay('s1')");
  await x.run("document.getElementById('mok').onclick()");
  assert.equal(x.json('tanishq_statements')[today].byStore.s1.closed, true, 'drawer stays closed');

  shell.isOwner = true; shell.isManager = true; shell.role = 'Store Manager';
  x.run('CM=ym(todayStr())');
  await x.run('genTaxFeed()');
  assert.equal(x.storage.getItem('gm_tax_feed'), null, 'no feed');
  assert.equal(x.reauthCalls.length, 3);
});

const stubRender = (x) => x.run('render=function(){}; renderStmt=function(){}; renderClose=function(){}; toast=function(m){ globalThis.__lastToast=m; };');

test('F01 shell without Owner or manager rights: stored owner behaves as cashier', () => {
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: false, isManager: false, role: 'Cashier' } });
  assert.equal(x.run('role()'), 'cashier');
  for (const act of ['reopen', 'monthlock', 'monthoverride', 'approve', 'recurring']) assert.equal(x.run(`can('${act}')`), false, act);
  assert.equal(x.run("can('void')"), true);
  assert.equal(x.run("can('close')"), true);
});

test('F01 setRole refuses a role above the ceiling and never rewrites the stored value', () => {
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: false, isManager: false, role: 'CRO' } });
  stubRender(x);
  x.run("setRole('owner')");
  assert.equal(x.storage.getItem('gm_role'), 'owner', 'stored value untouched');
  assert.equal(x.run('role()'), 'cashier');
  assert.match(String(x.context.__lastToast), /not available/);
  x.run("setRole('accounts')");
  assert.equal(x.run('role()'), 'cashier');
  assert.equal(x.storage.getItem('gm_role'), 'owner');
});

test('F01 Store Manager may use cashier and accounts, never owner', () => {
  const x = loadExpense({ storage: { gm_role: 'cashier' }, shell: { isOwner: false, isManager: true, role: 'Store Manager' } });
  stubRender(x);
  x.run("setRole('accounts')");
  assert.equal(x.run('role()'), 'accounts');
  assert.equal(x.run("can('approve')"), true);
  assert.equal(x.run("can('reopen')"), false);
  assert.equal(x.run("can('monthlock')"), false);
  x.run("setRole('owner')");
  assert.equal(x.storage.getItem('gm_role'), 'accounts');
  assert.equal(x.run('role()'), 'accounts');
});

test('F01 Owner session may select owner', () => {
  const x = loadExpense({ shell: { isOwner: true, isManager: true, role: 'Store Manager' } });
  stubRender(x);
  x.run("setRole('owner')");
  assert.equal(x.run('role()'), 'owner');
  assert.equal(x.run("can('reopen')"), true);
  assert.equal(x.run("can('monthlock')"), true);
});

test('F01 downgrade in the middle of a session takes effect at once', () => {
  const shell = { isOwner: true, isManager: true, role: 'Store Manager' };
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell });
  assert.equal(x.run('role()'), 'owner');
  shell.isOwner = false; shell.isManager = false; shell.role = 'Cashier';
  assert.equal(x.run('role()'), 'cashier');
  assert.equal(x.run("can('reopen')"), false);
});

test('F01 no shell, or a shell that throws, fails closed', () => {
  const none = loadExpense({ storage: { gm_role: 'owner' } });
  assert.equal(none.run('role()'), 'cashier');
  const broken = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: true, isManager: true } });
  broken.context.parent.SaagarOwnerSession.read = () => { throw new Error('boom'); };
  assert.equal(broken.run('role()'), 'cashier');
});

test('F01 audit rows record the clamped role', () => {
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: false, isManager: false, role: 'Cashier' } });
  x.run("audit('x','y')");
  const rows = x.json('gm_audit', []);
  const mine = rows.filter((r) => r.action === 'x');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].by, 'cashier');
});

test('F01 render marks dropdown options above the ceiling as disabled', () => {
  const options = ['cashier', 'accounts', 'owner'].map((value) => ({ value, disabled: false }));
  const x = loadExpense({ storage: { gm_role: 'owner' }, elements: { roleSel: { value: '', options } }, shell: { isOwner: false, isManager: true, role: 'Store Manager' } });
  x.run("renderDash=function(){}; renderSync=function(){}; renderUdhaar=function(){}");
  x.run('render()');
  assert.deepEqual(options.map((o) => o.disabled), [false, false, true]);
});

test('F01 reopen day asks for the Owner PIN and stays closed when refused', async () => {
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: true, isManager: true, role: 'Store Manager' }, reauth: false });
  stubRender(x);
  const today = x.today();
  x.closeDay(today);
  x.run('reopenDay()');
  assert.match(x.modalHtml(), /Reopen locked day/);
  await x.run("document.getElementById('mok').onclick()");
  assert.equal(x.reauthCalls.length, 1);
  assert.equal(x.json('tanishq_statements')[today].closed, true, 'still closed after a refused PIN');
});

test('F01 reopen day works after a correct PIN', async () => {
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: true, isManager: true, role: 'Store Manager' }, reauth: true });
  stubRender(x);
  const today = x.today();
  x.closeDay(today);
  x.run('reopenDay()');
  await x.run("document.getElementById('mok').onclick()");
  assert.equal(x.reauthCalls.length, 1);
  assert.equal(x.json('tanishq_statements')[today].closed, false);
});

test('F01 reopen store drawer asks for the Owner PIN', async () => {
  const x = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: true, isManager: true, role: 'Store Manager' }, reauth: false });
  stubRender(x);
  const today = x.today();
  x.storage.setItem('tanishq_statements', JSON.stringify({ [today]: { date: today, closed: false, byStore: { s1: { closed: true } } } }));
  x.run("stSub=function(st,store){ st.byStore=st.byStore||{}; st.byStore[store]=st.byStore[store]||{}; return st.byStore[store]; }");
  x.run("reopenStoreDay('s1')");
  await x.run("document.getElementById('mok').onclick()");
  assert.equal(x.reauthCalls.length, 1);
  assert.equal(x.json('tanishq_statements')[today].byStore.s1.closed, true);
});

test('F01 generate and lock tax feed asks for the Owner PIN', async () => {
  const refused = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: true, isManager: true, role: 'Store Manager' }, reauth: false });
  stubRender(refused);
  refused.run('CM=ym(todayStr())');
  await refused.run('genTaxFeed()');
  assert.equal(refused.reauthCalls.length, 1);
  assert.equal(refused.storage.getItem('gm_tax_feed'), null, 'no feed after a refused PIN');

  const allowed = loadExpense({ storage: { gm_role: 'owner' }, shell: { isOwner: true, isManager: true, role: 'Store Manager' }, reauth: true });
  stubRender(allowed);
  allowed.run('CM=ym(todayStr())');
  await allowed.run('genTaxFeed()');
  const feed = allowed.json('gm_tax_feed');
  assert.equal(Object.values(feed)[0].by, 'owner');
});

test('F01 source keeps the attribute and key names other tests rely on', () => {
  const t = moduleText();
  assert.ok(t.includes('onclick="genTaxFeed()"'));
  assert.ok(t.includes('<select data-action="select-role" id="roleSel" onchange="setRole(this.value)">'));
  assert.ok(t.includes("role:'gm_role'"));
});
