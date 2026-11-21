// Service wave 2, A-UI audit: the controls the audit added or fixed in www/service-billing-ui.js.
// F1: changing a CCPT number needs the Owner PIN; reversing a receipt of today (Manager or Owner) and a refund of today (Owner PIN).
// U-1: the counter-sale receipt opens for the sale just made for billing staff and store-class staff, without the Owner-only list.
// The billing layer is the FAKE of the harness; the real stack is covered by svc2-area-real and the browser walk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, SESSIONS, flush } from './lib/svc2-ui-harness.mjs';

const STORES_UI = readFileSync(new URL('../www/service-stores-ui.js', import.meta.url), 'utf8');

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const DESK = { status: { config: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: [] } } };
const OWNER_CTX = () => ({ session: SESSIONS.owner, stepUp: { ok: true, at: 1 }, clientRef: 'seed-' + Math.random() });

async function billed(opts) {
  const a = setup(opts || {});
  a.seedBill();
  await a.ready();
  return a;
}
async function withMoney(opts) {
  const a = setup(opts || {});
  a.seedBill();
  a.billing.takeReceipt({ jobId: 'WS-2026-001', kind: 'balance', amountPaise: 50000, payMode: 'Cash', payRef: '', note: '' }, OWNER_CTX());
  a.billing.state.jobs['WS-2026-001'].refunds.push({ no: 'SRF/26-27/0001', kind: 'SRF', amountPaise: 10000, payMode: 'Cash', docDate: '2026-11-13' });
  a.billing.calls.length = 0;
  await a.ready();
  return a;
}

/* ------------------------------------------------------------------ F1: CCPT number change */

test('AU01 change CCPT number: Owner only, reason of 5 or more, the Owner PIN with a clear label, one write with the reason and the step-up', async () => {
  const m = await billed({ session: SESSIONS.manager });
  assert.equal(m.jobHtml().includes('svb-job-ccptchange-open'), false, 'a Manager never sees the change button');
  assert.equal((await m.ui.internals.dispatch('svb-job-ccptchange-open')).code, 'SVB_OWNER_ONLY');
  const a = await billed({ session: SESSIONS.owner });
  assert.equal(a.jobHtml().includes('svb-job-ccptno-open'), false, 'the add button is gone once a number is there');
  await a.click('svb-job-ccptchange-open');
  assert.match(text(a.layerHtml()), /Change CCPT number/);
  assert.match(text(a.layerHtml()), /Number now: C-9001/);
  assert.ok(a.find('svb-cc-change-save'), 'the change dialog saves with its own Owner control');
  assert.equal(a.find('svb-cc-save'), null);
  await a.type('ccpt', 'C-9002');
  await a.type('reason', 'typo');
  await a.click('svb-cc-change-save');
  assert.equal(a.h.calls.reauth.length, 0, 'a short reason never reaches the keypad');
  assert.equal(a.billing.count('addCcptNumber'), 0);
  await a.type('reason', 'wrong number typed');
  await a.click('svb-cc-change-save');
  assert.equal(a.h.calls.reauth.length, 1);
  assert.equal(a.h.calls.reauth[0], 'Change CCPT number of SV/2026-27/0001 from C-9001 to C-9002');
  assert.equal(a.billing.count('addCcptNumber'), 1);
  const c = a.billing.last('addCcptNumber');
  assert.deepEqual(c.args[0], { invoiceNo: 'SV/2026-27/0001', ccptInvoiceNo: 'C-9002', reason: 'wrong number typed' });
  assert.equal(c.args[1].stepUp.ok, true);
  assert.equal(c.args[1].session.isOwner, true);
  assert.ok(c.args[1].clientRef.length > 0);
});

test('AU02 change CCPT number: PIN cancel writes nothing; the add save never writes on a change dialog; a double press gives one write', async () => {
  const a = await billed({ session: SESSIONS.owner });
  a.h.reauthResult = false;
  await a.click('svb-job-ccptchange-open');
  await a.type('ccpt', 'C-9003');
  await a.type('reason', 'wrong number typed');
  await a.click('svb-cc-change-save');
  assert.equal(a.h.calls.reauth.length, 1);
  assert.equal(a.billing.count('addCcptNumber'), 0, 'PIN cancelled: no record');
  // the add control on the change dialog (dispatched directly) does not write and asks nothing
  await a.ui.internals.dispatch('svb-cc-save');
  assert.equal(a.billing.count('addCcptNumber'), 0);
  assert.equal(a.h.calls.reauth.length, 1);
  a.h.reauthResult = true;
  const p1 = a.ui.internals.dispatch('svb-cc-change-save');
  const p2 = a.ui.internals.dispatch('svb-cc-change-save');
  await Promise.all([p1, p2]);
  await flush();
  assert.equal(a.billing.count('addCcptNumber'), 1, 'two presses, one write');
});

/* ------------------------------------------------------------------ F1: reversals */

