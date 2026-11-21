# SAAGAR Audit Runner Closure — Progress Checkpoint U0/U1

**Captured:** 2026-08-09 (Asia/Kolkata)
**Supersedes for resume:** `AUDIT-RUNNER-CLOSURE-CRASH-CHECKPOINT-2026-08-09.md` §6 items U0/U1 only
**Status:** U0 and U1 complete and verified. U2, U3, U4, U5 outstanding.
**Authority:** `docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md`

## 1. Repository identity

- Branch: `agent/etp-retail-runtime`
- HEAD: `2ef99dcc2c90beba029d79014afe23edfe1f4c36` (unchanged)
- Product anchor: `88ba11842613f29173f436a39ca60f12b33e5085`
- Staging area: empty · `git diff --check`: clean
- No commit, no push, no product edit.

Status class is unchanged from the crash checkpoint; only audit-control paths are dirty.

## 2. Recovery verification performed before editing

| Check | Result |
|---|---|
| Branch / HEAD / anchor ancestry | match |
| Crash-checkpoint §4 file identities (13 files) | **13 exact, 0 drift, 0 missing** |
| Canonical `scripts/audit/**/*.mjs` count | 24, as recorded |
| Product path in diff | none |
| Temporary artefacts | 11 in-repo + 48 external = **59**, exactly as held |
| Product tree at HEAD vs anchor | byte-identical |

**One discrepancy found:** the surviving self-test measured **49/50**, not the recorded 50/50 — see §3.

## 3. U0 — Gradle launcher CWD independence *(new, not in the original U-list)*

**Symptom:** `Gradle launcher executes through the platform-safe wrapper contract` failed with
`'gradlew.bat' is not recognized as an internal or external command`.

**Root cause:** `gradleVersionLauncher()` invoked `cmd.exe /d /s /c "gradlew.bat --version"` with a
bare executable name. That relies on cmd.exe resolving the current directory through its executable
search, which Windows disables when `NoDefaultCurrentDirectoryInExePath=1` — a legitimate hardening
setting, present in this shell. Measured directly:

| Form | Result |
|---|---|
| `gradlew.bat …` (previous) | status 1, "not recognized" |
| `.\gradlew.bat …` (now) | status 0 |

**Not code drift.** The bytes matched the checkpoint exactly; the earlier PowerShell run did not have
the variable set.

**Severity framing:** does *not* meet the addendum §2 criteria for scope expansion — it fails closed
(A9 → `unmeasured`, never a false pass). It was fixed because it blocks exit-sequence step 5, which
requires the self-test at zero fail. One-line launcher hardening, no contract change.

Both consumers (`capture-build.mjs:456`, `capture-build.mjs:594`) inherit the fix from the single
source in `runner-support.mjs`.

## 4. U1 — Conservative A7/A8/C-07 semantics *(complete)*

Implemented per closure addendum §3.

### 4.1 Shared primitive

`runner-support.mjs` gains `staticDiscoveryAuthority()`, `conservativeStaticResult()` and
`staticDiscoveryEvidence()`:

```
definite violation                  -> fail
no violation, complete authority    -> pass
no violation, no complete authority -> unmeasured
```

Authority is a **value**, not a hardcoded constant, so supplying a real registry, trusted runtime
probe or authenticated scanner later flips the semantics without rewriting call sites. No such
authority exists in v1, so these checks settle at `unmeasured`.

### 4.2 Applied

| Check | Before | After |
|---|---|---|
| A7-01 inventory | `pass` on bounded census | `unmeasured` — a census is representable, not complete |
| A7-02 lifecycle | `pass` on clean | `unmeasured`; definite unpaired still `fail` |
| A7-03 payload shape | `pass` on clean | `unmeasured`; definite conflict still `fail` |
| A7-05 parent/global | `pass` on clean | `unmeasured`; definite undeclared still `fail` |
| A8-02/03/04/05 | `pass` on clean | `unmeasured`; definite findings still `fail` |
| **A7-04** | `pass`/`fail` | **unchanged** — closed, enumerable, hash-bound set, not heuristic |
| **A8-01** | already conservative | unchanged |

