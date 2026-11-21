// Service wave 1, governance T8: every Stores key is backed up, restored and validated by the REAL shell functions of www/index.html.
// Key patterns come from the capability register (not from the store), so a key added to the store but not declared fails here.
// Uses the store group's vm helper tests/lib/svc1-store-shell.mjs (real shell functions cut out of index.html, fake localStorage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, exists, samplesForPattern, loadApi, SEVEN } from './lib/svc1-gov-common.mjs';
import { shellBox } from './lib/svc1-store-shell.mjs';
import { makeGovEnv, seedFlow, leakyJob, loadLibs, makeClock, makeAdapter } from './lib/svc1-gov-env.mjs';
import { realSession } from './lib/svc1-gov-common.mjs';
import { SESSIONS } from './lib/fix-s15-role-table.mjs';

const reg = loadJson('capability-register.json');
const plain = (v) => JSON.parse(JSON.stringify(v));
const store = loadApi(SEVEN[0]);
const P = store.SVCS_PREFIX;
const dataKeys = reg.keys.filter((k) => k.inBackup);
const sampleKeys = dataKeys.flatMap((k) => samplesForPattern(k.pattern));

test('T8.1 the shell storage rule owns exactly the Stores prefix for the Service module, and the three old keys stay', () => {
  const box = shellBox(new Map());
  const rules = plain(box.run('STORAGE_RULES'));
  assert.deepEqual(rules.service, { exact: ['saagar_wsf_v2', 'saagar_wsf_settings_v1', 'saagar_invoice_seq_v1'], prefix: ['saagar_svcs_'] });
  assert.equal(P, 'saagar_svcs_');
  for (const [id, r] of Object.entries(rules)) if (id !== 'service') assert.equal(JSON.stringify(r).includes('svcs'), false, id + ' must not name the Stores prefix');
});

