// Service Stores store: backup, restore, reset and the shell storage rules (T-B1 to T-B13).
// The REAL shell functions from www/index.html are run in a vm sandbox (tests/lib/svc1-store-shell.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  Store, ACTORS, makeAdapter, makeClock, newStore, openStore, put, postNumbered, expectOk, expectFail
} from './lib/svc1-store-harness.mjs';
import { shellBox, installBulk, autoBackupSnapshot, shell, fn, INDEX_PATH } from './lib/svc1-store-shell.mjs';

const require = createRequire(import.meta.url);
const P = Store.SVCS_PREFIX;
const plain = (v) => JSON.parse(JSON.stringify(v));

// A store with three months, two parts in October, and every stream used.
function fixture() {
  const clock = makeClock('2026-09-10T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const filler = 'z'.repeat(300);
  let seq = 0;
  for (const [month, count] of [['2026-09-10T05:00:00.000Z', 8], ['2026-10-12T05:00:00.000Z', 170], ['2026-11-13T05:00:00.000Z', 8]]) {
    clock.set(month);
    for (let i = 0; i < count; i++) {
      clock.advance(1000); seq += 1;
      expectOk(postNumbered(store, 'GRN', 'ledger', 'GRN', { qty: seq, unitCostPaise: 100 + seq, filler }, { r: 'REF:b:' + seq }));
    }
    clock.advance(1000);
    expectOk(put(store, 'docs', { k: 'OPN_PROPOSE', b: { lines: [{ partCode: 'P1', qty: 1, unitCostPaise: 1 }] } }));
    expectOk(put(store, 'audit', { k: 'NOTE', b: { m: month.slice(0, 7) } }));
  }
  clock.advance(1000);
  expectOk(put(store, 'parts', { k: 'PART_CREATE', b: { code: 'T-1', row: { code: 'T-1', sellPricePaise: 5000 }, changes: [], reason: 'seed', via: 'manual', batchId: 'B1' } }));
  expectOk(put(store, 'labour', { k: 'LAB_CREATE', b: { code: 'L-1', row: { code: 'L-1', ratePaise: 25000 }, changes: [], reason: 'seed', via: 'manual', batchId: 'B2' } }));
  expectOk(put(store, 'config', { k: 'CONFIG_SET', b: { adjustLimitPaise: 0, storeRoles: [] } }));
  expectOk(postNumbered(store, 'OLD', 'defective', 'OLD_REGISTER', { jobId: 'J-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM' }));
  return { adapter, clock, store };
}

function sumQty(store) {
  return store.read('ledger').records.reduce((t, r) => t + r.b.qty, 0);
}

test('T-B1 STORAGE_RULES shape and the size of index.html', () => {
  const box = shellBox(new Map());
  const rules = plain(box.run('STORAGE_RULES'));
  assert.deepEqual(rules.service, { exact: ['saagar_wsf_v2', 'saagar_wsf_settings_v1', 'saagar_invoice_seq_v1'], prefix: ['saagar_svcs_'] });
  const expected = {
    stock: { exact: ['saagar_cros', 'saagar_appstate', 'saagar_brands', 'saagar_brands_hidden', 'saagar_stk_clearlog_v1'], prefix: ['saagar_stock_'] },
    expense: { exact: ['gm_expenses', 'gm_role', 'tanishq_statements', 'saagar_udhaar_ledger_v1'], prefix: ['gm_'] },
    grooming: { exact: [], prefix: ['saagar_grooming_'] },
    payroll: { exact: ['payroll_suite_v1_2026', 'payroll_fnf_v1'], prefix: [] },
    leave: { exact: [], prefix: ['leavedesk_'] },
    tax: { exact: ['taxcal_v2'], prefix: [] },
    qms: { exact: ['retail_queue_management_v1'], prefix: [] },
    dsr: { exact: ['saagar_dsr_staff', 'saagar_dsr_settings'], prefix: ['saagar_dsr_'] },
    cro_audit: { exact: ['cro_s_v3', 'cro_audits_v3'], prefix: [] },
    planning: { exact: ['saagar_festival_calendar_v1'], prefix: [] }
  };
  const others = Object.assign({}, rules); delete others.service;
  assert.deepEqual(others, expected);
  const bytes = fs.readFileSync(INDEX_PATH);
  // 579,803 after the prefix edit, plus the 20-byte step-up guard of the second pass (D3) = 579,823
  assert.equal(bytes.length, 579823);
  assert.ok(bytes.length < 580636);
  assert.equal(bytes.indexOf(13), -1, 'LF only');
  assert.notDeepEqual(Array.from(bytes.subarray(0, 3)), [0xEF, 0xBB, 0xBF], 'no BOM');
  const line = '  service: { exact: ["saagar_wsf_v2","saagar_wsf_settings_v1","saagar_invoice_seq_v1"], prefix: ["saagar_svcs_"] },';
  assert.equal(shell.split(line).length, 2, 'the changed line occurs once');
  assert.equal(shell.split('prefix: ["saagar_svcs_"]').length, 2);
  // no other prefix rule overlaps the new one
  for (const [id, r] of Object.entries(rules)) if (id !== 'service') for (const p of r.prefix) assert.ok(!P.startsWith(p) && !p.startsWith(P), id);
  // the A4 audit reads this literal with a regex that accepts a non-empty prefix list
  assert.match(shell, /service:\s*\{\s*exact:\s*\[[^\]]*\],\s*prefix:\s*\["saagar_svcs_"\]\s*\}/);
});

