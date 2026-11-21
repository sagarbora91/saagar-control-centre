# Modular HTML Phase 1 — Shared Spine Closure

**Scope:** Phase 1 from `docs/MODULAR-MIGRATION-ROADMAP-2026-08-10.md`
**Product baseline:** `88ba11842613f29173f436a39ca60f12b33e5085`
**Gate 0 target:** `c30886daf2e9b423de1e788ee72a157e8d869bbb`
**Status:** engineering complete and locally verified; external device and post-commit audit gates remain pending.

## Implemented

- All eleven modules load one manifest-bound `shared/module-runtime.js` and use
  the six common stages: storage, safety, mobile, back, employees and audit.
- Owner-context enforcement, reauthentication and print delivery use shared
  runtime authorities while retaining the existing module-specific outcomes.
- Six repeated CSS families moved to immutable manifest-bound shared assets:
  uniform, back, employee, mobile common, brand tokens and delete cell.
- Shared message target origin is resolved once. The only wildcard is the
  logged fallback used when the WebView has no usable scheme origin. Every
  migrated receiver validates both source and origin before reading payloads.
- Shared message types, storage keys and module asset identities have one
  declared authority. Domain-local constants were renamed without changing
  their values or persistence contracts.

## Audit exit measurements

| Gate | Gate 0 | Phase 1 result |
|---|---:|---:|
| A2-01 exact duplicate functions | 39 groups | **pass — 0** |
| A2-02 near-copy functions | 42 groups / 1,997 edges | **23 groups / 1,077 edges** |
| A2-03 duplicate CSS | 13 groups | **pass — 0** |
| A2-04 duplicate constants | 6 | **pass — 0** |
| A2-05 authority gaps | 16 | **pass — 0** |
| A8-05 unapproved remote calls | 47 wildcard message calls | **0 unapproved calls** |
| A3-02 capability oracle | 655 / 0 conflicts | **655 / 0 conflicts** |

A8-05 remains conservatively `unmeasured`, not falsely promoted to pass,
because 41 pre-existing dynamic network/navigation targets cannot be proven by
the static scanner. The Phase 1-owned wildcard message defect is removed: all
direct shell/module message routes are exact-origin, and the one remaining
dynamic wildcard is the pre-existing rejected `integration-bridge.js` route.

## A2-02 surviving near-copy justification

The 23 groups were reviewed as three bounded classes:

1. **18 third-party/minified groups** span `html2pdf`, `jspdf`, `fflate` and
   `read-excel-file`. They are separately pinned vendor distributions. Editing
   or merging their internals would fork upstream code and is outside Phase 1.
2. **Four contract/factory-shape groups** cover ETP factories/loaders, policy
   UMD wrappers and one small boot-shape cluster. Their normalized syntax is
   similar, but ownership, inputs, validation and failure semantics are
   domain-specific. A generic abstraction would erase security boundaries.
3. **One accidental UI/calculation group** links payroll `renderFnfPreview`,
   service `calcDeno` and tax `renderActionCenter`. Names, inputs and outcomes
   are unrelated; the token similarity is not shared behavior.

This is a material reduction (19 groups and 920 edges removed) without merging
unrelated business or vendor semantics.

## Evidence refreshed without overclaim

- MAH-3 source/profile and Planning/DSR/QMS identity receipts were rebound to
  the Phase 1 bytes. Existing visual/device acceptance scope was not expanded.
- MAH-4 source inventory was regenerated after the typed messaging migration.
- Permanent tests assert the shared runtime/CSS graph, origin enforcement,
  A2 owned gates, A8-05 zero unapproved calls and exact A3 655/0 identity.

## Still external to engineering completion

- Full offline regression passed **492/492** with no failures, skips, todos or
  cancellations. The dedicated Phase 1 contract passed **5/5**, the modular
  suite passed **72/72**, and the audit-runner self-test passed **58/58**.
- Run MAH-3/MAH-4 on two physical target devices; emulator evidence is not a
  substitute and this document does not claim device acceptance.
- Commit/freeze the Phase 1 bytes, then run the isolated comparison audit and
  re-anchor/re-baseline only through the approved audit workflow.
- Owner smoke and approval of the resulting build.

No commit, push, physical-device acceptance or owner acceptance is claimed by
this closure record.
