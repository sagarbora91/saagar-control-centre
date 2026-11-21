// Service Stores UI (wave 1, group ui): the Stores view. Fake DOM, fake host, fake core (tests/lib/svc1-ui-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, makeCore, samplePart, SESS, flush, fire } from './lib/svc1-ui-harness.mjs';

const P = (o) => JSON.parse(JSON.stringify(o));
const has = (str, re) => assert.ok(re.test(String(str)), 'expected ' + re + ' in: ' + String(str).slice(0, 240));
const hasNot = (str, re) => assert.ok(!re.test(String(str)), 'did not expect ' + re);
const tabIds = (a) => a.actionsIn(a.rootHtml()).filter((x) => x.startsWith('svs-tab-')).map((x) => x.slice(8));
async function open(session, extra) {
  const a = setup(Object.assign({ session }, extra || {}));
  a.mount();
  await a.show();
  return a;
}
const lastPayload = (a, name) => { const c = a.h.core.last(name); return c ? c.args[0] : null; };

test('S1 mount makes one Stores button before New Service Order; it opens the view through showView', async () => {
  const a = setup();
  assert.equal(a.mount(), true);
  const btns = a.h.el.header.querySelectorAll('[data-svcs-action="svs-open-stores"]');
  assert.equal(btns.length, 1);
  assert.equal(btns[0].getAttribute('data-no-i18n'), '');
  assert.equal(a.h.el.header.childNodes.indexOf(btns[0]) < a.h.el.header.childNodes.indexOf(a.h.el.newBtn), true);
  assert.equal(btns[0].getAttribute('data-action'), null);
  assert.equal(btns[0].getAttribute('onclick'), null);
  assert.equal(btns[0].textContent, 'Stores');
  a.mount();
  assert.equal(a.h.el.header.querySelectorAll('[data-svcs-action="svs-open-stores"]').length, 1);
  fire(a.doc, btns[0], 'click');
  await flush();
  assert.deepEqual(P(a.doc.defaultView.showViewCalls), ['stores']);
  a.h.host.showStores = () => { a.shown = (a.shown || 0) + 1; };
  fire(a.doc, btns[0], 'click');
  await flush();
  assert.equal(a.shown, 1);
});

test('S2 broken session and missing core: closed messages, no data call', async () => {
  const a = await open(SESS.none);
  has(a.rootHtml(), /Your session could not be read\. Stores is closed/);
  assert.deepEqual(tabIds(a), []);
  assert.equal(a.h.core.calls.length, 0);
  const b = await open(SESS.owner, { core: null });
  has(b.rootHtml(), /Stores is not available in this build/);
  assert.equal(b.ui.jobHasParts('WS-1'), false);
  b.ui.refreshJob();
  await flush();
  assert.equal(b.jobHtml(), '');
});

test('S3 tabs per role: staff 2, store-class 7, manager 8, owner 9', async () => {
  assert.deepEqual(tabIds(await open(SESS.staff)), ['stock', 'reorder']);
  const sc = setup({ session: SESS.staff });
  sc.h.core.state.config.storeRoles = ['Cashier'];
  sc.mount(); await sc.show();
  assert.deepEqual(tabIds(sc), ['stock', 'receive', 'counter', 'adjust', 'oldparts', 'reorder', 'opening']);
  assert.deepEqual(tabIds(await open(SESS.manager)), ['stock', 'receive', 'counter', 'adjust', 'oldparts', 'reorder', 'masters', 'opening']);
  assert.deepEqual(tabIds(await open(SESS.owner)), ['stock', 'receive', 'counter', 'adjust', 'oldparts', 'reorder', 'masters', 'opening', 'settings']);
  const html = (await open(SESS.owner)).rootHtml();
  has(html, /role="tablist"/);
  has(html, /aria-selected="true" tabindex="0" data-svcs-action="svs-tab-stock"/);
  has(html, /aria-selected="false" tabindex="-1" data-svcs-action="svs-tab-receive"/);
});

test('S4 staff Stock: quantities only (no cost word, no ledger, edit or add button)', async () => {
  const a = await open(SESS.staff);
  const html = a.rootHtml();
  hasNot(html, /FIFO value|Rs \d|Rs -|Ledger<|Edit<|Add part/);
  has(html, /DIL-0005/);
  has(html, /On hand/);
  assert.equal(a.h.core.last('listParts').args[1].session.tier, 'staff');
  assert.equal(a.find('svs-stock-ledger'), null);
  assert.equal(a.find('svs-stock-add-part'), null);
  assert.equal(a.find('svs-stock-print') !== null, true);
});

