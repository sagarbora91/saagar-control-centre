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

**Exit:** clean target commit with product suite 507/507 and tooling suite 69/69
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

- P4.1 is complete. The exact 18-file baseline is preserved at
  `verification/audit/2026-08-12-220812-bdce23f3e631` by evidence commit
  `359d46718aab65d85b8466b6424c6a9a31381727`.
- Baseline manifest SHA-256:
  `98da4fb01548784878f29b9c423f8c935d63b042c011868796b017e331b1b5c5`.
  Target/tooling identity is
  `bdce23f3e631941a8ad9a288572b604d3fddf74e`; all 18 files, declared byte
  counts, and artifact SHA-256 values validated before preservation.
- Governed tooling passes all 72 audit-tooling tests. Both controlled builds
  used independent detached worktrees, dependency installs, writable Gradle
  homes and daemons. They used a full-closure-verified Gradle distribution and
  hash-bound read-only dependency cache in offline mode.
- A9 is measured: A9-01, A9-03, A9-04 and A9-05 pass. Both APKs are exactly
  identical at 6,999,062 bytes with SHA-256
  `af044411e24b364381ab89ca1130f707303511bf53a64e052f44e4f5c0cb7387`.
  A9-02 is a measured fail because API-23 preparation Babel-transforms the
  packaged `build-identity.js`, so its packaged hash differs from the canonical
  source hash even though all parsed identity fields agree.
- Current mini-phase: P4.2. Safe next action: resolve the A9-02 generated
  identity-hash contract without weakening identity-field checks, rerun focused
  and complete suites, and only then freeze the final target. Do not begin P4.3
  before the P4.2 target commit is pushed.
