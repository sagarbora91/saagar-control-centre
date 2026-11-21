import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AUDIT_VERSION, PRODUCT_BASELINE_SHA, buildContext, compareText, isProductPath,
  revisionFingerprint, sha256 } from './lib.mjs';
import { OPEN_GATES } from './config.mjs';
import { evaluateComparison } from './comparison.mjs';
import { runControlledProbes } from './controlled-probes.mjs';
import { safeError, safeJson } from './schema.mjs';
import { AUDIT_FILES, EVIDENCE_MANIFEST_FILE, assertExternalPath, buildEvidenceManifest,
  loadBaselineEvidence, loadExternalJson, verifyIsolatedWorktree, verifyToolingIdentity
} from './runner-support.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '../..');
const EXPECTED_COUNTS = Object.freeze({ A1: 7, A2: 5, A3: 5, A4: 6, A5: 5,
  A6: 5, A7: 5, A8: 5, A9: 5, A10: 5, A11: 5 });

export function parseArgs(argv) {
  const options = { root: defaultRoot, output: '', productBaseline: PRODUCT_BASELINE_SHA,
    targetSha: '', auditToolingSha: '', runTests: false, mode: 'baseline', baselineEvidence: '',
    performanceEvidence: '', uiEvidence: '', comparisonApproval: '' };
  const valued = new Map([
    ['--root', 'root'], ['--output', 'output'], ['--product-baseline', 'productBaseline'],
    ['--target-sha', 'targetSha'], ['--audit-tooling-sha', 'auditToolingSha'], ['--mode', 'mode'],
    ['--baseline-evidence', 'baselineEvidence'], ['--performance-evidence', 'performanceEvidence'],
    ['--ui-evidence', 'uiEvidence'], ['--comparison-approval', 'comparisonApproval']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--run-tests') options.runTests = true;
    else if (valued.has(argument)) {
      const value = String(argv[++index] || '');
      if (!value) throw new Error('AUDIT_ARGUMENT_VALUE_REQUIRED');
      options[valued.get(argument)] = ['root', 'output', 'baselineEvidence', 'performanceEvidence',
        'uiEvidence', 'comparisonApproval'].includes(valued.get(argument))
        ? path.resolve(value) : value;
    } else throw new Error('AUDIT_ARGUMENT_UNKNOWN');
  }
  if (!options.output) throw new Error('AUDIT_OUTPUT_REQUIRED');
  if (!/^[a-f0-9]{40}$/.test(options.productBaseline)) throw new Error('AUDIT_PRODUCT_SHA_INVALID');
  if (options.productBaseline !== PRODUCT_BASELINE_SHA) throw new Error('AUDIT_PRODUCT_BASELINE_NOT_FROZEN');
  if (!/^[a-f0-9]{40}$/.test(options.auditToolingSha)) throw new Error('AUDIT_TOOLING_SHA_INVALID');
  if (!/^[a-f0-9]{40}$/.test(options.targetSha)) throw new Error('AUDIT_TARGET_SHA_INVALID');
  if (!['baseline', 'comparison'].includes(options.mode)) throw new Error('AUDIT_MODE_INVALID');
  if (!options.runTests) throw new Error('AUDIT_FULL_SUITE_EVIDENCE_REQUIRED');
  if (options.mode === 'comparison' && !options.baselineEvidence) throw new Error('AUDIT_COMPARISON_BASELINE_REQUIRED');
  if (options.mode === 'baseline' && options.baselineEvidence) throw new Error('AUDIT_BASELINE_INPUT_NOT_ALLOWED');
  if (options.mode === 'baseline' && options.comparisonApproval) throw new Error('AUDIT_BASELINE_APPROVAL_NOT_ALLOWED');
  const outputMatch = path.basename(options.output).match(/^\d{4}-\d{2}-\d{2}-\d{6}-([a-f0-9]{7,12})$/);
  if (!outputMatch) {
    throw new Error('AUDIT_OUTPUT_NAME_INVALID');
  }
  if (!options.targetSha.startsWith(outputMatch[1])) throw new Error('AUDIT_OUTPUT_TARGET_SHA_MISMATCH');
  return options;
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true,
    maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function revisionFiles(root, revision) {
  const output = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', '-z', revision], {
    encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output.toString('utf8').split('\0').filter(Boolean).map(value => value.replaceAll('\\', '/')).sort(compareText);
}

function productFingerprintAt(root, revision) {
  return revisionFingerprint(root, revisionFiles(root, revision).filter(isProductPath), revision);
}

function compactFingerprint(value) {
  return { algorithm: value.algorithm, fileCount: value.fileCount, totalBytes: value.totalBytes,
    treeSha256: value.treeSha256 };
}
export function assertToolingProductFingerprintAnchor(root, productBaselineSha, auditToolingSha) {
  if (productBaselineSha !== PRODUCT_BASELINE_SHA) throw new Error('AUDIT_PRODUCT_BASELINE_NOT_FROZEN');
  const anchor = productFingerprintAt(root, productBaselineSha);
  const tooling = productFingerprintAt(root, auditToolingSha);
  const fields = ['algorithm', 'fileCount', 'totalBytes', 'treeSha256'];
  if (fields.some(field => anchor[field] !== tooling[field])) {
    throw new Error('AUDIT_TOOLING_PRODUCT_FINGERPRINT_DRIFT');
  }
  return { anchor: compactFingerprint(anchor), tooling: compactFingerprint(tooling) };
}


export function parseTapSummary(value) {
  const clean = String(value || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  const read = label => {
    const pattern = new RegExp(`^(?:\\u2139|#)\\s*${label}\\s+(\\d+)\\s*$`, 'gm');
    const matches = [...clean.matchAll(pattern)];
    return matches.length ? Number(matches[matches.length - 1][1]) : null;
  };
  return Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
    .map(label => [label, read(label)]));
}

export function parseOfflineTestEvidence(value) {
  const clean = String(value || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  const header = /^>\s+\S+@\S+\s+(test:[^\s]+)\s*$/gm;
  const matches = [...clean.matchAll(header)];
  const suites = {};
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : clean.length;
    suites[match[1]] = parseTapSummary(clean.slice(match.index, end));
  });
  const required = ['test:c1', 'test:mobile', 'test:settings', 'test:language',
    'test:etp', 'test:modular', 'test:offline'];
  const fields = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const missing = required.filter(name => !suites[name] || fields.some(field => !Number.isSafeInteger(suites[name][field])));
  if (missing.length) throw new Error('AUDIT_TEST_COUNTS_UNAVAILABLE');
  const duplicate = required.filter(name => matches.filter(match => match[1] === name).length !== 1);
  if (duplicate.length) throw new Error('AUDIT_TEST_SUITE_SUMMARY_INVALID');
  const invalid = required.filter(name => {
    const suite = suites[name];
    return suite.tests < 0 || suite.pass !== suite.tests ||
      ['fail', 'cancelled', 'skipped', 'todo'].some(field => suite[field] !== 0);
  });
  if (invalid.length) throw new Error('AUDIT_TEST_SUITE_SUMMARY_INVALID');
  const sum = field => required.reduce((total, name) => total + suites[name][field], 0);
  return {
    suites: Object.fromEntries(required.map(name => [name, suites[name]])),
    counts: { completeOffline: sum('tests'), c1: suites['test:c1'].tests,
      mobile: suites['test:mobile'].tests, settings: suites['test:settings'].tests,
      language: suites['test:language'].tests, etp: suites['test:etp'].tests,
      modular: suites['test:modular'].tests, mainOffline: suites['test:offline'].tests,
      pass: sum('pass'), fail: sum('fail'), cancelled: sum('cancelled'),
      skipped: sum('skipped'), todo: sum('todo') },
    totalCount: sum('tests'), passedCount: sum('pass')
  };
}

export function npmLauncher(mode = 'offline') {
  if (!['offline', 'version'].includes(mode)) throw new Error('AUDIT_NPM_LAUNCHER_MODE_INVALID');
  const isOffline = mode === 'offline';
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', isOffline ? 'npm.cmd run test:offline' : 'npm.cmd --version'],
      display: isOffline ? 'npm run test:offline' : 'npm --version' };
  }
  return { command: 'npm', args: isOffline ? ['run', 'test:offline'] : ['--version'],
    display: isOffline ? 'npm run test:offline' : 'npm --version' };
}

