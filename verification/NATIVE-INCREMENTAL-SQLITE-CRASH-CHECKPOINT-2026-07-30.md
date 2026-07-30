# Native incremental SQLite crash checkpoint — 2026-07-30

## Trigger and status

The original two-year seeded APK failed real-device review:

- selecting a back date could close the app immediately; and
- opening any module could close the app after roughly five to six seconds.

The second symptom aligned with `storage-core.js`'s six-second save debounce.
The prior engine held a `sql.js` database in WebView memory and every save
synchronously exported, encrypted, Base64-encoded, and rewrote the complete
database. Reducing seed volume was rejected because it would only postpone the
same failure as real data grows.

The storage-engine rewrite is implemented and locally verified. Physical-device
acceptance remains **PENDING**.

## Implementation

- Added the Android `SaagarNativeStore` Capacitor plugin using the platform
  `SQLiteOpenHelper`; no new Maven dependency was introduced.
- Normal edits persist only changed encrypted records in bounded transactions.
  JavaScript sends a SHA-256 key identifier and an `SBKV1` AES-GCM envelope;
  the native database does not receive plaintext business keys or values.
- Startup reads encrypted records in bounded pages and keeps the existing
  synchronous localStorage-compatible in-memory API.
- Existing `bcc.sqlite` installations use a one-time legacy load followed by a
  verified native migration. The native store becomes authoritative only after
  row-count and SQLite integrity verification.
- Large seed/restore operations write to `kv_stage` in bounded transactions,
  then atomically replace the live `kv` table in one verified transaction.
  An interrupted bulk operation leaves the previous live dataset intact.
- Existing WAL sequencing, Keystore DEK custody, logical encrypted backups,
  rollback behavior, factory reset, and the legacy snapshot fallback remain.
- Back-date rendering is coalesced to the next frame, hidden mobile Today
  rendering is skipped, the daily brief is shared, and large JSON sources are
  cached with raw-value invalidation.

The legacy whole-file writer remains only as a compatibility fallback when the
native Android plugin is unavailable. Native mode dispatches before
`db.export()` and never executes that export path.

## Automated and build evidence

- Native storage static/runtime regressions: **6/6 passed**.
- Full permanent offline suite: **159/159 passed**.
- Full 730-day seed runtime: **1/1 passed**.
- JavaScript syntax checks: passed.
- Android/Capacitor Java compile: passed.
- Android debug assembly: passed.
- Packaged DEX inspection: `SaagarNativeStorePlugin` present.
- Packaged web inspection: native incremental dispatch and atomic bulk
  verification present.
- Clean source and generated Android assets restored to seed disabled after the
  seeded build.

Current review APK:

- Path:
  `V:\Co work\Projects\Retail\SaagarCC-DemoData-2Years-D1-D3-v2.9.apk`
- Size: **7,617,377 bytes**
- SHA-256:
  `77111CE3E9967C224340C10B4CE70B5487678E3080CEA7CEB96A5DF7F1FABEBD`
- Identity: version 2.9, versionCode 209, minSdk 23, targetSdk 34
- Profile: `two-year-review-v1`, 730 days back plus today, 25 synthetic QMS
  walk-ins per working day
- Signing: debug; review use only

Do not use the earlier whole-file-persistence artifacts:

- `4545DA621EB13AB540F3631D8D0C24A8CBC8A09B44C0F16B1A9549F14E948CF4`
- `6B7B7796C6FC9E6BD3658AFB71FD12DE3A56BF5862A3D085CC51BD1675EA93B9`

They are superseded because device review reproduced the scale crash.

## Required device retest

No row below is passed yet:

1. Fresh-install the current checksum and let the two-year seed finish.
2. Open every module and remain in it for at least 15 seconds.
3. Select representative back dates, including near the beginning of the
   two-year range, and remain on each view for at least 15 seconds.
4. Save edits in representative modules, wait at least 15 seconds, navigate,
   relaunch, and confirm readback.
5. Repeat after process kill and device restart.
6. Run the five-save DAT-02 gate on both nominated devices and record actual
   timing/memory evidence.
7. Run backup, restore, reset, archive-file, and interrupted-bulk recovery
   drills at the seeded volume.

If any app close remains, collect Android logcat for
`com.saagartraders.bcc` before making another tuning change.

## Remaining scale boundary

This phase removes whole-database rewrites and also avoids holding a duplicate
`sql.js` database in native mode. The compatibility layer still exposes
synchronous localStorage semantics and therefore keeps active key/value data in
WebView memory. Future datasets materially beyond the tested range still need
module-level paged repositories and bounded-history policies; that is a
separate follow-on architecture slice, not grounds to claim this device gate
passed.

No PHP/platform work was started. Nothing was committed or pushed.

## Owner-reported device smoke - 2026-07-30

The owner reports that the current seeded APK (SHA-256
`77111CE3E9967C224340C10B4CE70B5487678E3080CEA7CEB96A5DF7F1FABEBD`)
is working correctly on the device used for review. Neither the immediate
back-date close nor the delayed module close was reported again during this
smoke. This supplies direct device evidence for the two reported crash symptoms
on that review device.

This report does not contain the device model/API, timed module-by-module
results, memory/ANR data, process-kill/restart results, DAT-02 measurements, or
backup/restore/reset/interrupted-bulk observations. The numbered controlled
retest, two-device DAT-02 gate, recovery drills, and all production release
gates therefore remain pending.

The owner approved committing and pushing the reviewed Android changes. No
PHP/platform work was started.
