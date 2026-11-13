// tests/lib/svc1-gov-env.mjs
// A real core (real store, FIFO, masters and documents layers) on an in-memory adapter, for the governance tests.
// Invented data only. The adapter counts every write so a refusal can be proven to write nothing.
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO } from './svc1-gov-common.mjs';

const require = createRequire(import.meta.url);
const req = (f) => require(path.join(REPO, 'www', f));

export function loadLibs() {
  return { store: req('service-stores-store.js'), fifo: req('service-stores-fifo.js'), masters: req('service-stores-masters.js'), docs: req('service-stores-docs.js'), core: req('service-stores-core.js') };
}

export function makeClock(startIso = '2026-11-13T05:30:00.000Z') {
  let cur = new Date(startIso).getTime();
  const c = {
    now: () => new Date(cur),
    set(iso) { cur = new Date(iso).getTime(); return c; },
    advance(ms) { cur += ms; return c; },
    get ms() { return cur; }
  };
  return c;
}

export function makeAdapter() {
  const data = new Map();
  const a = {
    data,
    setCount: 0,
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); a.setCount += 1; },
    keys() { return Array.from(data.keys()); },
    authoritative() { return true; },
    svcsText() { return Array.from(data.entries()).filter(([k]) => /^saagar_svcs_/.test(k)).sort((x, y) => (x[0] < y[0] ? -1 : 1)); },
    fingerprint() { return JSON.stringify(a.svcsText()); }
  };
  return a;
}

// jobs: { id: {id, status, invoiceNo, paymentStatus, stub, ...extra} }  (extra fields are on purpose: a leak must show up in the tests)
export function makeGovEnv({ jobs = {}, start } = {}) {
  const libs = loadLibs();
  const clock = makeClock(start);
  const adapter = makeAdapter();
  const cases = { get: (id) => (Object.prototype.hasOwnProperty.call(jobs, id) ? jobs[id] : null) };
  const created = libs.core.create({ adapter, now: clock.now, cases, libs: { store: libs.store, fifo: libs.fifo, masters: libs.masters, docs: libs.docs }, storeOptions: { watermark: false } });
  if (!created || created.ok !== true) throw new Error('core.create failed: ' + JSON.stringify(created));
  const env = { libs, clock, adapter, cases, core: created.core, jobs };
  env.stamp = (deltaMs = 0) => ({ ok: true, at: clock.ms + deltaMs });
  env.ctx = (session, extra) => Object.assign({ session, clientRef: 'gov-' + clock.ms + '-' + (env.refN = (env.refN || 0) + 1) }, extra || {});
  return env;
}

export const jsonOf = (v) => JSON.parse(JSON.stringify(v));

export const FAKE_CUSTOMER = Object.freeze({ custName: 'Invented Person', custMobile: '9000000000', custAddr: 'Invented Road 1', custEmail: 'invented@example.test', customerName: 'Invented Person' });
export const FAKE_CUSTOMER_STRINGS = Object.freeze(['Invented Person', '9000000000', 'Invented Road 1', 'invented@example.test']);

// A job as the Service page could hand it over if it leaked: the agreed fields plus customer fields that must never be copied.
export const leakyJob = (id) => Object.assign({ id, status: 'open', invoiceNo: '', paymentStatus: '', stub: false, label: id + ' Titan Edge' }, FAKE_CUSTOMER);

// One of everything, by the owner and the Store Manager, in the plan shapes (2.6, 2.7, 2.11). Returns the ids it made.
export function seedFlow(env, { owner, manager }) {
  const out = {};
  const must = (name, r) => { if (!r || r.ok !== true) throw new Error('seedFlow ' + name + ' failed: ' + JSON.stringify(r)); return r; };
  const part = (code, name, group) => ({ code, name, group, unit: 'pc', hsn: '9113', gstRateBp: 1800, priceIncludesTax: true, sellPricePaise: 15000, reorderLevel: 2, reorderQty: 5, bin: 'A1', flags: { counterSaleable: true }, active: true, reason: 'new part' });
  must('savePart 1', env.core.savePart(part('NEW-1', 'Invented strap', 'Strap'), env.ctx(manager)));
  must('savePart 2', env.core.savePart(part('NEW-2', 'Invented glass', 'Glass'), env.ctx(manager)));
  must('saveLabour', env.core.saveLabour({ code: 'LAB-1', name: 'Invented service', group: 'Service', unit: 'job', sac: '9987', gstRateBp: 1800, priceIncludesTax: false, ratePaise: 25000, active: true, reason: 'new item' }, env.ctx(manager)));
  out.openingApproved = must('proposeOpening 1', env.core.proposeOpening({ lines: [{ partCode: 'NEW-1', qty: 10, unitCostPaise: 5000 }], note: 'opening count' }, env.ctx(manager))).proposalId;
  out.openingPending = must('proposeOpening 2', env.core.proposeOpening({ lines: [{ partCode: 'NEW-2', qty: 4, unitCostPaise: 7000 }], note: 'second count' }, env.ctx(manager))).proposalId;
  must('approveOpening', env.core.approveOpening(out.openingApproved, env.ctx(owner, { stepUp: env.stamp() })));
  out.grnNo = must('receiveGoods', env.core.receiveGoods({ supplierName: 'Titan', supplierInvoiceNo: 'INV-1', supplierInvoiceDate: '2026-11-01', lines: [{ partCode: 'NEW-1', qtyInvoiced: 6, qtyReceived: 5, unitCostPaise: 5500 }], note: 'one short' }, env.ctx(manager))).doc.no;
  out.issueNo = must('issueToJob', env.core.issueToJob({ jobId: 'WS-2026-001', billing: 'CHARGEABLE', lines: [{ partCode: 'NEW-1', qty: 3 }], note: '' }, env.ctx(manager))).doc.no;
  const jp = must('jobParts', env.core.jobParts('WS-2026-001', env.ctx(manager)));
  out.issueMovementId = jp.rows[0].issues[0].movementId;
  out.returnNo = must('returnFromJob', env.core.returnFromJob({ jobId: 'WS-2026-001', lines: [{ issueMovementId: out.issueMovementId, qty: 1, returnReason: 'UNUSED' }], note: '' }, env.ctx(manager))).doc.no;
  out.saleNo = must('counterSale', env.core.counterSale({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, env.ctx(manager))).doc.no;
  out.adjustmentPending = must('proposeAdjustment', env.core.proposeAdjustment({ lines: [{ partCode: 'NEW-1', qtyDelta: -1, reason: 'DAMAGED', unitCostPaise: null }], note: 'cracked' }, env.ctx(manager))).proposalId;
  out.oldNo = must('registerOldPart', env.core.registerOldPart({ jobId: 'WS-2026-001', partCode: 'NEW-1', partText: 'old strap', qty: 1, serialRef: 'SN-INV-1', state: 'HELD_FOR_CLAIM', claimRef: '', note: 'defective' }, env.ctx(manager))).row.no;
  return out;
}
