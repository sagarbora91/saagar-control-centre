// Service Stores store: writing (T-S6 to T-S18, T-S24) and the functions added by the plan
// (head, nextAt, nextNumber, series check, opts.at, guardRevs, config stream).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, makeAdapter, makeClock, newStore, openStore, put, postNumbered, expectFail, expectOk, parseShard, ledgerKeys, forgeChain
} from './lib/svc1-store-harness.mjs';

const ZERO = '0'.repeat(64);
const P = Store.SVCS_PREFIX;

test('T-S6 first append creates shard and head with exact text', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const r = expectOk(put(store, 'ledger', { k: 'TEST', b: { qty: 2, note: 'hello' }, r: 'REF:first' }));
  assert.equal(r.rev, 1);
  assert.equal(r.n, 1);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].id, 'LED-000001');
  assert.equal(r.records[0].p, ZERO);
  const key = P + 'ledger_v1_2026-11';
  assert.deepEqual(adapter.svcsKeys(), [P + 'head_v1', key].sort());
  const aText = '{"m":"Test Keeper","r":"Store Manager","t":"manager"}';
  const bText = '{"note":"hello","qty":2}';
  const h = Store.sha256Hex('ledger\n' + ZERO + '\n1\n2026-11-13T05:00:00.000Z\nTEST\nREF:first\n' + aText + '\n' + bText);
  const expected = '[{"n":1,"id":"LED-000001","at":"2026-11-13T05:00:00.000Z","k":"TEST","r":"REF:first","a":' + aText + ',"b":' + bText + ',"p":"' + ZERO + '","h":"' + h + '"}]';
  assert.equal(adapter.data.get(key), expected);
  assert.equal(adapter.data.get(P + 'head_v1'),
    '[{"s":"ledger","rev":1,"n":1,"h":"' + h + '","at":"2026-11-13T05:00:00.000Z","key":"' + key + '"}]');
  assert.equal(r.h, h);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.records) && Object.isFrozen(r.records[0]) && Object.isFrozen(r.records[0].b));
  // watermark is device-local and equals the heads
  const wm = JSON.parse(adapter.data.get(Store.WATERMARK_KEY));
  assert.deepEqual(wm, { at: '2026-11-13T05:00:00.000Z', streams: { ledger: { h, n: 1, rev: 1 } }, v: 1 });
  // a second record: chain link, no ref key when none given
  clock.advance(1000);
  const r2 = expectOk(put(store, 'ledger', { k: 'TEST', b: { qty: 1 } }));
  assert.equal(r2.records[0].p, h);
  assert.equal(r2.records[0].id, 'LED-000002');
  assert.equal('r' in r2.records[0], false);
  assert.ok(adapter.data.get(key).includes('"k":"TEST","a":'));
});

test('T-S7 chain across 500 appends, two month ends and parts', () => {
  const clock = makeClock('2026-10-30T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  for (let i = 0; i < 500; i++) {
    clock.advance(i % 7 === 0 ? 12 * 3600000 : 60000);
    expectOk(put(store, 'ledger', { k: 'TEST', b: { i, text: 'posting number ' + i + ' of the long run test' } }));
  }
  const v = store.verifyAll();
  assert.equal(v.ok, true);
  assert.deepEqual(v.problems, []);
  assert.equal(v.blocked, false);
  const keys = ledgerKeys(adapter);
  assert.ok(keys.some((k) => /2026-10/.test(k)) && keys.some((k) => /2026-11/.test(k)) && keys.some((k) => /2026-12/.test(k)) && keys.some((k) => /_p2$/.test(k)));
  let prevHash = ZERO; let prevN = 0;
  const order = keys.slice().sort((a, b) => {
    const pa = Store.parseShardKey(a); const pb = Store.parseShardKey(b);
    return pa.period === pb.period ? pa.part - pb.part : (pa.period < pb.period ? -1 : 1);
  });
  for (const k of order) {
    const arr = parseShard(adapter, k);
    assert.ok(Array.isArray(arr) && arr.length > 0);
    assert.equal(arr[0].p, prevHash, 'first record of ' + k + ' links to the previous shard');
    for (const rec of arr) { assert.equal(rec.n, prevN + 1); prevN = rec.n; }
    prevHash = arr[arr.length - 1].h;
  }
  assert.equal(prevN, 500);
  // a fresh store reads exactly the same 500 records
  const again = openStore(adapter, clock);
  assert.equal(again.read('ledger').records.length, 500);
  assert.equal(again.status().blocked, false);
});

