// Test kit for www/service-billing-area-ui.js (Service wave 2, group W-AREA).
// The REAL area file is loaded into a vm context with the Phase 1 fake DOM (imported, never edited).
// The billing facade, the kit of the main billing UI and the host are fakes that record every call.
// Every sample name, number and amount is invented.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDocument, fire, flush, El, SESS } from './svc1-ui-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const AREA_PATH = path.join(here, '..', '..', 'www', 'service-billing-area-ui.js');
export const AREA_SOURCE = readFileSync(AREA_PATH, 'utf8');
export const MAINUI_PATH = path.join(here, '..', '..', 'www', 'service-billing-ui.js');
export const MAINUI_SOURCE = readFileSync(MAINUI_PATH, 'utf8');
export { fire, flush, El, SESS };

export const TODAY = '2026-11-18';

/* a billing-staff session: tier staff, a role the Owner ticked (the area is still closed to it) */
export const SESSIONS = {
  owner: SESS.owner,
  manager: SESS.manager,
  desk: Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Cashier' }),
  tech: SESS.tech,
  none: SESS.none,
  /* a staff session that only carries the words Store Manager in its role: must NOT be treated as a manager */
  fakeManager: Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Store Manager', tier: 'staff', actorName: 'Test Fake' })
};

/* ------------------------------------------------------------------ fake facade */
export function sampleDay(extra) {
  return Object.assign({
    ok: true, date: TODAY,
    receipts: { Cash: 150000, UPI: 80050, Card: 200000, Bank: 12345, total: 442395 },
    refunds: { Cash: 20000, UPI: 50, Card: 0, Bank: 0, total: 20050 },
    netCash: 130000, netAll: 422345,
    advancesTaken: { count: 4, paise: 242506 }, balanceReceipts: { count: 1, paise: 200000 }, counterReceipts: { count: 1, paise: 35000 },
    reversed: { count: 1, paise: 9999 },
    invoicesIssued: { available: true, count: 3, paise: 354000, cancelled: 1 },
    creditNotes: { available: true, count: 1, paise: 11800 },
    notAvailable: [],
    advancesHeldNow: { count: 4, paise: 302678 }
  }, extra || {});
}

