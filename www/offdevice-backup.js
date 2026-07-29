/* BKP-03 automatic encrypted off-device backup.
   Device-local configuration contains only a Keystore-wrapped random backup key,
   its passphrase recovery envelope, and a hashed destination id. The recovery
   passphrase and provider URI are never stored in JavaScript storage. */
(function (root) {
  'use strict';

  var CONFIG_KEY = 'st_v2_offdevice_backup_config_v1';
  var FAILURE_HOURS = 36;
  var inFlight = null;

  function nowIso() { return new Date().toISOString(); }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function clean(value, max) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 160); }
  function notice(message) { try { if (typeof root.toast === 'function') root.toast(message); } catch (_) {} }
  function audit(action, detail) { try { if (typeof root.auditLog === 'function') root.auditLog(action, detail || {}); } catch (_) {} }
  function readRaw() { try { return typeof root.safeGet === 'function' ? root.safeGet(CONFIG_KEY) : root.localStorage.getItem(CONFIG_KEY); } catch (_) { return null; } }
  function writeRaw(value) { try { return typeof root.safeSet === 'function' ? root.safeSet(CONFIG_KEY, value) !== false : (root.localStorage.setItem(CONFIG_KEY, value), true); } catch (_) { return false; } }
  function removeRaw() { try { return typeof root.safeRemove === 'function' ? root.safeRemove(CONFIG_KEY) !== false : (root.localStorage.removeItem(CONFIG_KEY), true); } catch (_) { return false; } }
  function readConfig() {
    var raw = readRaw();
    if (!raw) return null;
    try {
      var value = JSON.parse(raw);
      if (!value || value.version !== 1 || !value.wrappedKey || !value.recovery || !value.destinationId) return { damaged: true };
      return value;
    } catch (_) { return { damaged: true }; }
  }
  function saveConfig(config) {
    if (!writeRaw(JSON.stringify(config))) throw new Error('Automatic-backup configuration could not be saved.');
    return config;
  }
  function plugins() {
    var C = root.Capacitor, P = C && C.Plugins;
    if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform() || !P || !P.SaagarOffDevice || !P.SaagarKeystore || !P.Filesystem) {
      throw new Error('Automatic off-device backup is available only in the installed Android app.');
    }
    return { off: P.SaagarOffDevice, key: P.SaagarKeystore, fs: P.Filesystem };
  }
  function exportApi() {
    var api = root.SaagarExportControl;
    if (!api || typeof api.approveScheduled !== 'function' || typeof api.authorizeScheduled !== 'function') throw new Error('Export control is unavailable.');
    return api;
  }
  function exportMeta(destinationId, rowCount) {
    return {
      exportId: 'backup-auto-offdevice', kind: 'sccbak', scopeId: 'full-portable-backup',
      scopeLabel: 'automatic encrypted off-device backup', module: 'shell', rowCount: rowCount || 0,
      fileName: 'automatic-backup.sccbak', purposeId: 'off-device-business-continuity', destinationId: destinationId
    };
  }
  function rowCount(payload) {
    var total = 0;
    Object.keys(payload.localStorage || {}).forEach(function (key) {
      try { var value = JSON.parse(payload.localStorage[key]); total += Array.isArray(value) ? value.length : (value && typeof value === 'object' ? Object.keys(value).length : 1); }
      catch (_) { total += 1; }
    });
    total += Object.keys(payload.photos || {}).length;
    total += Array.isArray(payload.qmsArchive) ? payload.qmsArchive.length : 0;
    total += Array.isArray(payload.evidence) ? payload.evidence.length : 0;
    return total;
  }
  function utf8Base64(text) {
    var bytes = new TextEncoder().encode(String(text)), binary = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    return btoa(binary);
  }
  function configuredToday(config) { return !!(config && config.lastSuccessAt && String(config.lastSuccessAt).slice(0, 10) === todayIso()); }

  function configure(passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length < 12) return Promise.reject(new Error('Use a recovery passphrase with at least 12 characters.'));
    var P, exports, recovery, destination;
    try { P = plugins(); exports = exportApi(); }
    catch (err) { return Promise.reject(err); }
    var policy = exports.policy();
    if (!policy || policy.damaged || !policy.enabled) return Promise.reject(new Error('Enable file and bulk-data exports before setting up automatic backup.'));
    return root.SaagarPortableBackup.createRecoveryProfile(passphrase).then(function (created) {
      recovery = created;
      return P.off.chooseFolder();
    }).then(function (selected) {
      if (!selected || !selected.configured || !selected.destinationId) throw new Error('The selected off-device folder was not verified.');
      destination = selected;
      var grant = exports.approveScheduled(exportMeta(selected.destinationId, 0));
      if (!grant) throw new Error('Owner approval for automatic backup was not completed.');
      return P.key.wrapKey({ data: recovery.keyBase64 });
    }).then(function (wrapped) {
      if (!wrapped || !wrapped.wrapped) throw new Error('Android Keystore could not protect the automatic-backup key.');
      saveConfig({
        version: 1,
        configuredAt: nowIso(),
        destinationId: destination.destinationId,
        destinationLabel: clean(destination.label || 'Off-device folder', 100),
        wrappedKey: wrapped.wrapped,
        recovery: recovery.profile,
        lastAttemptAt: '', lastSuccessAt: '', lastError: '', consecutiveFailures: 0
      });
      audit('backup.offdevice.configured', { destinationId: destination.destinationId.slice(0, 12), provider: clean(destination.provider, 60) });
      return run(true);
    });
  }
  function run(force) {
    if (inFlight) return inFlight;
    var config = readConfig();
    if (!config || config.damaged) return Promise.resolve({ skipped: true, reason: config && config.damaged ? 'config-damaged' : 'not-configured' });
    if (!force && configuredToday(config)) return Promise.resolve({ skipped: true, reason: 'already-current', lastSuccessAt: config.lastSuccessAt });
    var P, exports;
    try { P = plugins(); exports = exportApi(); } catch (err) { return Promise.reject(err); }
    var token = false, cacheName = '', payload = null;
    config.lastAttemptAt = nowIso();
    try { saveConfig(config); } catch (_) {}
    inFlight = P.off.status().then(function (folder) {
      if (!folder || !folder.configured || folder.destinationId !== config.destinationId) throw new Error('The approved off-device folder permission is missing or changed.');
      if (typeof root.freshPortableBackupPayload !== 'function') throw new Error('Fresh portable-backup reader is unavailable.');
      return root.freshPortableBackupPayload();
    }).then(function (fresh) {
      payload = fresh;
      token = exports.authorizeScheduled(exportMeta(config.destinationId, rowCount(payload)));
      if (!token) throw new Error('Scheduled export authorization was blocked.');
      if (!exports.beginDelivery(token)) throw new Error('Scheduled export register could not start delivery.');
      return P.key.unwrapKey({ wrapped: config.wrappedKey });
    }).then(function (unwrapped) {
      if (!unwrapped || !unwrapped.data) throw new Error('Android Keystore could not unlock the automatic-backup key.');
      return root.SaagarPortableBackup.sealWithKey(payload, unwrapped.data, config.recovery);
    }).then(function (container) {
      cacheName = 'saagar-auto-' + todayIso() + '-' + new Date().toTimeString().slice(0, 8).replace(/:/g, '') + '.sccbak';
      return P.fs.writeFile({ path: cacheName, data: utf8Base64(JSON.stringify(container)), directory: 'CACHE' });
    }).then(function () {
      return P.off.copyFromCache({ path: cacheName, date: todayIso() });
    }).then(function (copied) {
      if (!copied || copied.verified !== true || copied.destinationId !== config.destinationId || !copied.sha256) throw new Error('Off-device readback verification failed.');
      config.lastSuccessAt = nowIso(); config.lastError = ''; config.consecutiveFailures = 0;
      config.lastVerifiedSha256 = clean(copied.sha256, 64); config.lastVerifiedBytes = Math.max(0, Number(copied.size || 0));
      saveConfig(config);
      if (typeof root.setOffDeviceBackup !== 'function' || !root.setOffDeviceBackup()) throw new Error('Off-device backup succeeded, but its recency marker could not be saved.');
      if (!exports.recordOutcome(token, 'completed')) throw new Error('Off-device backup succeeded, but its export register could not be completed.');
      audit('backup.offdevice.verified', { bytes: config.lastVerifiedBytes, sha256: config.lastVerifiedSha256.slice(0, 12), destinationId: config.destinationId.slice(0, 12) });
      try { if (typeof root.renderConfigBackup === 'function') root.renderConfigBackup(); } catch (_) {}
      return { ok: true, verified: true, lastSuccessAt: config.lastSuccessAt, bytes: config.lastVerifiedBytes, dailyFile: copied.dailyFile };
    }).catch(function (err) {
      config.lastError = clean(err && err.message || err || 'automatic backup failed', 180);
      config.lastFailureAt = nowIso(); config.consecutiveFailures = Math.max(0, Number(config.consecutiveFailures || 0)) + 1;
      try { saveConfig(config); } catch (_) {}
      if (token) try { exports.recordOutcome(token, 'failed'); } catch (_) {}
      audit('backup.offdevice.failed', { error: config.lastError, consecutiveFailures: config.consecutiveFailures });
      throw err;
    }).then(function (result) {
      if (!cacheName) return result;
      return P.fs.deleteFile({ path: cacheName, directory: 'CACHE' }).catch(function () {}).then(function () { return result; });
    }, function (err) {
      if (!cacheName) throw err;
      return P.fs.deleteFile({ path: cacheName, directory: 'CACHE' }).catch(function () {}).then(function () { throw err; });
    }).then(function (result) { inFlight = null; return result; }, function (err) { inFlight = null; throw err; });
    return inFlight;
  }

  function status() {
    var config = readConfig();
    if (!config) return { configured: false, failureThresholdHours: FAILURE_HOURS };
    if (config.damaged) return { configured: false, damaged: true, failureThresholdHours: FAILURE_HOURS };
    var baseline = config.lastSuccessAt || config.configuredAt;
    var ageHours = baseline ? Math.max(0, (Date.now() - new Date(baseline).getTime()) / 3600000) : Infinity;
    return {
      configured: true,
      destinationLabel: clean(config.destinationLabel || 'Off-device folder', 100),
      configuredAt: config.configuredAt || '',
      lastAttemptAt: config.lastAttemptAt || '',
      lastSuccessAt: config.lastSuccessAt || '',
      lastError: clean(config.lastError || '', 180),
      consecutiveFailures: Math.max(0, Number(config.consecutiveFailures || 0)),
      failureEscalated: ageHours >= FAILURE_HOURS,
      failureThresholdHours: FAILURE_HOURS,
      lastVerifiedBytes: Math.max(0, Number(config.lastVerifiedBytes || 0))
    };
  }

  function disable() {
    var P, exports;
    try { P = plugins(); exports = exportApi(); } catch (err) { return Promise.reject(err); }
    if (!exports.revokeScheduled()) return Promise.reject(new Error('Owner approval to disable automatic backup was not completed.'));
    return P.off.clearFolder().catch(function () { return null; }).then(function () {
      if (!removeRaw()) throw new Error('Automatic-backup configuration could not be removed.');
      audit('backup.offdevice.disabled', {});
      return { disabled: true };
    });
  }

  root.SaagarOffDeviceBackup = {
    CONFIG_KEY: CONFIG_KEY,
    configure: configure,
    run: run,
    disable: disable,
    status: status
  };
})(typeof window !== 'undefined' ? window : globalThis);