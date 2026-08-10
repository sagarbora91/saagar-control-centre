#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CRITICAL_TEST_DOMAINS } from './config.mjs';
import { buildContext, compareText, isProductPath, revisionFingerprint, sha256 } from './lib.mjs';
import { verifyToolingIdentity } from './runner-support.mjs';
import { safeJson } from './schema.mjs';

const MAX_COMMAND_BYTES = 8 * 1024 * 1024;
const MAX_GIT_BYTES = 64 * 1024 * 1024;
const TEST_TIMEOUT_MS = 120_000;

const MUTATIONS = Object.freeze({
  money: Object.freeze({
    mutationId: 'money-reconciliation-delta-direction-v1',
    file: 'www/etp-reconciliation-policy.js',
    fileSha256: '4991e13b2485db11e6cb50feda5db9fbc6e8c6f49ed54c9ae41c070e039b5e4d',
    before: 'var deltaUnits = leftUnits - rightUnits;',
    after: 'var deltaUnits = rightUnits - leftUnits;',
    expectedOccurrences: 1,
    testFile: 'tests/etp-reconciliation-policy.test.mjs',
    testCommand: 'node --test --test-reporter=tap tests/etp-reconciliation-policy.test.mjs',
    expectedTest: 'INV/SR/BC signs are applied and a mismatch remains visible'
  }),
  storage: Object.freeze({
    mutationId: 'storage-native-batch-bound-v1',
    file: 'www/storage-core.js',
    fileSha256: '4e8accc0689dcf71be26c08ab494fd135d21bc742ae6cd4607d08509575994fb',
    before: 'var NATIVE_BATCH_OPS = 32;',
    after: 'var NATIVE_BATCH_OPS = 64;',
    expectedOccurrences: 1,
    testFile: 'tests/native-incremental-storage-runtime.test.mjs',
    testCommand: 'node --test --test-reporter=tap tests/native-incremental-storage-runtime.test.mjs',
    expectedTest: 'runtime flush writes only changed records in bounded native batches'
  }),
  auth: Object.freeze({
    mutationId: 'auth-one-retry-limit-v1',
    file: 'www/reauth-policy.js',
    fileSha256: 'd9bad761a5e2d0e73b7e6f97816cb537f24c3db1ea3ddb96cb72f20effb5e1fd',
    before: 'var MAX_ATTEMPTS = 2;',
    after: 'var MAX_ATTEMPTS = 3;',
    expectedOccurrences: 1,
    testFile: 'tests/d1-reauth.test.mjs',
    testCommand: 'node --test --test-reporter=tap tests/d1-reauth.test.mjs',
    expectedTest: 'D1 reauthentication limits a single action to one retry'
  }),
  backupRestore: Object.freeze({
    mutationId: 'backup-photo-manifest-count-v1',
    file: 'www/portable-backup.js',
    fileSha256: 'ef07123df77584ab81a3a7ec95f39fede72c83b019db688aceb32ab0a4ecc75c',
    before: "if (name === 'localStorage' || name === 'photos') {",
    after: "if (name === 'localStorage') {",
    expectedOccurrences: 1,
    testFile: 'tests/portable-backup.test.mjs',
    testCommand: 'node --test --test-reporter=tap tests/portable-backup.test.mjs',
    expectedTest: 'portable backup round-trips without leaking payload text'
  }),
  export: Object.freeze({
    mutationId: 'export-default-deny-policy-v1',
    file: 'www/export-control.js',
    fileSha256: '5f6871561d86833dafef3425f23f5f6830bfc183717ae195a559fb9771d22886',
    before: 'if (!policy.enabled) {',
    after: 'if (policy.enabled) {',
    expectedOccurrences: 1,
    testFile: 'tests/eng04-security.test.mjs',
    testCommand: 'node --test --test-reporter=tap tests/eng04-security.test.mjs',
    expectedTest: 'SEC-08 defaults to disabled and records the denied attempt without prompting'
  }),
  etpPublication: Object.freeze({
    mutationId: 'etp-critical-reconciliation-publication-gate-v1',
    file: 'www/etp-reconciliation-policy.js',
    fileSha256: '4991e13b2485db11e6cb50feda5db9fbc6e8c6f49ed54c9ae41c070e039b5e4d',
    before: "(recon.severity === 'CRITICAL' && recon.status !== 'PASS')",
    after: "(recon.severity === 'CRITICAL' && recon.status === 'PASS')",
    expectedOccurrences: 1,
    testFile: 'tests/etp-reconciliation-policy.test.mjs',
    testCommand: 'node --test --test-reporter=tap tests/etp-reconciliation-policy.test.mjs',
    expectedTest: 'publication refuses missing facts, restored state, incomplete scope and critical failures'
  })
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!['--root', '--output', '--audit-tooling-sha'].includes(token)) fail('ARGUMENT_INVALID');
    if (values[token] || !argv[i + 1] || argv[i + 1].startsWith('--')) fail('ARGUMENT_INVALID');
    values[token] = argv[++i];
  }
  if (!values['--root'] || !values['--output'] || !values['--audit-tooling-sha']) fail('ARGUMENT_REQUIRED');
  if (!/^[a-f0-9]{40}$/.test(values['--audit-tooling-sha'])) fail('TOOLING_SHA_INVALID');
  return { root: path.resolve(values['--root']), output: path.resolve(values['--output']),
    auditToolingSha: values['--audit-tooling-sha'] };
}

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout || 30_000,
    maxBuffer: MAX_COMMAND_BYTES,
    env: options.env || process.env
  });
}

