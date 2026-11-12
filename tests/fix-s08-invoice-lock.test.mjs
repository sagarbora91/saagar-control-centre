import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { extractFunction, fakeStorage, sandbox, service } from './lib/fix-s08-source.mjs';

const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
const lineStarting = (prefix) => {
  const i = service.indexOf(prefix);
  assert.ok(i > -1, 'expected line starting ' + prefix);
  return service.slice(i, service.indexOf('\n', i));
};

// ───────────────────────── U07-F04: invoice lock ─────────────────────────
function lockEnv(opts = {}) {
  const values = Object.assign({ 'f-dr': '2026-11-01', 'f-cn': 'Old Name', 'f-cm': '9876543210', 'f-wb': 'Titan', 'f-wm': 'M1', 'f-ono': 'WS-2026-001', 'f-gst': '18', 'f-ed': '' }, opts.values || {});
  const lockedCase = {
    id: 'WS-2026-001', status: 'closed', invoiceNo: 'SV/2026-27/0001', custName: 'Old Name', custMobile: '9876543210', dateRec: '2026-11-01', expDel: '', brand: 'Titan', model: 'M1',
    invoiceSnapshot: { v: 1, invoiceNo: 'SV/2026-27/0001', customer: { name: 'Old Name' }, figs: { total: 354 } }, delivery: { finalAmt: '354' }
  };
  const log = { reauth: [], prompts: [], toasts: [], saves: 0 };
  const globals = {
    __values: values, __log: log, __reauthAnswer: opts.reauth === true, __promptAnswer: opts.prompt === undefined ? '' : opts.prompt,
    document: { getElementById: () => ({ style: { display: '' }, textContent: '', checked: false, value: '' }) },
    window: {}
  };
  const code = `
    var DB = [${JSON.stringify(lockedCase)}], editId = 'WS-2026-001', SVC_SETTINGS = {};
    function readOnlyGuard(){ return false; }
    function g(id){ return __values[id] == null ? '' : String(__values[id]); }
    function toast(m){ __log.toasts.push(String(m)); }
    function scrollToSec(){}
    function hasWatchPhotoNow(){ return true; }
    function readForm(){ return { custName: g('f-cn'), custMobile: g('f-cm'), dateRec: g('f-dr'), expDel: g('f-ed'), brand: g('f-wb'), model: g('f-wm'), gst: g('f-gst'), stage: 'received', prog: 5 }; }
    function cp(){ return 50; }
    function byId(id){ return DB.find(function(c){ return c.id === id; }); }
    function stageOf(){ return 'received'; }
    function todayStr(){ return '2026-11-12'; }
    function svcLegalCapture(){ return { ok: true }; }
    function logStageChange(){}
    function saveDB(){ __log.saves++; }
    function persistWatchPhoto(){}
    function offerReadyNotify(){}
    function mobileDigits(v){ return String(v||'').replace(/\\D/g,'').slice(-10); }
    function readDelivery(){ return {}; }
    function set(){}
    function genId(){ return 'WS-2026-099'; }
    function svcNoteIssuedId(){ return true; }
    function svcActorLabel(){ return 'Owner'; }
    async function svcD3Reauth(r){ __log.reauth.push(r); return __reauthAnswer; }
    function prompt(m){ __log.prompts.push(m); return __promptAnswer; }
    ${service.includes('function svcGstValid') ? extractFunction('svcGstValid') : 'function svcGstValid(){ return true; }'}
    ${extractFunction('validMobile')}
    ${service.includes('function svcInvoiceLocked') ? extractFunction('svcInvoiceLocked') : 'function svcInvoiceLocked(){ return false; }'}
    ${service.includes('let _svcApproval') ? lineStarting('let _svcApproval') : 'var _svcApproval = null;'}
    ${service.includes('const SVC_DIFF_SKIP') ? lineStarting('const SVC_DIFF_SKIP') : ''}
    ${service.includes('function svcDiffCase') ? extractFunction('svcDiffCase') : ''}
    ${service.includes('function svcRequestCorrectionApproval') ? extractFunction('svcRequestCorrectionApproval') : ''}
    ${service.includes('function svcDeliveryDraftEmpty') ? extractFunction('svcDeliveryDraftEmpty') : 'function svcDeliveryDraftEmpty(){ return true; }'}
    ${extractFunction('doSave')}
  `;
  const ctx = sandbox(globals, code);
  return { ctx, values, log, get db() { return vm.runInContext('DB', ctx); }, snapshot0: JSON.parse(JSON.stringify(lockedCase.invoiceSnapshot)), raw0: JSON.stringify(lockedCase) };
}