test('T-S8 shard size rule: soft cap 45,000, batches never split, big single batch, hard cap', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const text = 'y'.repeat(300);
  let guard = 0;
  while (ledgerKeys(adapter).length < 2 && guard++ < 400) {
    clock.advance(1000);
    expectOk(put(store, 'ledger', { k: 'TEST', b: { text } }));
  }
  const keys = ledgerKeys(adapter);
  assert.deepEqual(keys, [P + 'ledger_v1_2026-11', P + 'ledger_v1_2026-11_p2']);
  assert.ok(adapter.data.get(keys[0]).length <= 45000);
  assert.ok(adapter.data.get(keys[0]).length > 44000, 'first shard filled to just under the cap');
  // a batch is never split: five records in one call land in one shard
  clock.advance(1000);
  const batch = Array.from({ length: 5 }, (_, i) => ({ k: 'TEST', b: { i, text } }));
  const r = expectOk(put(store, 'ledger', batch));
  assert.equal(r.records.length, 5);
  assert.equal(new Set(r.records.map(() => r.key)).size, 1);
  // single big batch (about 383,000 characters) is accepted as its own part
  clock.advance(1000);
  const big = expectOk(put(store, 'ledger', { k: 'BIG', b: { rows: Array.from({ length: 1000 }, () => 'x'.repeat(380)) } }));
  assert.ok(adapter.data.get(big.key).length > 380000 && adapter.data.get(big.key).length <= 400002);
  // the next small record starts a new part (the big one is over the soft cap)
  clock.advance(1000);
  const after = expectOk(put(store, 'ledger', { k: 'TEST', b: { i: 1 } }));
  assert.notEqual(after.key, big.key);
  // over the hard cap: refused, nothing written
  const before = adapter.setCount;
  clock.advance(1000);
  expectFail(put(store, 'ledger', { k: 'BIG', b: { rows: Array.from({ length: 1100 }, () => 'x'.repeat(380)) } }), 'SVCS_DOC_TOO_LARGE');
  assert.equal(adapter.setCount, before);
  // no other shard exceeds the soft cap
  for (const k of ledgerKeys(adapter)) if (k !== big.key) assert.ok(adapter.data.get(k).length <= 45000, k);
  assert.equal(store.verifyAll().problems.length, 0);
});

test('T-S9 prefix check: changed earlier text is caught and nothing is written', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { text: 'one' } }));
  clock.advance(1000);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { text: 'two' } }));
  const key = P + 'ledger_v1_2026-11';
  // (a) text changes between the read and the write: the second read of the shard differs
  let reads = 0;
  adapter.getHooks.push((k, v) => {
    if (k === key) { reads += 1; if (reads === 2) return v.replace('"one"', '"ONE"'); }
    return v;
  });
  const before = adapter.setCount;
  clock.advance(1000);
  expectFail(put(store, 'ledger', { k: 'TEST', b: { text: 'three' } }), 'SVCS_PREFIX_VIOLATION');
  assert.equal(adapter.setCount, before);
  adapter.getHooks.length = 0;
  // (b) text changed after it was verified (no chain fix-up): stopped before any write
  const snap = adapter.data.get(key);
  adapter.data.set(key, snap.replace('"one"', '"ONE"'));
  expectFail(put(store, 'ledger', { k: 'TEST', b: { text: 'three' } }), 'SVCS_PREFIX_VIOLATION');
  assert.equal(adapter.setCount, before);
  adapter.data.set(key, snap);
  // (c) normal run: the new text starts with the exact old text
  const old = adapter.data.get(key);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { text: 'three' } }));
  assert.equal(adapter.data.get(key).indexOf(old.slice(0, -1)), 0);
  assert.equal(adapter.data.get(key).length > old.length, true);
});

test('T-S10 revision lock between two screens', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const a = openStore(adapter, clock);
  for (let i = 0; i < 3; i++) { clock.advance(1000); expectOk(put(a, 'ledger', { k: 'TEST', b: { i } })); }
  const b = openStore(adapter, clock);
  assert.equal(b.head('ledger').rev, 3);
  clock.advance(1000);
  expectOk(put(a, 'ledger', { k: 'TEST', b: { i: 3 } }));
  const stale = b.append('ledger', [{ k: 'TEST', b: { i: 9 } }], { expectRev: 3, actor: ACTORS.staff });
  const f = expectFail(stale, 'SVCS_REV_CONFLICT');
  assert.match(f.detail, /4/);
  // knowing the new revision is not enough: b has not reopened, its memory is old
  expectFail(b.append('ledger', [{ k: 'TEST', b: { i: 9 } }], { expectRev: 4, actor: ACTORS.staff }), 'SVCS_REV_CONFLICT');
  assert.equal(b.read('ledger').records.length, 3, 'b still shows what it verified');
  b.open();
  assert.equal(b.read('ledger').records.length, 4);
  clock.advance(1000);
  const ok2 = expectOk(b.append('ledger', [{ k: 'TEST', b: { i: 9 } }], { expectRev: 4, actor: ACTORS.staff }));
  assert.equal(ok2.rev, 5);
  // a bad revision argument
  expectFail(b.append('ledger', [{ k: 'TEST', b: {} }], { actor: ACTORS.staff }), 'SVCS_ARGS_INVALID');
  expectFail(b.append('ledger', [{ k: 'TEST', b: {} }], { expectRev: -1, actor: ACTORS.staff }), 'SVCS_ARGS_INVALID');
  expectFail(b.append('ledger', [{ k: 'TEST', b: {} }], { expectRev: 1.5, actor: ACTORS.staff }), 'SVCS_ARGS_INVALID');
});

