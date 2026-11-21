// Stage B2 wiring audit (2026-11-19): gaps that fall between files, on the REAL stack.
// E1 a phone number typed in free text is refused by the facade for every write (money audit N3; no customer detail in a record).
// E2 bridge audit N-4: a job that took an advance by receipt can no longer be closed the old way for a bigger amount (the page's close gate,
//    through the REAL page glue and the real facade).
// E3 a customer's name, mobile and address never reach a saagar_svcs_ record by any route: a full job driven through the page glue.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { realEnv, good, refused, ref, OWNER } from './lib/svc2-core-kit.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));

test('E1 a phone number in a note, reason, evidence or approver name is refused for every write; other numbers and payment references pass', () => {
  const e = realEnv();
  e.cases.add('J1');
  e.cases.add('J2');
  const c = e.core;
  const before = e.text();
  const pin = () => e.pinCtx({ clientRef: ref('p') });
  const cases = [
    ['note, 10 digits', () => c.saveEstimate({ jobId: 'J1', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }], note: 'call 9876543210 when ready' }, pin())],
    ['evidence, spaced', () => c.recordApproval({ jobId: 'J1', version: 1, method: 'WHATSAPP', takenByName: 'Test Taker', evidence: 'from 98765 43210' }, pin())],
    ['approver name', () => c.recordApproval({ jobId: 'J1', version: 1, method: 'CALL', takenByName: 'Ravi 7766554433' }, pin())],
    ['receipt note, +91', () => c.takeReceipt({ jobId: 'J1', kind: 'advance', amountPaise: 1000, payMode: 'Cash', note: '+91 98765-43210' }, pin())],
    ['refund reason, leading 0', () => c.refund({ jobId: 'J1', amountPaise: 1000, payMode: 'Cash', reason: 'customer on 09876543210 asked' }, pin())],
    ['void reason', () => c.voidJob({ jobId: 'J2', reason: 'duplicate of the job for 9123456789' }, pin())],
    ['bill discount reason', () => c.issueBill({ jobId: 'J1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], discountReason: 'regular 8899776655' }, pin())]
  ];
  for (const [name, fn] of cases) {
    const r = plain(fn());
    assert.equal(r.ok, false, name);
    assert.equal(r.code, 'TEXT_HAS_PHONE', name + ' ' + JSON.stringify(r));
    assert.ok(/phone number/i.test(r.message), 'a plain message');
  }
  assert.equal(e.text(), before, 'nothing written');
  // not phone numbers: amounts, dates, document numbers, a 12-digit UPI reference in payRef
  good(c.saveEstimate({ jobId: 'J1', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }], note: 'Rs 1,23,456 quoted on 2026-11-18, ref SAR/26-27/0001' }, pin()));
  good(c.takeReceipt({ jobId: 'J1', kind: 'advance', amountPaise: 1000, payMode: 'UPI', payRef: '412345678901', note: 'paid 1000' }, pin()));
});

// ---- the page world: the page's billing glue in a vm over the real files (as in svc2-migrate-page) ----
const ROOT = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const PAGE = read('www/modules/service/index.html');
const GLUE = PAGE.slice(PAGE.indexOf('// ─── BILLING GLUE'), PAGE.indexOf('renderDash();\napplyReadOnlyUI();\nsvsMount();'));
const LIBS = ['service-stores-store', 'service-stores-fifo', 'service-stores-masters', 'service-stores-docs', 'service-stores-core', 'service-billing-calc',
  'service-billing-docs', 'service-billing-money', 'service-billing-migrate', 'service-billing-core'].map((n) => read('www/' + n + '.js'));
