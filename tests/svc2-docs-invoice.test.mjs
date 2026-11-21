// Service wave 2, billing documents: the bill (P3 tests 16 to 35, group C). REAL store, FIFO, masters, Phase 1 docs, calc, money.
// Stock (invented): P1 3 at Rs 100.00 then 3 at Rs 120.00; P2 5 at Rs 20.00. Prices: P1 Rs 118.00 incl 18 %, P2 Rs 50.00 excl, L1 Rs 100.00 excl.
// Every figure below was worked by hand: Rs 118.00 incl 18 % = taxable 100.00 + CGST 9.00 + SGST 9.00.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeAdapter, Bill, Calc, Masters, expectFail, expectOk, unchanged, OWNER, MANAGER, CASHIER, TECH } from './lib/svc2-docs-env.mjs';

const P = (code, qty, discountPaise = 0) => ({ partCode: code, qty, discountPaise });
const LB = (code, qty, discountPaise = 0) => ({ code, qty, discountPaise });
const lineP = (code, qty) => ({ kind: 'PART', code, qty });
const lineL = (code, qty) => ({ kind: 'LABOUR', code, qty });
const bill = (env, input, session = MANAGER, extra = {}) => env.bill.issueInvoice(input, env.ctx(session, extra));
const ownerPin = (env, input, extra = {}) => env.bill.issueInvoice(input, env.ctxPin(OWNER, extra));
// a job with an approved estimate for the given lines and the parts issued to it
function job(env, id, lines, issues = []) {
  env.job(id);
  env.estimateApproved(id, lines);
  for (const [code, qty, extra] of issues) env.issue(id, [{ partCode: code, qty }], extra || {});
  return id;
}
const movementIds = (env, id) => env.stock.jobStock(id).issues.map((i) => i.movementId);

test('16 happy path: number SV/2026-27/0001, part line equals the units issued, the issue ids and the FIFO cost are stored', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 2), lineL('L1', 1)], [['P1', 2]]);
  const mv = movementIds(env, 'J-1');
  const r = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 2)], labour: [LB('L1', 1)], note: 'battery and fitting' }));
  const inv = r.invoice;
  assert.equal(inv.no, 'SV/2026-27/0001');
  assert.equal(inv.state, 'ISSUED');
  assert.equal(inv.docDate, '2026-11-18');
  assert.equal(inv.mode, 'CCPT_BILLED');
  assert.equal(inv.totalPaise, 35400);
  assert.equal(inv.bill.totals.taxablePaise, 30000);
  assert.equal(inv.bill.totals.cgstPaise, 2700);
  assert.equal(inv.bill.totals.sgstPaise, 2700);
  assert.equal(inv.balanceDuePaise, 35400);
  assert.deepEqual(inv.setOff, { advancePaise: 0, receipts: [] });
  // 2 pieces came from the Rs 100.00 layer: cost 200.00
  assert.deepEqual(inv.stock, [{ lineNo: 1, issues: [{ id: mv[0], docNo: 'ISS/26-27/0001', qty: 2 }], costPaise: 20000 }]);
  assert.deepEqual(inv.cost, { partsPaise: 20000, warrantyPaise: 0, estimated: false });
  assert.deepEqual(r.warnings, ['CCPT_NUMBER_PENDING']);
  assert.equal(inv.estimate.totalPaise, 35400);
  assert.equal(inv.estimate.approvedPaise, 35400);
  assert.equal(env.bill.activeInvoiceNo('J-1'), 'SV/2026-27/0001');
  const recs = env.store.read('invoices').records;
  assert.equal(recs[recs.length - 1].k, 'INV_ISSUE');
  assert.equal(recs[recs.length - 1].b.no, 'SV/2026-27/0001');
  assert.equal(env.store.verifyAll().ok, true);
});

