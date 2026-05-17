/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR TRADERS — BUSINESS CONTROL CENTRE (V4)
   OFFLINE DAILY AUTO-BACKUP — APK safety net
   ───────────────────────────────────────────────────────────────────────────
   Why this exists:
     WebView localStorage is durable for months inside an installed app, but it
     is still lost if the user uninstalls the app or taps "Clear storage".
     This module writes a dated JSON snapshot of ALL app data to the phone's
     Documents/SaagarBCC-Backups/ folder once per day, fully offline, so months
     of business data can always be recovered (or moved to a new phone).

   How it works:
     - Runs ~6s after the app loads (does not block the UI).
     - Snapshots every localStorage key (all V4 + embedded-module data).
     - Writes Documents/SaagarBCC-Backups/backup-YYYY-MM-DD.json via the
       Capacitor Filesystem plugin.
     - Only one write per calendar day (tracked in localStorage).
     - Keeps the most recent 90 daily files; older ones are pruned.
     - Also keeps a rolling "latest.json" that is always the newest snapshot.
     - In a plain desktop browser (no Capacitor) it degrades gracefully:
       it still records the backup marker and logs to console, no error.

   Restore:
     Open the app → Configuration → Data & Backup → "Restore from JSON",
     and pick any file from Documents/SaagarBCC-Backups/.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FOLDER = 'SaagarBCC-Backups';
  var KEEP_DAYS = 90;                       // retain ~3 months of daily files
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
      directory: 'DOCUMENTS',
      encoding: 'utf8',
      recursive: true
    });
  }

  function pruneOldFiles(FS) {
    if (!FS.readdir) return Promise.resolve();
    return FS.readdir({ path: FOLDER, directory: 'DOCUMENTS' })
      .then(function (res) {
        var files = (res && res.files) ? res.files : [];
        // Capacitor may return strings or {name} objects depending on version
        var names = files.map(function (f) { return (typeof f === 'string') ? f : f.name; })
          .filter(function (n) { return /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n); })
          .sort();
        if (names.length <= KEEP_DAYS) return;
        var toDelete = names.slice(0, names.length - KEEP_DAYS);
        return Promise.all(toDelete.map(function (n) {
          return FS.deleteFile({ path: FOLDER + '/' + n, directory: 'DOCUMENTS' })
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
        + snap.keyCount + ' keys. In the APK this is written to Documents/' + FOLDER + '/.');
      return Promise.resolve({ browser: true });
    }

    return writeFile(FS, 'backup-' + today + '.json', json)
      .then(function () { return writeFile(FS, 'latest.json', json); })
      .then(function () { return pruneOldFiles(FS); })
      .then(function () {
        try { localStorage.setItem(MARKER_KEY, today); } catch (e) {}
        pushLog({ at: nowIso(), date: today, mode: 'file', keys: snap.keyCount, ok: true });
        console.log('[auto-backup] Saved Documents/' + FOLDER + '/backup-' + today
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
  window.SaagarBackup = {
    now: function () { return runBackup(true); },
    status: function () {
      var log = [];
      try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) {}
      return {
        lastBackup: localStorage.getItem(MARKER_KEY) || 'never',
        native: isNativeApp(),
        folder: 'Documents/' + FOLDER,
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