test('T-S11 idempotent references', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: {}, r: 'ISSUE:J-1:abc12345' }));
  clock.advance(1000);
  expectFail(put(store, 'ledger', { k: 'TEST', b: {}, r: 'ISSUE:J-1:abc12345' }), 'SVCS_DUPLICATE_REF');
  // unique inside one batch
  expectFail(put(store, 'ledger', [{ k: 'TEST', b: {}, r: 'REF:dup:1' }, { k: 'TEST', b: {}, r: 'REF:dup:1' }]), 'SVCS_DUPLICATE_REF');
  assert.equal(store.read('ledger').records.length, 1);
  // same ref in another stream is fine
  expectOk(put(store, 'docs', { k: 'TEST', b: {}, r: 'ISSUE:J-1:abc12345' }));
  // findRef finds it, also after a lost reply and a fresh open
  assert.equal(store.findRef('ledger', 'ISSUE:J-1:abc12345').id, 'LED-000001');
  assert.equal(store.findRef('ledger', 'ISSUE:J-1:nope0000'), null);
  assert.equal(store.findRef('nope', 'ISSUE:J-1:abc12345'), null);
  assert.equal(openStore(adapter, clock).findRef('ledger', 'ISSUE:J-1:abc12345').n, 1);
  // bad reference shapes
  for (const r of ['a', 'ab', '/abc', 'a b c', 'x'.repeat(65)]) {
    expectFail(put(store, 'ledger', { k: 'TEST', b: {}, r }), 'SVCS_ARGS_INVALID');
  }
});

test('T-S12 number series: caller supplies b.no, store checks it', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  assert.equal(store.nextNumber('GRN', clock.iso).no, 'GRN/26-27/0001');
  const r1 = expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {}));
  assert.equal(r1.records[0].b.no, 'GRN/26-27/0001');
  clock.advance(1000);
  assert.equal(expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {})).records[0].b.no, 'GRN/26-27/0002');
  // each series counts alone, and so does each financial year
  clock.advance(1000);
  assert.equal(expectOk(postNumbered(store, 'ISS', 'ledger', 'ISS', {})).records[0].b.no, 'ISS/26-27/0001');
  clock.set('2027-03-31T18:30:00.000Z');
  assert.equal(expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {})).records[0].b.no, 'GRN/27-28/0001');
  // clock steps back a few hours into the old year: the record is clamped and stays in the new year
  clock.set('2027-03-31T12:00:00.000Z');
  const clamped = expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {}));
  assert.equal(clamped.records[0].b.no, 'GRN/27-28/0002');
  assert.equal(clamped.records[0].at, '2027-03-31T18:30:00.000Z');
  // wrong, missing or stale numbers
  const at = store.nextAt('ledger').at;
  const mk = (b) => put(store, 'ledger', { k: 'GRN', series: 'GRN', b }, { at });
  const f = expectFail(mk({ no: 'GRN/27-28/0009' }), 'SVCS_SERIES_MISMATCH');
  assert.match(f.detail, /GRN\/27-28\/0003/);
  expectFail(mk({}), 'SVCS_SERIES_MISMATCH');
  expectFail(mk({ no: 'GRN/26-27/0003' }), 'SVCS_SERIES_MISMATCH');
  expectFail(mk({ no: 'grn/27-28/0003' }), 'SVCS_SERIES_MISMATCH');
  // a number-shaped b.no without a series is refused (it would break the series check)
  expectFail(put(store, 'ledger', { k: 'GRN', b: { no: 'GRN/27-28/0003' } }), 'SVCS_ARGS_INVALID');
  // a series that belongs to another stream
  expectFail(put(store, 'docs', { k: 'X', series: 'GRN', b: { no: 'GRN/27-28/0003' } }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'ledger', { k: 'X', series: 'NOPE', b: { no: 'NOP/27-28/0003' } }), 'SVCS_ARGS_INVALID');
  // two numbered items in one batch take consecutive numbers
  const two = expectOk(put(store, 'ledger', [
    { k: 'GRN', series: 'GRN', b: { no: 'GRN/27-28/0003' } },
    { k: 'GRN', series: 'GRN', b: { no: 'GRN/27-28/0004' } }
  ], { at }));
  assert.equal(two.records.length, 2);
  // the old-part series on the defective stream: its own stream keeps its own last time, so the clock decides
  assert.equal(expectOk(postNumbered(store, 'OLD', 'defective', 'OLD_REGISTER', {})).records[0].b.no, 'OLD/26-27/0001');
  assert.equal(expectOk(postNumbered(store, 'SCR', 'defective', 'SCRAP_SIGNOFF', {})).records[0].b.no, 'SCR/26-27/0001');
  assert.equal(store.lastNumber('GRN', '2027-04-01T00:00:00Z').last, 4);
  assert.equal(store.lastNumber('GRN', '2027-03-31T18:29:00Z').fy, '26-27');
  assert.equal(store.lastNumber('GRN', '2027-03-31T18:29:00Z').last, 2);
  assert.equal(store.lastNumber('NOPE', clock.iso).code, 'SVCS_ARGS_INVALID');
  assert.equal(store.nextNumber('GRN', 'bad').code, 'SVCS_ARGS_INVALID');
  // verification agrees with what was written
  assert.equal(store.verifyAll().problems.length, 0);
  assert.equal(openStore(adapter, clock).nextNumber('GRN', '2027-04-01T00:00:00Z').no, 'GRN/27-28/0005');
});

