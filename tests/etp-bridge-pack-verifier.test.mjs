/* ETP report-engine bridge: pack verifier. Every check has a passing and a refusing case; every synthetic negative pack is
   refused with its exact code. Packs are signed with a throwaway key pair that exists only in memory while this runs
   (non-extractable, never written; owner decision B-4). The verifier is reached through its Node-only create() factory. */
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto, { webcrypto } from 'node:crypto';
import { buildCaseSet, buildPack, generateTestKeyPair, highSTwin, DEFAULT_VERIFY_OPTIONS, hex, sha256Hex, bytesOf } from '../scripts/lib/etp-bridge-pack-builder.mjs';
import { createRequire } from 'node:module';
import { verifierApi, seeded, spyCrypto, loadBridge, CHECKS } from './lib/etp-bridge-test-support.mjs';

const require = createRequire(import.meta.url);

const { create, CODES, MESSAGES, LIMITS, REPORT_COLUMNS, REPORT_IDS } = verifierApi;
const gatewayFactory = require('../www/etp-module-gateway.js');
const lifecycle = require('../www/etp-store-lifecycle-policy.js');
const OPTIONS = DEFAULT_VERIFY_OPTIONS;

const set = await buildCaseSet({});
const keys = set.keys;
const verifier = create({ trustedKeys: [set.anchor], crypto: webcrypto });
const byId = Object.fromEntries(set.cases.map((entry) => [entry.id, entry]));
const run = (entry) => verifier.verify(entry.bytes, entry.verifyOptions);
const outcome = (result) => (result.ok ? 'ACCEPTED' : result.code);

test('every synthetic pack is accepted or refused with exactly its expected code', async () => {
  const wrong = [];
  for (const entry of set.cases) {
    const result = await run(entry);
    if (outcome(result) !== entry.expect.withTestKey) wrong.push(`${entry.id}: expected ${entry.expect.withTestKey}, got ${outcome(result)}`);
  }
  assert.deepEqual(wrong, []);
  assert.ok(set.cases.length >= 200, 'the negative set is broad');
});

test('a valid pack is accepted completely and the result is frozen, exact and free of pack text in refusals', async () => {
  const result = await run(byId['valid-month']);
  assert.equal(result.ok, true);
  assert.equal(result.stage, 'BRIDGE_VERIFIED');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.contract, 'SCC_ETP_BRIDGE_V1');
  assert.equal(result.scope.scopeKey, 'WLMHW|2026-27|2026-08-01..2026-08-31');
  assert.equal(result.keyId, set.anchor.keyId);
  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/);
  assert.match(result.packSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(REPORT_IDS.map((id) => result.reports[id].rowCount), [6, 6, 6, 6]);
  assert.equal(result.reports.R025.rows.length, 6);
  assert.deepEqual(Object.keys(result.reports.R025.rows[0]), [...REPORT_COLUMNS.R025]);
  assert.equal(Object.isFrozen(result.reports.R025.rows), true);
  assert.equal(result.reports.R025.sums.net_amount, '90247.50');
  assert.equal(result.reports.R025.sums.quantity, '9.000');
  assert.equal(result.reports.R025.byDay.length, 5);
  assert.deepEqual(result.engineFigures.map((figure) => [figure.figureId, figure.value]), [['R022.INVOICE_COUNT', '4']]);
  const again = await run(byId['valid-month']);
  assert.deepEqual(again, result, 'the same bytes give the same result');
});

test('the projections in the pack format are exactly the gateway analytics projections', () => {
  const projections = gatewayFactory.PROJECTIONS;
  const expected = { R003: ['invoice_date', ...projections.R003], R013: ['invoice_date', ...projections.R013],
    R022: ['invoice_date', 'invoice_number', ...projections.R022], R025: ['invoice_date', ...projections.R025] };
  for (const id of REPORT_IDS) assert.deepEqual([...REPORT_COLUMNS[id]], expected[id], id);
  for (const id of REPORT_IDS) for (const column of REPORT_COLUMNS[id]) assert.equal(verifierApi.FORBIDDEN_FIELD.test(column), false, column);
  assert.equal(verifierApi.FORBIDDEN_FIELD.source, '(?:^|_)(?:workbook|worksheet|filename|file_label|file_path|source_name|source_bytes|blob|base64|customer|consumer|mobile|phone|email|address|name|aadhaar|pan|dob)(?:$|_)');
});

test('every refusal is frozen, carries a table message, has no rows and echoes no pack text', async () => {
  const allowed = new Set(['ok', 'code', 'stage', 'check', 'message', 'report', 'field', 'line']);
  const seenChecks = new Set();
  for (const entry of set.cases) {
    const result = await run(entry);
    if (result.ok) continue;
    assert.equal(Object.isFrozen(result), true, entry.id);
    assert.equal(result.stage, 'BRIDGE_VERIFY', entry.id);
    assert.ok(CODES.includes(result.code), entry.id);
    assert.equal(result.message, MESSAGES[result.code], entry.id);
    assert.ok(CHECKS.includes(result.check), `${entry.id}: ${result.check}`);
    assert.deepEqual(Object.keys(result).filter((key) => !allowed.has(key)), [], entry.id);
    assert.equal(result.rows, undefined);
    assert.equal(result.reports, undefined);
    const text = JSON.stringify(result);
    for (const canary of ['SYNTHETIC_ONLY', 'CRO-0001', '0000123', '0000201', 'customer_name', 'polluted', 'Caf', '12500.00', '100.00']) assert.equal(text.includes(canary), false, `${entry.id} echoes ${canary}`);
    if (typeof result.field === 'string') assert.match(result.field, /^[A-Za-z0-9_.]{1,64}$/);
    seenChecks.add(result.check);
  }
  for (const check of ['FRAME', 'KEY', 'SIGNATURE', 'MANIFEST', 'VERSION', 'SCHEMA', 'POLICY', 'HASH', 'ROWS', 'TOTALS']) assert.ok(seenChecks.has(check), `a case refuses at ${check}`);
  for (const code of Object.values(MESSAGES)) assert.ok(code.length <= 140 && code.length > 10);
  assert.deepEqual(Object.keys(MESSAGES).sort(), [...CODES].sort());
});

