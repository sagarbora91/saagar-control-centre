// Service wave 2, W-PAGE: the billing glue block and the hooks, run in vm sandboxes with hand-made page globals
// (P5 U90 to U92). The libraries are faked: the page must work, and fail as designed, whatever the billing files do.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { extractFunction } from './lib/fix-s08-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.resolve(here, '../www/modules/service/index.html'), 'utf8');
const BLOCK_START = '// ─── BILLING GLUE (Service wave 2; the libraries are loaded in <head>) ─────────────';
const PHASE1_START = '// ─── STORES GLUE (Service Stores, Phase 1; the libraries are loaded in <head>) ─────────────';
const END = 'renderDash();\napplyReadOnlyUI();\nsvsMount();\n</script>';
const BLOCK = page.slice(page.indexOf(BLOCK_START), page.indexOf(PHASE1_START));
const WITH_PHASE1 = page.slice(page.indexOf(BLOCK_START), page.indexOf(END));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const tick = () => new Promise(r => setImmediate(r));

const NAMES = ['Invented Person', '0000000000', 'Nowhere Lane 1'];
const mk = (extra = {}) => Object.assign({ id: 'WS-1', status: 'open', brand: 'Titan', model: 'M1', custName: NAMES[0], custMobile: NAMES[1], custAddr: NAMES[2] }, extra);

function env(over = {}, code = BLOCK) {
  const log = { toasts: [], warns: [], saves: 0, mounts: [], previews: [], shown: [] };
  const g = Object.assign({
    console: { warn: (...a) => log.warns.push(a.join(' ')), log() {}, error() {} },
    document: { getElementById: () => null },
    DB: [], editId: null, viewDate: '2026-11-18', rowN: 0, subTotalDirty: false,
    byId: id => g.DB.find(c => c.id === id),
    parseRupee: v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; },
    svcD3Reauth: async () => true,
    isPastView: () => false, todayStr: () => '2026-11-18',
    toast: m => log.toasts.push(String(m)),
    showView: id => log.shown.push(id), openEdit() {}, scrollToSec() {},
    saveDB: () => { log.saves += 1; },
    nowLocalDT: () => '2026-11-18T10:00',
    svcReloadSettings: () => ({ invoiceSeq: {} }),
    SaagarServiceStoresStore: { sha256Hex: sha }
  }, over);
  const ctx = vm.createContext(g);
  vm.runInContext(code, ctx);
  return { ctx, log, g };
}
// all libraries present, with a fake facade
function withBilling(facade, over = {}) {
  const calls = { create: [] };
  const e = env(Object.assign({
    SaagarServiceBillingCore: { create(o) { calls.create.push(o); return facade ? { ok: true, core: facade } : { ok: false, code: 'X' }; } },
    SaagarServiceBillingDocs: {}, SaagarServiceBillingMoney: {}, SaagarServiceBillingCalc: {}, SaagarServiceMasters: {},
    svsCore: () => { e.ctx.svbShare(Object.freeze({ handle: true })); return {}; }
  }, over));
  e.calls = calls;
  return e;
}

// ---------------------------------------------------------------- U90 host, case view, mount
test('U90 svbHost has exactly the agreed keys, and the job view hides every customer field', () => {
  const e = env({ DB: [mk({ advancePaid: '1,200', voided: { at: 'x', reason: 'y' }, invoiceNo: 'SV/2026-27/0001' })], editId: 'WS-1' });
  const h = e.ctx.svbHost();
  assert.deepEqual(Object.keys(h).sort(), ['billing', 'closeHost', 'core', 'currentJobId', 'gotoBilling', 'isPast', 'jobHost', 'jobIds', 'job', 'legacyAdvances', 'legacyVoid', 'nowIso', 'openJob',
    'reauth', 'report', 'root', 'session', 'setLegacyApproval', 'setLegacyInvoiceNo', 'showBilling', 'showCases', 'showStores', 'syncLegacy', 'today', 'toast', 'viewDate'].sort());
  const v = JSON.parse(JSON.stringify(h.job('WS-1')));
  assert.deepEqual(v, { id: 'WS-1', status: 'open', invoiceNo: 'SV/2026-27/0001', paymentStatus: '', stub: false, label: 'WS-1 Titan M1', voided: true, typedAdvancePaise: 120000 });
  assert.equal(JSON.stringify(v).includes(NAMES[0]), false);
  assert.equal(h.job('NOPE'), null);
  assert.equal(h.currentJobId(), 'WS-1');
  assert.deepEqual(JSON.parse(JSON.stringify(h.jobIds())), ['WS-1']);
  assert.equal(h.core(), null, 'no Phase 1 glue: no core');
  h.showBilling(); h.showStores(); h.showCases();
  assert.deepEqual(e.log.shown, ['billing', 'stores', 'dash']);
});

test('U90 the typed advance is whole paise, never negative, never above the cap; a bad text is zero', () => {
  const v = text => JSON.parse(JSON.stringify(env({ DB: [mk({ advancePaid: text })] }).ctx.svbCaseView('WS-1').typedAdvancePaise));
  assert.equal(v('500'), 50000);
  assert.equal(v('Rs 99.99'), 9999);
  assert.equal(v('abc'), 0);
  assert.equal(v('-5'), 0);
  assert.equal(v('0'), 0);
  assert.equal(v('99999999'), 0, 'above the cap of Rs 99,99,999.99');
  assert.equal(env({ DB: [mk()] }).ctx.svbCaseView('WS-1').voided, false);
});

test('U90 the session comes from the page only; without it the glue gives a "no session" answer', () => {
  const none = env({ DB: [] }).ctx.svbHost().session();
  assert.equal(none.ok, false);
  assert.equal(none.tier, 'none');
  const e = env({ DB: [], svsSession: () => ({ ok: true, tier: 'owner' }) }, WITH_PHASE1);
  assert.equal(e.ctx.svbHost().session, e.ctx.svsSession);
});

test('U90 the deferred mount runs after the whole script, so the fake Stores button already exists; the mount gets the host and the UI', async () => {
  const seen = [];
  const e = env({
    stores: [],
    SaagarServiceBillingUI: { mount(h) { seen.push(['ui', e.g.stores.length, Object.keys(h).length]); } },
    SaagarServiceBillingAreaUI: { mount(h, ui) { seen.push(['area', e.g.stores.length, ui === e.g.SaagarServiceBillingUI]); } }
  }, 'function svsMount() { stores.push("stores-button"); }\n' + BLOCK + '\nsvsMount();');
  assert.deepEqual(seen, [], 'nothing mounted while the script runs');
  await tick();
  assert.deepEqual(seen, [['ui', 1, 26], ['area', 1, true]]);
});

test('U90 a UI file that throws on mount only warns; no UI file at all is silent', async () => {
  const e = env({ SaagarServiceBillingUI: { mount() { throw new Error('boom'); } } });
  await tick();
  assert.equal(e.log.warns.some(w => w.includes('mount failed')), true);
  const e2 = env({});
  await tick();
  assert.deepEqual(e2.log.warns, []);
  assert.deepEqual(e2.log.toasts, []);
});

