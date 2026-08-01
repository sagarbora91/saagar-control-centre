# R0-W2 Recon — Key Custody Design Space (READ-ONLY; no files edited)

## 1. Facts established from the repo (all cited)

**Data at rest today (what an attacker with the device/extracted storage gets):**
- Primary store: plaintext SQLite kv file `bcc.sqlite` (+ `.tmp`, `.bak`, `.bak.tmp`) in Capacitor `Directory.Data` — `storage-core.js:58` (`var DB_FILE = 'bcc.sqlite'`), `storage-core.js:74` (`function dataDir() { return 'DATA'; }`), atomic write chain at `storage-core.js:179-183`. Values are plain text: `db.run('INSERT INTO kv(k,v) VALUES(?,?)...')` (`storage-core.js:87`).
- Plaintext WAL journal in **native localStorage**: `WAL_KEY = 'saagar_storage_wal'` (`storage-core.js:59`), inline values for writes <50KB (`WAL_BIG`, line 69, entry with `v: v` at line 116).
- A **frozen plaintext native-localStorage migration snapshot** kept forever as the catastrophic safety copy — deletes are mirrored but sets stay MEM-only (`storage-core.js:237-241` comment: "Native is a frozen migration snapshot used only as the last-ditch catastrophic safety copy").
- Photos as Filesystem files under `DATA/saagar-photos/` (`photo-store.js:35-38`) — mechanism-only, modules not rewired; today photos are base64 inside localStorage JSON (`photo-store.js:13-21`).
- **Plaintext daily backups in SHARED storage**: `auto-backup.js:90/98/108` writes `Documents/SaagarBCC-Backups/backup-YYYY-MM-DD.json` + `latest.json` with `directory: 'DOCUMENTS'`, snapshotting every localStorage key (`auto-backup.js:61-76`), 90-day retention. Documents is user-visible/shared storage — readable by any file manager without root.
- `android:allowBackup="false"` confirmed (`android/app/src/main/AndroidManifest.xml:5`), so Android cloud auto-backup is already closed.

**WebCrypto availability — CONFIRMED usable:**
- `capacitor.config.json:10-12` sets `"androidScheme": "https", "hostname": "localhost"` → the WebView serves from a secure context, which is the gating requirement for `crypto.subtle`. Capacitor 6 (`@capacitor/android ^6.1.2`, `package.json:16`) requires WebView ≥ 60; SubtleCrypto (AES-GCM, PBKDF2, getRandomValues) has been in Chrome WebView since ~43. The app already uses `crypto.getRandomValues` successfully for the PIN salt (`index.html:2188`). WebCrypto is a platform API, not a new lib — **no no-new-libs conflict**. Caveat: `crypto.subtle` is async; the storage API surface is synchronous (`SP.getItem`, `storage-core.js:225`), which constrains WHERE encryption can sit (persist-time file encryption, not per-get/set).
- Note the codebase's own precedent at `index.html:2180`: PIN hashing deliberately stayed synchronous — "Kept SYNCHRONOUS (no async Web Crypto) so the existing prompt()-based flow is unchanged."

**Keystore plugin — NOT installed:**
- `package.json:15-22` dependencies are exactly: `@capacitor/android, app, core, filesystem, local-notifications, share`. There is **no** SecureStorage / Keystore / biometric / preferences plugin. Any hardware-backed key custody **requires adding a plugin (or a hand-rolled native Capacitor plugin) — this directly conflicts with the no-new-libs constraint**. Flagging honestly: the constraint and the roadmap goal cannot both be fully satisfied.

**PIN facts relevant to PIN-derived keys:**
- PIN is optional (`hasAdminPin()` may be false, `index.html:2201`; lockout is "fail-open no-PIN" per R0-W1 Slice C). PIN verification stores only a salted iterated FNV hash (`pinHashV2`, `index.html:2194`) — the PIN itself is never retained, and the salt lives in the same store (`st_v2_pin_salt`, line 2184).

## 2. Honest threat table — what each key-custody option actually closes

