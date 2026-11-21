// Test harness for www/service-billing-ui.js (Service wave 2, group ui).
// The fake DOM, sessions and helpers come from the Phase 1 harness (not edited). The billing facade is a FAKE built here
// from plan section 2.9: an in-memory implementation that records every call and every ctx, honours clientRef with
// replayed:true and can be told to refuse with any code. The REAL UI file and the REAL calc file run in a vm context.
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDocument, fire, flush, El, SESS, samplePart } from './svc1-ui-harness.mjs';

export { fire, flush, El, SESS, samplePart };
const here = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(here, '..', '..', 'www');
export const UI_PATH = path.join(WWW, 'service-billing-ui.js');
export const CALC_PATH = path.join(WWW, 'service-billing-calc.js');
export const UI_SOURCE = readFileSync(UI_PATH, 'utf8');
export const CALC_SOURCE = readFileSync(CALC_PATH, 'utf8');
export const CORE_PATH = path.join(WWW, 'service-billing-core.js');
export const REAL_CORE_EXISTS = existsSync(CORE_PATH);

/* one real calc instance in node (for the fake facade's arithmetic) */
const calcCtx = vm.createContext({ console, Object, Array, String, Number, Math, JSON, Date, RegExp, isFinite, parseInt, Error, Promise });
vm.runInContext(CALC_SOURCE, calcCtx);
export const calc = calcCtx.SaagarServiceBillingCalc;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export const SESSIONS = {
  owner: SESS.owner,
  manager: SESS.manager,
  staff: SESS.staff,
  tech: SESS.tech,
  none: SESS.none,
  desk: Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Desk' }),
  broken: Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' })
};

/* ------------------------------------------------------------------ catalogue used by the fake stores core and the fake facade */
export const PARTS = [
  { code: 'DEMO-P1', name: 'Demo glass', hsn: '9114', gstRateBp: 1800, sellPricePaise: 118000, priceIncludesTax: true, active: true, taxPending: false, onHand: 10 },
  { code: 'DEMO-P2', name: 'Demo strap', hsn: '9113', gstRateBp: 1200, sellPricePaise: 50000, priceIncludesTax: false, active: true, taxPending: false, onHand: 4 },
  { code: 'DEMO-P3', name: 'Demo no basis', hsn: '9114', gstRateBp: 1800, sellPricePaise: 20000, priceIncludesTax: null, active: true, taxPending: false, onHand: 4 },
  { code: 'DEMO-P4', name: 'Demo pending', hsn: '', gstRateBp: null, sellPricePaise: 9900, priceIncludesTax: null, active: true, taxPending: true, onHand: 2 },
  { code: 'DEMO-P5', name: 'Demo retired', hsn: '9114', gstRateBp: 1800, sellPricePaise: 9900, priceIncludesTax: true, active: false, taxPending: false, onHand: 0 }
];
export const LABOUR = [
  { code: 'DEMO-L1', name: 'Demo service', sac: '998719', gstRateBp: 1800, ratePaise: 30000, priceIncludesTax: false, active: true, taxPending: false },
  { code: 'DEMO-L2', name: 'Demo pending labour', sac: '', gstRateBp: null, ratePaise: 10000, priceIncludesTax: null, active: true, taxPending: true }
];
const basisOf = (v) => (v === true ? 'INCL' : (v === false ? 'EXCL' : 'EXCL'));

