import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareApks, normalizedApkFingerprint } from '../scripts/audit/compare-apks.mjs';
import { parseGeneratedSigningConfiguration,
  controlledGradleEnvironment, dependencyClosureIdentity, gradleDistributionClosureIdentity,
  gradleReadOnlyDependencyCacheIdentity,
  parseGradleJvmIdentity,
  spawnSyncCommandTree } from '../scripts/audit/capture-build.mjs';
import { hasRunnerControlledProvenance,
  prepareControlledGradleWrapper, runControlledProbes, seedControlledGradleHome,
  withControlledCleanup } from '../scripts/audit/controlled-probes.mjs';
import { assessGeneratedIdentityReceipts,
  assessSigningOverrideSource, assessSigningReceipts } from '../scripts/audit/audits/a9.mjs';
import { evaluateShellPerformance, validTimingSamples } from '../scripts/audit/audits/a10.mjs';
import { orderedTokenSimilarity } from '../scripts/audit/audits/a2.mjs';
import { EXTERNAL_EVIDENCE_TRUST_POLICY,
  externalEvidenceAuthorized, externalEvidenceSignaturePayload,
  verifyExternalEvidenceSignature } from '../scripts/audit/evidence-trust-root.mjs';
import { COMPARISON_APPROVAL_FORMAT, comparisonFindingSha256, evaluateComparison } from '../scripts/audit/comparison.mjs';
import { AUDIT_VERSION, buildContext, isProductPath, PRODUCT_BASELINE_SHA, revisionFingerprint, sha256, stableSha256 } from '../scripts/audit/lib.mjs';
import { assertToolingProductFingerprintAnchor, comparisonPerformance, npmLauncher, parseArgs, parseOfflineTestEvidence, probeNpmLauncher,
  summaryMarkdown, validateBuildEvidence } from '../scripts/audit/run.mjs';
import { assertExternalPath, BASELINE_ARTIFACT_FILES, buildEvidenceManifest, canonicalGitWorktreeRoots, gradleVersionLauncher,
  isAuditToolingPath, pathInside, verifyToolingIdentity,
  assertBaselineEvidenceDirectoryTarget } from '../scripts/audit/runner-support.mjs';
import { canonicalSha256, safeJson } from '../scripts/audit/schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDITS = Object.freeze([
  ['A1', 'a1', 7], ['A2', 'a2', 5], ['A3', 'a3', 5], ['A4', 'a4', 6],
  ['A5', 'a5', 5], ['A6', 'a6', 5], ['A7', 'a7', 5], ['A8', 'a8', 5],
  ['A9', 'a9', 5], ['A10', 'a10', 5], ['A11', 'a11', 5]
]);

test('A2 near-copy similarity preserves control-flow order after identifier normalization', () => {
  const left = `
    if (record.active) {
      save(record.id);
      audit(record.id);
      publish(record.id);
      return true;
    }
    deny(record.id);
    return false;
  `;
  const renamedCopy = `
    if (candidate.active) {
      persist(candidate.key);
      log(candidate.key);
      release(candidate.key);
      return true;
    }
    reject(candidate.key);
    return false;
  `;
  const reordered = `
    return false;
    deny(record.id);
    if (record.active) {
      return true;
      publish(record.id);
      audit(record.id);
      save(record.id);
    }
  `;
  assert.equal(orderedTokenSimilarity(left, renamedCopy), 1);
  assert.ok(orderedTokenSimilarity(left, reordered) < 0.9);
});

function git(args, encoding = 'utf8') {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding, windowsHide: true, maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function commitProductFingerprint(revision) {
  const files = git(['ls-tree', '-r', '--name-only', '-z', revision], null)
    .toString('utf8').split('\0').filter(Boolean).map(value => value.replaceAll('\\', '/'))
    .filter(isProductPath).sort();
  const value = revisionFingerprint(ROOT, files, revision);
  return { fileCount: value.fileCount, totalBytes: value.totalBytes, treeSha256: value.treeSha256 };
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function testZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = Buffer.from(entry.body);
    const compressed = entry.deflate ? zlib.deflateRawSync(body) : body;
    const method = entry.deflate ? 8 : 0;
    const flags = entry.descriptor ? 8 : 0;
    const checksum = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!entry.descriptor) {
      local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(body.length, 22);
    }
    local.writeUInt16LE(name.length, 26);
    const descriptor = entry.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (entry.descriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(body.length, 12);
    }
    locals.push(local, name, compressed, descriptor);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length + descriptor.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

function tapBlock(name, count) {
  return `> saagar-bcc-android@5.0.0 ${name}\n> node --test fixture\n\n` +
    `\u2139 tests ${count}\n\u2139 pass ${count}\n\u2139 fail 0\n\u2139 cancelled 0\n\u2139 skipped 0\n\u2139 todo 0\n`;
}

function buildRecord(apkFile, toolchainTag = 'same', closureTag = 'same') {
  const bytes = fs.readFileSync(apkFile);
  const normalized = normalizedApkFingerprint(apkFile);
  const javaVersion = 'openjdk version "21.0.7"';
  const files = ['android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/assets/public/build-identity.js', 'android/build.gradle',
    'android/gradle/wrapper/gradle-wrapper.jar', 'android/gradle/wrapper/gradle-wrapper.properties',
    'android/variables.gradle', 'android/settings.gradle', 'android/capacitor.settings.gradle',
    'android/app/capacitor.build.gradle', 'android/gradle.properties', 'android/gradlew.bat']
    .map(file => ({ file, bytes: 1, sha256: sha256(file) }))
    .sort((left, right) => left.file.localeCompare(right.file));
  const signing = { captureBuildType: 'debug', debugUsesReleaseConfig: false,
    releaseBuildUsesReleaseConfig: true, releaseConfigDeclared: true, releaseDebuggable: false,
    releaseEnvironmentVariables: ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD',
      'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD'], releaseFailClosed: true };
  const generatedAndroid = {
    files, filesSha256: canonicalSha256(files),
    gradleWrapper: {
      jarSha256: files.find(item => item.file.endsWith('gradle-wrapper.jar')).sha256,
      propertiesSha256: files.find(item => item.file.endsWith('gradle-wrapper.properties')).sha256
    },
    gradleLauncher: { ...files.find(item => item.file === 'android/gradlew.bat') },
    generatedRecipe: (() => {
      const recipeFiles = files.filter(item => ['android/settings.gradle', 'android/capacitor.settings.gradle',
        'android/app/capacitor.build.gradle', 'android/gradle.properties'].includes(item.file));
      return { files: recipeFiles, filesSha256: canonicalSha256(recipeFiles) };
    })(),
    configuration: { packageId: 'com.saagartraders.bcc', versionCode: 209,
      versionName: '2.9', minSdk: 23, signing }
  };
  const gradle = { version: '8.11.1', javaHomeVersion: javaVersion, reportedJvmForm: 'Launcher JVM',
    javaHomeJvmVersion: '21.0.7', actualJvmVersion: '21.0.7',
    jvmProof: 'gradle-jvm-is-build-jvm',
    plainJvm: '', launcherJvm: '21.0.7 (test)', daemonJvmMatchesJavaHome: true,
    daemonJvmDescriptorSha256: sha256('JAVA_HOME'), kotlin: '2.0', groovy: '3.0', ant: '1.10',
    os: 'test', outputSha256: sha256('gradle-output') };
  const recipe = [...generatedAndroid.generatedRecipe.files,
    generatedAndroid.gradleLauncher,
    { file: 'package-lock.json', bytes: 1, sha256: sha256(`recipe:${toolchainTag}`) }]
    .sort((left, right) => left.file.localeCompare(right.file));
  const toolchainIdentity = { node: 'v25.0.0', npm: '11.0.0',
    java: { source: 'JAVA_HOME', version: javaVersion }, gradle,
    gradleLauncher: { ...generatedAndroid.gradleLauncher },
    platform: 'win32', arch: 'x64', osRelease: 'test', recipe,
    recipeSha256: canonicalSha256(recipe) };
  const toolchain = { ...toolchainIdentity, fingerprint: canonicalSha256(toolchainIdentity) };
  /* Receipt v2 (closure addendum §4). `closureTag` lets a test give one build a
     different dependency or Gradle closure so the two-build agreement rule can
     be exercised in both directions. */
  const dependencyAggregate = { fileCount: 12, totalBytes: 3456,
    sha256: sha256(`dependency-closure:${closureTag}`) };
  const gradleAggregate = { fileCount: 5, totalBytes: 7890,
    sha256: sha256(`gradle-distribution:${closureTag}`) };
  return { format: 'SAAGAR_AUDIT_BUILD_CAPTURE', schemaVersion: 2,
    sourceSha: PRODUCT_BASELINE_SHA,
    productFingerprint: { treeSha256: sha256('product') },
    isolation: { rootKind: 'detached-linked-worktree', linkedWorktree: true, detachedHead: true },
    cleanBefore: true, cleanAfter: true, command: 'npm run build:apk', signingMode: 'debug',
    commandOutputSha256: sha256('output'), elapsedMs: 1,
    bootstrap: { command: 'npm run add:android', sourceAndroidAbsent: true, exitCode: 0,
      elapsedMs: 1, outputSha256: sha256('bootstrap-output') },
    install: { command: 'npm ci --ignore-scripts --no-audit --no-fund', exitCode: 0, elapsedMs: 1,
      outputSha256: sha256(`install-output:${closureTag}`), sourceNodeModulesAbsent: true },
    dependencyClosure: { afterInstall: dependencyAggregate, beforeGradle: dependencyAggregate,
      afterBuild: dependencyAggregate, stableThroughBuild: true },
    gradleDistribution: { before: gradleAggregate, after: gradleAggregate,
      stableThroughBuild: true, isolatedUserHome: true },
    gradleReadOnlyDependencyCache: null,
    generatedAndroid, toolchain,
    artifact: { file: 'app-debug.apk', bytes: bytes.length, sha256: sha256(bytes),
      normalized: { entryCount: normalized.entryCount, totalUncompressedBytes: normalized.totalUncompressedBytes,
        sha256: normalized.sha256, excludedSignatureEntryCount: normalized.excludedSignatureEntries.length } } };
}

function storageContractFixture() {
  return [{
    artifactId: 'local-storage:saagar_fixture', classification: 'portable', evidenceArtifact: false,
    kind: 'local-storage', name: 'saagar_fixture', operations: ['getItem', 'setItem'], owner: 'shell',
    pattern: false, reset: 'factory-reset', restore: 'validated-restore', unresolved: false
  }, {
    artifactId: 'local-storage:saagar_fixture_two', classification: 'portable', evidenceArtifact: false,
    kind: 'local-storage', name: 'saagar_fixture_two', operations: ['getItem'], owner: 'shell',
    pattern: false, reset: 'factory-reset', restore: 'validated-restore', unresolved: false
  }];
}

function storageContractMetric(inventory = storageContractFixture()) {
  return {
    artifacts: inventory.length,
    artifactLimit: 2500,
    inventoryComplete: true,
    inventory,
    inventorySha256: stableSha256(inventory)
  };
}

function messageContractFixture() {
  return [{
    contractId: 'message:ST_FIXTURE', expressionSha256: '', kind: 'resolved', messageType: 'ST_FIXTURE', path: '',
    receiverContracts: [{ path: 'www/index.html' }],
    senderContracts: [{ path: 'www/index.html', payloadFields: [{ field: 'value', kind: 'string' }] }],
    unresolvedCode: ''
  }];
}

function messageContractMetric(inventory = messageContractFixture()) {
  const resolved = inventory.filter(row => row.kind === 'resolved');
  const unresolved = inventory.filter(row => row.kind === 'unresolved');
  return {
    messageTypes: resolved.length,
    senderSites: inventory.reduce((sum, row) => sum + row.senderContracts.length, 0),
    receiverSites: inventory.reduce((sum, row) => sum + row.receiverContracts.length, 0),
    unresolvedContracts: unresolved.length,
    discoveredArtifacts: inventory.length,
    artifactLimit: 1000,
    inventoryComplete: true,
    /* C-07 may only reach a regression verdict when the producing side declared
       explicit complete static-discovery authority. The fixture declares it so
       the delta-detection path stays covered; the negative case below asserts
       that withdrawing it forces C-07 to unmeasured. */
    staticDiscoveryComplete: true,
    inventory,
    inventorySha256: stableSha256(inventory)
  };
}

function comparisonFixture(capabilityOutcome = 'same') {
  const check = (id, result, metric, severity = 'INFO', mandatory = true) =>
    ({ id, result, metric, severity, mandatory, evidence: [], title: id, rule: id, notes: '' });
  const capability = [{ capabilityId: 'shell:route:home', category: 'route', surface: 'shell',
    outcome: capabilityOutcome }];
  const baseline = [
    { auditId: 'A1', checks: [check('A1-02', 'fail', { undeclaredDependencies: 10 }, 'P1'),
      check('A1-05', 'pass', { directReferences: 0 }), check('A1-07', 'fail', { untestedApplicationAssets: 2 }, 'P1')] },
    { auditId: 'A2', checks: [check('A2-01', 'fail', { duplicateGroups: 3 }, 'P2'),
      check('A2-02', 'fail', { nearCopyGroups: 4 }, 'P2'), check('A2-03', 'fail', { duplicateGroups: 3 }, 'P2')] },
    { auditId: 'A3', checks: [check('A3-02', 'pass', { inventory: [{ ...capability[0], outcome: 'same' }] }, 'P1')] },
    { auditId: 'A4', checks: [check('A4-01', 'pass', storageContractMetric()),
      check('A4-02', 'fail', { unclassifiedArtifacts: 10 }, 'P0')] },
    { auditId: 'A5', checks: [check('A5-04', 'pass', {})] },
    { auditId: 'A7', checks: [check('A7-01', 'pass', messageContractMetric())] },
    { auditId: 'A10', checks: [check('A10-01', 'unmeasured', {}, 'INFO', false),
      check('A10-02', 'unmeasured', {}, 'INFO', false), check('A10-03', 'pass', { totalBytes: 100 }, 'INFO', false)] }
  ];
  const current = [
    { auditId: 'A1', checks: [check('A1-02', 'fail', { undeclaredDependencies: 5 }, 'P1'),
      check('A1-05', 'pass', { directReferences: 0 }), check('A1-07', 'pass', { untestedApplicationAssets: 1 })] },
    { auditId: 'A2', checks: [check('A2-01', 'fail', { duplicateGroups: 2 }, 'P2'),
      check('A2-02', 'fail', { nearCopyGroups: 2 }, 'P2'), check('A2-03', 'fail', { duplicateGroups: 1 }, 'P2')] },
    { auditId: 'A3', checks: [check('A3-02', 'pass', { inventory: capability }, 'P1')] },
    { auditId: 'A4', checks: [check('A4-01', 'pass', storageContractMetric()),
      check('A4-02', 'pass', { unclassifiedArtifacts: 0 }, 'P0')] },
    { auditId: 'A5', checks: [check('A5-04', 'pass', {})] },
    { auditId: 'A7', checks: [check('A7-01', 'pass', messageContractMetric())] },
    { auditId: 'A10', checks: [check('A10-01', 'unmeasured', {}, 'INFO', false),
      check('A10-02', 'unmeasured', {}, 'INFO', false), check('A10-03', 'pass', { totalBytes: 90 }, 'INFO', false)] }
  ];
  return { baseline, current };
}

const A5_MUTATION_CONTRACT = Object.freeze([
  Object.freeze({
    invariantId: 'auth', mutationId: 'auth-one-retry-limit-v1', productionFile: 'www/reauth-policy.js',
    testCommand: 'node --test --test-force-exit --test-reporter=tap tests/d1-reauth.test.mjs',
    expectedAssertion: 'D1 reauthentication limits a single action to one retry'
  }),
  Object.freeze({
    invariantId: 'backupRestore', mutationId: 'backup-photo-manifest-count-v1', productionFile: 'www/portable-backup.js',
    testCommand: 'node --test --test-force-exit --test-reporter=tap tests/portable-backup.test.mjs',
    expectedAssertion: 'portable backup round-trips without leaking payload text'
  }),
  Object.freeze({
    invariantId: 'etpPublication', mutationId: 'etp-critical-reconciliation-publication-gate-v1',
    productionFile: 'www/etp-reconciliation-policy.js',
    testCommand: 'node --test --test-force-exit --test-reporter=tap tests/etp-reconciliation-policy.test.mjs',
    expectedAssertion: 'publication refuses missing facts, restored state, incomplete scope and critical failures'
  }),
  Object.freeze({
    invariantId: 'export', mutationId: 'export-default-deny-policy-v1', productionFile: 'www/export-control.js',
    testCommand: 'node --test --test-force-exit --test-reporter=tap tests/eng04-security.test.mjs',
    expectedAssertion: 'SEC-08 defaults to disabled and records the denied attempt without prompting'
  }),
  Object.freeze({
    invariantId: 'money', mutationId: 'money-reconciliation-delta-direction-v1',
    productionFile: 'www/etp-reconciliation-policy.js',
    testCommand: 'node --test --test-force-exit --test-reporter=tap tests/etp-reconciliation-policy.test.mjs',
    expectedAssertion: 'INV/SR/BC signs are applied and a mismatch remains visible'
  }),
  Object.freeze({
    invariantId: 'storage', mutationId: 'storage-native-batch-bound-v1', productionFile: 'www/storage-core.js',
    testCommand: 'node --test --test-force-exit --test-reporter=tap tests/native-incremental-storage-runtime.test.mjs',
    expectedAssertion: 'runtime flush writes only changed records in bounded native batches'
  })
]);

function a5MutationEnvelope(context, auditToolingSha) {
  const productSha256 = context.productFingerprint.treeSha256;
  return {
    format: 'SAAGAR_AUDIT_MUTATION_EVIDENCE', schemaVersion: 1, sourceSha: context.head,
    productFingerprintSha256: productSha256, toolingSha: auditToolingSha,
    mutations: A5_MUTATION_CONTRACT.map(contract => ({
      invariantId: contract.invariantId,
      mutationId: contract.mutationId,
      productionFile: contract.productionFile,
      testCommand: contract.testCommand,
      expectedAssertion: contract.expectedAssertion,
      disposableWorktree: true,
      detected: true,
      exitCode: 1,
      beforeProductSha256: productSha256,
      afterProductSha256: productSha256,
      outputSha256: sha256(`A5-output:${contract.invariantId}`),
      assertionEvidence: {
        namedFailureDetected: true,
        assertionFailureDetected: true,
        setupFailureDetected: false,
        matchedFailureBlockSha256: sha256(`A5-failure-block:${contract.invariantId}`)
      }
    }))
  };
}

test('audit tooling preserves the exact product anchor fingerprint using Git blobs', () => {
  const current = buildContext(ROOT).productFingerprint;
  const baseline = commitProductFingerprint(PRODUCT_BASELINE_SHA);
  assert.deepEqual({ fileCount: current.fileCount, totalBytes: current.totalBytes,
    treeSha256: current.treeSha256 }, baseline);
});

test('product fingerprint excludes only explicit audit-control paths', () => {
  for (const file of ['scripts/audit/run.mjs', 'tests/whole-app-audit-runner.test.mjs',
    'docs/audit/HANDOFF.md', 'docs/audit/AUDIT-PROGRAM-v1.md', 'verification/audit/run/RUN.json']) {
    assert.equal(isProductPath(file), false, file);
  }
  for (const file of ['tests/financial-golden.test.mjs', 'docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md',
    'verification/ETP-CORE-CONTRACT-CLOSURE-HANDOFF-2026-08-09.md', 'www/index.html']) {
    assert.equal(isProductPath(file), true, file);
  }
});