test('U90 the hooks pass through the UI and fail as designed', () => {
  const none = env({});
  assert.equal(none.ctx.svbOpenApproval('WS-1'), false, 'no UI: the old prompts run');
  none.ctx.svbRefreshJob(); none.ctx.svbContextChanged();
  const calls = [];
  const ui = { refreshJob: () => calls.push('r'), onContextChange: () => calls.push('c'), openApproval: id => { calls.push('a' + id); return true; } };
  const e = env({ SaagarServiceBillingUI: ui, SaagarServiceBillingAreaUI: { onContextChange: () => calls.push('ac'), show: () => calls.push('show') } });
  e.ctx.svbRefreshJob(); e.ctx.svbContextChanged(); e.ctx.svbShowBilling();
  assert.deepEqual(calls, ['r', 'c', 'ac', 'show']);
  assert.equal(e.ctx.svbOpenApproval('WS-1'), true);
  ui.openApproval = () => 'yes';
  assert.equal(e.ctx.svbOpenApproval('WS-1'), false, 'only a real true counts');
  ui.openApproval = () => { throw new Error('boom'); };
  assert.equal(e.ctx.svbOpenApproval('WS-1'), true, 'a throw stops the old flow, with a toast');
  assert.equal(e.log.toasts.length, 1);
  none.ctx.svbShowBilling();
  assert.match(none.log.toasts[0], /not available/);
});

// ---------------------------------------------------------------- the delete guard
test('U90 svbBlocksDelete table: no billing, has false, has true, refusal, throws, non-boolean, facade cannot start', () => {
  const c = { id: 'WS-1' };
  const none = env({});
  assert.equal(none.ctx.svbBlocksDelete(c), false, 'a build without billing never blocks');
  assert.deepEqual(none.log.toasts, []);
  const run = (answer, over) => {
    const e = withBilling({ jobHasRecords: () => (answer instanceof Error ? (() => { throw answer; })() : answer) }, over);
    return { e, blocked: e.ctx.svbBlocksDelete(c) };
  };
  let r = run({ ok: true, has: false });
  assert.equal(r.blocked, false); assert.deepEqual(r.e.log.toasts, []);
  r = run({ ok: true, has: true });
  assert.equal(r.blocked, true); assert.match(r.e.log.toasts[0], /WS-1 has money or a bill on it/);
  r = run({ ok: false, code: 'BILLING_BLOCKED' });
  assert.equal(r.blocked, true); assert.match(r.e.log.toasts[0], /Could not check billing/);
  r = run(new Error('boom'));
  assert.equal(r.blocked, true); assert.match(r.e.log.toasts[0], /Could not check billing/);
  r = run({ ok: true, has: 'no' });
  assert.equal(r.blocked, true, 'a non-boolean answer blocks');
  r = run({ ok: true, has: false }, { svsCore: () => ({}) });
  assert.equal(r.blocked, true, 'no share handed over: billing cannot start, the delete is blocked');
  const noFacade = withBilling(null);
  assert.equal(noFacade.ctx.svbBlocksDelete(c), true, 'libraries loaded but the facade refuses: block');
  assert.equal(withBilling({ jobHasRecords: () => ({ ok: true, has: false }) }).ctx.svbBlocksDelete(null), true, 'no case blocks');
});

// ---------------------------------------------------------------- close gate and zero final amount
test('U90 svbCloseGate and svbAllowsZeroFinal', () => {
  const gate = (answer, over) => withBilling({ closeCheck: () => { if (answer instanceof Error) throw answer; return answer; } }, over).ctx;
  assert.equal(env({}).ctx.svbCloseGate('WS-1'), null, 'no billing files: close as today');
  assert.equal(env({}).ctx.svbAllowsZeroFinal('WS-1'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(gate({ ok: true, legacy: true, mayClose: true }).svbCloseGate('WS-1'))), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(gate({ ok: true, legacy: false, mayClose: true }).svbCloseGate('WS-1'))), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(gate({ ok: true, legacy: false, mayClose: false, billNo: 'SV/2026-27/0007', dueNowPaise: 125050 }).svbCloseGate('WS-1'))),
    { ok: false, message: 'Take the balance first: ₹1,250.50 is still due on bill SV/2026-27/0007.' });
  assert.deepEqual(JSON.parse(JSON.stringify(gate({ ok: true, legacy: false, mayClose: false, billNo: '', dueNowPaise: 0 }).svbCloseGate('WS-1'))),
    { ok: false, message: 'Issue the bill first, or mark the job as no-charge warranty.' });
  const refuse = { ok: false, message: 'Billing could not be checked. Nothing was closed.' };
  assert.deepEqual(JSON.parse(JSON.stringify(gate({ ok: false, code: 'BILLING_BLOCKED' }).svbCloseGate('WS-1'))), refuse);
  assert.deepEqual(JSON.parse(JSON.stringify(gate(null).svbCloseGate('WS-1'))), refuse);
  assert.deepEqual(JSON.parse(JSON.stringify(gate(new Error('boom')).svbCloseGate('WS-1'))), refuse);
  assert.deepEqual(JSON.parse(JSON.stringify(withBilling(null).ctx.svbCloseGate('WS-1'))), refuse, 'libraries loaded, facade cannot start: refuse');
  assert.equal(gate({ ok: true, noCharge: true, mayClose: true }).svbAllowsZeroFinal('WS-1'), true);
  assert.equal(gate({ ok: true, noCharge: false, mayClose: true }).svbAllowsZeroFinal('WS-1'), false);
  assert.equal(gate({ ok: false, noCharge: true }).svbAllowsZeroFinal('WS-1'), false);
  assert.equal(gate(new Error('boom')).svbAllowsZeroFinal('WS-1'), false);
});

// ---------------------------------------------------------------- the tax invoice route and printing
function routeEnv(answer, caseExtra = {}, over = {}) {
  const printed = [];
  const facade = {
    taxRoute: () => (answer instanceof Error ? (() => { throw answer; })() : answer),
    activeInvoiceNo: () => 'SV/2026-27/0003',
    printData: (type, args) => ({ ok: true, svcData: { invoice: { jobId: 'WS-1', invoiceNo: args.invoiceNo || '', recipientGstin: '27AAAAA0000A1Z5', recipientStateCode: '27', lines: [] }, receipt: undefined } }),
    repairLinks: () => []
  };
  const e = withBilling(facade, Object.assign({
    DB: [mk(caseExtra)],
    SaagarModuleBridge: { report: { preview: (t, a) => printed.push([t, a]) } }
  }, over));
  e.printed = printed;
  return e;
}

