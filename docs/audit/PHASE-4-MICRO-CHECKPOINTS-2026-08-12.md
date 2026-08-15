# Phase 4 Micro-Checkpoints

**Date:** 2026-08-12 (Asia/Kolkata)

**Purpose:** make every remaining Phase 4 unit independently recoverable during
poor or intermittent internet connectivity.

## Checkpoint rule

Do not begin the next mini-phase until the current one has:

1. completed its bounded command or external review;
2. preserved its exact evidence in the repository where applicable;
3. passed `git diff --check` and its focused tests;
4. been committed with a single-purpose message;
5. been pushed to `github/agent/modular-phase1-shared-spine-v2`; and
6. recorded its resume identity in `docs/audit/HANDOFF.md`.

External audit output is never called complete merely because a process ended.
The expected files, manifest identity, byte counts, and SHA-256 values must be
validated first.

## P4.1 - Controlled baseline evidence

**Entry:** pushed checkpoint `4a30923`; governed tooling
`bdce23f3e631941a8ad9a288572b604d3fddf74e`; clean detached tooling worktree.

**Work:** run one controlled baseline containing the full product suite, six
mutations, and two independently prepared Android builds. A failed/interrupted
run with no 18-file evidence directory is discarded without changing Git.

**Exit:** validate exactly 18 evidence files and all manifest hashes; commit only
`verification/audit/<baseline-run-id>`; push immediately.

## P4.2 - Final target freeze

**Entry:** P4.1 evidence is committed and pushed.

**Work:** verify the Phase 4 handoff, 107-row capability ledger, seeded APK
record, and product-bound profiles. Rerun the complete product and audit-tooling
suites. Make no further product changes afterward.

**Exit:** clean target commit with product suite 510/510 and tooling suite 69/69
or later exact passing totals; record the target SHA; push immediately.

## P4.3 - Unapproved controlled comparison

**Entry:** clean detached worktree at the exact P4.2 target; committed P4.1
baseline; governed tooling is an ancestor and byte-identical.

**Work:** run the comparison without reusing an old approval. Validate its exact
18-file evidence set and extract C-01 through C-09, capability count/delta hash,
baseline-manifest SHA-256, target SHA, and tooling SHA.

**Exit:** commit the unapproved comparison evidence as an administrative
evidence commit, update the handoff with the exact approval sentence, and push.

## P4.4 - Capability approval closure

**Entry:** user supplies approval bound to the exact P4.3 identities. The prior
106-row approval is not reusable; the current product inventory has 107 rows.

**Work:** preserve the approval envelope and rerun the comparison from the same
frozen P4.2 target.

**Exit:** C-02/C-03 reflect the identity-bound approval; commit approved
comparison evidence and push.

## P4.5 - Localization and trusted UI closure

**Entry:** comparison evidence is stable.

**Work:** handle A6-03 as small genuine translation batches. Each batch is a
separate focused-test/commit/push checkpoint and records its exact occurrence
reduction. Do not fabricate translations or add analyzer exclusions. Separately
capture A6-04/A6-05 only through an identity-bound trusted renderer and fluent
Marathi/Hindi review, or record an explicit owner disposition allowed by the
audit authority.

**Exit:** A6-03/04/05 pass or have an explicit valid disposition; every language
batch and external evidence item is independently committed and pushed.

## P4.6 - Exact-APK device and performance acceptance

**Entry:** seeded APK SHA-256
`B65AA97563BDD6217753FD95AB456624AD71FFACBDA2F120088C00E3F91CAD20`;
API-23 emulator engineering evidence is already preserved.

**Work:** collect owner SM-T875/Android-13 update evidence, physical API-23/OEM
document-provider behavior, remaining interruption/low-storage/corruption
cases, A10 timing, five-save DAT-02 latency, and two memory cycles. Preserve and
push each evidence class separately so one interrupted activity does not lose
the others.

**Exit:** exact-APK physical and performance gates are measured and accepted.

## P4.7 - Production and release authority

**Entry:** engineering, comparison, capability, UI, and physical-device evidence
is complete.

**Work:** production ETP publication, PAYMENTTYPE25 decision, staff/owner UAT,
legal review, production signing, and final release acceptance.

**Exit:** all ten external gates are closed, PR #5 has an evidence-backed merge
decision, and the production release identity is preserved and pushed.

## Current resume point

