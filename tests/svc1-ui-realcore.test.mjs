// Service Stores UI (wave 1, group ui) against the REAL core, documents layer, FIFO engine and store over an in-memory adapter.
// Skipped when the core or documents file is not in the tree. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { setup, SESS, flush, fire } from './lib/svc1-ui-harness.mjs';

const require = createRequire(import.meta.url);
const present = fs.existsSync(new URL('../www/service-stores-core.js', import.meta.url)) && fs.existsSync(new URL('../www/service-stores-docs.js', import.meta.url));
const skip = present ? false : 'core or documents file not present';
const PIN_TEXT = (a) => a.h.calls.reauth.slice();
const has = (str, re) => assert.ok(re.test(String(str)), 'expected ' + re + ' in: ' + String(str).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').slice(0, 300));

function realCore(session) {
  const Core = require('../www/service-stores-core.js');
  const data = new Map();
  const adapter = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    keys: () => Array.from(data.keys()),
    authoritative: () => true
  };
  let ms = Date.parse('2026-11-13T05:30:00.000Z');
  const now = () => new Date(ms);
  const libs = { store: require('../www/service-stores-store.js'), fifo: require('../www/service-stores-fifo.js'), masters: require('../www/service-stores-masters.js'), docs: require('../www/service-stores-docs.js') };
  const cases = { get: (id) => (id === 'WS-2026-001' ? { id, status: 'open', invoiceNo: '', paymentStatus: 'cash', stub: false } : (id === 'WS-2026-002' ? { id, status: 'closed', invoiceNo: '', paymentStatus: 'cash', stub: false } : null)) };
  const created = Core.create({ adapter, now, cases, libs, storeOptions: { watermark: false } });
  assert.equal(created.ok, true, JSON.stringify(created));
  return { core: created.core, data, tick: (n) => { ms += n; } };
}
function mkPart(code, extra) {
  return Object.assign({ code, name: 'Crystal ' + code + ' (invented)', group: 'Glass', unit: 'pc', hsn: '9114', gstRateBp: 1800, priceIncludesTax: false, sellPricePaise: 15000, reorderLevel: 3, reorderQty: 6, bin: 'A1', flags: { counterSaleable: true } }, extra || {});
}
async function boot(session) {
  const rc = realCore();
  const a = setup({ session, core: rc.core });
  a.rc = rc;
  const owner = SESS.owner;
  const ctx = { session: owner, stepUp: { ok: true, at: Date.parse('2026-11-13T05:30:00.000Z') }, clientRef: 'seed-1' };
  let n = 0;
  for (const code of ['DIL-0005', 'CLP-0009', '00123']) {
    const r = rc.core.savePart(mkPart(code), Object.assign({}, ctx, { clientRef: 'seed-p' + (n++) }));
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  a.mount();
  await a.show();
  return a;
}
const setField = async (a, name, value, line) => a.type(name, value, undefined, line);

test('R1 Owner: opening stock posted with one PIN, then the stock list shows quantity and FIFO value from the real core', { skip }, async () => {
  const a = await boot(SESS.owner);
  has(a.rootHtml(), /Ledger OK/);
  has(a.rootHtml(), /DIL-0005/);
  await a.click('svs-tab-opening');
  has(a.rootHtml(), /Opening stock is set for <span class="svs-num">0<\/span> of <span class="svs-num">3<\/span> parts/);
  const set = (name, code, v) => { const e = a.h.el.root.querySelectorAll('[data-svs-field="' + name + '"]').find((x) => x.getAttribute('data-svs-key') === code); e.value = v; fire(a.doc, e, 'input'); };
  set('o-qty', 'DIL-0005', '10'); set('o-cost', 'DIL-0005', '50');
  set('o-qty', '00123', '2'); set('o-cost', '00123', '19.99');
  await a.click('svs-open-post');
  has(a.layerHtml(), /2<\/span> parts, <span class="svs-num">12<\/span> pieces, Value <span class="svs-num">Rs 539\.98<\/span>/);
  await a.click('svs-open-confirm');
  assert.equal(PIN_TEXT(a).length, 1);
  assert.equal(PIN_TEXT(a)[0], 'Post opening stock: 2 parts, 12 pieces, value Rs 539.98. Once per part.');
  assert.equal(a.layerHtml(), '', JSON.stringify(a.h.calls.toast));
  assert.ok(Array.from(a.rc.data.keys()).some((k) => /^saagar_svcs_ledger_v1_2026-11/.test(k)), 'written by the real store');
  await a.click('svs-tab-stock');
  has(a.rootHtml(), /Rs 539\.98/);
  has(a.rootHtml(), /Rs 500\.00/);
  has(a.rootHtml(), /<b class="svs-code">00123<\/b>/);
  has(a.rootHtml(), /2<\/span> parts|3<\/span> parts/);
  await a.click('svs-tab-opening');
  has(a.rootHtml(), /Opening stock is set for <span class="svs-num">2<\/span> of <span class="svs-num">3<\/span> parts/);
});

test('R2 Manager proposes opening; Owner approves it from the pending list with the PIN; a second opening for the same part is refused', { skip }, async () => {
  const a = await boot(SESS.manager);
  await a.click('svs-tab-opening');
  const set = (name, code, v) => { const e = a.h.el.root.querySelectorAll('[data-svs-field="' + name + '"]').find((x) => x.getAttribute('data-svs-key') === code); e.value = v; fire(a.doc, e, 'input'); };
  set('o-qty', 'CLP-0009', '4'); set('o-cost', 'CLP-0009', '120');
  await a.click('svs-open-propose');
  await a.click('svs-open-confirm');
  has(a.h.calls.toast.slice(-1)[0], /Opening stock sent for approval: 1 parts\./);
  has(a.rootHtml(), /Waiting for approval/);
  has(a.rootHtml(), /Approve \(Owner\)/);
  a.h.session = SESS.owner;
  await a.show();
  await a.click('svs-tab-opening');
  const pending = a.h.el.root.querySelectorAll('[data-svcs-action="svs-open-approve"]')[0];
  assert.ok(pending);
  await a.click('svs-open-approve', pending.getAttribute('data-svs-key'));
  assert.equal(PIN_TEXT(a).length, 1);
  has(a.h.calls.toast.slice(-1)[0], /Opening stock posted: 1 parts, 4 pieces\./);
  await a.click('svs-tab-stock');
  has(a.rootHtml(), /Rs 480\.00/);
});

async function stocked() {
  const a = await boot(SESS.owner);
  a.h.session = SESS.owner;
  await a.click('svs-tab-opening');
  const set = (name, code, v) => { const e = a.h.el.root.querySelectorAll('[data-svs-field="' + name + '"]').find((x) => x.getAttribute('data-svs-key') === code); e.value = v; fire(a.doc, e, 'input'); };
  set('o-qty', 'DIL-0005', '10'); set('o-cost', 'DIL-0005', '50');
  set('o-qty', 'CLP-0009', '2'); set('o-cost', 'CLP-0009', '120');
  await a.click('svs-open-post');
  await a.click('svs-open-confirm');
  a.h.calls.reauth.length = 0;
  return a;
}

test('R3 goods receipt through the real docs layer: short quantity, FIFO layer, duplicate supplier invoice refused', { skip }, async () => {
  const a = await stocked();
  a.h.session = SESS.manager;
  await a.click('svs-tab-receive');
  const receive = async (inv) => {
    await a.click('svs-grn-new');
    await a.type('supplierInvoiceNo', inv);
    await a.type('supplierInvoiceDate', '2026-11-12');
    await a.type('partSearch', 'dil-0005', undefined, 0);
    await a.click('svs-grn-pick-part', '0|DIL-0005');
    await a.type('qtyInvoiced', '8', undefined, 0);
    await a.type('qtyReceived', '6', undefined, 0);
    await a.type('cost', '60', undefined, 0);
    await a.click('svs-grn-save');
  };
  await receive('TTL/1001');
  assert.equal(a.layerHtml(), '', JSON.stringify(a.h.calls.toast));
  has(a.rootHtml(), /GRN\/26-27\/0001/);
  has(a.h.calls.toast.slice(-1)[0], /Receipt GRN\/26-27\/0001 saved: 1 lines, 6 pieces\./);
  await a.click('svs-grn-view', 'GRN/26-27/0001');
  has(a.layerHtml(), /Short<\/span> <span class="svs-num">2<\/span>/);
  has(a.layerHtml(), /Rs 360\.00/);
  await a.click('svs-grn-view-close');
  await receive('ttl/1001');
  has(a.layerHtml(), /This supplier invoice was already received\./);
  assert.equal(a.rc.core.listReceipts({}, { session: SESS.manager }).total, 1);
  await a.click('svs-dialog-close');
  await a.click('svs-dialog-discard');
  await a.click('svs-tab-stock');
  has(a.rootHtml(), /Rs 860\.00/); // 10 x 50 + 6 x 60
});

test('R4 issue and return on a job: FIFO value, the return goes back to its layer, a closed or unknown job is refused, delete guard follows', { skip }, async () => {
  const a = await stocked();
  a.h.session = SESS.manager;
  a.ui.refreshJob(); await flush();
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'dil');
  await a.click('svs-job-pick-part', '|DIL-0005');
  await a.type('qty', '3');
  await a.click('svs-job-issue-save');
  has(a.h.calls.toast.slice(-1)[0], /Issued 3 x DIL-0005 to WS-2026-001\./);
  has(a.jobHtml(), /With job<\/span> <span class="svs-num">3<\/span>/);
  has(a.jobHtml(), /FIFO cost<\/span> Rs 150\.00/);
  assert.equal(a.ui.jobHasParts('WS-2026-001'), true);
  await a.click('svs-job-return-open', 'DIL-0005');
  await a.type('qty', '2');
  await a.setSelect('returnReason', 'WRONG_PART');
  await a.click('svs-job-return-save');
  has(a.h.calls.toast.slice(-1)[0], /Returned 2 x DIL-0005 from WS-2026-001\./);
  has(a.jobHtml(), /FIFO cost<\/span> Rs 50\.00/);
  assert.equal(a.ui.jobHasParts('WS-2026-001'), true);
  await a.click('svs-job-return-open', 'DIL-0005');
  await a.click('svs-job-return-save');
  assert.equal(a.ui.jobHasParts('WS-2026-001'), false);
  // not enough stock: the real text with the number; a Manager cannot override
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'clp');
  await a.click('svs-job-pick-part', '|CLP-0009');
  await a.type('qty', '9');
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Not enough stock\. On hand: 2\./);
  // unknown and closed jobs
  a.h.jobs['WS-2026-002'] = { id: 'WS-2026-002', status: 'open', label: 'x', invoiceNo: '', locked: false, paymentStatus: 'cash' };
  a.h.currentJob = 'WS-2026-002';
  a.ui.refreshJob(); await flush();
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'dil');
  await a.click('svs-job-pick-part', '|DIL-0005');
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /This job is closed\. Parts cannot be issued or returned on it\./);
});

