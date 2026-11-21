import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDirectory = path.join(root, '.github', 'workflows');
const workflowFiles = fs.readdirSync(workflowDirectory)
  .filter(file => /\.ya?ml$/i.test(file))
  .sort();

function activeSource(file) {
  return fs.readFileSync(path.join(workflowDirectory, file), 'utf8')
    .split(/\r?\n/)
    .filter(line => !/^\s*#/.test(line))
    .join('\n');
}

const forbiddenReleaseSink =
  /softprops\/action-gh-release|actions\/create-release|actions\/upload-release-asset|ncipollo\/release-action|marvinpinto\/action-automatic-releases|\bgh\s+release\s+(?:create|upload|edit)|api\.github\.com\/repos\/[^\s]+\/releases|uploads\.github\.com\/repos\//i;

test('tracked workflows are read-only and contain no release-publication sink', () => {
  assert.ok(workflowFiles.length > 0);

  for (const file of workflowFiles) {
    const source = activeSource(file);
    assert.doesNotMatch(source, /\bcontents\s*:\s*write\b/i, file);
    assert.doesNotMatch(source, /\bpermissions\s*:\s*write-all\b/i, file);
    assert.doesNotMatch(source, forbiddenReleaseSink, file);
    assert.doesNotMatch(source, /\btag_name\s*:\s*['"]?latest\b/i, file);
    assert.doesNotMatch(source, /\bmake_latest\s*:\s*true\b/i, file);
  }
});

test('normal APK workflow produces only an immutable debug test artifact', () => {
  const source = activeSource('build-apk.yml');

  assert.match(source, /^permissions:\s*\n\s+contents:\s+read\s*$/m);
  assert.match(source, /\bassembleDebug\b/);
  assert.match(source, /actions\/upload-artifact@/);
  assert.match(source, /SaagarControlCentre-DEBUG-TEST-/);
  assert.match(source, /GITHUB_SHA|github\.sha/);

  assert.doesNotMatch(source, /\bassembleRelease\b/);
  assert.doesNotMatch(source, /SaagarControlCentre-latest/i);
  assert.doesNotMatch(source, /\bsecrets\./i);
});

test('workflow action dependencies stay on the reviewed CI-only allowlist', () => {
  const allowed = new Set([
    'actions/checkout',
    'actions/setup-node',
    'actions/setup-java',
    'android-actions/setup-android',
    'actions/upload-artifact'
  ]);

  for (const file of workflowFiles) {
    const source = activeSource(file);
    const actions = [...source.matchAll(/^\s*uses\s*:\s*([^@\s]+)@[^\s]+\s*$/gmi)]
      .map(match => match[1]);
    for (const action of actions) {
      assert.ok(allowed.has(action), `${file}: unreviewed workflow action ${action}`);
    }
  }
});
