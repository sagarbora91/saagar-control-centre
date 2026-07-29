import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const autoBackupSource = fs.readFileSync(path.join(rootDir, 'www/auto-backup.js'), 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; }
  };
}

function backupContext(filesystem, initialStorage = {}) {
  const localStorage = memoryStorage(initialStorage);
  const context = {
    localStorage,
    document: { readyState: 'loading', addEventListener() {} },
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Date,
    Math,
    JSON,
    Promise,
    Event,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    console: { log() {}, warn() {}, error() {} },
    dispatchEvent() {},
    addEventListener() {},
    Capacitor: {
      isNativePlatform() { return true; },
      Plugins: { Filesystem: filesystem }
    },
    SaagarStore: {
      seal() {
        return new Uint8Array([
          83, 66, 67, 67, 49, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ]);
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

test('ENG-02 full-disk backup failure keeps business data and never marks success', async () => {
  const writes = [];
  const filesystem = {
    readdir() { return Promise.resolve({ files: [] }); },
    writeFile(request) {
      writes.push(request.path);
      return Promise.reject(new Error('ENOSPC: simulated full disk'));
    },
    deleteFile() { return Promise.resolve(); }
  };
  const context = backupContext(filesystem, {
    gm_expenses: '[{"id":"must-survive","amount":123}]'
  });
  vm.runInContext(autoBackupSource, context, { filename: 'auto-backup.js' });

  const result = await context.SaagarBackup.now();
  const status = context.SaagarBackup.status();
  assert.equal(result.ok, false);
  assert.match(String(result.error?.message), /ENOSPC/);
  assert.equal(context.localStorage.getItem('gm_expenses'), '[{"id":"must-survive","amount":123}]');
  assert.equal(context.localStorage.getItem('bcc_autobackup_last'), null);
  assert.equal(status.lastBackup, 'never');
  assert.equal(status.consecutiveFailures, 1);
  assert.equal(status.recent[0].ok, false);
  assert.deepEqual(
    writes,
    ['SaagarBCC-Backups/backup-' + new Date().toISOString().slice(0, 10) + '.json']
  );
});

test('ENG-02 incomplete filesystem capability fails closed without a false backup marker', async () => {
  const context = backupContext({
    writeFile() { return Promise.reject(new Error('simulated provider failure')); }
  }, {
    payroll_suite_v1_2026: '{"rows":[{"empId":"E1"}]}'
  });
  vm.runInContext(autoBackupSource, context, { filename: 'auto-backup.js' });

  const result = await context.SaagarBackup.now();
  assert.equal(result.ok, false);
  assert.equal(context.localStorage.getItem('bcc_autobackup_last'), null);
  assert.match(context.SaagarBackup.status().recent[0].error, /provider failure/);
});
