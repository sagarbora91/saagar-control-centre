// Service Stores store: damage detection, blocked state, watermark, replay hook (T-S19 to T-S21).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, makeAdapter, makeClock, newStore, openStore, put, expectFail, expectOk, buildHealthy, forgeChain
} from './lib/svc1-store-harness.mjs';

const P = Store.SVCS_PREFIX;
const K9 = P + 'ledger_v1_2026-09';
const K10 = P + 'ledger_v1_2026-10';
const K11 = P + 'ledger_v1_2026-11';
const NL = String.fromCharCode(10);

function healthy() {
  const h = buildHealthy();
  // every case works on its own copy
  return { adapter: h.adapter.copy(), clock: h.clock };
}

function recHash(stream, rec) {
  return Store.sha256Hex([stream, rec.p, rec.n, rec.at, rec.k, rec.r || '', Store.canonicalText(rec.a), Store.canonicalText(rec.b)].join(NL));
}

test('the healthy fixture itself verifies clean', () => {
  const h = buildHealthy();
  const v = h.store.verifyAll();
  assert.equal(v.ok, true);
  assert.deepEqual(v.problems, []);
  assert.equal(v.blocked, false);
  assert.equal(v.watermark, 'OK');
  assert.deepEqual(h.adapter.svcsKeys().map((k) => k.replace(P, '')).sort(), [
    'audit_v1_2026-09', 'audit_v1_2026-10', 'audit_v1_2026-11', 'config_v1', 'defective_v1', 'docs_v1_FY2026-27', 'head_v1',
    'labour_v1', 'ledger_v1_2026-09', 'ledger_v1_2026-10', 'ledger_v1_2026-11', 'parts_v1'
  ]);
  assert.equal(v.summary.counts.ledger, 18);
  assert.equal(v.streams.ledger.parts, 3);
  const fresh = newStore(h.adapter, h.clock).open();
  assert.deepEqual(fresh.problems, []);
  assert.deepEqual(fresh.healed, []);
});

