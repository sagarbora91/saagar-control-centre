# Saagar Control Centre - Safe and Lawful Android Closure Handoff

**Updated:** 2026-08-04 (Asia/Kolkata)
**Purpose:** the single resume point for the Android safe-and-lawful closure and the V6 improvement programme.
**Programme status:** Phase 0 and improvement waves D1-D4 are implemented, regression-tested, merged and pushed. **Nothing is production accepted.** No device pass, UAT, legal approval, or production signing has been performed.

## Read this first

- `main` and `origin/main` are both at `9b54a44` (pushed 2026-08-04), the D4 merge. Working tree clean; no unpushed commits; no feature branch outstanding.
- **`npm run test:offline` is 257/257; the full `tests/*.test.mjs` glob is 260/260.** The offline script lists files explicitly, so a new test file must be added to it or CI will silently skip it.
- **API-22 exception RETIRED (owner confirmed 2026-07-29: all field devices are Android 6+).** Production `minSdkVersion = 23`, stamped by `apply-overrides.js` with FATAL guards; supersedes the earlier OD-K1 "keep 22, fail-open plaintext" ruling.
- **The build needs the bundled JDK 17**, not the system Java 8: `JAVA_HOME="V:/Co work/Projects/Retail/.android-build/jdk17/jdk-17.0.19+10"`. Gradle 8.2.1 will not run on Java 8.
- PHP platform work (Track B / P1 onward) is **deferred by the owner and outside the current scope**. Do not start it without fresh owner direction.
- **The two blocking inputs are both owner-side, not engineering:** the Phase 0 nominations form (unblocks every device gate) and the ETP sample exports from both stores (unblocks the entire E-series). Engineering can continue on D5-D12 without either.

## Repository and build snapshot

| Item | Current fact |
|---|---|
| Pushed baseline | `9b54a44` on `origin/main` - "Merge D4: DSR completion meter, no-sales acknowledgement, and patcher idempotency fixes". |
| Permanent regression suite | `npm run test:offline` **257/257**; full glob **260/260** (2026-08-04). |
| Current debug APK | `V:\Co work\Projects\Retail\SaagarCC-D4-DSR-Completion-debug.apk` - 6,593,846 bytes, SHA-256 `8fe8167b983e8c59a99ae9ed671e7ca0e29234c745e8a98a132391560792fdea`. Contents verified by unpacking, not inferred from build success. |
| APK identity | `com.saagartraders.bcc`, version 2.9, versionCode 209, min API 23, target API 34. |
| APK posture | `android:allowBackup=false`; **debug certificate**; suitable for device acceptance only. All four native plugins present in the dex. |
| Production signing | Fails closed when production signing secrets are absent. No production release exists. |
| Seed posture | Clean source has `DEMO_SEED_ENABLED=false`; the seeded APK sets it `true` only at packaging time in the git-ignored `android/` output, never in committed source. Never use demo data for production acceptance. |

**Older APKs referenced further down this file are superseded** by the D4 build above. The v2.9 pair (`SaagarCC-BKP03-DAT02-v2.9-debug.apk`, `SaagarCC-DemoData-v2.9.apk`) predate D1-D4 and must not be used for a current functional pass.

## Programme inventory - 2026-08-04

### Completed and on main

| Item | Evidence |
|---|---|
| Phase 0 - encrypted storage, owner access, storage recovery, R1 legal minimum | merged `f76d4ab` |
| **D1** Home "Today" view, store context, reauth explanations, backup health | `4177701` (2026-07-30) |
| **D2** QMS fast arrive→outcome, follow-up priority, duplicate suggestion | `4177701` |
| **D3** Service workboard, pickup readiness, customer-safe status, exceptions | `4177701` |
| **D4** DSR completion meter, submit prompts, no-sales acknowledgement | `9b54a44` (2026-08-04) |

**4 of 12 D-series waves are done. The E- and F-series have not started.**

Defects fixed while verifying D4, all pre-existing:
- `apply-d2-qms.mjs` and `apply-d3-service.mjs` injected code carrying the patcher file's own line endings, so output depended on how git checked the script out;
- all three patchers dropped one byte per run from the `MODULES` line (greedy `\s*` swallowing the CR) - invisible in git, which normalises `index.html` to LF on commit and CRLF on checkout;
- `tests/seeded-apk-runtime.test.mjs` asserted stock on the 730-day window's raw boundaries, which land on a Sunday two days in seven while the seed skips Sundays.

### Remaining - blocked on people, not code

1. **Phase 0 acceptance.** 69-case functional catalogue + 4 drills + 9 operational gates, all open. See "Non-negotiable acceptance gates still pending" below and `verification/PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md` §6-§7.
2. **D4 acceptance.** 8 device cases (D4-01..08) in `docs/audit/D4-DSR-CHANGE-CONTRACT-2026-08-04.md` §9. Unsigned debug APK only.
3. **Owner nominations form.** `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`, outstanding since 2026-08-02. Nothing device-side starts without it.

