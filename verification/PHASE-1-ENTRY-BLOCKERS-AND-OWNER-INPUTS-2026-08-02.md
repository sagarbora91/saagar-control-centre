# SAAGAR Android - Phase 1 entry blockers and owner inputs

**Date:** 2026-08-02  
**Formal Phase 1 status:** **BLOCKED AT ENTRY**

Phase 1 comprises D1, E1, E2, D2, and D3. D1-D3 have substantial local
engineering and automated evidence, but no package has formal acceptance.
E1 remains a no-write policy foundation; E2 cannot start until E1 produces an
accepted, reconciled, both-store import.

## Blocking prerequisites

1. Phase 0 physical and operational acceptance must close under
   `PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md`.
2. Supply one real HEMW export for each report: R022, R025, R013, and R003.
   Files remain outside Git; only sanitized headers and aggregate metadata may
   enter repository evidence.
3. Approve report dictionaries for both WLMHW and HEMW:
   identifiers, measures, transaction types, tender fields, privacy drops,
   required fields, grains, and dictionary version.
4. Approve R022-to-R025 reconciliation: common grain, exact comparison fields,
   rounding, tolerance, duplicate treatment, and refusal behavior.
5. Approve deterministic date policy: earliest supported business date and
   allowed future-day skew.
6. Select an XLSX parser only after licensing, security, APK-size, memory,
   malformed-file, and Android API-23 tests.
7. Deliberately promote the reviewed E1 replacement into canonical files while
   retaining batch metadata and idempotency identity behavior.

## Work prohibited until those gates close

- production workbook parsing;
- sealed ETP SQLite schema/persistence;
- staged publication/atomic swap;
- import UI and file picker;
- schema/header freeze;
- E2 verified-through views;
- production Phase 1 APK claims.

## Inputs required from the owner now

- HEMW R022/R025/R013/R003 workbooks;
- decision owner for dictionary and reconciliation approval;
- earliest permitted ETP business date;
- permitted future skew in days;
- confirmation whether unknown transaction types reject the whole batch or are
  retained as explicit no-effect warnings pending approval;
- completion evidence for the Phase 0 two-device and operational gates.

No customer/staff values, provider URIs, PINs, passphrases, or signing material
may be placed in Git or shared evidence.
