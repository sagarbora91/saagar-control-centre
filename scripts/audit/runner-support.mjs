import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { AUDIT_PROGRAM_CLOSURE_ADDENDUM_FILE, AUDIT_PROGRAM_FILE, AUDIT_PROGRAM_PATTERN,
  AUDIT_VERSION, compareText, revisionFingerprint, sha256 } from './lib.mjs';

const AUDIT_FILES = Object.freeze([
  ['A1', 'architecture', 7], ['A2', 'duplication', 5], ['A3', 'capabilities', 5],
  ['A4', 'storage', 6], ['A5', 'tests', 5], ['A6', 'ui', 5], ['A7', 'protocol', 5],
  ['A8', 'security', 5], ['A9', 'build', 5], ['A10', 'performance', 5], ['A11', 'documentation', 5]
]);
export const EVIDENCE_MANIFEST_FILE = 'EVIDENCE-MANIFEST.json';
export const EVIDENCE_MANIFEST_FORMAT = 'SAAGAR_WHOLE_APP_AUDIT_EVIDENCE_MANIFEST';
const BASELINE_ARTIFACT_FILES = Object.freeze([
  'RUN.json', ...AUDIT_FILES.map(([id, name]) => `${id}-${name}.json`),
  'A5-MUTATIONS.json', 'A9-BUILD-COMPARISON.json', 'OPEN-GATES.json', 'FINDINGS.json', 'SUMMARY.md'
].sort(compareText));
const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;

/* ── Conservative static-discovery semantics (closure addendum §3) ───────────
   A7 and A8 are heuristic static discovery, not complete JavaScript proofs.
   Alias, reassignment, computed-property, regex-literal and control-flow
   variants can always extend the syntax surface, so the absence of a discovered
   violation never establishes safety.

   Therefore a check built on heuristic scanning reports:
     definite violation                  -> 'fail'
     no violation, complete authority    -> 'pass'
     no violation, no complete authority -> 'unmeasured'

   'Complete authority' means an explicit complete registry, a trusted runtime
   probe, or an independently authenticated scanner that proves total coverage
   of the analysed surface. No such authority exists in v1, so these checks
   settle at 'unmeasured' rather than 'pass'. The authority is expressed as a
   value rather than hardcoded so that adding one later flips the semantics
   correctly instead of requiring these call sites to be rewritten.

   Checks over a closed, enumerable, hash-bound set (for example manifest and
   packaged-binding parity) are NOT heuristic and must not use this helper. */

export const STATIC_DISCOVERY_INCOMPLETE = 'STATIC_DISCOVERY_COVERAGE_INCOMPLETE';

export function staticDiscoveryAuthority(context = {}) {
  const declared = context && context.staticDiscoveryAuthority;
  if (!declared || typeof declared !== 'object') {
    return Object.freeze({ complete: false, code: STATIC_DISCOVERY_INCOMPLETE, source: 'none' });
  }
  const complete = declared.complete === true && typeof declared.source === 'string' && declared.source.length > 0;
  return Object.freeze({
    complete,
    code: complete ? '' : STATIC_DISCOVERY_INCOMPLETE,
    source: complete ? declared.source : 'none'
  });
}

export function conservativeStaticResult({ definiteViolations = 0, unresolved = 0, authority } = {}) {
  if (definiteViolations > 0) return 'fail';
  if (unresolved > 0) return 'unmeasured';
  return authority && authority.complete === true ? 'pass' : 'unmeasured';
}

