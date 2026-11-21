// Service wave 2, money layer (www/service-billing-money.js): plan 2.4, 2.8, 2.11, C-MONEY and P4 tests M01 to M17.
// The REAL store file runs over an in-memory adapter. The bill layer view (docsView) is a fake. Expected values are typed by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Money, Store, makeAdapter, makeClock, newStore, openStore, put, build, refused, good, adv,
  OWNER, MANAGER, TECH, TRAINEE, CASHIER, NONE
} from './lib/svc2-money-kit.mjs';

const FORBIDDEN = /^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|e_mail|whatsapp|pan)/i;
const keysOf = (rec) => Object.keys(rec.b).sort();

test('M01 advance happy path: record kind SAR, numbers 0001 and 0002, today IST, actor stored, no forbidden field', () => {
  const h = build();
  h.cases.add('J-1');
  const r = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 50000, payMode: 'Cash', payRef: '', note: 'first' }, h.ctx(OWNER)));
  assert.equal(r.receipt.no, 'SAR/26-27/0001');
  assert.equal(r.receipt.kind, 'SAR');
  assert.equal(r.receipt.docDate, '2026-11-18');
  assert.equal(r.receipt.amountPaise, 50000);
  assert.equal(r.receipt.status, 'OK');
  assert.equal(r.receipt.direction, 'IN');
  assert.deepEqual(r.warnings, []);
  const r2 = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 25000, payMode: 'UPI', payRef: 'UPI0000000001' }, h.ctx(OWNER)));
  assert.equal(r2.receipt.no, 'SAR/26-27/0002');
  const recs = h.records();
  assert.equal(recs.length, 2);
  assert.equal(recs[0].k, 'SAR');
  assert.deepEqual(recs[0].a, { t: 'owner', r: 'Owner', m: 'Test Owner' });
  assert.deepEqual(keysOf(recs[0]), ['amountPaise', 'docDate', 'jobId', 'no', 'note', 'payMode', 'payRef']);
  assert.equal(Number.isInteger(recs[0].b.amountPaise), true);
  for (const rec of recs) for (const k of Object.keys(rec.b)) assert.equal(FORBIDDEN.test(k), false, k);
  // the billing roles and the receipt are one write each
  assert.equal(h.store.head('receipts').rev, 2);
});

test('M02 retry with the same clientRef returns the saved record and writes nothing', () => {
  const h = build();
  h.cases.add('J-1');
  const a = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 50000, payMode: 'Cash' }, h.ctx(OWNER, { clientRef: 'REF-ADV-0001' })));
  assert.equal(a.replayed, undefined);
  const before = h.text();
  const b = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 50000, payMode: 'Cash' }, h.ctx(OWNER, { clientRef: 'REF-ADV-0001' })));
  assert.equal(b.replayed, true);
  assert.equal(b.receipt.no, 'SAR/26-27/0001');
  assert.equal(h.text(), before);
  assert.equal(h.records().length, 1);
  // a bad reference text is refused, a reference used by another kind is a duplicate
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 1, payMode: 'Cash' }, h.ctx(OWNER, { clientRef: 'x' })), 'INPUT_INVALID', before);
  h.view.issue('J-1', 1000);
  const refusedRef = h.api.takeBalance({ jobId: 'J-1', invoiceNo: 'SV/2026-27/0001', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER, { clientRef: 'REF-ADV-0001' }));
  refused(h, refusedRef, 'SVCS_DUPLICATE_REF', before);
});

test('M03 amounts: zero, negative, fraction, text, NaN refused; the ceiling works; one over is too large', () => {
  const h = build();
  h.cases.add('J-1');
  const before = h.text();
  for (const bad of [0, -5, 1.5, '100', NaN, Infinity, null, undefined]) {
    refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: bad, payMode: 'Cash' }, h.ctx(OWNER)), 'AMOUNT_INVALID', before);
  }
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100000001, payMode: 'Cash' }, h.ctx(OWNER)), 'AMOUNT_TOO_LARGE', before);
  const r = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100000000, payMode: 'Cash' }, h.ctx(OWNER)));
  assert.equal(r.receipt.amountPaise, 100000000);
  // a cash receipt of Rs 2,00,000 or more carries a warning, never a failure
  assert.deepEqual(r.warnings, ['CASH_LIMIT_WARN']);
  const r2 = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 19999999, payMode: 'Cash' }, h.ctx(OWNER)));
  assert.deepEqual(r2.warnings, []);
  const r3 = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 20000000, payMode: 'UPI' }, h.ctx(OWNER)));
  assert.deepEqual(r3.warnings, []);
  const r4 = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 20000000, payMode: 'Cash' }, h.ctx(OWNER)));
  assert.deepEqual(r4.warnings, ['CASH_LIMIT_WARN']);
});

test('M04 pay modes and references', () => {
  const h = build();
  h.cases.add('J-1');
  const before = h.text();
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Other' }, h.ctx(OWNER)), 'PAYMODE_INVALID', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'cash' }, h.ctx(OWNER)), 'PAYMODE_INVALID', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100 }, h.ctx(OWNER)), 'PAYMODE_INVALID', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Bank', payRef: '1234567890123456' }, h.ctx(OWNER)), 'PAYREF_LOOKS_LIKE_CARD', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Card', payRef: '4111 1111 1111 1111' }, h.ctx(OWNER)), 'PAYREF_LOOKS_LIKE_CARD', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'UPI', payRef: 'x'.repeat(41) }, h.ctx(OWNER)), 'PAYREF_INVALID', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'UPI', payRef: 12345 }, h.ctx(OWNER)), 'PAYREF_INVALID', before);
  for (const mode of ['Cash', 'UPI', 'Card', 'Bank']) {
    good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: mode }, h.ctx(OWNER)));
  }
  // 12 digits (a normal UPI reference) and exactly 40 characters are fine
  const ok12 = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'UPI', payRef: '123456789012' }, h.ctx(OWNER)));
  assert.equal(ok12.receipt.payRef, '123456789012');
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'UPI', payRef: 'y'.repeat(40) }, h.ctx(OWNER)));
  // the cash book mapping words
  const n = h.api.normalizePayMode;
  assert.deepEqual(['Cash', 'UPI', 'Card', 'Bank', 'Other', 'net banking', 'Google UPI', 'credit card', 'petty cash', '', null].map(n),
    ['Cash', 'UPI', 'Card', 'Bank', 'Bank', 'Bank', 'UPI', 'Card', 'Cash', 'Bank', 'Bank']);
  assert.equal(Money.normalizePayMode('Card'), 'Card');
});

test('M05 role table, Owner PIN freshness, no session', () => {
  const h = build();
  h.cases.add('J-1');
  let before = h.text();
  // a plain staff role cannot take money; a store-class role cannot take a job receipt; broken sessions are refused
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(TRAINEE)), 'NOT_ALLOWED', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(TECH)), 'NOT_ALLOWED', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(NONE)), 'SESSION_REQUIRED', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, {}), 'SESSION_REQUIRED', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx({ ok: true, tier: 'owner', isOwner: false, role: 'Owner', actorName: 'x' })), 'SESSION_REQUIRED', before);
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx({ ok: true, tier: 'staff', isOwner: false, isManager: true, role: 'Cashier', actorName: 'x' })), 'SESSION_REQUIRED', before);
  // billing staff, manager and owner may take an advance
  const a1 = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 10000, payMode: 'Cash' }, h.ctx(CASHIER)));
  assert.deepEqual(a1.receipt.by, { name: 'Test Cashier', role: 'Cashier', tier: 'staff' });
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 10000, payMode: 'Cash' }, h.ctx(MANAGER)));
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 10000, payMode: 'Cash' }, h.ctx(OWNER)));
  // reversal: staff (even billing staff) refused, manager same day ok
  before = h.text();
  refused(h, h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong job picked' }, h.ctx(CASHIER)), 'NOT_ALLOWED', before);
  const rv = good(h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong job picked' }, h.ctx(MANAGER)));
  assert.equal(rv.reversed, 'SAR/26-27/0001');
  // refund: manager refused even with a fresh PIN stamp; owner needs the stamp
  before = h.text();
  const input = { jobId: 'J-1', amountPaise: 1000, payMode: 'Cash', reason: 'customer took it back' };
  refused(h, h.api.refund(input, h.pin(MANAGER)), 'NOT_ALLOWED', before);
  refused(h, h.api.refund(input, h.ctx(CASHIER)), 'NOT_ALLOWED', before);
  refused(h, h.api.refund(input, h.ctx(OWNER)), 'PIN_REQUIRED', before);
  const old = { session: OWNER, stepUp: { ok: true, at: Date.parse(h.clock.iso) - 120001 } };
  refused(h, h.api.refund(input, old), 'PIN_REQUIRED', before);
  const future = { session: OWNER, stepUp: { ok: true, at: Date.parse(h.clock.iso) + 5000 } };
  refused(h, h.api.refund(input, future), 'PIN_REQUIRED', before);
  const notOk = { session: OWNER, stepUp: { ok: false, at: Date.parse(h.clock.iso) } };
  refused(h, h.api.refund(input, notOk), 'PIN_REQUIRED', before);
  const edge = { session: OWNER, stepUp: { ok: true, at: Date.parse(h.clock.iso) - 120000 } };
  const rf = good(h.api.refund(input, edge));
  assert.equal(rf.refund.no, 'SRF/26-27/0001');
  assert.deepEqual(rf.refund.by, { name: 'Test Owner', role: 'Owner', tier: 'owner' });
  assert.equal(rf.refund.pinAt, Date.parse(h.clock.iso) - 120000);
});

