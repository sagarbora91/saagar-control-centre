// S11 U11-F10: a filed (or N/A) card must not show the Critical escalation pill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readTax } from './lib/fix-s11-extract.mjs';

const src = readTax();
const cardLine = src.split('\n').find(l => l.includes('htmlParts.push(`<div class="cc ${item.cat}'));

test('F10: the card template no longer reads profile.escalation directly', () => {
  assert.ok(cardLine, 'card template line found');
  assert.ok(!/(?<![\w.])profile\.escalation\./.test(cardLine), 'no raw profile.escalation in the card');
  for (const k of ['cls', 'label', 'note']) assert.ok(cardLine.includes('${esc.' + k + '}'), 'esc.' + k + ' used');
});

test('F10: esc is derived from isDone and isNA, pending items keep the profile escalation', () => {
  const m = /const esc = isDone \?([\s\S]*?);\n/.exec(src);
  assert.ok(m, 'esc definition present');
  assert.match(m[0], /Filed/);
  assert.match(m[0], /isNA/);
  assert.match(m[0], /: profile\.escalation;/);
  assert.ok(src.indexOf('const esc = isDone') > src.indexOf('const profile = getControlProfile(item, month);'));
});

test('F10: getControlProfile and the dashboard focus list are not touched', () => {
  assert.ok(src.includes('${item.profile.escalation.cls}'), 'dashboard focus list still reads item.profile.escalation');
});