test('T8.2 every register key pattern (with period and part suffixes) is a Service key: whitelisted, owned by service, restorable; the watermark is none of these', () => {
  assert.ok(sampleKeys.length >= 20);
  const box = shellBox(new Map());
  for (const k of sampleKeys) {
    assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(k)})`), true, k);
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(k)}).id`), 'service', k);
    assert.equal(box.run(`restoreKeyOwnerId(${JSON.stringify(k)})`), 'service', k);
  }
  for (const k of reg.keys.filter((x) => !x.inBackup)) {
    for (const s of samplesForPattern(k.pattern)) {
      assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(s)})`), false, s + ' is device local and must not be backed up');
      assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(s)})`), undefined, s);
    }
  }
  for (const typo of ['saagar_svc_parts_v1', 'saagar_svcs', 'saagar_svc_ledger_v1_2026-11', 'Saagar_svcs_parts_v1', 'xsaagar_svcs_parts_v1', 'saagar_svcsparts_v1']) {
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(typo)})`), undefined, typo + ' is not owned by Service');
  }
});

test('T8.3 restore validation: an array is accepted, anything else is refused with the shell wording, for every register key', () => {
  const box = shellBox(new Map());
  const good = plain(box.run(`validateRestoreData(${JSON.stringify(Object.fromEntries(sampleKeys.map((k) => [k, '[{"n":1}]'])))})`));
  assert.deepEqual(good.invalid, []);
  assert.deepEqual(good.rejected, []);
  assert.equal(Object.keys(good.valid).length, sampleKeys.length);
  for (const k of sampleKeys) {
    const empty = plain(box.run(`validateRestoreData(${JSON.stringify({ [k]: '[]' })})`));
    assert.deepEqual(empty.invalid, [], k + ' empty array');
    for (const bad of ['{}', '5', '"x"', 'null', '{"n":1}', '[1,', '']) {
      const r = plain(box.run(`validateRestoreData(${JSON.stringify({ [k]: bad })})`));
      assert.deepEqual(r.invalid, [k], `${k} must refuse ${JSON.stringify(bad)}`);
      assert.deepEqual(r.valid, {}, k);
    }
  }
  const msg = plain(box.run(`validateRestoreKeyValue(${JSON.stringify(P + 'parts_v1')}, '{}')`));
  assert.equal(msg.ok, false);
  assert.match(msg.reason, /Service data must be an array/);
  const bad = plain(box.run(`validateRestoreKeyValue(${JSON.stringify(P + 'parts_v1')}, '[1,')`));
  assert.match(bad.reason, /Invalid JSON/);
  const wm = reg.keys.find((k) => !k.inBackup).pattern;
  const w = plain(box.run(`validateRestoreData(${JSON.stringify({ [wm]: '{"v":1}' })})`));
  assert.deepEqual(w.rejected, [wm], 'the device watermark is not accepted from a backup');
  const old = plain(box.run(`validateRestoreData(${JSON.stringify({ saagar_invoice_seq_v1: '12', saagar_wsf_settings_v1: '{"idHigh":3}', saagar_wsf_v2: '[]' })})`));
  assert.deepEqual(old.invalid, [], 'the three old Service keys keep their own rules');
});

function realData() {
  assert.ok(exists('www/service-stores-core.js') && exists('www/service-stores-docs.js'), 'waiting on writers: core and docs');
  const env = makeGovEnv({ jobs: { 'WS-2026-001': leakyJob('WS-2026-001') } });
  const o = realSession(SESSIONS[0].read), m = realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);
  seedFlow(env, { owner: o, manager: m });
  return env;
}

test('T8.4 data made by the real core: backup holds every saagar_svcs key byte for byte and not the watermark; module listing includes them', () => {
  const env = realData();
  const keys = env.adapter.keys().filter((k) => k.indexOf(P) === 0).sort();
  assert.ok(keys.length >= 6);
  const data = new Map(env.adapter.data);
  data.set('st_v2_svcs_watermark_v1', '{"v":1,"rev":9}');
  data.set('saagar_wsf_v2', '[]');
  data.set('st_v2_admin_pin_hash', 'secret-placeholder');
  const box = shellBox(data);
  const backup = plain(box.run('backupStorageStrict()'));
  for (const k of keys) assert.equal(backup[k], env.adapter.data.get(k), k + ' must be backed up byte for byte');
  assert.equal('st_v2_svcs_watermark_v1' in backup, false);
  assert.equal('st_v2_admin_pin_hash' in backup, false);
  assert.equal(backup.saagar_wsf_v2, '[]');
  const payload = plain(box.run('backupPayload()'));
  const svc = payload.modules.find((x) => x.id === 'service');
  assert.deepEqual(svc.keys.filter((k) => k.indexOf(P) === 0).sort(), keys);
  for (const k of keys) assert.ok(reg.keys.some((r) => samplesForPattern(r.pattern).some((s) => s === k) || new RegExp('^' + r.pattern.replace(/\[_pNN\]/, '(_p\\d+)?').replace('YYYY-MM', '\\d{4}-\\d{2}').replace('FYyyyy-yy', 'FY\\d{4}-\\d{2}') + '$').test(k)), k + ' is not a declared key');
});

test('T8.5 round trip: backup, restore into a clean profile, byte-identical keys, and the core opens clean on the restored copy', async () => {
  const env = realData();
  const boxA = shellBox(new Map(env.adapter.data));
  const parsed = JSON.parse(JSON.stringify(plain(boxA.run('backupPayload()'))));
  const target = new Map();
  const boxB = shellBox(target);
  const review = plain(boxB.run(`validateRestoreData(${JSON.stringify(parsed.localStorage)})`));
  assert.deepEqual(review.invalid, []);
  assert.deepEqual(review.rejected, []);
  await boxB.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  for (const k of env.adapter.keys().filter((x) => x.indexOf(P) === 0)) assert.equal(target.get(k), env.adapter.data.get(k), k + ' byte identical after restore');
  // a second core on the restored copy reads the same stock and is not blocked
  const libs = env.libs;
  const adapter2 = { getItem: (k) => (target.has(k) ? target.get(k) : null), setItem: (k, v) => { target.set(k, String(v)); }, keys: () => Array.from(target.keys()), authoritative: () => true };
  const made = libs.core.create({ adapter: adapter2, now: env.clock.now, cases: env.cases, libs: { store: libs.store, fifo: libs.fifo, masters: libs.masters, docs: libs.docs }, storeOptions: { watermark: false } });
  assert.equal(made.ok, true);
  const o = realSession(SESSIONS[0].read);
  const lp = made.core.listParts({}, { session: o, clientRef: 'gov-restore-1' });
  assert.equal(lp.ok, true, JSON.stringify(lp));
  assert.equal(lp.totals.pieces, 12);
  assert.equal(lp.totals.valuePaise, 62500);
  assert.equal(made.core.status().blocked, false);
});

test('T8.6 restore never deletes: a newer key on the device survives an older backup, and the store reports it instead of hiding it', async () => {
  const env = realData();
  const older = plain(shellBox(new Map(env.adapter.data)).run('backupStorageStrict()'));
  // more business after the backup
  const m = realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);
  env.clock.advance(60000);
  const r = env.core.counterSale({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, env.ctx(m));
  assert.equal(r.ok, true, JSON.stringify(r));
  const device = new Map(env.adapter.data);
  const box = shellBox(device);
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(older)})`));
  await box.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  for (const k of env.adapter.keys().filter((x) => x.indexOf(P) === 0)) assert.ok(device.has(k), k + ' still on the device');
});

