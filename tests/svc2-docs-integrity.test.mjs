// Service wave 2, billing documents: integrity, roles, privacy and file rules (P3 tests 46 to 54, group E).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeEnv, Bill, expectFail, expectOk, unchanged, OWNER, MANAGER, CASHIER, TECH, GREETER, NONE } from './lib/svc2-docs-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'www', 'service-billing-docs.js');
const buf = fs.readFileSync(file);
const src = buf.toString('utf8');
const LB = (code, qty) => ({ code, qty, discountPaise: 0 });
const lp = (code, qty) => ({ kind: 'PART', code, qty });
const ll = (code, qty) => ({ kind: 'LABOUR', code, qty });

function scenario() {
  const env = makeEnv().seed();
  env.setConfig({ billingRoles: ['Cashier'] });
  env.job('J-1');
  env.estimateApproved('J-1', [lp('P1', 2), ll('L1', 1)]);
  env.issue('J-1', [{ partCode: 'P1', qty: 2 }]);
  const inv = env.issueBill({ jobId: 'J-1', parts: [{ partCode: 'P1', qty: 2, discountPaise: 0 }], labour: [LB('L1', 1)] }).invoice;
  env.job('J-2');
  env.estimateApproved('J-2', [ll('L1', 1)]);
  env.job('J-3', { paymentStatus: 'no_charge_warranty' });
  env.issue('J-3', [{ partCode: 'P2', qty: 1 }]);
  return { env, inv };
}

test('46 every refusal leaves the storage text byte-identical, writes nothing, and has a code and a message', () => {
  const { env, inv } = scenario();
  const refusals = [
    () => env.bill.saveEstimate({ jobId: 'J-404', lines: [lp('P1', 1)] }, env.ctx(MANAGER)),
    () => env.bill.saveEstimate({ jobId: 'J-2', lines: [lp('P1', 1)] }, env.ctx(GREETER)),
    () => env.bill.saveEstimate({ jobId: 'J-1', lines: [lp('P1', 1)] }, env.ctx(MANAGER)),
    () => env.bill.recordApproval({ jobId: 'J-2', version: 5, method: 'CALL' }, env.ctx(MANAGER)),
    () => env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)),
    () => env.bill.issueInvoice({ jobId: 'J-2', labour: [LB('L1', 1)], billDiscountPaise: 10, discountReason: 'regular customer' }, env.ctx(MANAGER)),
    () => env.bill.issueInvoice({ jobId: 'J-3', labour: [LB('L1', 1)] }, env.ctx(MANAGER)),
    () => env.bill.issueInvoice({ jobId: 'J-2', labour: [LB('L1', 1)], mode: 'NOT_IN_CCPT', notInCcptReason: 'no CCPT here' }, env.ctx(MANAGER)),
    () => env.bill.linkCcptInvoice({ invoiceNo: 'SV/2026-27/0404', ccptInvoiceNo: 'A1' }, env.ctx(MANAGER)),
    () => env.bill.cancelInvoice(inv.no, 'wrong job billed', env.ctx(OWNER)),
    () => env.bill.issueCreditNote({ invoiceNo: inv.no, mode: 'FULL', reasonClass: 'OTHER', reason: 'goods came back' }, env.ctx(OWNER)),
    () => env.bill.issueCreditNote({ invoiceNo: inv.no, mode: 'PARTIAL', reasonClass: 'OTHER', reason: 'goods came back', request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 3 }] } }, env.ctxPin(OWNER)),
    () => env.bill.issueNoChargeSheet({ jobId: 'J-2' }, env.ctx(MANAGER)),
    () => env.bill.cancelNoChargeSheet('INV-000404', 'wrong sheet made', env.ctxPin(OWNER)),
    () => env.bill.voidJob('J-1', 'customer left the job', env.ctxPin(OWNER)),
    () => env.bill.setBillingConfig({ billingRoles: ['Store Manager'] }, env.ctxPin(OWNER)),
    () => env.bill.importLegacy([{ ref: 'LEGACY:x', body: {} }], env.ctxPin(OWNER)),
    () => env.bill.saveEstimate({ jobId: 'J-2', lines: [lp('P1', 1)] }, { session: NONE })
  ];
  for (const f of refusals) {
    const r = unchanged(env, f);
    assert.equal(r.ok, false);
    assert.equal(typeof r.code, 'string');
    assert.ok(r.message.length > 8);
  }
});