### Remaining - blocked on owner inputs

**E-series: 7 waves, none started.** E1 exists only as a draft on branch `agent/e1-etp-import` (1 commit, not on main).

E1 import layer → E2 DSR computed views → E3 CRO reconciliation → E4 planning and targets → E5 incentive → E6 exception monitoring → E7 service-centre *(optional)*.

Frozen pending seven owner inputs (see `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md`): sample ETP exports from **both** stores; dictionary approvals; the R022↔R025 reconciliation rule; date policy; unknown-code handling; XLSX parser choice; incentive scheme source. **E2-E6 all depend on E1's frozen schema, so this is the single largest blocker in the programme.**

### Remaining - ready to build now, no blockers

**8 D-series waves:** D5 stock variance triage · D6 cash/expense · D7 payroll · D8 leave coverage · D9 tax readiness · D10 grooming + CRO coaching · D11 festival planner · D12 reports polish and closure.

D5 is the natural next wave. D7 and D10 are *better* after the E-series supplies verified data but are not blocked by it.

### Remaining - backlog

**F-series: 15 candidates, none started, none ranked.** The road plan requires ranking before any build. Highest-value by its own reasoning: **F1** banking reconciliation (~₹96.6L open/unbanked, the largest single control gap), **F5** PAN/Form-60 register (statutory, bills ≥ ₹2L), **F6** GST outward split check (known live discrepancy). Full list in `docs/V6-IMPROVEMENT-ROAD-PLAN.md` §6.

### Housekeeping debt

- **16 remote branches**, most stale (`back-button-2.9`, `test/year-*`, `scroll-*`, …). `agent/d1-d3-native-sqlite` and `agent/storage-recovery-p0` are fully merged and safe to delete. **`agent/e1-etp-import` must be kept** - it holds the E1 draft.
- `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md` still carries a stale "D1 design approved ✋ PENDING" gate; D1 shipped 2026-07-30. Its E-series gates are all genuinely open.
- **No `.gitattributes` rule for `*.mjs` or `index.html`.** This is the root cause of the line-ending bug class fixed twice on 2026-08-04. Pinning them to LF would prevent recurrence but rewrites endings across the working tree on next checkout - do it deliberately, not as a side effect.

### Working tree

Clean. `main` equals `origin/main` at `9b54a44`. No feature branch outstanding; `d4-dsr-completion` was merged and deleted.
## Roadmap cross-check

| Workstream | Engineering state | Roadmap exit state |
|---|---|---|
| P0 and original P1 register | Closed in the prior wave history. | No current build action. |
| R0-W1 - named access | Complete in prior commits: named identity, PIN policy/lockout, re-authentication, access logging, and launch lock. | Protected by the permanent security suite; still included in final device/security acceptance. |
| R0-W2 - encryption core | Encryption at rest is live (`3cb84fc`) with Keystore key wrapping and degraded-mode controls. | Related storage, migration, and device evidence remains part of final acceptance. |
| R0-W3 - backup and restore | BKP-01/02/04-08 source controls are in the pushed close-out; BKP-03 is source-complete and pushed in `273e73d`. | The restore-drill and provider/device evidence (including BKP-09) remain open. |
| R0-W4 - export and release safety | Source-complete in `55ceabd`: SEC-08 through SEC-13 plus ENG-01/02/04 regression coverage and release tooling. | Production signing, device-hardening evidence, and the full ENG-03 device/UAT matrix remain open. |
| R1 - legal minimum | Source controls and first-draft policy pack are complete in `55ceabd`. | Owner/counsel approval, operational rollout, and incident rehearsal remain open. |
| V6 D-series (improvement) | D1-D4 merged; D5-D12 not started, unblocked. | Each wave needs its own device cases and owner acceptance; D4's are open. |
| V6 E-series (ETP verification) | Not started. E1 draft on `agent/e1-etp-import` only. | Blocked on seven owner inputs; E1 schema must freeze before E2-E6 can be designed. |
| V6 F-series (new functionality) | Not started, not ranked. | Ranking required before any build. |
| Track B - PHP platform | Explicitly deferred by owner. | Not part of the current closure; no implementation work is authorised. |

## What the Android closure now contains

### R0-W3: backup, restore, and recovery

- Portable `.sccbak` backups use AES-256-GCM with an authenticated manifest, checksums, coverage for photos/evidence, deterministic control totals, and source/store/date/version preview.
- Restore validates before apply, quarantines tampered material, takes a pre-restore snapshot, reads back the result, and makes rollback/rollback-verification failures explicit.
- Factory/module reset requires owner acceptance of a verified restore and a new rollback backup. Backup failure escalates after 36 hours.
- Private on-device backup retention uses 7 daily, 5 weekly, and 12 monthly generations.
- BKP-03 adds an owner-selected, provider-backed Storage Access Framework folder. Built-in external storage, Downloads, and Media providers are rejected because they are still on-device.
- A random 256-bit scheduled-backup key is protected by Android Keystore for unattended backup and separately recoverable through the owner passphrase envelope. JavaScript receives neither the provider URI nor the passphrase.
- Scheduled delivery is verified by readback SHA-256 and byte count, bound to the approved destination and standing owner export grant, and GFS-pruned to 7 daily / 5 weekly / 12 monthly copies.

