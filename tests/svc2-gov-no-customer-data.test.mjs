// Service wave 2, governance T7: no customer data in any stored record, read answer or print data (plan 2.2, C-STORE-6, F48), and cost stays hidden from staff.
// A full sequence runs on the REAL stack with jobs that are deliberately full of customer fields. Everything the wave stores or returns is then scanned.
// The Phase 1 CUSTOMER_KEY regex is used UNCHANGED. The only customer-linked fields a record may hold are recipientGstin (15 characters or '') and recipientStateCode (2 digits).
import test from 'node:test';
import assert from 'node:assert/strict';
import { realSession } from './lib/svc2-gov-common.mjs';
import { makeBillingEnv, seedBillingFlow, govJobs, jsonOf, FAKE_CUSTOMER_STRINGS_W2, FAKE_GSTIN } from './lib/svc2-gov-env.mjs';
import { SESSIONS } from './lib/fix-s15-role-table.mjs';

const owner = () => realSession(SESSIONS[0].read);
const manager = () => realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);
const cashier = () => realSession(SESSIONS.find((s) => s.name === 'role Cashier').read);
// byte-identical to svc1-gov-no-customer-data.test.mjs
const CUSTOMER_KEY = /^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|e_mail|whatsapp|returnedTo|customerLabel)/i;
const ALLOWED_FIELDS = new Set(['recipientGstin', 'recipientStateCode']);
const STRINGS = FAKE_CUSTOMER_STRINGS_W2.concat([FAKE_GSTIN]);

function build() {
  const env = makeBillingEnv({ jobs: govJobs() });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const o = owner(), m = manager();
  const ids = seedBillingFlow(env, { owner: o, manager: m });
  return { env, ids, o, m };
}
function allKeys(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { acc.push(k); allKeys(v[k], acc); }
  return acc;
}
// Path-aware: the SELLER block of a print model (firm) may hold the shop's own address; no other place may hold a customer-looking name.
function customerKeys(v) {
  const hits = new Set();
  const go = (x, path) => {
    if (Array.isArray(x)) x.forEach((y) => go(y, path));
    else if (x && typeof x === 'object') {
      for (const k of Object.keys(x)) {
        const underFirm = path.includes('firm');
        if (CUSTOMER_KEY.test(k) && !ALLOWED_FIELDS.has(k) && !(underFirm && /^(address|addr|phone|mobile|email)/i.test(k))) hits.add(path.concat(k).join('.'));
        go(x[k], path.concat(k));
      }
    }
  };
  go(v, []);
  return [...hits];
}
function walkValues(v, visit, key = '') {
  if (Array.isArray(v)) v.forEach((x) => walkValues(x, visit, key));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) walkValues(v[k], visit, k);
  else visit(key, v);
}

test('T7.0 the CUSTOMER_KEY regex is the Phase 1 regex, byte for byte, and the two allowed fields do not match it', () => {
  assert.equal(CUSTOMER_KEY.source, '^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|e_mail|whatsapp|returnedTo|customerLabel)');
  assert.equal(CUSTOMER_KEY.flags, 'i');
  for (const k of ALLOWED_FIELDS) assert.equal(CUSTOMER_KEY.test(k), false, k);
});

test('T7.1 after a full sequence no stored string holds the invented customer name, mobile, address, e-mail or GSTIN, and no stored key names a customer field', () => {
  const { env } = build();
  const texts = env.adapter.svcsText();
  assert.ok(texts.length >= 8, 'the sequence wrote the Phase 1 keys, the head, invoices and receipts');
  assert.ok(texts.some(([k]) => /^saagar_svcs_invoices_v1_FY/.test(k)), 'an invoices key was written');
  assert.ok(texts.some(([k]) => /^saagar_svcs_receipts_v1_FY/.test(k)), 'a receipts key was written');
  for (const [key, text] of texts) {
    for (const secret of STRINGS) assert.equal(text.indexOf(secret), -1, `${key} contains "${secret}"`);
    assert.deepEqual(customerKeys(JSON.parse(text)), [], `${key} has customer-looking field names`);
  }
  for (const k of env.adapter.keys()) assert.equal(k.indexOf('Invented'), -1);
});

