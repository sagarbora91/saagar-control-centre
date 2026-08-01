All anchors verified against live code, including one correction to the recon: the manual backup's raw `.sqlite` sibling download (index.html:5773-5775) calls `window.SaagarDB.raw()` then `__db.export()` — it exports the **in-memory** DB, not the disk file, so whole-file encryption does NOT break it (it remains a plaintext-residue item, not a breakage). The contract below reflects that.

---

# R0-W2 BUILD CONTRACT — At-Rest Encryption of `bcc.sqlite` (Option W: whole-file envelope)

**Status: CONTRACT ONLY. Zero edits made. Execution gated on (a) the owner's device-test gate clearing, (b) the owner decisions in §6, (c) the W2-S0 device probe passing.**
All anchors below were re-verified verbatim against the working tree on 2026-07-17 (this session read `storage-core.js` in full, `sqlite-store.js:1-175`, `auto-backup.js:28-142`, `index.html:2143-2201, 5763-5800, 7438-7456`). Anchor drift rule: at build time, every quoted anchor MUST be re-matched exactly before editing; if any line has moved, STOP and re-map — do not fuzzy-match (a prior multi-agent audit shipped a wrong fix by trusting a stale map).

---

## 1. HONEST THREAT VERDICT (read this to the owner before anything is built)

**What this wave CAN honestly deliver:** `bcc.sqlite` (+`.tmp`/`.bak`) in the app-private `DATA` dir becomes AES-256-GCM ciphertext, with the key in a separate `DATA` file. This defeats: casual copying of the DB file through any future channel that exposes `DATA` file contents (OS bugs, misdirected shares, forensic "grab the obvious file" passes, a future backup channel that copies DATA), and makes the DB file useless without also taking the key file.

**What it CANNOT deliver, stated plainly:**

1. **Against an attacker with full `DATA` access (root, physical extraction), a key file sitting next to the ciphertext is security theatre.** The key and the lock are in the same drawer. There is no Keystore/secure-storage plugin installed (`package.json` deps are exactly: android, app, core, filesystem, local-notifications, share) and "no new libs" forbids adding one — hardware-backed custody requires an owner-signed rule-bend (precedent: the Slice C attempt-key rule-bend). Without it, this wave is **defense-in-depth, not protection from a determined extractor**, and must be labelled as such in any owner-facing claim.
2. **The single largest real-world exposure is untouched by this wave:** `auto-backup.js` writes up to 91 full-plaintext JSON snapshots of ALL business data to **shared** `Documents/SaagarBCC-Backups/` daily (`auto-backup.js:86-94` `directory:'DOCUMENTS'`; `:138-139` daily + `latest.json`; 90-day retention `:31`). Readable by any file manager, no root, survives uninstall. Encrypting `bcc.sqlite` while these exist protects against nobody who has the device. **R0-W3 (backup hardening) is a co-requisite of any honest "encrypted at rest" claim, not a follow-up.** This wave must ship with that sentence said out loud.
3. **Native localStorage keeps a full plaintext copy** of all business data as of first C-boot (the frozen migration snapshot, `storage-core.js:99-103, 237-240`), on disk in the WebView leveldb. It is also the load-bearing catastrophic-recovery source (`:279-283`) and the pre-ready boot read path (`:225`, `index.html:7438-7456`). Retiring it is a separately-gated, owner-signed step (§6 OD-3) — NOT part of the core slices.
4. **PIN-derived keys are rejected** (mapped for completeness): PIN is optional/fail-open (Slice C posture, `index.html:2201` `hasAdminPin()`), 4-6 digit entropy is minutes to brute offline, forgotten PIN = permanent data loss (violates availability-first), and boot reads storage before any PIN entry — structural contradiction, not tunable.
5. **What already protects the data today:** Android app sandbox + `android:allowBackup="false"` (`AndroidManifest.xml:5`) + device lock. This wave adds a layer on top of that; it does not replace it.

**Verdict:** proceed only with the honest framing — "DB file unreadable if copied off-device without the key file; not protection against full-device extraction; Documents backups remain the open flank until R0-W3." If the owner wants real extraction resistance, that is OD-1 (Keystore plugin rule-bend), a different and larger wave.

---

## 2. RECOMMENDED DESIGN

| Aspect | Decision | Why |
|---|---|---|
| **Layer** | Whole-file envelope: encrypt the `db.export()` bytes as ONE unit at the persist/boot file boundary. Never per-kv-value. | Every consumer reads synchronously (`SP.getItem`, storage-core.js:225; iframe shim index.html:6683-6692; integration-bridge/demo-seed/auto-backup raw sync LS). WebCrypto has no sync API → **MEM must hold plaintext forever**. The only async seams are `persist()` and `rd()`. Also: per-value schemes are provably unsafe here — three independent replayers (WAL replay :146, `.bak` adoption :318, native-LS re-migration :279-283) can inject plaintext after any marker is set. |
| **Cipher** | AES-256-GCM via `crypto.subtle`, fresh 12-byte IV per persist from `getRandomValues`. | Platform API, not a lib (`capacitor.config.json` `androidScheme:"https", hostname:"localhost"` = secure context; app already uses `getRandomValues` at index.html:2188). GCM gives integrity: tampered/wrong-key ciphertext fails the tag → clean decrypt failure. Must still be device-probed (W2-S0) — headless cannot verify the WebView. |
| **Envelope format** | Raw bytes: `"SBCC1"` (5 ASCII bytes) + version byte `0x01` + 12-byte IV + GCM ciphertext(+tag). Then b64 via the existing `bytesToB64` and stored exactly as today (`FS.writeFile data: b64`). | Content-sniffing: readers branch on the first bytes — `"SQLite format 3\0"` = legacy plaintext, `"SBCC1"` = envelope, anything else = corrupt. **No `saagar_storage_encrypted` marker, ever** — gate on file content only, so every crash combination (live=cipher/.bak=plain, live=plain/.tmp=cipher, …) is self-healing. |
| **Key source** | Random 256-bit key, generated once on first encrypted persist, stored as b64 in a new file `bcc.key` in `DATA` (written atomically `.tmp`→rename), loaded at boot via `subtle.importKey('raw', …, extractable:false)`. Memoized promise `getKeyP()`. | Only no-plugin option that keeps the fail-open posture. Key dies with uninstall/factory-reset — same lifecycle as the DB itself and consistent with `allowBackup=false`. Cross-device/reinstall recovery = the JSON backups (plaintext, by design, until R0-W3) — so **backups become mandatory discipline**; say so to the owner. |
| **Key-loss behavior (fail-open)** | Missing/wrong key vs ciphertext → decrypt fails → `rd()` returns null / `open()` fails → the EXISTING recovery chain (:313-322) falls through → fresh DB → `reconcile()` re-migrates from the native-LS safety copy (:279-283). Data as of first C-boot survives; post-migration writes are lost (bounded by backups). MUST log distinctly: `'decrypt failed (key/tag) on <file>'` — never silently indistinguishable from corruption. | Availability primacy. Key loss is degraded, never a brick, and never a ciphertext-in-MEM session (MEM only ever receives `open()`-validated plaintext). |
| **Key-durability ordering** | On first encrypted persist: write + rename `bcc.key` and AWAIT success BEFORE writing the first ciphertext DB file. If key write fails → fall back to writing plaintext this persist (log it), retry key next persist. | A crash after cipher-live exists but before the key is durable = undecryptable DB (survivable only via native-LS re-migration). Ordering removes the window. |
| **Two flags, not one** | New build-time flag `STORAGE_ENCRYPT_ENABLED` (default `false` until W2-S4), independent of `STORAGE_CORE_ENABLED`. It gates **writes only**. The decrypting READER is always active in an encryption-capable build. | This is the rollback story: flip the flag off → reader still decrypts → next two persists write plaintext → files are back to pre-W2 state without data movement. Asymmetric read/write capability is what makes "flag off must always work" true. |
| **Migration** | **Passive, zero rewrite.** First encrypted boot: `rd()` sniffs plaintext, opens as-is; first `persist()` writes ciphertext; the existing `.bak` rotation (:179-181) promotes the last plaintext live to `.bak`. Then force ONE extra persist (`_dirty=true; flush()`) after the first encrypted persist succeeds, so live AND `.bak` are both ciphertext. One plaintext `.bak` generation exists for seconds. Chunking is a non-question — there is no per-key rewrite, so the ANR lesson (bulkAsync exists because per-chunk export force-closed a phone, :394-398) is satisfied for free: encryption adds ONE async `subtle.encrypt` call and zero new synchronous serialize (the heavy sync `db.export()`+`bytesToB64` already exist today). |
| **WAL** | **Untouched.** `saagar_storage_wal` keeps inline plaintext values ≤50KB in native LS (:116). Sync-write durability (nSet :129) cannot use async WebCrypto; forcing all-pointer mode (`big:1` for everything) would force a prompt persist per write — the exact ANR class bulk() exists to prevent. Accepted bounded residual: ≤512KB (:70), erased through the persisted seq at each persist (:184), window ≈ SAVE_DEBOUNCE 6s. Owner accepts in OD-2. |
| **Native-LS snapshot** | **Untouched in core slices.** Retirement = optional owner-gated W2-S5 (deferred, recommend after R0-W3), with its own one-way marker + decrypt-rehydrate rollback recipe. | It is the recovery net for key-loss AND corrupt-DB AND the pre-ready sync boot reads (index.html:7438-7456). Deleting it in the same wave that introduces a new failure mode (key loss) is how you get crash-day 4. |
| **sqlite-store.js** | One guard: envelope-sniff → refuse to adopt/overwrite. The ONLY edit outside storage-core.js. | Flag-off (`STORAGE_CORE_ENABLED=false`) wakes sqlite-store (its stand-down at :29 no longer fires); its loader does a naive `new SQL.Database(bytes)` with a try/catch → "starting fresh" (:161-162) and would then **overwrite the ciphertext with a plaintext DB built from stale native LS** via `save()` (:91, single non-atomic writeFile). That is the rollback-brick vector; the sniff closes it. |
| **Boot timeout** | `BOOT_TIMEOUT_MS` 6000 (:64) unchanged initially; W2-S0 measures decrypt cost on the real device with a 10-15MB blob. AES-GCM at that size is expected tens-of-ms (the b64/atob conversions dominate and exist today), but the number comes from the device, not from expectation. If measured headroom < 2× → raise via the existing `window.__BOOT_TIMEOUT_MS` override pattern (:68) as its own reviewed change (OD-7). | Timeout blow → `bootTimeoutFallback` (:299) serves the plaintext native Step-0 mirror then late-heals (:330-335) — pre-existing semantics, unchanged. |
| **Untouched, verified-unaffected surfaces** | Backup/restore (`restoreValidatedBackup` via `SaagarStore.bulk`, index.html:5944 / storage-core.js:387-393 — values plaintext at the JSON layer, validators parse raw JSON, :5824ff — REQUIRED to stay plaintext there), auto-backup (reads MEM → plaintext, valid flag-off restore material), raw `.sqlite` manual export (in-memory `SaagarDB.raw().export()`, index.html:5773-5775 — works unchanged, stays plaintext by design as a user-initiated export), `SaagarDB.query/raw` (in-memory plaintext by design, :426-428), demo-seed, integration-bridge, iframe shim, all 11 module blobs (byte-identical). SaagarEvidence IndexedDB + future photo-store files: explicitly OUT of W2 scope (OD-6). | |

