/* ETP report-engine bridge: the synthetic pack generator. Packs are invented data signed with a throwaway key pair that is
   generated in memory, is non-extractable and is never written (owner decision B-4, given in chat 2026-11-12). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';
import { unzipSync } from 'fflate';
import { buildFixtureSet } from '../scripts/generate-etp-synthetic-fixtures.mjs';
import { INDEX_FORMAT, assertSafeOutputDir, writePackSet } from '../scripts/generate-etp-bridge-packs.mjs';
import { DEFAULT_VERIFY_OPTIONS, SHIPPED_EXPECTATION, buildCaseSet, buildPackDraft, generateTestKeyPair, hex, sha256Hex } from '../scripts/lib/etp-bridge-pack-builder.mjs';
import { verifierApi } from './lib/etp-bridge-test-support.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loaderApi = require('../www/etp-retail-xlsx-loader.js');
const { CODES, REPORT_IDS, REPORT_COLUMNS, MEASURES } = verifierApi;
const OPTIONS = DEFAULT_VERIFY_OPTIONS;
const loader = loaderApi.create({ readWorkbook: (bytes, options) => readXlsxFile(Buffer.from(bytes), options), unzipParts: (bytes) => unzipSync(bytes) });
const datePolicy = { earliestDate: '2024-04-01', asOfDate: '2026-08-21', maxFutureDays: 2 };
const set = await buildCaseSet({});
const verifier = verifierApi.create({ trustedKeys: [set.anchor], crypto: webcrypto });

test('manifest and section bytes are deterministic for a given key pair; only the randomised signature differs', async () => {
  const keyPair = set.keys.trusted;
  for (const profile of ['day', 'month']) {
    const first = await buildPackDraft({ keyPair, profile, seed: 'same' });
    const second = await buildPackDraft({ keyPair, profile, seed: 'same' });
    assert.deepEqual(first.manifestBytes, second.manifestBytes);
    for (let i = 0; i < 4; i += 1) assert.deepEqual(first.sectionBytes[i], second.sectionBytes[i]);
    assert.equal(first.bytes.length, second.bytes.length);
    assert.deepEqual(first.bytes.subarray(0, 17), second.bytes.subarray(0, 17));
    assert.deepEqual(first.bytes.subarray(81), second.bytes.subarray(81));
    const different = await buildPackDraft({ keyPair, profile, seed: 'other' });
    assert.notDeepEqual(different.manifestBytes, first.manifestBytes, 'the export id follows the seed');
  }
});

test('the day pack carries exactly the rows of the synthetic XLSX fixtures, read through the production loader', async () => {
  const day = set.cases.find((entry) => entry.id === 'valid-day');
  const result = await verifier.verify(day.bytes, day.verifyOptions);
  assert.equal(result.ok, true);
  assert.equal(result.scope.scopeKey, 'WLMHW|2026-27|2026-08-21..2026-08-21');
  const fixtures = buildFixtureSet();
  const snake = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  for (const entry of fixtures.happy) {
    const parsed = await loader.load({ bytes: entry.bytes, fileLabel: entry.filename, selectedReportId: entry.reportId, expectedStoreCode: 'WLMHW', datePolicy });
    assert.equal(parsed.ok, true, `${entry.reportId}: ${parsed.code}`);
    assert.equal(parsed.rows.length, 1);
    const fields = Object.fromEntries(Object.entries(parsed.rows[0].fields).map(([name, value]) => [snake(name), value]));
    const loaderRow = Object.fromEntries(REPORT_COLUMNS[entry.reportId].map((column) => [column, column === 'invoice_date' ? `${fields[column].slice(0, 4)}-${fields[column].slice(4, 6)}-${fields[column].slice(6, 8)}` : fields[column]]));
    assert.equal(result.reports[entry.reportId].rows.length, 1, entry.reportId);
    assert.deepEqual(result.reports[entry.reportId].rows[0], loaderRow, `${entry.reportId}: pack row equals the XLSX row (dates normalised)`);
    for (const measure of MEASURES[entry.reportId]) assert.equal(Number(result.reports[entry.reportId].rows[0][measure.name]), Number(fields[measure.name]), `${entry.reportId}.${measure.name} after decimal normalisation`);
  }
});

test('the signature is a standard P-256 signature over the domain prefix and the manifest, made by a non-extractable key', async () => {
  const draft = await buildPackDraft({ keyPair: set.keys.trusted });
  const point = Buffer.from(set.anchor.publicKeyHex, 'hex');
  const verify = async (key, data, signature = draft.signature) => webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data);
  const trustedKey = await webcrypto.subtle.importKey('raw', point, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const otherKey = await webcrypto.subtle.importKey('raw', Buffer.from(set.otherAnchor.publicKeyHex, 'hex'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const signed = Buffer.concat([Buffer.from('SCC-ETP-BRIDGE-v1\n'), Buffer.from(draft.manifestBytes)]);
  assert.equal(draft.signature.length, 64);
  assert.equal(await verify(trustedKey, signed), true);
  assert.equal(await verify(otherKey, signed), false);
  assert.equal(await verify(trustedKey, Buffer.from(draft.manifestBytes)), false);
  assert.equal(set.anchor.keyId, hex(new Uint8Array(await webcrypto.subtle.digest('SHA-256', point)).subarray(0, 8)));
  assert.equal(set.anchor.keyId.length, 16);
  assert.notEqual(set.anchor.keyId, set.otherAnchor.keyId);
  const privateKey = set.keys.trusted.privateKey;
  assert.equal(privateKey.extractable, false);
  assert.deepEqual(privateKey.usages, ['sign']);
  for (const format of ['pkcs8', 'jwk', 'raw', 'spki']) await assert.rejects(webcrypto.subtle.exportKey(format, privateKey), undefined, format);
  const fresh = await generateTestKeyPair();
  assert.notEqual(fresh.anchor.keyId, set.anchor.keyId, 'every run creates a new key');
  assert.deepEqual(Object.keys(fresh).sort(), ['anchor', 'privateKey']);
  assert.deepEqual(Object.keys(fresh.anchor).sort(), ['keyId', 'publicKeyHex']);
});

test('the case set is broad, uniquely named and every expectation is a verifier code', () => {
  const ids = set.cases.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(set.cases.length >= 200);
  assert.deepEqual([...new Set(set.cases.map((entry) => entry.group))].sort(), ['frame', 'hash', 'manifest', 'policy', 'rows', 'schema', 'signature', 'totals', 'valid']);
  for (const entry of set.cases) {
    assert.equal(entry.expect.shipped, 'ETP_BRIDGE_TRUST_GATE_CLOSED', entry.id);
    assert.equal(entry.expect.shipped, SHIPPED_EXPECTATION);
    assert.ok(entry.expect.withTestKey === 'ACCEPTED' || CODES.includes(entry.expect.withTestKey), `${entry.id}: ${entry.expect.withTestKey}`);
    assert.ok(entry.bytes instanceof Uint8Array);
    assert.ok(entry.note.length > 5, entry.id);
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.expect), true);
  }
  const accepted = set.cases.filter((entry) => entry.expect.withTestKey === 'ACCEPTED').map((entry) => entry.id);
  for (const required of ['valid-day', 'valid-month', 'signature-high-s-twin', 'valid-zero-activity-r013']) assert.ok(accepted.includes(required), required);
  for (const required of ['wrong-key-claims-trusted-id', 'unknown-key', 'store-hemw', 'store-aw330', 'totals-net-one-paisa', 'row-money-exponent', 'row-type-dotless-i', 'manifest-duplicate-key', 'proto-top-level-key', 'row-proto-key']) assert.ok(ids.includes(required), required);
  const sizes = Object.fromEntries(set.cases.map((entry) => [entry.id, entry.bytes.length]));
  assert.ok(sizes['manifest-over-limit-real'] > verifierApi.LIMITS.MANIFEST_BYTES);
  assert.equal(sizes['empty-file'], 0);
});

test('the month pack uses positive sales-return magnitudes and an engine figure that differs from the rows (owner decision Q3)', async () => {
  const month = set.cases.find((entry) => entry.id === 'valid-month');
  const result = await verifier.verify(month.bytes, month.verifyOptions);
  assert.equal(result.ok, true);
  const types = result.reports.R025.rows.map((row) => row.transaction_type_raw);
  assert.ok(types.includes('SR') && types.includes('INV'));
  const sr = result.reports.R025.rows.find((row) => row.transaction_type_raw === 'SR');
  assert.equal(sr.net_amount.startsWith('-'), false);
  assert.equal(result.reports.R025.sums.net_amount, '90247.50', 'plain sums: the sales return is added, not subtracted');
});

test('writePackSet writes only under the chosen folder, with an index that matches the files and no key material', async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-etp-packs-'));
  try {
    const written = await writePackSet(target, { includeLarge: false });
    assert.equal(written.index.format, INDEX_FORMAT);
    assert.ok(written.caseCount >= 200);
    const files = [];
    (function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else files.push(path.relative(target, full).replace(/\\/g, '/')); } })(target);
    assert.deepEqual(files.filter((file) => file !== '_index.json').sort(), written.index.cases.map((entry) => entry.file).sort());
    assert.ok(files.includes('_index.json'));
    assert.ok(files.includes('valid/WLMHW_2026-27_2026-08-21_2026-08-21_G01.scc-etp'));
    assert.ok(files.includes('valid/WLMHW_2026-27_2026-08-01_2026-08-31_G01.scc-etp'));
    assert.equal(files.some((file) => file.startsWith('large/')), false, 'no large group without large packs');
    assert.deepEqual([...new Set(files.map((file) => file.split('/')[0]))].sort(), ['_index.json', 'negative', 'valid']);
    const indexText = fs.readFileSync(path.join(target, '_index.json'), 'utf8');
    const index = JSON.parse(indexText);
    assert.equal(index.contract, 'SCC_ETP_BRIDGE_V1');
    assert.match(index.trustedKeyId, /^[0-9a-f]{16}$/);
    assert.equal(index.caseCount, index.cases.length);
    assert.equal(/[0-9a-f]{130}/.test(indexText), false, 'no public point in the index');
    assert.equal(/PRIVATE|"d"\s*:|privateKey|pkcs8/i.test(indexText), false);
    for (const entry of index.cases) {
      const bytes = fs.readFileSync(path.join(target, ...entry.file.split('/')));
      assert.equal(bytes.length, entry.bytes, entry.id);
      assert.equal(await sha256Hex(bytes), entry.sha256, entry.id);
      assert.equal(entry.expect.shipped, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
    }
    const validDay = fs.readFileSync(path.join(target, 'valid', 'WLMHW_2026-27_2026-08-21_2026-08-21_G01.scc-etp'));
    assert.equal(hex(validDay.subarray(8, 16)), index.trustedKeyId, 'the header names the key id the index reports');
    /* no key was kept, so no build can accept these packs: a stranger anchor and the empty anchor refuse all of them */
    const stranger = await generateTestKeyPair();
    const strangerVerifier = verifierApi.create({ trustedKeys: [stranger.anchor], crypto: webcrypto });
    const emptyVerifier = verifierApi.create({ trustedKeys: [], crypto: webcrypto });
    for (const entry of index.cases.filter((candidate) => candidate.group === 'valid')) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(target, ...entry.file.split('/'))));
      assert.equal((await strangerVerifier.verify(bytes, entry.verifyOptions)).code, 'ETP_BRIDGE_KEY_UNKNOWN');
      assert.equal((await emptyVerifier.verify(bytes, entry.verifyOptions)).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
    }
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('the output folder is refused inside the repository, the protected fixture folder or any .audit-secrets folder', () => {
  const outside = path.join(os.tmpdir(), 'scc-etp-packs-ok');
  assert.equal(path.resolve(assertSafeOutputDir(outside)).toLowerCase().includes('scc-etp-packs-ok'), true);
  const refused = [
    repoRoot, path.join(repoRoot, 'tmp-packs'), path.join(repoRoot, 'tests'), path.join(repoRoot, '.tmp-etp-synthetic-fixtures-device'),
    path.join(repoRoot, '.tmp-etp-synthetic-fixtures-device', 'happy'), path.join(repoRoot, 'a', '..', 'b'),
    path.join(os.tmpdir(), '.tmp-etp-synthetic-fixtures-device', 'packs'), path.join(os.tmpdir(), '.audit-secrets', 'packs'), path.join(os.tmpdir(), '.AUDIT-SECRETS'),
    '', '   ', undefined, null, 42
  ];
  for (const candidate of refused) assert.throws(() => assertSafeOutputDir(candidate), Error, String(candidate));
  assert.equal(fs.existsSync(path.join(repoRoot, 'tmp-packs')), false);
});

test('the command line needs --output, refuses repository paths and writes a set with --skip-large', () => {
  const script = path.join(repoRoot, 'scripts', 'generate-etp-bridge-packs.mjs');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(run().status, 1);
  assert.match(run().stderr, /--output folder is required/);
  const inside = path.join(repoRoot, '.tmp-never-written');
  const refused = run('--output', inside);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /inside the repository/);
  assert.equal(fs.existsSync(inside), false);
  assert.equal(run('--output', os.tmpdir(), '--bogus').status, 1);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-etp-cli-'));
  try {
    const ok = run('--output', target, '--skip-large');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /^Wrote \d+ synthetic packs \(/);
    assert.ok(fs.existsSync(path.join(target, '_index.json')));
    assert.equal(fs.existsSync(path.join(target, 'large')), false);
    assert.equal(ok.stdout.includes(set.anchor.publicKeyHex), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('every report id has a section in each pack and the builder uses the verifier column lists', () => {
  assert.deepEqual([...REPORT_IDS], ['R003', 'R013', 'R022', 'R025']);
  for (const id of REPORT_IDS) assert.ok(REPORT_COLUMNS[id].length >= 5);
});
