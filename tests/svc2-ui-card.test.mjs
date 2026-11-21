// Service wave 2, W-UI: the job card, the delivery strip and the page hooks (P5 U19 to U30, as corrected by the plan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, flush } from './lib/svc2-ui-harness.mjs';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const CTX = (s, extra) => Object.assign({ session: s || SESSIONS.owner, clientRef: 'seed-' + Math.random() }, extra || {});

async function withState(state, opts) {
  const a = setup(opts || {});
  const b = a.billing;
  const id = a.h.currentJob;
  if (state === 'estimate') a.seedEstimate(id);
  if (state === 'approved') a.seedApproved(id);
  if (state === 'reapprove') {
    a.seedApproved(id);
    b.saveEstimate({ jobId: id, lines: [{ kind: 'PART', code: 'DEMO-P1', qty: 2 }, { kind: 'LABOUR', code: 'DEMO-L1', qty: 1 }], note: '', reason: 'raised' }, CTX());
  }
  if (state === 'billed' || state === 'billedNoCcpt' || state === 'paid' || state === 'cancelled') {
    a.seedBill(id, state === 'billedNoCcpt' ? { ccptInvoiceNo: '' } : {});
    if (state === 'paid') b.takeReceipt({ jobId: id, kind: 'balance', amountPaise: b.state.jobs[id].bills[0].totalPaise, payMode: 'Cash', payRef: '', note: '' }, CTX());
    if (state === 'cancelled') b.cancelBill({ invoiceNo: b.state.jobs[id].bills[0].no, reason: 'because' }, CTX(null, { stepUp: { ok: true, at: 1 } }));
  }
  if (state === 'nocharge') b.issueNoChargeSheet({ jobId: id, labour: [], note: 'warranty' }, CTX());
  if (state === 'voided') { b.voidJob({ jobId: id, reason: 'because' }, CTX(null, { stepUp: { ok: true, at: 1 } })); }
  b.calls.length = 0;
  await a.ready();
  return a;
}

test('U19 card rows 1 to 10 render exactly their text and buttons', async () => {
  let a = setup({ billing: null });
  await a.ready();
  assert.equal(a.jobHtml(), '', 'row 1: no billing layer, nothing at all');
  a = setup({ session: SESSIONS.none });
  await a.ready();
  assert.equal(a.jobHtml(), '', 'row 2: no session');
  a = setup({ session: SESSIONS.staff });
  a.seedEstimate();
  await a.ready();
  let t = text(a.jobHtml());
  assert.match(t, /Billing for this job/);
  assert.match(t, /Waiting for approval/);
  assert.match(t, /Billing is done by the front desk or the Store Manager\./);
  assert.equal(/\d/.test(t.replace('Billing for this job', '')), false, 'row 3: staff see no digit: ' + t);
  assert.deepEqual(a.actionsIn(a.jobHtml()), [], 'row 3: no buttons for plain staff');
  a = setup({});
  a.h.currentJob = '';
  await a.ready();
  assert.match(text(a.jobHtml()), /Save this service order first\. Billing starts once it has a job number\./);
  assert.deepEqual(a.actionsIn(a.jobHtml()), []);
  a = setup({});
  a.h.currentJob = 'WS-9999';
  await a.ready();
  assert.match(text(a.jobHtml()), /That job number was not found\./);
  a = setup({});
  a.billing.forced.getJob = { ok: false, code: 'SESSION_REQUIRED' };
  await a.ready();
  assert.match(text(a.jobHtml()), /Your session could not be read/);
  assert.deepEqual(a.actionsIn(a.jobHtml()), ['svb-blocked-retry']);
  a = setup({ billingOpts: { status: { integrity: { ok: false, code: 'SVCS_CHAIN_BROKEN' } } } });
  await a.ready();
  assert.match(text(a.jobHtml()), /The billing records failed their check\. Posting is stopped\. Tell the Owner\./);
  assert.equal(a.actionsIn(a.jobHtml()).some((x) => /open$/.test(x)), false, 'row 7: no write button');
  a = await withState('voided');
  assert.match(text(a.jobHtml()), /This job was voided\. Reason:/);
  assert.equal(a.actionsIn(a.jobHtml()).some((x) => /open$/.test(x)), false, 'row 8');
  a = await withState('approved');
  a.h.past = true;
  await a.ui.refreshJob();
  await flush();
  assert.match(text(a.jobHtml()), /You are viewing a past date\. Billing cannot be changed\./);
  assert.equal(a.actionsIn(a.jobHtml()).some((x) => /open$/.test(x)), false, 'row 9: no write button');
  a = await withState('approved');
  assert.deepEqual(a.actionsIn(a.jobHtml()).includes('svb-job-bill-open'), true, 'row 10');
});