test('S5 manager Stock: cost, ledger and edit buttons, totals, badges', async () => {
  const a = await open(SESS.manager);
  const html = a.rootHtml();
  has(html, /FIFO value/);
  has(html, /Rs 500\.00/);
  assert.ok(a.find('svs-stock-ledger', 'DIL-0005'));
  assert.ok(a.find('svs-stock-edit-part', 'DIL-0005'));
  assert.ok(a.find('svs-stock-add-part'));
  has(html, /svs-badge-ok">OK/);
  has(html, /svs-badge-warn">Low/);
  has(html, /svs-badge-bad">Out/);
  has(html, /3<\/span> parts, <span class="svs-num">13<\/span> pieces/);
});

test('S6 Stock paging: 0, 1, 25, 26, 51 rows give 0/1/1/2/3 pages; Prev and Next shown only where they work', async () => {
  for (const [n, pages] of [[0, 1], [1, 1], [25, 1], [26, 2], [51, 3]]) {
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(samplePart('P' + String(i).padStart(4, '0')));
    const a = await open(SESS.manager, { core: makeCore({ parts }) });
    has(a.rootHtml(), new RegExp('Page <span class="svs-num">1</span> of <span class="svs-num">' + pages + '</span>'), String(n));
    assert.equal(a.find('svs-stock-page-prev'), null);
    assert.equal(a.find('svs-stock-page-next') !== null, pages > 1);
    if (pages > 1) {
      await a.click('svs-stock-page-next');
      has(a.rootHtml(), new RegExp('Page <span class="svs-num">2</span> of <span class="svs-num">' + pages + '</span>'));
      assert.ok(a.find('svs-stock-page-prev'));
      assert.equal(P(a.h.core.last('listParts').args[0]).offset, 25);
      await a.type('f-stock-text', 'P00');
      has(a.rootHtml(), /Page <span class="svs-num">1<\/span/);
    }
  }
  const empty = await open(SESS.manager, { core: makeCore({ parts: [] }) });
  has(empty.rootHtml(), /No parts yet\. Add a part in Parts and labour/);
});

test('S7 search and filter reach the core; nothing found shows a clear button', async () => {
  const a = await open(SESS.manager);
  await a.type('f-stock-text', 'zzz');
  assert.equal(P(a.h.core.last('listParts').args[0]).text, 'zzz');
  has(a.rootHtml(), /No parts match this search/);
  await a.click('svs-stock-search-clear');
  has(a.rootHtml(), /DIL-0005/);
  await a.setSelect('f-stock-view', 'low');
  assert.equal(P(a.h.core.last('listParts').args[0]).state, 'low');
  await a.setSelect('f-stock-view', 'off');
  assert.equal(P(a.h.core.last('listParts').args[0]).active, 'false');
});

test('S8 ledger dialog: manager sees movements and cost; staff cannot open it; print goes through the report engine', async () => {
  const rows = [
    { seq: 1, id: 'MOV-1', at: '2026-11-12T05:00:00.000Z', date: '2026-11-12', docType: 'GRN', docNo: 'GRN/26-27/0001', qtyIn: 12, qtyOut: 0, balanceQty: 12, unitCostPaise: 5000, valuePaise: 60000, by: 'Test Manager', note: 'first', reversed: false },
    { seq: 2, id: 'MOV-2', at: '2026-11-13T05:00:00.000Z', date: '2026-11-13', docType: 'ISSUE', docNo: 'ISS/26-27/0001', jobId: 'WS-2026-001', qtyIn: 0, qtyOut: 2, balanceQty: 10, unitCostPaise: 5000, valuePaise: -10000, by: 'Test Manager', note: '', reversed: true }
  ];
  const a = await open(SESS.manager, { core: makeCore({ ledgerRows: rows }) });
  await a.click('svs-stock-ledger', 'DIL-0005');
  const html = a.layerHtml();
  has(html, /role="dialog" aria-modal="true" aria-labelledby="svs-dlg-title"/);
  has(html, /Stock ledger/);
  has(html, /Receipt/);
  has(html, /Issue/);
  has(html, /WS-2026-001/);
  has(html, /Reversed/);
  has(html, /is-reversed/);
  has(html, /Rs 50\.00/);
  const q = P(a.h.core.last('ledger').args[1]);
  assert.equal(q.to, '2026-11-13');
  assert.equal(q.from, '2026-08-15');
  await a.click('svs-ledger-print');
  assert.equal(a.h.calls.report[0].type, 'svcPartLedger');
  assert.equal(a.h.calls.report[0].opts.partCode, 'DIL-0005');
  assert.ok(a.h.calls.report[0].opts.svcData);
  assert.equal(a.h.core.last('reportData').args[0], 'svcPartLedger');
  await a.click('svs-ledger-close');
  assert.equal(a.layerHtml(), '');
  const s = await open(SESS.staff);
  assert.equal(s.find('svs-stock-ledger'), null);
  await s.ui.internals.dispatch('svs-stock-ledger', 'DIL-0005');
  await flush();
  assert.equal(s.layerHtml(), '');
  assert.equal(s.h.core.count('ledger'), 0);
});

test('S9 ledger check failed: banner, chip, no post button anywhere, lists still open', async () => {
  const core = makeCore();
  core.state.status.integrity = { ok: false, code: 'SVCS_FIFO_MISMATCH', lastEntryAt: '' };
  const a = await open(SESS.owner, { core });
  has(a.rootHtml(), /The stock ledger failed its check\. Posting is stopped\. Tell the Owner\./);
  has(a.rootHtml(), /Ledger check failed SVCS_FIFO_MISMATCH/);
  has(a.rootHtml(), /DIL-0005/);
  for (const tab of ['receive', 'counter', 'adjust', 'oldparts', 'opening']) {
    await a.click('svs-tab-' + tab);
    const acts = a.actionsIn(a.rootHtml());
    for (const post of ['svs-grn-new', 'svs-cs-save', 'svs-adj-new', 'svs-old-new', 'svs-open-post', 'svs-open-propose']) assert.equal(acts.includes(post), false, tab + ' ' + post);
  }
  // forced clicks (no button on screen) are refused too and open no form (audit: the old line here could not fail)
  for (const act of ['svs-grn-new', 'svs-adj-new', 'svs-old-new', 'svs-open-propose', 'svs-open-post', 'svs-cs-save']) {
    const r = await a.ui.internals.dispatch(act, '');
    await flush();
    assert.equal(r.code, 'SVS_INTEGRITY', act);
    assert.equal(a.layerHtml(), '', act);
  }
  const writes = ['receiveGoods', 'counterSale', 'proposeAdjustment', 'proposeOpening', 'approveOpening', 'registerOldPart'];
  assert.deepEqual(a.h.core.calls.filter((c) => writes.includes(c.name)), []);
});

test('S10 blocked page: problems, diagnostics text, restore advice; Owner acknowledges with the PIN and a reason', async () => {
  const core = makeCore();
  core.state.status = { ok: true, ready: true, blocked: true, problems: [{ code: 'SVCS_WATERMARK_AHEAD', stream: 'ledger', key: 'saagar_svcs_ledger_v1_2026-11', n: 12 }], watermark: 'ON', integrity: { ok: false, code: 'SVCS_WATERMARK_AHEAD', lastEntryAt: '2026-11-12T10:00:00.000Z' }, fy: '2026-27', openingSetCount: 0 };
  const a = await open(SESS.owner, { core });
  const html = a.rootHtml();
  has(html, /Restore your latest backup/);
  has(html, /SVCS_WATERMARK_AHEAD/);
  has(html, /<textarea id="svs-diag"[^>]*readonly>/);
  has(html, /stream=ledger key=saagar_svcs_ledger_v1_2026-11 record=12/);
  has(html, /Restored data found/);
  assert.deepEqual(tabIds(a), []);
  assert.equal(a.find('svs-wm-ack') !== null, true);
  // reason too short: nothing happens
  await a.type('wmReason', 'ok');
  let r = await a.ui.internals.dispatch('svs-wm-ack');
  assert.equal(r.code, 'SVS_REASON_SHORT');
  assert.equal(a.h.calls.reauth.length, 0);
  // PIN refused: no core call
  a.h.reauthResult = false;
  await a.type('wmReason', 'Restored the tablet from last night backup on purpose');
  r = await a.ui.internals.dispatch('svs-wm-ack');
  assert.equal(r.code, 'SVS_PIN_DENIED');
  assert.equal(a.h.core.count('acknowledgeRestore'), 0);
  // PIN given
  a.h.reauthResult = true;
  r = await a.ui.internals.dispatch('svs-wm-ack');
  await flush();
  assert.equal(r.ok, true);
  const call = a.h.core.last('acknowledgeRestore');
  assert.equal(call.args[0].reason, 'Restored the tablet from last night backup on purpose');
  assert.equal(call.args[1].stepUp.ok, true);
  assert.equal(call.args[1].session.tier, 'owner');
  assert.equal(a.h.core.count('reopen'), 1);
  // a Store Manager sees the explanation but no form
  const m = await open(SESS.manager, { core });
  assert.equal(m.find('svs-wm-ack'), null);
  has(m.rootHtml(), /Ask the Owner to confirm/);
  const r2 = await m.ui.internals.dispatch('svs-wm-ack');
  assert.equal(r2.code, 'SVS_OWNER_ONLY');
  assert.equal(m.h.calls.reauth.length, 0);
  // fatal problems other than the watermark: no acknowledge form at all
  core.state.status.problems.push({ code: 'SVCS_CHAIN_BREAK', stream: 'ledger', key: 'k', n: 3 });
  const o2 = await open(SESS.owner, { core });
  assert.equal(o2.find('svs-wm-ack'), null);
  assert.ok(o2.find('svs-blocked-retry'));
});

test('S11 past view: no write button anywhere; a forced click is refused and the core sees no write', async () => {
  const a = await open(SESS.owner);
  a.h.past = true;
  a.ui.onContextChange();
  await flush();
  has(a.rootHtml(), /Past date: read-only/);
  for (const tab of ['receive', 'counter', 'adjust', 'oldparts', 'opening']) {
    await a.click('svs-tab-' + tab);
    const acts = a.actionsIn(a.rootHtml());
    for (const post of ['svs-grn-new', 'svs-cs-save', 'svs-adj-new', 'svs-old-new', 'svs-open-post', 'svs-open-propose', 'svs-adj-approve', 'svs-grn-reverse']) assert.equal(acts.includes(post), false, tab + ' ' + post);
  }
  const forced = ['svs-grn-new', 'svs-grn-save', 'svs-cs-save', 'svs-adj-new', 'svs-old-new', 'svs-open-post', 'svs-job-issue-open', 'svs-job-issue-save', 'svs-job-return-save', 'svs-settings-save'];
  for (const f of forced) {
    const r = await a.ui.internals.dispatch(f, 'x');
    await flush();
    assert.ok(r.ok === false, f);
  }
  const before = a.h.core.names().filter((n) => /^(receiveGoods|counterSale|proposeAdjustment|registerOldPart|proposeOpening|issueToJob|setConfig)$/.test(n));
  assert.deepEqual(before, []);
  assert.equal(a.h.calls.reauth.length, 0);
});

test('S12 goods receipt: field errors with aria-invalid, then one core call with integer paise and the short quantity', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-receive');
  has(a.rootHtml(), /No goods received yet/);
  await a.click('svs-grn-new');
  has(a.layerHtml(), /New goods receipt/);
  has(a.layerHtml(), /value="Titan"/);
  // nothing typed: errors on every required field, no core call
  await a.click('svs-grn-save');
  const html = a.layerHtml();
  has(html, /aria-invalid="true"/);
  has(html, /id="svs-f-d-supplierInvoiceNo-err" role="alert"/);
  has(html, /Pick a part from the list\./);
  assert.equal(a.h.core.count('receiveGoods'), 0);
  // fill a bad invoice number, future date, zero cost
  await a.type('supplierInvoiceNo', 'INV 1');
  await a.type('supplierInvoiceDate', '2026-12-01');
  await a.type('partSearch', 'dil-0005', undefined, 0);
  assert.ok(a.find('svs-grn-pick-part', '0|DIL-0005'));
  await a.click('svs-grn-pick-part', '0|DIL-0005');
  has(a.layerHtml(), /DIL-0005<\/b> Part DIL-0005/);
  has(a.layerHtml(), /HSN 9114, GST 18%/);
  await a.type('qtyReceived', '5', undefined, 0);
  await a.type('cost', '0', undefined, 0);
  await a.click('svs-grn-save');
  let h2 = a.layerHtml();
  has(h2, /Use letters, digits, slash, dot, underscore or hyphen only, with no spaces\./);
  has(h2, /The date cannot be in the future\./);
  has(h2, /Enter an amount in rupees/);
  assert.equal(a.h.core.count('receiveGoods'), 0);
  // typed values survived the re-render
  assert.equal(a.field('supplierInvoiceNo').value, 'INV 1');
  assert.equal(a.field('qtyReceived', undefined, 0).value, '5');
  // fix and save: short quantity 2 (invoice 7, received 5)
  await a.type('supplierInvoiceNo', 'INV/9001');
  await a.type('supplierInvoiceDate', '2026-11-12');
  await a.type('qtyInvoiced', '7', undefined, 0);
  await a.type('cost', '49.50', undefined, 0);
  has(a.layerHtml(), /Rs 247\.50/);
  await a.click('svs-grn-save');
  assert.equal(a.h.core.count('receiveGoods'), 1);
  const p = P(lastPayload(a, 'receiveGoods'));
  assert.deepEqual(Object.keys(p).sort(), ['lines', 'note', 'supplierInvoiceDate', 'supplierInvoiceNo', 'supplierName']);
  assert.deepEqual(p.lines, [{ partCode: 'DIL-0005', qtyInvoiced: 7, qtyReceived: 5, unitCostPaise: 4950 }]);
  assert.equal(p.supplierInvoiceNo, 'INV/9001');
  has(a.h.calls.toast.slice(-1)[0], /Receipt GRN\/26-27\/0001 saved: 1 lines, 5 pieces\./);
  assert.equal(a.layerHtml(), '');
  has(a.rootHtml(), /GRN\/26-27\/0001/);
  const ctx = a.h.core.last('receiveGoods').args[1];
  has(ctx.clientRef, /^svs-[a-z0-9]+-\d+$/);
  assert.equal(ctx.session.tier, 'manager');
  assert.equal(ctx.stepUp, null);
});

test('S13 goods receipt: invoice quantity below received, duplicate part, 101st line, duplicate invoice from the core', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-receive');
  await a.click('svs-grn-new');
  await a.type('supplierInvoiceNo', 'A1');
  await a.type('supplierInvoiceDate', '2026-11-12');
  for (let i = 0; i < 2; i++) {
    if (i === 1) await a.click('svs-grn-line-add');
    await a.type('partSearch', 'DIL', undefined, i);
    await a.click('svs-grn-pick-part', i + '|DIL-0005');
    await a.type('qtyReceived', '5', undefined, i);
    await a.type('cost', '10', undefined, i);
  }
  await a.type('qtyInvoiced', '3', undefined, 0);
  await a.click('svs-grn-save');
  has(a.layerHtml(), /The invoice quantity cannot be less than the quantity received\./);
  has(a.layerHtml(), /This part is already on another line\./);
  await a.click('svs-grn-line-remove', '1');
  await a.type('qtyInvoiced', '5', undefined, 0);
  await a.click('svs-grn-save');
  assert.equal(a.h.core.count('receiveGoods'), 1);
  // same invoice again: the core refuses, the dialog stays open with the typed values
  await a.click('svs-grn-new');
  await a.type('supplierInvoiceNo', 'A1');
  await a.type('supplierInvoiceDate', '2026-11-12');
  await a.type('partSearch', 'DIL', undefined, 0);
  await a.click('svs-grn-pick-part', '0|DIL-0005');
  await a.type('qtyReceived', '1', undefined, 0);
  await a.type('cost', '10', undefined, 0);
  await a.click('svs-grn-save');
  has(a.layerHtml(), /This supplier invoice was already received\./);
  assert.equal(a.field('supplierInvoiceNo').value, 'A1');
  // line cap
  for (let i = 0; i < 100; i++) await a.click('svs-grn-line-add');
  has(a.layerHtml(), /One posting can hold at most 100 lines\./);
  assert.equal(a.layer().querySelectorAll('[data-svs-field="partSearch"]').length, 100);
});

test('S14 double press on Save posts once; the clientRef is the same for a retry of the same dialog and new for the next dialog', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-receive');
  const fill = async () => {
    await a.click('svs-grn-new');
    await a.type('supplierInvoiceNo', 'D' + a.h.core.count('receiveGoods'));
    await a.type('supplierInvoiceDate', '2026-11-12');
    await a.type('partSearch', 'DIL', undefined, 0);
    await a.click('svs-grn-pick-part', '0|DIL-0005');
    await a.type('qtyReceived', '1', undefined, 0);
    await a.type('cost', '10', undefined, 0);
  };
  await fill();
  const el = a.find('svs-grn-save');
  fire(a.doc, el, 'click');
  const second = a.ui.internals.dispatch('svs-grn-save');
  const r = await second;
  await flush();
  assert.equal(r.code, 'SVS_BUSY');
  assert.equal(a.h.core.count('receiveGoods'), 1);
  const ref1 = a.h.core.last('receiveGoods').args[1].clientRef;
  // a failed save keeps the dialog; retry uses the same ref
  a.h.core.forced.receiveGoods = { ok: false, code: 'SVCS_WRITE_FAILED' };
  await fill();
  await a.click('svs-grn-save');
  const refA = a.h.core.last('receiveGoods').args[1].clientRef;
  has(a.layerHtml(), /Could not confirm the save/);
  await a.click('svs-grn-save');
  assert.equal(a.h.core.last('receiveGoods').args[1].clientRef, refA);
  delete a.h.core.forced.receiveGoods;
  await a.click('svs-grn-save');
  assert.equal(a.h.core.last('receiveGoods').args[1].clientRef, refA);
  await fill();
  await a.click('svs-grn-save');
  assert.notEqual(a.h.core.last('receiveGoods').args[1].clientRef, refA);
  assert.notEqual(refA, ref1);
});

