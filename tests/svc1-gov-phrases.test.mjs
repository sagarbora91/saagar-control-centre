// Service wave 1, governance T10: every new English phrase is collected in service-wave-1\l10n\PHRASES.json for the later Hindi/Marathi package.
// OD-5: the pinned phrase table in www/app-i18n.js is ON HOLD and must not change. Rows are [English, "", ""] (the other two stay empty).
// The workspace folder is outside the repo. Path: env SVC_W1_WORKSPACE, default E:\Projects\Saagar Control Centre Workspace\service-wave-1.
// The test skips with a clear message when the folder is absent (same habit as fix-s14-phrase-package).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SEVEN, WORKSPACE, workspaceExists, exists, readText, readBuf, sha256, loadApi, parseScript, stringValues, loadJson } from './lib/svc1-gov-common.mjs';

const SKIP = workspaceExists() ? false : `workspace folder not found: ${WORKSPACE} (set SVC_W1_WORKSPACE)`;
const l10n = path.join(WORKSPACE, 'l10n');

function rowsOf(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(typeof j._readme, 'string', path.basename(file) + ' has a _readme');
  assert.ok(Array.isArray(j.rows), path.basename(file) + ' has rows');
  return j.rows;
}
const fragmentFiles = () => (fs.existsSync(l10n) ? fs.readdirSync(l10n).filter((f) => /^PHRASES-.+\.json$/.test(f)).map((f) => path.join(l10n, f)) : []);

// What the seven files say to a person: every layer's MESSAGES, and the phrase tables of the two screen files.
function exposedPhrases() {
  const out = new Map();
  const add = (text, where) => { if (typeof text === 'string' && text.trim() !== '') { if (!out.has(text)) out.set(text, []); out.get(text).push(where); } };
  const waiting = [];
  for (const f of SEVEN) {
    const api = loadApi(f);
    if (!api) { waiting.push(f.file); continue; }
    if (api.MESSAGES && typeof api.MESSAGES === 'object') for (const v of Object.values(api.MESSAGES)) add(v, f.key + '.MESSAGES');
    if (typeof api.phrases === 'function') for (const v of api.phrases()) add(v, f.key + '.phrases()');
    else if (api.TEXT && typeof api.TEXT === 'object') for (const v of Object.values(api.TEXT)) add(v, f.key + '.TEXT');
  }
  return { out, waiting };
}

test('T10.1 PHRASES.json: right shape, English only, unique rows, Hindi and Marathi columns empty (OD-5 on hold)', { skip: SKIP }, () => {
  const file = path.join(l10n, 'PHRASES.json');
  assert.ok(fs.existsSync(file), 'PHRASES.json exists');
  const rows = rowsOf(file);
  assert.ok(rows.length > 0);
  const seen = new Set();
  const dup = [];
  for (const r of rows) {
    assert.ok(Array.isArray(r) && r.length === 3, 'every row is [English, Hindi, Marathi]: ' + JSON.stringify(r));
    assert.ok(r.every((x) => typeof x === 'string'));
    assert.ok(r[0].trim().length > 0, 'English is not empty');
    assert.equal(r[1], '', 'Hindi stays empty: ' + r[0]);
    assert.equal(r[2], '', 'Marathi stays empty: ' + r[0]);
    assert.equal(/[\u0900-\u097F]/.test(r[0]), false, 'the English column holds no Devanagari: ' + r[0]);
    if (seen.has(r[0])) dup.push(r[0]);
    seen.add(r[0]);
  }
  assert.deepEqual(dup, [], 'no phrase appears twice');
});

test('T10.2 every fragment file has the same shape and no phrase repeated inside it', { skip: SKIP }, () => {
  for (const f of fragmentFiles()) {
    const rows = rowsOf(f);
    const names = rows.map((r) => r[0]);
    assert.equal(new Set(names).size, names.length, path.basename(f) + ' repeats a phrase');
    for (const r of rows) { assert.ok(Array.isArray(r) && r.length === 3 && r[1] === '' && r[2] === '', path.basename(f) + ' ' + JSON.stringify(r)); }
  }
});

test('T10.3 every phrase the seven files show is collected (PHRASES.json or a group fragment)', { skip: SKIP }, () => {
  const known = new Set(rowsOf(path.join(l10n, 'PHRASES.json')).map((r) => r[0]));
  for (const f of fragmentFiles()) for (const r of rowsOf(f)) known.add(r[0]);
  const { out, waiting } = exposedPhrases();
  assert.deepEqual(waiting, [], 'waiting on writers');
  const missing = [...out.keys()].filter((p) => !known.has(p));
  assert.deepEqual(missing.slice(0, 10).map((p) => p + '  <- ' + out.get(p)[0]), [], `${missing.length} shown phrases are not collected`);
});

test('T10.4 every collected phrase is really in the code (no stale rows)', { skip: SKIP }, () => {
  const rows = rowsOf(path.join(l10n, 'PHRASES.json')).map((r) => r[0]);
  const { out, waiting } = exposedPhrases();
  assert.deepEqual(waiting, [], 'waiting on writers');
  const inCode = new Set(out.keys());
  // the phrases of the other groups' files (page glue toasts, report titles, search words) are collected here too
  const corpusFiles = SEVEN.map((f) => f.file).concat(['www/modules/service/index.html', 'www/saagar-report.js', 'www/shared/shell-search.js']);
  let corpus = '';
  for (const f of corpusFiles) if (exists(f)) corpus += '\n' + readText(f);
  for (const f of SEVEN) if (exists(f.file)) for (const sv of stringValues(parseScript(readText(f.file)))) inCode.add(sv);
  const unescaped = corpus.replace(/\\(['"])/g, '$1');
  const all = [...inCode];
  const stale = rows.filter((phrase) => {
    if (inCode.has(phrase) || all.some((sv) => sv.indexOf(phrase) !== -1)) return false;
    // a phrase with {placeholders} is stored whole but built from pieces: every piece must occur somewhere
    const pieces = phrase.split(/\{[^}]*\}/).map((x) => x.trim()).filter((x) => x.length >= 2);
    return pieces.length === 0 || !pieces.every((piece) => unescaped.indexOf(piece) !== -1);
  });
  assert.deepEqual(stale.slice(0, 10), [], `${stale.length} collected phrases are not in the seven files, the Service page, the report file or the search file`);
});

test('T10.5 app-i18n.js is byte-identical to G0 and none of the new phrases was added to it', () => {
  const reg = loadJson('capability-register.json');
  assert.equal(sha256(readBuf('www/app-i18n.js')), reg.g0Baseline.appI18n.sha256);
  assert.equal(readBuf('www/app-i18n.js').length, reg.g0Baseline.appI18n.bytes);
});

test('T10.6 the Stores screens are marked data-no-i18n so a Hindi or Marathi user sees whole English screens, not a half-translated mix', () => {
  const page = readText('www/modules/service/index.html');
  assert.ok(page.includes('id="svs-job-host" class="svs-job-host" data-no-i18n'));
  assert.ok(page.includes('id="view-stores" data-no-i18n'));
  for (const rel of ['www/service-stores-ui.js', 'www/service-stores-masters-ui.js']) {
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
  }
  assert.match(readText('www/service-stores-ui.js'), /data-no-i18n/, 'the UI marks the controls it creates (the Stores button and the layer)');
});
