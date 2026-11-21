// Service wave 2, W-BRIDGE: old versus new. On data that has no Service receipts the new bridge must behave
// exactly like the 031841f bridge (fixture tests/fixtures/service-wave-2/bridge-031841f.js): same storage text after
// every cycle, same write counts. Also: three-run replay, and the size and shape of the edit itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  makeBridge, newSource, oldSource, FY, TODAY, sar, src, srf, rrv, shard, closedJob, openStmts, noMarker, markers
} from './lib/svc2-bridge-seed.mjs';

const tomb = (id, over = {}) => Object.assign({ id, at: '2026-11-12T06:00:01.000Z', by: 'Owner', was: 'closed', ownerPin: true, reason: 'wrong entry', ledgerRef: 'wsc_' + id }, over);

/* A scenario is a seed and a list of steps; both bridges run it and the whole storage text is compared after every step. */
const scenarios = {
  'closed job within the window': { seed: { saagar_wsf_v2: [closedJob('J1')], tanishq_statements: openStmts() }, steps: [(b) => b.run(), (b) => b.run()] },
  'closed job with a tombstone': { seed: { saagar_wsf_v2: [closedJob('J1')], tanishq_statements: openStmts() },
    steps: [(b) => b.run(), (b) => { b.set('saagar_wsf_settings_v1', { deleted: [tomb('J1')] }); b.set('saagar_wsf_v2', []); b.run(); }, (b) => b.run()] },
  'held on a closed day': { seed: { saagar_wsf_v2: [closedJob('J1')], tanishq_statements: { [TODAY]: { date: TODAY, closed: true } } },
    steps: [(b) => b.run(), (b) => { b.set('tanishq_statements', openStmts()); b.run(); }, (b) => b.run()] },
  'reused id': { seed: { saagar_wsf_v2: [closedJob('J1')], tanishq_statements: openStmts() },
    steps: [(b) => b.run(), (b) => { b.set('saagar_wsf_settings_v1', { deleted: [tomb('J1')] }); b.set('saagar_wsf_v2', []); b.run(); },
      (b) => { b.setNow('2026-11-12T07:00:00.000Z'); b.set('saagar_wsf_v2', [closedJob('J1', { closedAt: '2026-11-12T06:50:00Z', delivery: { finalAmt: 1500, payMode: 'UPI', collectDate: TODAY } })]); b.run(); }, (b) => b.run()] },
  'failed write': { seed: { saagar_wsf_v2: [closedJob('J1')], tanishq_statements: openStmts() }, steps: [(b) => { b.failNext('gm_expenses'); b.run(); }, (b) => b.run(), (b) => b.run()] },
  'old format event of a deleted case': { seed: {
    saagar_bus: [{ id: 'SERVICE_DELIVERED:WS-1', type: 'SERVICE_DELIVERED', at: '2026-11-12T05:30:00.000Z', src: 'wsc', consumed: {}, rd: TODAY, payload: { cid: 'WS-1', date: TODAY, amount: 777, mode: 'Cash' } }],
    saagar_wsf_v2: [], gm_expenses: [], tanishq_statements: openStmts(), saagar_wsf_settings_v1: { deleted: [tomb('WS-1', { at: '2026-11-12T06:30:00.000Z' })] } },
    steps: [(b) => b.run(), (b) => b.run()] },
  'closed day and locked month with a tombstone': { seed: {
    gm_expenses: [{ id: 'e_wsc_X', type: 'income', date: '2026-11-10', amount: 500, mode: 'Cash', source: 'wsc', sourceRef: 'wsc_X', void: false, createdAt: '2026-11-10T05:00:00Z', editLog: [] }],
    tanishq_statements: { '2026-11-10': { date: '2026-11-10', closed: true } }, gm_tax_feed: { '2026-10': { gstEstimate: 1 } }, saagar_wsf_settings_v1: { deleted: [tomb('X')] } },
    steps: [(b) => b.run(), (b) => b.run()] },
  'a Service key of another stream is present (ledger, invoices): ignored': { seed: {
    saagar_wsf_v2: [closedJob('J1')], tanishq_statements: openStmts(),
    saagar_svcs_ledger_v1_FY2026: [{ n: 1, k: 'CSL', b: { no: 'CSL/26-27/0001', amountPaise: 1000 } }], saagar_svcs_invoices_v1_FY2026_27: [{ n: 1, k: 'INV_ISSUE', b: {} }] },
    steps: [(b) => b.run(), (b) => b.run()] },
  'an empty receipts shard': { seed: { saagar_wsf_v2: [closedJob('J1')], tanishq_statements: openStmts(), [FY]: '[]' }, steps: [(b) => b.run(), (b) => b.run()] },
  'a ledger that is not a list': { seed: { saagar_wsf_v2: [closedJob('J1')], gm_expenses: '{"x":1}', tanishq_statements: openStmts() }, steps: [(b) => b.run()] }
};

