import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExportControl } from './lib/export-control-harness.mjs';

const POLICY = 'st_v2_export_policy_v1';
const enabledPolicy = JSON.stringify({ enabled: true, updatedAt: '2026-07-24T00:00:00.000Z', updatedBy: 'Owner' });

function request(overrides = {}) {
  return {
    exportId: 'expense-ledger-csv',
    kind: 'csv',
    scopeId: 'expense-ledger',
    scopeLabel: 'Expense ledger for Test Customer 9876543210',
    module: 'expense',
    rowCount: 42,
    fileName: 'Test Customer 9876543210 ledger.csv',
    purposeId: 'accounting',
    ...overrides
  };
}

test('SEC-08 defaults to disabled and records the denied attempt without prompting', () => {
  const h = loadExportControl();
  assert.equal(h.api.authorize(request()), false);
  assert.equal(h.reauthCalls(), 0);
  assert.equal(h.api.policy().enabled, false);
  assert.equal(h.readRegister().length, 1);
  assert.equal(h.readRegister()[0].status, 'denied');
  assert.equal(h.readRegister()[0].reason, 'policy-disabled');
});

test('SEC-08 blocks enabled exports when the Admin PIN is absent', () => {
  const h = loadExportControl({ seed: { [POLICY]: enabledPolicy }, hasPin: false });
  assert.equal(h.api.authorize(request()), false);
  assert.equal(h.reauthCalls(), 0);
  assert.equal(h.readRegister()[0].reason, 'admin-pin-required');
});

test('SEC-08 records cancelled owner approval and releases no token', () => {
  const h = loadExportControl({ seed: { [POLICY]: enabledPolicy }, reauth: false });
  assert.equal(h.api.authorize(request()), false);
  assert.equal(h.reauthCalls(), 1);
  assert.equal(h.readRegister()[0].reason, 'owner-approval-denied');
});

test('SEC-08 blocks export when the register cannot be saved', () => {
  const values = new Map([[POLICY, enabledPolicy]]);
  const h = loadExportControl({
    safeGet: key => values.has(key) ? values.get(key) : null,
    safeSet: () => false
  });
  assert.equal(h.api.authorize(request()), false);
  assert.match(h.notices.join('\n'), /register could not be saved/i);
});

test('SEC-08 stores bounded metadata only and finalizes an approval once', () => {
  const h = loadExportControl({ seed: { [POLICY]: enabledPolicy } });
  const token = h.api.authorize(request());
  assert.match(token, /^exp_/);
  let row = h.readRegister()[0];
  assert.equal(row.status, 'approved');
  assert.equal(row.actionId, 'expense-ledger-csv');
  assert.equal(row.scopeId, 'expense-ledger');
  assert.equal(row.rowCount, 42);
  assert.equal(row.fileType, 'csv');
  assert.equal(row.approver, 'Test Owner');

  const serialized = JSON.stringify(row);
  assert.doesNotMatch(serialized, /Test Customer/i);
  assert.doesNotMatch(serialized, /9876543210/);
  assert.doesNotMatch(serialized, /ledger\.csv/i);

  assert.equal(h.api.beginDelivery(token), true);
  assert.equal(h.api.beginDelivery(token), false);
  assert.equal(h.readRegister()[0].status, 'delivering');
  assert.equal(h.api.recordOutcome(token, 'shared'), true);
  row = h.readRegister()[0];
  assert.equal(row.status, 'shared');
  assert.ok(row.completedAt);
  assert.equal(h.api.recordOutcome(token, 'failed'), false);
  assert.equal(h.readRegister()[0].status, 'shared');
});

test('SEC-08 treats damaged policy and register data as fail-closed', () => {
  const damagedPolicy = loadExportControl({ seed: { [POLICY]: '{bad' } });
  assert.equal(damagedPolicy.api.authorize(request()), false);
  assert.match(damagedPolicy.notices.join('\n'), /damaged/i);

  const damagedRegister = loadExportControl({
    seed: {
      [POLICY]: enabledPolicy,
      st_v2_export_register_v1: '{bad'
    }
  });
  assert.equal(damagedRegister.api.authorize(request()), false);
  assert.match(damagedRegister.notices.join('\n'), /register could not be saved/i);
});

test('SEC-08 policy changes require a PIN and fresh owner approval', () => {
  const noPin = loadExportControl({ hasPin: false });
  assert.equal(noPin.api.setEnabled(true), false);
  assert.equal(noPin.readPolicy(), null);

  const cancelled = loadExportControl({ reauth: false });
  assert.equal(cancelled.api.setEnabled(true), false);
  assert.equal(cancelled.readPolicy(), null);

  const approved = loadExportControl();
  assert.equal(approved.api.setEnabled(true), true);
  assert.equal(approved.readPolicy().enabled, true);
  assert.equal(approved.api.setEnabled(false), true);
  assert.equal(approved.readPolicy().enabled, false);
});

test('SEC-12 unsafe production-device posture blocks export before owner prompting', () => {
  const h = loadExportControl({ seed: { [POLICY]: enabledPolicy }, deviceSecurity: false });
  assert.equal(h.api.authorize(request()), false);
  assert.equal(h.reauthCalls(), 0);
  assert.equal(h.readRegister()[0].reason, 'device-posture-unsafe');
});
