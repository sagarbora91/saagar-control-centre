#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createWwwFingerprint } from './mah3-visual-review-server.mjs';
import { readModuleManifestSource } from './lib/module-manifest-source.mjs';
import { ETP_BASELINE_SHA256, LEGACY_ASSET, LEGACY_MODULE_ALLOWLIST, MODULE_DELTAS } from './prepare-phase6c-mobile-legacy-css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PHASE6C_PROFILE_PATH = 'verification/audit/PHASE-6C-CURRENT-SOURCE-PROFILE-2026-08-24.json';
export const PHASE6C_VISUAL_RECEIPT_PATH = 'verification/audit/PHASE-6C-PLANNING-VISUAL-RECEIPT-2026-08-24.json';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const receipt = (workspaceRoot, relativePath) => {
  const bytes = fs.readFileSync(path.join(workspaceRoot, relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
};

export function buildPhase6cCurrentProfile(workspaceRoot = root, options = {}) {
  const manifest = readModuleManifestSource(workspaceRoot).data;
  const fingerprint = createWwwFingerprint(workspaceRoot);
  const legacyHref = '../../shared/module-mobile-legacy.css';
  const modules = LEGACY_MODULE_ALLOWLIST.map(moduleId => {
    const file = `www/modules/${moduleId}/index.html`;
    const bytes = fs.readFileSync(path.join(workspaceRoot, file));
    const source = bytes.toString('utf8');
    return {
      moduleId, file, bytes: bytes.length, sha256: sha256(bytes),
      legacyImports: source.split(legacyHref).length - 1,
      deltaStyle: source.includes('id="st-v5-mobile-css-delta"'),
      expectedDelta: Object.hasOwn(MODULE_DELTAS, moduleId)
    };
  });
  const etp = fs.readFileSync(path.join(workspaceRoot, 'www/modules/etp/index.html'));
  const asset = fs.readFileSync(path.join(workspaceRoot, 'www', LEGACY_ASSET));
  return {
    schemaVersion: 1,
    profileId: 'phase6c-current-source-2026-08-24',
    sourceProductCommit: options.sourceProductCommit || execFileSync('git', ['log', '-1', '--format=%H', '--', 'www'], { cwd: workspaceRoot, encoding: 'utf8' }).trim(),
    sourceFingerprint: {
      algorithm: fingerprint.algorithm,
      fileCount: fingerprint.fileCount,
      totalBytes: fingerprint.totalBytes,
      treeSha256: fingerprint.treeSha256
    },
    manifest: receipt(workspaceRoot, 'www/module-manifest.js'),
    legacyAsset: { file: `www/${LEGACY_ASSET}`, bytes: asset.length, sha256: sha256(asset), topLevelRules: 191 },
    rollout: {
      allowlist: LEGACY_MODULE_ALLOWLIST,
      importCount: modules.reduce((sum, module) => sum + module.legacyImports, 0),
      deltaModules: Object.keys(MODULE_DELTAS),
      modules
    },
    etp: {
      file: 'www/modules/etp/index.html', bytes: etp.length, sha256: sha256(etp),
      expectedSha256: ETP_BASELINE_SHA256, legacyImports: etp.toString('utf8').split(legacyHref).length - 1
    },
    planningVisualReceipt: receipt(workspaceRoot, PHASE6C_VISUAL_RECEIPT_PATH),
    rolloutReceipt: receipt(workspaceRoot, 'verification/audit/PHASE-6C-LEGACY-ROLLOUT-2026-08-24.md'),
    historicalEvidence: [
      receipt(workspaceRoot, 'verification/MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json'),
      receipt(workspaceRoot, 'verification/MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json')
    ],
    historicalValidationBoundary: 'reconstruct-pre-phase6c-authority',
    currentProfileDoesNotRelabelHistoricalEvidence: true,
    manifestModuleCount: manifest.modules.length
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const profile = buildPhase6cCurrentProfile();
  const serialized = `${JSON.stringify(profile, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(root, PHASE6C_PROFILE_PATH), serialized, 'utf8');
    process.stdout.write(`${PHASE6C_PROFILE_PATH}\n`);
  } else process.stdout.write(serialized);
}
