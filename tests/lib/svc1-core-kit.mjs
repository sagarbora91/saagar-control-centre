// tests/lib/svc1-core-kit.mjs
// Helpers for the Service Stores core facade tests. Invented data only.
// The kit posts documents straight into the store with the real FIFO engine, in the record shapes of plan 2.6/2.7,
// so the core's reads can be tested without the documents layer. The kit uses its OWN store object on the same
// adapter (like a second screen); the core under test has to notice the writes.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
export const WWW = path.resolve(here, '..', '..', 'www');
export const Store = require('../../www/service-stores-store.js');
export const Fifo = require('../../www/service-stores-fifo.js');
export const Masters = require('../../www/service-stores-masters.js');
export const CoreLib = require('../../www/service-stores-core.js');
export const DOCS_PATH = path.join(WWW, 'service-stores-docs.js');
export const docsExists = () => fs.existsSync(DOCS_PATH);
export const loadRealDocs = () => (docsExists() ? require('../../www/service-stores-docs.js') : null);

export const OWNER = Object.freeze({ ok: true, isOwner: true, isManager: true, role: 'Owner', tier: 'owner', actorName: 'Test Owner' });
export const MANAGER = Object.freeze({ ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Test Manager' });
export const STAFF = Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Technician', tier: 'staff', actorName: 'Test Tech' });
export const BROKEN = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });

export const actorOf = (s) => ({ t: s.tier, r: s.role, m: s.actorName });

export function makeClock(startIso = '2026-11-13T05:30:00.000Z') {
  let cur = new Date(startIso).getTime();
  const c = {
    now: () => new Date(cur),
    set(iso) { cur = new Date(iso).getTime(); return c; },
    advance(ms) { cur += ms; return c; },
    get iso() { return new Date(cur).toISOString(); },
    get ms() { return cur; }
  };
  return c;
}

export function makeAdapter() {
  const data = new Map();
  const a = {
    data,
    auth: true,
    setCount: 0,
    setLog: [],
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); a.setCount += 1; a.setLog.push(k); },
    keys() { return Array.from(data.keys()); },
    authoritative() { return a.auth; },
    svcsKeys() { return Array.from(data.keys()).filter((k) => /^saagar_svcs_/.test(k)).sort(); }
  };
  return a;
}

// A stand-in for the documents layer: just enough for the facade tests. It records every call it gets.
export function makeFakeDocsLib(opts = {}) {
  const lib = {
    version: 1,
    calls: [],
    results: Object.assign({}, opts.results || {}),
    config: Object.assign({ adjustLimitPaise: 0, storeRoles: [], warnings: [] }, opts.config || {}),
    movementsAnswer: opts.hasMovements === undefined ? false : opts.hasMovements,
    referencedAnswer: opts.isReferenced === undefined ? false : opts.isReferenced,
    openCalls: 0,
    create(deps) {
      const api = {
        open() {
          lib.openCalls += 1;
          const r = deps.store.open({ replay: () => [] });
          return r;
        },
        can(action, session) {
          lib.calls.push({ method: 'can', args: [action, session] });
          if (!session || session.ok !== true) return { ok: false, needsPin: false, code: 'SESSION_REQUIRED' };
          if (action === 'OPENING_APPROVE') return session.tier === 'owner' ? { ok: true, needsPin: true } : { ok: false, needsPin: false, code: 'NOT_ALLOWED' };
          return { ok: true, needsPin: false };
        },
        config() { return Object.assign({}, lib.config); },
        hasMovements() { return lib.movementsAnswer; },
        isReferenced() { return lib.referencedAnswer; }
      };
      const names = ['proposeOpening', 'approveOpening', 'rejectOpening', 'withdrawOpening', 'receiveGoods', 'reverseDoc',
        'issueToJob', 'returnFromJob', 'counterSale', 'proposeAdjustment', 'approveAdjustment', 'rejectAdjustment',
        'withdrawAdjustment', 'registerOldPart', 'moveOldPart', 'signOffScrap', 'setConfig'];
      for (const n of names) {
        api[n] = (...args) => {
          lib.calls.push({ method: n, args });
          return Object.prototype.hasOwnProperty.call(lib.results, n) ? lib.results[n] : { ok: true, doc: { no: 'X' } };
        };
      }
      return api;
    }
  };
  return lib;
}

