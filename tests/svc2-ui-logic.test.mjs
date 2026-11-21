// Service wave 2, W-UI: pure logic, rights, labels and error texts (P5 U11 to U13, U15, U16).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadUi, setup, SESSIONS } from './lib/svc2-ui-harness.mjs';

const require = createRequire(import.meta.url);
const stores = require('../www/service-stores-ui.js');
const { ui } = loadUi();
const I = ui.internals;

test('U11 money and quantity helpers', () => {
  for (const [text, paise] of [['12', 1200], ['12.5', 1250], ['1,234.5', 123450], ['Rs 99', 9900], ['0.05', 5], ['19.99', 1999], ['9999999.99', 999999999]]) {
    assert.deepEqual(JSON.parse(JSON.stringify(I.parsePaise(text))), { ok: true, paise }, text);
  }
  for (const bad of ['12.345', '-1', 'abc', '1e3', '', '   ', '10000000', '0']) assert.equal(I.parsePaise(bad).ok, false, bad);
  assert.deepEqual(JSON.parse(JSON.stringify(I.parsePaise('0', { allowZero: true }))), { ok: true, paise: 0 });
  assert.equal(I.money(123456), 'Rs 1,234.56');
  assert.equal(I.money(12345678), 'Rs 1,23,456.78');
  assert.equal(I.money(5), 'Rs 0.05');
  assert.equal(I.money(-250), '-Rs 2.50');
  assert.equal(I.money(null), '-');
  assert.equal(I.money(1.5), '-');
  assert.equal(I.parseQty('7').qty, 7);
  assert.equal(I.parseQty('0').ok, false);
  assert.equal(I.parseQty('1000', { max: 999 }).ok, false);
  assert.equal(I.parseQty('1.5').ok, false);
  assert.equal(I.parseRateBp('18').bp, 1800);
  assert.equal(I.parseRateBp('12.5').bp, 1250);
  assert.equal(I.parseRateBp('100.01').ok, false);
  assert.equal(I.rupeeText(153400), '1534.00');
  assert.equal(I.rupeeText(5), '0.05');
});

