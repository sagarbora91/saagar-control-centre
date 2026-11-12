import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_PERMISSIONS, EXPECTED_TARGET_SDK, assertNoSecretFields, evaluateIdentity, evaluatePermissions, evaluateSignature, main, parseAllowBackup,
  parseApksigner, parseBadging, parsePermissions, verifyApk, writeRecord
} from '../scripts/verify-release-apk.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = require('../www/build-identity.js');
const policy = JSON.parse(fs.readFileSync(path.join(repo, 'config', 'production-signing-policy.json'), 'utf8'));

// Canned tool output has the shape seen on the Wave 6 debug APK (apksigner 35.0.0, aapt2 35.0.0). Digests are derived at run time from fixed words.
const digestOf = (word) => crypto.createHash('sha256').update(word).digest('hex');
const DEBUG_SHA = digestOf('canned-debug-signer').toUpperCase();
const lower = (value) => value.toLowerCase();

function apksignerText({ sha256 = DEBUG_SHA, dn = 'C=US, O=Android, CN=Android Debug', signers = 1, v2 = true, v3 = false } = {}) {
  const lines = ['Verifies', 'Verified using v1 scheme (JAR signing): false', `Verified using v2 scheme (APK Signature Scheme v2): ${v2}`, `Verified using v3 scheme (APK Signature Scheme v3): ${v3}`,
    'Verified using v3.1 scheme (APK Signature Scheme v3.1): false', `Number of signers: ${signers}`];
  for (let n = 1; n <= signers; n += 1) {
    lines.push(`Signer #${n} certificate DN: ${dn}`, `Signer #${n} certificate SHA-256 digest: ${lower(sha256)}`,
      `Signer #${n} certificate SHA-1 digest: ${lower(sha256).slice(0, 40)}`, `Signer #${n} certificate MD5 digest: ${lower(sha256).slice(0, 32)}`, `Signer #${n} key algorithm: RSA`);
  }
  return lines.join('\n') + '\n';
}
function badgingText({ pkg, versionCode = String(identity.versionCode), versionName, minSdk = identity.minSdk, targetSdk = EXPECTED_TARGET_SDK, debuggable = false }) {
  return [`package: name='${pkg}' versionCode='${versionCode}' versionName='${versionName}' platformBuildVersionName='14' platformBuildVersionCode='34' compileSdkVersion='34' compileSdkVersionCodename='14'`,
    `minSdkVersion:'${minSdk}'`, `targetSdkVersion:'${targetSdk}'`, "uses-permission: name='android.permission.WAKE_LOCK'", "application-label:'Saagar Control Centre'",
    ...(debuggable ? ['application-debuggable'] : []), "launchable-activity: name='x'"].join('\n') + '\n';
}
function permissionsText(pkg, names) {
  return [`package: ${pkg}`, ...names.map((name) => `uses-permission: name='${name}'`), `permission: ${pkg}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`].join('\n') + '\n';
}
const xmlTree = (value) => `N: android=http://schemas.android.com/apk/res/android (line=2)\n  E: manifest (line=2)\n      E: application (line=21)\n        A: http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=${value}\n`;

const DEBUG_PKG = `${identity.packageId}.debug`;
const DEBUG_VERSION = `${identity.versionName}-debug`;
const BASE_PERMISSIONS = [...ALLOWED_PERMISSIONS];

function makeRunners({ signer = apksignerText(), pkg = DEBUG_PKG, versionName = DEBUG_VERSION, badging = {}, permissions, backup = 'false', signerStatus = 0 } = {}) {
  return {
    apksigner: () => ({ status: signerStatus, stdout: signer, stderr: '' }),
    aapt2: (args) => {
      if (args[1] === 'badging') return { status: 0, stdout: badgingText({ pkg, versionName, ...badging }), stderr: '' };
      if (args[1] === 'permissions') return { status: 0, stdout: permissionsText(pkg, permissions || [...BASE_PERMISSIONS, `${pkg}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`]), stderr: '' };
      if (args[1] === 'xmltree') return { status: 0, stdout: xmlTree(backup), stderr: '' };
      throw new Error(`unexpected aapt2 call: ${args.join(' ')}`);
    }
  };
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-verify-apk-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
let counter = 0;
const fresh = (name) => path.join(scratch, `${name}-${++counter}`);

function extractedTree() {
  const dir = fresh('extracted');
  fs.mkdirSync(path.join(dir, 'assets', 'public'), { recursive: true });
  for (const name of ['index.html', 'etp-bridge-trust.js']) fs.copyFileSync(path.join(repo, 'www', name), path.join(dir, 'assets', 'public', name));
  return dir;
}
function fakeApk(name = 'app.apk') {
  const dir = fresh('apk');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'not really an apk');
  return file;
}
const run = (options) => verifyApk({ extractedDir: extractedTree(), apk: fakeApk(), outDir: fresh('out'), ...options });
const failedIds = (result) => result.checks.filter((entry) => !entry.ok).map((entry) => entry.id);

