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

- The exact debug-UAT seeded candidate is built and its API-23 install-replace,
  preserved-state, recreation, rotation and bounded ETP interruption checks
  pass. Preserve its SHA-256
  `F4DDBC1D210AC0FB722333741085FF81B4D20C5B2523DB72ED6ACF2F1B510AED`
  for all remaining acceptance.
- Fix the fail-open A10-01 audit implementation and the measured shell p95
  regression. Strict diagnostics show shell p95 +10.842% (FAIL against +5%)
  while module-open p95 improves 11.789% (A10-02 diagnostic PASS). Recapture
  both only after the final governed tooling/product identities are frozen.

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
2. Complete A10-01 tooling/product remediation and the final governed timing
   evidence cycle.
3. Capture the physical A10-04/A10-05 measurements against the exact candidate.
4. Close physical-device, production, UAT, legal, signing, and release gates
   against that exact candidate.

## Exit criteria

Phase 4 is complete only when C-01 through C-09 pass, mandatory A1-A11 checks
are measured without unresolved P0/P1 findings, A10-01/A10-02 have authorized
timings, all ten external gates are closed for the exact final APK, and PR #5
has an evidence-backed merge and release decision.