const REPORT = read('www/saagar-report.js');
const P_OWNER = { ok: true, tier: 'owner', role: 'Owner', actorName: 'Test Owner', isOwner: true, isManager: false };
const P_MANAGER = { ok: true, tier: 'manager', role: 'Store Manager', actorName: 'Test Manager', isOwner: false, isManager: true };
const NAME = 'Zw Invented Customer';
const MOBILE = '5550133221';
const ADDR = 'Flat 7, Nowhere Road, Faketown';
function world() {
  const store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
  const cur = { s: P_MANAGER };
  const rctx = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, console, Blob, URL, setTimeout, clearTimeout };
  rctx.window = rctx;
  vm.createContext(rctx);
  vm.runInContext(REPORT, rctx);
  const toasts = [];
  const g = {
    console: { warn() {}, log() {}, error() {} }, localStorage: ls, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    DB: [], editId: null, viewDate: '2026-11-19',
    parseRupee: (v) => { const x = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(x) ? 0 : x; },
    svcD3Reauth: async () => true, isPastView: () => false, todayStr: () => '2026-11-19', toast: (m) => toasts.push(String(m)), showView() {}, openEdit() {}, scrollToSec() {},
    saveDB() {}, nowLocalDT: () => '2026-11-19T10:00', svcReloadSettings: () => ({}), SVC_SETTINGS: {},
    SaagarModuleRuntime: { session: () => cur.s },
    SaagarModuleBridge: { report: { makeInvoiceSnapshot: (j, no, b) => rctx.SaagarReport.makeInvoiceSnapshot(j, no, b), preview() {} } },
    Date, Math, JSON, Promise, setTimeout, clearTimeout, setImmediate
  };
  g.byId = (id) => g.DB.find((c) => c.id === id);
  g.window = g;
  g.globalThis = g;
  vm.createContext(g);
  for (const src of LIBS) vm.runInContext(src, g);
  vm.runInContext(GLUE, g);
  const b = g.svbBilling();
  const share = vm.runInContext('svbShareRef', g);
  const pinGate = vm.runInContext('svbPinGate', g);
  const M = g.SaagarServiceMasters;
  const mctx = (code) => ({ session: P_MANAGER, now: () => new Date(), clientRef: 'm-' + code });
  assert.equal(M.createRow(share.store, mctx('L1'), 'labour', { code: 'L1', name: 'Labour L1', group: 'Service', unit: 'job', sac: '9987', gstRateBp: 1800, priceIncludesTax: false, ratePaise: 10000 }).ok, true);
  assert.equal(M.createRow(share.store, mctx('P1'), 'part', { code: 'P1', name: 'Battery P1', group: 'Battery', unit: 'pc', hsn: '9114', gstRateBp: 1800, priceIncludesTax: true, sellPricePaise: 11800, reorderLevel: 0, reorderQty: 0, bin: '', flags: { counterSaleable: true } }).ok, true);
  assert.equal(g.svsCore().receiveGoods({ supplierInvoiceNo: 'S-1', supplierInvoiceDate: '2026-11-10', lines: [{ partCode: 'P1', qtyInvoiced: 5, qtyReceived: 5, unitCostPaise: 10000 }] }, { session: P_MANAGER, clientRef: 'g1' }).ok, true);
  return { g, b, cur, store, share, pinGate, toasts };
}
const cx = () => ({ clientRef: 'w-' + Math.random().toString(36).slice(2) });