test('U07-F04: svcInvoiceLocked is true only for closed cases with an invoice number', () => {
  const fn = extractFunction('svcInvoiceLocked');
  const ctx = sandbox({}, fn);
  assert.equal(ctx.svcInvoiceLocked({ status: 'closed', invoiceNo: 'SV/2026-27/0001' }), true);
  assert.equal(ctx.svcInvoiceLocked({ status: 'closed' }), false);
  assert.equal(ctx.svcInvoiceLocked({ status: 'open', invoiceNo: 'SV/2026-27/0001' }), false);
  assert.equal(ctx.svcInvoiceLocked(null), false);
});

test('U07-F04: a changed invoiced case without approval is not saved', async () => {
  const e = lockEnv({ values: { 'f-cn': 'New Name' }, prompt: '', reauth: false });
  e.ctx.doSave();
  await tick();
  assert.equal(e.db[0].custName, 'Old Name');
  assert.equal(e.log.reauth.length, 0, 'no PIN asked when the reason is blank');
  assert.equal(e.log.prompts.length, 1);

  const e2 = lockEnv({ values: { 'f-cn': 'New Name' }, prompt: 'typo in the customer name', reauth: false });
  e2.ctx.doSave();
  await tick();
  assert.equal(e2.db[0].custName, 'Old Name');
  assert.equal(e2.log.reauth.length, 1);
  assert.ok(e2.log.toasts.some(t => t.includes('Nothing was saved')));
});

test('U07-F04: with a reason and the Owner PIN the correction is saved and logged, the snapshot stays frozen', async () => {
  const e = lockEnv({ values: { 'f-cn': 'New Name' }, prompt: 'typo in the customer name', reauth: true });
  e.ctx.doSave();
  await tick();
  const c = e.db[0];
  assert.equal(c.custName, 'New Name');
  assert.equal(c.corrections.length, 1);
  assert.equal(c.corrections[0].reason, 'typo in the customer name');
  assert.ok(c.corrections[0].by);
  assert.equal(c.corrections[0].changed[0].field, 'custName');
  assert.deepEqual(JSON.parse(JSON.stringify(c.invoiceSnapshot)), e.snapshot0);
  assert.equal(c.invoiceNo, 'SV/2026-27/0001');
});

test('U07-F04: an unchanged invoiced case says "No changes to save" and asks nothing', async () => {
  const e = lockEnv({ values: { 'f-gst': '' }, prompt: 'x'.repeat(10), reauth: true });
  e.ctx.doSave();
  await tick();
  assert.ok(e.log.toasts.includes('No changes to save'));
  assert.equal(e.log.prompts.length, 0);
  assert.equal(e.log.reauth.length, 0);
});

test('U07-F04: the lock banner is painted from applyReadOnlyUI and openNew', () => {
  assert.ok(service.includes('function svcPaintInvoiceLockBanner'));
  const ro = extractFunction('applyReadOnlyUI');
  assert.ok(ro.trimEnd().replace(/\}$/, '').trimEnd().endsWith('svcPaintInvoiceLockBanner();'));
  assert.ok(/showView\('form'\);\s*svcPaintInvoiceLockBanner\(\);/.test(extractFunction('openNew')));
});

