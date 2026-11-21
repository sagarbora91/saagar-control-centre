// Service wave 2, billing core facade: the role authority `can`, past-view refusal, broken session, role lists.
// The matrix is typed by hand from plan 2.11 (Owner, Store Manager, billing staff = Cashier, estimate staff = Technician,
// store-class = Technician, plain staff = Trainee). Y = yes, P = yes with the Owner PIN, N = refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build, OWNER, MANAGER, DESK, TECH, TRAINEE, NONE, good, refused, ref } from './lib/svc2-core-kit.mjs';

const ORDER = ['OWNER', 'MANAGER', 'DESK', 'TECH', 'TRAINEE'];
const S = { OWNER, MANAGER, DESK, TECH, TRAINEE };
function env() {
  const e = build({ docs: 'fake', migrate: null });
  // store-class staff = Technician (Phase 1 setting, the Owner sets it with a PIN)
  good(e.stores.setConfig({ storeRoles: ['Technician'] }, { session: OWNER, stepUp: { ok: true, at: e.clock.now().getTime() }, clientRef: 'roles-cfg-1' }));
  return e;
}
const MATRIX = {
  VIEW_STATUS: 'YYYYY',
  VIEW_AMOUNTS: 'YYYNN',
  VIEW_SUMMARY: 'YYNNN',
  VIEW_COST: 'YYNNN',
  EST_SAVE: 'YYYYN',
  EST_OTHER_LINE: 'YYNNN',
  EST_APPROVE: 'YYYYN',
  INV_APPROVAL_OVERRIDE: 'PNNNN',
  RECEIPT_TAKE: 'YYYNN',
  COUNTER_RECEIPT: 'YYYYN',
  INV_ISSUE: 'YYYNN',
  DISCOUNT_ABOVE: 'PNNNN',
  INV_ISSUE_NOT_IN_CCPT: 'PNNNN',
  CCPT_LINK: 'YYYNN',
  CCPT_CHANGE: 'PNNNN',
  INV_CANCEL: 'PNNNN',
  CN_ISSUE: 'PNNNN',
  CN_STOCK_RETURN: 'YYNYN',
  REFUND: 'PNNNN',
  REVERSE_RECEIPT: 'YYNNN',
  REVERSE_REFUND: 'PNNNN',
  NCS_ISSUE: 'YYNNN',
  NCS_CANCEL: 'PNNNN',
  JOB_VOID: 'PNNNN',
  DECIDE_LEGACY: 'PNNNN',
  IMPORT_LEGACY: 'PNNNN',
  BCFG_SET: 'PNNNN'
};

test('the role table of plan 2.11, every action for every kind of session', () => {
  const e = env();
  for (const [action, row] of Object.entries(MATRIX)) {
    ORDER.forEach((who, i) => {
      const r = e.core.can(action, S[who]);
      const want = row[i];
      assert.equal(r.ok, want !== 'N', action + ' ' + who + ' ' + JSON.stringify(r));
      assert.equal(r.needsPin, want === 'P', action + ' ' + who + ' PIN');
      if (want === 'N') assert.equal(r.code, 'NOT_ALLOWED', action + ' ' + who);
    });
  }
});

test('a broken session is refused every action, reads included', () => {
  const e = env();
  for (const action of Object.keys(MATRIX)) {
    for (const bad of [NONE, null, undefined, {}, { ok: true }, { ok: true, tier: 'owner' }, { ok: true, tier: 'manager', isOwner: true, isManager: true }]) {
      const r = e.core.can(action, bad === undefined ? NONE : bad);
      assert.equal(r.ok, false, action + JSON.stringify(bad));
      assert.equal(r.code, 'SESSION_REQUIRED');
    }
  }
});

