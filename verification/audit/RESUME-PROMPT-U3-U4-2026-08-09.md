# Resume Prompt — Audit Runner Closure U3/U4

Paste the block below into a fresh chat. It is self-contained.

---

```
Resume SAAGAR Whole-App Audit Runner Closure at U3 and U4.

Repository: V:\Co work\Projects\Retail\saagar-control-centre

=== READ FIRST, IN THIS ORDER ===
1. docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md   (process authority)
2. verification/audit/AUDIT-RUNNER-CLOSURE-PROGRESS-U0-U1-2026-08-09.md
3. verification/audit/AUDIT-RUNNER-CLOSURE-CRASH-CHECKPOINT-2026-08-09.md  (§6 U3/U4)
4. verification/audit/AUDIT-RUNNER-FINDINGS-AND-CLOSURE-LEDGER-2026-08-09.md
5. docs/audit/AUDIT-PROGRAM-v1.md — only for requirements not narrowed by the addendum

=== EXPECTED IDENTITY — verify before editing, stop if any differs ===
Branch:         agent/etp-retail-runtime
HEAD:           2ef99dcc2c90beba029d79014afe23edfe1f4c36
Product anchor: 88ba11842613f29173f436a39ca60f12b33e5085
Staging area:   empty
git diff --check: clean
Working tree:   intentionally dirty, audit-control paths ONLY
Self-test:      node --test tests/whole-app-audit-runner.test.mjs  ->  53/53,
                zero fail/cancelled/skipped/todo
Canonical modules: 24 files under scripts/audit/**/*.mjs, all node --check clean

Only these paths may appear in git status:
  docs/audit/  scripts/audit/  verification/audit/  tests/whole-app-audit-runner.test.mjs
Any other path in the diff is a product leak — STOP and report.

=== ALREADY DONE — do not redo ===
U0  Gradle launcher CWD independence. gradleVersionLauncher() now uses
    '.\\gradlew.bat --version'. A bare name failed when
    NoDefaultCurrentDirectoryInExePath=1. Both capture-build.mjs call sites
    inherit it from runner-support.mjs.

U1  Conservative A7/A8/C-07 semantics (closure addendum §3).
    runner-support.mjs exports staticDiscoveryAuthority(),
    conservativeStaticResult(), staticDiscoveryEvidence().
      definite violation                  -> fail
      no violation, complete authority    -> pass
      no violation, no complete authority -> unmeasured
    Applied to A7-01/02/03/05 and A8-02/03/04/05.
    A7-04 deliberately untouched — closed hash-bound set, not heuristic.
    A8-01 was already conservative.
    C-07: messageContract() requires BOTH result==='pass' AND
    metric.staticDiscoveryComplete===true on both sides.
    Guard test added: "no heuristic-clean A7 or A8 case reports pass without
    explicit discovery authority".

U2  Controlled-build receipt v2 (closure addendum §4), landed as one contract.
    - ambient node_modules junction REMOVED entirely, no fallback;
      each disposable worktree runs its own
      npm ci --ignore-scripts --no-audit --no-fund
    - bounded closure identity = {fileCount, totalBytes, sha256}; aggregates
      only, never paths or contents; fails closed on symlink escape, special
      files, case-fold collisions and size/count limits
    - dependency closure measured after install, before Gradle, after build;
      all three must match
    - fresh isolated GRADLE_USER_HOME per build, threaded through command() so
      the build actually uses it; distribution identity before and after
    - schemaVersion 2 across capture-build, compare-apks, a9, a10, run.mjs,
      controlled-probes
    - two-build agreement folded into toolchainMatch
    Guards added: all five schema consumers pinned to v2; receipt-agreement test
    proving identical APKs from a dependency- or gradle-drift fail toolchainMatch.
    NOTE: a10.mjs was found still on schemaVersion 1 by inspection, not by a
    failing test. Expect that class of gap.

=== YOUR SCOPE — U3 and U4 ONLY ===

U3 — Wire the closure addendum into audit-tooling identity.
  File: scripts/audit/runner-support.mjs
  (a) isAuditToolingPath() at ~line 149 currently accepts
      'docs/audit/AUDIT-PROGRAM-v1.md'. Add
      'docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md'.
  (b) The `required` array in verifyToolingIdentity() at ~line 174 must list the
      addendum too, so a missing addendum is AUDIT_TOOLING_FILESET_MISMATCH.
  Do NOT add the findings ledger, the crash checkpoint or the U0/U1 progress
  checkpoint. They are historical/control evidence, deliberately not
  self-referential tooling inputs (crash checkpoint §6 U3).
  Add a focused test asserting the addendum is required tooling and that its
  absence is rejected.

  (c) FREEZE BLOCKER — found 2026-08-09, NOT in the crash checkpoint's U3 text.
      scripts/audit/lib.mjs isAuditControlPath() is a DIFFERENT function from
      runner-support.mjs isAuditToolingPath(), and it does not match the
      addendum. Verified:
        isProductPath('docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md')
          === true
      The addendum is untracked today, so the product fingerprint is still
      295 files and still equals anchor 88ba118. But exit-sequence step 12
      COMMITS the addendum. The moment it is tracked it counts as a product
      file, the count becomes 296, and step 10/17 — "recompute the product
      fingerprint and require exact equality with 88ba118" — FAILS. The freeze
      cannot complete.
      Fix: add the addendum to isAuditControlPath() in scripts/audit/lib.mjs so
      it is excluded from the product fingerprint, exactly as
      docs/audit/HANDOFF.md and docs/audit/AUDIT-PROGRAM-v1.md already are.
      Consider a stable prefix rule (docs/audit/AUDIT-PROGRAM-v1) rather than a
      dated exact string, so the next addendum does not reintroduce this.
      Add a test asserting the addendum is a control path and that the tracked
      product file count stays 295 with the addendum present.
      This is not scope expansion under addendum §2 — it fixes a false
      REJECTION that blocks the exit sequence, the same class as U0.

U4 — Reconcile the base program with what is implemented.
  File: docs/audit/AUDIT-PROGRAM-v1.md
  (a) Add a direct reference to
      docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md, stating it is
      the controlling authority for runner closure until baseline evidence is
      committed.
  (b) §3, the sentence at line ~54 reading "...links only the audited root's
      `node_modules`, and verifies identity and cleanup." That wording is now
      FALSE. Replace with receipt-v2 reality: an independent
      npm ci --ignore-scripts --no-audit --no-fund per disposable worktree, no
      ambient junction, bounded dependency-closure identity checked after
      install / before Gradle / after build, isolated per-build GRADLE_USER_HOME,
      bounded Gradle distribution identity before and after, and exact
      receipt-v2 agreement across both builds.
  (c) Add the conservative A7/A8 result rule to §4 or the A7/A8 catalogue
      entries: heuristic absence is never pass; definite violation is fail;
      pass requires explicit complete discovery authority.
  (d) §5 line ~126 reads "Evidence strings and arrays are bounded and
      deterministically sorted." Narrow it: only CHECK-EVIDENCE arrays are
      centrally sorted and deduplicated. The current generic wording overstates
      it. (Crash checkpoint §6 U4.)

=== WORKING DISCIPLINE ===
- One primary agent. No broad parallel agents.
- Run focused tests at coherent boundaries, not after every edit.
- Expand scope ONLY for proven product data loss, auth/security bypass, false
  formal acceptance, or audit-evidence corruption. Everything else is
  post-baseline backlog.
- Do NOT edit product code.
- Do NOT commit, push, reset, delete or move anything.
- Do NOT delete the temporary patch files (see hold below).
- Do NOT run the baseline audit or a real controlled build.
- Do NOT start Modular HTML remediation.
- PHP is excluded.

=== TEMPORARY ARTEFACT HOLD — 59 files, do not touch ===
  11  scripts/audit/final-*.patch                        (in repo, never commit)
  48  V:\Co work\Projects\Retail\controlled-*.patch      (outside repo)
No owner approval exists for deletion of this exact set. Re-inventory and report;
ask before removing anything.

=== ON COMPLETION ===
1. node --check every file under scripts/audit/**/*.mjs (expect 24 ok)
2. node --test tests/whole-app-audit-runner.test.mjs — expect >= 53 passing,
   zero fail/cancelled/skipped/todo
3. Confirm no product path entered git status
4. git diff --check, confirm staging empty
5. Record byte counts and SHA-256 for every file you changed
6. Write a progress checkpoint under verification/audit/
7. Report, then STOP. U5 (verification, freeze, baseline) needs owner approval
   on the temp-file inventory before it can start.

Give a short recovery report first — identity, any drift from the hashes below,
and confirmation the scope is clean. Then proceed autonomously within U3/U4.
```

