import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../www/modules/planning/index.html', import.meta.url), 'utf8');
const staticMarkup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');

test('Planning freezes stable identities for its three existing static actions', () => {
  const buttons = [...staticMarkup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  assert.equal(buttons.length, 3);

  const actions = buttons.map(match => /\bdata-action="([^"]+)"/.exec(match[1])?.[1]);
  assert.deepEqual(actions, ['save', 'clear', 'st-v5-home-fab']);
  assert.equal(new Set(actions).size, actions.length);

  assert.match(buttons[0][1], /\bclass="btn p"/);
  assert.match(buttons[0][1], /\bonclick="saveFestival\(\)"/);
  assert.equal(buttons[0][2], 'Save');

  assert.match(buttons[1][1], /\bclass="btn"/);
  assert.match(buttons[1][1], /\bonclick="resetForm\(\)"/);
  assert.equal(buttons[1][2], 'Clear');

  assert.match(buttons[2][1], /\bid="st-v5-home-fab"/);
  assert.match(buttons[2][1], /\btype="button"/);
  assert.match(buttons[2][1], /\btitle="Back to Home \(Esc\)"/);
});

test('Planning has no static table requiring a Phase 6B table handle', () => {
  assert.doesNotMatch(staticMarkup, /<table\b/i);
});
