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
  assert.equal(recorded.current.capabilities, 681);
  assert.equal(recorded.summary.added, 34);
  assert.equal(recorded.summary.removed, 8);
  assert.equal(recorded.summary.changed, 88);
  assert.equal(recorded.summary.capabilityApprovalsRequired, 130);
  assert.equal(recorded.summary.handlerBodyHashOnly, 52);
  assert.equal(recorded.summary.bindingStructureChanged, 21);
  assert.equal(recorded.summary.changedFailurePostures, 15);
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
  assert.equal(ledger.deltas.filter(item => item.category === 'persisted-outcome').length, 0);
});
