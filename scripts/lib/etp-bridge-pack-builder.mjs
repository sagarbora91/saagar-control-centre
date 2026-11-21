/* ETP report-engine bridge: synthetic pack builder (Node, tooling and tests only; never loaded by the app).
   Pure library: it makes no file-system call at all. Packs are built in memory and signed with a THROWAWAY
   P-256 key pair that is generated here at run time with extractable:false, so the private key can never be
   exported, written or logged (owner decision B-4, given in chat 2026-11-12). Only the raw public point leaves
   the key pair. The "do not create keys" rule in CLAUDE.md concerns the APK signing key, not this key.
   canon(), the sign domain, the limits and the column lists come from the verifier module itself. All values are invented. */
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const verifierApi = require('../../www/etp-bridge-pack-verifier.js');
const { canon, SIGN_DOMAIN, FRAME, LIMITS, REPORT_IDS, REPORT_COLUMNS, MEASURES, CONTRACT } = verifierApi;
const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;

export const TENDER_DICTIONARY_ID = 'retail-etp-tender-v1';
export const SHIPPED_EXPECTATION = 'ETP_BRIDGE_TRUST_GATE_CLOSED';
export const DEFAULT_VERIFY_OPTIONS = Object.freeze({ tenderDictionaryVersionId: TENDER_DICTIONARY_ID, today: '2026-09-01' });
export { verifierApi };

/* ---- small byte helpers ---------------------------------------------------------------------------------- */
export function hex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
export function bytesOf(text) { return encoder.encode(text); }
export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
export function u32be(value) { return Uint8Array.of((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255); }
export async function sha256Bytes(bytes) { return new Uint8Array(await subtle.digest('SHA-256', bytes)); }
export async function sha256Hex(bytes) { return hex(await sha256Bytes(bytes)); }

/* ---- the throwaway key pair ------------------------------------------------------------------------------- */
export async function generateTestKeyPair() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const point = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, anchor: Object.freeze({ keyId: hex((await sha256Bytes(point)).subarray(0, 8)), publicKeyHex: hex(point) }) };
}
async function sign(privateKey, bytes) {
  return new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes));
}
export function highSTwin(signature) {
  let s = 0n;
  for (const byte of signature.subarray(32)) s = (s << 8n) | BigInt(byte);
  const twin = P256_ORDER - s, out = new Uint8Array(64);
  out.set(signature.subarray(0, 32), 0);
  for (let i = 63, value = twin; i >= 32; i -= 1, value >>= 8n) out[i] = Number(value & 255n);
  return out;
}
export function derOf(signature) {
  const integer = (part) => {
    let start = 0;
    while (start < 31 && part[start] === 0) start += 1;
    const body = part.subarray(start), pad = body[0] & 128 ? [0] : [];
    return [2, body.length + pad.length, ...pad, ...body];
  };
  const r = integer(signature.subarray(0, 32)), s = integer(signature.subarray(32));
  return Uint8Array.from([48, r.length + s.length, ...r, ...s]);
}