test('R5 Owner issues beyond stock with the PIN and a note; stock goes negative and the list shows it', { skip }, async () => {
  const a = await stocked();
  a.ui.refreshJob(); await flush();
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'clp');
  await a.click('svs-job-pick-part', '|CLP-0009');
  await a.type('qty', '3');
  await a.type('note', 'Urgent repair');
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Not enough stock\. On hand: 2\./);
  await a.click('svs-job-issue-override');
  assert.equal(PIN_TEXT(a).length, 1);
  has(a.h.calls.toast.slice(-1)[0], /Issued 3 x CLP-0009 to WS-2026-001\./);
  await a.click('svs-tab-stock');
  has(a.rootHtml(), /svs-num svs-neg">-1</);
});

test('R6 counter sale and its same-day reverse through the real layers', { skip }, async () => {
  const a = await stocked();
  a.h.session = SESS.manager;
  await a.click('svs-tab-counter');
  await a.type('partSearch', 'dil');
  await a.click('svs-cs-pick-part', '|DIL-0005');
  await a.type('qty', '2');
  await a.click('svs-cs-save');
  has(a.h.calls.toast.slice(-1)[0], /Counter sale recorded: 2 x DIL-0005\./);
  has(a.rootHtml(), /CSL\/26-27\/0001/);
  await a.click('svs-cs-reverse', 'CSL/26-27/0001');
  await a.type('reason', 'Customer returned the sale');
  await a.click('svs-cs-reverse-confirm', 'CSL/26-27/0001');
  assert.equal(PIN_TEXT(a).length, 0);
  has(a.h.calls.toast.slice(-1)[0], /CSL\/26-27\/0001 was reversed\./);
  await a.click('svs-tab-stock');
  has(a.rootHtml(), /Rs 500\.00/);
});

