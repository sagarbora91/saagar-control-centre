// S04 U03-F11 part A only: opt fixed QMS labels in to the existing translation hook. No dictionary rows (OD-5 on hold).
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, qmsSource, run } from './lib/fix-s04-qms.mjs';

test('S04-F11 qmsMarkI18n marks the six selectors and is idempotent', () => {
  const asked = []; const els = [{ attrs: {} }, { attrs: { 'data-i18n-ui': '' } }];
  for (const e of els) { e.hasAttribute = (k) => k in e.attrs; e.setAttribute = (k, v) => { e.attrs[k] = v; }; }
  const ctx = { document: { querySelectorAll: (s) => { asked.push(s); return els; } } };
  run(ctx, fn('qmsMarkI18n') + '\nthis.go=qmsMarkI18n;');
  ctx.go(); ctx.go();
  assert.equal(asked[0], '.kpi-label,.kpi-note,.card-title,.card-sub,.report-card h4,.report-row .rk');
  assert.ok(els.every((e) => 'data-i18n-ui' in e.attrs));
  const broken = { document: { querySelectorAll() { throw new Error('x'); } } };
  run(broken, fn('qmsMarkI18n') + '\nthis.go=qmsMarkI18n;'); broken.go();
});
test('S04-F11 renderAll tail keeps the substring other tests rewrite', () => {
  assert.ok(fn('renderAll').includes('qmsMarkI18n();applyReadOnly();qmsRenderPresentation()}'));
  assert.ok(qmsSource.includes(';applyReadOnly();qmsRenderPresentation()}'));
});
test('S04-F11 no card-title template renders a business name', () => {
  for (const m of qmsSource.matchAll(/class="card-title"[^>]*>([^<]*)</g)) assert.doesNotMatch(m[1], /\$\{/, m[0]);
});
