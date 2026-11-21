// Service wave 2, billing documents: six more money-and-stock scenarios worked by hand (the first, the long one, is the first test of
// svc2-docs-money). Every expected figure below was worked out on paper from the plan rules, then asserted. REAL store, FIFO, masters,
// Phase 1 docs (edited), calc and money. Invented data only.
// Stock: P1 3 pieces at Rs 100.00 then 3 at Rs 120.00 (sells Rs 118.00 incl 18 %); P2 5 at Rs 20.00 (sells Rs 50.00 excl 18 %); L1 labour Rs 100.00 excl 18 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, expectFail, expectOk, unchanged, gstinOf, OWNER, MANAGER } from './lib/svc2-docs-env.mjs';

const mgr = (env) => env.ctx(MANAGER);
const LB = (code, qty) => ({ code, qty, discountPaise: 0 });

test('hand 2 inter-state bill: 3 straps at Rs 50.00 plus 18 % IGST = 150.00 + 27.00 = Rs 177.00; cost 3 x Rs 20.00', () => {
  const env = makeEnv().seed();
  env.job('J-2');
  env.estimateApproved('J-2', [{ kind: 'PART', code: 'P2', qty: 3 }], { recipientGstin: gstinOf('29') });
  env.issue('J-2', [{ partCode: 'P2', qty: 3 }]);
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-2', parts: [{ partCode: 'P2', qty: 3, discountPaise: 0 }] }, mgr(env))).invoice;
  assert.equal(inv.bill.supply.type, 'INTER');
  assert.equal(inv.bill.totals.taxablePaise, 15000);
  assert.equal(inv.bill.totals.igstPaise, 2700);
  assert.equal(inv.bill.totals.cgstPaise, 0);
  assert.equal(inv.bill.totals.sgstPaise, 0);
  assert.equal(inv.bill.totals.roundOffPaise, 0);
  assert.equal(inv.totalPaise, 17700);
  assert.equal(inv.stock[0].costPaise, 6000);
  assert.equal(inv.balanceDuePaise, 17700);
  assert.equal(env.onHand('P2'), 2);
});

test('hand 3 round-off: an "other" line Rs 10.01 excl 18 %: tax 1.80, lines 11.81, rounded to Rs 12.00 (+0.19)', () => {
  const env = makeEnv().seed();
  env.job('J-3');
  const other = { name: 'Cable', qty: 1, unitPricePaise: 1001, priceBasis: 'EXCL', hsnSac: '8544', rateBp: 1800 };
  expectOk(env.bill.saveEstimate({ jobId: 'J-3', lines: [{ kind: 'OTHER', ...other }] }, mgr(env)));
  expectOk(env.bill.recordApproval({ jobId: 'J-3', version: 1, method: 'CALL', takenByName: 'Test Taker' }, mgr(env)));
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-3', other: [{ ...other, discountPaise: 0 }] }, mgr(env))).invoice;
  const t = inv.bill.totals;
  assert.deepEqual([t.taxablePaise, t.cgstPaise, t.sgstPaise, t.roundOffPaise, t.totalPaise], [1001, 90, 90, 19, 1200]);
  assert.equal(inv.balanceDuePaise, 1200);
});

