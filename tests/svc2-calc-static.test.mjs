// Service wave 2, writer W-CALC: static and structure tests for www/service-billing-calc.js (P2 section 11 T111 to T125, PLAN 2.1, 2.18).
// Reads the file as text. Does not write anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Calc, srcText, srcBuf, CALC_PATH, ROOT, deepFreeze, clone, part, labour } from './lib/svc2-calc-load.mjs';

const SRC = srcText();

// Section 8.2 of the spec: every code it names, typed here by hand.
const SPEC_CODES = ('INPUT_INVALID, LINES_REQUIRED, TOO_MANY_LINES, LINE_KIND_INVALID, LINE_NAME_REQUIRED, LINE_NAME_INVALID, CODE_INVALID, HSN_REQUIRED, ' +
  'HSN_INVALID, SAC_REQUIRED, SAC_INVALID, RATE_REQUIRED, RATE_INVALID, BASIS_REQUIRED, BASIS_INVALID, PRICE_INVALID, QTY_INVALID, DISCOUNT_INVALID, ' +
  'DISCOUNT_EXCEEDS_LINE, NOCHARGE_HAS_DISCOUNT, REF_INVALID, LINE_TOO_LARGE, BILL_DISCOUNT_INVALID, DISCOUNT_EXCEEDS_BILL, BILL_TOO_LARGE, ' +
  'SELLER_STATE_INVALID, CUSTOMER_STATE_INVALID, GSTIN_FORMAT, GSTIN_STATE, GSTIN_CHECKSUM, GSTIN_STATE_MISMATCH, ALLOC_INVALID, AMOUNT_INVALID, ' +
  'PERCENT_INVALID, TARGET_INVALID, TARGET_ABOVE_TOTAL, TARGET_NOT_REACHABLE, BILL_RECORD_INVALID, CALC_VERSION_UNKNOWN, BILL_MISMATCH, ' +
  'APPROVAL_INVALID, CREDIT_BILL_INVALID, NOCHARGE_NO_CREDIT, CREDIT_PRIOR_INVALID, CREDIT_REQUEST_INVALID, CREDIT_LINE_UNKNOWN, ' +
  'CREDIT_DUPLICATE_LINE, CREDIT_LINE_NOCHARGE, CREDIT_KIND_CONFLICT, CREDIT_QTY_INVALID, CREDIT_TAXABLE_INVALID, CREDIT_EXCEEDS_LINE, ' +
  'CREDIT_EXCEEDS_TAXABLE, CREDIT_NOTHING, CREDIT_EXCEEDS_REMAINING, SETTLE_INVALID, CREDIT_EXCEEDS_INVOICE, REFUNDS_EXCEED_RECEIPTS, ' +
  'LEGACY_INVALID, LEGACY_QTY_FRACTION, INTERNAL_ERROR').split(/,\s*/);
const SPEC_WARNINGS = ['OTHER_LINE_PRESENT', 'PRICE_ZERO', 'RATE_UNUSUAL', 'ZERO_VALUE_BILL', 'OTHER_STATE_UNREGISTERED_INTRA', 'LEGACY_GST_BLANK'];

const FUNCTIONS = [
  'divRound', 'rupeesToPaise', 'paiseToRupeesText', 'percentToBp', 'percentOfPaise', 'gstinCheckChar', 'validateGstin', 'decideSupply',
  'allocateProportional', 'checkBillInput', 'computeBill', 'solveBillDiscount', 'verifyBill', 'approvalCheck', 'creditRemaining',
  'computeCreditNote', 'settle', 'legacyLinesToInput', 'fromLegacyFigs'
];
const OTHER_EXPORTS = ['CALC_VERSION', 'LIMITS', 'STATE_CODES', 'CODES', 'MESSAGES', 'GSTIN_CHECKSUM_HARD'];

// ---- T111 ----
test('T111: LF only, no BOM, one final newline, ASCII only, no tab, no trailing spaces', () => {
  const b = srcBuf();
  assert.ok(b.length > 1000);
  assert.notEqual(b[0], 0xef, 'no BOM');
  assert.equal(b.includes(13), false, 'no carriage return');
  assert.equal(b[b.length - 1], 10);
  assert.notEqual(b[b.length - 2], 10, 'exactly one final newline');
  assert.equal(b.some((x) => x > 127), false, 'ASCII only');
  assert.equal(b.includes(9), false, 'no tab');
  assert.equal(/[ ]+\n/.test(SRC), false, 'no trailing spaces');
});

