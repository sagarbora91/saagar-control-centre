// tests/svc1-core-demo.test.mjs
// The demo dataset of P8 7.4 built through the REAL core + documents layer + masters + FIFO + store,
// and the exact end state of P8 7.5. The tests are skipped (named, not hidden) while the documents layer file is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { docsExists, STAFF, CoreLib, makeClock, loadRealDocs, openCase } from './lib/svc1-core-kit.mjs';
import {
  buildDemoDataset, checkDemoTotals, demoInjectionMap, DEMO_EXPECTED, DEMO_PARTS, DEMO_LABOUR, DEMO_JOB_IDS, DEMO_OWNER, DEMO_MANAGER,
  DEMO_TODAY_ISO, demoDate
} from './lib/svc1-core-demo-dataset.mjs';

const skip = docsExists() ? false : 'the documents layer file www/service-stores-docs.js is not present yet';
let cached = null;
const data = () => (cached || (cached = buildDemoDataset()));

test('D01 the P8 7.5 totals: 427 pieces, 2,232,800 paise, per part, reorder rows, pending approvals, old parts', { skip }, () => {
  const d = data();
  const got = checkDemoTotals(d.core);
  assert.equal(got.pieces, 427);
  assert.equal(got.valuePaise, 2232800);
  assert.equal(got.pieces, DEMO_EXPECTED.pieces);
  assert.equal(got.valuePaise, DEMO_EXPECTED.valuePaise);
  assert.deepEqual(got.perPart, DEMO_EXPECTED.perPart);
  assert.deepEqual(got.reorder.slice().sort(), ['DEMO-CLP-0009', 'DEMO-DIL-0005']);
  assert.equal(got.reorder.length, 2);
  assert.equal(got.pendingAdjustments, 1);
  assert.equal(got.oldParts, 4);
  assert.equal(Object.keys(got.perPart).length, 12);
});

test('D02 the return of MOV-2115 went back to the 950 layer; battery layers follow FIFO', { skip }, () => {
  const d = data();
  const r = d.core.getPart('DEMO-MOV-2115', { session: DEMO_OWNER });
  assert.equal(r.ok, true);
  assert.deepEqual(r.layers.map((l) => [l.unitCostPaise, l.qtyRemaining]), [[95000, 2], [98000, 2]]);
  assert.equal(r.part.onHand, 4);
  assert.equal(r.part.valuePaise, 386000);
  const bat = d.core.getPart('DEMO-BAT-377', { session: DEMO_OWNER });
  assert.deepEqual(bat.layers.map((l) => [l.unitCostPaise, l.qtyRemaining]), [[3800, 37], [4000, 60], [4200, 50]]);
  const bat371 = d.core.getPart('DEMO-BAT-371', { session: DEMO_OWNER });
  assert.deepEqual(bat371.layers.map((l) => [l.unitCostPaise, l.qtyRemaining]), [[3600, 29], [3700, 18]]);
});

test('D03 document counts: 1 opening, 3 receipts, 6 issues, 1 return, 1 counter sale, 2 adjustments (1 posted, 1 proposed)', { skip }, () => {
  const d = data();
  const own = { session: DEMO_OWNER };
  assert.equal(d.core.listOpening(own).rows.length, 1);
  assert.equal(d.core.listReceipts({}, own).total, 3);
  assert.equal(d.core.listCounterSales({ all: true }, own).total, 1);
  const adj = d.core.listAdjustments({}, own);
  assert.equal(adj.total, 2);
  assert.deepEqual(adj.rows.map((r) => r.state).sort(), ['POSTED', 'PROPOSED']);
  const st = d.core.status();
  assert.equal(st.counts.ledger, 1 + 3 + 6 + 1 + 1 + 1);
  assert.equal(st.ready, true);
  assert.equal(st.openingSetCount, 12);
  assert.equal(st.counts.pendingProposals, 1);
  const kinds = { iss: 0, grn: 0, ret: 0 };
  for (const k of Object.keys(d.ids.docs)) { const m = k.replace(/\d+$/, ''); if (m in kinds) kinds[m] += 1; }
  assert.deepEqual(kinds, { iss: 6, grn: 3, ret: 1 });
});

test('D04 the six open jobs hold the issued parts, J6 is back to nothing', { skip }, () => {
  const d = data();
  const own = { session: DEMO_OWNER };
  const net = (j) => d.core.jobParts(j, own).totalNet;
  assert.deepEqual(DEMO_JOB_IDS.map(net), [2, 1, 3, 1, 2, 0]);
  assert.deepEqual(d.core.jobHasParts(DEMO_JOB_IDS[0]), { ok: true, has: true });
  assert.deepEqual(d.core.jobHasParts(DEMO_JOB_IDS[5]), { ok: true, has: false });
  assert.deepEqual(d.core.jobHasParts('WS-2026-999'), { ok: true, has: false });
});