test('hand 4 discount: labour Rs 118.00 less Rs 18.00 by the Owner (limit 0, PIN): payable 100.00 = taxable 84.75 + CGST 7.63 + SGST 7.63, round-off -0.01', () => {
  const env = makeEnv().seed();
  env.job('J-4');
  env.estimateApproved('J-4', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const input = { jobId: 'J-4', labour: [LB('L1', 1)], billDiscountPaise: 1800, discountReason: 'goodwill discount' };
  expectFail(unchanged(env, () => env.bill.issueInvoice(input, mgr(env))), 'ABOVE_MANAGER_LIMIT');
  expectFail(unchanged(env, () => env.bill.issueInvoice(input, env.ctx(OWNER))), 'PIN_REQUIRED');
  const inv = expectOk(env.bill.issueInvoice(input, env.ctxPin(OWNER))).invoice;
  const t = inv.bill.totals;
  assert.deepEqual([t.taxablePaise, t.cgstPaise, t.sgstPaise, t.roundOffPaise, t.totalPaise], [8475, 763, 763, -1, 10000]);
  assert.equal(inv.discount.totalPaise, 1800);
  assert.equal(inv.discount.limitPaise, 0);
  assert.equal(typeof inv.discount.pinAt, 'number');
});

test('hand 5 full credit note then refund: paid 118.00, whole bill credited, the 118.00 goes back, nothing is held', () => {
  const env = makeEnv().seed();
  env.job('J-5');
  env.estimateApproved('J-5', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-5', labour: [LB('L1', 1)] }, mgr(env))).invoice;
  assert.equal(inv.totalPaise, 11800);
  expectOk(env.money.takeBalance({ jobId: 'J-5', invoiceNo: inv.no, amountPaise: 11800, payMode: 'Cash' }, env.ctx(OWNER)));
  const cn = expectOk(env.bill.issueCreditNote({ invoiceNo: inv.no, mode: 'FULL', reasonClass: 'SERVICE', reason: 'work not done' }, env.ctxPin(OWNER)));
  assert.equal(cn.creditNote.no, 'SCN/26-27/0001');
  assert.equal(cn.creditNote.totalPaise, 11800);
  assert.equal(cn.invoice.state, 'CREDITED_FULLY');
  assert.equal(cn.invoice.payablePaise, 0);
  assert.equal(env.money.jobMoney('J-5').refundablePaise, 11800);
  expectOk(env.money.refund({ jobId: 'J-5', amountPaise: 11800, payMode: 'Cash', reason: 'credit note refund', cnNo: cn.creditNote.no }, env.ctxPin(OWNER)));
  const jm = env.money.jobMoney('J-5');
  assert.deepEqual([jm.netPaise, jm.outstandingPaise, jm.refundablePaise], [0, 0, 0]);
});

test('hand 6 cancel with money taken: advance 50.00 + balance 68.00 held; the bill is cancelled the same day; the 118.00 is refunded; the number stays used', () => {
  const env = makeEnv().seed();
  env.job('J-6');
  env.estimateApproved('J-6', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  env.advance('J-6', 5000);
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-6', labour: [LB('L1', 1)] }, mgr(env))).invoice;
  assert.equal(inv.setOff.advancePaise, 5000);
  assert.equal(inv.balanceDuePaise, 6800);
  expectOk(env.money.takeBalance({ jobId: 'J-6', invoiceNo: inv.no, amountPaise: 6800, payMode: 'UPI' }, env.ctx(OWNER)));
  expectOk(env.bill.cancelInvoice(inv.no, 'billed to the wrong job', env.ctxPin(OWNER)));
  assert.equal(env.money.jobMoney('J-6').netPaise, 11800);
  expectOk(env.money.refund({ jobId: 'J-6', amountPaise: 11800, payMode: 'Cash', reason: 'bill cancelled, money back' }, env.ctxPin(OWNER)));
  assert.equal(env.money.jobMoney('J-6').netPaise, 0);
  env.estimateApproved('J-6', [{ kind: 'LABOUR', code: 'L1', qty: 2 }], { reason: 'new quote after cancel' });
  assert.equal(expectOk(env.bill.issueInvoice({ jobId: 'J-6', labour: [LB('L1', 2)] }, mgr(env))).invoice.no, 'SV/2026-27/0002');
});

test('hand 7 two credit notes, each with parts back: 4 pieces (3 at 100.00, 1 at 120.00); notes 118.00 and 236.00; shelf and cost come out exact; returns cannot pass the notes', () => {
  const env = makeEnv().seed();
  env.job('J-7');
  env.estimateApproved('J-7', [{ kind: 'PART', code: 'P1', qty: 4 }]);
  env.issue('J-7', [{ partCode: 'P1', qty: 4 }]);
  const mv = env.stock.movements().filter((m) => m.type === 'issue_job')[0].id;
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-7', parts: [{ partCode: 'P1', qty: 4, discountPaise: 0 }] }, mgr(env))).invoice;
  assert.equal(inv.totalPaise, 47200);
  assert.equal(inv.stock[0].costPaise, 42000);
  const note = (qty) => expectOk(env.bill.issueCreditNote({
    invoiceNo: inv.no, mode: 'PARTIAL', reasonClass: 'RETURN', reason: 'customer returned parts', request: { kind: 'LINES', lines: [{ lineNo: 1, qty }] }, stock: [{ lineNo: 1, qty }]
  }, env.ctxPin(OWNER))).creditNote;
  const back = (cn, qty) => env.stock.returnFromJob({ jobId: 'J-7', creditNoteNo: cn, lines: [{ issueMovementId: mv, qty, returnReason: 'UNUSED' }] }, mgr(env));
  const n1 = note(1);
  const n2 = note(2);
  assert.deepEqual([n1.no, n1.totalPaise, n2.no, n2.totalPaise], ['SCN/26-27/0001', 11800, 'SCN/26-27/0002', 23600]);
  assert.equal(env.bill.getInvoice(inv.no, mgr(env)).invoice.state, 'CREDITED_PARTLY');
  assert.equal(env.bill.getInvoice(inv.no, mgr(env)).invoice.payablePaise, 11800);
  expectFail(back(n1.no, 2), 'JOB_CLOSED');
  expectOk(back(n1.no, 1));
  expectFail(back(n1.no, 1), 'JOB_CLOSED');
  expectFail(back(n2.no, 3), 'JOB_CLOSED');
  expectOk(back(n2.no, 2));
  expectFail(back(n2.no, 1), 'JOB_CLOSED');
  // pieces went back to the layers they left last: 1 to the 120.00 layer, 2 to the 100.00 layer; shelf 3 x 120.00 + 2 x 100.00
  assert.equal(env.onHand('P1'), 5);
  assert.equal(env.stockValue('P1'), 56000);
  const cos = expectOk(env.bill.costOfSales({}, mgr(env)));
  assert.deepEqual(cos.invoices, [{ no: inv.no, partsPaise: 42000, creditPaise: 32000, netPaise: 10000 }]);
  assert.equal(env.bill.pendingCreditReturns(mgr(env)).rows.length, 0);
});

test('hand 8 unbilled list: 2 pieces issued from the 100.00 layer and never billed are one row worth Rs 200.00 at cost; Manager sees it, a plain staff session does not', () => {
  const env = makeEnv().seed();
  env.job('J-8');
  env.estimateApproved('J-8', [{ kind: 'PART', code: 'P1', qty: 2 }]);
  env.issue('J-8', [{ partCode: 'P1', qty: 2 }]);
  const rows = expectOk(env.bill.unbilledIssues(mgr(env))).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].jobId, rows[0].partCode, rows[0].qty, rows[0].costPaise], ['J-8', 'P1', 2, 20000]);
  expectFail(env.bill.unbilledIssues(env.ctx({ ok: true, tier: 'staff', role: 'Greeter', actorName: 'Test Greeter', isOwner: false, isManager: false })), 'NOT_ALLOWED');
});

