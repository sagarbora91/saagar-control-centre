# ETP identity regeneration — findings

**Branch:** `agent/etp-l10n-identity-regen`, from `b5538d2`.
**Purpose:** attempt ETP-4 step 3 (identity regeneration) off the shared branch.

## Correction to the previous checkpoint

`ETP-L10N-IMPORT-CHECKPOINT-2026-08-21.md` implied the 19 red identity assertions followed the
localization import. **That attribution was wrong.** Measured at `099d6a4`, the commit immediately
before the import, using a clean worktree:

| Suite | At `099d6a4` (pre-import) | After import |
|---|---|---|
| `test:modular` | 74 pass, **12 fail** | 74 pass, 12 fail |
| `test:mah3` | 3 pass, **4 fail** | 15 pass, 4 fail |
| `test:mah4` | 5 pass, **3 fail** | 43 pass, 3 fail |
| `tests/mh1-modular-inventory` | 2 pass, 0 fail | — |

**The localization import added zero failures.** Every one of them was already red, introduced by
the ETP-1..ETP-3 work, which took `www/` from 100 to 103 files at `b0904bc` without updating the
identity profiles and inventory constants.

The ETP module checkpoint reported "Final focused ETP suite: 155/155 pass. Final focused manifest
suite: 17/17 pass." Both true, but neither suite covers MAH-3, MAH-4, MH1 or the capability ledger,
which is why the drift went unrecorded.

## MAH-4 — fixed, now 46/46

Root cause: hard-coded inventory constants that ETP-1's three new files invalidated.

1. `refresh-mah4-baseline.mjs` regenerated `MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json`
   (moduleCount 11 to 12, etp message types added, tree hash, byte total). Verified the regenerated
   profile is deep-equal to `createMah4Profile(root)` — 0 differences.
2. Updated stale constants in `tests/mah4-message-lifecycle-baseline.test.mjs`:

| Constant | Was | Now | Why |
|---|---:|---:|---|
| `currentWwwFileCount` | 100 | 103 | ETP-1 added 3 files |
| `currentWwwTotalBytes` | 7,972,494 | 8,064,569 | the deliberate byte-total bump of spec 6.3 |
| `directEntryScriptAssetCount` | 57 | 58 | etp module gateway script |
| `uniqueDirectAssetTotals.eventListeners` | 41 | 42 | etp module |
| qualified bucket `eventListeners` | 47 | 57 | etp module |
| aggregate lifecycle totals | 141/33/274/11 | 151/36/305/12 | etp module |

All are inventory counters describing the tree, not behavioural assertions.

## MAH-3 — NOT fixed, and deliberately not forced

`scripts/mah3-visual-review-server.mjs:100` requires `minimumVisualCases === 168`, where
168 = 14 surfaces x 3 languages x 4 viewports. The manifest now carries 12 modules, so the contract
becomes 15 x 3 x 4 = **180**.

**This must not be fixed by editing constants.** The profile records the gate as
`"satisfied by identity-bound 168-case evidence and owner confirmation"`. Raising the number to 180
without capturing the 12 new `etp` cases would assert owner-confirmed visual evidence that does not
exist — a false green on an owner gate.

Closing MAH-3 properly requires capturing 12 new visual cases for the `etp` surface and obtaining a
fresh owner confirmation. That is ETP-4 step 4 and it is an owner gate.

## MH1 — one drift, one real defect

**Drift:** `MH1-MODULAR-PROTECTION-PROFILE.json` still lists 11 modules; the manifest has 12. The
profile needs an `etp` entry. No generator script exists for this file, so it is hand-maintained.

**Defect:** `MH1 every module keeps offline responsive, language, and shell-bridge protection` fails
with `etp must contain one st-v5-module-audit-bridge, actual: 0, expected: 1`. Verified directly:

| Modules with `st-v5-module-audit-bridge` | Count |
|---|---|
| cro_audit, dsr, expense, grooming, leave, payroll, planning, qms, service, stock, tax | 1 each |
| **etp** | **0** |

**Eleven of twelve modules carry this bridge and the ETP module does not.** This is an
implementation gap in ETP-1, not identity drift, and it is not fixable by regenerating anything. The
ETP module is missing a protection every other module has.

This is exactly the case the ETP checkpoint's do-not-repeat boundary allows reopening for: "Do not
modify or retest ETP phases 1-3 unless a focused test exposes a defect." A focused test has exposed
one. It was left for the owning workstream rather than patched here, because wiring a bridge into
their module is their design call.

## Capability ledger — owner gate

Three `test:modular` failures remain:

- `modular capability delta ledger exactly matches the frozen A3 comparison`
- `capability review remains fail-closed until the owner explicitly approves it`
- `Phase 1 audit exit closes owned authority gates and records exact capability review`

The 107-delta capability approval is bound to the pre-ETP identity. A new owner capability approval
is required for the regenerated delta, exactly as the 107-row approval was. Not self-approvable.

## State of this branch

| Suite | Result |
|---|---|
| `test:etp` | 155/155 pass |
| `test:language` | 10/10 pass |
| `test:manifest` | 8/8 pass |
| `test:mah4` | **46/46 pass** (was 43/3) |
| `test:mah3` | 15 pass, 4 fail — needs visual evidence capture and owner confirmation |
| `test:modular` | 12 fail — 4 MAH-3, 2 MH1 (1 drift + 1 defect), 3 capability, 3 MAH-4 now fixed |

## Recommended order for whoever finishes this

1. **Fix the missing `st-v5-module-audit-bridge` in `www/modules/etp/index.html`.** Product defect,
   blocks MH1, and should be settled before any evidence is captured against the module.
2. Add the `etp` entry to `MH1-MODULAR-PROTECTION-PROFILE.json`.
3. Capture the 12 new `etp` visual cases; raise the MAH-3 contract to 180 **together with** the
   evidence and a fresh owner confirmation, never ahead of it.
4. Regenerate the capability delta and obtain a new owner capability approval.
5. Only then: rendered-language matrix, seeded APK, physical acceptance, controlled audit.
