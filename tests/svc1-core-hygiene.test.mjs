// tests/svc1-core-hygiene.test.mjs
// File rules of plan 2.1 for www/service-stores-core.js, and the facts the capability ledger needs (measured here, not guessed).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CoreLib } from './lib/svc1-core-kit.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'www', 'service-stores-core.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');

function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const noStrings = (text) => text.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

test('H01 file hygiene: ASCII only, LF only, no BOM, one final newline', () => {
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'non-ASCII or control byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  console.log('service-stores-core.js bytes: ' + buf.length);
});

test('H02 UMD wrapper, one global, frozen API', () => {
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceStoresCore = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(CoreLib), true);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.deepEqual(Object.keys(ctx).sort(), ['SaagarServiceStoresCore']);
  assert.equal(typeof ctx.SaagarServiceStoresCore.create, 'function');
  assert.equal(ctx.SaagarServiceStoresCore.version, 1);
  assert.deepEqual(Object.keys(CoreLib).sort(), ['CODES', 'MESSAGES', 'OLD_LABELS', 'REPORT_TYPES', 'create', 'version']);
});

test('H03 strict ES5 by syntax tree: no arrow, let, const, template, class, spread, rest, async, generator, for-of', () => {
  const parser = require('@babel/parser');
  const ast = parser.parse(src, { sourceType: 'script', errorRecovery: false });
  const bad = new Set(['ArrowFunctionExpression', 'TemplateLiteral', 'ClassDeclaration', 'ClassExpression', 'SpreadElement', 'RestElement',
    'ForOfStatement', 'AwaitExpression', 'YieldExpression', 'OptionalMemberExpression', 'OptionalCallExpression', 'ObjectPattern', 'ArrayPattern',
    'AssignmentPattern', 'BigIntLiteral', 'TaggedTemplateExpression', 'ImportDeclaration', 'ExportNamedDeclaration', 'NewExpression:Map']);
  const found = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n.type === 'string') {
      if (bad.has(n.type)) found.push(n.type);
      if (n.type === 'VariableDeclaration' && n.kind !== 'var') found.push('declaration ' + n.kind);
      if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && (n.async || n.generator)) found.push('async/generator');
      if (n.type === 'ObjectProperty' && (n.shorthand || n.computed)) found.push('shorthand/computed property');
      if (n.type === 'ObjectMethod') found.push('object method');
      if (n.type === 'NewExpression' && n.callee && (n.callee.name === 'Map' || n.callee.name === 'Set' || n.callee.name === 'Promise')) found.push('new ' + n.callee.name);
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'start' && k !== 'end') walk(n[k]);
  })(ast.program);
  assert.deepEqual(found, []);
  const code = noStrings(codeOnly(src));
  for (const bad2 of ['.flat(', '.fill(', '.at(', 'padEnd(', 'padStart(', 'replaceAll(', 'structuredClone', 'Object.assign', 'Object.entries', 'Object.values', '.includes(',
    '.startsWith(', '.endsWith(', '.repeat(', '.find(', '.findIndex(', 'Number.isInteger', 'Array.from', 'Math.imul', 'Symbol', 'Promise', '.finally(']) {
    assert.equal(code.includes(bad2), false, bad2);
  }
});

test('H04 banned tokens of the wave rules are absent (comments and strings included)', () => {
  const banned = [
    'postMessage', "addEventListener('message'", 'document.write', "createElement('script')", 'import(', 'eval(', 'new Function',
    'fetch(', 'XMLHttpRequest', 'window.open', 'sendBeacon', 'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB',
    'localStorage', 'removeItem', 'custName', 'custMobile', 'custAddr', 'Date.now', 'Math.random', 'setTimeout', 'setInterval',
    'requestAnimationFrame', 'saagar_svcs_', 'setItem', 'safeSet(', 'store.set(', '.append(', 'window', 'document', 'sha256', 'SHA-256', 'crypto',
    'ST_', 'console.', 'debugger', 'alert(', 'prompt(', 'confirm(', 'navigator', 'location', 'addEventListener', 'MutationObserver'
  ];
  for (const t of banned) assert.equal(src.includes(t), false, t);
  assert.equal(/new Date\(\s*\)/.test(src), false, 'new Date() without an argument');
});