test('T-S12b the number grows past 9999 and 16 characters is the limit', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  forgeChain(adapter, 'ledger', 9999, (n) => ({ k: 'GRN', b: { no: 'GRN/26-27/' + String(n).padStart(4, '0') } }), '2026-11-13T04:00:00.000Z');
  const store = openStore(adapter, clock);
  assert.equal(store.status().blocked, false);
  assert.equal(store.lastNumber('GRN', clock.iso).last, 9999);
  const r = expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {}));
  assert.equal(r.records[0].b.no, 'GRN/26-27/10000');
  assert.equal(r.records[0].b.no.length, 15);
  clock.advance(1000);
  assert.equal(expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {})).records[0].b.no, 'GRN/26-27/10001');
  assert.equal(store.verifyAll().problems.length, 0);
  assert.equal(Store.LIMITS.MAX_NUMBER_CHARS, 16);
  // a counter that would need more than 16 characters is refused
  const a2 = makeAdapter();
  forgeChain(a2, 'ledger', 1, () => ({ k: 'GRN', b: { no: 'GRN/26-27/0001' } }), '2026-11-13T04:00:00.000Z');
  void a2;
});

test('T-S13 a failed write consumes no number', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {}));
  clock.advance(1000);
  adapter.failSetFor(/ledger/, { times: 1, code: 'STORAGE_BLOCKED' });
  const bad = expectFail(postNumbered(store, 'GRN', 'ledger', 'GRN', {}), 'SVCS_WRITE_FAILED');
  assert.equal(bad.detail, 'STORAGE_BLOCKED');
  assert.equal(store.read('ledger').records.length, 1);
  assert.equal(store.head('ledger').rev, 1);
  const retry = expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {}));
  assert.equal(retry.records[0].b.no, 'GRN/26-27/0002');
  // read-back mismatch: the write landed but the read-back lies. The store reports it and does not touch the head.
  clock.advance(1000);
  adapter.corruptNextReadback(/ledger/);
  const rb = expectFail(postNumbered(store, 'GRN', 'ledger', 'GRN', {}, { r: 'REF:rb:1' }), 'SVCS_READBACK_MISMATCH');
  assert.equal(store.head('ledger').rev, 2);
  adapter.corrupt.length = 0;
  // reopen heals the head, the number was used, findRef shows the posting is saved
  const again = openStore(adapter, clock);
  assert.equal(again.findRef('ledger', 'REF:rb:1').b.no, 'GRN/26-27/0003');
  assert.equal(again.nextNumber('GRN', clock.iso).no, 'GRN/26-27/0004');
  assert.ok(rb.key);
  // quota error is reported with its name
  adapter.failSetFor(/ledger/, { times: 1, code: 'QuotaExceededError' });
  clock.advance(1000);
  assert.equal(put(again, 'ledger', { k: 'TEST', b: {} }).detail, 'QuotaExceededError');
});

