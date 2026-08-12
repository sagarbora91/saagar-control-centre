# Consolidated Remaining Closure Phase

**Date:** 2026-08-12 (Asia/Kolkata)

**Branch:** `agent/modular-phase1-shared-spine-v2`

**Draft review:** PR #5

**State:** implementation Phases 1-3 are complete; this is the single remaining
audit, acceptance and release-closure phase.

## Frozen entry point

The owner approved all 106 exact A3-02 capability deltas for:

- target commit `9b54d5bd003672434a7dac8be81efadd6b67f947`;
- audit tooling `937542f8b81099eed48ba8c4d21d1cd6382f5ad3`;
- baseline manifest SHA-256
  `8837522e88d04ff060205886cc3ec131b0bf7248e6b0af6e3151224612782bc1`;
- capability delta SHA-256
  `0c2a1b2aabdf56b56b55b90fe466d1065def73a0b9233d26ec4aa4572ef1146a`.

The approval-aware controlled comparison is preserved at
`verification/audit/2026-08-12-160000-9b54d5b`. It ran all 506 registered tests
successfully. Comparison gates C-01, C-02, C-03, C-05, C-06, C-08 and C-09
pass. Only C-04 and C-07 fail; no comparison gate is unmeasured.

This approval is exact and immutable. Any later product target is a new
identity. If work in this phase changes the product target, regenerate the
comparison and obtain a newly target-bound approval if its exact capability
ledger requires one.

## Definition of the one remaining phase

Complete the work packages below in order. These are work packages inside one
phase, not additional migration phases.

### P4.1 - Close authority and evidence-definition gaps

- Add machine-readable capability declarations for A3-05.
- Correct the two unresolved cited paths for A11-01:
  `android/**` and the obsolete debug-APK path.
- Remove the A11-05 current-authority contradiction between the two obsolete
  `49d531b...` claims and the frozen `8f96480...` product anchor.
- Bind the clean A8-04 tracked-file secret scan to a declared discovery
  authority so its conservative result can be measured instead of unmeasured.
- Repair A5-05 mutation evidence: the probe currently supplies four valid
  domains; add valid export and storage mutation rows to reach the required six.

**Exit:** A3-05, A5-05, A8-04, A11-01 and A11-05 are measured and pass, with no
contradictory authority claims.

### P4.2 - Close C-04 storage equivalence

- Resolve the 59 current unclassified storage artifacts in A4-02, including
  computed local-storage keys and computed file names, using explicit
  classification or deterministic analyzer normalization.
- Reconcile the 61 measured baseline/current storage-contract deltas. Confirm
  every added, removed or renamed artifact is either represented by the same
  canonical contract or corrected in product code.
- Add focused fixtures for computed keys so classification cannot regress.

**Exit:** A4-02 passes with zero unclassified artifacts and C-04 passes with no
unresolved storage-contract delta.

### P4.3 - Close C-07 messaging equivalence

- Reconcile the 15 measured message-contract deltas, including the removed
  `ST_ACCESS_CONTEXT`, changed shell/module messages and unresolved worker rows.
- Resolve A7-02's 12 sent-never-handled and four handled-never-sent types.
- Make all 28 A7-03 dynamic message/type/payload sites statically attributable
  or explicitly declared.
- Declare or remove the A7-05
  `window.SaagarStockVariancePolicy` global contract.
- Preserve the current coupling improvement: comparison reports zero coupling
  regressions and the duplicate-group count improved from 94 to 23.

**Exit:** A7-02, A7-03 and A7-05 pass and C-07 passes with no unresolved message
contract delta or coupling regression.

### P4.4 - Close security-policy findings

- A8-01: provide authoritative high-confidence PII-flow coverage for all 94
  runtime files.
- A8-02: make the two export/print paths provably policy-guarded
  (`www/index.html` popup and `www/modules/service/index.html` print).
- A8-03: eliminate or explicitly fail-close the 10 authentication exception
  paths and resolve the analyzer's remaining ambiguous paths.
- A8-05: replace or constrain the 42 dynamic remote targets with an explicit
  allowlist/closed policy; definite unapproved remote calls must remain zero.

**Exit:** A8-01 through A8-05 are measured and pass with no P0 security finding.

### P4.5 - Close code-quality and rendered-UI findings

- A2-02: disposition the 23 near-copy groups / 1,075 similarity edges without
  reintroducing module coupling.
- A6-01: move the 15 divergent token definitions to canonical shared tokens.
- A6-03: classify and remediate the 1,307 high-confidence localization bypasses;
  add justified analyzer exclusions where strings are not user-facing.
- A6-04: capture rendered target-size and contrast evidence.
- A6-05: execute the required 72-cell responsive/accessibility matrix with
  browser, tooling and product identity bound into the evidence.

**Exit:** A2-02 and A6-01/03/04/05 pass, or any retained non-blocking P2 item has
an explicit owner disposition recorded by the audit authority.

### P4.6 - Close reproducibility, performance and device evidence

- A9-01, A9-02 and A9-05: perform two clean, isolated builds and prove artifact,
  version/package and receipt agreement.
- A10-01 and A10-02: rerun the browser timing probe with the valid attested
  schema. The byte sizes are measured, but shell parse timing and all 11 module
  open timings are currently unmeasured.
- A10-04: record the required five-save DAT02 latency run on the owner device.
- A10-05: record the two-cycle close/reopen memory acceptance on the owner
  device.
- Produce the final seeded APK only after product changes are frozen. Record its
  SHA-256, signing schemes, package/version and install-replace result on API 23.
- Repeat owner-device update-in-place smoke against that exact final APK hash.

**Exit:** all A9 and A10 mandatory checks are measured and pass; A10-01/A10-02
are also measured; the final APK identity has both API-23 and SM-T875/Android-13
evidence.

### P4.7 - Close external owner and release gates

Close the ten explicit external gates against the final APK/product identity:

1. owner physical update-in-place;
2. API-23 install-replace;
3. physical API-23/OEM ETP import and document-provider behavior;
4. ETP process-death, disk-full, corruption, rotation and low-storage cases;
5. real production native ETP publication;
6. user-facing R003/R013 exception presentation;
7. PAYMENTTYPE25 mapping approval;
8. fluent Marathi/Hindi review;
9. staff/owner UAT and legal review;
10. production signing and release acceptance.

**Exit:** `OPEN-GATES.json` contains no open gate for the final candidate.

## Final rerun and release decision

After P4.1-P4.7:

1. freeze the final product target and audit-tooling identities;
2. rerun all audit-tooling self-tests and the complete product suite;
3. regenerate the controlled baseline comparison from clean detached worktrees;
4. verify C-01 through C-09 all pass and no mandatory check is unmeasured;
5. if the target or exact capability ledger changed, obtain a replacement
   identity-bound owner approval;
6. update PR #5 with the immutable evidence and only then mark it ready to merge;
7. merge/release only after production signing and owner release acceptance.

## Phase exit - migration and release closure

This single phase is complete only when:

- C-01 through C-09 all pass;
- all mandatory A1-A11 checks are measured, with no unresolved P0/P1 finding;
- A10-01 and A10-02 have valid timing evidence even though they are
  non-mandatory in the present audit program;
- all 10 external gates are closed against the exact final APK hash;
- the complete offline suite and audit-tooling suite pass from clean worktrees;
- PR #5 is no longer draft and has an evidence-backed merge decision.

Until then, the correct statement is: **Modular HTML implementation is complete;
audit and release closure are not complete.**