test('hand 9 old-bill reference: a job id that does not fit the reference pattern takes the hashed form LEGACY:h + 20 hex; a wrong reference for a plain id is refused', () => {
  const env = makeEnv().seed();
  const body = (jobId, no) => ({
    legacyNo: no, jobId, basis: 'LIVE_CASE', invoiceDate: '2026-10-05', gstBp: 1800, listedPaise: 100000, adjustmentPaise: 0, taxablePaise: 84746, cgstPaise: 7627, sgstPaise: 7627,
    igstPaise: 0, gstPaise: 15254, roundOffPaise: 0, totalPaise: 100000, finalPaise: 100000, payMode: 'Cash', lineCount: 2, correctionCount: 0, snapshotSha: null, warn: ['SNAPSHOT_MISSING']
  });
  env.job('job with spaces', { status: 'closed', invoiceNo: 'x' });
  env.job('O-1', { status: 'closed', invoiceNo: 'x' });
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:job with spaces', body: body('job with spaces', 'OLD-1') }], env.ctxPin(OWNER))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.bill.importLegacy([{ ref: 'LEGACY:h0123456789abcdef0123', body: body('O-1', 'OLD-2') }], env.ctxPin(OWNER))), 'INPUT_INVALID');
  const r = expectOk(env.bill.importLegacy([{ ref: 'LEGACY:h0123456789abcdef0123', body: body('job with spaces', 'OLD-1') }], env.ctxPin(OWNER)));
  assert.equal(r.written, 1);
  assert.equal(env.store.findRef('invoices', 'LEGACY:h0123456789abcdef0123').b.jobId, 'job with spaces');
  assert.equal(expectOk(env.bill.importLegacy([{ ref: 'LEGACY:h0123456789abcdef0123', body: body('job with spaces', 'OLD-1') }], env.ctxPin(OWNER))).written, 0);
});

