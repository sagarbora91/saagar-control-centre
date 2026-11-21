// Service wave 2, billing core facade: file rules, exports, create arguments, wiring over the shared store,
// the billing port (set once), the session and PIN providers (DEF-1), status.
// Expected values are typed by hand from plan 2.1, 2.9 and 2.10, not copied from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import {
  BillingCore, Calc, Money, Masters, Store, build, readSource, CORE_FILE, makeFakeDocs, OWNER, MANAGER, TECH, NONE, good, refused, ref
} from './lib/svc2-core-kit.mjs';

const require = createRequire(import.meta.url);

test('file rules: ASCII, LF, no BOM, one final newline, no tab, within the 120,000 byte budget', () => {
  const buf = fs.readFileSync(CORE_FILE);
  const src = buf.toString('utf8');
  assert.notEqual(buf[0], 0xef);
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'bad byte ' + b);
  assert.equal(src.includes('\r'), false);
  assert.equal(src.includes('\t'), false);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  assert.ok(buf.length < 120000, 'file is ' + buf.length + ' bytes');
  assert.equal(/service-stores/i.test(CORE_FILE.replace(/^.*[\\/]/, '')), false);
  console.log('service-billing-core.js bytes: ' + buf.length);
});

test('UMD head copied from the Phase 1 docs file; frozen API; runs with no globals at all', () => {
  const src = readSource();
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceBillingCore = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(BillingCore), true);
  assert.deepEqual(Object.keys(BillingCore).sort(), ['CODES', 'MESSAGES', 'PRINT_TYPES', 'create', 'version']);
  assert.equal(BillingCore.version, 1);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.SaagarServiceBillingCore.create, 'function');
});

test('the ten print types, exactly the plan names', () => {
  assert.deepEqual([...BillingCore.PRINT_TYPES].sort(), [
    'serviceAdvancesHeld', 'serviceBillSummary', 'serviceCreditNote', 'serviceDaySummary', 'serviceReceipt', 'serviceRefundVoucher',
    'serviceRevenue', 'serviceTaxInvoiceV2', 'serviceUnbilledIssues', 'serviceWarrantySheet'
  ]);
  assert.equal(BillingCore.PRINT_TYPES.length, 10);
  assert.equal(Object.isFrozen(BillingCore.PRINT_TYPES), true);
});

test('every code has plain English text; the three core codes of plan 2.18 exist', () => {
  for (const c of ['BCORE_ARGS_INVALID', 'BCORE_LIBS_MISSING', 'BCORE_INTERNAL']) assert.equal(BillingCore.CODES[c], c);
  for (const [code, text] of Object.entries(BillingCore.MESSAGES)) {
    assert.equal(BillingCore.CODES[code], code);
    assert.ok(text.length > 12, code);
    assert.equal(/[—–]/.test(text), false, code + ' has a dash character');
  }
  assert.deepEqual(Object.keys(BillingCore.CODES).sort(), Object.keys(BillingCore.MESSAGES).sort());
});

test('create: arguments are checked, nothing is half built, and a failure names the field', () => {
  const ok = build({ docs: 'fake', migrate: null });
  assert.equal(ok.res.ok, true, JSON.stringify(ok.res));
  const base = ok.args;
  assert.equal(BillingCore.create(null).code, 'BCORE_ARGS_INVALID');
  assert.equal(BillingCore.create(undefined).code, 'BCORE_ARGS_INVALID');
  for (const bad of [undefined, null, 5, {}, { store: {} }]) {
    const r = BillingCore.create({ ...base, share: bad });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BCORE_ARGS_INVALID');
    assert.equal(r.detail, 'share');
  }
  for (const [key, detail] of [['calc', 'calc'], ['docsLib', 'docs'], ['moneyLib', 'money'], ['masters', 'masters']]) {
    const r = BillingCore.create({ ...base, [key]: undefined });
    assert.equal(r.ok, false, key);
    assert.equal(r.code, 'BCORE_LIBS_MISSING', key);
    assert.equal(r.detail, detail);
  }
  assert.equal(BillingCore.create({ ...base, cases: {} }).detail, 'cases');
  assert.equal(BillingCore.create({ ...base, now: 'x' }).detail, 'now');
  assert.equal(BillingCore.create({ ...base, session: 'x' }).detail, 'session');
  assert.equal(BillingCore.create({ ...base, stepUpAt: 5 }).detail, 'stepUpAt');
});

test('create over one share handle sets the billing port once: a second create over the same handle fails closed', () => {
  const e = build({ docs: 'fake', migrate: null });
  assert.equal(e.res.ok, true);
  const again = BillingCore.create({ ...e.args, docsLib: makeFakeDocs() });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'BCORE_INTERNAL');
  assert.equal(again.detail, 'billingPort');
  // and the handle itself refuses a third party who tries to replace the target
  const r = e.handle.setBillingPort({ creditReturn: () => ({ ok: true }), saleReversible: () => ({ ok: true }) });
  assert.equal(r.ok, false);
});

