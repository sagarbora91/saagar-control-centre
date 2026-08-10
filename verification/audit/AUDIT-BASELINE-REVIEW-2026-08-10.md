# Whole-App Audit — Baseline Run and Review

**Date:** 2026-08-10 (Asia/Kolkata)
**Exit-sequence steps:** 13 (baseline run) and 14 (review of all 58 checks and open gates).
**Status:** baseline RUN and REVIEWED. Step 15 (evidence commit + push) NOT done — needs owner approval.

| Field | Value |
|---|---|
| Product baseline (anchor) | `88ba11842613f29173f436a39ca60f12b33e5085` |
| Target commit | `7871e57b4c52aa318ff285405ce61b1f74c1a12b` |
| Audit tooling commit | `7871e57b4c52aa318ff285405ce61b1f74c1a12b` |
| Audit version | `saagar-whole-app-audit-v1.0.0` |
| Product fingerprint | `06643f46f89834191127478e2b6eba5c7e524353e6ef42c0fedeb37f0efbfcad` |
| Evidence directory | `V:\Co work\Projects\Retail\audit-out\2026-08-10-115208-7871e57` (external to every worktree) |
| Run status | `complete-with-findings-or-gaps` |
| Findings | 20 — 5 P0, 11 P1, 4 P2 |
| Mandatory unmeasured | 14 |
| Open external gates | 10 |

Run conditions: clean detached linked worktree at the frozen commit
(`audit-baseline-7871e57`), `--mode baseline --run-tests`, product baseline
pinned to the anchor. The dirty primary worktree was **not** audited
(addendum §7). 17 evidence artefacts written; the audited tree was verified
unchanged after the run.

---

## 1. Result distribution — all 58 checks

| Audit | Pass | Fail | Unmeasured | N/A |
|---|---:|---:|---:|---:|
| A1 Architecture and coupling | 5 | 2 | 0 | 0 |
| A2 Duplication and ownership | 0 | 5 | 0 | 0 |
| A3 Semantic capability inventory | 3 | 0 | 2 | 0 |
| A4 Data and storage integrity | 3 | 3 | 0 | 0 |
| A5 Tests and guard rails | 4 | 0 | 1 | 0 |
| A6 UI, responsive, i18n, a11y | 1 | 2 | 2 | 0 |
| A7 Protocol stability | 1 | 2 | 2 | 0 |
| A8 Security and privacy | 0 | 3 | 2 | 0 |
| A9 Build and release reproducibility | 2 | 0 | 3 | 0 |
| A10 Performance and resources | 1 | 0 | 4 | 0 |
| A11 Documentation currency | 2 | 3 | 0 | 0 |
| **Total** | **22** | **20** | **16** | **0** |

58 checks accounted for. Per addendum §8 this is **not** acceptance: mandatory
`unmeasured` and `fail` results are explicit remediation gates.

## 2. P0 findings (5)

| Check | Title | Key metric |
|---|---|---|
| A4-02 | Persistent-artifact classification | 98 unclassified artefacts (33 device-local, 50 portable, 6 re-derivable, 0 forbidden) |
| A4-03 | Storage classification/use consistency | 1 contradiction |
| A8-02 | Export policy bypass | 9 bypasses across 3 files, 4 unresolved paths |
| A8-03 | Fail-open authentication and PIN controls | 11 fail-open paths across 95 functions, 142 unresolved |
| A8-05 | Unapproved remote runtime behavior | 24 unapproved remote calls in 14 files, 23 unresolved dynamic targets |

All three A8 P0s are **definite violations**, so under the U1 conservative rule
they are `fail`, not `unmeasured` — the rule's fail branch, working as designed.
Each also reports `staticDiscoveryComplete: false`, meaning the true counts may
be higher; these are lower bounds, not totals.

## 3. Mandatory unmeasured (14) — grouped by cause

**Deliberate: evidence requires a human or a device (6).** Not runner defects.
- A10-04, A10-05 — owner physical-device DAT-02 and retained-memory acceptance.
- A6-04, A6-05 — rendered UI evidence absent (no browser matrix supplied).
- A10-01, A10-02 — attested shell/module timing not supplied. *(informational,
  not in the mandatory 14, listed here for completeness)*
- A3-05 — 7 authoritative documents carry 0 machine-readable capability claims.
- A8-01, A8-04 — heuristic absence, no complete discovery authority. **This is
  exactly the U1 rule preventing a false pass**: A8-01 found 0 high-confidence
  PII flows and A8-04 found 0 verified secrets across 330 text files, and
  neither is allowed to report `pass` on absence alone.

**A7 protocol (2).** A7-01 `STATIC_DISCOVERY_COVERAGE_INCOMPLETE`; A7-03
unresolved receiver types. Same conservative rule.

**A3-02 — the acceptance gate (1). Highest-value item in this run.**
The capability inventory is the one metric that must be **identical** before and
after the Modular HTML migration; it is the acceptance evidence that nothing
broke. It is `unmeasured` because of **23 conflicting capability IDs** out of 669
capabilities (483 visible-action, 86 persisted-outcome, 66 failure-posture,
22 permission, 12 route; 0 actionless modules).
**Consequence: until those 23 ID conflicts are resolved, the migration has no
usable acceptance oracle.** This should be fixed before migration work starts,
not after.