test('each code is produced by a negative pack or by a dedicated test below', () => {
  const produced = new Set(set.cases.map((entry) => entry.expect.withTestKey));
  const elsewhere = ['TRUST_GATE_CLOSED', 'TRUST_ANCHOR_INVALID', 'CRYPTO_UNAVAILABLE', 'INPUT_INVALID', 'FILE_TOO_LARGE', 'CRYPTO_FAILED', 'INTERNAL_ERROR'].map((name) => `ETP_BRIDGE_${name}`);
  const missing = CODES.filter((code) => !produced.has(code) && !elsewhere.includes(code));
  assert.deepEqual(missing, []);
  assert.equal(new Set(CODES).size, CODES.length);
  for (const code of CODES) assert.match(code, /^ETP_BRIDGE_[A-Z0-9_]{1,60}$/);
  assert.equal(Object.isFrozen(CODES), true);
  assert.equal(Object.isFrozen(MESSAGES), true);
  assert.equal(CODES.length, 31);
});

test('the check order holds: authentication happens before any content is parsed (T06)', async () => {
  const spies = spyCrypto();
  const loaded = loadBridge({ cjs: true, sandbox: { crypto: spies.crypto } });
  const instance = loaded.exports.create({ trustedKeys: [set.anchor], crypto: spies.crypto });
  const refuse = async (bytes, code) => {
    loaded.counts.parse = 0; loaded.counts.decode = 0;
    const result = await instance.verify(bytes, OPTIONS);
    assert.equal(result.code, code);
    assert.equal(loaded.counts.parse, 0, `${code}: the manifest was not parsed`);
    assert.equal(loaded.counts.decode, 0, `${code}: no section was decoded`);
  };
  await refuse(byId['wrong-key-claims-trusted-id'].bytes, 'ETP_BRIDGE_SIGNATURE_INVALID');
  await refuse(byId['unknown-key'].bytes, 'ETP_BRIDGE_KEY_UNKNOWN');
  await refuse(byId['tampered-manifest-after-signing'].bytes, 'ETP_BRIDGE_SIGNATURE_INVALID');
  await refuse(byId['no-signature-zeros'].bytes, 'ETP_BRIDGE_SIGNATURE_INVALID');
  await refuse(byId['bad-magic'].bytes, 'ETP_BRIDGE_MAGIC_INVALID');
  await refuse(byId['trailing-byte'].bytes, 'ETP_BRIDGE_FRAME_INVALID');
  await refuse(byId['alg-byte-2'].bytes, 'ETP_BRIDGE_SIGNATURE_ALGORITHM_UNSUPPORTED');
  await refuse(byId['signature-no-domain-prefix'].bytes, 'ETP_BRIDGE_SIGNATURE_INVALID');
  /* a signed pack whose manifest is bad is parsed, but section hashing and row parsing stay unreached */
  loaded.counts.parse = 0; loaded.counts.decode = 0;
  const hashCalls = spies.calls.digest;
  assert.equal((await instance.verify(byId['contract-v2'].bytes, OPTIONS)).code, 'ETP_BRIDGE_CONTRACT_UNSUPPORTED');
  assert.equal(loaded.counts.parse, 1);
  assert.equal(loaded.counts.decode, 0);
  assert.ok(spies.calls.digest - hashCalls <= 3, 'only anchor and manifest hashing ran');
  /* a row fault is found only after every hash matched */
  loaded.counts.decode = 0;
  assert.equal((await instance.verify(byId['row-money-exponent'].bytes, OPTIONS)).code, 'ETP_BRIDGE_ROW_INVALID');
  assert.ok(loaded.counts.decode >= 1);
});

