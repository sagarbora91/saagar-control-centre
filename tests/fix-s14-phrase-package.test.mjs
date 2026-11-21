import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const PKG = 'E:/Projects/Saagar Control Centre Workspace/fix-wave/l10n/PHRASE-PACKAGE.json';
const R = new URL('../www/', import.meta.url);
const present = fs.existsSync(PKG);
const t = present ? test : test.skip;
const src = fs.readFileSync(new URL('app-i18n.js', R), 'utf8');
const a = src.indexOf('var PHRASES=[') + 'var PHRASES='.length;
const existing = vm.runInNewContext(src.slice(a, src.indexOf('\n  ];', a) + 4));
const pkg = present ? JSON.parse(fs.readFileSync(PKG, 'utf8')) : null;

function optionTexts() {
  const out = new Set();
  const files = [new URL('index.html', R)];
  for (const d of fs.readdirSync(new URL('modules/', R))) {
    const u = new URL(`modules/${d}/index.html`, R);
    if (fs.existsSync(u)) files.push(u);
  }
  for (const f of files) fs.readFileSync(f, 'utf8').replace(/<option\b([^>]*)>([^<]*)<\/option>/gi, (m, at, tx) => {
    if (!/\bvalue\s*=/.test(at)) out.add(tx.replace(/&amp;/g, '&').trim());
    return m;
  });
  return out;
}

t('package rows are triples with Devanagari text and unique new keys', () => {
  assert.equal(pkg.rowCount, pkg.rows.length);
  assert.ok(pkg.rows.length > 100);
  const have = new Set(existing.map(r => r[0]));
  const seen = new Set();
  for (const r of pkg.rows) {
    assert.equal(r.length, 3, JSON.stringify(r));
    assert.ok(!have.has(r[0]), 'already in dictionary: ' + r[0]);
    assert.ok(!seen.has(r[0]), 'duplicate: ' + r[0]);
    seen.add(r[0]);
    assert.match(r[1], /[\u0900-\u097F]/, r[0]);
    assert.match(r[2], /[\u0900-\u097F]/, r[0]);
  }
});
t('no package key equals an option text that has no value attribute', () => {
  const opts = optionTexts();
  for (const r of pkg.rows) assert.ok(!opts.has(r[0]), r[0]);
});
t('OD-5 is on hold: app-i18n.js still has exactly 2,111 rows', () => {
  assert.equal(existing.length, 2111);
  assert.ok(!src.includes('Wave 8 additive package'));
});