test('17 cost over two FIFO layers: issue 4, return 1, bill 3 costs 300.00; a credit of one piece gives back 100.00', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 3)], [['P1', 4]]);
  // issue 4: 3 x 100.00 + 1 x 120.00 = 420.00. Return 1 goes back to the layer used last (120.00). Net 3 pieces cost 300.00.
  const first = env.stock.jobStock('J-1').issues[0].movementId;
  expectOk(env.ret('J-1', first, 1));
  assert.equal(env.stockValue('P1'), 36000);
  const inv = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 3)] })).invoice;
  assert.equal(inv.totalPaise, 35400);
  assert.equal(inv.stock[0].costPaise, 30000);
  assert.equal(inv.cost.partsPaise, 30000);
  assert.deepEqual(expectOk(env.bill.verifyCost(inv.no, env.ctx(MANAGER))), { ok: true, partsPaise: 30000, warrantyPaise: 0 });
  // credit 1 piece by quantity, goods go back: the piece comes from the 100.00 layer now
  const cn = expectOk(env.bill.issueCreditNote({
    invoiceNo: inv.no, mode: 'PARTIAL', reasonClass: 'RETURN', reason: 'customer returned one battery', request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, stock: [{ lineNo: 1, qty: 1 }]
  }, env.ctxPin(OWNER))).creditNote;
  assert.equal(cn.totalPaise, 11800);
  expectOk(env.stock.returnFromJob({ jobId: 'J-1', creditNoteNo: cn.no, lines: [{ issueMovementId: first, qty: 1, returnReason: 'UNUSED' }] }, env.ctx(MANAGER)));
  assert.equal(env.onHand('P1'), 4);
  assert.equal(env.stockValue('P1'), 46000);
  assert.deepEqual(expectOk(env.bill.verifyCost(inv.no, env.ctx(MANAGER))), { ok: true, partsPaise: 30000, warrantyPaise: 0 });
  const cos = expectOk(env.bill.costOfSales({}, env.ctx(MANAGER)));
  assert.deepEqual(cos.invoices, [{ no: inv.no, partsPaise: 30000, creditPaise: 10000, netPaise: 20000 }]);
  assert.equal(cos.totalPaise, 20000);
});

test('18 a part issued and not on the bill is refused with the part named; storage is unchanged', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 2), lineL('L1', 1)], [['P1', 2]]);
  const r = unchanged(env, () => bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] }));
  expectFail(r, 'ISSUED_PART_UNBILLED');
  assert.deepEqual(r.detail, [{ partCode: 'P1', issued: 2, billed: 0 }]);
});

test('19 a part never issued, or more than issued, or fewer than issued', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 2), lineP('P2', 1)], [['P1', 2]]);
  let r = unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 2), P('P2', 1)] }));
  expectFail(r, 'BILLED_PART_NOT_ISSUED');
  assert.deepEqual(r.detail, [{ partCode: 'P2', issued: 0, billed: 1 }]);
  r = unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 3)] }));
  expectFail(r, 'BILLED_PART_NOT_ISSUED');
  assert.deepEqual(r.detail, [{ partCode: 'P1', issued: 2, billed: 3 }]);
  r = unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 1)] }));
  expectFail(r, 'ISSUED_PART_UNBILLED');
  assert.deepEqual(r.detail, [{ partCode: 'P1', issued: 2, billed: 1 }]);
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 1), P('P1', 1)] })), 'DUPLICATE_LINE');
});

test('20 partly returned issue: issue 5, return 2, the bill must list 3; listing 5 is refused', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 3)], [['P1', 5]]);
  expectOk(env.ret('J-1', movementIds(env, 'J-1')[0], 2));
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 5)] })), 'BILLED_PART_NOT_ISSUED');
  const inv = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 3)] })).invoice;
  // 5 pieces cost 3 x 100.00 + 2 x 120.00 = 540.00; the 2 returned go back to the 120.00 layer, so 3 pieces cost 300.00
  assert.equal(inv.stock[0].issues[0].qty, 3);
  assert.equal(inv.stock[0].costPaise, 30000);
});

test('21 warranty issue on a mixed job becomes a warranty line with cost and no price; listing it as a part is refused', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 1)], [['P1', 1], ['P2', 2, { billing: 'WARRANTY' }]]);
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 1), P('P2', 2)] })), 'BILLED_PART_NOT_ISSUED');
  const inv = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 1)] })).invoice;
  assert.equal(inv.totalPaise, 11800);
  assert.equal(inv.bill.lines.length, 1);
  assert.equal(inv.warranty.length, 1);
  assert.equal(inv.warranty[0].code, 'P2');
  assert.equal(inv.warranty[0].qty, 2);
  assert.equal(inv.warranty[0].costPaise, 4000);
  assert.deepEqual(inv.cost, { partsPaise: 10000, warrantyPaise: 4000, estimated: false });
});