test('M05b the role lists come from the settings streams; a plain staff role can be added', () => {
  const h = build({ settings: false });
  h.cases.add('J-1');
  // no settings yet: nobody below Manager takes money, and no store-class role exists
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(CASHIER)), 'NOT_ALLOWED');
  put(h.store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: ['Cashier', 'CRO'], estimateRoles: [] } });
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(CASHIER)));
  // the latest setting wins
  put(h.store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] } });
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(CASHIER)), 'NOT_ALLOWED');
  // the Owner and the Manager always can
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(MANAGER)));
});

test('M06 job rules: unknown, closed and voided jobs refused; a stub job warns', () => {
  const h = build();
  h.cases.add('J-OPEN').add('J-CLOSED', { status: 'closed' }).add('J-VOID', { status: 'closed', voided: true }).add('J-VIEWVOID').add('J-STUB', { stub: true });
  h.view.voided.add('J-VIEWVOID');
  const before = h.text();
  const t = (jobId) => h.api.takeAdvance({ jobId, amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER));
  refused(h, t('J-NOPE'), 'JOB_NOT_FOUND', before);
  refused(h, t(''), 'INPUT_INVALID', before);
  refused(h, t('x'.repeat(61)), 'INPUT_INVALID', before);
  refused(h, t('J-CLOSED'), 'JOB_CLOSED', before);
  refused(h, t('J-VOID'), 'JOB_VOID', before);
  refused(h, t('J-VIEWVOID'), 'JOB_VOID', before);
  good(t('J-OPEN'));
  const stub = good(t('J-STUB'));
  assert.deepEqual(stub.warnings, ['JOB_IS_STUB']);
});

test('M07 balance receipt: invoice rules, part payments, exact balance, one paisa more refused', () => {
  const h = build();
  h.cases.add('J-1');
  const bal = (amountPaise, extra = {}) => h.api.takeBalance(Object.assign({ jobId: 'J-1', invoiceNo: 'SV/2026-27/0001', amountPaise, payMode: 'UPI' }, extra), h.ctx(CASHIER));
  let before = h.text();
  refused(h, bal(100), 'INVOICE_REQUIRED', before);
  adv(h, 'J-1', 30000);
  const no = h.view.issue('J-1', 100000);
  assert.equal(no, 'SV/2026-27/0001');
  before = h.text();
  // an advance when a bill exists is a balance receipt
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)), 'INVOICE_EXISTS_USE_BALANCE', before);
  refused(h, bal(100, { invoiceNo: 'SV/2026-27/0099' }), 'INVOICE_NOT_FOUND', before);
  refused(h, bal(100, { invoiceNo: '' }), 'INPUT_INVALID', before);
  refused(h, bal(70001), 'RECEIPT_EXCEEDS_BALANCE', before);
  const p1 = good(bal(40000));
  assert.equal(p1.receipt.no, 'SRC/26-27/0001');
  assert.equal(p1.receipt.invoiceNo, 'SV/2026-27/0001');
  assert.equal(p1.receipt.jobId, 'J-1');
  assert.equal(h.api.jobMoney('J-1').outstandingPaise, 30000);
  const p2 = good(bal(30000));
  assert.equal(p2.receipt.no, 'SRC/26-27/0002');
  before = h.text();
  refused(h, bal(1), 'RECEIPT_EXCEEDS_BALANCE', before);
  const jm = h.api.jobMoney('J-1');
  assert.equal(jm.receivedPaise, 100000);
  assert.equal(jm.netPaise, 100000);
  assert.equal(jm.outstandingPaise, 0);
  assert.equal(jm.refundablePaise, 0);
  assert.equal(jm.hasLive, true);
  // a credit note lowers the amount due: 100000 - 20000 = 80000, so 20000 of the 100000 can go back
  h.view.invoices.set('J-1', Object.assign({}, h.view.invoices.get('J-1'), { creditedPaise: 20000 }));
  assert.equal(h.api.jobMoney('J-1').refundablePaise, 20000);
  assert.equal(h.api.jobMoney('J-1').outstandingPaise, 0);
});

test('M07b balance on a closed job only with an issued bill; cancelled bill refused', () => {
  const h = build();
  h.cases.add('J-C', { status: 'closed' }).add('J-D', { status: 'closed' }).add('J-E');
  const bal = (jobId, no) => h.api.takeBalance({ jobId, invoiceNo: no, amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER));
  let before = h.text();
  refused(h, bal('J-C', 'SV/2026-27/0001'), 'JOB_CLOSED', before);
  h.view.issue('J-D', 5000, 'SV/2026-27/0001');
  good(bal('J-D', 'SV/2026-27/0001'));
  h.view.issue('J-E', 5000, 'SV/2026-27/0002');
  h.view.cancel('J-E');
  before = h.text();
  refused(h, bal('J-E', 'SV/2026-27/0002'), 'INVOICE_CANCELLED', before);
});

test('M08 cancelled bill: its receipts stay as held money and the job shows in advances held', () => {
  const h = build();
  h.cases.add('J-1');
  adv(h, 'J-1', 30000);
  h.view.issue('J-1', 50000, 'SV/2026-27/0001');
  good(h.api.takeBalance({ jobId: 'J-1', invoiceNo: 'SV/2026-27/0001', amountPaise: 20000, payMode: 'Cash' }, h.ctx(OWNER)));
  let held = h.api.advancesHeld();
  assert.deepEqual(held.rows, []);
  h.view.cancel('J-1');
  const jm = h.api.jobMoney('J-1');
  assert.equal(jm.netPaise, 50000);
  assert.equal(jm.outstandingPaise, 0);
  assert.equal(jm.refundablePaise, 50000);
  held = h.api.advancesHeld();
  assert.equal(held.rows.length, 1);
  assert.equal(held.rows[0].jobId, 'J-1');
  assert.equal(held.rows[0].netPaise, 50000);
  assert.equal(held.rows[0].jobState, 'INVOICE_CANCELLED');
  assert.deepEqual(held.rows[0].receipts, ['SAR/26-27/0001', 'SRC/26-27/0001']);
  assert.equal(held.totalPaise, 50000);
});

test('M09 counter receipt', () => {
  const h = build();
  const sale = (no, extra = {}) => h.view.sales.set(no, Object.assign({ no, docDate: '2026-11-18', amountPaise: 25000, rcptDue: true, reversed: false }, extra));
  sale('CSL/26-27/0007');
  sale('CSL/26-27/0008', { rcptDue: false });
  sale('CSL/26-27/0009', { reversed: true });
  const rc = (saleNo, amountPaise, who = TECH) => h.api.takeCounterReceipt({ saleNo, amountPaise, payMode: 'Cash' }, h.ctx(who));
  let before = h.text();
  refused(h, rc('CSL/26-27/0007', 25000, TRAINEE), 'NOT_ALLOWED', before);
  refused(h, rc('CSL/26-27/0099', 25000), 'SALE_NOT_FOUND', before);
  refused(h, rc('not a sale', 25000), 'INPUT_INVALID', before);
  refused(h, rc('CSL/26-27/0008', 25000), 'NOT_RECEIPTABLE', before);
  refused(h, rc('CSL/26-27/0009', 25000), 'NOT_RECEIPTABLE', before);
  refused(h, rc('CSL/26-27/0007', 24999), 'AMOUNT_MISMATCH', before);
  const r = good(rc('CSL/26-27/0007', 25000));
  assert.equal(r.receipt.no, 'SRC/26-27/0001');
  assert.equal(r.receipt.saleNo, 'CSL/26-27/0007');
  assert.equal(r.receipt.jobId, undefined);
  const rec = h.records()[0];
  assert.equal(rec.r, 'CSLRC:CSL/26-27/0007');
  assert.deepEqual(keysOf(rec), ['amountPaise', 'docDate', 'no', 'note', 'payMode', 'payRef', 'saleNo']);
  before = h.text();
  refused(h, rc('CSL/26-27/0007', 25000), 'COUNTER_RECEIPT_EXISTS', before);
  // billing staff, manager and owner may take it too
  sale('CSL/26-27/0010');
  good(rc('CSL/26-27/0010', 25000, CASHIER));
});

