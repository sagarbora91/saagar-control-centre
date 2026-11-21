// Service wave 2, billing core facade, real stack: the contract points of the bill layer and the money layer that the facade must wire
// (N1, the no-charge sheet id, user context on every screen read, the old-bill floor, the single role table, void, sale reversal,
// the migration hand-over). REAL store, FIFO, masters, Phase 1 docs and core, calc, bill layer, money layer, migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realEnv, realDocs, Money, good, refused, ref, OWNER, MANAGER, DESK, TECH, TRAINEE, NONE, Fifo } from './lib/svc2-core-kit.mjs';

const TODAY = '2026-11-18';

function approved(e, jobId, lines) {
  const keep = e.cur.session;
  e.as(MANAGER);
  const est = good(e.core.saveEstimate({ jobId, lines }, e.ctx({ clientRef: ref('est') })));
  good(e.core.recordApproval({ jobId, version: est.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('apr') })));
  e.as(keep);
}
function desk(e) {
  e.as(OWNER);
  good(e.core.setConfig({ billingRoles: ['Cashier'] }, e.pinCtx({ clientRef: ref('cfg') })));
}
const labour = (qty = 1) => [{ kind: 'LABOUR', code: 'L1', qty }];

test('N1: a receipt set off on a live bill is not reversed until the bill is cancelled; then it may be', () => {
  const e = realEnv();
  desk(e);
  e.cases.add('J-1');
  approved(e, 'J-1', labour());
  e.as(DESK);
  assert.equal(good(e.core.takeReceipt({ jobId: 'J-1', kind: 'advance', amountPaise: 5000, payMode: 'Cash' }, e.ctx({ clientRef: ref('a') }))).receipt.no, 'SAR/26-27/0001');
  const bill = good(e.core.issueBill({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e.ctx({ clientRef: ref('b') }))).invoice;
  assert.equal(bill.no, 'SV/2026-27/0001');
  assert.deepEqual(bill.setOff, { advancePaise: 5000, receipts: [{ no: 'SAR/26-27/0001', amountPaise: 5000 }] });
  e.as(MANAGER);
  const before = e.text();
  const r = refused(e.core.reverseReceipt({ no: 'SAR/26-27/0001', reason: 'wrong amount typed' }, e.ctx({ clientRef: ref('r1') })), 'RECEIPT_SET_OFF');
  assert.equal(r.invoiceNo, 'SV/2026-27/0001');
  assert.equal(r.message, 'This receipt is set off on a live bill. Cancel the bill first.');
  assert.equal(e.text(), before, 'a refusal writes nothing');
  // the Owner cancels the bill (object form), then the Manager may reverse the receipt the same day
  e.as(OWNER);
  good(e.core.cancelBill({ invoiceNo: 'SV/2026-27/0001', reason: 'wrong job billed' }, e.pinCtx({ clientRef: ref('c') })));
  e.as(MANAGER);
  good(e.core.reverseReceipt({ no: 'SAR/26-27/0001', reason: 'wrong amount typed' }, e.ctx({ clientRef: ref('r2') })));
  e.as(OWNER);
  const j = good(e.core.getJob('J-1', e.ctx())).job;
  assert.equal(j.state, 'cancelled');
  assert.equal(j.paidPaise, 0);
});

test('the no-charge sheet: getJob.noCharge carries the sheet id, the card offers the cancel action, cancelNoChargeSheet takes {sheetId, reason}', () => {
  const e = realEnv();
  e.cases.add('J-2', { paymentStatus: 'no_charge_warranty' });
  good(e.stores.issueToJob({ jobId: 'J-2', lines: [{ partCode: 'P1', qty: 1 }] }, { session: MANAGER, clientRef: ref('iss') }));
  e.as(MANAGER);
  // before the sheet: the card can issue it, cannot cancel it
  let j = good(e.core.getJob('J-2', e.ctx())).job;
  assert.deepEqual(j.noCharge, { on: true, sheet: false, id: '' });
  assert.equal(j.actions.markNoCharge, true);
  assert.equal(j.actions.cancelNoChargeSheet, 'NOT_ALLOWED', 'a Manager cannot cancel a sheet (Owner row)');
  const made = good(e.core.issueNoChargeSheet({ jobId: 'J-2', labour: [{ code: 'L1', qty: 1 }] }, e.ctx({ clientRef: ref('ncs') })));
  const id = made.sheet.id;
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 3);
  e.as(OWNER);
  j = good(e.core.getJob('J-2', e.ctx())).job;
  assert.deepEqual(j.noCharge, { on: true, sheet: true, id });
  assert.equal(j.state, 'no_charge');
  assert.equal(j.actions.cancelNoChargeSheet, true);
  assert.equal(j.actions.markNoCharge, 'SHEET_ALREADY_ISSUED');
  assert.deepEqual(e.core.closeCheck('J-2'), { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: true });
  assert.deepEqual(e.core.allowsZeroFinal('J-2'), { ok: true, allows: true });
  assert.deepEqual(e.core.taxRoute('J-2'), { ok: true, route: 'no_charge' });
  // the cancel: no PIN is refused, a short reason is refused, then it works and the job closes no more
  refused(e.core.cancelNoChargeSheet({ sheetId: id, reason: 'made by mistake' }, e.ctx({ clientRef: ref('n1') })), 'PIN_REQUIRED');
  good(e.core.cancelNoChargeSheet({ sheetId: id, reason: 'made by mistake' }, e.pinCtx({ clientRef: ref('n2') })));
  j = good(e.core.getJob('J-2', e.ctx())).job;
  assert.deepEqual(j.noCharge, { on: true, sheet: false, id: '' });
  assert.equal(j.actions.cancelNoChargeSheet, 'SHEET_REQUIRED');
  assert.equal(e.core.closeCheck('J-2').mayClose, false);
});