test('U90 svbTaxInvoiceRoute: never false for a case without an invoice number', () => {
  // billing files missing
  let e = env({ DB: [mk()] });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  assert.match(e.log.toasts[0], /^⚠ Billing is not available\. No invoice number can be issued\.$/);
  e = env({ DB: [mk({ status: 'closed', invoiceNo: 'SV/2026-27/0001' })] });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), false, 'the old reprint still works with an old number');
  assert.deepEqual(e.log.toasts, []);
  // routes
  e = routeEnv({ ok: true, route: 'legacy' }, { status: 'closed', invoiceNo: 'SV/2026-27/0001' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), false);
  e = routeEnv({ ok: true, route: 'legacy' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true, 'a legacy answer for a case without a number is still refused');
  e = routeEnv({ ok: true, route: 'old_way_closed' }, { status: 'closed' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  assert.equal(e.log.toasts[0], 'This job was closed without a bill. CCPT issues the tax invoice. Use Proforma for a printout.');
  e = routeEnv({ ok: false, code: 'BILLING_BLOCKED' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  e = routeEnv({ ok: false, code: 'BILLING_BLOCKED' }, { status: 'closed', invoiceNo: 'SV/2026-27/0001' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), false, 'with an old number the old reprint is still allowed');
  e = routeEnv(new Error('boom'));
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  assert.match(e.log.toasts[0], /Billing could not open: boom/);
  e = routeEnv({ ok: true, route: 'surprise' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  // issue: the bill dialog is the UI's
  const opened = [];
  e = routeEnv({ ok: true, route: 'issue' }, {}, { SaagarServiceBillingUI: { taxInvoiceRoute: id => { opened.push(id); return true; } } });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  assert.deepEqual(opened, ['WS-1']);
  e = routeEnv({ ok: true, route: 'issue' });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true, 'no UI to open the dialog: refused, not the old allocator');
  assert.match(e.log.toasts[0], /No invoice number can be issued/);
});

test('U90 svbTaxInvoiceRoute prints the bill summary, the tax invoice and the no-charge sheet, with the frozen bill-to', () => {
  const frozen = { name: 'Frozen Name', mobile: '1111111111', address: 'Frozen Street', at: '2026-11-18T09:00:00.000Z' };
  let e = routeEnv({ ok: true, route: 'summary' }, { status: 'closed', invoiceNo: 'SV/2026-27/0003', svbBillTo: { 'SV/2026-27/0003': frozen } });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-1'), true);
  assert.equal(e.printed.length, 1);
  assert.equal(e.printed[0][0], 'serviceBillSummary');
  const bt = JSON.parse(JSON.stringify(e.printed[0][1].svcData.billTo));
  assert.deepEqual(bt, { name: 'Frozen Name', live: false, mobile: '1111111111', address: 'Frozen Street', gstin: '27AAAAA0000A1Z5', stateCode: '27' });
  assert.equal(JSON.stringify(e.printed[0][1]).includes(NAMES[0]), false, 'the live customer name is not used when a frozen copy exists');
  e = routeEnv({ ok: true, route: 'tax_invoice' });
  e.ctx.svbTaxInvoiceRoute('WS-1');
  assert.equal(e.printed[0][0], 'serviceTaxInvoiceV2');
  assert.equal(e.printed[0][1].svcData.billTo.live, true, 'no frozen copy: the live job, marked');
  assert.equal(e.printed[0][1].svcData.billTo.name, NAMES[0]);
  e = routeEnv({ ok: true, route: 'no_charge' });
  e.ctx.svbTaxInvoiceRoute('WS-1');
  assert.equal(e.printed[0][0], 'serviceWarrantySheet');
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(e.printed[0][1].svcData.billTo))).sort(), ['live', 'mobile', 'name']);
});

test('U90 svbPrint: receipts and refund vouchers carry the name only; other types carry no bill-to; refusals toast', () => {
  const doc = key => ({ ok: true, svcData: { [key]: { jobId: 'WS-1', invoiceNo: '' } } });
  const e = withBilling({ printData: (type) => doc(type === 'serviceReceipt' ? 'receipt' : type === 'serviceRefundVoucher' ? 'refund' : 'invoice'), repairLinks: () => [] },
    { DB: [mk()], SaagarModuleBridge: { report: { preview: (t, a) => e.previews.push([t, a]) } } });
  e.previews = [];
  e.ctx.svbPrint('serviceReceipt', { x: 1 });
  e.ctx.svbPrint('serviceRefundVoucher', {});
  e.ctx.svbPrint('serviceDaySummary', {});
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(e.previews[0][1].svcData.billTo))).sort(), ['live', 'name']);
  assert.equal(e.previews[0][1].x, 1);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(e.previews[1][1].svcData.billTo))).sort(), ['live', 'name']);
  assert.equal('billTo' in e.previews[2][1].svcData, false, 'a list report has no customer block');
  // no report engine, no billing, a refusal
  const none = env({ DB: [mk()] });
  assert.equal(none.ctx.svbPrint('serviceReceipt', {}), false);
  assert.match(none.log.toasts[0], /Printing is not available/);
  const e2 = withBilling({ printData: () => ({ ok: false, code: 'X' }) }, { DB: [mk()], SaagarModuleBridge: { report: { preview() { throw new Error('should not print'); } } } });
  assert.equal(e2.ctx.svbPrint('serviceReceipt', {}), false);
  assert.match(e2.log.toasts[0], /Nothing could be prepared/);
  assert.equal(none.ctx.svbHost().report(), null, 'no report engine: host.report is null so the UI says printing is not available');
});

// ---------------------------------------------------------------- the facade options and the Phase 1 share (P-16)
test('svbBilling creates the facade once, with the share, libraries, case reader, clock and providers; the options carry no storage or customer data', () => {
  const facade = { jobHasRecords: () => ({ ok: true, has: false }) };
  const e = withBilling(facade, { DB: [mk()], svsSession: () => ({ ok: true }) });
  const b1 = e.ctx.svbBilling();
  const b2 = e.ctx.svbBilling();
  assert.equal(b1, b2);
  assert.equal(e.calls.create.length, 1);
  const o = e.calls.create[0];
  // A-PAGE (P-1): the store's hash function goes to the facade for the old-invoice bring-in
  assert.deepEqual(Object.keys(o).sort(), ['calc', 'cases', 'docsLib', 'hashHex', 'masters', 'migrateLib', 'moneyLib', 'now', 'pastView', 'session', 'share', 'stepUpAt']);
  assert.equal(o.hashHex, e.g.SaagarServiceStoresStore.sha256Hex);
  assert.equal(typeof o.cases.firm, 'function', 'A-PAGE (P-2): the firm reader goes to the facade');
  assert.equal(o.share.handle, true);
  assert.equal(o.migrateLib, null, 'no migration file: null');
  assert.equal(o.calc, e.g.SaagarServiceBillingCalc);
  assert.equal(o.session, e.g.svsSession ? e.ctx.svsSession : undefined);
  assert.ok(typeof o.now().getTime === 'function');
  assert.equal(o.stepUpAt(), 0, 'no PIN seen yet');
  assert.deepEqual(Object.keys(o.cases).sort(), ['firm', 'get', 'legacyFloor', 'legacyInput', 'list']);
  // A-PAGE: the migration reads case views (id, status, invoiceNo), not bare ids; the view carries no customer field
  assert.deepEqual(JSON.parse(JSON.stringify(o.cases.list())).map((x) => x.id), ['WS-1']);
  assert.equal(JSON.stringify(o.cases.list()).includes(NAMES[0]) || JSON.stringify(o.cases.list()).includes(NAMES[1]), false);
  assert.equal(o.cases.get('NOPE'), null);
  // libraries missing: null, no throw
  assert.equal(env({}).ctx.svbBilling(), null);
  assert.equal(env({ SaagarServiceBillingCore: {} }).ctx.svbBilling(), null);
  // the facade fails to start: null, not cached, retried
  let n = 0;
  const e2 = withBilling(null, { SaagarServiceBillingCore: { create() { n += 1; return n === 1 ? { ok: false } : { ok: true, core: facade }; } } });
  assert.equal(e2.ctx.svbBilling(), null);
  assert.equal(e2.ctx.svbBilling(), facade);
  // create throws: null with a warning
  const e3 = withBilling(null, { SaagarServiceBillingCore: { create() { throw new Error('bad'); } } });
  assert.equal(e3.ctx.svbBilling(), null);
  assert.equal(e3.log.warns.length, 1);
});