// ───────────────────────── U07-F05: delete ─────────────────────────
function delEnv({ confirmAnswers = [true, true], prompt = 'wrong item booked', reauth = true, recordOk = true } = {}) {
  const log = { confirms: [], prompts: [], reauth: [], toasts: [], tomb: [], purged: [] };
  let ci = 0;
  const g = {
    __log: log,
    confirm: m => { log.confirms.push(String(m)); return confirmAnswers[Math.min(ci++, confirmAnswers.length - 1)]; },
    prompt: m => { log.prompts.push(String(m)); return prompt; },
    svcD3Reauth: async r => { log.reauth.push(r); return reauth; },
    svcRecordDeletion: (c, how) => { log.tomb.push({ id: c.id, how }); return recordOk; },
    svcEv: () => ({ delByKey: k => log.purged.push(k) }),
    watchKey: id => 'w|' + id, watchKeyAfter: id => 'a|' + id, readOnlyGuard: () => false,
    toast: m => log.toasts.push(String(m)), renderDash: () => {}, saveDB: () => { log.saved = true; }
  };
  const code = `
    var DB = [{id:'INV',status:'closed',invoiceNo:'SV/2026-27/0001'},{id:'CLS',status:'closed'},{id:'OPN',status:'open'}];
    function byId(id){ return DB.find(function(c){ return c.id === id; }); }
    ${extractFunction('svcInvoiceLocked')}
    ${extractFunction('delCase')}
    ${service.includes('function svcDeleteClosedWithApproval') ? extractFunction('svcDeleteClosedWithApproval') : ''}
    ${service.includes('function svcFinishDelete') ? extractFunction('svcFinishDelete') : ''}
  `;
  const ctx = sandbox(g, code);
  return { ctx, log, ids: () => vm.runInContext('DB.map(function(c){return c.id})', ctx) };
}

test('U07-F05: an invoiced case can never be deleted', async () => {
  const e = delEnv();
  e.ctx.delCase('INV'); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(e.ids())), ['INV', 'CLS', 'OPN']);
  assert.equal(e.log.reauth.length, 0);
  assert.ok(e.log.toasts.some(t => t.includes('cannot be deleted')));
});

test('U07-F05: a delivered, not invoiced case needs confirm + reason + Owner PIN', async () => {
  const e = delEnv();
  e.ctx.delCase('CLS'); await tick();
  assert.ok(!e.ids().includes('CLS'));
  assert.equal(e.log.reauth.length, 1);
  assert.equal(e.log.tomb[0].how.pin, true);
  assert.equal(e.log.tomb[0].how.reason, 'wrong item booked');

  const e2 = delEnv({ reauth: false });
  e2.ctx.delCase('CLS'); await tick();
  assert.ok(e2.ids().includes('CLS'));

  const e3 = delEnv({ prompt: 'no' });
  e3.ctx.delCase('CLS'); await tick();
  assert.ok(e3.ids().includes('CLS'));
  assert.equal(e3.log.reauth.length, 0);
});

test('U07-F05: an open case is removed with a confirm only, and a cancel keeps it', async () => {
  const e = delEnv();
  e.ctx.delCase('OPN'); await tick();
  assert.ok(!e.ids().includes('OPN'));
  assert.equal(e.log.reauth.length, 0);
  assert.equal(e.log.tomb[0].how.pin, false);
  assert.deepEqual(e.log.purged.sort(), ['a|OPN', 'w|OPN']);

  const e2 = delEnv({ confirmAnswers: [false] });
  e2.ctx.delCase('OPN'); await tick();
  assert.ok(e2.ids().includes('OPN'));
});

test('U07-F05: a failed tombstone write keeps the case', async () => {
  const e = delEnv({ recordOk: false });
  e.ctx.delCase('OPN'); await tick();
  assert.ok(e.ids().includes('OPN'));
  assert.ok(e.log.toasts.some(t => t.includes('The case was kept')));
});