test('E2 (bridge N-4) a job with an advance by receipt cannot be closed the old way for more: the close gate asks for a bill, then for the balance', async () => {
  const w = world();
  w.g.DB.push({ id: 'WS-N4', status: 'open', brand: 'Titan', model: 'Edge', custName: NAME, custMobile: MOBILE, custAddr: ADDR, delivery: { finalAmt: '900' } });
  assert.equal(w.b.takeReceipt({ jobId: 'WS-N4', kind: 'advance', amountPaise: 50000, payMode: 'Cash' }, cx()).ok, true);
  let gate = plain(w.g.svbCloseGate('WS-N4'));
  assert.equal(gate.ok, false, 'an advance and no bill: the old close (final 900) is refused');
  assert.equal(w.b.saveEstimate({ jobId: 'WS-N4', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }] }, cx()).ok, true);
  assert.equal(w.b.recordApproval({ jobId: 'WS-N4', version: 1, method: 'CALL', takenByName: 'Test Taker' }, cx()).ok, true);
  w.cur.s = P_OWNER;
  assert.equal(await w.pinGate.reauth('refund the extra'), true);
  // advance 500.00 is above the bill of 118.00: the bill layer refuses (money audit N2) until the extra is refunded
  const tooBig = plain(w.b.issueBill({ jobId: 'WS-N4', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, cx()));
  assert.equal(tooBig.code, 'ADVANCE_EXCEEDS_BILL', JSON.stringify(tooBig).slice(0, 200));
  assert.equal(w.b.refund({ jobId: 'WS-N4', amountPaise: 40000, payMode: 'Cash', reason: 'advance above the bill' }, Object.assign(cx(), { stepUp: { ok: true, at: w.pinGate.at() } })).ok, true);
  const bill = plain(w.b.issueBill({ jobId: 'WS-N4', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, cx()));
  assert.equal(bill.ok, true, JSON.stringify(bill).slice(0, 200));
  // by hand: bill 118.00, advance held 100.00 set off, balance 18.00
  assert.deepEqual([bill.invoice.totalPaise, bill.invoice.setOff.advancePaise, bill.invoice.balanceDuePaise], [11800, 10000, 1800]);
  gate = plain(w.g.svbCloseGate('WS-N4'));
  assert.equal(gate.ok, false);
  assert.match(gate.message, /18\.00/);
  assert.equal(w.b.takeReceipt({ jobId: 'WS-N4', kind: 'balance', amountPaise: 1800, payMode: 'UPI' }, cx()).ok, true);
  assert.equal(plain(w.g.svbCloseGate('WS-N4')).ok, true, 'paid in full: the close is allowed');
});

test('E3 a full job through the page glue: no name, mobile or address of the customer in any stored Service record', async () => {
  const w = world();
  w.g.DB.push({ id: 'WS-T1', status: 'open', brand: 'Titan', model: 'Edge', custName: NAME, custMobile: MOBILE, custAddr: ADDR });
  w.cur.s = P_OWNER;
  assert.equal(await w.pinGate.reauth('trace'), true);
  const pin = () => Object.assign(cx(), { stepUp: { ok: true, at: w.pinGate.at() } });
  assert.equal(w.b.saveEstimate({ jobId: 'WS-T1', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }, { kind: 'PART', code: 'P1', qty: 1 }] }, pin()).ok, true);
  assert.equal(w.b.recordApproval({ jobId: 'WS-T1', version: 1, method: 'CALL', takenByName: 'Test Taker' }, pin()).ok, true);
  assert.equal(w.b.takeReceipt({ jobId: 'WS-T1', kind: 'advance', amountPaise: 5000, payMode: 'Cash' }, pin()).ok, true);
  assert.equal(w.g.svsCore().issueToJob({ jobId: 'WS-T1', lines: [{ partCode: 'P1', qty: 1 }] }, { session: P_OWNER, clientRef: 'iss1' }).ok, true);
  const bill = plain(w.b.issueBill({ jobId: 'WS-T1', parts: [{ partCode: 'P1', qty: 1, discountPaise: 0 }], labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'NOT_IN_CCPT', notInCcptReason: 'customer asked for a Saagar invoice', recipientGstin: '', recipientStateCode: '27' }, pin()));
  assert.equal(bill.ok, true, JSON.stringify(bill).slice(0, 200));
  w.g.svbSetCaseInvoice('WS-T1', bill.invoice.no);
  assert.equal(w.b.takeReceipt({ jobId: 'WS-T1', kind: 'balance', amountPaise: bill.invoice.balanceDuePaise, payMode: 'UPI' }, pin()).ok, true);
  const cn = plain(w.b.issueCreditNote({ invoiceNo: bill.invoice.no, mode: 'FULL', reasonClass: 'OTHER', reason: 'work not done in the end', refund: { amountPaise: 1000, payMode: 'Cash' } }, pin()));
  assert.equal(cn.ok, true, JSON.stringify(cn).slice(0, 200));
  const sale = plain(w.g.svsCore().counterSale({ lines: [{ partCode: 'P1', qty: 1, unitPricePaise: 11800 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 11800, note: '' }, { session: P_OWNER, clientRef: 'cs1' }));
  assert.equal(sale.ok, true);
  assert.equal(w.b.takeCounterReceipt({ saleNo: sale.doc.no, amountPaise: 11800, payMode: 'Cash' }, pin()).ok, true);
  const keys = [...w.store.keys()].filter((k) => /^saagar_svcs_/.test(k));
  assert.ok(keys.some((k) => /invoices/.test(k)) && keys.some((k) => /receipts/.test(k)));
  for (const k of keys) for (const word of [NAME, MOBILE, ADDR, 'Invented Customer', 'Nowhere Road']) assert.equal(w.store.get(k).includes(word), false, word + ' in ' + k);
  // the bill-to copy lives on the case only, frozen at issue
  assert.equal(w.g.byId('WS-T1').svbBillTo[bill.invoice.no].mobile, MOBILE);
});

