import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { extractFunction, sandbox, service } from './lib/fix-s08-source.mjs';

// ───────────────── U07-F09 + G8: Indian mobile rule ─────────────────
test('G8 / U07-F09: validMobile accepts 10 digits, +91, 91 and 0 prefixes; rejects the rest', () => {
  const ctx = sandbox({}, extractFunction('validMobile'));
  for (const ok of ['9876543210', '+91 98765 43210', '919876543210', '09876543210', '98765-43210', '6000000000'])
    assert.equal(ctx.validMobile(ok), true, ok + ' should be accepted');
  for (const bad of ['98765000021', '1234567890', '0000000000', '12345', '', null, '5876543210', '9198765432101', '+91 12345 67890'])
    assert.equal(ctx.validMobile(bad), false, String(bad) + ' should be rejected');
});

// ───────────────── U07-F10: GST range ─────────────────
test('U07-F10: svcGstValid', () => {
  const ctx = sandbox({}, extractFunction('svcGstValid'));
  for (const ok of ['', '0', '18', '5.5', '18%', '100']) assert.equal(ctx.svcGstValid(ok), true, ok);
  for (const bad of ['150', '-10', 'abc', '18 18', '100.1']) assert.equal(ctx.svcGstValid(bad), false, bad);
});

function calcEnv(gst) {
  const els = {
    'f-st': { value: '1000' }, 'f-gst': { value: gst, style: {} }, 'f-gstamt': { textContent: '' }, 'f-tot': { textContent: '' }
  };
  const ctx = sandbox({
    document: { getElementById: id => els[id] || null, querySelectorAll: () => [] }
  }, `
    var subTotalDirty = true;
    function parseRupee(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\\-]/g, '')); return isNaN(n) ? 0 : n; }
    ${extractFunction('calcTotal')}
  `);
  ctx.calcTotal();
  return els;
}
test('U07-F10: calcTotal never shows a wrong total for an out-of-range GST', () => {
  assert.equal(calcEnv('150')['f-tot'].textContent, '1000.00');
  assert.equal(calcEnv('-10')['f-tot'].textContent, '1000.00');
  assert.equal(calcEnv('18')['f-tot'].textContent, '1180.00');
  assert.equal(calcEnv('150')['f-gst'].style.borderColor, 'var(--red)');
  assert.equal(calcEnv('18')['f-gst'].style.borderColor, '');
});

// ───────────────── doSave environment (F06, F09, F10, LOW-019) ─────────────────
function saveEnv(values, { editCase = null } = {}) {
  const log = { toasts: [], saves: 0 };
  const base = { 'f-dr': '2026-11-10', 'f-cn': 'Asha', 'f-cm': '9876543210', 'f-wb': 'Titan', 'f-wm': 'M1', 'f-ono': 'WS-2026-001', 'f-gst': '18', 'f-ed': '' };
  const vals = Object.assign(base, values);
  const dom = {};
  const el = id => dom[id] || (dom[id] = { style: { display: id === 's11-open' ? 'block' : '' }, textContent: '', value: '' });
  const ctx = sandbox({
    __v: vals, __log: log,
    document: { getElementById: el },
    __deliv: values.__deliv || null
  }, `
    var DB = ${JSON.stringify(editCase ? [editCase] : [])}, editId = ${editCase ? JSON.stringify(editCase.id) : 'null'}, SVC_SETTINGS = {};
    function readOnlyGuard(){ return false; }
    function g(id){ return __v[id] == null ? '' : String(__v[id]); }
    function toast(m){ __log.toasts.push(String(m)); }
    function scrollToSec(){}
    function hasWatchPhotoNow(){ return true; }
    function readForm(){ return { custName: g('f-cn'), custMobile: g('f-cm'), dateRec: g('f-dr'), expDel: g('f-ed'), brand: g('f-wb'), model: g('f-wm'), gst: g('f-gst'), stage: 'received' }; }
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
    function readDelivery(){ return __deliv || {}; }
    function set(){}
    function genId(){ return 'WS-2026-099'; }
    function svcNoteIssuedId(){ return true; }
    function svcInvoiceLocked(){ return false; }
    function svcDiffCase(){ return []; }
    var _svcApproval = null;
    ${extractFunction('validMobile')}
    ${extractFunction('svcGstValid')}
    ${extractFunction('svcDeliveryDraftEmpty')}
    ${extractFunction('doSave')}
  `);
  return { ctx, log, db: () => vm.runInContext('DB', ctx) };
}
const open = (extra = {}) => Object.assign({ id: 'WS-2026-001', status: 'open', custName: 'Asha', custMobile: '9876543210', dateRec: '2026-11-10', expDel: '', brand: 'Titan', model: 'M1' }, extra);

