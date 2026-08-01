# SAAGAR Android - Phase 0 closure status and evidence pack

**Prepared:** 2026-08-02 (Asia/Calcutta)  
**Branch:** `agent/storage-recovery-p0`  
**HEAD:** `4177701f8fe4cab46de1ff2e7597ccb52e0cda5a`  
**Tree:** intentionally dirty; no acceptance commit exists  
**Formal Phase 0 status:** **OPEN - repository engineering ready; physical and operational acceptance pending**

## 1. Repository engineering completed

- Native incremental encrypted SQLite storage with bounded writes and atomic
  staged publication.
- Fail-closed storage authority, stable recovery reasons, hard-reload Retry,
  and sanitized diagnostics.
- Owner access, all-off-by-default per-module PIN controls, one-use module
  verification, and embedded-module role revocation.
- Whole-device capacity and separately labelled SAAGAR SQLite usage.
- BKP-03 provider-bound encrypted backup controls and DAT-02 measurement
  contracts.
- Permanent security, legal-minimum, recovery, migration, backup/restore,
  financial, D1-D3, and scale regressions.
- Deterministic ENG-02 full-storage test clock; the suite no longer depends on
  UTC versus Asia/Calcutta midnight.
- Central build identity in `www/build-identity.js`, consumed by the UI,
  Android override script, and production release register.

## 2. Automated verification

| Check | Result |
|---|---|
| Phase 0 identity/ENG-02/source-integrity focus | 12/12 passed |
| Permanent offline suite | 210/210 passed in normal local timezone |
| JavaScript syntax checks | Passed |
| `git diff --check` | Passed; line-ending warnings only |
| Clean-seed Android debug build | Passed |
| Release build without production secrets | Correctly blocked with `Signed release blocked` |

The new identity regression is available through `npm run test:phase0`.

## 3. Current engineering APK

| Field | Value |
|---|---|
| Path | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Bytes | `7,623,657` |
| SHA-256 | `991EC37A03F39540233BE0A3F3972CEF8A798A27521BD3B9FC4F0BD1B19ED743` |
| Package | `com.saagartraders.bcc` |
| versionName | `2.9` |
| versionCode | `209` |
| minSdk | `23` |
| targetSdk | `34` |
| Seed state | Clean source; demo seed disabled |
| Signature | Android debug certificate; v1 and v2 verified |
| Acceptance use | Engineering/device review only; not production release |

This APK was built from an intentionally dirty tree at HEAD `4177701...`.
Therefore it cannot be the final accepted Phase 0 artifact. Final acceptance
requires an owner-approved scoped commit followed by a clean rebuild and a new
checksum.

## 4. Existing controlled test material

- 69-case catalogue:
  `verification/SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md`
- DAT-02, BKP-03, cross-device restore, and legacy/API-23 drill script:
  `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`
- Current PIN/storage device checklist:
  `verification/PIN-STORAGE-SETTINGS-HANDOFF-2026-08-01.md`
- Storage recovery checklist:
  `verification/STORAGE-RECOVERY-P0-HANDOFF-2026-07-30.md`

## 5. Required nominations - owner supplied

Do not put secrets, provider URIs, customer data, PINs, passphrases, or signing
material in this file.

| Item | Required record | Status |
|---|---|---|
| Primary device | Model, Android/API, RAM, free storage | Pending |
| Oldest supported device | Model, Android/API 23+, RAM, free storage | Pending |
| Backup provider | Provider class and account/folder ownership confirmation only | Pending |
| Recovery custody | Two named custodians; passphrase kept outside Git | Pending |
| Owner | Name/role | Pending |
| Device tester | Name/role | Pending |
| Evidence owner | Name/role | Pending |
| Privacy/legal reviewer | Name/role | Pending |
| Security/recovery owner | Name/role | Pending |
| Signing-key custodians | Two names/roles; key material outside Git | Pending |

## 6. Physical acceptance checklist

### 69-case catalogue

- [ ] Every case has device, tester, date/time, expected result, actual result,
      redacted evidence reference, and PASS/FAIL/BLOCKED.
- [ ] Any P0/P1 stops the pass and receives a linked targeted correction.
- [ ] After every correction, affected cases and mandatory core smoke are rerun.

### Drill A - DAT-02 on both devices

- [ ] Five complete encrypted saves per device at representative volume.
- [ ] Export p95 <= 150 ms.
- [ ] Visible frame-gap p95 <= 250 ms.
- [ ] Total-save p95 <= 3000 ms.
- [ ] No error or ANR.
- [ ] Exactly one persisted record after relaunch.
- [ ] No missing, duplicate, stale, or cross-store record.

### Drill B - BKP-03 provider delivery

- [ ] Approved provider enrollment and immediate verified delivery.
- [ ] Daily, latest, weekly, and monthly artifacts observed.
- [ ] Timestamp, byte identity, naming, retention, pruning, and operator access.
- [ ] Permission revoke/destination change fails without false success.
- [ ] Failure, retry, escalation, and recovery observed.

### Drill C - cross-device restore

- [ ] Portable `.sccbak` restores on the second/fresh device.
- [ ] Representative counts and control totals reconcile.
- [ ] Wrong passphrase and tampered content reject.
- [ ] Device-bound private snapshot rejects on another device.
- [ ] Failed/interrupted restore preserves prior local data.

### Drill D - legacy/API-23

- [ ] Approved legacy fixture migrates on the oldest supported device.
- [ ] Data, role/store context, reports, relaunch, backup, and restore pass.
- [ ] Unsupported state is reported without silent discard.

## 7. Operational and approval gates

- [ ] Privacy contact, notices, consent, retention, child rule, processor terms,
      and staff/customer handling approved by owner and appropriate reviewer.
- [ ] Named staff complete UAT for QMS, Service, denial, rights, backup, and restore.
- [ ] Incident and wiped-device recovery rehearsal completed and minuted.
- [ ] Device-security posture and screenshot protections exercised.
- [ ] Production keystore custody and recovery process established outside Git.
- [ ] Production-signed APK built only after all preceding gates close.
- [ ] Release register verifies signature, certificate digest, checksum, clean
      source commit, version identity, and seed state.
- [ ] Owner accepts the exact final APK SHA-256.
- [ ] Accepted baseline is pushed and tagged only with explicit owner approval.

## 8. Remaining repository-control step

Before the device acceptance run, the owner must approve the precise Phase 0
commit scope. The current tree also contains E1 drafts, `docs/audit/**`, and
other user-owned/unrelated files. They must not be swept into a Phase 0 commit.
No commit, push, tag, draft cleanup, or production signing has been performed.

## 9. Exit rule

Phase 0 may be marked complete only when all 69 cases, all four drills,
legal/privacy, security, UAT, incident/recovery, signing/provenance, and owner
acceptance are evidenced; no P0/P1 remains; accepted P2/P3 items have explicit
owner dispositions; and the final production APK maps to a clean accepted
commit and checksum.
