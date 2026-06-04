/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR CONTROL CENTRE — PHOTO STORE  (Option C — Phase 3, MECHANISM ONLY)
   ───────────────────────────────────────────────────────────────────────────
   Keeps PHOTOS (bill / cleaning / signature images) OUT of the in-memory MEM map
   and out of the sql.js text DB, so MEM + the whole-file export stay text-only and
   RAM stays bounded (SQLITE_PRIMARY_PLAN.md §5, §12.2). Photos live as Capacitor
   Filesystem files under DATA/saagar-photos/{photoId}.{ext} and are loaded lazily
   on demand (async getter), never held in memory.

   This file is the MECHANISM ONLY — the 10 embedded modules are NOT rewired here
   (that is a flagged follow-up). Nobody calls these methods until that rewire.

   ⚠ DEFERRED CONTRACT — DO NOT rewire any module to call photo.put/get until BACKUP
   AND RESTORE carry photo bytes. TODAY photos are base64 INSIDE localStorage JSON
   values, so the existing JSON backup/restore (index.html backupPayload /
   restoreValidatedBackup) covers them. The moment a module moves a photo to a
   Filesystem ref via this store, the JSON backup carries ONLY the text ref AND the
   binary bcc.sqlite safety-net does NOT contain photos either — so a restore or a
   device migration would SILENTLY lose every bill/cleaning/signature image. Before
   the rewire, add photo snapshot/restore to the export/import path
   (see SQLITE_PRIMARY_PLAN.md §15). Skipping this is silent photo data-loss.

   SELF-GUARDING:
     • Every method self-guards on Capacitor Filesystem being absent → returns
       null/false/[]/0 (graceful degrade; a rewired module would show a placeholder).
     • It MUST NOT synthesize a truthy window.SaagarStore.enabled — that would break
       sqlite-store.js's stand-down guard. So: if window.SaagarStore already exists
       (storage-core built it), attach .photo to it; otherwise stash the facade on a
       non-enumerable window.__SaagarPhoto holder which storage-core adopts when it
       builds SaagarStore. Either way, no engine is implied by loading this file.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PHOTO_DIR = 'saagar-photos';

  function FSplugin() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) || null; } catch (e) { return null; } }
  function dataDir() { return 'DATA'; }   /* app-private; matches storage-core/sqlite-store/Factory Reset */

  /* deterministic, URL-safe reference id for a photo field on a record */
  function refId(module, recordId, field) {
    return String(module) + '_' + String(recordId) + '_' + String(field).replace(/\./g, '');
  }

  /* mime/ext helpers — photos come in as data URLs (data:image/png;base64,…) */
  function extFromDataUrl(dataUrl) {
    var m = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(String(dataUrl || ''));
    if (!m) return 'bin';
    var t = m[1].toLowerCase();
    if (t === 'jpeg' || t === 'jpg') return 'jpg';
    if (t === 'svg+xml') return 'svg';
    return t.replace(/[^a-z0-9]/g, '') || 'bin';
  }
  function mimeFromExt(ext) {
    ext = String(ext || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    return 'application/octet-stream';
  }
  function b64FromDataUrl(dataUrl) {
    var s = String(dataUrl || ''); var i = s.indexOf('base64,');
    return i >= 0 ? s.slice(i + 7) : s;   /* tolerate a bare base64 string */
  }
  function pathFor(photoId, ext) { return PHOTO_DIR + '/' + String(photoId) + '.' + String(ext || 'bin'); }

  /* find the on-disk file for a photoId regardless of extension (we don't track ext separately) */
  function findFile(FS, photoId) {
    return FS.readdir({ path: PHOTO_DIR, directory: dataDir() })
      .then(function (res) {
        var files = (res && res.files) || [];
        for (var i = 0; i < files.length; i++) {
          var nm = (files[i] && (files[i].name != null ? files[i].name : files[i]));   /* v6 returns {name,type}; older returns string */
          if (nm && String(nm).indexOf(String(photoId) + '.') === 0) return String(nm);
        }
        return null;
      })
      .catch(function () { return null; });
  }

  /* ── public API ── */
  var photo = {
    refId: refId,

    /* put(photoId, dataUrl) → writes the file, returns the photoId (the durable ref) or null */
    put: function (photoId, dataUrl) {
      var FS = FSplugin(); if (!FS || !photoId || !dataUrl) return Promise.resolve(null);
      var ext = extFromDataUrl(dataUrl); var b64 = b64FromDataUrl(dataUrl);
      return FS.mkdir({ path: PHOTO_DIR, directory: dataDir(), recursive: true }).catch(function () { return null; })
        .then(function () {
          /* overwrite any prior ext for this id so stale variants don't linger */
          return findFile(FS, photoId).then(function (old) {
            if (old && old !== String(photoId) + '.' + ext) { return FS.deleteFile({ path: PHOTO_DIR + '/' + old, directory: dataDir() }).catch(function () { return null; }); }
            return null;
          });
        })
        .then(function () { return FS.writeFile({ path: pathFor(photoId, ext), data: b64, directory: dataDir() }); })
        .then(function () { return String(photoId); })
        .catch(function () { return null; });
    },

    /* get(photoId) → resolves to a data URL (data:<mime>;base64,…) or null */
    get: function (photoId) {
      var FS = FSplugin(); if (!FS || !photoId) return Promise.resolve(null);
      return findFile(FS, photoId).then(function (nm) {
        if (!nm) return null;
        var ext = (nm.split('.').pop() || 'bin');
        return FS.readFile({ path: PHOTO_DIR + '/' + nm, directory: dataDir() })
          .then(function (r) { return r && r.data ? ('data:' + mimeFromExt(ext) + ';base64,' + r.data) : null; })
          .catch(function () { return null; });
      });
    },

    /* exists(photoId) → boolean */
    exists: function (photoId) {
      var FS = FSplugin(); if (!FS || !photoId) return Promise.resolve(false);
      return findFile(FS, photoId).then(function (nm) { return !!nm; });
    },

    /* remove(photoId) → boolean (true if a file was deleted) */
    remove: function (photoId) {
      var FS = FSplugin(); if (!FS || !photoId) return Promise.resolve(false);
      return findFile(FS, photoId).then(function (nm) {
        if (!nm) return false;
        return FS.deleteFile({ path: PHOTO_DIR + '/' + nm, directory: dataDir() }).then(function () { return true; }).catch(function () { return false; });
      });
    },

    /* listAll() → array of photoIds (filename without extension) */
    listAll: function () {
      var FS = FSplugin(); if (!FS) return Promise.resolve([]);
      return FS.readdir({ path: PHOTO_DIR, directory: dataDir() })
        .then(function (res) {
          var files = (res && res.files) || [];
          return files.map(function (f) { var nm = (f && (f.name != null ? f.name : f)); return String(nm).replace(/\.[^.]+$/, ''); }).filter(Boolean);
        })
        .catch(function () { return []; });
    },

    /* count() → number of stored photos */
    count: function () {
      var FS = FSplugin(); if (!FS) return Promise.resolve(0);
      return FS.readdir({ path: PHOTO_DIR, directory: dataDir() })
        .then(function (res) { return ((res && res.files) || []).length; })
        .catch(function () { return 0; });
    },

    /* clearAll() → wipe the whole photo dir (used by Factory Reset). recursive. */
    clearAll: function () {
      var FS = FSplugin(); if (!FS) return Promise.resolve(false);
      return FS.rmdir({ path: PHOTO_DIR, directory: dataDir(), recursive: true })
        .then(function () { return true; })
        .catch(function () { return false; });
    },

    /* §15 BACKUP: snapshot() → { photoId: dataUrl } of EVERY stored photo for the backup bundle.
       Resolves to null when FS is absent or there are no photos (→ backup omits the photos key, stays
       byte-identical to today). */
    snapshot: function () {
      var FS = FSplugin(); if (!FS) return Promise.resolve(null);
      return photo.listAll().then(function (ids) {
        if (!ids || !ids.length) return null;
        return Promise.all(ids.map(function (id) { return photo.get(id).then(function (d) { return { id: id, d: d }; }); }))
          .then(function (rows) { var m = {}; rows.forEach(function (r) { if (r && r.id && r.d) m[r.id] = r.d; }); return Object.keys(m).length ? m : null; });
      }).catch(function () { return null; });
    },

    /* §15 RESTORE: restoreAll({ photoId: dataUrl }) → re-materialize photos on restore (sequential to
       avoid hammering the FS). Resolves to the number written. No-op (0) if FS absent or map empty. */
    restoreAll: function (map) {
      var FS = FSplugin(); if (!FS || !map || typeof map !== 'object') return Promise.resolve(0);
      var ids = Object.keys(map); if (!ids.length) return Promise.resolve(0);
      return ids.reduce(function (p, id) { return p.then(function (n) { return photo.put(id, map[id]).then(function (r) { return n + (r ? 1 : 0); }); }); }, Promise.resolve(0)).catch(function () { return 0; });
    }
  };

  /* Attach without ever synthesizing a truthy SaagarStore.enabled (keeps sqlite-store's
     stand-down guard correct). If storage-core already built SaagarStore → set .photo.
     Otherwise stash on a non-enumerable holder that storage-core adopts (§7.2). Note:
     storage-core LOADS FIRST in index.html, so when the flag is ON, SaagarStore already
     exists here and we attach directly; the __SaagarPhoto holder is the belt-and-suspenders
     path (and the only path when the flag is OFF — harmless, used by nobody until rewire). */
  try {
    if (window.SaagarStore && typeof window.SaagarStore === 'object') {
      window.SaagarStore.photo = photo;
    } else {
      Object.defineProperty(window, '__SaagarPhoto', { value: photo, writable: false, enumerable: false, configurable: true });
    }
  } catch (e) {
    try { window.__SaagarPhoto = photo; } catch (_) {}
  }

  try { console.log('[photo-store] ready (mechanism only — modules not yet rewired)'); } catch (e) {}
})();
