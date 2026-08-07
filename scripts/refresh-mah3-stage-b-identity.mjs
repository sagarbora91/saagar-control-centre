#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWwwFingerprint, fingerprintFile } from './mah3-visual-review-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const profilePath = path.join(root, 'verification', 'MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json');
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const fingerprint = createWwwFingerprint(root);
profile.sourceFingerprint.algorithm = fingerprint.algorithm;
profile.sourceFingerprint.fileCount = fingerprint.fileCount;
profile.sourceFingerprint.totalBytes = fingerprint.totalBytes;
profile.sourceFingerprint.treeSha256 = fingerprint.treeSha256;
profile.sourceFingerprint.criticalFiles = profile.sourceFingerprint.criticalFiles.map(file => fingerprintFile(root, file.path));
const planning = fingerprintFile(root, 'www/modules/planning/index.html');
const sharedRuntime = fingerprintFile(root, 'www/shared/module-runtime.js');
profile.sharedRuntimeCandidates.planning.moduleBytes = planning.bytes;
profile.sharedRuntimeCandidates.planning.moduleSha256 = planning.sha256;
profile.sharedRuntimeCandidates.planning.runtimeAsset.bytes = sharedRuntime.bytes;
profile.sharedRuntimeCandidates.planning.runtimeAsset.sha256 = sharedRuntime.sha256;
profile.baseline.stageBIdentityRebound = true;
profile.baseline.stageBRenderedRuntimeEvidence = 'verification/MAH4-STAGE-B-RENDERED-RUNTIME-EVIDENCE-2026-08-07.json';
fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
const profileSha256 = sha256(fs.readFileSync(profilePath));
for (const id of ['planning', 'dsr', 'qms']) {
  const evidencePath = path.join(root, 'verification', 'mah3-visual-review', `MAH3-${id.toUpperCase()}-CANARY-EVIDENCE-2026-08-07.json`);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  evidence.profileSha256 = profileSha256;
  evidence.wwwTreeSha256 = fingerprint.treeSha256;
  evidence[`${id}Sha256`] = fingerprintFile(root, `www/modules/${id}/index.html`).sha256;
  evidence.runtimeSha256 = sharedRuntime.sha256;
  evidence.stageBRevalidation = {
    kind: 'non-visual runtime-script identity rebind',
    renderedRuntimeEvidence: 'verification/MAH4-STAGE-B-RENDERED-RUNTIME-EVIDENCE-2026-08-07.json',
    visualAcceptanceScopeExpanded: false
  };
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify({ treeSha256: fingerprint.treeSha256, profileSha256 })}\n`);
