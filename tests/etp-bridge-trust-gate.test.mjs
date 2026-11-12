/* ETP report-engine bridge: GATE-ETP-BRIDGE-TRUST. The shipped tree contains no trusted key, so the gate is closed and every pack is
   refused. A test public key can reach the verifier only through the Node-only create() factory (owner decisions B-3 and B-4).
   The throwaway key pair in these tests is generated in memory, is non-extractable and is never written. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCaseSet, buildPack, DEFAULT_VERIFY_OPTIONS } from '../scripts/lib/etp-bridge-pack-builder.mjs';
import { BANNED_BROWSER_TOKENS, loadBridge, readWww, spyCrypto, trustApi, verifierApi } from './lib/etp-bridge-test-support.mjs';

const OPTIONS = DEFAULT_VERIFY_OPTIONS;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const set = await buildCaseSet({});
const byId = Object.fromEntries(set.cases.map((entry) => [entry.id, entry]));
const FILES = ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js'];
const GATE_CLOSED = 'ETP_BRIDGE_TRUST_GATE_CLOSED';
const KEYS_LINE = 'var KEYS = Object.freeze([]);';

function withKeys(entries) {
  const literal = `var KEYS = Object.freeze([${entries.map((entry) => `Object.freeze({ keyId: ${JSON.stringify(entry.keyId)}, publicKeyHex: ${JSON.stringify(entry.publicKeyHex)} })`).join(', ')}]);`;
  return { 'etp-bridge-trust.js': (source) => { assert.ok(source.includes(KEYS_LINE), 'the shipped key list line is present'); return source.replace(KEYS_LINE, literal); } };
}
function walkFiles(dir, accept) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', '.git'].includes(entry.name)) out.push(...walkFiles(full, accept)); } else if (accept(full)) out.push(full);
  }
  return out;
}
const textFile = (file) => /\.(?:js|mjs|cjs|json|html|css|ps1|bat|md|txt|gradle|properties|xml)$/i.test(file);

test('the shipped trust file is a frozen object with an empty key list and a closed gate', () => {
  const loaded = loadBridge({ files: [FILES[0]] });
  const descriptor = Object.getOwnPropertyDescriptor(loaded.context, 'SaagarEtpBridgeTrust');
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  const trust = descriptor.value;
  assert.deepEqual(Object.keys(trust).sort(), ['CONTRACT', 'GATE_ID', 'VERSION', 'gate', 'keys']);
  assert.equal(Object.isFrozen(trust), true);
  assert.equal(Object.isFrozen(trust.keys), true);
  assert.equal(trust.keys.length, 0);
  assert.equal(trust.VERSION, 1);
  assert.equal(trust.GATE_ID, 'GATE-ETP-BRIDGE-TRUST');
  assert.equal(trust.CONTRACT, 'SCC_ETP_BRIDGE_V1');
  assert.deepEqual({ ...trust.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: false, state: 'CLOSED', code: 'ETP_BRIDGE_TRUST_ANCHOR_ABSENT' });
  assert.equal(Object.isFrozen(trust.gate()), true);
  for (const forbidden of ['authorizeAction', 'audit', 'createForTest', 'create', 'setKeys', 'addKey']) assert.equal(forbidden in trust, false, forbidden);
  assert.equal(trustApi.keys.length, 0, 'the CommonJS export is the same empty list');
  assert.deepEqual({ ...trustApi.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: false, state: 'CLOSED', code: 'ETP_BRIDGE_TRUST_ANCHOR_ABSENT' });
  assert.equal(Object.isFrozen(trustApi), true);
});

test('the globals are defined once and can be neither replaced, deleted nor redefined (T02)', () => {
  const loaded = loadBridge();
  const probe = (name) => vm.runInContext(`(function () {
    'use strict';
    var out = [];
    try { ${name} = {}; out.push('assigned'); } catch (e) { out.push(e.constructor.name); }
    try { out.push(String(delete globalThis.${name})); } catch (e) { out.push(e.constructor.name); }
    try { Object.defineProperty(globalThis, '${name}', { value: 1 }); out.push('defined'); } catch (e) { out.push(e.constructor.name); }
    return out.join();
  })()`, loaded.context);
  for (const name of ['SaagarEtpBridgeTrust', 'SaagarEtpBridgePackVerifier']) {
    const outcome = probe(name).split(',');
    assert.equal(outcome[0], 'TypeError', `${name}: assignment`);
    assert.ok(outcome[1] === 'TypeError' || outcome[1] === 'false', `${name}: delete is refused`);
    assert.equal(outcome[2], 'TypeError', `${name}: redefinition`);
    assert.ok(Object.getOwnPropertyDescriptor(loaded.context, name), `${name} is still defined`);
    const descriptor = Object.getOwnPropertyDescriptor(loaded.context, name);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
  }
  assert.deepEqual(Object.keys(loaded.context.SaagarEtpBridgePackVerifier).sort(), ['CODES', 'CONTRACT', 'GATE_ID', 'MESSAGES', 'VERSION', 'gate', 'verify']);
  assert.equal(Object.isFrozen(loaded.context.SaagarEtpBridgePackVerifier), true);
  assert.equal(Object.isFrozen(loaded.context.SaagarEtpBridgePackVerifier.CODES), true);
  assert.deepEqual(Object.getOwnPropertyNames(loaded.context).filter((name) => /^Saagar/.test(name)).sort(), ['SaagarEtpBridgePackVerifier', 'SaagarEtpBridgeTrust']);
});

test('shipped build: a valid test-key pack and every other pack get the gate-closed code with no digest, import, verify, parse or decode call (T02)', async () => {
  const spies = spyCrypto();
  const loaded = loadBridge({ sandbox: { crypto: spies.crypto } });
  const verifier = loaded.context.SaagarEtpBridgePackVerifier;
  assert.deepEqual({ ...verifier.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: false, state: 'CLOSED', code: GATE_CLOSED });
  for (const entry of set.cases) {
    const result = await verifier.verify(entry.bytes, entry.verifyOptions);
    assert.equal(result.ok, false, entry.id);
    assert.equal(result.code, GATE_CLOSED, entry.id);
    assert.equal(result.message, verifier.MESSAGES[GATE_CLOSED]);
    assert.equal(entry.expect.shipped, GATE_CLOSED);
  }
  for (const junk of [undefined, null, 'x', {}, [], new Uint8Array(3)]) assert.equal((await verifier.verify(junk, junk)).code, GATE_CLOSED);
  assert.deepEqual(spies.calls, { digest: 0, importKey: 0, verify: 0 });
  assert.equal(loaded.counts.parse, 0);
  assert.equal(loaded.counts.decode, 0);
  assert.match(verifier.MESSAGES[GATE_CLOSED], /no trusted engine key is installed/);
});

test('with the trust file missing the gate is closed (T02)', async () => {
  const loaded = loadBridge({ files: [FILES[1]] });
  const verifier = loaded.context.SaagarEtpBridgePackVerifier;
  assert.equal(verifier.gate().open, false);
  assert.equal((await verifier.verify(byId['valid-day'].bytes, OPTIONS)).code, GATE_CLOSED);
});

test('a hostile trust definition that exists before the file loads gives a closed gate, never an open one (T02)', async () => {
  const anchor = JSON.stringify(set.anchor);
  const variants = {
    'plain writable object': `globalThis.SaagarEtpBridgeTrust = { VERSION: 1, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: [${anchor}], gate: function () { return { open: true }; } };`,
    'locked but not frozen': `Object.defineProperty(globalThis, 'SaagarEtpBridgeTrust', { value: { VERSION: 1, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: [${anchor}], gate: function () {} }, writable: false, configurable: false });`,
    'frozen with an extra member': `Object.defineProperty(globalThis, 'SaagarEtpBridgeTrust', { value: Object.freeze({ VERSION: 1, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: Object.freeze([${anchor}]), gate: function () {}, authorize: function () { return true; } }), writable: false, configurable: false });`,
    'frozen with a thawed key list': `Object.defineProperty(globalThis, 'SaagarEtpBridgeTrust', { value: Object.freeze({ VERSION: 1, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: [${anchor}], gate: function () {} }), writable: false, configurable: false });`,
    'frozen and complete but writable': `globalThis.SaagarEtpBridgeTrust = Object.freeze({ VERSION: 1, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: Object.freeze([${anchor}]), gate: function () {} });`,
    'locked with a frozen key list but a thawed object': `Object.defineProperty(globalThis, 'SaagarEtpBridgeTrust', { value: { VERSION: 1, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: Object.freeze([${anchor}]), gate: function () {} }, writable: false, configurable: false });`,
    'wrong version': `Object.defineProperty(globalThis, 'SaagarEtpBridgeTrust', { value: Object.freeze({ VERSION: 2, GATE_ID: 'GATE-ETP-BRIDGE-TRUST', CONTRACT: 'SCC_ETP_BRIDGE_V1', keys: Object.freeze([${anchor}]), gate: function () {} }), writable: false, configurable: false });`,
    'an accessor property': `Object.defineProperty(globalThis, 'SaagarEtpBridgeTrust', { get: function () { return { keys: [${anchor}] }; }, configurable: false });`,
    'a string': `globalThis.SaagarEtpBridgeTrust = 'trusted';`,
    'a function': `globalThis.SaagarEtpBridgeTrust = function () {};`
  };
  for (const [name, prelude] of Object.entries(variants)) {
    const loaded = loadBridge({ prelude });
    const verifier = loaded.context.SaagarEtpBridgePackVerifier;
    assert.equal(verifier.gate().open, false, name);
    assert.equal(verifier.gate().code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', name);
    assert.equal((await verifier.verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', name);
  }
  /* the real file never overwrites a name that is already taken */
  const taken = loadBridge({ prelude: `globalThis.SaagarEtpBridgeTrust = { hostile: true };` });
  assert.equal(taken.context.SaagarEtpBridgeTrust.hostile, true);
  const hostileVerifier = loadBridge({ prelude: `globalThis.SaagarEtpBridgePackVerifier = { hostile: true };` });
  assert.equal(hostileVerifier.context.SaagarEtpBridgePackVerifier.hostile, true);
});

