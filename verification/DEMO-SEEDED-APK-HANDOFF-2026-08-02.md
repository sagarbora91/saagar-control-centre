# SAAGAR two-year demo APK handoff — 2026-08-02

## Purpose and evidence boundary

This is a debug-signed, synthetic-data APK for faster owner and device review. It is not a production release and installation or use does not by itself close any Phase 0 device-only, operational, privacy/legal, recovery, signing-custody, or formal acceptance gate.

## Artifact

- File: `V:\Co work\Projects\Retail\SaagarCC-DemoData-2Years-D1-D3-v2.9.apk`
- SHA-256: `1FBC7006FC9920F2F87D8AC57F165C0D800E8C5EB388FE3BD4454CF4C5BF776E`
- Size: 6,608,007 bytes
- Package: `com.saagartraders.bcc.demo`
- Launcher label: `Saagar CC DEMO`
- Version: `2.9-demo` (`versionCode` 209)
- SDK: minimum 23; target 34
- Signature: Android debug certificate; APK Signature Scheme v1 and v2 verified

The separate `.demo` package permits side-by-side installation with the normal `com.saagartraders.bcc` app and prevents the demo install from overwriting its application data.

## Synthetic profile

- Profile: `two-year-review-v1`
- History: 730 days back / 731 calendar dates including the build date
- Walk-ins: approximately 25 per working day
- Stores represented: WLMHW and HEMW
- Seed includes cross-module operational history, two years of locked payroll snapshots, D3 Service workflow variety, QMS live/archive partitions, and stock history for working days.
- Phone-like values use deterministic non-routable synthetic numbers beginning with `1`; the in-app banner says `SYNTHETIC DEMO DATA` and `DO NOT CONTACT`.

## Verification completed

- Focused seed/build/security suite: 16/16 passed.
- Full offline regression suite: 210/210 passed.
- APK packaged assets inspected: seed flag is `true`, days are `730`, and working-day walk-in target is `25`.
- Post-build generated Android files verified restored to clean package, clean launcher name, version `2.9`, and `DEMO_SEED_ENABLED = false`.

## Owner/device checks still required

1. Verify the SHA-256 before installation.
2. Confirm the launcher shows `Saagar CC DEMO` and that the normal app remains separately installed.
3. Allow first-launch seeding to finish; do not force-close during preparation.
4. Confirm the synthetic-data banner remains visible and review both WLMHW and HEMW views.
5. Record device model, Android/API version, RAM/storage, observed seed duration, crashes/ANRs, and module-specific results.
6. Treat every result as demo-build evidence only. Run recovery, cross-device restore, API-23, capacity/performance, and formal acceptance cases according to their controlling scripts.

## Source changes awaiting review

- `scripts/build-seeded-apk.mjs`: isolated demo package/name/version and guaranteed restoration of generated files.
- `www/demo-seed.js`: records the last working stock date deterministically when the profile ends on Sunday.
- `tests/seeded-apk-profile.test.mjs` and `tests/seeded-apk-runtime.test.mjs`: isolation and stock-profile coverage.

These changes and this handoff are not committed or pushed as part of this build operation.
