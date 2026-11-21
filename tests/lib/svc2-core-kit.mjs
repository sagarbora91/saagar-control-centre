// tests/lib/svc2-core-kit.mjs
// Helpers for the billing core facade tests (www/service-billing-core.js). Invented data only: no customer name,
// mobile number, GSTIN or PAN anywhere. The Owner PIN is never typed: a step-up stamp is made by hand.
// The REAL store, FIFO, masters, Phase 1 docs and Phase 1 core (with its `share` hook), the REAL calc and money run here.
// The bill layer (service-billing-docs.js) is a stand-in written to the plan's contract (2.7) until the real file is
// finished; `realDocs()` returns the real file when it loads, so the same tests can run on it.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Store, Fifo, Masters, Docs, makeClock, makeAdapter, partInput } from './svc1-docs-env.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
export const WWW = path.resolve(here, '..', '..', 'www');
export const CORE_FILE = path.join(WWW, 'service-billing-core.js');
export const BillingCore = require('../../www/service-billing-core.js');
export const Calc = require('../../www/service-billing-calc.js');
export const Money = require('../../www/service-billing-money.js');
export const StoresCore = require('../../www/service-stores-core.js');
export { Store, Fifo, Masters, Docs, makeClock, makeAdapter, partInput };

export function realDocs() {
  try {
    const d = require('../../www/service-billing-docs.js');
    return d && typeof d.create === 'function' ? d : null;
  } catch (e) {
    return null;
  }
}
export function realMigrate() {
  try {
    const d = require('../../www/service-billing-migrate.js');
    return d && typeof d.create === 'function' ? d : null;
  } catch (e) {
    return null;
  }
}

const sess = (tier, role, name) => Object.freeze({ ok: true, tier, role, actorName: name, isOwner: tier === 'owner', isManager: tier === 'manager' });
export const OWNER = sess('owner', 'Owner', 'Test Owner');
export const MANAGER = sess('manager', 'Store Manager', 'Test Manager');
export const DESK = sess('staff', 'Cashier', 'Test Cashier');
export const TECH = sess('staff', 'Technician', 'Test Tech');
export const TRAINEE = sess('staff', 'Trainee', 'Test Trainee');
export const NONE = Object.freeze({ ok: false, tier: 'none', role: '', actorName: '', isOwner: false, isManager: false });

export const PART_LINE = {
  kind: 'PART', code: 'P-1', name: 'Battery', hsnSac: '8506', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 25000, qty: 1,
  discountPaise: 0, noCharge: false, ref: ''
};
export const LABOUR_LINE = {
  kind: 'LABOUR', code: 'L-1', name: 'Service', hsnSac: '9987', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 100000, qty: 1,
  discountPaise: 0, noCharge: false, ref: ''
};
// The bill of PART_LINE + LABOUR_LINE, by hand: taxable 25000 + 100000 = 125000, GST 18% = 22500, total 147500.
export const BILL_TOTAL = 147500;

const istDay = (ms) => new Date(ms + 19800000).toISOString().slice(0, 10);

