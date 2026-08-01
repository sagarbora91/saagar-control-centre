import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BUILD_IDENTITY = require('../www/build-identity.js');

const apkArg = process.argv[2];
if (!apkArg) {
  console.error('Usage: node scripts/release-register.mjs <release.apk> [register.json]');
  process.exit(2);
}

const apk = path.resolve(apkArg);
const output = path.resolve(process.argv[3] || apk.replace(/\.apk$/i, '') + '.release.json');
if (!fs.existsSync(apk)) throw new Error(`APK not found: ${apk}`);

function findApkSigner() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return null;
  const root = path.join(sdk, 'build-tools');
  if (!fs.existsSync(root)) return null;
  const versions = fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const file = path.join(root, version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
    if (fs.existsSync(file)) return file;
  }
  return null;
}

const apksigner = findApkSigner();
if (!apksigner) throw new Error('Android apksigner was not found under ANDROID_HOME/ANDROID_SDK_ROOT.');
const verify = spawnSync(apksigner, ['verify', '--verbose', '--print-certs', apk], {
  encoding: 'utf8',
  shell: process.platform === 'win32'
});
const signatureText = `${verify.stdout || ''}\n${verify.stderr || ''}`;
if (verify.status !== 0) throw new Error(`APK signature verification failed:\n${signatureText}`);
if (/Android Debug/i.test(signatureText)) throw new Error('Release registration blocked: APK uses an Android debug certificate.');
if (!/Verified using v2 scheme[^:]*:\s*true/i.test(signatureText) &&
    !/Verified using v3 scheme[^:]*:\s*true/i.test(signatureText)) {
  throw new Error('Release registration blocked: APK has no verified v2/v3 signature.');
}

const bytes = fs.readFileSync(apk);
const cert = signatureText.match(/Signer #1 certificate SHA-256 digest:\s*([A-Fa-f0-9:]+)/i);
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
  signerCertificateSha256: cert ? cert[1].replace(/:/g, '').toUpperCase() : '',
  debugCertificateRejected: true
};

fs.writeFileSync(output, `${JSON.stringify(register, null, 2)}\n`, { flag: 'wx' });
console.log(`Release register written: ${output}`);
console.log(`SHA-256: ${register.sha256}`);
