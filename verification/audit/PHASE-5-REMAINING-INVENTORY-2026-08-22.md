# Phase 5 remaining-work inventory — 2026-08-22

> **Superseded historical snapshot.** This inventory predates the owner reviews,
> corrected APK, SM-T875 update/DAT-02/memory sessions and the explicit `a104f5f`
> approval rebind. Do not use its OPEN rows or 438-test count as current state.
> The authoritative resume inventory is `docs/audit/HANDOFF.md` at checkpoint
> `2347f6b` or later. The body below is retained as then-accurate history.

**Branch/HEAD:** `agent/modular-phase1-shared-spine-v2` at `efc7262`.
**Refreshed 2026-08-22** after the visual capture, rendered-language matrix and
SM-T875 session landed. The original inventory was pinned at `f29b558` and
understated progress: items 1 and 4 below have since been completed.

**Purpose:** record exactly what Sagar completed after the ETP implementation
checkpoint and what still blocks final release closure. This inventory does not
rerun, replace or reinterpret preserved evidence.

## Completed by Sagar

1. **ETP product implementation**
   - Reports-owned twelfth module, bounded parent gateway, trusted per-call
     authorization, four-file import/publication, history, restore fencing and
     verified R003/R013/R022/R025 presentation are implemented.
   - PAYMENTTYPE25 remains excluded from classified tender reporting.
   - ETP shared-runtime protections, audit bridge, home navigation and responsive
     containment were repaired and merged.

2. **ETP localization**
   - All 119 reviewed rows were owner-approved and imported.
   - 102 new global phrase triples were added; 2 approved phrases already matched;
     12 rows remain exact literals; 3 shared phrases correctly retain the earlier
     Phase 4A wording rather than silently changing other modules.
   - Focused results: `test:etp` 155/155 and `test:language` 10/10.

3. **Identity and protection regeneration**
   - MAH-4 is regenerated for 12 modules and passes 46/46.
   - MH1 includes ETP as a high-risk module and its protection checks pass.
   - MAH-3 contract honestly expands from 168 to 180 cases; the 12 new ETP rows
     remain explicitly uncaptured rather than being marked green without evidence.

4. **Capability-ledger closure (Phase 5B)**
   - Capability inventory moved from 660 to 680.
   - Sagar approved the exact 17 ETP-related capability deltas.
   - The complete ledger contains 129 baseline-to-current deltas and delta SHA-256
     `155d95fedb479c36cca3cd1b63c720a40f149374d9235bf68a903cf4bf40dd28`.
   - `test:modular` is 86/86.

5. **PAYMENTTYPE25 business disposition**
   - Sagar approved continued quarantine until an authoritative Helios mapping is
     available. The standalone approval is committed; the final identity-bound
     closure register still needs to incorporate it.

6. **Current verified suite sweep**
   - 438 tests passed with zero failures: modular 86, MAH-4 46, MAH-3 19,
     ETP 155, security 100, manifest 8, language 10, mobile 6 and settings 8.

## Remaining inventory

| Order | Item | State / blocker | Required authority or input |
|---:|---|---|---|
| 1 | Capture MAH-3 cases 169–180 for ETP | **DONE** — captured in a visible browser. All 12 screenshot hashes and the manifest hash `d1a47b0b…` independently re-verified | complete |
| 2 | Review the 12 ETP visual cases | **OPEN** after capture | Fluent/visual owner reviewer |
| 3 | Restore `visualBaselinesCaptured` and dependent MAH-3/MAH-4 gate fields | **OPEN** after all 12 cases pass review | Engineering, using exact reviewed evidence |
| 4 | Produce the rendered-language attestation | **DONE** — **78** cells (cardinality now derived, not 72), 2,463 target and 6,303 contrast measurements, zero violations. Ed25519 signature independently verified valid and authorized | complete |
| 5 | Identity-bound fluent approval of the rendered matrix | **OPEN** after item 4 | Sagar as fluent Marathi/Hindi reviewer |
| 6 | Review R003/R013 exception presentation | **OPEN** | Sagar/owner; confirm bounded exceptions remain intelligible and non-revenue |
| 7 | Freeze post-evidence identity and build one seeded APK | **OPEN** after items 1–6 | Engineering |
| 8 | Physical install-replace/update acceptance | **OPEN** | Named physical-device tester/owner |
| 9 | Physical/OEM ETP import and interruption/low-storage acceptance | **OPEN** | Real API-23-class OEM device and named tester |
| 10 | Production four-report ETP publication | **OPEN** | Authorized WLMHW/HEMW source set, production-data custodian and owner |
| 11 | Staff UAT and privacy/legal acceptance | **OPEN** — placeholder identities are invalid | Named staff tester and named privacy/legal reviewer |
| 12 | Production signing and independent release decision | **OPEN** — current artifact is debug-signed | Named signing custodian, production key and a different named release approver |
| 13 | Final controlled audit/comparison and closure-register/HANDOFF update | **OPEN** after all prior identity-bound evidence and decisions | Engineering |

## Carried exceptions that remain visible

- `A10-01`: shell parse `+7.559%` against the `+5%` limit; owner-accepted P2.
- `A10-04`: physical DAT-02 save-latency evidence remains unmeasured and has
  both APK-binding and missing-producer blockers.
- `A10-05`: physical retained-memory evidence remains unmeasured with the same
  structural blockers.

These are not passes and must survive into the final release decision.

## Progress statement — refreshed 2026-08-22

The ETP implementation and all repository-controlled work are complete. Of the
13 inventory items, **items 1 and 4 are now DONE** and **11 remain**.

**Nothing engineering-side is blocking.** The critical path is now three owner
reviews, then one build, then devices, data and signatures:

| Blocked on | Items |
|---|---|
| **Owner review, ready now** | 2 (12 visual cases), 5 (rendered language), 6 (R003/R013 exceptions) |
| Engineering, after those reviews | 3 (restore gate fields), 7 (freeze and build one APK) |
| Named people | 11 (staff UAT + privacy/legal reviewer), 12 (signing custodian + independent approver) |
| Device | 8 (install-replace), 9 (API-23 OEM) |
| Real data | 10 (production four-report publication) |
| Last | 13 (final audit, register and HANDOFF) |

### Two facts the earlier draft did not carry

1. **The product identity has moved past the Phase 4C.1 freeze.** Current is
   `c809d04` / fingerprint `3527503a…`; the register was frozen at `ad2d643` /
   `08734dfb` / APK `f7f18ea3`. `GATE-UPDATE-API23` and `GATE-NATIVE-LANGUAGE`
   are therefore closed against a **superseded identity** and need rebinding to
   the artifact that ships. Recorded in the register under `identityMigration`.
2. **The SM-T875 session does not close `GATE-UPDATE-PHYSICAL`.** It was a fresh
   install (`firstInstallTime` equals `lastUpdateTime`), so install-replace and
   update preservation are unproven.

## No-repeat boundary

- Do not rerun the 438-test focused sweep unless tracked inputs change.
- Do not mark the 12 MAH-3 ETP cases captured without visible-browser evidence.
- Do not reuse the stale pre-ETP rendered attestation bound to fingerprint
  `08734dfb`; the localization import changed product identity.
- Do not build the final APK before the visual and language evidence freezes.
- Do not represent synthetic fixtures as production ETP publication.
