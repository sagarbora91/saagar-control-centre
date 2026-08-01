# R0-W3 BACKUP-HARDENING DESIGN (read-only; zero edits made)

Angle: close the plaintext-in-shared-storage flank that makes bcc.sqlite encryption meaningless. All anchors below re-verified verbatim against the working tree this session.

═══════════════════════════════════════════════════════════════
## 1. VERIFIED THREAT SURFACE (files + lines)

**The auto-writer — `www/auto-backup.js`:**
- `writeFile()` (L86-94): `directory:'DOCUMENTS'`, `recursive:true`, `encoding:'utf8'` — writes `SaagarBCC-Backups/backup-YYYY-MM-DD.json` as **full-plaintext JSON**.
- `snapshot()` (L61-76): dumps **every** localStorage key (`for i<localStorage.length`), i.e. ALL business data, verbatim. In storage-core-ON mode the overridden `localStorage.length`/`key(i)`/`getItem` (storage-core.js:294,324,325) mean this enumerates the full MEM store — all ~3,300 keys of DSR/stock/payroll/expense/customer/PIN-adjacent data.
- `runBackup()` (L138-139): writes `backup-<today>.json` **and** `latest.json` every calendar day.
- `pruneOldFiles()` + `KEEP_DAYS=90` (L31,96-113): retains 90 dated files → **up to 91 plaintext snapshots** (`latest.json` + 90 dailies) live simultaneously.
- Scheduled silently ~6s after launch, re-checked every 6h (L174-178). **No gate, no re-auth, no admin check** — unlike every manual export path.

