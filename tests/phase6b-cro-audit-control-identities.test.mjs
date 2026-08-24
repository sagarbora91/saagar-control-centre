import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { restoreInlineLegacySource } from './lib/phase6c-legacy-source.mjs';
import { restorePrePhase6gFamilyBSource } from './lib/phase6g-family-b-source.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run } from '../scripts/audit/audits/a3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(new URL('../www/modules/cro_audit/index.html', import.meta.url), 'utf8');
const markup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const expected = ['change-audit-date','change-audit-store','change-cro','edit-existing-audit','submit-audit','dashboard-all-stores','dashboard-first-store','dashboard-second-store','period-week','period-month','previous-period','next-period','filter-history-cro','filter-history-from','filter-history-to','clear-history-filters','change-survey-target','change-nps-target','change-collection-rate-target','change-review-target','change-marketing-target','save-targets','close-modal','st-v5-home-fab'].sort();

test('CRO Audit freezes the exact safe identity set for all 24 static actions', () => {
  const actions = [...markup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(actions, expected); assert.equal(new Set(actions).size, expected.length);
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('CRO Audit annotations restore the exact baseline bytes when stripped', () => {
  const restored = restorePrePhase6gFamilyBSource('cro_audit', html, fs.readFileSync(new URL('../www/modules/cro_audit/cro-audit-ui.css', import.meta.url), 'utf8')).replace(/ data-action="[^"]+"/g, '');
  assert.equal(crypto.createHash('sha256').update(restoreInlineLegacySource('cro_audit', restored)).digest('hex'), '32bc3d5b1cd6843d57e5a3c3d918034c7f2ee93224eb4916a41779f6ed5849aa');
});

test('CRO Audit remains an exact conflict-free A3 action surface', async () => {
  const check = (await run(buildContext(root))).checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action' && item.surface === 'cro_audit');
  assert.equal(check.result, 'pass'); assert.equal(check.metric.conflictingIds, 0);
  assert.equal(actions.length, expected.length); assert.equal(new Set(actions.map(item => item.capabilityId)).size, expected.length);
});

test('CRO Audit generated controls use semantic identities without customer or audit data', () => {
  const generated = [...html.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1])
    .filter(action => !expected.includes(action)).sort();
  assert.deepEqual(generated, ['ask-for-review','delete-audit-record','edit-audit-record','print-audit-record']);
  generated.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:\$\{|\d{4}-\d{2}-\d{2}|\d{10}|@)/);
  });
});