const CASES = [
  ['flip one character in a body', (a) => { a.data.set(K10, a.data.get(K10).replace('"unitCostPaise":1008', '"unitCostPaise":1009')); }, 'SVCS_CHAIN_BREAK', K10, 8],
  ['truncate the JSON', (a) => { a.data.set(K10, a.data.get(K10).slice(0, -50)); }, 'SVCS_SHARD_NOT_ARRAY', K10, null],
  ['replace a shard with {}', (a) => { a.data.set(K10, '{}'); }, 'SVCS_SHARD_NOT_ARRAY', K10, null],
  ['delete a middle shard', (a) => { a.data.delete(K10); }, 'SVCS_SEQ_GAP', K11, 13],
  ['delete the last shard', (a) => { a.data.delete(K11); }, 'SVCS_HEAD_AHEAD', K11, 18],
  ['delete the head', (a) => { a.data.delete(Store.HEAD_KEY); }, 'SVCS_HEAD_MISSING', Store.HEAD_KEY, null],
  ['duplicate a record', (a) => { const arr = JSON.parse(a.data.get(K10)); arr.splice(2, 0, arr[1]); a.data.set(K10, JSON.stringify(arr)); }, 'SVCS_SEQ_GAP', K10, 8],
  ['swap two whole records', (a) => { const arr = JSON.parse(a.data.get(K10)); [arr[1], arr[2]] = [arr[2], arr[1]]; a.data.set(K10, JSON.stringify(arr)); }, 'SVCS_SEQ_GAP', K10, 9],
  ['swap the bodies of two records', (a) => { const arr = JSON.parse(a.data.get(K10)); const t = arr[1].b; arr[1].b = arr[2].b; arr[2].b = t; a.data.set(K10, JSON.stringify(arr)); }, 'SVCS_CHAIN_BREAK', K10, 8],
  ['paste a record from another stream', (a) => {
    const other = makeAdapter();
    forgeChain(other, 'docs', 8, (n) => ({ k: 'GRN', b: { n } }));
    const docs8 = JSON.parse(other.data.get(Store.shardKey('docs', '2026-11-13T05:00:00.000Z', 1)))[7];
    const arr = JSON.parse(a.data.get(K10)); arr[1] = docs8; a.data.set(K10, JSON.stringify(arr));
  }, 'SVCS_CHAIN_BREAK', K10, 8],
  ['edit a record and fix its own hash', (a) => {
    const arr = JSON.parse(a.data.get(K10));
    arr[1].b.qty = 99; arr[1].h = recHash('ledger', arr[1]);
    a.data.set(K10, JSON.stringify(arr));
  }, 'SVCS_CHAIN_BREAK', K10, 9],
  ['edit the last record and fix its own hash (head no longer matches)', (a) => {
    const arr = JSON.parse(a.data.get(K11)); const last = arr[arr.length - 1];
    last.b.qty = 99; last.h = recHash('ledger', last);
    a.data.set(K11, JSON.stringify(arr));
  }, 'SVCS_CHAIN_BREAK', null, 18],
  ['a record with an extra field', (a) => { const arr = JSON.parse(a.data.get(K9)); arr[0].extra = 1; a.data.set(K9, JSON.stringify(arr)); }, 'SVCS_CHAIN_BREAK', K9, 1],
  ['a record with a float in its body', (a) => { a.data.set(K9, a.data.get(K9).replace('"qty":1,', '"qty":1.5,')); }, 'SVCS_CHAIN_BREAK', K9, 1],
  ['a shard that is JSON null', (a) => { a.data.set(K9, 'null'); }, 'SVCS_SHARD_NOT_ARRAY', K9, null],
  ['an empty-text shard', (a) => { a.data.set(K9, ''); }, 'SVCS_SHARD_NOT_ARRAY', K9, null],
  ['the head is not an array', (a) => { a.data.set(Store.HEAD_KEY, '{}'); }, 'SVCS_SHARD_NOT_ARRAY', Store.HEAD_KEY, null],
  ['the head has a duplicate row', (a) => { const h = JSON.parse(a.data.get(Store.HEAD_KEY)); h.push(h[0]); a.data.set(Store.HEAD_KEY, JSON.stringify(h)); }, 'SVCS_HEAD_INVALID', Store.HEAD_KEY, null],
  ['the head has a bad row', (a) => { const h = JSON.parse(a.data.get(Store.HEAD_KEY)); h[0].n = 1.5; a.data.set(Store.HEAD_KEY, JSON.stringify(h)); }, 'SVCS_HEAD_INVALID', Store.HEAD_KEY, null],
  ['the head claims a stream that has no shard', (a) => { for (const k of a.svcsKeys()) if (/defective/.test(k)) a.data.delete(k); }, 'SVCS_HEAD_AHEAD', null, 1],
  ['the head hash differs from the chain', (a) => { const h = JSON.parse(a.data.get(Store.HEAD_KEY)); const r = h.find((x) => x.s === 'ledger'); r.h = '1'.repeat(64); a.data.set(Store.HEAD_KEY, JSON.stringify(h)); }, 'SVCS_CHAIN_BREAK', null, 18],
  ['the same reference used twice', (a) => {
    const arr = JSON.parse(a.data.get(K9)); arr[1].r = arr[0].r;
    // keep the chain valid so only the reference rule can fire
    for (let i = 1; i < arr.length; i++) { arr[i].p = arr[i - 1].h; arr[i].h = recHash('ledger', arr[i]); }
    a.data.set(K9, JSON.stringify(arr));
  }, 'SVCS_DUPLICATE_REF', K9, 2]
];

test('T-S19 damage detection: each case alone on a copy of a healthy 3-month store', () => {
  for (const [name, mutate, code, key, n] of CASES) {
    const { adapter, clock } = healthy();
    mutate(adapter);
    // the head-hash case also needs the chain of the other streams to stay as is
    const damaged = new Map(adapter.data);
    const v = newStore(adapter, clock).verifyAll();
    assert.equal(v.ok, true, name);
    assert.equal(v.blocked, true, name);
    const p = v.problems[0];
    assert.equal(p.code, code, name + ': ' + JSON.stringify(v.problems));
    if (key) assert.equal(p.key, key, name);
    if (n !== null) assert.equal(p.n, n, name);
    if (!/head|defective|Head/.test(name) || /hash differs/.test(name)) assert.ok(p.stream === 'ledger' || p.stream === null, name);
    // the damaged text is never repaired
    assert.deepEqual(adapter.data, damaged, name + ': storage must stay as found');
  }
});

