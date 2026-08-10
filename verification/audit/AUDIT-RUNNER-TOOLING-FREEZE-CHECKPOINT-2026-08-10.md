# Audit Runner — Tooling Freeze Checkpoint

**Date:** 2026-08-10 (Asia/Kolkata)
**Exit-sequence step:** 11 (closure addendum §6) — created immediately before the
tooling-freeze commit at step 12.
**Branch:** `agent/etp-retail-runtime`
**Pre-commit HEAD:** `2ef99dcc2c90beba029d79014afe23edfe1f4c36`
**Product anchor:** `88ba11842613f29173f436a39ca60f12b33e5085`

This checkpoint records the state that the freeze commit captures. It is not an
acceptance claim. Per addendum §8, "audit runner complete" means the runner is
committed and frozen with product bytes still matching `88ba118` and all
required runner tests passing. It does **not** mean all audit checks pass, and
no baseline evidence exists yet.

---

## 1. Exit-sequence status

| Step | Requirement | Status |
|---|---|---|
| 1 | Verify branch, HEAD, Git status, exact temporary-artifact inventory | done — §2 |
| 2 | A7/A8/C-07 conservative semantics | done in U1 |
| 3 | Controlled-build receipt v2 + fixture tests | done in U2 |
| 4 | Syntax checks for all canonical modules + central test | done — 24 modules, 0 failures |
| 5 | Complete central self-test, zero non-passing | done — 55/55 |
| 6 | One independent final review | done — §4, verdict PASS |
| 7 | Remove inventoried temporary patch artifacts after owner approval | **owner directed KEEP all 59** — no deletion performed, §3 |
| 8 | `git diff --check`, staging empty | done — §2 |
| 9 | Complete UTC offline product suite at exact declared counts | done — 492/492, §5 |
| 10 | Product fingerprint exactly equals anchor | done — §6 |
| 11 | Final tooling-freeze checkpoint | this document |
| 12 | Tooling-freeze commit | next action, §7 |
| 13-15 | Baseline run, review, evidence commit + push | NOT started — separate owner decision |

## 2. Identity at freeze

| Item | Value |
|---|---|
| Branch | `agent/etp-retail-runtime` |
| HEAD before commit | `2ef99dcc2c90beba029d79014afe23edfe1f4c36` |
| Staging area | empty |
| `git diff --check` | clean |
| Working tree | dirty by design, audit-control paths only |
| Canonical audit modules | 24 `.mjs`, all `node --check` clean |
| Central self-test | 55 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo |

No product path appeared in the diff at any point during U3/U4 or U5.

## 3. Temporary-artefact hold — owner decision recorded

| Count | Location | Disposition |
|---|---|---|
| 11 | `scripts/audit/final-*.patch` (in repo) | **KEEP** — owner approved 2026-08-10 |
| 48 | `V:\Co work\Projects\Retail\controlled-*.patch` (outside repo) | **KEEP** — owner approved 2026-08-10 |
| **59** | total | matches the recorded hold exactly |

The owner explicitly directed that all 59 files be retained, so exit-sequence
step 7 performs **no deletion**. Nothing was deleted, moved or renamed.

Other residue in audit tooling (`*.rej`, `*.tmp`, `*.next`, `*.orig`): **zero**.

### 3.1 Consequence for the freeze commit — load-bearing

