import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStorageCoreHarness,
  deferred,
  waitFor
} from './helpers/storage-core-harness.mjs';

const NATIVE_MARKER = 'saagar_native_store_migrated_v1';
const STALE_KEY = 'st_v2_admin_pin_hash';
const STALE_VALUE = 'raw-pin-hash-that-must-never-be-served';
const TEST_DEK_B64 = Buffer.alloc(32, 7).toString('base64');

function healthyZeroRowPlugin(statusOverride = {}) {
  return {
    async status() {
      return {
        contractVersion: 1,
        available: true,
        schemaVersion: 2,
        rows: 0,
        stagedRows: 0,
        migrated: true,
        integrity: 'ok',
        storage: {
          totalBytes: 100_000,
          availableBytes: 75_000,
          freeBytes: 80_000,
          databaseBytes: 16_384,
          walBytes: 0,
          shmBytes: 0,
          journalBytes: 0,
          nativeStoreBytes: 16_384
        },
        ...statusOverride
      };
    },
    async readPage() {
      return { rows: [], afterKeyId: '', done: true, bytes: 0 };
    },
    async applyBatch() {
      return { ok: true, changed: 0, rows: 0 };
    },
    async reset() {
      return { cleared: true };
    }
  };
}

function healthyKeyPlugins() {
  return {
    Filesystem: {
      async readFile(request) {
        if (request.path === 'bcc.dek') return { data: 'wrapped-test-dek' };
        throw new Error('not found');
      }
    },
    SaagarKeystore: {
      async unwrapKey() {
        return { data: TEST_DEK_B64 };
      }
    }
  };
}

test('native marker quarantines stale records before async status resolves', async () => {
  const status = deferred();
  const nativeStore = {
    ...healthyZeroRowPlugin(),
    status() {
      return status.promise;
    }
  };
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE,
      stale_business_record: '{"secret":"must stay hidden"}'
    },
    nativeStore,
    plugins: healthyKeyPlugins()
  });

  assert.equal(harness.localStorage.getItem(STALE_KEY), null);
  assert.equal(harness.localStorage.key(0), null);
  assert.equal(harness.localStorage.length, 0);
  assert.equal(harness.window.SaagarStore.get(STALE_KEY), null);
  assert.equal(harness.window.SaagarStore.keys().length, 0);
  assert.equal(harness.window.SaagarStore.length(), 0);
  assert.equal(harness.window.SaagarStore.recoveryStatus().state, 'pending');
  assert.equal(
    harness.window.SaagarStore._status().persistenceMode,
    'authority-pending'
  );

  for (const write of [
    () => harness.localStorage.setItem('new-key', 'new-value'),
    () => harness.localStorage.removeItem(STALE_KEY),
    () => harness.localStorage.clear(),
    () => harness.window.SaagarStore.set('new-key', 'new-value')
  ]) {
    assert.throws(write, error => error?.code === 'STORAGE_BLOCKED');
  }

  status.resolve(await healthyZeroRowPlugin().status());
  await waitFor(() => harness.window.SaagarStore.ready(), {
    message: 'healthy native store did not leave authority-pending quarantine'
  });
});

test('missing native plugin shows a stable fail-closed recovery screen', () => {
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE
    },
    nativeStore: null
  });

  const recovery = harness.window.SaagarStore.recoveryStatus();
  assert.equal(recovery.state, 'blocked');
  assert.equal(recovery.code, 'PLUGIN_MISSING');
  assert.equal(recovery.pluginPresent, false);
  assert.equal(harness.localStorage.getItem(STALE_KEY), null);

  const overlay = harness.document.getElementById('saagar-storage-blocked');
  assert.ok(overlay, 'recovery overlay should be rendered');
  assert.match(overlay.textContent, /Secure storage component is unavailable/);
  assert.match(overlay.textContent, /Recovery code: PLUGIN_MISSING/);
  assert.deepEqual(
    harness.overlayButtons().map(button => button.textContent),
    ['Retry storage', 'Copy diagnostics']
  );
  assert.doesNotMatch(overlay.textContent, /restore/i);
});

test('hung authoritative status call blocks with STORE_TIMEOUT', async () => {
  const never = deferred();
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE
    },
    nativeStore: {
      ...healthyZeroRowPlugin(),
      status() {
        return never.promise;
      }
    },
    bootTimeoutMs: 20
  });

  await waitFor(
    () => harness.window.SaagarStore.recoveryStatus().state === 'blocked',
    { timeoutMs: 500, message: 'hung native status did not enter blocked mode' }
  );

  const recovery = harness.window.SaagarStore.recoveryStatus();
  assert.equal(recovery.code, 'STORE_TIMEOUT');
  assert.equal(recovery.stage, 'native-status');
  assert.equal(harness.window.SaagarStore.ready(), false);
  assert.equal(harness.localStorage.getItem(STALE_KEY), null);
  assert.match(
    harness.document.getElementById('saagar-storage-blocked').textContent,
    /Recovery code: STORE_TIMEOUT/
  );
});