test('all 58 stable A1-A11 checks execute and pass the bounded evidence schema', async () => {
  const context = buildContext(ROOT);
  const testEvidence = { passed: true, totalCount: 492, passedCount: 492,
    counts: { completeOffline: 492, c1: 12, mobile: 6, settings: 8, language: 4,
      etp: 128, modular: 72, mainOffline: 262, pass: 492, fail: 0,
      cancelled: 0, skipped: 0, todo: 0 } };
  const seen = new Set();
  for (const [auditId, file, count] of AUDITS) {
    const module = await import(pathToFileURL(path.join(ROOT, 'scripts', 'audit', 'audits', `${file}.mjs`)).href);
    const result = await module.run(Object.freeze({ ...context,
      options: { mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA }, testEvidence }));
    assert.equal(result.auditId, auditId);
    assert.equal(result.checks.length, count);
    result.checks.forEach((item, index) => {
      assert.equal(item.id, `${auditId}-${String(index + 1).padStart(2, '0')}`);
      assert.ok(['pass', 'fail', 'unmeasured', 'na'].includes(item.result));
      assert.ok(['P0', 'P1', 'P2', 'P3', 'INFO'].includes(item.severity));
      assert.ok(Array.isArray(item.evidence) && item.evidence.length <= 200);
      assert.ok(!seen.has(item.id)); seen.add(item.id);
    });
    assert.doesNotThrow(() => safeJson(result, { forbiddenRoots: [ROOT, os.homedir()] }));
  }
  assert.equal(seen.size, 58);
});

test('A5 mutation evidence is structurally exact and cannot self-assert runner provenance', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a5.mjs')).href);
  const context = buildContext(ROOT);
  const auditToolingSha = 'a'.repeat(40);
  const validEvidence = a5MutationEnvelope(context, auditToolingSha);
  const validationContext = Object.freeze({ ...context,
    options: Object.freeze({ mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA, auditToolingSha }) });
  const domains = A5_MUTATION_CONTRACT.map(item => item.invariantId);
  const evaluate = mutationEvidence => module.validateMutationEvidenceEnvelope(validationContext, domains, mutationEvidence);
  const variant = change => {
    const value = structuredClone(validEvidence);
    change(value);
    return value;
  };

  const valid = evaluate(validEvidence);
  assert.equal(valid.measured, true);
  assert.equal(valid.rows.length, 6);
  assert.equal(valid.failures.length, 0);

  const rejectedEvidence = [
    ['bare mutation array', structuredClone(validEvidence.mutations)],
    ['wrong source identity', variant(value => { value.sourceSha = 'b'.repeat(40); })],
    ['wrong product identity', variant(value => { value.productFingerprintSha256 = 'b'.repeat(64); })],
    ['wrong tooling identity', variant(value => { value.toolingSha = 'b'.repeat(40); })],
    ['extra envelope field', variant(value => { value.untrustedApproval = true; })],
    ['out-of-order domains', variant(value => { value.mutations.reverse(); })],
    ['wrong frozen mutation binding', variant(value => {
      value.mutations[0].mutationId = value.mutations[1].mutationId;
    })],
    ['wrong production file', variant(value => { value.mutations[0].productionFile = 'www/index.html'; })],
    ['wrong test command', variant(value => {
      value.mutations[0].testCommand = 'node --test --test-force-exit --test-reporter=tap tests/portable-backup.test.mjs';
    })],
    ['wrong expected assertion', variant(value => { value.mutations[0].expectedAssertion = 'invented'; })],
    ['missing frozen row field', variant(value => { delete value.mutations[0].productionFile; })],
    ['detected mutation with zero exit', variant(value => { value.mutations[0].exitCode = 0; })],
    ['named failure without its block hash', variant(value => {
      value.mutations[0].assertionEvidence.matchedFailureBlockSha256 = '';
    })],
    ['missing named failure', variant(value => {
      value.mutations[0].assertionEvidence.namedFailureDetected = false;
    })],
    ['missing assertion failure', variant(value => {
      value.mutations[0].assertionEvidence.assertionFailureDetected = false;
    })],
    ['setup failure presented as detection', variant(value => {
      value.mutations[0].assertionEvidence.setupFailureDetected = true;
    })],
    ['extra assertion field', variant(value => {
      value.mutations[0].assertionEvidence.untrusted = true;
    })]
  ];
  for (const [label, evidenceValue] of rejectedEvidence) {
    const rejected = evaluate(evidenceValue);
    assert.equal(rejected.measured, false, label);
    assert.equal(rejected.rows.length, 0, label);
    assert.match(rejected.reason, /^MUTATION_EVIDENCE_/, label);
  }

  const forgedResult = await module.run(Object.freeze({ ...validationContext, mutationEvidence: validEvidence }));
  const forgedCheck = forgedResult.checks.find(item => item.id === 'A5-05');
  assert.equal(forgedCheck.result, 'unmeasured');
  assert.equal(forgedCheck.metric.measuredMutations, 0);
  assert.deepEqual(forgedCheck.evidence, [{ code: 'MUTATION_EVIDENCE_NOT_RUNNER_CONTROLLED' }]);

  const unrelatedFailure = variant(value => {
    const row = value.mutations[0];
    row.detected = false;
    row.exitCode = 1;
    row.assertionEvidence = {
      namedFailureDetected: false, assertionFailureDetected: false,
      setupFailureDetected: false, matchedFailureBlockSha256: ''
    };
  });
  const undetected = evaluate(unrelatedFailure);
  assert.equal(undetected.measured, true);
  assert.equal(undetected.rows.length, 6);
  assert.deepEqual(undetected.failures.map(item => item.invariantId), ['auth']);
});

test('offline TAP parser binds all seven measured suite summaries', () => {
  const output = [tapBlock('test:c1', 12), tapBlock('test:mobile', 6), tapBlock('test:settings', 8),
    tapBlock('test:language', 4), tapBlock('test:etp', 128), tapBlock('test:modular', 72),
    tapBlock('test:offline', 262)].join('\n');
  const result = parseOfflineTestEvidence(output);
  assert.deepEqual({ total: result.counts.completeOffline, etp: result.counts.etp,
    modular: result.counts.modular, main: result.counts.mainOffline, passed: result.passedCount,
    failed: result.counts.fail }, { total: 492, etp: 128, modular: 72, main: 262, passed: 492, failed: 0 });
  assert.throws(() => parseOfflineTestEvidence(tapBlock('test:offline', 262)),
    error => error && error.message === 'AUDIT_TEST_COUNTS_UNAVAILABLE');
});

test('offline TAP parser rejects every non-passing or duplicate suite summary', () => {
  const blocks = [tapBlock('test:c1', 12), tapBlock('test:mobile', 6), tapBlock('test:settings', 8),
    tapBlock('test:language', 4), tapBlock('test:etp', 128), tapBlock('test:modular', 72),
    tapBlock('test:offline', 262)];
  const base = blocks.join('\n');
  const invalid = [
    ['pass', 6, 5], ['fail', 0, 1], ['cancelled', 0, 1], ['skipped', 0, 1], ['todo', 0, 1]
  ];
  for (const [field, from, to] of invalid) {
    const badMobile = blocks[1].replace(`\u2139 ${field} ${from}`, `\u2139 ${field} ${to}`);
    const output = [blocks[0], badMobile, ...blocks.slice(2)].join('\n');
    assert.throws(() => parseOfflineTestEvidence(output),
      error => error && error.message === 'AUDIT_TEST_SUITE_SUMMARY_INVALID', field);
  }
  assert.throws(() => parseOfflineTestEvidence(`${base}\n${tapBlock('test:mobile', 6)}`),
    error => error && error.message === 'AUDIT_TEST_SUITE_SUMMARY_INVALID');
});

test('A1-04 fingerprints remote and data URI values without disclosing them', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a1.mjs')).href);
  const file = 'www/privacy-probe.html';
  const remote = 'https://cdn.example.test/runtime.js?token=TOP_SECRET_REMOTE';
  const embedded = 'data:text/css;base64,VE9QX1NFQ1JFVF9FTUJFRERFRA==';
  const source = `<script src="${remote}"></script>\n<link rel="stylesheet" href="${embedded}">`;
  const result = await module.run({
    productFiles: [file], files: [file], modules: [], sharedAssets: [],
    read: candidate => { assert.equal(candidate, file); return source; },
    exists: candidate => candidate === file
  });
  const check = result.checks.find(item => item.id === 'A1-04');
  assert.equal(check.result, 'fail');
  assert.equal(check.evidence.length, 2);
  assert.deepEqual(check.evidence.map(item => item.valueScheme).sort(), ['data', 'https']);
  for (const item of check.evidence) {
    assert.equal(Object.hasOwn(item, 'value'), false);
    assert.ok(Number.isSafeInteger(item.valueLength) && item.valueLength > 0);
    assert.match(item.valueSha256, /^[a-f0-9]{64}$/);
  }
  const serialized = JSON.stringify(check);
  assert.equal(serialized.includes(remote), false);
  assert.equal(serialized.includes(embedded), false);
  assert.equal(serialized.includes('TOP_SECRET'), false);
});

test('A6-03 scans high-confidence first-party shared JavaScript UI sinks', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a6.mjs')).href);
  const sources = new Map([
    ['www/index.html', '<main></main>'],
    ['www/app-i18n.js', 'const entries = [["Known label", "ज्ञात", "ज्ञात"], ["Don\\u2019t retry", "ज्ञात", "ज्ञात"]];'],
    ['www/shared/privacy-localization-probe.js', 'showToast("Don\\u2019t retry"); showToast("Untranslated shared runtime warning");'],
    ['www/third-party.min.js', 'showToast("Excluded vendor warning");'],
    ['www/demo-seed.js', 'showToast("Excluded seed warning");']
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], options: {}, productFingerprint: { entries: [] },
    read: file => sources.get(file), exists: file => sources.has(file)
  });
  const check = result.checks.find(item => item.id === 'A6-03');
  assert.equal(check.result, 'fail');
  assert.equal(check.metric.scannedFirstPartyJavaScript, 1);
  assert.deepEqual(check.evidence.map(item => item.path), ['www/shared/privacy-localization-probe.js']);
  assert.equal(check.evidence.length, 1);
  assert.equal(JSON.stringify(check).includes('Untranslated shared runtime warning'), false);
});

test('A6-03 classifies visible nested controls and ignores markup decoys in JavaScript code', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a6.mjs')).href);
  const sources = new Map([
    ['www/index.html', [
      '<button><span aria-hidden="true">XX</span><span>Known label</span></button>',
      '<script>',
      'const comparison = left < button && button > right;',
      'const expression = "<button>" + escapeHtml(name) + "</button>";',
      'const generated = `<button><span aria-hidden="true">YY</span>Actual untranslated action</button>`;',
      '</script>'
    ].join('\n')],
    ['www/app-i18n.js', 'const entries = [["Known label", "ज्", "ज्"]];']
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], options: {}, productFingerprint: { entries: [] },
    read: file => sources.get(file), exists: file => sources.has(file)
  });
  const check = result.checks.find(item => item.id === 'A6-03');
  assert.equal(check.result, 'fail');
  assert.equal(check.metric.highConfidenceBypasses, 1);
  assert.equal(check.evidence[0].kind, 'element:button');
  assert.equal(check.evidence[0].textFingerprint, sha256('Actual untranslated action').slice(0, 20));
  assert.equal(JSON.stringify(check).includes('escapeHtml'), false);
});

test('A6-03 evaluates browser-rendered newline-separated attribute phrases independently', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a6.mjs')).href);
  const unknown = 'Still untranslated third line';
  const sources = new Map([
    ['www/index.html', [
      '<textarea placeholder="Known first line&#10;Known second line&#xA;Still untranslated third line"></textarea>',
      '<textarea title="Known first line\\nKnown second line"></textarea>'
    ].join('\n')],
    ['www/app-i18n.js', [
      'const entries = [',
      '["Known first line", "ज्ञात", "ज्ञात"],',
      '["Known second line", "ज्ञात", "ज्ञात"],',
      '["Known first line Known second line Still untranslated third line", "ज्ञात", "ज्ञात"]',
      '];'
    ].join('\n')]
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], options: {}, productFingerprint: { entries: [] },
    read: file => sources.get(file), exists: file => sources.has(file)
  });
  const check = result.checks.find(item => item.id === 'A6-03');
  assert.equal(check.result, 'fail');
  assert.equal(check.metric.highConfidenceBypasses, 1);
  assert.equal(check.evidence[0].kind, 'attribute:placeholder');
  assert.equal(check.evidence[0].textFingerprint, sha256(unknown).slice(0, 20));
});

test('A6-03 keeps quoted arrow handlers inside the start tag boundary', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a6.mjs')).href);
  const visible = 'Actual untranslated arrow-handler action';
  const sources = new Map([
    ['www/index.html', `<button onclick="records.filter(row=>row.ready).forEach(row=>select(row))"><span>${visible}</span></button>`],
    ['www/app-i18n.js', 'const entries = [["Known label", "ज्ञात", "ज्ञात"]];']
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], options: {}, productFingerprint: { entries: [] },
    read: file => sources.get(file), exists: file => sources.has(file)
  });
  const check = result.checks.find(item => item.id === 'A6-03');
  assert.equal(check.result, 'fail');
  assert.equal(check.metric.highConfidenceBypasses, 1);
  assert.equal(check.evidence[0].kind, 'element:button');
  assert.equal(check.evidence[0].textFingerprint, sha256(visible).slice(0, 20));
  assert.equal(JSON.stringify(check).includes('records.filter'), false);
});

test('A11-03 rejects per-suite skips and cannot pass aggregate-only evidence', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a11.mjs')).href);
  const output = [tapBlock('test:c1', 12), tapBlock('test:mobile', 6), tapBlock('test:settings', 8),
    tapBlock('test:language', 4), tapBlock('test:etp', 128), tapBlock('test:modular', 72),
    tapBlock('test:offline', 262)].join('\n');
  const valid = { ...parseOfflineTestEvidence(output), passed: true };
  const context = buildContext(ROOT);
  const evaluate = async testEvidence => {
    const result = await module.run(Object.freeze({ ...context, testEvidence,
      options: { mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA } }));
    return result.checks.find(item => item.id === 'A11-03');
  };
  const skipped = structuredClone(valid);
  skipped.suites['test:mobile'].skipped = 1;
  const failed = await evaluate(skipped);
  assert.equal(failed.result, 'fail');
  assert.ok(failed.evidence.some(item => item.code === 'MEASURED_TEST_SUITE_SKIPS' && item.suite === 'test:mobile'));
  const aggregateOnly = structuredClone(valid);
  delete aggregateOnly.suites;
  assert.equal((await evaluate(aggregateOnly)).result, 'unmeasured');
});

test('platform npm launcher is behaviorally executable', () => {
  const launcher = npmLauncher('version');
  const probe = probeNpmLauncher();
  assert.equal(probe.available, true, JSON.stringify(probe));
  assert.match(probe.version, /^\d+\.\d+\.\d+/);
  if (process.platform === 'win32') {
    assert.equal(path.basename(launcher.command).toLowerCase(), 'cmd.exe');
    assert.deepEqual(launcher.args, ['/d', '/s', '/c', 'npm.cmd --version']);
  }
});

test('CLI requires frozen tooling identity, full tests, external evidence mode and canonical output name', () => {
  const output = path.join(os.tmpdir(), `2026-08-09-123456-${PRODUCT_BASELINE_SHA.slice(0, 7)}`);
  const base = ['--root', ROOT, '--output', output, '--product-baseline', PRODUCT_BASELINE_SHA,
    '--target-sha', PRODUCT_BASELINE_SHA, '--audit-tooling-sha', 'a'.repeat(40),
    '--mode', 'baseline', '--run-tests'];
  const parsed = parseArgs(base);
  assert.equal(parsed.runTests, true);
  assert.equal(parsed.auditToolingSha, 'a'.repeat(40));
  assert.equal(parsed.targetSha, PRODUCT_BASELINE_SHA);
  const wrongBaseline = [...base];
  wrongBaseline[wrongBaseline.indexOf('--product-baseline') + 1] = 'b'.repeat(40);
  assert.throws(() => parseArgs(wrongBaseline),
    error => error && error.message === 'AUDIT_PRODUCT_BASELINE_NOT_FROZEN');
  const wrongOutput = [...base];
  wrongOutput[wrongOutput.indexOf('--output') + 1] = path.join(os.tmpdir(), '2026-08-09-123456-abcdef0');
  assert.throws(() => parseArgs(wrongOutput),
    error => error && error.message === 'AUDIT_OUTPUT_TARGET_SHA_MISMATCH');
  assert.throws(() => parseArgs(base.filter(value => value !== '--run-tests')),
    error => error && error.message === 'AUDIT_FULL_SUITE_EVIDENCE_REQUIRED');
  assert.throws(() => parseArgs([...base.slice(0, -3), '--mode', 'comparison', '--run-tests']),
    error => error && error.message === 'AUDIT_COMPARISON_BASELINE_REQUIRED');
});