test('22 a customer-supplied part is billed as an other line (Store Manager or Owner only) and shows as other', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  const other = { name: 'Fit customer strap', qty: 1, unitPricePaise: 3000, priceBasis: 'EXCL', hsnSac: '9987', rateBp: 1800 };
  expectOk(env.bill.saveEstimate({ jobId: 'J-1', lines: [{ kind: 'OTHER', code: '', qty: 1, ...other }] }, env.ctx(MANAGER)));
  expectOk(env.bill.recordApproval({ jobId: 'J-1', version: 1, method: 'CALL' }, env.ctx(MANAGER)));
  env.setConfig({ billingRoles: ['Cashier'] });
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', other: [other] }, CASHIER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', other: [{ ...other, hsnSac: '' }] })), 'TAX_DETAILS_MISSING');
  const inv = expectOk(bill(env, { jobId: 'J-1', other: [other] })).invoice;
  // Rs 30.00 excluding 18 % = 30.00 + 5.40 = 35.40, rounded to the rupee: 35.00, round-off -0.40
  assert.equal(inv.totalPaise, 3500);
  assert.equal(inv.bill.totals.roundOffPaise, -40);
  assert.equal(inv.bill.lines[0].kind, 'OTHER');
  assert.equal(inv.bill.lines[0].other, true);
  assert.deepEqual(inv.stock, []);
});

test('23 stock moves between the read and the write: the write fails with a revision conflict and nothing is written; a retry bills the new figures', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 1), lineP('P2', 1)], [['P1', 1]]);
  env.hooks.beforeAppend = () => { env.issue('J-1', [{ partCode: 'P2', qty: 1 }]); };
  const before = env.adapter.text();
  const ledgerWrites = env.count();
  const r = bill(env, { jobId: 'J-1', parts: [P('P1', 1)] });
  expectFail(r, 'SVCS_REV_CONFLICT');
  assert.equal(env.store.read('invoices').records.filter((x) => x.k === 'INV_ISSUE').length, 0);
  assert.notEqual(env.adapter.text(), before, 'the competing issue itself was written');
  assert.ok(env.count() > ledgerWrites);
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 1)] })), 'ISSUED_PART_UNBILLED');
  const inv = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 1), P('P2', 1)] })).invoice;
  assert.equal(inv.totalPaise, 11800 + 5900);
});

test('24 price source: the estimate price wins over a later master change; a part not in the estimate uses the master; missing tax refuses; an inactive part can still be billed', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 1)], [['P1', 1], ['P2', 1]]);
  env.editRow('part', 'P1', { sellPricePaise: 15000 });
  env.estimateApproved('J-1', [lineP('P1', 1), lineP('P2', 1)], { reason: 'add the strap to the quote' });
  env.editRow('part', 'P1', { sellPricePaise: 17700 });
  const pv = expectOk(env.bill.previewInvoice({ jobId: 'J-1', parts: [P('P1', 1), P('P2', 1)] }, env.ctx(MANAGER)));
  // P1 from the estimate (master was 150.00 then): 150.00 incl; P2 from the estimate: 50.00 excl + 9.00
  assert.equal(pv.lines[0].unitPricePaise, 15000);
  assert.equal(pv.lines[1].unitPricePaise, 5000);
  const env2 = makeEnv().seed();
  env2.addPart('PM', { hsn: '', gstRateBp: null });
  env2.grn([{ partCode: 'PM', qtyReceived: 2, unitCostPaise: 500 }]);
  env2.job('J-9');
  env2.issue('J-9', [{ partCode: 'PM', qty: 1 }]);
  env2.estimateApproved('J-9', [lineL('L1', 1)]);
  const r = unchanged(env2, () => bill(env2, { jobId: 'J-9', parts: [P('PM', 1)], labour: [LB('L1', 1)] }));
  expectFail(r, 'TAX_DETAILS_MISSING');
  assert.equal(r.detail.code, 'PM');
  env2.editRow('part', 'PM', { hsn: '9114', gstRateBp: 1800, priceIncludesTax: true, sellPricePaise: 1000 });
  env2.estimateApproved('J-9', [{ kind: 'PART', code: 'PM', qty: 1 }, lineL('L1', 1)], { reason: 'add the part to the quote' });
  env2.setActive('part', 'PM', false);
  const inv = expectOk(bill(env2, { jobId: 'J-9', parts: [P('PM', 1)], labour: [LB('L1', 1)] }, OWNER, { stepUp: env2.pin() })).invoice;
  assert.equal(inv.bill.lines[0].code, 'PM');
});