`scripts/audit/` is entirely untracked, and the 11 `final-*.patch` files are
**not** covered by any ignore rule. A bulk `git add scripts/audit/` would
therefore commit them, violating addendum §7 ("do not commit any `*.patch`
file") and — because `isAuditToolingPath()` matches everything under
`scripts/audit/` — permanently binding those patches into the audit-tooling
fingerprint.

This cannot be solved with a `.gitignore` rule: `.gitignore` is a product path,
so editing it would move the product fingerprint off `88ba118` and break
exit-sequence step 10.

**Therefore the freeze commit stages an explicit pathspec with
`':(exclude)scripts/audit/*.patch'`.** A dry run confirmed the staged set is
37 files, containing zero `*.patch` files and zero product paths.

## 4. Independent final review (step 6)

One independent adversarial reviewer, as permitted by addendum §5 (one review
only). Scope: U0-U4 closure work.

**Verdict: PASS — safe to freeze.** No finding in any of the four qualifying
classes of addendum §2: no product data loss or silent corruption, no
authentication or security bypass, no false formal acceptance by a mandatory
gate, no audit-evidence corruption, fabrication or disclosure.

Confirmed clean by the reviewer, independently of the implementer:

- `metric.staticDiscoveryComplete` cannot be set true without authority.
  `buildContext()` returns a frozen object with no `staticDiscoveryAuthority`
  key and `run.mjs` never adds one, so A7-01/02/03/05 and A8-02/03/04/05 are
  structurally `unmeasured`-or-`fail` in v1. Heuristic absence cannot reach
  `pass`.
- C-07 cannot match on incomplete authority, and a baseline produced by looser
  tooling is rejected because `loadBaselineEvidence` pins both the tooling SHA
  and the tooling tree hash.
- A9 cannot pass from equal APK hashes alone; any disagreement between
  `compare-apks` and A9's deliberately weaker recomputation yields
  `BUILD_EVIDENCE_SCHEMA_INVALID` → `unmeasured`. External build evidence is
  rejected outright.
- **Every** receipt-v2 consumer requires `schemaVersion` 2 — `a9.mjs`,
  `a10.mjs`, `compare-apks.mjs`, `controlled-probes.mjs`, `run.mjs`. The
  previously stale `a10.mjs` is genuinely fixed.
- No gate fails open; `unmeasured` is never summarised as passing.
- No local path, dependency content, credential, PII, workbook byte or raw
  build/parser exception can leak into audit output.
- U0's `gradleVersionLauncher()` is genuinely process-CWD independent.
- The U3 prefix rule is used by both classifiers, normalises backslashes, is
  anchored, and cannot swallow a real product document. Case variants fall
  through to *product*, which is the conservative direction.
- Both new U3 tests are load-bearing against reversion of either half of the fix.

### 4.1 Review finding folded in before the freeze

The reviewer showed the U4(d) §5 wording was inaccurate in the **opposite**
direction to the original defect: `auditResult()` does centrally sort `checks`
by id, and `run.mjs` sorts `findings` and `mandatoryUnmeasured`. The
implementer's replacement sentence understated central normalisation.

Verified directly (`lib.mjs auditResult()`, `run.mjs:328` and `run.mjs:330`) and
corrected before freezing: §5 now states that `evidence` arrays are the only
arrays centrally sorted *and* deduplicated *and* length-bounded together, that
`checks`, `findings` and `mandatoryUnmeasured` are sorted by id without
deduplication, and that all other arrays keep producer order. The self-test was
re-run after this edit: still 55/55.

This is a documentation-accuracy correction inside already-open U4 scope, not
scope expansion under addendum §2. Freezing a knowingly inaccurate sentence into
the controlling program document was not acceptable.

### 4.2 Post-baseline backlog (explicitly NOT fixed now)

- `staticDiscoveryAuthority` is an in-process object toggle with no
  authentication of its own. Unreachable today. If any future CLI option or
  evidence file is ever mapped onto `context.staticDiscoveryAuthority`, `pass`
  becomes reachable without proof — that mapping must carry its own guard.
- `staticDiscoveryEvidence()` drops the `STATIC_DISCOVERY_COVERAGE_INCOMPLETE`
  marker when findings or unresolved rows exist, so an `unmeasured` A8 check's
  evidence carries no incompleteness code. The `metric.staticDiscoveryComplete:
  false` flag still does. Cosmetic.

## 5. Product regression at freeze (step 9)

`TZ=UTC npm run test:offline`, full chain including `pretest:offline`:

| Sub-suite | Declared | Observed |
|---|---|---|
| c1 | 12 | 12 |
| mobile | 6 | 6 |
| settings | 8 | 8 |
| language | 4 | 4 |
| etp | 128 | 128 |
| modular | 72 | 72 |
| main offline | 262 | 262 |
| **total** | **492** | **492** |

Zero fail, cancelled, skipped or todo in every sub-suite. Counts match the
declared `testEvidence` counts the runner asserts.

## 6. Product fingerprint at freeze (step 10)

```text
anchor  88ba11842613f29173f436a39ca60f12b33e5085
anchor  {"fileCount":295,"totalBytes":10515347,"treeSha256":"06643f46f89834191127478e2b6eba5c7e524353e6ef42c0fedeb37f0efbfcad"}
current {"fileCount":295,"totalBytes":10515347,"treeSha256":"06643f46f89834191127478e2b6eba5c7e524353e6ef42c0fedeb37f0efbfcad"}
EXACT EQUALITY: true
```

**Method note, load-bearing.** `core.autocrlf=true` in this repository, and 37 of
the 295 product files differ on disk from their Git blobs as a result. The
fingerprint must be computed from **Git blobs** via `revisionFingerprint()` /
`context.productFingerprint`, which is what the runner does and what was done
here. A hand-run recomputation over worktree bytes would falsely report drift
and could be misread as a freeze blocker. Anyone repeating step 10 must use the
blob path.

The U3 fix is what keeps this equality true once the addendum is committed at
step 12: the addendum is now an audit-control path, so the product set stays at
295 rather than becoming 296.

## 7. Freeze commit contents (step 12)

37 files, explicit pathspec, `*.patch` excluded:

- `docs/audit/AUDIT-PROGRAM-v1.md` (U4 edits)
- `docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md`
- `docs/audit/HANDOFF.md`
- 24 canonical audit modules under `scripts/audit/` including
  `scripts/audit/test-registry.json`
- `tests/whole-app-audit-runner.test.mjs`
- 9 checkpoints under `verification/audit/`, including this one

Zero product paths. Zero `*.patch` files.

### 7.1 File identities entering the freeze

```text
scripts/audit/lib.mjs                                      |   7808 | 3886e41bd60422ff9a22df7b040d073db46477689bcc9baa44774b0d9d356682
scripts/audit/runner-support.mjs                           |  22466 | b395623670ec56aa44626c77fbff69857fa9dac4121d07d4d60c86699809193b
tests/whole-app-audit-runner.test.mjs                      | 117029 | aa34ff84ee67d09298b7ac26ae1c31df9c565091188958b64bcb7e9699d387ea
docs/audit/AUDIT-PROGRAM-v1.md                             |  23536 | 577bd647422cf2efae114b7e830d61114822612a66b2b8c9738b7752f9f1d849
docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md |   7534 | c63f90aa4c39a4c09d51312a76a0a57b1e639b726d7632bbefdd46903665ffb0
```

`AUDIT-PROGRAM-v1.md` moved from `aff43b1b…` to `577bd647…` when the §4.1 review
finding was folded in. The addendum is byte-identical to its crash-checkpoint
identity.

## 8. Non-claims

- No baseline evidence exists. No mutation capture, no controlled builds.
- No audit check has been run against the product; 58-check review has not happened.
- Nothing has been pushed. The freeze commit is local only.
- No physical-device, rendered-UI or owner acceptance evidence was created.
- `55/55` is runner self-test evidence only; `492/492` is product regression only.
- PHP remains excluded. Modular HTML remediation must not start without owner
  authorization.

## 9. Next

Step 13 — from a **clean detached linked worktree at the frozen commit**, run
the controlled mutations, the two controlled builds and the baseline audit.
Never from this dirty primary worktree (addendum §7). Then step 14 review of all
58 checks and open gates, then step 15 evidence commit and push, which needs
separate owner approval.
