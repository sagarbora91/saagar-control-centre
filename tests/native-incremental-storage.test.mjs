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
const shell = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
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
  assert.match(core, /_nativeMode \? 'native-incremental' : 'legacy-snapshot'/);
});
test('native authority marker quarantines stale data and exposes bounded recovery actions', () => {
  assert.match(core, /NATIVE_MIGRATED_KEY = 'saagar_native_store_migrated_v1'/);
  assert.match(core, /_authorityPending = nGet\.call\(ls, NATIVE_MIGRATED_KEY\) === '1'/);
  assert.match(core, /if \(!_authorityPending\) \(function hydrate/);
  assert.match(core, /if \(!plugin\) \{ if \(wasNative\) blockNativeStore\('PLUGIN_MISSING'/);
  assert.match(core, /blockNativeStore\('STORE_TIMEOUT'/);
  assert.match(core, /error\.code = 'STORAGE_BLOCKED'/);
  assert.match(core, /persistenceMode: _storageBlocked \? 'blocked'/);
  assert.match(core, /copyRecoveryDiagnostics/);
  assert.match(core, /retryRecovery/);
});
test('native failures are caught through transaction cleanup and expose only stable diagnostics', () => {
  for (const [method, nextMethod] of [
    ['beginMigration', 'finishMigration'],
    ['finishMigration', 'readPage'],
    ['applyBatch', 'reset']
  ]) {
    const start = plugin.indexOf(`public void ${method}`);
    const end = plugin.indexOf(`public void ${nextMethod}`, start + 1);
    const body = plugin.slice(start, end);
    assert.ok(start >= 0 && end > start, `${method} body should be present`);
    assert.ok(
      body.indexOf('failure = finishTransaction') < body.indexOf('call.resolve(out)'),
      `${method} must finish its transaction before resolving`
    );
  }
  assert.match(plugin, /SQLiteFullException/);
  assert.match(plugin, /SQLiteCantOpenDatabaseException/);
  assert.match(plugin, /SQLiteDatabaseCorruptException/);
  assert.match(plugin, /SQLiteDiskIOException/);
  assert.match(plugin, /SQLiteReadOnlyDatabaseException/);
  assert.match(plugin, /call\.reject\(publicMessage\(reason\), reason, data\)/);
  assert.match(plugin, /data\.put\("reason", reason\)/);
  assert.match(plugin, /new StatFs/);
  assert.match(plugin, /storage\.put\("nativeStoreBytes", nativeStoreBytes\)/);
  assert.doesNotMatch(plugin, /safeMessage/);
});

test('settings storage refresh is lightweight and never opens or verifies SQLite', () => {
  const storageInfoStart = plugin.indexOf('public void storageInfo');
  const storageInfoEnd = plugin.indexOf('@PluginMethod', storageInfoStart + 1);
  assert.ok(
    storageInfoStart >= 0 && storageInfoEnd > storageInfoStart,
    'storageInfo method should be present'
  );
  assert.match(
    plugin.slice(Math.max(0, storageInfoStart - 40), storageInfoStart),
    /@PluginMethod\s*$/
  );
  const storageInfoBody = plugin.slice(storageInfoStart, storageInfoEnd);
  assert.match(storageInfoBody, /call\.resolve\(storageSnapshot\(\)\)/);
  assert.doesNotMatch(
    storageInfoBody,
    /\bdb\(\)|quickCheck|rowCount|rawQuery|getWritableDatabase/
  );

  const statusStart = plugin.indexOf('public void status');
  const statusBody = plugin.slice(statusStart, storageInfoStart);
  assert.match(statusBody, /quickCheck\(db\)/);
});

test('capacity allowlist loads before storage-core installs its public API', () => {
  const policyAt = shell.indexOf('<script src="storage-capacity-policy.js"></script>');
  const coreAt = shell.indexOf('<script src="storage-core.js"></script>');
  assert.ok(policyAt >= 0 && coreAt > policyAt);
});