test('generated audit summary title is mode-aware', () => {
  const base = { productBaselineSha: PRODUCT_BASELINE_SHA, targetSha: PRODUCT_BASELINE_SHA,
    auditToolingSha: 'a'.repeat(40), auditProgramVersion: AUDIT_VERSION,
    productFingerprint: { treeSha256: sha256('product') }, status: 'complete-pass',
    mandatoryUnmeasured: [], openGateCount: 0, audits: [],
    comparison: { status: 'comparison-pass' } };
  const baseline = summaryMarkdown({ ...base, mode: 'baseline' }, []);
  const comparison = summaryMarkdown({ ...base, mode: 'comparison' }, []);
  assert.match(baseline, /^# SAAGAR Whole-App Audit Baseline$/m);
  assert.doesNotMatch(baseline, /^# SAAGAR Whole-App Audit Comparison$/m);
  assert.match(comparison, /^# SAAGAR Whole-App Audit Comparison$/m);
  assert.match(comparison, /- Comparison: \*\*comparison-pass\*\*/);
});

test('path containment handles prefix traps and different Windows volumes', () => {
  const root = path.resolve('V:\\audit-root');
  assert.equal(pathInside(root, path.join(root, '..audit')), true);
  assert.equal(pathInside(root, path.resolve('V:\\audit-root-sibling')), false);
  if (process.platform === 'win32') assert.equal(pathInside(root, path.resolve('C:\\audit-output')), false);
});

test('public build and mutation JSON flags are removed from the audit CLI pass path', () => {
  const output = path.join(os.tmpdir(), `2026-08-09-123456-${PRODUCT_BASELINE_SHA.slice(0, 7)}`);
  const base = ['--root', ROOT, '--output', output, '--product-baseline', PRODUCT_BASELINE_SHA,
    '--target-sha', PRODUCT_BASELINE_SHA, '--audit-tooling-sha', 'a'.repeat(40),
    '--mode', 'baseline', '--run-tests'];
  for (const flag of ['--build-evidence', '--mutation-evidence']) {
    assert.throws(() => parseArgs([...base, flag, path.join(os.tmpdir(), 'forged.json')]),
      error => error && error.message === 'AUDIT_ARGUMENT_UNKNOWN');
  }
});

test('injected controlled-probe hooks exercise receipts but cannot mint opaque runner provenance', () => {
  const identity = Object.freeze({ root: '<stub>', targetSha: 'a'.repeat(40),
    auditToolingSha: 'b'.repeat(40), auditToolingFingerprintSha256: sha256('tooling'),
    productFingerprintSha256: sha256('product') });
  const mutation = { format: 'SAAGAR_AUDIT_MUTATION_EVIDENCE', schemaVersion: 1,
    sourceSha: identity.targetSha, productFingerprintSha256: identity.productFingerprintSha256,
    toolingSha: identity.auditToolingSha, mutations: [] };
  const build = { sourceSha: identity.targetSha,
    productFingerprintSha256: identity.productFingerprintSha256 };
  const comparison = { format: 'SAAGAR_AUDIT_APK_COMPARISON', schemaVersion: 2,
    identityBound: true, first: { build }, second: { build } };
  const sharedEvidenceNode = { rows: [{ code: 'SAFE_SYNTHETIC_ROW' }] };
  mutation.details = sharedEvidenceNode;
  mutation.detailsAlias = sharedEvidenceNode;
  comparison.metadata = { nested: [{ value: true }] };
  const probes = runControlledProbes({}, {
    inspectTarget: () => identity,
    captureMutation: () => mutation,
    captureBuildPair: () => comparison
  });
  const context = { head: identity.targetSha,
    productFingerprint: { treeSha256: identity.productFingerprintSha256 },
    options: { auditToolingSha: identity.auditToolingSha } };
  assert.equal(probes.status.mutation.status, 'measured');
  assert.equal(probes.status.build.status, 'measured');
  assert.equal(probes.artifacts.mutation.format, 'SAAGAR_AUDIT_MUTATION_EVIDENCE');
  assert.equal(probes.artifacts.build.format, 'SAAGAR_AUDIT_APK_COMPARISON');
  assert.equal(hasRunnerControlledProvenance(probes.provenance, probes.mutationEvidence,
    'mutation', context), false);
  assert.equal(hasRunnerControlledProvenance(probes.provenance, probes.buildEvidence,
    'build', context), false);
  assert.equal(hasRunnerControlledProvenance(probes.provenance, structuredClone(probes.buildEvidence),
    'build', context), false);
  assert.equal(Object.isFrozen(probes.mutationEvidence), true);
  assert.equal(Object.isFrozen(probes.mutationEvidence.mutations), true);
  assert.equal(Object.isFrozen(probes.mutationEvidence.details), true);
  assert.equal(Object.isFrozen(probes.mutationEvidence.details.rows[0]), true);
  assert.equal(probes.mutationEvidence.details, probes.mutationEvidence.detailsAlias);
  assert.equal(Object.isFrozen(probes.buildEvidence.metadata.nested), true);
  assert.equal(Object.isFrozen(probes.buildEvidence.metadata.nested[0]), true);
  assert.throws(() => probes.mutationEvidence.details.rows.push({ code: 'MUTATED' }), TypeError);
  assert.throws(() => { probes.buildEvidence.metadata.nested[0].value = false; }, TypeError);
});

test('controlled probe failures are safe unmeasured artifacts without local diagnostics', () => {
  const identity = Object.freeze({ root: '<stub>', targetSha: 'a'.repeat(40),
    auditToolingSha: 'b'.repeat(40), auditToolingFingerprintSha256: sha256('tooling'),
    productFingerprintSha256: sha256('product') });
  const probes = runControlledProbes({}, {
    inspectTarget: () => identity,
    captureMutation: () => { throw new Error('AUDIT_STUB_MUTATION_FAILED'); },
    captureBuildPair: () => { throw new Error('AUDIT_STUB_BUILD_FAILED'); }
  });
  assert.equal(probes.mutationEvidence, null);
  assert.equal(probes.buildEvidence, null);
  assert.equal(probes.status.mutation.status, 'unmeasured');
  assert.equal(probes.status.build.status, 'unmeasured');
  assert.equal(probes.artifacts.mutation.reason, 'AUDIT_STUB_MUTATION_FAILED');
  assert.equal(probes.artifacts.build.reason, 'AUDIT_STUB_BUILD_FAILED');
  assert.doesNotThrow(() => safeJson(probes.artifacts, { forbiddenRoots: [ROOT, os.homedir()] }));
});

test('A9 rejects fabricated comparison evidence and never consults ambient ignored Android', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a9.mjs')).href);
  const base = buildContext(ROOT);
  const build = { sourceSha: base.head, productFingerprintSha256: base.productFingerprint.treeSha256 };
  const apkSha = sha256('fabricated-apk');
  const normalizedSha = sha256('fabricated-normalized');
  const comparison = { format: 'SAAGAR_AUDIT_APK_COMPARISON', schemaVersion: 2,
    identityBound: true, toolchainMatch: true, differenceClass: 'identical', rawEqual: true,
    normalizedEqual: true,
    first: { bytes: 1, sha256: apkSha,
      normalized: { entryCount: 1, sha256: normalizedSha, excludedSignatureEntryCount: 0 }, build },
    second: { bytes: 1, sha256: apkSha,
      normalized: { entryCount: 1, sha256: normalizedSha, excludedSignatureEntryCount: 0 }, build } };
  const guarded = Object.freeze({ ...base,
    read: file => {
      if (String(file).replaceAll('\\', '/').startsWith('android/')) {
        throw new Error('AMBIENT_ANDROID_READ_FORBIDDEN');
      }
      return base.read(file);
    },
    exists: file => {
      if (String(file).replaceAll('\\', '/').startsWith('android/')) {
        throw new Error('AMBIENT_ANDROID_EXISTS_FORBIDDEN');
      }
      return base.exists(file);
    },
    controlledProbeProvenance: Object.freeze({}),
    options: Object.freeze({ mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA,
      auditToolingSha: 'a'.repeat(40), buildEvidence: comparison }) });
  const result = await module.run(guarded);
  for (const id of ['A9-01', 'A9-02', 'A9-05']) {
    const check = result.checks.find(item => item.id === id);
    assert.equal(check.result, 'unmeasured', id);
    assert.deepEqual(check.evidence, [{ code: 'BUILD_EVIDENCE_NOT_RUNNER_CONTROLLED' }], id);
  }
});

test('A9 generated identity receipts reject wrong identity and mismatched build facts', () => {
  const identity = { packageId: 'com.saagartraders.bcc', appVersion: 'V5.5',
    versionName: '2.9', versionCode: 209, minSdk: 23 };
  const canonicalSourceSha256 = sha256('canonical-build-identity');
  const signing = { captureBuildType: 'debug', releaseDebuggable: false,
    releaseConfigDeclared: true, releaseBuildUsesReleaseConfig: true, releaseFailClosed: true,
    debugUsesReleaseConfig: false,
    releaseEnvironmentVariables: ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD',
      'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD'] };
  const receipt = {
    generatedAndroidSha256: sha256('android'),
    generatedAppGradleSha256: sha256('app-gradle'),
    generatedManifestSha256: sha256('manifest'),
    generatedBuildIdentitySha256: canonicalSourceSha256,
    generatedRootGradleSha256: sha256('root-gradle'),
    generatedVariablesGradleSha256: sha256('variables-gradle'),
    gradleWrapperJarSha256: sha256('wrapper-jar'),
    gradleWrapperPropertiesSha256: sha256('wrapper-properties'),
    gradleWrapperLauncherSha256: sha256('wrapper-launcher'),
    generatedRecipeSha256: sha256('generated-recipe'),
    androidConfiguration: { packageId: identity.packageId, versionName: identity.versionName,
      versionCode: identity.versionCode, minSdk: identity.minSdk, signing }
  };
  assert.deepEqual(assessGeneratedIdentityReceipts(identity, canonicalSourceSha256,
    structuredClone(receipt), structuredClone(receipt)), []);

  const wrongIdentity = structuredClone(receipt);
  wrongIdentity.androidConfiguration.versionCode += 1;
  const wrongRows = assessGeneratedIdentityReceipts(identity, canonicalSourceSha256,
    wrongIdentity, structuredClone(receipt));
  assert.ok(wrongRows.some(row => row.code === 'GENERATED_ANDROID_IDENTITY_MISMATCH' &&
    row.field === 'versionCode'));
  assert.ok(wrongRows.some(row => row.code === 'GENERATED_ANDROID_RECEIPTS_DISAGREE' &&
    row.field === 'androidConfiguration'));

  const mismatched = structuredClone(receipt);
  mismatched.generatedManifestSha256 = sha256('different-manifest');
  assert.ok(assessGeneratedIdentityReceipts(identity, canonicalSourceSha256,
    structuredClone(receipt), mismatched).some(row =>
    row.code === 'GENERATED_ANDROID_RECEIPTS_DISAGREE' && row.field === 'generatedManifestSha256'));
});

test('A9 signing receipts reject missing post-override signing facts', () => {
  const signing = { captureBuildType: 'debug', releaseDebuggable: false,
    releaseConfigDeclared: true, releaseBuildUsesReleaseConfig: true, releaseFailClosed: true,
    debugUsesReleaseConfig: false,
    releaseEnvironmentVariables: ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD',
      'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD'] };
  const build = { androidConfiguration: { signing } };
  assert.deepEqual(assessSigningReceipts(structuredClone(build), structuredClone(build)), []);
  const missing = structuredClone(build);
  delete missing.androidConfiguration.signing.releaseFailClosed;
  const rows = assessSigningReceipts(missing, structuredClone(build));
  assert.ok(rows.some(row => row.code === 'GENERATED_SIGNING_RECEIPTS_DISAGREE'));
  assert.ok(rows.some(row => row.code === 'GENERATED_RELEASE_FAIL_CLOSED_MISSING' && row.build === 1));
});

test('controlled probe source freezes detached builds, fresh Android bootstrap, JAVA_HOME and TAP mutations', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'scripts/audit/run.mjs'), 'utf8');
  const controller = fs.readFileSync(path.join(ROOT, 'scripts/audit/controlled-probes.mjs'), 'utf8');
  const build = fs.readFileSync(path.join(ROOT, 'scripts/audit/capture-build.mjs'), 'utf8');
  const mutations = fs.readFileSync(path.join(ROOT, 'scripts/audit/capture-mutations.mjs'), 'utf8');
  assert.doesNotMatch(runner, /--(?:build|mutation)-evidence/);
  assert.match(controller, /worktree', 'add', '--detach'/);
  assert.match(controller, /captureOneBuild\(identity, location\.root, 1\)/);
  assert.match(controller, /captureOneBuild\(identity, location\.root, 2\)/);
  assert.match(controller, /npmInvocation\('add:android'\)/);
  assert.match(build, /process\.env\.JAVA_HOME/);
  assert.match(build, /gradle-wrapper\.jar/);
  assert.match(build, /generatedAndroidIdentity/);
  assert.match(mutations, /\['--test', '--test-force-exit', '--test-reporter=tap', spec\.testFile\]/);
  assert.match(mutations, /const TEST_TIMEOUT_MS = 240_000/);
  assert.match(mutations, /Array\.isArray\(spec\.fileSha256\)/);
});

test('central evidence schema canonicalizes output and rejects local paths and unbounded strings', () => {
  const json = safeJson({ z: 1, a: 2 });
  assert.ok(json.indexOf('"a"') < json.indexOf('"z"'));
  assert.throws(() => safeJson({ path: ROOT }, { forbiddenRoots: [ROOT] }),
    error => error && error.message === 'AUDIT_EVIDENCE_LOCAL_PATH_FORBIDDEN');
  assert.throws(() => safeJson({ value: 'x'.repeat(4097) }),
    error => error && error.message === 'AUDIT_EVIDENCE_STRING_EXCEEDED');
});

test('every tracked test is declared by package scripts or an approved registry exclusion', () => {
  const packageSource = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/audit/test-registry.json'), 'utf8'));
  const tracked = git(['ls-files', 'tests/*.test.mjs']).trim().split(/\r?\n/).filter(Boolean);
  const candidates = [...new Set([...tracked, 'tests/whole-app-audit-runner.test.mjs'])].sort();
  assert.deepEqual(candidates.filter(file => !packageSource.includes(file) && !registry.approvedExclusions[file]), []);
});

test('comparison evaluator requires identity-bound migration scope, capability approvals and exact finding waivers', () => {
  const same = comparisonFixture('same');
  const changed = comparisonFixture('changed');
  const open = [{ id: 'GATE-DEVICE', state: 'open' }];
  const approvalIdentity = Object.freeze({
    auditProgramVersion: AUDIT_VERSION,
    auditToolingSha: 'a'.repeat(40),
    baselineManifestSha256: sha256('baseline-manifest'),
    baselineTargetSha: 'b'.repeat(40),
    productBaselineSha: PRODUCT_BASELINE_SHA,
    targetSha: 'c'.repeat(40)
  });
  const approval = ({ scope = [], capabilities = [], waivers = [], identity = approvalIdentity } = {}) => ({
    format: COMPARISON_APPROVAL_FORMAT,
    schemaVersion: 1,
    identity,
    migrationScope: { checkIds: scope, reason: 'Approved Modular HTML migration scope', approvedBy: 'Owner' },
    capabilityApprovals: capabilities,
    findingWaivers: waivers
  });
  const evaluate = (fixture, comparisonApproval) => evaluateComparison({
    baselineAudits: fixture.baseline,
    currentAudits: fixture.current,
    comparisonApproval,
    approvalIdentity,
    baselineOpenGates: open,
    currentOpenGates: open
  });

  const pass = evaluate(same, approval());
  assert.equal(pass.status, 'comparison-pass');
  assert.equal(pass.gates.find(item => item.id === 'C-03').metric.outsideMigrationScope, 1);

  const unapprovedCapability = evaluate(changed, null);
  assert.ok(unapprovedCapability.failed.includes('C-02'));
  const approvedCapability = evaluate(changed, approval({ capabilities: [{
    capabilityId: 'shell:route:home', change: 'changed',
    reason: 'Owner-approved migration delta', approvedBy: 'Owner'
  }] }));
  assert.equal(approvedCapability.gates.find(item => item.id === 'C-02').result, 'pass');

  const scopedUnwaived = evaluate(same, approval({ scope: ['A1-02'] }));
  assert.equal(scopedUnwaived.gates.find(item => item.id === 'C-03').result, 'fail');
  const persistent = same.current.flatMap(audit => audit.checks).find(check => check.id === 'A1-02');
  const exactWaiver = { checkId: persistent.id, severity: persistent.severity,
    findingSha256: comparisonFindingSha256(persistent),
    reason: 'Owner accepts this exact pre-existing finding for the scoped migration', approvedBy: 'Owner' };
  const waived = evaluate(same, approval({ scope: ['A1-02'], waivers: [exactWaiver] }));
  assert.equal(waived.gates.find(item => item.id === 'C-03').result, 'pass');
  const staleWaiver = evaluate(same, approval({ scope: ['A1-02'],
    waivers: [{ ...exactWaiver, findingSha256: '0'.repeat(64) }] }));
  assert.equal(staleWaiver.gates.find(item => item.id === 'C-03').result, 'fail');

  const regressed = comparisonFixture('same');
  const regressedFinding = regressed.current.flatMap(audit => audit.checks).find(check => check.id === 'A1-02');
  regressedFinding.metric.undeclaredDependencies = 11;
  regressedFinding.evidence.push({ code: 'ADDITIONAL_UNDECLARED_DEPENDENCY' });
  const regression = evaluate(regressed, approval());
  const regressionCodes = regression.gates.find(item => item.id === 'C-03').evidence.map(item => item.code);
  assert.ok(regressionCodes.includes('HIGH_FINDING_EVIDENCE_COUNT_REGRESSION'));
  assert.ok(regressionCodes.includes('HIGH_FINDING_ISSUE_COUNT_REGRESSION'));

  const wrongIdentity = evaluate(changed, approval({ identity: { ...approvalIdentity, targetSha: 'd'.repeat(40) } }));
  assert.equal(wrongIdentity.approval.identityBound, false);
  assert.ok(wrongIdentity.failed.includes('C-02'));
  assert.ok(wrongIdentity.failed.includes('C-03'));
});