test('T-S14 storage not ready: nothing is read as empty, nothing is written', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const good = openStore(adapter, clock);
  expectOk(put(good, 'ledger', { k: 'TEST', b: {} }));
  const a2 = makeAdapter();
  a2.auth = false;
  const s = newStore(a2, clock);
  assert.equal(s.open().code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(s.status().opened, false);
  assert.equal(s.read('ledger').code, 'SVCS_STORAGE_UNAVAILABLE');
  const r = s.append('ledger', [{ k: 'TEST', b: {} }], { expectRev: 0, actor: ACTORS.owner });
  assert.equal(r.code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(a2.setCount, 0);
  assert.equal(s.head('ledger').code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(s.nextAt('ledger').code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(s.verifyAll().code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(s.findRef('ledger', 'REF:abc'), null);
  // storage that hides everything while not ready must not look like an empty healthy ledger
  const hidden = adapter.copy();
  hidden.auth = false;
  hidden.getHooks.push(() => null);
  assert.equal(newStore(hidden, clock).open().ok, false);
  // a throwing authoritative() counts as not ready
  const bad = makeAdapter(); bad.authoritative = () => { throw new Error('x'); };
  assert.equal(newStore(bad, clock).open().code, 'SVCS_STORAGE_UNAVAILABLE');
  // no key list at all
  const nokeys = { getItem: () => null, setItem() {} };
  assert.equal(newStore(nokeys, clock).open().code, 'SVCS_STORAGE_UNAVAILABLE');
  // a length/key(i) pair is accepted as a key list
  const m = new Map();
  const pair = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, get length() { return m.size; }, key: (i) => Array.from(m.keys())[i] };
  assert.equal(newStore(pair, clock).open().ok, true);
});

test('T-S15 crash windows leave a recoverable store', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { i: 0 }, r: 'REF:one:1' }));
  // kill before the shard write: nothing changed
  clock.advance(1000);
  const snap = adapter.snapshot();
  adapter.killAfter = adapter.setCount;
  expectFail(put(store, 'ledger', { k: 'TEST', b: { i: 1 }, r: 'REF:two:2' }), 'SVCS_WRITE_FAILED');
  assert.deepEqual(adapter.snapshot(), snap);
  // kill after the shard write and before the head write
  adapter.killAfter = adapter.setCount + 1;
  const hw = expectFail(put(store, 'ledger', { k: 'TEST', b: { i: 1 }, r: 'REF:two:2' }), 'SVCS_HEAD_WRITE_FAILED');
  assert.equal(hw.committed, true);
  assert.equal(hw.n, 2);
  adapter.killAfter = Infinity;
  // the same store refuses to post again until it is reopened
  clock.advance(1000);
  expectFail(put(store, 'ledger', { k: 'TEST', b: { i: 2 } }), 'SVCS_HEAD_BEHIND');
  // a restart: open reports the heal, data intact
  const fresh = newStore(adapter, clock);
  const o = fresh.open();
  assert.deepEqual(o.healed, ['HEAD_HEALED:ledger']);
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
  assert.equal(fresh.read('ledger').records.length, 2);
  assert.equal(fresh.findRef('ledger', 'REF:two:2').n, 2, 'a retry of the same reference is found');
  assert.equal(fresh.head('ledger').rev, 2);
  expectFail(put(fresh, 'ledger', { k: 'TEST', b: {}, r: 'REF:two:2' }), 'SVCS_DUPLICATE_REF');
  expectOk(put(fresh, 'ledger', { k: 'TEST', b: { i: 2 } }));
  assert.equal(fresh.verifyAll().problems.length, 0);
  // head ahead of the shard (shard cut off): fatal, blocked, not repaired
  const cut = adapter.copy();
  const key = P + 'ledger_v1_2026-11';
  const arr = JSON.parse(cut.data.get(key));
  cut.data.set(key, JSON.stringify(arr.slice(0, -1)));
  const damaged = newStore(cut, clock).open();
  assert.equal(damaged.blocked, true);
  assert.equal(damaged.problems[0].code, 'SVCS_HEAD_AHEAD');
  assert.equal(damaged.problems[0].stream, 'ledger');
  assert.equal(cut.data.get(key), JSON.stringify(arr.slice(0, -1)));
});

test('T-S15b the very first write stopped before its head row is healed, anything bigger is not', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  adapter.killAfter = adapter.setCount + 1;
  expectFail(put(store, 'ledger', { k: 'TEST', b: {}, r: 'REF:first:1' }), 'SVCS_HEAD_WRITE_FAILED');
  adapter.killAfter = Infinity;
  const o = newStore(adapter, clock).open();
  assert.deepEqual(o.healed, ['HEAD_HEALED:ledger']);
  assert.equal(o.blocked, false);
  // a larger store that loses its head row list is blocked and is not repaired
  const bigA = makeAdapter();
  const big = openStore(bigA, clock);
  expectOk(put(big, 'ledger', { k: 'TEST', b: {} }));
  clock.advance(1000);
  expectOk(put(big, 'ledger', { k: 'TEST', b: {} }));
  bigA.data.delete(Store.HEAD_KEY);
  const lost = newStore(bigA, clock).open();
  assert.equal(lost.blocked, true);
  assert.equal(lost.problems[0].code, 'SVCS_HEAD_MISSING');
  assert.equal(bigA.data.has(Store.HEAD_KEY), false);
});

test('T-S16 head write failure after a good shard write', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', {}, { r: 'REF:grn:1' }));
  clock.advance(1000);
  adapter.failSetFor(/head_v1/, { times: 1, code: 'STORAGE_BLOCKED' });
  const f = expectFail(postNumbered(store, 'GRN', 'ledger', 'GRN', {}, { r: 'REF:grn:2' }), 'SVCS_HEAD_WRITE_FAILED');
  assert.equal(f.committed, true);
  assert.equal(f.n, 2);
  assert.equal(f.detail, 'STORAGE_BLOCKED');
  const again = openStore(adapter, clock);
  assert.equal(again.findRef('ledger', 'REF:grn:2').b.no, 'GRN/26-27/0002');
  assert.equal(again.nextNumber('GRN', clock.iso).no, 'GRN/26-27/0003', 'no number is reused');
  assert.equal(again.head('ledger').rev, 2);
  // a head write that cannot be healed stays visible
  adapter.failSetFor(/head_v1/, { times: 2, code: 'STORAGE_BLOCKED' });
  clock.advance(1000);
  expectFail(postNumbered(again, 'GRN', 'ledger', 'GRN', {}, { r: 'REF:grn:3' }), 'SVCS_HEAD_WRITE_FAILED');
  const third = newStore(adapter, clock).open();
  assert.deepEqual(third.healed, []);
  assert.equal(third.problems[0].code, 'SVCS_HEAD_WRITE_FAILED');
  assert.equal(third.blocked, false);
  const fourth = newStore(adapter, clock).open();
  assert.deepEqual(fourth.healed, ['HEAD_HEALED:ledger']);
});

