// Release asset checks: pure functions over text, plus two thin directory walkers.
// Every check throws (node:assert) on failure so that callers can run them one by one and record each result.
// Used by scripts/verify-generated-android-release.mjs (synced web assets, before packaging) and scripts/verify-release-apk.mjs (final APK).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.txt', '.xml', '.svg', '.map']);
const KEY_FILE_EXTENSIONS = new Set(['.jks', '.keystore', '.p12', '.pfx', '.pem', '.key', '.p8', '.jwk', '.der']);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
// Private-key block marker, assembled from two pieces so that repository-wide scans of this source stay quiet.
const PRIVATE_KEY_BLOCK = new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----');
const TRUST_FILE = 'etp-bridge-trust.js';
const KEY_ID = /^[0-9a-f]{16}$/;
const POINT = /^04[0-9a-f]{128}$/;

export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out.map((full) => path.relative(dir, full).split(path.sep).join('/')).sort();
}

export function collectTextFiles(dir) {
  const files = [];
  for (const rel of listFiles(dir)) {
    if (!TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase())) continue;
    const full = path.join(dir, ...rel.split('/'));
    if (fs.statSync(full).size > MAX_TEXT_BYTES) continue;
    files.push({ rel, text: fs.readFileSync(full, 'utf8') });
  }
  return files;
}

// The production flag line must be `var DEMO_SEED_ENABLED = false;` exactly once, and the only line that may set it to true is the guarded test-harness hook
// (window.__FORCE_DEMO_SEED === true). Same rule as the audit check A9 (seedFindings); it also holds on the Babel-transformed text.
export function assertDemoSeedDisabled(indexHtml) {
  const source = String(indexHtml);
  const disabled = [...source.matchAll(/\bvar\s+DEMO_SEED_ENABLED\s*=\s*false\s*;/g)];
  assert.equal(disabled.length, 1, `index.html must declare var DEMO_SEED_ENABLED = false; exactly once (found ${disabled.length})`);
  for (const match of source.matchAll(/\b(?:var\s+)?DEMO_SEED_ENABLED\s*=\s*true\s*;/g)) {
    const before = source.slice(Math.max(0, match.index - 100), match.index);
    assert.ok(/__FORCE_DEMO_SEED\s*===\s*true[\s\S]{0,80}$/i.test(before), 'DEMO_SEED_ENABLED is set to true outside the guarded test-harness hook');
  }
  // Strict-boolean activation: only the real boolean true can start the seeder (Babel may drop the parentheses).
  assert.match(source, /__DEMO_SEED_ACTIVE\s*=\s*\(?\s*DEMO_SEED_ENABLED\s*===\s*true\s*\)?\s*;/, 'the strict-boolean seed activation line is missing');
}

// The demo route is build-only (scripts/build-seeded-apk.mjs). A production asset tree must not carry its file or any of its markers.
export function assertNoDemoWiring(files) {
  for (const { rel, text } of files) {
    assert.ok(!/etp-demo-operational\.js$/i.test(rel), `demo file present: ${rel}`);
    assert.ok(!/etp-demo-operational|SaagarEtpDemoOperational/.test(text), `demo wiring present in ${rel}`);
  }
}

export function assertNoKeyMaterial(files, relPaths = []) {
  for (const { rel, text } of files) {
    assert.ok(!PRIVATE_KEY_BLOCK.test(text), `private key block found in ${rel}`);
  }
  for (const rel of relPaths) {
    assert.ok(!KEY_FILE_EXTENSIONS.has(path.extname(rel).toLowerCase()), `key-like file shipped: ${rel}`);
  }
}

// Bridge trust anchor. The file is executed in a fresh vm context the way a browser page would run it (no module, no require), so it also works on the
// Babel-transformed and function-wrapped form that ships in the APK. Only a JSON string leaves the context. This is a release check of the owner's own build
// output, not a security boundary.
export function checkBridgeTrust(trustSourceText, { ceremonyDone = false } = {}) {
  const context = vm.createContext({});
  vm.runInContext(String(trustSourceText), context, { filename: TRUST_FILE, timeout: 2000 });
  const json = vm.runInContext(
    "(function () { var t = (typeof SaagarEtpBridgeTrust === 'object') ? SaagarEtpBridgeTrust : null; if (!t) return 'null'; var g = t.gate(); return JSON.stringify({ keys: t.keys, gate: g }); })()",
    context, { timeout: 2000 });
  assert.notEqual(json, 'null', 'the trust file did not define its trust object');
  const { keys, gate } = JSON.parse(json);
  assert.ok(Array.isArray(keys), 'trust object has no key list');
  if (!ceremonyDone) {
    assert.equal(keys.length, 0, 'the shipped trust list must be empty unless the owner key ceremony is declared complete');
    assert.equal(gate.state, 'CLOSED', 'the trust gate must be closed while the list is empty');
    assert.equal(gate.code, 'ETP_BRIDGE_TRUST_ANCHOR_ABSENT', 'the trust gate must report the absent anchor');
    return Object.freeze({ keyIds: [] });
  }
  assert.ok(keys.length >= 1 && keys.length <= 2, `ceremony declared complete, so 1 or 2 trusted keys are required (found ${keys.length})`);
  const seen = new Set();
  for (const entry of keys) {
    assert.deepEqual(Object.keys(entry).sort(), ['keyId', 'publicKeyHex'], 'a trust entry has exactly keyId and publicKeyHex');
    assert.match(entry.keyId, KEY_ID, 'trust entry keyId is 16 lowercase hex characters');
    assert.match(entry.publicKeyHex, POINT, 'trust entry publicKeyHex is an uncompressed P-256 point');
    assert.ok(!seen.has(entry.keyId), 'duplicate trust key id');
    seen.add(entry.keyId);
  }
  assert.equal(gate.state, 'OPEN', 'the trust gate must be open when valid keys are listed');
  return Object.freeze({ keyIds: keys.map((entry) => entry.keyId) });
}

// Locates the single trust file by name (never by path, so a move of the file does not blind the check).
export function findSingle(relPaths, fileName) {
  const hits = relPaths.filter((rel) => rel === fileName || rel.endsWith('/' + fileName));
  assert.equal(hits.length, 1, `exactly one ${fileName} is required under the asset tree (found ${hits.length})`);
  return hits[0];
}

// Runs every asset check over an asset directory (synced www, or assets/public of an extracted APK). Returns facts for the release record.
export function verifyPublicAssets(publicDir, { ceremonyDone = false } = {}) {
  assert.ok(fs.existsSync(publicDir), `asset tree not found: ${publicDir}`);
  const relPaths = listFiles(publicDir);
  const files = collectTextFiles(publicDir);
  const index = files.find((file) => file.rel === 'index.html');
  assert.ok(index, 'index.html missing from the asset tree');
  assertDemoSeedDisabled(index.text);
  assertNoDemoWiring(files);
  assertNoKeyMaterial(files, relPaths);
  const trustRel = findSingle(relPaths, TRUST_FILE);
  const trust = checkBridgeTrust(files.find((file) => file.rel === trustRel).text, { ceremonyDone });
  return Object.freeze({ fileCount: relPaths.length, textFileCount: files.length, demoSeedEnabled: false, demoWiringPresent: false, bridgeTrust: Object.freeze({ ceremonyDone, keyIds: trust.keyIds }) });
}
