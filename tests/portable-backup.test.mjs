import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const portable = require('../www/portable-backup.js');
const restoreEngine = require('../www/restore-engine.js');

const passphrase = 'correct horse battery staple';
const payload = {
  app: 'Saagar Traders Business Control Centre',
  version: '5.0.0',
  apkBuild: 'test',
  createdAt: '2026-07-24T00:00:00.000Z',
  scope: 'full-portable-backup',
  localStorage: {
    saagar_demo: '{"customer":"PLAINTEXT-CANARY","amount":1250}',
    st_v2_setting: 'true'
  },
  photos: {
    service_case_front: 'data:image/png;base64,UEhPVE8='
  },
  qmsArchive: [{ id: 'visit-1', customer: 'CANARY-QMS' }],
  evidence: [{
    itemKey: 'firm|2026-27|gst',
    name: 'proof.png',
    type: 'image/png',
    addedAt: 1,
    dataURL: 'data:image/png;base64,RVZJREVOQ0U='
  }]
};

test('portable backup round-trips without leaking payload text', async () => {
  const container = await portable.seal(payload, passphrase, { iterations: 100000 });
  const text = JSON.stringify(container);
  assert.equal(container.format, portable.FORMAT);
  assert.equal(container.kdf.iterations, 100000);
  assert.doesNotMatch(text, /PLAINTEXT-CANARY|CANARY-QMS|proof\.png|saagar_demo/);

  const opened = await portable.open(text, passphrase);
  assert.deepEqual(opened.payload, payload);
  assert.equal(opened.manifest.sections.localStorage.count, 2);
  assert.equal(opened.manifest.sections.photos.count, 1);
  assert.equal(opened.manifest.sections.qmsArchive.count, 1);
  assert.equal(opened.manifest.sections.evidence.count, 1);
});

test('wrong passphrase and changed ciphertext fail closed', async () => {
  const container = await portable.seal(payload, passphrase, { iterations: 100000 });
  await assert.rejects(portable.open(container, 'this passphrase is incorrect'), { code: 'DECRYPT_FAILED' });

  const changed = structuredClone(container);
  const i = Math.floor(changed.ciphertext.length / 2);
  changed.ciphertext = changed.ciphertext.slice(0, i) +
    (changed.ciphertext[i] === 'A' ? 'B' : 'A') +
    changed.ciphertext.slice(i + 1);
  await assert.rejects(portable.open(changed, passphrase), { code: 'DECRYPT_FAILED' });
});

test('manifest tampering fails authentication and control totals are deterministic', async () => {
  const a = await portable.seal(payload, passphrase, { iterations: 100000 });
  const b = await portable.seal(payload, passphrase, { iterations: 100000 });
  assert.deepEqual(a.manifest, b.manifest);

  const changed = structuredClone(a);
  changed.manifest.sections.localStorage.count += 1;
  await assert.rejects(portable.open(changed, passphrase), { code: 'DECRYPT_FAILED' });
});

test('restore coordinator verifies success', async () => {
  const state = { value: 'before' };
  const result = await restoreEngine.run({
    validate: async () => true,
    capture: async () => ({ value: state.value }),
    apply: async () => { state.value = 'after'; return { written: 1 }; },
    verify: async () => assert.equal(state.value, 'after'),
    rollback: async before => { state.value = before.value; },
    verifyRollback: async before => assert.equal(state.value, before.value)
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { written: 1 });
  assert.equal(state.value, 'after');
});

test('restore coordinator rolls back and verifies any partial failure', async () => {
  const state = { keys: 'before', photos: 'before' };
  await assert.rejects(restoreEngine.run({
    validate: async () => true,
    capture: async () => ({ ...state }),
    apply: async () => {
      state.keys = 'after';
      throw new Error('photo write failed');
    },
    verify: async () => true,
    rollback: async before => Object.assign(state, before),
    verifyRollback: async before => assert.deepEqual(state, before)
  }), { code: 'RESTORE_ROLLED_BACK' });
  assert.deepEqual(state, { keys: 'before', photos: 'before' });
});

test('restore coordinator makes rollback verification failure explicit', async () => {
  await assert.rejects(restoreEngine.run({
    validate: async () => true,
    capture: async () => ({ value: 'before' }),
    apply: async () => { throw new Error('write failed'); },
    verify: async () => true,
    rollback: async () => true,
    verifyRollback: async () => { throw new Error('rollback mismatch'); }
  }), { code: 'RESTORE_ROLLBACK_FAILED' });
});
