# R0-W2 RECON — storage-core.js end-to-end map + encrypt-layer slot-in contract
File: V:\Co work\Projects\Retail\saagar-control-centre\www\storage-core.js (435 lines, IIFE, read verbatim; NO edits made).

## 1. Flag & install guard
- L30 `var STORAGE_CORE_ENABLED = true;` — LIVE. L33 `if (!STORAGE_CORE_ENABLED) return;` = rollback path (pure no-op → native LS). L32 test override `window.__FORCE_STORAGE_CORE`.
- L36-38: bail if no `window.Storage.prototype`/`localStorage`; defensive re-install guard `if (window.SaagarStore && window.SaagarStore.enabled) return;` (L38).
- L41-44: native methods captured up-front (`nGet/nSet/nRemove/nClear/nKey`, `nLen` descriptor) — overrides never recurse.

## 2. State/constants (L53-70)
`SQL, db, _ready, _dirty, _bulk, _saveTimer, _resetting` (L53); `_whenReadyCbs, _bootTimer, _lastError, _lastSavedAt, _dbFromFile` (L54); persist mutex `_persisting/_persistAgain/_persistP` (L55); `dirtyKeys` retry Set (L56); WAL `_seq` (L57). Files/keys: `DB_FILE='bcc.sqlite'` (L58), `WAL_KEY='saagar_storage_wal'` (L59), `MIGRATED_KEY='saagar_storage_migrated'` (L60), `LOG_KEY='saagar_sqlite_log'` (L61), `INTERNAL` map of those 3 (L62). Tunables: `SAVE_DEBOUNCE=6000` (L63), `BOOT_TIMEOUT_MS=6000` w/ `window.__BOOT_TIMEOUT_MS` override (L64-68), `WAL_BIG=50000` (L69), `WAL_MAX=512000` (L70).

## 3. Boot chain, line by line
- **Step 0 sync hydrate (L102-103)**: `MEM = new Map()`; immediate IIFE copies every non-INTERNAL native-LS key into MEM: `MEM.set(k, nGet.call(ls, k))`. Reads work instantly, pre-`_ready`.
- **boot() scheduling (L346-347)**: `if (document.readyState === 'complete' || 'interactive') boot(); else DOMContentLoaded`.
- **boot() (L300-345)**: L301 no `initSqlJs` → `setReady()` native-LS fallback. L302 arm `_bootTimer` → `bootTimeoutFallback` (L299: logs, `setReady()`; MEM already hydrated). L303 `initSqlJs({locateFile:f=>f})` (sql-wasm.js/.wasm are local files — offline OK). L304 `if (_ready) return;` inside .then — only skips if ready was set by... note: this early-return is BEFORE FS read; the late-heal path below is inside the subsequent chain, so a timeout firing after L304 passes still heals.
  - `rd(path)` (L306): `FS.readFile({path, directory:'DATA'})` → `b64ToBytes(r.data)`; `.catch(()=>null)`; no FS plugin → `Promise.resolve(null)`. **This is the decrypt hook point.**
  - `open(b)` (L312): `new SQL.Database(b)` + `PRAGMA quick_check` must return 'ok', else close+false. Corruption detected at open, not first access.
  - **Recovery chain (L313-322)**: `rd(DB_FILE)` → live ok? `_dbFromFile=true` : `rd('.tmp')` ("interrupted rename leaves a valid newer .tmp", L317) : `rd('.bak')` (L318-319) : `db = new SQL.Database(); _dbFromFile=false` fresh (L320).
  - **Post-load (L323-343)**: `var lateHeal = _ready;` (L330 — §13.6: timeout fallback already fired → do NOT abandon load); `db.run('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)')` (L331); `replayWAL()` (L332); `reconcile()` (L333); `_keysCache = null` (L334); `setReady()` (L336, idempotent per L298); then `if (FS) flush().then(ok => { if (ok && rc.firstBoot && rc.verified) nSet MIGRATED_KEY='1' })` (L337-342) — one-way marker only after a verified, durably-persisted first migration.
  - L344 catch: init failure → log + `setReady()` fallback.
- **setReady() (L298)**: idempotent; clears `_bootTimer`; drains `_whenReadyCbs` (each cb in try/catch).
- **whenReady contract (L380)**: cb fires immediately if `_ready`, else queued. No promise, no error channel, no re-fire.

## 4. reconcile() (L268-295) — §13.3 marker-gated
- `migrated && _dbFromFile` → **DB-WINS**: `MEM.clear()` then MEM := dbRows (non-INTERNAL) (L272-277). Returns `{firstBoot:false, verified:true}`.
- `migrated && !_dbFromFile` → all DB files lost: log + re-migrate from native-LS safety copy (L280) — does NOT wipe.
- First boot / recovery: DB-only keys → MEM (L282), then MEM → DB additive upsert for mismatches (L285), then **per-key verify** re-reading `kvAll()` (L288-293); mismatches → `verified=false`, keys queued into `dirtyKeys`.

