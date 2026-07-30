import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = fs.readFileSync(path.join(root, 'www/storage-core.js'), 'utf8');

test('runtime flush writes only changed records in bounded native batches', async () => {
  class FakeStorage {
    constructor() {
      this.values = new Map();
    }
    getItem(key) {
      key = String(key);
      return this.values.has(key) ? this.values.get(key) : null;
    }
    setItem(key, value) {
      this.values.set(String(key), String(value));
    }
    removeItem(key) {
      this.values.delete(String(key));
    }
    clear() {
      this.values.clear();
    }
    key(index) {
      return [...this.values.keys()][index] ?? null;
    }
    get length() {
      return this.values.size;
    }
  }

  const batches = [];
  let beginCount = 0;
  let finishCount = 0;
  const nativeStore = {
    async status() {
      return { available: true, migrated: true, integrity: 'ok', rows: 0 };
    },
    async readPage() {
      return { rows: [], afterKeyId: '', done: true, bytes: 0 };
    },
    async beginMigration() {
      beginCount++;
      return { ready: true };
    },
    async finishMigration(request) {
      finishCount++;
      return { migrated: true, rows: request.expectedRows };
    },
    async applyBatch(request) {
      batches.push(structuredClone(request));
      assert.ok(request.ops.length <= 32);
      return { ok: true, changed: request.ops.length, rows: -1 };
    },
    async reset() {
      return { cleared: true };
    }
  };
  const filesystem = {
    async readFile() {
      throw new Error('not found');
    },
    async writeFile() {},
    async rename() {},
    async copy() {},
    async deleteFile() {}
  };
  const keystore = {
    async wrapKey() {
      return { wrapped: 'test-wrapped-key', backing: 'test' };
    }
  };
  const localStorage = new FakeStorage();
  const document = {
    readyState: 'interactive',
    visibilityState: 'visible',
    addEventListener() {}
  };
  const window = {
    Storage: FakeStorage,
    localStorage,
    crypto: webcrypto,
    Capacitor: {
      Plugins: {
        SaagarNativeStore: nativeStore,
        Filesystem: filesystem,
        SaagarKeystore: keystore
      }
    },
    addEventListener() {},
    dispatchEvent() {},
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(performance.now()), 0);
    }
  };
  const context = vm.createContext({
    window,
    document,
    location: { href: 'https://localhost/' },
    performance,
    TextEncoder,
    TextDecoder,
    StorageEvent: class {},
    Event: class {},
    Uint8Array,
    Map,
    Set,
    Promise,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Error,
    RegExp,
    setTimeout,
    clearTimeout,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    console: { log() {} }
  });
  vm.runInContext(core, context, { filename: 'storage-core.js' });

  await new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (window.SaagarStore?.ready()) return resolve();
      if (Date.now() - started > 2_000) return reject(new Error('native store did not become ready'));
      setTimeout(poll, 5);
    };
    poll();
  });

  localStorage.setItem('alpha', '{"value":1}');
  assert.equal(await window.SaagarStore.flush(), true);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].ops.length, 1);
  assert.equal(batches[0].ops[0].type, 'set');
  assert.match(batches[0].ops[0].keyId, /^[a-f0-9]{64}$/);
  assert.match(batches[0].ops[0].payload, /^SBKV1:/);

  for (let index = 0; index < 70; index++) {
    localStorage.setItem(`bulk-${index}`, `value-${index}`);
  }
  assert.equal(await window.SaagarStore.flush(), true);
  assert.equal(batches.slice(1).reduce((sum, batch) => sum + batch.ops.length, 0), 70);
  assert.ok(batches.slice(1).every(batch => batch.ops.length <= 32));

  const beforeBulk = batches.length;
  assert.equal(await window.SaagarStore.bulk(() => {
    localStorage.setItem('atomic-a', 'A');
    localStorage.setItem('atomic-b', 'B');
  }), true);
  const staged = batches.slice(beforeBulk);
  assert.equal(beginCount, 1);
  assert.equal(finishCount, 1);
  assert.ok(staged.length >= 3);
  assert.ok(staged.every(batch => batch.stage === true));
  assert.equal(staged.reduce((sum, batch) => sum + batch.ops.length, 0), 73);
  await window.SaagarStore._reset();
});
