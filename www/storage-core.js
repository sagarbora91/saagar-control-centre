/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR CONTROL CENTRE — STORAGE CORE  (Option C — SQLite-primary, PHASE 2-3)
   ───────────────────────────────────────────────────────────────────────────
   Goal (end state): make an in-memory, SQLite-backed key-value store the source
   of truth so the ~5 MB localStorage ceiling disappears — while keeping the
   SYNCHRONOUS localStorage API every shell function + embedded module uses.

   Build-time flag STORAGE_CORE_ENABLED is OFF by default → this script is a pure
   NO-OP and the app behaves byte-for-byte as it does today. When ON (test/staged):
     • MEM (a Map) is the source of truth once _ready; native localStorage is no
       longer written after _ready (the 5 MB cap is gone). sql.js in-memory DB is
       the persistence layer (atomic .tmp→rename→.bak file writes via Capacitor
       Filesystem). Before _ready (and in the no-FS/no-sql.js fallback) it is
       today's native-localStorage path with a MEM mirror.
     • §13 data-safety hardening: sequenced WAL (crash-durability, never cleared
       past an in-flight persist); atomic .bak rotation (promote-old-live FIRST);
       additive+verified migration with a one-way 'migrated' marker so deleted
       records can NEVER resurrect; DB-wins reconcile on subsequent boots;
       awaited+sequenced Factory Reset; hard boot timeout → fallback.
   FALLBACK: if window.Storage is unavailable or anything throws, we touch nothing.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Build-time flag (Option C). Flip to true ONLY after the §14 gauntlet. ──
     ⚠ ON in this commit — TEST BRANCH `test/sqlite-on` ONLY (on-device gauntlet build). main stays false. */
  var STORAGE_CORE_ENABLED = true;
  /* test/staging override hook — harnesses set window.__FORCE_STORAGE_CORE; never set in production */
  try { if (typeof window !== 'undefined' && window.__FORCE_STORAGE_CORE === true) STORAGE_CORE_ENABLED = true; } catch (e) {}
  if (!STORAGE_CORE_ENABLED) return;   /* ← DEFAULT PATH: do nothing, app == today */

  try {
    var SP = (typeof window !== 'undefined' && window.Storage && window.Storage.prototype) || null;
    if (!SP || !window.localStorage) { try { console.log('[storage-core] Storage unavailable — staying native'); } catch (e) {} return; }
    if (window.SaagarStore && window.SaagarStore.enabled) return;   /* already installed (defensive) */

    /* capture NATIVE methods up-front so the overrides never recurse */
    var nGet = SP.getItem, nSet = SP.setItem, nRemove = SP.removeItem, nClear = SP.clear, nKey = SP.key;
    var nLenDesc = Object.getOwnPropertyDescriptor(SP, 'length');
    var nLen = (nLenDesc && nLenDesc.get) ? nLenDesc.get : function () { return 0; };
    var ls = window.localStorage;

    /* ════════════════════════════════════════════════════════════════════════
       PHASE 2-3 — ASYNC SQLite ENGINE. Before _ready (and in fallback): today's
       native-localStorage passthrough + MEM mirror. After _ready: MEM is the
       source of truth; the sql.js in-memory DB is the persistence layer.
       ════════════════════════════════════════════════════════════════════════ */

    /* ── module-level state + constants ── */
    var SQL = null, db = null, _ready = false, _dirty = false, _saveTimer = null, _resetting = false;
    var _whenReadyCbs = [], _bootTimer = null, _lastError = '', _lastSavedAt = null, _dbFromFile = false;
    var _persisting = false, _persistAgain = false, _persistP = null;   /* §13.2 persist mutex — serialize whole-file FS writes so concurrent flushes never race on the temp files */
    var dirtyKeys = new Set();          /* §13.4 retry set — failed kv writes stay here for retry */
    var _seq = 0;                       /* §13.1 monotonic WAL sequence — makes clear race-free */
    var DB_FILE = 'bcc.sqlite';
    var WAL_KEY = 'saagar_storage_wal';   /* §13.1 synchronous native-LS journal */
    var MIGRATED_KEY = 'saagar_storage_migrated';  /* §13.3 one-way marker: DB is authoritative */
    var LOG_KEY = 'saagar_sqlite_log';
    var INTERNAL = { 'saagar_storage_wal': 1, 'saagar_storage_migrated': 1, 'saagar_sqlite_log': 1 };
    var SAVE_DEBOUNCE = 6000;           /* whole-file export is heavy */
    var BOOT_TIMEOUT_MS = 1800;         /* §13.6 hard timeout */
    var WAL_BIG = 50000;                /* §13.1 'set' values larger than this are journaled as a pointer (forces a prompt persist) */
    var WAL_MAX = 512000;               /* §13.1 byte cap on the WAL JSON so it can never approach the native-LS quota */

    /* ── ported helpers from sqlite-store.js (copy, do not re-import) ── */
    function FSplugin() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) || null; } catch (e) { return null; } }
    function dataDir() { return 'DATA'; }

    function log(m) {
      try { var a = JSON.parse(nGet.call(ls, LOG_KEY) || '[]'); if (!Array.isArray(a)) a = []; a.unshift({ at: new Date().toISOString(), m: '[core] ' + String(m) }); if (a.length > 60) a = a.slice(0, 60); nSet.call(ls, LOG_KEY, JSON.stringify(a)); } catch (e) {}
      try { console.log('[storage-core] ' + m); } catch (e) {}
    }

    function bytesToB64(u8) { var CHUNK = 0x8000, out = ''; for (var i = 0; i < u8.length; i += CHUNK) out += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)); return btoa(out); }
    function b64ToBytes(b64) { var bin = atob(b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

    /* kv table ops — on a thrown DB error, queue the key for retry (§13.4, do NOT swallow) */
    function kvUpsert(k, v) {
      if (!db) { dirtyKeys.add(String(k)); return; }
      try { db.run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [String(k), String(v == null ? '' : v)]); _dirty = true; }
      catch (e) { _lastError = (e && e.message) || 'upsert'; dirtyKeys.add(String(k)); }
    }
    function kvDelete(k) {
      if (!db) { dirtyKeys.add(String(k)); return; }
      try { db.run('DELETE FROM kv WHERE k=?', [String(k)]); _dirty = true; }
      catch (e) { _lastError = (e && e.message) || 'delete'; dirtyKeys.add(String(k)); }
    }
    function kvAll() { var o = {}; if (!db) return o; try { var r = db.exec('SELECT k,v FROM kv'); if (r && r[0]) r[0].values.forEach(function (row) { o[row[0]] = row[1]; }); } catch (e) {} return o; }

    /* MEM = the synchronous working store. Step 0 (sync, instant): hydrate from
       native localStorage so reads work immediately + upgrade-from-localStorage
       migration is lossless. Native stays a parallel copy; once the 'migrated'
       marker is set, reconcile() makes the DB authoritative (DB-wins) so a stale
       native-LS copy can never resurrect a deleted record (§13.3). */
    var MEM = new Map();
    (function hydrate() { try { var n = nLen.call(ls); for (var i = 0; i < n; i++) { var k = nKey.call(ls, i); if (k != null && !INTERNAL[k]) MEM.set(k, nGet.call(ls, k)); } } catch (e) {} })();

    /* ── §13.1 WAL — sequenced synchronous native-LS crash journal ──
       Every set/remove/clear is stamped with a monotonic seq. persist() captures
       the seq it snapshotted and clears ONLY entries <= that seq, so a write that
       lands DURING an in-flight async persist is never dropped. Large 'set' values
       are journaled as a pointer (no inline value) + a forced persist, so the WAL
       can never approach the native-LS quota. */
    function walRead() { var w; try { w = JSON.parse(nGet.call(ls, WAL_KEY) || '[]'); } catch (e) { w = []; } return Array.isArray(w) ? w : []; }
    function appendWAL(op, k, v) {
      var entry;
      if (op === 'clear') entry = { op: 'clear', ts: Date.now(), seq: ++_seq };
      else if (op === 'remove') entry = { op: 'remove', k: k, ts: Date.now(), seq: ++_seq };
      else { /* set */ var big = (v != null && String(v).length > WAL_BIG); entry = big ? { op: 'set', k: k, big: 1, ts: Date.now(), seq: ++_seq } : { op: 'set', k: k, v: v, ts: Date.now(), seq: ++_seq }; }
      try {
        var w = walRead(); w.push(entry);
        var s = JSON.stringify(w);
        if (s.length > WAL_MAX) {
          /* §13.1: do NOT blind-drop oldest entries (that would erase the only synchronously-durable
             record of a not-yet-persisted key). First degrade inline 'set' values to POINTERS (the
             value lives in the DB) so every key keeps a WAL record, and FORCE a prompt persist so the
             DB hits disk promptly. Only shift as an absolute last resort. */
          for (var di = 0; di < w.length && s.length > WAL_MAX; di++) { if (w[di] && w[di].op === 'set' && !w[di].big && w[di].v != null) { delete w[di].v; w[di].big = 1; s = JSON.stringify(w); } }
          while (s.length > WAL_MAX && w.length > 1) { w.shift(); s = JSON.stringify(w); }
          _dirty = true; try { flush(); } catch (_) {}
        }
        nSet.call(ls, WAL_KEY, s);
      } catch (e) {
        /* quota or other failure: do NOT silently lose durability — escalate to a prompt persist */
        _lastError = 'wal:' + ((e && e.message) || 'append'); try { _dirty = true; flush(); } catch (_) {}
      }
      if (entry.big) { _dirty = true; try { flush(); } catch (_) {} }   /* big value: persist promptly so the pointer is quickly backed by the DB */
    }
    /* §13.1 race-free clear: keep only entries newer than the persisted snapshot. Returns # kept. */
    function clearWALThrough(through) {
      try {
        var w = walRead();
        var keep = []; for (var i = 0; i < w.length; i++) { if (w[i] && w[i].seq > through) keep.push(w[i]); }
        if (keep.length) nSet.call(ls, WAL_KEY, JSON.stringify(keep)); else nRemove.call(ls, WAL_KEY);
        return keep.length;
      } catch (e) { return -1; }
    }
    function clearWAL() { try { nRemove.call(ls, WAL_KEY); } catch (e) {} }
    function replayWAL() {                     /* applied in order into MEM + db before reconcile */
      var w = walRead(); if (!w.length) return;
      log('WAL non-empty (' + w.length + ') — replaying');
      for (var i = 0; i < w.length; i++) {
        var op = w[i]; if (!op || !op.op) continue;
        try {
          if (op.op === 'clear') { MEM.clear(); try { db && db.run('DELETE FROM kv'); } catch (e) {} }
          else if (op.op === 'remove') { if (op.k != null) { MEM.delete(op.k); kvDelete(op.k); } }
          else if (op.op === 'set') {
            if (op.big) { /* value not journaled inline — it should already be in the DB from the forced persist; if absent it was lost in the crash. */ if (!MEM.has(op.k)) log('WAL big-set ' + op.k + ' not recoverable from journal (relying on DB)'); }
            else if (op.k != null) { MEM.set(op.k, op.v == null ? '' : op.v); kvUpsert(op.k, op.v == null ? '' : op.v); }
          }
        } catch (e) { log('WAL replay err ' + i + ': ' + (e && e.message)); }
      }
      _dirty = true;
    }

    /* ── §13.2 atomic persist + ordered .bak rotation ──
       Order: promote CURRENT good live → .bak (atomic via .bak.tmp+rename) FIRST,
       THEN write new live (.tmp+rename). At any kill point either (live old, bak
       old/older) or (live new, bak = previous good) — never two bad files. */
    function scheduleSave() { if (_resetting) return; clearTimeout(_saveTimer); _saveTimer = setTimeout(function () { flush(); }, SAVE_DEBOUNCE); }
    function persist() {
      if (_resetting || !_ready || !db || !FSplugin()) return Promise.resolve(false);
      /* MUTEX (§13.2): only one whole-file write at a time. A flush requested mid-persist sets a
         re-run flag and shares the in-flight promise, so callers awaiting flush() see a completed
         persist that reflects the latest state, and the .tmp/.bak files are never raced. */
      if (_persisting) { if (_dirty || dirtyKeys.size) _persistAgain = true; return _persistP; }
      if (!_dirty && !dirtyKeys.size) return Promise.resolve(true);
      _persisting = true;
      var FS = FSplugin(), dir = dataDir(), through, b64;
      try { through = _seq; b64 = bytesToB64(db.export()); }
      catch (e) { _persisting = false; _lastError = (e && e.message) || 'export'; return Promise.resolve(false); }
      _persistP = FS.copy({ from: DB_FILE, to: DB_FILE + '.bak.tmp', directory: dir })   /* 1) promote current good live → .bak (atomic) */
        .then(function () { return FS.rename({ from: DB_FILE + '.bak.tmp', to: DB_FILE + '.bak', directory: dir }); })
        .catch(function () { return null; })                                              /* no live yet (first persist) → skip; .bak lags live by one */
        .then(function () { return FS.writeFile({ path: DB_FILE + '.tmp', data: b64, directory: dir }); })   /* 2) write new live atomically */
        .then(function () { return FS.rename({ from: DB_FILE + '.tmp', to: DB_FILE, directory: dir }); })
        .then(function () { var remaining = clearWALThrough(through); _dirty = (remaining > 0) || dirtyKeys.size > 0; _lastSavedAt = new Date().toISOString(); return true; },
              function (e) { _lastError = (e && e.message) || 'persist'; log('persist failed: ' + _lastError + ' — WAL kept'); return false; })
        .then(function (r) {                                                              /* release mutex; re-run once if a write landed during the in-flight persist */
          _persisting = false;
          if (_persistAgain) { _persistAgain = false; return persist(); }
          if (_dirty || dirtyKeys.size) scheduleSave();
          return r;
        });
      return _persistP;
    }
    function flush() {
      if (db && dirtyKeys.size) { dirtyKeys.forEach(function (k) { try { var v = MEM.get(k); if (v !== undefined) { db.run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [k, v]); } else { db.run('DELETE FROM kv WHERE k=?', [k]); } dirtyKeys.delete(k); } catch (e) { log('retry failed ' + k + ': ' + (e && e.message)); } }); }
      return persist();
    }

    /* ── §13.8 _notify — synthetic StorageEvent for PARENT-window listeners only ──
       MEM-mode stops writing native localStorage, so the browser's 'storage' event
       no longer fires. We re-fire it on THIS window for the only real consumer:
       integration-bridge.js:532 (debounced safeCycle). NOTE: a manually-dispatched
       event does NOT cross frames — the in-iframe injectMobileMode 'storage' listener
       is NOT reached by this (and does not need to be: saagar_ui_mode coherence is
       driven by the ST_UI_MODE postMessage from applyUiModeToFrame, not storage). */
    function _notify(key, oldVal, newVal) {
      try {
        var evt;
        try { evt = new StorageEvent('storage', { key: String(key), oldValue: oldVal == null ? null : String(oldVal), newValue: newVal == null ? null : String(newVal), url: location.href, storageArea: ls }); }
        catch (e) { evt = new Event('storage'); evt.key = String(key); evt.newValue = newVal; evt.oldValue = oldVal; }
        window.dispatchEvent(evt);
      } catch (e) {}
    }

    /* ── §3.2 overrides: MEM authoritative once _ready; native passthrough before ── */
    SP.getItem = function (k) { return _ready ? (MEM.has(String(k)) ? MEM.get(String(k)) : null) : nGet.call(ls, k); };
    SP.setItem = function (k, v) {
      k = String(k); v = String(v);
      appendWAL('set', k, v);                          /* §13.1 synchronous journal FIRST */
      if (_ready) { MEM.set(k, v); kvUpsert(k, v); scheduleSave(); _notify(k, undefined, v); }
      else { var r = nSet.call(ls, k, v); MEM.set(k, v); return r; }   /* pre-ready: today's path + mirror */
    };
    SP.removeItem = function (k) {
      k = String(k);
      appendWAL('remove', k);
      /* §13.3: MIRROR the delete to native LS too. Native is a frozen migration snapshot used only as
         the last-ditch catastrophic safety copy; if we never propagated deletes, a key the user deleted
         in C-mode could resurrect when ALL DB files are lost. Deletes only SHRINK native (sets stay
         MEM-only), so the 5 MB cap stays gone. */
      if (_ready) { MEM.delete(k); kvDelete(k); try { nRemove.call(ls, k); } catch (e) {} scheduleSave(); _notify(k, undefined, null); }
      else { var r = nRemove.call(ls, k); MEM.delete(k); return r; }
    };
    SP.clear = function () {
      if (_ready) {
        appendWAL('clear');                            /* §13.1 single O(1) sentinel — immune to the WAL byte-bound */
        /* §13.3: mirror the clear to native LS too (business keys only — keep WAL/marker/log/demo-guard)
           so the catastrophic re-migration finds no zombies. Synchronous + crash-safe (the WAL sentinel
           handles a crash before persist). */
        try { var ks = []; MEM.forEach(function (_v, k) { if (!INTERNAL[k]) ks.push(k); }); for (var ci = 0; ci < ks.length; ci++) { try { nRemove.call(ls, ks[ci]); } catch (e) {} } } catch (e) {}
        MEM.clear(); try { db && db.run('DELETE FROM kv'); } catch (e) {} dirtyKeys.clear();
        _dirty = true; flush();                        /* force a persist — clear durability must not ride the debounce */
      } else { var r = nClear.call(ls); MEM.clear(); return r; }
    };
    SP.key = function (i) { return _ready ? (Array.from(MEM.keys())[i] || null) : nKey.call(ls, i); };  /* §13.7 ordered */
    try { Object.defineProperty(SP, 'length', { configurable: true, get: function () { return _ready ? MEM.size : nLen.call(ls); } }); } catch (e) {}

    /* ── §13.3 reconcile() — marker-gated migration. Returns {firstBoot, verified}. ──
        • First C-boot (no marker): recovery (DB-only→MEM) + additive migrate-up
          (MEM→DB; native LS NEVER deleted) + PER-KEY verify. boot() sets the marker
          only after a verified pass persists successfully.
        • Subsequent boots (marker + a DB that actually loaded from a file): DB-WINS —
          MEM is replaced from the DB, so a deleted record (still present in the frozen
          native-LS copy that Step-0 hydrated) is dropped and can never resurrect, and
          a key updated in C-mode is never clobbered by the stale native value.
        • Marker present but the DB did NOT load from a file (all files corrupt/missing):
          do NOT wipe — re-migrate from the native-LS safety copy (preserve data). */
    function reconcile() {
      var dbRows = kvAll();
      var migrated = false; try { migrated = !!nGet.call(ls, MIGRATED_KEY); } catch (e) {}

      if (migrated && _dbFromFile) {
        /* DB-WINS: MEM := DB (the DB already reflects any un-persisted ops via replayWAL above). */
        MEM.clear();
        Object.keys(dbRows).forEach(function (k) { if (!INTERNAL[k]) MEM.set(k, dbRows[k]); });
        return { firstBoot: false, verified: true };
      }

      /* First boot, OR catastrophic recovery (marker set but file lost → fall back to native-LS copy). */
      if (migrated && !_dbFromFile) log('migrated marker set but no DB file loaded — re-migrating from native-LS safety copy');
      var recovered = 0;
      Object.keys(dbRows).forEach(function (k) { if (INTERNAL[k]) return; if (!MEM.has(k)) { MEM.set(k, dbRows[k]); recovered++; } });
      if (recovered) log('recovery: hydrated ' + recovered + ' key(s) from DB into MEM');
      var migCount = 0;
      MEM.forEach(function (v, k) { if (INTERNAL[k]) return; if (dbRows[k] !== v) { kvUpsert(k, v); migCount++; } });
      if (migCount) log('migrated ' + migCount + ' key(s) MEM → DB');
      /* §13.3 PER-KEY verification (not just a count). */
      var verified = true, mism = 0;
      try {
        var after = kvAll();
        MEM.forEach(function (v, k) { if (INTERNAL[k]) return; if (after[k] !== v) { verified = false; mism++; dirtyKeys.add(k); } });
        if (!verified) log('verify mismatch on ' + mism + ' key(s) — DB NOT promoted; data safe in MEM + native LS; retrying');
      } catch (e) { verified = false; }
      return { firstBoot: !migrated, verified: verified };
    }

    /* ── §13.5 / §13.6 boot (async) ── */
    function setReady() { if (_ready) return; _ready = true; clearTimeout(_bootTimer); var cbs = _whenReadyCbs.slice(); _whenReadyCbs.length = 0; cbs.forEach(function (cb) { try { cb(); } catch (e) {} }); }
    function bootTimeoutFallback() { if (_ready) return; log('boot timeout — native-LS fallback (MEM already hydrated at Step 0)'); setReady(); }
    function boot() {
      if (typeof initSqlJs !== 'function') { log('sql.js absent — native-LS fallback'); setReady(); return; }
      _bootTimer = setTimeout(bootTimeoutFallback, BOOT_TIMEOUT_MS);
      initSqlJs({ locateFile: function (f) { return f; } }).then(function (_SQL) {
        if (_ready) return;
        SQL = _SQL; var FS = FSplugin();
        function rd(path) { return FS ? FS.readFile({ path: path, directory: dataDir() }).then(function (r) { return r && r.data ? b64ToBytes(r.data) : null; }).catch(function () { return null; }) : Promise.resolve(null); }
        /* open + VALIDATE: sql.js does not throw on a corrupt blob at construction — only on first
           access. Probe with PRAGMA so corruption is detected at open time and recovery fires. */
        /* §13.2: PRAGMA quick_check is a FULL page-structure scan (not just page-1 schema_version),
           so a file torn within its first 4 KB is rejected here and the chain falls through to
           .tmp/.bak/fresh instead of being adopted and throwing later (outside this recovery chain). */
        function open(b) { var d = null; try { d = b ? new SQL.Database(b) : new SQL.Database(); var ic = d.exec('PRAGMA quick_check'); if (!(ic && ic[0] && ic[0].values && String(ic[0].values[0][0]).toLowerCase() === 'ok')) { try { d.close(); } catch (_) {} return false; } db = d; return true; } catch (e) { try { if (d) d.close(); } catch (_) {} return false; } }
        /* recovery chain: live → .tmp (an interrupted rename leaves a valid newer .tmp) → .bak → fresh */
        return rd(DB_FILE).then(function (bytes) {
          if (bytes && open(bytes)) { _dbFromFile = true; return; }
          return rd(DB_FILE + '.tmp').then(function (t) {
            if (t && open(t)) { _dbFromFile = true; log('recovered from .tmp (interrupted rename)'); return; }
            return rd(DB_FILE + '.bak').then(function (bak) {
              if (bak && open(bak)) { _dbFromFile = true; log('recovered from .bak'); return; }
              db = new SQL.Database(); _dbFromFile = false; log('no valid DB file — fresh DB');
            });
          });
        }).then(function () {
          if (_ready) return;   /* timeout fired mid-load → honour fallback */
          db.run('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
          replayWAL();
          var rc = reconcile();
          setReady();
          if (FS) {
            flush().then(function (ok) {
              /* set the one-way marker ONLY after a verified first-boot migration is durably persisted */
              if (ok && rc && rc.firstBoot && rc.verified) { try { nSet.call(ls, MIGRATED_KEY, '1'); } catch (e) {} }
            });
          }
        });
      }).catch(function (e) { _lastError = (e && e.message) || 'init'; log('sql.js init failed: ' + _lastError + ' — fallback'); setReady(); });
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
    else document.addEventListener('DOMContentLoaded', boot);

    /* ── background flush (§6). pagehide just flushes (WAL is the synchronous durability layer;
        the old multi-MB 'saagar_emergency_export' dump was never read back — removed). ── */
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && (_dirty || dirtyKeys.size)) flush(); });
    window.addEventListener('pagehide', function () { if (_dirty || dirtyKeys.size) flush(); });
    try { if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && window.Capacitor.Plugins.App.addListener) window.Capacitor.Plugins.App.addListener('pause', function () { if (_dirty || dirtyKeys.size) flush(); }); } catch (e) {}

    /* ── §13.5 full Factory-Reset wipe — atomic + awaited (called by index.html factoryReset) ── */
    function resetAll() {
      _resetting = true; clearTimeout(_saveTimer); clearTimeout(_bootTimer);
      try { MEM.clear(); } catch (e) {}
      try { if (db) db.run('DELETE FROM kv'); } catch (e) {}
      _dirty = false; dirtyKeys.clear();
      try { nClear.call(ls); } catch (e) {}                                  /* native LS (incl. WAL + marker) */
      try { nSet.call(ls, 'saagar_demo_seeded', 'cleared'); } catch (e) {}   /* survive the reload so the seeder does NOT repopulate */
      var FS = FSplugin(), ps = [];
      if (FS) ['', '.tmp', '.bak', '.bak.tmp'].forEach(function (s) { try { ps.push(FS.deleteFile({ path: DB_FILE + s, directory: dataDir() }).catch(function () {})); } catch (e) {} });
      try { if (window.SaagarStore && window.SaagarStore.photo && window.SaagarStore.photo.clearAll) ps.push(Promise.resolve(window.SaagarStore.photo.clearAll()).catch(function () {})); } catch (e) {}
      return Promise.all(ps);
    }

    /* ── §3.8 window.SaagarStore — the surface the iframe shim + shell call ── */
    window.SaagarStore = {
      enabled: true,
      phase: 2,
      mode: 'mem-source',
      get: function (k) { return _ready ? (MEM.has(String(k)) ? MEM.get(String(k)) : null) : nGet.call(ls, k); },
      set: function (k, v) { return SP.setItem.call(ls, k, v); },
      remove: function (k) { return SP.removeItem.call(ls, k); },
      keys: function () { if (_ready) return Array.from(MEM.keys()); var a = [], n = nLen.call(ls); for (var i = 0; i < n; i++) a.push(nKey.call(ls, i)); return a; },
      length: function () { return _ready ? MEM.size : nLen.call(ls); },
      ready: function () { return _ready; },
      whenReady: function (cb) { if (typeof cb !== 'function') return; if (_ready) { try { cb(); } catch (e) {} } else _whenReadyCbs.push(cb); },
      flush: function () { _dirty = true; return flush(); },
      _reset: function () { return resetAll(); },                            /* §13.5 awaited full wipe */
      /* ── diagnostics ── */
      _phase: 2,
      _mem: function () { return MEM; },
      _status: function () { return { ready: _ready, dirty: _dirty, dirtyKeys: dirtyKeys.size, lastSavedAt: _lastSavedAt, lastError: _lastError, hasFS: !!FSplugin(), migrated: !!(function () { try { return nGet.call(ls, MIGRATED_KEY); } catch (e) { return 0; } })(), dbFromFile: _dbFromFile, rows: db ? Object.keys(kvAll()).length : 0 }; },
      _walLen: function () { return walRead().length; },
      _coherent: function () { try { if (_ready) return true; var n = nLen.call(ls); var c = 0; for (var i = 0; i < n; i++) { var k = nKey.call(ls, i); if (INTERNAL[k]) continue; if (MEM.get(k) !== nGet.call(ls, k)) return false; c++; } return MEM.size === c; } catch (e) { return false; } }
    };

    /* §7.2 — adopt the photo facade stashed by photo-store.js (loaded after us). */
    try { if (window.__SaagarPhoto && !window.SaagarStore.photo) window.SaagarStore.photo = window.__SaagarPhoto; } catch (e) {}

    /* §1 — window.SaagarDB delegating facade (sqlite-store.js stands down when we are enabled). */
    window.SaagarDB = {
      ready: function () { return _ready; },
      status: function () { var s = window.SaagarStore._status(); return { ready: s.ready, rows: s.rows, dirty: s.dirty, lastSavedAt: s.lastSavedAt, lastError: s.lastError, hasFS: s.hasFS }; },
      save: function () { _dirty = true; return flush(); },
      allKeys: function () { return _ready ? Object.keys(kvAll()).filter(function (k) { return !INTERNAL[k]; }) : []; },
      query: function (sql, params) { if (!_ready || !db) return null; try { return db.exec(sql, params || []); } catch (e) { _lastError = e.message; return null; } },
      pruneKeys: function (keys) { if (!_ready || !db || !keys || !keys.length) return 0; var n = 0; keys.forEach(function (k) { try { db.run('DELETE FROM kv WHERE k=?', [String(k)]); MEM.delete(String(k)); n++; } catch (e) {} }); if (n) { _dirty = true; flush(); } return n; },
      raw: function () { return db; }
    };

    try { console.log('[storage-core] phase 2-3 active — MEM source-of-truth (async sql.js); SaagarStore + SaagarDB ready'); } catch (e) {}
  } catch (e) {
    try { console.log('[storage-core] init failed (' + (e && e.message) + ') — staying on native localStorage'); } catch (_) {}
  }
})();