### R0-W4: export, release, and permanent regression controls

- Exports are disabled by default; they require Admin PIN plus fresh owner re-authentication and are recorded in a metadata-only, non-erasable export register.
- Existing export, share, WhatsApp, CSV, PDF, CA-pack, evidence-ZIP, and backup routes are controlled; broken policy/register/posture fails closed.
- Support output is sanitised. Debug, debugger, ADB, test-key, root, and unsafe device posture are guarded, and sensitive payroll/tax screens use the secure-window control.
- Financial golden cases, failure-injection coverage, export tests, source-integrity tests, and security release gates are permanent in the offline suite.

### R1: legal-minimum implementation and draft policy

- Field/purpose/basis/access/retention register with unknown-field rejection at intake.
- Itemised collection notices at queue and service intake; promotional consent separated from operational messaging; STOP/withdrawal suppression checked at controlled send routes.
- Rights and grievance register, identity evidence, legal-hold decision, minor/guardian rule, disclosure controls, incident clock/playbook, and manual retention schedule.
- First-draft policy pack: `legal/R1-LEGAL-MINIMUM-CONTROL-PACK.md`. It is a draft for owner, counsel, and CA review, not an approved legal instrument.

### BKP-03, DAT-02, and API policy delta in v2.9

- **API-22 exception retired:** minSdkVersion is now 23; API-22 devices cannot install the v2.9 build. Native production eligibility also requires Android M/API 23 or later.
- **BKP-03:** automatic delivery checks after the private-backup check at launch and every six hours while the app is active. The first active use of a new day makes the daily off-device generation. There is no closed-app Android background worker in this scope.
- **DAT-02:** `db.export()` remains synchronous. The risky whole-storage worker rewrite was deliberately not performed without real-device evidence. The implemented outcome gate collects timing-only evidence for five encrypted saves; if either accepted device fails it, the worker/storage-engine rewrite becomes required work.

## Non-negotiable acceptance gates still pending

No source test, APK build, or debug signature may mark these rows passed. Record a named person, date, device, observed result, and evidence link for each.

| Gate | Evidence required |
|---|---|
| Provider enrollment | Owner enables controlled exports, selects the approved Drive/OneDrive/provider folder, completes one-time approval, and records provider/account ownership. |
| BKP-03 delivery and retention | Immediate run proves daily, `latest`, weekly, and monthly `.sccbak` files; verified timestamp/bytes; real provider GFS pruning and rename/fallback behavior over the acceptance window. |
| Destination binding and escalation | Revoke/change the provider permission and prove the next run blocks without advancing success; prove denied/unavailable provider reaches the 36-hour action state. |
| Portable cross-device recovery | On a separate/fresh device, recover a scheduled `.sccbak` with the owner passphrase and reconcile control totals. Separately show that device-bound private snapshots reject clearly. |
| Primary restore drill | Create a portable backup, reset/wipe test state, preview, restore, read back, and record owner-accepted control totals. |
| Older API-23-class device drill | Repeat the restore and storage observations on the oldest supported device. |
| Legacy and failure paths | Exercise plaintext DATA migration/sidecar cleanup, legacy Documents purge (accessible and denied paths), unavailable Keystore, interrupted/full storage, and no-false-success behavior. |
| DAT-02 primary device | At the agreed real data volume, run five complete encrypted saves: export p95 <=150 ms, visible frame-gap p95 <=250 ms, total-save p95 <=3000 ms, no error and no ANR. |
| DAT-02 API-23-class device | Run the same five-save gate and record the same thresholds on the older supported device. A failure on either device reopens the worker rewrite. |
| Device-security posture | On an approved production-signed device, exercise root/debug/ADB/developer-mode indicators and screenshot blocking where required. |
| Production key custody and release | Supply production keystore outside source control, name two custodians and recovery process, create signed release, and verify certificate/checksum against the release register. |
| Staff UAT / ENG-03 | Named users complete QMS, service, export-denial, rights, backup, and restore scenarios; defects are triaged. |
| Legal and owner approval | Approve privacy contact, notices, retention schedule, processor/confidentiality terms, child rule, and breach roles. Counsel review remains required. |
| Incident rehearsal / BKP-09 | Run and minute the breach tabletop and the first wiped-device restore drill; train the two recovery custodians and establish the future drill cadence. |

## Known boundaries that must not be hidden