test('healthy zero-row native boot discards stale localStorage records', async () => {
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE,
      stale_business_record: '{"amount":999999}'
    },
    nativeStore: healthyZeroRowPlugin(),
    plugins: healthyKeyPlugins()
  });

  await waitFor(() => harness.window.SaagarStore.ready(), {
    message: 'healthy zero-row native store did not become ready'
  });

  assert.equal(harness.localStorage.getItem(STALE_KEY), null);
  assert.equal(harness.localStorage.getItem('stale_business_record'), null);
  assert.equal(harness.localStorage.length, 0);
  assert.deepEqual(harness.window.SaagarStore.keys(), []);
  assert.equal(harness.window.SaagarStore._mem().size, 0);
  assert.equal(harness.window.SaagarStore._status().nativeRows, 0);
  assert.equal(
    harness.window.SaagarStore._status().persistenceMode,
    'native-incremental'
  );
  assert.equal(harness.rawStorage.get(STALE_KEY), STALE_VALUE);
});

test('recovery diagnostics use stable fields and exclude raw native errors', async () => {
  const sentinel = 'PIN=4279 customer=Acme raw/path/saagar-native-kv.db';
  const nativeError = Object.assign(new Error(sentinel), {
    code: 'E_NATIVE_DB_OPEN',
    data: {
      reason: 'DB_OPEN_FAILED',
      rawMessage: sentinel,
      businessPayload: '{"customer":"Acme"}',
      databasePath: '/raw/path/saagar-native-kv.db'
    }
  });
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE
    },
    nativeStore: {
      ...healthyZeroRowPlugin(),
      async status() {
        throw nativeError;
      }
    },
    buildId: { appVersion: '5.0.0', apkBuild: 'recovery-test' }
  });

  await waitFor(
    () => harness.window.SaagarStore.recoveryStatus().state === 'blocked',
    { message: 'native open failure did not enter blocked mode' }
  );

  const diagnostics = JSON.parse(
    JSON.stringify(harness.window.SaagarStore.recoveryDiagnostics())
  );
  assert.equal(diagnostics.format, 'SAAGAR_STORAGE_RECOVERY');
  assert.equal(diagnostics.contractVersion, 1);
  assert.equal(diagnostics.code, 'DB_OPEN_FAILED');
  assert.equal(diagnostics.appVersion, '5.0.0');
  assert.equal(diagnostics.apkBuild, 'recovery-test');
  assert.deepEqual(Object.keys(diagnostics).sort(), [
    'apkBuild',
    'appVersion',
    'attempt',
    'canRestore',
    'canRetry',
    'code',
    'contractVersion',
    'createdAt',
    'expectedRows',
    'format',
    'loadedRows',
    'nativeMarker',
    'pluginPresent',
    'schemaVersion',
    'stage',
    'state',
    'storage'
  ].sort());

  const serialized = JSON.stringify(diagnostics);
  assert.doesNotMatch(serialized, /4279|Acme|raw\/path|rawMessage|businessPayload|databasePath/);
  assert.doesNotMatch(serialized, new RegExp(STALE_VALUE));

  assert.equal(await harness.window.SaagarStore.copyRecoveryDiagnostics(), true);
  assert.equal(harness.clipboardWrites.length, 1);
  assert.doesNotMatch(
    harness.clipboardWrites[0],
    /4279|Acme|raw\/path|rawMessage|businessPayload|databasePath/
  );
});

test('a late native page result cannot reopen storage after timeout', async () => {
  const page = deferred();
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE
    },
    nativeStore: {
      ...healthyZeroRowPlugin(),
      readPage() {
        return page.promise;
      }
    },
    plugins: healthyKeyPlugins(),
    bootTimeoutMs: 20
  });

  await waitFor(
    () => harness.window.SaagarStore.recoveryStatus().state === 'blocked',
    { timeoutMs: 500, message: 'hung native page did not enter blocked mode' }
  );
  assert.equal(harness.window.SaagarStore.recoveryStatus().code, 'STORE_TIMEOUT');
  assert.equal(harness.window.SaagarStore.recoveryStatus().stage, 'native-read');

  page.resolve({ rows: [], afterKeyId: '', done: true, bytes: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(harness.window.SaagarStore.ready(), false);
  assert.equal(harness.window.SaagarStore.recoveryStatus().state, 'blocked');
  assert.equal(harness.localStorage.getItem(STALE_KEY), null);
});
test('recovery retry performs a hard reload and does not reopen storage in place', () => {
  const harness = createStorageCoreHarness({
    initialStorage: {
      [NATIVE_MARKER]: '1',
      [STALE_KEY]: STALE_VALUE
    },
    nativeStore: null
  });

  assert.equal(harness.window.SaagarStore.retryRecovery(), true);
  assert.equal(harness.location.reloadCalls, 1);
  assert.equal(harness.window.SaagarStore.recoveryStatus().stage, 'reload');
  assert.equal(harness.window.SaagarStore.recoveryStatus().canRetry, false);
  assert.equal(harness.window.SaagarStore.ready(), false);
  assert.equal(harness.localStorage.getItem(STALE_KEY), null);
});