test('M10 refund rules', () => {
  const h = build();
  h.cases.add('J-1').add('J-2').add('J-3');
  adv(h, 'J-1', 30000);
  adv(h, 'J-2', 15000, 'UPI');
  const rf = (extra, who = OWNER) => h.api.refund(Object.assign({ amountPaise: 1000, payMode: 'Cash', reason: 'goods returned' }, extra), h.pin(who));
  let before = h.text();
  refused(h, rf({ jobId: 'J-1', amountPaise: 30001 }), 'REFUND_EXCEEDS_REFUNDABLE', before);
  refused(h, rf({ jobId: 'J-3' }), 'REFUND_EXCEEDS_REFUNDABLE', before);
  refused(h, rf({ jobId: 'J-1', reason: 'abcd' }), 'REASON_REQUIRED', before);
  refused(h, rf({ jobId: 'J-1', reason: '' }), 'REASON_REQUIRED', before);
  refused(h, rf({ jobId: 'J-1', reason: undefined }), 'REASON_REQUIRED', before);
  refused(h, rf({}), 'INPUT_INVALID', before);
  refused(h, rf({ jobId: 'J-1', saleNo: 'CSL/26-27/0001' }), 'INPUT_INVALID', before);
  refused(h, rf({ jobId: 'J-1', payMode: 'Other' }), 'PAYMODE_INVALID', before);
  // an advance can go back with no bill and no credit note
  const r = good(rf({ jobId: 'J-1', amountPaise: 30000, advanceNo: 'SAR/26-27/0001' }));
  assert.equal(r.refund.no, 'SRF/26-27/0001');
  assert.equal(r.refund.kind, 'SRF');
  assert.equal(r.refund.direction, 'OUT');
  assert.equal(r.refund.advanceNo, 'SAR/26-27/0001');
  assert.equal(h.api.jobMoney('J-1').netPaise, 0);
  before = h.text();
  refused(h, rf({ jobId: 'J-1', amountPaise: 1 }), 'REFUND_EXCEEDS_REFUNDABLE', before);
  refused(h, rf({ jobId: 'J-2', advanceNo: 'SAR/26-27/0001' }), 'INPUT_INVALID', before);
  // an issued bill needs a credit note of the same job
  h.view.issue('J-2', 100000, 'SV/2026-27/0001');
  good(h.api.takeBalance({ jobId: 'J-2', invoiceNo: 'SV/2026-27/0001', amountPaise: 85000, payMode: 'Cash' }, h.ctx(OWNER)));
  h.view.notes.set('SCN/26-27/0001', { no: 'SCN/26-27/0001', jobId: 'J-2', totalPaise: 20000 });
  h.view.notes.set('SCN/26-27/0002', { no: 'SCN/26-27/0002', jobId: 'J-OTHER', totalPaise: 20000 });
  before = h.text();
  refused(h, rf({ jobId: 'J-2' }), 'CREDIT_NOTE_REQUIRED', before);
  refused(h, rf({ jobId: 'J-2', cnNo: 'SCN/26-27/0002' }), 'CREDIT_NOTE_REQUIRED', before);
  refused(h, rf({ jobId: 'J-2', cnNo: 'SCN/26-27/0009' }), 'CREDIT_NOTE_REQUIRED', before);
  // before the credit note is counted by the bill layer nothing is refundable: net 100000 equals the bill
  refused(h, rf({ jobId: 'J-2', cnNo: 'SCN/26-27/0001' }), 'REFUND_EXCEEDS_REFUNDABLE', before);
  h.view.invoices.set('J-2', Object.assign({}, h.view.invoices.get('J-2'), { creditedPaise: 20000 }));
  refused(h, rf({ jobId: 'J-2', cnNo: 'SCN/26-27/0001', amountPaise: 20001 }), 'REFUND_EXCEEDS_REFUNDABLE', before);
  const r2 = good(rf({ jobId: 'J-2', cnNo: 'SCN/26-27/0001', amountPaise: 20000 }));
  assert.equal(r2.refund.no, 'SRF/26-27/0002');
  assert.equal(r2.refund.cnNo, 'SCN/26-27/0001');
  assert.equal(h.api.jobMoney('J-2').netPaise, 80000);
  assert.equal(h.api.jobMoney('J-2').refundedPaise, 20000);
});

test('M10b advance on a voided job can be refunded; a job that is gone from the job list can too', () => {
  const h = build();
  h.cases.add('J-V');
  adv(h, 'J-V', 15000);
  h.cases.jobs.get('J-V').status = 'closed';
  h.cases.jobs.get('J-V').voided = true;
  const held = h.api.advancesHeld();
  assert.equal(held.rows[0].jobState, 'VOID');
  assert.equal(held.rows[0].flag, true);
  good(h.api.refund({ jobId: 'J-V', amountPaise: 15000, payMode: 'Cash', reason: 'job was voided' }, h.pin(OWNER)));
  assert.deepEqual(h.api.advancesHeld().rows, []);
  // a job that is gone from the job list can still get its held money back
  h.cases.add('J-W');
  adv(h, 'J-W', 700);
  h.cases.jobs.delete('J-W');
  const r = good(h.api.refund({ jobId: 'J-W', amountPaise: 700, payMode: 'Cash', reason: 'job record is gone' }, h.pin(OWNER)));
  assert.equal(r.refund.jobId, 'J-W');
});

test('M11 reversal rules', () => {
  const h = build();
  h.cases.add('J-1').add('J-2').add('J-3', { status: 'open' });
  adv(h, 'J-1', 30000);                              // SAR 0001
  adv(h, 'J-2', 20000, 'UPI');                       // SAR 0002
  adv(h, 'J-3', 1000);                               // SAR 0003
  const rv = (no, reason = 'entered on the wrong job', who = MANAGER) => h.api.reverse({ no, reason }, h.ctx(who));
  let before = h.text();
  refused(h, rv('SAR/26-27/0001', 'abcd'), 'REASON_REQUIRED', before);
  refused(h, rv('SAR/26-27/0099'), 'RECEIPT_NOT_FOUND', before);
  refused(h, rv('nonsense'), 'RECEIPT_NOT_FOUND', before);
  const r = good(rv('SAR/26-27/0001'));
  assert.equal(r.reversed, 'SAR/26-27/0001');
  assert.equal(r.reversal.kind, 'RRV');
  assert.equal(r.reversal.side, 'IN');
  assert.equal(r.reversal.amountPaise, 30000);
  assert.equal(r.reversal.reverses, 'SAR/26-27/0001');
  const stored = h.records()[3];
  assert.equal(stored.k, 'RRV');
  assert.equal(stored.r, 'REVOF:SAR/26-27/0001');
  assert.deepEqual(keysOf(stored), ['amountPaise', 'docDate', 'pinAt', 'reason', 'reverses', 'side']);
  assert.equal(stored.b.pinAt, null);
  // totals leave the reversed receipt out; the view says so
  assert.equal(h.api.jobMoney('J-1').netPaise, 0);
  assert.equal(h.api.jobMoney('J-1').hasLive, false);
  const v = h.api.receiptView('SAR/26-27/0001').receipt;
  assert.equal(v.status, 'REVERSED');
  assert.equal(v.reversal.reason, 'entered on the wrong job');
  assert.equal(v.reversal.by.name, 'Test Manager');
  // twice
  before = h.text();
  refused(h, rv('SAR/26-27/0001'), 'ALREADY_REVERSED', before);
  // a closed job
  h.cases.jobs.get('J-2').status = 'closed';
  refused(h, rv('SAR/26-27/0002'), 'JOB_CLOSED', before);
  h.cases.jobs.get('J-2').status = 'open';
  // the next day
  h.day('2026-11-19T05:00:00.000Z');
  before = h.text();
  refused(h, rv('SAR/26-27/0002'), 'NOT_SAME_DAY', before);
  // the Owner follows the same rule: the next day only a refund helps
  refused(h, rv('SAR/26-27/0002', 'entered on the wrong job', OWNER), 'NOT_SAME_DAY', before);
  // 18:29 UTC is still 23:59 India time of the same day; 18:30 UTC is the next India day
  const h2 = build({ start: '2026-11-19T05:00:00.000Z' });
  h2.cases.add('J-1');
  adv(h2, 'J-1', 100);
  h2.day('2026-11-19T18:29:59.000Z');
  good(h2.api.reverse({ no: 'SAR/26-27/0001', reason: 'late the same evening' }, h2.ctx(MANAGER)));
  const h3 = build({ start: '2026-11-19T05:00:00.000Z' });
  h3.cases.add('J-1');
  adv(h3, 'J-1', 100);
  h3.day('2026-11-19T18:30:00.000Z');
  refused(h3, h3.api.reverse({ no: 'SAR/26-27/0001', reason: 'after midnight in India' }, h3.ctx(MANAGER)), 'NOT_SAME_DAY');
});