test('T8.6b with the device watermark ON (the page default): an older backup restored over newer data blocks the real core until the Owner acknowledges with the PIN', async () => {
  assert.ok(exists('www/service-stores-core.js') && exists('www/service-stores-docs.js'), 'waiting on writers: core and docs');
  const libs = loadLibs();
  const clock = makeClock();
  const adapter = makeAdapter();
  const jobs = { 'WS-2026-001': leakyJob('WS-2026-001') };
  const cases = { get: (id) => (Object.prototype.hasOwnProperty.call(jobs, id) ? jobs[id] : null) };
  const mk = (ad) => libs.core.create({ adapter: ad, now: clock.now, cases, libs: { store: libs.store, fifo: libs.fifo, masters: libs.masters, docs: libs.docs } });
  const made = mk(adapter); // no storeOptions: watermark on, as in the page
  assert.equal(made.ok, true);
  let n = 0;
  const env = { core: made.core, clock, stamp: () => ({ ok: true, at: clock.ms }), ctx: (s, x) => Object.assign({ session: s, clientRef: 'gov-wm-' + (n += 1) }, x || {}) };
  const o = realSession(SESSIONS[0].read), m = realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);
  seedFlow(env, { owner: o, manager: m });
  assert.ok(adapter.data.has(store.WATERMARK_KEY), 'the device watermark exists');
  const older = plain(shellBox(new Map(adapter.data)).run('backupStorageStrict()'));
  assert.equal(store.WATERMARK_KEY in older, false, 'the watermark is never in a backup');
  clock.advance(60000);
  const sale = env.core.counterSale({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, env.ctx(m));
  assert.equal(sale.ok, true, JSON.stringify(sale));
  // restore the older backup over this device (same month shard, so the older text is a consistent chain: only the mark can catch it)
  const device = new Map(adapter.data);
  const box = shellBox(device);
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(older)})`));
  assert.deepEqual(review.invalid, []);
  await box.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  const devAd = makeAdapter();
  for (const [k, v] of device) devAd.data.set(k, v);
  const second = mk(devAd);
  assert.equal(second.ok, true);
  const st = second.core.status();
  assert.equal(st.blocked, true, JSON.stringify(st));
  assert.ok(st.problems.some((p) => p.code === 'SVCS_WATERMARK_AHEAD'), JSON.stringify(st.problems));
  const before = devAd.setCount;
  const refused = second.core.counterSale({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, env.ctx(m));
  assert.notEqual(refused.ok, true, 'nothing posts while blocked');
  assert.notEqual(second.core.acknowledgeRestore({ reason: 'older backup on purpose' }, env.ctx(m, { stepUp: env.stamp() })).ok, true, 'a Manager cannot acknowledge');
  assert.notEqual(second.core.acknowledgeRestore({ reason: 'older backup on purpose' }, env.ctx(o)).ok, true, 'the Owner needs the PIN');
  assert.equal(devAd.setCount, before, 'refusals write nothing');
  const ack = second.core.acknowledgeRestore({ reason: 'older backup on purpose' }, env.ctx(o, { stepUp: env.stamp() }));
  assert.equal(ack.ok, true, JSON.stringify(ack));
  const third = mk(devAd);
  assert.equal(third.core.status().blocked, false, 'a fresh core opens clean after the acknowledgement');
});

test('T8.7 the shell backup code was not edited beyond the one prefix line: backupStorageStrict and keysForModule are the G0 functions', () => {
  const box = shellBox(new Map());
  const g0 = loadJson('capability-register.json').g0Baseline.indexHtml;
  assert.equal(g0.bytesAfterPrefixEdit - g0.bytes, 14);
  assert.ok(box.run('backupPayload.toString().includes("keysForModule(m.id)")'), 'the module listing still goes through keysForModule');
  assert.ok(box.run('backupPayload.toString().includes("backupStorageStrict()")'), 'the payload still comes from backupStorageStrict');
});
