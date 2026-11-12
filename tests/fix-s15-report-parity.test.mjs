// tests/fix-s15-report-parity.test.mjs
// S15 rule (d): the Reports hub, the Reports tab and the shell search must use ONE report-to-module table and the
// same visibility function the Home tiles use (moduleVisibleForRole). Source-level parity test.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.S15_REPO_ROOT || fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(`${ROOT}/www/${p}`, 'utf8');

function literal(src, name) {                        // `var NAME = { ... };`  -> plain object
  const m = new RegExp(String.raw`var\s+${name}\s*=\s*(\{[\s\S]*?\n\s*\});`).exec(src);
  assert.ok(m, `${name} literal not found`);
  return vm.runInNewContext('(' + m[1] + ')');
}
const norm = (v) => (v === '' || v === '*' ? '*' : v);   // shell-search uses '' for owner-level, saagar-report uses '*'

test('S15 report parity: saagar-report.js and shared/shell-search.js map every report type to the same module', () => {
  const rep = literal(read('saagar-report.js'), 'REPORT_MODULE');
  const sea = literal(read('shared/shell-search.js'), 'REPORT_MODULE');
  assert.deepEqual(Object.keys(rep).sort(), Object.keys(sea).sort(), 'same report types');
  for (const k of Object.keys(sea)) assert.equal(norm(rep[k]), norm(sea[k]), `module of ${k}`);
});

test('S15 report parity: every report type the hub can show has a table row (unknown types are never silently public)', () => {
  const rep = literal(read('saagar-report.js'), 'REPORT_MODULE');
  const src = read('saagar-report.js');
  const metaBlock = src.slice(src.indexOf('var META = {'), src.indexOf('\n  };', src.indexOf('var META = {')));
  const types = [...metaBlock.matchAll(/^\s{4}([A-Za-z0-9]+):\s*\{/gm)].map((m) => m[1]);
  assert.ok(types.length >= 18, 'META parsed');
  for (const t of types) assert.ok(Object.prototype.hasOwnProperty.call(rep, t), `REPORT_MODULE has no row for ${t}`);
});

test('S15 report parity: the hub gate and the Home tiles share moduleVisibleForRole', () => {
  const rep = read('saagar-report.js');
  assert.match(rep, /G\('moduleVisibleForRole'/, 'saagar-report.js resolves the shell function moduleVisibleForRole');
  assert.doesNotMatch(rep, /function\s+moduleVisibleForRole/, 'and does not carry its own copy');
  const shell = read('index.html');
  assert.match(shell, /function moduleVisibleForRole\(id\)\{/, 'the shell function the Home tiles use still exists under that name');
});
