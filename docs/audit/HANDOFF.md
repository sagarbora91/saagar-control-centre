# SAAGAR Control Centre — Safe Android Audit Handoff

**Updated:** 2026-08-23 (Asia/Kolkata)
**Purpose:** authoritative resume point for the whole-app pre-/post-Modular-HTML audit.

## Current Phase 5 resume checkpoint — 2026-08-23 ETP defect closure

This section is the authoritative resume point and supersedes the older Phase 5
checkpoint immediately below. Current branch
`agent/modular-phase1-shared-spine-v2` contains the fixed product commit
`d5a96dbf6f938249d1cff5ca4a79968b0c299c22` and device-acceptance evidence
checkpoint `816fab29493823ef6cb253378663083c9177c543`. The fixed product fingerprint
SHA-256 is `51694c67facf756c4d6a735403a7d4b7b2c1c5db30987f9e0a67e05f1a013161`;
the WWW tree SHA-256 is
`aa964dc6b40df928bde411c4551795e7fb9d3c0ab92c681baeb9c194f3cbd550`.

### What changed after `a104f5f`

Two physical-device defects were found and fixed without reopening completed
modular-migration work:

1. ETP now uses bounded asynchronous authorization. Import can recover through
   in-module reauthentication after Android DocumentsUI backgrounds the WebView,
   and publication always requests fresh action-bound Owner approval.
2. The worker no longer mutates the frozen XLSX loader result. It constructs and
   freezes a new report object containing the source and header-signature hashes.

Permanent regression coverage was added. The focused set passed 32/32 and the
complete ETP test selection passed **173/173**. Other previously green suites
were not rerun because the owner directed that only final ETP validation,
publication and readback be repeated.

### Current APK and completed SM-T875 ETP session

| Field | Current fact |
|---|---|
| APK | `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk` |
| SHA-256 | `5cea95d2461810b1e318efaa359f2c6a169edee8a26ed43164b1c87eaf3f5fed` |
| Bytes | 7,218,076 |
| Package/version | `com.saagartraders.bcc`, version 2.9, code 209, minSdk 23, targetSdk 34 |
| Signing | debug-signed seeded test candidate; not a production release |
| Device | Samsung SM-T875, Android 13 / API 33, serial `R52N807PTTE` |

The updated APK installed successfully through `adb install -r`. Using the exact
deterministic synthetic-only WLMHW R003/R013/R022/R025 fixtures for 2026-08-21,
the real device completed provider selection, worker validation, fresh
action-bound publication approval, native `finishStage`/`publishStage`, immediate
verified readback and force-stop/cold-launch persistence readback.

The result is **PASS for this SM-T875 synthetic ETP engineering session**:

- one verified scope `WLMHW | 2026-27 | 2026-08-21..2026-08-21`;
- R022 and R025 each show one row, signed net INR 100.00 and quantity 1;
- coverage history shows publication on 2026-08-23;
- `rec_002_v1`, R003 and R013 checks pass;
- PAYMENTTYPE25 remains explicitly quarantined with zero unresolved rows; and
- final logs contain no application ANR, fatal exception, `ETP_WORKER_FAILED` or
  `ETP_ACCESS_DENIED` event.

Evidence:
`verification/audit/PHASE-5-ETP-SM-T875-SYNTHETIC-DEVICE-ACCEPTANCE-2026-08-23.md`.
No Owner PIN or other secret is recorded. Screenshots and logs remain outside the
repository at `V:\Co work\Projects\Retail\.audit-drafts` with hashes recorded in
the evidence document. The temporary fixture workspace remains untracked.

### Exact remaining boundary

The connected SM-T875 work requested for the final ETP rerun is complete and
must not be repeated. Phase 5 production/release closure is still not complete:

1. Run only the uncovered API-23-class OEM document-provider/interruption and
   safe-low-storage cases against the eventual shipping artifact.
2. Run the authorized real WLMHW/HEMW four-report publication; the synthetic
   session is not production-data acceptance.
3. Complete identity-bound staff UAT with named cashier/maker and
   manager/checker testers. Sagar remains the owner/admin reviewer and the named
   privacy/legal owner self-reviewer.
4. Produce the production-signed APK, verify its certificate and non-debug
   posture, install/launch its exact hash, and issue the release decision. Sagar
   is both custodian and approver, so the independence control remains a recorded
   exception rather than a pass.
5. Rebind the applicable historical `a104f5f` approvals to the final fixed
   shipping identity. `www/etp-module-gateway.js` changed after the prior rebind,
   so those approval records must not be represented as already bound to
   `d5a96db`.
6. Run one final controlled audit only after the production artifact and external
   decisions exist; then reconcile the closure register, handoff and final push.

Current remaining-work authority:
`verification/audit/PHASE-5-CURRENT-REMAINING-INVENTORY-2026-08-23.md`.

## Historical Phase 5 resume checkpoint — 2026-08-22

Current remaining-work inventory after the 2026-08-23 crash recovery:
`verification/audit/PHASE-5-CURRENT-REMAINING-INVENTORY-2026-08-23.md`.

This section supersedes older resume instructions below; the older sections are
retained as historical evidence. Current branch `agent/modular-phase1-shared-spine-v2`
has a new bounded product correction at
`a104f5f40bd2b475f9ab45fb407f99149fafb8d9`. The current WWW tree SHA-256 is
`03a766bc9204ef956477a2f0177a636cf874165487fea381964e0bec789a20a5`.
The correction changes DAT-02 timing instrumentation only; it does not change
storage semantics or UI wording. MAH-3/MAH-4 governed profiles were regenerated
and the focused, modular and security sweeps are green. The earlier owner
approvals remain valid historical evidence for `c809d04` and were explicitly
rebound by Sagar to corrected commit `a104f5f` on 2026-08-22; see the rebind
record below.

### Completed repository-controlled Phase 5 work

- ETP checkbox target is 44 x 44 CSS pixels. Enabled primary-button contrast is
  6.38:1 and disabled contrast is 4.97:1. Focused ETP UI validation passed 16/16.
- Governed identity regeneration passed `test:manifest` 8/8 and `test:modular`
  86/86. The current WWW tree SHA-256 is
  `03a766bc9204ef956477a2f0177a636cf874165487fea381964e0bec789a20a5`.
- Fresh MAH-3 ETP cases 169-180 were visibly captured for the current identity.
  External manifest SHA-256:
  `d1a47b0b920d239c4b36d7a82fd9307525db41076ba0a0d05d7f971a5c026d94`.
  Sagar approved them and explicitly rebound the approval to `a104f5f`; the
  MAH-3 baseline is complete at 180/180.
- The signed rendered-language matrix covers 78/78 cells, 2,463 target
  measurements and 6,303 contrast measurements with zero violations. A6-02,
  A6-04 and A6-05 pass and the signature validates. Evidence SHA-256:
  `f086db579c2fa4bbefaeee40ecdfbdb6f3377de5964382a3dc53b2d9a5ee8cc7`.
  Sagar's fluent Marathi/Hindi approval is complete and explicitly rebound to
  `a104f5f`; `GATE-NATIVE-LANGUAGE` is closed.
