// Service wave 2, store: what the new streams add, and proof that Phase 1 output did not move.
// Expected values are typed by hand from the wave plan (sections 2.2 to 2.4) and the P1-storage spec.
// The golden hashes (T2S-2) were produced by running the same scenario on the committed Phase 1 store (commit 031841f).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, ACTORS, P, makeClock, makeAdapter, newStore, openStore, put, expectOk, expectFail, readSrc,
  postInvoice, postAdvance, loadPhase1Store, PHASE1_SHA256
} from './lib/svc2-store-harness.mjs';
import { runGolden } from './lib/svc2-store-golden.mjs';

const SRC = readSrc();
const AT = '2026-11-18T05:00:00.000Z';
const ZERO = '0'.repeat(64);

test('T2S-1 export surface: 20 names as in Phase 1, merged tables of 9 streams and 13 series (route B)', () => {
  assert.deepEqual(Object.keys(Store).sort(), [
    'CODES', 'HEAD_KEY', 'KEY_RE', 'LIMITS', 'MESSAGES', 'SERIES', 'STREAMS', 'SVCS_PREFIX', 'VERSION', 'WATERMARK_KEY',
    'adapterFromWindow', 'canonicalText', 'createStore', 'fyLabel', 'fyShort', 'istDate', 'istMonth', 'parseShardKey', 'sha256Hex', 'shardKey'
  ]);
  assert.equal(Store.VERSION, 'SVCS_STORE_V1');
  assert.deepEqual(Object.keys(Store.STREAMS).sort(), ['audit', 'config', 'defective', 'docs', 'invoices', 'labour', 'ledger', 'parts', 'receipts']);
  assert.deepEqual(Object.keys(Store.SERIES).sort(), ['ADJ', 'CSL', 'GRN', 'ISS', 'OLD', 'OPN', 'RET', 'SAR', 'SCN', 'SCR', 'SRC', 'SRF', 'SV']);
  assert.deepEqual(Store.STREAMS.invoices, { code: 'INV', period: 'fy', base: 'invoices' });
  assert.deepEqual(Store.STREAMS.receipts, { code: 'RCT', period: 'fy', base: 'receipts' });
  assert.deepEqual(Store.SERIES.SV, { stream: 'invoices', width: 4, fy: 'long' });
  assert.deepEqual(Store.SERIES.SCN, { stream: 'invoices', width: 4 });
  assert.deepEqual(Store.SERIES.SAR, { stream: 'receipts', width: 4 });
  assert.deepEqual(Store.SERIES.SRC, { stream: 'receipts', width: 4 });
  assert.deepEqual(Store.SERIES.SRF, { stream: 'receipts', width: 4 });
  // the seven Phase 1 streams and eight Phase 1 series are unchanged
  assert.deepEqual(Store.STREAMS.ledger, { code: 'LED', period: 'month', base: 'ledger' });
  assert.deepEqual(Store.STREAMS.docs, { code: 'DOC', period: 'fy', base: 'docs' });
  assert.deepEqual(Store.SERIES.GRN, { stream: 'ledger', width: 4 });
  assert.deepEqual(Store.SERIES.OLD, { stream: 'defective', width: 4 });
  assert.ok(Object.isFrozen(Store.STREAMS) && Object.isFrozen(Store.SERIES) && Object.isFrozen(Store.SERIES.SV));
  // no new failure code
  assert.equal(Object.keys(Store.CODES).length, 32);
  assert.deepEqual(Object.keys(Store.CODES).sort(), Object.keys(Store.MESSAGES).sort());
  assert.equal(Store.SERIES.SV.fy, 'long');
  assert.equal(Store.SERIES.SCN.fy, undefined);
});

