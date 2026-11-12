/* ETP report-engine bridge: build-time helper containment (Wave 7, R-2, owner decision given in chat, 2026-11-12).
   Babel puts helper functions (_regenerator, asyncGeneratorStep, _asyncToGenerator, _typeof ...) at the top level of a classic script,
   where they become writable window globals. The APK build wraps the four bridge files in a function scope. These tests run the
   project's own transform (scripts/prepare-api23-assets.mjs) on the four real files in a scratch folder and look at what comes out. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { transformJavaScriptAsset } from '../scripts/prepare-api23-assets.mjs';
import { readWww } from './lib/etp-bridge-test-support.mjs';

const require = createRequire(import.meta.url);
const { parseSync } = require('@babel/core');
const FILES = ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js'];
const GLOBAL_OF = { 'etp-bridge-trust.js': 'SaagarEtpBridgeTrust', 'etp-bridge-pack-verifier.js': 'SaagarEtpBridgePackVerifier', 'etp-bridge-compare.js': 'SaagarEtpBridgeCompare', 'etp-bridge-facade.js': 'SaagarEtpBridgeFacade' };
const HELPER_NAMES = ['_regenerator', '_regeneratorDefine2', 'asyncGeneratorStep', '_asyncToGenerator', '_typeof'];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-bridge-containment-'));
after(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

/* The same call the build makes, with the file's path relative to www/ as the third argument; the output is written to the scratch folder and read back. */
function transformed(name, relativePath = name) {
  const source = readWww(name);
  const out = path.join(scratch, relativePath.replace(/[\\/]/g, '__'));
  fs.writeFileSync(out, transformJavaScriptAsset(source, path.join(scratch, name), relativePath), 'utf8');
  return fs.readFileSync(out, 'utf8');
}

function topLevelKinds(code) {
  return parseSync(code, { sourceType: 'script', configFile: false, babelrc: false }).program.body.map((node) => node.type);
}

function freshContext(extra = {}) {
  const counts = { size: 0, arrayBuffer: 0, reauth: 0 };
  const context = vm.createContext({
    crypto: webcrypto, TextDecoder, Date, Uint8Array, ArrayBuffer,
    SaagarOwnerSession: { read: () => ({ version: 1, isOwner: true, role: 'Store Manager', isManager: true }) }, roleCanOpen: () => true,
    SaagarReauth: async () => { counts.reauth += 1; return true; }, auditLog: () => {}, ...extra
  });
  for (const name of ['etp-store-lifecycle-policy.js', 'etp-profile-authority.js', 'etp-tender-dictionary.js']) vm.runInContext(readWww(name), context, { filename: name });
  vm.runInContext('globalThis.SaagarEtpModuleGateway = Object.freeze({ readVerified: async function () { return { ok: false, code: "ETP_RECEIPT_NOT_FOUND" }; }, readFacade: Object.freeze({ loadSummary: async function () { return { ok: false }; } }) });', context);
  return { context, counts };
}

const fileStub = (counts) => ({ name: 'pack.scc-etp', get size() { counts.size += 1; return 10; }, arrayBuffer() { counts.arrayBuffer += 1; return Promise.resolve(new ArrayBuffer(10)); } });

test('the transformed bridge files have no top-level declaration at all: one wrapped call, no top-level function declarations', () => {
  for (const name of FILES) {
    const code = transformed(name);
    assert.deepEqual(topLevelKinds(code), ['ExpressionStatement'], `${name}: only the wrapper call is at the top level`);
    assert.ok(code.startsWith('(function () {\n') && code.endsWith('\n}).call(this);\n'), `${name}: wrapper shape`);
  }
  const loader = transformJavaScriptAsset(readWww('etp-chain-loader.js'), path.join(scratch, 'etp-chain-loader.js'), 'etp-chain-loader.js');
  assert.equal(topLevelKinds(loader).includes('FunctionDeclaration'), false, 'the eager loader is not wrapped, so its facade check must not need a page-global Babel helper');
});

