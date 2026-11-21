(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingMoney = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Service billing money trail: advance receipts, balance and counter receipts, refunds, reversal of a wrong
  // receipt, and the read views (day summary, advances held). Pure: no screen, no timer, no storage calls of its own.
  // The caller passes the shared store, a clock, a job lookup and a read-only view of the bill layer.
  // Every business entry is ONE record in the receipts stream, written by ONE store.append call.
  // Money is whole paise. No customer details of any kind are ever stored here.

  var SBM_MAX_PAISE = 100000000;
  var SBM_PIN_FRESH_MS = 120000;
  var SBM_IST_MS = 19800000;
  var SBM_CASH_WARN_PAISE = 20000000;
  var SBM_DAY_MS = 86400000;
  var SBM_REF_FIT = 57;
  var SBM_PAY_MODES = ['Cash', 'UPI', 'Card', 'Bank'];
  var SBM_SALE_RE = /^[A-Z]{3}\/\d{2}-\d{2}\/\d{4,9}$/;
  var SBM_RECEIPT_RE = /^(SAR|SRC|SRF)\/\d{2}-\d{2}\/\d{4,9}$/;
  var SBM_SHELL_ROLES = ['Store Manager', 'Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];

  function sbmFreeze(o) {
    var keys, i;
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
    keys = Object.keys(o);
    for (i = 0; i < keys.length; i++) sbmFreeze(o[keys[i]]);
    return Object.freeze(o);
  }

  var ROLE_ACTIONS = sbmFreeze([
    'VIEW_STATUS', 'VIEW_AMOUNTS', 'RECEIPT_TAKE', 'COUNTER_RECEIPT', 'REVERSE_RECEIPT', 'REVERSE_REFUND',
    'REFUND', 'DECIDE_LEGACY', 'VIEW_SUMMARY'
  ]);
  var KINDS = sbmFreeze({
    SAR: 'Advance receipt', SRC: 'Receipt', SRF: 'Refund', RRV: 'Reversal'
  });

  var MESSAGE_ROWS = [
    ['SESSION_REQUIRED', 'Sign in again. The money area could not read who you are.'],
    ['NOT_ALLOWED', 'Your role cannot do this.'],
    ['PIN_REQUIRED', 'The Owner PIN check is needed for this.'],
    ['INPUT_INVALID', 'Some details are missing or not valid.'],
    ['AMOUNT_INVALID', 'The amount must be a whole number of paise above zero.'],
    ['AMOUNT_TOO_LARGE', 'The amount is above the limit of Rs 10,00,000.'],
    ['AMOUNT_MISMATCH', 'The amount does not match.'],
    ['PAYMODE_INVALID', 'Choose Cash, UPI, Card or Bank.'],
    ['PAYREF_INVALID', 'The reference is too long or not valid.'],
    ['PAYREF_LOOKS_LIKE_CARD', 'A card number must never be typed here. Use the slip code.'],
    ['JOB_NOT_FOUND', 'The service job was not found.'],
    ['JOB_CLOSED', 'This job is closed. It cannot take or change money now.'],
    ['JOB_VOID', 'This job was voided. It cannot take money.'],
    ['JOB_IS_STUB', 'This job is a placeholder (stub). Check the job details later.'],
    ['INVOICE_REQUIRED', 'A bill must be issued on this job before a balance receipt.'],
    ['INVOICE_NOT_FOUND', 'That bill does not belong to this job.'],
    ['INVOICE_CANCELLED', 'This bill was cancelled. It cannot take a receipt.'],
    ['INVOICE_EXISTS_USE_BALANCE', 'A bill is already issued on this job. Take a balance receipt instead.'],
    ['RECEIPT_EXCEEDS_BALANCE', 'The receipt is more than the balance due.'],
    ['SALE_NOT_FOUND', 'The counter sale was not found.'],
    ['NOT_RECEIPTABLE', 'This counter sale cannot take a receipt.'],
    ['COUNTER_RECEIPT_EXISTS', 'This counter sale already has a receipt.'],
    ['CREDIT_NOTE_REQUIRED', 'Give the credit note of this job for the refund.'],
    ['REFUND_EXCEEDS_REFUNDABLE', 'The refund is more than the money that can be given back.'],
    ['REASON_REQUIRED', 'A reason of at least 5 characters is needed.'],
    ['RECEIPT_NOT_FOUND', 'That receipt or refund was not found.'],
    ['ALREADY_REVERSED', 'This entry was already reversed.'],
    ['NOT_SAME_DAY', 'A reversal is allowed on the same day only. Use a refund instead.'],
    ['REFUND_FIRST', 'Reverse or settle the refunds of this job first.'],
    ['LEGACY_ADVANCE_UNCONFIRMED', 'The Owner must confirm the old advance first.'],
    ['NO_LEGACY_ADVANCE', 'This job has no old advance to decide.'],
    ['DECISION_EXISTS', 'The old advance of this job was already decided.'],
    ['ADVANCE_HELD', 'Money is held on this job. Refund it first.'],
    ['CASH_LIMIT_WARN', 'This is a large cash receipt. Check the cash rules with the accountant.'],
    ['BACKDATE_NOT_ALLOWED', 'Entries are always dated today.'],
    ['DEPS_INVALID', 'The money area is not ready. Reopen the Service module.'],
    ['STORE_NOT_READY', 'The money records could not be read. Nothing was changed.'],
    ['SVCS_ARGS_INVALID', 'The request was not valid. Check the entries and try again.'],
    ['SVCS_ACTOR_INVALID', 'No signed-in user was found. Sign in again.'],
    ['SVCS_OWNER_REQUIRED', 'Only the Owner can do this, after the PIN check.'],
    ['SVCS_BLOCKED', 'Service data failed its safety check. No money can be entered. Restore your latest backup.'],
    ['SVCS_WRITE_FAILED', 'The save could not be confirmed. Reopen the module and check the list before trying again.'],
    ['SVCS_READBACK_MISMATCH', 'The save could not be read back. Reopen the module and check the list before trying again.'],
    ['SVCS_HEAD_WRITE_FAILED', 'The save was not finished. Reopen the module and check the list before trying again.'],
    ['SVCS_HEAD_BEHIND', 'A save was not finished. Reopen the module and check before posting again.'],
    ['SVCS_REV_CONFLICT', 'The records changed on another screen. Reload and try again.'],
    ['SVCS_SERIES_MISMATCH', 'The receipt number changed. Reload and try again.'],
    ['SVCS_SERIES_TOO_LONG', 'The number would be too long.'],
    ['SVCS_CLOCK_BACK', 'The tablet clock is behind the last entry. Fix the clock or ask the Owner.'],
    ['SVCS_DOC_TOO_LARGE', 'This entry is too large.'],
    ['SVCS_STORAGE_UNAVAILABLE', 'The tablet storage is not ready yet. Wait a moment and try again.'],
    ['SVCS_DUPLICATE_REF', 'This receipt was already saved. Check the list before entering it again.'],
    ['PAST_VIEW', 'You are looking at an earlier day. Nothing can be changed here.']
  ];
  var CODES = Object.freeze(MESSAGE_ROWS.reduce(function (acc, row) {
    acc[row[0]] = row[0];
    return acc;
  }, {}));
  var MESSAGES = Object.freeze(MESSAGE_ROWS.reduce(function (acc, row) {
    acc[row[0]] = row[1];
    return acc;
  }, {}));
  var SBM_GENERIC_TEXT = 'The money area could not finish this. Nothing was posted.';

  // ---------------------------------------------------------------- small pure helpers

  function sbmHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function sbmObj(x) { return x !== null && typeof x === 'object' && Object.prototype.toString.call(x) === '[object Object]'; }
  function sbmArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
  function sbmInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && Math.abs(x) <= 9007199254740991; }
  function sbmPad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function sbmMap() { return Object.create(null); }
  // 13 or more digits, single blanks or dashes allowed between them: the shape of a card number.
  function sbmCardLike(t) { return typeof t === 'string' && /(\d[ -]?){13,}/.test(t); }
  function sbmMax0(n) { return n > 0 ? n : 0; }
  function sbmCount(n) { return sbmInt(n) && n >= 0; }

  // Free text: control characters and runs of blanks become one blank, then trimmed. null = too long or not text.
  function sbmText(v, max) {
    var t;
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') return null;
    t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (t.length > max) return null;
    return t;
  }

  function sbmDateOk(s) {
    var m, back, y, mo, dy;
    if (typeof s !== 'string') return false;
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    y = parseInt(m[1], 10);
    mo = parseInt(m[2], 10);
    dy = parseInt(m[3], 10);
    back = new Date(Date.UTC(y, mo - 1, dy));
    return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === dy;
  }
  // An ISO instant becomes its India date (UTC+05:30, no daylight saving). A plain date stays as it is.
  function sbmIstDate(v) {
    var ms, d;
    if (typeof v !== 'string') return '';
    if (sbmDateOk(v)) return v;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v)) return '';
    ms = Date.parse(v);
    if (!isFinite(ms)) return '';
    d = new Date(ms + SBM_IST_MS);
    return sbmPad(d.getUTCFullYear(), 4) + '-' + sbmPad(d.getUTCMonth() + 1, 2) + '-' + sbmPad(d.getUTCDate(), 2);
  }
  function sbmDayNumber(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / SBM_DAY_MS) : NaN;
  }

  function sbmCalcOf(hint) {
    if (hint && typeof hint.rupeesToPaise === 'function') return hint;
    try {
      if (typeof globalThis !== 'undefined' && globalThis.SaagarServiceBillingCalc) return globalThis.SaagarServiceBillingCalc;
    } catch (e) {
      return null;
    }
    return null;
  }
  // Pay mode words as the cash book reads them: the four modes map to themselves, other text to the nearest word, else Bank.
  function normalizePayMode(text) {
    var t;
    if (typeof text !== 'string') return 'Bank';
    if (SBM_PAY_MODES.indexOf(text) >= 0) return text;
    t = text.toLowerCase();
    if (t.indexOf('bank') >= 0) return 'Bank';
    if (t.indexOf('upi') >= 0) return 'UPI';
    if (t.indexOf('card') >= 0) return 'Card';
    if (t.indexOf('cash') >= 0) return 'Cash';
    return 'Bank';
  }
  // Typed rupee text to whole paise, or null. The arithmetic lives in the calc layer.
  function sbmParse(text, hint) {
    var c = sbmCalcOf(hint), r;
    if (!c || typeof text !== 'string') return null;
    r = c.rupeesToPaise(text);
    return r && r.ok === true && sbmInt(r.paise) ? r.paise : null;
  }
  function parsePaise(text) { return sbmParse(text, null); }
  function paiseToRupeesText(p) {
    var c = sbmCalcOf(null), t;
    if (!c || typeof c.paiseToRupeesText !== 'function') return '';
    t = c.paiseToRupeesText(p);
    return typeof t === 'string' ? t : '';
  }

  // The session is read fresh from ctx on every call and never kept.
  function sbmSession(ctx) {
    var s, tier;
    try {
      s = sbmObj(ctx) ? ctx.session : null;
      if (!sbmObj(s) || s.ok !== true) return null;
      tier = s.tier;
      if (tier === 'owner' && s.isOwner === true) return sbmWho(tier, s);
      if (tier === 'manager' && s.isManager === true && s.isOwner !== true) return sbmWho(tier, s);
      if (tier === 'staff' && s.isOwner !== true && s.isManager !== true) return sbmWho(tier, s);
      return null;
    } catch (e) {
      return null;
    }
  }
  function sbmWho(tier, s) {
    var role = '', name = '';
    if (typeof s.role === 'string') role = s.role.slice(0, 40);
    if (typeof s.actorName === 'string') name = s.actorName.slice(0, 60);
    return { tier: tier, owner: tier === 'owner', manager: tier === 'manager', role: role, name: name };
  }
  function sbmActor(sess) { return { t: sess.tier, r: sess.role, m: sess.name }; }

  // One table for who may do what (plan 2.11). cfg = {billingRoles, storeRoles}.
  function sbmRule(action, sess, cfg) {
    var own = sess.owner, mgr = sess.manager;
    var billing = sess.tier === 'staff' && cfg.billingRoles.indexOf(sess.role) >= 0;
    var storeClass = sess.tier === 'staff' && cfg.storeRoles.indexOf(sess.role) >= 0;
    function yes(pin) { return { ok: true, needsPin: pin === true }; }
    function no(code) { return { ok: false, code: code, needsPin: false }; }
    switch (action) {
      case 'VIEW_STATUS': return yes(false);
      case 'VIEW_AMOUNTS':
      case 'RECEIPT_TAKE':
        return (own || mgr || billing) ? yes(false) : no('NOT_ALLOWED');
      case 'COUNTER_RECEIPT': return (own || mgr || billing || storeClass) ? yes(false) : no('NOT_ALLOWED');
      case 'REVERSE_RECEIPT': return (own || mgr) ? yes(false) : no('NOT_ALLOWED');
      case 'VIEW_SUMMARY': return (own || mgr) ? yes(false) : no('NOT_ALLOWED');
      case 'REVERSE_REFUND':
      case 'REFUND':
      case 'DECIDE_LEGACY':
        return own ? yes(true) : no('NOT_ALLOWED');
      default: return no('INPUT_INVALID');
    }
  }

  function sbmJobRef(prefix, id) {
    var s = id, h = 7, i, clean;
    if (/^[A-Za-z0-9._:\/#-]+$/.test(s) && s.length <= SBM_REF_FIT) return prefix + s;
    clean = s.replace(/[^A-Za-z0-9._:\/#-]/g, '_').slice(0, 40);
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
    return prefix + clean + '-' + sbmPad(h % 1000000, 6);
  }

  // ---------------------------------------------------------------- the factory

  function create(deps) {
    var ck = sbmCheckDeps(deps);
    var store, clockFn, cases, view, calcHint;
    var X = null;            // the money index (null until a clean read)
    var dirty = false;       // a write may have landed or failed: scan storage again before the next read
    var cfgCache = null;     // billing and store role lists with the stream revisions they came from
    var api;

    if (!ck.ok) return ck;
    store = ck.store;
    clockFn = deps.now;
    cases = deps.cases;
    view = deps.docsView;
    calcHint = deps.calc;

    // ------------------------------------------------------------ results

    function fail(code, detail) {
      var r = { ok: false, code: code, message: sbmHas(MESSAGES, code) ? MESSAGES[code] : SBM_GENERIC_TEXT };
      if (detail !== undefined) r.detail = detail;
      return r;
    }
    // A failure from the store. The code and the store's own text pass through unchanged.
    function lowerFail(res) {
      var code = res && typeof res.code === 'string' ? res.code : 'SVCS_STORAGE_UNAVAILABLE';
      var out = { ok: false, code: code, message: SBM_GENERIC_TEXT };
      if (res && typeof res.message === 'string' && res.message) out.message = res.message;
      else if (sbmHas(MESSAGES, code)) out.message = MESSAGES[code];
      if (res) {
        if (res.detail !== undefined) out.detail = res.detail;
        if (res.committed === true) out.committed = true;
        if (typeof res.stream === 'string') out.stream = res.stream;
      }
      return out;
    }
    function needText(v, max, code, field) {
      var t = sbmText(v, max);
      if (t === null) return fail(code, { field: field });
      // No card number is ever stored, in any free text field.
      return sbmCardLike(t) ? fail('PAYREF_LOOKS_LIKE_CARD', { field: field }) : { ok: true, value: t };
    }

    // ------------------------------------------------------------ clock

    function nowDate() {
      var v, ms;
      try { v = clockFn(); } catch (e) { return null; }
      if (v && typeof v.getTime === 'function') ms = v.getTime();
      else if (typeof v === 'number') ms = v;
      else if (typeof v === 'string') ms = Date.parse(v);
      else return null;
      return isFinite(ms) ? new Date(ms) : null;
    }
    function today() {
      var d = nowDate();
      return d ? sbmIstDate(d.toISOString()) : '';
    }
    // The stamp made by the screen right after the Owner PIN: valid for 120 seconds, never from the future.
    function stampAt(ctx) {
      var s = sbmObj(ctx) ? ctx.stepUp : null, d = nowDate(), ok, at, diff;
      if (!d || !sbmObj(s)) return -1;
      ok = s.ok;
      at = s.at;
      if (ok !== true || !sbmInt(at)) return -1;
      diff = d.getTime() - at;
      return diff >= 0 && diff <= SBM_PIN_FRESH_MS ? at : -1;
    }

    // ------------------------------------------------------------ the money index (from the receipts stream)

    function newIndex(rev) {
      return { rev: rev, recs: [], byNo: sbmMap(), rrv: sbmMap(), jobs: sbmMap(), sales: sbmMap(), decided: sbmMap() };
    }
    function pushTo(map, key, rec) {
      if (!sbmHas(map, key)) map[key] = [];
      map[key].push(rec);
    }
    // Reads one record into the index. Returns '' when fine, else a short reason.
    function ingest(Y, rec) {
      var b = rec.b, k = rec.k;
      if (!sbmObj(b)) return 'body';
      if (k === 'RRV') {
        if (typeof b.reverses !== 'string' || !SBM_RECEIPT_RE.test(b.reverses) || !sbmInt(b.amountPaise)) return 'reversal';
        Y.rrv[b.reverses] = rec;
        Y.recs.push(rec);
        return '';
      }
      if (k !== 'SAR' && k !== 'SRC' && k !== 'SRF') return 'kind';
      if (typeof b.no !== 'string' || b.no.slice(0, 3) !== k || !SBM_RECEIPT_RE.test(b.no)) return 'number';
      if (!sbmInt(b.amountPaise) || b.amountPaise < 1 || !sbmDateOk(b.docDate)) return 'shape';
      if (sbmHas(Y.byNo, b.no)) return 'number twice';
      Y.byNo[b.no] = rec;
      Y.recs.push(rec);
      if (typeof b.jobId === 'string' && b.jobId) pushTo(Y.jobs, b.jobId, rec);
      if (typeof b.saleNo === 'string' && b.saleNo) pushTo(Y.sales, b.saleNo, rec);
      if (k === 'SAR' && b.legacy === true && typeof b.jobId === 'string') Y.decided[b.jobId] = rec;
      return '';
    }
    // A read from the store handle, made fresh first when another handle moved the stream head under it.
    function freshRead(stream) {
      var rd = store.read(stream), h, o;
      if (!rd || rd.ok !== true) return rd;
      h = store.head(stream);
      if (!h || h.ok !== true) return h;
      if (h.rev === rd.rev) return rd;
      o = store.open();
      if (!o || o.ok !== true) return o;
      rd = store.read(stream);
      if (rd && rd.ok === true && rd.rev !== h.rev) return fail('STORE_NOT_READY', 'revision');
      return rd;
    }
    function reindex() {
      var rd = freshRead('receipts'), Y, i, why;
      if (!rd || rd.ok !== true) {
        X = null;
        return lowerFail(rd);
      }
      Y = newIndex(rd.rev);
      for (i = 0; i < rd.records.length; i++) {
        why = ingest(Y, rd.records[i]);
        if (why) {
          X = null;
          return fail('STORE_NOT_READY', why);
        }
      }
      X = Y;
      return { ok: true };
    }
    function ready() {
      var h, o;
      if (X && !dirty) {
        h = store.head('receipts');
        if (!h || h.ok !== true) return lowerFail(h);
        if (h.rev === X.rev) return { ok: true };
        dirty = true;      // another handle wrote
      }
      if (dirty) {
        // Scan storage again, then rebuild the index.
        o = store.open();
        if (!o || o.ok !== true) {
          X = null;
          return lowerFail(o);
        }
        dirty = false;
      }
      return reindex();
    }
    // After a write that may or may not have landed: forget the index, so the next call reads the truth.
    function afterFailedWrite() {
      X = null;
      dirty = true;
    }

    // A role list in a settings record: every entry a shell role, none twice, none in `banned`. null = not valid.
    function roleList(list, banned) {
      var outList = [], j;
      if (!sbmArr(list)) return null;
      for (j = 0; j < list.length; j++) {
        if (typeof list[j] !== 'string' || SBM_SHELL_ROLES.indexOf(list[j]) < 0 || list[j] === banned || outList.indexOf(list[j]) >= 0) return null;
        outList.push(list[j]);
      }
      return outList;
    }
    // The latest VALID settings record of kind `kind` in `stream` gives the list `field` (a record that is not valid is
    // skipped, as the Stores layer does). null = the stream could not be read.
    function latestRoles(stream, kind, field, banned) {
      var rd = freshRead(stream), i, b, list;
      if (!rd || rd.ok !== true) return null;
      for (i = rd.records.length - 1; i >= 0; i--) {
        if (rd.records[i].k !== kind) continue;
        b = rd.records[i].b;
        if (!sbmObj(b)) continue;
        if (kind === 'BCFG_SET' && (!sbmInt(b.discountLimitPaise) || b.discountLimitPaise < 0 || b.discountLimitPaise > SBM_MAX_PAISE)) continue;
        if (kind === 'CONFIG_SET' && (!sbmInt(b.adjustLimitPaise) || b.adjustLimitPaise < 0)) continue;
        list = roleList(b[field], banned);
        if (list) return list;
      }
      return [];
    }
    // Role lists: billing roles from the bill settings (invoices stream), store roles from the Stores settings.
    // A stream that cannot be read gives empty lists, which only narrows who may act (fail closed, never cached).
    function roleConfig() {
      var hi = store.head('invoices'), hc = store.head('config'), ri = hi && hi.ok === true ? hi.rev : -1, rc = hc && hc.ok === true ? hc.rev : -1;
      var out = { invRev: ri, cfgRev: rc, billingRoles: [], storeRoles: [] }, bl = [], sl = [];
      if (cfgCache && ri >= 0 && rc >= 0 && cfgCache.invRev === ri && cfgCache.cfgRev === rc) return cfgCache;
      if (ri > 0) bl = latestRoles('invoices', 'BCFG_SET', 'billingRoles', 'Store Manager');
      if (rc > 0) sl = latestRoles('config', 'CONFIG_SET', 'storeRoles', '');
      if (ri < 0 || rc < 0 || bl === null || sl === null) return out;
      out.billingRoles = bl;
      out.storeRoles = sl;
      cfgCache = out;
      return out;
    }

    // ------------------------------------------------------------ reads from the other layers

    // The bill layer view. undefined = the lookup itself failed (never treated as "nothing there").
    function fromView(name, arg) {
      var v;
      try { v = view[name](arg); } catch (e) { return undefined; }
      return v === undefined ? null : v;
    }
    function jobOf(jobId) {
      var j;
      try { j = cases.get(jobId); } catch (e) { return null; }
      return sbmObj(j) ? j : null;
    }
    // true, false, or undefined when the bill layer could not answer (callers then refuse: fail closed).
    function jobIsVoid(job, jobId) {
      var v;
      if (job && job.voided) return true;
      v = fromView('jobVoided', jobId);
      if (v === undefined) return undefined;
      return v === true;
    }
    // The bill of a job from the bill layer, checked for shape. undefined = no answer or an answer that is not valid.
    function billOf(jobId) {
      var inv = fromView('invoiceForJob', jobId);
      if (inv === undefined || inv === null) return inv;
      if (!sbmObj(inv) || typeof inv.no !== 'string' || (inv.status !== 'ISSUED' && inv.status !== 'CANCELLED')) return undefined;
      if (!sbmInt(inv.totalPaise) || inv.totalPaise < 0 || !sbmInt(inv.creditedPaise) || inv.creditedPaise < 0) return undefined;
      return inv;
    }
    function typedPaise(job) {
      var p;
      if (!job) return 0;
      if (sbmInt(job.typedAdvancePaise) && job.typedAdvancePaise > 0) return job.typedAdvancePaise;
      if (typeof job.advancePaid === 'string') {
        p = sbmParse(job.advancePaid, calcHint);
        return p === null ? 0 : p;
      }
      return 0;
    }

    // ------------------------------------------------------------ views

    function isLive(rec) { return !sbmHas(X.rrv, rec.b.no); }
    function byOf(rec) { return { name: rec.a.m, role: rec.a.r, tier: rec.a.t }; }
    function viewOf(rec) {
      var b = rec.b, out = { id: rec.id, n: rec.n, kind: rec.k, kindLabel: KINDS[rec.k] || rec.k, at: rec.at, by: byOf(rec), ref: rec.r || '' }, rv, keys, i;
      if (rec.k === 'RRV') {
        out.docDate = b.docDate;
        out.reverses = b.reverses;
        out.side = b.side;
        out.amountPaise = b.amountPaise;
        out.reason = b.reason;
        out.pinAt = b.pinAt === undefined ? null : b.pinAt;
        return out;
      }
      out.no = b.no;
      out.docDate = b.docDate;
      out.amountPaise = b.amountPaise;
      out.direction = rec.k === 'SRF' ? 'OUT' : 'IN';
      out.payMode = typeof b.payMode === 'string' ? b.payMode : '';
      out.payRef = typeof b.payRef === 'string' ? b.payRef : '';
      out.note = typeof b.note === 'string' ? b.note : '';
      keys = ['jobId', 'invoiceNo', 'saleNo', 'cnNo', 'advanceNo', 'reason', 'pinAt', 'legacy', 'inBook'];
      for (i = 0; i < keys.length; i++) if (sbmHas(b, keys[i])) out[keys[i]] = b[keys[i]];
      rv = sbmHas(X.rrv, b.no) ? X.rrv[b.no] : null;
      out.status = rv ? 'REVERSED' : 'OK';
      out.reversal = rv ? { at: rv.at, by: byOf(rv), reason: rv.b.reason, docDate: rv.b.docDate } : null;
      out.cashBook = 'UNKNOWN';
      return out;
    }

    // ------------------------------------------------------------ the money rule (plan 4.6)

    function sums(list) {
      var s = { received: 0, refunded: 0, hasLive: false }, i, r;
      for (i = 0; list && i < list.length; i++) {
        r = list[i];
        if (!isLive(r)) continue;
        if (r.k === 'SRF') s.refunded += r.b.amountPaise;
        else {
          s.received += r.b.amountPaise;
          s.hasLive = true;
        }
      }
      return s;
    }
    // inv = the bill layer view of the job's bill (or null).
    function jobFigures(jobId, inv) {
      var s = sums(sbmHas(X.jobs, jobId) ? X.jobs[jobId] : null), active = !!(inv && inv.status === 'ISSUED'), due = 0, net = s.received - s.refunded;
      // inv comes from billOf, so both figures are whole paise of zero or more
      if (active) due = sbmMax0(inv.totalPaise - inv.creditedPaise);
      return {
        receivedPaise: s.received, refundedPaise: s.refunded, netPaise: net, hasLive: s.hasLive,
        active: active, duePaise: due, outstandingPaise: sbmMax0(due - net), refundablePaise: sbmMax0(net - due)
      };
    }

    // ------------------------------------------------------------ authorization

    // Session check, then readiness, then the role table.
    function begin(action, ctx) {
      var sess = sbmSession(ctx), rd, cfg, ru;
      if (!sess) return fail('SESSION_REQUIRED');
      if (sbmObj(ctx) && ctx.pastView === true) return fail('PAST_VIEW');
      rd = ready();
      if (!rd.ok) return rd;
      cfg = roleConfig();
      ru = sbmRule(action, sess, cfg);
      if (!ru.ok) return fail(ru.code);
      return { ok: true, sess: sess, pin: ru.needsPin === true, pinOk: stampAt(ctx) >= 0 };
    }
    function needPin(g) { return g.pin && !g.pinOk ? fail('PIN_REQUIRED') : null; }
    function clientRef(ctx) {
      var r = sbmObj(ctx) ? ctx.clientRef : undefined;
      if (r === undefined || r === null || r === '') return { ok: true, ref: '' };
      return typeof r === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{2,63}$/.test(r) ? { ok: true, ref: r } : { ok: false };
    }
    // The clock override flag is for the Owner with a fresh PIN stamp only.
    function clockFlag(ctx, g) {
      if (!sbmObj(ctx) || ctx.clockOverride !== true) return { ok: true, on: false };
      if (!g.sess.owner) return fail('NOT_ALLOWED');
      return g.pinOk ? { ok: true, on: true } : fail('PIN_REQUIRED');
    }
    // A retry with the same reference after a lost reply: find the saved record instead of writing twice.
    function findDone(ref, kinds) {
      var rec;
      if (!ref) return null;
      rec = store.findRef('receipts', ref);
      if (!rec) return null;
      if (kinds.indexOf(rec.k) < 0) return { conflict: true };
      return { rec: rec };
    }
    function checkToday(input) {
      if (input.docDate !== undefined && input.docDate !== today()) return fail('BACKDATE_NOT_ALLOWED');
      return null;
    }
    function readAmount(v) {
      if (!sbmInt(v) || v < 1) return fail('AMOUNT_INVALID');
      if (v > SBM_MAX_PAISE) return fail('AMOUNT_TOO_LARGE');
      return { ok: true, value: v };
    }
    function readPay(input) {
      var mode = input.payMode, ref;
      if (typeof mode !== 'string' || SBM_PAY_MODES.indexOf(mode) < 0) return fail('PAYMODE_INVALID');
      ref = sbmText(input.payRef, 40);
      if (ref === null) return fail('PAYREF_INVALID');
      if (sbmCardLike(ref)) return fail('PAYREF_LOOKS_LIKE_CARD');
      return { ok: true, mode: mode, ref: ref };
    }
    function readReason(v) {
      var t = sbmText(v, 200);
      if (t === null || t.length < 5) return fail('REASON_REQUIRED');
      return sbmCardLike(t) ? fail('PAYREF_LOOKS_LIKE_CARD', { field: 'reason' }) : { ok: true, value: t };
    }

    // ------------------------------------------------------------ writing

    // One record, one store.append. body({no, at, docDate}) builds the stored body. No other write site exists.
    function appendMoney(o) {
      var ta, nn, no = '', at, item, res, opts, rec, clockArg;
      if (o.clockOn) clockArg = { clockOverride: true };
      ta = store.nextAt('receipts', clockArg);
      if (!ta || ta.ok !== true) return lowerFail(ta);
      at = ta.at;
      nn = o.series ? store.nextNumber(o.series, at) : { ok: true, no: '' };
      if (!nn || nn.ok !== true) return lowerFail(nn);
      no = nn.no;
      item = { k: o.kind, b: o.body({ no: no, at: at, docDate: sbmIstDate(at) }) };
      if (o.series) item.series = o.series;
      if (o.ref) item.r = o.ref;
      opts = { expectRev: X.rev, actor: sbmActor(o.sess), at: at };
      if (o.clockOn) opts.clockOverride = true;
      res = store.append('receipts', [item], opts);
      if (!res || res.ok !== true) {
        afterFailedWrite();
        return lowerFail(res);
      }
      rec = res.records[0];
      if (ingest(X, rec)) X = null;
      else X.rev = res.rev;
      return { ok: true, rec: rec, storeWarnings: res.warnings || [] };
    }
    // The view of a record just saved. If the index was dropped, it is rebuilt first.
    function savedView(rec) {
      if (!X) reindex();
      return X ? viewOf(rec) : { id: rec.id, kind: rec.k, no: rec.b.no };
    }
    function receiptOut(rec, warns, extra) {
      var out = { ok: true, receipt: savedView(rec), warnings: warns || [] };
      if (extra) out.replayed = true;
      return out;
    }

    // ------------------------------------------------------------ job rules shared by the receipts

    // The job exists, is not void, and (when openOnly) is not closed. Returns {ok, job, warnings}.
    function jobGate(jobId, openOnly) {
      var job = jobOf(jobId), warns = [], vd;
      if (!job) return fail('JOB_NOT_FOUND', { jobId: jobId });
      vd = jobIsVoid(job, jobId);
      if (vd === undefined) return fail('DEPS_INVALID', 'docsView');
      if (vd) return fail('JOB_VOID');
      if (openOnly && job.status === 'closed') return fail('JOB_CLOSED');
      if (job.stub === true) warns.push('JOB_IS_STUB');
      return { ok: true, job: job, warnings: warns };
    }
    // An old typed advance that nobody decided yet blocks new receipts (the customer would be asked for it twice).
    function legacyBlock(jobId, job) {
      var recs = sbmHas(X.jobs, jobId) ? X.jobs[jobId] : null;
      if (recs && recs.length) return null;
      return typedPaise(job) > 0 ? fail('LEGACY_ADVANCE_UNCONFIRMED') : null;
    }
    function readJobId(v) {
      var t = sbmText(v, 60);
      if (t === null || t === '') return fail('INPUT_INVALID', { field: 'jobId' });
      return { ok: true, value: t };
    }
    function cashWarn(mode, amount, warns) {
      if (mode === 'Cash' && amount >= SBM_CASH_WARN_PAISE) warns.push('CASH_LIMIT_WARN');
    }

    // ------------------------------------------------------------ writes: receipts

    function takeAdvance(input, ctx) {
      var g = begin('RECEIPT_TAKE', ctx), rf, dn, bad, id, am, pay, nt, jg, inv, lb, cf, res, warns;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone(rf.ref, ['SAR']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return receiptOut(dn.rec, [], true);
      if (!sbmObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      id = readJobId(input.jobId);
      if (!id.ok) return id;
      am = readAmount(input.amountPaise);
      if (!am.ok) return am;
      pay = readPay(input);
      if (!pay.ok) return pay;
      nt = needText(input.note, 200, 'INPUT_INVALID', 'note');
      if (!nt.ok) return nt;
      jg = jobGate(id.value, true);
      if (!jg.ok) return jg;
      inv = billOf(id.value);
      if (inv === undefined) return fail('DEPS_INVALID', 'docsView');
      if (inv && inv.status === 'ISSUED') return fail('INVOICE_EXISTS_USE_BALANCE');
      lb = legacyBlock(id.value, jg.job);
      if (lb) return lb;
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      warns = jg.warnings.slice();
      cashWarn(pay.mode, am.value, warns);
      res = appendMoney({
        kind: 'SAR', series: 'SAR', ref: rf.ref, sess: g.sess, clockOn: cf.on,
        body: function (c) {
          return { no: c.no, docDate: c.docDate, jobId: id.value, amountPaise: am.value, payMode: pay.mode, payRef: pay.ref, note: nt.value };
        }
      });
      if (!res.ok) return res;
      return receiptOut(res.rec, warns.concat(res.storeWarnings));
    }

    function takeBalance(input, ctx) {
      var g = begin('RECEIPT_TAKE', ctx), rf, dn, bad, id, no, am, pay, nt, jg, inv, fg, lb, cf, res, warns;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone(rf.ref, ['SRC']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return receiptOut(dn.rec, [], true);
      if (!sbmObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      id = readJobId(input.jobId);
      if (!id.ok) return id;
      no = sbmText(input.invoiceNo, 40);
      if (no === null || no === '') return fail('INPUT_INVALID', { field: 'invoiceNo' });
      am = readAmount(input.amountPaise);
      if (!am.ok) return am;
      pay = readPay(input);
      if (!pay.ok) return pay;
      nt = needText(input.note, 200, 'INPUT_INVALID', 'note');
      if (!nt.ok) return nt;
      jg = jobGate(id.value, false);
      if (!jg.ok) return jg;
      inv = billOf(id.value);
      if (inv === undefined) return fail('DEPS_INVALID', 'docsView');
      if (!inv) return jg.job.status === 'closed' ? fail('JOB_CLOSED') : fail('INVOICE_REQUIRED');
      if (inv.no !== no) return fail('INVOICE_NOT_FOUND');
      if (inv.status !== 'ISSUED') return fail('INVOICE_CANCELLED');
      lb = legacyBlock(id.value, jg.job);
      if (lb) return lb;
      fg = jobFigures(id.value, inv);
      if (am.value > fg.outstandingPaise) return fail('RECEIPT_EXCEEDS_BALANCE', { outstandingPaise: fg.outstandingPaise });
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      warns = jg.warnings.slice();
      cashWarn(pay.mode, am.value, warns);
      res = appendMoney({
        kind: 'SRC', series: 'SRC', ref: rf.ref, sess: g.sess, clockOn: cf.on,
        body: function (c) {
          return { no: c.no, docDate: c.docDate, jobId: id.value, invoiceNo: no, amountPaise: am.value, payMode: pay.mode, payRef: pay.ref, note: nt.value };
        }
      });
      if (!res.ok) return res;
      return receiptOut(res.rec, warns.concat(res.storeWarnings));
    }

    function readSaleNo(v) {
      var t = sbmText(v, 40);
      if (t === null || !SBM_SALE_RE.test(t)) return fail('INPUT_INVALID', { field: 'saleNo' });
      return { ok: true, value: t };
    }

    function takeCounterReceipt(input, ctx) {
      var g = begin('COUNTER_RECEIPT', ctx), rf, bad, sn, am, pay, nt, sale, cf, res, warns = [], ref;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      if (!sbmObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      sn = readSaleNo(input.saleNo);
      if (!sn.ok) return sn;
      am = readAmount(input.amountPaise);
      if (!am.ok) return am;
      pay = readPay(input);
      if (!pay.ok) return pay;
      nt = needText(input.note, 200, 'INPUT_INVALID', 'note');
      if (!nt.ok) return nt;
      sale = fromView('counterSale', sn.value);
      if (sale === undefined) return fail('DEPS_INVALID', 'docsView');
      if (!sale) return fail('SALE_NOT_FOUND');
      if (sale.rcptDue !== true || sale.reversed === true) return fail('NOT_RECEIPTABLE');
      if (sbmHas(X.sales, sn.value)) return fail('COUNTER_RECEIPT_EXISTS', { no: X.sales[sn.value][0].b.no });
      if (am.value !== sale.amountPaise) return fail('AMOUNT_MISMATCH', { expected: sale.amountPaise });
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      cashWarn(pay.mode, am.value, warns);
      ref = 'CSLRC:' + sn.value;
      res = appendMoney({
        kind: 'SRC', series: 'SRC', ref: ref, sess: g.sess, clockOn: cf.on,
        body: function (c) {
          return { no: c.no, docDate: c.docDate, saleNo: sn.value, amountPaise: am.value, payMode: pay.mode, payRef: pay.ref, note: nt.value };
        }
      });
      if (!res.ok) {
        // The fixed reference means a receipt for this sale was saved by an earlier try.
        if (res.code === 'SVCS_DUPLICATE_REF') return fail('COUNTER_RECEIPT_EXISTS');
        return res;
      }
      return receiptOut(res.rec, warns.concat(res.storeWarnings));
    }

    // ------------------------------------------------------------ writes: refund

    function refund(input, ctx) {
      var g = begin('REFUND', ctx), rf, dn, bad, hasJob, hasSale, id = null, sn = null, am, pay, rs, cnNo = '', advNo = '', pin, cf, inv = null, fg, limit,
        sale, ar, cn, sm, res, pinAt;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone(rf.ref, ['SRF']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, refund: savedView(dn.rec), warnings: [], replayed: true };
      if (!sbmObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      hasJob = input.jobId !== undefined && input.jobId !== null && input.jobId !== '';
      hasSale = input.saleNo !== undefined && input.saleNo !== null && input.saleNo !== '';
      if (hasJob === hasSale) return fail('INPUT_INVALID', { field: 'jobId' });
      if (hasJob) {
        id = readJobId(input.jobId);
        if (!id.ok) return id;
      } else {
        sn = readSaleNo(input.saleNo);
        if (!sn.ok) return sn;
      }
      am = readAmount(input.amountPaise);
      if (!am.ok) return am;
      pay = readPay(input);
      if (!pay.ok) return pay;
      rs = readReason(input.reason);
      if (!rs.ok) return rs;
      if (input.cnNo !== undefined && input.cnNo !== null && input.cnNo !== '') {
        cnNo = sbmText(input.cnNo, 40);
        if (cnNo === null || cnNo === '') return fail('INPUT_INVALID', { field: 'cnNo' });
      }
      if (input.advanceNo !== undefined && input.advanceNo !== null && input.advanceNo !== '') {
        advNo = typeof input.advanceNo === 'string' ? input.advanceNo : '';
        ar = sbmHas(X.byNo, advNo) ? X.byNo[advNo] : null;
        if (!ar || ar.k !== 'SAR' || !id || ar.b.jobId !== id.value || !isLive(ar)) return fail('INPUT_INVALID', { field: 'advanceNo' });
      }
      if (hasJob) {
        inv = billOf(id.value);
        if (inv === undefined) return fail('DEPS_INVALID', 'docsView');
        fg = jobFigures(id.value, inv);
        if (fg.active && !cnNo) return fail('CREDIT_NOTE_REQUIRED');
        if (cnNo) {
          cn = fromView('creditNote', cnNo);
          if (cn === undefined) return fail('DEPS_INVALID', 'docsView');
          if (!cn || cn.jobId !== id.value) return fail('CREDIT_NOTE_REQUIRED');
        }
        limit = fg.refundablePaise;
      } else {
        sale = fromView('counterSale', sn.value);
        if (sale === undefined) return fail('DEPS_INVALID', 'docsView');
        if (!sale) return fail('SALE_NOT_FOUND');
        sm = sums(sbmHas(X.sales, sn.value) ? X.sales[sn.value] : null);
        limit = sbmMax0(sm.received - sm.refunded);
      }
      if (am.value > limit) return fail('REFUND_EXCEEDS_REFUNDABLE', { refundablePaise: limit });
      pin = needPin(g);
      if (pin) return pin;
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      pinAt = stampAt(ctx);
      res = appendMoney({
        kind: 'SRF', series: 'SRF', ref: rf.ref, sess: g.sess, clockOn: cf.on,
        body: function (c) {
          var b = { no: c.no, docDate: c.docDate, amountPaise: am.value, payMode: pay.mode, payRef: pay.ref, reason: rs.value, pinAt: pinAt };
          if (id) b.jobId = id.value;
          else b.saleNo = sn.value;
          if (cnNo) b.cnNo = cnNo;
          if (advNo) b.advanceNo = advNo;
          return b;
        }
      });
      if (!res.ok) return res;
      return { ok: true, refund: savedView(res.rec), warnings: res.storeWarnings };
    }

    // ------------------------------------------------------------ writes: reversal

    function reverse(input, ctx) {
      var g = begin('REVERSE_RECEIPT', ctx), no, rs, rec, isRefund, jobId, job, s, left, rr, cf, ref, res, pinAt = null;
      if (!g.ok) return g;
      if (!sbmObj(input)) return fail('INPUT_INVALID');
      no = typeof input.no === 'string' ? input.no : '';
      if (!SBM_RECEIPT_RE.test(no)) return fail('RECEIPT_NOT_FOUND');
      rec = sbmHas(X.byNo, no) ? X.byNo[no] : null;
      if (!rec) return fail('RECEIPT_NOT_FOUND');
      isRefund = rec.k === 'SRF';
      if (isRefund) {
        rr = sbmRule('REVERSE_REFUND', g.sess, roleConfig());
        if (!rr.ok) return fail(rr.code);
      }
      if (!isLive(rec)) return fail('ALREADY_REVERSED');
      rs = readReason(input.reason);
      if (!rs.ok) return rs;
      if (rec.b.docDate !== today()) return fail('NOT_SAME_DAY');
      jobId = typeof rec.b.jobId === 'string' ? rec.b.jobId : '';
      if (!isRefund && jobId) {
        job = jobOf(jobId);
        if (job && job.status === 'closed') return fail('JOB_CLOSED');
      }
      if (!isRefund) {
        s = sums(jobId ? X.jobs[jobId] : X.sales[rec.b.saleNo]);
        left = s.received - rec.b.amountPaise;
        if (left < s.refunded) return fail('REFUND_FIRST');
      }
      if (isRefund) {
        if (!g.pinOk) return fail('PIN_REQUIRED');
        pinAt = stampAt(ctx);
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      ref = 'REVOF:' + no;
      if (store.findRef('receipts', ref)) return fail('ALREADY_REVERSED');
      res = appendMoney({
        kind: 'RRV', series: null, ref: ref, sess: g.sess, clockOn: cf.on,
        body: function (c) {
          return { docDate: c.docDate, reverses: no, side: isRefund ? 'OUT' : 'IN', amountPaise: rec.b.amountPaise, reason: rs.value, pinAt: pinAt };
        }
      });
      if (!res.ok) return res;
      return { ok: true, reversal: savedView(res.rec), reversed: no, warnings: res.storeWarnings };
    }

    // ------------------------------------------------------------ writes: old typed advance

    function decideLegacyAdvance(input, ctx) {
      var g = begin('DECIDE_LEGACY', ctx), rf, id, decision, am, mode = 'Cash', nt, jg, typed, pin, cf, ref, res, pinAt, warns;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      if (!sbmObj(input)) return fail('INPUT_INVALID');
      id = readJobId(input.jobId);
      if (!id.ok) return id;
      decision = input.decision;
      if (decision !== 'IN_BOOK' && decision !== 'POST_NOW') return fail('INPUT_INVALID', { field: 'decision' });
      am = readAmount(input.amountPaise);
      if (!am.ok) return am;
      if (input.payMode !== undefined) {
        if (typeof input.payMode !== 'string' || SBM_PAY_MODES.indexOf(input.payMode) < 0) return fail('PAYMODE_INVALID');
        mode = input.payMode;
      }
      nt = needText(input.note, 200, 'INPUT_INVALID', 'note');
      if (!nt.ok) return nt;
      jg = jobGate(id.value, true);
      if (!jg.ok) return jg;
      if (sbmHas(X.decided, id.value)) return fail('DECISION_EXISTS');
      if (sbmHas(X.jobs, id.value) && X.jobs[id.value].length) return fail('NO_LEGACY_ADVANCE');
      typed = typedPaise(jg.job);
      if (typed <= 0) return fail('NO_LEGACY_ADVANCE');
      if (am.value !== typed) return fail('AMOUNT_MISMATCH', { expected: typed });
      pin = needPin(g);
      if (pin) return pin;
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      ref = sbmJobRef('LEGADV:', id.value);
      if (store.findRef('receipts', ref)) return fail('DECISION_EXISTS');
      pinAt = stampAt(ctx);
      warns = jg.warnings.slice();
      res = appendMoney({
        kind: 'SAR', series: 'SAR', ref: ref, sess: g.sess, clockOn: cf.on,
        body: function (c) {
          var b = { no: c.no, docDate: c.docDate, jobId: id.value, amountPaise: am.value, payMode: mode, payRef: '', note: nt.value, legacy: true };
          if (decision === 'IN_BOOK') b.inBook = true;
          return b;
        }
      });
      if (!res.ok) return res;
      return { ok: true, receipt: savedView(res.rec), warnings: warns.concat(res.storeWarnings), pinAt: pinAt };
    }

    // ------------------------------------------------------------ reads

    // The call context of a list read (q, ctx): the second argument when given, else a first argument that has a
    // `session` key. undefined = an internal read (bill layer, facade). ANY context that is given must carry a good
    // session: {} or null or a broken session is refused, never treated as internal.
    function pickCtx(a, b) {
      if (b !== undefined) return b;
      return sbmObj(a) && sbmHas(a, 'session') ? a : undefined;
    }
    function readGate(ctx, action) {
      var sess, rd;
      rd = ready();
      if (!rd.ok) return rd;
      if (ctx === undefined) return { ok: true };
      sess = sbmSession(ctx);
      if (!sess) return fail('SESSION_REQUIRED');
      rd = sbmRule(action, sess, roleConfig());
      return rd.ok ? { ok: true } : fail(rd.code);
    }

    function jobMoney(jobId, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS'), id, inv, fg, job, recs, i, out = { receipts: [], refunds: [] }, h;
      if (!gt.ok) return gt;
      id = readJobId(jobId);
      if (!id.ok) return id;
      inv = billOf(id.value);
      if (inv === undefined) return fail('DEPS_INVALID', 'docsView');
      fg = jobFigures(id.value, inv);
      recs = sbmHas(X.jobs, id.value) ? X.jobs[id.value] : [];
      for (i = 0; i < recs.length; i++) {
        if (recs[i].k === 'SRF') out.refunds.push(viewOf(recs[i]));
        else out.receipts.push(viewOf(recs[i]));
      }
      job = jobOf(id.value);
      h = store.head('receipts');
      return {
        ok: true, rev: h && h.ok === true ? h.rev : X.rev,
        receivedPaise: fg.receivedPaise, refundedPaise: fg.refundedPaise, netPaise: fg.netPaise,
        outstandingPaise: fg.outstandingPaise, refundablePaise: fg.refundablePaise,
        receipts: out.receipts, refunds: out.refunds, hasLive: fg.hasLive,
        legacyTypedPaise: typedPaise(job), legacyDecided: sbmHas(X.decided, id.value)
      };
    }

    // Money of one counter sale. `reversible` is the answer the sale reversal needs (plan 2.10, AM-2): true only when
    // the sale holds no money (no receipt, or its receipt reversed, or refunded in full).
    function saleMoney(saleNo, ctx) {
      var rd = readGate(ctx, 'VIEW_AMOUNTS'), s, net;
      if (!rd.ok) return rd;
      s = sums(sbmHas(X.sales, saleNo) ? X.sales[saleNo] : null);
      net = s.received - s.refunded;
      return {
        ok: true, receivedPaise: s.received, refundedPaise: s.refunded, netPaise: net, hasLive: s.hasLive, reversible: net === 0,
        receiptNo: sbmHas(X.sales, saleNo) ? X.sales[saleNo][0].b.no : ''
      };
    }

    function receiptView(no, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS');
      if (!gt.ok) return gt;
      if (typeof no !== 'string' || !sbmHas(X.byNo, no)) return fail('RECEIPT_NOT_FOUND');
      return { ok: true, receipt: viewOf(X.byNo[no]) };
    }

    function listReceipts(filter, ctx) {
      var gt = readGate(pickCtx(filter, ctx), 'VIEW_AMOUNTS'), f = sbmObj(filter) && !sbmHas(filter, 'session') ? filter : {}, out = [], i, r, b;
      if (!gt.ok) return gt;
      for (i = 0; i < X.recs.length; i++) {
        r = X.recs[i];
        if (r.k === 'RRV') continue;
        b = r.b;
        if (f.date !== undefined && b.docDate !== f.date) continue;
        if (f.jobId !== undefined && b.jobId !== f.jobId) continue;
        if (f.saleNo !== undefined && b.saleNo !== f.saleNo) continue;
        out.push(viewOf(r));
      }
      return { ok: true, receipts: out };
    }

    function hasLiveReceipt(jobId) {
      var recs, i;
      // Cannot answer: say yes, so a caller that guards a delete or a void stays on the safe side.
      if (!ready().ok) return true;
      recs = typeof jobId === 'string' && sbmHas(X.jobs, jobId) ? X.jobs[jobId] : [];
      for (i = 0; i < recs.length; i++) if (recs[i].k !== 'SRF' && isLive(recs[i])) return true;
      return false;
    }

    function zeroModes() { return { Cash: 0, UPI: 0, Card: 0, Bank: 0, total: 0 }; }
    function addMode(o, rec) {
      var m = normalizePayMode(rec.b.payMode);
      o[m] += rec.b.amountPaise;
      o.total += rec.b.amountPaise;
    }

    function daySummary(date, ctx) {
      var gt = readGate(ctx, 'VIEW_SUMMARY'), out, i, r, b, held, inv, cn;
      if (!gt.ok) return gt;
      if (!sbmDateOk(date)) return fail('INPUT_INVALID', { field: 'date' });
      out = {
        ok: true, date: date, receipts: zeroModes(), refunds: zeroModes(), netCash: 0, netAll: 0,
        advancesTaken: { count: 0, paise: 0 }, balanceReceipts: { count: 0, paise: 0 }, counterReceipts: { count: 0, paise: 0 },
        reversed: { count: 0, paise: 0 },
        // bill figures come from the bill layer; without it they are marked not available, never shown as zero
        invoicesIssued: { available: false, count: null, paise: null, cancelled: null },
        creditNotes: { available: false, count: null, paise: null },
        notAvailable: [],
        advancesHeldNow: { count: 0, paise: 0 }
      };
      for (i = 0; i < X.recs.length; i++) {
        r = X.recs[i];
        b = r.b;
        if (r.k === 'RRV' || b.docDate !== date) continue;
        if (b.inBook === true) continue;
        if (!isLive(r)) {
          out.reversed.count += 1;
          out.reversed.paise += b.amountPaise;
          continue;
        }
        if (r.k === 'SRF') {
          addMode(out.refunds, r);
          continue;
        }
        addMode(out.receipts, r);
        if (r.k === 'SAR') {
          out.advancesTaken.count += 1;
          out.advancesTaken.paise += b.amountPaise;
        } else if (typeof b.saleNo === 'string' && b.saleNo) {
          out.counterReceipts.count += 1;
          out.counterReceipts.paise += b.amountPaise;
        } else {
          out.balanceReceipts.count += 1;
          out.balanceReceipts.paise += b.amountPaise;
        }
      }
      out.netCash = out.receipts.Cash - out.refunds.Cash;
      out.netAll = out.receipts.total - out.refunds.total;
      inv = typeof view.invoicesOn === 'function' ? fromView('invoicesOn', date) : undefined;
      if (sbmObj(inv) && sbmCount(inv.count) && sbmCount(inv.paise) && sbmCount(inv.cancelled)) {
        out.invoicesIssued = { available: true, count: inv.count, paise: inv.paise, cancelled: inv.cancelled };
      } else out.notAvailable.push('invoicesIssued');
      cn = typeof view.creditNotesOn === 'function' ? fromView('creditNotesOn', date) : undefined;
      if (sbmObj(cn) && sbmCount(cn.count) && sbmCount(cn.paise)) {
        out.creditNotes = { available: true, count: cn.count, paise: cn.paise };
      } else out.notAvailable.push('creditNotes');
      held = heldList();
      if (!held.ok) return held;
      out.advancesHeldNow = { count: held.rows.length, paise: held.totalPaise };
      return out;
    }

    function jobStateOf(job, jobId, inv) {
      var vd;
      if (!job) return 'NOT_FOUND';
      vd = jobIsVoid(job, jobId);
      if (vd === undefined) return 'UNKNOWN';
      if (vd) return 'VOID';
      if (inv && inv.status === 'CANCELLED') return 'INVOICE_CANCELLED';
      if (job.status === 'closed') return 'CLOSED_NO_INVOICE';
      return 'OPEN';
    }
    function heldList() {
      var ids = Object.keys(X.jobs), rows = [], total = 0, i, j, id, inv, fg, recs, nos, oldest, job, st, ageDays, tn, d0;
      tn = sbmDayNumber(today());
      for (i = 0; i < ids.length; i++) {
        id = ids[i];
        inv = billOf(id);
        if (inv === undefined) return fail('DEPS_INVALID', 'docsView');
        if (inv && inv.status === 'ISSUED') continue;
        fg = jobFigures(id, inv);
        if (fg.netPaise <= 0) continue;
        recs = X.jobs[id];
        nos = [];
        oldest = '';
        for (j = 0; j < recs.length; j++) {
          if (recs[j].k === 'SRF' || !isLive(recs[j])) continue;
          nos.push(recs[j].b.no);
          if (!oldest || recs[j].b.docDate < oldest) oldest = recs[j].b.docDate;
        }
        job = jobOf(id);
        st = jobStateOf(job, id, inv);
        d0 = sbmDayNumber(oldest);
        ageDays = isFinite(tn) && isFinite(d0) ? sbmMax0(tn - d0) : 0;
        rows.push({ jobId: id, netPaise: fg.netPaise, receipts: nos, oldestDocDate: oldest, ageDays: ageDays, jobState: st, flag: st !== 'OPEN' });
        total += fg.netPaise;
      }
      rows.sort(function (a, b) {
        if (a.oldestDocDate !== b.oldestDocDate) return a.oldestDocDate < b.oldestDocDate ? -1 : 1;
        return a.jobId < b.jobId ? -1 : (a.jobId > b.jobId ? 1 : 0);
      });
      return { ok: true, rows: rows, totalPaise: total, count: rows.length };
    }
    function advancesHeld(a, b) {
      var gt = readGate(pickCtx(a, b), 'VIEW_SUMMARY');
      if (!gt.ok) return gt;
      return heldList();
    }

    function legacyAdvances(a, b) {
      var gt = readGate(pickCtx(a, b), 'VIEW_SUMMARY'), list, rows = [], total = 0, i, it, id, job, typed, recs, vd;
      if (!gt.ok) return gt;
      if (typeof cases.list !== 'function') return { ok: true, rows: [], totalPaise: 0, available: false };
      try { list = cases.list(); } catch (e) { return fail('DEPS_INVALID', 'cases'); }
      if (!sbmArr(list)) return fail('DEPS_INVALID', 'cases');
      for (i = 0; i < list.length; i++) {
        it = list[i];
        id = typeof it === 'string' ? it : (sbmObj(it) && typeof it.id === 'string' ? it.id : '');
        if (!id) continue;
        job = sbmObj(it) ? it : jobOf(id);
        if (!job || job.status === 'closed') continue;
        vd = jobIsVoid(job, id);
        if (vd === undefined) return fail('DEPS_INVALID', 'docsView');
        if (vd) continue;
        typed = typedPaise(job);
        if (typed <= 0) continue;
        recs = sbmHas(X.jobs, id) ? X.jobs[id] : null;
        if (recs && recs.length) continue;
        rows.push({
          jobId: id, typedPaise: typed, typedText: typeof job.advancePaid === 'string' ? job.advancePaid : paiseToRupeesText(typed), state: 'OPEN'
        });
        total += typed;
      }
      return { ok: true, rows: rows, totalPaise: total, available: true };
    }

    function unreceiptedCounterSales(a, b) {
      var gt = readGate(pickCtx(a, b), 'VIEW_SUMMARY'), list, rows = [], total = 0, i, s, had, sm;
      if (!gt.ok) return gt;
      list = fromView('counterSalesOpen', undefined);
      if (list === undefined || !sbmArr(list)) return fail('DEPS_INVALID', 'docsView');
      for (i = 0; i < list.length; i++) {
        s = list[i];
        if (!sbmObj(s) || typeof s.no !== 'string') continue;
        had = sbmHas(X.sales, s.no);
        sm = sums(had ? X.sales[s.no] : null);
        if (sm.hasLive) continue;
        // A live sale whose receipt was reversed keeps showing: its goods are out and no money is held for it.
        // It cannot take a second receipt (fixed reference); the sale itself must be reversed.
        rows.push({
          no: s.no, docDate: s.docDate, amountPaise: s.amountPaise,
          state: had ? 'RECEIPT_REVERSED' : 'NO_RECEIPT', receiptNo: had ? X.sales[s.no][0].b.no : ''
        });
        total += sbmInt(s.amountPaise) ? s.amountPaise : 0;
      }
      return { ok: true, rows: rows, totalPaise: total, count: rows.length };
    }

    api = {
      ready: ready,
      takeAdvance: takeAdvance,
      takeBalance: takeBalance,
      takeCounterReceipt: takeCounterReceipt,
      refund: refund,
      reverse: reverse,
      decideLegacyAdvance: decideLegacyAdvance,
      jobMoney: jobMoney,
      saleMoney: saleMoney,
      receiptView: receiptView,
      listReceipts: listReceipts,
      daySummary: daySummary,
      advancesHeld: advancesHeld,
      legacyAdvances: legacyAdvances,
      unreceiptedCounterSales: unreceiptedCounterSales,
      hasLiveReceipt: hasLiveReceipt,
      normalizePayMode: normalizePayMode,
      parsePaise: parsePaise,
      paiseToRupeesText: paiseToRupeesText
    };
    return { ok: true, api: Object.freeze(api) };
  }

  function sbmCheckDeps(deps) {
    var s, names, i, v;
    function bad(why) {
      return { ok: false, code: 'DEPS_INVALID', message: MESSAGES.DEPS_INVALID, detail: why };
    }
    if (!sbmObj(deps)) return bad('deps');
    s = deps.store;
    if (sbmObj(s) && sbmObj(s.store)) s = s.store;
    if (!s || typeof s !== 'object') return bad('store');
    names = ['open', 'read', 'append', 'findRef', 'head', 'nextAt', 'nextNumber'];
    for (i = 0; i < names.length; i++) if (typeof s[names[i]] !== 'function') return bad('store.' + names[i]);
    if (typeof deps.now !== 'function') return bad('now');
    if (!deps.cases || typeof deps.cases.get !== 'function') return bad('cases');
    v = deps.docsView;
    if (!v || typeof v !== 'object') return bad('docsView');
    names = ['invoiceForJob', 'creditNote', 'counterSale', 'counterSalesOpen', 'jobVoided'];
    for (i = 0; i < names.length; i++) if (typeof v[names[i]] !== 'function') return bad('docsView.' + names[i]);
    return { ok: true, store: s };
  }

  return Object.freeze({
    version: 1,
    CODES: CODES,
    MESSAGES: MESSAGES,
    KINDS: KINDS,
    PAY_MODES: Object.freeze(SBM_PAY_MODES.slice()),
    ROLE_ACTIONS: ROLE_ACTIONS,
    normalizePayMode: normalizePayMode,
    parsePaise: parsePaise,
    paiseToRupeesText: paiseToRupeesText,
    create: create
  });
});