Every affected metric now carries `staticAbsenceIsProof: false` and `staticDiscoveryComplete`.
Inventories and redacted findings remain in evidence at `unmeasured`, per addendum §3.

### 4.3 C-07

`messageContract()` now requires **both** `result === 'pass'` and `metric.staticDiscoveryComplete === true`.
Either alone is insufficient: the result alone would silently re-enable a pass verdict if A7-01 were
later loosened; the flag alone would accept an inventory from a failing run. Without authority on
**both** sides, C-07 is `unmeasured`.

### 4.4 Fixtures

Nine heuristic-clean assertions flipped `pass` → `unmeasured`, each now also asserting the
`STATIC_DISCOVERY_COVERAGE_INCOMPLETE` reason code rather than just the label.

Delta-detection coverage was **preserved, not deleted**: fixtures that exercise C-07 regression
logic now grant explicit authority, and a paired negative case asserts that withdrawing it on either
side alone forces `unmeasured`.

**New guard added** — *"no heuristic-clean A7 or A8 case reports pass without explicit discovery
authority"* — runs a violation-free synthetic source through both audits and asserts no heuristic
check reaches `pass`. This is the single regression guard for the false-pass class the addendum
closes.

### 4.5 Verification

```
node --test tests/whole-app-audit-runner.test.mjs
tests 51 · pass 51 · fail 0 · cancelled 0 · skipped 0 · todo 0
```

51, not 50: +1 for the new guard.

## 5. Changed file identities

```text
scripts/audit/runner-support.mjs        | 22369  | 818aebb4703e411423f2a3c2c907a6c3c4aea9cf6c9b72de02140c7236974919
scripts/audit/audits/a7.mjs             | 28096  | 197f67effe18bb894ad31f7f324cd607ed4a3d1cb2e964e3cfbd45b61e930031
scripts/audit/audits/a8.mjs             | 41788  | 9799f59af8fd52a359f04c2b56f7e814a1995763609c96273da2ee4bc8c1880e
scripts/audit/comparison.mjs            | 29033  | 068dfcda4a972d50495d4c470b40706b3c759c003966b413fb0859631f1760e9
tests/whole-app-audit-runner.test.mjs   | 109061 | bc8d5057369cfce7cb48d933d20e27ec5ee48a67d7e91b231891d20a4adcd920
```

All other crash-checkpoint §4 identities are unchanged. Recompute after any further edit.

## 6. Outstanding

- **U2** controlled-build receipt v2 — **not started.** Receipt is still `schemaVersion: 1`; there is
  no per-worktree `npm ci`, no isolated `GRADLE_USER_HOME`, no bounded dependency-closure or Gradle
  distribution identity. Touches `capture-build.mjs` (697 lines), `compare-apks.mjs`, `a9.mjs` and
  fixtures as one coherent contract. **Do not run real controlled builds during partial
  implementation** (addendum §7).
- **U3** add the closure addendum to the canonical tooling fileset in `runner-support.mjs`.
- **U4** base-program reconciliation: addendum reference, receipt-v2 wording replacing the stale
  linked-`node_modules` description, the conservative A7/A8 rule, and the array-sorting correction.
- **U5** final verification, cleanup, freeze, baseline — addendum §6.

## 7. Temporary artefact hold — unchanged

59 files, re-inventoried this session and matching the crash checkpoint exactly:

- 11 in-repo `scripts/audit/final-*.patch`
- 48 external `V:\Co work\Projects\Retail\controlled-*.patch`

Zero `.next`, `.tmp`, `.rej`, `.orig` residue anywhere in the repository.
**No approval sought or given. Nothing deleted, moved or committed.**

## 8. Nonclaims

- Runner is not frozen, committed or pushed.
- No controlled mutation, two-build or baseline evidence exists.
- `51/51` is fixture self-test evidence only.
- The `492/492` product regression has **not** been rerun this session.
- A7/A8 static discovery is not complete — that is now stated in the results themselves.
- No device, rendered UI or owner acceptance was created.
- Modular HTML remediation has not begun.