test('T-S19b problems carry no business data, only codes, keys and counts', () => {
  const { adapter, clock } = healthy();
  adapter.data.set(K10, adapter.data.get(K10).replace('"unitCostPaise":1008', '"unitCostPaise":1009'));
  const v = newStore(adapter, clock).open();
  for (const p of v.problems) {
    assert.ok(Object.isFrozen(p));
    assert.ok(p.detail.length < 120);
    assert.ok(!/receipt|Test Keeper|Store Manager/.test(JSON.stringify(p)));
  }
});

test('T-S20 blocked state: writes stop, the damaged stream shows nothing, clean streams still read', () => {
  const { adapter, clock } = healthy();
  adapter.data.set(K10, adapter.data.get(K10).replace('"unitCostPaise":1008', '"unitCostPaise":1009'));
  const damagedText = adapter.data.get(K10);
  const store = newStore(adapter, clock);
  const o = store.open();
  assert.equal(o.blocked, true);
  assert.equal(store.status().blocked, true);
  assert.equal(adapter.data.get(K10), damagedText, 'never repaired by open');
  const before = adapter.setCount;
  for (const s of Object.keys(Store.STREAMS)) {
    const h = store.head(s);
    expectFail(store.append(s, [{ k: 'TEST', b: {} }], { expectRev: h.rev, actor: ACTORS.owner }), 'SVCS_BLOCKED');
  }
  assert.equal(adapter.setCount, before);
  expectFail(store.read('ledger'), 'SVCS_BLOCKED');
  expectFail(store.readPeriod('ledger', '2026-09'), 'SVCS_BLOCKED');
  assert.equal(store.findRef('ledger', 'REF:grn:1'), null);
  assert.equal(store.nextNumber('GRN', clock.iso).code, 'SVCS_BLOCKED');
  assert.equal(store.read('docs').records.length, 3);
  assert.equal(store.read('parts').records.length, 2);
  // a global problem (head gone) blocks the reads of every stream
  const b = healthy();
  b.adapter.data.delete(Store.HEAD_KEY);
  const s2 = newStore(b.adapter, b.clock);
  assert.equal(s2.open().blocked, true);
  for (const s of Object.keys(Store.STREAMS)) expectFail(s2.read(s), 'SVCS_BLOCKED');
  // acknowledging is not possible for data damage
  expectFail(store.acknowledgeRestore({ actor: ACTORS.owner, reason: 'trying anyway', stepUpOk: true }), 'SVCS_ACK_NOT_ALLOWED');
  // restoring good text clears the block after a reopen
  adapter.data.set(K10, damagedText.replace('"unitCostPaise":1009', '"unitCostPaise":1008'));
  const again = store.open();
  assert.equal(again.blocked, false);
  assert.equal(store.read('ledger').records.length, 18);
});

test('verifyAll writes nothing; open writes only the control row', () => {
  const { adapter, clock } = healthy();
  // crash window: shard ahead of head
  const s = newStore(adapter, clock);
  s.open();
  const head = JSON.parse(adapter.data.get(Store.HEAD_KEY));
  const row = head.find((x) => x.s === 'ledger');
  row.n -= 1; row.rev -= 1;
  const arr = JSON.parse(adapter.data.get(K11));
  row.h = arr[arr.length - 2].h;
  adapter.data.set(Store.HEAD_KEY, JSON.stringify(head));
  const shardBefore = adapter.data.get(K11);
  const wmBefore = adapter.data.get(Store.WATERMARK_KEY);
  const setBefore = adapter.setCount;
  const v = newStore(adapter, clock).verifyAll();
  assert.equal(adapter.setCount, setBefore, 'verifyAll must not write');
  assert.equal(v.problems[0].code, 'SVCS_HEAD_BEHIND');
  assert.equal(v.blocked, false);
  const o = newStore(adapter, clock).open();
  assert.deepEqual(o.healed, ['HEAD_HEALED:ledger']);
  assert.equal(adapter.data.get(K11), shardBefore, 'the shard is never touched');
  assert.equal(adapter.setLog.slice(setBefore).filter((k) => k !== Store.HEAD_KEY && k !== Store.WATERMARK_KEY).length, 0);
  assert.equal(adapter.data.get(Store.WATERMARK_KEY), wmBefore);
  const healed = JSON.parse(adapter.data.get(Store.HEAD_KEY)).find((x) => x.s === 'ledger');
  assert.equal(healed.n, 18);
  assert.equal(healed.rev, row.rev + 1 + 0);
});

