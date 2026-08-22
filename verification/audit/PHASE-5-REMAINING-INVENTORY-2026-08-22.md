# Phase 5 remaining-work inventory — 2026-08-22

**Branch/HEAD:** `agent/modular-phase1-shared-spine-v2` at
`f29b558` (local, `origin` and `github` synchronized at inspection).

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
| 1 | Capture MAH-3 cases 169–180 for ETP | **OPEN** — requires a visible browser; headless automation keeps `document.hidden=true` and `requestAnimationFrame` never advances | Visible desktop browser |
| 2 | Review the 12 ETP visual cases | **OPEN** after capture | Fluent/visual owner reviewer |
| 3 | Restore `visualBaselinesCaptured` and dependent MAH-3/MAH-4 gate fields | **OPEN** after all 12 cases pass review | Engineering, using exact reviewed evidence |
| 4 | Produce the 72-cell rendered-language attestation | **BLOCKED** — repository has a validator but no committed producer; requires visible browser and owner-held Ed25519 key `phase4a-renderer-ed25519-9ec3b61bbbdb245f` | Capture producer + owner signing key |
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

## Progress statement

The ETP implementation and repository-controlled capability work are complete.
Against the 15-item consolidated Phase 5 checklist, 3 items are fully closed
(`5B-1`, `5B-2`, `5D-1`) and 12 remain. Most remaining items are evidence or
external-authority work, not unfinished ETP feature engineering.

## No-repeat boundary

- Do not rerun the 438-test focused sweep unless tracked inputs change.
- Do not mark the 12 MAH-3 ETP cases captured without visible-browser evidence.
- Do not reuse the stale pre-ETP rendered attestation bound to fingerprint
  `08734dfb`; the localization import changed product identity.
- Do not build the final APK before the visual and language evidence freezes.
- Do not represent synthetic fixtures as production ETP publication.