// ---- T112 ----
test('T112: the wrapper of the Phase 1 pure files, the global, the frozen export and the version', () => {
  const docs = fs.readFileSync(path.join(ROOT, 'www', 'service-stores-docs.js'), 'utf8').split('\n');
  const mine = SRC.split('\n');
  assert.equal(mine[0], docs[0]);
  assert.equal(mine[1], docs[1]);
  assert.equal(mine[2], docs[2]);
  assert.equal(mine[3], '  if (root) root.SaagarServiceBillingCalc = api;');
  assert.equal(mine[4], docs[4]);
  assert.ok(SRC.includes('module.exports = api'));
  assert.ok(SRC.includes('return Object.freeze({'));
  assert.ok(SRC.includes("'use strict'"));
  assert.equal(Object.isFrozen(Calc), true);
  assert.equal(Calc.CALC_VERSION, 'SBC-1');
  // run the file the way the Service page does: a plain script, no module object, the global is set
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: CALC_PATH });
  assert.equal(typeof sandbox.SaagarServiceBillingCalc, 'object');
  assert.equal(sandbox.SaagarServiceBillingCalc.CALC_VERSION, 'SBC-1');
  assert.equal(sandbox.SaagarServiceBillingCalc.computeBill({ lines: [part()] }).totals.totalPaise, 118000);
  assert.equal(Object.keys(sandbox).sort().join(','), 'SaagarServiceBillingCalc,globalThis', 'nothing else leaks to the global');
});

