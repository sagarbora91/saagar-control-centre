import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource } from '../scripts/lib/module-manifest-source.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'www', 'module-manifest.js');
const shellPath = path.join(root, 'www', 'index.html');
const source = fs.readFileSync(manifestPath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');
const api = require(manifestPath);
const expectedIds = [
  'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
  'cro_audit', 'payroll', 'leave', 'tax', 'planning'
];

function rawClone() {
  return JSON.parse(JSON.stringify({ schemaVersion: api.schemaVersion, modules: api.modules }));
}

test('MAH-2 manifest is the synchronous authority before the compatibility alias', () => {
  const tag = '<script src="module-manifest.js"></script>';
  assert.equal(shell.split(tag).length - 1, 1);
  const tagAt = shell.indexOf(tag);
  const aliasAt = shell.indexOf('const MODULES =');
  assert.ok(tagAt >= 0 && aliasAt > tagAt);
  assert.doesNotMatch(shell, /const\s+MODULES\s*=\s*\[/);
  assert.doesNotMatch(tag, /\b(?:async|defer)\b/);
});

test('MAH-2 manifest has exact ordered modules and immutable browser data', () => {
  assert.equal(api.schemaVersion, 1);
  assert.deepEqual(api.ids, expectedIds);
  assert.deepEqual(api.modules.map(module => module.id), expectedIds);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.ids), true);
  assert.equal(Object.isFrozen(api.modules), true);
  api.modules.forEach(module => assert.equal(Object.isFrozen(module), true, module.id));
  assert.equal(api.get('stock'), api.modules[0]);
  assert.equal(api.get('unknown'), null);
  assert.equal(api.has('planning'), true);
  assert.equal(api.has('unknown'), false);
});

test('MAH-2 manifest binds every exact local path to its raw bytes and SHA-256', () => {
  for (const module of api.modules) {
    assert.equal(module.file, `modules/${module.id}/index.html`, module.id);
    assert.equal(module.src, module.file, module.id);
    assert.equal(module.html_b64, undefined, module.id);
    assert.doesNotMatch(module.src, /^(?:[a-z]+:|\/\/)|[\\?#%]|(?:^|\/)\.\.?\//i, module.id);
    const bytes = fs.readFileSync(path.join(root, 'www', module.src));
    assert.equal(module.bytes, bytes.length, module.id);
    assert.equal(module.sha256, crypto.createHash('sha256').update(bytes).digest('hex'), module.id);
  }
});

test('MAH-2 manifest rejects unknown, missing, duplicate, remote and malformed records', () => {
  const cases = [
    value => { value.extra = true; },
    value => { value.schemaVersion = 2; },
    value => { delete value.modules[0].summary; },
    value => { value.modules[0].unexpected = true; },
    value => { value.modules[0].id = 'service'; },
    value => { value.modules[0].src = 'https://example.invalid/stock.html'; },
    value => { value.modules[0].src = '../stock.html'; },
    value => { value.modules[0].file = 'modules/service/index.html'; },
    value => { value.modules[0].bytes = 0; },
    value => { value.modules[0].sha256 = 'A'.repeat(64); },
    value => { value.modules[1].sha256 = value.modules[0].sha256; },
    value => { value.modules[0].title = ` ${value.modules[0].title}`; }
  ];
  for (const mutate of cases) {
    const candidate = rawClone();
    mutate(candidate);
    assert.throws(() => api.validate(candidate), /Invalid Saagar module manifest/);
  }
});

test('MAH-2 manifest has one machine-editable data block and Node/browser parity', () => {
  const snapshot = readModuleManifestSource(root);
  assert.deepEqual(snapshot.data, rawClone());
  const context = { window: {}, console: { error() {} } };
  vm.runInNewContext(source, context, { filename: 'module-manifest.js' });
  const browserApi = context.window.SaagarModuleManifest;
  assert.ok(browserApi);
  assert.equal(JSON.stringify(browserApi.modules), JSON.stringify(api.modules));
  assert.equal(Object.isFrozen(browserApi.modules), true);
  assert.equal(Object.isFrozen(browserApi.modules[0]), true);
});

test('MAH-2 shell keeps a recoverable fail-closed missing-manifest guard', () => {
  assert.match(shell, /window\.SaagarModuleManifest/);
  assert.match(shell, /Module manifest unavailable or invalid/);
  assert.match(shell, /if\(!Array\.isArray\(MODULES\) \|\| !MODULES\.length\)/);
  assert.match(shell, /Module manifest integrity/);
  assert.match(shell, /External module routes/);
  assert.doesNotMatch(shell, /Module decode integrity|Embedded module count|__warmIds/);
});
