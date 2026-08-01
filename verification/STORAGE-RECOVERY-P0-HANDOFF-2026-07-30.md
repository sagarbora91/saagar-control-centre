# Secure storage recovery P0 handoff — 2026-07-30

## Status

**Engineering complete and locally verified. Physical-device acceptance is
pending.**

This checkpoint responds to the owner-observed `Secure storage needs recovery`
screen and to the risk that native SQLite failures could escape the Capacitor
plugin thread.

No PHP/platform work was started. Nothing in this checkpoint is committed or
pushed.

## Implemented

- A native-authority marker now installs a synchronous quarantine before
  asynchronous startup:
  - stale localStorage business records are not hydrated;
  - reads return null/empty;
  - writes, clears, bulk writes, saves, and reset reject with
    `STORAGE_BLOCKED`; and
  - queued ready callbacks remain closed until every native row is read,
    decrypted, authenticated, counted, and verified.
- A non-settling native status or page read becomes the stable
  `STORE_TIMEOUT` recovery state. A late result cannot reopen the store after
  the timeout barrier.
- Native migration state remains authoritative even if the redundant
  localStorage marker is unexpectedly absent.
- Recovery UI now shows reason-specific safe wording, a stable recovery code,
  `Retry storage`, and `Copy diagnostics`.
- Retry performs a hard app-page reload. It does not clear files, reset data,
  or open stale fallback data in place.
- Copied diagnostics contain only allowlisted build/state/count/capacity
  metadata. They exclude raw exception text, paths, database payloads, record
  identifiers, PIN material, customer/staff data, and persisted logs.
- The Android SQLite bridge now catches database open, query, write,
  transaction-start, and transaction-end failures. Resolve/reject callbacks
  run only after transaction cleanup.
- Native failures use stable public reasons including `NO_SPACE`,
  `DB_OPEN_FAILED`, `INTEGRITY_FAILED`, `DB_IO_FAILED`, `DB_READ_ONLY`,
  `SCHEMA_UNSUPPORTED`, `DB_READ_FAILED`, and `ROW_COUNT_MISMATCH`.
- Native status exposes API-23-compatible device capacity and SQLite file/WAL/
  SHM/journal byte counts without exposing filesystem paths.

## Verification

- Focused P0 storage-policy/runtime/native suite: **17/17 passed**.
- Full permanent offline suite: **170/170 passed**.
- JavaScript syntax and `git diff --check`: passed.
- Capacitor sync and Android debug assembly: passed.
- Local debug APK:
  - path: `android/app/build/outputs/apk/debug/app-debug.apk`;
  - size: 7,617,642 bytes;
  - SHA-256:
    `8D3D450FCACC763BD868DEC0F6084364D510A694BEF8C54BA79C436A6DBC2605`;
  - debug-signed engineering artefact only.

## Deliberately not claimed

- No physical-device recovery reason, Retry, diagnostics-copy, relaunch,
  process-kill, low-space, corrupt-database, or key-unavailable row has passed.
- No two-device DAT-02 result changed.
- No production signing/release gate changed.
- The normal portable restore workflow is not exposed from blocked mode. It
  depends on a readable current store and cannot safely repair every blocked
  reason.

## Required device evidence

1. Install an approved review APK over the affected installation; do not clear
   app data.
2. Reproduce or inject each feasible reason and confirm the displayed code,
   stale-data quarantine, Retry, and diagnostics copy.
3. Confirm Retry either opens only the verified native dataset or returns to a
   blocked recovery state.
4. Confirm copied diagnostics contain no PIN, business record, customer/staff
   data, raw exception, record envelope, or path.
5. Capture device/API, timestamps, screenshots, and logcat for any repeat
   process close.
6. Keep corrupt/unopenable-database and key-loss restore acceptance pending
   until a separate staged recovery database plus atomic key-activation design
   is implemented and interruption-tested.

## Next implementation modules

1. Owner/PIN repair and a Settings module-protection policy:
   all module-entry PIN switches default off; one owner PIN; no hidden
   per-module fallback passwords.
2. Windows-style Settings storage panel:
   device used/free capacity bar plus clearly labelled SAAGAR native-database
   usage.
3. A separate universal blocked-mode restore design only after atomic database
   publication and key activation are specified and tested.
