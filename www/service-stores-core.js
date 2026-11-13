(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceStoresCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * Service Stores core facade (Phase 1).
   * One object for the screens and the report data. It builds the store, hands it to the docs layer,
   * opens lazily on the first call (and only when storage is authoritative), and answers every read from
   * the records of the store. It never writes to storage itself: every write goes through the docs
   * layer or the masters layer, and from there through the store.
   * Roles are a boundary: every call takes a ctx with a fresh session and re-checks it. Cost fields are
   * null unless the session is the Store Manager or the Owner. Money is integer paise, dates are India dates.
   * No customer data is read, kept or returned.
   */

  var CORE_VERSION = 1;
  var CORE_STEP_UP_MS = 120000;
  var CORE_PAGE_DEFAULT = 50;
  var CORE_PAGE_MAX = 500;
  var CORE_INDIA_MS = 19800000;
  var CORE_DAY_MS = 86400000;
  var CORE_LEDGER_SPAN_DAYS = 1100;
  var CORE_REPORT_ROW_CAP = 20000;
  var CORE_DATA_STREAMS = ['ledger', 'docs', 'defective', 'parts', 'labour', 'config'];
  var CORE_REOPEN_CODES = {
    SVCS_REV_CONFLICT: true, SVCS_SERIES_MISMATCH: true, SVCS_HEAD_BEHIND: true,
    SVCS_WRITE_FAILED: true, SVCS_READBACK_MISMATCH: true, SVCS_HEAD_WRITE_FAILED: true
  };
  var CORE_OLD_LABELS = {
    HELD_FOR_CLAIM: 'Held for claim',
    CUSTOMER_RETURNED: 'Customer Returned',
    SCRAP_PENDING: 'Scrap pending Owner sign-off',
    SCRAPPED: 'Scrapped'
  };
  var CORE_OLD_BINS = { HELD_FOR_CLAIM: 'CLAIM', SCRAP_PENDING: 'SCRAP', CUSTOMER_RETURNED: '', SCRAPPED: '' };
  var CORE_OLD_NEXT = {
    HELD_FOR_CLAIM: ['CUSTOMER_RETURNED', 'SCRAP_PENDING'],
    SCRAP_PENDING: ['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED'],
    CUSTOMER_RETURNED: [],
    SCRAPPED: []
  };
  var CORE_ADJ_LABELS = {
    FOUND: 'Found', COUNT_CORRECTION: 'Count correction', WRONG_RECEIPT: 'Wrong receipt',
    DAMAGED: 'Damaged', LOST: 'Lost', WRITE_OFF: 'Write-off'
  };
  var CORE_WRITEOFF_REASONS = { DAMAGED: true, LOST: true, WRITE_OFF: true };
  var CORE_DOC_KINDS = { OPN: true, GRN: true, ISS: true, RET: true, CSL: true, ADJ: true };
  var CORE_REPORT_TYPES = ['svcStockList', 'svcPartLedger', 'svcReorderList', 'svcGoodsReceipt', 'svcAdjustmentRegister', 'svcDefectiveRegister'];
  // Actions the core answers itself (names are the docs layer's names). Older names map to them.
  var CORE_OWN_ACTIONS = {
    VIEW: 'any', VIEW_COST: 'manager', MASTERS_EDIT: 'manager', MASTERS_REMOVE: 'owner',
    NEGATIVE_OVERRIDE: 'owner', ACK_RESTORE: 'owner', CLOCK_OVERRIDE: 'owner'
  };
  var CORE_OWN_PIN = { MASTERS_REMOVE: true, NEGATIVE_OVERRIDE: true, ACK_RESTORE: true, CLOCK_OVERRIDE: true };
  var CORE_ACTION_ALIAS = {
    VIEW_QTY: 'VIEW', VIEW_LEDGER: 'VIEW_COST', MASTER_EDIT: 'MASTERS_EDIT', MASTER_REMOVE: 'MASTERS_REMOVE',
    RESTORE_ACK: 'ACK_RESTORE'
  };

  var CORE_CODE_TABLE = [
    ['CORE_ARGS_INVALID', 'The request was not complete. Nothing was changed.'],
    ['CORE_LIBS_MISSING', 'Stores is not fully loaded on this device. Nothing was changed.'],
    ['CORE_INTERNAL', 'Something went wrong inside Stores. Nothing was changed.'],
    ['CORE_LEDGER_UNREADABLE', 'The stock ledger could not be read. No figures are shown.'],
    ['SESSION_REQUIRED', 'Sign in again. Stores could not read who you are.'],
    ['ROLE_DENIED', 'Your role cannot see or do this in Stores.'],
    ['PIN_REQUIRED', 'Owner PIN approval is needed for this.'],
    ['ARG_INVALID', 'One of the values asked for is not valid.'],
    ['NOT_READY', 'Opening stock has not been set yet.'],
    ['CHAIN_BROKEN', 'The Stores records failed their integrity check. No figures are shown.'],
    ['PART_UNKNOWN', 'That part code was not found.'],
    ['GRN_UNKNOWN', 'That goods receipt was not found.'],
    ['DOC_NOT_FOUND', 'That posting was not found.'],
    ['ASOF_UNSUPPORTED', 'Stock as at that date is not available.'],
    ['READ_FAILED', 'The Stores records could not be read.']
  ];
  var CORE_CODES = {};
  var CORE_MESSAGES = {};
  (function crBuildTables() {
    var i;
    for (i = 0; i < CORE_CODE_TABLE.length; i += 1) {
      CORE_CODES[CORE_CODE_TABLE[i][0]] = CORE_CODE_TABLE[i][0];
      CORE_MESSAGES[CORE_CODE_TABLE[i][0]] = CORE_CODE_TABLE[i][1];
    }
  })();
  CORE_CODES = Object.freeze(CORE_CODES);
  CORE_MESSAGES = Object.freeze(CORE_MESSAGES);

  /* ---------------------------------------------------------------- small helpers */

  function crIsObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function crHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function crIsInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && Math.abs(v) <= 9007199254740991; }
  function crStr(v, max) {
    var s = typeof v === 'string' ? v : '';
    return max && s.length > max ? s.slice(0, max) : s;
  }
  function crMap() { return Object.create(null); }
  function crPad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function crMessage(code) {
    return crHas(CORE_MESSAGES, code) ? CORE_MESSAGES[code] : '';
  }
  function crFail(code, extra) {
    var out = { ok: false, code: code, message: crMessage(code) };
    var k;
    if (crIsObj(extra)) {
      for (k in extra) if (crHas(extra, k)) out[k] = extra[k];
    }
    return Object.freeze(out);
  }
  // Pass a failure from a lower layer on unchanged, adding only what the lower layer left out.
  function crPass(res, fallbackCode) {
    var out;
    var k;
    if (!crIsObj(res)) return crFail(fallbackCode || 'CORE_INTERNAL');
    if (res.ok === true) return res;
    out = {};
    for (k in res) if (crHas(res, k)) out[k] = res[k];
    out.ok = false;
    if (typeof out.code !== 'string' || out.code === '') out.code = fallbackCode || 'CORE_INTERNAL';
    if (typeof out.message !== 'string') out.message = crMessage(out.code);
    return Object.freeze(out);
  }
  function crCopyList(list) {
    var out = [];
    var i;
    if (!Array.isArray(list)) return out;
    for (i = 0; i < list.length; i += 1) out.push(list[i]);
    return out;
  }
  function crNaturalCmp(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
  }
  function crClampPage(q) {
    var off = crIsObj(q) && crIsInt(q.offset) && q.offset > 0 ? q.offset : 0;
    var lim = crIsObj(q) && crIsInt(q.limit) && q.limit > 0 ? q.limit : CORE_PAGE_DEFAULT;
    if (lim > CORE_PAGE_MAX) lim = CORE_PAGE_MAX;
    return { offset: off, limit: lim };
  }
  function crDateOk(s) {
    var m;
    var t;
    var d;
    if (typeof s !== 'string') return false;
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function crDateMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function crAddDays(dateStr, n) {
    var d = new Date(crDateMs(dateStr) + n * CORE_DAY_MS);
    return crPad(d.getUTCFullYear(), 4) + '-' + crPad(d.getUTCMonth() + 1, 2) + '-' + crPad(d.getUTCDate(), 2);
  }
  function crDaysBetween(a, b) {
    return Math.round((crDateMs(b) - crDateMs(a)) / CORE_DAY_MS);
  }
  // Start of an India day as an instant.
  function crDayStartInstant(dateStr) {
    return new Date(crDateMs(dateStr) - CORE_INDIA_MS).toISOString();
  }
  function crFyStartDate(dateStr) {
    var y = +dateStr.slice(0, 4);
    var m = +dateStr.slice(5, 7);
    return crPad(m >= 4 ? y : y - 1, 4) + '-04-01';
  }
  function crMonthStart(dateStr) { return dateStr.slice(0, 7) + '-01'; }
  function crAbs(n) { return n < 0 ? 0 - n : n; }
  function crSign(n) { return n < 0 ? -1 : 1; }

  /* ---------------------------------------------------------------- session and context */

  var CORE_NO_SESSION = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });

  // A plain copy of the session fields, read once from OWN properties only (an inherited flag is never trusted).
  function crOwnTrue(o, k) { return crHas(o, k) && o[k] === true; }
  function crOwnText(o, k, max) { return crHas(o, k) && typeof o[k] === 'string' ? o[k].slice(0, max) : ''; }
  function crSession(raw) {
    var out;
    try {
      if (!crIsObj(raw)) return CORE_NO_SESSION;
      out = {
        ok: crOwnTrue(raw, 'ok'),
        isOwner: crOwnTrue(raw, 'isOwner'),
        isManager: crOwnTrue(raw, 'isManager'),
        role: crOwnText(raw, 'role', 40),
        tier: crHas(raw, 'tier') && typeof raw.tier === 'string' ? raw.tier : 'none',
        actorName: crOwnText(raw, 'actorName', 60)
      };
      return Object.freeze(out);
    } catch (e) {
      return CORE_NO_SESSION;
    }
  }
  // 'owner', 'manager', 'staff' or '' (broken). The tier must agree with the flags, as the docs layer reads it.
  function crTier(s) {
    if (!crIsObj(s) || s.ok !== true) return '';
    if (s.tier === 'owner') return s.isOwner === true ? 'owner' : '';
    if (s.tier === 'manager') return s.isManager === true && s.isOwner !== true ? 'manager' : '';
    if (s.tier === 'staff') return s.isOwner !== true && s.isManager !== true ? 'staff' : '';
    return '';
  }
  function crCostOk(s) {
    var t = crTier(s);
    return t === 'owner' || t === 'manager';
  }
  function crStep(raw) {
    var out = null;
    try {
      if (crIsObj(raw) && crOwnTrue(raw, 'ok') && crHas(raw, 'at') && crIsInt(raw.at)) out = { ok: true, at: raw.at };
    } catch (e) {
      out = null;
    }
    return out;
  }
  function crRef(raw) {
    return typeof raw === 'string' && raw.length >= 3 && raw.length <= 64 ? raw : '';
  }

  /* ---------------------------------------------------------------- create */

  function crLib(opts, name, globalName) {
    var libs = crIsObj(opts.libs) ? opts.libs : null;
    var g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (libs && libs[name]) return libs[name];
    return g && g[globalName] ? g[globalName] : null;
  }

  function create(opts) {
    var adapter;
    var nowFn;
    var cases;
    var storeLib;
    var fifo;
    var masters;
    var docsLib;
    var missing = [];
    var sres;
    var store;
    var docs;
    var made;
    var opened = false;
    var cache = { view: null, pmap: null, dix: null, oix: null };
    var core;
    var sessionFn = null;
    var stepUpFn = null;

    if (!crIsObj(opts)) return crFail('CORE_ARGS_INVALID', { detail: 'options' });
    adapter = opts.adapter;
    nowFn = opts.now;
    cases = opts.cases;
    // Optional trust providers (DEF-1). A value that is given but is not a function is refused, never ignored.
    if (crHas(opts, 'session') && opts.session !== undefined) {
      if (typeof opts.session !== 'function') return crFail('CORE_ARGS_INVALID', { detail: 'session' });
      sessionFn = opts.session;
    }
    if (crHas(opts, 'stepUpAt') && opts.stepUpAt !== undefined) {
      if (typeof opts.stepUpAt !== 'function') return crFail('CORE_ARGS_INVALID', { detail: 'stepUpAt' });
      stepUpFn = opts.stepUpAt;
    }
    if (!adapter || typeof adapter.getItem !== 'function') {
      return crFail('CORE_ARGS_INVALID', { detail: 'adapter' });
    }
    if (typeof nowFn !== 'function') return crFail('CORE_ARGS_INVALID', { detail: 'now' });
    if (!cases || typeof cases.get !== 'function') return crFail('CORE_ARGS_INVALID', { detail: 'cases' });
    storeLib = crLib(opts, 'store', 'SaagarServiceStoresStore');
    fifo = crLib(opts, 'fifo', 'SaagarServiceStoresFifo');
    masters = crLib(opts, 'masters', 'SaagarServiceMasters');
    docsLib = crLib(opts, 'docs', 'SaagarServiceStoresDocs');
    if (!storeLib) missing.push('store');
    if (!fifo) missing.push('fifo');
    if (!masters) missing.push('masters');
    if (!docsLib) missing.push('docs');
    if (missing.length) return crFail('CORE_LIBS_MISSING', { detail: missing });

    sres = storeLib.createStore(adapter, crSpread({ now: nowFn }, crIsObj(opts.storeOptions) ? opts.storeOptions : null));
    if (!sres || sres.ok !== true) return crPass(sres, 'CORE_LIBS_MISSING');
    store = sres.store;
    made = docsLib.create({ store: store, fifo: fifo, masters: masters, now: nowFn, cases: cases });
    if (crIsObj(made) && made.ok === false) return crPass(made, 'CORE_LIBS_MISSING');
    docs = crIsObj(made) && made.api ? made.api : made;
    if (!docs || typeof docs.open !== 'function') return crFail('CORE_LIBS_MISSING', { detail: ['docs api'] });

    /* ------------------------------------------------------------ clock */

    function nowDate() {
      var v = nowFn();
      var d = v && typeof v.getTime === 'function' ? new Date(v.getTime()) : new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    function nowIso() {
      var d = nowDate();
      return d ? d.toISOString() : '';
    }
    function todayDate() {
      var iso = nowIso();
      return iso ? fifo.istDate(iso) : '';
    }

    /* ------------------------------------------------------------ open, sync */

    function storageAuthoritative() {
      try {
        if (typeof adapter.authoritative !== 'function') return true;
        return adapter.authoritative() === true;
      } catch (e) {
        return false;
      }
    }
    // The caches are kept across a reopen: each one is checked against the record hashes (or a revision key) before it is used.
    function openNow() {
      var r;
      r = docs.open();
      if (!crIsObj(r) || r.ok !== true) {
        opened = false;
        return crPass(r, 'CORE_INTERNAL');
      }
      opened = true;
      return { ok: true, result: r };
    }
    // True when another screen has written to a stream since this store last looked. A head or stream that cannot be
    // read counts as stale (fail closed): the store is reopened, so a doubtful store is never answered from memory.
    function storeIsStale() {
      var i;
      var h;
      var r;
      for (i = 0; i < CORE_DATA_STREAMS.length; i += 1) {
        h = store.head(CORE_DATA_STREAMS[i]);
        if (!h || h.ok !== true) return true;
        r = store.read(CORE_DATA_STREAMS[i]);
        if (!r || r.ok !== true) return true;
        if (r.rev !== h.rev) return true;
      }
      return false;
    }
    function ready() {
      var o;
      if (!storageAuthoritative()) return crFail('SVCS_STORAGE_UNAVAILABLE');
      if (!opened) {
        o = openNow();
        return o.ok === true ? { ok: true } : o;
      }
      if (!store.status().blocked && storeIsStale()) {
        o = openNow();
        return o.ok === true ? { ok: true } : o;
      }
      return { ok: true };
    }
    function reopen() {
      var o;
      if (!storageAuthoritative()) return crFail('SVCS_STORAGE_UNAVAILABLE');
      o = openNow();
      return o.ok === true ? { ok: true } : o;
    }

    /* ------------------------------------------------------------ guards and context */

    // Who is calling. With a session provider (the page passes its own reader of SaagarModuleRuntime.session()), the
    // provider is the only source and ctx.session is ignored, so a caller cannot hand in an Owner session it does not have.
    // A provider that throws is caught by guarded() around every call: the call fails closed (CORE_INTERNAL).
    function callerSession(ctx) {
      if (sessionFn) return crSession(sessionFn());
      return crSession(crIsObj(ctx) ? ctx.session : null);
    }
    // The PIN stamp. With a step-up provider (the time of the last PIN the page itself saw succeed), the caller's stamp
    // only says "this call wants the PIN"; the time comes from the provider, so a made-up stamp proves nothing.
    function callerStep(ctx) {
      var s = crStep(crIsObj(ctx) ? ctx.stepUp : null);
      var at;
      if (!s || !stepUpFn) return s;
      at = stepUpFn();
      return crIsInt(at) && at > 0 ? { ok: true, at: at } : null;
    }
    // Every read and write starts here: a readable session, then an open store.
    function begin(ctx) {
      var session;
      var rd;
      var tier;
      session = callerSession(ctx);
      tier = crTier(session);
      if (tier === '') return crFail('SESSION_REQUIRED');
      rd = ready();
      if (rd.ok !== true) return rd;
      return { ok: true, session: session, tier: tier, costOk: tier === 'owner' || tier === 'manager' };
    }
    function needManager(g) {
      return g.tier === 'staff' ? crFail('ROLE_DENIED') : null;
    }
    // The ctx handed down is built here, from plain copies: the session, the step-up stamp, the client reference, the core's own
    // clock. The clock-override flag passes only when it is strictly true; the docs layer then needs the Owner and a fresh PIN.
    function ctxFor(g, ctx) {
      var out = {
        session: g.session,
        stepUp: callerStep(ctx),
        clientRef: crRef(crIsObj(ctx) ? ctx.clientRef : ''),
        now: nowFn
      };
      if (crIsObj(ctx) && crHas(ctx, 'clockOverride') && ctx.clockOverride === true) out.clockOverride = true;
      return out;
    }
    function stepValid(stepUp) {
      var d;
      var n = nowDate();
      if (!stepUp || !n) return false;
      d = n.getTime() - stepUp.at;
      return d >= 0 && d <= CORE_STEP_UP_MS;
    }
    // After a write: a stale or doubtful store is reopened so the next read is fresh. The write is not retried.
    function after(res) {
      var out;
      var k;
      if (crIsObj(res) && res.ok === false && typeof res.code === 'string' && crHas(CORE_REOPEN_CODES, res.code)) {
        reopen();
        out = {};
        for (k in res) if (crHas(res, k)) out[k] = res[k];
        out.reopened = true;
        return Object.freeze(out);
      }
      return crPass(res, 'CORE_INTERNAL');
    }
    function guarded(fn) {
      try {
        return fn();
      } catch (e) {
        return crFail('CORE_INTERNAL', { detail: String(e && e.message ? e.message : e).slice(0, 200) });
      }
    }

    /* ------------------------------------------------------------ the ledger view */

    function newView() {
      return {
        key: '', count: 0, lastH: '', state: fifo.emptyState(), movements: [], mvById: crMap(),
        hasMv: crMap(), opening: crMap(), receipts: crMap(), revBy: crMap(), byNo: crMap(),
        reversal: crMap(), byProposal: crMap(), recs: []
      };
    }
    function viewApply(v, rec) {
      var b = crIsObj(rec) ? rec.b : null;
      var mvs;
      var j;
      var mv;
      var ap;
      var list;
      if (!crIsObj(b)) return crFail('CORE_LEDGER_UNREADABLE', { detail: 'record' });
      mvs = Array.isArray(b.mv) ? b.mv : [];
      for (j = 0; j < mvs.length; j += 1) {
        mv = mvs[j];
        ap = fifo.applyMovement(v.state, mv);
        if (!crIsObj(ap) || ap.ok !== true) {
          return crFail(crIsObj(ap) && typeof ap.code === 'string' ? ap.code : 'LEDGER_MISMATCH', { detail: 'record ' + String(rec.n) });
        }
        v.movements.push(mv);
        v.mvById[mv.id] = mv;
        v.hasMv[mv.partCode] = true;
        if (mv.type === 'opening') v.opening[mv.partCode] = true;
        if (mv.type === 'receipt') {
          list = v.receipts[mv.partCode];
          if (!list) { list = []; v.receipts[mv.partCode] = list; }
          list.push(mv);
        }
        if (mv.type === 'reversal' && typeof mv.reverses === 'string') v.revBy[mv.reverses] = mv.id;
      }
      if (rec.k === 'REV') {
        if (typeof b.reverses === 'string') v.reversal[b.reverses] = rec;
      } else if (typeof b.no === 'string') {
        v.byNo[b.no] = rec;
      }
      if ((rec.k === 'OPN' || rec.k === 'ADJ') && typeof b.proposalId === 'string') v.byProposal[b.proposalId] = rec;
      v.recs.push(rec);
      v.count += 1;
      v.lastH = rec.h;
      return null;
    }
    // Built once, then extended with only the new records while the chain still matches.
    function ledgerView() {
      var r = store.read('ledger');
      var recs;
      var key;
      var v = cache.view;
      var i;
      var bad;
      if (!crIsObj(r) || r.ok !== true) return crPass(r, 'CORE_LEDGER_UNREADABLE');
      recs = r.records;
      key = String(r.rev) + ':' + String(r.n) + ':' + String(r.h);
      if (v && v.key === key) return { ok: true, view: v };
      if (!(v && v.count > 0 && v.count <= recs.length && recs[v.count - 1].h === v.lastH)) v = newView();
      for (i = v.count; i < recs.length; i += 1) {
        bad = viewApply(v, recs[i]);
        if (bad) {
          cache.view = null;
          return bad;
        }
      }
      v.key = key;
      cache.view = v;
      return { ok: true, view: v };
    }

    /* ------------------------------------------------------------ masters lookups */

    function partMap() {
      var lm = masters.loadMasters(store);
      var map;
      var i;
      var rows;
      if (!crIsObj(lm) || lm.ok !== true) return crPass(lm, 'READ_FAILED');
      rows = lm.parts;
      if (cache.pmap && cache.pmap.rows === rows && cache.pmap.lab === lm.labour) {
        return { ok: true, parts: rows, labour: lm.labour, map: cache.pmap.map };
      }
      map = crMap();
      for (i = 0; i < rows.length; i += 1) map[rows[i].code] = rows[i];
      cache.pmap = { rows: rows, lab: lm.labour, map: map };
      return { ok: true, parts: rows, labour: lm.labour, map: map };
    }
    function nameOf(map, code) {
      var p = map[code];
      return p ? p.name : '';
    }

    /* ------------------------------------------------------------ docs index (proposals) */

    function actorLabel(a) {
      return crIsObj(a) && typeof a.m === 'string' ? a.m : '';
    }
    function actorRole(a) {
      return crIsObj(a) && typeof a.r === 'string' ? a.r : '';
    }
    function actorTier(a) {
      return crIsObj(a) && typeof a.t === 'string' ? a.t : '';
    }
    function docsIndex() {
      var d = store.read('docs');
      var lv;
      var key;
      var i;
      var rec;
      var b;
      var p;
      var props = [];
      var byId = crMap();
      var state;
      var posted;
      if (!crIsObj(d) || d.ok !== true) return crPass(d, 'READ_FAILED');
      lv = ledgerView();
      if (!lv.ok) return lv;
      key = String(d.rev) + ':' + String(d.n) + ':' + String(d.h) + '|' + lv.view.key;
      if (cache.dix && cache.dix.key === key) return { ok: true, ix: cache.dix };
      for (i = 0; i < d.records.length; i += 1) {
        rec = d.records[i];
        b = rec.b;
        if (!crIsObj(b)) continue;
        if (rec.k === 'OPN_PROPOSE' || rec.k === 'ADJ_PROPOSE') {
          p = {
            proposalId: rec.id, kind: rec.k === 'OPN_PROPOSE' ? 'OPN' : 'ADJ', at: rec.at, date: fifo.istDate(rec.at),
            proposedBy: actorLabel(rec.a), proposedRole: actorRole(rec.a), proposedTier: actorTier(rec.a), note: typeof b.note === 'string' ? b.note : '',
            lines: Array.isArray(b.lines) ? b.lines : [], valuePaise: crIsInt(b.valuePaise) ? b.valuePaise : 0, decision: null
          };
          byId[rec.id] = p;
          props.push(p);
        } else if (rec.k === 'OPN_REJECT' || rec.k === 'ADJ_REJECT' || rec.k === 'OPN_WITHDRAW' || rec.k === 'ADJ_WITHDRAW') {
          p = typeof b.proposalId === 'string' ? byId[b.proposalId] : null;
          if (p && !p.decision) {
            p.decision = {
              state: rec.k.indexOf('REJECT') > 0 ? 'REJECTED' : 'WITHDRAWN', at: rec.at, date: fifo.istDate(rec.at),
              by: actorLabel(rec.a), role: actorRole(rec.a), reason: typeof b.reason === 'string' ? b.reason : ''
            };
          }
        }
      }
      for (i = 0; i < props.length; i += 1) {
        p = props[i];
        posted = lv.view.byProposal[p.proposalId] || null;
        if (posted) {
          state = 'POSTED';
          p.docNo = typeof posted.b.no === 'string' ? posted.b.no : '';
          p.postedAt = posted.at;
          p.decision = {
            state: 'POSTED', at: posted.at, date: fifo.istDate(posted.at),
            by: crIsObj(posted.b.approvedBy) && typeof posted.b.approvedBy.name === 'string' ? posted.b.approvedBy.name :
              (crIsObj(posted.b.approval) && typeof posted.b.approval.by === 'string' ? posted.b.approval.by : actorLabel(posted.a)),
            role: crIsObj(posted.b.approvedBy) && typeof posted.b.approvedBy.role === 'string' ? posted.b.approvedBy.role :
              (crIsObj(posted.b.approval) && typeof posted.b.approval.role === 'string' ? posted.b.approval.role : actorRole(posted.a)),
            reason: ''
          };
        } else {
          state = p.decision ? p.decision.state : 'PROPOSED';
          p.docNo = '';
          p.postedAt = '';
        }
        p.state = state;
      }
      cache.dix = { key: key, props: props, byId: byId };
      return { ok: true, ix: cache.dix };
    }

    /* ------------------------------------------------------------ old part register */

    function oldIndex() {
      var r = store.read('defective');
      var key;
      var rows = [];
      var byNo = crMap();
      var i;
      var j;
      var rec;
      var b;
      var row;
      var no;
      var st;
      if (!crIsObj(r) || r.ok !== true) return crPass(r, 'READ_FAILED');
      key = String(r.rev) + ':' + String(r.n) + ':' + String(r.h);
      if (cache.oix && cache.oix.key === key) return { ok: true, ix: cache.oix };
      for (i = 0; i < r.records.length; i += 1) {
        rec = r.records[i];
        b = rec.b;
        if (!crIsObj(b)) continue;
        if (rec.k === 'OLD_REGISTER' && typeof b.no === 'string') {
          st = typeof b.state === 'string' ? b.state : 'HELD_FOR_CLAIM';
          row = {
            oldNo: b.no, registeredAt: rec.at, date: fifo.istDate(rec.at), registeredBy: actorLabel(rec.a),
            jobId: crStr(b.jobId, 60), partCode: crStr(b.partCode, 40), partText: crStr(b.partText, 60),
            qty: crIsInt(b.qty) ? b.qty : 0, serialRef: crStr(b.serialRef, 40), claimRef: crStr(b.claimRef, 40),
            note: crStr(b.note, 200), state: st, decidedBy: '', decidedAt: '', decidedDate: '',
            scrapMonth: st === 'SCRAP_PENDING' ? fifo.istDate(rec.at).slice(0, 7) : '',
            signoffNo: '', signoffMonth: '', history: [{ at: rec.at, by: actorLabel(rec.a), from: '', to: st, note: crStr(b.note, 200) }]
          };
          byNo[b.no] = row;
          rows.push(row);
        } else if (rec.k === 'OLD_MOVE' && typeof b.oldNo === 'string' && byNo[b.oldNo]) {
          row = byNo[b.oldNo];
          st = typeof b.to === 'string' ? b.to : row.state;
          row.history.push({ at: rec.at, by: actorLabel(rec.a), from: row.state, to: st, note: crStr(b.note, 200) });
          if (st === 'SCRAP_PENDING') row.scrapMonth = fifo.istDate(rec.at).slice(0, 7);
          else row.scrapMonth = '';
          row.state = st;
          if (typeof b.claimRef === 'string' && b.claimRef !== '') row.claimRef = crStr(b.claimRef, 40);
          if (typeof b.note === 'string' && b.note !== '') row.note = crStr(b.note, 200);
          row.decidedBy = actorLabel(rec.a);
          row.decidedAt = rec.at;
          row.decidedDate = fifo.istDate(rec.at);
        } else if (rec.k === 'SCRAP_SIGNOFF' && Array.isArray(b.oldNos)) {
          for (j = 0; j < b.oldNos.length; j += 1) {
            no = b.oldNos[j];
            row = typeof no === 'string' ? byNo[no] : null;
            if (!row) continue;
            row.history.push({ at: rec.at, by: actorLabel(rec.a), from: row.state, to: 'SCRAPPED', note: crStr(b.note, 200) });
            row.state = 'SCRAPPED';
            row.signoffNo = typeof b.no === 'string' ? b.no : '';
            row.signoffMonth = typeof b.month === 'string' ? b.month : '';
            row.decidedBy = actorLabel(rec.a);
            row.decidedAt = rec.at;
            row.decidedDate = fifo.istDate(rec.at);
          }
        }
      }
      cache.oix = { key: key, rows: rows, byNo: byNo };
      return { ok: true, ix: cache.oix };
    }

    /* ------------------------------------------------------------ posting views */

    function docLineView(kind, ln, mv, map, costOk) {
      var code = crIsObj(ln) && typeof ln.partCode === 'string' ? ln.partCode : (mv && typeof mv.partCode === 'string' ? mv.partCode : '');
      var out = { partCode: code, name: nameOf(map, code) };
      var val = mv && crIsInt(mv.valuePaise) ? mv.valuePaise : 0;
      if (kind === 'OPN') {
        out.qty = ln.qty;
        out.unitCostPaise = costOk ? ln.unitCostPaise : null;
        out.valuePaise = costOk ? val : null;
      } else if (kind === 'GRN') {
        out.qtyInvoiced = crIsInt(ln.qtyInvoiced) ? ln.qtyInvoiced : null;
        out.qtyReceived = ln.qtyReceived;
        out.qtyShort = ln.qtyShort;
        out.unitCostPaise = costOk ? ln.unitCostPaise : null;
        out.valuePaise = costOk ? ln.qtyReceived * ln.unitCostPaise : null;
      } else if (kind === 'ISS') {
        out.qty = ln.qty;
        out.override = crIsObj(ln.override) ? ln.override : null;
        out.valuePaise = costOk ? 0 - val : null;
        out.movementId = mv ? mv.id : '';
      } else if (kind === 'RET') {
        out.qty = ln.qty;
        out.issueMovementId = ln.issueMovementId;
        out.issueDocNo = ln.issueDocNo;
        out.issueLineNo = ln.issueLineNo;
        out.returnReason = ln.returnReason;
        out.valuePaise = costOk ? val : null;
        out.movementId = mv ? mv.id : '';
      } else if (kind === 'CSL') {
        out.qty = ln.qty;
        out.unitPricePaise = ln.unitPricePaise;
        out.amountPaise = ln.amountPaise;
        out.valuePaise = costOk ? 0 - val : null;
        out.movementId = mv ? mv.id : '';
      } else if (kind === 'ADJ') {
        out.qtyDelta = ln.qtyDelta;
        out.reason = typeof ln.reason === 'string' ? ln.reason : '';
        out.unitCostPaise = costOk && crIsInt(ln.unitCostPaise) ? ln.unitCostPaise : null;
        out.valuePaise = costOk ? ln.valuePaise : null;
        out.movementId = mv ? mv.id : '';
      }
      return out;
    }
    function docPieces(kind, ln) {
      if (kind === 'GRN') return crIsInt(ln.qtyReceived) ? ln.qtyReceived : 0;
      if (kind === 'ADJ') return crIsInt(ln.qtyDelta) ? crAbs(ln.qtyDelta) : 0;
      return crIsInt(ln.qty) ? ln.qty : 0;
    }
    function docView(v, rec, map, costOk) {
      var b = rec.b;
      var kind = rec.k;
      var rv = typeof b.no === 'string' ? v.reversal[b.no] : null;
      var lines = [];
      var i;
      var pieces = 0;
      var shortPieces = 0;
      var total = 0;
      var lv;
      var out;
      var blines = Array.isArray(b.lines) ? b.lines : [];
      var bmv = Array.isArray(b.mv) ? b.mv : [];
      for (i = 0; i < blines.length; i += 1) {
        lv = docLineView(kind, blines[i], bmv[i] || null, map, costOk);
        lv.lineNo = i + 1;
        lines.push(lv);
        pieces += docPieces(kind, blines[i]);
        if (kind === 'GRN' && crIsInt(blines[i].qtyShort)) shortPieces += blines[i].qtyShort;
        if (costOk && crIsInt(lv.valuePaise)) total += lv.valuePaise;
      }
      out = {
        no: b.no, kind: kind, recordId: rec.id, at: rec.at, date: typeof b.docDate === 'string' ? b.docDate : fifo.istDate(rec.at),
        note: typeof b.note === 'string' ? b.note : '', by: actorLabel(rec.a), role: actorRole(rec.a),
        status: rv ? 'REVERSED' : 'POSTED', lines: lines, pieces: pieces, totalPaise: costOk ? total : null,
        reversal: rv ? {
          recordId: rv.id, at: rv.at, date: fifo.istDate(rv.at), by: actorLabel(rv.a), role: actorRole(rv.a),
          reason: typeof rv.b.reason === 'string' ? rv.b.reason : ''
        } : null
      };
      if (kind === 'GRN') {
        out.supplierName = crStr(b.supplierName, 60);
        out.supplierInvoiceNo = crStr(b.supplierInvoiceNo, 40);
        out.supplierInvoiceDate = crStr(b.supplierInvoiceDate, 10);
        out.shortPieces = shortPieces;
      } else if (kind === 'ISS') {
        out.jobId = crStr(b.jobId, 60);
        out.billing = crStr(b.billing, 20);
        out.stub = b.stub === true;
      } else if (kind === 'RET') {
        out.jobId = crStr(b.jobId, 60);
      } else if (kind === 'CSL') {
        out.payMode = crStr(b.payMode, 10);
        out.ccptInvoiceNo = crStr(b.ccptInvoiceNo, 40);
        out.amountPaise = crIsInt(b.amountPaise) ? b.amountPaise : 0;
        out.moneyPosted = b.moneyPosted === true;
      } else if (kind === 'ADJ') {
        out.proposalId = crStr(b.proposalId, 40);
        out.reasonClass = crStr(b.reasonClass, 12);
        out.totalAbsPaise = costOk && crIsInt(b.totalAbsPaise) ? b.totalAbsPaise : null;
        out.approvedBy = crIsObj(b.approval) ? { name: crStr(b.approval.by, 60), role: crStr(b.approval.role, 40) } : null;
      } else if (kind === 'OPN') {
        out.proposalId = crStr(b.proposalId, 40);
        out.approvedBy = crIsObj(b.approvedBy) ? { name: crStr(b.approvedBy.name, 60), role: crStr(b.approvedBy.role, 40) } : null;
      }
      return out;
    }
    // What a proposal line is worth now, valued as the approval would value it (shortage at the layers, excess at cost).
    function lineValueNow(view, ln) {
      var pv;
      var unit;
      if (!view || !crIsObj(ln) || !crIsInt(ln.qtyDelta) || ln.qtyDelta === 0) return 0;
      if (ln.qtyDelta < 0) {
        pv = fifo.previewIssue(view.state, ln.partCode, 0 - ln.qtyDelta);
        return crIsObj(pv) && pv.ok === true && crIsInt(pv.valuePaise) ? pv.valuePaise : 0;
      }
      unit = crIsInt(ln.unitCostPaise) ? ln.unitCostPaise : fifo.previewExcessCostPaise(view.state, ln.partCode);
      return crIsInt(unit) ? unit * ln.qtyDelta : 0;
    }
    function adjLineValue(p, ln, view) {
      if (crIsInt(ln.valuePaise)) return ln.valuePaise;
      if (p.lines.length === 1 && crIsInt(p.valuePaise)) return p.valuePaise;
      return lineValueNow(view, ln);
    }
    function proposalView(p, map, costOk, limitPaise, view) {
      var lines = [];
      var i;
      var ln;
      var wr = false;
      var pieces = 0;
      var total = 0;
      var reason;
      for (i = 0; i < p.lines.length; i += 1) {
        ln = p.lines[i];
        if (!crIsObj(ln)) continue;
        reason = typeof ln.reason === 'string' ? ln.reason.toUpperCase() : '';
        if (crHas(CORE_WRITEOFF_REASONS, reason)) wr = true;
        if (p.kind === 'OPN') {
          pieces += crIsInt(ln.qty) ? ln.qty : 0;
          if (crIsInt(ln.qty) && crIsInt(ln.unitCostPaise)) total += ln.qty * ln.unitCostPaise;
          lines.push({
            lineNo: i + 1, partCode: ln.partCode, name: nameOf(map, ln.partCode), qty: ln.qty,
            unitCostPaise: costOk ? ln.unitCostPaise : null,
            valuePaise: costOk && crIsInt(ln.qty) && crIsInt(ln.unitCostPaise) ? ln.qty * ln.unitCostPaise : null
          });
        } else {
          pieces += crIsInt(ln.qtyDelta) ? crAbs(ln.qtyDelta) : 0;
          lines.push({
            lineNo: i + 1, partCode: ln.partCode, name: nameOf(map, ln.partCode), qtyDelta: ln.qtyDelta, reason: reason,
            unitCostPaise: costOk && crIsInt(ln.unitCostPaise) ? ln.unitCostPaise : null,
            valuePaise: costOk ? adjLineValue(p, ln, view) : null
          });
        }
      }
      return {
        proposalId: p.proposalId, kind: p.kind, no: p.docNo, at: p.at, date: p.date, state: p.state,
        proposedBy: p.proposedBy, proposedRole: p.proposedRole, proposedTier: p.proposedTier, note: p.note, lines: lines, pieces: pieces,
        valuePaise: costOk ? (p.kind === 'ADJ' ? p.valuePaise : total) : null,
        reasonClass: wr ? 'WRITEOFF' : 'CORRECTION',
        needsOwner: p.kind === 'ADJ' ? (wr || !(limitPaise > 0) || p.valuePaise > limitPaise) : true,
        decidedBy: p.decision ? p.decision.by : '', decidedRole: p.decision ? p.decision.role : '',
        decidedAt: p.decision ? p.decision.at : '', decidedDate: p.decision ? p.decision.date : '',
        rejectReason: p.decision && p.state !== 'POSTED' ? p.decision.reason : ''
      };
    }
    function configLimit() {
      var c;
      try { c = docs.config(); } catch (e) { return 0; }
      return crIsObj(c) && crIsInt(c.adjustLimitPaise) ? c.adjustLimitPaise : 0;
    }

    /* ------------------------------------------------------------ status */

    function status() {
      return guarded(function () {
        var iso = nowIso();
        var out = {
          ok: true, ready: false, blocked: false, problems: [], watermark: 'OFF',
          integrity: { ok: false, code: '', lastEntryAt: '' },
          fy: iso ? String(storeLib.fyLabel(iso) || '').replace(/^FY/, '') : '', openingSetCount: 0,
          counts: { parts: 0, labour: 0, ledger: 0, docs: 0, defective: 0, audit: 0, config: 0 }
        };
        var rd = ready();
        var st;
        var i;
        var h;
        var names = ['parts', 'labour', 'ledger', 'docs', 'defective', 'audit', 'config'];
        var last = '';
        var lv;
        var ix;
        var open;
        var pend = 0;
        var p;
        if (rd.ok !== true) {
          out.integrity.code = rd.code;
          out.blocked = rd.code !== 'SVCS_STORAGE_UNAVAILABLE';
          return Object.freeze(out);
        }
        st = store.status();
        out.blocked = st.blocked === true;
        out.watermark = st.watermark;
        for (i = 0; i < st.problems.length; i += 1) {
          p = st.problems[i];
          out.problems.push({
            code: p.code, stream: typeof p.stream === 'string' ? p.stream : '',
            key: typeof p.key === 'string' ? p.key : '', n: crIsInt(p.n) ? p.n : 0
          });
        }
        out.integrity.ok = !out.blocked;
        out.integrity.code = out.blocked && out.problems.length ? out.problems[0].code : '';
        out.ready = !out.blocked;
        for (i = 0; i < names.length; i += 1) {
          h = store.head(names[i]);
          if (h && h.ok === true) {
            out.counts[names[i]] = h.n;
            if (typeof h.at === 'string' && h.at > last) last = h.at;
          }
        }
        out.integrity.lastEntryAt = last;
        if (!out.blocked) {
          lv = ledgerView();
          if (lv.ok) {
            open = 0;
            for (i in lv.view.opening) open += 1;
            out.openingSetCount = open;
          } else {
            out.ready = false;
            out.integrity.ok = false;
            out.integrity.code = lv.code;
          }
          ix = docsIndex();
          if (ix.ok) {
            for (i = 0; i < ix.ix.props.length; i += 1) if (ix.ix.props[i].state === 'PROPOSED') pend += 1;
          }
          out.counts.pendingProposals = pend;
        }
        return Object.freeze(out);
      });
    }

    function acknowledgeRestore(input, ctx) {
      return guarded(function () {
        var session = callerSession(ctx);
        var step = callerStep(ctx);
        var rd;
        var res;
        if (crTier(session) !== 'owner') return crFail(crTier(session) === '' ? 'SESSION_REQUIRED' : 'ROLE_DENIED');
        if (!stepValid(step)) return crFail('PIN_REQUIRED');
        if (!storageAuthoritative()) return crFail('SVCS_STORAGE_UNAVAILABLE');
        if (!opened) {
          rd = openNow();
          if (rd.ok !== true) return rd;
        }
        res = store.acknowledgeRestore({
          actor: { t: 'owner', r: session.role, m: session.actorName },
          stepUpOk: true,
          reason: crIsObj(input) && typeof input.reason === 'string' ? input.reason : ''
        });
        if (!crIsObj(res) || res.ok !== true) return crPass(res, 'CORE_INTERNAL');
        rd = reopen();
        return rd.ok === true ? { ok: true, status: status() } : rd;
      });
    }

    /* ------------------------------------------------------------ rights */

    function can(action, session) {
      var s = crSession(session);
      var tier = crTier(s);
      var name = typeof action === 'string' ? action : '';
      var need;
      var r;
      if (tier === '') return Object.freeze({ ok: false, needsPin: false, code: 'SESSION_REQUIRED' });
      if (name === '') return Object.freeze({ ok: false, needsPin: false, code: 'CORE_ARGS_INVALID' });
      if (crHas(CORE_ACTION_ALIAS, name)) name = CORE_ACTION_ALIAS[name];
      if (crHas(CORE_OWN_ACTIONS, name)) {
        need = CORE_OWN_ACTIONS[name];
        if (need === 'owner' && tier !== 'owner') return Object.freeze({ ok: false, needsPin: false, code: 'ROLE_DENIED' });
        if (need === 'manager' && tier === 'staff') return Object.freeze({ ok: false, needsPin: false, code: 'ROLE_DENIED' });
        return Object.freeze({ ok: true, needsPin: crHas(CORE_OWN_PIN, name) });
      }
      if (typeof docs.can !== 'function') return Object.freeze({ ok: false, needsPin: false, code: 'ROLE_DENIED' });
      // The role table of the docs layer depends on the Stores settings (store roles, limit): open once so they are loaded.
      try {
        if (!opened && storageAuthoritative()) openNow();
        r = docs.can(name, s);
      } catch (e) {
        return Object.freeze({ ok: false, needsPin: false, code: 'CORE_INTERNAL' });
      }
      if (!crIsObj(r)) return Object.freeze({ ok: false, needsPin: false, code: 'CORE_INTERNAL' });
      return Object.freeze({
        ok: r.ok === true, needsPin: r.needsPin === true, code: typeof r.code === 'string' ? r.code : undefined,
        note: typeof r.note === 'string' ? r.note : undefined
      });
    }

    function settings() {
      return guarded(function () {
        var rd = ready();
        var c;
        if (rd.ok !== true) return rd;
        c = docs.config();
        if (!crIsObj(c)) return crFail('READ_FAILED');
        return Object.freeze({
          ok: true,
          adjustLimitPaise: crIsInt(c.adjustLimitPaise) ? c.adjustLimitPaise : 0,
          managerAdjustLimitPaise: crIsInt(c.adjustLimitPaise) ? c.adjustLimitPaise : 0,
          storeRoles: Array.isArray(c.storeRoles) ? crCopyList(c.storeRoles) : [],
          warnings: Array.isArray(c.warnings) ? crCopyList(c.warnings) : []
        });
      });
    }

    /* ------------------------------------------------------------ parts and labour */

    function partRow(m, bal, view, costOk) {
      return {
        code: m.code, name: m.name, group: m.group, unit: m.unit, hsn: m.hsn, gstRateBp: m.gstRateBp,
        sellPricePaise: m.sellPricePaise, priceIncludesTax: m.priceIncludesTax, reorderLevel: m.reorderLevel,
        reorderQty: m.reorderQty, bin: m.bin, flags: m.flags, active: m.active, taxPending: masters.isTaxPending(m),
        rev: m.rev, onHand: bal.qty, openingSet: view.opening[m.code] === true, hasMovements: view.hasMv[m.code] === true,
        valuePaise: costOk ? bal.valuePaise : null, lastCostPaise: costOk ? bal.lastCostPaise : null,
        createdAt: costOk ? m.createdAt : null, createdBy: costOk ? m.createdBy : null,
        updatedAt: costOk ? m.updatedAt : null, updatedBy: costOk ? m.updatedBy : null,
        deactivatedAt: costOk ? m.deactivatedAt : null, deactivatedBy: costOk ? m.deactivatedBy : null,
        deactivateReason: costOk ? m.deactivateReason : null
      };
    }
    // The tax filter of the screens: 'true' keeps rows that need tax details, 'false' keeps complete rows.
    function taxFilterOf(query) {
      if (query.taxPending === 'true' || query.taxPending === true) return true;
      if (query.taxPending === 'false' || query.taxPending === false) return false;
      return null;
    }
    function listParts(q, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var lv;
        var f;
        var query = crIsObj(q) ? q : {};
        var filter = {};
        var rows;
        var out = [];
        var i;
        var bal;
        var m;
        var state = query.state === 'low' || query.state === 'out' ? query.state : 'all';
        var taxWant;
        var taxPendingTotal = 0;
        var pieces = 0;
        var value = 0;
        var page = crClampPage(query);
        var all = [];
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        if (typeof query.text === 'string') filter.q = query.text;
        if (typeof query.group === 'string' && query.group !== '') filter.group = query.group;
        if (query.active === 'true' || query.active === true) filter.active = true;
        else if (query.active === 'false' || query.active === false) filter.active = false;
        taxWant = taxFilterOf(query);
        rows = masters.filterRows(pm.parts, filter);
        for (i = 0; i < rows.length; i += 1) {
          m = rows[i];
          bal = fifo.partBalance(lv.view.state, m.code);
          if (state === 'out' && !(bal.qty <= 0)) continue;
          if (state === 'low' && !(m.reorderLevel > 0 && bal.qty <= m.reorderLevel)) continue;
          if (masters.isTaxPending(m)) taxPendingTotal += 1;
          if (taxWant !== null && masters.isTaxPending(m) !== taxWant) continue;
          pieces += bal.qty;
          value += bal.valuePaise;
          all.push({ m: m, bal: bal });
        }
        for (i = page.offset; i < all.length && i < page.offset + page.limit; i += 1) {
          out.push(partRow(all[i].m, all[i].bal, lv.view, g.costOk));
        }
        return Object.freeze({
          ok: true, rows: out, total: all.length, offset: page.offset, limit: page.limit, groups: masters.groupsOf(pm.parts),
          taxPendingTotal: taxPendingTotal,
          totals: { parts: all.length, pieces: pieces, valuePaise: g.costOk ? value : null }
        });
      });
    }
    function layerViews(view, code, costOk) {
      var layers = fifo.layersForPart(view.state, code, { onlyOpen: true });
      var out = [];
      var i;
      var L;
      var mv;
      if (!costOk) return null;
      for (i = 0; i < layers.length; i += 1) {
        L = layers[i];
        if (L.voided) continue;
        mv = view.mvById[L.layerId];
        out.push({
          layerId: L.layerId, grnNo: mv && mv.ref ? crStr(mv.ref.grnNo, 40) : '', date: mv ? mv.docDate : '',
          qtyReceived: L.qtyIn, qtyRemaining: L.qtyLeft, unitCostPaise: L.unitCostPaise
        });
      }
      return out;
    }
    function getPart(code, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var gr;
        var lv;
        var bal;
        var norm;
        if (!g.ok) return g;
        norm = masters.normalizeCode(code);
        gr = masters.getRow(store, 'part', norm);
        if (!gr.ok) return crPass(gr, 'PART_UNKNOWN');
        lv = ledgerView();
        if (!lv.ok) return lv;
        bal = fifo.partBalance(lv.view.state, gr.row.code);
        return Object.freeze({
          ok: true, part: partRow(gr.row, bal, lv.view, g.costOk), hasMovements: lv.view.hasMv[gr.row.code] === true,
          layers: layerViews(lv.view, gr.row.code, g.costOk)
        });
      });
    }
    function labourRow(m) {
      var out = {};
      var k;
      for (k in m) if (crHas(m, k)) out[k] = m[k];
      out.taxPending = masters.isTaxPending(m);
      return out;
    }
    function listLabour(q, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var query = crIsObj(q) ? q : {};
        var filter = {};
        var rows;
        var list = [];
        var i;
        var taxWant;
        var taxPendingTotal = 0;
        var page = crClampPage(query);
        var out = [];
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        if (typeof query.text === 'string') filter.q = query.text;
        if (typeof query.group === 'string' && query.group !== '') filter.group = query.group;
        if (query.active === 'true' || query.active === true) filter.active = true;
        else if (query.active === 'false' || query.active === false) filter.active = false;
        taxWant = taxFilterOf(query);
        rows = masters.filterRows(pm.labour, filter);
        for (i = 0; i < rows.length; i += 1) {
          if (masters.isTaxPending(rows[i])) taxPendingTotal += 1;
          if (taxWant !== null && masters.isTaxPending(rows[i]) !== taxWant) continue;
          list.push(rows[i]);
        }
        for (i = page.offset; i < list.length && i < page.offset + page.limit; i += 1) out.push(labourRow(list[i]));
        return Object.freeze({
          ok: true, rows: out, total: list.length, offset: page.offset, limit: page.limit, taxPendingTotal: taxPendingTotal,
          groups: masters.groupsOf(pm.labour)
        });
      });
    }
    function kindOf(kind) {
      if (kind === 'part' || kind === 'parts') return 'part';
      if (kind === 'labour') return 'labour';
      return '';
    }
    function saveMaster(kind, input, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var patch = {};
        var k;
        var exp;
        var res;
        if (!g.ok) return g;
        if (!crIsObj(input)) return crFail('CORE_ARGS_INVALID', { detail: 'input' });
        exp = input.expectedRev;
        for (k in input) {
          if (crHas(input, k) && k !== 'expectedRev' && k !== 'reason' && k !== 'mode') patch[k] = input[k];
        }
        if (input.mode === 'edit' || crIsInt(exp)) {
          res = masters.editRow(store, ctxFor(g, ctx), kind, input.code, patch, exp, input.reason);
        } else {
          res = masters.createRow(store, ctxFor(g, ctx), kind, patch);
        }
        return after(res);
      });
    }
    function savePart(input, ctx) { return saveMaster('part', input, ctx); }
    function saveLabour(input, ctx) { return saveMaster('labour', input, ctx); }
    function setMasterActive(kind, code, active, reason, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var lv;
        if (!g.ok) return g;
        lv = ledgerView();
        return after(masters.setActive(store, ctxFor(g, ctx), kind, code, active, reason, {
          onHand: function (c) { return lv.ok ? fifo.partBalance(lv.view.state, c).qty : 0; }
        }));
      });
    }
    function setPartActive(code, active, reason, ctx) { return setMasterActive('part', code, active, reason, ctx); }
    function setLabourActive(code, active, reason, ctx) { return setMasterActive('labour', code, active, reason, ctx); }
    // Strict answers only: anything doubtful counts as "has movements" / "is referenced".
    function hasMovements(code) {
      var lv = ledgerView();
      var c = masters.normalizeCode(code);
      var viaDocs;
      if (!lv.ok) return true;
      if (lv.view.hasMv[c] === true) return true;
      if (typeof docs.hasMovements === 'function') {
        try { viaDocs = docs.hasMovements(c); } catch (e) { return true; }
        if (viaDocs !== false) return true;
      }
      return false;
    }
    function isReferenced(kind, code) {
      var c = masters.normalizeCode(code);
      var d = store.read('docs');
      var o = store.read('defective');
      var i;
      var j;
      var rec;
      var lines;
      var viaDocs;
      if (!crIsObj(d) || d.ok !== true || !crIsObj(o) || o.ok !== true) return true;
      if (kind === 'part') {
        for (i = 0; i < d.records.length; i += 1) {
          rec = d.records[i];
          lines = crIsObj(rec.b) && Array.isArray(rec.b.lines) ? rec.b.lines : [];
          for (j = 0; j < lines.length; j += 1) {
            if (crIsObj(lines[j]) && lines[j].partCode === c) return true;
          }
        }
        for (i = 0; i < o.records.length; i += 1) {
          rec = o.records[i];
          if (crIsObj(rec.b) && rec.b.partCode === c) return true;
        }
      }
      if (typeof docs.isReferenced === 'function') {
        try { viaDocs = docs.isReferenced(kind, c); } catch (e) { return true; }
        if (viaDocs !== false) return true;
      }
      return false;
    }
    function removeMaster(kind, code, reason, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        if (!g.ok) return g;
        return after(masters.removeUnused(store, ctxFor(g, ctx), kind, code, reason, {
          hasMovements: kind === 'part' ? hasMovements : function () { return false; },
          isReferenced: isReferenced
        }));
      });
    }
    function removePart(code, reason, ctx) { return removeMaster('part', code, reason, ctx); }
    function removeLabour(code, reason, ctx) { return removeMaster('labour', code, reason, ctx); }
    function planBulk(kind, text, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var k = kindOf(kind);
        if (!g.ok) return g;
        if (k === '') return crFail('CORE_ARGS_INVALID', { detail: 'kind' });
        return crPass(masters.planBulkCreate(store, ctxFor(g, ctx), k, text), 'CORE_INTERNAL');
      });
    }
    function commitBulk(plan, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        if (!g.ok) return g;
        return after(masters.commitBulkCreate(store, ctxFor(g, ctx), plan));
      });
    }
    function history(kind, code, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var k = kindOf(kind);
        var denied;
        if (!g.ok) return g;
        denied = needManager(g);
        if (denied) return denied;
        if (k === '') return crFail('CORE_ARGS_INVALID', { detail: 'kind' });
        return crPass(masters.historyFor(store, k, code), 'READ_FAILED');
      });
    }

    /* ------------------------------------------------------------ ledger per part */

    function movementDocNo(view, mv) {
      var orig;
      var r;
      if (mv.type === 'reversal') {
        orig = typeof mv.reverses === 'string' ? view.mvById[mv.reverses] : null;
        r = orig && crIsObj(orig.ref) ? orig.ref : null;
      } else {
        r = crIsObj(mv.ref) ? mv.ref : null;
      }
      if (!r) return '';
      return crStr(r.grnNo, 40) || crStr(r.saleRef, 40) || crStr(r.adjustId, 40);
    }
    function movementJob(view, mv) {
      var orig;
      var r;
      if (mv.type === 'reversal') {
        orig = typeof mv.reverses === 'string' ? view.mvById[mv.reverses] : null;
        r = orig && crIsObj(orig.ref) ? orig.ref : null;
      } else {
        r = crIsObj(mv.ref) ? mv.ref : null;
      }
      return r ? crStr(r.jobId, 60) : '';
    }
    var CORE_DOC_TYPE = {
      opening: 'OPENING', receipt: 'GRN', issue_job: 'ISSUE', return_job: 'RETURN', counter_sale: 'COUNTER',
      adjust_up: 'ADJUST', adjust_down: 'ADJUST', reversal: 'REVERSAL'
    };
    function ledgerRow(view, lr, costOk) {
      var mv = view.mvById[lr.id];
      var inQ = lr.qty > 0 ? lr.qty : 0;
      var outQ = lr.qty < 0 ? 0 - lr.qty : 0;
      var inV = lr.valuePaise > 0 ? lr.valuePaise : 0;
      var outV = lr.valuePaise < 0 ? 0 - lr.valuePaise : 0;
      var docNo = mv ? movementDocNo(view, mv) : '';
      return {
        seq: lr.seq, id: lr.id, at: lr.at, date: mv && typeof mv.docDate === 'string' ? mv.docDate : fifo.istDate(lr.at),
        type: lr.type, docType: crHas(CORE_DOC_TYPE, lr.type) ? CORE_DOC_TYPE[lr.type] : lr.type,
        docNo: docNo, jobId: mv ? movementJob(view, mv) : '', note: crStr(lr.note, 200), reason: crStr(lr.reason, 40),
        qtyIn: inQ, qtyOut: outQ, balanceQty: lr.balanceQty,
        unitCostPaise: costOk && mv && crIsInt(mv.unitCostPaise) ? mv.unitCostPaise : null,
        valuePaise: costOk ? lr.valuePaise : null, valueInPaise: costOk ? inV : null, valueOutPaise: costOk ? outV : null,
        balanceValuePaise: costOk ? lr.balanceValuePaise : null,
        reversed: lr.reversedBy !== null && lr.reversedBy !== undefined, isReversal: lr.type === 'reversal',
        reversalOf: lr.type === 'reversal' ? docNo : '',
        by: crIsObj(lr.actor) ? crStr(lr.actor.name, 60) : '', role: crIsObj(lr.actor) ? crStr(lr.actor.role, 40) : ''
      };
    }
    function ledgerCore(code, from, to, g) {
      var pm = partMap();
      var lv;
      var c = masters.normalizeCode(code);
      var info;
      var res;
      var fromAt;
      var toAt;
      var rows = [];
      var i;
      var closing;
      var m;
      if (!pm.ok) return pm;
      lv = ledgerView();
      if (!lv.ok) return lv;
      m = pm.map[c] || null;
      if (c === '' || (!m && lv.view.hasMv[c] !== true)) return crFail('PART_UNKNOWN');
      fromAt = crDayStartInstant(from);
      toAt = fifo.istDayEndInstant(to);
      res = fifo.ledgerForPart(lv.view.movements, c, { fromAt: fromAt, toAt: toAt });
      if (!crIsObj(res) || res.ok !== true) return crPass(res, 'READ_FAILED');
      for (i = 0; i < res.rows.length; i += 1) rows.push(ledgerRow(lv.view, res.rows[i], g.costOk));
      closing = res.rows.length ? {
        qty: res.rows[res.rows.length - 1].balanceQty, valuePaise: res.rows[res.rows.length - 1].balanceValuePaise
      } : { qty: res.opening.qty, valuePaise: res.opening.valuePaise };
      info = { code: c, name: m ? m.name : '', group: m ? m.group : '', unit: m ? m.unit : 'pc', bin: m ? m.bin : '' };
      return {
        ok: true, part: info, view: lv.view,
        opening: { qty: res.opening.qty, valuePaise: g.costOk ? res.opening.valuePaise : null },
        closing: { qty: closing.qty, valuePaise: g.costOk ? closing.valuePaise : null }, rows: rows
      };
    }
    function ledger(code, q, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var query = crIsObj(q) ? q : {};
        var today;
        var from;
        var to;
        var r;
        var page = crClampPage(query);
        var bal;
        if (!g.ok) return g;
        if (g.tier === 'staff') return crFail('ROLE_DENIED');
        today = todayDate();
        to = typeof query.to === 'string' && query.to !== '' ? query.to : today;
        from = typeof query.from === 'string' && query.from !== '' ? query.from : '2000-01-01';
        if (!crDateOk(from) || !crDateOk(to) || from > to) return crFail('ARG_INVALID', { detail: 'dates' });
        r = ledgerCore(code, from, to, g);
        if (!r.ok) return r;
        bal = fifo.partBalance(r.view.state, r.part.code);
        return Object.freeze({
          ok: true, part: r.part, from: from, to: to, onHand: bal.qty, valuePaise: bal.valuePaise,
          opening: r.opening, closing: r.closing, rows: r.rows.slice(page.offset, page.offset + page.limit),
          total: r.rows.length, offset: page.offset, limit: page.limit,
          layers: layerViews(r.view, r.part.code, true)
        });
      });
    }

    /* ------------------------------------------------------------ opening, receipts, counter sales, adjustments */

    function listOpening(ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var ix;
        var pm;
        var lv;
        var rows = [];
        var i;
        var n = 0;
        var limit;
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        ix = docsIndex();
        if (!ix.ok) return ix;
        limit = configLimit();
        for (i = ix.ix.props.length - 1; i >= 0; i -= 1) {
          if (ix.ix.props[i].kind === 'OPN') rows.push(proposalView(ix.ix.props[i], pm.map, g.costOk, limit, lv.view));
        }
        for (i in lv.view.opening) n += 1;
        return Object.freeze({ ok: true, rows: rows, total: rows.length, openingSetCount: n });
      });
    }
    function listDocsOfKind(kind, q, ctx, extraFilter) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var lv;
        var query = crIsObj(q) ? q : {};
        var out = [];
        var i;
        var rec;
        var dv;
        var text = typeof query.text === 'string' ? query.text.toLowerCase() : '';
        var page = crClampPage(query);
        var all = [];
        var hay;
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        for (i = lv.view.recs.length - 1; i >= 0; i -= 1) {
          rec = lv.view.recs[i];
          if (rec.k !== kind) continue;
          dv = docView(lv.view, rec, pm.map, g.costOk);
          if (query.status === 'POSTED' || query.status === 'REVERSED') {
            if (dv.status !== query.status) continue;
          }
          if (typeof query.from === 'string' && query.from !== '' && dv.date < query.from) continue;
          if (typeof query.to === 'string' && query.to !== '' && dv.date > query.to) continue;
          if (extraFilter && !extraFilter(dv, query)) continue;
          if (text !== '') {
            hay = (dv.no + ' ' + (dv.supplierInvoiceNo || '') + ' ' + (dv.supplierName || '') + ' ' + (dv.ccptInvoiceNo || '')).toLowerCase();
            if (hay.indexOf(text) < 0) continue;
          }
          all.push(dv);
        }
        for (i = page.offset; i < all.length && i < page.offset + page.limit; i += 1) out.push(all[i]);
        return Object.freeze({ ok: true, rows: out, total: all.length, offset: page.offset, limit: page.limit });
      });
    }
    function listReceipts(q, ctx) { return listDocsOfKind('GRN', q, ctx, null); }
    function listCounterSales(q, ctx) {
      return guarded(function () {
        var query = crIsObj(q) ? q : {};
        var day = typeof query.date === 'string' && query.date !== '' ? query.date : todayDate();
        var copy = {};
        var k;
        for (k in query) if (crHas(query, k)) copy[k] = query[k];
        if (query.all !== true) {
          if (!crDateOk(day)) return crFail('ARG_INVALID', { detail: 'date' });
          copy.from = day;
          copy.to = day;
        }
        return listDocsOfKind('CSL', copy, ctx, null);
      });
    }
    function getDoc(no, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var lv;
        var ix;
        var key = typeof no === 'string' ? no.trim().toUpperCase() : '';
        var rec;
        var limit;
        if (!g.ok) return g;
        if (key === '') return crFail('CORE_ARGS_INVALID', { detail: 'number' });
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        if (key.indexOf('DOC-') === 0) {
          ix = docsIndex();
          if (!ix.ok) return ix;
          if (!ix.ix.byId[key]) return crFail('DOC_NOT_FOUND');
          limit = configLimit();
          return Object.freeze({ ok: true, proposal: proposalView(ix.ix.byId[key], pm.map, g.costOk, limit, lv.view) });
        }
        rec = lv.view.byNo[key];
        if (!rec || !crHas(CORE_DOC_KINDS, rec.k)) return crFail('DOC_NOT_FOUND');
        return Object.freeze({ ok: true, doc: docView(lv.view, rec, pm.map, g.costOk) });
      });
    }
    function listAdjustments(q, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var ix;
        var lv;
        var query = crIsObj(q) ? q : {};
        var st = typeof query.state === 'string' ? query.state : 'all';
        var rows = [];
        var i;
        var limit;
        var page = crClampPage(query);
        var out = [];
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        ix = docsIndex();
        if (!ix.ok) return ix;
        limit = configLimit();
        for (i = ix.ix.props.length - 1; i >= 0; i -= 1) {
          if (ix.ix.props[i].kind !== 'ADJ') continue;
          if (st !== 'all' && ix.ix.props[i].state !== st) continue;
          rows.push(proposalView(ix.ix.props[i], pm.map, g.costOk, limit, lv.view));
        }
        for (i = page.offset; i < rows.length && i < page.offset + page.limit; i += 1) out.push(rows[i]);
        return Object.freeze({ ok: true, rows: out, total: rows.length, offset: page.offset, limit: page.limit });
      });
    }

    /* ------------------------------------------------------------ jobs */

    function jobParts(jobId, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var lv;
        var use;
        var rows = [];
        var byPart = crMap();
        var i;
        var mv;
        var j;
        var row;
        var iss;
        var ret = crMap();
        var u;
        var issued;
        if (!g.ok) return g;
        if (typeof jobId !== 'string' || jobId === '') return crFail('CORE_ARGS_INVALID', { detail: 'jobId' });
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        use = fifo.jobUsage(lv.view.movements, jobId);
        if (!crIsObj(use) || use.ok !== true) return crPass(use, 'READ_FAILED');
        for (i = 0; i < lv.view.movements.length; i += 1) {
          mv = lv.view.movements[i];
          if (mv.type !== 'return_job' || !crIsObj(mv.ref) || mv.ref.jobId !== jobId || crHas(lv.view.revBy, mv.id)) continue;
          if (typeof mv.returnsOf === 'string') ret[mv.returnsOf] = (ret[mv.returnsOf] || 0) + mv.qty;
        }
        for (i = 0; i < lv.view.movements.length; i += 1) {
          mv = lv.view.movements[i];
          if (mv.type !== 'issue_job' || !crIsObj(mv.ref) || mv.ref.jobId !== jobId || crHas(lv.view.revBy, mv.id)) continue;
          row = byPart[mv.partCode];
          if (!row) {
            row = { lastAt: '', issues: [] };
            byPart[mv.partCode] = row;
          }
          issued = 0 - mv.qty;
          row.lastAt = mv.at > row.lastAt ? mv.at : row.lastAt;
          row.issues.push({
            movementId: mv.id, docNo: crStr(mv.ref.grnNo, 40), lineNo: crIsInt(mv.ref.lineNo) ? mv.ref.lineNo : 0,
            qty: issued, outstanding: issued - (ret[mv.id] || 0), at: mv.at
          });
        }
        for (j = 0; j < use.byPart.length; j += 1) {
          u = use.byPart[j];
          row = byPart[u.partCode] || { lastAt: '', issues: [] };
          rows.push({
            partCode: u.partCode, name: nameOf(pm.map, u.partCode), issued: u.issuedQty, returned: u.returnedQty,
            net: u.netQty, valuePaise: g.costOk ? u.netValuePaise : null, lastAt: row.lastAt, issues: row.issues
          });
        }
        return Object.freeze({
          ok: true, rows: rows, totalNet: use.netQty, totalValuePaise: g.costOk ? use.netValuePaise : null
        });
      });
    }
    // The delete guard asks this without a session, so it fails closed: any doubt is ok:false and the caller blocks.
    function jobHasParts(jobId) {
      return guarded(function () {
        var rd;
        var lv;
        var use;
        if (typeof jobId !== 'string' || jobId === '') return crFail('CORE_ARGS_INVALID', { detail: 'jobId' });
        rd = ready();
        if (rd.ok !== true) return rd;
        lv = ledgerView();
        if (!lv.ok) return lv;
        use = fifo.jobUsage(lv.view.movements, jobId);
        if (!crIsObj(use) || use.ok !== true || !crIsInt(use.netQty)) return crFail('READ_FAILED');
        return Object.freeze({ ok: true, has: use.netQty > 0 });
      });
    }

    /* ------------------------------------------------------------ old parts */

    function oldRowView(row, map) {
      var info = row.partCode !== '' ? map[row.partCode] : null;
      return {
        oldNo: row.oldNo, date: row.date, registeredAt: row.registeredAt, registeredBy: row.registeredBy, jobId: row.jobId,
        partCode: row.partCode, partText: row.partText, desc: info ? info.name : row.partText, qty: row.qty,
        serialRef: row.serialRef, claimRef: row.claimRef, note: row.note, state: row.state,
        stateLabel: CORE_OLD_LABELS[row.state] || row.state, bin: CORE_OLD_BINS[row.state] || '',
        scrapMonth: row.scrapMonth, signoffNo: row.signoffNo, signoffMonth: row.signoffMonth,
        decidedBy: row.decidedBy, decidedAt: row.decidedAt, decidedDate: row.decidedDate, history: oldHistoryCopy(row.history)
      };
    }
    // Fresh entries, so a caller that changes a returned row never changes the cached register.
    function oldHistoryCopy(list) {
      var out = [];
      var i;
      var h;
      for (i = 0; i < list.length; i += 1) {
        h = list[i];
        out.push({ at: h.at, by: h.by, from: h.from, to: h.to, note: h.note });
      }
      return out;
    }
    function listOldParts(q, ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var ox;
        var query = crIsObj(q) ? q : {};
        var all = [];
        var i;
        var row;
        var text = typeof query.text === 'string' ? query.text.toLowerCase() : '';
        var page = crClampPage(query);
        var out = [];
        var hay;
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        ox = oldIndex();
        if (!ox.ok) return ox;
        for (i = ox.ix.rows.length - 1; i >= 0; i -= 1) {
          row = ox.ix.rows[i];
          if (typeof query.state === 'string' && query.state !== '' && query.state !== 'all' && row.state !== query.state) continue;
          if (typeof query.jobId === 'string' && query.jobId !== '' && row.jobId !== query.jobId) continue;
          if (typeof query.month === 'string' && query.month !== '' && row.date.slice(0, 7) !== query.month) continue;
          if (typeof query.scrapMonth === 'string' && query.scrapMonth !== '' && row.scrapMonth !== query.scrapMonth) continue;
          if (typeof query.scrapUpTo === 'string' && query.scrapUpTo !== '' && !(row.scrapMonth !== '' && row.scrapMonth <= query.scrapUpTo)) continue;
          if (text !== '') {
            hay = (row.oldNo + ' ' + row.jobId + ' ' + row.partCode + ' ' + row.partText + ' ' + row.claimRef + ' ' + row.serialRef).toLowerCase();
            if (hay.indexOf(text) < 0) continue;
          }
          all.push(row);
        }
        for (i = page.offset; i < all.length && i < page.offset + page.limit; i += 1) out.push(oldRowView(all[i], pm.map));
        return Object.freeze({ ok: true, rows: out, total: all.length, offset: page.offset, limit: page.limit });
      });
    }
    function oldPartNextStates(state) {
      return typeof state === 'string' && crHas(CORE_OLD_NEXT, state) ? CORE_OLD_NEXT[state].slice(0) : [];
    }

    /* ------------------------------------------------------------ reorder */

    function lastReceiptOf(view, code, endAt) {
      var list = view.receipts[code];
      var i;
      var mv;
      if (!list) return null;
      for (i = list.length - 1; i >= 0; i -= 1) {
        mv = list[i];
        if (endAt && mv.at > endAt) continue;
        if (crHas(view.revBy, mv.id) && (!endAt || view.mvById[view.revBy[mv.id]].at <= endAt)) continue;
        return mv;
      }
      return null;
    }
    function reorderRows(view, pm, costOk, groupFilter) {
      var levels = {};
      var codes = [];
      var i;
      var m;
      var rows;
      var out = [];
      var r;
      var bal;
      var lr;
      var suggest;
      var cost;
      for (i = 0; i < pm.parts.length; i += 1) {
        m = pm.parts[i];
        if (m.active === false || !(m.reorderLevel > 0)) continue;
        if (groupFilter !== '' && String(m.group).toLowerCase() !== groupFilter) continue;
        levels[m.code] = { level: m.reorderLevel, reorderQty: m.reorderQty };
        codes.push(m.code);
      }
      rows = fifo.reorderList(view.state, levels);
      for (i = 0; i < rows.length; i += 1) {
        r = rows[i];
        m = pm.map[r.partCode];
        bal = fifo.partBalance(view.state, r.partCode);
        lr = lastReceiptOf(view, r.partCode, '');
        suggest = r.shortBy > 0 ? (r.shortBy > r.reorderQty ? r.shortBy : r.reorderQty) : 0;
        cost = lr ? lr.unitCostPaise : (bal.lastCostPaise === null ? null : bal.lastCostPaise);
        out.push({
          partCode: r.partCode, code: r.partCode, name: m.name, desc: m.name, group: m.group, unit: m.unit, bin: m.bin,
          active: m.active, onHand: r.qty, reorderLevel: r.level, reorderQty: r.reorderQty, shortBy: r.shortBy,
          suggestQty: suggest,
          valuePaise: costOk ? bal.valuePaise : null,
          lastReceiptCostPaise: costOk ? cost : null,
          lastReceiptDate: lr ? (typeof lr.docDate === 'string' ? lr.docDate : fifo.istDate(lr.at)) : '',
          estCostPaise: costOk && cost !== null ? suggest * cost : null
        });
      }
      return out;
    }
    function reorderList(ctx) {
      return guarded(function () {
        var g = begin(ctx);
        var pm;
        var lv;
        var rows;
        var total = 0;
        var i;
        var est = 0;
        if (!g.ok) return g;
        pm = partMap();
        if (!pm.ok) return pm;
        lv = ledgerView();
        if (!lv.ok) return lv;
        rows = reorderRows(lv.view, pm, g.costOk, '');
        for (i = 0; i < rows.length; i += 1) {
          total += rows[i].shortBy;
          if (g.costOk && rows[i].estCostPaise !== null) est += rows[i].estCostPaise;
        }
        return Object.freeze({ ok: true, rows: rows, total: rows.length, unitsShort: total, estCostPaise: g.costOk ? est : null });
      });
    }

    /* ------------------------------------------------------------ report data */

    function readerFail(code, detail) {
      return crFail(code, detail === undefined ? undefined : { detail: detail });
    }
    // Map a lower failure to the reader codes the report understands.
    function readerCodeOf(res) {
      var c = crIsObj(res) && typeof res.code === 'string' ? res.code : '';
      if (c === 'SESSION_REQUIRED' || c === 'ROLE_DENIED') return c;
      if (c === 'SVCS_STORAGE_UNAVAILABLE') return 'READ_FAILED';
      if (c === 'SVCS_BLOCKED' || c.indexOf('SVCS_') === 0 || c === 'LEDGER_MISMATCH' || c === 'LEDGER_GAP' ||
        c === 'LEDGER_ORDER' || c === 'LEDGER_BAD_RECORD' || c === 'CORE_LEDGER_UNREADABLE') return 'CHAIN_BROKEN';
      return 'READ_FAILED';
    }
    function reportGate(ctx) {
      var g = begin(ctx);
      if (g.ok !== true) {
        return readerFail(readerCodeOf(g), crIsObj(g) ? g.code : undefined);
      }
      return g;
    }
    function stockRowsFor(view, pm, asOf, includeZero, groupFilter, costOk) {
      var today = todayDate();
      var state = view.state;
      var endAt = '';
      var rs;
      var rows = [];
      var codes = crMap();
      var list = [];
      var i;
      var m;
      var code;
      var bal;
      var lr;
      var lastDate = '';
      var mv;
      if (asOf !== '' && asOf < today) {
        endAt = fifo.istDayEndInstant(asOf);
        rs = fifo.stateAsOf(view.movements, asOf);
        if (!crIsObj(rs) || rs.ok !== true) return crPass(rs, 'ASOF_UNSUPPORTED');
        state = rs.state;
      }
      for (i = 0; i < pm.parts.length; i += 1) {
        codes[pm.parts[i].code] = true;
        list.push(pm.parts[i].code);
      }
      for (code in view.hasMv) {
        if (!codes[code]) { codes[code] = true; list.push(code); }
      }
      list.sort(crNaturalCmp);
      for (i = 0; i < list.length; i += 1) {
        code = list[i];
        m = pm.map[code] || null;
        if (groupFilter !== '' && !(m && String(m.group).toLowerCase() === groupFilter)) continue;
        bal = fifo.partBalance(state, code);
        if (!includeZero && bal.qty === 0 && !(m && m.reorderLevel > 0)) continue;
        lr = lastReceiptOf(view, code, endAt);
        rows.push({
          partCode: code, desc: m ? m.name : '', group: m ? m.group : '', unit: m ? m.unit : 'pc', bin: m ? m.bin : '',
          active: m ? m.active !== false : false, onHand: bal.qty, reorderLevel: m ? m.reorderLevel : 0,
          reorderQty: m ? m.reorderQty : 0, valuePaise: costOk ? (bal.qty > 0 ? bal.valuePaise : 0) : null,
          lastReceiptCostPaise: costOk && lr ? lr.unitCostPaise : null,
          lastReceiptDate: lr ? (typeof lr.docDate === 'string' ? lr.docDate : fifo.istDate(lr.at)) : ''
        });
      }
      for (i = view.movements.length - 1; i >= 0; i -= 1) {
        mv = view.movements[i];
        if (endAt && mv.at > endAt) continue;
        lastDate = typeof mv.docDate === 'string' ? mv.docDate : fifo.istDate(mv.at);
        break;
      }
      return { ok: true, rows: rows, lastMovementDate: lastDate };
    }
    function rdStockList(args, g) {
      var a = crIsObj(args) ? args : {};
      var pm;
      var lv;
      var asOf = typeof a.asOf === 'string' && a.asOf !== '' ? a.asOf : '';
      var group = typeof a.group === 'string' ? a.group.toLowerCase() : '';
      var today = todayDate();
      var sr;
      if (asOf !== '' && (!crDateOk(asOf) || asOf > today)) return readerFail('ARG_INVALID', 'asOf');
      pm = partMap();
      if (!pm.ok) return readerFail(readerCodeOf(pm), pm.code);
      lv = ledgerView();
      if (!lv.ok) return readerFail(readerCodeOf(lv), lv.code);
      if (lv.view.movements.length === 0) return readerFail('NOT_READY');
      sr = stockRowsFor(lv.view, pm, asOf, a.includeZero === true, group, g.costOk);
      if (!sr.ok) return readerFail('ASOF_UNSUPPORTED', sr.code);
      if (sr.rows.length > CORE_REPORT_ROW_CAP) sr.rows.length = CORE_REPORT_ROW_CAP;
      return {
        ok: true, asOf: asOf === '' ? today : asOf, method: 'FIFO', costBasis: g.costOk ? 'EXCL_GST' : '',
        lastMovementDate: sr.lastMovementDate, rows: sr.rows
      };
    }
    function rdReorder(args, g) {
      var a = crIsObj(args) ? args : {};
      var group = typeof a.group === 'string' ? a.group.toLowerCase() : '';
      var pm = partMap();
      var lv;
      if (!pm.ok) return readerFail(readerCodeOf(pm), pm.code);
      lv = ledgerView();
      if (!lv.ok) return readerFail(readerCodeOf(lv), lv.code);
      if (lv.view.movements.length === 0) return readerFail('NOT_READY');
      return {
        ok: true, asOf: todayDate(), method: 'FIFO', costBasis: g.costOk ? 'EXCL_GST' : '',
        lastMovementDate: '', rows: reorderRows(lv.view, pm, g.costOk, group)
      };
    }
    function layersForReport(view, code, closingDate, today) {
      var layers = fifo.layersForPart(view.state, code, { onlyOpen: true });
      var out = [];
      var i;
      var L;
      var mv;
      if (closingDate !== today) return null;
      for (i = 0; i < layers.length; i += 1) {
        L = layers[i];
        if (L.voided) continue;
        mv = view.mvById[L.layerId];
        out.push({
          layerId: L.layerId, grnNo: mv && crIsObj(mv.ref) ? crStr(mv.ref.grnNo, 40) : '',
          date: mv ? (typeof mv.docDate === 'string' ? mv.docDate : fifo.istDate(mv.at)) : '',
          qtyReceived: L.qtyIn, qtyRemaining: L.qtyLeft, unitCostPaise: L.unitCostPaise
        });
      }
      return out;
    }
    function rdPartLedger(args, g) {
      var a = crIsObj(args) ? args : {};
      var today = todayDate();
      var code = typeof a.partCode === 'string' ? masters.normalizeCode(a.partCode) : '';
      var from = typeof a.from === 'string' && a.from !== '' ? a.from : crFyStartDate(today);
      var to = typeof a.to === 'string' && a.to !== '' ? a.to : today;
      var r;
      var rows = [];
      var i;
      var lr;
      var mv;
      if (g.tier === 'staff') return readerFail('ROLE_DENIED');
      if (code === '') return readerFail('ARG_INVALID', 'partCode');
      if (!crDateOk(from) || !crDateOk(to) || from > to || to > today || crDaysBetween(from, to) > CORE_LEDGER_SPAN_DAYS) {
        return readerFail('ARG_INVALID', 'dates');
      }
      r = ledgerCore(code, from, to, g);
      if (!r.ok) return readerFail(r.code === 'PART_UNKNOWN' ? 'PART_UNKNOWN' : readerCodeOf(r), r.code);
      if (r.view.movements.length === 0) return readerFail('NOT_READY');
      for (i = 0; i < r.rows.length; i += 1) {
        lr = r.rows[i];
        rows.push({
          seq: lr.seq, date: lr.date, docType: lr.docType, docNo: lr.docNo, jobId: lr.jobId, note: lr.note,
          inQty: lr.qtyIn, outQty: lr.qtyOut, valueInPaise: lr.valueInPaise, valueOutPaise: lr.valueOutPaise,
          balQty: lr.balanceQty, balValuePaise: lr.balanceValuePaise, reversed: lr.reversed, isReversal: lr.isReversal,
          reversalOf: lr.reversalOf, actor: lr.by
        });
      }
      return {
        ok: true,
        part: { partCode: r.part.code, desc: r.part.name, group: r.part.group, unit: r.part.unit, bin: r.part.bin },
        from: from, to: to, costBasis: 'EXCL_GST', opening: r.opening, rows: rows, closing: r.closing,
        layers: layersForReport(r.view, r.part.code, to, today)
      };
    }
    function rdReceipt(args, g) {
      var a = crIsObj(args) ? args : {};
      var no = typeof a.grnNo === 'string' ? a.grnNo.trim().toUpperCase() : '';
      var pm;
      var lv;
      var rec;
      var dv;
      var lines = [];
      var i;
      if (no === '') return readerFail('ARG_INVALID', 'grnNo');
      pm = partMap();
      if (!pm.ok) return readerFail(readerCodeOf(pm), pm.code);
      lv = ledgerView();
      if (!lv.ok) return readerFail(readerCodeOf(lv), lv.code);
      rec = lv.view.byNo[no];
      if (!rec || rec.k !== 'GRN') return readerFail('GRN_UNKNOWN');
      dv = docView(lv.view, rec, pm.map, g.costOk);
      for (i = 0; i < dv.lines.length; i += 1) {
        lines.push({
          partCode: dv.lines[i].partCode, desc: dv.lines[i].name, qtyReceived: dv.lines[i].qtyReceived,
          qtyShort: dv.lines[i].qtyShort, unitCostPaise: dv.lines[i].unitCostPaise, lineValuePaise: dv.lines[i].valuePaise
        });
      }
      return {
        ok: true,
        header: {
          grnNo: dv.no, date: dv.date, supplier: dv.supplierName, invoiceNo: dv.supplierInvoiceNo,
          invoiceDate: dv.supplierInvoiceDate, receivedBy: dv.by, status: dv.status,
          reversedDate: dv.reversal ? dv.reversal.date : '', reversedBy: dv.reversal ? dv.reversal.by : '',
          reversalReason: dv.reversal ? dv.reversal.reason : '', costBasis: g.costOk ? 'EXCL_GST' : ''
        },
        lines: lines
      };
    }
    function periodArgs(a) {
      var today = todayDate();
      var from = typeof a.from === 'string' && a.from !== '' ? a.from : crMonthStart(today);
      var to = typeof a.to === 'string' && a.to !== '' ? a.to : today;
      if (!crDateOk(from) || !crDateOk(to) || from > to) return null;
      return { from: from, to: to };
    }
    function adjRowsOf(p, map, view) {
      var out = [];
      var i;
      var ln;
      var reason;
      var dec = p.decision;
      var rows = p.lines;
      for (i = 0; i < rows.length; i += 1) {
        ln = rows[i];
        if (!crIsObj(ln)) continue;
        reason = typeof ln.reason === 'string' ? ln.reason.toUpperCase() : '';
        out.push({
          adjNo: p.docNo !== '' ? p.docNo : p.proposalId, date: p.date, partCode: ln.partCode, desc: nameOf(map, ln.partCode),
          qtyDelta: ln.qtyDelta, reasonCode: reason, reasonLabel: crHas(CORE_ADJ_LABELS, reason) ? CORE_ADJ_LABELS[reason] : reason,
          note: crStr(p.note, 200),
          valueEffectPaise: ln.qtyDelta < 0 ? 0 - adjLineValue(p, ln, view) : adjLineValue(p, ln, view),
          proposedBy: p.proposedBy, status: p.state, decidedBy: dec ? dec.by : '', decidedDate: dec ? dec.date : '',
          approverRole: dec ? dec.role : ''
        });
      }
      return out;
    }
    function rdAdjustments(args, g) {
      var a = crIsObj(args) ? args : {};
      var per = periodArgs(a);
      var pm;
      var ix;
      var lv;
      var awaiting = [];
      var decided = [];
      var i;
      var j;
      var p;
      var rows;
      var rec;
      var mvs;
      if (g.tier === 'staff') return readerFail('ROLE_DENIED');
      if (!per) return readerFail('ARG_INVALID', 'dates');
      pm = partMap();
      if (!pm.ok) return readerFail(readerCodeOf(pm), pm.code);
      ix = docsIndex();
      if (!ix.ok) return readerFail(readerCodeOf(ix), ix.code);
      lv = ledgerView();
      if (!lv.ok) return readerFail(readerCodeOf(lv), lv.code);
      for (i = 0; i < ix.ix.props.length; i += 1) {
        p = ix.ix.props[i];
        if (p.kind !== 'ADJ') continue;
        rows = adjRowsOf(p, pm.map, lv.view);
        if (p.state === 'PROPOSED') {
          for (j = 0; j < rows.length; j += 1) awaiting.push(rows[j]);
        } else if (p.state === 'POSTED' || p.state === 'REJECTED') {
          if (!p.decision || p.decision.date < per.from || p.decision.date > per.to) continue;
          if (p.state === 'POSTED') {
            rec = lv.view.byProposal[p.proposalId];
            mvs = rec && Array.isArray(rec.b.mv) ? rec.b.mv : [];
            for (j = 0; j < rows.length; j += 1) {
              if (mvs[j] && crIsInt(mvs[j].valuePaise)) rows[j].valueEffectPaise = mvs[j].valuePaise;
            }
          }
          for (j = 0; j < rows.length; j += 1) decided.push(rows[j]);
        }
      }
      return { ok: true, from: per.from, to: per.to, awaiting: awaiting, decided: decided };
    }
    function defRowOf(row, map) {
      var info = row.partCode !== '' ? map[row.partCode] : null;
      return {
        regNo: row.oldNo, date: row.date, jobId: row.jobId, partCode: row.partCode, desc: info ? info.name : row.partText,
        qty: row.qty, state: row.state, claimRef: row.claimRef, decidedBy: row.decidedBy, decidedDate: row.decidedDate,
        signoffMonth: row.signoffMonth
      };
    }
    function rdDefective(args) {
      var a = crIsObj(args) ? args : {};
      var per = periodArgs(a);
      var pm;
      var ox;
      var open = [];
      var listed = [];
      var i;
      var row;
      var st = typeof a.state === 'string' ? a.state : '';
      if (!per) return readerFail('ARG_INVALID', 'dates');
      if (st !== '' && !crHas(CORE_OLD_LABELS, st)) return readerFail('ARG_INVALID', 'state');
      pm = partMap();
      if (!pm.ok) return readerFail(readerCodeOf(pm), pm.code);
      ox = oldIndex();
      if (!ox.ok) return readerFail(readerCodeOf(ox), ox.code);
      for (i = 0; i < ox.ix.rows.length; i += 1) {
        row = ox.ix.rows[i];
        if (row.state === 'HELD_FOR_CLAIM' || row.state === 'SCRAP_PENDING') open.push(defRowOf(row, pm.map));
        if (row.date >= per.from && row.date <= per.to && (st === '' || row.state === st)) listed.push(defRowOf(row, pm.map));
      }
      return { ok: true, from: per.from, to: per.to, open: open, listed: listed };
    }
    function reportData(type, args, ctx) {
      return guarded(function () {
        var g = reportGate(ctx);
        var res;
        if (g.ok !== true) return g;
        if (typeof type !== 'string' || CORE_REPORT_TYPES.indexOf(type) < 0) return readerFail('ARG_INVALID', 'type');
        if (type === 'svcStockList') res = rdStockList(args, g);
        else if (type === 'svcPartLedger') res = rdPartLedger(args, g);
        else if (type === 'svcReorderList') res = rdReorder(args, g);
        else if (type === 'svcGoodsReceipt') res = rdReceipt(args, g);
        else if (type === 'svcAdjustmentRegister') res = rdAdjustments(args, g);
        else res = rdDefective(args);
        return res.ok === true ? Object.freeze(res) : res;
      });
    }

    /* ------------------------------------------------------------ writes that go straight to the docs layer */

    // Each method has a fixed number of arguments before ctx (2.11). The ctx is read only from that position and the docs
    // layer gets exactly that many arguments plus the core's own ctx: an extra or missing argument can never hand the docs
    // layer a ctx the core did not build.
    function viaDocs(method, arity) {
      return function () {
        var args = [];
        var ctx = arguments.length > arity ? arguments[arity] : null;
        var i;
        for (i = 0; i < arity; i += 1) args.push(i < arguments.length ? arguments[i] : undefined);
        args.push(null);
        return guarded(function () {
          var g = begin(ctx);
          if (!g.ok) return g;
          if (typeof docs[method] !== 'function') return crFail('CORE_LIBS_MISSING', { detail: [method] });
          args[args.length - 1] = ctxFor(g, ctx);
          return after(docs[method].apply(docs, args));
        });
      };
    }

    core = {
      version: CORE_VERSION,
      status: status,
      reopen: function () { return guarded(function () { var r = reopen(); return r.ok === true ? status() : r; }); },
      acknowledgeRestore: acknowledgeRestore,
      listParts: listParts,
      getPart: getPart,
      listLabour: listLabour,
      savePart: savePart,
      setPartActive: setPartActive,
      removePart: removePart,
      saveLabour: saveLabour,
      setLabourActive: setLabourActive,
      removeLabour: removeLabour,
      planBulk: planBulk,
      commitBulk: commitBulk,
      history: history,
      ledger: ledger,
      listOpening: listOpening,
      proposeOpening: viaDocs('proposeOpening', 1),
      approveOpening: viaDocs('approveOpening', 1),
      rejectOpening: viaDocs('rejectOpening', 2),
      withdrawOpening: viaDocs('withdrawOpening', 1),
      receiveGoods: viaDocs('receiveGoods', 1),
      listReceipts: listReceipts,
      getDoc: getDoc,
      reverseDoc: viaDocs('reverseDoc', 2),
      issueToJob: viaDocs('issueToJob', 1),
      returnFromJob: viaDocs('returnFromJob', 1),
      jobParts: jobParts,
      jobHasParts: jobHasParts,
      counterSale: viaDocs('counterSale', 1),
      listCounterSales: listCounterSales,
      proposeAdjustment: viaDocs('proposeAdjustment', 1),
      listAdjustments: listAdjustments,
      approveAdjustment: viaDocs('approveAdjustment', 1),
      rejectAdjustment: viaDocs('rejectAdjustment', 2),
      withdrawAdjustment: viaDocs('withdrawAdjustment', 1),
      registerOldPart: viaDocs('registerOldPart', 1),
      listOldParts: listOldParts,
      oldPartNextStates: oldPartNextStates,
      moveOldPart: viaDocs('moveOldPart', 2),
      signOffScrap: viaDocs('signOffScrap', 1),
      reorderList: reorderList,
      settings: settings,
      setConfig: viaDocs('setConfig', 1),
      can: can,
      reportData: reportData
    };
    return { ok: true, core: Object.freeze(core) };
  }

  // Shallow merge of own keys into a fresh object (later wins).
  function crSpread(a, b) {
    var out = {};
    var k;
    for (k in a) if (crHas(a, k)) out[k] = a[k];
    if (b) {
      for (k in b) if (crHas(b, k)) out[k] = b[k];
    }
    return out;
  }

  return Object.freeze({
    version: CORE_VERSION,
    CODES: CORE_CODES,
    MESSAGES: CORE_MESSAGES,
    REPORT_TYPES: Object.freeze(CORE_REPORT_TYPES.slice()),
    OLD_LABELS: Object.freeze(CORE_OLD_LABELS),
    create: create
  });
});
