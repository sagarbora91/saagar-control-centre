import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory } from '../scripts/audit-modular-architecture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = createInventory(root);

test('MH1 architecture inventory is complete, reproducible, and payload-free', () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.modules.length, 11);
  assert.equal(new Set(inventory.modules.map(module => module.id)).size, 11);
  assert.match(inventory.shell.sha256, /^[a-f0-9]{64}$/);
  for (const module of inventory.modules) {
    assert.equal(module.bytes, module.registryBytes, `${module.id} bytes`);
    assert.equal(module.sha256, module.registrySha256, `${module.id} hash`);
    assert.match(module.sha256, /^[a-f0-9]{64}$/);
    assert.ok(module.assets.includes('../../mobile-layout.css'), `${module.id} mobile layout`);
    assert.ok(module.assets.includes('../../app-i18n.js'), `${module.id} language runtime`);
    assert.ok(module.inlineScripts > 0, `${module.id} inline script inventory`);
    assert.ok(module.inlineStyles > 0, `${module.id} inline style inventory`);
    assert.equal(Object.hasOwn(module, 'html'), false, `${module.id} must not duplicate source payload`);
  }
});

test('MH1 inventory pins shared-control and live-access differences', () => {
  const byId = Object.fromEntries(inventory.modules.map(module => [module.id, module]));
  assert.deepEqual(
    inventory.modules.filter(module => module.liveAccessContext).map(module => module.id),
    ['stock', 'service', 'dsr', 'expense']
  );
  for (const id of ['expense', 'grooming', 'cro_audit', 'payroll', 'leave', 'tax', 'planning']) {
    assert.ok(byId[id].assets.includes('../../c1-control-desk.js'), `${id} control desk`);
    assert.ok(byId[id].assets.includes('../../c1-operations-policy.js'), `${id} C1 policy`);
  }
  for (const id of ['stock', 'service', 'qms', 'dsr']) {
    assert.equal(byId[id].assets.includes('../../c1-control-desk.js'), false, `${id} separate control path`);
  }
});