test('D05 old part register: one row in each of the owner states', { skip }, () => {
  const d = data();
  const rows = d.core.listOldParts({}, { session: DEMO_MANAGER }).rows;
  assert.deepEqual(rows.map((r) => r.state).sort(), ['CUSTOMER_RETURNED', 'HELD_FOR_CLAIM', 'SCRAPPED', 'SCRAP_PENDING']);
  const by = Object.fromEntries(rows.map((r) => [r.state, r]));
  assert.equal(by.HELD_FOR_CLAIM.claimRef, 'DEMO-CLM-0001');
  assert.equal(by.HELD_FOR_CLAIM.jobId, DEMO_JOB_IDS[1]);
  assert.equal(by.SCRAPPED.signoffMonth, demoDate(DEMO_TODAY_ISO, 20).slice(0, 7));
  assert.equal(by.SCRAPPED.jobId, '');
  assert.equal(by.SCRAP_PENDING.jobId, DEMO_JOB_IDS[0]);
  assert.equal(by.CUSTOMER_RETURNED.stateLabel, 'Customer Returned');
});

test('D06 the staff view of the same data has quantities and no cost anywhere', { skip }, () => {
  const d = data();
  const staff = { session: STAFF };
  const list = d.core.listParts({ limit: 500 }, staff);
  assert.equal(list.totals.pieces, 427);
  assert.equal(list.totals.valuePaise, null);
  assert.ok(list.rows.every((r) => r.valuePaise === null && r.lastCostPaise === null));
  assert.equal(d.core.ledger('DEMO-BAT-377', {}, staff).code, 'ROLE_DENIED');
  assert.ok(d.core.reorderList(staff).rows.every((r) => r.estCostPaise === null));
});

test('D07 the six reports build from the demo data with the expected figures', { skip }, () => {
  const d = data();
  const own = { session: DEMO_OWNER };
  const stock = d.core.reportData('svcStockList', {}, own);
  assert.equal(stock.ok, true);
  assert.equal(stock.rows.length, 12);
  assert.equal(stock.rows.reduce((s, r) => s + r.valuePaise, 0), 2232800);
  assert.equal(stock.rows.reduce((s, r) => s + r.onHand, 0), 427);
  const re = d.core.reportData('svcReorderList', {}, own);
  assert.deepEqual(re.rows.map((r) => r.partCode).sort(), ['DEMO-CLP-0009', 'DEMO-DIL-0005']);
  const led = d.core.reportData('svcPartLedger', { partCode: 'DEMO-MOV-2115', from: demoDate(DEMO_TODAY_ISO, 61) }, own);
  assert.equal(led.ok, true, JSON.stringify(led));
  assert.deepEqual(led.closing, { qty: 4, valuePaise: 386000 });
  assert.equal(led.layers.reduce((s, l) => s + l.qtyRemaining * l.unitCostPaise, 0), 386000);
  const grn = d.core.reportData('svcGoodsReceipt', { grnNo: d.ids.docs.grn2 }, own);
  assert.equal(grn.ok, true);
  const short = grn.lines.find((l) => l.partCode === 'DEMO-BAT-371');
  assert.deepEqual([short.qtyReceived, short.qtyShort], [18, 2]);
  const adj = d.core.reportData('svcAdjustmentRegister', { from: demoDate(DEMO_TODAY_ISO, 30), to: demoDate(DEMO_TODAY_ISO, 0) }, own);
  assert.equal(adj.awaiting.length, 1);
  assert.equal(adj.awaiting[0].partCode, 'DEMO-PIN-0003');
  assert.equal(adj.awaiting[0].valueEffectPaise, -1250);
  assert.equal(adj.decided.length, 1);
  assert.equal(adj.decided[0].valueEffectPaise, -1800);
  const def = d.core.reportData('svcDefectiveRegister', { from: demoDate(DEMO_TODAY_ISO, 30), to: demoDate(DEMO_TODAY_ISO, 0) }, own);
  assert.equal(def.open.length, 2);
  assert.equal(def.listed.length, 4);
});

test('D08 two builds give byte-identical storage (the demo is deterministic)', { skip }, () => {
  const a = buildDemoDataset();
  const b = buildDemoDataset();
  assert.deepEqual(a.keys(), b.keys());
  assert.deepEqual(Object.keys(demoInjectionMap(a)).sort(), a.adapter.svcsKeys());
  assert.ok(Object.keys(a.keys()).length >= 7);
});

test('D09 the stored rows hold no customer field and no long digit run', { skip }, () => {
  const d = data();
  for (const [key, text] of Object.entries(d.keys())) {
    assert.match(key, /^saagar_svcs_/);
    assert.ok(!/custName|custMobile|custAddr|customerName|mobile|phone/i.test(text), key);
    // hashes are 64 hex characters and pinAt is a 13 digit time in milliseconds; neither is a phone number
    assert.ok(!/\d{10}/.test(text.replace(/[0-9a-f]{64}/g, '').replace(/"pinAt":\d+/g, '')), key + ' holds a ten digit run');
  }
  for (const p of DEMO_PARTS) assert.match(p.code, /^DEMO-/);
  for (const l of DEMO_LABOUR) assert.match(l.code, /^DEMO-/);
});

test('D10 a fresh core on the same storage reads the same figures and replays cleanly', { skip }, () => {
  const d = data();
  const clock = makeClock(DEMO_TODAY_ISO);
  const created = CoreLib.create({
    adapter: d.adapter, now: clock.now, cases: { get: (id) => openCase(id) }, libs: { docs: loadRealDocs() }, storeOptions: { watermark: false }
  });
  assert.equal(created.ok, true);
  const got = checkDemoTotals(created.core);
  assert.equal(got.pieces, 427);
  assert.equal(got.valuePaise, 2232800);
  assert.equal(created.core.status().ready, true);
});
