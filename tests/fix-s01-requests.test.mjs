// tests/fix-s01-requests.test.mjs
// S01 applied these edits to www/index.html on behalf of other groups (plan correction S01-1):
// S03 R1/R2/R4/R5/R6 (backup and exception map), S06 R1 (stock storage keys), S07 U06-F12 (Esc on the PIN keypad),
// S14 U01-F10 (role raise with no Owner PIN). The S03 cross-group file test runs at integration step I-7.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, between, sandbox, shell } from './lib/fix-s01-extract.mjs';

test('S03 R1 (U02-F05): the portable export skips the PIN hashes and the admin flag', () => {
  const store = {
    st_v2_admin_pin_hash: 'h', st_v2_admin_mode: '1', saagar_staff_pins_v1: '{}', saagar_lang: 'hi', saagar_other: 'x'
  };
  const keys = Object.keys(store);
  const ctx = sandbox({
    localStorage: { length: keys.length, key: i => keys[i], getItem: k => store[k] },
    isWhitelistedAppKey: () => true,
    ADMIN_PIN_KEY: 'st_v2_admin_pin_hash', ADMIN_MODE_KEY: 'st_v2_admin_mode', STAFF_PIN_KEY: 'saagar_staff_pins_v1'
  }, fn('backupStorageStrict'));
  const out = ctx.backupStorageStrict();
  assert.deepEqual(Object.keys(out).sort(), ['saagar_lang', 'saagar_other']);
  assert.ok(shell.includes('restoreBlockedKeys(){ return [ADMIN_PIN_KEY'), 'restore still blocks the same keys');
  assert.ok(!/They stay in\s+EXPORT/.test(shell), 'stale comment fixed');
});

test('S03 R2 (X2-F02): an empty portable payload is refused', () => {
  const f = fn('freshPortableBackupPayload');
  const i = f.indexOf('.then(function(payload){');
  assert.ok(i > 0);
  assert.ok(f.slice(i, i + 260).includes("if(!Object.keys(payload.localStorage||{}).length) throw new Error('No app data to back up yet"));
});

test('S03 R4 (X2-F02): restoring from an empty device backup says so', () => {
  const f = fn('restoreFromDeviceBackup');
  assert.ok(f.includes("err.code==='EMPTY_BACKUP'"));
  assert.ok(f.indexOf("EMPTY_BACKUP") < f.lastIndexOf("toast('Could not read the device backup')"));
  assert.ok(f.includes('encrypted .sccbak portable backup'));
});

test('S03 R5 (X2-F02): the status shows the backup notice; the 36-hour sentence only when there is no refusal', () => {
  const f = fn('renderConfigBackup');
  assert.ok(f.includes("s.failureEscalated&&!s.lastRefusal ?"));
  assert.ok(f.includes("(s.notice ? '<br><b style=\"color:var(--danger,#b3261e)\">'+escapeHtml(s.notice)+'</b>' : '')"));
  assert.ok(!f.includes('acceptSmaller'), 'no accept-smaller button (R5b dropped)');
});

test('S03 R6 (U01-F4, U14-08): the exception areas the bridge emits are mapped', () => {
  const lit = between('const EXC_AREA_TO_MODULE =', ';\n');
  const map = new Function('return ' + lit.replace('const EXC_AREA_TO_MODULE =', ''))();
  for (const [a, m] of [['Grooming', 'grooming'], ['DSR', 'dsr'], ['Payroll', 'payroll'], ['Cash', 'expense'], ['Expense', 'expense'], ['QMS', 'qms'], ['Stock', 'stock'], ['Tax', 'tax'], ['CRO', 'cro_audit'], ['Floor gate', 'grooming']]) {
    assert.equal(map[a], m, a);
  }
});

test('S06 R1: both new Stock keys are in the Stock storage rule', () => {
  const m = /stock:\s*\{ exact: \[([^\]]*)\]/.exec(shell);
  assert.ok(m);
  assert.ok(m[1].includes('"saagar_brands_hidden"'));
  assert.ok(m[1].includes('"saagar_stk_clearlog_v1"'));
  assert.ok(m[1].includes('"saagar_brands"'));
});

test('S07 U06-F12: Esc on the Owner PIN keypad does not also reach the shell Escape handler', () => {
  const calls = [];
  const ctx = sandbox({
    raVisible: () => true, raKey() {}, raSubmit() {}, raCancel: () => calls.push('cancel')
  }, fn('raKeydownHandler'));
  const ev = { key: 'Escape', preventDefault: () => calls.push('prevent'), stopImmediatePropagation: () => calls.push('stop') };
  ctx.raKeydownHandler(ev);
  assert.ok(calls.includes('stop'));
  assert.ok(calls.includes('cancel'));
  const f = fn('raKeydownHandler');
  assert.ok(f.indexOf('stopImmediatePropagation') < f.indexOf('raCancel()'));
  calls.length = 0;
  ctx.raVisible = () => false;
  ctx.raKeydownHandler(ev);
  assert.equal(calls.length, 0, 'no keypad: Esc still goes home');
});

function roleCtx({ pin }) {
  const log = [];
  const ctx = sandbox({
    ACCESS_ROLES: ['Greeter', 'Store Manager'], isAdmin: false, roleSwitchLocked: () => true,
    roleRank: r => (r === 'Store Manager' ? 2 : 1), currentRole: () => 'Greeter', hasAdminPin: () => pin,
    promptVerifyOnly: () => { log.push('prompt'); return false; },
    toast: m => log.push('toast:' + m), safeSet: () => log.push('safeSet'),
    auditLog: (a, d) => log.push('audit:' + a + ':' + (d && d.reason || '')),
    applyMode: () => log.push('applyMode'), renderHome() {}, renderToday() {}, CURRENT_ROLE_KEY: 'r'
  }, fn('setCurrentRole'));
  return { ctx, log };
}

test('S14 U01-F10: with no Owner PIN a raise is denied with a true message and no PIN prompt', () => {
  const t = roleCtx({ pin: false });
  t.ctx.setCurrentRole('Store Manager');
  assert.ok(!t.log.includes('prompt'));
  assert.ok(!t.log.includes('safeSet'));
  assert.ok(t.log.some(l => /^toast:No Owner PIN is set/.test(l)));
  assert.ok(t.log.includes('audit:roles.current.denied:no-pin'));
  const p = roleCtx({ pin: true });
  p.ctx.setCurrentRole('Store Manager');
  assert.ok(p.log.includes('prompt'), 'with a PIN the old path still prompts');
  assert.ok(p.log.some(l => /^toast:Admin PIN required/.test(l)));
});