test('M11b refund reversal needs the Owner PIN; REFUND_FIRST when the money was already given back', () => {
  const h = build();
  h.cases.add('J-1');
  adv(h, 'J-1', 1000);
  good(h.api.refund({ jobId: 'J-1', amountPaise: 400, payMode: 'Cash', reason: 'part returned' }, h.pin(OWNER)));
  let before = h.text();
  // the advance cannot be reversed while 400 of it was given back
  refused(h, h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong job picked' }, h.ctx(MANAGER)), 'REFUND_FIRST', before);
  refused(h, h.api.reverse({ no: 'SRF/26-27/0001', reason: 'refund typed twice' }, h.ctx(MANAGER)), 'NOT_ALLOWED', before);
  refused(h, h.api.reverse({ no: 'SRF/26-27/0001', reason: 'refund typed twice' }, h.ctx(OWNER)), 'PIN_REQUIRED', before);
  const r = good(h.api.reverse({ no: 'SRF/26-27/0001', reason: 'refund typed twice' }, h.pin(OWNER)));
  assert.equal(r.reversal.side, 'OUT');
  assert.equal(r.reversal.amountPaise, 400);
  assert.equal(typeof r.reversal.pinAt, 'number');
  assert.equal(h.api.jobMoney('J-1').refundedPaise, 0);
  assert.equal(h.api.jobMoney('J-1').netPaise, 1000);
  good(h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong job picked' }, h.ctx(MANAGER)));
  assert.equal(h.api.jobMoney('J-1').netPaise, 0);
});

test('M11c a counter receipt is reversed the same day by the Manager; its fixed reference then blocks a second receipt', () => {
  const h = build();
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 9000, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 9000, payMode: 'UPI' }, h.ctx(MANAGER)));
  assert.equal(h.api.saleMoney('CSL/26-27/0001').netPaise, 9000);
  good(h.api.reverse({ no: 'SRC/26-27/0001', reason: 'sale is being cancelled' }, h.ctx(MANAGER)));
  assert.equal(h.api.saleMoney('CSL/26-27/0001').netPaise, 0);
  assert.equal(h.api.saleMoney('CSL/26-27/0001').hasLive, false);
  refused(h, h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 9000, payMode: 'UPI' }, h.ctx(MANAGER)), 'COUNTER_RECEIPT_EXISTS');
  // a later-day counter refund goes through a refund by saleNo
  h.view.sales.set('CSL/26-27/0002', { no: 'CSL/26-27/0002', docDate: '2026-11-18', amountPaise: 5000, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0002', amountPaise: 5000, payMode: 'Cash' }, h.ctx(MANAGER)));
  h.day('2026-11-20T05:00:00.000Z');
  const rf = (amountPaise, saleNo = 'CSL/26-27/0002') => h.api.refund({ saleNo, amountPaise, payMode: 'Cash', reason: 'sale returned' }, h.pin(OWNER));
  refused(h, rf(5001), 'REFUND_EXCEEDS_REFUNDABLE');
  refused(h, rf(100, 'CSL/26-27/0077'), 'SALE_NOT_FOUND');
  const r = good(rf(5000));
  assert.equal(r.refund.saleNo, 'CSL/26-27/0002');
  assert.equal(r.refund.jobId, undefined);
  assert.equal(h.api.saleMoney('CSL/26-27/0002').netPaise, 0);
});

test('M12 old typed advance: Owner decision, in book or post now', () => {
  const h = build();
  h.cases.add('J-A', { typedAdvancePaise: 200000 }).add('J-B', { typedAdvancePaise: 150000 }).add('J-C', { typedAdvancePaise: 0 });
  assert.deepEqual(h.api.legacyAdvances().rows.map((x) => [x.jobId, x.typedPaise]), [['J-A', 200000], ['J-B', 150000]]);
  assert.equal(h.api.legacyAdvances().totalPaise, 350000);
  // before a decision, no receipt on the job
  let before = h.text();
  refused(h, h.api.takeAdvance({ jobId: 'J-A', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)), 'LEGACY_ADVANCE_UNCONFIRMED', before);
  h.view.issue('J-A', 500000, 'SV/2026-27/0001');
  refused(h, h.api.takeBalance({ jobId: 'J-A', invoiceNo: 'SV/2026-27/0001', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)), 'LEGACY_ADVANCE_UNCONFIRMED', before);
  h.view.invoices.delete('J-A');
  // decision rules
  const dec = (extra, ctx = h.pin(OWNER)) => h.api.decideLegacyAdvance(Object.assign({ jobId: 'J-A', decision: 'IN_BOOK', amountPaise: 200000 }, extra), ctx);
  refused(h, dec({}, h.ctx(OWNER)), 'PIN_REQUIRED', before);
  refused(h, dec({}, h.pin(MANAGER)), 'NOT_ALLOWED', before);
  refused(h, dec({}, h.pin(CASHIER)), 'NOT_ALLOWED', before);
  refused(h, dec({ amountPaise: 199999 }), 'AMOUNT_MISMATCH', before);
  refused(h, dec({ decision: 'MAYBE' }), 'INPUT_INVALID', before);
  refused(h, dec({ jobId: 'J-C', amountPaise: 100 }), 'NO_LEGACY_ADVANCE', before);
  refused(h, dec({ jobId: 'J-NOPE' }), 'JOB_NOT_FOUND', before);
  const a = good(dec({}));
  assert.equal(a.receipt.no, 'SAR/26-27/0001');
  assert.equal(a.receipt.legacy, true);
  assert.equal(a.receipt.inBook, true);
  const rec = h.records()[0];
  assert.equal(rec.r, 'LEGADV:J-A');
  assert.equal(rec.b.legacy, true);
  assert.equal(rec.b.inBook, true);
  // the job leaves the legacy list; the money is held, but never in the day totals
  assert.deepEqual(h.api.legacyAdvances().rows.map((x) => x.jobId), ['J-B']);
  assert.equal(h.api.jobMoney('J-A').netPaise, 200000);
  assert.equal(h.api.jobMoney('J-A').legacyDecided, true);
  assert.equal(h.api.jobMoney('J-A').legacyTypedPaise, 200000);
  assert.equal(h.api.daySummary('2026-11-18', h.ctx(OWNER)).receipts.total, 0);
  assert.equal(h.api.daySummary('2026-11-18', h.ctx(OWNER)).advancesHeldNow.paise, 200000);
  before = h.text();
  refused(h, dec({}), 'DECISION_EXISTS', before);
  refused(h, dec({ decision: 'POST_NOW' }), 'DECISION_EXISTS', before);
  // after the decision the job takes money again
  good(h.api.takeAdvance({ jobId: 'J-A', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)));
  // post now
  const b = good(dec({ jobId: 'J-B', decision: 'POST_NOW', amountPaise: 150000, payMode: 'UPI' }));
  assert.equal(b.receipt.inBook, undefined);
  assert.equal(b.receipt.legacy, true);
  assert.equal(b.receipt.payMode, 'UPI');
  const ds = h.api.daySummary('2026-11-18', h.ctx(OWNER));
  assert.equal(ds.receipts.UPI, 150000);
  assert.equal(ds.receipts.Cash, 100);
  assert.equal(ds.receipts.total, 150100);
});

test('M12b legacy decision on a job that already has money or is closed', () => {
  const h = build();
  h.cases.add('J-A', { typedAdvancePaise: 1000 }).add('J-Z', { typedAdvancePaise: 1000, status: 'closed' });
  const before = h.text();
  refused(h, h.api.decideLegacyAdvance({ jobId: 'J-Z', decision: 'IN_BOOK', amountPaise: 1000 }, h.pin(OWNER)), 'JOB_CLOSED', before);
  // typed text is read through the calc layer when only the text is known
  h.cases.add('J-T', { advancePaid: 'Rs 2,500.50' });
  const row = h.api.legacyAdvances().rows.find((x) => x.jobId === 'J-T');
  assert.equal(row.typedPaise, 250050);
  assert.equal(row.typedText, 'Rs 2,500.50');
  assert.equal(Money.parsePaise('2,500.5'), 250050);
  assert.equal(Money.parsePaise('abc'), null);
  assert.equal(Money.parsePaise(12), null);
  assert.equal(Money.paiseToRupeesText(123457), '1,234.57');
  assert.equal(Money.paiseToRupeesText(5), '0.05');
});

