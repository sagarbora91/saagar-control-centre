// Service wave 2, store: damage, blocked behaviour, device mark and the downgrade rule for the streams invoices and receipts.
// Expected codes are typed by hand from the P1-storage spec (tests 21 to 24) and the Phase 1 store behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, P, makeClock, makeAdapter, newStore, openStore, put, expectOk, expectFail, postNumbered,
  postInvoice, postAdvance, postReceipt, putSeed, seedAndInvoice, resealShard, recHash, loadPhase1Store, FILLER, plain
} from './lib/svc2-store-harness.mjs';

const START = '2026-10-05T05:00:00.000Z';

// A healthy store with both new streams in three parts each. Layout of each stream (same shape for both):
//   index 0..1  seed A and the first number after it, index 2 seed B (the one a test makes go backwards), index 3 a number, then fillers.
function damageBase() {
  const clock = makeClock(START);
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const tick = () => clock.advance(1000);
  for (let i = 1; i <= 3; i++) { tick(); expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: i, unitCostPaise: 100 + i })); }
  tick(); expectOk(seedAndInvoice(store, 41)); // n1 seed, n2 SV 0042
  tick(); expectOk(putSeed(store, 'invoices', 'SV', '2026-27', 60)); // n3 seed B
  tick(); expectOk(postInvoice(store)); // n4 SV 0061
  for (let i = 0; i < 130; i++) { tick(); expectOk(postInvoice(store, { filler: FILLER, i })); }
  tick(); expectOk(putSeed(store, 'receipts', 'SAR', '26-27', 10)); // n1
  tick(); expectOk(postAdvance(store)); // n2 SAR 0011
  tick(); expectOk(putSeed(store, 'receipts', 'SAR', '26-27', 20)); // n3 seed B
  tick(); expectOk(postAdvance(store)); // n4 SAR 0021
  for (let i = 0; i < 130; i++) { tick(); expectOk(postReceipt(store, { filler: FILLER, i })); }
  return { adapter, clock, store };
}

const keysOf = (adapter, stream) => adapter.svcsKeys().filter((k) => k.indexOf(P + stream + '_v1_FY') === 0).sort();
const shardOf = (adapter, key) => JSON.parse(adapter.data.get(key));

// Each case: [name, expected code, how to damage the copy, what the problem must say about the key and n]
function cases(stream) {
  return [
    ['one character of a body flipped', 'SVCS_CHAIN_BREAK', (ad, ks) => {
      const arr = shardOf(ad, ks[1]); arr[3].b.jobId = 'J-X'; ad.data.set(ks[1], JSON.stringify(arr));
      return { key: ks[1], n: arr[3].n };
    }],
    ['shard text cut off (not valid JSON)', 'SVCS_SHARD_NOT_ARRAY', (ad, ks) => {
      ad.data.set(ks[1], ad.data.get(ks[1]).slice(0, -5)); return { key: ks[1], n: null };
    }],
    ['shard replaced by an object', 'SVCS_SHARD_NOT_ARRAY', (ad, ks) => { ad.data.set(ks[1], '{}'); return { key: ks[1], n: null }; }],
    ['a middle part deleted', 'SVCS_SEQ_GAP', (ad, ks) => {
      const nextFirst = shardOf(ad, ks[2])[0].n; ad.data.delete(ks[1]); return { key: ks[2], n: nextFirst };
    }],
    ['the last part deleted', 'SVCS_HEAD_AHEAD', (ad, ks) => {
      const row = JSON.parse(ad.data.get(Store.HEAD_KEY)).find((r) => r.s === stream); ad.data.delete(ks[2]); return { key: ks[2], n: row.n };
    }],
    ['the head deleted', 'SVCS_HEAD_MISSING', (ad) => { ad.data.delete(Store.HEAD_KEY); return { key: Store.HEAD_KEY, n: null, noStream: true }; }],
    ['a record duplicated', 'SVCS_SEQ_GAP', (ad, ks) => {
      const arr = shardOf(ad, ks[0]); const dup = arr[5]; arr.splice(5, 0, dup); ad.data.set(ks[0], JSON.stringify(arr)); return { key: ks[0], n: dup.n };
    }],
    ['two records swapped', 'SVCS_SEQ_GAP', (ad, ks) => {
      const arr = shardOf(ad, ks[1]); const a = arr[4]; const b = arr[5]; arr[4] = b; arr[5] = a; ad.data.set(ks[1], JSON.stringify(arr)); return { key: ks[1], n: b.n };
    }],
    ['a number forged (hash not fixed)', 'SVCS_CHAIN_BREAK', (ad, ks) => {
      const arr = shardOf(ad, ks[1]); const rec = arr.find((r) => typeof r.b.no === 'string'); rec.b.no = rec.b.no.replace(/\d{4}$/, '0001'); ad.data.set(ks[1], JSON.stringify(arr)); return { key: ks[1], n: rec.n };
    }],
    ['a body edited and its own hash made to match', 'SVCS_CHAIN_BREAK', (ad, ks) => {
      const arr = shardOf(ad, ks[1]); const rec = arr[3]; rec.b.jobId = 'J-FORGED'; rec.h = recHash(stream, rec); ad.data.set(ks[1], JSON.stringify(arr)); return { key: ks[1], n: arr[4].n };
    }],
    ['a seed edited to go backwards (chain re-sealed)', 'SVCS_SERIES_GAP', (ad, ks) => {
      let n = 0;
      resealShard(ad, stream, ks[0], (recs) => { recs[2].b.seriesSeed.last = 5; n = recs[2].n; });
      return { key: ks[0], n };
    }]
  ];
}