## 5. WAL (L105-161)
- `appendWAL` (L112-135): monotonic `++_seq` stamp; 'set' with `String(v).length > WAL_BIG (50000)` journaled as pointer `{big:1}` (no value) + forced `_dirty=true; flush()` (L134). WAL JSON > `WAL_MAX` (512000): first degrade inline sets to pointers (L125), then shift as last resort (L126), + forced flush. Append failure (quota) → escalate to prompt persist (L130-133), NOT silent.
- `clearWALThrough(through)` (L137-144): keep only `seq > through` — race-free vs in-flight persist. `-1` on error.
- `replayWAL` (L146-161): ordered apply into MEM + db pre-reconcile; big-set entries rely on DB ("if absent it was lost in the crash", L155).

## 6. Persist pipeline (L163-198)
- `scheduleSave` (L167): no-op if `_resetting || _bulk`; debounce 6s.
- `persist()` (L168-193): gates `_resetting || !_ready || !db || !FSplugin()` → resolve(false) (L169). **Mutex** (L173): if `_persisting`, set `_persistAgain` and return shared `_persistP`. Clean → resolve(true) (L174). **Snapshot (L177): `through = _seq; b64 = bytesToB64(db.export());`** — THE single encrypt hook point; export throw → `_lastError`, resolve(false) (L178). Write chain L179-191: `copy(live → .bak.tmp)` → `rename → .bak`, `.catch(()=>null)` (first persist, no live), then `writeFile(DB_FILE+'.tmp', data:b64)` → `rename → DB_FILE`; success → `clearWALThrough(through)`, `_dirty = remaining>0 || dirtyKeys.size>0`, `_lastSavedAt`; failure → log "WAL kept", false; finally release mutex, re-run once if `_persistAgain`, else `scheduleSave()` if still dirty.
- `flush()` (L194-198): `_bulk` → false; drains `dirtyKeys` into db (upsert if `MEM.get(k)!==undefined` else delete); then `persist()`.
- Background flush triggers: visibilitychange-hidden (L351), pagehide (L352), Capacitor App 'pause' (L353). All condition on `_dirty || dirtyKeys.size`.

## 7. MEM semantics + overrides (L224-256)
- `getItem` (L225): `_ready ? (MEM.has(k)?MEM.get(k):null) : nGet` — post-ready reads NEVER touch native LS. Missing key → null (spec-compliant).
- `setItem` (L226-233): bulk-mode short path (MEM+kvUpsert only, L228); else `appendWAL FIRST` (L230), then post-ready MEM.set + kvUpsert + scheduleSave + `_notify`; pre-ready native write + MEM mirror.
- `removeItem` (L234-243): WAL, then post-ready MEM.delete + kvDelete + **mirror delete to native LS** (L241, §13.3 anti-zombie; "Deletes only SHRINK native").
- `clear` (L244-254): WAL 'clear' sentinel; mirror-clear business keys from native (keeps INTERNAL); `db.run('DELETE FROM kv')`; forced `flush()` (L252 — clear never rides the debounce).
- `key(i)`/`length` (L255-256): ordered via `_keysCache`/`memKeys()` (L221-222, O(n²)→O(n) fix); cache nulled on any key-set change.
- `_notify` (L207-214): synthetic StorageEvent on THIS window only (does NOT cross frames; consumer = integration-bridge.js:532 per comment L204).
- Error swallowing: `kvUpsert/kvDelete` catch → `_lastError` + `dirtyKeys` retry (L85-94, "do NOT swallow"); `kvAll` catch → `{}` silently (L95); hydrate/`_notify`/log/native-mirror ops swallow fully.

