// Service wave 2, billing core facade: one job from estimate to refund on the REAL stack (real store, FIFO, masters, Phase 1 docs
// and core, calc, bill layer, money layer). Every figure is typed by hand below, in paise, and then asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realEnv, good, refused, ref, OWNER, MANAGER, DESK, TECH, Fifo } from './lib/svc2-core-kit.mjs';

const line = (kind, code, qty) => ({ kind, code, qty });

test('end to end on the real stack: estimate, approval, advance, issue of parts, bill, balance, close check, credit note with a part back, refund', () => {
  const e = realEnv();
  const c = e.core;
  good(c.setConfig({ billingRoles: ['Cashier'] }, e.pinCtx({ clientRef: ref('cfg') })));
  e.cases.add('J-1');

  // 1. Estimate by a technician: 4 x P1 (118.00 incl 18 %) = 472.00 (taxable 400.00); labour 100.00 + 18.00 = 118.00; in all 590.00.
  e.as(TECH);
  const est = good(c.saveEstimate({ jobId: 'J-1', lines: [line('PART', 'P1', 4), line('LABOUR', 'L1', 1)] }, e.ctx({ clientRef: ref('est') })));
  assert.equal(est.estimate.bill.totals.totalPaise, 59000);
  assert.equal(est.estimate.bill.totals.taxablePaise, 50000);
  // a technician sees the status chip but no amounts (plan 2.11)
  const techView = good(c.getJob('J-1', e.ctx()));
  assert.equal(techView.job.amountsHidden, true);
  assert.equal(techView.job.estimate, undefined);

  // 2. Approval by the technician: exactly the estimate total.
  const apr = good(c.recordApproval({ jobId: 'J-1', version: 1, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('apr') })));
  assert.equal(apr.approval.amountPaise, 59000);

  // 3. Advance Rs 100.00 cash by the desk (Cashier is a billing role).
  e.as(DESK);
  const adv = good(c.takeReceipt({ jobId: 'J-1', kind: 'advance', amountPaise: 10000, payMode: 'Cash' }, e.ctx({ clientRef: ref('adv') })));
  assert.equal(adv.receipt.no, 'SAR/26-27/0001');
  let j = good(c.getJob('J-1', e.ctx())).job;
  assert.equal(j.state, 'approved');
  assert.equal(j.heldPaise, 10000);
  assert.equal(j.paidPaise, 10000);

  // 4. Issue 4 batteries from stock: 3 x 100.00 + 1 x 120.00 = 420.00 cost (the Phase 1 core does this).
  good(e.stores.issueToJob({ jobId: 'J-1', lines: [{ partCode: 'P1', qty: 4 }] }, { session: MANAGER, clientRef: ref('iss') }));
  assert.equal(Fifo.partBalance(e.handle.docs.fifoState(), 'P1').qty, 2);

  // 5. The bill (CCPT billed): 590.00 in all, tax 90.00 split CGST 45.00 and SGST 45.00.
  const bill = good(c.issueBill({ jobId: 'J-1', parts: [{ partCode: 'P1', qty: 4, discountPaise: 0 }], labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e.ctx({ clientRef: ref('bill') }))).invoice;
  assert.equal(bill.no, 'SV/2026-27/0001');
  assert.equal(bill.totalPaise, 59000);
  assert.equal(bill.bill.totals.cgstPaise, 4500);
  assert.equal(bill.bill.totals.sgstPaise, 4500);
  assert.equal(bill.balanceDuePaise, 49000);
  e.cases.jobs.get('J-1').invoiceNo = bill.no; // what the page glue does after an issue (svbSetCaseInvoice)
  j = good(c.getJob('J-1', e.ctx())).job;
  assert.equal(j.state, 'billed');
  assert.equal(j.duePaise, 49000);
  assert.equal(j.heldPaise, 0);
  assert.equal(j.billNo, bill.no);

  // close check before the balance: not allowed, 490.00 due
  assert.deepEqual(c.closeCheck('J-1'), { ok: true, legacy: false, mayClose: false, why: 'BALANCE_DUE', dueNowPaise: 49000, billNo: bill.no, noCharge: false });
  assert.deepEqual(c.taxRoute('J-1'), { ok: true, route: 'summary' });

  // 6. Balance Rs 490.00 by UPI.
  const bal = good(c.takeReceipt({ jobId: 'J-1', kind: 'balance', amountPaise: 49000, payMode: 'UPI' }, e.ctx({ clientRef: ref('bal') })));
  assert.equal(bal.receipt.no, 'SRC/26-27/0001');
  assert.deepEqual(c.closeCheck('J-1'), { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: bill.no, noCharge: false });
  j = good(c.getJob('J-1', e.ctx())).job;
  assert.equal(j.state, 'paid');

  // 7. Credit note for 1 of the 4 batteries (taxable 100.00 + 18.00 = 118.00), Owner with PIN; the part goes back.
  e.as(OWNER);
  const cnRes = good(c.issueCreditNote({
    invoiceNo: bill.no, mode: 'PARTIAL', reasonClass: 'RETURN', reason: 'customer returned one battery',
    request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, stock: [{ lineNo: 1, qty: 1 }]
  }, e.pinCtx({ clientRef: ref('cn') })));
  assert.equal(cnRes.creditNote.totalPaise, 11800);
  const mv = e.handle.docs.movements().filter((m) => m.type === 'issue_job')[0];
  good(e.stores.returnFromJob({ jobId: 'J-1', creditNoteNo: cnRes.creditNote.no, lines: [{ issueMovementId: mv.id, qty: 1, returnReason: 'UNUSED' }] }, { session: MANAGER, clientRef: ref('ret') }));
  // the port (the bill layer's own check) refuses a second piece under the same note, and a note that does not exist
  const over = refused(e.stores.returnFromJob({ jobId: 'J-1', creditNoteNo: cnRes.creditNote.no, lines: [{ issueMovementId: mv.id, qty: 1, returnReason: 'UNUSED' }] }, { session: MANAGER, clientRef: ref('ret2') }), 'JOB_CLOSED');
  // Stage E (D-flows-2): the job is open, so the person sees the bill layer's sentence, not "This job is closed".
  assert.equal(over.detail.port, 'CREDIT_RETURN_INVALID');
  assert.equal(over.message, 'This stock return does not match the credit note.');
  const none = refused(e.stores.returnFromJob({ jobId: 'J-1', creditNoteNo: 'SCN/26-27/0099', lines: [{ issueMovementId: mv.id, qty: 1, returnReason: 'UNUSED' }] }, { session: MANAGER, clientRef: ref('ret3') }), 'JOB_CLOSED');
  assert.equal(none.message, 'This stock return does not match the credit note.');
  // the piece goes back to the 120.00 layer it left last: shelf 3 x 120.00
  const bp = Fifo.partBalance(e.handle.docs.fifoState(), 'P1');
  assert.equal(bp.qty, 3);
  assert.equal(bp.valuePaise, 36000);

  // 8. Refund of the credit: 118.00 at most (paid 590.00, now owed 472.00)
  j = good(c.getJob('J-1', e.ctx())).job;
  assert.equal(j.refundablePaise, 11800);
  refused(c.refund({ jobId: 'J-1', amountPaise: 11801, payMode: 'Cash', reason: 'credit note refund', cnNo: cnRes.creditNote.no }, e.pinCtx({ clientRef: ref('rf0') })), 'REFUND_EXCEEDS_REFUNDABLE');
  const rf = good(c.refund({ jobId: 'J-1', amountPaise: 11800, payMode: 'Cash', reason: 'credit note refund', cnNo: cnRes.creditNote.no }, e.pinCtx({ clientRef: ref('rf1') })));
  assert.equal(rf.refund.no, 'SRF/26-27/0001');
  j = good(c.getJob('J-1', e.ctx())).job;
  assert.equal(j.paidPaise, 47200);
  assert.equal(j.refundablePaise, 0);
  assert.equal(j.duePaise, 0);

  // 9. The day summary: bills 1 (590.00), credit notes 1 (118.00), receipts 590.00, refunds 118.00, net 472.00; nothing "not available".
  const day = good(c.daySummary('2026-11-18', e.ctx()));
  assert.deepEqual(day.invoicesIssued, { available: true, count: 1, paise: 59000, cancelled: 0 });
  assert.deepEqual(day.creditNotes, { available: true, count: 1, paise: 11800 });
  assert.equal(day.netAll, 47200);
  assert.deepEqual(day.notAvailable, []);
});