test('parsers read the shape of the real apksigner, aapt2 badging, permissions and xmltree output', () => {
  const signer = parseApksigner(apksignerText());
  assert.deepEqual([signer.signerCount, signer.declaredSignerCount, signer.schemeV2, signer.schemeV3], [1, 1, true, false]);
  assert.equal(signer.sha256, DEBUG_SHA);
  assert.equal(signer.dn, 'C=US, O=Android, CN=Android Debug');
  assert.equal(parseApksigner(apksignerText({ signers: 2 })).signerCount, 2);
  const badging = parseBadging(badgingText({ pkg: DEBUG_PKG, versionName: DEBUG_VERSION, debuggable: true }));
  assert.deepEqual(badging, { packageName: DEBUG_PKG, versionCode: String(identity.versionCode), versionName: DEBUG_VERSION, minSdk: identity.minSdk, targetSdk: EXPECTED_TARGET_SDK, debuggable: true });
  assert.equal(parseBadging(badgingText({ pkg: 'a.b', versionName: '1' })).debuggable, false);
  assert.deepEqual(parsePermissions(permissionsText('a.b', ['b.two', 'a.one', 'a.one'])), ['a.one', 'b.two']);
  assert.deepEqual(parsePermissions("uses-permission-sdk-23: name='x.y'\npermission: z.w\n"), ['x.y']);
  assert.deepEqual(parseAllowBackup(xmlTree('false')), { known: true, value: false });
  assert.deepEqual(parseAllowBackup(xmlTree('(type 0x12)0x0')), { known: true, value: false });
  assert.deepEqual(parseAllowBackup(xmlTree('true')), { known: true, value: true });
  assert.deepEqual(parseAllowBackup(xmlTree('(type 0x12)0xffffffff')), { known: true, value: true });
  assert.deepEqual(parseAllowBackup('E: application\n'), { known: false, value: null });
});

test('signature: a release must carry the policy signer and never the debug certificate; a dry run only the debug one', () => {
  const approved = policy.signerCertificateSha256;
  const good = parseApksigner(apksignerText({ sha256: approved, dn: 'CN=Saagar Traders' }));
  assert.deepEqual(evaluateSignature(good, { mode: 'release', policy }), { policyMatched: true, debugCertificate: false });
  assert.throws(() => evaluateSignature(parseApksigner(apksignerText()), { mode: 'release', policy }), /debug certificate/);
  assert.throws(() => evaluateSignature(parseApksigner(apksignerText({ sha256: DEBUG_SHA, dn: 'CN=Someone Else' })), { mode: 'release', policy }), /does not match/);
  assert.throws(() => evaluateSignature(parseApksigner(apksignerText({ sha256: approved, signers: 2 })), { mode: 'release', policy }), /exactly one signer/);
  assert.throws(() => evaluateSignature(parseApksigner(apksignerText({ sha256: approved, v2: false, v3: false })), { mode: 'release', policy }), /v2\/v3/);
  assert.throws(() => evaluateSignature(good, { mode: 'release', policy: { ...policy, signerCertificateSha256: 'not-a-digest' } }), /no valid certificate/);
  assert.deepEqual(evaluateSignature(parseApksigner(apksignerText()), { mode: 'dry-run', policy }), { policyMatched: false, debugCertificate: true });
  assert.throws(() => evaluateSignature(good, { mode: 'dry-run', policy }), /debug certificate only/);
});

