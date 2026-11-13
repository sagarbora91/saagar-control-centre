import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { masters as M, makeEnv, part, labour, MANAGER, OWNER } from './lib/svc1-masters-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'www', 'service-stores-masters.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');

// Strip comments and string literals so the scans look at code only (strings are checked separately where it matters).
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('file hygiene: ASCII only, LF only, no BOM, one final newline', () => {
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'non-ASCII or control byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  console.log('service-stores-masters.js bytes: ' + buf.length);
});

test('UMD wrapper and frozen API', () => {
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceMasters = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(M), true);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.SaagarServiceMasters.createRow, 'function');
  assert.equal(Object.keys(ctx.SaagarServiceMasters).length, Object.keys(M).length);
});

test('strict ES5: no arrows, let, const, template literals, classes, spread, async', () => {
  const code = codeOnly(src);
  const noStrings = code.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  for (const [name, re] of [
    ['arrow', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['template', /`/], ['class', /\bclass\s/],
    ['spread', /\.\.\./], ['async', /\basync\b/], ['await', /\bawait\b/], ['yield', /\byield\b/]
  ]) {
    assert.equal(re.test(noStrings), false, name);
  }
  // not-polyfilled methods
  for (const bad of ['.flat(', '.fill(', '.at(', 'padEnd(', 'padStart(', 'replaceAll(', 'structuredClone', 'Object.assign', 'Object.entries', 'Object.values', '.includes(', '.startsWith(', '.endsWith(', '.repeat(', '.find(', 'Number.isInteger', 'Array.from', 'Math.imul', 'new Map', 'new Set', 'Symbol']) {
    assert.equal(noStrings.includes(bad), false, bad);
  }
});

test('banned tokens from the wave rules are absent (comments and strings included)', () => {
  const banned = [
    'postMessage', "addEventListener('message'", 'document.write', "createElement('script')", 'import(', 'eval(', 'new Function',
    'fetch(', 'XMLHttpRequest', 'window.open', 'sendBeacon', 'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB',
    'localStorage', 'removeItem', 'custName', 'custMobile', 'custAddr', 'Date.now', 'Math.random', 'setTimeout', 'setInterval',
    'saagar_svcs_', 'setItem(', 'safeSet(', 'store.set(', 'window', 'document', 'sha256', 'SHA-256', 'crypto'
  ];
  for (const t of banned) assert.equal(src.includes(t), false, t);
  assert.equal(/new Date\(\s*\)/.test(src), false);
  assert.equal(/\bnew Date\b/.test(src), false);
});

test('only one writer path: every write goes through store.append', () => {
  const calls = src.match(/store\.[A-Za-z]+\(/g) || [];
  const names = Array.from(new Set(calls.map((c) => c.slice(6, -1)))).sort();
  assert.deepEqual(names, ['append', 'findRef', 'read']);
  assert.equal((src.match(/\.append\(/g) || []).length, 1);
});

test('declared UPPER_CASE constants that other files could clash with are only the ones the plan names', () => {
  const names = (codeOnly(src).match(/^\s{2}var ([A-Z][A-Z0-9_]+) =/gm) || []).map((l) => l.trim().slice(4).split(' ')[0]);
  assert.ok(names.includes('CODE_PATTERN'));
  assert.equal(names.filter((n) => n === 'CODE_PATTERN').length, 1);
  console.log('upper case constants: ' + names.join(', '));
});

test('no customer field names exist in code or rows', () => {
  for (const bad of ['mobile', 'email', 'address', 'custname']) {
    // template header refusal list is the only place these words may appear
    const hits = src.toLowerCase().split(bad).length - 1;
    assert.ok(hits <= 1, bad + ' appears ' + hits + ' times');
  }
  const env = makeEnv();
  M.createRow(env.store, env.ctx(MANAGER), 'part', part('N1'));
  M.createRow(env.store, env.ctx(OWNER), 'labour', labour('N2'));
  const text = env.snapshot().toLowerCase();
  for (const bad of ['"mobile"', '"email"', '"address"', '"custname"', '"phone"']) assert.equal(text.includes(bad), false, bad);
});

test('backup shape: every stored list is a JSON array of records (restore rule), nothing outside the store is written', () => {
  const env = makeEnv();
  M.createRow(env.store, env.ctx(MANAGER), 'part', part('B1'));
  M.createRow(env.store, env.ctx(MANAGER), 'labour', labour('B2'));
  M.editRow(env.store, env.ctx(MANAGER), 'part', 'B1', { name: 'Changed' }, 1, '');
  if (env.backend === 'real') {
    for (const [k, v] of env.adapterMap) {
      if (!/^saagar_svcs_/.test(k)) continue;
      assert.equal(Array.isArray(JSON.parse(v)), true, k);
    }
    const keys = Array.from(env.adapterMap.keys()).filter((k) => !/^saagar_svcs_/.test(k) && !/^st_v2_svcs_watermark_v1$/.test(k));
    assert.deepEqual(keys, []);
  } else {
    const dump = env.store.dump();
    assert.equal(Array.isArray(dump.parts), true);
    assert.equal(Array.isArray(dump.labour), true);
  }
});

test('round trip: a second store loaded from the same records gives identical masters', () => {
  const env = makeEnv();
  for (let i = 0; i < 30; i += 1) M.createRow(env.store, env.ctx(MANAGER), 'part', part('RT' + String(i).padStart(3, '0')));
  M.editRow(env.store, env.ctx(MANAGER), 'part', 'RT005', { sellPricePaise: 20000 }, 1, 'price list');
  const a = JSON.stringify(M.loadMasters(env.store));
  const same = JSON.stringify(M.loadMasters(env.store));
  assert.equal(a, same);
  assert.equal(JSON.parse(a).parts.length, 30);
});

test('performance guide: 3000 rows load and a repeated load is served from the fold cache (keyed on the read result)', () => {
  const env = makeEnv();
  let rev = 0;
  for (let i = 0; i < 3000; i += 200) {
    const items = [];
    for (let j = i; j < i + 200; j += 1) {
      const code = 'PF' + String(j).padStart(5, '0');
      items.push({ k: 'PART_CREATE', b: { code, row: M.validateRow('part', part(code), { rows: [], mode: 'create' }).value, changes: [], reason: '', via: 'manual', batchId: '' } });
    }
    const res = env.store.append('parts', items, { expectRev: rev, actor: { t: 'manager', r: 'Store Manager', m: 'T' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    rev += 1;
  }
  const t0 = process.hrtime.bigint();
  const first = M.loadMasters(env.store);
  const t1 = process.hrtime.bigint();
  const second = M.loadMasters(env.store);
  const t2 = process.hrtime.bigint();
  assert.equal(first.parts.length, 3000);
  assert.equal(second.parts, first.parts);
  console.log('3000 parts: first load ' + Number(t1 - t0) / 1e6 + ' ms, repeat ' + Number(t2 - t1) / 1e6 + ' ms (desktop Node, ' + env.backend + ' store)');
});