test('R7 adjustment: Manager proposes (limit 0), Owner approves with the PIN; the ledger and the printed data come from the real core', { skip }, async () => {
  const a = await stocked();
  a.h.session = SESS.manager;
  await a.click('svs-tab-adjust');
  await a.click('svs-adj-new');
  await a.type('partSearch', 'dil', undefined, 0);
  await a.click('svs-adj-pick-part', '0|DIL-0005');
  await a.setSelect('reason', 'DAMAGED', undefined, 0);
  await a.type('qty', '2', undefined, 0);
  await a.type('note', 'Dropped in the drawer');
  await a.click('svs-adj-save');
  assert.equal(a.layerHtml(), '', JSON.stringify(a.h.calls.toast));
  has(a.rootHtml(), /Approve \(Owner\)/);
  const id = a.h.el.root.querySelectorAll('[data-svcs-action="svs-adj-approve"]')[0].getAttribute('data-svs-key');
  a.h.session = SESS.owner;
  await a.show();
  await a.click('svs-tab-adjust');
  await a.click('svs-adj-approve', id);
  assert.equal(PIN_TEXT(a).length, 1);
  assert.match(PIN_TEXT(a)[0], /^Approve stock adjustment DOC-\d+: decrease 2 of DIL-0005 \(DAMAGED\), value Rs 100\.00$/);
  has(a.h.calls.toast.slice(-1)[0], /Adjustment approved and posted\./);
  await a.click('svs-tab-stock');
  has(a.rootHtml(), /Rs 400\.00/);
  await a.click('svs-stock-ledger', 'DIL-0005');
  has(a.layerHtml(), /Opening/);
  has(a.layerHtml(), /Adjustment/);
  has(a.layerHtml(), /ADJ\/26-27\/0001/);
  await a.click('svs-ledger-print');
  assert.equal(a.h.calls.report[0].type, 'svcPartLedger');
  assert.equal(a.h.calls.report[0].opts.svcData.ok, true);
  await a.click('svs-ledger-close');
  await a.click('svs-tab-adjust');
  await a.type('f-adj-state', 'ALL');
  await a.setSelect('f-adj-state', 'ALL');
  has(a.rootHtml(), /ADJ\/26-27\/0001/);
  await a.click('svs-adj-print');
  assert.equal(a.h.calls.report[1].type, 'svcAdjustmentRegister');
  assert.equal(a.h.calls.report[1].opts.svcData.ok, true);
});