test('T-B2 every key the store can create in a year is whitelisted and owned by Service; the watermark is not', () => {
  const clock = makeClock('2026-04-02T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const filler = 'q'.repeat(380);
  for (let month = 0; month < 14; month++) {
    clock.set(new Date(Date.UTC(2026, 3 + month, 5, 5)).toISOString());
    for (const stream of Object.keys(Store.STREAMS)) {
      for (let i = 0; i < (stream === 'parts' ? 300 : 3); i++) {
        clock.advance(1000);
        expectOk(put(store, stream, { k: 'TEST', b: { i, filler: stream === 'parts' ? filler : 'x' } }));
      }
    }
  }
  const keys = adapter.svcsKeys();
  assert.ok(keys.length > 40);
  assert.ok(keys.some((k) => /parts_v1_p3$/.test(k)), 'three part keys');
  assert.ok(keys.some((k) => /docs_v1_FY2026-27$/.test(k)) && keys.some((k) => /docs_v1_FY2027-28$/.test(k)));
  const box = shellBox(new Map());
  for (const k of keys) {
    assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(k)})`), true, k);
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(k)}).id`), 'service', k);
    assert.equal(box.run(`restoreKeyOwnerId(${JSON.stringify(k)})`), 'service', k);
    assert.ok(Object.values(Store.KEY_RE).some((re) => re.test(k)), k);
  }
  assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(Store.WATERMARK_KEY)})`), false);
  assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(Store.WATERMARK_KEY)})`), undefined);
  assert.ok(adapter.data.has(Store.WATERMARK_KEY));
});

test('T-B3 backup content: all svcs keys with exact text, no watermark', () => {
  const { adapter } = fixture();
  const data = new Map(adapter.data);
  data.set('saagar_wsf_v2', '[]');
  data.set('st_v2_admin_pin_hash', 'secret');
  const box = shellBox(data);
  const backup = plain(box.run('backupStorageStrict()'));
  const keys = adapter.svcsKeys();
  assert.ok(keys.length >= 12);
  for (const k of keys) assert.equal(backup[k], adapter.data.get(k), k);
  assert.equal(Store.WATERMARK_KEY in backup, false);
  assert.equal('st_v2_admin_pin_hash' in backup, false);
  assert.equal(backup.saagar_wsf_v2, '[]');
  const payload = plain(box.run('backupPayload()'));
  const svc = payload.modules.find((m) => m.id === 'service');
  assert.deepEqual(svc.keys.filter((k) => k.indexOf(P) === 0).sort(), keys);
  assert.ok(svc.keys.includes('saagar_wsf_v2'));
  assert.equal(payload.localStorage[P + 'head_v1'], adapter.data.get(P + 'head_v1'));
});

