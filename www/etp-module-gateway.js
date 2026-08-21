/* Narrow parent-owned gateway for the modular Retail ETP presentation.
   It deliberately exposes neither the native plugin nor unverified reads. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;
  root.SaagarEtpModuleGatewayFactory = api;
  var boot = api.bootstrap();
  if (boot.ok) root.SaagarEtpModuleGateway = boot.gateway;
  else root.SaagarEtpModuleGatewayStatus = Object.freeze(boot);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 1;
  var REPORTS = Object.freeze(['R003', 'R013', 'R022', 'R025']);
  var REGISTRY_KEY = 'saagar_etp_control_registry_v1';
  var MAX_SCOPES = 20;
  var MAX_HISTORY = 10;
  var MAX_READ_ROWS = 500;
  var FORBIDDEN_FIELD = /(?:^|_)(?:workbook|worksheet|filename|file_label|file_path|source_name|source_bytes|blob|base64|customer|consumer|mobile|phone|email|address|name|aadhaar|pan|dob)(?:$|_)/i;
  var BLOCKED_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);

  function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function exact(value, keys) {
    if (!record(value)) return false;
    var actual = Object.keys(value).sort(), expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function (key, index) { return key === expected[index] && BLOCKED_KEYS.indexOf(key) < 0; });
  }
  function failure(code, stage) { return Object.freeze({ ok: false, code: code, stage: stage || 'GATEWAY' }); }
  function safeCode(value, fallback) {
    var code = String(value || '');
    return /^(?:ETP|XLSX|RETAIL)_[A-Z0-9_]{1,80}$/.test(code) ? code : fallback;
  }
  function cleanFailure(value, fallback, stage) {
    return failure(safeCode(value && value.code, fallback), String(value && value.stage || stage || 'GATEWAY').slice(0, 40));
  }
  function freeze(value) { return Object.freeze(value); }
  function requireMethod(value, name) { return !!value && typeof value[name] === 'function'; }
  function generation(value) { return /^etp_[a-f0-9]{32}$/.test(String(value || '')); }

  function sanitizeScope(checked) {
    var scope = checked && checked.scope;
    if (!record(scope) || typeof checked.key !== 'string') return null;
    return freeze({
      storeCode: String(scope.storeCode),
      financialYear: String(scope.financialYear),
      periodStart: String(scope.periodStart),
      periodEnd: String(scope.periodEnd),
      scopeKey: checked.key
    });
  }

  function sanitizeCoverage(value) {
    var out = {};
    REPORTS.forEach(function (id) {
      var item = value && value[id];
      out[id] = freeze({
        status: String(item && item.status || ''),
        zeroActivityConfirmed: !!(item && item.zeroActivityConfirmed)
      });
    });
    return freeze(out);
  }

  function sanitizeReceipt(value, core) {
    var checked = core.validateReceipt(value);
    if (!checked || !checked.ok) return null;
    var receipt = checked.receipt || value, enrichments = receipt.enrichments || {};
    return freeze({
      contractVersion: String(receipt.contractVersion),
      scopeKey: String(receipt.scopeKey),
      storeCode: String(receipt.storeCode),
      activeGenerationId: String(receipt.activeGenerationId),
      profileVersion: String(receipt.profileVersion),
      ruleVersion: String(receipt.ruleVersion),
      reconciliationStatus: String(receipt.reconciliationStatus),
      publishedAt: String(receipt.publishedAt),
      coverage: sanitizeCoverage(receipt.coverage),
      exceptions: freeze({
        R003: freeze({ status: String(enrichments.R003.status), differenceCount: Number(enrichments.R003.differenceCount) }),
        R013: freeze({ status: String(enrichments.R013.status), differenceCount: Number(enrichments.R013.differenceCount) }),
        paymentType25: freeze({ status: 'QUARANTINED', rowCount: Number(enrichments.paymentType25.rowCount), persisted: false })
      })
    });
  }

  function loadRegistry(storage) {
    try {
      var value = JSON.parse(storage.getItem(REGISTRY_KEY) || '{"scopes":{}}');
      return record(value) && record(value.scopes) ? value.scopes : {};
    } catch (_) { return {}; }
  }

  function safePrimitive(value) {
    return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  function sanitizePage(value, scopeKey, generationId, reportId, fields, limit) {
    var page = value && value.page;
    if (!value || value.ok !== true || !exact(page, ['scopeKey', 'generationId', 'reportId', 'rows', 'hasMore', 'nextCursor'])) return null;
    if (page.scopeKey !== scopeKey || page.generationId !== generationId || page.reportId !== reportId || !Array.isArray(page.rows) || page.rows.length > limit || typeof page.hasMore !== 'boolean') return null;
    var allowed = Object.create(null); fields.forEach(function (field) { allowed[field] = true; });
    var rows = [];
    for (var i = 0; i < page.rows.length; i++) {
      var source = page.rows[i];
      if (!record(source)) return null;
      var row = {}, keys = Object.keys(source);
      for (var n = 0; n < keys.length; n++) {
        var key = keys[n];
        if (!allowed[key] || FORBIDDEN_FIELD.test(key) || BLOCKED_KEYS.indexOf(key) >= 0 || !safePrimitive(source[key])) return null;
        row[key] = source[key];
      }
      rows.push(freeze(row));
    }
    var cursor = null;
    if (page.hasMore) {
      if (!exact(page.nextCursor, ['chunkIndex', 'rowOffset']) || !Number.isSafeInteger(page.nextCursor.chunkIndex) || page.nextCursor.chunkIndex < 0 || !Number.isSafeInteger(page.nextCursor.rowOffset) || page.nextCursor.rowOffset < 0) return null;
      cursor = freeze({ chunkIndex: page.nextCursor.chunkIndex, rowOffset: page.nextCursor.rowOffset });
    } else if (page.nextCursor !== null) return null;
    return freeze({ scopeKey: scopeKey, generationId: generationId, reportId: reportId, rows: freeze(rows), hasMore: page.hasMore, nextCursor: cursor });
  }

  function create(options) {
    options = options || {};
    var runtime = options.runtime, lifecycle = options.lifecyclePolicy, core = options.core;
    var storage = options.storage, statusReader = options.statusReader, tokenFactory = options.tokenFactory;
    if (!requireMethod(runtime, 'run') || !requireMethod(runtime, 'confirm') || !requireMethod(runtime, 'readVerified') ||
        !requireMethod(lifecycle, 'validateScope') || !requireMethod(core, 'validateReceipt') ||
        !storage || typeof storage.getItem !== 'function' || typeof statusReader !== 'function') {
      return failure('ETP_GATEWAY_DEPENDENCY_INVALID', 'CREATE');
    }
    var pending = Object.create(null), sequence = 0;

    function checkedScope(scope) {
      var checked;
      try { checked = lifecycle.validateScope(scope); } catch (_) { return null; }
      return checked && checked.ok ? { checked: checked, scope: sanitizeScope(checked) } : null;
    }
    function currentRaw(scopeKey) {
      var item = loadRegistry(storage)[scopeKey];
      if (!record(item) || !record(item.current)) return null;
      return core.validateReceipt(item.current).ok ? item.current : null;
    }
    async function verifiedContext(scope) {
      var normalized = checkedScope(scope);
      if (!normalized) return { error: failure('ETP_SCOPE_INVALID', 'VERIFY') };
      var receipt = currentRaw(normalized.scope.scopeKey);
      if (!receipt) return { error: failure('ETP_RECEIPT_NOT_FOUND', 'VERIFY') };
      var status;
      try { status = await statusReader(normalized.checked.scope); } catch (_) { return { error: failure('ETP_STATUS_UNAVAILABLE', 'VERIFY') }; }
      if (!status || status.ok !== true || !record(status.status)) return { error: cleanFailure(status, 'ETP_STATUS_UNAVAILABLE', 'VERIFY') };
      var nativeStatus = status.status;
      if (nativeStatus.state !== 'ACCEPTED' || nativeStatus.restoreFence !== false || !generation(nativeStatus.activeGenerationId) || nativeStatus.activeGenerationId !== receipt.activeGenerationId) {
        return { error: failure(nativeStatus.restoreFence ? 'ETP_REIMPORT_REQUIRED' : 'ETP_VERIFIED_GENERATION_UNAVAILABLE', 'VERIFY') };
      }
      return { normalized: normalized, receipt: receipt, status: nativeStatus };
    }
    function makeToken() {
      var candidate = '';
      if (typeof tokenFactory === 'function') candidate = String(tokenFactory());
      else {
        var cryptoApi = options.crypto || (root && root.crypto), bytes = new Uint8Array(16);
        if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
          cryptoApi.getRandomValues(bytes);
          for (var i = 0; i < bytes.length; i++) candidate += ('0' + bytes[i].toString(16)).slice(-2);
        }
      }
      sequence += 1;
      return /^[a-f0-9]{32}$/.test(candidate) ? 'confirm_' + candidate + '_' + sequence : '';
    }

    async function run(request) {
      if (!exact(request, ['scope', 'files', 'coverageDeclaration']) || !Array.isArray(request.files) || request.files.length !== 4) return failure('ETP_IMPORT_REQUEST_INVALID', 'SELECT');
      var normalized = checkedScope(request.scope);
      if (!normalized) return failure('ETP_SCOPE_INVALID', 'SELECT');
      var seen = Object.create(null), files = [];
      for (var i = 0; i < request.files.length; i++) {
        var item = request.files[i], id = String(item && item.selectedReportId || '').toUpperCase();
        if (!exact(item, ['selectedReportId', 'file']) || REPORTS.indexOf(id) < 0 || seen[id] || !item.file) return failure('ETP_REPORT_SELECTION_INVALID', 'SELECT');
        seen[id] = true; files.push({ selectedReportId: id, file: item.file });
      }
      var result;
      try { result = await runtime.run({ scope: normalized.checked.scope, files: files, coverageDeclaration: request.coverageDeclaration }); }
      catch (_) { return failure('ETP_IMPORT_FAILED', 'IMPORT'); }
      if (!result || result.ok !== true) return cleanFailure(result, 'ETP_IMPORT_FAILED', 'IMPORT');
      if (result.awaitingConfirmation === true) {
        if (!record(result.lifecycle) || result.lifecycle.state !== 'AWAITING_CONFIRMATION' || result.lifecycle.scopeKey !== normalized.scope.scopeKey || !generation(result.lifecycle.candidateGenerationId)) return failure('ETP_GATEWAY_RESPONSE_INVALID', 'IMPORT');
        var token = makeToken();
        if (!token) return failure('ETP_GATEWAY_ENTROPY_UNAVAILABLE', 'IMPORT');
        pending[token] = result.lifecycle;
        return freeze({ ok: true, state: 'AWAITING_CONFIRMATION', changed: false, scope: normalized.scope, confirmationToken: token });
      }
      if (result.duplicate === true && result.changed === false) return freeze({ ok: true, state: 'DUPLICATE_NOOP', changed: false, scope: normalized.scope });
      return failure('ETP_GATEWAY_RESPONSE_INVALID', 'IMPORT');
    }

    async function confirm(request) {
      if (!exact(request, ['confirmationToken']) || typeof request.confirmationToken !== 'string') return failure('ETP_CONFIRMATION_TOKEN_INVALID', 'CONFIRM');
      var life = pending[request.confirmationToken];
      if (!life) return failure('ETP_CONFIRMATION_TOKEN_INVALID', 'CONFIRM');
      delete pending[request.confirmationToken];
      var result;
      try { result = await runtime.confirm(life); } catch (_) { return failure('ETP_CONFIRMATION_FAILED', 'CONFIRM'); }
      if (!result || result.ok !== true || result.changed !== true || !record(result.lifecycle) || result.lifecycle.state !== 'ACCEPTED') return cleanFailure(result, 'ETP_CONFIRMATION_FAILED', 'CONFIRM');
      var normalized = checkedScope(result.lifecycle.scope);
      if (!normalized || normalized.scope.scopeKey !== life.scopeKey || result.lifecycle.activeGenerationId !== life.candidateGenerationId) return failure('ETP_GATEWAY_RESPONSE_INVALID', 'CONFIRM');
      return freeze({ ok: true, state: 'ACCEPTED', changed: true, scope: normalized.scope, activeGenerationId: result.lifecycle.activeGenerationId });
    }

    async function inspectScope(scope, request) {
      if (request !== undefined && (!record(request) || Object.keys(request).some(function (key) { return key !== 'historyLimit'; }))) return failure('ETP_GATEWAY_REQUEST_INVALID', 'INSPECT');
      var limit = request && request.historyLimit !== undefined ? request.historyLimit : 5;
      if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_HISTORY) return failure('ETP_HISTORY_LIMIT_INVALID', 'INSPECT');
      var context = await verifiedContext(scope);
      if (context.error) return context.error;
      var item = loadRegistry(storage)[context.normalized.scope.scopeKey], history = Array.isArray(item && item.history) ? item.history : [], cleanHistory = [];
      for (var i = 0; i < history.length && cleanHistory.length < limit; i++) {
        var clean = sanitizeReceipt(history[i], core);
        if (clean) cleanHistory.push(clean);
      }
      return freeze({ ok: true, scope: context.normalized.scope, status: freeze({ state: 'ACCEPTED', restoreFence: false, activeGenerationId: context.status.activeGenerationId }), currentReceipt: sanitizeReceipt(context.receipt, core), history: freeze(cleanHistory) });
    }

    function listScopes(request) {
      if (request !== undefined && (!exact(request, ['limit']) || !Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_SCOPES)) return failure('ETP_SCOPE_LIMIT_INVALID', 'LIST');
      var limit = request ? request.limit : MAX_SCOPES, registry = loadRegistry(storage), scopes = [];
      Object.keys(registry).sort().some(function (key) {
        var item = registry[key], receipt = item && sanitizeReceipt(item.current, core);
        if (!receipt) return false;
        var checked = checkedScope(item.current.lifecycle && item.current.lifecycle.scope);
        if (!checked || checked.scope.scopeKey !== key) return false;
        scopes.push(freeze({ scope: checked.scope, publishedAt: receipt.publishedAt, state: 'RECEIPT_PRESENT' }));
        return scopes.length >= limit;
      });
      return freeze({ ok: true, scopes: freeze(scopes) });
    }

    async function readVerified(scope, request) {
      if (!exact(request, ['reportId', 'fields', 'cursor', 'limit'])) return failure('ETP_VERIFIED_PROJECTION_INVALID', 'READ');
      var reportId = String(request.reportId || '').toUpperCase(), fields = request.fields;
      if (REPORTS.indexOf(reportId) < 0 || !Array.isArray(fields) || !fields.length || fields.length > 64 || !Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_READ_ROWS) return failure('ETP_VERIFIED_PROJECTION_INVALID', 'READ');
      var seen = Object.create(null), projected = [];
      for (var i = 0; i < fields.length; i++) {
        var field = String(fields[i]);
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(field) || FORBIDDEN_FIELD.test(field) || seen[field]) return failure('ETP_VERIFIED_PROJECTION_INVALID', 'READ');
        seen[field] = true; projected.push(field);
      }
      if (request.cursor !== null && (!exact(request.cursor, ['chunkIndex', 'rowOffset']) || !Number.isSafeInteger(request.cursor.chunkIndex) || request.cursor.chunkIndex < 0 || !Number.isSafeInteger(request.cursor.rowOffset) || request.cursor.rowOffset < 0)) return failure('ETP_READ_CURSOR_INVALID', 'READ');
      var context = await verifiedContext(scope);
      if (context.error) return context.error;
      var result;
      try { result = await runtime.readVerified(context.normalized.checked.scope, { reportId: reportId, fields: projected, cursor: request.cursor, limit: request.limit }); }
      catch (_) { return failure('ETP_VERIFIED_READ_FAILED', 'READ'); }
      if (!result || result.ok !== true) return cleanFailure(result, 'ETP_VERIFIED_READ_FAILED', 'READ');
      var page = sanitizePage(result, context.normalized.scope.scopeKey, context.receipt.activeGenerationId, reportId, projected, request.limit);
      return page ? freeze({ ok: true, page: page }) : failure('ETP_GATEWAY_RESPONSE_INVALID', 'READ');
    }

    return { ok: true, gateway: freeze({ version: VERSION, reports: REPORTS, run: run, confirm: confirm, readVerified: readVerified, inspectScope: inspectScope, listScopes: listScopes }) };
  }

  function browserStatusReader(rootValue, lifecycle) {
    return async function (scope) {
      var checked = lifecycle.validateScope(scope), plugin;
      if (!checked || !checked.ok) return failure('ETP_SCOPE_INVALID', 'STATUS');
      try { plugin = rootValue.Capacitor && rootValue.Capacitor.Plugins && rootValue.Capacitor.Plugins.SaagarEtpStore; } catch (_) { plugin = null; }
      if (!plugin || typeof plugin.readStatus !== 'function') return failure('ETP_STATUS_UNAVAILABLE', 'STATUS');
      var result;
      try { result = await plugin.readStatus({ contractVersion: 1, scopeKey: checked.key }); } catch (_) { return failure('ETP_STATUS_UNAVAILABLE', 'STATUS'); }
      if (!exact(result, ['ok', 'state', 'activeGenerationId', 'restoreFence']) || result.ok !== true || ['EMPTY', 'STAGING', 'ACCEPTED', 'REIMPORT_REQUIRED'].indexOf(result.state) < 0 || typeof result.restoreFence !== 'boolean' || (result.activeGenerationId !== null && !generation(result.activeGenerationId))) return failure('ETP_NATIVE_RESPONSE_INVALID', 'STATUS');
      return { ok: true, status: freeze({ state: result.state, activeGenerationId: result.activeGenerationId, restoreFence: result.restoreFence }) };
    };
  }

  function bootstrap() {
    try {
      var lifecycle = root && root.SaagarEtpStoreLifecyclePolicy;
      return create({ runtime: root && root.SaagarEtpImportRuntime, lifecyclePolicy: lifecycle, core: root && root.SaagarEtpCoreContract, storage: root && root.localStorage, statusReader: lifecycle ? browserStatusReader(root, lifecycle) : null, crypto: root && root.crypto });
    } catch (_) { return failure('ETP_GATEWAY_BOOTSTRAP_FAILED', 'BOOTSTRAP'); }
  }

  return freeze({ VERSION: VERSION, REPORTS: REPORTS, REGISTRY_KEY: REGISTRY_KEY, MAX_SCOPES: MAX_SCOPES, MAX_HISTORY: MAX_HISTORY, MAX_READ_ROWS: MAX_READ_ROWS, create: create, bootstrap: bootstrap });
});
