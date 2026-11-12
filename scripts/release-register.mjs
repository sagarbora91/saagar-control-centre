import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { findBuildTools, runApksigner } from './lib/apk-tools.mjs';

const require = createRequire(import.meta.url);
const BUILD_IDENTITY = require('../www/build-identity.js');
const SIGNING_POLICY = require('../config/production-signing-policy.json');

const apkArg = process.argv[2];
if (!apkArg) {
  console.error('Usage: node scripts/release-register.mjs <release.apk> [register.json]');
  process.exit(2);
}

const apk = path.resolve(apkArg);
const output = path.resolve(process.argv[3] || apk.replace(/\.apk$/i, '') + '.release.json');
if (!fs.existsSync(apk)) throw new Error(`APK not found: ${apk}`);

// apksigner runs without a shell: with one, an APK path that contains a space is split into several arguments and verification fails.
const tools = findBuildTools();
const verify = runApksigner(tools, ['verify', '--verbose', '--print-certs', apk], process.env);
const signatureText = `${verify.stdout || ''}\n${verify.stderr || ''}`;
if (verify.status !== 0) throw new Error(`APK signature verification failed:\n${signatureText}`);
if (/Android Debug/i.test(signatureText)) throw new Error('Release registration blocked: APK uses an Android debug certificate.');
if (!/Verified using v2 scheme[^:]*:\s*true/i.test(signatureText) &&
    !/Verified using v3 scheme[^:]*:\s*true/i.test(signatureText)) {
  throw new Error('Release registration blocked: APK has no verified v2/v3 signature.');
}

const bytes = fs.readFileSync(apk);
const cert = signatureText.match(/Signer #1 certificate SHA-256 digest:\s*([A-Fa-f0-9:]+)/i);
const signerCount = (signatureText.match(/Signer #[0-9]+ certificate SHA-256 digest:/gi) || []).length;
if (signerCount !== 1 || !cert) throw new Error('Release registration blocked: APK must have exactly one identifiable signer.');
const signerCertificateSha256 = cert[1].replace(/:/g, '').toUpperCase();
if (SIGNING_POLICY.packageId !== BUILD_IDENTITY.packageId ||
    signerCertificateSha256 !== SIGNING_POLICY.signerCertificateSha256) {
  throw new Error('Release registration blocked: APK signer does not match the approved production signing policy.');
}
const register = {
  format: 'saagar-android-release-register',
  version: 1,
  createdAt: new Date().toISOString(),
  packageId: BUILD_IDENTITY.packageId,
  appVersion: BUILD_IDENTITY.appVersion,
  apkBuild: BUILD_IDENTITY.versionName,
  versionCode: BUILD_IDENTITY.versionCode,
  fileName: path.basename(apk),
  bytes: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
  signatureVerified: true,
  signerCertificateSha256,
  signerPolicyVersion: SIGNING_POLICY.schemaVersion,
  signerPolicyMatched: true,
  debugCertificateRejected: true
};

fs.writeFileSync(output, `${JSON.stringify(register, null, 2)}\n`, { flag: 'wx' });
console.log(`Release register written: ${output}`);
console.log(`SHA-256: ${register.sha256}`);
