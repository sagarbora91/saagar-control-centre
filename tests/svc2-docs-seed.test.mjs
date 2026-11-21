// Service wave 2, billing documents: the one-time hand-over of the old bill counter (plan 2.3, P1 tests T2S-H1 and T2S-H2).
// The old counter (settings and numbers on jobs) is supplied by the page as cases.legacyFloor(fy). REAL store and layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, expectFail, expectOk, OWNER, MANAGER } from './lib/svc2-docs-env.mjs';

const LB = (code, qty) => ({ code, qty, discountPaise: 0 });
function bill(env, id) {
  env.job(id);
  env.estimateApproved(id, [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  return expectOk(env.bill.issueInvoice({ jobId: id, labour: [LB('L1', 1)] }, env.ctx(MANAGER)));
}
const seeds = (env) => env.store.read('invoices').records.filter((r) => r.k === 'SERIES_SEED');

test('H1 hand-over table: old counter 0 gives 0001 with no seed', () => {
  const env = makeEnv().seed();
  const r = bill(env, 'J-1');
  assert.equal(r.invoice.no, 'SV/2026-27/0001');
  assert.equal(r.seeded, false);
  assert.equal(seeds(env).length, 0);
});

test('H1 old counter 41 gives a seed and 0042, in ONE write', () => {
  const env = makeEnv().seed();
  env.legacy.floor['2026-27'] = 41;
  env.job('J-1');
  env.estimateApproved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const before = env.count();
  const r = expectOk(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)));
  assert.equal(env.count() - before, 3, 'seed and bill are one shard write, one head write, one device mark');
  assert.equal(r.invoice.no, 'SV/2026-27/0042');
  assert.equal(r.seeded, true);
  const recs = env.store.read('invoices').records;
  const tail = recs.slice(-2);
  assert.deepEqual(tail.map((x) => x.k), ['SERIES_SEED', 'INV_ISSUE']);
  assert.deepEqual(tail[0].b, { seriesSeed: { series: 'SV', fy: '2026-27', last: 41 } });
  assert.equal(tail[0].at, tail[1].at);
  assert.equal(env.store.verifyAll().ok, true);
  // the next bill continues with no second seed
  assert.equal(bill(env, 'J-2').invoice.no, 'SV/2026-27/0043');
  assert.equal(seeds(env).length, 1);
  // a restart sees the same counter
  assert.equal(env.reopen().store.lastNumber('SV', env.clock.iso()).last, 43);
});

test('H1 old settings say 41 and a job carries SV/2026-27/0044: the page gives 44, so the seed is 44 and the bill 0045', () => {
  const env = makeEnv().seed();
  env.legacy.floor['2026-27'] = 44;
  const r = bill(env, 'J-1');
  assert.equal(r.invoice.no, 'SV/2026-27/0045');
  assert.equal(seeds(env)[0].b.seriesSeed.last, 44);
});

test('H1 the store is already at 45 and the old counter says 41: no new seed, the number follows the store', () => {
  const env = makeEnv().seed();
  env.legacy.floor['2026-27'] = 44;
  assert.equal(bill(env, 'J-1').invoice.no, 'SV/2026-27/0045');
  env.legacy.floor['2026-27'] = 41;
  const r = bill(env, 'J-2');
  assert.equal(r.invoice.no, 'SV/2026-27/0046');
  assert.equal(r.seeded, false);
  assert.equal(seeds(env).length, 1);
  // an old device that kept numbering meanwhile (counter now 50) moves the counter forward once more
  env.legacy.floor['2026-27'] = 50;
  const r3 = bill(env, 'J-3');
  assert.equal(r3.invoice.no, 'SV/2026-27/0051');
  assert.equal(seeds(env).length, 2);
});

test('H1 an old number only in an earlier year gives 0001 in the new year; old bills brought in count too', () => {
  const env = makeEnv().seed();
  env.legacy.floor['2025-26'] = 90;
  assert.equal(bill(env, 'J-1').invoice.no, 'SV/2026-27/0001');
  assert.equal(seeds(env).length, 0);
  const env2 = makeEnv().seed();
  env2.job('O-1', { status: 'closed', invoiceNo: 'SV/2026-27/0007' });
  const body = {
    legacyNo: 'SV/2026-27/0007', jobId: 'O-1', basis: 'LIVE_CASE', invoiceDate: '2026-10-05', gstBp: 1800, listedPaise: 1000, adjustmentPaise: 0, taxablePaise: 847, cgstPaise: 76,
    sgstPaise: 77, igstPaise: 0, gstPaise: 153, roundOffPaise: 0, totalPaise: 1000, finalPaise: 1000, payMode: 'Cash', lineCount: 1, correctionCount: 0, snapshotSha: null, warn: []
  };
  expectOk(env2.bill.importLegacy([{ ref: 'LEGACY:O-1', body }], env2.ctxPin(OWNER)));
  env2.legacy.floor['2026-27'] = 3;
  assert.equal(bill(env2, 'J-1').invoice.no, 'SV/2026-27/0008');
  assert.equal(seeds(env2)[0].b.seriesSeed.last, 7);
});

test('H1 a floor that cannot be read stops the bill (no number is invented); a floor past the limit is refused', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const before = env.text();
  env.raw.legacyFloor = () => { throw new Error('settings unreadable'); };
  expectFail(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)), 'DEPS_INVALID');
  env.raw.legacyFloor = () => 'many';
  expectFail(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)), 'DEPS_INVALID');
  env.raw.legacyFloor = () => 99999;
  expectFail(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER)), 'SVCS_SERIES_TOO_LONG');
  assert.equal(env.text(), before);
});

test('H2 crash windows: the bill is written but the job was not updated; the repair list says so, a retry returns the same bill', () => {
  const env = makeEnv().seed();
  env.job('J-1');
  env.estimateApproved('J-1', [{ kind: 'LABOUR', code: 'L1', qty: 1 }]);
  const ref = 'REF-BILL-0001';
  const a = expectOk(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER, { clientRef: ref })));
  assert.deepEqual(env.bill.repairLinks().links, [{ jobId: 'J-1', invoiceNo: a.invoice.no, state: 'ISSUED', action: 'SET' }]);
  const b = expectOk(env.bill.issueInvoice({ jobId: 'J-1', labour: [LB('L1', 1)] }, env.ctx(MANAGER, { clientRef: ref })));
  assert.equal(b.replayed, true);
  assert.equal(b.invoice.no, a.invoice.no);
  env.jobs.get('J-1').invoiceNo = a.invoice.no;
  assert.deepEqual(env.bill.repairLinks().links, []);
  // a cancel written while the job still shows the number: the list asks to clear it
  expectOk(env.bill.cancelInvoice(a.invoice.no, 'wrong job billed', env.ctxPin(OWNER)));
  assert.deepEqual(env.bill.repairLinks().links, [{ jobId: 'J-1', invoiceNo: '', state: 'CANCELLED', action: 'CLEAR' }]);
  env.jobs.get('J-1').invoiceNo = '';
  assert.deepEqual(env.bill.repairLinks().links, []);
  // blocked records: no answer
  const key = env.adapter.keys().find((k) => /invoices_v1_FY/.test(k));
  env.adapter.data.set(key, env.adapter.data.get(key).replace('"jobId":"J-1"', '"jobId":"J-7"'));
  const other = env.reopen();
  assert.equal(other.bill.repairLinks().ok, false);
  assert.equal(other.bill.activeInvoiceNo('J-1').ok, false);
});