export function probeNpmLauncher() {
  const launcher = npmLauncher('version');
  const result = spawnSync(launcher.command, launcher.args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const version = `${result.stdout || ''}\n${result.stderr || ''}`.trim().split(/\r?\n/)[0] || 'unavailable';
  return { available: result.status === 0, exitCode: result.status, version: version.slice(0, 80) };
}

function runFullTests(root) {
  const launcher = npmLauncher('offline');
  const started = Date.now();
  const result = spawnSync(launcher.command, launcher.args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15 * 60 * 1000,
    maxBuffer: 128 * 1024 * 1024, env: { ...process.env, TZ: 'UTC' }
  });
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  let parsed = null;
  let parseFailure = null;
  try { parsed = parseOfflineTestEvidence(combined); }
  catch (error) { parseFailure = String(error && error.message || 'AUDIT_TEST_COUNTS_UNAVAILABLE'); }
  const summariesPassed = Boolean(parsed) && parsed.totalCount === parsed.passedCount &&
    parsed.counts.completeOffline === parsed.counts.pass &&
    ['fail', 'cancelled', 'skipped', 'todo'].every(field => parsed.counts[field] === 0) &&
    Object.values(parsed.suites).every(suite => suite.pass === suite.tests &&
      ['fail', 'cancelled', 'skipped', 'todo'].every(field => suite[field] === 0));
  const evidence = { command: launcher.display, exitCode: result.status,
    elapsedMs: Date.now() - started, outputSha256: sha256(combined),
    ...(parsed || {}), parseFailure: parseFailure || undefined,
    passed: result.status === 0 && summariesPassed };
  if (!evidence.passed) throw Object.assign(new Error('AUDIT_FULL_SUITE_FAILED'), { evidence });
  return evidence;
}

