# SAAGAR Android - Minimum-Phase Consolidated Strategy

**Date:** 2026-08-04 (Asia/Kolkata)

**Baseline:** `main` = `origin/main` = `c04bc98255a78d45b08ac449d88365b22d033f28`

**Owner direction:** stop treating every small work package as a separate phase
and owner test; complete larger outcomes and test them together.

**Core phases remaining:** **2 after C1 owner review**

**PHP platform:** excluded and deferred.

## 1. Decision

The old roadmap remains the detailed scope catalogue, but D6-D12, migration
M0-M6, and E1-E6 are no longer separate owner-facing phases. They are internal
work packages inside three consolidated phases.

Automated tests still run after coherent code changes because they are the
rollback boundary. They do not create a new APK, handoff, owner test, or approval
cycle. The owner receives one consolidated APK and one checklist at the end of
each build phase.

## 2. The three remaining phases

| Phase | Included work | Owner-facing test cycle | Exit result |
|---|---|---|---|
| **C1 - Complete Android product and modular architecture** | Extract QMS, Service, DSR and all remaining modules; retire base64 patchers; shared assets/shell guards; D6 Expense; D7 Payroll foundation; D8 Leave; D9 Tax; D10 Grooming/CRO coaching foundation; D11 Planning; D12 reports, traceability, mobile-layout remediation and defect sweep | **One seeded APK at the end** | All non-ETP Android engineering complete, one clean regression baseline, one owner smoke pass |
| **C2 - Complete ETP verification layer** | E1 import foundation through E6 monitoring for WLMHW and HEMW; integrate verified views into DSR, Stock, Planning, CRO coaching and Payroll/incentive; historical import and reconciliation | **One ETP-enabled seeded/review APK at the end** | Both-store verified data path complete, E1-E6 green, money golden suite green |
| **C3 - Acceptance and production release** | Consolidate the outstanding Phase 0 evidence with C1/C2 acceptance: two-device/API-23 testing, DAT-02, provider backup, cross-device restore, legacy migration, staff UAT, legal/owner approval, security posture, incident rehearsal, production signing | **One formal acceptance campaign** | Production-signed accepted release, evidence pack, release register and final handoff |

Optional E7, F1-F15, and PHP are not hidden inside these phases. They require a
new owner decision after the core release.

## 3. C1 execution groups

C1 is one phase but is implemented in restartable groups:

1. **Architecture catch-up:** extract QMS, Service and DSR first; then extract
   Expense, Payroll, Leave, Tax, Grooming, CRO Audit and Planning as their work
   is touched. Retire the three patchers once their modules are external.
2. **Finance and workforce:** D6, D7 foundation, D8 and D9.
3. **Management and closure:** D10 foundation, D11 and D12; shared assets,
   shell slimming, migration guards and final defect sweep.
4. **Single C1 verification:** full/offline suites, reproducibility/integrity
   checks, seeded APK, unpack/signature verification, then one owner checklist.

The D7 incentive earning line and ETP-number portions of D10 remain prepared
integration points until C2 supplies verified data. Their non-ETP controls are
completed in C1; their verified-data wiring is completed in C2.

## 4. C2 hard gates inside one phase

C2 may proceed continuously, but these dependencies cannot be waived:

- Obtain real raw R022, R025, R013 and R003 samples from both WLMHW and HEMW.
- Freeze exact header signatures, dictionaries and identifier semantics before
  persistence or UI depends on them.
- Pass parser/API-23, reconciliation and both-store isolation gates.
- E1 must seal trusted batches before E2-E6 consume them.
- E5 money calculations run last and enter the permanent golden suite.
- The incentive scheme and target source must be owner-approved before E4/E5.

These are engineering gates, not separate owner-facing phases or APK cycles.

## 5. Testing policy with fewer interruptions

- Run focused tests after each coherent module/group.
- Run the full and explicit offline suites before merging a group and at phase
  completion.
- Build intermediate APKs only for a crash, WebView/origin risk, native-storage
  change, or behavior that cannot be verified off-device.
- Routine intermediate APKs are engineering artefacts and do not require owner
  testing.
- Produce exactly one named owner-review APK and checklist at the end of C1 and
  one at the end of C2.
- C3 is the only formal device-acceptance campaign. Owner-reported smoke remains
  smoke and is never relabelled as formal acceptance.

## 6. Commit and handoff policy

Small, reversible commits remain useful for crash recovery, but commits are not
phases. The normal rhythm is:

1. implement a coherent group;
2. run automated verification;
3. make a restartable checkpoint commit;
4. continue autonomously to the consolidated phase exit;
5. update the main handoff once per phase, plus crash checkpoints only when
   genuinely needed.

