import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertDemoSeedDisabled, assertNoDemoWiring, assertNoKeyMaterial, checkBridgeTrust, collectTextFiles, findSingle, verifyPublicAssets
} from '../scripts/lib/release-asset-checks.mjs';
import { transformHtml, transformJavaScriptAsset } from '../scripts/prepare-api23-assets.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(repo, 'www');
const readWww = (name) => fs.readFileSync(path.join(www, name), 'utf8');
const KEYS_LINE = 'var KEYS = Object.freeze([]);';

// Test keys are assembled at run time and only ever live in memory: no public point and no key id is written into the repository.
const fakeKey = (id) => ({ keyId: id.repeat(16).slice(0, 16), publicKeyHex: '04' + 'ab'.repeat(64) });
function trustWith(entries) {
  const source = readWww('etp-bridge-trust.js');
  assert.ok(source.includes(KEYS_LINE));
  return source.replace(KEYS_LINE, () => `var KEYS = Object.freeze([${entries.map((entry) => `Object.freeze(${JSON.stringify(entry)})`).join(', ')}]);`);
}
const shipped = (source) => transformJavaScriptAsset(source, 'x', 'etp-bridge-trust.js');

test('demo seed: the real production index.html passes, and so does its Babel-transformed form (the shipped bytes)', () => {
  const source = readWww('index.html');
  assert.doesNotThrow(() => assertDemoSeedDisabled(source));
  const transformed = transformHtml(source, 'index.html', new Map());
  assert.notEqual(transformed, source, 'the transform really ran');
  assert.doesNotThrow(() => assertDemoSeedDisabled(transformed));
});

test('demo seed: flag true, flag missing, a second declaration, an unguarded true line and a lost strict activation all fail', () => {
  const source = readWww('index.html');
  const flag = 'var DEMO_SEED_ENABLED = false;';
  assert.ok(source.includes(flag));
  assert.throws(() => assertDemoSeedDisabled(source.replace(flag, () => 'var DEMO_SEED_ENABLED = true;')));
  assert.throws(() => assertDemoSeedDisabled(source.replace(flag, () => 'var DEMO_SEED_ENABLED = window.x;')), /exactly once/);
  assert.throws(() => assertDemoSeedDisabled(source.replace(flag, () => `${flag}\n${flag}`)), /exactly once/);
  assert.throws(() => assertDemoSeedDisabled(source.replace(flag, () => `${flag}\n/* build step */ DEMO_SEED_ENABLED = true;`)), /outside the guarded/);
  assert.throws(() => assertDemoSeedDisabled(source.replace('__DEMO_SEED_ACTIVE = (DEMO_SEED_ENABLED === true)', () => '__DEMO_SEED_ACTIVE = !!DEMO_SEED_ENABLED')), /strict-boolean/);
});

test('demo wiring: the production tree has none; the demo file name and either marker fail', () => {
  assert.doesNotThrow(() => assertNoDemoWiring(collectTextFiles(www)));
  assert.throws(() => assertNoDemoWiring([{ rel: 'etp-demo-operational.js', text: '' }]), /demo file/);
  assert.throws(() => assertNoDemoWiring([{ rel: 'sub/etp-demo-operational.js', text: '' }]), /demo file/);
  assert.throws(() => assertNoDemoWiring([{ rel: 'index.html', text: '<script src="etp-demo-operational.js"></script>' }]), /demo wiring/);
  assert.throws(() => assertNoDemoWiring([{ rel: 'a.js', text: 'window.SaagarEtpDemoOperational = {};' }]), /demo wiring/);
  // The seeder itself ships behind the flag in production, so its names must not be treated as demo wiring.
  assert.doesNotThrow(() => assertNoDemoWiring([{ rel: 'index.html', text: 'window.__DEMO_SEED_ACTIVE = false; /* __saagar-demo-banner */' }]));
});

test('key material: a private key block or a key-like file name fails; ordinary text passes', () => {
  const block = '-----BEGIN ' + 'PRIVATE KEY-----';
  assert.throws(() => assertNoKeyMaterial([{ rel: 'a.txt', text: `x\n${block}\nMIIB` }]), /private key block/);
  assert.throws(() => assertNoKeyMaterial([{ rel: 'a.txt', text: '-----BEGIN ' + 'EC PRIVATE KEY-----' }]), /private key block/);
  assert.doesNotThrow(() => assertNoKeyMaterial([{ rel: 'a.txt', text: '-----BEGIN PUBLIC KEY----- is not private' }]));
  for (const name of ['release.jks', 'a/b/upload.keystore', 'x.p12', 'x.PFX', 'k.pem', 'k.key', 'AuthKey.p8']) {
    assert.throws(() => assertNoKeyMaterial([], [name]), /key-like file/, name);
  }
  assert.doesNotThrow(() => assertNoKeyMaterial([], ['index.html', 'etp-bridge-trust.js', 'shared/module-back.css']));
});