- The v2.9 APK is debug-signed and cannot be installed on API-22. It is not a production release.
- BKP-03 runs at first active use of a new day and during an active session; it does not run while the WebView app is closed. A native OS background scheduler would be a separate, explicitly authorised expansion.
- DAT-02 has an outcome-based device gate, not a claim that persistence has already moved off the UI thread. `db.export()` is still synchronous.
- A rooted or running device is outside the protection claim. Android Keystore material can be lost on uninstall, factory reset, or lock-screen credential change; portable passphrase recovery remains essential.
- Keep all evidence metadata-only. Do not place customer data, provider URIs, PINs, passphrases, backup keys, or production signing material in Git, logs, or this handoff.

## Safe resume order

**Pick the track that is actually unblocked.** As of 2026-08-04 the device track waits on the owner; the engineering track does not.

**Track 1 - engineering, unblocked today.** Build D5 (stock variance triage) following the D4 pattern: read the real module payload first, write a change contract in `docs/audit/`, then a pure policy in `www/`, then a deterministic patcher in `scripts/apply-d5-*.mjs`, then policy + integration tests, then a debug APK verified by unpacking. Add every new test file to `npm run test:offline` or CI will skip it.

**Track 2 - E-series, blocked.** Chase the seven owner inputs in `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md`. Freeze E1's schema only once real exports from both stores are in hand. Do not design E2-E6 before then.

**Track 3 - device and Phase 0 acceptance, blocked on the nominations form.** Once it arrives:

1. **Authorise the controlled two-device test pass**: nominate two devices (API 23+), an approved off-device provider folder/account, and a 12+ character recovery passphrase.
2. **Run the module-wise functional catalogue** on the seeded APK (`SaagarCC-DemoData-v2.9.apk`) using `SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md`'s test IDs (CORE/QMS/SVC/DSR/STK/EXP/GRM/CRO/PAY/LEV/TAX/PLN/RPT/SEC/LEG). Stop on any P0/P1 defect.
3. **Run the four device drills** from `DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` (DAT-02 five-save, BKP-03 provider delivery, cross-device restore, legacy migration) on both devices and record a dated evidence log using the template at the end of that script.
4. **If a device gate fails, make only the targeted correction.** In particular, any DAT-02 failure means the worker/storage-engine rewrite is required before acceptance can continue.
5. **Obtain legal/owner and operating evidence** while the app is being exercised: policy approval, staff UAT, incident rehearsal, and restore-custodian evidence.
6. **Only after production key custody is in place,** create and verify the signed production release. Never substitute the debug APK for it.

## Build and verification commands

Run from `V:\Co work\Projects\Retail\saagar-control-centre`.

The Android build needs the bundled JDK 17 — system Java 8 will not run Gradle 8.2.1:

```bash
JAVA_HOME="V:/Co work/Projects/Retail/.android-build/jdk17/jdk-17.0.19+10" npm run build:apk
```

```powershell
npm run test:offline
npm run build:release
```

Re-applying a module patcher is safe and idempotent as of `9b54a44`; each is a byte-level no-op on an already-patched bundle:

```bash
node scripts/apply-d2-qms.mjs && node scripts/apply-d3-service.mjs && node scripts/apply-d4-dsr.mjs
```

`build:apk` performs the Capacitor sync and reapplies Android overrides. `build:release` is expected to stop with `Signed release blocked` until real production signing credentials are supplied; that is the correct fail-closed result.

## Evidence and references

**Current programme (2026-08-02 onward):**

- Programme blueprint, D/E/F waves: `docs/V6-IMPROVEMENT-ROAD-PLAN.md`
- D4 change contract, engineering verification, APK checksum, device cases D4-01..08: `docs/audit/D4-DSR-CHANGE-CONTRACT-2026-08-04.md`
- D2 / D3 change contracts: `docs/audit/D2-QMS-CHANGE-CONTRACT-2026-07-30.md`, `docs/audit/D3-SERVICE-CHANGE-CONTRACT-2026-07-30.md`
- Phase 0 acceptance gates and exit rule: `verification/PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md`
- Owner nominations form (outstanding): `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`
- Phase 1 / E-series prerequisites: `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md`
- Owner communication covering both phases: `docs/OWNER-COMMUNICATION-PHASE-0-AND-PHASE-1-2026-08-02.md`

**Earlier closure evidence:**

