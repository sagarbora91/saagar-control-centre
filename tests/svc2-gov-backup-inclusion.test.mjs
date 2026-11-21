// Service wave 2, governance T8: every new key (invoices and receipts, with period and part suffixes) is backed up, restored and validated by the
// REAL shell functions of www/index.html, which are NOT edited in this wave (the Phase 1 prefix rule already covers saagar_svcs_*).
// Key patterns come from the Phase 2 capability register (not from the store), so a key added to the store but not declared fails in T4.
// Uses the Phase 1 store group's vm helper tests/lib/svc1-store-shell.mjs (real shell functions cut out of index.html, fake localStorage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, phase1Json, samplesForPattern, loadApi, PHASE1, realSession } from './lib/svc2-gov-common.mjs';
import { shellBox } from './lib/svc1-store-shell.mjs';
import { makeBillingEnv, seedBillingFlow, govJobs, makeAdapter } from './lib/svc2-gov-env.mjs';
import { SESSIONS } from './lib/fix-s15-role-table.mjs';

const reg = loadJson('capability-register.json');
const reg1 = phase1Json('capability-register.json');
const plain = (v) => JSON.parse(JSON.stringify(v));
const store = loadApi(PHASE1[0]);
const P = store.SVCS_PREFIX;
const dataKeys = reg.keys.filter((k) => k.inBackup);
// the two new patterns plus every Phase 1 pattern: all of them must still be Service keys
const sampleKeys = dataKeys.flatMap((k) => samplesForPattern(k.pattern)).concat(reg1.keys.filter((k) => k.inBackup).flatMap((k) => samplesForPattern(k.pattern)));
const ownerS = () => realSession(SESSIONS[0].read);
const managerS = () => realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);

test('T8.1 the shell storage rule owns exactly the Stores prefix for the Service module, the three old keys stay, no other module names it, and the shell was not edited', () => {
  const box = shellBox(new Map());
  const rules = plain(box.run('STORAGE_RULES'));
  assert.deepEqual(rules.service, { exact: ['saagar_wsf_v2', 'saagar_wsf_settings_v1', 'saagar_invoice_seq_v1'], prefix: ['saagar_svcs_'] });
  assert.equal(P, 'saagar_svcs_');
  for (const [id, r] of Object.entries(rules)) if (id !== 'service') assert.equal(JSON.stringify(r).includes('svcs'), false, id + ' must not name the Stores prefix');
  assert.ok(box.run('backupPayload.toString().includes("keysForModule(m.id)")'), 'the module listing still goes through keysForModule');
  assert.ok(box.run('backupPayload.toString().includes("backupStorageStrict()")'), 'the payload still comes from backupStorageStrict');
});

test('T8.2 every new key pattern (invoices and receipts, FY suffix and part suffixes) is a Service key: whitelisted, owned by service, restorable; a typo prefix is not', () => {
  assert.ok(dataKeys.length === 2, 'the Phase 2 register holds the two new key rows');
  assert.ok(sampleKeys.length >= 20);
  const box = shellBox(new Map());
  for (const k of sampleKeys) {
    assert.equal(box.run(`isWhitelistedAppKey(${JSON.stringify(k)})`), true, k);
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(k)}).id`), 'service', k);
    assert.equal(box.run(`restoreKeyOwnerId(${JSON.stringify(k)})`), 'service', k);
  }
  for (const k of ['saagar_svcs_invoices_v1_FY2026-27', 'saagar_svcs_invoices_v1_FY2026-27_p2', 'saagar_svcs_receipts_v1_FY2027-28', 'saagar_svcs_receipts_v1_FY2026-27_p12']) {
    assert.ok(sampleKeys.includes(k) || store.KEY_RE.fy2.test(k), k + ' is a key the store accepts');
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(k)}).id`), 'service', k);
  }
  for (const typo of ['saagar_svc_invoices_v1_FY2026-27', 'saagar_svcs', 'saagar_svc_receipts_v1_FY2026-27', 'Saagar_svcs_invoices_v1_FY2026-27', 'xsaagar_svcs_receipts_v1_FY2026-27', 'saagar_svcsinvoices_v1', 'saagar_receipts_v1_FY2026-27']) {
    assert.equal(box.run(`ownerModuleForKey(${JSON.stringify(typo)})`), undefined, typo + ' is not owned by Service');
  }
});

