import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyGeneratedAndroidRelease } from '../scripts/verify-generated-android-release.mjs';

function fixture(change = value => value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-release-config-'));
  const app = path.join(root, 'android', 'app');
  const java = path.join(app, 'src', 'main', 'java', 'com', 'saagartraders', 'bcc');
  fs.mkdirSync(java, { recursive: true });
  const gradle = change(`android {
    // SAAGAR_RELEASE_SIGNING_BEGIN
    signingConfigs { release {
      def ks = System.getenv("SAAGAR_KEYSTORE_FILE")
      def ksp = System.getenv("SAAGAR_KEYSTORE_PASSWORD")
      def ka = System.getenv("SAAGAR_KEY_ALIAS")
      def kap = System.getenv("SAAGAR_KEY_PASSWORD")
      def wantsRelease = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }
      if (wantsRelease && (!ks || !ksp || !ka || !kap)) { throw new GradleException("blocked") }
    } }
    // SAAGAR_RELEASE_SIGNING_END
    defaultConfig { applicationId "com.saagartraders.bcc" versionCode 600 versionName "6" }
    buildTypes {
      debug { applicationIdSuffix ".debug" versionNameSuffix "-debug" }
      release { debuggable false signingConfig signingConfigs.release }
    }
  }`);
  fs.writeFileSync(path.join(app, 'build.gradle'), gradle);
  fs.writeFileSync(path.join(root, 'android', 'variables.gradle'), 'ext { minSdkVersion = 23 }');
  fs.writeFileSync(path.join(app, 'src', 'main', 'AndroidManifest.xml'), '<application android:allowBackup="false"/>');
  fs.writeFileSync(path.join(java, 'MainActivity.java'), ['SaagarKeystorePlugin', 'SaagarSecurityPlugin', 'SaagarOffDevicePlugin', 'SaagarNativeStorePlugin', 'SaagarEtpStorePlugin'].map(name => `registerPlugin(${name}.class);`).join('\n'));
  return root;
}

test('generated release verifier accepts only the canonical hardened shape', t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(verifyGeneratedAndroidRelease(root).ok, true);
});

test('generated release verifier rejects altered signing inputs', t => {
  const root = fixture(value => value.replace('SAAGAR_KEY_PASSWORD', 'OTHER_KEY_PASSWORD'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => verifyGeneratedAndroidRelease(root), /SAAGAR_KEY_PASSWORD/);
});

test('generated release verifier rejects duplicate authority and debuggable release', t => {
  const duplicate = fixture(value => value.replace('// SAAGAR_RELEASE_SIGNING_END', '// SAAGAR_RELEASE_SIGNING_END\n// SAAGAR_RELEASE_SIGNING_BEGIN'));
  const debug = fixture(value => value.replace('debuggable false', 'debuggable true'));
  t.after(() => fs.rmSync(duplicate, { recursive: true, force: true }));
  t.after(() => fs.rmSync(debug, { recursive: true, force: true }));
  assert.throws(() => verifyGeneratedAndroidRelease(duplicate), /begin marker must occur exactly once/);
  assert.throws(() => verifyGeneratedAndroidRelease(debug));
});