---

## 3. EXACT-ANCHOR EDIT PLAN

All edits in `V:\Co work\Projects\Retail\saagar-control-centre\www\storage-core.js` except E7. Line numbers per the current file (435 lines); re-verify each quoted anchor before editing.

### E1 — flag + constants (insert after line 70)
Anchor (L69-70):
```js
    var WAL_BIG = 50000;                /* §13.1 'set' values larger than this are journaled as a pointer (forces a prompt persist) */
    var WAL_MAX = 512000;               /* §13.1 byte cap on the WAL JSON so it can never approach the native-LS quota */
```
Insert:
```js
    /* ── R0-W2 at-rest encryption (whole-file envelope; MEM stays plaintext) ──
       STORAGE_ENCRYPT_ENABLED gates WRITES only — the reader below ALWAYS sniffs
       and decrypts SBCC1 envelopes, so flag-off = next persists write plaintext
       back in place (rollback recipe, no data movement). No marker key: readers
       trust file CONTENT only (SQLite magic vs SBCC1). */
    var STORAGE_ENCRYPT_ENABLED = false;   /* W2-S4 flips to true after the DT matrix passes */
    try { if (typeof window !== 'undefined' && window.__FORCE_STORAGE_ENCRYPT === true) STORAGE_ENCRYPT_ENABLED = true; } catch (e) {}
    var KEY_FILE = 'bcc.key';
    var ENV_MAGIC = [0x53, 0x42, 0x43, 0x43, 0x31];   /* "SBCC1" */
    var SQLITE_MAGIC = 'SQLite format 3';             /* first 15 bytes + \0 */
```