test('25 approval cap: no estimate or not approved, above the approved amount, and the Owner override with PIN and reason', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] })), 'NO_APPROVAL');
  expectOk(env.bill.saveEstimate({ jobId: 'J-1', lines: [lineP('P1', 1)] }, env.ctx(MANAGER)));
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] })), 'NO_APPROVAL');
  expectOk(env.bill.recordApproval({ jobId: 'J-1', version: 1, method: 'CALL' }, env.ctx(MANAGER)));
  env.issue('J-1', [{ partCode: 'P1', qty: 1 }]);
  // approved Rs 118.00; the bill with a labour line is Rs 236.00
  const input = { jobId: 'J-1', parts: [P('P1', 1)], labour: [LB('L1', 1)] };
  const r = unchanged(env, () => bill(env, input));
  expectFail(r, 'REAPPROVAL_REQUIRED');
  assert.deepEqual(r.detail, { approvedPaise: 11800, billPaise: 23600 });
  expectFail(unchanged(env, () => bill(env, { ...input, approvalOverrideReason: 'customer agreed on the phone' }, MANAGER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => bill(env, { ...input, approvalOverrideReason: 'customer agreed on the phone' }, OWNER)), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => ownerPin(env, { ...input, approvalOverrideReason: 'ok' })), 'REASON_REQUIRED');
  const inv = expectOk(ownerPin(env, { ...input, approvalOverrideReason: 'customer agreed on the phone' })).invoice;
  assert.equal(inv.approvalOverride.reason, 'customer agreed on the phone');
  assert.equal(inv.approvalOverride.pinAt, env.clock.ms());
  assert.equal(inv.totalPaise, 23600);
  assert.equal(inv.estimate.approvedPaise, 11800);
});

test('26 CCPT: default mode with an empty number is allowed and listed as pending; a duplicate number is refused; not-billed-in-CCPT is Owner with PIN and reason', () => {
  const env = makeEnv().seed();
  for (const id of ['J-1', 'J-2', 'J-3']) job(env, id, [lineL('L1', 1)]);
  const r1 = expectOk(bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] }));
  assert.ok(r1.warnings.includes('CCPT_NUMBER_PENDING'));
  assert.deepEqual(env.bill.pendingCcpt(env.ctx(MANAGER)).rows.map((x) => x.no), ['SV/2026-27/0001']);
  const r2 = expectOk(bill(env, { jobId: 'J-2', labour: [LB('L1', 1)], ccptInvoiceNo: 'INV-0042' }));
  assert.equal(r2.invoice.ccptInvoiceNo, 'INV-0042');
  assert.equal(r2.warnings.includes('CCPT_NUMBER_PENDING'), false);
  for (const dup of ['inv-0042', ' inv 0042 ', 'INV0042', 'Inv/0042']) {
    expectFail(unchanged(env, () => bill(env, { jobId: 'J-3', labour: [LB('L1', 1)], ccptInvoiceNo: dup })), 'DUPLICATE_CCPT_INVOICE');
  }
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-3', labour: [LB('L1', 1)], mode: 'NOT_IN_CCPT', notInCcptReason: 'CCPT cannot bill this' }, MANAGER)), 'NOT_IN_CCPT_OWNER_ONLY');
  const own = { jobId: 'J-3', labour: [LB('L1', 1)], mode: 'NOT_IN_CCPT', notInCcptReason: 'CCPT cannot bill this' };
  expectFail(unchanged(env, () => bill(env, own, OWNER)), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => ownerPin(env, { ...own, notInCcptReason: 'no' })), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => ownerPin(env, { ...own, ccptInvoiceNo: 'X1' })), 'INPUT_INVALID');
  const r3 = expectOk(ownerPin(env, own));
  assert.equal(r3.invoice.mode, 'NOT_IN_CCPT');
  assert.deepEqual(r3.invoice.notInCcpt, { reason: 'CCPT cannot bill this', pinAt: env.clock.ms() });
  assert.equal(r3.warnings.includes('CCPT_NUMBER_PENDING'), false);
  assert.deepEqual(env.bill.pendingCcpt(env.ctx(MANAGER)).rows.map((x) => x.no), ['SV/2026-27/0001']);
});

