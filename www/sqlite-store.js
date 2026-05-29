/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR CONTROL CENTRE — SQLite durable backing store  (Design A)
   ───────────────────────────────────────────────────────────────────────────
   localStorage stays the SYNCHRONOUS working store every module already uses.
   This layer attaches a real SQLite database (sql.js / WASM, persisted to a
   `bcc.sqlite` file via Capacitor Filesystem) as a DURABLE MIRROR:
     • startup → init sql.js → load bcc.sqlite (if present)
     • RECOVERY: if localStorage is empty but the DB has rows (e.g. WebView data
       was cleared but the file survived, or restore on a new install) →
       hydrate localStorage from the DB, then reload so the shell re-reads.
     • MIGRATE-UP: otherwise copy every localStorage key into the DB.
     • WRITE-THROUGH: from then on, every write (shell via Storage.prototype,
       module-iframes via the existing ST_AUDIT postMessage) is mirrored to the
       DB and the file is re-saved (debounced + on pause).
   FALLBACK: if Capacitor/WASM is unavailable or anything throws, we do NOTHING
   to localStorage — the app runs exactly as it does today on pure localStorage.
   This keeps the blast radius bounded: SQLite can only ADD durability, never
   break the working store.
   Exposes window.SaagarDB { ready, status, save, allKeys, query, prune, raw }.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DB_FILE = 'bcc.sqlite';
  var SAVE_DEBOUNCE = 3000;
  var LOG_KEY = 'saagar_sqlite_log';

  var SQL = null, db = null, ready = false, dirty = false, saveTimer = null, lastSavedAt = null, lastError = '';

  // Capture NATIVE localStorage methods up-front (before any wrapping).
  var nGet = localStorage.getItem.bind(localStorage);
  var nSet = localStorage.setItem.bind(localStorage);
  var nRemove = localStorage.removeItem.bind(localStorage);
  var nClear = localStorage.clear.bind(localStorage);

  function FSplugin() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) || null; }
  function dataDir() {
    // Capacitor v6 Directory enum value for app-private data
    try { if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) return 'DATA'; } catch (e) {}
    return 'DATA';
  }

  function log(m) {
    try { var a = JSON.parse(nGet(LOG_KEY) || '[]'); a.unshift({ at: new Date().toISOString(), m: String(m) }); if (a.length > 60) a = a.slice(0, 60); nSet(LOG_KEY, JSON.stringify(a)); } catch (e) {}
    try { console.log('[sqlite-store] ' + m); } catch (e) {}
  }

  /* ── base64 <-> bytes (chunked; safe for large DB blobs) ── */
  function bytesToB64(u8) {
    var CHUNK = 0x8000, out = '';
    for (var i = 0; i < u8.length; i += CHUNK) out += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    return btoa(out);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /* ── kv table ops ── */
  function kvUpsert(k, v) {
    if (!db) return;
    try { db.run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [String(k), String(v == null ? '' : v)]); dirty = true; scheduleSave(); }
    catch (e) { lastError = e.message || 'upsert'; }
  }
  function kvDelete(k) {
    if (!db) return;
    try { db.run('DELETE FROM kv WHERE k=?', [String(k)]); dirty = true; scheduleSave(); }
    catch (e) { lastError = e.message || 'delete'; }
  }
  function kvAll() {
    var o = {}; if (!db) return o;
    try { var r = db.exec('SELECT k,v FROM kv'); if (r && r[0]) r[0].values.forEach(function (row) { o[row[0]] = row[1]; }); } catch (e) {}
    return o;
  }

  /* ── persist the whole DB file (debounced) ── */
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, SAVE_DEBOUNCE); }
  function save() {
    var FS = FSplugin();
    if (!ready || !db || !dirty || !FS) return Promise.resolve(false);
    try {
      var data = db.export(); var b64 = bytesToB64(data);
      return FS.writeFile({ path: DB_FILE, data: b64, directory: dataDir() })
        .then(function () { dirty = false; lastSavedAt = new Date().toISOString(); return true; })
        .catch(function (e) { lastError = (e && e.message) || 'save'; log('save failed: ' + lastError); return false; });
    } catch (e) { lastError = e.message || 'export'; return Promise.resolve(false); }
  }

  /* ── write-through: shell (top-window) writes mirror to the DB ──
     Override on Storage.prototype (NOT the instance): assigning localStorage.setItem on the
     instance is unreliable — some engines (and jsdom) treat it as a stored item rather than a
     method override. Prototype override reliably intercepts every explicit .setItem()/.removeItem()
     call in this window. (Iframes have their own Storage.prototype + the ST_AUDIT bridge, so they
     are unaffected by this.) nSet/nRemove/nClear captured the originals, so no recursion. */
  function installWriteThrough() {
    var SP = (window.Storage && window.Storage.prototype) || null;
    if (!SP) { log('Storage.prototype unavailable — write-through skipped'); return; }
    SP.setItem = function (k, v) { var r = nSet(k, v); if (ready && String(k) !== LOG_KEY) kvUpsert(k, v); return r; };
    SP.removeItem = function (k) { var r = nRemove(k); if (ready && String(k) !== LOG_KEY) kvDelete(k); return r; };
    SP.clear = function () { var r = nClear(); if (ready && db) { try { db.run('DELETE FROM kv'); dirty = true; scheduleSave(); } catch (e) {} } return r; };
  }

  /* ── module-iframe writes arrive via the existing ST_AUDIT postMessage
        (injectModuleAuditBridge). Mirror them into the DB too. ── */
  function installIframeBridge() {
    window.addEventListener('message', function (e) {
      if (!ready || !e.data || e.data.type !== 'ST_AUDIT' || !e.data.action) return;
      var key = e.data.detail && e.data.detail.key; if (!key || String(key) === LOG_KEY) return;
      if (e.data.action === 'module.storage.set') kvUpsert(key, e.data.after == null ? '' : e.data.after);
      else if (e.data.action === 'module.storage.remove') kvDelete(key);
    });
  }

  /* ── reconcile localStorage <-> DB at startup ── */
  function reconcile() {
    var dbRows = kvAll(); var dbKeys = Object.keys(dbRows);
    var lsCount = 0; try { lsCount = localStorage.length; } catch (e) {}
    // RECOVERY: localStorage wiped but DB survived -> hydrate localStorage, reload.
    if (lsCount <= 2 && dbKeys.length > 3) {
      dbKeys.forEach(function (k) { try { nSet(k, dbRows[k]); } catch (e) {} });
      log('recovery: hydrated ' + dbKeys.length + ' keys from DB -> reloading');
      try { localStorage.removeItem('__sqlite_reconciled'); } catch (e) {}
      setTimeout(function () { try { location.reload(); } catch (e) {} }, 250);
      return true; // signal reload pending
    }
    // MIGRATE-UP: ensure every localStorage key exists in the DB.
    var n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (k == null || k === LOG_KEY) continue;
        var v = nGet(k); if (dbRows[k] !== v) { kvUpsert(k, v); n++; }
      }
    } catch (e) {}
    if (n) log('migrated ' + n + ' key(s) localStorage -> DB');
    return false;
  }

  /* ── boot ── */
  function boot() {
    if (typeof initSqlJs !== 'function') { log('sql.js not present — staying on localStorage (fallback)'); return; }
    var t0 = Date.now();
    initSqlJs({ locateFile: function (f) { return f; } }).then(function (_SQL) {
      SQL = _SQL;
      var FS = FSplugin();
      var loadP = FS
        ? FS.readFile({ path: DB_FILE, directory: dataDir() }).then(function (res) { return res && res.data ? b64ToBytes(res.data) : null; }).catch(function () { return null; })
        : Promise.resolve(null);
      return loadP.then(function (bytes) {
        try { db = bytes ? new SQL.Database(bytes) : new SQL.Database(); }
        catch (e) { log('open existing DB failed (' + (e && e.message) + ') — starting fresh'); db = new SQL.Database(); }
        db.run('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
        var reloading = reconcile();
        if (reloading) return;
        ready = true;
        installWriteThrough();
        installIframeBridge();
        if (!FS) log('sqlite ready (in-memory only — no Filesystem to persist)');
        else { dirty = true; save(); log('sqlite ready (' + (bytes ? 'loaded file' : 'new file') + ', ' + (Date.now() - t0) + 'ms)'); }
      });
    }).catch(function (e) { lastError = (e && e.message) || 'init'; log('sql.js init failed: ' + lastError + ' — staying on localStorage'); ready = false; });
  }

  /* ── persist on background/exit so the debounce window can't lose a write ── */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && dirty) save(); });
  window.addEventListener('pagehide', function () { if (dirty) save(); });
  try { if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && window.Capacitor.Plugins.App.addListener) window.Capacitor.Plugins.App.addListener('pause', function () { if (dirty) save(); }); } catch (e) {}

  /* ── public API (used by the archival feature + diagnostics) ── */
  window.SaagarDB = {
    ready: function () { return ready; },
    status: function () { return { ready: ready, rows: ready ? Object.keys(kvAll()).length : 0, dirty: dirty, lastSavedAt: lastSavedAt, lastError: lastError, hasFS: !!FSplugin() }; },
    save: function () { dirty = true; return save(); },
    allKeys: function () { return ready ? Object.keys(kvAll()) : []; },
    query: function (sql, params) { if (!ready || !db) return null; try { return db.exec(sql, params || []); } catch (e) { lastError = e.message; return null; } },
    /* prune keys whose value-JSON carries a date older than cutoff (YYYY-MM-DD); used by archival */
    pruneKeys: function (keys) { if (!ready || !db || !keys || !keys.length) return 0; var n = 0; keys.forEach(function (k) { try { db.run('DELETE FROM kv WHERE k=?', [String(k)]); nRemove(k); n++; } catch (e) {} }); if (n) { dirty = true; save(); } return n; },
    raw: function () { return db; }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
