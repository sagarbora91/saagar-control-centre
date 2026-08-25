import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolveCssVariables, transformJavaScriptAsset } from '../scripts/prepare-api23-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = path.join(root, 'www', 'shared');
const tokenSource = fs.readFileSync(path.join(shared, 'module-brand-tokens.css'), 'utf8');
const responsiveSource = fs.readFileSync(path.join(shared, 'module-responsive.css'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(shared, 'module-ui-runtime.js'), 'utf8');
const moduleRoot = path.join(root, 'www', 'modules');

function runtimeFixture(width = 639) {
  const listeners = new Map();
  const window = {
    innerWidth: width,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); }
  };
  vm.runInNewContext(runtimeSource, { window, console });
  const attrs = new Map();
  const element = {
    clientWidth: width,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    removeAttribute(name) { attrs.delete(name); }
  };
  return { api: window.SaagarUiFoundation, window, listeners, attrs, element };
}

test('Phase 6D freezes additive brand, spacing, typography and metric tokens', () => {
  for (const token of [
    '--navy:#0d2340', '--gold:#b8922a', '--radius:12px', '--font-sans:',
    '--space-1:4px', '--space-12:48px', '--type-floor:16px', '--line-normal:1.45',
    '--control-height:44px', '--touch-target:44px', '--modal-max-width:720px',
    '--grid-row-height:44px', '--focus-ring:', '--z-modal:100'
  ]) assert.ok(tokenSource.includes(token), token);
});

test('responsive contract is fully opt-in and publishes four explicit tiers plus auto', () => {
  const rules = responsiveSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^\{]+\{/g, '').match(/(?:^|})\s*([^@][^{]*)\{/g) || [];
  for (const rule of rules) assert.match(rule, /\[data-saagar-ui\]/, rule);
  for (const tier of ['mobile','compact','tablet','desktop']) {
    assert.match(responsiveSource, new RegExp(`data-saagar-width-resolved="${tier}"`));
  }
  for (const boundary of ['max-width:639px','min-width:640px','max-width:899px','min-width:900px','max-width:1199px','min-width:1200px']) {
    assert.ok(responsiveSource.includes(boundary), boundary);
  }
  assert.match(responsiveSource, /data-saagar-width="auto"/);
});

test('width classifier is exact at every governed boundary', () => {
  const { api } = runtimeFixture();
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.modes), true);
  assert.deepEqual(Array.from(api.modes), ['auto','mobile','compact','tablet','desktop']);
  assert.deepEqual([639,640,899,900,1199,1200].map(value => api.classifyWidth(value)),
    ['mobile','compact','compact','tablet','tablet','desktop']);
  assert.throws(() => api.classifyWidth(-1), /non-negative finite/);
});

test('auto mode is opt-in, refreshes on resize and destroy restores prior attributes', () => {
  const fx = runtimeFixture(639);
  fx.element.setAttribute('data-saagar-ui', 'legacy');
  const control = fx.api.configure(fx.element, { mode: 'auto' });
  assert.equal(fx.attrs.get('data-saagar-ui'), '');
  assert.equal(fx.attrs.get('data-saagar-width'), 'auto');
  assert.equal(fx.attrs.get('data-saagar-width-resolved'), 'mobile');
  assert.equal(fx.listeners.has('resize'), true);
  fx.window.innerWidth = 1200;
  fx.listeners.get('resize')();
  assert.equal(fx.attrs.get('data-saagar-width-resolved'), 'desktop');
  control.destroy();
  assert.equal(fx.attrs.get('data-saagar-ui'), 'legacy');
  assert.equal(fx.attrs.has('data-saagar-width'), false);
  assert.equal(fx.attrs.has('data-saagar-width-resolved'), false);
  assert.equal(fx.listeners.has('resize'), false);
});

test('explicit mode needs no viewport listener and invalid modes fail closed', () => {
  const fx = runtimeFixture(1200);
  const control = fx.api.configure(fx.element, { mode: 'compact' });
  assert.equal(control.refresh(), 'compact');
  assert.equal(fx.attrs.get('data-saagar-width-resolved'), 'compact');
  assert.equal(fx.listeners.size, 0);
  assert.throws(() => fx.api.configure(fx.element, { mode: 'wide' }), /unsupported width mode/);
  assert.throws(() => fx.api.configure({}, { mode: 'auto' }), /root must be an element/);
});

test('responsive foundation adoption is bounded through Phase 6G Family B', () => {
  const adopted = new Set(['stock', 'payroll', 'grooming', 'service', 'expense', 'leave', 'cro_audit', 'tax', 'dsr', 'qms']);
  const files = fs.readdirSync(moduleRoot).map(id => path.join(moduleRoot, id, 'index.html'));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const moduleId = path.basename(path.dirname(file));
    if (adopted.has(moduleId)) {
      assert.match(source, /module-responsive\.css/);
      assert.match(source, /module-ui-runtime\.js/);
      continue;
    }
    assert.doesNotMatch(source, /module-(?:responsive\.css|ui-runtime\.js)/, file);
  }
  const etp = fs.readFileSync(path.join(moduleRoot, 'etp', 'index.html'), 'utf8');
  assert.match(etp, /accessContext:false/);
  assert.doesNotMatch(etp, /module-mobile-legacy\.css/);
});

test('API-23 generation down-levels the opt-in runtime and resolves governed token fallbacks', () => {
  const generatedRuntime = transformJavaScriptAsset(runtimeSource, 'module-ui-runtime.js', 'shared/module-ui-runtime.js');
  assert.doesNotMatch(generatedRuntime, /\b(?:const|let)\b|=>/);
  assert.match(generatedRuntime, /SaagarUiFoundation/);
  const resolved = resolveCssVariables('.probe{min-height:var(--control-height,44px)}', new Map([['control-height', '44px']]));
  assert.equal(resolved, '.probe{min-height:44px}');
});