test('S15 receipts list: view dialog, print, reverse is Owner only with a reason and the PIN', async () => {
  const core = makeCore();
  core.state.receipts.push({ no: 'GRN/26-27/0001', supplierName: 'Titan', supplierInvoiceNo: 'INV1', supplierInvoiceDate: '2026-11-10', date: '2026-11-12', lines: [{ partCode: 'DIL-0005', qtyInvoiced: 7, qtyReceived: 5, qtyShort: 2, unitCostPaise: 5000, valuePaise: 25000 }], pieces: 5, totalPaise: 25000, status: 'POSTED' });
  const m = await open(SESS.manager, { core });
  await m.click('svs-tab-receive');
  has(m.rootHtml(), /Rs 250\.00/);
  has(m.rootHtml(), /Reverse \(Owner\)/);
  await m.click('svs-grn-view', 'GRN/26-27/0001');
  has(m.layerHtml(), /Goods receipt/);
  has(m.layerHtml(), /Quantity on invoice/);
  has(m.layerHtml(), /Short/);
  await m.click('svs-grn-print', 'GRN/26-27/0001');
  assert.equal(m.h.calls.report[0].type, 'svcGoodsReceipt');
  assert.equal(m.h.calls.report[0].opts.grnNo, 'GRN/26-27/0001');
  await m.click('svs-grn-view-close');
  const r = await m.ui.internals.dispatch('svs-grn-reverse', 'GRN/26-27/0001');
  assert.equal(r.code, 'SVS_OWNER_ONLY');
  assert.equal(m.h.calls.reauth.length, 0);
  assert.equal(m.layerHtml(), '');
  // owner
  const o = await open(SESS.owner, { core });
  await o.click('svs-tab-receive');
  await o.click('svs-grn-reverse', 'GRN/26-27/0001');
  await o.click('svs-grn-reverse-confirm', 'GRN/26-27/0001');
  has(o.layerHtml(), /Type a reason of at least 5 characters\./);
  assert.equal(o.h.calls.reauth.length, 0);
  await o.type('reason', 'Wrong supplier invoice entered');
  await o.click('svs-grn-reverse-confirm', 'GRN/26-27/0001');
  assert.equal(o.h.calls.reauth.length, 1);
  assert.equal(o.h.calls.reauth[0], 'Reverse goods receipt GRN/26-27/0001: 5 pieces, value Rs 250.00. Stock will go down.');
  const c = o.h.core.last('reverseDoc');
  assert.equal(c.args[0], 'GRN/26-27/0001');
  assert.equal(c.args[1], 'Wrong supplier invoice entered');
  assert.equal(c.args[2].stepUp.ok, true);
  has(o.rootHtml(), /Reversed/);
});