const gateAt = e => vm.runInContext('svbPinGate.at()', e.ctx);
const gateFrozen = e => vm.runInContext('Object.isFrozen(svbPinGate)', e.ctx);
test('svbShare keeps the first handle only; the PIN gate is its own and stamps only after an exact true', async () => {
  const e = env({});
  const a = { n: 1 }, b = { n: 2 };
  e.ctx.svbShare(a); e.ctx.svbShare(b); e.ctx.svbShare(null);
  assert.equal(e.ctx.svbShareRef, a);
  let answer = false;
  const e2 = env({ svcD3Reauth: async () => answer });
  const gate = e2.ctx.svbHost().reauth;
  assert.equal(await gate('x'), false);
  assert.equal(gateAt(e2), 0);
  answer = 'true';
  assert.equal(await gate('x'), false, 'only a real true counts');
  assert.equal(gateAt(e2), 0);
  answer = true;
  assert.equal(await gate('x'), true);
  assert.ok(gateAt(e2) > 0);
  assert.equal(gateFrozen(e2), true);
});

test('P-16: the Phase 1 core is always given share (a function), and nothing else changes in its options', () => {
  const seen = [];
  const e = env({
    DB: [], window: {}, svsSession: undefined,
    SaagarServiceStoresCore: { create(o) { seen.push(o); return { ok: true, core: {} }; } },
    SaagarServiceStoresStore: { adapterFromWindow: () => ({}), sha256Hex: sha }
  }, WITH_PHASE1);
  e.ctx.svsCore();
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['adapter', 'cases', 'now', 'session', 'share', 'stepUpAt']);
  assert.equal(seen[0].share, e.ctx.svbShare);
  assert.equal(seen[0].session, e.ctx.svsSession);
  // the pre-wave shape: without the billing glue (as the Phase 1 tests run it) the five pinned keys only
  const phase1Only = page.slice(page.indexOf(PHASE1_START), page.indexOf(END));
  const seen2 = [];
  const e2 = env({ DB: [], window: {}, SaagarServiceStoresCore: { create(o) { seen2.push(o); return { ok: true, core: {} }; } }, SaagarServiceStoresStore: { adapterFromWindow: () => ({}) } }, phase1Only);
  e2.ctx.svsCore();
  assert.deepEqual(Object.keys(seen2[0]).sort(), ['adapter', 'cases', 'now', 'session', 'stepUpAt']);
});

// ---------------------------------------------------------------- case writers
test('svbSetCaseInvoice sets the number and freezes the bill-to once; an empty number clears it and keeps the frozen copy', () => {
  const e = env({ DB: [mk()] });
  const c = e.g.DB[0];
  assert.equal(e.ctx.svbSetCaseInvoice('WS-1', 'SV/2026-27/0001'), true);
  assert.equal(c.invoiceNo, 'SV/2026-27/0001');
  assert.deepEqual(Object.keys(c.svbBillTo['SV/2026-27/0001']).sort(), ['address', 'at', 'mobile', 'name']);
  assert.equal(c.svbBillTo['SV/2026-27/0001'].name, NAMES[0]);
  assert.equal(e.log.saves, 1);
  c.custName = 'Changed Later';
  e.ctx.svbSetCaseInvoice('WS-1', 'SV/2026-27/0001');
  assert.equal(c.svbBillTo['SV/2026-27/0001'].name, NAMES[0], 'frozen at issue, never rewritten');
  e.ctx.svbSetCaseInvoice('WS-1', '');
  assert.equal(c.invoiceNo, '');
  assert.equal(Object.keys(c.svbBillTo).length, 1, 'a cancelled number keeps its frozen copy');
  assert.equal(e.ctx.svbSetCaseInvoice('NOPE', 'X'), false);
  const before = e.log.saves;
  assert.equal(e.ctx.svbSetCaseInvoice('NOPE', 'X'), false);
  assert.equal(e.log.saves, before, 'an unknown job writes nothing');
  const bad = env({ DB: [mk()], saveDB() { throw new Error('quota'); } });
  assert.equal(bad.ctx.svbSetCaseInvoice('WS-1', 'SV/2026-27/0001'), false);
  assert.equal(bad.log.warns.length, 1);
});

test('svbSetCaseApproval mirrors the approval in the old shape: via lower-case, amount in rupees, one follow-up crumb', () => {
  const via = { WHATSAPP: 'whatsapp', CALL: 'call', IN_PERSON: 'in_person', SIGNED: 'other', OTHER: 'other', whatever: 'other' };
  Object.entries(via).forEach(([given, want]) => {
    const e = env({ DB: [mk()] });
    assert.equal(e.ctx.svbSetCaseApproval('WS-1', { at: '2026-11-18T10:00:00.000Z', via: given, by: 'Tech A', amount: 1500.5 }), true);
    assert.deepEqual(JSON.parse(JSON.stringify(e.g.DB[0].estimateApproval)), { at: '2026-11-18T10:00:00.000Z', via: want, by: 'Tech A', amount: 1500.5 });
    assert.equal(e.g.DB[0].followUps.length, 1);
    assert.equal(e.g.DB[0].followUps[0].type, 'Approval');
    assert.equal(e.log.saves, 1);
  });
  const e = env({ DB: [mk()] });
  e.ctx.svbSetCaseApproval('WS-1', { method: 'CALL', takenByName: 'Tech B', approvedAt: '2026-11-18', amountPaise: 250000 });
  assert.deepEqual(JSON.parse(JSON.stringify(e.g.DB[0].estimateApproval)), { at: '2026-11-18', via: 'call', by: 'Tech B', amount: 2500 });
  assert.equal(e.ctx.svbSetCaseApproval('NOPE', { via: 'CALL' }), false);
  assert.equal(e.ctx.svbSetCaseApproval('WS-1', null), false);
  assert.equal(Object.keys(e.g.DB[0]).includes('svbBillTo'), false, 'nothing else on the case changed');
});

test('svbSetCaseVoid: an open job is closed with a zero final amount; a closed job keeps its delivery; the crumb is added', () => {
  let e = env({ DB: [mk()] });
  assert.equal(e.ctx.svbSetCaseVoid('WS-1', { at: '2026-11-18T10:00:00.000Z', reason: 'Customer left the watch' }), true);
  let c = e.g.DB[0];
  assert.deepEqual(JSON.parse(JSON.stringify(c.voided)), { at: '2026-11-18T10:00:00.000Z', reason: 'Customer left the watch' });
  assert.equal(c.status, 'closed');
  assert.equal(c.closedAt, '2026-11-18T10:00:00.000Z');
  assert.deepEqual(JSON.parse(JSON.stringify(c.delivery)), { finalAmt: '0' });
  assert.equal(c.followUps[0].remarks, 'Voided: Customer left the watch');
  assert.equal(e.log.saves, 1);
  e = env({ DB: [mk({ status: 'closed', closedAt: 'old', delivery: { finalAmt: '900', payMode: 'Cash' } })] });
  e.ctx.svbSetCaseVoid('WS-1', { reason: 'r' });
  c = e.g.DB[0];
  assert.equal(c.closedAt, 'old');
  assert.deepEqual(JSON.parse(JSON.stringify(c.delivery)), { finalAmt: '900', payMode: 'Cash' });
  assert.equal(c.voided.reason, 'r');
  e = env({ DB: [mk({ status: 'open', delivery: { finalAmt: '5' } })] });
  e.ctx.svbSetCaseVoid('WS-1', { reason: 'r' });
  assert.equal(e.g.DB[0].delivery.finalAmt, '5', 'an existing delivery record is not replaced');
  assert.equal(env({ DB: [] }).ctx.svbSetCaseVoid('NOPE', {}), false);
});