test('the Owner flag must agree with the tier: a Manager who claims isOwner is no one', () => {
  const e = env();
  const fake = { ok: true, tier: 'manager', role: 'Store Manager', actorName: 'X', isOwner: true, isManager: true };
  assert.equal(e.core.can('REFUND', fake).ok, false);
  const fake2 = { ok: true, tier: 'owner', role: 'Owner', actorName: 'X', isOwner: false, isManager: true };
  assert.equal(e.core.can('REFUND', fake2).ok, false);
  // inherited flags are never trusted
  const proto = Object.create({ ok: true, tier: 'owner', isOwner: true, role: 'Owner' });
  assert.equal(e.core.can('VIEW_STATUS', proto).ok, false);
});

test('discount: the limit decides. Limit 0: Owner needs the PIN, Manager is refused. Limit above 0: both pass, no PIN', () => {
  const e = env();
  let r = e.core.can('DISCOUNT', OWNER);
  assert.deepEqual([r.ok, r.needsPin], [true, true]);
  r = e.core.can('DISCOUNT', MANAGER);
  assert.deepEqual([r.ok, r.code], [false, 'ABOVE_MANAGER_LIMIT']);
  r = e.core.can('DISCOUNT', DESK);
  assert.deepEqual([r.ok, r.code], [false, 'DISCOUNT_NOT_ALLOWED']);
  good(e.core.setConfig({ discountLimitPaise: 5000, reason: 'owner sets the limit' }, e.pinCtx({ clientRef: ref() })));
  r = e.core.can('DISCOUNT', OWNER);
  assert.deepEqual([r.ok, r.needsPin], [true, false]);
  r = e.core.can('DISCOUNT', MANAGER);
  assert.deepEqual([r.ok, r.needsPin], [true, false]);
  assert.equal(e.core.can('DISCOUNT', TECH).ok, false);
});

test('role lists are read fresh on every call: a role added by the Owner works at once, one removed stops at once', () => {
  const e = env();
  assert.equal(e.core.can('RECEIPT_TAKE', TRAINEE).ok, false);
  good(e.core.setConfig({ billingRoles: ['Cashier', 'Trainee'], reason: 'ticking Trainee' }, e.pinCtx({ clientRef: ref() })));
  assert.equal(e.core.can('RECEIPT_TAKE', TRAINEE).ok, true);
  good(e.core.setConfig({ billingRoles: [], reason: 'nobody at the desk' }, e.pinCtx({ clientRef: ref() })));
  assert.equal(e.core.can('RECEIPT_TAKE', TRAINEE).ok, false);
  assert.equal(e.core.can('RECEIPT_TAKE', DESK).ok, false);
});

test('a staff session whose role is named "Store Manager" is never billing staff, even when listed', () => {
  const e = env();
  e.docsLib.state.cfg.billingRoles = ['Store Manager', 'Cashier'];
  const staffMgr = { ok: true, tier: 'staff', role: 'Store Manager', actorName: 'S', isOwner: false, isManager: false };
  const r = e.core.can('RECEIPT_TAKE', staffMgr);
  assert.equal(r.ok, false);
});

test('when the role lists cannot be read the narrow answer is given (staff refused, Owner and Manager unaffected)', () => {
  const e = env();
  e.docsLib.state.throwOn.add('config');
  assert.equal(e.core.can('RECEIPT_TAKE', DESK).ok, false);
  assert.equal(e.core.can('RECEIPT_TAKE', MANAGER).ok, true);
  assert.equal(e.core.can('REFUND', OWNER).needsPin, true);
});

test('aliases of older action names map to the same rule; an unknown action is refused', () => {
  const e = env();
  assert.equal(e.core.can('CCPT_ADD', DESK).ok, true);
  assert.equal(e.core.can('CN_STOCK_LINK', TECH).ok, true);
  assert.equal(e.core.can('VIEW', DESK).ok, true);
  assert.equal(e.core.can('VIEW', TECH).ok, false);
  const r = e.core.can('NO_SUCH_ACTION', OWNER);
  assert.deepEqual([r.ok, r.code], [false, 'BCORE_ARGS_INVALID']);
  assert.equal(e.core.can('', OWNER).code, 'BCORE_ARGS_INVALID');
  assert.equal(e.core.can(5, OWNER).code, 'BCORE_ARGS_INVALID');
});

