// tests/fix-s15-role-table.test.mjs  (self-test of the agreed table)
import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSIONS, BROKEN, QMS_EXPECTED, EXPENSE_EXPECTED, qmsRoleFor, expenseAllowedFor, managerWorkspaceFor, ownerOnlyFor } from './lib/fix-s15-role-table.mjs';

test('S15 role table: reference rule reproduces the agreed QMS and Expense tables for every shell session', () => {
  assert.equal(SESSIONS.length, 10);
  for (const s of SESSIONS) {
    assert.equal(qmsRoleFor(s.read), QMS_EXPECTED[s.name], 'QMS ' + s.name);
    assert.deepEqual(expenseAllowedFor(s.read), EXPENSE_EXPECTED[s.name], 'Expense ' + s.name);
  }
});
test('S15 role table: unreadable or untrustworthy sessions get the lowest rights everywhere', () => {
  for (const b of BROKEN) {
    assert.equal(qmsRoleFor(b.read), 'Greeter', b.name);
    assert.deepEqual(expenseAllowedFor(b.read), ['cashier'], b.name);
    assert.equal(managerWorkspaceFor(b.read), false, b.name);
    assert.equal(ownerOnlyFor(b.read), false, b.name);
  }
});
test('S15 role table: manager workspace is Owner or Store Manager only; owner-only is Owner only', () => {
  for (const s of SESSIONS) {
    const own = s.name.startsWith('Owner'), sm = s.name === 'role Store Manager';
    assert.equal(managerWorkspaceFor(s.read), own || sm, s.name);
    assert.equal(ownerOnlyFor(s.read), own, s.name);
  }
});
