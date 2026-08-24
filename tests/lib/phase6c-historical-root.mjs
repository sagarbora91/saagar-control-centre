import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LEGACY_ASSET,
  LEGACY_MODULE_ALLOWLIST,
  MODULE_BASELINE_SHA256,
  restoreMigratedLegacySource
} from '../../scripts/prepare-phase6c-mobile-legacy-css.mjs';
import { readModuleManifestSource, renderModuleManifestSource } from '../../scripts/lib/module-manifest-source.mjs';
import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const ETP_SHA256 = 'b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12';

export function reconstructPrePhase6cWww(workspaceRoot) {
  const etpPath = path.join(workspaceRoot, 'www/modules/etp/index.html');
  const etpBefore = fs.readFileSync(etpPath);
  if (sha256(etpBefore) !== ETP_SHA256 || etpBefore.includes(Buffer.from('module-mobile-legacy.css'))) {
    throw new Error('ETP is not the frozen unlinked Phase 6C exclusion authority');
  }
  const authorityPath = path.join(workspaceRoot, 'www', LEGACY_ASSET);
  const authority = fs.readFileSync(authorityPath, 'utf8');
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const file = path.join(workspaceRoot, 'www/modules', moduleId, 'index.html');
    const restored = restoreMigratedLegacySource(moduleId, fs.readFileSync(file, 'utf8'), authority);
    fs.writeFileSync(file, restored, 'utf8');
    if (sha256(Buffer.from(restored)) !== MODULE_BASELINE_SHA256[moduleId]) {
      throw new Error(`${moduleId} did not reconstruct to its pre-Phase6C authority`);
    }
  }
  fs.rmSync(authorityPath);

  const manifestPath = path.join(workspaceRoot, 'www/module-manifest.js');
  let manifestSource = fs.readFileSync(manifestPath, 'utf8')
    .replace("input.sharedAssets.length !== 11", "input.sharedAssets.length !== 10")
    .replace("sharedAssets must contain exactly eleven entries", "sharedAssets must contain exactly ten entries")
    .replace("      ,{ id: 'module-mobile-legacy-css', file: 'shared/module-mobile-legacy.css' }\n", '');
  fs.writeFileSync(manifestPath, manifestSource, 'utf8');
  const snapshot = readModuleManifestSource(workspaceRoot);
  snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => item.id !== 'module-mobile-legacy-css');
  for (const module of snapshot.data.modules) {
    if (!LEGACY_MODULE_ALLOWLIST.includes(module.id)) continue;
    const bytes = fs.readFileSync(path.join(workspaceRoot, 'www', module.file));
    module.bytes = bytes.length;
    module.sha256 = sha256(bytes);
  }
  fs.writeFileSync(manifestPath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
  const etpAfter = fs.readFileSync(etpPath);
  if (!etpAfter.equals(etpBefore) || sha256(etpAfter) !== ETP_SHA256 || etpAfter.includes(Buffer.from('module-mobile-legacy.css'))) {
    throw new Error('ETP changed while reconstructing pre-Phase6C authority');
  }
  return workspaceRoot;
}

export function createPrePhase6cWorkspace(sourceRoot) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-pre-phase6c-'));
  for (const entry of ['www', 'scripts', 'tests', 'verification']) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(target, entry), { recursive: true });
  }
  for (const file of ['package.json']) fs.copyFileSync(path.join(sourceRoot, file), path.join(target, file));
  reconstructPrePhase6cWww(target);
  return target;
}
