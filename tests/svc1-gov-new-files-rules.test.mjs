// Service wave 1, governance T2: the file rules of PLAN-service-wave-1.md section 2.1 for all seven new www files.
// Every rule is checked per file. A file that is not there yet makes its tests fail with "waiting on writers".
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  SEVEN, abs, exists, readText, readBuf, sizeOf, listFiles, parseScript, walk, sourceOf, blankComments, loadApi, bytesIssues
} from './lib/svc1-gov-common.mjs';

const require = createRequire(import.meta.url);

// Forbidden text, checked on the raw file text, comments included (PLAN 2.1). Word boundaries stop false hits such as "retrieval(".
const FORBIDDEN = [
  ['postMessage', /postMessage/],
  ['ST_ token', /(^|[^A-Za-z0-9])ST_[A-Z0-9_]*/],
  ["addEventListener('message'", /addEventListener\s*\(\s*['"]message['"]/],
  ['document.write', /document\s*\.\s*write/],
  ['createElement script', /createElement\s*\(\s*['"]script['"]\s*\)/],
  ['import(', /\bimport\s*\(/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['window.open', /window\s*\.\s*open\b/],
  ['sendBeacon', /sendBeacon/],
  ['WebSocket', /WebSocket/],
  ['http://', /http:\/\//],
  ['https://', /https:\/\//],
  ['sessionStorage', /sessionStorage/],
  ['indexedDB', /indexedDB/],
  ['localStorage.removeItem/clear', /localStorage\s*\.\s*(removeItem|clear)\b/],
  ['custName', /custName/],
  ['custMobile', /custMobile/],
  ['custAddr', /custAddr/]
];

// the same name filter the A2-04 audit uses (scripts/audit/audits/a2.mjs)
const A2_DOMAIN_NAME = /(?:KEY|STORE|PREFIX|VERSION|SCHEMA|CHANNEL|REPORT|ROLE|STATUS|TOLERANCE|LIMIT|MESSAGE|CODE|DATE|FORMAT|TYPE|MODE|POLICY)/;
const BUDGET_BYTES = { pure: 120000, screen: 160000 }; // R-9 of P7, raise only with a reason in the writer report
// Per-file raise under the R-9 rule: ui-writer.md "Size budget" gives the reason (nine tabs, nine dialogs, the job panel, the
// 191-code English error table and 293 labels in one file). Pinned at the ui writer's own 190,000; every other file keeps R-9.
const FILE_BUDGET_BYTES = { 'www/service-stores-ui.js': 190000 };
const NOT_ES5 = new Set([
  'ArrowFunctionExpression', 'TemplateLiteral', 'TaggedTemplateExpression', 'ClassDeclaration', 'ClassExpression', 'ClassBody', 'SpreadElement',
  'RestElement', 'ObjectPattern', 'ArrayPattern', 'AssignmentPattern', 'ForOfStatement', 'AwaitExpression', 'YieldExpression', 'BigIntLiteral',
  'OptionalMemberExpression', 'OptionalCallExpression', 'ChainExpression', 'ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration',
  'MetaProperty', 'ClassMethod', 'ClassProperty'
]);
const BAD_METHODS = new Set(['flat', 'flatMap', 'fill', 'at', 'padEnd', 'replaceAll', 'getOwnPropertyDescriptors']);
const BAD_GLOBAL_CALLS = new Set(['structuredClone']);
const PURE_BAD_IDENTS = new Set(['window', 'document', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'localStorage', 'navigator', 'location']);

function isReference(node, parents) {
  const p = parents[parents.length - 1];
  if (!p) return true;
  if ((p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === node && !p.computed) return false;
  if ((p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && p.key === node && !p.computed) return false;
  if (p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') return false;
  return true;
}

function loadSource(entry) {
  assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file + ' is not there yet');
  const src = readText(entry.file);
  return { src, ast: parseScript(src) };
}

for (const entry of SEVEN) {
  const kind = entry.pure ? 'pure' : 'screen';

  test(`T2 ${entry.key}: file hygiene, UMD wrapper and size`, () => {
    const { src } = loadSource(entry);
    assert.deepEqual(bytesIssues(entry.file), [], entry.file + ' must be LF, no BOM, one final newline');
    const budget = Object.prototype.hasOwnProperty.call(FILE_BUDGET_BYTES, entry.file) ? FILE_BUDGET_BYTES[entry.file] : BUDGET_BYTES[kind];
    assert.ok(sizeOf(entry.file) <= budget, `${entry.file} is ${sizeOf(entry.file)} bytes, budget ${budget}`);
    const lines = src.split('\n');
    assert.equal(lines[0], '(function (root, factory) {');
    assert.equal(lines[1], '  var api = factory();');
    assert.equal(lines[2], "  if (typeof module === 'object' && module.exports) module.exports = api;");
    assert.equal(lines[3], `  if (root) root.${entry.global} = api;`);
    assert.equal(lines[4], "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
    assert.ok(src.includes("  'use strict';"), 'use strict inside the factory');
    assert.ok(src.endsWith('\n  });\n});\n'), 'the factory ends by returning a frozen object');
    assert.match(src, /return Object\.freeze\(\{/);
    assert.equal(/\t/.test(src), false, 'no tab characters');
    assert.equal(/\bdebugger\b/.test(src), false);
    new vm.Script(src, { filename: entry.file });
  });

  test(`T2 ${entry.key}: none of the forbidden strings`, () => {
    const { src } = loadSource(entry);
    const hits = [];
    for (const [name, re] of FORBIDDEN) if (re.test(src)) hits.push(name);
    assert.deepEqual(hits, [], entry.file + ' contains forbidden text');
  });

  test(`T2 ${entry.key}: syntax level (${entry.pure ? 'strict ES5' : 'no async, generators or classes'})`, () => {
    const { ast } = loadSource(entry);
    const hits = [];
    walk(ast, (n) => {
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ObjectMethod') {
        if (n.async) hits.push('async function at ' + n.start);
        if (n.generator) hits.push('generator at ' + n.start);
      }
      if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression' || n.type === 'AwaitExpression' || n.type === 'YieldExpression') hits.push(n.type + ' at ' + n.start);
      if (entry.pure) {
        if (NOT_ES5.has(n.type)) hits.push(n.type + ' at ' + n.start);
        if (n.type === 'VariableDeclaration' && n.kind !== 'var') hits.push(n.kind + ' at ' + n.start);
        if (n.type === 'ObjectProperty' && (n.shorthand || n.computed)) hits.push('shorthand or computed property at ' + n.start);
        if (n.type === 'ObjectMethod' && n.kind === 'method') hits.push('method shorthand at ' + n.start);
        if (n.type === 'LogicalExpression' && n.operator === '??') hits.push('?? at ' + n.start);
        if (n.type === 'BinaryExpression' && n.operator === '**') hits.push('** at ' + n.start);
        if (n.type === 'AssignmentExpression' && /^(\*\*|\?\?|&&|\|\|)=$/.test(n.operator)) hits.push(n.operator + ' at ' + n.start);
        if (n.type === 'RegExpLiteral' && /[suyd]/.test(n.flags)) hits.push('regexp flags at ' + n.start);
        if (n.type === 'NumericLiteral' && /^0[bBoO]|_/.test(n.extra && n.extra.raw || '')) hits.push('numeric form at ' + n.start);
      }
    });
    assert.deepEqual(hits.slice(0, 10), [], entry.file);
  });

  test(`T2 ${entry.key}: only polyfilled methods`, () => {
    const { ast } = loadSource(entry);
    const hits = [];
    walk(ast, (n, parents) => {
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && BAD_METHODS.has(n.callee.property.name)) hits.push('.' + n.callee.property.name + '( at ' + n.start);
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && BAD_GLOBAL_CALLS.has(n.callee.name)) hits.push(n.callee.name + ' at ' + n.start);
      if (n.type === 'Identifier' && BAD_GLOBAL_CALLS.has(n.name) && isReference(n, parents)) hits.push(n.name + ' at ' + n.start);
    });
    assert.deepEqual(hits, [], entry.file);
  });

  if (entry.pure) {
    test(`T2 ${entry.key}: pure file has no clock, random, timers, window or document`, () => {
      const { ast } = loadSource(entry);
      const hits = [];
      walk(ast, (n, parents) => {
        if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier') {
          if (n.object.name === 'Date' && n.property.name === 'now') hits.push('Date.now at ' + n.start);
          if (n.object.name === 'Math' && n.property.name === 'random') hits.push('Math.random at ' + n.start);
        }
        if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date' && n.arguments.length === 0) hits.push('new Date() at ' + n.start);
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date') hits.push('Date() at ' + n.start);
        if (n.type === 'Identifier' && PURE_BAD_IDENTS.has(n.name) && isReference(n, parents)) hits.push(n.name + ' at ' + n.start);
      });
      assert.deepEqual(hits, [], entry.file + ' must take time from an injected now()');
    });
  }

  test(`T2 ${entry.key}: loads under require and in a vm, exposes ${entry.global}`, () => {
    loadSource(entry);
    const viaRequire = require(abs(entry.file));
    assert.ok(viaRequire && typeof viaRequire === 'object' && Object.keys(viaRequire).length > 0, 'module.exports holds the api');
    assert.equal(Object.isFrozen(viaRequire), true, 'the api object is frozen');
    const viaVm = loadApi(entry);
    assert.ok(viaVm, entry.global + ' is set on the global object');
    assert.deepEqual(Object.keys(viaVm).sort(), Object.keys(viaRequire).sort());
  });

  test(`T2 ${entry.key}: no customer or void-name tokens`, () => {
    const { ast, src } = loadSource(entry);
    const bad = new Set(['customerLabel', 'returnedTo', 'stockDocs', 'svcStoresLinkCase', 'custName', 'custMobile', 'custAddr']);
    const hits = [];
    walk(ast, (n) => {
      if (n.type === 'Identifier' && bad.has(n.name)) hits.push(n.name + ' at ' + n.start);
    });
    assert.deepEqual(hits, [], entry.file);
    assert.equal(/\bsaveDB\s*\(/.test(blankComments(src)), false, 'no saveDB call (C-PAGE-1)');
  });
}

test('T2 exactly one storage write site in the whole wave, inside adapterFromWindow in the store', () => {
  const sites = [];
  const other = [];
  for (const entry of SEVEN) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    const ast = parseScript(readText(entry.file));
    walk(ast, (n, parents) => {
      if (n.type !== 'CallExpression') return;
      const c = n.callee;
      const name = c.type === 'MemberExpression' && !c.computed ? c.property.name : (c.type === 'Identifier' ? c.name : '');
      if (name === 'setItem' && c.type === 'MemberExpression') {
        const inAdapter = parents.some((p) => p.type === 'FunctionDeclaration' && p.id && p.id.name === 'adapterFromWindow');
        const viaLocalStorage = c.object.type === 'MemberExpression' && !c.object.computed && c.object.property.name === 'localStorage';
        if (viaLocalStorage) sites.push({ file: entry.file, inAdapter });
        else other.push(entry.file);
      }
      if (name === 'safeSet' || (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && /^store$/i.test(c.object.name) && c.property.name === 'set')) other.push(entry.file + ':' + name);
      if (c.type === 'MemberExpression' && !c.computed && (c.property.name === 'removeItem')) other.push(entry.file + ':removeItem');
    });
  }
  assert.equal(sites.length, 1, 'exactly one localStorage.setItem call: ' + JSON.stringify(sites));
  assert.equal(sites[0].file, 'www/service-stores-store.js');
  assert.equal(sites[0].inAdapter, true, 'it sits inside adapterFromWindow');
  assert.deepEqual(other.filter((f) => !/^www\/service-stores-store\.js$/.test(f)), [], 'no other write call in the other six files');
});

// Audit hardening (gov-audit): the test above lets the store hold a second write through an alias (`var ls = win.localStorage; ls.setItem(..)`),
// a computed name (`x['setItem']`) or a removeItem. Here every storage touch in all seven files is pinned to adapterFromWindow.
test('T2 every storage touch in the seven files sits inside adapterFromWindow: one setItem call, no alias, no computed name, no removeItem', () => {
  const setItemCalls = [];
  const outside = [];
  for (const entry of SEVEN) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    const src = readText(entry.file);
    const ast = parseScript(src);
    walk(ast, (n, parents) => {
      const inAdapter = entry.key === 'store' && parents.some((p) => p.type === 'FunctionDeclaration' && p.id && p.id.name === 'adapterFromWindow');
      const at = entry.file + ' at ' + n.start;
      if (n.type === 'StringLiteral' && /^(localStorage|setItem|removeItem|sessionStorage)$/.test(n.value)) outside.push('string "' + n.value + '" ' + at);
      if (n.type === 'Identifier' && n.name === 'localStorage' && !inAdapter) {
        const p = parents[parents.length - 1];
        const isKey = p && (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && p.key === n && !p.computed;
        if (!isKey) outside.push('localStorage ' + at);
      }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) {
        const nm = n.callee.property.name;
        if (nm === 'setItem') {
          const obj = n.callee.object;
          const direct = obj.type === 'MemberExpression' && !obj.computed && obj.property.name === 'localStorage';
          setItemCalls.push({ file: entry.file, inAdapter, direct });
        }
        if (nm === 'removeItem') outside.push('removeItem call ' + at);
      }
    });
  }
  assert.deepEqual(outside, [], 'storage reached outside adapterFromWindow');
  assert.deepEqual(setItemCalls, [{ file: 'www/service-stores-store.js', inAdapter: true, direct: true }], 'exactly one setItem call in the wave, win.localStorage.setItem inside adapterFromWindow');
});

test('T2 no code built from text and no other channel: no Function constructor, EventSource, importScripts or string timers', () => {
  const hits = [];
  for (const entry of SEVEN) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    walk(parseScript(readText(entry.file)), (n, parents) => {
      if (n.type === 'Identifier' && /^(Function|EventSource|importScripts|SharedWorker|Worker|BroadcastChannel|MessageChannel)$/.test(n.name) && isReference(n, parents)) hits.push(entry.file + ': ' + n.name + ' at ' + n.start);
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && /^(setTimeout|setInterval)$/.test(n.callee.name) && n.arguments[0] && /StringLiteral|TemplateLiteral|BinaryExpression/.test(n.arguments[0].type)) hits.push(entry.file + ': string timer at ' + n.start);
    });
  }
  assert.deepEqual(hits, []);
});

test('T2 SVCS_PREFIX is declared once in the store; the literal appears in no other www file but index.html', () => {
  assert.ok(exists('www/service-stores-store.js'));
  const storeSrc = readText('www/service-stores-store.js');
  const ast = parseScript(storeSrc);
  let decls = 0;
  let literals = 0;
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'SVCS_PREFIX') decls += 1;
    if (n.type === 'StringLiteral' && n.value.indexOf('saagar_svcs_') !== -1) literals += 1;
  });
  assert.equal(decls, 1, 'SVCS_PREFIX declared once');
  assert.equal(literals, 1, 'the prefix literal appears once as code in the store');
  let wm = 0;
  walk(ast, (n) => { if (n.type === 'StringLiteral' && n.value === 'st_v2_svcs_watermark_v1') wm += 1; });
  assert.equal(wm, 1, 'the watermark key string appears once as code in the store');
  const holders = [];
  const decl = [];
  const watermark = [];
  for (const rel of listFiles('www', (r) => /\.(js|mjs|html|css|json)$/.test(r))) {
    const t = readText(rel);
    if (t.indexOf('saagar_svcs_') !== -1) holders.push(rel);
    if (/\bSVCS_PREFIX\s*=/.test(t)) decl.push(rel);
    if (t.indexOf('st_v2_svcs_watermark_v1') !== -1) watermark.push(rel);
  }
  assert.deepEqual(holders.sort(), ['www/index.html', 'www/integration-bridge.js', 'www/service-stores-store.js']);
  assert.deepEqual(decl, ['www/service-stores-store.js']);
  assert.deepEqual(watermark, ['www/service-stores-store.js']);
});

test('T2 CODE_PATTERN is declared in the masters file only (A2-04)', () => {
  const owners = [];
  for (const entry of SEVEN) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    walk(parseScript(readText(entry.file)), (n) => {
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'CODE_PATTERN') owners.push(entry.key);
    });
  }
  assert.deepEqual(owners, ['masters']);
});

test('T2 pure files take their key names and constants from one place: no UPPER_CASE constant repeats a name and value across the seven', () => {
  const seen = new Map();
  const dup = [];
  for (const entry of SEVEN) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    walk(parseScript(readText(entry.file)), (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !/^[A-Z][A-Z0-9_]{2,}$/.test(n.id.name) || !n.init) return;
      if (!A2_DOMAIN_NAME.test(n.id.name)) return;
      let value = null;
      if (n.init.type === 'StringLiteral') value = 's:' + n.init.value;
      else if (n.init.type === 'NumericLiteral') value = 'n:' + n.init.value;
      if (value === null) return;
      const key = n.id.name + '=' + value;
      if (seen.has(key) && seen.get(key) !== entry.key) dup.push(key + ' in ' + seen.get(key) + ' and ' + entry.key);
      if (!seen.has(key)) seen.set(key, entry.key);
    });
  }
  assert.deepEqual(dup, []);
});

// ---------- the real A2 audit (duplicates and single authority) over the product tree plus the seven files ----------
test('T2 A2-01, A2-04 and A2-05 have no finding that names one of the seven files', async () => {
  const missing = SEVEN.filter((f) => !exists(f.file)).map((f) => f.file);
  assert.deepEqual(missing, [], 'waiting on writers');
  const mod = await import(new URL('../scripts/audit/audits/a2.mjs', import.meta.url));
  const productFiles = listFiles('www', (r) => /\.(html?|js|mjs)$/i.test(r)).sort();
  const manifest = require(abs('www/module-manifest.js'));
  const modules = manifest.modules.map((m) => {
    const file = 'www/' + String(m.src).replace(/\\/g, '/').replace(/^\.?\//, '');
    return Object.assign({}, m, { file, html: readText(file) });
  });
  const context = Object.freeze({ root: path.resolve(abs('.')), productFiles, modules, sharedAssets: manifest.sharedAssets, read: (f) => readText(f), exists: (f) => exists(f) });
  const result = await mod.run(context);
  const mine = new Set(SEVEN.map((f) => f.file));
  const findings = [];
  for (const check of result.checks) {
    if (!['A2-01', 'A2-04', 'A2-05'].includes(check.id)) continue;
    for (const ev of check.evidence || []) {
      const names = [ev.path].concat(ev.authoritySites || []).filter(Boolean);
      if (names.some((s) => [...mine].some((m) => String(s).indexOf(m) === 0))) findings.push(check.id + ' ' + JSON.stringify(ev).slice(0, 200));
    }
  }
  assert.deepEqual(findings, [], 'duplicate function bodies or constants that involve the new files');
});

test('T2 the seven files stay disjoint from the shell: no copied helper names from the Service page', () => {
  // R-6: the esc/fmtINR/todayIso/pad2 family must be taken from deps or written under another name.
  const banned = ['esc', 'escapeHtml', 'fmtINR', 'todayIso', 'pad2', 'toast'];
  const hits = [];
  for (const entry of SEVEN) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    walk(parseScript(readText(entry.file)), (n, parents) => {
      if (n.type === 'FunctionDeclaration' && n.id && banned.indexOf(n.id.name) !== -1 && parents.every((p) => p.type !== 'FunctionDeclaration')) {
        // allowed only when it is a tiny alias that forwards to an injected helper
        const body = sourceOf(readText(entry.file), n);
        if (body.length >= 160) hits.push(entry.file + ': ' + n.id.name + ' (' + body.length + ' chars)');
      }
    });
  }
  assert.deepEqual(hits, []);
});