test('S16 counter sale: no customer field, price change needs a note, success clears the form, reverse needs a reason and no PIN', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-counter');
  has(a.rootHtml(), /Counter sale money is taken as a receipt in Billing and goes to the cash book\./);
  hasNot(a.rootHtml(), /data-svs-field="(cust|customer|mobile|phone|address|email)/i);
  hasNot(a.rootHtml(), /Customer|Mobile/);
  await a.click('svs-cs-save');
  has(a.rootHtml(), /Pick a part from the list\./);
  await a.type('partSearch', 'dil-0005');
  await a.click('svs-cs-pick-part', '|DIL-0005');
  assert.equal(a.field('price').value, '150.00');
  assert.equal(a.field('qty').value, '1');
  // price changed without a note
  await a.type('price', '140');
  await a.click('svs-cs-save');
  has(a.rootHtml(), /Type a note of at least 5 characters\./);
  assert.equal(a.h.core.count('counterSale'), 0);
  await a.type('note', 'Old stock discount');
  await a.type('qty', '2');
  await a.setSelect('payMode', 'UPI');
  await a.click('svs-cs-save');
  const p = P(lastPayload(a, 'counterSale'));
  assert.deepEqual(p, { lines: [{ partCode: 'DIL-0005', qty: 2, unitPricePaise: 14000 }], payMode: 'UPI', ccptInvoiceNo: '', amountPaise: 28000, note: 'Old stock discount' });
  has(a.h.calls.toast.slice(-1)[0], /Counter sale recorded: 2 x DIL-0005\./);
  has(a.rootHtml(), /CSL\/26-27\/0001/);
  assert.equal(a.field('partSearch').value, '');
  // too many pieces: the core's text with the number
  await a.type('partSearch', 'CLP');
  await a.click('svs-cs-pick-part', '|CLP-0009');
  await a.type('qty', '5');
  await a.click('svs-cs-save');
  has(a.rootHtml(), /Not enough stock\. On hand: 1\./);
  // reverse: reason of 5+, no PIN
  await a.click('svs-cs-reverse', 'CSL/26-27/0001');
  await a.click('svs-cs-reverse-confirm', 'CSL/26-27/0001');
  has(a.layerHtml(), /at least 5 characters/);
  await a.type('reason', 'Customer changed mind');
  await a.click('svs-cs-reverse-confirm', 'CSL/26-27/0001');
  assert.equal(a.h.calls.reauth.length, 0);
  assert.equal(a.h.core.last('reverseDoc').args[1], 'Customer changed mind');
  assert.equal(a.h.core.last('reverseDoc').args[2].stepUp, null);
  // a sale not in today's list (forced click) counts as an older sale: a Manager is refused, no core call
  const before = a.h.core.count('reverseDoc');
  await a.ui.internals.dispatch('svs-cs-reverse', 'CSL/25-26/0099');
  await flush();
  await a.type('reason', 'Forced older reversal');
  const old = await a.ui.internals.dispatch('svs-cs-reverse-confirm', 'CSL/25-26/0099');
  await flush();
  assert.equal(old.code, 'SVS_OWNER_ONLY');
  assert.equal(a.h.core.count('reverseDoc'), before);
  assert.equal(a.h.calls.reauth.length, 0);
  // staff and store-class: only store-class can sell
  const s = await open(SESS.staff);
  assert.equal(s.find('svs-tab-counter'), null);
});

test('S17 adjustments: direction rules, note rule, locked Approve for a Manager, Owner approves with the PIN', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-adjust');
  has(a.rootHtml(), /Nothing is waiting for approval\./);
  await a.click('svs-adj-new');
  await a.type('partSearch', 'dil', undefined, 0);
  await a.click('svs-adj-pick-part', '0|DIL-0005');
  await a.setSelect('reason', 'FOUND', undefined, 0);
  assert.equal(a.field('direction', undefined, 0).value, 'up');
  await a.setSelect('direction', 'down', undefined, 0);
  await a.click('svs-adj-save');
  has(a.layerHtml(), /This reason can only increase stock\./);
  has(a.layerHtml(), /Type a note of at least 5 characters\./);
  await a.setSelect('reason', 'DAMAGED', undefined, 0);
  assert.equal(a.field('direction', undefined, 0).value, 'down');
  await a.type('note', 'Glass cracked in the drawer');
  await a.type('qty', '2', undefined, 0);
  await a.click('svs-adj-save');
  const p = P(lastPayload(a, 'proposeAdjustment'));
  assert.deepEqual(p, { lines: [{ partCode: 'DIL-0005', qtyDelta: -2, reason: 'DAMAGED', unitCostPaise: null }], note: 'Glass cracked in the drawer' });
  assert.equal(a.layerHtml(), '');
  has(a.rootHtml(), /DOC-000001/);
  // manager: locked button, refused with the Owner-only text, no PIN asked
  has(a.rootHtml(), /Approve \(Owner\)/);
  const r = await a.ui.internals.dispatch('svs-adj-approve', 'DOC-000001');
  assert.equal(r.code, 'SVS_OWNER_ONLY');
  assert.equal(a.h.calls.reauth.length, 0);
  assert.equal(a.h.core.count('approveAdjustment'), 0);
  // manager rejects (reason, no PIN)
  await a.click('svs-adj-reject', 'DOC-000001');
  await a.click('svs-adj-reject-confirm', 'DOC-000001');
  has(a.layerHtml(), /at least 5 characters/);
  // owner
  const core = a.h.core;
  const o = await open(SESS.owner, { core });
  await o.click('svs-tab-adjust');
  await o.click('svs-adj-approve', 'DOC-000001');
  assert.equal(o.h.calls.reauth.length, 1);
  assert.equal(o.h.calls.reauth[0], 'Approve stock adjustment DOC-000001: decrease 2 of DIL-0005 (DAMAGED), value Rs 50.00');
  const ap = o.h.core.last('approveAdjustment');
  assert.equal(ap.args[0], 'DOC-000001');
  assert.equal(ap.args[1].stepUp.ok, true);
  has(o.h.calls.toast.slice(-1)[0], /Adjustment approved and posted\./);
});