test('Stage E round 2 (A): a credit note that takes 2 batteries back puts them in stock in one return, last layer first, never twice', () => {
  const e = realEnv();
  const c = e.core;
  e.cases.add('J-1');
  // Stock of P1 in the kit: layer A 3 x 100.00, layer B 3 x 120.00. Issue 4: A gives 3, B gives 1 (cost 420.00); shelf 2 x 120.00.
  e.as(MANAGER);
  const est = good(c.saveEstimate({ jobId: 'J-1', lines: [line('PART', 'P1', 4)] }, e.ctx({ clientRef: ref('est') })));
  good(c.recordApproval({ jobId: 'J-1', version: est.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('apr') })));
  good(e.stores.issueToJob({ jobId: 'J-1', lines: [{ partCode: 'P1', qty: 4 }] }, { session: MANAGER, clientRef: ref('iss') }));
  const bill = good(c.issueBill({ jobId: 'J-1', parts: [{ partCode: 'P1', qty: 4, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e.ctx({ clientRef: ref('bill') }))).invoice;
  e.cases.jobs.get('J-1').invoiceNo = bill.no;
  e.as(OWNER);
  const cn = good(c.issueCreditNote({
    invoiceNo: bill.no, mode: 'PARTIAL', reasonClass: 'RETURN', reason: 'customer returned two batteries',
    request: { kind: 'LINES', lines: [{ lineNo: 1, qty: 2 }] }, stock: [{ lineNo: 1, qty: 2 }]
  }, e.pinCtx({ clientRef: ref('cn') }))).creditNote;
  let bal = Fifo.partBalance(e.handle.docs.fifoState(), 'P1');
  assert.deepEqual([bal.qty, bal.valuePaise], [2, 24000], 'nothing goes back to stock by itself');
  e.as(MANAGER);
  let j = good(c.getJob('J-1', e.ctx())).job;
  assert.deepEqual(j.pendingReturns.map((r) => [r.cnNo, r.lineNo, r.partCode, r.creditedQty, r.returnedQty, r.pendingQty]), [[cn.no, 1, 'P1', 2, 0, 2]]);
  // a technician may not see or post it
  e.as(TECH);
  assert.deepEqual(good(c.getJob('J-1', e.ctx())).job.pendingReturns || [], []);
  refused(c.returnCreditedStock({ cnNo: cn.no }, e.ctx({ clientRef: ref('t') })));
  // the Store Manager puts them back: one return record naming the note
  e.as(MANAGER);
  const ret = good(c.returnCreditedStock({ cnNo: cn.no }, e.ctx({ clientRef: ref('ret') })));
  assert.equal(ret.doc.creditNoteNo, cn.no);
  assert.deepEqual(ret.doc.lines.map((l) => l.qty), [2]);
  // by hand: the 2 pieces refill the layers they left last: 1 to B (120.00), 1 to A (100.00): shelf 4 pieces, 240.00 + 220.00 = 460.00
  bal = Fifo.partBalance(e.handle.docs.fifoState(), 'P1');
  assert.deepEqual([bal.qty, bal.valuePaise], [4, 46000]);
  j = good(c.getJob('J-1', e.ctx())).job;
  assert.deepEqual(j.pendingReturns, []);
  // never twice: a second press has nothing to put back and writes nothing
  const before = e.handle.docs.movements().length;
  const again = refused(c.returnCreditedStock({ cnNo: cn.no }, e.ctx({ clientRef: ref('ret2') })), 'CREDIT_RETURN_INVALID');
  assert.equal(again.why, 'NOTHING_PENDING');
  assert.equal(e.handle.docs.movements().length, before);
  refused(c.returnCreditedStock({ cnNo: 'SCN/26-27/0099' }, e.ctx({ clientRef: ref('ret3') })), 'CREDIT_RETURN_INVALID');
  refused(c.returnCreditedStock({}, e.ctx({ clientRef: ref('ret4') })), 'BCORE_ARGS_INVALID');
});

// Stage E round 3 (D-perf-1): opening every layer reads each storage piece at most once and the work is linear in the data.
// Work is counted (JSON.parse calls and characters parsed during the open), not timed, so a busy PC cannot make it flaky.
test('Stage E round 3: opening the stack parses each storage piece once; doubling the bills does not more than about double the work', async () => {
  const probe = await import('./lib/svc2-perf-probe.mjs');
  const seedBills = (n) => {
    const e = realEnv();
    const c = e.core;
    for (let i = 1; i <= n; i++) {
      const jobId = 'J-B' + i;
      e.cases.add(jobId);
      e.as(MANAGER);
      e.clock.advance(60000);
      const est = good(c.saveEstimate({ jobId, lines: [line('LABOUR', 'L1', 2)] }, e.ctx({ clientRef: ref('e') })));
      e.clock.advance(60000);
      good(c.recordApproval({ jobId, version: est.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('a') })));
      e.clock.advance(60000);
      good(c.takeReceipt({ jobId, kind: 'advance', amountPaise: 5000, payMode: 'Cash' }, e.ctx({ clientRef: ref('r') })));
      e.clock.advance(60000);
      const bill = good(c.issueBill({ jobId, labour: [{ code: 'L1', qty: 2, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e.ctx({ clientRef: ref('b') }))).invoice;
      e.cases.jobs.get(jobId).invoiceNo = bill.no;
      e.clock.advance(60000);
      good(c.takeReceipt({ jobId, kind: 'balance', amountPaise: bill.balanceDuePaise, payMode: 'UPI' }, e.ctx({ clientRef: ref('r') })));
    }
    return { data: new Map(e.adapter.data), jobs: Array.from(e.cases.jobs.values()) };
  };
  const measure = (snap) => {
    const p0 = probe.counts.parse;
    const c0 = probe.counts.parseChars;
    const out = probe.openStack(snap, { nowIso: '2026-12-31T06:00:00.000Z' });
    const open = out.stages.find((s) => s.stage === 'share ready');
    return { keys: snap.data.size, openParses: open.parses, parses: probe.counts.parse - p0, chars: probe.counts.parseChars - c0, status: out.core.status({ session: probe.OWNER }) };
  };
  const a = measure(seedBills(40));
  const b = measure(seedBills(80));
  for (const m of [a, b]) {
    assert.equal(m.status.ok, true);
    // the open reads every storage piece once (plus a handful of small control texts), never once per record
    assert.ok(m.openParses <= m.keys + 8, 'parses ' + m.openParses + ' for ' + m.keys + ' keys');
  }
  // doubling the bills (and their receipts) at most about doubles what is parsed in the whole open, every layer included
  assert.ok(b.chars <= 2.3 * a.chars, 'parsed chars ' + a.chars + ' then ' + b.chars);
  assert.ok(b.parses <= 2.3 * a.parses, 'parse calls ' + a.parses + ' then ' + b.parses);
});

test('Stage E round 4 (R-gaps-2): a labour-only warranty job gets its no-charge sheet when the labour is sent; with none it is refused as before', () => {
  const e = realEnv();
  const c = e.core;
  e.cases.add('J-W', { paymentStatus: 'no_charge_warranty' });
  e.as(MANAGER);
  good(c.saveEstimate({ jobId: 'J-W', lines: [line('LABOUR', 'L1', 1)] }, e.ctx({ clientRef: ref('ew') })));
  refused(c.issueNoChargeSheet({ jobId: 'J-W', labour: [], note: 'Warranty ref TW-1. strap pin' }, e.ctx({ clientRef: ref('nw0') })), 'LINES_REQUIRED');
  const r = good(c.issueNoChargeSheet({ jobId: 'J-W', labour: [{ code: 'L1', name: '', qty: 1 }], note: 'Warranty ref TW-1. strap pin' }, e.ctx({ clientRef: ref('nw1') })));
  assert.ok(r.sheet || r.ok);
});
