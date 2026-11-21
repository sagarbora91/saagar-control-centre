import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Ui } from './lib/svc1-mui-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'www', 'service-stores-masters-ui.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');

// Code only: block and line comments removed, string contents blanked.
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
const code = codeOnly(src);
// Comments removed, strings kept (for token scans that must also cover text and attribute strings).
const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

test('file hygiene: ASCII only, LF only, no BOM, one final newline', () => {
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'bad byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  console.log('service-stores-masters-ui.js bytes: ' + buf.length);
});

test('UMD wrapper is the same as the other Stores files and the API is frozen', () => {
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceMastersUi = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(Object.isFrozen(ctx.SaagarServiceMastersUi), true);
});

test('allowed syntax: no async/await, class, generator, spread, optional chaining; arrows and let/const are not used either', () => {
  assert.equal(/\basync\b|\bawait\b|\bclass\s+\w|function\s*\*|\byield\b/.test(code), false);
  assert.equal(/\.\.\.|\?\./.test(code), false);
  assert.equal(/=>/.test(code), false, 'plain functions keep the Babel output small');
  assert.equal(/\b(let|const)\b/.test(code), false);
  assert.equal(/`/.test(code), false, 'no template literals');
});

test('only polyfilled or ES5 methods', () => {
  for (const re of [/\.flat\(/, /\.flatMap\(/, /\.fill\(/, /\.at\(/, /padEnd/, /replaceAll/, /structuredClone/, /getOwnPropertyDescriptors/, /\.includes\(/, /Object\.entries/, /Object\.values/, /Array\.from/, /\.find\(/, /\.findIndex\(/, /\.startsWith\(/, /\.endsWith\(/, /Object\.assign/]) {
    assert.equal(re.test(code), false, String(re));
  }
});

test('banned tokens from the Stores file rules', () => {
  const banned = [
    /postMessage/, /addEventListener\(\s*['"]message/, /document\.write/, /createElement\(\s*['"]script/, /\bimport\s*\(/, /\beval\s*\(/, /new\s+Function/,
    /\bfetch\s*\(/, /XMLHttpRequest/, /window\.open/, /sendBeacon/, /WebSocket/, /https?:\/\//, /sessionStorage/, /indexedDB/, /localStorage/, /custName|custMobile|custAddr/,
    /\bprompt\s*\(/, /\bconfirm\s*\(/, /\balert\s*\(/, /saagar_svcs_/, /setItem\s*\(/, /safeSet\s*\(/, /store\.set\s*\(/, /Date\.now\s*\(/, /Math\.random/, /new\s+Date\s*\(\s*\)/,
    /\bwindow\b/, /\bdocument\b/, /\bsetTimeout\b|\bsetInterval\b|requestAnimationFrame/
  ];
  for (const re of banned) assert.equal(re.test(noComments), false, String(re));
  // the text scan above also covers comments for the tokens that must never appear even there
  for (const re of [/import\s*\(/, /eval\s*\(/, /saagar_svcs_/, /postMessage/]) assert.equal(re.test(src), false, 'in comments: ' + String(re));
});

test('ST_ token rule: nothing at a word boundary; the only loose hits are the plan-named SVS_PAST_VIEW code', () => {
  assert.equal(/\bST_/.test(src), false);
  const loose = new Set(src.match(/[A-Z0-9_]*ST_[A-Z0-9_]*/g) || []);
  assert.deepEqual([...loose], ['SVS_PAST_VIEW']);
});

test('permission-token words from the A3 scan never appear, even in comments', () => {
  for (const w of ['SaagarReauth', 'SaagarOwnerSession', 'isSuperAdmin', 'ownerOnly', 'accessContext', 'SaagarAccess', 'canAccess', 'hasPermission', 'requireRole', 'roleAllows',
    'SaagarModuleRuntime', 'SaagarModuleBridge', 'ownerSession']) {
    assert.equal(src.includes(w), false, w);
  }
});

test('no storage of its own, no timers, no try/catch, no throw; listener sites are exactly three and three', () => {
  const count = (re) => (code.match(re) || []).length;
  assert.equal(count(/\bcatch\b/g), 0);
  assert.equal(count(/\bthrow\b/g), 0);
  assert.equal(count(/\btry\b/g), 0);
  assert.equal(count(/\.addEventListener\(/g), 3);
  assert.equal(count(/\.removeEventListener\(/g), 3);
  console.log('measured: return null ' + count(/return null/g) + ', return false ' + count(/return false/g) + ', Promise.resolve ' + count(/Promise\.resolve/g));
});

test('controls: data-svcs-action only, no data-action, no inline handlers, no ids outside svcm-', () => {
  assert.equal(/data-action/.test(src), false);
  assert.equal(/\bon(click|change|input|keydown|submit)\s*=/i.test(src), false);
  const ids = [...src.matchAll(/'(svcm-[a-z-]+)'/g)].map((m) => m[1]);
  for (const id of Ui.ACTIONS) assert.ok(ids.includes(id), 'literal missing for ' + id);
  for (const id of new Set(ids)) {
    if (/^svcm-(e|f|g|a|t|q|dr|bulk|groups)(-|$)/.test(id)) continue; // element ids and names, not actions
    assert.ok(Ui.ACTIONS.includes(id), 'action literal not in ACTIONS: ' + id);
  }
  for (const a of Ui.ACTIONS) assert.match(a, /^svcm-[a-z]+(-[a-z]+)*$/);
  assert.equal(/\b\d{10}\b/.test(Ui.ACTIONS.join(' ')), false);
});

test('classes: only shared svs- names, no svcm- class', () => {
  const allowed = new Set(['svs-card', 'svs-row', 'svs-btn', 'svs-btn-primary', 'svs-btn-danger', 'svs-input', 'svs-label', 'svs-num', 'svs-muted', 'svs-badge',
    'svs-error', 'svs-warn', 'svs-notice', 'svs-title', 'svs-sr-only', 'svs-key']);
  const used = new Set(src.match(/\bsvs-[a-z0-9-]+/g) || []);
  for (const u of used) assert.ok(allowed.has(u), 'class or token not shared: ' + u);
  // svcm- may name actions and element ids only
  for (const m of src.matchAll(/class="([^"]*)"/g)) assert.equal(/svcm-/.test(m[1]), false);
  assert.equal(/class="[^"]*\bsvcm-/.test(src), false);
  console.log('shared classes used: ' + [...used].sort().join(', '));
});

test('no prompt, confirm or alert, and no customer text in any field name', () => {
  assert.equal(/(mobile|phone|e-?mail|address|customer|aadhaar|gstin)/i.test(code), false);
});

test('phrases(): sorted, unique, English, and all of them are collected in PHRASES.json', () => {
  const list = Ui.phrases();
  assert.deepEqual(list, [...new Set(list)].sort());
  assert.ok(list.length > 100);
  for (const s of list) assert.match(s, /^[\x20-\x7e]+$/);
  const p = path.join(here, '..', '..', 'Saagar Control Centre Workspace', 'service-wave-1', 'l10n', 'PHRASES.json');
  if (!fs.existsSync(p)) { console.log('PHRASES.json not found: skipped'); return; }
  const rows = JSON.parse(fs.readFileSync(p, 'utf8')).rows.map((r) => r[0]);
  const missing = list.filter((s) => !rows.includes(s));
  assert.deepEqual(missing, []);
  for (const need of ['Parts', 'Labour', 'Tax details missing', 'Add part', 'Add labour item', 'Bulk add (paste)', 'Reason for change', 'Counter saleable',
    'Paste rows below. The first line must be exactly the header shown.', 'Existing codes are not changed here', '{n} items created.', '1 item created.']) {
    assert.ok(list.includes(need), need);
  }
});

test('every masters sentence a user can meet is available from the masters table (no gap in the UI)', async () => {
  const { M } = await import('./lib/svc1-mui-harness.mjs');
  const fallback = ['SVS_ROLE_DENIED', 'SVS_OWNER_ONLY', 'SVS_PIN_DENIED', 'SVS_PAST_VIEW', 'SVS_BUSY', 'SVS_CORE_MISSING', 'SVS_FIELDS_INVALID', 'SVS_LOAD_FAILED', 'SVS_REASON_SHORT'];
  for (const c of Object.keys(M.CODES)) assert.equal(typeof M.MESSAGES[c], 'string', c);
  for (const c of fallback) assert.ok(src.includes(c), c);
});
