// Service wave 2, W-UI: receipts, bill, CCPT number, cancel, credit note, refund, void, no-charge, PIN, busy, retry, Escape,
// focus, context change, past view (P5 U42 to U65 as corrected by the plan). The billing layer is the FAKE of the harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, flush, fire, calc } from './lib/svc2-ui-harness.mjs';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const plain = (v) => JSON.parse(JSON.stringify(v));
const OWNER_CTX = (extra) => Object.assign({ session: SESSIONS.owner, stepUp: { ok: true, at: 1 }, clientRef: 'seed-' + Math.random() }, extra || {});
const DESK = { status: { config: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: [] } } };
const LIMIT_500 = { status: { config: { discountLimitPaise: 50000, billingRoles: [], estimateRoles: [] } } };
const gstin = (state) => { const base = state + 'AAAAA0000A1Z'; return base + calc.gstinCheckChar(base); };

async function jobWith(state, opts) {
  const a = setup(opts || {});
  if (state === 'approved') a.seedApproved();
  if (state === 'estimate') a.seedEstimate();
  if (state === 'billed') a.seedBill();
  if (state === 'advance') { a.seedApproved(); a.billing.takeReceipt({ jobId: a.h.currentJob, kind: 'advance', amountPaise: 50000, payMode: 'Cash', payRef: '', note: '' }, OWNER_CTX()); a.billing.calls.length = 0; }
  await a.ready();
  return a;
}
const lastCall = (a, n) => a.billing.last(n);

/* ------------------------------------------------------------------ receipts */

test('U42 advance receipt: amount and mode required; reference for UPI, Card and Bank only; amber note above the estimate; payload keys; result view', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  assert.match(text(a.layerHtml()), /Estimate total Rs 1,534\.00\. Advance already held Rs 0\.00\./);
  assert.equal(a.field('payRef'), null, 'Cash: no reference field');
  await a.click('svb-rcpt-save');
  assert.match(text(a.layerHtml()), /Enter an amount in rupees, for example 149\.50\./);
  await a.type('amount', '149.505');
  await a.click('svb-rcpt-save');
  assert.match(text(a.layerHtml()), /Enter an amount in rupees/);
  await a.type('amount', '2000');
  assert.equal(a.layerHtml().includes('This is more than the estimate total. Check before you save.'), false, 'the note shows after the next redraw');
  await a.setSelect('payMode', 'UPI');
  assert.ok(a.field('payRef'));
  assert.match(text(a.layerHtml()), /This is more than the estimate total\. Check before you save\./);
  await a.click('svb-rcpt-save');
  assert.match(text(a.layerHtml()), /Type the UPI, card or bank reference \(3 to 30 characters\)\./);
  assert.equal(a.billing.count('takeReceipt'), 0);
  await a.type('payRef', 'ab');
  await a.click('svb-rcpt-save');
  assert.equal(a.billing.count('takeReceipt'), 0, 'two characters are too short');
  await a.type('payRef', 'UPI-REF-001');
  await a.type('amount', '500');
  await a.type('note', 'first part');
  await a.click('svb-rcpt-save');
  const c = lastCall(a, 'takeReceipt');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['amountPaise', 'jobId', 'kind', 'note', 'payMode', 'payRef']);
  assert.deepEqual(plain(c.args[0]), { jobId: 'WS-2026-001', kind: 'advance', amountPaise: 50000, payMode: 'UPI', payRef: 'UPI-REF-001', note: 'first part' });
  assert.match(text(a.layerHtml()), /Receipt SAR\/26-27\/0001 saved: Rs 500\.00 by UPI\./);
  assert.ok(a.layerHtml().includes('svb-rcpt-print'));
  const b = await jobWith('approved');
  await b.click('svb-job-advance-open');
  await b.type('amount', '100');
  await b.setSelect('payMode', 'UPI');
  await b.type('payRef', 'ignored');
  await b.setSelect('payMode', 'Cash');
  await b.click('svb-rcpt-save');
  assert.equal(lastCall(b, 'takeReceipt').args[0].payRef, '', 'a Cash receipt carries no reference');
});

test('U43 balance receipt: Fill balance due, over-due refused with the amount, partial accepted, context shown', async () => {
  const a = await jobWith('billed');
  await a.click('svb-job-balance-open');
  assert.match(text(a.layerHtml()), /Bill SV\/2026-27\/0001\. Total Rs 1,534\.00\. Paid Rs 0\.00\. Balance due Rs 1,534\.00\./);
  assert.equal(a.field('amount').value, '');
  await a.click('svb-rcpt-fill-due');
  assert.equal(a.field('amount').value, '1534.00');
  await a.type('amount', '1534.01');
  await a.click('svb-rcpt-save');
  assert.match(text(a.layerHtml()), /The amount is more than the balance due \(Rs 1,534\.00\)\./);
  assert.equal(a.billing.count('takeReceipt'), 0);
  await a.type('amount', '400');
  await a.click('svb-rcpt-save');
  const c = lastCall(a, 'takeReceipt');
  assert.equal(c.args[0].kind, 'balance');
  assert.equal(c.args[0].amountPaise, 40000);
  assert.match(text(a.layerHtml()), /Receipt SRC\/26-27\/0001 saved/);
  assert.match(text(a.jobHtml()), /Next: take the balance of Rs 1,134\.00\./);
});

test('U44 the cash-book note: posted true, posted false (amber), unknown (nothing claimed)', async () => {
  for (const [posted, re, not] of [[true, /Posted to the cash book\./, /could not be made/], [false, /The receipt is saved\. The cash book entry could not be made\. Tell the Owner\./, /Posted to the cash book/], [undefined, /Receipt SAR/, /Posted to the cash book|could not be made/]]) {
    const a = await jobWith('approved');
    a.billing.forced.takeReceipt = (d, ctx) => ({ ok: true, receipt: { no: 'SAR/26-27/0001', amountPaise: d.amountPaise, payMode: d.payMode }, posted });
    await a.click('svb-job-advance-open');
    await a.type('amount', '100');
    await a.click('svb-rcpt-save');
    const t = text(a.layerHtml());
    assert.match(t, re);
    assert.doesNotMatch(t, not);
    assert.match(t, /Receipt SAR\/26-27\/0001 saved: Rs 100\.00 by Cash\./, 'the success view appears in every case');
  }
});

test('U45 Print receipt asks for the print data once, then previews once; no report engine shows the message', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  await a.click('svb-rcpt-save');
  await a.click('svb-rcpt-print', 'SAR/26-27/0001');
  const pd = lastCall(a, 'printData');
  assert.equal(pd.args[0], 'serviceReceipt');
  assert.deepEqual(plain(pd.args[1]), { receiptNo: 'SAR/26-27/0001' });
  assert.equal(a.h.calls.report.length, 1);
  assert.equal(a.h.calls.report[0].type, 'serviceReceipt');
  assert.deepEqual(plain(a.h.calls.report[0].opts), { svcData: { type: 'serviceReceipt', args: { receiptNo: 'SAR/26-27/0001' } }, receiptNo: 'SAR/26-27/0001' });
  const b = await jobWith('approved', { report: null });
  await b.click('svb-job-advance-open');
  await b.type('amount', '100');
  await b.click('svb-rcpt-save');
  await b.click('svb-rcpt-print', 'SAR/26-27/0001');
  assert.match(text(b.layerHtml()), /Printing is not available in this build\./);
  const p = await jobWith('approved', { print: true });
  await p.click('svb-job-advance-open');
  await p.type('amount', '100');
  await p.click('svb-rcpt-save');
  await p.click('svb-rcpt-print', 'SAR/26-27/0001');
  assert.deepEqual(plain(p.h.calls.print), [{ type: 'serviceReceipt', args: { receiptNo: 'SAR/26-27/0001' } }], 'the page print helper is preferred when the host has one');
});

