import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifyPublicAssets } from './lib/release-asset-checks.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const identity = require('../www/build-identity.js');

const PERMISSION_TAG = /<uses-permission(?:-sdk-23|-sdk-m)?(?=[\s/>])[^>]*>/g;
const ATTRIBUTE = /([A-Za-z_][\w.-]*(?::[\w.-]+)?)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const INTERNET = 'android.permission.INTERNET';

// Fail closed: the offline app must not declare INTERNET. The manifest must carry exactly one <uses-permission ... tools:node="remove"> guard for it
// (a library manifest merged later could otherwise bring the permission back), and no other mention of the permission may exist.
// A missing guard fails too. This reads the SOURCE manifest; the final APK is checked separately with aapt2 (scripts/verify-release-apk.mjs).
// Limit: a manifest that aliases the android: or tools: namespace to another prefix is refused by the exact-count rules below, not understood.
export function assertNoInternetPermission(manifestXml) {
  const xml = String(manifestXml).replace(/<!--[\s\S]*?-->/g, '');
  assert.match(xml, /\bxmlns:tools\s*=\s*["']http:\/\/schemas\.android\.com\/tools["']/, 'manifest must declare xmlns:tools for the INTERNET removal guard');
  // A <uses-permission> inside <application> is ignored by Android, so a guard there protects nothing.
  const outsideApplication = xml.replace(/<application\b[^>]*\/>/g, '').replace(/<application\b[\s\S]*?<\/application\s*>/g, '');
  let guards = 0;
  for (const tag of xml.match(PERMISSION_TAG) || []) {
    const attrs = [...tag.matchAll(ATTRIBUTE)].map((m) => [m[1], m[2] ?? m[3]]);
    const name = (attrs.find(([key]) => key === 'android:name') || attrs.find(([key]) => key.endsWith(':name')) || [])[1];
    assert.ok(!/&/.test(name || ''), 'entity-encoded permission names are refused');
    if (name !== INTERNET) continue;
    const node = (attrs.find(([key]) => key === 'tools:node') || attrs.find(([key]) => key.endsWith(':node')) || [])[1];
    assert.equal(node, 'remove', 'android.permission.INTERNET must not be declared (offline app): only a tools:node="remove" guard may name it');
    guards += 1;
  }
  assert.equal(guards, 1, 'exactly one android.permission.INTERNET tools:node="remove" guard is required');
  assert.equal((outsideApplication.match(PERMISSION_TAG) || []).filter((tag) => tag.includes(INTERNET)).length, 1, 'the android.permission.INTERNET guard must sit directly under <manifest>, not inside <application>');
  assert.equal((xml.match(/android\.permission\.INTERNET/g) || []).length, 1, 'android.permission.INTERNET may appear only in the single removal guard');
}

export function verifyGeneratedAndroidRelease(base = root) {
  const gradlePath = path.join(base, 'android', 'app', 'build.gradle');
  const variablesPath = path.join(base, 'android', 'variables.gradle');
  const manifestPath = path.join(base, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  const activityPath = path.join(base, 'android', 'app', 'src', 'main', 'java', 'com', 'saagartraders', 'bcc', 'MainActivity.java');
  for (const file of [gradlePath, variablesPath, manifestPath, activityPath]) {
    assert.ok(fs.existsSync(file), `generated Android release input missing: ${path.relative(base, file)}`);
  }

  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const variables = fs.readFileSync(variablesPath, 'utf8');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const activity = fs.readFileSync(activityPath, 'utf8');
  assert.equal((gradle.match(/SAAGAR_RELEASE_SIGNING_BEGIN/g) || []).length, 1, 'release signing begin marker must occur exactly once');
  assert.equal((gradle.match(/SAAGAR_RELEASE_SIGNING_END/g) || []).length, 1, 'release signing end marker must occur exactly once');
  for (const variable of ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD', 'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD']) {
    assert.ok(gradle.includes(`System.getenv("${variable}")`), `generated signing block missing ${variable}`);
  }
  assert.match(gradle, /wantsRelease\s*&&\s*\(!ks\s*\|\|\s*!ksp\s*\|\|\s*!ka\s*\|\|\s*!kap\)/);
  assert.match(gradle, /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?debuggable\s+false[\s\S]*?signingConfig\s+signingConfigs\.release/);
  assert.doesNotMatch(gradle, /debug\s*\{[^{}]*signingConfig\s+signingConfigs\.release/);
  assert.match(gradle, new RegExp(`applicationId\\s+["']${identity.packageId.replace(/\./g, '\\.')}["']`));
  assert.match(gradle, new RegExp(`versionCode\\s+${identity.versionCode}\\b`));
  assert.match(gradle, new RegExp(`versionName\\s+["']${identity.versionName.replace(/\./g, '\\.')}["']`));
  assert.match(variables, new RegExp(`minSdkVersion\\s*=\\s*${identity.minSdk}\\b`));
  assert.match(manifest, /android:allowBackup\s*=\s*"false"/);
  assertNoInternetPermission(manifest);
  for (const plugin of ['SaagarKeystorePlugin', 'SaagarSecurityPlugin', 'SaagarOffDevicePlugin', 'SaagarNativeStorePlugin', 'SaagarEtpStorePlugin']) {
    assert.match(activity, new RegExp(`registerPlugin\\(${plugin}\\.class\\)`), `MainActivity missing ${plugin}`);
  }
  return Object.freeze({ ok: true, packageId: identity.packageId, versionName: identity.versionName, versionCode: identity.versionCode, minSdk: identity.minSdk });
}

// Checks the Capacitor-synced web assets before they are transformed or packaged. The trust ceremony flag is set only by the owner-run wrapper.
export function verifyGeneratedPublicAssets(base = root, env = process.env) {
  const publicDir = path.join(base, 'android', 'app', 'src', 'main', 'assets', 'public');
  assert.ok(fs.existsSync(publicDir), `generated public assets missing: ${path.relative(base, publicDir)}`);
  return verifyPublicAssets(publicDir, { ceremonyDone: env.SAAGAR_TRUST_CEREMONY_DONE === '1' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyGeneratedAndroidRelease();
  process.stdout.write('[release] generated Android configuration verified\n');
  verifyGeneratedPublicAssets();
  process.stdout.write('[release] generated public assets verified (demo seed off, no demo wiring, bridge trust as declared, no key material)\n');
}
