# R0-W2 W2-S2 (Keystore key-wrapping) + loadKey rework — READ-ONLY DESIGN

Grounded in the actual tree (read this session): `www/storage-core.js` (full, 505 lines — note S1 already shipped, line numbers below are LIVE not contract-era), `docs/audit/r0w2-specs/R0-W2-BUILD-CONTRACT.md`, `android/app/src/main/java/com/saagartraders/bcc/MainActivity.java` (bare `BridgeActivity{}`), `AndroidManifest.xml`, `capacitor.config.json`, `package.json`, `build-overrides/apply-overrides.js`. **No file edited.**

---

## 0. TWO HARD FACTS FOUND IN THE TREE THAT CHANGE THE FRAMING (owner must see these first)

**FACT A — minSdkVersion = 22, but Keystore AES needs API 23.**
`android/app/build/intermediates/.../manifest-merger-blame-debug-report.txt:8` → `android:minSdkVersion="22"`. `android.security.keystore.KeyGenParameterSpec` and AES/GCM keys inside AndroidKeyStore are **API 23+**. On any API-22 device (Android 5.1) the plugin's `wrapKey` will throw — there is categorically no hardware/TEE AES key path below 23. So the honest custody claim is "hardware-backed **on API 23+**, fail-open plaintext on API 22." Decision for the owner: either (OD-K1) raise `minSdk` to 23 (drops Android 5.0/5.1 — the MEMORY's "older v2 device" must be checked; if it is API ≥23 this is free), or (OD-K2) accept a documented plaintext-on-API-22 fallback. I recommend raising to 23 unless a real target device is 22 — it removes an entire silent-plaintext class. Even on 23+, `StrongBox` (`setIsStrongBoxBacked`) is **API 28 + specific hardware**; below that or without the SE you get TEE; some OEM/emulator paths fall to a software keystore. The plugin must **report which backing it got** and surface it (§6).

**FACT B — `android/` is git-ignored and Capacitor regenerates it; `MainActivity.java` is rewritten on `cap add`/regen.** `build-overrides/apply-overrides.js` header states this explicitly and is the existing mechanism that re-applies `allowBackup="false"` after every `cap sync`. Therefore the SaagarKeystore **native source and its MainActivity registration are NOT durable** — they must be re-applied by `apply-overrides.js` after `cap sync`, exactly like the manifest hardening. This is a build-pipeline requirement, not optional. It stays offline-safe because the plugin uses only `android.security.keystore.*` / `javax.crypto.*` (framework classes, zero Maven artifacts, no gradle cache change).

---

## 1. FAIL POLICY — FIRM RECOMMENDATION: **FAIL-OPEN, but as an explicit, logged, owner-visible state.**

The entire storage contract is durability-primary (`storage-core.js:20`, `:98-99`, `:344` fail-open everywhere; a shop POS must never brick). Keystore custody adds a *confidentiality intent*, which creates the tension. Resolution:

