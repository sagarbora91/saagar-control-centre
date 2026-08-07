import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource } from '../scripts/lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = id => fs.readFileSync(path.join(root, 'www', 'modules', id, 'index.html'), 'utf8');

test('DSR shared-runtime canary replaces only the six approved helpers', () => {
  const dsr = read('dsr');
  const config = "{schemaVersion:1,moduleId:'dsr',nextSteps:[{id:'stock',label:'Update Stock →'}],customerSelectors:[],accessContext:true}";
  assert.equal(dsr.split('<script src="../../shared/module-runtime.js"></script>').length - 1, 1);
  for (const [id, stage] of [['st-v5-iframe-shim','storage'],['st-v5-safety-net','safety'],['st-v5-mobile-boot','mobile'],['st-v5-back-script','back'],['st-v5-emp-assist-script','employees'],['st-v5-module-audit-bridge','audit']]) {
    const match = dsr.match(new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`));
    assert.ok(match, id);
    assert.equal(match[1], `SaagarModuleRuntime.run('${stage}',${config});`);
  }
});

test('DSR canary preserves source-guarded access and its interval cleanup contract', () => {
  const dsr = read('dsr');
  assert.match(dsr, /id="st-v5-module-access-bridge"/);
  assert.match(dsr, /event\.source===window\.parent&&event\.data&&event\.data\.type==='ST_ACCESS_CONTEXT'/);
  assert.match(dsr, /_rehydrateTimer\s*=\s*setInterval\(rehydrateBridgeRows,\s*20000\)/);
  assert.match(dsr, /clearInterval\(_rehydrateTimer\);\s*_rehydrateTimer\s*=\s*null/);
  assert.equal((dsr.match(/\bsetInterval\s*\(/g) || []).length, 1);
});

test('DSR canary identity is bound by the module manifest', () => {
  const bytes = fs.readFileSync(path.join(root, 'www', 'modules', 'dsr', 'index.html'));
  const manifest = readModuleManifestSource(root).data;
  const dsr = manifest.modules.find(item => item.id === 'dsr');
  assert.equal(dsr.bytes, bytes.length);
  assert.equal(dsr.sha256, sha256(bytes));
});

test('DSR evidence binds all 12 rendered cases without device overclaim', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'verification', 'mah3-visual-review', 'MAH3-DSR-CANARY-EVIDENCE-2026-08-07.json')));
  assert.equal(evidence.cases.length, 12);
  assert.equal(new Set(evidence.cases).size, 12);
  assert.deepEqual(evidence.results, {reviewed:12,passed:12,readinessFailures:0,hardGeometryFindings:0,rootOverflowFindings:0,defects:0,deferred:0});
  assert.equal(evidence.dsrSha256, sha256(fs.readFileSync(path.join(root, 'www', 'modules', 'dsr', 'index.html'))));
  assert.equal(evidence.runtimeSha256, sha256(fs.readFileSync(path.join(root, 'www', 'shared', 'module-runtime.js'))));
  assert.equal(evidence.acceptance.browserCanaryPassed, true);
  assert.equal(evidence.acceptance.physicalDeviceAccepted, false);
  assert.equal(evidence.acceptance.nativeLanguageAccepted, false);
  assert.equal(evidence.acceptance.productionAccepted, false);
});

test('QMS shared-runtime canary replaces only the six approved helpers', () => {
  const qms = read('qms');
  const config = "{schemaVersion:1,moduleId:'qms',nextSteps:[{id:'dsr',label:'Record in DSR →'}],customerSelectors:['#custName'],accessContext:false}";
  assert.equal(qms.split('<script src="../../shared/module-runtime.js"></script>').length - 1, 1);
  for (const [id, stage] of [['st-v5-iframe-shim','storage'],['st-v5-safety-net','safety'],['st-v5-mobile-boot','mobile'],['st-v5-back-script','back'],['st-v5-emp-assist-script','employees'],['st-v5-module-audit-bridge','audit']]) {
    const match = qms.match(new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`));
    assert.ok(match, id);
    assert.equal(match[1], `SaagarModuleRuntime.run('${stage}',${config});`);
  }
});

test('QMS canary preserves both business intervals and mobile drawer closure', () => {
  const qms = read('qms');
  assert.match(qms, /setInterval\(tick,1000\)/);
  assert.match(qms, /setInterval\(function\(\)\{if\(document\.hidden\)return;[\s\S]*?renderAll\(\)\},45000\)/);
  assert.equal((qms.match(/\bsetInterval\s*\(/g) || []).length, 2);
  assert.match(qms, /var __sb=document\.querySelector\('\.sidebar'\);if\(__sb\)__sb\.classList\.remove\('open'\)/);
  assert.match(qms, /var __sc=document\.getElementById\('st-v5-qms-scrim'\);if\(__sc\)__sc\.classList\.remove\('show'\)/);
  const runtime = fs.readFileSync(path.join(root, 'www', 'shared', 'module-runtime.js'), 'utf8');
  assert.match(runtime, /c\.moduleId==='qms'/);
  assert.match(runtime, /b\.id='st-v5-qms-menu'/);
  assert.match(runtime, /sc\.id='st-v5-qms-scrim'/);
  assert.match(runtime, /sc\.addEventListener\('click',closeMenu\)/);
  assert.match(runtime, /b\.addEventListener\('click',function\(\)/);
});

test('QMS canary identity is bound by the module manifest', () => {
  const bytes = fs.readFileSync(path.join(root, 'www', 'modules', 'qms', 'index.html'));
  const manifest = readModuleManifestSource(root).data;
  const qms = manifest.modules.find(item => item.id === 'qms');
  assert.equal(qms.bytes, bytes.length);
  assert.equal(qms.sha256, sha256(bytes));
});

test('QMS evidence binds all 12 rendered cases and menu interactions without device overclaim', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'verification', 'mah3-visual-review', 'MAH3-QMS-CANARY-EVIDENCE-2026-08-07.json')));
  assert.equal(evidence.cases.length, 12);
  assert.equal(new Set(evidence.cases).size, 12);
  assert.deepEqual(evidence.results, {reviewed:12,passed:12,readinessFailures:0,hardGeometryFindings:0,rootOverflowFindings:0,defects:0,deferred:0});
  assert.equal(evidence.qmsSha256, sha256(fs.readFileSync(path.join(root, 'www', 'modules', 'qms', 'index.html'))));
  assert.equal(evidence.runtimeSha256, sha256(fs.readFileSync(path.join(root, 'www', 'shared', 'module-runtime.js'))));
  assert.deepEqual(evidence.interactionChecks, {mobileMenuVisible:true,menuOpensDrawer:true,scrimClosesDrawer:true,navigationClosesDrawer:true,navigationTarget:'rotation',navigationTargetActivated:true});
  assert.equal(evidence.acceptance.browserRendered, true);
  assert.equal(evidence.acceptance.physicalDevice, false);
  assert.equal(evidence.acceptance.nativeLanguage, false);
  assert.equal(evidence.acceptance.productionData, false);
});