/* ------------------------------------------------------------------ the fake billing facade */
export function makeBilling(opts) {
  const o = opts || {};
  const st = {
    status: Object.assign({ ok: true, ready: true, blocked: false, billingBlocked: false, problems: [], fy: 'FY2026-27', config: { discountLimitPaise: 0, billingRoles: [], estimateRoles: ['Technician', 'Assistant Technician'] }, integrity: { ok: true, code: '' } }, o.status || {}),
    jobs: o.jobs || {},
    sales: o.sales || [],
    seq: { SV: 0, SCN: 0, SAR: 0, SRC: 0, SRF: 0 },
    done: {}, today: o.today || '2026-11-13'
  };
  const calls = [];
  const forced = {};
  const J = (id) => { if (!st.jobs[id]) st.jobs[id] = { estimate: null, approval: null, bills: [], receipts: [], refunds: [], credits: [], noCharge: null, voided: false }; return st.jobs[id]; };
  const nextNo = (code) => { st.seq[code] += 1; const n = String(st.seq[code]).padStart(4, '0'); return code === 'SV' ? 'SV/2026-27/' + n : code + '/26-27/' + n; };
  const b = { calls, state: st, forced, MESSAGES: { SOME_OTHER_CODE: 'A plain facade message.' } };
  b.names = () => calls.map((c) => c.name);
  b.last = (n) => { for (let i = calls.length - 1; i >= 0; i--) if (calls[i].name === n) return calls[i]; return null; };
  b.count = (n) => calls.filter((c) => c.name === n).length;
  b.writeCalls = () => calls.filter((c) => /^(saveEstimate|recordApproval|issueBill|addCcptNumber|cancelBill|issueCreditNote|returnCreditedStock|takeReceipt|takeCounterReceipt|refund|reverseReceipt|issueNoChargeSheet|cancelNoChargeSheet|voidJob)$/.test(c.name));
  const def = (name, fn) => {
    b[name] = function (...args) {
      calls.push({ name, args: clone(args.map((a) => (a === undefined ? null : a))) });
      if (forced[name]) { const f = forced[name]; return typeof f === 'function' ? f(...args) : f; }
      return fn(...args);
    };
  };
  const activeBill = (j) => j.bills.find((x) => x.status === 'ISSUED') || null;
  const live = (arr) => arr.filter((r) => r.status !== 'REVERSED');
  const held = (j) => live(j.receipts).filter((r) => r.kind === 'SAR').reduce((a, r) => a + r.amountPaise, 0);
  const paid = (j) => live(j.receipts).reduce((a, r) => a + r.amountPaise, 0) - j.refunds.reduce((a, r) => a + r.amountPaise, 0);
  const lineInput = (kind, code, qty, extra) => {
    if (kind === 'PART' || kind === 'LABOUR') {
      const m = (kind === 'PART' ? PARTS : LABOUR).find((x) => x.code === code);
      if (!m) return null;
      return { kind, code, name: m.name, hsnSac: kind === 'PART' ? m.hsn : m.sac, rateBp: m.gstRateBp, priceBasis: (extra && extra.priceBasis) || basisOf(m.priceIncludesTax), unitPricePaise: kind === 'PART' ? m.sellPricePaise : m.ratePaise, qty, discountPaise: (extra && extra.discountPaise) || 0, noCharge: false, ref: '' };
    }
    return { kind: 'OTHER', code: '', name: extra.name, hsnSac: extra.hsnSac, rateBp: extra.rateBp, priceBasis: extra.priceBasis, unitPricePaise: extra.unitPricePaise, qty, discountPaise: extra.discountPaise || 0, noCharge: false, ref: '' };
  };
  const compute = (lines, billDiscountPaise, rec) => calc.computeBill({ lines, billDiscountPaise: billDiscountPaise || 0, sellerStateCode: '27', recipientStateCode: (rec && rec.recipientStateCode) || '27', recipientGstin: (rec && rec.recipientGstin) || '' });
  const estimateOf = (j) => j.estimate;
  const dueOf = (j) => { const bill = activeBill(j); if (!bill) return 0; return Math.max(0, bill.totalPaise - Math.min(bill.setOffPaise, bill.totalPaise) - live(j.receipts).filter((r) => r.kind === 'SRC').reduce((a, r) => a + r.amountPaise, 0)); };
  const stateOf = (j) => {
    if (j.voided) return 'voided';
    if (j.noCharge) return 'no_charge';
    const bill = activeBill(j);
    if (bill) return dueOf(j) > 0 ? 'billed' : 'paid';
    if (j.bills.length && !bill) return 'cancelled';
    if (!j.estimate) return 'none';
    if (j.approval && j.approval.amountPaise >= j.estimate.totalPaise) return 'approved';
    return 'estimate';
  };
  const view = (id) => {
    const j = J(id);
    const bill = activeBill(j);
    const s = stateOf(j);
    const outstandingBill = !!bill;
    return {
      jobId: id, state: s, voided: j.voided, noCharge: j.noCharge,
      estimate: j.estimate, approval: j.approval, bill: bill ? clone(bill) : (j.bills.length ? clone(j.bills[j.bills.length - 1]) : null),
      receipts: clone(j.receipts), refunds: clone(j.refunds), creditNotes: clone(j.credits), pendingReturns: clone(j.pending || []),
      heldPaise: held(j), paidPaise: paid(j), duePaise: dueOf(j), refundablePaise: Math.max(0, paid(j)), legacyTypedPaise: 0,
      actions: {
        buildEstimate: !outstandingBill && !j.voided && !j.noCharge, recordApproval: !!j.estimate && s === 'estimate', takeAdvance: !outstandingBill && !j.voided,
        issueBill: !outstandingBill && !j.voided && !j.noCharge && !!j.estimate && (s === 'approved' || s === 'cancelled'), takeBalance: outstandingBill && dueOf(j) > 0,
        cancelBill: outstandingBill, creditNote: outstandingBill, refundAdvance: held(j) > 0 && !j.voided, voidJob: !j.voided, markNoCharge: !outstandingBill && !j.voided && !j.noCharge,
        markNotBilledCcpt: !outstandingBill && !j.voided, addCcptNo: outstandingBill && !bill.ccptInvoiceNo && bill.mode === 'CCPT_BILLED', changeCcptNo: outstandingBill && !!bill.ccptInvoiceNo, cancelNoChargeSheet: !!j.noCharge
      }
    };
  };
  const replay = (ctx, key) => { const ref = ctx && ctx.clientRef; if (!ref) return null; const k = key + ':' + ref; return st.done[k] || null; };
  const remember = (ctx, key, r) => { if (ctx && ctx.clientRef) st.done[key + ':' + ctx.clientRef] = r; return r; };
  const needSession = (ctx) => (ctx && ctx.session && ctx.session.ok === true ? null : { ok: false, code: 'SESSION_REQUIRED' });

  def('status', () => clone(st.status));
  def('can', () => ({ ok: true, needsPin: false }));
  def('getJob', (id, ctx) => { const n = needSession(ctx); return n || { ok: true, job: view(id) }; });
  def('estimateView', (id) => ({ ok: true, latest: J(id).estimate }));
  def('saveEstimate', (d, ctx) => {
    const rp = replay(ctx, 'est'); if (rp) return Object.assign({ replayed: true }, rp);
    const j = J(d.jobId);
    const lines = [];
    for (const l of d.lines) {
      const li = lineInput(l.kind, l.code, l.qty, l);
      if (!li) return { ok: false, code: l.kind === 'LABOUR' ? 'LABOUR_UNKNOWN' : 'PART_UNKNOWN' };
      if ((l.kind === 'PART' || l.kind === 'LABOUR') && (PARTS.concat(LABOUR).find((x) => x.code === l.code) || {}).taxPending) return { ok: false, code: 'TAX_DETAILS_MISSING' };
      lines.push(li);
    }
    const r = compute(lines, 0);
    if (!r.ok) return { ok: false, code: r.code };
    const version = j.estimate ? j.estimate.version + 1 : 1;
    j.estimate = { version, totalPaise: r.totals.totalPaise, lines: r.lines.map((x) => ({ kind: x.kind, code: x.code, name: x.name, qty: x.qty, hsnSac: x.hsnSac, rateBp: x.rateBp, priceBasis: x.priceBasis, unitPricePaise: x.unitPricePaise, totalPaise: x.totalPaise })) };
    return remember(ctx, 'est', { ok: true, estimate: clone(j.estimate), needsApproval: !(j.approval && j.approval.amountPaise >= j.estimate.totalPaise) });
  });
  def('recordApproval', (d, ctx) => {
    const rp = replay(ctx, 'appr'); if (rp) return Object.assign({ replayed: true }, rp);
    const j = J(d.jobId);
    j.approval = { version: d.version, amountPaise: d.amountPaise, method: d.method, takenBy: { name: d.takenByName }, approvedAt: d.approvedAt };
    return remember(ctx, 'appr', { ok: true, approval: clone(j.approval) });
  });
  def('prepareBill', (id) => {
    const j = J(id);
    if (!j.estimate) return { ok: false, code: 'NO_APPROVAL' };
    const parts = [];
    const labour = [];
    for (const l of j.estimate.lines) {
      if (l.kind === 'PART') parts.push({ partCode: l.code, name: l.name, qty: l.qty, discountPaise: 0, unitPricePaise: l.unitPricePaise });
      else if (l.kind === 'LABOUR') labour.push({ code: l.code, name: l.name, qty: l.qty, discountPaise: 0, unitPricePaise: l.unitPricePaise });
    }
    // Stage E (D-gaps-1): the real bill layer (docs prepareInvoice) answers with the lines under `input`, not `draft`
    if (o.realShape) return { ok: true, input: { jobId: id, parts, labour, other: [], billDiscountPaise: 0, discountReason: '', mode: 'CCPT_BILLED', notInCcptReason: '', ccptInvoiceNo: '', approvalOverrideReason: '', note: '', recipientGstin: '', recipientStateCode: '' }, estimate: {}, warrantyParts: [], advanceHeldPaise: 0, locked: false, noCharge: false, warnings: [] };
    return { ok: true, draft: { jobId: id, parts, labour, other: [], billDiscountPaise: 0 }, leftOff: o.leftOff || [], notOnEstimate: o.notOnEstimate || [] };
  });
  const previewOf = (d) => {
    const lines = [];
    for (const p of d.parts) lines.push(lineInput('PART', p.partCode, p.qty, { discountPaise: p.discountPaise }));
    for (const l of d.labour) lines.push(lineInput('LABOUR', l.code, l.qty, { discountPaise: l.discountPaise }));
    for (const x of d.other) lines.push(lineInput('OTHER', '', x.qty, x));
    const r = compute(lines.filter(Boolean), d.billDiscountPaise, d);
    if (!r.ok) return { ok: false, code: r.code };
    const j = J(d.jobId);
    const adv = Math.min(held(j), r.totals.totalPaise);
    return { ok: true, lines: r.lines, totals: r.totals, discount: null, setOff: { advancePaise: adv, receipts: [] }, balanceDuePaise: r.totals.totalPaise - adv, warnings: [], _full: r };
  };
  def('previewBill', (d, ctx) => previewOf(d));
  def('issueBill', (d, ctx) => {
    const rp = replay(ctx, 'bill'); if (rp) return Object.assign({ replayed: true }, rp);
    const n = needSession(ctx); if (n) return n;
    const j = J(d.jobId);
    const pv = previewOf(d);
    if (!pv.ok) return pv;
    const sum = d.parts.concat(d.labour, d.other).reduce((a, x) => a + (x.discountPaise || 0), 0) + (d.billDiscountPaise || 0);
    if (sum > st.status.config.discountLimitPaise && !(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'ABOVE_MANAGER_LIMIT' };
    if (d.mode === 'NOT_IN_CCPT' && !(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'PIN_REQUIRED' };
    if (j.estimate && j.approval && pv.totals.totalPaise > j.approval.amountPaise && !d.approvalOverrideReason) return { ok: false, code: 'REAPPROVAL_REQUIRED' };
    const bill = { no: nextNo('SV'), at: st.today + 'T05:30:00.000Z', docDate: st.today, jobId: d.jobId, mode: d.mode, ccptInvoiceNo: d.ccptInvoiceNo, totalPaise: pv.totals.totalPaise, discountPaise: sum, setOffPaise: pv.setOff.advancePaise, status: 'ISSUED', bill: clone(pv._full) };
    j.bills.push(bill);
    return remember(ctx, 'bill', { ok: true, invoice: clone(bill), balanceDuePaise: pv.balanceDuePaise });
  });
  def('addCcptNumber', (d, ctx) => { const j = J(Object.keys(st.jobs).find((k) => st.jobs[k].bills.some((x) => x.no === d.invoiceNo))); const bill = j.bills.find((x) => x.no === d.invoiceNo); if (st.dupCcpt) return { ok: false, code: 'DUPLICATE_CCPT_INVOICE' }; bill.ccptInvoiceNo = d.ccptInvoiceNo; return { ok: true, invoice: clone(bill) }; });
  def('cancelBill', (d0, ctx) => {
    const no = d0.invoiceNo;
    const id = Object.keys(st.jobs).find((k) => st.jobs[k].bills.some((x) => x.no === no));
    if (!id) return { ok: false, code: 'DOC_NOT_FOUND' };
    const bill = st.jobs[id].bills.find((x) => x.no === no);
    if (!(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'PIN_REQUIRED' };
    bill.status = 'CANCELLED';
    return { ok: true, invoice: clone(bill) };
  });
  def('getBill', (no) => {
    const id = Object.keys(st.jobs).find((k) => st.jobs[k].bills.some((x) => x.no === no));
    if (!id) return { ok: false, code: 'DOC_NOT_FOUND' };
    const bill = st.jobs[id].bills.find((x) => x.no === no);
    return { ok: true, invoice: Object.assign(clone(bill), { credits: clone(st.jobs[id].credits), creditedPaise: st.jobs[id].credits.reduce((a, c) => a + c.totalPaise, 0) }) };
  });
  def('issueCreditNote', (d, ctx) => {
    const rp = replay(ctx, 'cn'); if (rp) return Object.assign({ replayed: true }, rp);
    const id = Object.keys(st.jobs).find((k) => st.jobs[k].bills.some((x) => x.no === d.invoiceNo));
    if (!id) return { ok: false, code: 'DOC_NOT_FOUND' };
    if (!(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'PIN_REQUIRED' };
    const j = st.jobs[id];
    const bill = j.bills.find((x) => x.no === d.invoiceNo);
    const cr = calc.computeCreditNote(bill.bill, d.request, j.credits.map((c) => c.credit));
    if (!cr.ok) return { ok: false, code: cr.code };
    const cn = { no: nextNo('SCN'), totalPaise: cr.totalPaise, credit: cr };
    j.credits.push(cn);
    const out = { ok: true, creditNote: clone({ no: cn.no, totalPaise: cn.totalPaise }), refund: null };
    if (d.refund) { const rf = { no: nextNo('SRF'), kind: 'SRF', amountPaise: d.refund.amountPaise, payMode: d.refund.payMode, docDate: st.today }; j.refunds.push(rf); out.refund = clone(rf); }
    return remember(ctx, 'cn', out);
  });
  const addReceipt = (id, kind, d, ctx) => {
    const n = needSession(ctx); if (n) return n;
    const j = J(id);
    const rc = { no: nextNo(kind), kind, docDate: st.today, amountPaise: d.amountPaise, payMode: d.payMode, payRef: d.payRef, status: 'OK' };
    j.receipts.push(rc);
    return { ok: true, receipt: clone(rc), posted: o.posted === undefined ? true : o.posted };
  };
  def('takeReceipt', (d, ctx) => {
    const rp = replay(ctx, 'rc'); if (rp) return Object.assign({ replayed: true }, rp);
    const j = J(d.jobId);
    if (d.kind === 'balance' && d.amountPaise > dueOf(j)) return { ok: false, code: 'RECEIPT_EXCEEDS_BALANCE' };
    return remember(ctx, 'rc', addReceipt(d.jobId, d.kind === 'balance' ? 'SRC' : 'SAR', d, ctx));
  });
  // A-UI audit: same-day reversal of a receipt (Manager or Owner) or a refund (Owner PIN), as plan 2.11 and the real money layer.
  def('reverseReceipt', (d, ctx) => {
    const rp = replay(ctx, 'rv'); if (rp) return Object.assign({ replayed: true }, rp);
    const n = needSession(ctx); if (n) return n;
    for (const id of Object.keys(st.jobs)) {
      const j = st.jobs[id];
      const row = j.receipts.concat(j.refunds).find((r) => r.no === d.no);
      if (!row) continue;
      if (row.status === 'REVERSED') return { ok: false, code: 'ALREADY_REVERSED' };
      if (String(d.no).indexOf('SRF') === 0 && !(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'PIN_REQUIRED' };
      row.status = 'REVERSED';
      return remember(ctx, 'rv', { ok: true, reversal: { no: 'RRV/26-27/0001', reverses: d.no, reason: d.reason } });
    }
    return { ok: false, code: 'RECEIPT_NOT_FOUND' };
  });
  def('takeCounterReceipt', (d, ctx) => {
    const rp = replay(ctx, 'crc'); if (rp) return Object.assign({ replayed: true }, rp);
    const sale = st.sales.find((s) => s.no === d.saleNo);
    if (!sale) return { ok: false, code: 'NOT_RECEIPTABLE' };
    sale.state = 'RECEIPTED';
    return remember(ctx, 'crc', addReceipt('__counter__', 'SRC', d, ctx));
  });
  def('unreceiptedCounterSales', () => ({ ok: true, rows: clone(st.sales.filter((s) => s.state !== 'RECEIPTED')) }));
  def('refund', (d, ctx) => {
    const rp = replay(ctx, 'rf'); if (rp) return Object.assign({ replayed: true }, rp);
    if (!(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'PIN_REQUIRED' };
    const j = J(d.jobId);
    if (d.amountPaise > Math.max(0, paid(j))) return { ok: false, code: 'REFUND_EXCEEDS_REFUNDABLE' };
    const rf = { no: nextNo('SRF'), kind: 'SRF', amountPaise: d.amountPaise, payMode: d.payMode, docDate: st.today };
    j.refunds.push(rf);
    return remember(ctx, 'rf', { ok: true, refund: clone(rf) });
  });
  def('issueNoChargeSheet', (d, ctx) => {
    const j = J(d.jobId);
    if (activeBill(j) || held(j) > 0) return { ok: false, code: 'NO_CHARGE_CONFLICT' };
    j.noCharge = { on: true, id: 'REC-NC-' + d.jobId };
    return { ok: true, sheet: clone(j.noCharge) };
  });
  def('cancelNoChargeSheet', (d0, ctx) => {
    const id = d0.sheetId; const k = Object.keys(st.jobs).find((x) => st.jobs[x].noCharge && st.jobs[x].noCharge.id === id); if (!k) return { ok: false, code: 'DOC_NOT_FOUND' }; st.jobs[k].noCharge = null; return { ok: true }; });
  // Stage E round 2 (A): put back in stock what a credit note took back (the real one makes one Phase 1 return naming the note)
  def('returnCreditedStock', (d0) => {
    const j = Object.values(st.jobs).find((x) => (x.pending || []).some((p) => p.cnNo === d0.cnNo));
    if (!j) return { ok: false, code: 'CREDIT_RETURN_INVALID', message: 'These parts cannot be returned against this credit note.' };
    j.pending = j.pending.filter((p) => p.cnNo !== d0.cnNo);
    return { ok: true, doc: { creditNoteNo: d0.cnNo } };
  });
  def('voidJob', (d0, ctx) => { if (!(ctx.stepUp && ctx.stepUp.ok)) return { ok: false, code: 'PIN_REQUIRED' }; J(d0.jobId).voided = true; return { ok: true }; });
  def('printData', (type, args) => ({ ok: true, svcData: { type, args } }));
  /* SYNC questions */
  def('jobHasRecords', (id) => { const j = st.jobs[id]; return { ok: true, has: !!j && (j.bills.length > 0 || j.receipts.length > 0 || !!j.approval || j.voided || !!j.noCharge) }; });
  def('closeCheck', (id) => {
    const j = st.jobs[id];
    if (!j || (!j.bills.length && !j.receipts.length && !j.noCharge && !j.voided)) return { ok: true, legacy: true, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: false };
    const bill = activeBill(j);
    if (j.noCharge) return { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: true };
    if (bill && dueOf(j) === 0) return { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: bill.no, noCharge: false };
    if (bill) return { ok: true, legacy: false, mayClose: false, why: 'BALANCE_DUE', dueNowPaise: dueOf(j), billNo: bill.no, noCharge: false };
    return { ok: true, legacy: false, mayClose: false, why: 'NO_BILL', dueNowPaise: 0, billNo: '', noCharge: false };
  });
  def('taxRoute', (id) => {
    const j = st.jobs[id];
    const bill = j ? activeBill(j) : null;
    if (st.routeOverride && st.routeOverride[id]) return { ok: true, route: st.routeOverride[id] };
    if (j && j.noCharge) return { ok: true, route: 'no_charge' };
    if (bill) return { ok: true, route: bill.mode === 'NOT_IN_CCPT' ? 'tax_invoice' : 'summary' };
    return { ok: true, route: 'issue' };
  });
  def('jobBilled', (id) => ({ ok: true, billed: !!(st.jobs[id] && activeBill(st.jobs[id])) }));
  def('jobNoCharge', (id) => ({ ok: true, noCharge: !!(st.jobs[id] && st.jobs[id].noCharge) }));
  def('activeInvoiceNo', (id) => { const bl = st.jobs[id] && activeBill(st.jobs[id]); return bl ? bl.no : ''; });
  return b;
}

/* ------------------------------------------------------------------ fake Stores core (masters and parts) */
export function makeStoresCore(o) {
  const calls = [];
  const c = { calls };
  const rowsFor = (list, q) => {
    const text = String((q && q.text) || '').toLowerCase();
    return list.filter((x) => (!text || x.code.toLowerCase().includes(text) || x.name.toLowerCase().includes(text)));
  };
  c.listParts = (q) => { calls.push({ name: 'listParts', q: clone(q) }); return { ok: true, rows: clone(rowsFor(PARTS, q)), total: PARTS.length }; };
  c.listLabour = (q) => { calls.push({ name: 'listLabour', q: clone(q) }); return { ok: true, rows: clone(rowsFor(LABOUR, q)), total: LABOUR.length }; };
  c.jobParts = (id) => { calls.push({ name: 'jobParts', id }); return (o && o.jobParts) || { ok: true, rows: [], totalNet: 0 }; };
  return c;
}

/* ------------------------------------------------------------------ host + UI loader */
export function loadUi(opts) {
  const o = opts || {};
  const doc = makeDocument();
  const sandbox = { document: doc, window: null, console, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp, parseInt, parseFloat, isFinite, Error };
  sandbox.window = doc.defaultView;
  vm.createContext(sandbox);
  if (o.calc !== false) vm.runInContext(CALC_SOURCE, sandbox, { filename: 'service-billing-calc.js' });
  vm.runInContext(UI_SOURCE, sandbox, { filename: 'service-billing-ui.js' });
  return { sandbox, doc, ui: sandbox.SaagarServiceBillingUI };
}

export function makeHost(doc, opts) {
  const o = opts || {};
  const root = new El(doc, 'div');
  root.attrs = { id: 'svb-root', class: 'svs-wrap svb-wrap' };
  const view = new El(doc, 'div');
  view.attrs = { class: 'view active', id: 'view-billing' };
  view.appendChild(root);
  const formView = new El(doc, 'div');
  formView.attrs = { class: 'view active', id: 'view-form' };
  const jobHost = new El(doc, 'div');
  jobHost.attrs = { id: 'svb-job-host', class: 'svb-job-host' };
  const closeHost = new El(doc, 'div');
  closeHost.attrs = { id: 'svb-close-host', class: 'svb-close-host' };
  formView.appendChild(jobHost);
  formView.appendChild(closeHost);
  const header = new El(doc, 'div');
  header.attrs = { class: 'header-right' };
  const storesBtn = new El(doc, 'button');
  storesBtn.attrs = { 'data-svcs-action': 'svs-open-stores', class: 'btn btn-ghost svs-open-btn' };
  const newBtn = new El(doc, 'button');
  newBtn.attrs = { 'data-action': 'new-service-order', class: 'btn btn-primary' };
  header.appendChild(storesBtn);
  header.appendChild(newBtn);
  doc.body.appendChild(header);
  doc.body.appendChild(view);
  doc.body.appendChild(formView);

  const calls = { toast: [], reauth: [], report: [], print: [], sync: [], legacyApproval: [], legacyInvoice: [], legacyVoid: [], gotoBilling: 0, showStores: 0, showBilling: 0, job: [] };
  const h = {
    el: { view, root, formView, jobHost, closeHost, header, storesBtn, newBtn },
    calls,
    session: o.session || SESSIONS.owner,
    past: false,
    reauthResult: true,
    cases: o.cases || { 'WS-2026-001': { id: 'WS-2026-001', status: 'open', invoiceNo: '', paymentStatus: 'cash', stub: false, label: 'WS-2026-001 Titan Edge', voided: false, typedAdvancePaise: 0 } },
    currentJob: 'WS-2026-001',
    billing: o.billing === undefined ? makeBilling(o.billingOpts) : o.billing,
    storesCore: o.storesCore === undefined ? makeStoresCore(o.storesOpts) : o.storesCore,
    reportApi: o.report === undefined ? { preview(type, opts2) { calls.report.push({ type, opts: opts2 }); } } : o.report,
    now: '2026-11-13T05:30:00.000Z',
    today: '2026-11-13'
  };
  h.host = {
    root, jobHost, closeHost,
    session: () => (typeof h.session === 'function' ? h.session() : h.session),
    reauth: (label) => { calls.reauth.push(label); return typeof h.reauthResult === 'function' ? h.reauthResult(label) : Promise.resolve(h.reauthResult); },
    isPast: () => h.past,
    viewDate: () => h.today,
    today: () => h.today,
    nowIso: () => h.now,
    toast: (m) => calls.toast.push(m),
    job: (id) => { calls.job.push(id); return h.cases[id] ? JSON.parse(JSON.stringify(h.cases[id])) : null; },
    currentJobId: () => h.currentJob,
    jobIds: () => Object.keys(h.cases),
    openJob: () => {},
    showCases: () => {},
    showStores: () => { calls.showStores += 1; },
    showBilling: () => { calls.showBilling += 1; },
    gotoBilling: () => { calls.gotoBilling += 1; },
    core: () => h.storesCore,
    billing: () => h.billing,
    report: () => h.reportApi,
    syncLegacy: (m) => { calls.sync.push(JSON.parse(JSON.stringify(m))); },
    setLegacyApproval: (id, rec) => { if (h.legacyFails) throw new Error('legacy write failed'); calls.legacyApproval.push({ id, rec: JSON.parse(JSON.stringify(rec)) }); },
    setLegacyInvoiceNo: (id, no) => { calls.legacyInvoice.push({ id, no }); },
    legacyVoid: (id, rec) => { calls.legacyVoid.push({ id, rec: JSON.parse(JSON.stringify(rec)) }); }
  };
  if (o.print) h.host.print = (type, args) => { calls.print.push({ type, args: JSON.parse(JSON.stringify(args)) }); return Promise.resolve({ ok: true }); };
  return h;
}

export function setup(opts) {
  const o = opts || {};
  const { sandbox, doc, ui } = loadUi(o);
  const h = makeHost(doc, o);
  const api = {
    doc, ui, h, host: h.host, billing: h.billing, sandbox,
    mount() { return ui.mount(h.host); },
    async ready() { api.mount(); await flush(); await ui.refreshJob(); await flush(); },
    layer() { return doc.body.childNodes.find((c) => c instanceof El && c.id === 'svb-layer') || null; },
    layerHtml() { const l = api.layer(); return l ? l.innerHTML : ''; },
    jobHtml() { return h.el.jobHost.innerHTML; },
    closeHtml() { return h.el.closeHost.innerHTML; },
    find(action, key) {
      const where = [api.layer(), h.el.jobHost, h.el.closeHost, h.el.root, h.el.header];
      for (const w of where) {
        if (!w) continue;
        const hit = w.querySelectorAll('[data-svcs-action="' + action + '"]').find((e) => key === undefined || e.getAttribute('data-svs-key') === String(key));
        if (hit) return hit;
      }
      return null;
    },
    async click(action, key) {
      const el = api.find(action, key);
      if (!el) throw new Error('no control ' + action + (key !== undefined ? ' key ' + key : ''));
      const ev = fire(doc, el, 'click');
      await flush();
      return ev;
    },
    field(name, line) {
      const l = api.layer();
      if (!l) return null;
      const hits = l.querySelectorAll('[data-svs-field="' + name + '"]').filter((e) => line === undefined || e.getAttribute('data-svs-line') === String(line));
      return hits[0] || null;
    },
    async type(name, value, line) {
      const el = api.field(name, line);
      if (!el) throw new Error('no field ' + name);
      el.value = value;
      fire(doc, el, 'input');
      await flush();
      return el;
    },
    async setSelect(name, value, line) {
      const el = api.field(name, line);
      if (!el) throw new Error('no select ' + name);
      el.value = value;
      fire(doc, el, 'change');
      await flush();
      return el;
    },
    async check(name, on, line) {
      const el = api.field(name, line);
      if (!el) throw new Error('no check ' + name);
      el.checked = on;
      fire(doc, el, 'change');
      await flush();
      return el;
    },
    async key(el, key, props) { const ev = fire(doc, el, 'keydown', Object.assign({ key }, props || {})); await flush(); return ev; },
    actionsIn(html) { return Array.from(html.matchAll(/data-svcs-action="([^"]+)"/g)).map((m) => m[1]); },
    /* seed an approved estimate on the job through the fake facade (no UI) */
    seedEstimate(jobId, lines) {
      const id = jobId || h.currentJob;
      const r = h.billing.saveEstimate({ jobId: id, lines: lines || [{ kind: 'PART', code: 'DEMO-P1', qty: 1 }, { kind: 'LABOUR', code: 'DEMO-L1', qty: 1 }], note: '', reason: '' }, { session: SESSIONS.owner, clientRef: 'seed-e-' + id });
      h.billing.calls.length = 0;
      return r;
    },
    seedApproved(jobId, lines) {
      const id = jobId || h.currentJob;
      const r = api.seedEstimate(id, lines);
      h.billing.recordApproval({ jobId: id, version: 1, method: 'CALL', takenByName: 'Seed', approvedAt: '2026-11-13T04:00:00.000Z', evidence: '', amountPaise: r.estimate.totalPaise, note: '' }, { session: SESSIONS.owner, clientRef: 'seed-a-' + id });
      h.billing.calls.length = 0;
      return r.estimate;
    },
    seedBill(jobId, over) {
      const id = jobId || h.currentJob;
      const est = api.seedApproved(id);
      const r = h.billing.issueBill(Object.assign({ jobId: id, parts: [{ partCode: 'DEMO-P1', qty: 1, discountPaise: 0 }], labour: [{ code: 'DEMO-L1', qty: 1, discountPaise: 0 }], other: [], billDiscountPaise: 0, discountReason: '', recipientGstin: '', recipientStateCode: '27', mode: 'CCPT_BILLED', notInCcptReason: '', ccptInvoiceNo: 'C-9001', approvalOverrideReason: '', note: '' }, over || {}), { session: SESSIONS.owner, stepUp: { ok: true, at: 1 }, clientRef: 'seed-b-' + id });
      h.billing.calls.length = 0;
      return { est, bill: r.invoice };
    }
  };
  return api;
}
