import { sign } from 'node:crypto';
import { externalEvidenceSignaturePayload } from './evidence-trust-root.mjs';
import { canonicalSha256 } from './schema.mjs';

export const CAPTURE_ATTESTATION_VERSION = 'saagar-audit-capture-attestation-v1';

export function sealEvidence(unsignedEnvelope) {
  return Object.freeze({ ...unsignedEnvelope, evidenceSha256: canonicalSha256(unsignedEnvelope) });
}

export function signEvidence(sealedEnvelope, keyId, privateKeyPem) {
  if (!sealedEnvelope || typeof sealedEnvelope.format !== 'string' ||
      !/^[a-f0-9]{64}$/.test(String(sealedEnvelope.evidenceSha256 || '')) ||
      typeof keyId !== 'string' || !keyId || typeof privateKeyPem !== 'string' || !privateKeyPem) {
    throw new Error('AUDIT_EVIDENCE_SIGNING_INPUT_INVALID');
  }
  const signatureBase64 = sign(null,
    externalEvidenceSignaturePayload(sealedEnvelope.format, sealedEnvelope.evidenceSha256),
    privateKeyPem).toString('base64');
  return Object.freeze({
    ...sealedEnvelope,
    attestationSignature: Object.freeze({
      format: 'SAAGAR_AUDIT_EXTERNAL_EVIDENCE_SIGNATURE',
      schemaVersion: 1,
      algorithm: 'Ed25519',
      keyId,
      signatureBase64
    })
  });
}

export function renderedObservationSha256(binding, observation) {
  return canonicalSha256({
    format: 'SAAGAR_RENDERED_UI_OBSERVATION',
    schemaVersion: 1,
    binding,
    observation
  });
}

export function browserTimingObservationSha256(binding, observation) {
  return canonicalSha256({
    format: 'SAAGAR_BROWSER_TIMING_OBSERVATION',
    schemaVersion: 1,
    binding,
    observation
  });
}
