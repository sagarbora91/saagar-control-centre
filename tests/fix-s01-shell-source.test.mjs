// tests/fix-s01-shell-source.test.mjs
// S01: Home exceptions (U01-F4), Reports tab role filter (U01-F5), restore wording (U02-F04),
// module switcher (U01-L2), ETP home card (U01-L3), About card (U02-006), integration rules (U02-024),
// restore and reset step-up (U02-035), diagnostics (U02-048), and the byte limit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, between, loadPolicy, sandbox, shell } from './lib/fix-s01-extract.mjs';

const POLICY = loadPolicy();

test('www/index.html stays strictly below 580,636 bytes', () => {
  assert.ok(Buffer.byteLength(shell) < 580636, `size ${Buffer.byteLength(shell)}`);
  assert.ok(!shell.includes('\r'), 'LF only');
  assert.ok(!shell.startsWith('﻿'), 'no BOM');
});

test('U01-F4: the Grooming (and DSR, Payroll) exception areas are mapped to their module', () => {
  const lit = between('const EXC_AREA_TO_MODULE =', ';\n');
  const map = new Function('return ' + lit.replace('const EXC_AREA_TO_MODULE =', ''))();
  assert.equal(map.Grooming, 'grooming');
  assert.equal(map.DSR, 'dsr');
  assert.equal(map.Payroll, 'payroll');
  assert.equal(map['Floor gate'], 'grooming');
  const action = `navigateToModule('${map.Grooming}')`;
  assert.equal(POLICY.actionModuleId(action), 'grooming');
  assert.equal(POLICY.moduleVisible('grooming', false, { grooming: false }), false);
  assert.equal(POLICY.moduleVisible('grooming', false, { grooming: true }), true);
});

test('U01-F4: a stored exceptions blob from another day is not listed; Home re-renders once after the first cycle', () => {
  assert.ok(shell.includes('const exItems = (exc.date===todayIso()?exc.items:[])||[];'));
  assert.ok(/\}, 60000\);\n\s*setTimeout\(\(\)=>\{ if\(!activeModuleId&&activeView==='home'\) renderHome\(\); \},6000\);/.test(shell));
});

