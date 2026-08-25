# SAAGAR Audit Runner - Findings and Closure Ledger

**Date:** 2026-08-09 (Asia/Kolkata)  
**Branch at capture:** `agent/etp-retail-runtime`  
**HEAD at capture:** `2ef99dcc2c90beba029d79014afe23edfe1f4c36`  
**Product anchor:** `88ba11842613f29173f436a39ca60f12b33e5085`  
**Authority:** read with `docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md`

## 1. Executive status

The SAAGAR product remains outside the audit-control diff. The audit runner is implemented in substantial part but is not frozen, committed or authorized to run the baseline. The last surviving central self-test executed after the crash passed `50/50` with zero fail, cancelled, skipped or todo. That result validates the current fixture suite; it is not controlled mutation, two-build or baseline evidence.

The complete product offline suite last passed `492/492` before the latest audit-only hardening edits:

- C1: 12
- Mobile: 6
- Settings: 8
- Language: 4
- ETP: 128
- Modular: 72
- Main offline: 262

Because later edits were confined to audit-control paths, no product change is known. Nevertheless, the final `492/492` run must be repeated after tooling stabilizes.

The product fingerprint was measured as:

- file count: 295
- total bytes: 10,515,347
- tree SHA-256: `06643f46f89834191127478e2b6eba5c7e524353e6ef42c0fedeb37f0efbfcad`

It matched the product anchor. The current central self-test also confirms the anchor equality guard, but final fingerprint evidence must be regenerated immediately before the tooling-freeze commit.

## 2. Completed and surviving

### 2.1 Runner and evidence foundation

- A1-A11 implement 58 stable check identifiers.
- Exact target, product and audit-tooling identity contracts exist.
- Product fingerprints use Git blob bytes, avoiding CRLF checkout drift.
- The runner requires an exact target SHA, complete declared tests and an external output directory.
- The output basename binds the target SHA prefix.
- The evidence contract is 17 authenticated artifacts plus `EVIDENCE-MANIFEST.json`, 18 files total.
- Baseline loading verifies committed evidence bytes and the authenticated manifest.
- Baseline evidence directory suffix is bound to the manifest and run target identity.
- Comparison approvals bind migration scope, capability approvals and exact finding waivers.
- External rendered/device evidence remains closed and cannot self-authorize a pass.
- A1 remote/data URI evidence is fingerprinted rather than disclosed.
- A11 requires exact per-suite passing counts; aggregate-only and skipped results cannot pass.

### 2.2 Controlled provenance and isolation

- Public build and mutation JSON cannot mint pass authority.
- Controlled evidence graphs are recursively frozen and provenance is module-private.
- Probe failure becomes bounded `unmeasured`, not false pass.
- Output containment rejects primary and linked Git worktrees, prefix traps and symlink traps.
- Windows npm and Gradle launchers have executable platform-safe contracts.
- Audit tooling identity includes the controlling program and runner test.
- The tooling commit is required to preserve the product-anchor fingerprint.

### 2.3 Audit areas hardened

- A3 capability identity now binds visible actions to semantic outcomes and handler changes.
- A4 inventories storage access forms and comparison detects added, removed or changed contracts.
- A5 mutation evidence has exact domain/test/assertion contracts and cannot be fabricated by external JSON.
- A6 scans high-confidence shared JavaScript localization sinks; the double-encoded apostrophe class was identified for correction.
- A7 comment/string decoys, scoped receivers, exact top-level sender types, computed protocol forms and several aliases were hardened.
- A8 PII, export, auth, secret and remote evidence is redacted; many alias/control-flow/computed cases now fail or become unresolved.
- A9 no longer treats ambient ignored Android files as authority.
- APK normalization validates ZIP methods, descriptors, CRC and ZIP64 constraints.

### 2.4 Signing, JVM and anchor work surviving the crash

Current source and the `50/50` fixture suite include:

- a bounded structural signing parser and generator adapter;
- rejection tests for decoys, reversed guards, wrong scopes and literal signing credentials;
- additional in-flight hardening intended to reject release-variable shadowing/reassignment and competing release assignments;
- Gradle/JAVA_HOME identity checks;
- an exact fixed product-anchor precondition.

These changes are not a completed controlled-build receipt and require final source review plus focused verification after receipt v2 is finished.

## 3. Intentionally unresolved or unmeasured

### 3.1 A7 and A8 static completeness

Repeated adversarial review proved that regex/heuristic absence cannot establish complete JavaScript protocol, export, auth, secret or network safety. Alias, reassignment, regex-literal, computed-property, control-flow and declarative variants can always extend the syntax surface.