test('svbApplyRepairs writes the billing number onto cases that differ, once, and never clears an old frozen invoice', () => {
  const rows = [{ jobId: 'WS-1', invoiceNo: 'SV/2026-27/0004', state: 'ISSUED' }, { jobId: 'WS-2', invoiceNo: '', state: 'CANCELLED' }, { jobId: 'WS-3', invoiceNo: '', state: 'CANCELLED' }, { jobId: 'WS-9', invoiceNo: 'X' }];
  const e = withBilling({ repairLinks: () => rows }, {
    DB: [mk(), mk({ id: 'WS-2', invoiceNo: 'SV/2026-27/0002' }), mk({ id: 'WS-3', invoiceNo: 'SV/2026-27/0001', invoiceSnapshot: { v: 1 } })]
  });
  assert.equal(e.ctx.svbApplyRepairs(), 2);
  assert.equal(e.g.DB[0].invoiceNo, 'SV/2026-27/0004');
  assert.equal(e.g.DB[1].invoiceNo, '');
  assert.equal(e.g.DB[2].invoiceNo, 'SV/2026-27/0001', 'an old frozen invoice is never cleared');
  assert.equal(e.ctx.svbApplyRepairs(), 0, 'idempotent');
  assert.equal(env({}).ctx.svbApplyRepairs(), 0);
  assert.equal(withBilling({ repairLinks: () => { throw new Error('x'); } }).ctx.svbApplyRepairs(), 0);
  assert.equal(withBilling({ repairLinks: () => ({ rows: [rows[0]] }) }, { DB: [mk()] }).ctx.svbApplyRepairs(), 1, 'a {rows} answer is read too');
});

// ---------------------------------------------------------------- the old counter floor and the migration input
test('svbLegacyFloor is the larger of the old counter and the numbers on cases, per financial year', () => {
  const e = env({
    svcReloadSettings: () => ({ invoiceSeq: { '2026-27': 12, '2025-26': 40 } }),
    DB: [mk({ invoiceNo: 'SV/2026-27/0015' }), mk({ id: 'WS-2', invoiceNo: 'WS-9' }), mk({ id: 'WS-3', invoiceNo: 'SV/2025-26/0030' }), mk({ id: 'WS-4', invoiceNo: 'SV/2026-27/00x' })]
  });
  assert.equal(e.ctx.svbLegacyFloor('2026-27'), 15);
  assert.equal(e.ctx.svbLegacyFloor('2025-26'), 40);
  assert.equal(e.ctx.svbLegacyFloor('2024-25'), 0);
  assert.equal(e.ctx.svbLegacyFloor('26-27'), 0);
  assert.equal(e.ctx.svbLegacyFloor(undefined), 0);
  const bad = env({ svcReloadSettings: () => { throw new Error('x'); }, DB: [mk({ invoiceNo: 'SV/2026-27/0003' })] });
  assert.equal(bad.ctx.svbLegacyFloor('2026-27'), 3, 'the cases still count when the settings cannot be read');
  assert.equal(bad.log.warns.length, 1);
  const noMap = env({ svcReloadSettings: () => ({ invoiceSeq: [5] }), DB: [] });
  assert.equal(noMap.ctx.svbLegacyFloor('2026-27'), 0);
});

test('svbLegacyInput gives figures in paise, counts and a hash, and no customer data', () => {
  const snap = {
    v: 1, basis: 'issue', invoiceNo: 'SV/2026-27/0001', issuedAt: '2026-11-01T05:00:00.000Z', invoiceDate: '2026-11-01', caseId: 'WS-1',
    firm: { name: 'F', gstin: '', address: 'A' }, customer: { name: NAMES[0], mobile: NAMES[1], address: NAMES[2] }, watch: 'Titan M1', lines: [{ desc: 'a' }, { desc: 'b' }],
    figs: { gstPct: 18, listed: 1000, adjustment: 0, taxable: 1000, gst: 180, cgst: 90, sgst: 90, roundOff: 0, finalAmt: 1180, total: 1180 },
    delivery: { collectDate: '2026-11-01', payMode: 'Cash', payRef: '', warrantyTill: '', warrantyMonths: '' }
  };
  const e = env({ DB: [mk({ status: 'closed', invoiceNo: 'SV/2026-27/0001', invoiceSnapshot: snap, corrections: [{}, {}] }), mk({ id: 'WS-2', status: 'open', invoiceNo: 'X' }), mk({ id: 'WS-3', status: 'closed' })] });
  const r = JSON.parse(JSON.stringify(e.ctx.svbLegacyInput('WS-1')));
  assert.deepEqual(r, {
    ok: true, jobId: 'WS-1', legacyNo: 'SV/2026-27/0001', basis: 'SNAPSHOT_V1',
    // A-PAGE: the migration reads the snapshot figures (rupees) from figs
    figs: { gstPct: 18, listed: 1000, adjustment: 0, taxable: 1000, gst: 180, cgst: 90, sgst: 90, roundOff: 0, finalAmt: 1180, total: 1180 },
    invoiceDate: '2026-11-01', issuedAt: '2026-11-01T05:00:00.000Z', gstBp: 1800,
    listedPaise: 100000, adjustmentPaise: 0, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, gstPaise: 18000, roundOffPaise: 0, totalPaise: 118000, finalPaise: 118000,
    payMode: 'Cash', lineCount: 2, correctionCount: 2, snapshotSha: sha(JSON.stringify(snap)), warn: []
  });
  assert.equal(NAMES.some(n => JSON.stringify(r).includes(n)), false);
  assert.equal(e.ctx.svbLegacyInput('WS-2'), null, 'an open job');
  assert.equal(e.ctx.svbLegacyInput('WS-3'), null, 'no number');
  assert.equal(e.ctx.svbLegacyInput('NOPE'), null);
  // an old WS- number without a snapshot: built on a copy, never stored on the case
  const live = Object.assign({}, snap, { customer: { name: NAMES[0] }, issuedAt: 'now' });
  const e2 = env({
    DB: [mk({ status: 'closed', invoiceNo: 'WS-9', delivery: { finalAmt: '1180' } })],
    SaagarModuleBridge: { report: { makeInvoiceSnapshot: (copy, no, basis) => { assert.notEqual(copy, e2.g.DB[0]); assert.equal(no, 'WS-9'); assert.equal(basis, 'live'); return live; } } }
  });
  const r2 = JSON.parse(JSON.stringify(e2.ctx.svbLegacyInput('WS-1')));
  assert.equal(r2.basis, 'LIVE_CASE');
  assert.equal(r2.issuedAt, null);
  assert.equal(r2.snapshotSha, null);
  assert.equal('invoiceSnapshot' in e2.g.DB[0], false);
  const e3 = env({ DB: [mk({ status: 'closed', invoiceNo: 'WS-9', gst: '150' })], SaagarModuleBridge: { report: { makeInvoiceSnapshot() { throw new Error('GST rate'); } } } });
  assert.deepEqual(JSON.parse(JSON.stringify(e3.ctx.svbLegacyInput('WS-1'))), { ok: false, code: 'SNAPSHOT_UNBUILDABLE' });
});

