(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Service billing core facade (wave 2). One object for the screens and the page code.
  // It builds the bill layer and the money layer over the shared Stores store, hands the Stores core one billing port
  // (exactly once), and answers every read and write of the billing screens. It writes nothing itself: every write is
  // one call into the bill layer or the money layer, and from there one store append.
  // The sync checks (jobHasRecords, closeCheck, taxRoute, ...) return values and never throw. Any doubt is {ok:false}:
  // the caller must treat that as "blocked". Roles are decided by core.can and re-checked by the layers below.
  // The session and the Owner PIN time come only from the providers given at create: a made-up session or stamp is ignored.
  // No customer name, mobile or address is read, kept or returned here.

  var SBX_VERSION = 1;
  var SBX_STEP_UP_MS = 120000;
  var SBX_IST_MS = 19800000;
  var SBX_ROW_CAP = 5000;
  var SBX_PRINT_TYPES = [
    'serviceBillSummary', 'serviceTaxInvoiceV2', 'serviceCreditNote', 'serviceReceipt', 'serviceRefundVoucher',
    'serviceWarrantySheet', 'serviceUnbilledIssues', 'serviceDaySummary', 'serviceAdvancesHeld', 'serviceRevenue'
  ];
  var SBX_STATE_NAMES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
    '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
    '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
    '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
    '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
    '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Other Country'
  };
  var SBX_REASON_LABELS = { RETURN: 'Return of part', PRICE: 'Price correction', SERVICE: 'Refund', OTHER: 'Other' };
  var SBX_TEXT_KEYS = ['note', 'reason', 'evidence', 'takenByName', 'discountReason', 'approvalOverrideReason', 'notInCcptReason'];
  // A run of digits (spaces and dashes allowed) that reads as an Indian phone number: 10 digits from 6, or with 0 or 91 in front.
  function sbxHasPhone(t) {
    var runs, i, d;
    if (typeof t !== 'string') return false;
    runs = t.match(/\+?\d[\d -]{8,}\d/g) || [];
    for (i = 0; i < runs.length; i += 1) {
      d = runs[i].replace(/\D/g, '');
      if ((d.length === 10 && /^[6-9]/.test(d)) || (d.length === 11 && /^0[6-9]/.test(d)) || (d.length === 12 && /^91[6-9]/.test(d))) return true;
    }
    return false;
  }

  var SBX_ACTION_ALIAS = {
    VIEW: 'VIEW_AMOUNTS', CCPT_ADD: 'CCPT_LINK', DISCOUNT_WITHIN: 'DISCOUNT', CN_STOCK_LINK: 'CN_STOCK_RETURN',
    INV_NOT_IN_CCPT: 'INV_ISSUE_NOT_IN_CCPT', TAKE_RECEIPT: 'RECEIPT_TAKE',
    // the docs layer's own names (its ROLE_ACTIONS): one table, so both spellings give the same answer (plan 2.11)
    APPROVAL_OVERRIDE: 'INV_APPROVAL_OVERRIDE', DISCOUNT_ABOVE_LIMIT: 'DISCOUNT_ABOVE', NOT_IN_CCPT: 'INV_ISSUE_NOT_IN_CCPT', VIEW_REGISTERS: 'VIEW_SUMMARY'
  };

  var SBX_CODE_TABLE = [
    ['BCORE_ARGS_INVALID', 'The request was not complete. Nothing was changed.'],
    ['BCORE_LIBS_MISSING', 'Billing is not fully loaded on this device. Nothing was changed.'],
    ['BCORE_INTERNAL', 'Something went wrong inside Billing. Nothing was changed.'],
    ['SESSION_REQUIRED', 'Sign in again. Billing could not read who you are.'],
    ['NOT_ALLOWED', 'Your role cannot do this in Billing.'],
    ['PIN_REQUIRED', 'The Owner PIN check is needed for this.'],
    ['PAST_VIEW', 'You are looking at an earlier day. Nothing can be changed here.'],
    ['TEXT_HAS_PHONE', 'A phone number must not be typed here. Customer details stay on the job.'],
    ['BILLING_BLOCKED', 'The billing records failed their safety check. Nothing can be posted. Restore your latest backup.'],
    ['JOB_NOT_FOUND', 'The service job was not found.'],
    ['JOB_VOIDED', 'This job was voided.'],
    ['WRONG_DOC', 'This document is not of the kind asked for.'],
    ['PRINT_TYPE_UNKNOWN', 'That print type is not known.'],
    ['PRINT_ARGS_INVALID', 'Say which document to print.'],
    ['PRINT_NOT_FOUND', 'The document to print was not found.'],
    ['RECEIPT_REVERSED', 'This receipt was reversed. It cannot be printed.'],
    ['SALE_NOT_FOUND', 'The counter sale was not found.'],
    ['SALE_MONEY_UNKNOWN', 'The money of this sale could not be read. Nothing was changed.'],
    ['CREDIT_RETURN_INVALID', 'These parts cannot be returned against this credit note.'],
    ['REFUND_FIRST', 'Reverse or refund the money of this sale first.'],
    ['ABOVE_MANAGER_LIMIT', 'This discount is above what the Store Manager may give. Ask the Owner.'],
    ['DISCOUNT_NOT_ALLOWED', 'Staff cannot give a discount. Ask the Store Manager or the Owner.'],
    ['INVOICE_REQUIRED', 'A bill must be issued on this job first.'],
    ['RECEIPT_SET_OFF', 'This receipt is set off on a live bill. Cancel the bill first.'],
    ['RECEIPT_NOT_FOUND', 'The receipt was not found.']
  ];
  var SBX_CODES = {};
  var SBX_MESSAGES = {};
  (function sbxBuildTables() {
    var i;
    for (i = 0; i < SBX_CODE_TABLE.length; i += 1) {
      SBX_CODES[SBX_CODE_TABLE[i][0]] = SBX_CODE_TABLE[i][0];
      SBX_MESSAGES[SBX_CODE_TABLE[i][0]] = SBX_CODE_TABLE[i][1];
    }
  })();
  SBX_CODES = Object.freeze(SBX_CODES);
  SBX_MESSAGES = Object.freeze(SBX_MESSAGES);

  /* ---------------------------------------------------------------- small helpers */

  function sbxObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function sbxHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function sbxInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && Math.abs(v) <= 9007199254740991; }
  function sbxStr(v, max) {
    var s = typeof v === 'string' ? v : '';
    return max && s.length > max ? s.slice(0, max) : s;
  }
  function sbxArr(v) { return Array.isArray(v) ? v : []; }
  function sbxMsg(code) { return sbxHas(SBX_MESSAGES, code) ? SBX_MESSAGES[code] : ''; }
  function sbxFail(code, extra) {
    var out = { ok: false, code: code, message: sbxMsg(code) };
    var k;
    if (sbxObj(extra)) {
      for (k in extra) if (sbxHas(extra, k)) out[k] = extra[k];
    }
    return out;
  }
  // A failure from a lower layer goes on unchanged; only what it left out is added.
  function sbxPass(res, fallback) {
    var out = {};
    var k;
    if (!sbxObj(res)) return sbxFail(fallback || 'BCORE_INTERNAL');
    if (res.ok === true) return res;
    for (k in res) if (sbxHas(res, k)) out[k] = res[k];
    out.ok = false;
    if (typeof out.code !== 'string' || out.code === '') out.code = fallback || 'BCORE_INTERNAL';
    if (typeof out.message !== 'string') out.message = sbxMsg(out.code);
    return out;
  }
  function sbxCopy(v) {
    if (v === undefined) return undefined;
    return JSON.parse(JSON.stringify(v));
  }
  function sbxPad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function sbxSum(list, key) {
    var t = 0;
    var i;
    for (i = 0; i < list.length; i += 1) t += sbxInt(list[i][key]) ? list[i][key] : 0;
    return t;
  }
  function sbxIstDate(ms) { return new Date(ms + SBX_IST_MS).toISOString().slice(0, 10); }
  function sbxFyOf(ms) {
    var d = new Date(ms + SBX_IST_MS);
    var y = d.getUTCFullYear();
    var m = d.getUTCMonth() + 1;
    var start = m >= 4 ? y : y - 1;
    return start + '-' + sbxPad((start + 1) % 100, 2);
  }
  function sbxDateOk(s) {
    var d;
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    d = new Date(s + 'T00:00:00.000Z');
    return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function sbxRef(v) {
    return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{2,63}$/.test(v) ? v : '';
  }
  function sbxNewest(a, b) { return a < b ? 1 : (a > b ? -1 : 0); }
  // The first array found under one of the names (a lower layer may call its list rows, items or by its own name).
  function sbxRows(res, names) {
    var i;
    if (Array.isArray(res)) return res;
    if (!sbxObj(res)) return null;
    for (i = 0; i < names.length; i += 1) if (Array.isArray(res[names[i]])) return res[names[i]];
    return null;
  }
  function sbxMust(res, what) {
    if (!sbxObj(res) || res.ok === false) {
      throw new Error(what + ':' + (sbxObj(res) && typeof res.code === 'string' ? res.code : 'NO_ANSWER'));
    }
    return res;
  }

  /* ---------------------------------------------------------------- session, tier, roles */

  var SBX_NO_SESSION = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });

  function sbxOwnTrue(o, k) { return sbxHas(o, k) && o[k] === true; }
  function sbxOwnText(o, k, max) { return sbxHas(o, k) && typeof o[k] === 'string' ? o[k].slice(0, max) : ''; }
  // A plain copy of the session, read from OWN properties only.
  function sbxSession(raw) {
    try {
      if (!sbxObj(raw)) return SBX_NO_SESSION;
      return Object.freeze({
        ok: sbxOwnTrue(raw, 'ok'), isOwner: sbxOwnTrue(raw, 'isOwner'), isManager: sbxOwnTrue(raw, 'isManager'),
        role: sbxOwnText(raw, 'role', 40), tier: sbxHas(raw, 'tier') && typeof raw.tier === 'string' ? raw.tier : 'none',
        actorName: sbxOwnText(raw, 'actorName', 60)
      });
    } catch (e) {
      return SBX_NO_SESSION;
    }
  }
  // 'owner', 'manager', 'staff' or '' (broken). The tier must agree with the flags.
  function sbxTier(s) {
    if (!sbxObj(s) || s.ok !== true) return '';
    if (s.tier === 'owner') return s.isOwner === true ? 'owner' : '';
    if (s.tier === 'manager') return s.isManager === true && s.isOwner !== true ? 'manager' : '';
    if (s.tier === 'staff') return s.isOwner !== true && s.isManager !== true ? 'staff' : '';
    return '';
  }
  function sbxInList(list, role) {
    return Array.isArray(list) && role !== '' && list.indexOf(role) >= 0;
  }

  // The one role table (plan 2.11). cfg = {billingRoles, estimateRoles, storeRoles, discountLimitPaise}.
  function sbxRule(action, s, cfg) {
    var tier = sbxTier(s);
    var own = tier === 'owner';
    var mgr = tier === 'manager';
    var staff = tier === 'staff';
    var billing = staff && s.role !== 'Store Manager' && sbxInList(cfg.billingRoles, s.role);
    var estimate = staff && sbxInList(cfg.estimateRoles, s.role);
    var store = staff && sbxInList(cfg.storeRoles, s.role);
    var limit = sbxInt(cfg.discountLimitPaise) ? cfg.discountLimitPaise : 0;
    function yes(pin, extra) { return sbxMerge({ ok: true, needsPin: pin === true }, extra); }
    function no(code) { return { ok: false, needsPin: false, code: code || 'NOT_ALLOWED' }; }
    if (tier === '') return no('SESSION_REQUIRED');
    switch (action) {
      case 'VIEW_STATUS': return yes(false);
      case 'VIEW_AMOUNTS': return (own || mgr || billing) ? yes(false) : no();
      case 'VIEW_SUMMARY': return (own || mgr) ? yes(false) : no();
      case 'VIEW_COST': return (own || mgr) ? yes(false) : no();
      case 'EST_SAVE':
      case 'EST_APPROVE': return (own || mgr || billing || estimate) ? yes(false) : no();
      case 'EST_OTHER_LINE': return (own || mgr) ? yes(false) : no();
      case 'RECEIPT_TAKE':
      case 'INV_ISSUE':
      case 'CCPT_LINK': return (own || mgr || billing) ? yes(false) : no();
      case 'COUNTER_RECEIPT': return (own || mgr || billing || store) ? yes(false) : no();
      case 'CN_STOCK_RETURN': return (own || mgr || store) ? yes(false) : no();
      case 'REVERSE_RECEIPT': return (own || mgr) ? yes(false) : no();
      case 'NCS_ISSUE': return (own || mgr) ? yes(false) : no();
      case 'DISCOUNT':
        if (own) return yes(limit === 0);
        if (mgr) return limit > 0 ? yes(false, { limitPaise: limit }) : no('ABOVE_MANAGER_LIMIT');
        return no('DISCOUNT_NOT_ALLOWED');
      case 'DISCOUNT_ABOVE':
      case 'INV_APPROVAL_OVERRIDE':
      case 'INV_ISSUE_NOT_IN_CCPT':
      case 'CCPT_CHANGE':
      case 'INV_CANCEL':
      case 'CN_ISSUE':
      case 'REFUND':
      case 'REVERSE_REFUND':
      case 'NCS_CANCEL':
      case 'JOB_VOID':
      case 'DECIDE_LEGACY':
      case 'IMPORT_LEGACY':
      case 'BCFG_SET':
        return own ? yes(true) : no();
      default: return no('BCORE_ARGS_INVALID');
    }
  }
  function sbxMerge(a, b) {
    var k;
    if (b) {
      for (k in b) if (sbxHas(b, k)) a[k] = b[k];
    }
    return a;
  }

  /* ---------------------------------------------------------------- normalising what the bill layer returns */

  var SBX_MONEY_PORT_NAMES = [
    'ready', 'jobMoney', 'hasLiveReceipt', 'saleMoney', 'receiptView', 'listReceipts', 'legacyAdvances', 'advancesHeld',
    'unreceiptedCounterSales', 'normalizePayMode', 'parsePaise', 'paiseToRupeesText'
  ];

  function sbxNormInv(v) {
    var b = sbxObj(v.bill) ? v.bill : null;
    var t = b && sbxObj(b.totals) ? b.totals : null;
    var total = t ? t.totalPaise : v.totalPaise;
    var cancelled = v.state === 'CANCELLED' || v.status === 'CANCELLED' || sbxObj(v.cancel);
    if (typeof v.no !== 'string' || !sbxInt(total)) throw new Error('invoice shape');
    return {
      no: v.no, id: v.id, jobId: typeof v.jobId === 'string' ? v.jobId : '', status: cancelled ? 'CANCELLED' : 'ISSUED',
      totalPaise: total, creditedPaise: sbxInt(v.creditedPaise) && v.creditedPaise > 0 ? v.creditedPaise : 0,
      docDate: typeof v.docDate === 'string' ? v.docDate : '', mode: typeof v.mode === 'string' ? v.mode : '',
      ccptInvoiceNo: typeof v.ccptInvoiceNo === 'string' ? v.ccptInvoiceNo : '', view: v
    };
  }
  function sbxNormCn(v) {
    var c = sbxObj(v.credit) ? v.credit : null;
    var total = c && sbxInt(c.totalPaise) ? c.totalPaise : v.totalPaise;
    if (typeof v.no !== 'string' || !sbxInt(total)) throw new Error('credit note shape');
    return {
      no: v.no, jobId: typeof v.jobId === 'string' ? v.jobId : '', invoiceNo: typeof v.invoiceNo === 'string' ? v.invoiceNo : '',
      totalPaise: total, docDate: typeof v.docDate === 'string' ? v.docDate : '', mode: v.mode,
      reasonClass: typeof v.reasonClass === 'string' ? v.reasonClass : '', view: v
    };
  }
  function sbxIsNotFound(res) {
    return sbxObj(res) && res.ok === false && typeof res.code === 'string' && /NOT_FOUND$/.test(res.code);
  }
  function sbxBool(res, key, what) {
    if (typeof res === 'boolean') return res;
    if (sbxObj(res) && res.ok === true && typeof res[key] === 'boolean') return res[key];
    throw new Error(what + ': no clear answer');
  }
  function sbxCount(v) { return sbxInt(v) && v >= 0; }

  /* ---------------------------------------------------------------- create */

  function create(opts) {
    var shareH;
    var calc;
    var docsLib;
    var moneyLib;
    var migrateLib;
    var masters;
    var cases;
    var nowFn;
    var sessionFn = null;
    var stepFn = null;
    var pastFn = null;
    var docsApi;
    var moneyApi;
    var migApi = null;
    var docsOpened = false;
    var docsView;
    var moneyPort;
    var portTarget;
    var made;
    var core;

    if (!sbxObj(opts)) return sbxFail('BCORE_ARGS_INVALID');
    shareH = opts.share;
    if (!sbxObj(shareH) || !sbxObj(shareH.store) || !sbxObj(shareH.docs) || typeof shareH.ready !== 'function' || typeof shareH.setBillingPort !== 'function' || typeof shareH.store.status !== 'function') {
      return sbxFail('BCORE_ARGS_INVALID', { detail: 'share' });
    }
    calc = opts.calc;
    docsLib = opts.docsLib;
    moneyLib = opts.moneyLib;
    migrateLib = opts.migrateLib;
    masters = opts.masters;
    if (!calc || typeof calc.computeBill !== 'function') return sbxFail('BCORE_LIBS_MISSING', { detail: 'calc' });
    if (!docsLib || typeof docsLib.create !== 'function') return sbxFail('BCORE_LIBS_MISSING', { detail: 'docs' });
    if (!moneyLib || typeof moneyLib.create !== 'function') return sbxFail('BCORE_LIBS_MISSING', { detail: 'money' });
    if (!masters) return sbxFail('BCORE_LIBS_MISSING', { detail: 'masters' });
    cases = opts.cases;
    if (!sbxObj(cases) || typeof cases.get !== 'function') return sbxFail('BCORE_ARGS_INVALID', { detail: 'cases' });
    nowFn = opts.now;
    if (typeof nowFn !== 'function') return sbxFail('BCORE_ARGS_INVALID', { detail: 'now' });
    if (opts.session !== undefined && opts.session !== null) {
      if (typeof opts.session !== 'function') return sbxFail('BCORE_ARGS_INVALID', { detail: 'session' });
      sessionFn = opts.session;
    }
    if (opts.stepUpAt !== undefined && opts.stepUpAt !== null) {
      if (typeof opts.stepUpAt !== 'function') return sbxFail('BCORE_ARGS_INVALID', { detail: 'stepUpAt' });
      stepFn = opts.stepUpAt;
    }
    // The page's view date: in a past-date view every write is refused here and below (docs, money and migration get pastView).
    if (opts.pastView !== undefined && opts.pastView !== null) {
      if (typeof opts.pastView !== 'function') return sbxFail('BCORE_ARGS_INVALID', { detail: 'pastView' });
      pastFn = opts.pastView;
    }

    /* ------------------------------------------------------------ clock, session, step-up */

    function nowMs() {
      var v = nowFn();
      var ms = v && typeof v.getTime === 'function' ? v.getTime() : v;
      if (typeof ms !== 'number' || !isFinite(ms)) throw new Error('clock');
      return ms;
    }
    function today() { return sbxIstDate(nowMs()); }
    // The provider is the only source when it is given; ctx.session is then ignored.
    function who(ctx) {
      if (sessionFn) return sbxSession(sessionFn());
      return sbxSession(sbxObj(ctx) ? ctx.session : null);
    }
    // The PIN stamp: with a provider the caller's stamp only says "this call wants the PIN"; the time is the provider's.
    function stepFor(ctx) {
      var s = sbxObj(ctx) && sbxObj(ctx.stepUp) ? ctx.stepUp : null;
      var at;
      var diff;
      if (!s || s.ok !== true) return null;
      if (stepFn) {
        at = stepFn();
      } else {
        at = s.at;
      }
      if (!sbxInt(at) || at <= 0) return null;
      diff = nowMs() - at;
      return diff >= 0 && diff <= SBX_STEP_UP_MS ? { ok: true, at: at } : null;
    }
    function lowCtx(ctx, session) {
      var out = {
        session: session, stepUp: stepFor(ctx), clientRef: sbxObj(ctx) ? sbxRef(ctx.clientRef) : '', now: nowFn
      };
      if (sbxObj(ctx) && ctx.clockOverride === true) out.clockOverride = true;
      if (pastView(ctx)) out.pastView = true;
      return out;
    }
    function pastView(ctx) {
      var p;
      if (pastFn) {
        try { p = pastFn(); } catch (e) { return true; }
        if (p !== false) return true;
      }
      if (!sbxObj(ctx)) return false;
      if (ctx.pastView === true) return true;
      return typeof ctx.viewDate === 'string' && ctx.viewDate !== today();
    }

    /* ------------------------------------------------------------ reads of the bill layer (internal form) */

    // A read of the bill layer. With a gate answer `g` the user's context goes down (AM-5: a screen read is never internal);
    // without one this is an internal read for a yes/no check that returns no amount to any screen.
    function dint(name, a, g) {
      var f = docsApi[name];
      if (typeof f !== 'function') throw new Error('docs.' + name);
      return g ? f.call(docsApi, a, g.ctx) : f.call(docsApi, a);
    }
    // Legacy (old imported) bills are not v2 bills: they never count as the active bill of a job.
    function invoicesOf(jobId, g) {
      var r = sbxMust(dint('listInvoices', { jobId: jobId }, g), 'listInvoices');
      var rows = sbxRows(r, ['invoices', 'rows', 'items', 'list']);
      var out = [];
      var j;
      if (!rows) throw new Error('listInvoices: no rows');
      for (j = 0; j < rows.length; j += 1) {
        if (sbxObj(rows[j]) && rows[j].jobId === jobId && rows[j].legacy !== true) out.push(sbxNormInv(rows[j]));
      }
      return out;
    }
    function activeOf(list) {
      var j;
      for (j = list.length - 1; j >= 0; j -= 1) if (list[j].status === 'ISSUED') return list[j];
      return null;
    }
    // Credit notes of this job that still have pieces to put back in stock (empty for a role that may not see the register).
    function pendingOf(jobId, g) {
      var r = docsApi.pendingCreditReturns(g.ctx);
      return sbxObj(r) && r.ok === true ? sbxCopy(sbxArr(r.rows).filter(function (x) { return sbxObj(x) && x.jobId === jobId; })) : [];
    }
    function creditsOf(invoiceNo, g) {
      var r = sbxMust(dint('listCreditNotes', { invoiceNo: invoiceNo }, g), 'listCreditNotes');
      var rows = sbxRows(r, ['creditNotes', 'notes', 'rows', 'items', 'list']);
      var out = [];
      var j;
      if (!rows) throw new Error('listCreditNotes: no rows');
      for (j = 0; j < rows.length; j += 1) if (sbxObj(rows[j])) out.push(sbxNormCn(rows[j]));
      return out;
    }
    // The bill layer answers `estimate: {state}` and `sheet` (the ACTIVE no-charge sheet or null; with amounts hidden only {id, state}).
    function jobBilling(jobId, g) {
      var r = sbxMust(dint('jobBilling', jobId, g), 'jobBilling');
      var sheet = sbxObj(r.sheet) ? r.sheet : null;
      var sheetOn = !!sheet && sheet.state !== 'CANCELLED' && !sbxObj(sheet.cancel);
      var est = sbxObj(r.estimate) && typeof r.estimate.state === 'string' ? r.estimate.state : '';
      return {
        raw: r, sheet: sheet, sheetOn: sheetOn, sheetId: sheetOn && typeof sheet.id === 'string' ? sheet.id : '',
        sheetDate: sheetOn && typeof sheet.docDate === 'string' ? sheet.docDate : '', estimateState: est
      };
    }
    function docsNewWay(jobId) { return sbxBool(dint('isNewWay', jobId), 'newWay', 'isNewWay'); }
    function docsVoided(jobId) { return sbxBool(dint('isVoided', jobId), 'voided', 'isVoided'); }
    function docsViewNow() {
      var v = docsApi.docsView();
      if (!sbxObj(v)) throw new Error('docsView');
      return v;
    }
    function moneyHasAny(jobId) {
      var jm = sbxMust(moneyApi.jobMoney(jobId), 'jobMoney');
      return sbxArr(jm.receipts).length > 0 || sbxArr(jm.refunds).length > 0;
    }

    // The read-only view of the bill layer that the money layer asks (plan 2.8). It is the bill layer's own view (docs.docsView()),
    // looked up at each call because the money layer is built before the bill layer. A thrown or unclear answer is "not known".
    docsView = {
      invoiceForJob: function (jobId) { return docsViewNow().invoiceForJob(jobId); },
      creditNote: function (cnNo) { return docsViewNow().creditNote(cnNo); },
      counterSale: function (saleNo) { return docsViewNow().counterSale(saleNo); },
      counterSalesOpen: function () { return docsViewNow().counterSalesOpen(); },
      isNewWay: function (jobId) { return docsViewNow().isNewWay(jobId); },
      jobVoided: function (jobId) { return docsViewNow().jobVoided(jobId); },
      invoicesOn: function (date) { return docsViewNow().invoicesOn(date); },
      creditNotesOn: function (date) { return docsViewNow().creditNotesOn(date); }
    };

    made = moneyLib.create({ store: shareH.store, now: nowFn, cases: cases, docsView: docsView, calc: calc });
    if (!sbxObj(made) || made.ok !== true || !sbxObj(made.api)) {
      return sbxFail('BCORE_INTERNAL', { detail: 'money', cause: sbxObj(made) && typeof made.code === 'string' ? made.code : '' });
    }
    moneyApi = made.api;

    moneyPort = {};
    (function sbxBuildPort() {
      var n;
      function one(name) {
        moneyPort[name] = function () { return moneyApi[name].apply(moneyApi, arguments); };
      }
      for (n = 0; n < SBX_MONEY_PORT_NAMES.length; n += 1) one(SBX_MONEY_PORT_NAMES[n]);
      moneyPort.stream = 'receipts';
    })();
    Object.freeze(moneyPort);

    made = docsLib.create({ store: shareH.store, calc: calc, masters: masters, stock: shareH.docs, money: moneyPort, cases: cases, now: nowFn });
    if (sbxObj(made) && made.ok === false) {
      return sbxFail('BCORE_INTERNAL', { detail: 'docs', cause: typeof made.code === 'string' ? made.code : '' });
    }
    docsApi = sbxObj(made) && sbxObj(made.api) ? made.api : made;
    if (!sbxObj(docsApi) || typeof docsApi.issueInvoice !== 'function') return sbxFail('BCORE_INTERNAL', { detail: 'docs' });

    if (migrateLib && typeof migrateLib.create === 'function') {
      made = migrateLib.create({
        docs: docsApi, cases: cases, now: nowFn, store: shareH.store,
        hashHex: typeof opts.hashHex === 'function' ? opts.hashHex : (sbxObj(opts.storeLib) ? opts.storeLib.sha256Hex : undefined),
        validateBody: typeof docsLib.validateLegacyBody === 'function' ? docsLib.validateLegacyBody : undefined
      });
      if (sbxObj(made) && made.ok !== false) migApi = sbxObj(made.api) ? made.api : made;
    }

    // The one billing port of the Stores core: set once, here. The bill layer owns the checks (credit returns, sale reversal);
    // this wrapper only makes sure that a throw or an unclear answer is a refusal, never a pass.
    portTarget = docsApi.billingPortTarget();
    if (!sbxObj(portTarget) || typeof portTarget.creditReturn !== 'function' || typeof portTarget.saleReversible !== 'function') {
      return sbxFail('BCORE_INTERNAL', { detail: 'billingPortTarget' });
    }
    made = shareH.setBillingPort(Object.freeze({
      creditReturn: function (jobId, creditNoteNo, lines) {
        var r;
        try {
          r = portTarget.creditReturn(jobId, creditNoteNo, lines);
          return sbxObj(r) ? r : { ok: false, code: 'CREDIT_RETURN_INVALID' };
        } catch (e) {
          return { ok: false, code: 'CREDIT_RETURN_INVALID' };
        }
      },
      saleReversible: function (saleNo) {
        var r;
        try {
          r = portTarget.saleReversible(saleNo);
          return sbxObj(r) && r.ok === true ? { ok: true } : (sbxObj(r) && typeof r.code === 'string' ? r : { ok: false, code: 'REFUND_FIRST' });
        } catch (e) {
          return { ok: false, code: 'SALE_MONEY_UNKNOWN' };
        }
      }
    }));
    if (!sbxObj(made) || made.ok !== true) return sbxFail('BCORE_INTERNAL', { detail: 'billingPort' });

    /* ------------------------------------------------------------ readiness, config, gates */

    // The Stores store is open and authoritative, and the bill layer index is built. Never throws.
    function ensure() {
      var rd;
      var o;
      var st;
      try {
        rd = shareH.ready();
        if (!sbxObj(rd) || rd.ok !== true) return sbxPass(rd, 'BILLING_BLOCKED');
        // The Stores core answers ok even when a stream is damaged. Any damage anywhere blocks billing: no figure is trusted.
        st = shareH.store.status();
        if (!sbxObj(st) || st.opened !== true || st.blocked === true) {
          return sbxFail('BILLING_BLOCKED', { detail: sbxObj(st) ? st.problems : undefined });
        }
        if (!docsOpened) {
          o = docsApi.open();
          if (!sbxObj(o) || o.ok === false || o.blocked === true) return sbxFail('BILLING_BLOCKED', { detail: sbxObj(o) ? o.problems : undefined });
          docsOpened = true;
        }
        st = typeof docsApi.status === 'function' ? docsApi.status() : null;
        if (sbxObj(st) && (st.blocked === true || st.ok === false)) return sbxFail('BILLING_BLOCKED', { detail: st.problems });
        return { ok: true };
      } catch (e) {
        return sbxFail('BCORE_INTERNAL');
      }
    }
    function nameList(v) {
      var out = [];
      var j;
      if (!Array.isArray(v)) return out;
      for (j = 0; j < v.length; j += 1) if (typeof v[j] === 'string' && v[j] !== '') out.push(v[j]);
      return out;
    }
    // The role lists and the discount limit as the bill layer and Stores hold them now. A list that cannot be read is empty (narrower).
    function cfgNow() {
      var c = { billingRoles: [], estimateRoles: [], storeRoles: [], discountLimitPaise: 0, ok: true };
      var d;
      var p;
      try {
        d = docsApi.config();
        if (sbxObj(d) && d.ok !== false) {
          c.billingRoles = nameList(d.billingRoles);
          c.estimateRoles = nameList(d.estimateRoles);
          c.discountLimitPaise = sbxInt(d.discountLimitPaise) && d.discountLimitPaise >= 0 ? d.discountLimitPaise : 0;
        } else {
          c.ok = false;
        }
      } catch (e) {
        c.ok = false;
      }
      try {
        p = shareH.docs.config();
        if (sbxObj(p) && p.ok !== false) c.storeRoles = nameList(p.storeRoles);
        else c.ok = false;
      } catch (e2) {
        c.ok = false;
      }
      return c;
    }
    // A session, then (for a write) the past-view rule, then the role table, then readiness. Returns the low-level ctx.
    function gate(ctx, o) {
      var s = who(ctx);
      var tier = sbxTier(s);
      var en;
      var r;
      var opt = o || {};
      if (tier === '') return sbxFail('SESSION_REQUIRED');
      if (opt.write === true && pastView(ctx)) return sbxFail('PAST_VIEW');
      en = ensure();
      if (en.ok !== true) return en;
      if (opt.action) {
        r = sbxRule(opt.action, s, cfgNow());
        if (r.ok !== true) return sbxFail(r.code);
      }
      return { ok: true, session: s, tier: tier, costOk: tier === 'owner' || tier === 'manager', ctx: lowCtx(ctx, s) };
    }
    function run(fn) {
      try {
        return fn();
      } catch (e) {
        return sbxFail('BCORE_INTERNAL', { detail: sbxStr(String(e && e.message), 120) });
      }
    }
    // One call into a lower layer after the gate.
    function via(layer, name, args, ctx, o) {
      var g = gate(ctx, o);
      var api = layer === 'money' ? moneyApi : docsApi;
      if (g.ok !== true) return g;
      if (typeof api[name] !== 'function') return sbxFail('BCORE_LIBS_MISSING', { detail: name });
      return sbxPass(api[name].apply(api, args.concat([g.ctx])), 'BCORE_INTERNAL');
    }

    /* ------------------------------------------------------------ status and rights */

    function fyNow() {
      try { return sbxFyOf(nowMs()); } catch (e) { return ''; }
    }
    function status() {
      var rd;
      var ds = null;
      var problems = [];
      var billingBlocked = false;
      var mr;
      var cfg;
      var blocked;
      var ss;
      try {
        rd = shareH.ready();
      } catch (e) {
        rd = null;
      }
      blocked = !sbxObj(rd) || rd.ok !== true;
      if (blocked) problems.push(sbxObj(rd) && typeof rd.code === 'string' ? rd.code : 'BCORE_INTERNAL');
      if (!blocked) {
        try {
          ss = shareH.store.status();
          if (!sbxObj(ss) || ss.opened !== true || ss.blocked === true) {
            blocked = true;
            problems.push(sbxObj(ss) && sbxArr(ss.problems).length && typeof ss.problems[0].code === 'string' ? ss.problems[0].code : 'BILLING_BLOCKED');
          }
        } catch (e0) {
          blocked = true;
          problems.push('BILLING_BLOCKED');
        }
      }
      if (!blocked) {
        try {
          if (!docsOpened) {
            ds = docsApi.open();
            if (sbxObj(ds) && ds.ok !== false && ds.blocked !== true) docsOpened = true;
          } else {
            ds = docsApi.status();
          }
          if (!sbxObj(ds) || ds.ok === false || ds.blocked === true) {
            billingBlocked = true;
            problems.push('BILLING_BLOCKED');
          }
        } catch (e2) {
          billingBlocked = true;
          problems.push('BILLING_BLOCKED');
        }
        try {
          mr = moneyApi.ready();
          if (!sbxObj(mr) || mr.ok !== true) {
            billingBlocked = true;
            problems.push(sbxObj(mr) && typeof mr.code === 'string' ? mr.code : 'BILLING_BLOCKED');
          }
        } catch (e3) {
          billingBlocked = true;
          problems.push('BILLING_BLOCKED');
        }
      }
      cfg = cfgNow();
      return {
        ok: true, ready: !blocked && !billingBlocked, blocked: blocked, billingBlocked: billingBlocked, problems: problems, fy: fyNow(),
        config: { discountLimitPaise: cfg.discountLimitPaise, billingRoles: cfg.billingRoles.slice(), estimateRoles: cfg.estimateRoles.slice() },
        integrity: { ok: !blocked && !billingBlocked, code: problems.length ? problems[0] : '' }
      };
    }
    // The authority for the screens. With a provider the session comes from it unless a session is asked about explicitly.
    function can(action, session) {
      var name = typeof action === 'string' ? action : '';
      var s;
      var r;
      try {
        if (name === '') return { ok: false, needsPin: false, code: 'BCORE_ARGS_INVALID' };
        if (sbxHas(SBX_ACTION_ALIAS, name)) name = SBX_ACTION_ALIAS[name];
        s = session === undefined ? who(undefined) : sbxSession(session);
        ensure();
        r = sbxRule(name, s, cfgNow());
        return r;
      } catch (e) {
        return { ok: false, needsPin: false, code: 'BCORE_INTERNAL' };
      }
    }

    /* ------------------------------------------------------------ one job */

    // Everything the card and the sync checks need, read internally. Throws when anything cannot be read.
    // With a gate answer `g` the reads carry the user's context (screen reads, AM-5); without one they are internal.
    function jobFacts(jobId, g) {
      var c = cases.get(jobId);
      var list;
      var jm;
      var jb;
      var voided;
      var newWay;
      if (!c) return null;
      list = invoicesOf(jobId, g);
      jb = jobBilling(jobId, g);
      voided = c.voided === true || docsVoided(jobId);
      jm = sbxMust(g ? moneyApi.jobMoney(jobId, g.ctx) : moneyApi.jobMoney(jobId), 'jobMoney');
      newWay = docsNewWay(jobId) || sbxArr(jm.receipts).length > 0 || sbxArr(jm.refunds).length > 0;
      return { c: c, list: list, act: activeOf(list), jb: jb, voided: voided, jm: jm, newWay: newWay };
    }
    function stateOf(f) {
      var es = f.jb.estimateState.toUpperCase();
      if (f.voided) return 'voided';
      if (f.jb.sheetOn) return 'no_charge';
      if (f.act) return sbxInt(f.jm.outstandingPaise) && f.jm.outstandingPaise === 0 ? 'paid' : 'billed';
      if (f.list.length) return 'cancelled';
      if (es === 'APPROVED') return 'approved';
      if (es !== '' && es !== 'NONE') return 'estimate';
      return 'none';
    }
    function undecidedAdvance(f) {
      return sbxInt(f.jm.legacyTypedPaise) && f.jm.legacyTypedPaise > 0 && sbxArr(f.jm.receipts).length === 0 && sbxArr(f.jm.refunds).length === 0;
    }
    function actionsFor(f, s, cfg, past, estimate) {
      var closed = f.c.status === 'closed';
      var base = f.voided ? 'JOB_VOIDED' : (past ? 'PAST_VIEW' : null);
      var td = today();
      var hasEst = !!estimate && estimate.state !== '' && estimate.state !== 'NONE';
      var out = {};
      function a(action, why) {
        var r = sbxRule(action, s, cfg);
        if (r.ok !== true) return r.code;
        if (base) return base;
        return why || true;
      }
      out.buildEstimate = a('EST_SAVE', closed ? 'JOB_CLOSED' : ((f.act || f.jb.sheetOn) ? 'JOB_LOCKED' : null));
      out.recordApproval = a('EST_APPROVE', !hasEst ? 'ESTIMATE_NOT_FOUND' : (estimate.state === 'APPROVED' ? 'ALREADY_APPROVED' : (closed ? 'JOB_CLOSED' : null)));
      out.takeAdvance = a('RECEIPT_TAKE', closed ? 'JOB_CLOSED' : (f.act ? 'INVOICE_EXISTS_USE_BALANCE' : (undecidedAdvance(f) ? 'LEGACY_ADVANCE_UNCONFIRMED' : null)));
      out.issueBill = a('INV_ISSUE', f.act ? 'INVOICE_ALREADY_ISSUED' : (f.jb.sheetOn ? 'JOB_LOCKED' : (f.c.paymentStatus === 'no_charge_warranty' ? 'NO_CHARGE_JOB' : (undecidedAdvance(f) ? 'LEGACY_ADVANCE_UNCONFIRMED' : ((closed && !f.newWay) ? 'JOB_CLOSED_OLD_WAY' : null)))));
      out.takeBalance = a('RECEIPT_TAKE', !f.act ? 'INVOICE_REQUIRED' : (f.jm.outstandingPaise > 0 ? null : 'NOTHING_DUE'));
      out.cancelBill = a('INV_CANCEL', !f.act ? 'INVOICE_REQUIRED' : (f.act.docDate !== td ? 'CANCEL_SAME_DAY_ONLY' : null));
      out.creditNote = a('CN_ISSUE', f.act ? null : 'INVOICE_REQUIRED');
      out.refundAdvance = a('REFUND', f.jm.refundablePaise > 0 ? null : 'REFUND_EXCEEDS_REFUNDABLE');
      out.voidJob = a('JOB_VOID', f.act ? 'VOID_INVOICE_ACTIVE' : (f.jb.sheetOn ? 'VOID_SHEET_ACTIVE' : (f.jm.netPaise > 0 ? 'VOID_MONEY_HELD' : (undecidedAdvance(f) ? 'LEGACY_ADVANCE_UNCONFIRMED' : null))));
      out.markNoCharge = a('NCS_ISSUE', f.c.paymentStatus !== 'no_charge_warranty' ? 'NOT_NO_CHARGE_JOB' : (f.jb.sheetOn ? 'SHEET_ALREADY_ISSUED' : (f.act ? 'JOB_LOCKED' : null)));
      out.cancelNoChargeSheet = a('NCS_CANCEL', !f.jb.sheetOn ? 'SHEET_REQUIRED' : (f.jb.sheetDate !== td ? 'CANCEL_SAME_DAY_ONLY' : null));
      out.markNotBilledCcpt = a('INV_ISSUE_NOT_IN_CCPT', f.act ? 'INVOICE_ALREADY_ISSUED' : null);
      out.addCcptNo = a('CCPT_LINK', !f.act ? 'INVOICE_REQUIRED' : (f.act.ccptInvoiceNo ? 'CCPT_ALREADY_SET' : null));
      out.changeCcptNo = a('CCPT_CHANGE', !f.act ? 'INVOICE_REQUIRED' : null);
      return out;
    }
    function approvalOf(ev) {
      var list = sbxArr(ev && ev.approvals);
      var a;
      if (!list.length) return null;
      a = list[list.length - 1];
      if (!sbxObj(a)) return null;
      return {
        at: typeof a.approvedAt === 'string' || sbxInt(a.approvedAt) ? a.approvedAt : (a.at || ''), via: a.method || a.via || '',
        by: sbxObj(a.takenBy) ? sbxStr(a.takenBy.name, 80) : sbxStr(a.takenBy, 80), amountPaise: sbxInt(a.amountPaise) ? a.amountPaise : 0,
        version: sbxInt(a.version) ? a.version : 0
      };
    }
    function getJob(jobId, ctx) {
      return run(function () {
        var g = gate(ctx);
        var f;
        var cfg;
        var ev = null;
        var est;
        var cns = [];
        var j;
        var seeAmounts;
        var job;
        var past;
        var k;
        if (g.ok !== true) return g;
        if (typeof jobId !== 'string' || jobId === '') return sbxFail('BCORE_ARGS_INVALID', { detail: 'jobId' });
        cfg = cfgNow();
        seeAmounts = sbxRule('VIEW_AMOUNTS', g.session, cfg).ok === true;
        f = jobFacts(jobId, seeAmounts ? g : null);
        if (!f) return sbxFail('JOB_NOT_FOUND');
        job = {
          jobId: jobId, state: stateOf(f), voided: f.voided,
          noCharge: { on: f.c.paymentStatus === 'no_charge_warranty' || f.jb.sheetOn, sheet: f.jb.sheetOn, id: f.jb.sheetId },
          notBilledInCcpt: { on: !!f.act && f.act.mode === 'NOT_IN_CCPT' }, amountsHidden: !seeAmounts
        };
        past = pastView(ctx);
        if (!seeAmounts) {
          // no amounts, but estimate staff still get their own buttons (plan 2.11: save an estimate, record an approval); every other
          // action answers its role refusal first, so nothing about money is said
          job.actions = actionsFor(f, g.session, cfg, past, { state: f.jb.estimateState.toUpperCase() });
          return { ok: true, job: job };
        }
        try {
          ev = dint('estimateView', jobId, g);
          if (!sbxObj(ev) || ev.ok === false) ev = null;
        } catch (e) {
          ev = null;
        }
        est = ev ? { state: typeof ev.state === 'string' ? ev.state.toUpperCase() : '', latest: ev.latest || null, approvedPaise: ev.approvedPaise } : null;
        job.estimate = ev ? { state: est.state, latest: sbxCopy(ev.latest) || null, versions: sbxArr(ev.versions).length, approvedPaise: sbxInt(ev.approvedPaise) ? ev.approvedPaise : 0 } : null;
        job.approval = approvalOf(ev);
        job.bill = f.act ? sbxCopy(f.act.view) : null;
        job.billNo = f.act ? f.act.no : '';
        job.ccptInvoiceNo = f.act ? f.act.ccptInvoiceNo : '';
        job.receipts = sbxCopy(sbxArr(f.jm.receipts));
        job.refunds = sbxCopy(sbxArr(f.jm.refunds));
        for (j = 0; j < f.list.length; j += 1) {
          cns = cns.concat(creditsOf(f.list[j].no, g));
        }
        job.creditNotes = [];
        for (k = 0; k < cns.length; k += 1) job.creditNotes.push(sbxCopy(cns[k].view));
        job.pendingReturns = cns.length ? pendingOf(jobId, g) : [];
        job.heldPaise = f.act ? 0 : (f.jm.netPaise > 0 ? f.jm.netPaise : 0);
        job.paidPaise = f.jm.netPaise;
        job.duePaise = f.act ? f.jm.outstandingPaise : 0;
        job.refundablePaise = f.jm.refundablePaise;
        job.legacyTypedPaise = f.jm.legacyTypedPaise;
        job.legacyDecided = f.jm.legacyDecided === true;
        job.actions = actionsFor(f, g.session, cfg, past, est);
        return { ok: true, job: job };
      });
    }

    /* ------------------------------------------------------------ sync checks (values, never throw, fail closed) */

    function quiet() {
      var en = ensure();
      return en.ok === true ? null : { ok: false, code: en.code };
    }
    // The page and the screens use this as the delete guard, so `has` means "records that block a delete" (plan 2.14): a bill, credit note,
    // sheet, approval, void or any money record. A job with only estimate drafts has `has:false` (it may be deleted) but `anyRecord:true`
    // (it is new way: it closes by the new rules). A doubt anywhere is {ok:false}: the caller must block.
    function jobHasRecords(jobId) {
      return run(function () {
        var d = blocksDelete(jobId);
        if (d.ok !== true) return d;
        return { ok: true, has: d.blocks, reasons: d.reasons, anyRecord: docsNewWay(jobId) || moneyHasAny(jobId) };
      });
    }
    function closeCheck(jobId) {
      return run(function () {
        var bad = quiet();
        var f;
        var due;
        if (bad) return bad;
        if (typeof jobId !== 'string' || jobId === '') return { ok: false, code: 'BCORE_ARGS_INVALID' };
        f = jobFacts(jobId);
        if (!f) return { ok: false, code: 'JOB_NOT_FOUND' };
        if (f.voided) return { ok: false, code: 'JOB_VOIDED' };
        if (!f.newWay) return { ok: true, legacy: true, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: false };
        if (f.jb.sheetOn) return { ok: true, legacy: false, mayClose: true, why: '', dueNowPaise: 0, billNo: '', noCharge: true };
        if (!f.act) {
          return { ok: true, legacy: false, mayClose: false, why: f.list.length ? 'BILL_CANCELLED' : 'NO_BILL', dueNowPaise: 0, billNo: '', noCharge: false };
        }
        due = f.jm.outstandingPaise;
        if (!sbxInt(due) || due < 0) return { ok: false, code: 'BCORE_INTERNAL' };
        return { ok: true, legacy: false, mayClose: due === 0, why: due === 0 ? '' : 'BALANCE_DUE', dueNowPaise: due, billNo: f.act.no, noCharge: false };
      });
    }
    function taxRoute(jobId) {
      return run(function () {
        var bad = quiet();
        var f;
        if (bad) return bad;
        if (typeof jobId !== 'string' || jobId === '') return { ok: false, code: 'BCORE_ARGS_INVALID' };
        f = jobFacts(jobId);
        if (!f) return { ok: false, code: 'JOB_NOT_FOUND' };
        if (f.voided) return { ok: false, code: 'JOB_VOIDED' };
        if (f.act) {
          if (f.act.mode === 'CCPT_BILLED') return { ok: true, route: 'summary' };
          if (f.act.mode === 'NOT_IN_CCPT') return { ok: true, route: 'tax_invoice' };
          return { ok: false, code: 'BCORE_INTERNAL' };
        }
        if (f.jb.sheetOn) return { ok: true, route: 'no_charge' };
        if (f.list.length === 0 && typeof f.c.invoiceNo === 'string' && f.c.invoiceNo !== '') return { ok: true, route: 'legacy' };
        if (f.c.status !== 'closed') return { ok: true, route: 'issue' };
        return { ok: true, route: f.newWay ? 'issue' : 'old_way_closed' };
      });
    }
    function activeInvoiceNo(jobId) {
      return run(function () {
        var bad = quiet();
        var act;
        if (bad) return bad;
        if (typeof jobId !== 'string' || jobId === '') return { ok: false, code: 'BCORE_ARGS_INVALID' };
        act = activeOf(invoicesOf(jobId));
        return { ok: true, no: act ? act.no : '' };
      });
    }
    function jobBilled(jobId) {
      var r = activeInvoiceNo(jobId);
      if (r.ok !== true) return r;
      return { ok: true, billed: r.no !== '', no: r.no };
    }
    function jobNoCharge(jobId) {
      return run(function () {
        var bad = quiet();
        if (bad) return bad;
        if (typeof jobId !== 'string' || jobId === '') return { ok: false, code: 'BCORE_ARGS_INVALID' };
        return { ok: true, noCharge: jobBilling(jobId).sheetOn };
      });
    }
    function allowsZeroFinal(jobId) {
      var r = jobNoCharge(jobId);
      if (r.ok !== true) return r;
      return { ok: true, allows: r.noCharge === true };
    }
    // The page delete guard: any record of this job in billing or money blocks the delete; a job with only estimate drafts does not.
    function blocksDelete(jobId) {
      return run(function () {
        var bad = quiet();
        var d;
        var blocks;
        var reasons = [];
        if (bad) return bad;
        if (typeof jobId !== 'string' || jobId === '') return { ok: false, code: 'BCORE_ARGS_INVALID' };
        d = dint('blocksDelete', jobId);
        if (!sbxObj(d) || d.ok !== true || typeof d.blocks !== 'boolean') return { ok: false, code: sbxObj(d) && typeof d.code === 'string' ? d.code : 'BCORE_INTERNAL' };
        blocks = d.blocks;
        if (Array.isArray(d.reasons)) reasons = d.reasons.slice();
        // the bill layer already names money; the facade adds its own reading as a second opinion (any doubt there throws and blocks)
        if (moneyHasAny(jobId)) {
          blocks = true;
          if (reasons.indexOf('MONEY') < 0) reasons.push('MONEY');
        }
        return { ok: true, blocks: blocks, reasons: reasons };
      });
    }

    /* ------------------------------------------------------------ estimate, approval, bill (writes go through the bill layer) */

    // Free text typed on a screen is stored with the record. A phone number in it would put a customer detail into the records (plan 2.2):
    // refused here, for every write, before any layer is asked. Names and addresses cannot be told from other words and are not checked.
    function needObj(d) {
      var i;
      if (!sbxObj(d)) return sbxFail('BCORE_ARGS_INVALID');
      for (i = 0; i < SBX_TEXT_KEYS.length; i += 1) if (sbxHasPhone(d[SBX_TEXT_KEYS[i]])) return sbxFail('TEXT_HAS_PHONE', { field: SBX_TEXT_KEYS[i] });
      return null;
    }
    function saveEstimate(d, ctx) {
      return run(function () {
        var j;
        var other = false;
        var bad = needObj(d);
        if (bad) return bad;
        for (j = 0; j < sbxArr(d.lines).length; j += 1) if (sbxObj(d.lines[j]) && String(d.lines[j].kind).toUpperCase() === 'OTHER') other = true;
        bad = other ? gate(ctx, { write: true, action: 'EST_OTHER_LINE' }) : null;
        if (bad && bad.ok !== true) return bad;
        return via('docs', 'saveEstimate', [d], ctx, { write: true, action: 'EST_SAVE' });
      });
    }
    function recordApproval(d, ctx) {
      return run(function () {
        return needObj(d) || via('docs', 'recordApproval', [d], ctx, { write: true, action: 'EST_APPROVE' });
      });
    }
    function estimateView(jobId, ctx) {
      return run(function () { return via('docs', 'estimateView', [jobId], ctx, { action: 'EST_SAVE' }); });
    }
    function prepareBill(jobId, ctx) {
      return run(function () { return via('docs', 'prepareInvoice', [jobId], ctx, { action: 'INV_ISSUE' }); });
    }
    function previewBill(d, ctx) {
      return run(function () { return needObj(d) || via('docs', 'previewInvoice', [d], ctx, { action: 'INV_ISSUE' }); });
    }
    function issueBill(d, ctx) {
      return run(function () {
        var g;
        var j;
        var disc = false;
        var bad = needObj(d);
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'INV_ISSUE' });
        if (g.ok !== true) return g;
        if (d.mode === 'NOT_IN_CCPT') {
          bad = sbxRule('INV_ISSUE_NOT_IN_CCPT', g.session, cfgNow());
          if (bad.ok !== true) return sbxFail(bad.code);
        }
        if (sbxInt(d.billDiscountPaise) && d.billDiscountPaise > 0) disc = true;
        for (j = 0; j < sbxArr(d.parts).length; j += 1) if (sbxObj(d.parts[j]) && sbxInt(d.parts[j].discountPaise) && d.parts[j].discountPaise > 0) disc = true;
        for (j = 0; j < sbxArr(d.labour).length; j += 1) if (sbxObj(d.labour[j]) && sbxInt(d.labour[j].discountPaise) && d.labour[j].discountPaise > 0) disc = true;
        for (j = 0; j < sbxArr(d.other).length; j += 1) {
          if (sbxObj(d.other[j]) && sbxInt(d.other[j].discountPaise) && d.other[j].discountPaise > 0) disc = true;
        }
        if (sbxArr(d.other).length) {
          bad = sbxRule('EST_OTHER_LINE', g.session, cfgNow());
          if (bad.ok !== true) return sbxFail(bad.code);
        }
        if (disc) {
          bad = sbxRule('DISCOUNT', g.session, cfgNow());
          if (bad.ok !== true) return sbxFail(bad.code);
        }
        return sbxPass(docsApi.issueInvoice(d, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function addCcptNumber(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        var cur;
        var r;
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'CCPT_LINK' });
        if (g.ok !== true) return g;
        cur = dint('getInvoice', d.invoiceNo);
        if (sbxObj(cur) && cur.ok === true) {
          cur = sbxObj(cur.invoice) ? cur.invoice : cur;
          if (typeof cur.ccptInvoiceNo === 'string' && cur.ccptInvoiceNo !== '') {
            r = sbxRule('CCPT_CHANGE', g.session, cfgNow());
            if (r.ok !== true) return sbxFail(r.code);
          }
        }
        return sbxPass(docsApi.linkCcptInvoice(d, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function cancelBill(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'INV_CANCEL' });
        if (g.ok !== true) return g;
        return sbxPass(docsApi.cancelInvoice(d.invoiceNo, d.reason, g.ctx), 'BCORE_INTERNAL');
      });
    }

    // The credit note first. A refund is asked for only when the note was made; if the refund fails the note stays and
    // the answer says "credit not refunded" (the money for it is still listed as refundable on the job).
    function issueCreditNote(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        var body = {};
        var k;
        var r1;
        var cn;
        var jobId;
        var rf;
        var r2;
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'CN_ISSUE' });
        if (g.ok !== true) return g;
        if (d.refund !== undefined && d.refund !== null && !sbxObj(d.refund)) return sbxFail('BCORE_ARGS_INVALID', { detail: 'refund' });
        for (k in d) if (sbxHas(d, k) && k !== 'refund') body[k] = d[k];
        r1 = sbxPass(docsApi.issueCreditNote(body, g.ctx), 'BCORE_INTERNAL');
        if (r1.ok !== true) return r1;
        if (!d.refund) return r1;
        cn = r1.creditNote || r1.note || {};
        jobId = typeof cn.jobId === 'string' ? cn.jobId : '';
        if (jobId === '' && typeof cn.invoiceNo === 'string') {
          rf = dint('getInvoice', cn.invoiceNo);
          jobId = sbxObj(rf) && rf.ok === true ? (sbxObj(rf.invoice) ? rf.invoice.jobId : rf.jobId) : '';
        }
        r2 = moneyApi.refund({
          jobId: jobId, amountPaise: d.refund.amountPaise, payMode: d.refund.payMode, payRef: d.refund.payRef,
          reason: typeof d.refund.reason === 'string' ? d.refund.reason : d.reason, cnNo: cn.no
        }, g.ctx);
        if (sbxObj(r2) && r2.ok === true) {
          r1.refund = r2.refund;
          r1.creditNotRefunded = false;
          return r1;
        }
        r1.refund = null;
        r1.creditNotRefunded = true;
        r1.refundFailed = sbxPass(r2, 'BCORE_INTERNAL');
        r1.warnings = sbxArr(r1.warnings).concat(['CREDIT_NOT_REFUNDED']);
        return r1;
      });
    }
    function issueNoChargeSheet(d, ctx) {
      return run(function () { return needObj(d) || via('docs', 'issueNoChargeSheet', [d], ctx, { write: true, action: 'NCS_ISSUE' }); });
    }
    function cancelNoChargeSheet(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'NCS_CANCEL' });
        if (g.ok !== true) return g;
        return sbxPass(docsApi.cancelNoChargeSheet(d.sheetId, d.reason, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function voidJob(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'JOB_VOID' });
        if (g.ok !== true) return g;
        return sbxPass(docsApi.voidJob(d.jobId, d.reason, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function setConfig(d, ctx) {
      return run(function () { return needObj(d) || via('docs', 'setBillingConfig', [d], ctx, { write: true, action: 'BCFG_SET' }); });
    }

    /* ------------------------------------------------------------ money (writes go through the money layer) */

    function takeReceipt(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        var no;
        var body;
        if (bad) return bad;
        if (d.kind !== 'advance' && d.kind !== 'balance') return sbxFail('BCORE_ARGS_INVALID', { detail: 'kind' });
        g = gate(ctx, { write: true, action: 'RECEIPT_TAKE' });
        if (g.ok !== true) return g;
        body = { jobId: d.jobId, amountPaise: d.amountPaise, payMode: d.payMode, payRef: d.payRef, note: d.note };
        if (d.kind === 'advance') return sbxPass(moneyApi.takeAdvance(body, g.ctx), 'BCORE_INTERNAL');
        no = typeof d.invoiceNo === 'string' && d.invoiceNo !== '' ? d.invoiceNo : '';
        if (no === '') {
          bad = activeOf(invoicesOf(typeof d.jobId === 'string' ? d.jobId : ''));
          no = bad ? bad.no : '';
        }
        if (no === '') return sbxFail('INVOICE_REQUIRED');
        body.invoiceNo = no;
        return sbxPass(moneyApi.takeBalance(body, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function takeCounterReceipt(d, ctx) {
      return run(function () { return needObj(d) || via('money', 'takeCounterReceipt', [d], ctx, { write: true, action: 'COUNTER_RECEIPT' }); });
    }
    function refund(d, ctx) {
      return run(function () { return needObj(d) || via('money', 'refund', [d], ctx, { write: true, action: 'REFUND' }); });
    }
    function reverseReceipt(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        var isRefund;
        var so;
        if (bad) return bad;
        g = gate(ctx, { write: true, action: 'REVERSE_RECEIPT' });
        if (g.ok !== true) return g;
        isRefund = typeof d.no === 'string' && d.no.slice(0, 3) === 'SRF';
        if (isRefund) {
          bad = sbxRule('REVERSE_REFUND', g.session, cfgNow());
          if (bad.ok !== true) return sbxFail(bad.code);
        }
        if (!isRefund) {
          so = docsApi.receiptSetOff(d.no);
          if (!sbxObj(so) || so.ok !== true || typeof so.setOff !== 'boolean') return sbxFail('BCORE_INTERNAL', { detail: 'receiptSetOff' });
          if (so.setOff) return sbxFail('RECEIPT_SET_OFF', { invoiceNo: so.invoiceNo });
        }
        return sbxPass(moneyApi.reverse(d, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function decideLegacyAdvance(d, ctx) {
      return run(function () { return needObj(d) || via('money', 'decideLegacyAdvance', [d], ctx, { write: true, action: 'DECIDE_LEGACY' }); });
    }

    // Reverse a counter sale that has money: the money first (same-day reversal, else a refund with the Owner PIN),
    // then the sale. If the sale step fails the money stays handled and the sale stays listed as "receipt reversed".
    function reverseSale(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        var sale;
        var sm;
        var rv;
        var rec;
        var step = null;
        var res;
        var moneyDone = false;
        if (bad) return bad;
        g = gate(ctx, { write: true });
        if (g.ok !== true) return g;
        if (typeof d.saleNo !== 'string' || d.saleNo === '') return sbxFail('BCORE_ARGS_INVALID', { detail: 'saleNo' });
        sale = docsView.counterSale(d.saleNo);
        if (!sale) return sbxFail('SALE_NOT_FOUND');
        sm = moneyApi.saleMoney(d.saleNo);
        if (!sbxObj(sm) || sm.ok !== true || !sbxInt(sm.netPaise)) return sbxFail('SALE_MONEY_UNKNOWN');
        if (sm.netPaise > 0) {
          rv = moneyApi.receiptView(sm.receiptNo);
          rec = sbxObj(rv) && rv.ok === true ? rv.receipt : null;
          if (!rec) return sbxFail('SALE_MONEY_UNKNOWN');
          if (rec.status === 'OK' && rec.docDate === today() && sm.refundedPaise === 0) {
            step = moneyApi.reverse({ no: sm.receiptNo, reason: d.reason }, g.ctx);
          } else {
            step = moneyApi.refund({ saleNo: d.saleNo, amountPaise: sm.netPaise, payMode: rec.payMode, payRef: '', reason: d.reason }, g.ctx);
          }
          if (!sbxObj(step) || step.ok !== true) {
            res = sbxPass(step, 'BCORE_INTERNAL');
            res.moneyHandled = false;
            return res;
          }
          moneyDone = true;
        }
        res = shareH.docs.reverseDoc(d.saleNo, d.reason, g.ctx);
        if (!sbxObj(res) || res.ok !== true) {
          res = sbxPass(res, 'BCORE_INTERNAL');
          res.moneyHandled = true;
          res.moneyReversed = moneyDone;
          return res;
        }
        res.moneyReversed = moneyDone;
        return res;
      });
    }

    /* ------------------------------------------------------------ lists and registers (the user's context goes down on every read) */

    function listVia(layer, name, q, ctx, action) {
      return run(function () {
        var g = gate(ctx, { action: action });
        var api = layer === 'money' ? moneyApi : docsApi;
        if (g.ok !== true) return g;
        if (typeof api[name] !== 'function') return sbxFail('BCORE_LIBS_MISSING', { detail: name });
        return sbxPass(api[name].call(api, q === undefined || q === null ? {} : q, g.ctx), 'BCORE_INTERNAL');
      });
    }
    // The day summary is the money layer's answer, unchanged: its `available` and `notAvailable` fields reach the screen.
    function daySummary(date, ctx) {
      return run(function () {
        var g = gate(ctx, { action: 'VIEW_SUMMARY' });
        if (g.ok !== true) return g;
        return sbxPass(moneyApi.daySummary(date, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function advancesHeld(q, ctx) { return listVia('money', 'advancesHeld', q, ctx, 'VIEW_SUMMARY'); }
    function legacyAdvances(ctx) { return listVia('money', 'legacyAdvances', {}, ctx, 'VIEW_SUMMARY'); }
    function unreceiptedCounterSales(ctx) { return listVia('money', 'unreceiptedCounterSales', {}, ctx, 'VIEW_SUMMARY'); }
    function listReceipts(q, ctx) { return listVia('money', 'listReceipts', q, ctx, 'VIEW_SUMMARY'); }
    function listBills(q, ctx) { return listVia('docs', 'listInvoices', q, ctx, 'VIEW_SUMMARY'); }
    function getBill(no, ctx) {
      return run(function () { return via('docs', 'getInvoice', [no], ctx, { action: 'VIEW_AMOUNTS' }); });
    }
    function unbilledIssues(q, ctx) {
      return run(function () {
        var g = gate(ctx, { action: 'VIEW_SUMMARY' });
        var r;
        var rows;
        var off;
        var lim;
        if (g.ok !== true) return g;
        r = sbxPass(docsApi.unbilledIssues(g.ctx), 'BCORE_INTERNAL');
        rows = r.ok === true ? sbxRows(r, ['rows', 'issues', 'items']) : null;
        if (rows && sbxObj(q)) {
          off = sbxInt(q.offset) && q.offset > 0 ? q.offset : 0;
          lim = sbxInt(q.limit) && q.limit > 0 ? q.limit : rows.length;
          r.total = rows.length;
          r.rows = rows.slice(off, off + lim);
        }
        return r;
      });
    }
    function pendingCcpt(ctx) {
      return run(function () { return via('docs', 'pendingCcpt', [], ctx, { action: 'VIEW_SUMMARY' }); });
    }
    function pendingCreditReturns(ctx) {
      return run(function () { return via('docs', 'pendingCreditReturns', [], ctx, { action: 'VIEW_SUMMARY' }); });
    }
    // Stage E (second round, A): put back in stock every piece a credit note still has to return, as ONE Phase 1 return naming the note
    // (one record, so it cannot half-succeed). The bill layer's port keeps the limits; until it is done the note stays listed as pending.
    function returnCreditedStock(d, ctx) {
      return run(function () {
        var bad = needObj(d);
        var g;
        var pr;
        var rows = [];
        var lines = [];
        var left;
        var take;
        var ids;
        var inv;
        var js;
        var out = {};
        var i;
        var j;
        var k;
        if (bad) return bad;
        if (typeof d.cnNo !== 'string' || d.cnNo === '') return sbxFail('BCORE_ARGS_INVALID', { detail: 'cnNo' });
        g = gate(ctx, { write: true, action: 'VIEW_SUMMARY' });
        if (g.ok !== true) return g;
        pr = sbxMust(docsApi.pendingCreditReturns(g.ctx), 'pendingCreditReturns');
        for (i = 0; i < sbxArr(pr.rows).length; i += 1) if (pr.rows[i].cnNo === d.cnNo) rows.push(pr.rows[i]);
        if (!rows.length) return sbxFail('CREDIT_RETURN_INVALID', { why: 'NOTHING_PENDING' });
        js = shareH.docs.jobStock(rows[0].jobId);
        if (!sbxObj(js) || js.ok !== true) return sbxPass(js, 'BCORE_INTERNAL');
        for (i = 0; i < sbxArr(js.issues).length; i += 1) out[js.issues[i].movementId] = js.issues[i].reversed ? 0 : js.issues[i].outstanding;
        for (i = 0; i < rows.length; i += 1) {
          inv = loadInvoice(rows[i].invoiceNo, g);
          ids = [];
          for (j = 0; inv && j < sbxArr(inv.stock).length; j += 1) {
            if (inv.stock[j].lineNo === rows[i].lineNo) for (k = 0; k < sbxArr(inv.stock[j].issues).length; k += 1) ids.push(inv.stock[j].issues[k].id);
          }
          left = rows[i].pendingQty;
          // the last issue first, so the pieces go back to the layers they left last
          for (k = ids.length - 1; k >= 0 && left > 0; k -= 1) {
            take = Math.min(left, sbxInt(out[ids[k]]) ? out[ids[k]] : 0);
            if (take > 0) {
              lines.push({ issueMovementId: ids[k], qty: take, returnReason: 'UNUSED' });
              out[ids[k]] -= take;
              left -= take;
            }
          }
          if (left > 0) return sbxFail('CREDIT_RETURN_INVALID', { why: 'NOT_ON_JOB', lineNo: rows[i].lineNo });
        }
        return sbxPass(shareH.docs.returnFromJob({ jobId: rows[0].jobId, creditNoteNo: d.cnNo, lines: lines, note: 'Back to stock under credit note ' + d.cnNo }, g.ctx), 'BCORE_INTERNAL');
      });
    }
    function repairLinks() {
      return run(function () {
        var bad = quiet();
        var r;
        if (bad) return bad;
        r = sbxPass(docsApi.repairLinks(), 'BCORE_INTERNAL');
        if (r.ok !== true) return r;
        if (!Array.isArray(r.links)) return sbxFail('BCORE_INTERNAL', { detail: 'repairLinks' });
        return { ok: true, rows: r.links.slice(), links: r.links.slice() };
      });
    }

    /* ------------------------------------------------------------ migration (Owner, PIN; the migration layer writes through the bill layer) */

    function migration(name, args, ctx, write) {
      return run(function () {
        var g = gate(ctx, { write: write, action: write ? 'IMPORT_LEGACY' : 'VIEW_SUMMARY' });
        var alt = name + 'Migration';
        var fn;
        if (g.ok !== true) return g;
        if (!migApi) return sbxFail('BCORE_LIBS_MISSING', { detail: 'migrate' });
        fn = typeof migApi[name] === 'function' ? name : alt;
        if (typeof migApi[fn] !== 'function') return sbxFail('BCORE_LIBS_MISSING', { detail: fn });
        return sbxPass(migApi[fn].apply(migApi, args.concat([g.ctx])), 'BCORE_INTERNAL');
      });
    }
    // Stage E round 2 (B): each skipped old job comes with the bring-in's own plain reason (a copy; the plan itself is not changed)
    function planMigration(ctx) {
      var r = migration('plan', [], ctx, false);
      var m = migrateLib && sbxObj(migrateLib.MESSAGES) ? migrateLib.MESSAGES : {};
      var out = {};
      var k;
      if (!sbxObj(r) || r.ok !== true) return r;
      for (k in r) if (sbxHas(r, k)) out[k] = r[k];
      out.skippedWhy = sbxArr(r.skipped).map(function (x) {
        return { jobId: sbxStr(x && x.jobId, 60), legacyNo: sbxStr(x && x.legacyNo, 40), code: sbxStr(x && x.code, 40), why: x && sbxHas(m, x.code) ? m[x.code] : '' };
      });
      return out;
    }
    function pendingMigration(ctx) { return migration('pending', [], ctx, false); }
    function runMigration(plan, ctx) { return migration('run', [plan], ctx, true); }

    /* ------------------------------------------------------------ print data (shapes of the report spec; the page adds billTo) */

    function istOfAt(at) {
      var ms = sbxInt(at) ? at : (typeof at === 'string' ? Date.parse(at) : NaN);
      return isFinite(ms) ? sbxIstDate(ms) : '';
    }
    function stateNameOf(code) { return sbxHas(SBX_STATE_NAMES, code) ? SBX_STATE_NAMES[code] : ''; }
    // The seller's block comes from the page glue (opts.firm, or cases.firm); this file has no source of its own for it.
    function firmOf() {
      var f = null;
      var out;
      try {
        if (typeof opts.firm === 'function') f = opts.firm();
        else if (typeof cases.firm === 'function') f = cases.firm();
      } catch (e) {
        f = null;
      }
      f = sbxObj(f) ? f : {};
      out = { name: sbxStr(f.name, 80), gstin: sbxStr(f.gstin, 15), address: sbxStr(f.address, 240), state: sbxStr(f.state, 40), stateCode: sbxStr(f.stateCode, 2) };
      if (out.stateCode === '' && /^\d{2}/.test(out.gstin)) out.stateCode = out.gstin.slice(0, 2);
      if (out.state === '') out.state = stateNameOf(out.stateCode);
      return out;
    }
    function watchOf(jobId) {
      var c = cases.get(jobId);
      return c && typeof c.label === 'string' ? sbxStr(c.label, 80) : '';
    }
    function unitOf(kind) { return kind === 'PART' ? 'Pcs' : 'Nos'; }
    function billedIn(v) { return v.mode === 'NOT_IN_CCPT' ? 'SAAGAR' : 'CCPT'; }
    function loadInvoice(no, g) {
      var r = dint('getInvoice', no, g);
      var v;
      if (sbxIsNotFound(r)) return null;
      sbxMust(r, 'getInvoice');
      v = sbxObj(r.invoice) ? r.invoice : r;
      sbxNormInv(v);
      return v;
    }
    function supplyOf(bill) {
      var s = sbxObj(bill.supply) ? bill.supply : {};
      var code = typeof s.placeOfSupplyStateCode === 'string' ? s.placeOfSupplyStateCode : '';
      // `supply` is the calc object (the report prints the place of supply from placeOfSupplyStateCode, never from the recipient field)
      return {
        supply: { type: s.type === 'INTER' ? 'INTER' : 'INTRA', placeOfSupplyStateCode: code }, placeOfSupplyState: stateNameOf(code), placeOfSupplyCode: code,
        recipientGstin: typeof s.recipientGstin === 'string' ? s.recipientGstin : '',
        recipientStateCode: sbxObj(bill.input) && typeof bill.input.recipientStateCode === 'string' ? bill.input.recipientStateCode : ''
      };
    }
    function liveReceipts(jm) {
      var out = [];
      var j;
      for (j = 0; j < jm.receipts.length; j += 1) if (jm.receipts[j].status === 'OK') out.push(jm.receipts[j]);
      return out;
    }
    function invoiceModel(v, g) {
      var bill = v.bill;
      var sp = supplyOf(bill);
      var jm = sbxMust(moneyApi.jobMoney(v.jobId, g.ctx), 'jobMoney');
      var lines = [];
      var adv = [];
      var rcp = [];
      var warr = [];
      var live = liveReceipts(jm);
      var set = sbxObj(v.setOff) ? v.setOff : { advancePaise: 0, receipts: [] };
      var j;
      var l;
      var rv;
      var cancelDate = '';
      for (j = 0; j < bill.lines.length; j += 1) {
        l = bill.lines[j];
        lines.push({
          kind: l.kind, partCode: l.code, desc: l.name, hsn: l.hsnSac, unit: unitOf(l.kind), qty: l.qty, unitPricePaise: l.unitPricePaise,
          priceBasis: l.priceBasis, discountPaise: l.listPaise - l.netPaise, taxablePaise: l.taxablePaise, rateBp: l.rateBp,
          cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise, igstPaise: l.igstPaise, totalPaise: l.totalPaise
        });
      }
      for (j = 0; j < sbxArr(set.receipts).length; j += 1) {
        rv = moneyApi.receiptView(set.receipts[j].no, g.ctx);
        adv.push({ receiptNo: set.receipts[j].no, date: sbxObj(rv) && rv.ok === true ? rv.receipt.docDate : '', amountPaise: set.receipts[j].amountPaise });
      }
      for (j = 0; j < live.length; j += 1) {
        if (live[j].kind === 'SAR' || live[j].invoiceNo === v.no) {
          rcp.push({
            receiptNo: live[j].no, receiptKind: live[j].kind === 'SAR' ? 'ADVANCE' : 'BALANCE', date: live[j].docDate,
            mode: live[j].payMode, amountPaise: live[j].amountPaise
          });
        }
      }
      for (j = 0; j < sbxArr(v.warranty).length; j += 1) warr.push({ partCode: v.warranty[j].code, desc: v.warranty[j].name, qty: v.warranty[j].qty });
      if (sbxObj(v.cancel)) cancelDate = typeof v.cancel.docDate === 'string' ? v.cancel.docDate : istOfAt(v.cancel.at);
      return {
        ok: true, kind: 'INVOICE',
        invoice: {
          v: 2, invoiceNo: v.no, invoiceDate: v.docDate, status: sbxObj(v.cancel) || v.state === 'CANCELLED' ? 'CANCELLED' : 'ISSUED',
          cancelledDate: cancelDate, jobId: v.jobId, billedIn: billedIn(v), ccptInvoiceNo: typeof v.ccptInvoiceNo === 'string' ? v.ccptInvoiceNo : '',
          ccptJobNo: '', rebuilt: false, supply: sp.supply, placeOfSupplyState: sp.placeOfSupplyState, placeOfSupplyCode: sp.placeOfSupplyCode,
          recipientGstin: sp.recipientGstin, recipientStateCode: sp.recipientStateCode,
          reverseCharge: false, firm: firmOf(), lines: lines, billDiscountPaise: bill.totals.billDiscountPaise,
          roundOffPaise: bill.totals.roundOffPaise, totalPaise: bill.totals.totalPaise, advances: adv,
          advanceSetOffPaise: sbxInt(set.advancePaise) ? set.advancePaise : 0, balancePaise: sbxInt(v.balanceDuePaise) ? v.balanceDuePaise : 0,
          warrantyTill: '', warrantyMonths: 0, warranty: warr
        },
        watch: watchOf(v.jobId), receipts: rcp
      };
    }
    function printInvoice(type, a, g) {
      var v;
      if (typeof a.invoiceNo !== 'string' || a.invoiceNo === '') return sbxFail('PRINT_ARGS_INVALID', { detail: 'invoiceNo' });
      v = loadInvoice(a.invoiceNo, g);
      if (!v) return sbxFail('PRINT_NOT_FOUND');
      // Stage E round 4 (D-perf-5): plan D1 gives each kind of job one document; the refusal names the right one
      if (type === 'serviceBillSummary' && v.mode !== 'CCPT_BILLED') return sbxFail('WRONG_DOC', { message: 'This job is not billed in CCPT. Open the Tax Invoice instead.' });
      if (type === 'serviceTaxInvoiceV2' && v.mode !== 'NOT_IN_CCPT') return sbxFail('WRONG_DOC', { message: 'This job is billed in CCPT. Open the Service bill summary instead.' });
      return { ok: true, svcData: invoiceModel(v, g) };
    }
    function printCredit(a, g) {
      var r;
      var v;
      var inv;
      var lines = [];
      var jm;
      var refund = null;
      var j;
      var l;
      var bl;
      var sp;
      var cr;
      var cnNo;
      // the screens say noteNo (the report spec's name); creditNoteNo is the older spelling
      cnNo = typeof a.noteNo === 'string' && a.noteNo !== '' ? a.noteNo : a.creditNoteNo;
      if (typeof cnNo !== 'string' || cnNo === '') return sbxFail('PRINT_ARGS_INVALID', { detail: 'noteNo' });
      r = dint('getCreditNote', cnNo, g);
      if (sbxIsNotFound(r)) return sbxFail('PRINT_NOT_FOUND');
      sbxMust(r, 'getCreditNote');
      v = r.creditNote || r.note || r;
      sbxNormCn(v);
      inv = loadInvoice(v.invoiceNo, g);
      if (!inv) return sbxFail('PRINT_NOT_FOUND');
      cr = v.credit;
      sp = supplyOf(inv.bill);
      for (j = 0; j < cr.lines.length; j += 1) {
        l = cr.lines[j];
        bl = inv.bill.lines[l.lineNo - 1];
        lines.push({
          kind: bl.kind, partCode: bl.code, desc: bl.name, hsn: bl.hsnSac, unit: unitOf(bl.kind), qty: l.qty, taxablePaise: l.taxablePaise,
          rateBp: bl.rateBp, cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise, igstPaise: l.igstPaise, totalPaise: l.totalPaise
        });
      }
      jm = sbxMust(moneyApi.jobMoney(inv.jobId, g.ctx), 'jobMoney');
      for (j = 0; j < jm.refunds.length; j += 1) {
        if (jm.refunds[j].cnNo === v.no && jm.refunds[j].status === 'OK' && !refund) {
          refund = { voucherNo: jm.refunds[j].no, date: jm.refunds[j].docDate, mode: jm.refunds[j].payMode, amountPaise: jm.refunds[j].amountPaise };
        }
      }
      return {
        ok: true,
        svcData: {
          ok: true, kind: 'CREDIT_NOTE',
          note: {
            noteNo: v.no, noteDate: v.docDate, invoiceNo: inv.no, invoiceDate: inv.docDate, billedIn: billedIn(inv),
            ccptInvoiceNo: typeof inv.ccptInvoiceNo === 'string' ? inv.ccptInvoiceNo : '', jobId: inv.jobId,
            reasonLabel: sbxHas(SBX_REASON_LABELS, v.reasonClass) ? SBX_REASON_LABELS[v.reasonClass] : 'Other', supply: sp.supply,
            placeOfSupplyState: sp.placeOfSupplyState, placeOfSupplyCode: sp.placeOfSupplyCode, recipientGstin: sp.recipientGstin,
            recipientStateCode: sp.recipientStateCode, firm: firmOf(), lines: lines,
            roundOffPaise: cr.roundOffPaise, totalPaise: cr.totalPaise, refund: refund
          }
        }
      };
    }
    function printReceipt(a, g) {
      var r;
      var rec;
      var kind;
      var out;
      var inv;
      var jm;
      var j;
      var before = 0;
      var credited = 0;
      var cv;
      var total;
      var sale;
      var items = [];
      if (typeof a.receiptNo !== 'string' || a.receiptNo === '') return sbxFail('PRINT_ARGS_INVALID', { detail: 'receiptNo' });
      r = moneyApi.receiptView(a.receiptNo, g.ctx);
      if (sbxObj(r) && r.ok === false && r.code === 'RECEIPT_NOT_FOUND') return sbxFail('PRINT_NOT_FOUND');
      sbxMust(r, 'receiptView');
      rec = r.receipt;
      if (rec.kind !== 'SAR' && rec.kind !== 'SRC') return sbxFail('WRONG_DOC');
      if (rec.status !== 'OK') return sbxFail('RECEIPT_REVERSED');
      kind = rec.kind === 'SAR' ? 'ADVANCE' : (typeof rec.saleNo === 'string' && rec.saleNo !== '' ? 'COUNTER' : 'BALANCE');
      out = {
        receiptNo: rec.no, receiptKind: kind, date: rec.docDate, mode: rec.payMode, ref: rec.payRef, amountPaise: rec.amountPaise,
        jobId: typeof rec.jobId === 'string' ? rec.jobId : '', receivedBy: rec.by && typeof rec.by.name === 'string' ? sbxStr(rec.by.name, 60) : '',
        watch: typeof rec.jobId === 'string' ? watchOf(rec.jobId) : ''
      };
      if (kind === 'BALANCE') {
        inv = loadInvoice(rec.invoiceNo, g);
        jm = sbxMust(moneyApi.jobMoney(rec.jobId, g.ctx), 'jobMoney');
        if (!inv) return sbxFail('PRINT_NOT_FOUND');
        for (j = 0; j < jm.receipts.length; j += 1) {
          if (jm.receipts[j].status === 'OK' && jm.receipts[j].n < rec.n) before += jm.receipts[j].amountPaise;
        }
        // Stage E (wiring row 17): money refunded and credit notes on this bill before this receipt lower the balance too
        for (j = 0; j < jm.refunds.length; j += 1) {
          if (jm.refunds[j].status === 'OK' && jm.refunds[j].n < rec.n) before -= jm.refunds[j].amountPaise;
        }
        before = Math.max(0, before);
        for (j = 0; j < sbxArr(inv.credits).length; j += 1) {
          cv = dint('getCreditNote', inv.credits[j].no, g);
          cv = sbxObj(cv) && cv.ok !== false ? (cv.creditNote || cv.note || cv) : null;
          if (cv && typeof cv.at === 'string' && cv.at < rec.at && sbxInt(inv.credits[j].totalPaise)) credited += inv.credits[j].totalPaise;
        }
        total = inv.bill.totals.totalPaise;
        out.invoiceNo = inv.no;
        out.billedIn = billedIn(inv);
        out.ccptInvoiceNo = typeof inv.ccptInvoiceNo === 'string' ? inv.ccptInvoiceNo : '';
        out.invoiceTotalPaise = total;
        out.paidEarlierPaise = before;
        out.creditedEarlierPaise = credited;
        out.balanceAfterPaise = Math.max(0, total - credited - before - rec.amountPaise);
      }
      if (kind === 'COUNTER') {
        sale = shareH.docs.getDoc(rec.saleNo);
        if (sbxObj(sale) && sale.ok === true) {
          for (j = 0; j < sbxArr(sale.doc.lines).length; j += 1) {
            items.push({ desc: partDesc(sale.doc.lines[j].partCode), qty: sale.doc.lines[j].qty, amountPaise: sale.doc.lines[j].amountPaise });
          }
        }
        out.items = items;
      }
      return { ok: true, svcData: { ok: true, kind: 'RECEIPT', receipt: out } };
    }
    function printRefund(a, g) {
      var r;
      var rec;
      if (typeof a.voucherNo !== 'string' || a.voucherNo === '') return sbxFail('PRINT_ARGS_INVALID', { detail: 'voucherNo' });
      r = moneyApi.receiptView(a.voucherNo, g.ctx);
      if (sbxObj(r) && r.ok === false && r.code === 'RECEIPT_NOT_FOUND') return sbxFail('PRINT_NOT_FOUND');
      sbxMust(r, 'receiptView');
      rec = r.receipt;
      if (rec.kind !== 'SRF') return sbxFail('WRONG_DOC');
      if (rec.status !== 'OK') return sbxFail('RECEIPT_REVERSED');
      return {
        ok: true,
        svcData: {
          ok: true, kind: 'REFUND',
          refund: {
            voucherNo: rec.no, date: rec.docDate, mode: rec.payMode, ref: rec.payRef, amountPaise: rec.amountPaise,
            jobId: typeof rec.jobId === 'string' ? rec.jobId : '', againstKind: typeof rec.cnNo === 'string' && rec.cnNo !== '' ? 'CREDIT_NOTE' : (typeof rec.saleNo === 'string' && rec.saleNo !== '' ? 'SALE' : 'ADVANCE'),
            againstNo: typeof rec.cnNo === 'string' && rec.cnNo !== '' ? rec.cnNo : (typeof rec.advanceNo === 'string' ? rec.advanceNo : (typeof rec.saleNo === 'string' ? rec.saleNo : '')),
            paidBy: rec.by && typeof rec.by.name === 'string' ? sbxStr(rec.by.name, 60) : ''
          }
        }
      };
    }
    function printSheet(a, g) {
      var jb;
      var sheet;
      var extra = null;
      var parts = [];
      var j;
      var f = firmOf();
      var out;
      var k;
      if (typeof a.jobId !== 'string' || a.jobId === '') return sbxFail('PRINT_ARGS_INVALID', { detail: 'jobId' });
      jb = jobBilling(a.jobId, g);
      if (!jb.sheetOn) return sbxFail('PRINT_NOT_FOUND');
      sheet = jb.sheet;
      for (j = 0; j < sbxArr(sheet.parts).length; j += 1) parts.push({ partCode: sheet.parts[j].code, desc: sheet.parts[j].name, qty: sheet.parts[j].qty });
      try {
        if (typeof cases.sheetFacts === 'function') extra = cases.sheetFacts(a.jobId);
      } catch (e) {
        extra = null;
      }
      out = {
        jobId: a.jobId, dateReceived: '', dateDelivered: '', watch: watchOf(a.jobId), refNo: '', serialNo: '', diagnosis: '', workDone: '',
        warrantyTill: '', advisor: '', technician: '', parts: parts
      };
      if (sbxObj(extra)) {
        for (k in out) if (sbxHas(out, k) && k !== 'parts' && k !== 'jobId' && typeof extra[k] === 'string') out[k] = extra[k];
      }
      return { ok: true, svcData: { ok: true, kind: 'WARRANTY_SHEET', sheet: out, firm: { name: f.name, address: f.address } } };
    }
    function allInvoices(g) {
      var r = sbxMust(docsApi.listInvoices({ limit: SBX_ROW_CAP }, g.ctx), 'listInvoices');
      var rows = sbxRows(r, ['invoices', 'rows', 'items', 'list']);
      var out = [];
      var j;
      if (!rows) throw new Error('listInvoices: no rows');
      for (j = 0; j < rows.length; j += 1) {
        sbxNormInv(rows[j]);
        out.push(rows[j]);
      }
      return out;
    }
    function allCredits(g) {
      var r = sbxMust(docsApi.listCreditNotes({}, g.ctx), 'listCreditNotes');
      var rows = sbxRows(r, ['creditNotes', 'notes', 'rows', 'items', 'list']);
      var out = [];
      var j;
      if (!rows) throw new Error('listCreditNotes: no rows');
      for (j = 0; j < rows.length; j += 1) {
        sbxNormCn(rows[j]);
        out.push(rows[j]);
      }
      return out;
    }
    function printDay(a, g) {
      var date = typeof a.date === 'string' ? a.date : today();
      var ds;
      var lr;
      var j;
      var rec;
      var receipts = [];
      var refunds = [];
      var invoices = [];
      var credits = [];
      var invList;
      var cnList;
      var notAvail = [];
      if (!sbxDateOk(date)) return sbxFail('PRINT_ARGS_INVALID', { detail: 'date' });
      ds = sbxMust(moneyApi.daySummary(date, g.ctx), 'daySummary');
      lr = sbxMust(moneyApi.listReceipts({ date: date }, g.ctx), 'listReceipts');
      for (j = 0; j < sbxArr(lr.receipts).length; j += 1) {
        rec = lr.receipts[j];
        if (rec.status !== 'OK' || rec.inBook === true) continue;
        if (rec.kind === 'SRF') {
          refunds.push({
            voucherNo: rec.no, mode: rec.payMode, amountPaise: rec.amountPaise,
            againstNo: typeof rec.cnNo === 'string' && rec.cnNo !== '' ? rec.cnNo : (rec.advanceNo || rec.saleNo || ''), jobId: rec.jobId || ''
          });
        } else {
          receipts.push({
            receiptNo: rec.no, receiptKind: rec.kind === 'SAR' ? 'ADVANCE' : (rec.saleNo ? 'COUNTER' : 'BALANCE'), mode: rec.payMode,
            amountPaise: rec.amountPaise, jobId: rec.jobId || ''
          });
        }
      }
      try {
        invList = allInvoices(g);
        for (j = 0; j < invList.length; j += 1) {
          if (invList[j].docDate === date) {
            invoices.push({
              invoiceNo: invList[j].no, billedIn: billedIn(invList[j]), status: sbxNormInv(invList[j]).status,
              totalPaise: invList[j].bill.totals.totalPaise, jobId: invList[j].jobId
            });
          }
        }
      } catch (e) {
        notAvail.push('invoices');
      }
      try {
        cnList = allCredits(g);
        for (j = 0; j < cnList.length; j += 1) {
          if (cnList[j].docDate === date) credits.push({ noteNo: cnList[j].no, invoiceNo: cnList[j].invoiceNo, totalPaise: sbxNormCn(cnList[j]).totalPaise });
        }
      } catch (e2) {
        notAvail.push('creditNotes');
      }
      return {
        ok: true,
        svcData: {
          ok: true, kind: 'DAY_SUMMARY', date: date, receipts: receipts, refunds: refunds, invoices: invoices, creditNotes: credits,
          // the money layer knows only what is held NOW, so a past day cannot show it: it says "not available" instead of a wrong figure
          advancesHeld: date === today() ? { available: true, count: ds.advancesHeldNow.count, totalPaise: ds.advancesHeldNow.paise } : { available: false, count: 0, totalPaise: 0 },
          netCashPaise: ds.netCash, netAllPaise: ds.netAll,
          invoicesIssued: ds.invoicesIssued, creditNoteFigures: ds.creditNotes, notAvailable: ds.notAvailable.concat(notAvail),
          invoicesListed: notAvail.indexOf('invoices') < 0, creditNotesListed: notAvail.indexOf('creditNotes') < 0,
          invoicesAvailable: ds.invoicesIssued.available === true && notAvail.indexOf('invoices') < 0,
          creditNotesAvailable: ds.creditNotes.available === true && notAvail.indexOf('creditNotes') < 0
        }
      };
    }
    // An old typed advance has no date of its own: the report needs one for the age. The page may give the day the job was received
    // (case field receivedOn, YYYY-MM-DD, never after today); otherwise today is used, which shows an age of 0 days (never a made-up past date).
    function legacyDate(c) {
      var d = sbxObj(c) && typeof c.receivedOn === 'string' ? c.receivedOn : '';
      return sbxDateOk(d) && d <= today() ? d : today();
    }
    function printHeld(g) {
      var h = sbxMust(moneyApi.advancesHeld({}, g.ctx), 'advancesHeld');
      var lg = sbxMust(moneyApi.legacyAdvances({}, g.ctx), 'legacyAdvances');
      var rows = [];
      var j;
      var r;
      var rv;
      var c;
      for (j = 0; j < sbxArr(h.rows).length; j += 1) {
        r = h.rows[j];
        rv = r.receipts.length ? moneyApi.receiptView(r.receipts[0], g.ctx) : null;
        c = cases.get(r.jobId);
        rows.push({
          receiptNo: r.receipts.length ? r.receipts[0] : '', origin: 'RECEIPT', date: r.oldestDocDate, jobId: r.jobId, watch: watchOf(r.jobId),
          jobStatus: c && typeof c.status === 'string' ? c.status : '', mode: sbxObj(rv) && rv.ok === true ? rv.receipt.payMode : '', amountPaise: r.netPaise
        });
      }
      for (j = 0; j < sbxArr(lg.rows).length; j += 1) {
        r = lg.rows[j];
        c = cases.get(r.jobId);
        rows.push({
          receiptNo: '', origin: 'LEGACY', date: legacyDate(c), jobId: r.jobId, watch: watchOf(r.jobId), jobStatus: c && typeof c.status === 'string' ? c.status : '',
          mode: '', amountPaise: r.typedPaise
        });
      }
      return { ok: true, svcData: { ok: true, kind: 'ADVANCES_HELD', asOf: today(), rows: rows, legacyAvailable: lg.available !== false } };
    }
    // Description from the parts master, issue date from the Stores issue document; any row that cannot be read refuses the whole list.
    function partDesc(code) {
      var r = masters.getRow(shareH.store, 'part', code);
      return r && r.ok === true && sbxObj(r.row) && typeof r.row.name === 'string' && r.row.name !== '' ? sbxStr(r.row.name, 80) : code;
    }
    function printUnbilled(g) {
      var r = sbxMust(docsApi.unbilledIssues(g.ctx), 'unbilledIssues');
      var src = sbxRows(r, ['rows']);
      var rows = [];
      var j;
      var x;
      var row;
      var c;
      var doc;
      if (!src) throw new Error('unbilledIssues: no rows');
      for (j = 0; j < src.length; j += 1) {
        x = src[j];
        c = cases.get(x.jobId);
        doc = sbxMust(shareH.docs.getDoc(x.docNo), 'getDoc');
        if (!sbxObj(doc.doc) || !sbxDateOk(doc.doc.docDate)) throw new Error('issue date');
        row = {
          jobId: x.jobId, watch: watchOf(x.jobId), jobStatus: c && typeof c.status === 'string' ? c.status : '', partCode: x.partCode,
          desc: partDesc(x.partCode), qtyOpen: x.qty, issuedDate: doc.doc.docDate, outcome: x.billing === 'WARRANTY' ? 'WARRANTY' : 'OPEN'
        };
        if (g.costOk) {
          if (!sbxInt(x.costPaise) || x.costPaise < 0) throw new Error('cost');
          row.costPaise = x.costPaise;
        }
        rows.push(row);
      }
      return { ok: true, svcData: { ok: true, kind: 'UNBILLED_ISSUES', asOf: today(), costBasis: g.costOk ? 'EXCL_GST' : '', rows: rows } };
    }
    function groupLines(bill) {
      var out = [];
      var j;
      var k;
      var l;
      var hit;
      for (j = 0; j < bill.lines.length; j += 1) {
        l = bill.lines[j];
        hit = null;
        for (k = 0; k < out.length; k += 1) if (out[k].kind === l.kind && out[k].rateBp === l.rateBp) hit = out[k];
        if (!hit) {
          hit = { kind: l.kind, rateBp: l.rateBp, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
          out.push(hit);
        }
        hit.taxablePaise += l.taxablePaise;
        hit.cgstPaise += l.cgstPaise;
        hit.sgstPaise += l.sgstPaise;
        hit.igstPaise += l.igstPaise;
      }
      return out;
    }
    function printRevenue(a, g) {
      var from = typeof a.from === 'string' ? a.from : '';
      var to = typeof a.to === 'string' ? a.to : '';
      var invs;
      var cns;
      var outI = [];
      var outC = [];
      var byNo = {};
      var j;
      var v;
      var inv;
      var lines;
      var k;
      var cl;
      var bl;
      if (!sbxDateOk(from) || !sbxDateOk(to) || from > to) return sbxFail('PRINT_ARGS_INVALID', { detail: 'range' });
      invs = allInvoices(g);
      cns = allCredits(g);
      for (j = 0; j < invs.length; j += 1) {
        v = invs[j];
        byNo[v.no] = v;
        if (v.docDate >= from && v.docDate <= to) {
          outI.push({
            invoiceNo: v.no, date: v.docDate, status: sbxNormInv(v).status, billedIn: billedIn(v), roundOffPaise: v.bill.totals.roundOffPaise,
            lines: groupLines(v.bill)
          });
        }
      }
      for (j = 0; j < cns.length; j += 1) {
        v = cns[j];
        if (v.docDate < from || v.docDate > to) continue;
        inv = sbxHas(byNo, v.invoiceNo) ? byNo[v.invoiceNo] : null;
        if (!inv) throw new Error('credit note without its bill');
        lines = [];
        for (k = 0; k < v.credit.lines.length; k += 1) {
          cl = v.credit.lines[k];
          bl = inv.bill.lines[cl.lineNo - 1];
          lines.push({ kind: bl.kind, rateBp: bl.rateBp, taxablePaise: cl.taxablePaise, cgstPaise: cl.cgstPaise, sgstPaise: cl.sgstPaise, igstPaise: cl.igstPaise });
        }
        outC.push({ noteNo: v.no, date: v.docDate, invoiceNo: v.invoiceNo, billedIn: billedIn(inv), roundOffPaise: v.credit.roundOffPaise, lines: lines });
      }
      return { ok: true, svcData: { ok: true, kind: 'REVENUE', from: from, to: to, invoices: outI, creditNotes: outC } };
    }

    function printData(type, args, ctx) {
      return run(function () {
        var a = sbxObj(args) ? args : {};
        var action = 'VIEW_AMOUNTS';
        var g;
        if (SBX_PRINT_TYPES.indexOf(type) < 0) return sbxFail('PRINT_TYPE_UNKNOWN');
        if (type === 'serviceDaySummary' || type === 'serviceAdvancesHeld' || type === 'serviceRevenue' || type === 'serviceUnbilledIssues') action = 'VIEW_SUMMARY';
        g = gate(ctx, { action: action });
        if (g.ok !== true) return g;
        switch (type) {
          case 'serviceBillSummary':
          case 'serviceTaxInvoiceV2': return printInvoice(type, a, g);
          case 'serviceCreditNote': return printCredit(a, g);
          case 'serviceReceipt': return printReceipt(a, g);
          case 'serviceRefundVoucher': return printRefund(a, g);
          case 'serviceWarrantySheet': return printSheet(a, g);
          case 'serviceDaySummary': return printDay(a, g);
          case 'serviceAdvancesHeld': return printHeld(g);
          case 'serviceUnbilledIssues': return printUnbilled(g);
          default: return printRevenue(a, g);
        }
      });
    }

    core = {
      status: status, can: can, getJob: getJob,
      saveEstimate: saveEstimate, recordApproval: recordApproval, estimateView: estimateView, prepareBill: prepareBill, previewBill: previewBill,
      issueBill: issueBill, addCcptNumber: addCcptNumber, cancelBill: cancelBill, issueCreditNote: issueCreditNote,
      takeReceipt: takeReceipt, takeCounterReceipt: takeCounterReceipt, refund: refund, reverseReceipt: reverseReceipt, reverseSale: reverseSale,
      issueNoChargeSheet: issueNoChargeSheet, cancelNoChargeSheet: cancelNoChargeSheet, voidJob: voidJob, decideLegacyAdvance: decideLegacyAdvance,
      setConfig: setConfig, planMigration: planMigration, pendingMigration: pendingMigration, runMigration: runMigration,
      jobHasRecords: jobHasRecords, closeCheck: closeCheck, taxRoute: taxRoute, activeInvoiceNo: activeInvoiceNo, jobBilled: jobBilled,
      jobNoCharge: jobNoCharge, allowsZeroFinal: allowsZeroFinal, blocksDelete: blocksDelete,
      daySummary: daySummary, advancesHeld: advancesHeld, unbilledIssues: unbilledIssues, listBills: listBills, getBill: getBill,
      listReceipts: listReceipts, legacyAdvances: legacyAdvances, unreceiptedCounterSales: unreceiptedCounterSales, pendingCcpt: pendingCcpt,
      pendingCreditReturns: pendingCreditReturns, returnCreditedStock: returnCreditedStock, repairLinks: repairLinks, printData: printData
    };
    return { ok: true, core: Object.freeze(core) };
  }

  return Object.freeze({
    version: SBX_VERSION,
    CODES: SBX_CODES,
    MESSAGES: SBX_MESSAGES,
    PRINT_TYPES: Object.freeze(SBX_PRINT_TYPES.slice()),
    create: create
  });
});