for (const stream of ['invoices', 'receipts']) {
  test('T2S-21 damage matrix on ' + stream + ': every case alone on a healthy copy is found and named', () => {
    const base = damageBase();
    const ks = keysOf(base.adapter, stream);
    assert.equal(ks.length, 3, 'three parts of the year');
    assert.equal(newStore(base.adapter.copy(), base.clock).open().blocked, false, 'the base is healthy');
    for (const [name, code, damage, want] of cases(stream).map((c) => [c[0], c[1], c[2], null])) {
      const ad = base.adapter.copy();
      const info = damage(ad, ks);
      void want;
      const o = newStore(ad, base.clock).open();
      assert.equal(o.blocked, true, name);
      const p = o.problems[0];
      assert.equal(p.code, code, name + ': ' + JSON.stringify(p));
      assert.equal(p.key, info.key, name);
      if (info.noStream) assert.equal(p.stream, null, name); else assert.equal(p.stream, stream, name);
      assert.equal(p.n, info.n, name);
    }
  });
}

test('T2S-22 after damage in one new stream every write is refused, the damaged stream cannot be read, a clean one can', () => {
  for (const [stream, other] of [['invoices', 'receipts'], ['receipts', 'invoices']]) {
    const base = damageBase();
    const ad = base.adapter.copy();
    const ks = keysOf(ad, stream);
    const arr = shardOf(ad, ks[1]);
    arr[3].b.jobId = 'J-X';
    const damaged = JSON.stringify(arr);
    ad.data.set(ks[1], damaged);
    const sets = ad.setCount;
    const store = newStore(ad, base.clock);
    assert.equal(store.open().blocked, true);
    for (const s of Object.keys(Store.STREAMS)) {
      expectFail(store.append(s, [{ k: 'TEST', b: {} }], { expectRev: 0, actor: ACTORS.owner }), 'SVCS_BLOCKED');
    }
    expectFail(store.read(stream), 'SVCS_BLOCKED');
    expectFail(store.readPeriod(stream, 'FY2026-27'), 'SVCS_BLOCKED');
    assert.equal(store.findRef(stream, 'REF:inv:1'), null);
    assert.equal(store.read('ledger').records.length, 3, 'a clean ledger can still be read');
    assert.ok(store.read(other).records.length > 100, 'the other new stream can still be read');
    expectFail(store.lastNumber('SV', START), 'SVCS_BLOCKED');
    assert.equal(ad.data.get(ks[1]), damaged, 'the damaged text is not repaired');
    assert.equal(ad.setCount, sets, 'nothing was written');
    assert.equal(store.status().blocked, true);
  }
});

