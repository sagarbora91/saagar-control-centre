# R0-W2 · W2-S3 — STORAGE_ENCRYPT_ENABLED = true: at-rest encryption LIVE

**Programme:** Track A · R0 · Wave R0-W2. **The one-line flip the whole wave was built toward.**
**Status:** SHIPPED. **origin/main = `3cb84fc`** + production APK **`Retail/SaagarCC-DemoData-R0-W2-ENCRYPTED.apk`**
(6.86 MB; packaged storage-core SHA256 `b5dd501e…` byte-exact vs source with flag=true; NO `__FORCE` leftover
(`cap sync` wiped the S2b test injection); Keystore plugin confirmed in dex; mojibake-clean).
**Base:** `e8ffc59` (S2b) → `3cb84fc`. Change: exactly ONE line in `www/storage-core.js`.

## Gates cleared before the flip (all owner-verified)
- **DT2 device matrix PASSED on both devices** on the S2b `__FORCE-ENCRYPT` APK: fresh-encrypt (SBCC1 live + SKW1
  `bcc.dek` + SBCC1 `.bak`), reboot-decrypt, kill-mid-persist self-heal, **orphaned-KEK fail-open**,
  **keystore-unavailable fail-open**, **flag-off rollback (no data loss)**, factory-reset DEK wipe, boot timing < 6s,
  Android data-clear.
- **Owner sign-offs:** OD-1 (hardware Keystore custody), OD-8 (fail-open loud + Diagnostics), OD-K2..K5.
- **OD-K1 DECIDED: minSdk STAYS 22.** API<23 devices keep installing and run **fail-open plaintext** (honest
  `plaintext-no-keystore` in Diagnostics — no silent downgrade); API-23+ devices get full hardware-key encryption.
  Chosen to never lock an old field device out of the app.

## What is now true in production (API-23+ devices)
`bcc.sqlite` (+`.tmp`/`.bak`) is written as **AES-256-GCM `SBCC1` ciphertext**; the 32-byte DEK is wrapped by the
non-exportable `AndroidKeyStore` KEK `saagar_dek_kek_v1` and only the wrapped `SKW1` blob (`bcc.dek`) touches disk.
A copy of the DATA directory taken off-device is useless. MEM stays plaintext (whole-file envelope at the persist/boot
boundary); every consumer is untouched.

## Honest scope (contract §B1 — repeat to any third party)
Protects data copied OFF the device. Does NOT protect a rooted/live-instrumented device (the app unwraps headlessly at
boot). The KEK dies on uninstall / factory reset / lock-screen-credential change → ciphertext then unrecoverable;
recovery = the JSON backups (keep the off-device Share discipline). **The daily DATA snapshots are still plaintext
until R0-W3-S3** — that slice is the co-requisite for any external "encrypted at rest" claim.

## Rollback (proven, not theoretical)
Set the flag `false` and ship: the reader is always-on, so a flag-off build reads existing ciphertext and the next
persists rewrite plaintext in place (DT2-7 device-proven, no data movement, no loss). Second-level rollback
(`STORAGE_CORE_ENABLED=false`) unchanged; the sqlite-store SBCC1 stand-down guard (W2-S1 E7) protects the ciphertext file.

## Verification of this slice
One-line diff (verified); `node --check` clean; harness (flag on, browser = no Keystore/FS) boots clean with correct
fail-open plaintext seal/unseal, 0 console errors; the real encrypted path is exactly the code the DT2 matrix passed.

## Next
- **R0-W3 S3** (NEXT build): wire `SaagarStore.seal`/`unseal` into the DATA auto-backup snapshots + restore sniff —
  closes the last at-rest plaintext of business data on-device. Note from S2b triage: the first `seal()` call can be
  what mints the DEK (by design). Then **S4** (nudge polish) completes R0-W3.
- Then **R0-W4** (export control SEC-08 + test estate) → R1 legal → Track B.