/* ------------------------------------------------------------------ the bill */

async function openBill(opts, mut) {
  const a = await jobWith('approved', opts);
  if (mut) mut(a);
  await a.click('svb-job-bill-open');
  return a;
}

test('U46 the bill dialog loads prepareBill; left-off and not-on-estimate notes only when present; quantities and prices are read-only', async () => {
  const a = await openBill({ session: SESSIONS.manager });
  assert.equal(a.billing.count('prepareBill'), 1);
  const t = text(a.layerHtml());
  assert.match(t, /DEMO-P1 Demo glass, Qty 1/);
  assert.match(t, /DEMO-L1 Demo service, Qty 1/);
  assert.equal(/Left off the bill|Issued but not on the estimate/.test(t), false);
  assert.equal(a.field('qty', 0), null, 'quantities are read-only');
  assert.equal(a.field('price', 0), null, 'prices come from the estimate and masters');
  assert.ok(a.field('discount', 0), 'the Store Manager may give a discount');
  const b = await openBill({ billingOpts: { leftOff: [{ code: 'DEMO-P2', qty: 1, why: 'not issued' }], notOnEstimate: [{ code: 'DEMO-P9', qty: 2 }] } });
  const u = text(b.layerHtml());
  assert.match(u, /Left off the bill because no part was issued: DEMO-P2 x 1\. Issue the parts in Stores first if they belong on this bill\./);
  assert.match(u, /Issued but not on the estimate: DEMO-P9 x 2\. They are on this bill at the master price\./);
  const d = await openBill({ session: SESSIONS.desk, billingOpts: DESK });
  assert.equal(d.field('discount', 0), null, 'a desk session has no discount field');
  assert.equal(d.field('billDiscount'), null);
});

test('U47 bill checks: discount above the line, no reason, bad GST number, state mismatch, missing CCPT number; not in CCPT needs a reason instead', async () => {
  const a = await openBill({ session: SESSIONS.owner });
  await a.click('svb-bill-review');
  assert.match(text(a.layerHtml()), /Enter the CCPT invoice number\./);
  assert.equal(a.billing.count('issueBill'), 0);
  await a.type('ccpt', 'CC-77');
  await a.type('discount', '99999.00', 0);
  await a.click('svb-bill-review');
  assert.match(text(a.layerHtml()), /The discount cannot be more than the line amount\./);
  await a.type('discount', '10.00', 0);
  await a.click('svb-bill-review');
  assert.match(text(a.layerHtml()), /Type a reason of at least 5 characters\./);
  await a.type('discountReason', 'regular customer');
  await a.check('hasGst', true);
  await a.type('gstin', '27BAD');
  await a.click('svb-bill-review');
  assert.match(text(a.layerHtml()), /Enter a valid GST number \(15 characters\)\./);
  await a.type('gstin', gstin('29'));
  await a.click('svb-bill-review');
  assert.match(text(a.layerHtml()), /The state does not match the GST number\./);
  await a.setSelect('state', '29');
  await a.click('svb-bill-review');
  assert.ok(a.layerHtml().includes('svb-bill-save'), 'review reached: ' + text(a.layerHtml()).slice(0, 200));
  const b = await openBill({ session: SESSIONS.owner });
  await b.check('notIn', true);
  const t = text(b.layerHtml());
  assert.match(t, /This job is not billed in CCPT\. This bill is the tax invoice\./);
  assert.equal(b.field('ccpt'), null, 'no CCPT field when not billed in CCPT');
  await b.click('svb-bill-review');
  assert.match(text(b.layerHtml()), /Type a reason of at least 5 characters\./);
  const m = await openBill({ session: SESSIONS.manager });
  assert.equal(m.field('notIn'), null, 'only the Owner may mark not billed in CCPT');
});

test('U48 review: totals equal the facade preview, Back keeps every typed value, intra-state shows CGST and SGST, inter-state shows IGST, payload keys exact', async () => {
  const a = await openBill({ session: SESSIONS.owner });
  await a.type('ccpt', 'CC-78');
  await a.type('discount', '10.00', 0);
  await a.type('discountReason', 'regular customer');
  await a.click('svb-bill-review');
  const pv = a.billing.last('previewBill');
  const view = text(a.layerHtml());
  assert.match(view, /Bill total Rs 1,52\d,?\d*\.\d\d/);
  assert.ok(view.includes('CGST') && view.includes('SGST'));
  assert.equal(view.includes('IGST'), false);
  const preview = a.billing.state.jobs['WS-2026-001'];
  const direct = a.billing.previewBill({ jobId: 'WS-2026-001', parts: [{ partCode: 'DEMO-P1', qty: 1, discountPaise: 1000 }], labour: [{ code: 'DEMO-L1', qty: 1, discountPaise: 0 }], other: [], billDiscountPaise: 0, recipientStateCode: '27', recipientGstin: '' }, {});
  assert.ok(view.includes('Bill total Rs ' + (direct.totals.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })));
  assert.ok(preview);
  await a.click('svb-bill-back');
  assert.equal(a.field('ccpt').value, 'CC-78');
  assert.equal(a.field('discount', 0).value, '10.00');
  assert.equal(a.field('discountReason').value, 'regular customer');
  await a.click('svb-bill-review');
  await a.click('svb-bill-save');
  const c = lastCall(a, 'issueBill');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['approvalOverrideReason', 'billDiscountPaise', 'ccptInvoiceNo', 'discountReason', 'jobId', 'labour', 'mode', 'notInCcptReason', 'note', 'other', 'parts', 'recipientGstin', 'recipientStateCode']);
  assert.deepEqual(plain(c.args[0].parts), [{ partCode: 'DEMO-P1', qty: 1, discountPaise: 1000 }]);
  assert.deepEqual(plain(c.args[0].labour), [{ code: 'DEMO-L1', qty: 1, discountPaise: 0 }]);
  assert.equal(c.args[0].mode, 'CCPT_BILLED');
  const b = await openBill({ session: SESSIONS.owner });
  await b.type('ccpt', 'CC-79');
  await b.check('hasGst', true);
  await b.type('gstin', gstin('29'));
  await b.setSelect('state', '29');
  await b.click('svb-bill-review');
  const iv = text(b.layerHtml());
  assert.ok(iv.includes('IGST') && !iv.includes('CGST'), 'inter-state: ' + iv.slice(0, 300));
  assert.equal(lastCall(b, 'previewBill').args[0].recipientStateCode, '29');
});

test('U49 success view: number, balance, Print bill summary, Take balance only when due; the old invoice number is mirrored once; the card shows Bill issued', async () => {
  const a = await openBill({ session: SESSIONS.owner });
  await a.type('ccpt', 'CC-80');
  await a.click('svb-bill-review');
  await a.click('svb-bill-save');
  assert.match(text(a.layerHtml()), /Bill SV\/2026-27\/0001 issued\. Balance to pay Rs 1,534\.00\./);
  assert.ok(a.layerHtml().includes('svb-bill-print') && a.layerHtml().includes('svb-job-balance-open') && a.layerHtml().includes('svb-bill-done'));
  assert.deepEqual(plain(a.h.calls.legacyInvoice), [{ id: 'WS-2026-001', no: 'SV/2026-27/0001' }]);
  assert.match(text(a.jobHtml()), /Bill issued/);
  await a.click('svb-bill-print', 'SV/2026-27/0001');
  assert.equal(a.h.calls.report[0].type, 'serviceBillSummary');
  assert.equal(a.h.calls.report[0].opts.invoiceNo, 'SV/2026-27/0001');
  const p = await jobWith('advance', { session: SESSIONS.owner });
  await p.click('svb-job-bill-open');
  await p.type('ccpt', 'CC-81');
  await p.click('svb-bill-review');
  assert.match(text(p.layerHtml()), /Advance set off Rs 500\.00/);
  await p.click('svb-bill-save');
  assert.match(text(p.layerHtml()), /Balance to pay Rs 1,034\.00\./);
  const z = await jobWith('approved', { session: SESSIONS.owner });
  z.billing.state.jobs['WS-2026-001'].receipts.push({ no: 'SAR/26-27/0009', kind: 'SAR', amountPaise: 153400, status: 'OK', payMode: 'Cash', docDate: '2026-11-13' });
  await z.click('svb-job-bill-open');
  await z.type('ccpt', 'CC-82');
  await z.click('svb-bill-review');
  await z.click('svb-bill-save');
  assert.equal(z.layerHtml().includes('svb-job-balance-open'), false, 'nothing to take: no Take balance button');
});

