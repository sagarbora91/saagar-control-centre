import { verify } from 'node:crypto';
import { TRUSTED_EVIDENCE_SIGNERS } from './trusted-evidence-signers.mjs';

const HEX_64 = /^[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const AUTHORIZED_FORMATS = new Set([
  'SAAGAR_RENDERED_UI_ATTESTATION',
  'SAAGAR_A10_BROWSER_TIMING_ATTESTATION',
  'SAAGAR_A10_DEVICE_RUNTIME_ACCEPTANCE'
]);
const SIGNATURE_FORMAT = 'SAAGAR_AUDIT_EXTERNAL_EVIDENCE_SIGNATURE';

export const EXTERNAL_EVIDENCE_TRUST_POLICY = Object.freeze({
  format: 'SAAGAR_AUDIT_EXTERNAL_EVIDENCE_TRUST_POLICY',
  schemaVersion: 2,
  state: 'open',
  trustedSignerCount: TRUSTED_EVIDENCE_SIGNERS.length,
  algorithms: Object.freeze(['Ed25519']),
  signerKeyIds: Object.freeze(TRUSTED_EVIDENCE_SIGNERS.map(signer => signer.keyId)),
  reason: 'OWNER_PROVISIONED_CONTROLLED_CAPTURE_SIGNER'
});

export function externalEvidenceSignaturePayload(format, evidenceSha256) {
  return Buffer.from(`${SIGNATURE_FORMAT}\n1\n${format}\n${evidenceSha256}`, 'utf8');
}

function exactSignature(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === ['algorithm', 'format', 'keyId', 'schemaVersion', 'signatureBase64'].sort().join('\0') &&
    value.format === SIGNATURE_FORMAT && value.schemaVersion === 1 && value.algorithm === 'Ed25519' &&
    typeof value.keyId === 'string' && value.keyId.length >= 16 && value.keyId.length <= 120 &&
    typeof value.signatureBase64 === 'string' && value.signatureBase64.length <= 256 &&
    BASE64.test(value.signatureBase64);
}

export function verifyExternalEvidenceSignature(format, evidenceSha256, signature,
  trustedSigners = TRUSTED_EVIDENCE_SIGNERS) {
  if (!AUTHORIZED_FORMATS.has(format) || !HEX_64.test(String(evidenceSha256 || '')) ||
      !exactSignature(signature) || !Array.isArray(trustedSigners)) return false;
  const signer = trustedSigners.find(candidate => candidate && candidate.keyId === signature.keyId &&
    candidate.algorithm === signature.algorithm && typeof candidate.publicKeyPem === 'string');
  if (!signer) return false;
  let bytes;
  try {
    bytes = Buffer.from(signature.signatureBase64, 'base64');
    if (bytes.length !== 64 || bytes.toString('base64') !== signature.signatureBase64) return false;
    return verify(null, externalEvidenceSignaturePayload(format, evidenceSha256), signer.publicKeyPem, bytes);
  } catch (_) {
    return false;
  }
}

export function externalEvidenceAuthorized(format, evidenceSha256, signature) {
  return EXTERNAL_EVIDENCE_TRUST_POLICY.state === 'open' &&
    EXTERNAL_EVIDENCE_TRUST_POLICY.trustedSignerCount > 0 &&
    verifyExternalEvidenceSignature(format, evidenceSha256, signature);
}
