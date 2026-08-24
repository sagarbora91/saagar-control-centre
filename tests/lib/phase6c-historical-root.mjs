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
const PRE_PHASE6D_BRAND_TOKENS = `:root{
  --navy:#0d2340; --navy-mid:#1a3a5c; --navy-light:#264d7a;
  --gold:#b8922a; --gold-light:#d4a843; --gold-pale:#fdf6e3;
  --cream:#faf8f3; --paper:#ffffff;
  --red:#b91c1c; --red-pale:#fef2f2; --amber:#b45309; --amber-pale:#fffbeb;
  --green:#166534; --green-pale:#f0fdf4; --blue:#1d4ed8; --blue-pale:#eff6ff;
  --gray-50:#fafafa; --gray-100:#f4f4f5; --gray-200:#e4e4e7; --gray-300:#d4d4d8;
  --gray-400:#a1a1aa; --gray-500:#71717a; --gray-600:#52525b; --gray-700:#3f3f46; --gray-800:#27272a;
  --radius:12px; --radius-lg:16px;
  --font-sans:'DM Sans',system-ui,'Segoe UI',Roboto,Arial,sans-serif;
  --font-serif:'DM Serif Display',Georgia,'Times New Roman',serif;
}
`;

export function reconstructPhase6cBoundaryWww(workspaceRoot) {
  const manifestPath = path.join(workspaceRoot, 'www/module-manifest.js');
  let manifestSource = fs.readFileSync(manifestPath, 'utf8')
    .replace("input.sharedAssets.length !== 13", "input.sharedAssets.length !== 11")
    .replace("sharedAssets must contain exactly thirteen entries", "sharedAssets must contain exactly eleven entries");
  for (const entry of [
    "      ,{ id: 'module-responsive-css', file: 'shared/module-responsive.css' }\n",
    "      ,{ id: 'module-ui-runtime', file: 'shared/module-ui-runtime.js' }\n"
  ]) manifestSource = manifestSource.replace(entry, '');
  fs.writeFileSync(manifestPath, manifestSource, 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'www/shared/module-brand-tokens.css'), PRE_PHASE6D_BRAND_TOKENS, 'utf8');
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-responsive.css'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-ui-runtime.js'));
  const snapshot = readModuleManifestSource(workspaceRoot);
  snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => ![
    'module-responsive-css', 'module-ui-runtime'
  ].includes(item.id));
  const brandTokens = snapshot.data.sharedAssets.find(item => item.id === 'module-brand-tokens-css');
  const brandBytes = fs.readFileSync(path.join(workspaceRoot, 'www', brandTokens.file));
  brandTokens.bytes = brandBytes.length;
  brandTokens.sha256 = sha256(brandBytes);
  fs.writeFileSync(manifestPath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
  return workspaceRoot;
}

export function reconstructPrePhase6cWww(workspaceRoot) {
  reconstructPhase6cBoundaryWww(workspaceRoot);
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

export function createPhase6cBoundaryWorkspace(sourceRoot) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-phase6c-boundary-'));
  for (const entry of ['www', 'scripts', 'tests', 'verification']) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(target, entry), { recursive: true });
  }
  for (const file of ['package.json']) fs.copyFileSync(path.join(sourceRoot, file), path.join(target, file));
  reconstructPhase6cBoundaryWww(target);
  return target;
}