function git(root, args) {
  const result = command('git', ['-C', root, ...args], { cwd: root });
  if (result.error || result.signal || result.status !== 0) fail('GIT_OPERATION_FAILED');
  return String(result.stdout || '').trim();
}

function canonical(value) {
  const resolved = path.resolve(value);
  try { return fs.realpathSync.native(resolved); } catch (_) { return resolved; }
}

function resolveFuturePath(value) {
  const missing = [];
  let ancestor = path.resolve(value);
  let stat = fs.lstatSync(ancestor, { throwIfNoEntry: false });
  while (!stat) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail('OUTPUT_PARENT_INVALID');
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
    stat = fs.lstatSync(ancestor, { throwIfNoEntry: false });
  }
  const resolvedAncestor = canonical(ancestor);
  const resolvedStat = fs.statSync(resolvedAncestor, { throwIfNoEntry: false });
  if (missing.length && !resolvedStat?.isDirectory()) fail('OUTPUT_PARENT_INVALID');
  return path.resolve(resolvedAncestor, ...missing);
}

function samePath(left, right) {
  const a = canonical(left), b = canonical(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function inside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function worktreeEntries(root) {
  const blocks = git(root, ['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split(/\r?\n/);
    const worktree = lines.find(line => line.startsWith('worktree '));
    const head = lines.find(line => line.startsWith('HEAD '));
    return {
      path: worktree ? worktree.slice('worktree '.length) : '',
      head: head ? head.slice('HEAD '.length) : '',
      detached: lines.includes('detached')
    };
  });
}

function revisionFiles(root, revision) {
  const result = spawnSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', '-z', revision], {
    cwd: root,
    encoding: null,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: MAX_GIT_BYTES
  });
  if (result.error || result.signal || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail('GIT_OPERATION_FAILED');
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean)
    .map(value => value.replaceAll('\\', '/')).sort(compareText);
}

function productFingerprint(root, revision) {
  return revisionFingerprint(root, revisionFiles(root, revision).filter(isProductPath), revision).treeSha256;
}

function verifyCaptureTooling(root, identity, auditToolingSha) {
  const executingCapture = fileURLToPath(import.meta.url);
  const targetCapture = path.join(root, 'scripts', 'audit', 'capture-mutations.mjs');
  if (!samePath(executingCapture, targetCapture)) fail('MUTATION_CAPTURE_TARGET_MISMATCH');

  const context = buildContext(root);
  if (context.head !== identity.head || context.status) fail('ROOT_WORKTREE_IDENTITY_INVALID');

  const tooling = verifyToolingIdentity(
    root,
    context,
    auditToolingSha,
    path.join(root, 'scripts', 'audit', 'run.mjs')
  );
  if (!tooling || tooling.sha !== auditToolingSha) fail('AUDIT_TOOLING_IDENTITY_INVALID');
  return tooling;
}