export function staticDiscoveryEvidence(authority, existing = []) {
  if (Array.isArray(existing) && existing.length > 0) return existing;
  if (authority && authority.complete === true) {
    return [{ code: 'STATIC_DISCOVERY_COVERAGE_COMPLETE', source: authority.source }];
  }
  return [{ code: STATIC_DISCOVERY_INCOMPLETE }];
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function gitBytes(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: null, windowsHide: true, maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function realWithMissingTail(value) {
  let cursor = path.resolve(value);
  const tail = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error('AUDIT_PATH_ROOT_UNAVAILABLE');
    tail.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(fs.realpathSync.native(cursor), ...tail);
}

export function pathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function gradleVersionLauncher(root) {
  const android = path.join(path.resolve(root), 'android');
  if (process.platform === 'win32') {
    const file = path.join(android, 'gradlew.bat');
    /* The wrapper is addressed as an explicit current-directory-relative path.
       A bare `gradlew.bat` relies on cmd.exe resolving the current directory
       through its executable search, which Windows disables when the hardening
       variable NoDefaultCurrentDirectoryInExePath is set. Under that setting a
       bare name fails with "not recognized", so the launcher would report a
       toolchain failure caused purely by the host environment. The `.\` form
       resolves against cwd directly and is independent of that setting. An
       absolute path is not used: cmd.exe /c re-parses the command string and a
       quoted absolute path does not survive that parse reliably. */
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', '.\\gradlew.bat --version'],
      cwd: android, display: 'android/gradlew --version', file };
  }
  const file = path.join(android, 'gradlew');
  return { command: file, args: ['--version'], cwd: android,
    display: 'android/gradlew --version', file };
}

export function assertExternalPath(root, candidate, code = 'AUDIT_EXTERNAL_PATH_REQUIRED') {
  const physicalRoot = fs.realpathSync.native(path.resolve(root));
  const physicalCandidate = realWithMissingTail(candidate);
  const worktrees = canonicalGitWorktreeRoots(physicalRoot);
  if (worktrees.some(worktree => pathInside(worktree, physicalCandidate))) throw new Error(code);
  return physicalCandidate;
}

function absoluteGitPath(root, args) {
  const value = git(root, ['rev-parse', '--path-format=absolute', ...args]);
  return fs.realpathSync.native(path.resolve(value));
}

export function verifyIsolatedWorktree(root) {
  const physicalRoot = fs.realpathSync.native(path.resolve(root));
  const top = fs.realpathSync.native(path.resolve(git(root, ['rev-parse', '--show-toplevel'])));
  if (physicalRoot.toLowerCase() !== top.toLowerCase()) throw new Error('AUDIT_TARGET_NOT_REPOSITORY_ROOT');
  const gitDir = absoluteGitPath(root, ['--git-dir']);
  const commonDir = absoluteGitPath(root, ['--git-common-dir']);
  const linked = gitDir.toLowerCase() !== commonDir.toLowerCase();
  const detached = git(root, ['branch', '--show-current']) === '';
  if (!linked || !detached) throw new Error('AUDIT_TARGET_NOT_DETACHED_LINKED_WORKTREE');
  return { rootKind: 'detached-linked-worktree', repositoryRootVerified: true,
    linkedWorktree: linked, detachedHead: detached };
}

export function isAuditToolingPath(file) {
  const value = String(file).replaceAll('\\', '/');
  return value.startsWith('scripts/audit/') || value === 'tests/whole-app-audit-runner.test.mjs' ||
    AUDIT_PROGRAM_PATTERN.test(value);
}

function revisionFiles(root, revision) {
  const output = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', '-z', revision], {
    encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output.toString('utf8').split('\0').filter(Boolean).map(value => value.replaceAll('\\', '/')).sort(compareText);
}

export function verifyToolingIdentity(root, context, toolingSha, executingRunner) {
  if (!HEX_40.test(toolingSha)) throw new Error('AUDIT_TOOLING_SHA_INVALID');
  git(root, ['cat-file', '-e', `${toolingSha}^{commit}`]);
  try { git(root, ['merge-base', '--is-ancestor', toolingSha, context.head]); }
  catch (_) { throw new Error('AUDIT_TOOLING_SHA_NOT_ANCESTOR'); }
  const targetRunner = fs.realpathSync.native(path.join(root, 'scripts', 'audit', 'run.mjs'));
  if (fs.realpathSync.native(executingRunner).toLowerCase() !== targetRunner.toLowerCase()) {
    throw new Error('AUDIT_RUNNER_TARGET_MISMATCH');
  }
  const declared = revisionFiles(root, toolingSha).filter(isAuditToolingPath);
  const current = context.files.filter(isAuditToolingPath).sort(compareText);
  const required = [AUDIT_PROGRAM_FILE, AUDIT_PROGRAM_CLOSURE_ADDENDUM_FILE,
    'scripts/audit/run.mjs', 'scripts/audit/lib.mjs', 'scripts/audit/schema.mjs',
    'scripts/audit/runner-support.mjs', 'scripts/audit/comparison.mjs',
    'scripts/audit/compare-apks.mjs', 'scripts/audit/capture-build.mjs',
    'scripts/audit/capture-mutations.mjs', 'scripts/audit/controlled-probes.mjs',
    'scripts/audit/config.mjs',
    'scripts/audit/test-registry.json', 'tests/whole-app-audit-runner.test.mjs',
    ...AUDIT_FILES.map(([id]) => `scripts/audit/audits/${id.toLowerCase()}.mjs`)];
  if (required.some(file => !declared.includes(file)) || JSON.stringify(declared) !== JSON.stringify(current)) {
    throw new Error('AUDIT_TOOLING_FILESET_MISMATCH');
  }
  const expected = revisionFingerprint(root, declared, toolingSha);
  const actual = revisionFingerprint(root, current, context.head);
  if (expected.treeSha256 !== actual.treeSha256) throw new Error('AUDIT_TOOLING_FINGERPRINT_MISMATCH');
  return { sha: toolingSha, fingerprint: { algorithm: actual.algorithm, fileCount: actual.fileCount,
    totalBytes: actual.totalBytes, treeSha256: actual.treeSha256 } };
}

function parseJsonBytes(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (_) { throw new Error(code); }
}

export function loadExternalJson(root, file, label, maximumBytes = 8 * 1024 * 1024) {
  if (!file) return { data: null, metadata: { provided: false } };
  const resolved = assertExternalPath(root, path.resolve(file), `AUDIT_${label}_MUST_BE_EXTERNAL`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > maximumBytes) throw new Error(`AUDIT_${label}_FILE_INVALID`);
  const bytes = fs.readFileSync(resolved);
  return { data: parseJsonBytes(bytes, `AUDIT_${label}_JSON_INVALID`),
    metadata: { provided: true, bytes: bytes.length, sha256: sha256(bytes) } };
}

function readBounded(file, code) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error(code);
  return fs.readFileSync(file);
}