test('U50 a discount above the limit asks the Owner PIN on Issue bill, not on Review; the Store Manager is refused before the keypad; Ask the Owner repeats with the same clientRef', async () => {
  const a = await openBill({ session: SESSIONS.owner });
  await a.type('ccpt', 'CC-90');
  await a.type('discount', '10.00', 0);
  await a.type('discountReason', 'regular customer');
  await a.click('svb-bill-review');
  assert.equal(a.h.calls.reauth.length, 0, 'Review never asks for the PIN');
  await a.click('svb-bill-save');
  assert.equal(a.h.calls.reauth.length, 1);
  assert.equal(a.h.calls.reauth[0], 'Approve discount of Rs 10.00 on job WS-2026-001. The Store Manager limit is Rs 0.00.');
  assert.ok(lastCall(a, 'issueBill').args[1].stepUp.ok);
  const m = await openBill({ session: SESSIONS.manager });
  await m.type('ccpt', 'CC-91');
  await m.type('discount', '10.00', 0);
  await m.type('discountReason', 'regular customer');
  await m.click('svb-bill-review');
  await m.click('svb-bill-save');
  assert.equal(m.h.calls.reauth.length, 0, 'refused before the keypad');
  assert.equal(m.billing.count('issueBill'), 0);
  assert.match(text(m.layerHtml()), /Only the Owner can do this\. Unlock Owner mode in the app header, then try again\./);
  const w = await openBill({ session: SESSIONS.manager, billingOpts: LIMIT_500 });
  await w.type('ccpt', 'CC-92');
  await w.type('discount', '10.00', 0);
  await w.type('discountReason', 'regular customer');
  await w.click('svb-bill-review');
  await w.click('svb-bill-save');
  assert.equal(w.h.calls.reauth.length, 0, 'within the limit: no keypad');
  assert.equal(w.billing.count('issueBill'), 1);
  const r = await openBill({ session: SESSIONS.owner, billingOpts: LIMIT_500 });
  await r.type('ccpt', 'CC-93');
  await r.type('discount', '10.00', 0);
  await r.type('discountReason', 'regular customer');
  r.billing.forced.issueBill = { ok: false, code: 'ABOVE_MANAGER_LIMIT' };
  await r.click('svb-bill-review');
  await r.click('svb-bill-save');
  assert.match(text(r.layerHtml()), /This discount is above the limit\. The Owner must approve it\./);
  assert.ok(r.layerHtml().includes('svb-bill-ask-owner'));
  const first = lastCall(r, 'issueBill').args[1].clientRef;
  delete r.billing.forced.issueBill;
  await r.click('svb-bill-ask-owner');
  assert.equal(r.h.calls.reauth.length, 1);
  const calls = r.billing.calls.filter((c) => c.name === 'issueBill');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args[1].clientRef, first, 'same clientRef on the repeat');
  assert.ok(calls[1].args[1].stepUp.ok);
});

test('U51 add a CCPT number: required, trimmed, 40 characters; a duplicate shows its text; success refreshes the chip', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedBill(undefined, { ccptInvoiceNo: '' });
  await a.ready();
  assert.match(text(a.jobHtml()), /CCPT number missing/);
  await a.click('svb-job-ccptno-open');
  await a.click('svb-cc-save');
  assert.match(text(a.layerHtml()), /Enter the CCPT invoice number\./);
  assert.equal(a.billing.count('addCcptNumber'), 0);
  assert.equal(a.field('ccpt').getAttribute('maxlength'), '40');
  await a.type('ccpt', '  CC-1  ');
  a.billing.state.dupCcpt = true;
  await a.click('svb-cc-save');
  assert.match(text(a.layerHtml()), /This CCPT number is already on another bill\./);
  a.billing.state.dupCcpt = false;
  await a.click('svb-cc-save');
  const c = lastCall(a, 'addCcptNumber');
  assert.equal(c.args[0].ccptInvoiceNo, 'CC-1');
  assert.equal(c.args[0].invoiceNo, 'SV/2026-27/0001');
  assert.equal(a.layerHtml(), '');
  assert.match(text(a.jobHtml()), /Bill issued/);
});

test('U52 not billed in CCPT: Owner only, a reason, the keypad label, the Store Manager refused before the keypad, the print label changes', async () => {
  const m = await jobWith('approved', { session: SESSIONS.manager });
  assert.equal(m.jobHtml().includes('svb-job-notccpt-open'), false);
  const r = await m.ui.internals.dispatch('svb-job-notccpt-open');
  assert.equal(r.code, 'SVB_OWNER_ONLY');
  const a = await jobWith('approved', { session: SESSIONS.owner });
  await a.click('svb-job-notccpt-open');
  assert.equal(a.field('notIn').checked, true, 'the dialog opens in the not-billed-in-CCPT mode');
  await a.type('notInReason', 'ab');
  await a.click('svb-bill-review');
  assert.match(text(a.layerHtml()), /Type a reason of at least 5 characters\./);
  await a.type('notInReason', 'Saagar own repair');
  await a.click('svb-bill-review');
  await a.click('svb-bill-save');
  assert.equal(a.h.calls.reauth[0], 'Mark job WS-2026-001 as not billed in CCPT. The app will print the tax invoice for it.');
  const c = lastCall(a, 'issueBill');
  assert.equal(c.args[0].mode, 'NOT_IN_CCPT');
  assert.equal(c.args[0].notInCcptReason, 'Saagar own repair');
  assert.equal(c.args[0].ccptInvoiceNo, '');
  assert.ok(a.layerHtml().includes('Print tax invoice'));
  assert.match(text(a.jobHtml()), /Not billed in CCPT/);
  assert.ok(a.jobHtml().includes('Print tax invoice'));
  await a.click('svb-bill-print', 'SV/2026-27/0001');
  assert.equal(a.h.calls.report[0].type, 'serviceTaxInvoiceV2');
});