test('empty trust anchor: every pack is refused with the gate code before any digest, import, verify, parse or decode (T02)', async () => {
  const spies = spyCrypto();
  const loaded = loadBridge({ cjs: true, sandbox: { crypto: spies.crypto } });
  for (const trustedKeys of [[], undefined, null]) {
    const instance = loaded.exports.create({ trustedKeys, crypto: spies.crypto });
    assert.deepEqual({ ...instance.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: false, state: 'CLOSED', code: 'ETP_BRIDGE_TRUST_GATE_CLOSED' });
    for (const entry of set.cases.filter((candidate) => ['valid', 'signature', 'frame'].includes(candidate.group))) {
      const result = await instance.verify(entry.bytes, entry.verifyOptions);
      assert.equal(result.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED', entry.id);
      assert.equal(result.check, 'GATE');
    }
    for (const junk of [undefined, null, 'x', 7, {}, new Uint8Array(0)]) assert.equal((await instance.verify(junk, junk)).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  }
  assert.deepEqual(spies.calls, { digest: 0, importKey: 0, verify: 0 });
  assert.equal(loaded.counts.parse, 0);
  assert.equal(loaded.counts.decode, 0);
  assert.equal((await create({ trustedKeys: [], crypto: webcrypto }).verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
});

test('malformed trust anchors close the gate with their own code (T02)', async () => {
  const good = set.anchor, other = set.otherAnchor;
  const point = good.publicKeyHex;
  const offCurve = `04${'11'.repeat(64)}`;
  const offCurveId = hex(new Uint8Array(await webcrypto.subtle.digest('SHA-256', Buffer.from(offCurve, 'hex'))).subarray(0, 8));
  const lists = {
    'three keys': [good, other, { keyId: '0123456789abcdef', publicKeyHex: point }],
    'not an array': { keyId: good.keyId, publicKeyHex: point },
    'a string': 'abc',
    'entry is null': [null],
    'entry is a string': ['abc'],
    'missing key id': [{ publicKeyHex: point }],
    'extra member': [{ ...good, label: 'x' }],
    'upper case key id': [{ keyId: good.keyId.toUpperCase().replace(/[0-9]/g, 'A'), publicKeyHex: point }],
    'short key id': [{ keyId: good.keyId.slice(2), publicKeyHex: point }],
    'point not starting 04': [{ keyId: good.keyId, publicKeyHex: `05${point.slice(2)}` }],
    'short point': [{ keyId: good.keyId, publicKeyHex: point.slice(0, 128) }],
    'duplicate id': [good, good],
    'key id is not the hash of the point': [{ keyId: other.keyId, publicKeyHex: point }],
    'point not on the curve': [{ keyId: offCurveId, publicKeyHex: offCurve }]
  };
  for (const [name, trustedKeys] of Object.entries(lists)) {
    const instance = create({ trustedKeys, crypto: webcrypto });
    const result = await instance.verify(byId['valid-day'].bytes, OPTIONS);
    assert.equal(result.code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', name);
    assert.equal(result.check, 'GATE', name);
    /* gate() is a synchronous shape check; a key id that is not the hash of its point, or a point off the curve,
       is found by verify(), which recomputes the key ids before it reads any input. */
    const asyncOnly = name === 'key id is not the hash of the point' || name === 'point not on the curve';
    assert.equal(instance.gate().open, asyncOnly, name);
    assert.equal((await instance.verify(undefined, undefined)).code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', `${name}: the trust list is checked before the input`);
  }
  assert.equal(create({ trustedKeys: [good], crypto: webcrypto }).gate().open, true);
  const hostile = [{ get keyId() { throw new Error('boom'); }, publicKeyHex: point }];
  assert.equal((await create({ trustedKeys: hostile, crypto: webcrypto }).verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID');
});

test('a valid pack verifies only with the matching public key', async () => {
  const wrongOnly = create({ trustedKeys: [set.otherAnchor], crypto: webcrypto });
  assert.equal((await wrongOnly.verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_KEY_UNKNOWN');
  const both = create({ trustedKeys: [set.otherAnchor, set.anchor], crypto: webcrypto });
  assert.equal((await both.verify(byId['valid-day'].bytes, OPTIONS)).ok, true);
  assert.equal((await both.verify(byId['unknown-key'].bytes, OPTIONS)).ok, true, 'a second trusted key accepts its own packs');
  assert.equal((await verifier.verify(byId['unknown-key'].bytes, OPTIONS)).code, 'ETP_BRIDGE_KEY_UNKNOWN');
  const stranger = await generateTestKeyPair();
  const sameId = create({ trustedKeys: [{ keyId: set.anchor.keyId, publicKeyHex: stranger.anchor.publicKeyHex }], crypto: webcrypto });
  assert.equal((await sameId.verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID', 'a key id must be the hash of its own point');
});

test('verify reads only the bytes, the dictionary id and today: crypto, trust and key options are ignored (T04)', async () => {
  const alwaysTrue = { subtle: { digest: () => Promise.resolve(new ArrayBuffer(32)), importKey: () => Promise.resolve({}), verify: () => Promise.resolve(true) } };
  const decoy = { ...OPTIONS, crypto: alwaysTrue, trustedKeys: [set.otherAnchor], trust: [set.otherAnchor], publicKey: set.otherAnchor.publicKeyHex, keys: [set.otherAnchor], anchors: [set.otherAnchor], skipSignature: true };
  assert.equal((await verifier.verify(byId['tampered-manifest-after-signing'].bytes, decoy)).code, 'ETP_BRIDGE_SIGNATURE_INVALID');
  assert.equal((await verifier.verify(byId['unknown-key'].bytes, decoy)).code, 'ETP_BRIDGE_KEY_UNKNOWN');
  assert.equal((await verifier.verify(byId['valid-day'].bytes, decoy)).ok, true);
  assert.equal((await create({ trustedKeys: [], crypto: webcrypto }).verify(byId['valid-day'].bytes, decoy)).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
});

test('missing or crippled crypto fails closed; a verify that does not return exactly true is a refusal', async () => {
  const noCrypto = [undefined, null, {}, { subtle: {} }, { subtle: { digest: () => {} } }, { subtle: { digest: () => {}, importKey: () => {} } }];
  for (const cryptoSource of noCrypto) {
    const result = await create({ trustedKeys: [set.anchor], crypto: cryptoSource === undefined ? null : cryptoSource }).verify(byId['valid-day'].bytes, OPTIONS);
    assert.equal(result.code, 'ETP_BRIDGE_CRYPTO_UNAVAILABLE');
    assert.equal(result.check, 'ENV');
  }
  const noDecoder = globalThis.TextDecoder;
  try {
    globalThis.TextDecoder = undefined;
    assert.equal((await create({ trustedKeys: [set.anchor], crypto: webcrypto }).verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_CRYPTO_UNAVAILABLE');
  } finally { globalThis.TextDecoder = noDecoder; }
  const wrap = (override) => ({ subtle: { digest: (...a) => webcrypto.subtle.digest(...a), importKey: (...a) => webcrypto.subtle.importKey(...a), verify: (...a) => webcrypto.subtle.verify(...a), ...override } });
  assert.equal((await create({ trustedKeys: [set.anchor], crypto: wrap({ verify: () => Promise.reject(new Error('device')) }) }).verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_CRYPTO_FAILED');
  assert.equal((await create({ trustedKeys: [set.anchor], crypto: wrap({ digest: () => Promise.reject(new Error('device')) }) }).verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_CRYPTO_FAILED');
  for (const answer of ['true', 1, {}, undefined, null, 'yes']) {
    assert.equal((await create({ trustedKeys: [set.anchor], crypto: wrap({ verify: () => Promise.resolve(answer) }) }).verify(byId['valid-day'].bytes, OPTIONS)).code, 'ETP_BRIDGE_SIGNATURE_INVALID', String(answer));
  }
  const throwing = { toString() { throw new Error('hidden'); } };
  const savedDecoder = globalThis.TextDecoder;
  try {
    globalThis.TextDecoder = class { decode() { return throwing; } };
    const result = await create({ trustedKeys: [set.anchor], crypto: webcrypto }).verify(byId['valid-day'].bytes, OPTIONS);
    assert.equal(result.code, 'ETP_BRIDGE_INTERNAL_ERROR');
    assert.equal(result.message, MESSAGES.ETP_BRIDGE_INTERNAL_ERROR);
    assert.equal(JSON.stringify(result).includes('hidden'), false);
  } finally { globalThis.TextDecoder = savedDecoder; }
});

test('input and option validation: only bytes are accepted; the caller input is never mutated', async () => {
  const valid = byId['valid-day'].bytes;
  for (const junk of [undefined, null, 'string', 42, {}, [], { length: 200 }, new DataView(new ArrayBuffer(200)), new Uint16Array(200), new Float64Array(20), Symbol('x'), () => 1]) {
    const result = await verifier.verify(junk, OPTIONS);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ETP_BRIDGE_INPUT_INVALID', String(junk && junk.constructor && junk.constructor.name));
    assert.equal(result.check, 'INPUT');
  }
  for (const options of [undefined, null, {}, 'x', { tenderDictionaryVersionId: 'retail-etp-tender-v1' }, { today: '2026-09-01' },
    { tenderDictionaryVersionId: 5, today: '2026-09-01' }, { tenderDictionaryVersionId: '', today: '2026-09-01' }, { ...OPTIONS, today: '2026-02-30' },
    { ...OPTIONS, today: '20260901' }, { ...OPTIONS, today: '1999-01-01' }, { ...OPTIONS, today: 20260901 }, { get today() { throw new Error('x'); }, tenderDictionaryVersionId: 'a' }]) {
    assert.equal((await verifier.verify(valid, options)).code, 'ETP_BRIDGE_INPUT_INVALID');
  }
  const copy = Uint8Array.from(valid), digestBefore = await sha256Hex(valid);
  assert.equal((await verifier.verify(copy, OPTIONS)).ok, true);
  assert.equal(await sha256Hex(copy), digestBefore, 'the verifier does not change the caller bytes');
  assert.equal((await verifier.verify(valid.buffer.slice(valid.byteOffset, valid.byteOffset + valid.byteLength), OPTIONS)).ok, true, 'an ArrayBuffer is accepted');
  assert.equal((await verifier.verify(Buffer.from(valid), OPTIONS)).ok, true, 'a Buffer is accepted');
  const padded = new Uint8Array(valid.length + 20); padded.set(valid, 10);
  assert.equal((await verifier.verify(padded.subarray(10, 10 + valid.length), OPTIONS)).ok, true, 'a view with an offset is accepted');
  const spoof = { [Symbol.toStringTag]: 'Uint8Array', length: 300 };
  assert.equal((await verifier.verify(spoof, OPTIONS)).code, 'ETP_BRIDGE_INPUT_INVALID');
});

test('the result does not depend on later changes to the input: bytes are copied before use', async () => {
  const mutable = Uint8Array.from(byId['valid-month'].bytes);
  const pending = verifier.verify(mutable, OPTIONS);
  mutable.fill(0);
  const result = await pending;
  assert.equal(result.ok, true, 'wiping the caller array after the call started cannot change the outcome');
});

test('size limits: 32 MiB is the ceiling and larger files are refused before any copy or hash (T11)', async () => {
  const spies = spyCrypto();
  const instance = create({ trustedKeys: [set.anchor], crypto: spies.crypto });
  const baseline = spies.calls.digest;
  const tooBig = new Uint8Array(LIMITS.FILE_BYTES + 1);
  const result = await instance.verify(tooBig, OPTIONS);
  assert.equal(result.code, 'ETP_BRIDGE_FILE_TOO_LARGE');
  assert.equal(result.check, 'SIZE');
  assert.ok(spies.calls.digest - baseline <= 1 && spies.calls.importKey <= 1, 'only the trust-list check hashed or imported anything');
  assert.equal((await instance.verify(new Uint8Array(LIMITS.FILE_BYTES), OPTIONS)).code, 'ETP_BRIDGE_MAGIC_INVALID');
  assert.equal((await instance.verify(new Uint8Array(LIMITS.MIN_FILE_BYTES - 1), OPTIONS)).code, 'ETP_BRIDGE_FRAME_INVALID');
  assert.equal(LIMITS.MIN_FILE_BYTES, 85 + 1 + 16);
  assert.deepEqual({ FILE: LIMITS.FILE_BYTES, MANIFEST: LIMITS.MANIFEST_BYTES, ROWS: LIMITS.ROWS_PER_REPORT, LINE: LIMITS.LINE_BYTES, CELL: LIMITS.CELL_CHARS, DEPTH: LIMITS.DEPTH },
    { FILE: 33554432, MANIFEST: 262144, ROWS: 50000, LINE: 16384, CELL: 4096, DEPTH: 8 });
});

test('never throws: every truncation up to 400 bytes, random cuts and 200 seeded bit flips resolve with a refusal (T11)', async () => {
  const valid = byId['valid-month'].bytes;
  for (let cut = 0; cut <= 400; cut += 1) {
    const result = await verifier.verify(valid.subarray(0, cut), OPTIONS);
    assert.equal(result.ok, false, `cut ${cut}`);
    assert.ok(CODES.includes(result.code), `cut ${cut}`);
  }
  const random = seeded(20261112);
  for (let i = 0; i < 50; i += 1) {
    const cut = 400 + Math.floor(random() * (valid.length - 401));
    const result = await verifier.verify(valid.subarray(0, cut), OPTIONS);
    assert.equal(result.ok, false);
    assert.ok(CODES.includes(result.code));
  }
  for (let i = 0; i < 200; i += 1) {
    const copy = Uint8Array.from(valid), at = Math.floor(random() * copy.length);
    copy[at] ^= 1 << Math.floor(random() * 8);
    const result = await verifier.verify(copy, OPTIONS);
    assert.equal(result.ok, false, `flip at ${at}`);
    assert.ok(CODES.includes(result.code), `flip at ${at}`);
    assert.equal(Object.isFrozen(result), true);
  }
});

test('random garbage of many sizes never throws and is never accepted', async () => {
  const random = seeded(7);
  for (const size of [0, 1, 7, 8, 81, 85, 101, 102, 103, 150, 1000, 70000]) {
    for (let i = 0; i < 4; i += 1) {
      const bytes = new Uint8Array(size);
      for (let j = 0; j < size; j += 1) bytes[j] = Math.floor(random() * 256);
      if (size >= 8 && i % 2 === 0) bytes.set(bytesOf('SCCETP1\n'), 0);
      if (size >= 17 && i === 2) { bytes.set(set.anchor.keyId.match(/../g).map((pair) => parseInt(pair, 16)), 8); bytes[16] = 1; }
      const result = await verifier.verify(bytes, OPTIONS);
      assert.equal(result.ok, false);
      assert.ok(CODES.includes(result.code));
    }
  }
});

test('all or nothing: 49,999 good rows and one bad row give no rows and no partial result', async () => {
  const bigRows = (d) => {
    d.rows.R025 = Array.from({ length: 50000 }, (_, i) => ({ invoice_date: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}`, invoice_number: String(i).padStart(7, '0'), transaction_type_raw: 'INV',
      quantity: '1.000', net_amount: '100.00', brand: 'B', cluster: 'C', gender: 'G', scheme_discount: '0.00', user_discount: '0.00', tax_amount: '0.00' }));
  };
  const bytes = await buildPack({ keyPair: keys.trusted, profile: 'month', hooks: {
    rows: bigRows,
    sections: (d) => {
      const text = new TextDecoder().decode(d.sectionBytes[3]);
      const last = text.lastIndexOf('"net_amount":"100.00"');
      d.sectionBytes[3] = bytesOf(`${text.slice(0, last)}"net_amount":"100.0"${text.slice(last + '"net_amount":"100.00"'.length)}`);
    } } });
  const result = await verifier.verify(bytes, OPTIONS);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ETP_BRIDGE_ROW_INVALID');
  assert.equal(result.report, 'R025');
  assert.equal(result.line, 50000);
  assert.equal(result.field, 'net_amount');
  assert.equal(result.rows, undefined);
  assert.equal(result.reports, undefined);
});

test('a 50,000 row report verifies within a generous bound and 50,001 is refused (performance guard)', async () => {
  const large = await buildCaseSet({ trusted: keys.trusted, other: keys.other, includeLarge: true });
  const entries = Object.fromEntries(large.cases.filter((entry) => entry.group === 'large').map((entry) => [entry.id, entry]));
  const started = Date.now();
  const accepted = await verifier.verify(entries['valid-50000-rows'].bytes, OPTIONS);
  const elapsed = Date.now() - started;
  assert.equal(accepted.ok, true, accepted.code);
  assert.equal(accepted.reports.R025.rows.length, 50000);
  assert.ok(elapsed < 20000, `verification took ${elapsed} ms`);
  assert.equal((await verifier.verify(entries['rows-50001'].bytes, OPTIONS)).code, 'ETP_BRIDGE_ROW_LIMIT_EXCEEDED');
  assert.equal((await verifier.verify(entries['file-too-large'].bytes, OPTIONS)).code, 'ETP_BRIDGE_FILE_TOO_LARGE');
  assert.equal((await verifier.verify(entries['file-exactly-32-mib-garbage'].bytes, OPTIONS)).code, 'ETP_BRIDGE_KEY_UNKNOWN');
  assert.equal(entries['file-exactly-32-mib-garbage'].bytes.length, LIMITS.FILE_BYTES);
});

test('the financial-year and date policy agrees with the tablet lifecycle policy over a table of dates (T13)', async () => {
  const fy = (date) => { const year = Number(date.slice(0, 4)), start = Number(date.slice(5, 7)) >= 4 ? year : year - 1; return `${start}-${String((start + 1) % 100).padStart(2, '0')}`; };
  const dates = ['2024-04-01', '2024-12-31', '2025-03-31', '2025-04-01', '2026-03-31', '2026-04-01', '2026-08-21', '2027-03-31', '2027-04-01', '2028-02-28', '2028-02-29', '2028-03-01', '2029-03-31'];
  const wide = { ...OPTIONS, today: '2031-01-01' };
  for (const date of dates) {
    for (const financialYear of [fy(date), `${Number(fy(date).slice(0, 4)) + 1}-${String((Number(fy(date).slice(0, 4)) + 2) % 100).padStart(2, '0')}`, `${Number(fy(date).slice(0, 4)) - 1}-${fy(date).slice(2, 4)}`, '2026-28']) {
      const expected = lifecycle.validateScope({ storeCode: 'WLMHW', financialYear, periodStart: date, periodEnd: date }).ok;
      const bytes = await buildPack({ keyPair: keys.trusted, date, hooks: { manifest: (d) => { d.manifest.scope.financialYear = financialYear; d.manifest.scope.scopeKey = `WLMHW|${financialYear}|${date}..${date}`; } } });
      const result = await verifier.verify(bytes, wide);
      assert.equal(result.ok, expected, `${date} in ${financialYear}: ${result.code}`);
      if (!expected) assert.equal(result.code, 'ETP_BRIDGE_PERIOD_INVALID', `${date} in ${financialYear}`);
    }
  }
  for (const impossible of ['2026-02-30', '2027-02-29', '2100-02-29', '2026-13-01', '2026-00-10', '2026-04-31']) {
    assert.equal(lifecycle.validateScope({ storeCode: 'WLMHW', financialYear: '2026-27', periodStart: impossible, periodEnd: impossible }).ok, false);
  }
});

test('high-s twin signatures verify and give the same manifest identity; the pack identity is never the signature (T01)', async () => {
  const twin = await verifier.verify(byId['signature-high-s-twin'].bytes, OPTIONS);
  const plain = await verifier.verify(byId['valid-day'].bytes, OPTIONS);
  assert.equal(twin.ok, true);
  assert.equal(plain.ok, true);
  assert.notEqual(twin.packSha256, plain.packSha256, 'the signature differs, so the file differs');
  assert.equal(twin.exportId === plain.exportId, false, 'different seeds give different export ids');
  const draftA = Uint8Array.from(byId['valid-day'].bytes);
  const signature = draftA.slice(17, 81), twinSignature = highSTwin(signature);
  assert.notDeepEqual([...twinSignature], [...signature]);
  draftA.set(twinSignature, 17);
  const twinOfPlain = await verifier.verify(draftA, OPTIONS);
  assert.equal(twinOfPlain.ok, true);
  assert.equal(twinOfPlain.manifestSha256, plain.manifestSha256);
  assert.notEqual(twinOfPlain.packSha256, plain.packSha256);
  const doubleTwin = Uint8Array.from(draftA); doubleTwin.set(highSTwin(twinSignature), 17);
  assert.equal((await verifier.verify(doubleTwin, OPTIONS)).ok, true);
});

test('the signature covers the domain prefix and the exact manifest bytes (independent check of the wire format)', async () => {
  const pack = byId['valid-day'].bytes, view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
  assert.equal(new TextDecoder().decode(pack.subarray(0, 8)), 'SCCETP1\n');
  assert.equal(pack[16], 1);
  const manifestLength = view.getUint32(81), manifest = pack.subarray(85, 85 + manifestLength), signature = pack.subarray(17, 81);
  const point = Buffer.from(set.anchor.publicKeyHex, 'hex');
  const key = await webcrypto.subtle.importKey('raw', point, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const check = (prefix) => webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, Buffer.concat([Buffer.from(prefix), Buffer.from(manifest)]));
  assert.equal(await check('SCC-ETP-BRIDGE-v1\n'), true);
  assert.equal(await check(''), false);
  assert.equal(await check('SCC-ETP-BRIDGE-v1'), false);
  assert.equal(await check('SCC-ETP-BRIDGE-v2\n'), false);
  assert.equal(hex(pack.subarray(8, 16)), set.anchor.keyId);
  assert.equal(set.anchor.keyId, crypto.createHash('sha256').update(point).digest('hex').slice(0, 16));
  assert.equal(point.length, 65);
  assert.equal(point[0], 4);
  let at = 85 + manifestLength;
  for (let i = 0; i < 4; i += 1) { at += 4 + view.getUint32(at); }
  assert.equal(at, pack.length, 'the four sections end exactly at the end of the file');
});

test('canonical manifest form: a hand-written vector and the refusals of non-canonical forms', () => {
  const { canon } = verifierApi;
  assert.equal(canon({ b: 1, a: [true, null, 'x y'], c: {} }), '{"a":[true,null,"x y"],"b":1,"c":{}}');
  assert.equal(canon({ contract: 'SCC_ETP_BRIDGE_V1', schemaVersion: 1 }), '{"contract":"SCC_ETP_BRIDGE_V1","schemaVersion":1}');
  assert.equal(canon({ Z: 0, a: 0, B: 0 }), '{"B":0,"Z":0,"a":0}', 'keys sort by UTF-16 code unit');
  for (const bad of [-1, 1.5, 2 ** 53, NaN, Infinity, -0, 'é', '"', 'a\\b', 'a\nb', undefined, () => 1, Symbol('x'), 10n, { 'k"': 1 }, [undefined]]) assert.throws(() => canon(bad), TypeError, String(bad));
  assert.equal(canon('a'.repeat(120)).length, 122);
  assert.throws(() => canon('a'.repeat(121)), TypeError);
});

test('decimal grammar: money has exactly two places, quantity exactly three, no negative zero, bounded digits (T15)', () => {
  const { decimalUnits, formatUnits } = verifierApi;
  const good2 = [['0.00', 0], ['0.01', 1], ['100.00', 10000], ['-100.00', -10000], ['999999999.99', 99999999999], ['12345.67', 1234567]];
  for (const [text, units] of good2) assert.equal(decimalUnits(text, 2, 11), units, text);
  const good3 = [['1.000', 1000], ['0.001', 1], ['-2.500', -2500], ['99999999.999', 99999999999]];
  for (const [text, units] of good3) assert.equal(decimalUnits(text, 3, 11), units, text);
  for (const text of ['-0.00', '1', '1.0', '1.000', '01.00', '+1.00', ' 1.00', '1.00 ', '1,000.00', '1e2', '1.00e2', 'NaN', 'Infinity', '.5', '5.', '--1.00', '1.0.0', '', '0x10', '１.００', '9999999999.99', null, undefined, 1, {}]) {
    assert.equal(decimalUnits(text, 2, 11), null, String(text));
  }
  for (const text of ['-0.000', '1.00', '1.0000', '1', '0.1']) assert.equal(decimalUnits(text, 3, 11), null, text);
  assert.equal(decimalUnits('9999999999999.99', 2, 16), 999999999999999);
  assert.equal(decimalUnits('99999999999999999.99', 2, 16), null);
  assert.equal(decimalUnits('99999999999999.99', 2, 11), null);
  for (const units of [0, 1, 99, 100, -1, -100, -12345, 1234567890123]) assert.equal(decimalUnits(formatUnits(units, 2), 2, 16), units);
  assert.equal(formatUnits(5, 2), '0.05');
  assert.equal(formatUnits(-5, 3), '-0.005');
  assert.equal(formatUnits(123456, 3), '123.456');
});

test('the 0.1 + 0.2 trap and sums of many small values stay exact (T15)', async () => {
  const bytes = await buildPack({ keyPair: keys.trusted, profile: 'month', hooks: { rows: (d) => {
    d.rows.R003 = Array.from({ length: 300 }, (_, i) => ({ invoice_date: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}`, transaction_type_raw: i % 3 === 0 ? 'SR' : 'INV',
      net_amount: i % 2 === 0 ? '0.10' : '0.20', scheme_discount: '0.01', user_discount: '0.07' }));
  } } });
  const result = await verifier.verify(bytes, OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(result.reports.R003.sums.net_amount, '45.00');
  assert.equal(result.reports.R003.sums.scheme_discount, '3.00');
  assert.equal(result.reports.R003.sums.user_discount, '21.00');
});

test('a polluted Object.prototype changes no outcome (T16)', async () => {
  const baseline = new Map();
  for (const entry of set.cases) baseline.set(entry.id, outcome(await run(entry)));
  const names = ['ok', 'verified', 'code', 'keyId', 'signature', 'publicKey', 'keys', 'length', 'contract', 'schemaVersion', 'rows', 'state', 'open'];
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(Object.prototype, name)]);
  try {
    for (const name of names) Object.defineProperty(Object.prototype, name, { value: name === 'length' ? 300 : name === 'ok' || name === 'verified' || name === 'open' ? true : name === 'contract' ? 'SCC_ETP_BRIDGE_V1' : name === 'schemaVersion' ? 1 : 'polluted', writable: true, configurable: true, enumerable: false });
    const wrong = [];
    for (const entry of set.cases) {
      const result = await run(entry);
      if (outcome(result) !== baseline.get(entry.id)) wrong.push(`${entry.id}: ${baseline.get(entry.id)} became ${outcome(result)}`);
      if (!result.ok) assert.equal(Object.hasOwn(result, 'ok'), true);
    }
    assert.deepEqual(wrong, []);
  } finally {
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(Object.prototype, name, descriptor); else delete Object.prototype[name]; }
  }
  assert.equal(({}).polluted, undefined);
});

test('hostile keys in the manifest and in rows never reach Object.prototype (T15)', async () => {
  for (const id of ['proto-top-level-key', 'row-proto-key', 'manifest-duplicate-key']) {
    const result = await run(byId[id]);
    assert.equal(result.ok, false, id);
    assert.equal(({}).polluted, undefined, id);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false, id);
  }
});

test('the quarantined payment_type25 column is refused in the manifest, the rows and the totals (T15)', async () => {
  assert.equal((await run(byId['columns-payment-type25'])).code, 'ETP_BRIDGE_COLUMNS_MISMATCH');
  assert.equal((await run(byId['row-payment-type25-column'])).code, 'ETP_BRIDGE_ROW_INVALID');
  const manifestLevel = await run(byId['valid-day']);
  assert.equal(manifestLevel.paymentType25RowCount, 0);
  assert.equal(Object.keys(manifestLevel.reports.R022.sums).some((name) => /25/.test(name)), false);
});

test('store and role policy at the verifier: exact comparisons only, HEMW blocked by its own code (T12)', async () => {
  assert.equal((await run(byId['store-hemw'])).code, 'ETP_BRIDGE_STORE_HEMW_BLOCKED');
  for (const id of ['store-aw330', 'store-unknown', 'store-lowercase', 'store-hemw-lowercase', 'store-leading-space', 'store-trailing-space', 'store-hemw-trailing-space', 'store-wlmhw-pipe']) {
    assert.equal((await run(byId[id])).code, 'ETP_BRIDGE_STORE_REFUSED', id);
  }
  assert.equal((await run(byId['manifest-non-ascii-store'])).code, 'ETP_BRIDGE_MANIFEST_INVALID', 'a look-alike letter cannot even be parsed');
  assert.equal((await run(byId['role-manager'])).code, 'ETP_BRIDGE_EXPORT_ROLE_REFUSED');
  assert.equal((await run(byId['role-lowercase-owner'])).code, 'ETP_BRIDGE_EXPORT_ROLE_REFUSED');
  for (const code of ['HEMW', 'AW330', 'XYZ99', 'wlmhw']) {
    const bytes = await buildPack({ keyPair: keys.trusted, hooks: { manifest: (d) => { d.manifest.scope.storeCode = code; d.manifest.scope.scopeKey = `${code}|2026-27|2026-08-21..2026-08-21`; } } });
    const result = await verifier.verify(bytes, OPTIONS);
    assert.equal(result.ok, false, code);
    assert.equal(result.check, 'POLICY', code);
  }
});

test('engine figures never decide acceptance: a differing figure is accepted, a malformed figure is a schema fault', async () => {
  const month = await run(byId['valid-month']);
  assert.equal(month.ok, true);
  const rowDerived = new Set(month.reports.R022.rows.filter((row) => row.transaction_type_raw === 'INV').map((row) => row.invoice_number)).size;
  assert.equal(rowDerived, 5);
  assert.equal(month.engineFigures[0].value, '4');
  assert.notEqual(Number(month.engineFigures[0].value), rowDerived, 'the engine figure differs from the rows and the pack is still accepted (Q3)');
  assert.equal((await run(byId['valid-no-figures'])).engineFigures.length, 0);
  for (const id of ['figure-bad-kind', 'figure-extra-key', 'figure-decimal-value', 'figure-negative-zero', 'figures-33']) assert.equal((await run(byId[id])).code, 'ETP_BRIDGE_SCHEMA_INVALID', id);
});

test('zero-activity reports and boundary values are accepted', async () => {
  const zero = await run(byId['valid-zero-activity-r013']);
  assert.equal(zero.ok, true);
  assert.equal(zero.reports.R013.rowCount, 0);
  assert.equal(zero.reports.R013.zeroActivity, true);
  assert.deepEqual(zero.reports.R013.byDay, []);
  assert.equal(zero.reports.R013.sums.net_amount, '0.00');
  for (const id of ['valid-leap-day', 'valid-fy-last-day', 'valid-fy-first-day', 'valid-earliest-date', 'valid-two-days-ahead', 'valid-money-max-digits', 'valid-text-4096', 'valid-text-unicode-escape']) {
    assert.equal((await run(byId[id])).ok, true, id);
  }
  const unicode = await run(byId['valid-text-unicode-escape']);
  assert.equal(unicode.reports.R025.rows[0].cluster, 'Café “quoted” \\ slash');
});

test('the browser instance and the Node instance behave the same on every case', async () => {
  const spies = spyCrypto();
  const loaded = loadBridge({ files: ['etp-bridge-pack-verifier.js'], cjs: true, sandbox: { crypto: spies.crypto } });
  const viaVm = loaded.exports.create({ trustedKeys: [set.anchor], crypto: webcrypto });
  const wrong = [];
  for (const entry of set.cases.filter((candidate, index) => index % 3 === 0)) {
    const result = await viaVm.verify(entry.bytes, entry.verifyOptions);
    if (outcome(result) !== entry.expect.withTestKey) wrong.push(entry.id);
  }
  assert.deepEqual(wrong, []);
});

test('hostile long or deeply escaped row lines are refused quickly and never hang the row grammar (T11)', async () => {
  const slash = String.fromCharCode(92);
  const head = '{"invoice_date":"2026-08-21","transaction_type_raw":"INV","net_amount":"100.00","scheme_discount":"0.00","user_discount":"';
  const lines = [
    `{"invoice_date":"${('a' + slash).repeat(8000)}"`,
    `{"invoice_date":"2026-08-21","transaction_type_raw":"${(slash + slash).repeat(7000)}`,
    `{${'"invoice_date":"x",'.repeat(800)}`,
    `{"invoice_date":"${(`${slash}u12`).repeat(3500)}`,
    `${head}${'"'.repeat(15000)}`,
    `{"invoice_date":"${(`a${slash}"`).repeat(5000)}`,
    `${head}${'é'.repeat(8000)}`
  ];
  for (const line of lines) {
    const bytes = await buildPack({ keyPair: keys.trusted, hooks: { sections: (d) => { d.sectionBytes[0] = bytesOf(`${line.slice(0, 16000)}\n`); } } });
    const started = Date.now();
    const result = await verifier.verify(bytes, OPTIONS);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ETP_BRIDGE_ROW_INVALID');
    assert.equal(result.report, 'R003');
    assert.equal(result.line, 1);
    assert.ok(Date.now() - started < 2000);
  }
});

/* Added by the W1 audit (A-W1): each policy check below is the ONLY check that refuses its pack, so removing it turns the test red. */
test('isolated policy checks: cross-FY end, future limit, impossible period dates, figure dates and the early row-count stop (A-W1)', async () => {
  const policy = (date, edit, options = OPTIONS) => buildPack({ keyPair: keys.trusted, date, hooks: { manifest: (d) => {
    edit(d.manifest);
    const s = d.manifest.scope;
    s.scopeKey = `${s.storeCode}|${s.financialYear}|${s.periodStart}..${s.periodEnd}`;
  } } }).then((bytes) => verifier.verify(bytes, options));
  const refusedAt = (result, code, field, label) => { assert.equal(result.ok, false, label); assert.equal(result.code, code, label); assert.equal(result.field, field, label); };
  /* the period ends in the next financial year; every other date is consistent */
  refusedAt(await policy('2027-03-31', (m) => { m.scope.periodEnd = '2027-04-01'; m.createdAtUtc = '2027-04-01T18:30:00Z'; m.finalisedThrough = '2027-04-01'; }, { ...OPTIONS, today: '2027-04-02' }),
    'ETP_BRIDGE_PERIOD_INVALID', 'scope.financialYear', 'cross-FY end');
  /* the future limit: two days after today is accepted, three days is refused, with creation and finalisation consistent */
  assert.equal((await policy('2026-08-22', () => {}, { ...OPTIONS, today: '2026-08-20' })).ok, true, 'two days ahead');
  refusedAt(await policy('2026-08-22', () => {}, { ...OPTIONS, today: '2026-08-19' }), 'ETP_BRIDGE_PERIOD_INVALID', 'scope.periodEnd', 'three days ahead');
  /* impossible period dates whose string order would otherwise pass every later check */
  refusedAt(await policy('2026-08-21', (m) => { m.scope.periodEnd = '2026-08-32'; m.createdAtUtc = '2026-09-01T10:00:00Z'; m.finalisedThrough = '2026-09-01'; }), 'ETP_BRIDGE_PERIOD_INVALID', 'scope.periodEnd', 'day 32');
  refusedAt(await policy('2026-08-21', (m) => { m.scope.periodStart = '2026-08-00'; }), 'ETP_BRIDGE_PERIOD_INVALID', 'scope.periodStart', 'day 0');
  /* an engine figure date must be a real date */
  for (const date of ['2026-02-30', '2026-13-45']) {
    const result = await policy('2026-08-21', (m) => { m.engineFigures[0].date = date; });
    assert.equal(result.code, 'ETP_BRIDGE_SCHEMA_INVALID', date);
    assert.equal(result.field, 'engineFigures', date);
  }
  assert.equal((await policy('2026-08-21', (m) => { m.engineFigures[0].date = '2026-08-21'; })).ok, true, 'a real figure date');
  /* a section with far more lines than its rowCount stops at the first extra line, before decoding the rest */
  const extra = await buildPack({ keyPair: keys.trusted, hooks: { sections: (d) => { const line = new TextDecoder().decode(d.sectionBytes[0]); d.sectionBytes[0] = bytesOf(line.repeat(2000)); }, manifest: (d) => { d.manifest.reports.R003.rowCount = 1; } } });
  const counted = loadBridge({ files: ['etp-bridge-pack-verifier.js'], cjs: true, countParse: false });
  const countedVerifier = counted.exports.create({ trustedKeys: [set.anchor], crypto: webcrypto });
  const result = await countedVerifier.verify(extra, OPTIONS);
  assert.equal(result.code, 'ETP_BRIDGE_ROW_COUNT_MISMATCH');
  assert.equal(result.report, 'R003');
  assert.ok(counted.counts.decode <= 2, `decoded ${counted.counts.decode} lines`);
});
