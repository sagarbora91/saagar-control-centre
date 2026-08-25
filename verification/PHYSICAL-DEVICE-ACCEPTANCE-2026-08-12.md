# Physical-device acceptance - corrective seeded APK

Date: 2026-08-12 (Asia/Kolkata)

## Accepted artifact

- File: `SaagarCC-C1-DemoData-2Years-v2.9.apk`
- Size: 7,053,364 bytes
- SHA-256: `E6B26939D7AB0C3F64E79025B5E62F689DE93DCDF3EEEE5D6346F98B93963757`
- Package: `com.saagartraders.bcc`
- Version: 2.9 (`versionCode` 209)
- Signing: Android debug certificate; APK signature schemes v1 and v2 verified

## Physical-device result

- Device model: Samsung SM-T875
- Android version: 13
- Owner-reported result: **PASS**

The owner confirmed that the replacement APK corrected both observed defects:

1. Expense Manager renders instead of showing a blank content area.
2. Retail ETP import is part of Reports and is no longer mapped under Settings.

The owner also confirmed that the rest of the tested application remained good.

## Supporting engineering evidence

- The same artifact passed a clean seeded install on the configured Android 6.0
  / API 23 emulator.
- Expense rendered seeded dashboard content without a JavaScript syntax or
  console error.
- Retail ETP import was visible under Reports and absent from Settings.
- The canonical modular aggregate passed 86/86 tests and the main offline suite
  passed 262/262 tests.

## Boundary

This record is physical-device acceptance of the corrective seeded debug APK.
It is not production signing approval, production release approval, or evidence
for real ETP source files, process death, disk-full, corruption, key rotation,
low-storage behavior, legal review, native-language review, or staff UAT.