test('APK normalization validates STORE, DEFLATE/data-descriptor, CRC, ZIP64 and build sidecars', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-apk-'));
  try {
    const first = path.join(temporary, 'first.apk');
    const second = path.join(temporary, 'second.apk');
    const changed = path.join(temporary, 'changed.apk');
    fs.writeFileSync(first, testZip([{ name: 'classes.dex', body: 'stable-product', deflate: true, descriptor: true },
      { name: 'META-INF/CERT.RSA', body: 'signature-one' }]));
    fs.writeFileSync(second, testZip([{ name: 'classes.dex', body: 'stable-product', deflate: true, descriptor: true },
      { name: 'META-INF/CERT.RSA', body: 'signature-two' }]));
    fs.writeFileSync(changed, testZip([{ name: 'classes.dex', body: 'changed-product' },
      { name: 'META-INF/CERT.RSA', body: 'signature-two' }]));
    const firstRecord = JSON.parse(safeJson(buildRecord(first)));
    const secondRecord = JSON.parse(safeJson(buildRecord(second)));
    const bound = compareApks(first, second, firstRecord, secondRecord);
    assert.equal(bound.identityBound, true);
    assert.equal(bound.toolchainMatch, true);
    assert.equal(bound.rawEqual, false);
    assert.equal(bound.normalizedEqual, true);
    assert.equal(bound.differenceClass, 'metadata-or-signing-only');
    assert.ok(!JSON.stringify(bound).includes('CERT.RSA'));
    assert.equal(bound.first.build.androidConfiguration.packageId, 'com.saagartraders.bcc');
    assert.equal(bound.first.build.androidConfiguration.versionCode, 209);
    assert.equal(bound.first.build.androidConfiguration.versionName, '2.9');
    assert.equal(bound.first.build.androidConfiguration.minSdk, 23);
    assert.match(bound.first.build.gradleWrapperJarSha256, /^[a-f0-9]{64}$/);
    assert.match(bound.first.build.gradleWrapperPropertiesSha256, /^[a-f0-9]{64}$/);
    assert.match(bound.first.build.gradleWrapperLauncherSha256, /^[a-f0-9]{64}$/);
    assert.match(bound.first.build.generatedRecipeSha256, /^[a-f0-9]{64}$/);
    assert.equal(bound.first.build.gradle.version, '8.11.1');
    assert.equal(bound.first.build.gradle.javaHomeVersion, 'openjdk version "21.0.7"');
    assert.equal(compareApks(first, changed).normalizedEqual, false);
    const mismatched = compareApks(first, second, JSON.parse(safeJson(buildRecord(first, 'one'))),
      JSON.parse(safeJson(buildRecord(second, 'two'))));
    const tamperedWrapper = structuredClone(firstRecord);
    tamperedWrapper.generatedAndroid.gradleWrapper.jarSha256 = '0'.repeat(64);
    assert.equal(compareApks(first, second, tamperedWrapper, secondRecord).identityBound, false);
    const tamperedLauncher = structuredClone(firstRecord);
    tamperedLauncher.generatedAndroid.gradleLauncher.sha256 = '0'.repeat(64);
    assert.equal(compareApks(first, second, tamperedLauncher, secondRecord).identityBound, false);
    const tamperedRecipe = structuredClone(firstRecord);
    tamperedRecipe.generatedAndroid.generatedRecipe.filesSha256 = '0'.repeat(64);
    assert.equal(compareApks(first, second, tamperedRecipe, secondRecord).identityBound, false);
    const mismatchedJvm = structuredClone(firstRecord);
    mismatchedJvm.toolchain.gradle.actualJvmVersion = '21.0.8';
    const { fingerprint: ignoredFingerprint, ...mismatchedToolchainIdentity } = mismatchedJvm.toolchain;
    void ignoredFingerprint;
    mismatchedJvm.toolchain.fingerprint = canonicalSha256(mismatchedToolchainIdentity);
    assert.equal(compareApks(first, second, mismatchedJvm, secondRecord).identityBound, false);


    assert.equal(mismatched.identityBound, true);
    assert.equal(mismatched.toolchainMatch, false);

    const corrupt = Buffer.from(fs.readFileSync(changed));
    corrupt[30 + Buffer.byteLength('classes.dex')] ^= 0xff;
    const corruptFile = path.join(temporary, 'corrupt.apk'); fs.writeFileSync(corruptFile, corrupt);
    assert.throws(() => normalizedApkFingerprint(corruptFile), /AUDIT_APK_ENTRY_INTEGRITY_FAILED/);
    const zip64 = Buffer.from(fs.readFileSync(changed));
    const central = zip64.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip64.writeUInt32LE(0xffffffff, central + 20);
    const zip64File = path.join(temporary, 'zip64.apk'); fs.writeFileSync(zip64File, zip64);
    assert.throws(() => normalizedApkFingerprint(zip64File), /AUDIT_APK_ZIP64_UNSUPPORTED/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('legacy and unsigned A10 device claims cannot self-authorize', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a10.mjs')).href);
  const context = buildContext(ROOT);
  const auditToolingSha = 'a'.repeat(40);
  const apkSha256 = sha256('installed-apk');
  const capture = { sourceSha: context.head,
    productFingerprintSha256: context.productFingerprint.treeSha256 };
  const buildEvidence = { format: 'SAAGAR_AUDIT_APK_COMPARISON', schemaVersion: 2,
    identityBound: true, toolchainMatch: true, normalizedEqual: true,
    first: { sha256: apkSha256, build: capture }, second: { sha256: apkSha256, build: capture } };
  const options = { mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA, auditToolingSha, buildEvidence };
  const check = (result, id) => result.checks.find(item => item.id === id);

  const legacy = await module.run(Object.freeze({ ...context, options: { ...options,
    performanceEvidence: {
      dat02: { physicalDevice: true, saves: Array.from({ length: 5 }, () => ({ passed: true })) },
      memory: { compatibleInstrumentation: true, collectionCycles: 2,
        preOpenBytes: 1000, postCloseBytes: 1050 }
    } } }));
  assert.equal(check(legacy, 'A10-04').result, 'unmeasured');
  assert.equal(check(legacy, 'A10-05').result, 'unmeasured');

  const unsigned = {
    format: 'SAAGAR_A10_DEVICE_RUNTIME_EVIDENCE', schemaVersion: 1,
    capturedAt: '2026-08-09T00:00:00.000Z',
    target: { sourceSha: context.head,
      productFingerprint: { algorithm: context.productFingerprint.algorithm,
        fileCount: context.productFingerprint.fileCount, totalBytes: context.productFingerprint.totalBytes,
        treeSha256: context.productFingerprint.treeSha256 },
      auditToolingSha, apkSha256, buildEvidenceSha256: canonicalSha256(buildEvidence) },
    device: { type: 'physical-android', identitySha256: sha256('physical-device'), apiLevel: 23,
      buildFingerprintSha256: sha256('android-build') },
    instrumentation: { format: 'SAAGAR_A10_DEVICE_HARNESS', schemaVersion: 1,
      artifactSha256: sha256('instrumentation-apk'), protocolSha256: sha256('capture-protocol') },
    environment: { identitySha256: sha256('device-environment'), appDataState: 'seeded',
      networkState: 'offline', powerMode: 'normal' },
    dat02: { contract: 'DAT-02-v1', saves: Array.from({ length: 5 }, (_, index) =>
      ({ sequence: index + 1, ok: true, exportMs: 100 + index, frameGapMs: 150 + index,
        totalMs: 1400 + index })) },
    memory: { contract: 'A10-05-v1', closeReopenCompleted: true, collectionCycles: 2,
      preOpenBytes: 1000, postCloseBytes: 1050 }
  };
  const deviceRuntime = { ...unsigned, evidenceSha256: canonicalSha256(unsigned) };
  const valid = await module.run(Object.freeze({ ...context, options: { ...options,
    performanceEvidence: { deviceRuntime } } }));
  assert.equal(check(valid, 'A10-04').result, 'unmeasured');
  assert.equal(check(valid, 'A10-05').result, 'unmeasured');
  assert.equal(check(valid, 'A10-04').metric.apkSha256, null);

  const wrongTargetUnsigned = { ...unsigned,
    target: { ...unsigned.target, sourceSha: 'b'.repeat(40) } };
  const wrongTarget = { ...wrongTargetUnsigned, evidenceSha256: canonicalSha256(wrongTargetUnsigned) };
  const rejected = await module.run(Object.freeze({ ...context, options: { ...options,
    performanceEvidence: { deviceRuntime: wrongTarget } } }));
  assert.equal(check(rejected, 'A10-04').result, 'unmeasured');
  assert.equal(check(rejected, 'A10-05').result, 'unmeasured');

  const extraFieldUnsigned = { ...unsigned, untrustedApproval: true };
  const extraField = { ...extraFieldUnsigned, evidenceSha256: canonicalSha256(extraFieldUnsigned) };
  const extraRejected = await module.run(Object.freeze({ ...context, options: { ...options,
    performanceEvidence: { deviceRuntime: extraField } } }));
  assert.equal(check(extraRejected, 'A10-04').result, 'unmeasured');
  assert.equal(check(extraRejected, 'A10-05').result, 'unmeasured');
});

test('external evidence requires an exact trusted Ed25519 signature', () => {
  assert.equal(EXTERNAL_EVIDENCE_TRUST_POLICY.format, 'SAAGAR_AUDIT_EXTERNAL_EVIDENCE_TRUST_POLICY');
  assert.equal(EXTERNAL_EVIDENCE_TRUST_POLICY.schemaVersion, 2);
  assert.equal(EXTERNAL_EVIDENCE_TRUST_POLICY.state, 'open');
  assert.equal(EXTERNAL_EVIDENCE_TRUST_POLICY.trustedSignerCount, 1);
  assert.equal(EXTERNAL_EVIDENCE_TRUST_POLICY.reason, 'OWNER_PROVISIONED_CONTROLLED_CAPTURE_SIGNER');

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const format = 'SAAGAR_RENDERED_UI_ATTESTATION';
  const evidenceSha256 = sha256('ephemeral-test-evidence');
  const keyId = 'ephemeral-ed25519-test-key';
  const signature = {
    format: 'SAAGAR_AUDIT_EXTERNAL_EVIDENCE_SIGNATURE', schemaVersion: 1,
    algorithm: 'Ed25519', keyId,
    signatureBase64: sign(null, externalEvidenceSignaturePayload(format, evidenceSha256), privateKey)
      .toString('base64')
  };
  const signers = [{ keyId, algorithm: 'Ed25519',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) }];
  assert.equal(verifyExternalEvidenceSignature(format, evidenceSha256, signature, signers), true);
  assert.equal(verifyExternalEvidenceSignature(format, sha256('changed'), signature, signers), false);
  assert.equal(verifyExternalEvidenceSignature('invented', evidenceSha256, signature, signers), false);
  assert.equal(verifyExternalEvidenceSignature(format, evidenceSha256,
    { ...signature, keyId: 'unknown-ed25519-test-key' }, signers), false);
  assert.equal(externalEvidenceAuthorized(format, evidenceSha256, signature), false);
});

test('browser timing samples enforce the exact bounded 5 to 30 observation window', () => {
  assert.equal(validTimingSamples([1, 2, 3, 4]), false);
  assert.equal(validTimingSamples([1, 2, 3, 4, 5]), true);
  assert.equal(validTimingSamples(Array.from({ length: 30 }, (_, index) => index)), true);
  assert.equal(validTimingSamples(Array.from({ length: 31 }, (_, index) => index)), false);
  assert.equal(validTimingSamples([1, 2, 3, 4, -1]), false);
  assert.equal(validTimingSamples([1, 2, 3, 4, 120001]), false);
});

test('A10-01 fails closed when shell parse p95 regresses despite smaller shell bytes', () => {
  const regressed = evaluateShellPerformance({ mode: 'comparison', shellBytes: 900,
    baselineShellBytes: 1000, shellParseMs: 105.001, baselineShellParseMs: 100 });
  assert.deepEqual(regressed, { comparable: true, regression: true,
    byteRegression: false, parseRegression: true });
  assert.equal(evaluateShellPerformance({ mode: 'comparison', shellBytes: 900,
    baselineShellBytes: 1000, shellParseMs: 105, baselineShellParseMs: 100 }).regression, false);
  assert.equal(evaluateShellPerformance({ mode: 'comparison', shellBytes: 1000,
    baselineShellBytes: 1000, shellParseMs: 90, baselineShellParseMs: 100 }).byteRegression, true);
  assert.equal(evaluateShellPerformance({ mode: 'comparison', shellBytes: 900,
    baselineShellBytes: 1000, shellParseMs: 90, baselineShellParseMs: null }).comparable, false);
});

test('comparison performance accepts only the measured baseline shell parse p95', () => {
  const baseline = { audits: [{ checks: [
    { id: 'A10-01', metric: { shellBytes: 1000, shellParseMs: 100 } },
    { id: 'A10-02', metric: { openP95Ms: 80 } },
    { id: 'A10-03', metric: { totalBytes: 5000 } }
  ] }] };
  const result = comparisonPerformance({ baseline: { shellBytes: 1, shellParseMs: 1,
    moduleOpenP95Ms: 1, totalShippedAssetBytes: 1 } }, baseline);
  assert.deepEqual(result.baseline, { shellBytes: 1000, shellParseMs: 100,
    moduleOpenP95Ms: 80, totalShippedAssetBytes: 5000 });
});

test('legacy counter-only rendered evidence remains unmeasured', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a6.mjs')).href);
  const context = buildContext(ROOT);
  const uiEvidence = {
    format: 'SAAGAR_RENDERED_UI_ATTESTATION', schemaVersion: 1,
    productSha: context.head, productFingerprintSha256: context.productFingerprint.treeSha256,
    toolingSha: 'a'.repeat(40), browserIdentity: 'invented-browser', matrixSha256: sha256('invented-matrix'),
    cells: Array.from({ length: 72 }, (_, index) => ({ surfaceId: `surface-${index}`,
      viewportId: 'mobile-390x844', language: 'en', measuredTargets: 1, measuredContrastSamples: 1,
      targetViolations: 0, contrastViolations: 0, renderedEvidenceSha256: sha256(String(index)) }))
  };
  const result = await module.run(Object.freeze({ ...context,
    options: Object.freeze({ mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA,
      auditToolingSha: 'a'.repeat(40), uiEvidence }) }));
  assert.equal(result.checks.find(item => item.id === 'A6-04').result, 'unmeasured');
  assert.equal(result.checks.find(item => item.id === 'A6-05').result, 'unmeasured');
});

test('tooling identity includes the controlling audit program and evidence manifests are exact', () => {
  assert.equal(isAuditToolingPath('docs/audit/AUDIT-PROGRAM-v1.md'), true);
  assert.equal(isAuditToolingPath('docs/audit/HANDOFF.md'), false);
  const identity = { mode: 'baseline', productBaselineSha: PRODUCT_BASELINE_SHA,
    targetSha: 'a'.repeat(40), auditToolingSha: 'b'.repeat(40) };
  const artifacts = BASELINE_ARTIFACT_FILES.map((file, index) => ({
    file, bytes: index + 1, sha256: sha256(file)
  }));
  const manifest = buildEvidenceManifest(identity, artifacts);
  assert.equal(manifest.format, 'SAAGAR_WHOLE_APP_AUDIT_EVIDENCE_MANIFEST');
  assert.equal(manifest.artifactCount, 17);
  assert.ok(BASELINE_ARTIFACT_FILES.includes('A5-MUTATIONS.json'));
  assert.ok(BASELINE_ARTIFACT_FILES.includes('A9-BUILD-COMPARISON.json'));
  assert.deepEqual(manifest.artifacts.map(item => item.file), [...BASELINE_ARTIFACT_FILES]);
  assert.throws(() => buildEvidenceManifest(identity, artifacts.slice(1)),
    error => error && error.message === 'AUDIT_EVIDENCE_MANIFEST_INPUT_INVALID');
});

test('runner rejects build comparisons not bound to the exact target product identity', () => {
  const context = { head: 'a'.repeat(40), productFingerprint: { treeSha256: sha256('product-tree') } };
  const build = { sourceSha: context.head,
    productFingerprintSha256: context.productFingerprint.treeSha256 };
  const evidence = { format: 'SAAGAR_AUDIT_APK_COMPARISON', schemaVersion: 2,
    first: { build }, second: { build } };
  assert.doesNotThrow(() => validateBuildEvidence(evidence, context));
  assert.doesNotThrow(() => validateBuildEvidence(null, context));
  assert.throws(() => validateBuildEvidence({ ...evidence,
    second: { build: { ...build, sourceSha: 'b'.repeat(40) } } }, context),
  error => error && error.message === 'AUDIT_BUILD_EVIDENCE_TARGET_IDENTITY_MISMATCH');
});

test('Gradle launcher executes through the platform-safe wrapper contract', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-gradle-'));
  try {
    const android = path.join(temporary, 'android');
    fs.mkdirSync(android);
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(android, 'gradlew.bat'), '@echo off\r\necho Gradle 8.11.1\r\n', 'utf8');
    } else {
      const wrapper = path.join(android, 'gradlew');
      fs.writeFileSync(wrapper, '#!/bin/sh\necho Gradle 8.11.1\n', 'utf8');
      fs.chmodSync(wrapper, 0o755);
    }
    const launcher = gradleVersionLauncher(temporary);
    const result = spawnSync(launcher.command, launcher.args, {
      cwd: launcher.cwd, encoding: 'utf8', windowsHide: true, timeout: 15000
    });
    assert.equal(result.status, 0, String(result.stderr || result.error || ''));
    assert.match(String(result.stdout), /Gradle 8\.11\.1/);
    assert.equal(launcher.display, 'android/gradlew --version');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('A3 resolves quoted-argument handlers, comment apostrophes, member calls and bindingless form controls', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a3.mjs')).href);
  // Every handler below is genuinely defined; none may be reported unresolved.
  const script = [
    'function llKey(k){ return k; }',
    'function afterComment(){',
    "  /* Union the central Brand Master, mirrors Stock's own brands: '' / 'titanworld' */",
    '  return 1;',
    '}',
    'function usesComment(){ return afterComment(); }'
  ].join('\n');
  const sources = new Map([
    ['www/index.html', [
      // 1. quoted argument inside a double-quoted handler attribute
      `<button onclick="llKey('1')">1</button>`,
      // 2. handler declared after a comment containing an odd number of apostrophes
      `<button onclick="usesComment()">C</button>`,
      // 3. qualified/member call — the method is not a top-level handler
      `<button onclick="if(window.SaagarReport)SaagarReport.openHub()">Hub</button>`,
      // 4. form value controls with no binding at all
      '<select id="emFirm"></select>',
      '<textarea id="emNotes"></textarea>'
    ].join('\n')],
    ['www/shared/a3-probe.js', script]
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({ files, productFiles: files, modules: [],
    exists: file => sources.has(file), read: file => sources.get(file) || '' });
  const check = result.checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action');

  // 1-3: the three buttons are inventoried and none is unresolved.
  assert.equal(check.metric.unresolvedActionBindings, 0);
  assert.equal(actions.length, 3);

  const quoted = actions.find(item => item.outcome.bindings
    .some(binding => binding.referencedHandlers.some(handler => handler.name === 'llKey')));
  assert.ok(quoted, 'a handler with a quoted argument must resolve');

  const afterComment = actions.find(item => item.outcome.bindings
    .some(binding => binding.referencedHandlers.some(handler => handler.name === 'usesComment')));
  assert.ok(afterComment, 'a handler declared after an apostrophe comment must be registered');

  const member = actions.find(item => item.outcome.bindings.some(binding => binding.qualifiedCalls.includes('openHub')));
  assert.ok(member, 'a member call must be captured as a qualified contract');
  assert.deepEqual(member.outcome.bindings.flatMap(binding => binding.referencedHandlers), [],
    'a member method must not be looked up as a top-level handler');

  // 4: bindingless select and textarea are form value controls, not visible actions.
  assert.equal(actions.filter(item => ['select', 'textarea'].includes(item.outcome.element)).length, 0);

  // A bound select IS still an action.
  const bound = new Map([['www/index.html', '<select id="s" onchange="llKey(\'x\')"></select>'],
    ['www/shared/a3-probe.js', script]]);
  const boundFiles = [...bound.keys()].sort();
  const boundResult = await module.run({ files: boundFiles, productFiles: boundFiles, modules: [],
    exists: file => bound.has(file), read: file => bound.get(file) || '' });
  const boundCheck = boundResult.checks.find(item => item.id === 'A3-02');
  assert.equal(boundCheck.metric.inventory.filter(item => item.outcome && item.outcome.element === 'select').length, 1);
  assert.equal(boundCheck.metric.unresolvedActionBindings, 0);
});

test('A4 classifies declared device-local keys and keeps the text-size key portable', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a4.mjs')).href);
  const context = buildContext(ROOT);
  const result = await module.run({ ...context,
    options: { mode: 'baseline', productBaseline: PRODUCT_BASELINE_SHA } });
  const classification = result.checks.find(item => item.id === 'A4-02');
  const consistency = result.checks.find(item => item.id === 'A4-03');

  // A4-03: saagar_text_size is exported and restored via appControlKeys (Wave-13
  // P1-39), so declaring it device-local contradicted the restore policy.
  assert.equal(consistency.metric.contradictions, 0);
  assert.equal(consistency.result, 'pass');

  const unclassified = new Set(classification.evidence
    .filter(item => item.code === 'UNCLASSIFIED_STORAGE').map(item => item.artifact));
  // Real keys that were previously unclassified must now carry a classification.
  for (const key of ['st_v2_pin_salt', 'bcc_autobackup_log', 'saagar_rpt_log',
    'saagar_role_switch_lock_v1', 'ui_hide_amounts', 'saagar_selected_date']) {
    assert.ok(!unclassified.has(`local-storage:${key}`), `${key} must be classified`);
  }
  // The PIN salt is a device-local secret: it must never be treated as portable.
  const census = result.checks.find(item => item.id === 'A4-01');
  const salt = census.metric.inventory
    .find(item => item.artifactId === 'local-storage:st_v2_pin_salt');
  assert.ok(salt, 'the pin salt must appear in the artifact census');
  assert.equal(salt.classification, 'device-local');
});

test('A3-02 is vetoed by capability id ambiguity but never by an unresolved binding', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a3.mjs')).href);
  const evaluate = async shell => {
    const sources = new Map([['www/index.html', shell],
      ['www/shared/a3-veto.js', 'function fnA(){ return 1; }\nfunction fnB(){ return 2; }']]);
    const files = [...sources.keys()].sort();
    const result = await module.run({ files, productFiles: files, modules: [],
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
    return result.checks.find(item => item.id === 'A3-02');
  };

  // An unresolvable handler is evidence only: it must never enter blockingCauses.
  const unresolved = await evaluate('<button onclick="totallyUndefinedFn()">Go</button>');
  assert.ok(unresolved.metric.unresolvedActionBindings > 0);
  assert.ok(!unresolved.metric.blockingCauses.includes('CAPABILITY_ID_CONFLICT'));
  assert.equal(unresolved.metric.conflictingIds, 0);
  assert.ok(unresolved.evidence.some(item => item.code === 'ACTION_HANDLER_BINDING_UNRESOLVED'),
    'an unresolved binding must still be reported as evidence');

  // Two elements with identical identity but different outcomes DO veto the verdict.
  const conflicting = await evaluate(
    '<button onclick="fnA()">Save</button>\n<button onclick="fnB()">Save</button>');
  assert.ok(conflicting.metric.conflictingIds > 0);
  assert.ok(conflicting.metric.blockingCauses.includes('CAPABILITY_ID_CONFLICT'));
  assert.equal(conflicting.result, 'unmeasured');
  assert.match(conflicting.notes, /not measurable/);
  assert.ok(conflicting.evidence.some(item => item.code === 'CAPABILITY_ID_CONFLICT'));

  // Conflict-deciding evidence can never be crowded out by unresolved rows.
  const many = Array.from({ length: 80 }, (_, index) => `<button onclick="missing${index}()">B${index}</button>`).join('\n');
  const flooded = await evaluate(`${many}\n<button onclick="fnA()">Save</button>\n<button onclick="fnB()">Save</button>`);
  assert.ok(flooded.metric.unresolvedActionBindings >= 80);
  assert.ok(flooded.evidence.some(item => item.code === 'CAPABILITY_ID_CONFLICT'),
    'the conflict must survive an evidence array flooded with unresolved bindings');
  assert.ok(flooded.evidence.some(item => item.code === 'UNRESOLVED_ACTION_BINDING_EVIDENCE_TRUNCATED'));
});

test('A3 visible action identity survives a handler swap while its bound outcome changes', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a3.mjs')).href);
  const evaluate = async handler => {
    const sources = new Map([
      ['www/index.html', '<button id="saveBtn">Save</button>'],
      ['www/shared/action-probe.js', `function ${handler}(){ return "${handler}"; }\n` +
        `document.getElementById("saveBtn").addEventListener("click", ${handler});`]
    ]);
    const files = [...sources.keys()].sort();
    const result = await module.run({
      files, productFiles: files, modules: [],
      exists: file => sources.has(file), read: file => sources.get(file) || ''
    });
    const check = result.checks.find(item => item.id === 'A3-02');
    const action = check.metric.inventory.find(item => item.category === 'visible-action');
    return { check, action };
  };
  const save = await evaluate('saveSafely');
  const remove = await evaluate('deleteEverything');
  assert.ok(save.action && remove.action);
  assert.equal(save.action.capabilityId, remove.action.capabilityId);
  assert.notDeepEqual(save.action.outcome, remove.action.outcome);
  assert.notEqual(save.check.metric.inventorySha256, remove.check.metric.inventorySha256);
  assert.equal(save.check.metric.unresolvedActionBindings, 0);
  assert.deepEqual(save.action.outcome.bindings[0].referencedHandlers.map(item => item.name), ['saveSafely']);
  assert.match(save.action.outcome.bindings[0].expressionSha256, /^[a-f0-9]{64}$/);
  assert.match(save.action.outcome.bindings[0].referencedHandlers[0].bodySha256, /^[a-f0-9]{64}$/);
});