- Current v2.9 verification: `verification/BKP03-DAT02-API23-2026-07-29.md`
- Pushed R0/R1 close-out verification: `verification/R0-R1-CLOSEOUT-2026-07-29.md`
- Device acceptance script (DAT-02 / BKP-03 / cross-device restore / legacy migration): `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`
- Seeded-APK module-wise test readiness + full test catalogue (CORE/QMS/SVC/DSR/STK/EXP/GRM/CRO/PAY/LEV/TAX/PLN/RPT/SEC/LEG): `verification/SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md`
- Module functionality and improvement inventory (post-test prioritisation aid, not approved scope): `verification/MODULE-FUNCTIONALITY-IMPROVEMENT-INVENTORY-2026-07-29.md`
- R1 first-draft policy pack: `legal/R1-LEGAL-MINIMUM-CONTROL-PACK.md`
- Earlier R0 slice evidence: `docs/audit/R0-W1-*.md`, `docs/audit/R0-W2-*.md`, `docs/audit/R0-W3-S*.md`
- Strategic roadmap: `V:\Co work\Projects\Retail\Road Map planing\Saagar_Control_Centre_Development_and_Security_Roadmap_v1.0.md`
- Execution plan: `V:\Co work\Projects\Retail\Road Map planing\SCC_Opus_Execution_Plan_v1.0.md`

## Historical anchors

- `22eec9b` - R0-W3 S3: seal private auto-backups.
- `96a9870` - R0-W3 S4: off-device backup safety hardening.
- `55ceabd` - pushed R0/R1 engineering close-out.
- `273e73d` - pushed build 2.9: BKP-03 automatic encrypted off-device backup (3rd native plugin, Storage Access Framework), DAT-02 persistence acceptance gate (storage-core instrumentation only - the `through=_seq; raw=db.export()` sync invariant is preserved), and the API-23 production floor. Physical-device acceptance (provider delivery drill, cross-device restore, five-save at real data volume) remains PENDING.
- `bf0a9e3` - added the device acceptance script (`DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`); no source change.
- `49d531b` - added the module-improvement inventory and the seeded-APK module-wise test readiness report (with the full functional test catalogue); no source change.

- `4177701` - D1, D2, D3 and the native SQLite scale fix.
- `f76d4ab` - Phase 0 merge: storage recovery, SQLite capacity, owner access, 210-test suite.
- `9b54a44` - D4 merge: DSR completion meter, no-sales acknowledgement, patcher idempotency fixes, stale-D1-doc cleanup.

The next session should begin with the repository snapshot and programme inventory above, not with the older wave-by-wave instructions. This file supersedes the 2026-07-24 handoff state.

---

# HISTORICAL RECORD - superseded, do not act on

Everything below is a dated trail of earlier checkpoints, kept for provenance. **Its "current state" claims are stale**: the baselines, APK checksums, test counts and uncommitted-work notes were true when written and are not true now. The authoritative current state is the snapshot and inventory at the top of this file.

In particular: sections below describe D1/D2/D3 as uncommitted working-tree checkpoints. They shipped in `4177701` on 2026-07-30 and are merged.

---

## Uncommitted continuation — 2026-07-29

The working tree contains a reviewed **D1 engineering-complete / acceptance-pending** checkpoint after baseline `49d531b`.

### Implemented

- Reauthentication clarity: purpose, one-use expiry, safe cancellation, distinct denial/lockout feedback, one deliberate retry, and metadata-only outcome auditing.
- Persistent dashboard store context from active Organisation branches, safe `All stores` fallback, audited switching, global visibility, restore-blocked persistence, and immediate rerender.
- Honest legacy behavior: explicitly tagged facts can be store-filtered; untagged-only facts stay labelled combined; mixed data excludes and reports unassigned/unknown rows. Device-wide activity and customer greetings are hidden from a single-store view.
- Role-relevant Home/Today, Today-run/EOD, attention/modal, activity, greetings, and shared brief; Admin bypass remains unchanged.
- Canonical Today reconciliation fixes for Stock alias de-duplication, Expense income/void exclusion, Cash `closed` completion, and Service `dateRec`.
- Attention de-duplication through stable keys/action-title identity, one consolidated Payroll/Leave staff-sync row, and strongest-priority retention.
- One backup-health action covering private failure, plaintext fallback, legacy cleanup, and off-device recency. Local repair is sequenced before a fresh encrypted share; policy load/evaluation failure produces a high-priority review row. Restore acceptance and unsafe-device posture remain distinct.
- Four pure policy modules and permanent regressions registered in `npm run test:offline`.

### Verification

- Focused D1: **17/17 passed**.
- Full offline: **71/71 passed**.
- `git diff --check`: passed.
- `npm run build:apk`: passed; Capacitor sync packaged all four policy modules.
- Local review APK: `android/app/build/outputs/apk/debug/app-debug.apk` — 7,541,261 bytes — SHA-256 `59F86F4870F779E259F8A4F1D9F573759AA506719F965D67BBDD5355185B91BB`.

### Still open / do not overclaim

- The store selector is workflow context, not authenticated staff-to-store assignment or proven cross-store privacy isolation.
- Representative-device layout, interaction, and performance evidence remains the explicit D1 acceptance item; no device pass is claimed.
- Every Phase 0 device/provider/restore/legal/UAT/security/signing row above remains **PENDING**. The new debug APK is not a formal or production release.
- No PHP/platform work was started.
- Nothing in this checkpoint is committed or pushed; owner review/approval is required first.
### Pause / exact resume point