test('T2S-23 an older consistent copy of a new stream is caught by the device mark; the Owner can acknowledge it', () => {
  for (const [stream, series, post, nextAfter] of [
    ['invoices', 'SV', postInvoice, 'SV/2026-27/0016'],
    ['receipts', 'SAR', postAdvance, 'SAR/26-27/0016']
  ]) {
    const clock = makeClock(START);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    for (let i = 0; i < 10; i++) { clock.advance(1000); expectOk(post(store)); }
    const backup = new Map(Array.from(adapter.data.entries()).filter(([k]) => k !== Store.WATERMARK_KEY));
    for (let i = 0; i < 5; i++) { clock.advance(1000); expectOk(post(store)); }
    assert.equal(store.nextNumber(series, START).no.endsWith('0016'), true);
    // restore the older head and shards over the newer data, the device mark stays
    const device = new Map(adapter.data);
    for (const [k, v] of backup) device.set(k, v);
    const dev = makeAdapter(device);
    const st = newStore(dev, clock);
    const o = st.open();
    assert.equal(o.blocked, true);
    assert.equal(o.problems[0].code, 'SVCS_WATERMARK_AHEAD');
    assert.equal(o.problems[0].stream, stream);
    assert.equal(o.problems[0].n, 10);
    assert.equal(o.watermark, 'AHEAD');
    expectFail(st.read(stream), 'SVCS_BLOCKED');
    expectFail(st.acknowledgeRestore({ actor: ACTORS.manager, reason: 'older copy restored', stepUpOk: true }), 'SVCS_OWNER_REQUIRED');
    expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older copy restored', stepUpOk: false }), 'SVCS_OWNER_REQUIRED');
    expectFail(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'no', stepUpOk: true }), 'SVCS_ARGS_INVALID');
    clock.advance(1000);
    const ack = expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older copy restored on purpose', stepUpOk: true }));
    assert.equal(ack.record.k, 'WATERMARK_RESET');
    assert.equal(ack.record.b.from[stream].n, 15);
    assert.equal(ack.record.b.to[stream].n, 10);
    assert.equal(st.read('audit').records.length, 1);
    assert.equal(st.read(stream).records.length, 10);
    // Stage E (D-backup-1): the five newer numbers (0011 to 0015) were given on this device, so they are never issued again.
    assert.equal(st.nextNumber(series, START).no, nextAfter, series + ' after an acknowledged older restore continues at 0016');
    const again = newStore(dev, clock).open();
    assert.equal(again.blocked, false);
    assert.equal(again.watermark, 'OK');
  }
});

// Stage E, D-backup-1: after an older backup (or a module reset) is acknowledged, no number of any series is issued twice.
// Hand values: three numbers (0001 to 0003) are in the backup, two more (0004, 0005) were given after it on this device.
// The acknowledgement records the floor 5 with the stream position 3; the next number is 0006, then 0007.
const ALL_SERIES = ['SV', 'SCN', 'SAR', 'SRC', 'SRF', 'GRN', 'OPN', 'ISS', 'RET', 'CSL', 'ADJ', 'OLD', 'SCR'];
const fyOf = (s) => (s === 'SV' ? '2026-27' : '26-27');
const noOf = (s, n) => s + '/' + fyOf(s) + '/' + String(n).padStart(4, '0');
const postS = (store, s) => postNumbered(store, s, Store.SERIES[s].stream, s, { note: 'x' });
const shared = (adapter) => new Map(Array.from(adapter.data.entries()).filter(([k]) => k !== Store.WATERMARK_KEY));
// a restore replaces every saagar_svcs_ key with the backup's; the device mark stays
const restoreOver = (adapter, backup) => { for (const k of adapter.svcsKeys()) adapter.data.delete(k); for (const [k, v] of backup) adapter.data.set(k, v); };