| Option | Attacker w/ extracted app storage gets | Survives reinstall? | Survives factory reset / new phone? | Verdict |
|---|---|---|---|---|
| **A. Random key in localStorage/DB (same store)** | Everything — key sits beside ciphertext | Yes (dies with data) | Via backup only if key is exported too | **Pure theatre.** Closes nothing. Do not build. |
| **B. Random key in a separate Filesystem file in `DATA/`** | Everything — same app-private sandbox, same extraction | Key lost → data lost unless key is in the Documents backup (which reopens the hole) | No | Theatre vs. root/extraction; only "closes" accidental grep of the DB file. Marginal. |
| **C. PIN-derived key (PBKDF2 from admin PIN)** | Real protection **if** a strong PIN is set and not stored — attacker must brute the PIN offline (4-6 digit PIN ≈ minutes even at high iterations; honest: weak) | Yes — user re-enters PIN | Yes — PIN + backup file restore anywhere | Only option needing no plugin AND no plaintext key on disk. But: PIN is optional (fail-open ⇒ no-PIN devices stay plaintext), forgotten PIN = permanent data loss (violates the shop's availability-first posture), and data can't decrypt at boot before PIN entry — the app reads storage at boot, so either cache the derived key on disk (→ option B in disguise) or restructure boot. Contradiction is structural, not fixable by parameters. |
| **D. Android Keystore via a SecureStorage plugin (NOT installed today)** | Ciphertext only; key is hardware-backed, non-exportable | **No** — Keystore keys are deleted on uninstall (post-Android-10 reliably) ⇒ reinstall + restored files = undecryptable unless recovery path exists | No — never leaves the device | The only non-theatre device-at-rest option, but (a) violates no-new-libs, (b) key death on reinstall is exactly the brick scenario this app's history (3 crash-days, storage-caution memory) forbids without a recovery escrow — which in an offline app means a PIN/passphrase-wrapped copy of the key in the Documents backup, i.e. option C layered on D. |

**The elephant: `auto-backup.js`.** Even a perfect at-rest scheme is nullified while `Documents/SaagarBCC-Backups/*.json` holds a full plaintext snapshot in shared storage — that is the EASIEST artifact to exfiltrate (no root, any file manager, USB MTP). Encrypting `bcc.sqlite` while leaving the Documents backups plaintext protects against nobody. R0-W3 (backup hardening) is therefore a prerequisite or co-requisite of meaningful R0-W2, not a follow-up.

## 3. Honest bottom line for the owner

Device-local at-rest encryption **without a keystore plugin is mostly theatre**: every no-plugin key home (localStorage, DB, `DATA/` file) is in the same extraction blast radius as the ciphertext. The one no-plugin exception — PIN-derived keys — trades the app's deliberate fail-open/availability posture (PIN optional, forgotten-PIN must not brick the shop's data; see `index.html:2182` "not a substitute for OS-level protection") for brute-forceable protection bounded by PIN entropy. The roadmap's word "encryption" is only honest under one of:
1. **Accept the plugin** (owner-signed rule-bend, precedent exists from Slice C): Keystore-held random AES-GCM key encrypting the persist-time file writes (`persist()` at `storage-core.js:168-193` is the single choke point; `open()`/`rd()` at 306-321 the decrypt point), **plus** a PIN-or-passphrase-wrapped key escrow inside the backup file so reinstall/new-phone restore works. WAL and the frozen native-LS snapshot must be included or explicitly documented as residual plaintext.
2. **Reframe R0-W2 as "encrypted backups + reduce plaintext surface"** (encrypt/passphrase the Documents backups, drop the frozen native-LS snapshot after a verified period, keep `DATA/` plaintext behind Android sandbox + allowBackup=false) and say plainly the on-device DB relies on OS sandbox + device lock.
3. Do nothing and document that `allowBackup=false` + app-private `DATA/` is the actual protection level.

## 4. Build-contract skeleton for the future gated wave (whichever door is chosen)

- Encryption layer wraps ONLY the file boundary: `bytesToB64(db.export())` (`storage-core.js:177`) → encrypt bytes before b64; `b64ToBytes(r.data)` (`storage-core.js:306`) → decrypt after read. Magic-header versioning (`SBC1` prefix) so `open()` distinguishes encrypted vs legacy plaintext files → **in-place migration = first encrypted persist simply overwrites, with `.bak` still holding the last plaintext copy for exactly one rotation** (decide: force a second persist to age it out, or accept one plaintext generation).
- Rollback contract: flag-off build MUST still boot — so keep the ability to read encrypted files even with encryption-writes disabled, or the rollback story is "restore from backup". This must be decided, not assumed.
- `crypto.subtle` is async — fits `persist()`/`rd()` which are already promise-chains; does NOT fit the sync `SP.getItem/setItem` path, so no per-key encryption.
- Residual plaintext to disposition explicitly: WAL (`saagar_storage_wal`, inline values <50KB), frozen native-LS snapshot, `saagar-photos/` files, Documents backups, and the sql.js in-memory DB (RAM — out of scope).
- BOOT_TIMEOUT_MS 6000 (`storage-core.js:64`): decrypt adds boot latency on slow devices; the late-heal path (`storage-core.js:330-335`) already tolerates this, but the timeout budget must be re-measured on the real device (history: headless cannot see these bugs).
- Test gate: this wave touches the exact code that caused 3 crash-days. Per the storage-caution memory: micro-incremental, device-test each step, DT-style on-device matrix (fresh install, upgrade-with-data, corrupt-file recovery chain with encrypted files, reinstall+restore, factory reset).

Key files: `V:\Co work\Projects\Retail\saagar-control-centre\www\storage-core.js`, `www\auto-backup.js`, `www\photo-store.js`, `www\index.html` (PIN §2176-2210), `capacitor.config.json`, `package.json`, `android\app\src\main\AndroidManifest.xml`.