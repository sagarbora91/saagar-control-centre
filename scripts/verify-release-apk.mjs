// Post-build verifier and release-record writer for a finished APK.
//   node scripts/verify-release-apk.mjs --mode release|dry-run --apk <file> --out <dir> [--commit <sha40>] [--receipt <file>] [--register <file>]
//        [--trust-ceremony-done] [--alias <name>] [--keystore-file-name <name>] [--build-tools <version>] [--extracted <dir>]
// It never signs and never reads a key, a keystore or a password. Exit code 0 only when every check passes.
// release mode: the signer must be the one approved in config/production-signing-policy.json and must not be the Android debug certificate.
// dry-run mode: the APK must be a debug build (debug certificate, .debug package suffix); the record is named dry-run-record.json so it can never pass for a release record.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extractZip, findBuildTools, runAapt2, runApksigner } from './lib/apk-tools.mjs';
import { verifyPublicAssets } from './lib/release-asset-checks.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

// Target SDK is an owner decision (2026-11-11). Changing it must fail loudly here until this constant and its test are edited on purpose.
export const EXPECTED_TARGET_SDK = 34;
// Permissions an offline build may carry. A new permission is an owner decision: it fails until this list and its test are edited deliberately.
export const ALLOWED_PERMISSIONS = Object.freeze(['android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.WAKE_LOCK', 'android.permission.POST_NOTIFICATIONS']);
const DYNAMIC_RECEIVER_SUFFIX = '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION';

const normalizeDigest = (value) => String(value || '').replace(/:/g, '').toUpperCase();

export function parseApksigner(text) {
  const digest = (algorithm) => {
    const match = text.match(new RegExp(`Signer #1 certificate ${algorithm} digest:\\s*([A-Fa-f0-9:]+)`, 'i'));
    return match ? normalizeDigest(match[1]) : null;
  };
  const dn = text.match(/Signer #1 certificate DN:\s*(.+)/i);
  const declared = text.match(/Number of signers:\s*(\d+)/i);
  return {
    signerCount: (text.match(/Signer #\d+ certificate SHA-256 digest:/gi) || []).length,
    declaredSignerCount: declared ? Number(declared[1]) : null,
    schemeV2: /Verified using v2 scheme[^:\r\n]*:\s*true/i.test(text),
    schemeV3: /Verified using v3 scheme[^:\r\n]*:\s*true/i.test(text),
    dn: dn ? dn[1].trim() : null,
    sha256: digest('SHA-256'),
    sha1: digest('SHA-1'),
    md5: digest('MD5')
  };
}

export function parseBadging(text) {
  const pkg = text.match(/^package:\s.*?\bname='([^']*)'/m);
  const code = text.match(/^package:\s.*?\bversionCode='([^']*)'/m);
  const name = text.match(/^package:\s.*?\bversionName='([^']*)'/m);
  const min = text.match(/^(?:minSdkVersion|sdkVersion):'(\d+)'/m);
  const target = text.match(/^targetSdkVersion:'(\d+)'/m);
  return {
    packageName: pkg ? pkg[1] : null,
    versionCode: code ? code[1] : null,
    versionName: name ? name[1] : null,
    minSdk: min ? Number(min[1]) : null,
    targetSdk: target ? Number(target[1]) : null,
    debuggable: /^application-debuggable\b/m.test(text)
  };
}

export function parsePermissions(text) {
  const names = [];
  for (const match of text.matchAll(/^uses-permission(?:-sdk-23)?:\s*name='([^']+)'/gm)) names.push(match[1]);
  return [...new Set(names)].sort();
}

// aapt2 prints a false boolean as `(type 0x12)0x0` or `false`, depending on the version. Anything else is "not verified".
export function parseAllowBackup(xmlTree) {
  const match = String(xmlTree).match(/^\s*A:\s*(?:\S*:)?allowBackup(?:\(0x[0-9a-fA-F]+\))?=\s*(?:\(type 0x12\))?\s*(\S+)/m);
  if (!match) return { known: false, value: null };
  const raw = match[1].toLowerCase();
  if (raw === 'false' || raw === '0x0') return { known: true, value: false };
  if (raw === 'true' || raw === '0xffffffff' || raw === '0x1') return { known: true, value: true };
  return { known: false, value: null };
}

