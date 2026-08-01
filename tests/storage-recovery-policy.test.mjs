import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'www/storage-recovery-policy.js'), 'utf8');

function loadPolicy() {
  const context = vm.createContext({
    globalThis: {},
    Date,
    JSON,
    Math,
    Number,
    Object,
    String
  });
  vm.runInContext(source, context, { filename: 'storage-recovery-policy.js' });
  return context.globalThis.SaagarStorageRecoveryPolicy;
}

test('native failures map only to stable recovery reason codes', () => {
  const policy = loadPolicy();
  assert.equal(policy.reasonFromError('PLUGIN_MISSING'), 'PLUGIN_MISSING');
  assert.equal(policy.reasonFromError({ code: 'E_NATIVE_FULL' }), 'NO_SPACE');
  assert.equal(policy.reasonFromError({ code: 'ignored', data: { reason: 'DB_READ_ONLY' } }), 'DB_READ_ONLY');
  assert.equal(
    policy.reasonFromError({
      code: 'UnexpectedLocalizedCode',
      message: 'secret/customer/path/should/not/be/parsed'
    }),
    'STORE_UNAVAILABLE'
  );
});

test('native status requires integrity, migration and a finite integer row count', () => {
  const policy = loadPolicy();
  const accepted = policy.inspectStatus({ available: true, migrated: true, integrity: 'ok', rows: 42 }, true);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.code, '');
  assert.equal(accepted.rows, 42);
  assert.equal(
    policy.inspectStatus({ available: true, migrated: true, integrity: 'failed', rows: 42 }, true).code,
    'INTEGRITY_FAILED'
  );
  assert.equal(
    policy.inspectStatus({ available: true, migrated: false, integrity: 'ok', rows: 42 }, true).code,
    'MIGRATION_INCOMPLETE'
  );
  for (const rows of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 'not-a-count']) {
    assert.equal(
      policy.inspectStatus({ available: true, migrated: true, integrity: 'ok', rows }, true).code,
      'ROW_COUNT_MISMATCH'
    );
  }
});

test('copied diagnostics retain allowlisted metrics and discard raw native data', () => {
  const policy = loadPolicy();
  const secret = 'CUSTOMER_SENTINEL_90817';
  const diagnostic = policy.diagnostics({
    appVersion: 'V5.5',
    apkBuild: '2.9',
    state: 'blocked',
    code: 'DB_OPEN_FAILED',
    stage: 'native-status',
    attempt: 2,
    nativeMarker: true,
    pluginPresent: true,
    schemaVersion: 2,
    expectedRows: 7300,
    loadedRows: 0,
    storage: {
      totalBytes: 500_000,
      availableBytes: 120_000,
      freeBytes: 100_000,
      databaseBytes: 80_000,
      walBytes: 2_000,
      shmBytes: 1_000,
      journalBytes: 0,
      nativeStoreBytes: 83_000,
      absolutePath: `C:/private/${secret}`
    },
    rawError: `open failed for ${secret}`,
    keyId: secret,
    payload: `SBKV1:${secret}`
  });

  assert.equal(diagnostic.format, 'SAAGAR_STORAGE_RECOVERY');
  assert.equal(diagnostic.contractVersion, 1);
  assert.equal(diagnostic.code, 'DB_OPEN_FAILED');
  assert.equal(diagnostic.storage.nativeStoreBytes, 83_000);
  assert.equal(diagnostic.storage.freeBytes, 100_000);
  const text = JSON.stringify(diagnostic);
  assert.doesNotMatch(text, /CUSTOMER_SENTINEL_90817|SBKV1:|absolutePath|rawError|keyId|payload/);
});
