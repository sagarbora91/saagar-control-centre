import { canonicalSha256 } from './schema.mjs';

export const CAPTURE_ATTESTATION_VERSION = 'saagar-audit-capture-attestation-v1';

export function sealEvidence(unsignedEnvelope) {
  return Object.freeze({ ...unsignedEnvelope, evidenceSha256: canonicalSha256(unsignedEnvelope) });
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

