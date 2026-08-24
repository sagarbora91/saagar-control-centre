import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const recipe = fs.readFileSync(new URL('../scripts/build-production-release.ps1', import.meta.url), 'utf8');
const register = fs.readFileSync(new URL('../scripts/release-register.mjs', import.meta.url), 'utf8');
const policy = JSON.parse(fs.readFileSync(new URL('../config/production-signing-policy.json', import.meta.url), 'utf8'));

test('package release entry delegates only to the tracked canonical recipe', () => {
  assert.match(pkg.scripts['build:release'], /powershell[\s\S]*scripts[\\/]build-production-release\.ps1/);
  assert.doesNotMatch(pkg.scripts['build:release'], /assembleRelease|keyPassword|storePassword/);
});

test('canonical recipe requires exact clean source and an external append-only destination', () => {
  assert.match(recipe, /ExpectedCommit/);
  assert.match(recipe, /status --porcelain --untracked-files=all/);
  assert.match(recipe, /MERGE_HEAD/);
  assert.match(recipe, /OutputDirectory must be outside the repository/);
  assert.match(recipe, /OutputDirectory must be a new path/);
  assert.doesNotMatch(recipe, /git\s+(?:reset|clean|stash)|Remove-Item[\s\S]*repositoryRoot/i);
});

test('canonical recipe executes the governed clean release pipeline in order', () => {
  const markers = [
    "@('run', 'sync')",
    "build-overrides\\apply-overrides.js",
    "scripts\\verify-generated-android-release.mjs",
    "@('run', 'prepare:api23')",
    "@('clean', 'assembleRelease', '--no-daemon', '--stacktrace')",
    "scripts\\release-register.mjs"
  ];
  let previous = -1;
  for (const marker of markers) {
    const current = recipe.indexOf(marker);
    assert.ok(current > previous, `missing or out-of-order marker: ${marker}`);
    previous = current;
  }
  assert.doesNotMatch(recipe, /assembleDebug/);
});

test('canonical recipe never persists credentials and binds public build identities', () => {
  for (const variable of ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD', 'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD']) {
    assert.ok(recipe.includes(variable), `missing ${variable}`);
  }
  assert.doesNotMatch(recipe, /Read-Host|ProtectedData|ConvertFrom-SecureString|key\.properties/);
  assert.match(recipe, /finally\s*\{[\s\S]*SetEnvironmentVariable\(\$name, \$null, \[EnvironmentVariableTarget\]::Process\)/);
  for (const field of ['sourceCommit', 'wwwTreeGitObject', 'buildIdentitySha256', 'recipeSha256', 'artifactSha256']) {
    assert.ok(recipe.includes(field), `receipt missing ${field}`);
  }
});

test('optional external Gradle init is hash-bound and the approved signer is public policy', () => {
  assert.match(recipe, /ExpectedGradleInitSha256/);
  assert.match(recipe, /Gradle init script hash does not match the approved identity/);
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.packageId, 'com.saagartraders.bcc');
  assert.match(policy.signerCertificateSha256, /^[A-F0-9]{64}$/);
  assert.match(register, /signerCertificateSha256 !== SIGNING_POLICY\.signerCertificateSha256/);
  assert.match(register, /signerCount !== 1/);
});
