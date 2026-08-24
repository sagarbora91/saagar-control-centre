import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { restoreInlineLegacySource } from './lib/phase6c-legacy-source.mjs';
import { restorePhase6dStockSource } from './lib/phase6e-stock-source.mjs';

const currentHtml = fs.readFileSync(new URL('../www/modules/stock/index.html', import.meta.url), 'utf8');
const currentCss = fs.readFileSync(new URL('../www/modules/stock/stock-ui.css', import.meta.url), 'utf8');
const html = restorePhase6dStockSource(currentHtml, currentCss);
const staticMarkup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const originalSha256 = 'b6563b3aa095b7da518979ec22dcb466e473180253cd073955794eb166af796e';
const existingActions = new Set([
  'print-opening-register', 'print-movements-register', 'print-closing-register',
  'print-summary-register', 'print-monthly-register', 'add-cro', 'add-brand',
  'sm-auth-cancel', 'delete-cancel', 'lock-cancel', 'reopen-cancel'
]);

test('Stock freezes one exact unique safe identity for each of its 47 static actions', () => {
  const actions = [...staticMarkup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]);
  assert.equal(actions.length, 47);
  assert.equal(new Set(actions).size, 47);
  existingActions.forEach(action => assert.ok(actions.includes(action), `missing existing action ${action}`));
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('Stock adds exactly 36 identities without changing existing control semantics', () => {
  const withoutNewAnnotations = html.replace(/ data-action="([^"]+)"/g, (attribute, action) =>
    existingActions.has(action) ? attribute : '');
  assert.equal(
    crypto.createHash('sha256').update(restoreInlineLegacySource('stock', withoutNewAnnotations)).digest('hex'),
    originalSha256
  );
});