test('U53 cancel bill: Owner only, the bill\'s own day, a reason, the keypad label, money-taken text, the old invoice number cleared', async () => {
  const a = await jobWith('billed', { session: SESSIONS.owner });
  await a.click('svb-job-cancel-open');
  assert.match(text(a.layerHtml()), /The number SV\/2026-27\/0001 stays used and is marked cancelled\. This works on the day the bill was made\. After that, issue a credit note\./);
  await a.click('svb-cbill-confirm');
  assert.match(text(a.layerHtml()), /Type a reason of at least 5 characters\./);
  assert.equal(a.h.calls.reauth.length, 0);
  await a.type('reason', 'wrong customer');
  a.billing.forced.cancelBill = { ok: false, code: 'BILL_HAS_PAYMENTS' };
  await a.click('svb-cbill-confirm');
  assert.match(text(a.layerHtml()), /Money was taken against this bill\. Refund it first or issue a credit note\./);
  delete a.billing.forced.cancelBill;
  await a.click('svb-cbill-confirm');
  assert.equal(a.h.calls.reauth.at ? a.h.calls.reauth.at(-1) : a.h.calls.reauth[a.h.calls.reauth.length - 1], 'Cancel bill SV/2026-27/0001 for job WS-2026-001: total Rs 1,534.00. The number stays used.');
  assert.deepEqual(plain(lastCall(a, 'cancelBill').args[0]), { invoiceNo: 'SV/2026-27/0001', reason: 'wrong customer' });
  assert.deepEqual(plain(a.h.calls.legacyInvoice.pop()), { id: 'WS-2026-001', no: '' });
  assert.match(text(a.jobHtml()), /Bill cancelled/);
  const o = await jobWith('billed', { session: SESSIONS.owner });
  o.billing.state.jobs['WS-2026-001'].bills[0].at = '2026-11-12T05:00:00.000Z';
  await o.ui.refreshJob();
  await flush();
  await o.click('svb-job-cancel-open');
  assert.match(text(o.layerHtml()), /A bill can be cancelled only on the day it was made\. Issue a credit note instead\./);
  assert.equal(o.layerHtml().includes('svb-cbill-confirm'), false);
  const m = await jobWith('billed', { session: SESSIONS.manager });
  assert.equal(m.jobHtml().includes('svb-job-cancel-open'), false);
  assert.equal((await m.ui.internals.dispatch('svb-job-cancel-open')).code, 'SVB_OWNER_ONLY');
});

test('U54 credit note and refund: reason, quantities bounded, price mode, refund bounded, payload keys, result view, stock list for a returned part', async () => {
  const a = await jobWith('billed', { session: SESSIONS.owner });
  a.billing.takeReceipt({ jobId: 'WS-2026-001', kind: 'balance', amountPaise: 153400, payMode: 'Cash', payRef: '', note: '' }, OWNER_CTX());
  await a.ui.refreshJob();
  await flush();
  await a.click('svb-job-credit-open');
  const t = text(a.layerHtml());
  assert.match(t, /Bill SV\/2026-27\/0001, total Rs 1,534\.00, paid so far Rs 1,534\.00, already credited Rs 0\.00\./);
  assert.match(t, /Billed 1 \/ Already credited 0/);
  await a.click('svb-cn-save');
  assert.match(text(a.layerHtml()), /Type a reason of at least 5 characters\./);
  await a.type('details', 'part returned unused');
  await a.click('svb-cn-save');
  assert.match(text(a.layerHtml()), /Choose at least one line to credit\./);
  await a.type('value', '2', 0);
  await a.click('svb-cn-save');
  assert.match(text(a.layerHtml()), /Enter a whole number from 0 to 1\./);
  await a.type('value', '1', 0);
  assert.match(text(a.layerHtml()), /Credit total Rs 1,180\.00/);
  await a.type('refundAmount', '2000');
  await a.click('svb-cn-save');
  assert.match(text(a.layerHtml()), /The refund cannot be more than the money paid \(Rs 1,534\.00\)\./);
  assert.equal(a.billing.count('issueCreditNote'), 0);
  await a.type('refundAmount', '1180');
  await a.click('svb-cn-save');
  assert.equal(a.h.calls.reauth[a.h.calls.reauth.length - 1], 'Issue credit note on bill SV/2026-27/0001: credit Rs 1,180.00, refund Rs 1,180.00.');
  const c = lastCall(a, 'issueCreditNote');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['invoiceNo', 'mode', 'note', 'reason', 'reasonClass', 'refund', 'request', 'stock']);
  assert.deepEqual(plain(c.args[0].request), { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] });
  assert.deepEqual(plain(c.args[0].stock), [{ lineNo: 1, qty: 1 }], 'a returned PART goes on the stock list');
  assert.equal(c.args[0].reasonClass, 'RETURN');
  assert.equal(c.args[0].mode, 'PARTIAL');
  assert.deepEqual(plain(c.args[0].refund), { amountPaise: 118000, payMode: 'Cash', payRef: '' });
  const r = text(a.layerHtml());
  assert.match(r, /Credit note SCN\/26-27\/0001 issued\./);
  assert.match(r, /Refund SRF\/26-27\/0001: Rs 1,180\.00 by Cash\./);
  assert.ok(a.layerHtml().includes('svb-cn-print') && a.layerHtml().includes('svb-cn-print-refund'));
  await a.click('svb-cn-print', 'SCN/26-27/0001');
  assert.equal(a.h.calls.report[0].type, 'serviceCreditNote');
  assert.equal(a.h.calls.report[0].opts.noteNo, 'SCN/26-27/0001');
  await a.click('svb-cn-print-refund', 'SRF/26-27/0001');
  assert.equal(a.h.calls.report[1].type, 'serviceRefundVoucher');
  const p = await jobWith('billed', { session: SESSIONS.owner });
  await p.click('svb-job-credit-open');
  await p.setSelect('reason', 'PRICE');
  await p.type('details', 'price was too high');
  await p.type('value', '50.00', 0);
  await p.click('svb-cn-save');
  const pc = lastCall(p, 'issueCreditNote').args[0];
  assert.deepEqual(plain(pc.request), { kind: 'LINES', lines: [{ lineNo: 1, taxablePaise: 5000 }] });
  assert.deepEqual(plain(pc.stock), []);
  assert.equal(pc.refund, null);
  const big = await jobWith('billed', { session: SESSIONS.owner });
  await big.click('svb-job-credit-open');
  await big.setSelect('reason', 'PRICE');
  await big.type('details', 'price was too high');
  await big.type('value', '99999.00', 0);
  await big.click('svb-cn-save');
  assert.match(text(big.layerHtml()), /Enter an amount in rupees, for example 149\.50\./);
  assert.equal(big.billing.count('issueCreditNote'), 0);
});

test('U55 refund an advance: only live advances, bounded amount, reference for non-cash, keypad label, payload keys', async () => {
  const a = await jobWith('advance', { session: SESSIONS.owner });
  await a.click('svb-job-refund-open');
  assert.match(text(a.layerHtml()), /You can refund up to Rs 500\.00\./);
  assert.match(text(a.layerHtml()), /SAR\/26-27\/0001 +2026-11-13 +Rs 500\.00/.source ? /SAR\/26-27\/0001/ : /x/);
  await a.type('amount', '500.01');
  await a.type('reason', 'customer cancelled');
  await a.click('svb-ar-save');
  assert.match(text(a.layerHtml()), /The refund cannot be more than Rs 500\.00\./);
  await a.type('amount', '200');
  await a.setSelect('payMode', 'UPI');
  await a.click('svb-ar-save');
  assert.match(text(a.layerHtml()), /Type the UPI, card or bank reference/);
  assert.equal(a.h.calls.reauth.length, 0, 'bad fields never reach the keypad');
  await a.type('payRef', 'UPI-REF-77');
  await a.click('svb-ar-save');
  assert.equal(a.h.calls.reauth[0], 'Refund advance receipt SAR/26-27/0001 on job WS-2026-001: Rs 200.00.');
  const c = lastCall(a, 'refund');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['advanceNo', 'amountPaise', 'jobId', 'payMode', 'payRef', 'reason']);
  assert.deepEqual(plain(c.args[0]), { jobId: 'WS-2026-001', advanceNo: 'SAR/26-27/0001', amountPaise: 20000, payMode: 'UPI', payRef: 'UPI-REF-77', reason: 'customer cancelled' });
  assert.match(text(a.layerHtml()), /Refund SRF\/26-27\/0001 made: Rs 200\.00\./);
  await a.click('svb-ar-print', 'SRF/26-27/0001');
  assert.equal(a.h.calls.report[0].type, 'serviceRefundVoucher');
  const none = await jobWith('approved', { session: SESSIONS.owner });
  assert.equal(none.jobHtml().includes('svb-job-refund-open'), false, 'nothing held: no refund button');
});

