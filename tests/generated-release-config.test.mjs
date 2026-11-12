import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertNoInternetPermission, verifyGeneratedAndroidRelease } from '../scripts/verify-generated-android-release.mjs';

const GUARDED_MANIFEST = '<manifest xmlns:tools="http://schemas.android.com/tools"><application android:allowBackup="false"/><uses-permission android:name="android.permission.INTERNET" tools:node="remove" /></manifest>';

function fixture(change = value => value, manifest = GUARDED_MANIFEST) {
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
    defaultConfig { applicationId "com.saagartraders.bcc" versionCode 601 versionName "1.601" }
    buildTypes {
      debug { applicationIdSuffix ".debug" versionNameSuffix "-debug" }
      release { debuggable false signingConfig signingConfigs.release }
    }
  }`);
  fs.writeFileSync(path.join(app, 'build.gradle'), gradle);
  fs.writeFileSync(path.join(root, 'android', 'variables.gradle'), 'ext { minSdkVersion = 33 }');
  fs.writeFileSync(path.join(app, 'src', 'main', 'AndroidManifest.xml'), manifest);
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

test('apply-overrides removes android.permission.INTERNET idempotently (temp tree, offline app)', t => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  fs.mkdirSync(path.join(root, 'build-overrides', 'native'), { recursive: true });
  fs.mkdirSync(path.join(root, 'www'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'build-overrides', 'apply-overrides.js'), path.join(root, 'build-overrides', 'apply-overrides.js'));
  for (const name of fs.readdirSync(path.join(repo, 'build-overrides', 'native'))) {
    fs.copyFileSync(path.join(repo, 'build-overrides', 'native', name), path.join(root, 'build-overrides', 'native', name));
  }
  fs.copyFileSync(path.join(repo, 'www', 'build-identity.js'), path.join(root, 'www', 'build-identity.js'));
  const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  fs.writeFileSync(manifestPath, [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <application android:allowBackup="true" android:label="@string/app_name"></application>',
    '    <!-- Permissions -->',
    '',
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '</manifest>',
    ''
  ].join('\n'));
  const run = () => spawnSync(process.execPath, [path.join(root, 'build-overrides', 'apply-overrides.js')], { encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr + first.stdout);
  const once = fs.readFileSync(manifestPath, 'utf8');
  const tags = once.match(/<uses-permission\b[^>]*android\.permission\.INTERNET[^>]*>/g) || [];
  assert.equal(tags.length, 1, 'exactly one INTERNET tag (the removal guard) remains');
  assert.match(tags[0], /tools:node\s*=\s*"remove"/);
  assert.equal((once.match(/xmlns:tools\s*=/g) || []).length, 1);
  assert.match(once, /android:allowBackup\s*=\s*"false"/);
  assert.equal(verifyGeneratedAndroidRelease(root).ok, true);
  const second = run();
  assert.equal(second.status, 0, second.stderr + second.stdout);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), once, 'second run leaves the manifest byte-identical');
});

const TOOLS_NS = 'xmlns:tools="http://schemas.android.com/tools"';
const manifestWith = (...permissions) => `<manifest ${TOOLS_NS}><application android:allowBackup="false"/>${permissions.join('')}</manifest>`;
const GUARD = '<uses-permission android:name="android.permission.INTERNET" tools:node="remove" />';

test('INTERNET assertion: a live INTERNET declaration, with or without a guard, fails the generated release check', t => {
  const live = fixture(undefined, manifestWith('<uses-permission android:name="android.permission.INTERNET"/>'));
  const liveAndGuard = fixture(undefined, manifestWith('<uses-permission android:name="android.permission.INTERNET"/>', GUARD));
  t.after(() => fs.rmSync(live, { recursive: true, force: true }));
  t.after(() => fs.rmSync(liveAndGuard, { recursive: true, force: true }));
  assert.throws(() => verifyGeneratedAndroidRelease(live), /INTERNET/);
  assert.throws(() => verifyGeneratedAndroidRelease(liveAndGuard), /INTERNET/);
});

test('INTERNET assertion: the removal guard is required (fail closed when it is missing)', t => {
  const none = fixture(undefined, `<manifest ${TOOLS_NS}><application android:allowBackup="false"/></manifest>`);
  t.after(() => fs.rmSync(none, { recursive: true, force: true }));
  assert.throws(() => verifyGeneratedAndroidRelease(none), /exactly one/);
  assert.throws(() => assertNoInternetPermission(manifestWith('<uses-permission android:name="android.permission.WAKE_LOCK"/>')), /exactly one/);
});

test('INTERNET assertion: attribute order, quote style, line breaks and the sdk-23 variants cannot hide a declaration', () => {
  const variants = [
    "<uses-permission android:name='android.permission.INTERNET' />",
    '<uses-permission tools:node="merge" android:name="android.permission.INTERNET" />',
    '<uses-permission\n    android:name="android.permission.INTERNET"\n    android:maxSdkVersion="33"\n/>',
    '<uses-permission-sdk-23 android:name="android.permission.INTERNET"/>',
    '<uses-permission-sdk-m android:name="android.permission.INTERNET"/>',
    '<uses-permission android:name = "android.permission.INTERNET" tools:node = "replace"/>',
    '<uses-permission android:name="android.permission.INTERNET" tools:node="removeAll"/>',
    '<uses-permission android:name="android.permission.INTER&#78;ET" />'
  ];
  for (const variant of variants) {
    assert.throws(() => assertNoInternetPermission(manifestWith(variant)), undefined, variant);
    assert.throws(() => assertNoInternetPermission(manifestWith(variant, GUARD)), undefined, `with a guard too: ${variant}`);
  }
  assert.doesNotThrow(() => assertNoInternetPermission(manifestWith(GUARD)));
  assert.doesNotThrow(() => assertNoInternetPermission(manifestWith("<uses-permission android:name='android.permission.INTERNET' tools:node='remove'/>")));
  assert.doesNotThrow(() => assertNoInternetPermission(manifestWith('<uses-permission tools:node="remove"\n    android:name="android.permission.INTERNET"\n/>')));
});

test('INTERNET assertion: comments are neither a permission nor a guard', () => {
  assert.throws(() => assertNoInternetPermission(manifestWith(`<!-- ${GUARD} -->`)), /exactly one/);
  assert.doesNotThrow(() => assertNoInternetPermission(manifestWith('<!-- android.permission.INTERNET was removed -->', GUARD)));
  assert.throws(() => assertNoInternetPermission(manifestWith('<!-- note -->', '<uses-permission android:name="android.permission.INTERNET"/>')), /INTERNET/);
});

test('INTERNET assertion: needs xmlns:tools, refuses two guards and a guard inside <application>', () => {
  assert.throws(() => assertNoInternetPermission(`<manifest><application android:allowBackup="false"/>${GUARD}</manifest>`), /xmlns:tools/);
  assert.throws(() => assertNoInternetPermission(manifestWith(GUARD, GUARD)), /exactly one/);
  assert.throws(() => assertNoInternetPermission(`<manifest ${TOOLS_NS}><application android:allowBackup="false">${GUARD}</application></manifest>`), /directly under <manifest>/);
});
