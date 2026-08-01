import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const policy = require('../www/reauth-policy.js');
const shell = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

test('D1 reauthentication explains purpose, one-use expiry, and safe cancellation', () => {
  const value = policy.promptText('Export the payroll register', 1);
  assert.match(value, /Purpose: Export the payroll register/);
  assert.match(value, /this action only and expires immediately/);
  assert.match(value, /Cancel keeps your data unchanged/);
});

test('D1 reauthentication limits a single action to one retry', () => {
  assert.equal(policy.MAX_ATTEMPTS, 2);
  assert.equal(policy.canRetry('incorrect', 1), true);
  assert.equal(policy.canRetry('incorrect', 2), false);
  assert.equal(policy.canRetry('cancelled', 1), false);
  assert.equal(policy.canRetry('locked', 1), false);
});

test('D1 reauthentication produces distinct cancellation, denial, and lockout guidance', () => {
  assert.match(policy.outcomeText('cancelled'), /cancelled.*No changes/i);
  assert.match(policy.outcomeText('incorrect-final'), /two incorrect PIN attempts.*No changes/i);
  assert.match(policy.outcomeText('locked', 19.2), /20s/);
});

test('shell integrates detailed outcomes without changing the boolean compatibility wrapper', () => {
  assert.match(shell, /<script src="reauth-policy\.js"><\/script>/);
  assert.match(shell, /function promptVerifyOnlyResult\(msg\)/);
  assert.match(shell, /function promptVerifyOnly\(msg\)/);
  assert.match(shell, /outcome:status,attempts:attempt/);
  assert.match(shell, /window\.SaagarReauth = SaagarReauth/);
});
