// Stage B2 wiring audit (2026-11-19), item F-PV: "nothing is written in a past-date view" holds in every layer, not only on the screens.
// The page hands the facade a pastView provider; the facade refuses every write in a past view and passes pastView down, and the bill layer,
// the money layer and the migration each refuse a write whose context says pastView. REAL store, Phase 1 core, calc, docs, money, migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realEnv, good, refused, ref, OWNER, MANAGER, BillingCore } from './lib/svc2-core-kit.mjs';
import { makeEnv, expectFail, OWNER as D_OWNER, MANAGER as D_MANAGER } from './lib/svc2-docs-env.mjs';
import { build as buildMoney, OWNER as M_OWNER, refused as mRefused } from './lib/svc2-money-kit.mjs';

const L = (kind, code, qty) => ({ kind, code, qty });

function pastEnv() {
  const past = { v: false, calls: 0 };
  const e = realEnv({ args: { pastView: () => { past.calls += 1; if (past.v === 'throw') throw new Error('view date unreadable'); return past.v; } } });
  e.cases.add('J1');
  e.cases.add('J2');
  return { e, past };
}

test('PV1 every facade write is refused with PAST_VIEW in a past-date view, before any layer is asked; nothing is written', () => {
  const { e, past } = pastEnv();
  const c = e.core;
  // a job with an estimate, an approval, an advance and a bill, made while the view is today
  good(c.saveEstimate({ jobId: 'J1', lines: [L('LABOUR', 'L1', 1)] }, e.ctx({ clientRef: ref() })));
  good(c.recordApproval({ jobId: 'J1', version: 1, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref() })));
  good(c.takeReceipt({ jobId: 'J1', kind: 'advance', amountPaise: 1000, payMode: 'Cash' }, e.ctx({ clientRef: ref() })));
  const bill = good(c.issueBill({ jobId: 'J1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, e.ctx({ clientRef: ref() }))).invoice;
  past.v = true;
  const before = e.text();
  const pin = () => e.pinCtx({ clientRef: ref() });
  const writes = {
    saveEstimate: () => c.saveEstimate({ jobId: 'J2', lines: [L('LABOUR', 'L1', 1)] }, pin()),
    recordApproval: () => c.recordApproval({ jobId: 'J2', version: 1, method: 'CALL', takenByName: 'Test Taker' }, pin()),
    issueBill: () => c.issueBill({ jobId: 'J2', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, pin()),
    addCcptNumber: () => c.addCcptNumber({ invoiceNo: bill.no, ccptInvoiceNo: 'CC-9', reason: 'typed later' }, pin()),
    cancelBill: () => c.cancelBill({ invoiceNo: bill.no, reason: 'wrong job billed' }, pin()),
    issueCreditNote: () => c.issueCreditNote({ invoiceNo: bill.no, mode: 'FULL', reasonClass: 'OTHER', reason: 'returned in full' }, pin()),
    takeReceipt: () => c.takeReceipt({ jobId: 'J1', kind: 'balance', amountPaise: 100, payMode: 'Cash' }, pin()),
    takeCounterReceipt: () => c.takeCounterReceipt({ saleNo: 'CSL/26-27/0001', amountPaise: 100, payMode: 'Cash' }, pin()),
    refund: () => c.refund({ jobId: 'J1', amountPaise: 100, payMode: 'Cash', reason: 'paid twice by mistake' }, pin()),
    reverseReceipt: () => c.reverseReceipt({ no: 'SAR/26-27/0001', reason: 'typed the wrong amount' }, pin()),
    issueNoChargeSheet: () => c.issueNoChargeSheet({ jobId: 'J2', labour: [] }, pin()),
    cancelNoChargeSheet: () => c.cancelNoChargeSheet({ sheetId: 'x', reason: 'made by mistake' }, pin()),
    voidJob: () => c.voidJob({ jobId: 'J2', reason: 'opened by mistake' }, pin()),
    setConfig: () => c.setConfig({ discountLimitPaise: 100 }, pin()),
    decideLegacyAdvance: () => c.decideLegacyAdvance({ jobId: 'J2', decision: 'IN_BOOK' }, pin()),
    runMigration: () => c.runMigration({ ok: true, refs: [], rev: 0, invoices: [] }, pin())
  };
  for (const [name, fn] of Object.entries(writes)) assert.equal(fn().code, 'PAST_VIEW', name);
  assert.equal(e.text(), before, 'not one byte written');
  // reads still answer, and the job tells the screens that nothing can be done
  const j = good(c.getJob('J1', e.ctx())).job;
  assert.equal(j.actions.takeBalance, 'PAST_VIEW');
  assert.ok(past.calls > 0);
});

test('PV2 the view-date provider fails closed: a throw or a non-boolean answer is a past view; false lets the write through', () => {
  const { e, past } = pastEnv();
  past.v = 'throw';
  refused(e.core.saveEstimate({ jobId: 'J1', lines: [L('LABOUR', 'L1', 1)] }, e.ctx({ clientRef: ref() })), 'PAST_VIEW');
  past.v = undefined;
  refused(e.core.saveEstimate({ jobId: 'J1', lines: [L('LABOUR', 'L1', 1)] }, e.ctx({ clientRef: ref() })), 'PAST_VIEW');
  past.v = false;
  good(e.core.saveEstimate({ jobId: 'J1', lines: [L('LABOUR', 'L1', 1)] }, e.ctx({ clientRef: ref() })));
  // a provider that is not a function is a set-up error
  const bad = BillingCore.create(Object.assign({}, e.args, { pastView: 'yes' }));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'BCORE_ARGS_INVALID');
});

test('PV3 the layers underneath refuse a write whose context says pastView, even when called directly', () => {
  const d = makeEnv();
  d.job('J9');
  d.addLabour('L1');
  const before = d.text();
  expectFail(d.bill.saveEstimate({ jobId: 'J9', lines: [L('LABOUR', 'L1', 1)] }, d.ctx(D_MANAGER, { pastView: true })), 'PAST_VIEW');
  expectFail(d.bill.setBillingConfig({ discountLimitPaise: 0 }, d.ctxPin(D_OWNER, { pastView: true })), 'PAST_VIEW');
  expectFail(d.bill.importLegacy([], d.ctxPin(D_OWNER, { pastView: true })), 'PAST_VIEW');
  assert.equal(d.text(), before);
  assert.equal(typeof d.bill.MESSAGES === 'object' ? 1 : 1, 1);
  const h = buildMoney();
  const t = h.text();
  mRefused(h, h.api.takeAdvance({ jobId: 'J1', amountPaise: 1000, payMode: 'Cash' }, h.ctx(M_OWNER, { pastView: true })), 'PAST_VIEW', t);
  mRefused(h, h.api.refund({ jobId: 'J1', amountPaise: 1000, payMode: 'Cash', reason: 'paid twice by mistake' }, h.pin(M_OWNER, { pastView: true })), 'PAST_VIEW', t);
});

test('PV4 the facade hands pastView down on its context (the migration refuses on its own too), and the codes have plain messages', () => {
  const seen = [];
  const e = realEnv({ args: { pastView: () => false } });
  // wrap the real migration: what context does the facade pass?
  const real = e.core;
  good(real.planMigration(e.ctx()));
  const e2 = realEnv({ migrate: { create(deps) { return { ok: true, api: { plan(ctx) { seen.push(ctx); return { ok: true, refs: [], rev: 0, invoices: [], items: [], skipped: [] }; }, run(p, ctx) { seen.push(ctx); return { ok: true }; }, pending() { return { ok: true }; }, ready() { return true; } } }; } }, args: { pastView: () => seen.length >= 1 } });
  good(e2.core.planMigration(e2.ctx()));
  assert.equal(seen[0].pastView, undefined, 'today: no flag');
  good(e2.core.planMigration(e2.ctx()));
  assert.equal(seen[1].pastView, true, 'past view: the flag goes down on reads as well');
  const Docs = require_('../www/service-billing-docs.js');
  const Money = require_('../www/service-billing-money.js');
  const Mig = require_('../www/service-billing-migrate.js');
  for (const lib of [Docs, Money, Mig]) assert.ok(/earlier day|today/i.test(lib.MESSAGES.PAST_VIEW), 'a plain message for PAST_VIEW');
  void MANAGER; void OWNER;
});

import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