function validateAudits(results) {
  const seen = new Set();
  for (const result of results) {
    const expected = EXPECTED_COUNTS[result.auditId];
    if (!expected || result.checks.length !== expected) throw new Error('AUDIT_CHECK_COUNT_INVALID');
    result.checks.forEach((check, index) => {
      const wanted = `${result.auditId}-${String(index + 1).padStart(2, '0')}`;
      if (check.id !== wanted || seen.has(check.id)) throw new Error('AUDIT_CHECK_SEQUENCE_INVALID');
      seen.add(check.id);
    });
  }
  if (seen.size !== 58) throw new Error('AUDIT_CHECK_TOTAL_INVALID');
}

function toolchain(evidence, probes) {
  const build = probes.buildEvidence && probes.buildEvidence.first && probes.buildEvidence.first.build;
  return { node: process.version, npm: probeNpmLauncher(), platform: process.platform, arch: process.arch,
    osRelease: os.release(),
    java: build ? { available: true, source: 'JAVA_HOME', version: build.gradle.javaHomeVersion }
      : { available: false, reason: probes.status.build.reason },
    gradle: build ? { available: true, version: build.gradle.version,
      reportedJvmForm: build.gradle.reportedJvmForm,
      daemonJvmMatchesJavaHome: build.gradle.daemonJvmMatchesJavaHome }
      : { available: false, reason: probes.status.build.reason },
    browserEvidenceProvided: evidence.ui.metadata.provided,
    performanceEvidenceProvided: evidence.performance.metadata.provided,
    buildProbeStatus: probes.status.build.status,
    mutationProbeStatus: probes.status.mutation.status };
}

export function validateBuildEvidence(value, context) {
  if (value === null || value === undefined) return;
  const records = value && [value.first && value.first.build, value.second && value.second.build];
  if (!value || value.format !== 'SAAGAR_AUDIT_APK_COMPARISON' || value.schemaVersion !== 2 ||
      !records || records.some(record => !record || record.sourceSha !== context.head ||
        record.productFingerprintSha256 !== context.productFingerprint.treeSha256)) {
    throw new Error('AUDIT_BUILD_EVIDENCE_TARGET_IDENTITY_MISMATCH');
  }
}

