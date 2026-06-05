# Plan — SQLite as the PRIMARY store (Option C)

_Design doc. Build later. Goal: remove the ~5 MB localStorage ceiling entirely by making an
in-memory, SQLite-backed key-value store the source of truth, while preserving the synchronous
`localStorage`-style API every shell function and embedded module already depends on._

---

## 0. Where we are today (the constraint to overturn)
- `localStorage` is the **synchronous working store**; the shell (`safeGet/safeSet`) and every
  base64-embedded module read/write it directly. Same-origin module iframes share the one
  per-origin localStorage.
- `sqlite-store.js` is a **durable mirror only**: write-through does native `localStorage.setItem`
  FIRST, then mirrors to `bcc.sqlite`. So a full localStorage still throws `QuotaExceededError` and
  the cap stands. SQLite buys durability, not capacity.
- Therefore C = **invert this**: the in-memory DB (hydrated from `bcc.sqlite`) becomes the source of
  truth; browser localStorage is demoted to a one-time migration source + fallback.

## 1. The two hard problems C MUST solve
1. **Reads are synchronous AND cross-frame.** `getItem` is called thousands of times per render, by
   both the top window and module iframes. SQLite/IndexedDB are async and top-window-only. → We need
   a **synchronous in-memory store** that iframes can also read synchronously.
   - Solution: same-origin iframes can synchronously touch the parent realm. An injected iframe shim
     overrides the iframe's `Storage.prototype` to call `window.parent.SaagarStore.*` directly (sync,
     allowed same-origin). No postMessage on the read path.
2. **Boot ordering vs. the seeder/guard.** `integration-bridge.js` + `demo-seed.js` run at script load
   and read/write storage immediately; the DB loads async (sql.js init + Filesystem read ≈ 100–300 ms).
   If the seeder runs before the DB hydrates, the `saagar_demo_seeded` guard is missing → it RE-SEEDS
   over real data (esp. the "localStorage cleared but DB survived" recovery case). → We must **gate
   data-dependent boot on store-ready**.

## 2. Target architecture
```
         ┌──────────────────────── top window ────────────────────────┐
         │  MEM : Map<string,string>   ← synchronous working store      │
         │   ▲ get/set (instant)                                        │
         │   │                                                          │
  Storage.prototype override (top)        window.SaagarStore  ←─────────┼── iframe shim calls parent
         │   │ set → dirty → debounced persist                          │
         │   ▼                                                          │
         │  sql.js in-memory DB (kv table)  ──export()──► bcc.sqlite    │
         │                                   (Capacitor Filesystem,     │
         │                                    hundreds of MB)           │
         └──────────────────────────────────────────────────────────────┘
   native localStorage: READ ONCE at boot (migration) + FALLBACK only; never written in C-mode.
```
- **MEM (JS Map)** is the fast sync layer (reads/writes are O(1), no WASM call per read).
- **sql.js DB** is the persistence layer (MEM mirrored into it; whole-file `export()` → `bcc.sqlite`).
- **`window.SaagarStore`** = `{ get, set, remove, keys, length, ready(), whenReady(cb), flush() }`.
- The browser's real localStorage is **not** the working store anymore → its 5 MB cap never bites.