/* hand-typed from plan 2.11 */
const EXPECT = {
  viewBilling: { owner: 1, manager: 1, desk: 1, staff: 0, tech: 0, none: 0, broken: 0 },
  buildEstimate: { owner: 1, manager: 1, desk: 1, staff: 0, tech: 1, none: 0, broken: 0 },
  recordApproval: { owner: 1, manager: 1, desk: 1, staff: 0, tech: 1, none: 0, broken: 0 },
  addOtherLine: { owner: 1, manager: 1, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  giveDiscount: { owner: 1, manager: 1, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  takeReceipt: { owner: 1, manager: 1, desk: 1, staff: 0, tech: 0, none: 0, broken: 0 },
  issueBill: { owner: 1, manager: 1, desk: 1, staff: 0, tech: 0, none: 0, broken: 0 },
  addCcptNo: { owner: 1, manager: 1, desk: 1, staff: 0, tech: 0, none: 0, broken: 0 },
  markNoCharge: { owner: 1, manager: 1, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  markNotBilledCcpt: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  cancelBill: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  creditNote: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  refundAdvance: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  voidJob: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  viewDay: { owner: 1, manager: 1, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  viewCost: { owner: 1, manager: 1, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  reverseReceipt: { owner: 1, manager: 1, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  reverseRefund: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  settings: { owner: 1, manager: 0, desk: 0, staff: 0, tech: 0, none: 0, broken: 0 },
  viewJobStatus: { owner: 1, manager: 1, desk: 1, staff: 1, tech: 1, none: 0, broken: 0 }
};
const CFG = { billingRoles: ['Cashier'], estimateRoles: ['Technician'], discountLimitPaise: 0 };
const WHO = { owner: SESSIONS.owner, manager: SESSIONS.manager, desk: SESSIONS.desk, staff: Object.assign({}, SESSIONS.staff, { role: 'Trainee' }), tech: SESSIONS.tech, none: SESSIONS.none, broken: SESSIONS.broken };

test('U12 rights for every session and key match the role table of plan 2.11', () => {
  for (const [key, row] of Object.entries(EXPECT)) {
    for (const [who, sess] of Object.entries(WHO)) {
      const R = I.rightsFor(sess, CFG);
      assert.equal(R[key] === true, row[who] === 1, key + ' for ' + who);
    }
  }
  assert.equal(I.rightsFor(SESSIONS.desk, { billingRoles: [], estimateRoles: [] }).viewBilling, false, 'default: no desk role ticked');
  assert.equal(I.rightsFor(SESSIONS.manager, { billingRoles: ['Store Manager'], estimateRoles: [] }).desk, false);
  assert.equal(I.rightsFor(SESSIONS.tech, { billingRoles: [], estimateRoles: [] }).buildEstimate, false, 'a role not ticked cannot estimate');
});

test('U13 the mirror and the facade can() answer the same for the Owner-only keys: a Manager is refused before the keypad', async () => {
  const a = setup({ session: SESSIONS.manager });
  await a.ready();
  for (const key of ['markNotBilledCcpt', 'cancelBill', 'creditNote', 'refundAdvance', 'voidJob', 'cancelNoCharge', 'settings']) {
    assert.equal(I.rightsFor(SESSIONS.manager, CFG)[key], false, key);
    assert.equal(I.rightsFor(SESSIONS.owner, CFG)[key], true, key);
  }
  assert.equal(a.h.calls.reauth.length, 0);
});

test('U15 every keypad label fits in 170 characters with a 24-character job and a large amount, and names the job or bill and the amount', () => {
  const big = 'Rs 9,99,99,999.99';
  const job = 'WS-2026-0000000000000001';
  const rows = {
    pin_discount: { amount: big, job, limit: big },
    pin_notccpt: { job },
    pin_override: { job, amount: big },
    pin_cancel: { no: 'SV/2026-27/99999', job, amount: big },
    pin_credit: { no: 'SV/2026-27/99999', amount: big, refund: big },
    pin_refund: { no: 'SAR/26-27/99999', job, amount: big },
    pin_void: { job },
    pin_nc_cancel: { job }
  };
  const fill = (s, v) => s.replace(/\{([a-z0-9]+)\}/g, (m, k) => v[k]);
  for (const [id, vars] of Object.entries(rows)) {
    const s = fill(I.TEXT[id], vars);
    assert.ok(s.length <= 170, id + ' ' + s.length);
    assert.equal(/\{/.test(s), false, id);
  }
  assert.equal(I.TEXT.pin_cancel, 'Cancel bill {no} for job {job}: total {amount}. The number stays used.');
  assert.equal(I.TEXT.pin_void, 'Void job {job}. It cannot be edited or billed afterwards.');
  assert.equal(I.TEXT.pin_refund, 'Refund advance receipt {no} on job {job}: {amount}.');
  assert.equal(I.TEXT.pin_credit, 'Issue credit note on bill {no}: credit {amount}, refund {refund}.');
});

test('U16 error texts: exact UI sentences, a core message passes through, an unknown code shows the generic sentence, Phase 1 sentences are character for character', async () => {
  const a = setup({});
  await a.ready();
  const e = a.ui.internals.errorText;
  const want = {
    SVB_CORE_MISSING: 'Billing is not available in this build. Nothing was changed.',
    SVB_PIN_DENIED: 'Owner approval was not given. Nothing was changed.',
    SVB_PAST_VIEW: 'You are viewing a past date. Billing cannot be changed.',
    SVB_INTEGRITY: 'The billing records failed their check. Posting is stopped. Tell the Owner.',
    SVB_ABOVE_LIMIT: 'This discount is above the limit. The Owner must approve it.',
    BILL_HAS_PAYMENTS: 'Money was taken against this bill. Refund it first or issue a credit note.',
    NOT_SAME_DAY: 'A bill can be cancelled only on the day it was made. Issue a credit note instead.',
    NO_CHARGE_CONFLICT: 'A bill or an advance already exists on this job. Cancel or refund it first.',
    ABOVE_MANAGER_LIMIT: 'This discount is above the limit. The Owner must approve it.'
  };
  for (const [code, text] of Object.entries(want)) assert.equal(e({ code }), text, code);
  assert.equal(e({ code: 'SVB_QTY_INVALID', min: 1, max: 999 }), 'Enter a whole number from 1 to 999.');
  assert.equal(e({ code: 'SVB_OVER_DUE', amountPaise: 153400 }), 'The amount is more than the balance due (Rs 1,534.00).');
  assert.equal(e({ code: 'SOME_OTHER_CODE' }), 'A plain facade message.');
  assert.equal(e({ code: 'NO_SUCH_CODE_X' }), 'Something went wrong. Nothing was changed. Code: NO_SUCH_CODE_X.');
  assert.equal(e(null), 'Something went wrong. Nothing was changed. Code: SVB_INTERNAL.');
  const S1 = stores.internals.ERR;
  for (const k of ['ROLE_DENIED', 'OWNER_ONLY', 'PIN_DENIED', 'ACCESS_CHANGED', 'JOB_UNKNOWN', 'BUSY', 'PRINT_UNAVAILABLE', 'MONEY_INVALID', 'QTY_INVALID', 'FIELD_REQUIRED', 'REASON_SHORT', 'DATE_FUTURE']) {
    assert.equal(I.ERR['SVB_' + k], S1['SVS_' + k], k);
  }
});