// ---------------------------------------------------------------- U91 the old form mirror, with the real page functions
function fakeDom() {
  const byIdMap = {};
  const mkEl = (id, tag) => {
    const el = {
      id: id || '', tag: tag || 'div', value: '', textContent: '', style: {}, children: [], attrs: {}, _cls: new Set(), parentNode: null, _html: '',
      classList: { toggle: (c, on) => { if (on) el._cls.add(c); else el._cls.delete(c); }, contains: c => el._cls.has(c) },
      setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(ch) { ch.parentNode = el; el.children.push(ch); if (ch.id) byIdMap[ch.id] = ch; return ch; },
      insertBefore(ch) { ch.parentNode = el; el.children.push(ch); if (ch.id) byIdMap[ch.id] = ch; return ch; },
      closest(sel) { let p = el; while (p) { if (sel === '#est-tbody' && p.id === 'est-tbody') return p; if (sel === 'table' && p.tag === 'table') return p; p = p.parentNode; } return null; },
      get nextSibling() { return null; },
      get innerHTML() { return el._html; },
      set innerHTML(v) {
        el._html = v;
        if (v === '') { el.children.forEach(ch => { (ch.inputs || []).forEach(i => delete byIdMap[i.id]); delete byIdMap[ch.id]; }); el.children = []; return; }
        el.inputs = [...String(v).matchAll(/id="([^"]+)"/g)].map(m => { const i = mkEl(m[1], 'input'); i.parentNode = el; byIdMap[m[1]] = i; return i; });
      }
    };
    if (id) byIdMap[id] = el;
    return el;
  };
  ['sec-7', 'sec-11', 'f-st', 'f-gst', 'f-gstamt', 'f-tot', 'f-advpaid', 'f-fa', 'f-balance-hint'].forEach(i => mkEl(i, i === 'f-tot' || i === 'f-gstamt' ? 'span' : 'input'));
  const table = mkEl('', 'table'); const holder = mkEl('', 'div'); table.parentNode = holder;
  const tb = mkEl('est-tbody', 'tbody'); tb.parentNode = table;
  const taxBtn = mkEl('', 'button'); taxBtn.textContent = '🧾 GST Tax Invoice';
  return {
    byIdMap, tb, holder, taxBtn,
    document: {
      getElementById: id => byIdMap[id] || null,
      createElement: tag => mkEl('', tag),
      querySelector: sel => (sel === 'button[onclick="doTaxInvoice()"]' ? taxBtn : null),
      querySelectorAll: sel => (sel === '#est-tbody tr' ? tb.children : sel === '#est-tbody input' ? tb.children.flatMap(t => t.inputs || []) : [])
    }
  };
}
function mirrorEnv(over = {}) {
  const dom = fakeDom();
  const real = ['addRow', 'calcTotal', 'set', 'updateBalance', 'g'].map(n => extractFunction(n)).join('\n');
  const e = env(Object.assign({ document: dom.document }, over), real + '\n' + BLOCK);
  // the real addRow appends the new row through document.getElementById('est-tbody')
  return Object.assign(e, { dom });
}
const SYNC = { on: true, lines: [{ desc: 'Battery change x 1', amountText: '500.00' }, { desc: 'Crown x 1', amountText: '680.00' }], advanceText: '300.00', finalText: '1180.00', finalLocked: true, noCharge: false, hint: '' };

test('U91 svbLegacySync mirrors the estimate: one amount-only line each, GST 0, total equals the estimate, locks on, note shown, button relabelled', () => {
  const e = mirrorEnv();
  e.dom.byIdMap['f-gst'].value = '18';
  assert.equal(e.ctx.svbLegacySync(SYNC), true);
  const d = e.dom.byIdMap;
  assert.equal(d['sec-7'].classList.contains('svb-est-master'), true);
  assert.equal(d['sec-11'].classList.contains('svb-bill-locked'), true);
  assert.equal(e.dom.tb.children.length, 2);
  assert.deepEqual(['ed1', 'eq1', 'eu1', 'et1', 'ed2', 'eq2', 'eu2', 'et2'].map(i => d[i].value), ['Battery change x 1', '1', '500.00', '500.00', 'Crown x 1', '1', '680.00', '680.00']);
  assert.equal(d['f-gst'].value, '0');
  assert.equal(d['f-st'].value, '1180.00');
  assert.equal(d['f-tot'].textContent, '1180.00', 'the total equals the estimate total');
  assert.equal(d['f-advpaid'].value, '300.00');
  assert.equal(d['f-fa'].value, '1180.00');
  assert.match(d['f-balance-hint'].textContent, /Advance ₹300 · Balance due ₹880/);
  assert.equal(d['f-fa'].attrs.tabindex, '-1');
  assert.equal(d['eu1'].attrs.tabindex, '-1');
  const note = d['svb-est-note'];
  assert.ok(note && note.textContent.includes('follow the estimate in Billing') && note.attrs['data-no-i18n'] === '');
  assert.equal(e.dom.taxBtn.textContent, '🧾 Bill and receipts');
  // a second sync rebuilds the rows, it does not add to them
  e.ctx.svbLegacySync(Object.assign({}, SYNC, { lines: [SYNC.lines[0]] }));
  assert.equal(e.dom.tb.children.length, 1);
  assert.equal(d['f-tot'].textContent, '500.00');
});

test('U91 svbLegacySync with on false only removes the classes and the locks: values and rows stay; a past view touches nothing', () => {
  const e = mirrorEnv();
  e.ctx.svbLegacySync(SYNC);
  const d = e.dom.byIdMap;
  assert.equal(e.ctx.svbLegacySync({ on: false }), true);
  assert.equal(d['sec-7'].classList.contains('svb-est-master'), false);
  assert.equal(d['sec-11'].classList.contains('svb-bill-locked'), false);
  assert.equal('tabindex' in d['f-fa'].attrs, false);
  assert.equal(d['svb-est-note'].style.display, 'none');
  assert.equal(d['f-fa'].value, '1180.00');
  assert.equal(e.dom.tb.children.length, 2);
  const past = mirrorEnv({ isPastView: () => true });
  assert.equal(past.ctx.svbLegacySync(SYNC), false);
  assert.equal(past.dom.tb.children.length, 0);
  assert.equal(past.dom.byIdMap['f-fa'].value, '');
  assert.equal(past.dom.byIdMap['sec-7'].classList.contains('svb-est-master'), false);
  assert.equal(mirrorEnv().ctx.svbLegacySync(null), false);
});

test('U91 the mirror never saves the case, and a DOM error only warns', () => {
  const e = mirrorEnv();
  e.ctx.svbLegacySync(SYNC);
  assert.equal(e.log.saves, 0);
  const broken = mirrorEnv({ addRow: undefined });
  broken.dom.document.getElementById = () => { throw new Error('dom'); };
  broken.g.document = broken.dom.document;
  assert.equal(broken.ctx.svbLegacySync(SYNC), true);
  assert.ok(broken.log.warns.length >= 1);
});

test('U91 svbLegacyAdvances converts rupees to paise and returns no name', () => {
  const e = env({ DB: [mk({ advancePaid: '1,200', dateRec: '2026-11-10' }), mk({ id: 'WS-2', advancePaid: '0' }), mk({ id: 'WS-3', advancePaid: 'abc' }), mk({ id: 'WS-4', status: 'closed', advancePaid: '75.50', dateRec: '2026-10-01' })] });
  const r = JSON.parse(JSON.stringify(e.ctx.svbLegacyAdvances()));
  assert.deepEqual(r, [{ jobId: 'WS-1', amountPaise: 120000, status: 'open', dateRec: '2026-11-10' }, { jobId: 'WS-4', amountPaise: 7550, status: 'closed', dateRec: '2026-10-01' }]);
  assert.equal(NAMES.some(n => JSON.stringify(r).includes(n)), false);
});