function validateRoot(root, output) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) fail('ROOT_INVALID');
  const dotGit = path.join(root, '.git');
  if (!fs.statSync(dotGit, { throwIfNoEntry: false })?.isFile()) fail('ROOT_NOT_LINKED_WORKTREE');
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) fail('ROOT_NOT_CLEAN');
  const symbolic = command('git', ['-C', root, 'symbolic-ref', '-q', 'HEAD'], { cwd: root });
  if (symbolic.status === 0 || symbolic.error || symbolic.signal) fail('ROOT_NOT_DETACHED');
  const head = git(root, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(head)) fail('ROOT_HEAD_INVALID');
  const entries = worktreeEntries(root);
  const current = entries.find(entry => entry.path && samePath(entry.path, root));
  if (!current || !current.detached || current.head !== head) fail('ROOT_WORKTREE_IDENTITY_INVALID');
  const gitDir = canonical(path.resolve(root, git(root, ['rev-parse', '--git-dir'])));
  const commonDir = canonical(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])));
  if (samePath(gitDir, commonDir)) fail('ROOT_NOT_LINKED_WORKTREE');
  if (path.extname(output).toLowerCase() !== '.json') fail('OUTPUT_EXTENSION_INVALID');
  const resolvedOutput = resolveFuturePath(output);
  if (entries.some(entry => entry.path && inside(resolvedOutput, canonical(entry.path)))) fail('OUTPUT_NOT_EXTERNAL');
  if (fs.lstatSync(resolvedOutput, { throwIfNoEntry: false })) fail('OUTPUT_ALREADY_EXISTS');
  return { head, entries, output: resolvedOutput };
}

function occurrences(source, needle) {
  const indexes = [];
  let offset = 0;
  while (offset <= source.length) {
    const found = source.indexOf(needle, offset);
    if (found < 0) break;
    indexes.push(found);
    offset = found + needle.length;
  }
  return indexes;
}

function applyMutation(worktree, spec) {
  const file = path.resolve(worktree, spec.file);
  if (!inside(file, worktree) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return false;
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== spec.fileSha256) return false;
  const source = bytes.toString('utf8');
  const indexes = occurrences(source, spec.before);
  if (indexes.length !== spec.expectedOccurrences || source.includes(spec.after)) return false;
  const selected = indexes[spec.occurrenceIndex || 0];
  if (!Number.isSafeInteger(selected)) return false;
  const mutated = source.slice(0, selected) + spec.after + source.slice(selected + spec.before.length);
  if (sha256(mutated) === spec.fileSha256) return false;
  fs.writeFileSync(file, mutated, { encoding: 'utf8', flag: 'w' });
  const verified = fs.readFileSync(file, 'utf8');
  return verified === mutated && occurrences(verified, spec.after).length === 1;
}

function assertionEvidence(result, expectedTest) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const escaped = expectedTest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namedMatch = new RegExp(`^not ok \\d+ - ${escaped}\\r?$`, 'm').exec(output);
  let failureBlock = '';
  if (namedMatch) {
    const remainderStart = namedMatch.index + namedMatch[0].length;
    const remainder = output.slice(remainderStart);
    const nextOutcome = remainder.search(/\n(?:ok|not ok) \d+ - /);
    const blockEnd = nextOutcome < 0 ? output.length : remainderStart + nextOutcome;
    failureBlock = output.slice(namedMatch.index, blockEnd);
  }
  const namedFailureDetected = Boolean(namedMatch);
  const assertionFailureDetected = namedFailureDetected &&
    /\b(?:AssertionError|ERR_ASSERTION)\b/.test(failureBlock);
  const setupFailureDetected =
    /\b(?:SyntaxError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ENOENT|ERR_REQUIRE_ESM)\b|Cannot find module|Could not find/.test(output);
  return Object.freeze({
    assertionFailureDetected,
    matchedFailureBlockSha256: failureBlock ? sha256(failureBlock) : '',
    namedFailureDetected,
    setupFailureDetected
  });
}

