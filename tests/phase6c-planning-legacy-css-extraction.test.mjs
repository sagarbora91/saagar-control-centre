import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveCssVariables } from '../scripts/prepare-api23-assets.mjs';
import {
  ETP_BASELINE_SHA256,
  LEGACY_ASSET,
  LEGACY_ASSET_BYTES,
  LEGACY_ASSET_SHA256,
  LEGACY_MODULE_ALLOWLIST,
  LEGACY_ROLLOUT_MODULES,
  MODULE_BASELINE_SHA256,
  MODULE_DELTAS,
  PLANNING_BASELINE_SHA256,
  PLANNING_PROOF_MODULES,
  prepareLegacyRollout,
  reconstructLegacyInlineBody,
  renderLegacyDeltaStyle
} from '../scripts/prepare-phase6c-mobile-legacy-css.mjs';
import { readModuleManifestSource } from '../scripts/lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const readModule = moduleId => fs.readFileSync(path.join(root, 'www/modules', moduleId, 'index.html'), 'utf8');
const legacyLink = '<link id="st-v5-mobile-css" rel="stylesheet" href="../../shared/module-mobile-legacy.css">';

function countTopLevelRules(source) {
  let depth = 0;
  let rules = 0;
  let quote = null;
  let comment = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (comment) {
      if (char === '*' && next === '/') { comment = false; index++; }
      continue;
    }
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') { comment = true; index++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') { if (depth === 0) rules++; depth++; }
    if (char === '}') { depth--; assert.ok(depth >= 0, 'CSS closes beyond its root'); }
  }
  assert.equal(comment, false);
  assert.equal(quote, null);
  assert.equal(depth, 0);
  return rules;
}

test('Phase 6C freezes and migrates exactly the explicit eleven-module boundary', () => {
  assert.deepEqual(LEGACY_MODULE_ALLOWLIST, [
    'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
    'cro_audit', 'payroll', 'leave', 'tax', 'planning'
  ]);
  assert.deepEqual(PLANNING_PROOF_MODULES, ['planning']);
  assert.deepEqual(LEGACY_ROLLOUT_MODULES, LEGACY_MODULE_ALLOWLIST);
  assert.equal(LEGACY_MODULE_ALLOWLIST.includes('etp'), false);
});

test('Planning legacy asset is the exact frozen 24,977-byte authority and remains API-23 transformable', () => {
  const asset = fs.readFileSync(path.join(root, 'www', LEGACY_ASSET));
  assert.equal(asset.length, LEGACY_ASSET_BYTES);
  assert.equal(sha256(asset), LEGACY_ASSET_SHA256);
  assert.equal(countTopLevelRules(asset.toString('utf8')), 191);
  const transformed = resolveCssVariables(asset.toString('utf8'), new Map());
  assert.equal(typeof transformed, 'string');
  assert.match(transformed, /\/\* base layer \(all modules\) \*\//);
});

test('the eleven-module rollout is executable and idempotent in an isolated reconstructed fixture', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-phase6c-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'www'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'verification'), { recursive: true });
  fs.cpSync(path.join(root, 'www/modules'), path.join(fixture, 'www/modules'), { recursive: true });
  fs.cpSync(path.join(root, 'www/shared'), path.join(fixture, 'www/shared'), { recursive: true });
  fs.copyFileSync(path.join(root, 'www/module-manifest.js'), path.join(fixture, 'www/module-manifest.js'));
  fs.copyFileSync(path.join(root, 'verification/module-build-golden-hashes.json'), path.join(fixture, 'verification/module-build-golden-hashes.json'));

  const fixtureAsset = fs.readFileSync(path.join(fixture, 'www', LEGACY_ASSET), 'utf8');
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const moduleFile = path.join(fixture, 'www/modules', moduleId, 'index.html');
    const staged = fs.readFileSync(moduleFile, 'utf8');
    const migrated = legacyLink + renderLegacyDeltaStyle(moduleId);
    const inline = `<style id="st-v5-mobile-css">${reconstructLegacyInlineBody(moduleId, fixtureAsset)}</style>`;
    fs.writeFileSync(moduleFile, staged.replace(migrated, inline), 'utf8');
    assert.equal(sha256(fs.readFileSync(moduleFile)), MODULE_BASELINE_SHA256[moduleId], moduleId);
  }

  const first = prepareLegacyRollout({ workspaceRoot: fixture });
  const receiptPaths = [
    ...LEGACY_MODULE_ALLOWLIST.map(moduleId => `www/modules/${moduleId}/index.html`),
    'www/shared/module-mobile-legacy.css',
    'www/module-manifest.js', 'verification/module-build-golden-hashes.json'
  ];
  const firstBytes = new Map(receiptPaths.map(file => [file, fs.readFileSync(path.join(fixture, file))]));
  const second = prepareLegacyRollout({ workspaceRoot: fixture });
  assert.deepEqual(second, first);
  for (const [file, bytes] of firstBytes) assert.equal(fs.readFileSync(path.join(fixture, file)).equals(bytes), true, file);
});