test('A4 discovers bracket, object, bound-method and destructured localStorage access', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a4.mjs')).href);
  const index = 'function appControlKeys(){ return ["alpha", "beta", "gamma"]; }';
  const runtime = [
    'window.localStorage["setItem"]("alpha", "1");',
    'const store = root.localStorage;',
    'const read = store.getItem.bind(store);',
    'read("beta");',
    'const { removeItem: drop } = globalThis.localStorage;',
    'drop("gamma");'
  ].join('\n');
  const sources = new Map([['www/index.html', index], ['www/shared/storage-probe.js', runtime]]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [],
    exists: file => sources.has(file), read: file => sources.get(file) || ''
  });
  const check = result.checks.find(item => item.id === 'A4-01');
  assert.equal(check.result, 'pass', JSON.stringify(check.evidence));
  assert.equal(check.mandatory, true);
  assert.equal(check.metric.inventoryComplete, true);
  assert.deepEqual(check.metric.inventory.map(item => [item.artifactId, item.operations]), [
    ['local-storage:alpha', ['setItem']],
    ['local-storage:beta', ['getItem']],
    ['local-storage:gamma', ['removeItem']]
  ]);
  assert.equal(check.metric.inventory.some(row => Object.hasOwn(row, 'line') || Object.hasOwn(row, 'path')), false);
});

