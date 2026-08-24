import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPhase6iSourceFreeze, RECEIPT } from '../scripts/create-phase6i-source-freeze.mjs';
import { readModuleManifestSource } from '../scripts/lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('Phase 6I freezes twelve external modules with no production legacy consumer', () => {
  const freeze = createPhase6iSourceFreeze(root);
  assert.equal(freeze.manifest.modules, 12);
  assert.deepEqual(freeze.moduleIds, ['stock','service','qms','dsr','expense','grooming','cro_audit','payroll','leave','tax','planning','etp']);
  assert.equal(freeze.legacyCleanup.productionAssetExists, false);
  assert.deepEqual(freeze.legacyCleanup.consumers, []);
  assert.deepEqual(freeze.legacyCleanup.inlineMigrationDeltas,
    ['www/modules/payroll/index.html','www/modules/qms/index.html']);
  assert.ok(freeze.scopeOwnership.every(row => row.testExists));
  assert.deepEqual(freeze.e7, { status: 'DEFERRED', includedInCandidate: false });
  assert.equal(freeze.formalApproval, false);
});

test('manifest identities bind final module and shared-asset bytes', () => {
  const manifest = readModuleManifestSource(root).data;
  for (const entry of [...manifest.modules, ...manifest.sharedAssets]) {
    const bytes = fs.readFileSync(path.join(root, 'www', entry.file));
    assert.equal(entry.bytes, bytes.length, entry.id);
    assert.equal(entry.sha256, sha256(bytes), entry.id);
  }
});

test('recorded source-freeze receipt binds the current WWW tree', () => {
  const recorded = JSON.parse(fs.readFileSync(path.join(root, RECEIPT), 'utf8'));
  const current = createPhase6iSourceFreeze(root);
  assert.deepEqual(recorded, current);
  assert.match(recorded.wwwTree.treeSha256, /^[a-f0-9]{64}$/);
});
