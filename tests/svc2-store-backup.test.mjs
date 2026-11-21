// Service wave 2, store: backup, restore, reset and the shell storage rules for the new key families.
// The REAL shell functions from www/index.html are run in a vm sandbox (tests/lib/svc2-store-shell.mjs). The shell is not edited.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  Store, ACTORS, P, makeClock, makeAdapter, newStore, openStore, put, expectOk, expectFail, postInvoice, postReceipt,
  buildTwoYears, FILLER, plain
} from './lib/svc2-store-harness.mjs';
import { shellBox, autoBackupSnapshot, shell, fn, INDEX_PATH } from './lib/svc2-store-shell.mjs';

const require = createRequire(import.meta.url);
const Y1 = '2026-12-01T00:00:00.000Z';
const Y2 = '2027-06-01T00:00:00.000Z';
const NEW_KEY_RE = /^saagar_svcs_(invoices|receipts)_v1_FY\d{4}-\d{2}(_p\d+)?$/;
const newKeys = (adapter) => adapter.svcsKeys().filter((k) => NEW_KEY_RE.test(k));

test('T2S-B1 STORAGE_RULES unchanged and the shell file is untouched: 579,823 bytes, below 580,636, LF only', () => {
  const box = shellBox(new Map());
  const rules = plain(box.run('STORAGE_RULES'));
  assert.deepEqual(rules.service, { exact: ['saagar_wsf_v2', 'saagar_wsf_settings_v1', 'saagar_invoice_seq_v1'], prefix: ['saagar_svcs_'] });
  const bytes = fs.readFileSync(INDEX_PATH);
  assert.equal(bytes.length, 579823);
  assert.ok(bytes.length < 580636);
  assert.equal(bytes.indexOf(13), -1, 'LF only');
  assert.notDeepEqual(Array.from(bytes.subarray(0, 3)), [0xEF, 0xBB, 0xBF], 'no BOM');
  assert.equal(shell.split('prefix: ["saagar_svcs_"]').length, 2);
  assert.equal(Store.sha256Hex(bytes.toString('latin1')).length, 64);
  // no other prefix rule overlaps the Service one
  for (const [id, r] of Object.entries(rules)) if (id !== 'service') for (const p of r.prefix) assert.ok(!P.startsWith(p) && !p.startsWith(P), id);
});

test('T2S-B2 every key the two new streams make over three years is whitelisted and owned by Service; the device mark is not', () => {
  const clock = makeClock('2026-06-05T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  for (const fyStart of ['2026-06-05T05:00:00.000Z', '2027-06-05T05:00:00.000Z', '2028-06-05T05:00:00.000Z']) {
    clock.set(fyStart);
    for (const stream of ['invoices', 'receipts']) {
      for (let i = 0; i < 70; i++) { clock.advance(1000); expectOk(put(store, stream, { k: 'TEST', b: { i, a: FILLER, b: FILLER, c: FILLER } })); }
    }
  }
  const keys = newKeys(adapter);
  for (const stream of ['invoices', 'receipts']) {
    for (const fy of ['FY2026-27', 'FY2027-28', 'FY2028-29']) {
      assert.ok(keys.includes(P + stream + '_v1_' + fy), stream + fy);
      assert.ok(keys.includes(P + stream + '_v1_' + fy + '_p2'), stream + fy + ' p2');
      assert.ok(keys.includes(P + stream + '_v1_' + fy + '_p3'), stream + fy + ' p3');
    }
  }
  const box = shellBox(new Map());
  for (const k of keys.concat([Store.HEAD_KEY])) {
    assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(k)})`), true, k);
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(k)}).id`), 'service', k);
    assert.equal(box.run(`restoreKeyOwnerId(${JSON.stringify(k)})`), 'service', k);
    assert.ok(Object.values(Store.KEY_RE).some((re) => re.test(k)), k);
  }
  assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(Store.WATERMARK_KEY)})`), false);
  assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(Store.WATERMARK_KEY)})`), undefined);
  const mod = box.run("keysForModule('service')");
  void mod;
});

test('T2S-B3 backup content: every new key with its exact text, no device mark', () => {
  const { adapter } = buildTwoYears();
  const data = new Map(adapter.data);
  data.set('saagar_wsf_v2', '[]');
  data.set('st_v2_admin_pin_hash', 'secret');
  const box = shellBox(data);
  const backup = plain(box.run('backupStorageStrict()'));
  const keys = newKeys(adapter);
  assert.equal(keys.length, 6, "invoices and receipts each: year one in two parts, year two in one");
  for (const k of keys) assert.equal(backup[k], adapter.data.get(k), k);
  assert.equal(Store.WATERMARK_KEY in backup, false);
  assert.equal('st_v2_admin_pin_hash' in backup, false);
  const payload = plain(box.run('backupPayload()'));
  const svc = payload.modules.find((m) => m.id === 'service');
  assert.deepEqual(svc.keys.filter((k) => NEW_KEY_RE.test(k)).sort(), keys);
  assert.deepEqual(plain(box.run("keysForModule('service')")).filter((k) => NEW_KEY_RE.test(k)).sort(), keys);
  assert.equal(payload.localStorage[P + 'head_v1'], adapter.data.get(P + 'head_v1'));
});

