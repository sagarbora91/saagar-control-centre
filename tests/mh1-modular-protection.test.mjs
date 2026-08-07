import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModuleBundle } from './lib/module-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = JSON.parse(fs.readFileSync(
  path.join(root, 'verification', 'MH1-MODULAR-PROTECTION-PROFILE.json'), 'utf8'
));
const modules = loadModuleBundle();
const moduleCss = fs.readFileSync(path.join(root, 'www', 'mobile-layout.css'), 'utf8');
const shellCss = fs.readFileSync(path.join(root, 'www', 'mobile-shell.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');

function topLevelBlockHeaders(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const headers = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '{') {
      if (depth === 0) headers.push(source.slice(start, i).trim());
      depth += 1;
    } else if (source[i] === '}') {
      depth -= 1;
      assert.ok(depth >= 0, 'responsive CSS must not close an unopened block');
      if (depth === 0) start = i + 1;
    }
  }
  assert.equal(depth, 0, 'responsive CSS must have balanced braces');
  assert.equal(source.slice(start).trim(), '', 'responsive CSS must not have trailing top-level declarations');
  return headers;
}

test('MH1 profile pins the complete viewport and language protection matrix', () => {
  assert.equal(profile.schemaVersion, 1);
  assert.deepEqual(profile.languages, ['en', 'mr', 'hi']);
  assert.deepEqual(
    profile.viewports.map(({ id, width, height, uiMode }) => ({ id, width, height, uiMode })),
    [
      { id: 'phone-360', width: 360, height: 800, uiMode: 'mobile' },
      { id: 'phone-412', width: 412, height: 915, uiMode: 'mobile' },
      { id: 'compact-800', width: 800, height: 600, uiMode: 'mobile' },
      { id: 'desktop-1365', width: 1365, height: 768, uiMode: 'desktop' }
    ]
  );
  assert.equal(
    profile.minimumVisualCases,
    profile.languages.length * profile.viewports.length * profile.surfaces.length
  );
  assert.equal(profile.baseline.visualBaselinesCaptured, false);
  assert.equal(profile.baseline.physicalDeviceAccepted, false);
});

test('MH1 inventory covers exactly the external module registry', () => {
  const expected = modules.map(module => ({ id: module.id, path: module.src }));
  const inventoried = profile.modules.map(module => ({ id: module.id, path: module.path }));
  assert.deepEqual(inventoried, expected);
  assert.equal(new Set(inventoried.map(module => module.id)).size, 11);
  for (const module of modules) {
    assert.equal(module.html_b64, undefined, `${module.id} must remain external`);
    assert.doesNotMatch(module.src, /^(?:[a-z]+:)?\/\//i, `${module.id} path must remain relative`);
    assert.equal(module.actualBytes, module.bytes, `${module.id} byte metadata`);
    assert.equal(module.actualSha256, module.sha256, `${module.id} hash metadata`);
  }
});

test('MH1 every module keeps offline responsive, language, and shell-bridge protection', () => {
  for (const module of modules) {
    assert.match(module.html, /<meta\s+name=["']viewport["']/i, `${module.id} viewport`);
    for (const asset of profile.commonModuleAssets) {
      assert.ok(module.html.includes(asset), `${module.id} must load ${asset}`);
    }
    for (const marker of profile.commonModuleMarkers) {
      assert.equal(
        (module.html.match(new RegExp(`id=["']${marker}["']`, 'g')) || []).length,
        1,
        `${module.id} must contain one ${marker}`
      );
    }
    assert.doesNotMatch(module.html, /<base\b/i, `${module.id} must not rewrite its base URL`);
    assert.doesNotMatch(module.html, /<(?:link|script)\b[^>]+(?:href|src)=["']https?:\/\//i, `${module.id} must remain offline`);
    assert.doesNotMatch(module.html, /@import\s+(?:url\()?\s*["']?https?:\/\//i, `${module.id} must not import remote CSS`);
  }
  const accessBridgeModules = modules
    .filter(module => /id=["']st-v5-module-access-bridge["']/.test(module.html))
    .map(module => module.id);
  assert.deepEqual(accessBridgeModules, profile.accessBridgeModules);
});

test('MH1 risk inventory owns review states and responsive containment for every module', () => {
  for (const module of profile.modules) {
    assert.match(module.risk, /^(?:medium|high)$/);
    assert.ok(module.reviewStates.length >= 3, `${module.id} review states`);
    assert.equal(new Set(module.reviewStates).size, module.reviewStates.length, `${module.id} review states must be unique`);
    assert.ok(module.responsiveSelectors.length > 0, `${module.id} responsive selectors`);
    for (const selector of module.responsiveSelectors) {
      assert.ok(moduleCss.includes(selector), `${module.id} missing responsive contract ${selector}`);
    }
  }
});

test('MH1 shared remediation cannot leak into wide desktop layout', () => {
  assert.deepEqual(topLevelBlockHeaders(moduleCss), [
    '@media (max-width: 640px)',
    '@media print',
    '@media (min-width: 641px) and (max-width: 920px)'
  ]);
  assert.deepEqual(topLevelBlockHeaders(shellCss), ['@media (max-width: 480px)']);
  const uncommentedShellCss = shellCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const shellMediaBody = uncommentedShellCss.slice(
    uncommentedShellCss.indexOf('{') + 1,
    uncommentedShellCss.lastIndexOf('}')
  );
  for (const header of topLevelBlockHeaders(shellMediaBody)) {
    for (const selector of header.split(',')) {
      assert.match(selector.trim(), /^html\.bcc-mobile\b/, `unscoped phone-shell selector: ${selector.trim()}`);
    }
  }
  assert.match(moduleCss, /html\.bcc-mobile/);
  assert.match(shell, /<link rel="stylesheet" href="mobile-shell\.css">/);
  assert.match(shell, /<link rel="stylesheet" href="settings-navigation\.css">/);
});

test('MH1 profile requires explicit evidence instead of inferring visual acceptance', () => {
  assert.equal(profile.baseline.visualBaselinesCaptured, false);
  assert.equal(profile.baseline.physicalDeviceAccepted, false);
  assert.ok(profile.surfaces.includes('settings-home'));
  assert.ok(profile.surfaces.includes('settings-detail'));
  assert.deepEqual(
    profile.modules.filter(module => module.risk === 'high').map(module => module.id),
    ['stock', 'service', 'qms', 'dsr', 'expense', 'cro_audit', 'payroll', 'leave', 'tax']
  );
});