- **Keystore unavailable / `wrapKey` throws / plugin absent → persist PLAINTEXT** (today's `encryptForPersist` already degrades to `bytesToB64(raw)` on `!key`, `storage-core.js:131,138`). Never refuse to persist; never refuse to boot. A rooted/lost device is not made safer by bricking a shopkeeper's till.
- **BUT NOT SILENT.** The current code logs `'encrypt skipped — no key'` and moves on — insufficient for a hardware-custody claim. Add a durable, owner-visible state field (§6): `SaagarStore._status().encState ∈ {'encrypted-keystore-strongbox','encrypted-keystore-tee','encrypted-keystore-software','plaintext-no-keystore','plaintext-flag-off'}`. So "we thought it was encrypted but the device silently downgraded" is a *reportable* condition, not a hidden one. The owner is an advocate — a silent downgrade is the unacceptable outcome, not the plaintext itself.
- **Decrypt/unwrap failure at read → null → existing recovery chain** (unchanged from S1: `rd()` null → `open()` fails → live→.tmp→.bak→fresh → `reconcile()` re-migrates from native-LS, `storage-core.js:375,383-390,337-364`). Distinct log line, never confused with corruption.

Rationale for *not* fail-closed: fail-closed here means "a Keystore hiccup (OEM bug, key invalidation after a fingerprint change, StrongBox exhaustion — all documented real events) makes the business data unopenable." That trades a certain availability loss for a speculative confidentiality gain on a device the attacker already physically holds. Wrong trade for this product. **Fail-open + loud state is the ruling.**

---

## 2. WHAT KEYSTORE HONESTLY CHANGES (say this to the owner verbatim)

**Now protected that a raw `bcc.key` file did NOT:** a copied `DATA` directory yields `bcc.sqlite` ciphertext **+ a wrapped DEK that only THIS device's Keystore KEK can unwrap**. The KEK is non-exportable and never leaves the TEE/StrongBox. Off-device, the wrapped DEK is useless — you cannot decrypt the DB with a file copy alone anymore. That closes the §1.18-of-contract "key and lock in the same drawer" hole for the **file-copy / forensic-grab / misdirected-share / future-backup-channel** threats.

**Still NOT protected (state plainly):**
1. A **rooted or live-instrumented device** where the app process can be driven: the app itself calls `unwrapKey` and holds the plaintext DEK + plaintext MEM in RAM by design (WebCrypto has no sync API → MEM must stay plaintext, contract §2). Root that can hook the running app can get the data. Keystore raises the bar to "must compromise the live app," not "must copy a file."
2. **Backing variance:** software-keystore (no TEE) devices give you obfuscation, not hardware protection. The plugin reports which you got; do not claim "hardware" when it says `software`.
3. **Lost device passcode / key invalidation:** if the KEK is bound to auth or gets invalidated (OS upgrade edge cases, biometric enrollment change with certain specs), the DEK can't be unwrapped → fail-open re-migration from native-LS → **post-first-boot deltas lost, restorable only from JSON backups** (OD-5 still binds).
4. **The two open flanks are unchanged by W2-S2:** the 91 plaintext `Documents/SaagarBCC-Backups/` snapshots (R0-W3 co-requisite) and the native-LS frozen plaintext snapshot (OD-3). Keystore on `bcc.sqlite` protects nobody who has the device until R0-W3 also ships.

**Net:** Keystore moves this from "defense-in-depth, theatre against an extractor" to "genuine extraction resistance against file-copy attackers, on API-23+ TEE/StrongBox devices, with the Documents/native-LS flanks still open until R0-W3." That is a real, defensible upgrade — claim exactly that and no more.

---

## 3. THE NATIVE PLUGIN — `SaagarKeystore` (custom, platform-API-only, offline-safe)

**KEK:** AES-256-GCM, alias `saagar_dek_kek_v1`, generated on first use in `AndroidKeyStore`, `setUserAuthenticationRequired(false)` (boot reads storage before any PIN — auth-bound KEK would deadlock the boot, same structural reason PIN-keys were rejected in contract §1.4), non-exportable, `setRandomizedEncryptionRequired(true)`. Try StrongBox on API 28+ and catch `StrongBoxUnavailableException` → retry without it (documented required pattern).

**JS-facing contract (three methods):**
```
SaagarKeystore.wrapKey({ dek: <b64 of 32 raw bytes> })
   → { wrapped: <b64 of iv(12) || ciphertext+tag>, backing: 'strongbox'|'tee'|'software' }
SaagarKeystore.unwrapKey({ wrapped: <b64> })
   → { dek: <b64 of 32 raw bytes> }
SaagarKeystore.isAvailable()
   → { available: bool, apiLevel: int, backing: 'strongbox'|'tee'|'software'|'none' }
```
Native sketch (Java, `@CapacitorPlugin(name="SaagarKeystore")`, methods take `PluginCall`, wrap `Cipher.getInstance("AES/GCM/NoPadding")` with the AndroidKeyStore key; `wrapKey` returns `cipher.getIV()||doFinal(dek)`; `unwrapKey` inits DECRYPT with `GCMParameterSpec(128, iv)`). Determine `backing`: on API 31+ use `KeyInfo` + `getSecurityLevel()`; on 23–30 use `KeyInfo.isInsideSecureHardware()` → tee/software.

**Registration + durability:** `MainActivity.java` must become
```
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle s){ registerPlugin(SaagarKeystore.class); super.onCreate(s); }
}
```
Both `SaagarKeystore.java` and this MainActivity edit must be **stamped in by `build-overrides/apply-overrides.js` after `cap sync`** (new override alongside the manifest patch), because `android/` regenerates. Ship the canonical `SaagarKeystore.java` under `build-overrides/native/` and have the script copy it into `android/app/src/main/java/com/saagartraders/bcc/` + patch MainActivity idempotently. **This is the single biggest new build-pipeline risk — call it out in the wave notes and DT it (an un-re-applied override = plugin absent = silent plaintext fallback, which is exactly the fail-open path, so it degrades safely but must be caught).**

---

## 4. `storage-core.js` — the `loadKey` → `getDEK` REWORK (exact new flow)

Current live code to replace: `KEY_FILE='bcc.key'` (`:80`), `_keyP` + `loadKey` (`:103-126`). New:

```js
    var DEK_FILE   = 'bcc.dek';          /* wrapped-DEK blob (NOT raw key). Renamed from bcc.key so a
                                            raw-key file can never be mistaken for a wrapped one. S1 shipped
                                            inert (flag off) → bcc.key was NEVER created in production, so
                                            no migration needed; a stray test-APK bcc.key is simply ignored. */
    function keystorePlugin() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SaagarKeystore) || null; } catch (e) { return null; } }
    var _encState = STORAGE_ENCRYPT_ENABLED ? 'pending' : 'plaintext-flag-off';
    function importRawDEK(b64) { return window.crypto.subtle.importKey('raw', b64ToBytes(b64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }

    /* _dekP memoizes ONLY a promise that RESOLVES TO A REAL CryptoKey. Any null resolution clears the
       cell so the next call retries — this is the W2-S2 fix for the sticky-null memo (precondition #1):
       a reader getDEK(false) while bcc.dek is absent must NOT pin a later writer getDEK(true) to null. */
    var _dekP = null;
    function getDEK(createIfMissing) {
      if (_dekP) return _dekP;
      var FS = FSplugin();
      if (!FS || !subtleOK()) return Promise.resolve(null);            /* not cached */
      var KS = keystorePlugin();
      var p = FS.readFile({ path: DEK_FILE, directory: dataDir() })
        .then(function (r) { return (r && r.data) ? r.data : null; })   /* wrapped-DEK b64, or null */
        .catch(function () { return null; })
        .then(function (wrappedB64) {
          if (wrappedB64) {                                            /* UNWRAP path — reader AND writer */
            if (!KS) { log('keystore plugin absent — cannot unwrap DEK'); _encState = 'plaintext-no-keystore'; return null; }
            return KS.unwrapKey({ wrapped: wrappedB64 })
              .then(function (res) { _encState = 'encrypted-keystore'; return importRawDEK(res.dek); })
              .catch(function (e) { log('DEK unwrap failed: ' + (e && e.message)); _encState = 'plaintext-no-keystore'; return null; });
          }
          if (!createIfMissing) return null;                           /* reader, no file yet → null (NOT cached) */
          if (!KS) { log('keystore plugin absent — DEK not minted (plaintext persist)'); _encState = 'plaintext-no-keystore'; return null; }
          var dek = new Uint8Array(32); window.crypto.getRandomValues(dek);   /* MINT + WRAP + atomic write, await BEFORE first ciphertext */
          return KS.wrapKey({ dek: bytesToB64(dek) })
            .then(function (res) {
              _encState = res.backing ? ('encrypted-keystore-' + res.backing) : 'encrypted-keystore';
              return FS.writeFile({ path: DEK_FILE + '.tmp', data: res.wrapped, directory: dataDir() })
                .then(function () { return FS.rename({ from: DEK_FILE + '.tmp', to: DEK_FILE, directory: dataDir() }); })
                .then(function () { log('DEK minted + keystore-wrapped (' + _encState + ')'); return importRawDEK(bytesToB64(dek)); });
            })
            .catch(function (e) { log('DEK wrap/create failed: ' + (e && e.message) + ' — plaintext persist'); _encState = 'plaintext-no-keystore'; return null; });
        });
      /* memoize ONLY on a real key; clear on null so absence is never sticky (precondition #1 fix) */
      _dekP = p.then(function (key) { if (!key) _dekP = null; return key; },
                     function ()    { _dekP = null; return null; });
      return _dekP;
    }
```

**Callers change name only** (`loadKey(true)`→`getDEK(true)` in `encryptForPersist` `:130`; `loadKey(false)`→`getDEK(false)` in `decryptIfEnveloped` `:144`). Their fail-open bodies are unchanged and already correct: `encryptForPersist` `:131` `if(!key){... plaintext ...}` and `:138` terminal `.catch → plaintext`; `decryptIfEnveloped` `:145` `if(!key){... null}` and `:150` self-contained never-throw catch (keep it — precondition #4). **MEM never holds ciphertext** stays structurally true: MEM is fed only by `open()`-validated (`PRAGMA quick_check` `:381`) plaintext.

**E6 resetAll** (`:433`): change the key-wipe to delete `DEK_FILE`(+`.tmp`) and `_dekP = null`. Optionally also call `SaagarKeystore.deleteKek?()` if you add a delete method — recommended so Factory Reset destroys the KEK too (matches `allowBackup=false` intent); but the wrapped DEK file deletion alone already makes any surviving KEK unusable, so KEK deletion is defense-in-depth, not required.

---

## 5. E3 persist() INTEGRATION (async wrap/unwrap inside the mutex; `through=_seq` stays synchronous)

The S1 wiring at `persist()` `:246` already does this correctly and **needs no structural change** — only `encryptForPersist` now transitively awaits `getDEK`→`SaagarKeystore.unwrap/wrap`. The invariants hold:

- `:246` `try { through = _seq; b64 = bytesToB64(db.export()); }` — **stays fully synchronous before any await**, so `clearWALThrough(through)` (`:253`) can never clear a WAL entry newer than the snapshot (§13.1/§13.2). The one refinement per contract E3: snapshot `raw = db.export()` sync and move `bytesToB64`/encrypt into the chain so the async encrypt sits after the `.bak` promote:
  ```
  ... .then(function () { return encryptForPersist(raw); })
      .then(function (b64) { return FS.writeFile({ path: DB_FILE + '.tmp', data: b64, directory: dir }); })
  ```
- **The `_persisting` single-flight mutex (`:242,244,255-260`) now also spans the Keystore round-trip** — this is exactly what you want: only one wrap/unwrap-and-write in flight; a flush requested mid-persist sets `_persistAgain` and shares `_persistP` (`:242,257`). The Keystore IPC (~single-digit ms) is trivial next to the existing `db.export()`+b64.
- `encryptForPersist` self-catches to plaintext (`:138`), so it can never reject out of the chain; if it somehow did, it lands in the existing `:254` failure handler ("persist failed … WAL kept") — durability posture identical to today.
- **`through`/`_seq` is captured BEFORE `getDEK`'s first `await`** — verify in adversarial review that no `_seq` mutation can interleave (it can't: `appendWAL` bumps `_seq` synchronously on the caller thread; JS is single-threaded; the snapshot line runs to completion before yielding). H9 holds.

**E5 forced second persist** (contract `:167`, live block `:406-411`): after first encrypted persist succeeds, `if (STORAGE_ENCRYPT_ENABLED && ok) { _dirty=true; flush(); }` once (guarded boolean) so `.bak` becomes ciphertext within seconds. Unchanged by Keystore.

---

## 6. PLUGIN-ABSENT / OLDER-SHELL / WEB FAIL-OPEN (must be explicit)

- **`keystorePlugin()` null** (old shell that predates the plugin, web preview, or an un-re-applied `apply-overrides` build): `getDEK` → `_encState='plaintext-no-keystore'`, returns null → `encryptForPersist` writes plaintext, logged. App fully functional. This is the *primary* fail-open path and is why the whole thing is safe to ship progressively.
- **Reader with an existing wrapped `bcc.dek` but plugin now absent** (e.g., encrypted on new shell, then a rollback APK without the plugin): `unwrapKey` can't be called → null → recovery chain → native-LS re-migration. Data as of first-C-boot survives; post-encryption deltas restorable from JSON backup. This is a real rollback hazard **new to Keystore custody** (a raw-key-file build could still decrypt; a plugin-absent build cannot). **Flag it as a rollback constraint: once encrypted with Keystore, you cannot roll back to a pre-plugin shell without data-delta loss** — rollback must be flag-off-with-plugin-present (reader still unwraps, next persists write plaintext), not plugin removal. Add to the wave's rollback recipes and DT-S3.
- **Expose state:** add `encState: _encState` to `SaagarStore._status()` (`:481`) and surface it in the Settings→About diagnostics the W2-S0 probe already lives near, so the owner can *see* "encrypted-keystore-tee" vs "plaintext-no-keystore" on the real device.

---

## 7. PRECONDITIONS RESOLVED / CARRIED

- **#1 `_keyP` sticky-null → FIXED** by the "memoize only on real key, clear on null" pattern in §4 (`_dekP`). Reader-then-writer no longer pins to null.
- **#2 envelope version byte** — still applies to the **DB envelope** (`decryptIfEnveloped` `:146` reads `iv=subarray(6,18)` with no `u8[5]` dispatch). Branch the reader on `u8[5]`: `0x01`→current parse; unknown→distinct log + null. Keystore custody does **not** change the DB envelope version (still `0x01`) — the DEK-wrap blob has its own independent `iv||ct` mini-format handled entirely in native + `getDEK`.
- **#3 length threshold** (`isEnvelope>=18` vs E7 sqlite-store `>5`) — optionally align to `>=18`; both fail-safe. No change from Keystore.
- **#4 `decryptIfEnveloped` terminal never-throw catch** (`:150`) — KEEP; new `getDEK` unwrap/wrap call sites follow the same discipline (every `.catch → null`, no throw escapes).

---

## 8. NEW / CHANGED OWNER DECISIONS

- **OD-K1 (raise minSdk 22→23?)** — recommend YES unless a confirmed API-22 target device exists (check the MEMORY "older v2 device" API level). Removes the silent-plaintext-on-22 class.
- **OD-K2** — if minSdk stays 22, accept documented plaintext fallback on API-22 devices (`encState='plaintext-no-keystore'`, visible).
- **OD-K3 (KEK auth-binding)** — recommend `setUserAuthenticationRequired(false)` (boot precedes PIN; auth-bound KEK deadlocks boot). Confirm the owner accepts that the DEK is unwrappable by the app without a per-open user prompt (the confidentiality boundary is "device + app," not "device + app + fresh auth").
- **OD-K4 (rollback constraint)** — owner acknowledges: post-Keystore-encryption, rollback must keep the plugin present (flag-off), not remove it; plugin-removal rollback loses post-encryption deltas (restorable from JSON backup only).
- **OD-K5 (build-pipeline)** — owner/CI acknowledges the `apply-overrides.js` native-plugin re-stamp is now load-bearing; a missed re-apply = silent plaintext (safe-degrading but must be DT-checked each build).
- Carry OD-2/3/4/5/6 from the original contract unchanged. **R0-W3 remains a co-requisite** — Keystore on `bcc.sqlite` is undermined by 91 plaintext Documents backups; do not claim "encrypted at rest" to third parties until R0-W3 ships.

---

## 9. DEVICE-ONLY / CANNOT-VERIFY-OFF-DEVICE (honesty)

`FSplugin()` AND `SaagarKeystore` are both null in the headless harness — the entire wrap/unwrap/encrypt path **literally cannot execute off-device**. Everything above is a paper design. What headless CAN check: flag-off/plaintext byte-identity, the `_dekP` sticky-null logic in isolation, envelope round-trip with a mocked plugin. What ONLY the device proves: that `AndroidKeyStore` AES/GCM works on the owner's specific device + backing tier; the kill-matrix (force-stop between DEK-wrap-write and first ciphertext-write — H3, now with an extra IPC in the window); boot-with-encrypted-DB timing under BOOT_TIMEOUT_MS with the added unwrap IPC; and the **older v2 device** (Slice-C proved v2 devices diverge; a v2 device on API 22 would be the decisive plaintext-fallback test). Add to the DT-S2 matrix: (a) `isAvailable()` backing tier recorded on both devices; (b) unwrap-failure injection (adb-delete `bcc.dek`, or corrupt it) → recovery chain; (c) KEK-invalidation simulation if feasible. No go/no-go can be issued from this design alone — it is device-gated.

**Files that would change (for the build wave, not now):** `www/storage-core.js` (getDEK rework, DEK_FILE, encState, E3/E5/E6 already-anchored), `build-overrides/native/SaagarKeystore.java` (new), `build-overrides/apply-overrides.js` (copy plugin + patch MainActivity), and — via the override, not the git tree — `android/.../MainActivity.java`. `www/sqlite-store.js` E7 guard is unaffected (sniffs SBCC1 file bytes, independent of DEK custody). All 11 module blobs + index.html + integration-bridge + auto-backup + demo-seed: **zero edits** (E8 fence holds).