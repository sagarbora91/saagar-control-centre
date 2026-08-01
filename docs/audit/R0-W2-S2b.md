# R0-W2 · W2-S2b — at-rest encryption WRITER (flag OFF in production; __FORCE test-only)

**Programme:** Track A · R0 · Wave R0-W2. The first slice where ciphertext CAN reach disk — but only on a test build.
Design: contract §3 (E3/E5) + Addendum B; a 5-agent design workflow validated the exact anchors against post-S2a code.

**Status:** SHIPPED. **origin/main = `e8ffc59`**. Two seeded APKs:
- **`Retail/SaagarCC-DemoData-R0-W2-S2b.apk`** — PRODUCTION build, `STORAGE_ENCRYPT_ENABLED=false`, no `__FORCE`.
  Packaged storage-core SHA256 `363d45e9…` byte-exact vs source; adversarially proven flag-off byte-identical to S2a.
- **`Retail/SaagarCC-DemoData-R0-W2-S2b-FORCE-ENCRYPT.apk`** — TEST build, `window.__FORCE_STORAGE_ENCRYPT=true` injected
  into the git-ignored synced `index.html` (committed source untouched); SAME storage-core SHA. This is the build that
  actually encrypts, for the DT2 device matrix.
**Base:** `019aab4` (S2a) → `e8ffc59`. Committed change: `www/storage-core.js` only (6 hunks, 49+/18−). Flag stays FALSE.

## What shipped (6 edits, all `storage-core.js`)
- **E3 (persist writer):** `raw=db.export()` snapshotted synchronously with `through=_seq` (the `clearWALThrough`
  invariant); `encryptForPersist(raw)` runs INSIDE the `_persisting` mutex, after the `.bak` promote, before the `.tmp`
  write. `encryptForPersist` never rejects (self-catches to plaintext) → persist-fail semantics unchanged; the
  `.catch(→null)` stays ABOVE the encrypt link so `writeFile` can never get `data:null`.
- **E5 (.bak reseal):** on the first encrypted boot, force the boot flush to BE the first ciphertext persist, then fire
  ONE more persist so live + `.bak` are both SBCC1 within seconds. Once-per-boot `_encBakDone` guard; skips 2nd+ boots
  via `_encState`; fire-and-forget after `setReady()` (off the boot-critical path).
- **Single-flight fix (deferred from S2a, live now):** `getDEK` split into TWO intent-keyed memo cells
  `_dekReadP`/`_dekWriteP`. A writer can never be pinned to a reader's null-resolving promise; each tail clears only its
  own cell (no cross-clobber, no two-DEK data-loss race); at most one `wrapKey`+`bcc.dek` write per absent-file window.
  `resetAll` clears both.
- **`SaagarStore.seal`/`unseal`** exposed for R0-W3-S3 (SBCC1 bytes over the same DEK envelope). INERT — no callers;
  flag-off `seal` returns byte-identical plaintext.

## Verification
- **Adversarial (6 Opus skeptics + high-effort triage; re-run after a host crash): 0 P0, 0 P1.** Every load-bearing
  invariant verified line-by-line: flag-off byte-identity, persist-mutex + WAL invariant across the encrypt await,
  never-reject `encryptForPersist`, two-cell single-flight with no race, E5 loop-safety, fail-open only.
- **Harness (flag off, no Capacitor FS):** boots clean, `encState='plaintext-flag-off'`, `seal` byte-identical plaintext
  + no SBCC1 envelope, `unseal` round-trips + passes through non-envelope, seeded data readable, 0 console errors.
- **Orchestrator-direct:** `node --check` clean; diff is `storage-core.js` only (6 hunks); `index.html`/`sqlite-store.js`/
  blobs untouched; flag literally `false` at L78 (the `=true` is the `__FORCE` guard); prod APK carries no `__FORCE`;
  test APK carries `__FORCE`; both APKs share the identical storage-core SHA; Keystore plugin+alias confirmed in the dex.
- **DEVICE-ONLY (harness has no Keystore/FS):** the actual encrypt path runs only on the `__FORCE` APK.

## Two P2 notes (for the flag-flip gate, NOT S2b blockers)
1. **Interrupted E5 reseal → plaintext `.bak`:** on the `__FORCE` build, if the first ciphertext persist succeeds but
   the reseal `flush()` then fails its FS write, `.bak` stays the promoted plaintext copy; `_encBakDone` blocks re-run
   this boot. Self-heals on the very next ordinary persist (which promotes ciphertext live→`.bak`). Device-only,
   flag-on-only, confidentiality-of-a-fallback-file (not data loss).
2. **Flag-on `seal()` mints the DEK:** the first `SaagarStore.seal()` on a flag-on build routes `getDEK(true)`→`wrapKey`
   and creates `bcc.dek` as a side effect (by design — same envelope as the DB). Inert in S2b (no callers); relevant when
   R0-W3-S3 wires an auto-backup seal-on-write.

## DT2 DEVICE MATRIX — run on the `__FORCE-ENCRYPT` APK, both devices (contract §B6)
Capture T1 logs + Diagnostics `encState` each case. Take a fresh off-device backup before destructive rows.
- **DT2-2 fresh-encrypt:** clean install → `bcc.sqlite` starts with `SBCC1`; `bcc.dek` exists (SKW1); `.bak` is SBCC1;
  `encState=encrypted-keystore-<backing>`.
- **DT2-3 reboot-decrypt:** kill+relaunch → data intact, no reseal persist (E5 skips 2nd boot).
- **DT2-4 kill-during-first-persist:** force-kill between persist #1 and the reseal → next boot live=SBCC1 or clean
  rollback; `.bak` self-heals on first organic persist. No brick, no data loss.
- **DT2-5 orphaned-KEK fail-open:** stale `bcc.dek` + KEK alias gone → `E_ORPHAN` → plaintext persist,
  `encState=plaintext-no-keystore`, app functional.
- **DT2-6 keystore-unavailable fail-open:** plugin absent / API<23 → plaintext persist, no crash, no `bcc.dek`.
- **DT2-7 flag-off rollback:** install the PRODUCTION (no-force) APK over encrypted data → reader still decrypts, boots
  with data intact, next persist rewrites plaintext; live+`.bak` return to plaintext over time. No data loss.
- **DT2-8 factory-reset (`_reset`):** `bcc.sqlite*`+`bcc.dek*` all deleted; both DEK cells null; a re-seed mints a fresh DEK.
- **DT2-9 boot timing:** ~15MB DB on a low-end device → first-encrypted boot (encrypt ~98ms + reseal) stays within
  `BOOT_TIMEOUT_MS` 6000, no ANR. (Fallback if contended: switch the reseal from `flush()` to `scheduleSave()`.)
- **DT2-11 data-clear:** Android "Clear data" → next boot = fresh install path, fresh DEK, no crash.

## Next
Owner runs the DT2 matrix on the `__FORCE` APK. **Only after it passes on both devices + owner signs
OD-1/OD-8/OD-K1(minSdk 22→23)/OD-K2..K5 does `STORAGE_ENCRYPT_ENABLED` flip true** (that flip is the shipping-encryption
slice, W2-S3/S4). Then **R0-W3 S3** (encrypt DATA snapshots via `SaagarStore.seal`/`unseal`) → **S4**. Contract Addendum B §B5/B6.
