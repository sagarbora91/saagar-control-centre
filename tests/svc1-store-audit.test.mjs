// Store audit tests (Service wave 1): faults found by the Opus audit and fixed in the store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, makeAdapter, makeClock, openStore, newStore, put, expectFail, expectOk
} from './lib/svc1-store-harness.mjs';

test('audit A1: a replay block stays after a later verifyAll() or open() without the replay', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 1 } }));
  const replay = () => [{ code: 'SVCS_FIFO_MISMATCH', stream: 'ledger', detail: 'test mismatch' }];
  assert.equal(store.open({ replay }).blocked, true);
  assert.equal(store.verifyAll().blocked, true);
  assert.equal(store.open().blocked, true);
  expectFail(put(store, 'ledger', { k: 'TEST', b: { x: 2 } }), 'SVCS_BLOCKED');
  expectFail(store.read('ledger'), 'SVCS_BLOCKED');
  // a new replay that finds nothing replaces the old one
  assert.equal(store.open({ replay: () => [] }).blocked, false);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 3 } }));
});

test('audit A2: a head row whose time differs from the last record is fatal and is never used for the clamp', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 1 } }));
  const rows = JSON.parse(adapter.data.get(Store.HEAD_KEY));
  rows[0].at = '2030-01-01T00:00:00.000Z';
  const headRaw = '[' + rows.map((x) => '{"s":"' + x.s + '","rev":' + x.rev + ',"n":' + x.n + ',"h":"' + x.h + '","at":"' + x.at + '","key":"' + x.key + '"}').join(',') + ']';
  adapter.data.set(Store.HEAD_KEY, headRaw);
  // the old screen (memory still clean) refuses at write time
  const before = adapter.setCount;
  expectFail(put(store, 'ledger', { k: 'TEST', b: { x: 2 } }, { clockOverride: true, actor: ACTORS.owner }), 'SVCS_HEAD_INVALID');
  assert.equal(adapter.setCount, before);
  // a fresh open reports it and blocks
  const s2 = newStore(adapter, clock);
  const o = s2.open();
  assert.equal(o.blocked, true);
  const p = o.problems.find((x) => x.code === 'SVCS_HEAD_INVALID');
  assert.ok(p, JSON.stringify(o.problems));
  assert.equal(p.stream, 'ledger');
  assert.equal(p.n, 1);
  expectFail(put(s2, 'ledger', { k: 'TEST', b: {} }), 'SVCS_BLOCKED');
  // never repaired
  assert.equal(adapter.data.get(Store.HEAD_KEY), headRaw);
});

test('audit A3: lone surrogates are refused in values and keys; paired ones are fine', () => {
  assert.equal(Store.canonicalText({ s: 'a\ud800b' }), null);
  assert.equal(Store.canonicalText({ s: 'a\udc00' }), null);
  assert.equal(Store.canonicalText({ s: 'end\ud83d' }), null);
  assert.equal(Store.canonicalText({ ['k\ud800']: 1 }), null);
  assert.equal(Store.canonicalText({ s: 'ok 😀 घड़ी' }), '{"s":"ok 😀 घड़ी"}');
  const store = openStore(makeAdapter(), makeClock());
  expectFail(put(store, 'ledger', { k: 'TEST', b: { note: 'x\ud800' } }), 'SVCS_BODY_NOT_CANONICAL');
});

test('audit A4: the Service case contact fields are refused at any depth and in any case', () => {
  const adapter = makeAdapter();
  const store = openStore(adapter, makeClock());
  const bad = [
    { ['cust' + 'Mobile']: '9000000000' },
    { job: { ['cust' + 'Addr']: 'Test lane' } },
    { lines: [{ ['CUST' + 'MOBILE']: 'x' }] },
    { customerAddress: 'Test lane' }
  ];
  for (const b of bad) expectFail(put(store, 'ledger', { k: 'TEST', b }), 'SVCS_BODY_FORBIDDEN_FIELD');
  assert.equal(adapter.svcsKeys().length, 0);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { jobId: 'J-1', custRef: 'not contact data' } }));
});

test('audit A5: a numeric clock outside the 4-digit year range is refused, not stored', () => {
  const adapter = makeAdapter();
  const r = Store.createStore(adapter, { now: () => 8.6e15 });
  const store = r.store;
  store.open();
  expectFail(store.nextAt('ledger'), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'TEST', b: {} }], { expectRev: 0, actor: ACTORS.staff }), 'SVCS_ARGS_INVALID');
  assert.equal(adapter.setCount, 0);
  const ok2 = Store.createStore(makeAdapter(), { now: () => Date.parse('2026-11-13T05:00:00.000Z') }).store;
  assert.equal(ok2.nextAt('ledger').at, '2026-11-13T05:00:00.000Z');
});

test('audit A6: a shard cut short after open is refused at write time and nothing is written', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 1 } }));
  expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 2 } }));
  const key = store.head('ledger').key;
  const arr = JSON.parse(adapter.data.get(key));
  adapter.data.set(key, JSON.stringify(arr.slice(0, 1)));
  const before = adapter.setCount;
  const r = put(store, 'ledger', { k: 'TEST', b: { x: 3 } });
  assert.equal(r.ok, false);
  assert.ok(['SVCS_HEAD_AHEAD', 'SVCS_PREFIX_VIOLATION'].includes(r.code), r.code);
  assert.equal(adapter.setCount, before);
  const o = newStore(adapter, clock).open();
  assert.equal(o.blocked, true);
  assert.ok(o.problems.some((p) => p.code === 'SVCS_HEAD_AHEAD'));
});
