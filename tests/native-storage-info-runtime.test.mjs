import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStorageCoreHarness,
  deferred,
  waitFor
} from './helpers/storage-core-harness.mjs';

const TEST_DEK_B64 = Buffer.alloc(32, 11).toString('base64');

function keyPlugins() {
  return {
    Filesystem: {
      async readFile(request) {
        if (request.path === 'bcc.dek') return { data: 'wrapped-storage-info-dek' };
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

function healthyNativeStore(storageInfo) {
  const calls = { status: 0, storageInfo: 0, reset: 0 };
  const plugin = {
    async status() {
      calls.status++;
      return {
        contractVersion: 1,
        available: true,
        schemaVersion: 2,
        rows: 0,
        stagedRows: 0,
        migrated: true,
        integrity: 'ok',
        storage: {
          totalBytes: 10_000,
          availableBytes: 8_000,
          freeBytes: 8_500,
          databaseBytes: 1_000,
          walBytes: 0,
          shmBytes: 0,
          journalBytes: 0,
          nativeStoreBytes: 1_000
        }
      };
    },
    async readPage() {
      return { rows: [], afterKeyId: '', done: true, bytes: 0 };
    },
    async applyBatch() {
      return { ok: true, changed: 0, rows: 0 };
    },
    async reset() {
      calls.reset++;
      return { cleared: true };
    }
  };
  if (storageInfo !== undefined) {
    plugin.storageInfo = function (request) {
      calls.storageInfo++;
      return storageInfo(request, calls.storageInfo);
    };
  }
  return { calls, plugin };
}

async function readyHarness(storageInfo) {
  const native = healthyNativeStore(storageInfo);
  const harness = createStorageCoreHarness({
    nativeStore: native.plugin,
    plugins: keyPlugins()
  });
  await waitFor(() => harness.window.SaagarStore.ready(), {
    message: 'native store did not become ready for storage-info test'
  });
  return { ...native, harness };
}

function authoritySnapshot(store) {
  const status = store._status();
  return JSON.parse(JSON.stringify({
    ready: status.ready,
    storageBlocked: status.storageBlocked,
    authorityPending: status.authorityPending,
    persistenceMode: status.persistenceMode,
    lastError: status.lastError,
    recovery: status.recovery,
    nativeStatus: status.nativeStatus
  }));
}

test('refreshStorageInfo returns only sanitized capacity fields without re-running status', async () => {
  const secret = 'private/path/customer-record';
  const { calls, harness } = await readyHarness(async () => ({
    totalBytes: '1000',
    availableBytes: '250',
    nativeStoreBytes: '75',
    freeBytes: 999,
    databaseBytes: 70,
    absolutePath: secret,
    payload: `secret:${secret}`
  }));
  const store = harness.window.SaagarStore;
  const before = authoritySnapshot(store);

  const result = JSON.parse(JSON.stringify(await store.refreshStorageInfo()));

  assert.deepEqual(result, {
    totalBytes: 1000,
    availableBytes: 250,
    nativeStoreBytes: 75
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'availableBytes',
    'nativeStoreBytes',
    'totalBytes'
  ]);
  assert.doesNotMatch(JSON.stringify(result), /freeBytes|databaseBytes|absolutePath|payload|private\/path/);
  assert.equal(calls.status, 1);
  assert.equal(calls.storageInfo, 1);
  assert.deepEqual(authoritySnapshot(store), before);
});

test('missing or failing storageInfo resolves null without changing authority state', async () => {
  const { calls, plugin, harness } = await readyHarness(undefined);
  const store = harness.window.SaagarStore;
  const before = authoritySnapshot(store);

  assert.equal(await store.refreshStorageInfo(), null);

  plugin.storageInfo = function () {
    calls.storageInfo++;
    throw new Error('raw path and business data must not escape');
  };
  assert.equal(await store.refreshStorageInfo(), null);

  plugin.storageInfo = function () {
    calls.storageInfo++;
    return Promise.reject(new Error('native measurement failed'));
  };
  assert.equal(await store.refreshStorageInfo(), null);

  assert.equal(calls.status, 1);
  assert.equal(calls.storageInfo, 2);
  assert.deepEqual(authoritySnapshot(store), before);
});

test('a late storage measurement cannot replace a newer request', async () => {
  const first = deferred();
  const { harness } = await readyHarness((_request, callNumber) => {
    if (callNumber === 1) return first.promise;
    return Promise.resolve({
      totalBytes: 2000,
      availableBytes: 1200,
      nativeStoreBytes: 90
    });
  });
  const store = harness.window.SaagarStore;

  const oldRequest = store.refreshStorageInfo();
  const newRequest = store.refreshStorageInfo();
  assert.deepEqual(
    JSON.parse(JSON.stringify(await newRequest)),
    { totalBytes: 2000, availableBytes: 1200, nativeStoreBytes: 90 }
  );

  first.resolve({ totalBytes: 1000, availableBytes: 100, nativeStoreBytes: 80 });
  assert.equal(await oldRequest, null);
});

test('factory reset invalidates an in-flight storage measurement', async () => {
  const pending = deferred();
  const { calls, harness } = await readyHarness(() => pending.promise);
  const store = harness.window.SaagarStore;

  const refresh = store.refreshStorageInfo();
  await Promise.resolve();
  assert.equal(calls.storageInfo, 1);
  await store._reset();
  assert.equal(calls.reset, 1);

  pending.resolve({ totalBytes: 3000, availableBytes: 2000, nativeStoreBytes: 100 });
  assert.equal(await refresh, null);
});