test('T-S21 watermark: baseline, older copy, forked copy, newer copy, acknowledge', () => {
  const h = buildHealthy();
  const { adapter, clock } = h;
  const wm = JSON.parse(adapter.data.get(Store.WATERMARK_KEY));
  const heads = JSON.parse(adapter.data.get(Store.HEAD_KEY));
  for (const row of heads) assert.deepEqual(wm.streams[row.s], { h: row.h, n: row.n, rev: row.rev });
  // absent watermark: INIT, rewritten, not blocked
  adapter.data.delete(Store.WATERMARK_KEY);
  const init = newStore(adapter, clock).open();
  assert.equal(init.watermark, 'INIT');
  assert.equal(init.blocked, false);
  assert.deepEqual(JSON.parse(adapter.data.get(Store.WATERMARK_KEY)).streams.ledger.n, 18);
  // an unreadable watermark is replaced with a warning
  adapter.data.set(Store.WATERMARK_KEY, 'not json');
  const bad = newStore(adapter, clock).open();
  assert.equal(bad.watermark, 'INIT');
  assert.ok(bad.warnings.includes('SVCS_WATERMARK_INVALID'));
  assert.equal(bad.blocked, false);
  // older but internally consistent copy of every shared key (restore of an older backup)
  const old = adapter.snapshot();
  clock.advance(60000);
  const writer = openStore(adapter, clock);
  for (let i = 0; i < 4; i++) { clock.advance(1000); expectOk(put(writer, 'ledger', { k: 'TEST', b: { i } })); }
  const newer = adapter.snapshot();
  for (const [k, v] of old) if (k.indexOf(P) === 0) adapter.data.set(k, v);
  const ahead = newStore(adapter, clock).open();
  assert.equal(ahead.blocked, true);
  assert.equal(ahead.watermark, 'AHEAD');
  assert.equal(ahead.problems[0].code, 'SVCS_WATERMARK_AHEAD');
  assert.equal(ahead.problems[0].stream, 'ledger');
  // reads of the stream are blocked, appends are blocked
  const st = newStore(adapter, clock);
  st.open();
  expectFail(st.read('ledger'), 'SVCS_BLOCKED');
  expectFail(put(st, 'ledger', { k: 'TEST', b: {} }), 'SVCS_BLOCKED');
  // acknowledge: wrong actor, no step-up, short reason, then success
  expectFail(st.acknowledgeRestore({ actor: ACTORS.manager, reason: 'older backup restored', stepUpOk: true }), 'SVCS_OWNER_REQUIRED');
  expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older backup restored' }), 'SVCS_OWNER_REQUIRED');
  expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older backup restored', stepUpOk: 'yes' }), 'SVCS_OWNER_REQUIRED');
  expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'no', stepUpOk: true }), 'SVCS_ARGS_INVALID');
  expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'x'.repeat(201), stepUpOk: true }), 'SVCS_ARGS_INVALID');
  assert.equal(st.status().blocked, true);
  clock.advance(1000);
  const ack = expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older backup restored on purpose', stepUpOk: true }));
  assert.equal(ack.record.k, 'WATERMARK_RESET');
  assert.equal(ack.record.a.t, 'owner');
  assert.equal(ack.record.b.reason, 'older backup restored on purpose');
  assert.equal(ack.record.b.from.ledger.n, 22);
  assert.equal(ack.record.b.to.ledger.n, 18);
  assert.equal(ack.watermark, 'OK');
  assert.equal(st.status().blocked, false);
  assert.equal(st.read('ledger').records.length, 18);
  assert.equal(st.read('audit').records.filter((r) => r.k === 'WATERMARK_RESET').length, 1);
  // a second call has nothing to acknowledge
  expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'again for nothing', stepUpOk: true }), 'SVCS_ACK_NOT_ALLOWED');
  // a fresh store opens clean afterwards and keeps working
  const after = newStore(adapter, clock);
  assert.equal(after.open().blocked, false);
  assert.equal(after.verifyAll().problems.length, 0);
  clock.advance(1000);
  expectOk(put(after, 'ledger', { k: 'TEST', b: { fine: 1 } }));
  // newer data than the mark is fine and moves the mark forward
  const nowAdapter = new Map(newer);
  const w2 = makeAdapter(nowAdapter);
  w2.data.set(Store.WATERMARK_KEY, JSON.stringify({ v: 1, at: '2026-11-13T05:00:00.000Z', streams: { ledger: JSON.parse(newer.get(Store.WATERMARK_KEY)).streams.ledger } }));
  for (const k of [K9, K10, K11]) if (old.has(k)) w2.data.set(k, old.get(k));
  w2.data.set(Store.HEAD_KEY, old.get(Store.HEAD_KEY));
  // (w2 now holds the older ledger with a mark that came from the newer one: that is AHEAD again)
  assert.equal(newStore(w2, clock).open().watermark, 'AHEAD');
  const w3 = makeAdapter(new Map(old));
  const o3 = newStore(w3, clock).open();
  assert.equal(o3.watermark, 'OK');
  for (const [k, v] of newer) if (k.indexOf(P) === 0) w3.data.set(k, v);
  const o4 = newStore(w3, clock).open();
  assert.equal(o4.watermark, 'OK');
  assert.equal(JSON.parse(w3.data.get(Store.WATERMARK_KEY)).streams.ledger.n, 22, 'the mark moved forward');
});

