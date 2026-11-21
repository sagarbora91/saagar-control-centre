// Service wave 2, billing core facade: the sync checks the page asks (jobHasRecords, closeCheck, taxRoute, activeInvoiceNo,
// jobBilled, jobNoCharge, allowsZeroFinal, blocksDelete). They return values, never throw, and any doubt is {ok:false}.
// Rules by hand from plan 2.9, 2.13 and 2.14.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build, OWNER, PART_LINE, LABOUR_LINE, good, ref } from './lib/svc2-core-kit.mjs';

const SYNC = ['jobHasRecords', 'closeCheck', 'taxRoute', 'activeInvoiceNo', 'jobBilled', 'jobNoCharge', 'allowsZeroFinal', 'blocksDelete'];

function jobEnv() {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  return e;
}
const bill = (e, jobId = 'WS-1', mode = 'CCPT_BILLED') => good(e.core.issueBill({ jobId, mode, lines: [PART_LINE, LABOUR_LINE] }, e.pinCtx()));
const pay = (e, amountPaise, jobId = 'WS-1', kind = 'balance') => good(e.core.takeReceipt({ jobId, kind, amountPaise, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));

test('garbage arguments never throw and never say yes', () => {
  const e = jobEnv();
  for (const m of SYNC) {
    for (const bad of [undefined, null, 5, {}, [], '', true]) {
      let r;
      assert.doesNotThrow(() => { r = e.core[m](bad); }, m);
      assert.equal(r.ok, false, m + ' ' + JSON.stringify(bad));
      assert.equal(typeof r.code, 'string');
    }
    const r = e.core[m]('NO-SUCH-JOB');
    assert.equal(typeof r, 'object');
    if (m === 'activeInvoiceNo' || m === 'jobBilled' || m === 'jobNoCharge' || m === 'allowsZeroFinal' || m === 'jobHasRecords' || m === 'blocksDelete') {
      // these read the bill layer, which knows nothing of the job: an honest "no record" is fine, a throw is not
      assert.equal(typeof r.ok, 'boolean');
    } else {
      assert.deepEqual([r.ok, r.code], [false, 'JOB_NOT_FOUND']);
    }
  }
});

test('when one bill-layer read throws, the checks that rest on it answer {ok:false} (fail closed), the others are not touched', () => {
  const e = jobEnv();
  const rests = {
    isNewWay: ['jobHasRecords', 'closeCheck', 'taxRoute'],
    listInvoices: ['closeCheck', 'taxRoute', 'activeInvoiceNo', 'jobBilled'],
    jobBilling: ['closeCheck', 'taxRoute', 'jobNoCharge', 'allowsZeroFinal'],
    isVoided: ['closeCheck', 'taxRoute'],
    blocksDelete: ['blocksDelete']
  };
  for (const [method, names] of Object.entries(rests)) {
    e.docsLib.state.throwOn.clear();
    e.docsLib.state.throwOn.add(method);
    for (const m of SYNC) {
      let r;
      assert.doesNotThrow(() => { r = e.core[m]('WS-1'); }, m + ' / ' + method);
      if (names.includes(m)) assert.equal(r.ok, false, m + ' / ' + method);
    }
  }
  e.docsLib.state.throwOn.clear();
  for (const m of SYNC) assert.equal(e.core[m]('WS-1').ok, true, m);
});

test('when the Stores store is not authoritative or billing is blocked, every sync check answers {ok:false}', () => {
  const e = jobEnv();
  e.docsLib.state.blocked = true;
  for (const m of SYNC) assert.equal(e.core[m]('WS-1').ok, false, m);
  e.docsLib.state.blocked = false;
  for (const m of SYNC) assert.equal(typeof e.core[m]('WS-1').ok, 'boolean');
  e.adapter.auth = false;
  for (const m of SYNC) {
    const r = e.core[m]('WS-1');
    assert.equal(r.ok, false, m);
    assert.equal(typeof r.code, 'string');
  }
});

test('when the money records are damaged, the close check and the record check refuse and no figure is shown', () => {
  const e = jobEnv();
  bill(e);
  pay(e, 100, 'WS-1', 'balance');
  assert.equal(e.core.closeCheck('WS-1').ok, true);
  const key = e.adapter.keys().find((k) => /saagar_svcs_receipts/.test(k));
  assert.ok(key, 'the receipts shard exists');
  const raw = JSON.parse(e.adapter.getItem(key));
  const last = raw[raw.length - 1];
  last.h = '0'.repeat(64);
  e.adapter.data.set(key, JSON.stringify(raw));
  e.stores.reopen();
  for (const m of ['closeCheck', 'jobHasRecords', 'blocksDelete']) {
    const r = e.core[m]('WS-1');
    assert.equal(r.ok, false, m);
  }
  const j = e.core.getJob('WS-1', e.ctx());
  assert.equal(j.ok, false);
  assert.equal(j.code, 'BILLING_BLOCKED');
  const st = e.core.status();
  assert.equal(st.blocked, true);
  assert.equal(st.ready, false);
  assert.equal(st.problems[0], 'SVCS_CHAIN_BREAK');
  assert.equal(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 100, payMode: 'Cash' }, e.ctx({ clientRef: ref() })).ok, false);
});