test('U56 void job: blockers listed in red hide the button; with none a reason and the keypad; the old case fields are written once', async () => {
  const a = await jobWith('advance', { session: SESSIONS.owner, storesOpts: { jobParts: { ok: true, rows: [], totalNet: 3 } } });
  await a.click('svb-job-void-open');
  const t = text(a.layerHtml());
  assert.match(t, /Advance held Rs 500\.00\. Refund it first\./);
  assert.match(t, /Parts still with this job: 3 pieces\. Return them in Stores first\./);
  assert.equal(a.layerHtml().includes('svb-void-save'), false);
  const b = await jobWith('estimate', { session: SESSIONS.owner });
  await b.click('svb-job-void-open');
  assert.ok(b.layerHtml().includes('svb-void-save'));
  await b.click('svb-void-save');
  assert.match(text(b.layerHtml()), /Type a reason of at least 5 characters\./);
  await b.type('reason', 'duplicate job card');
  await b.click('svb-void-save');
  assert.equal(b.h.calls.reauth[0], 'Void job WS-2026-001. It cannot be edited or billed afterwards.');
  assert.deepEqual(plain(lastCall(b, 'voidJob').args[0]), { jobId: 'WS-2026-001', reason: 'duplicate job card' });
  assert.equal(b.h.calls.legacyVoid.length, 1);
  assert.equal(b.h.calls.legacyVoid[0].rec.reason, 'duplicate job card');
  assert.match(text(b.jobHtml()), /This job was voided\./);
  assert.equal(b.actionsIn(b.jobHtml()).some((x) => /open$/.test(x)), false);
  assert.match(b.h.calls.toast[b.h.calls.toast.length - 1], /^Job WS-2026-001 voided\.$/);
  const billed = await jobWith('billed', { session: SESSIONS.owner });
  await billed.click('svb-job-void-open');
  assert.match(text(billed.layerHtml()), /A bill is active\. Cancel it or issue a credit note first\./);
});

test('U57 no-charge warranty: three inputs; Store Manager and Owner, desk refused; a refusal shows its text; after saving the close gate allows and a zero final amount is allowed', async () => {
  const a = await jobWith('estimate', { session: SESSIONS.manager });
  await a.click('svb-job-ncsheet-open');
  await a.click('svb-nc-save');
  const t = text(a.layerHtml());
  assert.match(t, /Enter the warranty reference\./);
  assert.match(t, /Type a reason of at least 5 characters\./);
  assert.match(t, /Tick the box to confirm\./);
  assert.equal(a.billing.count('issueNoChargeSheet'), 0);
  await a.type('ref', 'TW-12345');
  await a.type('note', 'in warranty, glass cracked');
  await a.check('tick', true);
  await a.click('svb-nc-save');
  const c = lastCall(a, 'issueNoChargeSheet');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['jobId', 'labour', 'note']);
  assert.equal(c.args[0].note, 'Warranty ref TW-12345. in warranty, glass cracked');
  // Stage E round 4 (R-gaps-2): the labour of the latest estimate goes on the sheet, so a labour-only warranty job gets one too
  assert.deepEqual(JSON.parse(JSON.stringify(c.args[0].labour)), [{ code: 'DEMO-L1', name: 'Demo service', qty: 1 }]);
  assert.equal(a.h.calls.reauth.length, 0, 'no PIN for the no-charge sheet');
  assert.equal(a.ui.closeGate('WS-2026-001'), null);
  assert.equal(a.ui.allowsZeroFinal('WS-2026-001'), true);
  assert.match(text(a.jobHtml()), /No-charge warranty/);
  const d = await jobWith('estimate', { session: SESSIONS.desk, billingOpts: DESK });
  assert.equal(d.jobHtml().includes('svb-job-ncsheet-open'), false);
  assert.equal((await d.ui.internals.dispatch('svb-job-ncsheet-open')).code, 'SVB_ROLE_DENIED');
  const e = await jobWith('estimate', { session: SESSIONS.owner });
  e.billing.forced.issueNoChargeSheet = { ok: false, code: 'NO_CHARGE_CONFLICT' };
  await e.click('svb-job-ncsheet-open');
  await e.type('ref', 'TW-1');
  await e.type('note', 'covered work');
  await e.check('tick', true);
  await e.click('svb-nc-save');
  assert.match(text(e.layerHtml()), /A bill or an advance already exists on this job\. Cancel or refund it first\./);
});

/* ------------------------------------------------------------------ PIN, busy, retry, keys */

const PIN_ACTIONS = {
  discount: async (a) => {
    a.seedApproved();
    await a.ready();
    await a.click('svb-job-bill-open');
    await a.type('ccpt', 'CC-5');
    await a.type('discount', '10.00', 0);
    await a.type('discountReason', 'regular customer');
    await a.click('svb-bill-review');
    return { go: () => a.click('svb-bill-save'), write: 'issueBill', mustMention: ['WS-2026-001', 'Rs 10.00'] };
  },
  notccpt: async (a) => {
    a.seedApproved();
    await a.ready();
    await a.click('svb-job-bill-open');
    await a.check('notIn', true);
    await a.type('notInReason', 'Saagar own repair');
    await a.click('svb-bill-review');
    return { go: () => a.click('svb-bill-save'), write: 'issueBill', mustMention: ['WS-2026-001'] };
  },
  cancel: async (a) => {
    a.seedBill();
    await a.ready();
    await a.click('svb-job-cancel-open');
    await a.type('reason', 'wrong customer');
    return { go: () => a.click('svb-cbill-confirm'), write: 'cancelBill', mustMention: ['SV/2026-27/0001', 'Rs 1,534.00'] };
  },
  credit: async (a) => {
    a.seedBill();
    await a.ready();
    await a.click('svb-job-credit-open');
    await a.type('details', 'part returned unused');
    await a.type('value', '1', 0);
    return { go: () => a.click('svb-cn-save'), write: 'issueCreditNote', mustMention: ['SV/2026-27/0001', 'Rs 1,180.00'] };
  },
  refund: async (a) => {
    a.seedApproved();
    a.billing.takeReceipt({ jobId: 'WS-2026-001', kind: 'advance', amountPaise: 50000, payMode: 'Cash', payRef: '', note: '' }, OWNER_CTX());
    await a.ready();
    await a.click('svb-job-refund-open');
    await a.type('amount', '100');
    await a.type('reason', 'customer cancelled');
    return { go: () => a.click('svb-ar-save'), write: 'refund', mustMention: ['SAR/26-27/0001', 'Rs 100.00'] };
  },
  void: async (a) => {
    a.seedEstimate();
    await a.ready();
    await a.click('svb-job-void-open');
    await a.type('reason', 'duplicate job card');
    return { go: () => a.click('svb-void-save'), write: 'voidJob', mustMention: ['WS-2026-001'] };
  },
  nccancel: async (a) => {
    a.seedEstimate();
    a.billing.issueNoChargeSheet({ jobId: 'WS-2026-001', labour: [], note: 'warranty' }, OWNER_CTX());
    await a.ready();
    await a.click('svb-job-nccancel-open');
    await a.type('reason', 'wrongly marked');
    return { go: () => a.click('svb-ncc-save'), write: 'cancelNoChargeSheet', mustMention: ['WS-2026-001'] };
  },
  override: async (a) => {
    a.seedApproved();
    await a.ready();
    await a.click('svb-job-bill-open');
    await a.type('ccpt', 'CC-6');
    await a.click('svb-bill-review');
    a.billing.forced.issueBill = { ok: false, code: 'REAPPROVAL_REQUIRED' };
    await a.click('svb-bill-save');
    assert.match(text(a.layerHtml()), /higher than the approved amount/);
    delete a.billing.forced.issueBill;
    await a.type('override', 'customer asked for more work');
    await a.click('svb-bill-ask-owner');
    return null;
  }
};

