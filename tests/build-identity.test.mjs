import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const identity = require('../www/build-identity.js');
const index = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
const overrides = fs.readFileSync(new URL('../build-overrides/apply-overrides.js', import.meta.url), 'utf8');
const register = fs.readFileSync(new URL('../scripts/release-register.mjs', import.meta.url), 'utf8');

test('Phase 0 build identity is valid and immutable', () => {
  assert.deepEqual(identity, {
    packageId: 'com.saagartraders.bcc', appVersion: 'V5.5',
    versionName: '2.9', versionCode: 209, minSdk: 23
  });
  assert.equal(Object.isFrozen(identity), true);
});

test('UI, Android overrides, and release register consume the centralized identity', () => {
  assert.match(index, /<script src="build-identity\.js"><\/script>/);
  assert.match(index, /SaagarBuildIdentity\.appVersion/);
  assert.match(index, /SaagarBuildIdentity\.versionName/);
  assert.match(index, /SaagarBuildIdentity\.versionCode/);
  assert.doesNotMatch(index, /const APP_VERSION = "V5\.5"|const APK_BUILD = "2\.9"|const APP_BUILD_SEQUENCE = 209/);
  assert.match(overrides, /require\('\.\.\/www\/build-identity\.js'\)/);
  assert.match(register, /require\('\.\.\/www\/build-identity\.js'\)/);
  assert.doesNotMatch(register, /apkBuild:\s*'2\.7'|versionCode:\s*207/);
});
