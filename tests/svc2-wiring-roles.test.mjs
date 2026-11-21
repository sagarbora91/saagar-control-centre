// Stage B2 wiring audit (2026-11-19), check 3: the single role table (plan 2.11) holds through every route. For each action and each role,
// `can` is asked, then the action is really attempted through the facade on the REAL stack (Phase 1 core, calc, docs, money, migration).
// The answer and the attempt must agree: allowed = the write succeeds (the Owner with a fresh PIN where the table says P); refused = the same
// role code, and nothing written. Roles: Owner, Store Manager, Cashier (billing role), Technician (estimate role and store-class), Trainee.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realEnv, good, ref, OWNER, MANAGER, DESK, TECH, TRAINEE } from './lib/svc2-core-kit.mjs';

const ROLES = { OWNER, MANAGER, DESK, TECH, TRAINEE };
const ROLE_CODES = ['NOT_ALLOWED', 'DISCOUNT_NOT_ALLOWED', 'ABOVE_MANAGER_LIMIT', 'SESSION_REQUIRED'];
const plain = (v) => JSON.parse(JSON.stringify(v));

function env() {
  const e = realEnv();
  good(e.stores.setConfig({ storeRoles: ['Technician'] }, { session: OWNER, stepUp: { ok: true, at: e.clock.now().getTime() }, clientRef: ref('cfg') }));
  e.as(OWNER);
  // the Owner ticks Cashier as billing staff (the default is Owner and Store Manager only); Technician stays an estimate role
  good(e.core.setConfig({ billingRoles: ['Cashier'], estimateRoles: ['Technician', 'Assistant Technician'] }, e.pinCtx({ clientRef: ref('bcfg') })));
  return e;
}
const own = (e, fn) => { const prev = e.cur.session; e.as(OWNER); try { return fn(); } finally { e.as(prev); } };
const ctx = (e) => e.ctx({ clientRef: ref('w') });
const pin = (e) => e.pinCtx({ clientRef: ref('w') });
const L1 = { kind: 'LABOUR', code: 'L1', qty: 1 };
function estimate(e, id) { e.cases.add(id); good(e.core.saveEstimate({ jobId: id, lines: [L1] }, pin(e))); }
function approved(e, id) { estimate(e, id); good(e.core.recordApproval({ jobId: id, version: 1, method: 'CALL', takenByName: 'Test Taker' }, pin(e))); }
function billed(e, id, over = {}) { approved(e, id); return good(e.core.issueBill(Object.assign({ jobId: id, labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, over), pin(e))).invoice; }
function advance(e, id, amt = 1000) { e.cases.add(id); return good(e.core.takeReceipt({ jobId: id, kind: 'advance', amountPaise: amt, payMode: 'Cash' }, pin(e))).receipt; }

// action -> [prepare (as Owner, returns data), attempt (as the role)]
const ACTIONS = {
  EST_SAVE: [(e) => { e.cases.add('J1'); }, (e) => e.core.saveEstimate({ jobId: 'J1', lines: [L1] }, pin(e))],
  EST_OTHER_LINE: [(e) => { e.cases.add('J1'); }, (e) => e.core.saveEstimate({ jobId: 'J1', lines: [{ kind: 'OTHER', name: 'Test fee', hsnSac: '9987', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 1001, qty: 1 }] }, pin(e))],
  EST_APPROVE: [(e) => estimate(e, 'J1'), (e) => e.core.recordApproval({ jobId: 'J1', version: 1, method: 'CALL', takenByName: 'Test Taker' }, pin(e))],
  RECEIPT_TAKE: [(e) => { e.cases.add('J1'); }, (e) => e.core.takeReceipt({ jobId: 'J1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, pin(e))],
  INV_ISSUE: [(e) => approved(e, 'J1'), (e) => e.core.issueBill({ jobId: 'J1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, pin(e))],
  DISCOUNT: [(e) => approved(e, 'J1'), (e) => e.core.issueBill({ jobId: 'J1', labour: [{ code: 'L1', qty: 1, discountPaise: 100 }], discountReason: 'loyal customer' }, pin(e))],
  INV_ISSUE_NOT_IN_CCPT: [(e) => approved(e, 'J1'), (e) => e.core.issueBill({ jobId: 'J1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'NOT_IN_CCPT', notInCcptReason: 'customer asked for a Saagar invoice' }, pin(e))],
  CCPT_LINK: [(e) => billed(e, 'J1'), (e, b) => e.core.addCcptNumber({ invoiceNo: b.no, ccptInvoiceNo: 'CC-1', reason: 'typed from CCPT' }, pin(e))],
  CCPT_CHANGE: [(e) => { const b = billed(e, 'J1'); good(e.core.addCcptNumber({ invoiceNo: b.no, ccptInvoiceNo: 'CC-1', reason: 'typed from CCPT' }, pin(e))); return b; },
    (e, b) => e.core.addCcptNumber({ invoiceNo: b.no, ccptInvoiceNo: 'CC-2', reason: 'wrong number typed' }, pin(e))],
  INV_CANCEL: [(e) => billed(e, 'J1'), (e, b) => e.core.cancelBill({ invoiceNo: b.no, reason: 'wrong job billed' }, pin(e))],
  CN_ISSUE: [(e) => { const b = billed(e, 'J1'); good(e.core.takeReceipt({ jobId: 'J1', kind: 'balance', amountPaise: b.totalPaise, payMode: 'Cash' }, pin(e))); return b; },
    (e, b) => e.core.issueCreditNote({ invoiceNo: b.no, mode: 'FULL', reasonClass: 'OTHER', reason: 'work not done in the end' }, pin(e))],
  REFUND: [(e) => advance(e, 'J1'), (e) => e.core.refund({ jobId: 'J1', amountPaise: 1000, payMode: 'Cash', reason: 'job cancelled by the customer' }, pin(e))],
  REVERSE_RECEIPT: [(e) => advance(e, 'J1'), (e, r) => e.core.reverseReceipt({ no: r.no, reason: 'typed the wrong amount' }, pin(e))],
  REVERSE_REFUND: [(e) => { advance(e, 'J1'); return good(e.core.refund({ jobId: 'J1', amountPaise: 1000, payMode: 'Cash', reason: 'job cancelled by the customer' }, pin(e))).refund; },
    (e, r) => e.core.reverseReceipt({ no: r.no, reason: 'refund given by mistake' }, pin(e))],
  NCS_ISSUE: [(e) => { e.cases.add('J1', { paymentStatus: 'no_charge_warranty' }); }, (e) => e.core.issueNoChargeSheet({ jobId: 'J1', labour: [{ code: 'L1', qty: 1 }] }, pin(e))],
  NCS_CANCEL: [(e) => { e.cases.add('J1', { paymentStatus: 'no_charge_warranty' }); good(e.core.issueNoChargeSheet({ jobId: 'J1', labour: [{ code: 'L1', qty: 1 }] }, pin(e))); return good(e.core.getJob('J1', ctx(e))).job.noCharge; },
    (e, nc) => e.core.cancelNoChargeSheet({ sheetId: nc && nc.id, reason: 'made by mistake' }, pin(e))],
  JOB_VOID: [(e) => { e.cases.add('J1'); }, (e) => e.core.voidJob({ jobId: 'J1', reason: 'opened by mistake' }, pin(e))],
  BCFG_SET: [() => null, (e) => e.core.setConfig({ discountLimitPaise: 100 }, pin(e))],
  DECIDE_LEGACY: [(e) => { e.cases.add('J1', { typedAdvancePaise: 50000 }); }, (e) => e.core.decideLegacyAdvance({ jobId: 'J1', decision: 'IN_BOOK', amountPaise: 50000 }, pin(e))],
  IMPORT_LEGACY: [(e) => good(e.core.planMigration(ctx(e))), (e, p) => e.core.runMigration(p, pin(e))],
  COUNTER_RECEIPT: [(e) => good(e.stores.counterSale({ lines: [{ partCode: 'P2', qty: 1, unitPricePaise: 5900 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 5900, note: '' }, { session: MANAGER, clientRef: ref('cs') })).doc,
    (e, d) => e.core.takeCounterReceipt({ saleNo: d.no, amountPaise: 5900, payMode: 'Cash' }, pin(e))],
  VIEW_SUMMARY: [() => null, (e) => e.core.daySummary('2026-11-18', ctx(e))],
  VIEW_AMOUNTS: [(e) => billed(e, 'J1'), (e, b) => e.core.getBill(b.no, ctx(e))]
};

test('W1 for every action of the role table and every role, can() and a real attempt through the facade agree; a refusal writes nothing', () => {
  const rows = [];
  const bad = [];
  const notes = [];
  for (const [action, [prep, attempt]] of Object.entries(ACTIONS)) {
    let line = action.padEnd(22);
    for (const [rname, s] of Object.entries(ROLES)) {
      const e = env();
      let data;
      try { data = own(e, () => prep(e)); } catch (err) { bad.push(action + ' prepare failed: ' + String(err.message).slice(0, 200)); line += ' ?'; continue; }
      const can = plain(e.core.can(action, s));
      e.as(s);
      const before = e.text();
      let res;
      try { res = plain(attempt(e, data)); } catch (err) { res = { ok: false, code: 'THREW ' + err.message }; }
      const roleRefused = res.ok === false && ROLE_CODES.includes(res.code);
      if (can.ok === true) {
        if (res.ok !== true) bad.push(`${action} ${rname}: can() allows, the attempt gives ${res.code}`);
        line += can.needsPin ? ' P' : ' Y';
      } else {
        if (!roleRefused) bad.push(`${action} ${rname}: can() refuses (${can.code}), the attempt gives ${res.ok ? 'ok' : res.code}`);
        else if (res.code !== can.code) notes.push(`${action} ${rname}: can() says ${can.code}, the attempt says ${res.code} (both a role refusal)`);
        if (e.text() !== before) bad.push(`${action} ${rname}: a refusal wrote something`);
        line += ' N';
      }
    }
    rows.push(line);
  }
  console.log(['action                 OWN MGR DSK TEC TRN'].concat(rows).concat(notes).join('\n'));
  assert.deepEqual(bad, []);
});