// ---------------------------------------------------------------- U92 the real hooked functions, cut out of the page
function closeEnv({ gate, zero, del, guards = true } = {}) {
  const log = { toasts: [], saves: 0 };
  const globals = { __log: log, setTimeout() {}, confirm: () => true, __del: del };
  if (guards) { globals.__gate = gate; globals.__zero = zero; }
  const ctx = vm.createContext(Object.assign({ console }, globals));
  vm.runInContext(`
    var DB = [{ id: 'WS-1', status: 'open' }], editId = 'WS-1', DENOMS = [];
    function readOnlyGuard() { return false; }
    function toast(m) { __log.toasts.push(String(m)); }
    function svcD3PolicyApi() { return { readinessValid: function () { return true; } }; }
    function byId(id) { return DB.find(function (c) { return c.id === id; }); }
    function readDelivery() { return JSON.parse(JSON.stringify(__del)); }
    function parseRupee(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\\-]/g, '')); return isNaN(n) ? 0 : n; }
    function svcGstValid() { return true; }
    function g() { return ''; }
    function addMonthsIso(d) { return d; }
    function stageOf() { return 'received'; }
    function readForm() { return {}; }
    function logStageChange() {}
    function scheduleWarrantyFollowUp() {}
    function saveDB() { __log.saves++; }
    function persistWatchPhoto() {}
    function showView() {}
    function todayStr() { return '2026-11-18'; }
    ${guards ? "function svbCloseGate(id) { return typeof __gate === 'function' ? __gate(id) : __gate; } function svbAllowsZeroFinal(id) { return __zero; }" : ''}
    ${extractFunction('closeCase')}
  `, ctx);
  return { ctx, log, db: () => vm.runInContext('DB', ctx) };
}
const DEL_OK = { d1: 1, d2: 1, d3: 1, d4: 1, d5: 1, collectDate: '2026-11-18', finalAmt: '1,200', payMode: 'UPI', deno: {} };

test('U92 closeCase: with the billing hooks absent it behaves as before', () => {
  const ok = closeEnv({ del: DEL_OK, guards: false });
  ok.ctx.closeCase();
  assert.equal(ok.db()[0].status, 'closed');
  assert.equal(ok.db()[0].delivery.finalAmt, '1200');
  const zero = closeEnv({ del: Object.assign({}, DEL_OK, { finalAmt: '0' }), guards: false });
  zero.ctx.closeCase();
  assert.equal(zero.db()[0].status, 'open');
  assert.deepEqual(zero.log.toasts, ['⚠ Enter a valid Final Amount before closing']);
});

test('U92 closeCase: a refusing gate stops it with the gate message; an ok gate lets it go on', () => {
  const stop = closeEnv({ del: DEL_OK, gate: { ok: false, message: 'Take the balance first: ₹10.00 is still due on bill B.' }, zero: false });
  stop.ctx.closeCase();
  assert.equal(stop.db()[0].status, 'open');
  assert.equal(stop.log.saves, 0);
  assert.deepEqual(stop.log.toasts, ['⚠ Take the balance first: ₹10.00 is still due on bill B.']);
  const go = closeEnv({ del: DEL_OK, gate: { ok: true }, zero: false });
  go.ctx.closeCase();
  assert.equal(go.db()[0].status, 'closed');
  const nul = closeEnv({ del: DEL_OK, gate: null, zero: false });
  nul.ctx.closeCase();
  assert.equal(nul.db()[0].status, 'closed', 'a null gate (billing not in this build, or an old-way job) closes as today');
});

test('U92 closeCase: a zero final amount closes only when billing allows it (an active no-charge sheet)', () => {
  const del = Object.assign({}, DEL_OK, { finalAmt: '0' });
  const yes = closeEnv({ del, gate: { ok: true }, zero: true });
  yes.ctx.closeCase();
  assert.equal(yes.db()[0].status, 'closed');
  assert.equal(yes.db()[0].delivery.finalAmt, '0');
  const no = closeEnv({ del, gate: { ok: true }, zero: false });
  no.ctx.closeCase();
  assert.equal(no.db()[0].status, 'open');
  assert.match(no.log.toasts[0], /valid Final Amount/);
  const blank = closeEnv({ del: Object.assign({}, DEL_OK, { finalAmt: 'abc' }), gate: { ok: true }, zero: false });
  blank.ctx.closeCase();
  assert.equal(blank.db()[0].status, 'open');
});

test('U92 taxInvoiceById: a true route answer never reaches assignInvoiceNo; a false one runs the old path', () => {
  const run = route => {
    const log = { assigned: 0, previews: [], toasts: [] };
    const ctx = vm.createContext({ console, __log: log, __route: route, window: { parent: null }, SaagarModuleBridge: { report: { preview: (t, a) => log.previews.push([t, a]) } } });
    vm.runInContext(`
      var DB = [{ id: 'WS-1', status: 'closed', invoiceNo: 'SV/2026-27/0001', delivery: { finalAmt: '1200' } }];
      function byId(id) { return DB.find(function (c) { return c.id === id; }); }
      function toast(m) { __log.toasts.push(m); }
      function assignInvoiceNo(c) { __log.assigned++; return c.invoiceNo; }
      function svbTaxInvoiceRoute() { return __route; }
      ${extractFunction('taxInvoiceById')}
    `, ctx);
    ctx.taxInvoiceById('WS-1');
    return log;
  };
  const a = run(true);
  assert.equal(a.assigned, 0); assert.deepEqual(a.previews, []); assert.deepEqual(a.toasts, []);
  const b = run(false);
  assert.equal(b.assigned, 1);
  assert.deepEqual(b.previews.map(p => p[0]), ['serviceTaxInvoice']);
  // without the hook defined at all (the other sandboxes): the old path, as before
  const log = { assigned: 0, previews: [] };
  const ctx = vm.createContext({ console, __log: log, window: { parent: null }, SaagarModuleBridge: { report: { preview: (t) => log.previews.push(t) } } });
  vm.runInContext(`var DB = [{ id: 'WS-1', status: 'closed', invoiceNo: 'N', delivery: { finalAmt: '5' } }]; function byId(id) { return DB[0]; } function toast() {} function assignInvoiceNo(c) { __log.assigned++; return c.invoiceNo; } ${extractFunction('taxInvoiceById')}`, ctx);
  ctx.taxInvoiceById('WS-1');
  assert.equal(log.assigned, 1);
});

test('U92 markEstimateApproved: a true hook never reaches prompt; without the hook the old prompts run', () => {
  const run = (hook) => {
    const log = { prompts: 0, saves: 0 };
    const ctx = vm.createContext({ console, __log: log, __hook: hook, prompt: () => { log.prompts++; return 'call'; }, confirm: () => true });
    vm.runInContext(`
      var DB = [{ id: 'WS-1', status: 'open', estTotal: '1000', advisor: 'A' }];
      function readOnlyGuard() { return false; }
      function byId(id) { return DB.find(function (c) { return c.id === id; }); }
      function g() { return ''; }
      function parseRupee(v) { return parseFloat(v) || 0; }
      function nowLocalDT() { return 'x'; }
      function saveDB() { __log.saves++; }
      function renderDash() {}
      function toast() {}
      ${hook === undefined ? '' : 'function svbOpenApproval() { return __hook; }'}
      ${extractFunction('markEstimateApproved')}
    `, ctx);
    ctx.markEstimateApproved('WS-1');
    return { log, c: vm.runInContext('DB[0]', ctx) };
  };
  const a = run(true);
  assert.equal(a.log.prompts, 0); assert.equal(a.log.saves, 0); assert.equal(a.c.estimateApproval, undefined);
  const b = run(false);
  assert.ok(b.log.prompts >= 1); assert.equal(b.log.saves, 1); assert.equal(b.c.estimateApproval.via, 'call');
  const c = run(undefined);
  assert.ok(c.log.prompts >= 1 && c.log.saves === 1, 'the hook function does not exist: the old flow');
});