- The R003/R013 presentation package is rebound to the corrected ETP identity;
  focused tests pass 24/24 and owner approval is complete;
  `GATE-ETP-EXCEPTIONS` is closed.
- PAYMENTTYPE25 is closed on the owner's approved continued-quarantine
  disposition until an authoritative Helios mapping becomes available.

### Current seeded APK and SM-T875 session

| Field | Current fact |
|---|---|
| APK | `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk` |
| SHA-256 | `90DDA701C2B9D44B89B6D7E6ACADB80A22CB67D5885616781C82DEC4F349D2DD` |
| Bytes | 7,218,076 |
| Package/version | `com.saagartraders.bcc`, version 2.9, code 209, minSdk 23, targetSdk 34 |
| Signing | debug-signed seeded test candidate; not a production release |
| Device | Samsung SM-T875, Android 13 / API 33 |
| Installed identity | device-side `base.apk` SHA-256 matches the corrected candidate exactly |

The 2026-08-22 physical session proved a successful cold launch, background and
resume, native encrypted-store initialization with 6,558 records, and successful
opening of Retail ETP Import, Verified Reports, Coverage & History, and
Reconciliation & Exceptions. No crash, ANR or fatal Android/WebView/Capacitor
error was observed. Empty verified views correctly fail closed with
`ETP_VIEW_SCOPE_REQUIRED` because no report set is published. That first session was a fresh install (`firstInstallTime` equalled
`lastUpdateTime`) and could not prove update preservation. **A second session at
20:18 the same day did** — see below. `GATE-UPDATE-PHYSICAL` is now closed.

The owner directed the real four-report session to be skipped for now. Therefore
no R003/R013/R022/R025 validation, publication, verified read, publication
history or production-data exception result is claimed. `GATE-ETP-PRODUCTION`
is explicitly **deferred, not passed**.

### DAT-02 physical diagnostic and bounded correction — 2026-08-22

The first SM-T875 DAT-02 attempt exposed a measurement defect, not slow storage:
it reported a 10,291.2 ms frame p95 beside a 9.1 ms total p95. The rAF callback
timestamp and `performance.now()` were being compared across different WebView
clock domains during a window/surface replacement. Commit `a104f5f` now measures
both frame endpoints and total time with one monotonic clock, with a permanent
source regression test.

The corrected APK was installed update-in-place and the exact installed APK hash
matches `90dda701...`. Two controlled five-save runs, including the required A5
stability repeat, passed on SM-T875 with no fatal exception or ANR:

| Run | Export p95 | Frame p95 | Total p95 | Result |
|---|---:|---:|---:|---|
| Post-correction | 0.2 ms | 9.8 ms | 9.9 ms | **Accepted** |
| A5 stability repeat | 9.3 ms | 10.6 ms | 10.7 ms | **Accepted** |

Evidence: `verification/audit/PHASE-5-DAT02-SM-T875-2026-08-22.json`.

This is a real physical-device pass for this SM-T875 and its two-year synthetic
data profile. It does **not** close governed A10-04: the audit runner still has
no qualifying device-runtime producer, rejects seeded-APK binding, and the
controlled script also requires a second accepted/API-23-class device plus
representative-real-volume justification. A10-05 remains unmeasured. No further
DAT-02 repetition is pending on this SM-T875.

The same session completed two Expense open/close PSS cycles as an external ADB
diagnostic. PSS returned from 210,791 KB before opening Expense to 194,751 KB
after the second close: -16,040 KB (-7.61%), with no fatal exception or ANR.
That is healthy against the +10% diagnostic limit. Evidence:
`verification/audit/PHASE-5-EXPENSE-MEMORY-DIAGNOSTIC-SM-T875-2026-08-22.json`.
A10-05 remains formally `unmeasured`: `dumpsys meminfo` is not the compatible,
signed, source-bound producer required by the audit runner. No further external
ADB memory repetition is pending on this SM-T875.

### Approval rebind to corrected identity — complete

Sagar explicitly directed: `lets Rebind approvals to corrected commit a104f5f`.
The bounded delta was verified before applying that direction. The only changed
shipped WWW file is `www/storage-core.js`, whose change is confined to DAT-02
clock instrumentation. The approved wording, ETP markup, presentation logic and
layout/style inputs are byte-identical. The corrected APK was also installed and
tested update-in-place on the same named physical device.

Approval record:
`verification/audit/approvals/PHASE-5-A104F5F-IDENTITY-REBIND-APPROVAL-2026-08-22.json`.

| Approval/gate | Corrected result |
|---|---|
| MAH-3 ETP visual cases 169-180 | **Rebound approved** to `a104f5f`; regenerated profile SHA-256 `905b6f93...` |
| `GATE-NATIVE-LANGUAGE` | **Rebound closed**; prior signed capture retained as historical evidence, not relabeled as a new signature |
| `GATE-ETP-EXCEPTIONS` | **Rebound closed**; all three approved presentation inputs remain byte-identical |
| `GATE-UPDATE-PHYSICAL` | **Rebound closed** to corrected APK `90dda701...` and the SM-T875 update/diagnostic evidence |

Corrected identity: product fingerprint SHA-256
`4e42cf230b9650a7e0f8ad30633dbf639d2158215d99232dfe14f0ab90716667`,
WWW tree SHA-256 `03a766bc...`, APK SHA-256 `90dda701...`.
`GATE-UPDATE-API23` is not part of this rebind and still needs the eventual
shipping artifact. A10-04/A10-05 remain carried audit checks despite healthy
external diagnostics.

### Original owner approvals and device acceptance — `c809d04` identity

All three outstanding owner-review packages were approved, and physical update
preservation was proved and accepted. Every hash cited by every package was
independently recomputed before its approval was recorded.

| Item | Result |
|---|---|
| MAH-3 ETP cases 169-180 | **Approved.** Baseline complete at **180/180**. All 12 screenshot hashes and the manifest hash `d1a47b0b...` re-verified |
| 78-cell rendered-language matrix | **Approved.** `GATE-NATIVE-LANGUAGE` rebound to the current identity; Ed25519 signature verified valid and authorized |
| R003/R013 exception presentation | **Approved.** `GATE-ETP-EXCEPTIONS` moved from carried exception to **closed** |
| PAYMENTTYPE25 | Reconciled into the register as **closed** on the 2026-08-21 continued-quarantine disposition |
| Physical update-in-place | **Accepted.** `GATE-UPDATE-PHYSICAL` **closed** |

Approval records are in `verification/audit/approvals/`:
`MAH3-ETP-VISUAL-APPROVAL-2026-08-22.json`,
`PHASE-5C-NATIVE-LANGUAGE-APPROVAL-2026-08-22.json`,
`ETP-EXCEPTIONS-APPROVAL-2026-08-22.json`,
`GATE-UPDATE-PHYSICAL-APPROVAL-2026-08-22.json`.