test('closeCheck: a job with no record closes the old way; amounts do not matter', () => {
  const e = jobEnv();
  assert.deepEqual(e.core.closeCheck('WS-1'), { ok: true, legacy: true, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: false });
  assert.deepEqual(e.core.jobHasRecords('WS-1'), { ok: true, has: false, reasons: [], anyRecord: false });
});

test('closeCheck: an advance with no bill is new way and cannot close; a bill with a balance cannot close; paid can; a part payment shows the rest', () => {
  const e = jobEnv();
  pay(e, 20000, 'WS-1', 'advance');
  assert.deepEqual(e.core.closeCheck('WS-1'), { ok: true, legacy: false, mayClose: false, why: 'NO_BILL', dueNowPaise: 0, billNo: '', noCharge: false });
  bill(e);
  assert.equal(e.core.closeCheck('WS-1').dueNowPaise, 127500);
  pay(e, 100000);
  const c = e.core.closeCheck('WS-1');
  assert.deepEqual([c.mayClose, c.why, c.dueNowPaise], [false, 'BALANCE_DUE', 27500]);
  pay(e, 27500);
  assert.equal(e.core.closeCheck('WS-1').mayClose, true);
});

test('closeCheck: a voided job and an unknown job are {ok:false}', () => {
  const e = jobEnv();
  good(e.core.voidJob({ jobId: 'WS-1', reason: 'entered twice by mistake' }, e.pinCtx()));
  assert.deepEqual([e.core.closeCheck('WS-1').ok, e.core.closeCheck('WS-1').code], [false, 'JOB_VOIDED']);
  assert.deepEqual([e.core.closeCheck('WS-9').ok, e.core.closeCheck('WS-9').code], [false, 'JOB_NOT_FOUND']);
});

test('taxRoute: the six routes of plan 2.9 and never "issue" or "legacy" by accident', () => {
  const e = jobEnv();
  // open job, nothing yet: issue
  assert.deepEqual(e.core.taxRoute('WS-1'), { ok: true, route: 'issue' });
  // closed job, no number, no record: old_way_closed
  e.cases.add('WS-2', { status: 'closed' });
  assert.deepEqual(e.core.taxRoute('WS-2'), { ok: true, route: 'old_way_closed' });
  // closed job with an old invoice number and no v2 record: legacy
  e.cases.add('WS-3', { status: 'closed', invoiceNo: 'SV/2026-27/0007' });
  assert.deepEqual(e.core.taxRoute('WS-3'), { ok: true, route: 'legacy' });
  // an open job cannot have a number, but if one is set by an older flow it is still legacy
  e.cases.add('WS-4', { invoiceNo: 'WS-2026-014' });
  assert.deepEqual(e.core.taxRoute('WS-4'), { ok: true, route: 'legacy' });
  // CCPT job: summary; not-in-CCPT job: tax_invoice
  bill(e, 'WS-1', 'CCPT_BILLED');
  assert.deepEqual(e.core.taxRoute('WS-1'), { ok: true, route: 'summary' });
  e.cases.add('WS-5');
  bill(e, 'WS-5', 'NOT_IN_CCPT');
  assert.deepEqual(e.core.taxRoute('WS-5'), { ok: true, route: 'tax_invoice' });
  // no-charge: the sheet
  e.cases.add('WS-6', { paymentStatus: 'no_charge_warranty' });
  good(e.core.issueNoChargeSheet({ jobId: 'WS-6' }, e.ctx()));
  assert.deepEqual(e.core.taxRoute('WS-6'), { ok: true, route: 'no_charge' });
  // a closed new-way job whose bill was cancelled can be billed again
  e.cases.add('WS-7');
  bill(e, 'WS-7');
  good(e.core.cancelBill({ invoiceNo: e.docsLib.state.invoices[2].no, reason: 'wrong bill made' }, e.pinCtx()));
  e.jobs.get('WS-7').status = 'closed';
  assert.deepEqual(e.core.taxRoute('WS-7'), { ok: true, route: 'issue' });
  // a voided job prints nothing
  good(e.core.voidJob({ jobId: 'WS-2', reason: 'entered twice by mistake' }, e.pinCtx()));
  assert.deepEqual([e.core.taxRoute('WS-2').ok, e.core.taxRoute('WS-2').code], [false, 'JOB_VOIDED']);
});