test('U92 delCase and svcFinishDelete block when svbBlocksDelete says so, and not when the hook is absent', () => {
  const run = (blocks, fn) => {
    const log = { finished: 0, recorded: 0, confirms: 0 };
    const ctx = vm.createContext({ console, __log: log, __blocks: blocks, confirm: () => { log.confirms++; return true; } });
    vm.runInContext(`
      var DB = [{ id: 'WS-1', status: 'open' }];
      function readOnlyGuard() { return false; }
      function byId(id) { return DB.find(function (c) { return c.id === id; }); }
      function toast() {}
      function svcInvoiceLocked() { return false; }
      function svcRecordDeletion() { __log.recorded++; return true; }
      function saveDB() {}
      function svcEv() { return null; }
      function renderDash() {}
      function watchKey(i) { return i; }
      function watchKeyAfter(i) { return i; }
      function svcDeleteClosedWithApproval() {}
      ${blocks === undefined ? '' : 'function svbBlocksDelete() { return __blocks; }'}
      ${extractFunction('svcFinishDelete')}
      ${extractFunction('delCase')}
    `, ctx);
    if (fn === 'del') ctx.delCase('WS-1'); else ctx.svcFinishDelete(vm.runInContext('DB[0]', ctx), { pin: false, reason: '' });
    return { log, db: vm.runInContext('DB.length', ctx) };
  };
  let r = run(true, 'del');
  assert.equal(r.log.confirms, 0, 'blocked before any confirm'); assert.equal(r.db, 1);
  r = run(true, 'fin');
  assert.equal(r.log.recorded, 0, 'no tombstone after the awaited PIN'); assert.equal(r.db, 1);
  r = run(false, 'del');
  assert.equal(r.log.confirms, 1); assert.equal(r.db, 0);
  r = run(undefined, 'del');
  assert.equal(r.db, 0, 'no billing hook: delete as today');
  r = run(undefined, 'fin');
  assert.equal(r.log.recorded, 1);
});

test('A-PAGE svbFirm: the firm of the version 1 invoice (from the report engine), state code from the GSTIN; no engine gives an empty firm', () => {
  const firm = { name: 'Invented Works', gstin: '27aaaaa0000a1z5', address: '1 Test Road' };
  const e = env({ SaagarModuleBridge: { report: { makeInvoiceSnapshot: (j, no) => { assert.deepEqual(JSON.parse(JSON.stringify(j)), {}); assert.equal(no, ''); return { firm }; } } } });
  assert.deepEqual(JSON.parse(JSON.stringify(e.ctx.svbFirm())), { name: 'Invented Works', gstin: '27AAAAA0000A1Z5', address: '1 Test Road', state: '', stateCode: '27' });
  assert.deepEqual(JSON.parse(JSON.stringify(env().ctx.svbFirm())), {});
  const t = env({ SaagarModuleBridge: { report: { makeInvoiceSnapshot: () => { throw new Error('boom'); } } } });
  assert.deepEqual(JSON.parse(JSON.stringify(t.ctx.svbFirm())), {});
  assert.equal(t.log.warns.length, 1);
});

test('A-PAGE svbTaxInvoiceRoute with billing unavailable: an old number prints the old way; a NEW bill (frozen bill-to) is refused, never printed as an old tax invoice', () => {
  const e = env({ DB: [mk({ id: 'WS-OLD', invoiceNo: 'SV/2026-27/0003' }), mk({ id: 'WS-NEW', invoiceNo: 'SV/2026-27/0009', svbBillTo: { 'SV/2026-27/0009': { name: 'x', mobile: '', address: '', at: 't' } } })] });
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-OLD'), false, 'old reprint, exactly as before');
  assert.equal(e.ctx.svbTaxInvoiceRoute('WS-NEW'), true, 'refused');
  assert.match(e.log.toasts.at(-1), /cannot be printed now/);
  // the same with billing present but failing
  const f = withBilling({ taxRoute: () => ({ ok: false, code: 'X' }), repairLinks: () => ({ ok: true, rows: [] }) }, { DB: [mk({ id: 'WS-NEW', invoiceNo: 'SV/2026-27/0009', svbBillTo: { 'SV/2026-27/0009': { name: 'x' } } })] });
  assert.equal(f.ctx.svbTaxInvoiceRoute('WS-NEW'), true);
});

test('Stage E round 3 (D-perf-1): the open-time link repair saves the job list ONCE, however many jobs it repairs', () => {
  // 1,451 repairs used to be 1,451 saves of the whole job list (about 2 GB of text on the tester's data); now one save in all
  const N = 300;
  const rows = [];
  const DB = [];
  for (let i = 1; i <= N; i++) { DB.push(mk({ id: 'WS-' + i })); rows.push({ jobId: 'WS-' + i, invoiceNo: 'SV/2026-27/' + String(i).padStart(4, '0'), state: 'ISSUED' }); }
  const e = withBilling({ repairLinks: () => rows }, { DB });
  assert.equal(e.ctx.svbApplyRepairs(), N);
  assert.equal(e.log.saves, 1, 'one save for all repaired jobs');
  assert.equal(e.g.DB[N - 1].invoiceNo, 'SV/2026-27/0300');
  assert.ok(e.g.DB[0].svbBillTo['SV/2026-27/0001'], 'the bill-to copy is still frozen per number');
  assert.equal(e.ctx.svbApplyRepairs(), 0);
  assert.equal(e.log.saves, 1, 'nothing to repair: no save');
  // a failed save reports nothing repaired, so the next open repairs again (the storage still holds the old numbers)
  const bad = withBilling({ repairLinks: () => rows.slice(0, 3) }, { DB: [mk({ id: 'WS-1' }), mk({ id: 'WS-2' }), mk({ id: 'WS-3' })], saveDB() { throw new Error('quota'); } });
  assert.equal(bad.ctx.svbApplyRepairs(), 0);
  assert.equal(bad.log.warns.length, 1);
  // one job set from the bill screen still saves at once
  const one = withBilling({}, { DB: [mk()] });
  assert.equal(one.ctx.svbSetCaseInvoice('WS-1', 'SV/2026-27/0001'), true);
  assert.equal(one.log.saves, 1);
});

test('Stage E round 4 (D-perf-5): a print refusal is shown with its own sentence, never a blank preview', () => {
  const previews = [];
  const e = env({ SaagarModuleBridge: { report: { preview: (t, o) => previews.push(t) } } });
  assert.equal(e.ctx.svbPrintGo('serviceBillSummary', {}, { ok: false, code: 'WRONG_DOC', message: 'This job is not billed in CCPT. Open the Tax Invoice instead.' }), false);
  assert.ok(e.log.toasts.some((m) => m.includes('This job is not billed in CCPT. Open the Tax Invoice instead.')), JSON.stringify(e.log.toasts));
  assert.equal(previews.length, 0, 'no preview is opened for a refusal');
  assert.equal(e.ctx.svbPrintGo('serviceBillSummary', {}, null), false);
  assert.ok(e.log.toasts.some((m) => m.includes('Nothing could be prepared to print.')));
});