## 3. Boot sequence (the critical redesign)
Order of `<script>`s in `index.html` `<head>` (before bridge/seed/shell):
1. `sql-wasm.js` (defines `initSqlJs`).
2. **`storage-core.js`** (NEW — replaces the mirror role of `sqlite-store.js`):
   - **Step 0 (sync, instant):** read every existing **native** localStorage key into `MEM`
     (handles upgrade-from-localStorage-build migration). Capture native methods for fallback.
   - **Install overrides (sync):** override top-window `Storage.prototype` get/set/remove/clear/key/length
     to operate on `MEM` (NOT native localStorage). From here, all `localStorage.*` hits `MEM`.
   - Expose `window.SaagarStore`.
   - **Async:** `initSqlJs` → read `bcc.sqlite` → for each DB key not already in `MEM`, load it
     (recovery / source-of-truth merge); for each `MEM` key not in DB, upsert (migrate-up). Mark
     `ready=true`, fire `whenReady` callbacks, start the debounced persist loop.
   - **Fallback:** if `initSqlJs`/WASM/Filesystem missing or anything throws → re-point `MEM` writes
     to **write-through to native localStorage** (today's behavior, 5 MB cap returns but app works).
     This keeps jsdom/puppeteer tests + non-Capacitor browsers running.
3. `integration-bridge.js`, `demo-seed.js`, shell init — **wrapped in `SaagarStore.whenReady(...)`**
   so they run only after the DB has hydrated `MEM`. A lightweight splash covers the ~100–300 ms.
   - This makes the guard correct in all 3 cases: fresh install (empty → seed), normal (guard present
     → skip), recovery (DB hydrates guard → skip).

## 4. File-by-file changes
- **NEW `www/storage-core.js`** — the MEM + sql.js core, overrides, `SaagarStore`, migration, fallback,
  debounced persist, visibilitychange/pagehide/`App pause` flush (port these from `sqlite-store.js`).
- **`www/sqlite-store.js`** — fold into / replace by storage-core (it already has sql.js init, b64,
  kv ops, save, recovery — reuse ~70% of it). Keep `window.SaagarDB` API (`query/prune/raw`) for the
  archival/diagnostics callers; have it delegate to the same DB instance.
- **`www/index.html`**:
  - Reorder scripts (sql-wasm → storage-core → bridge → seed).
  - Wrap bridge/seed/first-`renderHome` in `SaagarStore.whenReady`.
  - Add a minimal boot splash + a `whenReady` timeout that falls back to native-localStorage mode.
  - **Iframe shim:** in the module-injection pipeline (alongside `injectModuleAuditBridge` /
    `injectMobileMode`), inject as the FIRST script of every module `srcdoc`:
    ```js
    (function(){ try{ var P = window.parent && window.parent.SaagarStore; if(!P) return;
      var SP = Storage.prototype;
      SP.getItem = function(k){ return P.get(k); };
      SP.setItem = function(k,v){ P.set(k,v); };
      SP.removeItem = function(k){ P.remove(k); };
      // length/key/clear similar; values are strings, same contract as localStorage
    }catch(e){} })();
    ```
    (Same-origin srcdoc → `window.parent` access is synchronous and allowed. The existing `ST_AUDIT`
    postMessage stays for audit logging only; it's no longer needed for persistence.)
- **`www/demo-seed.js`** — no logic change, but it now runs inside `whenReady`; remove the density
  tuning later if desired since the cap is gone (optional — keep lighter for memory, see §5).
- **`safeSet/safeGet` (index.html)** — unchanged API; they call `localStorage.*` which is now MEM.
  The `QuotaExceededError` toast path becomes effectively dead in C-mode (fine to keep as a guard).

## 5. Photos / memory caveat (why C does NOT fully retire Option B)
C loads the **entire dataset into RAM** (MEM + sql.js DB) and `export()`s the whole file on persist.
Text is cheap, but **base64 photos** (bill/cleaning/signature) would bloat memory, slow boot (load all
photos into RAM), and make each file-export heavy. So:
- Keep the in-memory store **text-only**. Route photo/blob fields to **IndexedDB** (Option B) OR mark
  photo keys as "cold" in storage-core: store them only in the DB (or IDB) and **lazy-load on demand**
  (async `getPhoto(id)`), never holding them in MEM.
- Net: **C solves unbounded TEXT; photos still want B/lazy handling to bound memory.** Plan to do both;
  C first (removes the wall), photo-laziness second (bounds RAM).

## 6. Persistence & durability
- On `set/remove`: update MEM, mark the key dirty, `kvUpsert/kvDelete` into the in-memory sql.js DB,
  schedule debounced `save()` (export whole DB → `Filesystem.writeFile`). Flush on hide/pagehide/pause.
- **Scale concern:** sql.js `export()` serializes the whole file each save → can jank at tens of MB.
  Mitigations: raise debounce (e.g., 5–8 s), prefer persist-on-idle/pause, and batch dirty keys. (sql.js
  has no incremental file write; whole-file export is the model.)
- **Backups:** existing JSON export/import still works (reads MEM via the override). Add a "copy
  `bcc.sqlite`" to the backup flow as a binary safety net.

## 7. Migration & backward-compat
- **Upgrade from a localStorage-primary build:** Step 0 hydrates MEM from native localStorage → async
  DB load upserts it → from then on the DB is canonical. One-time, automatic, lossless.
- **Fresh install:** MEM empty → seed → persist to DB.
- **Recovery (WebView data cleared, file survived):** native localStorage empty at Step 0 → DB load
  hydrates MEM → `whenReady` → seed sees the guard → skips. Correct.
- **Fallback (no Capacitor/WASM, or error):** native-localStorage write-through (today's behavior).

## 8. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Storage-core bug → **live business-data loss** | Phased rollout behind a flag (default off → behaves as today); keep `bcc.sqlite` + JSON backup; boot-time integrity check (key-count sanity); the native-localStorage fallback path stays intact. |
| Memory bloat from photos | Keep MEM text-only; photos → IndexedDB / lazy (Option B). |
| Boot latency (async DB) | Splash; DB load ~100–300 ms; only data-dependent init waits; `whenReady` timeout → fallback. |
| Whole-file export jank at scale | Longer debounce, persist on idle/pause, batch dirty keys. |
| Iframe shim must beat module scripts | Inject as the literal first `<script>` in srcdoc; guard if `parent.SaagarStore` absent → no-op (degrades to shared localStorage). |
| Tests can't reach the Filesystem path in jsdom | storage-core falls back to native LS in jsdom (existing gates still validate app behavior); add a **mocked-Filesystem harness** to prove the DB-primary path persists >5 MB. |

## 9. Test plan
- **New `_v/_storage_core.js`** (node/jsdom): MEM semantics match localStorage; override correctness;
  migration (native LS → MEM → DB) with a mocked Filesystem; recovery; **write >5 MB and read back
  (cap gone)**; `whenReady` gating; persist→reload→data survives.
- **New `_v/_iframe_shim.js`**: simulate a child realm reading via `parent.SaagarStore` (sync).
- **Existing gates** (jsdom 47/47, puppeteer 118/118, regression 30/30, `_6mo_qa.js` 35/35) must stay
  green — they exercise the **fallback** path (no Capacitor), proving C doesn't regress today's behavior.
- **On-device**: install, load the 6-month seed, add data past ~6 MB, restart → all data present, no
  "storage full" toast, reports correct; airplane-mode restart (durability); Factory Reset clears both
  MEM and `bcc.sqlite`.

## 10. Phased rollout (build order)
1. **storage-core.js** with MEM + overrides + fallback (no DB yet) → run all gates in fallback. (Safe.)
2. Wire sql.js DB hydrate/persist + `whenReady`; reorder boot; splash. Behind a `?store=sqlite` /
   setting flag (default OFF).
3. Iframe shim injection.
4. Migration + recovery + integrity check + backup of the file.
5. Mocked-FS test harness; on-device validation (the >5 MB test).
6. Flip the flag ON by default; keep fallback. Ship.
7. (Follow-up) Photos → IndexedDB / lazy to bound memory.

## 11. Effort
**High / multi-session.** ~1 new core file (much ported from `sqlite-store.js`), boot reorder + splash,
one iframe-inject function, seed/bridge gating, migration + fallback, 2 new harnesses, on-device pass.
Highest blast radius of any change so far → the flag + fallback + phased rollout are non-negotiable.

## 12. Decisions (LOCKED by owner)
1. **Boot splash:** YES — a ~0.3 s cold-start loader is acceptable (covers the async hydrate).
2. **Photos:** FOLD IndexedDB/lazy-photo into this effort (keeps MEM text-only → bounds RAM). Consider
   storing photos as Capacitor **Filesystem files** instead of IDB (durable, no quota, simpler).
3. **Backups:** ADD the binary `bcc.sqlite` to the backup flow (alongside JSON).
4. **Flag:** **build-time constant** (no Settings toggle).

## 13. Data-safety hardening (REQUIRED — surfaced by the "is it foolproof?" review)
These close the real corruption/loss gaps the §2–§7 design alone did NOT cover. None are optional.
- **13.1 Write-Ahead Log (WAL) for crash-durability.** Today `localStorage.setItem` is durable
  instantly; C's debounced file-persist introduces a lost-write window on crash/kill. So every
  `set/remove` ALSO appends to a tiny **synchronous native-localStorage WAL** key (bytes-small, never
  near the cap). The debounced `save()` flushes the DB then clears the WAL. On boot, a non-empty WAL
  ⇒ a crash occurred ⇒ replay it into MEM+DB before `whenReady`. → C becomes as durable as today.
- **13.2 Atomic file writes + rotation.** Persist to `bcc.sqlite.tmp`, then `Filesystem.rename` over
  the live file (atomic); keep the previous good file as `bcc.sqlite.bak`. On open-failure at boot:
  try `.bak`, then fall back to native-LS + WAL. (Prevents a kill-mid-`writeFile` from bricking data.)
- **13.3 Additive, verified migration.** First C-boot copies native localStorage → MEM → DB but
  **never deletes native localStorage** (left as a parallel copy until the DB is proven good). Verify
  key-count + per-key checksum after migration; on mismatch, stay on native-LS (don't trust the DB).
- **13.4 No silent mirror drift.** Don't swallow DB-upsert errors: failed keys stay dirty for retry +
  are covered by the WAL; periodic full MEM→DB reconcile as a backstop.
- **13.5 Factory Reset wipes EVERYTHING.** MEM + `bcc.sqlite`(+`.bak`/`.tmp`) + WAL + IDB/Filesystem
  photos + the seed guard — atomically. Else the recovery path resurrects "deleted" data. Explicit test.
- **13.6 No boot hang.** `whenReady` hard timeout (~1.5–2 s) → proceed in native-LS fallback mode.
- **13.7 Faithful `length`/`key(i)`.** The MEM override must implement these (ordered) — the
  key-scanning aggregators (grooming-monthly, stock, reconciliation) depend on them. Re-run `_6mo_qa.js`.
- **13.8 `storage` events.** Grep for `addEventListener('storage'…)`; emulate if any exist (likely none).

## 14. Safety doctrine (the "how we don't corrupt your data" summary)
1. Build-time flag **default OFF** → app is byte-for-byte today's behavior until we flip it.
2. The native-localStorage **fallback never leaves** — the floor under everything.
3. Migration is **additive** — existing data is copied, never deleted; a migration bug can't lose it.
4. **Validate on a TEST build before it becomes the daily driver**, with an adversarial gauntlet:
   kill-app-mid-write → reopen → zero lost data; corrupt the file → recovers from `.bak`/WAL;
   backup → wipe → restore; Factory Reset → no resurrection; 6-month load; all existing gates green
   (they run on the fallback path, proving no regression).
5. **Phased rollout** (§10) — each phase shippable + reversible; flip default only after the gauntlet.

**Honest guarantee:** not "foolproof," but **"no worse than today's durability, two independent
recovery layers (WAL + .bak), and nothing flips on until it survives the gauntlet on your own test build."**

## 15. Photo backup/restore — IMPLEMENTED (was: required before any module rewire)
Photos are the one thing the text store does NOT carry. TODAY they are base64 inside localStorage JSON
values, so the JSON backup/restore covers them. The deferred module-rewire (routing photo fields through
`SaagarStore.photo` → Filesystem files) REMOVES that coverage: the JSON backup would carry only a text
ref, and the binary `bcc.sqlite` does NOT contain photos. **Before/with the rewire, extend
`backupPayload()` + `restoreValidatedBackup()` to bundle photo bytes** (`photo.listAll()`→`get(id)` into
a `photos{}` object, restored via `photo.put`). Until then the rewire MUST NOT ship — see the DEFERRED
CONTRACT header in `www/photo-store.js`. Skipping this = silent loss of every bill/cleaning/signature
image on restore or device migration.

**STATUS — DONE (the gate is now satisfied; the rewire is unblocked).**
- `photo-store.js`: added `snapshot()` → `{photoId: dataUrl}` of every stored photo (null when FS absent /
  no photos), and `restoreAll(map)` → sequential `put()` of each, returns count written.
- `index.html`: `exportBackupConfirmed()` folds `snapshot()` into `payload.photos`; `handleRestoreFile()`
  stashes `parsed.photos` (+ a preview pill); `restoreValidatedBackup()` replays via `restoreAll()` then
  reloads. Photos travel as a top-level sibling of `localStorage` in the bundle.
- **Flag-gated (review fix below):** both sites pick the photo API ONLY via
  `window.SaagarStore.enabled && .photo` — NEVER the `__SaagarPhoto` stash — so a flag-OFF build never
  calls photo-store and the backup is byte-identical to APK #43 (sync download, no `photos` key).
- **Unit-proven:** `_v/_photo_backup.js` **21/21** — PNG/JPG/WEBP byte-identical round-trip, no-photo→null
  guard, FS-absent graceful degrade, overwrite-by-id, and the flag gate in BOTH states (OFF → null +
  `snapshot()` not called; ON → API used + called once).

## 16. Fix-pass + re-review log
- **Build** (workflow `wb3ozlkxn`, 14 agents): full enabled path built behind the OFF flag.
- **Review #1:** 6 blockers/majors → all FIXED in the coherent fix pass.
- **Re-review #2** (`whlpc3g9h`, 7 agents): ALL prior blockers CONFIRMED CLOSED; found 1 new blocker
  (`open()` shallow corruption probe) + 3 majors (WAL byte-bound blind-drop; catastrophic-branch
  resurrection; photo-backup deferral not in durable docs) → all FIXED (round 2):
  - `open()` → `PRAGMA quick_check`=='ok' (rejects torn files → recovers `.bak`, no silent empty fallback).
  - `appendWAL` overflow degrades inline values to POINTERS + forces a persist (never blind-drops a key);
    `demo-seed.js` force-flushes after its ~1500-key burst.
  - `removeItem`/`clear` mirror deletions to native LS (sets stay MEM-only) so the catastrophic re-migrate
    finds no zombies.
  - this §15 + the `photo-store.js` DEFERRED CONTRACT header; binary-backup guard fixed to `SaagarStore.enabled`.
- **Unit-proven** (gitignored `_v/`): `_storage_db.js` **54/54** (CASES 10-16: WAL-race, no-resurrection,
  clear-sentinel, factory-reset, torn-file→.bak, WAL-overflow-no-loss, catastrophic-no-resurrection,
  + the >5 MB cap-gone proof); `_storage_core` 27/27; `_iframe_shim` 14/14; flag-OFF `_6mo_qa` 35/35,
  `_runall` 30/30, `_r6_reports` 118/118.
- **Photo backup/restore + 3 bug-hunt fixes** (this pass): §15 mechanism implemented (snapshot/restoreAll
  + index.html wiring); 3 bug-hunt fixes applied — factoryReset `APP_RE` → `st_v\d+_` (was missing
  st_v3_/st_v4_), `CURRENT_ROLE_KEY` added to `appControlKeys()` (device role now backed up/restored),
  service-aging day math → local-midnight + `Math.floor` in BOTH `index.html` computeServiceAging and
  `saagar-report.js`. New `_v/_photo_backup.js` **21/21**; stale `test_backup_roundtrip.js` shim updated
  for `CURRENT_ROLE_KEY` (15/15). Full suite re-green.
- **Re-review #3** (`wf_57cfabe9`, 29 agents, 4 dims × adversarial verify): 25 findings → 18 refuted, 5
  confirmed-as-correct (the 3 bug-fixes + binary-sqlite gate + iframe shim all verified inert/correct),
  **2 real defects** → both FIXED: photo `snapshot()`/`restoreAll()` were reachable via the `__SaagarPhoto`
  fallback even with the flag OFF (a forward-compat inertness violation) → re-gated on `SaagarStore.enabled`
  so a flag-OFF build NEVER touches photo-store; proven by `_photo_backup.js` 21/21.
## 17. Go-live — build 2.0 (engine ON for the daily build) + Expense photo offload
- **Flag-ON per-module audit** (`wf_9fa5e2fc`, 30 agents, 5 module-groups × adversarial verify + photo
  design): 23 findings → 11 confirmed. Headline = a SLOW-BOOT stale-data race: if the async DB load
  exceeded the 1800 ms hard timeout, the fallback marked ready on stale native-LS data AND abandoned the
  late DB load (`if(_ready)return`), so the session ran on stale data. FIXED in storage-core:
  `BOOT_TIMEOUT_MS` 1800→6000 + `window.__BOOT_TIMEOUT_MS` test override + LATE-HEAL (load + reconcile
  even after the fallback fired — never abandon). Splash cap 2000→6500. Proven by `_v/_boot_heal.js` 8/8.
  The "iteration skips keys under concurrent mutation" findings were DISCOUNTED (single-threaded JS — a
  sync loop can't be interrupted mid-iteration); the normal path was already safe (first render is
  whenReady-gated; modules only open on user click, post-ready).
- **Photo rewire (Expense only).** `injectIframeShim` now also exposes `window.SaagarPhoto` into each
  iframe (forwards to parent `SaagarStore.photo`; defined ONLY when enabled + a photo facade exists →
  flag-OFF leaves it undefined → modules take the legacy base64 path). Expense `addEntry` offloads the
  bill photo via `photo.put()` and stores a small `'@photo:'+id` ref in the ledger; flag-OFF / put-failure
  / no-photo → inline base64 exactly as before. Expense shows only a 📎 (no `<img>`), so no display
  rewire. Module bytes/sha256 recomputed (`_v/_fix_mod_meta.js`). Proven: `_v/_photo_rewire_check.js` 8/8.
- **DSR photo rewire DEFERRED:** transient/auto-pruned photos + the rewire needs risky async-`<img>`
  changes in the report/print path that can't be validated off-device. The engine stores DSR's inline
  base64 fine. Build-ready design captured in the audit workflow result for a later device-validated pass.
- **Build 2.0 shipped to `latest`** (the daily build): `STORAGE_CORE_ENABLED=true`, `APK_BUILD "2.0"`,
  versionCode 4. The flag-OFF baseline remains in git history (build 1.3, `eb0dc20`) for rollback (reinstall
  an earlier asset). Owner's chosen rollout: KEEP DUMMY DATA, shake out on the real phone (camera capture,
  app-kill persistence, backup→restore incl. the bill photo, factory reset), THEN switch to real data. The
  §14 durability gauntlet remains the owner's to run on-device — that is the last gate before real data.
