# SAAGAR Control Centre — Safe Android Audit Handoff

**Updated:** 2026-08-14 (Asia/Kolkata)
**Purpose:** authoritative resume point for the whole-app pre-/post-Modular-HTML audit.

## Phase 4 live checkpoint - 2026-08-12

This checkpoint is the current authority. The detailed execution and exit plan
is `docs/audit/CONSOLIDATED-PHASE-4-CLOSURE-PLAN.md`. The connectivity-safe,
commit-by-commit execution order is
`docs/audit/PHASE-4-MICRO-CHECKPOINTS-2026-08-12.md`.

| Authority | Identity |
|---|---|
| Product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` |
| Working branch | `agent/modular-phase1-shared-spine-v2` |
| Final target | determined by the final documentation/evidence commit |
| Governed tooling | `18dcb9e5db5d33ac23433c54e36e10b9b2d571c7` |

- Modular HTML implementation is complete. Phase 4 audit and release closure is
  not complete.
- Current internal diagnostics pass A2, A7, and A8. The A5 mutation cleanup and
  C-04 storage inventory/comparator defects are corrected.
- A6-03 remains open with 1,226 genuine localization bypass occurrences after
  two Marathi/Hindi remediation batches. A6-04/A6-05 remain trusted-renderer
  gates.
- Retail ETP import is owned only by Reports. Bounded R003/R013 exception counts
  are presented as reconciliation information that does not alter revenue or
  sales totals.
- API-23 emulator install-replace, preserved seeded state, restart, recreation,
  and rotation checks are engineering evidence only; they do not close physical
  OEM, owner-device, production-signing, or release acceptance.
- The earlier capability approval and Samsung SM-T875 acceptance are bound to
  older identities. They cannot be reused for the final target or final APK.
- Keep PR #5 in draft until the final controlled comparison, exact identity-bound
  approval, trusted measurements, physical acceptance, and release authority
  are complete.

### Crash-resume checkpoint

- The current-tooling controlled baseline is preserved at
  `verification/audit/2026-08-15-102206-18dcb9e5db5d` by evidence commit
  `976547823520601538b943ae38fb1c89ee94eba4`. Its manifest SHA-256 is
  `5153d6dee330cf2fb16b6fc4d6a0d11df77aa4544b47a10d5909ad7453c7771f`;
  exactly 18 files and every declared byte/hash identity validated.
- Governed tooling `18dcb9e5db5d33ac23433c54e36e10b9b2d571c7`
  passes all 73 self-tests from its frozen tooling lineage. It is an ancestor of
  the product branch and every governed tooling byte is identical.
- A9-02 engineering remediation is committed and pushed at
  `fa1120c1a026d1525c2eb555a6aa8e29ce7e5b38`. API-23 preparation preserves the
  already-compatible root `build-identity.js` byte-for-byte while continuing to
  transform other JavaScript. Canonical, generated and APK-contained identity
  SHA-256 values all equal
  `7e3165b486c7ce0ee6e8f1c16acd00745acb5047aa7988e7df059abafc84b557`.
  Formal A9-02 comparison evidence still requires the frozen target run.
- The complete product suite passes 507/507, including 129 ETP and 86 modular
  tests. The modular suite confirms the ledger remains exactly 107 rows with
  comparison delta SHA-256
  `6179252efa5110d96c46be8544f275c46dfb5f14f8d46f4b46a194fc6f2a6420`.
- Prefreeze seeded diagnostic APK: 7,269,978 bytes, SHA-256
  `D4C76C5D567899E1D29FD7AFA9007D0A255CCDEEF161CA1AA1B62E6937AEDEDF`.
  API-23 install-replace and launch pass in 1.532 seconds with MainActivity live
  and zero fatal-log matches. This is engineering evidence, not the final APK.
- Consolidated Phase 4A is not complete. A6-03 still fails with 1,145 genuine
  localization bypasses; A6-04/A6-05 remain unmeasured trusted-renderer gates.
  These mandatory P1 items cannot be waived as retained P2 debt. Do not freeze
  the final target or begin the comparison until the language/UI path is closed.
- On 2026-08-14 Sagar (`sagarbora91`) accepted the fluent Marathi/Hindi reviewer
  role for Phase 4A and authorized creation of a dedicated local audit-evidence
  signing key. Only the public verification key may be committed; the private
  key remains outside the repository with a user-only Windows ACL. The frozen
  public signer is `phase4a-renderer-ed25519-9ec3b61bbbdb245f`, public PEM
  SHA-256 `9ec3b61bbbdb245ff1582941bc699a30c116645ee82814f1d0f5d46e2162faa0`.
  Exact Ed25519 verification passes; unknown-key, changed-hash and changed-format
  evidence fails closed.
- Localization batch 01 was explicitly reviewed by Sagar and imported at
  `fca6924963d75563a6fe82585f876869a13ccc4c`. Its 24 phrases reduced A6-03
  from 1,226 to 1,145 occurrences and increased the shared dictionary from 926
  to 950 phrases; language tests pass 4/4 and source-integrity tests pass 8/8.
- Batch 02 is a machine draft awaiting Sagar's explicit review: 100 phrases
  covering 165 source occurrences, SHA-256
  `1ea3009c065fa8d8227b1d73810b4f0dbc703568b66f79ee142367d0442a74c5`.
  All decisions remain `pending-fluent-review`; none has been imported.

### Phase 4 progress and remaining-time estimate

- Consolidated Phase 4A has completed tooling/baseline integration, A9-02 code
  remediation, complete product verification, diagnostic APK build and API-23
  smoke. The remaining 4A work is A6-03 localization plus the trusted A6-04/05
  capture and fluent review.
- Consolidated Phase 4B remains the frozen-target unapproved comparison, exact
  capability approval and approved rerun. Consolidated Phase 4C remains exact-APK
  physical/performance, production ETP, UAT, legal, signing and release authority.
- Immediate next action: obtain genuine Marathi/Hindi translations and fluent
  review in small, explicitly approved batches, continuing with batch 02. Import
  only approved rows, record the exact A6-03 reduction, then repeat. After A6-03
  closes, capture the signed 72-cell rendered matrix. No unreviewed wording may
  be attributed to Sagar, and no English placeholder mappings or analyser
  exclusions are acceptable.

## Open acceptance gates

- Final controlled baseline and target comparison.
- Exact identity-bound owner capability approval for the final comparison.
- Trusted rendered accessibility/responsive and A10 timing measurements.
- Final exact-hash physical-device and OEM/document-provider evidence.
- Production ETP, mapping, language, UAT, legal, signing, and release decisions.

## Historical record

## Approval-aware comparison and consolidated closure checkpoint - 2026-08-12

This checkpoint supersedes the older comparison and approval resume statements
below.

- Sagar (`sagarbora91`) approved the exact 106 capability deltas, delta SHA-256
  `0c2a1b2aabdf56b56b55b90fe466d1065def73a0b9233d26ec4aa4572ef1146a`,
  for A3-02 target `9b54d5bd003672434a7dac8be81efadd6b67f947`, tooling
  `937542f8b81099eed48ba8c4d21d1cd6382f5ad3` and baseline manifest SHA-256
  `8837522e88d04ff060205886cc3ec131b0bf7248e6b0af6e3151224612782bc1`.
- The approval-aware comparison is committed under
  `verification/audit/2026-08-12-160000-9b54d5b`; all **506/506** registered
  product tests pass.
- C-01, C-02 and C-03 now pass. C-02 records 106 approved, zero unapproved,
  invalid, stale or envelope errors. C-03 records zero new P0/P1 findings and
  zero regressions.
- C-04 and C-07 are the only failed comparison gates. C-04 has 61 storage
  contract deltas and 59 current unclassified artifacts. C-07 has 15 message
  contract deltas and zero coupling regressions. No comparison gate is
  unmeasured.
- The sole remaining phase is documented in
  `docs/audit/CONSOLIDATED-REMAINING-CLOSURE-PHASE-2026-08-12.md`. It combines
  comparison remediation, broader A1-A11 audit closure, reproducible build and
  performance evidence, final APK/device checks, and the ten external owner and
  release gates.
- Keep PR #5 in draft. The correct status is: Modular HTML implementation is
  complete; audit and release closure are not complete.

## Comparison measurement restoration checkpoint - 2026-08-12

This checkpoint supersedes the older comparison resume/status statements below.

- Governed audit tooling is frozen at
  `937542f8b81099eed48ba8c4d21d1cd6382f5ad3`; its regression suite passes
  **58/58**.
- The refreshed Gate 0 baseline is committed at
  `verification/audit/2026-08-12-143000-937542f`, bound to the same tooling
  identity and frozen product anchor `8f96480ec6ddfc99016af43a7369f57a06cb9fd6`.
- The exact comparison target is
  `9b54d5bd003672434a7dac8be81efadd6b67f947`; its provisional comparison is
  preserved at `verification/audit/2026-08-12-150000-9b54d5b` and all **506/506**
  registered tests pass.
- **C-01 is resolved and passes** with zero lost measurements. A7-04 passes with
  zero binding mismatches, A11-03 passes with zero count mismatches, and A8-05
  remains a measured fail-closed finding rather than becoming unmeasured.
- **C-04 measurement is restored:** 187 baseline artifacts and 172 current
  artifacts are compared exactly. The measured gate fails with 61 contract
  deltas and 59 current unclassified artifacts; this is no longer an evidence
  availability failure.
- **C-07 measurement is restored:** 54 baseline and 47 current message-contract
  rows are compared exactly. The measured gate fails with 15 contract deltas and
  zero coupling regressions; this is no longer an evidence availability failure.
- C-03 has zero new P0/P1 findings and zero finding regressions. Its provisional
  result is `fail` only because no approval envelope is yet bound to the new
  target/tooling/baseline identity. The capability delta set is unchanged at
  exactly 106 rows with SHA-256
  `0c2a1b2aabdf56b56b55b90fe466d1065def73a0b9233d26ec4aa4572ef1146a`.
- Do not reuse the approval envelope bound to target `11bb84a`. Obtain the
  owner's explicit identity-bound approval for target `9b54d5b`, tooling
  `937542f`, and baseline manifest SHA-256
  `8837522e88d04ff060205886cc3ec131b0bf7248e6b0af6e3151224612782bc1`, then
  rerun the comparison with that envelope. Keep PR #5 in draft: C-04 and C-07
  are now measured failures and require separate disposition after the approval
  gate is closed.

## Corrective physical-test checkpoint - 2026-08-12

This checkpoint supersedes the older APK and candidate values below.

- Physical-device testing of APK SHA-256
  `1C61CEED674B648CC46464B6F3F17211B51FA7936679E7352B8CC85019F5A92B`
  is **FAIL**: Expense Manager rendered a blank body, and Retail ETP import was
  mapped under Settings instead of Reports. Do not approve or redistribute that
  artifact.
- Expense root cause: the API-23 asset transform resolved a quote-bearing CSS
  custom property inside an inline JavaScript string. The generated Chrome 44
  script was invalid even though the source page worked in a modern browser.
  The transform now keeps all script bytes opaque while resolving CSS variables
  in HTML/CSS, with a parser regression test.
- Retail ETP import is now owned by the Reports view and is absent from Settings.
- Replacement seeded APK:
  `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`,
  7,053,364 bytes, SHA-256
  `E6B26939D7AB0C3F64E79025B5E62F689DE93DCDF3EEEE5D6346F98B93963757`;
  debug-signed with APK signature schemes v1 and v2.
- Replacement emulator result: **PASS** on Android 6.0 / API 23. Verified clean
  install and seed, Expense dashboard render with no syntax/console error, ETP
  card visible in Reports, ETP absent from Settings, package
  `com.saagartraders.bcc` version 2.9 (209), minimum SDK 23.
- Replacement physical-device result: **PASS** on Samsung SM-T875 / Android 13,
  explicitly reported by the owner after checking the corrected Expense and ETP
  routing. Exact evidence is recorded in
  `verification/PHYSICAL-DEVICE-ACCEPTANCE-2026-08-12.md`.
- Regression result: focused corrective suite 22/22; canonical modular aggregate
  86/86; main offline suite 262/262; `git diff --check` pass.
- Corrective publication branch: `agent/modular-phase1-shared-spine-v2`. Resolve
  its exact final candidate identity with `git rev-parse HEAD`; capability
  approval must bind that identity rather than any earlier SHA.

Resume in this order:

1. Commit and push the corrective source/evidence and update the candidate
   target SHA.
2. Rebind any capability approval envelope to that final committed target;
   approval against an earlier candidate identity is not reusable.
3. Run the identity-bound post-migration comparison against the final committed
   target.
4. Keep PR #5 in draft until the comparison closes. Physical-device acceptance
   of the corrective seeded APK is complete; separate external release gates in
   this handoff remain open.

## Capability approval checkpoint - 2026-08-12

Owner approval is now recorded and comparison gate **C-02 passes** for target
`11bb84abc74c5dd3073df6074b45f67b3fbb9597`: 106 exact deltas, 106 approved,
0 unapproved, 0 invalid, 0 stale and 0 envelope errors. The identity-bound
approval and immutable comparison run are preserved under
`verification/audit/approvals/2026-08-12-11bb84abc74c.json` and
`verification/audit/2026-08-12-053558-11bb84abc74c`.

This closes the capability approval gate only. The overall comparison remains
`comparison-failed-or-unmeasured`: C-01 and C-03 fail; C-04 and C-07 are
unmeasured. See
`verification/MODULAR-CAPABILITY-APPROVAL-CLOSURE-2026-08-12.md` for exact
identity, metrics and remaining evidence. This checkpoint supersedes older
statements below that describe C-02 as pending.
**Status:** Modular HTML Phases 1–3 are implemented and published as a draft candidate. Corrective physical-device acceptance passed. A2-04, aggregate migration-test coverage and the exact 106-row capability approval gate C-02 are resolved. **The overall post-migration comparison is not closed: C-01 and C-03 fail, while C-04 and C-07 remain unmeasured; do not merge PR #5 yet.**

> ## ⚑ RESUME HERE — reconcile the post-migration audit candidate
>
> **Plan:** `docs/MODULAR-MIGRATION-ROADMAP-2026-08-10.md` — Gate 0 plus three implementation phases.
> Do not restart the migration. Review the committed candidate, reconcile the exact
> audit deltas below, rerun the controlled comparison, and only then consider merge.
>
> | Tripwire | Current fact |
> |---|---|
> | Branch / HEAD | `agent/modular-phase1-shared-spine-v2` / `3b2c6b08f5fe70a1d4e8e3747dd54fe138acf66a` |
> | Upstream | `github/agent/modular-phase1-shared-spine-v2`; local and upstream SHAs match |
> | Draft PR | [#5 Complete modular HTML migration and API 23 support](https://github.com/sagarbora91/saagar-control-centre/pull/5), targeting `main` |
> | Gate 0 product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` (frozen pre-migration authority) |
> | Gate 0 baseline evidence | `verification/audit/2026-08-11-113428-b9f04b5` |
> | Gate 0 capability oracle | **655 capabilities / 0 conflicts** |
> | Current direct A3-02 measurement | **660 capabilities / 0 conflicts**, `pass` uniqueness but **+5 versus Gate 0** using the restored frozen analyser semantics |
> | Current direct A2 measurement | A2-01 pass; A2-03 pass; **A2-04 pass (0 duplicated constants)**; A2-05 pass |
> | Product regression | `npm run test:offline` passes; canonical modular aggregate is **86/86**, including all migration contracts and the exact capability ledger |
> | Capability review ledger | `verification/MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json`: **106 exact deltas**, deterministic delta SHA-256 `0c2a1b2aabdf56b56b55b90fe466d1065def73a0b9233d26ec4aa4572ef1146a`; exact external approval passes C-02 for target `11bb84a` |
> | Aggregate coverage | resolved: Phase 1 shared spine, shell frame controller and capability-ledger tests are declared by `test:modular` and therefore `test:offline` |
> | Audit self-test on candidate | **55/58**: tracked-test registry passes. The three remaining failures are the frozen tooling-commit/product-anchor isolation assertions; the migration candidate correctly has a different product fingerprint from Gate 0. |
> | API 23 emulator | clean install, dashboard, 11-module grid, Stock Register, restart persistence and logcat smoke passed |
> | Seeded APK | `SaagarCC-C1-DemoData-2Years-v2.9.apk`, 6,981,352 bytes, SHA-256 `24D96B698FC66D50D5C5FB5077BB07D5ED9AB35769F9AD1BBF76448E1ADF8894`; debug-signed v1/v2 |
>
> **The migration rule remains the frozen Gate 0 rule:** the capability inventory
> must be exactly **655 / 0 conflicts** unless an approved comparison proves each
> intentional delta. The earlier 659/+4 result used a candidate-only analyser
> suppression and was invalid. With the frozen analyser restored the product-only
> result is 660/+5; see `verification/MODULAR-CAPABILITY-DELTA-RECONCILIATION-2026-08-12.md`.

