# SAAGAR Control Centre — Safe Android Audit Handoff

**Updated:** 2026-08-11 (Asia/Kolkata)
**Purpose:** authoritative resume point for the whole-app pre-/post-Modular-HTML audit.
**Status:** audit runner **frozen**; **Gate 0 baseline complete and committed**. Modular HTML migration Phase 1 is unblocked and awaits owner authorization.

> ## ⚑ RESUME HERE — Modular HTML migration, Phase 1
>
> **Plan:** `docs/MODULAR-MIGRATION-ROADMAP-2026-08-10.md` — one gate and three phases.
> Gate 0 is **closed**. Phase 1 (shared spine) is next and needs owner authorization
> to begin, per closure addendum step 16.
>
> | Tripwire | Expected |
> |---|---|
> | Branch / HEAD | `agent/etp-retail-runtime` / `b9f04b5e33d045ad0ca6b7cc9acd25e2d5a186cb` |
> | Product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` (Gate 0 anchor; history in `AUDIT-PROGRAM-v1.md` §1.3) |
> | Gate 0 baseline evidence | `verification/audit/2026-08-11-113428-b9f04b5` |
> | Runner self-test | **58/58**, zero fail/cancelled/skipped/todo |
> | Offline product suite | **492/492** |
> | Canonical audit modules | 24 under `scripts/audit/**/*.mjs`, all `node --check` clean |
> | Tracked product files | **296**, fingerprint equal to the anchor |
> | Capability inventory (the oracle) | **655 capabilities, 0 conflicts, A3-02 `pass`** |
> | Temporary patch hold | **59** — 11 in-repo `scripts/audit/final-*.patch`, 48 external `controlled-*.patch` |
>
> **The single rule that governs the migration:** the capability inventory must come
> out **exactly** 655 / 0 conflicts. Everything else compares by direction; this one
> is exact equality, and it is the only mechanism that catches a control silently
> lost while markup moves between files.

## Gate 0 baseline — the frozen "before"

Run from a clean detached linked worktree at `b9f04b5`; the dirty primary worktree
was never the audit target.

| Field | Value |
|---|---|
| Result | `complete-with-findings-or-gaps` |
| Checks | **24 pass / 19 fail / 15 unmeasured / 0 n/a** (58 total) |
| Findings | 19 |
| Mandatory unmeasured | 13 |
| Open external gates | 10 |
| Product fingerprint | `f9b7dee47a7be2f6536c40e40393325392516f01584e1b613ccc26f60866d1c7` |

Per-audit: A1 5/2/0 · A2 0/5/0 · **A3 4/0/1** · A4 4/2/0 · A5 4/0/1 · A6 1/2/2 ·
A7 1/2/2 · A8 0/3/2 · A9 2/0/3 · A10 1/0/4 · A11 2/3/0.

This is engineering audit evidence. It is **not** device, UAT, legal, signing or
release acceptance, and 19 fails plus 15 unmeasured remain open gates.

## Runner closure — complete

| Slice | State |
|---|---|
| **U0** Gradle launcher CWD independence | done |
| **U1** Conservative A7/A8/C-07 semantics | done — heuristic-clean is `unmeasured`, never `pass` |
| **U2** Controlled-build receipt v2 | done — per-worktree `npm ci`, bounded dependency/Gradle closure identities, isolated `GRADLE_USER_HOME`, schema v2, two-build agreement |
| **U3** Addendum into tooling identity | done — and its freeze blocker fixed |
| **U4** Base-program reconciliation | done |
| **U5** Verification, freeze, baseline | done — freeze `7871e57`, then re-frozen through `b9f04b5` |

## Current repository authority

| Item | Current fact |
|---|---|
| Product branch | `agent/etp-retail-runtime`, pushed to `origin` |
| Product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` |
| Audit tooling SHA | `b9f04b5e33d045ad0ca6b7cc9acd25e2d5a186cb` |
| Comparison baseline | `verification/audit/2026-08-11-113428-b9f04b5` |
| Superseded baselines | `2026-08-10-115208-7871e57` (anchor `88ba118`), `2026-08-10-130643-57507ef` (anchor `f4da822`) — valid history, not comparison inputs |
| PHP/platform work | excluded until fresh owner authorization |
| Modular HTML | external-file migration complete; M2/M3/M4/M6 open — see the roadmap |