**Transcription note.** The MAH-3 package states the visible harness is the
authority for marking each case. The twelve results were transcribed from the
identity-bound owner approval rather than marked case-by-case in the harness.
Each case therefore carries an `evidenceRef` naming the external capture manifest
and its own screenshot hash, and the approval record says so plainly.

#### Install-replace evidence — the gap the earlier session left

`adb install -r` on SM-T875, Android 13 / API 33, serial `R52N807PTTE`:

| Check | Result |
|---|---|
| `firstInstallTime` | held at 18:02:33 — proves update, not fresh install |
| `lastUpdateTime` | advanced to 20:18:08 — proves the replace occurred |
| `userId` | 10257 unchanged |
| `files/bcc.dek` | hash unchanged — the Keystore-wrapped DEK survived |
| `saagar_qms_archive.json` (7.9 MB) | hash unchanged before, after, and post-relaunch |
| WebView storage | 386 KB unchanged |
| Relaunch | MainActivity focused, 0 fatals, 0 ANRs, 0 WebView/Capacitor errors |
| Installed `base.apk` | equals the built artifact exactly |

Evidence: `verification/audit/PHASE-5-UPDATE-PHYSICAL-EVIDENCE-2026-08-22.json`.

#### Build reproducibility and a host-environment build fix

The seeded APK was rebuilt from a clean tree at `a4612db` and came out
**byte-identical** to the installed artifact and to the hash recorded above:
`30922dad...`, 7,218,076 bytes. The seeded build is reproducible.

Getting there required fixing a build bug that is host configuration, not project
code. This machine sets `NoDefaultCurrentDirectoryInExePath=1`, so `cmd.exe` will not
resolve a bare `gradlew.bat` from the working directory. `scripts/build-seeded-apk.mjs`,
`build:apk` and `build:release` all used the bare name and all failed with
`'gradlew.bat' is not recognized`. All three now use the current-directory-relative
form, matching the convention already documented and used in
`scripts/audit/runner-support.mjs` and `scripts/audit/controlled-probes.mjs`.

**`build:release` was verified end to end.** It now reaches Gradle and stops at the
intended fail-closed guard, `Signed release blocked: set SAAGAR_KEYSTORE_FILE...`,
because no signing credentials are set. No release artifact was produced and the
tree stayed clean. Without this fix that script would have failed on a host quirk
at the exact moment the signing custodian ran it.

#### Current register standing after the `a104f5f` rebind

The reconciled register remains **5 closed / 2 pending / 3 carried gates / 3
carried checks**. Its four applicable approvals are now explicitly bound to
`a104f5f`; only `GATE-UPDATE-API23` retains `rebindingRequired` for the eventual
shipping artifact.

| State | Gates |
|---|---|
| Closed | UPDATE-API23, NATIVE-LANGUAGE, PAYMENTTYPE25, ETP-EXCEPTIONS, UPDATE-PHYSICAL |
| Pending | UAT, RELEASE |
| Carried | ETP-PHYSICAL, ETP-INTERRUPTION, ETP-PRODUCTION |

`GATE-UPDATE-API23` is closed but carries `rebindingRequired`: it is bound to the
superseded APK `f7f18ea3`, not the artifact that will ship.

Focused sweep: **439 tests, zero failures** — modular 86, MAH-4 46, MAH-3 19,
ETP 155, security 101, manifest 8, language 10, mobile 6, settings 8.

### Release roles and the independence exception — 2026-08-22

Record: `verification/audit/approvals/PHASE-5-ROLE-ASSIGNMENT-2026-08-22.json`.

| Role | Holder | Status |
|---|---|---|
| Privacy and legal reviewer | Sagar (sagarbora91) | **Owner self-review, not independent counsel** |
| Production key custodian | Sagar (sagarbora91) | Assigned |
| Independent release approver | Sagar (sagarbora91) | **NOT INDEPENDENT — same person as custodian** |
| Representative staff testers | — | **UNFILLED** |

#### The independence control is NOT satisfied

`GATE-RELEASE` requires a named production-key custodian **and an independent
release approver, who must not be the same person**. The owner directed on
2026-08-22 that he hold both, after the requirement and its consequence were
raised and explained. This is a single-owner business and no second authority is
available.

**This is recorded as an accepted exception, never as a satisfied control.** The
gap appears in the `GATE-RELEASE` row, in that row's `requiredEvidence` line, and
in a top-level `roleAssignments` block, so no part of the register can be read as
claiming independence. **When `GATE-RELEASE` closes it closes carrying this
exception, not as a clean pass.**

Risk accepted, as written in the record: no second person will verify that the
signed artifact matches what was reviewed, that prerequisite gates were genuinely
closed, or that the carried exceptions were understood before release. The
separation-of-duties control that normally catches a custodian signing the wrong
artifact, or waving through an unmet gate, is absent. Any later reviewer,
auditor, acquirer or regulator will see a self-approved release.

Reopen condition: if a second person becomes available before release, they
should perform the release approval and this exception can be withdrawn.

Two mitigations are recorded and remain available. Neither restores independence,
but both leave a better trail: have a non-custodian countersign the artifact hash
even without being a formal approver, and keep the signing receipt and the release
decision as separate dated records rather than one combined statement.

#### Still unfilled

`GATE-UAT` needs **named representative staff testers** for the cashier/maker and
manager/checker rows of the role matrix. The owner can only fill the owner/admin
row. This is now the only unnamed role in the programme.

### Exact remaining Phase 5 closure work

1. ~~Owner approvals for MAH-3 169-180, the rendered-language matrix and
   R003/R013.~~ **DONE 2026-08-22.**
2. ~~Physical install-replace/update preservation.~~ **DONE and accepted
   2026-08-22;** `GATE-UPDATE-PHYSICAL` closed.
3. ~~Run the SM-T875 DAT-02 screen measurement.~~ **DONE twice and stable** for
   the two-year synthetic profile. To close A10-04 rather than carry it, still
   add a qualifying governed producer/build binding and satisfy the second-device
   and representative-volume conditions. The two-cycle Expense ADB diagnostic
   is also **DONE and healthy** (-7.61%), but A10-05 still needs its governed
   producer/binding to close, or remains a carried exception.
4. Run the API-23/OEM document-provider interruption and safe-low-storage ETP
   session. The Android-13 SM-T875 smoke does not prove an API-23-class device.
5. When authorized files are available, run the real WLMHW/HEMW four-report ETP
   publication. Until then keep `GATE-ETP-PRODUCTION` deferred.
6. Record a named staff UAT tester and obtain their identity-bound decision. The
   privacy/legal reviewer is now named (owner self-review, 2026-08-22); the staff
   testers are still **UNFILLED**.