### Exact resume order

1. Keep PR #5 in draft; do not merge or relabel emulator evidence as physical-device acceptance.
2. Preserve C-02 as closed for target `11bb84abc74c5dd3073df6074b45f67b3fbb9597`; do not reuse its approval for a changed product target.
3. Resolve C-01 (`A8-05` measurement continuity) and C-03 (new `A7-04` P1 plus `A11-03` regressions).
4. Restore measurable storage and messaging inventories for C-04 and C-07 without changing the frozen Gate 0 evidence in place.
5. If remediation changes the product target, regenerate the exact delta ledger and obtain a newly identity-bound approval before rerunning comparison.
6. Update the draft PR with the preserved comparison evidence. Production signing and the remaining external release gates stay separate.

### Handoff-update validation

- `git diff --check`: pass (Windows LF/CRLF conversion warning only).
- `npm run test:offline`: pass after the A2-04 fix, identity refresh, and aggregate coverage update.
- `npm run test:modular`: 86/86 pass.
- `node --test tests/phase1-shared-spine.test.mjs`: 6/6 pass; it enforces current 660/0 plus the exact 106-row comparison ledger. Owner approval remains external and identity-bound rather than mutating the ledger snapshot.
- Direct current audit measurement: A3-02 660 capabilities / 0 conflicts with frozen analyser semantics; A2-04 pass with 0 duplicates; A8-05 0 unapproved calls / 42 unresolved dynamic targets.
- `node --test tests/whole-app-audit-runner.test.mjs`: 55/58 pass. The registry issue is closed; three frozen tooling/product-anchor isolation assertions reject using the changed migration product as the pre-migration tooling anchor. No result is represented as a complete comparison pass.

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
| Candidate branch | `agent/modular-phase1-shared-spine-v2`, pushed to GitHub |
| Candidate commit | `3b2c6b08f5fe70a1d4e8e3747dd54fe138acf66a` |
| Draft review | PR [#5](https://github.com/sagarbora91/saagar-control-centre/pull/5); **do not merge until audit reconciliation closes** |
| Frozen Gate 0 product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` |
| Audit tooling SHA | `b9f04b5e33d045ad0ca6b7cc9acd25e2d5a186cb` |
| Comparison baseline | `verification/audit/2026-08-11-113428-b9f04b5` |
| Superseded baselines | `2026-08-10-115208-7871e57` (anchor `88ba118`), `2026-08-10-130643-57507ef` (anchor `f4da822`) — valid history, not comparison inputs |
| Post-migration comparison | C-02 **pass** for target `11bb84a`: 106 approved / 0 unapproved / 0 stale / 0 invalid. Whole comparison remains open on C-01, C-03, C-04 and C-07. |
| PHP/platform work | excluded until fresh owner authorization |
| Modular HTML | Phases 1–3 implemented; engineering candidate committed/pushed; audit/merge/physical acceptance still open |
| API 23 | emulator engineering acceptance recorded in `verification/API23-EMULATOR-ACCEPTANCE-2026-08-11.md`; not physical-device acceptance |

## Open P0s and their dispositions

Full reasoning in `docs/audit/P0-DECISIONS-2026-08-10.md`.

| Finding | State |
|---|---|
| A4-03 storage classification contradiction | **fixed**, passes |
| A4-02 artifact classification | 98 → 73; remainder is runtime-computed filenames, an analyser limit |
| A8-02 export policy bypass | 9 → 2; both remaining are guard shapes the analyser cannot prove |
| A8-03 fail-open authentication | Phase 3 moved reauthentication onto the Slice D DOM keypad. Current aggregate static result still fails with 10 fail-open-shaped and 237 unresolved paths; this needs comparison/classification and is not claimed closed. |
| A8-05 unapproved remote runtime | Phase 1 removed the 47 owned wildcard shell↔module calls. Current direct metric is 0 unapproved calls and 42 unresolved dynamic targets, so the conservative verdict remains `unmeasured`. |

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

1. **Product baseline SHA** — the frozen pre-migration snapshot. Tooling and
   baseline runs require its exact product fingerprint. The four historical
   pre-migration re-anchors and their reasons are in `AUDIT-PROGRAM-v1.md`
   §1.3; after Gate 0, migration product changes are evaluated by comparison
   and do not silently move this anchor.
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
3. Run `npm run test:offline`; it includes every migration-specific contract,
   including the shared-spine, frame-controller and capability-ledger tests.
4. Compare A3-02 against the frozen inventory by identity, not only its `pass`
   verdict. A unique but changed inventory is still a migration blocker.
5. During migration, keep the approved Gate 0 anchor frozen and run the
   identity-bound comparison from a clean committed target. A changed product
   must not be substituted for the pre-migration baseline.
6. Device-test the candidate without relabeling emulator evidence as physical
   acceptance.

Note: `docs/audit/` is audit control **except** `*-CHANGE-CONTRACT-*.md`, which are
approved product specifications and stay inside the product fingerprint.

## Open acceptance gates

Engineering/audit gates now open before merge: resolve C-01 and C-03, restore
measurable C-04 and C-07 comparison inventories, and rerun the identity-bound
comparison. The exact 106-row capability approval (C-02), aggregate
migration-test coverage and the A2-04 duplicate-authority finding are closed for
target `11bb84a`.

External release gates remain human- or device-owned and are never inferred from
source tests or emulator evidence: owner physical update-in-place smoke; physical
API-23/OEM import and document-provider evidence; ETP process-death/disk-full/
corruption/rotation/low-storage evidence; real production native ETP publication;
user-facing R003/R013 exception treatment; approved PAYMENTTYPE25 mapping; fluent
native-language review; staff UAT; legal review; production signing and release.

## Authority rule

Code is authoritative for what the current app does. Approved contracts,
dictionaries and source evidence are authoritative for what it must do. Any
disagreement is an audit finding. **`unmeasured` never means `pass`.**

## Historical record

Earlier branch positions, APK hashes, dirty-tree checkpoints and test totals are
preserved by Git history and the dated documents under `verification/`. They are
immutable historical evidence, not current resume instructions.

The Phase 1–3 closure documents were written before publication and therefore
contain then-accurate statements that commit/push had not occurred. Publication
later occurred at `3b2c6b0`; this handoff supersedes those statements for current
resume status without rewriting their historical context.