test('47 one write per business call; no write for a read', () => {
  const { env, inv } = scenario();
  const writes = [
    () => env.bill.saveEstimate({ jobId: 'J-2', lines: [ll('L1', 2)], reason: 'more labour needed' }, env.ctx(MANAGER)),
    () => env.bill.recordApproval({ jobId: 'J-2', version: 2, method: 'CALL' }, env.ctx(MANAGER)),
    () => env.bill.issueInvoice({ jobId: 'J-2', labour: [LB('L1', 2)] }, env.ctx(MANAGER)),
    () => env.bill.linkCcptInvoice({ invoiceNo: inv.no, ccptInvoiceNo: 'C-1' }, env.ctx(MANAGER)),
    () => env.bill.issueCreditNote({ invoiceNo: inv.no, mode: 'PARTIAL', reasonClass: 'PRICE', reason: 'price adjusted', request: { kind: 'LINES', lines: [{ lineNo: 2, taxablePaise: 500 }] } }, env.ctxPin(OWNER)),
    () => env.bill.issueNoChargeSheet({ jobId: 'J-3' }, env.ctx(MANAGER)),
    () => env.bill.setBillingConfig({ discountLimitPaise: 300 }, env.ctxPin(OWNER))
  ];
  for (const f of writes) {
    const before = env.count();
    const r = f();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(env.count() - before, 3, 'shard + head + device mark');
  }
  const text = env.text();
  const count = env.count();
  const m = env.ctx(MANAGER);
  env.bill.getInvoice(inv.no, m); env.bill.listInvoices({}, m); env.bill.listCreditNotes({}, m); env.bill.jobBilling('J-1', m); env.bill.estimateView('J-1', m);
  env.bill.prepareInvoice('J-2', m); env.bill.previewInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, m); env.bill.pendingCcpt(m); env.bill.unbilledIssues(m);
  env.bill.pendingCreditReturns(m); env.bill.costOfSales({}, m); env.bill.verifyCost(inv.no, m); env.bill.repairLinks(); env.bill.blocksDelete('J-1'); env.bill.status();
  env.bill.config(); env.bill.issueOutcomes('J-1', m); env.bill.invoicesOn('2026-11-18'); env.bill.docsView().invoiceForJob('J-1');
  assert.equal(env.count(), count);
  assert.equal(env.text(), text);
});

test('48 tamper: one changed byte in a stored bill blocks billing; no write is accepted and the reads answer with the block', () => {
  const { env } = scenario();
  const key = env.adapter.keys().find((k) => /invoices_v1_FY/.test(k));
  env.adapter.data.set(key, env.adapter.data.get(key).replace('"mode":"CCPT_BILLED"', '"mode":"CCPT_BILLEd"'));
  const o = env.reopen();
  const r = o.bill.open();
  assert.equal(r.ok, false);
  for (const res of [o.bill.saveEstimate({ jobId: 'J-2', lines: [ll('L1', 1)] }, { session: MANAGER }), o.bill.getInvoice('SV/2026-27/0001', { session: MANAGER }), o.bill.activeInvoiceNo('J-1'), o.bill.isLocked('J-1')]) {
    assert.equal(res.ok, false);
    assert.ok(['SVCS_BLOCKED', 'BILLING_BLOCKED'].includes(res.code), res.code);
  }
});

test('49 restart equivalence: a second instance over a copy of the storage gives the same lists', () => {
  const { env } = scenario();
  const other = env.reopen({ adapter: env.adapter.copy() });
  const m = { session: MANAGER };
  const snap = (b) => JSON.stringify([b.listInvoices({}, m), b.listCreditNotes({}, m), ['J-1', 'J-2', 'J-3'].map((j) => b.jobBilling(j, m)), b.unbilledIssues(m), b.pendingCcpt(m), b.config(), b.repairLinks()]);
  assert.equal(snap(other.bill), snap(env.bill));
});