test('U07-F09: a bad new mobile is refused with the new text; an unchanged stored odd number stays saveable', () => {
  const e = saveEnv({ 'f-cm': '98765000021' });
  e.ctx.doSave();
  assert.equal(e.db().length, 0);
  assert.ok(e.log.toasts[0].includes('valid 10-digit Indian mobile'));

  const old = open({ custMobile: '1312345678' });
  const e2 = saveEnv({ 'f-cm': '1312345678' }, { editCase: old });
  e2.ctx.doSave();
  assert.ok(e2.log.toasts.some(t => t.startsWith('✓ Saved')));

  const e3 = saveEnv({ 'f-cm': '1312345679' }, { editCase: old });
  e3.ctx.doSave();
  assert.ok(e3.log.toasts[0].includes('valid 10-digit Indian mobile'));
  assert.ok(service.includes('.custMobile === mobile'));
});

test('U07-F10: doSave refuses a GST outside 0 to 100, closeCase checks it too', () => {
  const e = saveEnv({ 'f-gst': '150' });
  e.ctx.doSave();
  assert.equal(e.db().length, 0);
  assert.ok(e.log.toasts[0].includes('GST % must be a number from 0 to 100'));
  assert.ok(extractFunction('closeCase').includes('GST % must be a number from 0 to 100'));
});

test('U07-LOW-019: future received date and delivery before received are refused; equal and unchanged legacy are accepted', () => {
  const a = saveEnv({ 'f-dr': '2026-11-20' });
  a.ctx.doSave();
  assert.equal(a.db().length, 0);
  assert.ok(a.log.toasts[0].includes('Date Received cannot be in the future'));

  const b = saveEnv({ 'f-dr': '2026-11-10', 'f-ed': '2026-11-09' });
  b.ctx.doSave();
  assert.equal(b.db().length, 0);
  assert.ok(b.log.toasts[0].includes('Expected Delivery cannot be before Date Received'));

  const c = saveEnv({ 'f-dr': '2026-11-10', 'f-ed': '2026-11-10' });
  c.ctx.doSave();
  assert.equal(c.db().length, 1);

  const legacy = open({ dateRec: '2026-11-10', expDel: '2026-11-01' });
  const d = saveEnv({ 'f-dr': '2026-11-10', 'f-ed': '2026-11-01' }, { editCase: legacy });
  d.ctx.doSave();
  assert.ok(d.log.toasts.some(t => t.startsWith('✓ Saved')));
});

// ───────────────── U07-F06: delivery draft ─────────────────
test('U07-F06: svcDeliveryDraftEmpty', () => {
  const ctx = sandbox({}, extractFunction('svcDeliveryDraftEmpty'));
  assert.equal(ctx.svcDeliveryDraftEmpty(null), true);
  assert.equal(ctx.svcDeliveryDraftEmpty({ deno: {} }), true);
  assert.equal(ctx.svcDeliveryDraftEmpty({ d1: true }), false);
  assert.equal(ctx.svcDeliveryDraftEmpty({ delCustSig: 'x' }), false);
  assert.equal(ctx.svcDeliveryDraftEmpty({ deno: { 500: '1' } }), false);
  assert.equal(ctx.svcDeliveryDraftEmpty({ finalAmt: '500' }), false);
});

test('U07-F06: Save Order on an open case keeps typed delivery details as deliveryDraft (never as delivery)', () => {
  const deliv = { d1: true, d2: true, d3: true, d4: true, d5: true, finalAmt: '500', payMode: 'Cash', deno: {} };
  const e = saveEnv({ __deliv: deliv }, { editCase: open() });
  e.ctx.doSave();
  const c = e.db()[0];
  assert.deepEqual(JSON.parse(JSON.stringify(c.deliveryDraft)), deliv);
  assert.equal(c.delivery, undefined);

  const e2 = saveEnv({ __deliv: { deno: {} } }, { editCase: open({ deliveryDraft: deliv }) });
  e2.ctx.doSave();
  assert.equal(e2.db()[0].deliveryDraft, undefined, 'an emptied draft is removed');
});