### E2 — crypto helpers (insert after `b64ToBytes`, line 82)
Anchor (L82): `function b64ToBytes(b64) { … }`
Insert sketch:
```js
    function subtleOK() { try { return !!(window.crypto && window.crypto.subtle); } catch (e) { return false; } }
    function isEnvelope(u8) { if (!u8 || u8.length < 18) return false; for (var i = 0; i < 5; i++) if (u8[i] !== ENV_MAGIC[i]) return false; return true; }
    function isSqlite(u8) { if (!u8 || u8.length < 16) return false; for (var i = 0; i < 15; i++) if (u8[i] !== SQLITE_MAGIC.charCodeAt(i)) return false; return true; }
    var _keyP = null;                                  /* memoized CryptoKey promise */
    function loadKey(createIfMissing) {
      if (_keyP) return _keyP;
      var FS = FSplugin();
      if (!FS || !subtleOK()) return Promise.resolve(null);
      _keyP = FS.readFile({ path: KEY_FILE, directory: dataDir() })
        .then(function (r) { return r && r.data ? b64ToBytes(r.data) : null; })
        .catch(function () { return null; })
        .then(function (raw) {
          if (!raw && !createIfMissing) return null;
          var p = raw ? Promise.resolve(raw)
            : (function () {                            /* generate + write ATOMICALLY, await BEFORE first ciphertext */
                var nk = new Uint8Array(32); window.crypto.getRandomValues(nk);
                return FS.writeFile({ path: KEY_FILE + '.tmp', data: bytesToB64(nk), directory: dataDir() })
                  .then(function () { return FS.rename({ from: KEY_FILE + '.tmp', to: KEY_FILE, directory: dataDir() }); })
                  .then(function () { log('encryption key created'); return nk; });
              })();
          return p.then(function (bytes) {
            return window.crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
          });
        })
        .catch(function (e) { _keyP = null; log('key load/create failed: ' + (e && e.message)); return null; });
      return _keyP;
    }
    /* encrypt raw DB bytes → b64 envelope string; ANY failure falls back to PLAINTEXT write (fail-open, logged) */
    function encryptForPersist(raw) {
      if (!STORAGE_ENCRYPT_ENABLED || !subtleOK()) return Promise.resolve(bytesToB64(raw));
      return loadKey(true).then(function (key) {
        if (!key) { log('encrypt skipped — no key (plaintext persist)'); return bytesToB64(raw); }
        var iv = new Uint8Array(12); window.crypto.getRandomValues(iv);
        return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, raw).then(function (ct) {
          var c = new Uint8Array(ct), out = new Uint8Array(6 + 12 + c.length);
          out.set(ENV_MAGIC, 0); out[5] = 0x01; out.set(iv, 6); out.set(c, 18);
          return bytesToB64(out);
        });
      }).catch(function (e) { log('encrypt failed (' + (e && e.message) + ') — plaintext persist'); return bytesToB64(raw); });
    }
    /* reader: ALWAYS active. plaintext → pass through; envelope → decrypt; failure → null (recovery chain) */
    function decryptIfEnveloped(u8, label) {
      if (!isEnvelope(u8)) return Promise.resolve(u8);   /* plaintext (or junk — open() will reject junk) */
      if (!subtleOK()) { log('decrypt impossible (no subtle) on ' + label); return Promise.resolve(null); }
      return loadKey(false).then(function (key) {
        if (!key) { log('decrypt failed (key missing) on ' + label); return null; }
        var iv = u8.subarray(6, 18), ct = u8.subarray(18);
        return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct)
          .then(function (pt) { return new Uint8Array(pt); })
          .catch(function () { log('decrypt failed (tag/key) on ' + label); return null; });
      });
    }
```
Design notes locked in: (a) encrypt failure NEVER fails the persist — it degrades to plaintext with a log (durability > confidentiality, matching the codebase's universal fail-open posture at :20/:344); (b) decrypt failure returns null → `open()` never sees it → recovery chain (:313-322) proceeds exactly as for corruption, but with a DISTINCT log line; (c) MEM can never contain ciphertext — only `open()`-validated (`PRAGMA quick_check`, :312) plaintext ever reaches it.

### E3 — persist(): move b64 production into the async chain (lines 176-183)
Anchor (L176-178, exact):
```js
      var FS = FSplugin(), dir = dataDir(), through, b64;
      try { through = _seq; b64 = bytesToB64(db.export()); }
      catch (e) { _persisting = false; _lastError = (e && e.message) || 'export'; return Promise.resolve(false); }
```
Becomes:
```js
      var FS = FSplugin(), dir = dataDir(), through, raw;
      try { through = _seq; raw = db.export(); }         /* seq+snapshot stay SYNCHRONOUS — the clearWALThrough(through) invariant (§13.1/§13.2) depends on it */
      catch (e) { _persisting = false; _lastError = (e && e.message) || 'export'; return Promise.resolve(false); }
```
Anchor (L179-183 chain head, exact): `_persistP = FS.copy({ from: DB_FILE, to: DB_FILE + '.bak.tmp', directory: dir })` … `.then(function () { return FS.writeFile({ path: DB_FILE + '.tmp', data: b64, directory: dir }); })`
Becomes (only the writeFile link changes; the `.bak` promote stays first and unmodified):
```js
      _persistP = FS.copy({ from: DB_FILE, to: DB_FILE + '.bak.tmp', directory: dir })
        .then(function () { return FS.rename({ from: DB_FILE + '.bak.tmp', to: DB_FILE + '.bak', directory: dir }); })
        .catch(function () { return null; })
        .then(function () { return encryptForPersist(raw); })                                        /* R0-W2: async encrypt INSIDE the mutex; key durably written before first ciphertext (see loadKey) */
        .then(function (b64) { return FS.writeFile({ path: DB_FILE + '.tmp', data: b64, directory: dir }); })
        .then(function () { return FS.rename({ from: DB_FILE + '.tmp', to: DB_FILE, directory: dir }); })
```
Invariants preserved, verified against the current code: `through = _seq` still snapshotted synchronously before any await (so `clearWALThrough(through)` at L184 never clears a WAL entry newer than the snapshot); the `_persisting` mutex (L173-175) now also covers the encrypt await (single-flight unchanged); an `encryptForPersist` rejection cannot occur (it self-catches to plaintext), but if it ever did it would land in the existing failure handler at L185 ("persist failed … WAL kept") — the durability posture is identical to today's write failure.

### E4 — rd(): decrypt-on-read, always-on (line 306)
Anchor (L306, exact):
```js
        function rd(path) { return FS ? FS.readFile({ path: path, directory: dataDir() }).then(function (r) { return r && r.data ? b64ToBytes(r.data) : null; }).catch(function () { return null; }) : Promise.resolve(null); }
```
Becomes:
```js
        function rd(path) { return FS ? FS.readFile({ path: path, directory: dataDir() }).then(function (r) { return r && r.data ? decryptIfEnveloped(b64ToBytes(r.data), path) : null; }).catch(function () { return null; }) : Promise.resolve(null); }
```
No other boot change: the recovery chain (L314-322) already treats a null/`open()`-failed result as fall-through per file (`live → .tmp → .bak → fresh`), and each file is sniffed independently — mixed cipher/plain generations from any kill point are self-healing. `open()` (L312) with `PRAGMA quick_check` is the post-decrypt validator, unchanged.

### E5 — post-first-encrypted-persist `.bak` rotation (line 337-342)
Anchor (L337-342, the `if (FS) { flush().then(function (ok) { … MIGRATED_KEY … }) }` block). Extend the `.then` — after the existing marker logic — with: if `STORAGE_ENCRYPT_ENABLED && ok`, set `_dirty = true` and call `flush()` once more (fire-and-forget) so `.bak` is promoted to ciphertext within seconds of first encrypted boot instead of lingering plaintext until the next organic write. Guard with a boolean so it runs at most once per boot. (The extra persist is one whole-file write — the same cost as any debounced save; no ANR concern.)

### E6 — resetAll(): wipe the key (line 364)
Anchor (L364, exact):
```js
      if (FS) ['', '.tmp', '.bak', '.bak.tmp'].forEach(function (s) { try { ps.push(FS.deleteFile({ path: DB_FILE + s, directory: dataDir() }).catch(function () {})); } catch (e) {} });
```
Add immediately after:
```js
      if (FS) ['', '.tmp'].forEach(function (s) { try { ps.push(FS.deleteFile({ path: KEY_FILE + s, directory: dataDir() }).catch(function () {})); } catch (e) {} });
      _keyP = null;
```
(Factory Reset destroys the key with the data — matching the reset's intent and `allowBackup=false` semantics.)

### E7 — sqlite-store.js: refuse to clobber ciphertext (file `www\sqlite-store.js`, lines 160-162)
Anchor (L160-162, exact):
```js
      return loadP.then(function (bytes) {
        try { db = bytes ? new SQL.Database(bytes) : new SQL.Database(); }
        catch (e) { log('open existing DB failed (' + (e && e.message) + ') — starting fresh'); db = new SQL.Database(); }
```
Insert as the first statement inside the `.then`:
```js
        /* R0-W2 guard: an SBCC1-encrypted bcc.sqlite means the Option-C engine owned this file.
           NEVER open-as-fresh + write-through here — that would overwrite the ciphertext with a
           plaintext DB built from the stale native-LS snapshot. Stand down entirely (app runs on
           native localStorage exactly as the flag-off contract promises). */
        if (bytes && bytes.length > 5 && bytes[0] === 0x53 && bytes[1] === 0x42 && bytes[2] === 0x43 && bytes[3] === 0x43 && bytes[4] === 0x31) { log('encrypted DB file present — Design-A mirror standing down (no overwrite)'); return; }
```
Returning before `ready = true` / `installWriteThrough()` (L166-167) means no write-through installs and `save()` (gated on `ready && dirty`, L88) can never fire — the ciphertext file is untouched. Flag-off then behaves exactly as today's documented rollback: native-LS stale snapshot, no Design-A mirror (that mirror is a bonus today, not a contract).

### E8 — index.html, module blobs, integration-bridge.js, auto-backup.js, photo-store.js, demo-seed.js: **ZERO edits.** Any diff outside E1-E7 is out of contract and must be rejected in review. All 11 blobs byte-identical (adversarial-verify requirement, same as every prior wave).

### Rollback recipes (ship in the same wave's notes)
1. **Encryption off (primary):** set `STORAGE_ENCRYPT_ENABLED = false` (E1 line), ship. Reader still decrypts; first persist writes plaintext live; E5's forced second persist is skipped (flag off) so `.bak` returns to plaintext on the next organic persist. After two persists the file set is byte-shape-identical to pre-W2. No data movement, no migration step.
2. **Full engine off:** `STORAGE_CORE_ENABLED = false` (L30). Pre-existing semantics, unchanged by this wave: app drops to the frozen native-LS snapshot (post-first-C-boot writes are MEM/DB-only, :240) — ALREADY lossy today; E7 guarantees the encrypted file is at least not destroyed, and the JSON backups (auto-backup + manual, both plaintext from MEM) remain valid restore material for either mode.
3. **Device cannot boot at all:** restore `Documents/SaagarBCC-Backups/latest.json` via the existing restore flow — engine- and encryption-independent by construction (values are plaintext at the JSON layer; `restoreValidatedBackup` → `SaagarStore.bulk` → one encrypted persist).

---

## 4. MICRO-SLICE PLAN (smallest-risk-first; each slice = its own build + device test + owner go)

**W2-S0 — Device probe (no storage-path code touched).** A diagnostics-only addition (Settings → About or a console probe in the existing diagnostics surface) that reports: `!!crypto.subtle` in the shell; `getRandomValues` OK; timed round-trip of `subtle.encrypt`+`decrypt` on a synthetic 15MB Uint8Array; current `bcc.sqlite` size; boot-to-ready time. Zero writes to any storage file. GATE: subtle present AND round-trip < 1000ms (comfortably inside the 6000ms budget alongside today's ~0.3s healthy boot). If subtle is absent on the owner's device, the wave STOPS here.

**W2-S1 — Reader + guard (inert in production).** E1 (flag stays `false`) + E2 + E4 + E7. No ciphertext exists yet, so production behavior is byte-identical (sniff of a plaintext file short-circuits to pass-through with zero async cost beyond what exists). This ships decrypt capability BEFORE any writer can create ciphertext — the classic reader-first ordering that makes every later step reversible.

**W2-S2 — Writer, flag OFF in shipping, ON in a test APK.** E3 + E5 + E6. Ship with `STORAGE_ENCRYPT_ENABLED=false` (still inert); build a parallel test APK with `window.__FORCE_STORAGE_ENCRYPT` (or flag=true) for the full DT matrix on the owner's device with real-scale data.

**W2-S3 — Rollback rehearsal (on the test device, still not shipped).** On the encrypted test device: flip encryption off → verify two-persist return to plaintext; flip engine off → verify E7 stand-down + native-LS session; delete `bcc.key` → verify recovery-chain re-migration; restore from `latest.json` → verify full function.

**W2-S4 — Flag ON in the shipping build.** Only after S2+S3 matrices pass and the owner signs the OD list (§6). This is the "first encrypted boot in production" moment; the passive migration means it is indistinguishable from a normal update boot plus two persists.

**W2-S5 (OPTIONAL, SEPARATELY OWNER-GATED, recommend deferring until after R0-W3) — native-LS business-key retirement.** Own one-way marker (set only after encrypted live AND encrypted `.bak` both verified on-device across two boots), keeps boot-critical non-business keys (PIN hash/salt, admin token, `saagar_ui_mode`, lang, text-size, INTERNAL keys) in native LS so the synchronous `init()` block (index.html:7438-7456) is untouched, and ships its own rollback (decrypt → rehydrate native) recipe. NOT specced further here — it needs its own recon-level pass when reached, because it deletes the recovery net §2 depends on.

---

## 5. DEVICE-TEST CHECKLIST (per slice; headless proves NOTHING here — FSplugin() is null in the harness, so the encrypt path literally cannot execute off-device)

**DT-S0:** probe results recorded (subtle present; 15MB round-trip ms; boot ms). Also confirm probe on the owner's OLDER v2 device (the Slice-C SM-login incident proved v2 devices diverge).

**DT-S1 (reader inert):** 1) upgrade-install over real data → boots normally, all modules read/write, `SaagarStore._status()` healthy, `bcc.sqlite` still plaintext ("SQLite format 3" bytes). 2) Adversarial plant: adb-push (or debug-hook write) a hand-made SBCC1 file with no `bcc.key` → boot logs `decrypt failed (key missing)` → recovery chain → native-LS re-migration → app fully functional. 3) Flag-off build on the same device → sqlite-store logs `encrypted DB file present — standing down`, app runs on native LS, ciphertext file untouched after 10 minutes of use.

**DT-S2 (writer, test APK):** 1) First encrypted boot over real plaintext data → within ~15s both `bcc.sqlite` and `.bak` start with SBCC1; `bcc.key` exists; second boot loads encrypted DB (log shows no fallback), all modules verified (DSR entry, stock, expense, payroll PDF, backup export). 2) Kill matrix (force-stop at each point): mid-first-encrypted-persist; between key-write and first cipher-write; mid-`.bak` promote; mid-rename — every restart must reach `_ready` with data intact via the sniffing recovery chain. 3) Boot time with encrypted 10-15MB DB measured ≥3 runs, worst case < 3000ms (2× headroom under BOOT_TIMEOUT_MS); if not → OD-7. 4) WAL crash test: write a DSR entry, force-stop within the 6s debounce, reboot → entry present (WAL replay over encrypted DB). 5) `bulk` path: demo re-seed / large restore under encryption → no ANR, one persist, data intact. 6) auto-backup fires → `backup-<date>.json` still contains full plaintext values and restores cleanly on a second device. 7) Factory Reset → all 4 DB files + `bcc.key(+.tmp)` gone, evidence wiped, reseed guard honored. 8) Manual backup: JSON + raw `.sqlite` download both produced; the raw `.sqlite` opens in a SQLite tool (it is the in-memory export — plaintext by design). 9) `SaagarDB.query`/report engine spot-check (payroll register PDF renders with data).

**DT-S3 (rollback):** the four rehearsals listed in §4 W2-S3, each ending in a fully functional app; plus reinstall-APK-over-uninstall + restore-from-Documents-backup (the only cross-reinstall artifact) end-to-end.

**DT-S4 (production flag-on):** repeat DT-S2 items 1, 3, 6 on the owner's real device with real data, after a fresh manual backup is confirmed saved OFF-device (WhatsApp/Drive via share sheet) — the wave's own safety net.

---

## 6. OPEN OWNER DECISIONS (block W2-S4; collect signatures like the Slice-C rule-bend)