for (const [name, prep] of Object.entries(PIN_ACTIONS)) {
  test('U58 PIN matrix, ' + name + ': refused keypad, rejected promise, Owner dropping to Manager during the keypad, Manager refused before the keypad', async () => {
    if (name === 'override') {
      const o = setup({ session: SESSIONS.owner });
      const r = await prep(o);
      assert.equal(r, null);
      assert.equal(o.h.calls.reauth.length, 1);
      assert.match(o.h.calls.reauth[0], /^Approve a bill above the approved amount on job WS-2026-001: Rs /);
      assert.ok(o.h.calls.reauth[0].length <= 170);
      assert.equal(lastCall(o, 'issueBill').args[0].approvalOverrideReason, 'customer asked for more work');
      return;
    }
    const wrote = (a, w) => a.billing.count(w);
    /* keypad says no */
    let a = setup({ session: SESSIONS.owner });
    let s = await prep(a);
    a.h.reauthResult = false;
    await s.go();
    assert.equal(a.h.calls.reauth.length, 1);
    assert.ok(a.h.calls.reauth[0].length <= 170, 'label length ' + a.h.calls.reauth[0].length);
    for (const m of s.mustMention) assert.ok(a.h.calls.reauth[0].includes(m), m + ' in ' + a.h.calls.reauth[0]);
    assert.equal(wrote(a, s.write), 0);
    assert.match(text(a.layerHtml()), /Owner approval was not given\. Nothing was changed\./);
    assert.ok(a.layerHtml().length > 0, 'the dialog stays open with its values');
    /* keypad rejects */
    a = setup({ session: SESSIONS.owner });
    s = await prep(a);
    a.h.reauthResult = () => Promise.reject(new Error('keypad closed'));
    await s.go();
    assert.equal(wrote(a, s.write), 0);
    /* owner mode dropped while the keypad was open */
    a = setup({ session: SESSIONS.owner });
    s = await prep(a);
    a.h.reauthResult = () => { a.h.session = SESSIONS.manager; return Promise.resolve(true); };
    await s.go();
    assert.equal(wrote(a, s.write), 0);
    assert.match(text(a.layerHtml()), /Only the Owner can do this/);
    /* a Store Manager never sees the keypad */
    a = setup({ session: SESSIONS.owner });
    s = await prep(a);
    a.h.session = SESSIONS.manager;
    await s.go();
    assert.equal(a.h.calls.reauth.length, 0, 'Manager refused before the keypad');
    assert.equal(wrote(a, s.write), 0);
  });
}

test('U59 busy: a second press while the first is pending is refused with SVB_BUSY and reaches the facade once; buttons are disabled and the primary reads Saving...', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  let release;
  const gate = new Promise((r) => { release = r; });
  a.billing.forced.takeReceipt = (d) => gate.then(() => ({ ok: true, receipt: { no: 'SAR/26-27/0001' }, posted: true }));
  const first = a.ui.internals.dispatch('svb-rcpt-save');
  await flush();
  const second = await a.ui.internals.dispatch('svb-rcpt-save');
  assert.equal(second.ok, false);
  assert.equal(second.code, 'SVB_BUSY');
  assert.equal(a.billing.count('takeReceipt'), 1);
  const html = a.layerHtml();
  assert.match(html, /aria-busy="true"/);
  assert.match(text(html), /Saving\.\.\./);
  for (const b of Array.from(html.matchAll(/<button\b[^>]*>/g)).map((m) => m[0])) assert.match(b, /disabled/, b);
  assert.match(text(a.layerHtml()), /Another save is in progress\. Wait a moment\./);
  release();
  await first;
  await flush();
  assert.equal(a.billing.count('takeReceipt'), 1);
  assert.match(text(a.layerHtml()), /Receipt SAR\/26-27\/0001 saved/);
});

test('U60 retry after an unreadable reply sends the same clientRef; a replayed reply shows the normal success view and no second receipt', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  a.billing.forced.takeReceipt = () => 'not an answer';
  await a.click('svb-rcpt-save');
  assert.match(text(a.layerHtml()), /Something went wrong\. Nothing was changed\. Code: SVB_INTERNAL\./);
  assert.equal(a.field('amount').value, '100', 'typed values stay');
  delete a.billing.forced.takeReceipt;
  await a.click('svb-rcpt-save');
  const calls = a.billing.calls.filter((c) => c.name === 'takeReceipt');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args[1].clientRef, calls[1].args[1].clientRef);
  assert.equal(a.billing.state.jobs['WS-2026-001'].receipts.length, 1);
  const b = await jobWith('approved');
  await b.click('svb-job-advance-open');
  await b.type('amount', '100');
  b.billing.forced.takeReceipt = (d) => ({ ok: true, replayed: true, receipt: { no: 'SAR/26-27/0001', amountPaise: 10000, payMode: 'Cash' }, posted: true });
  await b.click('svb-rcpt-save');
  assert.match(text(b.layerHtml()), /Receipt SAR\/26-27\/0001 saved: Rs 100\.00 by Cash\./);
  assert.equal(b.billing.state.jobs['WS-2026-001'].receipts.length, 0, 'the fake saw one replayed call and wrote nothing new');
});

test('U17 clientRef: made once per dialog, the same on every retry, different for the next dialog', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  a.billing.forced.takeReceipt = { ok: false, code: 'SVCS_REV_CONFLICT' };
  await a.click('svb-rcpt-save');
  await a.click('svb-rcpt-save');
  delete a.billing.forced.takeReceipt;
  await a.click('svb-rcpt-save');
  const refs = a.billing.calls.filter((c) => c.name === 'takeReceipt').map((c) => c.args[1].clientRef);
  assert.equal(refs.length, 3);
  assert.equal(new Set(refs).size, 1);
  await a.click('svb-rcpt-done');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  await a.click('svb-rcpt-save');
  const refs2 = a.billing.calls.filter((c) => c.name === 'takeReceipt').map((c) => c.args[1].clientRef);
  assert.equal(refs2.length, 4);
  assert.notEqual(refs2[3], refs[0]);
});

test('U18 discount rule: above the limit needs the Owner PIN, at or below does not; limit 0 means every discount; desk sends discount 0', async () => {
  const run = async (sess, limit, discount) => {
    const a = await openBill({ session: sess, billingOpts: { status: { config: { discountLimitPaise: limit, billingRoles: ['Cashier'], estimateRoles: [] } } } });
    await a.type('ccpt', 'CC-D');
    if (a.field('discount', 0)) { await a.type('discount', discount, 0); await a.type('discountReason', 'regular customer'); }
    await a.click('svb-bill-review');
    await a.click('svb-bill-save');
    return a;
  };
  let a = await run(SESSIONS.owner, 1000, '10.00');
  assert.equal(a.h.calls.reauth.length, 0, 'exactly at the limit: no keypad');
  a = await run(SESSIONS.owner, 1000, '10.01');
  assert.equal(a.h.calls.reauth.length, 1, 'one paisa above: keypad');
  a = await run(SESSIONS.owner, 0, '0.01');
  assert.equal(a.h.calls.reauth.length, 1, 'limit 0: every discount');
  a = await run(SESSIONS.owner, 0, '0');
  assert.equal(a.h.calls.reauth.length, 0, 'no discount: no keypad');
  a = await run(SESSIONS.desk, 1000, '5.00');
  assert.equal(a.field('discount', 0), null);
  assert.equal(lastCall(a, 'issueBill').args[0].parts[0].discountPaise, 0);
  assert.equal(lastCall(a, 'issueBill').args[0].billDiscountPaise, 0);
});