---

## Reference — file identities at handoff

Recorded after U0/U1/U2. Any drift means someone edited in between; investigate
rather than overwrite.

```text
scripts/audit/runner-support.mjs          |  22369 | 818aebb4703e411423f2a3c2c907a6c3c4aea9cf6c9b72de02140c7236974919
scripts/audit/audits/a7.mjs               |  28096 | 197f67effe18bb894ad31f7f324cd607ed4a3d1cb2e964e3cfbd45b61e930031
scripts/audit/audits/a8.mjs               |  41788 | 9799f59af8fd52a359f04c2b56f7e814a1995763609c96273da2ee4bc8c1880e
scripts/audit/audits/a9.mjs               |  26163 | e3c6e538a1ecaba61046acc8b38d3a6acd1ce4eec486bd4ef586daff00828c83
scripts/audit/audits/a10.mjs              |  23861 | 4f0a2de8b068440f418fcd620551738028fc0a3133693960595474568fb2f98a
scripts/audit/capture-build.mjs           |  44844 | d27c22e59efd3982b5fab4e278ea00337a10963c460f86796ecf6149b4271895
scripts/audit/compare-apks.mjs            |  24939 | a5ab9adeda7a87d2b00fc620234b7f094eeb356b85c78f980379f81fbd1e57e1
scripts/audit/controlled-probes.mjs       |  17489 | c0096be2b435d429501573d5867b2c8f5de4fdbf9affdbbc9d9ab29d58dd5be1
scripts/audit/comparison.mjs              |  29033 | 068dfcda4a972d50495d4c470b40706b3c759c003966b413fb0859631f1760e9
scripts/audit/run.mjs                     |  25957 | 9d511ab6ab865f8add8e678ed3c945ac0c22ea82b4e1a05adc2c56f2ab1408d6
tests/whole-app-audit-runner.test.mjs     | 113095 | 1d72ff5c31b42cc12ba6c956bcb4d503e860c685490eac3c3fcd3bc46a8c570c
```

Unchanged since the crash checkpoint (verify these too):

```text
docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md | 7534  | c63f90aa4c39a4c09d51312a76a0a57b1e639b726d7632bbefdd46903665ffb0
verification/audit/AUDIT-RUNNER-FINDINGS-AND-CLOSURE-LEDGER-2026-08-09.md | 10018 | 8d59637c75fd2cef0025487a364e5fdb5f8962e2f6ce81c90cce25c4823e6298
```

`docs/audit/AUDIT-PROGRAM-v1.md` **will** change under U4 — its crash-checkpoint
hash `2b51fdff…` is expected to become stale, and the U3 tooling-fileset change
means the tooling fingerprint moves with it. That is intended, not drift.
