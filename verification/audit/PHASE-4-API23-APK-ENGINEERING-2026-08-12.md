# Phase 4 API-23 APK Engineering Evidence

**Date:** 2026-08-12 (Asia/Kolkata)

## Exact artifact

- File: `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`
- Bytes: 7,269,978
- SHA-256: `B65AA97563BDD6217753FD95AB456624AD71FFACBDA2F120088C00E3F91CAD20`
- Package: `com.saagartraders.bcc`
- Version: 2.9 (`versionCode` 209)
- SDK: minimum 23, target 34
- Signing: Android debug certificate; APK signature schemes v1 and v2 verified
- Signer certificate SHA-256:
  `faae9739c054b88b4c9cee8f62bf1dfa103807b7a45a835d901467cb26fe05dc`

This is a seeded, synthetic two-year review APK. It is not production-signed and
does not close production release acceptance.

## API-23 emulator result

- AVD: `saagar_api23_evidence`
- Device model: Android SDK built for x86_64
- Android: 6.0 / API 23
- Existing package data before `adb install -r`: 28,008 KiB
- Exact-hash install-replace: success
- Launch: `Status: ok`; `MainActivity` resumed and focused; 1,499 ms
- Package process remained live after launch.
- Package data after install-replace: 28,008 KiB
- Preserved `bcc.dek` MD5: `32bf42785c9c3be1adc3d5299f809c11`
- Preserved `saagar_qms_archive.json` MD5:
  `d44304a2c3ab7b58245ca89926fab2c5`
- Fatal `AndroidRuntime`/package log matches after relaunch: zero

This closes the local API-23 install-replace engineering check for this exact
APK hash. It does not replace physical API-23/OEM document-provider testing,
owner-device acceptance, production ETP publication, trusted measurement, or
production signing/release authority.