test('AU03 reverse a receipt of today: Manager and Owner, no PIN, one write with the reason; staff see nothing; a reversed row is not offered again', async () => {
  const s = await withMoney(Object.assign({ session: SESSIONS.desk }, { billingOpts: DESK }));
  assert.equal(s.jobHtml().includes('svb-job-reverse-open'), false, 'billing staff cannot reverse');
  assert.equal((await s.ui.internals.dispatch('svb-job-reverse-open')).code, 'SVB_ROLE_DENIED');
  const m = await withMoney({ session: SESSIONS.manager });
  assert.ok(m.jobHtml().includes('svb-job-reverse-open'));
  assert.equal(m.jobHtml().includes('svb-job-reverse-refund-open'), false, 'a refund reversal is Owner only');
  await m.click('svb-job-reverse-open');
  const t = text(m.layerHtml());
  assert.match(t, /Reverse a receipt/);
  assert.match(t, /SRC\/26-27\/0001 Rs 500\.00/);
  assert.equal(/SRF\//.test(t), false, 'refunds are not in the receipt list');
  await m.type('reason', 'no');
  await m.click('svb-rv-save');
  assert.equal(m.billing.count('reverseReceipt'), 0);
  await m.type('reason', 'typed the wrong amount');
  await m.click('svb-rv-save');
  assert.equal(m.h.calls.reauth.length, 0, 'no PIN for a receipt');
  assert.equal(m.billing.count('reverseReceipt'), 1);
  assert.deepEqual(m.billing.last('reverseReceipt').args[0], { no: 'SRC/26-27/0001', reason: 'typed the wrong amount' });
  await m.ui.refreshJob();
  await flush();
  assert.equal(m.jobHtml().includes('svb-job-reverse-open'), false, 'nothing left to reverse');
});

test('AU04 reverse a refund of today: Owner and the Owner PIN; PIN cancel writes nothing; the receipt save never reverses a refund', async () => {
  const a = await withMoney({ session: SESSIONS.owner });
  assert.ok(a.jobHtml().includes('svb-job-reverse-refund-open'));
  await a.click('svb-job-reverse-refund-open');
  assert.match(text(a.layerHtml()), /Reverse a refund/);
  assert.match(text(a.layerHtml()), /SRF\/26-27\/0001 Rs 100\.00/);
  await a.type('reason', 'refund was a mistake');
  await a.ui.internals.dispatch('svb-rv-save');
  assert.equal(a.billing.count('reverseReceipt'), 0, 'the no-PIN save does nothing on the refund dialog');
  a.h.reauthResult = false;
  await a.click('svb-rv-refund-save');
  assert.equal(a.h.calls.reauth.length, 1);
  assert.equal(a.h.calls.reauth[0], 'Reverse refund SRF/26-27/0001 of Rs 100.00');
  assert.equal(a.billing.count('reverseReceipt'), 0, 'PIN cancelled: no record');
  a.h.reauthResult = true;
  await a.click('svb-rv-refund-save');
  assert.equal(a.billing.count('reverseReceipt'), 1);
  const c = a.billing.last('reverseReceipt');
  assert.deepEqual(c.args[0], { no: 'SRF/26-27/0001', reason: 'refund was a mistake' });
  assert.equal(c.args[1].stepUp.ok, true);
});

test('AU05 a receipt of another day is never offered for reversal', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedBill();
  a.billing.state.jobs['WS-2026-001'].receipts.push({ no: 'SAR/26-27/0007', kind: 'SAR', amountPaise: 10000, status: 'OK', payMode: 'Cash', docDate: '2026-11-12' });
  await a.ready();
  assert.equal(a.jobHtml().includes('svb-job-reverse-open'), false);
  const r = await a.ui.internals.dispatch('svb-job-reverse-open');
  assert.equal(r.code, 'NOTHING_DUE');
});

/* ------------------------------------------------------------------ U-1: counter-sale receipt */

test('AU06 counter sale: billing staff get the receipt for the sale just made, with its amount, and the Owner list is never asked for', async () => {
  const a = setup({ session: SESSIONS.desk, billingOpts: DESK });
  a.billing.state.sales.push({ no: 'CSL/26-27/0001', amountPaise: 15050, state: 'OPEN' });
  await a.ready();
  a.billing.calls.length = 0;
  await a.ui.afterCounterSale('CSL/26-27/0001', { no: 'CSL/26-27/0001', amountPaise: 15050 });
  await flush();
  assert.equal(a.billing.count('unreceiptedCounterSales'), 0, 'no Owner list for staff');
  assert.match(text(a.layerHtml()), /CSL\/26-27\/0001/);
  assert.equal(a.field('amount').value, '150.50');
  assert.equal(/WS-2026-001/.test(text(a.layerHtml())), false, 'a counter sale shows no job label');
  await a.click('svb-rcpt-save');
  assert.equal(a.billing.count('takeCounterReceipt'), 1);
  assert.deepEqual(a.billing.last('takeCounterReceipt').args[0].amountPaise, 15050);
  assert.equal(a.billing.last('takeCounterReceipt').args[0].saleNo, 'CSL/26-27/0001');
});