// ---- T113, T114 ----
const ES5_BAN = [
  ['=>', /=>/], ['let', /\blet\b/], ['const', /\bconst\b/], ['backtick', /`/], ['class', /\bclass\b/], ['async', /\basync\b/],
  ['await', /\bawait\b/], ['spread', /\.\.\./], ['Promise', /\bPromise\b/], ['Symbol', /\bSymbol\b/], ['BigInt', /\bBigInt\b/],
  ['Object.assign', /Object\.assign/], ['Array.from', /Array\.from/], ['.includes(', /\.includes\(/], ['.padStart(', /\.padStart\(/],
  ['.padEnd(', /\.padEnd\(/], ['.startsWith(', /\.startsWith\(/], ['.endsWith(', /\.endsWith\(/], ['.flat(', /\.flat\(/],
  ['.flatMap(', /\.flatMap\(/], ['.fill(', /\.fill\(/], ['.at(', /\.at\(/], ['.replaceAll(', /\.replaceAll\(/],
  ['structuredClone', /structuredClone/], ['Number.isInteger', /Number\.isInteger/], ['Number.isSafeInteger', /Number\.isSafeInteger/],
  ['new Map', /new\s+Map\b/], ['new Set', /new\s+Set\b/], ['getOwnPropertyDescriptors', /getOwnPropertyDescriptors/],
  ['??', /\?\?/], ['?.', /\?\./], ['Reflect', /\bReflect\b/], ['Proxy', /\bProxy\b/], ['WeakMap', /\bWeakMap\b/]
];
test('T113: strict ES5, nothing a Chrome 44 tablet browser would refuse', () => {
  for (const [name, re] of ES5_BAN) assert.equal(re.test(SRC), false, 'found ' + name);
  // object shorthand, default parameters and destructuring are ES6: a cheap structural check
  assert.equal(/function\s*\w*\s*\([^)]*=[^)]*\)/.test(SRC), false, 'no default parameters');
  assert.equal(/\{\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\}\s*=/.test(SRC), false, 'no destructuring');
});
const PURITY_BAN = [
  ['Date', /\bDate\b/], ['Math.random', /Math\.random/], ['window', /\bwindow\b/], ['document', /\bdocument\b/], ['localStorage', /localStorage/],
  ['sessionStorage', /sessionStorage/], ['indexedDB', /indexedDB/], ['fetch', /\bfetch\b/], ['XMLHttpRequest', /XMLHttpRequest/],
  ['setTimeout', /\bsetTimeout\b/], ['setInterval', /\bsetInterval\b/], ['eval(', /\beval\s*\(/], ['new Function', /new\s+Function/],
  ['postMessage', /postMessage/], ['import(', /import\s*\(/], ['require(', /\brequire\s*\(/], ['document.write', /document\s*\.\s*write/],
  ['createElement', /createElement/], ['sendBeacon', /sendBeacon/], ['WebSocket', /WebSocket/], ['window.open', /window\.open/],
  ['http://', /http:\/\//], ['https://', /https:\/\//], ['setItem(', /setItem\(/], ['getItem(', /getItem\(/], ['removeItem(', /removeItem\(/],
  ['safeSet(', /safeSet\(/], ['store.set(', /store\.set\(/], ['saagar_svcs_', /saagar_svcs_/], ['st_v2_', /st_v2_/], ['gm_expenses', /gm_expenses/],
  ['SERVICE_DELIVERED', /SERVICE_DELIVERED/], ['stockDocs', /stockDocs/], ['custName', /custName/], ['custMobile', /custMobile/],
  ['custAddr', /custAddr/], ['custEmail', /custEmail/], ['SaagarReauth', /SaagarReauth/], ['SaagarOwnerSession', /SaagarOwnerSession/],
  ['isSuperAdmin', /isSuperAdmin/], ['ownerOnly', /ownerOnly/], ['ST_ACCESS_CONTEXT', /ST_ACCESS_CONTEXT/], ['SaagarAccess', /SaagarAccess/],
  ['accessContext', /accessContext/], ['canAccess', /canAccess/], ['hasPermission', /hasPermission/], ['requireRole', /requireRole/],
  ['roleAllows', /roleAllows/], ['prompt(', /\bprompt\s*\(/], ['confirm(', /\bconfirm\s*\(/], ['alert(', /\balert\s*\(/], ['debugger', /\bdebugger\b/],
  ["addEventListener('message'", /addEventListener\s*\(\s*['"]message['"]/], ['ST_ token', /(^|[^A-Za-z0-9])ST_[A-Z0-9_]+/],
  ['setItem-like storage word', /\bstorage\.(set|get|remove)/i], ['Math.round', /Math\.round/], ['toFixed', /toFixed/], ['parseFloat', /parseFloat/]
];
test('T114, T115, T123: purity, no storage, no customer fields, no float helpers (comments included)', () => {
  for (const [name, re] of PURITY_BAN) assert.equal(re.test(SRC), false, 'found ' + name);
  // the one place require could appear is the wrapper's module check, which does not call it
  assert.equal(/\brequire\b/.test(SRC), false);
});

// ---- T116 ----
test('T116: no empty catch, and the only catch returns the internal-error failure', () => {
  assert.equal(/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(SRC), false);
  const catches = SRC.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g) || [];
  assert.equal((SRC.match(/\bcatch\b/g) || []).length, catches.length, 'every catch has a simple body');
  assert.equal(catches.length, 1);
  assert.ok(/return fallback === undefined \? internalFail\(e\) : fallback;/.test(catches[0]));
  assert.ok(/function internalFail\(e\) \{\s*return fail\('INTERNAL_ERROR'/.test(SRC));
  assert.equal(/\bthrow\b/.test(SRC), false, 'the file never throws');
});

// ---- T117 ----
test('T117: CODES and MESSAGES', () => {
  const codes = Object.keys(Calc.CODES);
  assert.deepEqual(codes.slice().sort(), Object.keys(Calc.MESSAGES).slice().sort());
  for (const c of codes) {
    assert.equal(Calc.CODES[c], c);
    assert.equal(typeof Calc.MESSAGES[c], 'string');
    assert.ok(Calc.MESSAGES[c].length >= 10, c);
    assert.ok(/^[A-Z]/.test(Calc.MESSAGES[c]) && /\.$/.test(Calc.MESSAGES[c]), c + ' is a sentence');
    assert.equal(/undefined|null|NaN|\bobject\b|JSON|\bstring\b|\binteger\b|exception/i.test(Calc.MESSAGES[c]), false, c + ' has a technical word');
  }
  for (const c of SPEC_CODES.concat(SPEC_WARNINGS)) assert.ok(codes.includes(c), 'spec code missing: ' + c);
  assert.equal(codes.length, SPEC_CODES.length + SPEC_WARNINGS.length, 'no code beyond the spec list');
  assert.equal(new Set(codes).size, codes.length);
  // every failure code is used somewhere beyond the list and the message table (quoted in the logic)
  for (const c of codes) {
    const uses = (SRC.match(new RegExp("'" + c + "'", 'g')) || []).length;
    assert.ok(uses >= 2, c + ' is declared but never used (' + uses + ' quoted occurrences)');
  }
  assert.equal(Object.isFrozen(Calc.CODES), true);
  assert.equal(Object.isFrozen(Calc.MESSAGES), true);
});

// ---- T118 ----
function circular() { const o = { lines: [] }; o.self = o; o.lines.push(o); return o; }
const BAD_ARGS = [
  undefined, null, 0, -1, '', 'abc', {}, [], 1e308, NaN, Infinity, true, circular(),
  { get lines() { throw new Error('boom'); } },
  { get kind() { throw new Error('boom'); }, get qty() { throw new Error('boom'); } },
  new Proxy({}, { ownKeys() { throw new Error('boom'); }, getPrototypeOf() { throw new Error('boom'); }, get() { throw new Error('boom'); } }),
  { lines: [{ get kind() { throw new Error('boom'); } }] }
];
test('T118: every exported function is total and returns its documented failure shape', () => {
  for (const name of FUNCTIONS) {
    const fn = Calc[name];
    for (let i = 0; i < BAD_ARGS.length; i += 1) {
      for (const args of [[BAD_ARGS[i]], [BAD_ARGS[i], BAD_ARGS[(i + 3) % BAD_ARGS.length]], [BAD_ARGS[i], BAD_ARGS[(i + 5) % BAD_ARGS.length], BAD_ARGS[(i + 7) % BAD_ARGS.length]], []]) {
        let r;
        assert.doesNotThrow(() => { r = fn.apply(null, args); }, name + ' threw on argument ' + i);
        if (name === 'divRound') assert.ok(r === null || Number.isInteger(r), name);
        else if (name === 'gstinCheckChar') assert.equal(typeof r, 'string');
        else if (name === 'paiseToRupeesText') assert.equal(typeof r, 'string');
        else {
          assert.equal(typeof r, 'object', name);
          assert.equal(typeof r.ok, 'boolean', name + ' ' + JSON.stringify(r));
          if (!r.ok) {
            assert.ok(Object.prototype.hasOwnProperty.call(Calc.CODES, r.code), name + ' gave an unknown code ' + r.code);
            assert.equal(r.message, Calc.MESSAGES[r.code]);
          }
        }
      }
    }
  }
  // the exact documented fallbacks
  assert.equal(Calc.divRound(undefined, undefined), null);
  assert.equal(Calc.gstinCheckChar(undefined), '');
  assert.equal(Calc.paiseToRupeesText(circular()), '');
  const g = Calc.computeBill({ get lines() { throw new Error('boom'); } });
  assert.equal(g.ok, false);
  assert.equal(g.code, 'INTERNAL_ERROR');
  assert.equal(g.detail.error, 'boom');
  assert.equal(g.message, Calc.MESSAGES.INTERNAL_ERROR);
});

// ---- T119 ----
test('T119: no function changes its input (deep-frozen inputs give ok results)', () => {
  const lines = [part({ unitPricePaise: 50000, qty: 3 }), labour()];
  const input = deepFreeze({ lines, billDiscountPaise: 1000, recipientGstin: '29LMNOP4321D1ZR' });
  const bill = Calc.computeBill(input);
  assert.equal(bill.ok, true);
  const frozenBill = deepFreeze(clone(bill));
  assert.equal(Calc.checkBillInput(input).ok, true);
  assert.equal(Calc.verifyBill(frozenBill).ok, true);
  assert.equal(Calc.solveBillDiscount(deepFreeze({ lines: clone(lines) }), 100000).ok, true);
  const note = Calc.computeCreditNote(frozenBill, deepFreeze({ kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }), deepFreeze([]));
  assert.equal(note.ok, true);
  const frozenNote = deepFreeze(clone(note));
  assert.equal(Calc.creditRemaining(frozenBill, deepFreeze([frozenNote])).ok, true);
  assert.equal(Calc.computeCreditNote(frozenBill, deepFreeze({ kind: 'FULL' }), deepFreeze([frozenNote])).ok, true);
  assert.equal(Calc.settle(deepFreeze({ payablePaise: 100, receiptsPaise: [50], refundsPaise: [], creditTotalPaise: 10 })).ok, true);
  assert.equal(Calc.decideSupply(deepFreeze({ recipientGstin: '29LMNOP4321D1ZR' })).ok, true);
  assert.equal(Calc.approvalCheck(deepFreeze({ approvedPaise: 5, totalPaise: 5 })).ok, true);
  assert.equal(Calc.allocateProportional(5, deepFreeze([3, 3])).ok, true);
  assert.equal(Calc.legacyLinesToInput(deepFreeze([{ desc: 'A', qty: '1', unit: '5', total: '5' }]), '18').ok, true);
  assert.equal(Calc.fromLegacyFigs(deepFreeze({ taxable: 1, gst: 1, cgst: 1, sgst: 0, total: 2 })).ok, true);
  // results are fresh objects: changing one never reaches the next call
  const a = Calc.computeBill(input);
  a.lines[0].qty = 7;
  assert.equal(Calc.computeBill(input).lines[0].qty, 3);
  assert.equal(Object.isFrozen(a), false);
});

// ---- T120, T121, T122, T125 ----
test('T120: LIMITS are the limits of section 2.2', () => {
  assert.deepEqual(Object.assign({}, Calc.LIMITS), { maxLines: 100, maxQty: 9999, maxLinePaise: 50000000, maxBillPaise: 90000000, maxNameChars: 80, maxRefChars: 60 });
  assert.equal(Object.isFrozen(Calc.LIMITS), true);
});
test('T121: STATE_CODES has 01 to 38, 97 and 99 and nothing else', () => {
  assert.equal(Calc.STATE_CODES.length, 40);
  assert.equal(Calc.STATE_CODES[0], '01');
  assert.equal(Calc.STATE_CODES[37], '38');
  assert.deepEqual(Array.from(Calc.STATE_CODES).slice(38), ['97', '99']);
  assert.equal(Calc.STATE_CODES.includes('27'), true);
});
test('T122, T125: the exports are exactly section 8 (19 functions and six values)', () => {
  assert.deepEqual(Object.keys(Calc).sort(), FUNCTIONS.concat(OTHER_EXPORTS).sort());
  for (const f of FUNCTIONS) assert.equal(typeof Calc[f], 'function', f);
  assert.equal(FUNCTIONS.length, 19);
  assert.equal(Object.keys(Calc).filter((k) => typeof Calc[k] === 'function').length, 19);
  assert.equal(Calc.GSTIN_CHECKSUM_HARD, true);
});

// ---- T124 and the plan rules for names ----
test('T124: the file stays inside its byte budget of PLAN 2.1', () => {
  assert.ok(srcBuf().length < 60000, 'size ' + srcBuf().length);
});
test('A2-04: every upper-case constant uses the SBC_ stem and re-declares no name of another www file', () => {
  const decl = [...SRC.matchAll(/\b(?:var|function)\s+([A-Z][A-Z0-9_]+)\b/g)].map((m) => m[1]);
  assert.ok(decl.length > 10);
  for (const d of decl) assert.ok(d.startsWith('SBC_'), d + ' lacks the SBC_ stem');
  for (const banned of ['SVCS_PREFIX', 'HEAD_KEY', 'CODE_PATTERN', 'INDIA_OFFSET_MS', 'MAX_LINES', 'MAX_QTY', 'MAX_NAME_CHARS', 'LIMITS_VERSION']) {
    assert.equal(new RegExp('\\b(var|function)\\s+' + banned + '\\b').test(SRC), false, banned);
  }
  assert.equal(/\b(var|function)\s+[A-Z0-9_]*_VERSION\b/.test(SRC.replace(/SBC_CALC_VERSION/g, '')), false);
});
test('A2-01: no run of lines of 160 characters or more is byte-identical in two other product files (three files together)', () => {
  const www = path.join(ROOT, 'www');
  const others = fs.readdirSync(www).filter((f) => /^service-(stores|billing)-.*\.js$/.test(f) && f !== 'service-billing-calc.js')
    .map((f) => fs.readFileSync(path.join(www, f), 'utf8'));
  const mine = SRC.split('\n');
  const bad = [];
  for (let i = 0; i + 4 <= mine.length; i += 1) {
    const win = mine.slice(i, i + 4).join('\n');
    if (win.length < 160 || mine.slice(i, i + 4).some((l) => l.trim().length < 2)) continue;
    const hits = others.filter((t) => t.includes(win)).length;
    if (hits >= 2) bad.push(i + 1);
  }
  assert.deepEqual(bad, []);
});
test('the file keeps customer details out and says no pan, no old field names', () => {
  assert.equal(/\bpan\b/i.test(SRC), false);
  assert.equal(/customerGstin|customerStateCode/.test(SRC), false);
  assert.equal(/\brecipientGstin\b/.test(SRC), true);
  assert.equal(/\brecipientStateCode\b/.test(SRC), true);
  assert.equal(/\bfirm\b|\bgstin\s*:\s*['"]\d/.test(SRC), false, 'no firm block and no GSTIN literal');
});