test('T-S21b forked copy: same position, different content', () => {
  const h = buildHealthy();
  const { adapter, clock } = h;
  const at3 = adapter.snapshot();
  // device A goes on from here
  const writer = openStore(adapter, clock);
  clock.advance(1000);
  expectOk(put(writer, 'ledger', { k: 'TEST', b: { side: 'A' } }));
  const markA = adapter.data.get(Store.WATERMARK_KEY);
  // device B starts from the same copy and writes a different record at the same position
  const b = makeAdapter(new Map(at3));
  b.data.delete(Store.WATERMARK_KEY);
  const bs = openStore(b, clock);
  expectOk(put(bs, 'ledger', { k: 'TEST', b: { side: 'B' } }, { actor: ACTORS.staff }));
  // now put device A's mark next to device B's data
  b.data.set(Store.WATERMARK_KEY, markA);
  const fork = newStore(b, clock).open();
  assert.equal(fork.blocked, true);
  assert.equal(fork.watermark, 'FORK');
  assert.equal(fork.problems[0].code, 'SVCS_WATERMARK_FORK');
  // fork found deeper in the chain: the mark is at position 19, data has gone on to 20 with another record 19
  const c = makeAdapter(new Map(at3));
  c.data.delete(Store.WATERMARK_KEY);
  const cs = openStore(c, clock);
  expectOk(put(cs, 'ledger', { k: 'TEST', b: { side: 'B' } }));
  clock.advance(1000);
  expectOk(put(cs, 'ledger', { k: 'TEST', b: { side: 'B2' } }));
  c.data.set(Store.WATERMARK_KEY, markA);
  const deep = newStore(c, clock).open();
  assert.equal(deep.watermark, 'FORK');
  assert.equal(deep.problems[0].n, 19);
  // the Owner can acknowledge a fork too
  const st = newStore(c, clock);
  st.open();
  expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'reviewed the fork', stepUpOk: true }));
  assert.equal(st.status().blocked, false);
});

