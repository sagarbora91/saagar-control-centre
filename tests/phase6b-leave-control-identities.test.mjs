import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { restoreInlineLegacySource } from './lib/phase6c-legacy-source.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run } from '../scripts/audit/audits/a3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(new URL('../www/modules/leave/index.html', import.meta.url), 'utf8');
const markup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const original = new Set(['day-modal-close','staff-modal-close','add-leave-close','add-leave-cancel','add-agenda-close','add-agenda-cancel','emp-master-close','report-close','approvals-close','clear-confirm-close','clear-confirm-cancel']);
const added = ['open-staff-master','open-add-leave','open-add-agenda','open-approvals','open-report','print-calendar','import-leave-data','export-leave-data','open-clear-all','import-leave-file','go-today','previous-month','next-month','jump-to-month','day-add-leave','day-add-agenda','select-leave-employee','open-employee-master-from-leave','change-leave-from','change-leave-to','select-leave-type','select-leave-category','submit-leave','save-agenda','save-entitlement-defaults','save-weekly-off','save-store-caps','add-blackout','select-employee-id','add-employee','export-report-csv','backup-before-clear','delete-everything','st-v5-home-fab'];
const expected = [...original, ...added].sort();

test('Leave freezes the exact safe identity set for all 45 static actions', () => {
  const actions = [...markup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(actions, expected); assert.equal(new Set(actions).size, expected.length);
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('Leave new annotations restore the exact baseline bytes when stripped', () => {
  const restored = html
    .replace(/ data-action="([^"]+)"/g, (attribute, action) => added.includes(action) ? '' : attribute)
    .replace(/\b\w+\.dataset\.action = '[^']+'; /g, '');
  assert.equal(crypto.createHash('sha256').update(restoreInlineLegacySource('leave', restored)).digest('hex'), 'b1c11fbee54f66eacbe72734850e3cdb338ec48af7ba987142fcd06d450c4143');
});

test('Leave remains an exact conflict-free A3 action surface', async () => {
  const check = (await run(buildContext(root))).checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action' && item.surface === 'leave');
  assert.equal(check.result, 'pass'); assert.equal(check.metric.conflictingIds, 0);
  assert.equal(actions.length, expected.length); assert.equal(new Set(actions.map(item => item.capabilityId)).size, expected.length);
});

test('Leave generated controls use constant semantic identities without employee or leave data', () => {
  const generated = [...html.matchAll(/\.dataset\.action = '([^']+)'/g)].map(match => match[1]).sort();
  assert.deepEqual(generated, [
    'approve-day-leave','approve-pending-leave','approve-staff-leave','edit-employee-entitlements',
    'reject-day-leave','reject-pending-leave','reject-staff-leave','remove-blackout','remove-day-agenda',
    'remove-day-leave','remove-employee','save-employee-entitlements'
  ].sort());
  generated.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:\$\{|\d{4}-\d{2}-\d{2}|\d{10}|@)/);
  });
});
