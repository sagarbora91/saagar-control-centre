# Phase 6C legacy mobile extraction contract — 2026-08-24

**Status:** 6C.1 read-only audit complete; implementation not started.

## Frozen authority

The live source no longer matches the plan's historical 189-rule measurement. The canonical
body is the complete body of Planning's `style#st-v5-mobile-css`, including its leading and
trailing newline:

- bytes: **24,977**
- SHA-256: `acc970dbe54fb99b0dfa25a2807fb3626ba11130fcd87969ca336d8000efa443`
- structure: **191 top-level rules**, including two media containers
- exact consumers: Planning, Stock, DSR, Expense, Grooming, CRO Audit, Leave and Tax

Service adds one `.stage-chip` rule. QMS replaces the sidebar rule and adds its checkbox-driven
selector. Payroll adds a four-rule narrow-screen header media delta. Those delta bytes remain
module-owned and must follow the canonical shared asset in cascade order.

## Migration boundary

- New asset: `www/shared/module-mobile-legacy.css`
- Manifest identity: `module-mobile-legacy-css`, version `1`
- Consumers: the explicit allowlist `stock`, `service`, `qms`, `dsr`, `expense`, `grooming`,
  `cro_audit`, `payroll`, `leave`, `tax`, `planning`
- Order: existing `module-mobile-common.css`, new legacy asset, optional module delta, mobile boot
- ETP: no legacy import and no source-byte or manifest-identity change

The existing `scripts/migrate-phase1-mobile-common-css.mjs` is out of scope. It extracts the
older six-selector common asset and enumerates every module directory, including ETP.

## Proof sequence

1. Apply the extraction to Planning only and prove exact CSS cascade reconstruction.
2. Run the focused Phase 6C contract, manifest, API-23, shared-spine and modular tests.
3. Compare Planning before/after at governed widths in a visible browser; do not refresh evidence
   merely to hide drift.
4. Only after Planning passes, roll the same extraction across the other ten allowlisted modules.
5. Prove exactly eleven imports, one canonical asset, preserved Service/QMS/Payroll deltas and
   zero ETP imports.

Governed legacy comparison widths are 360x800, 412x915, 800x600 and 1365x768. Phase 6 boundary
checks additionally cover 639/640, 899/900 and 1199/1200.

## Baseline receipt

The Planning audit's focused pre-change suite passed **33/33**. All three audit lanes made no file
changes. No APK was built or signed, and no Firebase, billing, publication or push action occurred.
