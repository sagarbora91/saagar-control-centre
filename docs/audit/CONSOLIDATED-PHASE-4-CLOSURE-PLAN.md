# Consolidated Phase 4 Closure Plan

**Date:** 2026-08-12 (Asia/Kolkata)

**Branch:** `agent/modular-phase1-shared-spine-v2`

**Draft review:** PR #5

**Status:** Modular HTML implementation and consolidated Phases 4A/4B are
complete. Phase 4C physical, production and release acceptance remains open.

For intermittent connectivity, execute this plan only through the independently
recoverable units in
`docs/audit/PHASE-4-MICRO-CHECKPOINTS-2026-08-12.md`. Every unit ends in a
validated commit and GitHub push before the next unit begins.

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
- A6-03 passes with zero localization bypasses. Signed 72-cell evidence makes
  A6-04/A6-05 pass, and Sagar's exact-identity rendered-language approval closes
  `GATE-NATIVE-LANGUAGE` for product fingerprint SHA-256
  `47c1e9c04bd94829f8a1987bd49b8466032e12ca6a9248aef9a19dd826a12a06`.
- The complete current product suite passes 510/510. Governed audit tooling
  `29a094757fbc5386d379ee73e71a30228b348308` passes all 75 self-tests.
- The approved comparison for frozen target
  `3f8a37cebf998cf6dd006e3a33de95600d3808f3` has zero findings and all C-01
  through C-09 pass. Its exact 18-file evidence set is preserved at
  `verification/audit/2026-08-16-051618-3f8a37cebf99`.

## Remaining internal work

- Freeze and build the final seeded APK without changing the already-audited
  product target, then record package/version/signature/hash and rerun the local
  API-23 install-replace/emulator smoke against that exact artifact.
- Capture authorized A10-01 shell-parse and A10-02 module-open timings. These are
  nonmandatory in audit v1 but remain explicit Phase 4 exit criteria.

## Trusted and external acceptance still required

- A10-04/A10-05 require exact-APK physical-device five-save latency and
  two-cycle memory evidence.
- Owner acceptance must be repeated on Samsung SM-T875 / Android 13 for the
  final APK hash. Earlier physical acceptance belongs to an older APK.
- Physical API-23/OEM document-provider behavior, remaining low-storage and
  corruption cases, production ETP publication, PAYMENTTYPE25 approval,
  staff/owner UAT, legal review, production signing, and release acceptance
  remain outside autonomous emulator authority.

## Closure sequence

1. Preserve the approved Phase 4B evidence and keep its frozen target immutable.
2. Build the final seeded APK and record its package, version, signature schemes,
   SHA-256, API-23 install-replace, and emulator smoke evidence.
3. Capture A10-01/A10-02 timings and the physical A10-04/A10-05 measurements.
4. Close physical-device, production, UAT, legal, signing, and release gates
   against that exact candidate.

## Exit criteria

Phase 4 is complete only when C-01 through C-09 pass, mandatory A1-A11 checks
are measured without unresolved P0/P1 findings, A10-01/A10-02 have authorized
timings, all ten external gates are closed for the exact final APK, and PR #5
has an evidence-backed merge and release decision.
