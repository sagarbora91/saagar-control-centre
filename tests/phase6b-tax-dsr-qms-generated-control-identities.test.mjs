import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run as auditA3 } from '../scripts/audit/audits/a3.mjs';
import { restoreInlineLegacySource } from './lib/phase6c-legacy-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = Object.freeze([
  { module: 'tax', count: 27, baseline: '63729d18e71fca950e55effdab9dcd525c27fb53265e53ece72c3991f052b517', staticCount: 19 },
  { module: 'dsr', count: 44, baseline: '07413e3c8c756e419de176dbe99c3b385d856802232616e7112d71c7e29752f0', staticCount: 20 },
  { module: 'qms', count: 72, baseline: '13adfb49cd3c9a2e1599f3798449600dff55d87ec26d94d55d10fcab8ff5794c', staticCount: 13 }
]);

function generatedDefinitions(source) {
  const definitions = [];
  for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    for (const control of script[1].matchAll(/<(button|input|select)\b([^>]*)>/gi)) {
      const action = /\bdata-action="([^"]+)"/.exec(control[0])?.[1];
      if (!action) continue;
      const key = /\bdata-action-key="([^"]+)"/.exec(control[0])?.[1] || '';
      definitions.push({ action, key, source: control[0] });
    }
  }
  return definitions;
}

function stripGeneratedAnnotations(source) {
  const staticSource = source.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const staticActions = new Set([...staticSource.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]));
  return source.replace(/ data-action="([^"]+)"/g, (attribute, action) => staticActions.has(action) ? attribute : '')
    .replace(/ data-action-key="[^"]+"/g, '');
}

for (const fixture of fixtures) test(`${fixture.module} generated controls have exact bounded definition identities`, () => {
  const file = path.join(root, 'www', 'modules', fixture.module, 'index.html');
  const source = fs.readFileSync(file, 'utf8');
  const definitions = generatedDefinitions(source);
  assert.equal(definitions.length, fixture.count);
  assert.equal(new Set(definitions.map(item => `${item.action}:${item.key}`)).size, definitions.length);

  const actionCounts = new Map();
  definitions.forEach(item => actionCounts.set(item.action, (actionCounts.get(item.action) || 0) + 1));
  definitions.forEach(item => {
    assert.match(item.action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(item.action, /(?:wlmhw|hemw|titanworld|helios|\$\{|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
    if (actionCounts.get(item.action) > 1 || /\$\{|\+'|\'+/.test(item.source)) {
      assert.match(item.key, /^definition-\d{2}$/);
    }
  });

  assert.equal(crypto.createHash('sha256').update(restoreInlineLegacySource(fixture.module, stripGeneratedAnnotations(source))).digest('hex'), fixture.baseline);
});

test('the generated identity contract covers the inventoried 143 definitions and leaves A3 conflict-free', async () => {
  const count = fixtures.reduce((sum, fixture) => sum + fixture.count, 0);
  assert.equal(count, 143);
  const result = await auditA3(buildContext(root));
  const capability = result.checks.find(check => check.id === 'A3-02');
  assert.equal(capability.result, 'pass');
  assert.equal(capability.metric.conflictingIds, 0);
});
