# Audit Runner Closure — Progress Checkpoint U3 + U4

**Date:** 2026-08-10 (Asia/Kolkata)
**Scope executed:** U3 and U4 only, per
`verification/audit/RESUME-PROMPT-U3-U4-2026-08-09.md`.
**Status:** U3 and U4 COMPLETE. U5 not started — it needs owner approval on the
temporary-artefact inventory.

---

## 1. Recovery report — identity at entry

| Item | Expected | Observed | Verdict |
|---|---|---|---|
| Branch | `agent/etp-retail-runtime` | `agent/etp-retail-runtime` | match |
| HEAD | `2ef99dcc2c90beba029d79014afe23edfe1f4c36` | same | match |
| Staging area | empty | empty | match |
| `git diff --check` | clean | clean | match |
| Working tree | dirty, audit-control paths only | audit-control paths only | match |
| Self-test | 53/53, zero fail/cancelled/skipped/todo | 53/53, all zero | match |
| Canonical modules | 24 `.mjs`, `node --check` clean | 24, 0 failures | match |

All 13 reference file identities in the resume prompt (bytes + SHA-256) matched
byte-for-byte. **No drift.** Scope was clean; no product path was present.

Product fingerprint at entry: **297 tracked, 295 product**, equal to anchor
`88ba11842613f29173f436a39ca60f12b33e5085`.

---

## 2. U3 — closure addendum wired into audit-tooling identity

### 2.1 Shared path constants (`scripts/audit/lib.mjs`)

Added three exports so both path classifiers agree on one rule:

- `AUDIT_PROGRAM_FILE` = `docs/audit/AUDIT-PROGRAM-v1.md`
- `AUDIT_PROGRAM_CLOSURE_ADDENDUM_FILE` =
  `docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md`
- `AUDIT_PROGRAM_PATTERN` = `/^docs\/audit\/AUDIT-PROGRAM-v1(-[A-Za-z0-9.-]+)?\.md$/`

A **stable prefix rule**, not a dated exact string, was chosen deliberately — see
§2.3. `AUDIT-PROGRAM-v2.md` is intentionally NOT matched; a v2 program is a new
authority and must be classified explicitly.

### 2.2 U3(a) + U3(b) — `scripts/audit/runner-support.mjs`

- `isAuditToolingPath()` now tests `AUDIT_PROGRAM_PATTERN` instead of the exact
  base-program string, so the addendum is audit tooling.
- The `required` array in `verifyToolingIdentity()` now lists both
  `AUDIT_PROGRAM_FILE` and `AUDIT_PROGRAM_CLOSURE_ADDENDUM_FILE`. A missing
  addendum is `AUDIT_TOOLING_FILESET_MISMATCH`.

As instructed, the findings ledger, the crash checkpoint and the U0/U1 progress
checkpoint were **not** added. They are historical/control evidence and are
deliberately not self-referential tooling inputs (crash checkpoint §6 U3). This
is asserted directly by the new test.

### 2.3 U3(c) — FREEZE BLOCKER, confirmed then fixed

**Confirmed before fixing**, exactly as the resume prompt predicted:

```
isProductPath('docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md') === true
```

`scripts/audit/lib.mjs isAuditControlPath()` is a different function from
`runner-support.mjs isAuditToolingPath()`, and it matched only the exact base
program string. The addendum is untracked today, so the count was still 295 and
still equalled anchor `88ba118` — but exit-sequence step 12 commits the
addendum, at which point it would have counted as a product file, the count
would have become 296, and exit-sequence step 10/17 (recompute the product
fingerprint, require exact equality with `88ba118`) would have **failed**. The
freeze could not have completed.

**Fix:** `isAuditControlPath()` now uses `AUDIT_PROGRAM_PATTERN`, so the base
program and every `AUDIT-PROGRAM-v1` addendum are audit-control paths excluded
from the product fingerprint — exactly as `docs/audit/HANDOFF.md` and
`docs/audit/AUDIT-PROGRAM-v1.md` already were. The prefix form means the *next*
addendum cannot silently reintroduce the same blocker; a dated exact string
would have.

This is not scope expansion under closure addendum §2 — it repairs a false
REJECTION that blocks the exit sequence, the same class as U0.

### 2.4 Tests added (2)

1. **`the closure addendum is required audit tooling and its absence is rejected`**
   Builds a disposable Git fixture containing the full required tooling fileset,
   calls `verifyToolingIdentity()` (passes), asserts the addendum is a tooling
   path while `HANDOFF.md` and the findings ledger are not, then deletes the
   addendum, commits, and asserts `AUDIT_TOOLING_FILESET_MISMATCH`.
   Load-bearing: before the U3 fix this threw nothing, because `declared` and
   `current` were both simply missing the file.