export function makeBilling(opts) {
  const o = opts || {};
  const calls = [];
  const forced = {};
  const st = {
    status: Object.assign({ ok: true, ready: true, blocked: false, billingBlocked: false, problems: [], fy: 'FY2026-27',
      config: { discountLimitPaise: 0, billingRoles: [], estimateRoles: ['Technician', 'Assistant Technician'] }, integrity: { ok: true, code: '' } }, o.status || {}),
    day: o.day || sampleDay(),
    held: o.held || { ok: true, rows: [], totalPaise: 0, count: 0 },
    unbilled: o.unbilled || { ok: true, rows: [], total: 0 },
    bills: o.bills || { ok: true, rows: [], total: 0 },
    billViews: o.billViews || {},
    receipts: o.receipts || { ok: true, rows: [], total: 0 },
    legacy: o.legacy || { ok: true, rows: [], totalPaise: 0, available: true },
    counter: o.counter || { ok: true, rows: [], totalPaise: 0, count: 0 },
    plan: o.plan || { ok: true, plan: { invoices: [], skipped: [] } }
  };
  const api = { calls, forced, state: st };
  const def = (name, fn) => {
    api[name] = function (...args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args.map((a) => (a === undefined ? null : a)))) });
      if (Object.prototype.hasOwnProperty.call(forced, name)) {
        const f = forced[name];
        return typeof f === 'function' ? f(...args) : f;
      }
      return fn(...args);
    };
  };
  def('status', () => JSON.parse(JSON.stringify(st.status)));
  def('daySummary', (date) => Object.assign(JSON.parse(JSON.stringify(st.day)), { date }));
  def('advancesHeld', () => JSON.parse(JSON.stringify(st.held)));
  def('unbilledIssues', () => JSON.parse(JSON.stringify(st.unbilled)));
  // real shape of the bill layer's list: {ok, invoices, total}; `bills` in the options keeps the short name `rows`
  def('listBills', () => ({ ok: true, invoices: JSON.parse(JSON.stringify(st.bills.rows || [])), total: (st.bills.rows || []).length }));
  def('getBill', (no) => (st.billViews[no] ? { ok: true, invoice: JSON.parse(JSON.stringify(st.billViews[no])) } : { ok: false, code: 'BILL_NOT_FOUND' }));
  def('listReceipts', () => JSON.parse(JSON.stringify(st.receipts)));
  def('legacyAdvances', () => JSON.parse(JSON.stringify(st.legacy)));
  def('unreceiptedCounterSales', () => JSON.parse(JSON.stringify(st.counter)));
  def('decideLegacyAdvance', (input) => {
    st.legacy = { ok: true, rows: st.legacy.rows.filter((r) => r.jobId !== input.jobId), totalPaise: 0, available: true };
    return { ok: true, receipt: { no: 'SAR/26-27/0001' } };
  });
  def('planMigration', () => JSON.parse(JSON.stringify(st.plan)));
  def('runMigration', (plan) => {
    const n = plan.invoices.length;
    st.plan = { ok: true, plan: { invoices: [], skipped: [] } };
    return { ok: true, written: { invoices: n }, alreadyThere: 0, skipped: [] };
  });
  def('setConfig', (patch) => {
    st.status.config = Object.assign({}, st.status.config, patch);
    return { ok: true, config: JSON.parse(JSON.stringify(st.status.config)) };
  });
  def('printData', (type, args) => ({ ok: true, svcData: { type, args } }));
  api.names = () => calls.map((c) => c.name);
  api.count = (n) => calls.filter((c) => c.name === n).length;
  api.last = (n) => { for (let i = calls.length - 1; i >= 0; i--) if (calls[i].name === n) return calls[i]; return null; };
  return api;
}

/* ------------------------------------------------------------------ fake kit of the main billing UI */
export function makeKit(extra) {
  const calls = { print: [], openDialog: [] };
  const kit = {
    calls,
    print: (type, args) => { calls.print.push(JSON.parse(JSON.stringify({ type, args }))); return Promise.resolve({ ok: true }); },
    openDialog: (kind, data) => { calls.openDialog.push(JSON.parse(JSON.stringify({ kind, data }))); return { kind }; }
  };
  return Object.assign(kit, extra || {});
}

/* ------------------------------------------------------------------ fake timers (the 200 ms search pause) */
function makeTimers() {
  const list = [];
  let id = 0;
  return {
    list,
    setTimeout(fn, ms) { id += 1; list.push({ id, fn, ms }); return id; },
    clearTimeout(i) { const k = list.findIndex((x) => x.id === i); if (k >= 0) list.splice(k, 1); },
    runAll() { const copy = list.splice(0, list.length); copy.forEach((x) => x.fn()); }
  };
}

