import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { captureBuild, dependencyClosureIdentity } from './capture-build.mjs';
import { compareApks } from './compare-apks.mjs';
import { buildContext, sha256 } from './lib.mjs';

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const COMMAND_BYTES = 256 * 1024 * 1024;
const MUTATION_TIMEOUT_MS = 20 * 60 * 1000;
const BOOTSTRAP_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;
const GRADLE_WRAPPER_NETWORK_TIMEOUT_MS = 120_000;
const PROBE_KINDS = new Set(['build', 'mutation']);
const provenanceRegistry = new WeakMap();
const evidenceRegistry = new WeakMap();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function canonical(value) {
  const resolved = path.resolve(value);
  try { return fs.realpathSync.native(resolved); } catch (_) { return resolved; }
}

function samePath(left, right) {
  const a = canonical(left), b = canonical(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function inside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout || 30_000,
    maxBuffer: COMMAND_BYTES,
    env: options.env || process.env
  });
}

function git(root, args, timeout = 30_000) {
  const result = command('git', ['-C', root, ...args], { cwd: root, timeout });
  if (result.error || result.signal || result.status !== 0) fail('AUDIT_CONTROLLED_GIT_FAILED');
  return String(result.stdout || '').trim();
}

function npmInvocation(script) {
  if (!['add:android'].includes(script)) fail('AUDIT_CONTROLLED_NPM_SCRIPT_INVALID');
  if (process.platform === 'win32') return {
    command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `npm.cmd run ${script}`],
    display: `npm run ${script}`
  };
  return { command: 'npm', args: ['run', script], display: `npm run ${script}` };
}

function readJson(file) {
  const bytes = fs.readFileSync(file);
  if (!bytes.length || bytes.length > MAX_JSON_BYTES) fail('AUDIT_CONTROLLED_RECEIPT_SIZE_INVALID');
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (_) { fail('AUDIT_CONTROLLED_RECEIPT_JSON_INVALID'); }
}

function safeFailureCode(error, fallback) {
  const direct = String(error && (error.code || error.message) || '');
  const matched = /(?:^|:)(AUDIT_[A-Z0-9_]{3,120}|[A-Z][A-Z0-9_]{3,120})(?:$|\b)/.exec(direct);
  return matched ? matched[1] : fallback;
}