test('a failing docs or money create makes create fail and leaves the port unset', () => {
  const e = build({ docs: 'fake', migrate: null });
  // a fresh environment whose docs library refuses its deps
  const e2 = build({ docs: 'fake', migrate: null, args: { docsLib: { create: () => ({ ok: false, code: 'DEPS_INVALID' }) } } });
  assert.equal(e2.res.ok, false);
  assert.equal(e2.res.code, 'BCORE_INTERNAL');
  assert.equal(e2.res.detail, 'docs');
  // port still free: a later good create works over the same handle
  const later = BillingCore.create({ ...e2.args, docsLib: makeFakeDocs() });
  assert.equal(later.ok, true, JSON.stringify(later));
  assert.ok(e);
});

test('wiring: docs gets the shared store, the Phase 1 docs as stock, a money read port, calc, masters, cases and the clock', () => {
  const e = build({ docs: 'fake', migrate: null });
  const d = e.docsLib.deps;
  assert.equal(d.store, e.handle.store);
  assert.equal(d.stock, e.handle.docs);
  assert.equal(d.calc, Calc);
  assert.equal(d.masters, Masters);
  assert.equal(d.cases, e.cases);
  assert.equal(d.now, e.clock.now);
  assert.equal(d.money.stream, 'receipts');
  for (const n of ['ready', 'jobMoney', 'hasLiveReceipt', 'saleMoney', 'receiptView', 'listReceipts']) assert.equal(typeof d.money[n], 'function', n);
  assert.equal(Object.isFrozen(d.money), true);
  // the money port reads the real money layer: no records yet
  e.cases.add('WS-1');
  const jm = d.money.jobMoney('WS-1');
  assert.equal(jm.ok, true, JSON.stringify(jm));
  assert.equal(jm.netPaise, 0);
});

test('wiring: the bill layer index is opened by the first call, once, never by a replay hook of its own', () => {
  const e = build({ docs: 'fake', migrate: null });
  assert.equal(e.docsLib.openCalls, 0, 'create alone opens nothing');
  e.core.status();
  assert.equal(e.docsLib.openCalls, 1);
  e.core.status();
  e.cases.add('WS-1');
  e.core.jobHasRecords('WS-1');
  assert.equal(e.docsLib.openCalls, 1);
});

test('DEF-1: with a session provider the session in ctx is ignored', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  e.as(TECH);
  // the caller claims to be the Owner; the provider says Technician, who may not take money
  const r = e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, { session: OWNER, clientRef: ref() });
  refused(r, 'NOT_ALLOWED');
  e.as(NONE);
  refused(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, { session: OWNER }), 'SESSION_REQUIRED');
  refused(e.core.getJob('WS-1', { session: OWNER }), 'SESSION_REQUIRED');
});

test('DEF-1: with no provider the session comes from ctx', () => {
  const e = build({ docs: 'fake', migrate: null, provider: false });
  e.cases.add('WS-1');
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, { session: MANAGER, clientRef: ref() }));
  refused(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, {}), 'SESSION_REQUIRED');
  refused(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, { session: NONE }), 'SESSION_REQUIRED');
});

test('DEF-1: a PIN stamp counts only when the provider time is 0 to 120,000 ms old; a made-up stamp in ctx proves nothing', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  const adv = () => good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 100000, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  adv();
  const refund = (ctx) => e.core.refund({ jobId: 'WS-1', amountPaise: 1000, payMode: 'Cash', reason: 'customer left' }, ctx);
  const now = e.clock.now().getTime();
  // no PIN ever typed: provider time is 0, the stamp in ctx is invented
  refused(refund({ session: OWNER, stepUp: { ok: true, at: now }, clientRef: ref() }), 'PIN_REQUIRED');
  // a fresh PIN
  e.cur.stepAt = now;
  good(refund({ session: OWNER, stepUp: { ok: true, at: now }, clientRef: ref() }));
  // ctx without a stamp: the call does not ask for the PIN
  refused(refund({ session: OWNER, clientRef: ref() }), 'PIN_REQUIRED');
  // exactly 120,000 ms later still counts, 120,001 does not
  e.clock.advance(120000);
  good(refund({ session: OWNER, stepUp: { ok: true, at: now }, clientRef: ref() }));
  e.clock.advance(1);
  refused(refund({ session: OWNER, stepUp: { ok: true, at: now }, clientRef: ref() }), 'PIN_REQUIRED');
  // a PIN time in the future never counts
  e.cur.stepAt = e.clock.now().getTime() + 1;
  refused(refund({ session: OWNER, stepUp: { ok: true, at: 1 }, clientRef: ref() }), 'PIN_REQUIRED');
});

