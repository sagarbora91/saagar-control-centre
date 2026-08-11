import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'www/shared/shell-module-frame-controller.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');

function fixture(overrides = {}) {
  const listeners = {};
  const classes = new Set(['hidden']);
  const elements = {
    activeTitle: {}, activeSub: {},
    mainContent: { style: { setProperty(name, value) { this[name] = value; } } },
    moduleScreen: { classList: { remove(value) { classes.delete(value); } } },
    botnav: { classList: { add(value) { classes.add(value); } } },
    loader: { classList: { add(value) { classes.add(`loader:${value}`); }, remove(value) { classes.delete(`loader:${value}`); } } },
    moduleFrame: {
      attributes: { srcdoc: true },
      addEventListener(type, handler) { listeners[type] = handler; },
      removeAttribute(name) { delete this.attributes[name]; }
    }
  };
  const calls = [];
  const timers = [];
  const window = {
    setTimeout(handler, delay) { timers.push({ handler, delay }); return timers.length; },
    clearTimeout() {},
    SaagarMah4Runtime: null
  };
  const context = vm.createContext({ window });
  vm.runInContext(source, context, { filename: 'shell-module-frame-controller.js' });
  const shell = {
    moduleById: id => id === 'stock' || id === 'payroll' ? { id, title: id, category: 'Operations', priority: 'High', src: `modules/${id}/index.html` } : null,
    allowSensitiveDeviceAction: () => true,
    ensureModuleAccess: () => true,
    seedModuleFromMaster: id => calls.push(['seed', id]), logActivity: id => calls.push(['activity', id]),
    auditLog: (...args) => calls.push(['audit', ...args]), sensitiveViews: ['stock'],
    currentRole: () => 'Owner', isAdmin: () => true,
    setActiveModuleId: id => calls.push(['active', id]), setSecureWindowForModule: id => calls.push(['secure', id]),
    element: id => elements[id], hideModuleLoadError: () => calls.push(['hideError']),
    activeModuleId: () => 'stock', activeView: () => 'module', renderHome: () => calls.push(['renderHome']),
    moduleHost: () => null, setModuleHost: host => calls.push(['host', host]), takeModuleCloseNext: () => null,
    showMainView: value => calls.push(['main', value]), applyDateToFrame: () => calls.push(['date']),
    applyLangToFrame: lang => calls.push(['lang', lang]), getLang: () => 'en',
    notifyModuleAccessChanged: () => calls.push(['accessChanged']), viewDate: () => '2026-08-11', getUiMode: () => 'mobile',
    clearPendingTarget: () => calls.push(['clearTarget']), showModuleLoadError: id => calls.push(['loadError', id]),
    escapeHtml: value => String(value), toast: message => calls.push(['toast', message]),
    ...overrides
  };
  return { controller: window.SaagarShellModuleFrameController, shell, calls, timers, listeners, elements };
}

test('shell module frame controller is immutable and versioned', () => {
  const { controller } = fixture();
  assert.equal(controller.version, 1);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(typeof controller.open, 'function');
});

test('shell controller has one local versioned byte authority loaded before it', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'www/shell-asset-manifest.js'), 'utf8'), context);
  const manifest = context.window.SaagarShellAssetManifest;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(Object.isFrozen(manifest), true);
  assert.deepEqual(Array.from(manifest.assets, asset => asset.id), [
    'shell-module-frame-controller', 'shell-core-css', 'shell-features-css',
    'shell-fonts-css', 'shell-mobile-css', 'shell-redesign-css', 'shell-report-css'
  ]);
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync(path.join(root, 'www', asset.file));
    assert.equal(asset.version, 1, asset.id);
    assert.equal(asset.bytes, bytes.length, asset.id);
    assert.equal(asset.sha256, crypto.createHash('sha256').update(bytes).digest('hex'), asset.id);
  }
  assert.ok(shell.indexOf('<script src="shell-asset-manifest.js"></script>') < shell.indexOf('<script src="shared/shell-module-frame-controller.js"></script>'));
});

test('shell module frame controller fail-closes sensitive device and access gates', () => {
  const device = fixture({ allowSensitiveDeviceAction: () => false });
  device.controller.open('payroll', device.shell);
  assert.equal(device.timers.length, 0);
  assert.match(device.calls.find(call => call[0] === 'toast')[1], /restricted/);

  const access = fixture({ ensureModuleAccess: () => false });
  access.controller.open('stock', access.shell);
  assert.equal(access.timers.length, 0);
  assert.equal(access.calls.some(call => call[0] === 'activity'), false);
});

test('shell module frame controller opens only canonical src and completes the load lifecycle', () => {
  const fx = fixture();
  fx.controller.open('stock', fx.shell);
  assert.deepEqual(fx.calls.slice(0, 4).map(call => call[0]), ['seed', 'activity', 'audit', 'active']);
  assert.equal(fx.timers[0].delay, 50);
  fx.timers[0].handler();
  assert.equal(fx.elements.moduleFrame.src, 'modules/stock/index.html');
  assert.equal('srcdoc' in fx.elements.moduleFrame.attributes, false);
  assert.equal(fx.timers[1].delay, 9000);
  fx.listeners.load();
  for (const name of ['date', 'lang', 'accessChanged', 'clearTarget']) {
    assert.equal(fx.calls.some(call => call[0] === name), true, name);
  }
});

test('shell module frame controller surfaces frame errors and missing sources', () => {
  const errored = fixture();
  errored.controller.open('stock', errored.shell);
  errored.timers[0].handler();
  errored.listeners.error();
  assert.deepEqual(errored.calls.find(call => call[0] === 'loadError'), ['loadError', 'stock']);

  const missing = fixture({ moduleById: () => ({ id: 'stock', title: 'Stock', category: '', priority: '', src: '' }) });
  missing.controller.open('stock', missing.shell);
  missing.timers[0].handler();
  assert.match(missing.elements.moduleFrame.srcdoc, /Could not open module/);
});