test('A4 key normalization survives multi-declarators, comments and derived integration feeds', async () => {
  /* P4.2 regression fixtures. The three normalizations below are what took A4-02
     from 59 unclassified artifacts to zero and C-04 from 61 deltas to zero. None
     of them had a test, so any of them could have been reverted silently and the
     storage contract would have started drifting again on the next refactor. */
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a4.mjs')).href);
  const evaluate = async runtime => {
    const sources = new Map([
      ['www/index.html', 'function appControlKeys(){ return ["saagar_master_customers"]; }'],
      ['www/shared/storage-probe.js', runtime]
    ]);
    const files = [...sources.keys()].sort();
    const result = await module.run({ files, productFiles: files, modules: [],
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
    const census = result.checks.find(item => item.id === 'A4-01');
    const classification = result.checks.find(item => item.id === 'A4-02');
    return { census, classification,
      ids: census.metric.inventory.map(row => row.artifactId),
      unclassified: classification.metric.unclassifiedArtifacts };
  };

  // 1. A key declared as a LATER declarator in one statement must still resolve.
  //    Reading only the first declarator turned saagar_master_customers into a
  //    computed artifact, which is what made it look "removed" after the migration.
  const multi = await evaluate(
    "var MK_BRANDS='saagar_master_brands', MK_CUSTOMERS='saagar_master_customers';\n" +
    'localStorage.getItem(MK_CUSTOMERS);');
  assert.ok(multi.ids.includes('local-storage:saagar_master_customers'),
    'a later declarator in a multi-declarator statement must resolve to its literal key');
  assert.ok(!multi.ids.some(id => /computed-/.test(id)),
    'a resolvable key must never be recorded as a computed identity');
  assert.equal(multi.unclassified, 0);

  // 2. Commented-out storage access must not enter the census at all.
  const commented = await evaluate([
    "var MK_CUSTOMERS='saagar_master_customers';",
    '// localStorage.getItem("saagar_ghost_line_comment");',
    '/* localStorage.getItem("saagar_ghost_block_comment"); */',
    '<!-- localStorage.getItem("saagar_ghost_html_comment"); -->',
    'localStorage.getItem(MK_CUSTOMERS);'
  ].join('\n'));
  for (const ghost of ['saagar_ghost_line_comment', 'saagar_ghost_block_comment', 'saagar_ghost_html_comment']) {
    assert.ok(!commented.ids.includes(`local-storage:${ghost}`), `${ghost} is commented out and must not be inventoried`);
  }
  assert.equal(commented.unclassified, 0);

  // 3. Derived integration feeds are re-derivable, not device-local or portable:
  //    they are rebuilt from their owning module's data, so restoring them would
  //    resurrect stale cross-module state.
  const feeds = await evaluate([
    "var MK_CUSTOMERS='saagar_master_customers';",
    "localStorage.setItem('saagar_bus', '[]');",
    "localStorage.setItem('saagar_cro_audit_feed', '[]');",
    "localStorage.setItem('saagar_payroll_attendance_feed', '[]');",
    "localStorage.setItem('saagar_tax_payable', '[]');",
    'localStorage.getItem(MK_CUSTOMERS);'
  ].join('\n'));
  assert.equal(feeds.unclassified, 0);
  for (const feed of ['saagar_bus', 'saagar_cro_audit_feed', 'saagar_payroll_attendance_feed', 'saagar_tax_payable']) {
    const row = feeds.census.metric.inventory.find(item => item.artifactId === `local-storage:${feed}`);
    assert.ok(row, `${feed} must be inventoried`);
    assert.equal(row.classification, 're-derivable-excluded', `${feed} must be re-derivable-excluded`);
    assert.equal(row.owner, 'integration-bridge');
  }
});

test('A4 inventories computed storage identities while leaving an empty census unmeasured', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a4.mjs')).href);
  const index = 'function appControlKeys(){ return ["alpha"]; }';
  const evaluate = async runtime => {
    const sources = new Map([['www/index.html', index]]);
    if (runtime !== null) sources.set('www/shared/storage-probe.js', runtime);
    const files = [...sources.keys()].sort();
    const result = await module.run({ files, productFiles: files, modules: [],
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
    return result;
  };
  const dynamicResult = await evaluate('const store = localStorage;\nstore[methodName]("alpha");\nstore.getItem(makeKey());');
  const dynamic = dynamicResult.checks.find(item => item.id === 'A4-01');
  assert.equal(dynamic.result, 'pass');
  assert.equal(dynamic.metric.inventoryComplete, true);
  assert.match(dynamic.metric.inventorySha256, /^[a-f0-9]{64}$/);
  assert.ok(dynamic.metric.inventory.some(item => item.unresolved &&
    item.artifactId === 'local-storage-access:dynamic-key'));
  assert.equal(dynamicResult.checks.find(item => item.id === 'A4-02').result, 'pass');
  const empty = (await evaluate(null)).checks.find(item => item.id === 'A4-01');
  assert.equal(empty.result, 'unmeasured');
  assert.ok(empty.evidence.some(item => item.code === 'PERSISTENT_ARTIFACT_CENSUS_EMPTY'));
});

test('C-04 fails added, removed and changed storage contracts and unmeasures missing inventory', () => {
  const storageCheck = (fixture, side = 'current') => fixture[side].find(audit => audit.auditId === 'A4')
    .checks.find(check => check.id === 'A4-01');
  const writeInventory = (fixture, inventory, side = 'current') => {
    const check = storageCheck(fixture, side);
    check.metric = storageContractMetric(inventory);
  };
  const evaluate = fixture => evaluateComparison({ baselineAudits: fixture.baseline,
    currentAudits: fixture.current, baselineOpenGates: [], currentOpenGates: [] })
    .gates.find(gate => gate.id === 'C-04');
  const cases = [
    ['changed', 'STORAGE_ARTIFACT_CONTRACT_CHANGED', fixture => {
      const inventory = structuredClone(storageCheck(fixture).metric.inventory);
      inventory[0].owner = 'unexpected-owner';
      writeInventory(fixture, inventory);
    }],
    ['added', 'STORAGE_ARTIFACT_ADDED', fixture => {
      const inventory = structuredClone(storageCheck(fixture).metric.inventory);
      inventory.push({ ...inventory[1], artifactId: 'local-storage:zz_added', name: 'zz_added' });
      writeInventory(fixture, inventory);
    }],
    ['removed', 'STORAGE_ARTIFACT_REMOVED', fixture => {
      writeInventory(fixture, structuredClone(storageCheck(fixture).metric.inventory.slice(0, 1)));
    }]
  ];
  for (const [label, code, mutate] of cases) {
    const fixture = comparisonFixture('same');
    mutate(fixture);
    const gate = evaluate(fixture);
    assert.equal(gate.result, 'fail', label);
    assert.ok(gate.evidence.some(item => item.code === code), label);
  }
  const producerOrder = comparisonFixture('same');
  const inventory = structuredClone(storageCheck(producerOrder).metric.inventory);
  inventory.push({ ...inventory[1], artifactId: 'local-storage-access:clear-all',
    kind: 'local-storage-access', name: 'clear-all', operations: ['clear'] });
  writeInventory(producerOrder, structuredClone(inventory), 'baseline');
  writeInventory(producerOrder, inventory);
  assert.equal(evaluate(producerOrder).result, 'pass',
    'producer kind/name ordering remains a valid storage contract');
  const missing = comparisonFixture('same');
  delete storageCheck(missing).metric.inventory;
  const gate = evaluate(missing);
  assert.equal(gate.result, 'unmeasured');
  assert.ok(gate.evidence.some(item => item.code === 'STORAGE_CONTRACT_INVENTORY_UNAVAILABLE'));
});
test('A7 inventories represented dynamic message contracts without generic type false positives', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const evaluate = async source => {
    const sources = new Map([
      ['www/index.html', '<!doctype html><title>Dynamic message probe</title>'],
      ['www/shared/mah4-runtime.js', 'const VERSION = 1;'],
      ['www/shared/message-dynamic-probe.js', source]
    ]);
    const files = [...sources.keys()].sort();
    const result = await module.run({
      files, productFiles: files, modules: [], sharedAssets: [],
      exists: file => sources.has(file), read: file => sources.get(file) || ''
    });
    return result.checks;
  };
  const dynamic = await evaluate([
    'parent.postMessage({ type: makeType(), payload: makePayload() }, "*");',
    'window.addEventListener("message", event => { if (event.data.type === expectedType) consume(event.data); });',
    'if (policy.type === expectedPolicyType) applyPolicy();'
  ].join('\n'));
  const inventory = dynamic.find(item => item.id === 'A7-01');
  assert.equal(inventory.result, 'unmeasured', JSON.stringify(inventory.evidence));
  assert.ok(inventory.evidence.some(item => item.code === 'STATIC_DISCOVERY_COVERAGE_INCOMPLETE'));
  assert.equal(inventory.metric.staticAbsenceIsProof, false);
  assert.equal(inventory.mandatory, true);
  assert.equal(inventory.metric.inventoryComplete, true);
  assert.equal(inventory.metric.unresolvedContracts, 2);
  assert.match(inventory.metric.inventorySha256, /^[a-f0-9]{64}$/);
  assert.ok(inventory.metric.inventory.every(row => row.kind === 'unresolved'));
  assert.equal(inventory.metric.inventory.some(row => Object.hasOwn(row, 'line')), false);
  assert.equal(dynamic.find(item => item.id === 'A7-02').result, 'unmeasured');
  assert.equal(dynamic.find(item => item.id === 'A7-03').result, 'unmeasured');

  const empty = await evaluate('');
  const emptyInventory = empty.find(item => item.id === 'A7-01');
  assert.equal(emptyInventory.result, 'unmeasured');
  assert.equal(emptyInventory.metric.inventorySha256, null);
  assert.ok(emptyInventory.evidence.some(item => item.code === 'MESSAGE_CONTRACT_CENSUS_EMPTY'));
});

test('C-07 compares semantic message contracts and unmeasures missing inventory', () => {
  const messageCheck = fixture => fixture.current.find(audit => audit.auditId === 'A7')
    .checks.find(check => check.id === 'A7-01');
  const evaluate = fixture => evaluateComparison({ baselineAudits: fixture.baseline,
    currentAudits: fixture.current, baselineOpenGates: [], currentOpenGates: [] })
    .gates.find(gate => gate.id === 'C-07');

  const changed = comparisonFixture('same');
  const inventory = structuredClone(messageCheck(changed).metric.inventory);
  /* Relocation is expected during modular extraction and is not a protocol
     change. A newly emitted payload shape is a semantic expansion and must
     still fail the continuity gate. */
  inventory[0].receiverContracts[0].path = 'www/shared/changed-runtime.js';
  messageCheck(changed).metric = messageContractMetric(inventory);
  assert.equal(evaluate(changed).result, 'pass');

  const expanded = comparisonFixture('same');
  const expandedInventory = structuredClone(messageCheck(expanded).metric.inventory);
  expandedInventory[0].senderContracts.push({ path: 'www/shared/new-runtime.js',
    payloadFields: [{ field: 'newField', kind: 'string' }] });
  expandedInventory[0].senderContracts.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  messageCheck(expanded).metric = messageContractMetric(expandedInventory);
  const changedGate = evaluate(expanded);
  assert.equal(changedGate.result, 'fail');
  assert.ok(changedGate.evidence.some(item => item.code === 'MESSAGE_CONTRACT_CHANGED'));

  const missing = comparisonFixture('same');
  delete messageCheck(missing).metric.inventory;
  const missingGate = evaluate(missing);
  assert.equal(missingGate.result, 'unmeasured');
  assert.ok(missingGate.evidence.some(item => item.code === 'MESSAGE_CONTRACT_INVENTORY_UNAVAILABLE'));

  /* Closure addendum §3: an inventory without explicit complete static-discovery
     authority is evidence, not proof. Withdrawing the flag on either side alone
     must force C-07 to unmeasured even though both inventories are otherwise
     well formed and identical. */
  for (const side of ['baseline', 'current']) {
    const withheld = comparisonFixture('same');
    const target = withheld[side].find(audit => audit.auditId === 'A7').checks.find(check => check.id === 'A7-01');
    delete target.metric.staticDiscoveryComplete;
    const gate = evaluate(withheld);
    assert.equal(gate.result, 'unmeasured', `${side} without discovery authority must not authorize C-07`);
    assert.ok(gate.evidence.some(item => item.code === 'MESSAGE_CONTRACT_INVENTORY_UNAVAILABLE'));
  }
});

test('every controlled-build receipt consumer accepts exactly schema v2', () => {
  /* The receipt schema is shared by five modules. A consumer left on v1 would
     silently reject every real capture, and no existing fixture exercised the
     A10 path — it was found by inspection, not by a failing test. This asserts
     the version at every declared consumer so the next bump cannot half-land. */
  const consumers = [
    ['scripts/audit/run.mjs', 'SAAGAR_AUDIT_APK_COMPARISON'],
    ['scripts/audit/controlled-probes.mjs', 'SAAGAR_AUDIT_APK_COMPARISON'],
    ['scripts/audit/compare-apks.mjs', 'SAAGAR_AUDIT_BUILD_CAPTURE'],
    ['scripts/audit/audits/a9.mjs', 'SAAGAR_AUDIT_APK_COMPARISON'],
    ['scripts/audit/audits/a10.mjs', 'SAAGAR_AUDIT_APK_COMPARISON']
  ];
  for (const [file, format] of consumers) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const guard = new RegExp(`${format}'[^\\n]*schemaVersion !== (\\d+)`);
    const matched = guard.exec(source);
    assert.ok(matched, `${file} must guard the ${format} schema version`);
    assert.equal(matched[1], '2', `${file} still accepts schema v${matched[1]} for ${format}`);
  }
  const capture = fs.readFileSync(path.join(ROOT, 'scripts/audit/capture-build.mjs'), 'utf8');
  assert.match(capture, /SAAGAR_AUDIT_BUILD_CAPTURE', schemaVersion: 2/);
  const comparison = fs.readFileSync(path.join(ROOT, 'scripts/audit/compare-apks.mjs'), 'utf8');
  assert.match(comparison, /schemaVersion: 2,\s*\n\s*identityBound/);
});

test('receipt v2 requires both builds to agree on dependency and Gradle closures', () => {
  /* Two equal APK hashes must not pass A9 when the inputs were differently
     prepared — that is the exact false acceptance receipt v2 exists to close. */
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-receipt-v2-'));
  try {
    const apk = path.join(temporary, 'app-debug.apk');
    fs.writeFileSync(apk, testZip([{ name: 'classes.dex', body: 'stable-product', deflate: true, descriptor: true },
      { name: 'META-INF/CERT.RSA', body: 'signature-one' }]));
    const record = (closureTag = 'same') => JSON.parse(safeJson(buildRecord(apk, 'same', closureTag)));

    const agreeing = compareApks(apk, apk, record(), record());
    assert.equal(agreeing.rawEqual, true);
    assert.equal(agreeing.identityBound, true);
    assert.equal(agreeing.toolchainMatch, true);

    for (const differing of ['dependency-drift', 'gradle-drift']) {
      const mismatched = compareApks(apk, apk, record(), record(differing));
      assert.equal(mismatched.rawEqual, true, 'the artifacts are still byte-identical');
      assert.equal(mismatched.toolchainMatch, false,
        `identical APKs from a ${differing} must not report agreeing inputs`);
    }

    /* A record missing the v2 blocks entirely cannot bind at all. */
    const legacy = record();
    delete legacy.dependencyClosure;
    assert.equal(compareApks(apk, apk, legacy, record()).identityBound, false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('receipt v2 requires the captured Gradle JVM proof marker', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-jvm-proof-'));
  try {
    const apk = path.join(temporary, 'app-debug.apk');
    fs.writeFileSync(apk, testZip([{ name: 'classes.dex', body: 'stable-product' }]));
    const record = () => JSON.parse(safeJson(buildRecord(apk)));
    assert.equal(compareApks(apk, apk, record(), record()).identityBound, true);
    const missing = record();
    delete missing.toolchain.gradle.jvmProof;
    assert.equal(compareApks(apk, apk, record(), missing).identityBound, false);
    const forged = record();
    forged.toolchain.gradle.jvmProof = 'unverified';
    assert.equal(compareApks(apk, apk, record(), forged).identityBound, false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('no heuristic-clean A7 or A8 case reports pass without explicit discovery authority', async () => {
  /* The single guard for the false-pass class the closure addendum closes. A
     synthetic source with no violation at all must never reach 'pass' on a
     heuristic check: absence of a discovered violation is not proof of absence.
     Definite violations must still fail, so the checks stay useful. */
  const clean = new Map([
    ['www/index.html', '<!doctype html>\n<script>function render(){ return 1; }</script>'],
    ['www/shared/mah4-runtime.js', 'const VERSION = 1;']
  ]);
  const files = [...clean.keys()].sort();
  const context = {
    files, productFiles: files, modules: [], sharedAssets: [],
    exists: file => clean.has(file), read: file => clean.get(file) || ''
  };

  const heuristicChecks = ['A7-01', 'A7-02', 'A7-03', 'A7-05', 'A8-01', 'A8-02', 'A8-03', 'A8-04', 'A8-05'];
  for (const audit of ['a7', 'a8']) {
    const module = await import(pathToFileURL(path.join(ROOT, `scripts/audit/audits/${audit}.mjs`)).href);
    const result = await module.run(context);
    for (const check of result.checks) {
      if (!heuristicChecks.includes(check.id)) continue;
      assert.notEqual(check.result, 'pass',
        `${check.id} reported pass from a heuristic-clean scan: ${JSON.stringify(check.evidence)}`);
      assert.equal(check.metric.staticAbsenceIsProof, false, `${check.id} must declare absence is not proof`);
    }
  }
});

test('A8 uses conservative PII, export, auth, remote and all-tracked secret decisions', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a8.mjs')).href);
  const evaluate = async entries => {
    const sources = new Map(entries);
    const files = [...sources.keys()].sort();
    return module.run({ files, productFiles: files.filter(file => /^www\//.test(file)),
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
  };
  const check = (result, id) => result.checks.find(item => item.id === id);

  const noPii = await evaluate([['www/shared/no-pii.js', 'function render(){ return "safe"; }']]);
  assert.equal(check(noPii, 'A8-01').result, 'unmeasured');
  assert.deepEqual(check(noPii, 'A8-01').evidence, [{ code: 'PII_FLOW_STATIC_ANALYSIS_INCOMPLETE' }]);
  const definitePii = await evaluate([['www/shared/pii-probe.js',
    'function leakCustomer(){ console.log(customerMobile); }']]);
  assert.equal(check(definitePii, 'A8-01').result, 'fail');
  assert.ok(check(definitePii, 'A8-01').evidence.some(item => item.code === 'PII_TO_UNAPPROVED_SINK'));

  const tokenMention = await evaluate([['www/shared/export-probe.js', [
    'function unsafeDownload(){',
    '  const token = "mentioned-only";',
    '  void SaagarExportControl; void beginDelivery;',
    '  const anchor = document.createElement("a");',
    '  anchor.download = "unsafe.csv";',
    '}'
  ].join('\n')]]);
  assert.equal(check(tokenMention, 'A8-02').result, 'fail');
  assert.ok(check(tokenMention, 'A8-02').evidence.some(item =>
    item.code === 'EXPORT_POLICY_BYPASS' && item.sink === 'ANCHOR_DOWNLOAD'));

  const auth = await evaluate([['www/shared/auth-probe.js', [
    'const checkPin = async () => { try { return await gate(); } catch { return true; } };',
    'const verifyAuth = function namedAuth(){ try { return policy(); } catch (error) { return true; } };',
    'function checkAccess(){ try { return guard(); } catch { return true; } }'
  ].join('\n')]]);
  const authCheck = check(auth, 'A8-03');
  assert.equal(authCheck.result, 'fail');
  assert.deepEqual([...new Set(authCheck.evidence.map(item => item.function))].sort(),
    ['checkAccess', 'checkPin', 'verifyAuth']);
  assert.ok(authCheck.evidence.every(item => item.code === 'AUTH_FAIL_OPEN_EXCEPTION'));

  const unresolvedAuth = await evaluate([['www/shared/auth-dynamic.js',
    'const verifyAuth = dynamicFactory(policyName);']]);
  assert.equal(check(unresolvedAuth, 'A8-03').result, 'unmeasured');
  assert.ok(check(unresolvedAuth, 'A8-03').evidence.some(item =>
    item.code === 'AUTH_CONTROL_STATIC_ANALYSIS_UNRESOLVED'));

  const dynamicRemote = await evaluate([['www/shared/network-probe.js',
    'function request(endpoint){ return fetch(endpoint); }']]);
  assert.equal(check(dynamicRemote, 'A8-05').result, 'fail');
  assert.ok(check(dynamicRemote, 'A8-05').evidence.some(item =>
    item.code === 'REMOTE_TARGET_POLICY_NOT_CLOSED' && item.unresolvedDynamicTargets === 1));
  const literalRemote = await evaluate([['www/shared/network-literal.js',
    'fetch("https://unapproved.example.test/private");']]);
  assert.equal(check(literalRemote, 'A8-05').result, 'fail');
  assert.ok(check(literalRemote, 'A8-05').evidence.some(item =>
    item.code === 'REMOTE_TARGET_POLICY_NOT_CLOSED' && item.definiteRemoteCalls === 1));

  const workflowSecret = 'correct-horse-battery-staple';
  const workflow = await evaluate([['.github/workflows/release.yml', [
    'name: release',
    'jobs:',
    '  publish:',
    '    env:',
    `      deploy_password: ${workflowSecret}`
  ].join('\n')]]);
  const secretCheck = check(workflow, 'A8-04');
  assert.equal(secretCheck.result, 'fail');
  assert.equal(secretCheck.metric.scannedTextFiles, 1);
  assert.ok(secretCheck.evidence.some(item => item.path === '.github/workflows/release.yml' &&
    item.ruleId === 'ASSIGNED_SECRET' && /^[a-f0-9]{20}$/.test(item.fingerprint)));
  assert.equal(JSON.stringify(secretCheck).includes(workflowSecret), false);
});
test('A7 pairs literal receivers only inside event-data or registered message handlers', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const evaluate = async probe => {
    const sources = new Map([
      ['www/index.html', '<!doctype html><title>Message scope</title>'],
      ['www/shared/mah4-runtime.js', 'const VERSION = 1;'],
      ['www/shared/message-scope-probe.js', probe]
    ]);
    const files = [...sources.keys()].sort();
    const result = await module.run({
      files, productFiles: files, modules: [], sharedAssets: [],
      exists: file => sources.has(file), read: file => sources.get(file) || ''
    });
    return result.checks;
  };

  const unrelated = await evaluate([
    'parent.postMessage({ type: "ST_SCOPE_TEST", value: "sent" }, "*");',
    'if (record.type === "ST_SCOPE_TEST") consume(record);',
    'if ("ST_SCOPE_TEST" === record.type) consume(record);',
    'switch (record.type) { case "ST_SCOPE_TEST": consume(record); break; }'
  ].join('\n'));
  const unrelatedInventory = unrelated.find(item => item.id === 'A7-01');
  assert.equal(unrelatedInventory.metric.senderSites, 1);
  assert.equal(unrelatedInventory.metric.receiverSites, 0);
  const unrelatedLifecycle = unrelated.find(item => item.id === 'A7-02');
  assert.equal(unrelatedLifecycle.result, 'fail');
  assert.ok(unrelatedLifecycle.evidence.some(item =>
    item.type === 'ST_SCOPE_TEST' && item.code === 'MESSAGE_SENT_NEVER_HANDLED'));

  const scopedSwitch = await evaluate([
    'parent.postMessage({ type: "ST_SCOPE_TEST", value: "sent" }, "*");',
    'function onMessage(event) {',
    '  switch (event.data.type) { case "ST_SCOPE_TEST": consume(event.data); break; }',
    '}',
    'window.addEventListener("message", onMessage);'
  ].join('\n'));
  const scopedInventory = scopedSwitch.find(item => item.id === 'A7-01');
  assert.equal(scopedInventory.metric.senderSites, 1);
  assert.equal(scopedInventory.metric.receiverSites, 1);
  assert.equal(scopedSwitch.find(item => item.id === 'A7-02').result, 'unmeasured');
});
test('A7 resolves only one exact top-level literal sender type', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const probe = [
    'parent.postMessage({ payload: { type: "ST_NESTED" } }, "*");',
    'parent.postMessage({ type: "ST_DUPLICATE", type: "ST_DUPLICATE" }, "*");',
    'parent.postMessage({ type: "ST_TOP_LEVEL", value: "ok" }, "*");',
    'window.addEventListener("message", event => {',
    '  if (event.data.type === "ST_TOP_LEVEL") consume(event.data);',
    '});'
  ].join('\n');
  const sources = new Map([
    ['www/index.html', '<!doctype html><title>Sender scope</title>'],
    ['www/shared/mah4-runtime.js', 'const VERSION = 1;'],
    ['www/shared/message-sender-scope.js', probe]
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], sharedAssets: [],
    exists: file => sources.has(file), read: file => sources.get(file) || ''
  });
  const inventory = result.checks.find(item => item.id === 'A7-01');
  const resolvedTypes = inventory.metric.inventory
    .filter(row => row.kind === 'resolved').map(row => row.messageType);
  assert.deepEqual(resolvedTypes, ['ST_TOP_LEVEL']);
  assert.equal(inventory.metric.senderSites, 1);
  assert.equal(inventory.metric.receiverSites, 1);
  assert.equal(inventory.metric.unresolvedContracts, 2);
  assert.ok(inventory.metric.inventory.filter(row => row.kind === 'unresolved')
    .every(row => row.unresolvedCode === 'MESSAGE_SENDER_TYPE_UNRESOLVED'));
  assert.equal(result.checks.find(item => item.id === 'A7-02').result, 'unmeasured');
});

test('A7 excludes non-shell worker protocols and measures HTML shell handlers and delegated host receivers', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const shell = [
    '<!doctype html><div data-label="Owner\'s protocol"></div>',
    '<script>',
    'window.addEventListener("message", event => {',
    '  if (event.data.type === "ST_SHELL_EVENT") consume(event.data);',
    '});',
    '</script>'
  ].join('\n');
  const protocol = [
    'parent.postMessage({ type: "ST_SHELL_EVENT", value: "ok" }, "*");',
    'frame.contentWindow.postMessage({ type: "ST_HOST_EVENT", value: "ok" }, "*");',
    'function message(event) {',
    '  const packet = event.data;',
    '  if (packet.type === "ST_HOST_EVENT") consume(packet);',
    '}'
  ].join('\n');
  const workerClient = [
    'const worker = new Worker("etp-import-worker.js");',
    'worker.onmessage = function(event) { consume(event.data); };',
    'worker.postMessage({ type: "PARSE_FOUR_REPORTS", items: [] });'
  ].join('\n');
  const worker = [
    'self.onmessage = function(event) {',
    '  if (event.data.type !== "PARSE_FOUR_REPORTS") return;',
    '  self.postMessage({ ok: false, code: "INVALID" });',
    '};'
  ].join('\n');
  const sources = new Map([
    ['www/index.html', shell],
    ['www/shared/mah4-runtime.js', 'const VERSION = 1;'],
    ['www/shared/protocol-abstraction.js', protocol],
    ['www/etp-worker-client.js', workerClient],
    ['www/etp-import-worker.js', worker]
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], sharedAssets: [],
    staticDiscoveryAuthority: { complete: true, source: 'test:a7-static-census' },
    messageInventoryAuthority: { complete: true, source: 'test:a7-message-census' },
    exists: file => sources.has(file), read: file => sources.get(file) || ''
  });
  const inventory = result.checks.find(item => item.id === 'A7-01');
  assert.deepEqual(inventory.metric.inventory.filter(row => row.kind === 'resolved')
    .map(row => row.messageType), ['ST_HOST_EVENT', 'ST_SHELL_EVENT']);
  assert.equal(inventory.metric.senderSites, 2);
  assert.equal(inventory.metric.receiverSites, 2);
  assert.equal(inventory.metric.unresolvedContracts, 0);
  assert.equal(result.checks.find(item => item.id === 'A7-02').result, 'pass');
  assert.equal(JSON.stringify(inventory).includes('PARSE_FOUR_REPORTS'), false);
  assert.equal(JSON.stringify(inventory).includes('ETP_WORKER'), false);
});

test('A7 hash-binds expression fields as represented dynamic shapes under complete authority', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const source = [
    'parent.postMessage({ type: "ST_DYNAMIC_FIELD", value: makeValue() }, "*");',
    'window.addEventListener("message", event => {',
    '  if (event.data.type === "ST_DYNAMIC_FIELD") consume(event.data);',
    '});'
  ].join('\n');
  const sources = new Map([
    ['www/index.html', '<!doctype html><title>Shape uncertainty</title>'],
    ['www/shared/mah4-runtime.js', 'const VERSION = 1;'],
    ['www/shared/protocol-shape.js', source]
  ]);
  const files = [...sources.keys()].sort();
  const result = await module.run({
    files, productFiles: files, modules: [], sharedAssets: [],
    staticDiscoveryAuthority: { complete: true, source: 'test:a7-static-census' },
    messageInventoryAuthority: { complete: true, source: 'test:a7-message-census' },
    exists: file => sources.has(file), read: file => sources.get(file) || ''
  });
  const lifecycle = result.checks.find(item => item.id === 'A7-02');
  const shape = result.checks.find(item => item.id === 'A7-03');
  assert.equal(lifecycle.result, 'pass');
  assert.equal(lifecycle.metric.unresolvedContracts, 0);
  assert.equal(shape.result, 'pass');
  assert.equal(shape.metric.unresolvedContracts, 0);
  assert.equal(shape.metric.representedDynamicContracts, 1);
  assert.ok(shape.evidence.some(item => item.code === 'STATIC_DISCOVERY_COVERAGE_COMPLETE'));
});

test('A8 rejects computed sinks, fail-open methods, uncontrolled helpers and nested fake guards', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a8.mjs')).href);
  const evaluate = async source => {
    const sources = new Map([['www/shared/final-security-probe.js', source]]);
    const files = [...sources.keys()];
    return module.run({
      files, productFiles: files,
      exists: file => sources.has(file), read: file => sources.get(file) || ''
    });
  };
  const check = (result, id) => result.checks.find(item => item.id === id);

  const computedDownload = await evaluate([
    'function deliver(){',
    '  const anchor = document.createElement("a");',
    '  anchor["download"] = "report.csv";',
    '}'
  ].join('\n'));
  const computedDownloadCheck = check(computedDownload, 'A8-02');
  assert.equal(computedDownloadCheck.result, 'fail');
  assert.ok(computedDownloadCheck.evidence.some(row =>
    row.code === 'EXPORT_POLICY_BYPASS' && row.sink === 'ANCHOR_DOWNLOAD'));

  const computedFetch = await evaluate('globalThis["fetch"](makeUrl());');
  const computedFetchCheck = check(computedFetch, 'A8-05');
  assert.equal(computedFetchCheck.result, 'fail');
  assert.ok(computedFetchCheck.evidence.some(row =>
    row.code === 'REMOTE_TARGET_POLICY_NOT_CLOSED' && row.unresolvedDynamicTargets === 1));
  assert.equal(JSON.stringify(computedFetchCheck).includes('makeUrl'), false);

  const methodAuth = await evaluate([
    'const policy = { verifyAuth(){ try { return gate(); } catch { return true; } } };',
    'class AccessPolicy { checkPin(){ try { return pinGate(); } catch (error) { return true; } } }'
  ].join('\n'));
  const methodAuthCheck = check(methodAuth, 'A8-03');
  assert.equal(methodAuthCheck.result, 'fail');
  assert.deepEqual([...new Set(methodAuthCheck.evidence.map(row => row.function))].sort(),
    ['checkPin', 'verifyAuth']);

  const computedAuth = await evaluate(
    'const policy = { [verifyAuth](){ try { return gate(); } catch { return false; } } };');
  const computedAuthCheck = check(computedAuth, 'A8-03');
  assert.equal(computedAuthCheck.result, 'unmeasured');
  assert.ok(computedAuthCheck.evidence.some(row =>
    row.code === 'AUTH_CONTROL_STATIC_ANALYSIS_UNRESOLVED' &&
    row.function === 'computed-auth-method' && /^[a-f0-9]{20}$/.test(row.expressionFingerprint)));

  const mixedHelper = await evaluate([
    'function emitFile(){ const anchor = document.createElement("a"); anchor.download = "report.csv"; }',
    'function guarded(){ if (!beginDelivery()) { return; } emitFile(); }',
    'emitFile();'
  ].join('\n'));
  assert.equal(check(mixedHelper, 'A8-02').result, 'fail');

  const guardedHelper = await evaluate([
    'function emitFile(){ const anchor = document.createElement("a"); anchor.download = "report.csv"; }',
    'function guarded(){ if (!beginDelivery()) { return; } emitFile(); }'
  ].join('\n'));
  assert.equal(check(guardedHelper, 'A8-02').result, 'unmeasured');

  const nestedFakeGuard = await evaluate([
    'function deliver(){',
    '  if (!beginDelivery()) { (() => { return; })(); }',
    '  const anchor = document.createElement("a");',
    '  anchor.download = "report.csv";',
    '}'
  ].join('\n'));
  assert.equal(check(nestedFakeGuard, 'A8-02').result, 'fail');

  const directGuard = await evaluate([
    'function deliver(){',
    '  if (!beginDelivery()) { return; }',
    '  const anchor = document.createElement("a");',
    '  anchor["download"] = "report.csv";',
    '}'
  ].join('\n'));
  assert.equal(check(directGuard, 'A8-02').result, 'unmeasured');
});

test('controlled signing parser rejects decoys, reversed guards, wrong scopes and literal credentials', () => {
  const valid = [
    'android {',
    '  def decoy = "buildTypes { debug { signingConfig signingConfigs.release } }"',
    '  /* signingConfigs { release { storePassword "not-code" } } */',
    '  signingConfigs {',
    '    release {',
    '      def ks = System.getenv("SAAGAR_KEYSTORE_FILE")',
    '      def ksp = System.getenv("SAAGAR_KEYSTORE_PASSWORD")',
    '      def ka = System.getenv("SAAGAR_KEY_ALIAS")',
    '      def kap = System.getenv("SAAGAR_KEY_PASSWORD")',
    '      def wantsRelease = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }',
    '      if (wantsRelease && (!ks || !ksp || !ka || !kap)) {',
    '        throw new GradleException("blocked")',
    '      }',
    '      if (ks && ksp && ka && kap) {',
    '        storeFile file(ks)',
    '        storePassword ksp',
    '        keyAlias ka',
    '        keyPassword kap',
    '      }',
    '    }',
    '  }',
    '  buildTypes {',
    '    release { debuggable false; signingConfig signingConfigs.release }',
    '    debug { debuggable true }',
    '  }',
    '}'
  ].join('\n');
  const parsed = parseGeneratedSigningConfiguration(valid);
  assert.equal(parsed.valid, true, JSON.stringify(parsed.findings));
  const generatedCapacitorRelease = valid.replace(
    'release { debuggable false; signingConfig signingConfigs.release }',
    "release { debuggable false; signingConfig signingConfigs.release; minifyEnabled false; proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro' }");
  assert.equal(parseGeneratedSigningConfiguration(generatedCapacitorRelease).valid, true);
  assert.equal(parseGeneratedSigningConfiguration(generatedCapacitorRelease.replace(
    'minifyEnabled false', 'minifyEnabled true')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(generatedCapacitorRelease.replace(
    "'proguard-rules.pro'", "'unreviewed-rules.pro'")).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(generatedCapacitorRelease.replace(
    'minifyEnabled false;', 'minifyEnabled false; shrinkResources true;')).valid, false);
  assert.deepEqual(parsed.signing.releaseEnvironmentVariables,
    ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD', 'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD']);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'if (wantsRelease &&', 'if (!wantsRelease &&')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    '!ks || !ksp || !ka || !kap', '!ks || !ksp || !ka')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace('taskNames.any', 'taskNames.every')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    /def wantsRelease =[^\n]+/, 'def wantsRelease = false')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'def ksp = System.getenv("SAAGAR_KEYSTORE_PASSWORD")',
    'def ksp = System.getenv("SAAGAR_KEYSTORE_PASSWORD")\n      ks = "never-report-this"')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'def ka = System.getenv("SAAGAR_KEY_ALIAS")',
    'def ka = System.getenv("SAAGAR_KEY_ALIAS")\n      def ks = System.getenv("SAAGAR_KEYSTORE_FILE")')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    '      if (ks && ksp && ka && kap) {',
    '      if (true) { return }\n      if (ks && ksp && ka && kap) {')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'throw new GradleException("blocked")',
    'throw new GradleException("blocked")\n        return')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'debuggable false', 'debuggable true')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'release { debuggable false; signingConfig signingConfigs.release }',
    'release { debuggable false; signingConfig null }')).valid, false);
  assert.equal(parseGeneratedSigningConfiguration(valid.replace(
    'release { debuggable false; signingConfig signingConfigs.release }',
    'release { debuggable false; setSigningConfig(signingConfigs.release) }')).valid, false);
  const literal = parseGeneratedSigningConfiguration(valid.replace('storePassword ksp',
    'storePassword "committed-secret"'));
  assert.equal(literal.valid, false);
  assert.ok(literal.findings.some(row => row.code === 'HARDCODED_SIGNING_SECRET'));
  assert.doesNotMatch(JSON.stringify(literal), /committed-secret/);
  const wrongScope = valid.replace('signingConfig signingConfigs.release', '')
    .replace('debuggable true', 'debuggable true; signingConfig signingConfigs.release');
  assert.equal(parseGeneratedSigningConfiguration(wrongScope).valid, false);
  const swapped = valid
    .replace('def ks = System.getenv("SAAGAR_KEYSTORE_FILE")',
      'def ks = System.getenv("SAAGAR_KEY_ALIAS")')
    .replace('def ka = System.getenv("SAAGAR_KEY_ALIAS")',
      'def ka = System.getenv("SAAGAR_KEYSTORE_FILE")');
  assert.equal(parseGeneratedSigningConfiguration(swapped).valid, false);
  const withoutDebug = valid.replace('    debug { debuggable true }\n', '');
  assert.equal(parseGeneratedSigningConfiguration(withoutDebug).valid, true);
  const decoyOnly = 'def text = "android { signingConfigs { release { } } }"\n' +
    '/* android { buildTypes { release { debuggable false } } } */';
  assert.equal(parseGeneratedSigningConfiguration(decoyOnly).valid, false);
  assert.ok(parseGeneratedSigningConfiguration(valid + ' '.repeat(256 * 1024)).findings
    .some(row => row.code === 'SIGNING_SOURCE_SIZE_INVALID'));
  assert.doesNotMatch(JSON.stringify(parseGeneratedSigningConfiguration(valid.replace('storePassword ksp', 'storePassword "never-report-this"'))), /never-report-this/);
});

