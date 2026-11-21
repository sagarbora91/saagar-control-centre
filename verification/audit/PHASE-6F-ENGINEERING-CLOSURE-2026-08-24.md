# Phase 6F Engineering Closure — 2026-08-24

## Decision

Phase 6F source engineering is complete. The bounded ETP reporting path and the Family-A
Payroll, Grooming and Service migrations passed the final integrated broad-gate
checkpoint. Phase 6G may begin; the Phase 6D shared
component API stays frozen.

This is an engineering receipt, not rendered, emulator, device, staff-UAT, APK, signing,
Firebase, upload, publication, billing or release acceptance.

## Bounded ETP reporting contract

- The parent gateway owns the allowlisted query, page-local filter/order operation and opaque
  cursor. Cursors are bound to the exact scope, active generation, report and canonical query.
- One bounded native page enters the gateway and one sanitized report page leaves it. The iframe
  receives no native store, raw-fact or plugin handle, and the bounded release has no export.
- The pure-DOM iframe presentation renders paged R022 Revenue/Tender, R025 Sales Detail, R013 CRO
  Attribution and R003 Discount views from mocked query responses before parent wiring.
- Every response is checked against the requested scope and generation, exact report field
  projection, receipt coverage and readiness authority. REC-002 failure suppresses fact access and
  cannot produce apparently complete totals.
- Filtering and ordering are explicitly page-local and totals are explicitly not provided. R003
  and R013 remain non-revenue views and do not contribute to a revenue aggregate.
- Coverage, reconciliation, readiness and PAYMENTTYPE25 quarantine are visible as bounded
  metadata. PAYMENTTYPE25 remains a warning/exclusion surface rather than a classified tender or
  persisted fact projection.

## Family-A migration freeze

The integration order remained Payroll, Grooming, Service. Each module now opts into the frozen
brand, responsive, component and table assets, uses the frozen UI runtime, and carries an
integrity-bound extracted module stylesheet. No shared API was redefined.

| Module | Reviewed table strategy | Preserved boundary |
|---|---|---|
| Payroll | Attendance, salary register, employee master and salary slips use cards; advance recovery, payrun approval and statutory reporting retain justified grids | Financial calculations, persistence and action source remain byte-stable; financial goldens remain authoritative |
| Grooming | The month-end report retains one justified grid | Checklist scoring, storage, viewed-date, export and action identities remain unchanged |
| Service | The estimate ledger retains the justified grid; the remaining static table uses its reviewed non-grid strategy | Job-card business logic, persistence, actions, photos, evidence and custody paths remain unchanged |

General mobile horizontal scrolling is removed from the migrated modules and confined to the
reviewed navigation or true-grid regions. Explicit legacy flex/block fallbacks retain the
generated Chrome-44/API-23 path for all four width tiers. Access-context decisions are unchanged.

Historical Phase 6B/6C identities remain bound to exact reconstructed pre-Phase6F authorities;
the migration does not silently repin historical evidence.

## Verification evidence

The bounded implementation and independent review evidence known before the final integrated
checkpoint is:

- complete ETP suite: **242/242**;
- ETP adversarial slice: **23/23**;
- Family-A migration focused suite: **17/17**;
- selected Service D3 workboard/custody regression slice: **18/18**, excluding the then-stale
  manifest assertion that is refreshed by final integration.

### Final integrated checkpoint

- Phase 6F integrated aggregate: **85/85**.
- Manifest, API-23 and Stock-plus-Family-A adoption slice: **40/40**.
- Phase 6B Family-A historical identities: **10/10**.
- Phase 6C current-profile and capability-ledger regeneration slice: **4/4**.
- Phase 0: **72/72**.
- Security: **101/101**.
- Modular architecture: **88/88**.
- Complete offline final aggregate: **275/275**.

The regenerated capability ledger remains fail-closed pending owner approval: 384 added, 350
removed, 37 changed, net 34 capabilities, with 771 approval decisions required. Its comparison
delta SHA-256 is `ab8e2502134a39cb5400d631a9f8ced072b469d1e580ab312007d5b384561cc8`.

## Boundary and next action

Phase 6F changes source presentation, bounded read-only ETP reporting, module-local responsive
adoption, integrity metadata, deterministic tests and engineering documentation. It does not
change Payroll money calculations, Grooming scoring, Service evidence/custody semantics, ETP
write/import authority, the frozen shared component API, module access context or release state.

Begin Phase 6G in the controlling order: Expense
proves the JS-rendered helper; Leave and CRO Audit prepare next; Tax and DSR follow; QMS receives
its dedicated view-extraction/adoption pass; the shell changes only after every module freezes.
Retain calculations, persistence, close-day/allocation behavior and the existing shell/module
message protocol. Reports continues to own ETP, and ETP remains absent from Settings.

No rendered-browser, emulator, physical-device or staff-UAT work is claimed. No APK was built or
signed, no Firebase/device action occurred, and nothing was uploaded, published, released or
billed.