test('hand 10 (A-DOCS) an old-bill reference that already belongs to another job is a conflict, never a silent skip', () => {
  const env = makeEnv().seed();
  const long = 'J-' + 'x'.repeat(56);                 // 58 characters: LEGACY:<jobId> would be 65, over the 64 of the reference rule
  env.job(long); env.job(long + 'y');
  const body = (jobId, legacyNo) => ({ legacyNo, jobId, basis: 'SNAPSHOT_V1', invoiceDate: '2026-10-05', gstBp: 1800, listedPaise: 30000, adjustmentPaise: 0, taxablePaise: 25424,
    cgstPaise: 2288, sgstPaise: 2288, igstPaise: 0, gstPaise: 4576, roundOffPaise: 0, totalPaise: 30000, finalPaise: 30000, payMode: 'UPI', lineCount: 1, correctionCount: 0, snapshotSha: null, warn: [] });
  const ref = 'LEGACY:h0123456789abcdef0123';
  assert.equal(expectOk(env.bill.importLegacy([{ ref, body: body(long, 'WS-2026-100') }], env.ctxPin(OWNER))).written, 1);
  unchanged(env, () => expectFail(env.bill.importLegacy([{ ref, body: body(long + 'y', 'WS-2026-101') }], env.ctxPin(OWNER)), 'LEGACY_CONFLICT'));
  const again = expectOk(env.bill.importLegacy([{ ref, body: body(long, 'WS-2026-100') }], env.ctxPin(OWNER)));
  assert.deepEqual([again.written, again.skipped.length], [0, 1], 'the same job under the same reference is still skipped');
});

test('hand 11 (A-DOCS) old counter exactly one ahead of the store: the seed still goes in, the first new bill is SV/2026-27/0002, never a reused 0001', () => {
  const env = makeEnv().seed();
  env.legacy.floor['2026-27'] = 1;               // the old counter issued SV/2026-27/0001; the store has issued nothing
  env.job('J-11'); env.estimateApproved('J-11', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const r = expectOk(env.bill.issueInvoice({ jobId: 'J-11', labour: [LB('L1', 1)] }, mgr(env)));
  assert.equal(r.invoice.no, 'SV/2026-27/0002');
  assert.equal(r.seeded, true);
  const recs = env.store.read('invoices').records.slice(-2);
  assert.deepEqual(recs.map((x) => x.k), ['SERIES_SEED', 'INV_ISSUE']);
  assert.deepEqual(recs[0].b, { seriesSeed: { series: 'SV', fy: '2026-27', last: 1 } });
});

test('hand 12 (A-DOCS) a reversed advance is never set off: advance 50.00 reversed, advance 30.00 live; bill 118.00 sets off 30.00 from SAR 0002 only, balance 88.00', () => {
  const env = makeEnv().seed();
  env.job('J-12'); env.estimateApproved('J-12', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  env.advance('J-12', 5000); env.advance('J-12', 3000);
  expectOk(env.money.reverse({ no: 'SAR/26-27/0001', reason: 'wrong amount typed' }, env.ctx(MANAGER)));
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-12', labour: [LB('L1', 1)] }, mgr(env))).invoice;
  assert.deepEqual(inv.setOff, { advancePaise: 3000, receipts: [{ no: 'SAR/26-27/0002', amountPaise: 3000 }] });
  assert.equal(inv.balanceDuePaise, 8800);
  assert.deepEqual(env.bill.receiptSetOff('SAR/26-27/0001'), { ok: true, setOff: false, invoiceNo: '' });
});

test('hand 13 (A-DOCS) a CCPT invoice number already on a live bill is refused at preview and at issue, whatever its spacing or case', () => {
  const env = makeEnv().seed();
  env.job('J-13'); env.job('J-14');
  env.estimateApproved('J-13', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]); env.estimateApproved('J-14', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  expectOk(env.bill.issueInvoice({ jobId: 'J-13', labour: [LB('L1', 1)], ccptInvoiceNo: 'CC-7001' }, mgr(env)));
  expectFail(env.bill.previewInvoice({ jobId: 'J-14', labour: [LB('L1', 1)], ccptInvoiceNo: 'cc 7001' }, mgr(env)), 'DUPLICATE_CCPT_INVOICE');
  unchanged(env, () => expectFail(env.bill.issueInvoice({ jobId: 'J-14', labour: [LB('L1', 1)], ccptInvoiceNo: 'CC-7001' }, mgr(env)), 'DUPLICATE_CCPT_INVOICE'));
});