7. ~~Reconcile the earlier identity-bound visual/language/exception approvals and
   physical-update acceptance to corrected product commit `a104f5f`.~~ **DONE
   2026-08-22** through the explicit bounded rebind approval; no recapture or
   device-test repetition remains for these four approvals.
8. Build the production-signed artifact using custodian-held credentials, record
   the named signing custodian, and install/launch the exact signed APK. The
   release approval will be made by the custodian himself: the independence
   control is **not satisfied** and closes as a recorded exception, not a pass.
   `build:release` is verified working and fail-closes without credentials.
9. Run the final controlled audit, reconcile the closure register, update this
   handoff, commit and push the final closure checkpoint.

Do not rebuild or recapture the current candidate merely to repeat a successful
measurement. Rebuild only for a tracked product change, production signing, or a
documented invalid capture. Do not relabel debug, synthetic, fresh-install or
empty-state evidence as production publication, update preservation, UAT, legal,
production signing or independent release acceptance.

## Phase 4 program completion checkpoint - 2026-08-21

**Owner direction:** Phase 4 and every named Phase 4 subphase are complete:
Phase 4A, Phase 4B, Phase 4C.1 and Phase 4C.2. Do not reopen or extend the
Modular HTML migration program to absorb later ETP product work or release
administration.

This is a program-boundary decision, not a claim that every audit check or
external release gate passed. The Phase 4C.2 closure register remains the
authoritative risk register and remains `draft-open`: C-08/A10-01, A10-04 and
A10-05 are carried open, four ETP gates are carried open, and external
PAYMENTTYPE25, UAT/legal and production-signing/release decisions remain outside
the completed Phase 4 implementation program.

The Retail ETP feature is now a separate post-Phase-4 completion workstream.
Physical inspection on 2026-08-21 used the exact seeded debug-UAT APK SHA-256
`F7F18EA3E3A0BD1B42B7B390E567993AD46160E0AA844A126509C28A33754287`
on Samsung SM-T875, Android 13 / API 33. Package `com.saagartraders.bcc`, version
2.9 / code 209, was installed, running and focused, and its installed APK hash
matched. The owner reported all non-ETP application checks passed and ETP was
incomplete. Live ETP inspection proved that Reports routing, the import screen,
native date picker and Android document-provider launch work without a crash or
fatal log. No four-report XLSX set was present, so no validation, publication or
verified read was performed.

The exact remaining ETP boundary is documented in
`docs/audit/POST-PHASE-4-ETP-COMPLETION-2026-08-21.md`. ETP is not a twelfth
modular module in the frozen APK, no product screen consumes `readVerified`,
PAYMENTTYPE25 remains quarantined, and production/physical ETP acceptance remains
open. These facts do not change the owner-directed Phase 4 completion state.

## Mandatory execution guardrails - owner direction 2026-08-17

These rules override any earlier preference to "finish in one go" or deploy many
agents. They exist to prevent repeated work, uncontrolled evidence invalidation,
and avoidable usage consumption.

1. Treat the Modular HTML implementation and all Phase 4 subphases as complete.
   Do not reopen migration implementation unless a reproducible product defect
   requires it. ETP completion is a separate post-Phase-4 workstream.
2. Preserve every valid output by exact commit, file SHA and run identity. Never
   repeat an expensive test, browser capture, APK build or audit merely to seek a
   more favorable result.
3. Before any expensive operation, perform the cheapest static/schema/identity
   preflight. Do not capture timing or rendered evidence for an unreviewed or
   uncommitted candidate.
4. Only one agent may own a given artifact or measurement. Parallel agents may
   review, prepare independent inputs or work on disjoint tasks, but must not run
   overlapping suites or captures.
5. Freeze product and tooling identities before generating evidence. Any proposed
   change after freeze must first list exactly which APKs, attestations, baselines,
   comparisons and approvals it invalidates.
6. For Phase 4C.1 timing, run at most two consecutive formal measurements. If
   either fails, preserve the failure and stop for an owner decision. Do not start
   a third candidate or select a favorable rerun automatically.
7. Run the complete product suite once per frozen candidate. Rerun it only when
   tracked product/test inputs changed or the prior run was technically invalid,
   with the reason recorded first.
8. Keep physical-device, OEM, production ETP, UAT/legal, signing and release
   acceptance in the external closure register outside the completed Phase 4
   program. Never block or reopen completed migration work merely because those
   external authorities are unavailable.
9. Prioritize a functioning ETP Reports module and user-visible product behavior
   over additional audit refinement. Do not expand scope without explicit owner
   authorization.
10. Report the expected expensive commands, reuse boundary and stop condition
    before execution. If the stop condition is reached, stop rather than iterate.

Current resume authority is
`verification/audit/PHASE-4C2-FINAL-CLOSURE-REGISTER-2026-08-19.json`, with
`verification/audit/PHASE-4C2-EXTERNAL-CLOSURE-PACK-2026-08-19.md` as its
operational companion. The 2026-08-17 crash checkpoint remains valid history for
Phase 4C.1 execution.

## Historical Phase 4C.2 external acceptance checkpoint - 2026-08-21

At this historical checkpoint Phase 4A, 4B and 4C.1 were complete and 4C.2 was
the only pending subphase. The 2026-08-21 owner direction above supersedes that
program-state statement and marks 4C.2 complete with its open risks carried into
the external closure register. Nothing in the 2026-08-21 session changed product
code; the frozen identity below was unchanged and re-verified byte-for-byte.

### Live records - use these, not the 08-17 drafts

| Record | Path |
|---|---|
| Closure register | `verification/audit/PHASE-4C2-FINAL-CLOSURE-REGISTER-2026-08-19.json` |
| External closure pack | `verification/audit/PHASE-4C2-EXTERNAL-CLOSURE-PACK-2026-08-19.md` |

Commits `192c43c`, `2a96a67`, `881c252` on `agent/modular-phase1-shared-spine-v2`,
pushed to both `github` and the local `origin` mirror.

**Both 2026-08-17 drafts are bound to the superseded identity** (product
`3f8a37ce`, fingerprint `47c1e9c0`, APK `F4DDBC1D`, tooling `29a09475`) and close
nothing. They were written before that evening's 4C.1 refreeze. They are retained
unmodified as history and named by hash in the replacements. The old register also
had no row for A10-05 at all, and cited the superseded Phase 4B language approval
rather than the current 4C1 one.

### Verified at re-entry

- Frozen identity intact: product `ad2d643`, fingerprint `08734dfb`, target
  `cc9a117c`, tooling `667ab0d`.
- Comparison manifest recomputed: `f2741ee7...` exact match.
- APK recomputed from disk: `f7f18ea3...`, 7,010,364 bytes, exact match.
- A10-01 untouched: `fail`, P2, `+7.559%`, C-08 failing solely for it.

### Gate standing: 2 closed, 4 pending, 4 carried

