# Modular capability delta reconciliation — 2026-08-12

## Result

A2-04 is resolved without a runtime behavior change. The module bridge's generic
local `VERSION` identifier was renamed to `MODULE_BRIDGE_VERSION`; its public
`SaagarModuleBridge.version` value remains `1`. Direct A2-04 measurement now
passes with 98 authority candidates, 0 duplicated constants and 0 affected
files.

The previously reported A3 count of 659 versus 655 was not a valid frozen-tool
comparison. The candidate had added a special-case A3 analyser filter that hid
`script-shared-module-runtime:permission:access-context`. Restoring the Gate 0
analyser semantics produces the comparable current count: **660 capabilities,
0 conflicts**, versus the frozen **655 capabilities, 0 conflicts**.

## Count explanation

| Category | Gate 0 | Current | Delta |
|---|---:|---:|---:|
| Routes | 12 | 12 | 0 |
| Visible actions | 469 | 469 | 0 |
| Persisted outcomes | 86 | 86 | 0 |
| Permissions | 22 | 24 | +2 |
| Failure posture | 66 | 69 | +3 |
| **Total** | **655** | **660** | **+5** |

The apparent +4 was therefore composed of a real product net +5 and an invalid
one-row analyser suppression (-1). With the frozen analyser restored, the
product delta is 12 added IDs minus 7 removed IDs: **net +5**.

## Added capability IDs (12)

Five modules now expose their existing shared-stage access-context declaration
at the module surface:

- `cro_audit:permission:access-context`
- `grooming:permission:access-context`
- `leave:permission:access-context`
- `payroll:permission:access-context`
- `tax:permission:access-context`

Four permission authorities are now visible on the extracted shared boundaries:

- `script-shared-module-bridge:permission:owner-session`
- `script-shared-module-bridge:permission:reauthentication`
- `script-shared-module-runtime:permission:owner-session`
- `script-shared-module-runtime:permission:reauthentication`

Three newly extracted first-party JavaScript assets receive explicit failure
posture surfaces:

- `script-shared-module-bridge:failure:posture`
- `script-shared-shell-module-frame-controller:failure:posture`
- `script-shell-asset-manifest:failure:posture`

## Removed capability IDs (7)

These module-local permission attributions disappeared when their reads and
reauthentication calls moved behind the shared bridge/runtime:

- `dsr:permission:owner-session`
- `dsr:permission:reauthentication`
- `expense:permission:reauthentication`
- `payroll:permission:reauthentication`
- `service:permission:reauthentication`
- `stock:permission:owner-session`
- `stock:permission:reauthentication`

The removal does not by itself prove a lost control: corresponding owner and
reauthentication authority is present on both shared boundaries. It is still an
ID-level comparison delta and cannot be silently treated as equivalent.

## Common-ID outcome changes

The count delta is not the complete C-02 comparison surface. Among IDs present
on both sides, 87 outcomes also differ:

- 73 visible-action outcomes, primarily because handler bindings changed when
  module injection was retired, shell/module delivery moved to the bridge, and
  protected actions became asynchronous and fail-closed.
- 14 failure-posture outcomes, because catch/throw/fallback sites moved between
  the monolithic documents and extracted shared assets.
- 0 route, persisted-outcome or permission outcome changes.

These 87 changed outcomes plus the 12 additions and 7 removals require exact
identity-bound `capabilityApprovals`, or code changes that restore equivalence,
before comparison gate C-02 can pass. This report explains and classifies the
delta; it does not manufacture owner approval.

The checked-in deterministic ledger at
`verification/MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json` records the exact
before/after comparison value and SHA-256 for all **106** approval rows:

- 52 visible-action changes retain the complete binding structure and differ
  only in referenced handler-body hashes after extraction;
- 21 visible-action changes remove duplicated or ambiguous bindings while
  retaining the stable action ID and destination expression;
- 14 failure-posture changes record catch/throw/error/fallback counts moving
  across the extracted source boundaries;
- 12 additions and 7 removals are classified individually as listed above.

The generator `scripts/analyze-modular-capability-delta.mjs` fails if those
counts, the 21 reviewed structural action IDs, category totals, conflicts, or
any exact outcome drifts. The ledger deliberately remains
`pending-owner-approval`; it is evidence for an owner decision, not the
decision itself. Restoring the frozen analyser is the 107th reconciliation
item, but it is not a product capability delta and therefore does not produce a
`capabilityApprovals` row.

## Verification

- Direct A2-04: pass, 0 duplicated constants.
- MAH-2 manifest contracts: 8/8 pass after refreshing the bridge byte/hash.
- Gate 0 A3 source: `verification/audit/2026-08-11-113428-b9f04b5/A3-capabilities.json`.
- Frozen Gate 0 count: 655/0.
- Current frozen-analyser count: 660/0.
- Manifest, MAH-3 and MAH-4 identities were refreshed after the behavior-neutral
  bridge rename.
- Canonical modular aggregate: 86/86 pass, including the Phase 1 shared spine,
  shell frame controller, and deterministic capability-delta ledger.
- Full `npm run test:offline`: pass.
- Audit runner self-test on the migration candidate: 55/58. The tracked-test
  registry now passes; the three remaining assertions are the frozen tooling
  commit/product-anchor isolation checks and intentionally do not treat the
  changed migration product as the Gate 0 product.