// ───────────────────────── U07-F07 / S08-1: invoice numbers and snapshot ─────────────────────────
function invEnv({ snap = true, throwMsg = '', saveOk = true, cases = [] } = {}) {
  const store = fakeStorage();
  const log = { toasts: [], saves: 0, snapCalls: [] };
  const G = {
    __log: log, __store: store, __saveOk: saveOk,
    localStorage: store,
    SaagarModuleBridge: snap ? { report: { makeInvoiceSnapshot(copy, no) { log.snapCalls.push({ copy, no }); if (throwMsg) throw new Error(throwMsg); return { v: 1, basis: 'issue', invoiceNo: no, lines: (copy.lineItems || []).map(x => Object.assign({}, x)), figs: { total: copy.delivery && copy.delivery.finalAmt } }; } } } : { report: null }
  };
  const code = `
    var DB = ${JSON.stringify(cases)};
    var SVC_SETTINGS = {};
    var SVC_SETTINGS_KEY = 'saagar_wsf_settings_v1';
    function todayStr(){ return '2026-11-12'; }
    function toast(m){ __log.toasts.push(String(m)); }
    function saveDB(){ __log.saves++; }
    function saveSvcSettings(){ if(!__saveOk) return false; __store.setItem(SVC_SETTINGS_KEY, JSON.stringify(SVC_SETTINGS)); return true; }
    function svcReloadSettings(){ return SVC_SETTINGS; }
    ${extractFunction('svcFinancialYear')}
    ${extractFunction('svcInvoiceDateOf')}
    ${extractFunction('assignInvoiceNo')}
  `;
  const ctx = sandbox(G, code);
  return { ctx, log, store, db: () => vm.runInContext('DB', ctx), settings: () => vm.runInContext('SVC_SETTINGS', ctx), add(c) { vm.runInContext('DB.push(' + JSON.stringify(c) + ')', ctx); return vm.runInContext('DB[DB.length-1]', ctx); } };
}
const closedCase = (id, date, extra = {}) => Object.assign({ id, status: 'closed', delivery: { finalAmt: '354', collectDate: date }, lineItems: [{ desc: 'Battery', qty: 1, unit: 300, total: 300 }] }, extra);

test('U07-F07: financial year runs April to March', () => {
  const e = invEnv();
  assert.equal(e.ctx.svcFinancialYear('2027-03-31'), '2026-27');
  assert.equal(e.ctx.svcFinancialYear('2027-04-01'), '2027-28');
  assert.equal(e.ctx.svcFinancialYear('2026-04-01'), '2026-27');
});

test('U07-F07: numbers are SV/<FY>/<nnnn>, restart each year, idempotent and never clash with job ids', () => {
  const e = invEnv();
  const a = e.add(closedCase('WS-2026-001', '2026-11-01'));
  const b = e.add(closedCase('WS-2026-002', '2026-11-02'));
  const c = e.add(closedCase('WS-2026-003', '2027-04-02'));
  assert.equal(e.ctx.assignInvoiceNo(a), 'SV/2026-27/0001');
  assert.equal(e.ctx.assignInvoiceNo(b), 'SV/2026-27/0002');
  assert.equal(e.ctx.assignInvoiceNo(c), 'SV/2027-28/0001');
  assert.equal(e.ctx.assignInvoiceNo(a), 'SV/2026-27/0001');
  assert.equal(JSON.parse(e.store.getItem('saagar_wsf_settings_v1')).invoiceSeq['2026-27'], 2, 'second call did not advance');
  assert.ok(!/^WS-/.test(a.invoiceNo));
});

test('U07-F07: an old WS- number is returned unchanged and gets no invented snapshot', () => {
  const e = invEnv();
  const old = e.add(closedCase('WS-2026-004', '2026-05-01', { invoiceNo: 'WS-2026-005' }));
  assert.equal(e.ctx.assignInvoiceNo(old), 'WS-2026-005');
  assert.equal(old.invoiceSnapshot, undefined);
  assert.equal(e.log.snapCalls.length, 0);
  assert.equal(e.log.saves, 0);
});