for (const [name, sc] of Object.entries(scenarios)) {
  test('B21 old and new bridge agree: ' + name, () => {
    const o = makeBridge(sc.seed, { source: oldSource });
    const n = makeBridge(sc.seed, { source: newSource });
    assert.equal(n.dump(), o.dump());
    sc.steps.forEach((step, i) => {
      step(o); step(n);
      assert.equal(n.dump(), o.dump(), 'storage differs after step ' + (i + 1));
      assert.deepEqual(n.writes, o.writes, 'write counts differ after step ' + (i + 1));
    });
  });
}

/* A deterministic pile of legacy-only worlds (no money keys): 300 worlds, the same text from both bridges. */
test('B21 legacy-only golden: 300 seeded worlds give identical storage after three cycles', () => {
  let seed = 20261118;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const days = ['2026-11-12', '2026-11-11', '2026-11-05', '2026-10-30'];
  for (let w = 0; w < 300; w++) {
    const jobs = []; const nJobs = 1 + rnd(5);
    for (let i = 0; i < nJobs; i++) {
      const closed = rnd(4) !== 0, cd = days[rnd(days.length)];
      jobs.push({ id: 'W' + w + '-' + i, status: closed ? 'closed' : 'open', closedAt: cd + 'T0' + rnd(9) + ':00:00Z', custName: 'Test ' + i, brand: 'Titan',
        delivery: closed ? { finalAmt: [0, 100, 250.5, 999][rnd(4)], payMode: ['Cash', 'UPI', 'Card', 'bank transfer', ''][rnd(5)], collectDate: days[rnd(days.length)] } : undefined });
    }
    const stm = {}; days.forEach((d) => { if (rnd(3) === 0) stm[d] = { date: d, closed: true }; });
    const ledger = rnd(2) ? [] : [{ id: 'e_wsc_' + jobs[0].id, type: 'income', date: '2026-11-12', amount: 5, mode: 'Cash', source: 'wsc', sourceRef: 'wsc_' + jobs[0].id, void: rnd(2) === 1, createdAt: '2026-11-12T05:00:00Z', editLog: [] }];
    const settings = rnd(3) === 0 ? { deleted: [tomb(jobs[0].id, { at: '2026-11-12T09:00:00Z' })] } : undefined;
    const s = { saagar_wsf_v2: jobs, tanishq_statements: stm, gm_expenses: ledger };
    if (settings) s.saagar_wsf_settings_v1 = settings;
    const o = makeBridge(s, { source: oldSource }), n = makeBridge(s, { source: newSource });
    for (let c = 0; c < 3; c++) { o.run(); n.run(); assert.equal(n.dump(), o.dump(), 'world ' + w + ' cycle ' + c); }
    assert.deepEqual(n.writes, o.writes, 'world ' + w);
  }
});

/* ---------------------------------------------------------------- replay */
test('REPLAY three runs on a mixed world: every byte of storage is the same after the first run', () => {
  const b = makeBridge({
    tanishq_statements: openStmts(),
    saagar_wsf_v2: [closedJob('OLD', { delivery: { finalAmt: 500, payMode: 'UPI', collectDate: TODAY } }), closedJob('NEW'), { id: 'OPEN1', status: 'open' }],
    [FY]: shard(
      sar('SAR/26-27/0001', 'NEW', 20000), src('SRC/26-27/0001', { jobId: 'NEW', invoiceNo: 'SV/2026-27/0001', amountPaise: 57700, payMode: 'Card' }),
      sar('SAR/26-27/0002', 'OPEN1', 3000), srf('SRF/26-27/0001', { jobId: 'OPEN1', amountPaise: 1000 }),
      sar('SAR/26-27/0003', 'OPEN1', 700), rrv('SAR/26-27/0003'),
      src('SRC/26-27/0002', { saleNo: 'CSL/26-27/0001', amountPaise: 12345, payMode: 'UPI' })
    )
  });
  b.run();
  const first = b.dump();
  assert.equal(noMarker(b.ledger()).length, 1 + 2 + 2 + 1, 'OLD row, NEW x2, OPEN1 advance and refund, the counter receipt (the reversed one never posts)');
  assert.equal(markers(b.ledger()).length, 2);
  assert.equal(b.writes.gm_expenses, 2, 'one write by the old path (OLD row), one by the receipts path');
  b.run(); assert.equal(b.dump(), first);
  b.run(); assert.equal(b.dump(), first);
  assert.equal(b.writes.gm_expenses, 2);
  assert.equal(b.writes.saagar_bus, 1);
});