test('AU07 counter sale: the facade name asked is COUNTER_RECEIPT; a store-class role it allows gets the receipt; a refused role gets nothing', async () => {
  const a = setup({ session: SESSIONS.tech });
  await a.ready();
  const asked = [];
  a.billing.forced.can = (name) => { asked.push(name); return name === 'COUNTER_RECEIPT' ? { ok: true, needsPin: false } : { ok: false, code: 'NOT_ALLOWED' }; };
  await a.ui.afterCounterSale('CSL/26-27/0002', { no: 'CSL/26-27/0002', amountPaise: 2000 });
  await flush();
  assert.ok(asked.includes('COUNTER_RECEIPT'), 'asked ' + asked.join(','));
  assert.equal(asked.includes('takeCounterReceipt'), false, 'no unknown action name');
  assert.ok(a.find('svb-rcpt-save'), 'the receipt dialog is open');
  const b = setup({ session: SESSIONS.tech });
  await b.ready();
  b.billing.forced.can = () => ({ ok: false, code: 'NOT_ALLOWED' });
  const r = await b.ui.afterCounterSale('CSL/26-27/0003', { no: 'CSL/26-27/0003', amountPaise: 2000 });
  assert.equal(r.code, 'SVB_ROLE_DENIED');
  assert.equal(b.find('svb-rcpt-save'), null);
});

test('AU08 counter sale without the sale document: staff get a plain message, only the Owner and Manager read the list', async () => {
  const s = setup({ session: SESSIONS.desk, billingOpts: DESK });
  await s.ready();
  s.billing.calls.length = 0;
  await s.ui.afterCounterSale('CSL/26-27/0004');
  await flush();
  assert.equal(s.billing.count('unreceiptedCounterSales'), 0);
  assert.equal(s.find('svb-rcpt-save'), null);
  const m = setup({ session: SESSIONS.manager });
  m.billing.state.sales.push({ no: 'CSL/26-27/0004', amountPaise: 9900, state: 'OPEN' });
  await m.ready();
  await m.ui.afterCounterSale('CSL/26-27/0004');
  await flush();
  assert.equal(m.billing.count('unreceiptedCounterSales'), 1);
  assert.equal(m.field('amount').value, '99.00');
});

test('AU09 hostile text in the CCPT change and reversal reason fields never reaches the page unescaped', async () => {
  const bad = '<img src=x onerror=alert(1)>"\'&';
  const a = await withMoney({ session: SESSIONS.owner });
  await a.click('svb-job-ccptchange-open');
  await a.type('ccpt', bad);
  await a.type('reason', bad);
  await a.click('svb-cc-change-save');
  assert.equal(a.layerHtml().includes('<img'), false);
  assert.equal(a.h.calls.reauth.at(-1).includes(bad.slice(0, 20)), true, 'the PIN label is plain text handed to the host keypad');
  if (a.find('svb-cc-cancel')) await a.click('svb-cc-cancel');
  assert.equal(a.jobHtml().includes('<img'), false, 'the new number shows escaped on the card');
  await a.click('svb-job-reverse-open');
  await a.type('reason', bad);
  assert.equal(a.layerHtml().includes('<img'), false);
  await a.type('reason', bad);
  await a.click('svb-rv-cancel');
  assert.equal(a.jobHtml().includes('<img'), false);
});

test('AU10 a hostile stored CCPT number and a hostile receipt number are escaped on the card and in the change dialog', async () => {
  const bad = '<img src=x onerror=alert(1)>';
  const a = setup({ session: SESSIONS.owner });
  a.seedBill();
  const j = a.billing.state.jobs['WS-2026-001'];
  j.bills[0].ccptInvoiceNo = bad;
  j.receipts.push({ no: bad, kind: 'SAR', amountPaise: 1000, status: 'OK', payMode: 'Cash', docDate: '2026-11-13' });
  await a.ready();
  assert.equal(a.jobHtml().includes('<img'), false, 'card');
  assert.ok(a.jobHtml().includes('&lt;img'), 'the receipt number is shown, escaped');
  await a.click('svb-job-ccptchange-open');
  assert.equal(a.layerHtml().includes('<img'), false, 'change dialog');
  assert.ok(a.layerHtml().includes('&lt;img'), 'the number now is shown, escaped');
});

test('AU11 the Stores counter-sale hook hands the sale document to the billing UI (plan 2.19 hunk)', () => {
  assert.match(STORES_UI, /ui\.afterCounterSale\(no, r\.doc\);/);
  assert.equal(STORES_UI.split('afterCounterSale(').length - 1, 1, 'one call, inside the guarded hook');
});

test('AU12 a code of a lower layer that the facade has no table row for is shown as the sentence the layer sent, never as the bare code', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedApproved();
  await a.ready();
  a.billing.forced.takeReceipt = { ok: false, code: 'ADVANCE_EXCEEDS_BILL', message: 'The advance held is more than this bill. Refund the extra first.' };
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  await a.click('svb-rcpt-save');
  const shown = text(a.layerHtml()) + ' ' + a.h.calls.toast.join(' ');
  assert.match(shown, /The advance held is more than this bill\. Refund the extra first\./);
  assert.equal(/Something went wrong/.test(shown), false);
});