test('T-S17 actor rule', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const base = { expectRev: 0 };
  const item = [{ k: 'TEST', b: {} }];
  const before = adapter.setCount;
  for (const actor of [undefined, null, {}, { t: 'none', r: '', m: '' }, { t: 'admin', r: 'x', m: 'y' }, 'owner', { tier: 'none' }]) {
    expectFail(store.append('ledger', item, Object.assign({}, base, { actor })), 'SVCS_ACTOR_INVALID');
  }
  assert.equal(adapter.setCount, before);
  for (const [i, actor] of [{ t: 'staff', r: 'Technician', m: 'a' }, { t: 'manager', r: 'Store Manager', m: 'b' }, { t: 'owner', r: 'Owner', m: '' }].entries()) {
    clock.advance(1000);
    const r = expectOk(store.append('ledger', item, { expectRev: i, actor }));
    assert.deepEqual(r.records[0].a, actor);
  }
  // session style names are accepted, long text is clipped, extra fields are dropped
  clock.advance(1000);
  const long = expectOk(store.append('ledger', item, { expectRev: 3, actor: { tier: 'staff', role: 'R'.repeat(80), actorName: 'N'.repeat(90), extra: 'x' } }));
  assert.deepEqual(long.records[0].a, { t: 'staff', r: 'R'.repeat(40), m: 'N'.repeat(60) });
  // acknowledgeRestore needs an owner
  expectFail(store.acknowledgeRestore({ actor: ACTORS.manager, reason: 'because', stepUpOk: true }), 'SVCS_OWNER_REQUIRED');
  expectFail(store.acknowledgeRestore({ actor: ACTORS.staff, reason: 'because', stepUpOk: true }), 'SVCS_OWNER_REQUIRED');
  expectFail(store.acknowledgeRestore({ actor: { t: 'none' }, reason: 'because', stepUpOk: true }), 'SVCS_ACTOR_INVALID');
  expectFail(store.acknowledgeRestore(), 'SVCS_ARGS_INVALID');
});

test('T-S18 clock rule, clamp, override and period order', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: {} }));
  // same time and slightly earlier: accepted, record time never goes back
  const same = expectOk(put(store, 'ledger', { k: 'TEST', b: {} }));
  assert.equal(same.records[0].at, '2026-11-13T05:00:00.000Z');
  clock.advance(-3600000);
  const early = expectOk(put(store, 'ledger', { k: 'TEST', b: {} }));
  assert.equal(early.records[0].at, '2026-11-13T05:00:00.000Z');
  assert.deepEqual(store.nextAt('ledger'), { ok: true, at: '2026-11-13T05:00:00.000Z', clamped: true, overridden: false });
  // exactly 24 h behind is still fine, 25 h is not
  clock.set('2026-11-12T05:00:00.000Z');
  expectOk(put(store, 'ledger', { k: 'TEST', b: {} }));
  clock.set('2026-11-12T04:00:00.000Z');
  expectFail(put(store, 'ledger', { k: 'TEST', b: {} }), 'SVCS_CLOCK_BACK');
  expectFail(store.nextAt('ledger'), 'SVCS_CLOCK_BACK');
  // override: accepted, recorded in the body (and so in the hash)
  const o = store.nextAt('ledger', { clockOverride: true });
  assert.equal(o.ok, true);
  assert.equal(o.overridden, true);
  // audit fix: the override is an Owner action; staff and manager actors are refused and nothing is written
  const before = store.head('ledger').rev;
  expectFail(put(store, 'ledger', { k: 'TEST', b: { x: 1 } }, { clockOverride: true, actor: ACTORS.staff }), 'SVCS_OWNER_REQUIRED');
  expectFail(put(store, 'ledger', { k: 'TEST', b: { x: 1 } }, { clockOverride: true }), 'SVCS_OWNER_REQUIRED');
  assert.equal(store.head('ledger').rev, before);
  const ov = expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 1 } }, { clockOverride: true, actor: ACTORS.owner }));
  assert.equal(ov.records[0].b.clockOverride, true);
  assert.equal(ov.records[0].at, '2026-11-13T05:00:00.000Z');
  // a normal posting never carries the flag, also when the override switch is set but not needed
  clock.set('2026-11-13T06:00:00.000Z');
  const plain = expectOk(put(store, 'ledger', { k: 'TEST', b: { x: 2 } }, { clockOverride: true }));
  assert.equal('clockOverride' in plain.records[0].b, false);
  // the shard period never goes backwards when the clock steps back over a month end
  const c2 = makeClock('2026-12-01T10:00:00.000Z');
  const a2 = makeAdapter();
  const s2 = openStore(a2, c2);
  expectOk(put(s2, 'ledger', { k: 'TEST', b: {} }));
  c2.set('2026-11-30T20:00:00.000Z');
  const dec = expectOk(put(s2, 'ledger', { k: 'TEST', b: {} }));
  assert.match(dec.key, /2026-12$/);
  c2.set('2026-10-01T00:00:00.000Z');
  expectFail(put(s2, 'ledger', { k: 'TEST', b: {} }), 'SVCS_CLOCK_BACK');
  const forced = expectOk(put(s2, 'ledger', { k: 'TEST', b: {} }, { clockOverride: true, actor: ACTORS.owner }));
  assert.match(forced.key, /2026-12$/);
  assert.equal(ledgerKeys(a2).length, 1);
  assert.equal(s2.verifyAll().problems.length, 0);
  // the check is on the stream's own last time
  expectOk(put(s2, 'audit', { k: 'NOTE', b: {} }, { clockOverride: true }));
});