function fakeCards(titles) {
  const cards = titles.map(t => {
    const b = { textContent: t, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const sum = { textContent: t + ' small', querySelector: sel => (sel === 'b' ? b : null), querySelectorAll: sel => (sel === 'b' ? [b] : []) };
    return { t, b, removed: false, remove() { this.removed = true; }, setAttribute() {}, querySelector: sel => (sel === 'summary' ? sum : null) };
  });
  return cards;
}

function runDecorate(titles, { admin = false, allowed = [], policy = true, scope = 'daily' } = {}) {
  const cards = fakeCards(titles);
  const host = { querySelectorAll: () => cards };
  const ctx = sandbox({
    document: { getElementById: () => host, createElement: () => ({}) },
    repScope: scope, repDate: '2026-11-12', repMonth: '2026-11',
    isAdmin: admin,
    moduleVisibleForRole: id => allowed.includes(id)
  }, fn('decorateRepCards'));
  if (policy) { ctx.SaagarDashboardPolicy = POLICY; }
  ctx.decorateRepCards();
  return cards;
}

test('U01-F5: a Cashier (Expense only) keeps only Cash sheet and Day snapshot on the Reports tab', () => {
  const titles = ['Business today', 'Day snapshot', 'Queue & conversion', 'Daily staff register', 'Stock register', 'Cash sheet', 'On leave', 'Employee performance'];
  const cards = runDecorate(titles, { allowed: ['expense'] });
  assert.deepEqual(cards.filter(c => !c.removed).map(c => c.t), ['Day snapshot', 'Cash sheet']);
});

test('U01-F5: the Owner sees every card; a missing policy file hides the cards (fail closed)', () => {
  const titles = ['Business today', 'Payroll', 'Tax compliance'];
  assert.equal(runDecorate(titles, { admin: true }).filter(c => !c.removed).length, 3);
  assert.equal(runDecorate(titles, { admin: false, allowed: ['qms', 'payroll', 'tax'], policy: false }).filter(c => !c.removed).length, 0);
});

test('U02-004: card titles are marked for translation', () => {
  const cards = runDecorate(['Cash sheet'], { allowed: ['expense'] });
  assert.equal(cards[0].b.attrs['data-i18n-ui'], '');
});

test('U01-F5: a failure while decorating clears the list instead of showing every card', () => {
  assert.ok(/try\{ decorateRepCards\(\); \}catch\(e\)\{ host\.innerHTML=''; \}\s*\n\s*updateRepCount\(\);/.test(shell));
});

test('U02-F04: the restore preview says newer records for other keys are kept', () => {
  const f = fn('previewRestorePayload');
  assert.ok(f.includes('newer records for keys not in this backup'));
});

test('U01-L2: the module switcher lists only modules the role can open', () => {
  const html = { v: '' };
  const MODULES = ['qms', 'expense', 'payroll', 'etp'].map(id => ({ id, title: id, icon: 'i' }));
  const ctx = sandbox({
    tryJSON: JSON.parse, safeGet: () => '[{"id":"payroll"}]', ACTIVITY_KEY: 'a', MODULES,
    moduleById: id => MODULES.find(m => m.id === id), moduleVisibleForRole: id => id === 'expense',
    getModuleInsight: () => ({ level: '' }), escapeHtml: s => String(s), activeModuleId: null,
    openModal() {}, $: id => (id === 'modalBody' ? html : id === 'modalTitle' ? { textContent: '' } : null)
  }, fn('openModuleSwitcher'));
  Object.defineProperty(html, 'innerHTML', { set(v) { html.v = v; }, get() { return html.v; } });
  ctx.openModuleSwitcher();
  assert.match(html.v, /switcherGo\('expense'\)/);
  assert.doesNotMatch(html.v, /switcherGo\('(payroll|qms|etp)'\)/);
});

test('U01-L3: the ETP home card is emptied and hidden for a role without ETP access', () => {
  const host = { innerHTML: 'x', style: {} };
  let loaded = 0;
  const mk = vis => sandbox({
    $: () => host, window: undefined, __etpHomeAnalyticsSeq: 0,
    moduleVisibleForRole: () => vis,
    currentStoreSelection: () => ({ isAll: true }), viewDate: () => '2026-11-12', navigateToModule() {}
  }, fn('renderEtpAnalyticsHome'));
  const hidden = mk(false);
  hidden.SaagarEtpAnalyticsConsumer = { load: async () => { loaded++; return {}; }, render() {} };
  hidden.window = hidden;
  return hidden.renderEtpAnalyticsHome().then(() => {
    assert.equal(loaded, 0);
    assert.equal(host.innerHTML, '');
    assert.equal(host.style.display, 'none');
    const shown = mk(true);
    shown.SaagarEtpAnalyticsConsumer = { load: async () => { loaded++; return {}; }, render() {} };
    shown.window = shown;
    return shown.renderEtpAnalyticsHome().then(() => {
      assert.equal(loaded, 1);
      assert.equal(host.style.display, '');
    });
  });
});

test('U02-006: the stale V5.5 About card is gone and the change log title has no version', () => {
  assert.ok(!shell.includes("What's new in V5.5"));
  assert.ok(!shell.includes('(V5.5)'));
  assert.ok(shell.includes('Detailed change log</summary>'));
  assert.ok(shell.includes('id="changelogCard"'));
});

test('U02-024: integration rules keep 0, default on blank, and keep the other stored keys', () => {
  let stored = JSON.stringify({ dsrClosingTime: '21:30', failPct: 10 });
  const vals = { cfgFailPct: '0', cfgVoucher: '', cfgLeaveGates: '1' };
  const ctx = sandbox({
    $: id => ({ value: vals[id] }), tryJSON: JSON.parse, safeGet: () => stored, safeSet: (k, v) => { stored = v; },
    auditLog() {}, toast() {}, renderSync() {}
  }, fn('saveBridgeConfig'));
  ctx.saveBridgeConfig();
  const out = JSON.parse(stored);
  assert.equal(out.failPct, 0);
  assert.equal(out.voucherThreshold, 2000);
  assert.equal(out.dsrClosingTime, '21:30');
  assert.equal(out.leaveGates, true);
  vals.cfgFailPct = ''; vals.cfgVoucher = '0';
  ctx.saveBridgeConfig();
  const out2 = JSON.parse(stored);
  assert.equal(out2.failPct, 60);
  assert.equal(out2.voucherThreshold, 0);
});

test('U02-035: restore and factory reset ask for a fresh Owner PIN before any write', async () => {
  const calls = [];
  const bundle = { review: { valid: { a: '1' } } };
  const mk = ok => sandbox({
    isAdmin: true, unlockAdmin() {}, SaagarReauth: async r => { calls.push('reauth:' + r); return ok; },
    closeModal() { calls.push('closeModal'); }, toast() {},
    __stRestoreBundle: bundle, SaagarRestoreEngine: { run: async () => { calls.push('run'); } },
    SaagarStore: undefined, confirm: () => true, prompt: () => 'RESET', alert() {},
    localStorage: { length: 1, key: () => 'saagar_x' }, safeGet: () => '1', RESTORE_DRILL_KEY: 'd', auditLog() {},
    factoryResetSafetyBackup: () => { calls.push('safety'); return new Promise(() => {}); }
  }, fn('restoreValidatedBackup'), fn('factoryReset'));
  const denied = mk(false);
  await denied.restoreValidatedBackup();
  await denied.factoryReset();
  assert.deepEqual(calls, ['reauth:Restore from backup', 'reauth:Factory reset']);
  calls.length = 0;
  const granted = mk(true);
  granted.factoryReset();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(calls, ['reauth:Factory reset', 'safety']);
  const rv = fn('restoreValidatedBackup');
  assert.ok(rv.indexOf("SaagarReauth('Restore from backup')") < rv.indexOf('closeModal()'));
});

test('U02-048: Diagnostics do not count ETP as a missing storage rule or validator', () => {
  const line = e => new RegExp(String.raw`add\('${e}', ([^\n]*?),\s*[\`']`).exec(shell);
  const a = line('Storage rules coverage'), b = line('Module validators');
  assert.ok(a && b);
  const MODULES = [{ id: 'qms' }, { id: 'etp' }];
  const run = (expr, STORAGE_RULES, MODULE_VALIDATORS) => new Function('MODULES', 'STORAGE_RULES', 'MODULE_VALIDATORS', 'return ' + expr)(MODULES, STORAGE_RULES, MODULE_VALIDATORS);
  assert.equal(run(a[1], { qms: {} }, {}), true);
  assert.equal(run(a[1], { etp: {} }, {}), false);
  assert.equal(run(b[1], {}, { qms: 1 }), true);
  assert.equal(run(b[1], {}, {}), false);
  assert.ok(shell.includes('(ETP uses its own encrypted store)'));
});