test('50 role matrix: can() answers exactly the plan table for each session', () => {
  const { env } = scenario();
  const rows = {
    VIEW_STATUS: [1, 1, 1, 1, 1], VIEW_AMOUNTS: [1, 1, 1, 0, 0], EST_SAVE: [1, 1, 1, 1, 0], EST_OTHER_LINE: [1, 1, 0, 0, 0], EST_APPROVE: [1, 1, 1, 1, 0], APPROVAL_OVERRIDE: [1, 0, 0, 0, 0],
    INV_ISSUE: [1, 1, 1, 0, 0], DISCOUNT: [1, 1, 0, 0, 0], DISCOUNT_ABOVE_LIMIT: [1, 0, 0, 0, 0], NOT_IN_CCPT: [1, 0, 0, 0, 0], CCPT_ADD: [1, 1, 1, 0, 0], CCPT_CHANGE: [1, 0, 0, 0, 0],
    INV_CANCEL: [1, 0, 0, 0, 0], CN_ISSUE: [1, 0, 0, 0, 0], NCS_ISSUE: [1, 1, 0, 0, 0], NCS_CANCEL: [1, 0, 0, 0, 0], JOB_VOID: [1, 0, 0, 0, 0], BCFG_SET: [1, 0, 0, 0, 0],
    IMPORT_LEGACY: [1, 0, 0, 0, 0], VIEW_COST: [1, 1, 0, 0, 0], VIEW_REGISTERS: [1, 1, 0, 0, 0]
  };
  const pinned = ['APPROVAL_OVERRIDE', 'DISCOUNT_ABOVE_LIMIT', 'NOT_IN_CCPT', 'CCPT_CHANGE', 'INV_CANCEL', 'CN_ISSUE', 'NCS_CANCEL', 'JOB_VOID', 'BCFG_SET', 'IMPORT_LEGACY'];
  const sessions = [OWNER, MANAGER, CASHIER, TECH, GREETER];
  assert.deepEqual(Object.keys(rows).sort(), Bill.ROLE_ACTIONS.filter((a) => a !== 'CN_STOCK_RETURN').sort());
  for (const [action, want] of Object.entries(rows)) {
    sessions.forEach((s, i) => {
      const r = env.bill.can(action, s);
      assert.equal(r.ok, want[i] === 1, action + ' for ' + s.role);
      if (r.ok) assert.equal(r.needsPin, pinned.includes(action), action);
    });
    assert.equal(env.bill.can(action, NONE).code, 'SESSION_REQUIRED');
  }
  // the real calls agree with the table
  expectFail(unchanged(env, () => env.bill.setBillingConfig({ discountLimitPaise: 9 }, env.ctxPin(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.bill.saveEstimate({ jobId: 'J-2', lines: [ll('L1', 1)] }, env.ctx(GREETER))), 'NOT_ALLOWED');
  assert.equal(env.bill.can('CN_STOCK_RETURN', MANAGER).ok, true);
});

test('51 no customer data: no record key names one, and the stored text holds no phone-like digits or e-mail text', () => {
  const { env, inv } = scenario();
  env.bill.issueCreditNote({ invoiceNo: inv.no, mode: 'FULL', reasonClass: 'OTHER', reason: 'goods came back' }, env.ctxPin(OWNER));
  const bad = /^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|e_mail|whatsapp|pan)/i;
  const walk = (v, p) => { if (v && typeof v === 'object') for (const k of Object.keys(v)) { assert.equal(bad.test(k), false, p + k); walk(v[k], p + k + '.'); } };
  const recs = env.store.read('invoices').records;
  assert.ok(recs.length > 5);
  for (const r of recs) walk(r.b, r.k + '.');
  const text = JSON.stringify(recs);
  assert.equal(/\d{10,}/.test(text.replace(/[0-9a-f]{64}/g, '').replace(/"pinAt":[0-9]+/g, '')), false);
  assert.equal(text.indexOf('@'), -1, text.slice(Math.max(0, text.indexOf('@') - 40), text.indexOf('@') + 20));
});

test('52 views for plain billing staff carry no cost; Manager and Owner see it', () => {
  const { env, inv } = scenario();
  const staff = env.bill.getInvoice(inv.no, env.ctx(CASHIER)).invoice;
  const mgr = env.bill.getInvoice(inv.no, env.ctx(MANAGER)).invoice;
  assert.equal('cost' in staff, false);
  assert.equal(JSON.stringify(staff).includes('costPaise'), false);
  assert.equal(mgr.cost.partsPaise, 20000);
  assert.equal(mgr.stock[0].costPaise, 20000);
  expectFail(env.bill.getInvoice(inv.no, env.ctx(GREETER)), 'NOT_ALLOWED');
  expectFail(env.bill.costOfSales({}, env.ctx(CASHIER)), 'NOT_ALLOWED');
  assert.equal(env.bill.jobBilling('J-1', env.ctx(GREETER)).activeInvoice.no, inv.no);
  assert.equal('totalPaise' in env.bill.jobBilling('J-1', env.ctx(GREETER)).activeInvoice, false);
});

const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const noStrings = (t) => codeOnly(t).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

test('53 file rules: ASCII, LF, no tab, one final newline, budget, UMD wrapper, frozen API, strict ES5, banned tokens', () => {
  for (const b of buf) assert.ok(b === 10 || (b >= 32 && b < 127), 'non-ASCII or control byte ' + b);
  assert.equal(src.endsWith('\n') && !src.endsWith('\n\n'), true);
  assert.ok(buf.length < 120000, 'file is ' + buf.length);
  assert.ok(src.startsWith("(function (root, factory) {\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceBillingDocs = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';"));
  assert.equal(Object.isFrozen(Bill), true);
  assert.deepEqual(Object.keys(Bill).sort(), ['CODES', 'DEFAULT_CONFIG', 'ESTIMATE_STATES', 'INVOICE_STATES', 'KINDS', 'MESSAGES', 'METHODS', 'MODES', 'ROLE_ACTIONS', 'create', 'validateLegacyBody', 'version']);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.SaagarServiceBillingDocs.create, 'function');
  new vm.Script(src);
  const t = noStrings(src);
  for (const [n, re] of [['arrow', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['template', /`/], ['class', /\bclass\s/], ['spread', /\.\.\./], ['async', /\basync\b/], ['nullish', /\?\?/], ['optional', /\?\./]]) assert.equal(re.test(t), false, n);
  for (const bad of ['.flat(', '.fill(', '.at(', 'padEnd(', 'replaceAll(', 'structuredClone', 'Object.assign', '.includes(', '.startsWith(', '.endsWith(', 'Number.isInteger', 'new Map', 'new Set', 'Symbol', 'Promise']) assert.equal(t.includes(bad), false, bad);
  for (const bad of ['postMessage', 'document.write', 'import(', 'eval(', 'new Function', 'fetch(', 'XMLHttpRequest', 'window.open', 'sendBeacon', 'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB',
    'localStorage', 'setItem(', 'getItem(', 'removeItem(', 'safeSet(', 'store.set(', 'saagar_svcs_', 'st_v2_', 'gm_expenses', 'SERVICE_DELIVERED', 'stockDocs', 'custName', 'custMobile', 'custAddr', 'custEmail',
    'SaagarReauth', 'SaagarOwnerSession', 'isSuperAdmin', 'ownerOnly', 'ST_ACCESS_CONTEXT', 'SaagarAccess', 'accessContext', 'canAccess', 'hasPermission', 'requireRole', 'roleAllows', 'prompt(', 'confirm(', 'alert(',
    'debugger', 'Date.now', 'Math.random', 'setTimeout', 'setInterval', 'window', 'document']) assert.equal(src.includes(bad), false, bad);
  assert.equal(/\bST_[A-Z0-9_]+/.test(src), false);
  assert.equal(/new Date\(\s*\)/.test(src), false);
  for (const word of ['mobile', 'phone', 'email', 'address']) assert.equal(src.toLowerCase().includes(word), false, word);
  assert.equal(src.includes('\t'), false);
  const c = codeOnly(src);
  const used = new Set();
  for (const m of c.matchAll(/\b(?:fail|lineFail)\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const m of c.matchAll(/\b(?:return|=) fail\('([A-Z][A-Z_]+)'/g)) used.add(m[1]);
  for (const code of used) if (code !== 'NO_STOCK_LINES') assert.equal(Bill.CODES[code], code, 'code missing: ' + code);
  for (const [k, v] of Object.entries(Bill.CODES)) { assert.equal(v, k); assert.ok(Bill.MESSAGES[k].length > 8, k); assert.ok(/^[\x20-\x7e]+$/.test(Bill.MESSAGES[k])); assert.equal(/document|window/i.test(Bill.MESSAGES[k]), false); }
  assert.deepEqual(Object.keys(Bill.CODES).sort(), Object.keys(Bill.MESSAGES).sort());
  const stores = new Set();
  for (const m of c.matchAll(/\bstore\.(\w+)\(/g)) stores.add(m[1]);
  assert.deepEqual(Array.from(stores).sort(), ['append', 'findRef', 'head', 'lastNumber', 'nextAt', 'nextNumber', 'open', 'read']);
  assert.equal((c.match(/store\.append\(/g) || []).length, 1);
  console.log('service-billing-docs.js bytes: ' + buf.length);
});

test('54 job lock stand-in: the page lock follows activeInvoiceNo, and a cancelled bill unlocks the job', () => {
  const { env, inv } = scenario();
  const locked = (id) => { const j = env.jobs.get(id); const a = env.bill.activeInvoiceNo(id); return j.status === 'closed' && !!(j.invoiceNo || a); };
  env.jobs.get('J-1').status = 'closed';
  assert.equal(locked('J-1'), true);
  env.jobs.get('J-1').status = 'open';
  expectOk(env.bill.cancelInvoice(inv.no, 'wrong job billed', env.ctxPin(OWNER)));
  env.jobs.get('J-1').status = 'closed';
  assert.equal(locked('J-1'), false);
});