test('T-B4 restore validation accepts store keys and refuses bad shapes', () => {
  const { adapter } = fixture();
  const box = shellBox(new Map(adapter.data));
  const all = plain(box.run('backupStorageStrict()'));
  const good = plain(box.run(`validateRestoreData(${JSON.stringify(all)})`));
  assert.deepEqual(good.rejected, []);
  assert.deepEqual(good.invalid, []);
  assert.equal(Object.keys(good.valid).length, Object.keys(all).length);
  const key = P + 'ledger_v1_2026-11';
  for (const bad of ['{}', '"[1,"', '', 'null', '5', '"text"']) {
    const r = plain(box.run(`validateRestoreData(${JSON.stringify({ [key]: bad })})`));
    assert.deepEqual(r.invalid, [key], JSON.stringify(bad));
    assert.deepEqual(r.valid, {});
  }
  const wm = plain(box.run(`validateRestoreData(${JSON.stringify({ [Store.WATERMARK_KEY]: '{"v":1}' })})`));
  assert.deepEqual(wm.rejected, [Store.WATERMARK_KEY]);
  assert.deepEqual(wm.valid, {});
  // the three old service keys keep their special rules
  const old = plain(box.run(`validateRestoreData(${JSON.stringify({ saagar_invoice_seq_v1: '12', saagar_wsf_settings_v1: '{"idHigh":3}', saagar_wsf_v2: '[]' })})`));
  assert.deepEqual(old.invalid, []);
  assert.equal(Object.keys(old.valid).length, 3);
  const badOld = plain(box.run(`validateRestoreData(${JSON.stringify({ saagar_invoice_seq_v1: 'x', saagar_wsf_settings_v1: '[]', saagar_wsf_v2: '{}' })})`));
  assert.equal(badOld.invalid.length, 3);
});

test('T-B5 round trip byte for byte through backup, JSON file and restore', async () => {
  const { adapter, store, clock } = fixture();
  assert.ok(adapter.svcsKeys().some((k) => /ledger_v1_2026-10_p2$/.test(k)), 'two parts in a month');
  const boxA = shellBox(new Map(adapter.data));
  const file = JSON.stringify(plain(boxA.run('backupPayload()')));
  const parsed = JSON.parse(file);
  const mapB = new Map();
  const boxB = shellBox(mapB);
  const review = plain(boxB.run(`validateRestoreData(${JSON.stringify(parsed.localStorage)})`));
  assert.deepEqual(review.invalid, []);
  await boxB.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  for (const k of adapter.svcsKeys()) assert.equal(mapB.get(k), adapter.data.get(k), k);
  assert.equal(mapB.has(Store.WATERMARK_KEY), false);
  const b = makeAdapter(new Map(mapB));
  const sb = newStore(b, clock);
  const o = sb.open();
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
  assert.equal(o.watermark, 'INIT');
  assert.equal(b.data.get(P + 'head_v1'), adapter.data.get(P + 'head_v1'));
  assert.equal(sumQty(sb), sumQty(store));
  assert.equal(sb.nextNumber('GRN', '2026-11-30T00:00:00Z').no, store.nextNumber('GRN', '2026-11-30T00:00:00Z').no);
  assert.equal(sb.verifyAll().problems.length, 0);
});

test('T-B6 encrypted container round trip', async () => {
  const portable = require('../www/portable-backup.js');
  const { adapter, store, clock } = fixture();
  const box = shellBox(new Map(adapter.data));
  const bp = plain(box.run('backupPayload()'));
  const payload = {
    app: bp.app, version: '5.0.0', apkBuild: 'test', createdAt: '2026-11-13T00:00:00.000Z', scope: 'full-portable-backup',
    localStorage: bp.localStorage, photos: {}, qmsArchive: [], evidence: []
  };
  const container = await portable.seal(payload, 'correct horse battery staple', { iterations: 100000 });
  const text = JSON.stringify(container);
  assert.doesNotMatch(text, /saagar_svcs_|GRN\/26-27/);
  const opened = await portable.open(text, 'correct horse battery staple');
  assert.deepEqual(opened.payload.localStorage, payload.localStorage);
  const boxB = shellBox(new Map());
  const review = plain(boxB.run(`validateRestoreData(${JSON.stringify(opened.payload.localStorage)})`));
  assert.deepEqual(review.invalid, []);
  await boxB.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  for (const k of adapter.svcsKeys()) assert.equal(boxB.ls.data.get(k), adapter.data.get(k), k);
  const sb = newStore(makeAdapter(new Map(boxB.ls.data)), clock);
  assert.equal(sb.open().blocked, false);
  assert.equal(sumQty(sb), sumQty(store));
});