**A9 build (3) and A5 mutations (1) — measurement gaps, root-caused below.**

## 4. Root cause: A9-01 / A9-02 / A9-05 unmeasured

`A9-BUILD-COMPARISON.json` is a `SAAGAR_AUDIT_CONTROLLED_PROBE_FAILURE` with
reason **`AUDIT_BUILD_GRADLE_UNAVAILABLE`**. The two controlled builds did not run.

Cause, verified: `android/gradle/wrapper/gradle-wrapper.properties` sets
`distributionBase=GRADLE_USER_HOME` and
`distributionUrl=…/gradle-8.2.1-all.zip`. Receipt v2 deliberately gives each
build a **fresh isolated `GRADLE_USER_HOME`**, so the wrapper cannot see the
`gradle-8.2.1-all` distribution cached in the default `~/.gradle`, and must
download it. This host has no network access to `services.gradle.org`, so
`gradlew --version` exits non-zero and `buildToolchainIdentity()` throws.

**This is the isolation requirement colliding with an offline host — not a
runner defect and not a product defect.** The runner failed closed: A9-01/02/05
are `unmeasured` with `TWO_BUILD_EVIDENCE_ABSENT`, never a false pass. A9-03
(production seed enablement) and A9-04 (module manifest byte/hash integrity,
11 modules + 2 shared assets, 0 mismatches) still measured and passed.

Options for the owner, none of which may be taken unilaterally — all touch
frozen tooling or the environment:
1. **Accept as an open gate.** Honest, costs the reproducibility evidence.
2. **Re-run with network access** so the wrapper can fetch its distribution.
   No code change; the cleanest path.
3. Pre-seed the isolated `GRADLE_USER_HOME` from the local cache. This weakens
   the receipt-v2 isolation contract and is a post-freeze tooling change —
   **post-baseline backlog**, not admissible under addendum §2.

## 5. Root cause: A5-05 unmeasured

`A5-MUTATIONS.json` contains **5 of 6** required mutation domains — `auth`,
`backupRestore`, `etpPublication`, `export`, `money` all captured with
`detected: true`, `exitCode: 1`, in disposable worktrees. **`storage` is
missing**, so A5 rejects the set with `MUTATION_EVIDENCE_ROWS_INVALID` and goes
`unmeasured`.

Reproduced directly. The `storage` mutation
(`storage-native-batch-bound-v1`, `www/storage-core.js`,
`var NATIVE_BATCH_OPS = 32;` → `64`) is applicable: the pinned file SHA-256
`4e8accc0…` matches the target exactly and the literal occurs once. The mutated
test **is** detected — `tests/native-incremental-storage-runtime.test.mjs` fails
at line 158 with the named assertion. But the mutated run takes **~150 s**,
while `capture-mutations.mjs` sets `TEST_TIMEOUT_MS = 120_000`. The run is
killed, `captureOne()` returns null on the signal, and the row is dropped.

**The guard rail itself is healthy — the runner simply cannot record it inside
its own timeout.** Unmutated, the same test passes in 0.14 s; the mutation makes
it slow, not silent. Fail-closed, no false pass. The fix (raise the timeout for
this domain, or bound the mutated run differently) is a post-freeze tooling
change and therefore **post-baseline backlog** under addendum §2 — it is a lost
measurement, not product data loss, auth bypass, false acceptance or evidence
corruption.

## 6. Open external gates (10)

All `open`, all human/device/legal — none of which any code change can close:
`GATE-UPDATE-PHYSICAL`, `GATE-UPDATE-API23`, `GATE-ETP-PHYSICAL`,
`GATE-ETP-INTERRUPTION`, `GATE-ETP-PRODUCTION`, `GATE-ETP-EXCEPTIONS`,
`GATE-PAYMENTTYPE25`, `GATE-NATIVE-LANGUAGE`, `GATE-UAT`, `GATE-RELEASE`.

## 7. What the runner got right

- Product fingerprint at the target equals the anchor exactly.
- Every probe failure produced bounded `unmeasured` evidence, never a pass.
- The three A8 definite violations still reported `fail` while their absence
  counterparts reported `unmeasured` — both halves of the U1 rule exercised on
  real data.
- The audited tree was byte-unchanged after mutations and probes.
- No secret value, raw PII, local path or raw exception appears in the output.

## 8. Non-claims

- Nothing has been committed or pushed. Evidence is external only.
- No two-build reproducibility evidence exists (§4). No rendered-UI, device,
  timing, UAT, legal, signing or release acceptance exists.
- 22 passing checks are not acceptance; 16 unmeasured remain open gates.

## 9. Recommended order before Modular HTML remediation

1. **A3-02's 23 conflicting capability IDs** — without a stable inventory the
   migration has no acceptance oracle. Do this first.
2. The 5 P0 findings (A4-02, A4-03, A8-02, A8-03, A8-05).
3. Decide the A9 path (§4) — a networked re-run is the cheapest honest fix.
4. Post-baseline backlog: A5 storage-mutation timeout; the two items from the
   freeze review (`staticDiscoveryAuthority` guard,
   `STATIC_DISCOVERY_COVERAGE_INCOMPLETE` marker).

Modular HTML remediation must not start without owner authorization.