test('T2S-B4 restore validation accepts the new keys and refuses bad shapes; the device mark is rejected', () => {
  const { adapter } = buildTwoYears();
  const box = shellBox(new Map(adapter.data));
  const all = plain(box.run('backupStorageStrict()'));
  const good = plain(box.run(`validateRestoreData(${JSON.stringify(all)})`));
  assert.deepEqual(good.rejected, []);
  assert.deepEqual(good.invalid, []);
  assert.equal(Object.keys(good.valid).length, Object.keys(all).length);
  for (const key of [P + 'invoices_v1_FY2026-27', P + 'invoices_v1_FY2026-27_p2', P + 'receipts_v1_FY2027-28']) {
    for (const bad of ['{}', '"[1,"', '', 'null', '5', '"text"']) {
      const r = plain(box.run(`validateRestoreData(${JSON.stringify({ [key]: bad })})`));
      assert.deepEqual(r.invalid, [key], key + ' ' + JSON.stringify(bad));
      assert.deepEqual(r.valid, {});
    }
    const okOne = plain(box.run(`validateRestoreData(${JSON.stringify({ [key]: '[]' })})`));
    assert.deepEqual(okOne.invalid, []);
    assert.deepEqual(Object.keys(okOne.valid), [key]);
  }
  const wm = plain(box.run(`validateRestoreData(${JSON.stringify({ [Store.WATERMARK_KEY]: '{"v":1}' })})`));
  assert.deepEqual(wm.rejected, [Store.WATERMARK_KEY]);
  assert.deepEqual(wm.valid, {});
});

test('T2S-B5 round trip byte for byte through backup, JSON file and restore, with numbers continuing the same', async () => {
  const { adapter, clock } = buildTwoYears();
  const keys = newKeys(adapter);
  assert.ok(keys.some((k) => /invoices_v1_FY2026-27_p2$/.test(k)) && keys.some((k) => /receipts_v1_FY2027-28$/.test(k)));
  const boxA = shellBox(new Map(adapter.data));
  const parsed = JSON.parse(JSON.stringify(plain(boxA.run('backupPayload()'))));
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
  assert.deepEqual(plain(o.problems), []);
  assert.equal(o.watermark, 'INIT');
  assert.equal(b.data.get(P + 'head_v1'), adapter.data.get(P + 'head_v1'));
  const sa = newStore(adapter, clock);
  assert.equal(sa.open().blocked, false);
  // next numbers, typed by hand from the recipe of buildTwoYears (see the harness): same in the original and the restored copy
  const want = {
    [Y1]: { SV: 'SV/2026-27/0143', SCN: 'SCN/26-27/0003', SAR: 'SAR/26-27/0004', SRC: 'SRC/26-27/0093', SRF: 'SRF/26-27/0002' },
    [Y2]: { SV: 'SV/2027-28/0002', SCN: 'SCN/27-28/0002', SAR: 'SAR/27-28/0002', SRC: 'SRC/27-28/0002', SRF: 'SRF/27-28/0002' }
  };
  for (const [at, table] of Object.entries(want)) {
    for (const [series, no] of Object.entries(table)) {
      assert.equal(sa.nextNumber(series, at).no, no, 'A ' + series + at);
      assert.equal(sb.nextNumber(series, at).no, no, 'B ' + series + at);
    }
  }
  assert.equal(sb.read('invoices').records.length, sa.read('invoices').records.length);
  assert.equal(sb.read('receipts').records.length, sa.read('receipts').records.length);
  assert.equal(sb.verifyAll().problems.length, 0);
});

