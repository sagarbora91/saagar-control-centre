// Service Stores store: pure primitives (T-S1 to T-S5, T-S22, T-S23) and the code tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Store, makeAdapter, makeClock, newStore, openStore } from './lib/svc1-store-harness.mjs';

const SRC_PATH = new URL('../www/service-stores-store.js', import.meta.url);
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const node = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

test('T-S1 sha256 matches the standard vectors and node:crypto', () => {
  assert.equal(Store.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(Store.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    Store.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
  );
  assert.equal(Store.sha256Hex('a'.repeat(1000000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  // boundary lengths around the padding rules
  for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128]) {
    const s = 'x'.repeat(n);
    assert.equal(Store.sha256Hex(s), node(s), 'length ' + n);
  }
  // 300 deterministic pseudo-random strings, including Devanagari and emoji (no Math.random: fixed seed)
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const pool = ['a', 'Z', '7', ' ', '\n', 'é', 'ñ', '€', 'अ', 'क', 'ह', 'मराठी', '😀', '🧾', '𝒳', '\u0000', '"', '\\'];
  for (let i = 0; i < 300; i++) {
    let s = '';
    const len = rnd() % 140;
    for (let j = 0; j < len; j++) s += pool[rnd() % pool.length];
    assert.equal(Store.sha256Hex(s), node(s), 'case ' + i);
  }
  // lone surrogates are encoded like the standard encoder does (replacement character)
  assert.equal(Store.sha256Hex('a\ud800b'), node('a\ud800b'));
  assert.equal(Store.sha256Hex('\udc00'), node('\udc00'));
});

test('T-S2 canonical text: order, integers only, refusals', () => {
  const c = Store.canonicalText;
  assert.equal(c({ b: 1, a: [2, { z: null, y: true }], c: 'x' }), '{"a":[2,{"y":true,"z":null}],"b":1,"c":"x"}');
  assert.equal(c({ a: 1, b: 2 }), c({ b: 2, a: 1 }));
  assert.equal(c([]), '[]');
  assert.equal(c({}), '{}');
  assert.equal(c(-5), '-5');
  assert.equal(c(9007199254740991), '9007199254740991');
  assert.equal(c('é"\\'), JSON.stringify('é"\\'));
  for (const bad of [1.5, NaN, Infinity, undefined, () => 1, new Date(0), 9007199254740992, { a: undefined }, [undefined], Symbol('x')]) {
    assert.equal(c(bad), null, String(bad));
  }
  assert.equal(c(JSON.parse('{"__proto__":1}')), null);
  assert.equal(c({ constructor: 1 }), null);
  assert.equal(c({ prototype: 1 }), null);
  // depth: 8 nested containers are allowed, 9 are not
  let d8 = 1; for (let i = 0; i < 8; i++) d8 = { a: d8 };
  let d9 = 1; for (let i = 0; i < 9; i++) d9 = { a: d9 };
  assert.notEqual(c(d8), null);
  assert.equal(c(d9), null);
  // strings: 400 allowed, 401 not
  assert.notEqual(c('x'.repeat(400)), null);
  assert.equal(c('x'.repeat(401)), null);
  assert.equal(c({ ['k'.repeat(401)]: 1 }), null);
  // fixed expected text (same on every engine)
  assert.equal(c({ note: 'ok', qty: 3, lines: [{ partCode: 'A-1', qty: 2 }] }), '{"lines":[{"partCode":"A-1","qty":2}],"note":"ok","qty":3}');
});

test('T-S3 customer-style field names are refused at any depth, ids are fine', () => {
  const clock = makeClock();
  const store = openStore(makeAdapter(), clock);
  const actor = { t: 'manager', r: 'Store Manager', m: 'x' };
  const tryBody = (b) => store.append('audit', [{ k: 'NOTE', b }], { expectRev: store.head('audit').rev, actor });
  for (const b of [{ mobile: '1' }, { custName: 'x' }, { Email: 'x' }, { lines: [{ nested: { address: 'x' } }] }, { Phone: 'x' }, { aadhaar: '1' }, { PAN: 'x' }, { customerMobile: '1' }, { customerName: 'x' }]) {
    const r = tryBody(b);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SVCS_BODY_FORBIDDEN_FIELD', JSON.stringify(b));
  }
  assert.equal(tryBody({ jobId: 'J-1', panel: 'ok', phoneModel: 'ok' }).ok, true);
});

test('T-S4 key naming: shardKey and parseShardKey round trip, KEY_RE accepts only the right keys', () => {
  const at = '2026-11-13T05:00:00.000Z';
  for (const stream of Object.keys(Store.STREAMS)) {
    for (const part of [1, 2, 10, 99, 100, 999]) {
      const key = Store.shardKey(stream, at, part);
      assert.ok(key && key.indexOf(Store.SVCS_PREFIX) === 0, stream + part);
      const p = Store.parseShardKey(key);
      assert.equal(p.stream, stream);
      assert.equal(p.part, part);
      const kind = Store.STREAMS[stream].period;
      assert.equal(p.period, kind === 'month' ? '2026-11' : kind === 'fy' ? 'FY2026-27' : '');
    }
  }
  assert.equal(Store.shardKey('ledger', at, 1), Store.SVCS_PREFIX + 'ledger_v1_2026-11');
  assert.equal(Store.shardKey('ledger', at, 2), Store.SVCS_PREFIX + 'ledger_v1_2026-11_p2');
  assert.equal(Store.shardKey('docs', at), Store.SVCS_PREFIX + 'docs_v1_FY2026-27');
  assert.equal(Store.shardKey('parts', at, 3), Store.SVCS_PREFIX + 'parts_v1_p3');
  assert.equal(Store.shardKey('config', undefined, 1), Store.SVCS_PREFIX + 'config_v1');
  assert.equal(Store.shardKey('ledger', at, 0), null);
  assert.equal(Store.shardKey('ledger', at, 1000), null);
  assert.equal(Store.shardKey('ledger', 'nope', 1), null);
  assert.equal(Store.shardKey('nope', at, 1), null);
  const P = Store.SVCS_PREFIX;
  const good = [
    P + 'head_v1', P + 'parts_v1', P + 'parts_v1_p2', P + 'labour_v1_p999', P + 'config_v1', P + 'config_v1_p3', P + 'defective_v1',
    P + 'ledger_v1_2026-11', P + 'ledger_v1_2026-11_p2', P + 'audit_v1_2026-01', P + 'docs_v1_FY2026-27', P + 'docs_v1_FY2026-27_p12', 'st_v2_svcs_watermark_v1'
  ];
  const any = (k) => Object.values(Store.KEY_RE).some((re) => re.test(k));
  for (const k of good) assert.ok(any(k), k);
  const bad = [
    P + 'ledger_v1_2026-13', P + 'ledger_v1_2026-00', P + 'ledger_v1_2026-11_p1', P + 'ledger_v1_2026-11_p0', P + 'ledger_v1_2026-11_p1000',
    P + 'parts_v1_p1', P + 'parts_v1_p0', P + 'parts_v1_p1000', P + 'head_v2', P + 'ledger_v1', P + 'docs_v1_2026-27', P + 'docs_v1_FY2026', P + 'nope_v1',
    'saagar_stock_head_v1', 'saagar_svcs_', 'xsaagar_svcs_head_v1', P + 'parts_v1_p2x', 'st_v2_svcs_watermark_v2'
  ];
  for (const k of bad) assert.ok(!any(k), k);
  assert.equal(Store.parseShardKey(P + 'head_v1'), null);
  assert.equal(Store.parseShardKey('x'), null);
  assert.equal(Store.parseShardKey(5), null);
});

test('T-S5 IST boundaries for month, date and financial year', () => {
  const f = Store;
  assert.equal(f.istMonth('2026-03-31T18:29:59Z'), '2026-03');
  assert.equal(f.istMonth('2026-03-31T18:30:00Z'), '2026-04');
  assert.equal(f.istDate('2026-03-31T18:29:59Z'), '2026-03-31');
  assert.equal(f.istDate('2026-03-31T18:30:00Z'), '2026-04-01');
  assert.equal(f.fyLabel('2026-03-31T18:29:59Z'), 'FY2025-26');
  assert.equal(f.fyLabel('2026-03-31T18:30:00Z'), 'FY2026-27');
  assert.equal(f.fyShort('2026-03-31T18:29:59Z'), '25-26');
  assert.equal(f.fyShort('2026-03-31T18:30:00Z'), '26-27');
  assert.equal(f.istMonth('2026-12-31T18:30:00Z'), '2027-01');
  assert.equal(f.fyShort('2026-12-31T18:30:00Z'), '26-27');
  assert.equal(f.istDate('2028-02-28T18:30:00Z'), '2028-02-29');
  assert.equal(f.istDate('2028-02-29T18:30:00Z'), '2028-03-01');
  assert.equal(f.fyShort('2099-04-01T00:00:00Z'), '99-00');
  assert.equal(f.fyLabel('2099-04-01T00:00:00Z'), 'FY2099-00');
  assert.equal(f.istMonth('2026-11-13T05:00:00.123Z'), '2026-11');
  for (const bad of ['', 'nope', '2026-13-01T00:00:00Z', '2026-02-30T00:00:00Z', null, 5, '2026-11-13']) {
    assert.equal(f.istMonth(bad), null, String(bad));
    assert.equal(f.istDate(bad), null);
    assert.equal(f.fyLabel(bad), null);
    assert.equal(f.fyShort(bad), null);
  }
});

test('T-S22 adapter reads the key list once and never loops localStorage.key', () => {
  const store = new Map();
  let keyCalls = 0; let keysCalls = 0;
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      get length() { return store.size; },
      key: (i) => { keyCalls += 1; return Array.from(store.keys())[i] ?? null; }
    },
    parent: { SaagarStore: { keys: () => { keysCalls += 1; return Array.from(store.keys()); }, authoritative: () => true } }
  };
  const adapter = Store.adapterFromWindow(win);
  const clock = makeClock();
  const s = newStore(adapter, clock);
  assert.equal(s.open().ok, true);
  assert.equal(keysCalls, 1);
  assert.equal(keyCalls, 0);
  const r = s.append('audit', [{ k: 'NOTE', b: { x: 1 } }], { expectRev: 0, actor: { t: 'owner', r: 'Owner', m: '' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(store.has(Store.HEAD_KEY));
  // not authoritative: refused and nothing written
  win.parent.SaagarStore.authoritative = () => false;
  const before = store.size;
  const bad = s.append('audit', [{ k: 'NOTE', b: { x: 2 } }], { expectRev: 1, actor: { t: 'owner', r: 'Owner', m: '' } });
  assert.equal(bad.code, 'SVCS_STORAGE_UNAVAILABLE');
  assert.equal(store.size, before);
  // a parent that throws: falls back to one local loop, no exception
  const win2 = { localStorage: win.localStorage, get parent() { throw new Error('cross-origin'); } };
  const a2 = Store.adapterFromWindow(win2);
  assert.equal(a2.authoritative(), true);
  assert.deepEqual(a2.keys().sort(), Array.from(store.keys()).sort());
  assert.ok(keyCalls > 0);
  // no parent at all
  const a3 = Store.adapterFromWindow({ localStorage: win.localStorage });
  assert.equal(a3.authoritative(), true);
  assert.equal(a3.keys().length, store.size);
  // a parent keys() that throws also falls back
  const win4 = { localStorage: win.localStorage, parent: { SaagarStore: { keys() { throw new Error('x'); } } } };
  assert.equal(Store.adapterFromWindow(win4).keys().length, store.size);
});

test('T-S23 source rules for the store file', () => {
  assert.ok(!SRC.includes('\r'), 'no CR');
  assert.ok(!SRC.startsWith('﻿'), 'no BOM');
  assert.ok(SRC.endsWith('});\n') && !SRC.endsWith('\n\n'), 'ends with one newline');
  const banned = [
    'postMessage', 'ST_', "addEventListener('message'", 'document.write', "createElement('script')", 'import(', 'eval(', 'new Function',
    'fetch(', 'XMLHttpRequest', 'window.open', 'sendBeacon', 'WebSocket', 'http://', 'https://', 'sessionStorage', 'indexedDB',
    'localStorage.removeItem', 'localStorage.clear', 'custName', 'custMobile', 'custAddr', 'Math.random', 'Date.now', 'new Date()',
    'setTimeout', 'setInterval', 'structuredClone', '.flat(', '.fill(', '.at(', 'padEnd', 'replaceAll'
  ];
  for (const b of banned) assert.ok(!SRC.includes(b), 'banned text: ' + b);
  assert.ok(!/\bwindow\b/.test(SRC), 'window');
  assert.ok(!/\bdocument\b/.test(SRC), 'document');
  // strict ES5
  assert.ok(!/=>/.test(SRC), 'arrow');
  assert.ok(!/\b(let|const|class|async|await|yield)\b/.test(SRC), 'es6 keyword');
  assert.ok(!/`/.test(SRC), 'template literal');
  assert.ok(!/\.\.\./.test(SRC), 'spread');
  // one storage write call, one prefix literal
  assert.equal((SRC.match(/setItem\(/g) || []).length, 1, 'setItem( count');
  assert.equal((SRC.match(/saagar_svcs_/g) || []).length, 1, 'prefix literal count');
  assert.ok(/Storage write: head, shard and watermark keys/.test(SRC), 'write site comment');
  assert.ok(!/safeSet\(|store\.set\(/.test(SRC));
  // UMD wrapper as the other pure files
  assert.ok(SRC.startsWith('(function (root, factory) {\n  var api = factory();\n  if (typeof module === \'object\' && module.exports) module.exports = api;\n  if (root) root.SaagarServiceStoresStore = api;\n})(typeof globalThis !== \'undefined\' ? globalThis : this, function () {\n  \'use strict\';'));
});

test('code tables: every code has a message, nothing else is exported by accident', () => {
  const codes = Object.keys(Store.CODES);
  assert.deepEqual(codes.sort(), Object.keys(Store.MESSAGES).sort());
  for (const c of codes) {
    assert.equal(Store.CODES[c], c);
    assert.ok(/^SVCS_[A-Z_]+$/.test(c));
    assert.ok(Store.MESSAGES[c].length > 8);
    assert.ok(!/\bdocument\b|\bwindow\b/.test(Store.MESSAGES[c]));
  }
  assert.ok(codes.includes('SVCS_SERIES_MISMATCH'));
  assert.ok(Object.isFrozen(Store) && Object.isFrozen(Store.CODES) && Object.isFrozen(Store.MESSAGES));
  assert.deepEqual(Object.keys(Store).sort(), [
    'CODES', 'HEAD_KEY', 'KEY_RE', 'LIMITS', 'MESSAGES', 'SERIES', 'STREAMS', 'SVCS_PREFIX', 'VERSION', 'WATERMARK_KEY',
    'adapterFromWindow', 'canonicalText', 'createStore', 'fyLabel', 'fyShort', 'istDate', 'istMonth', 'parseShardKey', 'sha256Hex', 'shardKey'
  ]);
  assert.deepEqual(Object.keys(Store.SERIES).sort(), ['ADJ', 'CSL', 'GRN', 'ISS', 'OLD', 'OPN', 'RET', 'SAR', 'SCN', 'SCR', 'SRC', 'SRF', 'SV']);
  assert.equal(Store.SERIES.OLD.stream, 'defective');
  assert.equal(Store.SERIES.SCR.stream, 'defective');
  assert.equal(Store.SERIES.GRN.stream, 'ledger');
  assert.deepEqual(Object.keys(Store.STREAMS).sort(), ['audit', 'config', 'defective', 'docs', 'invoices', 'labour', 'ledger', 'parts', 'receipts']);
  assert.equal(Store.STREAMS.config.code, 'CFG');
  assert.equal(Store.VERSION, 'SVCS_STORE_V1');
  assert.equal(Store.SVCS_PREFIX, 'saagar_svcs_');
  assert.equal(Store.WATERMARK_KEY, 'st_v2_svcs_watermark_v1');
});

test('createStore refuses a bad adapter or a missing clock without throwing', () => {
  assert.equal(Store.createStore(null, { now: () => '2026-01-01T00:00:00Z' }).code, 'SVCS_ARGS_INVALID');
  assert.equal(Store.createStore({ getItem() {} }, { now: () => 1 }).code, 'SVCS_ARGS_INVALID');
  assert.equal(Store.createStore(makeAdapter(), {}).code, 'SVCS_ARGS_INVALID');
  assert.equal(Store.createStore(makeAdapter()).code, 'SVCS_ARGS_INVALID');
  // the clock may return an ISO string, a Date or a number
  for (const now of [() => '2026-11-13T05:00:00Z', () => new Date('2026-11-13T05:00:00Z'), () => Date.UTC(2026, 10, 13, 5)]) {
    const s = openStore(makeAdapter(), { now });
    const r = s.nextAt('ledger');
    assert.equal(r.at, '2026-11-13T05:00:00.000Z');
  }
  // a broken clock fails closed
  const s2 = openStore(makeAdapter(), { now: () => 'garbage' });
  assert.equal(s2.nextAt('ledger').code, 'SVCS_ARGS_INVALID');
});
