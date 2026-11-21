// Service wave 2, old-data bring-in: file rules from the wave plan (section 2.1), code and message tables, no-write proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const wwwDir = path.join(here, '..', 'www');
const file = path.join(wwwDir, 'service-billing-migrate.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');
const Migrate = require(file);

const codeOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const noStrings = (t) => codeOnly(t).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

test('file hygiene: ASCII only, LF only, no BOM, one final newline, no tab, within the 50,000 byte budget', () => {
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'non-ASCII or control byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.includes('\t'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  assert.ok(buf.length < 50000, 'file is ' + buf.length);
  console.log('service-billing-migrate.js bytes: ' + buf.length);
});

test('UMD wrapper as in the Phase 1 docs file, frozen API, loads with no globals at all, name does not match /service-stores/', () => {
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceBillingMigrate = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(Migrate), true);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.SaagarServiceBillingMigrate.create, 'function');
  assert.deepEqual(Object.keys(Migrate).sort(), ['BATCH_MAX', 'BODY_KEYS', 'CODES', 'MESSAGES', 'create', 'refFor', 'version']);
  assert.equal(/service-stores/i.test(path.basename(file)), false);
  assert.equal(Object.isFrozen(Migrate.BODY_KEYS) && Object.isFrozen(Migrate.CODES) && Object.isFrozen(Migrate.MESSAGES), true);
});