test('U61 Escape: a clean dialog closes and the event is stopped; a dirty dialog asks to discard; with no dialog the event is left alone', async () => {
  const a = await jobWith('approved');
  let ev = fire(a.doc, a.doc.body, 'keydown', { key: 'Escape' });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(ev.stopped, false, 'no dialog open: the shell back stage still sees Escape');
  await a.click('svb-job-advance-open');
  ev = fire(a.doc, a.doc.body, 'keydown', { key: 'Escape' });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(ev.stopped, true);
  assert.equal(ev.immediateStopped, true);
  assert.equal(a.layerHtml(), '');
  await a.click('svb-job-advance-open');
  await a.type('amount', '5');
  ev = fire(a.doc, a.doc.body, 'keydown', { key: 'Escape' });
  assert.equal(ev.stopped, true);
  assert.match(text(a.layerHtml()), /Discard what you typed\?/);
  await a.click('svb-dialog-keep');
  assert.equal(a.field('amount').value, '5');
  fire(a.doc, a.doc.body, 'keydown', { key: 'Escape' });
  await a.click('svb-dialog-discard');
  assert.equal(a.layerHtml(), '');
});

test('U62 focus: first field gets it, Tab wraps both ways, closing returns focus to the opener', async () => {
  const a = await jobWith('approved');
  const opener = a.find('svb-job-advance-open');
  opener.focus();
  await a.click('svb-job-advance-open');
  assert.equal(a.doc.activeElement, a.field('amount'));
  const items = a.layer().querySelectorAll('[data-svcs-action],[data-svs-field]').filter((x) => !x.disabled);
  a.doc.activeElement = items[items.length - 1];
  let ev = fire(a.doc, items[items.length - 1], 'keydown', { key: 'Tab' });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(a.doc.activeElement, items[0]);
  a.doc.activeElement = items[0];
  ev = fire(a.doc, items[0], 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(a.doc.activeElement, items[items.length - 1]);
  await a.click('svb-rcpt-cancel');
  assert.equal(a.doc.activeElement, opener);
});

test('U63 context change: a role drop closes the dialog with the toast, redraws the card and hides the Billing button', async () => {
  const a = await jobWith('approved', { session: SESSIONS.owner });
  assert.equal(a.h.el.header.querySelectorAll('[data-svcs-action="svb-open-billing"]')[0].getAttribute('hidden'), null);
  await a.click('svb-job-advance-open');
  a.h.session = SESSIONS.staff;
  await a.ui.onContextChange();
  await flush();
  assert.equal(a.layerHtml(), '');
  assert.equal(a.h.calls.toast[a.h.calls.toast.length - 1], 'Your access changed. Nothing was saved.');
  assert.match(text(a.jobHtml()), /Billing is done by the front desk or the Store Manager\./);
  assert.notEqual(a.h.el.header.querySelectorAll('[data-svcs-action="svb-open-billing"]')[0].getAttribute('hidden'), null);
  a.h.session = SESSIONS.owner;
  await a.ui.onContextChange();
  assert.equal(a.h.el.header.querySelectorAll('[data-svcs-action="svb-open-billing"]')[0].getAttribute('hidden'), null);
});

test('U64 Enter: in the last field it presses the primary button; in a search field it picks the exact match else the first; Arrow Down moves through results', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  const note = a.field('note');
  await a.key(note, 'Enter');
  assert.equal(a.billing.count('takeReceipt'), 1);
  const e = await jobWith('approved');
  await e.click('svb-job-estimate-open');
  await e.click('svb-est-add-part');
  await e.type('search', 'DEMO-P', 0);
  await e.key(e.field('search', 0), 'Enter');
  assert.match(text(e.layerHtml()), /Demo glass/, 'first result when nothing matches exactly');
  const f = await jobWith('approved');
  await f.click('svb-job-estimate-open');
  await f.click('svb-est-add-part');
  await f.type('search', 'DEMO-P', 0);
  await f.key(f.field('search', 0), 'ArrowDown');
  const first = f.layer().querySelectorAll('.svs-pick-row')[0];
  assert.equal(f.doc.activeElement, first);
  await f.key(first, 'ArrowDown');
  assert.equal(f.doc.activeElement, f.layer().querySelectorAll('.svs-pick-row')[1]);
  await f.key(f.doc.activeElement, 'ArrowUp');
  assert.equal(f.doc.activeElement, first);
});

test('U65 past view: no write button anywhere; a forced click on each write action returns SVB_PAST_VIEW with no facade write; printing still works', async () => {
  const a = await jobWith('billed', { session: SESSIONS.owner });
  a.h.past = true;
  await a.ui.refreshJob();
  await flush();
  assert.equal(a.actionsIn(a.jobHtml()).some((x) => /open$/.test(x)), false);
  assert.equal(a.closeHtml(), '');
  for (const id of ['svb-job-estimate-open', 'svb-job-approval-open', 'svb-job-advance-open', 'svb-job-bill-open', 'svb-job-balance-open', 'svb-job-ccptno-open', 'svb-job-notccpt-open', 'svb-job-ncsheet-open', 'svb-job-cancel-open', 'svb-job-credit-open', 'svb-job-refund-open', 'svb-job-void-open', 'svb-job-nccancel-open']) {
    const r = await a.ui.internals.dispatch(id);
    assert.equal(r.code, 'SVB_PAST_VIEW', id);
    assert.equal(a.layerHtml(), '', id);
  }
  assert.equal(a.billing.writeCalls().length, 0);
  assert.ok(a.actionsIn(a.jobHtml()).includes('svb-job-print-bill'));
  await a.ui.internals.dispatch('svb-job-print-bill');
  assert.equal(a.h.calls.report.length, 1, 'printing works in a past view');
});

test('U66 Stage E (D-flows-3): the advance-above-bill refusal names the excess in rupees', async () => {
  const { loadUi } = await import('./lib/svc2-ui-harness.mjs');
  const { ui } = loadUi();
  // hand values: advance 150.00 held, bill 118.00, excess 32.00 (3200 paise)
  assert.equal(ui.kit.errText({ ok: false, code: 'ADVANCE_EXCEEDS_BILL', message: 'The advance held is more than this bill. Refund the extra first.', detail: { heldPaise: 15000, billPaise: 11800, excessPaise: 3200 } }),
    'The advance held is more than this bill by Rs 32.00. Refund the extra first.');
  // without the figure the bill layer's own sentence is shown, never the bare code
  assert.equal(ui.kit.errText({ ok: false, code: 'ADVANCE_EXCEEDS_BILL', message: 'The advance held is more than this bill. Refund the extra first.' }),
    'The advance held is more than this bill. Refund the extra first.');
});

test('U46b Stage E (D-gaps-1): with the real bill layer answer (lines under input) the bill dialog shows the lines', async () => {
  const a = await openBill({ session: SESSIONS.manager, billingOpts: { realShape: true } });
  const t = text(a.layerHtml());
  assert.match(t, /DEMO-P1 Demo glass, Qty 1/);
  assert.match(t, /DEMO-L1 Demo service, Qty 1/);
  assert.equal(/Add at least one line/.test(t), false);
});