test('T2S-B6 sealed container round trip', async (t) => {
  let portable;
  try { portable = require('../www/portable-backup.js'); } catch (e) { t.skip('portable-backup.js could not be loaded here'); return; }
  const { adapter, clock } = buildTwoYears();
  const box = shellBox(new Map(adapter.data));
  const bp = plain(box.run('backupPayload()'));
  const payload = {
    app: bp.app, version: '5.0.0', apkBuild: 'test', createdAt: '2026-12-01T00:00:00.000Z', scope: 'full-portable-backup',
    localStorage: bp.localStorage, photos: {}, qmsArchive: [], evidence: []
  };
  const container = await portable.seal(payload, 'correct horse battery staple', { iterations: 100000 });
  const text = JSON.stringify(container);
  assert.doesNotMatch(text, /saagar_svcs_|SV\/2026-27|invoices_v1/);
  const opened = await portable.open(text, 'correct horse battery staple');
  assert.deepEqual(opened.payload.localStorage, payload.localStorage);
  const boxB = shellBox(new Map());
  const review = plain(boxB.run(`validateRestoreData(${JSON.stringify(opened.payload.localStorage)})`));
  assert.deepEqual(review.invalid, []);
  await boxB.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  for (const k of adapter.svcsKeys()) assert.equal(boxB.ls.data.get(k), adapter.data.get(k), k);
  const sb = newStore(makeAdapter(new Map(boxB.ls.data)), clock);
  assert.equal(sb.open().blocked, false);
  assert.equal(sb.nextNumber('SV', Y1).no, 'SV/2026-27/0143');
});

test('T2S-B7 a damaged invoices shard inside a backup passes the shell check (shape only) and is caught when the store opens', async () => {
  const { adapter, clock } = buildTwoYears();
  const key = P + 'invoices_v1_FY2026-27_p2';
  const box = shellBox(new Map(adapter.data));
  const all = plain(box.run('backupStorageStrict()'));
  const arr = JSON.parse(all[key]);
  const target = arr[3];
  arr[3].b.jobId = 'J-FLIPPED';
  const flipped = Object.assign({}, all, { [key]: JSON.stringify(arr) });
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(flipped)})`));
  assert.deepEqual(review.invalid, [], 'shell validation is shape only');
  const mapB = new Map();
  await shellBox(mapB).run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  const sb = newStore(makeAdapter(new Map(mapB)), clock);
  const o = sb.open();
  assert.equal(o.blocked, true);
  assert.equal(o.problems[0].code, 'SVCS_CHAIN_BREAK');
  assert.equal(o.problems[0].stream, 'invoices');
  assert.equal(o.problems[0].key, key);
  assert.equal(o.problems[0].n, target.n);
  expectFail(sb.read('invoices'), 'SVCS_BLOCKED');
  // a truncated shard lands in invalid and is not written
  const cut = Object.assign({}, all, { [key]: all[key].slice(0, -30) });
  const r2 = plain(box.run(`validateRestoreData(${JSON.stringify(cut)})`));
  assert.deepEqual(r2.invalid, [key]);
  assert.equal(key in r2.valid, false);
});

test('T2S-B8 restore is a merge: an older backup over newer invoices is caught, three ways', async () => {
  const mk = (n, clock, store, base = 0) => { for (let i = 0; i < n; i++) { clock.advance(1000); expectOk(postInvoice(store, { filler: FILLER, i: base + i })); } };
  // case 1: the device grew into a new part and into the next financial year, the backup knows neither
  const clock = makeClock('2026-10-05T05:00:00.000Z');
  const adapter = makeAdapter();
  const store = openStore(adapter, clock);
  mk(20, clock, store);
  const oldBackup = plain(shellBox(new Map(adapter.data)).run('backupStorageStrict()'));
  mk(60, clock, store, 20);
  clock.set('2027-04-05T05:00:00.000Z');
  mk(3, clock, store, 80);
  assert.ok(adapter.svcsKeys().some((k) => /invoices_v1_FY2026-27_p2$/.test(k)) && adapter.svcsKeys().some((k) => /invoices_v1_FY2027-28$/.test(k)));
  const dev1 = new Map(adapter.data);
  const box1 = shellBox(dev1);
  const review = plain(box1.run(`validateRestoreData(${JSON.stringify(oldBackup)})`));
  assert.deepEqual(review.invalid, []);
  await box1.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  for (const k of adapter.svcsKeys()) assert.ok(dev1.has(k), 'restore never deletes ' + k);
  const o1 = newStore(makeAdapter(dev1), clock).open();
  assert.equal(o1.blocked, true);
  assert.ok(['SVCS_SEQ_GAP', 'SVCS_CHAIN_BREAK'].includes(o1.problems[0].code), o1.problems[0].code);
  assert.equal(o1.problems[0].stream, 'invoices');
  assert.match(o1.problems[0].key, /invoices_v1_FY2026-27_p2/);
  assert.ok(o1.problems[0].n > 20);
  // case 2: only the same shard grew: the older text is a consistent chain and the device mark catches it
  const clock2 = makeClock('2026-10-05T05:00:00.000Z');
  const adapter2 = makeAdapter();
  const s2 = openStore(adapter2, clock2);
  mk(20, clock2, s2);
  const backup2 = plain(shellBox(new Map(adapter2.data)).run('backupStorageStrict()'));
  mk(8, clock2, s2, 20);
  const dev2 = new Map(adapter2.data);
  const box2 = shellBox(dev2);
  await box2.run(`restoreStorageValues(${JSON.stringify(plain(box2.run(`validateRestoreData(${JSON.stringify(backup2)})`)).valid)})`);
  const st2 = newStore(makeAdapter(dev2), clock2);
  const o2 = st2.open();
  assert.equal(o2.blocked, true);
  assert.equal(o2.problems[0].code, 'SVCS_WATERMARK_AHEAD');
  assert.equal(o2.problems[0].stream, 'invoices');
  assert.equal(o2.problems[0].n, 20);
  expectFail(st2.read('invoices'), 'SVCS_BLOCKED');
  // case 3: a new device never had a mark: INIT, no block, the older data is simply the data
  const fresh = new Map();
  const box3 = shellBox(fresh);
  await box3.run(`restoreStorageValues(${JSON.stringify(plain(box3.run(`validateRestoreData(${JSON.stringify(backup2)})`)).valid)})`);
  const nd = newStore(makeAdapter(fresh), clock2).open();
  assert.equal(nd.blocked, false);
  assert.equal(nd.watermark, 'INIT');
  assert.equal(nd.summary.counts.invoices, 20);
});

test('T2S-B9 Module Reset of Service and its undo, with the real shell functions', async () => {
  const { adapter, clock } = buildTwoYears();
  const data = new Map(adapter.data);
  data.set('saagar_wsf_v2', '[{"id":"J-1"}]');
  data.set('saagar_wsf_settings_v1', '{"idHigh":1}');
  const before = new Map(data);
  const keys = newKeys(adapter);
  const box = shellBox(data);
  await box.run('resetSelectedModule()');
  assert.deepEqual(box.calls.alerts, []);
  for (const k of keys.concat([P + 'head_v1'])) assert.equal(data.has(k), false, 'removed: ' + k);
  assert.equal(data.has(Store.WATERMARK_KEY), true, 'the device mark stays');
  const rbKey = Array.from(data.keys()).find((k) => k.indexOf('st_v4_restore_rollback_module_reset_service_') === 0);
  assert.ok(rbKey);
  const rb = JSON.parse(data.get(rbKey));
  const invKey = P + 'invoices_v1_FY2026-27';
  assert.equal(rb.keys[invKey], before.get(invKey), 'the rollback holds the whole invoices text');
  assert.ok(rbKey && rb.keys[P + 'receipts_v1_FY2027-28'] === before.get(P + 'receipts_v1_FY2027-28'));
  assert.ok(data.get(rbKey).length > before.get(invKey).length, 'size note: the rollback key is at least as big as the invoices shard');
  assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(rbKey)})`), true);
  // while reset, a device with the mark reports it
  const afterReset = newStore(makeAdapter(new Map(data)), clock).open();
  assert.equal(afterReset.blocked, true);
  assert.equal(afterReset.problems[0].code, 'SVCS_WATERMARK_AHEAD');
  await box.run('undoLastModuleReset()');
  for (const [k, v] of before) if (k.indexOf(P) === 0 || k.indexOf('saagar_wsf') === 0) assert.equal(data.get(k), v, k);
  const o = newStore(makeAdapter(new Map(data)), clock).open();
  assert.equal(o.blocked, false);
  assert.deepEqual(plain(o.problems), []);
  assert.equal(o.summary.counts.invoices, 106 + 2);
  assert.equal(o.summary.counts.receipts, 96 + 3);
});

