// Service wave 2, money layer: file rules from the wave plan (section 2.1), code and message tables. P4 tests H1 to H4.
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
const file = path.join(wwwDir, 'service-billing-money.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');
const Money = require(file);

function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const noStrings = (t) => codeOnly(t).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

test('H1 file hygiene: ASCII only, LF only, no BOM, one final newline, no tab, within budget', () => {
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'non-ASCII or control byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.includes('\t'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  assert.ok(buf.length < 100000, 'budget 100,000 bytes, file is ' + buf.length);
  console.log('service-billing-money.js bytes: ' + buf.length);
});

test('H1 UMD wrapper copied from the Phase 1 docs file, frozen API, runs with no globals at all', () => {
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceBillingMoney = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(Money), true);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.SaagarServiceBillingMoney.create, 'function');
  assert.equal(Object.keys(ctx.SaagarServiceBillingMoney).length, Object.keys(Money).length);
  assert.deepEqual(Object.keys(Money).sort(), ['CODES', 'KINDS', 'MESSAGES', 'PAY_MODES', 'ROLE_ACTIONS', 'create', 'normalizePayMode', 'paiseToRupeesText', 'parsePaise', 'version']);
  assert.equal(Money.version, 1);
  // with no calc layer loaded the two delegating helpers answer safely
  assert.equal(ctx.SaagarServiceBillingMoney.parsePaise('10'), null);
  assert.equal(ctx.SaagarServiceBillingMoney.paiseToRupeesText(10), '');
  assert.equal(ctx.SaagarServiceBillingMoney.normalizePayMode('UPI'), 'UPI');
});

