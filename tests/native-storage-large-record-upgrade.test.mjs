import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createStorageCoreHarness,
  deferred,
  waitFor
} from './helpers/storage-core-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = fs.readFileSync(path.join(root, 'www/storage-core.js'), 'utf8');
const pluginSource = fs.readFileSync(
  path.join(root, 'build-overrides/native/SaagarNativeStorePlugin.java'),
  'utf8'
);

const NATIVE_MARKER = 'saagar_native_store_migrated_v1';
const TEST_DEK = Buffer.alloc(32, 7);
const TEST_DEK_B64 = TEST_DEK.toString('base64');

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

function status(rows) {
  return {
    contractVersion: 1,
    available: true,
    schemaVersion: 2,
    rows,
    stagedRows: 0,
    migrated: true,
    integrity: 'ok',
    storage: {
      totalBytes: 100_000_000,
      availableBytes: 75_000_000,
      freeBytes: 80_000_000,
      databaseBytes: 30_000_000,
      walBytes: 524_288,
      shmBytes: 32_768,
      journalBytes: 0,
      nativeStoreBytes: 30_557_056
    }
  };
}

async function encryptedNativeRow(key, value, seq = 1) {
  const cryptoKey = await webcrypto.subtle.importKey(
    'raw',
    TEST_DEK,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = new Uint8Array(12);
  iv.fill(11);
  const plain = new TextEncoder().encode(JSON.stringify([key, value]));
  const ciphertext = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain)
  );
  const envelope = Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext)]);
  return {
    key,
    keyId: createHash('sha256').update(key, 'utf8').digest('hex'),
    payload: `SBKV1:${envelope.toString('base64')}`,
    seq
  };
}

test('native page query never materializes an oversized payload in CursorWindow', () => {
  assert.match(
    pluginSource,
    /MAX_INLINE_CURSOR_PAYLOAD_CHARS = 512 \* 1024/
  );
  assert.match(
    pluginSource,
    /int maxInlineChars = Math\.min\(maxBytes, MAX_INLINE_CURSOR_PAYLOAD_CHARS\)/
  );
  assert.match(
    pluginSource,
    /CASE WHEN length\(payload\)<=CAST\(\? AS INTEGER\) THEN payload ELSE NULL END/
  );
  assert.match(
    pluginSource,
    /String\.valueOf\(maxInlineChars\), after, String\.valueOf\(limit \+ 1\)/
  );
  assert.match(pluginSource, /payloadChars > maxInlineChars/);
  assert.doesNotMatch(
    pluginSource,
    /String sql = "SELECT key_id,payload,updated_seq/
  );
  assert.match(pluginSource, /public void readRecordChunk\(PluginCall call\)/);
  assert.match(pluginSource, /SELECT substr\(payload,\?,\?\),length\(payload\),updated_seq/);
  assert.match(pluginSource, /totalChars > MAX_BATCH_BYTES/);
  assert.match(
    pluginSource,
    /"readPage"\.equals\(operation\) \|\| "readRecordChunk"\.equals\(operation\)/
  );
});

test('upgrade hydration reconstructs and authenticates an encrypted record larger than a page', async () => {
  const key = 'saagar_demo_large_history_record';
  const value = `LARGE-UPGRADE-CANARY:${'x'.repeat(2 * 1024 * 1024)}`;
  const row = await encryptedNativeRow(key, value, 480);
  assert.ok(row.payload.length > 2 * 1024 * 1024);

  let pageCalls = 0;
  let chunkCalls = 0;
  const nativeStore = {
    async status() {
      return status(1);
    },
    async readPage({ afterKeyId }) {
      pageCalls++;
      if (!afterKeyId) {
        return {
          rows: [],
          afterKeyId: '',
          done: false,
          bytes: 0,
          oversized: { keyId: row.keyId, seq: row.seq, chars: row.payload.length }
        };
      }
      assert.equal(afterKeyId, row.keyId);
      return { rows: [], afterKeyId: row.keyId, done: true, bytes: 0 };
    },
    async readRecordChunk({ keyId, offset, limit }) {
      chunkCalls++;
      assert.equal(keyId, row.keyId);
      assert.equal(limit, 256 * 1024);
      const chunk = row.payload.slice(offset, offset + limit);
      const nextOffset = offset + chunk.length;
      return {
        keyId,
        chunk,
        offset,
        nextOffset,
        totalChars: row.payload.length,
        seq: row.seq,
        done: nextOffset === row.payload.length
      };
    }
  };

  const harness = createStorageCoreHarness({
    initialStorage: { [NATIVE_MARKER]: '1' },
    nativeStore,
    plugins: healthyKeyPlugins(),
    bootTimeoutMs: 5_000,
    nativeReadTimeoutMs: 15_000,
    nativeReadStallTimeoutMs: 5_000
  });

  await waitFor(() => harness.window.SaagarStore.ready(), {
    timeoutMs: 20_000,
    message: 'large encrypted native record did not finish upgrade hydration'
  });

  const hydrated = harness.window.SaagarStore.get(key);
  assert.equal(hydrated.length, value.length);
  assert.equal(
    createHash('sha256').update(hydrated, 'utf8').digest('hex'),
    createHash('sha256').update(value, 'utf8').digest('hex')
  );
  assert.equal(harness.window.SaagarStore.recoveryStatus().state, 'ready');
  assert.equal(harness.window.SaagarStore.recoveryStatus().loadedRows, 1);
  assert.equal(pageCalls, 2);
  assert.ok(chunkCalls > 8, 'the oversized value must cross the bridge in bounded chunks');
});