test('Planning replaces only the inline authority at the exact common -> legacy -> boot cascade position', () => {
  const planning = readModule('planning');
  const commonAt = planning.indexOf('<link rel="stylesheet" href="../../shared/module-mobile-common.css">');
  const legacyAt = planning.indexOf(legacyLink);
  const bootAt = planning.indexOf('<script id="st-v5-mobile-boot">');
  assert.ok(commonAt >= 0 && legacyAt > commonAt && bootAt > legacyAt);
  assert.equal(planning.split(legacyLink).length - 1, 1);
  assert.doesNotMatch(planning, /<style id="st-v5-mobile-css">/);

  const asset = fs.readFileSync(path.join(root, 'www', LEGACY_ASSET), 'utf8');
  const reconstructed = planning.replace(legacyLink, `<style id="st-v5-mobile-css">${asset}</style>`);
  assert.equal(sha256(reconstructed), PLANNING_BASELINE_SHA256);
});

test('all eleven modules use one canonical link and only Service, QMS and Payroll retain bounded deltas', () => {
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const source = readModule(moduleId);
    assert.equal(source.split(legacyLink).length - 1, 1, moduleId);
    assert.doesNotMatch(source, /<style id="st-v5-mobile-css">/, moduleId);
    const expectedDelta = renderLegacyDeltaStyle(moduleId);
    assert.equal(source.includes('st-v5-mobile-css-delta'), Boolean(expectedDelta), moduleId);
    if (expectedDelta) assert.equal(source.split(expectedDelta).length - 1, 1, moduleId);
    const reconstructed = source.replace(legacyLink + expectedDelta,
      `<style id="st-v5-mobile-css">${reconstructLegacyInlineBody(moduleId, fs.readFileSync(path.join(root, 'www', LEGACY_ASSET), 'utf8'))}</style>`);
    assert.equal(sha256(reconstructed), MODULE_BASELINE_SHA256[moduleId], moduleId);
  }
  assert.deepEqual(Object.keys(MODULE_DELTAS), ['service', 'qms', 'payroll']);
});

test('ETP remains byte-identical and unlinked', () => {
  const etp = readModule('etp');
  assert.equal(sha256(etp), ETP_BASELINE_SHA256);
  assert.equal(etp.includes('module-mobile-legacy.css'), false);
});

test('manifest and golden identities pin every migrated module byte', () => {
  const manifest = readModuleManifestSource(root).data;
  const legacyIndex = manifest.sharedAssets.findIndex(item => item.id === 'module-mobile-legacy-css');
  const commonIndex = manifest.sharedAssets.findIndex(item => item.id === 'module-mobile-common-css');
  assert.equal(legacyIndex, commonIndex + 1);
  assert.deepEqual(manifest.sharedAssets[legacyIndex], {
    id: 'module-mobile-legacy-css', version: 1, file: LEGACY_ASSET,
    bytes: LEGACY_ASSET_BYTES, sha256: LEGACY_ASSET_SHA256
  });
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'verification/module-build-golden-hashes.json'), 'utf8'));
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const bytes = fs.readFileSync(path.join(root, 'www/modules', moduleId, 'index.html'));
    const entry = manifest.modules.find(item => item.id === moduleId);
    assert.equal(entry.bytes, bytes.length, moduleId);
    assert.equal(entry.sha256, sha256(bytes), moduleId);
    assert.equal(golden[moduleId].bytes, bytes.length, moduleId);
    assert.equal(golden[moduleId].sha256, sha256(bytes), moduleId);
  }
});