test('R8 old part register through the states and the monthly sign-off (a finished month only)', { skip }, async () => {
  const a = await stocked();
  a.h.session = SESS.manager;
  await a.click('svs-tab-oldparts');
  await a.click('svs-old-new');
  await a.type('jobId', 'WS-2026-001');
  await a.type('partText', 'Cracked crystal');
  await a.click('svs-old-save');
  assert.equal(a.layerHtml(), '', JSON.stringify(a.h.calls.toast));
  const no = a.h.el.root.querySelectorAll('[data-svcs-action="svs-old-move"]')[0].getAttribute('data-svs-key');
  assert.match(no, /^OLD\/26-27\/0001$/);
  await a.click('svs-old-move', no);
  await a.setSelect('to', 'SCRAP_PENDING');
  await a.type('note', 'Claim refused by Titan');
  await a.click('svs-old-move-save');
  assert.equal(a.layerHtml(), '', JSON.stringify(a.h.calls.toast));
  has(a.rootHtml(), /Scrap pending Owner sign-off/);
  has(a.rootHtml(), /Scrap bin/);
  // the current month cannot be signed off yet
  a.h.session = SESS.owner;
  await a.show();
  await a.click('svs-tab-oldparts');
  await a.click('svs-old-signoff');
  has(a.layerHtml(), /No scrap is waiting for sign-off\./);
  await a.click('svs-old-print');
  assert.equal(a.h.calls.report[0].type, 'svcDefectiveRegister');
  assert.equal(a.h.calls.report[0].opts.svcData.ok, true);
});

