import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../www/mobile-shell.css', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../www/shell-core.css', import.meta.url), 'utf8');
const RULES = [
  'html.bcc-mobile .top-actions { grid-template-columns: auto minmax(8.5em, 1fr) repeat(3, 44px); }',
  'html.bcc-mobile .topbar .role-select { min-width: 8.5em; padding-right: 26px; text-overflow: ellipsis; }',
  'html.bcc-mobile #__saagar-demo-banner { max-width: min(260px, 38vw) !important; opacity: .9 !important; font-size: min(11px, 2.6vw) !important; }'
];

test('X2-F05: large-text rules are present inside the phone-only 480px block', () => {
  assert.ok(css.includes('/* S14 X2-F05: large font scale / large display size'));
  const open = css.indexOf('@media (max-width: 480px) {');
  const close = css.lastIndexOf('}');
  assert.ok(open >= 0);
  for (const rule of RULES) {
    const at = css.indexOf(rule);
    assert.ok(at > open && at < close, `rule missing or outside the phone block: ${rule}`);
  }
  assert.equal(css.slice(close + 1).trim(), '', 'nothing may follow the phone block (desktop stays unchanged)');
});
test('X2-F05: overrides come after the rules they replace (same specificity, later wins)', () => {
  assert.ok(css.indexOf(RULES[0]) > css.indexOf('grid-template-columns: auto minmax(0, 1fr) repeat(3, 44px);'));
  assert.ok(css.indexOf(RULES[1]) > css.indexOf('min-width: 0;'));
});
test('X2-F05: the 480px rule in shell-core still hides the sub line', () => {
  assert.match(core, /@media\s*\(max-width:\s*480px\)[\s\S]*?\.brand-meta p\{display:none\}/);
});