/* ---------------------------------------------------------------- the edit itself */
test('EDIT only insertions: the old file is a subsequence of the new one; added text is ASCII; the old text is unmoved', () => {
  const o = oldSource.split('\n'), n = newSource.split('\n');
  let j = 0; const added = [];
  for (let i = 0; i < n.length; i++) { if (j < o.length && n[i] === o[j]) j++; else added.push(n[i]); }
  assert.equal(j, o.length, 'every old line is still there, in order');
  assert.equal(added.length, n.length - o.length);
  assert.ok(added.length < 200, 'the edit stays small: ' + added.length + ' lines');
  assert.equal(added.filter((l) => /[^\x00-\x7f]/.test(l)).length, 0);
  assert.equal(newSource.indexOf('\r'), -1);
  assert.equal(oldSource.indexOf('\r'), -1);
});

test('EDIT the old fixture is the real 031841f file', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL('./fixtures/service-wave-2/bridge-031841f.js', import.meta.url))).digest('hex');
  assert.equal(sha, '47a2db320d0c186694b30c1bbf1cfbe77306805c7a076d8c6dc53a8b18bccc7c');
});

test('EDIT frozen behaviours: emit, consume, busPrune, the old row shape, the 7 day window and the message count are untouched', () => {
  const grab = (src, name) => { const i = src.indexOf('  function ' + name + '('); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };
  for (const f of ['emit', 'consume', 'busPrune', 'deletedTombMap', 'voidDeletedServiceIncome', 'cutoffIso']) assert.equal(grab(newSource, f), grab(oldSource, f), f);
  assert.equal((newSource.match(/RECENT_DAYS=7, BUS_TTL_DAYS=14/g) || []).length, 1);
  assert.equal((newSource.match(/postMessage/g) || []).length, (oldSource.match(/postMessage/g) || []).length);
  assert.equal((newSource.match(/ST_/g) || []).length, (oldSource.match(/ST_/g) || []).length);
  assert.equal((newSource.match(/localStorage\.setItem/g) || []).length, (oldSource.match(/localStorage\.setItem/g) || []).length);
  assert.equal((newSource.match(/setInterval|setTimeout/g) || []).length, (oldSource.match(/setInterval|setTimeout/g) || []).length);
  assert.equal((newSource.match(/\bfetch\(/g) || []).length, 0);
});

test('EDIT the Service key is read through one honest constant and a plain variable key, and never written', () => {
  assert.equal((newSource.match(/saagar_svcs_/g) || []).length, 1);
  assert.match(newSource, /var SVCM_PREFIX='saagar_svcs_';/);
  assert.match(newSource, /new RegExp\('\^'\+SVCM_PREFIX\+'receipts_v1_FY/);
  assert.equal(/receipts_v1_FY/.test(oldSource), false);
  // every setItem goes through S(); S() is called only with the ledger, never with a Service key
  const calls = newSource.match(/\bS\(([A-Za-z_]+)\s*,/g) || [];
  assert.equal(calls.some((c) => /SVCM|svcm/.test(c)), false);
  assert.equal(/getItem\((['"`])/.test(newSource.slice(newSource.indexOf('function svcmLoad'), newSource.indexOf('function svcmHas'))), false, 'getItem takes a variable');
  assert.equal(/\bnew Function\b|\beval\(/.test(newSource), false);
});

test('EDIT Home messages never contain the words the shell blocks on', () => {
  // every message of the Phase 2 Home block, all its string pieces joined (A-BRIDGE 2: also the cash-book item and the plan's "seen twice" text)
  const blk = newSource.slice(newSource.indexOf('/* Phase 2 Service money: read-only reports'), newSource.indexOf('/* S03b U14-08'));
  const msgs = [...blk.matchAll(/msg:(.*?),at:d\}/g)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join(''));
  assert.equal(msgs.length, 8);
  assert.ok(msgs.some((m) => /service receipt number seen twice - review in Expense/i.test(m)), 'plan 2.16 text');
  for (const m of msgs) { assert.doesNotMatch(m, /mismatch|open lead|closed or tax-locked/i); assert.match(m, /^[\x20-\x7e]+$/); }
});

test('EDIT the new public read function exists and the old ones are unchanged', () => {
  const b = makeBridge({});
  b.run();
  assert.deepEqual(Object.keys(b.ctx.SaagarBridge).sort(), ['bus', 'config', 'croAuditFeed', 'events', 'exceptions', 'publishOrg', 'runNow', 'serviceMoney', 'status', 'taxPayable']);
  const o = makeBridge({}, { source: oldSource });
  assert.deepEqual(Object.keys(o.ctx.SaagarBridge).sort(), ['bus', 'config', 'croAuditFeed', 'events', 'exceptions', 'publishOrg', 'runNow', 'status', 'taxPayable']);
  assert.deepEqual(JSON.parse(JSON.stringify(b.ctx.SaagarBridge.serviceMoney())), { ok: true, receipts: 0, posted: 0, held: 0, failed: 0, revHeld: 0, drift: 0, twice: 0, reused: 0, bad: 0 });
});