test('without a step-up provider the stamp in ctx is used, with the same 120,000 ms window', () => {
  const e = build({ docs: 'fake', migrate: null, provider: false });
  e.cases.add('WS-1');
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 100000, payMode: 'Cash' }, { session: OWNER, clientRef: ref() }));
  const now = e.clock.now().getTime();
  const go = (at) => e.core.refund({ jobId: 'WS-1', amountPaise: 1000, payMode: 'Cash', reason: 'customer left' }, { session: OWNER, stepUp: { ok: true, at }, clientRef: ref() });
  good(go(now));
  e.clock.advance(120001);
  refused(go(now), 'PIN_REQUIRED');
  refused(go(e.clock.now().getTime() + 5), 'PIN_REQUIRED');
  refused(go('x'), 'PIN_REQUIRED');
});

test('status: ready and not blocked on a good store; blocked when the store is not authoritative; billing blocked when the bill layer says so', () => {
  const e = build({ docs: 'fake', migrate: null });
  const s = e.core.status();
  assert.equal(s.ok, true);
  assert.equal(s.ready, true);
  assert.equal(s.blocked, false);
  assert.equal(s.billingBlocked, false);
  assert.deepEqual(s.problems, []);
  assert.equal(s.fy, '2026-27');
  assert.deepEqual(s.config, { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician'] });
  assert.deepEqual(s.integrity, { ok: true, code: '' });
  e.docsLib.state.blocked = true;
  const b = e.core.status();
  assert.equal(b.billingBlocked, true);
  assert.equal(b.ready, false);
  assert.equal(b.integrity.ok, false);
  assert.equal(b.integrity.code, 'BILLING_BLOCKED');
  // every write is refused while billing is blocked, and nothing is written
  const before = e.text();
  refused(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  assert.equal(e.text(), before);
});

test('status: the financial year follows the India date (31 March and 1 April)', () => {
  const e = build({ docs: 'fake', migrate: null, start: '2027-03-31T18:29:59.000Z' });
  assert.equal(e.core.status().fy, '2026-27');
  e.clock.set('2027-03-31T18:30:00.000Z');
  assert.equal(e.core.status().fy, '2027-28');
});

test('status never throws, even when the bill layer throws', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.docsLib.state.throwOn.add('config');
  const s = e.core.status();
  assert.equal(s.ok, true);
  assert.deepEqual(s.config.billingRoles, []);
});

test('the source holds the forbidden words of plan 2.1 nowhere, not even in a comment', () => {
  const src = readSource();
  const bad = [
    /postMessage/, /(^|[^A-Za-z0-9])ST_[A-Z0-9_]+/, /document\.write/, /createElement\(['"]script/, /import\(/, /eval\(/, /new Function/, /fetch\(/,
    /XMLHttpRequest/, /window\.open/, /sendBeacon/, /WebSocket/, /http:\/\//, /https:\/\//, /sessionStorage/, /indexedDB/, /localStorage/, /setItem\(/,
    /getItem\(/, /removeItem\(/, /safeSet\(/, /store\.set\(/, /saagar_svcs_/, /st_v2_/, /gm_expenses/, /SERVICE_DELIVERED/, /stockDocs/, /custName/,
    /custMobile/, /custAddr/, /custEmail/, /SaagarReauth/, /SaagarOwnerSession/, /isSuperAdmin/, /ownerOnly/, /ST_ACCESS_CONTEXT/, /SaagarAccess/,
    /accessContext/, /canAccess/, /hasPermission/, /requireRole/, /roleAllows/, /prompt\(/, /confirm\(/, /alert\(/, /debugger/
  ];
  for (const re of bad) assert.equal(re.test(src), false, String(re));
});

test('strict ES5, no clock or random calls, no storage of its own, no append of its own', () => {
  const code = readSource().replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  for (const [name, re] of [
    ['arrow', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['template', /`/], ['class', /\bclass\s/], ['spread', /\.\.\./], ['async', /\basync\b/],
    ['await', /\bawait\b/], ['yield', /\byield\b/], ['nullish', /\?\?/], ['optional chain', /\?\./], ['Date.now', /Date\.now/], ['new Date()', /new Date\(\)/],
    ['Math.random', /Math\.random/], ['window', /\bwindow\b/], ['document', /\bdocument\b/], ['timers', /\bset(Timeout|Interval)\b/],
    ['Object.assign', /Object\.assign/], ['includes', /\.includes\(/], ['new Map', /new Map/], ['startsWith', /\.startsWith\(/], ['Promise', /Promise/],
    ['append', /\.append\(/], ['Object.entries', /Object\.(entries|values)/], ['Array.from', /Array\.from/], ['repeat', /\.repeat\(/], ['find', /\.find(Index)?\(/]
  ]) assert.equal(re.test(code), false, name);
});

test('the exported helpers are not leaked: only version, CODES, MESSAGES, PRINT_TYPES, create', () => {
  const m = require('../www/service-billing-core.js');
  assert.deepEqual(Object.keys(m).sort(), ['CODES', 'MESSAGES', 'PRINT_TYPES', 'create', 'version']);
  assert.ok(Money && Store);
});