test('running each transformed file adds exactly its own global to the page, and nothing else', () => {
  const { context } = freshContext();
  for (const name of FILES) {
    const before = new Set(Object.getOwnPropertyNames(context));
    vm.runInContext(transformed(name), context, { filename: name });
    const added = Object.getOwnPropertyNames(context).filter((key) => !before.has(key));
    assert.deepEqual(added, [GLOBAL_OF[name]], `${name}: new globals`);
    const descriptor = Object.getOwnPropertyDescriptor(context, GLOBAL_OF[name]);
    assert.ok(descriptor.writable === false && descriptor.configurable === false && Object.isFrozen(descriptor.value), `${name}: still write-once and frozen`);
  }
  for (const key of HELPER_NAMES) assert.equal(Object.prototype.hasOwnProperty.call(context, key), false, `${key} is not a page global`);
});

test('negative control: the same files through the same transform under any other path still leak their helpers (so this test would catch a lost wrapper)', () => {
  const leaked = (name) => {
    const code = transformed(name, `shared/${name}`);
    return topLevelKinds(code).includes('FunctionDeclaration');
  };
  assert.equal(leaked('etp-bridge-pack-verifier.js'), true, 'the verifier has async code, so Babel emits top-level helper functions');
  assert.equal(leaked('etp-bridge-facade.js'), true);
  const { context } = freshContext();
  vm.runInContext(transformed('etp-bridge-trust.js', 'shared/etp-bridge-trust.js'), context);
  vm.runInContext(transformed('etp-bridge-pack-verifier.js', 'shared/etp-bridge-pack-verifier.js'), context);
  assert.equal(typeof context._asyncToGenerator, 'function', 'unwrapped, a helper becomes a writable page global');
});

test('overwriting every well-known helper name on the page changes nothing for the wrapped facade, and the closed gate still reads nothing', async () => {
  const { context, counts } = freshContext();
  for (const name of FILES) vm.runInContext(transformed(name), context, { filename: name });
  const facade = context.SaagarEtpBridgeFacade;
  assert.deepEqual({ ...(await facade.status()) }, { ok: true, gate: 'CLOSED', access: 'OWNER', maxBytes: 33554432 });
  const staged = await facade.stage({ file: fileStub(counts) });
  assert.equal(staged.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  for (const key of HELPER_NAMES) vm.runInContext(`globalThis.${key} = function () { throw new Error('tampered ${key}'); };`, context);
  assert.deepEqual({ ...(await facade.status()) }, { ok: true, gate: 'CLOSED', access: 'OWNER', maxBytes: 33554432 });
  const again = await facade.stage({ file: fileStub(counts) });
  assert.equal(again.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  assert.deepEqual(counts, { size: 0, arrayBuffer: 0, reauth: 0 });
});

test('the build identity file and every other script keep the unwrapped Babel output', () => {
  const identity = 'var x = 1;\n';
  assert.equal(transformJavaScriptAsset(identity, path.join(scratch, 'build-identity.js'), 'build-identity.js'), identity);
  const other = transformJavaScriptAsset('async function f() { return 1; }\n', path.join(scratch, 'x.js'), 'x.js');
  assert.ok(!other.startsWith('(function () {'), 'a non-bridge script is not wrapped');
  assert.ok(other.includes('function _asyncToGenerator'), 'a non-bridge script is transformed exactly as before');
  const nested = transformJavaScriptAsset('var a = 1;\n', path.join(scratch, 'etp-bridge-facade.js'), 'shared/etp-bridge-facade.js');
  assert.ok(!nested.startsWith('(function () {'), 'only the exact root-level file names are wrapped');
});

test('source: the build script names the four contained files exactly once, in one set', () => {
  const source = fs.readFileSync(new URL('../scripts/prepare-api23-assets.mjs', import.meta.url), 'utf8');
  for (const name of FILES) assert.equal(source.split(`'${name}'`).length - 1, 1, `${name} appears once`);
  assert.equal(source.split('CONTAINED_ASSETS').length - 1, 2, 'declared once, used once');
});
