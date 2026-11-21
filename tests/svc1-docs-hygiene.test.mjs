// Service Stores docs layer: file rules from the wave plan (section 2.1), code and message tables.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Docs } from './lib/svc1-docs-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wwwDir = path.join(here, '..', 'www');
const file = path.join(wwwDir, 'service-stores-docs.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');

function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const noStrings = (t) => codeOnly(t).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

test('file hygiene: ASCII only, LF only, no BOM, one final newline', () => {
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'non-ASCII or control byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  console.log('service-stores-docs.js bytes: ' + buf.length);
});

test('UMD wrapper, frozen API, runs with no globals at all', () => {
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceStoresDocs = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(Docs), true);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.SaagarServiceStoresDocs.create, 'function');
  assert.equal(Object.keys(ctx.SaagarServiceStoresDocs).length, Object.keys(Docs).length);
  assert.equal(ctx.SaagarServiceStoresDocs.version, 1);
});

test('strict ES5: no arrows, let, const, template literals, classes, spread, async', () => {
  const t = noStrings(src);
  for (const [name, re] of [
    ['arrow', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['template', /`/], ['class', /\bclass\s/],
    ['spread', /\.\.\./], ['async', /\basync\b/], ['await', /\bawait\b/], ['yield', /\byield\b/]
  ]) assert.equal(re.test(t), false, name);
  for (const bad of ['.flat(', '.fill(', '.at(', 'padEnd(', 'padStart(', 'replaceAll(', 'structuredClone', 'Object.assign', 'Object.entries',
    'Object.values', '.includes(', '.startsWith(', '.endsWith(', '.repeat(', '.find(', '.findIndex(', 'Number.isInteger', 'Array.from', 'Math.imul', 'new Map', 'new Set', 'Symbol']) {
    assert.equal(t.includes(bad), false, bad);
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
  assert.equal(/\bST_/.test(src), false, 'no ST_ token');
  assert.equal(/new Date\(\s*\)/.test(src), false, 'no new Date() without an argument');
});

test('this layer only calls the store functions it needs, appends at known sites, never writes storage itself', () => {
  const t = codeOnly(src);
  const used = new Set();
  for (const m of t.matchAll(/\bstore\.(\w+)\(/g)) used.add(m[1]);
  assert.deepEqual(Array.from(used).sort(), ['append', 'findRef', 'head', 'nextAt', 'nextNumber', 'open']);
  assert.equal((t.match(/store\.append\(/g) || []).length, 3, 'postLedger, appendOne and appendOneAt');
  assert.equal(/\bsetItem\b|\bgetItem\b|\blocalStorage\b/.test(t), false);
});

test('names from older drafts and anything about customers are gone', () => {
  for (const gone of ['customerLabel', 'returnedTo', 'stockDocs', 'recoverPosting', 'repairLinks', 'sent_to_titan', 'gm_expenses', 'SERVICE_DELIVERED']) {
    assert.equal(src.includes(gone), false, gone);
  }
  for (const re of [/POSTING/, /ABANDONED/, /ports/]) assert.equal(re.test(src), false, String(re));
  for (const word of ['customername', 'mobile', 'phone', 'email', 'address']) assert.equal(src.toLowerCase().includes(word), false, word);
});

test('every code used in the source is in CODES, every code has an English message, messages avoid the banned words', () => {
  const t = codeOnly(src);
  const used = new Set();
  for (const m of t.matchAll(/\b(?:fail|lineFail)\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const m of t.matchAll(/\bno\('([A-Z][A-Z_]+)'\)/g)) used.add(m[1]);
  assert.ok(used.size > 30);
  for (const c of used) assert.ok(Docs.CODES[c] === c, 'code missing in CODES: ' + c);
  for (const [c, v] of Object.entries(Docs.CODES)) {
    assert.equal(v, c);
    assert.equal(typeof Docs.MESSAGES[c], 'string', c);
    assert.ok(Docs.MESSAGES[c].length > 8, c);
    assert.ok(/^[\x20-\x7e]+$/.test(Docs.MESSAGES[c]), c);
    assert.equal(/document|window/i.test(Docs.MESSAGES[c]), false, c);
  }
  assert.deepEqual(Object.keys(Docs.CODES).sort(), Object.keys(Docs.MESSAGES).sort());
  // the plan's list of docs codes is all there (minus the ones the plan removed)
  for (const c of ['SESSION_REQUIRED', 'NOT_ALLOWED', 'PIN_REQUIRED', 'SELF_APPROVAL', 'WRITEOFF_OWNER_ONLY', 'ABOVE_MANAGER_LIMIT', 'INPUT_INVALID',
    'BACKDATE_NOT_ALLOWED', 'LINES_REQUIRED', 'TOO_MANY_LINES', 'DUPLICATE_LINE', 'PART_UNKNOWN', 'PART_INACTIVE', 'QTY_INVALID', 'COST_REQUIRED',
    'UNIT_PRICE_INVALID', 'AMOUNT_MISMATCH', 'PAYMODE_INVALID', 'SUPPLIER_INVOICE_REQUIRED', 'SUPPLIER_INVOICE_DATE_INVALID',
    'DUPLICATE_SUPPLIER_INVOICE', 'JOB_NOT_FOUND', 'JOB_CLOSED', 'REASON_REQUIRED', 'REASON_INVALID', 'REASON_SIGN_MISMATCH', 'RETURN_REASON_INVALID',
    'DOC_NOT_FOUND', 'STATE_INVALID', 'NOT_REVERSIBLE', 'REVERSAL_BLOCKED', 'OPENING_ALREADY_SET', 'OPENING_PROPOSAL_OPEN', 'PART_HAS_MOVEMENTS',
    'INSUFFICIENT_STOCK', 'ISSUE_LINE_NOT_FOUND', 'RETURN_EXCEEDS_ISSUE', 'OLD_NOT_FOUND', 'OLD_TRANSITION_INVALID', 'OLD_NOTE_REQUIRED',
    'SIGNOFF_MONTH_OPEN', 'SIGNOFF_EMPTY', 'DEPS_INVALID', 'PAST_VIEW', 'OVERRIDE_NOTE_REQUIRED']) {
    assert.ok(Docs.CODES[c], c);
  }
  for (const c of ['PORTS_INVALID', 'SHARD_CORRUPT', 'SHARD_FULL', 'WRITE_FAILED', 'WRITE_VERIFY_FAILED', 'LEDGER_REFUSED', 'LEDGER_UNAVAILABLE',
    'RECOVERED_NO_MOVEMENTS', 'LINK_WRITE_FAILED', 'CONFIG_UNREADABLE']) {
    assert.equal(Docs.CODES[c], undefined, c + ' was removed by the plan');
  }
});

test('labels and tables that the screens show are exact', () => {
  assert.equal(Docs.OLD_STATES.HELD_FOR_CLAIM.label, 'Held for claim');
  assert.equal(Docs.OLD_STATES.CUSTOMER_RETURNED.label, 'Customer Returned');
  assert.equal(Docs.OLD_STATES.SCRAP_PENDING.label, 'Scrap pending Owner sign-off');
  assert.equal(Docs.OLD_STATES.SCRAPPED.label, 'Scrapped');
  assert.deepEqual(Object.keys(Docs.OLD_STATES), ['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED', 'SCRAP_PENDING', 'SCRAPPED']);
  assert.deepEqual(Object.keys(Docs.ADJ_REASONS), ['FOUND', 'COUNT_CORRECTION', 'WRONG_RECEIPT', 'DAMAGED', 'LOST', 'WRITE_OFF']);
  assert.deepEqual(Object.keys(Docs.RETURN_REASONS), ['UNUSED', 'WRONG_PART', 'JOB_CANCELLED']);
  assert.deepEqual(Object.values(Docs.PAY_MODES), ['Cash', 'UPI', 'Card', 'Other']);
  assert.deepEqual(Object.values(Docs.BILLING_MODES), ['Chargeable', 'Warranty']);
  assert.deepEqual(Object.keys(Docs.STATES), ['PROPOSED', 'POSTED', 'REJECTED', 'WITHDRAWN', 'REVERSED']);
  assert.equal(Docs.KINDS.OPN, 'Opening stock');
  assert.equal(Docs.KINDS.GRN, 'Goods receipt');
  assert.equal(Docs.KINDS.ISS, 'Issue to job');
  assert.equal(Docs.KINDS.RET, 'Return from job');
  assert.equal(Docs.KINDS.CSL, 'Counter sale');
  assert.equal(Docs.KINDS.ADJ, 'Adjustment');
  assert.equal(Docs.KINDS.SCR, 'Scrap sign-off');
  assert.deepEqual(Docs.SHELL_ROLES, ['Store Manager', 'Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others']);
  // the write-off reasons are exactly the three the design names
  assert.deepEqual(Object.entries(Docs.ADJ_REASONS).filter(([, v]) => v.klass === 'WRITEOFF').map(([k]) => k), ['DAMAGED', 'LOST', 'WRITE_OFF']);
});

test('A2 guard: no upper-case constant with the same name and value as one in another www file', () => {
  const defs = (text) => {
    const out = new Map();
    const re = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(?:(['"])([^'"\r\n]{1,200})\2|(-?\d+(?:\.\d+)?)\b)/g;
    for (const m of text.matchAll(re)) out.set(m[1], m[3] !== undefined ? 's:' + m[3] : 'n:' + m[4]);
    return out;
  };
  const mine = defs(src);
  assert.ok(mine.size >= 5);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : (/\.(js|html)$/.test(d.name) ? [path.join(dir, d.name)] : [])));
  for (const f of walk(wwwDir)) {
    if (f === file) continue;
    const other = defs(fs.readFileSync(f, 'utf8'));
    for (const [name, value] of mine) {
      assert.notEqual(other.get(name), value, `${name} also defined with the same value in ${path.relative(wwwDir, f)}`);
    }
  }
});
