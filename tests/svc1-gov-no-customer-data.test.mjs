// Service wave 1, governance T7: no customer data in any stored record, read answer or report data (R-10, plan 2.1), and cost stays hidden from staff.
// A full sequence runs on the REAL core with a job object that is deliberately full of customer fields. Everything the wave stores or returns is then scanned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exists, realSession } from './lib/svc1-gov-common.mjs';
import { makeGovEnv, seedFlow, leakyJob, FAKE_CUSTOMER_STRINGS, jsonOf } from './lib/svc1-gov-env.mjs';
import { SESSIONS } from './lib/fix-s15-role-table.mjs';

const owner = () => realSession(SESSIONS[0].read);
const manager = () => realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);
const cashier = () => realSession(SESSIONS.find((s) => s.name === 'role Cashier').read);
const CUSTOMER_KEY = /^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|e_mail|whatsapp|returnedTo|customerLabel)/i;
const REPORT_ARGS = { svcStockList: {}, svcReorderList: {}, svcDefectiveRegister: {}, svcAdjustmentRegister: {}, svcPartLedger: { partCode: 'NEW-1', code: 'NEW-1' }, svcGoodsReceipt: { grnNo: 'GRN/26-27/0001' } };

function build() {
  assert.ok(exists('www/service-stores-core.js') && exists('www/service-stores-docs.js'), 'waiting on writers: core and docs');
  const env = makeGovEnv({ jobs: { 'WS-2026-001': leakyJob('WS-2026-001') } });
  const o = owner(), m = manager();
  const ids = seedFlow(env, { owner: o, manager: m });
  return { env, ids, o, m };
}
function allKeys(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { acc.push(k); allKeys(v[k], acc); }
  return acc;
}
function reads(env, ids, session) {
  const c = env.core;
  const x = (extra) => env.ctx(session, extra);
  const out = {};
  const take = (name, r) => { out[name] = r; };
  take('listParts', c.listParts({}, x()));
  take('getPart', c.getPart('NEW-1', x()));
  take('listLabour', c.listLabour({}, x()));
  take('jobParts', c.jobParts('WS-2026-001', x()));
  take('jobHasParts', c.jobHasParts('WS-2026-001'));
  take('getDoc', c.getDoc(ids.grnNo, x()));
  take('getIssue', c.getDoc(ids.issueNo, x()));
  take('getSale', c.getDoc(ids.saleNo, x()));
  take('listCounterSales', c.listCounterSales({}, x()));
  take('listAdjustments', c.listAdjustments({}, x()));
  take('listOldParts', c.listOldParts({}, x()));
  take('reorderList', c.reorderList(x()));
  take('ledger', c.ledger('NEW-1', {}, x()));
  take('history', c.history('part', 'NEW-1', x()));
  take('status', c.status());
  for (const [t, a] of Object.entries(REPORT_ARGS)) take('report:' + t, c.reportData(t, a, x()));
  return out;
}

test('T7.1 after a full sequence no stored string holds the invented customer name, mobile, address or e-mail, and no stored key names a customer field', () => {
  const { env } = build();
  const texts = env.adapter.svcsText();
  assert.ok(texts.length >= 6, 'the sequence wrote the six data keys and the head');
  for (const [key, text] of texts) {
    for (const secret of FAKE_CUSTOMER_STRINGS) assert.equal(text.indexOf(secret), -1, `${key} contains "${secret}"`);
    const keys = allKeys(JSON.parse(text));
    const hit = keys.filter((k) => CUSTOMER_KEY.test(k));
    assert.deepEqual([...new Set(hit)], [], `${key} has customer-looking field names`);
  }
  for (const k of env.adapter.keys()) assert.equal(k.indexOf('Invented'), -1);
});

test('T7.2 no read answer and no report data, for the Owner, the Store Manager or a Cashier, holds customer fields', () => {
  const { env, ids, o, m } = build();
  for (const [who, session] of [['owner', o], ['manager', m], ['cashier', cashier()]]) {
    const got = reads(env, ids, session);
    for (const [name, value] of Object.entries(got)) {
      const flat = JSON.stringify(value);
      for (const secret of FAKE_CUSTOMER_STRINGS) assert.equal(flat.indexOf(secret), -1, `${who} ${name} contains "${secret}"`);
      const hit = allKeys(jsonOf(value)).filter((k) => CUSTOMER_KEY.test(k));
      assert.deepEqual([...new Set(hit)], [], `${who} ${name} has customer-looking field names`);
    }
  }
});