test('the owner adding keys later (simulated by editing the source text in a sandbox) opens the gate, and a malformed list keeps it closed', async () => {
  const open = loadBridge({ edit: withKeys([set.anchor]) });
  const verifier = open.context.SaagarEtpBridgePackVerifier;
  assert.deepEqual({ ...verifier.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: true, state: 'OPEN', code: null });
  assert.deepEqual({ ...open.context.SaagarEtpBridgeTrust.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: true, state: 'OPEN', code: null });
  assert.equal((await verifier.verify(byId['valid-day'].bytes, OPTIONS)).ok, true);
  assert.equal((await verifier.verify(byId['unknown-key'].bytes, OPTIONS)).code, 'ETP_BRIDGE_KEY_UNKNOWN');
  assert.equal((await verifier.verify(byId['tampered-manifest-after-signing'].bytes, OPTIONS)).code, 'ETP_BRIDGE_SIGNATURE_INVALID');
  assert.equal((await verifier.verify(byId['store-hemw'].bytes, OPTIONS)).code, 'ETP_BRIDGE_STORE_HEMW_BLOCKED');
  const both = loadBridge({ edit: withKeys([set.anchor, set.otherAnchor]) });
  assert.equal((await both.context.SaagarEtpBridgePackVerifier.verify(byId['unknown-key'].bytes, OPTIONS)).ok, true);
  const bad = {
    'three keys': [set.anchor, set.otherAnchor, { keyId: '0123456789abcdef', publicKeyHex: set.anchor.publicKeyHex }],
    'duplicate id': [set.anchor, set.anchor],
    'upper case point': [{ keyId: set.anchor.keyId, publicKeyHex: set.anchor.publicKeyHex.toUpperCase().replace(/^04/, '04') }],
    'short key id': [{ keyId: set.anchor.keyId.slice(1), publicKeyHex: set.anchor.publicKeyHex }]
  };
  for (const [name, entries] of Object.entries(bad)) {
    const closed = loadBridge({ edit: withKeys(entries) });
    assert.equal(closed.context.SaagarEtpBridgeTrust.gate().open, false, name);
    assert.equal(closed.context.SaagarEtpBridgeTrust.gate().code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', name);
    assert.equal(closed.context.SaagarEtpBridgePackVerifier.gate().open, false, name);
    assert.equal((await closed.context.SaagarEtpBridgePackVerifier.verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', name);
  }
});

test('a browser page exposes no factory and no way to pass a key, crypto or trust option (T04)', async () => {
  const baseline = Object.getOwnPropertyNames(loadBridge({ files: [] }).context);
  const loaded = loadBridge();
  const created = Object.getOwnPropertyNames(loaded.context).filter((name) => !baseline.includes(name)).sort();
  assert.deepEqual(created, ['SaagarEtpBridgePackVerifier', 'SaagarEtpBridgeTrust']);
  assert.equal(vm.runInContext('typeof module + typeof require + typeof process', loaded.context), 'undefinedundefinedundefined');
  const verifier = loaded.context.SaagarEtpBridgePackVerifier;
  const seen = new Set(), functions = [];
  (function walk(value, depth) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
    seen.add(value);
    if (typeof value === 'function') functions.push(value);
    if (depth === 0) return;
    for (const name of Object.getOwnPropertyNames(value)) {
      if (['caller', 'callee', 'arguments'].includes(name)) continue;
      let child; try { child = value[name]; } catch { continue; }
      walk(child, depth - 1);
    }
  })({ trust: loaded.context.SaagarEtpBridgeTrust, verifier }, 5);
  assert.ok(functions.length >= 2, 'at least gate() and verify() are reachable');
  const attempts = [
    [{ trust: [set.anchor], trustedKeys: [set.anchor], anchors: [set.anchor], keys: [set.anchor], crypto: webcrypto, publicKey: set.anchor.publicKeyHex }],
    [[set.anchor]], [set.anchor], [set.anchor.publicKeyHex], [{ kty: 'EC', crv: 'P-256' }], [byId['valid-day'].bytes, { ...OPTIONS, trustedKeys: [set.anchor], crypto: webcrypto }]
  ];
  for (const fn of functions) {
    for (const args of attempts) {
      try { const outcome = fn.apply(undefined, args); if (outcome && typeof outcome.then === 'function') await outcome.catch(() => {}); } catch { /* a throw is also a refusal */ }
    }
  }
  assert.equal(verifier.gate().open, false);
  assert.equal(loaded.context.SaagarEtpBridgeTrust.keys.length, 0);
  assert.equal((await verifier.verify(byId['valid-day'].bytes, { ...OPTIONS, trustedKeys: [set.anchor], crypto: webcrypto })).code, GATE_CLOSED);
  assert.equal('create' in verifier, false);
  assert.equal(Object.keys(verifier).some((name) => /factory|create|trust|key|crypto/i.test(name) && name !== 'GATE_ID'), false);
  assert.equal(typeof verifierApi.create, 'function', 'the factory exists only on the CommonJS export');
});

test('nothing from storage, the address, messages or the page can add a key or even be read (T02, T04)', async () => {
  const touched = [];
  const trap = (name) => new Proxy({}, { get(_target, key) { touched.push(`${name}.${String(key)}`); throw new Error(`${name} must not be read`); }, set() { touched.push(`${name} set`); throw new Error('no'); }, has() { touched.push(`${name} has`); return true; } });
  const names = ['localStorage', 'sessionStorage', 'location', 'document', 'indexedDB', 'postMessage', 'addEventListener', 'window', 'navigator', 'Capacitor', 'SaagarOwnerSession', 'SaagarReauth'];
  const loaded = loadBridge({ sandbox: Object.fromEntries(names.map((name) => [name, trap(name)])) });
  const verifier = loaded.context.SaagarEtpBridgePackVerifier;
  assert.equal((await verifier.verify(byId['valid-day'].bytes, OPTIONS)).code, GATE_CLOSED);
  const withKey = loadBridge({ edit: withKeys([set.anchor]), sandbox: Object.fromEntries(names.map((name) => [name, trap(name)])) });
  assert.equal((await withKey.context.SaagarEtpBridgePackVerifier.verify(byId['valid-day'].bytes, OPTIONS)).ok, true);
  assert.deepEqual(touched, []);
  const embedded = await buildPack({ keyPair: set.keys.trusted, hooks: { manifest: (d) => { d.manifest.publicKeyHex = set.anchor.publicKeyHex.slice(0, 100); d.manifest.trustedKeys = [set.anchor.keyId]; } } });
  assert.equal((await verifier.verify(embedded, OPTIONS)).code, GATE_CLOSED);
  assert.equal((await withKey.context.SaagarEtpBridgePackVerifier.verify(embedded, OPTIONS)).code, 'ETP_BRIDGE_SCHEMA_INVALID', 'a key inside a pack is just an unexpected member');
});

test('the browser files carry none of the banned tokens, not even in comments (T22, T26)', () => {
  for (const file of FILES) {
    const source = readWww(file);
    for (const pattern of BANNED_BROWSER_TOKENS) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
    assert.equal(source.includes('\r'), false, `${file} has LF endings`);
    assert.equal(source.charCodeAt(0) === 0xFEFF, false, `${file} has no BOM`);
    assert.match(source, /^\/\*/);
  }
  const verifierSource = readWww('etp-bridge-pack-verifier.js');
  assert.deepEqual(verifierSource.match(/Object\.defineProperty\(root,/g), ['Object.defineProperty(root,']);
  assert.equal(/\broot\.[A-Za-z_]+\s*=[^=]/.test(verifierSource), false, 'nothing is assigned onto the global');
  assert.equal(/\bwindow\b|\bself\b|\bdocument\b/.test(verifierSource), false);
  const createBody = verifierSource.slice(verifierSource.indexOf('function create(options)'), verifierSource.indexOf('async function keyIdOf'));
  assert.equal((verifierSource.match(/trustedKeys/g) || []).length, (createBody.match(/trustedKeys/g) || []).length, 'a trusted key list is read only inside the Node-only create()');
  assert.ok(createBody.includes('trustedKeys'));
  assert.equal((verifierSource.match(/module\.exports/g) || []).length, 2, 'only the CommonJS export');
  assert.equal(/root\.[A-Za-z]*Factory/.test(verifierSource), false);
  const trustSource = readWww('etp-bridge-trust.js');
  assert.equal(/authorizeAction|createForTest|\baudit\b|factory/i.test(trustSource), false);
  assert.equal(/04[0-9a-f]{128}/.test(trustSource), false, 'no public point in the shipped trust file');
  assert.equal((trustSource.match(/var KEYS = Object\.freeze\(\[\]\);/g) || []).length, 1);
});

test('no key material and no test vocabulary anywhere in the app tree or the build scripts (T04)', () => {
  const roots = [path.join(repoRoot, 'www'), path.join(repoRoot, 'build-overrides')];
  const files = roots.flatMap((dir) => walkFiles(dir, textFile));
  for (const name of fs.readdirSync(path.join(repoRoot, 'scripts'))) if (/^build-/.test(name)) files.push(path.join(repoRoot, 'scripts', name));
  const generated = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'public');
  files.push(...walkFiles(generated, textFile));
  assert.ok(files.length > 100, 'the scan covers the app tree');
  const patterns = [
    [/setTrust|addTrust|injectTrust|trustProvider|createForTest|__testKey|\btestKey\b|testTrust|testAnchor/, 'test vocabulary'],
    [/04[0-9a-f]{128}/i, 'a 65 byte public point as hex'],
    [/\bBA[A-Za-z0-9+\/_-]{86}={0,2}(?![A-Za-z0-9+\/_-])/, 'a 65 byte public point as base64'],
    [/MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/, 'a P-256 public key DER prefix'],
    [/["']?crv["']?\s*:\s*["']P-256["']/, 'a P-256 JWK'],
    [new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----'), 'a private key block']
  ];
  const identifiers = [set.anchor.keyId, set.otherAnchor.keyId, set.anchor.publicKeyHex, set.otherAnchor.publicKeyHex];
  for (const file of files) {
    const text = fs.readFileSync(file, 'latin1');
    for (const [pattern, label] of patterns) {
      if (pattern.test(text)) assert.fail(`${path.relative(repoRoot, file)} contains ${label}`);
    }
    for (const id of identifiers) assert.equal(text.includes(id), false, `${path.relative(repoRoot, file)} names this run's test key`);
  }
});

test('the seeded build and the build overrides know nothing of the bridge, and the app ships only www (T04)', () => {
  const files = [...walkFiles(path.join(repoRoot, 'build-overrides'), textFile), path.join(repoRoot, 'scripts', 'build-seeded-apk.mjs'), path.join(repoRoot, 'scripts', 'build-production-release.ps1')];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /etp-bridge|EtpBridge|SCC_ETP_BRIDGE|GATE-ETP-BRIDGE|\.scc-etp/i, path.relative(repoRoot, file));
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(repoRoot, 'capacitor.config.json'), 'utf8')).webDir, 'www');
});

test('the contract constants in the verifier match the format document', () => {
  const doc = fs.readFileSync(path.join(repoRoot, 'docs', 'ETP-BRIDGE-PACK-FORMAT-V1.md'), 'utf8');
  assert.match(doc, /SCC_ETP_BRIDGE_V1/);
  assert.match(doc, /GATE-ETP-BRIDGE-TRUST/);
  for (const code of verifierApi.CODES) assert.ok(doc.includes(code), `${code} is documented`);
  assert.doesNotMatch(doc, /04[0-9a-f]{128}/i, 'the document holds no public point');
  assert.doesNotMatch(doc, /-----BEGIN/, 'the document holds no key block');
  assert.equal(doc.includes(set.anchor.keyId), false);
  for (const [name, value] of [['file bytes', verifierApi.LIMITS.FILE_BYTES], ['manifest bytes', verifierApi.LIMITS.MANIFEST_BYTES], ['rows', verifierApi.LIMITS.ROWS_PER_REPORT], ['line bytes', verifierApi.LIMITS.LINE_BYTES]]) {
    assert.ok(doc.includes(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || doc.includes(String(value)), `${name} ${value} is documented`);
  }
});