test('S18 a Store Manager with a limit approves a correction without the PIN; above the limit or a write-off stays locked', async () => {
  const core = makeCore();
  core.state.config.adjustLimitPaise = 10000;
  core.state.adjustments.push({ proposalId: 'DOC-000007', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'Someone Else', note: 'count', lines: [{ partCode: 'DIL-0005', qtyDelta: 1, reason: 'COUNT_CORRECTION' }], valuePaise: 5000, needsOwner: false, reasonClass: 'CORRECTION' });
  core.state.adjustments.push({ proposalId: 'DOC-000008', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'Someone Else', note: 'lost', lines: [{ partCode: 'DIL-0005', qtyDelta: -1, reason: 'LOST' }], valuePaise: 5000, needsOwner: true, reasonClass: 'WRITEOFF' });
  const a = await open(SESS.manager, { core });
  await a.click('svs-tab-adjust');
  assert.equal(a.find('svs-adj-approve', 'DOC-000007').textContent, 'Approve');
  assert.equal(a.find('svs-adj-approve', 'DOC-000008').textContent, 'Approve (Owner)');
  await a.click('svs-adj-approve', 'DOC-000007');
  assert.equal(a.h.calls.reauth.length, 0);
  const call = core.last('approveAdjustment');
  assert.equal(call.args[0], 'DOC-000007');
  assert.equal(call.args[1].stepUp, null);
  const r = await a.ui.internals.dispatch('svs-adj-approve', 'DOC-000008');
  assert.equal(r.ok, false);
  assert.equal(core.count('approveAdjustment'), 1);
});

test('S19 old parts: register, move targets from the core, scrap sign-off for a finished month with the PIN', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-oldparts');
  has(a.rootHtml(), /No old parts registered yet\./);
  await a.click('svs-old-new');
  has(a.layerHtml(), /Held for claim/);
  hasNot(a.layerHtml(), /Scrapped|Sent to Titan/);
  await a.type('jobId', 'WS-2026-999');
  await a.type('partText', 'Cracked glass');
  await a.click('svs-old-save');
  has(a.layerHtml(), /That job number was not found\./);
  assert.equal(a.h.core.count('registerOldPart'), 0);
  await a.type('jobId', 'ws-2026-001');
  await a.click('svs-old-save');
  const p = P(lastPayload(a, 'registerOldPart'));
  assert.deepEqual(p, { jobId: 'WS-2026-001', partCode: '', partText: 'Cracked glass', qty: 1, serialRef: '', state: 'HELD_FOR_CLAIM', claimRef: '', note: '' });
  has(a.rootHtml(), /OLD\/26-27\/0001/);
  has(a.rootHtml(), /Held for claim/);
  has(a.rootHtml(), /Claim bin/);
  // move: targets from the core, note rule for scrap
  await a.click('svs-old-move', 'OLD/26-27/0001');
  has(a.layerHtml(), /Customer Returned/);
  has(a.layerHtml(), /Scrap pending Owner sign-off/);
  has(a.layerHtml(), /the part leaves the premises with the customer/i);
  await a.setSelect('to', 'SCRAP_PENDING');
  await a.click('svs-old-move-save');
  has(a.layerHtml(), /Write a note of at least 5 characters\./);
  await a.type('note', 'Claim refused by Titan');
  await a.click('svs-old-move-save');
  assert.equal(a.h.core.last('moveOldPart').args[1].to, 'SCRAP_PENDING');
  has(a.rootHtml(), /Scrap pending Owner sign-off/);
  // sign-off: manager is locked out; owner needs the PIN and a finished month
  const r = await a.ui.internals.dispatch('svs-old-signoff');
  assert.equal(r.code, 'SVS_OWNER_ONLY');
  const o = await open(SESS.owner, { core: a.h.core });
  await o.click('svs-tab-oldparts');
  await o.click('svs-old-signoff');
  assert.equal(o.field('month').value, '2026-10');
  has(o.layerHtml(), /OLD\/26-27\/0001/);
  o.field('month').value = '2026-11';
  await o.click('svs-old-signoff-confirm');
  has(o.layerHtml(), /A month can be signed off only after it has ended\./);
  assert.equal(o.h.calls.reauth.length, 0);
  await o.setSelect('month', '2026-10');
  await o.click('svs-old-signoff-confirm');
  assert.equal(o.h.calls.reauth[0], 'Sign off scrap for 2026-10: 1 old parts will be marked scrapped');
  const so = o.h.core.last('signOffScrap').args[0];
  assert.deepEqual(P(so), { month: '2026-10', oldNos: ['OLD/26-27/0001'], note: '' });
  has(o.rootHtml(), /Scrapped/);
});

test('S20 reorder list and its print', async () => {
  const a = await open(SESS.staff);
  await a.click('svs-tab-reorder');
  has(a.rootHtml(), /CLP-0009/);
  hasNot(a.rootHtml(), /DIL-0005/);
  await a.click('svs-reorder-print');
  assert.equal(a.h.calls.report[0].type, 'svcReorderList');
  assert.ok(a.h.calls.report[0].opts.svcData);
  const none = await open(SESS.staff, { core: makeCore({ parts: [samplePart('A1', { reorderLevel: 0 })] }) });
  await none.click('svs-tab-reorder');
  has(none.rootHtml(), /Nothing is at or below its reorder level\./);
  // a missing report engine shows the plain text and prints nothing
  const b = await open(SESS.staff, { report: null });
  await b.click('svs-tab-reorder');
  await b.click('svs-reorder-print');
  has(b.rootHtml(), /Printing is not available in this build\./);
});

test('S21 adjustment and old-part registers print through the report engine', async () => {
  const a = await open(SESS.manager);
  await a.click('svs-tab-adjust');
  await a.click('svs-adj-print');
  assert.equal(a.h.calls.report[0].type, 'svcAdjustmentRegister');
  assert.equal(a.h.calls.report[0].opts.month, '2026-11');
  await a.click('svs-tab-oldparts');
  await a.click('svs-old-print');
  assert.equal(a.h.calls.report[1].type, 'svcDefectiveRegister');
  assert.equal(a.h.core.last('reportData').args[2].session.tier, 'manager');
});