export function evaluateSignature(parsed, { mode, policy }) {
  assert.equal(parsed.signerCount, 1, `the APK must have exactly one signer (found ${parsed.signerCount})`);
  if (parsed.declaredSignerCount !== null) assert.equal(parsed.declaredSignerCount, 1, 'apksigner reports more than one signer');
  assert.ok(parsed.sha256, 'signer certificate SHA-256 is missing');
  assert.ok(parsed.schemeV2 || parsed.schemeV3, 'the APK has no verified v2/v3 signature');
  const debugCertificate = /Android Debug/i.test(parsed.dn || '');
  if (mode === 'dry-run') {
    assert.ok(debugCertificate, 'a dry run must be signed with the Android debug certificate only (it found something else)');
    return { policyMatched: false, debugCertificate };
  }
  assert.ok(!debugCertificate, 'release blocked: the APK is signed with the Android debug certificate');
  assert.match(String(policy.signerCertificateSha256), /^[A-F0-9]{64}$/, 'the signing policy has no valid certificate SHA-256');
  assert.equal(parsed.sha256, policy.signerCertificateSha256, 'release blocked: the APK signer does not match config/production-signing-policy.json');
  return { policyMatched: true, debugCertificate };
}

export function evaluateIdentity(badging, { mode, identity }) {
  const debug = mode === 'dry-run';
  const expected = {
    packageName: debug ? `${identity.packageId}.debug` : identity.packageId,
    versionCode: String(identity.versionCode),
    versionName: debug ? `${identity.versionName}-debug` : identity.versionName
  };
  assert.equal(badging.packageName, expected.packageName, 'package id differs from the build identity');
  assert.equal(badging.versionCode, expected.versionCode, 'versionCode differs from the build identity');
  assert.equal(badging.versionName, expected.versionName, 'versionName differs from the build identity');
  assert.equal(badging.minSdk, identity.minSdk, 'minSdkVersion differs from the build identity');
  assert.equal(badging.targetSdk, EXPECTED_TARGET_SDK, `targetSdkVersion must be ${EXPECTED_TARGET_SDK} (owner decision); changing it needs a deliberate edit of this verifier`);
  if (!debug) assert.equal(badging.debuggable, false, 'release blocked: the APK is debuggable');
  return expected;
}

export function evaluatePermissions(names, packageName) {
  assert.ok(!names.includes('android.permission.INTERNET'), 'the APK declares android.permission.INTERNET (offline app)');
  const allowed = new Set([...ALLOWED_PERMISSIONS, `${packageName}${DYNAMIC_RECEIVER_SUFFIX}`]);
  const unexpected = names.filter((name) => !allowed.has(name));
  assert.deepEqual(unexpected, [], `permissions outside the allowlist: ${unexpected.join(', ')}`);
  return names;
}

export function assertNoSecretFields(value, trail = 'record') {
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoSecretFields(item, `${trail}[${index}]`)); return; }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      assert.ok(!/pass|secret|pwd/i.test(key), `a release record must not carry a field like "${key}" (${trail})`);
      assertNoSecretFields(inner, `${trail}.${key}`);
    }
  }
}

export function writeRecord(outDir, mode, record) {
  assertNoSecretFields(record);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, mode === 'dry-run' ? 'dry-run-record.json' : 'release-record.json');
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return file;
}

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();