test('U20 chips, next-step sentences and primary buttons for every state', async () => {
  const table = [
    ['none', 'No estimate yet', 'Next: build the estimate from the parts and labour lists.', 'svb-job-estimate-open'],
    ['estimate', 'Waiting for approval', "Next: record the customer's approval.", 'svb-job-approval-open'],
    ['reapprove', 'New approval needed', 'The estimate went up. The customer must approve again.', 'svb-job-approval-open'],
    ['approved', 'Approved', 'Next: issue the bill when the work is done.', 'svb-job-bill-open'],
    ['billed', 'Bill issued', /^Next: take the balance of Rs [\d,]+\.\d\d\.$/, 'svb-job-balance-open'],
    ['billedNoCcpt', 'CCPT number missing', 'Add the CCPT invoice number.', 'svb-job-ccptno-open'],
    ['paid', 'Paid in full', 'Paid in full. You can deliver and close the job.', 'svb-job-print-bill'],
    ['cancelled', 'Bill cancelled', 'The bill was cancelled. Issue a new bill when ready.', 'svb-job-bill-open'],
    ['nocharge', 'No-charge warranty', 'No bill is made for this job. You can deliver and close it.', 'svb-job-print-nocharge']
  ];
  for (const [state, chip, next, primary] of table) {
    const a = await withState(state);
    const html = a.jobHtml();
    assert.ok(text(html).includes(chip), state + ' chip ' + chip + ' in ' + text(html).slice(0, 200));
    const nextText = text(html.match(/<div class="svb-next">(.*?)<\/div>/)[1]);
    if (next instanceof RegExp) assert.match(nextText, next, state); else assert.equal(nextText, next, state);
    const bar = html.match(/<div class="svb-primary-bar">(.*?)<\/div>/);
    assert.ok(bar && bar[1].includes('data-svcs-action="' + primary + '"'), state + ' primary ' + primary + ' in ' + (bar && bar[1]));
  }
  const v = await withState('voided');
  assert.ok(text(v.jobHtml()).includes('Voided'));
});

