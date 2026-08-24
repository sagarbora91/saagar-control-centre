#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEGACY_MODULE_ALLOWLIST = Object.freeze([
  'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
  'cro_audit', 'payroll', 'leave', 'tax', 'planning'
]);
export const PLANNING_PROOF_MODULES = Object.freeze(['planning']);
export const LEGACY_ASSET = 'shared/module-mobile-legacy.css';
export const LEGACY_ASSET_BYTES = 24977;
export const LEGACY_ASSET_SHA256 = 'acc970dbe54fb99b0dfa25a2807fb3626ba11130fcd87969ca336d8000efa443';
export const PLANNING_BASELINE_SHA256 = '8fd35c2046b49034f0bb293b513dbf51a69e76054ebe12a4f0b8915a330aef4c';
export const ETP_BASELINE_SHA256 = 'b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12';

const styleOpen = '<style id="st-v5-mobile-css">';
const stylePattern = /<style id="st-v5-mobile-css">([\s\S]*?)<\/style>/;
const legacyLink = '<link id="st-v5-mobile-css" rel="stylesheet" href="../../shared/module-mobile-legacy.css">';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function modulePath(workspaceRoot, moduleId) {
  return path.join(workspaceRoot, 'www', 'modules', moduleId, 'index.html');
}

function assertFrozenAuthority(body) {
  const bytes = Buffer.byteLength(body);
  const digest = sha256(body);
  if (bytes !== LEGACY_ASSET_BYTES || digest !== LEGACY_ASSET_SHA256) {
    throw new Error(`Planning legacy CSS authority drift: ${bytes} bytes ${digest}`);
  }
}

export function preparePlanningProof({ workspaceRoot = root } = {}) {
  const before = new Map(LEGACY_MODULE_ALLOWLIST
    .filter(moduleId => moduleId !== 'planning')
    .map(moduleId => [moduleId, fs.readFileSync(modulePath(workspaceRoot, moduleId))]));
  const etpPath = modulePath(workspaceRoot, 'etp');
  const etpBefore = fs.readFileSync(etpPath);
  if (sha256(etpBefore) !== ETP_BASELINE_SHA256) throw new Error('ETP baseline drift before Phase 6C preparation');

  const planningPath = modulePath(workspaceRoot, 'planning');
  let planning = fs.readFileSync(planningPath, 'utf8');
  const inline = planning.match(stylePattern);
  let authority;
  if (inline) {
    if (sha256(planning) !== PLANNING_BASELINE_SHA256) throw new Error('Planning baseline drift before Phase 6C preparation');
    authority = inline[1];
    assertFrozenAuthority(authority);
    planning = planning.replace(inline[0], legacyLink);
    fs.writeFileSync(planningPath, planning, 'utf8');
  } else {
    if (!planning.includes(legacyLink) || planning.includes(styleOpen)) {
      throw new Error('Planning is neither the frozen inline baseline nor the staged legacy-link proof');
    }
    authority = fs.readFileSync(path.join(workspaceRoot, 'www', LEGACY_ASSET), 'utf8');
    assertFrozenAuthority(authority);
  }

  const assetPath = path.join(workspaceRoot, 'www', LEGACY_ASSET);
  fs.writeFileSync(assetPath, authority, 'utf8');
  const assetBytes = fs.readFileSync(assetPath);
  assertFrozenAuthority(assetBytes);

  const snapshot = readModuleManifestSource(workspaceRoot);
  const data = snapshot.data;
  data.sharedAssets = data.sharedAssets.filter(item => item.id !== 'module-mobile-legacy-css');
  const commonIndex = data.sharedAssets.findIndex(item => item.id === 'module-mobile-common-css');
  if (commonIndex < 0) throw new Error('module-mobile-common-css manifest authority missing');
  data.sharedAssets.splice(commonIndex + 1, 0, {
    id: 'module-mobile-legacy-css', version: 1, file: LEGACY_ASSET,
    bytes: assetBytes.length, sha256: sha256(assetBytes)
  });
  const planningEntry = data.modules.find(item => item.id === 'planning');
  if (!planningEntry) throw new Error('Planning manifest entry missing');
  const planningBytes = fs.readFileSync(planningPath);
  planningEntry.bytes = planningBytes.length;
  planningEntry.sha256 = sha256(planningBytes);
  fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, data), 'utf8');

  const goldenPath = path.join(workspaceRoot, 'verification', 'module-build-golden-hashes.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  golden.planning = { bytes: planningBytes.length, sha256: sha256(planningBytes) };
  fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');

  for (const [moduleId, bytes] of before) {
    if (!fs.readFileSync(modulePath(workspaceRoot, moduleId)).equals(bytes)) throw new Error(`${moduleId} changed during Planning-only preparation`);
  }
  const etpAfter = fs.readFileSync(etpPath);
  if (!etpAfter.equals(etpBefore) || sha256(etpAfter) !== ETP_BASELINE_SHA256) {
    throw new Error('ETP changed during Planning-only preparation');
  }
  return { stage: 'planning-proof', modules: PLANNING_PROOF_MODULES, asset: LEGACY_ASSET, bytes: assetBytes.length, sha256: sha256(assetBytes) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(preparePlanningProof())}\n`);
}
