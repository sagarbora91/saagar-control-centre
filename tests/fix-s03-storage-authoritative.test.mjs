import assert from 'node:assert/strict';
import test from 'node:test';

import { createStorageCoreHarness, deferred, waitFor } from './helpers/storage-core-harness.mjs';

const NATIVE_MARKER = 'saagar_native_store_migrated_v1';
const TEST_DEK_B64 = Buffer.alloc(32, 7).toString('base64');

function plugin(statusFn) {
  return {
    status: statusFn,
    async readPage() { return { rows: [], afterKeyId: '', done: true, bytes: 0 }; },
    async applyBatch() { return { ok: true, changed: 0, rows: 0 }; },
    async reset() { return { cleared: true }; }
  };
}
const healthyStatus = {
  contractVersion: 1, available: true, schemaVersion: 2, rows: 0, stagedRows: 0, migrated: true, integrity: 'ok',
  storage: { totalBytes: 100000, availableBytes: 75000, freeBytes: 80000, databaseBytes: 16384, walBytes: 0, shmBytes: 0, journalBytes: 0, nativeStoreBytes: 16384 }
};
function keyPlugins() {
  return {
    Filesystem: { async readFile(r) { if (r.path === 'bcc.dek') return { data: 'wrapped-test-dek' }; throw new Error('not found'); } },
    SaagarKeystore: { async unwrapKey() { return { data: TEST_DEK_B64 }; } }
  };
}

test('S03a authoritative() is false while pending, true once ready', async () => {
  const status = deferred();
  const h = createStorageCoreHarness({
    initialStorage: { [NATIVE_MARKER]: '1', stale: 'x' },
    nativeStore: plugin(() => status.promise),
    plugins: keyPlugins()
  });
  assert.equal(typeof h.window.SaagarStore.authoritative, 'function');
  assert.equal(h.window.SaagarStore.authoritative(), false);
  status.resolve(healthyStatus);
  await waitFor(() => h.window.SaagarStore.ready(), { message: 'store did not become ready' });
  assert.equal(h.window.SaagarStore.authoritative(), true);
});

test('S03a authoritative() stays false when the native store is blocked', async () => {
  const h = createStorageCoreHarness({
    initialStorage: { [NATIVE_MARKER]: '1', stale: 'x' },
    nativeStore: plugin(async () => { throw new Error('native status failed'); }),
    plugins: keyPlugins()
  });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(h.window.SaagarStore.authoritative(), false);
});