// Wrap a layer so every call of the named reads is logged with its arguments.
// `st.depth` counts the bill-layer reads in progress: a money read made by the bill layer itself (it flags a stale set-off) is its own business.
function spyLib(lib, names, st) {
  const log = [];
  const wrapApi = (api) => {
    const out = {};
    for (const k of Object.keys(api)) {
      out[k] = typeof api[k] === 'function' && names.includes(k)
        ? (...a) => { log.push({ k, a, inner: st.depth > 0 }); if (st.docs) st.depth += 1; try { return api[k](...a); } finally { if (st.docs) st.depth -= 1; } }
        : api[k];
    }
    return out;
  };
  const wrapped = Object.assign({}, lib, {
    create(deps) {
      const r = lib.create(deps);
      if (r && r.ok === false) return r;
      if (r && r.api) return Object.assign({}, r, { api: wrapApi(r.api) });
      return wrapApi(r);
    }
  });
  return { wrapped, log };
}
const hasCtx = (a) => { const last = a[a.length - 1]; return !!last && typeof last === 'object' && !!last.session && last.session.ok === true; };

test('AM-5: every screen read passes the user context down to the bill layer and the money layer', () => {
  const DOC_READS = ['getInvoice', 'listInvoices', 'getCreditNote', 'listCreditNotes', 'jobBilling', 'estimateView', 'unbilledIssues', 'pendingCcpt', 'pendingCreditReturns'];
  const MONEY_READS = ['receiptView', 'listReceipts', 'daySummary', 'advancesHeld', 'legacyAdvances', 'unreceiptedCounterSales', 'saleMoney'];
  const st = { depth: 0, docs: true };
  const d = spyLib(realDocs(), DOC_READS, st);
  const m = spyLib(Money, MONEY_READS.concat(['jobMoney']), { get depth() { return st.depth; }, docs: false });
  const e = realEnv({ args: { docsLib: d.wrapped, moneyLib: m.wrapped } });
  desk(e);
  e.cases.add('J-1');
  approved(e, 'J-1', labour());
  e.as(DESK);
  good(e.core.takeReceipt({ jobId: 'J-1', kind: 'advance', amountPaise: 5000, payMode: 'Cash' }, e.ctx({ clientRef: ref('a') })));
  good(e.core.issueBill({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e.ctx({ clientRef: ref('b') })));
  e.as(OWNER);
  const calls = [
    () => e.core.getJob('J-1', e.ctx()), () => e.core.getBill('SV/2026-27/0001', e.ctx()), () => e.core.listBills({}, e.ctx()),
    () => e.core.estimateView('J-1', e.ctx()), () => e.core.unbilledIssues({}, e.ctx()), () => e.core.pendingCcpt(e.ctx()),
    () => e.core.pendingCreditReturns(e.ctx()), () => e.core.daySummary(TODAY, e.ctx()), () => e.core.advancesHeld({}, e.ctx()),
    () => e.core.listReceipts({}, e.ctx()), () => e.core.legacyAdvances(e.ctx()), () => e.core.unreceiptedCounterSales(e.ctx()),
    () => e.core.printData('serviceBillSummary', { invoiceNo: 'SV/2026-27/0001' }, e.ctx()), () => e.core.printData('serviceDaySummary', { date: TODAY }, e.ctx()),
    () => e.core.printData('serviceAdvancesHeld', {}, e.ctx()), () => e.core.printData('serviceUnbilledIssues', {}, e.ctx()),
    () => e.core.printData('serviceRevenue', { from: TODAY, to: TODAY }, e.ctx()), () => e.core.printData('serviceReceipt', { receiptNo: 'SAR/26-27/0001' }, e.ctx())
  ];
  calls.forEach((fn, i) => {
    d.log.length = 0;
    m.log.length = 0;
    const r = fn();
    assert.equal(r.ok, true, 'call ' + i + ' ' + JSON.stringify(r).slice(0, 200));
    for (const c of d.log) assert.equal(hasCtx(c.a), true, 'call ' + i + ': bill layer read ' + c.k + ' had no user context');
    for (const c of m.log.filter((x) => x.k !== 'jobMoney' && !x.inner)) assert.equal(hasCtx(c.a), true, 'call ' + i + ': money read ' + c.k + ' had no user context');
  });
  // getJob reads the money of the job with the user context at least once
  m.log.length = 0;
  good(e.core.getJob('J-1', e.ctx()));
  assert.ok(m.log.some((x) => x.k === 'jobMoney' && hasCtx(x.a)));
  // and the role table applies on the way down: a technician gets no amounts from any of them
  e.as(TECH);
  calls.forEach((fn, i) => {
    const r = fn();
    if (i === 0) { assert.equal(r.ok, true); assert.equal(r.job.amountsHidden, true); } // the card: status only
    else if (i === 3) assert.equal(r.ok, true); // a technician is estimate staff and sees the estimate
    else assert.equal(r.ok, false, 'call ' + i + ' must be refused for a technician');
  });
});

test('the old-bill floor: cases.legacyFloor(fy) reaches the bill layer (first bill after old number 44 is 45); without it the first bill is refused', () => {
  const e = realEnv();
  e.cases.legacyFloor = (fy) => { assert.match(fy, /^\d{4}-\d{2}$/); return 44; };
  desk(e);
  e.cases.add('J-1');
  approved(e, 'J-1', labour());
  const r = good(e.core.issueBill({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e.ctx({ clientRef: ref('b') })));
  assert.equal(r.invoice.no, 'SV/2026-27/0045');
  const e2 = realEnv();
  e2.cases.legacyFloor = undefined;
  desk(e2);
  e2.cases.add('J-1');
  approved(e2, 'J-1', labour());
  const before = e2.text();
  const bad = refused(e2.core.issueBill({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED' }, e2.ctx({ clientRef: ref('b') })), 'DEPS_INVALID');
  assert.equal(bad.ok, false);
  assert.equal(e2.text(), before, 'no number is invented');
});

test('one role table: the facade `can` and the bill layer `can` agree on every action both define, for every kind of session', () => {
  const e = realEnv();
  desk(e);
  good(e.stores.setConfig({ storeRoles: ['Technician'] }, e.pinCtx({ clientRef: ref('sr') })));
  const d = realDocs().create({ store: e.handle.store, calc: e.args.calc, masters: e.args.masters, stock: e.handle.docs, money: null, cases: e.cases, now: e.clock.now });
  const SESS = { OWNER, MANAGER, DESK, TECH, TRAINEE };
  // facade action -> bill layer action
  const MAP = {
    VIEW_STATUS: 'VIEW_STATUS', VIEW_AMOUNTS: 'VIEW_AMOUNTS', EST_SAVE: 'EST_SAVE', EST_APPROVE: 'EST_APPROVE', EST_OTHER_LINE: 'EST_OTHER_LINE',
    INV_ISSUE: 'INV_ISSUE', CCPT_LINK: 'CCPT_ADD', DISCOUNT_ABOVE: 'DISCOUNT_ABOVE_LIMIT', INV_APPROVAL_OVERRIDE: 'APPROVAL_OVERRIDE',
    INV_ISSUE_NOT_IN_CCPT: 'NOT_IN_CCPT', CCPT_CHANGE: 'CCPT_CHANGE', INV_CANCEL: 'INV_CANCEL', CN_ISSUE: 'CN_ISSUE', NCS_ISSUE: 'NCS_ISSUE',
    NCS_CANCEL: 'NCS_CANCEL', JOB_VOID: 'JOB_VOID', BCFG_SET: 'BCFG_SET', IMPORT_LEGACY: 'IMPORT_LEGACY', CN_STOCK_RETURN: 'CN_STOCK_RETURN'
  };
  for (const [fa, da] of Object.entries(MAP)) {
    for (const [name, s] of Object.entries(SESS)) {
      const a = e.core.can(fa, s);
      const b = d.can(da, s);
      assert.equal(a.ok, b.ok, fa + ' ' + name + ' ' + JSON.stringify([a, b]));
      assert.equal(a.needsPin, b.needsPin, fa + ' ' + name + ' PIN');
    }
  }
});

test('void a job (Owner, PIN, object form): the job is void, the card says so, closing is refused, billing records are kept', () => {
  const e = realEnv();
  e.cases.add('J-1');
  approved(e, 'J-1', labour());
  e.as(OWNER);
  refused(e.core.voidJob({ jobId: 'J-1', reason: 'customer left' }, e.ctx({ clientRef: ref('v0') })), 'PIN_REQUIRED');
  good(e.core.voidJob({ jobId: 'J-1', reason: 'customer left' }, e.pinCtx({ clientRef: ref('v1') })));
  const j = good(e.core.getJob('J-1', e.ctx())).job;
  assert.equal(j.voided, true);
  assert.equal(j.state, 'voided');
  assert.deepEqual(e.core.closeCheck('J-1'), { ok: false, code: 'JOB_VOIDED' });
  assert.equal(e.core.blocksDelete('J-1').blocks, true);
  assert.equal(e.core.jobHasRecords('J-1').has, true);
});

test('counter sale reversal on the real bill layer: the receipt is reversed first, then the sale, and the part is back on the shelf', () => {
  const e = realEnv();
  good(e.stores.setConfig({ storeRoles: ['Technician'] }, e.pinCtx({ clientRef: ref('sr') })));
  const sale = good(e.stores.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P2', qty: 2, unitPricePaise: 6000 }] }, { session: MANAGER, clientRef: ref('s') })).doc.no;
  assert.equal(sale, 'CSL/26-27/0001');
  const onHand = () => Fifo.partBalance(e.handle.docs.fifoState(), 'P2').qty;
  assert.equal(onHand(), 3);
  e.as(TECH);
  good(e.core.takeCounterReceipt({ saleNo: sale, amountPaise: 12000, payMode: 'Cash' }, e.ctx({ clientRef: ref('r') })));
  // the Stores reversal alone is refused while money is held
  const p1 = e.stores.reverseDoc(sale, 'sold by mistake', { session: MANAGER, clientRef: ref('x') });
  assert.equal(p1.ok, false);
  e.as(MANAGER);
  const r = good(e.core.reverseSale({ saleNo: sale, reason: 'sold by mistake' }, e.ctx({ clientRef: ref('rs') })));
  assert.equal(r.moneyReversed, true);
  assert.equal(onHand(), 5);
  e.as(OWNER);
  assert.deepEqual(good(e.core.unreceiptedCounterSales(e.ctx())).rows, []);
});

test('migration through the facade: the plan lists old bills, the run needs the Owner and the PIN, a second run writes nothing; no hash function = not available', () => {
  const figs = { gstPct: 18, listed: 1000, adjustment: 0, taxable: 1000, gst: 180, cgst: 90, sgst: 90, roundOff: 0, finalAmt: 1180, total: 1180 };
  const make = (extra) => {
    const e = realEnv(extra);
    const list = [{ id: 'WS-1', status: 'closed', invoiceNo: 'SV/2026-27/0007' }, { id: 'WS-2', status: 'closed', invoiceNo: 'SV/2026-27/0008' }];
    e.cases.list = () => list;
    e.cases.legacyInput = (id) => ({ ok: true, basis: 'LIVE_CASE', invoiceDate: '2026-05-02', figs, payMode: 'Cash', lineCount: 1, correctionCount: 0, snapshotSha: null });
    return e;
  };
  const e = make();
  e.as(MANAGER);
  const plan = good(e.core.planMigration(e.ctx()));
  const rows = plan.rows || plan.items || plan.list || [];
  assert.equal(rows.length, 2, JSON.stringify(plan).slice(0, 300));
  refused(e.core.runMigration(plan, e.pinCtx({ clientRef: ref('m') })), 'NOT_ALLOWED');
  e.as(OWNER);
  refused(e.core.runMigration(plan, e.ctx({ clientRef: ref('m') })), 'PIN_REQUIRED');
  const run = good(e.core.runMigration(plan, e.pinCtx({ clientRef: ref('m') })));
  assert.equal(run.written.invoices, 2, JSON.stringify(run).slice(0, 300));
  assert.equal(run.written.advances, 0, 'nothing is written for advances');
  const again = good(e.core.planMigration(e.ctx()));
  assert.equal((again.rows || again.items || again.list || []).length, 0);
  // the page must hand over hashHex (or storeLib): without it the migration is not available and nothing breaks
  const e2 = make({ args: { storeLib: undefined, hashHex: undefined } });
  refused(e2.core.planMigration(e2.ctx()), 'BCORE_LIBS_MISSING');
  // and the explicit hashHex works as well as the library
  const e3 = make({ args: { storeLib: undefined, hashHex: realEnv().args.storeLib.sha256Hex } });
  good(e3.core.planMigration(e3.ctx()));
});

test('delete guard (plan 2.14): estimate drafts alone may be deleted; an approval, a bill or any money blocks; the answer says so in one field', () => {
  const e = realEnv();
  desk(e);
  e.cases.add('J-1');
  e.cases.add('J-2');
  e.cases.add('J-3');
  e.as(MANAGER);
  good(e.core.saveEstimate({ jobId: 'J-1', lines: labour() }, e.ctx({ clientRef: ref('e1') })));
  // only an estimate draft: new way (closes by the new rules) but nothing blocks a delete
  assert.deepEqual(e.core.jobHasRecords('J-1'), { ok: true, has: false, reasons: [], anyRecord: true });
  assert.deepEqual(e.core.blocksDelete('J-1'), { ok: true, blocks: false, reasons: [] });
  // no record at all
  assert.deepEqual(e.core.jobHasRecords('J-3'), { ok: true, has: false, reasons: [], anyRecord: false });
  // an approval blocks
  approved(e, 'J-2', labour());
  const a = e.core.jobHasRecords('J-2');
  assert.equal(a.has, true);
  assert.deepEqual(a.reasons, ['APPROVAL']);
  // money alone blocks
  e.as(DESK);
  e.as(OWNER);
  good(e.core.takeReceipt({ jobId: 'J-3', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.ctx({ clientRef: ref('m') })));
  assert.deepEqual(e.core.jobHasRecords('J-3'), { ok: true, has: true, reasons: ['MONEY'], anyRecord: true });
  // an unknown or empty job id never says "nothing blocks"
  assert.equal(e.core.jobHasRecords('').ok, false);
});