test('S22 opening stock: a Manager proposes, entries survive paging and tab switches, qty without cost is refused', async () => {
  const parts = [];
  for (let i = 0; i < 60; i++) parts.push(samplePart('O' + String(i).padStart(3, '0'), { openingSet: false, onHand: 0 }));
  parts.push(samplePart('DONE-1', { openingSet: true }));
  const a = await open(SESS.manager, { core: makeCore({ parts }) });
  await a.click('svs-tab-opening');
  has(a.rootHtml(), /Opening stock is set for <span class="svs-num">1<\/span> of <span class="svs-num">61<\/span> parts/);
  assert.equal(a.find('svs-open-post'), null);
  assert.ok(a.find('svs-open-propose'));
  hasNot(a.rootHtml(), /DONE-1/);
  const qtyOf = (code) => a.h.el.root.querySelectorAll('[data-svs-field="o-qty"]').find((e) => e.getAttribute('data-svs-key') === code);
  assert.equal(a.h.el.root.querySelectorAll('[data-svs-field="o-qty"]').length, 25);
  qtyOf('O000').value = '4'; fire(a.doc, qtyOf('O000'), 'input');
  const costOf = (code) => a.h.el.root.querySelectorAll('[data-svs-field="o-cost"]').find((e) => e.getAttribute('data-svs-key') === code);
  await a.click('svs-open-propose');
  has(a.rootHtml(), /O000: Enter an amount in rupees/);
  assert.equal(a.h.core.count('proposeOpening'), 0);
  assert.equal(qtyOf('O000').getAttribute('aria-invalid'), null);
  assert.equal(costOf('O000').getAttribute('aria-invalid'), 'true');
  costOf('O000').value = '12.50'; fire(a.doc, costOf('O000'), 'input');
  await a.click('svs-open-page-next');
  qtyOf('O030').value = '2'; fire(a.doc, qtyOf('O030'), 'input');
  costOf('O030').value = '100'; fire(a.doc, costOf('O030'), 'input');
  await a.click('svs-tab-stock');
  await a.click('svs-tab-opening');
  await a.click('svs-open-page-prev');
  assert.equal(qtyOf('O000').value, '4');
  assert.equal(costOf('O000').value, '12.50');
  await a.click('svs-open-propose');
  has(a.layerHtml(), /2<\/span> parts, <span class="svs-num">6<\/span> pieces, Value <span class="svs-num">Rs 250\.00<\/span>/);
  has(a.layerHtml(), /The Owner approves it with the PIN/);
  await a.click('svs-open-confirm');
  const p = P(lastPayload(a, 'proposeOpening'));
  assert.deepEqual(p.lines, [{ partCode: 'O000', qty: 4, unitCostPaise: 1250 }, { partCode: 'O030', qty: 2, unitCostPaise: 10000 }]);
  assert.equal(a.h.calls.reauth.length, 0);
  has(a.h.calls.toast.slice(-1)[0], /Opening stock sent for approval: 2 parts\./);
  has(a.rootHtml(), /DOC-500/);
  hasNot(a.rootHtml(), /data-svs-key="O000"[^>]*>[\s\S]{0,200}svs-oq-0/);
  // the proposer can withdraw; a Manager cannot approve
  assert.equal(a.find('svs-open-approve').textContent, 'Approve (Owner)');
  const r = await a.ui.internals.dispatch('svs-open-approve', 'DOC-500');
  assert.equal(r.code, 'SVS_OWNER_ONLY');
  await a.click('svs-open-withdraw', 'DOC-500');
  assert.equal(a.h.core.last('withdrawOpening').args[0], 'DOC-500');
});

test('S23 opening stock: the Owner posts with one PIN (propose then approve), the label states parts, pieces and value', async () => {
  const core = makeCore({ parts: [samplePart('A1', { openingSet: false, onHand: 0 }), samplePart('A2', { openingSet: false, onHand: 0 })] });
  const a = await open(SESS.owner, { core });
  await a.click('svs-tab-opening');
  const set = (name, code, v) => { const e = a.h.el.root.querySelectorAll('[data-svs-field="' + name + '"]').find((x) => x.getAttribute('data-svs-key') === code); e.value = v; fire(a.doc, e, 'input'); };
  set('o-qty', 'A1', '3'); set('o-cost', 'A1', '10');
  set('o-qty', 'A2', '0'); set('o-cost', 'A2', '5');
  await a.click('svs-open-post');
  has(a.layerHtml(), /1<\/span> parts, <span class="svs-num">3<\/span> pieces, Value <span class="svs-num">Rs 30\.00<\/span>\. This can be done only once per part\./);
  assert.equal(a.h.calls.reauth.length, 0);
  a.h.reauthResult = false;
  await a.click('svs-open-confirm');
  assert.equal(a.h.calls.reauth[0], 'Post opening stock: 1 parts, 3 pieces, value Rs 30.00. Once per part.');
  assert.equal(core.count('proposeOpening'), 0);
  has(a.layerHtml(), /Owner approval was not given\. Nothing was changed\./);
  a.h.reauthResult = true;
  await a.click('svs-open-confirm');
  assert.equal(a.h.calls.reauth.length, 2);
  assert.equal(core.count('proposeOpening'), 1);
  const ap = core.last('approveOpening');
  assert.equal(ap.args[0], 'DOC-500');
  assert.equal(ap.args[1].stepUp.ok, true);
  assert.equal(core.last('proposeOpening').args[1].stepUp.ok, true);
  has(a.h.calls.toast.slice(-1)[0], /Opening stock posted: 1 parts, 3 pieces\./);
  assert.equal(a.layerHtml(), '');
});

test('S24 Settings tab: Owner only, saved with the PIN; the Manager never sees it', async () => {
  const a = await open(SESS.owner);
  await a.click('svs-tab-settings');
  has(a.rootHtml(), /Store Manager adjustment limit/);
  has(a.rootHtml(), /Assistant Technician/);
  hasNot(a.rootHtml(), />Store Manager<\/label>|>Owner<\/label>/);
  await a.type('limit', 'abc');
  const bad = await a.ui.internals.dispatch('svs-settings-save');
  assert.equal(bad.code, 'SVS_MONEY_INVALID');
  assert.equal(a.h.calls.reauth.length, 0);
  await a.type('limit', '500');
  a.field('role-0').checked = true;
  a.field('role-5').checked = true;
  await a.click('svs-settings-save');
  assert.equal(a.h.calls.reauth.length, 1);
  assert.equal(a.h.calls.reauth[0], 'Change Stores settings: Store Manager adjustment limit Rs 500.00, 2 store roles');
  const c = a.h.core.last('setConfig');
  assert.deepEqual(P(c.args[0]), { adjustLimitPaise: 50000, storeRoles: ['Cashier', 'Trainee'] });
  assert.equal(c.args[1].stepUp.ok, true);
  assert.equal(a.field('limit').value, '500.00');
  const m = await open(SESS.manager);
  assert.equal(m.find('svs-tab-settings'), null);
  const r = await m.ui.internals.dispatch('svs-settings-save');
  assert.equal(r.code, 'SVS_OWNER_ONLY');
  assert.equal(m.h.core.count('setConfig'), 0);
});

