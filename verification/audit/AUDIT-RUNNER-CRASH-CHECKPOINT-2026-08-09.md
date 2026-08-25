# SAAGAR Whole-App Audit Runner Crash Checkpoint

Date: 2026-08-09 (Asia/Calcutta)

## Resume objective

Continue the owner-approved sequence without starting Modular HTML remediation:

1. Finish and independently harden the whole-app audit runner.
2. Run the focused runner tests and the complete offline product regression.
3. Commit and freeze the audit tooling.
4. Verify product bytes still exactly match product anchor `88ba11842613f29173f436a39ca60f12b33e5085`.
5. Capture two isolated builds and compare raw and normalized APK identities.
6. Run the baseline audit from an isolated clean detached worktree.
7. Commit and push the baseline evidence.
8. Only then begin Modular HTML remediation.

## Exact Git state at checkpoint

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `agent/etp-retail-runtime`
- HEAD: `2ef99dcc2c90beba029d79014afe23edfe1f4c36`
- HEAD commit: `Establish whole-app audit program`
- Product anchor: `88ba11842613f29173f436a39ca60f12b33e5085`
- `main`: `9bf9653` tracking `origin/main`
- The current branch has no configured upstream shown by `git branch -vv`.
- Staging area is empty.
- Working tree contains only untracked audit-control tooling/evidence files:
  - `scripts/audit/**`
  - `tests/whole-app-audit-runner.test.mjs`
  - this checkpoint under `verification/audit/**`
- No product source file is modified.
- Nothing from the current runner work is committed or pushed.
- Commit `2ef99dc` is local and has not been pushed in this checkpoint sequence.

## Product-byte preservation evidence

Current product paths were compared with Git blobs at `88ba118`:

- Match: `true`
- Files: `295`
- Bytes: `10,515,347`
- SHA-256: `06643f46f89834191127478e2b6eba5c7e524353e6ef42c0fedeb37f0efbfcad`

The audit-control exclusions are intentionally narrow. Product files, normal tests, roadmap documents, and non-audit verification remain part of the product fingerprint. Audit runner files, its self-test, the controlling audit program, and `verification/audit/**` are audit-control state.

## Completed work

### Controlling documents

- `docs/audit/AUDIT-PROGRAM-v1.md` and `docs/audit/HANDOFF.md` were corrected and committed separately in `2ef99dc`.
- The controlling audit program is now included in the frozen tooling identity.

### Runner and audit modules

- A1-A11 exist with all 58 stable checks.
- The current scripts are syntax-valid:
  - `scripts/audit/run.mjs`
  - `scripts/audit/runner-support.mjs`
  - `scripts/audit/comparison.mjs`
  - `scripts/audit/capture-build.mjs`
  - `scripts/audit/capture-mutations.mjs`
- Product fingerprints use canonical Git blob bytes, avoiding CRLF checkout drift.
- The Windows npm launcher uses `cmd.exe`; the shared Gradle launcher also uses the Windows-safe wrapper path.
- Output containment, linked detached-worktree checks, evidence bounds, canonical JSON, and sanitized stable errors are implemented.
- Comparison mode now has an explicit target SHA, committed baseline evidence loading, an evidence manifest, comparison approvals, migration scope, and high-severity waiver logic in progress.
- `capture-mutations.mjs` exists and has not been executed.

### APK/build evidence hardening

- APK comparison validates ZIP structure, CRC, local/central metadata, data descriptors and ZIP64 refusal.
- BUILD sidecar fingerprints use canonical serialization both before and after JSON persistence.
- Comparator output is named `SAAGAR_AUDIT_APK_COMPARISON`.
- A9 requires comparator-format evidence bound to the current target/product fingerprint; ambient environment JSON is no longer accepted.
- A9 recomputes identity/toolchain boolean consistency from the two captured build identities. Re-verify this after resume because the last independent review began before the final consistency patch.
- Build identity now includes Android compile SDK/platform bytes, installed build-tools executable hashes, Gradle/JDK versions, recipe hashes, and the installed npm dependency-tree hash.
- Read-only probe passed:
  - canonical fingerprint survives serialization: `true`
  - compile SDK: `34`
  - installed build-tools sets: `1`
  - npm dependency nodes: `544`

### External evidence guards

- A5 now expects a target/product/tooling-bound mutation envelope instead of accepting a bare array.
- A6 now requires exactly 72 target-bound rendered cells and rejects zero target/contrast measurements.
- A10 no longer accepts legacy summary JSON for physical-device or memory gates; it has a strict target/APK/device/instrumentation/environment envelope.
- No device-only test is marked passed by this checkpoint.

