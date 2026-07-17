/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR TRADERS — BUSINESS CONTROL CENTRE (V4)
   OFFLINE DAILY AUTO-BACKUP — APK safety net
   ───────────────────────────────────────────────────────────────────────────
   Why this exists:
     WebView localStorage is durable for months inside an installed app. This
     module writes a dated JSON snapshot of ALL app data once per day, fully
     offline, as an on-device safety net (recover from a bad in-app operation
     via Configuration → Data & Backup → "Restore from device backup").

   R0-W3 (2026-07-18) — CHANGED FROM Documents/ TO app-private DATA/:
     Earlier builds wrote these full-data snapshots to the SHARED
     Documents/SaagarBCC-Backups/ folder, where ANY file-manager app could read
     the entire business database in plaintext. That is the flank R0-W3 closes.
     Snapshots now live in the app-private DATA/ dir (not world-readable, and
     wiped by uninstall/Clear-storage — which is correct: the auto-backup is an
     in-app safety net, NOT the uninstall/new-phone migration copy).
     UNINSTALL / NEW-PHONE MIGRATION is now exclusively the user-initiated,
     admin-gated MANUAL export/share ("Backup" → Share to Drive), which stays
     plaintext by the owner's explicit choice. The Home nudge escalates when the
     last off-device backup is stale.

   How it works:
     - Runs ~6s after the app loads (does not block the UI).
     - Snapshots every localStorage key (all V4 + embedded-module data).
     - Writes DATA/SaagarBCC-Backups/backup-YYYY-MM-DD.json (app-private).
     - Only one write per calendar day (tracked in localStorage).
     - Keeps the most recent 7 daily files; older ones are pruned.
     - Also keeps a rolling "latest.json" that is always the newest snapshot.
     - In a plain desktop browser (no Capacitor) it degrades gracefully.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FOLDER = 'SaagarBCC-Backups';
  var DIR = 'DATA';                         // R0-W3: app-private (was 'DOCUMENTS' — world-readable)
  var KEEP_DAYS = 7;                         // DATA history is redundant with the live DB; keep a short window
  var MARKER_KEY = 'bcc_autobackup_last';   // YYYY-MM-DD of last successful backup
  var LOG_KEY = 'bcc_autobackup_log';       // small JSON ring of recent results
  var START_DELAY_MS = 6000;                // let the app paint first

  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function nowIso() { return new Date().toISOString(); }

  function getFS() {
    // Capacitor exposes plugins on window.Capacitor.Plugins when no bundler is used.
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      return window.Capacitor.Plugins.Filesystem;
    }
    return null;
  }

  function isNativeApp() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
      ? window.Capacitor.isNativePlatform()
      : (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem));
  }

  /* Snapshot ALL localStorage. In this dedicated WebView every key belongs to
     the app or one of the embedded modules, so a full snapshot is correct and
     also future-proof if new modules add new keys. */
  function snapshot() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      // do not back up our own transient log
      if (k === LOG_KEY) continue;
      data[k] = localStorage.getItem(k);
    }
    return {
      app: 'Saagar Traders Business Control Centre',
      build: 'V4-APK',
      createdAt: nowIso(),
      keyCount: Object.keys(data).length,
      localStorage: data
    };
  }

  function pushLog(entry) {
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { arr = []; }
    arr.unshift(entry);
    if (arr.length > 30) arr = arr.slice(0, 30);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function writeFile(FS, path, text) {
    return FS.writeFile({
      path: FOLDER + '/' + path,
      data: text,
      directory: DIR,
      encoding: 'utf8',
      recursive: true
    });
  }

  function pruneOldFiles(FS) {
    if (!FS.readdir) return Promise.resolve();
    return FS.readdir({ path: FOLDER, directory: DIR })
      .then(function (res) {
        var files = (res && res.files) ? res.files : [];
        // Capacitor may return strings or {name} objects depending on version
        var names = files.map(function (f) { return (typeof f === 'string') ? f : f.name; })
          .filter(function (n) { return /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n); })
          .sort();
        if (names.length <= KEEP_DAYS) return;
        var toDelete = names.slice(0, names.length - KEEP_DAYS);
        return Promise.all(toDelete.map(function (n) {
          return FS.deleteFile({ path: FOLDER + '/' + n, directory: DIR })
            .catch(function () {});
        }));
      })
      .catch(function () { /* folder may not exist yet — ignore */ });
  }

  function runBackup(force) {
    var today = todayStr();
    var last = null;
    try { last = localStorage.getItem(MARKER_KEY); } catch (e) {}

    if (!force && last === today) {
      // Already backed up today — nothing to do.
      return Promise.resolve({ skipped: true });
    }

    var snap = snapshot();
    var json = JSON.stringify(snap);
    var FS = getFS();

    if (!FS) {
      // Plain browser / Capacitor not available — degrade gracefully.
      try { localStorage.setItem(MARKER_KEY, today); } catch (e) {}
      pushLog({ at: nowIso(), date: today, mode: 'browser-noop', keys: snap.keyCount });
      console.log('[auto-backup] No native filesystem (browser preview). Snapshot ready, '
        + snap.keyCount + ' keys. In the APK this is written to app-private ' + DIR + '/' + FOLDER + '/.');
      return Promise.resolve({ browser: true });
    }

    return writeFile(FS, 'backup-' + today + '.json', json)
      .then(function () { return writeFile(FS, 'latest.json', json); })
      .then(function () { return pruneOldFiles(FS); })
      .then(function () {
        try { localStorage.setItem(MARKER_KEY, today); } catch (e) {}
        pushLog({ at: nowIso(), date: today, mode: 'file', keys: snap.keyCount, ok: true });
        console.log('[auto-backup] Saved app-private ' + DIR + '/' + FOLDER + '/backup-' + today
          + '.json (' + snap.keyCount + ' keys).');
        return { ok: true, file: 'backup-' + today + '.json' };
      })
      .catch(function (err) {
        pushLog({ at: nowIso(), date: today, mode: 'file', ok: false, error: String(err && err.message || err) });
        console.warn('[auto-backup] Backup failed:', err);
        return { ok: false, error: err };
      });
  }

  /* Public manual trigger — can be called from the app or dev console:
       window.SaagarBackup.now()           → force a backup right now
       window.SaagarBackup.status()        → last backup date + recent log   */
  /* Read the newest on-device auto-backup (app-private DATA — not reachable via the
     system file picker, so the app offers an explicit "Restore from device backup"). */
  function readLatest() {
    var FS = getFS();
    if (!FS) return Promise.resolve(null);
    return FS.readFile({ path: FOLDER + '/latest.json', directory: DIR, encoding: 'utf8' })
      .then(function (r) { return (r && r.data) ? r.data : null; })
      .catch(function () { return null; });
  }

  /* R0-W3 S2: one-time purge of the LEGACY world-readable auto-backup files from the
     shared Documents/ folder. SCOPED to the auto-backup naming ONLY — backup-YYYY-MM-DD.json
     + latest.json — so it NEVER touches the user's pre-reset-*.json safety backups or the
     archival day-record exports that legitimately live in the same folder. Idempotent;
     returns the count deleted. Caller gates this behind an owner confirmation that a fresh
     off-device backup exists. */
  function purgeLegacyDocs() {
    var FS = getFS();
    if (!FS || !FS.readdir) return Promise.resolve({ deleted: 0, native: !!FS });
    return FS.readdir({ path: FOLDER, directory: 'DOCUMENTS' })
      .then(function (res) {
        var files = (res && res.files) ? res.files : [];
        var names = files.map(function (f) { return (typeof f === 'string') ? f : f.name; })
          .filter(function (n) { return n === 'latest.json' || /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n); });
        return Promise.all(names.map(function (n) {
          return FS.deleteFile({ path: FOLDER + '/' + n, directory: 'DOCUMENTS' })
            .then(function () { return true; }).catch(function () { return false; });
        })).then(function (rs) { return { deleted: rs.filter(Boolean).length, scanned: names.length }; });
      })
      .catch(function () { return { deleted: 0, scanned: 0 }; });   /* folder gone / never existed — nothing to purge */
  }

  window.SaagarBackup = {
    now: function () { return runBackup(true); },
    readLatest: readLatest,
    purgeLegacyDocs: purgeLegacyDocs,
    status: function () {
      var log = [];
      try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) {}
      return {
        lastBackup: localStorage.getItem(MARKER_KEY) || 'never',
        native: isNativeApp(),
        folder: DIR + '/' + FOLDER + ' (app-private)',
        recent: log
      };
    }
  };

  /* Kick off shortly after launch, then re-check every 6 hours so a long-running
     session still rolls over to a new day's backup. */
  function schedule() {
    setTimeout(function () {
      runBackup(false);
      setInterval(function () { runBackup(false); }, 6 * 60 * 60 * 1000);
    }, START_DELAY_MS);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    schedule();
  } else {
    document.addEventListener('DOMContentLoaded', schedule);
  }
})();
