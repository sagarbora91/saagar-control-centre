/* ETP report-engine bridge: no private key may ever exist on disk (owner decision B-4, given in chat 2026-11-12).
   The throwaway test key pair is created in memory, is non-extractable and is never written. The real signing key is created by the
   owner himself later. (The CLAUDE.md rule "do not create keys" concerns the APK signing key, not this in-memory test key.)
   The markers below are built from fragments so that this file does not match its own scan. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writePackSet } from '../scripts/generate-etp-bridge-packs.mjs';
import { buildCaseSet, buildLargePack, generateTestKeyPair } from '../scripts/lib/etp-bridge-pack-builder.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PEM_PRIVATE = new RegExp(`-----BEGIN ${'(?:[A-Z0-9]+ )*'}PRIVATE KEY-----`);
const PKCS8_EC = new RegExp(`${'MIGHAgEAMBMGByqGSM49'}${'AgEGCCqGSM49AwEHBG0wawIBAQQg'}`);
const PKCS8_ED = new RegExp(`${'MC4CAQAwBQYDK2Vw'}${'BCIEI'}`);
const JWK_KIND = /"kty"\s*:\s*"EC"/;
const JWK_PRIVATE = /"d"\s*:\s*"[A-Za-z0-9_-]{30,}"/;
const KEY_FILE_NAME = /\.(?:pem|p12|pfx|jks|keystore|p8|key|jwk)$/i;
const BINARY_NAME = /\.(?:png|jpe?g|gif|ico|webp|apk|aab|jar|zip|gz|xlsx|xls|pdf|woff2?|ttf|otf|wasm|bin|so|dex|class|mp3|mp4|webm|db|sqlite)$/i;
const SKIPPED_SEGMENTS = new Set(['node_modules', '.git', 'graphify-out', '.audit-secrets', '.gradle']);

function scanText(text) {
  const problems = [];
  if (PEM_PRIVATE.test(text)) problems.push('a private key block');
  if (PKCS8_EC.test(text) || PKCS8_ED.test(text)) problems.push('a PKCS8 private key');
  if (JWK_KIND.test(text) && JWK_PRIVATE.test(text)) problems.push('a private JWK');
  return problems;
}
function listRepoFiles() {
  const git = spawnSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (git.status === 0 && git.stdout) return git.stdout.split('\0').filter(Boolean);
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_SEGMENTS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full); else out.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
    }
  })(repoRoot);
  return out;
}
function scanFolder(folder) {
  const hits = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (KEY_FILE_NAME.test(entry.name)) hits.push(`${full}: key file name`);
      for (const problem of scanText(fs.readFileSync(full, 'latin1'))) hits.push(`${full}: ${problem}`);
    }
  })(folder);
  return hits;
}

test('no tracked or untracked file in the repository holds a private key, and none is named like a key file (T03)', () => {
  const files = listRepoFiles();
  assert.ok(files.length > 500, 'the scan covers the repository');
  const hits = [];
  for (const relative of files) {
    const segments = relative.split('/');
    if (segments.some((segment) => SKIPPED_SEGMENTS.has(segment))) continue;
    if (segments[0] === 'android' && segments.includes('build')) continue;
    if (KEY_FILE_NAME.test(relative)) hits.push(`${relative}: key file name`);
    if (BINARY_NAME.test(relative)) continue;
    const full = path.join(repoRoot, ...segments);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 12 * 1024 * 1024) continue;
    for (const problem of scanText(fs.readFileSync(full, 'latin1'))) hits.push(`${relative}: ${problem}`);
  }
  assert.deepEqual(hits, []);
});

test('the scan itself recognises the markers it looks for (so a clean result means something)', () => {
  assert.deepEqual(scanText(`-----BEGIN ${'PRIVATE KEY'}-----\nabc`), ['a private key block']);
  assert.deepEqual(scanText(`-----BEGIN ${'EC PRIVATE KEY'}-----`), ['a private key block']);
  assert.deepEqual(scanText(`-----BEGIN ${'ENCRYPTED PRIVATE KEY'}-----`), ['a private key block']);
  assert.deepEqual(scanText('{"kty":"EC","crv":"P-256","d":"' + 'A'.repeat(43) + '"}'), ['a private JWK']);
  assert.deepEqual(scanText('{"kty":"EC","crv":"P-256","x":"' + 'A'.repeat(43) + '","y":"' + 'B'.repeat(43) + '"}'), [], 'a public JWK is not a private key');
  assert.deepEqual(scanText(`MIGHAgEAMBMGByqGSM49${'AgEGCCqGSM49AwEHBG0wawIBAQQg'}xxxx`), ['a PKCS8 private key']);
  assert.deepEqual(scanText('-----BEGIN PUBLIC KEY-----'), []);
});

test('the builder and the command line never write a key: source rules and zero file-system writes while building (T03)', async () => {
  const builder = fs.readFileSync(path.join(repoRoot, 'scripts', 'lib', 'etp-bridge-pack-builder.mjs'), 'utf8');
  const script = fs.readFileSync(path.join(repoRoot, 'scripts', 'generate-etp-bridge-packs.mjs'), 'utf8');
  assert.doesNotMatch(builder, /from ['"](?:node:)?fs(?:\/promises)?['"]|require\(['"](?:node:)?fs/, 'the builder has no file-system import at all');
  assert.doesNotMatch(builder, /writeFile|appendFile|createWriteStream|mkdirSync|rmSync|renameSync/);
  assert.doesNotMatch(builder, /generateKeyPairSync|extractable:\s*true|exportKey\(\s*['"](?:pkcs8|jwk)['"]|\.export\(/);
  assert.match(builder, /generateKey\(\{ name: 'ECDSA', namedCurve: 'P-256' \}, false, \['sign', 'verify'\]\)/, 'the key pair is generated non-extractable');
  assert.equal((builder.match(/exportKey\(/g) || []).length, 1);
  assert.match(builder, /exportKey\('raw', pair\.publicKey\)/, 'only the raw public point is exported');
  assert.doesNotMatch(script, /privateKey|exportKey|pkcs8|\.keys\b|generateKey/);
  assert.equal((script.match(/writeFileSync\(/g) || []).length, 2);
  assert.match(script, /writeFileSync\(full, entry\.bytes\)/);
  assert.match(script, /writeFileSync\(path\.join\(target, '_index\.json'\)/);
  const calls = [];
  const names = ['writeFileSync', 'appendFileSync', 'writeSync', 'createWriteStream', 'mkdirSync', 'copyFileSync', 'renameSync', 'rmSync', 'openSync'];
  const originals = Object.fromEntries(names.map((name) => [name, fs[name]]));
  const promiseNames = ['writeFile', 'appendFile', 'mkdir', 'copyFile', 'rename', 'rm', 'open'];
  const promiseOriginals = Object.fromEntries(promiseNames.map((name) => [name, fs.promises[name]]));
  const consoleNames = ['log', 'info', 'warn', 'error', 'debug'];
  const consoleOriginals = Object.fromEntries(consoleNames.map((name) => [name, console[name]]));
  try {
    for (const name of names) fs[name] = (...args) => { calls.push(name); return originals[name](...args); };
    for (const name of promiseNames) fs.promises[name] = (...args) => { calls.push(`promises.${name}`); return promiseOriginals[name](...args); };
    for (const name of consoleNames) console[name] = () => { calls.push(`console.${name}`); };
    await buildCaseSet({});
    await buildLargePack(await generateTestKeyPair());
  } finally {
    for (const name of names) fs[name] = originals[name];
    for (const name of promiseNames) fs.promises[name] = promiseOriginals[name];
    for (const name of consoleNames) console[name] = consoleOriginals[name];
  }
  assert.deepEqual(calls, [], 'building packs touches neither the file system nor the console');
});

test('the throwaway private key cannot be exported in any format and only sign is allowed (T03, B-4)', async () => {
  const { privateKey, anchor } = await generateTestKeyPair();
  assert.equal(privateKey.extractable, false);
  assert.equal(privateKey.type, 'private');
  assert.deepEqual(privateKey.usages, ['sign']);
  for (const format of ['pkcs8', 'jwk', 'raw', 'spki']) await assert.rejects(webcrypto.subtle.exportKey(format, privateKey), undefined, format);
  assert.equal(JSON.stringify(anchor).includes('"d"'), false);
  assert.match(anchor.publicKeyHex, /^04[0-9a-f]{128}$/);
  assert.equal(typeof JSON.stringify(privateKey), 'string');
  assert.equal(JSON.stringify(privateKey), '{}', 'a CryptoKey has nothing a serializer could write');
  const sets = await buildCaseSet({});
  assert.equal(JSON.stringify(sets.anchor).includes('"d"'), false);
  assert.deepEqual(Object.keys(sets.anchor).sort(), ['keyId', 'publicKeyHex']);
});

test('the files the command line writes hold no key material of any kind (T03)', async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-etp-nokey-'));
  try {
    await writePackSet(target, { includeLarge: false });
    assert.deepEqual(scanFolder(target), []);
    const names = [];
    (function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (entry.isDirectory()) walk(path.join(dir, entry.name)); else names.push(entry.name); } })(target);
    assert.equal(names.some((name) => KEY_FILE_NAME.test(name)), false, 'no file is named like a key file');
    assert.equal(names.filter((name) => !name.endsWith('.scc-etp')).join(), '_index.json');
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