## 8. Public API (L370-429)
`window.SaagarStore`: enabled, phase:2, mode:'mem-source', get/set/remove (delegate to SP overrides), keys, length, ready, whenReady, flush, **bulk** (L387-393: `_bulk=true; try{fn()}finally{_bulk=false}` then one flush), **bulkAsync** (L399-407: async window, both branches clear `_bulk` + flush), `_reset` → resetAll (L356-367: awaited wipe of MEM/db/native/all 4 files + photo.clearAll), diagnostics `_mem/_status/_walLen/_coherent`. `window.SaagarStore.photo` adopted from `__SaagarPhoto` (L418). `window.SaagarDB` facade (L421-429): ready/status/save/allKeys/query/pruneKeys/**raw()** (returns db). sqlite-store.js:29 stands down when core enabled.

## 9. WHERE ENCRYPTION SLOTS IN — zero public-API change
The design gift: **plaintext never leaves the process except at exactly two chokepoints**, both already async, both already base64-string shaped:
1. **Encrypt-on-persist — L177**: `b64 = bytesToB64(db.export())` inside `persist()`. Becomes `encryptB64(db.export())`. Everything downstream (`writeFile data: b64`, L182) is opaque-blob agnostic. The mutex guarantees single-flight, and the L178 catch already handles a throwing transform (sets `_lastError`, returns false, WAL kept → durability posture unchanged on encrypt failure). CAVEAT: WebCrypto `subtle.encrypt` is async — `persist()` currently computes b64 synchronously before building `_persistP`; the encrypt step must move INSIDE the promise chain (snapshot `through=_seq` and `raw=db.export()` synchronously at L177, then `.then(encrypt)` as the first chain link) so the seq-snapshot/WAL-clear invariant (L184 `clearWALThrough(through)`) is preserved.
2. **Decrypt-on-hydrate — L306**: `rd(path)`'s `b64ToBytes(r.data)`. Becomes `decrypt(bytes)` with plaintext-detect fallback (magic check: SQLite header `53 51 4C 69 74 65` / "SQLite format 3\0" vs our ciphertext envelope header) so **existing plaintext bcc.sqlite/.tmp/.bak load unchanged on first encrypted boot** — the in-place migration is then FREE: first `persist()` after boot writes ciphertext, `.bak` rotation (L179-181) promotes the last plaintext live to `.bak` (one plaintext generation lingers; a post-migration `.bak` rewrite or second forced flush retires it). `open()`'s quick_check (L312) is the natural post-decrypt validator: wrong key/garbage → open fails → recovery chain falls through exactly as for corruption — decrypt failure is INDISTINGUISHABLE from corruption to the existing chain, which is both the safety property (never bricks; worst case = fresh DB + native-LS re-migration via L280) and the risk (silent key-loss → looks like data loss; needs explicit "decrypt failed" logging in `rd`, distinct from corrupt).

### Remaining plaintext surfaces NOT covered by those two hooks (must be scoped in the wave contract):
- **WAL (L129 `nSet.call(ls, WAL_KEY, ...)`)**: business values ≤50KB sit in native LS as plaintext JSON, synchronously. Encrypting it breaks the synchronous-durability contract (WebCrypto is async). Options: accept (transient, cleared per persist), or force all sets to pointer-mode (`big:1` for everything → every write triggers prompt persist — regresses the exact ANR that bulk() exists to avoid). Decision needed.
- **Native-LS migration snapshot (Step-0 source, L103)**: the frozen pre-migration plaintext copy of ALL business data lives forever in native LS (deletes mirror through L241, sets don't). At-rest encryption of the DB file is cosmetic while this exists. R0-W2 needs a "retire native snapshot" decision (dangerous: it's the catastrophic-recovery source at L280).
- **`SaagarDB.raw()` (L428) + `query()` (L426)**: in-memory plaintext by design (fine — at-rest only), but confirms encryption must be file-layer, never in the kv rows (index.html consumers use SQL over v).
- **resetAll (L364)** deletes all 4 file suffixes — no change needed; key material (wherever custody lands) must be added to its wipe list only if reset should destroy the key.
- Out of my lane but adjacent: photo-store files, auto-backup exports, `LOG_KEY` diagnostics (logs key NAMES not values — L77 — acceptable).

### Boot-timeout tension (fail-open question, quantified)
Decrypt adds latency inside the 6000ms `BOOT_TIMEOUT_MS` budget (L64). Timeout → `setReady()` on the plaintext native-LS Step-0 mirror (L299) — i.e., the fail-open fallback serves the very plaintext snapshot encryption is meant to protect, then late-heals (L330-335). If native snapshot is retired, the timeout fallback serves an EMPTY/stale MEM instead — the availability-vs-encryption tension lives exactly at L299 + L103, nowhere else.

### Rollback guarantee
Flag off (L30 false) → native LS path. Works ONLY while the native snapshot + delete-mirroring exist; ciphertext bcc.sqlite is simply ignored by native mode, and sqlite-store.js would need the same plaintext-detect in ITS loader (sqlite-store.js:90 uses the same export/b64 shape) or to stay stood-down. Sets made in C-mode post-migration are MEM/DB-only (L231 — never written to native), so flag-off loses post-migration writes; that is the PRE-EXISTING rollback semantics, unchanged by encryption.

WebCrypto availability: not verifiable headless (per crash-history rule); Capacitor Android WebView (System WebView ≥ Chrome 37) exposes `crypto.subtle` on https/capacitor:// secure origins — MUST be device-confirmed (DT-class test) including the opaque-origin case noted in the brief, before any build wave.