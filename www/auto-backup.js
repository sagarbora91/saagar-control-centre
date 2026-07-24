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
    if (!Array.isArray(arr)) arr = [];
    arr.unshift(entry);
    if (arr.length > 30) arr = arr.slice(0, 30);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function bytesFromText(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text);
    var encoded = unescape(encodeURIComponent(text));
    var out = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i++) out[i] = encoded.charCodeAt(i);
    return out;
  }

  function textFromBytes(bytes) {
    if (window.TextDecoder) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  function bytesToBase64(bytes) {
    var s = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(s);
  }

  function base64ToBytes(b64) {
    var s = atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function isSealed(bytes) {
    return bytes && bytes.length >= 18 && bytes[0] === 83 && bytes[1] === 66
      && bytes[2] === 67 && bytes[3] === 67 && bytes[4] === 49; /* SBCC1 */
  }

  function writeBytes(FS, path, bytes) {
    return FS.writeFile({
      path: FOLDER + '/' + path,
      data: bytesToBase64(bytes),
      directory: DIR,
      recursive: true
    });
  }

  function readBytes(FS, path) {
    return FS.readFile({ path: FOLDER + '/' + path, directory: DIR })
      .then(function (r) {
        if (!(r && typeof r.data === 'string')) throw new Error('backup file returned no data');
        /* Native Capacitor returns base64 when encoding is omitted. Capacitor Web
           may return legacy UTF-8 text directly, so preserve that compatibility. */
        if (/^\s*[\[{]/.test(r.data)) return bytesFromText(r.data);
        return base64ToBytes(r.data);
      });
  }

  function verifySealedFile(FS, path) {
    return readBytes(FS, path).then(function (bytes) {
      if (!isSealed(bytes)) throw new Error('sealed backup verification failed');
      return bytes;
    });
  }

  /* S3 upgrade migration. A .plaintext safety sidecar is created and verified
     before an old plaintext snapshot is replaced. It is deleted only after the
     sealed replacement reads back with an SBCC1 envelope. If power/storage fails
     mid-upgrade, the next launch can retry from the sidecar without losing data. */
  function hardenExistingSnapshots(FS) {
    if (!FS.readdir || !(window.SaagarStore && typeof window.SaagarStore.seal === 'function')) {
      return Promise.resolve({ sealed: 0, fallback: true });
    }
    return FS.readdir({ path: FOLDER, directory: DIR }).then(function (res) {
      var files = (res && res.files) ? res.files : [];
      var names = files.map(function (f) { return typeof f === 'string' ? f : f.name; });
      var baseNames = {};
      names.forEach(function (n) {
        if (n === 'latest.json' || /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)) baseNames[n] = true;
        if (/\.json\.plaintext$/.test(n)) baseNames[n.slice(0, -10)] = true;
      });
      var sealedCount = 0, fallback = false;
      return Object.keys(baseNames).reduce(function (chain, name) {
        return chain.then(function () {
          var sidecar = name + '.plaintext';
          return readBytes(FS, name).then(function (current) {
            if (isSealed(current)) {
              if (names.indexOf(sidecar) >= 0 && FS.deleteFile) {
                return FS.deleteFile({ path: FOLDER + '/' + sidecar, directory: DIR }).catch(function () {});
              }
              return;
            }
            return writeBytes(FS, sidecar, current)
              .then(function () { return readBytes(FS, sidecar); })
              .then(function (safePlain) {
                return window.SaagarStore.seal(safePlain).then(function (sealed) {
                  if (!(sealed instanceof Uint8Array) || !isSealed(sealed)) {
                    fallback = true;
                    return;
                  }
                  return writeBytes(FS, name, sealed)
                    .then(function () { return verifySealedFile(FS, name); })
                    .then(function () {
                      sealedCount++;
                      return FS.deleteFile
                        ? FS.deleteFile({ path: FOLDER + '/' + sidecar, directory: DIR }).catch(function () {})
                        : undefined;
                    });
                });
              });
          }).catch(function () {
            /* Missing/truncated final after an interrupted replacement: recover
               from the verified plaintext sidecar when one exists. */
            return readBytes(FS, sidecar).then(function (safePlain) {
              return window.SaagarStore.seal(safePlain).then(function (sealed) {
                if (!(sealed instanceof Uint8Array) || !isSealed(sealed)) { fallback = true; return; }
                return writeBytes(FS, name, sealed)
                  .then(function () { return verifySealedFile(FS, name); })
                  .then(function () {
                    sealedCount++;
                    return FS.deleteFile
                      ? FS.deleteFile({ path: FOLDER + '/' + sidecar, directory: DIR }).catch(function () {})
                      : undefined;
                  });
              });
            }).catch(function () { fallback = true; });
          });
        });
      }, Promise.resolve()).then(function () {
        if (sealedCount || fallback) {
          pushLog({ at: nowIso(), mode: fallback ? 'migration-plaintext-fallback' : 'migration-sealed',
            sealed: sealedCount, ok: !fallback });
        }
        return { sealed: sealedCount, fallback: fallback };
      });
    }).catch(function () { return { sealed: 0, fallback: false }; });
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

  function runBackupInner(force) {
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

    var plainBytes = bytesFromText(json);
    var sealPromise;
    if (window.SaagarStore && typeof window.SaagarStore.seal === 'function') {
      sealPromise = Promise.resolve().then(function () { return window.SaagarStore.seal(plainBytes); })
        .then(function (sealed) {
          if (!(sealed instanceof Uint8Array) || !sealed.length) throw new Error('seal returned no data');
          return sealed;
        })
        .catch(function (err) {
          console.warn('[auto-backup] Snapshot sealing unavailable; using app-private plaintext fallback:', err);
          pushLog({ at: nowIso(), date: today, mode: 'file-plaintext-fallback',
            keys: snap.keyCount, ok: false, pendingWrite: true, error: String(err && err.message || err) });
          return plainBytes;
        });
    } else {
      console.warn('[auto-backup] Snapshot sealing unavailable; using app-private plaintext fallback.');
      pushLog({ at: nowIso(), date: today, mode: 'file-plaintext-fallback',
        keys: snap.keyCount, ok: false, pendingWrite: true, error: 'seal API unavailable' });
      sealPromise = Promise.resolve(plainBytes);
    }

    var storedBytes, sealedMode;
    return sealPromise
      .then(function (bytes) {
        storedBytes = bytes;
        sealedMode = isSealed(bytes);
        return writeBytes(FS, 'backup-' + today + '.json', storedBytes);
      })
      .then(function () { return writeBytes(FS, 'latest.json', storedBytes); })
      .then(function () { return pruneOldFiles(FS); })
      .then(function () {
        try { localStorage.setItem(MARKER_KEY, today); } catch (e) {}
        pushLog({ at: nowIso(), date: today, mode: sealedMode ? 'file-sealed' : 'file-plaintext-fallback',
          keys: snap.keyCount, ok: true });
        console.log('[auto-backup] Saved ' + (sealedMode ? 'sealed' : 'PLAINTEXT FALLBACK')
          + ' app-private ' + DIR + '/' + FOLDER + '/backup-' + today + '.json ('
          + snap.keyCount + ' keys).');
        return { ok: true, file: 'backup-' + today + '.json', sealed: sealedMode };
      })
      .catch(function (err) {
        pushLog({ at: nowIso(), date: today, mode: sealedMode ? 'file-sealed' : 'file-plaintext-fallback',
          ok: false, error: String(err && err.message || err) });
        console.warn('[auto-backup] Backup failed:', err);
        return { ok: false, error: err };
      });
  }

  function runBackup(force) {
    var FS = getFS();
    if (!FS) return runBackupInner(force);
    return hardenExistingSnapshots(FS).then(function (migration) {
      if (migration && migration.fallback) {
        console.warn('[auto-backup] Existing plaintext snapshot hardening is pending; durability is preserved.');
      }
      return runBackupInner(force);
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
    function validateText(text) {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid backup payload');
      return text;
    }
    function decode(bytes) {
        var sealed = isSealed(bytes);
        if (!(window.SaagarStore && typeof window.SaagarStore.unseal === 'function')) {
          if (!sealed) return validateText(textFromBytes(bytes));
          var unavailable = new Error('Device-bound backup reader unavailable');
          unavailable.code = 'BACKUP_READER_UNAVAILABLE';
          throw unavailable;
        }
        return window.SaagarStore.unseal(bytes).then(function (plain) {
          if (!plain) {
            var err = new Error('Encrypted for original device');
            err.code = 'DEVICE_BOUND_BACKUP';
            throw err;
          }
          return validateText(textFromBytes(plain));
        });
    }
    function candidates() {
      if (!FS.readdir) return Promise.resolve(['latest.json']);
      return FS.readdir({ path: FOLDER, directory: DIR }).then(function (res) {
        var files = (res && res.files) ? res.files : [];
        var dated = files.map(function (f) { return typeof f === 'string' ? f : f.name; })
          .filter(function (n) { return /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n); })
          .sort().reverse();
        return ['latest.json'].concat(dated);
      }).catch(function () { return ['latest.json']; });
    }
    return candidates().then(function (names) {
      var lastError = null;
      return names.reduce(function (chain, name) {
        return chain.then(function (found) {
          if (found !== null) return found;
          if (FS.stat) {
            return FS.stat({ path: FOLDER + '/' + name, directory: DIR }).then(function (st) {
              if (st && st.size > 64 * 1024 * 1024) {
                var tooLarge = new Error('Backup exceeds 64 MB');
                tooLarge.code = 'BACKUP_TOO_LARGE';
                throw tooLarge;
              }
              return readBytes(FS, name);
            }).then(decode).catch(function (err) { lastError = err; return null; });
          }
          return readBytes(FS, name).then(decode).catch(function (err) { lastError = err; return null; });
        });
      }, Promise.resolve(null)).then(function (found) {
        if (found !== null) return found;
        if (lastError && lastError.code) throw lastError;
        return null;
      });
    });
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
      if (!Array.isArray(log)) log = [];
      var latestWrite = log.filter(function (e) {
        return e && (e.mode === 'file-sealed' || e.mode === 'file-plaintext-fallback'
          || e.mode === 'migration-sealed' || e.mode === 'migration-plaintext-fallback');
      })[0];
      return {
        lastBackup: localStorage.getItem(MARKER_KEY) || 'never',
        native: isNativeApp(),
        folder: DIR + '/' + FOLDER + ' (app-private)',
        plaintextWarning: !!(latestWrite && latestWrite.mode !== 'file-sealed'),
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