test('U21 buttons equal job.actions AND the rights, for roles and states', async () => {
  const states = ['none', 'estimate', 'approved', 'billed', 'paid', 'cancelled', 'nocharge'];
  const roles = [['owner', SESSIONS.owner], ['manager', SESSIONS.manager], ['desk', SESSIONS.desk]];
  let combos = 0;
  for (const state of states) {
    for (const [name, sess] of roles) {
      const a = await withState(state, { session: sess, billingOpts: { status: { config: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician'] } } } });
      const job = a.billing.getJob(a.h.currentJob, CTX(sess)).job;
      const ids = new Set(a.actionsIn(a.jobHtml()));
      const owner = name === 'owner';
      const mgr = name !== 'desk';
      const expect = {
        'svb-job-estimate-open': job.actions.buildEstimate,
        'svb-job-approval-open': job.actions.recordApproval,
        'svb-job-advance-open': job.actions.takeAdvance,
        'svb-job-bill-open': job.actions.issueBill,
        'svb-job-balance-open': job.actions.takeBalance,
        'svb-job-ncsheet-open': job.actions.markNoCharge && mgr,
        'svb-job-notccpt-open': job.actions.markNotBilledCcpt && owner,
        'svb-job-cancel-open': job.actions.cancelBill && owner,
        'svb-job-credit-open': job.actions.creditNote && owner,
        'svb-job-refund-open': job.actions.refundAdvance && owner,
        'svb-job-void-open': job.actions.voidJob && owner,
        'svb-job-nccancel-open': job.actions.cancelNoChargeSheet && owner,
        'svb-job-ccptno-open': job.actions.addCcptNo
      };
      for (const [id, want] of Object.entries(expect)) assert.equal(ids.has(id), !!want, state + '/' + name + ' ' + id);
      combos += 1;
    }
  }
  assert.ok(combos >= 21);
  const closed = setup({ cases: { 'WS-2026-001': { id: 'WS-2026-001', status: 'closed', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'cash', stub: false, label: 'WS-2026-001 Titan', voided: false, typedAdvancePaise: 0 } } });
  closed.seedBill();
  await closed.ready();
  const ids = closed.actionsIn(closed.jobHtml());
  assert.equal(ids.includes('svb-job-credit-open'), true);
  assert.equal(ids.includes('svb-job-estimate-open'), false, 'a billed job cannot change its estimate');
});

test('U22 the money strip is for desk, Store Manager and Owner only; plain staff see no digit', async () => {
  const cfg = { status: { config: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: [] } } };
  const desk = await withState('billed', Object.assign({ session: SESSIONS.desk }, { billingOpts: cfg.status ? cfg : undefined }));
  assert.ok(desk.jobHtml().includes('svb-money'));
  assert.match(text(desk.jobHtml()), /Rs [\d,]+\.\d\d/);
  const staff = await withState('billed', { session: SESSIONS.staff });
  assert.equal(staff.jobHtml().includes('svb-money'), false);
  assert.equal(/Rs |\d/.test(text(staff.jobHtml()).replace('Billing for this job', '')), false, text(staff.jobHtml()));
  assert.equal(staff.closeHtml(), '', 'no strip for plain staff');
});

test('U23 the card and the strip hold no input, select, textarea or form; every control is a button with an action', async () => {
  const a = await withState('billed');
  for (const html of [a.jobHtml(), a.closeHtml()]) {
    assert.equal(/<(input|select|textarea|form)\b/.test(html), false);
    const buttons = Array.from(html.matchAll(/<button\b[^>]*>/g)).map((m) => m[0]);
    assert.ok(buttons.length > 0);
    for (const b of buttons) assert.match(b, /data-svcs-action="svb-[a-z0-9-]+"/);
    assert.equal(/data-action=/.test(html), false);
  }
});

test('U24 the delivery strip: no bill, due, paid, no-charge, nothing for an untouched job; three notes follow card rows 7 to 9', async () => {
  let a = await withState('approved');
  assert.match(text(a.closeHtml()), /Billing at delivery No bill yet\. Issue the bill in Billing for this job \(step 7\)\./);
  await a.click('svb-job-goto-billing');
  assert.equal(a.h.calls.gotoBilling, 1);
  a = await withState('billed');
  assert.match(text(a.closeHtml()), /^Billing at delivery Bill SV\/2026-27\/0001: total Rs [\d,]+\.\d\d, paid Rs 0\.00, balance due Rs [\d,]+\.\d\d\./);
  assert.ok(a.closeHtml().includes('svb-job-balance-open') && a.closeHtml().includes('svb-job-print-bill'));
  a = await withState('paid');
  assert.match(text(a.closeHtml()), /paid in full\./);
  assert.equal(a.closeHtml().includes('svb-job-balance-open'), false);
  a = await withState('nocharge');
  assert.match(text(a.closeHtml()), /No-charge warranty job\. No bill is needed\./);
  assert.ok(a.closeHtml().includes('svb-job-print-nocharge'));
  a = setup({});
  await a.ready();
  assert.equal(a.closeHtml(), '', 'a job with no billing record at all: nothing to add');
  a = await withState('billed');
  a.h.past = true;
  await a.ui.refreshJob();
  await flush();
  assert.equal(a.closeHtml(), '', 'past view: strip hidden');
});

test('U25 refreshJob hands the old job sheet a model: off without an estimate, on with lines, advance and final amount; never in a past view', async () => {
  let a = setup({});
  await a.ready();
  assert.equal(a.h.calls.sync.length, 1);
  assert.deepEqual(a.h.calls.sync[0], { on: false, lines: [], advanceText: null, finalText: null, finalLocked: false, noCharge: false, hint: '' });
  a = await withState('billed');
  const s = a.h.calls.sync[a.h.calls.sync.length - 1];
  assert.equal(s.on, true);
  assert.equal(s.lines.length, 2);
  assert.match(s.lines[0].desc, /^Demo glass x 1$/);
  assert.equal(s.lines[0].amountText, '1180.00');
  assert.equal(s.lines[1].amountText, '354.00');
  assert.equal(s.advanceText, '0.00');
  assert.equal(s.finalText, '1534.00');
  assert.equal(s.finalLocked, true);
  const n = a.h.calls.sync.length;
  a.h.past = true;
  await a.ui.refreshJob();
  await flush();
  assert.equal(a.h.calls.sync.length, n, 'nothing sent in a past view');
});

test('U26 two overlapping refreshes: the later render wins', async () => {
  const a = await withState('approved');
  let release;
  const slow = new Promise((r) => { release = r; });
  const orig = a.billing.getJob;
  let n = 0;
  a.billing.getJob = function (...args) {
    n += 1;
    if (n === 1) return slow.then(() => ({ ok: true, job: { jobId: 'x', state: 'none', voided: false, actions: {}, receipts: [], heldPaise: 0, paidPaise: 0, duePaise: 0 } }));
    return orig.apply(a.billing, args);
  };
  const p1 = a.ui.refreshJob();
  const p2 = a.ui.refreshJob();
  await p2;
  release();
  await p1;
  await flush();
  assert.match(text(a.jobHtml()), /Approved/, 'the slower first answer must not overwrite the later one');
});

test('U27 an advance typed on the old form is not a receipt: a nudge, and Take advance is pre-filled', async () => {
  const a = setup({ cases: { 'WS-2026-001': { id: 'WS-2026-001', status: 'open', invoiceNo: '', paymentStatus: 'cash', stub: false, label: 'WS-2026-001 Titan', voided: false, typedAdvancePaise: 50000 } } });
  a.seedApproved();
  await a.ready();
  assert.match(text(a.jobHtml()), /An advance typed here is not a receipt\. Use Take advance to record it\./);
  await a.click('svb-job-advance-open');
  assert.equal(a.field('amount').value, '500.00');
});

test('U28 closeGate, allowsZeroFinal, jobBilled, jobNoCharge and blocksDelete fail closed', async () => {
  const a = await withState('billed');
  const id = a.h.currentJob;
  const due = a.billing.getJob(id, CTX()).job.duePaise;
  assert.deepEqual(JSON.parse(JSON.stringify(a.ui.closeGate(id))), { ok: false, message: 'Take the balance first: Rs 1,534.00 is still due on bill SV/2026-27/0001.' });
  assert.equal(due, 153400);
  assert.equal(a.ui.closeGate('WS-OTHER'), null, 'a job with no billing record closes the old way');
  const e = await withState('approved');
  assert.deepEqual(e.ui.closeGate(e.h.currentJob), null, 'legacy: no billing record yet');
  e.billing.state.jobs[e.h.currentJob].receipts.push({ no: 'SAR/26-27/0001', kind: 'SAR', amountPaise: 100, status: 'OK', payMode: 'Cash' });
  assert.equal(e.ui.closeGate(e.h.currentJob).message, 'Issue the bill first, or mark the job as no-charge warranty.');
  e.billing.forced.closeCheck = { ok: false, code: 'BILLING_BLOCKED' };
  assert.equal(e.ui.closeGate(e.h.currentJob).message, 'Billing could not be checked. Nothing was closed.');
  e.billing.forced.closeCheck = () => Promise.resolve({ ok: true });
  assert.equal(e.ui.closeGate(e.h.currentJob).ok, false, 'a promise is not an answer: fail closed');
  e.billing.forced.closeCheck = () => { throw new Error('boom'); };
  assert.equal(e.ui.closeGate(e.h.currentJob).ok, false);
  const p = await withState('paid');
  assert.equal(p.ui.closeGate(p.h.currentJob), null);
  const n = await withState('nocharge');
  assert.equal(n.ui.closeGate(n.h.currentJob), null);
  assert.equal(n.ui.allowsZeroFinal(n.h.currentJob), true);
  assert.equal(p.ui.allowsZeroFinal(p.h.currentJob), false);
  assert.equal(n.ui.jobNoCharge(n.h.currentJob), true);
  assert.equal(a.ui.jobBilled(id), true);
  assert.equal(n.ui.jobBilled(n.h.currentJob), false);
  const none = setup({ billing: null });
  none.mount();
  assert.equal(none.ui.closeGate('X'), null, 'no billing in this build: nothing to guard');
  assert.equal(none.ui.blocksDelete('X'), false);
  const d = await withState('billed');
  assert.equal(d.ui.blocksDelete(d.h.currentJob), true);
  assert.match(d.h.calls.toast.pop(), /has money or a bill on it\. Ask the Owner to void it instead of deleting it\./);
  assert.equal(d.ui.blocksDelete('WS-FREE'), false, 'has:false allows');
  d.billing.forced.jobHasRecords = { ok: true, has: 'maybe' };
  assert.equal(d.ui.blocksDelete('WS-FREE'), true, 'a non-boolean answer blocks');
  d.billing.forced.jobHasRecords = () => { throw new Error('x'); };
  assert.equal(d.ui.blocksDelete('WS-FREE'), true, 'a throw blocks');
  assert.match(d.h.calls.toast.pop(), /Could not check billing\. Nothing was deleted\./);
});

test('U29 taxInvoiceRoute: every route', async () => {
  const a = await withState('billed');
  const id = a.h.currentJob;
  assert.equal(a.ui.taxInvoiceRoute(id), true);
  await flush();
  assert.equal(a.h.calls.report.length, 1);
  assert.equal(a.h.calls.report[0].type, 'serviceBillSummary');
  assert.equal(a.h.calls.report[0].opts.invoiceNo, 'SV/2026-27/0001');
  const t = await withState('billed');
  t.billing.state.jobs[t.h.currentJob].bills[0].mode = 'NOT_IN_CCPT';
  assert.equal(t.ui.taxInvoiceRoute(t.h.currentJob), true);
  await flush();
  assert.equal(t.h.calls.report[0].type, 'serviceTaxInvoiceV2');
  const n = await withState('nocharge');
  assert.equal(n.ui.taxInvoiceRoute(n.h.currentJob), true);
  await flush();
  assert.equal(n.h.calls.report[0].type, 'serviceWarrantySheet');
  const i = await withState('approved');
  assert.equal(i.ui.taxInvoiceRoute(i.h.currentJob), true);
  await flush();
  assert.ok(i.layerHtml().includes('svb-bill-review') || i.layerHtml().includes('Loading'), 'the bill dialog opens');
  const l = await withState('approved');
  l.billing.state.routeOverride = { [l.h.currentJob]: 'legacy' };
  assert.equal(l.ui.taxInvoiceRoute(l.h.currentJob), false);
  l.billing.state.routeOverride = { [l.h.currentJob]: 'old_way_closed' };
  assert.equal(l.ui.taxInvoiceRoute(l.h.currentJob), true);
  assert.equal(l.h.calls.toast.pop(), 'This job was closed without a bill. CCPT issues the tax invoice. Use Proforma for a printout.');
  l.billing.forced.taxRoute = () => { throw new Error('boom'); };
  assert.equal(l.ui.taxInvoiceRoute(l.h.currentJob), true, 'a failing billing answer never falls back to the old allocator');
  const m = setup({ billing: null });
  m.mount();
  assert.equal(m.ui.taxInvoiceRoute('X'), false, 'no billing at all in this build');
});

test('U30 openApproval: approval form for an unapproved estimate, estimate builder when there is none, false for a closed job or no billing', async () => {
  let a = await withState('estimate');
  assert.equal(a.ui.openApproval(a.h.currentJob), true);
  await flush();
  assert.ok(a.layerHtml().includes('svb-appr-save'));
  a = setup({});
  await a.ready();
  assert.equal(a.ui.openApproval(a.h.currentJob), true);
  await flush();
  assert.ok(a.layerHtml().includes('svb-est-save'));
  a = setup({ cases: { 'WS-2026-001': { id: 'WS-2026-001', status: 'closed', invoiceNo: '', paymentStatus: 'cash', stub: false, label: 'WS', voided: false, typedAdvancePaise: 0 } } });
  await a.ready();
  assert.equal(a.ui.openApproval(a.h.currentJob), false);
  a = setup({ billing: null });
  a.mount();
  assert.equal(a.ui.openApproval('X'), false);
  a = setup({ session: SESSIONS.staff });
  a.seedEstimate();
  await a.ready();
  assert.equal(a.ui.openApproval(a.h.currentJob), true, 'refused, but handled: the old prompt never runs');
  assert.equal(a.h.calls.toast.pop(), 'Your role cannot do this. Ask the Store Manager or the Owner.');
  assert.equal(a.layerHtml(), '');
});
