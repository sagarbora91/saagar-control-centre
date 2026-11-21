/* ETP report-engine bridge: the parent-side facade the ETP module reaches through SaagarModuleBridge.etpBridgeGateway.
   It is the ONLY entry point of the tablet side of the bridge. Flow for stage(): trust gate (before any file access or PIN prompt),
   request shape, Owner session role (Owner, or Store Manager with Owner reauthentication), the file size, one read of the file bytes,
   the signed-pack verifier, then the store, profile and scope checks. A verified pack is held in this closure's memory only, in one slot
   that expires after 10 minutes. compare() reads the published XLSX rows through the existing gateway and runs the pure compare module.
   Nothing is persisted, published, imported or sent: there is no storage, native, registry, receipt or import-history call here, and the
   result always says appliedToCalculations:false and publishes:false.
   Owner decisions given in chat, 2026-11-12: Q2 (the engine is not yet an approved source), Q3 (no calculation changes in this wave),
   Q4 (one source per store and period: the XLSX import stays the only source), Q5 (HEMW blocked), Q7 (Owner, or Store Manager with Owner reauthentication).
   Residual risk, recorded: the Owner session, the reauthentication function, roleCanOpen and auditLog are read from the page at call time because the
   shell defines them after this file loads. A hostile same-origin frame could replace them before a call (the same exposure the XLSX import has).
   The trust gate is closed in every shipped build, so no pack can pass. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  /* Node (CommonJS) gets the factory. A browser page gets only the frozen instance below, never the factory. */
  if (typeof module === 'object' && module && module.exports) { module.exports = api.cjs; return; }
  if (!root) return;
  /* Defined once and never replaced: an existing property with this name is left alone, never trusted. */
  if (Object.prototype.hasOwnProperty.call(root, 'SaagarEtpBridgeFacade')) return;
  try {
    Object.defineProperty(root, 'SaagarEtpBridgeFacade', { value: api.instance(), writable: false, configurable: false, enumerable: true });
  } catch (_) { /* absent: the module shows the bridge as unavailable */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var FACADE_VERSION = 1;
  var FACADE_STORE = 'WLMHW';
  var MAX_BYTES = 33554432;
  var SLOT_MS = 600000;
  var PAGE_LIMIT = 200;
  var MAX_PAGES = 250;
  var MAX_DIFFERENCES = 20;
  var INDIA_OFFSET_MS = 19800000;
  var REPORT_IDS = Object.freeze(['R003', 'R013', 'R022', 'R025']);
  var REAUTH_REASON = 'check an engine report pack against Retail ETP imports';
  var SAFE_CODE = /^ETP_[A-Z0-9_]{1,80}$/;
  var TOKEN = /^bridge_[a-f0-9]{32}_[0-9]{1,9}$/;
  var CHECKS = ['GATE', 'ENV', 'INPUT', 'SIZE', 'FRAME', 'KEY', 'SIGNATURE', 'MANIFEST', 'VERSION', 'SCHEMA', 'POLICY', 'HASH', 'ROWS', 'TOTALS', 'INTERNAL', 'DONE'];
  var FIELD_NAME = /^[A-Za-z0-9_.]{1,80}$/;
  var hasOwn = Object.prototype.hasOwnProperty;

  /* ---- codes ------------------------------------------------------------------------------------------------------ */
  var CODE_NAMES = ['UNAVAILABLE', 'REQUEST_INVALID', 'SESSION_INVALID', 'ROLE_REFUSED', 'REAUTH_DENIED', 'FILE_INVALID', 'BUSY', 'STAGE_INVALID', 'COMPARE_FAILED'];
  var C = {};
  var CODES = (function () {
    var list = [];
    for (var i = 0; i < CODE_NAMES.length; i += 1) { C[CODE_NAMES[i]] = 'ETP_BRIDGE_' + CODE_NAMES[i]; list.push(C[CODE_NAMES[i]]); }
    return Object.freeze(list);
  })();
  Object.freeze(C);
  /* Codes that belong to the verifier's vocabulary and are reused here with the same meaning. */
  var X = Object.freeze({
    GATE_CLOSED: 'ETP_BRIDGE_TRUST_GATE_CLOSED', FILE_TOO_LARGE: 'ETP_BRIDGE_FILE_TOO_LARGE', HEMW: 'ETP_BRIDGE_STORE_HEMW_BLOCKED',
    STORE: 'ETP_BRIDGE_STORE_REFUSED', PERIOD: 'ETP_BRIDGE_PERIOD_INVALID', INTERNAL: 'ETP_BRIDGE_INTERNAL_ERROR',
    NO_GENERATION: 'ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION'
  });

  /* ---- small helpers ------------------------------------------------------------------------------------------------ */
  var dateNow = Date.now;
  var bufferLength = (function () {
    try { return Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get; } catch (_) { return null; }
  })();
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function own(value, name) { return hasOwn.call(value, name); }
  function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      var names = Object.keys(value);
      for (var i = 0; i < names.length; i += 1) deepFreeze(value[names[i]]);
    }
    return value;
  }
  function exactKeys(request, keys) {
    /* A request made inside a module frame belongs to that frame's realm, so its prototype is not this page's Object.prototype.
       Only its own enumerable keys count; nothing is read from the prototype chain. */
    if (!isObject(request)) return false;
    var names = Object.keys(request);
    if (names.length !== keys.length) return false;
    for (var i = 0; i < keys.length; i += 1) if (names.indexOf(keys[i]) < 0) return false;
    return true;
  }
  function safeCode(value, fallback) { return typeof value === 'string' && SAFE_CODE.test(value) ? value : fallback; }
  function lockedGlobal(rootObject, name) {
    try {
      var descriptor = Object.getOwnPropertyDescriptor(rootObject, name);
      if (!descriptor || !('value' in descriptor) || descriptor.writable !== false || descriptor.configurable !== false) return null;
      return descriptor.value !== null && typeof descriptor.value === 'object' && Object.isFrozen(descriptor.value) ? descriptor.value : null;
    } catch (_) { return null; }
  }
  function arrayBufferLength(buffer) {
    try {
      if (!bufferLength || Object.prototype.toString.call(buffer) !== '[object ArrayBuffer]') return null;
      return bufferLength.call(buffer);
    } catch (_) { return null; }
  }

  /* ---- the facade --------------------------------------------------------------------------------------------------- */
  function build(deps) {
    var verifier = deps && deps.verifier, compareApi = deps && deps.compare, readVerified = deps && deps.readVerified, loadSummary = deps && deps.loadSummary;
    var lifecycle = deps && deps.lifecycle, profileAuthority = deps && deps.profileAuthority, tender = deps && deps.tenderDictionary;
    var rootObject = deps && deps.root, now = deps && deps.now, random = deps && deps.random;
    var dictionaryId = '';
    try { dictionaryId = tender && tender.BUILD_IDENTITY && typeof tender.BUILD_IDENTITY.versionId === 'string' ? tender.BUILD_IDENTITY.versionId : ''; } catch (_) { dictionaryId = ''; }
    var ready = !!verifier && typeof verifier.verify === 'function' && typeof verifier.gate === 'function' &&
      !!compareApi && typeof compareApi.compare === 'function' && isObject(compareApi.COLUMNS) && isObject(compareApi.MEASURES) && typeof compareApi.formatUnits === 'function' &&
      typeof readVerified === 'function' && !!lifecycle && typeof lifecycle.validateScope === 'function' &&
      !!profileAuthority && typeof profileAuthority.authorize === 'function' && typeof profileAuthority.PROFILE_VERSION === 'string' && typeof profileAuthority.PARSER_VERSION === 'string' &&
      dictionaryId !== '' && !!rootObject && typeof now === 'function' && typeof random === 'function';

    var busy = false, slot = null, counter = 0;

    function failure(code, stage, extra) {
      var out = { ok: false, code: safeCode(code, X.INTERNAL), stage: stage };
      if (extra) {
        if (typeof extra.check === 'string' && CHECKS.indexOf(extra.check) >= 0) out.check = extra.check;
        if (typeof extra.report === 'string' && REPORT_IDS.indexOf(extra.report) >= 0) out.report = extra.report;
        if (typeof extra.field === 'string' && FIELD_NAME.test(extra.field)) out.field = extra.field;
        if (typeof extra.line === 'number' && Number.isSafeInteger(extra.line) && extra.line >= 1) out.line = extra.line;
      }
      return Object.freeze(out);
    }
    /* Audit goes through the shell's auditLog, read at call time, and can never change a decision. Only the keys named here are
       sent, only fixed codes and enum words, and nothing taken from a pack before it is verified. */
    function audit(action, detail) {
      try {
        var write = rootObject && rootObject.auditLog;
        if (typeof write !== 'function') return;
        var clean = {};
        if (typeof detail.code === 'string' && SAFE_CODE.test(detail.code)) clean.code = detail.code;
        if (typeof detail.stage === 'string' && /^[A-Z_]{1,20}$/.test(detail.stage)) clean.stage = detail.stage;
        if (detail.outcome === 'MATCH' || detail.outcome === 'DIFFERENCES' || detail.outcome === 'CANNOT_COMPARE') clean.outcome = detail.outcome;
        if (detail.role === 'OWNER' || detail.role === 'STORE_MANAGER') clean.role = detail.role;
        if (typeof detail.gateOpen === 'boolean') clean.gateOpen = detail.gateOpen;
        if (detail.store === FACADE_STORE) clean.store = FACADE_STORE;
        if (typeof detail.periodStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.periodStart)) clean.periodStart = detail.periodStart;
        if (typeof detail.periodEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.periodEnd)) clean.periodEnd = detail.periodEnd;
        if (Number.isSafeInteger(detail.reportCount) && detail.reportCount >= 0 && detail.reportCount <= 9) clean.reportCount = detail.reportCount;
        if (Number.isSafeInteger(detail.matchCount) && detail.matchCount >= 0 && detail.matchCount <= 9) clean.matchCount = detail.matchCount;
        if (Number.isSafeInteger(detail.diffCount) && detail.diffCount >= 0 && detail.diffCount <= 9) clean.diffCount = detail.diffCount;
        if (typeof detail.keyId === 'string' && /^[0-9a-f]{16}$/.test(detail.keyId)) clean.keyId = detail.keyId;
        write(action, clean);
      } catch (_) { /* a failed audit write never changes the decision */ }
    }
    /* One refusal, one audit entry. `known` carries the authenticated pack facts and is passed only after verification. */
    function refuse(code, stage, role, extra, known) {
      var detail = { code: code, stage: stage };
      if (role) detail.role = role;
      if (known) { detail.store = known.storeCode; detail.periodStart = known.periodStart; detail.periodEnd = known.periodEnd; }
      var out = failure(code, stage, extra);
      detail.code = out.code;
      audit('etp.bridge.import.refused', detail);
      return out;
    }
    function gateState() {
      try {
        var gate = verifier.gate();
        if (gate && gate.open === true) return { open: true, code: null };
        return { open: false, code: safeCode(gate && gate.code, X.GATE_CLOSED) };
      } catch (_) { return { open: false, code: X.GATE_CLOSED }; }
    }
    function readSnapshot() {
      try {
        var authority = rootObject.SaagarOwnerSession;
        var snapshot = authority && typeof authority.read === 'function' ? authority.read() : null;
        if (!isObject(snapshot) || !own(snapshot, 'version') || snapshot.version !== 1 || !own(snapshot, 'isOwner') || typeof snapshot.isOwner !== 'boolean' ||
          !own(snapshot, 'role') || typeof snapshot.role !== 'string') return null;
        return { isOwner: snapshot.isOwner, role: snapshot.role };
      } catch (_) { return null; }
    }
    function canOpenEtp() {
      try { var check = rootObject.roleCanOpen; return typeof check === 'function' && check('etp') === true; } catch (_) { return false; }
    }
    /* OWNER, STORE_MANAGER (needs reauthentication), or null (refused without a keypad). The role is read only from the Owner session. */
    function classify(snapshot) {
      if (snapshot.isOwner === true) return 'OWNER';
      if (snapshot.role === 'Store Manager' && canOpenEtp()) return 'STORE_MANAGER';
      return null;
    }
    function clock() {
      try { var value = now(); return typeof value === 'number' && isFinite(value) ? value : null; } catch (_) { return null; }
    }
    function indiaToday() {
      var value = clock();
      if (value === null) return null;
      var date = new Date(value + INDIA_OFFSET_MS);
      return isNaN(date.getTime()) ? null : date.toISOString().substring(0, 10);
    }
    function discardSlot() { slot = null; }
    function slotUsable(token) {
      if (!slot || slot.token !== token) return false;
      var value = clock();
      if (value === null || value >= slot.expiresAt) { slot = null; return false; }
      return true;
    }
    function makeToken() {
      try {
        var bytes = new Uint8Array(16), text = '';
        random(bytes);
        for (var i = 0; i < bytes.length; i += 1) text += ('0' + bytes[i].toString(16)).slice(-2);
        counter += 1;
        return 'bridge_' + text + '_' + counter;
      } catch (_) { return ''; }
    }

    /* ---- status ---------------------------------------------------------------------------------------------------- */
    async function statusRun() {
      if (!ready) return failure(C.UNAVAILABLE, 'STATUS');
      var gate = gateState(), snapshot = readSnapshot(), role = snapshot ? classify(snapshot) : null;
      return Object.freeze({ ok: true, gate: gate.open ? 'OPEN' : 'CLOSED', access: role === 'OWNER' ? 'OWNER' : (role === 'STORE_MANAGER' ? 'REAUTH' : 'DENIED'), maxBytes: MAX_BYTES });
    }

    /* ---- stage ----------------------------------------------------------------------------------------------------- */
    function stagedSummary(verified, token) {
      var scope = verified.scope, rows = {};
      for (var i = 0; i < REPORT_IDS.length; i += 1) rows[REPORT_IDS[i]] = verified.reports[REPORT_IDS[i]].rowCount;
      return deepFreeze({
        ok: true, state: 'STAGED', stageToken: token, expiresInSeconds: SLOT_MS / 1000,
        pack: { storeCode: scope.storeCode, financialYear: scope.financialYear, periodStart: scope.periodStart, periodEnd: scope.periodEnd, scopeKey: scope.scopeKey,
          engineGeneration: verified.engineGeneration, createdAtUtc: verified.createdAtUtc, engineVersion: verified.engineVersion, keyId: verified.keyId,
          exportId8: verified.exportId.substring(0, 8), finalisedThrough: verified.finalisedThrough, rows: rows, figureCount: verified.engineFigures.length,
          checks: { signature: 'OK', hashes: 'OK', totals: 'OK', store: 'OK', period: 'OK', dictionary: 'OK' } },
        appliedToCalculations: false, publishes: false
      });
    }
    async function stageJob(file) {
      var snapshot = readSnapshot();
      if (!snapshot) return refuse(C.SESSION_INVALID, 'AUTHORIZE', null);
      var role = classify(snapshot);
      if (role === null) return refuse(C.ROLE_REFUSED, 'AUTHORIZE', null);
      if (role === 'STORE_MANAGER') {
        var approved = false;
        try {
          var reauth = rootObject.SaagarReauth;
          if (typeof reauth === 'function') approved = (await reauth(REAUTH_REASON)) === true;
        } catch (_) { approved = false; }
        if (!approved) return refuse(C.REAUTH_DENIED, 'AUTHORIZE', role);
        var again = readSnapshot();
        if (!again || classify(again) !== role) return refuse(C.ROLE_REFUSED, 'AUTHORIZE', null);
        var gateAgain = gateState();
        if (!gateAgain.open) return refuse(gateAgain.code, 'GATE', role);
      }
      discardSlot();
      /* The file: its size is read once, its bytes are read once. */
      var size;
      try { size = file.size; } catch (_) { return refuse(C.FILE_INVALID, 'FILE', role); }
      if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) return refuse(C.FILE_INVALID, 'FILE', role);
      if (size > MAX_BYTES) return refuse(X.FILE_TOO_LARGE, 'FILE', role);
      var reader;
      try { reader = file.arrayBuffer; } catch (_) { return refuse(C.FILE_INVALID, 'FILE', role); }
      if (typeof reader !== 'function') return refuse(C.FILE_INVALID, 'FILE', role);
      var buffer;
      try { buffer = await reader.call(file); } catch (_) { return refuse(C.FILE_INVALID, 'FILE', role); }
      var length = arrayBufferLength(buffer);
      if (length === null) return refuse(C.FILE_INVALID, 'FILE', role);
      if (length > MAX_BYTES) return refuse(X.FILE_TOO_LARGE, 'FILE', role);
      if (length !== size) return refuse(C.FILE_INVALID, 'FILE', role);
      var today = indiaToday();
      if (today === null) return refuse(C.UNAVAILABLE, 'FILE', role);
      var verified;
      try { verified = await verifier.verify(new Uint8Array(buffer), { tenderDictionaryVersionId: dictionaryId, today: today }); } catch (_) { return refuse(X.INTERNAL, 'VERIFY', role); }
      if (!isObject(verified) || verified.ok !== true) {
        return refuse(isObject(verified) ? safeCode(verified.code, X.INTERNAL) : X.INTERNAL, 'VERIFY', role, isObject(verified) ? verified : null);
      }
      /* From here the pack is authenticated and its scope facts may be used. */
      var scope = verified.scope, known = { storeCode: FACADE_STORE, periodStart: scope.periodStart, periodEnd: scope.periodEnd };
      if (scope.storeCode !== FACADE_STORE) return refuse(scope.storeCode === 'HEMW' ? X.HEMW : X.STORE, 'STORE', role, null, null);
      var decision = null;
      try { decision = profileAuthority.authorize({ storeCode: FACADE_STORE, purpose: 'PRODUCTION', profileVersion: profileAuthority.PROFILE_VERSION, parserVersion: profileAuthority.PARSER_VERSION }); } catch (_) { decision = null; }
      if (!isObject(decision) || decision.ok !== true || decision.productionReady !== true) {
        return refuse(isObject(decision) ? safeCode(decision.code, X.STORE) : X.STORE, 'STORE', role, null, known);
      }
      var checked = null;
      try { checked = lifecycle.validateScope({ storeCode: scope.storeCode, financialYear: scope.financialYear, periodStart: scope.periodStart, periodEnd: scope.periodEnd }); } catch (_) { checked = null; }
      if (!isObject(checked) || checked.ok !== true || checked.key !== scope.scopeKey) return refuse(X.PERIOD, 'SCOPE', role, null, known);
      var token = makeToken(), expiresAt = clock();
      if (token === '' || expiresAt === null) return refuse(C.UNAVAILABLE, 'STAGE', role, null, known);
      slot = { token: token, role: role, expiresAt: expiresAt + SLOT_MS, verified: verified,
        scope: { storeCode: scope.storeCode, financialYear: scope.financialYear, periodStart: scope.periodStart, periodEnd: scope.periodEnd } };
      audit('etp.bridge.import.staged', { store: FACADE_STORE, periodStart: scope.periodStart, periodEnd: scope.periodEnd, keyId: verified.keyId, reportCount: REPORT_IDS.length, role: role });
      return stagedSummary(verified, token);
    }
    async function stageRun(request) {
      if (!ready) return failure(C.UNAVAILABLE, 'STAGE');
      var gate = gateState();
      audit('etp.bridge.import.attempt', { stage: 'AUTHORIZE', gateOpen: gate.open });
      /* The gate is checked first: no file is touched and no PIN keypad is shown while it is closed. */
      if (!gate.open) return refuse(gate.code, 'GATE', null);
      if (!exactKeys(request, ['file'])) return refuse(C.REQUEST_INVALID, 'REQUEST', null);
      var file = request.file;
      if (file === null || (typeof file !== 'object' && typeof file !== 'function')) return refuse(C.REQUEST_INVALID, 'REQUEST', null);
      if (busy) return refuse(C.BUSY, 'REQUEST', null);
      busy = true;
      try { return await stageJob(file); } finally { busy = false; }
    }

    /* ---- compare --------------------------------------------------------------------------------------------------- */
    async function readTablet(scope) {
      var rows = {}, generationId = null, complete = true, columns = compareApi.COLUMNS;
      for (var r = 0; r < REPORT_IDS.length; r += 1) {
        var id = REPORT_IDS[r], cursor = null, pages = 0, list = [], seen = Object.create(null);
        for (;;) {
          if (pages >= MAX_PAGES) { complete = false; break; }
          var result = await readVerified(scope, { reportId: id, fields: columns[id].slice(), cursor: cursor, limit: PAGE_LIMIT });
          if (!isObject(result) || result.ok !== true || !isObject(result.page) || !Array.isArray(result.page.rows)) return { failure: isObject(result) ? result : null };
          pages += 1;
          if (typeof result.page.generationId !== 'string') return { failure: null };
          if (generationId === null) generationId = result.page.generationId;
          else if (generationId !== result.page.generationId) { complete = false; break; }
          for (var i = 0; i < result.page.rows.length; i += 1) list.push(result.page.rows[i]);
          if (result.page.hasMore !== true) break;
          cursor = result.page.nextCursor;
          if (typeof cursor !== 'string' || seen[cursor] === true) { complete = false; break; }
          seen[cursor] = true;
        }
        rows[id] = list;
        if (!complete) break;
      }
      return { rows: rows, generationId: generationId, complete: complete };
    }
    async function expectedCounts(scope) {
      if (typeof loadSummary !== 'function') return undefined;
      try {
        var summary = await loadSummary(scope);
        if (!isObject(summary) || summary.ok !== true || !isObject(summary.summaries)) return undefined;
        var counts = {};
        for (var i = 0; i < REPORT_IDS.length; i += 1) {
          var item = summary.summaries[REPORT_IDS[i]];
          if (!isObject(item) || !Number.isSafeInteger(item.rowCount) || item.rowCount < 0) return undefined;
          counts[REPORT_IDS[i]] = item.rowCount;
        }
        return counts;
      } catch (_) { return undefined; }
    }
    function projectReport(id, report) {
      var measures = [], differences = [];
      if (report.totals) {
        measures.push({ key: 'rowCount', pack: String(report.totals.pack.rowCount), tablet: String(report.totals.tablet.rowCount) });
        var list = compareApi.MEASURES[id];
        for (var i = 0; i < list.length; i += 1) {
          measures.push({ key: list[i].name, pack: compareApi.formatUnits(report.totals.pack.sums[list[i].name], list[i].scale), tablet: compareApi.formatUnits(report.totals.tablet.sums[list[i].name], list[i].scale) });
        }
        for (var d = 0; d < report.days.length && differences.length < MAX_DIFFERENCES; d += 1) {
          for (var k = 0; k < report.days[d].diffs.length && differences.length < MAX_DIFFERENCES; k += 1) {
            var diff = report.days[d].diffs[k], scale = 0;
            for (var m = 0; m < list.length; m += 1) if (list[m].name === diff.key) scale = list[m].scale;
            differences.push({ date: report.days[d].date, key: diff.key, pack: diff.key === 'rowCount' ? String(diff.pack) : compareApi.formatUnits(diff.pack, scale),
              tablet: diff.key === 'rowCount' ? String(diff.tablet) : compareApi.formatUnits(diff.tablet, scale) });
          }
        }
      }
      return { status: report.status, reasonCodes: report.reasonCodes.slice(), flags: report.flags.slice(),
        rows: { pack: report.rows.pack, tablet: report.rows.tablet, matched: report.rows.matched, differing: report.rows.differing, onlyPack: report.rows.onlyPack, onlyTablet: report.rows.onlyTablet },
        measures: measures, daysDiffering: report.daysDiffering, differences: differences };
    }
    function projectResult(result) {
      var reports = {}, figures = [], i;
      for (i = 0; i < REPORT_IDS.length; i += 1) reports[REPORT_IDS[i]] = projectReport(REPORT_IDS[i], result.reports[REPORT_IDS[i]]);
      for (i = 0; i < result.figures.length; i += 1) {
        var figure = result.figures[i];
        figures.push({ figureId: figure.figureId, reportId: figure.reportId, date: figure.date, status: figure.status, pack: figure.engineUnits === null ? null : String(figure.engineUnits),
          tablet: figure.tabletUnits === null ? null : String(figure.tabletUnits), label: figure.label });
      }
      return deepFreeze({
        ok: true, state: 'COMPARED', outcome: result.outcome, reasonCodes: result.reasonCodes.slice(),
        baseline: { generation8: result.tablet.generationId ? result.tablet.generationId.substring(4, 12) : null },
        counts: { reportsMatch: result.counts.reportsMatch, reportsDifferent: result.counts.reportsDifferent, reportsCannotCompare: result.counts.reportsCannotCompare,
          businessRuleDifferences: result.counts.businessRuleDifferences },
        reports: reports, figures: figures, appliedToCalculations: false, publishes: false
      });
    }
    async function compareJob(current) {
      var snapshot = readSnapshot();
      if (!snapshot) { discardSlot(); return refuse(C.SESSION_INVALID, 'COMPARE', null); }
      var role = classify(snapshot);
      if (role === null || role !== current.role) { discardSlot(); return refuse(C.ROLE_REFUSED, 'COMPARE', null); }
      audit('etp.bridge.compare.run', { store: FACADE_STORE, periodStart: current.scope.periodStart, periodEnd: current.scope.periodEnd, reportCount: REPORT_IDS.length });
      var read = await readTablet(current.scope), tablet;
      if (read.failure !== undefined) {
        var code = read.failure ? read.failure.code : null;
        if (code === 'ETP_RECEIPT_NOT_FOUND' || code === 'ETP_VERIFIED_GENERATION_UNAVAILABLE') tablet = { ok: false };
        else return refuse(safeCode(code, C.COMPARE_FAILED), 'COMPARE', role);
      } else {
        tablet = { ok: true, generationId: read.generationId, complete: read.complete, rows: read.rows };
        var expected = await expectedCounts(current.scope);
        if (expected !== undefined) tablet.expectedRowCounts = expected;
      }
      if (slot !== current) return refuse(C.STAGE_INVALID, 'COMPARE', role);
      var verified = current.verified, packRows = {}, packTotals = {};
      for (var i = 0; i < REPORT_IDS.length; i += 1) {
        packRows[REPORT_IDS[i]] = verified.reports[REPORT_IDS[i]].rows;
        packTotals[REPORT_IDS[i]] = { rowCount: verified.reports[REPORT_IDS[i]].rowCount, sums: verified.reports[REPORT_IDS[i]].sums };
      }
      var result = compareApi.compare({
        scope: { storeCode: current.scope.storeCode, financialYear: current.scope.financialYear, periodStart: current.scope.periodStart, periodEnd: current.scope.periodEnd, scopeKey: verified.scope.scopeKey },
        tablet: tablet,
        pack: { verified: true, exportId: verified.exportId, manifestSha256: verified.manifestSha256, keyId: verified.keyId, engineGeneration: verified.engineGeneration,
          storeCode: verified.scope.storeCode, scopeKey: verified.scope.scopeKey, rows: packRows, engineTotals: packTotals, engineFigures: verified.engineFigures },
        options: { sampleLimitPerReport: 0 }
      });
      if (!isObject(result) || result.ok !== true) return refuse(C.COMPARE_FAILED, 'COMPARE', role);
      var projected = projectResult(result);
      audit('etp.bridge.compare.result', { outcome: projected.outcome, matchCount: projected.counts.reportsMatch, diffCount: projected.counts.reportsDifferent });
      return projected;
    }
    async function compareRun(request) {
      if (!ready) return failure(C.UNAVAILABLE, 'COMPARE');
      var gate = gateState();
      if (!gate.open) { discardSlot(); return refuse(gate.code, 'GATE', null); }
      if (!exactKeys(request, ['stageToken']) || typeof request.stageToken !== 'string' || !TOKEN.test(request.stageToken)) return refuse(C.REQUEST_INVALID, 'REQUEST', null);
      if (busy) return refuse(C.BUSY, 'REQUEST', null);
      busy = true;
      try {
        if (!slotUsable(request.stageToken)) return refuse(C.STAGE_INVALID, 'COMPARE', null);
        return await compareJob(slot);
      } finally { busy = false; }
    }

    /* ---- discard --------------------------------------------------------------------------------------------------- */
    async function discardRun(request) {
      if (!ready) return failure(C.UNAVAILABLE, 'DISCARD');
      if (!exactKeys(request, ['stageToken']) || typeof request.stageToken !== 'string' || !TOKEN.test(request.stageToken)) return failure(C.REQUEST_INVALID, 'DISCARD');
      if (slot && slot.token === request.stageToken) discardSlot();
      return Object.freeze({ ok: true, state: 'DISCARDED' });
    }

    function guard(work, stageName) {
      try {
        return Promise.resolve(work()).then(function (result) { return result; }, function () { return failure(X.INTERNAL, stageName); });
      } catch (_) { return Promise.resolve(failure(X.INTERNAL, stageName)); }
    }
    return Object.freeze({
      VERSION: FACADE_VERSION, CODES: CODES,
      status: function () { return guard(function () { return statusRun(); }, 'STATUS'); },
      stage: function (request) { return guard(function () { return stageRun(request); }, 'STAGE'); },
      compare: function (request) { return guard(function () { return compareRun(request); }, 'COMPARE'); },
      discard: function (request) { return guard(function () { return discardRun(request); }, 'DISCARD'); }
    });
  }

  /* Node only: the single place where the dependencies can be supplied. */
  function create(options) {
    var supplied = options && typeof options === 'object' ? options : {};
    var gateway = supplied.gateway;
    var readVerified = gateway && typeof gateway.readVerified === 'function' ? gateway.readVerified : null;
    var readFacade = gateway && gateway.readFacade;
    var loadSummary = readFacade && typeof readFacade.loadSummary === 'function' ? readFacade.loadSummary : null;
    return build({ verifier: supplied.verifier, compare: supplied.compare, readVerified: readVerified, loadSummary: loadSummary, lifecycle: supplied.lifecycle,
      profileAuthority: supplied.profileAuthority, tenderDictionary: supplied.tenderDictionary, root: supplied.root, now: supplied.now, random: supplied.random });
  }
  function instance() {
    var verifier = lockedGlobal(root, 'SaagarEtpBridgePackVerifier'), compareApi = lockedGlobal(root, 'SaagarEtpBridgeCompare'), gateway = null, cryptoSource = null;
    try { gateway = root.SaagarEtpModuleGateway; if (!gateway || !Object.isFrozen(gateway)) gateway = null; } catch (_) { gateway = null; }
    try { cryptoSource = root.crypto && typeof root.crypto.getRandomValues === 'function' ? root.crypto : null; } catch (_) { cryptoSource = null; }
    var readVerified = gateway && typeof gateway.readVerified === 'function' ? gateway.readVerified : null;
    var readFacade = gateway && gateway.readFacade;
    var loadSummary = readFacade && typeof readFacade.loadSummary === 'function' ? readFacade.loadSummary : null;
    return build({
      verifier: verifier, compare: compareApi, readVerified: readVerified, loadSummary: loadSummary, lifecycle: root.SaagarEtpStoreLifecyclePolicy,
      profileAuthority: root.SaagarEtpProfileAuthority, tenderDictionary: root.SaagarEtpTenderDictionary, root: root,
      now: function () { return dateNow(); },
      random: cryptoSource ? function (bytes) { return cryptoSource.getRandomValues(bytes); } : null
    });
  }
  var cjs = Object.freeze({ create: create, VERSION: FACADE_VERSION, CODES: CODES, REAUTH_REASON: REAUTH_REASON, MAX_BYTES: MAX_BYTES, SLOT_MS: SLOT_MS, MAX_PAGES: MAX_PAGES });
  return { cjs: cjs, instance: instance };
});