test('T2S-23b D-backup-1: an acknowledged older backup never reissues a used number, for every one of the 13 series', () => {
  for (const s of ALL_SERIES) {
    const clock = makeClock(START);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    for (let i = 0; i < 3; i++) { clock.advance(1000); expectOk(postS(store, s)); }
    const backup = shared(adapter);
    for (let i = 0; i < 2; i++) { clock.advance(1000); expectOk(postS(store, s)); }
    // a normal store: the device mark remembers the highest number of each series and year
    assert.deepEqual(JSON.parse(adapter.data.get(Store.WATERMARK_KEY)).hi, { [s + '|' + fyOf(s)]: 5 }, s);
    restoreOver(adapter, backup);
    const st = newStore(adapter, clock);
    assert.equal(st.open().watermark, 'AHEAD', s);
    clock.advance(1000);
    const ack = expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older backup restored', stepUpOk: true }));
    assert.deepEqual(plain(ack.record.b.numbers), { [s + '|' + fyOf(s)]: { f: 5, n: 3 } }, s);
    assert.equal(st.nextNumber(s, START).no, noOf(s, 6), s + ' continues above the numbers this device gave');
    // the old next number is refused by the store itself
    const t0 = st.nextAt(Store.SERIES[s].stream);
    const h0 = st.head(Store.SERIES[s].stream);
    expectFail(st.append(Store.SERIES[s].stream, [{ k: s, series: s, b: { no: noOf(s, 4) } }], { expectRev: h0.rev, actor: ACTORS.manager, at: t0.at }), 'SVCS_SERIES_MISMATCH');
    clock.advance(1000);
    const r = expectOk(postS(st, s));
    assert.equal(r.records[0].b.no, noOf(s, 6), s);
    // a fresh open accepts the jump (no gap problem) and keeps counting
    const again = newStore(adapter, clock);
    const o = again.open();
    assert.equal(o.blocked, false, s + ' ' + JSON.stringify(o.problems));
    assert.equal(o.problems.length, 0, s);
    assert.equal(again.nextNumber(s, START).no, noOf(s, 7), s);
    // a brand-new device restored from a backup taken after the acknowledgement: no device mark, the floor is in the data
    const fresh = makeAdapter(shared(adapter));
    const nd = newStore(fresh, clock);
    assert.equal(nd.open().blocked, false, s);
    assert.equal(nd.nextNumber(s, START).no, noOf(s, 7), s);
    // a brand-new device restored from the OLDER backup: it cannot know the two later numbers; it continues from the backup
    const olderOnNew = newStore(makeAdapter(new Map(backup)), clock);
    assert.equal(olderOnNew.open().blocked, false, s);
    assert.equal(olderOnNew.nextNumber(s, START).no, noOf(s, 4), s);
  }
});

test('T2S-23c D-backup-1: after a Service module reset and the acknowledgement, numbers continue above the last one given', () => {
  for (const s of ['SAR', 'SV', 'GRN', 'OLD']) {
    const clock = makeClock(START);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    for (let i = 0; i < 5; i++) { clock.advance(1000); expectOk(postS(store, s)); }
    for (const k of adapter.svcsKeys()) adapter.data.delete(k);
    const st = newStore(adapter, clock);
    assert.equal(st.open().watermark, 'AHEAD', s);
    clock.advance(1000);
    const ack = expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'module reset on purpose', stepUpOk: true }));
    assert.deepEqual(plain(ack.record.b.numbers), { [s + '|' + fyOf(s)]: { f: 5, n: 0 } }, s);
    assert.equal(st.nextNumber(s, START).no, noOf(s, 6), s);
    // the device mark is lost before anything else is posted: the floor in the audit record still holds
    adapter.data.delete(Store.WATERMARK_KEY);
    const lost = newStore(adapter, clock);
    assert.equal(lost.open().blocked, false, s);
    assert.equal(lost.nextNumber(s, START).no, noOf(s, 6), s);
    clock.advance(1000);
    assert.equal(expectOk(postS(lost, s)).records[0].b.no, noOf(s, 6), s);
    const o = newStore(adapter, clock).open();
    assert.equal(o.problems.length, 0, s + ' ' + JSON.stringify(o.problems));
  }
});

test('T2S-23d D-backup-1: an acknowledgement with no number to protect writes the same record body as before', () => {
  const clock = makeClock(START);
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  for (let i = 0; i < 3; i++) { clock.advance(1000); expectOk(postAdvance(store)); }
  const backup = shared(adapter);
  for (let i = 0; i < 2; i++) { clock.advance(1000); expectOk(put(store, 'audit', { k: 'NOTE', b: { text: 'later' } })); }
  restoreOver(adapter, backup);
  const st = newStore(adapter, clock);
  assert.equal(st.open().watermark, 'AHEAD');
  clock.advance(1000);
  const ack = expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'older backup restored', stepUpOk: true }));
  assert.deepEqual(Object.keys(ack.record.b).sort(), ['from', 'reason', 'to']);
  assert.equal(st.nextNumber('SAR', START).no, 'SAR/26-27/0004');
});