test('a record above the cursor-safe cap but below the page budget also hydrates through chunks', async () => {
  const key = 'saagar_cursor_boundary_record';
  const value = `CURSOR-BOUNDARY:${'b'.repeat(500 * 1024)}`;
  const row = await encryptedNativeRow(key, value, 77);
  assert.ok(row.payload.length > 512 * 1024);
  assert.ok(row.payload.length < 2 * 1024 * 1024);

  let chunkCalls = 0;
  const nativeStore = {
    async status() {
      return status(1);
    },
    async readPage({ afterKeyId }) {
      if (!afterKeyId) {
        return {
          rows: [],
          afterKeyId: '',
          done: false,
          bytes: 0,
          oversized: { keyId: row.keyId, seq: row.seq, chars: row.payload.length }
        };
      }
      assert.equal(afterKeyId, row.keyId);
      return { rows: [], afterKeyId: row.keyId, done: true, bytes: 0 };
    },
    async readRecordChunk({ keyId, offset, limit }) {
      chunkCalls++;
      assert.equal(keyId, row.keyId);
      const chunk = row.payload.slice(offset, offset + limit);
      const nextOffset = offset + chunk.length;
      return {
        keyId,
        chunk,
        offset,
        nextOffset,
        totalChars: row.payload.length,
        seq: row.seq,
        done: nextOffset === row.payload.length
      };
    }
  };

  const harness = createStorageCoreHarness({
    initialStorage: { [NATIVE_MARKER]: '1' },
    nativeStore,
    plugins: healthyKeyPlugins(),
    bootTimeoutMs: 5_000,
    nativeReadTimeoutMs: 10_000,
    nativeReadStallTimeoutMs: 5_000
  });

  await waitFor(() => harness.window.SaagarStore.ready(), {
    timeoutMs: 15_000,
    message: 'cursor-boundary record did not finish chunked hydration'
  });
  assert.equal(harness.window.SaagarStore.get(key), value);
  assert.equal(harness.window.SaagarStore.recoveryStatus().loadedRows, 1);
  assert.ok(chunkCalls >= 3, 'the cursor-boundary record must use multiple bridge chunks');
});

test('chunk sequence drift fails closed before any oversized record is committed', async () => {
  const keyId = 'a'.repeat(64);
  const totalChars = 2 * 1024 * 1024 + 1;
  const nativeStore = {
    async status() {
      return status(1);
    },
    async readPage() {
      return {
        rows: [],
        afterKeyId: '',
        done: false,
        bytes: 0,
        oversized: { keyId, seq: 42, chars: totalChars }
      };
    },
    async readRecordChunk({ offset, limit }) {
      const chunk = 'A'.repeat(limit);
      return {
        keyId,
        chunk,
        offset,
        nextOffset: offset + chunk.length,
        totalChars,
        seq: 43,
        done: false
      };
    }
  };

  const harness = createStorageCoreHarness({
    initialStorage: { [NATIVE_MARKER]: '1' },
    nativeStore,
    plugins: healthyKeyPlugins(),
    bootTimeoutMs: 500,
    nativeReadTimeoutMs: 500,
    nativeReadStallTimeoutMs: 100
  });

  await waitFor(
    () => harness.window.SaagarStore.recoveryStatus().state === 'blocked',
    { timeoutMs: 1_000, message: 'sequence drift did not block storage' }
  );
  assert.equal(harness.window.SaagarStore.recoveryStatus().code, 'PAGE_CURSOR_INVALID');
  assert.equal(harness.window.SaagarStore.recoveryStatus().loadedRows, 0);
  assert.equal(harness.window.SaagarStore.ready(), false);
});

test('a stalled oversized chunk reports STORE_TIMEOUT at native-read', async () => {
  const keyId = 'b'.repeat(64);
  const chunk = deferred();
  const nativeStore = {
    async status() {
      return status(1);
    },
    async readPage() {
      return {
        rows: [],
        afterKeyId: '',
        done: false,
        bytes: 0,
        oversized: { keyId, seq: 9, chars: 2 * 1024 * 1024 + 1 }
      };
    },
    readRecordChunk() {
      return chunk.promise;
    }
  };

  const harness = createStorageCoreHarness({
    initialStorage: { [NATIVE_MARKER]: '1' },
    nativeStore,
    plugins: healthyKeyPlugins(),
    bootTimeoutMs: 500,
    nativeReadTimeoutMs: 500,
    nativeReadStallTimeoutMs: 20
  });

  await waitFor(
    () => harness.window.SaagarStore.recoveryStatus().state === 'blocked',
    { timeoutMs: 1_000, message: 'stalled chunk did not time out' }
  );
  assert.equal(harness.window.SaagarStore.recoveryStatus().code, 'STORE_TIMEOUT');
  assert.equal(harness.window.SaagarStore.recoveryStatus().stage, 'native-read');
  assert.equal(harness.window.SaagarStore.recoveryStatus().loadedRows, 0);
});

test('authoritative native hydration has a bounded adaptive deadline and decrypt concurrency', () => {
  assert.match(core, /NATIVE_READ_MIN_TIMEOUT_MS = 120000/);
  assert.match(core, /NATIVE_READ_MAX_TIMEOUT_MS = 300000/);
  assert.match(core, /NATIVE_READ_STALL_TIMEOUT_MS = 15000/);
  assert.match(core, /DECRYPT_BATCH_SIZE = 8/);
  assert.match(core, /MAX_INLINE_NATIVE_RECORD_CHARS = 512 \* 1024/);
  assert.match(core, /Promise\.all\(batch\.map/);
  assert.match(core, /armBootTimer\(nativeReadTimeoutMs\(inspected\.rows\)\)/);
  assert.match(core, /partSequence !== sequence/);
  assert.match(core, /total <= MAX_INLINE_NATIVE_RECORD_CHARS/);
  assert.match(core, /total > MAX_NATIVE_RECORD_CHARS/);
});
