// S11 U11-F12: a very long firm name must not push the page sideways (CSS only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TAX_CSS } from './lib/fix-s11-extract.mjs';

const css = fs.readFileSync(TAX_CSS, 'utf8');
const rule = sel => {
  const m = new RegExp('(?:^|\\n)' + sel.replace(/[.]/g, '\\.') + '\\{([^}]*)\\}').exec(css);
  return m ? m[1] : '';
};

test('F12: .firm-sel has a pixel max-width and ellipsis, .firm-sel-wrap is capped', () => {
  assert.match(rule('.firm-sel'), /max-width:\s*360px/);
  assert.match(rule('.firm-sel'), /text-overflow:\s*ellipsis/);
  assert.match(rule('.firm-sel'), /min-width:\s*160px/);
  assert.match(rule('.firm-sel-wrap'), /max-width:\s*100%/);
});

test('F12: long text lines wrap', () => {
  for (const s of ['.mhd-fy', '.dash-sub', '.firm-detail']) assert.match(rule(s), /overflow-wrap:\s*anywhere/, s);
});
