// Service wave 2, governance T16: the static and cheap guards that protect the cash book. The money layer never names an Expense or DSR key,
// every posting is idempotent by its client reference, refunds need a fresh Owner PIN stamp, and a job is never on the old delivery path and
// the receipts path at the same time (the bill layer says which, the bridge reads the receipts stream only). REAL store, money and bill layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, expectFail, expectOk, OWNER, MANAGER } from './lib/svc2-docs-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const www = (f) => fs.readFileSync(path.join(here, '..', 'www', f), 'utf8');
const money = www('service-billing-money.js');
const bridge = www('integration-bridge.js');

test('T16.1 the money file names no Expense or DSR storage key and no storage call at all', () => {
  for (const k of ['gm_expenses', 'tanishq_statements', 'saagar_dsr', 'dsr_', 'gm_dsr', 'localStorage', 'getItem(', 'setItem(']) assert.equal(money.includes(k), false, k);
});

test('T16.2 the bridge reads the new money from the receipts stream only (one honest prefix constant) and never from a case field', () => {
  assert.equal(bridge.split('receipts_v1_FY').length - 1 >= 1, true, 'the bridge matches the receipts stream keys');
  assert.equal(bridge.split('var SVCM_PREFIX').length - 1, 1, 'one declared prefix constant');
  assert.equal(/moneyMode\s*:\s*['"]RCPT['"]/.test(bridge + money), false, 'the case marker moneyMode RCPT is void (C-MONEY-5)');
});

const post = {
  advance: (env, ref) => env.money.takeAdvance({ jobId: 'J-1', amountPaise: 5000, payMode: 'Cash' }, env.ctx(OWNER, { clientRef: ref })),
  balance: (env, ref, no) => env.money.takeBalance({ jobId: 'J-1', invoiceNo: no, amountPaise: 1000, payMode: 'UPI' }, env.ctx(OWNER, { clientRef: ref }))
};

test('T16.3 every posting is idempotent: the same client reference twice gives the same document and one record (advance, balance, refund, reversal)', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const a1 = expectOk(post.advance(env, 'ref-adv-0001'));
  const n = env.store.read('receipts').records.length;
  const a2 = expectOk(post.advance(env, 'ref-adv-0001'));
  assert.equal(a2.receipt.no, a1.receipt.no);
  assert.equal(env.store.read('receipts').records.length, n, 'no second record');
  const inv = expectOk(env.bill.issueInvoice({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }] }, env.ctx(MANAGER))).invoice;
  const b1 = expectOk(post.balance(env, 'ref-bal-0001', inv.no));
  const m = env.store.read('receipts').records.length;
  assert.equal(expectOk(post.balance(env, 'ref-bal-0001', inv.no)).receipt.no, b1.receipt.no);
  assert.equal(env.store.read('receipts').records.length, m);
  const rf = () => env.money.refund({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash', reason: 'refund for test', cnNo: undefined }, env.ctxPin(OWNER, { clientRef: 'ref-ref-0001' }));
  const first = rf();
  const again = rf();
  assert.equal(again.ok, first.ok, JSON.stringify([first, again]).slice(0, 300));
  if (first.ok) assert.equal(env.store.read('receipts').records.length, m + 1, 'the second refund with the same reference writes nothing');
  const rv = () => env.money.reverse({ no: b1.receipt.no, reason: 'wrong receipt typed' }, env.ctx(MANAGER, { clientRef: 'ref-rev-0001' }));
  const r1 = rv();
  const r2 = rv();
  // a reversal carries the fixed reference REVOF:<number>, so the second call is refused (or replayed) and exactly one reversal record exists
  assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 200));
  assert.equal(env.store.read('receipts').records.filter((x) => x.k === 'RRV').length, 1);
  assert.equal(env.store.findRef('receipts', 'REVOF:' + b1.receipt.no).b.reverses, b1.receipt.no);
  void r2;
});

test('T16.4 a refund needs a fresh Owner PIN stamp: none, 120001 ms old, and a stamp from the future are all PIN_REQUIRED, and nothing is written', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  expectOk(post.advance(env, 'ref-adv-0002'));
  const before = env.adapter.text();
  const ask = (stepUp) => env.money.refund({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash', reason: 'refund for test' }, env.ctx(OWNER, { stepUp }));
  expectFail(ask(undefined), 'PIN_REQUIRED');
  expectFail(ask({ ok: true, at: env.clock.ms() - 120001 }), 'PIN_REQUIRED');
  expectFail(ask({ ok: true, at: env.clock.ms() + 5 }), 'PIN_REQUIRED');
  expectFail(ask({ ok: true, at: 'now' }), 'PIN_REQUIRED');
  assert.equal(env.adapter.text(), before);
  expectFail(env.money.refund({ jobId: 'J-1', amountPaise: 100, payMode: 'Cash', reason: 'refund for test' }, env.ctxPin(MANAGER)), 'NOT_ALLOWED');
});

test('T16.5 one path per job: a job with no billing record is old way; its first receipt or estimate makes it new way, in the bill layer that the bridge marker row follows', () => {
  const env = makeEnv().seed();
  env.job('J-OLD');
  env.job('J-NEW');
  assert.equal(env.bill.isNewWay('J-OLD'), false);
  expectOk(env.money.takeAdvance({ jobId: 'J-NEW', amountPaise: 5000, payMode: 'Cash' }, env.ctx(OWNER, { clientRef: 'ref-adv-0003' })));
  assert.equal(env.bill.isNewWay('J-NEW'), true);
  assert.equal(env.bill.isNewWay('J-OLD'), false);
  assert.equal(money.includes('jobVoided'), true, 'the money layer asks the bill layer about the job through docsView');
  assert.equal(bridge.includes('wsc_'), true, 'the bridge writes the marker row for a job on the receipts path');
});