## Open P0s and their dispositions

Full reasoning in `docs/audit/P0-DECISIONS-2026-08-10.md`.

| Finding | State |
|---|---|
| A4-03 storage classification contradiction | **fixed**, passes |
| A4-02 artifact classification | 98 → 73; remainder is runtime-computed filenames, an analyser limit |
| A8-02 export policy bypass | 9 → 2; both remaining are guard shapes the analyser cannot prove |
| A8-03 fail-open authentication | **signed design, not a defect.** `SaagarReauth` must ALLOW rather than brick; remedy is moving re-auth onto the Slice D DOM keypad — device-gated, Phase 3 |
| A8-05 unapproved remote runtime | real risk, 47 wildcard `postMessage` calls forming the shell↔module backbone — device-gated, Phase 1 |

A real security defect was found and fixed while working these: in the
evidence-file export path an empty `catch` swallowed a throwing `authorize()`,
the `!token` rejection sat inside the same `try`, and execution fell through to
`window.open` — any failure in the approval control silently became an approved
export (`fccd115`).

## Carried, not blocking migration

- **A9-01/02/05** two-build reproducibility — `services.gradle.org` fails the TLS
  handshake here with schannel `CRYPT_E_NO_REVOCATION_CHECK`. A networked host is
  **not** sufficient on its own; the proxy/TLS-inspection path must be fixed first.
- **A5-05** — the storage mutation is detected correctly but the mutated run takes
  ~150 s against a 120 s capture timeout.
- **A2 (all five)** — this is what the migration is *for*; the before/after delta
  is the evidence it worked.

## Audit identity model

1. **Product baseline SHA** — the frozen pre-migration snapshot. The tooling and
   baseline gates require an exact product-fingerprint match, so **every product
   change forces an explicit re-anchor**. Four anchors so far; history and
   reasoning in `AUDIT-PROGRAM-v1.md` §1.3.
2. **Audit tooling SHA** — the commit containing the reviewed program and complete
   tested runner. Its product fingerprint must equal the anchor's.

Audit output is produced from an isolated clean worktree. Build and mutation
probes write only inside disposable worktrees. The live source tree is never the
audit target.

## Per-change discipline

Every product change repeats this loop. Each step exists because skipping it has
broken something here before:

1. Regenerate module manifest, golden hashes, MAH-3 and MAH-4 profiles.
2. Bump the MAH-4 frozen `www` byte total deliberately — that guard exists to
   force acknowledgement of a `www` change.
3. Run 492/492 offline **and** the 58/58 audit self-test.
4. **Re-anchor.** A product change without one blocks every future baseline with
   `AUDIT_TOOLING_PRODUCT_FINGERPRINT_DRIFT`.
5. Re-baseline, then device-test.

Note: `docs/audit/` is audit control **except** `*-CHANGE-CONTRACT-*.md`, which are
approved product specifications and stay inside the product fingerprint.

## Open acceptance gates

Ten, all human- or device-owned, none inferable from source tests or emulator
evidence: owner physical update-in-place smoke; physical API-23/OEM import and
document-provider evidence; ETP process-death/disk-full/corruption/rotation/
low-storage evidence; real production native ETP publication; user-facing
R003/R013 exception treatment; approved PAYMENTTYPE25 mapping; fluent
native-language review; staff UAT; legal review; production signing and release.

## Authority rule

Code is authoritative for what the current app does. Approved contracts,
dictionaries and source evidence are authoritative for what it must do. Any
disagreement is an audit finding. **`unmeasured` never means `pass`.**

## Historical record

Earlier branch positions, APK hashes, dirty-tree checkpoints and test totals are
preserved by Git history and the dated documents under `verification/`. They are
immutable historical evidence, not current resume instructions.