- **OD-1 — Custody tier.** Accept the device-local `bcc.key` file with the honest §1 framing (defense-in-depth, not extraction-proof)? OR sign a no-new-libs rule-bend for a Keystore/secure-storage plugin (bigger wave, key dies on uninstall → mandatory escrow design, re-recon required)? Default if unsigned: build nothing.
- **OD-2 — WAL residual.** Accept ≤512KB / ~6s-window plaintext values in native-LS WAL? (Alternative — all-pointer mode — re-creates the per-write-persist ANR class; NOT recommended.)
- **OD-3 — Native-LS frozen snapshot.** Confirm it STAYS (full plaintext copy as of first C-boot) as the recovery net for this wave; retirement deferred to W2-S5 after R0-W3. This is the single biggest honesty caveat after the Documents backups.
- **OD-4 — R0-W3 co-requisite acknowledgment.** Owner acknowledges in writing that Documents plaintext backups (91 files, shared storage) remain until R0-W3, and that until then "encrypted at rest" may not be claimed to third parties.
- **OD-5 — Backups become mandatory discipline.** Key loss/device death now means JSON-backup-or-nothing for post-first-boot data; confirm the daily auto-backup + periodic off-device share routine is acceptable as the recovery story.
- **OD-6 — SaagarEvidence IndexedDB + future photo-store files out of W2 scope** (watch/compliance photo blobs stay browser-managed plaintext; revisit when photo-store is wired).
- **OD-7 — Timeout policy.** Pre-authorize raising BOOT_TIMEOUT_MS (to a stated ceiling, e.g. 8000) ONLY if DT-S2 item 3 shows <2× headroom; otherwise unchanged.

---

## 7. HAZARDS REGISTER (3 crash-days front of mind; every mitigation is IN the contract above)

| # | Hazard | Vector | Mitigation (contract §) |
|---|---|---|---|
| H1 | **Ciphertext-in-MEM session** (the brick class: app looks factory-reset, user re-enters data, later persist clobbers) | Any path that puts undecrypted bytes where consumers read | Structurally impossible: MEM is fed only via `open()`-validated plaintext (`PRAGMA quick_check`, :312); decrypt failure yields null → recovery chain, never adoption (E2/E4) |
| H2 | **Flag-off clobber**: sqlite-store opens ciphertext as "corrupt → fresh" and write-through overwrites it with stale-native plaintext | `sqlite-store.js:161-162` + `save()` :91 | E7 sniff-and-stand-down, shipped in W2-S1 BEFORE any writer exists |
| H3 | **Key written after ciphertext** → crash window leaves undecryptable DB | First encrypted persist ordering | loadKey awaits atomic key-file write BEFORE first `subtle.encrypt` result is written (E2); failure degrades to plaintext persist |
| H4 | **Key loss** (file deleted/corrupt) | User/OS/bug | Fail-open: distinct log → recovery chain → native-LS re-migration (OD-3 keeps that net); worst case = post-migration deltas lost, restorable from JSON backups (OD-5) |
| H5 | **Slow decrypt blows BOOT_TIMEOUT_MS** → session on stale native mirror | 6000ms budget, :64/:299 | Pre-existing late-heal (:330-335) unchanged; DT-S2#3 measures with 2× headroom gate; OD-7 escape hatch. Never widen the timeout speculatively |
| H6 | **Mixed cipher/plain file generations after kill** | `.bak` lags live by one (:181); `.tmp` survivors | Content-sniffing per file, no marker (E4) — every combination self-heals; DT-S2#2 kill matrix proves it on-device |
| H7 | **WAL replay "re-polluting" plaintext** | :146-161 replays pre-crash values | Non-issue under Option W: kv values are plaintext BY DESIGN (encryption is file-layer); noted so a future per-value proposal is rejected on sight |
| H8 | **Encrypt failure silently dropping a persist** | subtle throw / key unavailable | E2 self-catches → plaintext write + log; durability posture identical to today; `_lastError`/WAL-kept path (:185) untouched |
| H9 | **Persist-mutex/seq invariant broken by the new await** | `clearWALThrough(through)` clearing entries newer than the snapshot | E3 keeps `through=_seq` + `db.export()` synchronous before any await; mutex (:173) spans the encrypt; explicitly re-verify in adversarial review |
| H10 | **ANR from migration** | The Wave-10-era lesson: per-chunk export force-closed a phone (:394-398) | Passive migration = zero per-key rewrite; adds ONE async encrypt per persist; E5's extra persist is a single ordinary save |
| H11 | **Restore/backup validators fed ciphertext** | `validateRestoreKeyValue` parses raw JSON (index.html:5824ff); manifest recCount (:5693) | Values never encrypted at the JSON/kv layer — file-envelope only; E8 forbids touching these paths |
| H12 | **Headless false confidence** | FSplugin() null in harness → encrypt path cannot run at all off-device | §5 device-only gates; harness may still regression-check that flag-off/plaintext paths are byte-identical |
| H13 | **Anchor drift / wrong-fix repeat** | Prior audit shipped a wrong fix from a stale map | Build wave MUST re-match every quoted anchor exactly (this contract re-verified all of them against the tree on 2026-07-17); any mismatch = stop and re-recon |
| H14 | **File-encoding mojibake** | PowerShell Get-Content/Set-Content round-trip corrupts emoji (memory: harness-utf8 caution) | All edits via byte-exact tooling (Edit tool / module_tool.js pipeline); never PowerShell text round-trips on shell files |
| H15 | **Scope creep into the residue list** | "While we're here" edits to auto-backup/native-LS/evidence | E8 zero-edit fence + OD-3/4/6 make every residue an explicit owner-signed deferral, not an implicit one |

---

**Files referenced (absolute):**
`V:\Co work\Projects\Retail\saagar-control-centre\www\storage-core.js` (E1-E6), `V:\Co work\Projects\Retail\saagar-control-centre\www\sqlite-store.js` (E7), and read-only context: `www\auto-backup.js`, `www\photo-store.js`, `www\index.html`, `capacitor.config.json`, `package.json`, `android\app\src\main\AndroidManifest.xml`.
---

## W2-S2 PRECONDITIONS (from the W2-S1 adversarial pass — 0 P0/P1; these are the deferred P2s, MUST be resolved before flipping the writer flag)