test('M13 day summary arithmetic', () => {
  const h = build();
  ['J-A', 'J-B', 'J-C', 'J-D', 'J-F'].forEach((id) => h.cases.add(id));
  h.cases.add('J-E', { typedAdvancePaise: 150000 });
  adv(h, 'J-A', 33333, 'Cash');                      // SAR 0001
  adv(h, 'J-B', 33333, 'UPI');                       // SAR 0002
  adv(h, 'J-C', 33334, 'Card');                      // SAR 0003
  adv(h, 'J-D', 10000, 'Bank');                      // SAR 0004, reversed below
  good(h.api.reverse({ no: 'SAR/26-27/0004', reason: 'wrong job picked' }, h.ctx(MANAGER)));
  good(h.api.decideLegacyAdvance({ jobId: 'J-E', decision: 'IN_BOOK', amountPaise: 150000 }, h.pin(OWNER)));   // SAR 0005, not money today
  h.view.issue('J-F', 50000, 'SV/2026-27/0001');
  good(h.api.takeBalance({ jobId: 'J-F', invoiceNo: 'SV/2026-27/0001', amountPaise: 20000, payMode: 'Cash' }, h.ctx(CASHIER)));   // SRC 0001
  h.view.sales.set('CSL/26-27/0003', { no: 'CSL/26-27/0003', docDate: '2026-11-18', amountPaise: 5000, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0003', amountPaise: 5000, payMode: 'UPI' }, h.ctx(TECH)));          // SRC 0002
  good(h.api.refund({ jobId: 'J-A', amountPaise: 3000, payMode: 'Cash', reason: 'part returned' }, h.pin(OWNER)));          // SRF 0001
  h.view.invoicesDay.set('2026-11-18', { count: 1, paise: 50000, cancelled: 0 });
  const s = h.api.daySummary('2026-11-18', h.ctx(MANAGER));
  assert.equal(s.ok, true);
  assert.equal(s.date, '2026-11-18');
  assert.deepEqual(s.receipts, { Cash: 53333, UPI: 38333, Card: 33334, Bank: 0, total: 125000 });
  assert.deepEqual(s.refunds, { Cash: 3000, UPI: 0, Card: 0, Bank: 0, total: 3000 });
  assert.equal(s.netCash, 50333);
  assert.equal(s.netAll, 122000);
  assert.deepEqual(s.advancesTaken, { count: 3, paise: 100000 });
  assert.deepEqual(s.balanceReceipts, { count: 1, paise: 20000 });
  assert.deepEqual(s.counterReceipts, { count: 1, paise: 5000 });
  assert.deepEqual(s.reversed, { count: 1, paise: 10000 });
  assert.deepEqual(s.invoicesIssued, { available: true, count: 1, paise: 50000, cancelled: 0 });
  assert.deepEqual(s.creditNotes, { available: true, count: 0, paise: 0 });
  assert.deepEqual(s.notAvailable, []);
  // held now: J-A 30333, J-B 33333, J-C 33334, J-E 150000 (in book); J-F has a live bill; J-D is back to zero
  assert.deepEqual(s.advancesHeldNow, { count: 4, paise: 247000 });
  // another day is empty, a bad date and a staff session are refused
  const t = h.api.daySummary('2026-11-17', h.ctx(OWNER));
  assert.equal(t.receipts.total, 0);
  assert.equal(t.netCash, 0);
  assert.deepEqual(t.reversed, { count: 0, paise: 0 });
  refused(h, h.api.daySummary('2026-13-40', h.ctx(OWNER)), 'INPUT_INVALID');
  refused(h, h.api.daySummary('2026-11-18', h.ctx(CASHIER)), 'NOT_ALLOWED');
  refused(h, h.api.daySummary('2026-11-18', h.ctx(NONE)), 'SESSION_REQUIRED');
});

test('M14 advances held table', () => {
  const h = build({ start: '2026-11-16T05:00:00.000Z' });
  for (const id of ['J-H1', 'J-H2', 'J-H3', 'J-H4', 'J-H5', 'J-H7']) h.cases.add(id);
  h.cases.add('J-H6', { typedAdvancePaise: 7000 });
  adv(h, 'J-H1', 10000);                                     // 16 Nov, open, no bill: listed
  h.day('2026-11-17T05:00:00.000Z');
  adv(h, 'J-H2', 20000);
  h.view.issue('J-H2', 90000, 'SV/2026-27/0001');            // a live bill: not listed
  adv(h, 'J-H3', 30000);
  h.view.issue('J-H3', 90000, 'SV/2026-27/0002');
  h.view.cancel('J-H3');                                     // cancelled bill: listed
  adv(h, 'J-H5', 5000);
  good(h.api.refund({ jobId: 'J-H5', amountPaise: 5000, payMode: 'Cash', reason: 'job dropped' }, h.pin(OWNER)));   // net 0: not listed
  adv(h, 'J-H7', 4000);
  h.cases.jobs.get('J-H7').status = 'closed';                // closed with no bill: listed, flagged
  h.day('2026-11-18T05:00:00.000Z');
  adv(h, 'J-H4', 6000);
  h.cases.jobs.get('J-H4').status = 'closed';
  h.cases.jobs.get('J-H4').voided = true;                    // voided: listed, flagged
  const held = h.api.advancesHeld(h.ctx(MANAGER));
  assert.equal(held.ok, true);
  assert.deepEqual(held.rows.map((r) => [r.jobId, r.netPaise, r.oldestDocDate, r.ageDays, r.jobState, r.flag]), [
    ['J-H1', 10000, '2026-11-16', 2, 'OPEN', false],
    ['J-H3', 30000, '2026-11-17', 1, 'INVOICE_CANCELLED', true],
    ['J-H7', 4000, '2026-11-17', 1, 'CLOSED_NO_INVOICE', true],
    ['J-H4', 6000, '2026-11-18', 0, 'VOID', true]
  ]);
  assert.equal(held.totalPaise, 50000);
  assert.equal(held.count, 4);
  // the old typed advance is on the other list, not here
  assert.deepEqual(h.api.legacyAdvances().rows.map((r) => r.jobId), ['J-H6']);
  assert.equal(held.rows.some((r) => r.jobId === 'J-H6'), false);
  refused(h, h.api.advancesHeld(h.ctx(CASHIER)), 'NOT_ALLOWED');
  refused(h, h.api.advancesHeld({}, h.ctx(TECH)), 'NOT_ALLOWED');
  // a job that is gone from the job list still shows
  h.cases.jobs.delete('J-H1');
  assert.equal(h.api.advancesHeld().rows[0].jobState, 'NOT_FOUND');
});

test('M15 store faults: a failed write leaves no receipt and no gap; a conflict heals on retry', () => {
  const h = build();
  h.cases.add('J-1');
  const before = h.text();
  h.adapter.failSetFor(/receipts_v1_FY/, { times: 1 });
  const bad = h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER));
  refused(h, bad, 'SVCS_WRITE_FAILED', before);
  assert.equal(h.records().length, 0);
  const ok = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)));
  assert.equal(ok.receipt.no, 'SAR/26-27/0001');
  // another handle writes between the check and the save
  const other = newStore(h.adapter, h.clock);
  assert.equal(other.open().ok, true);
  h.view.hook = () => {
    const t = other.nextAt('receipts');
    const n = other.nextNumber('SAR', t.at);
    const w = put(other, 'receipts', { k: 'SAR', series: 'SAR', b: { no: n.no, docDate: '2026-11-18', jobId: 'J-X', amountPaise: 700, payMode: 'Cash', payRef: '', note: '' } }, { at: t.at });
    assert.equal(w.ok, true, JSON.stringify(w));
  };
  const text1 = h.text();
  const c = h.api.takeAdvance({ jobId: 'J-1', amountPaise: 300, payMode: 'Cash' }, h.ctx(OWNER));
  assert.equal(c.ok, false);
  assert.equal(c.code, 'SVCS_REV_CONFLICT');
  assert.notEqual(h.text(), text1, 'the other handle did write');
  const retry = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 300, payMode: 'Cash' }, h.ctx(OWNER)));
  assert.equal(retry.receipt.no, 'SAR/26-27/0003');
  assert.equal(h.api.jobMoney('J-X').netPaise, 700);
  assert.equal(h.api.jobMoney('J-1').netPaise, 400);
});

test('M15b damaged receipts shard: money refuses and writes nothing', () => {
  const h = build();
  h.cases.add('J-1');
  adv(h, 'J-1', 100);
  const key = h.adapter.svcsKeys().find((k) => /receipts_v1_FY/.test(k));
  h.adapter.data.set(key, h.adapter.data.get(key).replace('"amountPaise":100', '"amountPaise":101'));
  // a fresh store over the damaged text
  const store2 = newStore(h.adapter, h.clock);
  const m = Money.create({ store: store2, now: h.clock.now, cases: h.cases, docsView: h.view, });
  assert.equal(m.ok, true);
  const before = h.text();
  const r = m.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER));
  assert.equal(r.ok, false);
  assert.match(r.code, /^SVCS_/);
  assert.equal(h.text(), before);
  assert.equal(m.api.ready().ok, false);
  assert.equal(m.api.hasLiveReceipt('J-1'), true, 'cannot answer: stays on the safe side');
});

test('M16 counter sales without a receipt', () => {
  const h = build();
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 1000, rcptDue: true, reversed: false });
  h.view.sales.set('CSL/26-27/0002', { no: 'CSL/26-27/0002', docDate: '2026-11-18', amountPaise: 2000, rcptDue: true, reversed: false });
  h.view.sales.set('CSL/26-27/0003', { no: 'CSL/26-27/0003', docDate: '2026-11-10', amountPaise: 3000, rcptDue: false, reversed: false });
  let u = h.api.unreceiptedCounterSales(h.ctx(MANAGER));
  assert.deepEqual(u.rows, [
    { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 1000, state: 'NO_RECEIPT', receiptNo: '' },
    { no: 'CSL/26-27/0002', docDate: '2026-11-18', amountPaise: 2000, state: 'NO_RECEIPT', receiptNo: '' }
  ]);
  assert.equal(u.totalPaise, 3000);
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 1000, payMode: 'Cash' }, h.ctx(CASHIER)));
  u = h.api.unreceiptedCounterSales();
  assert.deepEqual(u.rows.map((r) => r.no), ['CSL/26-27/0002']);
  assert.equal(u.count, 1);
  refused(h, h.api.unreceiptedCounterSales(h.ctx(TECH)), 'NOT_ALLOWED');
});