test('S25 Parts and labour tab hosts the masters screen; Add and Edit from Stock jump into it', async () => {
  const calls = [];
  const masters = { mount(el, env) { calls.push(['mount', el.id, Object.keys(env).sort().join(',')]); return { openNew(k) { calls.push(['openNew', k]); }, openEdit(k, c) { calls.push(['openEdit', k, c]); }, refresh() { calls.push(['refresh']); } }; } };
  const a = await open(SESS.manager, { masters });
  await a.click('svs-stock-edit-part', 'DIL-0005');
  assert.deepEqual(P(calls[0]), ['mount', 'svs-masters-host', 'core,isPast,now,onChange,readSession,reauth,session,toast,esc'.split(',').sort().join(',')]);
  assert.deepEqual(P(calls[1]), ['openEdit', 'part', 'DIL-0005']);
  await a.click('svs-tab-stock');
  await a.click('svs-stock-add-part');
  assert.deepEqual(P(calls.slice(-2)), [['refresh'], ['openNew', 'part']]);
  assert.equal(calls.filter((c) => c[0] === 'mount').length, 1);
  const none = await open(SESS.manager);
  await none.click('svs-tab-masters');
  has(none.rootHtml(), /Parts and labour is not available in this build\./);
  const s = await open(SESS.staff, { masters });
  const r = await s.ui.internals.dispatch('svs-stock-edit-part', 'DIL-0005');
  await flush();
  assert.equal(s.find('svs-tab-masters'), null);
  assert.ok(r);
});

