// Service wave 2, governance T9: every new English phrase is collected in service-wave-2\l10n (PHRASES-<group>.json fragments, merged into PHRASES.json by the integrator)
// for the later Hindi/Marathi package. app-i18n.js is ON HOLD (OD-5) and must not change. Rows are [English, "", ""] (the other two stay empty).
// The workspace folder is outside the repo. Path: env SVC_W2_WORKSPACE, default E:\Projects\Saagar Control Centre Workspace\service-wave-2.
// The tests skip with a clear message when the folder is absent; the merged-file tests skip while PHRASES.json is not there yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BILLING, WORKSPACE, workspaceExists, exists, readText, readBuf, sha256, loadApi, parseScript, stringValues, loadJson } from './lib/svc2-gov-common.mjs';

const SKIP = workspaceExists() ? false : `workspace folder not found: ${WORKSPACE} (set SVC_W2_WORKSPACE)`;
const l10n = path.join(WORKSPACE, 'l10n');
const MERGED = path.join(l10n, 'PHRASES.json');
const SKIP_MERGED = SKIP || (fs.existsSync(MERGED) ? false : 'service-wave-2\\l10n\\PHRASES.json is not there yet (the integrator merges the fragments)');
// A phrase the wave replaced on purpose (amendment A-11/A-12): the old Phase 1 counter-sale notice. It must not be collected again.
const RETIRED = Object.freeze(['Money for counter sales is not posted to the Expense ledger in this version. Use the cash book to record it.']);

function rowsOf(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(typeof j._readme, 'string', path.basename(file) + ' has a _readme');
  assert.ok(Array.isArray(j.rows), path.basename(file) + ' has rows');
  return j.rows;
}
const fragmentFiles = () => (fs.existsSync(l10n) ? fs.readdirSync(l10n).filter((f) => /^PHRASES-.+\.json$/.test(f)).map((f) => path.join(l10n, f)) : []);
function collected() {
  const known = new Set();
  if (fs.existsSync(MERGED)) for (const r of rowsOf(MERGED)) known.add(r[0]);
  for (const f of fragmentFiles()) for (const r of rowsOf(f)) known.add(r[0]);
  return known;
}

// What the billing files say to a person: every layer's MESSAGES and the phrase tables or phrases() of the two screen files.
function exposedPhrases() {
  const out = new Map();
  const add = (text, where) => { if (typeof text === 'string' && text.trim() !== '') { if (!out.has(text)) out.set(text, []); out.get(text).push(where); } };
  const waiting = [];
  for (const f of BILLING) {
    const api = loadApi(f);
    if (!api) { waiting.push(f.file); continue; }
    if (api.MESSAGES && typeof api.MESSAGES === 'object') for (const v of Object.values(api.MESSAGES)) add(v, f.key + '.MESSAGES');
    if (typeof api.phrases === 'function') { try { for (const v of api.phrases()) add(v, f.key + '.phrases()'); } catch { /* reported by the screen tests */ } }
    else if (api.TEXT && typeof api.TEXT === 'object') for (const v of Object.values(api.TEXT)) add(v, f.key + '.TEXT');
  }
  return { out, waiting };
}

test('T9.1 PHRASES.json (merged): right shape, English only, unique rows, Hindi and Marathi columns empty (OD-5 on hold)', { skip: SKIP_MERGED }, () => {
  const rows = rowsOf(MERGED);
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
  assert.deepEqual([...rows.map((r) => r[0])].sort(), rows.map((r) => r[0]), 'sorted by the integrator');
});

test('T9.2 every fragment file has the same shape, empty Hindi and Marathi columns, and no phrase repeated inside it', { skip: SKIP }, () => {
  const files = fragmentFiles();
  assert.ok(files.length >= 1, 'at least one PHRASES-<group>.json fragment exists');
  for (const f of files) {
    const rows = rowsOf(f);
    const names = rows.map((r) => r[0]);
    assert.equal(new Set(names).size, names.length, path.basename(f) + ' repeats a phrase');
    for (const r of rows) {
      assert.ok(Array.isArray(r) && r.length === 3 && r[1] === '' && r[2] === '', path.basename(f) + ' ' + JSON.stringify(r));
      assert.equal(typeof r[0], 'string');
      assert.equal(/[\u0900-\u097F]/.test(r[0]), false, path.basename(f) + ' English column holds Devanagari: ' + r[0]);
    }
  }
});