test('can with no session argument uses the provider', () => {
  const e = env();
  e.as(TECH);
  assert.equal(e.core.can('EST_SAVE').ok, true);
  assert.equal(e.core.can('RECEIPT_TAKE').ok, false);
  e.as(NONE);
  assert.equal(e.core.can('VIEW_STATUS').code, 'SESSION_REQUIRED');
});

test('past view: every write is refused with PAST_VIEW and storage is unchanged; reads still work', () => {
  const e = env();
  e.cases.add('WS-1');
  const before = e.text();
  const writes = [
    () => e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.pinCtx({ pastView: true, clientRef: ref() })),
    () => e.core.refund({ jobId: 'WS-1', amountPaise: 1000, payMode: 'Cash', reason: 'long reason' }, e.pinCtx({ pastView: true, clientRef: ref() })),
    () => e.core.saveEstimate({ jobId: 'WS-1', lines: [] }, e.pinCtx({ pastView: true })),
    () => e.core.recordApproval({ jobId: 'WS-1' }, e.pinCtx({ pastView: true })),
    () => e.core.issueBill({ jobId: 'WS-1' }, e.pinCtx({ pastView: true })),
    () => e.core.addCcptNumber({ invoiceNo: 'x' }, e.pinCtx({ pastView: true })),
    () => e.core.cancelBill({ invoiceNo: 'x', reason: 'a reason' }, e.pinCtx({ pastView: true })),
    () => e.core.issueCreditNote({ invoiceNo: 'x' }, e.pinCtx({ pastView: true })),
    () => e.core.reverseReceipt({ no: 'SAR/26-27/0001', reason: 'a reason' }, e.pinCtx({ pastView: true })),
    () => e.core.issueNoChargeSheet({ jobId: 'WS-1' }, e.pinCtx({ pastView: true })),
    () => e.core.cancelNoChargeSheet({ sheetId: 'WS-1', reason: 'a reason' }, e.pinCtx({ pastView: true })),
    () => e.core.voidJob({ jobId: 'WS-1', reason: 'a reason' }, e.pinCtx({ pastView: true })),
    () => e.core.decideLegacyAdvance({ jobId: 'WS-1', decision: 'IN_BOOK' }, e.pinCtx({ pastView: true })),
    () => e.core.setConfig({ discountLimitPaise: 1 }, e.pinCtx({ pastView: true })),
    () => e.core.takeCounterReceipt({ saleNo: 'CSL/26-27/0001' }, e.pinCtx({ pastView: true })),
    () => e.core.reverseSale({ saleNo: 'CSL/26-27/0001', reason: 'a reason' }, e.pinCtx({ pastView: true })),
    () => e.core.runMigration({}, e.pinCtx({ pastView: true })),
    // a viewing date that is not today counts as past
    () => e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.pinCtx({ viewDate: '2026-11-17', clientRef: ref() }))
  ];
  for (const w of writes) refused(w(), 'PAST_VIEW');
  assert.equal(e.text(), before);
  good(e.core.getJob('WS-1', e.ctx({ pastView: true })));
  good(e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.pinCtx({ viewDate: '2026-11-18', clientRef: ref() })));
});