test('M17 thirty-three mixed postings on the real store: chain and numbers verify clean; a guarded invoice write loses to a receipt', () => {
  const h = build();
  for (let i = 1; i <= 8; i++) h.cases.add('J-' + i);
  for (let i = 1; i <= 8; i++) {
    h.clock.advance(1000);
    adv(h, 'J-' + i, 1000 * i, ['Cash', 'UPI', 'Card', 'Bank'][i % 4]);
  }
  h.view.issue('J-1', 5000, 'SV/2026-27/0001');
  h.view.issue('J-2', 5000, 'SV/2026-27/0002');
  for (let i = 0; i < 12; i++) {
    h.clock.advance(1000);
    good(h.api.takeBalance({ jobId: i % 2 ? 'J-2' : 'J-1', invoiceNo: i % 2 ? 'SV/2026-27/0002' : 'SV/2026-27/0001', amountPaise: 200, payMode: 'UPI' }, h.ctx(CASHIER)));
  }
  for (let i = 1; i <= 6; i++) {
    h.view.sales.set('CSL/26-27/' + String(i).padStart(4, '0'), { no: 'CSL/26-27/' + String(i).padStart(4, '0'), docDate: '2026-11-18', amountPaise: 100 * i, rcptDue: true, reversed: false });
    h.clock.advance(1000);
    good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/' + String(i).padStart(4, '0'), amountPaise: 100 * i, payMode: 'Cash' }, h.ctx(TECH)));
  }
  for (let i = 3; i <= 8; i++) {
    h.clock.advance(1000);
    good(h.api.refund({ jobId: 'J-' + i, amountPaise: 100, payMode: 'Cash', reason: 'part returned' }, h.pin(OWNER)));
  }
  for (const no of ['SAR/26-27/0003', 'SRC/26-27/0002']) {
    h.clock.advance(1000);
    const r = h.api.reverse({ no, reason: 'entered by mistake' }, h.ctx(MANAGER));
    if (no === 'SAR/26-27/0003') refused(h, r, 'REFUND_FIRST');
    else good(r);
  }
  // 8 advances + 12 balances + 6 counter + 6 refunds + 1 reversal = 33 records
  assert.equal(h.records().length, 33);
  const v = h.store.verifyAll();
  assert.equal(v.ok, true);
  assert.equal(v.blocked, false);
  assert.deepEqual(Array.from(v.problems), []);
  // number series have no gap: 8 SAR, 18 SRC, 6 SRF
  assert.equal(h.store.lastNumber('SAR', h.clock.iso).last, 8);
  assert.equal(h.store.lastNumber('SRC', h.clock.iso).last, 18);
  assert.equal(h.store.lastNumber('SRF', h.clock.iso).last, 6);
  // a bill written with guardRevs of the receipts stream fails when a receipt lands in between
  const rev = h.api.jobMoney('J-5').rev;
  assert.equal(rev, h.store.head('receipts').rev);
  adv(h, 'J-5', 1);
  const inv = h.store.head('invoices');
  const w = h.store.append('invoices', [{ k: 'EST_SAVE', b: { jobId: 'J-5', version: 1, note: 'x' } }], {
    expectRev: inv.rev, actor: { t: 'owner', r: 'Owner', m: 'Test Owner' }, guardRevs: { receipts: rev }
  });
  assert.equal(w.ok, false);
  assert.equal(w.code, 'SVCS_REV_CONFLICT');
  const w2 = h.store.append('invoices', [{ k: 'EST_SAVE', b: { jobId: 'J-5', version: 1, note: 'x' } }], {
    expectRev: inv.rev, actor: { t: 'owner', r: 'Owner', m: 'Test Owner' }, guardRevs: { receipts: h.api.jobMoney('J-5').rev }
  });
  assert.equal(w2.ok, true);
});

test('views and lists: one receipt, a filter, no customer data in any record or view', () => {
  const h = build();
  h.cases.add('J-1').add('J-2');
  adv(h, 'J-1', 1111, 'Cash');
  adv(h, 'J-2', 2222, 'UPI', CASHIER);
  h.day('2026-11-19T05:00:00.000Z');
  adv(h, 'J-1', 3333, 'Card');
  assert.equal(h.api.listReceipts({}).receipts.length, 3);
  assert.deepEqual(h.api.listReceipts({ date: '2026-11-19' }).receipts.map((r) => r.no), ['SAR/26-27/0003']);
  assert.deepEqual(h.api.listReceipts({ jobId: 'J-1' }).receipts.map((r) => r.amountPaise), [1111, 3333]);
  assert.deepEqual(h.api.listReceipts({ jobId: 'J-9' }).receipts, []);
  assert.equal(h.api.receiptView('SAR/26-27/0002').receipt.payMode, 'UPI');
  assert.equal(h.api.receiptView('SAR/26-27/0002').receipt.cashBook, 'UNKNOWN');
  refused(h, h.api.receiptView('SAR/26-27/0042'), 'RECEIPT_NOT_FOUND');
  refused(h, h.api.receiptView('SAR/26-27/0001', h.ctx(TRAINEE)), 'NOT_ALLOWED');
  refused(h, h.api.listReceipts({}, h.ctx(TECH)), 'NOT_ALLOWED');
  refused(h, h.api.receiptView('SAR/26-27/0001', h.ctx(NONE)), 'SESSION_REQUIRED');
  assert.equal(h.api.receiptView('SAR/26-27/0001', h.ctx(CASHIER)).ok, true);
  assert.equal(h.api.jobMoney('J-1', h.ctx(MANAGER)).netPaise, 4444);
  refused(h, h.api.jobMoney('J-1', h.ctx(TRAINEE)), 'NOT_ALLOWED');
  const bad = /^(cust|customer|client|buyer|mobile|phone|msisdn|address|addr|email|e_mail|whatsapp|pan)/i;
  const walk = (v, path) => {
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { assert.equal(bad.test(k), false, path + '.' + k); walk(v[k], path + '.' + k); }
  };
  walk(h.records(), 'records');
  walk(h.api.listReceipts({}), 'view');
  walk(h.api.jobMoney('J-1'), 'jobMoney');
});

test('hasLiveReceipt follows the bridge rule: receipts and legacy decisions count, refunds do not, reversed ones do not', () => {
  const h = build();
  h.cases.add('J-1').add('J-2', { typedAdvancePaise: 500 }).add('J-3');
  assert.equal(h.api.hasLiveReceipt('J-1'), false);
  adv(h, 'J-1', 100);
  assert.equal(h.api.hasLiveReceipt('J-1'), true);
  good(h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong job picked' }, h.ctx(MANAGER)));
  assert.equal(h.api.hasLiveReceipt('J-1'), false);
  good(h.api.decideLegacyAdvance({ jobId: 'J-2', decision: 'IN_BOOK', amountPaise: 500 }, h.pin(OWNER)));
  assert.equal(h.api.hasLiveReceipt('J-2'), true);
  assert.equal(h.api.hasLiveReceipt('J-NOPE'), false);
  assert.equal(h.api.hasLiveReceipt(42), false);
});

test('create: the dependencies are checked; a failing bill view is a refusal, not a guess', () => {
  const h = build();
  const base = { store: h.store, now: h.clock.now, cases: h.cases, docsView: h.view };
  assert.equal(Money.create(null).code, 'DEPS_INVALID');
  assert.equal(Money.create({}).code, 'DEPS_INVALID');
  for (const k of ['store', 'now', 'cases', 'docsView']) {
    const d = Object.assign({}, base);
    delete d[k];
    const r = Money.create(d);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'DEPS_INVALID');
    assert.equal(r.detail, k);
  }
  const v2 = Object.assign({}, h.view);
  delete v2.counterSale;
  assert.equal(Money.create(Object.assign({}, base, { docsView: v2 })).detail, 'docsView.counterSale');
  assert.equal(Money.create(Object.assign({}, base, { store: { open() {} } })).detail, 'store.read');
  // a wrapped store handle ({ok, store}) is accepted
  assert.equal(Money.create(Object.assign({}, base, { store: { ok: true, store: h.store } })).ok, true);
  const r = Money.create(base);
  assert.equal(Object.isFrozen(r.api), true);
  h.cases.add('J-1');
  h.view.throws = true;
  const before = h.text();
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)), 'DEPS_INVALID', before);
  h.view.throws = false;
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)));
});

test('a past or false date in the input is refused: entries are dated today', () => {
  const h = build();
  h.cases.add('J-1');
  const before = h.text();
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash', docDate: '2026-11-17' }, h.ctx(OWNER)), 'BACKDATE_NOT_ALLOWED', before);
  const r = good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash', docDate: '2026-11-18' }, h.ctx(OWNER)));
  assert.equal(r.receipt.docDate, '2026-11-18');
});

