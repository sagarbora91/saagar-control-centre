import path from 'node:path';

import { CRITICAL_TEST_DOMAINS } from '../config.mjs';
import { hasRunnerControlledProvenance } from '../controlled-probes.mjs';
import { auditResult, evidence, makeCheck, posix } from '../lib.mjs';

const MUTATION_EVIDENCE_CONTRACTS = Object.freeze({
  auth: Object.freeze({ mutationId: 'auth-one-retry-limit-v1', productionFile: 'www/reauth-policy.js', testCommand: 'node --test --test-reporter=tap tests/d1-reauth.test.mjs', expectedAssertion: 'D1 reauthentication limits a single action to one retry' }),
  backupRestore: Object.freeze({ mutationId: 'backup-photo-manifest-count-v1', productionFile: 'www/portable-backup.js', testCommand: 'node --test --test-reporter=tap tests/portable-backup.test.mjs', expectedAssertion: 'portable backup round-trips without leaking payload text' }),
  etpPublication: Object.freeze({ mutationId: 'etp-critical-reconciliation-publication-gate-v1', productionFile: 'www/etp-reconciliation-policy.js', testCommand: 'node --test --test-reporter=tap tests/etp-reconciliation-policy.test.mjs', expectedAssertion: 'publication refuses missing facts, restored state, incomplete scope and critical failures' }),
  export: Object.freeze({ mutationId: 'export-default-deny-policy-v1', productionFile: 'www/export-control.js', testCommand: 'node --test --test-reporter=tap tests/eng04-security.test.mjs', expectedAssertion: 'SEC-08 defaults to disabled and records the denied attempt without prompting' }),
  money: Object.freeze({ mutationId: 'money-reconciliation-delta-direction-v1', productionFile: 'www/etp-reconciliation-policy.js', testCommand: 'node --test --test-reporter=tap tests/etp-reconciliation-policy.test.mjs', expectedAssertion: 'INV/SR/BC signs are applied and a mismatch remains visible' }),
  storage: Object.freeze({ mutationId: 'storage-native-batch-bound-v1', productionFile: 'www/storage-core.js', testCommand: 'node --test --test-reporter=tap tests/native-incremental-storage-runtime.test.mjs', expectedAssertion: 'runtime flush writes only changed records in bounded native batches' })
});

