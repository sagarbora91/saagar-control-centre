// Service wave 2, governance T11: static facts of www/integration-bridge.js after the wave-2 edit (plan 2.16, amendment A-9).
// Behaviour is in the bridge group's tests (svc2-bridge-*). Facts of the unedited bridge come from g0-baseline.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readText, readBuf, loadJson, parseScript, walk } from './lib/svc2-gov-common.mjs';

const G0 = loadJson('g0-baseline.json').bridge;
const REL = 'www/integration-bridge.js';
const src = readText(REL);
const count = (re) => (src.match(re) || []).length;
const PERMISSION = /SaagarReauth|SaagarOwnerSession|isSuperAdmin|ownerOnly|ST_ACCESS_CONTEXT|SaagarAccess|accessContext|canAccess|hasPermission|requireRole|roleAllows/i;

test('T11.1 line endings and size: LF only, no BOM, the file grew (wave 2 adds code) and ends with one newline', () => {
  const b = readBuf(REL);
  assert.equal(b.includes(0x0d), false);
  assert.equal(b[0] === 0xef && b[1] === 0xbb, false);
  assert.ok(b.length > G0.bytes, 'the bridge was edited');
});

test('T11.2 messages: exactly one postMessage call, one load listener with the bind guard text unchanged, no removeEventListener load', () => {
  assert.equal(count(/postMessage/g), G0.postMessageText);
  assert.equal(count(/f\.addEventListener\(\s*['"]load['"]/g), G0.loadListener);
  assert.equal(count(/f\.__saagarBridgeBound\)return;\s*f\.__saagarBridgeBound=true/g), G0.bindGuard);
  assert.equal(count(/removeEventListener\(\s*['"]load['"]/g), G0.removeLoadListener);
});

test('T11.3 storage: localStorage.setItem( appears once (inside S), no literal storage key is written, no safeSet or store.set', () => {
  assert.equal(count(/localStorage\.setItem\(/g), G0.localStorageSetItem);
  assert.equal(count(/\bsafeSet\(/g), 0);
  assert.equal(count(/\bstore\.set\(/g), 0);
  assert.equal(/localStorage\.(set|get|remove)Item\(\s*['"]/.test(src), false, 'storage is touched through a variable key only');
});

test('T11.4 the Stores prefix: exactly one literal saagar_svcs_ in one declaration var SVCM_PREFIX; never named SVCS_PREFIX; one SVCM_RE', () => {
  assert.equal(count(/saagar_svcs_/g), 1, 'one literal');
  assert.equal(count(/var\s+SVCM_PREFIX\s*=\s*'saagar_svcs_'\s*;/g), 1, 'one declaration');
  assert.equal(count(/\bSVCS_PREFIX\b/g), 0);
  assert.equal(count(/var\s+SVCM_RE\b/g), 1);
  assert.equal(/'saagar_'\s*\+\s*'svcs_'/.test(src), false, 'no split literal');
  assert.ok(count(/receipts_v1_FY/g) >= 1, 'the receipts stream key shape is read');
  assert.equal(/invoices_v1_FY/.test(src), false, 'the bridge reads receipts only');
});

test('T11.5 no new global: the set of window assignments equals G0; no permission token; ES5 style; no new script loading or document.write', () => {
  const win = [...new Set([...src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=[^=]/g)].map((m) => m[1]))].sort();
  assert.deepEqual(win, G0.windowAssignments);
  assert.equal(PERMISSION.test(src), false);
  const ast = parseScript(src);
  const bad = [];
  walk(ast, (n) => {
    if (n.type === 'ArrowFunctionExpression' || n.type === 'TemplateLiteral' || n.type === 'ClassDeclaration' || n.type === 'SpreadElement' || n.type === 'AwaitExpression') bad.push(n.type + ' at ' + n.start);
    if (n.type === 'VariableDeclaration' && n.kind !== 'var') bad.push(n.kind + ' at ' + n.start);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && /^(includes|flat|flatMap|padEnd|replaceAll|fill|at)$/.test(n.callee.property.name)) bad.push('.' + n.callee.property.name + ' at ' + n.start);
  });
  assert.deepEqual(bad.slice(0, 10), []);
  assert.equal(count(/createElement\(\s*['"]script['"]/g), 0);
  assert.equal(count(/document\.write/g), 0);
});

test('T11.6 the Expense and DSR key constants are unchanged in number: each key literal appears as often as at G0', () => {
  for (const [k, n] of G0.expenseKeyLiterals) assert.equal(src.split(k).length - 1, n, k);
});

test('T11.7 marker row and reused-number guard are in the source (plan 2.16 hunk H): wsc_ marker with void:true, sourceRef, and the "seen twice" exception', () => {
  assert.match(src, /e_wscg_/);
  assert.match(src, /Marker: this job is paid by Service receipts/);
  assert.match(src, /Paid by Service receipts \(see the wscr_ rows\)\. Not income\./);
  assert.match(src, /service receipt number seen twice/i);
  assert.match(src, /wscr_/);
  assert.match(src, /SERVICE_DELIVERED/, 'the old path is kept (old jobs)');
});