test('U54b Stage E round 2 (A): a credit note with pieces still to come back shows them on the card; one press puts them back, a second press while busy is refused', async () => {
  const a = await jobWith('billed', { session: SESSIONS.manager });
  a.billing.state.jobs['WS-2026-001'].pending = [{ cnNo: 'SCN/26-27/0001', jobId: 'WS-2026-001', invoiceNo: 'SV/2026-27/0001', lineNo: 1, partCode: 'DEMO-P1', creditedQty: 2, returnedQty: 0, pendingQty: 2 }];
  await a.ui.refreshJob();
  await flush();
  assert.match(text(a.jobHtml()), /Parts to put back in stock: Credit note SCN\/26-27\/0001: 2 x DEMO-P1 Put back in stock/);
  const first = a.ui.internals.dispatch('svb-cn-restock', 'SCN/26-27/0001');
  const second = await a.ui.internals.dispatch('svb-cn-restock', 'SCN/26-27/0001');
  assert.equal(second.code, 'SVB_BUSY');
  assert.equal((await first).ok, true);
  await flush();
  assert.equal(a.billing.count('returnCreditedStock'), 1);
  assert.deepEqual(plain(a.billing.last('returnCreditedStock').args[0]), { cnNo: 'SCN/26-27/0001' });
  assert.ok(a.billing.last('returnCreditedStock').args[1].clientRef, 'a reference per press');
  assert.equal(/Parts to put back in stock/.test(text(a.jobHtml())), false, 'the row is gone once the parts are back');
  // a refusal is shown in plain words and the row stays (press again to retry)
  a.billing.state.jobs['WS-2026-001'].pending = [{ cnNo: 'SCN/26-27/0002', jobId: 'WS-2026-001', invoiceNo: 'SV/2026-27/0001', lineNo: 1, partCode: 'DEMO-P1', creditedQty: 1, returnedQty: 0, pendingQty: 1 }];
  a.billing.forced.returnCreditedStock = { ok: false, code: 'CREDIT_RETURN_INVALID', message: 'These parts cannot be returned against this credit note.' };
  await a.ui.refreshJob();
  await flush();
  const bad = await a.ui.internals.dispatch('svb-cn-restock', 'SCN/26-27/0002');
  assert.equal(bad.ok, false);
  assert.match(text(a.jobHtml()), /Credit note SCN\/26-27\/0002: 1 x DEMO-P1/);
});

test('U46c Stage E round 4 (R-flows-2): the bill edit view shows each line with rate and line amount and the bill total from the preview; a failed preview says "not available"', async () => {
  const a = await openBill({ session: SESSIONS.manager });
  await flush();
  const t = text(a.layerHtml());
  const pv = a.billing.last('previewBill');
  assert.ok(pv, 'the edit view asks the bill layer for a preview');
  // the figures on screen are the preview's own (the screen does no money arithmetic)
  const r = a.billing.previewBill(pv.args[0]);
  const money = (p) => 'Rs ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.ok(t.includes('Rate ' + money(r.lines[0].unitPricePaise)), t);
  assert.ok(t.includes('Line total ' + money(r.lines[0].totalPaise)), t);
  assert.ok(t.includes('Bill total ' + money(r.totals.totalPaise)), t);
  assert.equal(/Bill total -/.test(t), false);
  // a discount change asks again and the screen follows the new answer
  const before = a.billing.count('previewBill');
  await a.type('discount', '10', 0);
  await flush();
  assert.ok(a.billing.count('previewBill') > before);
  // no preview: the figures say "not available", never "-" or zero
  const b = await openBill({ session: SESSIONS.manager }, (x) => { x.billing.forced.previewBill = { ok: false, code: 'SOME_OTHER_CODE' }; });
  await flush();
  const u = text(b.layerHtml());
  assert.ok(u.includes('Bill total not available'), u);
  assert.ok(u.includes('Rate not available'));
  assert.equal(/Bill total -|Bill total Rs 0\.00/.test(u), false);
});

test('U42b Stage E round 4 (D-abuse-3): Enter in the amount field does not submit (by design); Enter twice in the last field saves once and shows the result', async () => {
  const a = await jobWith('approved');
  await a.click('svb-job-advance-open');
  await a.type('amount', '500');
  await a.key(a.field('amount'), 'Enter');
  assert.equal(a.billing.count('takeReceipt'), 0, 'Enter in the amount field saves nothing: the dialog stays open (what the tester saw)');
  const note = a.field('note');
  const k1 = a.key(note, 'Enter');
  const k2 = a.key(note, 'Enter');
  await Promise.all([k1, k2]);
  await flush();
  assert.equal(a.billing.count('takeReceipt'), 1, 'Enter twice: one receipt');
  assert.ok(/SAR\/26-27\/0001/.test(text(a.layerHtml())), 'the result view of the saved receipt');
  await a.key(a.field('note') || note, 'Enter');
  await flush();
  assert.equal(a.billing.count('takeReceipt'), 1, 'a third Enter after saving adds nothing');
});

test('U46d Stage E round 5 (F-1, F-2, F-3): a refused preview says why and keeps the last figures and the names; the reason re-runs the preview; the rate says incl. GST or + GST', async () => {
  const a = await openBill({ session: SESSIONS.manager });
  await flush();
  const base = a.billing.last('previewBill').args[0];
  const okR = a.billing.previewBill(base);
  const withDisc = a.billing.previewBill(Object.assign({}, base, { billDiscountPaise: 1000, discountReason: 'regular customer' }));
  const money = (p) => (p < 0 ? '-' : '') + 'Rs ' + (Math.abs(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // F-3: each line says whether its rate includes GST, from the bill layer's priceBasis
  let t = text(a.layerHtml());
  okR.lines.forEach((l) => assert.ok(t.includes('Rate ' + money(l.unitPricePaise) + (l.priceBasis === 'INCL' ? ' incl. GST' : ' + GST')), l.code + ' ' + t));
  // F-1: the Manager types a discount above the limit: the bill layer refuses the preview
  a.billing.forced.previewBill = (d) => (d.billDiscountPaise > 0 ? { ok: false, code: 'ABOVE_MANAGER_LIMIT' } : okR);
  await a.type('billDiscount', '10');
  await flush();
  t = text(a.layerHtml());
  assert.ok(t.includes('This discount is above the limit. The Owner must approve it.'), t);
  assert.ok(t.includes('The figures below are without the discount.'));
  assert.ok(t.includes('Bill total ' + money(okR.totals.totalPaise)), 'the last accepted figures stay');
  assert.ok(t.includes('DEMO-P1 Demo glass') && t.includes('DEMO-L1 Demo service'), 'the names stay');
  assert.equal(/not available/.test(t), false, 'nothing silently says not available');
  // F-2: a reason typed late runs the preview again; the total is the bill layer's to the paisa (after round-off, with the round-off row)
  a.billing.forced.previewBill = (d) => (d.billDiscountPaise > 0 && !d.discountReason ? { ok: false, code: 'DISCOUNT_REASON_REQUIRED', message: 'Type a reason for the discount.' } : withDisc);
  await a.type('billDiscount', '10');
  await flush();
  assert.ok(text(a.layerHtml()).includes('Type a reason for the discount.'));
  const before = a.billing.count('previewBill');
  await a.type('discountReason', 'regular customer');
  await flush();
  assert.ok(a.billing.count('previewBill') > before, 'the reason asks again');
  t = text(a.layerHtml());
  assert.ok(t.includes('Bill total ' + money(withDisc.totals.totalPaise)), t);
  assert.ok(t.includes('Round-off ' + money(withDisc.totals.roundOffPaise)), 'the round-off row shows the difference to the pre-round figure');
  assert.equal(/Type a reason for the discount\.|without the discount/.test(t), false, 'the refusal is gone once accepted');
});