test('U07-F06: populateForm fills from deliveryDraft, and delivery wins over a draft', () => {
  const calls = [];
  const src = extractFunction('populateForm');
  const names = ['set', 'setChk', 'setChks', 'setRadio', 'ensureOption', 'togglePayRef', 'setDeno', 'calcDeno', 'cp', 'updateBalance', 'addRow'];
  const G = { __calls: calls };
  const stubs = names.map(n => `function ${n}(){ __calls.push(['${n}'].concat([].slice.call(arguments))); }`).join('\n');
  const ctx = sandbox(G, `${stubs}\nfunction stageOf(){ return 'received'; }\nvar document={getElementById:function(){return {textContent:'',style:{},value:''}}, querySelectorAll:function(){return []}};\n${src}`);
  const draftCase = { id: 'A', condParts: [], deliveryDraft: { d1: true, finalAmt: '500' } };
  ctx.populateForm(draftCase);
  assert.ok(calls.some(c => c[0] === 'set' && c[1] === 'f-fa' && c[2] === '500'));
  assert.ok(calls.some(c => c[0] === 'setChk' && c[1] === 'd1' && c[2] === true));
  calls.length = 0;
  ctx.populateForm({ id: 'B', condParts: [], delivery: { finalAmt: '900' }, deliveryDraft: { finalAmt: '500' } });
  assert.ok(calls.some(c => c[0] === 'set' && c[1] === 'f-fa' && c[2] === '900'));
  assert.ok(!calls.some(c => c[0] === 'set' && c[1] === 'f-fa' && c[2] === '500'));
});

test('U07-F06: closeCase drops the draft; doSave never writes delivery', () => {
  assert.ok(extractFunction('closeCase').includes('delete DB[idx].deliveryDraft'));
  const save = extractFunction('doSave');
  assert.ok(save.includes('DB[idx].deliveryDraft = _dd'));
  assert.ok(!save.includes('DB[idx].delivery ='));
});

// ───────────────── U07-LOW-032: cash count mismatch ─────────────────
function closeEnv({ payMode, deno, finalAmt, confirmAnswer }) {
  const log = { confirms: [], saves: 0, toasts: [] };
  const del = { d1: true, d2: true, d3: true, d4: true, d5: true, finalAmt, payMode, collectDate: '2026-11-12', warrantyMonths: '', deno };
  const ctx = sandbox({
    __log: log, __del: del, __confirm: confirmAnswer,
    confirm: m => { log.confirms.push(String(m)); return confirmAnswer; }
  }, `
    var DB = [{ id: 'A', status: 'open' }], editId = 'A', DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
    function readOnlyGuard(){ return false; }
    function svcD3PolicyApi(){ return { readinessValid: function(){ return true; } }; }
    function byId(id){ return DB[0]; }
    function readDelivery(){ return JSON.parse(JSON.stringify(__del)); }
    function parseRupee(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\\-]/g, '')); return isNaN(n) ? 0 : n; }
    function toast(m){ __log.toasts.push(String(m)); }
    function g(){ return '18'; }
    ${extractFunction('svcGstValid')}
    function addMonthsIso(d){ return d; }
    function stageOf(){ return 'ready'; }
    function readForm(){ return {}; }
    function logStageChange(){}
    function scheduleWarrantyFollowUp(){}
    function saveDB(){ __log.saves++; }
    function persistWatchPhoto(){}
    function showView(){}
    function setTimeout(){}
    ${extractFunction('closeCase')}
  `);
  ctx.closeCase();
  return log;
}
test('U07-LOW-032: a cash count that differs from the final amount asks once; matching, empty or non-cash never ask', () => {
  assert.ok(extractFunction('closeCase').includes('differs from the Final Amount'));
  const mismatch = closeEnv({ payMode: 'Cash', deno: { 100: '1' }, finalAmt: '300', confirmAnswer: false });
  assert.equal(mismatch.confirms.length, 1);
  assert.equal(mismatch.saves, 0, 'declined: not closed');
  const accepted = closeEnv({ payMode: 'Cash', deno: { 100: '1' }, finalAmt: '300', confirmAnswer: true });
  assert.equal(accepted.confirms.length, 1);
  assert.equal(accepted.saves, 1);
  assert.equal(closeEnv({ payMode: 'Cash', deno: { 100: '3' }, finalAmt: '300', confirmAnswer: false }).confirms.length, 0);
  assert.equal(closeEnv({ payMode: 'Cash', deno: {}, finalAmt: '300', confirmAnswer: false }).confirms.length, 0);
  assert.equal(closeEnv({ payMode: 'UPI', deno: { 100: '1' }, finalAmt: '300', confirmAnswer: false }).confirms.length, 0);
});