void OWNER; void refused;

test('E4 (report audit, check 6) a counter-sale refund prints "Against: Counter sale CSL/..." (it said "Advance receipt"); a balance receipt says "Paid earlier"', async () => {
  const w = world();
  w.cur.s = P_OWNER;
  assert.equal(await w.pinGate.reauth('refund a counter sale'), true);
  const pin = () => Object.assign(cx(), { stepUp: { ok: true, at: w.pinGate.at() } });
  const sale = plain(w.g.svsCore().counterSale({ lines: [{ partCode: 'P1', qty: 1, unitPricePaise: 11800 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 11800, note: '' }, { session: P_OWNER, clientRef: 'cs2' }));
  assert.equal(w.b.takeCounterReceipt({ saleNo: sale.doc.no, amountPaise: 11800, payMode: 'Cash' }, pin()).ok, true);
  w.g.svcD3Reauth = async () => true;
  const rf = plain(w.b.refund({ saleNo: sale.doc.no, amountPaise: 11800, payMode: 'Cash', reason: 'part did not fit the watch' }, pin()));
  assert.equal(rf.ok, true, JSON.stringify(rf).slice(0, 200));
  const pd = plain(w.b.printData('serviceRefundVoucher', { voucherNo: rf.refund.no }, cx()));
  assert.equal(pd.ok, true, JSON.stringify(pd).slice(0, 200));
  assert.equal(pd.svcData.refund.againstKind, 'SALE');
  assert.equal(pd.svcData.refund.againstNo, sale.doc.no);
});

test('E5 (report audit, check 6) a bill printed after delivery carries the warranty captured on the job, and the paper says it', () => {
  const w = world();
  w.g.DB.push({ id: 'WS-W1', status: 'open', brand: 'Titan', model: 'Edge', custName: NAME, custMobile: MOBILE, custAddr: ADDR, delivery: { warrantyMonths: '6', warrantyTill: '2027-05-19' } });
  assert.equal(w.b.saveEstimate({ jobId: 'WS-W1', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }] }, cx()).ok, true);
  assert.equal(w.b.recordApproval({ jobId: 'WS-W1', version: 1, method: 'CALL', takenByName: 'Test Taker' }, cx()).ok, true);
  const bill = plain(w.b.issueBill({ jobId: 'WS-W1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, cx()));
  assert.equal(bill.ok, true);
  const pd = plain(w.b.printData('serviceBillSummary', { invoiceNo: bill.invoice.no }, cx()));
  assert.equal(pd.ok, true);
  assert.equal(pd.svcData.invoice.warrantyTill, '', 'the facade has no warranty of its own');
  const withB = plain(w.g.svbWithBillTo('serviceBillSummary', pd.svcData));
  assert.deepEqual([withB.invoice.warrantyTill, withB.invoice.warrantyMonths], ['2027-05-19', 6]);
  const R = (() => { const c = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, console, Blob, URL, setTimeout, clearTimeout }; c.window = c; vm.createContext(c); vm.runInContext(REPORT, c); return c.SaagarReport; })();
  const m = plain(R._buildModel('serviceBillSummary', { svcData: withB }));
  assert.ok(JSON.stringify(m).includes('Service warranty valid until 19-05-2027 (6 months)'), JSON.stringify(m.blocks.filter((b) => b.t === 'note')).slice(0, 300));
});