test('T2S-24 an older (Phase 1) build cannot open Phase 2 data: it blocks with the head-invalid code (downgrade rule)', (t) => {
  const old = loadPhase1Store();
  if (!old) { t.skip('git or commit 031841f is not available here'); return; }
  const clock = makeClock(START);
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: 1, unitCostPaise: 100 }));
  // Phase 1 data only: the old build opens it fine
  const onlyP1 = old.createStore(adapter.copy(), { now: clock.now }).store.open();
  assert.equal(onlyP1.blocked, false);
  clock.advance(1000);
  expectOk(postInvoice(store));
  clock.advance(1000);
  expectOk(postAdvance(store));
  const oldStore = old.createStore(adapter.copy(), { now: clock.now }).store;
  const o = oldStore.open();
  assert.equal(o.ok, true);
  assert.equal(o.blocked, true);
  assert.ok(o.problems.some((p) => p.code === 'SVCS_HEAD_INVALID'), JSON.stringify(plain(o.problems)));
  assert.equal(oldStore.append('ledger', [{ k: 'TEST', b: {} }], { expectRev: 1, actor: ACTORS.owner }).code, 'SVCS_BLOCKED');
  assert.equal(oldStore.read('ledger').code, 'SVCS_BLOCKED');
});

test('T2S-28 a store holding only Phase 1 data opens with the same problems and healing as before', () => {
  const clock = makeClock(START);
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  for (let i = 0; i < 4; i++) { clock.advance(1000); expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: i, unitCostPaise: 100 })); }
  const o = newStore(adapter, clock).open();
  assert.deepEqual(plain(o.problems), []);
  assert.deepEqual(plain(o.healed), []);
  assert.equal(o.blocked, false);
  assert.deepEqual(Object.keys(o.streams), ['ledger']);
  assert.deepEqual(plain(o.summary.counts), { audit: 0, config: 0, defective: 0, docs: 0, invoices: 0, labour: 0, ledger: 4, parts: 0, receipts: 0 });
  // an invoices shard with a head row that is missing while other streams exist is a heal, not a block
  clock.advance(1000);
  expectOk(postInvoice(store));
  const rows = JSON.parse(adapter.data.get(Store.HEAD_KEY)).filter((r) => r.s !== 'invoices');
  adapter.data.set(Store.HEAD_KEY, '[' + rows.map((x) => '{"s":"' + x.s + '","rev":' + x.rev + ',"n":' + x.n + ',"h":"' + x.h + '","at":"' + x.at + '","key":"' + x.key + '"}').join(',') + ']');
  const healed = newStore(adapter, clock).open();
  assert.deepEqual(plain(healed.healed), ['HEAD_HEALED:invoices']);
  assert.equal(healed.blocked, false);
});

test('T2S-29 the replay hook is handed the seven Phase 1 streams only, and new-stream chains are still verified without it', () => {
  const clock = makeClock(START);
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: 1, unitCostPaise: 100 }));
  clock.advance(1000);
  expectOk(postInvoice(store));
  clock.advance(1000);
  expectOk(postAdvance(store));
  let seen = null;
  const o = newStore(adapter, clock).open({ replay: (by) => { seen = by; return []; } });
  assert.equal(o.blocked, false);
  assert.deepEqual(Object.keys(seen).sort(), ['audit', 'config', 'defective', 'docs', 'labour', 'ledger', 'parts']);
  assert.equal(seen.ledger.length, 1);
  // a replay problem naming a new stream still blocks that stream and every write
  const bad = newStore(adapter, clock);
  const ob = bad.open({ replay: () => [{ code: 'SVCS_FIFO_MISMATCH', stream: 'invoices', n: 1, detail: 'test' }] });
  assert.equal(ob.blocked, true);
  expectFail(bad.read('invoices'), 'SVCS_BLOCKED');
  assert.equal(bad.read('receipts').ok, true);
  expectFail(put(bad, 'receipts', { k: 'TEST', b: {} }), 'SVCS_BLOCKED');
});