test('watermark switch off: nothing is written or checked', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const store = openStore(adapter, clock, { watermark: false });
  expectOk(put(store, 'ledger', { k: 'TEST', b: {} }));
  assert.equal(adapter.data.has(Store.WATERMARK_KEY), false);
  assert.equal(store.status().watermark, 'OFF');
  adapter.data.set(Store.WATERMARK_KEY, JSON.stringify({ v: 1, at: 'x', streams: { ledger: { rev: 9, n: 9, h: 'a'.repeat(64) } } }));
  const again = newStore(adapter, clock, { watermark: false });
  const o = again.open();
  assert.equal(o.watermark, 'OFF');
  assert.equal(o.blocked, false);
  // a failing watermark write only warns
  const a2 = makeAdapter();
  const s2 = openStore(a2, clock);
  a2.failSetFor(/watermark/, { times: 1 });
  clock.advance(1000);
  const r = expectOk(put(s2, 'ledger', { k: 'TEST', b: {} }));
  assert.deepEqual(Array.from(r.warnings), ['SVCS_WATERMARK_WRITE_FAILED']);
});

test('acknowledgeRestore is refused when other data damage is present', () => {
  const { adapter, clock } = healthy();
  const base = adapter.snapshot();
  const writer = openStore(adapter, clock);
  clock.advance(1000);
  expectOk(put(writer, 'ledger', { k: 'TEST', b: {} }));
  for (const [k, v] of base) if (k.indexOf(P) === 0) adapter.data.set(k, v);
  adapter.data.set(K10, adapter.data.get(K10).replace('"unitCostPaise":1008', '"unitCostPaise":1009'));
  const st = newStore(adapter, clock);
  const o = st.open();
  assert.equal(o.blocked, true);
  expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'trying with damage', stepUpOk: true }), 'SVCS_ACK_NOT_ALLOWED');
});

test('replay hook: problems block, a thrown error blocks, fatal:false does not, broken chains skip it', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const s = openStore(adapter, clock);
  expectOk(put(s, 'ledger', { k: 'TEST', b: { a: 1 } }));
  let seen = null;
  const ok1 = newStore(adapter, clock).open({ replay: (by) => { seen = by; return []; } });
  assert.equal(ok1.blocked, false);
  assert.deepEqual(Object.keys(seen).sort(), ['audit', 'config', 'defective', 'docs', 'labour', 'ledger', 'parts']);
  assert.ok(Object.isFrozen(seen.ledger) && seen.ledger.length === 1 && Object.isFrozen(seen.ledger[0]));
  const bad = newStore(adapter, clock);
  const o = bad.open({ replay: () => [{ code: 'SVCS_FIFO_MISMATCH', stream: 'ledger', n: 1, detail: 'layer order' }] });
  assert.equal(o.blocked, true);
  assert.equal(o.problems[0].code, 'SVCS_FIFO_MISMATCH');
  expectFail(bad.read('ledger'), 'SVCS_BLOCKED');
  assert.equal(bad.read('docs').ok, true, 'a problem on one stream leaves the others readable');
  expectFail(put(bad, 'docs', { k: 'TEST', b: {} }), 'SVCS_BLOCKED');
  // any problem the replay returns blocks, whatever its code
  assert.equal(newStore(adapter, clock).open({ replay: () => [{ code: 'NEGATIVE_STOCK', stream: 'ledger' }] }).blocked, true);
  // thrown error
  const thrown = newStore(adapter, clock).open({ replay: () => { throw new Error('boom'); } });
  assert.equal(thrown.blocked, true);
  assert.equal(thrown.problems[0].code, 'SVCS_FIFO_MISMATCH');
  // explicit non-blocking note
  const soft = newStore(adapter, clock).open({ replay: () => [{ code: 'SVCS_NOTE', fatal: false }] });
  assert.equal(soft.blocked, false);
  assert.equal(soft.problems.length, 1);
  // chain damage: the replay is not called
  const dmg = adapter.copy();
  const key = P + 'ledger_v1_2026-11';
  dmg.data.set(key, dmg.data.get(key).replace('"a":1', '"a":2'));
  let called = false;
  const d = newStore(dmg, clock).open({ replay: () => { called = true; return []; } });
  assert.equal(called, false);
  assert.equal(d.problems[0].code, 'SVCS_CHAIN_BREAK');
  // the replay may be given once to createStore instead
  let viaOptions = 0;
  newStore(adapter, clock, { replay: () => { viaOptions += 1; return []; } }).open();
  assert.equal(viaOptions, 1);
});