No commit, push, schema freeze, production signing, destructive reset, or PHP
work is implied beyond the authority already given by the owner.

## 7. Current position and next action

D1-D5 are pushed. C1 engineering is complete in the intentionally uncommitted
working tree: all eleven modules are external, the three patchers are retired,
D6-D12 non-ETP controls are implemented, the phone-layout sweep is complete,
and the full/offline/responsive/seed/build gates are green. The single C1
seeded review APK is documented in
`verification/C1-CONSOLIDATED-ENGINEERING-CHECKPOINT-2026-08-04.md`.

**Next action:** obtain one owner-reported C1 smoke result, then commit/push only
with explicit approval. Continue to C2 once real exports are available; formal
device and production acceptance remains C3.

## 8. Supersession rule

For phase count, sequencing and owner test cadence, this document supersedes:

- the 13-stage-A plus 6/7-stage-E phase count in
  `docs/V6-IMPROVEMENT-ROAD-PLAN.md`;
- the older four-phase owner-facing structure in
  `docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md`; and
- the per-module device-gate cadence in
  `docs/MODULAR-HTML-MIGRATION-STRATEGY-2026-08-04.md`.

Those documents remain authoritative for detailed feature scope, safety rules,
data contracts and acceptance cases unless this strategy explicitly changes the
phase grouping or test cadence.

## 9. Authorized modular hardening — 2026-08-06

The owner authorized **MAH-1 — Modular Architecture Protection & Visual
Baselines**. This is an internal post-C1 hardening workstream, not another
owner-facing programme phase and not the legacy ETP “Phase 1”.

MAH-1 may inventory and protect the shell and eleven external modules, add
dependency-free tests, define the viewport/language evidence matrix, and repair
verified responsive-regression leaks. It does not admit ETP, PHP, storage,
business-rule, production-signing, commit or push work.

Only one consolidated owner review APK is expected after the hardening work is
green; automated tests remain the internal checkpoint cadence.

## 10. MAH-2 shared architecture status — 2026-08-06

MAH-2 has begun with its dependency foundation. The external module manifest is
versioned, validated, immutable, browser/Node compatible, build-tool aware and
packaging-verified. It changes no module workflow, storage rule, permission or
screen layout.

MAH-2 is not complete. The order is: finish the rendered MAH-1 baseline; pilot
shared runtime extraction in Planning; validate DSR and QMS canaries; then add
message/lifecycle contracts; extract CSS/design primitives last. ETP, PHP,
production signing and commit/push remain outside this authorization.

## 11. MAH-3 shared-runtime canary start — 2026-08-06

MAH-3 Stage A turns the pending visual prerequisite into an executable,
dependency-free review gate. It pins the exact dirty `www` tree and serves an
immutable loopback snapshot across the existing 168-case matrix. Module cases
open through the actual shell, not direct module URLs. A non-PII Planning
fixture exercises target/actual/checklist layout. At the MAH-3 start checkpoint,
source/server tests passed 7/7, the modular gate passed 21/21, the explicit
offline suite passed 256/256 and the complete regression glob passed 310/310.

This starts but does not complete MAH-3: rendered cases remain 0/168 after the
browser-control ACL failure. Shared runtime wiring cannot begin until exported
review evidence is complete and `refactorGateReady=true`. CSS, MAH-4 Stage-B
message/lifecycle product-runtime work, splitting and shell slimming remain
later work.

## 12. MAH-4 message/lifecycle Stage A complete — 2026-08-07

MAH-4 Stage A is engineering-complete and still changes no product runtime.
Profile schema 3 binds direct-entry discovery plus explicit dynamic-local
loaders, 15 active business types versus 17 lexical tokens, 74 syntactic / 68
configured direct sends, aggregate 75/69 dynamic-aware sends, qualified
lifecycle call sites, and the source/origin trust gaps. The non-product oracle
locks 20 exact message contracts, authorization boundaries, immutable legacy
normalization, correlation, 5,000/1,500 ms synthetic deadlines, per-instance
deduplication and synchronous tracked cleanup. Raw `ST_AUDIT` migration remains
blocked rather than copying PII-capable values.

Focused MAH-4 verification passes 37/37, the combined modular gate 58/58,
the explicit offline suite 256/256 and the complete regression glob 347/347.
These are synthetic/source engineering results, not runtime or acceptance
evidence.

MAH-4 Stage B product wiring remains ordered after the unfinished MAH-3 chain:
168-case baseline, Planning runtime and 12 renders, then DSR/QMS canaries.
Runtime, API-23 timing/entropy, expected-origin, device and production gates
remain false. ETP, PHP, CSS extraction, splitting, shell slimming, APK,
commit/push and every formal acceptance category remain outside this work.
