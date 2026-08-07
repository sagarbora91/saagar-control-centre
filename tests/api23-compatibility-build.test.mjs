import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const pipeline = fs.readFileSync(new URL('../scripts/prepare-api23-assets.mjs', import.meta.url), 'utf8');
const seeded = fs.readFileSync(new URL('../scripts/build-seeded-apk.mjs', import.meta.url), 'utf8');

test('normal and release APK builds prepare API-23 assets before Gradle', () => {
  assert.match(pkg.scripts['build:apk'], /prepare:api23.*gradlew\.bat assembleDebug/);
  assert.match(pkg.scripts['build:release'], /prepare:api23.*gradlew\.bat assembleRelease/);
});

test('seeded APK is transformed after its generated-only seed mutation', () => {
  assert.match(seeded, /generatedSeeded[\s\S]*prepare-api23-assets\.mjs[\s\S]*assembleDebug/);
});

test('pipeline covers app scripts, inline scripts, bridge, runtime shims and generated pins', () => {
  for (const marker of ['@babel/preset-env', "chrome: '44'", 'transformHtml', 'native-bridge.js', 'Object.assign', 'NodeList.prototype.forEach', 'manifest.modules', 'manifest.sharedAssets', "createHash('sha256')"]) {
    assert.ok(pipeline.includes(marker), `missing ${marker}`);
  }
});