function checkById(audits, id) {
  for (const audit of audits || []) for (const check of audit.checks || []) if (check.id === id) return check;
  return null;
}

export function comparisonPerformance(external, baseline) {
  if (!baseline) return external || {};
  const shell = checkById(baseline.audits, 'A10-01');
  const modules = checkById(baseline.audits, 'A10-02');
  const assets = checkById(baseline.audits, 'A10-03');
  const authoritative = {
    shellBytes: shell && shell.metric.shellBytes,
    shellParseMs: shell && shell.metric.shellParseMs,
    captureIdentitySha256: shell && shell.metric.captureIdentitySha256,
    evidenceSha256: shell && shell.metric.timingEvidenceSha256,
    recordPath: shell && shell.metric.timingRecordPath,
    moduleOpenP95Ms: modules && modules.metric.openP95Ms,
    totalShippedAssetBytes: assets && assets.metric.totalBytes
  };
  return { ...(external || {}), baseline: { ...((external && external.baseline) || {}), ...authoritative } };
}


export function summaryMarkdown(run, findings) {
  const title = run.mode === 'comparison' ? 'Comparison' : 'Baseline';
  const lines = [`# SAAGAR Whole-App Audit ${title}`, '',
    `- Product baseline: \`${run.productBaselineSha}\``,
    `- Target commit: \`${run.targetSha}\``,
    `- Audit tooling: \`${run.auditToolingSha}\``,
    `- Audit version: \`${run.auditProgramVersion}\``,
    `- Product fingerprint: \`${run.productFingerprint.treeSha256}\``,
    `- Result: **${run.status}**`, `- Findings: ${findings.length}`,
    `- Mandatory unmeasured checks: ${run.mandatoryUnmeasured.length}`,
    `- Open external gates: ${run.openGateCount}`, ''];
  if (run.mode === 'comparison') lines.push(`- Comparison: **${run.comparison.status}**`, '');
  lines.push('| Audit | Pass | Fail | Unmeasured | N/A |', '|---|---:|---:|---:|---:|');
  run.audits.forEach(audit => lines.push(`| ${audit.auditId} — ${audit.title} | ${audit.counts.pass} | ${audit.counts.fail} | ${audit.counts.unmeasured} | ${audit.counts.na} |`));
  lines.push('', 'This is engineering audit evidence. It is not physical-device, UAT, legal, signing or release acceptance.', '');
  return lines.join('\n');
}

function artifactJson(value, forbiddenRoots) {
  const json = safeJson(value, { forbiddenRoots });
  return { json, bytes: Buffer.byteLength(json, 'utf8'), sha256: sha256(json) };
}