**Directory semantics (confirmed by the module's own header + the R0-W2 recon):** `Directory.DOCUMENTS` on Android resolves to the **public, shared** Documents tree — readable by any file-manager app **without root**, and it **survives app uninstall** (app-private dirs do not). The module header (L5-19) states this outright ("still lost if the user uninstalls… This module writes… to the phone's Documents/… folder"). So encrypting `bcc.sqlite` (app-private DATA) while these 91 files exist protects against nobody who has physical/file-manager access to the device.

**Who reads them:** nothing in-app auto-reads Documents backups. Recovery is 100% user-initiated file-pick → `handleRestoreFile(file)` (index.html:6043) → `JSON.parse` → `validateRestoreData`. So format/location changes only touch: (a) the auto-writer, (b) two Attention-Centre nudges (index.html:3700-3701, which literally advertise `Documents/SaagarBCC-Backups/`), (c) the user's restore file-pick.

**Manual/off-device paths (all admin+re-auth gated, values plaintext by design):**
- `exportBackup`→`exportBackupPreview`→`exportBackupConfirmed` (index.html:5849,5885,5907): downloads `Saagar_Traders_Backup_*.json`; optionally a raw in-memory `.sqlite` (5939-5949, `SaagarDB.raw().export()` — in-memory, plaintext by design).
- `exportMigration` (5873): backup + PHP/MariaDB import manifest.
- `shareBackup` (5971): writes to `Directory.CACHE` then hands the file URI to the OS Share sheet (Drive/WhatsApp/email). App never touches the network.
- `restoreValidatedBackup` (6092) / `validateRestoreKeyValue` (5992): parse **raw JSON**; must stay plaintext-capable to restore old backups.

═══════════════════════════════════════════════════════════════
## 2. THE IRRECONCILABLE TENSION (state this to the owner first)

auto-backup's **only unique value** over the existing on-device durability stack (bcc.sqlite + `.bak` + `.tmp` recovery chain + the native-LS frozen snapshot, storage-core.js:337-364,383-391) is that it **survives uninstall and moves to a new phone**. That is precisely the property that is **fundamentally incompatible** with encryption-at-rest under a device-bound Keystore key: a Keystore KEK (and the wrapped DEK in `bcc.key`) **die on uninstall/factory-reset** (contract §2 key-source; E6 wipes `bcc.key`). So:

- **Encrypting the Documents JSON in place with the DEK (option a, in place) is self-defeating** — the ciphertext survives the uninstall it was built to survive, but becomes **permanently undecryptable** (its key died with the app). You keep the file and lose the recovery. Worse than useless: it *looks* like a backup.
- The confidentiality goal ("no plaintext business data in shared storage") and the durability goal ("automatic, device-independent, uninstall-surviving recovery") **cannot both live in one artifact.** They must be split into two artifacts with two lifecycles.

═══════════════════════════════════════════════════════════════
## 3. OPTION EVALUATION (honest: what each closes / breaks)

| Option | Shared-readability | Uninstall-survival threat | Breaks recovery purpose? | Verdict |
|---|---|---|---|---|
| **(a) Encrypt Documents JSON in place w/ DEK** | Closed (ciphertext) | "Closed" only because file is undecryptable — i.e. the surviving file is junk | **YES — fatal.** Uninstall/new-phone recovery (its raison d'être) dies with the key. | **Reject as-stated.** Encryption belongs on an app-private copy, not the migration copy. |
| **(b) Move auto-backup to app-private DATA** | Closed (sandboxed) | Closed (DATA dies on uninstall) | **YES** for the uninstall/migration role; keeps only the app-installed crash-recovery role — which is **already redundant** with bcc.sqlite+.bak+native-LS in the same trust domain. | Useful only as a belt-and-suspenders on-device snapshot; NOT a substitute for off-device backup. |
| **(c) Stop auto-writing; manual export only** | Closed (nothing auto-written) | Closed | Removes the automatic net entirely → durability regression; **collides with OD-5**, which just made JSON backups the *mandatory* recovery story for DB key-loss. Owners forget. | Right on confidentiality, dangerous on durability if shipped alone. |
| **(d) Combination (RECOMMENDED)** | Closed | Closed | No — roles are split so each is served properly. | **Recommend.** |

═══════════════════════════════════════════════════════════════
## 4. RECOMMENDED R0-W3 DESIGN — split the two roles auto-backup conflates

**Principle:** stop conflating "on-device redundancy" with "off-device migration copy." Give each its own artifact and lifecycle.

**(R1) Kill the shared-plaintext auto-writer.** Change auto-backup's target from `DOCUMENTS` to app-private `DATA` (`Directory.Data`, same dir the DB lives in). One-string change closes **both** named threats immediately: no longer world-readable (sandboxed), and the DATA copy dying on uninstall is now *correct* because this artifact is no longer the migration copy. Its remaining job is engine-independent on-device crash recovery (a whole-history JSON that survives even a corrupt-beyond-`.bak` sql.js DB).

**(R2) Encrypt that app-private auto-snapshot with the DEK/Keystore envelope** (option a, now applied *safely* — because the file's lifecycle now matches the key's lifecycle: both die on uninstall, no contradiction). Defends the on-device copy against root/forensic/misdirected-share reads, consistent with encrypting bcc.sqlite. Fewer files: drop `KEEP_DAYS` from 90 to ~7 (DATA history is redundant with the DB; deep history isn't needed here). Restore sniffs+decrypts (see R5). Same-install-only by construction — say so.

**(R3) Off-device / migration recovery = the existing user-initiated manual export/share, PLAINTEXT by design, unchanged and gated.** This is the one deliberate plaintext egress, and it is a conscious admin+re-auth action (`exportBackup`/`shareBackup`, gated at 5850/5973). This is the correct place for the confidentiality-vs-portability tradeoff to be the **user's** explicit choice: a Keystore-sealed export could never be restored on a new phone, so migration MUST stay plaintext. Do not touch these paths (E8-style zero-edit fence).

**(R4) MANDATORY one-time purge of the 91 existing plaintext files.** Shipping R1/R2 while 90 old `backup-*.json` + `latest.json` sit in shared Documents closes **nothing** — the flank stays wide open with historical data. R0-W3 must, on first run of the hardened build, **delete the legacy `Documents/SaagarBCC-Backups/` plaintext files**, gated behind a user confirmation that a fresh off-device backup exists. This is the single most important item in the slice — without it the wave is theatre.

**(R5) Restore stays backward-compatible.** `handleRestoreFile` must still accept plaintext JSON (users have 90 legacy files + all past manual exports) AND gain sniff+decrypt for the new sealed DATA snapshots. Reuse the storage-core reader — do not re-implement crypto.

**(R6) Convert the silent auto-writer into a loud off-device nudge.** After R1 the auto copy no longer survives uninstall, so the safety-net story shifts to user-initiated off-device share. Strengthen the Attention-Centre items at index.html:3700-3701 (which currently *advertise* the now-removed `Documents/SaagarBCC-Backups/` path) into an escalating "your last OFF-DEVICE backup is N days old — Share to Drive now" prompt driven by a new marker (last **share/off-device** timestamp, distinct from `LAST_BACKUP_KEY`).

═══════════════════════════════════════════════════════════════
## 5. DEPENDENCY ON W2-S2 (the key-wrapping writer) — expose a reusable primitive

R2/R5 require ONE key-custody implementation, shared with the DB path. W2-S2's DEK/Keystore work must expose thin wrappers on the storage-core surface, e.g.:
- `SaagarStore.seal(u8) → Promise<Uint8Array envelope>` (thin wrapper over `encryptForPersist`, operating on the DEK; SBCC1 format identical to the DB envelope, storage-core.js:81-82,128-139).
- `SaagarStore.unseal(u8) → Promise<Uint8Array|null>` (thin wrapper over `decryptIfEnveloped`, storage-core.js:141-151).

Today `encryptForPersist`/`decryptIfEnveloped` are **module-private** inside the storage-core IIFE — auto-backup.js and index.html cannot reach them. R0-W3 cannot be built before W2-S2 exposes these. **This is the hard sequencing constraint: R0-W3 folds in *behind* W2-S2, not beside it** (matches the owner's "R0-W3 folds in immediately behind W2" instruction). The DEK-wrapping change (bcc.key becomes a Keystore-wrapped DEK instead of raw key material) is transparent to R0-W3 — it only ever calls seal/unseal.

═══════════════════════════════════════════════════════════════
## 6. EXACT-ANCHOR EDIT PLAN (read-only; no edits performed)

All in `www/auto-backup.js` + a small `www/index.html` restore/nudge touch. Re-match every anchor at build time (H13 anchor-drift rule).

**A1 — auto-backup target → DATA.** Anchor `www/auto-backup.js:86-94` `writeFile()`, `directory:'DOCUMENTS'`. Change to `'DATA'`. Also `pruneOldFiles` (L98,108) `directory:'DOCUMENTS'` → `'DATA'`, and `KEEP_DAYS` (L31) 90 → 7.

**A2 — encrypt on write.** Anchor `runBackup()` L125-126 `var json = JSON.stringify(snap);` and the `writeFile(FS, ...)` chain L138-139. Wrap: `SaagarStore.seal(utf8Bytes(json))` → b64 → writeFile; **fail-open** — if `!window.SaagarStore || !SaagarStore.seal` or seal rejects, write plaintext to DATA with a distinct log (DATA plaintext ≪ Documents plaintext; durability-first, symmetric with storage-core's encrypt-fail→plaintext at L128-139). Guard so the browser-noop path (L129-136) is unchanged.

**A3 — restore decrypt.** Anchor `handleRestoreFile` L6049-6053 `reader.readAsText(file)` + `JSON.parse(reader.result)`. Add: read as bytes, sniff SBCC1 (`isEnvelope`, storage-core.js:101 logic) → `SaagarStore.unseal` → JSON.parse; non-envelope → existing plaintext `JSON.parse` path untouched. Legacy + manual plaintext backups keep working verbatim.

**A4 — legacy purge (gated).** New one-time routine (own marker, e.g. `bcc_docs_purged`), run after A1 ships: `FS.readdir({path:'SaagarBCC-Backups', directory:'DOCUMENTS'})` → delete `backup-*.json` + `latest.json`, behind a modal confirming a fresh off-device backup. Model on `pruneOldFiles` (L96-113) but on DOCUMENTS and user-confirmed.

**A5 — nudge rewording.** Anchor index.html:3700-3701 — replace the `Documents/SaagarBCC-Backups/` advertising copy with the off-device-share escalation; add a `lastOffDeviceBackup` marker set in `shareBackup` (5978 `setLastBackup()` sibling).

**Zero-edit fence:** `exportBackup*`/`exportMigration`/`shareBackup`/`backupPayload`/`validateRestoreKeyValue`/`restoreValidatedBackup` write/validate logic — untouched except A3's read-side sniff and A5's marker.

═══════════════════════════════════════════════════════════════
## 7. WHAT STAYS PLAINTEXT — BY DESIGN, AND WHY

1. **Manual export / share to Drive/WhatsApp/email** (`exportBackup`/`exportMigration`/`shareBackup`). User-initiated, admin+re-auth gated, and it MUST be portable to a new phone — a Keystore-sealed export is undecryptable off-device, so migration is impossible if sealed. The user consciously chose to export; that is the correct locus for the confidentiality/portability tradeoff. **Flag the tension to the owner:** a plaintext file leaving the device to Drive is now the *primary* remaining data-at-rest exposure — but it is a deliberate, gated, per-instance user act, not a silent daily dump. Acceptable; make it explicit in owner sign-off (mirrors OD-4/OD-5).
2. **Raw in-memory `.sqlite` manual export** (5939-5949) — in-memory `SaagarDB.raw().export()`, plaintext by design, user-initiated safety net. Unchanged (contract §2 confirms whole-file encryption does not touch it).
3. **The migration manifest** (`migrationManifest`, 5860) — the PHP/MariaDB import contract; plaintext by design, rides the gated manual export only.
4. **kv values inside the sealed artifacts** — sealing is whole-file envelope; values are never per-field encrypted (same as the DB, contract H7/H11). Restore validators keep parsing raw JSON.

═══════════════════════════════════════════════════════════════
## 8. FAIL-POLICY RECOMMENDATION (firm) — Keystore unavailable

**Firm recommendation: FAIL-OPEN, but as an explicit, logged, owner-visible state — never a silent downgrade. This applies to BOTH the DB writer (W2-S2) and the R0-W3 backup writer.**

Reasoning:
- This is a shop POS. **Durability/availability is the existing, load-bearing, revenue-critical guarantee** (the memory index records the app bricking 3×/~3 days over storage — that scar is why the whole storage contract is fail-open, storage-core.js:20,344). **Confidentiality is the new, additive intent.** You do not regress a load-bearing revenue guarantee to serve a new one. Fail-closed (refuse-to-persist / refuse-to-run) turns a rare, device-specific confidentiality gap into a daily business outage — strictly worse for this user.
- The confidentiality gap is small and rare: Android Keystore is **API-23+ universal**; only StrongBox/attestation edge cases fail, and those **degrade cleanly to TEE or software-keystore**, which is still perfectly adequate for wrapping an AES-256 DEK. A genuine "no keystore at all" device is pathological. Designing a brick for it is the wrong trade.
- **But loud, not silent:** on Keystore-unavailable, (a) distinct log line (`'keystore unavailable — DEK unwrapped/plaintext; data stored unencrypted'`), (b) a persistent **Attention-Centre red banner** ("Secure storage unavailable on this device — data is stored **unencrypted**; keep off-device backups current"), (c) a flag in `SaagarStore._status()` so it's diagnosable. The user (an advocate) gets the truth and can decide; the app never silently pretends to be encrypted when it isn't.

**Honest posture on what Keystore key-wrapping buys (say this plainly):**
- **NEW protection:** a copied DATA dir now yields ciphertext + a **wrapped DEK that only THIS device's Keystore hardware can unwrap** — useless off-device. This is a real upgrade over the W2-S1/contract raw `bcc.key` (which the contract itself labels "security theatre… key and lock in the same drawer", §1.1). Extraction resistance genuinely improves.
- **STILL NOT protected:** a rooted/live device where the app can be *driven* to unwrap (the DEK is unwrappable on-demand by design — no user-presence/auth binding proposed here); a lost device passcode does not help an attacker but also isn't the barrier; **StrongBox vs TEE vs software-keystore variance** means the hardware guarantee is not uniform across devices (a software-keystore device gets the API contract but not hardware isolation). And — the point of this whole angle — **none of it matters while plaintext backups sit in shared Documents**, which is exactly what R0-W3 R1/R4 close.

═══════════════════════════════════════════════════════════════
## 9. MICRO-SLICE PLAN (smallest-risk-first; each = own build + device test + owner go)

- **W3-S0 — Recon/probe.** Confirm on the owner's device (incl. the older v2 device — the Slice-C SM-login incident proved v2 diverges): `Directory.Data` readable/writable via Filesystem; `readdir` on the existing `Documents/SaagarBCC-Backups/` enumerates the legacy files (purge feasibility); count/size of existing plaintext files. Zero writes.
- **W3-S1 — Move auto-writer DOCUMENTS→DATA + reduce retention (A1).** No crypto yet. Closes both named threats on its own. Restore already reads any path (user file-pick), so back-compat is free. Ship-able independently if W2-S2 primitive isn't ready.
- **W3-S2 — Legacy purge (A4), gated behind confirmed fresh off-device backup.** The load-bearing honesty item. Device-test: verify Documents folder emptied, app still restores from a manually-saved off-device file.
- **W3-S3 — Encrypt the DATA auto-snapshot (A2) + restore sniff/decrypt (A3).** Requires W2-S2's `seal`/`unseal` exposed. Fail-open to DATA-plaintext if seal unavailable. Device-test the round-trip + a legacy-plaintext restore + a sealed-snapshot restore.
- **W3-S4 — Nudge rewording + off-device marker (A5).** Cosmetic/UX; ship last.

Device-test is mandatory per slice — `FSplugin()` is null in the harness, so the write/seal paths **cannot** be exercised off-device (same constraint as W2, contract H12/§5). Headless can only regression-check that the browser-noop path and plaintext-restore path stay byte-identical.

═══════════════════════════════════════════════════════════════
## 10. HAZARDS SPECIFIC TO R0-W3

- **H-W3-1 — Ship encryption, leave 91 old files.** The theatre trap. Mitigated by making A4 (purge) a REQUIRED, gated slice, not a follow-up.
- **H-W3-2 — Sealed auto-snapshot mistaken for a migration backup.** A same-install-only artifact that a user copies out expecting portability = silent data-loss on the new phone (undecryptable). Mitigate: never surface the DATA snapshot as a shareable/exportable file; migration is exclusively the plaintext manual export, and the nudge (A5) must say "Share to Drive" (off-device), not reference the internal snapshot.
- **H-W3-3 — Restore of a sealed snapshot on a different device / after reinstall.** Fails to decrypt (Keystore KEK gone). Must produce a clear message ("this backup is encrypted for the original device; use an off-device plaintext backup to migrate"), not a generic "restore failed."
- **H-W3-4 — Encrypt-fail on auto-backup silently drops the daily net.** Mitigate: fail-open to DATA-plaintext + log (durability-first), never skip the write.
- **H-W3-5 — DEK/Keystore primitive not yet exposed.** Hard dependency on W2-S2; W3-S3 is blocked until then. W3-S1/S2 can proceed independently and already deliver the biggest threat-closure (shared-readability + uninstall-survival + legacy purge) without any crypto.

═══════════════════════════════════════════════════════════════
## 11. BOTTOM LINE

The owner's instinct to fold R0-W3 in behind W2 is correct and, per the W2 contract's own §1.2/OD-4, **a co-requisite, not a follow-up** — encrypting bcc.sqlite is unclaimable as "encrypted at rest" while 91 plaintext snapshots sit in shared Documents. The honest fix is **not** to encrypt those files in place (self-defeating — undecryptable after the uninstall they exist to survive) but to **split the roles**: move + encrypt the on-device redundancy copy into app-private DATA, **purge the 91 legacy plaintext files**, and route uninstall/migration recovery exclusively through the existing user-initiated, gated, plaintext manual export/share — the one place the confidentiality-vs-portability tradeoff is legitimately the user's explicit choice. Fail-open on Keystore-unavailable, but loudly and visibly, because for a shop POS a daily outage is a worse harm than a rare, device-specific, user-notified confidentiality downgrade. The single biggest earliest win (W3-S1+S2, no crypto, no W2 dependency) closes both named threats — shared-readability and uninstall-survival — on its own.