## Exact test state

Latest focused command:

`node --test tests/whole-app-audit-runner.test.mjs`

Result: **10 passed / 2 failed / 12 total**.

Failures are integration-test drift after the interrupted comparison hardening:

1. CLI fixture does not yet supply the newly mandatory `--target-sha`, producing `AUDIT_TARGET_SHA_INVALID`.
2. The old comparison fixture expects `comparison-pass`, but the new migration-scope/high-severity closure contract correctly returns `comparison-failed-or-unmeasured` without a valid identity-bound approval/waiver envelope.

All 58 A1-A11 modules executed successfully inside the focused test before those two assertion failures.

The last previously established complete offline baseline was 492/492. The complete suite has **not** been rerun after the latest runner hardening and must not be claimed current.

## Hard blockers before the tooling can be frozen

1. **Finish the interrupted runner/test integration.**
   - Update the CLI fixture with exact `--target-sha`.
   - Update comparison fixtures for the new identity-bound comparison-approval and migration-scope contract.
   - Recheck that `run.mjs` consistently uses `evidenceInputs.approval`; the current post-interrupt scan shows it does and shows no remaining `evidenceInputs.capability` access, but this needs a test.

2. **Close A5 internal false-pass conditions.**
   - Require `detected === true` to correspond to a non-zero test exit and a named assertion failure.
   - Bind each invariant to the frozen domain-specific mutation ID and exact test command, not only safe-looking strings.
   - Bind the output digest to capture output produced by the helper contract.
   - Make the helper verify its own complete tooling bytes against `auditToolingSha`, not merely require that SHA to be an ancestor.

3. **Do not allow self-attested rendered evidence to pass.**
   - The zero-measurement hole is closed.
   - A6 still needs a trusted, frozen capture-tool identity/observation contract; arbitrary positive counters and arbitrary 64-hex hashes must not establish a pass.
   - Until that producer/verifier exists, rendered checks must remain unmeasured.

4. **Do not allow self-attested physical-device evidence to pass.**
   - A10's strict schema is not enough because a public canonical hash can be recomputed over invented JSON.
   - Bind evidence to a frozen approved instrumentation artifact/protocol and a controlled capture/verification flow, or hard-disable pass until that exists.
   - Physical-device evidence remains absent and unmeasured.

5. **Bind optional shell/module timings before comparison use.**
   - Current shell/module timing inputs still need exact target/browser/environment/capture-tool identity and bounded sample counts.
   - Otherwise leave those timing checks unmeasured; static byte measurements remain valid.

6. **Complete a final independent review after the above fixes.**
   - Re-run syntax checks.
   - Re-run the focused self-test until all tests pass.
   - Run `git diff --check` plus an explicit untracked-file/temporary-patch inventory.
   - Confirm no `.patch`, `.next`, mutation worktree, or generated evidence residue remains.

## Safe resume order

1. Read this checkpoint and both controlling audit documents.
2. Verify branch, HEAD, empty staging area, and audit-only untracked scope.
3. Run `node --check` on all `scripts/audit/**/*.mjs`.
4. Fix the two focused test failures without weakening the new comparison gates.
5. Close the A5, A6 and A10 trust gaps above and add negative behavioral tests for every former false-pass path.
6. Run `node --test tests/whole-app-audit-runner.test.mjs` until fully green.
7. Run the complete offline regression and verify the exact seven-suite count distribution.
8. Recompute the product fingerprint against `88ba118`.
9. Commit only the frozen audit tooling/self-test (plus this audit-control checkpoint if deliberately retained).
10. From two disposable clean detached worktrees at the frozen tooling SHA, capture and compare APKs.
11. Optionally run the mutation helper only after its self-identity checks are complete.
12. Run the baseline audit from an isolated clean detached worktree.
13. Inspect generated findings and mandatory unmeasured checks honestly.
14. Commit `verification/audit/<run-id>/**`, push the branch, and verify the remote SHA/clean tree.
15. Do not begin Modular HTML remediation before that push and verification.

## Prohibitions carried forward

- Do not edit product behavior while finishing the audit baseline.
- Do not reset, overwrite, delete user-owned work, commit, or push unfinished tooling.
- Do not run the mutation helper against the live worktree.
- Do not claim rendered, physical-device, UAT, signing, release, language-fluency, or other device-only acceptance without real evidence.
- Do not start Modular HTML remediation yet.
