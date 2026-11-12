import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapperFile = path.join(repo, 'scripts', 'release-owner.ps1');
const guardsFile = path.join(repo, 'scripts', 'lib', 'release-owner-guards.ps1');
const wrapper = fs.readFileSync(wrapperFile, 'utf8');
const guards = fs.readFileSync(guardsFile, 'utf8');
const MARKER = '# --- DRYRUN BRANCH ---';
// Executable text without the leading comment-based help block and without whole-line comments.
const code = (text) => text.replace(/<#[\s\S]*?#>/, '').split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
const wrapperCode = code(wrapper);
const releasePart = code(wrapper.slice(0, wrapper.indexOf(MARKER)));
const dryRunPart = code(wrapper.slice(wrapper.indexOf(MARKER)));

test('the owner script is not a build script, is LF text, and exists with its helper', () => {
  assert.ok(!/^build-/.test(path.basename(wrapperFile)));
  for (const text of [wrapper, guards]) {
    assert.equal(text.includes('\r'), false);
    assert.equal(text.charCodeAt(0) === 0xFEFF, false);
  }
  assert.match(wrapper, /^#requires -Version 7\.0/);
  assert.ok(wrapper.includes(MARKER), 'the dry-run marker comment exists exactly where the test splits the file');
  assert.equal(wrapper.split(MARKER).length, 2);
});

test('parameter sets: keystore path and alias are mandatory for Release; a dry run cannot take a key; no password parameter exists', () => {
  assert.match(wrapper, /DefaultParameterSetName = 'Release'/);
  assert.match(wrapper, /\[Parameter\(ParameterSetName = 'Release', Mandatory = \$true\)\]\[string\]\$KeystorePath/);
  assert.match(wrapper, /\[Parameter\(ParameterSetName = 'Release', Mandatory = \$true\)\]\[ValidatePattern\('\^\[A-Za-z0-9\._-\]\{1,64\}\$'\)\]\[string\]\$KeyAlias/);
  assert.match(wrapper, /\[Parameter\(ParameterSetName = 'DryRun', Mandatory = \$true\)\]\[switch\]\$DryRun/);
  assert.match(wrapper, /\[Parameter\(ParameterSetName = 'Release'\)\]\[switch\]\$ShowCertificateOnly/);
  const paramBlock = wrapper.slice(wrapper.indexOf('param('), wrapper.indexOf('Set-StrictMode'));
  assert.doesNotMatch(paramBlock, /Pass(?:word|phrase)|StorePass|KeyPass|Secret/i);
  assert.match(paramBlock, /\$TrustCeremonyCompleted/);
  assert.doesNotMatch(wrapper, /BridgeCeremony/);
  assert.match(wrapper, /SAAGAR_TRUST_CEREMONY_DONE/);
});

test('passwords: only hidden prompts, only into the process environment, never a file, argument or log line', () => {
  const readHosts = wrapperCode.split('\n').filter((line) => /Read-Host/.test(line));
  assert.ok(readHosts.length >= 2);
  for (const line of readHosts) assert.ok(/-AsSecureString/.test(line) || /first 8 characters of the commit/.test(line), `unexpected prompt: ${line.trim()}`);
  assert.match(wrapperCode, /SAAGAR_KEYSTORE_PASSWORD'/);
  assert.match(wrapperCode, /Read-SecretToEnvironment -Prompt 'Keystore password/);
  assert.match(wrapperCode, /Read-SecretToEnvironment -Prompt 'Key password/);
  assert.match(wrapperCode, /ZeroFreeBSTR/);
  assert.match(wrapperCode, /-storepass:env SAAGAR_KEYSTORE_PASSWORD/);
  assert.doesNotMatch(wrapperCode + guards, /ConvertFrom-SecureString|Start-Transcript|key\.properties|ProtectedData|-storepass\s+\S|storepass:file|-keypass|-srcstorepass/i);
  for (const line of (wrapperCode + '\n' + code(guards)).split('\n').filter((entry) => /assword|\$plain|\$secure/i.test(entry))) {
    assert.doesNotMatch(line, /Write-(?:Output|Host|Warning|Error|Verbose|Debug|Information)|Out-File|Set-Content|Add-Content|Export-|Tee-Object|Out-String/, `password handling line writes output: ${line.trim()}`);
  }
  assert.doesNotMatch(wrapperCode, /Set-Content|Add-Content|Out-File|Export-Clixml|\[IO\.File\]::Write/);
});

test('the interactive refusal covers the Release set only and runs before any keystore path is touched', () => {
  assert.match(wrapper, /\[Console\]::IsInputRedirected/);
  assert.match(wrapper, /\[Environment\]::UserInteractive/);
  const gate = wrapperCode.indexOf('IsInputRedirected');
  assert.ok(gate > 0);
  assert.match(wrapperCode.slice(gate - 80, gate), /if \(\$isRelease\)|\$isRelease\) \{\s*\n\s*if \(/);
  assert.ok(gate < wrapperCode.indexOf('IsPathRooted($KeystorePath)'), 'the console check precedes every use of the keystore path');
  assert.ok(gate < wrapperCode.indexOf('Get-KeystoreLocationProblem'));
  assert.equal(dryRunPart.includes('IsInputRedirected'), false, 'a dry run works without a console');
  assert.doesNotMatch(dryRunPart, /Read-Host/);
});

test('keystore guards: absolute, outside the repository, the build folder, the output folder and every git work tree', () => {
  assert.match(wrapper, /Get-KeystoreLocationProblem/);
  assert.match(guards, /Release blocked: the keystore must be outside the repository/);
  assert.match(guards, /rev-parse --is-inside-work-tree/);
  assert.match(guards, /ResolveLinkTarget\(\$true\)/);
  const guardUse = wrapperCode.indexOf('Get-KeystoreLocationProblem');
  assert.ok(guardUse > 0 && guardUse < wrapperCode.indexOf('Read-SecretToEnvironment -Prompt'), 'the location guard runs before the first password prompt');
  assert.match(wrapper, /\.jks.*\.keystore.*\.p12.*\.pfx/);
});

test('the script builds only via the audited recipe and the verifier, from a clean clone, and never touches the source repository history', () => {
  assert.match(releasePart, /build-production-release\.ps1/);
  assert.match(wrapperCode, /verify-release-apk\.mjs/);
  assert.match(releasePart, /--mode', 'release'/);
  assert.match(wrapperCode, /'--detach', \$sha/);
  assert.match(wrapperCode, /status --porcelain --untracked-files=all/);
  assert.doesNotMatch(wrapperCode, /'(?:commit|push|tag|fetch|pull|merge|reset|stash|rebase|switch|restore|add|init|worktree|clean|gc)'/);
  for (const match of wrapperCode.matchAll(/'checkout'/g)) assert.match(wrapperCode.slice(Math.max(0, match.index - 40), match.index), /'-C', \$BuildDirectory, $/, 'checkout only inside the build clone');
  assert.doesNotMatch(wrapperCode, /Remove-Item(?![^\n]*Env:)/, 'the only deletions are environment variables');
  assert.doesNotMatch(wrapperCode, /ExecutionPolicy|Bypass/, 'policy bypass is the owner command line, not the script body');
  assert.doesNotMatch(wrapperCode + guards, /bundleRelease|\.aab\b/i, 'no AAB');
  assert.doesNotMatch(wrapper + guards, /bridge/i, 'the owner script names the trust ceremony only');
});

test('a dry run never signs, never builds a release, never asks for a secret and refuses leaked credentials', () => {
  assert.doesNotMatch(dryRunPart, /assembleRelease|build-production-release|keytool|storepass|--mode', 'release|-AsSecureString/);
  assert.match(dryRunPart, /assembleDebug/);
  assert.match(dryRunPart, /--mode', 'dry-run'/);
  assert.match(dryRunPart, /Dry run blocked: \$name is set in this shell/);
  assert.doesNotMatch(releasePart, /assembleDebug/);
  assert.match(releasePart, /\$ShowCertificateOnly/);
});

test('every signing variable is cleared in a finally block', () => {
  for (const name of ['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD', 'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD']) assert.ok(wrapper.includes(name), name);
  assert.match(wrapper, /finally \{\s*\n\s*Clear-SigningEnvironment/);
  assert.match(wrapper, /SetEnvironmentVariable\(\$name, \$null, \[EnvironmentVariableTarget\]::Process\)/);
});

test('the recipe is unchanged in contract: env only, no prompts', () => {
  const recipe = fs.readFileSync(path.join(repo, 'scripts', 'build-production-release.ps1'), 'utf8');
  assert.doesNotMatch(recipe, /Read-Host/);
  assert.match(recipe, /the keystore must be outside the repository/);
});

// ---- behaviour of the pure helpers, run in a real PowerShell 7 when it is available ----
const pwsh = (() => {
  const probe = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
  return probe.status === 0 && Number(probe.stdout.trim()) >= 7 ? 'pwsh' : null;
})();

function runHelpers(expressions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-owner-guards-'));
  try {
    const harness = path.join(dir, 'harness.ps1');
    const body = [
      "$ErrorActionPreference = 'Stop'; Set-StrictMode -Version Latest",
      `. '${guardsFile.replace(/'/g, "''")}'`,
      '$results = @()',
      ...expressions.map((expression) => `$results += ,@(${expression})`),
      'ConvertTo-Json -InputObject $results -Compress -Depth 6'
    ].join('\n');
    fs.writeFileSync(harness, body);
    const run = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', harness], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    const parsed = JSON.parse(run.stdout);
    return parsed;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

test('Test-PathInside compares whole path segments, ignoring case and trailing slashes', { skip: !pwsh && 'PowerShell 7 not available' }, () => {
  const out = runHelpers([
    `Test-PathInside -Path 'C:\\a\\b\\c.jks' -Parent 'C:\\a\\b'`,
    `Test-PathInside -Path 'c:\\A\\B\\' -Parent 'C:\\a\\b'`,
    `Test-PathInside -Path 'C:\\a\\bc\\k.jks' -Parent 'C:\\a\\b'`,
    `Test-PathInside -Path 'C:\\a\\b\\..\\x\\k.jks' -Parent 'C:\\a\\b'`,
    `Test-PathInside -Path 'D:\\a\\b\\k.jks' -Parent 'C:\\a\\b'`
  ]);
  assert.deepEqual(out.map((entry) => entry[0] ?? entry), [true, true, false, false, false]);
});

test('Get-KeystoreLocationProblem refuses repo, build, output, other git work trees and junctions; accepts a plain folder', { skip: !pwsh && 'PowerShell 7 not available' }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-owner-loc-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const mk = (name) => { const dir = path.join(base, name); fs.mkdirSync(dir, { recursive: true }); return dir; };
  const fakeRepo = mk('repo');
  const buildDir = path.join(base, 'build-not-yet');
  const outDir = path.join(base, 'out-not-yet');
  const plain = mk('plain');
  const otherTree = mk('other-tree');
  const git = spawnSync('git', ['init', '--quiet', otherTree], { encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const nested = path.join(otherTree, 'deep');
  fs.mkdirSync(nested);
  const junctionHome = mk('junction-home');
  const junction = path.join(junctionHome, 'link');
  fs.symlinkSync(otherTree, junction, 'junction');
  const call = (keystore) => `Get-KeystoreLocationProblem -KeystorePath ${q(keystore)} -RepositoryRoot ${q(fakeRepo)} -BuildDirectory ${q(buildDir)} -OutputDirectory ${q(outDir)}`;
  const out = runHelpers([
    call(path.join(plain, 'upload.jks')),
    call(path.join(fakeRepo, 'upload.jks')),
    call(path.join(fakeRepo, 'sub', 'dir', 'upload.jks')),
    call(path.join(buildDir, 'upload.jks')),
    call(path.join(outDir, 'upload.jks')),
    call(path.join(otherTree, 'upload.jks')),
    call(path.join(nested, 'upload.jks')),
    call(path.join(junction, 'upload.jks')),
    call(path.join(base, 'no-such-folder', 'upload.jks')),
    call('relative\\upload.jks')
  ]).map((entry) => (Array.isArray(entry) ? entry[0] : entry));
  assert.equal(out[0] ?? null, null, 'a keystore in a plain folder outside every repository is accepted');
  assert.match(out[1], /outside the repository, the build folder and the output folder/);
  assert.match(out[2], /outside the repository/);
  assert.match(out[3], /outside the repository, the build folder/);
  assert.match(out[4], /outside the repository, the build folder/);
  assert.match(out[5], /inside a git repository/);
  assert.match(out[6], /inside a git repository/);
  assert.match(out[7], /inside a git repository/, 'a junction into a git work tree is refused');
  assert.match(out[8], /does not exist/);
  assert.match(out[9], /must be absolute/);
});

test('keytool listing parser and certificate floors (canned English output, fingerprints derived at run time)', { skip: !pwsh && 'PowerShell 7 not available' }, () => {
  const sha256 = crypto.createHash('sha256').update('canned-listing').digest('hex').toUpperCase().match(/../g).join(':');
  const sha1 = crypto.createHash('sha1').update('canned-listing').digest('hex').toUpperCase().match(/../g).join(':');
  const listing = (year, keyLine) => [
    'Alias name: upload', 'Creation date: Nov 12, 2026', 'Entry type: PrivateKeyEntry', 'Certificate chain length: 1', 'Certificate[1]:',
    'Owner: CN=Example Owner, O=Example, C=IN', 'Issuer: CN=Example Owner, O=Example, C=IN', 'Serial number: 1', `Valid from: Thu Nov 12 14:00:00 IST 2026 until: Mon Nov 05 14:00:00 IST ${year}`,
    'Certificate fingerprints:', `\t SHA1: ${sha1}`, `\t SHA256: ${sha256}`, 'Signature algorithm name: SHA256withRSA', `Subject Public Key Algorithm: ${keyLine}`, 'Version: 3'
  ].join('\n');
  const parse = (year, keyLine) => `ConvertFrom-KeytoolListing -Text ${q(listing(year, keyLine))}`;
  const problems = (year, keyLine, currentYear = 2026) => `Get-CertificateProblems -Certificate (${parse(year, keyLine)}) -CurrentYear ${currentYear}`;
  const results = runHelpers([
    parse(2051, '2048-bit RSA key'),
    problems(2051, '2048-bit RSA key'),
    problems(2051, '4096-bit RSA key'),
    problems(2046, '2048-bit RSA key'),
    problems(2030, '2048-bit RSA key'),
    problems(2051, '1024-bit RSA key'),
    problems(2051, '256-bit EC (secp256r1) key'),
    problems(2051, '3072-bit DSA key')
  ]).map((entry) => (Array.isArray(entry) ? entry[0] : entry));
  const [parsed, ok, ok4096, shortish, tooShort, weak, ec, odd] = results;
  assert.equal(parsed.Alias, 'upload');
  assert.equal(parsed.Owner, 'CN=Example Owner, O=Example, C=IN');
  assert.equal(parsed.ValidUntilYear, 2051);
  assert.equal(parsed.KeyBits, 2048);
  assert.equal(parsed.KeyAlgorithm, 'RSA');
  assert.equal(parsed.Sha256, sha256.replace(/:/g, ''));
  assert.equal(parsed.Sha1, sha1.replace(/:/g, ''));
  assert.deepEqual([ok.Errors, ok.Warnings], [[], []]);
  assert.deepEqual([ok4096.Errors, ok4096.Warnings], [[], []]);
  assert.deepEqual(shortish.Errors, []);
  assert.match(String(shortish.Warnings), /25 years/);
  assert.match(String(tooShort.Errors), /at least 10 years/);
  assert.match(String(weak.Errors), /only 1024 bits/);
  assert.deepEqual([ec.Errors, ec.Warnings], [[], []]);
  assert.match(String(odd.Errors), /DSA is not accepted/);
});
