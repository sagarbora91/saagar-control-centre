// tests/lib/svc1-core-demo-dataset.mjs
// The demo dataset of P8 section 7.4 (plan C-PAGE-4), built through the REAL core, documents layer, masters, FIFO and store.
// Invented data only: every code has DEMO in it, there is no customer field and no real supplier.
// It is used by tests/svc1-core-demo.test.mjs and, as a key/value map, by the browser testers.
// Posting is in time order (oldest date first), because the ledger refuses a time earlier than the last movement.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { CoreLib, makeAdapter, makeClock, loadRealDocs, openCase } from './svc1-core-kit.mjs';

const require = createRequire(import.meta.url);
void require;

// TODAY is 2026-11-13 11:00 in India. Every event time is computed from it, never from a random stream.
export const DEMO_TODAY_ISO = '2026-11-13T05:30:00.000Z';

export const DEMO_OWNER = Object.freeze({ ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'Demo Owner' });
export const DEMO_MANAGER = Object.freeze({ ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Demo Keeper' });

const P = (code, name, group, sell, level, qty, bin, flags) => ({ code, name, group, sellRs: sell, level, qty, bin, flags: flags || {} });
export const DEMO_PARTS = Object.freeze([
  P('DEMO-BAT-377', 'Silver oxide battery 377 (demo)', 'Battery', 120, 20, 40, 'A1', { battery: true, counterSaleable: true }),
  P('DEMO-BAT-371', 'Silver oxide battery 371 (demo)', 'Battery', 120, 15, 30, 'A1', { battery: true, counterSaleable: true }),
  P('DEMO-STR-BLK18', 'Strap black leather 18 mm (demo)', 'Strap', 350, 5, 10, 'B1', { strap: true }),
  P('DEMO-STR-BRN20', 'Strap brown leather 20 mm (demo)', 'Strap', 380, 5, 10, 'B1', { strap: true }),
  P('DEMO-GLS-3401', 'Mineral glass 34 mm (demo)', 'Glass', 520, 3, 6, 'C1', { glass: true, warrantyClaimable: true }),
  P('DEMO-CRN-0112', 'Crown and stem set (demo)', 'Crown', 140, 5, 10, 'C2', { crown: true }),
  P('DEMO-GSK-0007', 'Case back gasket (demo)', 'Gasket', 25, 20, 40, 'C3', { counterSaleable: true }),
  P('DEMO-PIN-0003', 'Spring bar pin (demo)', 'Pin', 10, 30, 60, 'C3', { counterSaleable: true }),
  P('DEMO-MOV-2115', 'Quartz movement module (demo)', 'Movement', 1800, 2, 4, 'D1', { movement: true, warrantyClaimable: true }),
  P('DEMO-HND-0021', 'Hand set (demo)', 'Hands', 180, 3, 6, 'D2', {}),
  P('DEMO-DIL-0005', 'Dial plate (demo)', 'Dial', 900, 2, 4, 'D2', {}),
  P('DEMO-CLP-0009', 'Clasp (demo)', 'Clasp', 220, 5, 10, 'B2', {})
]);

export const DEMO_LABOUR = Object.freeze([
  { code: 'DEMO-LAB-BAT', name: 'Battery replacement', rateRs: 100 },
  { code: 'DEMO-LAB-GLS', name: 'Glass fitting', rateRs: 250 },
  { code: 'DEMO-LAB-STR', name: 'Strap fitting', rateRs: 50 },
  { code: 'DEMO-LAB-MIN', name: 'Minor repair', rateRs: 400 },
  { code: 'DEMO-LAB-OVH', name: 'Overhaul', rateRs: 1500 }
]);

// Opening lines: part, quantity, unit cost in paise (Rs 38.00 is 3800, Rs 2.50 is 250).
export const DEMO_OPENING = Object.freeze([
  ['DEMO-BAT-377', 40, 3800], ['DEMO-BAT-371', 30, 3600], ['DEMO-STR-BLK18', 12, 14000], ['DEMO-STR-BRN20', 10, 15000],
  ['DEMO-GLS-3401', 8, 21000], ['DEMO-CRN-0112', 15, 4500], ['DEMO-GSK-0007', 50, 600], ['DEMO-PIN-0003', 100, 250],
  ['DEMO-MOV-2115', 3, 95000], ['DEMO-HND-0021', 6, 8500], ['DEMO-DIL-0005', 2, 42000], ['DEMO-CLP-0009', 5, 9500]
].map(([partCode, qty, unitCostPaise]) => Object.freeze({ partCode, qty, unitCostPaise })));

// Job ids by formula (P8 7.3): the first open index is 520 (zero based), so the six ids are 521 to 526.
export const DEMO_JOB_IDS = Object.freeze([521, 522, 523, 524, 525, 526].map((n) => 'WS-2026-' + String(n).padStart(3, '0')));

// The hand-computed end state of P8 7.5 (a FIFO walk). Money in paise.
export const DEMO_EXPECTED = Object.freeze({
  pieces: 427,
  valuePaise: 2232800,
  perPart: Object.freeze({
    'DEMO-BAT-377': Object.freeze({ onHand: 147, valuePaise: 590600 }),
    'DEMO-BAT-371': Object.freeze({ onHand: 47, valuePaise: 171000 }),
    'DEMO-STR-BLK18': Object.freeze({ onHand: 17, valuePaise: 241000 }),
    'DEMO-STR-BRN20': Object.freeze({ onHand: 20, valuePaise: 305000 }),
    'DEMO-GLS-3401': Object.freeze({ onHand: 11, valuePaise: 235000 }),
    'DEMO-CRN-0112': Object.freeze({ onHand: 24, valuePaise: 111000 }),
    'DEMO-GSK-0007': Object.freeze({ onHand: 47, valuePaise: 28200 }),
    'DEMO-PIN-0003': Object.freeze({ onHand: 98, valuePaise: 24500 }),
    'DEMO-MOV-2115': Object.freeze({ onHand: 4, valuePaise: 386000 }),
    'DEMO-HND-0021': Object.freeze({ onHand: 6, valuePaise: 51000 }),
    'DEMO-DIL-0005': Object.freeze({ onHand: 1, valuePaise: 42000 }),
    'DEMO-CLP-0009': Object.freeze({ onHand: 5, valuePaise: 47500 })
  }),
  reorder: Object.freeze(['DEMO-DIL-0005', 'DEMO-CLP-0009']),
  pendingAdjustments: 1,
  oldParts: 4,
  // posted documents by kind; adjustments: 1 posted and 1 proposed
  docs: Object.freeze({ OPN: 1, GRN: 3, ISS: 6, RET: 1, CSL: 1, ADJ: 1 })
});

export function demoDate(todayIso, minusDays) {
  const d = new Date(new Date(todayIso).getTime() + 19800000 - minusDays * 86400000);
  return d.toISOString().slice(0, 10);
}
// Noon in India (06:30 UTC) of a date.
const noon = (date, extraMinutes = 0) => new Date(new Date(date + 'T06:30:00.000Z').getTime() + extraMinutes * 60000).toISOString();

function must(res, label) {
  assert.equal(res.ok, true, label + ': ' + JSON.stringify(res));
  return res;
}

// Builds the whole dataset. Options: {today} ISO instant, {docsLib} to test another documents layer.
export function buildDemoDataset(options = {}) {
  const todayIso = options.today || DEMO_TODAY_ISO;
  const docsLib = options.docsLib || loadRealDocs();
  assert.ok(docsLib, 'the documents layer file is needed for the demo dataset');
  const clock = makeClock(noon(demoDate(todayIso, 61)));
  const adapter = makeAdapter();
  const jobs = {};
  for (const id of DEMO_JOB_IDS) jobs[id] = openCase(id);
  const cases = { get: (id) => (Object.prototype.hasOwnProperty.call(jobs, id) ? jobs[id] : null) };
  const created = CoreLib.create({ adapter, now: clock.now, cases, libs: { docs: docsLib }, storeOptions: { watermark: options.watermark === true } });
  must(created, 'create core');
  const core = created.core;
  let counter = 0;
  const ref = () => 'demo-' + String(++counter).padStart(4, '0');
  const mgr = () => ({ session: DEMO_MANAGER, clientRef: ref() });
  const own = () => ({ session: DEMO_OWNER, stepUp: { ok: true, at: clock.ms }, clientRef: ref() });
  const ids = { jobs: DEMO_JOB_IDS.slice(), proposals: {}, docs: {}, old: {} };
  const D = (n) => demoDate(todayIso, n);
  const at = (n, extra) => clock.set(noon(D(n), extra || 0));

  // masters, a day before the opening
  for (const p of DEMO_PARTS) {
    must(core.savePart({
      code: p.code, name: p.name, group: p.group, unit: 'pc', sellPricePaise: p.sellRs * 100, priceIncludesTax: true,
      reorderLevel: p.level, reorderQty: p.qty, bin: p.bin, flags: p.flags
    }, mgr()), 'part ' + p.code);
  }
  for (const l of DEMO_LABOUR) {
    must(core.saveLabour({ code: l.code, name: l.name, group: 'Labour (demo)', unit: 'job', ratePaise: l.rateRs * 100, priceIncludesTax: true }, mgr()), 'labour ' + l.code);
  }

  // D-60 opening stock, proposed by the keeper, approved by the Owner with the PIN
  at(60);
  const op = must(core.proposeOpening({ lines: DEMO_OPENING.map((l) => ({ partCode: l.partCode, qty: l.qty, unitCostPaise: l.unitCostPaise })), note: 'demo opening stock' }, mgr()), 'propose opening');
  ids.proposals.opening = op.proposalId;
  at(60, 2);
  ids.docs.opening = must(core.approveOpening(op.proposalId, own()), 'approve opening').doc.no;

  const grn = (n, invNo, lines) => {
    at(n);
    return must(core.receiveGoods({
      supplierName: 'Demo Supplier', supplierInvoiceNo: invNo, supplierInvoiceDate: D(n + 1), lines, note: 'demo receipt'
    }, mgr()), 'receipt ' + invNo).doc.no;
  };
  ids.docs.grn1 = grn(45, 'DEMO-INV-0001', [
    { partCode: 'DEMO-BAT-377', qtyReceived: 60, unitCostPaise: 4000 }, { partCode: 'DEMO-STR-BLK18', qtyReceived: 6, unitCostPaise: 14500 },
    { partCode: 'DEMO-GLS-3401', qtyReceived: 4, unitCostPaise: 22000 }
  ]);

  // D-20 goods receipt 2 (battery 371 invoiced 20, received 18) and the carried-over old crown, scrap pending
  ids.docs.grn2 = grn(20, 'DEMO-INV-0002', [
    { partCode: 'DEMO-BAT-377', qtyReceived: 50, unitCostPaise: 4200 }, { partCode: 'DEMO-CRN-0112', qtyReceived: 10, unitCostPaise: 4800 },
    { partCode: 'DEMO-BAT-371', qtyInvoiced: 20, qtyReceived: 18, unitCostPaise: 3700 }
  ]);
  at(20, 5);
  ids.old.crown = must(core.registerOldPart({ jobId: '', partText: 'old crown (demo)', qty: 1, state: 'SCRAP_PENDING', note: 'carried over' }, mgr()), 'old crown').row.no;

  // D-14 adjustment: gasket minus 3, damaged (write-off class: Owner and PIN)
  at(14);
  const adj1 = must(core.proposeAdjustment({ lines: [{ partCode: 'DEMO-GSK-0007', qtyDelta: -3, reason: 'DAMAGED' }], note: 'three gaskets damaged' }, mgr()), 'propose adjustment 1');
  ids.proposals.adjPosted = adj1.proposalId;
  at(14, 3);
  ids.docs.adj1 = must(core.approveAdjustment(adj1.proposalId, own()), 'approve adjustment 1').doc.no;

  ids.docs.grn3 = grn(6, 'DEMO-INV-0003', [
    { partCode: 'DEMO-STR-BRN20', qtyReceived: 10, unitCostPaise: 15500 }, { partCode: 'DEMO-MOV-2115', qtyReceived: 2, unitCostPaise: 98000 }
  ]);

  // D-4 counter sale: two batteries for cash, Rs 240
  at(4);
  ids.docs.csl1 = must(core.counterSale({ lines: [{ partCode: 'DEMO-BAT-377', qty: 2, unitPricePaise: 12000 }], payMode: 'CASH', amountPaise: 24000, note: 'walk-in (demo)' }, mgr()), 'counter sale').doc.no;

  // D-2 issues to J1 and J2, with their old parts
  const [J1, J2, J3, J4, J5, J6] = DEMO_JOB_IDS;
  const issue = (n, extra, jobId, lines) => {
    at(n, extra);
    return must(core.issueToJob({ jobId, lines, note: 'demo issue' }, mgr()), 'issue ' + jobId).doc.no;
  };
  ids.docs.iss1 = issue(2, 0, J1, [{ partCode: 'DEMO-BAT-377', qty: 1 }, { partCode: 'DEMO-MOV-2115', qty: 1 }]);
  ids.docs.iss2 = issue(2, 1, J2, [{ partCode: 'DEMO-GLS-3401', qty: 1 }]);
  at(2, 5);
  ids.old.j1 = must(core.registerOldPart({ jobId: J1, partCode: 'DEMO-BAT-377', qty: 1, state: 'SCRAP_PENDING', note: 'old battery' }, mgr()), 'old J1').row.no;
  at(2, 6);
  ids.old.j2 = must(core.registerOldPart({ jobId: J2, partText: 'cracked glass (demo)', qty: 1, state: 'HELD_FOR_CLAIM', claimRef: 'DEMO-CLM-0001', note: 'cracked glass' }, mgr()), 'old J2').row.no;

  // D-1 issues to J3 to J6, and the old strap given back
  ids.docs.iss3 = issue(1, 0, J3, [{ partCode: 'DEMO-STR-BLK18', qty: 1 }, { partCode: 'DEMO-PIN-0003', qty: 2 }]);
  ids.docs.iss4 = issue(1, 1, J4, [{ partCode: 'DEMO-BAT-371', qty: 1 }]);
  ids.docs.iss5 = issue(1, 2, J5, [{ partCode: 'DEMO-CRN-0112', qty: 1 }, { partCode: 'DEMO-DIL-0005', qty: 1 }]);
  ids.docs.iss6 = issue(1, 3, J6, [{ partCode: 'DEMO-MOV-2115', qty: 1 }]);
  at(1, 5);
  ids.old.j3 = must(core.registerOldPart({ jobId: J3, partText: 'old strap (demo)', qty: 1, state: 'CUSTOMER_RETURNED', note: 'given back' }, mgr()), 'old J3').row.no;

  // today: the unused movement goes back, a count adjustment waits for the Owner, the old crown is signed off
  clock.set(todayIso);
  const j6 = must(core.jobParts(J6, { session: DEMO_MANAGER }), 'job parts J6');
  const issueMovementId = j6.rows[0].issues[0].movementId;
  ids.docs.ret1 = must(core.returnFromJob({ jobId: J6, lines: [{ issueMovementId, qty: 1, returnReason: 'UNUSED' }], note: 'unused' }, mgr()), 'return').doc.no;
  clock.advance(60000);
  const adj2 = must(core.proposeAdjustment({ lines: [{ partCode: 'DEMO-PIN-0003', qtyDelta: -5, reason: 'COUNT_CORRECTION' }], note: 'count came out five short' }, mgr()), 'propose adjustment 2');
  ids.proposals.adjPending = adj2.proposalId;
  clock.advance(60000);
  must(core.signOffScrap({ month: D(20).slice(0, 7), oldNos: [ids.old.crown], note: 'monthly sign off (demo)' }, own()), 'scrap sign-off');
  clock.set(todayIso);
  clock.advance(5 * 60000);

  const keys = () => {
    const out = {};
    for (const k of adapter.svcsKeys()) out[k] = adapter.data.get(k);
    return out;
  };
  return { core, adapter, clock, ids, today: todayIso, keys };
}

// The key/value map for a browser tester's scratch profile: every saagar_svcs_ key, nothing else.
export function demoInjectionMap(dataset) {
  return dataset.keys();
}

// What the dataset must look like through the core facade (used by the test and by the testers' checks).
export function checkDemoTotals(core, session = DEMO_OWNER) {
  const list = core.listParts({ limit: 500 }, { session });
  assert.equal(list.ok, true, JSON.stringify(list));
  const reorder = core.reorderList({ session });
  const pending = core.listAdjustments({ state: 'PROPOSED' }, { session });
  const old = core.listOldParts({}, { session });
  return {
    pieces: list.totals.pieces, valuePaise: list.totals.valuePaise,
    perPart: Object.fromEntries(list.rows.map((r) => [r.code, { onHand: r.onHand, valuePaise: r.valuePaise }])),
    reorder: reorder.rows.map((r) => r.partCode), pendingAdjustments: pending.total, oldParts: old.total
  };
}