test('27 link a CCPT number later: staff may fill an empty one, only the Owner with PIN changes or clears it; the issue record is never edited', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineL('L1', 1)]);
  env.setConfig({ billingRoles: ['Cashier'] });
  const inv = expectOk(bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] })).invoice;
  const issueText = JSON.stringify(env.store.read('invoices').records.filter((x) => x.k === 'INV_ISSUE'));
  const link = (ccpt, session, pin, extra = {}) => env.bill.linkCcptInvoice({ invoiceNo: inv.no, ccptInvoiceNo: ccpt, ...extra }, pin ? env.ctxPin(session) : env.ctx(session));
  expectFail(unchanged(env, () => link('', CASHIER)), 'NO_CHANGE');
  expectOk(link('C-100', CASHIER));
  assert.equal(env.bill.getInvoice(inv.no, env.ctx(MANAGER)).invoice.ccptInvoiceNo, 'C-100');
  expectFail(unchanged(env, () => link('C-200', CASHIER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => link('C-200', MANAGER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => link('C-200', OWNER, false, { reason: 'typed wrong earlier' })), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => link('C-200', OWNER, true)), 'REASON_REQUIRED');
  const changed = expectOk(link('C-200', OWNER, true, { reason: 'typed wrong earlier' })).invoice;
  assert.equal(changed.ccptInvoiceNo, 'C-200');
  expectOk(link('', OWNER, true, { reason: 'number was for another job' }));
  assert.equal(env.bill.getInvoice(inv.no, env.ctx(MANAGER)).invoice.ccptInvoiceNo, '');
  const hist = env.store.read('invoices').records.filter((x) => x.k === 'INV_CCPT');
  assert.deepEqual(hist.map((x) => [x.b.prev, x.b.ccptInvoiceNo]), [['', 'C-100'], ['C-100', 'C-200'], ['C-200', '']]);
  assert.equal(JSON.stringify(env.store.read('invoices').records.filter((x) => x.k === 'INV_ISSUE')), issueText);
});