- Work stopped at the owner's request because the device battery was low. All edits are saved locally; no commit or push was made.
- D1 source implementation is complete against master-plan §8.2. Its representative-device evidence and every Phase 0 physical gate remain pending.
- The E1 prerequisite audit located the WLMHW source archive and dictionaries at `V:\Co work\Titan\audit-program-designer\Retail\TITAN ALL REPORT.zip` and the adjacent mapping files. No equivalent HEMW ETP export set was found; the Helios annual-analysis workbook is a derived summary, not the required report set. Do not freeze E1 headers or start the import parser until both-store samples exist.
- The Developer Documentation schema/migration Word files describe the deferred PHP platform and must not be used as authority to start PHP work. The current Android master blueprint remains the applicable architecture reference.
- No E1 or D2 implementation code was changed after the verified D1 checkpoint. A read-only D2 audit had begun only to prepare a fallback; it was stopped before implementation.
- Resume by rechecking `git status`, then either obtain the HEMW R022/R025/R013/R003 samples for E1 or explicitly approve a documented D2 interleave/change contract. Preserve all current uncommitted files.

### Crash-recovery checkpoint — 2026-07-30

- The owner resumed work and D2 QMS was interleaved because E1 remains blocked by the missing HEMW raw exports. The system then crashed; implementation stopped immediately.
- Saved new files: `www/qms-policy.js`, `www/qms-persistence.js`, `tests/d2-qms-policy.test.mjs`, and `scripts/apply-d2-qms.mjs`.
- `www/index.html` contains the D2 QMS embedded rewrite and loads both new runtime files. Recovery verification after the crash found the QMS payload intact: 156,125 decoded UTF-8 bytes, declared bytes equal actual bytes, SHA-256 metadata matched, and marker `D2-QMS-2026-07-30` was present.
- Completed isolated D2 checks: 10/10 policy/persistence tests passed. The deterministic embed script was run twice successfully after its marker recovery fix; the second run reported “already applied.”
- Focused integration check reached 25/26 passing. The only failure is an outdated whitespace-sensitive assertion in `tests/legal-minimum.test.mjs`; the embedded QMS still calls `qmsLegalCapture(c, noMobile)` and blocks on `!legalResult.ok`, but the refactor formats the statement across lines. Update only that regex, then rerun focused/full checks.
- Broader full-suite and APK build checks have **not** been run for D2. D2 is partial and must not be reported engineering-complete or device-accepted.
- No commit or push was made. No PHP work was started. Preserve all existing uncommitted D1 and user files.
### Final D2 recovery checkpoint — 2026-07-30

This section supersedes the provisional crash-recovery checkpoint above.

- `main` and `origin/main` remain at `49d531b`; there are no unpushed commits.
- D1 remains engineering-complete/acceptance-pending.
- E1 remains blocked by missing HEMW R022/R025/R013/R003 raw exports.
- D2 is now engineering-complete in the uncommitted working tree and locally
  verified; device, staff, legal, owner, and release acceptance remain pending.

#### D2 implementation saved

- Added pure QMS policy and persistence controls, deterministic embedding, and
  permanent D2/legal regressions.
- Duplicate review is exact 10-digit-mobile and same India business day only,
  requires complete operator review, exposes no merge path, and excludes
  name/DOB/fuzzy/no-mobile matching.
- Fast intake/outcome, skip review, canonical lost/conversion reasons,
  deterministic follow-up priority, India business dates, guarded settings,
  form restoration, and persisted rollback are active.
- A metadata-only pending-intake token preserves the customer/queue identity
  across a process restart without storing mobile/name/DOB/consent.
- Legal intake uses customer-bound `qms-intake:<customerId>` idempotency,
  forward-resumes partial evidence, conflicts before mutation, and blocks
  promotion when consent/suppression evidence is corrupt.
- The D2 patcher verifies bytes/hash/markers/helper uniqueness and self-heals
  every individually missing retry/legal/entry helper. Intact reruns are
  byte-identical.

#### Final local evidence

- Focused D2/legal: **48/48 passed**.
- Full offline suite: **123/123 passed**.
- Patch and test syntax: passed.
- Independent final review: no remaining P0/P1/P2 finding in reviewed scope.
- Embedded QMS: 166,462 bytes, SHA-256
  `aa9402cc05aadb430224705d53b75df83b2e4bdac29a8c5fd4f96cf344c018f4`.
- `npm run build:apk`: passed.
- Local review APK:
  `android/app/build/outputs/apk/debug/app-debug.apk`, 7,553,056 bytes,
  SHA-256
  `D2206B09C199579DE2E4A83F20F070D5C51042700ECB8F701541ED41ABF1141F`.
