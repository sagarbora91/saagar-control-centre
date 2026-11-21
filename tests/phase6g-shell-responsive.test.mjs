import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { restorePrePhase6gShellAssets } from './lib/phase6g-shell-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'www/shell-responsive.css'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'www/shared/shell-responsive-runtime.js'), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);

function runtimeFixture(width = 360) {
  const attributes = {};
  const classes = new Set();
  const listeners = new Map();
  const window = {
    innerWidth: width,
    document: { documentElement: {
      clientWidth: width,
      setAttribute(name, value) { attributes[name] = value; },
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } }
    } },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); }
  };
  vm.runInNewContext(runtimeSource, { window, Object, Number, String });
  return { api: window.SaagarShellResponsive, window, attributes, classes, listeners };
}

test('shell runtime publishes exact physical tiers and resolves auto without widening ST_UI_MODE', () => {
  const fx = runtimeFixture();
  assert.equal(Object.isFrozen(fx.api), true);
  assert.deepEqual([639, 640, 899, 900, 1199, 1200].map(fx.api.classifyWidth),
    ['mobile', 'compact', 'compact', 'tablet', 'tablet', 'desktop']);
  assert.equal(fx.api.resolvedMode('auto', 899), 'mobile');
  assert.equal(fx.api.resolvedMode('auto', 900), 'desktop');
  assert.equal(fx.api.resolvedMode('mobile', 1365), 'mobile');
  assert.equal(fx.api.resolvedMode('desktop', 360), 'desktop');
  assert.equal(fx.api.resolvedMode('invalid', 640), 'mobile');
  assert.match(shell, /postMessage\(\{type:'ST_UI_MODE',mode:getUiMode\(\)\}/);
  assert.doesNotMatch(shell, /type:'ST_UI_MODE'[^\n]+preference|type:'ST_UI_MODE'[^\n]+tier/);
});

test('auto refresh updates root markers and preserves one removable resize listener', () => {
  const fx = runtimeFixture(639);
  const states = [];
  fx.api.onChange(state => states.push(state));
  fx.api.setPreference('auto');
  fx.api.start();
  assert.equal(fx.attributes['data-shell-tier'], 'mobile');
  assert.equal(fx.attributes['data-shell-ui-mode'], 'mobile');
  assert.equal(fx.classes.has('bcc-mobile'), true);
  fx.window.innerWidth = 1200;
  fx.listeners.get('resize')();
  assert.equal(fx.attributes['data-shell-tier'], 'desktop');
  assert.equal(fx.attributes['data-shell-ui-mode'], 'desktop');
  assert.equal(fx.classes.has('bcc-mobile'), false);
  assert.equal(states.at(-1).width, 1200);
  fx.api.stop();
  assert.equal(fx.listeners.has('resize'), false);
});

test('shell CSS covers all boundaries, containment, reachability and API-23 fallbacks', () => {
  for (const marker of ['max-width:639px', 'min-width:640px', 'max-width:899px', 'min-width:900px', 'min-width:1200px']) {
    assert.match(css.replaceAll(' ', ''), new RegExp(marker.replace(/[()]/g, '\\$&')));
  }
  assert.match(css, /html,body\{overflow-x:hidden\}/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /word-wrap:break-word;overflow-wrap:break-word;overflow-wrap:anywhere/);
  assert.match(css, /@supports not \(display:grid\)/);
  assert.match(css, /display:-webkit-flex;display:flex/);
  assert.match(css, /padding:24px 32px 30px;padding:24px clamp/);
});

test('shell retains twelve canonical routes, ETP ownership and both layout-toggle handlers', () => {
  const manifest = require('../www/module-manifest.js');
  assert.equal(manifest.modules.length, 12);
  const reports = shell.slice(shell.indexOf('id="reportsView"'), shell.indexOf('id="configView"'));
  const settings = shell.slice(shell.indexOf('id="configView"'), shell.indexOf('</main>'));
  assert.match(reports, /id="reportsEtpImportCard"/);
  assert.doesNotMatch(settings, /reportsEtpImportCard|navigateToModule\('etp'\)/);
  assert.match(shell, /data-action="toggle-ui-mode"[^>]+onclick="toggleUiMode\(\)"/);
  assert.match(shell, /data-action="toggle-module-ui-mode"[^>]+onclick="toggleUiMode\(\)"/);
});

test('historical helper reconstructs byte-exact pre-Phase6G shell authorities', () => {
  const restored = restorePrePhase6gShellAssets({
    index: shell,
    manifest: fs.readFileSync(path.join(root, 'www/shell-asset-manifest.js'), 'utf8')
  });
  assert.equal(Buffer.byteLength(restored.index), 577047);
  assert.equal(hash(restored.index), 'dc9a5832bcad119b5794df210bb95b40db15293b515f91b497045bd27d9d395c');
  assert.equal(Buffer.byteLength(restored.manifest), 1782);
  assert.equal(hash(restored.manifest), '4a2b046c3baa24434c11eb7c0ecffa8c2caac8617373a52bf75bdfd7f38fab78');
});