| State | Gates |
|---|---|
| **Closed** | `GATE-UPDATE-API23`, `GATE-NATIVE-LANGUAGE` - both now cite current-identity evidence |
| **Carried as owner-accepted exception** | `GATE-ETP-PHYSICAL`, `GATE-ETP-INTERRUPTION`, `GATE-ETP-PRODUCTION`, `GATE-ETP-EXCEPTIONS` |
| **Pending external authority** | `GATE-UPDATE-PHYSICAL`, `GATE-PAYMENTTYPE25`, `GATE-UAT`, `GATE-RELEASE` |

Plus three carried audit checks: `A10-01`, `A10-04`, `A10-05`.

Gate rows resolve to exactly one of three decisions and never to a blank. A
carried exception is never a pass: the register enforces
`carriedExceptionCountsAsClosedAllowed: false`.

### A10-04 / A10-05 - carried, and structurally unclosable

Owner direction 2026-08-21: carry them open rather than build a device harness.
Accepted risk, stated in the register: **backup save latency and Expense memory
growth are unverified on physical hardware at ship time.**

Two structural blockers were found by reading the validator. Neither is in any
earlier planning document, and no device fixes either:

1. **APK binding.** `validBuildBinding` in `scripts/audit/audits/a10.mjs` accepts
   only an `apkSha256` matching a reproducible-build capture in
   `A9-BUILD-COMPARISON.json`. Both captures are **`d79eb925...`**. The frozen
   seeded APK `f7f18ea3...` is not among them, because it comes from
   `scripts/build-seeded-apk.mjs` rather than the audited `npm run build:apk`.
   Any device record naming the seeded APK returns
   `DEVICE_RUNTIME_APK_BINDING_INVALID` **on any hardware**.
2. **No producer.** Nothing emits `SAAGAR_A10_DEVICE_RUNTIME_ACCEPTANCE`; the
   record prefix `verification/audit/accepted/device-runtime/` does not exist. A
   valid record also needs an Ed25519 signature from trusted signer
   `phase4a-renderer-ed25519-9ec3b61b...` and a `SAAGAR_A10_DEVICE_HARNESS`
   artifact.

**Consequence: "4C.2 has no engineering left" is not accurate.** It holds for the
achievable gates, not for A10-04/A10-05.

**Two artifacts, different jobs.** `f7f18ea3` is for human-judgment gates
(install, smoke, UI review, UAT). `d79eb925` is the only artifact the A10 device
validator will accept. Do not conflate them.

### Retail ETP - four gates carried, but the feature ships

Owner direction 2026-08-21: the ETP module completes after its own modular
migration, so its four gates are carried rather than closed.

**ETP was never migrated** - the eleven migrated modules are under `www/modules/`;
ETP is eighteen files at `www/` root. **But it ships reachable:** seventeen
`etp-*.js` script tags, `etp-import-worker.js` as a Web Worker, a live
`Open ETP import` button at `www/index.html` line 329, and **no feature flag**.

So the release puts a reachable financial-import feature in users' hands without
physical/OEM acceptance, without any real production publication, and without
owner review of its exception screens. The release-approver template now requires
written acknowledgement of exactly that.

The option not taken: flagging ETP off would remove the gates from release scope
honestly, but a flag is a product change that supersedes the fingerprint, APK,
comparison, capability approval and language approval - restarting 4C.1.

Real mitigation, not to be overstated:
`verification/ETP-CORE-REAL-CONFORMANCE-2026-08-09.json` shows both stores parsing
clean with zero PII canaries and REC-002 reconciling `PASS`, `differenceCount: 0`,
across 4,658 WLMHW and 708 HEMW groups. That is conformance, not publication.

### Device routing - "no tablet" is not "emulator"

`a10.mjs` requires `device.type === 'physical-android'` and API at least 23. There
is **no model check**; SM-T875 is project naming, not an audit requirement. The
adjacent identity fields are unverifiable hashes, so an emulator entry *would*
pass the validator - which is precisely why it must never be written.

**Cloud device farms are genuine physical hardware** operated remotely (Samsung
Remote Test Lab, BrowserStack App Live, AWS Device Farm) and satisfy
`physical-android` honestly with no purchase. With A10-04 carried, the
representative-volume rule no longer gates any session, so remaining physical work
runs on seeded data only - never put real shop data on borrowed or cloud hardware.

Acceptance-device re-designation away from SM-T875 is **still unrecorded** and is
required before a substitute device closes `GATE-UPDATE-PHYSICAL`.

### Prepared but undecided

- **`GATE-PAYMENTTYPE25`.** Facts gathered: WLMHW 2,802 of 4,658 R022 rows
  (**60.2%**), HEMW 18 of 708 (2.5%). Quarantine excludes the **tender
  attribution, not the row and not the money** - REC-002 reconciles `netValue`
  against `netAmount` and passed with zero differences. The deciding fact is what
  PAYMENTTYPE25 maps to in Helios, which is owner knowledge. Not carried as an ETP
  exception: it needs only a decision.
- **`GATE-ETP-EXCEPTIONS`.** A review surface was rendered on 2026-08-21 by
  extracting `exceptionPresentation()` and `exceptionHtml()` verbatim from
  `www/etp-import-ui.js` and evaluating them, in four states. Not signed, so the
  gate stays carried. It is the cheapest of the four to reverse: an owner review
  with the surface named closes it, no device and no production data.

### What actually remains

`GATE-PAYMENTTYPE25` needs one owner decision. `GATE-UPDATE-PHYSICAL` needs one
cloud real-device session plus the re-designation record. `GATE-UAT` and
`GATE-RELEASE` are blocked on **naming people**: a privacy/legal reviewer, a
signing custodian, and an independent release approver who is not the custodian.

**The critical path is naming those three people, not hardware.**

### Honest status sentence

> Modular HTML migration and Phase 4C.1 engineering and evidence execution are
> complete. Phase 4C.2 external release acceptance is pending, with C-08 failed,
> A10-01, A10-04 and A10-05 carried open as owner-accepted exceptions, and the
> four Retail ETP gates carried open pending that module's separate modular
> migration while the feature nonetheless ships reachable.

## Phase 4C.1 final controlled checkpoint - 2026-08-17

Phase 4C.1 controlled execution is complete with one explicitly accepted open
performance exception. This does not mean release acceptance is complete.

| Authority | Identity |
|---|---|
| Product implementation commit | `ad2d643dfa371c05779aafc52e0c2ecf618c1a42` |
| Product fingerprint SHA-256 | `08734dfbb1d82f69849a4d8857cf1c311c0c0054f5a1b46bca41d42d2c15969e` |
| Audited comparison target | `cc9a117c5245f352922da5c9f699daa16226bbf3` |
| Governed tooling | `667ab0d2bc83f8f6347976548f30f5a1ccf6b12a` |
| Baseline target | `537539f76aa333f760431acb9cb21cf3bedeab7d` |
| Baseline manifest SHA-256 | `3a863511a04d5a7a9f16c4042d6ec7e42b1d92356ad52c8efbaec1ea6c57f23f` |
| Approved comparison | `verification/audit/2026-08-17-220000-cc9a117c5245` |
| Approved manifest SHA-256 | `f2741ee762fe39caa0ba8d99b6842611ca6cd98d573ebf70fa874399337bfd5a` |