function targetIdentity(options) {
  const root = path.resolve(options.root);
  const context = buildContext(root);
  if (context.status) fail('AUDIT_CONTROLLED_TARGET_NOT_CLEAN');
  if (context.head !== options.targetSha) fail('AUDIT_CONTROLLED_TARGET_SHA_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(String(options.auditToolingSha || ''))) fail('AUDIT_CONTROLLED_TOOLING_SHA_INVALID');
  const executing = fileURLToPath(import.meta.url);
  const verified = options.verifiedTooling;
  if (!verified || verified.sha !== options.auditToolingSha || !verified.fingerprint ||
      !/^[a-f0-9]{64}$/.test(String(verified.fingerprint.treeSha256 || '')) ||
      !Number.isSafeInteger(verified.fingerprint.fileCount) || verified.fingerprint.fileCount < 1 ||
      !Number.isSafeInteger(verified.fingerprint.totalBytes) || verified.fingerprint.totalBytes < 1) {
    fail('AUDIT_CONTROLLED_TOOLING_NOT_VERIFIED');
  }
  if (!samePath(executing, path.join(root, 'scripts', 'audit', 'controlled-probes.mjs'))) {
    fail('AUDIT_CONTROLLED_PROBE_TARGET_MISMATCH');
  }
  return Object.freeze({ root, targetSha: context.head, auditToolingSha: options.auditToolingSha,
    auditToolingFingerprintSha256: verified.fingerprint.treeSha256,
    productFingerprintSha256: context.productFingerprint.treeSha256 });
}

function deepFreezeEvidence(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreezeEvidence(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function markEvidence(value, provenance, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !PROBE_KINDS.has(kind)) {
    fail('AUDIT_CONTROLLED_EVIDENCE_INVALID');
  }
  const frozen = deepFreezeEvidence(value);
  evidenceRegistry.set(frozen, Object.freeze({ provenance, kind }));
  return frozen;
}

export function hasRunnerControlledProvenance(provenance, evidence, kind, context) {
  const identity = provenance && provenanceRegistry.get(provenance);
  const binding = evidence && evidenceRegistry.get(evidence);
  const productSha = context && context.productFingerprint && context.productFingerprint.treeSha256;
  const toolingSha = context && context.options && context.options.auditToolingSha;
  return !!(identity && binding && binding.provenance === provenance && binding.kind === kind &&
    identity.targetSha === context.head && identity.productFingerprintSha256 === productSha &&
    identity.auditToolingSha === toolingSha);
}

function failureArtifact(kind, identity, error) {
  return Object.freeze({
    format: 'SAAGAR_AUDIT_CONTROLLED_PROBE_FAILURE', schemaVersion: 1,
    probe: kind, status: 'unmeasured', sourceSha: identity.targetSha,
    productFingerprintSha256: identity.productFingerprintSha256,
    toolingSha: identity.auditToolingSha,
    reason: safeFailureCode(error, kind === 'build'
      ? 'AUDIT_CONTROLLED_BUILD_UNAVAILABLE' : 'AUDIT_CONTROLLED_MUTATION_UNAVAILABLE')
  });
}

function validateMutationEvidence(value, identity) {
  if (!value || value.format !== 'SAAGAR_AUDIT_MUTATION_EVIDENCE' || value.schemaVersion !== 1 ||
      value.sourceSha !== identity.targetSha || value.productFingerprintSha256 !== identity.productFingerprintSha256 ||
      value.toolingSha !== identity.auditToolingSha || !Array.isArray(value.mutations)) {
    fail('AUDIT_CONTROLLED_MUTATION_RECEIPT_INVALID');
  }
  return value;
}

function validateBuildEvidence(value, identity) {
  const records = value && [value.first && value.first.build, value.second && value.second.build];
  if (!value || value.format !== 'SAAGAR_AUDIT_APK_COMPARISON' || value.schemaVersion !== 2 ||
      value.identityBound !== true || !records || records.some(record => !record ||
        record.sourceSha !== identity.targetSha ||
        record.productFingerprintSha256 !== identity.productFingerprintSha256)) {
    fail('AUDIT_CONTROLLED_BUILD_RECEIPT_INVALID');
  }
  return value;
}

/* Receipt v2 (closure addendum §4): each disposable build worktree installs its
   own dependency tree. The previous ambient node_modules junction is removed
   entirely — two builds sharing one installed tree cannot demonstrate
   independently prepared inputs, which is precisely what A9 must prove. There is
   deliberately no fallback: a failed install fails the probe, leaving A9
   unmeasured rather than silently reusing the audited root's dependencies. */
function installDependencies(worktree) {
  const target = path.join(worktree, 'node_modules');
  if (fs.lstatSync(target, { throwIfNoEntry: false })) fail('AUDIT_CONTROLLED_NODE_MODULES_NOT_FRESH');
  const invocation = process.platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd ci --ignore-scripts --no-audit --no-fund'] }
    : { command: 'npm', args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'] };
  const started = Date.now();
  const result = command(invocation.command, invocation.args, {
    cwd: worktree, timeout: INSTALL_TIMEOUT_MS,
    env: { ...process.env, TZ: 'UTC', FORCE_COLOR: '0', NO_COLOR: '1', npm_config_audit: 'false',
      npm_config_fund: 'false', npm_config_update_notifier: 'false' }
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.error || result.signal || result.status !== 0) fail('AUDIT_CONTROLLED_DEPENDENCY_INSTALL_FAILED');
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('AUDIT_CONTROLLED_DEPENDENCY_INSTALL_INVALID');
  let closure;
  try { closure = dependencyClosureIdentity(target); }
  catch (_) { fail('AUDIT_CONTROLLED_DEPENDENCY_CLOSURE_UNAVAILABLE'); }
  return Object.freeze({
    command: 'npm ci --ignore-scripts --no-audit --no-fund',
    sourceNodeModulesAbsent: true,
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    outputSha256: sha256(output),
    closure
  });
}

/* A fresh Gradle home per build, outside every worktree, so neither build can
   inherit the other's cached distribution or daemon state. */
function createGradleHome(tempRoot, index) {
  const home = path.join(tempRoot, `gradle-home-${index}`);
  if (fs.lstatSync(home, { throwIfNoEntry: false })) fail('AUDIT_CONTROLLED_GRADLE_HOME_NOT_FRESH');
  fs.mkdirSync(home, { recursive: false });
  return home;
}

function removeGradleHome(tempRoot, home) {
  if (!home) return;
  if (!inside(home, tempRoot) || samePath(home, tempRoot) || !samePath(path.dirname(home), tempRoot)) {
    fail('AUDIT_CONTROLLED_GRADLE_HOME_CLEANUP_REFUSED');
  }
  fs.rmSync(home, { recursive: true, force: true });
  if (fs.existsSync(home)) fail('AUDIT_CONTROLLED_GRADLE_HOME_CLEANUP_FAILED');
}

function removeWorktree(root, tempRoot, worktree, registered) {
  if (!registered) return;
  if (!inside(worktree, tempRoot) || samePath(worktree, tempRoot) ||
      !samePath(path.dirname(worktree), tempRoot)) fail('AUDIT_CONTROLLED_WORKTREE_CLEANUP_REFUSED');
  const removed = command('git', ['-C', root, 'worktree', 'remove', '--force', worktree], {
    cwd: root, timeout: 120_000
  });
  if (removed.error || removed.signal || removed.status !== 0 || fs.existsSync(worktree)) {
    fail('AUDIT_CONTROLLED_WORKTREE_CLEANUP_FAILED');
  }
}

function stopControlledGradle(worktree, gradleHome) {
  if (!gradleHome || !fs.existsSync(worktree)) return;
  const launcher = path.join(worktree, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!fs.statSync(launcher, { throwIfNoEntry: false })?.isFile()) return;
  const invocation = process.platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', '.\\gradlew.bat --stop'] }
    : { command: launcher, args: ['--stop'] };
  const result = command(invocation.command, invocation.args, {
    cwd: path.dirname(launcher), timeout: 120_000,
    env: { ...process.env, GRADLE_USER_HOME: gradleHome }
  });
  if (result.error || result.signal || result.status !== 0) fail('AUDIT_CONTROLLED_GRADLE_STOP_FAILED');
}

function bootstrapAndroid(worktree, targetSha) {
  if (fs.lstatSync(path.join(worktree, 'android'), { throwIfNoEntry: false })) {
    fail('AUDIT_CONTROLLED_ANDROID_NOT_FRESH');
  }
  const invocation = npmInvocation('add:android');
  const started = Date.now();
  const result = command(invocation.command, invocation.args, {
    cwd: worktree, timeout: BOOTSTRAP_TIMEOUT_MS,
    env: { ...process.env, TZ: 'UTC', FORCE_COLOR: '0', NO_COLOR: '1' }
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.error || result.signal || result.status !== 0) fail('AUDIT_CONTROLLED_ANDROID_BOOTSTRAP_FAILED');
  const android = path.join(worktree, 'android');
  const stat = fs.lstatSync(android, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink() || git(worktree, ['rev-parse', 'HEAD']) !== targetSha ||
      git(worktree, ['status', '--porcelain=v1', '--untracked-files=all'])) {
    fail('AUDIT_CONTROLLED_ANDROID_BOOTSTRAP_INVALID');
  }
  return Object.freeze({ command: invocation.display, sourceAndroidAbsent: true, exitCode: result.status,
    elapsedMs: Date.now() - started, outputSha256: sha256(output) });
}

/* Capacitor's fresh Android template allows only ten seconds for the Gradle
   distribution download. That is shorter than a normal first fetch on the
   controlled Windows runner and turns a healthy toolchain into an unmeasured
   A9 gate. The generated Android tree is ignored and disposable, so normalize
   only this one bounded property before its recipe hash is captured. */
export function prepareControlledGradleWrapper(worktree) {
  const file = path.join(worktree, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const source = fs.readFileSync(file, 'utf8');
  const matches = [...source.matchAll(/^networkTimeout=(\d+)[^\S\r\n]*$/gm)];
  if (matches.length !== 1) fail('AUDIT_CONTROLLED_GRADLE_TIMEOUT_INVALID');
  const value = Number(matches[0][1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > GRADLE_WRAPPER_NETWORK_TIMEOUT_MS) {
    fail('AUDIT_CONTROLLED_GRADLE_TIMEOUT_INVALID');
  }
  const normalized = source.replace(/^networkTimeout=\d+[^\S\r\n]*$/m,
    `networkTimeout=${GRADLE_WRAPPER_NETWORK_TIMEOUT_MS}`);
  fs.writeFileSync(file, normalized, 'utf8');
}

function captureOneBuild(identity, tempRoot, index) {
  const worktree = path.join(tempRoot, `build-${index}`);
  const output = path.join(tempRoot, `capture-${index}`);
  let registered = false;
  let gradleHome = null;
  try {
    const added = command('git', ['-C', identity.root, 'worktree', 'add', '--detach', worktree, identity.targetSha], {
      cwd: identity.root, timeout: 120_000
    });
    if (added.error || added.signal || added.status !== 0) fail('AUDIT_CONTROLLED_BUILD_WORKTREE_FAILED');
    registered = true;
    if (git(worktree, ['rev-parse', 'HEAD']) !== identity.targetSha || git(worktree, ['branch', '--show-current']) !== '') {
      fail('AUDIT_CONTROLLED_BUILD_WORKTREE_IDENTITY_INVALID');
    }
    const install = installDependencies(worktree);
    gradleHome = createGradleHome(tempRoot, index);
    const bootstrap = bootstrapAndroid(worktree, identity.targetSha);
    prepareControlledGradleWrapper(worktree);
    captureBuild({ root: worktree, output, bootstrapReceipt: bootstrap,
      installReceipt: install, gradleUserHome: gradleHome });
    const apk = path.join(output, 'app-debug.apk');
    const buildJson = path.join(output, 'BUILD.json');
    if (!fs.statSync(apk, { throwIfNoEntry: false })?.isFile() ||
        !fs.statSync(buildJson, { throwIfNoEntry: false })?.isFile()) {
      fail('AUDIT_CONTROLLED_BUILD_OUTPUT_MISSING');
    }
    return Object.freeze({ apk, build: readJson(buildJson) });
  } finally {
    let cleanupFailure = null;
    const attempt = action => {
      try { action(); } catch (error) { if (!cleanupFailure) cleanupFailure = error; }
    };
    attempt(() => stopControlledGradle(worktree, gradleHome));
    /* Always unregister the worktree even if Gradle-home cleanup encounters a
       Windows file lock. Leaving a registered disposable worktree would mask
       the original probe result and poison every later controlled run. */
    attempt(() => removeWorktree(identity.root, tempRoot, worktree, registered));
    attempt(() => removeGradleHome(tempRoot, gradleHome));
    if (cleanupFailure) throw cleanupFailure;
  }
}

function disposableRoot(prefix) {
  const parent = canonical(os.tmpdir());
  const created = fs.mkdtempSync(path.join(parent, prefix));
  const resolved = canonical(created);
  const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!samePath(created, resolved) || !stat?.isDirectory() || stat.isSymbolicLink() ||
      !samePath(path.dirname(resolved), parent)) fail('AUDIT_CONTROLLED_TEMP_ROOT_INVALID');
  return Object.freeze({ parent, root: resolved });
}

function removeDisposableRoot(location) {
  if (!location || !inside(location.root, location.parent) || samePath(location.root, location.parent) ||
      !samePath(path.dirname(location.root), location.parent) ||
      !path.basename(location.root).startsWith('saagar-audit-controlled-')) {
    fail('AUDIT_CONTROLLED_TEMP_CLEANUP_REFUSED');
  }
  const stat = fs.lstatSync(location.root, { throwIfNoEntry: false });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('AUDIT_CONTROLLED_TEMP_CLEANUP_REFUSED');
  const unsafeWorktree = fs.readdirSync(location.root, { withFileTypes: true }).some(entry =>
    entry.isDirectory() && /^build-[12]$/.test(entry.name) &&
    fs.lstatSync(path.join(location.root, entry.name, '.git'), { throwIfNoEntry: false }));
  if (unsafeWorktree) fail('AUDIT_CONTROLLED_TEMP_HAS_REGISTERED_WORKTREE');

  fs.rmSync(location.root, { recursive: true, force: false });
}

function defaultMutationProbe(identity) {
  const location = disposableRoot('saagar-audit-controlled-mutation-');
  try {
    const output = path.join(location.root, 'A5-MUTATIONS.json');
    const helper = path.join(identity.root, 'scripts', 'audit', 'capture-mutations.mjs');
    const result = command(process.execPath, [helper, '--root', identity.root, '--output', output,
      '--audit-tooling-sha', identity.auditToolingSha], {
      cwd: identity.root, timeout: MUTATION_TIMEOUT_MS,
      env: { ...process.env, TZ: 'UTC', FORCE_COLOR: '0', NO_COLOR: '1', NODE_OPTIONS: '' }
    });
    if (result.error || result.signal || result.status !== 0) {
      const error = new Error('AUDIT_CONTROLLED_MUTATION_HELPER_FAILED');
      const emitted = String(result.stderr || '').match(/SAAGAR_MUTATION_CAPTURE_FAILED:([A-Z0-9_]+)/);
      if (emitted) error.code = emitted[1];
      throw error;
    }
    return readJson(output);
  } finally {
    removeDisposableRoot(location);
  }
}

function defaultBuildProbe(identity) {
  const location = disposableRoot('saagar-audit-controlled-build-');
  try {
    const first = captureOneBuild(identity, location.root, 1);
    const second = captureOneBuild(identity, location.root, 2);
    return compareApks(first.apk, second.apk, first.build, second.build);
  } finally {
    removeDisposableRoot(location);
  }
}

export function runControlledProbes(options, hooks = {}) {
  const trustedExecution = arguments.length === 1;
  const inspect = hooks.inspectTarget || targetIdentity;
  const identity = Object.freeze(inspect(options));
  const provenance = Object.freeze(Object.create(null));
  if (trustedExecution) provenanceRegistry.set(provenance, identity);
  const mutationCapture = hooks.captureMutation || defaultMutationProbe;
  const buildCapture = hooks.captureBuildPair || defaultBuildProbe;

  let mutationEvidence = null;
  let mutationArtifact;
  let mutationStatus;
  try {
    mutationEvidence = markEvidence(validateMutationEvidence(mutationCapture(identity), identity),
      provenance, 'mutation');
    mutationArtifact = mutationEvidence;
    mutationStatus = Object.freeze({ status: 'measured', reason: '' });
  } catch (error) {
    mutationArtifact = failureArtifact('mutation', identity, error);
    mutationStatus = Object.freeze({ status: 'unmeasured', reason: mutationArtifact.reason });
  }

  let buildEvidence = null;
  let buildArtifact;
  let buildStatus;
  try {
    buildEvidence = markEvidence(validateBuildEvidence(buildCapture(identity), identity),
      provenance, 'build');
    buildArtifact = buildEvidence;
    buildStatus = Object.freeze({ status: 'measured', reason: '' });
  } catch (error) {
    buildArtifact = failureArtifact('build', identity, error);
    buildStatus = Object.freeze({ status: 'unmeasured', reason: buildArtifact.reason });
  }

  return Object.freeze({ provenance, mutationEvidence, buildEvidence,
    artifacts: Object.freeze({ mutation: mutationArtifact, build: buildArtifact }),
    status: Object.freeze({ mutation: mutationStatus, build: buildStatus }) });
}