test('S26 every list escapes hostile text', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const evilCode = '"><script>x()</script>';
  const core = makeCore({ parts: [samplePart(evilCode, { name: evil, group: evil, openingSet: false, onHand: 0, reorderLevel: 5 })] });
  core.state.receipts.push({ no: evil, supplierName: evil, supplierInvoiceNo: evil, supplierInvoiceDate: '2026-11-10', date: '2026-11-12', lines: [], pieces: 1, totalPaise: 1, status: 'POSTED' });
  core.state.adjustments.push({ proposalId: evil, no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: evil, note: '`${alert(1)}`', lines: [{ partCode: evilCode, qtyDelta: 1, reason: 'FOUND' }], valuePaise: 1, needsOwner: true });
  core.state.oldParts.push({ no: evil, at: '2026-11-13T05:00:00.000Z', jobId: evil, partText: evil, qty: 1, state: 'HELD_FOR_CLAIM', claimRef: evil });
  core.state.counterSales.push({ no: evil, at: '2026-11-13T05:00:00.000Z', payMode: evil, by: evil, lines: [{ partCode: evilCode, qty: 1, unitPricePaise: 1 }], reversed: false });
  core.state.openings.push({ id: evil, state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', by: evil, lines: [{ partCode: evilCode, qty: 1, unitCostPaise: 1 }] });
  const a = await open(SESS.owner, { core });
  for (const tab of ['stock', 'receive', 'counter', 'adjust', 'oldparts', 'reorder', 'opening']) {
    await a.click('svs-tab-' + tab);
    const html = a.rootHtml();
    hasNot(html, /<img|<script/);
  }
  await a.click('svs-tab-stock');
  await a.click('svs-stock-ledger', evilCode);
  hasNot(a.layerHtml(), /<img|<script/);
  // the raw strings the UI assigned: hostile text only ever appears escaped, never as a tag, quote break-out or live template
  const raw = a.doc.rawHtml.join('|');
  hasNot(raw, /<img src=x|<script>x\(\)|`/);
  has(raw, /&lt;img src=x onerror=alert\(1\)&gt;/);
  has(raw, /&quot;&gt;&lt;script&gt;x\(\)&lt;\/script&gt;/);
  has(raw, /&#96;\$\{alert\(1\)\}&#96;/);
});

test('S27 ids are unique across the Stores view, the job panel and an open dialog, and every label points at a field in its own area', async () => {
  const a = await open(SESS.manager);
  a.ui.refreshJob();
  await flush();
  await a.click('svs-job-issue-open');
  await a.click('svs-tab-counter');
  await a.click('svs-tab-adjust');
  await a.click('svs-adj-new');
  const ids = [];
  const walk = (el) => { for (const c of el.childNodes) { if (c.attrs) { if (c.attrs.id) ids.push(c.attrs.id); walk(c); } } };
  walk(a.doc.body);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, []);
  for (const area of [a.h.el.root, a.layer(), a.h.el.jobHost]) {
    for (const lab of area.querySelectorAll('label')) {
      const target = lab.getAttribute('for');
      assert.ok(area.querySelector('#' + target), 'label for ' + target + ' has no field in its own area');
    }
  }
  await a.click('svs-dialog-close');
  await a.click('svs-tab-counter');
  assert.ok(a.h.el.root.querySelector('#svs-f-cs-qty'));
  assert.ok(a.h.el.jobHost.querySelector('#svs-f-job-qty'));
});

test('S28 ledger filters and paging, reject an opening proposal, withdraw an adjustment, reverse a posted adjustment with the PIN', async () => {
  const rows = [];
  for (let i = 0; i < 120; i++) rows.push({ seq: i + 1, id: 'MOV-' + i, at: '2026-11-12T05:00:00.000Z', date: '2026-11-12', docType: 'GRN', docNo: 'GRN/26-27/0001', qtyIn: 1, qtyOut: 0, balanceQty: i + 1, unitCostPaise: 100, valuePaise: 100, by: 'x', note: '', reversed: false });
  const core = makeCore({ ledgerRows: rows });
  core.state.openings.push({ id: 'DOC-500', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', by: 'Someone', lines: [{ partCode: 'GLS-0001', qty: 1, unitCostPaise: 100 }] });
  core.state.adjustments.push({ proposalId: 'DOC-000010', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'Test Manager', note: 'mine', lines: [{ partCode: 'DIL-0005', qtyDelta: 1, reason: 'FOUND' }], valuePaise: 100, needsOwner: true });
  core.state.adjustments.push({ proposalId: 'DOC-000011', no: 'ADJ/26-27/0001', state: 'POSTED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'x', note: 'old', lines: [{ partCode: 'DIL-0005', qtyDelta: -1, reason: 'LOST' }], valuePaise: 100, needsOwner: true });
  const a = await open(SESS.owner, { core });
  await a.click('svs-stock-ledger', 'DIL-0005');
  a.field('from').value = '2026-12-01';
  a.field('to').value = '2026-11-01';
  await a.click('svs-ledger-apply');
  has(a.layerHtml(), /Enter a valid date\./);
  a.field('from').value = '2026-10-01';
  a.field('to').value = '2026-11-13';
  await a.click('svs-ledger-apply');
  assert.equal(P(core.last('ledger').args[1]).from, '2026-10-01');
  await a.click('svs-ledger-page-next');
  assert.equal(P(core.last('ledger').args[1]).offset, 50);
  has(a.layerHtml(), /Page <span class="svs-num">2<\/span> of <span class="svs-num">3<\/span>/);
  await a.click('svs-ledger-page-prev');
  assert.equal(P(core.last('ledger').args[1]).offset, 0);
  await a.click('svs-ledger-close');
  // reject the opening proposal: reason, no PIN
  await a.click('svs-tab-opening');
  await a.click('svs-open-reject', 'DOC-500');
  await a.click('svs-open-reject-confirm', 'DOC-500');
  has(a.layerHtml(), /at least 5 characters/);
  await a.type('reason', 'Counted twice by mistake');
  await a.click('svs-open-reject-confirm', 'DOC-500');
  assert.equal(core.last('rejectOpening').args[1], 'Counted twice by mistake');
  assert.equal(a.h.calls.reauth.length, 0);
  // withdraw my own adjustment proposal (no PIN), reverse the posted one (PIN)
  a.h.session = SESS.manager;
  await a.click('svs-tab-adjust');
  await a.click('svs-adj-withdraw', 'DOC-000010');
  assert.equal(core.last('withdrawAdjustment').args[0], 'DOC-000010');
  a.h.session = SESS.owner;
  await a.show();
  await a.click('svs-tab-adjust');
  await a.setSelect('f-adj-state', 'ALL');
  await a.click('svs-adj-reverse', 'ADJ/26-27/0001');
  await a.type('reason', 'Counted wrongly the first time');
  await a.click('svs-adj-reverse-confirm', 'ADJ/26-27/0001');
  assert.equal(a.h.calls.reauth[0], 'Reverse adjustment ADJ/26-27/0001. Stock will change back.');
  assert.equal(core.last('reverseDoc').args[0], 'ADJ/26-27/0001');
  assert.equal(core.last('reverseDoc').args[2].stepUp.ok, true);
});

/* ---------------- second pass (functional tester defects) ---------------- */

test('S2P-D1 a click on a control another screen owns (masters svcm- tick box) keeps its default; Stores buttons still do not', async () => {
  const a = await open(SESS.owner);
  const holder = a.doc.createElement('div');
  holder.innerHTML = '<label><input type="checkbox" data-svcs-action="svcm-field" data-svcm-name="flags.counterSaleable"> Counter saleable</label>' +
    '<select data-svcs-action="svcm-filter-group"><option value="">All</option></select>';
  a.h.el.root.appendChild(holder);
  const box = holder.querySelector('input');
  const ev = fire(a.doc, box, 'click');
  await flush();
  assert.equal(ev.defaultPrevented, false, 'the browser must be allowed to tick the box');
  const sel = holder.querySelector('select');
  assert.equal(fire(a.doc, sel, 'click').defaultPrevented, false);
  const tab = a.find('svs-tab-stock');
  assert.equal(fire(a.doc, tab, 'click').defaultPrevented, true, 'own buttons keep preventDefault');
  await flush();
});

test('S2P-D2tab Escape with the parts and labour inline form or paste box open stays in the module', async () => {
  let view = 'form';
  const masters = { mount() { return { state: { get view() { return view; } }, refresh() {} }; } };
  const a = setup({ session: SESS.owner, masters });
  a.mount();
  await a.show();
  await a.click('svs-tab-masters');
  for (const v of ['form', 'bulk']) {
    view = v;
    const ev = fire(a.doc, a.h.el.root, 'keydown', { key: 'Escape', keyCode: 27 });
    assert.equal(ev.stopped && ev.defaultPrevented, true, v + ': Escape must not reach the shell');
  }
  view = 'list';
  const ev2 = fire(a.doc, a.h.el.root, 'keydown', { key: 'Escape', keyCode: 27 });
  assert.equal(ev2.stopped, false, 'the list view lets Escape through as before');
});

test('S2P-D-1 Store Manager approval within the limit: a nameless Manager is told to sign in with a name, never "your own request"', async () => {
  const core = makeCore();
  core.state.config.adjustLimitPaise = 50000;
  core.state.adjustments.push({ proposalId: 'DOC-000011', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'Test Staff A', proposedRole: 'Cashier', proposedTier: 'staff', note: 'count', lines: [{ partCode: 'DIL-0005', qtyDelta: -1, reason: 'COUNT_CORRECTION' }], valuePaise: 5000, needsOwner: false, reasonClass: 'CORRECTION' });
  core.state.adjustments.push({ proposalId: 'DOC-000012', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: '', proposedRole: 'Store Manager', proposedTier: 'manager', note: 'count', lines: [{ partCode: 'DIL-0005', qtyDelta: 1, reason: 'COUNT_CORRECTION' }], valuePaise: 5000, needsOwner: false, reasonClass: 'CORRECTION' });
  core.state.adjustments.push({ proposalId: 'DOC-000013', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: '', proposedRole: 'Trainee', proposedTier: 'owner', note: 'count', lines: [{ partCode: 'DIL-0005', qtyDelta: 1, reason: 'COUNT_CORRECTION' }], valuePaise: 5000, needsOwner: false, reasonClass: 'CORRECTION' });
  const blank = Object.freeze(Object.assign({}, SESS.manager, { actorName: '' }));
  const a = await open(blank, { core });
  await a.click('svs-tab-adjust');
  const b11 = a.find('svs-adj-approve', 'DOC-000011');
  assert.equal(b11.textContent, 'Approve (Owner)');
  has(b11.getAttribute('title'), /staff name/);
  const r = await a.ui.internals.dispatch('svs-adj-approve', 'DOC-000011');
  assert.equal(r.code, 'APPROVER_NAME_REQUIRED');
  has(a.h.calls.toast.slice(-1)[0], /Sign in with your own staff name first/);
  assert.equal(core.count('approveAdjustment'), 0);
  // the nameless Manager can withdraw his own nameless proposal (same tier and role), not the Cashier's
  assert.ok(a.find('svs-adj-withdraw', 'DOC-000012'));
  assert.equal(a.find('svs-adj-withdraw', 'DOC-000011'), null);
  // a named Manager: the Cashier's and the Owner's proposals can be approved, the nameless Manager's cannot
  const n = await open(SESS.manager, { core });
  await n.click('svs-tab-adjust');
  assert.equal(n.find('svs-adj-approve', 'DOC-000011').textContent, 'Approve');
  assert.equal(n.find('svs-adj-approve', 'DOC-000013').textContent, 'Approve');
  assert.equal(n.find('svs-adj-approve', 'DOC-000012').textContent, 'Approve (Owner)');
  const r12 = await n.ui.internals.dispatch('svs-adj-approve', 'DOC-000012');
  assert.equal(r12.code, 'PROPOSER_NAME_MISSING');
  await n.click('svs-adj-approve', 'DOC-000011');
  assert.equal(core.count('approveAdjustment'), 1);
  assert.equal(n.h.calls.reauth.length, 0);
});

test('S2P-DEF-3 clock behind the last posting: the Owner can post with the PIN; anyone else keeps the refusal', async () => {
  const core = makeCore();
  core.forced.receiveGoods = (p, ctx) => (ctx && ctx.clockOverride === true ? { ok: true, doc: { no: 'GRN/26-27/0009' } } : { ok: false, code: 'SVCS_CLOCK_BACK', message: 'x' });
  const grn = async (session, reauthResult) => {
    const a = await open(session, { core });
    a.h.reauthResult = reauthResult;
    await a.click('svs-tab-receive');
    await a.click('svs-grn-new');
    await a.type('supplierInvoiceNo', 'CLK-1');
    await a.type('supplierInvoiceDate', '2026-11-12');
    await a.type('partSearch', 'dil', undefined, 0);
    await a.click('svs-grn-pick-part', '0|DIL-0005');
    await a.type('qtyReceived', '1', undefined, 0);
    await a.type('cost', '40', undefined, 0);
    await a.click('svs-grn-save');
    return a;
  };
  const before = core.count('receiveGoods');
  const m = await grn(SESS.manager, true);
  assert.equal(core.count('receiveGoods') - before, 1, 'Manager: one try, no override');
  assert.equal(m.h.calls.reauth.length, 0);
  has(m.layerHtml(), /Fix the clock or ask the Owner/);
  const o = await grn(SESS.owner, false);
  assert.equal(o.h.calls.reauth.length, 1, 'Owner is asked for the PIN');
  has(o.h.calls.reauth[0], /tablet clock behind the last posting/);
  has(o.layerHtml(), /Fix the clock or ask the Owner/);
  const n0 = core.count('receiveGoods');
  const ok = await grn(SESS.owner, true);
  assert.equal(core.count('receiveGoods') - n0, 2, 'refused once, then posted with the override');
  const last = core.last('receiveGoods');
  assert.equal(last.args[1].clockOverride, true);
  assert.equal(last.args[1].stepUp.ok, true);
  assert.equal(last.args[1].clientRef, core.calls.filter((c) => c.name === 'receiveGoods').slice(-2)[0].args[1].clientRef, 'same press, same reference');
  assert.equal(ok.layerHtml(), '');
});