- The complete product suite passes 510/510.
- C-01 through C-07 and C-09 pass. The exact 107 capability deltas are owner-approved and identity-bound with zero invalid, stale or unapproved rows.
- C-08 remains failed solely because A10-01 is a measured P2 performance exception: shell parse p95 increased `1070.2 -> 1151.1 ms` (`+7.559%`) against the `+5%` limit. Sagar directed the project to proceed with A10-01 remaining open. Do not rerun or silently convert it to pass.
- A10-02 passes at `+3.146%` against the `+10%` limit. A10-04/A10-05 remain unmeasured physical-device gates.
- Signed 72-cell rendered evidence passes A6-04/A6-05 with zero target, contrast or browser-error findings. Sagar's new exact approval closes `GATE-NATIVE-LANGUAGE` for this identity only.
- Final seeded debug-UAT APK: `V:\Co work\Projects\Retail\SaagarCC-Phase4C1-Seeded-2Y-v2.9-ad2d643-F7F18EA3.apk`, 7,010,364 bytes, SHA-256 `F7F18EA3E3A0BD1B42B7B390E567993AD46160E0AA844A126509C28A33754287`. API-23 install-replace, installed-hash equality, launch/focus and zero-fatal engineering checks pass.
- Phase 4C.2 remains external: SM-T875 A10-04/A10-05 and physical update checks, physical/OEM and production ETP acceptance, staff UAT/legal, production signing and release approval. These items must not reopen the completed Modular HTML implementation or Phase 4C.1 execution.

## Historical Phase 4B checkpoint - 2026-08-12

This checkpoint is the current authority. The detailed execution and exit plan
is `docs/audit/CONSOLIDATED-PHASE-4-CLOSURE-PLAN.md`. The connectivity-safe,
commit-by-commit execution order is
`docs/audit/PHASE-4-MICRO-CHECKPOINTS-2026-08-12.md`.

