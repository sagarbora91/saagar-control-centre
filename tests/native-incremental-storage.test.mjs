import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = fs.readFileSync(path.join(root, 'www/storage-core.js'), 'utf8');
const plugin = fs.readFileSync(
  path.join(root, 'build-overrides/native/SaagarNativeStorePlugin.java'),
  'utf8'
);
const overrides = fs.readFileSync(
  path.join(root, 'build-overrides/apply-overrides.js'),
  'utf8'
);

test('native durable store uses bounded SQLite transactions and encrypted record ids', () => {
  assert.match(plugin, /extends SQLiteOpenHelper/);
  assert.match(plugin, /setWriteAheadLoggingEnabled\(true\)/);
  assert.match(plugin, /private static final int MAX_BATCH_OPS = 64/);
  assert.match(plugin, /private static final int MAX_PAGE_ROWS = 64/);
  assert.match(plugin, /db\.beginTransaction\(\)/);
  assert.match(plugin, /db\.setTransactionSuccessful\(\)/);
  assert.match(plugin, /key_id TEXT PRIMARY KEY/);
  assert.match(plugin, /\[a-f0-9\]\{64\}/);
  assert.doesNotMatch(plugin, /CREATE TABLE kv .*value TEXT/);
});

test('regenerated Android projects always stamp and register the native store', () => {
  assert.match(overrides, /SaagarNativeStorePlugin\.java/);
  assert.match(overrides, /registerPlugin\(SaagarNativeStorePlugin\.class\)/);
  assert.match(overrides, /stampPlugin\(NATIVE_STORE_PLUGIN_SRC/);
});

test('native mode never executes the legacy whole-database export path', () => {
  const nativeStart = core.indexOf('function persistNative()');
  const legacyStart = core.indexOf('function persist()', nativeStart);
  assert.ok(nativeStart >= 0 && legacyStart > nativeStart);
  const nativePersist = core.slice(nativeStart, legacyStart);

  assert.match(nativePersist, /applyNativeSnapshots/);
  assert.match(nativePersist, /clearWALThrough\(through\)/);
  assert.doesNotMatch(nativePersist, /db\.export\(\)/);
  assert.ok(
    core.indexOf('if (_nativeMode) return persistNative();', legacyStart) <
      core.indexOf('raw = db.export()', legacyStart),
    'native dispatch must occur before the legacy snapshot export'
  );
});

test('native startup is paged and migration becomes authoritative only after verification', () => {
  assert.match(core, /readPage\(\{ afterKeyId: after, limit: 32/);
  assert.match(core, /decodeNativeRecord\(row, dek\)/);
  assert.match(core, /beginMigration\(\{\}\)/);
  assert.match(core, /finishMigration\(\{ expectedRows: snapshots\.length \}\)/);
  assert.match(core, /Native migration verification did not complete/);
  assert.match(core, /persistenceMode: _nativeMode \? 'native-incremental'/);
});
test('native authority marker fails closed instead of opening stale legacy data', () => {
  assert.match(core, /NATIVE_MIGRATED_KEY = 'saagar_native_store_migrated_v1'/);
  assert.match(core, /if \(!plugin\) \{ if \(wasNative\) blockNativeStore\('plugin-missing'\)/);
  assert.match(core, /if \(wasNative\) \{ blockNativeStore\('native-status-invalid'\)/);
  assert.match(core, /Authoritative native storage is unavailable/);
  assert.match(core, /storageBlocked: _storageBlocked/);
});