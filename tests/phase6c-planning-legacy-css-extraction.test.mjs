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
import { restorePhase6dStockSource } from './lib/phase6e-stock-source.mjs';
import { restorePrePhase6h1EtpIndex } from './lib/phase6h1-etp-source.mjs';
import { restorePhase6eFamilyASource } from './lib/phase6f-family-a-source.mjs';
import { restorePrePhase6gFamilyBSource } from './lib/phase6g-family-b-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const restorePhase6dViewport = (moduleId, source) => moduleId === 'dsr' ? source.replace(
  'content="width=device-width, initial-scale=1.0"',
  'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"'
) : source;
const readModule = moduleId => fs.readFileSync(path.join(root, 'www/modules', moduleId, 'index.html'), 'utf8');
const restorePhase6eStock = (moduleId, source, workspaceRoot = root) => moduleId === 'stock'
  ? restorePhase6dStockSource(source, fs.readFileSync(path.join(workspaceRoot, 'www/modules/stock/stock-ui.css'), 'utf8'))
  : source;
const restorePhase6fFamilyA = (moduleId, source, workspaceRoot = root) => ['payroll', 'grooming', 'service'].includes(moduleId)
  ? restorePhase6eFamilyASource(moduleId, source, fs.readFileSync(path.join(workspaceRoot, `www/modules/${moduleId}/${moduleId}-ui.css`), 'utf8'))
  : source;
const restorePhase6gFamilyB = (moduleId, source, workspaceRoot = root) => {
  if (!['expense', 'leave', 'cro_audit', 'tax', 'dsr', 'qms'].includes(moduleId)) return source;
  const cssNames = { leave: 'leave-ui.css', cro_audit: 'cro-audit-ui.css', tax: 'tax-ui.css', dsr: 'dsr-ui.css', qms: 'qms-ui.css' };
  const css = cssNames[moduleId] ? fs.readFileSync(path.join(workspaceRoot, 'www/modules', moduleId, cssNames[moduleId]), 'utf8') : '';
  return restorePrePhase6gFamilyBSource(moduleId, source, css);
};
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

test('Planning legacy asset remains exact test-only historical authority and API-23 transformable', () => {
  const asset = fs.readFileSync(path.join(root, 'tests/fixtures/phase6c/module-mobile-legacy.css'));
  assert.equal(asset.length, LEGACY_ASSET_BYTES);
  assert.equal(sha256(asset), LEGACY_ASSET_SHA256);
  assert.equal(countTopLevelRules(asset.toString('utf8')), 191);
  const transformed = resolveCssVariables(asset.toString('utf8'), new Map());
  assert.equal(typeof transformed, 'string');
  assert.match(transformed, /\/\* base layer \(all modules\) \*\//);
});

test('the retired eleven-module rollout remains preserved by executable frozen evidence', () => {
  assert.equal(Object.keys(MODULE_BASELINE_SHA256).length, LEGACY_MODULE_ALLOWLIST.length);
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    assert.match(MODULE_BASELINE_SHA256[moduleId], /^[0-9a-f]{64}$/, moduleId);
  }
  assert.equal(fs.existsSync(path.join(root, 'www', LEGACY_ASSET)), false);
  assert.equal(fs.existsSync(path.join(root, 'tests/fixtures/phase6c/module-mobile-legacy.css')), true);
});

test('Planning production cascade records the completed Phase 6C retirement', () => {
  const planning = readModule('planning');
  const commonAt = planning.indexOf('<link rel="stylesheet" href="../../shared/module-mobile-common.css">');
  const bootAt = planning.indexOf('<script id="st-v5-mobile-boot">');
  assert.ok(commonAt >= 0 && bootAt > commonAt);
  assert.equal(planning.includes(legacyLink), false);
  assert.doesNotMatch(planning, /<style id="st-v5-mobile-css">/);
});

test('the retired eleven-module link rollout has no production consumers', () => {
  const retainedInlineDeltaModules = new Set(['qms', 'payroll']);
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const currentSource = readModule(moduleId);
    assert.equal(currentSource.includes('module-mobile-legacy.css'), false, moduleId);
    assert.equal(currentSource.includes('st-v5-mobile-css-delta'), retainedInlineDeltaModules.has(moduleId), moduleId);
  }
  assert.deepEqual(Object.keys(MODULE_DELTAS), ['service', 'qms', 'payroll']);
});

test('ETP remains byte-identical and unlinked', () => {
  const etp = restorePrePhase6h1EtpIndex(readModule('etp'));
  assert.equal(sha256(etp), ETP_BASELINE_SHA256);
  assert.equal(etp.includes('module-mobile-legacy.css'), false);
});

test('the production manifest and golden hashes record the retired Phase 6C identity', () => {
  const manifest = readModuleManifestSource(root).data;
  const legacyIndex = manifest.sharedAssets.findIndex(item => item.id === 'module-mobile-legacy-css');
  const commonIndex = manifest.sharedAssets.findIndex(item => item.id === 'module-mobile-common-css');
  assert.equal(legacyIndex, -1);
  assert.ok(commonIndex >= 0);
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