test('identity: package, version, minSdk, targetSdk and debuggable are all enforced; the target SDK is pinned at 34', () => {
  assert.equal(EXPECTED_TARGET_SDK, 34);
  const releaseBadging = (change = {}) => parseBadging(badgingText({ pkg: identity.packageId, versionName: identity.versionName, ...change }));
  assert.doesNotThrow(() => evaluateIdentity(releaseBadging(), { mode: 'release', identity }));
  assert.throws(() => evaluateIdentity(releaseBadging({ pkg: DEBUG_PKG }), { mode: 'release', identity }), /package id/);
  assert.throws(() => evaluateIdentity(releaseBadging({ versionCode: '999' }), { mode: 'release', identity }), /versionCode/);
  assert.throws(() => evaluateIdentity(releaseBadging({ versionName: DEBUG_VERSION }), { mode: 'release', identity }), /versionName/);
  assert.throws(() => evaluateIdentity(releaseBadging({ minSdk: 23 }), { mode: 'release', identity }), /minSdk/);
  assert.throws(() => evaluateIdentity(releaseBadging({ targetSdk: 35 }), { mode: 'release', identity }), /targetSdkVersion must be 34/);
  assert.throws(() => evaluateIdentity(releaseBadging({ debuggable: true }), { mode: 'release', identity }), /debuggable/);
  const debugBadging = (change = {}) => parseBadging(badgingText({ pkg: DEBUG_PKG, versionName: DEBUG_VERSION, ...change }));
  assert.doesNotThrow(() => evaluateIdentity(debugBadging({ debuggable: true }), { mode: 'dry-run', identity }));
  assert.throws(() => evaluateIdentity(releaseBadging(), { mode: 'dry-run', identity }), /package id/);
});