test('U07-F07: a number already used by another case is skipped', () => {
  const e = invEnv({ cases: [closedCase('WS-2026-001', '2026-11-01', { invoiceNo: 'SV/2026-27/0001' })] });
  const c = e.add(closedCase('WS-2026-002', '2026-11-02'));
  assert.equal(e.ctx.assignInvoiceNo(c), 'SV/2026-27/0002');
});

test('S08-1: the snapshot is built by SaagarReport.makeInvoiceSnapshot on a copy, before the counter is saved, and is a frozen copy', () => {
  const e = invEnv();
  const c = e.add(closedCase('WS-2026-001', '2026-11-01'));
  const no = e.ctx.assignInvoiceNo(c);
  assert.equal(e.log.snapCalls.length, 1);
  assert.equal(e.log.snapCalls[0].no, no);
  assert.notEqual(e.log.snapCalls[0].copy, c, 'builder gets a copy');
  assert.equal(c.invoiceNo, no);
  assert.equal(c.invoiceSnapshot.invoiceNo, no);
  assert.equal(e.log.saves, 1);
  c.lineItems[0].desc = 'changed later';
  assert.equal(c.invoiceSnapshot.lines[0].desc, 'Battery');
});

test('S08-1: a builder that throws or is missing assigns no number and does not advance the counter', () => {
  const e = invEnv({ throwMsg: 'GST out of range' });
  const c = e.add(closedCase('WS-2026-001', '2026-11-01'));
  assert.equal(e.ctx.assignInvoiceNo(c), '');
  assert.equal(c.invoiceNo, undefined);
  assert.equal(c.invoiceSnapshot, undefined);
  assert.equal(e.store.getItem('saagar_wsf_settings_v1'), null, 'counter not saved');
  assert.deepEqual(e.settings().invoiceSeq || {}, {});
  assert.ok(e.log.toasts.some(t => t.includes('Invoice not issued') && t.includes('GST out of range')));

  const e2 = invEnv({ snap: false });
  const c2 = e2.add(closedCase('WS-2026-001', '2026-11-01'));
  assert.equal(e2.ctx.assignInvoiceNo(c2), '');
  assert.equal(e2.store.getItem('saagar_wsf_settings_v1'), null);
  assert.ok(e2.log.toasts.some(t => t.includes('Invoice not issued')));
});

test('S08-1: a failed counter save leaves the case unnumbered', () => {
  const e = invEnv({ saveOk: false });
  const c = e.add(closedCase('WS-2026-001', '2026-11-01'));
  assert.equal(e.ctx.assignInvoiceNo(c), '');
  assert.equal(c.invoiceNo, undefined);
  assert.equal(c.invoiceSnapshot, undefined);
});

test('S08-1: svcBuildSnapshot and the legacy snapshot branch are gone', () => {
  assert.ok(!service.includes('svcBuildSnapshot'));
  assert.ok(!/legacy:\s*true/.test(service));
});

test('U07-F07: taxInvoiceById refuses an open case and stops when no number was issued', () => {
  const toasts = [];
  let previews = 0;
  const src = extractFunction('taxInvoiceById');
  assert.ok(src.includes("c.status !== 'closed'"));
  assert.ok(/if \(!no\) return;/.test(src));
  const ctx = sandbox({
    toasts, window: { parent: null },
    SaagarModuleBridge: { report: { preview() { previews += 1; } } }, toast: m => toasts.push(m)
  }, `
    var DB = [{id:'A',status:'open',delivery:{finalAmt:'100'}},{id:'B',status:'closed',delivery:{finalAmt:'100'}}];
    function byId(id){ return DB.find(function(c){return c.id===id}); }
    var NO = '';
    function assignInvoiceNo(){ return NO; }
    ${src}
  `);
  ctx.taxInvoiceById('A');
  assert.equal(previews, 0);
  assert.ok(toasts.length === 1);
  ctx.taxInvoiceById('B');
  assert.equal(previews, 0, 'no number, no preview');
  vm.runInContext("NO = 'SV/2026-27/0001'", ctx);
  ctx.taxInvoiceById('B');
  assert.equal(previews, 1);
});
