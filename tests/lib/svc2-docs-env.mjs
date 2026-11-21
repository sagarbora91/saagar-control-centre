// tests/lib/svc2-docs-env.mjs
// Test environment for the billing documents layer (www/service-billing-docs.js). It runs the REAL store, FIFO, masters,
// Phase 1 docs (edited), calc and money files over an in-memory adapter with a fake clock. All data is invented: no real
// customer name, mobile number, GSTIN or PAN. The Owner PIN is never typed: a step-up stamp is made by hand.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { makeAdapter } from './svc1-docs-env.mjs';

const require = createRequire(import.meta.url);
export const Store = require('../../www/service-stores-store.js');
export const Fifo = require('../../www/service-stores-fifo.js');
export const Masters = require('../../www/service-stores-masters.js');
export const Docs = require('../../www/service-stores-docs.js');
export const Calc = require('../../www/service-billing-calc.js');
export const Money = require('../../www/service-billing-money.js');
export const Bill = require('../../www/service-billing-docs.js');
export { makeAdapter };

const sess = (tier, role, name) => Object.freeze({ ok: true, tier, role, actorName: name, isOwner: tier === 'owner', isManager: tier === 'manager' });
export const OWNER = sess('owner', 'Owner', 'Test Owner');
export const MANAGER = sess('manager', 'Store Manager', 'Test Manager');
export const CASHIER = sess('staff', 'Cashier', 'Test Cashier');
export const TECH = sess('staff', 'Technician', 'Test Tech');
export const ASSISTANT = sess('staff', 'Assistant Technician', 'Test Assistant');
export const GREETER = sess('staff', 'Greeter', 'Test Greeter');
export const TRAINEE = sess('staff', 'Trainee', 'Test Trainee');
export const NONE = Object.freeze({ ok: false, tier: 'none', role: '', actorName: '', isOwner: false, isManager: false });

export function makeClock(startIso = '2026-11-18T05:00:00.000Z') {
  let ms = Date.parse(startIso);
  const c = {
    now: () => new Date(ms),
    ms: () => ms,
    iso: () => new Date(ms).toISOString(),
    set(iso) { ms = Date.parse(iso); return c; },
    advance(by = 1000) { ms += by; return c; }
  };
  return c;
}

// Builds one stack on top of an adapter. opts: {start, adapter, clock, jobs, legacy, wrapStore, shared}
export function makeStack(opts = {}) {
  const clock = opts.clock || makeClock(opts.start);
  const adapter = opts.adapter || makeAdapter();
  const created = Store.createStore(adapter, { now: clock.now });
  assert.equal(created.ok, true, JSON.stringify(created));
  const store = created.store;
  // the bill layer sees the store through a thin wrapper, so a test can run a competing action just before an append
  const hooks = opts.hooks || { beforeAppend: null };
  const billStore = {
    open: (...a) => store.open(...a), read: (...a) => store.read(...a), findRef: (...a) => store.findRef(...a), head: (...a) => store.head(...a),
    nextAt: (...a) => store.nextAt(...a), nextNumber: (...a) => store.nextNumber(...a), lastNumber: (...a) => store.lastNumber(...a),
    append(...a) {
      if (hooks.beforeAppend) { const f = hooks.beforeAppend; hooks.beforeAppend = null; f(); }
      return store.append(...a);
    }
  };
  const jobs = opts.jobs || new Map([['J-1', { id: 'J-1', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false, voided: false, typedAdvancePaise: 0 }]]);
  const legacy = opts.legacy || { floor: {} };
  const raw = { get: (id) => (jobs.has(id) ? jobs.get(id) : null), legacyFloor: (fy) => (legacy.floor[fy] === undefined ? 0 : legacy.floor[fy]) };
  const st = { bill: null, view: null };
  // what the page glue gives the stock layer: the bill layer's truth on invoiceNo and voided
  const stockCases = {
    get(id) {
      const j = raw.get(id);
      if (!j) return null;
      const a = st.bill ? st.bill.activeInvoiceNo(id) : '';
      // a bill number, or a marker when only a no-charge sheet (or a doubt) holds the job: the glue must lock the stock for both
      const locked = typeof a !== 'string' ? '?' : (a || (st.bill.isLocked(id) !== false ? 'SHEET' : ''));
      const voided = st.bill ? st.bill.isVoided(id) : false;
      return { id: j.id, status: voided === true ? 'closed' : j.status, invoiceNo: j.invoiceNo || locked, paymentStatus: j.paymentStatus, stub: j.stub };
    }
  };
  const view = {
    invoiceForJob: (j) => st.bill.docsView().invoiceForJob(j),
    creditNote: (n) => st.bill.docsView().creditNote(n),
    counterSale: (n) => st.bill.docsView().counterSale(n),
    counterSalesOpen: () => st.bill.docsView().counterSalesOpen(),
    jobVoided: (j) => st.bill.docsView().jobVoided(j),
    invoicesOn: (d) => st.bill.docsView().invoicesOn(d),
    creditNotesOn: (d) => st.bill.docsView().creditNotesOn(d)
  };
  const madeMoney = Money.create({ store, now: clock.now, cases: raw, docsView: view, calc: Calc });
  assert.equal(madeMoney.ok, true, JSON.stringify(madeMoney));
  const money = madeMoney.api;
  const port = {
    creditReturn: (...a) => st.bill.creditReturnCheck(...a),
    saleReversible: (n) => st.bill.billingPortTarget().saleReversible(n)
  };
  const stock = Docs.create({ store, fifo: Fifo, masters: Masters, now: clock.now, cases: stockCases, billingPort: port });
  assert.equal(stock.ok, true, JSON.stringify(stock));
  const deps = opts.deps || {};
  const bill = Bill.create({ store: billStore, calc: deps.calc || Calc, masters: Masters, stock, money, cases: raw, now: clock.now });
  assert.equal(bill.ok === false, false, JSON.stringify(bill));
  st.bill = bill;
  return { clock, adapter, store, stock, money, bill, jobs, legacy, raw, hooks };
}