- Packaged identity: version 2.9, versionCode 209, minSdk 23, targetSdk 34.
- Full contract:
  `docs/audit/D2-QMS-CHANGE-CONTRACT-2026-07-30.md`.

#### Do not overclaim

- No D2 physical-device case, staff UAT, legal/owner acceptance, Phase 0 gate,
  production signing, or formal release is passed.
- Real-device performance/tap time, small-screen/keyboard, rotation/relaunch,
  process-kill retry, India-midnight, duplicate/reason usability, legal/
  no-mobile/guardian/suppression, controlled call/WhatsApp, representative
  volume, and backup/restore/reset behavior remain open.
- The D1 store selector is workflow context, not authenticated store
  authorization. QMS store isolation and authenticated current-CRO identity are
  not proven.
- The current APK is debug-signed and built from an uncommitted tree. It is for
  review only and is not a controlled release.
- No PHP/platform work was started. Nothing was committed or pushed.

#### Safe next action

Review the uncommitted D1+D2 changes and run the D2 device/UAT acceptance set.
In parallel, obtain the missing HEMW raw exports; do not resume E1 schema/parser
implementation until both-store samples exist.
### Final D3 Service checkpoint — 2026-07-30

This section supersedes the earlier D1+D2-only safe-next-action statement.

- `main` and `origin/main` remain at `49d531b`; there are no unpushed commits.
- D1, D2, and D3 are engineering-complete in the uncommitted working tree.
- Their representative-device, staff, owner, legal, and release acceptance
  remains pending.
- E1 remains blocked by missing HEMW R022/R025/R013/R003 raw exports.

#### D3 implementation saved

- Added `www/service-workboard-policy.js`,
  `www/service-persistence.js`, deterministic embedding in
  `scripts/apply-d3-service.mjs`, and permanent D3 tests.
- Added the controlled Service workboard, legacy stage normalization,
  readiness gate, override reauthentication/audit, metadata-minimized
  exceptions, fixed customer-safe status wording, and numeric stage dispatch.
- D3 transitions clone the case set, make one adapter write, update memory only
  after success, and restore the last persisted set on failure.
- Fixed stale subtotal after the final estimate row is removed and updated an
  existing automatic warranty reminder instead of silently leaving its old
  date.
- The form stage control is display-only; the workboard owns stage changes.
- The embed patcher verifies metadata and helper uniqueness, is byte-idempotent,
  self-heals a missing owned helper, and repairs the stylesheet/print separator
  defect caught by full source-integrity testing.

#### Final local evidence

- Focused D3: **21/21 passed**.
- Full offline suite: **144/144 passed**.
- `git diff --check`: passed (line-ending warnings only).
- Embedded Service: 230,602 bytes, SHA-256
  `ffb40f919a20eedc0162185af881a918b7725b22f8e7b65d5463a4f1f8be5afa`.
- `npm run build:apk`: passed.
- Local review APK:
  `android/app/build/outputs/apk/debug/app-debug.apk`, 7,562,266 bytes,
  SHA-256
  `5062FC2253ED5E294B03C0E589306D9B5BBD664BCCD744F9A7CC0F7E5554C685`.
- Packaged identity: version 2.9, versionCode 209, minSdk 23, targetSdk 34.
- Full contract:
  `docs/audit/D3-SERVICE-CHANGE-CONTRACT-2026-07-30.md`.

#### Do not overclaim

- No D3 physical-device case, staff UAT, legal/owner acceptance, Phase 0 gate,
  production signing, or formal release is passed.
- Existing Service cases have no authoritative store tag. The workboard is
  explicitly combined/untagged and does not prove WLMHW/HEMW isolation.
- Actor/adviser text is an operational label, not authenticated staff identity.
- Ready-notification state is local evidence and is not a delivery receipt.
- The current APK is debug-signed and built from an uncommitted tree. It is for
  review only.
- No PHP/platform work was started. Nothing was committed or pushed.

#### Safe next action without ETP exports

Review the uncommitted D1+D2+D3 changes. The next implementation package that
can be considered without ETP data is D5/D6 only after its own change contract
and dependency audit; D4, D10, D11, E2-E6, and all verified-sales/incentive
work remain ETP-dependent. Device/UAT acceptance for D1-D3 and the Phase 0
drills can proceed independently when representative devices and custodians are
available.
### Two-year seeded review APK checkpoint — 2026-07-30

The owner requested a review APK with two years of dummy data. The separate
artifact is complete and saved:

- `V:\Co work\Projects\Retail\SaagarCC-DemoData-2Years-D1-D3-v2.9.apk`
- 7,562,722 bytes
- SHA-256
  `4545DA621EB13AB540F3631D8D0C24A8CBC8A09B44C0F16B1A9549F14E948CF4`
- version 2.9 / versionCode 209 / minSdk 23 / targetSdk 34