function readJson(file, what) {
  assert.ok(file && fs.existsSync(file), `${what} not found`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function verifyApk(options) {
  const { mode, apk, outDir, commit = null, receiptPath = null, registerPath = null, trustCeremonyDone = false, alias = null, keystoreFileName = null,
    buildToolsVersion, extractedDir = null, env = process.env, runners = null, log = () => {} } = options;
  assert.ok(mode === 'release' || mode === 'dry-run', '--mode must be release or dry-run');
  assert.ok(apk && fs.existsSync(apk), `APK not found: ${apk}`);
  assert.ok(outDir, '--out is required');
  const identity = require('../www/build-identity.js');
  const policy = readJson(path.join(root, 'config', 'production-signing-policy.json'), 'signing policy');
  assert.equal(policy.packageId, identity.packageId, 'the signing policy and the build identity name different packages');
  // `runners` lets tests supply canned tool output; the CLI always uses the real apksigner and aapt2.
  const buildTools = runners ? { version: 'injected' } : findBuildTools(env, buildToolsVersion);
  const callApksigner = (args) => (runners ? runners.apksigner(args) : runApksigner(buildTools, args, env));
  const callAapt2 = (args) => (runners ? runners.aapt2(args) : runAapt2(buildTools, args));
  const checks = [];
  const facts = {};
  const check = (id, fn) => {
    try {
      const detail = fn();
      checks.push({ id, ok: true, detail: detail === undefined ? '' : detail });
      log(`PASS  ${id}${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
    } catch (error) {
      // assert messages append a generated diff after a blank line; keep the first part only
      const message = String(error && error.message || error).split(/\r?\n\r?\n/)[0];
      checks.push({ id, ok: false, detail: message });
      log(`FAIL  ${id}: ${message}`);
    }
  };
  const apkSha256 = sha256File(apk);
  const apkBytes = fs.statSync(apk).size;
  const raw = {};

  check('signature', () => {
    const run = callApksigner(['verify', '--verbose', '--print-certs', apk]);
    raw.apksigner = `${run.stdout}\n${run.stderr}`;
    assert.equal(run.status, 0, `apksigner verify failed:\n${raw.apksigner.trim()}`);
    const parsed = parseApksigner(raw.apksigner);
    facts.signer = parsed;
    const result = evaluateSignature(parsed, { mode, policy });
    facts.policyMatched = result.policyMatched;
    return `${parsed.dn}; SHA-256 ${parsed.sha256}; policyMatched=${result.policyMatched}`;
  });

  check('identity', () => {
    const run = callAapt2(['dump', 'badging', apk]);
    raw.badging = run.stdout;
    assert.equal(run.status, 0, `aapt2 dump badging failed: ${run.stderr.trim()}`);
    const badging = parseBadging(run.stdout);
    facts.badging = badging;
    evaluateIdentity(badging, { mode, identity });
    return `${badging.packageName} ${badging.versionName} (${badging.versionCode}) minSdk ${badging.minSdk} targetSdk ${badging.targetSdk}`;
  });

  check('permissions', () => {
    const run = callAapt2(['dump', 'permissions', apk]);
    raw.permissions = run.stdout;
    assert.equal(run.status, 0, `aapt2 dump permissions failed: ${run.stderr.trim()}`);
    const names = parsePermissions(run.stdout);
    facts.permissions = names;
    assert.ok(facts.badging && facts.badging.packageName, 'the package name is unknown (identity check failed)');
    evaluatePermissions(names, facts.badging.packageName);
    return names.join(', ');
  });

  check('manifestFlags', () => {
    const run = callAapt2(['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
    raw.xmltree = run.stdout;
    assert.equal(run.status, 0, `aapt2 dump xmltree failed: ${run.stderr.trim()}`);
    const backup = parseAllowBackup(run.stdout);
    assert.ok(backup.known, 'android:allowBackup could not be read from the manifest (not verified)');
    assert.equal(backup.value, false, 'android:allowBackup must be false');
    return 'allowBackup=false';
  });

  check('assets', () => {
    const dir = extractedDir || fs.mkdtempSync(path.join(os.tmpdir(), `scc-apk-${crypto.randomUUID()}-`));
    try {
      if (!extractedDir) extractZip(apk, dir, env);
      const result = verifyPublicAssets(path.join(dir, 'assets', 'public'), { ceremonyDone: trustCeremonyDone });
      facts.assets = result;
      return `${result.fileCount} files; demo seed off; no demo wiring; trust keys ${result.bridgeTrust.keyIds.length}; no key material`;
    } finally {
      if (!extractedDir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  let receiptSha256 = null;
  let registerSha256 = null;
  if (mode === 'release') {
    check('receipt', () => {
      assert.match(String(commit), /^[0-9a-fA-F]{40}$/, '--commit (40 hex characters) is required in release mode');
      const receipt = readJson(receiptPath, 'build receipt');
      const register = readJson(registerPath, 'release register');
      assert.equal(String(receipt.sourceCommit).toLowerCase(), commit.toLowerCase(), 'the receipt was written for a different commit');
      assert.equal(receipt.sourceTreeClean, true, 'the receipt does not state a clean source tree');
      assert.equal(receipt.artifactFile, path.basename(apk), 'the receipt names a different APK file');
      assert.equal(String(receipt.artifactSha256).toUpperCase(), apkSha256, 'the receipt APK hash differs from the APK');
      assert.equal(String(register.sha256).toUpperCase(), apkSha256, 'the release register APK hash differs from the APK');
      assert.equal(register.signatureVerified, true, 'the release register does not record a verified signature');
      assert.equal(String(register.signerCertificateSha256 || '').toUpperCase(), policy.signerCertificateSha256, 'the release register signer differs from the signing policy');
      receiptSha256 = sha256File(receiptPath);
      registerSha256 = sha256File(registerPath);
      return 'receipt and register agree with the APK';
    });
  }

  const ok = checks.every((entry) => entry.ok);
  const signer = facts.signer || {};
  const badging = facts.badging || {};
  const record = {
    format: 'saagar-release-record',
    version: 1,
    mode,
    result: ok ? 'pass' : 'fail',
    createdAt: new Date().toISOString(),
    sourceCommit: commit,
    packageId: badging.packageName || null,
    versionName: badging.versionName || null,
    versionCode: badging.versionCode || null,
    minSdk: badging.minSdk ?? null,
    targetSdk: badging.targetSdk ?? null,
    apk: { file: path.basename(apk), bytes: apkBytes, sha256: apkSha256 },
    signer: { dn: signer.dn || null, sha256: signer.sha256 || null, sha1: signer.sha1 || null, md5: signer.md5 || null, schemeV2: !!signer.schemeV2, schemeV3: !!signer.schemeV3, policyMatched: !!facts.policyMatched },
    keystore: { aliasUsed: alias, fileName: keystoreFileName },
    permissions: facts.permissions || [],
    internetPermission: (facts.permissions || []).includes('android.permission.INTERNET'),
    demoSeedEnabled: facts.assets ? facts.assets.demoSeedEnabled : null,
    demoWiringPresent: facts.assets ? facts.assets.demoWiringPresent : null,
    trustCeremony: { declaredComplete: !!trustCeremonyDone, keyIds: facts.assets ? facts.assets.bridgeTrust.keyIds : [] },
    checks,
    tools: { node: process.version, buildTools: buildTools.version, java: env.JAVA_HOME ? path.basename(env.JAVA_HOME) : null },
    receiptSha256,
    registerSha256
  };
  // The keystore folder is deliberately not recorded: it holds the Windows user name and the storage layout.
  const recordFile = writeRecord(outDir, mode, record);
  if (outDir && raw.apksigner) {
    // Raw tool output is evidence for the owner and for later audits; none of it contains a secret.
    for (const [name, text] of Object.entries(raw)) fs.writeFileSync(path.join(outDir, `${mode === 'dry-run' ? 'dry-run' : 'release'}-raw-${name}.txt`), text, { flag: 'wx' });
  }
  return { ok, record, recordFile, checks, facts };
}

function parseArgs(argv) {
  const out = {};
  const flags = new Set(['--trust-ceremony-done']);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    if (flags.has(key)) { out[key.slice(2)] = true; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} needs a value`);
    out[key.slice(2)] = value;
    index += 1;
  }
  return out;
}

export function main(argv = process.argv.slice(2), env = process.env, write = (line) => process.stdout.write(`${line}\n`)) {
  const args = parseArgs(argv);
  const result = verifyApk({
    mode: args.mode, apk: args.apk && path.resolve(args.apk), outDir: args.out && path.resolve(args.out), commit: args.commit || null,
    receiptPath: args.receipt ? path.resolve(args.receipt) : null, registerPath: args.register ? path.resolve(args.register) : null,
    trustCeremonyDone: args['trust-ceremony-done'] === true, alias: args.alias || null, keystoreFileName: args['keystore-file-name'] || null,
    buildToolsVersion: args['build-tools'], extractedDir: args.extracted ? path.resolve(args.extracted) : null, env, log: write
  });
  const signer = result.record.signer;
  write('');
  write(`Signer certificate (${result.record.mode}) - write these down:`);
  write(`  DN:      ${signer.dn}`);
  write(`  SHA-256: ${signer.sha256}`);
  write(`  SHA-1:   ${signer.sha1}`);
  write(`  MD5:     ${signer.md5}`);
  write(`APK SHA-256: ${result.record.apk.sha256}`);
  write(`Record: ${result.recordFile}`);
  write(result.ok ? `RESULT: PASS (${result.record.mode})` : `RESULT: FAIL (${result.record.mode}) - do not use this APK`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`verify-release-apk: ${error && error.message || error}\n`);
    process.exitCode = 2;
  }
}
