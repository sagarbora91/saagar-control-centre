import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPayroll, loadState, row, SHELL_INDEX } from './lib/fix-s10-payroll-harness.mjs';

const KEY = 'payroll_suite_v1_2026';
const lockedRun = { status: 'locked', approvedBy: 'Owner', snapshot: { gm001: { finalPay: 15000 } }, advRecovered: {} };
const adv = n => ({ id: n, voucherNo: 'GM/ADV/2026/00' + n, empId: 'GM001', empName: 'Asha', amount: 1000, emi: 0, deductMonth: 'December', deductYear: 2026 });
function withData(opts) {
  const p = createPayroll(opts);
  loadState(p, { rows: [row(), row({ id: 2, empId: 'GM002', name: 'Ravi' })], advances: [adv(1), adv(2)], runs: { 'September-2026': lockedRun, 'October-2026': lockedRun } });
  p.run('saveState(false)');
  return p;
}
const rollbackKeys = p => [...p.ls._map.keys()].filter(k => k.startsWith('st_v4_restore_rollback_module_reset_payroll_'));

test('F-01 Reset All asks for the Owner PIN and leaves everything alone when it is refused', async () => {
  const p = withData({ reauth: false });
  await p.run('resetAll()');
  assert.equal(p.log.reauth.length, 1, 'the Owner PIN step must be asked');
  assert.match(p.log.reauth[0], /2 locked pay-run/);
  assert.equal(p.run('state.rows.length'), 2);
  assert.equal(p.run('Object.keys(state.runs).length'), 2);
  assert.equal(p.run('state.advances.length'), 2);
  assert.ok(JSON.parse(p.ls.getItem(KEY)).rows.length === 2, 'stored data untouched');
  assert.equal(rollbackKeys(p).length, 0, 'no copy needed when nothing was reset');
});

test('F-01 locked pay-runs need a second explicit confirmation before the PIN is even asked', async () => {
  const p = withData({ reauth: true, confirms: (m, n) => n === 1 });
  await p.run('resetAll()');
  assert.equal(p.log.confirms.length, 2);
  assert.match(p.log.confirms[1], /LOCKED/);
  assert.equal(p.log.reauth.length, 0);
  assert.equal(p.run('state.rows.length'), 2);
});

test('F-01 an accepted reset saves a recovery copy the shell Undo button can restore', async () => {
  const p = withData({ reauth: true });
  const before = p.ls.getItem(KEY);
  await p.run('resetAll()');
  assert.equal(p.run('state.rows.length'), 0);
  assert.equal(p.run('Object.keys(state.runs).length'), 0);
  const ptr = JSON.parse(p.ls.getItem('st_v2_last_module_reset_v1'));
  assert.equal(ptr.module, 'payroll'); assert.equal(ptr.undone, false);
  const snap = JSON.parse(p.ls.getItem(ptr.rollbackKey));
  assert.equal(snap.module, 'payroll');
  assert.equal(typeof snap.keys[KEY], 'string');
  const restored = JSON.parse(snap.keys[KEY]);
  assert.equal(restored.rows.length, 2); assert.equal(Object.keys(restored.runs).length, 2); assert.equal(restored.advances.length, 2);
  assert.equal(JSON.parse(before).rows.length, restored.rows.length);
  // what the shell's undoLastModuleReset() does: write the raw string back
  p.ls.setItem(KEY, snap.keys[KEY]);
  p.run('loadState()');
  assert.equal(p.run('Object.keys(state.runs).length'), 2);
});

test('F-01 if the recovery copy cannot be saved nothing is deleted', async () => {
  const p = withData({ reauth: true });
  p.ls.failWrite = k => k.startsWith('st_v4_restore_rollback_');
  await p.run('resetAll()');
  assert.equal(p.run('state.rows.length'), 2);
  assert.match(p.toastText(), /nothing was deleted/);
  assert.equal(JSON.parse(p.ls.getItem(KEY)).rows.length, 2);
});

test('F-01 the past-date read-only view cannot reset', async () => {
  const p = withData({ reauth: true, readOnly: true });
  await p.run('resetAll()');
  assert.equal(p.log.confirms.length, 0);
  assert.equal(p.run('state.rows.length'), 2);
});

test('F-01 only the two newest payroll recovery copies are kept', async () => {
  const p = withData({ reauth: true });
  for (let i = 0; i < 3; i++) {
    loadState(p, { rows: [row()] });
    p.run('payrollRecoverySnapshot("Payroll")');
    await new Promise(r => setTimeout(r, 5));
  }
  assert.equal(rollbackKeys(p).length, 2);
});

test('F-01 recovery keys match the ones the shell uses', () => {
  const shell = fs.readFileSync(SHELL_INDEX, 'utf8');
  assert.match(shell, /const RESTORE_ROLLBACK_PREFIX = "st_v4_restore_rollback_"/);
  assert.match(shell, /const LAST_MODULE_RESET_KEY = "st_v2_last_module_reset_v1"/);
  const p = createPayroll();
  assert.equal(p.run('ST_ROLLBACK_PREFIX'), 'st_v4_restore_rollback_');
  assert.equal(p.run('ST_LAST_RESET_KEY'), 'st_v2_last_module_reset_v1');
});
