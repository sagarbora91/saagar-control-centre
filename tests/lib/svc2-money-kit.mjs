// tests/lib/svc2-money-kit.mjs
// Helpers for the money layer tests (www/service-billing-money.js). The REAL store file runs over an in-memory
// adapter, with a fake clock and a fake bill-layer view (docsView). Invented data only: no customer name,
// mobile number, GSTIN or PAN anywhere. The Owner PIN is never typed: a step-up stamp is made by hand.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { Store, makeClock, makeAdapter, newStore, openStore, put } from './svc1-store-harness.mjs';

const require = createRequire(import.meta.url);
export const Calc = require('../../www/service-billing-calc.js');
export const Money = require('../../www/service-billing-money.js');
export { Store, makeClock, makeAdapter, newStore, openStore, put };

const sess = (tier, role, name, extra = {}) => Object.freeze(Object.assign({
  ok: true, tier, role, actorName: name, isOwner: tier === 'owner', isManager: tier === 'manager'
}, extra));
export const OWNER = sess('owner', 'Owner', 'Test Owner');
export const MANAGER = sess('manager', 'Store Manager', 'Test Manager');
// plain staff: Technician is a store-class role in the kit (see build), Trainee is neither store-class nor billing staff
export const TECH = sess('staff', 'Technician', 'Test Tech');
export const TRAINEE = sess('staff', 'Trainee', 'Test Trainee');
export const CASHIER = sess('staff', 'Cashier', 'Test Cashier');
export const NONE = Object.freeze({ ok: false, tier: 'none', role: '', actorName: '', isOwner: false, isManager: false });

// The fake bill-layer view. Tests fill the maps. `hook` runs at the start of invoiceForJob (to cause a write in between).
export function makeView() {
  const v = {
    invoices: new Map(), notes: new Map(), sales: new Map(), voided: new Set(), invoicesDay: new Map(), notesDay: new Map(),
    hook: null,
    invoiceForJob(jobId) {
      if (v.hook) { const h = v.hook; v.hook = null; h(); }
      if (v.throws) throw new Error('boom');
      return v.invoices.get(jobId) || null;
    },
    creditNote(no) { return v.notes.get(no) || null; },
    counterSale(no) { return v.sales.get(no) || null; },
    counterSalesOpen() { return Array.from(v.sales.values()).filter((s) => s.rcptDue === true && !s.reversed).map((s) => ({ no: s.no, docDate: s.docDate, amountPaise: s.amountPaise })); },
    jobVoided(jobId) { return v.voided.has(jobId); },
    invoicesOn(date) { return v.invoicesDay.get(date) || { count: 0, paise: 0, cancelled: 0 }; },
    creditNotesOn(date) { return v.notesDay.get(date) || { count: 0, paise: 0 }; },
    issue(jobId, totalPaise, no = 'SV/2026-27/' + String(v.invoices.size + 1).padStart(4, '0'), creditedPaise = 0) {
      v.invoices.set(jobId, { no, status: 'ISSUED', totalPaise, creditedPaise, docDate: '2026-11-18' });
      return no;
    },
    cancel(jobId) { const i = v.invoices.get(jobId); v.invoices.set(jobId, Object.assign({}, i, { status: 'CANCELLED' })); }
  };
  return v;
}

export function makeCases() {
  const jobs = new Map();
  const c = {
    jobs,
    get(id) { return jobs.has(id) ? jobs.get(id) : null; },
    list() { return Array.from(jobs.values()); },
    add(id, extra = {}) { jobs.set(id, Object.assign({ id, status: 'open', stub: false, voided: false, typedAdvancePaise: 0 }, extra)); return c; }
  };
  return c;
}

// One whole environment. Billing staff = Cashier, store-class staff = Technician (set through the real settings streams).
export function build(opts = {}) {
  const clock = makeClock(opts.start || '2026-11-18T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const view = makeView();
  const cases = makeCases();
  if (opts.settings !== false) {
    assert.equal(put(store, 'invoices', { k: 'BCFG_SET', b: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician'] } }).ok, true);
    assert.equal(put(store, 'config', { k: 'CONFIG_SET', b: { adjustLimitPaise: 0, storeRoles: ['Technician'] } }).ok, true);
  }
  const made = Money.create({ store, now: clock.now, cases, docsView: view, calc: Calc });
  assert.equal(made.ok, true, JSON.stringify(made));
  const h = { clock, adapter, store, view, cases, api: made.api };
  // a context with a fresh Owner PIN stamp
  h.ctx = (session, extra = {}) => Object.assign({ session }, extra);
  h.pin = (session, extra = {}) => Object.assign({ session, stepUp: { ok: true, at: Date.parse(clock.iso) } }, extra);
  h.records = () => {
    const r = store.read('receipts');
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.records;
  };
  // storage text of every key, to prove that a refusal changed nothing
  h.text = () => JSON.stringify(Array.from(adapter.data.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  h.day = (iso) => { clock.set(iso); return h; };
  return h;
}

// expect a refusal with `code`, and the storage text unchanged
export function refused(h, res, code, before) {
  assert.equal(res.ok, false, 'expected a refusal: ' + JSON.stringify(res));
  assert.equal(res.code, code, JSON.stringify(res));
  assert.equal(typeof res.message, 'string');
  assert.ok(res.message.length > 8);
  if (before !== undefined) assert.equal(h.text(), before, 'storage text changed after a refusal');
  return res;
}
export function good(res) {
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}

// Common set-ups
export const adv = (h, jobId, amountPaise, payMode = 'Cash', who = OWNER, extra = {}) =>
  good(h.api.takeAdvance(Object.assign({ jobId, amountPaise, payMode }, extra), h.ctx(who)));
