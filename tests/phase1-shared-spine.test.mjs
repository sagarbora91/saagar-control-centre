import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run as auditA2 } from '../scripts/audit/audits/a2.mjs';
import { run as auditA3 } from '../scripts/audit/audits/a3.mjs';
import { run as auditA8 } from '../scripts/audit/audits/a8.mjs';
import { buildCapabilityDeltaLedger } from '../scripts/analyze-modular-capability-delta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = path.join(root, 'www', 'modules');
const moduleFiles = fs.readdirSync(modulesRoot).map(id => path.join(modulesRoot, id, 'index.html'));

test('Phase 1 messaging runtime exposes one frozen same-origin gateway', () => {
  const source = fs.readFileSync(path.join(root, 'www/shared/module-runtime.js'), 'utf8');
  assert.equal((source.match(/['"]\*['"]/g) || []).length, 2, 'only the centralized fallback comparison remains');
  const warnings = [];
  const context = { window: { location: { origin: 'https://app.local' } }, console: { warn: value => warnings.push(value) } };
  vm.runInNewContext(source, context);
  const runtime = context.window.SaagarModuleRuntime;
  assert.equal(runtime.version, 2);
  assert.equal(runtime.targetOrigin, 'https://app.local');
  assert.equal(typeof runtime.reauth, 'function');
  assert.equal(typeof runtime.printDocument, 'function');
  assert.equal(runtime.messages.print, 'ST_PRINT');
  assert.equal(runtime.keys.gateStatus, 'saagar_gate_status');
  assert.equal(runtime.accepts({ source: context.window, origin: 'https://app.local' }, context.window), true);
  assert.equal(runtime.accepts({ source: context.window, origin: 'https://evil.invalid' }, context.window), false);
  assert.equal(warnings.length, 0);
});

test('shared module reauthentication is asynchronous and fail-closed', async () => {
  const source = fs.readFileSync(path.join(root, 'www/shared/module-runtime.js'), 'utf8');
  const base = { location: { origin: 'https://app.local' } };
  const missing = { window: { ...base } };
  missing.window.parent = missing.window;
  vm.runInNewContext(source, missing);
  assert.equal(await missing.window.SaagarModuleRuntime.reauth('protected action'), false);

  const throwing = { window: { ...base, SaagarReauth: async () => { throw new Error('unavailable'); } } };
  throwing.window.parent = throwing.window;
  vm.runInNewContext(source, throwing);
  assert.equal(await throwing.window.SaagarModuleRuntime.reauth('protected action'), false);
});

test('Phase 1 modules load the gateway and contain no direct wildcard message targets', () => {
  for (const file of moduleFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.split('<script src="../../shared/module-runtime.js"></script>').length - 1, 1, file);
    assert.doesNotMatch(source, /postMessage\s*\([\s\S]{0,1600}?,\s*['"]\*['"]\s*\)/, file);
    for (const receiver of source.matchAll(/addEventListener\(['"]message['"]([\s\S]{0,700})/g)) {
      assert.match(receiver[1], /SaagarModuleRuntime\.accepts|SaagarMah4Runtime/, `unvalidated receiver: ${file}`);
    }
  }
  const shell = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  assert.equal(shell.split('<script src="shared/module-runtime.js"></script>').length - 1, 1);
  assert.doesNotMatch(shell, /postMessage\s*\([\s\S]{0,1600}?,\s*['"]\*['"]\s*\)/);
  assert.match(shell, /window\.addEventListener\('message', e => \{\s*if\(!e \|\| !e\.data \|\| e\.origin!==window\.location\.origin\) return;/);
});

test('Phase 1 promotes owner-context enforcement to one shared access stage', () => {
  for (const moduleId of ['stock','service','dsr','expense']) {
    const source = fs.readFileSync(path.join(modulesRoot,moduleId,'index.html'),'utf8');
    const bridge = source.match(/<script id="st-v5-module-access-bridge">([\s\S]*?)<\/script>/);
    assert.ok(bridge, moduleId);
    assert.match(bridge[1], /SaagarModuleRuntime\.run\('access'/);
    assert.doesNotMatch(bridge[1], /function\s+(?:readContext|setup|syncContext)/);
  }
});

test('Phase 1 freezes the shared CSS assets in the manifest and module graph', () => {
  const manifestSource = fs.readFileSync(path.join(root, 'www/module-manifest.js'), 'utf8');
  for (const asset of [
    'shared/module-uniform.css', 'shared/module-back.css', 'shared/module-employee.css',
    'shared/module-mobile-common.css', 'shared/module-brand-tokens.css', 'shared/module-delete-cell.css'
  ]) {
    assert.match(manifestSource, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const href = `../../${asset}`;
    assert.ok(moduleFiles.filter(file => fs.readFileSync(file, 'utf8').includes(href)).length >= 2, asset);
  }
});

test('Phase 1 audit exit closes owned authority gates and records exact capability review', async () => {
  const context = buildContext(root);
  const [a2, a3, a8, ledger] = await Promise.all([
    auditA2(context), auditA3(context), auditA8(context), buildCapabilityDeltaLedger(root)
  ]);
  const byId = result => Object.fromEntries(result.checks.map(check => [check.id, check]));
  const a2Checks = byId(a2);
  for (const id of ['A2-01', 'A2-03', 'A2-04', 'A2-05']) assert.equal(a2Checks[id].result, 'pass', id);
  assert.ok(a2Checks['A2-02'].metric.nearCopyGroups < 42);
  assert.ok(a2Checks['A2-02'].metric.similarityEdges < 1997);
  const capability = byId(a3)['A3-02'];
  assert.equal(capability.result, 'pass');
  assert.equal(capability.metric.capabilities, 660);
  assert.equal(capability.metric.conflictingIds, 0);
  assert.equal(ledger.baseline.capabilities, 655);
  assert.equal(ledger.summary.capabilityApprovalsRequired, 107);
  assert.equal(ledger.approvalStatus, 'pending-owner-approval');
  const remote = byId(a8)['A8-05'];
  assert.equal(remote.metric.unapprovedRemoteCalls, 0);
});