test('the receipts of a year turn: numbers restart on 1 April India time', () => {
  const h = build({ start: '2027-03-31T05:00:00.000Z' });
  h.cases.add('J-1');
  assert.equal(adv(h, 'J-1', 100).receipt.no, 'SAR/26-27/0001');
  h.day('2027-03-31T18:29:59.000Z');
  assert.equal(adv(h, 'J-1', 100).receipt.no, 'SAR/26-27/0002');
  h.day('2027-03-31T18:30:00.000Z');
  const r = adv(h, 'J-1', 100);
  assert.equal(r.receipt.no, 'SAR/27-28/0001');
  assert.equal(r.receipt.docDate, '2027-04-01');
  // the new year has its own shard key
  assert.deepEqual(h.adapter.svcsKeys().filter((k) => /receipts_v1/.test(k)), ['saagar_svcs_receipts_v1_FY2026-27', 'saagar_svcs_receipts_v1_FY2027-28']);
});

test('exported tables: codes and messages match, the plan codes exist', () => {
  assert.deepEqual(Object.keys(Money.CODES).sort(), Object.keys(Money.MESSAGES).sort());
  for (const c of ['SESSION_REQUIRED', 'NOT_ALLOWED', 'PIN_REQUIRED', 'INPUT_INVALID', 'AMOUNT_INVALID', 'AMOUNT_TOO_LARGE', 'AMOUNT_MISMATCH',
    'PAYMODE_INVALID', 'PAYREF_INVALID', 'PAYREF_LOOKS_LIKE_CARD', 'JOB_NOT_FOUND', 'JOB_CLOSED', 'JOB_VOID', 'INVOICE_REQUIRED', 'INVOICE_NOT_FOUND',
    'INVOICE_CANCELLED', 'INVOICE_EXISTS_USE_BALANCE', 'RECEIPT_EXCEEDS_BALANCE', 'SALE_NOT_FOUND', 'NOT_RECEIPTABLE', 'COUNTER_RECEIPT_EXISTS',
    'CREDIT_NOTE_REQUIRED', 'REFUND_EXCEEDS_REFUNDABLE', 'REASON_REQUIRED', 'RECEIPT_NOT_FOUND', 'ALREADY_REVERSED', 'NOT_SAME_DAY', 'REFUND_FIRST',
    'LEGACY_ADVANCE_UNCONFIRMED', 'NO_LEGACY_ADVANCE', 'DECISION_EXISTS', 'ADVANCE_HELD', 'BACKDATE_NOT_ALLOWED', 'DEPS_INVALID', 'STORE_NOT_READY']) {
    assert.equal(Money.CODES[c], c, c);
  }
  assert.equal(Object.isFrozen(Money.CODES), true);
  assert.deepEqual(Money.PAY_MODES, ['Cash', 'UPI', 'Card', 'Bank']);
  assert.equal(Money.version, 1);
});

// ---------------------------------------------------------------- added by the Opus audit (A-MONEY)

test('A01 the bill layer cannot say whether the job is void: money refuses (fail closed), lists mark or refuse', () => {
  const h = build();
  h.cases.add('J-1').add('J-2', { typedAdvancePaise: 500 });
  adv(h, 'J-1', 100);
  const keep = h.view.jobVoided;
  h.view.jobVoided = () => { throw new Error('boom'); };
  const before = h.text();
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)), 'DEPS_INVALID', before);
  refused(h, h.api.decideLegacyAdvance({ jobId: 'J-2', decision: 'IN_BOOK', amountPaise: 500 }, h.pin(OWNER)), 'DEPS_INVALID', before);
  const held = good(h.api.advancesHeld(undefined, h.ctx(OWNER)));
  assert.deepEqual(held.rows.map((r) => [r.jobId, r.jobState, r.flag]), [['J-1', 'UNKNOWN', true]]);
  refused(h, h.api.legacyAdvances(undefined, h.ctx(OWNER)), 'DEPS_INVALID');
  h.view.jobVoided = keep;
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)));
});

test('A02 a read with a context that has no good session is refused; only a call with no context at all is internal', () => {
  const h = build();
  h.cases.add('J-1');
  adv(h, 'J-1', 100);
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 900, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 900, payMode: 'Cash' }, h.ctx(TECH)));
  const stamp = { stepUp: { ok: true, at: Date.parse(h.clock.iso) } };
  for (const c of [{}, null, stamp, { session: undefined }, { session: null }, h.ctx(NONE)]) {
    refused(h, h.api.jobMoney('J-1', c), 'SESSION_REQUIRED');
    refused(h, h.api.receiptView('SAR/26-27/0001', c), 'SESSION_REQUIRED');
    refused(h, h.api.saleMoney('CSL/26-27/0001', c), 'SESSION_REQUIRED');
    refused(h, h.api.daySummary('2026-11-18', c), 'SESSION_REQUIRED');
    refused(h, h.api.listReceipts({}, c), 'SESSION_REQUIRED');
    refused(h, h.api.advancesHeld(undefined, c), 'SESSION_REQUIRED');
  }
  refused(h, h.api.listReceipts({ session: undefined }), 'SESSION_REQUIRED');
  refused(h, h.api.saleMoney('CSL/26-27/0001', h.ctx(TECH)), 'NOT_ALLOWED');
  assert.equal(h.api.saleMoney('CSL/26-27/0001', h.ctx(CASHIER)).netPaise, 900);
  // internal reads (bill layer, facade): no context at all
  assert.equal(h.api.jobMoney('J-1').netPaise, 100);
  assert.equal(h.api.saleMoney('CSL/26-27/0001').netPaise, 900);
  assert.equal(h.api.daySummary('2026-11-18').ok, true);
  // writes never have an internal form
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }), 'SESSION_REQUIRED');
  refused(h, h.api.refund({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash', reason: 'no context given' }), 'SESSION_REQUIRED');
  refused(h, h.api.reverse({ no: 'SAR/26-27/0001', reason: 'no context given' }), 'SESSION_REQUIRED');
});

test('A03 a card number is refused in every free text field, not only the reference', () => {
  const h = build();
  h.cases.add('J-1').add('J-2', { typedAdvancePaise: 500 });
  adv(h, 'J-1', 1000);
  const before = h.text();
  for (const t of ['4111111111111111', 'card 4111 1111 1111 1111 swiped', 'no 4111-1111-1111-1111']) {
    refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Card', note: t }, h.ctx(OWNER)), 'PAYREF_LOOKS_LIKE_CARD', before);
    refused(h, h.api.refund({ jobId: 'J-1', amountPaise: 100, payMode: 'Card', reason: 'refund ' + t }, h.pin(OWNER)), 'PAYREF_LOOKS_LIKE_CARD', before);
    refused(h, h.api.reverse({ no: 'SAR/26-27/0001', reason: 'wrong ' + t }, h.ctx(MANAGER)), 'PAYREF_LOOKS_LIKE_CARD', before);
    refused(h, h.api.decideLegacyAdvance({ jobId: 'J-2', decision: 'IN_BOOK', amountPaise: 500, note: t }, h.pin(OWNER)), 'PAYREF_LOOKS_LIKE_CARD', before);
  }
  // a 12-digit UPI reference and an ordinary note still pass
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'UPI', payRef: '432112345678', note: 'glass and strap, ref 1234' }, h.ctx(OWNER)));
});

test('A04 day summary: bill figures without the bill layer are marked not available, never shown as zero', () => {
  const h = build();
  h.cases.add('J-1');
  adv(h, 'J-1', 2500, 'Cash');
  const keepI = h.view.invoicesOn, keepC = h.view.creditNotesOn;
  delete h.view.invoicesOn;
  delete h.view.creditNotesOn;
  let s = good(h.api.daySummary('2026-11-18', h.ctx(OWNER)));
  assert.deepEqual(s.invoicesIssued, { available: false, count: null, paise: null, cancelled: null });
  assert.deepEqual(s.creditNotes, { available: false, count: null, paise: null });
  assert.deepEqual(s.notAvailable, ['invoicesIssued', 'creditNotes']);
  assert.equal(s.receipts.Cash, 2500);
  // a broken or malformed answer is also "not available"; the money figures stay right
  h.view.invoicesOn = () => { throw new Error('boom'); };
  h.view.creditNotesOn = () => ({ count: 1.5, paise: 100 });
  s = good(h.api.daySummary('2026-11-18', h.ctx(OWNER)));
  assert.deepEqual(s.notAvailable, ['invoicesIssued', 'creditNotes']);
  assert.equal(s.netCash, 2500);
  h.view.invoicesOn = keepI;
  h.view.creditNotesOn = keepC;
  s = good(h.api.daySummary('2026-11-18', h.ctx(OWNER)));
  assert.deepEqual(s.invoicesIssued, { available: true, count: 0, paise: 0, cancelled: 0 });
  assert.deepEqual(s.notAvailable, []);
});

