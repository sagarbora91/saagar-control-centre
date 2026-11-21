#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createWwwFingerprint } from './mah3-visual-review-server.mjs';
import { readModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RECEIPT = 'verification/audit/PHASE-6I-SOURCE-FREEZE-2026-08-24.json';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const PHASE6_ROWS = Object.freeze([
  ['6A-6B','integration inventory and generated-control identity','tests/phase6b-shell-shared-control-identities.test.mjs'],
  ['6C','responsive extraction historical boundary','tests/phase6c-planning-legacy-css-extraction.test.mjs'],
  ['6D','shared UI foundations and governance','tests/phase6d-integration-governance.test.mjs'],
  ['6E','Stock pilot migration','tests/phase6e-stock-pilot.test.mjs'],
  ['6F','ETP gateway plus Payroll/Grooming/Service','tests/phase6f-etp-bounded-report-gateway.test.mjs'],
  ['6G','remaining modules and shell','tests/phase6g-shell-responsive.test.mjs'],
  ['6H1-6H5','ETP analytics, reconciliation, targets, monitoring and incentive controls','tests/phase6h-integration.test.mjs'],
  ['6I','cleanup, documentation and source freeze','tests/phase6i-source-freeze.test.mjs']
]);

function walk(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute)); else out.push(absolute);
  }
  return out;
}

export function createPhase6iSourceFreeze(workspaceRoot = root) {
  const manifest = readModuleManifestSource(workspaceRoot).data;
  const fingerprint = createWwwFingerprint(workspaceRoot);
  const wwwFiles = walk(path.join(workspaceRoot, 'www'));
  const legacyConsumers = wwwFiles.filter(file => fs.readFileSync(file).includes(Buffer.from('module-mobile-legacy.css')))
    .map(file => path.relative(workspaceRoot, file).replaceAll('\\','/'));
  const inlineDeltas = wwwFiles.filter(file => fs.readFileSync(file).includes(Buffer.from('st-v5-mobile-css-delta')))
    .map(file => path.relative(workspaceRoot, file).replaceAll('\\','/'));
  const scopeOwnership = PHASE6_ROWS.map(([phase, implementation, focusedTest]) => ({
    phase, implementation, focusedTest, testExists: fs.existsSync(path.join(workspaceRoot, focusedTest))
  }));
  const manifestBytes = fs.readFileSync(path.join(workspaceRoot, 'www/module-manifest.js'));
  return {
    schemaVersion: 1,
    freezeId: 'phase6i-source-freeze-2026-08-24',
    parentCommit: execFileSync('git', ['rev-parse','HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim(),
    wwwTree: fingerprint,
    manifest: { modules: manifest.modules.length, sharedAssets: manifest.sharedAssets.length,
      bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    moduleIds: manifest.modules.map(module => module.id),
    legacyCleanup: { productionAssetExists: fs.existsSync(path.join(workspaceRoot, 'www/shared/module-mobile-legacy.css')),
      consumers: legacyConsumers, inlineMigrationDeltas: inlineDeltas,
      historicalFixture: 'tests/fixtures/phase6c/module-mobile-legacy.css' },
    scopeOwnership,
    documentation: ['ARCHITECTURE.md','docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md','docs/audit/PHASE-6-CONSOLIDATED-BUILD-PLAN-2026-08-24.md'],
    e7: { status: 'DEFERRED', includedInCandidate: false },
    formalApproval: false,
    nextPhase: '6J'
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = `${JSON.stringify(createPhase6iSourceFreeze(), null, 2)}\n`;
  if (process.argv.includes('--write')) { fs.writeFileSync(path.join(root, RECEIPT), value); process.stdout.write(`${RECEIPT}\n`); }
  else process.stdout.write(value);
}