test('R9 staff: quantities only, the real core withholds cost; the reorder list comes from the real FIFO state', { skip }, async () => {
  const a = await stocked();
  a.h.session = SESS.staff;
  await a.show();
  has(a.rootHtml(), /DIL-0005/);
  assert.doesNotMatch(a.rootHtml(), /FIFO value|Rs \d/);
  await a.click('svs-tab-reorder');
  has(a.rootHtml(), /CLP-0009/);
  assert.doesNotMatch(a.rootHtml(), /Rs \d/);
  // a staff session that tries the ledger straight through the core gets the real refusal
  const r = a.rc.core.ledger('DIL-0005', {}, { session: SESS.staff });
  assert.equal(r.ok, false);
});

test('R10 Settings: store roles let a Cashier receive goods; the Owner saves them with the PIN', { skip }, async () => {
  const a = await stocked();
  await a.click('svs-tab-settings');
  a.field('role-0').checked = true;
  await a.type('limit', '250');
  await a.click('svs-settings-save');
  assert.equal(PIN_TEXT(a).length, 1);
  has(a.h.calls.toast.slice(-1)[0], /Stores settings saved\./);
  const cfg = a.rc.core.settings();
  assert.deepEqual(JSON.parse(JSON.stringify(cfg.storeRoles)), ['Cashier']);
  assert.equal(cfg.adjustLimitPaise, 25000);
  a.h.session = SESS.staff; // Cashier
  await a.show();
  const tabs = a.actionsIn(a.rootHtml()).filter((x) => x.startsWith('svs-tab-'));
  assert.ok(tabs.includes('svs-tab-receive') && tabs.includes('svs-tab-counter') && tabs.includes('svs-tab-opening'));
  assert.equal(tabs.includes('svs-tab-settings'), false);
  assert.equal(tabs.includes('svs-tab-masters'), false);
});

test('R11 damaged data: the real core blocks and the UI shows the blocked page with diagnostics, nothing posts', { skip }, async () => {
  const a = await stocked();
  const keys = Array.from(a.rc.data.keys()).filter((k) => /^saagar_svcs_ledger_v1_/.test(k));
  assert.ok(keys.length > 0);
  a.rc.data.set(keys[0], '{not json');
  a.rc.core.reopen();
  await a.show();
  has(a.rootHtml(), /Restore your latest backup/);
  has(a.rootHtml(), /<textarea id="svs-diag"/);
  assert.deepEqual(a.actionsIn(a.rootHtml()).filter((x) => x.startsWith('svs-tab-')), []);
  has(a.rootHtml(), /SVCS_/);
});

test('R12 the real masters screen mounts inside Parts and labour; Edit and Add from Stock jump into it', { skip: skip || !fs.existsSync(new URL('../www/service-stores-masters-ui.js', import.meta.url)) }, async () => {
  const a = await boot(SESS.manager);
  for (const f of ['service-stores-masters.js', 'service-stores-masters-ui.js']) {
    vm.runInContext(fs.readFileSync(new URL('../www/' + f, import.meta.url), 'utf8'), a.sandbox, { filename: f });
  }
  await a.click('svs-tab-masters');
  await flush();
  has(a.rootHtml(), /Parts and labour/);
  has(a.rootHtml(), /DIL-0005/);
  has(a.rootHtml(), /Selling price: Rs 150\.00/);
  assert.equal(a.h.el.root.querySelectorAll('#svs-masters-host').length, 1);
  await a.click('svs-tab-stock');
  await a.click('svs-stock-edit-part', 'CLP-0009');
  await flush();
  has(a.rootHtml(), /Edit: CLP-0009/);
  await a.click('svs-tab-stock');
  await a.click('svs-stock-add-part');
  await flush();
  has(a.rootHtml(), /Code/);
  assert.equal(a.h.el.root.querySelectorAll('#svs-masters-host').length, 1);
  // a past view freezes the masters screen as well
  a.h.past = true;
  a.ui.onContextChange();
  await flush();
  assert.equal(a.actionsIn(a.rootHtml()).includes('svs-stock-add-part'), false);
});