test('T7.3 customer fields smuggled into a payload are refused or dropped, never stored', () => {
  const { env, ids, m } = build();
  const smuggle = { custName: 'Invented Person', custMobile: '9000000000', custAddr: 'Invented Road 1', customerLabel: 'Invented Person', returnedTo: 'Invented Person' };
  const tries = [
    () => env.core.counterSale(Object.assign({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'UPI', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, smuggle), env.ctx(m)),
    () => env.core.issueToJob(Object.assign({ jobId: 'WS-2026-001', billing: 'CHARGEABLE', lines: [{ partCode: 'NEW-1', qty: 1 }], note: '' }, smuggle), env.ctx(m)),
    () => env.core.registerOldPart(Object.assign({ jobId: 'WS-2026-001', partCode: 'NEW-1', partText: '', qty: 1, serialRef: '', state: 'CUSTOMER_RETURNED', claimRef: '', note: '' }, smuggle), env.ctx(m)),
    () => env.core.moveOldPart(ids.oldNo, Object.assign({ to: 'CUSTOMER_RETURNED', note: 'handed back' }, smuggle), env.ctx(m)),
    () => env.core.receiveGoods(Object.assign({ supplierName: 'Titan', supplierInvoiceNo: 'INV-9', supplierInvoiceDate: '2026-11-02', lines: [{ partCode: 'NEW-1', qtyInvoiced: 1, qtyReceived: 1, unitCostPaise: 5000 }], note: '' }, smuggle), env.ctx(m)),
    () => env.core.savePart(Object.assign({ code: 'NEW-9', name: 'Invented crown', group: 'Crown', unit: 'pc', reason: 'new part' }, smuggle), env.ctx(m)),
    () => env.core.proposeAdjustment(Object.assign({ lines: [{ partCode: 'NEW-1', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 5000 }], note: 'found one' }, smuggle), env.ctx(m))
  ];
  for (const t of tries) t();
  for (const [key, text] of env.adapter.svcsText()) {
    for (const secret of FAKE_CUSTOMER_STRINGS) assert.equal(text.indexOf(secret), -1, `${key} contains "${secret}"`);
    const hit = allKeys(JSON.parse(text)).filter((k) => CUSTOMER_KEY.test(k));
    assert.deepEqual([...new Set(hit)], [], `${key} has customer-looking field names after smuggling`);
  }
});

test('T7.4 cost is hidden from staff: every cost and value field is null, the ledger and the adjustment register are refused; the Manager sees the hand-checked FIFO value 62,500 paise', () => {
  const { env, ids, o, m } = build();
  const staff = reads(env, ids, cashier());
  const costKey = /paise|cost|value/i;
  const keepVisible = /^(sellPricePaise|ratePaise|unitPricePaise|amountPaise|costBasis|reorderLevel)$/;
  const leaks = [];
  const scan = (v, path, name) => {
    if (Array.isArray(v)) v.forEach((x, i) => scan(x, path + '[' + i + ']', name));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) {
      if (costKey.test(k) && !keepVisible.test(k) && v[k] !== null && v[k] !== undefined && typeof v[k] !== 'boolean') leaks.push(`${name}${path}.${k}=${JSON.stringify(v[k])}`);
      scan(v[k], path + '.' + k, name);
    }
  };
  for (const [name, value] of Object.entries(staff)) {
    if (name === 'status' || name === 'jobHasParts') continue;
    scan(jsonOf(value), '', name);
  }
  assert.deepEqual(leaks.slice(0, 10), [], 'staff must never receive a cost or a value');
  assert.equal(staff.ledger.ok, false);
  assert.equal(staff['report:svcAdjustmentRegister'].ok, false);
  assert.equal(staff['report:svcPartLedger'].ok, false);
  assert.equal(staff.listParts.totals.valuePaise, null);
  assert.equal(staff.listParts.totals.pieces, 12, 'quantities are visible to staff');
  for (const who of [o, m]) {
    const lp = env.core.listParts({}, env.ctx(who));
    assert.equal(lp.totals.pieces, 12);
    assert.equal(lp.totals.valuePaise, 62500, 'FIFO: 7 left of the opening layer at 5000 plus 5 received at 5500');
    assert.equal(lp.rows.find((r) => r.code === 'NEW-1').valuePaise, 62500);
  }
});

test('T7.5 reports are not built from a customer-bearing job: the labels the glue passes are the job id and a brand/model text only', () => {
  const { env, o } = build();
  const jp = env.core.jobParts('WS-2026-001', env.ctx(o));
  assert.equal(jp.ok, true);
  assert.equal(JSON.stringify(jp).includes('Titan Edge'), false, 'even the harmless label is not stored or echoed by the core');
  assert.equal(env.core.jobHasParts('WS-2026-001').has, true);
  const absent = env.core.jobHasParts('WS-2099-999');
  assert.equal(absent.ok === true && absent.has === true, false);
});