test('T-B7 a damaged shard inside a backup passes restore (shape only) and is caught when Stores opens', async () => {
  const { adapter, clock } = fixture();
  const key = P + 'ledger_v1_2026-10';
  const box = shellBox(new Map(adapter.data));
  const all = plain(box.run('backupStorageStrict()'));
  // flip a character inside a body, still valid JSON
  const flipped = Object.assign({}, all, { [key]: all[key].replace('"unitCostPaise":120}', '"unitCostPaise":121}') });
  assert.notEqual(flipped[key], all[key]);
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(flipped)})`));
  assert.deepEqual(review.invalid, [], 'shell validation is shape only');
  const mapB = new Map();
  const boxB = shellBox(mapB);
  await boxB.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  const sb = newStore(makeAdapter(new Map(mapB)), clock);
  const o = sb.open();
  assert.equal(o.blocked, true);
  assert.equal(o.problems[0].code, 'SVCS_CHAIN_BREAK');
  assert.equal(o.problems[0].stream, 'ledger');
  assert.equal(o.problems[0].key, key);
  assert.equal(o.problems[0].n, 20);
  expectFail(sb.read('ledger'), 'SVCS_BLOCKED');
  // a truncated shard lands in invalid and is not written
  const cut = Object.assign({}, all, { [key]: all[key].slice(0, -30) });
  const r2 = plain(box.run(`validateRestoreData(${JSON.stringify(cut)})`));
  assert.deepEqual(r2.invalid, [key]);
  assert.equal(key in r2.valid, false);
  const mapC = new Map();
  await shellBox(mapC).run(`restoreStorageValues(${JSON.stringify(r2.valid)})`);
  assert.equal(mapC.has(key), false);
});

test('T-B8 restore is a merge: an older backup over newer data is caught', async () => {
  const clock = makeClock('2026-10-05T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  const filler = 'f'.repeat(120);
  const post = (n) => { for (let i = 0; i < n; i++) { clock.advance(1000); expectOk(put(store, 'ledger', { k: 'TEST', b: { qty: 1, filler } })); } };
  post(100);
  const oldCopy = new Map(adapter.data);
  const oldBackup = plain(shellBox(oldCopy).run('backupStorageStrict()'));
  post(10);
  clock.set('2026-11-03T05:00:00.000Z');
  post(20);
  assert.ok(adapter.svcsKeys().some((k) => /2026-11/.test(k)));
  const restoreOld = async (target) => {
    const box = shellBox(target);
    const review = plain(box.run(`validateRestoreData(${JSON.stringify(oldBackup)})`));
    assert.deepEqual(review.invalid, []);
    await box.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
    // restore never deletes: the newer November shard is still there
    for (const k of adapter.svcsKeys()) assert.ok(target.has(k), k);
  };
  // case 1: a newer shard exists that the old backup does not know
  const dev1 = new Map(adapter.data);
  await restoreOld(dev1);
  const o1 = newStore(makeAdapter(dev1), clock).open();
  assert.equal(o1.blocked, true);
  assert.equal(o1.problems[0].code, 'SVCS_SEQ_GAP');
  assert.equal(o1.problems[0].stream, 'ledger');
  assert.match(o1.problems[0].key, /ledger_v1_2026-1[01]/);
  assert.ok(o1.problems[0].n > 100);
  // case 2: only the same shard grew, so the older text is a consistent chain: the device watermark catches it
  const adapter2 = makeAdapter();
  const clock2 = makeClock('2026-10-05T05:00:00.000Z');
  const s2 = openStore(adapter2, clock2);
  for (let i = 0; i < 100; i++) { clock2.advance(1000); expectOk(put(s2, 'ledger', { k: 'TEST', b: { qty: 1 } })); }
  const backup2 = plain(shellBox(new Map(adapter2.data)).run('backupStorageStrict()'));
  for (let i = 0; i < 30; i++) { clock2.advance(1000); expectOk(put(s2, 'ledger', { k: 'TEST', b: { qty: 1 } })); }
  const dev2 = new Map(adapter2.data);
  const box2 = shellBox(dev2);
  await box2.run(`restoreStorageValues(${JSON.stringify(plain(box2.run(`validateRestoreData(${JSON.stringify(backup2)})`)).valid)})`);
  const a2 = makeAdapter(dev2);
  const st2 = newStore(a2, clock2);
  const o2 = st2.open();
  assert.equal(o2.blocked, true);
  assert.equal(o2.problems[0].code, 'SVCS_WATERMARK_AHEAD');
  assert.equal(o2.problems[0].n, 100);
  expectFail(st2.read('ledger'), 'SVCS_BLOCKED');
});

test('T-B8b acknowledging an older restore, and a new device without a watermark', async () => {
  const clock = makeClock('2026-10-05T05:00:00.000Z');
  const adapter = makeAdapter();
  const s = openStore(adapter, clock);
  for (let i = 0; i < 100; i++) { clock.advance(1000); expectOk(put(s, 'ledger', { k: 'TEST', b: { qty: 1 } })); }
  const backup = plain(shellBox(new Map(adapter.data)).run('backupStorageStrict()'));
  for (let i = 0; i < 30; i++) { clock.advance(1000); expectOk(put(s, 'ledger', { k: 'TEST', b: { qty: 1 } })); }
  const restoreInto = async (map) => {
    const box = shellBox(map);
    const review = plain(box.run(`validateRestoreData(${JSON.stringify(backup)})`));
    await box.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  };
  // same device: the mark remembers 130 records
  const same = new Map(adapter.data);
  await restoreInto(same);
  const sameAd = makeAdapter(same);
  const st = newStore(sameAd, clock);
  assert.equal(st.open().problems[0].code, 'SVCS_WATERMARK_AHEAD');
  clock.advance(1000);
  const ack = expectOk(st.acknowledgeRestore({ actor: ACTORS.owner, reason: 'old backup restored on purpose', stepUpOk: true }));
  assert.equal(ack.record.b.from.ledger.n, 130);
  assert.equal(ack.record.b.to.ledger.n, 100);
  assert.equal(st.read('ledger').records.length, 100);
  assert.equal(st.read('audit').records.length, 1);
  const reopened = newStore(sameAd, clock).open();
  assert.equal(reopened.blocked, false);
  assert.equal(reopened.watermark, 'OK');
  // a new device never had a mark: INIT, no block
  const fresh = new Map();
  await restoreInto(fresh);
  const nd = newStore(makeAdapter(fresh), clock).open();
  assert.equal(nd.blocked, false);
  assert.equal(nd.watermark, 'INIT');
  assert.equal(nd.summary.counts.ledger, 100);
});

test('T-B9 Module Reset of Service and its undo, with the real shell functions', async () => {
  const { adapter, clock } = fixture();
  const data = new Map(adapter.data);
  data.set('saagar_wsf_v2', '[{"id":"J-1"}]');
  data.set('saagar_wsf_settings_v1', '{"idHigh":1}');
  const before = new Map(data);
  const svcsBefore = adapter.svcsKeys();
  const box = shellBox(data);
  await box.run('resetSelectedModule()');
  assert.deepEqual(box.calls.alerts, []);
  for (const k of svcsBefore) assert.equal(data.has(k), false, 'removed: ' + k);
  assert.equal(data.has('saagar_wsf_v2'), false);
  assert.equal(data.has(Store.WATERMARK_KEY), true, 'the device mark stays');
  const rbKey = Array.from(data.keys()).find((k) => k.indexOf('st_v4_restore_rollback_module_reset_service_') === 0);
  assert.ok(rbKey);
  const rb = JSON.parse(data.get(rbKey));
  assert.equal(rb.keys[P + 'ledger_v1_2026-10'], before.get(P + 'ledger_v1_2026-10'), 'the rollback holds the whole ledger text');
  assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(rbKey)})`), true, 'so it travels in the next backup');
  const asBackup = plain(box.run('backupStorageStrict()'));
  assert.ok(rbKey in asBackup);
  // while reset, a device with the mark reports it
  const afterReset = newStore(makeAdapter(new Map(data)), clock).open();
  assert.equal(afterReset.blocked, true);
  assert.equal(afterReset.problems[0].code, 'SVCS_WATERMARK_AHEAD');
  // undo
  await box.run('undoLastModuleReset()');
  for (const [k, v] of before) if (k.indexOf(P) === 0 || k.indexOf('saagar_wsf') === 0) assert.equal(data.get(k), v, k);
  const back = newStore(makeAdapter(new Map(data)), clock);
  const o = back.open();
  assert.equal(o.blocked, false);
  assert.deepEqual(o.problems, []);
  assert.equal(o.summary.counts.ledger, 186);
});