test('28 discount rules: staff none, Manager within the limit, Owner PIN above the limit, reason required, round-off is not a discount', () => {
  const env = makeEnv().seed();
  for (const id of ['J-1', 'J-2', 'J-3', 'J-4', 'J-5', 'J-6']) job(env, id, [lineL('L1', 1)]);
  const input = (id, d, extra = {}) => ({ jobId: id, labour: [LB('L1', 1)], billDiscountPaise: d, discountReason: 'regular customer', ...extra });
  env.setConfig({ billingRoles: ['Cashier'] });
  expectFail(unchanged(env, () => bill(env, input('J-1', 100), CASHIER)), 'DISCOUNT_NOT_ALLOWED');
  const lim0 = unchanged(env, () => bill(env, input('J-1', 100)));
  expectFail(lim0, 'ABOVE_MANAGER_LIMIT');
  assert.deepEqual(lim0.detail, { limitPaise: 0, totalPaise: 100 });
  expectFail(unchanged(env, () => bill(env, input('J-1', 100), OWNER)), 'PIN_REQUIRED');
  env.setConfig({ discountLimitPaise: 500 });
  expectFail(unchanged(env, () => bill(env, input('J-1', 500, { discountReason: '' }))), 'DISCOUNT_REASON_REQUIRED');
  expectFail(unchanged(env, () => bill(env, input('J-1', 501))), 'ABOVE_MANAGER_LIMIT');
  const m = expectOk(bill(env, input('J-1', 500))).invoice;
  assert.equal(m.totalPaise, 11300);
  assert.deepEqual(m.discount, { totalPaise: 500, reason: 'regular customer', limitPaise: 500, approvedBy: { name: 'Test Manager', role: 'Store Manager' }, pinAt: null });
  const o1 = expectOk(bill(env, input('J-2', 500), OWNER)).invoice;
  assert.equal(o1.discount.pinAt, null);
  // Stage E (D-flows-4): in Owner mode the device role selector still says Store Manager; the approver's role is Owner
  const ownerOnShopDevice = Object.freeze({ ok: true, tier: 'owner', role: 'Store Manager', actorName: 'Test Owner', isOwner: true, isManager: false });
  const o3 = expectOk(bill(env, input('J-5', 500), ownerOnShopDevice)).invoice;
  assert.deepEqual(o3.discount.approvedBy, { name: 'Test Owner', role: 'Owner' });
  expectFail(unchanged(env, () => bill(env, input('J-3', 501), OWNER)), 'PIN_REQUIRED');
  const o2 = expectOk(ownerPin(env, input('J-3', 501))).invoice;
  assert.equal(o2.discount.pinAt, env.clock.ms());
  assert.equal(o2.discount.totalPaise, 501);
  // a line discount larger than the line gross comes back from the calc layer
  expectFail(unchanged(env, () => ownerPin(env, { jobId: 'J-4', labour: [LB('L1', 1, 10001)], discountReason: 'too much' })), 'DISCOUNT_EXCEEDS_LINE');
  // line discount and bill discount add up to the total checked against the limit: 300 + 201 is above 500
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-4', labour: [LB('L1', 1, 300)], billDiscountPaise: 201, discountReason: 'both kinds' })), 'ABOVE_MANAGER_LIMIT');
  // Rs 1.00 excluding 18 % is 1.18, rounded to 1.00: the round-off of 18 paise is not a discount
  env.job('J-7');
  const oth = { name: 'Small item', qty: 1, unitPricePaise: 100, priceBasis: 'EXCL', hsnSac: '9987', rateBp: 1800 };
  expectOk(env.bill.saveEstimate({ jobId: 'J-7', lines: [{ kind: 'OTHER', code: '', ...oth }] }, env.ctx(MANAGER)));
  expectOk(env.bill.recordApproval({ jobId: 'J-7', version: 1, method: 'CALL' }, env.ctx(MANAGER)));
  const ro = expectOk(bill(env, { jobId: 'J-7', other: [oth] })).invoice;
  assert.equal(ro.bill.totals.totalPaise, 100);
  assert.equal(ro.bill.totals.roundOffPaise, -18);
  assert.equal(ro.discount, null);
  assert.equal(ro.bill.lines[0].lineDiscountPaise, 0);
});

test('29 advance set-off: two advances are set off in order, capped at the bill; a competing advance fails the write', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineL('L1', 1)]);
  env.advance('J-1', 10000);
  env.advance('J-1', 500);
  const inv = expectOk(bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] })).invoice;
  assert.deepEqual(inv.setOff, { advancePaise: 10500, receipts: [{ no: 'SAR/26-27/0001', amountPaise: 10000 }, { no: 'SAR/26-27/0002', amountPaise: 500 }] });
  assert.equal(inv.totalPaise, 11800);
  assert.equal(inv.balanceDuePaise, 1300);
  const mj = env.money.jobMoney('J-1');
  assert.equal(mj.outstandingPaise, 1300);
  // an advance of exactly the bill leaves nothing to pay
  job(env, 'J-2', [lineL('L1', 1)]);
  env.advance('J-2', 11800);
  const full = expectOk(bill(env, { jobId: 'J-2', labour: [LB('L1', 1)] })).invoice;
  assert.equal(full.balanceDuePaise, 0);
  assert.equal(env.money.jobMoney('J-2').outstandingPaise, 0);
  // a competing advance arrives between the read and the write
  job(env, 'J-3', [lineL('L1', 1)]);
  env.advance('J-3', 2000);
  env.hooks.beforeAppend = () => { env.advance('J-3', 300); };
  expectFail(bill(env, { jobId: 'J-3', labour: [LB('L1', 1)] }), 'SVCS_REV_CONFLICT');
  assert.equal(env.bill.activeInvoiceNo('J-3'), '');
  const again = expectOk(bill(env, { jobId: 'J-3', labour: [LB('L1', 1)] })).invoice;
  assert.equal(again.setOff.advancePaise, 2300);
  assert.equal(again.balanceDuePaise, 9500);
});

