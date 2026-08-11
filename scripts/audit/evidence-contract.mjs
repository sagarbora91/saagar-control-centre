import { execFileSync } from 'node:child_process';
import { posix, sha256 } from './lib.mjs';
import { canonicalSha256 } from './schema.mjs';
import { externalEvidenceAuthorized, EXTERNAL_EVIDENCE_TRUST_POLICY } from './evidence-trust-root.mjs';

export const CAPTURE_PRODUCER_PATH = 'scripts/audit/capture-attestation.mjs';
export const EVIDENCE_PROTOCOL_PATH = 'scripts/audit/evidence-contract.mjs';
export const RENDERED_RECORD_PREFIX = 'verification/audit/attested/rendered-ui/';
export const TIMING_RECORD_PREFIX = 'verification/audit/attested/browser-timing/';
export const DEVICE_RECORD_PREFIX = 'verification/audit/accepted/device-runtime/';

const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const RECORD_NAME = /^[a-z0-9][a-z0-9-]{10,119}\.json$/;

export function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isHex40(value) {
  return HEX_40.test(String(value || ''));
}

export function isHex64(value) {
  return HEX_64.test(String(value || ''));
}

export function validUtcTimestamp(value) {
  if (typeof value !== 'string' || value.length > 32) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function canonicalFingerprint(value) {
  try { return canonicalSha256(value); } catch (_) { return null; }
}

function gitBlob(context, revision, file) {
  if (!context || !context.root || !isHex40(revision)) return null;
  const safePath = posix(file);
  if (!safePath || safePath.startsWith('/') || safePath.includes('..') || /[\r\n\0]/.test(safePath)) return null;
  try {
    return execFileSync('git', ['-C', context.root, 'show', `${revision}:${safePath}`], {
      encoding: null,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (_) {
    return null;
  }
}

function toolingSourceSha256(context, file) {
  const toolingSha = context && context.options && context.options.auditToolingSha;
  const bytes = gitBlob(context, toolingSha, file);
  return bytes ? sha256(bytes) : null;
}

export function expectedCaptureTool(context) {
  return Object.freeze({
    producerPath: CAPTURE_PRODUCER_PATH,
    producerSha256: toolingSourceSha256(context, CAPTURE_PRODUCER_PATH),
    protocolPath: EVIDENCE_PROTOCOL_PATH,
    protocolSha256: toolingSourceSha256(context, EVIDENCE_PROTOCOL_PATH)
  });
}

export function validateCaptureTool(context, value) {
  const expected = expectedCaptureTool(context);
  return exactObject(value, ['producerPath', 'producerSha256', 'protocolPath', 'protocolSha256']) &&
    isHex64(expected.producerSha256) && isHex64(expected.protocolSha256) &&
    value.producerPath === expected.producerPath && value.producerSha256 === expected.producerSha256 &&
    value.protocolPath === expected.protocolPath && value.protocolSha256 === expected.protocolSha256;
}

function validRecordPath(value, prefix) {
  if (typeof value !== 'string' || value !== posix(value) || !value.startsWith(prefix)) return false;
  const name = value.slice(prefix.length);
  return RECORD_NAME.test(name) && !name.includes('/');
}

export function committedRecordMatches(context, raw, prefix) {
  if (!raw || !validRecordPath(raw.recordPath, prefix) || !Array.isArray(context.files) ||
      !context.files.includes(raw.recordPath) || !isHex40(context.head)) return false;
  const bytes = gitBlob(context, context.head, raw.recordPath);
  if (!bytes || bytes.length > 8 * 1024 * 1024) return false;
  try {
    const committed = JSON.parse(bytes.toString('utf8'));
    return canonicalFingerprint(committed) === canonicalFingerprint(raw);
  } catch (_) {
    return false;
  }
}

export function loadCommittedRecord(context, recordPath, prefix) {
  if (!validRecordPath(recordPath, prefix) || !Array.isArray(context.files) ||
      !context.files.includes(recordPath) || !isHex40(context.head)) return null;
  const bytes = gitBlob(context, context.head, recordPath);
  if (!bytes || bytes.length > 8 * 1024 * 1024) return null;
  try { return JSON.parse(bytes.toString('utf8')); } catch (_) { return null; }
}

export function evidenceSealValid(value) {
  if (!value || !isHex64(value.evidenceSha256)) return false;
  const { evidenceSha256, ...unsigned } = value;
  return canonicalFingerprint(unsigned) === evidenceSha256;
}

export function baseEvidenceTrust(context, value, { format, schemaVersion, recordPrefix,
  requireCurrentProduct = true } = {}) {
  const findings = [];
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== format ||
      value.schemaVersion !== schemaVersion) findings.push({ code: 'ATTESTED_EVIDENCE_FORMAT_INVALID' });
  if (!value || value.auditToolingSha !== (context.options && context.options.auditToolingSha) ||
      !isHex40(value.auditToolingSha)) findings.push({ code: 'ATTESTED_EVIDENCE_TOOLING_IDENTITY_INVALID' });
  if (!value || !isHex64(value.productFingerprintSha256) ||
      (requireCurrentProduct && value.productFingerprintSha256 !== context.productFingerprint.treeSha256)) {
    findings.push({ code: 'ATTESTED_EVIDENCE_PRODUCT_IDENTITY_INVALID' });
  }
  if (!value || !validUtcTimestamp(value.capturedAt)) findings.push({ code: 'ATTESTED_EVIDENCE_TIMESTAMP_INVALID' });
  if (!value || !validateCaptureTool(context, value.captureTool)) {
    findings.push({ code: 'ATTESTED_EVIDENCE_CAPTURE_TOOL_INVALID' });
  }
  if (!value || !evidenceSealValid(value)) findings.push({ code: 'ATTESTED_EVIDENCE_SEAL_INVALID' });
  if (!value || !committedRecordMatches(context, value, recordPrefix)) {
    findings.push({ code: 'ATTESTED_EVIDENCE_COMMITTED_RECORD_REQUIRED' });
  }
  const integrityValid = findings.length === 0;
  const integrityFindings = [...findings];
  const authorized = externalEvidenceAuthorized(format, value && value.evidenceSha256);
  if (!authorized) findings.push({ code: 'ATTESTED_EVIDENCE_TRUST_ROOT_UNAVAILABLE',
    reason: EXTERNAL_EVIDENCE_TRUST_POLICY.reason });
  return Object.freeze({ trusted: integrityValid && authorized, integrityValid, integrityFindings,
    authorized, findings, trustPolicy: EXTERNAL_EVIDENCE_TRUST_POLICY.state,
    captureTool: expectedCaptureTool(context) });
}