test('T9.3 every phrase the billing files show is collected (merged file or a fragment)', { skip: SKIP }, () => {
  const known = collected();
  const { out, waiting } = exposedPhrases();
  assert.deepEqual(waiting, [], 'waiting on writers');
  const missing = [...out.keys()].filter((p) => !known.has(p));
  assert.deepEqual(missing.slice(0, 10).map((p) => p + '  <- ' + out.get(p)[0]), [], `${missing.length} shown phrases are not collected`);
});

test('T9.4 every collected phrase is really in the code (no stale rows) and the retired Phase 1 notice is not collected again', { skip: SKIP }, () => {
  const known = [...collected()];
  const { out, waiting } = exposedPhrases();
  assert.deepEqual(waiting, [], 'waiting on writers');
  const inCode = new Set(out.keys());
  const corpusFiles = BILLING.map((f) => f.file).concat(['www/service-stores-ui.js', 'www/service-stores-docs.js', 'www/service-stores-core.js', 'www/service-stores-store.js', 'www/modules/service/index.html',
    'www/saagar-report.js', 'www/shared/shell-search.js', 'www/integration-bridge.js']);
  let corpus = '';
  for (const f of corpusFiles) if (exists(f)) corpus += '\n' + readText(f);
  for (const f of BILLING) if (exists(f.file)) for (const sv of stringValues(parseScript(readText(f.file)))) inCode.add(sv);
  // the source may spell a character as —: it is the same phrase once read as text
  const unescaped = corpus.replace(/\\(['"])/g, '$1').replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const all = [...inCode];
  const stale = known.filter((phrase) => {
    if (RETIRED.includes(phrase)) return false;       // handled below
    if (inCode.has(phrase) || all.some((sv) => sv.indexOf(phrase) !== -1)) return false;
    const pieces = phrase.split(/\{[^}]*\}/).map((x) => x.trim()).filter((x) => x.length >= 2);
    return pieces.length === 0 || !pieces.every((piece) => unescaped.indexOf(piece) !== -1);
  });
  assert.deepEqual(stale.slice(0, 10), [], `${stale.length} collected phrases are not in the billing files, the page, the report file, the search file, the bridge or the edited Phase 1 files`);
  assert.deepEqual(known.filter((p) => RETIRED.includes(p)), [], 'the replaced counter-sale notice is not collected by wave 2');
});

test('T9.5 app-i18n.js is byte-identical to G0 and none of the new phrases was added to it', () => {
  const g0 = loadJson('g0-baseline.json').appI18n;
  assert.equal(sha256(readBuf('www/app-i18n.js')), g0.sha256);
  assert.equal(readBuf('www/app-i18n.js').length, g0.bytes);
});

test('T9.6 the billing screens are marked data-no-i18n so a Hindi or Marathi user sees whole English billing screens: the three page containers and the controls the UI creates', () => {
  const page = readText('www/modules/service/index.html');
  assert.ok(page.includes('id="svb-job-host" class="svb-job-host" data-no-i18n'));
  assert.ok(page.includes('id="svb-close-host" class="svb-close-host" data-no-i18n'));
  assert.ok(page.includes('id="view-billing" data-no-i18n'));
  // the UI creates its own layer and buttons (outside the marked hosts); the area UI renders only inside #svb-root, which the page marks
  const ui = BILLING.find((x) => x.key === 'ui');
  assert.ok(exists(ui.file), 'waiting on writers: ' + ui.file);
  assert.match(readText(ui.file), /data-no-i18n/, ui.file + ' marks what it creates');
  const area = BILLING.find((x) => x.key === 'area');
  assert.ok(exists(area.file), 'waiting on writers: ' + area.file);
  assert.equal(/\.appendChild\(|\.insertAdjacentHTML\(|document\.body/.test(readText(area.file)) && !/data-no-i18n/.test(readText(area.file)), false, 'the area UI adds nothing outside its marked host unless it marks it');
});