/* ---- exact decimal arithmetic (BigInt) -------------------------------------------------------------------- */
function unitsBig(text, scale) {
  const match = (scale === 3 ? /^(-?)(0|[1-9]\d*)\.(\d{3})$/ : /^(-?)(0|[1-9]\d*)\.(\d{2})$/).exec(typeof text === 'string' ? text : '');
  if (!match) return 0n;
  const value = BigInt(match[2] + match[3]);
  return match[1] === '-' ? -value : value;
}
function formatBig(value, scale) {
  const negative = value < 0n;
  let digits = (negative ? -value : value).toString();
  while (digits.length <= scale) digits = `0${digits}`;
  return `${negative ? '-' : ''}${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
}
export function computeTotals(rows, reportId) {
  const measures = MEASURES[reportId];
  const empty = () => measures.map(() => 0n);
  const total = empty(), days = new Map();
  for (const row of rows) {
    const date = String(row.invoice_date);
    if (!days.has(date)) days.set(date, { rowCount: 0, sums: empty() });
    const day = days.get(date);
    day.rowCount += 1;
    measures.forEach((measure, index) => {
      const units = unitsBig(row[measure.name], measure.scale);
      total[index] += units; day.sums[index] += units;
    });
  }
  const text = (units) => Object.fromEntries(measures.map((measure, index) => [measure.name, formatBig(units[index], measure.scale)]));
  return { sums: text(total), byDay: [...days.keys()].sort().map((date) => ({ date, rowCount: days.get(date).rowCount, sums: text(days.get(date).sums) })) };
}

/* ---- synthetic data profiles ------------------------------------------------------------------------------- */
const SYNTH = 'SYNTHETIC_ONLY';
function financialYearOf(isoDate) {
  const year = Number(isoDate.slice(0, 4)), start = Number(isoDate.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
function invoiceRows(invoices) {
  const rows = { R003: [], R013: [], R022: [], R025: [] };
  for (const v of invoices) {
    rows.R003.push({ invoice_date: v.date, transaction_type_raw: v.type, net_amount: v.net, scheme_discount: v.scheme, user_discount: v.user });
    rows.R013.push({ invoice_date: v.date, invoice_number: v.no, transaction_type_raw: v.type, quantity: v.qty, net_amount: v.net, cro_number: v.cro });
    rows.R022.push({ invoice_date: v.date, invoice_number: v.no, transaction_type_raw: v.type, invoice_quantity: v.qty, net_value: v.net,
      cash_amount: v.tender, card_amount: '0.00', bhim_upi_amount: '0.00', phonepe_amount: '0.00', paytm_amount: '0.00', razorpay_amount: '0.00',
      bharatpe_amount: '0.00', cheque_amount: '0.00', others_amount: '0.00', payment_type24_amount: '0.00' });
    rows.R025.push({ invoice_date: v.date, invoice_number: v.no, transaction_type_raw: v.type, quantity: v.qty, net_amount: v.net, brand: SYNTH, cluster: SYNTH,
      gender: SYNTH, scheme_discount: v.scheme, user_discount: v.user, tax_amount: v.tax });
  }
  for (const id of REPORT_IDS) rows[id].sort((a, b) => (a.invoice_date + (a.invoice_number || '')).localeCompare(b.invoice_date + (b.invoice_number || '')));
  return rows;
}
/* 'day' mirrors the synthetic XLSX fixtures (scripts/generate-etp-synthetic-fixtures.mjs): one invoice, one row per report. */
function dayProfile(date = '2026-08-21') {
  const invoices = [{ date, no: '0000123', type: 'INV', qty: '1.000', net: '100.00', scheme: '0.00', user: '0.00', tax: '0.00', cro: 'CRO-0001', tender: '0.00' }];
  return { rows: invoiceRows(invoices), scope: { storeCode: 'WLMHW', financialYear: financialYearOf(date), periodStart: date, periodEnd: date },
    createdAtUtc: `${date}T18:30:00Z`, figures: [{ date: null, figureId: 'R022.INVOICE_COUNT', kind: 'COUNT', reportId: 'R022', ruleRef: 'ETP-DECISION-41', value: '1' }] };
}
/* 'month' covers August 2026. Sales-return rows carry positive magnitudes. The single engine figure differs from the
   row-derived count of distinct sale invoices (5): the pack must still be accepted (owner decision Q3). */
function monthProfile() {
  const invoices = [
    { date: '2026-08-03', no: '0000201', type: 'INV', qty: '1.000', net: '12500.00', scheme: '0.00', user: '0.00', tax: '1906.78', cro: 'CRO-0001' },
    { date: '2026-08-10', no: '0000202', type: 'INV', qty: '2.000', net: '31998.50', scheme: '1500.00', user: '0.00', tax: '4880.97', cro: 'CRO-0002' },
    { date: '2026-08-10', no: '0000203', type: 'INV', qty: '1.000', net: '4500.00', scheme: '0.00', user: '250.00', tax: '686.44', cro: 'CRO-0001' },
    { date: '2026-08-17', no: '0000204', type: 'SR', qty: '1.000', net: '4500.00', scheme: '0.00', user: '250.00', tax: '686.44', cro: 'CRO-0001' },
    { date: '2026-08-24', no: '0000205', type: 'INV', qty: '1.000', net: '8999.00', scheme: '0.00', user: '0.00', tax: '1372.73', cro: 'CRO-0002' },
    { date: '2026-08-31', no: '0000206', type: 'INV', qty: '3.000', net: '27750.00', scheme: '0.00', user: '0.00', tax: '4233.05', cro: 'CRO-0001' }
  ].map((v) => ({ ...v, tender: v.net }));
  return { rows: invoiceRows(invoices), scope: { storeCode: 'WLMHW', financialYear: '2026-27', periodStart: '2026-08-01', periodEnd: '2026-08-31' },
    createdAtUtc: '2026-08-31T18:30:00Z', figures: [{ date: null, figureId: 'R022.INVOICE_COUNT', kind: 'COUNT', reportId: 'R022', ruleRef: 'ETP-DECISION-41', value: '4' }] };
}
export const PROFILES = Object.freeze({ day: dayProfile, month: monthProfile });
const clone = (value) => JSON.parse(JSON.stringify(value));

/* ---- encoding ------------------------------------------------------------------------------------------- */
export function encodeRows(rows, reportId) {
  const columns = REPORT_COLUMNS[reportId];
  return bytesOf(rows.map((row) => `{${columns.map((column) => `${JSON.stringify(column)}:${JSON.stringify(row[column])}`).join(',')}}\n`).join(''));
}
function textOf(bytes) { return new TextDecoder().decode(bytes); }

async function buildManifest(d) {
  const reports = {};
  for (const [index, id] of REPORT_IDS.entries()) {
    reports[id] = {
      bytes: d.sectionBytes[index].length, columns: [...REPORT_COLUMNS[id]], engineTotals: computeTotals(d.rows[id], id), rowCount: d.rows[id].length,
      sha256: await sha256Hex(d.sectionBytes[index]), sourceFileCount: 1, sourceSetSha256: await sha256Hex(bytesOf(`synthetic-source|${id}`)), zeroActivity: d.rows[id].length === 0
    };
  }
  const scopeKey = `${d.scope.storeCode}|${d.scope.financialYear}|${d.scope.periodStart}..${d.scope.periodEnd}`;
  return {
    contract: CONTRACT, createdAtUtc: d.createdAtUtc, engine: { migrationLevel: '0000', product: 'ETP-Reporting-Engine', version: '0.0.0' },
    engineFigures: clone(d.figures), engineGeneration: d.generation, exportId: (await sha256Hex(bytesOf(`synthetic|${d.seed}|${scopeKey}|G${d.generation}`))).slice(0, 32),
    exportedByRole: 'OWNER', finalisedThrough: d.scope.periodEnd, keyId: d.keyId, paymentType25RowCount: 0, reports, schemaVersion: 1,
    scope: { ...d.scope, scopeKey }, supersedesExportId: null, tenderDictionaryVersion: TENDER_DICTIONARY_ID
  };
}

/* Builds one pack. `hooks` inject exactly one fault at the layer where it belongs:
   rows -> sections -> manifest -> manifestText -> signing -> frame -> bytes. Everything after the faulted layer is
   rebuilt (hashes, totals, signature) unless a later hook overrides it, so a negative pack fails at the intended check only. */
export async function buildPackDraft({ keyPair, profile = 'day', date, generation = 1, seed = 'default', hooks = {}, keyId } = {}) {
  if (!keyPair || !keyPair.privateKey) throw new TypeError('buildPackDraft needs a throwaway key pair');
  const base = profile === 'month' ? monthProfile() : dayProfile(date);
  const d = { profile, rows: base.rows, scope: base.scope, createdAtUtc: base.createdAtUtc, figures: base.figures, generation, seed, keyId: keyId || keyPair.anchor.keyId,
    signingKey: keyPair.privateKey, signDomain: SIGN_DOMAIN, magic: bytesOf(FRAME.MAGIC), sigAlg: FRAME.SIG_ALG_ECDSA_P256_SHA256, trailing: new Uint8Array(0) };
  if (hooks.rows) await hooks.rows(d);
  d.sectionBytes = REPORT_IDS.map((id) => encodeRows(d.rows[id], id));
  if (hooks.sections) await hooks.sections(d);
  d.manifest = await buildManifest(d);
  if (hooks.manifest) await hooks.manifest(d);
  d.manifestText = canon(d.manifest);
  if (hooks.manifestText) await hooks.manifestText(d);
  d.manifestBytes = bytesOf(d.manifestText);
  d.headerKeyIdRaw = Uint8Array.from(d.keyId.match(/../g).map((pair) => parseInt(pair, 16)));
  if (hooks.signing) await hooks.signing(d);
  if (!d.signature) d.signature = await sign(d.signingKey, concat(bytesOf(d.signDomain), d.manifestBytes));
  if (hooks.frame) await hooks.frame(d);
  d.bytes = concat(d.magic, d.headerKeyIdRaw, Uint8Array.of(d.sigAlg), d.signature, u32be(d.manifestLengthField ?? d.manifestBytes.length), d.manifestBytes,
    ...d.sectionBytes.flatMap((section, index) => [u32be(d.sectionLengthFields ? d.sectionLengthFields[index] : section.length), section]), d.trailing);
  if (hooks.bytes) d.bytes = await hooks.bytes(d) || d.bytes;
  return d;
}
export async function buildPack(options) { return (await buildPackDraft(options)).bytes; }

/* ---- the case set -------------------------------------------------------------------------------------- */
const E = (name) => `ETP_BRIDGE_${name}`;
const ACCEPTED = 'ACCEPTED';
const MEASURE_NAMES = Object.fromEntries(REPORT_IDS.map((id) => [id, MEASURES[id].map((m) => m.name)]));

function lineEdit(d, id, edit) {
  const index = REPORT_IDS.indexOf(id);
  const lines = textOf(d.sectionBytes[index]).split('\n').slice(0, -1);
  d.sectionBytes[index] = bytesOf(`${edit(lines).join('\n')}\n`);
}
function scopeHook(patch, { forgedKey } = {}) {
  return { manifest: (d) => { Object.assign(d.manifest.scope, patch); if (forgedKey === undefined) d.manifest.scope.scopeKey = `${d.manifest.scope.storeCode}|${d.manifest.scope.financialYear}|${d.manifest.scope.periodStart}..${d.manifest.scope.periodEnd}`; else d.manifest.scope.scopeKey = forgedKey; } };
}
function rowsOf(id, edit) { return { rows: (d) => edit(d.rows[id], d) }; }
function textColumnLength(chars, filler = 'x') { return filler.repeat(chars); }

/* Returns [{id, group, note, bytes, expect:{shipped, withTestKey}, verifyOptions}] built with the supplied (or fresh) key pairs. */
export async function buildCaseSet({ trusted, other, includeLarge = false } = {}) {
  const keys = { trusted: trusted || await generateTestKeyPair(), other: other || await generateTestKeyPair() };
  const defs = [];
  const add = (id, group, withTestKey, note, options = {}) => defs.push({ id, group, withTestKey, note, options });

  /* valid packs */
  add('valid-day', 'valid', ACCEPTED, 'one invoice, mirrors the synthetic XLSX fixtures', { profile: 'day' });
  add('valid-month', 'valid', ACCEPTED, 'August 2026 with an SR row; the engine invoice count differs from the rows and must be accepted (Q3)', { profile: 'month' });
  add('valid-zero-activity-r013', 'valid', ACCEPTED, 'R013 has no rows (zeroActivity true)', { hooks: rowsOf('R013', (rows) => { rows.length = 0; }) });
  add('valid-no-figures', 'valid', ACCEPTED, 'engineFigures empty', { hooks: { manifest: (d) => { d.manifest.engineFigures = []; } } });
  add('valid-leap-day', 'valid', ACCEPTED, '2028-02-29 is a real date', { date: '2028-02-29', verifyOptions: { ...DEFAULT_VERIFY_OPTIONS, today: '2028-03-01' } });
  add('valid-fy-last-day', 'valid', ACCEPTED, '2027-03-31 belongs to FY 2026-27', { date: '2027-03-31', verifyOptions: { ...DEFAULT_VERIFY_OPTIONS, today: '2027-04-01' } });
  add('valid-fy-first-day', 'valid', ACCEPTED, '2027-04-01 belongs to FY 2027-28', { date: '2027-04-01', verifyOptions: { ...DEFAULT_VERIFY_OPTIONS, today: '2027-04-02' } });
  add('valid-earliest-date', 'valid', ACCEPTED, '2024-04-01 is the earliest accepted period start', { date: '2024-04-01' });
  add('valid-two-days-ahead', 'valid', ACCEPTED, 'period end two days after today is the limit', { date: '2026-08-21', verifyOptions: { ...DEFAULT_VERIFY_OPTIONS, today: '2026-08-19' } });
  add('valid-money-max-digits', 'valid', ACCEPTED, 'largest row value: 11 digits', { hooks: rowsOf('R025', (rows) => { rows[0].net_amount = '999999999.99'; }) });
  add('valid-text-4096', 'valid', ACCEPTED, 'a 4096 character cell is allowed', { hooks: rowsOf('R025', (rows) => { rows[0].brand = textColumnLength(4096); }) });
  add('valid-text-unicode-escape', 'valid', ACCEPTED, 'a text cell with non-ASCII and escaped characters', { hooks: rowsOf('R025', (rows) => { rows[0].cluster = 'Café “quoted” \\ slash'; }) });

  /* trust and signature */
  add('wrong-key-claims-trusted-id', 'signature', E('SIGNATURE_INVALID'), 'signed by another key while naming the trusted key id', { hooks: { signing: (d) => { d.signingKey = keys.other.privateKey; } } });
  add('unknown-key', 'signature', E('KEY_UNKNOWN'), 'honestly signed by a key that is not trusted', { signer: 'other' });
  add('header-key-id-spoof', 'signature', E('KEY_UNKNOWN'), 'header key id altered by one bit', { hooks: { frame: (d) => { d.headerKeyIdRaw = Uint8Array.from(d.headerKeyIdRaw); d.headerKeyIdRaw[0] ^= 1; } } });
  add('manifest-key-id-differs', 'signature', E('KEY_ID_MISMATCH'), 'manifest names another key id than the header', { hooks: { manifest: (d) => { d.manifest.keyId = keys.other.anchor.keyId; } } });
  add('no-signature-zeros', 'signature', E('SIGNATURE_INVALID'), 'signature field is 64 zero bytes', { hooks: { signing: (d) => { d.signature = new Uint8Array(64); } } });
  add('signature-no-domain-prefix', 'signature', E('SIGNATURE_INVALID'), 'signed over the manifest without the domain prefix', { hooks: { signing: (d) => { d.signDomain = ''; } } });
  add('signature-other-domain', 'signature', E('SIGNATURE_INVALID'), 'signed with another product domain prefix', { hooks: { signing: (d) => { d.signDomain = 'ETP-RESULT-v1\n'; } } });
  add('signature-der-form', 'signature', E('SIGNATURE_INVALID'), 'DER signature squeezed into the 64 byte field', { hooks: { signing: async (d) => { d.signature = derOf(await sign(d.signingKey, concat(bytesOf(d.signDomain), d.manifestBytes))).subarray(0, 64); } } });
  add('signature-high-s-twin', 'signature', ACCEPTED, 'the (r, n-s) twin of a valid signature also verifies and keeps the same manifest identity', { hooks: { signing: async (d) => { d.signature = highSTwin(await sign(d.signingKey, concat(bytesOf(d.signDomain), d.manifestBytes))); } } });
  add('alg-byte-2', 'signature', E('SIGNATURE_ALGORITHM_UNSUPPORTED'), 'signature algorithm byte is 2', { hooks: { frame: (d) => { d.sigAlg = 2; } } });
  add('alg-byte-0', 'signature', E('SIGNATURE_ALGORITHM_UNSUPPORTED'), 'signature algorithm byte is 0', { hooks: { frame: (d) => { d.sigAlg = 0; } } });
  add('tampered-manifest-after-signing', 'signature', E('SIGNATURE_INVALID'), 'one digit of createdAtUtc changed after signing', { hooks: { frame: (d) => { d.manifestBytes = Uint8Array.from(d.manifestBytes); const at = textOf(d.manifestBytes).indexOf('2026-08-21T18'); d.manifestBytes[at + 3] = 55; } } });

  /* frame */
  add('bad-magic', 'frame', E('MAGIC_INVALID'), 'first byte of the magic changed', { hooks: { frame: (d) => { d.magic = bytesOf('XCCETP1\n'); } } });
  add('trailing-byte', 'frame', E('FRAME_INVALID'), 'one byte after the last section', { hooks: { frame: (d) => { d.trailing = Uint8Array.of(0); } } });
  add('manifest-length-zero', 'frame', E('FRAME_INVALID'), 'manifest length field 0', { hooks: { frame: (d) => { d.manifestLengthField = 0; } } });
  add('manifest-length-too-big', 'frame', E('FRAME_INVALID'), 'manifest length field 262145', { hooks: { frame: (d) => { d.manifestLengthField = 262145; } } });
  add('manifest-length-beyond-file', 'frame', E('FRAME_INVALID'), 'manifest length field larger than the file', { hooks: { frame: (d) => { d.manifestLengthField = d.manifestBytes.length + 100000; } } });
  add('section-length-huge', 'frame', E('FRAME_INVALID'), 'first section length 0xFFFFFFFF', { hooks: { frame: (d) => { d.sectionLengthFields = [4294967295, ...d.sectionBytes.slice(1).map((s) => s.length)]; } } });
  add('section-length-short', 'frame', E('FRAME_INVALID'), 'a section length one byte short leaves trailing bytes', { hooks: { frame: (d) => { d.sectionLengthFields = d.sectionBytes.map((s, i) => (i === 3 ? s.length - 1 : s.length)); } } });
  add('manifest-over-limit-real', 'frame', E('FRAME_INVALID'), 'manifest of 262145 real bytes', { hooks: { frame: (d) => { d.manifestBytes = new Uint8Array(262145).fill(32); } } });
  add('empty-file', 'frame', E('FRAME_INVALID'), 'zero bytes', { bytes: () => new Uint8Array(0) });
  add('tiny-file', 'frame', E('FRAME_INVALID'), '50 bytes of the magic and zeros', { bytes: () => concat(bytesOf('SCCETP1\n'), new Uint8Array(42)) });
  add('not-a-pack-zip-like', 'frame', E('MAGIC_INVALID'), 'a zip-looking file, for example a renamed workbook', { bytes: () => concat(Uint8Array.of(80, 75, 3, 4), new Uint8Array(300)) });
  add('not-a-pack-text', 'frame', E('MAGIC_INVALID'), 'plain text of 300 bytes', { bytes: () => bytesOf('hello engine '.repeat(24)) });
  add('truncated-half', 'frame', E('FRAME_INVALID'), 'the valid pack cut in half', { hooks: { bytes: (d) => d.bytes.subarray(0, d.bytes.length >> 1) } });
  add('truncated-last-byte', 'frame', E('FRAME_INVALID'), 'the valid pack without its last byte', { hooks: { bytes: (d) => d.bytes.subarray(0, d.bytes.length - 1) } });

  /* manifest text */
  const text = (edit) => ({ manifestText: (d) => { d.manifestText = edit(d.manifestText, d); } });
  add('manifest-trailing-space', 'manifest', E('MANIFEST_INVALID'), 'signed manifest with one extra space', { hooks: text((t) => `${t} `) });
  add('manifest-reordered-keys', 'manifest', E('MANIFEST_INVALID'), 'keys not in sorted order', { hooks: text((t) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(t)).reverse()))) });
  add('manifest-pretty-printed', 'manifest', E('MANIFEST_INVALID'), 'indented JSON', { hooks: text((t) => JSON.stringify(JSON.parse(t), null, 1)) });
  add('manifest-duplicate-key', 'manifest', E('MANIFEST_INVALID'), 'a duplicated key (last value wins in a plain parser)', { hooks: text((t, d) => t.replace(`"keyId":"${d.keyId}"`, `"keyId":"${keys.other.anchor.keyId}","keyId":"${d.keyId}"`)) });
  add('manifest-float-number', 'manifest', E('MANIFEST_INVALID'), 'engineGeneration written as 1.0', { hooks: text((t) => t.replace('"engineGeneration":1', '"engineGeneration":1.0')) });
  add('manifest-exponent-number', 'manifest', E('MANIFEST_INVALID'), 'engineGeneration written as 1e0', { hooks: text((t) => t.replace('"engineGeneration":1', '"engineGeneration":1e0')) });
  add('manifest-negative-number', 'manifest', E('MANIFEST_INVALID'), 'a negative count', { hooks: text((t) => t.replace('"paymentType25RowCount":0', '"paymentType25RowCount":-1')) });
  add('manifest-huge-number', 'manifest', E('MANIFEST_INVALID'), 'an integer above 2^53', { hooks: text((t) => t.replace('"paymentType25RowCount":0', '"paymentType25RowCount":99999999999999999999')) });
  add('manifest-non-ascii-store', 'manifest', E('MANIFEST_INVALID'), 'a Cyrillic letter in the store code', { hooks: text((t) => t.replace('"storeCode":"WLMHW"', '"storeCode":"ШLMHW"')) });
  add('manifest-bom', 'manifest', E('MANIFEST_INVALID'), 'byte order mark before the manifest', { hooks: text((t) => `﻿${t}`) });
  add('manifest-deep-nesting', 'manifest', E('MANIFEST_INVALID'), 'engineFigures nested 5000 levels deep', { hooks: text((t) => t.replace(/"engineFigures":\[[^\]]*\]/, `"engineFigures":${'['.repeat(5000)}${']'.repeat(5000)}`)) });
  add('manifest-not-json', 'manifest', E('MANIFEST_INVALID'), 'the text hello', { hooks: text(() => 'hello') });
  add('manifest-top-level-array', 'manifest', E('MANIFEST_INVALID'), 'an array instead of an object', { hooks: text(() => '[]') });
  add('manifest-string-escape', 'manifest', E('MANIFEST_INVALID'), 'a unicode escape sequence inside a string', { hooks: text((t) => t.replace('"exportedByRole":"OWNER"', '"exportedByRole":"OWN\\u0045R"')) });
  add('manifest-null-top-level', 'manifest', E('MANIFEST_INVALID'), 'the JSON value null as the whole manifest', { hooks: text(() => 'null') });

  /* version and schema (all re-signed) */
  const manifest = (edit) => ({ manifest: (d) => edit(d.manifest, d) });
  add('contract-v2', 'schema', E('CONTRACT_UNSUPPORTED'), 'another contract id', { hooks: manifest((m) => { m.contract = 'SCC_ETP_BRIDGE_V2'; }) });
  add('contract-missing', 'schema', E('CONTRACT_UNSUPPORTED'), 'contract key removed', { hooks: manifest((m) => { delete m.contract; }) });
  add('schema-version-2', 'schema', E('VERSION_UNSUPPORTED'), 'schemaVersion 2', { hooks: manifest((m) => { m.schemaVersion = 2; }) });
  add('schema-version-string', 'schema', E('VERSION_UNSUPPORTED'), 'schemaVersion "1" as text', { hooks: manifest((m) => { m.schemaVersion = '1'; }) });
  add('extra-top-level-key', 'schema', E('SCHEMA_INVALID'), 'one unexpected harmless key', { hooks: manifest((m) => { m.colour = 'blue'; }) });
  add('proto-top-level-key', 'schema', E('SCHEMA_INVALID'), 'a __proto__ key', { hooks: text((t) => t.replace('{"contract"', '{"__proto__":{"polluted":true},"contract"')) });
  add('missing-top-level-key', 'schema', E('SCHEMA_INVALID'), 'tenderDictionaryVersion removed', { hooks: manifest((m) => { delete m.tenderDictionaryVersion; }) });
  add('forbidden-top-level-key', 'schema', E('FIELD_FORBIDDEN'), 'a customer_name key', { hooks: manifest((m) => { m.customer_name = 'X'; }) });
  add('report-missing', 'schema', E('SCHEMA_INVALID'), 'R013 block removed', { hooks: manifest((m) => { delete m.reports.R013; }) });
  add('report-extra', 'schema', E('SCHEMA_INVALID'), 'an R024 block', { hooks: manifest((m) => { m.reports.R024 = clone(m.reports.R003); }) });
  add('report-key-extra', 'schema', E('SCHEMA_INVALID'), 'unexpected key inside a report block', { hooks: manifest((m) => { m.reports.R003.note = 'x'; }) });
  add('row-count-above-limit', 'schema', E('ROW_LIMIT_EXCEEDED'), 'rowCount 50001 in the manifest', { hooks: manifest((m) => { m.reports.R025.rowCount = 50001; }) });
  add('engine-product-wrong', 'schema', E('SCHEMA_INVALID'), 'another product name', { hooks: manifest((m) => { m.engine.product = 'Other-Engine'; }) });
  add('engine-version-bad', 'schema', E('SCHEMA_INVALID'), 'version with letters', { hooks: manifest((m) => { m.engine.version = '1.x.0'; }) });
  add('generation-zero', 'schema', E('SCHEMA_INVALID'), 'engineGeneration 0', { hooks: manifest((m) => { m.engineGeneration = 0; }) });
  add('export-id-uppercase', 'schema', E('SCHEMA_INVALID'), 'exportId not lower-case hex', { hooks: manifest((m) => { m.exportId = m.exportId.toUpperCase(); }) });
  add('supersedes-bad', 'schema', E('SCHEMA_INVALID'), 'supersedesExportId not hex', { hooks: manifest((m) => { m.supersedesExportId = 'abc'; }) });
  add('created-at-bad', 'schema', E('SCHEMA_INVALID'), 'createdAtUtc without the Z', { hooks: manifest((m) => { m.createdAtUtc = '2026-08-21T18:30:00'; }) });
  add('source-file-count-high', 'schema', E('SCHEMA_INVALID'), 'sourceFileCount 14', { hooks: manifest((m) => { m.reports.R003.sourceFileCount = 14; }) });
  add('figure-bad-kind', 'schema', E('SCHEMA_INVALID'), 'figure kind outside the list', { hooks: manifest((m) => { m.engineFigures[0].kind = 'AMOUNT'; }) });
  add('figure-extra-key', 'schema', E('SCHEMA_INVALID'), 'figure with an unexpected key', { hooks: manifest((m) => { m.engineFigures[0].label = 'x'; }) });
  add('figure-decimal-value', 'schema', E('SCHEMA_INVALID'), 'figure value 4.0', { hooks: manifest((m) => { m.engineFigures[0].value = '4.0'; }) });
  add('figure-negative-zero', 'schema', E('SCHEMA_INVALID'), 'figure value -0', { hooks: manifest((m) => { m.engineFigures[0].value = '-0'; }) });
  add('figures-33', 'schema', E('SCHEMA_INVALID'), '33 figures', { hooks: manifest((m) => { m.engineFigures = Array.from({ length: 33 }, (_, i) => ({ date: null, figureId: `R022.FIGURE_${i}`, kind: 'COUNT', reportId: 'R022', ruleRef: 'X', value: '1' })); }) });
  add('columns-extra-harmless', 'schema', E('COLUMNS_MISMATCH'), 'an extra column colour', { hooks: manifest((m) => { m.reports.R025.columns.push('colour'); }) });
  add('columns-missing', 'schema', E('COLUMNS_MISMATCH'), 'last column removed', { hooks: manifest((m) => { m.reports.R025.columns.pop(); }) });
  add('columns-camel-case', 'schema', E('COLUMNS_MISMATCH'), 'netAmount instead of net_amount', { hooks: manifest((m) => { m.reports.R025.columns[4] = 'netAmount'; }) });
  add('columns-reordered', 'schema', E('COLUMNS_MISMATCH'), 'two columns swapped', { hooks: manifest((m) => { const c = m.reports.R003.columns; [c[2], c[3]] = [c[3], c[2]]; }) });
  add('columns-payment-type25', 'schema', E('COLUMNS_MISMATCH'), 'the quarantined payment_type25_amount column', { hooks: manifest((m) => { m.reports.R022.columns.push('payment_type25_amount'); }) });
  for (const name of ['customer_name', 'mobile', 'email', 'pan', 'dob', 'aadhaar', 'address', 'filename', 'phone', 'consumer_id', 'workbook', 'source_name', 'file_path', 'blob', 'base64_data']) {
    add(`columns-forbidden-${name}`, 'schema', E('FIELD_FORBIDDEN'), `column ${name} could identify a person or a file`, { hooks: manifest((m) => { m.reports.R025.columns.push(name); }) });
  }

  /* policy */
  add('role-manager', 'policy', E('EXPORT_ROLE_REFUSED'), 'exported by a Manager role', { hooks: manifest((m) => { m.exportedByRole = 'MANAGER'; }) });
  add('role-lowercase-owner', 'policy', E('EXPORT_ROLE_REFUSED'), 'owner in lower case', { hooks: manifest((m) => { m.exportedByRole = 'owner'; }) });
  const store = (name, code, expected, note) => add(name, 'policy', expected, note, { hooks: scopeHook({ storeCode: code }) });
  store('store-hemw', 'HEMW', E('STORE_HEMW_BLOCKED'), 'HEMW is blocked on the bridge path (Q5)');
  store('store-aw330', 'AW330', E('STORE_REFUSED'), 'the service store is refused');
  store('store-unknown', 'XYZ99', E('STORE_REFUSED'), 'an unknown store code');
  store('store-lowercase', 'wlmhw', E('STORE_REFUSED'), 'lower case store code');
  store('store-hemw-lowercase', 'hemw', E('STORE_REFUSED'), 'lower case HEMW is refused too');
  store('store-leading-space', ' WLMHW', E('STORE_REFUSED'), 'store code with a leading space');
  store('store-trailing-space', 'WLMHW ', E('STORE_REFUSED'), 'store code with a trailing space');
  store('store-hemw-trailing-space', 'HEMW ', E('STORE_REFUSED'), 'HEMW with a trailing space is not HEMW but is still refused');
  store('store-empty', '', E('SCHEMA_INVALID'), 'empty store code is not a usable string');
  store('store-wlmhw-pipe', 'WLMHW|X', E('STORE_REFUSED'), 'store code with a separator');
  const period = (id, patch, expected, note, forgedKey, extra = {}) => add(id, 'policy', expected, note, { hooks: scopeHook(patch, { forgedKey }), ...extra });
  period('period-reversed', { periodStart: '2026-08-22' }, E('PERIOD_INVALID'), 'start after end');
  period('period-cross-fy', { periodStart: '2027-03-15', periodEnd: '2027-04-15' }, E('PERIOD_INVALID'), 'period crosses 31 March', undefined, { verifyOptions: { ...DEFAULT_VERIFY_OPTIONS, today: '2027-05-01' } });
  period('period-fy-wrong', { financialYear: '2025-26' }, E('PERIOD_INVALID'), 'FY does not contain the dates');
  period('period-fy-bad-second-part', { financialYear: '2026-28' }, E('PERIOD_INVALID'), 'FY second part is not first plus one');
  period('period-impossible-date', { periodStart: '2026-02-30', periodEnd: '2026-02-30', financialYear: '2025-26' }, E('PERIOD_INVALID'), '30 February');
  period('period-not-leap-day', { periodStart: '2027-02-29', periodEnd: '2027-02-29', financialYear: '2026-27' }, E('PERIOD_INVALID'), '29 February 2027 does not exist');
  period('period-century-not-leap', { periodStart: '2100-02-29', periodEnd: '2100-02-29', financialYear: '2099-00' }, E('PERIOD_INVALID'), '29 February 2100 does not exist');
  period('period-scope-key-forged', {}, E('PERIOD_INVALID'), 'scopeKey names another month than the parts', 'WLMHW|2026-27|2026-07-01..2026-07-31');
  period('period-before-2024', { periodStart: '2024-03-31', periodEnd: '2024-03-31', financialYear: '2023-24' }, E('PERIOD_INVALID'), 'earlier than 2024-04-01');
  period('period-far-future', { periodStart: '2099-03-31', periodEnd: '2099-03-31', financialYear: '2098-99' }, E('PERIOD_INVALID'), 'a date in 2099');
  period('period-three-days-ahead', { periodStart: '2026-08-22', periodEnd: '2026-08-22' }, E('PERIOD_INVALID'), 'three days after today', undefined, { verifyOptions: { ...DEFAULT_VERIFY_OPTIONS, today: '2026-08-19' } });
  add('period-not-finalised', 'policy', E('PERIOD_INCOMPLETE'), 'finalisedThrough one day before periodEnd', { profile: 'month', hooks: manifest((m) => { m.finalisedThrough = '2026-08-30'; }) });
  add('finalised-after-created', 'policy', E('PERIOD_INVALID'), 'finalisedThrough after the creation date', { profile: 'month', hooks: manifest((m) => { m.finalisedThrough = '2026-09-02'; }) });
  add('created-before-period-end', 'policy', E('PERIOD_INVALID'), 'created before the period ended', { profile: 'month', hooks: manifest((m) => { m.createdAtUtc = '2026-08-30T10:00:00Z'; m.finalisedThrough = '2026-08-30'; }) });
  add('tender-dictionary-mismatch', 'policy', E('TENDER_DICTIONARY_MISMATCH'), 'another dictionary id', { hooks: manifest((m) => { m.tenderDictionaryVersion = 'retail-etp-tender-v9'; }) });

  /* hash */
  add('section-byte-flipped', 'hash', E('HASH_MISMATCH'), 'a digit of an R025 amount changed after hashing and signing', { hooks: { frame: (d) => { d.sectionBytes[3] = Uint8Array.from(d.sectionBytes[3]); const at = textOf(d.sectionBytes[3]).indexOf('100.00'); d.sectionBytes[3][at] = 57; } } });
  add('section-byte-flipped-r022', 'hash', E('HASH_MISMATCH'), 'the same in R022', { hooks: { frame: (d) => { d.sectionBytes[2] = Uint8Array.from(d.sectionBytes[2]); const at = textOf(d.sectionBytes[2]).indexOf('100.00'); d.sectionBytes[2][at] = 57; } } });
  add('section-bytes-field-wrong', 'hash', E('HASH_MISMATCH'), 'manifest bytes field one too high', { hooks: manifest((m) => { m.reports.R013.bytes += 1; }) });
  add('section-sha-field-wrong', 'hash', E('HASH_MISMATCH'), 'manifest sha256 of R003 altered', { hooks: manifest((m) => { m.reports.R003.sha256 = '0'.repeat(64); }) });

  /* rows (hashes and signature rebuilt around the faulty section) */
  const lines = (id, edit) => ({ sections: (d) => lineEdit(d, id, edit) });
  const rowsFault = (id, note, edit, expected = E('ROW_INVALID'), group = 'rows') => add(id, group, expected, note, { hooks: lines('R025', edit) });
  rowsFault('row-extra-column', 'extra customer_name key on the line', (l) => l.map((x) => x.replace(/}$/, ',"customer_name":"X"}')));
  rowsFault('row-missing-column', 'last column missing', (l) => l.map((x) => x.replace(/,"tax_amount":"[^"]*"}$/, '}')));
  rowsFault('row-reordered-columns', 'two columns swapped', (l) => l.map((x) => x.replace('"net_amount":"100.00","brand":"SYNTHETIC_ONLY"', '"brand":"SYNTHETIC_ONLY","net_amount":"100.00"')));
  rowsFault('row-camel-case-column', 'netAmount key', (l) => l.map((x) => x.replace('"net_amount"', '"netAmount"')));
  rowsFault('row-duplicate-key', 'net_amount twice', (l) => l.map((x) => x.replace('"net_amount":"100.00"', '"net_amount":"100.00","net_amount":"1.00"')));
  rowsFault('row-proto-key', '__proto__ key', (l) => l.map((x) => x.replace('"quantity"', '"__proto__":{"polluted":true},"quantity"')));
  rowsFault('row-nested-value', 'an object as a value', (l) => l.map((x) => x.replace('"brand":"SYNTHETIC_ONLY"', '"brand":{"a":1}')));
  rowsFault('row-number-value', 'JSON number instead of a string', (l) => l.map((x) => x.replace('"net_amount":"100.00"', '"net_amount":100.00')));
  rowsFault('row-boolean-value', 'true as a value', (l) => l.map((x) => x.replace('"brand":"SYNTHETIC_ONLY"', '"brand":true')));
  rowsFault('row-null-measure', 'null in a measure', (l) => l.map((x) => x.replace('"net_amount":"100.00"', '"net_amount":null')));
  rowsFault('row-crlf', 'CRLF line ends', (l) => l.map((x) => `${x}\r`));
  add('row-blank-line', 'rows', E('ROW_INVALID'), 'an empty line between two lines', { profile: 'month', hooks: lines('R025', (l) => [l[0], '', ...l.slice(1)]) });
  rowsFault('row-bad-escape', 'an invalid escape', (l) => l.map((x) => x.replace('"cluster":"SYNTHETIC_ONLY"', '"cluster":"a\\qb"')));
  rowsFault('row-control-character', 'an escaped control character in a cell', (l) => l.map((x) => x.replace('"cluster":"SYNTHETIC_ONLY"', '"cluster":"a\\u0001b"')));
  rowsFault('row-lone-quote', 'an unterminated string', (l) => l.map((x) => x.replace('"cluster":"SYNTHETIC_ONLY"', '"cluster":"SYNTHETIC_ONLY')));
  rowsFault('row-leading-space', 'a space before the object', (l) => l.map((x) => ` ${x}`));
  rowsFault('row-trailing-comma', 'a comma before the closing brace', (l) => l.map((x) => x.replace(/}$/, ',}')));
  add('row-no-final-lf', 'rows', E('ROW_INVALID'), 'the last line has no line feed', { hooks: { sections: (d) => { d.sectionBytes[3] = d.sectionBytes[3].subarray(0, d.sectionBytes[3].length - 1); } } });
  add('row-bom', 'rows', E('ROW_INVALID'), 'byte order mark before the first line', { hooks: { sections: (d) => { d.sectionBytes[3] = concat(Uint8Array.of(239, 187, 191), d.sectionBytes[3]); } } });
  add('row-invalid-utf8', 'rows', E('ROW_INVALID'), 'byte 0xFF inside a cell', { hooks: { sections: (d) => { const s = d.sectionBytes[3], at = textOf(s).indexOf('SYNTHETIC_ONLY'); d.sectionBytes[3] = concat(s.subarray(0, at), Uint8Array.of(255), s.subarray(at + 1)); } } });
  add('row-line-too-long', 'rows', E('ROW_INVALID'), 'a line of more than 16384 bytes made of valid cells', { hooks: rowsOf('R025', (rows) => { rows[0].brand = '中'.repeat(4096); rows[0].cluster = '中'.repeat(4096); rows[0].gender = '中'.repeat(4096); }) });
  add('row-text-4097', 'rows', E('ROW_INVALID'), 'a 4097 character cell', { hooks: rowsOf('R025', (rows) => { rows[0].brand = textColumnLength(4097); }) });
  add('row-date-compact', 'rows', E('ROW_INVALID'), 'date as 20260821', { hooks: lines('R025', (l) => l.map((x) => x.replace('"invoice_date":"2026-08-21"', '"invoice_date":"20260821"'))) });
  add('row-date-impossible', 'rows', E('ROW_INVALID'), 'date 2026-02-30', { hooks: rowsOf('R025', (rows) => { rows[0].invoice_date = '2026-02-30'; }) });
  add('row-date-out-of-period', 'rows', E('ROW_OUT_OF_PERIOD'), 'a row dated the day after the period', { profile: 'month', hooks: rowsOf('R025', (rows) => { rows[0].invoice_date = '2026-09-01'; }) });
  add('row-date-before-period', 'rows', E('ROW_OUT_OF_PERIOD'), 'a row dated before the period', { profile: 'month', hooks: rowsOf('R013', (rows) => { rows[0].invoice_date = '2026-07-31'; }) });
  for (const [name, value] of [['lowercase', 'inv'], ['mixed', 'Inv'], ['dotless-i', 'ınv'], ['long-s', 'ſr'], ['other', 'XX'], ['empty', ''], ['padded', 'INV ']]) {
    add(`row-type-${name}`, 'rows', E('ROW_INVALID'), `transaction type ${JSON.stringify(value)}`, { hooks: rowsOf('R025', (rows) => { rows[0].transaction_type_raw = value; }) });
  }
  for (const [name, value] of [['exponent', '1e2'], ['nan', 'NaN'], ['infinity', 'Infinity'], ['minus-infinity', '-Infinity'], ['plus-sign', '+100.00'], ['leading-space', ' 100.00'],
    ['trailing-space', '100.00 '], ['thousands', '1,000.00'], ['negative-zero', '-0.00'], ['no-fraction', '100'], ['trailing-dot', '100.'], ['leading-dot', '.5'], ['three-places', '100.001'],
    ['one-place', '100.0'], ['hex', '0x10'], ['fullwidth', '１００.００'], ['leading-zero', '007.00'], ['twelve-digits', '9999999999.99'], ['empty', ''], ['word', 'abc'], ['double-minus', '--1.00']]) {
    add(`row-money-${name}`, 'rows', E('ROW_INVALID'), `money value ${JSON.stringify(value)}`, { hooks: rowsOf('R025', (rows) => { rows[0].net_amount = value; }) });
  }
  for (const [name, value] of [['two-places', '1.00'], ['four-places', '1.0000'], ['integer', '1'], ['negative-zero', '-0.000'], ['exponent', '1e0']]) {
    add(`row-quantity-${name}`, 'rows', E('ROW_INVALID'), `quantity value ${JSON.stringify(value)}`, { hooks: rowsOf('R025', (rows) => { rows[0].quantity = value; }) });
  }
  add('row-payment-type25-column', 'rows', E('ROW_INVALID'), 'payment_type25_amount on R022 lines', { hooks: { sections: (d) => lineEdit(d, 'R022', (l) => l.map((x) => x.replace(/}$/, ',"payment_type25_amount":"0.00"}'))) } });
  add('row-count-plus-one', 'rows', E('ROW_COUNT_MISMATCH'), 'manifest rowCount one higher than the lines', { hooks: manifest((m) => { m.reports.R025.rowCount += 1; m.reports.R025.zeroActivity = false; }) });
  add('row-count-minus-one', 'rows', E('ROW_COUNT_MISMATCH'), 'manifest rowCount one lower than the lines', { profile: 'month', hooks: manifest((m) => { m.reports.R025.rowCount -= 1; }) });
  add('zero-activity-flag-wrong', 'rows', E('ROW_COUNT_MISMATCH'), 'zeroActivity true with rows present', { hooks: manifest((m) => { m.reports.R025.zeroActivity = true; }) });
  add('extra-line-beyond-manifest', 'rows', E('ROW_COUNT_MISMATCH'), 'one more line than the manifest count', { hooks: { sections: (d) => lineEdit(d, 'R003', (l) => [...l, ...l]) } });

  /* totals (zero tolerance on plain sums) */
  const sums = (id, edit) => manifest((m) => edit(m.reports[id].engineTotals, m.reports[id]));
  const bump = (text, scale, by) => formatBig(unitsBig(text, scale) + by, scale);
  add('totals-net-one-paisa', 'totals', E('TOTALS_MISMATCH'), 'R025 net_amount total one paisa too high (day also still equals)', { hooks: sums('R025', (t) => { t.sums.net_amount = bump(t.sums.net_amount, 2, 1n); }) });
  add('totals-quantity-one-milli', 'totals', E('TOTALS_MISMATCH'), 'R025 quantity total 0.001 too high', { hooks: sums('R025', (t) => { t.sums.quantity = bump(t.sums.quantity, 3, 1n); }) });
  add('totals-tender-one-paisa', 'totals', E('TOTALS_MISMATCH'), 'R022 cash_amount total one paisa too low', { hooks: sums('R022', (t) => { t.sums.cash_amount = bump(t.sums.cash_amount, 2, -1n); }) });
  add('totals-day-sum-off', 'totals', E('TOTALS_MISMATCH'), 'one day sum off while the report total is right', { profile: 'month', hooks: sums('R025', (t) => { t.byDay[1].sums.net_amount = bump(t.byDay[1].sums.net_amount, 2, 1n); }) });
  add('totals-day-row-count-off', 'totals', E('TOTALS_MISMATCH'), 'one day row count off', { profile: 'month', hooks: sums('R025', (t) => { t.byDay[1].rowCount += 1; }) });
  add('totals-day-missing', 'totals', E('TOTALS_MISMATCH'), 'a day with rows left out of byDay', { profile: 'month', hooks: sums('R025', (t) => { t.byDay.pop(); }) });
  add('totals-day-extra', 'totals', E('TOTALS_MISMATCH'), 'a day without rows added to byDay', { profile: 'month', hooks: sums('R025', (t) => { t.byDay.push({ date: '2026-09-30', rowCount: 0, sums: clone(t.sums) });}) });
  add('totals-signed-not-plain', 'totals', E('TOTALS_MISMATCH'), 'the sales return counted negative in the engine totals (plain sums are required)', { profile: 'month', hooks: sums('R025', (t) => { t.sums.net_amount = formatBig(unitsBig(t.sums.net_amount, 2) - 2n * unitsBig('4500.00', 2), 2); }) });
  add('totals-negative-zero', 'totals', E('SCHEMA_INVALID'), 'a sum written -0.00', { hooks: sums('R025', (t) => { t.sums.tax_amount = '-0.00'; }) });
  add('totals-one-place', 'totals', E('SCHEMA_INVALID'), 'a sum written 100.0', { hooks: sums('R025', (t) => { t.sums.net_amount = '100.0'; }) });
  add('totals-17-digits', 'totals', E('SCHEMA_INVALID'), 'a sum with 17 digits', { hooks: sums('R025', (t) => { t.sums.net_amount = '123456789012345.67'; }) });
  add('totals-by-day-unsorted', 'totals', E('SCHEMA_INVALID'), 'byDay not ascending', { profile: 'month', hooks: sums('R025', (t) => { t.byDay.reverse(); }) });
  add('totals-key-extra', 'totals', E('SCHEMA_INVALID'), 'an extra key in sums', { hooks: sums('R025', (t) => { t.sums.discount_total = '0.00'; }) });
  add('totals-key-missing', 'totals', E('SCHEMA_INVALID'), 'a measure missing in sums', { hooks: sums('R025', (t) => { delete t.sums.tax_amount; }) });

  if (includeLarge) {
    add('valid-50000-rows', 'large', ACCEPTED, '50000 rows in R025', { profile: 'month', hooks: rowsOf('R025', (rows) => { rows.length = 0; for (let i = 0; i < 50000; i += 1) rows.push(bigRow(i)); }) });
    add('rows-50001', 'large', E('ROW_LIMIT_EXCEEDED'), '50001 rows in R025', { profile: 'month', hooks: rowsOf('R025', (rows) => { rows.length = 0; for (let i = 0; i < 50001; i += 1) rows.push(bigRow(i)); }) });
    add('file-too-large', 'large', E('FILE_TOO_LARGE'), '33554433 bytes', { bytes: () => concat(bytesOf(FRAME.MAGIC), new Uint8Array(LIMITS.FILE_BYTES + 1 - 8)) });
    add('file-exactly-32-mib-garbage', 'large', E('KEY_UNKNOWN'), 'exactly 32 MiB of a framed file that names an unknown key', { bytes: () => bigGarbageFrame() });
  }

  const cases = [];
  for (const def of defs) {
    const options = def.options;
    let bytes;
    if (options.bytes) bytes = options.bytes();
    else {
      const keyPair = options.signer === 'other' ? keys.other : keys.trusted;
      bytes = await buildPack({ keyPair, profile: options.profile || 'day', date: options.date, hooks: options.hooks || {}, seed: def.id });
    }
    cases.push(Object.freeze({ id: def.id, group: def.group, note: def.note, bytes, expect: Object.freeze({ shipped: SHIPPED_EXPECTATION, withTestKey: def.withTestKey }),
      verifyOptions: Object.freeze({ ...(options.verifyOptions || DEFAULT_VERIFY_OPTIONS) }) }));
  }
  return { anchor: keys.trusted.anchor, otherAnchor: keys.other.anchor, keys, cases };
}

function bigRow(i) {
  const day = String(1 + (i % 28)).padStart(2, '0');
  return { invoice_date: `2026-08-${day}`, invoice_number: String(i).padStart(7, '0'), transaction_type_raw: 'INV', quantity: '1.000', net_amount: '100.00', brand: SYNTH, cluster: SYNTH, gender: SYNTH,
    scheme_discount: '0.00', user_discount: '0.00', tax_amount: '0.00' };
}
function bigGarbageFrame() {
  /* header, a 100 byte manifest area, one section that fills the rest, three empty sections */
  const bytes = new Uint8Array(LIMITS.FILE_BYTES);
  bytes.set(bytesOf(FRAME.MAGIC), 0);
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8], 8);
  bytes[16] = FRAME.SIG_ALG_ECDSA_P256_SHA256;
  bytes.set(u32be(100), 81);
  bytes.set(u32be(LIMITS.FILE_BYTES - 201), 185);
  return bytes;
}

/* A 50,000 row month pack for the performance guard: rows spread over the month, totals and hashes built honestly. */
export async function buildLargePack(keyPair) {
  return buildPack({ keyPair, profile: 'month', seed: 'large', hooks: { rows: (d) => { d.rows.R025 = Array.from({ length: 50000 }, (_, i) => bigRow(i)); } } });
}
export { MEASURE_NAMES, P256_ORDER };
