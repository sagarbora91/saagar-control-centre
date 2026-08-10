export const EXTERNAL_EVIDENCE_TRUST_POLICY = Object.freeze({
  format: 'SAAGAR_AUDIT_EXTERNAL_EVIDENCE_TRUST_POLICY',
  schemaVersion: 1,
  state: 'closed',
  trustedSignerCount: 0,
  reason: 'CONTROLLED_CAPTURE_SIGNER_NOT_PROVISIONED'
});

export function externalEvidenceAuthorized() {
  return false;
}

