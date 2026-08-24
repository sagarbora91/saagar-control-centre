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
const html = fs.readFileSync(new URL('../www/modules/expense/index.html', import.meta.url), 'utf8');
const markup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const expected = ['select-role','open-dashboard','open-ledger','open-udhaar','open-cash-statement','open-petty-cash','open-vendors','open-budgets','open-cross-module','open-month-tax','open-audit','st-v5-home-fab'].sort();

test('Expense freezes the exact safe identity set for all 12 static actions', () => {
  const actions = [...markup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(actions, expected);
  assert.equal(new Set(actions).size, expected.length);
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('Expense annotations restore the exact baseline bytes when stripped', () => {
  const restored = html.replace(/ data-action="[^"]+"/g, '');
  assert.equal(crypto.createHash('sha256').update(restoreInlineLegacySource('expense', restored)).digest('hex'), 'c5cf70a6292f454507e4d5d611c317573a88a903ca11b304358053e4332b7762');
});

test('Expense generated controls use semantic identities without record or store data', () => {
  const generated = [...html.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1])
    .filter(action => !expected.includes(action)).sort();
  assert.deepEqual(generated, [
    'add-receivable','add-recurring-template','add-vendor','approve-business-day','approve-ledger-entry','approve-store-day',
    'cancel-generated-modal','close-business-day','close-generated-modal','close-store-day','confirm-generated-modal',
    'copy-previous-month-budgets','dashboard-open-all-ledger-entries','dashboard-open-cash-statement',
    'dashboard-open-month-close','dashboard-review-cross-module','delete-recurring-template','edit-ledger-entry',
    'edit-recurring-template','export-audit-csv','export-ledger-csv','export-month-csv','filter-statement-all-stores',
    'filter-statement-store','generate-lock-tax-feed','open-ledger-to-post','pay-receivable','post-all-source-items',
    'post-recurring-entry','post-source-items','print-cash-statement','print-store-statement',
    'record-petty-cash-disbursement','remind-receivable','remove-vendor','reopen-business-day','reopen-store-day',
    'save-ledger-entry','select-expense-entry','select-income-entry','set-petty-cash-float','share-ledger-entry',
    'toggle-recurring-template','view-ledger-photo','void-ledger-entry','void-receivable'
  ].sort());
  generated.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\$\{|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('Expense remains an exact conflict-free A3 action surface', async () => {
  const check = (await run(buildContext(root))).checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action' && item.surface === 'expense');
  assert.equal(check.result, 'pass'); assert.equal(check.metric.conflictingIds, 0);
  assert.equal(actions.length, expected.length); assert.equal(new Set(actions.map(item => item.capabilityId)).size, expected.length);
});
