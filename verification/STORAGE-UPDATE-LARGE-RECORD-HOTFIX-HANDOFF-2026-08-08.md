# Storage update large-record hotfix handoff - 2026-08-08

## Checkpoint

- Branch: `agent/etp-retail-runtime`
- Starting HEAD: `f5421edf9649c55b88f9f6e95113265eec3d593d`
- Hotfix state: engineering implementation, regression and build complete; owner update-in-place smoke remains pending. The owner has authorized the combined storage/ETP closure commit, but not a push.
- PHP/platform work: excluded.
- Working tree: intentionally dirty; staging area is empty. Preserve every listed change and all unrelated owner-owned files.

## Owner-reported failure evidence

An existing installation failed after APK update with the fail-closed storage recovery screen. The safe diagnostic reported:

- code `STORE_UNAVAILABLE` at `native-read`;
- schema version `2`;
- `expectedRows: 6567` and `loadedRows: 480`;
- native plugin present and about 28 MB of native-store files;
- retry failed three times;
- uninstalling and reinstalling made the app work, proving the failure was specific to loading retained update data.

This is owner-reported incident evidence, not formal device acceptance.

## Root cause

Native startup loaded records in 32-row pages. The page requested after the first 480 committed rows contained at least one encrypted value large enough to exceed Android's SQLite `CursorWindow`/bridge capacity. The old `readPage` SQL selected the complete payload before JavaScript could classify it as oversized, so the native read failed with `STORE_UNAVAILABLE`.

Separately, the prior six-second absolute boot deadline was a preventive scale risk for authoritative hydration. The owner diagnostic establishes a native read failure, not a timeout, so the deadline is not claimed as an incident cause.

## Implemented correction

- `SaagarNativeStorePlugin.readPage` now uses a metadata-safe `CASE WHEN length(payload) <= CAST(? AS INTEGER)` projection. The explicit cast is required because Android `rawQuery` binds selection arguments as strings.
- An independent 512 KiB inline-record cap is enforced separately from the aggregate page budget, so one record cannot consume the page's complete bridge allowance.
- Oversized encrypted envelopes are retrieved only through bounded `substr` chunks: 256 KiB by default, 512 KiB maximum.
- The JavaScript loader validates key, sequence, total length, offset, returned chunk length, next offset and terminal state before accepting a record.
- Reassembled records are capped at the existing 16 MiB persistence ceiling and authenticated with the existing AES-GCM/SHA contract before becoming visible.
- Ordinary page decryptions run in fixed batches of eight while preserving deterministic commit order.
- Startup retains the six-second status/probe timeout, adds a 15-second per-call stall timeout, and uses a bounded 120-to-300-second authoritative-load deadline derived from the verified row count.
- Native read failures retain stable fail-closed codes and never expose raw payloads or exception text.
- The unrelated MAH-4 asynchronous audit test now keys results by action rather than relying on promise completion order, removing a verified test-order flake without changing production behavior.

## Changed files

- `build-overrides/native/SaagarNativeStorePlugin.java`
- `www/storage-core.js`
- `tests/helpers/storage-core-harness.mjs`
- `tests/native-storage-large-record-upgrade.test.mjs`
- `tests/mah4-stage-b-runtime.test.mjs`
- `tests/mah4-message-lifecycle-baseline.test.mjs`
- `package.json`
- refreshed MAH-3/MAH-4 integrity profiles and the three MAH-3 canary evidence files
- `verification/native-upgrade/run-api23-update-evidence.mjs`
- `verification/native-upgrade/README.md`
- `verification/native-upgrade/API23-UPDATE-EVIDENCE.json`

`package-lock.json` is unchanged.

## Automated evidence

- Full offline regression after ETP Core Contract Closure: **492/492 passed** across the seven component suites:
  - C1: 12/12
  - mobile layout: 6/6
  - Settings: 8/8
  - language: 4/4
  - ETP: 128/128
  - modular architecture: 72/72
  - main offline suite: 262/262
- New large-record focused contract: 6/6 passed.
- Combined focused storage/recovery suite: 25/25 passed.
- Final Android debug Java compilation and APK assembly: passed.
- Canonical and generated `SaagarNativeStorePlugin.java` SHA-256 match exactly:
  `1ADE5D71947E90CACC692991E7501BE9B64BDC5B497893E182CAFB8D5F43B9BA`.
- `git diff --check`: passed.

## API-23 install-replace engineering evidence

The isolated emulator runner installed a baseline, retained its package data, then installed the candidate with Android's replace/update operation. It verified:

- package UID remained `10063`;
- all 6,567 synthetic retained records loaded;
- one 3,145,887-character retained value matched its exact SHA-256;
- first and last sentinel records matched;
- storage reached `ready` in `native-incremental` mode;
- recovery reported `expectedRows: 6567` and `loadedRows: 6567`;
- the captured final log contained no `CursorWindow`, `SQLiteBlobTooBigException`, or `STORE_UNAVAILABLE` occurrence.

All 11 named evidence checks passed; `pass: true` therefore reflects install-replace success, UID preservation, exact retained data, ready/unblocked state, reconciled row counts and native-incremental mode together.

Evidence classification is deliberately `EMULATOR_ENGINEERING_ONLY`; `formalDeviceAcceptance` is `false`.

That passing evidence binds the pre-ETP-closure candidate SHA-256
`4147DFCD2FC5A6C76A1246F092F6E9B970DAD4642BAE9EF0D83006D9290F5804`.
Two attempts to regenerate the same evidence for the rebuilt combined-closure
APK below stopped at the harness's ten-minute **baseline synthetic seed**
deadline. The candidate update and verification stages were never entered, and
no app/storage error was observed. Therefore install-replace evidence for the
new APK hash remains pending; the older pass is retained as hotfix engineering
evidence and is not relabelled as evidence for the rebuilt APK.

## Current candidate APK

- Path: `V:\Co work\Projects\Retail\saagar-control-centre\android\app\build\outputs\apk\debug\app-debug.apk`
- Size: **7,326,431 bytes**
- SHA-256: `A5502378EB5877BCD3CAA36172DBC7D6777ABE19FAF340A81053F6D5BCDBCDDB`
- Identity: version 2.9, versionCode 209, minSdk 23, targetSdk 34
- Profile: normal, non-seeded, debug-signed APK built from the current dirty uncommitted tree

## Required owner update test

1. Do **not** uninstall the current app and do **not** clear app data.
2. Install the candidate APK over the existing app as an update.
3. Open SAAGAR and allow the retained data load to finish.
4. Confirm that the recovery screen does not appear and existing records remain available.
5. Close and reopen the app once and confirm the same result.

If the test fails, copy the safe diagnostics before doing anything else and do not uninstall or clear data; preserve that retained state for diagnosis.

Record a successful result only as owner-reported physical-device smoke unless device/API details and the formal controlled acceptance evidence are also captured.

This hotfix does not by itself close Phase-0, DAT-02, physical-device, production-signing or release acceptance gates.

## Crash-resume order

1. Read this handoff and confirm branch/HEAD and the intentionally dirty inventory.
2. Confirm the APK SHA-256 before distributing it.
3. Obtain the owner's update-in-place result without uninstall/clear.
4. If successful, record it strictly as owner-reported smoke and reconcile the current handoff. Commit authority already exists for the combined closure; pushing still requires separate approval.
5. If unsuccessful, preserve app data and use the copied safe diagnostics plus package log evidence to continue diagnosis.

Do not push without explicit owner approval. Physical-device smoke remains an external acceptance gate and is not manufactured by the engineering closure commit.