Closure decision:

- definite violations remain `fail`;
- heuristic-clean or incomplete discovery is `unmeasured`;
- A7/A8 must not report `pass` without explicit complete authority;
- C-07 is `unmeasured` without complete authority on both sides;
- known inventories remain evidence;
- no further syntax-by-syntax expansion belongs to runner closure.

This decision was agreed but had not yet been fully applied to result semantics when the system crashed.

### 3.2 External evidence

The trust root remains closed. Rendered UI, browser timing, physical-device acceptance and device memory claims remain `unmeasured` until a separately approved controlled capture authority exists. Emulator or fixture evidence must not be relabelled as physical acceptance.

## 4. Open freeze blockers

### B1 - Apply conservative A7/A8/C-07 results

Implement section 3.1 in code, update fixtures and verify no heuristic-clean synthetic case returns `pass`.

### B2 - Complete controlled-build receipt v2

The remaining implementation must provide:

- independent `npm ci --ignore-scripts --no-audit --no-fund` in each disposable build worktree;
- no ambient `node_modules` junction fallback;
- bounded aggregate identity for the complete installed dependency closure before generation and before Gradle;
- isolated per-build `GRADLE_USER_HOME`;
- bounded aggregate identity for the actual selected Gradle distribution before and after the build;
- generated Android identities including Cordova module build inputs;
- receipt schema v2 through capture, APK comparison and A9;
- exact agreement across the two controlled builds;
- aggregate-only evidence with no local paths, file contents, secrets or raw exceptions;
- fail-closed behavior for links, special files, collisions, limits, mutation and cleanup failure.

No actual controlled build has run.

### B3 - Final verification and review

After B1/B2:

- syntax check all canonical audit modules and the central test;
- run the complete runner self-test;
- perform one independent final review under the closure addendum;
- run `git diff --check`;
- repeat the exact UTC `492/492` product regression;
- recompute the product fingerprint;
- create the tooling-freeze checkpoint.

### B4 - Temporary artifacts

At capture there are 59 known temporary patch artifacts:

- 11 untracked `scripts/audit/final-*.patch` files inside the repository;
- 48 `V:\Co work\Projects\Retail\controlled-*.patch` files outside the repository.

They are intermediate patch copies, not canonical source. They must never be committed. They have not been deleted because fresh explicit owner approval was not received for this exact 59-file set. The crash checkpoint contains the in-repository names and resume-time inventory commands.

### B5 - Freeze, baseline and push

No audit tooling commit, controlled mutation capture, controlled two-build evidence, baseline audit, evidence commit or push has occurred. These actions follow B1-B4 in the addendum's exact order.

## 5. Retracted or superseded findings

- The output-containment finding was retracted after current code was shown to enumerate all registered worktrees and reject this repository's Git common directory through primary-worktree containment.
- The original raw-worktree/Git-blob fingerprint mismatch was resolved by canonical Git-blob product identities.
- The direct Windows `npm.cmd`/`gradlew.bat` launcher issue was resolved with platform launchers.
- A7 global literal-receiver pairing was resolved by message-handler/event-data scoping.
- A7 nested `payload.type` resolution and duplicate top-level type resolution were corrected.
- Multiple initial A8 computed-sink, helper-call, auth-method and remote-target false passes were corrected, but their broader lesson is now handled by conservative `unmeasured` semantics rather than endless syntax expansion.
- The claim that the audit program itself contained mojibake was retracted; the program is valid UTF-8. Only two A6 regex classes contained the actual double-encoded apostrophe sequence.

Do not rediscover or reopen these items unless current bytes reproduce a qualifying closure blocker.

## 6. Deferred post-baseline backlog

- richer AST/control-flow analysis or explicit registries for A7/A8;
- trusted rendered/browser/device evidence capture and signer provisioning;
- cosmetic report typography and non-blocking documentation polish;
- broader supply-chain attestation beyond the bounded receipt-v2 closure;
- performance optimizations not required for audit operability;
- product remediation arising from the eventual baseline findings.

## 7. Nonclaims

This ledger does not claim:

- that the audit runner is frozen;
- that the current dirty tree is reproducible baseline evidence;
- that mutations or two APK builds passed;
- that all A1-A11 checks pass;
- that A7/A8 static discovery is complete;
- that physical device, rendered UI or owner acceptance occurred;
- that Modular HTML remediation may begin;
- that any commit or push was made.