test('taxRoute: a legacy invoice number never turns into "issue"; a v2 bill beats the old number on the case', () => {
  const e = jobEnv();
  e.cases.add('WS-3', { status: 'closed', invoiceNo: 'SV/2026-27/0007' });
  for (let i = 0; i < 3; i += 1) assert.equal(e.core.taxRoute('WS-3').route, 'legacy');
  e.cases.add('WS-8', { invoiceNo: 'SV/2026-27/0008' });
  bill(e, 'WS-8');
  assert.equal(e.core.taxRoute('WS-8').route, 'summary');
});

test('activeInvoiceNo, jobBilled, jobNoCharge', () => {
  const e = jobEnv();
  assert.deepEqual(e.core.activeInvoiceNo('WS-1'), { ok: true, no: '' });
  assert.deepEqual(e.core.jobBilled('WS-1'), { ok: true, billed: false, no: '' });
  assert.deepEqual(e.core.jobNoCharge('WS-1'), { ok: true, noCharge: false });
  bill(e);
  assert.deepEqual(e.core.jobBilled('WS-1'), { ok: true, billed: true, no: 'SV/2026-27/0001' });
  good(e.core.cancelBill({ invoiceNo: 'SV/2026-27/0001', reason: 'wrong bill made' }, e.pinCtx()));
  assert.deepEqual(e.core.activeInvoiceNo('WS-1'), { ok: true, no: '' });
});

test('jobHasRecords: money alone counts; a refund alone counts too', () => {
  const e = jobEnv();
  pay(e, 1000, 'WS-1', 'advance');
  assert.deepEqual(e.core.jobHasRecords('WS-1'), { ok: true, has: true, reasons: ['MONEY'], anyRecord: true });
});

test('blocksDelete: any bill, sheet, void or money record blocks; a job with only estimate drafts does not; doubt blocks', () => {
  const e = jobEnv();
  good(e.core.saveEstimate({ jobId: 'WS-1', lines: [] }, e.ctx()));
  assert.deepEqual(e.core.blocksDelete('WS-1'), { ok: true, blocks: false, reasons: [] });
  e.cases.add('WS-2');
  pay(e, 1000, 'WS-2', 'advance');
  const m = e.core.blocksDelete('WS-2');
  assert.equal(m.ok, true);
  assert.equal(m.blocks, true);
  assert.ok(m.reasons.includes('MONEY'));
  e.cases.add('WS-3');
  bill(e, 'WS-3');
  assert.equal(e.core.blocksDelete('WS-3').blocks, true);
  e.docsLib.state.throwOn.add('blocksDelete');
  assert.equal(e.core.blocksDelete('WS-1').ok, false);
});

test('allowsZeroFinal is true only with an active no-charge sheet', () => {
  const e = jobEnv();
  assert.deepEqual(e.core.allowsZeroFinal('WS-1'), { ok: true, allows: false });
  e.cases.add('WS-2', { paymentStatus: 'no_charge_warranty' });
  assert.deepEqual(e.core.allowsZeroFinal('WS-2'), { ok: true, allows: false });
  good(e.core.issueNoChargeSheet({ jobId: 'WS-2' }, e.ctx()));
  assert.deepEqual(e.core.allowsZeroFinal('WS-2'), { ok: true, allows: true });
  good(e.core.cancelNoChargeSheet({ sheetId: 'WS-2', reason: 'issued by mistake' }, e.pinCtx()));
  assert.deepEqual(e.core.allowsZeroFinal('WS-2'), { ok: true, allows: false });
  assert.ok(OWNER);
});
