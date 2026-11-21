import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../www/offdevice-backup.js'), 'utf8');

function harness() {
  const values = new Map();
  const events = [];
  const destinationId = 'a'.repeat(64);
  const root = {
    localStorage: {},
    safeGet: k => values.has(k) ? values.get(k) : null,
    safeSet: (k, v) => (values.set(k, String(v)), true),
    safeRemove: k => (values.delete(k), true),
    SaagarExportControl: {
      policy: () => ({ enabled: true }),
      approveScheduled: m => ({ destinationId: m.destinationId }),
      authorizeScheduled: () => (events.push('authorize'), 'exp_test'),
      beginDelivery: () => true,
      recordOutcome: () => true,
      revokeScheduled: () => true
    },
    SaagarPortableBackup: {
      createRecoveryProfile: async () => ({ keyBase64: 'raw-key', profile: { recovery: true } }),
      sealWithKey: async payload => ({ encrypted: true, payloadHash: payload.createdAt })
    },
    freshPortableBackupPayload: async () => ({ createdAt: '2026-07-29T00:00:00.000Z', localStorage: { demo: '[]' } }),
    setOffDeviceBackup: () => true,
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        SaagarOffDevice: {
          chooseFolder: async () => ({ configured: true, destinationId, label: 'Drive', provider: 'p' }),
          status: async () => ({ configured: true, destinationId }),
          copyFromCache: async () => (events.push('copy'), { verified: true, destinationId, sha256: 'c'.repeat(64), size: 10, dailyFile: 'x' }),
          clearFolder: async () => ({ cleared: true })
        },
        SaagarKeystore: { wrapKey: async () => ({ wrapped: 'w' }), unwrapKey: async () => ({ data: 'raw-key' }) },
        Filesystem: { writeFile: async () => ({}), deleteFile: async () => ({}) }
      }
    },
    auditLog: () => {},
    toast: () => {}
  };
  vm.runInNewContext(source, { window: root, globalThis: root, TextEncoder, btoa }, { filename: 'offdevice-backup.js' });
  return { api: root.SaagarOffDeviceBackup, root, values, events };
}

test('S03a-3 off-device refuses an empty fresh payload and sends nothing', async () => {
  const h = harness();
  await h.api.configure('correct horse battery staple');
  h.events.length = 0;
  h.root.freshPortableBackupPayload = async () => ({ createdAt: 'x', localStorage: {} });
  await assert.rejects(h.api.run(true), /no app data/i);
  assert.equal(h.events.includes('copy'), false);
  assert.equal(h.events.includes('authorize'), false);
  assert.match(JSON.parse(h.values.get(h.api.CONFIG_KEY)).lastError, /no app data/i);
  h.root.freshPortableBackupPayload = async () => ({ createdAt: 'y', localStorage: { demo: '[]' } });
  const ok = await h.api.run(true);
  assert.equal(ok.ok, true);
});