// A stand-in for the bill layer, written to the plan's contract (2.7). It keeps its own records in memory and logs every call.
export function makeFakeDocs(opts = {}) {
  const lib = {
    version: 1,
    calls: [],
    deps: null,
    openCalls: 0,
    state: {
      invoices: [], notes: [], estimates: new Map(), sheets: new Map(), voided: new Set(), newWay: new Set(),
      cfg: Object.assign({ discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician'] }, opts.cfg || {}),
      throwOn: new Set(), failAll: false, blocked: false, seq: 0, setOff: new Map()
    },
    validateLegacyBody() { return { ok: true }; },
    // The role lists live in the real `invoices` stream (as BCFG_SET), where the money layer reads them.
    writeConfig(store, cfg) {
      const h = store.head('invoices');
      assert.equal(h.ok, true, JSON.stringify(h));
      const r = store.append('invoices', [{ k: 'BCFG_SET', b: { discountLimitPaise: cfg.discountLimitPaise, billingRoles: cfg.billingRoles, estimateRoles: cfg.estimateRoles } }], {
        expectRev: h.rev, actor: { t: 'owner', r: 'Owner', m: 'Test Owner' }
      });
      assert.equal(r.ok, true, JSON.stringify(r));
    },
    create(deps) {
      lib.deps = deps;
      const S = lib.state;
      const log = (method, args) => { lib.calls.push({ method, args }); if (S.throwOn.has(method)) throw new Error('fake ' + method); };
      const today = () => istDay(deps.now().getTime());
      const sessionOk = (ctx) => !!(ctx && ctx.session && ctx.session.ok === true);
      const view = (v) => JSON.parse(JSON.stringify(v));
      const noteTotal = (inv) => S.notes.filter((n) => n.invoiceNo === inv.no).reduce((a, n) => a + n.credit.totalPaise, 0);
      const withCredit = (inv) => Object.assign({}, inv, { creditedPaise: noteTotal(inv), state: inv.cancel ? 'CANCELLED' : 'ISSUED' });
      const api = {
        open() { lib.openCalls += 1; return S.blocked ? { ok: false, blocked: true, problems: ['FAKE'] } : { ok: true, blocked: false, problems: [] }; },
        status() { return { ok: !S.blocked, opened: true, blocked: S.blocked, problems: [] }; },
        config() { log('config', []); return Object.assign({ ok: true }, S.cfg); },
        setBillingConfig(patch, ctx) {
          log('setBillingConfig', [patch, ctx]);
          S.cfg = Object.assign({}, S.cfg, patch);
          lib.writeConfig(deps.store, S.cfg);
          return { ok: true, config: S.cfg };
        },
        saveEstimate(d, ctx) {
          log('saveEstimate', [d, ctx]);
          const e = S.estimates.get(d.jobId) || { state: 'DRAFT', versions: [], approvals: [] };
          e.versions.push({ version: e.versions.length + 1, lines: d.lines });
          e.state = 'DRAFT';
          S.estimates.set(d.jobId, e);
          S.newWay.add(d.jobId);
          return { ok: true, estimate: { id: 'E' + e.versions.length, version: e.versions.length } };
        },
        recordApproval(d, ctx) {
          log('recordApproval', [d, ctx]);
          const e = S.estimates.get(d.jobId);
          if (!e) return { ok: false, code: 'ESTIMATE_NOT_FOUND', message: 'x' };
          e.approvals.push({ version: d.version, method: d.method, takenBy: { name: d.takenByName }, approvedAt: d.approvedAt, amountPaise: d.amountPaise });
          e.state = 'APPROVED';
          return { ok: true, state: 'APPROVED' };
        },
        estimateView(jobId, ctx) {
          log('estimateView', [jobId, ctx]);
          const e = S.estimates.get(jobId);
          if (!e) return { ok: true, versions: [], latest: null, approvals: [], state: 'NONE', approvedPaise: 0 };
          return { ok: true, versions: view(e.versions), latest: view(e.versions[e.versions.length - 1]), approvals: view(e.approvals), state: e.state, approvedPaise: e.approvals.length ? e.approvals[e.approvals.length - 1].amountPaise : 0 };
        },
        prepareInvoice(jobId, ctx) { log('prepareInvoice', [jobId, ctx]); return { ok: true, draft: { jobId } }; },
        previewInvoice(d, ctx) { log('previewInvoice', [d, ctx]); return { ok: true, totals: {} }; },
        issueInvoice(d, ctx) {
          log('issueInvoice', [d, ctx]);
          if (!sessionOk(ctx)) return { ok: false, code: 'SESSION_REQUIRED', message: 'x' };
          if (S.invoices.some((i) => i.jobId === d.jobId && !i.cancel)) return { ok: false, code: 'INVOICE_ALREADY_ISSUED', message: 'x' };
          const bill = Calc.computeBill({
            lines: d.lines, billDiscountPaise: d.billDiscountPaise || 0, sellerStateCode: '27', recipientStateCode: '27', recipientGstin: ''
          });
          if (!bill.ok) return bill;
          const jm = deps.money.jobMoney(d.jobId);
          assert.equal(jm.ok, true, JSON.stringify(jm));
          const setOff = Math.min(jm.netPaise, bill.totals.totalPaise);
          S.seq += 1;
          const inv = {
            id: 'I' + S.seq, n: S.seq, kind: 'INV_ISSUE', no: 'SV/2026-27/' + String(S.seq).padStart(4, '0'), docDate: today(), jobId: d.jobId,
            mode: d.mode || 'CCPT_BILLED', ccptInvoiceNo: d.ccptInvoiceNo || '', bill, note: '',
            setOff: { advancePaise: setOff, receipts: jm.receipts.filter((r) => r.status === 'OK').map((r) => ({ no: r.no, amountPaise: r.amountPaise })) },
            balanceDuePaise: bill.totals.totalPaise - setOff, warranty: d.warranty || [], cancel: null
          };
          S.invoices.push(inv);
          S.newWay.add(d.jobId);
          return { ok: true, invoice: withCredit(inv), warnings: [] };
        },
        linkCcptInvoice(d, ctx) {
          log('linkCcptInvoice', [d, ctx]);
          const inv = S.invoices.find((i) => i.no === d.invoiceNo);
          if (!inv) return { ok: false, code: 'DOC_NOT_FOUND', message: 'x' };
          inv.ccptInvoiceNo = d.ccptInvoiceNo;
          return { ok: true, invoice: withCredit(inv) };
        },
        cancelInvoice(no, reason, ctx) {
          log('cancelInvoice', [no, reason, ctx]);
          const inv = S.invoices.find((i) => i.no === no);
          if (!inv) return { ok: false, code: 'DOC_NOT_FOUND', message: 'x' };
          inv.cancel = { at: deps.now().toISOString(), reason, docDate: today() };
          return { ok: true, invoice: withCredit(inv) };
        },
        issueCreditNote(d, ctx) {
          log('issueCreditNote', [d, ctx]);
          const inv = S.invoices.find((i) => i.no === d.invoiceNo);
          if (!inv) return { ok: false, code: 'DOC_NOT_FOUND', message: 'x' };
          const prior = S.notes.filter((n) => n.invoiceNo === inv.no).map((n) => n.credit);
          const credit = Calc.computeCreditNote(inv.bill, d.request, prior);
          if (!credit.ok) return credit;
          S.seq += 1;
          const note = {
            id: 'C' + S.seq, kind: 'CN_ISSUE', no: 'SCN/26-27/' + String(S.notes.length + 1).padStart(4, '0'), docDate: today(), jobId: inv.jobId,
            invoiceNo: inv.no, mode: d.mode, reasonClass: d.reasonClass, reason: d.reason, credit, stock: d.stock || []
          };
          S.notes.push(note);
          return { ok: true, creditNote: view(note), warnings: [] };
        },
        issueNoChargeSheet(d, ctx) {
          log('issueNoChargeSheet', [d, ctx]);
          S.sheets.set(d.jobId, { jobId: d.jobId, parts: [{ code: 'P-2', name: 'Gasket', qty: 1 }], labour: d.labour || [], cancel: null });
          S.newWay.add(d.jobId);
          return { ok: true, sheet: { jobId: d.jobId } };
        },
        cancelNoChargeSheet(sheetId, reason, ctx) {
          log('cancelNoChargeSheet', [sheetId, reason, ctx]);
          const s = S.sheets.get(sheetId);
          if (!s) return { ok: false, code: 'DOC_NOT_FOUND', message: 'x' };
          s.cancel = { reason };
          return { ok: true };
        },
        voidJob(jobId, reason, ctx) {
          log('voidJob', [jobId, reason, ctx]);
          S.voided.add(jobId);
          S.newWay.add(jobId);
          return { ok: true, void: { jobId } };
        },
        importLegacy(items, ctx) { log('importLegacy', [items, ctx]); return { ok: true, written: 0, skipped: 0 }; },
        getInvoice(no, ctx) {
          log('getInvoice', [no, ctx]);
          const inv = S.invoices.find((i) => i.no === no);
          return inv ? { ok: true, invoice: view(withCredit(inv)) } : { ok: false, code: 'DOC_NOT_FOUND', message: 'x' };
        },
        listInvoices(q, ctx) {
          log('listInvoices', [q, ctx]);
          if (S.failAll && !(q && q.jobId)) throw new Error('fake listInvoices (all)');
          let rows = S.invoices;
          if (q && q.jobId) rows = rows.filter((i) => i.jobId === q.jobId);
          return { ok: true, invoices: view(rows.map(withCredit)), total: rows.length };
        },
        getCreditNote(no, ctx) {
          log('getCreditNote', [no, ctx]);
          const n = S.notes.find((x) => x.no === no);
          return n ? { ok: true, creditNote: view(n) } : { ok: false, code: 'DOC_NOT_FOUND', message: 'x' };
        },
        listCreditNotes(q, ctx) {
          log('listCreditNotes', [q, ctx]);
          let rows = S.notes;
          if (q && q.invoiceNo) rows = rows.filter((n) => n.invoiceNo === q.invoiceNo);
          return { ok: true, creditNotes: view(rows), total: rows.length };
        },
        jobBilling(jobId, ctx) {
          log('jobBilling', [jobId, ctx]);
          const e = S.estimates.get(jobId);
          const sh = S.sheets.get(jobId) || null;
          // the real layer answers estimate: {state} and the ACTIVE sheet with its record id (here the id is the job id)
          return { ok: true, estimate: { state: e ? e.state : 'NONE' }, sheet: sh && !sh.cancel ? Object.assign({ id: jobId, state: 'ACTIVE' }, view(sh)) : null, voided: S.voided.has(jobId) };
        },
        activeInvoiceNo(jobId) {
          const inv = S.invoices.filter((i) => i.jobId === jobId && !i.cancel)[0];
          return inv ? inv.no : '';
        },
        isNewWay(jobId) { log('isNewWay', [jobId]); return S.newWay.has(jobId); },
        isVoided(jobId) { log('isVoided', [jobId]); return S.voided.has(jobId); },
        isLocked(jobId) { return S.invoices.some((i) => i.jobId === jobId); },
        invoicesOn(date) {
          log('invoicesOn', [date]);
          const rows = S.invoices.filter((i) => i.docDate === date);
          return { ok: true, count: rows.length, paise: rows.reduce((a, i) => a + i.bill.totals.totalPaise, 0), cancelled: rows.filter((i) => i.cancel).length };
        },
        creditNotesOn(date) {
          log('creditNotesOn', [date]);
          const rows = S.notes.filter((n) => n.docDate === date);
          return { ok: true, count: rows.length, paise: rows.reduce((a, n) => a + n.credit.totalPaise, 0) };
        },
        blocksDelete(jobId) {
          log('blocksDelete', [jobId]);
          const reasons = [];
          if (S.invoices.some((i) => i.jobId === jobId)) reasons.push('INVOICE');
          if (S.sheets.has(jobId)) reasons.push('SHEET');
          if (S.voided.has(jobId)) reasons.push('VOID');
          return { ok: true, blocks: reasons.length > 0, reasons };
        },
        unbilledIssues(ctx) {
          log('unbilledIssues', [ctx]);
          return { ok: true, rows: opts.unbilled || [] };
        },
        pendingCcpt(ctx) { log('pendingCcpt', [ctx]); return { ok: true, rows: [] }; },
        pendingCreditReturns(ctx) { log('pendingCreditReturns', [ctx]); return { ok: true, rows: [] }; },
        repairLinks() { log('repairLinks', []); return { ok: true, links: opts.links || [] }; },
        receiptSetOff(no) { log('receiptSetOff', [no]); return { ok: true, setOff: S.setOff.has(no), invoiceNo: S.setOff.has(no) ? S.setOff.get(no) : '' }; },
        billingPortTarget() {
          return {
            creditReturn: (jobId, cnNo, lines) => api.creditReturnCheck(jobId, cnNo, lines),
            saleReversible(no) {
              const r = deps.money.saleMoney(no);
              return r && r.ok === true && r.reversible === true ? { ok: true } : { ok: false, code: 'REFUND_FIRST' };
            }
          };
        },
        docsView() {
          return {
            invoiceForJob(jobId) {
              const list = S.invoices.filter((i) => i.jobId === jobId);
              const act = list.filter((i) => !i.cancel).pop() || list.pop();
              return act ? { no: act.no, status: act.cancel ? 'CANCELLED' : 'ISSUED', totalPaise: act.bill.totals.totalPaise, creditedPaise: noteTotal(act), docDate: act.docDate } : null;
            },
            creditNote(no) { const n = S.notes.find((x) => x.no === no); return n ? { no: n.no, jobId: n.jobId, totalPaise: n.credit.totalPaise } : null; },
            counterSale(no) {
              const r = deps.stock.getDoc(no);
              if (r.ok === false) return null;
              const d = r.doc;
              return d.kind === 'CSL' ? { no: d.no, docDate: d.docDate, amountPaise: d.amountPaise, rcptDue: d.rcptDue === true, reversed: d.state === 'REVERSED' } : null;
            },
            counterSalesOpen() {
              return deps.stock.listDocs({ kind: 'CSL' }).docs.filter((d) => d.rcptDue === true && d.state !== 'REVERSED').map((d) => ({ no: d.no, docDate: d.docDate, amountPaise: d.amountPaise }));
            },
            isNewWay(jobId) { return api.isNewWay(jobId); },
            jobVoided(jobId) { return api.isVoided(jobId); },
            invoicesOn(date) { return api.invoicesOn(date); },
            creditNotesOn(date) { return api.creditNotesOn(date); }
          };
        },
        creditReturnCheck(jobId, cnNo, lines) {
          log('creditReturnCheck', [jobId, cnNo, lines]);
          return S.notes.some((n) => n.no === cnNo && n.jobId === jobId) ? { ok: true } : { ok: false, code: 'CREDIT_RETURN_INVALID' };
        }
      };
      return api;
    }
  };
  return lib;
}

// One whole environment: adapter, clock, the real Phase 1 core (built with `share`), and the billing core under test.
// opts: {docs: 'fake' | 'real', provider: false (no session provider), cases: jobs}
export function build(opts = {}) {
  const clock = makeClock(opts.start || '2026-11-18T05:00:00.000Z');
  const adapter = makeAdapter();
  const jobs = new Map();
  const cases = {
    jobs,
    get: (id) => (jobs.has(id) ? jobs.get(id) : null),
    list: () => Array.from(jobs.values()),
    legacyFloor: () => 0,
    legacyInput: () => null,
    firm: () => ({ name: 'Test Watch Works', gstin: '27AAAAA0000A1Z5', address: '1 Test Road, Test City', state: 'Maharashtra', stateCode: '27' }),
    add(id, extra = {}) {
      jobs.set(id, Object.assign({ id, status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false, voided: false, typedAdvancePaise: 0, label: 'Test watch ' + id }, extra));
      return cases;
    }
  };
  let handle = null;
  const made = StoresCore.create({
    adapter, now: clock.now, cases, libs: { store: Store, fifo: Fifo, masters: Masters, docs: Docs },
    storeOptions: { watermark: false }, share: (h) => { handle = h; }
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  const cur = { session: OWNER, stepAt: 0 };
  const docsLib = opts.docs === 'real' ? realDocs() : makeFakeDocs(opts.fake || {});
  const migrateLib = opts.migrate === undefined ? realMigrate() : opts.migrate;
  const args = Object.assign({
    share: handle, calc: Calc, docsLib, moneyLib: Money, migrateLib, masters: Masters, cases, now: clock.now,
    storeLib: Store
  }, opts.provider === false ? {} : { session: () => cur.session, stepUpAt: () => cur.stepAt }, opts.args || {});
  const res = BillingCore.create(args);
  assert.deepEqual(handle.ready(), { ok: true });
  if (docsLib && typeof docsLib.writeConfig === 'function') docsLib.writeConfig(handle.store, docsLib.state.cfg);
  const env = { clock, adapter, cases, jobs, handle, stores: made.core, docsLib, cur, args, res, core: res.ok ? res.core : null };
  env.as = (s) => { cur.session = s; return env; };
  // a fresh Owner PIN stamp at the clock time (the provider says when the PIN was typed)
  env.pin = () => { cur.stepAt = clock.now().getTime(); return { ok: true, at: cur.stepAt }; };
  env.ctx = (extra = {}) => Object.assign({ session: cur.session }, extra);
  env.pinCtx = (extra = {}) => Object.assign({ session: cur.session, stepUp: env.pin() }, extra);
  env.text = () => adapter.text();
  env.p1 = (partCode, qty, cost, supplierInvoiceNo) => {
    const r = made.core.receiveGoods({ supplierInvoiceNo, supplierInvoiceDate: '2026-11-10', lines: [{ partCode, qtyInvoiced: qty, qtyReceived: qty, unitCostPaise: cost }] }, { session: MANAGER, clientRef: 'kit-grn-' + supplierInvoiceNo });
    assert.equal(r.ok, true, JSON.stringify(r));
  };
  return env;
}

export function good(res) {
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}
export function refused(res, code) {
  assert.equal(res.ok, false, 'expected a refusal: ' + JSON.stringify(res));
  if (code) assert.equal(res.code, code, JSON.stringify(res));
  return res;
}
let refN = 0;
export const ref = (tag = 'k') => { refN += 1; return 'core-' + tag + '-' + refN; };

export function readSource() {
  return fs.readFileSync(CORE_FILE, 'utf8');
}

// ---- the REAL stack (real bill layer, money layer, calc, Phase 1 core): invented stock for the hand-worked scenarios ----
// P1: Rs 118.00 incl 18 %, bought 3 at Rs 100.00 then 3 at Rs 120.00. P2: Rs 50.00 excl 18 %, bought 5 at Rs 20.00.
// L1: labour Rs 100.00 excl 18 %. The seller state is 27 (kit firm).
export function realEnv(opts = {}) {
  const e = build(Object.assign({ docs: 'real' }, opts));
  const mctx = () => ({ session: MANAGER, now: e.clock.now, clientRef: ref('m') });
  const part = (code, extra) => {
    const r = Masters.createRow(e.handle.store, mctx(), 'part', Object.assign({
      code, name: 'Part ' + code, group: 'Battery', unit: 'pc', hsn: '9114', gstRateBp: 1800, priceIncludesTax: true, sellPricePaise: 11800,
      reorderLevel: 0, reorderQty: 0, bin: '', flags: {}
    }, extra));
    assert.equal(r.ok, true, JSON.stringify(r));
  };
  part('P1');
  part('P2', { name: 'Strap P2', hsn: '9113', sellPricePaise: 5000, priceIncludesTax: false, flags: { counterSaleable: true } });
  const l = Masters.createRow(e.handle.store, mctx(), 'labour', {
    code: 'L1', name: 'Labour L1', group: 'Service', unit: 'job', sac: '9987', gstRateBp: 1800, priceIncludesTax: false, ratePaise: 10000
  });
  assert.equal(l.ok, true, JSON.stringify(l));
  e.p1('P1', 3, 10000, 'SUP-1');
  e.p1('P1', 3, 12000, 'SUP-2');
  e.p1('P2', 5, 2000, 'SUP-3');
  e.as(OWNER);
  return e;
}