- The current-tooling 18-file baseline is preserved at
  `verification/audit/2026-08-15-102206-18dcb9e5db5d` by evidence commit
  `976547823520601538b943ae38fb1c89ee94eba4`. Manifest SHA-256 is
  `5153d6dee330cf2fb16b6fc4d6a0d11df77aa4544b47a10d5909ad7453c7771f`.
- Governed tooling is `29a094757fbc5386d379ee73e71a30228b348308` and passes
  75/75 in its frozen tooling worktree. Its bytes are identical in the product
  branch and it is an ancestor of the current product commit.
- A9-02 code remediation is committed and pushed at
  `fa1120c1a026d1525c2eb555a6aa8e29ce7e5b38`. A real seeded build proves the
  canonical, generated and APK-contained `build-identity.js` SHA-256 values are
  identical. The complete product suite passes 510/510.
- The prefreeze diagnostic APK is 7,269,978 bytes with SHA-256
  `D4C76C5D567899E1D29FD7AFA9007D0A255CCDEEF161CA1AA1B62E6937AEDEDF`;
  API-23 install-replace/launch passes with zero fatal-log matches.
- Current consolidated phase: 4A. A6-03 passes with zero bypasses after the
  approved 854-row import, and A6-04/A6-05 pass with committed signed rendered
  evidence. Sagar's exact-identity fluent visual approval is recorded and
  `GATE-NATIVE-LANGUAGE` is closed. Phase 4A is complete.
- Resume authorization recorded 2026-08-14: Sagar (`sagarbora91`) will act as
  the fluent Marathi/Hindi reviewer and authorizes a dedicated local
  audit-evidence signing key, with only its public key committed and its private
  key kept outside the repository.
- Signer provisioning is complete. The private Ed25519 key is outside Git with a
  user-only Windows ACL; the governed public key ID is
  `phase4a-renderer-ed25519-9ec3b61bbbdb245f`, public PEM SHA-256
  `9ec3b61bbbdb245ff1582941bc699a30c116645ee82814f1d0f5d46e2162faa0`.
- Translation batch 01 was reviewed/imported at `fca6924`: 24 phrases reduced
  A6-03 from 1,226 to 1,145. Batch 02 was reviewed/imported at `38e4400`: 100
  phrases covering 165 direct source occurrences reduced A6-03 from 1,145 to
  969 and increased the dictionary from 950 to 1,050 phrases. Its approved CSV
  SHA-256 is `1714079428cafa681d1ab51a2f947c8f473a84b790e59a3cd23349a8e0ae788a`.
- Batch 03 was reviewed/imported at `12292ef`: 100 phrases/occurrences reduced
  A6-03 from 969 to 862 and increased the dictionary from 1,050 to 1,150. Its
  approved CSV SHA-256 is
  `9732d776cff4f38c5c17767552097d09c425dc272bed3f6dfa7c08ea8fc5ed2d`.
- Batch 04 is superseded by one consolidated final review package. Sagar
  approved its 854-row primary CSV, pre-review SHA-256
  `06215985a5001b71c06358cda1d1ef02c10e51df9534433fd5171f024bdfdcf7`;
  it was imported at `2f69a9a0d32d989b0c9be88168bd2d38eda20851`, and
  its post-import SHA-256 is
  `7bf300588c9f084739d481bfb65d2d60c32823f6e6121fe65b64401e7116a277`.
  Its derived 100-row
  attention CSV has SHA-256
  `afe375f8dd30f0540feeca9edcdc5506fab025b6c80dc16c371a5ef952d24011`.
  The exact pre-import product checkpoint is `832c9b612af4739908ad04c4521e9999bd86e5e6`.
- The corrected-tooling baseline is preserved by evidence commit
  `bed4c629d8f0835f93c64328c4ab2f3bfbf4dc40` at
  `verification/audit/2026-08-15-203000-29a094757fbc`. Manifest SHA-256 is
  `b878f01cf7c54f1cad935ae092c6ac042ce88bed8aad6f23c5e2d12051b78468`;
  all 18 manifest-bound files validated.
- Exact resume order: (1) capture the signed 72-cell A6-04/A6-05 rendered
  matrix against clean product commit `2f69a9a0d32d989b0c9be88168bd2d38eda20851`;
  (2) remediate measured UI violations and recapture until the audit gates pass;
  and (3) obtain Sagar's separate identity-bound fluent visual approval.

### Rendered-remediation crash checkpoint — 2026-08-15