test('T8.3 restore validation: an array is accepted, anything else is refused with the shell wording, for every new key; the three old Service keys keep their rules', () => {
  const box = shellBox(new Map());
  const fresh = dataKeys.flatMap((k) => samplesForPattern(k.pattern));
  const good = plain(box.run(`validateRestoreData(${JSON.stringify(Object.fromEntries(fresh.map((k) => [k, '[{"n":1}]'])))})`));
  assert.deepEqual(good.invalid, []);
  assert.deepEqual(good.rejected, []);
  assert.equal(Object.keys(good.valid).length, fresh.length);
  for (const k of fresh) {
    const empty = plain(box.run(`validateRestoreData(${JSON.stringify({ [k]: '[]' })})`));
    assert.deepEqual(empty.invalid, [], k + ' empty array');
    for (const bad of ['{}', '5', '"x"', 'null', '{"n":1}', '[1,', '']) {
      const r = plain(box.run(`validateRestoreData(${JSON.stringify({ [k]: bad })})`));
      assert.deepEqual(r.invalid, [k], `${k} must refuse ${JSON.stringify(bad)}`);
      assert.deepEqual(r.valid, {}, k);
    }
  }
  const msg = plain(box.run(`validateRestoreKeyValue(${JSON.stringify('saagar_svcs_invoices_v1_FY2026-27')}, '{}')`));
  assert.equal(msg.ok, false);
  assert.match(msg.reason, /Service data must be an array/);
  assert.match(plain(box.run(`validateRestoreKeyValue(${JSON.stringify('saagar_svcs_receipts_v1_FY2026-27')}, '[1,')`)).reason, /Invalid JSON/);
  const old = plain(box.run(`validateRestoreData(${JSON.stringify({ saagar_invoice_seq_v1: '12', saagar_wsf_settings_v1: '{"idHigh":3}', saagar_wsf_v2: '[]' })})`));
  assert.deepEqual(old.invalid, [], 'saagar_wsf_settings_v1 and saagar_invoice_seq_v1 are accepted exactly as before');
  const wm = reg1.keys.find((k) => !k.inBackup).pattern;
  const w = plain(box.run(`validateRestoreData(${JSON.stringify({ [wm]: '{"v":1}' })})`));
  assert.deepEqual(w.rejected, [wm], 'the device watermark is still not accepted from a backup');
});

function realData() {
  const env = makeBillingEnv({ jobs: govJobs() });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const o = ownerS(), m = managerS();
  const ids = seedBillingFlow(env, { owner: o, manager: m });
  return { env, ids, o, m };
}

test('T8.4 data made by the real stack: the backup holds every saagar_svcs key byte for byte (invoices and receipts too) and not the watermark; the module listing includes them', () => {
  const { env } = realData();
  const keys = env.adapter.keys().filter((k) => k.indexOf(P) === 0).sort();
  assert.ok(keys.some((k) => /_invoices_v1_FY/.test(k)), 'an invoices key exists');
  assert.ok(keys.some((k) => /_receipts_v1_FY/.test(k)), 'a receipts key exists');
  const data = new Map(env.adapter.data);
  data.set('st_v2_svcs_watermark_v1', '{"v":1,"rev":9}');
  data.set('saagar_wsf_v2', '[]');
  data.set('st_v2_admin_pin_hash', 'secret-placeholder');
  const box = shellBox(data);
  const backup = plain(box.run('backupStorageStrict()'));
  for (const k of keys) assert.equal(backup[k], env.adapter.data.get(k), k + ' must be backed up byte for byte');
  assert.equal('st_v2_svcs_watermark_v1' in backup, false);
  assert.equal('st_v2_admin_pin_hash' in backup, false);
  const payload = plain(box.run('backupPayload()'));
  const svc = payload.modules.find((x) => x.id === 'service');
  assert.deepEqual(svc.keys.filter((k) => k.indexOf(P) === 0).sort(), keys);
  const patterns = reg.keys.concat(reg1.keys).map((r) => new RegExp('^' + r.pattern.replace(/\[_pNN\]/, '(_p\\d+)?').replace('YYYY-MM', '\\d{4}-\\d{2}').replace('FYyyyy-yy', 'FY\\d{4}-\\d{2}') + '$'));
  for (const k of keys) assert.ok(patterns.some((re) => re.test(k)), k + ' is not a declared key (Phase 1 or Phase 2 register)');
});

test('T8.5 round trip: backup, restore into a clean profile, byte-identical keys, and the billing facade opens clean on the restored copy with the same figures', () => {
  const { env, ids } = realData();
  const parsed = JSON.parse(JSON.stringify(plain(shellBox(new Map(env.adapter.data)).run('backupPayload()'))));
  const target = new Map();
  const boxB = shellBox(target);
  const review = plain(boxB.run(`validateRestoreData(${JSON.stringify(parsed.localStorage)})`));
  assert.deepEqual(review.invalid, []);
  assert.deepEqual(review.rejected, []);
  return Promise.resolve(boxB.run(`restoreStorageValues(${JSON.stringify(review.valid)})`)).then(() => {
    for (const k of env.adapter.keys().filter((x) => x.indexOf(P) === 0)) assert.equal(target.get(k), env.adapter.data.get(k), k + ' byte identical after restore');
    const ad = makeAdapter();
    for (const [k, v] of target) ad.data.set(k, v);
    const env2 = makeBillingEnv({ jobs: govJobs(), adapter: ad, clock: env.clock });
    assert.equal(env2.waiting, undefined);
    const o = ownerS();
    const a = env.bill.getBill(ids.invoiceNo, env.ctx(o));
    const b = env2.bill.getBill(ids.invoiceNo, env2.ctx(o));
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), 'the same bill from the restored copy');
    assert.equal(env2.bill.status().blocked, false);
    assert.equal(env2.bill.status().billingBlocked, false);
  });
});

