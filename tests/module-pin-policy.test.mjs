import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const policy = require('../www/module-pin-policy.js');

const CANONICAL_MODULE_IDS = [
  'stock',
  'service',
  'qms',
  'dsr',
  'expense',
  'grooming',
  'cro_audit',
  'payroll',
  'leave',
  'tax',
  'planning'
];

test('module PIN policy defaults every canonical module to off', () => {
  const first = policy.defaults();
  const second = policy.defaults();

  assert.equal(first.version, 1);
  assert.deepEqual(policy.MODULE_IDS, CANONICAL_MODULE_IDS);
  assert.deepEqual(Object.keys(first.modules), CANONICAL_MODULE_IDS);
  assert.ok(Object.values(first.modules).every(value => value === false));
  assert.notEqual(first, second);
  assert.notEqual(first.modules, second.modules);
});

test('normalization keeps only strict booleans for known module IDs', () => {
  const source = {
    version: 1,
    modules: {
      stock: true,
      service: false,
      payroll: 'true',
      tax: 1,
      unknown_module: true
    },
    unexpected: 'ignored'
  };

  const normalized = policy.normalize(source);

  assert.equal(normalized.modules.stock, true);
  assert.equal(normalized.modules.service, false);
  assert.equal(normalized.modules.payroll, false);
  assert.equal(normalized.modules.tax, false);
  assert.equal('unknown_module' in normalized.modules, false);
  assert.equal('unexpected' in normalized, false);
  assert.equal(source.modules.stock, true);
});

test('malformed, future, and legacy global values normalize to all-off', () => {
  const values = [
    null,
    true,
    'true',
    '{bad json',
    [],
    { version: 1, modules: [] },
    { version: 2, modules: { payroll: true } },
    { v: 1, modules: { payroll: true } }
  ];

  for (const value of values) {
    const normalized = policy.normalize(value);
    assert.ok(
      Object.values(normalized.modules).every(enabled => enabled === false),
      `expected all-off normalization for ${JSON.stringify(value)}`
    );
  }
});

test('module toggles are immutable and serialization is canonical', () => {
  const original = policy.setModuleEnabled(policy.defaults(), 'payroll', true);
  const changed = policy.setModuleEnabled(original, 'tax', true);
  const ignored = policy.setModuleEnabled(changed, 'not-a-module', true);

  assert.equal(original.modules.payroll, true);
  assert.equal(original.modules.tax, false);
  assert.equal(changed.modules.payroll, true);
  assert.equal(changed.modules.tax, true);
  assert.notEqual(original, changed);
  assert.notEqual(original.modules, changed.modules);
  assert.deepEqual(ignored, changed);

  const serialized = policy.serialize({
    version: 1,
    modules: { tax: true, stock: true, unknown_module: true }
  });
  assert.deepEqual(JSON.parse(serialized), {
    version: 1,
    modules: {
      stock: true,
      service: false,
      qms: false,
      dsr: false,
      expense: false,
      grooming: false,
      cro_audit: false,
      payroll: false,
      leave: false,
      tax: true,
      planning: false
    }
  });
});

test('requiresPin needs both an enabled module policy and an Owner PIN', () => {
  const configured = policy.setModuleEnabled(policy.defaults(), 'expense', true);

  assert.equal(policy.requiresPin(configured, 'expense', true), true);
  assert.equal(policy.requiresPin(configured, 'expense', false), false);
  assert.equal(policy.requiresPin(configured, 'expense', 'yes'), false);
  assert.equal(policy.requiresPin(configured, 'service', true), false);
  assert.equal(policy.requiresPin(configured, 'unknown_module', true), false);
  assert.equal(policy.requiresPin(true, 'expense', true), false);
});

test('browser UMD build exposes the same policy without CommonJS', () => {
  const source = fs.readFileSync(
    new URL('../www/module-pin-policy.js', import.meta.url),
    'utf8'
  );
  const context = vm.createContext({});

  vm.runInContext(source, context, { filename: 'module-pin-policy.js' });

  assert.equal(context.SaagarModulePinPolicy.POLICY_VERSION, 1);
  assert.equal(
    context.SaagarModulePinPolicy.requiresPin(
      { version: 1, modules: { stock: true } },
      'stock',
      true
    ),
    true
  );
});