test('H05 capability facts: no storage write, no listener, no timer, no clock of its own', () => {
  const code = noStrings(codeOnly(src));
  assert.equal((code.match(/\.setItem\b/g) || []).length, 0);
  assert.equal((code.match(/\.append\b/g) || []).length, 0);
  assert.equal((code.match(/\.acknowledgeRestore\(/g) || []).length, 1, 'the single store call for the restore acknowledgement');
  assert.equal((code.match(/\bthrow\b/g) || []).length, 0);
  // the same counts the A3 failure-posture row takes
  const a3 = (re) => [...src.matchAll(re)].length;
  assert.equal(a3(/\bcatch\s*(?:\([^)]*\))?\s*\{/g), 8, 'catch blocks');
  assert.equal(a3(/\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\s*)?\}/g), 0, 'no swallowed catch block');
  assert.equal(a3(/\bthrow\s+(?:new\s+)?[A-Za-z_$]/g), 0, 'no throw site');
  for (const re of [/\bSaagarReauth\b/, /\b(?:SaagarOwnerSession|isSuperAdmin|ownerOnly)\b/i, /\b(?:ST_ACCESS_CONTEXT|SaagarAccess|accessContext)\b/, /\b(?:canAccess|hasPermission|requireRole|roleAllows)\b/i]) {
    assert.equal(re.test(src), false, 'no A3 permission token: ' + re);
  }
  const calls = new Set((code.match(/\bstore\.([A-Za-z]+)\(/g) || []).map((x) => x.slice(6, -1)));
  assert.deepEqual(Array.from(calls).sort(), ['acknowledgeRestore', 'head', 'read', 'status']);
  console.log('core: catch blocks=' + (code.match(/\bcatch\b/g) || []).length + ', return null=' + (code.match(/return null/g) || []).length +
    ', return false=' + (code.match(/return false/g) || []).length + ', listeners=0, timers=0, storage writes=0');
});

test('H06 only one new global and no UPPER_CASE constant name used by the sibling files', () => {
  const names = (text) => new Set((text.match(/\bvar ([A-Z][A-Z0-9_]{3,}) =/g) || []).map((x) => x.slice(4, -2)));
  const mine = names(src);
  for (const sib of ['service-stores-store.js', 'service-stores-fifo.js', 'service-stores-masters.js', 'service-stores-docs.js']) {
    const p = path.join(here, '..', 'www', sib);
    if (!fs.existsSync(p)) continue;
    const other = names(fs.readFileSync(p, 'utf8'));
    for (const n of mine) assert.equal(other.has(n), false, n + ' also declared in ' + sib);
  }
  assert.ok(mine.size > 10);
});

test('H07 every failure code of the core has an English message and the message is plain text', () => {
  const codes = Object.keys(CoreLib.CODES);
  assert.ok(codes.length >= 15);
  assert.deepEqual(Object.keys(CoreLib.MESSAGES).sort(), codes.slice().sort());
  for (const c of codes) {
    assert.equal(CoreLib.CODES[c], c);
    assert.match(CoreLib.MESSAGES[c], /^[A-Z][^<>`]{8,120}\.$/, c);
  }
  assert.ok(Object.isFrozen(CoreLib.CODES) && Object.isFrozen(CoreLib.MESSAGES));
});

test('H08 the core names no customer field and handles no secret', () => {
  assert.equal(/custName|custMobile|custAddr|customerName|mobile|phone|e-mail|password|passcode|482915/i.test(src), false);
  assert.equal(/\b(pin|pinAt|passcode|password|secret|token)\b/.test(src), false, 'no PIN value, password or token is read or kept');
});
