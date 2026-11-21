// Service wave 2, governance T2: the file rules of PLAN-service-wave-2.md section 2.1 for the seven new www/service-billing-*.js files.
// Every rule is checked per file. A file that is not there yet makes its tests fail with "waiting on writers".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  REPO, BILLING, abs, exists, readText, readBuf, sizeOf, listFiles, parseScript, walk, sourceOf, blankComments, loadApi, bytesIssues
} from './lib/svc2-gov-common.mjs';

const require = createRequire(import.meta.url);

// Forbidden text, checked on the raw file text, comments included (plan 2.1). Boundaries stop false hits such as "retrieval(".
const FORBIDDEN = [
  ['postMessage', /postMessage/],
  ['ST_ token', /(^|[^A-Za-z0-9])ST_[A-Z0-9_]*/],
  ["addEventListener('message'", /addEventListener\s*\(\s*['"]message['"]/],
  ['document.write', /document\s*\.\s*write/],
  ["createElement('script')", /createElement\s*\(\s*['"]script['"]\s*\)/],
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
  ['localStorage', /localStorage/],
  ['setItem(', /setItem\s*\(/],
  ['getItem(', /getItem\s*\(/],
  ['removeItem(', /removeItem\s*\(/],
  ['safeSet(', /safeSet\s*\(/],
  ['store.set(', /\bstore\s*\.\s*set\s*\(/],
  ['saagar_svcs_', /saagar_svcs_/],
  ['st_v2_', /st_v2_/],
  ['gm_expenses', /gm_expenses/],
  ['SERVICE_DELIVERED', /SERVICE_DELIVERED/],
  ['stockDocs', /stockDocs/],
  ['custName', /custName/],
  ['custMobile', /custMobile/],
  ['custAddr', /custAddr/],
  ['custEmail', /custEmail/],
  // permission words (plan 2.1; analyser rule 4.3 of P7): case sensitive as the analyser reads the first group, insensitive for the last two classes
  ['SaagarReauth', /SaagarReauth/],
  ['SaagarOwnerSession', /SaagarOwnerSession/],
  ['isSuperAdmin', /isSuperAdmin/],
  ['ownerOnly', /ownerOnly/],
  ['ST_ACCESS_CONTEXT', /ST_ACCESS_CONTEXT/],
  ['SaagarAccess', /SaagarAccess/],
  ['accessContext', /accessContext/],
  ['canAccess', /canAccess/i],
  ['hasPermission', /hasPermission/i],
  ['requireRole', /requireRole/i],
  ['roleAllows', /roleAllows/i],
  ['prompt(', /(^|[^A-Za-z0-9_$.])prompt\s*\(/],
  ['confirm(', /(^|[^A-Za-z0-9_$.])confirm\s*\(/],
  ['alert(', /(^|[^A-Za-z0-9_$.])alert\s*\(/],
  ['debugger', /\bdebugger\b/]
];

// the same name filter the A2-04 audit uses (scripts/audit/audits/a2.mjs)
const A2_DOMAIN_NAME = /(?:KEY|STORE|PREFIX|VERSION|SCHEMA|CHANNEL|REPORT|ROLE|STATUS|TOLERANCE|LIMIT|MESSAGE|CODE|DATE|FORMAT|TYPE|MODE|POLICY)/;
const NOT_ES5 = new Set([
  'ArrowFunctionExpression', 'TemplateLiteral', 'TaggedTemplateExpression', 'ClassDeclaration', 'ClassExpression', 'ClassBody', 'SpreadElement',
  'RestElement', 'ObjectPattern', 'ArrayPattern', 'AssignmentPattern', 'ForOfStatement', 'AwaitExpression', 'YieldExpression', 'BigIntLiteral',
  'OptionalMemberExpression', 'OptionalCallExpression', 'ChainExpression', 'ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration',
  'MetaProperty', 'ClassMethod', 'ClassProperty'
]);
const BAD_METHODS = new Set(['flat', 'flatMap', 'fill', 'at', 'padEnd', 'replaceAll', 'getOwnPropertyDescriptors', 'includes']);
const BAD_METHODS_UI = new Set(['flat', 'flatMap', 'fill', 'at', 'padEnd', 'replaceAll', 'getOwnPropertyDescriptors']);
const BAD_GLOBAL_CALLS = new Set(['structuredClone']);
const PURE_BAD_IDENTS = new Set(['window', 'document', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'localStorage', 'navigator', 'location']);
// names that must never be declared by a billing file because another product file owns them (A2-04, plan 2.1)
const TAKEN_NAMES = ['SVCS_PREFIX', 'HEAD_KEY', 'CODE_PATTERN', 'INDIA_OFFSET_MS', 'MAX_LINES', 'MASTERS_VERSION', 'UI_VERSION', 'CORE_VERSION', 'SAVE_TEXT', 'FATAL_TEXT', 'STEP_UP_WINDOW_MS', 'VERSION'];

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

for (const entry of BILLING) {
  const kind = entry.pure ? 'pure' : 'screen';

  test(`T2 ${entry.key}: file hygiene, UMD wrapper, frozen API tail and size budget (${entry.budget})`, () => {
    const { src } = loadSource(entry);
    assert.deepEqual(bytesIssues(entry.file), [], entry.file + ' must be LF, no BOM, one final newline');
    assert.equal(readBuf(entry.file).some((b) => b > 0x7f), false, 'ASCII only');
    assert.ok(sizeOf(entry.file) <= entry.budget, `${entry.file} is ${sizeOf(entry.file)} bytes, budget ${entry.budget}`);
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
    assert.equal(/service-stores/i.test(entry.file), false, 'the name must not match /service-stores/i');
    new vm.Script(src, { filename: entry.file });
  });

  test(`T2 ${entry.key}: none of the forbidden strings`, () => {
    const { src } = loadSource(entry);
    const hits = [];
    for (const [name, re] of FORBIDDEN) if (re.test(src)) hits.push(name);
    assert.deepEqual(hits, [], entry.file + ' contains forbidden text');
  });

  test(`T2 ${entry.key}: syntax level (${entry.pure ? 'strict ES5' : 'no async, generators or classes; const, let, arrows and templates allowed'})`, () => {
    const { ast } = loadSource(entry);
    const hits = [];
    walk(ast, (n) => {
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ObjectMethod' || n.type === 'ArrowFunctionExpression') {
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

  test(`T2 ${entry.key}: only polyfilled methods (no flat, flatMap, fill, at, padEnd, replaceAll, structuredClone${entry.pure ? ', includes' : ''})`, () => {
    const { ast } = loadSource(entry);
    const bad = entry.pure ? BAD_METHODS : BAD_METHODS_UI;
    const hits = [];
    walk(ast, (n, parents) => {
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && bad.has(n.callee.property.name)) hits.push('.' + n.callee.property.name + '( at ' + n.start);
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && BAD_GLOBAL_CALLS.has(n.callee.name)) hits.push(n.callee.name + ' at ' + n.start);
      if (n.type === 'Identifier' && BAD_GLOBAL_CALLS.has(n.name) && isReference(n, parents)) hits.push(n.name + ' at ' + n.start);
      if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'Number' && n.property.name === 'isInteger') hits.push('Number.isInteger at ' + n.start);
      if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'Object' && n.property.name === 'assign') hits.push('Object.assign at ' + n.start);
      if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && /^(Map|Set|WeakMap|WeakSet|Symbol|Proxy)$/.test(n.callee.name) && entry.pure) hits.push('new ' + n.callee.name + ' at ' + n.start);
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

  test(`T2 ${entry.key}: loads under require and in a vm, exposes ${entry.global}, API frozen`, () => {
    loadSource(entry);
    const viaRequire = require(abs(entry.file));
    assert.ok(viaRequire && typeof viaRequire === 'object' && Object.keys(viaRequire).length > 0, 'module.exports holds the api');
    assert.equal(Object.isFrozen(viaRequire), true, 'the api object is frozen');
    const viaVm = loadApi(entry);
    assert.ok(viaVm, entry.global + ' is set on the global object');
    assert.deepEqual(Object.keys(viaVm).sort(), Object.keys(viaRequire).sort());
    if (entry.pure && entry.key !== 'calc') assert.equal(typeof viaVm.create, 'function', 'a pure layer exposes create (calc is a pure library; the screens expose mount)');
  });

  test(`T2 ${entry.key}: no customer or void-name tokens, no saveDB, no storage touch at all`, () => {
    const { ast, src } = loadSource(entry);
    const bad = new Set(['customerLabel', 'returnedTo', 'stockDocs', 'svcStoresLinkCase', 'custName', 'custMobile', 'custAddr', 'localStorage', 'sessionStorage', 'indexedDB']);
    const hits = [];
    walk(ast, (n) => {
      if (n.type === 'Identifier' && bad.has(n.name)) hits.push(n.name + ' at ' + n.start);
      if (n.type === 'StringLiteral' && /^(localStorage|setItem|getItem|removeItem|sessionStorage)$/.test(n.value)) hits.push('string "' + n.value + '" at ' + n.start);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && /^(setItem|getItem|removeItem|clear)$/.test(n.callee.property.name)) hits.push(n.callee.property.name + ' call at ' + n.start);
    });
    assert.deepEqual(hits, [], entry.file);
    assert.equal(/\bsaveDB\s*\(/.test(blankComments(src)), false, 'no saveDB call');
  });

  test(`T2 ${entry.key}: store.append only in docs and money; a file stem on every literal domain constant; no taken name`, () => {
    const { ast, src } = loadSource(entry);
    const appends = (blankComments(src).match(/\bstore\s*\.\s*append\s*\(/g) || []).length;
    if (entry.key === 'docs' || entry.key === 'money') assert.ok(appends >= 1, entry.file + ' is a writer layer and must call store.append');
    else assert.equal(appends, 0, entry.file + ' must not call store.append (migrate writes through docs.importLegacy; the facade writes nothing)');
    const wrong = [];
    walk(ast, (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !n.init) return;
      const name = n.id.name;
      if (TAKEN_NAMES.indexOf(name) !== -1) wrong.push(name + ' is taken by another product file');
      if (!/^[A-Z][A-Z0-9_]{2,}$/.test(name)) return;
      const literal = n.init.type === 'StringLiteral' || n.init.type === 'NumericLiteral';
      if (literal && A2_DOMAIN_NAME.test(name) && name.indexOf(entry.stem) !== 0) wrong.push(name + ' must start with ' + entry.stem);
    });
    assert.deepEqual(wrong, [], entry.file);
  });
}

test('T2 no storage write call in the whole wave-2 file set; the Phase 1 store keeps its one adapter write', () => {
  const missing = BILLING.filter((f) => !exists(f.file)).map((f) => f.file);
  assert.deepEqual(missing, [], 'waiting on writers');
  const touches = [];
  for (const entry of BILLING) {
    walk(parseScript(readText(entry.file)), (n) => {
      if (n.type === 'CallExpression') {
        const c = n.callee;
        const name = c.type === 'MemberExpression' && !c.computed ? c.property.name : (c.type === 'Identifier' ? c.name : '');
        if (/^(setItem|removeItem|safeSet|safeGet|safeRemove)$/.test(name)) touches.push(entry.file + ': ' + name);
        if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && /^store$/i.test(c.object.name) && c.property.name === 'set') touches.push(entry.file + ': store.set');
      }
    });
  }
  assert.deepEqual(touches, []);
  // the one real writer stays inside adapterFromWindow in the Phase 1 store
  const store = parseScript(readText('www/service-stores-store.js'));
  const sites = [];
  walk(store, (n, parents) => {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'setItem') {
      sites.push(parents.some((p) => p.type === 'FunctionDeclaration' && p.id && p.id.name === 'adapterFromWindow'));
    }
  });
  assert.deepEqual(sites, [true], 'exactly one setItem call in the store, inside adapterFromWindow');
});

test('T2 no code built from text and no other channel in any billing file: no Function constructor, EventSource, importScripts, workers or string timers', () => {
  const hits = [];
  for (const entry of BILLING) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    walk(parseScript(readText(entry.file)), (n, parents) => {
      if (n.type === 'Identifier' && /^(Function|EventSource|importScripts|SharedWorker|Worker|BroadcastChannel|MessageChannel)$/.test(n.name) && isReference(n, parents)) hits.push(entry.file + ': ' + n.name + ' at ' + n.start);
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && /^(setTimeout|setInterval)$/.test(n.callee.name) && n.arguments[0] && /StringLiteral|TemplateLiteral|BinaryExpression/.test(n.arguments[0].type)) hits.push(entry.file + ': string timer at ' + n.start);
    });
  }
  assert.deepEqual(hits, []);
});

test('T2 the literal saagar_svcs_ lives in index.html and the Phase 1 store only; no billing file holds it, not even in a comment', () => {
  const holders = [];
  for (const rel of listFiles('www', (r) => /\.(js|mjs|html|css|json)$/.test(r))) {
    if (readText(rel).indexOf('saagar_svcs_') !== -1) holders.push(rel);
  }
  // the integration bridge may hold it under amendment A-9 (one honest SVCM_PREFIX constant); no other file may
  const allowed = ['www/index.html', 'www/integration-bridge.js', 'www/service-stores-store.js'];
  assert.deepEqual(holders.filter((h) => allowed.indexOf(h) === -1), [], 'unexpected holders of the Stores prefix literal');
  for (const f of BILLING) if (exists(f.file)) assert.equal(holders.includes(f.file), false, f.file);
});

test('T2 constants: no UPPER_CASE domain constant of a billing file repeats a name and a literal value in another www file (A2-04 over the whole tree)', () => {
  const dup = [];
  const others = listFiles('www', (r) => /\.(js|mjs)$/.test(r) && !/service-billing-/.test(r));
  const texts = new Map(others.map((r) => [r, readText(r)]));
  for (const entry of BILLING) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    walk(parseScript(readText(entry.file)), (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !/^[A-Z][A-Z0-9_]{2,}$/.test(n.id.name) || !n.init) return;
      if (!A2_DOMAIN_NAME.test(n.id.name)) return;
      let lit = null;
      if (n.init.type === 'StringLiteral') lit = JSON.stringify(n.init.value).slice(1, -1);
      else if (n.init.type === 'NumericLiteral') lit = String(n.init.value);
      if (lit === null) return;
      const re = new RegExp('\\b' + n.id.name + '\\s*=\\s*[\'"]?' + lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]?\\s*[;,]');
      for (const [rel, text] of texts) if (re.test(text)) dup.push(n.id.name + ' in ' + entry.file + ' and ' + rel);
    });
    // and no duplicate inside the seven
  }
  const seen = new Map();
  for (const entry of BILLING) {
    walk(parseScript(readText(entry.file)), (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !/^[A-Z][A-Z0-9_]{2,}$/.test(n.id.name) || !n.init || !A2_DOMAIN_NAME.test(n.id.name)) return;
      const v = n.init.type === 'StringLiteral' ? 's:' + n.init.value : (n.init.type === 'NumericLiteral' ? 'n:' + n.init.value : null);
      if (v === null) return;
      const key = n.id.name + '=' + v;
      if (seen.has(key) && seen.get(key) !== entry.key) dup.push(key + ' in ' + seen.get(key) + ' and ' + entry.key);
      if (!seen.has(key)) seen.set(key, entry.key);
    });
  }
  assert.deepEqual(dup, []);
});

// ---------- the real A2 audit (duplicates and single authority) over the product tree plus the billing files ----------
test('T2 A2-01, A2-02, A2-04 and A2-05 have no finding that names one of the seven billing files', async () => {
  const missing = BILLING.filter((f) => !exists(f.file)).map((f) => f.file);
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
  const mine = BILLING.map((f) => f.file);
  const findings = [];
  for (const check of result.checks) {
    if (!['A2-01', 'A2-02', 'A2-04', 'A2-05'].includes(check.id)) continue;
    for (const ev of check.evidence || []) {
      const blob = JSON.stringify(ev);
      if (mine.some((m) => blob.indexOf(m) !== -1)) findings.push(check.id + ' ' + blob.slice(0, 200));
    }
  }
  assert.deepEqual(findings, [], 'duplicate function bodies, near copies or constants that involve the new files');
});

test('T2 the billing files stay disjoint from the page: no long function named esc, escapeHtml, fmtINR, todayIso, pad2 or toast', () => {
  const banned = ['esc', 'escapeHtml', 'fmtINR', 'todayIso', 'pad2', 'toast'];
  const hits = [];
  for (const entry of BILLING) {
    assert.ok(exists(entry.file), 'waiting on writers: ' + entry.file);
    const src = readText(entry.file);
    walk(parseScript(src), (n, parents) => {
      if (n.type === 'FunctionDeclaration' && n.id && banned.indexOf(n.id.name) !== -1 && parents.every((p) => p.type !== 'FunctionDeclaration')) {
        const body = sourceOf(src, n);
        if (body.length >= 160) hits.push(entry.file + ': ' + n.id.name + ' (' + body.length + ' chars)');
      }
    });
  }
  assert.deepEqual(hits, []);
});

test('T2 no function body of 160 or more characters is byte-identical in three product files (A2-01 helper rule, billing files vs the rest of www)', () => {
  const bodies = new Map();
  const add = (rel, src) => {
    let ast;
    try { ast = parseScript(src, { recover: true }); } catch { return; }
    walk(ast, (n) => {
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') {
        const t = sourceOf(src, n.body);
        if (t.length >= 160) { const k = t; if (!bodies.has(k)) bodies.set(k, new Set()); bodies.get(k).add(rel); }
      }
    });
  };
  for (const f of BILLING) { assert.ok(exists(f.file), 'waiting on writers: ' + f.file); add(f.file, readText(f.file)); }
  const mine = new Set(BILLING.map((f) => f.file));
  const hot = [...bodies.entries()].filter(([, s]) => [...s].some((x) => mine.has(x)));
  // compare against every other product js file
  for (const rel of listFiles('www', (r) => /\.js$/.test(r) && !mine.has(r) && !/vendor|\.min\./.test(r))) {
    const src = readText(rel);
    for (const [body, set] of hot) if (src.indexOf(body) !== -1) set.add(rel);
  }
  const triple = hot.filter(([, s]) => s.size >= 3).map(([b, s]) => [...s].join(' + ') + ' :: ' + b.slice(0, 60).replace(/\s+/g, ' '));
  assert.deepEqual(triple, []);
});