test('A9 tracked signing adapter proves the generator structure and emits no secret values', () => {
  const source = fs.readFileSync(path.join(ROOT, 'build-overrides/apply-overrides.js'), 'utf8');
  assert.deepEqual(assessSigningOverrideSource(source), []);
  const reversed = assessSigningOverrideSource(source.replace('if (wantsRelease &&', 'if (!wantsRelease &&'));
  assert.ok(reversed.some(row => row.code === 'RELEASE_FAIL_CLOSED_INVALID'));
  const wrongInsertion = assessSigningOverrideSource(source.replace(
    'gradle = gradle.replace(/android\\s*\\{/, match => match + signing);',
    'gradle = gradle.replace(/project\\s*\\{/, match => match + signing);'));
  assert.ok(wrongInsertion.some(row => row.code === 'SIGNING_OVERRIDE_ANDROID_INSERTION_INVALID'));
  const secret = assessSigningOverrideSource(source.replace('storePassword ksp',
    'storePassword "should-never-emit"'));
  assert.ok(secret.some(row => row.code === 'HARDCODED_SIGNING_SECRET'));
  assert.doesNotMatch(JSON.stringify(secret), /should-never-emit/);
});

test('controlled Gradle JVM identity requires the reported runtime to equal JAVA_HOME', () => {
  const java = 'openjdk version "17.0.19" 2026-04-21';
  const plain = parseGradleJvmIdentity([
    'Gradle 8.11.1', 'JVM: 17.0.19 (Eclipse Adoptium 17.0.19+7)',
    'Kotlin: 2.0', 'Groovy: 3.0', 'Ant: 1.10', 'OS: test'
  ].join('\n'), fs.realpathSync.native(os.tmpdir()), java);
  assert.equal(plain.reportedJvmForm, 'JVM');
  assert.equal(plain.jvmProof, 'gradle-jvm-is-build-jvm');
  assert.equal(plain.actualJvmVersion, '17.0.19');
  assert.equal(plain.javaHomeJvmVersion, '17.0.19');
  assert.equal(plain.daemonJvmMatchesJavaHome, true);
  const launcher = parseGradleJvmIdentity([
    'Gradle 8.11.1', 'Launcher JVM: 17.0.19 (test)', 'Kotlin: 2.0',
    'Groovy: 3.0', 'Ant: 1.10', 'OS: test',
    'Daemon JVM: ' + fs.realpathSync.native(os.tmpdir())
  ].join('\n'), fs.realpathSync.native(os.tmpdir()), java);
  assert.equal(launcher.reportedJvmForm, 'Launcher JVM');
  assert.equal(launcher.jvmProof, 'daemon-jvm-matches-java-home');
  assert.throws(() => parseGradleJvmIdentity(
    'Gradle 8.11.1\nJVM: 21.0.7 (wrong)', path.resolve(os.tmpdir()), java),
  error => error && error.message === 'AUDIT_BUILD_GRADLE_JVM_MISMATCH');
  assert.throws(() => parseGradleJvmIdentity(
    'Gradle 8.11.1\nJVM: 17.0.19\nLauncher JVM: 17.0.19', path.resolve(os.tmpdir()), java),
  error => error && error.message === 'AUDIT_BUILD_GRADLE_IDENTITY_UNAVAILABLE');
  assert.throws(() => parseGradleJvmIdentity(
    'Gradle 8.11.1\nLauncher JVM: 17.0.19', path.resolve(os.tmpdir()), java),
  error => error && error.message === 'AUDIT_BUILD_GRADLE_DAEMON_JVM_REQUIRED');
  assert.throws(() => parseGradleJvmIdentity(
    'Gradle 8.11.1\nLauncher JVM: 17.0.19\nDaemon JVM: 17.0.19', path.resolve(os.tmpdir()), java),
  error => error && error.message === 'AUDIT_BUILD_GRADLE_DAEMON_JVM_REQUIRED');
  assert.throws(() => parseGradleJvmIdentity(
    'Gradle 8.11.1\nDaemon JVM: 17.0.19', path.resolve(os.tmpdir()), java),
  error => error && error.message === 'AUDIT_BUILD_GRADLE_IDENTITY_UNAVAILABLE');
});