| Authority | Identity |
|---|---|
| Product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` |
| Working branch | `agent/modular-phase1-shared-spine-v2` |
| Frozen Phase 4B comparison target | `3f8a37cebf998cf6dd006e3a33de95600d3808f3` |
| Governed tooling | `29a094757fbc5386d379ee73e71a30228b348308` |

- Modular HTML implementation is complete. Phase 4 audit and release closure is
  not complete.
- Current internal diagnostics pass A2, A7, and A8. The A5 mutation cleanup and
  C-04 storage inventory/comparator defects are corrected.
- A6-03 passes with zero localization bypasses after Sagar's exact 854-row
  approval and import. A6-04/A6-05 now pass with committed, signature-valid
  72-cell rendered evidence. Sagar's separate identity-bound fluent visual
  approval is recorded and `GATE-NATIVE-LANGUAGE` is closed for repaired product
  `5fc59e1cf09898e4e5fc030a8097f74736387ec6` using the replacement signed
  evidence. The earlier approval remains historical and is not reused.
- Retail ETP import is owned only by Reports. Bounded R003/R013 exception counts
  are presented as reconciliation information that does not alter revenue or
  sales totals.
- API-23 emulator install-replace, preserved seeded state, restart, recreation,
  and rotation checks are engineering evidence only; they do not close physical
  OEM, owner-device, production-signing, or release acceptance.
- The earlier capability approval and Samsung SM-T875 acceptance are bound to
  older identities. They cannot be reused for the final target or final APK.
- The final controlled comparison and exact identity-bound capability approval
  are complete. Keep PR #5 in draft until the remaining physical/performance,
  production, UAT, legal, signing, and release authorities are complete.

### Crash-resume checkpoint

- The first Phase 4B unapproved comparison was a diagnostic run against
  `065e2e55ad3658ffaef52ce5b0ef9a1f72cdee42`. Its 18 files and hashes validate;
  C-01 and C-04 through C-09 pass, while C-02/C-03 are deliberately unapproved.
  It also exposed one new P1 A5-03 finding: the three-case
  `tests/a6-analyzer-noise-source-regression.test.mjs` was committed but absent
  from every package test command. That diagnostic output is not final evidence
  and must not be approved or committed as the Phase 4B comparison.
- The minimum honest repair registers that file in `test:language`, increasing
  the complete product pipeline from 507 to 510 tests. A registry exclusion or
  finding waiver is invalid for this ordinary executable test. Frozen tooling
  `29a094757fbc5386d379ee73e71a30228b348308` and baseline manifest SHA-256
  `b878f01cf7c54f1cad935ae092c6ac042ce88bed8aad6f23c5e2d12051b78468`
  remain valid. Because `package.json` contributes to product identity, repeat
  the signed 72-cell capture and exact-identity fluent approval before refreezing
  and rerunning the comparison.
- The repair is committed and pushed at
  `5fc59e1cf09898e4e5fc030a8097f74736387ec6`; A5-03 passes and the complete
  product pipeline passes 510/510. Its product fingerprint SHA-256 is
  `47c1e9c04bd94829f8a1987bd49b8466032e12ca6a9248aef9a19dd826a12a06`.
  Replacement signed evidence is tracked at
  `verification/audit/attested/rendered-ui/phase4b-a6-rendered-5fc59e1cf098-20260816.json`
  by commit `997c71a03122071a900b164be737680afa11384d`. It measures 72 cells,
  2,394 targets and 6,105 contrast samples with zero violations; A6-04/A6-05
  pass. Rendered evidence SHA-256 is
  `aaabdcaf21f0448f10ac2fa0eb2309664ee3fed5546d27f08e09ddfda0941715`,
  matrix SHA-256 remains
  `db8872543dbe55ce461835bc4288946822dd21c8406adab86d75e046558431ff`,
  and all 72 measured cell identities exactly match the prior approved capture.
  Sagar's renewed exact-identity approval is preserved at
  `verification/audit/approvals/PHASE-4B-NATIVE-LANGUAGE-APPROVAL-2026-08-16.json`;
  `GATE-NATIVE-LANGUAGE` is closed for the repaired identity.
- The final unapproved Phase 4B comparison is preserved at
  `verification/audit/2026-08-16-050100-3f8a37cebf99`. Its evidence manifest
  SHA-256 is
  `1a1a827bbeb27444a1ccb0b95b2f1f66fd8448e02e4e3b5ac4190c5cab8bbe5a`.
  All 18 files and declared hashes validate; the product suite passes 510/510,
  there are zero audit findings, A5-03 and A6-04/A6-05 pass, and C-01 plus C-03
  through C-09 pass. C-02 alone fails because all exact 107 capability deltas
  remain unapproved. A10-04/A10-05 remain mandatory physical measurements and
  are not comparison measurement losses.
- Sagar approved the exact 107-row capability delta set for the same frozen
  target. The machine-readable envelope is preserved at
  `verification/audit/approvals/2026-08-16-3f8a37cebf99.json`; its raw SHA-256
  is `4f92d42a696de732aad2d108e59c5ebebd0f2c996634b90b39c1a2c0c772c858`
  and its canonical envelope SHA-256 is
  `719ea606107443a8d9c7375b6231b6f090ecc0ca3431a419ac08839edc391884`.
  The approved controlled comparison is preserved at
  `verification/audit/2026-08-16-051618-3f8a37cebf99`, manifest SHA-256
  `428667ceb47551ea2190a2a69e4fa04203fab285af4363b2fac34489f16beb6c`.
  Its exact 18-file evidence set validates, findings are zero, all C-01 through
  C-09 pass, C-02 records 107 approved and zero unapproved/invalid/stale rows,
  and C-03 is identity-bound. A10-04/A10-05 remain the only mandatory
  unmeasured audit checks; they are Phase 4C physical-device measurements.
- Phase 4C now has an exact debug-UAT seeded candidate built directly from the
  audited product target: `SaagarCC-Phase4C-Seeded-2Y-v2.9-3f8a37ce-F4DDBC1D.apk`,
  7,010,282 bytes, SHA-256
  `F4DDBC1D210AC0FB722333741085FF81B4D20C5B2523DB72ED6ACF2F1B510AED`.
  Package `com.saagartraders.bcc` is version 2.9/code 209, minSdk 23/targetSdk
  34, signed with the Android debug certificate using v1+v2 schemes. Exact
  metadata and API-23 install-replace evidence are in
  `verification/audit/PHASE-4C-FINAL-SEEDED-APK-2026-08-17.json`.
- The exact candidate also passes API-23 rotation, force-stop/relaunch,
  background process death, incomplete ETP-stage recreation, authenticated
  chunk-corruption refusal and secure cleanup, with zero fatal-log matches.
  Supporting evidence is
  `verification/audit/PHASE-4C-API23-RUNTIME-INTERRUPTION-2026-08-17.json`.
  These emulator results close the final-hash install-replace engineering row,
  but not physical/OEM, production or owner acceptance.
- The identity-bound Phase 4C closure-register draft is
  `verification/audit/PHASE-4C-FINAL-CLOSURE-REGISTER-DRAFT-2026-08-17.json`:
  two gates are currently closed (`GATE-UPDATE-API23` and
  `GATE-NATIVE-LANGUAGE`) and eight remain open. The companion external
  worksheet and exact approval templates are in
  `verification/audit/PHASE-4C-EXTERNAL-CLOSURE-PACK-DRAFT-2026-08-17.md`.
- Strict comparable browser diagnostics measure A10-02 module-open p95 as an
  11.789% improvement, but A10-01 shell p95 as a 10.842% regression, exceeding
  the written +5% limit. Do not call A10-01 closed. The frozen audit code also
  fails to enforce that parse-time limit; both the tooling defect and the real
  shell-tail regression require governed remediation before a new evidence
  cycle.

- The exact pre-import product checkpoint was
  `832c9b612af4739908ad04c4521e9999bd86e5e6`; it and its corrected governed
  tooling ancestry are committed and pushed. Governed tooling
  `29a094757fbc5386d379ee73e71a30228b348308` passes all 75 self-tests from its
  frozen tooling lineage. Quote-aware tag scanning and line-level textarea
  placeholder measurement are now fail-closed rather than suppressing real UI
  strings.
- The pre-import A6-03 universe was exactly 854 occurrences / 854 unique phrases
  at a 1,150-phrase governed dictionary. Its extraction SHA-256 is
  `bb642bbb20f283e0c56fe761484b94b675ea76a71958e5629b76165d5cd736f8`.
  The consolidated 854-row review CSV is
  `verification/audit/PHASE-4A-A6-LOCALIZATION-FINAL-REVIEW-DRAFT-2026-08-15.csv`,
  SHA-256
  `06215985a5001b71c06358cda1d1ef02c10e51df9534433fd5171f024bdfdcf7`.
  Sagar approved this exact package and it was imported at
  `2f69a9a0d32d989b0c9be88168bd2d38eda20851`. The post-import CSV SHA-256 is
  `7bf300588c9f084739d481bfb65d2d60c32823f6e6121fe65b64401e7116a277`;
  all rows are `translate` with reviewer `sagarbora91`. Its 100-row attention
  aid has SHA-256
  `afe375f8dd30f0540feeca9edcdc5506fab025b6c80dc16c371a5ef952d24011`.
- The runtime dictionaries now contain 2,009 exact keys per language; the
  governed A6 normalized dictionary measures 2,004 phrases. A6-03 passes with
  zero bypasses across 12 surfaces and 53 first-party JavaScript files. The
  complete product pipeline passes 510/510; MAH-3 passes 19/19, MAH-4 46/46,
  and modular 86/86.
- The first post-import signed Edge diagnostic bound all 72 matrix cells to
  target `e9795999bcbdd1e8ccc3c56716755f133f1e5984`, product fingerprint
  SHA-256 `1cc6a91dbfa2c632436db3c475abd64a5354bc0e733942cf3cfc5e526c577126`
  and matrix SHA-256
  `db8872543dbe55ce461835bc4288946822dd21c8406adab86d75e046558431ff`.
  It measured 163 target-size and 1,695 contrast violations, so it is diagnostic
  evidence only and does not close A6-04/A6-05.
- The bounded rendered remediation is committed and pushed at
  `06b9d74380e2cc1c939ed70f8286b616f76ab86f`. It applies 44px target floors,
  deterministic solid text-bearing backgrounds, darker muted/gold text and
  readable dark-surface text across the shell and affected modules. Profile,
  manifest and shell-asset identities were regenerated. Modular tests pass
  86/86, MAH-3 passes 19/19, and focused mobile/settings/source suites pass.
  Independent same-algorithm checks report zero violations in all six shell
  cells and all 48 assigned non-CRO/payroll/tax module cells; CRO/payroll/tax
  fixes passed their focused source/report/mobile suites but still require the
  next complete 72-cell recapture.
- Crash resume target is the clean pushed commit
  `06b9d74380e2cc1c939ed70f8286b616f76ab86f`. The next action is one complete
  signed recapture using corrected tooling `29a094757...`; do not claim rendered
  closure from the partial lane checks. The external capture runner now binds
  tooling `29a094757...` and has SHA-256
  `6845082ea55c90c884d11f06a4d5a48849b6df415a88ae6776d039a08d8f9b01`;
  validator SHA-256 is
  `a07f3ffbb78dafed1c113684a368471295b3bd7fc1df63212d221c87d93f3937`.
- The final rendered product is `833941efec4daebc47fc6a75007578168ac6b6aa`,
  product fingerprint SHA-256
  `68eef06d732509c29f278feb626f7feaf67b5030a70eb5994780bf7e681b6936`.
  Its signed Edge capture measures all 72 cells, 2,394 interactive targets and
  6,105 contrast samples with zero violations and zero browser errors. Matrix
  SHA-256 is
  `db8872543dbe55ce461835bc4288946822dd21c8406adab86d75e046558431ff`;
  rendered evidence SHA-256 is
  `66fde8537b9ff15e78d77d35ee92403df795c67ee7f4f26c5d43b8cc809ff6a0`.
  The exact attestation file SHA-256 is
  `e4b3cdffe345966a0686a2c031359aa03eeb544b7f9a1421b57172dc48297d83`
  and it is preserved by evidence commit
  `68f5bc94e944f70fef3d41f9140af33bdfc86fab`. Signature verification passes;
  governed A6-04 and A6-05 both pass. This does not itself establish fluent
  Marathi/Hindi acceptance.
- Sagar (`sagarbora91`) reviewed all 72 rendered cells, including all 48
  Marathi/Hindi cells, and approved the exact wording/rendering identity above.
  The verbatim approval is preserved at
  `verification/audit/approvals/PHASE-4A-NATIVE-LANGUAGE-APPROVAL-2026-08-16.json`.
  It closes `GATE-NATIVE-LANGUAGE` only; physical-device acceptance, staff UAT,
  legal approval, production signing and release approval remain open.
- The frozen audit-v1 `OPEN_GATES` registry remains unchanged because it is part
  of governed tooling identity `29a094757fbc5386d379ee73e71a30228b348308`.
  The approval record above is the authoritative Phase 4 external closure
  evidence for this gate; changing the registry would require new tooling,
  baseline and identity-bound rendered evidence.
- The source/analyzer cleanup and governed profiles remain at exactly 107
  capability deltas with comparison delta SHA-256
  `6179252efa5110d96c46be8544f275c46dfb5f14f8d46f4b46a194fc6f2a6420`.
  The corrected-tooling baseline is preserved at
  `verification/audit/2026-08-15-203000-29a094757fbc` by evidence commit
  `bed4c629d8f0835f93c64328c4ab2f3bfbf4dc40`. Its manifest SHA-256 is
  `b878f01cf7c54f1cad935ae092c6ac042ce88bed8aad6f23c5e2d12051b78468`;
  exactly 18 files and every declared byte/hash identity validated. The older
  `18dcb9e5...` baseline below is historical and superseded.
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
- The complete product suite passes 510/510, including 129 ETP and 86 modular
  tests. The modular suite confirms the ledger remains exactly 107 rows with
  comparison delta SHA-256
  `6179252efa5110d96c46be8544f275c46dfb5f14f8d46f4b46a194fc6f2a6420`.
- Prefreeze seeded diagnostic APK: 7,269,978 bytes, SHA-256
  `D4C76C5D567899E1D29FD7AFA9007D0A255CCDEEF161CA1AA1B62E6937AEDEDF`.
  API-23 install-replace and launch pass in 1.532 seconds with MainActivity live
  and zero fatal-log matches. This is engineering evidence, not the final APK.
- Consolidated Phase 4A is complete: A6-03, A6-04 and A6-05 pass, and Sagar's
  exact-identity fluent visual approval closes `GATE-NATIVE-LANGUAGE`.
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
- Localization batch 02 was explicitly reviewed by Sagar and imported at
  `38e44001e93b8ce801be70b2d03310cc8f6c77c9`. Its 100 phrases cover 165
  direct source occurrences, reduce A6-03 from 1,145 to 969, and increase the
  shared dictionary from 950 to 1,050 phrases. The approved CSV SHA-256 is
  `1714079428cafa681d1ab51a2f947c8f473a84b790e59a3cd23349a8e0ae788a`;
  language tests pass 4/4 and source-integrity tests pass 8/8.
- Localization batch 03 was explicitly reviewed by Sagar and imported at
  `12292ef`. Its 100 phrases cover 100 direct source occurrences, reduce A6-03
  from 969 to 862, and increase the shared dictionary from 1,050 to 1,150
  phrases. The approved CSV SHA-256 is
  `9732d776cff4f38c5c17767552097d09c425dc272bed3f6dfa7c08ea8fc5ed2d`;
  language tests pass 4/4 and source-integrity tests pass 8/8.
- The earlier batch 04 draft is superseded by the approved and imported
  consolidated 854-row final review package above.

### Phase 4 progress and remaining-time estimate

- Consolidated Phase 4A has completed tooling/baseline integration, A9-02 code
  remediation, A6-03 localization, complete product verification, diagnostic
  APK build and API-23 smoke. The trusted A6-04/05 capture and measured UI
  remediation and fluent visual review are complete.
- Consolidated Phase 4B is complete: the frozen-target comparison, exact
  capability approval and approved rerun are preserved and all C-01 through
  C-09 pass. Consolidated Phase 4C remains exact-APK physical/performance,
  production ETP, UAT, legal, signing and release authority.
- Immediate next action: finish the governed A10-01 enforcement and shell-tail
  remediation, then rebuild the affected baseline/current evidence identities.
  In parallel, use the exact APK hash above for the SM-T875 A10-04/A10-05 and
  remaining physical/production/owner acceptance evidence.

Received exact approval sentence:

> I, Sagar (sagarbora91), approve the exact 107 capability deltas in
> MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json, comparison delta SHA-256
> 6179252efa5110d96c46be8544f275c46dfb5f14f8d46f4b46a194fc6f2a6420,
> for migration scope A3-02, bound to target commit
> 3f8a37cebf998cf6dd006e3a33de95600d3808f3, audit tooling
> 29a094757fbc5386d379ee73e71a30228b348308, baseline manifest SHA-256
> b878f01cf7c54f1cad935ae092c6ac042ce88bed8aad6f23c5e2d12051b78468,
> baseline target 29a094757fbc5386d379ee73e71a30228b348308, product baseline
> 8f96480ec6ddfc99016af43a7369f57a06cb9fd6, and audit program
> saagar-whole-app-audit-v1.0.0.

## Open acceptance gates

**Superseded 2026-08-21.** This list predates the 4C.2 checkpoint above and no
longer describes current state: A10-01, A10-04, A10-05 and the four Retail ETP
gates are now carried owner-accepted exceptions, and A10-02 passes in the approved
comparison. Read the Phase 4C.2 section and
`verification/audit/PHASE-4C2-FINAL-CLOSURE-REGISTER-2026-08-19.json` instead. The
list is retained as history.

- A10-01 governed shell-parse remediation and comparable attestation. A10-02
  currently passes only in the diagnostic comparable capture and must be
  recaptured under the final governed tooling identity.
- A10-04 five-save physical-device latency measurement and A10-05 two-cycle
  physical-device memory measurement against the final exact APK.
- Final exact-hash physical-device and OEM/document-provider evidence.
- Production ETP, mapping, UAT, legal, signing, and release decisions.

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