function linkNodeModules(root, worktree) {
  const source = path.join(root, 'node_modules');
  const target = path.join(worktree, 'node_modules');
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory() ||
      fs.lstatSync(target, { throwIfNoEntry: false })) return null;
  fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  let linked = false;
  if (stat?.isSymbolicLink()) {
    try { linked = samePath(fs.realpathSync.native(target), fs.realpathSync.native(source)); } catch (_) {}
  }
  if (!linked) {
    if (stat?.isSymbolicLink()) {
      if (process.platform === 'win32') fs.rmdirSync(target);
      else fs.unlinkSync(target);
    }
    fail('NODE_MODULES_LINK_INVALID');
  }
  return { source, target };
}

function unlinkNodeModules(link) {
  if (!link) return;
  const stat = fs.lstatSync(link.target, { throwIfNoEntry: false });
  if (!stat) return;
  if (!stat.isSymbolicLink() || !samePath(fs.realpathSync.native(link.target), fs.realpathSync.native(link.source))) {
    fail('NODE_MODULES_LINK_CLEANUP_REFUSED');
  }
  if (process.platform === 'win32') fs.rmdirSync(link.target);
  else fs.unlinkSync(link.target);
}

function removeDisposable(root, tempRoot, worktree, link, registered) {
  unlinkNodeModules(link);
  if (registered) {
    const removed = command('git', ['-C', root, 'worktree', 'remove', '--force', worktree], { cwd: root });
    if (removed.error || removed.signal || removed.status !== 0) fail('MUTATION_WORKTREE_CLEANUP_FAILED');
  }
  if (fs.existsSync(worktree)) {
    if (!inside(worktree, tempRoot) || samePath(worktree, tempRoot) || path.dirname(worktree) !== tempRoot) fail('MUTATION_CLEANUP_SCOPE_INVALID');
    if (fs.lstatSync(worktree).isSymbolicLink()) fail('MUTATION_CLEANUP_SCOPE_INVALID');
    fs.rmSync(worktree, { recursive: true, force: false });
  }
}

function captureOne(root, head, tempRoot, invariantId, spec, baselineProductSha256) {
  const worktree = path.join(tempRoot, invariantId);
  let link = null;
  let registered = false;
  try {
    const added = command('git', ['-C', root, 'worktree', 'add', '--detach', worktree, head], { cwd: root, timeout: 60_000 });
    if (added.error || added.signal || added.status !== 0) return null;
    registered = true;
    if (git(worktree, ['rev-parse', 'HEAD']) !== head || git(worktree, ['branch', '--show-current']) !== '') return null;
    link = linkNodeModules(root, worktree);
    if (!link || !applyMutation(worktree, spec)) return null;
    const result = command(process.execPath, ['--test', '--test-reporter=tap', spec.testFile], {
      cwd: worktree,
      timeout: TEST_TIMEOUT_MS,
      env: { ...process.env, TZ: 'UTC', FORCE_COLOR: '0', NO_COLOR: '1', NODE_OPTIONS: '' }
    });
    if (result.error || result.signal || !Number.isInteger(result.status) ||
        result.status < 0 || result.status > 255) return null;
    const combined = Buffer.from(`${result.stdout || ''}\n${result.stderr || ''}`, 'utf8');
    const assertion = assertionEvidence(result, spec.expectedTest);
    if (assertion.setupFailureDetected) return null;
    const detected = result.status !== 0 && assertion.namedFailureDetected &&
      assertion.assertionFailureDetected && !assertion.setupFailureDetected;
    if (productFingerprint(root, head) !== baselineProductSha256 || git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) {
      fail('AUDITED_ROOT_CHANGED');
    }
    return Object.freeze({
      invariantId,
      disposableWorktree: true,
      detected,
      beforeProductSha256: baselineProductSha256,
      afterProductSha256: baselineProductSha256,
      mutationId: spec.mutationId,
      productionFile: spec.file,
      testCommand: spec.testCommand,
      expectedAssertion: spec.expectedTest,
      exitCode: result.status,
      outputSha256: sha256(combined),
      assertionEvidence: assertion
    });
  } finally {
    removeDisposable(root, tempRoot, worktree, link, registered);
  }
}