test('T7.2 the only customer-linked values in a record are recipientGstin (15 characters or empty) and recipientStateCode (2 digits)', () => {
  const { env } = build();
  const seen = { gstin: 0, state: 0 };
  for (const [key, text] of env.adapter.svcsText()) {
    walkValues(JSON.parse(text), (k, v) => {
      if (k === 'recipientGstin') { seen.gstin += 1; assert.match(String(v), /^(|[0-9A-Z]{15})$/, key + ' recipientGstin'); }
      if (k === 'recipientStateCode') { seen.state += 1; assert.match(String(v), /^[0-9]{2}$/, key + ' recipientStateCode'); }
    });
  }
  assert.ok(seen.state >= 1, 'a bill record carries the state code of the supply');
});

test('T7.3 no read answer and no print data, for the Owner, the Store Manager or a Cashier, holds customer fields', () => {
  const { env, ids, o, m } = build();
  const B = env.bill;
  for (const [who, session] of [['owner', o], ['manager', m], ['cashier', cashier()]]) {
    const x = (extra) => env.ctx(session, extra);
    const out = {};
    const take = (name, f) => { try { out[name] = f(); } catch (e) { out[name] = { threw: String(e && e.message) }; } };
    take('status', () => B.status());
    take('getJob', () => B.getJob('WS-2026-001', x()));
    take('getBill', () => B.getBill(ids.invoiceNo, x()));
    take('listBills', () => B.listBills({}, x()));
    take('listReceipts', () => B.listReceipts({}, x()));
    take('daySummary', () => B.daySummary('2026-11-13', x()));
    take('advancesHeld', () => B.advancesHeld({}, x()));
    take('unbilledIssues', () => B.unbilledIssues({}, x()));
    take('legacyAdvances', () => B.legacyAdvances(x()));
    take('unreceiptedCounterSales', () => B.unreceiptedCounterSales(x()));
    take('pendingCcpt', () => B.pendingCcpt(x()));
    take('pendingCreditReturns', () => B.pendingCreditReturns(x()));
    take('estimateView', () => B.estimateView('WS-2026-001', x()));
    take('prepareBill', () => B.prepareBill('WS-2026-001', x()));
    take('taxRoute', () => B.taxRoute('WS-2026-001'));
    take('closeCheck', () => B.closeCheck('WS-2026-001'));
    const args = {
      serviceBillSummary: { jobId: 'WS-2026-001', invoiceNo: ids.invoiceNo }, serviceTaxInvoiceV2: { jobId: 'WS-2026-001', invoiceNo: ids.invoiceNo }, serviceCreditNote: { jobId: 'WS-2026-001', cnNo: ids.cnNo, no: ids.cnNo },
      serviceReceipt: { jobId: 'WS-2026-001', no: 'SAR/26-27/0001' }, serviceRefundVoucher: { jobId: 'WS-2026-001', no: 'SRF/26-27/0001' }, serviceWarrantySheet: { jobId: 'WS-2026-006' },
      serviceUnbilledIssues: {}, serviceDaySummary: { date: '2026-11-13' }, serviceAdvancesHeld: {}, serviceRevenue: { from: '2026-11-01', to: '2026-11-30' }
    };
    for (const [t, a] of Object.entries(args)) take('print:' + t, () => B.printData(t, a, x()));
    for (const [name, value] of Object.entries(out)) {
      const flat = JSON.stringify(value);
      for (const secret of STRINGS) assert.equal(flat.indexOf(secret), -1, `${who} ${name} contains "${secret}"`);
      assert.deepEqual(customerKeys(jsonOf(value === undefined ? null : value)), [], `${who} ${name} has customer-looking field names`);
    }
  }
});

