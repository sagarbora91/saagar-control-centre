import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const identity = require('../www/build-identity.js');

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
  for (const plugin of ['SaagarKeystorePlugin', 'SaagarSecurityPlugin', 'SaagarOffDevicePlugin', 'SaagarNativeStorePlugin', 'SaagarEtpStorePlugin']) {
    assert.match(activity, new RegExp(`registerPlugin\\(${plugin}\\.class\\)`), `MainActivity missing ${plugin}`);
  }
  return Object.freeze({ ok: true, packageId: identity.packageId, versionName: identity.versionName, versionCode: identity.versionCode, minSdk: identity.minSdk });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyGeneratedAndroidRelease();
  process.stdout.write('[release] generated Android configuration verified\n');
}
