# Consolidated Phase 4 Closure Plan

**Date:** 2026-08-12 (Asia/Kolkata)

**Branch:** `agent/modular-phase1-shared-spine-v2`

**Draft review:** PR #5

**Status:** Modular HTML implementation is complete. Phase 4 audit and release
closure is still open.

## Completed internal remediation

- A2 duplication/coupling, A7 message contracts, and A8 security-policy checks
  pass against the current product with fail-closed analyzer coverage.
- The A5 mutation cleanup, C-04 storage inventory/comparator, A7 lifecycle, A8
  scanner, controlled Gradle bootstrap, and evidence-closure defects have been
  corrected with regression coverage.
- Retail ETP import remains exclusively in Reports. Reports now present bounded
  R003/R013 reconciliation exceptions and explicitly state that they do not
  change revenue or sales totals.
- API-23 emulator engineering checks pass for fresh install, install-replace,
  preserved seeded state, process restart, activity recreation, and rotation.

## Remaining internal work

- A6-03 still fails with 1,226 high-confidence localization bypass occurrences
  after two genuine Marathi/Hindi translation batches. This is product
  localization debt, not an analyzer-exclusion exercise.
- Freeze the independently reviewed Windows process-tree cleanup fix, rerun the
  controlled two-build baseline, commit its immutable evidence, and rerun the
  comparison against the final documented target.
- Rerun the complete product suite and audit-tooling self-test from clean frozen
  identities.
- Build and hash a new seeded APK after the remaining product changes are frozen,
  then repeat API-23 install-replace and smoke checks against that exact hash.

## Trusted and external acceptance still required

- A6-04/A6-05 rendered accessibility and responsive evidence require a frozen,
  identity-bound trusted renderer; the current audit trust store deliberately
  has no trusted signer.
- A10-01/A10-02 have static size evidence but no authorized parse/open timing
  samples. A10-04/A10-05 require exact-APK physical-device save-latency and
  memory-cycle evidence.
- Owner acceptance must be repeated on Samsung SM-T875 / Android 13 for the
  final APK hash. Earlier physical acceptance belongs to an older APK.
- Physical API-23/OEM document-provider behavior, remaining low-storage and
  corruption cases, production ETP publication, PAYMENTTYPE25 approval, fluent
  Marathi/Hindi review, staff/owner UAT, legal review, production signing, and
  release acceptance remain outside autonomous emulator authority.
- A new identity-bound owner capability approval is required after the final
  target, governed tooling SHA, baseline-manifest SHA-256, and comparison-delta
  SHA-256 are known. The current fail-closed ledger has 107 rows and comparison
  delta SHA-256
  `6179252efa5110d96c46be8544f275c46dfb5f14f8d46f4b46a194fc6f2a6420`.
  The earlier 106-row approval is immutable and stale for this target.

## Closure sequence

1. Finish safe internal localization batches and freeze the product.
2. Freeze reviewed audit tooling and produce a valid controlled baseline.
3. Commit the baseline and this current handoff, then freeze the target commit.
4. Run the controlled comparison without reusing a stale approval.
5. Obtain the owner's exact identity-bound capability approval and rerun the
   approval-aware comparison.
6. Build the final seeded APK and record its package, version, signature schemes,
   SHA-256, API-23 install-replace, and emulator smoke evidence.
7. Close trusted-renderer, physical-device, production, language, UAT, legal,
   signing, and release gates against that exact candidate.

## Exit criteria

Phase 4 is complete only when C-01 through C-09 pass, mandatory A1-A11 checks
are measured without unresolved P0/P1 findings, A10-01/A10-02 have authorized
timings, all ten external gates are closed for the exact final APK, and PR #5
has an evidence-backed merge and release decision.
