import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run } from '../scripts/audit/audits/a3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(new URL('../www/modules/grooming/index.html', import.meta.url), 'utf8');
const staticMarkup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const expected = ['change-cro','clear-day-s-data','cro-inp','day-picker','export-csv','grm-float-save','grm-store-daily','grm-store-monthly','month-picker','save','st-v5-home-fab','startbtn'];

test('Grooming freezes the exact unique safe identity set for all 12 static actions', () => {
  const actions = [...staticMarkup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(actions, expected);
  assert.equal(new Set(actions).size, 12);
  actions.forEach(action => assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/));
});

test('Grooming annotations preserve every pre-existing business and handler byte', () => {
  const restored = html.replace(/ data-action="[^"]+"/g, '');
  assert.equal(crypto.createHash('sha256').update(restored).digest('hex'), '140b0a4f5f5c5b7a3f1a9c6ce582073463ecd7e628baf354b0d2dabb0ca074f3');
});

test('Grooming generated controls use deterministic identity definitions without row data', () => {
  const generated = [...html.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1])
    .filter(action => !expected.includes(action)).sort();
  assert.deepEqual(generated, ['delete-day-record', 'recheck-record', 'start-pending-check']);
  generated.forEach(action => assert.doesNotMatch(action, /\$\{|\d{4}-\d{2}-\d{2}|@/));
});

test('Grooming remains an exact conflict-free A3 action surface', async () => {
  const result = await run(buildContext(root));
  const check = result.checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action' && item.surface === 'grooming');
  assert.equal(check.result, 'pass');
  assert.equal(check.metric.conflictingIds, 0);
  assert.equal(actions.length, 12);
  assert.equal(new Set(actions.map(item => item.capabilityId)).size, 12);
});
