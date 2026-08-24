import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPhase6cCurrentProfile,
  PHASE6C_PROFILE_PATH,
  PHASE6C_VISUAL_RECEIPT_PATH
} from '../scripts/create-phase6c-current-profile.mjs';
import { validateBaseline } from '../scripts/mah3-visual-review-server.mjs';
import { validateMah4Profile } from '../scripts/lib/mah4-contract-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 6C current profile exactly binds the extracted source tree without relabeling history', () => {
  const recorded = JSON.parse(fs.readFileSync(path.join(root, PHASE6C_PROFILE_PATH), 'utf8'));
  assert.deepEqual(recorded, buildPhase6cCurrentProfile(root));
  assert.equal(recorded.rollout.importCount, 11);
  assert.deepEqual(recorded.rollout.deltaModules, ['service', 'qms', 'payroll']);
  assert.ok(recorded.rollout.modules.every(module => module.legacyImports === 1));
  assert.ok(recorded.rollout.modules.every(module => module.deltaStyle === module.expectedDelta));
  assert.equal(recorded.etp.sha256, recorded.etp.expectedSha256);
  assert.equal(recorded.etp.legacyImports, 0);
  assert.equal(recorded.currentProfileDoesNotRelabelHistoricalEvidence, true);
  assert.equal(recorded.historicalValidationBoundary, 'reconstruct-pre-phase6c-authority');
  assert.match(recorded.sourceProductCommit, /^[a-f0-9]{40}$/);
  assert.throws(() => validateBaseline(root), /source fingerprint mismatch/);
  assert.throws(() => validateMah4Profile(root), /does not match current source/);
});

test('Planning visual receipt binds actual browser capture hashes and reports the uncaptured UA honestly', () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, PHASE6C_VISUAL_RECEIPT_PATH), 'utf8'));
  assert.equal(receipt.browserIdentity, 'Codex In-app Browser');
  assert.equal(receipt.userAgentCaptured, false);
  assert.equal(receipt.userAgent, null);
  assert.equal(receipt.capturedProductCommit, '332bf3e');
  assert.equal(receipt.applicabilityProductCommit, '332bf3e');
  assert.equal(receipt.legacyAssetSha256, 'acc970dbe54fb99b0dfa25a2807fb3626ba11130fcd87969ca336d8000efa443');
  assert.equal(receipt.allPngBytesIdentical, true);
  assert.equal(receipt.allLayoutDimensionsIdentical, true);
  assert.equal(receipt.captures.length, 10);
  assert.deepEqual(receipt.captures.map(item => item.viewport), [
    [360,800],[412,915],[800,600],[1365,768],[639,800],[640,800],[899,800],[900,800],[1199,800],[1200,800]
  ]);
  receipt.captures.forEach(item => {
    assert.ok(item.extractedPngBytes > 0);
    assert.equal(item.reconstructedPngBytes, item.extractedPngBytes);
    assert.match(item.extractedPngSha256, /^[a-f0-9]{64}$/);
    assert.equal(item.reconstructedPngSha256, item.extractedPngSha256);
    assert.equal(item.layout.length, 2);
  });
});