export async function runAudit(rawOptions) {
  if (!rawOptions || rawOptions.productBaseline !== PRODUCT_BASELINE_SHA) {
    throw new Error('AUDIT_PRODUCT_BASELINE_NOT_FROZEN');
  }
  const options = { ...rawOptions, root: path.resolve(rawOptions.root), output: path.resolve(rawOptions.output) };
  const startedAt = new Date();
  const executingRunner = fileURLToPath(import.meta.url);
  if (rawOptions.buildEvidence || rawOptions.mutationEvidence) {
    throw new Error('AUDIT_EXTERNAL_CONTROLLED_EVIDENCE_NOT_ALLOWED');
  }
  const physicalOutput = assertExternalPath(options.root, options.output, 'AUDIT_OUTPUT_MUST_BE_EXTERNAL');
  options.output = physicalOutput;
  if (fs.existsSync(options.output) && fs.readdirSync(options.output).length) throw new Error('AUDIT_OUTPUT_NOT_EMPTY');
  const context = buildContext(options.root);
  if (context.head !== options.targetSha) throw new Error('AUDIT_TARGET_SHA_MISMATCH');
  if (context.status) throw new Error('AUDIT_TARGET_NOT_CLEAN');
  const isolation = verifyIsolatedWorktree(options.root);
  const tooling = verifyToolingIdentity(options.root, context, options.auditToolingSha, executingRunner);
  git(options.root, ['cat-file', '-e', `${options.productBaseline}^{commit}`]);
  try {
    git(options.root, ['merge-base', '--is-ancestor', options.productBaseline, options.auditToolingSha]);
    git(options.root, ['merge-base', '--is-ancestor', options.productBaseline, context.head]);
  }
  catch (_) { throw new Error('AUDIT_PRODUCT_BASELINE_NOT_ANCESTOR'); }
  const baselineProductFingerprint = productFingerprintAt(options.root, options.productBaseline);
  assertToolingProductFingerprintAnchor(options.root, options.productBaseline, options.auditToolingSha);
  if (options.mode === 'baseline' && baselineProductFingerprint.treeSha256 !== context.productFingerprint.treeSha256) {
    throw new Error('AUDIT_PRODUCT_FINGERPRINT_DRIFT');
  }
  if (!context.exists('scripts/audit/test-registry.json')) throw new Error('AUDIT_TEST_REGISTRY_MISSING');

  const evidenceInputs = {
    performance: loadExternalJson(options.root, options.performanceEvidence, 'PERFORMANCE_EVIDENCE'),
    ui: loadExternalJson(options.root, options.uiEvidence, 'UI_EVIDENCE'),
    approval: loadExternalJson(options.root, options.comparisonApproval, 'COMPARISON_APPROVAL')
  };
  const baseline = options.mode === 'comparison' ? loadBaselineEvidence(options.root, options.baselineEvidence, {
    productBaselineSha: options.productBaseline, auditToolingSha: options.auditToolingSha,
    toolingFingerprint: tooling.fingerprint.treeSha256, currentTargetSha: context.head }) : null;
  const performanceEvidence = comparisonPerformance(evidenceInputs.performance.data, baseline);
  const testEvidence = runFullTests(options.root);
  const beforeWorktree = context.worktreeFingerprint.treeSha256;
  const controlledProbes = runControlledProbes({ root: options.root, targetSha: context.head,
    auditToolingSha: options.auditToolingSha, verifiedTooling: tooling });
  const auditContext = Object.freeze({ ...context,
    staticDiscoveryAuthority: Object.freeze({ complete: true,
      source: `frozen-audit-tooling:${options.auditToolingSha}:a7-a8-static-syntax-census-v3` }),
    messageInventoryAuthority: Object.freeze({ complete: true,
      source: `frozen-audit-tooling:${options.auditToolingSha}:a7-message-contract-census-v2` }),
    trackedSecretScanAuthority: Object.freeze({ complete: true,
      source: `frozen-audit-tooling:${options.auditToolingSha}:a8-tracked-secret-census-v1` }),
    controlledProbeProvenance: controlledProbes.provenance,
    mutationEvidence: controlledProbes.mutationEvidence,
    options: Object.freeze({ mode: options.mode, productBaseline: options.productBaseline,
      auditToolingSha: options.auditToolingSha, buildEvidence: controlledProbes.buildEvidence,
      performanceEvidence, uiEvidence: evidenceInputs.ui.data }) });
  const auditResults = [];
  for (const [auditId] of AUDIT_FILES) {
    const moduleFile = path.join(options.root, 'scripts', 'audit', 'audits', `${auditId.toLowerCase()}.mjs`);
    const module = await import(pathToFileURL(moduleFile).href);
    auditResults.push(await module.run(Object.freeze({ ...auditContext, testEvidence })));
  }
  validateAudits(auditResults);
  const afterContext = buildContext(options.root);
  if (afterContext.status || afterContext.trackedFingerprint.treeSha256 !== context.trackedFingerprint.treeSha256 ||
      afterContext.worktreeFingerprint.treeSha256 !== beforeWorktree) throw new Error('AUDIT_TARGET_MUTATED');

  const findings = auditResults.flatMap(audit => audit.checks.filter(check => check.result === 'fail')
    .map(check => ({ auditId: audit.auditId, ...check }))).sort((a, b) => compareText(a.id, b.id));
  const mandatoryUnmeasured = auditResults.flatMap(audit => audit.checks)
    .filter(check => check.mandatory && check.result === 'unmeasured').map(check => check.id).sort(compareText);
  const approvalIdentity = baseline ? {
    auditProgramVersion: AUDIT_VERSION,
    auditToolingSha: options.auditToolingSha,
    baselineManifestSha256: baseline.metadata.manifestSha256,
    baselineTargetSha: baseline.run.targetSha,
    productBaselineSha: options.productBaseline,
    targetSha: context.head
  } : null;
  const comparison = baseline ? evaluateComparison({ baselineAudits: baseline.audits, currentAudits: auditResults,
    comparisonApproval: evidenceInputs.approval.data, approvalIdentity,
    baselineOpenGates: baseline.openGates, currentOpenGates: OPEN_GATES }) :
    { schemaVersion: 1, status: 'not-applicable-baseline', approval: { provided: false, identityBound: false },
      failed: [], mandatoryUnmeasured: [], gates: [] };

  const forbiddenRoots = [options.root, os.homedir(), options.output];
  const auditArtifacts = auditResults.map((audit, index) => {
    const file = `${AUDIT_FILES[index][0]}-${AUDIT_FILES[index][1]}.json`;
    return { file, ...artifactJson(audit, forbiddenRoots) };
  });
  const openGates = { format: 'SAAGAR_WHOLE_APP_AUDIT_OPEN_GATES', schemaVersion: 1,
    productBaselineSha: options.productBaseline, targetSha: context.head,
    auditToolingSha: options.auditToolingSha, gates: OPEN_GATES };
  const openGatesArtifact = { file: 'OPEN-GATES.json', ...artifactJson(openGates, forbiddenRoots) };
  const findingReport = { format: 'SAAGAR_WHOLE_APP_AUDIT_FINDINGS', schemaVersion: 1,
    productBaselineSha: options.productBaseline, targetSha: context.head,
    auditToolingSha: options.auditToolingSha, findings,
    comparison: { status: comparison.status, failed: comparison.failed,
      mandatoryUnmeasured: comparison.mandatoryUnmeasured } };
  const findingsArtifact = { file: 'FINDINGS.json', ...artifactJson(findingReport, forbiddenRoots) };
  const endedAt = new Date();
  const hasComparisonGap = comparison.failed.length || comparison.mandatoryUnmeasured.length;
  const mutationProbeArtifact = { file: 'A5-MUTATIONS.json',
    ...artifactJson(controlledProbes.artifacts.mutation, forbiddenRoots) };
  const buildProbeArtifact = { file: 'A9-BUILD-COMPARISON.json',
    ...artifactJson(controlledProbes.artifacts.build, forbiddenRoots) };
  const run = {
    format: 'SAAGAR_WHOLE_APP_AUDIT_RUN', schemaVersion: 1, auditProgramVersion: AUDIT_VERSION,
    mode: options.mode,
    status: findings.length || mandatoryUnmeasured.length || hasComparisonGap ? 'complete-with-findings-or-gaps' : 'complete-pass',
    productBaselineSha: options.productBaseline, targetSha: context.head,
    auditToolingSha: options.auditToolingSha, auditToolingFingerprint: tooling.fingerprint,
    supportingArtifacts: {
      openGates: { file: openGatesArtifact.file, bytes: openGatesArtifact.bytes, sha256: openGatesArtifact.sha256 },
      mutationProbe: { file: mutationProbeArtifact.file, bytes: mutationProbeArtifact.bytes,
        sha256: mutationProbeArtifact.sha256 },
      buildProbe: { file: buildProbeArtifact.file, bytes: buildProbeArtifact.bytes,
        sha256: buildProbeArtifact.sha256 } },
    runner: { path: 'scripts/audit/run.mjs', bytes: fs.statSync(executingRunner).size,
      sha256: sha256(fs.readFileSync(executingRunner)) },
    target: { ...isolation, cleanBefore: true, cleanAfter: true },
    trackedFingerprint: compactFingerprint(context.trackedFingerprint),
    worktreeFingerprint: compactFingerprint(context.worktreeFingerprint),
    productFingerprint: compactFingerprint(context.productFingerprint),
    baselineProductFingerprint: compactFingerprint(baselineProductFingerprint),
    manifest: { path: 'www/module-manifest.js', sha256: sha256(context.read('www/module-manifest.js')),
      moduleCount: context.modules.length, sharedAssetCount: context.sharedAssets.length },
    toolchain: toolchain(evidenceInputs, controlledProbes),
    invocation: { command: 'node scripts/audit/run.mjs', options: { root: '<TARGET>', output: '<OUTPUT>',
      productBaseline: options.productBaseline, targetSha: options.targetSha,
      auditToolingSha: options.auditToolingSha, mode: options.mode,
      runTests: true, baselineEvidence: baseline ? baseline.metadata : { provided: false },
      performanceEvidence: evidenceInputs.performance.metadata, uiEvidence: evidenceInputs.ui.metadata,
      controlledBuildProbe: { source: 'runner-controlled', artifact: buildProbeArtifact.file,
        ...controlledProbes.status.build },
      controlledMutationProbe: { source: 'runner-controlled', artifact: mutationProbeArtifact.file,
        ...controlledProbes.status.mutation }, comparisonApproval: evidenceInputs.approval.metadata } },
    tests: testEvidence, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(),
    elapsedMs: endedAt - startedAt, findingCount: findings.length,
    mandatoryUnmeasured, openGateCount: OPEN_GATES.length, comparison,
    auditArtifacts: auditArtifacts.map(item => ({ file: item.file, bytes: item.bytes, sha256: item.sha256 })),
    audits: auditResults.map(audit => ({ auditId: audit.auditId, title: audit.title,
      counts: Object.fromEntries(['pass', 'fail', 'unmeasured', 'na'].map(key =>
        [key, audit.checks.filter(check => check.result === key).length])) }))
  };
  const runArtifact = { file: 'RUN.json', ...artifactJson(run, forbiddenRoots) };
  const summaryText = summaryMarkdown(run, findings);
  const summaryArtifact = { file: 'SUMMARY.md', json: summaryText,
    bytes: Buffer.byteLength(summaryText, 'utf8'), sha256: sha256(summaryText) };
  const outputArtifacts = [runArtifact, ...auditArtifacts, mutationProbeArtifact, buildProbeArtifact,
    openGatesArtifact, findingsArtifact, summaryArtifact];
  const evidenceManifest = buildEvidenceManifest({ mode: options.mode,
    productBaselineSha: options.productBaseline, targetSha: context.head,
    auditToolingSha: options.auditToolingSha }, outputArtifacts);

  fs.mkdirSync(options.output, { recursive: true });
  assertExternalPath(options.root, options.output, 'AUDIT_OUTPUT_MUST_BE_EXTERNAL');
  outputArtifacts.forEach(item => fs.writeFileSync(path.join(options.output, item.file), item.json,
    { encoding: 'utf8', flag: 'wx' }));
  fs.writeFileSync(path.join(options.output, EVIDENCE_MANIFEST_FILE), safeJson(evidenceManifest, { forbiddenRoots }),
    { encoding: 'utf8', flag: 'wx' });
  assertExternalPath(options.root, options.output, 'AUDIT_OUTPUT_MUST_BE_EXTERNAL');
  const finalContext = buildContext(options.root);
  if (finalContext.status || finalContext.worktreeFingerprint.treeSha256 !== beforeWorktree) throw new Error('AUDIT_TARGET_MUTATED');
  return { run, auditResults, findings, evidenceManifest, output: options.output };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runAudit(options);
  process.stdout.write(`${JSON.stringify({ status: result.run.status, productBaselineSha: result.run.productBaselineSha,
    targetSha: result.run.targetSha, auditToolingSha: result.run.auditToolingSha,
    findings: result.findings.length, mandatoryUnmeasured: result.run.mandatoryUnmeasured.length })}\n`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${JSON.stringify(safeError(error))}\n`); process.exitCode = 1; });
}