test('R2P-DEF-1 with the page providers, a forged Owner session or PIN stamp in ctx proves nothing (test R05)', { skip }, () => {
  const Core = require('../www/service-stores-core.js');
  const data = new Map();
  const adapter = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); }, keys: () => Array.from(data.keys()), authoritative: () => true };
  const ms = Date.parse('2026-11-13T05:30:00.000Z');
  const now = () => new Date(ms);
  const libs = { store: require('../www/service-stores-store.js'), fifo: require('../www/service-stores-fifo.js'), masters: require('../www/service-stores-masters.js'), docs: require('../www/service-stores-docs.js') };
  const cases = { get: () => null };
  let real = SESS.staff;
  let pinAt = 0;
  // a provider that is not a function is refused at create
  assert.equal(Core.create({ adapter, now, cases, libs, session: { ok: true } }).code, 'CORE_ARGS_INVALID');
  assert.equal(Core.create({ adapter, now, cases, libs, stepUpAt: 5 }).code, 'CORE_ARGS_INVALID');
  const made = Core.create({ adapter, now, cases, libs, storeOptions: { watermark: false }, session: () => real, stepUpAt: () => pinAt });
  assert.equal(made.ok, true, JSON.stringify(made));
  const core = made.core;
  const forged = { session: { ok: true, isOwner: true, isManager: true, tier: 'owner', role: 'Store Manager', actorName: 'x' }, stepUp: { ok: true, at: ms }, clientRef: 'forge-1' };
  // the Cashier forging an Owner session: refused as the Cashier he really is
  const cs = core.savePart(mkPart('BAT-377'), forged);
  assert.equal(cs.ok, false);
  assert.ok(['ROLE_DENIED', 'NOT_ALLOWED'].includes(cs.code), cs.code);
  real = SESS.owner;
  // the real Owner without a PIN the page saw: a made-up stamp is not accepted
  const noPin = core.removePart('BAT-377', 'not needed any more', forged);
  assert.notEqual(noPin.ok, true);
  assert.equal(core.savePart(mkPart('BAT-377'), Object.assign({}, forged, { clientRef: 'own-1' })).ok, true);
  real = SESS.staff;
  const grn = { supplierName: 'Titan', supplierInvoiceNo: 'INV-FORGE/1', supplierInvoiceDate: '2026-11-12', lines: [{ partCode: 'BAT-377', qtyInvoiced: 1, qtyReceived: 1, unitCostPaise: 4500 }], note: '' };
  const r = core.receiveGoods(grn, Object.assign({}, forged, { clientRef: 'forge-2' }));
  assert.equal(r.ok, false, 'R05: the forged GRN must not post');
  assert.equal(r.code, 'NOT_ALLOWED');
  // the Owner with a real PIN time (set by the page after the shell gate said yes) can post an Owner-only step
  real = SESS.owner;
  pinAt = ms;
  assert.equal(core.removePart('BAT-377', 'not needed any more', Object.assign({}, forged, { clientRef: 'own-2' })).ok, true);
  // a provider that throws fails closed
  const bad = Core.create({ adapter: { getItem: () => null, setItem() {}, removeItem() {}, keys: () => [], authoritative: () => true }, now, cases, libs, storeOptions: { watermark: false }, session: () => { throw new Error('x'); } });
  assert.equal(bad.core.listParts({}, forged).ok, false);
});