test('bridge trust: the real shipped file passes empty, in source form and in the wrapped form that ships (W3-4)', () => {
  const source = readWww('etp-bridge-trust.js');
  assert.deepEqual(checkBridgeTrust(source, { ceremonyDone: false }).keyIds, []);
  const wrapped = shipped(source);
  assert.match(wrapped, /^\(function \(\) \{\n/);
  assert.match(wrapped, /\}\)\.call\(this\);\n$/);
  assert.deepEqual(checkBridgeTrust(wrapped, { ceremonyDone: false }).keyIds, []);
});

test('bridge trust: without the ceremony flag any key fails; with it, one or two well-formed keys pass and only key ids are returned', () => {
  const one = [fakeKey('1')];
  const two = [fakeKey('1'), fakeKey('2')];
  for (const form of [(entries) => trustWith(entries), (entries) => shipped(trustWith(entries))]) {
    assert.throws(() => checkBridgeTrust(form(one), { ceremonyDone: false }), /empty/);
    assert.deepEqual(checkBridgeTrust(form(one), { ceremonyDone: true }).keyIds, [one[0].keyId]);
    assert.deepEqual(checkBridgeTrust(form(two), { ceremonyDone: true }).keyIds, [two[0].keyId, two[1].keyId]);
    assert.ok(!JSON.stringify(checkBridgeTrust(form(two), { ceremonyDone: true })).includes(two[0].publicKeyHex), 'the public point never leaves the check');
  }
});

test('bridge trust: the ceremony flag with no keys, too many keys, duplicates or malformed entries fail', () => {
  assert.throws(() => checkBridgeTrust(readWww('etp-bridge-trust.js'), { ceremonyDone: true }), /1 or 2 trusted keys/);
  assert.throws(() => checkBridgeTrust(trustWith([fakeKey('1'), fakeKey('2'), fakeKey('3')]), { ceremonyDone: true }));
  assert.throws(() => checkBridgeTrust(trustWith([fakeKey('1'), fakeKey('1')]), { ceremonyDone: true }));
  assert.throws(() => checkBridgeTrust(trustWith([{ keyId: 'xyz', publicKeyHex: '04' + 'ab'.repeat(64) }]), { ceremonyDone: true }));
  assert.throws(() => checkBridgeTrust(trustWith([{ keyId: fakeKey('1').keyId, publicKeyHex: '05' + 'ab'.repeat(64) }]), { ceremonyDone: true }));
  assert.throws(() => checkBridgeTrust(trustWith([{ ...fakeKey('1'), extra: 1 }]), { ceremonyDone: true }));
});

test('bridge trust: a file that defines nothing, or throws, fails closed', () => {
  assert.throws(() => checkBridgeTrust('var unrelated = 1;'), /did not define/);
  assert.throws(() => checkBridgeTrust('throw new Error("boom");'));
  assert.throws(() => checkBridgeTrust('while (true) {}'), /timed out/i);
});

test('trust file lookup is by name, exactly once', () => {
  assert.equal(findSingle(['index.html', 'a/etp-bridge-trust.js'], 'etp-bridge-trust.js'), 'a/etp-bridge-trust.js');
  assert.throws(() => findSingle(['index.html'], 'etp-bridge-trust.js'), /exactly one/);
  assert.throws(() => findSingle(['etp-bridge-trust.js', 'x/etp-bridge-trust.js'], 'etp-bridge-trust.js'), /exactly one/);
  assert.throws(() => findSingle(['not-etp-bridge-trust.js.bak'], 'etp-bridge-trust.js'), /exactly one/);
});

test('the whole production www tree passes every asset check, and a tampered copy of its pieces fails', (t) => {
  const facts = verifyPublicAssets(www);
  assert.equal(facts.demoSeedEnabled, false);
  assert.equal(facts.demoWiringPresent, false);
  assert.deepEqual(facts.bridgeTrust.keyIds, []);
  assert.ok(facts.fileCount > 100);
  // A small tree that mirrors only what the checks read, so no large copy is needed.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-asset-checks-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'index.html'), readWww('index.html'));
  fs.writeFileSync(path.join(dir, 'etp-bridge-trust.js'), readWww('etp-bridge-trust.js'));
  assert.doesNotThrow(() => verifyPublicAssets(dir));
  fs.writeFileSync(path.join(dir, 'etp-bridge-trust.js'), trustWith([fakeKey('1')]));
  assert.throws(() => verifyPublicAssets(dir), /empty/);
  assert.doesNotThrow(() => verifyPublicAssets(dir, { ceremonyDone: true }));
  fs.writeFileSync(path.join(dir, 'upload.jks'), 'not text');
  assert.throws(() => verifyPublicAssets(dir, { ceremonyDone: true }), /key-like file/);
  fs.rmSync(path.join(dir, 'upload.jks'));
  fs.writeFileSync(path.join(dir, 'etp-demo-operational.js'), '');
  assert.throws(() => verifyPublicAssets(dir, { ceremonyDone: true }), /demo file/);
  assert.throws(() => verifyPublicAssets(path.join(dir, 'missing')), /not found/);
});