test('T2S-B10 factory reset scope covers the new keys', () => {
  const src = fn('factoryReset');
  const m = /const APP_RE = (\/.*?\/);/.exec(src);
  assert.ok(m, 'APP_RE found');
  const re = new Function('return ' + m[1])();
  for (const k of [P + 'invoices_v1_FY2026-27', P + 'invoices_v1_FY2026-27_p12', P + 'receipts_v1_FY2027-28', P + 'receipts_v1_FY2027-28_p2', P + 'head_v1', Store.WATERMARK_KEY]) assert.ok(re.test(k), k);
});

test('T2S-B11 the automatic device backup includes the new keys; restoring it drops only the device mark', () => {
  const { adapter } = buildTwoYears();
  const data = new Map(adapter.data);
  data.set('st_v2_admin_pin_hash', 'secret');
  const snap = autoBackupSnapshot(data);
  for (const k of newKeys(adapter)) assert.equal(snap.localStorage[k], adapter.data.get(k), k);
  assert.equal(snap.localStorage[Store.WATERMARK_KEY], adapter.data.get(Store.WATERMARK_KEY));
  assert.equal('st_v2_admin_pin_hash' in snap.localStorage, false);
  const box = shellBox(new Map());
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(snap.localStorage)})`));
  assert.deepEqual(review.rejected, [Store.WATERMARK_KEY]);
  assert.deepEqual(review.invalid, []);
  for (const k of adapter.svcsKeys()) assert.ok(k in review.valid, k);
});