test('T-B10 factory reset scope covers the new keys', () => {
  const src = fn('factoryReset');
  const m = /const APP_RE = (\/.*?\/);/.exec(src);
  assert.ok(m, 'APP_RE found');
  const re = new Function('return ' + m[1])();
  for (const k of [P + 'head_v1', P + 'ledger_v1_2026-11_p2', P + 'docs_v1_FY2026-27', P + 'config_v1', Store.WATERMARK_KEY]) assert.ok(re.test(k), k);
});

test('T-B11 the other backup paths use the same selector', () => {
  for (const name of ['exportMigration', 'freshPortableBackupPayload', 'factoryResetSafetyBackup', 'exportBackupConfirmed']) {
    assert.ok(fn(name).includes('backupPayload()'), name);
  }
  const bp = fn('backupPayload');
  assert.ok(bp.includes('backupStorageStrict()') && bp.includes('keysForModule(m.id)'));
  const strict = fn('backupStorageStrict');
  assert.ok(strict.includes('isWhitelistedAppKey(k)'));
});

test('T-B12 the automatic device backup includes everything; restoring it drops the mark', () => {
  const { adapter } = fixture();
  const data = new Map(adapter.data);
  data.set('st_v2_admin_pin_hash', 'secret');
  const snap = autoBackupSnapshot(data);
  for (const k of adapter.svcsKeys()) assert.equal(snap.localStorage[k], adapter.data.get(k), k);
  assert.equal(snap.localStorage[Store.WATERMARK_KEY], adapter.data.get(Store.WATERMARK_KEY));
  assert.equal('st_v2_admin_pin_hash' in snap.localStorage, false);
  const box = shellBox(new Map());
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(snap.localStorage)})`));
  assert.ok(review.rejected.includes(Store.WATERMARK_KEY));
  assert.equal(Store.WATERMARK_KEY in review.valid, false);
  for (const k of adapter.svcsKeys()) assert.ok(k in review.valid, k);
});

test('T-B13 bulk restore of many shards, and a failed write is never reported as success', async () => {
  const values = {};
  for (let i = 1; i <= 60; i++) values[P + 'ledger_v1_2026-11' + (i > 1 ? '_p' + i : '')] = JSON.stringify([{ i }]);
  const data = new Map();
  const box = shellBox(data);
  const bulk = installBulk(box);
  await box.run(`restoreStorageValues(${JSON.stringify(values)})`);
  assert.equal(bulk.bulkCalls, 1);
  assert.equal(data.size, 60);
  box.run(`verifyStorageValues(${JSON.stringify(values)})`);
  // one key fails to write
  const data2 = new Map();
  const box2 = shellBox(data2);
  installBulk(box2, { failKey: P + 'ledger_v1_2026-11_p30' });
  assert.throws(() => box2.run(`restoreStorageValues(${JSON.stringify(values)})`), /Could not write/);
  assert.throws(() => box2.run(`verifyStorageValues(${JSON.stringify(values)})`), /Read-back mismatch/);
});