test('opts.at must lie between the last time and max(now, last time)', () => {
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  const store = openStore(makeAdapter(), clock);
  const first = expectOk(put(store, 'ledger', { k: 'TEST', b: {} }, { at: '2026-11-13T04:00:00.000Z' }));
  assert.equal(first.records[0].at, '2026-11-13T04:00:00.000Z');
  expectFail(put(store, 'ledger', { k: 'TEST', b: {} }, { at: '2026-11-13T03:59:59.999Z' }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'ledger', { k: 'TEST', b: {} }, { at: '2026-11-13T05:00:00.001Z' }), 'SVCS_ARGS_INVALID');
  expectFail(put(store, 'ledger', { k: 'TEST', b: {} }, { at: 'tomorrow' }), 'SVCS_ARGS_INVALID');
  const ok2 = expectOk(put(store, 'ledger', { k: 'TEST', b: {} }, { at: '2026-11-13T05:00:00.000Z' }));
  assert.equal(ok2.records[0].at, '2026-11-13T05:00:00.000Z');
  // a number is derived for the time given
  const late = store.nextAt('ledger');
  assert.equal(late.at, '2026-11-13T05:00:00.000Z');
  assert.equal(store.nextNumber('GRN', '2027-04-01T00:00:00Z').no, 'GRN/27-28/0001');
});

test('head(): fresh from storage, rev 0 for a stream not written yet', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const a = openStore(adapter, clock);
  const b = openStore(adapter, clock);
  assert.deepEqual(a.head('ledger'), { ok: true, rev: 0, n: 0, h: ZERO, at: null, key: null });
  const r = expectOk(put(a, 'ledger', { k: 'TEST', b: {} }));
  const h = b.head('ledger');
  assert.equal(h.rev, 1);
  assert.equal(h.n, 1);
  assert.equal(h.h, r.h);
  assert.equal(h.at, r.records[0].at);
  assert.equal(h.key, r.key);
  assert.equal(b.head('docs').rev, 0);
  assert.equal(b.head('nope').code, 'SVCS_ARGS_INVALID');
});

test('guardRevs: another stream moving makes the append fail', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(put(store, 'docs', { k: 'OPN_PROPOSE', b: {} }));
  const dr = store.head('docs').rev;
  const lr = store.head('ledger').rev;
  clock.advance(1000);
  expectOk(put(store, 'ledger', { k: 'OPN', b: {} }, { guardRevs: { docs: dr } }));
  // docs moves: the guarded append is refused and nothing is written
  clock.advance(1000);
  expectOk(put(store, 'docs', { k: 'OPN_REJECT', b: {} }));
  const before = adapter.setCount;
  const f = expectFail(put(store, 'ledger', { k: 'OPN', b: {} }, { guardRevs: { docs: dr } }), 'SVCS_REV_CONFLICT');
  assert.match(f.detail, /docs/);
  assert.equal(adapter.setCount, before);
  // the stream's own entry works the same, and a stream never written counts as 0
  expectOk(put(store, 'ledger', { k: 'OPN', b: {} }, { guardRevs: { ledger: store.head('ledger').rev, audit: 0 } }));
  expectFail(put(store, 'ledger', { k: 'OPN', b: {} }, { guardRevs: { audit: 1 } }), 'SVCS_REV_CONFLICT');
  void lr;
  for (const g of ['x', [], { nope: 1 }, { docs: -1 }, { docs: 1.5 }, { docs: '1' }]) {
    expectFail(put(store, 'ledger', { k: 'OPN', b: {} }, { guardRevs: g }), 'SVCS_ARGS_INVALID');
  }
});