The `two-year-review-v1` seed spans 730 days back plus today, targets 25
synthetic QMS walk-ins per working day, retains recent QMS in live storage,
archives older QMS, includes WLMHW/HEMW review data, 24 locked payroll months,
monthly tax history, both-store Stock history, and varied D3 Service stages,
readiness, overdue, and repeat-repair cases. Demo contacts start with `1`, and
the app shows a `SYNTHETIC DEMO DATA · DO NOT CONTACT` banner.

The dedicated builder modifies only the generated Android asset, copies the
seeded APK, and restores the generated asset in `finally`. Direct inspection
confirmed the APK has seed=true and 730/25 defaults; its packaged
`demo-seed.js` exactly matches the tested source. Both ordinary source and
generated Android assets are back to seed=false with 365/50 fallbacks.

Local evidence:

- seed/build regressions: **5/5 passed**;
- full 730-day runtime smoke: **1/1 passed**;
- permanent offline suite: **149/149 passed**;
- seeded build: passed twice with the same bytes/hash.

Repeat commands:

```powershell
npm run test:offline
npm run test:seeded-runtime
npm run build:apk:seeded-2y
```

Full evidence is
`verification/SEEDED-APK-2YEAR-D1-D3-2026-07-30.md`.

No device acceptance was claimed. First-launch seed time/memory/ANR, archive
file behavior, layout/interaction at volume, staff UAT, backup/restore/reset,
and every formal release gate remain pending. The two store labels do not prove
authenticated isolation. No PHP/platform work was started. No commit or push
was made.
### 2026-07-30 - native incremental SQLite scale-crash checkpoint

**State:** storage-engine implementation and local verification complete;
representative-device crash regression, DAT-02, recovery, and release acceptance
remain **PENDING**.

Device review invalidated the earlier two-year seeded artifact: back-date
selection could close the app, and module views closed after roughly the
six-second persistence debounce. The second failure reopened the storage-engine
rewrite under section 7.4. Reducing synthetic history was explicitly rejected
because it would not solve growth of real data.

Implemented:

- native Android SQLite durability through the registered
  `SaagarNativeStorePlugin`, using WAL-mode `SQLiteOpenHelper` with no new Maven
  dependency;
- per-record SHA-256 identifiers and Keystore-DEK AES-GCM `SBKV1` envelopes, so
  normal saves write only changed records in bounded transactions;
- bounded paged startup, one-time verified migration from the legacy encrypted
  `bcc.sqlite`, and legacy snapshot fallback only when the native plugin is
  unavailable;
- staging-table publication for seeds/restores: bounded batches are verified,
  then atomically swapped into the live table, so interruption retains the
  previous accepted dataset;
- native-aware WAL replay, delete/clear, factory reset, diagnostics, and
  logical backup/restore compatibility; and
- back-date render coalescing plus shared/cached heavy Home/Today facts.

Evidence:

- native static/runtime storage regressions **6/6**;
- permanent offline suite **159/159**;
- full 730-day seed runtime **1/1**;
- Android/Capacitor Java compile and debug assembly passed;
- packaged DEX contains `SaagarNativeStorePlugin` and packaged web assets
  contain native dispatch plus atomic bulk verification;
- current seeded review APK: 7,617,377 bytes, SHA-256
  `77111CE3E9967C224340C10B4CE70B5487678E3080CEA7CEB96A5DF7F1FABEBD`.

The earlier hashes `4545DA...` and `6B7B77...` are superseded and must not be
used. Full evidence and device retest steps are in
`verification/NATIVE-INCREMENTAL-SQLITE-CRASH-CHECKPOINT-2026-07-30.md`.

No device-only row changed to passed. Required evidence still includes module
open for at least 15 seconds, early back dates, save/wait/relaunch, process
kill/restart, two-device DAT-02, and backup/restore/reset/interrupted-bulk
recovery at representative volume. The compatibility layer still holds active
key/value data in WebView memory; module-level paged repositories remain a
future scale slice beyond this first native durability phase.

No PHP/platform work was started. All changes remain uncommitted and unpushed
pending owner review.

### Owner device smoke and publishing handoff - 2026-07-30

- The owner reports that the current two-year seeded APK, SHA-256
  `77111CE3E9967C224340C10B4CE70B5487678E3080CEA7CEB96A5DF7F1FABEBD`,
  is working correctly on the review device after the native SQLite rewrite.
- The previously reported immediate back-date close and roughly five-to-six
  second module close were not reported again during this smoke.
- This is useful real-device crash-regression evidence, but it is not a
  controlled completion of the module catalogue or Phase 0 drills: device
  identity/API, timings, memory, process-kill/restart, two-device DAT-02,
  backup/restore/reset, and interrupted-bulk evidence were not supplied.
- The owner approved commit and push. The reviewed checkpoint is published
  from branch `agent/d1-d3-native-sqlite`; use Git history for its immutable
  commit identifier.
- No PHP/platform work was started.
