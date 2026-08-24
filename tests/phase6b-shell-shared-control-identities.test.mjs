import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run } from '../scripts/audit/audits/a3.mjs';
import { restorePrePhase6gShellAssets } from './lib/phase6g-shell-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
const historicalHtml = restorePrePhase6gShellAssets({
  index: html,
  manifest: fs.readFileSync(new URL('../www/shell-asset-manifest.js', import.meta.url), 'utf8')
}).index;
const markup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const original = new Set(['master-add-brands','master-add-vendors','master-add-customers']);
const added = ['select-session-role','toggle-ui-mode','share-today-brief','toggle-admin-mode','select-home-store','open-attention','toggle-hide-amounts','open-today','close-today','generate-owner-brief','open-reports-hub','share-today-view','search-modules','open-home','open-modules','open-reports','open-settings','close-module','open-module-switcher','toggle-module-ui-mode','share-current-module','toggle-module-actions','reload-module','open-module-reports','open-whatsapp-composer','print-module','close-shell-modal'];
const expected = [...original, ...added].sort();

test('shared shell freezes the exact safe identity set for the controls Phase 6 moves', () => {
  const actions = [...markup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(actions, expected); assert.equal(new Set(actions).size, expected.length);
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('shared shell identity annotations restore the exact baseline bytes', () => {
  const restored = historicalHtml.replace(/ data-action="([^"]+)"/g, (attribute, action) => added.includes(action) ? '' : attribute)
    .replace('content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
      'content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no"');
  assert.equal(crypto.createHash('sha256').update(restored).digest('hex'), 'b09b5ed9ce37ab090ebafdc302adadd7a594436598c934da1ace6e918427e4bf');
});

test('shared shell remains an exact conflict-free A3 action surface', async () => {
  const check = (await run(buildContext(root))).checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action' && item.surface === 'shell');
  assert.equal(check.result, 'pass'); assert.equal(check.metric.conflictingIds, 0);
  assert.equal(actions.length, 117); assert.equal(new Set(actions.map(item => item.capabilityId)).size, 117);
});
