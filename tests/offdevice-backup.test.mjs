import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../www/offdevice-backup.js'), 'utf8');

function harness(options = {}) {
  const values = new Map();
  const events = [];
  let marked = false;
  const destinationId = 'a'.repeat(64);
  const exportApi = {
    policy: () => ({ enabled: true }),
    approveScheduled: meta => (events.push(['approve', meta.destinationId]), { destinationId: meta.destinationId }),
    authorizeScheduled: meta => (events.push(['authorize', meta.destinationId]), 'exp_test'),
    beginDelivery: token => (events.push(['begin', token]), true),
    recordOutcome: (token, outcome) => (events.push(['outcome', outcome]), true),
    revokeScheduled: () => true
  };
  const root = {
    localStorage: {},
    safeGet: key => values.has(key) ? values.get(key) : null,
    safeSet: (key, value) => (values.set(key, String(value)), true),
    safeRemove: key => (values.delete(key), true),
    SaagarExportControl: exportApi,
    SaagarPortableBackup: {
      createRecoveryProfile: async passphrase => ({ keyBase64: 'raw-key', profile: { recovery: true, hint: passphrase.length } }),
      sealWithKey: async (payload, key, recovery) => ({ encrypted: true, payloadHash: payload.createdAt, key, recovery })
    },
    freshPortableBackupPayload: async () => ({ createdAt: '2026-07-29T00:00:00.000Z', localStorage: { demo: '[]' } }),
    setOffDeviceBackup: () => (marked = true),
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        SaagarOffDevice: {
          chooseFolder: async () => ({ configured: true, destinationId, label: 'Drive backup', provider: 'drive.provider' }),
          status: async () => ({ configured: true, destinationId: options.changedDestination ? 'b'.repeat(64) : destinationId }),
          copyFromCache: async () => ({ verified: true, destinationId, sha256: 'c'.repeat(64), size: 1234, dailyFile: 'backup-2026-07-29.sccbak' }),
          clearFolder: async () => ({ cleared: true })
        },
        SaagarKeystore: {
          wrapKey: async () => ({ wrapped: 'keystore-wrapped-key' }),
          unwrapKey: async () => ({ data: 'raw-key' })
        },
        Filesystem: {
          writeFile: async args => (events.push(['write', args.path]), {}),
          deleteFile: async args => (events.push(['delete', args.path]), {})
        }
      }
    },
    auditLog: (action, detail) => events.push([action, detail]),
    toast: () => {}
  };
  vm.runInNewContext(source, { window: root, globalThis: root, TextEncoder, btoa }, { filename: 'offdevice-backup.js' });
  return { api: root.SaagarOffDeviceBackup, values, events, marked: () => marked };
}

test('BKP-03 setup stores no passphrase/provider URI and immediately proves the approved destination', async () => {
  const h = harness();
  const result = await h.api.configure('correct horse battery staple');
  assert.equal(result.verified, true);
  assert.equal(h.marked(), true);
  const stored = h.values.get(h.api.CONFIG_KEY);
  assert.match(stored, /keystore-wrapped-key/);
  assert.doesNotMatch(stored, /correct horse|battery staple|content:\/\//i);
  assert.deepEqual(h.events.filter(row => row[0] === 'outcome').at(-1), ['outcome', 'completed']);
});

test('BKP-03 refuses delivery when the persisted provider destination changes', async () => {
  const h = harness({ changedDestination: true });
  await assert.rejects(h.api.configure('correct horse battery staple'), /missing or changed/i);
  assert.equal(h.marked(), false);
  assert.equal(h.events.some(row => row[0] === 'write'), false);
});