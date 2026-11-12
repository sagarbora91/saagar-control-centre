// U13-061 guard (new file). Hindi and Marathi wording for the ETP screens is on hold (OD-5), so nothing is
// translated here. This test measures the gap, keeps it from growing in the module page, and (only when
// S13_WRITE_GAP_CSV is set) writes the list the owner needs to approve wording.
// It reads www/app-i18n.js and never changes it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(here, '..', 'www');
const read = (p) => fs.readFileSync(path.join(www, p), 'utf8');

// Recorded from the first run of this test on 2026-11-12 (module page static text only).
const BASELINE_MODULE_UNTRANSLATED = 37;

function phraseSet() {
  const src = read('app-i18n.js');
  const start = src.indexOf('var PHRASES=[');
  const end = src.indexOf('\n  ];', start);
  assert.ok(start > 0 && end > start, 'PHRASES block found');
  const set = new Set();
  const re = /^\s*\['((?:[^'\\]|\\.)*)'\s*,/gm;
  let m;
  const block = src.slice(start, end);
  while ((m = re.exec(block))) set.add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  return set;
}
const norm = (s) => s.replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();

function moduleStaticText() {
  const html = read(path.join('modules', 'etp', 'index.html'));
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const out = new Set();
  body.replace(/>([^<>]+)</g, (_, t) => { const v = norm(t); if (/[A-Za-z]{3}/.test(v)) out.add(v); return ''; });
  return [...out];
}

function presentationLiterals() {
  const files = ['etp-e3-presentation.js', 'etp-e4-presentation.js', 'etp-e5-presentation.js', 'etp-e6-presentation.js', 'etp-e7-presentation.js', 'etp-verified-presentation.js'];
  const rows = [];
  for (const f of files) {
    const src = read(f);
    const seen = new Set();
    src.replace(/'((?:[^'\\\n]|\\.){4,110})'/g, (_, lit) => {
      const v = norm(lit.replace(/\\'/g, "'"));
      if (/^[A-Z][A-Za-z0-9 ,.'’&/()·:+-]+$/.test(v) && /[a-z]/.test(v) && /\s/.test(v) && !/_/.test(v) && !seen.has(v)) { seen.add(v); rows.push([f, v]); }
      return '';
    });
  }
  return rows;
}

test('module page: untranslated static text does not grow past the recorded baseline', () => {
  const phrases = phraseSet();
  assert.ok(phrases.size > 1000, 'phrase table parsed');
  assert.ok(phrases.has('Status'));
  const missing = moduleStaticText().filter((t) => !phrases.has(t));
  assert.ok(missing.length <= BASELINE_MODULE_UNTRANSLATED, `untranslated ${missing.length} > baseline ${BASELINE_MODULE_UNTRANSLATED}: ${missing.slice(0, 5).join(' / ')}`);
  if (process.env.S13_PRINT_GAP) console.log('module untranslated', missing.length);
});

test('gap list (written only on request)', () => {
  const phrases = phraseSet();
  const rows = moduleStaticText().filter((t) => !phrases.has(t)).map((t) => ['www/modules/etp/index.html', t])
    .concat(presentationLiterals().filter(([, t]) => !phrases.has(t)));
  assert.ok(rows.length > 0);
  if (process.env.S13_WRITE_GAP_CSV) {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const csv = 'file,english_text\r\n' + rows.map((r) => q(r[0]) + ',' + q(r[1])).join('\r\n') + '\r\n';
    fs.mkdirSync(path.dirname(process.env.S13_WRITE_GAP_CSV), { recursive: true });
    fs.writeFileSync(process.env.S13_WRITE_GAP_CSV, csv);
  }
});