test('30 frozen copy: master price, name and tax changes after issue do not change the stored bill, also after a reopen', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 1), lineL('L1', 1)], [['P1', 1]]);
  const inv = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 1)], labour: [LB('L1', 1)] })).invoice;
  const text = JSON.stringify(env.bill.getInvoice(inv.no, env.ctx(MANAGER)));
  env.editRow('part', 'P1', { sellPricePaise: 99900, name: 'Renamed battery' });
  env.editRow('labour', 'L1', { ratePaise: 77700 });
  assert.equal(JSON.stringify(env.bill.getInvoice(inv.no, env.ctx(MANAGER))), text);
  const second = env.reopen();
  assert.equal(second.bill.open().ok, true);
  assert.equal(JSON.stringify(second.bill.getInvoice(inv.no, { session: MANAGER })), text);
});

test('31 lock after issue: estimate, approval and a second bill are refused; Phase 1 issue is refused through the job lookup', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineP('P1', 1)], [['P1', 1]]);
  const inv = expectOk(bill(env, { jobId: 'J-1', parts: [P('P1', 1)] })).invoice;
  expectFail(unchanged(env, () => env.bill.saveEstimate({ jobId: 'J-1', lines: [lineP('P1', 2)] }, env.ctx(MANAGER))), 'JOB_LOCKED');
  expectFail(unchanged(env, () => env.bill.recordApproval({ jobId: 'J-1', version: 1, method: 'CALL' }, env.ctx(MANAGER))), 'JOB_LOCKED');
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', parts: [P('P1', 1)] })), 'INVOICE_ALREADY_ISSUED');
  assert.equal(env.bill.activeInvoiceNo('J-1'), inv.no);
  assert.equal(env.bill.isLocked('J-1'), true);
  const iss = env.stock.issueToJob({ jobId: 'J-1', lines: [{ partCode: 'P1', qty: 1 }] }, env.ctx(MANAGER));
  expectFail(iss, 'JOB_CLOSED');
  expectFail(env.stock.returnFromJob({ jobId: 'J-1', lines: [{ issueMovementId: movementIds(env, 'J-1')[0], qty: 1, returnReason: 'UNUSED' }] }, env.ctx(MANAGER)), 'JOB_CLOSED');
});

test('32 a no-charge warranty job cannot take a bill', () => {
  const env = makeEnv().seed();
  env.job('J-1', { paymentStatus: 'no_charge_warranty' });
  env.estimateApproved('J-1', [lineL('L1', 1)]);
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-1', labour: [LB('L1', 1)] })), 'NO_CHARGE_JOB');
});

test('33 figures that do not add up are never stored (a calc layer with a wrong line total)', () => {
  const env = makeEnv().seed();
  job(env, 'J-1', [lineL('L1', 1)]);
  const bad = { ...Calc, computeBill: (i) => { const b = Calc.computeBill(i); if (b.ok) b.lines[0].totalPaise += 1; return b; } };
  const faulty = Bill.create({ store: env.store, calc: bad, masters: Masters, stock: env.stock, money: env.money, cases: env.raw, now: env.clock.now });
  const before = env.text();
  const r = faulty.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER));
  expectFail(r, 'CALC_INCONSISTENT');
  assert.equal(env.text(), before);
  // a bill whose stored copy fails the calc layer's own re-check is refused as well
  const off = { ...Calc, verifyBill: () => ({ ok: false, code: 'BILL_MISMATCH' }) };
  const other = Bill.create({ store: env.store, calc: off, masters: Masters, stock: env.stock, money: env.money, cases: env.raw, now: env.clock.now });
  expectFail(other.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)), 'CALC_INCONSISTENT');
  assert.equal(env.text(), before);
});