function readBoundedJson(file, code) {
  const bytes = readBounded(file, code);
  return { value: parseJsonBytes(bytes, code), bytes };
}

function artifactIdentity(file, bytes) {
  return { file, bytes: bytes.length, sha256: sha256(bytes) };
}

export function buildEvidenceManifest(identity, artifacts) {
  const rows = (artifacts || []).map(item => ({ file: item.file, bytes: item.bytes, sha256: item.sha256 }))
    .sort((left, right) => compareText(left.file, right.file));
  if (!identity || !['baseline', 'comparison'].includes(identity.mode) || !HEX_40.test(String(identity.productBaselineSha || '')) ||
      !HEX_40.test(String(identity.targetSha || '')) || !HEX_40.test(String(identity.auditToolingSha || '')) ||
      rows.length !== BASELINE_ARTIFACT_FILES.length ||
      JSON.stringify(rows.map(item => item.file)) !== JSON.stringify(BASELINE_ARTIFACT_FILES) ||
      rows.some(item => !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !HEX_64.test(String(item.sha256 || '')))) {
    throw new Error('AUDIT_EVIDENCE_MANIFEST_INPUT_INVALID');
  }
  return { format: EVIDENCE_MANIFEST_FORMAT, schemaVersion: 1, mode: identity.mode,
    productBaselineSha: identity.productBaselineSha, targetSha: identity.targetSha,
    auditToolingSha: identity.auditToolingSha, artifactCount: rows.length, artifacts: rows };
}