export function openCase(id) {
  return { id, status: 'open', invoiceNo: '', paymentStatus: '', stub: false };
}

// One test environment: adapter, clock, the core under test and a kit store on the same adapter.
export function makeEnv(opts = {}) {
  const clock = makeClock(opts.start);
  const adapter = makeAdapter();
  const cases = { get: opts.casesGet || ((id) => (typeof id === 'string' && id.indexOf('JOB-') === 0 ? openCase(id) : null)) };
  const docsLib = opts.docsLib || makeFakeDocsLib(opts.fake || {});
  const created = CoreLib.create({
    adapter, now: clock.now, cases, libs: { docs: docsLib }, storeOptions: Object.assign({ watermark: false }, opts.storeOptions || {})
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const kitStore = Store.createStore(adapter, { now: clock.now, watermark: false });
  assert.equal(kitStore.ok, true, JSON.stringify(kitStore));
  const env = { clock, adapter, cases, docsLib, core: created.core, kit: { store: kitStore.store, clock } };
  env.ctx = (session, extra) => Object.assign({ session }, extra || {});
  env.owner = (extra) => env.ctx(OWNER, extra);
  env.manager = (extra) => env.ctx(MANAGER, extra);
  env.staff = (extra) => env.ctx(STAFF, extra);
  return env;
}

const OWNER_CTX = { session: OWNER, reauth: true };

function kitMovements(kit) {
  kit.store.open();
  const r = kit.store.read('ledger');
  assert.equal(r.ok, true, JSON.stringify(r));
  const out = [];
  for (const rec of r.records) for (const mv of (rec.b.mv || [])) out.push(mv);
  return out;
}
function kitState(kit) {
  const mvs = kitMovements(kit);
  const rp = Fifo.replay(mvs);
  assert.equal(rp.ok, true, JSON.stringify(rp));
  return { state: rp.state, movements: mvs };
}

// plans: [{fn, input}] ; lines: the record lines (same length). Returns the append result.
function kitPost(kit, spec) {
  const st = kitState(kit);
  const t = kit.store.nextAt('ledger');
  assert.equal(t.ok, true, JSON.stringify(t));
  const at = t.at;
  let no = '';
  if (spec.series) {
    const n = kit.store.nextNumber(spec.series, at);
    assert.equal(n.ok, true, JSON.stringify(n));
    no = n.no;
  }
  const clone = Fifo.cloneState(st.state);
  const mv = [];
  const lines = spec.lines(no, st);
  const plans = spec.plans(no, at, st, lines);
  plans.forEach((p, i) => {
    const res = Fifo[p.fn](clone, p.input, p.ctx || OWNER_CTX);
    assert.equal(res.ok, true, p.fn + ' ' + JSON.stringify(res));
    const ap = Fifo.applyMovement(clone, res.movement);
    assert.equal(ap.ok, true, JSON.stringify(ap));
    mv.push(res.movement);
  });
  const b = Object.assign(spec.series ? { no } : {}, { docDate: Fifo.istDate(at), note: spec.note || '' }, spec.extra ? spec.extra(no, mv) : {}, { lines: spec.finishLines ? spec.finishLines(lines, mv) : lines, mv });
  const item = { k: spec.k, b };
  if (spec.series) item.series = spec.series;
  if (spec.ref) item.r = spec.ref;
  const head = kit.store.head('ledger');
  const res = kit.store.append('ledger', [item], { expectRev: head.rev, actor: actorOf(spec.actor || OWNER), at });
  assert.equal(res.ok, true, JSON.stringify(res));
  return { no, record: res.records[0], movements: mv, at };
}

export function kitPropose(kit, kind, lines, extra = {}) {
  const head = kit.store.head('docs');
  const body = { lines, note: extra.note || 'proposal' };
  if (kind === 'ADJ') body.valuePaise = extra.valuePaise || 0;
  const res = kit.store.append('docs', [{ k: kind + '_PROPOSE', b: body }], { expectRev: head.rev, actor: actorOf(extra.actor || MANAGER) });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.records[0].id;
}
export function kitDecide(kit, kindDecision, proposalId, reason, actor = MANAGER) {
  const head = kit.store.head('docs');
  const body = { proposalId };
  if (reason) body.reason = reason;
  const res = kit.store.append('docs', [{ k: kindDecision, b: body }], { expectRev: head.rev, actor: actorOf(actor) });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.records[0].id;
}

export function kitOpening(kit, lines, proposalId, actor = OWNER) {
  return kitPost(kit, {
    k: 'OPN', series: 'OPN', actor,
    lines: () => lines.map((l) => ({ partCode: l.partCode, qty: l.qty, unitCostPaise: l.unitCostPaise })),
    plans: (no, at) => lines.map((l, i) => ({ fn: 'planOpening', input: { partCode: l.partCode, qty: l.qty, unitCostPaise: l.unitCostPaise, at, ref: { grnNo: no, lineNo: i + 1 } } })),
    extra: () => ({ proposalId, approvedBy: { name: actor.actorName, role: actor.role }, pinAt: kit.clock.ms })
  });
}
export function kitReceipt(kit, supplierInvoiceNo, lines, actor = MANAGER) {
  return kitPost(kit, {
    k: 'GRN', series: 'GRN', actor,
    lines: () => lines.map((l) => ({
      partCode: l.partCode, qtyInvoiced: l.qtyInvoiced === undefined ? null : l.qtyInvoiced, qtyReceived: l.qtyReceived,
      qtyShort: l.qtyInvoiced && l.qtyInvoiced > l.qtyReceived ? l.qtyInvoiced - l.qtyReceived : 0, unitCostPaise: l.unitCostPaise
    })),
    plans: (no, at) => lines.map((l, i) => ({ fn: 'planReceipt', input: { partCode: l.partCode, qty: l.qtyReceived, unitCostPaise: l.unitCostPaise, at, ref: { grnNo: no, lineNo: i + 1 } }, ctx: { session: actor, reauth: false } })),
    extra: () => ({ supplierName: 'Demo Supplier', supplierInvoiceNo, supplierInvoiceDate: '2026-10-30' })
  });
}
export function kitIssue(kit, jobId, lines, actor = MANAGER) {
  return kitPost(kit, {
    k: 'ISS', series: 'ISS', actor,
    lines: () => lines.map((l) => ({ partCode: l.partCode, qty: l.qty, override: null })),
    plans: (no, at) => lines.map((l, i) => ({ fn: 'planIssueToJob', input: { partCode: l.partCode, qty: l.qty, at, ref: { jobId, grnNo: no, lineNo: i + 1 } }, ctx: { session: actor, reauth: false } })),
    extra: () => ({ jobId, billing: 'CHARGEABLE', stub: false })
  });
}
export function kitReturn(kit, jobId, lines, actor = MANAGER) {
  return kitPost(kit, {
    k: 'RET', series: 'RET', actor,
    lines: (no, st) => lines.map((l) => {
      const iss = st.movements.find((m) => m.id === l.issueMovementId);
      assert.ok(iss, 'issue movement ' + l.issueMovementId);
      return { partCode: iss.partCode, qty: l.qty, issueMovementId: l.issueMovementId, issueDocNo: iss.ref.grnNo, issueLineNo: iss.ref.lineNo, returnReason: l.returnReason || 'UNUSED' };
    }),
    plans: (no, at) => lines.map((l, i) => ({ fn: 'planReturnFromJob', input: { issueId: l.issueMovementId, qty: l.qty, at, ref: { jobId, grnNo: no, lineNo: i + 1 } }, ctx: { session: actor, reauth: false } })),
    extra: () => ({ jobId })
  });
}
export function kitCounter(kit, lines, payMode = 'CASH', actor = MANAGER) {
  return kitPost(kit, {
    k: 'CSL', series: 'CSL', actor,
    lines: () => lines.map((l) => ({ partCode: l.partCode, qty: l.qty, unitPricePaise: l.unitPricePaise, amountPaise: l.qty * l.unitPricePaise })),
    plans: (no, at) => lines.map((l, i) => ({ fn: 'planCounterSale', input: { partCode: l.partCode, qty: l.qty, at, ref: { saleRef: no, grnNo: no, lineNo: i + 1 } }, ctx: { session: actor, reauth: false } })),
    extra: () => ({ payMode, ccptInvoiceNo: '', amountPaise: lines.reduce((s, l) => s + l.qty * l.unitPricePaise, 0), moneyPosted: false })
  });
}
const REASON_FIFO = { FOUND: 'found', COUNT_CORRECTION: 'count_correction', WRONG_RECEIPT: 'wrong_receipt', DAMAGED: 'damaged', LOST: 'lost', WRITE_OFF: 'write_off' };
export function kitAdjust(kit, proposalId, lines, actor = OWNER) {
  const writeoff = lines.some((l) => ['DAMAGED', 'LOST', 'WRITE_OFF'].includes(l.reason));
  return kitPost(kit, {
    k: 'ADJ', series: 'ADJ', actor,
    lines: () => lines.map((l) => ({ partCode: l.partCode, qtyDelta: l.qtyDelta, reason: l.reason, unitCostPaise: l.unitCostPaise === undefined ? null : l.unitCostPaise, valuePaise: 0 })),
    plans: (no, at) => lines.map((l, i) => {
      const input = { direction: l.qtyDelta > 0 ? 'up' : 'down', partCode: l.partCode, qty: Math.abs(l.qtyDelta), reason: REASON_FIFO[l.reason], at, proposedBy: 'Test Manager', ref: { grnNo: no, lineNo: i + 1 } };
      if (l.unitCostPaise !== undefined && l.unitCostPaise !== null) input.unitCostPaise = l.unitCostPaise;
      return { fn: 'planAdjustment', input };
    }),
    finishLines: (ls, mv) => ls.map((l, i) => Object.assign({}, l, { valuePaise: Math.abs(mv[i].valuePaise) })),
    extra: (no, mv) => ({
      proposalId, reasonClass: writeoff ? 'WRITEOFF' : 'CORRECTION',
      totalAbsPaise: mv.reduce((s, m) => s + Math.abs(m.valuePaise), 0),
      approval: { by: actor.actorName, role: actor.role, pinAt: kit.clock.ms, limitPaise: 0 }
    })
  });
}
export function kitReverse(kit, docNo, reason) {
  const st0 = kitState(kit);
  const target = st0.movements.filter((m) => m.ref && m.ref.grnNo === docNo && m.type !== 'reversal');
  assert.ok(target.length > 0, 'movements of ' + docNo);
  return kitPost(kit, {
    k: 'REV', series: null, actor: OWNER, note: '',
    lines: () => target.map((m) => ({ movementId: m.id })),
    plans: (no, at) => target.map((m) => ({ fn: 'planReversal', input: { reverses: m.id, at, note: reason } })),
    extra: () => ({ reverses: docNo, reason, pinAt: kit.clock.ms })
  });
}

function kitDefective(kit, k, series, body, actor) {
  const at = kit.store.nextAt('defective');
  assert.equal(at.ok, true, JSON.stringify(at));
  const item = { k, b: body };
  if (series) {
    const n = kit.store.nextNumber(series, at.at);
    assert.equal(n.ok, true, JSON.stringify(n));
    item.series = series;
    item.b = Object.assign({ no: n.no }, body);
  }
  const head = kit.store.head('defective');
  const res = kit.store.append('defective', [item], { expectRev: head.rev, actor: actorOf(actor), at: at.at });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.records[0];
}
export function kitOldRegister(kit, fields, actor = MANAGER) {
  const body = Object.assign({ jobId: '', partCode: '', partText: '', qty: 1, serialRef: '', state: 'HELD_FOR_CLAIM', claimRef: '', note: '' }, fields);
  const rec = kitDefective(kit, 'OLD_REGISTER', 'OLD', body, actor);
  return rec.b.no;
}
export function kitOldMove(kit, oldNo, from, to, extra = {}, actor = MANAGER) {
  return kitDefective(kit, 'OLD_MOVE', null, Object.assign({ oldNo, from, to, note: '', claimRef: '' }, extra), actor);
}
export function kitScrapSignoff(kit, month, oldNos, actor = OWNER) {
  return kitDefective(kit, 'SCRAP_SIGNOFF', 'SCR', { month, oldNos, note: 'month sign off', pinAt: kit.clock.ms }, actor).b.no;
}

// The standard small scenario (see the comments in the facade tests for the hand figures).
export function standardParts(env, ctxMgr) {
  const mk = (code, name, group, level, qty, extra = {}) => env.core.savePart(Object.assign({
    code, name, group, unit: 'pc', sellPricePaise: 5000, priceIncludesTax: true, reorderLevel: level, reorderQty: qty, bin: 'A1'
  }, extra), ctxMgr);
  const r = [
    mk('P-ONE', 'Test battery', 'Battery', 5, 6, { flags: { battery: true, counterSaleable: true } }),
    mk('P-TWO', 'Test strap', 'Strap', 0, 0, { flags: { strap: true, counterSaleable: true } }),
    mk('P-THREE', 'Test glass', 'Glass', 3, 4, { flags: { glass: true } })
  ];
  for (const x of r) assert.equal(x.ok, true, JSON.stringify(x));
}

export function buildStandard(env) {
  const { clock, kit } = env;
  standardParts(env, env.manager());
  clock.set('2026-11-01T06:00:00.000Z');
  const op = kitPropose(kit, 'OPN', [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }, { partCode: 'P-TWO', qty: 4, unitCostPaise: 500 }]);
  const opn = kitOpening(kit, [{ partCode: 'P-ONE', qty: 10, unitCostPaise: 1000 }, { partCode: 'P-TWO', qty: 4, unitCostPaise: 500 }], op);
  clock.set('2026-11-03T06:00:00.000Z');
  const grn = kitReceipt(kit, 'INV-1', [{ partCode: 'P-ONE', qtyInvoiced: 8, qtyReceived: 5, unitCostPaise: 1200 }, { partCode: 'P-THREE', qtyReceived: 3, unitCostPaise: 700 }]);
  clock.set('2026-11-05T06:00:00.000Z');
  const iss = kitIssue(kit, 'JOB-1', [{ partCode: 'P-ONE', qty: 12 }]);
  clock.set('2026-11-06T06:00:00.000Z');
  const ret = kitReturn(kit, 'JOB-1', [{ issueMovementId: iss.movements[0].id, qty: 1 }]);
  clock.set('2026-11-07T06:00:00.000Z');
  const csl = kitCounter(kit, [{ partCode: 'P-ONE', qty: 1, unitPricePaise: 2500 }, { partCode: 'P-TWO', qty: 1, unitPricePaise: 800 }]);
  clock.set('2026-11-08T06:00:00.000Z');
  const adjP = kitPropose(kit, 'ADJ', [{ partCode: 'P-ONE', qtyDelta: -1, reason: 'DAMAGED', unitCostPaise: null, valuePaise: 1200 }], { valuePaise: 1200 });
  const adj = kitAdjust(kit, adjP, [{ partCode: 'P-ONE', qtyDelta: -1, reason: 'DAMAGED' }]);
  clock.set('2026-11-09T06:00:00.000Z');
  const adj2 = kitPropose(kit, 'ADJ', [{ partCode: 'P-TWO', qtyDelta: -1, reason: 'COUNT_CORRECTION', unitCostPaise: null, valuePaise: 500 }], { valuePaise: 500 });
  const adj3 = kitPropose(kit, 'ADJ', [{ partCode: 'P-THREE', qtyDelta: 1, reason: 'FOUND', unitCostPaise: 700, valuePaise: 700 }], { valuePaise: 700 });
  kitDecide(kit, 'ADJ_REJECT', adj3, 'not found on recount');
  clock.set('2026-11-10T06:00:00.000Z');
  const rev = kitReverse(kit, csl.no, 'sale was cancelled');
  clock.set('2026-11-13T05:30:00.000Z');
  return { opn, grn, iss, ret, csl, adj, adj2, adj3, adjP, rev, op };
}