test('34 numbers: ten bills are 0001 to 0010 with no gap, a cancelled bill keeps its number, a new financial year restarts at 0001', () => {
  const env = makeEnv().seed();
  const nos = [];
  for (let i = 1; i <= 10; i += 1) {
    const id = 'J-' + i;
    job(env, id, [lineL('L1', 1)]);
    nos.push(expectOk(bill(env, { jobId: id, labour: [LB('L1', 1)] })).invoice.no);
  }
  assert.deepEqual(nos, Array.from({ length: 10 }, (_, k) => 'SV/2026-27/' + String(k + 1).padStart(4, '0')));
  expectOk(env.bill.cancelInvoice('SV/2026-27/0003', 'wrong job billed', env.ctxPin(OWNER)));
  assert.equal(env.bill.activeInvoiceNo('J-3'), '');
  const again = expectOk(bill(env, { jobId: 'J-3', labour: [LB('L1', 1)] })).invoice;
  assert.equal(again.no, 'SV/2026-27/0011');
  assert.equal(env.store.nextNumber('SV', env.clock.iso()).no, 'SV/2026-27/0012');
  // 23:59:59 IST on 31 March is still 2026-27; one second later it is 2027-28
  env.clock.set('2027-03-31T18:29:59.000Z');
  job(env, 'J-20', [lineL('L1', 1)]);
  assert.equal(expectOk(bill(env, { jobId: 'J-20', labour: [LB('L1', 1)] })).invoice.no, 'SV/2026-27/0012');
  env.clock.set('2027-03-31T18:30:00.000Z');
  job(env, 'J-21', [lineL('L1', 1)]);
  job(env, 'J-22', [lineL('L1', 1)]);
  const a = expectOk(bill(env, { jobId: 'J-21', labour: [LB('L1', 1)] })).invoice;
  const b = expectOk(bill(env, { jobId: 'J-22', labour: [LB('L1', 1)] })).invoice;
  assert.equal(a.no, 'SV/2027-28/0001');
  assert.equal(b.no, 'SV/2027-28/0002');
  assert.equal(a.docDate, '2027-04-01');
});

test('35 safety: unknown job, closed old-way job, stub job warning, closed job that already has billing records', () => {
  const env = makeEnv().seed();
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-404', labour: [LB('L1', 1)] })), 'JOB_NOT_FOUND');
  expectFail(unchanged(env, () => bill(env, { jobId: '', labour: [LB('L1', 1)] })), 'INPUT_INVALID');
  env.job('J-2', { status: 'closed' });
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-2', labour: [LB('L1', 1)] })), 'JOB_CLOSED_OLD_WAY');
  env.job('J-3', { stub: true });
  env.estimateApproved('J-3', [lineL('L1', 1)]);
  assert.ok(expectOk(bill(env, { jobId: 'J-3', labour: [LB('L1', 1)] })).warnings.includes('JOB_IS_STUB'));
  env.job('J-4');
  env.estimateApproved('J-4', [lineL('L1', 1)]);
  env.jobs.get('J-4').status = 'closed';
  const inv = expectOk(bill(env, { jobId: 'J-4', labour: [LB('L1', 1)] })).invoice;
  assert.equal(inv.jobId, 'J-4');
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-4', labour: [LB('L1', 1)], docDate: '2026-11-01' })), 'BACKDATE_NOT_ALLOWED');
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-4', labour: [LB('L1', 1)] })), 'INVOICE_ALREADY_ISSUED');
  env.job('J-5');
  env.estimateApproved('J-5', [lineL('L1', 1)]);
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-5', labour: [LB('L1', 1)], docDate: '2026-11-01' })), 'BACKDATE_NOT_ALLOWED');
  expectFail(unchanged(env, () => bill(env, { jobId: 'J-5', labour: [LB('L1', 1)] }, TECH)), 'NOT_ALLOWED');
  void makeAdapter;
});