2. **`committing the closure addendum cannot move the 295-file product fingerprint`**
   Asserts the addendum and the base program are control paths, that a future
   dated addendum is also a control path, that `AUDIT-PROGRAM-v2.md` is still
   product, that the tracked product set **with the addendum added** is still
   **295** files, and that the anchor fingerprint file count is 295.
   Load-bearing: before the U3 fix the first assertion failed outright.

---

## 3. U4 — base program reconciled with what is implemented

File: `docs/audit/AUDIT-PROGRAM-v1.md`

- **(a) §1.2 Authority order** — states that the closure addendum is the
  controlling authority for runner closure until baseline evidence is committed,
  that it wins where it narrows or supersedes, that this document resumes sole
  authority afterwards, and that the addendum is both a required tooling input
  and a control path excluded from the product fingerprint.

- **(b) §3** — the false sentence "links only the audited root's `node_modules`,
  and verifies identity and cleanup" was replaced with receipt-v2 reality: no
  ambient junction and no fallback; an independent
  `npm ci --ignore-scripts --no-audit --no-fund` per disposable worktree;
  bounded dependency-closure identity (`fileCount`/`totalBytes`/`sha256`,
  aggregates only) measured after install, before Gradle and after build with
  all three required to match; isolated per-build `GRADLE_USER_HOME` threaded
  through the build command; bounded Gradle distribution identity before and
  after; exact receipt-v2 agreement across both builds or `toolchainMatch` fails.

- **(c) New §4.1** — the conservative A7/A8 static-discovery rule as a table:
  definite violation → `fail`; no violation with explicit complete discovery
  authority → `pass`; no violation without it → `unmeasured`. States that `pass`
  requires `metric.staticDiscoveryComplete === true`, that C-07 requires both
  sides `pass` **and** both complete, and that A7-04 is exempt as a closed
  hash-bound set.

- **(d) §5** — "Evidence strings and arrays are bounded and deterministically
  sorted" was overstated. Narrowed to: arrays are bounded, but central
  deterministic sorting and deduplication applies to check `evidence` arrays
  only; other arrays keep producer order, which may be meaningful and is not
  normalised. **Verified against code**, not assumed: `lib.mjs evidence()`
  sorts, dedupes and bounds, and is applied by `makeCheck()` to the `evidence`
  field alone.

---

## 4. Completion checks

| Check | Result |
|---|---|
| `node --check` on every `scripts/audit/**/*.mjs` | **24 checked, 0 failed** |
| `node --test tests/whole-app-audit-runner.test.mjs` | **55 pass**, 0 fail / 0 cancelled / 0 skipped / 0 todo |
| Product path in `git status` | **none** — only `docs/audit/`, `scripts/audit/`, `verification/audit/`, `tests/whole-app-audit-runner.test.mjs` |
| `git diff --check` | clean |
| Staging area | empty |
| HEAD | still `2ef99dcc2c90beba029d79014afe23edfe1f4c36` — nothing committed, pushed, reset, deleted or moved |

Test count moved 53 → 55; both additions are the U3 guards described in §2.4.

## 5. Changed-file identities

```text
scripts/audit/lib.mjs                     |   7808 | 3886e41bd60422ff9a22df7b040d073db46477689bcc9baa44774b0d9d356682
scripts/audit/runner-support.mjs          |  22466 | b395623670ec56aa44626c77fbff69857fa9dac4121d07d4d60c86699809193b
tests/whole-app-audit-runner.test.mjs     | 117029 | aa34ff84ee67d09298b7ac26ae1c31df9c565091188958b64bcb7e9699d387ea
docs/audit/AUDIT-PROGRAM-v1.md            |  23315 | aff43b1be9f83fa71cac54b5a01b5af919eef8f54ba994067054e311af2a2635
```

Every other file listed in the resume prompt's reference table is unchanged and
still matches its recorded identity.

The `AUDIT-PROGRAM-v1.md` hash change and the consequent tooling-fingerprint
move are intended under U4, not drift. The addendum itself
(`7534 | c63f90aa…`) and the findings ledger (`10018 | 8d59637c…`) are unchanged.

## 6. Temporary-artefact hold — re-inventoried, untouched

| Count | Location |
|---|---|
| 11 | `scripts/audit/final-*.patch` (in repo, never commit) |
| 48 | `V:\Co work\Projects\Retail\controlled-*.patch` (outside repo) |
| **59** | **total — matches the recorded hold exactly** |

Nothing was deleted or moved. No owner approval exists for removing this set.
**Owner decision required before U5 can start.**

## 7. Next

U5 — verification, tooling freeze, baseline — is blocked on owner approval of the
temporary-artefact inventory in §6. Do not begin it without that approval.

When the exit sequence does run, step 12 commits the closure addendum; §2.3 is
the reason step 10/17 will now still find exactly 295 product files and match
anchor `88ba118`.
