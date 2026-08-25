# SAAGAR Whole-App Audit Program v1 - Closure Addendum

**Date:** 2026-08-09 (Asia/Kolkata)  
**Status:** current controlling authority for completing and freezing the v1 audit runner  
**Base program:** `docs/audit/AUDIT-PROGRAM-v1.md`  
**Product anchor:** `88ba11842613f29173f436a39ca60f12b33e5085`

## 1. Purpose and authority

This addendum narrows the remaining work after the audit-runner design and adversarial review consumed substantially more time and usage than planned. It does not erase the base program. Where this addendum conflicts with the base program's runner-closure process, this addendum controls until the baseline evidence is committed.

The next session must read, in order:

1. this addendum;
2. `verification/audit/AUDIT-RUNNER-FINDINGS-AND-CLOSURE-LEDGER-2026-08-09.md`;
3. `verification/audit/AUDIT-RUNNER-CLOSURE-CRASH-CHECKPOINT-2026-08-09.md`;
4. the base audit program only for requirements not narrowed here.

Do not restart audit-runner design from the beginning. Do not run the baseline audit from an uncommitted or partially verified runner.

## 2. Frozen remaining scope

Only the following implementation work remains in the closure phase:

1. apply the conservative result semantics in section 3 to A7, A8 and C-07;
2. complete controlled-build receipt v2:
   - an independent `npm ci --ignore-scripts --no-audit --no-fund` in each disposable build worktree;
   - a bounded aggregate identity of the complete installed dependency tree before generation and before Gradle;
   - a fresh isolated `GRADLE_USER_HOME` for each build;
   - a bounded aggregate identity of the actual Gradle distribution used before and after the build;
   - identities for generated Android and the Cordova module inputs that participate in the build;
   - exact schema-v2 validation and two-build agreement through capture, comparison and A9;
3. align the base program wording with the implemented receipt-v2 contract;
4. run the bounded verification and freeze sequence in section 6.

No other audit enhancement enters this phase unless it proves one of:

- product data loss or silent corruption;
- an authentication or security bypass;
- false formal acceptance by a mandatory audit gate;
- corruption, fabrication or disclosure in audit evidence.

Cosmetic quality, theoretical hardening, broader syntax recognition and maintainability improvements become post-baseline backlog.

## 3. Conservative static-analysis rule

A7 and A8 are heuristic static discovery, not complete JavaScript proofs. Therefore:

- a definite violation is `fail`;
- absence of a known violation is `unmeasured` unless an explicit complete registry, trusted runtime probe or independently authenticated scanner proves complete coverage;
- heuristic absence must never become `pass`;
- inventories and redacted findings remain useful evidence even when the result is `unmeasured`;
- C-07 is `unmeasured` whenever either baseline or comparison lacks explicit complete protocol authority.

This rule closes the false-pass class without continuing syntax-by-syntax regex expansion. Previously discovered alias, computed-call, comment/regex-decoy, control-flow, auth-expression, navigation and secret-key variants remain regression examples, not invitations to reopen the architecture.

The governed tooling refresh adds two narrow fail-closed refinements without weakening this rule. First, A7-01 may receive the runner-bound `a7-message-contract-census-v2` authority: all supported message syntax is enumerated and unresolved sites remain first-class hash-bound inventory rows, while A7 lifecycle/shape/global checks remain heuristic. Second, A8-05 treats an already discovered remote-capable call with an unresolved target as policy non-compliance (`fail`); that is not an inference from absence.

## 4. Controlled-build receipt v2 boundary

A9 cannot pass from two equal APK hashes alone. Both builds must prove they used independently prepared and exactly identified inputs.

The receipt-v2 implementation must:

- use no public build-evidence pass input and no ambient `node_modules` junction fallback;
- validate product, target and tooling identity before capture;
- expose only bounded counts and hashes, never local paths, dependency contents, credentials or raw build exceptions;
- reject symlink escapes, special files, case-fold collisions and configured size/count/path limits;
- require the installed dependency closure to remain unchanged between installation and Gradle execution;
- require the selected Gradle distribution closure to remain unchanged through the build;
- bind the selected Gradle launcher, wrapper, generated recipe, Android configuration and generated Cordova module closure;
- require exact receipt-v2 agreement between both controlled builds;
- leave A9 `unmeasured` on installation, toolchain, build, cleanup or evidence failure.

The signing parser must continue to reject credential-variable reassignment or shadowing, hard-coded signing material, overridden release guards, competing debuggable/signing assignments and malformed generator insertion. Gradle execution identity must prove the actual build JVM contract. The product baseline argument must remain fixed to the product anchor.

## 5. Review and usage limits

- Use one primary implementation agent. Do not deploy broad parallel agents for closure.
- Use focused tests at coherent module boundaries, not after every small edit.
- Permit one independent final adversarial review after all closure code is stable.
- A new review finding expands implementation only under the four criteria in section 2.
- Otherwise record it as post-baseline backlog or accepted `unmeasured` scope.
- Save a checkpoint after each coherent boundary and before a long build or audit run.

## 6. Required exit sequence

The closure phase exits only in this order:

1. verify branch, HEAD, Git status and the exact temporary-artifact inventory;
2. finish A7/A8/C-07 conservative semantics;
3. finish controlled-build receipt v2 and its focused fixture tests;
4. run syntax checks for all canonical audit modules and the central runner test;
5. run the complete central audit-runner self-test with zero fail, cancelled, skipped or todo;
6. perform one independent final review under section 5;
7. remove only inventoried temporary patch artifacts after explicit owner approval;
8. run `git diff --check` and confirm the staging area is empty;
9. rerun the complete UTC offline product suite and require the exact declared suite counts with zero non-passing assertions;
10. recompute the product fingerprint and require exact equality with the product anchor;
11. create the final tooling-freeze checkpoint;
12. commit the canonical audit program, addendum, runner, tests and checkpoints as the tooling-freeze commit;
13. from a clean detached linked worktree at that frozen commit, run the controlled mutations, two controlled builds and baseline audit;
14. review all 58 checks and open gates;
15. commit and push the exact authenticated baseline evidence separately;
16. begin Modular HTML remediation only after owner authorization.

## 7. Prohibitions

Until section 6 is complete:

- do not edit product code;
- do not start Modular HTML remediation;
- do not claim device, rendered UI, mutation, two-build or baseline acceptance without the required evidence;
- do not commit any `*.patch` file;
- do not delete, move, commit or push without the applicable owner approval;
- do not run the baseline against the dirty primary worktree;
- do not reinterpret earlier green fixture tests as completed controlled builds.

## 8. Completion definition

"Audit runner complete" means the runner is committed and frozen, product bytes still match `88ba118`, and all required runner tests pass. "Baseline complete" is separate: the isolated controlled probes and audit have run, their evidence has been reviewed, and the exact evidence commit has been pushed. Neither term means all audit checks pass; mandatory `unmeasured` and `fail` results remain explicit remediation gates.