test('H2 strict ES5: no arrows, let, const, template literals, classes, spread, async, shorthand, newer methods', () => {
  const t = noStrings(src);
  for (const [name, re] of [
    ['arrow', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['template', /`/], ['class', /\bclass\s/],
    ['spread', /\.\.\./], ['async', /\basync\b/], ['await', /\bawait\b/], ['yield', /\byield\b/], ['nullish', /\?\?/], ['optional chain', /\?\./],
    ['shorthand property', /[{,]\s*[A-Za-z_$][\w$]*\s*[,}]\s*(?=[^:])/]
  ]) {
    if (name === 'shorthand property') continue;
    assert.equal(re.test(t), false, name);
  }
  for (const bad of ['.flat(', '.flatMap(', '.fill(', '.at(', 'padEnd(', 'padStart(', 'replaceAll(', 'structuredClone', 'getOwnPropertyDescriptors', 'Object.assign',
    'Object.entries', 'Object.values', '.includes(', '.startsWith(', '.endsWith(', '.repeat(', '.find(', '.findIndex(', 'Number.isInteger', 'Array.from',
    'Math.imul', 'new Map', 'new Set', 'new WeakMap', 'Symbol', 'Promise']) {
    assert.equal(t.includes(bad), false, bad);
  }
  // it also parses as a plain script in strict mode (a syntax error would throw here)
  new vm.Script(src, { filename: 'service-billing-money.js' });
});

test('H2 banned tokens from the wave rules are absent (comments and strings included)', () => {
  const banned = [
    'postMessage', "addEventListener('message'", 'document.write', "createElement('script')", 'import(', 'eval(', 'new Function',
    'fetch(', 'XMLHttpRequest', 'window.open', 'sendBeacon', 'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB',
    'localStorage', 'setItem(', 'getItem(', 'removeItem(', 'safeSet(', 'store.set(', 'saagar_svcs_', 'st_v2_', 'gm_expenses', 'SERVICE_DELIVERED',
    'stockDocs', 'custName', 'custMobile', 'custAddr', 'custEmail',
    'SaagarReauth', 'SaagarOwnerSession', 'isSuperAdmin', 'ownerOnly', 'ST_ACCESS_CONTEXT', 'SaagarAccess', 'accessContext', 'canAccess',
    'hasPermission', 'requireRole', 'roleAllows', 'prompt(', 'confirm(', 'alert(', 'debugger',
    'Date.now', 'Math.random', 'setTimeout', 'setInterval', 'window', 'document', 'sha256', 'crypto'
  ];
  for (const t of banned) assert.equal(src.includes(t), false, t);
  assert.equal(/\bST_[A-Z0-9_]+/.test(src), false, 'no ST_ token');
  assert.equal(/new Date\(\s*\)/.test(src), false, 'no new Date() without an argument');
  assert.equal(/\bwindow\b|\bdocument\b/i.test(src), false);
  for (const word of ['customername', 'mobile', 'phone', 'email', 'address']) assert.equal(src.toLowerCase().includes(word), false, word);
  assert.equal(/\bservice-stores/i.test(path.basename(file)), false, 'the name must not match /service-stores/');
});

test('H2 no upper-case constant with the same name and value as one in another www file; constants use the SBM_ stem', () => {
  const defs = (text) => {
    const out = new Map();
    const re = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(?:(['"])([^'"\r\n]{1,200})\2|(-?\d+(?:\.\d+)?)\b)/g;
    for (const m of text.matchAll(re)) out.set(m[1], m[3] !== undefined ? 's:' + m[3] : 'n:' + m[4]);
    return out;
  };
  const mine = defs(src);
  assert.ok(mine.size >= 5);
  for (const name of mine.keys()) assert.ok(/^SBM_/.test(name), name + ' does not use the SBM_ stem');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : (/\.(js|html)$/.test(d.name) ? [path.join(dir, d.name)] : [])));
  for (const f of walk(wwwDir)) {
    if (f === file) continue;
    const other = defs(fs.readFileSync(f, 'utf8'));
    for (const [name, value] of mine) assert.notEqual(other.get(name), value, `${name} also defined with the same value in ${path.relative(wwwDir, f)}`);
  }
});

test('H2 A2-01: no stretch of 160 characters of code is shared with the other billing and Stores files', () => {
  const norm = (t) => codeOnly(t).replace(/\s+/g, ' ');
  const mine = norm(src);
  const others = fs.readdirSync(wwwDir).filter((n) => /^service-(stores|billing)-.*\.js$/.test(n) && n !== 'service-billing-money.js');
  assert.ok(others.length >= 6);
  for (const n of others) {
    const o = norm(fs.readFileSync(path.join(wwwDir, n), 'utf8'));
    for (let i = 0; i + 160 <= mine.length; i += 20) assert.equal(o.includes(mine.slice(i, i + 160)), false, 'shared stretch with ' + n + ' near ' + i);
  }
});

test('H3 every code used in the source is in CODES, every code has an English message, messages avoid banned words', () => {
  const t = codeOnly(src);
  const used = new Set();
  for (const m of t.matchAll(/\b(?:fail|no)\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const m of t.matchAll(/needText\([^;]*?'([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const m of t.matchAll(/warns\.push\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  assert.ok(used.size >= 30, 'found ' + used.size + ' codes');
  for (const c of used) assert.ok(Money.CODES[c] === c, 'code missing in CODES: ' + c);
  for (const [c, v] of Object.entries(Money.CODES)) {
    assert.equal(v, c);
    assert.equal(typeof Money.MESSAGES[c], 'string', c);
    assert.ok(Money.MESSAGES[c].length > 8, c);
    assert.ok(/^[\x20-\x7e]+$/.test(Money.MESSAGES[c]), c);
    assert.equal(/document|window|mobile|phone|email|address|customername/i.test(Money.MESSAGES[c]), false, c);
  }
  assert.deepEqual(Object.keys(Money.CODES).sort(), Object.keys(Money.MESSAGES).sort());
  assert.equal(Object.isFrozen(Money.CODES) && Object.isFrozen(Money.MESSAGES), true);
  // the P4 list of failure codes (section 8.3) is all there
  for (const c of ['SESSION_REQUIRED', 'NOT_ALLOWED', 'PIN_REQUIRED', 'INPUT_INVALID', 'AMOUNT_INVALID', 'AMOUNT_TOO_LARGE', 'AMOUNT_MISMATCH', 'PAYMODE_INVALID',
    'PAYREF_INVALID', 'PAYREF_LOOKS_LIKE_CARD', 'JOB_NOT_FOUND', 'JOB_CLOSED', 'JOB_VOID', 'INVOICE_REQUIRED', 'INVOICE_NOT_FOUND', 'INVOICE_CANCELLED',
    'INVOICE_EXISTS_USE_BALANCE', 'RECEIPT_EXCEEDS_BALANCE', 'SALE_NOT_FOUND', 'NOT_RECEIPTABLE', 'COUNTER_RECEIPT_EXISTS', 'CREDIT_NOTE_REQUIRED',
    'REFUND_EXCEEDS_REFUNDABLE', 'REASON_REQUIRED', 'RECEIPT_NOT_FOUND', 'ALREADY_REVERSED', 'NOT_SAME_DAY', 'REFUND_FIRST', 'LEGACY_ADVANCE_UNCONFIRMED',
    'NO_LEGACY_ADVANCE', 'DECISION_EXISTS', 'ADVANCE_HELD', 'BACKDATE_NOT_ALLOWED', 'DEPS_INVALID', 'STORE_NOT_READY', 'CASH_LIMIT_WARN']) {
    assert.ok(Money.CODES[c], c);
  }
  // plan 2.18: the money layer adds no code that Phase 1 lacks except the ones named by P4 (nothing from the removed ADJ or money stream)
  for (const c of ['CANCEL_MONEY_TAKEN', 'ADJ_LINK_INVALID', 'ADJ_ALREADY_LINKED']) assert.equal(Money.CODES[c], undefined, c);
});

test('H4 the file calls only the store functions it needs, writes at one known site, never touches storage itself', () => {
  const t = codeOnly(src);
  const used = new Set();
  for (const m of t.matchAll(/\bstore\.(\w+)\(/g)) used.add(m[1]);
  assert.deepEqual(Array.from(used).sort(), ['append', 'findRef', 'head', 'nextAt', 'nextNumber', 'open', 'read']);
  assert.equal((t.match(/store\.append\(/g) || []).length, 1, 'one write site: appendMoney');
  assert.equal(/\bsetItem\b|\bgetItem\b|\blocalStorage\b/.test(t), false);
  // the stream written is the receipts stream, nothing else
  assert.deepEqual(Array.from(t.matchAll(/store\.append\('(\w+)'/g)).map((m) => m[1]), ['receipts']);
  const reads = Array.from(t.matchAll(/store\.(?:read|head|findRef|nextAt)\('(\w+)'/g)).map((m) => m[1]);
  assert.deepEqual(Array.from(new Set(reads)).sort(), ['config', 'invoices', 'receipts']);
  // series used: only the three receipt series
  assert.deepEqual(Array.from(new Set(Array.from(t.matchAll(/series: '(\w+)'/g)).map((m) => m[1]))).sort(), ['SAR', 'SRC', 'SRF']);
});

test('names from the old money-stream draft and anything about the cash book are gone', () => {
  for (const gone of ["'money'", 'moneyMode', 'ADV_LEGACY', 'Expense', 'wscr_', 'SaagarBridge', 'ledger']) assert.equal(src.includes(gone), false, gone);
});