test('T7.4 customer fields smuggled into a payload are refused or dropped, never stored', () => {
  const { env, ids, m } = build();
  const B = env.bill;
  const smuggle = { custName: 'Invented Person', custMobile: '9000000000', custAddr: 'Invented Road 1', customerName: 'Invented Person', buyerName: 'Invented Person', mobile: '9000000000', phone: '9000000000', address: 'Invented Road 1', email: 'invented@example.test', custGstin: FAKE_GSTIN };
  const tries = [
    () => B.saveEstimate(Object.assign({ jobId: 'WS-2026-008', lines: [{ kind: 'LABOUR', code: 'LAB-1', qty: 1 }], recipientGstin: '', recipientStateCode: '27', reason: '', note: '' }, smuggle), env.ctx(m)),
    () => B.takeReceipt(Object.assign({ jobId: 'WS-2026-001', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, smuggle), env.ctx(m)),
    () => B.takeCounterReceipt(Object.assign({ saleNo: ids.saleNo, amountPaise: 15000, payMode: 'Cash', payRef: '', note: '' }, smuggle), env.ctx(m)),
    () => B.issueNoChargeSheet(Object.assign({ jobId: 'WS-2026-006', labour: [{ code: 'LAB-1', name: 'Invented service', qty: 1 }], note: '' }, smuggle), env.ctx(m)),
    () => B.recordApproval(Object.assign({ jobId: 'WS-2026-001', version: 1, method: 'CALL', takenByName: 'Invented Clerk', approvedAt: new Date(env.clock.ms).toISOString(), evidence: '', amountPaise: 1, note: '' }, smuggle), env.ctx(m)),
    () => B.saveEstimate({ jobId: 'WS-2026-009', lines: [{ kind: 'LABOUR', code: 'LAB-1', qty: 1, custName: 'Invented Person', buyerName: 'Invented Person' }], recipientGstin: FAKE_GSTIN, recipientStateCode: '99', reason: '', note: '' }, env.ctx(m))
  ];
  for (const t of tries) { try { t(); } catch { /* a throw is also a refusal */ } }
  for (const [key, text] of env.adapter.svcsText()) {
    for (const secret of STRINGS) assert.equal(text.indexOf(secret), -1, `${key} contains "${secret}" after smuggling`);
    assert.deepEqual(customerKeys(JSON.parse(text)), [], `${key} has customer-looking field names after smuggling`);
  }
});

test('T7.5 the billing facade is never handed a customer field by the page: jobs reach it as id, status, invoiceNo, paymentStatus, stub, label, voided and typedAdvancePaise only', () => {
  // The facade reads the case through cases.get (plan 2.9); the jobs in this env are full of customer fields on purpose and none may come back out.
  const { env, o } = build();
  const flat = JSON.stringify([env.bill.getJob('WS-2026-001', env.ctx(o)), env.bill.listBills({}, env.ctx(o)), env.bill.status()]);
  for (const secret of STRINGS) assert.equal(flat.includes(secret), false, secret);
  assert.equal(flat.includes('Titan Edge'), false, 'even the harmless label of the job is not echoed by the facade');
});

test('T7.6 cost is hidden from staff: no cost field in what a Cashier gets; the FIFO cost of billed parts is visible to the Manager and the Owner only', () => {
  const { env, ids, o, m } = build();
  const B = env.bill;
  const staff = [B.getJob('WS-2026-001', env.ctx(cashier())), B.getBill(ids.invoiceNo, env.ctx(cashier())), B.listBills({}, env.ctx(cashier()))];
  const costKey = /(^|[a-z])(cost|costPaise|partsPaise|warrantyPaise)($|[A-Z])|^cost/i;
  const leaks = [];
  const scan = (v, path) => {
    if (Array.isArray(v)) v.forEach((x, i) => scan(x, path + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) {
      if (/^(cost|costPaise|costEstimated|verifyCost)$/.test(k) && v[k] !== null && v[k] !== undefined) leaks.push(path + '.' + k);
      scan(v[k], path + '.' + k);
    }
  };
  for (const [i, v] of staff.entries()) scan(jsonOf(v), 'answer' + i);
  assert.deepEqual(leaks.slice(0, 10), [], 'staff must never receive the FIFO cost of a billed part');
  void costKey;
  const refused = B.unbilledIssues({}, env.ctx(cashier()));
  assert.equal(refused.ok, false, 'the not-billed-yet list (it shows FIFO cost) is refused for staff');
  for (const who of [o, m]) {
    const r = B.unbilledIssues({}, env.ctx(who));
    assert.equal(r.ok, true, 'the not-billed-yet list is visible to ' + who.role + ': ' + JSON.stringify(r));
  }
});