// Hashes made from the Phase 1 file (031841f) by the same scenario.
const GOLDEN = {
  'saagar_svcs_audit_v1_2026-10': '8fea9d96026ada3065d354a96c78e0777fbb97dee65f198a2f38596bb3cf9f66',
  'saagar_svcs_config_v1': 'c70fb354a98c809ba894e13a24c3280a14f7b10c28d6e4b95b0e4496e6702dee',
  'saagar_svcs_defective_v1': 'a7e534968b913a3ae1f6440c7ff0d6f44033a3b235c254d67a4d0ab3eb058ec0',
  'saagar_svcs_docs_v1_FY2026-27': '848527bb60dededebe29cb94e881c329ebcd337a4ee6d270f53b625457c54369',
  'saagar_svcs_head_v1': '50bce68aac990fccc15c98ade3c3fe3b3572eff9eb174863e5ed400298c8110b',
  'saagar_svcs_labour_v1': '07dda66ef894f4318286801bcdb5d5c74bf7b06f7c16ee401461bc35e2ea0d14',
  'saagar_svcs_ledger_v1_2026-09': '5aa2dadccfdbeef37514f44f6febff7885cc0f991f1a1b031c5e9004da71b90c',
  'saagar_svcs_ledger_v1_2026-10': '3f3adde18fa01d9d91045c134afd673f7e434997fb89eb1081a80b667563c3e8',
  'saagar_svcs_ledger_v1_2026-11': '11838153cf55eb88e725c6692646038e51862bd4186bd85215aa316fe0eaf8fd',
  'saagar_svcs_parts_v1': '68fcf69681524aa72cc78189b83bb141a549232cffaedb7af78e08fcd36ed588',
  'st_v2_svcs_watermark_v1': '9e6c835a459f5aeba5f2aa2a30aad32cd1684f7a0ff3671190d9754232e3d90e'
};
// The device mark text with its Stage E "hi" entry taken out; every other key is compared as it is.
function withoutHi(text, key) {
  if (key !== Store.WATERMARK_KEY) return text;
  const o = JSON.parse(text);
  delete o.hi;
  return Store.canonicalText(o);
}

test('T2S-2 golden bytes: 40 Phase 1 postings give the same shard, head and device mark texts as the Phase 1 file', () => {
  const r = runGolden(Store);
  assert.equal(r.count, 40);
  assert.deepEqual(Object.keys(r.texts).sort(), Object.keys(GOLDEN).sort());
  for (const [k, hash] of Object.entries(GOLDEN)) assert.equal(Store.sha256Hex(withoutHi(r.texts[k], k)), hash, k);
  // Stage E (D-backup-1): the device mark (never in a backup) also keeps the highest number of each series and year.
  // Hand values: GRN 1 to 18, CSL 1 to 4, OLD 1 to 4, all in the year 2026-27. Every saagar_svcs_ text is unchanged.
  assert.deepEqual(JSON.parse(r.texts[Store.WATERMARK_KEY]).hi, { 'CSL|26-27': 4, 'GRN|26-27': 18, 'OLD|26-27': 4 });
  // the head list of that run holds only the seven Phase 1 streams
  assert.deepEqual(JSON.parse(r.texts[Store.HEAD_KEY]).map((x) => x.s), ['audit', 'config', 'defective', 'docs', 'labour', 'ledger', 'parts']);
});

test('T2S-2b differential: the Phase 1 file (read from git) and this file write identical bytes for the same run', (t) => {
  const old = loadPhase1Store();
  if (!old) { t.skip('git or commit 031841f is not available here; the golden hashes above still pin the bytes'); return; }
  const a = runGolden(old);
  const b = runGolden(Store);
  assert.deepEqual(Object.keys(b.texts).sort(), Object.keys(a.texts).sort());
  for (const k of Object.keys(a.texts)) assert.equal(withoutHi(b.texts[k], k), a.texts[k], k);
  assert.equal(Store.sha256Hex(readSrc()) === PHASE1_SHA256, false, 'the store file has changed since Phase 1');
});

