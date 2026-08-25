# Phase 5 production-signed APK build and SM-T875 install — 2026-08-23

## Result

**PASS for production signing, exact-artifact installation and cold launch on the
named SM-T875.** This is a bounded release checkpoint, not final Phase 5 closure.

| Field | Verified value |
|---|---|
| Source commit | `dfa4ddb288bdfefb2dca9b249fef430dea370afb` |
| Product fingerprint SHA-256 | `233465590fb62fb246d072f91529311db2f831a307c50b8d0b6b53d08483af1b` |
| WWW tree SHA-256 | `76d48c01abbbf2d6c82028f2444a4c74a050ed895af71fdd6da53b5e4b21da9b` |
| APK | `V:\Co work\Projects\Retail\SaagarCC-v2.9-production-dfa4ddb.apk` |
| APK bytes | 5,696,008 |
| APK SHA-256 | `bc4ea8c17a5688b293e26c3ab18253069555b1744cb87e545878a64996a58bac` |
| Package/version | `com.saagartraders.bcc`, version 2.9, code 209, minSdk 23, targetSdk 34 |
| Certificate SHA-256 | `df7877f01d2956a7c9134aca06bf91ff03a953afebc561bf520b2b4d55f98519` |
| Certificate subject | `CN=Saagar Control Centre, OU=Retail Operations, O=Saagar Traders, L=Pune, ST=Maharashtra, C=IN` |
| Signature posture | one RSA-4096 signer; APK Signature Scheme v1 and v2 verified |
| Debug posture | manifest has no `android:debuggable`; installed package flags omit `DEBUGGABLE` |
| Device | Samsung SM-T875, Android 13 / API 33, serial `R52N807PTTE` |

## Build and correction boundary

The first production-signed candidate, SHA-256 `aa4f5ff98472245f40275d21a546423db226fec0e81c0188a25630e7f3aec21c`,
installed and launched but visibly displayed a stale `TEST` badge. It is rejected
and must not ship. The cause was a stale shell classification that treated the
normal shipped SQLite-primary runtime as a test signal.

Commit `dfa4ddb` limits `TEST` to the explicit `__FORCE_STORAGE_CORE` override,
adds a regression test, reconciles the pre-existing twelfth-module C1 count and
regenerates the governed identities. Verification passed:

- C1 12/12;
- mobile 6/6;
- settings 8/8;
- language 10/10;
- ETP 157/157;
- modular 86/86; and
- remaining offline aggregate 264/264.

The A3 inventory is 681 capabilities with zero conflicts. The single 680-to-681
addition is the bounded ETP gateway reauthentication permission introduced by
the earlier physical-device defect fix. The regenerated 130-row ledger remains
`pending-owner-approval` for final identity binding.

The host's Java/Windows certificate path could not reach Maven Central. No TLS
check was disabled. The exact missing public dependencies and parent POMs were
downloaded through Python's independent CA bundle, checked against Maven's
published SHA-256 or SHA-1 sidecars, and exposed through an external, group-
exclusive local Maven repository under `.android-build/`. No dependency or
credential was committed.

## Device installation and readback

The owner explicitly authorized uninstalling the previously installed
debug-signed package and erasing its local data. The rejected first production
candidate was then installed fresh. The corrected candidate used `adb install
-r` with the same production certificate:

| Check | Result |
|---|---|
| First install time | stayed `2026-08-23 18:52:28` |
| Last update time | advanced to `2026-08-23 19:08:15` |
| Installed `base.apk` | SHA-256 exactly equals the frozen corrected APK |
| Launch | `com.saagartraders.bcc/.MainActivity` top-resumed |
| Visible build badge | no `TEST` or `DEMO` badge; production chrome rendered |
| Fatal/ANR/ETP denial scan | zero matching signals |

External evidence remains outside Git at
`V:\Co work\Projects\Retail\.audit-drafts\phase5-release-install-dfa4ddb-2026-08-23`:

| File | SHA-256 |
|---|---|
| `installed-base.apk` | `bc4ea8c17a5688b293e26c3ab18253069555b1744cb87e545878a64996a58bac` |
| `production-launch.png` | `311f850e808ed3c42dd7c45ffa252d64e5a45edf0a6df16aae43ea78a30d8178` |
| `production-launch.log` | `10f344c8ea3f2129eef81632e042cb71373df92c828c65b3b0fb38f179527db6` |

## Remaining boundary

This checkpoint satisfies production APK creation, certificate/non-debug
verification and exact-hash install/launch on the SM-T875. It does not close:

- API-23-class OEM physical/interruption and update rebinding;
- authorized WLMHW/HEMW production report publication;
- named cashier/maker and manager/checker UAT;
- the final owner approval/capability and historical-approval identity rebind;
- the release decision carrying the recorded independence and A10 exceptions; or
- the final controlled audit after all external inputs converge.

