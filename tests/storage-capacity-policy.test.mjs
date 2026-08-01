import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'www/storage-capacity-policy.js');
const source = fs.readFileSync(policyPath, 'utf8');
const require = createRequire(import.meta.url);
const policy = require(policyPath);

test('storage capacity policy is available through CommonJS and the browser global', () => {
  const context = vm.createContext({
    globalThis: {},
    Math,
    Number,
    Object,
    String
  });
  vm.runInContext(source, context, { filename: 'storage-capacity-policy.js' });

  assert.equal(policy.CONTRACT_VERSION, 1);
  assert.equal(context.globalThis.SaagarStorageCapacityPolicy.CONTRACT_VERSION, 1);
});

test('device usage is derived from availableBytes and never from freeBytes', () => {
  const result = policy.deriveCapacity({
    totalBytes: 100_000,
    availableBytes: 75_000,
    freeBytes: 99_999,
    nativeStoreBytes: 16_384
  });

  assert.deepEqual(result, {
    measured: true,
    totalBytes: 100_000,
    availableBytes: 75_000,
    usedBytes: 25_000,
    usedPercent: 25,
    databaseBytes: 16_384
  });
});

test('available capacity is clamped to the measured device range', () => {
  assert.deepEqual(
    policy.deriveCapacity({ totalBytes: 100, availableBytes: 125 }),
    {
      measured: true,
      totalBytes: 100,
      availableBytes: 100,
      usedBytes: 0,
      usedPercent: 0,
      databaseBytes: null
    }
  );
  assert.deepEqual(
    policy.deriveCapacity({ totalBytes: 100, availableBytes: -25 }),
    {
      measured: true,
      totalBytes: 100,
      availableBytes: 0,
      usedBytes: 100,
      usedPercent: 100,
      databaseBytes: null
    }
  );

  for (const value of [
    { totalBytes: 0, availableBytes: 0 },
    { totalBytes: Number.NaN, availableBytes: 10 },
    { totalBytes: 100, availableBytes: Number.POSITIVE_INFINITY },
    { totalBytes: 100, availableBytes: '' }
  ]) {
    const result = policy.deriveCapacity(value);
    assert.equal(result.measured, false);
    assert.equal(result.usedBytes, null);
    assert.equal(result.usedPercent, null);
  }
});

test('byte labels use base-1024 units through terabytes', () => {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;

  assert.equal(policy.formatBytes(0), '0 B');
  assert.equal(policy.formatBytes(1023), '1023 B');
  assert.equal(policy.formatBytes(KB), '1 KB');
  assert.equal(policy.formatBytes(1.5 * KB), '1.5 KB');
  assert.equal(policy.formatBytes(12.375 * MB), '12.4 MB');
  assert.equal(policy.formatBytes(67.25 * GB), '67.3 GB');
  assert.equal(policy.formatBytes(474 * GB), '474 GB');
  assert.equal(policy.formatBytes(1.5 * TB), '1.5 TB');
  assert.equal(policy.formatBytes(Number.NaN), '\u2014');
  assert.equal(policy.formatBytes(undefined), '\u2014');
});

test('SAAGAR database display comes only from nativeStoreBytes', () => {
  const model = policy.displayModel({
    totalBytes: 512 * 1024 * 1024,
    availableBytes: 256 * 1024 * 1024,
    nativeStoreBytes: 12_345,
    databaseBytes: 90_000,
    walBytes: 8_000,
    shmBytes: 4_000,
    journalBytes: 2_000
  });

  assert.equal(model.databaseBytes, 12_345);
  assert.equal(model.databaseLabel, '12.1 KB');

  const missingAggregate = policy.displayModel({
    totalBytes: 100_000,
    availableBytes: 50_000,
    databaseBytes: 90_000,
    walBytes: 8_000
  });
  assert.equal(missingAggregate.databaseBytes, null);
  assert.equal(missingAggregate.databaseLabel, '\u2014');
});

test('sanitization exposes only the three approved storage fields', () => {
  assert.deepEqual(
    policy.sanitizeStorage({
      totalBytes: '1000',
      availableBytes: '250',
      nativeStoreBytes: '75',
      freeBytes: 999,
      absolutePath: 'private/database/path',
      databaseBytes: 70
    }),
    {
      totalBytes: 1000,
      availableBytes: 250,
      nativeStoreBytes: 75
    }
  );
});
