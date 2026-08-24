import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../www/modules/payroll/index.html', import.meta.url), 'utf8');
const staticMarkup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const originalSha256 = 'd0a3e6dcd6333c912feb7ebbf63d7d7047bff7fd19e4d81069a39e3e5073c5ca';
const existingActions = new Set(['add-employee', 'add-master-employee', 'help-close', 'att-import-close']);

test('Payroll freezes one exact unique safe identity for each of its 65 static actions', () => {
  const actions = [...staticMarkup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]);
  assert.equal(actions.length, 65);
  assert.equal(new Set(actions).size, 65);
  existingActions.forEach(action => assert.ok(actions.includes(action), `missing existing action ${action}`));
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('Payroll adds exactly 61 identities without changing existing control semantics', () => {
  const withoutNewAnnotations = html.replace(/ data-action="([^"]+)"/g, (attribute, action) =>
    existingActions.has(action) ? attribute : '');
  assert.equal(
    crypto.createHash('sha256').update(withoutNewAnnotations).digest('hex'),
    originalSha256
  );
});
