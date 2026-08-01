import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policySource = fs.readFileSync(
  path.join(root, 'www/storage-recovery-policy.js'),
  'utf8'
);
const capacityPolicySource = fs.readFileSync(
  path.join(root, 'www/storage-capacity-policy.js'),
  'utf8'
);
const storageCoreSource = fs.readFileSync(
  path.join(root, 'www/storage-core.js'),
  'utf8'
);

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export async function waitFor(predicate, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1_000;
  const intervalMs = options.intervalMs ?? 5;
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(options.message || 'Timed out waiting for storage-core state');
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

class FakeElement {
  constructor(tagName, document) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = document;
    this.parentNode = null;
    this.children = [];
    this.style = { cssText: '' };
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.id = '';
    this.type = '';
    this.value = '';
    this._textContent = '';
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  addEventListener(type, listener) {
    this.listeners.set(String(type), listener);
  }

  click() {
    const listener = this.listeners.get('click');
    if (listener) listener({ currentTarget: this, target: this });
  }

  select() {}
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function createDocument() {
  const listeners = new Map();
  const document = {
    readyState: 'interactive',
    visibilityState: 'visible',
    body: null,
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    getElementById(id) {
      return descendants(document.body).find(element => element.id === id) || null;
    },
    addEventListener(type, listener) {
      listeners.set(String(type), listener);
    },
    execCommand(command) {
      return command === 'copy';
    },
    _listeners: listeners
  };
  document.body = new FakeElement('body', document);
  return document;
}

export function createStorageCoreHarness(options = {}) {
  class FakeStorage {
    constructor(initialValues = {}) {
      this.values = new Map(
        Object.entries(initialValues).map(([key, value]) => [String(key), String(value)])
      );
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

  const localStorage = new FakeStorage(options.initialStorage);
  const document = createDocument();
  const clipboardWrites = [];
  const location = {
    href: 'https://localhost/',
    reloadCalls: 0,
    reload() {
      this.reloadCalls++;
    }
  };
  const windowListeners = new Map();
  const plugins = { ...(options.plugins || {}) };
  if (Object.prototype.hasOwnProperty.call(options, 'nativeStore')) {
    if (options.nativeStore) plugins.SaagarNativeStore = options.nativeStore;
    else delete plugins.SaagarNativeStore;
  }

  const browser = {
    Storage: FakeStorage,
    localStorage,
    document,
    location,
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(String(text));
        }
      }
    },
    crypto: webcrypto,
    Capacitor: { Plugins: plugins },
    __BOOT_TIMEOUT_MS: options.bootTimeoutMs ?? 100,
    __SAAGAR_BUILD_ID: options.buildId || {
      appVersion: 'test-version',
      apkBuild: 'test-build'
    },
    addEventListener(type, listener) {
      windowListeners.set(String(type), listener);
    },
    dispatchEvent() {},
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(performance.now()), 0);
    },
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
  };
  browser.window = browser;

  const context = vm.createContext(browser);
  vm.runInContext(policySource, context, {
    filename: 'storage-recovery-policy.js'
  });
  vm.runInContext(capacityPolicySource, context, {
    filename: 'storage-capacity-policy.js'
  });
  vm.runInContext(storageCoreSource, context, {
    filename: 'storage-core.js'
  });

  return {
    context,
    window: browser,
    document,
    localStorage,
    location,
    clipboardWrites,
    rawStorage: localStorage.values,
    overlayButtons() {
      const overlay = document.getElementById('saagar-storage-blocked');
      return overlay
        ? descendants(overlay).filter(element => element.tagName === 'BUTTON')
        : [];
    }
  };
}