test('no write reaches the bill layer or the money layer when the role is wrong: the layer log stays empty of writes', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  e.as(TRAINEE);
  const before = e.text();
  const tries = [
    e.core.takeReceipt({ jobId: 'WS-1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.ctx({ clientRef: ref() })),
    e.core.saveEstimate({ jobId: 'WS-1', lines: [] }, e.ctx()),
    e.core.issueBill({ jobId: 'WS-1', lines: [] }, e.ctx()),
    e.core.cancelBill({ invoiceNo: 'x', reason: 'a reason' }, e.ctx()),
    e.core.voidJob({ jobId: 'WS-1', reason: 'a reason' }, e.ctx()),
    e.core.setConfig({ billingRoles: ['Trainee'] }, e.ctx()),
    e.core.refund({ jobId: 'WS-1', amountPaise: 1, payMode: 'Cash', reason: 'a reason' }, e.ctx())
  ];
  for (const t of tries) refused(t, 'NOT_ALLOWED');
  const writes = ['saveEstimate', 'recordApproval', 'issueInvoice', 'linkCcptInvoice', 'cancelInvoice', 'issueCreditNote', 'issueNoChargeSheet', 'voidJob', 'setBillingConfig'];
  assert.deepEqual(e.docsLib.calls.filter((c) => writes.includes(c.method)), []);
  assert.equal(e.text(), before);
});

test('a Manager is refused every Owner row before any PIN is looked at', () => {
  const e = build({ docs: 'fake', migrate: null });
  e.cases.add('WS-1');
  e.as(MANAGER);
  e.pin();
  const owner = [
    e.core.cancelBill({ invoiceNo: 'x', reason: 'a reason' }, e.ctx()),
    e.core.issueCreditNote({ invoiceNo: 'x' }, e.ctx()),
    e.core.refund({ jobId: 'WS-1', amountPaise: 1, payMode: 'Cash', reason: 'a reason' }, e.ctx({ stepUp: { ok: true, at: e.cur.stepAt } })),
    e.core.voidJob({ jobId: 'WS-1', reason: 'a reason' }, e.ctx()),
    e.core.setConfig({ billingRoles: [] }, e.ctx()),
    e.core.cancelNoChargeSheet({ sheetId: 'WS-1', reason: 'a reason' }, e.ctx()),
    e.core.decideLegacyAdvance({ jobId: 'WS-1', decision: 'IN_BOOK' }, e.ctx()),
    e.core.issueBill({ jobId: 'WS-1', mode: 'NOT_IN_CCPT', lines: [] }, e.ctx())
  ];
  for (const r of owner) refused(r, 'NOT_ALLOWED');
});

test('a throwing session provider fails closed and does not escape', () => {
  const e = build({ docs: 'fake', migrate: null, args: { session: () => { throw new Error('boom'); } } });
  const r = e.core.getJob('WS-1', {});
  assert.equal(r.ok, false);
  const c = e.core.can('VIEW_STATUS', OWNER);
  assert.equal(c.ok, true);
});

test('A-BCORE one role table: the bill layer action names (its ROLE_ACTIONS) give exactly the answers of the facade names', () => {
  const e = env();
  const pairs = [['APPROVAL_OVERRIDE', 'INV_APPROVAL_OVERRIDE'], ['DISCOUNT_ABOVE_LIMIT', 'DISCOUNT_ABOVE'], ['NOT_IN_CCPT', 'INV_ISSUE_NOT_IN_CCPT'], ['VIEW_REGISTERS', 'VIEW_SUMMARY']];
  for (const name of ORDER) {
    for (const [docsName, coreName] of pairs) {
      const a = e.core.can(docsName, S[name]), b = e.core.can(coreName, S[name]);
      assert.deepEqual(a, b, name + ' ' + docsName);
      assert.notEqual(a.code, 'BCORE_ARGS_INVALID', name + ' ' + docsName + ' is a known action');
    }
  }
  // by hand from plan 2.11: the Owner may do all four (three with the PIN); the Store Manager only the registers
  assert.deepEqual(['APPROVAL_OVERRIDE', 'DISCOUNT_ABOVE_LIMIT', 'NOT_IN_CCPT', 'VIEW_REGISTERS'].map((a) => [e.core.can(a, OWNER).ok, e.core.can(a, OWNER).needsPin]), [[true, true], [true, true], [true, true], [true, false]]);
  assert.deepEqual(['APPROVAL_OVERRIDE', 'DISCOUNT_ABOVE_LIMIT', 'NOT_IN_CCPT', 'VIEW_REGISTERS'].map((a) => e.core.can(a, MANAGER).ok), [false, false, false, true]);
});
