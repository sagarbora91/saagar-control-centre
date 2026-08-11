# SAAGAR Control Centre — Safe Android Audit Handoff

**Updated:** 2026-08-12 (Asia/Kolkata)
**Purpose:** authoritative resume point for the whole-app pre-/post-Modular-HTML audit.

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
**Status:** Modular HTML Phases 1–3 are implemented and published as a draft candidate. API 23 emulator engineering acceptance passed. A2-04 and aggregate migration-test coverage are resolved. The exact 106-row capability ledger is complete and test-enforced. **Post-migration comparison gate C-02 remains blocked only on identity-bound owner approval and the committed-target comparison run; do not merge PR #5 yet.**

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
> | Capability review ledger | `verification/MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json`: **106 exact pending approvals**, deterministic delta SHA-256 `0c2a1b2aabdf56b56b55b90fe466d1065def73a0b9233d26ec4aa4572ef1146a` |
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
2. Review `verification/MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json` and explicitly approve or reject its exact 106 rows. Do not infer approval from implementation or test success.
3. Bind an approval envelope to the frozen tooling SHA, baseline manifest, baseline target, product anchor and final committed candidate target SHA.
4. Run the isolated committed-target comparison audit with the external approval envelope and verify C-02 reports 106 approved / 0 unapproved / 0 stale / 0 invalid.
5. Keep the Gate 0 product anchor frozen; do not re-anchor the migration candidate in place of performing the before/after comparison.
6. Update the draft PR with the comparison evidence. Physical-device owner acceptance and production signing remain separate release gates.

### Handoff-update validation

- `git diff --check`: pass (Windows LF/CRLF conversion warning only).
- `npm run test:offline`: pass after the A2-04 fix, identity refresh, and aggregate coverage update.
- `npm run test:modular`: 86/86 pass.
- `node --test tests/phase1-shared-spine.test.mjs`: 6/6 pass; it now enforces current 660/0 plus the exact pending 106-row comparison ledger instead of asserting false equivalence with 655.
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
| Post-migration comparison | **not yet validly closed**; all 106 deltas are exact and test-enforced, but owner approval and the identity-bound committed-target comparison are still pending |
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

Engineering/audit gates now open before merge: obtain explicit owner approval
for the exact 106-row capability ledger and run the identity-bound
committed-target comparison audit. Aggregate migration-test coverage and the
A2-04 duplicate-authority finding are closed.

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