1. **`_keyP` sticky-null memoization (S-1, P2, was #2+#4).** `loadKey` (storage-core.js ~L105 `if(_keyP)return _keyP`) shares ONE memo cell across `createIfMissing` true/false, and the genuine-key-absence path (~L112 `if(!raw&&!createIfMissing)return null`) resolves `_keyP` to a null-resolving promise WITHOUT resetting it (contrast the terminal `.catch` ~L124 which DOES reset on failures). Consequence once the writer is live: a reader `loadKey(false)` that runs while `bcc.key` is absent but an envelope survives (the orphaned-key case) pins a later writer `loadKey(true)` to the cached null → encryption silently stays OFF (durable plaintext) for the rest of the session. Fail-open (no brick, no loss) but defeats encryption with no signal. **FIX in W2-S2:** either do not cache the absence (return null before assigning `_keyP` on the not-found path), or give reader (`false`) and writer (`true`) separate memo cells. INERT in S1 (loadKey never invoked — no envelope can exist).
2. **Envelope version byte not validated on read (S-3, P2, was #12).** `encryptForPersist` writes `out[5]=0x01` (~L135) but `decryptIfEnveloped` reads `iv=subarray(6,18)/ct=subarray(18)` with no dispatch on `u8[5]`. Self-consistent for v1; a future v2 layout would AES-GCM-fail→null→recovery (silently discard a readable file) instead of version-branching. **FIX in W2-S2:** branch the reader on `u8[5]` (v1 → current parse; unknown → distinct log + null).
3. **Length-threshold divergence (S-4, P2, was #7):** `isEnvelope` requires `len>=18`; the E7 sqlite-store guard uses `len>5`. A 6–17-byte SBCC1-prefixed blob is judged differently (both fail-safe: stand-down vs quick_check-reject→recover). Optionally align to `>=18` in W2-S2 for consistency. No data-safety impact.
4. **`decryptIfEnveloped` terminal `.catch` (S-2, P2, was #3) — ALREADY FOLDED in W2-S1** (self-contained never-throw). New W2-S2 writer-side call sites (re-encrypt/verify) must keep the same discipline.

W2-S1 shipped: E1+E2+E4 (storage-core.js) + E7 (sqlite-store.js), INERT reader, `STORAGE_ENCRYPT_ENABLED=false`, `bcc.key` never created. Adversarial 0 P0/0 P1; the S-2 terminal-catch was folded. Envelope format node round-trip 11/11; engine boots clean.



═══════════════════════════════════════════════════════════════
# ADDENDUM B — W2-S2 (Android-Keystore key-wrapping) + R0-W3 (backup hardening)
(Owner decisions 2026-07-18: hardware Keystore custody; R0-W3 folds behind W2. Design wf_8f8a4ff1-8f9. READ-ONLY design.)

Facts locked against the tree: `minSdkVersion = 22` (variables.gradle L2); `apply-overrides.js` today patches **only** AndroidManifest and does **not** stamp any Java — the plugin durability claim (FACT B) is real and load-bearing; MainActivity is a bare `BridgeActivity {}`. Below is the synthesis addendum, ready to append verbatim to `docs/audit/r0w2-specs/R0-W2-BUILD-CONTRACT.md`. No file was edited.

---

# ADDENDUM B — W2-S2 (Keystore key-wrapping writer) + R0-W3 (backup hardening)

Owner decisions locked 2026-07-18 (non-negotiable): **key custody = Android Keystore** (no usable key material beside the ciphertext in DATA); **R0-W3 folds in immediately behind W2**. This addendum supersedes the raw-`bcc.key` custody of W2-S1 and the "key and lock in the same drawer" caveat of §1.1. It is a build-from-scratch spec: a fresh session can implement from this alone. Everything here is **device-only-testable** — see §B8.

Tree facts verified this session (authoritative over any earlier contract text): `android/variables.gradle:2` `minSdkVersion = 22`; `compileSdkVersion = 34`. `android/` is git-ignored and Capacitor-regenerated; `build-overrides/apply-overrides.js` is the existing re-stamp mechanism and today rewrites **only** AndroidManifest (`allowBackup="false"`), copying **no** Java. `MainActivity.java` = `public class MainActivity extends BridgeActivity {}`. Deps carry no secure-storage plugin; build is `gradlew assembleDebug --offline`.

---

## B1. HONEST THREAT VERDICT (say this to the owner verbatim; he is an advocate and wants truth)

Hardware Keystore key-wrapping changes the custody of the DB key from "a usable 32-byte key sitting in the app's DATA folder next to the ciphertext" to "a **wrapped** DEK that only *this specific device's* non-exportable Keystore KEK can unwrap." **What it now protects that raw `bcc.key` did not:** any copy of the DATA directory taken *off the device* — an `adb` pull on a debuggable unit, a forensic flash-chip read, a misdirected share, a future backup channel, a stolen `/data` image — yields `SBCC1` ciphertext plus an `SKW1` wrapped-DEK blob that are **both useless off-device**; the KEK never leaves the TEE (or StrongBox where present) and cannot be exported. **What it still does NOT protect, stated plainly:** (1) a **rooted or live-instrumented device** where an attacker runs code *as the app* — the app is designed to unwrap headlessly at boot, so it can be driven to hand over the DEK; Keystore resists file *extraction*, not an adversary operating the running phone; (2) **key fragility** — the KEK dies on uninstall, factory reset, or a lock-screen-credential change (`KeyPermanentlyInvalidatedException`), after which the wrapped DEK and its ciphertext DB are permanently unrecoverable — recovery is then the plaintext JSON backups or nothing (OD-5); (3) **hardware variance** — StrongBox is API-28+ and rare, most devices give TEE, some give a software-emulated keystore; on **API-22 devices there is no AES Keystore at all**; the plugin reports the true tier so we never claim "hardware-secured" when it is software; (4) **the shared-storage flank** — 91 plaintext `Documents/SaagarBCC-Backups/` snapshots and the frozen native-LS snapshot remain plaintext until R0-W3 lands. **Net defensible claim, and no more:** *"The database file and its key are unreadable if copied off this device. On a running or rooted device, or if the phone's screen-lock is reset, that protection does not apply, and the daily backups stay plaintext until the backup-hardening wave."* Do not claim "encrypted at rest" to any third party until R0-W3 ships — it is a co-requisite, not a follow-up.

---

## B2. NATIVE PLUGIN SPEC — `SaagarKeystore` (custom, platform-API-only, offline-safe)

### B2.1 minSdk gate (the single most load-bearing fact) — OD-K1 / OD-K2

`KeyGenParameterSpec` + symmetric AES in `AndroidKeyStore` is **API 23+**. `minSdkVersion = 22`. On any API-22 device (Android 5.1 — the owner's "v2" fleet has already diverged twice: Slice-C SM-login, Slice-B `prompt()`) the KEK **cannot be generated at all**; `available()` returns false and the JS degrades to plaintext-in-DATA (§B3, same posture as pre-W2-S2).

- **OD-K1 (recommended):** raise `minSdkVersion` 22→23. Removes an entire silent-plaintext device class. **Free** if no confirmed API-22 target device exists — check the MEMORY "older v2 device" actual API level before deciding.
- **OD-K2 (fallback):** keep minSdk 22, accept a documented, owner-visible plaintext fallback on API-22 (`encState='plaintext-no-keystore'`). Not silent (§B3 T2/T3).

StrongBox is API-28+ and hardware-specific; requested with a catch-and-fallback so its absence never bricks.

### B2.2 Files touched by the plugin (durable across `cap sync` — FACT B)

`android/` regenerates on every `cap sync`, reverting `MainActivity.java` to the bare stub and deleting any hand-added Java. Therefore the plugin source **and** its registration must be re-stamped by `apply-overrides.js`, exactly as `allowBackup="false"` is today. Ship the canonical source in the git-tracked tree and have the build script copy + patch:

- **NEW (git-tracked, canonical):** `build-overrides/native/SaagarKeystore.java` (source in B2.3).
- **EDIT (git-tracked):** `build-overrides/apply-overrides.js` — add a step that (a) copies `SaagarKeystore.java` into `android/app/src/main/java/com/saagartraders/bcc/`, and (b) idempotently patches `android/app/src/main/java/com/saagartraders/bcc/MainActivity.java` to the `registerPlugin` form (B2.4). Both operations Node-stdlib only, idempotent, no-op if `android/` absent — mirrors the existing manifest patch.
- **GENERATED (never hand-edited, produced by the override):** `android/.../SaagarKeystore.java`, `android/.../MainActivity.java`.
- **No change:** `capacitor.settings.gradle`, `capacitor.build.gradle`, `AndroidManifest.xml`, `variables.gradle` (unless OD-K1), `package.json`, `capacitor.config.json`.

**OD-K5:** the `apply-overrides.js` native re-stamp is now load-bearing. A missed re-apply = plugin absent = silent plaintext fallback. It degrades **safely** (fail-open path, §B3) but must be DT-checked every build.

**Offline-build confirmation:** the plugin uses only `android.security.keystore.*`, `javax.crypto.*`, `java.security.*`, `android.util.Base64` — all in compileSdk 34 already at `../.android-build/sdk`. **Zero new Maven artifacts, zero gradle-cache change** → `gradlew assembleDebug --offline` stays green. This is precisely why a custom in-app plugin was mandated over a third-party secure-storage npm plugin.

### B2.3 `build-overrides/native/SaagarKeystore.java` (exact source)

Wrapped-DEK format is **self-describing and version-tagged**: `SKW1`(4) + `0x01`(1) + IV(12) + ct/tag — magic distinct from the DB `SBCC1` so an orphaned-but-valid wrapped key is never mistaken for a corrupt file and silently regenerated (§B7 orphan class).

```java
package com.saagartraders.bcc;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SaagarKeystore")
public class SaagarKeystorePlugin extends Plugin {
    private static final String KS_PROVIDER  = "AndroidKeyStore";
    private static final String ALIAS        = "saagar_dek_kek_v1";
    private static final String XFORM        = "AES/GCM/NoPadding";
    private static final int    GCM_TAG_BITS = 128;
    private static final int    IV_LEN       = 12;
    private static final byte[] MAGIC        = new byte[] { 'S','K','W','1' };
    private static final byte    VER         = 0x01;

    private boolean lastStrongBox = false;

    /* available() -> {available, backing, apiLevel, reason}. Never rejects; JS decides policy. */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("apiLevel", Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            r.put("available", false); r.put("backing", "none"); r.put("reason", "api<23");
            call.resolve(r); return;
        }
        try {
            SecretKey k = getOrCreateKek();
            r.put("available", true);
            r.put("backing", backingOf(k));   // strongbox|tee|software
            r.put("reason", "ok");
        } catch (Throwable t) {
            r.put("available", false); r.put("backing", "none");
            r.put("reason", "ks_error:" + t.getClass().getSimpleName());
        }
        call.resolve(r);
    }

    /* wrapKey({data: b64 raw 32-byte DEK}) -> {wrapped: b64(SKW1|ver|iv|ct), backing} */
    @PluginMethod
    public void wrapKey(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { call.reject("api<23", "E_NO_KEYSTORE"); return; }
        String dataB64 = call.getString("data");
        if (dataB64 == null) { call.reject("missing data", "E_ARGS"); return; }
        byte[] dek = null;
        try {
            dek = Base64.decode(dataB64, Base64.NO_WRAP);
            SecretKey kek = getOrCreateKek();
            Cipher c = Cipher.getInstance(XFORM);
            c.init(Cipher.ENCRYPT_MODE, kek);        // Keystore owns the IV (RandomizedEncryptionRequired)
            byte[] iv = c.getIV();                    // read AFTER init
            byte[] ct = c.doFinal(dek);
            byte[] out = new byte[MAGIC.length + 1 + iv.length + ct.length];
            int o = 0;
            System.arraycopy(MAGIC, 0, out, o, MAGIC.length); o += MAGIC.length;
            out[o++] = VER;
            System.arraycopy(iv, 0, out, o, iv.length); o += iv.length;
            System.arraycopy(ct, 0, out, o, ct.length);
            JSObject r = new JSObject();
            r.put("wrapped", Base64.encodeToString(out, Base64.NO_WRAP));
            r.put("backing", backingOf(kek));
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("wrap failed: " + t.getMessage(), "E_WRAP");
        } finally {
            if (dek != null) Arrays.fill(dek, (byte) 0);
        }
    }

    /* unwrapKey({wrapped: b64}) -> {data: b64 raw 32-byte DEK}. Rejects distinctly on orphaned KEK. */
    @PluginMethod
    public void unwrapKey(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { call.reject("api<23", "E_NO_KEYSTORE"); return; }
        String wrappedB64 = call.getString("wrapped");
        if (wrappedB64 == null) { call.reject("missing wrapped", "E_ARGS"); return; }
        byte[] dek = null;
        try {
            byte[] blob = Base64.decode(wrappedB64, Base64.NO_WRAP);
            int hdr = MAGIC.length + 1;
            if (blob.length <= hdr + IV_LEN) { call.reject("blob too short", "E_FORMAT"); return; }
            for (int i = 0; i < MAGIC.length; i++)
                if (blob[i] != MAGIC[i]) { call.reject("bad magic", "E_FORMAT"); return; }
            if (blob[MAGIC.length] != VER) { call.reject("bad version", "E_VERSION"); return; }
            byte[] iv = Arrays.copyOfRange(blob, hdr, hdr + IV_LEN);
            byte[] ct = Arrays.copyOfRange(blob, hdr + IV_LEN, blob.length);
            KeyStore ks = KeyStore.getInstance(KS_PROVIDER); ks.load(null);
            SecretKey kek = (SecretKey) ks.getKey(ALIAS, null);
            if (kek == null) { call.reject("kek alias missing", "E_ORPHAN"); return; } // KEK evaporated
            Cipher c = Cipher.getInstance(XFORM);
            c.init(Cipher.DECRYPT_MODE, kek, new GCMParameterSpec(GCM_TAG_BITS, iv));
            dek = c.doFinal(ct);                      // KeyPermanentlyInvalidated / AEADBadTag land here
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(dek, Base64.NO_WRAP));
            call.resolve(r);
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException e) {
            call.reject("kek invalidated", "E_ORPHAN");
        } catch (Throwable t) {
            call.reject("unwrap failed: " + t.getMessage(), "E_UNWRAP");
        } finally {
            if (dek != null) Arrays.fill(dek, (byte) 0);
        }
    }

    /* ---- internals ---- */
    private SecretKey getOrCreateKek() throws Exception {
        KeyStore ks = KeyStore.getInstance(KS_PROVIDER); ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            SecretKey k = (SecretKey) ks.getKey(ALIAS, null);
            if (k != null) return k;
        }
        return mintKek();
    }

    private SecretKey mintKek() throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try { SecretKey k = generate(true); lastStrongBox = true; return k; }
            catch (StrongBoxUnavailableException ignored) { /* fall through */ }
            catch (Throwable t) { /* OEMs throw plain exceptions for StrongBox absence — fall through */ }
        }
        SecretKey k = generate(false); lastStrongBox = false; return k;
    }

    private SecretKey generate(boolean strongBox) throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KS_PROVIDER);
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // NO setUserAuthenticationRequired(true): boot unwraps headless before any PIN (OD-K3).
                .setRandomizedEncryptionRequired(true);
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) b.setIsStrongBoxBacked(true);
        kg.init(b.build());
        return kg.generateKey();
    }

    private String backingOf(SecretKey key) {
        try {
            SecretKeyFactory f = SecretKeyFactory.getInstance(key.getAlgorithm(), KS_PROVIDER);
            KeyInfo info = (KeyInfo) f.getKeySpec(key, KeyInfo.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                int sec = info.getSecurityLevel();
                if (sec == KeyProperties.SECURITY_LEVEL_STRONGBOX) return "strongbox";
                if (sec == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT) return "tee";
                return "software";
            }
            if (info.isInsideSecureHardware()) return lastStrongBox ? "strongbox" : "tee"; // <31
            return "software";
        } catch (Throwable t) { return "software"; } // unknown -> claim the weaker tier (honest)
    }
}
```

Correctness notes that matter on-device: with `setRandomizedEncryptionRequired(true)` you must NOT pass a `GCMParameterSpec` on ENCRYPT (throws) — read `cipher.getIV()` after `init`; on DECRYPT you must pass the stored IV back (the code does exactly this). Never `setUserAuthenticationRequired(true)` — the DB unwraps at cold boot with no user present; auth-binding would deadlock startup (OD-K3, structural, same reason PIN-derived keys were rejected in §1.4). Class name is `SaagarKeystorePlugin` (file name `SaagarKeystore.java` is fine); the JS resolves it as `window.Capacitor.Plugins.SaagarKeystore` via `@CapacitorPlugin(name="SaagarKeystore")`.

### B2.4 Registration (the form `apply-overrides.js` must idempotently produce)

```java
package com.saagartraders.bcc;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaagarKeystorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

Capacitor 6 in-app registration: `registerPlugin()` **before** `super.onCreate()`. No `capacitor.settings.gradle` change (in-app class, not a Gradle subproject).

---

## B3. JS KEY-PATH REWORK — `www/storage-core.js` (`loadKey` → `getDEK`)

Design principle unchanged from S0: a random 32-byte **DEK** does the fast, proven WebCrypto AES-GCM on the blob (~98ms/15MB). Only the DEK's custody changes — it is Keystore-wrapped, never stored raw. **File rename `bcc.key`→`bcc.dek`** so a legacy raw key can never be mistaken for a wrapped blob; S1 shipped inert (flag off) → `bcc.key` was never created in production, so no migration is needed and any stray test-APK `bcc.key` is simply ignored.

### B3.1 Exact anchors (live line numbers, S1 shipped, origin/main=1877b2f)

- `KEY_FILE='bcc.key'` (L80) → `DEK_FILE='bcc.dek'`.
- `_keyP` + `loadKey()` (L103-126) → replaced by `_dekP` + `getDEK()` below.
- `encryptForPersist` (L128-139): caller `loadKey(true)`→`getDEK(true)`; fail-open body unchanged (L131 `if(!key){…plaintext…}`, L138 terminal `.catch→plaintext`).
- `decryptIfEnveloped` (L141-151): caller `loadKey(false)`→`getDEK(false)`; keep the terminal never-throw catch (L150, PRECONDITION-4).
- `resetAll` E6 (L433): wipe `DEK_FILE`(+`.tmp`) and set `_dekP=null`.
- `SaagarStore._status()` (L481): add `encState: _encState`.

### B3.2 `getDEK` — the sticky-null fix + fail-policy wired

```js
var DEK_FILE = 'bcc.dek';   /* Keystore-WRAPPED DEK (SKW1), NOT raw key material. */
function keystorePlugin(){ try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SaagarKeystore) || null; } catch(e){ return null; } }
var _encState = STORAGE_ENCRYPT_ENABLED ? 'pending' : 'plaintext-flag-off';
function importRawDEK(b64){ return window.crypto.subtle.importKey('raw', b64ToBytes(b64), {name:'AES-GCM'}, false, ['encrypt','decrypt']); }

/* PRECONDITION-1 fix: memoize ONLY a promise resolving to a REAL CryptoKey.
   Any null resolution CLEARS _dekP so the next call retries — a reader getDEK(false)
   while bcc.dek is absent must NOT pin a later writer getDEK(true) to null. */
var _dekP = null;
function getDEK(createIfMissing){
  if (_dekP) return _dekP;
  var FS = FSplugin();
  if (!FS || !subtleOK()) return Promise.resolve(null);          /* not cached */
  var KS = keystorePlugin();
  var p = FS.readFile({ path: DEK_FILE, directory: dataDir() })
    .then(function(r){ return (r && r.data) ? r.data : null; })   /* wrapped-DEK b64 or null */
    .catch(function(){ return null; })
    .then(function(wrappedB64){
      if (wrappedB64) {                                           /* UNWRAP (reader AND writer) */
        if (!KS) { log('keystore plugin absent — cannot unwrap DEK; plaintext persist'); _encState='plaintext-no-keystore'; return null; }
        return KS.unwrapKey({ wrapped: wrappedB64 })
          .then(function(res){ _encState='encrypted-keystore'; return importRawDEK(res.data); })
          .catch(function(e){
            var code = (e && (e.code||e.message)) || '';
            if (String(code).indexOf('E_ORPHAN') >= 0) log('KEK unwrap failed (orphaned) — DEK orphaned; recovery re-migration');
            else log('DEK unwrap failed: ' + (e && e.message));
            _encState='plaintext-no-keystore';
            return null;                                          /* → recovery chain (§B7) */
          });
      }
      if (!createIfMissing) return null;                          /* reader, no file yet → null, NOT cached */
      if (!KS) { log('keystore plugin absent — DEK not minted; plaintext persist'); _encState='plaintext-no-keystore'; return null; }
      var dek = new Uint8Array(32); window.crypto.getRandomValues(dek);   /* MINT+WRAP+atomic write BEFORE first ciphertext (H3) */
      return KS.wrapKey({ data: bytesToB64(dek) })
        .then(function(res){
          _encState = res.backing ? ('encrypted-keystore-'+res.backing) : 'encrypted-keystore';
          return FS.writeFile({ path: DEK_FILE+'.tmp', data: res.wrapped, directory: dataDir() })
            .then(function(){ return FS.rename({ from: DEK_FILE+'.tmp', to: DEK_FILE, directory: dataDir() }); })
            .then(function(){ log('DEK minted + keystore-wrapped ('+_encState+')'); return importRawDEK(bytesToB64(dek)); });
        })
        .catch(function(e){ log('KEK wrap failed ('+(e&&e.message)+') — plaintext persist'); _encState='plaintext-no-keystore'; return null; });
    });
  _dekP = p.then(function(key){ if(!key) _dekP=null; return key; },
                 function(){ _dekP=null; return null; });
  return _dekP;
}
```

Everything downstream keeps its shipped fail-open shape. **MEM never holds ciphertext** stays true: MEM is fed only by `open()`-validated (`PRAGMA quick_check`) plaintext. The `persist()` snapshot line (L246 `through=_seq; b64=bytesToB64(db.export())`) **stays fully synchronous before any await**; per contract-E3, refine to snapshot `raw=db.export()` sync and move `encryptForPersist(raw)` into the `.then` chain after the `.bak` promote — the added Keystore IPC (single-digit ms) rides inside the existing `_persisting` single-flight mutex, so `clearWALThrough(through)` can never clear a WAL entry newer than the snapshot (H9). E5 forced second persist (L406-411) unchanged.

### B3.3 Fail policy — FIRM RULING: **FAIL-OPEN, loud, owner-visible. Never fail-closed, never silent.**

The whole storage contract is durability-primary (a shop POS must never brick; the 3×/~3-day brick scar is why). Keystore adds a *confidentiality intent* on top of a *load-bearing revenue guarantee*; you do not regress the latter for the former. A StrongBox/attestation/OEM hiccup or an orphaned KEK must degrade to plaintext-that-works, not a till that won't record a sale. But **loud**, via three mandatory teeth:

- **T1 — distinct persisted log lines** (to the existing `LOG_KEY` ring), never the generic "plaintext persist": `keystore unavailable — plaintext persist`; `KEK wrap failed (<reason>) — plaintext persist`; `KEK unwrap failed (orphaned) — DEK orphaned; recovery re-migration`.
- **T2 — owner-visible Diagnostics field** `SaagarStore._status().encState`, one of: `encrypted-keystore-strongbox` / `encrypted-keystore-tee` / `encrypted-keystore-software` / `plaintext-no-keystore` / `plaintext-flag-off` / `pending`. Surfaced in the About/Diagnostics panel where the W2-S0 probe lives — the anti-silent-downgrade control.
- **T3 — one-shot persisted degraded flag** `saagar_enc_degraded_v1` (INTERNAL key), set the first time a flag-on session falls back to plaintext, cleared only by a successful encrypted persist — so "it worked when I checked" blindness is impossible across reboots.

Fail-closed is **rejected** as this wave's default (it converts a rare device-specific confidentiality gap into a daily outage) but recorded as a separate signed option: **OD-8**. This is the anti-silent-downgrade ruling; it applies identically to the R0-W3 backup writer.

### B3.4 Preconditions resolved (all live once the writer + wrapping ship)

- **P1 `_keyP` sticky-null** — FIXED by "memoize only on real key, clear on null" (`_dekP`). Doubly important now: unwrap adds an async native reject point; a boot-time reader miss must not pin the session.
- **P2 envelope version-byte dispatch** — still applies to the **DB** envelope: `decryptIfEnveloped` must branch on `u8[5]` (`0x01`→current parse; unknown→distinct log + null). The wrapped-DEK blob carries its **own** independent `SKW1|ver` handled in native + `getDEK`. DB envelope stays `0x01`.
- **P3 length threshold** — align `isEnvelope` (`>=18`) with the E7 sqlite-store guard (`>5`); cosmetic, fold for consistency.
- **P4 terminal never-throw catch** in `decryptIfEnveloped` — KEEP; every new `getDEK` unwrap/wrap call site follows the same `.catch→null`, no throw escapes.

---

## B4. R0-W3 BACKUP HARDENING — recommended option + slice plan + anchors

### B4.1 The irreconcilable tension (state to owner first)

auto-backup's *only* unique value over the on-device stack (`bcc.sqlite`+`.bak`+`.tmp`+native-LS) is that it **survives uninstall and migrates to a new phone**. That property is fundamentally incompatible with device-bound Keystore encryption: a KEK dies on uninstall, so **encrypting the Documents JSON in place is self-defeating** — the ciphertext survives the uninstall it exists to survive but becomes permanently undecryptable. Confidentiality and portability cannot live in one artifact; **split the two roles**.

### B4.2 Recommended design (option D — split the roles)

- **R1 — kill the shared-plaintext auto-writer.** `www/auto-backup.js` target `DOCUMENTS`→`DATA` (`writeFile` L86-94, `pruneOldFiles` L98/L108). Closes both named threats: no longer world-readable; the DATA copy dying on uninstall is now *correct* (it is no longer the migration copy). Drop `KEEP_DAYS` 90→7 (L31; DATA history is redundant with the DB).
- **R2 — encrypt that app-private snapshot** with the same DEK/Keystore envelope, via the reusable `SaagarStore.seal` primitive (§B4.4). Now safe because the file's lifecycle matches the key's. Fail-open to DATA-plaintext + distinct log if seal unavailable (DATA plaintext ≪ Documents plaintext).
- **R3 — off-device/migration recovery = the existing user-initiated manual export/share, plaintext by design, gated, UNTOUCHED** (`exportBackup`/`exportMigration`/`shareBackup`). This is the one deliberate plaintext egress and the correct place for the confidentiality-vs-portability tradeoff to be the *user's explicit, admin-gated choice* — a sealed export could never restore on a new phone.
- **R4 — MANDATORY one-time purge of the 91 legacy plaintext files.** On first run of the hardened build, delete `Documents/SaagarBCC-Backups/backup-*.json` + `latest.json`, **gated behind a modal confirming a fresh off-device backup exists** (own marker, e.g. `bcc_docs_purged`). This is the load-bearing honesty item — shipping R1/R2 while the 91 files sit in shared storage closes nothing. Without R4 the wave is theatre.
- **R5 — restore stays backward-compatible.** `handleRestoreFile` (index.html ~L6049) must still accept plaintext JSON (90 legacy files + all past manual exports) AND sniff `SBCC1`→`SaagarStore.unseal` for the new sealed snapshots. Reuse the storage-core reader; do not re-implement crypto.
- **R6 — convert the silent writer into a loud off-device nudge.** Reword the Attention-Centre items (index.html:3700-3701, which currently advertise the now-removed `Documents/SaagarBCC-Backups/` path) into an escalating "your last OFF-DEVICE backup is N days old — Share to Drive now," driven by a new `lastOffDeviceBackup` marker set in `shareBackup` (~L5978), distinct from `LAST_BACKUP_KEY`.

### B4.3 Exact anchors (re-match at build time — H13 anchor-drift)

`www/auto-backup.js`: A1 target→DATA (L86-94, L98, L108) + `KEEP_DAYS` L31→7; A2 encrypt-on-write at `runBackup` L125-126/L138-139 (guard browser-noop path L129-136). `index.html`: A3 restore sniff/decrypt at `handleRestoreFile` L6049-6053; A4 legacy purge (new routine modeled on `pruneOldFiles` but on DOCUMENTS, user-confirmed); A5 nudge reword L3700-3701 + marker in `shareBackup` ~L5978. **Zero-edit fence:** `exportBackup*`/`exportMigration`/`shareBackup`/`backupPayload`/`validateRestoreKeyValue`/`restoreValidatedBackup` write/validate logic untouched except A3's read-side sniff and A5's marker.

### B4.4 Dependency on W2-S2 — the reusable primitive (hard sequencing)

`encryptForPersist`/`decryptIfEnveloped` are module-private in the storage-core IIFE; auto-backup.js/index.html cannot reach them. W2-S2 MUST expose thin wrappers on the storage-core surface:
- `SaagarStore.seal(u8) → Promise<Uint8Array SBCC1-envelope>` (over `encryptForPersist`, DEK-based, identical SBCC1 format).
- `SaagarStore.unseal(u8) → Promise<Uint8Array|null>` (over `decryptIfEnveloped`).
The DEK-wrapping custody change is transparent to R0-W3 — it only ever calls seal/unseal. **R0-W3 folds in behind W2-S2, not beside it.**

### B4.5 What stays plaintext by design

Manual export/share (user-initiated, admin+re-auth gated, MUST be portable → cannot be sealed); the raw in-memory `.sqlite` export; the PHP/MariaDB migration manifest; kv values inside sealed artifacts (whole-file envelope, never per-field). **Flag to owner:** a plaintext file leaving the device to Drive is now the primary remaining data-at-rest exposure — but it is a deliberate, gated, per-instance user act, not a silent daily dump. Acceptable; make it explicit in sign-off (mirrors OD-4/OD-5).

---

## B5. MICRO-SLICE SEQUENCE (smallest-risk-first; each = own build + device test + owner go)

| Slice | Scope | Flag | Device-test gate before advancing |
|---|---|---|---|
| **W2-S2a** | Ship the native plugin + `apply-overrides` re-stamp + `getDEK` **reader-can-unwrap**, `STORAGE_ENCRYPT_ENABLED` still **OFF**. No production data is encrypted; the plugin, registration, offline build, and `available()` tier reporting are proven inert-safe. | OFF | DT2-1 plugin smoke (wrap/unwrap round-trip, alias created+reused, `available().backing` reported) passes on BOTH devices; offline `assembleDebug --offline` green; `apply-overrides` re-stamps after a `cap sync`; flag-off byte-identity regression holds. |
| **W2-S2b** | `__FORCE_STORAGE_ENCRYPT` test APK: writer path live — mint DEK → `wrapKey` → `bcc.dek`, DB persists as `SBCC1`. Full fail-open/orphan/Diagnostics wiring (T1-T3). | test-forced | Full matrix §B6 PASS on BOTH devices; **DT2-5 (orphaned KEK) and DT2-6 (keystore-unavailable) specifically demonstrate fail-open + loud Diagnostics**; DT2-9 within `BOOT_TIMEOUT_MS` 2× headroom; DT2-11 confirms KEK wipe on data-clear. Owner signs OD-1 (hardware custody), OD-8, OD-K1/K2, OD-K3, OD-K4, OD-K5. Only then does the shipping flag flip. |
| **R0-W3 (W3-S0..S4)** | S0 recon (readdir feasibility, zero writes) → **S1** DOCUMENTS→DATA + retention (no crypto; ship-able without W2) → **S2** legacy 91-file purge (gated) → **S3** encrypt DATA snapshot via `seal`/`unseal` + restore sniff (**requires W2-S2b's primitive**) → **S4** nudge reword. | per-slice | Each slice device-tested; S2 verifies Documents emptied + restore-from-off-device-file still works; S3 round-trips sealed + legacy-plaintext restores. **W3-S1+S2 close both named threats (shared-readability + uninstall-survival + legacy purge) with no crypto and no W2 dependency — the biggest earliest win; can proceed while W2-S2b bakes.** |

---

## B6. DEVICE-TEST MATRIX (device-ONLY; `FSplugin()` and `SaagarKeystore` are both null in the harness → the encrypt path AND the Keystore bridge literally cannot execute off-device). Run every row on the PRIMARY and the OLDER v2 device. Take a fresh off-device backup before each destructive row.

| # | Test | PASS criterion |
|---|---|---|
| DT2-1 | Plugin smoke | `wrapKey`→`unwrapKey` returns identical bytes; alias `saagar_dek_kek_v1` exists after first call and is reused (no new alias); `available().backing` reports strongbox/tee/software truthfully. |
| DT2-2 | Fresh encrypt | Within ~15s `bcc.sqlite`+`.bak` start `SBCC1`; `bcc.dek` is an `SKW1` blob (NOT raw 32 bytes — inspect); Diagnostics `encrypted-keystore-<tier>`. |
| DT2-3 | Key durable BEFORE ciphertext (H3, now spanning the native bridge) | Force-stop during first persist at (a) before `wrapKey` returns, (b) after `bcc.dek` written pre-first-cipher-write, (c) mid `.bak` promote, (d) mid rename → every restart reaches `_ready` with data intact via the sniffing recovery chain; NO undecryptable-DB-without-key state. |
| DT2-4 | Reboot decrypt | Cold reboot loads encrypted DB, no fallback log; DSR/stock/expense/payroll-PDF/backup-export all verified. |
| DT2-5 | **Orphaned KEK brick class** | With `bcc.dek`+`SBCC1` DB present, invalidate the KEK (change lock-screen credential → `KeyPermanentlyInvalidatedException`, or adb keystore reset) → `unwrapKey` rejects `E_ORPHAN` → log `KEK unwrap failed (orphaned)…` (T1) → recovery chain → native-LS re-migration → **app fully functional, NO brick, NO ciphertext in MEM**; Diagnostics degraded (T2/T3); next persist mints a NEW DEK+KEK, writes fresh `SBCC1`. |
| DT2-6 | Keystore-unavailable fail-open | Force `wrapKey`→reject (test hook) → persist SUCCEEDS plaintext; log `keystore unavailable — plaintext persist` (T1); Diagnostics `plaintext-no-keystore` (T2); `saagar_enc_degraded_v1` set (T3); app never blocks a write. |
| DT2-7 | Absent-key + surviving envelope (adversarial plant) | adb-push an `SBCC1` DB with NO `bcc.dek` → log decrypt-failed → recovery chain → re-migration → functional; must NOT spuriously mint a KEK that can't help the planted ciphertext. |
| DT2-8 | Flag-off rollback | Install flag-OFF build on encrypted device → reader still unwraps existing `SBCC1`; next two persists write plaintext (`SQLite format 3`); after two, live+`.bak` plaintext; `bcc.dek`/KEK inert but harmless. |
| DT2-9 | Boot budget @ real scale | Encrypted DB 10-15MB, ≥3 cold runs → worst case <3000ms (2× headroom under `BOOT_TIMEOUT_MS`=6000). Measure the added `unwrapKey` bridge round-trip explicitly; if <2× headroom → OD-7 raise. Especially on v2. |
| DT2-10 | WAL crash over encrypted DB | DSR entry, force-stop within 6s debounce, reboot → entry present (WAL replay over decrypted DB); WAL values plaintext-by-design unaffected. |
| DT2-11 | Factory reset / data-clear wipes BOTH artifacts | All 4 DB files + `bcc.dek`(+.tmp) gone (resetAll E6) AND alias `saagar_dek_kek_v1` gone from keystore — **verify on-device, do not assume**; reseed guard honored. |
| DT2-12 | Bulk/restore under encryption | Demo re-seed / large `latest.json` restore → no ANR, one persist, data intact, written as `SBCC1`. |
| DT2-13 | Backups stay plaintext & portable | `backup-<date>.json` full plaintext, restores on a SECOND device (different KEK — proves backups are custody-independent, the only cross-device recovery path); raw `.sqlite` opens in a SQLite tool. |
| DT2-14 | Diagnostics truthfulness | Field shows the correct state in healthy-encrypted, degraded (post DT2-6), and orphaned (post DT2-5); degraded flag survives a reboot until an encrypted persist clears it (T3). |
| DT2-15 | v2/old-device parity | Run DT2-1,-2,-4,-5,-6,-9,-11 on the older v2 device → same outcomes; if its keystore is software-tier / slower / StrongBox-absent it degrades fail-open with the loud state, never bricks. On an API-22 v2 device: `available()=false`, `encState='plaintext-no-keystore'`, app fully functional (the decisive OD-K2 test). |
| **R0-W3 rows** | DW3-1 auto-backup writes to DATA not DOCUMENTS (file-manager can no longer see it); DW3-2 legacy purge empties `Documents/SaagarBCC-Backups/` after the gated modal; DW3-3 sealed DATA snapshot round-trips; DW3-4 legacy-plaintext restore still works; DW3-5 sealed-snapshot restore on a DIFFERENT device fails with the clear "encrypted for original device — use a plaintext backup to migrate" message (H-W3-3), not a generic error. |

**Gate to shipping flag-on:** all rows PASS on both devices; DT2-5/DT2-6 demonstrate fail-open + loud Diagnostics; DT2-11 confirms KEK wipe; DT2-9 within headroom; then owner signs the OD list below.

---

## B7. HAZARDS

- **H-B1 — Orphaned wrapped-DEK brick class (the key new hazard).** `bcc.dek` survives on disk but the KEK alias is gone/invalidated (credential change, OS key reset, keystore corruption, a clone that carried DATA but not the hardware KEK). `unwrapKey`→`E_ORPHAN`→null→**identical in effect to key-loss**→routes through the exact §2 recovery chain (live→.tmp→.bak→fresh→`reconcile()` re-migrates from native-LS)→app functional; post-first-C-boot deltas restorable from JSON backups (OD-5). **Two hard requirements:** (1) the wrapped-DEK blob is self-describing (`SKW1`+ver) so a valid-but-unwrappable blob is logged as *orphaned*, never silently regenerated as fresh (a fresh DEK cannot decrypt the surviving `SBCC1` — same orphan relocated); the correct response is null→recovery→re-migration→then next persist mints a NEW DEK under a fresh KEK and writes ciphertext forward, rotating the stale `SBCC1` out through `.bak`. (2) This makes P1 (`_dekP` sticky-null) a co-requisite, not an afterthought.
- **H-B2 — Silent downgrade** — forbidden; the entire point of T1-T3.
- **H-B3 — `apply-overrides` native re-stamp missed** (OD-K5) — plugin absent → silent plaintext. Degrades safely (fail-open) but must be DT-checked every build.
- **H-B4 — Rollback to a pre-plugin shell after Keystore encryption** — a plugin-absent build cannot unwrap → data-delta loss (new hazard: a raw-key build could still decrypt). **OD-K4:** rollback must keep the plugin present (flag-off, reader still unwraps, next persists write plaintext), NOT remove the plugin.
- **H-B5 — R0-W3 theatre trap** — ship encryption, leave the 91 files. Mitigated by making R4 purge a REQUIRED gated slice.
- **H-B6 — Sealed DATA snapshot mistaken for a migration backup** — same-install-only artifact copied out = silent loss on the new phone. Never surface it as shareable; migration is exclusively the plaintext manual export; the nudge says "Share to Drive," never references the internal snapshot.
- **Fail-open/closed ruling (firm):** FAIL-OPEN for both the DB writer and the R0-W3 backup writer, loud and owner-visible (T1-T3). Fail-closed rejected as default (OD-8) — for a shop POS a daily outage is a worse harm than a rare, device-specific, user-notified confidentiality downgrade.

---

## B8. WHAT CANNOT BE VERIFIED OFF-DEVICE → GATES ON THE OWNER

The headless harness has `FSplugin()===null` AND no JS stub for `SaagarKeystore` — the **entire wrap/unwrap/encrypt path literally cannot execute off-device**. This is a paper design until the DT matrix runs. Headless can only check: Java compiles against compileSdk 34; API-level guards match minSdk; the Cap6 in-app registration pattern; the `_dekP` sticky-null logic in isolation; and envelope/format round-trips with a mocked plugin. **Only the device proves:** that `AndroidKeyStore` AES/GCM works on the owner's specific device + its actual backing tier; whether a given OEM throws vs returns on StrongBox absence; the kill-matrix atomicity with the extra native IPC in the H3 window; boot latency with the added `unwrapKey` round-trip vs `BOOT_TIMEOUT_MS`; whether data-clear wipes the KEK alias; and the **older v2/API-22 device** behavior (the Slice-C divergence lesson — keystore/TEE is exactly where old devices differ most). **No go/no-go can issue from this design alone.**

**Owner decisions to sign (at the W2-S2b gate):**
- **OD-1 (resolved):** custody tier = hardware Keystore key-wrapping accepted.
- **OD-1b / OD-8:** accept **fail-open** (software-plaintext fallback on non-Keystore/broken-Keystore devices) as a **logged, Diagnostics-visible** state; fail-closed is a separate future decision, not this wave's default.
- **OD-K1:** raise `minSdkVersion` 22→23 (recommended) — OR **OD-K2:** keep 22 and accept documented plaintext-on-API-22 (`encState` visible). Decide against the real v2 device's API level.
- **OD-K3:** KEK is `setUserAuthenticationRequired(false)` — the app can unwrap without a per-open user prompt; the confidentiality boundary is "device + app," not "device + app + fresh auth."
- **OD-K4:** post-encryption rollback must keep the plugin present, not remove it (else post-encryption deltas are lost, JSON-backup-only).
- **OD-K5:** the `apply-overrides.js` native re-stamp is load-bearing; a missed re-apply = silent plaintext (safe-degrading, DT-checked every build).
- **Re-affirm OD-3/4/5:** native-LS re-migration net kept; **R0-W3 is a strict co-requisite** of any "encrypted at rest" claim; JSON backups remain the mandatory cross-device recovery path.

**Files that change when built (absolute):** `V:\Co work\Projects\Retail\saagar-control-centre\build-overrides\native\SaagarKeystore.java` (NEW); `…\build-overrides\apply-overrides.js` (EDIT — copy plugin + patch MainActivity); `…\www\storage-core.js` (`getDEK` rework, `DEK_FILE`, `_encState`, seal/unseal exports, P1-P4, E6); `…\www\auto-backup.js` (R0-W3 A1/A2); `…\www\index.html` (R0-W3 A3/A4/A5); and — via the override, never hand-edited — `…\android\app\src\main\java\com\saagartraders\bcc\{SaagarKeystore,MainActivity}.java`. **No change:** `capacitor.settings.gradle`, `capacitor.build.gradle`, `AndroidManifest.xml`, `variables.gradle` (unless OD-K1), `package.json`, `capacitor.config.json`, `www/sqlite-store.js` (E7 sniffs SBCC1 file bytes, independent of DEK custody), all 11 module blobs + integration-bridge + demo-seed (E8 fence holds).