test('controlled Gradle bootstrap uses Windows roots without overriding explicit trust and allows first download', () => {
  const automatic = controlledGradleEnvironment({ GRADLE_OPTS: '-Dsample=true' }, 'isolated-home', 'win32');
  assert.equal(automatic.GRADLE_USER_HOME, 'isolated-home');
  assert.equal(automatic.GRADLE_OPTS, '-Dsample=true');
  assert.match(automatic.JAVA_TOOL_OPTIONS,
    /-Djavax\.net\.ssl\.trustStore=NUL -Djavax\.net\.ssl\.trustStoreType=Windows-ROOT/);
  const explicit = controlledGradleEnvironment({
    GRADLE_OPTS: '-Djavax.net.ssl.trustStore=C:\\audit\\trust.jks'
  }, 'isolated-home', 'win32');
  assert.equal(explicit.JAVA_TOOL_OPTIONS, undefined);
  const javaToolOptions = controlledGradleEnvironment({
    JAVA_TOOL_OPTIONS: '-Djavax.net.ssl.trustStoreType=JKS'
  }, 'isolated-home', 'win32');
  assert.equal(javaToolOptions.GRADLE_OPTS, undefined);
  const linux = controlledGradleEnvironment({}, 'isolated-home', 'linux');
  assert.equal(linux.GRADLE_OPTS, undefined);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-gradle-timeout-'));
  const wrapper = path.join(temporary, 'android', 'gradle', 'wrapper');
  try {
    fs.mkdirSync(wrapper, { recursive: true });
    const properties = path.join(wrapper, 'gradle-wrapper.properties');
    fs.writeFileSync(properties,
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-all.zip\n' +
      'networkTimeout=10000\nvalidateDistributionUrl=true\n');
    prepareControlledGradleWrapper(temporary);
    const normalized = fs.readFileSync(properties, 'utf8');
    assert.match(normalized, /^networkTimeout=120000$/m);
    assert.match(normalized, /^distributionUrl=https\\:\/\/services\.gradle\.org\//m);
    assert.match(normalized, /^validateDistributionUrl=true$/m);
    fs.writeFileSync(properties, 'networkTimeout=10000\nnetworkTimeout=20000\n');
    assert.throws(() => prepareControlledGradleWrapper(temporary),
      error => error && error.message === 'AUDIT_CONTROLLED_GRADLE_TIMEOUT_INVALID');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Gradle distribution identity excludes cache bookkeeping but detects executable drift', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-gradle-closure-'));
  try {
    const cache = path.join(temporary, 'wrapper', 'dists', 'gradle-8.2.1-all',
      'd8pvvlun5bx6sdtwqhf8y9z4b');
    const extracted = path.join(cache, 'gradle-8.2.1');
    fs.mkdirSync(path.join(extracted, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(extracted, 'bin', 'gradle.bat'), 'immutable distribution\n');
    fs.writeFileSync(path.join(cache, 'gradle-8.2.1-all.zip.lck'), '');
    fs.writeFileSync(path.join(cache, 'gradle-8.2.1-all.zip.ok'), '');
    const before = gradleDistributionClosureIdentity(temporary);
    fs.writeFileSync(path.join(temporary, 'wrapper', 'dists', 'CACHEDIR.TAG'), 'normal cache metadata\n');
    const afterBookkeeping = gradleDistributionClosureIdentity(temporary);
    assert.deepEqual(afterBookkeeping, before);
    fs.writeFileSync(path.join(extracted, 'bin', 'gradle.bat'), 'mutated distribution\n');
    assert.notEqual(gradleDistributionClosureIdentity(temporary).sha256, before.sha256);
    fs.writeFileSync(path.join(cache, 'unexpected.bin'), 'not approved');
    assert.throws(() => gradleDistributionClosureIdentity(temporary),
      /AUDIT_BUILD_GRADLE_DISTRIBUTION_UNAVAILABLE/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('controlled Gradle seed copies only a fully identity-bound external distribution', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-gradle-seed-'));
  try {
    const seed = path.join(temporary, 'seed');
    const target = path.join(temporary, 'target');
    const cache = path.join(seed, 'wrapper', 'dists', 'gradle-8.2.1-all', 'boundedcache');
    const extracted = path.join(cache, 'gradle-8.2.1');
    fs.mkdirSync(path.join(extracted, 'bin'), { recursive: true });
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(extracted, 'bin', 'gradle.bat'), 'verified distribution\n');
    fs.writeFileSync(path.join(cache, 'gradle-8.2.1-all.zip.ok'), '');
    const expected = gradleDistributionClosureIdentity(seed);
    assert.deepEqual(seedControlledGradleHome(ROOT, seed, target, expected), expected);
    assert.deepEqual(gradleDistributionClosureIdentity(target), expected);

    const rejectedTarget = path.join(temporary, 'rejected');
    fs.mkdirSync(rejectedTarget);
    fs.writeFileSync(path.join(extracted, 'bin', 'gradle.bat'), 'tampered distribution\n');
    assert.throws(() => seedControlledGradleHome(ROOT, seed, rejectedTarget, expected),
      /AUDIT_CONTROLLED_GRADLE_SEED_IDENTITY_INVALID/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('offline build receipts bind a stable read-only Gradle dependency cache', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-gradle-ro-cache-'));
  try {
    const cache = path.join(temporary, 'cache');
    fs.mkdirSync(path.join(cache, 'modules-2', 'files-2.1'), { recursive: true });
    fs.writeFileSync(path.join(cache, 'modules-2', 'files-2.1', 'artifact.jar'), 'verified artifact');
    const aggregate = gradleReadOnlyDependencyCacheIdentity(cache);
    const apk = path.join(temporary, 'app-debug.apk');
    fs.writeFileSync(apk, testZip([{ name: 'classes.dex', body: 'offline-product' }]));
    const record = () => {
      const value = buildRecord(apk);
      value.command = 'npm run build:apk -- --offline';
      value.gradleReadOnlyDependencyCache = { before: aggregate, after: aggregate,
        readOnly: true, offline: true, stableThroughBuild: true };
      return value;
    };
    const agreeing = compareApks(apk, apk, record(), record());
    assert.equal(agreeing.identityBound, true);
    assert.equal(agreeing.toolchainMatch, true);
    const drifted = record();
    drifted.gradleReadOnlyDependencyCache.after = { ...aggregate, sha256: sha256('drift') };
    assert.equal(compareApks(apk, apk, record(), drifted).identityBound, false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('dependency identity excludes only exact Capacitor build outputs and detects source drift', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-dependency-closure-'));
  try {
    const plugin = path.join(temporary, '@capacitor', 'app', 'android');
    fs.mkdirSync(path.join(plugin, 'src'), { recursive: true });
    fs.writeFileSync(path.join(temporary, '@capacitor', 'app', 'package.json'), '{"name":"@capacitor/app"}\n');
    fs.writeFileSync(path.join(plugin, 'src', 'Plugin.java'), 'immutable source\n');
    const before = dependencyClosureIdentity(temporary);
    fs.mkdirSync(path.join(plugin, 'build', 'generated'), { recursive: true });
    fs.writeFileSync(path.join(plugin, 'build', 'generated', 'output.bin'), 'compiler output\n');
    assert.deepEqual(dependencyClosureIdentity(temporary), before);
    fs.writeFileSync(path.join(plugin, 'src', 'Plugin.java'), 'mutated source\n');
    assert.notEqual(dependencyClosureIdentity(temporary).sha256, before.sha256);
    fs.mkdirSync(path.join(temporary, 'unapproved', 'build'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'unapproved', 'build', 'payload.bin'), 'must remain bound\n');
    assert.notEqual(dependencyClosureIdentity(temporary).sha256, before.sha256);

    const capture = fs.readFileSync(path.join(ROOT, 'scripts/audit/capture-build.mjs'), 'utf8');
    assert.equal((capture.match(/dependencyClosureIdentity\(path\.join\(root, 'node_modules'\)\)/g) || []).length, 3,
      'all live dependency re-measurements must use the reviewed generated-output policy');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('controlled build timeout terminates Windows trees and cleanup preserves primary errors', () => {
  const capture = fs.readFileSync(path.join(ROOT, 'scripts/audit/capture-build.mjs'), 'utf8');
  const probes = fs.readFileSync(path.join(ROOT, 'scripts/audit/controlled-probes.mjs'), 'utf8');
  assert.match(capture, /const GRADLE_IDENTITY_TIMEOUT_MS = 10 \* 60 \* 1000;/);
  assert.match(capture, /gradleInvocation\.cwd, GRADLE_IDENTITY_TIMEOUT_MS, gradleUserHome/);
  assert.match(capture, /spawnSync\('taskkill\.exe', \['\/PID', String\(child\.pid\), '\/T', '\/F'\]/);
  assert.match(probes, /if \(gradleReady\) stopControlledGradle\(worktree, gradleHome\)/);
  assert.ok(probes.indexOf('() => removeWorktree') < probes.indexOf('() => removeGradleHome'));

  const primary = Object.assign(new Error('PRIMARY_BUILD_FAILURE'), { code: 'PRIMARY_BUILD_FAILURE' });
  const cleanupOrder = [];
  assert.throws(() => withControlledCleanup(() => { throw primary; }, [
    () => { cleanupOrder.push('first'); throw new Error('LOCKED_HOME'); },
    () => { cleanupOrder.push('second'); }
  ]), error => error === primary);
  assert.deepEqual(cleanupOrder, ['first', 'second']);
  assert.throws(() => withControlledCleanup(() => 'built', [
    () => { throw new Error('CLEANUP_FAILED'); }
  ]), /CLEANUP_FAILED/);

  if (process.platform === 'win32') {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-tree-test-'));
    const pidFile = path.join(temporary, 'descendant.pid');
    let descendantPid = null;
    try {
      const ordinary = spawnSyncCommandTree(process.execPath,
        ['-e', `process.stdout.write('ordinary-out'); process.stderr.write('ordinary-err'); process.exitCode=7`], {
          cwd: temporary, encoding: 'utf8', windowsHide: true, timeout: 10_000,
          maxBuffer: 1024 * 1024, env: process.env
        });
      assert.equal(ordinary.error, null);
      assert.equal(ordinary.status, 7);
      assert.equal(ordinary.stdout, 'ordinary-out');
      assert.equal(ordinary.stderr, 'ordinary-err');

      const powershell = `$child=Start-Process powershell.exe -ArgumentList '-NoProfile','-Command',` +
        `'Start-Sleep -Seconds 60' -PassThru; Set-Content -LiteralPath '${pidFile}' ` +
        `-Value $child.Id; Wait-Process -Id $child.Id`;
      const result = spawnSyncCommandTree('powershell.exe', ['-NoProfile', '-Command', powershell], {
        cwd: temporary, encoding: 'utf8', windowsHide: true, timeout: 1_000,
        maxBuffer: 1024 * 1024, env: process.env
      });
      assert.equal(result.error?.code, 'ETIMEDOUT');
      descendantPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
      const alive = spawnSync('powershell.exe', ['-NoProfile', '-Command',
        `if (Get-Process -Id ${descendantPid} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`],
      { windowsHide: true, timeout: 10_000 });
      assert.notEqual(alive.status, 0, `timed-out descendant ${descendantPid} survived`);
    } finally {
      if (Number.isSafeInteger(descendantPid) && descendantPid > 0) {
        spawnSync('taskkill.exe', ['/PID', String(descendantPid), '/T', '/F'],
          { windowsHide: true, timeout: 10_000 });
      }
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test('large dependency closures are hash-bound outside the evidence array limit', () => {
  const capture = fs.readFileSync(path.join(ROOT, 'scripts/audit/capture-build.mjs'), 'utf8');
  assert.match(capture, /const digest = createHash\('sha256'\);/);
  assert.match(capture, /for \(const row of rows\)/);
  assert.doesNotMatch(capture, /sha256: canonicalSha256\(rows\)/);
});

test('external audit outputs are outside every canonical Git worktree and resist prefix and symlink traps', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-worktrees-'));
  const primary = path.join(temporary, 'primary');
  const sibling = path.join(temporary, 'sibling');
  try {
    fs.mkdirSync(primary);
    execFileSync('git', ['init'], { cwd: primary, stdio: 'ignore', windowsHide: true });
    fs.writeFileSync(path.join(primary, 'fixture.txt'), 'baseline\n');
    execFileSync('git', ['add', 'fixture.txt'], { cwd: primary, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['-c', 'user.name=Audit Fixture', '-c', 'user.email=audit@example.invalid',
      'commit', '-m', 'baseline'], { cwd: primary, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['worktree', 'add', '-b', 'audit-sibling', sibling],
      { cwd: primary, stdio: 'ignore', windowsHide: true });
    const roots = canonicalGitWorktreeRoots(primary);
    assert.equal(roots.length, 2);
    assert.throws(() => assertExternalPath(primary, path.join(primary, 'evidence')),
      /AUDIT_EXTERNAL_PATH_REQUIRED/);
    assert.throws(() => assertExternalPath(primary, path.join(sibling, 'evidence')),
      /AUDIT_EXTERNAL_PATH_REQUIRED/);
    const link = path.join(temporary, 'sibling-link');
    fs.symlinkSync(sibling, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assertExternalPath(primary, path.join(link, 'evidence')),
      /AUDIT_EXTERNAL_PATH_REQUIRED/);
    const prefixTrap = path.join(temporary, 'sibling-prefix');
    assert.equal(assertExternalPath(primary, prefixTrap), path.resolve(prefixTrap));
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', sibling],
      { cwd: primary, stdio: 'ignore', windowsHide: true }); } catch (_) {}
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('audit tooling commit must preserve the product anchor independently of audit mode', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-anchor-'));
  const runGit = args => execFileSync('git', args,
    { cwd: temporary, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  const commit = message => {
    runGit(['add', '.']);
    runGit(['-c', 'user.name=Audit Fixture', '-c', 'user.email=audit@example.invalid',
      'commit', '-m', message]);
    return runGit(['rev-parse', 'HEAD']);
  };
  try {
    runGit(['init']);
    fs.mkdirSync(path.join(temporary, 'www'));
    fs.writeFileSync(path.join(temporary, 'www', 'index.html'), '<main>anchor</main>\n');
    const baseline = commit('product anchor');
    fs.mkdirSync(path.join(temporary, 'scripts', 'audit'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'scripts', 'audit', 'run.mjs'), 'export {};\n');
    const tooling = commit('audit tooling only');
    assert.throws(() => assertToolingProductFingerprintAnchor(temporary, baseline, tooling),
      error => error && error.message === 'AUDIT_PRODUCT_BASELINE_NOT_FROZEN');
    const currentRevision = git(['rev-parse', 'HEAD']).trim();
    assert.doesNotThrow(() => assertToolingProductFingerprintAnchor(
      ROOT, PRODUCT_BASELINE_SHA, currentRevision));
    const source = fs.readFileSync(path.join(ROOT, 'scripts/audit/run.mjs'), 'utf8');
    const anchorCall = source.lastIndexOf('assertToolingProductFingerprintAnchor(options.root');
    const baselineOnlyGate = source.indexOf("if (options.mode === 'baseline' && baselineProductFingerprint");
    assert.ok(anchorCall >= 0 && baselineOnlyGate >= 0 && anchorCall < baselineOnlyGate);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('the closure addendum is required audit tooling and its absence is rejected', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-addendum-'));
  const runGit = args => execFileSync('git', args,
    { cwd: temporary, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  const write = (file, body) => {
    const target = path.join(temporary, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };
  const commit = message => {
    runGit(['add', '-A']);
    runGit(['-c', 'user.name=Audit Fixture', '-c', 'user.email=audit@example.invalid',
      'commit', '-m', message]);
    return runGit(['rev-parse', 'HEAD']);
  };
  const toolingFiles = ['docs/audit/AUDIT-PROGRAM-v1.md',
    'docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md',
    'scripts/audit/run.mjs', 'scripts/audit/lib.mjs', 'scripts/audit/schema.mjs',
    'scripts/audit/runner-support.mjs', 'scripts/audit/comparison.mjs',
    'scripts/audit/compare-apks.mjs', 'scripts/audit/capture-build.mjs',
    'scripts/audit/capture-mutations.mjs', 'scripts/audit/controlled-probes.mjs',
    'scripts/audit/config.mjs', 'scripts/audit/test-registry.json',
    'tests/whole-app-audit-runner.test.mjs',
    ...AUDITS.map(([, file]) => `scripts/audit/audits/${file}.mjs`)];
  const identify = sha => {
    const files = runGit(['ls-tree', '-r', '--name-only', sha]).split('\n')
      .filter(Boolean).map(value => value.replaceAll('\\', '/'));
    return verifyToolingIdentity(temporary, { head: runGit(['rev-parse', 'HEAD']), files }, sha,
      path.join(temporary, 'scripts', 'audit', 'run.mjs'));
  };
  try {
    runGit(['init']);
    for (const file of toolingFiles) write(file, `fixture ${file}\n`);
    const complete = commit('audit tooling with closure addendum');
    const identity = identify(complete);
    assert.equal(identity.sha, complete);
    // The addendum is a tooling input in its own right, not merely a control path.
    assert.equal(isAuditToolingPath('docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md'), true);
    // ...but historical/control evidence is deliberately NOT self-referential tooling.
    assert.equal(isAuditToolingPath('docs/audit/HANDOFF.md'), false);
    assert.equal(isAuditToolingPath(
      'verification/audit/AUDIT-RUNNER-FINDINGS-AND-CLOSURE-LEDGER-2026-08-09.md'), false);
    fs.rmSync(path.join(temporary, 'docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md'));
    const missing = commit('closure addendum removed');
    assert.throws(() => identify(missing),
      error => error && error.message === 'AUDIT_TOOLING_FILESET_MISMATCH');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('committing an audit-control document cannot move the product fingerprint', () => {
  /* Freeze blocker, 2026-08-09: the closure addendum counted as a product file, so
     committing it would have broken the anchor's exact-equality check. It RECURRED
     on 2026-08-10 when P0-DECISIONS-2026-08-10.md was committed and the anchor gate
     began failing with AUDIT_TOOLING_PRODUCT_FINGERPRINT_DRIFT — which is why the
     rule is now the whole docs/audit/ prefix instead of a list of named files.

     The count assertion is deliberately RELATIVE. The invariant is that adding an
     audit-control document does not MOVE the product total; pinning a literal made
     this fail whenever an unrelated product file was added, which is noise. */
  const addendum = 'docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md';
  const controlDocuments = [addendum, 'docs/audit/P0-DECISIONS-2026-08-10.md',
    'docs/audit/AUDIT-PROGRAM-v1.md', 'docs/audit/HANDOFF.md',
    'docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2027-01-01.md',
    'docs/audit/SOME-FUTURE-AUDIT-NOTE.md'];
  for (const file of controlDocuments) assert.equal(isProductPath(file), false, file);
  // Outside docs/audit/ stays product, including sibling documentation.
  assert.equal(isProductPath('docs/MODULAR-MIGRATION-ROADMAP-2026-08-10.md'), true);
  assert.equal(isProductPath('docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md'), true);
  /* Change contracts live under docs/audit/ but are approved PRODUCT
     specifications, not audit control. Excluding them would let a behavioural
     contract change without moving the product fingerprint. */
  for (const contract of ['docs/audit/D5-STOCK-CHANGE-CONTRACT-2026-08-04.md',
    'docs/audit/D2-QMS-CHANGE-CONTRACT-2026-07-30.md',
    'docs/audit/MAH4-MESSAGE-LIFECYCLE-CHANGE-CONTRACT-2026-08-06.md']) {
    assert.equal(isProductPath(contract), true, contract);
  }
  const tracked = git(['ls-files', '-z'], null).toString('utf8').split('\0').filter(Boolean)
    .map(value => value.replaceAll('\\', '/'));
  const baseline = tracked.filter(isProductPath).length;
  const withControlDocuments = [...new Set([...tracked, ...controlDocuments])].filter(isProductPath);
  assert.equal(withControlDocuments.length, baseline,
    'adding audit-control documents must not change the product file count');
  assert.equal(commitProductFingerprint(PRODUCT_BASELINE_SHA).fileCount, baseline);
});

test('A7 ignores comment and string decoys while inventorying computed protocol forms', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const evaluate = async probe => {
    const sources = new Map([
      ['www/index.html', '<!doctype html><title>Protocol lexical probe</title>'],
      ['www/shared/mah4-runtime.js', 'const VERSION = 1;'],
      ['www/shared/protocol-lexical-probe.js', probe]
    ]);
    const files = [...sources.keys()].sort();
    return module.run({ files, productFiles: files, modules: [], sharedAssets: [],
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
  };
  const baseSource = [
    'parent.postMessage({ type: "ST_REAL", value: "ok" }, "*");',
    'window.addEventListener("message", event => { if (event.data.type === "ST_REAL") consume(event.data); });',
    'const decoy = "postMessage({ type: \'ST_STRING\' }); event.data.type === \'ST_STRING\'";',
    '// parent.postMessage({ type: "ST_LINE_COMMENT" }, "*");',
    '/* event.data.type === "ST_BLOCK_COMMENT"; */'
  ].join('\n');
  const base = await evaluate(baseSource);
  const baseInventory = base.checks.find(item => item.id === 'A7-01');
  assert.equal(baseInventory.metric.senderSites, 1);
  assert.equal(baseInventory.metric.receiverSites, 1);
  assert.equal(baseInventory.metric.unresolvedContracts, 0);
  assert.deepEqual(baseInventory.metric.inventory.filter(row => row.kind === 'resolved')
    .map(row => row.messageType), ['ST_REAL']);

  const computed = await evaluate(baseSource + '\n' + [
    'parent[messageMethod]({ type: "ST_COMPUTED", value: makeValue() }, "*");',
    'window.addEventListener("message", event => { if (event.data[typeKey]) consume(event.data); });'
  ].join('\n'));
  const computedInventory = computed.checks.find(item => item.id === 'A7-01');
  assert.equal(computedInventory.result, 'unmeasured');
  assert.equal(computedInventory.metric.unresolvedContracts, 2);
  assert.notEqual(computedInventory.metric.inventorySha256, baseInventory.metric.inventorySha256);
  assert.ok(computedInventory.metric.inventory.some(row =>
    row.unresolvedCode === 'MESSAGE_SENDER_COMPUTED_CALL_UNRESOLVED'));
  assert.ok(computedInventory.metric.inventory.some(row =>
    row.unresolvedCode === 'MESSAGE_RECEIVER_COMPUTED_TYPE_UNRESOLVED'));
  assert.equal(JSON.stringify(computedInventory).includes('messageMethod'), false);
  assert.equal(JSON.stringify(computedInventory).includes('typeKey'), false);

  const aliased = await evaluate(baseSource + '\n' + [
    'const sendBound = parent.postMessage.bind(parent);',
    'const { postMessage: sendDestructured } = parent;'
  ].join('\n'));
  const aliasedInventory = aliased.checks.find(item => item.id === 'A7-01');
  assert.equal(aliasedInventory.result, 'unmeasured');
  assert.equal(aliasedInventory.metric.unresolvedContracts, 2);
  assert.notEqual(aliasedInventory.metric.inventorySha256, baseInventory.metric.inventorySha256);
  assert.equal(aliasedInventory.metric.inventory.filter(row =>
    row.unresolvedCode === 'MESSAGE_SENDER_ALIAS_UNRESOLVED').length, 2);

  const buildGate = grantAuthority => {
    const fixture = comparisonFixture('same');
    const baselineIndex = fixture.baseline.findIndex(audit => audit.auditId === 'A7');
    const currentIndex = fixture.current.findIndex(audit => audit.auditId === 'A7');
    fixture.baseline[baselineIndex] = structuredClone(base);
    fixture.current[currentIndex] = structuredClone(computed);
    if (grantAuthority) {
      for (const side of [fixture.baseline[baselineIndex], fixture.current[currentIndex]]) {
        const inventoryCheck = side.checks.find(item => item.id === 'A7-01');
        inventoryCheck.result = 'pass';
        inventoryCheck.metric.staticDiscoveryComplete = true;
      }
    }
    return evaluateComparison({ baselineAudits: fixture.baseline, currentAudits: fixture.current,
      baselineOpenGates: [], currentOpenGates: [] }).gates.find(item => item.id === 'C-07');
  };

  /* With explicit authority on both sides the delta logic must still detect an
     exact message-contract regression. */
  const authorized = buildGate(true);
  assert.equal(authorized.result, 'fail');
  assert.ok(authorized.evidence.some(row =>
    /MESSAGE_(?:CONTRACT_(?:ADDED|CHANGED)|UNRESOLVED_CONTRACT_ADDED)/.test(row.code)));

  /* Real A7 output carries no such authority, so the same genuine delta cannot
     render a verdict — it is unmeasured, never a silent pass. */
  const unauthorized = buildGate(false);
  assert.equal(unauthorized.result, 'unmeasured');
  assert.ok(unauthorized.evidence.some(row => row.code === 'MESSAGE_CONTRACT_INVENTORY_UNAVAILABLE'));
});

test('A7 never silently passes sender and receiver aliases outside its supported grammar', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a7.mjs')).href);
  const source = [
    'parent.postMessage({ type: "ST_VISIBLE", value: 1 }, "*");',
    'const bus = { send: parent.postMessage.bind(parent) };',
    'bus.send({ type: "ST_HIDDEN", value: 1 }, "*");',
    'window.addEventListener("message", event => {',
    '  if (event.data.type === "ST_VISIBLE") consume(event.data);',
    '  const kind = event.data.type;',
    '  if (kind === "ST_HIDDEN") consume(event.data);',
    '});'
  ].join('\n');
  const sources = new Map([
    ['www/index.html', `<script>${source}</script>`],
    ['www/shared/mah4-runtime.js', 'const VERSION = 1;']
  ]);
  const files = [...sources.keys()];
  const authority = { complete: true, source: 'test:a7-static-census' };
  const result = await module.run({ files, productFiles: files, modules: [], sharedAssets: [],
    staticDiscoveryAuthority: authority, messageInventoryAuthority: authority,
    exists: file => sources.has(file), read: file => sources.get(file) || '' });
  const inventory = result.checks.find(check => check.id === 'A7-01');
  assert.equal(inventory.result, 'pass');
  assert.ok(inventory.metric.inventory.some(row =>
    row.unresolvedCode === 'MESSAGE_SENDER_ALIAS_UNRESOLVED'));
  assert.ok(inventory.metric.inventory.some(row =>
    row.unresolvedCode === 'MESSAGE_RECEIVER_ALIAS_UNRESOLVED'));
  assert.equal(result.checks.find(check => check.id === 'A7-02').result, 'unmeasured');
  assert.equal(result.checks.find(check => check.id === 'A7-03').result, 'unmeasured');
});

test('A8 approves only the validated local module-manifest src assignment', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a8.mjs')).href);
  const authority = { complete: true, source: 'test:a8-static-census' };
  const evaluate = async source => {
    const sources = new Map([['www/module-manifest.js', source]]);
    return module.run({ files: [...sources.keys()], productFiles: [...sources.keys()],
      modules: [], sharedAssets: [], staticDiscoveryAuthority: authority,
      trackedSecretScanAuthority: authority,
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
  };
  const unsafe = await evaluate('function loadRemote(src) { image.src = src; }');
  const unsafeRemote = unsafe.checks.find(check => check.id === 'A8-05');
  assert.equal(unsafeRemote.result, 'fail');
  assert.equal(unsafeRemote.metric.unresolvedDynamicTargets, 1);

  const local = await evaluate([
    'var MODULE_ID = /^[a-z][a-z0-9_]{1,31}$/;',
    'function freezeModule(value, index) {',
    '  var id = cleanString(value.id, "id");',
    '  if (!MODULE_ID.test(id)) fail("bad id");',
    '  var expectedPath = "modules/" + id + "/index.html";',
    '  var file = cleanString(value.file, "file");',
    '  var src = cleanString(value.src, "src");',
    '  if (file !== expectedPath || src !== expectedPath || file !== src) fail("bad path");',
    '  var module = {};',
    '  module.src = src;',
    '  return module;',
    '}'
  ].join('\n'));
  assert.equal(local.checks.find(check => check.id === 'A8-05').result, 'pass');
});

test('A8 export control resolves aliases and rejects conditional or shell-fallback authorization', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a8.mjs')).href);
  const evaluate = async (source, file = 'www/shared/export-adversary.js') => {
    const sources = new Map([[file, source]]);
    return module.run({ files: [file], productFiles: [file],
      exists: value => sources.has(value), read: value => sources.get(value) || '' });
  };
  const exportCheck = result => result.checks.find(item => item.id === 'A8-02');

  const guardedAliases = await evaluate([
    'function downloadText(){ const a=document.createElement("a"); a.download="report.csv"; }',
    'const saveReport = downloadText;',
    'const approveDelivery = SaagarExportControl.beginDelivery;',
    'function deliver(){ if (!approveDelivery()) { return; } saveReport(); }'
  ].join('\n'));
  assert.equal(exportCheck(guardedAliases).result, 'unmeasured', JSON.stringify(exportCheck(guardedAliases).evidence));

  const helperBodyOnly = await evaluate(
    'function downloadText(){ const a=document.createElement("a"); a.download="report.csv"; }');
  assert.equal(exportCheck(helperBodyOnly).result, 'fail');

  const conditional = await evaluate([
    'function deliver(ready){',
    '  if (ready) { if (!beginDelivery()) { return; } }',
    '  const a=document.createElement("a"); a.download="report.csv";',
    '}'
  ].join('\n'));
  assert.equal(exportCheck(conditional).result, 'fail');

  const moduleFallback = await evaluate([
    'function deliver(){',
    '  if (parent && parent !== window) { parent.postMessage({type:"ST_EXPORT"}, "*"); return; }',
    '  const a=document.createElement("a"); a.download="report.csv";',
    '}'
  ].join('\n'), 'www/modules/export-adversary.html');
  assert.equal(exportCheck(moduleFallback).result, 'fail');

  const popupAlias = await evaluate([
    'const openReport = window.open.bind(window);',
    'function deliver(){ openReport("https://unapproved.example.test/report"); }'
  ].join('\n'));
  assert.equal(exportCheck(popupAlias).result, 'fail');
  assert.ok(exportCheck(popupAlias).evidence.some(row => row.sink === 'POPUP'));

  const reassignedGuard = await evaluate([
    'let approveDelivery = SaagarExportControl.beginDelivery;',
    'approveDelivery = () => true;',
    'function deliver(){ if (!approveDelivery()) { return; }',
    '  const a=document.createElement("a"); a.download="report.csv"; }'
  ].join('\n'));
  assert.notEqual(exportCheck(reassignedGuard).result, 'pass');
  assert.ok(exportCheck(reassignedGuard).evidence.some(row =>
    row.code === 'EXPORT_POLICY_BYPASS' || row.code === 'EXPORT_POLICY_ALIAS_UNRESOLVED'));

  const unrelatedReturn = await evaluate([
    'function shareReport(flag){',
    '  if (parent && parent !== window) { parent.postMessage({type:"ST_EXPORT"}, "*"); }',
    '  if (flag) return;',
    '  navigator.share({text:"report"});',
    '}'
  ].join('\n'), 'www/modules/export-adversary.html');
  assert.equal(exportCheck(unrelatedReturn).result, 'fail');
});

test('A8 auth, remote and JSON-secret analysis is conservative and redacted', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'scripts/audit/audits/a8.mjs')).href);
  const evaluate = async entries => {
    const sources = new Map(entries);
    const files = [...sources.keys()].sort();
    return module.run({ files, productFiles: files.filter(file => /^www\//.test(file)),
      exists: file => sources.has(file), read: file => sources.get(file) || '' });
  };
  const check = (result, id) => result.checks.find(item => item.id === id);

  const unknownAuth = await evaluate([['www/shared/auth-unknown.js',
    'const policy={ AUTHORIZE(){ try{return gate();} catch{return fallbackDecision;} } };']]);
  assert.equal(check(unknownAuth, 'A8-03').result, 'unmeasured');
  assert.ok(check(unknownAuth, 'A8-03').evidence.some(row => row.code === 'AUTH_EXCEPTION_PATH_UNRESOLVED'));

  const deniedAuth = await evaluate([['www/shared/auth-denied.js', [
    'class LoginPolicy { verifyCredential(){ try{return gate();} catch{return false;} } }',
    'const access={ unlock(){ try{return gate();} catch(error){throw error;} } };'
  ].join('\n')]]);
  assert.equal(check(deniedAuth, 'A8-03').result, 'unmeasured', JSON.stringify(check(deniedAuth, 'A8-03').evidence));

  const genericVerify = await evaluate([['www/shared/auth-generic.js',
    'const authPolicy={ verify(){ try{return gate();} catch{return true;} } };']]);
  assert.equal(check(genericVerify, 'A8-03').result, 'fail');

  const conditionalAllow = await evaluate([['www/shared/auth-conditional-allow.js',
    'function authorize(flag){ try{return gate();} catch{if(flag)return true;return false;} }']]);
  assert.equal(check(conditionalAllow, 'A8-03').result, 'fail');

  const conditionalUnknown = await evaluate([['www/shared/auth-conditional-unknown.js',
    'function authorize(flag){ try{return gate();} catch{if(flag)return fallback;return false;} }']]);
  assert.equal(check(conditionalUnknown, 'A8-03').result, 'unmeasured');

  const conditionalDeny = await evaluate([['www/shared/auth-conditional-deny.js',
    'function authorize(flag){ try{return gate();} catch(error){if(flag)return false;throw error;} }']]);
  assert.equal(check(conditionalDeny, 'A8-03').result, 'unmeasured',
    JSON.stringify(check(conditionalDeny, 'A8-03').evidence));

  const aliasRemote = await evaluate([['www/shared/remote-alias.js', [
    'const request = globalThis.fetch.bind(globalThis);',
    'request(makeUrl());',
    'fetch?.(otherUrl());',
    'globalThis[remoteApi]?.(thirdUrl());'
  ].join('\n')]]);
  const aliasRemoteCheck = check(aliasRemote, 'A8-05');
  assert.equal(aliasRemoteCheck.result, 'fail');
  assert.ok(aliasRemoteCheck.metric.unresolvedDynamicTargets >= 3);
  assert.equal(JSON.stringify(aliasRemoteCheck).includes('makeUrl'), false);
  assert.equal(JSON.stringify(aliasRemoteCheck).includes('remoteApi'), false);

  const declarative = await evaluate([['www/shared/remote-link.html',
    '<a href="https://unapproved.example.test/report">Report</a>']]);
  assert.equal(check(declarative, 'A8-05').result, 'fail');
  assert.ok(check(declarative, 'A8-05').evidence.some(row =>
    row.code === 'REMOTE_TARGET_POLICY_NOT_CLOSED' && row.definiteRemoteCalls === 1));

  const compoundNavigation = await evaluate([['www/shared/remote-compound.js', [
    'anchor.href += makeUrl();',
    'anchor["src"] ||= fallbackUrl;',
    'window.location.href &&= nextUrl;',
    'globalThis["location"] ??= chooseLocation();'
  ].join('\n')]]);
  assert.notEqual(check(compoundNavigation, 'A8-05').result, 'pass');
  assert.ok(check(compoundNavigation, 'A8-05').metric.unresolvedDynamicTargets >= 4);

  const jsonSecret = 'correct horse: battery, staple! \\"escaped\\"';
  const secret = await evaluate([['.github/settings.json',
    JSON.stringify({ client_secret: jsonSecret })]]);
  const secretCheck = check(secret, 'A8-04');
  assert.equal(secretCheck.result, 'fail');
  assert.ok(secretCheck.evidence.some(row => row.ruleId === 'ASSIGNED_SECRET_JSON'));
  assert.equal(JSON.stringify(secretCheck).includes(jsonSecret), false);
});

test('baseline evidence directory suffix must match both manifest and run target identity', () => {
  const target = 'a'.repeat(40);
  const canonical = 'verification/audit/2026-08-09-123456-' + target.slice(0, 12);
  assert.equal(assertBaselineEvidenceDirectoryTarget(canonical, target), target.slice(0, 12));
  const renamed = 'verification/audit/2026-08-09-123456-' + 'b'.repeat(12);
  assert.throws(() => assertBaselineEvidenceDirectoryTarget(renamed, target),
    error => error && error.message === 'AUDIT_BASELINE_DIRECTORY_TARGET_MISMATCH');
});
