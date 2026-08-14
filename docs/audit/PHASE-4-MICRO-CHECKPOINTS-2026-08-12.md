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

- The current-tooling 18-file baseline is preserved at
  `verification/audit/2026-08-14-182855-5a20fe5ebf53` by evidence commit
  `b0657241496591f89256e87572fa2b23954aa3d1`. Manifest SHA-256 is
  `08b9f55085f9d04c025610b5c969611b618838d8376ac204bbf7a45a492fcf82`.
- Governed tooling is `5a20fe5ebf534201cb24dd6602f6a9ed9a5c050c` and passes
  73/73 in its frozen tooling worktree. Its bytes are identical in the product
  branch and it is an ancestor of the current product commit.
- A9-02 code remediation is committed and pushed at
  `fa1120c1a026d1525c2eb555a6aa8e29ce7e5b38`. A real seeded build proves the
  canonical, generated and APK-contained `build-identity.js` SHA-256 values are
  identical. The complete product suite passes 507/507.
- The prefreeze diagnostic APK is 7,269,978 bytes with SHA-256
  `D4C76C5D567899E1D29FD7AFA9007D0A255CCDEEF161CA1AA1B62E6937AEDEDF`;
  API-23 install-replace/launch passes with zero fatal-log matches.
- Current consolidated phase: 4A. It remains blocked on mandatory A6-03
  (1,226 genuine bypasses) and trusted A6-04/A6-05 rendered evidence. Do not
  freeze the target or begin the comparison until these product/language gates
  are genuinely closed.
