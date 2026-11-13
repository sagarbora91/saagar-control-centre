import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCapabilityDeltaLedger, LEDGER_PATH } from '../scripts/analyze-modular-capability-delta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('modular capability delta ledger exactly matches the frozen A3 comparison', async () => {
  const expected = await buildCapabilityDeltaLedger(root);
  const recorded = JSON.parse(fs.readFileSync(path.join(root, LEDGER_PATH), 'utf8'));
  assert.deepEqual(recorded, expected);
  assert.equal(recorded.baseline.capabilities, 655);
  assert.equal(recorded.current.capabilities, 760);
  assert.equal(recorded.summary.added, 457);
  assert.equal(recorded.summary.removed, 352);
  assert.equal(recorded.summary.changed, 60);
  assert.equal(recorded.summary.capabilityApprovalsRequired, 869);
  assert.equal(recorded.summary.handlerBodyHashOnly, 35);
  assert.equal(recorded.summary.bindingStructureChanged, 3);
  assert.equal(recorded.summary.changedFailurePostures, 22);
  assert.equal(recorded.summary.reportPresentationFallbacks, 1);
  const presentationFallback = recorded.deltas.find(item => item.capabilityId === 'script-etp-import-ui:failure:posture');
  assert.equal(presentationFallback.change, 'changed');
  assert.equal(presentationFallback.reviewClass, 'report-presentation-enrichment-fallback-added');
  assert.equal(presentationFallback.baseline.outcome.explicitFallbackSites, 0);
  assert.equal(presentationFallback.current.outcome.explicitFallbackSites, 1);
  const reauthentication = recorded.deltas.find(item =>
    item.capabilityId === 'script-etp-module-gateway:permission:reauthentication');
  assert.equal(reauthentication.change, 'added');
  assert.equal(reauthentication.reviewClass, 'bounded-etp-reauthentication-authority');
});

test('capability review remains fail-closed until the owner explicitly approves it', async () => {
  const ledger = await buildCapabilityDeltaLedger(root);
  assert.equal(ledger.approvalStatus, 'pending-owner-approval');
  assert.ok(ledger.deltas.every(item => item.ownerApproval === 'pending'));
  assert.ok(ledger.deltas.every(item => item.reason && item.baselineOutcomeSha256 !== item.currentOutcomeSha256));
  assert.equal(ledger.deltas.filter(item => item.category === 'route').length, 1);
  /* Fix wave: exactly the four G5 keys (items 2 and 3) and the retired Service invoice counter (interface C). */
  assert.deepEqual(ledger.deltas.filter(item => item.category === 'persisted-outcome')
    .map(item => `${item.capabilityId}:${item.change}`), [
    'payroll:persist:2c70e12b7a0646f92279:added',
    'payroll:persist:dd25a3198b0013d1d7c3:added',
    'script-service-stores-store:persist:8254c329a92850f6d539:added',
    'service:persist:556fd13bc825db2d2664:removed',
    'stock:persist:33b94f3f822ff4adb51a:added',
    'stock:persist:449d73e56af4d2b66503:added'
  ]);
});