function validateAuditArtifact(value, id, count, seen) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.auditId !== id ||
      typeof value.title !== 'string' || !Array.isArray(value.checks) || value.checks.length !== count) {
    throw new Error('AUDIT_BASELINE_CHECK_CONTRACT_INVALID');
  }
  value.checks.forEach((check, index) => {
    const expected = `${id}-${String(index + 1).padStart(2, '0')}`;
    if (!check || typeof check !== 'object' || check.id !== expected || seen.has(check.id) ||
        !['pass', 'fail', 'unmeasured', 'na'].includes(check.result) ||
        !['P0', 'P1', 'P2', 'P3', 'INFO'].includes(check.severity) ||
        typeof check.mandatory !== 'boolean' || typeof check.title !== 'string' ||
        typeof check.rule !== 'string' || typeof check.notes !== 'string' ||
        !Array.isArray(check.evidence) || check.evidence.length > 200 ||
        !check.metric || typeof check.metric !== 'object' || Array.isArray(check.metric)) {
      throw new Error('AUDIT_BASELINE_CHECK_CONTRACT_INVALID');
    }
    seen.add(check.id);
  });
}

export function assertBaselineEvidenceDirectoryTarget(relative, targetSha) {
  const match = /^verification\/audit\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-([a-f0-9]{7,12})$/.exec(
    String(relative || '').replaceAll('\\', '/'));
  if (!match) throw new Error('AUDIT_COMPARISON_BASELINE_PATH_INVALID');
  if (!HEX_40.test(String(targetSha || '')) || !String(targetSha).startsWith(match[1])) {
    throw new Error('AUDIT_BASELINE_DIRECTORY_TARGET_MISMATCH');
  }
  return match[1];
}

function committedEvidenceDirectory(root, directory, currentTargetSha) {
  if (!HEX_40.test(String(currentTargetSha || ''))) throw new Error('AUDIT_TARGET_SHA_INVALID');
  const physicalRoot = fs.realpathSync.native(path.resolve(root));
  const requested = path.resolve(directory);
  const stat = fs.lstatSync(requested, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error('AUDIT_COMPARISON_BASELINE_INVALID');
  const resolved = fs.realpathSync.native(requested);
  if (!pathInside(physicalRoot, resolved)) throw new Error('AUDIT_COMPARISON_BASELINE_NOT_COMMITTED');
  const relative = path.relative(physicalRoot, resolved).replaceAll('\\', '/');
  const directoryMatch = /^verification\/audit\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-([a-f0-9]{7,12})$/.exec(relative);
  if (!directoryMatch) {
    throw new Error('AUDIT_COMPARISON_BASELINE_PATH_INVALID');
  }
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile() || entry.isSymbolicLink())) throw new Error('AUDIT_BASELINE_ARTIFACT_SET_INVALID');
  const names = entries.map(entry => entry.name).sort(compareText);
  const expectedNames = [...BASELINE_ARTIFACT_FILES, EVIDENCE_MANIFEST_FILE].sort(compareText);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) throw new Error('AUDIT_BASELINE_ARTIFACT_SET_INVALID');
  const tracked = gitBytes(root, ['ls-tree', '-r', '--name-only', '-z', currentTargetSha, '--', relative])
    .toString('utf8').split('\0').filter(Boolean).map(file => file.slice(relative.length + 1)).sort(compareText);
  if (JSON.stringify(tracked) !== JSON.stringify(expectedNames)) throw new Error('AUDIT_BASELINE_ARTIFACT_SET_NOT_COMMITTED');
  return { resolved, relative, names, targetSuffix: directoryMatch[1] };
}