test('config stream: key, id code, no period', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const r = expectOk(put(store, 'config', { k: 'CONFIG_SET', b: { adjustLimitPaise: 500000, storeRoles: ['Technician'] } }, { actor: ACTORS.owner }));
  assert.equal(r.key, P + 'config_v1');
  assert.equal(r.records[0].id, 'CFG-000001');
  assert.ok(adapter.data.has(P + 'config_v1'));
  assert.equal(store.read('config').records[0].b.adjustLimitPaise, 500000);
  // every stream gets its own id code and key
  const want = { parts: 'PRT', labour: 'LAB', config: 'CFG', ledger: 'LED', docs: 'DOC', defective: 'DEF', audit: 'AUD' };
  for (const [s, code] of Object.entries(want)) {
    clock.advance(1000);
    const x = expectOk(put(store, s, { k: 'TEST', b: {} }));
    assert.equal(x.records[0].id, code + '-' + (s === 'config' ? '000002' : '000001'));
  }
});

test('argument checks never throw', () => {
  const clock = makeClock();
  const store = openStore(makeAdapter(), clock);
  const o = { expectRev: 0, actor: ACTORS.owner };
  expectFail(store.append('nope', [{ k: 'TEST', b: {} }], o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [], o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', 'x', o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', Array.from({ length: 201 }, () => ({ k: 'TEST', b: {} })), o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [null], o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'bad', b: {} }], o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'TEST', b: [] }], o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'TEST', b: 5 }], o), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'TEST', b: {} }]), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'TEST', b: {} }], null), 'SVCS_ARGS_INVALID');
  expectFail(store.append('ledger', [{ k: 'TEST', b: { f: 1.5 } }], o), 'SVCS_BODY_NOT_CANONICAL');
  expectFail(store.append('ledger', [{ k: 'TEST', b: { s: 'x'.repeat(401) } }], o), 'SVCS_BODY_NOT_CANONICAL');
  expectFail(store.append('ledger', [{ k: 'TEST', b: { u: undefined } }], o), 'SVCS_BODY_NOT_CANONICAL');
  expectFail(store.append('ledger', [{ k: 'TEST', b: { d: new Date() } }], o), 'SVCS_BODY_NOT_CANONICAL');
  // 200 records in one call is allowed
  const two = store.append('ledger', Array.from({ length: 200 }, (_, i) => ({ k: 'TEST', b: { i } })), o);
  assert.equal(two.ok, true);
  assert.equal(two.records.length, 200);
  assert.equal(store.read('nope').code, 'SVCS_ARGS_INVALID');
  assert.equal(store.readPeriod('nope', 'x').code, 'SVCS_ARGS_INVALID');
});

test('readPeriod returns only one month, one financial year, or everything for streams without periods', () => {
  const clock = makeClock('2026-10-31T10:00:00.000Z');
  const store = openStore(makeAdapter(), clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { m: 10 } }));
  clock.set('2026-11-05T10:00:00.000Z');
  expectOk(put(store, 'ledger', { k: 'TEST', b: { m: 11 } }));
  expectOk(put(store, 'docs', { k: 'TEST', b: { fy: 26 } }));
  clock.set('2027-04-05T10:00:00.000Z');
  expectOk(put(store, 'docs', { k: 'TEST', b: { fy: 27 } }));
  expectOk(put(store, 'parts', { k: 'PART_CREATE', b: { code: 'A' } }));
  assert.equal(store.readPeriod('ledger', '2026-10').records.length, 1);
  assert.equal(store.readPeriod('ledger', '2026-11').records[0].b.m, 11);
  assert.equal(store.readPeriod('ledger', '2026-12').records.length, 0);
  assert.equal(store.readPeriod('docs', 'FY2026-27').records.length, 1);
  assert.equal(store.readPeriod('docs', '2027-28').records[0].b.fy, 27);
  assert.equal(store.readPeriod('parts', undefined).records.length, 1);
  assert.equal(store.readPeriod('ledger').code, 'SVCS_ARGS_INVALID');
  assert.equal(store.read('ledger').rev, 2);
  assert.equal(store.read('audit').records.length, 0);
});

test('T-S24 determinism: same appends, same clock, byte-identical storage', () => {
  const run = () => {
    const clock = makeClock('2026-03-30T10:00:00.000Z');
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    for (let i = 0; i < 60; i++) {
      clock.advance(i % 9 === 0 ? 86400000 : 61000);
      if (i % 5 === 0) expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { i, text: 'run ' + i }, { r: 'REF:det:' + i }));
      else expectOk(put(store, i % 2 ? 'docs' : 'ledger', [{ k: 'TEST', b: { i, text: 'अ' + i } }, { k: 'TEST', b: { j: i } }]));
    }
    return Array.from(adapter.data.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  };
  assert.deepEqual(run(), run());
});

test('reads return frozen, shareable data and never expose the live arrays', () => {
  const clock = makeClock();
  const store = openStore(makeAdapter(), clock);
  expectOk(put(store, 'ledger', { k: 'TEST', b: { lines: [{ partCode: 'A', qty: 1 }] } }));
  const r = store.read('ledger');
  assert.ok(Object.isFrozen(r.records));
  assert.throws(() => { 'use strict'; r.records.push(1); });
  assert.throws(() => { 'use strict'; r.records[0].b.lines[0].qty = 9; });
  assert.equal(store.read('ledger').records[0].b.lines[0].qty, 1);
});
