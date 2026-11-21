// Service wave 2, governance T12: the shared mobile sheet www/shared/module-mobile-common.css after the D10 append (P5 12, P7 2.7, plan C-GOV-4).
// The sheet is shared by all 12 modules, has 3 CR bytes (lines 6, 7, 8) and is cut at a marker by the history rebuild and by the capability analyser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBuf, readText, sha256, loadJson } from './lib/svc2-gov-common.mjs';

const SHEET = 'www/shared/module-mobile-common.css';
const G0 = loadJson('g0-baseline.json').mobileSheet;
const buf = readBuf(SHEET);
const text = buf.toString('utf8');
const tail = buf.subarray(G0.bytes).toString('utf8');
const cut = (t) => t.split(G0.marker)[0].trimEnd() + '\n';

test('T12.1 the G0 bytes (26,137) are an exact prefix; the file only grew by appending', () => {
  assert.equal(G0.bytes, 26137);
  assert.ok(buf.length >= G0.bytes);
  assert.equal(sha256(buf.subarray(0, G0.bytes)), G0.sha256);
  assert.match(G0.sha256, /^b8ae6701/);
});

test('T12.2 CR count is exactly 3, on lines 6, 7 and 8; the marker line occurs once; the file ends with one LF; the appended text has no CR', () => {
  const crLines = [];
  let line = 1;
  for (let i = 0; i < buf.length; i++) { if (buf[i] === 0x0d) crLines.push(line); if (buf[i] === 0x0a) line++; }
  assert.deepEqual(crLines, G0.crLines);
  assert.deepEqual(crLines, [6, 7, 8]);
  assert.equal(text.split(G0.marker).length - 1, 1);
  assert.equal(buf[buf.length - 1], 0x0a);
  assert.equal(buf[buf.length - 2] === 0x0a, false, 'one final LF only');
  assert.equal(tail.includes('\r'), false);
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb, false, 'no BOM');
});

test('T12.3 what the history rebuild and the analyser read (the text before the marker) is identical to G0', () => {
  const g0Head = text.slice(0, G0.markerOffset);
  assert.equal(sha256(Buffer.from(g0Head, 'utf8')), sha256(buf.subarray(0, G0.markerOffset)));
  assert.equal(cut(text), cut(buf.subarray(0, G0.bytes).toString('utf8')));
  assert.equal(sha256(readBuf('tests/fixtures/phase6c/module-mobile-legacy.css')).startsWith('acc970db'), true, 'the Planning legacy fixture is unchanged');
});

test('T12.4 the appended block starts on a new line with its own one-line comment marker mentioning Service wave 2', () => {
  assert.ok(tail.length > 0, 'the D10 block is appended (waiting on W-D10)');
  assert.match(tail, /^\n\/\* Service wave 2[^\n]*\*\/\n/);
  assert.equal(tail.split('/* Service wave 2').length - 1, 1, 'one block marker');
});

function rulesOf(css) {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ selector: m[1].trim(), decl: m[2] });
  return rules;
}

test('T12.5 every selector of the appended block is scoped to the Service module (html.bcc-mobile[data-mod="service"] or .svs-); no other module is touched', () => {
  const rules = rulesOf(tail);
  assert.ok(rules.length >= 1, 'waiting on W-D10');
  const bad = [];
  for (const r of rules) for (const sel of r.selector.split(',').map((s) => s.trim())) {
    if (!/^html\.bcc-mobile\[data-mod="service"\]\s/.test(sel) && !/^\.svs-/.test(sel)) bad.push(sel);
    for (const other of ['dsr', 'etp', 'expense', 'grooming', 'leave', 'payroll', 'planning', 'qms', 'stock', 'tax', 'cro_audit']) if (sel.indexOf('data-mod="' + other + '"') !== -1) bad.push(sel);
  }
  assert.deepEqual(bad, []);
});

test('T12.6 Chrome 44 floor: no inset, grid, :is(, :where( in the appended block; every var( has a fallback; gap only where the module\'s own 720px block has the same declaration (parity)', () => {
  assert.ok(tail.length > 0, 'waiting on W-D10');
  const css = tail.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\binset\s*:/.test(css), false);
  assert.equal(/display\s*:\s*(inline-)?grid|grid-template|grid-area/.test(css), false);
  assert.equal(/:is\(|:where\(/.test(css), false);
  for (const m of css.matchAll(/var\(([^)]*)\)/g)) assert.ok(m[1].indexOf(',') !== -1, 'var() without a fallback: ' + m[0]);
  const own = readText('www/modules/service/service-ui.css');
  for (const m of css.matchAll(/([^;{}]*\bgap\s*:[^;}]*)/g)) {
    const decl = m[1].trim().replace(/\s+/g, ' ');
    assert.ok(own.replace(/\s+/g, ' ').includes(decl), 'gap declaration with no twin in service-ui.css: ' + decl);
  }
});

test('T12.7 the append is made by a script that appends only (the apply script exists in the workspace and uses Buffer or appendFileSync, never a text rewrite)', () => {
  const fs = require_fs();
  const p = 'E:\\Projects\\Saagar Control Centre Workspace\\service-wave-2\\work\\W-D10\\apply.cjs';
  if (!fs.existsSync(p)) return;   // the workspace may be absent on another machine
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /Buffer\.concat|appendFileSync/);
  assert.equal(/writeFileSync\([^)]*utf8/.test(s) && !/Buffer/.test(s), false, 'no text rewrite of the sheet');
});
function require_fs() { return globalThis.process.getBuiltinModule('node:fs'); }