export function loadBaselineEvidence(root, directory, expected) {
  if (!directory) throw new Error('AUDIT_COMPARISON_BASELINE_REQUIRED');
  const location = committedEvidenceDirectory(root, directory, expected.currentTargetSha);
  const allBytes = new Map();
  for (const file of location.names) {
    const bytes = readBounded(path.join(location.resolved, file), 'AUDIT_BASELINE_ARTIFACT_INVALID');
    const blob = gitBytes(root, ['cat-file', 'blob', `${expected.currentTargetSha}:${location.relative}/${file}`]);
    if (!bytes.equals(blob)) throw new Error('AUDIT_BASELINE_COMMITTED_BYTES_MISMATCH');
    allBytes.set(file, bytes);
  }

  const manifestBytes = allBytes.get(EVIDENCE_MANIFEST_FILE);
  const manifest = parseJsonBytes(manifestBytes, 'AUDIT_BASELINE_MANIFEST_INVALID');
  if (!manifest || manifest.format !== EVIDENCE_MANIFEST_FORMAT || manifest.schemaVersion !== 1 ||
      manifest.mode !== 'baseline' || manifest.productBaselineSha !== expected.productBaselineSha ||
      manifest.auditToolingSha !== expected.auditToolingSha || !HEX_40.test(String(manifest.targetSha || '')) ||
      manifest.artifactCount !== BASELINE_ARTIFACT_FILES.length || !Array.isArray(manifest.artifacts)) {
    throw new Error('AUDIT_BASELINE_MANIFEST_IDENTITY_MISMATCH');
  }
  const declaredRows = manifest.artifacts.slice().sort((left, right) => compareText(left.file, right.file));
  assertBaselineEvidenceDirectoryTarget(location.relative, manifest.targetSha);
  if (JSON.stringify(declaredRows.map(item => item.file)) !== JSON.stringify(BASELINE_ARTIFACT_FILES) ||
      new Set(declaredRows.map(item => item.file)).size !== BASELINE_ARTIFACT_FILES.length) {
    throw new Error('AUDIT_BASELINE_MANIFEST_ARTIFACT_SET_INVALID');
  }
  for (const identity of declaredRows) {
    const bytes = allBytes.get(identity.file);
    if (!bytes || identity.bytes !== bytes.length || identity.sha256 !== sha256(bytes)) {
      throw new Error('AUDIT_BASELINE_MANIFEST_ARTIFACT_IDENTITY_MISMATCH');
    }
  }

  const runRead = { value: parseJsonBytes(allBytes.get('RUN.json'), 'AUDIT_BASELINE_RUN_INVALID'),
    bytes: allBytes.get('RUN.json') };
  const run = runRead.value;
  if (run.format !== 'SAAGAR_WHOLE_APP_AUDIT_RUN' || run.schemaVersion !== 1 || run.mode !== 'baseline' ||
      run.auditProgramVersion !== AUDIT_VERSION || run.productBaselineSha !== expected.productBaselineSha ||
      run.targetSha !== manifest.targetSha || run.auditToolingSha !== expected.auditToolingSha ||
      !run.auditToolingFingerprint || run.auditToolingFingerprint.treeSha256 !== expected.toolingFingerprint) {
    throw new Error('AUDIT_BASELINE_IDENTITY_MISMATCH');
  }
  try { git(root, ['merge-base', '--is-ancestor', run.targetSha, expected.currentTargetSha]); }
  catch (_) { throw new Error('AUDIT_BASELINE_TARGET_NOT_ANCESTOR'); }
  assertBaselineEvidenceDirectoryTarget(location.relative, run.targetSha);

  const declaredAudits = new Map((run.auditArtifacts || []).map(item => [item.file, item]));
  if (declaredAudits.size !== AUDIT_FILES.length || (run.auditArtifacts || []).length !== AUDIT_FILES.length) {
    throw new Error('AUDIT_BASELINE_RUN_ARTIFACT_SET_INVALID');
  }
  const audits = [];
  const seen = new Set();
  for (const [id, name, count] of AUDIT_FILES) {
    const file = `${id}-${name}.json`;
    const bytes = allBytes.get(file);
    const identity = declaredAudits.get(file);
    if (!identity || identity.bytes !== bytes.length || identity.sha256 !== sha256(bytes)) {
      throw new Error('AUDIT_BASELINE_ARTIFACT_IDENTITY_MISMATCH');
    }
    const audit = parseJsonBytes(bytes, 'AUDIT_BASELINE_ARTIFACT_INVALID');
    validateAuditArtifact(audit, id, count, seen);
    audits.push(audit);
  }
  if (seen.size !== 58) throw new Error('AUDIT_BASELINE_CHECK_TOTAL_INVALID');

  const gatesBytes = allBytes.get('OPEN-GATES.json');
  const gates = parseJsonBytes(gatesBytes, 'AUDIT_BASELINE_GATES_INVALID');
  const gatesIdentity = run.supportingArtifacts && run.supportingArtifacts.openGates;
  if (!gates || gates.format !== 'SAAGAR_WHOLE_APP_AUDIT_OPEN_GATES' || gates.schemaVersion !== 1 ||
      gates.productBaselineSha !== run.productBaselineSha || gates.targetSha !== run.targetSha ||
      gates.auditToolingSha !== run.auditToolingSha || !Array.isArray(gates.gates) ||
      !gatesIdentity || gatesIdentity.file !== 'OPEN-GATES.json' || gatesIdentity.bytes !== gatesBytes.length ||
      gatesIdentity.sha256 !== sha256(gatesBytes)) throw new Error('AUDIT_BASELINE_GATES_IDENTITY_MISMATCH');
  const controlledArtifacts = [
    ['mutationProbe', 'A5-MUTATIONS.json'], ['buildProbe', 'A9-BUILD-COMPARISON.json']
  ];
  for (const [key, file] of controlledArtifacts) {
    const bytes = allBytes.get(file);
    const identity = run.supportingArtifacts && run.supportingArtifacts[key];
    if (!bytes || !identity || identity.file !== file || identity.bytes !== bytes.length ||
        identity.sha256 !== sha256(bytes)) {
      throw new Error('AUDIT_BASELINE_CONTROLLED_ARTIFACT_IDENTITY_MISMATCH');
    }
    parseJsonBytes(bytes, 'AUDIT_BASELINE_CONTROLLED_ARTIFACT_INVALID');
  }


  const runSummaries = new Map((run.audits || []).map(item => [item.auditId, item]));
  if (runSummaries.size !== AUDIT_FILES.length) throw new Error('AUDIT_BASELINE_RUN_SUMMARY_INVALID');
  for (const audit of audits) {
    const summary = runSummaries.get(audit.auditId);
    const counts = Object.fromEntries(['pass', 'fail', 'unmeasured', 'na']
      .map(key => [key, audit.checks.filter(check => check.result === key).length]));
    if (!summary || !summary.counts || Object.entries(counts).some(([key, value]) => summary.counts[key] !== value)) {
      throw new Error('AUDIT_BASELINE_RUN_SUMMARY_INVALID');
    }
  }
  return { run, audits, openGates: gates.gates, manifest,
    metadata: { provided: true, committed: true, manifestBytes: manifestBytes.length,
      manifestSha256: sha256(manifestBytes), runBytes: runRead.bytes.length,
      runSha256: sha256(runRead.bytes) } };
}

export { AUDIT_FILES, BASELINE_ARTIFACT_FILES };
export function canonicalGitWorktreeRoots(root) {
  const output = gitBytes(root, ['worktree', 'list', '--porcelain', '-z']).toString('utf8');
  const values = output.split('\0').filter(row => row.startsWith('worktree '))
    .map(row => row.slice('worktree '.length));
  if (!values.length) throw new Error('AUDIT_GIT_WORKTREE_INVENTORY_UNAVAILABLE');
  const seen = new Set();
  return values.map(value => fs.realpathSync.native(path.resolve(value)))
    .filter(value => {
      const key = process.platform === 'win32' ? value.toLowerCase() : value;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).sort(compareText);
}