function writeExternalJson(output, value) {
  const parent = path.dirname(output);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = path.join(parent, `.${path.basename(output)}.${process.pid}.tmp`);
  if (fs.lstatSync(temporary, { throwIfNoEntry: false }) ||
      fs.lstatSync(output, { throwIfNoEntry: false })) fail('OUTPUT_ALREADY_EXISTS');
  try {
    fs.writeFileSync(temporary, safeJson(value), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, output);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function main() {
  const { root, output, auditToolingSha } = parseArgs(process.argv.slice(2));
  const identity = validateRoot(root, output);
  verifyCaptureTooling(root, identity, auditToolingSha);
  const invariantIds = Object.keys(CRITICAL_TEST_DOMAINS).sort();
  const mutationIds = new Set(invariantIds.map(id => MUTATIONS[id] && MUTATIONS[id].mutationId));
  const registryValid = invariantIds.length === Object.keys(MUTATIONS).length &&
    mutationIds.size === invariantIds.length &&
    invariantIds.every(id => {
      const spec = MUTATIONS[id];
      return spec && spec.testCommand === `node --test --test-reporter=tap ${spec.testFile}` &&
        typeof spec.file === 'string' && typeof spec.expectedTest === 'string';
    });
  if (!registryValid) fail('MUTATION_REGISTRY_INCOMPLETE');
  const baselineProductSha256 = productFingerprint(root, identity.head);
  const tempParent = canonical(os.tmpdir());
  if (identity.entries.some(entry => entry.path && inside(tempParent, canonical(entry.path)))) fail('TEMP_ROOT_NOT_EXTERNAL');
  const createdTempRoot = fs.mkdtempSync(path.join(tempParent, 'saagar-audit-mutations-'));
  const tempRoot = canonical(createdTempRoot);
  const results = [];
  try {
    const tempStat = fs.lstatSync(tempRoot, { throwIfNoEntry: false });
    if (!samePath(createdTempRoot, tempRoot) || !tempStat?.isDirectory() ||
        tempStat.isSymbolicLink() || !samePath(path.dirname(tempRoot), tempParent) ||
        identity.entries.some(entry => entry.path && inside(tempRoot, canonical(entry.path)))) {
      fail('TEMP_ROOT_NOT_EXTERNAL');
    }
    for (const invariantId of invariantIds) {
      const result = captureOne(root, identity.head, tempRoot, invariantId, MUTATIONS[invariantId], baselineProductSha256);
      if (result) results.push(result);
    }
    if (productFingerprint(root, identity.head) !== baselineProductSha256 || git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) {
      fail('AUDITED_ROOT_CHANGED');
    }
    if (fs.readdirSync(tempRoot).length) fail('MUTATION_TEMP_NOT_EMPTY');
    fs.rmdirSync(tempRoot);
    writeExternalJson(identity.output, {
      format: 'SAAGAR_AUDIT_MUTATION_EVIDENCE', schemaVersion: 1, sourceSha: identity.head,
      productFingerprintSha256: baselineProductSha256, toolingSha: auditToolingSha,
      mutations: results.sort((a, b) => a.invariantId.localeCompare(b.invariantId))
    });
  } finally {
    if (fs.existsSync(tempRoot) && fs.readdirSync(tempRoot).length === 0) fs.rmdirSync(tempRoot);
  }
}

try {
  main();
} catch (error) {
  const code = error && /^[A-Z0-9_]+$/.test(String(error.code || error.message || ''))
    ? String(error.code || error.message) : 'UNEXPECTED_FAILURE';
  process.stderr.write(`SAAGAR_MUTATION_CAPTURE_FAILED:${code}\n`);
  process.exitCode = 1;
}