/* ------------------------------------------------------------------ setup */
export function setup(opts) {
  const o = opts || {};
  const doc = makeDocument();
  const timers = makeTimers();
  const sandbox = { document: doc, window: null, console, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp, parseInt, parseFloat, isFinite, Error,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  sandbox.window = doc.defaultView;
  vm.createContext(sandbox);
  vm.runInContext(AREA_SOURCE, sandbox, { filename: 'service-billing-area-ui.js' });
  const area = sandbox.SaagarServiceBillingAreaUI;
  /* ui: 'real' (default) loads the REAL main billing UI beside the area and uses its kit; 'fake' uses the recording fake kit; null has no kit at all */
  const uiMode = o.ui === undefined ? 'real' : (o.ui === 'fake' ? 'fake' : (o.ui === null ? 'none' : 'custom'));
  if (uiMode === 'real') vm.runInContext(MAINUI_SOURCE, sandbox, { filename: 'service-billing-ui.js' });

  const view = new El(doc, 'div');
  view.attrs = { class: 'view active', id: 'view-billing' };
  const root = new El(doc, 'div');
  root.attrs = { id: 'svb-root', class: 'svs-wrap svb-wrap' };
  view.appendChild(root);
  doc.body.appendChild(view);

  const jobHost = new El(doc, 'div');
  jobHost.attrs = { id: 'svb-job-host' };
  const closeHost = new El(doc, 'div');
  closeHost.attrs = { id: 'svb-close-host' };
  doc.body.appendChild(jobHost);
  doc.body.appendChild(closeHost);

  const billing = o.billing === undefined ? makeBilling(o.billingOpts) : o.billing;
  const kit = uiMode === 'fake' ? makeKit(o.kit) : (o.kit === undefined ? null : o.kit);
  const calls = { toast: [], reauth: [], report: [], openJob: [], print: [] };
  const h = {
    el: { view, root }, calls, timers, billing, kit,
    session: o.session || SESSIONS.owner, past: false, today: TODAY, viewDate: TODAY, reauthResult: true, now: '2026-11-18T05:30:00.000Z',
    reportApi: o.report === undefined ? { preview(type, opts2) { calls.report.push({ type, opts: opts2 }); } } : o.report
  };
  h.host = {
    root,
    session: () => (typeof h.session === 'function' ? h.session() : h.session),
    reauth: (label) => { calls.reauth.push(label); return typeof h.reauthResult === 'function' ? h.reauthResult(label) : Promise.resolve(h.reauthResult); },
    isPast: () => h.past,
    viewDate: () => h.viewDate,
    today: () => h.today,
    nowIso: () => h.now,
    toast: (m) => calls.toast.push(m),
    openJob: (id) => calls.openJob.push(id),
    billing: () => h.billing,
    report: () => h.reportApi,
    jobHost, closeHost,
    job: () => null, currentJobId: () => '', jobIds: () => [], core: () => null,
    print: (type, args) => { calls.print.push(JSON.parse(JSON.stringify({ type, args }))); return Promise.resolve({ ok: true }); }
  };
  if (uiMode === 'none') delete h.host.print;
  let ui;
  if (uiMode === 'real') ui = sandbox.SaagarServiceBillingUI;
  else if (uiMode === 'fake') ui = { kit: h.kit, afterCounterSale: (no) => { calls.afterCounterSale = (calls.afterCounterSale || []).concat([no]); } };
  else if (uiMode === 'none') ui = null;
  else ui = o.ui;

  const api = {
    doc, area, h, host: h.host, billing, kit, sandbox, timers, calls, ui,
    mountUi() { if (ui && typeof ui.mount === 'function') ui.mount(h.host); },
    mountArea() { return area.mount(h.host, ui); },
    mount() { api.mountUi(); return api.mountArea(); },
    async show() { area.show(); await flush(); },
    rootHtml() { return root.innerHTML; },
    rootText() { return root.textContent; },
    layer() { const l = doc.body.childNodes.find((c) => c instanceof El && c.id === 'svb-layer') || null; return l && l.childNodes.length ? l : null; },
    layerHtml() { const l = api.layer(); return l ? l.innerHTML : ''; },
    layerText() { const l = api.layer(); return l ? l.textContent : ''; },
    find(action, key) {
      const where = [root, api.layer()];
      for (const w of where) {
        if (!w) continue;
        const hit = w.querySelectorAll('[data-svcs-action="' + action + '"]').find((e) => key === undefined || e.getAttribute('data-svs-key') === String(key));
        if (hit) return hit;
      }
      return null;
    },
    findAll(action) {
      const out = [];
      for (const w of [root, api.layer()]) if (w) out.push(...w.querySelectorAll('[data-svcs-action="' + action + '"]'));
      return out;
    },
    async click(action, key) {
      const el = api.find(action, key);
      if (!el) throw new Error('no control ' + action + (key !== undefined ? ' key ' + key : ''));
      const ev = fire(doc, el, 'click');
      await flush();
      return ev;
    },
    field(name) {
      for (const w of [api.layer(), root]) {
        if (!w) continue;
        const hit = w.querySelectorAll('[data-svs-field="' + name + '"]')[0];
        if (hit) return hit;
      }
      return null;
    },
    async type(name, value) {
      const el = api.field(name);
      if (!el) throw new Error('no field ' + name);
      el.value = value;
      fire(doc, el, 'input');
      await flush();
      return el;
    },
    async change(name, value) {
      const el = api.field(name);
      if (!el) throw new Error('no field ' + name);
      if (el.type === 'checkbox') el.checked = value; else el.value = value;
      fire(doc, el, 'change');
      await flush();
      return el;
    },
    actionsIn(html) { return Array.from(html.matchAll(/data-svcs-action="([^"]+)"/g)).map((m) => m[1]); },
    allActions() { return api.actionsIn(api.rootHtml() + api.layerHtml()); },
    async openTab(action) { await api.click(action); },
    listenerCount() {
      let n = doc.listeners.length;
      const walk = (e) => { n += e.listeners.length; e.children.forEach(walk); };
      walk(doc.documentElement);
      return n;
    }
  };
  return api;
}

/* invented sample rows */
export const SAMPLE = {
  held: {
    ok: true, totalPaise: 302678, count: 4,
    rows: [
      { jobId: 'WS-2026-001', label: 'WS-2026-001 Titan Edge', netPaise: 130000, receipts: ['SAR/26-27/0001'], oldestDocDate: '2026-10-10', ageDays: 39, jobState: 'OPEN', flag: false },
      { jobId: 'WS-2026-002', label: 'WS-2026-002 Sonata', netPaise: 80050, receipts: ['SAR/26-27/0002'], oldestDocDate: '2026-08-01', ageDays: 109, jobState: 'CLOSED_NO_INVOICE', flag: true },
      { jobId: 'WS-2026-003', label: 'WS-2026-003 Fastrack', netPaise: 92628, receipts: ['SAR/26-27/0003', 'SAR/26-27/0004'], oldestDocDate: '2026-11-17', ageDays: 1, jobState: 'OPEN', flag: false }
    ]
  },
  bill: (no, extra) => Object.assign({
    no, docDate: '2026-11-18', jobId: 'WS-2026-001', label: 'WS-2026-001 Titan Edge', ccptInvoiceNo: 'CC-9001', totalPaise: 118000, creditedPaise: 0, payablePaise: 118000, state: 'ISSUED', mode: 'CCPT_BILLED'
  }, extra || {}),
  billView: (no, extra) => Object.assign({
    no, docDate: '2026-11-18', jobId: 'WS-2026-001', state: 'ISSUED', mode: 'CCPT_BILLED', ccptInvoiceNo: 'CC-9001',
    bill: {
      supply: { type: 'INTRA', placeOfSupplyStateCode: '27', recipientGstin: '' },
      lines: [{ lineNo: 1, kind: 'PART', code: 'DEMO-0001', name: 'Demo glass', hsnSac: '9114', rateBp: 1800, qty: 1, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, totalPaise: 118000 }],
      totals: { taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, billDiscountPaise: 0, roundOffPaise: 0, totalPaise: 118000 }
    },
    setOff: { advancePaise: 30000 }, balanceDuePaise: 88000, totalPaise: 118000
  }, extra || {}),
  receipt: (no, extra) => Object.assign({ no, kind: 'SAR', docDate: '2026-11-18', at: '2026-11-18T05:00:00.000Z', amountPaise: 50000, payMode: 'Cash', payRef: '', jobId: 'WS-2026-001', status: 'OK' }, extra || {})
};