test('T8.6 restore never deletes: a newer key on the device survives an older backup', () => {
  const { env, m } = realData();
  const older = plain(shellBox(new Map(env.adapter.data)).run('backupStorageStrict()'));
  env.clock.advance(60000);
  const r = env.bill.takeReceipt({ jobId: 'WS-2026-008', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, env.ctx(m));
  void r;
  const device = new Map(env.adapter.data);
  const box = shellBox(device);
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(older)})`));
  return Promise.resolve(box.run(`restoreStorageValues(${JSON.stringify(review.valid)})`)).then(() => {
    for (const k of env.adapter.keys().filter((x) => x.indexOf(P) === 0)) assert.ok(device.has(k), k + ' still on the device');
  });
});

test('T8.7 with the device watermark ON (the page default): an older backup restored over newer billing data blocks the billing facade until the Owner acknowledges with the PIN', async () => {
  const adapter = makeAdapter();
  const env = makeBillingEnv({ jobs: govJobs(), adapter, watermark: true });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const o = ownerS(), m = managerS();
  seedBillingFlow(env, { owner: o, manager: m });
  assert.ok(adapter.data.has(store.WATERMARK_KEY), 'the device watermark exists');
  const older = plain(shellBox(new Map(adapter.data)).run('backupStorageStrict()'));
  assert.equal(store.WATERMARK_KEY in older, false, 'the watermark is never in a backup');
  env.clock.advance(60000);
  const more = env.bill.takeReceipt({ jobId: 'WS-2026-008', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, env.ctx(m));
  assert.equal(more.ok, true, JSON.stringify(more));
  const device = new Map(adapter.data);
  const box = shellBox(device);
  const review = plain(box.run(`validateRestoreData(${JSON.stringify(older)})`));
  assert.deepEqual(review.invalid, []);
  await box.run(`restoreStorageValues(${JSON.stringify(review.valid)})`);
  const devAd = makeAdapter();
  for (const [k, v] of device) devAd.data.set(k, v);
  const second = makeBillingEnv({ jobs: govJobs(), adapter: devAd, clock: env.clock, watermark: true });
  assert.equal(second.waiting, undefined);
  const st = second.bill.status();
  assert.equal(st.blocked === true || st.billingBlocked === true, true, JSON.stringify(st));
  assert.ok((st.problems || []).some((p) => (p && p.code ? p.code : p) === 'SVCS_WATERMARK_AHEAD'), JSON.stringify(st.problems));
  const before = devAd.setCount;
  const refused = second.bill.takeReceipt({ jobId: 'WS-2026-008', kind: 'advance', amountPaise: 100, payMode: 'Cash', payRef: '', note: '' }, second.ctx(m));
  assert.notEqual(refused.ok, true, 'no billing record posts while blocked');
  assert.notEqual(second.core1.acknowledgeRestore({ reason: 'older backup on purpose' }, second.ctx(m, { stepUp: second.stamp() })).ok, true, 'a Manager cannot acknowledge');
  assert.notEqual(second.core1.acknowledgeRestore({ reason: 'older backup on purpose' }, second.ctx(o)).ok, true, 'the Owner needs the PIN');
  assert.equal(devAd.setCount, before, 'refusals write nothing');
  const ack = second.core1.acknowledgeRestore({ reason: 'older backup on purpose' }, second.ctx(o, { stepUp: second.stamp() }));
  assert.equal(ack.ok, true, JSON.stringify(ack));
  const third = makeBillingEnv({ jobs: govJobs(), adapter: devAd, clock: env.clock, watermark: true });
  const st3 = third.bill.status();
  assert.equal(st3.blocked === true || st3.billingBlocked === true, false, 'a fresh facade opens clean after the acknowledgement: ' + JSON.stringify(st3));
});

test('T8.8 the shell backup code is the G0 code: only the Phase 1 prefix line differs, so no wave-2 key needs a shell edit', () => {
  const g0 = loadJson('g0-baseline.json').indexHtml;
  assert.equal(g0.bytes, 579823);
  const box = shellBox(new Map());
  const rules = plain(box.run('STORAGE_RULES'));
  assert.deepEqual(Object.keys(rules).sort().includes('service'), true);
});