test('permissions: INTERNET and anything outside the allowlist fail; the package dynamic-receiver permission is allowed', () => {
  const dynamic = `${DEBUG_PKG}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
  assert.deepEqual(evaluatePermissions([...BASE_PERMISSIONS, dynamic].sort(), DEBUG_PKG), [...BASE_PERMISSIONS, dynamic].sort());
  assert.doesNotThrow(() => evaluatePermissions([], DEBUG_PKG));
  assert.throws(() => evaluatePermissions([...BASE_PERMISSIONS, 'android.permission.INTERNET'], DEBUG_PKG), /INTERNET/);
  assert.throws(() => evaluatePermissions([...BASE_PERMISSIONS, 'android.permission.CAMERA'], DEBUG_PKG), /CAMERA/);
  assert.throws(() => evaluatePermissions([...BASE_PERMISSIONS, 'android.permission.ACCESS_NETWORK_STATE'], DEBUG_PKG), /outside the allowlist/);
  assert.throws(() => evaluatePermissions(['com.other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'], DEBUG_PKG), /outside the allowlist/);
});

test('dry run: debug APK text with the .debug id passes every check and writes dry-run-record.json only', () => {
  const result = run({ mode: 'dry-run', runners: makeRunners() });
  assert.deepEqual(failedIds(result), []);
  assert.equal(result.ok, true);
  assert.equal(path.basename(result.recordFile), 'dry-run-record.json');
  assert.equal(result.record.mode, 'dry-run');
  assert.equal(result.record.result, 'pass');
  assert.equal(result.record.signer.policyMatched, false);
  assert.equal(result.record.internetPermission, false);
  assert.equal(result.record.demoSeedEnabled, false);
  assert.deepEqual(result.record.trustCeremony, { declaredComplete: false, keyIds: [] });
  assert.equal(fs.existsSync(path.join(path.dirname(result.recordFile), 'release-record.json')), false);
  const written = fs.readFileSync(result.recordFile, 'utf8');
  assert.equal(written.includes('\r'), false);
  assert.equal(written.charCodeAt(0) === 0xFEFF, false);
  assert.equal(JSON.parse(written).format, 'saagar-release-record');
});

test('dry run: every individual failure is reported and the overall result is a failure', () => {
  const permissionsWithInternet = [...BASE_PERMISSIONS, 'android.permission.INTERNET'];
  assert.deepEqual(failedIds(run({ mode: 'dry-run', runners: makeRunners({ permissions: permissionsWithInternet }) })), ['permissions']);
  assert.deepEqual(failedIds(run({ mode: 'dry-run', runners: makeRunners({ backup: 'true' }) })), ['manifestFlags']);
  assert.deepEqual(failedIds(run({ mode: 'dry-run', runners: makeRunners({ badging: { targetSdk: 35 } }) })), ['identity']);
  assert.deepEqual(failedIds(run({ mode: 'dry-run', runners: makeRunners({ signerStatus: 1, signer: 'DOES NOT VERIFY\n' }) })), ['signature']);
  // seed flag flipped in the extracted tree (the dummy-data build)
  const tampered = extractedTree();
  const indexFile = path.join(tampered, 'assets', 'public', 'index.html');
  fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('var DEMO_SEED_ENABLED = false;', () => 'var DEMO_SEED_ENABLED = true;'));
  const flipped = verifyApk({ mode: 'dry-run', apk: fakeApk(), outDir: fresh('out'), extractedDir: tampered, runners: makeRunners() });
  assert.deepEqual(failedIds(flipped), ['assets']);
  assert.equal(flipped.record.result, 'fail');
  assert.equal(flipped.ok, false);
});

test('release mode: the policy signer, a matching receipt and register pass; every mismatch fails', () => {
  const approvedSigner = apksignerText({ sha256: policy.signerCertificateSha256, dn: 'CN=Release Signer' });
  const releaseRunners = (extra = {}) => makeRunners({ signer: approvedSigner, pkg: identity.packageId, versionName: identity.versionName, permissions: BASE_PERMISSIONS.concat([`${identity.packageId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`]), ...extra });
  const commit = crypto.createHash('sha1').update('canned commit').digest('hex');
  const apk = fakeApk('SaagarCC-production-test.apk');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex').toUpperCase();
  const evidence = (change = {}) => {
    const dir = fresh('evidence');
    fs.mkdirSync(dir, { recursive: true });
    const receipt = path.join(dir, 'production-build-receipt.json');
    const register = path.join(dir, 'x.release.json');
    fs.writeFileSync(receipt, JSON.stringify({ sourceCommit: commit, sourceTreeClean: true, artifactFile: path.basename(apk), artifactSha256: sha, ...change.receipt }));
    fs.writeFileSync(register, JSON.stringify({ sha256: sha, signatureVerified: true, signerCertificateSha256: policy.signerCertificateSha256, ...change.register }));
    return { receiptPath: receipt, registerPath: register };
  };
  const go = (options = {}) => verifyApk({ mode: 'release', apk, extractedDir: extractedTree(), outDir: fresh('out'), commit, alias: 'upload-alias', keystoreFileName: 'upload.jks', runners: releaseRunners(), ...evidence(), ...options });
  const ok = go();
  assert.deepEqual(failedIds(ok), []);
  assert.equal(path.basename(ok.recordFile), 'release-record.json');
  assert.equal(ok.record.mode, 'release');
  assert.equal(ok.record.signer.policyMatched, true);
  assert.deepEqual(ok.record.keystore, { aliasUsed: 'upload-alias', fileName: 'upload.jks' });
  assert.equal(ok.record.sourceCommit, commit);
  assert.match(ok.record.receiptSha256, /^[0-9A-F]{64}$/);
  assert.deepEqual(failedIds(go({ runners: releaseRunners({ signer: apksignerText() }) })), ['signature']);
  assert.deepEqual(failedIds(go({ runners: releaseRunners({ badging: { debuggable: true } }) })), ['identity']);
  assert.deepEqual(failedIds(go({ commit: crypto.createHash('sha1').update('other').digest('hex') })), ['receipt']);
  assert.deepEqual(failedIds(go({ ...evidence({ receipt: { sourceTreeClean: false } }) })), ['receipt']);
  assert.deepEqual(failedIds(go({ ...evidence({ receipt: { artifactSha256: 'A'.repeat(64) } }) })), ['receipt']);
  assert.deepEqual(failedIds(go({ ...evidence({ register: { sha256: 'B'.repeat(64) } }) })), ['receipt']);
  assert.deepEqual(failedIds(go({ ...evidence({ register: { signatureVerified: false } }) })), ['receipt']);
  assert.deepEqual(failedIds(go({ ...evidence({ register: { signerCertificateSha256: DEBUG_SHA } }) })), ['receipt']);
  assert.deepEqual(failedIds(go({ commit: 'abc' })), ['receipt']);
  assert.deepEqual(failedIds(go({ receiptPath: null, registerPath: null })), ['receipt']);
});

test('trust declaration: a build with trusted keys fails unless the ceremony is declared, and records only key ids', () => {
  const withKey = extractedTree();
  const trustFile = path.join(withKey, 'assets', 'public', 'etp-bridge-trust.js');
  const keyId = '0123456789abcdef';
  const point = '04' + 'ab'.repeat(64);
  fs.writeFileSync(trustFile, fs.readFileSync(trustFile, 'utf8').replace('var KEYS = Object.freeze([]);', () => `var KEYS = Object.freeze([Object.freeze({ keyId: "${keyId}", publicKeyHex: "${point}" })]);`));
  const common = { mode: 'dry-run', apk: fakeApk(), extractedDir: withKey, runners: makeRunners() };
  assert.deepEqual(failedIds(verifyApk({ ...common, outDir: fresh('out') })), ['assets']);
  const declared = verifyApk({ ...common, outDir: fresh('out'), trustCeremonyDone: true });
  assert.deepEqual(failedIds(declared), []);
  assert.deepEqual(declared.record.trustCeremony, { declaredComplete: true, keyIds: [keyId] });
  assert.equal(fs.readFileSync(declared.recordFile, 'utf8').includes(point), false, 'the public point is not copied into the record');
  // declaring the ceremony with an empty list is also a failure
  assert.deepEqual(failedIds(run({ mode: 'dry-run', runners: makeRunners(), trustCeremonyDone: true })), ['assets']);
});

test('record writer: no overwrite, no password-like field, and the keystore folder never appears', () => {
  const dir = fresh('records');
  const record = { format: 'saagar-release-record', keystore: { aliasUsed: 'a', fileName: 'k.jks' } };
  const file = writeRecord(dir, 'release', record);
  assert.equal(path.basename(file), 'release-record.json');
  assert.throws(() => writeRecord(dir, 'release', record), /EEXIST/);
  assert.equal(path.basename(writeRecord(dir, 'dry-run', record)), 'dry-run-record.json');
  for (const bad of [{ keyPassword: 'x' }, { nested: { storePass: 'x' } }, { list: [{ clientSecret: 1 }] }, { PWD: 1 }]) {
    assert.throws(() => assertNoSecretFields(bad), /must not carry a field/, JSON.stringify(bad));
    assert.throws(() => writeRecord(fresh('records'), 'release', { ok: true, ...bad }), /must not carry a field/);
  }
  const keystoreDir = path.join(os.tmpdir(), 'private-keys-folder');
  const result = run({ mode: 'dry-run', runners: makeRunners(), alias: 'upload-alias', keystoreFileName: 'upload.jks' });
  assert.equal(fs.readFileSync(result.recordFile, 'utf8').includes(keystoreDir), false);
  assert.equal(/pass|secret|pwd/i.test(Object.keys(JSON.parse(fs.readFileSync(result.recordFile, 'utf8'))).join(' ')), false);
});

test('command line: bad arguments are refused with a usage error and no record is written', () => {
  const lines = [];
  const write = (line) => lines.push(line);
  assert.throws(() => main(['--mode'], process.env, write), /needs a value/);
  assert.throws(() => main(['stray'], process.env, write), /unexpected argument/);
  assert.throws(() => main(['--mode', 'sideways', '--apk', fakeApk(), '--out', fresh('out')], process.env, write), /--mode must be release or dry-run/);
  assert.throws(() => main(['--mode', 'dry-run', '--apk', path.join(scratch, 'missing.apk'), '--out', fresh('out')], process.env, write), /APK not found/);
});

test('the verifier never reads a keystore or a password and never calls the signing path', () => {
  const source = fs.readFileSync(path.join(repo, 'scripts', 'verify-release-apk.mjs'), 'utf8');
  assert.doesNotMatch(source, /SAAGAR_KEYSTORE|SAAGAR_KEY_|keytool|jarsigner|\.jks|storepass|keypass/i);
  assert.doesNotMatch(source, /sign['"]?\s*,\s*['"]--ks|'sign'/);
  assert.doesNotMatch(source, /shell\s*:\s*true/);
});