test('strict ES5: no arrows, let, const, template literals, classes, spread, async, newer methods', () => {
  const t = noStrings(src);
  for (const [name, re] of [['arrow', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['template', /`/], ['class', /\bclass\s/], ['spread', /\.\.\./],
    ['async', /\basync\b/], ['await', /\bawait\b/], ['yield', /\byield\b/], ['nullish', /\?\?/], ['optional chain', /\?\./]]) {
    assert.equal(re.test(t), false, name);
  }
  for (const bad of ['.flat(', '.flatMap(', '.fill(', '.at(', 'padEnd(', 'padStart(', 'replaceAll(', 'structuredClone', 'getOwnPropertyDescriptors', 'Object.assign',
    'Object.entries', 'Object.values', '.includes(', '.startsWith(', '.endsWith(', '.repeat(', '.find(', '.findIndex(', 'Number.isInteger', 'Array.from',
    'new Map', 'new Set', 'new WeakMap', 'Symbol', 'Promise']) assert.equal(t.includes(bad), false, bad);
  new vm.Script(src, { filename: 'service-billing-migrate.js' });
});

test('banned tokens from the wave rules are absent (comments and strings included)', () => {
  const banned = ['postMessage', "addEventListener('message'", 'document.write', "createElement('script')", 'import(', 'eval(', 'new Function', 'fetch(',
    'XMLHttpRequest', 'window.open', 'sendBeacon', 'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB', 'localStorage', 'setItem(', 'getItem(',
    'removeItem(', 'safeSet(', 'store.set(', 'saagar_svcs_', 'st_v2_', 'gm_expenses', 'SERVICE_DELIVERED', 'stockDocs', 'custName', 'custMobile', 'custAddr',
    'custEmail', 'SaagarReauth', 'SaagarOwnerSession', 'isSuperAdmin', 'ownerOnly', 'ST_ACCESS_CONTEXT', 'SaagarAccess', 'accessContext', 'canAccess',
    'hasPermission', 'requireRole', 'roleAllows', 'prompt(', 'confirm(', 'alert(', 'debugger', 'Date.now', 'Math.random', 'setTimeout', 'setInterval'];
  for (const t of banned) assert.equal(src.includes(t), false, t);
  assert.equal(/\bST_[A-Z0-9_]+/.test(src), false);
  assert.equal(/new Date\(\s*\)/.test(src), false);
  assert.equal(/\bwindow\b|\bdocument\b/i.test(src), false);
  for (const word of ['customer', 'mobile', 'phone', 'email', 'address']) assert.equal(src.toLowerCase().includes(word), false, word);
});

test('it never writes: no append call, no storage call, no write to the job list, the settings or the cash book', () => {
  const t = codeOnly(src);
  assert.equal(/\.append\s*\(/.test(t), false, 'only the documents and money layers call store.append');
  assert.equal(/\.(set|remove|clear|put|save|write)\w*\s*\(/.test(t), false);
  assert.equal(/\bsaveDB\b|\bwsf\b|invoiceSeq|SVC_SETTINGS/.test(src), false);
  // the one write goes through the documents layer
  assert.equal((t.match(/docs\.importLegacy\(/g) || []).length, 1);
  // no ADV_LEGACY and no audit record of its own
  assert.equal(/ADV_LEGACY|MIGRATION_RUN|SERIES_FLOOR|SAR\b/.test(src), false);
  // no float arithmetic on money
  assert.equal(/parseFloat|toFixed/.test(src), false);
});

test('constants use the SBG_ stem and none repeats a name with the same value in another www file', () => {
  const defs = (text) => {
    const out = new Map();
    const re = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(?:(['"])([^'"\r\n]{1,200})\2|(-?\d+(?:\.\d+)?)\b)/g;
    for (const m of text.matchAll(re)) out.set(m[1], m[3] !== undefined ? 's:' + m[3] : 'n:' + m[4]);
    return out;
  };
  const mine = defs(src);
  assert.ok(mine.size >= 5);
  for (const name of mine.keys()) assert.ok(/^SBG_/.test(name), name);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : (/\.(js|html)$/.test(d.name) ? [path.join(dir, d.name)] : [])));
  for (const f of walk(wwwDir)) {
    if (f === file) continue;
    const other = defs(fs.readFileSync(f, 'utf8'));
    for (const [name, value] of mine) assert.notEqual(other.get(name), value, `${name} also in ${path.relative(wwwDir, f)}`);
  }
});

test('A2-01: no stretch of 160 characters of code is shared with the other billing and Stores files', () => {
  const norm = (t) => codeOnly(t).replace(/\s+/g, ' ');
  const mine = norm(src);
  const others = fs.readdirSync(wwwDir).filter((n) => /^service-(stores|billing)-.*\.js$/.test(n) && n !== 'service-billing-migrate.js');
  assert.ok(others.length >= 6);
  for (const n of others) {
    const o = norm(fs.readFileSync(path.join(wwwDir, n), 'utf8'));
    for (let i = 0; i + 160 <= mine.length; i += 20) assert.equal(o.includes(mine.slice(i, i + 160)), false, 'shared stretch with ' + n + ' near ' + i);
  }
});

test('every code used in the source is in CODES, every code has an English message without banned words', () => {
  const t = codeOnly(src);
  const used = new Set();
  for (const m of t.matchAll(/\b(?:sbgFail|fail)\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const m of t.matchAll(/code: '([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const m of t.matchAll(/warn\.push\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  assert.ok(used.size >= 15, 'found ' + used.size);
  // codes that come from the lower layers are passed through, not named here
  for (const c of used) assert.ok(Migrate.CODES[c] === c, 'code missing in CODES: ' + c);
  for (const [c, v] of Object.entries(Migrate.CODES)) {
    assert.equal(v, c);
    assert.ok(Migrate.MESSAGES[c].length > 8, c);
    assert.ok(/^[\x20-\x7e]+$/.test(Migrate.MESSAGES[c]), c);
    assert.equal(/document|window|mobile|phone|email|address|customer/i.test(Migrate.MESSAGES[c]), false, c);
  }
  assert.deepEqual(Object.keys(Migrate.CODES).sort(), Object.keys(Migrate.MESSAGES).sort());
  for (const c of ['FIGURES_INCONSISTENT', 'DUPLICATE_LEGACY_NUMBER', 'NO_COLLECT_DATE', 'AMOUNT_OUT_OF_RANGE', 'SNAPSHOT_UNBUILDABLE']) assert.ok(Migrate.CODES[c], c);
});
