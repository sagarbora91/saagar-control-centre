import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  createEvidenceCases,
  createReviewServer,
  createRunnerFingerprint,
  createWwwFingerprint,
  validateBaseline
} from '../scripts/mah3-visual-review-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'verification', 'MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json');
const mh1Path = path.join(root, 'verification', 'MH1-MODULAR-PROTECTION-PROFILE.json');
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const mh1 = JSON.parse(fs.readFileSync(mh1Path, 'utf8'));
const reviewScript = fs.readFileSync(path.join(root, 'verification', 'mah3-visual-review', 'review-controller.js'), 'utf8');
const reviewHtml = fs.readFileSync(path.join(root, 'verification', 'mah3-visual-review', 'index.html'), 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function inlineBlock(html, id) {
  const expression = new RegExp(`<script\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
  const match = html.match(expression);
  assert.ok(match, `missing inline block ${id}`);
  return match[1];
}

test('MAH-3 baseline is bound to the exact dirty www tree and critical files', () => {
  const verified = validateBaseline(root, profilePath);
  const actual = createWwwFingerprint(root);
  assert.equal(verified.profile.profileId, 'mah3-shared-runtime-baseline-2026-08-06');
  assert.deepEqual(verified.fingerprint, {
    algorithm: actual.algorithm,
    fileCount: actual.fileCount,
    totalBytes: actual.totalBytes,
    treeSha256: actual.treeSha256
  });
  assert.equal(profile.baseline.runtimeRefactorApplied, true);
  assert.equal(profile.baseline.visualBaselinesCaptured, true);
  assert.equal(profile.baseline.physicalDeviceAccepted, false);
  assert.equal(profile.baseline.nativeLanguageAccepted, false);
});

test('MAH-3 evidence runner covers the unchanged MAH-1 168-case matrix', () => {
  assert.deepEqual(profile.matrix.languages, mh1.languages);
  assert.deepEqual(profile.matrix.viewports, mh1.viewports);
  assert.deepEqual(profile.matrix.surfaces, mh1.surfaces);
  const cases = createEvidenceCases(profile);
  assert.equal(cases.length, 168);
  assert.equal(new Set(cases.map(item => item.id)).size, 168);
  assert.equal(cases.filter(item => item.kind === 'shell').length, 36);
  assert.equal(cases.filter(item => item.kind === 'module').length, 132);
  assert.ok(cases.every(item => item.src.startsWith('/app/')));
  assert.ok(cases.every(item => item.src === '/app/index.html'));
  assert.ok(cases.every(item => !/(?:[a-z]+:)?\/\//i.test(item.src)));
});

test('MAH-3 Planning canary pins the extracted runtime and preserves parser order', () => {
  const planningPath = path.join(root, 'www', 'modules', 'planning', 'index.html');
  const planningBytes = fs.readFileSync(planningPath);
  const planning = planningBytes.toString('utf8');
  const candidate = profile.sharedRuntimeCandidates.planning;
  assert.equal(planningBytes.length, candidate.moduleBytes);
  assert.equal(sha256(planningBytes), candidate.moduleSha256);
  assert.equal(candidate.originalBlocks.reduce((sum, block) => sum + block.bytes, 0), candidate.javascriptBodyBytes);

  let previous = -1;
  for (const block of candidate.originalBlocks) {
    const body = inlineBlock(planning, block.id);
    assert.match(body, /SaagarModuleRuntime\.run\(/, block.id);
    const at = planning.indexOf(`id="${block.id}"`);
    assert.ok(at > previous, `${block.id} parser order`);
    previous = at;
  }
  assert.equal(profile.sharedRuntimeCandidates.cssExtractionDeferred, true);
  assert.match(planning, /<script src="\.\.\/\.\.\/shared\/module-runtime\.js"><\/script>/);
  const runtime = fs.readFileSync(path.join(root, 'www', 'shared', 'module-runtime.js'));
  assert.equal(runtime.length, candidate.runtimeAsset.bytes);
  assert.equal(sha256(runtime), candidate.runtimeAsset.sha256);
});

test('MAH-3 review UI keeps geometry advisory and acceptance explicit', () => {
  assert.doesNotThrow(() => new vm.Script(reviewScript, { filename: 'review.js' }));
  assert.match(reviewHtml, /Geometry is advisory/);
  assert.match(reviewHtml, /not physical-device or native-language acceptance/);
  assert.match(reviewScript, /manualStatus/);
  assert.match(reviewScript, /openModule\(item\.surface\)/);
  assert.match(reviewScript, /collectGeometry\(nestedFrame\.contentDocument/);
  assert.match(reviewScript, /shellLexical\(shellWindow, 'activeView'\)/);
  assert.match(reviewScript, /verticallyReachable/);
  assert.match(reviewScript, /await delay\(1400\)/);
  assert.match(reviewScript, /node\.hasAttribute\('inert'\)/);
  assert.match(reviewScript, /intentionallyCoveredByModule/);
  assert.doesNotMatch(reviewScript, /shellWindow\.activeView/);
  assert.match(reviewScript, /profileSha256/);
  assert.match(reviewScript, /runnerTreeSha256/);
  assert.match(reviewScript, /physicalDeviceAccepted:\s*false/);
  assert.match(reviewScript, /nativeLanguageAccepted:\s*false/);
  assert.match(reviewScript, /localStorage\.clear\(\)/);
  assert.match(reviewScript, /sessionStorage/);
  assert.doesNotMatch(reviewScript + reviewHtml, /Sagar Sanjay Bora|9876543210/);
  assert.match(reviewScript, /captureComplete/);
  assert.match(reviewScript, /visualBaselinePassed/);
  assert.match(reviewScript, /refactorGateReady/);
  assert.match(createRunnerFingerprint(root).treeSha256, /^[a-f0-9]{64}$/);
});

test('MAH-3 server refuses a stale source profile before listening', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-mah3-'));
  const stalePath = path.join(temp, 'stale-profile.json');
  const stale = structuredClone(profile);
  stale.sourceFingerprint.treeSha256 = '0'.repeat(64);
  fs.writeFileSync(stalePath, JSON.stringify(stale));
  assert.throws(
    () => createReviewServer({ root, profilePath: stalePath }),
    /source fingerprint mismatch: treeSha256/
  );
});