test('T2S-3 write site and source rules: adapter text unchanged, one setItem, one prefix literal, Phase 1 bans still hold', () => {
  const text = Store.adapterFromWindow.toString();
  assert.equal(text.length, 1070);
  assert.equal(Store.sha256Hex(text), '4864ed83f0ba5ef2c3c90ba8673d648b0747a8d190c8b645cee1374e9f55527d');
  assert.equal((SRC.match(/setItem\(/g) || []).length, 1);
  assert.equal((SRC.match(/saagar_svcs_/g) || []).length, 1);
  assert.ok(/Storage write: head, shard and watermark keys/.test(SRC));
  assert.ok(!SRC.includes('\r'), 'LF only');
  assert.ok(!SRC.startsWith('﻿'), 'no BOM');
  assert.ok(SRC.endsWith('});\n') && !SRC.endsWith('\n\n'));
  assert.ok(/^[\x00-\x7F]*$/.test(SRC), 'ASCII only');
  assert.ok(!/\t/.test(SRC), 'no tab');
  const banned = [
    'postMessage', 'ST_', 'document.write', 'import(', 'eval(', 'new Function', 'fetch(', 'XMLHttpRequest', 'window.open', 'sendBeacon',
    'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB', 'localStorage.removeItem', 'localStorage.clear', 'custName', 'custMobile',
    'custAddr', 'Math.random', 'Date.now', 'new Date()', 'setTimeout', 'setInterval', 'structuredClone', '.flat(', '.fill(', '.at(', 'padEnd', 'replaceAll'
  ];
  for (const b of banned) assert.ok(!SRC.includes(b), 'banned: ' + b);
  assert.ok(!/=>/.test(SRC) && !/\b(let|const|class|async|await|yield)\b/.test(SRC) && !/`/.test(SRC) && !/\.\.\./.test(SRC), 'strict ES5');
  // the parts of the file the plan says must not be touched, by their exact text
  assert.ok(SRC.includes("var FORBIDDEN_FIELD_RE = new RegExp('^(mobile|phone|email|address|cust' + 'name|customername|customermobile|cust' + 'mobile|cust' + 'addr|customeraddress|aadhaar|pan)$', 'i');"));
  assert.ok(SRC.includes("var VERSION = 'SVCS_STORE_V1';"));
  assert.ok(SRC.includes("MAX_NUMBER_CHARS: 16"));
});

test('T2S-5 shard keys of the new streams: round trip, KEY_RE.fy2 accepts and refuses the right texts', () => {
  const at = '2026-11-18T05:00:00.000Z';
  for (const stream of ['invoices', 'receipts']) {
    for (const part of [1, 2, 10, 99, 999]) {
      const key = Store.shardKey(stream, at, part);
      const suffix = part === 1 ? '' : '_p' + part;
      assert.equal(key, P + stream + '_v1_FY2026-27' + suffix);
      const parsed = Store.parseShardKey(key);
      assert.equal(parsed.stream, stream);
      assert.equal(parsed.period, 'FY2026-27');
      assert.equal(parsed.part, part);
      assert.ok(Store.KEY_RE.fy2.test(key), key);
    }
    assert.equal(Store.shardKey(stream, at, 1000), null);
    assert.equal(Store.shardKey(stream, at, 0), null);
    assert.equal(Store.shardKey(stream, 'nope', 1), null);
  }
  assert.equal(Store.shardKey('invoices', '2027-03-31T18:30:00Z', 1), P + 'invoices_v1_FY2027-28');
  assert.equal(Store.shardKey('receipts', '2027-03-31T18:29:59Z', 3), P + 'receipts_v1_FY2026-27_p3');
  const bad = [
    P + 'invoices_v1_FY2026-27_p1', P + 'invoices_v1_FY2026-27_p0', P + 'invoices_v1_FY2026-27_p1000', P + 'invoices_v1_2026-27',
    P + 'invoices_v1_FY2026', P + 'invoices_v1_2026-11', P + 'receipts_v1_FY2026-27_p', P + 'receipts_v1_FY26-27', P + 'receipts_v1',
    P + 'invoices_v2_FY2026-27', P + 'estimates_v1_FY2026-27', P + 'money_v1_FY2026-27', P + 'docs_v1_FY2026-27x', 'xsaagar_svcs_invoices_v1_FY2026-27',
    'saagar_stock_invoices_v1_FY2026-27', P + 'invoices_v1_FY2026-27_2'
  ];
  for (const k of bad) {
    assert.equal(Store.KEY_RE.fy2.test(k), false, k);
    if (!/docs_v1_FY2026-27x/.test(k)) assert.equal(Store.parseShardKey(k), null, k);
  }
  // the docs stream keeps its own pattern and nothing else matches the old fy member
  assert.equal(Store.KEY_RE.fy.test(P + 'invoices_v1_FY2026-27'), false);
  assert.equal(Store.KEY_RE.fy2.test(P + 'docs_v1_FY2026-27'), false);
  assert.equal(Store.parseShardKey(P + 'docs_v1_FY2026-27_p4').stream, 'docs');
});

test('T2S-6 first write to each new stream: id, zero previous hash, head row text, revision 1, device mark', () => {
  for (const [stream, id, kind] of [['invoices', 'INV-000001', 'EST_SAVE'], ['receipts', 'RCT-000001', 'RRV']]) {
    const clock = makeClock(AT);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    const res = expectOk(put(store, stream, { k: kind, b: { jobId: 'J-1' } }));
    assert.equal(res.rev, 1);
    assert.equal(res.n, 1);
    assert.equal(res.key, P + stream + '_v1_FY2026-27');
    const rec = res.records[0];
    assert.equal(rec.id, id);
    assert.equal(rec.p, ZERO);
    assert.equal(rec.at, AT);
    assert.equal(rec.h, Store.sha256Hex([stream, ZERO, 1, AT, kind, '', Store.canonicalText(ACTORS.manager), '{"jobId":"J-1"}'].join('\n')));
    const head = adapter.data.get(Store.HEAD_KEY);
    assert.equal(head, '[{"s":"' + stream + '","rev":1,"n":1,"h":"' + rec.h + '","at":"' + AT + '","key":"' + P + stream + '_v1_FY2026-27"}]');
    assert.ok(adapter.data.get(Store.WATERMARK_KEY).includes('"' + stream + '":{"h":"' + rec.h + '","n":1,"rev":1}'));
    assert.deepEqual(store.head(stream), { ok: true, rev: 1, n: 1, h: rec.h, at: AT, key: P + stream + '_v1_FY2026-27' });
    assert.equal(store.head(stream === 'invoices' ? 'receipts' : 'invoices').rev, 0);
    // a fresh store sees the same
    const again = openStore(adapter, clock);
    assert.equal(again.read(stream).records.length, 1);
    const o = again.open();
    assert.equal(o.summary.counts[stream], 1);
    assert.equal(o.summary.counts.ledger, 0);
    assert.equal(o.blocked, false);
  }
});

test('T2S-7 head rows: nine rows sorted by name, and a crash between shard and head heals for both new streams', () => {
  const clock = makeClock(AT);
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const streams = ['receipts', 'parts', 'ledger', 'labour', 'invoices', 'docs', 'defective', 'config', 'audit'];
  for (const s of streams) { clock.advance(1000); expectOk(put(store, s, { k: 'TEST', b: { s } })); }
  const rows = JSON.parse(adapter.data.get(Store.HEAD_KEY));
  assert.deepEqual(rows.map((x) => x.s), ['audit', 'config', 'defective', 'docs', 'invoices', 'labour', 'ledger', 'parts', 'receipts']);
  assert.deepEqual(rows.map((x) => x.rev), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(Object.keys(store.open().summary.counts).length, 9);
  for (const stream of ['invoices', 'receipts']) {
    clock.advance(1000);
    adapter.killAfter = adapter.setCount + 1; // the shard is written, the head row is not
    const hw = expectFail(put(store, stream, { k: 'TEST', b: { i: 2 }, r: 'REF:crash:' + stream }), 'SVCS_HEAD_WRITE_FAILED');
    assert.equal(hw.committed, true);
    assert.equal(hw.n, 2);
    adapter.killAfter = Infinity;
    clock.advance(1000);
    expectFail(put(store, stream, { k: 'TEST', b: { i: 3 } }), 'SVCS_HEAD_BEHIND');
    const fresh = newStore(adapter, clock);
    const o = fresh.open();
    assert.deepEqual(o.healed, ['HEAD_HEALED:' + stream]);
    assert.equal(o.blocked, false);
    assert.deepEqual(o.problems, []);
    assert.equal(fresh.head(stream).rev, 2);
    assert.equal(fresh.findRef(stream, 'REF:crash:' + stream).n, 2);
    expectFail(put(fresh, stream, { k: 'TEST', b: {}, r: 'REF:crash:' + stream }), 'SVCS_DUPLICATE_REF');
    expectOk(put(fresh, stream, { k: 'TEST', b: { i: 4 } }));
    assert.equal(fresh.verifyAll().problems.length, 0);
  }
});

test('T2S-7b a very first write to a new stream that stopped before its head row is healed', () => {
  for (const stream of ['invoices', 'receipts']) {
    const clock = makeClock(AT);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    adapter.killAfter = adapter.setCount + 1;
    expectFail(put(store, stream, { k: 'TEST', b: {}, r: 'REF:first:1' }), 'SVCS_HEAD_WRITE_FAILED');
    adapter.killAfter = Infinity;
    const o = newStore(adapter, clock).open();
    assert.deepEqual(o.healed, ['HEAD_HEALED:' + stream]);
    assert.equal(o.blocked, false);
  }
});

test('T2S-8 shard roll at 45,000 characters for the new streams; a batch is never split; 400,001 characters is refused', () => {
  for (const stream of ['invoices', 'receipts']) {
    const clock = makeClock(AT);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    const filler = 'w'.repeat(380);
    for (let i = 0; i < 40; i++) { clock.advance(1000); expectOk(put(store, stream, { k: 'TEST', b: { i, filler, filler2: filler, filler3: filler } })); }
    const keys = adapter.svcsKeys().filter((k) => k.indexOf(P + stream + '_') === 0);
    assert.deepEqual(keys, [P + stream + '_v1_FY2026-27', P + stream + '_v1_FY2026-27_p2']);
    for (const k of keys) assert.ok(adapter.data.get(k).length <= 45000, k);
    assert.equal(store.read(stream).records.length, 40);
    // a batch that does not fit goes whole into the next part
    const before = adapter.data.get(keys[1]).length;
    const batch = [];
    for (let i = 0; i < 30; i++) batch.push({ k: 'TEST', b: { i, filler, filler2: filler, filler3: filler } });
    clock.advance(1000);
    const res = expectOk(put(store, stream, batch));
    assert.ok(before > 10000);
    assert.equal(res.key, P + stream + '_v1_FY2026-27_p3');
    const lastKey = res.key;
    const inLast = JSON.parse(adapter.data.get(lastKey));
    assert.ok(inLast.some((r) => r.n === res.n) && inLast.some((r) => r.n === res.n - 29), 'all thirty records are in one shard');
    assert.equal(store.verifyAll().problems.length, 0);
    // too large
    const fat = [];
    for (let i = 0; i < 200; i++) fat.push({ k: 'TEST', b: { a: 'x'.repeat(400), b: 'y'.repeat(400), c: 'z'.repeat(400), d: 'v'.repeat(400), e: 'u'.repeat(400), f: 't'.repeat(400) } });
    clock.advance(1000);
    expectFail(put(store, stream, fat), 'SVCS_DOC_TOO_LARGE');
    assert.equal(store.verifyAll().problems.length, 0);
  }
});

test('T2S-19 forbidden fields and canonical rules apply to both new streams; GSTIN and state code names are allowed', () => {
  for (const stream of ['invoices', 'receipts']) {
    const store = openStore(makeAdapter(), makeClock(AT));
    const tryBody = (b) => put(store, stream, { k: 'TEST', b });
    for (const b of [{ custName: 'x' }, { mobile: '1' }, { nested: { address: 'x' } }, { lines: [{ Email: 'x' }] }, { customerName: 'x' }, { pan: 'x' }, { PAN: 'x' }, { aadhaar: '1' }, { phone: '1' }]) {
      expectFail(tryBody(b), 'SVCS_BODY_FORBIDDEN_FIELD');
    }
    for (const b of [{ amountPaise: 1.5 }, { s: 'x'.repeat(401) }, { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }, { n: NaN }, { n: Infinity }, { u: undefined, d: new Date(0) }]) {
      expectFail(tryBody(b), 'SVCS_BODY_NOT_CANONICAL');
    }
    // allowed names of the wave: the recipient GSTIN and state code, job id, rate in basis points
    expectOk(tryBody({ jobId: 'J-1', recipientGstin: '', recipientStateCode: '27', rateBp: 1800, amountPaise: 118000 }));
    expectOk(tryBody({ gstin: 'x', buyerGstin: 'x', b2b: true, placeState: '27', gstinCaptured: false, panel: 'ok', phoneModel: 'ok' }));
  }
});

test('T2S-20 clock rules per new stream: clamp, 25 hours behind refused, Owner override only', () => {
  for (const stream of ['invoices', 'receipts']) {
    const clock = makeClock(AT);
    const adapter = makeAdapter();
    const store = openStore(adapter, clock);
    expectOk(put(store, stream, { k: 'TEST', b: { i: 1 } }));
    // a clock 10 minutes behind the stream's last record is clamped to it
    clock.advance(-600000);
    const r2 = expectOk(put(store, stream, { k: 'TEST', b: { i: 2 } }));
    assert.equal(r2.records[0].at, AT);
    // another stream is not clamped by this one
    const other = stream === 'invoices' ? 'receipts' : 'invoices';
    assert.equal(expectOk(put(store, other, { k: 'TEST', b: { i: 1 } })).records[0].at, '2026-11-18T04:50:00.000Z');
    // 25 hours behind: refused; staff and manager override refused; Owner override accepted and marked
    clock.set('2026-11-17T04:00:00.000Z');
    expectFail(put(store, stream, { k: 'TEST', b: { i: 3 } }), 'SVCS_CLOCK_BACK');
    expectFail(put(store, stream, { k: 'TEST', b: { i: 3 } }, { clockOverride: true }), 'SVCS_OWNER_REQUIRED');
    expectFail(put(store, stream, { k: 'TEST', b: { i: 3 } }, { clockOverride: true, actor: ACTORS.staff }), 'SVCS_OWNER_REQUIRED');
    const ov = expectOk(put(store, stream, { k: 'TEST', b: { i: 3 } }, { clockOverride: true, actor: ACTORS.owner }));
    assert.equal(ov.records[0].at, AT);
    assert.equal(ov.records[0].b.clockOverride, true);
  }
});

test('T2S-25 the first Phase 2 postings through the numbered helpers carry the right ids and series', () => {
  const clock = makeClock(AT);
  const store = openStore(makeAdapter(), clock);
  const inv = expectOk(postInvoice(store));
  assert.equal(inv.records[0].b.no, 'SV/2026-27/0001');
  assert.equal(inv.records[0].id, 'INV-000001');
  clock.advance(1000);
  const adv = expectOk(postAdvance(store));
  assert.equal(adv.records[0].b.no, 'SAR/26-27/0001');
  assert.equal(adv.records[0].id, 'RCT-000001');
});

test('T2S-26 names that were dropped from the plan (estimates, money, SNC, INV) are refused as streams and series', () => {
  const store = openStore(makeAdapter(), makeClock(AT));
  expectFail(store.read('estimates'), 'SVCS_ARGS_INVALID');
  expectFail(store.read('money'), 'SVCS_ARGS_INVALID');
  expectFail(store.head('estimates'), 'SVCS_ARGS_INVALID');
  expectFail(store.append('money', [{ k: 'TEST', b: {} }], { expectRev: 0, actor: ACTORS.owner }), 'SVCS_ARGS_INVALID');
  expectFail(store.lastNumber('SNC', AT), 'SVCS_ARGS_INVALID');
  expectFail(store.nextNumber('INV', AT), 'SVCS_ARGS_INVALID');
  assert.equal(store.findRef('money', 'REF:x:1'), null);
  // the guard names are the nine streams
  expectOk(put(store, 'invoices', { k: 'TEST', b: {} }, { guardRevs: { ledger: 0, receipts: 0 } }));
  expectFail(put(store, 'invoices', { k: 'TEST', b: {} }, { guardRevs: { money: 0 } }), 'SVCS_ARGS_INVALID');
  assert.equal(newStore(makeAdapter(), makeClock(AT)).open().ok, true);
});