export function makeEnv(opts = {}) {
  const stack = makeStack(opts);
  const { clock, adapter, store, stock, money, bill, jobs, legacy, hooks } = stack;
  let counter = 0;
  let sup = 0;
  const env = {
    ...stack,
    ref() { counter += 1; return 'sbd-t' + counter.toString(36) + '-' + counter; },
    ctx(session, extra = {}) { return { session, stepUp: undefined, clientRef: env.ref(), ...extra }; },
    pin(offsetMs = 0) { return { ok: true, at: clock.ms() - offsetMs }; },
    ctxPin(session, extra = {}) { return env.ctx(session, { stepUp: env.pin(), ...extra }); },
    mctx(session = MANAGER) { return { session, stepUp: undefined, clientRef: env.ref(), now: clock.now }; },
    text() { return adapter.text(); },
    count() { return adapter.setCount; },
    job(id, extra = {}) {
      jobs.set(id, { id, status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false, voided: false, typedAdvancePaise: 0, ...extra });
      return id;
    },
    addPart(code, extra = {}) {
      const input = { code, name: 'Part ' + code, group: 'Battery', unit: 'pc', hsn: '9114', gstRateBp: 1800, priceIncludesTax: true, sellPricePaise: 11800, reorderLevel: 0, reorderQty: 0, bin: '', flags: {}, ...extra };
      const r = Masters.createRow(store, env.mctx(MANAGER), 'part', input);
      assert.equal(r.ok, true, JSON.stringify(r));
      return r.row;
    },
    addLabour(code, extra = {}) {
      const input = { code, name: 'Labour ' + code, group: 'Service', unit: 'job', sac: '9987', gstRateBp: 1800, priceIncludesTax: false, ratePaise: 10000, ...extra };
      const r = Masters.createRow(store, env.mctx(MANAGER), 'labour', input);
      assert.equal(r.ok, true, JSON.stringify(r));
      return r.row;
    },
    editRow(kind, code, patch, reason = 'test price change') {
      const g = Masters.getRow(store, kind, code);
      assert.equal(g.ok, true, JSON.stringify(g));
      const r = Masters.editRow(store, env.ctxPin(OWNER), kind, code, patch, g.row.rev, reason);
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    setActive(kind, code, active, reason = 'test switch') {
      const r = Masters.setActive(store, env.ctxPin(OWNER), kind, code, active, reason, stock.mastersDeps());
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    grn(lines, session = MANAGER) {
      sup += 1;
      const r = stock.receiveGoods({ supplierInvoiceNo: 'SUP-' + sup, supplierInvoiceDate: '2026-11-10', lines }, env.ctx(session));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    issue(jobId, lines, extra = {}, session = MANAGER) {
      const r = stock.issueToJob({ jobId, lines, ...extra }, env.ctx(session));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    ret(jobId, issueMovementId, qty, extra = {}, session = MANAGER) {
      return stock.returnFromJob({ jobId, lines: [{ issueMovementId, qty, returnReason: 'UNUSED' }], ...extra }, env.ctx(session));
    },
    onHand(code) { return Fifo.partBalance(stock.fifoState(), code).qty; },
    stockValue(code) { return Fifo.partBalance(stock.fifoState(), code).valuePaise; },
    setConfig(patch, session = OWNER) {
      const r = bill.setBillingConfig(patch, env.ctxPin(session));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    advance(jobId, amountPaise, payMode = 'Cash') {
      const r = money.takeAdvance({ jobId, amountPaise, payMode }, env.ctx(OWNER));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    // invented stock: P1 3 at Rs 100.00 then 3 at Rs 120.00, P2 5 at Rs 20.00 (prices Rs 118 incl 18 %, Rs 50 excl 18 %)
    seed() {
      env.addPart('P1', { sellPricePaise: 11800, priceIncludesTax: true });
      env.addPart('P2', { name: 'Strap P2', hsn: '9113', sellPricePaise: 5000, priceIncludesTax: false });
      env.addLabour('L1');
      env.grn([{ partCode: 'P1', qtyReceived: 3, unitCostPaise: 10000 }]);
      env.grn([{ partCode: 'P1', qtyReceived: 3, unitCostPaise: 12000 }]);
      env.grn([{ partCode: 'P2', qtyReceived: 5, unitCostPaise: 2000 }]);
      return env;
    },
    // estimate + approval for a job: lines [{kind, code, qty}]
    estimateApproved(jobId, lines, extra = {}) {
      const e = bill.saveEstimate({ jobId, lines, ...extra }, env.ctx(MANAGER));
      assert.equal(e.ok, true, JSON.stringify(e));
      const a = bill.recordApproval({ jobId, version: e.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, env.ctx(MANAGER));
      assert.equal(a.ok, true, JSON.stringify(a));
      return { estimate: e.estimate, approval: a.approval };
    },
    issueBill(input, session = OWNER, extra = {}) {
      const r = bill.issueInvoice(input, env.ctx(session, extra));
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    },
    // a second whole stack over the same storage (what another screen or a restart sees)
    reopen(extra = {}) {
      return makeStack({ clock, adapter, jobs, legacy, ...extra });
    },
    openAll() {
      assert.equal(stock.open().ok, true);
      const o = bill.open();
      assert.equal(o.ok, true, JSON.stringify(o));
      return o;
    }
  };
  return env;
}

export function expectFail(res, code) {
  assert.equal(res.ok, false, 'expected a failure, got ' + JSON.stringify(res).slice(0, 300));
  assert.equal(res.code, code, JSON.stringify(res).slice(0, 400));
  assert.equal(typeof res.message, 'string');
  assert.ok(res.message.length > 8);
  return res;
}
export function expectOk(res) {
  assert.equal(res.ok, true, JSON.stringify(res).slice(0, 500));
  return res;
}
// Runs fn and asserts that nothing was written and the storage text is byte-identical.
export function unchanged(env, fn) {
  const before = env.adapter.text();
  const count = env.adapter.setCount;
  const res = fn();
  assert.equal(env.adapter.setCount, count, 'a refusal must not write');
  assert.equal(env.adapter.text(), before, 'storage text must be identical after a refusal');
  return res;
}
// A valid invented GSTIN of a given state code (checksum made by the calc layer).
export function gstinOf(state, seed = '1234') {
  const first14 = state + 'ABCDE' + seed + 'F1Z';
  return first14 + Calc.gstinCheckChar(first14);
}
