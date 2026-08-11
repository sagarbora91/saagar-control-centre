import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const pipeline = fs.readFileSync(new URL('../scripts/prepare-api23-assets.mjs', import.meta.url), 'utf8');
const seeded = fs.readFileSync(new URL('../scripts/build-seeded-apk.mjs', import.meta.url), 'utf8');
const emulator = fs.readFileSync(new URL('../scripts/android-emulator.ps1', import.meta.url), 'utf8');

test('normal and release APK builds prepare API-23 assets before Gradle', () => {
  assert.match(pkg.scripts['build:apk'], /prepare:api23.*gradlew\.bat assembleDebug/);
  assert.match(pkg.scripts['build:release'], /prepare:api23.*gradlew\.bat assembleRelease/);
});

test('repository pins a reproducible API-23 emulator toolchain and npm workflow', () => {
  assert.match(pkg.scripts['android:configure'], /android-emulator\.ps1 configure/);
  assert.match(pkg.scripts['android:preflight'], /android-emulator\.ps1 preflight/);
  assert.match(pkg.scripts['emulator:api23:start'], /android-emulator\.ps1 start/);
  assert.match(emulator, /\.android-build/);
  assert.match(emulator, /system-images\\android-23\\default\\x86_64/);
  assert.match(emulator, /sdk\.dir=/);
  assert.match(emulator, /sys\.boot_completed/);
});

test('seeded APK is transformed after its generated-only seed mutation', () => {
  assert.match(seeded, /generatedSeeded[\s\S]*prepare-api23-assets\.mjs[\s\S]*assembleDebug/);
});

test('pipeline covers scripts, legacy CSS, bridge, runtime shims and generated pins', () => {
  for (const marker of ['@babel/preset-env', "chrome: '44'", 'transformHtml', 'resolveCssVariables', 'collectCssVariables', "ext === '.css'", 'native-bridge.js', 'Object.assign', 'NodeList.prototype.forEach', 'manifest.modules', 'manifest.sharedAssets', "createHash('sha256')"]) {
    assert.ok(pipeline.includes(marker), `missing ${marker}`);
  }
});

test('API-23 storage uses native-first migration and never invokes wasm when unsupported', () => {
  const storage = fs.readFileSync(new URL('../www/storage-core.js', import.meta.url), 'utf8');
  const shellCss = fs.readFileSync(new URL('../www/shell-core.css', import.meta.url), 'utf8');
  assert.match(storage, /typeof WebAssembly !== 'object'[\s\S]*migrateToNative\(plugin\)/);
  assert.match(storage, /WebAssembly absent - native-LS fallback/);
  assert.match(storage, /native-first migration active without WebAssembly/);
  assert.match(shellCss, /@supports not \(display:grid\)/);
  assert.match(shellCss, /\.app\{display:-webkit-flex;display:flex/);
});
