# SAAGAR Android - Phase 0 engineering publish handoff

**Prepared:** 2026-08-02 (Asia/Calcutta)  
**Branch:** `agent/storage-recovery-p0`  
**Parent before publish:** `4177701f8fe4cab46de1ff2e7597ccb52e0cda5a`  
**Scope:** completed Phase 0 repository engineering only  
**Formal Phase 0 acceptance:** **PENDING**

## Published engineering scope

- fail-closed native SQLite recovery and bounded diagnostics;
- native capacity and SQLite-footprint reporting;
- Owner selection and all-off-by-default per-module entry-PIN controls;
- live embedded role/Owner context and downgrade revocation;
- Settings storage-capacity presentation;
- deterministic ENG-02 full-storage test clock;
- centralized package/version/minSdk identity consumed by the app, Android
  overrides, and release register;
- permanent focused, security, recovery, storage, and integration regressions;
- consolidated-plan and Phase 0 verification updates.

## Verification before publish

- `npm run test:phase0`: 12/12 passed.
- `npm run test:offline`: 210/210 passed in normal Asia/Calcutta environment.
- `npm run build:apk`: passed.
- `npm run build:release` without production secrets: correctly stopped with
  `Signed release blocked`.
- `git diff --check`: passed; line-ending conversion warnings only.

Engineering debug APK before publish:

- path: `android/app/build/outputs/apk/debug/app-debug.apk`;
- bytes: `7,623,657`;
- SHA-256: `991EC37A03F39540233BE0A3F3972CEF8A798A27521BD3B9FC4F0BD1B19ED743`;
- package: `com.saagartraders.bcc`;
- version: `2.9`, versionCode `209`, minSdk `23`, targetSdk `34`;
- clean source seed disabled;
- Android debug certificate, v1/v2 verified.

The APK was built before the publish commit from the same application sources
but an intentionally dirty tree. It is a device-review artifact, not final
production provenance. A final accepted APK still requires a clean accepted
commit and production signing.

## Deliberately excluded from publish

- all `docs/audit/**` user-owned files;
- root `package-lock.json`;
- every E1/ETP implementation, test, inventory, checkpoint, and plan addendum;
- Phase 1 blocker documents;
- superseded reviewed E1 test attempts;
- incomplete `www/build-identity.js` status is superseded: the published file
  is now consumed and verified as part of Phase 0 identity centralization;
- PHP/platform work.

## Acceptance still pending

No physical-device row is passed by this publish. Phase 0 still requires all 69
cases, two-device DAT-02, BKP-03 provider evidence, cross-device restore,
legacy/API-23 drill, legal/privacy approval, security posture, staff UAT,
incident/recovery rehearsal, production signing custody, exact clean-commit APK
provenance, and owner acceptance. Use
`verification/PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md`.

No PHP work was started. No device-only or production acceptance claim is made.
