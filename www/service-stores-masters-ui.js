(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceMastersUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Parts and labour masters screen for Service Stores (Phase 1).
  // It mounts into a host element made by the Stores screen. It reads and writes only through the core facade
  // given in env.core. It owns no storage key, keeps no role in memory and never uses prompt, confirm or alert.
  // Every control carries data-svcs-action with an svcm- id. Row keys ride in data-svs-key.

  var PAGE_SIZE = 50;
  var HISTORY_SHOWN = 20;
  var INDIA_OFFSET_MS = 19800000;
  var FILTER_ACTIVE = ['true', 'false', 'all'];
  var FILTER_TAX = ['all', 'true'];

  var ACTIONS = Object.freeze([
    'svcm-tab-parts', 'svcm-tab-labour', 'svcm-search', 'svcm-filter-group', 'svcm-filter-active',
    'svcm-filter-taxpending', 'svcm-page-prev', 'svcm-page-next', 'svcm-add', 'svcm-field', 'svcm-save',
    'svcm-cancel', 'svcm-open', 'svcm-back', 'svcm-edit', 'svcm-detail-reason', 'svcm-deactivate',
    'svcm-reactivate', 'svcm-delete', 'svcm-bulk-open', 'svcm-bulk-text', 'svcm-bulk-check',
    'svcm-bulk-create', 'svcm-bulk-clear'
  ]);
  var INPUT_ACTIONS = Object.freeze(['svcm-search', 'svcm-field', 'svcm-bulk-text', 'svcm-detail-reason']);
  var CHANGE_ACTIONS = Object.freeze(['svcm-filter-group', 'svcm-filter-active', 'svcm-filter-taxpending', 'svcm-field']);

  // ---------------------------------------------------------------- fixed English text
  var TEXT = Object.freeze({
    title: 'Parts and labour',
    tabParts: 'Parts',
    tabLabour: 'Labour',
    search: 'Search by code, name, group or bin',
    allGroups: 'All groups',
    group: 'Group',
    statusFilter: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    all: 'All',
    taxMissing: 'Tax details missing',
    taxOnly: 'Show only tax details missing',
    addPart: 'Add part',
    addLabour: 'Add labour item',
    bulk: 'Bulk add (paste)',
    code: 'Code',
    name: 'Name',
    unit: 'Unit',
    hsn: 'HSN code',
    sac: 'SAC code',
    gst: 'GST rate (%)',
    price: 'Selling price',
    rate: 'Labour rate',
    basis: 'Price basis',
    basisIncl: 'Price includes tax',
    basisExcl: 'Price excludes tax',
    basisNone: 'Price basis not set',
    reorderLevel: 'Reorder level',
    reorderQty: 'Reorder quantity',
    bin: 'Bin',
    flags: 'Flags',
    flagBattery: 'Battery',
    flagStrap: 'Strap',
    flagGlass: 'Glass',
    flagCrown: 'Crown',
    flagMovement: 'Movement',
    flagWarranty: 'Warranty claimable',
    flagCounter: 'Counter saleable',
    reason: 'Reason for change',
    reasonDo: 'Reason (at least 5 characters)',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    history: 'History',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    del: 'Delete (Owner PIN)',
    status: 'Status',
    created: 'Created',
    changed: 'Last changed',
    check: 'Check',
    createItems: 'Create items',
    clear: 'Clear',
    open: 'Open',
    back: 'Back to list',
    prev: 'Previous',
    next: 'Next',
    loading: 'Loading...',
    empty: 'No items found.',
    chooseNone: 'Not set',
    revision: 'Revision',
    pasteHelp: 'Paste rows below. The first line must be exactly the header shown.',
    pasteKeep: 'Existing codes are not changed here',
    headerLabel: 'Header',
    saved: 'Saved.',
    nothingChanged: 'Nothing changed.',
    unavailable: 'Service stores are not available for this sign-in.',
    viewOnly: 'You can view this list. Only a Store Manager or the Owner can change it.',
    historyEmpty: 'No history yet.',
    historyRemoved: 'Item deleted',
    historyCreated: 'Item created',
    noneSet: 'None',
    inactiveNote: 'This item is inactive.',
    deleteHelp: 'Only the Owner can delete an item that was never used. The Owner PIN is asked first.',
    oneItemCreated: '1 item created.',
    itemsCreated: '{n} items created.',
    countLine: '{n} items, {m} need tax details',
    countOnly: '{n} items',
    rangeLine: '{a} to {b} of {n}',
    planLine: '{c} to create, {s} already exist, {t} need tax details',
    lineError: 'Line {l}: {t}',
    lineField: 'Line {l}, {f}: {t}',
    reauthDeletePart: 'Delete part {code} from the master. This cannot be undone.',
    reauthDeleteLabour: 'Delete labour item {code} from the master. This cannot be undone.',
    sRoleDenied: 'Your role cannot do this. Ask the Store Manager or the Owner.',
    sOwnerOnly: 'Only the Owner can do this. Unlock Owner mode in the app header, then try again.',
    sPinDenied: 'Owner approval was not given. Nothing was changed.',
    sPastView: 'You are viewing a past date. Nothing can be changed.',
    sBusy: 'Another save is in progress. Wait a moment.',
    sBadReply: 'Something went wrong. Check the list before trying again. Code: {code}.',
    sCoreMissing: 'Stores is not available in this build. Nothing was changed.',
    sFields: 'Fix the highlighted fields and try again.',
    sListFailed: 'The list could not be loaded.',
    sReasonShort: 'A reason of at least 5 characters is required.',
    sMoneyBad: 'Enter an amount in rupees, for example 149.50.',
    sPercentBad: 'Enter a rate from 0 to 100 with at most 2 decimals, for example 18 or 2.5.',
    sUnknownCode: 'The store could not complete this action. Code: {code}.'
  });

  // Fallback sentences for codes that come from lower layers. Masters codes use the masters sentence table first.
  var FALLBACK_MESSAGES = Object.freeze({
    SVS_ROLE_DENIED: TEXT.sRoleDenied,
    SVS_OWNER_ONLY: TEXT.sOwnerOnly,
    SVS_PIN_DENIED: TEXT.sPinDenied,
    SVS_PAST_VIEW: TEXT.sPastView,
    SVS_BUSY: TEXT.sBusy,
    SVS_CORE_MISSING: TEXT.sCoreMissing,
    SVS_FIELDS_INVALID: TEXT.sFields,
    SVS_LOAD_FAILED: TEXT.sListFailed,
    SVS_REASON_SHORT: TEXT.sReasonShort,
    SVS_MONEY_INVALID: TEXT.sMoneyBad,
    SVS_PERCENT_INVALID: TEXT.sPercentBad,
    SVCS_ARGS_INVALID: 'The request was not valid. Check the entries and try again.',
    SVCS_ACTOR_INVALID: 'No signed-in user was found. Sign in again.',
    SVCS_OWNER_REQUIRED: 'Only the Owner can do this, after the PIN check.',
    SVCS_STORAGE_UNAVAILABLE: 'Storage is not ready yet. Wait a moment and try again.',
    SVCS_BLOCKED: 'Stores data failed its safety check. Nothing can be posted. Restore your latest backup.',
    SVCS_REV_CONFLICT: 'Stores changed on another screen. Reload and try again.',
    SVCS_DUPLICATE_REF: 'This was already saved. Check the list before saving again.',
    SVCS_WRITE_FAILED: 'Could not confirm the save. Reopen Stores and check before saving again.',
    SVCS_HEAD_WRITE_FAILED: 'Could not confirm the save. Reopen Stores and check before saving again.',
    SVCS_READBACK_MISMATCH: 'Could not confirm the save. Reopen Stores and check before saving again.',
    SVCS_HEAD_BEHIND: 'A save was not finished. Reopen Stores and check before saving again.',
    SVCS_BODY_NOT_CANONICAL: 'A value in this entry cannot be stored.',
    SVCS_BODY_FORBIDDEN_FIELD: 'This entry has a field that is not allowed.',
    SVCS_DOC_TOO_LARGE: 'This entry is too large. Split it.',
    SVCS_CLOCK_BACK: 'The tablet clock is earlier than the last entry. Fix the clock or ask the Owner.',
    SVCS_WATERMARK_AHEAD: 'This data is older than what this device last saw. Ask the Owner.',
    SVCS_WATERMARK_FORK: 'This data differs from what this device last saw. Ask the Owner.'
  });

  var UNIT_LABELS = Object.freeze({ pc: 'Piece', set: 'Set', pair: 'Pair', pack: 'Pack', job: 'Job', hour: 'Hour' });
  var FLAG_LABELS = Object.freeze({
    battery: TEXT.flagBattery, strap: TEXT.flagStrap, glass: TEXT.flagGlass, crown: TEXT.flagCrown,
    movement: TEXT.flagMovement, warrantyClaimable: TEXT.flagWarranty, counterSaleable: TEXT.flagCounter
  });
  var FIELD_LABELS = Object.freeze({
    name: TEXT.name, group: TEXT.group, unit: TEXT.unit, hsn: TEXT.hsn, sac: TEXT.sac, gstRateBp: TEXT.gst,
    sellPricePaise: TEXT.price, ratePaise: TEXT.rate, priceIncludesTax: TEXT.basis, reorderLevel: TEXT.reorderLevel,
    reorderQty: TEXT.reorderQty, bin: TEXT.bin, active: TEXT.status
  });
  // Masters field name -> form field name (the form uses short names).
  var FORM_FIELD_OF = Object.freeze({
    code: 'code', name: 'name', group: 'group', unit: 'unit', hsn: 'tax', sac: 'tax', gstRateBp: 'gst',
    sellPricePaise: 'price', ratePaise: 'price', priceIncludesTax: 'basis', reorderLevel: 'reorderLevel',
    reorderQty: 'reorderQty', bin: 'bin', flags: 'flags', reason: 'reason'
  });

  // ---------------------------------------------------------------- small helpers
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function fill(template, vars) {
    var out = String(template);
    var k;
    for (k in vars) {
      if (has(vars, k)) out = out.split('{' + k + '}').join(String(vars[k]));
    }
    return out;
  }
  function plainEsc(v) {
    return str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function contains(list, v) { return list.indexOf(v) >= 0; }
  function groupDigits(intText) {
    var s = String(intText);
    var tail;
    var head;
    if (s.length <= 3) return s;
    tail = s.slice(-3);
    head = s.slice(0, -3);
    return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
  }
  function kindOf(raw) { return raw === 'labour' ? 'labour' : 'part'; }

  function mastersOf(env) {
    if (env && isObj(env.masters)) return env.masters;
    return typeof SaagarServiceMasters !== 'undefined' ? SaagarServiceMasters : null;
  }
  function storeMessagesOf() {
    return typeof SaagarServiceStoresStore !== 'undefined' && isObj(SaagarServiceStoresStore.MESSAGES) ? SaagarServiceStoresStore.MESSAGES : null;
  }

  function phrases() {
    var seen = {};
    var out = [];
    var tables = [TEXT, FALLBACK_MESSAGES, UNIT_LABELS, FLAG_LABELS];
    var t;
    var k;
    var v;
    for (t = 0; t < tables.length; t += 1) {
      for (k in tables[t]) {
        if (!has(tables[t], k)) continue;
        v = tables[t][k];
        if (typeof v === 'string' && !has(seen, v)) { seen[v] = true; out.push(v); }
      }
    }
    out.sort();
    return out;
  }

  // ---------------------------------------------------------------- controller
  function create(env) {
    var e = isObj(env) ? env : {};
    var M = mastersOf(e);
    var core = e.core || null;
    var refCounter = 0;
    var listSeq = 0;
    var detailSeq = 0;
    var paintHook = null;
    var quiet = false;
    var state;

    function freshForm(kind, mode, row) {
      return {
        kind: kind, mode: mode, code: row ? row.code : '', rev: row ? row.rev : 0, original: row || null,
        values: valuesFromRow(kind, row), errors: {}, warnings: [], reason: '', ref: newRef(), from: 'list'
      };
    }
    function freshState() {
      return {
        kind: 'part', q: '', group: '', active: 'true', taxPending: 'all', page: 0,
        view: 'list', form: null, detailCode: '', detail: null,
        bulk: { text: '', plan: null, ref: '' },
        notice: { type: '', text: '', lines: [] },
        list: { rows: [], total: 0, groups: [], taxPendingTotal: null, error: '', loaded: false },
        busy: false
      };
    }
    state = freshState();

    // -------- session, rights, refs
    function readSession() {
      var s = typeof e.readSession === 'function' ? e.readSession() : null;
      return isObj(s) ? s : { ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' };
    }
    function rightsOf(session) {
      var r;
      if (!M || typeof M.rights !== 'function') return { view: false, edit: false, remove: false };
      r = M.rights(session);
      return { view: r.view === true, edit: r.edit === true, remove: r.remove === true };
    }
    function isPast() { return typeof e.isPast === 'function' && e.isPast() === true; }
    function nowMs() {
      var d = typeof e.now === 'function' ? e.now() : null;
      if (d && typeof d.getTime === 'function') return d.getTime();
      return isInt(d) ? d : 0;
    }
    function newRef() {
      refCounter += 1;
      return 'svs-' + nowMs().toString(36) + '-' + refCounter.toString(36);
    }
    function ctxFor(session, extra) {
      var c = { session: session };
      var k;
      if (typeof e.now === 'function') c.now = e.now;
      if (extra) {
        for (k in extra) {
          if (has(extra, k) && extra[k] !== undefined) c[k] = extra[k];
        }
      }
      return c;
    }

    // -------- messages
    function messageFor(code, fallbackText) {
      var sm;
      var c = str(code);
      if (M && isObj(M.MESSAGES) && has(M.MESSAGES, c)) return M.MESSAGES[c];
      if (has(FALLBACK_MESSAGES, c)) return FALLBACK_MESSAGES[c];
      sm = storeMessagesOf();
      if (sm && has(sm, c)) return sm[c];
      if (c === 'SVS_BAD_REPLY') return fill(TEXT.sBadReply, { code: 'SVS_BAD_REPLY' });
      if (typeof fallbackText === 'string' && fallbackText !== '') return fallbackText;
      return fill(TEXT.sUnknownCode, { code: c === '' ? 'UNKNOWN' : c });
    }
    function setNotice(type, text, lines) {
      state.notice = { type: type, text: text, lines: Array.isArray(lines) ? lines : [] };
      if (typeof e.toast === 'function' && text !== '') e.toast(text);
    }
    function failNotice(code, res) {
      var text = messageFor(code, res && typeof res.message === 'string' ? res.message : '');
      if (code === 'SVS_BAD_REPLY') text = fill(TEXT.sBadReply, { code: res && res.detailCode ? res.detailCode : 'SVS_BAD_REPLY' });
      setNotice('err', text, []);
    }
    function warnLines(list) {
      var out = [];
      var i;
      if (!Array.isArray(list)) return out;
      for (i = 0; i < list.length; i += 1) {
        if (isObj(list[i]) && typeof list[i].code === 'string') out.push(messageFor(list[i].code, list[i].message));
      }
      return out;
    }

    // -------- core calls (sync or promise, a throw becomes a bad reply, never a success)
    function norm(r) {
      if (isObj(r) && r.ok === true) return r;
      return {
        ok: false, code: isObj(r) && typeof r.code === 'string' && r.code !== '' ? r.code : 'SVS_BAD_REPLY',
        message: isObj(r) && typeof r.message === 'string' ? r.message : '', raw: r, errors: isObj(r) ? r.errors : undefined,
        field: isObj(r) ? r.field : undefined, detail: isObj(r) ? r.detail : undefined
      };
    }
    function callCore(name, args) {
      if (!core || typeof core[name] !== 'function') return Promise.resolve({ ok: false, code: 'SVS_CORE_MISSING' });
      return Promise.resolve().then(function () { return core[name].apply(core, args); })
        .then(norm, function () { return { ok: false, code: 'SVS_BAD_REPLY' }; });
    }
    function fnName(kind, part, labourName) { return kind === 'labour' ? labourName : part; }

    // -------- form conversion
    function valuesFromRow(kind, row) {
      var v = {};
      var i;
      var keys;
      var flags = {};
      var fk = M && Array.isArray(M.FLAG_KEYS) ? M.FLAG_KEYS : [];
      var r = row || null;
      var tax;
      v.code = r ? r.code : '';
      v.name = r ? str(r.name) : '';
      v.group = r ? str(r.group) : '';
      v.unit = r ? str(r.unit) : (kind === 'labour' ? 'job' : 'pc');
      tax = r ? (kind === 'labour' ? r.sac : r.hsn) : '';
      v.tax = str(tax);
      v.gst = r && isInt(r.gstRateBp) ? M.bpToPercentText(r.gstRateBp) : '';
      v.price = r ? M.paiseToRupeeText(kind === 'labour' ? r.ratePaise : r.sellPricePaise) : '';
      v.basis = r ? (r.priceIncludesTax === true ? 'yes' : (r.priceIncludesTax === false ? 'no' : '')) : '';
      if (kind === 'part') {
        v.reorderLevel = r ? str(r.reorderLevel) : '0';
        v.reorderQty = r ? str(r.reorderQty) : '0';
        v.bin = r ? str(r.bin) : '';
        keys = fk;
        for (i = 0; i < keys.length; i += 1) flags[keys[i]] = !!(r && isObj(r.flags) && r.flags[keys[i]] === true);
        v.flags = flags;
      }
      return v;
    }
    // Returns {input, errors} where errors maps a form field to a message code.
    function inputFromForm(form) {
      var v = form.values;
      var kind = form.kind;
      var errors = {};
      var input = { code: v.code, name: v.name, group: v.group, unit: v.unit };
      var p = M.parseRupeesToPaise(v.price, false);
      var g = M.parsePercentToBp(v.gst);
      var i;
      var fk;
      if (!p.ok) { errors.price = 'SVS_MONEY_INVALID'; }
      if (!g.ok) { errors.gst = 'SVS_PERCENT_INVALID'; }
      input[kind === 'labour' ? 'sac' : 'hsn'] = v.tax;
      input.gstRateBp = g.ok ? g.bp : null;
      input[kind === 'labour' ? 'ratePaise' : 'sellPricePaise'] = p.ok ? p.paise : 0;
      input.priceIncludesTax = v.basis === 'yes' ? true : (v.basis === 'no' ? false : null);
      if (kind === 'part') {
        input.reorderLevel = v.reorderLevel;
        input.reorderQty = v.reorderQty;
        input.bin = v.bin;
        input.flags = {};
        fk = M.FLAG_KEYS;
        for (i = 0; i < fk.length; i += 1) input.flags[fk[i]] = v.flags[fk[i]] === true;
      }
      return { input: input, errors: errors, priceOk: p.ok, gstOk: g.ok, paise: p.paise, bp: g.bp };
    }
    // True when a field that needs a logged reason differs from the stored row (or cannot be read).
    function needsReason(form) {
      var conv;
      var o = form.original;
      var kind = form.kind;
      var origTax;
      var nowBasis;
      var origBasis;
      if (form.mode !== 'edit' || !o) return false;
      conv = inputFromForm(form);
      if (!conv.priceOk || !conv.gstOk) return true;
      if (conv.paise !== (kind === 'labour' ? o.ratePaise : o.sellPricePaise)) return true;
      if (conv.bp !== (isInt(o.gstRateBp) ? o.gstRateBp : null)) return true;
      origTax = str(kind === 'labour' ? o.sac : o.hsn);
      if (str(form.values.tax).replace(/\s+/g, '') !== origTax) return true;
      nowBasis = form.values.basis;
      origBasis = o.priceIncludesTax === true ? 'yes' : (o.priceIncludesTax === false ? 'no' : '');
      return nowBasis !== origBasis;
    }

    // -------- list loading
    function buildQuery() {
      var q = { text: state.q, group: state.group, active: state.active, offset: state.page * PAGE_SIZE, limit: PAGE_SIZE };
      if (state.kind === 'part') q.state = 'all';
      if (state.taxPending === 'true') q.taxPending = 'true';
      return q;
    }
    function rowsOf(res) {
      var rows = Array.isArray(res.rows) ? res.rows : [];
      var out = [];
      var i;
      for (i = 0; i < rows.length; i += 1) {
        if (!isObj(rows[i])) continue;
        if (state.taxPending === 'true' && !taxPendingOf(rows[i])) continue;
        out.push(rows[i]);
      }
      return out;
    }
    function taxPendingOf(row) {
      if (typeof row.taxPending === 'boolean') return row.taxPending;
      return M && typeof M.isTaxPending === 'function' ? M.isTaxPending(row) : false;
    }
    function refresh() {
      var session = readSession();
      var my;
      if (!rightsOf(session).view) {
        state.list = { rows: [], total: 0, groups: [], taxPendingTotal: null, error: '', loaded: true };
        return Promise.resolve();
      }
      listSeq += 1;
      my = listSeq;
      return callCore(fnName(state.kind, 'listParts', 'listLabour'), [buildQuery(), ctxFor(session)]).then(function (res) {
        if (my !== listSeq) return;
        if (!res.ok) {
          state.list = { rows: [], total: 0, groups: state.list.groups, taxPendingTotal: null, error: res.code, loaded: true };
        } else {
          state.list = {
            rows: rowsOf(res), total: isInt(res.total) ? res.total : rowsOf(res).length,
            groups: Array.isArray(res.groups) ? res.groups : [],
            taxPendingTotal: isInt(res.taxPendingTotal) ? res.taxPendingTotal : null, error: '', loaded: true
          };
        }
        paint();
      });
    }
    function loadRow(kind, code) {
      var session = readSession();
      var want = M.normalizeCode(code);
      var i;
      var rows = state.list.rows;
      if (state.kind === kind) {
        for (i = 0; i < rows.length; i += 1) {
          if (rows[i].code === want) return Promise.resolve(rows[i]);
        }
      }
      return callCore(fnName(kind, 'listParts', 'listLabour'), [{ text: want, group: '', active: 'all', offset: 0, limit: 20 }, ctxFor(session)]).then(function (res) {
        var found = null;
        var list = res.ok && Array.isArray(res.rows) ? res.rows : [];
        var j;
        for (j = 0; j < list.length; j += 1) {
          if (isObj(list[j]) && list[j].code === want) { found = list[j]; break; }
        }
        return found;
      });
    }
    // A part also asks the core for its fresh row and whether it has any stock movement (the list does not say).
    function freshRow(kind, row, session) {
      var fallback = { row: row, hasMovements: row.hasMovements === true };
      if (kind !== 'part' || !core || typeof core.getPart !== 'function') return Promise.resolve(fallback);
      return callCore('getPart', [row.code, ctxFor(session)]).then(function (res) {
        if (res.ok && isObj(res.part)) return { row: res.part, hasMovements: res.hasMovements === true };
        return fallback;
      });
    }
    function loadDetail(kind, code) {
      var session = readSession();
      var rights = rightsOf(session);
      var my;
      detailSeq += 1;
      my = detailSeq;
      return loadRow(kind, code).then(function (row) {
        if (my !== detailSeq) return null;
        if (!row) {
          setNotice('err', messageFor('NOT_FOUND', ''), []);
          state.view = 'list';
          return null;
        }
        return freshRow(kind, row, session).then(function (info) {
          if (my !== detailSeq) return null;
          state.kind = kind;
          state.detailCode = info.row.code;
          state.detail = {
            row: info.row, history: [], historyError: '', historyAllowed: rights.edit, reason: '', hasMovements: info.hasMovements,
            createdAt: '', createdBy: '', changedAt: '', changedBy: '', deactivateReason: ''
          };
          state.view = 'detail';
          if (!rights.edit) return info.row;
          return callCore('history', [kind, info.row.code, ctxFor(session)]).then(function (h) {
            var list;
            var i;
            if (my !== detailSeq || !state.detail) return info.row;
            if (h.ok && Array.isArray(h.entries)) {
              list = h.entries;
              if (list.length > 0) {
                state.detail.createdAt = str(list[0].at);
                state.detail.createdBy = actorLabel(list[0].actor);
                state.detail.changedAt = str(list[list.length - 1].at);
                state.detail.changedBy = actorLabel(list[list.length - 1].actor);
              }
              for (i = list.length - 1; i >= 0; i -= 1) {
                if (list[i].action === 'deactivate') { state.detail.deactivateReason = str(list[i].reason); break; }
              }
              state.detail.history = list.slice(-HISTORY_SHOWN).reverse();
            } else {
              state.detail.historyError = h.code;
            }
            return info.row;
          });
        });
      });
    }
    function actorLabel(a) {
      if (!isObj(a)) return '';
      return a.m ? (a.r ? a.m + ' (' + a.r + ')' : a.m) : str(a.r);
    }

    // -------- write helpers
    function guardEdit(rights) {
      if (!rights.view) return 'SESSION_REQUIRED';
      if (isPast()) return 'SVS_PAST_VIEW';
      if (!rights.edit) return 'ROLE_DENIED';
      return '';
    }
    function begin() {
      if (state.busy) {
        setNotice('err', messageFor('SVS_BUSY', ''), []);
        return false;
      }
      state.busy = true;
      paint();
      return true;
    }
    function finish() {
      state.busy = false;
    }
    function afterWrite() {
      var hook = e.onChange;
      if (typeof hook === 'function') hook();
    }
    function formErrorsFrom(res) {
      var out = {};
      var list = Array.isArray(res.errors) ? res.errors : [];
      var i;
      var f;
      for (i = 0; i < list.length; i += 1) {
        f = isObj(list[i]) && has(FORM_FIELD_OF, list[i].field) ? FORM_FIELD_OF[list[i].field] : '';
        if (f !== '' && !has(out, f)) out[f] = list[i].code;
      }
      if (list.length === 0 && typeof res.field === 'string' && has(FORM_FIELD_OF, res.field)) out[FORM_FIELD_OF[res.field]] = res.code;
      return out;
    }

    // -------- actions
    function openForm(kind, mode, row, from) {
      detailSeq += 1;
      state.kind = kind;
      state.form = freshForm(kind, mode, row);
      state.form.from = from;
      state.view = 'form';
      state.notice = { type: '', text: '', lines: [] };
    }
    function actAdd(kind, rights) {
      var denied = guardEdit(rights);
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      openForm(kind, 'create', null, 'list');
      return Promise.resolve();
    }
    function actEdit(kind, code, rights, from) {
      var denied = guardEdit(rights);
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      return loadRow(kind, code).then(function (row) {
        if (!row) { setNotice('err', messageFor('NOT_FOUND', ''), []); return; }
        openForm(kind, 'edit', row, from);
      });
    }
    function actField(p) {
      var f = state.form;
      var name = str(p.name);
      var before;
      var after;
      var fk;
      if (!f) { quiet = true; return Promise.resolve(); }
      before = needsReason(f);
      if (name.indexOf('flags.') === 0) {
        fk = name.slice(6);
        if (f.values.flags && has(f.values.flags, fk)) f.values.flags[fk] = p.value === true;
        delete f.errors.flags;
      } else if (name === 'reason') {
        f.reason = str(p.value).slice(0, 200);
        delete f.errors.reason;
      } else if (has(f.values, name) && !(name === 'code' && f.mode === 'edit') && name !== 'flags') {
        f.values[name] = str(p.value).slice(0, name === 'name' ? 200 : 400);
        delete f.errors[name];
      }
      after = needsReason(f);
      quiet = before === after;
      return Promise.resolve();
    }
    function actSave(rights) {
      var f = state.form;
      var denied = guardEdit(rights);
      var conv;
      var reason;
      var input;
      var session;
      if (!f) return Promise.resolve();
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      conv = inputFromForm(f);
      f.errors = conv.errors;
      reason = str(f.reason).replace(/\s+/g, ' ').replace(/^ | $/g, '');
      if (needsReason(f) && reason.length < 5) f.errors.reason = 'REASON_REQUIRED';
      if (Object.keys(f.errors).length > 0) {
        setNotice('err', messageFor('SVS_FIELDS_INVALID', ''), []);
        return Promise.resolve();
      }
      if (!begin()) return Promise.resolve();
      input = conv.input;
      input.mode = f.mode;
      if (f.mode === 'edit') {
        input.code = f.code;
        input.expectedRev = f.rev;
        if (reason !== '') input.reason = reason;
      }
      session = readSession();
      return callCore(fnName(f.kind, 'savePart', 'saveLabour'), [input, ctxFor(session, { clientRef: f.ref })]).then(function (res) {
        var kind = f.kind;
        finish();
        if (!res.ok) {
          f.errors = formErrorsFrom(res);
          f.warnings = [];
          failNotice(res.code, res);
          if (res.code === 'NO_CHANGE') state.notice.type = 'warn';
          return;
        }
        setNotice('ok', TEXT.saved, warnLines(res.warnings));
        state.form = null;
        state.view = 'list';
        state.kind = kind;
        afterWrite();
        return refresh();
      });
    }
    function actSetActive(kind, code, active, reasonIn, rights) {
      var denied = guardEdit(rights);
      var reason = str(reasonIn).replace(/\s+/g, ' ').replace(/^ | $/g, '');
      var session;
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      if (reason.length < 5) { setNotice('err', messageFor('SVS_REASON_SHORT', ''), []); return Promise.resolve(); }
      if (!begin()) return Promise.resolve();
      session = readSession();
      return callCore(fnName(kind, 'setPartActive', 'setLabourActive'), [code, active, reason, ctxFor(session, { clientRef: newRef() })]).then(function (res) {
        finish();
        if (!res.ok) { failNotice(res.code, res); return; }
        setNotice('ok', TEXT.saved, warnLines(res.warnings));
        afterWrite();
        return refresh().then(function () { return loadDetail(kind, code); });
      });
    }
    // Owner PIN pattern: cheap checks, rights, busy, PIN, re-read session, core call with a fresh step-up stamp.
    function actDelete(kind, code, reasonIn, rights) {
      var reason = str(reasonIn).replace(/\s+/g, ' ').replace(/^ | $/g, '');
      var label;
      var session2;
      var stamp;
      var target;
      // Only the item open on the detail page can be deleted, under its own kind and stored code.
      if (!state.detail || kind !== state.kind || state.detail.row.code !== M.normalizeCode(code)) return Promise.resolve();
      target = state.detail.row.code;
      if (isPast()) { failNotice('SVS_PAST_VIEW', null); return Promise.resolve(); }
      if (reason.length < 5) { setNotice('err', messageFor('SVS_REASON_SHORT', ''), []); return Promise.resolve(); }
      if (!rights.view) { failNotice('SESSION_REQUIRED', null); return Promise.resolve(); }
      if (!rights.remove) { failNotice('SVS_OWNER_ONLY', null); return Promise.resolve(); }
      if (state.detail.hasMovements === true) { failNotice('HAS_MOVEMENTS', null); return Promise.resolve(); }
      if (!begin()) return Promise.resolve();
      label = fill(kind === 'labour' ? TEXT.reauthDeleteLabour : TEXT.reauthDeletePart, { code: target }).slice(0, 170);
      return preflightMovements(kind, target).then(function (pre) {
        if (!pre.ok) { finish(); failNotice(pre.code, pre); return null; }
        return Promise.resolve().then(function () { return typeof e.reauth === 'function' ? e.reauth(label) : false; })
          .then(function (v) { return v === true; }, function () { return false; })
          .then(function (granted) {
            if (!granted) { finish(); failNotice('SVS_PIN_DENIED', null); return null; }
            session2 = readSession();
            if (!rightsOf(session2).remove || session2.isOwner !== true) { finish(); failNotice('SVS_OWNER_ONLY', null); return null; }
            if (isPast()) { finish(); failNotice('SVS_PAST_VIEW', null); return null; }
            stamp = { ok: true, at: nowMs() };
            return callCore(fnName(kind, 'removePart', 'removeLabour'), [target, reason, ctxFor(session2, { stepUp: stamp, clientRef: newRef() })]).then(function (res) {
              finish();
              if (!res.ok) { failNotice(res.code, res); return; }
              setNotice('ok', TEXT.saved, []);
              state.detail = null;
              state.detailCode = '';
              state.view = 'list';
              afterWrite();
              return refresh();
            });
          });
      });
    }
    // A part that has any stock movement can never be deleted. Ask the ledger before the PIN so no PIN is wasted.
    function preflightMovements(kind, code) {
      var session = readSession();
      if (kind !== 'part') return Promise.resolve({ ok: true });
      if (!core || typeof core.ledger !== 'function') return Promise.resolve({ ok: true });
      return callCore('ledger', [code, { offset: 0, limit: 1 }, ctxFor(session)]).then(function (res) {
        if (!res.ok) return res;
        if (isInt(res.total) && res.total > 0) return { ok: false, code: 'HAS_MOVEMENTS' };
        if (Array.isArray(res.rows) && res.rows.length > 0) return { ok: false, code: 'HAS_MOVEMENTS' };
        return { ok: true };
      });
    }
    function actBulkOpen(rights) {
      var denied = guardEdit(rights);
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      detailSeq += 1;
      state.bulk = { text: M.templateExample(state.kind), plan: null, ref: '' };
      state.view = 'bulk';
      state.notice = { type: '', text: '', lines: [] };
      return Promise.resolve();
    }
    function actBulkText(p) {
      var had = state.bulk.plan !== null;
      state.bulk.text = str(p.value).slice(0, M.MAX_TEMPLATE_CHARS + 1);
      state.bulk.plan = null;
      state.bulk.ref = '';
      quiet = !had;
      return Promise.resolve();
    }
    function actBulkCheck(rights) {
      var denied = guardEdit(rights);
      var session;
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      if (!begin()) return Promise.resolve();
      session = readSession();
      return callCore('planBulk', [state.kind, state.bulk.text, ctxFor(session)]).then(function (res) {
        var plan = isObj(res.plan) ? res.plan : (res.ok === true ? res : res.raw);
        finish();
        if (!isObj(plan) || !Array.isArray(plan.toCreate)) {
          state.bulk.plan = null;
          failNotice(res.code, res);
          return;
        }
        state.bulk.plan = plan;
        state.bulk.ref = plan.ok === true ? newRef() : '';
        state.notice = { type: '', text: '', lines: [] };
      });
    }
    function actBulkCreate(rights) {
      var denied = guardEdit(rights);
      var plan = state.bulk.plan;
      var session;
      if (denied) { failNotice(denied, null); return Promise.resolve(); }
      if (!isObj(plan) || plan.ok !== true) return Promise.resolve();
      if (!begin()) return Promise.resolve();
      session = readSession();
      return callCore('commitBulk', [plan, ctxFor(session, { clientRef: state.bulk.ref })]).then(function (res) {
        var n;
        finish();
        if (!res.ok) {
          failNotice(res.code, res);
          state.notice.lines = bulkErrorLines(res.errors);
          return;
        }
        n = isInt(res.created) ? res.created : 0;
        setNotice('ok', n === 1 ? TEXT.oneItemCreated : fill(TEXT.itemsCreated, { n: n }), warnLines(res.warnings));
        state.bulk = { text: '', plan: null, ref: '' };
        state.view = 'list';
        afterWrite();
        return refresh();
      });
    }
    function bulkErrorLines(list) {
      var out = [];
      var i;
      var x;
      if (!Array.isArray(list)) return out;
      for (i = 0; i < list.length && i < 50; i += 1) {
        x = list[i];
        if (!isObj(x)) continue;
        out.push(lineText(x));
      }
      return out;
    }
    function lineText(x) {
      var t = messageFor(x.code, x.message);
      if (isInt(x.line) && typeof x.field === 'string' && x.field !== '') return fill(TEXT.lineField, { l: x.line, f: x.field, t: t });
      if (isInt(x.line)) return fill(TEXT.lineError, { l: x.line, t: t });
      return t;
    }

    function dispatch(action, payload) {
      var p = isObj(payload) ? payload : {};
      var session = readSession();
      var rights = rightsOf(session);
      var out;
      quiet = false;
      if (!M || !core) {
        failNotice('SVS_CORE_MISSING', null);
        paint();
        return Promise.resolve();
      }
      if (!rights.view) {
        failNotice('SESSION_REQUIRED', null);
        paint();
        return Promise.resolve();
      }
      switch (action) {
        case 'svcm-tab-parts':
        case 'svcm-tab-labour':
          state.kind = action === 'svcm-tab-labour' ? 'labour' : 'part';
          detailSeq += 1;
          state.group = '';
          state.q = '';
          state.page = 0;
          state.view = 'list';
          state.form = null;
          state.detail = null;
          state.notice = { type: '', text: '', lines: [] };
          out = refresh();
          break;
        case 'svcm-search':
          state.q = str(p.value).slice(0, 80);
          state.page = 0;
          out = refresh();
          break;
        case 'svcm-filter-group':
          state.group = str(p.value).slice(0, 40);
          state.page = 0;
          out = refresh();
          break;
        case 'svcm-filter-active':
          state.active = contains(FILTER_ACTIVE, p.value) ? p.value : 'true';
          state.page = 0;
          out = refresh();
          break;
        case 'svcm-filter-taxpending':
          state.taxPending = contains(FILTER_TAX, p.value) ? p.value : 'all';
          state.page = 0;
          out = refresh();
          break;
        case 'svcm-page-prev':
          if (state.page > 0) state.page -= 1;
          out = refresh();
          break;
        case 'svcm-page-next':
          if ((state.page + 1) * PAGE_SIZE < state.list.total) state.page += 1;
          out = refresh();
          break;
        case 'svcm-add':
          out = actAdd(kindOf(p.kind || state.kind), rights);
          break;
        case 'svcm-field':
          out = actField(p);
          break;
        case 'svcm-save':
          out = actSave(rights);
          break;
        case 'svcm-cancel':
          if (state.view === 'form' && state.form && state.form.from === 'detail' && state.detail) state.view = 'detail';
          else state.view = 'list';
          state.form = null;
          state.notice = { type: '', text: '', lines: [] };
          out = Promise.resolve();
          break;
        case 'svcm-back':
          state.view = 'list';
          state.detail = null;
          state.notice = { type: '', text: '', lines: [] };
          out = refresh();
          break;
        case 'svcm-open':
          state.notice = { type: '', text: '', lines: [] };
          out = loadDetail(kindOf(p.kind || state.kind), str(p.code));
          break;
        case 'svcm-edit':
          out = actEdit(kindOf(p.kind || state.kind), str(p.code), rights, state.view === 'detail' ? 'detail' : 'list');
          break;
        case 'svcm-detail-reason':
          if (state.detail) state.detail.reason = str(p.value).slice(0, 200);
          quiet = true;
          out = Promise.resolve();
          break;
        case 'svcm-deactivate':
        case 'svcm-reactivate':
          out = actSetActive(kindOf(p.kind || state.kind), str(p.code), action === 'svcm-reactivate',
            p.reason !== undefined ? p.reason : (state.detail ? state.detail.reason : ''), rights);
          break;
        case 'svcm-delete':
          out = actDelete(kindOf(p.kind || state.kind), str(p.code),
            p.reason !== undefined ? p.reason : (state.detail ? state.detail.reason : ''), rights);
          break;
        case 'svcm-bulk-open':
          out = actBulkOpen(rights);
          break;
        case 'svcm-bulk-text':
          out = actBulkText(p);
          break;
        case 'svcm-bulk-check':
          out = actBulkCheck(rights);
          break;
        case 'svcm-bulk-create':
          out = actBulkCreate(rights);
          break;
        case 'svcm-bulk-clear':
          state.bulk = { text: '', plan: null, ref: '' };
          out = Promise.resolve();
          break;
        default:
          quiet = true;
          out = Promise.resolve();
      }
      return out.then(function () {
        if (!quiet) paint();
      }, function () {
        finish();
        failNotice('SVS_BAD_REPLY', null);
        paint();
      });
    }

    function paint() {
      if (typeof paintHook === 'function') paintHook();
    }

    // -------- rendering
    function esc(v) {
      var t = typeof e.esc === 'function' ? e.esc(str(v)) : plainEsc(v);
      return String(t);
    }
    function attr(v) {
      return esc(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
    }
    function num(v) { return '<span class="svs-num">' + esc(v) + '</span>'; }
    function inr(paise) {
      var p = isInt(paise) && paise >= 0 ? paise : 0;
      var r = Math.floor(p / 100);
      var d = p % 100;
      return 'Rs ' + groupDigits(r) + '.' + (d < 10 ? '0' : '') + d;
    }
    function istText(iso) {
      var t = Date.parse(str(iso));
      if (isNaN(t)) return '';
      return new Date(t + INDIA_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
    }
    function basisText(row) {
      if (row.priceIncludesTax === true) return TEXT.basisIncl;
      if (row.priceIncludesTax === false) return TEXT.basisExcl;
      return TEXT.basisNone;
    }
    function actionAttr(action) { return ' data-svcs-action="' + attr(action) + '"'; }
    function btn(label, action, extra) {
      var x = extra || {};
      var cls = 'svs-btn' + (x.primary ? ' svs-btn-primary' : '') + (x.danger ? ' svs-btn-danger' : '');
      return '<button type="button" class="' + cls + '"' + actionAttr(action) + (x.key !== undefined ? ' data-svs-key="' + attr(x.key) + '"' : '') +
        (x.kind ? ' data-svcm-kind="' + attr(x.kind) + '"' : '') + (x.selected !== undefined ? ' role="tab" aria-selected="' + (x.selected ? 'true' : 'false') + '"' : '') +
        (x.disabled ? ' disabled aria-disabled="true"' : '') + '>' + esc(label) + '</button>';
    }
    function noticeHtml() {
      var n = state.notice;
      var i;
      var html;
      if (!n || n.text === '') return '';
      html = '<div class="svs-notice" data-svcm-notice="' + attr(n.type) + '" role="' + (n.type === 'err' ? 'alert' : 'status') + '">' + esc(n.text);
      if (Array.isArray(n.lines) && n.lines.length > 0) {
        html += '<ul>';
        for (i = 0; i < n.lines.length; i += 1) html += '<li>' + esc(n.lines[i]) + '</li>';
        html += '</ul>';
      }
      return html + '</div>';
    }
    function tabsHtml(rights) {
      var html = '<div role="tablist" class="svs-row">';
      html += btn(TEXT.tabParts, 'svcm-tab-parts', { selected: state.kind === 'part', primary: state.kind === 'part' });
      html += btn(TEXT.tabLabour, 'svcm-tab-labour', { selected: state.kind === 'labour', primary: state.kind === 'labour' });
      if (rights.edit && !isPast()) {
        html += btn(state.kind === 'labour' ? TEXT.addLabour : TEXT.addPart, 'svcm-add', { kind: state.kind, primary: true });
        html += btn(TEXT.bulk, 'svcm-bulk-open', { kind: state.kind });
      }
      return html + '</div>';
    }
    function optionsHtml(list, selected) {
      var html = '';
      var i;
      for (i = 0; i < list.length; i += 1) {
        html += '<option value="' + attr(list[i][0]) + '"' + (list[i][0] === selected ? ' selected' : '') + '>' + esc(list[i][1]) + '</option>';
      }
      return html;
    }
    function filtersHtml() {
      var groups = [['', TEXT.allGroups]];
      var i;
      var gl = state.list.groups;
      for (i = 0; i < gl.length; i += 1) groups.push([gl[i], gl[i]]);
      return '<div class="svs-row">' +
        '<label class="svs-sr-only" for="svcm-q">' + esc(TEXT.search) + '</label>' +
        '<input id="svcm-q" class="svs-input" type="search" maxlength="80" placeholder="' + attr(TEXT.search) + '" value="' + attr(state.q) + '"' + actionAttr('svcm-search') + '>' +
        '<label class="svs-label" for="svcm-g">' + esc(TEXT.group) + '</label>' +
        '<select id="svcm-g" class="svs-input"' + actionAttr('svcm-filter-group') + '>' + optionsHtml(groups, state.group) + '</select>' +
        '<label class="svs-label" for="svcm-a">' + esc(TEXT.statusFilter) + '</label>' +
        '<select id="svcm-a" class="svs-input"' + actionAttr('svcm-filter-active') + '>' +
        optionsHtml([['true', TEXT.active], ['false', TEXT.inactive], ['all', TEXT.all]], state.active) + '</select>' +
        '<label class="svs-label" for="svcm-t">' + esc(TEXT.taxOnly) + '</label>' +
        '<select id="svcm-t" class="svs-input"' + actionAttr('svcm-filter-taxpending') + '>' +
        optionsHtml([['all', TEXT.all], ['true', TEXT.taxMissing]], state.taxPending) + '</select></div>';
    }
    function countHtml() {
      var l = state.list;
      var text = l.taxPendingTotal === null ? fill(TEXT.countOnly, { n: '@@n@@' }) : fill(TEXT.countLine, { n: '@@n@@', m: '@@m@@' });
      return '<p class="svs-muted" role="status">' + esc(text).replace('@@n@@', num(l.total)).replace('@@m@@', num(l.taxPendingTotal === null ? 0 : l.taxPendingTotal)) + '</p>';
    }
    function rowHtml(row) {
      var isLabour = state.kind === 'labour';
      var taxCode = isLabour ? row.sac : row.hsn;
      var price = isLabour ? row.ratePaise : row.sellPricePaise;
      var pending = taxPendingOf(row);
      var html = '<div class="svs-row" role="listitem">';
      html += '<strong>' + esc(row.code) + '</strong> ' + esc(row.name);
      html += ' <span class="svs-muted">' + esc(row.group) + ' / ' + esc(UNIT_LABELS[row.unit] || row.unit) + '</span>';
      if (row.active === false) html += ' <span class="svs-badge">' + esc(TEXT.inactive) + '</span>';
      html += '<div>' + esc(isLabour ? TEXT.sac : TEXT.hsn) + ': ' + esc(taxCode === '' ? '-' : taxCode) + ' | ' + esc(TEXT.gst) + ': ' +
        esc(isInt(row.gstRateBp) ? M.bpToPercentText(row.gstRateBp) : '-');
      if (pending) html += ' <span class="svs-badge svs-warn">' + esc(TEXT.taxMissing) + '</span>';
      html += '</div>';
      html += '<div>' + esc(isLabour ? TEXT.rate : TEXT.price) + ': ' + esc(inr(price)) + ' <span class="svs-muted">(' + esc(basisText(row)) + ')</span>';
      if (!isLabour) {
        html += ' | ' + esc(TEXT.reorderLevel) + ': ' + esc(row.reorderLevel) + ' / ' + esc(row.reorderQty) + ' | ' + esc(TEXT.bin) + ': ' + esc(row.bin === '' ? '-' : row.bin);
      }
      html += '</div>';
      html += btn(TEXT.open, 'svcm-open', { key: row.code, kind: state.kind });
      return html + '</div>';
    }
    function listHtml(rights) {
      var l = state.list;
      var html = tabsHtml(rights) + noticeHtml();
      var i;
      var a;
      var b;
      html += filtersHtml();
      if (!l.loaded) return html + '<p class="svs-muted" role="status">' + esc(TEXT.loading) + '</p>';
      if (l.error !== '') return html + '<div class="svs-notice" role="alert">' + esc(TEXT.sListFailed) + ' ' + esc(messageFor(l.error, '')) + '</div>';
      html += countHtml();
      if (l.rows.length === 0) return html + '<p class="svs-muted">' + esc(TEXT.empty) + '</p>';
      html += '<div role="list">';
      for (i = 0; i < l.rows.length; i += 1) html += rowHtml(l.rows[i]);
      html += '</div>';
      a = state.page * PAGE_SIZE + 1;
      b = Math.min(l.total, state.page * PAGE_SIZE + l.rows.length);
      html += '<div class="svs-row"><span class="svs-muted">' + esc(fill(TEXT.rangeLine, { a: '@@a@@', b: '@@b@@', n: '@@n@@' })).replace('@@a@@', num(a)).replace('@@b@@', num(b)).replace('@@n@@', num(l.total)) + '</span>';
      html += btn(TEXT.prev, 'svcm-page-prev', { disabled: state.page === 0 });
      html += btn(TEXT.next, 'svcm-page-next', { disabled: (state.page + 1) * PAGE_SIZE >= l.total });
      return html + '</div>';
    }
    function dl(label, valueHtml) {
      return '<div class="svs-row"><span class="svs-label">' + esc(label) + '</span> ' + valueHtml + '</div>';
    }
    function fmtChange(field, v) {
      if (v === null || v === undefined) return '-';
      if (field === 'sellPricePaise' || field === 'ratePaise') return isInt(v) ? inr(v) : str(v);
      if (field === 'gstRateBp') return isInt(v) ? M.bpToPercentText(v) + '%' : str(v);
      if (field === 'priceIncludesTax') return v === true ? TEXT.basisIncl : (v === false ? TEXT.basisExcl : TEXT.basisNone);
      if (field === 'active') return v === true ? TEXT.active : TEXT.inactive;
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (isObj(v)) return '';
      return str(v);
    }
    function changeLabel(field) {
      var f = str(field);
      if (f.indexOf('flags.') === 0) return FLAG_LABELS[f.slice(6)] || f.slice(6);
      return FIELD_LABELS[f] || f;
    }
    function historyHtml(d) {
      var html = '<h4>' + esc(TEXT.history) + '</h4>';
      var i;
      var j;
      var h;
      var ch;
      var parts;
      if (d.historyError !== '') return html + '<p class="svs-notice" role="alert">' + esc(messageFor(d.historyError, '')) + '</p>';
      if (d.history.length === 0) return html + '<p class="svs-muted">' + esc(TEXT.historyEmpty) + '</p>';
      html += '<div role="list">';
      for (i = 0; i < d.history.length; i += 1) {
        h = d.history[i];
        parts = [];
        ch = Array.isArray(h.changes) ? h.changes : [];
        if (h.action === 'create') parts.push(TEXT.historyCreated);
        else if (h.action === 'delete') parts.push(TEXT.historyRemoved);
        else {
          for (j = 0; j < ch.length && j < 8; j += 1) {
            if (isObj(ch[j]) && ch[j].field !== '*') parts.push(changeLabel(ch[j].field) + ': ' + fmtChange(ch[j].field, ch[j].from) + ' > ' + fmtChange(ch[j].field, ch[j].to));
          }
        }
        html += '<div class="svs-row" role="listitem"><span class="svs-muted">' + esc(istText(h.at)) + ' IST | ' + esc(actorLabel(h.actor)) + '</span> ' +
          esc(parts.join('; ')) + (h.reason ? ' <em>' + esc(h.reason) + '</em>' : '') + '</div>';
      }
      return html + '</div>';
    }
    function detailHtml(rights) {
      var d = state.detail;
      var row;
      var isLabour = state.kind === 'labour';
      var html;
      var fk;
      var on = [];
      var i;
      var canEdit = rights.edit && !isPast();
      var why;
      if (!d) return '';
      row = d.row;
      html = btn(TEXT.back, 'svcm-back') + noticeHtml();
      html += '<h3>' + esc(row.code) + ' ' + esc(row.name) + '</h3>';
      if (taxPendingOf(row)) html += '<p class="svs-notice svs-warn" role="status">' + esc(messageFor('TAX_DETAILS_MISSING', '')) + '</p>';
      html += dl(TEXT.group, esc(row.group));
      html += dl(TEXT.unit, esc(UNIT_LABELS[row.unit] || row.unit));
      html += dl(isLabour ? TEXT.sac : TEXT.hsn, esc(str(isLabour ? row.sac : row.hsn) === '' ? '-' : (isLabour ? row.sac : row.hsn)));
      html += dl(TEXT.gst, esc(isInt(row.gstRateBp) ? M.bpToPercentText(row.gstRateBp) : '-'));
      html += dl(isLabour ? TEXT.rate : TEXT.price, esc(inr(isLabour ? row.ratePaise : row.sellPricePaise)) + ' <span class="svs-muted">(' + esc(basisText(row)) + ')</span>');
      if (!isLabour) {
        html += dl(TEXT.reorderLevel, num(row.reorderLevel));
        html += dl(TEXT.reorderQty, num(row.reorderQty));
        html += dl(TEXT.bin, esc(row.bin === '' ? '-' : row.bin));
        if (isObj(row.flags)) {
          fk = M.FLAG_KEYS;
          for (i = 0; i < fk.length; i += 1) { if (row.flags[fk[i]] === true) on.push(FLAG_LABELS[fk[i]]); }
        }
        html += dl(TEXT.flags, esc(on.length === 0 ? TEXT.noneSet : on.join(', ')));
      }
      why = row.deactivateReason || d.deactivateReason;
      html += dl(TEXT.status, esc(row.active === false ? TEXT.inactive : TEXT.active) + (row.active === false && why ? ' <em>' + esc(why) + '</em>' : ''));
      if (row.createdAt || d.createdAt) html += dl(TEXT.created, esc(istText(row.createdAt || d.createdAt)) + ' ' + esc(str(row.createdBy || d.createdBy)));
      if (row.updatedAt || d.changedAt) html += dl(TEXT.changed, esc(istText(row.updatedAt || d.changedAt)) + ' ' + esc(str(row.updatedBy || d.changedBy)));
      html += dl(TEXT.revision, num(row.rev));
      if (canEdit) {
        html += '<div class="svs-row">' + btn(TEXT.edit, 'svcm-edit', { key: row.code, kind: state.kind, primary: true });
        html += '<label class="svs-label" for="svcm-dr">' + esc(TEXT.reasonDo) + '</label>' +
          '<input id="svcm-dr" class="svs-input" type="text" maxlength="200" value="' + attr(d.reason) + '"' + actionAttr('svcm-detail-reason') + '>';
        html += row.active === false ? btn(TEXT.reactivate, 'svcm-reactivate', { key: row.code, kind: state.kind, disabled: state.busy }) :
          btn(TEXT.deactivate, 'svcm-deactivate', { key: row.code, kind: state.kind, disabled: state.busy });
        if (rights.remove && d.hasMovements !== true) {
          html += btn(TEXT.del, 'svcm-delete', { key: row.code, kind: state.kind, danger: true, disabled: state.busy });
        }
        html += '</div>';
        if (rights.remove && d.hasMovements !== true) html += '<p class="svs-muted">' + esc(TEXT.deleteHelp) + '</p>';
      } else {
        html += '<p class="svs-muted">' + esc(TEXT.viewOnly) + '</p>';
      }
      return d.historyAllowed ? html + historyHtml(d) : html;
    }
    function fieldHtml(f, name, label, controlHtml) {
      var code = f.errors[name];
      var err = code ? '<div class="svs-error" id="svcm-e-' + attr(name) + '" role="alert">' + esc(messageFor(code, '')) + '</div>' : '';
      return '<div class="svs-row"><label class="svs-label" for="svcm-f-' + attr(name) + '">' + esc(label) + '</label>' + controlHtml + err + '</div>';
    }
    function textControl(f, name, opts) {
      var o = opts || {};
      var bad = f.errors[name] ? ' aria-invalid="true" aria-describedby="svcm-e-' + attr(name) + '"' : '';
      return '<input id="svcm-f-' + attr(name) + '" class="svs-input" type="text" data-svcm-name="' + attr(name) + '"' + actionAttr('svcm-field') +
        ' value="' + attr(f.values[name]) + '" maxlength="' + (o.max || 80) + '"' + (o.readonly ? ' readonly' : '') + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') +
        (o.list ? ' list="' + attr(o.list) + '"' : '') + (o.required ? ' aria-required="true"' : '') + bad + '>';
    }
    function formHtml() {
      var f = state.form;
      var isLabour = f.kind === 'labour';
      var html;
      var units = (M.UNITS[f.kind] || []).map(function (u) { return [u, UNIT_LABELS[u] || u]; });
      var gl = state.list.groups;
      var dlist = '<datalist id="svcm-groups">';
      var i;
      var fk;
      var warnHtml = '';
      for (i = 0; i < gl.length; i += 1) dlist += '<option value="' + attr(gl[i]) + '"></option>';
      dlist += '</datalist>';
      html = noticeHtml();
      html += '<h3>' + esc(f.mode === 'edit' ? TEXT.edit + ': ' + f.code : (isLabour ? TEXT.addLabour : TEXT.addPart)) + '</h3>';
      html += fieldHtml(f, 'code', TEXT.code, textControl(f, 'code', { max: 40, readonly: f.mode === 'edit', required: true }));
      html += fieldHtml(f, 'name', TEXT.name, textControl(f, 'name', { max: 80, required: true }));
      html += fieldHtml(f, 'group', TEXT.group, textControl(f, 'group', { max: 40, list: 'svcm-groups', required: true }) + dlist);
      html += fieldHtml(f, 'unit', TEXT.unit, '<select id="svcm-f-unit" class="svs-input" data-svcm-name="unit"' + actionAttr('svcm-field') + '>' + optionsHtml(units, f.values.unit) + '</select>');
      html += fieldHtml(f, 'tax', isLabour ? TEXT.sac : TEXT.hsn, textControl(f, 'tax', { max: 8, inputmode: 'numeric' }));
      html += fieldHtml(f, 'gst', TEXT.gst, textControl(f, 'gst', { max: 7, inputmode: 'decimal' }));
      html += fieldHtml(f, 'price', isLabour ? TEXT.rate : TEXT.price, textControl(f, 'price', { max: 13, inputmode: 'decimal' }));
      html += fieldHtml(f, 'basis', TEXT.basis, '<select id="svcm-f-basis" class="svs-input" data-svcm-name="basis"' + actionAttr('svcm-field') + '>' +
        optionsHtml([['', TEXT.chooseNone], ['yes', TEXT.basisIncl], ['no', TEXT.basisExcl]], f.values.basis) + '</select>');
      if (!isLabour) {
        html += fieldHtml(f, 'reorderLevel', TEXT.reorderLevel, textControl(f, 'reorderLevel', { max: 6, inputmode: 'numeric' }));
        html += fieldHtml(f, 'reorderQty', TEXT.reorderQty, textControl(f, 'reorderQty', { max: 6, inputmode: 'numeric' }));
        html += fieldHtml(f, 'bin', TEXT.bin, textControl(f, 'bin', { max: 20 }));
        fk = M.FLAG_KEYS;
        html += '<div class="svs-row" role="group" aria-label="' + attr(TEXT.flags) + '">';
        for (i = 0; i < fk.length; i += 1) {
          html += '<label class="svs-label"><input type="checkbox" data-svcm-name="flags.' + attr(fk[i]) + '"' + actionAttr('svcm-field') + (f.values.flags[fk[i]] ? ' checked' : '') + '> ' + esc(FLAG_LABELS[fk[i]]) + '</label>';
        }
        html += (f.errors.flags ? '<div class="svs-error" role="alert">' + esc(messageFor(f.errors.flags, '')) + '</div>' : '') + '</div>';
      }
      if (needsReason(f)) {
        html += fieldHtml(f, 'reason', TEXT.reason, '<input id="svcm-f-reason" class="svs-input" type="text" maxlength="200" data-svcm-name="reason"' + actionAttr('svcm-field') +
          ' value="' + attr(f.reason) + '" aria-required="true"' + (f.errors.reason ? ' aria-invalid="true" aria-describedby="svcm-e-reason"' : '') + '>');
      }
      for (i = 0; i < f.warnings.length; i += 1) warnHtml += '<li>' + esc(f.warnings[i]) + '</li>';
      if (warnHtml !== '') html += '<ul class="svs-warn">' + warnHtml + '</ul>';
      html += '<div class="svs-row">' + btn(TEXT.save, 'svcm-save', { primary: true, disabled: state.busy }) + btn(TEXT.cancel, 'svcm-cancel') + '</div>';
      return html;
    }
    function bulkHtml() {
      var b = state.bulk;
      var plan = b.plan;
      var html = noticeHtml() + '<h3>' + esc(TEXT.bulk) + '</h3>';
      var i;
      var list;
      var ok = isObj(plan) && plan.ok === true;
      html += '<p>' + esc(TEXT.pasteHelp) + '</p><p class="svs-muted">' + esc(TEXT.pasteKeep) + '</p>';
      html += '<p><span class="svs-label">' + esc(TEXT.headerLabel) + '</span> <code>' + esc(M.TEMPLATE_HEADERS[state.kind].join(',')) + '</code></p>';
      html += '<label class="svs-sr-only" for="svcm-bulk">' + esc(TEXT.bulk) + '</label>';
      html += '<textarea id="svcm-bulk" class="svs-input" rows="10"' + actionAttr('svcm-bulk-text') + '>' + esc(b.text) + '</textarea>';
      html += '<div class="svs-row">' + btn(TEXT.check, 'svcm-bulk-check', { disabled: state.busy }) +
        btn(TEXT.createItems, 'svcm-bulk-create', { primary: true, disabled: !ok || state.busy }) +
        btn(TEXT.clear, 'svcm-bulk-clear') + btn(TEXT.cancel, 'svcm-cancel') + '</div>';
      if (isObj(plan)) {
        if (plan.code && (!Array.isArray(plan.errors) || plan.errors.length === 0) && plan.ok !== true) {
          html += '<div class="svs-notice" role="alert">' + esc(messageFor(plan.code, plan.message)) + '</div>';
        }
        html += '<p class="svs-muted" role="status">' + esc(fill(TEXT.planLine, { c: '@@c@@', s: '@@s@@', t: '@@t@@' }))
          .replace('@@c@@', num(Array.isArray(plan.toCreate) ? plan.toCreate.length : 0))
          .replace('@@s@@', num(Array.isArray(plan.skippedExisting) ? plan.skippedExisting.length : 0))
          .replace('@@t@@', num(isInt(plan.taxPendingCount) ? plan.taxPendingCount : 0)) + '</p>';
        list = Array.isArray(plan.errors) ? plan.errors : [];
        if (list.length > 0) {
          html += '<ul class="svs-error" role="alert">';
          for (i = 0; i < list.length && i < 100; i += 1) html += '<li>' + esc(lineText(list[i])) + '</li>';
          html += '</ul>';
        }
        list = Array.isArray(plan.warnings) ? plan.warnings : [];
        if (list.length > 0) {
          html += '<ul class="svs-warn">';
          for (i = 0; i < list.length && i < 100; i += 1) html += '<li>' + esc(lineText(list[i])) + '</li>';
          html += '</ul>';
        }
      }
      return html;
    }
    function render() {
      var session = readSession();
      var rights = rightsOf(session);
      var inner;
      if (!M || !core) return '<div class="svs-card" data-no-i18n><p class="svs-notice" role="alert">' + esc(TEXT.sCoreMissing) + '</p></div>';
      if (!rights.view) return '<div class="svs-card" data-no-i18n><p class="svs-notice" role="alert">' + esc(TEXT.unavailable) + '</p></div>';
      if (state.view === 'form' && state.form) inner = formHtml();
      else if (state.view === 'detail' && state.detail) inner = detailHtml(rights);
      else if (state.view === 'bulk') inner = bulkHtml();
      else inner = listHtml(rights);
      return '<div class="svs-card" data-no-i18n data-svcm-view="' + attr(state.view) + '"><h2 class="svs-title">' + esc(TEXT.title) + '</h2>' + inner + '</div>';
    }

    return {
      state: state,
      render: render,
      dispatch: dispatch,
      refresh: refresh,
      openNew: function (kind) {
        var session = readSession();
        state.view = 'list';
        return actAdd(kindOf(kind), rightsOf(session)).then(function () { paint(); });
      },
      openEdit: function (kind, code) {
        var session = readSession();
        return actEdit(kindOf(kind), str(code), rightsOf(session), 'list').then(function () { paint(); });
      },
      attach: function (fn) { paintHook = typeof fn === 'function' ? fn : null; },
      destroy: function () { paintHook = null; listSeq += 1; detailSeq += 1; }
    };
  }

  // ---------------------------------------------------------------- mounting
  function targetAction(host, target) {
    var el = target;
    var hops = 0;
    var a;
    while (el && hops < 12) {
      if (typeof el.getAttribute === 'function') {
        a = el.getAttribute('data-svcs-action');
        if (typeof a === 'string' && a.indexOf('svcm-') === 0) return { el: el, action: a };
      }
      if (el === host) return null;
      el = el.parentNode;
      hops += 1;
    }
    return null;
  }
  function isField(el) {
    var t = el && typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA';
  }
  function isChoice(el) {
    var t = el && typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    return t === 'SELECT' || (t === 'INPUT' && el.type === 'checkbox');
  }
  function payloadOf(el) {
    var p = {};
    var k = el.getAttribute('data-svs-key');
    var n = el.getAttribute('data-svcm-name');
    var kind = el.getAttribute('data-svcm-kind');
    if (typeof k === 'string') p.code = k;
    if (typeof n === 'string') p.name = n;
    if (typeof kind === 'string') p.kind = kind;
    if (isField(el)) p.value = el.type === 'checkbox' ? el.checked === true : el.value;
    return p;
  }

  function mount(host, env) {
    var ctl = create(env);
    var routeClick;
    var routeInput;
    var routeChange;
    var prev;
    function paint() {
      var focusName = null;
      var focusId = null;
      var start = null;
      var doc = host.ownerDocument || null;
      var active = doc && doc.activeElement ? doc.activeElement : null;
      var again = null;
      if (active && typeof active.getAttribute === 'function' && host.contains && host.contains(active)) {
        focusName = active.getAttribute('data-svcm-name');
        focusId = active.id || null;
        start = typeof active.selectionStart === 'number' ? active.selectionStart : null;
      }
      host.innerHTML = ctl.render();
      if ((focusName || focusId) && typeof host.querySelector === 'function') {
        again = focusName ? host.querySelector('[data-svcm-name="' + focusName + '"]') : host.querySelector('#' + focusId);
        if (again && typeof again.focus === 'function') {
          again.focus();
          if (start !== null && typeof again.setSelectionRange === 'function') again.setSelectionRange(start, start);
        }
      }
    }
    if (!host) return ctl;
    prev = host.svcmController;
    if (prev && typeof prev.destroy === 'function') prev.destroy();
    host.svcmController = ctl;
    routeClick = function (ev) {
      var hit = targetAction(host, ev && ev.target);
      if (!hit || isField(hit.el)) return;
      ctl.dispatch(hit.action, payloadOf(hit.el));
    };
    routeInput = function (ev) {
      var hit = targetAction(host, ev && ev.target);
      if (!hit || !contains(INPUT_ACTIONS, hit.action) || isChoice(hit.el)) return;
      ctl.dispatch(hit.action, payloadOf(hit.el));
    };
    routeChange = function (ev) {
      var hit = targetAction(host, ev && ev.target);
      if (!hit || !contains(CHANGE_ACTIONS, hit.action) || !isChoice(hit.el)) return;
      ctl.dispatch(hit.action, payloadOf(hit.el));
    };
    ctl.attach(paint);
    host.addEventListener('click', routeClick);
    host.addEventListener('input', routeInput);
    host.addEventListener('change', routeChange);
    ctl.destroy = (function (inner) {
      return function () {
        inner();
        host.removeEventListener('click', routeClick);
        host.removeEventListener('input', routeInput);
        host.removeEventListener('change', routeChange);
        if (host.svcmController === ctl) host.svcmController = null;
      };
    })(ctl.destroy);
    paint();
    ctl.refresh();
    return ctl;
  }

  return Object.freeze({
    VERSION: 1,
    ACTIONS: ACTIONS,
    TEXT: TEXT,
    phrases: phrases,
    create: create,
    mount: mount
  });
});
