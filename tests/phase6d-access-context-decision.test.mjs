import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = path.join(root, 'www', 'modules');
const runtime = fs.readFileSync(path.join(root, 'www', 'shared', 'module-runtime.js'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'www', 'etp-module-gateway.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');

const DECISION = Object.freeze({
  stock: true,
  service: true,
  qms: false,
  dsr: true,
  expense: true,
  grooming: false,
  cro_audit: false,
  payroll: false,
  leave: false,
  tax: false,
  planning: false,
  etp: false
});

function moduleSource(moduleId) {
  return fs.readFileSync(path.join(modulesRoot, moduleId, 'index.html'), 'utf8');
}

function configuredAccessValues(source, moduleId) {
  const values = [];
  const expression = /SaagarModuleRuntime\.run\(\s*['"]([^'"]+)['"]\s*,\s*(\{[\s\S]*?\})\s*\);/g;
  for (const match of source.matchAll(expression)) {
    const id = /moduleId\s*:\s*['"]([^'"]+)['"]/.exec(match[2]);
    const access = /accessContext\s*:\s*(true|false)/.exec(match[2]);
    assert.equal(id && id[1], moduleId, `${moduleId}:${match[1]} module identity`);
    assert.ok(access, `${moduleId}:${match[1]} accessContext`);
    values.push({ stage: match[1], enabled: access[1] === 'true' });
  }
  assert.ok(values.length >= 5, `${moduleId} must configure every shared runtime stage`);
  return values;
}

test('Phase 6D freezes the twelve-module access-context decision without blanket enablement', () => {
  assert.deepEqual(Object.keys(DECISION), [
    'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
    'cro_audit', 'payroll', 'leave', 'tax', 'planning', 'etp'
  ]);
  assert.deepEqual(Object.entries(DECISION).filter(([, enabled]) => enabled).map(([id]) => id),
    ['stock', 'service', 'dsr', 'expense']);
  assert.equal(Object.values(DECISION).filter(Boolean).length, 4);
  assert.equal(Object.values(DECISION).filter(value => !value).length, 8);
});

test('every module runtime configuration and access bridge matches the frozen decision', () => {
  for (const [moduleId, enabled] of Object.entries(DECISION)) {
    const source = moduleSource(moduleId);
    const values = configuredAccessValues(source, moduleId);
    assert.ok(values.every(item => item.enabled === enabled), `${moduleId} runtime configuration drift`);
    const bridgeCount = (source.match(/id=["']st-v5-module-access-bridge["']/g) || []).length;
    assert.equal(bridgeCount, enabled ? 1 : 0, `${moduleId} access bridge decision`);
    if (enabled) assert.ok(values.some(item => item.stage === 'access'), `${moduleId} named access stage`);
    else assert.equal(values.some(item => item.stage === 'access'), false, `${moduleId} must not run access stage`);
  }
});

test('the four enabled modules have named consumers in the shared access runtime', () => {
  const accessStage = runtime.slice(runtime.indexOf('access:function(c){'));
  assert.match(accessStage, /moduleId==='stock'[\s\S]*originalSetMode[\s\S]*originalGoTab/);
  assert.match(accessStage, /moduleId==='dsr'[\s\S]*originalSetLoginRole[\s\S]*window\.loginSM/);
  assert.match(accessStage, /moduleId==='service'&&typeof renderDash==='function'/);
  assert.match(accessStage, /moduleId==='expense'&&typeof render==='function'/);
  assert.match(accessStage, /revokeManagerIfNeeded\(context\)[\s\S]*moduleId==='stock'[\s\S]*moduleId==='dsr'/);
  assert.match(accessStage, /refreshOwnerControls\(\)[\s\S]*moduleId==='service'[\s\S]*moduleId==='expense'/);
  for (const moduleId of Object.keys(DECISION).filter(id => !DECISION[id])) {
    assert.doesNotMatch(accessStage, new RegExp(`moduleId===['"]${moduleId}['"]`),
      `${moduleId} has no named access-context consumer`);
  }
});

test('ETP remains accessContext false because the parent gateway is the fail-closed boundary', () => {
  const etp = moduleSource('etp');
  assert.match(etp, /moduleId:['"]etp['"][^}]*accessContext:false/);
  assert.doesNotMatch(etp, /st-v5-module-access-bridge/);

  assert.match(gateway, /if \(!await permittedAsync\('IMPORT'\)\) return failure\('ETP_ACCESS_DENIED', 'AUTHORIZE'\)/);
  assert.match(gateway, /if \(!await permittedAsync\('CONFIRM'\)\) return failure\('ETP_ACCESS_DENIED', 'AUTHORIZE'\)/);
  assert.match(gateway, /if \(!permitted\('READ'\)\) return failure\('ETP_ACCESS_DENIED', 'AUTHORIZE'\)/);
  assert.match(gateway, /action === 'IMPORT' && snapshot\.isOwner === true/);
  assert.match(gateway, /action === 'IMPORT' \|\| action === 'CONFIRM'[\s\S]*SaagarReauth/);
  assert.match(gateway, /snapshot\.role === 'Store Manager'[\s\S]*roleCanOpen\('etp'\) === true/);
  assert.match(gateway, /readFacade = freeze\(\{ listScopes: listScopes, inspectScope: inspectScope, loadSummary: loadSummary \}\)/);
  assert.doesNotMatch(gateway, /readFacade = freeze\([^\n]*(?:run|confirm|readVerified|runtime|plugin|storage)/);

  assert.match(shell, /"Store Manager":ALL\(\)/);
  for (const role of ['Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others']) {
    const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = new RegExp(`"${escaped}":ONLY\\(([^)]*)\\)`).exec(shell);
    assert.ok(row, role);
    assert.doesNotMatch(row[1], /["']etp["']/, `${role} cannot open ETP`);
  }
  const access = /function ensureModuleAccess\(id\)\{([\s\S]*?)\n\}/.exec(shell);
  assert.ok(access);
  assert.ok(access[1].indexOf('roleCanOpen(id)') < access[1].indexOf('modulePinRequired(id)'),
    'shell role denial must precede module PIN entry');
});
