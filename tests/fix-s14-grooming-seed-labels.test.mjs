import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Cross-group (G10): passes only after S13 has applied correction S13-1 (a) to www/demo-seed.js.
const html = fs.readFileSync(new URL('../www/modules/grooming/index.html', import.meta.url), 'utf8');
const seed = fs.readFileSync(new URL('../www/demo-seed.js', import.meta.url), 'utf8');
const decode = s => s.replace(/&amp;/g, '&');
function live(id) {
  const start = html.indexOf(`id="${id}"`);
  const next = id === 'cl-m' ? html.indexOf('<!-- LADIES -->', start) : html.indexOf('<script', start);
  return [...html.slice(start, next).matchAll(/<span class="cltxt">([\s\S]*?)<\/span>/g)].map(m => decode(m[1]));
}
function arrays(name) {
  const out = [];
  let i = 0;
  const key = `var ${name} = [`;
  while ((i = seed.indexOf(key, i)) >= 0) {
    const j = seed.indexOf('];', i);
    out.push(new Function('return ' + seed.slice(i + key.length - 1, j + 1))());
    i = j;
  }
  return out;
}
test('live checklists have 15 + 15 items', () => {
  assert.equal(live('cl-m').length, 15);
  assert.equal(live('cl-f').length, 15);
});
test('all four seed arrays equal the live labels', () => {
  const m = arrays('CRIT_M'), f = arrays('CRIT_F');
  assert.equal(m.length, 2);
  assert.equal(f.length, 2);
  m.forEach(x => assert.deepEqual(x, live('cl-m')));
  f.forEach(x => assert.deepEqual(x, live('cl-f')));
});