- The first complete post-import diagnostic at target `e9795999bcbdd1e8ccc3c56716755f133f1e5984`
  measured all 72 cells and found 163 target-size plus 1,695 contrast violations.
  It is not passing closure evidence.
- Remediation commit `06b9d74380e2cc1c939ed70f8286b616f76ab86f` is committed,
  pushed and clean. It updates the shell and affected modules, regenerates all
  governed product/profile identities, keeps A6-03 at zero bypasses and retains
  the 107-row capability delta set.
- Same-algorithm bounded checks are zero/zero for the six shell cells and 48
  assigned module cells. CRO/payroll/tax fixes are present and focused tests
  pass, but only the next full signed 72-cell run can establish the combined
  result.
- Resume exactly by running the complete signed Edge capture against
  `06b9d74380e2cc1c939ed70f8286b616f76ab86f` with governed tooling
  `29a094757fbc5386d379ee73e71a30228b348308`. If any violations remain, fix and
  repeat; if zero, commit the attestation, validate A6-04/A6-05, then request the
  separate exact-identity fluent visual approval.

### Passing rendered-evidence checkpoint — 2026-08-16

- Final rendered product commit: `833941efec4daebc47fc6a75007578168ac6b6aa`;
  product fingerprint SHA-256
  `68eef06d732509c29f278feb626f7feaf67b5030a70eb5994780bf7e681b6936`.
- The complete signed Edge matrix contains 72/72 cells, 2,394 measured targets,
  6,105 contrast samples, zero target violations, zero contrast violations and
  zero browser errors. Matrix SHA-256 is
  `db8872543dbe55ce461835bc4288946822dd21c8406adab86d75e046558431ff`;
  rendered evidence SHA-256 is
  `66fde8537b9ff15e78d77d35ee92403df795c67ee7f4f26c5d43b8cc809ff6a0`.
- Attestation file SHA-256
  `e4b3cdffe345966a0686a2c031359aa03eeb544b7f9a1421b57172dc48297d83`
  is committed and pushed at `68f5bc94e944f70fef3d41f9140af33bdfc86fab`.
  Independent validation reports a clean tracked record, valid Ed25519
  signature, A6-04 pass and A6-05 pass.
- Resume only with Sagar's review of all 72 rendered cells, including all 48
  Marathi/Hindi cells. Record an exact-identity fluent visual approval; do not
  treat the automated rendered pass as language acceptance by itself.

### Phase 4A closure checkpoint — 2026-08-16

- Sagar (`sagarbora91`) approved all 72 rendered cells, including all 48
  Marathi/Hindi cells, bound to product `833941efec4daebc47fc6a75007578168ac6b6aa`,
  product fingerprint, rendered-evidence SHA-256 and matrix SHA-256.
- The verbatim exact-identity approval is preserved at
  `verification/audit/approvals/PHASE-4A-NATIVE-LANGUAGE-APPROVAL-2026-08-16.json`.
  `GATE-NATIVE-LANGUAGE` is closed for that identity. This does not close any
  physical-device, UAT, legal, signing or release gate.
- Phase 4A is complete. Resume with Phase 4B: freeze the final comparison target,
  run the unapproved controlled comparison against the corrected-tooling
  baseline, validate its 18-file evidence set, and obtain a new exact capability
  approval for the resulting target/tooling/baseline/delta identity.

### Phase 4B diagnostic and repair checkpoint — 2026-08-16

- Diagnostic comparison target
  `065e2e55ad3658ffaef52ce5b0ef9a1f72cdee42` produced and validated 18 external
  evidence files. C-01 and C-04 through C-09 pass; C-02/C-03 remain deliberately
  unapproved.
- The comparison found new P1 `A5-03`: tracked
  `tests/a6-analyzer-noise-source-regression.test.mjs` was not registered by a
  package test command. New P0/P1 findings cannot be waived by C-03, so this
  diagnostic comparison must not proceed to approval.
- Register all three cases in `test:language`, run the resulting 510-test product
  pipeline, commit and push. This product-only repair preserves tooling
  `29a094757fbc5386d379ee73e71a30228b348308` and corrected baseline manifest
  SHA-256 `b878f01cf7c54f1cad935ae092c6ac042ce88bed8aad6f23c5e2d12051b78468`.
- Since `package.json` changes product fingerprint, recapture/sign all 72 UI
  cells and obtain a renewed exact-identity fluent approval. Only then freeze a
  new target and rerun the unapproved comparison.