test('A05 a counter receipt reversed while the sale stands stays on the list; saleMoney says when the sale may be reversed', () => {
  const h = build();
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 4000, rcptDue: true, reversed: false });
  h.view.sales.set('CSL/26-27/0002', { no: 'CSL/26-27/0002', docDate: '2026-11-18', amountPaise: 6000, rcptDue: true, reversed: false });
  assert.equal(h.api.saleMoney('CSL/26-27/0001').reversible, true, 'no money taken yet');
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 4000, payMode: 'Cash' }, h.ctx(TECH)));
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0002', amountPaise: 6000, payMode: 'UPI' }, h.ctx(TECH)));
  assert.equal(h.api.saleMoney('CSL/26-27/0001').reversible, false, 'money held: reverse or refund it first');
  assert.deepEqual(h.api.unreceiptedCounterSales().rows, []);
  good(h.api.reverse({ no: 'SRC/26-27/0001', reason: 'sale is being reversed' }, h.ctx(MANAGER)));
  assert.equal(h.api.saleMoney('CSL/26-27/0001').reversible, true);
  const u = h.api.unreceiptedCounterSales(undefined, h.ctx(MANAGER));
  assert.deepEqual(u.rows, [{ no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 4000, state: 'RECEIPT_REVERSED', receiptNo: 'SRC/26-27/0001' }]);
  assert.equal(u.totalPaise, 4000);
  // the next day the other sale is refunded in full; then it may be reversed too
  h.day('2026-11-19T05:00:00.000Z');
  good(h.api.refund({ saleNo: 'CSL/26-27/0002', amountPaise: 6000, payMode: 'UPI', reason: 'sale returned' }, h.pin(OWNER)));
  const sm = h.api.saleMoney('CSL/26-27/0002');
  assert.equal(sm.hasLive, true);
  assert.equal(sm.netPaise, 0);
  assert.equal(sm.reversible, true);
});

test('A06 role lists: the latest VALID setting wins, Store Manager is never billing staff, another screen is seen at once, unreadable fails closed', () => {
  const h = build();
  h.cases.add('J-1');
  const SM_STAFF = Object.freeze({ ok: true, tier: 'staff', role: 'Store Manager', actorName: 'Test X', isOwner: false, isManager: false });
  put(h.store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: ['Cashier', 'Store Manager'], estimateRoles: [] } });
  // the newer setting is not valid: the earlier one (Cashier) stays in force and Store Manager gets nothing
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(CASHIER)));
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(SM_STAFF)), 'NOT_ALLOWED');
  put(h.store, 'config', { k: 'CONFIG_SET', b: { adjustLimitPaise: 0, storeRoles: ['Technician', 'Technician'] } });
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 100, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 100, payMode: 'Cash' }, h.ctx(TECH)));
  // another screen (its own store handle) removes Cashier: this handle sees it on the very next call
  const other = newStore(h.adapter, h.clock);
  assert.equal(other.open().ok, true);
  assert.equal(put(other, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] } }).ok, true);
  const before = h.text();
  refused(h, h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(CASHIER)), 'NOT_ALLOWED', before);
  // settings that cannot be read: billing and store-class staff are refused, the Owner is not
  const s = h.store;
  const wrapped = {
    open: s.open, append: s.append, findRef: s.findRef, head: s.head, nextAt: s.nextAt, nextNumber: s.nextNumber,
    read: (st) => (st === 'invoices' || st === 'config' ? { ok: false, code: 'SVCS_SHARD_UNREADABLE' } : s.read(st))
  };
  put(h.store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: [] } });
  const m = Money.create({ store: wrapped, now: h.clock.now, cases: h.cases, docsView: h.view }).api;
  h.view.sales.set('CSL/26-27/0002', { no: 'CSL/26-27/0002', docDate: '2026-11-18', amountPaise: 100, rcptDue: true, reversed: false });
  refused(h, m.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(CASHIER)), 'NOT_ALLOWED');
  refused(h, m.takeCounterReceipt({ saleNo: 'CSL/26-27/0002', amountPaise: 100, payMode: 'Cash' }, h.ctx(TECH)), 'NOT_ALLOWED');
  good(m.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)));
});

test('A07 two money instances on one storage: no number is used twice, exactly one of two raced writes wins', () => {
  const h = build();
  h.cases.add('J-1');
  const other = newStore(h.adapter, h.clock);
  assert.equal(other.open().ok, true);
  const B = Money.create({ store: other, now: h.clock.now, cases: h.cases, docsView: h.view }).api;
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash' }, h.ctx(OWNER)));
  // B's handle was opened before that write: its first call still works and takes the next number
  assert.equal(good(B.takeAdvance({ jobId: 'J-1', amountPaise: 200, payMode: 'Cash' }, h.ctx(OWNER))).receipt.no, 'SAR/26-27/0002');
  assert.equal(good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 300, payMode: 'Cash' }, h.ctx(OWNER))).receipt.no, 'SAR/26-27/0003');
  // a refund raced from both: the one that planned first loses, the retry sees nothing left to give back
  h.view.hook = () => good(B.refund({ jobId: 'J-1', amountPaise: 600, payMode: 'Cash', reason: 'job dropped' }, h.pin(OWNER)));
  const lost = h.api.refund({ jobId: 'J-1', amountPaise: 600, payMode: 'Cash', reason: 'job dropped' }, h.pin(OWNER));
  assert.equal(lost.ok, false);
  assert.equal(lost.code, 'SVCS_REV_CONFLICT');
  refused(h, h.api.refund({ jobId: 'J-1', amountPaise: 600, payMode: 'Cash', reason: 'job dropped' }, h.pin(OWNER)), 'REFUND_EXCEEDS_REFUNDABLE');
  const recs = h.records();
  assert.deepEqual(recs.map((r) => r.b.no), ['SAR/26-27/0001', 'SAR/26-27/0002', 'SAR/26-27/0003', 'SRF/26-27/0001']);
  assert.equal(h.api.jobMoney('J-1').netPaise, 0);
  assert.equal(h.store.verifyAll().ok, true);
});

test('A08 a bill view with figures that are not whole paise is a refusal, not a guess', () => {
  const h = build();
  h.cases.add('J-1');
  adv(h, 'J-1', 1000);
  const before = h.text();
  for (const bad of [
    { no: 'SV/2026-27/0001', status: 'ISSUED', totalPaise: 500.5, creditedPaise: 0 },
    { no: 'SV/2026-27/0001', status: 'ISSUED', totalPaise: 500 },
    { no: 'SV/2026-27/0001', status: 'DRAFT', totalPaise: 500, creditedPaise: 0 },
    { no: 'SV/2026-27/0001', status: 'ISSUED', totalPaise: '500', creditedPaise: 0 }
  ]) {
    h.view.invoices.set('J-1', bad);
    refused(h, h.api.takeBalance({ jobId: 'J-1', invoiceNo: 'SV/2026-27/0001', amountPaise: 1, payMode: 'Cash' }, h.ctx(OWNER)), 'DEPS_INVALID', before);
    refused(h, h.api.refund({ jobId: 'J-1', amountPaise: 1, payMode: 'Cash', reason: 'bad bill view' }, h.pin(OWNER)), 'DEPS_INVALID', before);
    refused(h, h.api.jobMoney('J-1'), 'DEPS_INVALID');
  }
});

test('A09 midnight India time: 23:59:59.999 is today, 00:00:00.000 is tomorrow, and the day summaries split there', () => {
  const h = build({ start: '2026-11-18T18:29:59.999Z' });
  h.cases.add('J-1');
  assert.equal(adv(h, 'J-1', 111).receipt.docDate, '2026-11-18');
  h.day('2026-11-18T18:30:00.000Z');
  assert.equal(adv(h, 'J-1', 222).receipt.docDate, '2026-11-19');
  assert.equal(h.api.daySummary('2026-11-18').receipts.total, 111);
  assert.equal(h.api.daySummary('2026-11-19').receipts.total, 222);
  refused(h, h.api.reverse({ no: 'SAR/26-27/0001', reason: 'after midnight in India' }, h.ctx(MANAGER)), 'NOT_SAME_DAY');
  good(h.api.reverse({ no: 'SAR/26-27/0002', reason: 'same India day' }, h.ctx(MANAGER)));
});

test('A11 a second counter receipt is refused by the money index itself (naming the saved receipt), not only by the store', () => {
  const h = build();
  h.view.sales.set('CSL/26-27/0001', { no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 700, rcptDue: true, reversed: false });
  good(h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 700, payMode: 'Cash' }, h.ctx(TECH)));
  const before = h.text();
  const r = refused(h, h.api.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 700, payMode: 'Cash' }, h.ctx(CASHIER)), 'COUNTER_RECEIPT_EXISTS', before);
  assert.deepEqual(r.detail, { no: 'SRC/26-27/0001' });
  assert.equal(h.records().length, 1);
});

test('A10 a refund may name only a live advance of the same job', () => {
  const h = build();
  h.cases.add('J-1').add('J-2');
  adv(h, 'J-1', 1000);
  adv(h, 'J-1', 500);
  adv(h, 'J-2', 700);
  good(h.api.reverse({ no: 'SAR/26-27/0002', reason: 'typed twice' }, h.ctx(MANAGER)));
  const before = h.text();
  const rf = (advanceNo) => h.api.refund({ jobId: 'J-1', advanceNo, amountPaise: 100, payMode: 'Cash', reason: 'part returned' }, h.pin(OWNER));
  refused(h, rf('SAR/26-27/0002'), 'INPUT_INVALID', before);
  refused(h, rf('SAR/26-27/0003'), 'INPUT_INVALID', before);
  assert.equal(good(rf('SAR/26-27/0001')).refund.advanceNo, 'SAR/26-27/0001');
});