test('an unknown clock warning: an older record after a newer one is reported, not fatal', () => {
  const adapter = makeAdapter();
  const clock = makeClock('2026-11-13T05:00:00.000Z');
  forgeChain(adapter, 'audit', 3, (n) => ({ k: 'NOTE', b: { n } }), '2026-11-13T05:00:00.000Z');
  // craft a record 3 days earlier than record 2 by rebuilding the chain by hand
  const key = Store.shardKey('audit', '2026-11-13T05:00:00.000Z', 1);
  const arr = JSON.parse(adapter.data.get(key));
  arr[2].at = '2026-11-10T05:00:00.000Z';
  arr[2].h = Store.sha256Hex([ 'audit', arr[2].p, arr[2].n, arr[2].at, arr[2].k, '', Store.canonicalText(arr[2].a), Store.canonicalText(arr[2].b)].join(NL));
  adapter.data.set(key, JSON.stringify(arr));
  const head = JSON.parse(adapter.data.get(Store.HEAD_KEY));
  head[0].h = arr[2].h; head[0].at = arr[2].at;
  adapter.data.set(Store.HEAD_KEY, JSON.stringify(head));
  const o = newStore(adapter, clock).open();
  assert.equal(o.blocked, false);
  assert.deepEqual(Array.from(o.warnings), ['SVCS_CLOCK_BACK:audit:3']);
});

test('series check on verify: a number out of order is fatal', () => {
  const { adapter, clock } = healthy();
  const arr = JSON.parse(adapter.data.get(K9));
  arr[1].b.no = 'GRN/26-27/0005';
  for (let i = 1; i < arr.length; i++) { arr[i].p = arr[i - 1].h; arr[i].h = recHash('ledger', arr[i]); }
  adapter.data.set(K9, JSON.stringify(arr));
  const v = newStore(adapter, clock).verifyAll();
  assert.equal(v.problems[0].code, 'SVCS_SERIES_GAP');
  assert.equal(v.problems[0].n, 2);
  // a number whose year does not match its record time
  const h2 = healthy();
  const a2 = JSON.parse(h2.adapter.data.get(K9));
  a2[0].b.no = 'GRN/25-26/0001';
  for (let i = 0; i < a2.length; i++) { a2[i].p = i ? a2[i - 1].h : '0'.repeat(64); a2[i].h = recHash('ledger', a2[i]); }
  h2.adapter.data.set(K9, JSON.stringify(a2));
  assert.equal(newStore(h2.adapter, h2.clock).verifyAll().problems[0].code, 'SVCS_SERIES_GAP');
});

test('storage read errors are reported as problems, not thrown', () => {
  const { adapter, clock } = healthy();
  adapter.getHooks.push((k, v) => { if (k === K10) throw Object.assign(new Error('io'), { code: 'IO_ERROR' }); return v; });
  const o = newStore(adapter, clock).open();
  assert.equal(o.blocked, true);
  assert.equal(o.problems[0].code, 'SVCS_SHARD_UNREADABLE');
  assert.equal(o.problems[0].detail, 'IO_ERROR');
  const a2 = healthy();
  a2.adapter.getHooks.push((k, v) => { if (k === Store.HEAD_KEY) throw new Error('io'); return v; });
  const o2 = newStore(a2.adapter, a2.clock).open();
  assert.equal(o2.blocked, true);
  assert.equal(o2.problems[0].code, 'SVCS_SHARD_UNREADABLE');
});

test('open twice and reopen after outside changes keeps state correct', () => {
  const clock = makeClock();
  const adapter = makeAdapter();
  const a = openStore(adapter, clock);
  const b = openStore(adapter, clock);
  expectOk(put(a, 'ledger', { k: 'TEST', b: { x: 1 }, r: 'REF:a:1' }));
  assert.equal(b.read('ledger').records.length, 0);
  assert.equal(b.findRef('ledger', 'REF:a:1'), null);
  b.open();
  assert.equal(b.read('ledger').records.length, 1);
  assert.equal(b.findRef('ledger', 'REF:a:1').n, 1);
  const o1 = b.open();
  const o2 = b.open();
  assert.deepEqual(o1.summary, o2.summary);
  assert.equal(o2.summary.counts.ledger, 1);
  assert.equal(o2.summary.lastAt, a.read('ledger').records[0].at);
});