function testCommands(packageJson) {
  const commands = [];
  for (const [name, command] of Object.entries(packageJson.scripts || {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/(?:^|:)test|^pretest/.test(name) || typeof command !== 'string') continue;
    const files = [...command.matchAll(/(?:^|[\s"'])(tests\/[A-Za-z0-9_./-]+\.test\.mjs)(?=$|[\s"'])/g)]
      .map(match => posix(match[1]));
    commands.push({ name, command, files: [...new Set(files)].sort() });
  }
  return commands;
}

function coverageKind(source) {
  const productionImport = /(?:require\s*\(|from\s+|import\s*\()\s*["']\.\.\/www\//.test(source);
  const executesRuntime = /\bvm\.runIn(?:New)?Context\s*\(|\bcreateStorageCoreHarness\s*\(|\bloadModuleBundle\s*\(|\bexecFile(?:Sync)?\s*\(|\bspawn(?:Sync)?\s*\(/.test(source);
  const readsSource = /\b(?:readFile|readFileSync)\s*\(/.test(source);
  const sourceAssertions = /\bassert\.(?:match|doesNotMatch)\s*\(/.test(source);
  const behavioral = productionImport || executesRuntime;
  return {
    behavioral,
    sourceTextOnly: readsSource && sourceAssertions && !behavioral,
    sourceRead: readsSource
  };
}

function exclusionValid(value) {
  return value && typeof value === 'object' && typeof value.command === 'string' && value.command.trim() &&
    typeof value.environment === 'string' && value.environment.trim() &&
    typeof value.reason === 'string' && value.reason.trim();
}

export function validateMutationEvidenceEnvelope(context, domains, envelope) {
  const unavailable = reason => ({ measured: false, failures: [], rows: [], reason });
  if (Array.isArray(envelope)) return unavailable('MUTATION_EVIDENCE_BARE_ARRAY_REJECTED');
  if (!envelope || typeof envelope !== 'object') return unavailable('MUTATION_EVIDENCE_UNAVAILABLE');
  const keys = Object.keys(envelope).sort();
  const expectedKeys = ['format', 'mutations', 'productFingerprintSha256', 'schemaVersion', 'sourceSha', 'toolingSha'];
  const contextProductSha = context.productFingerprint && context.productFingerprint.treeSha256;
  const contextToolingSha = context.options && context.options.auditToolingSha;
  const identityValid = envelope.format === 'SAAGAR_AUDIT_MUTATION_EVIDENCE' && envelope.schemaVersion === 1 &&
    JSON.stringify(keys) === JSON.stringify(expectedKeys) && /^[a-f0-9]{40}$/.test(String(envelope.sourceSha || '')) &&
    envelope.sourceSha === context.head && /^[a-f0-9]{64}$/.test(String(envelope.productFingerprintSha256 || '')) &&
    envelope.productFingerprintSha256 === contextProductSha && /^[a-f0-9]{40}$/.test(String(envelope.toolingSha || '')) &&
    envelope.toolingSha === contextToolingSha;
  if (!identityValid || !Array.isArray(envelope.mutations)) return unavailable('MUTATION_EVIDENCE_IDENTITY_INVALID');
  const frozenDomains = Object.keys(MUTATION_EVIDENCE_CONTRACTS).sort();
  const expectedDomains = [...domains].sort();
  if (JSON.stringify(frozenDomains) !== JSON.stringify(expectedDomains)) return unavailable('MUTATION_EVIDENCE_CONTRACT_DRIFT');
  const rows = envelope.mutations;
  const observedDomains = rows.map(row => row && row.invariantId);
  const safe = rows.length === expectedDomains.length && JSON.stringify(observedDomains) === JSON.stringify(expectedDomains) && rows.every(row => {
    const rowKeys = row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row).sort() : [];
    const expectedRowKeys = ['afterProductSha256', 'assertionEvidence', 'beforeProductSha256', 'detected', 'disposableWorktree', 'exitCode', 'expectedAssertion', 'invariantId', 'mutationId', 'outputSha256', 'productionFile', 'testCommand'];
    const contract = MUTATION_EVIDENCE_CONTRACTS[row && row.invariantId];
    const assertion = row && row.assertionEvidence;
    const assertionKeys = assertion && typeof assertion === 'object' && !Array.isArray(assertion) ? Object.keys(assertion).sort() : [];
    const expectedAssertionKeys = ['assertionFailureDetected', 'matchedFailureBlockSha256', 'namedFailureDetected', 'setupFailureDetected'];
    if (JSON.stringify(rowKeys) !== JSON.stringify(expectedRowKeys) || !contract || JSON.stringify(assertionKeys) !== JSON.stringify(expectedAssertionKeys)) return false;
    const flagsValid = typeof assertion.assertionFailureDetected === 'boolean' && typeof assertion.namedFailureDetected === 'boolean' && assertion.setupFailureDetected === false;
    const blockHashValid = assertion.namedFailureDetected ? /^[a-f0-9]{64}$/.test(String(assertion.matchedFailureBlockSha256 || '')) : assertion.matchedFailureBlockSha256 === '';
    const exitValid = Number.isSafeInteger(row.exitCode) && row.exitCode >= 0 && row.exitCode <= 255;
    const passingOutputCoherent = row.exitCode !== 0 || (!assertion.namedFailureDetected && !assertion.assertionFailureDetected);
    const expectedDetected = row.exitCode !== 0 && assertion.namedFailureDetected && assertion.assertionFailureDetected && !assertion.setupFailureDetected;
    return row.disposableWorktree === true && typeof row.detected === 'boolean' && row.detected === expectedDetected && flagsValid && blockHashValid && exitValid && passingOutputCoherent && row.mutationId === contract.mutationId && row.productionFile === contract.productionFile && row.testCommand === contract.testCommand && row.expectedAssertion === contract.expectedAssertion && /^[a-f0-9]{64}$/.test(String(row.outputSha256 || '')) && row.beforeProductSha256 === contextProductSha && row.afterProductSha256 === contextProductSha;
  });
  if (!safe) return unavailable('MUTATION_EVIDENCE_ROWS_INVALID');
  return { measured: true, failures: rows.filter(row => !row.detected), rows, reason: '' };
}

function mutationAssessment(context, domains) {
  const envelope = context.mutationEvidence;
  if (Array.isArray(envelope) || !envelope || typeof envelope !== 'object') {
    return validateMutationEvidenceEnvelope(context, domains, envelope);
  }
  if (!hasRunnerControlledProvenance(context.controlledProbeProvenance, envelope, 'mutation', context)) {
    return { measured: false, failures: [], rows: [], reason: 'MUTATION_EVIDENCE_NOT_RUNNER_CONTROLLED' };
  }
  return validateMutationEvidenceEnvelope(context, domains, envelope);
}

export async function run(context) {
  const packageJson = JSON.parse(context.read('package.json'));
  const registry = JSON.parse(context.read('scripts/audit/test-registry.json'));
  const commands = testCommands(packageJson);
  const commandMembership = new Map();
  for (const command of commands) {
    for (const file of command.files) {
      if (!commandMembership.has(file)) commandMembership.set(file, []);
      commandMembership.get(file).push(`npm run ${command.name}`);
    }
  }

  const testFiles = context.files
    .filter(file => /^tests\/(?!helpers\/).+\.test\.mjs$/.test(file))
    .sort();
  const approvedExclusions = registry.approvedExclusions && typeof registry.approvedExclusions === 'object'
    ? registry.approvedExclusions : {};
  const malformedExclusions = Object.entries(approvedExclusions)
    .filter(([, value]) => !exclusionValid(value))
    .map(([file]) => posix(file));
  const staleExclusions = Object.keys(approvedExclusions).map(posix).filter(file => !testFiles.includes(file));

  const inventory = testFiles.map(file => {
    const packageCommands = [...(commandMembership.get(file) || [])].sort();
    const excluded = Object.prototype.hasOwnProperty.call(approvedExclusions, file);
    const classification = coverageKind(context.read(file));
    return {
      path: file,
      basename: path.basename(file, '.test.mjs'),
      registration: packageCommands.length ? 'package-command' : excluded ? 'approved-exclusion' : 'unregistered',
      commands: packageCommands,
      environment: packageCommands.length ? 'node-host' : excluded && approvedExclusions[file].environment,
      ...classification
    };
  });
  const unregistered = inventory.filter(item => item.registration === 'unregistered');

  const domainRows = Object.entries(CRITICAL_TEST_DOMAINS).sort(([a], [b]) => a.localeCompare(b)).map(([domain, stems]) => {
    const tests = inventory.filter(item => stems.some(stem => item.basename.includes(stem)));
    return {
      domain,
      testFiles: tests.length,
      behavioralTests: tests.filter(item => item.behavioral).length,
      sourceTextOnlyTests: tests.filter(item => item.sourceTextOnly).length,
      files: tests.map(item => item.path).sort()
    };
  });
  const sourceOnlyDomains = domainRows.filter(row => row.testFiles > 0 && row.behavioralTests === 0 && row.sourceTextOnlyTests > 0);
  const missingBehavioral = domainRows.filter(row => row.behavioralTests === 0);
  const domainNames = domainRows.map(row => row.domain);
  const mutation = mutationAssessment(context, domainNames);

  const checks = [
    makeCheck({
      id: 'A5-01', title: 'Test inventory and registry membership', result: 'pass', severity: 'INFO',
      metric: {
        testFiles: inventory.length,
        packageTestCommands: commands.length,
        packageRegistered: inventory.filter(item => item.registration === 'package-command').length,
        approvedExclusions: inventory.filter(item => item.registration === 'approved-exclusion').length,
        unregistered: unregistered.length
      },
      rule: 'Inventory every tracked test and its exact package-command or approved-exclusion membership',
      evidence: inventory.map(item => ({
        path: item.path,
        code: item.registration.toUpperCase().replaceAll('-', '_'),
        commands: item.commands,
        environment: item.environment,
        coverage: item.behavioral ? 'behavioral' : item.sourceTextOnly ? 'source-text-only' : 'other'
      }))
    }),
    makeCheck({
      id: 'A5-02', title: 'Critical paths require behavioral assertions',
      result: sourceOnlyDomains.length ? 'fail' : 'pass', severity: sourceOnlyDomains.length ? 'P1' : 'INFO', mandatory: true,
      metric: { criticalDomains: domainRows.length, sourceTextOnlyDomains: sourceOnlyDomains.length },
      rule: 'A critical domain covered only by source-text assertions is P1',
      evidence: sourceOnlyDomains.map(row => ({ domain: row.domain, code: 'CRITICAL_DOMAIN_SOURCE_TEXT_ONLY', files: row.files }))
    }),
    makeCheck({
      id: 'A5-03', title: 'Committed test registry completeness',
      result: unregistered.length || malformedExclusions.length || staleExclusions.length ? 'fail' : 'pass',
      severity: unregistered.length || malformedExclusions.length || staleExclusions.length ? 'P1' : 'INFO', mandatory: true,
      metric: {
        unregisteredFiles: unregistered.length,
        malformedExclusions: malformedExclusions.length,
        staleExclusions: staleExclusions.length
      },
      rule: 'Every test file must have a package command and environment class, or a complete approved exclusion',
      evidence: evidence([
        ...unregistered.map(item => ({ path: item.path, code: 'TEST_UNREGISTERED' })),
        ...malformedExclusions.map(file => ({ path: file, code: 'EXCLUSION_METADATA_INCOMPLETE' })),
        ...staleExclusions.map(file => ({ path: file, code: 'EXCLUSION_TARGET_MISSING' }))
      ])
    }),
    makeCheck({
      id: 'A5-04', title: 'Critical-domain behavioral coverage',
      result: missingBehavioral.length ? 'fail' : 'pass', severity: missingBehavioral.length ? 'P0' : 'INFO', mandatory: true,
      metric: { criticalDomains: domainRows.length, domainsWithoutBehavioralTest: missingBehavioral.length },
      rule: 'Money, storage, auth, backup/restore, export and ETP publication each require a behavioral test',
      evidence: domainRows.map(row => ({
        domain: row.domain,
        code: row.behavioralTests ? 'BEHAVIORAL_COVERAGE_PRESENT' : 'BEHAVIORAL_COVERAGE_MISSING',
        testFiles: row.testFiles,
        behavioralTests: row.behavioralTests,
        sourceTextOnlyTests: row.sourceTextOnlyTests
      }))
    }),
    makeCheck({
      id: 'A5-05', title: 'Critical-invariant mutation detection',
      result: !mutation.measured ? 'unmeasured' : mutation.failures.length ? 'fail' : 'pass',
      severity: mutation.failures.length ? 'P1' : 'INFO', mandatory: true,
      metric: { requiredMutations: domainRows.length, measuredMutations: mutation.rows.length, undetectedMutations: mutation.failures.length },
      rule: 'One deterministic mutation per critical invariant must be detected in a disposable worktree',
      evidence: mutation.measured
        ? mutation.rows.map(row => ({ invariantId: row.invariantId, code: row.detected ? 'MUTATION_DETECTED' : 'MUTATION_UNDETECTED' }))
        : [{ code: mutation.reason || 'SAFE_DISPOSABLE_MUTATION_EVIDENCE_UNAVAILABLE' }],
      notes: mutation.measured ? '' : 'No complete identity-bound disposable-worktree mutation evidence was supplied; this is not a pass.'
    })
  ];

  return auditResult('A5', 'Tests and guard rails', checks, {
    testFiles: inventory.length,
    testCommands: commands.length,
    criticalDomains: domainRows.length
  });
}
