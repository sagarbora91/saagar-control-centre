(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceStoresDocs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Stock postings for the Service Stores (opening, goods receipt, issue and return to a job, counter sale,
  // adjustments with approval, reversal, old part register, scrap sign-off, Stores settings).
  // Pure: no screen, no timer, no clock of its own. The caller passes the store, the FIFO engine, the masters
  // layer, a clock and a job lookup. Every posting is ONE ledger record written by ONE store.append call.
  // Money is whole paise. Quantity is whole pieces. No customer data is ever stored here.

  var DCS_MAX_LINES = 100;
  var DCS_MAX_PIECES = 100000;
  var DCS_COST_CEILING = 100000000;
  var DCS_LIMIT_CEILING = 100000000;
  var DCS_PIN_FRESH_MS = 120000;
  var DCS_FIRST_INVOICE_DAY = '2020-01-01';
  var DCS_GENERIC_FAIL_TEXT = 'The store could not finish this. Nothing was posted.';

  function dcFreezeAll(o) {
    var keys, i;
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
    keys = Object.keys(o);
    for (i = 0; i < keys.length; i++) dcFreezeAll(o[keys[i]]);
    return Object.freeze(o);
  }

  var KINDS = dcFreezeAll({
    OPN: 'Opening stock', GRN: 'Goods receipt', ISS: 'Issue to job', RET: 'Return from job',
    CSL: 'Counter sale', ADJ: 'Adjustment', REV: 'Reversal', SCR: 'Scrap sign-off', OLD: 'Old part'
  });
  var STATES = dcFreezeAll({
    PROPOSED: 'Proposed', POSTED: 'Posted', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', REVERSED: 'Reversed'
  });
  var BILLING_MODES = dcFreezeAll({ CHARGEABLE: 'Chargeable', WARRANTY: 'Warranty' });
  var RETURN_REASONS = dcFreezeAll({ UNUSED: 'Unused', WRONG_PART: 'Wrong part', JOB_CANCELLED: 'Job cancelled' });
  var PAY_MODES = dcFreezeAll({ CASH: 'Cash', UPI: 'UPI', CARD: 'Card', OTHER: 'Other' });
  // sign: 1 = stock goes up, -1 = stock goes down, 0 = either. fifo = the FIFO engine reason code.
  var ADJ_REASONS = dcFreezeAll({
    FOUND: { label: 'Found', sign: 1, klass: 'CORRECTION', fifo: 'found' },
    COUNT_CORRECTION: { label: 'Count correction', sign: 0, klass: 'CORRECTION', fifo: 'count_correction' },
    WRONG_RECEIPT: { label: 'Wrong receipt', sign: 0, klass: 'CORRECTION', fifo: 'wrong_receipt' },
    DAMAGED: { label: 'Damaged', sign: -1, klass: 'WRITEOFF', fifo: 'damaged' },
    LOST: { label: 'Lost', sign: -1, klass: 'WRITEOFF', fifo: 'lost' },
    WRITE_OFF: { label: 'Write-off', sign: -1, klass: 'WRITEOFF', fifo: 'write_off' }
  });
  var OLD_STATES = dcFreezeAll({
    HELD_FOR_CLAIM: { label: 'Held for claim', bin: 'CLAIM' },
    CUSTOMER_RETURNED: { label: 'Customer Returned', bin: '' },
    SCRAP_PENDING: { label: 'Scrap pending Owner sign-off', bin: 'SCRAP' },
    SCRAPPED: { label: 'Scrapped', bin: '' }
  });
  var SHELL_ROLES = dcFreezeAll(['Store Manager', 'Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others']);
  var ACTIONS = dcFreezeAll([
    'VIEW', 'VIEW_COST', 'MASTERS_EDIT', 'MASTERS_REMOVE', 'OPENING_PROPOSE', 'OPENING_APPROVE', 'RECEIVE', 'ISSUE',
    'RETURN', 'NEGATIVE_OVERRIDE', 'COUNTER_SALE', 'ADJUST_PROPOSE', 'ADJUST_APPROVE', 'ADJUST_APPROVE_WRITEOFF',
    'PROPOSAL_REJECT', 'PROPOSAL_WITHDRAW', 'REVERSE_GRN', 'REVERSE_ADJUST', 'REVERSE_COUNTER_SALE',
    'REVERSE_OPENING', 'REVERSE_ISSUE', 'REVERSE_RETURN', 'OLD_REGISTER', 'OLD_MOVE', 'SCRAP_SIGNOFF', 'CONFIG_EDIT',
    'ACK_RESTORE', 'CLOCK_OVERRIDE'
  ]);
  // Names used by older drafts map to the canonical action above.
  var ACTION_ALIASES = dcFreezeAll({
    OPENING_REJECT: 'PROPOSAL_REJECT', ADJUST_REJECT: 'PROPOSAL_REJECT', OPENING_WITHDRAW: 'PROPOSAL_WITHDRAW',
    ADJUST_WITHDRAW: 'PROPOSAL_WITHDRAW', REVERSE_CSL: 'REVERSE_COUNTER_SALE', REVERSE_ADJ: 'REVERSE_ADJUST',
    SALE: 'COUNTER_SALE'
  });

  var MESSAGE_ROWS = [
    ['SESSION_REQUIRED', 'Sign in again. The store area could not read who you are.'],
    ['NOT_ALLOWED', 'Your role cannot do this in the store.'],
    ['PIN_REQUIRED', 'Owner PIN approval is needed for this.'],
    ['SELF_APPROVAL', 'You cannot approve a request you made yourself.'],
    ['APPROVER_NAME_REQUIRED', 'Sign in with your own staff name first. A Store Manager approval must show who approved it.'],
    ['PROPOSER_NAME_MISSING', 'This request was sent without a staff name, so only the Owner can approve it.'],
    ['WRITEOFF_OWNER_ONLY', 'Write-offs can only be approved by the Owner.'],
    ['ABOVE_MANAGER_LIMIT', 'This is above the Store Manager limit. The Owner must approve it.'],
    ['OVERRIDE_NOTE_REQUIRED', 'Write a note of at least 3 characters to explain the negative stock override.'],
    ['DEPS_INVALID', 'The store is not ready. Reopen the Service module.'],
    ['INPUT_INVALID', 'Some details are missing or not valid.'],
    ['BACKDATE_NOT_ALLOWED', 'Entries are always dated today.'],
    ['LINES_REQUIRED', 'Add at least one line.'],
    ['TOO_MANY_LINES', 'One posting can hold at most 100 lines.'],
    ['DUPLICATE_LINE', 'The same part appears twice. Combine the lines.'],
    ['PART_UNKNOWN', 'This part code is not in the parts master.'],
    ['PART_INACTIVE', 'This part is switched off in the parts master.'],
    ['QTY_INVALID', 'Quantity must be a whole number from 1 to 100000.'],
    ['COST_REQUIRED', 'Enter a unit cost above zero (without GST).'],
    ['UNIT_PRICE_INVALID', 'Selling price must be zero or more.'],
    ['AMOUNT_MISMATCH', 'The amount does not match quantity times price.'],
    ['PAYMODE_INVALID', 'Choose Cash, UPI, Card or Other.'],
    ['SUPPLIER_INVOICE_REQUIRED', 'Enter the supplier invoice number.'],
    ['SUPPLIER_INVOICE_DATE_INVALID', 'The supplier invoice date is not valid.'],
    ['DUPLICATE_SUPPLIER_INVOICE', 'This supplier invoice was already received.'],
    ['JOB_NOT_FOUND', 'The service job was not found.'],
    ['JOB_CLOSED', 'This job is closed. Parts cannot be issued or returned on it.'],
    ['REASON_REQUIRED', 'Write a reason of at least 5 characters.'],
    ['REASON_INVALID', 'Choose a valid reason.'],
    ['REASON_SIGN_MISMATCH', 'This reason does not match increasing or decreasing stock.'],
    ['RETURN_REASON_INVALID', 'Choose why the part is being returned.'],
    ['DOC_NOT_FOUND', 'That posting was not found.'],
    ['STATE_INVALID', 'This entry is not in a state where this can be done.'],
    ['NOT_REVERSIBLE', 'This posting cannot be reversed. Use a return or an adjustment.'],
    ['REVERSAL_BLOCKED', 'Some of this stock has already been used, so it cannot be reversed.'],
    ['OPENING_ALREADY_SET', 'Opening stock was already set for this part. Use an adjustment.'],
    ['OPENING_PROPOSAL_OPEN', 'Another opening proposal already holds this part.'],
    ['PART_HAS_MOVEMENTS', 'This part already has stock movements. Opening stock cannot be set now.'],
    ['INSUFFICIENT_STOCK', 'There is not enough stock. Nothing was posted.'],
    ['ISSUE_LINE_NOT_FOUND', 'The issue line being returned was not found for this job.'],
    ['RETURN_EXCEEDS_ISSUE', 'More is being returned than was issued.'],
    ['OLD_NOT_FOUND', 'The old part entry was not found.'],
    ['OLD_TRANSITION_INVALID', 'An old part cannot move that way.'],
    ['OLD_NOTE_REQUIRED', 'Write a note of at least 5 characters.'],
    ['SIGNOFF_MONTH_OPEN', 'A month can be signed off only after it has ended.'],
    ['SIGNOFF_EMPTY', 'No old parts are waiting for sign-off.'],
    ['PAST_VIEW', 'Changes are not allowed while viewing a past date.'],
    ['INTERNAL_ERROR', 'Unexpected error. Nothing was recorded.'],
    ['JOB_IS_STUB', 'This job is a placeholder (stub). Check the job details later.'],
    ['NEGATIVE_OVERRIDE_USED', 'Stock went below zero by the Owner override.'],
    ['SVCS_BLOCKED', 'Stores data failed its safety check. Nothing can be posted. Restore your latest backup.'],
    ['SVCS_WRITE_FAILED', 'Could not confirm the save. Reopen Stores and check before posting again.'],
    ['SVCS_READBACK_MISMATCH', 'Could not confirm the save. Reopen Stores and check before posting again.'],
    ['SVCS_HEAD_WRITE_FAILED', 'Could not confirm the save. Reopen Stores and check before posting again.'],
    ['SVCS_REV_CONFLICT', 'Stores changed on another screen. Reload and try again.'],
    ['SVCS_SERIES_MISMATCH', 'The posting number changed. Reload and try again.'],
    ['SVCS_CLOCK_BACK', 'The tablet clock is earlier than the last posting. Fix the clock or ask the Owner.'],
    ['SVCS_DOC_TOO_LARGE', 'This posting is too large. Split it.'],
    ['SVCS_STORAGE_UNAVAILABLE', 'Storage is not ready yet. Wait a moment and try again.'],
    ['SVCS_DUPLICATE_REF', 'This was already saved. Check the list before posting again.']
  ];
  var CODES = {};
  var MESSAGES = {};
  (function () {
    var i;
    for (i = 0; i < MESSAGE_ROWS.length; i++) {
      CODES[MESSAGE_ROWS[i][0]] = MESSAGE_ROWS[i][0];
      MESSAGES[MESSAGE_ROWS[i][0]] = MESSAGE_ROWS[i][1];
    }
  })();
  CODES = Object.freeze(CODES);
  MESSAGES = Object.freeze(MESSAGES);

  // Ledger record kind -> the one movement type(s) it may hold.
  var LEDGER_MOVES = {
    OPN: ['opening'], GRN: ['receipt'], ISS: ['issue_job'], RET: ['return_job'], CSL: ['counter_sale'],
    ADJ: ['adjust_up', 'adjust_down'], REV: ['reversal']
  };
  var NO_CONFIG = { adjustLimitPaise: 0, storeRoles: [] };

  // ---------------------------------------------------------------- small pure helpers

  function dcHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function dcIsObj(x) { return x !== null && typeof x === 'object' && Object.prototype.toString.call(x) === '[object Object]'; }
  function dcIsArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
  function dcIsInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && Math.abs(x) <= 9007199254740991; }
  function dcPad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function dcMap() { return Object.create(null); }
  // Views handed to callers are plain copies, so a caller cannot change the books held in memory.
  function dcCopy(v) { return v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function dcZero(x) { return x === 0 ? 0 : x; }

  // Free text: control characters and runs of spaces become one space, then trimmed. null = too long or not text.
  function dcText(v, max) {
    var s;
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') return null;
    s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    return s.length > max ? null : s;
  }
  function dcPiece(v) { return dcIsInt(v) && v >= 1 && v <= DCS_MAX_PIECES; }
  function dcCostOk(v) { return dcIsInt(v) && v >= 1 && v <= DCS_COST_CEILING; }

  function dcDateOk(s) {
    var m, d;
    if (typeof s !== 'string') return false;
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  // 'YYYY-MM-DD' stays as it is. An ISO instant becomes its India date (UTC+05:30, no daylight saving).
  function dcDateFrom(v) {
    var m, ms, d;
    if (typeof v !== 'string') return '';
    if (dcDateOk(v)) return v;
    m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(v);
    if (!m) return '';
    ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (!isFinite(ms)) return '';
    d = new Date(ms + 19800000);
    if (!isFinite(d.getTime())) return '';
    return dcPad(d.getUTCFullYear(), 4) + '-' + dcPad(d.getUTCMonth() + 1, 2) + '-' + dcPad(d.getUTCDate(), 2);
  }
  function financialYear(v) {
    var date = dcDateFrom(v), y;
    if (!date) return '';
    y = +date.slice(0, 4);
    if (+date.slice(5, 7) < 4) y -= 1;
    return dcPad(y, 4) + '-' + dcPad((y + 1) % 100, 2);
  }
  function dcFyShort(v) {
    var fy = financialYear(v);
    return fy ? fy.slice(2) : '';
  }
  function dcFyFromNo(no) {
    var m = /^[A-Z]{3}\/(\d{2})-(\d{2})\/\d+$/.exec(typeof no === 'string' ? no : '');
    return m ? '20' + m[1] + '-' + m[2] : '';
  }
  function dcFyArg(v) {
    var s = typeof v === 'string' ? v.replace(/^FY/i, '') : '';
    if (/^\d{2}-\d{2}$/.test(s)) return '20' + s;
    return /^\d{4}-\d{2}$/.test(s) ? s : '';
  }
  function dcNormSupplier(s) { return String(s).replace(/\s+/g, ' ').replace(/^ | $/g, '').toUpperCase(); }
  function dcNormInvoice(s) { return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, ''); }

  // The session is read fresh from ctx on every call and never kept.
  function dcSession(ctx) {
    var s, tier;
    try {
      s = dcIsObj(ctx) ? ctx.session : null;
      if (!dcIsObj(s) || s.ok !== true) return null;
      tier = s.tier;
      if (tier !== 'owner' && tier !== 'manager' && tier !== 'staff') return null;
      if (tier === 'owner' && s.isOwner !== true) return null;
      if (tier === 'manager' && (s.isManager !== true || s.isOwner === true)) return null;
      if (tier === 'staff' && (s.isOwner === true || s.isManager === true)) return null;
      return {
        tier: tier,
        owner: tier === 'owner',
        manager: tier === 'manager',
        role: typeof s.role === 'string' ? s.role.slice(0, 40) : '',
        name: typeof s.actorName === 'string' ? s.actorName.slice(0, 60) : ''
      };
    } catch (e) {
      // a session that cannot be read is a broken session: refused, never trusted
      return null;
    }
  }
  function dcActor(sess) { return { t: sess.tier, r: sess.role, m: sess.name }; }

  function dcCleanConfig(b) {
    var roles = [], i;
    if (!dcIsObj(b) || !dcIsInt(b.adjustLimitPaise) || b.adjustLimitPaise < 0 || b.adjustLimitPaise > DCS_LIMIT_CEILING) return null;
    if (!dcIsArr(b.storeRoles)) return null;
    for (i = 0; i < b.storeRoles.length; i++) {
      if (SHELL_ROLES.indexOf(b.storeRoles[i]) < 0 || roles.indexOf(b.storeRoles[i]) >= 0) return null;
      roles.push(b.storeRoles[i]);
    }
    return { adjustLimitPaise: b.adjustLimitPaise, storeRoles: roles };
  }

  // One table for who may do what (plan 2.10). cfg = effective Stores settings.
  function dcRule(action, sess, cfg) {
    var own = sess.owner, mgr = sess.manager;
    var storeClass = sess.tier === 'staff' && cfg.storeRoles.indexOf(sess.role) >= 0;
    var anyStore = own || mgr || storeClass;
    function yes(pin, extra) {
      var r = { ok: true, needsPin: pin === true };
      if (extra) r.note = extra;
      return r;
    }
    function no(code) { return { ok: false, needsPin: false, code: code }; }
    switch (action) {
      case 'VIEW': return yes(false);
      case 'VIEW_COST': return (own || mgr) ? yes(false) : no('NOT_ALLOWED');
      case 'MASTERS_EDIT': return (own || mgr) ? yes(false) : no('NOT_ALLOWED');
      case 'MASTERS_REMOVE': return own ? yes(true) : no('NOT_ALLOWED');
      case 'OPENING_PROPOSE': return anyStore ? yes(false) : no('NOT_ALLOWED');
      case 'OPENING_APPROVE': return own ? yes(true) : no('NOT_ALLOWED');
      case 'RECEIVE':
      case 'ISSUE':
      case 'RETURN':
      case 'COUNTER_SALE':
      case 'ADJUST_PROPOSE':
      case 'OLD_REGISTER':
        return anyStore ? yes(false) : no('NOT_ALLOWED');
      case 'NEGATIVE_OVERRIDE': return own ? yes(true) : no('NOT_ALLOWED');
      case 'ADJUST_APPROVE':
        if (own) return yes(true);
        if (mgr) return cfg.adjustLimitPaise > 0 ? yes(false, 'within-limit-only') : no('ABOVE_MANAGER_LIMIT');
        return no('NOT_ALLOWED');
      case 'ADJUST_APPROVE_WRITEOFF':
        if (own) return yes(true);
        return mgr ? no('WRITEOFF_OWNER_ONLY') : no('NOT_ALLOWED');
      case 'PROPOSAL_REJECT': return (own || mgr) ? yes(false) : no('NOT_ALLOWED');
      case 'PROPOSAL_WITHDRAW': return anyStore ? yes(false, 'proposer-or-owner') : no('NOT_ALLOWED');
      case 'REVERSE_GRN':
      case 'REVERSE_ADJUST':
        return own ? yes(true) : no('NOT_ALLOWED');
      case 'REVERSE_COUNTER_SALE':
        if (own) return yes(false, 'pin-if-not-same-day');
        return mgr ? yes(false, 'same-day-only') : no('NOT_ALLOWED');
      case 'REVERSE_OPENING':
      case 'REVERSE_ISSUE':
      case 'REVERSE_RETURN':
        return no('NOT_REVERSIBLE');
      case 'OLD_MOVE': return (own || mgr) ? yes(false) : no('NOT_ALLOWED');
      case 'SCRAP_SIGNOFF':
      case 'CONFIG_EDIT':
      case 'ACK_RESTORE':
      case 'CLOCK_OVERRIDE':
        return own ? yes(true) : no('NOT_ALLOWED');
      default: return no('INPUT_INVALID');
    }
  }

  // ---------------------------------------------------------------- the factory

  function create(deps) {
    var ck = dcCheckDeps(deps);
    var store, fifo, masters, cases, clockFn;
    var X = null;          // the adopted index (null until a clean open)
    var built = null;      // the index made by the last replay check
    var isOpen = false;
    var isBlocked = false;
    var lastProblems = [];
    var lastWatermark = '';
    var lastSummary = {};
    var api;

    if (!ck.ok) return ck;
    store = ck.store;
    fifo = deps.fifo;
    masters = deps.masters;
    cases = deps.cases;
    clockFn = deps.now;

    // ------------------------------------------------------------ results

    function fail(code, detail) {
      var r = { ok: false, code: code, message: dcHas(MESSAGES, code) ? MESSAGES[code] : DCS_GENERIC_FAIL_TEXT };
      if (detail !== undefined) r.detail = detail;
      return r;
    }
    function lowerMessage(code, res) {
      if (res && typeof res.message === 'string' && res.message) return res.message;
      if (dcHas(MESSAGES, code)) return MESSAGES[code];
      if (fifo.MESSAGES && dcHas(fifo.MESSAGES, code)) return fifo.MESSAGES[code];
      if (masters.MESSAGES && dcHas(masters.MESSAGES, code)) return masters.MESSAGES[code];
      return DCS_GENERIC_FAIL_TEXT;
    }
    // A failure from the store, the FIFO engine or the masters layer. Unknown codes pass through unchanged.
    function lowerFail(res, extraDetail) {
      var code = res && typeof res.code === 'string' ? res.code : 'SVCS_STORAGE_UNAVAILABLE';
      var out, keys, i, d;
      if (code === 'ROLE_DENIED') code = 'NOT_ALLOWED';
      else if (code === 'REAUTH_REQUIRED') code = 'PIN_REQUIRED';
      else if (code === 'SESSION_INVALID') code = 'SESSION_REQUIRED';
      else if (code === 'OPENING_EXISTS') code = 'OPENING_ALREADY_SET';
      else if (code === 'OPENING_AFTER_ACTIVITY') code = 'PART_HAS_MOVEMENTS';
      else if (code === 'ISSUE_NOT_FOUND' || code === 'ISSUE_NOT_JOB' || code === 'RETURN_JOB_MISMATCH' || code === 'PART_MISMATCH') code = 'ISSUE_LINE_NOT_FOUND';
      out = { ok: false, code: code, message: lowerMessage(code, code === (res && res.code) ? res : null) };
      if (res && res.detail !== undefined) out.detail = res.detail;
      if (res && res.committed === true) out.committed = true;
      if (res && typeof res.stream === 'string') out.stream = res.stream;
      if (res && typeof res.key === 'string') out.key = res.key;
      if (code === 'INSUFFICIENT_STOCK' && dcIsObj(res.detail)) {
        out.detail = { available: res.detail.available, requested: res.detail.requested, balance: res.detail.available, wanted: res.detail.requested };
      }
      if (code === 'RETURN_EXCEEDS_ISSUE' && dcIsObj(res.detail)) {
        out.detail = { remaining: res.detail.outstanding, outstanding: res.detail.outstanding };
      }
      if (dcIsObj(extraDetail)) {
        d = dcIsObj(out.detail) ? out.detail : {};
        keys = Object.keys(extraDetail);
        for (i = 0; i < keys.length; i++) d[keys[i]] = extraDetail[keys[i]];
        out.detail = d;
      }
      return out;
    }
    function lineFail(code, index, extra) {
      var d = { lineNo: index + 1 }, keys, i;
      if (dcIsObj(extra)) {
        keys = Object.keys(extra);
        for (i = 0; i < keys.length; i++) d[keys[i]] = extra[keys[i]];
      }
      return fail(code, d);
    }
    // A failure from a lookup, tagged with the line it belongs to. Keeps the code and message of the lookup.
    function lineWrap(res, index, extra) {
      var d = { lineNo: index + 1 }, keys, i;
      if (dcIsObj(res.detail)) {
        keys = Object.keys(res.detail);
        for (i = 0; i < keys.length; i++) d[keys[i]] = res.detail[keys[i]];
      }
      if (dcIsObj(extra)) {
        keys = Object.keys(extra);
        for (i = 0; i < keys.length; i++) d[keys[i]] = extra[keys[i]];
      }
      return { ok: false, code: res.code, message: res.message, detail: d };
    }
    function blockedFail() {
      var d = lastProblems.length ? String(lastProblems[0].code || '') : '';
      return fail('SVCS_BLOCKED', d || undefined);
    }

    // ------------------------------------------------------------ clock

    function nowDate() {
      var v;
      try { v = clockFn(); } catch (e) { return null; }
      if (v && typeof v.getTime === 'function' && isFinite(v.getTime())) return v;
      if (typeof v === 'number' && isFinite(v)) return new Date(v);
      if (typeof v === 'string' && isFinite(Date.parse(v))) return new Date(Date.parse(v));
      return null;
    }
    function nowIso() {
      var d = nowDate();
      return d ? d.toISOString() : '';
    }
    function today() { return dcDateFrom(nowIso()); }
    // A Step-up stamp made by the screen right after the Owner PIN. Valid for 120 seconds, never from the future.
    // stampAt answers the stamp time when the stamp is valid, else -1. Each field is read once.
    function stampAt(ctx) {
      var s = dcIsObj(ctx) ? ctx.stepUp : null;
      var d = nowDate();
      var diff, ok, at;
      if (!d || !dcIsObj(s)) return -1;
      ok = s.ok;
      at = s.at;
      if (ok !== true || !dcIsInt(at)) return -1;
      diff = d.getTime() - at;
      return diff >= 0 && diff <= DCS_PIN_FRESH_MS ? at : -1;
    }
    function stepUpOk(ctx) { return stampAt(ctx) >= 0; }

    // ------------------------------------------------------------ building the index from the store

    function newIndex() {
      return {
        moves: [], movById: dcMap(), moveRec: dcMap(), moved: dcMap(), hasOpening: dcMap(),
        reversedIds: dcMap(), retsOf: dcMap(), jobIssues: dcMap(), jobMoves: dcMap(),
        docs: dcMap(), byId: dcMap(), docList: [], revByNo: dcMap(), grnInv: dcMap(),
        props: dcMap(), propList: [], posts: [],
        old: dcMap(), oldList: [], signoffs: [],
        cfg: { adjustLimitPaise: 0, storeRoles: [] },
        revs: { ledger: 0, docs: 0, defective: 0, config: 0 },
        fifo: null
      };
    }
    function pushTo(map, key, value) {
      if (!dcHas(map, key)) map[key] = [];
      map[key].push(value);
    }

    // Reads one ledger record into the index. Returns '' when fine, else a short reason (the store then blocks).
    function ingestLedger(Y, rec) {
      var b = rec.b, kind = rec.k, i, m, orig, allowed, key, target, targetIds;
      if (!dcHas(LEDGER_MOVES, kind)) return 'unknown record kind';
      if (!dcIsObj(b) || !dcIsArr(b.lines) || !dcIsArr(b.mv) || b.mv.length < 1 || b.lines.length !== b.mv.length) return 'bad record shape';
      if (kind === 'REV') {
        // A reversal must undo exactly the movements of one earlier reversible posting, once.
        if (typeof b.reverses !== 'string') return 'bad reversal';
        target = dcHas(Y.docs, b.reverses) ? Y.docs[b.reverses] : null;
        if (!target || (target.k !== 'GRN' && target.k !== 'ADJ' && target.k !== 'CSL')) return 'reversal of a posting that cannot be reversed';
        if (dcHas(Y.revByNo, b.reverses)) return 'posting reversed twice';
        if (target.b.mv.length !== b.mv.length) return 'reversal does not cover the whole posting';
        targetIds = dcMap();
        for (i = 0; i < target.b.mv.length; i++) targetIds[target.b.mv[i].id] = true;
      } else if (typeof b.no !== 'string' || b.no.indexOf(kind + '/') !== 0) {
        return 'missing number';
      } else if (dcHas(Y.docs, b.no)) {
        return 'number used twice';
      }
      allowed = LEDGER_MOVES[kind];
      for (i = 0; i < b.mv.length; i++) {
        m = b.mv[i];
        if (!dcIsObj(m) || typeof m.id !== 'string' || typeof m.partCode !== 'string' || !dcIsObj(m.ref) || allowed.indexOf(m.type) < 0) return 'bad movement';
        if (kind !== 'REV' && (m.ref.grnNo !== b.no || m.ref.lineNo !== i + 1)) return 'movement not tied to its number';
        if (kind === 'REV' && (typeof m.reverses !== 'string' || !targetIds[m.reverses])) return 'reversal movement not tied to its posting';
        Y.moves.push(m);
        Y.movById[m.id] = m;
        Y.moveRec[m.seq] = rec.n;
        Y.moved[m.partCode] = true;
        if (m.type === 'opening') Y.hasOpening[m.partCode] = true;
        if (m.type === 'issue_job' && typeof m.ref.jobId === 'string') {
          pushTo(Y.jobIssues, m.ref.jobId, m.id);
          pushTo(Y.jobMoves, m.ref.jobId, m);
        } else if (m.type === 'return_job') {
          if (typeof m.returnsOf === 'string') pushTo(Y.retsOf, m.returnsOf, m.id);
          if (typeof m.ref.jobId === 'string') pushTo(Y.jobMoves, m.ref.jobId, m);
        } else if (m.type === 'reversal' && typeof m.reverses === 'string') {
          Y.reversedIds[m.reverses] = m.id;
          orig = Y.movById[m.reverses];
          if (orig && dcIsObj(orig.ref) && typeof orig.ref.jobId === 'string') pushTo(Y.jobMoves, orig.ref.jobId, m);
        }
      }
      Y.byId[rec.id] = rec;
      Y.docList.push(rec);
      if (kind === 'REV') {
        Y.revByNo[b.reverses] = rec;
        return '';
      }
      Y.docs[b.no] = rec;
      if (kind === 'GRN' && typeof b.supplierName === 'string' && typeof b.supplierInvoiceNo === 'string') {
        key = dcNormSupplier(b.supplierName) + '|' + dcNormInvoice(b.supplierInvoiceNo);
        pushTo(Y.grnInv, key, b.no);
      }
      if ((kind === 'OPN' || kind === 'ADJ') && typeof b.proposalId === 'string') Y.posts.push({ proposalId: b.proposalId, no: b.no, id: rec.id });
      return '';
    }

    function ingestDocs(Y, rec) {
      var b = rec.b, kind = rec.k, P, tag, what;
      if (!dcIsObj(b)) return;
      if (kind === 'OPN_PROPOSE' || kind === 'ADJ_PROPOSE') {
        P = {
          id: rec.id, kind: kind === 'OPN_PROPOSE' ? 'OPN' : 'ADJ', rec: rec, state: 'PROPOSED', decision: null, docNo: '', postId: ''
        };
        Y.props[rec.id] = P;
        Y.propList.push(P);
        return;
      }
      tag = /^(OPN|ADJ)_(REJECT|WITHDRAW)$/.exec(kind);
      if (!tag || typeof b.proposalId !== 'string') return;
      P = Y.props[b.proposalId];
      if (!P || P.kind !== tag[1] || P.state !== 'PROPOSED') return;
      what = tag[2] === 'REJECT' ? 'REJECTED' : 'WITHDRAWN';
      P.state = what;
      P.decision = { id: rec.id, at: rec.at, by: { name: rec.a.m, role: rec.a.r, tier: rec.a.t }, reason: typeof b.reason === 'string' ? b.reason : '' };
    }

    function ingestConfig(Y, rec) {
      var c;
      if (rec.k !== 'CONFIG_SET') return;
      c = dcCleanConfig(rec.b);
      if (c) Y.cfg = c;
    }

    function oldRow(rec, b) {
      var st = OLD_STATES[b.state];
      var row = {
        id: rec.id, no: b.no, jobId: typeof b.jobId === 'string' ? b.jobId : '', partCode: typeof b.partCode === 'string' ? b.partCode : '',
        partText: typeof b.partText === 'string' ? b.partText : '', qty: dcIsInt(b.qty) ? b.qty : 0,
        serialRef: typeof b.serialRef === 'string' ? b.serialRef : '', claimRef: typeof b.claimRef === 'string' ? b.claimRef : '',
        note: typeof b.note === 'string' ? b.note : '', state: b.state, stateLabel: st.label, bin: st.bin,
        scrapMonth: b.state === 'SCRAP_PENDING' ? fifo.istDate(rec.at).slice(0, 7) : '', signoffNo: '',
        registeredAt: rec.at, registeredBy: { name: rec.a.m, role: rec.a.r, tier: rec.a.t },
        movedAt: rec.at, returnedOn: b.state === 'CUSTOMER_RETURNED' ? fifo.istDate(rec.at) : '', history: [], rev: 1
      };
      row.history.push({ at: rec.at, by: row.registeredBy, from: '', to: b.state, note: row.note });
      return row;
    }
    function oldMove(row, rec, to, note, claimRef) {
      var st = OLD_STATES[to];
      row.history.push({ at: rec.at, by: { name: rec.a.m, role: rec.a.r, tier: rec.a.t }, from: row.state, to: to, note: note });
      if (row.history.length > 40) row.history.shift();
      row.state = to;
      row.stateLabel = st.label;
      row.bin = st.bin;
      row.movedAt = rec.at;
      row.rev += 1;
      if (to === 'SCRAP_PENDING') row.scrapMonth = fifo.istDate(rec.at).slice(0, 7);
      if (to === 'CUSTOMER_RETURNED') row.returnedOn = fifo.istDate(rec.at);
      if (claimRef) row.claimRef = claimRef;
      if (note) row.note = note;
    }
    function ingestDefective(Y, rec) {
      var b = rec.b, row, i, no;
      if (!dcIsObj(b)) return;
      if (rec.k === 'OLD_REGISTER') {
        if (typeof b.no !== 'string' || !dcHas(OLD_STATES, b.state) || dcHas(Y.old, b.no)) return;
        row = oldRow(rec, b);
        Y.old[b.no] = row;
        Y.oldList.push(row);
      } else if (rec.k === 'OLD_MOVE') {
        row = typeof b.oldNo === 'string' ? Y.old[b.oldNo] : null;
        if (!row || !dcHas(OLD_STATES, b.to)) return;
        oldMove(row, rec, b.to, typeof b.note === 'string' ? b.note : '', typeof b.claimRef === 'string' ? b.claimRef : '');
      } else if (rec.k === 'SCRAP_SIGNOFF') {
        if (typeof b.no !== 'string' || !dcIsArr(b.oldNos)) return;
        for (i = 0; i < b.oldNos.length; i++) {
          no = b.oldNos[i];
          row = typeof no === 'string' ? Y.old[no] : null;
          if (!row || row.state !== 'SCRAP_PENDING') continue;
          oldMove(row, rec, 'SCRAPPED', typeof b.note === 'string' ? b.note : '', '');
          row.signoffNo = b.no;
        }
        Y.signoffs.push({
          id: rec.id, no: b.no, month: typeof b.month === 'string' ? b.month : '', oldNos: b.oldNos.slice(), count: b.oldNos.length,
          note: typeof b.note === 'string' ? b.note : '', at: rec.at, by: { name: rec.a.m, role: rec.a.r, tier: rec.a.t },
          pinAt: dcIsInt(b.pinAt) ? b.pinAt : null
        });
      }
    }

    // byName = {stream: records[]} from the store. Returns {ok, index} or {ok:false, problems}.
    function buildIndex(byName) {
      var Y = newIndex(), led = byName.ledger || [], i, why, rp, seq, n, recs, P;
      for (i = 0; i < led.length; i++) {
        why = ingestLedger(Y, led[i]);
        if (why) return { ok: false, problems: [{ code: 'SVCS_FIFO_MISMATCH', stream: 'ledger', n: led[i].n, detail: why }] };
      }
      rp = fifo.replay(Y.moves, {});
      if (!rp || rp.ok !== true) {
        seq = rp && dcIsObj(rp.detail) ? rp.detail.seq : 0;
        n = dcHas(Y.moveRec, seq) ? Y.moveRec[seq] : null;
        return { ok: false, problems: [{ code: 'SVCS_FIFO_MISMATCH', stream: 'ledger', n: n, detail: String(rp && rp.code) + ' at movement ' + seq }] };
      }
      Y.fifo = rp.state;
      recs = byName.docs || [];
      for (i = 0; i < recs.length; i++) ingestDocs(Y, recs[i]);
      for (i = 0; i < Y.posts.length; i++) {
        P = Y.props[Y.posts[i].proposalId];
        if (P && P.state !== 'POSTED') {
          P.state = 'POSTED';
          P.docNo = Y.posts[i].no;
          P.postId = Y.posts[i].id;
        }
      }
      recs = byName.defective || [];
      for (i = 0; i < recs.length; i++) ingestDefective(Y, recs[i]);
      recs = byName.config || [];
      for (i = 0; i < recs.length; i++) ingestConfig(Y, recs[i]);
      return { ok: true, index: Y };
    }

    function replayHook(byName) {
      var r = buildIndex(byName);
      if (!r.ok) {
        built = null;
        return r.problems;
      }
      built = r.index;
      return [];
    }

    // ------------------------------------------------------------ open, refresh, readiness

    function openIndex() {
      var res, names = ['ledger', 'docs', 'defective', 'config'], i;
      built = null;
      res = store.open({ replay: replayHook });
      if (!res || res.ok !== true) {
        isOpen = false;
        X = null;
        return lowerFail(res);
      }
      lastProblems = dcIsArr(res.problems) ? res.problems.slice() : [];
      lastWatermark = typeof res.watermark === 'string' ? res.watermark : '';
      lastSummary = res.summary || {};
      isOpen = true;
      isBlocked = res.blocked === true || !built;
      if (isBlocked) {
        X = null;
      } else {
        X = built;
        for (i = 0; i < names.length; i++) X.revs[names[i]] = res.streams && res.streams[names[i]] ? res.streams[names[i]].rev : 0;
      }
      built = null;
      return {
        ok: true, blocked: isBlocked, problems: lastProblems, watermark: lastWatermark,
        summary: { counts: lastSummary.counts || {}, lastAt: lastSummary.lastAt || null, movements: X ? X.moves.length : 0, lastSeq: X ? lastSeqOf() : 0 }
      };
    }

    function lastSeqOf() { return X.moves.length ? X.moves[X.moves.length - 1].seq : 0; }
    function lastAtOf() { return X.moves.length ? X.moves[X.moves.length - 1].at : ''; }
    function staleness() {
      var names = ['ledger', 'docs', 'defective', 'config'], i, h;
      for (i = 0; i < names.length; i++) {
        h = store.head(names[i]);
        if (!h || h.ok !== true) return { err: h };
        if (h.rev !== X.revs[names[i]]) return { stale: true };
      }
      return {};
    }
    function ready() {
      var r, s;
      if (!isOpen) {
        r = openIndex();
        if (!r.ok) return r;
      }
      if (isBlocked || !X) return blockedFail();
      s = staleness();
      if (s.err) return lowerFail(s.err);
      if (s.stale) {
        r = openIndex();
        if (!r.ok) return r;
        if (isBlocked || !X) return blockedFail();
      }
      return { ok: true };
    }
    // After a write that may or may not have landed: read the truth from storage again.
    function afterFailedWrite(res) {
      var code = res && res.code;
      if (code === 'SVCS_WRITE_FAILED' || code === 'SVCS_READBACK_MISMATCH' || code === 'SVCS_HEAD_WRITE_FAILED' ||
          code === 'SVCS_REV_CONFLICT' || code === 'SVCS_SERIES_MISMATCH' || code === 'SVCS_HEAD_BEHIND') {
        openIndex();
      }
    }

    // ------------------------------------------------------------ authorization

    // Session check, then readiness, then the role table. Returns {ok, sess, pin (needs a PIN), pinOk}.
    function begin(action, ctx) {
      var sess = dcSession(ctx), rd, ru, pinOk;
      if (!sess) return fail('SESSION_REQUIRED');
      rd = ready();
      if (!rd.ok) return rd;
      ru = dcRule(action, sess, X.cfg);
      if (!ru.ok) return fail(ru.code);
      pinOk = stepUpOk(ctx);
      return { ok: true, sess: sess, pin: ru.needsPin === true, pinOk: pinOk };
    }
    function needPin(g) {
      return g.pin && !g.pinOk ? fail('PIN_REQUIRED') : null;
    }
    function clientRef(ctx) {
      var r = dcIsObj(ctx) ? ctx.clientRef : undefined;
      if (r === undefined || r === null || r === '') return { ok: true, ref: '' };
      if (typeof r === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{2,63}$/.test(r)) return { ok: true, ref: r };
      return { ok: false };
    }
    // Clock override: Owner with a fresh PIN only.
    function clockFlag(ctx, g) {
      if (!dcIsObj(ctx) || ctx.clockOverride !== true) return { ok: true, on: false };
      if (!g.sess.owner) return fail('NOT_ALLOWED');
      if (!g.pinOk) return fail('PIN_REQUIRED');
      return { ok: true, on: true };
    }
    // A retry with the same clientRef after a lost reply: find the saved record instead of posting twice.
    function findDone(stream, ref, kinds) {
      var rec;
      if (!ref) return null;
      rec = store.findRef(stream, ref);
      if (!rec) return null;
      if (kinds.indexOf(rec.k) < 0) return { conflict: true };
      return { rec: rec };
    }

    // ------------------------------------------------------------ masters and jobs

    function partRow(code, purpose, warns) {
      var g = masters.getRow(store, 'part', code), cu, i, w;
      if (!g || g.ok !== true) {
        if (g && g.code === 'NOT_FOUND') return fail('PART_UNKNOWN');
        return lowerFail(g);
      }
      cu = masters.canUse(g.row, purpose);
      if (!cu || cu.ok !== true) return lowerFail(cu);
      if (dcIsArr(cu.warnings) && warns) {
        for (i = 0; i < cu.warnings.length; i++) {
          w = cu.warnings[i] && cu.warnings[i].code;
          if (typeof w === 'string' && warns.indexOf(w) < 0) warns.push(w);
        }
      }
      return { ok: true, row: g.row };
    }
    function jobCheck(jobId, mustBeOpen, warns) {
      var id = dcText(jobId, 60), job;
      if (id === null || id === '') return fail('JOB_NOT_FOUND');
      try { job = cases.get(id); } catch (e) { job = null; }
      if (!dcIsObj(job)) return fail('JOB_NOT_FOUND', { jobId: id });
      if (mustBeOpen && (job.status !== 'open' || (typeof job.invoiceNo === 'string' && job.invoiceNo !== ''))) return fail('JOB_CLOSED', { jobId: id });
      if (job.stub === true && warns && warns.indexOf('JOB_IS_STUB') < 0) warns.push('JOB_IS_STUB');
      return { ok: true, id: id, job: job };
    }

    // ------------------------------------------------------------ input readers

    function readNote(v, min) {
      var s = dcText(v, 200);
      if (s === null) return fail('INPUT_INVALID', { field: 'note' });
      if (min && s.length < min) return fail('REASON_REQUIRED');
      return { ok: true, value: s };
    }
    function readLines(input, key) {
      var lines = dcIsObj(input) ? input[key === undefined ? 'lines' : key] : null;
      if (!dcIsArr(lines) || lines.length < 1) return fail('LINES_REQUIRED');
      if (lines.length > DCS_MAX_LINES) return fail('TOO_MANY_LINES');
      return { ok: true, lines: lines };
    }
    function readPartCode(raw, index) {
      var code = fifo.normalizePartCode(raw);
      return code ? { ok: true, code: code } : lineFail('PART_UNKNOWN', index);
    }
    function checkToday(input) {
      if (dcIsObj(input) && input.docDate !== undefined && input.docDate !== today()) return fail('BACKDATE_NOT_ALLOWED');
      return null;
    }

    // ------------------------------------------------------------ views

    function byOf(rec) { return { name: rec.a.m, role: rec.a.r, tier: rec.a.t }; }
    function ledgerView(rec) {
      var b = rec.b, out = {}, keys = Object.keys(b), i, rv = X && b.no !== undefined ? X.revByNo[b.no] : null;
      for (i = 0; i < keys.length; i++) out[keys[i]] = b[keys[i]];
      if (out.no === undefined) out.no = '';
      out.id = rec.id;
      out.n = rec.n;
      out.kind = rec.k;
      out.kindLabel = KINDS[rec.k] || rec.k;
      out.at = rec.at;
      out.fy = financialYear(out.docDate);
      out.by = byOf(rec);
      out.ref = rec.r || '';
      out.state = rv ? 'REVERSED' : 'POSTED';
      out.reversedBy = rv ? { id: rv.id, at: rv.at, reason: rv.b.reason, by: byOf(rv) } : null;
      return out;
    }
    function adjValue(P) {
      return dcIsInt(P.rec.b.valuePaise) ? P.rec.b.valuePaise : 0;
    }
    function adjClass(lines) {
      var i;
      for (i = 0; i < lines.length; i++) {
        if (dcHas(ADJ_REASONS, lines[i].reason) && ADJ_REASONS[lines[i].reason].klass === 'WRITEOFF') return 'WRITEOFF';
      }
      return 'CORRECTION';
    }
    function proposalView(P) {
      var b = P.rec.b, out = {
        id: P.id, kind: P.kind, kindLabel: KINDS[P.kind], state: P.state, stateLabel: STATES[P.state], at: P.rec.at, by: byOf(P.rec),
        note: typeof b.note === 'string' ? b.note : '', lines: dcIsArr(b.lines) ? b.lines : [], decision: dcCopy(P.decision), docNo: P.docNo,
        ref: P.rec.r || ''
      };
      if (P.kind === 'ADJ') {
        out.valuePaise = adjValue(P);
        out.reasonClass = adjClass(out.lines);
        out.needsOwner = out.reasonClass === 'WRITEOFF' || X.cfg.adjustLimitPaise <= 0 || out.valuePaise > X.cfg.adjustLimitPaise;
      }
      return out;
    }
    function oldView(row) {
      var out = {}, keys = Object.keys(row), i;
      for (i = 0; i < keys.length; i++) out[keys[i]] = row[keys[i]];
      out.history = dcCopy(row.history);
      out.registeredBy = dcCopy(row.registeredBy);
      return out;
    }
    function okDoc(rec, warns, extra) {
      var r = { ok: true, doc: ledgerView(rec), warnings: warns || [] }, keys, i;
      if (extra) {
        keys = Object.keys(extra);
        for (i = 0; i < keys.length; i++) r[keys[i]] = extra[keys[i]];
      }
      return r;
    }

    // ------------------------------------------------------------ writing

    // One ledger record, one store.append. build({clone, at, no, docDate, fctx}) plans the movements on a FIFO clone.
    function postLedger(o) {
      var ta, nn, no = '', at, clone, b, item, res, aOpts, ctx = o.ctx;
      ta = store.nextAt('ledger', o.clockOn ? { clockOverride: true } : undefined);
      if (!ta || ta.ok !== true) return lowerFail(ta);
      at = ta.at;
      if (o.series) {
        nn = store.nextNumber(o.series, at);
        if (!nn || nn.ok !== true) return lowerFail(nn);
        no = nn.no;
      }
      clone = fifo.cloneState(X.fifo);
      if (!clone) return fail('DEPS_INVALID', 'fifo state');
      b = o.build({ clone: clone, at: at, no: no, docDate: dcDateFrom(at), fctx: { session: ctx.session, reauth: o.reauth === true } });
      if (!b.ok) return b;
      item = { k: o.kind, b: b.body };
      if (o.series) item.series = o.series;
      if (o.ref) item.r = o.ref;
      // The lock is the revision this screen planned on, never a fresh head read: another screen's write in between
      // must make this append fail (SVCS_REV_CONFLICT) instead of posting on stale FIFO state.
      aOpts = { expectRev: X.revs.ledger, actor: dcActor(o.sess), at: at };
      if (o.guardDocs) aOpts.guardRevs = { docs: X.revs.docs };
      if (o.clockOn) aOpts.clockOverride = true;
      res = store.append('ledger', [item], aOpts);
      if (!res || res.ok !== true) {
        afterFailedWrite(res);
        return lowerFail(res);
      }
      X.fifo = clone;
      ingestLedger(X, res.records[0]);
      X.revs.ledger = res.rev;
      return { ok: true, rec: res.records[0], warnings: b.warnings || [], storeWarnings: res.warnings || [] };
    }

    // One record in docs, defective or config. guard = {stream: rev} for guardRevs.
    function appendOne(stream, item, sess, clockOn, guard) {
      var opts = { expectRev: X.revs[stream], actor: dcActor(sess) }, res, rec;
      if (guard) opts.guardRevs = guard;
      if (clockOn) opts.clockOverride = true;
      res = store.append(stream, [item], opts);
      if (!res || res.ok !== true) {
        afterFailedWrite(res);
        return lowerFail(res);
      }
      rec = res.records[0];
      X.revs[stream] = res.rev;
      if (stream === 'docs') ingestDocs(X, rec);
      else if (stream === 'defective') ingestDefective(X, rec);
      else if (stream === 'config') ingestConfig(X, rec);
      return { ok: true, rec: rec, storeWarnings: res.warnings || [] };
    }

    // Plans one movement on the clone and applies it there. step = {ok, movement} from a fifo.plan* call.
    function applyPlanned(clone, step, index, partCode) {
      var ap;
      if (!step || step.ok !== true) return lowerFail(step, { lineNo: index + 1, partCode: partCode });
      ap = fifo.applyMovement(clone, step.movement);
      if (!ap || ap.ok !== true) return lowerFail(ap, { lineNo: index + 1, partCode: partCode });
      return { ok: true, movement: step.movement };
    }

    // ------------------------------------------------------------ config

    function config() {
      var rd = ready(), c;
      if (!rd.ok) return { ok: false, code: rd.code, message: rd.message, adjustLimitPaise: 0, storeRoles: [], warnings: [] };
      c = X.cfg;
      return { ok: true, adjustLimitPaise: c.adjustLimitPaise, storeRoles: c.storeRoles.slice(), warnings: [] };
    }

    function setConfig(patch, ctx) {
      var g = begin('CONFIG_EDIT', ctx), rf, dn, pin, cf, next, i, cur, changed, res;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('config', rf.ref, ['CONFIG_SET']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, config: dcCleanConfig(dn.rec.b), replayed: true, warnings: [] };
      pin = needPin(g);
      if (pin) return pin;
      if (!dcIsObj(patch)) return fail('INPUT_INVALID');
      cur = X.cfg;
      next = { adjustLimitPaise: cur.adjustLimitPaise, storeRoles: cur.storeRoles.slice() };
      if (patch.adjustLimitPaise !== undefined) {
        if (!dcIsInt(patch.adjustLimitPaise) || patch.adjustLimitPaise < 0 || patch.adjustLimitPaise > DCS_LIMIT_CEILING) return fail('INPUT_INVALID', { field: 'adjustLimitPaise' });
        next.adjustLimitPaise = patch.adjustLimitPaise;
      }
      if (patch.storeRoles !== undefined) {
        if (!dcIsArr(patch.storeRoles)) return fail('INPUT_INVALID', { field: 'storeRoles' });
        next.storeRoles = [];
        for (i = 0; i < patch.storeRoles.length; i++) {
          if (typeof patch.storeRoles[i] !== 'string' || SHELL_ROLES.indexOf(patch.storeRoles[i]) < 0) return fail('INPUT_INVALID', { field: 'storeRoles' });
          if (next.storeRoles.indexOf(patch.storeRoles[i]) < 0) next.storeRoles.push(patch.storeRoles[i]);
        }
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      changed = next.adjustLimitPaise !== cur.adjustLimitPaise || next.storeRoles.join('|') !== cur.storeRoles.join('|');
      if (!changed) return { ok: true, config: { adjustLimitPaise: cur.adjustLimitPaise, storeRoles: cur.storeRoles.slice() }, unchanged: true, warnings: [] };
      res = appendOne('config', { k: 'CONFIG_SET', b: { adjustLimitPaise: next.adjustLimitPaise, storeRoles: next.storeRoles }, r: rf.ref || undefined }, g.sess, cf.on, null);
      if (!res.ok) return res;
      return { ok: true, config: { adjustLimitPaise: X.cfg.adjustLimitPaise, storeRoles: X.cfg.storeRoles.slice() }, warnings: res.storeWarnings };
    }

    // ------------------------------------------------------------ opening stock

    // Shared by propose and approve. skipId = the proposal being approved (not counted as "another proposal").
    function openingLines(input, skipId, warns) {
      var rl = readLines(input), out = [], seen = dcMap(), i, ln, pc, row, p, qty, cost;
      if (!rl.ok) return rl;
      for (i = 0; i < rl.lines.length; i++) {
        ln = rl.lines[i];
        if (!dcIsObj(ln)) return lineFail('INPUT_INVALID', i);
        pc = readPartCode(ln.partCode, i);
        if (!pc.ok) return pc;
        if (seen[pc.code]) return lineFail('DUPLICATE_LINE', i, { partCode: pc.code });
        seen[pc.code] = true;
        qty = ln.qty;
        if (!dcPiece(qty)) return lineFail('QTY_INVALID', i, { partCode: pc.code });
        cost = ln.unitCostPaise;
        if (!dcCostOk(cost)) return lineFail('COST_REQUIRED', i, { partCode: pc.code });
        row = partRow(pc.code, 'receipt', warns);
        if (!row.ok) return lineWrap(row, i, { partCode: pc.code });
        out.push({ partCode: pc.code, qty: qty, unitCostPaise: cost });
      }
      for (i = 0; i < out.length; i++) {
        if (dcHas(X.hasOpening, out[i].partCode)) return lineFail('OPENING_ALREADY_SET', i, { partCode: out[i].partCode });
        if (dcHas(X.moved, out[i].partCode)) return lineFail('PART_HAS_MOVEMENTS', i, { partCode: out[i].partCode });
        p = openProposalHolding(out[i].partCode, skipId);
        if (p) return lineFail('OPENING_PROPOSAL_OPEN', i, { partCode: out[i].partCode, proposalId: p });
      }
      return { ok: true, lines: out };
    }
    function openProposalHolding(code, skipId) {
      var i, P, j, ls;
      for (i = 0; i < X.propList.length; i++) {
        P = X.propList[i];
        if (P.kind !== 'OPN' || P.state !== 'PROPOSED' || P.id === skipId) continue;
        ls = dcIsArr(P.rec.b.lines) ? P.rec.b.lines : [];
        for (j = 0; j < ls.length; j++) if (ls[j] && ls[j].partCode === code) return P.id;
      }
      return '';
    }

    function proposeOpening(input, ctx) {
      var g = begin('OPENING_PROPOSE', ctx), rf, dn, nt, ln, cf, res, warns = [];
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('docs', rf.ref, ['OPN_PROPOSE']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, proposalId: dn.rec.id, proposal: proposalView(X.props[dn.rec.id]), replayed: true, warnings: [] };
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      nt = readNote(input.note, 0);
      if (!nt.ok) return nt;
      ln = openingLines(input, '', warns);
      if (!ln.ok) return ln;
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = appendOne('docs', { k: 'OPN_PROPOSE', b: { lines: ln.lines, note: nt.value }, r: rf.ref || undefined }, g.sess, cf.on, null);
      if (!res.ok) return res;
      return { ok: true, proposalId: res.rec.id, proposal: proposalView(X.props[res.rec.id]), warnings: warns.concat(res.storeWarnings) };
    }

    function findProposal(id, kind) {
      var P = typeof id === 'string' && dcHas(X.props, id) ? X.props[id] : null;
      if (!P || P.kind !== kind) return null;
      return P;
    }

    function approveOpening(proposalId, ctx) {
      var g = begin('OPENING_APPROVE', ctx), rf, dn, P, pin, cf, ln, warns = [], res, rec, b0, pinAt;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['OPN']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      P = findProposal(proposalId, 'OPN');
      if (!P) return fail('DOC_NOT_FOUND');
      if (P.state !== 'PROPOSED') return fail('STATE_INVALID', { state: P.state });
      pin = needPin(g);
      if (pin) return pin;
      pinAt = stampAt(ctx);
      if (pinAt < 0) return fail('PIN_REQUIRED');
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      b0 = P.rec.b;
      ln = openingLines({ lines: b0.lines }, P.id, warns);
      if (!ln.ok) return ln;
      res = postLedger({
        kind: 'OPN', series: 'OPN', ref: rf.ref, sess: g.sess, ctx: ctx, reauth: true, guardDocs: true, clockOn: cf.on,
        build: function (c) {
          var i, st, ap, mv = [], lines = [], docs;
          for (i = 0; i < ln.lines.length; i++) {
            st = fifo.planOpening(c.clone, {
              partCode: ln.lines[i].partCode, qty: ln.lines[i].qty, unitCostPaise: ln.lines[i].unitCostPaise, at: c.at,
              ref: { grnNo: c.no, lineNo: i + 1 }
            }, c.fctx);
            ap = applyPlanned(c.clone, st, i, ln.lines[i].partCode);
            if (!ap.ok) return ap;
            mv.push(ap.movement);
            lines.push({ partCode: ln.lines[i].partCode, qty: ln.lines[i].qty, unitCostPaise: ln.lines[i].unitCostPaise });
          }
          docs = {
            no: c.no, docDate: c.docDate, note: typeof b0.note === 'string' ? b0.note : '', lines: lines, mv: mv,
            proposalId: P.id, approvedBy: { name: g.sess.name, role: g.sess.role }, pinAt: pinAt
          };
          return { ok: true, body: docs, warnings: warns };
        }
      });
      if (!res.ok) return res;
      rec = res.rec;
      P.state = 'POSTED';
      P.docNo = rec.b.no;
      P.postId = rec.id;
      return okDoc(rec, res.warnings.concat(res.storeWarnings), { proposalId: P.id });
    }

    function decideProposal(kind, verb, proposalId, reason, ctx) {
      // verb 'REJECT' (Manager or Owner, reason 5+) or 'WITHDRAW' (the proposer or the Owner).
      var action = verb === 'REJECT' ? 'PROPOSAL_REJECT' : 'PROPOSAL_WITHDRAW';
      var g = begin(action, ctx), rf, dn, P, rs, cf, res, body, mine;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('docs', rf.ref, [kind + '_' + verb]);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, proposal: proposalView(X.props[dn.rec.b.proposalId]), replayed: true, warnings: [] };
      P = findProposal(proposalId, kind);
      if (!P) return fail('DOC_NOT_FOUND');
      if (P.state !== 'PROPOSED') return fail('STATE_INVALID', { state: P.state });
      body = { proposalId: P.id };
      if (verb === 'REJECT') {
        rs = dcText(reason, 200);
        if (rs === null || rs.length < 5) return fail('REASON_REQUIRED');
        body.reason = rs;
      } else {
        // The same actor: same name and tier; with no staff name, the same tier and role (nothing is posted by a withdrawal).
        mine = P.rec.a.t === g.sess.tier && P.rec.a.m === g.sess.name && (P.rec.a.m !== '' || P.rec.a.r === g.sess.role);
        if (!g.sess.owner && !mine) return fail('NOT_ALLOWED');
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = appendOne('docs', { k: kind + '_' + verb, b: body, r: rf.ref || undefined }, g.sess, cf.on, { ledger: X.revs.ledger });
      if (!res.ok) return res;
      return { ok: true, proposal: proposalView(P), warnings: res.storeWarnings };
    }

    // ------------------------------------------------------------ goods receipt

    function receiveGoods(input, ctx) {
      var g = begin('RECEIVE', ctx), rf, dn, bad, nt, rl, sup, inv, invDate, lines = [], seen = dcMap(), i, ln, pc, qr, qi, cost, row, warns = [], cf, res, td;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['GRN']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      nt = readNote(input.note, 0);
      if (!nt.ok) return nt;
      sup = input.supplierName === undefined || input.supplierName === null || input.supplierName === '' ? 'Titan' : dcText(input.supplierName, 60);
      if (sup === null || sup === '') return fail('INPUT_INVALID', { field: 'supplierName' });
      inv = dcText(input.supplierInvoiceNo, 40);
      if (inv === null || inv === '' || dcNormInvoice(inv) === '') return fail('SUPPLIER_INVOICE_REQUIRED');
      invDate = input.supplierInvoiceDate;
      td = today();
      if (!dcDateOk(invDate) || invDate < DCS_FIRST_INVOICE_DAY || invDate > td) return fail('SUPPLIER_INVOICE_DATE_INVALID');
      rl = readLines(input);
      if (!rl.ok) return rl;
      for (i = 0; i < rl.lines.length; i++) {
        ln = rl.lines[i];
        if (!dcIsObj(ln)) return lineFail('INPUT_INVALID', i);
        pc = readPartCode(ln.partCode, i);
        if (!pc.ok) return pc;
        if (seen[pc.code]) return lineFail('DUPLICATE_LINE', i, { partCode: pc.code });
        seen[pc.code] = true;
        qr = ln.qtyReceived;
        if (!dcPiece(qr)) return lineFail('QTY_INVALID', i, { partCode: pc.code });
        qi = ln.qtyInvoiced;
        if (qi === undefined || qi === null) qi = null;
        else if (!dcPiece(qi)) return lineFail('QTY_INVALID', i, { partCode: pc.code });
        cost = ln.unitCostPaise;
        if (!dcCostOk(cost)) return lineFail('COST_REQUIRED', i, { partCode: pc.code });
        row = partRow(pc.code, 'receipt', warns);
        if (!row.ok) return lineWrap(row, i, { partCode: pc.code });
        lines.push({ partCode: pc.code, qtyInvoiced: qi, qtyReceived: qr, qtyShort: qi !== null && qi > qr ? qi - qr : 0, unitCostPaise: cost });
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = postLedger({
        kind: 'GRN', series: 'GRN', ref: rf.ref, sess: g.sess, ctx: ctx, reauth: false, clockOn: cf.on,
        build: function (c) {
          var j, st, ap, mv = [], dup, fyNow, fyPrev, list, k, hit, key, docNo;
          // duplicate supplier invoice: this and the previous financial year, reversed ones do not count
          key = dcNormSupplier(sup) + '|' + dcNormInvoice(inv);
          list = dcHas(X.grnInv, key) ? X.grnInv[key] : [];
          fyNow = financialYear(c.docDate);
          fyPrev = dcPad(+fyNow.slice(0, 4) - 1, 4) + '-' + fyNow.slice(2, 4);
          for (k = 0; k < list.length; k++) {
            docNo = list[k];
            hit = dcFyFromNo(docNo);
            if ((hit === fyNow || hit === fyPrev) && !dcHas(X.revByNo, docNo)) {
              dup = docNo;
              break;
            }
          }
          if (dup) return fail('DUPLICATE_SUPPLIER_INVOICE', { docNo: dup });
          for (j = 0; j < lines.length; j++) {
            st = fifo.planReceipt(c.clone, {
              partCode: lines[j].partCode, qty: lines[j].qtyReceived, unitCostPaise: lines[j].unitCostPaise, at: c.at,
              ref: { grnNo: c.no, lineNo: j + 1 }
            }, c.fctx);
            ap = applyPlanned(c.clone, st, j, lines[j].partCode);
            if (!ap.ok) return ap;
            mv.push(ap.movement);
          }
          return {
            ok: true, warnings: warns,
            body: {
              no: c.no, docDate: c.docDate, note: nt.value, supplierName: sup, supplierInvoiceNo: inv, supplierInvoiceDate: invDate,
              lines: lines, mv: mv
            }
          };
        }
      });
      if (!res.ok) return res;
      return okDoc(res.rec, res.warnings.concat(res.storeWarnings));
    }

    // ------------------------------------------------------------ issue and return

    function issueToJob(input, ctx) {
      var g = begin('ISSUE', ctx), rf, dn, bad, nt, jb, billing, rl, lines = [], seen = dcMap(), i, ln, pc, qty, row, warns = [],
        wantNeg = false, cf, res, ps, neg, lineCost;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['ISS']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      nt = readNote(input.note, 0);
      if (!nt.ok) return nt;
      jb = jobCheck(input.jobId, true, warns);
      if (!jb.ok) return jb;
      ps = jb.job.paymentStatus;
      billing = input.billing === undefined || input.billing === null || input.billing === '' ?
        (ps === 'no_charge_warranty' ? 'WARRANTY' : 'CHARGEABLE') : input.billing;
      if (!dcHas(BILLING_MODES, billing)) return fail('INPUT_INVALID', { field: 'billing' });
      rl = readLines(input);
      if (!rl.ok) return rl;
      for (i = 0; i < rl.lines.length; i++) {
        ln = rl.lines[i];
        if (!dcIsObj(ln)) return lineFail('INPUT_INVALID', i);
        pc = readPartCode(ln.partCode, i);
        if (!pc.ok) return pc;
        if (seen[pc.code]) return lineFail('DUPLICATE_LINE', i, { partCode: pc.code });
        seen[pc.code] = true;
        qty = ln.qty;
        if (!dcPiece(qty)) return lineFail('QTY_INVALID', i, { partCode: pc.code });
        // Each field is read once, so the value checked is the value used.
        neg = ln.allowNegative;
        if (neg !== undefined && typeof neg !== 'boolean') return lineFail('INPUT_INVALID', i, { partCode: pc.code });
        if (neg === true) wantNeg = true;
        lineCost = ln.unitCostPaise;
        if (lineCost === undefined) lineCost = null;
        if (lineCost !== null && !dcCostOk(lineCost)) return lineFail('COST_REQUIRED', i, { partCode: pc.code });
        row = partRow(pc.code, 'issue', warns);
        if (!row.ok) return lineWrap(row, i, { partCode: pc.code });
        lines.push({ partCode: pc.code, qty: qty, neg: neg === true, unitCostPaise: lineCost });
      }
      if (wantNeg) {
        // Owner only, with a fresh PIN and a note of 3 or more characters.
        if (!g.sess.owner) return fail('NOT_ALLOWED');
        if (!g.pinOk) return fail('PIN_REQUIRED');
        if (nt.value.length < 3) return fail('OVERRIDE_NOTE_REQUIRED');
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = postLedger({
        kind: 'ISS', series: 'ISS', ref: rf.ref, sess: g.sess, ctx: ctx, reauth: wantNeg, clockOn: cf.on,
        build: function (c) {
          var j, st, ap, mv = [], out = [], item, inp, over = false;
          for (j = 0; j < lines.length; j++) {
            item = lines[j];
            inp = { partCode: item.partCode, qty: item.qty, at: c.at, ref: { grnNo: c.no, lineNo: j + 1, jobId: jb.id } };
            if (item.neg) {
              inp.allowNegative = true;
              inp.note = nt.value;
              if (item.unitCostPaise !== null && fifo.previewExcessCostPaise(c.clone, item.partCode) === null) inp.unitCostPaise = item.unitCostPaise;
            }
            st = fifo.planIssueToJob(c.clone, inp, c.fctx);
            ap = applyPlanned(c.clone, st, j, item.partCode);
            if (!ap.ok) return ap;
            mv.push(ap.movement);
            if (ap.movement.override) over = true;
            out.push({ partCode: item.partCode, qty: item.qty, override: ap.movement.override ? { by: ap.movement.override.by, note: ap.movement.override.note } : null });
          }
          return {
            ok: true, warnings: over ? warns.concat(['NEGATIVE_OVERRIDE_USED']) : warns,
            body: { no: c.no, docDate: c.docDate, note: nt.value, jobId: jb.id, billing: billing, stub: jb.job.stub === true, lines: out, mv: mv }
          };
        }
      });
      if (!res.ok) return res;
      return okDoc(res.rec, res.warnings.concat(res.storeWarnings));
    }

    function returnFromJob(input, ctx) {
      var g = begin('RETURN', ctx), rf, dn, bad, nt, jb, rl, lines = [], seen = dcMap(), i, ln, mv0, qty, why, warns = [], cf, res;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['RET']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      nt = readNote(input.note, 0);
      if (!nt.ok) return nt;
      jb = jobCheck(input.jobId, true, warns);
      if (!jb.ok) return jb;
      rl = readLines(input);
      if (!rl.ok) return rl;
      for (i = 0; i < rl.lines.length; i++) {
        ln = rl.lines[i];
        if (!dcIsObj(ln)) return lineFail('INPUT_INVALID', i);
        if (typeof ln.issueMovementId !== 'string' || !dcHas(X.movById, ln.issueMovementId)) return lineFail('ISSUE_LINE_NOT_FOUND', i);
        mv0 = X.movById[ln.issueMovementId];
        if (mv0.type !== 'issue_job' || mv0.ref.jobId !== jb.id || dcHas(X.reversedIds, mv0.id)) return lineFail('ISSUE_LINE_NOT_FOUND', i, { issueMovementId: mv0.id });
        if (seen[mv0.id]) return lineFail('DUPLICATE_LINE', i, { issueMovementId: mv0.id });
        seen[mv0.id] = true;
        qty = ln.qty;
        if (!dcPiece(qty)) return lineFail('QTY_INVALID', i, { partCode: mv0.partCode });
        why = ln.returnReason;
        if (typeof why !== 'string' || !dcHas(RETURN_REASONS, why)) return lineFail('RETURN_REASON_INVALID', i, { partCode: mv0.partCode });
        lines.push({ partCode: mv0.partCode, qty: qty, issueMovementId: mv0.id, issueDocNo: mv0.ref.grnNo, issueLineNo: mv0.ref.lineNo, returnReason: why });
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = postLedger({
        kind: 'RET', series: 'RET', ref: rf.ref, sess: g.sess, ctx: ctx, reauth: false, clockOn: cf.on,
        build: function (c) {
          var j, st, ap, mv = [];
          for (j = 0; j < lines.length; j++) {
            st = fifo.planReturnFromJob(c.clone, {
              issueId: lines[j].issueMovementId, qty: lines[j].qty, at: c.at, ref: { grnNo: c.no, lineNo: j + 1, jobId: jb.id }
            }, c.fctx);
            ap = applyPlanned(c.clone, st, j, lines[j].partCode);
            if (!ap.ok) return ap;
            mv.push(ap.movement);
          }
          return { ok: true, warnings: warns, body: { no: c.no, docDate: c.docDate, note: nt.value, jobId: jb.id, lines: lines, mv: mv } };
        }
      });
      if (!res.ok) return res;
      return okDoc(res.rec, res.warnings.concat(res.storeWarnings));
    }

    // ------------------------------------------------------------ counter sale

    function counterSale(input, ctx) {
      var g = begin('COUNTER_SALE', ctx), rf, dn, bad, nt, rl, lines = [], seen = dcMap(), i, ln, pc, qty, price, row, warns = [], pay, ccpt,
        total = 0, cf, res;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['CSL']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      nt = readNote(input.note, 0);
      if (!nt.ok) return nt;
      pay = input.payMode;
      if (typeof pay !== 'string' || !dcHas(PAY_MODES, pay)) return fail('PAYMODE_INVALID');
      ccpt = dcText(input.ccptInvoiceNo, 40);
      if (ccpt === null) return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
      rl = readLines(input);
      if (!rl.ok) return rl;
      for (i = 0; i < rl.lines.length; i++) {
        ln = rl.lines[i];
        if (!dcIsObj(ln)) return lineFail('INPUT_INVALID', i);
        pc = readPartCode(ln.partCode, i);
        if (!pc.ok) return pc;
        if (seen[pc.code]) return lineFail('DUPLICATE_LINE', i, { partCode: pc.code });
        seen[pc.code] = true;
        qty = ln.qty;
        if (!dcPiece(qty)) return lineFail('QTY_INVALID', i, { partCode: pc.code });
        price = ln.unitPricePaise;
        if (!dcIsInt(price) || price < 0 || price > DCS_COST_CEILING) return lineFail('UNIT_PRICE_INVALID', i, { partCode: pc.code });
        row = partRow(pc.code, 'sale', warns);
        if (!row.ok) return lineWrap(row, i, { partCode: pc.code });
        lines.push({ partCode: pc.code, qty: qty, unitPricePaise: price, amountPaise: qty * price });
        total += qty * price;
      }
      if (input.amountPaise !== undefined && input.amountPaise !== null && input.amountPaise !== total) return fail('AMOUNT_MISMATCH', { expected: total });
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = postLedger({
        kind: 'CSL', series: 'CSL', ref: rf.ref, sess: g.sess, ctx: ctx, reauth: false, clockOn: cf.on,
        build: function (c) {
          var j, st, ap, mv = [];
          for (j = 0; j < lines.length; j++) {
            st = fifo.planCounterSale(c.clone, {
              partCode: lines[j].partCode, qty: lines[j].qty, at: c.at, ref: { grnNo: c.no, lineNo: j + 1, saleRef: c.no }
            }, c.fctx);
            ap = applyPlanned(c.clone, st, j, lines[j].partCode);
            if (!ap.ok) return ap;
            mv.push(ap.movement);
          }
          return {
            ok: true, warnings: warns,
            body: { no: c.no, docDate: c.docDate, note: nt.value, payMode: pay, ccptInvoiceNo: ccpt, amountPaise: total, moneyPosted: false, lines: lines, mv: mv }
          };
        }
      });
      if (!res.ok) return res;
      return okDoc(res.rec, res.warnings.concat(res.storeWarnings));
    }

    // ------------------------------------------------------------ adjustments

    // Reads and values the lines of an adjustment on the live FIFO state.
    function adjustLines(raw, warns) {
      var rl = readLines({ lines: raw }), out = [], seen = dcMap(), i, ln, pc, d, reason, def, row, lineCost, v, cost, total = 0, klass = 'CORRECTION';
      if (!rl.ok) return rl;
      for (i = 0; i < rl.lines.length; i++) {
        ln = rl.lines[i];
        if (!dcIsObj(ln)) return lineFail('INPUT_INVALID', i);
        pc = readPartCode(ln.partCode, i);
        if (!pc.ok) return pc;
        if (seen[pc.code]) return lineFail('DUPLICATE_LINE', i, { partCode: pc.code });
        seen[pc.code] = true;
        d = ln.qtyDelta;
        if (!dcIsInt(d) || d === 0 || Math.abs(d) > DCS_MAX_PIECES) return lineFail('QTY_INVALID', i, { partCode: pc.code });
        reason = ln.reason;
        if (typeof reason !== 'string' || !dcHas(ADJ_REASONS, reason)) return lineFail('REASON_INVALID', i, { partCode: pc.code });
        def = ADJ_REASONS[reason];
        if ((def.sign === 1 && d < 0) || (def.sign === -1 && d > 0)) return lineFail('REASON_SIGN_MISMATCH', i, { partCode: pc.code });
        row = partRow(pc.code, 'adjust', warns);
        if (!row.ok) return lineWrap(row, i, { partCode: pc.code });
        lineCost = ln.unitCostPaise === undefined ? null : ln.unitCostPaise;
        if (lineCost !== null && !dcCostOk(lineCost)) return lineFail('COST_REQUIRED', i, { partCode: pc.code });
        if (d < 0) {
          v = fifo.previewIssue(X.fifo, pc.code, -d);
          if (!v || v.ok !== true) return lowerFail(v, { lineNo: i + 1, partCode: pc.code });
          if (v.shortfallQty > 0) {
            return lineFail('INSUFFICIENT_STOCK', i, { partCode: pc.code, available: -d - v.shortfallQty, requested: -d, balance: -d - v.shortfallQty, wanted: -d });
          }
          out.push({ partCode: pc.code, qtyDelta: d, reason: reason, unitCostPaise: null, valuePaise: v.valuePaise, passCost: null });
          total += v.valuePaise;
        } else {
          cost = fifo.previewExcessCostPaise(X.fifo, pc.code);
          if (cost === null || cost <= 0) {
            cost = lineCost;
            if (cost === null) return lineFail('COST_REQUIRED', i, { partCode: pc.code });
            out.push({ partCode: pc.code, qtyDelta: d, reason: reason, unitCostPaise: lineCost, valuePaise: d * cost, passCost: lineCost });
          } else {
            out.push({ partCode: pc.code, qtyDelta: d, reason: reason, unitCostPaise: lineCost, valuePaise: d * cost, passCost: null });
          }
          total += d * cost;
        }
        if (def.klass === 'WRITEOFF') klass = 'WRITEOFF';
      }
      return { ok: true, lines: out, valuePaise: total, klass: klass };
    }

    function proposeAdjustment(input, ctx) {
      var g = begin('ADJUST_PROPOSE', ctx), rf, dn, nt, al, warns = [], cf, res, body, stored, i, P, needsOwner;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('docs', rf.ref, ['ADJ_PROPOSE']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) {
        P = X.props[dn.rec.id];
        return { ok: true, proposalId: dn.rec.id, valuePaise: adjValue(P), needsOwner: proposalView(P).needsOwner, proposal: proposalView(P), replayed: true, warnings: [] };
      }
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      nt = readNote(input.note, 5);
      if (!nt.ok) return nt;
      al = adjustLines(input.lines, warns);
      if (!al.ok) return al;
      stored = [];
      for (i = 0; i < al.lines.length; i++) {
        stored.push({ partCode: al.lines[i].partCode, qtyDelta: al.lines[i].qtyDelta, reason: al.lines[i].reason, unitCostPaise: al.lines[i].unitCostPaise });
      }
      body = { lines: stored, note: nt.value, valuePaise: al.valuePaise };
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = appendOne('docs', { k: 'ADJ_PROPOSE', b: body, r: rf.ref || undefined }, g.sess, cf.on, null);
      if (!res.ok) return res;
      P = X.props[res.rec.id];
      needsOwner = al.klass === 'WRITEOFF' || X.cfg.adjustLimitPaise <= 0 || al.valuePaise > X.cfg.adjustLimitPaise;
      return { ok: true, proposalId: res.rec.id, valuePaise: al.valuePaise, needsOwner: needsOwner, reasonClass: al.klass, proposal: proposalView(P), warnings: warns.concat(res.storeWarnings) };
    }

    function approveAdjustment(proposalId, ctx) {
      var sess = dcSession(ctx), rd, rf, dn, P, al, warns = [], cf, res, g, cfg, pinAt, rec, mine, lim, b0;
      if (!sess) return fail('SESSION_REQUIRED');
      rd = ready();
      if (!rd.ok) return rd;
      if (!sess.owner && !sess.manager) return fail('NOT_ALLOWED');
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['ADJ']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      P = findProposal(proposalId, 'ADJ');
      if (!P) return fail('DOC_NOT_FOUND');
      if (P.state !== 'PROPOSED') return fail('STATE_INVALID', { state: P.state });
      cfg = X.cfg;
      b0 = P.rec.b;
      if (sess.owner && !stepUpOk(ctx)) return fail('PIN_REQUIRED');
      al = adjustLines(dcIsArr(b0.lines) ? b0.lines : [], warns);
      if (!al.ok) return al;
      if (!sess.owner) {
        lim = cfg.adjustLimitPaise;
        if (al.klass === 'WRITEOFF') return fail('WRITEOFF_OWNER_ONLY');
        if (lim <= 0 || al.valuePaise > lim) return fail('ABOVE_MANAGER_LIMIT', { valuePaise: al.valuePaise, limitPaise: lim });
        // The approval must name a person. A blank proposer name could be this same person, unless it was the Owner.
        if (sess.name === '') return fail('APPROVER_NAME_REQUIRED');
        mine = P.rec.a.m !== '' && P.rec.a.m === sess.name;
        if (mine) return fail('SELF_APPROVAL');
        if (P.rec.a.m === '' && P.rec.a.t !== 'owner') return fail('PROPOSER_NAME_MISSING');
      }
      g = { sess: sess, pinOk: stepUpOk(ctx) };
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      pinAt = null;
      if (sess.owner) {
        pinAt = stampAt(ctx);
        if (pinAt < 0) return fail('PIN_REQUIRED');
      }
      res = postLedger({
        kind: 'ADJ', series: 'ADJ', ref: rf.ref, sess: sess, ctx: ctx, reauth: sess.owner, guardDocs: true, clockOn: cf.on,
        build: function (c) {
          var j, item, st, ap, inp, mv = [], lines = [], total = 0, def, mvv, pb;
          for (j = 0; j < al.lines.length; j++) {
            item = al.lines[j];
            def = ADJ_REASONS[item.reason];
            inp = {
              direction: item.qtyDelta > 0 ? 'up' : 'down', partCode: item.partCode, qty: Math.abs(item.qtyDelta), reason: def.fifo,
              at: c.at, ref: { grnNo: c.no, lineNo: j + 1 }
            };
            pb = P.rec.a.m;
            if (typeof pb === 'string' && pb.length >= 1 && pb.length <= 60) inp.proposedBy = pb;
            if (item.passCost !== null) inp.unitCostPaise = item.passCost;
            st = fifo.planAdjustment(c.clone, inp, c.fctx);
            ap = applyPlanned(c.clone, st, j, item.partCode);
            if (!ap.ok) return ap;
            mvv = ap.movement;
            mv.push(mvv);
            lines.push({
              partCode: item.partCode, qtyDelta: item.qtyDelta, reason: item.reason,
              unitCostPaise: item.qtyDelta > 0 ? mvv.unitCostPaise : null, valuePaise: Math.abs(mvv.valuePaise)
            });
            total += Math.abs(mvv.valuePaise);
          }
          return {
            ok: true, warnings: warns,
            body: {
              no: c.no, docDate: c.docDate, note: typeof b0.note === 'string' ? b0.note : '', lines: lines, mv: mv, proposalId: P.id,
              reasonClass: al.klass, totalAbsPaise: total,
              approval: { by: sess.name, role: sess.role, pinAt: pinAt, limitPaise: cfg.adjustLimitPaise }
            }
          };
        }
      });
      if (!res.ok) return res;
      rec = res.rec;
      P.state = 'POSTED';
      P.docNo = rec.b.no;
      P.postId = rec.id;
      return okDoc(rec, res.warnings.concat(res.storeWarnings), { proposalId: P.id });
    }

    // ------------------------------------------------------------ reversal

    function reverseDoc(docNo, reason, ctx) {
      var sess = dcSession(ctx), rd, rf, dn, rec, kind, rs, action, ru, today0, needPinNow, cf, res, g, pinAt = null;
      if (!sess) return fail('SESSION_REQUIRED');
      rd = ready();
      if (!rd.ok) return rd;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('ledger', rf.ref, ['REV']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return okDoc(dn.rec, [], { replayed: true });
      rec = typeof docNo === 'string' && dcHas(X.docs, docNo) ? X.docs[docNo] : null;
      if (!rec) return fail('DOC_NOT_FOUND');
      kind = rec.k;
      if (kind === 'OPN' || kind === 'ISS' || kind === 'RET') return fail('NOT_REVERSIBLE', { kind: kind });
      if (dcHas(X.revByNo, docNo)) return fail('STATE_INVALID', { state: 'REVERSED' });
      action = kind === 'GRN' ? 'REVERSE_GRN' : (kind === 'ADJ' ? 'REVERSE_ADJUST' : 'REVERSE_COUNTER_SALE');
      ru = dcRule(action, sess, X.cfg);
      if (!ru.ok) return fail(ru.code);
      rs = dcText(reason, 200);
      needPinNow = ru.needsPin === true;
      if (kind === 'CSL') {
        today0 = today();
        if (rec.b.docDate !== today0) {
          // Only the Owner may reverse an older counter sale, and then with a fresh PIN.
          if (!sess.owner) return fail('NOT_ALLOWED');
          needPinNow = true;
        }
      }
      if (needPinNow && !stepUpOk(ctx)) return fail('PIN_REQUIRED');
      if (rs === null || rs.length < 5) return fail('REASON_REQUIRED');
      g = { sess: sess, pinOk: stepUpOk(ctx) };
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      if (needPinNow || sess.owner) {
        pinAt = g.pinOk ? stampAt(ctx) : null;
        if (pinAt !== null && pinAt < 0) {
          if (needPinNow) return fail('PIN_REQUIRED');
          pinAt = null;
        }
      }
      res = postLedger({
        kind: 'REV', series: null, ref: rf.ref, sess: sess, ctx: ctx, reauth: g.pinOk, clockOn: cf.on,
        build: function (c) {
          var j, st, ap, mv = [], lines = [], origMv = rec.b.mv, back;
          for (j = origMv.length - 1; j >= 0; j--) {
            st = fifo.planReversal(c.clone, { reverses: origMv[j].id, at: c.at, note: rs }, c.fctx);
            if (!st || st.ok !== true) {
              back = st && st.code;
              if (back === 'LAYER_PARTLY_CONSUMED' || back === 'DEBT_ALREADY_SETTLED' || back === 'ISSUE_HAS_RETURNS') {
                return fail('REVERSAL_BLOCKED', { fifoCode: back, lineNo: j + 1, partCode: origMv[j].partCode });
              }
              if (back === 'ALREADY_REVERSED') return fail('STATE_INVALID', { state: 'REVERSED' });
              if (back === 'OPENING_NOT_REVERSIBLE') return fail('NOT_REVERSIBLE', { kind: 'OPN' });
              return lowerFail(st, { lineNo: j + 1, partCode: origMv[j].partCode });
            }
            ap = applyPlanned(c.clone, st, j, origMv[j].partCode);
            if (!ap.ok) return ap;
            mv.push(ap.movement);
            lines.push({ movementId: origMv[j].id });
          }
          return { ok: true, warnings: [], body: { docDate: c.docDate, note: '', reverses: docNo, reason: rs, pinAt: pinAt, lines: lines, mv: mv } };
        }
      });
      if (!res.ok) return res;
      return okDoc(res.rec, res.warnings.concat(res.storeWarnings), { reversed: docNo });
    }

    // ------------------------------------------------------------ old parts

    function oldTextFields(input) {
      var serial = dcText(input.serialRef, 40), claim = dcText(input.claimRef, 40), nt = dcText(input.note, 200);
      if (serial === null) return fail('INPUT_INVALID', { field: 'serialRef' });
      if (claim === null) return fail('INPUT_INVALID', { field: 'claimRef' });
      if (nt === null) return fail('INPUT_INVALID', { field: 'note' });
      return { ok: true, serialRef: serial, claimRef: claim, note: nt };
    }

    function registerOldPart(input, ctx) {
      var g = begin('OLD_REGISTER', ctx), rf, dn, tx, jobId = '', code = '', text, st, qty, warns = [], row, jb, cf, res, at, nn, tAt;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('defective', rf.ref, ['OLD_REGISTER']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, row: oldView(X.old[dn.rec.b.no]), replayed: true, warnings: [] };
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      tx = oldTextFields(input);
      if (!tx.ok) return tx;
      if (input.jobId !== undefined && input.jobId !== null && input.jobId !== '') {
        jb = jobCheck(input.jobId, false, warns);
        if (!jb.ok) return jb;
        jobId = jb.id;
      }
      text = dcText(input.partText, 60);
      if (text === null) return fail('INPUT_INVALID', { field: 'partText' });
      if (input.partCode !== undefined && input.partCode !== null && input.partCode !== '') {
        code = fifo.normalizePartCode(input.partCode);
        if (!code) return fail('PART_UNKNOWN');
        row = partRow(code, 'return', warns);
        if (!row.ok) return row.code === 'PART_UNKNOWN' ? fail('PART_UNKNOWN', { partCode: code }) : row;
      }
      if (code === '' && text === '') return fail('INPUT_INVALID', { field: 'partCode' });
      qty = input.qty;
      if (!dcPiece(qty)) return fail('QTY_INVALID');
      st = input.state;
      if (typeof st !== 'string' || !dcHas(OLD_STATES, st) || st === 'SCRAPPED') return fail('OLD_TRANSITION_INVALID', { state: st });
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      tAt = store.nextAt('defective', cf.on ? { clockOverride: true } : undefined);
      if (!tAt || tAt.ok !== true) return lowerFail(tAt);
      at = tAt.at;
      nn = store.nextNumber('OLD', at);
      if (!nn || nn.ok !== true) return lowerFail(nn);
      res = appendOneAt('defective', {
        k: 'OLD_REGISTER', series: 'OLD', r: rf.ref || undefined,
        b: { no: nn.no, jobId: jobId, partCode: code, partText: text, qty: qty, serialRef: tx.serialRef, state: st, claimRef: tx.claimRef, note: tx.note }
      }, g.sess, cf.on, at);
      if (!res.ok) return res;
      return { ok: true, row: oldView(X.old[nn.no]), warnings: warns.concat(res.storeWarnings) };
    }
    // Like appendOne but with a fixed record time (needed so the number and the time agree).
    function appendOneAt(stream, item, sess, clockOn, at) {
      var opts = { expectRev: X.revs[stream], actor: dcActor(sess), at: at }, res, rec;
      if (clockOn) opts.clockOverride = true;
      res = store.append(stream, [item], opts);
      if (!res || res.ok !== true) {
        afterFailedWrite(res);
        return lowerFail(res);
      }
      rec = res.records[0];
      X.revs[stream] = res.rev;
      if (stream === 'defective') ingestDefective(X, rec);
      return { ok: true, rec: rec, storeWarnings: res.warnings || [] };
    }

    function moveOldPart(oldNo, input, ctx) {
      var g = begin('OLD_MOVE', ctx), rf, dn, row, to, nt, tx, from, cf, res;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('defective', rf.ref, ['OLD_MOVE']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, row: oldView(X.old[dn.rec.b.oldNo]), replayed: true, warnings: [] };
      row = typeof oldNo === 'string' && dcHas(X.old, oldNo) ? X.old[oldNo] : null;
      if (!row) return fail('OLD_NOT_FOUND');
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      to = input.to;
      if (typeof to !== 'string' || !dcHas(OLD_STATES, to)) return fail('OLD_TRANSITION_INVALID', { from: row.state, to: to });
      if (to === 'SCRAPPED') return fail('OLD_TRANSITION_INVALID', { from: row.state, to: to, hint: 'use the monthly sign-off' });
      from = row.state;
      if (from === 'CUSTOMER_RETURNED' || from === 'SCRAPPED' || from === to) return fail('OLD_TRANSITION_INVALID', { from: from, to: to });
      tx = oldTextFields({ serialRef: '', claimRef: input.claimRef, note: input.note });
      if (!tx.ok) return tx;
      if ((to === 'SCRAP_PENDING' && from === 'HELD_FOR_CLAIM') || (to === 'HELD_FOR_CLAIM' && from === 'SCRAP_PENDING')) {
        if (tx.note.length < 5) return fail('OLD_NOTE_REQUIRED');
      }
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      res = appendOne('defective', { k: 'OLD_MOVE', b: { oldNo: oldNo, from: from, to: to, note: tx.note, claimRef: tx.claimRef }, r: rf.ref || undefined }, g.sess, cf.on, null);
      if (!res.ok) return res;
      return { ok: true, row: oldView(X.old[oldNo]), warnings: res.storeWarnings };
    }

    function signOffScrap(input, ctx) {
      var g = begin('SCRAP_SIGNOFF', ctx), rf, dn, pin, month, list, seen = dcMap(), i, no, row, nt, cf, nn, tAt, at, res, rows = [], t, pinAt;
      if (!g.ok) return g;
      rf = clientRef(ctx);
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone('defective', rf.ref, ['SCRAP_SIGNOFF']);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      if (dn && dn.rec) return { ok: true, signoff: signoffView(dn.rec.b.no), rows: [], replayed: true, warnings: [] };
      pin = needPin(g);
      if (pin) return pin;
      if (!dcIsObj(input)) return fail('INPUT_INVALID');
      month = input.month;
      if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('INPUT_INVALID', { field: 'month' });
      t = today();
      if (t.slice(0, 7) <= month) return fail('SIGNOFF_MONTH_OPEN');
      list = input.oldNos;
      if (!dcIsArr(list) || list.length < 1) return fail('SIGNOFF_EMPTY');
      if (list.length > DCS_MAX_LINES) return fail('TOO_MANY_LINES');
      nt = readNote(input.note, 0);
      if (!nt.ok) return nt;
      for (i = 0; i < list.length; i++) {
        no = list[i];
        row = typeof no === 'string' && dcHas(X.old, no) ? X.old[no] : null;
        if (!row) return fail('OLD_NOT_FOUND', { oldNo: String(no).slice(0, 20) });
        if (seen[no] || row.state !== 'SCRAP_PENDING' || row.scrapMonth > month) return fail('OLD_TRANSITION_INVALID', { oldNo: no, state: row.state });
        seen[no] = true;
      }
      pinAt = stampAt(ctx);
      if (pinAt < 0) return fail('PIN_REQUIRED');
      cf = clockFlag(ctx, g);
      if (!cf.ok) return cf;
      tAt = store.nextAt('defective', cf.on ? { clockOverride: true } : undefined);
      if (!tAt || tAt.ok !== true) return lowerFail(tAt);
      at = tAt.at;
      nn = store.nextNumber('SCR', at);
      if (!nn || nn.ok !== true) return lowerFail(nn);
      res = appendOneAt('defective', {
        k: 'SCRAP_SIGNOFF', series: 'SCR', r: rf.ref || undefined,
        b: { no: nn.no, month: month, oldNos: list.slice(), note: nt.value, pinAt: pinAt }
      }, g.sess, cf.on, at);
      if (!res.ok) return res;
      for (i = 0; i < list.length; i++) rows.push(oldView(X.old[list[i]]));
      return { ok: true, signoff: signoffView(nn.no), rows: rows, warnings: res.storeWarnings };
    }
    function signoffView(no) {
      var i, s;
      for (i = 0; i < X.signoffs.length; i++) {
        s = X.signoffs[i];
        if (s.no === no) return { id: s.id, no: s.no, month: s.month, oldNos: s.oldNos.slice(), count: s.count, note: s.note, at: s.at, by: dcCopy(s.by), pinAt: s.pinAt };
      }
      return null;
    }

    // ------------------------------------------------------------ reads (they never write and never need a PIN)

    function getDoc(docNo) {
      var rd = ready(), rec;
      if (!rd.ok) return rd;
      rec = typeof docNo === 'string' ? (dcHas(X.docs, docNo) ? X.docs[docNo] : (dcHas(X.byId, docNo) ? X.byId[docNo] : null)) : null;
      return rec ? { ok: true, doc: ledgerView(rec) } : fail('DOC_NOT_FOUND');
    }
    // q = {kind, fy, newestFirst, offset, limit}. Oldest first (posting order) unless newestFirst. total = matches before paging.
    function listDocs(q) {
      var rd = ready(), kind = '', fy = '', hit = [], out = [], i, rec, f, offset = 0, limit = -1, total;
      if (!rd.ok) return rd;
      if (dcIsObj(q)) {
        if (typeof q.kind === 'string') kind = q.kind;
        if (q.fy !== undefined && q.fy !== '') fy = dcFyArg(q.fy);
        if (q.fy !== undefined && q.fy !== '' && !fy) return fail('INPUT_INVALID', { field: 'fy' });
        if (q.offset !== undefined) {
          if (!dcIsInt(q.offset) || q.offset < 0) return fail('INPUT_INVALID', { field: 'offset' });
          offset = q.offset;
        }
        if (q.limit !== undefined) {
          if (!dcIsInt(q.limit) || q.limit < 0) return fail('INPUT_INVALID', { field: 'limit' });
          limit = q.limit;
        }
      }
      for (i = 0; i < X.docList.length; i++) {
        rec = X.docList[i];
        if (kind && rec.k !== kind) continue;
        if (fy) {
          f = financialYear(rec.b.docDate);
          if (f !== fy) continue;
        }
        hit.push(rec);
      }
      total = hit.length;
      if (dcIsObj(q) && q.newestFirst === true) hit.reverse();
      hit = limit < 0 ? hit.slice(offset) : hit.slice(offset, offset + limit);
      for (i = 0; i < hit.length; i++) out.push(ledgerView(hit[i]));
      return { ok: true, docs: out, total: total };
    }
    function listProposals(q) {
      var rd = ready(), kind = '', state = '', out = [], i, P;
      if (!rd.ok) return rd;
      if (dcIsObj(q)) {
        if (typeof q.kind === 'string') kind = q.kind;
        if (typeof q.state === 'string') state = q.state;
      }
      for (i = 0; i < X.propList.length; i++) {
        P = X.propList[i];
        if (kind && P.kind !== kind) continue;
        if (state && P.state !== state) continue;
        out.push(proposalView(P));
      }
      return { ok: true, proposals: out };
    }
    function outstandingOf(issue) {
      var out = 0 - issue.qty, rets, i, r;
      if (dcHas(X.reversedIds, issue.id)) return 0;
      rets = dcHas(X.retsOf, issue.id) ? X.retsOf[issue.id] : [];
      for (i = 0; i < rets.length; i++) {
        if (dcHas(X.reversedIds, rets[i])) continue;
        r = X.movById[rets[i]];
        out -= r.qty;
      }
      return out;
    }
    function jobStock(jobId) {
      var rd = ready(), id, moves, use, ids, issues = [], i, m, lines = [], j, net = 0;
      if (!rd.ok) return rd;
      id = dcText(jobId, 60);
      if (id === null || id === '') return fail('INPUT_INVALID', { field: 'jobId' });
      moves = dcHas(X.jobMoves, id) ? X.jobMoves[id] : [];
      use = moves.length ? fifo.jobUsage(moves, id) : { ok: true, issuedQty: 0, returnedQty: 0, netQty: 0, netValuePaise: 0, byPart: [] };
      if (!use || use.ok !== true) return lowerFail(use);
      ids = dcHas(X.jobIssues, id) ? X.jobIssues[id] : [];
      for (i = 0; i < ids.length; i++) {
        m = X.movById[ids[i]];
        issues.push({
          movementId: m.id, docNo: m.ref.grnNo, lineNo: m.ref.lineNo, partCode: m.partCode, qty: 0 - m.qty, outstanding: outstandingOf(m),
          reversed: dcHas(X.reversedIds, m.id), at: m.at
        });
      }
      for (j = 0; j < use.byPart.length; j++) {
        lines.push({ partCode: use.byPart[j].partCode, issued: use.byPart[j].issuedQty, returned: use.byPart[j].returnedQty, net: use.byPart[j].netQty });
        net += use.byPart[j].netQty;
      }
      return { ok: true, jobId: id, lines: lines, netTotal: net, netValuePaise: use.netValuePaise, issues: issues, byPart: use.byPart };
    }
    function pending() {
      var rd = ready(), op = [], ad = [], sp = [], groups = [], i, P, row, g;
      if (!rd.ok) return rd;
      for (i = 0; i < X.propList.length; i++) {
        P = X.propList[i];
        if (P.state !== 'PROPOSED') continue;
        if (P.kind === 'OPN') op.push(proposalView(P));
        else ad.push(proposalView(P));
      }
      for (i = 0; i < X.oldList.length; i++) {
        row = X.oldList[i];
        if (row.state === 'SCRAP_PENDING') sp.push(oldView(row));
      }
      sp.sort(function (a, b) {
        if (a.scrapMonth !== b.scrapMonth) return a.scrapMonth < b.scrapMonth ? -1 : 1;
        return a.no < b.no ? -1 : (a.no > b.no ? 1 : 0);
      });
      for (i = 0; i < sp.length; i++) {
        if (!groups.length || groups[groups.length - 1].month !== sp[i].scrapMonth) groups.push({ month: sp[i].scrapMonth, count: 0, rows: [] });
        g = groups[groups.length - 1];
        g.rows.push(sp[i]);
        g.count += 1;
      }
      return { ok: true, openings: op, adjustments: ad, scrapPending: sp, scrapGroups: groups };
    }
    function oldRegister(q) {
      var rd = ready(), st = '', job = '', month = '', out = [], i, row;
      if (!rd.ok) return rd;
      if (dcIsObj(q)) {
        if (typeof q.state === 'string') st = q.state;
        if (typeof q.jobId === 'string') job = q.jobId;
        if (typeof q.month === 'string') month = q.month;
      }
      for (i = 0; i < X.oldList.length; i++) {
        row = X.oldList[i];
        if (st && row.state !== st) continue;
        if (job && row.jobId !== job) continue;
        if (month && row.scrapMonth !== month) continue;
        out.push(oldView(row));
      }
      return { ok: true, rows: out };
    }
    function listSignoffs() {
      var rd = ready(), out = [], i;
      if (!rd.ok) return rd;
      for (i = 0; i < X.signoffs.length; i++) out.push(signoffView(X.signoffs[i].no));
      return { ok: true, signoffs: out };
    }
    function fifoState() {
      var rd = ready();
      if (!rd.ok) return rd;
      return fifo.cloneState(X.fifo);
    }
    function movements() {
      var rd = ready();
      if (!rd.ok) return rd;
      return X.moves.slice();
    }
    // Strict booleans for the masters layer. Anything uncertain answers "yes it has" (fail closed).
    function hasMovements(partCode) {
      var rd = ready(), code;
      if (!rd.ok) return true;
      code = fifo.normalizePartCode(partCode);
      if (!code) return true;
      return dcHas(X.moved, code);
    }
    function isReferenced(kind, code) {
      var rd = ready(), c, i, P, ls, j;
      if (!rd.ok) return true;
      if (kind === 'labour') return false;
      if (kind !== 'part') return true;
      c = fifo.normalizePartCode(code);
      if (!c) return true;
      if (dcHas(X.moved, c)) return true;
      for (i = 0; i < X.propList.length; i++) {
        P = X.propList[i];
        ls = dcIsArr(P.rec.b.lines) ? P.rec.b.lines : [];
        for (j = 0; j < ls.length; j++) if (ls[j] && ls[j].partCode === c) return true;
      }
      for (i = 0; i < X.oldList.length; i++) if (X.oldList[i].partCode === c) return true;
      return false;
    }
    function onHand(partCode) {
      var rd = ready();
      if (!rd.ok) return 1;
      return fifo.partBalance(X.fifo, partCode).qty;
    }
    function mastersDeps() {
      return { hasMovements: hasMovements, isReferenced: isReferenced, onHand: onHand };
    }

    function can(action, session) {
      var sess = dcSession({ session: session }), name = typeof action === 'string' ? action : '', r;
      if (dcHas(ACTION_ALIASES, name)) name = ACTION_ALIASES[name];
      if (ACTIONS.indexOf(name) < 0) return { ok: false, needsPin: false, code: 'INPUT_INVALID' };
      if (!sess) return { ok: false, needsPin: false, code: 'SESSION_REQUIRED' };
      r = dcRule(name, sess, X ? X.cfg : NO_CONFIG);
      return r;
    }

    function status() {
      var counts = { movements: 0, docs: 0, proposals: 0, pendingProposals: 0, oldParts: 0 }, i;
      if (X) {
        counts.movements = X.moves.length;
        counts.docs = X.docList.length;
        counts.proposals = X.propList.length;
        for (i = 0; i < X.propList.length; i++) if (X.propList[i].state === 'PROPOSED') counts.pendingProposals += 1;
        counts.oldParts = X.oldList.length;
      }
      return {
        ok: true, opened: isOpen, blocked: isBlocked, problems: lastProblems.slice(), watermark: lastWatermark,
        lastSeq: X ? lastSeqOf() : 0, lastAt: X ? lastAtOf() : '', revs: X ? { ledger: X.revs.ledger, docs: X.revs.docs, defective: X.revs.defective, config: X.revs.config } : null,
        counts: counts
      };
    }

    // Nothing may throw out of this layer. An unexpected error is reported and the next call reads storage afresh.
    function safe(fn) {
      return function () {
        try {
          return fn.apply(null, arguments);
        } catch (e) {
          isOpen = false;
          X = null;
          return fail('INTERNAL_ERROR', { error: String(e && e.message).slice(0, 120) });
        }
      };
    }
    function wrapAll(table) {
      var keys = Object.keys(table), i, out = {};
      for (i = 0; i < keys.length; i++) out[keys[i]] = typeof table[keys[i]] === 'function' ? safe(table[keys[i]]) : table[keys[i]];
      return out;
    }

    api = wrapAll({
      ok: true,
      version: 1,
      CODES: CODES,
      MESSAGES: MESSAGES,
      KINDS: KINDS,
      STATES: STATES,
      ADJ_REASONS: ADJ_REASONS,
      OLD_STATES: OLD_STATES,
      RETURN_REASONS: RETURN_REASONS,
      PAY_MODES: PAY_MODES,
      BILLING_MODES: BILLING_MODES,
      ACTIONS: ACTIONS,
      open: openIndex,
      status: status,
      can: can,
      config: config,
      setConfig: setConfig,
      proposeOpening: proposeOpening,
      approveOpening: approveOpening,
      rejectOpening: function (proposalId, reason, ctx) { return decideProposal('OPN', 'REJECT', proposalId, reason, ctx); },
      withdrawOpening: function (proposalId, ctx) { return decideProposal('OPN', 'WITHDRAW', proposalId, '', ctx); },
      receiveGoods: receiveGoods,
      issueToJob: issueToJob,
      returnFromJob: returnFromJob,
      counterSale: counterSale,
      proposeAdjustment: proposeAdjustment,
      approveAdjustment: approveAdjustment,
      rejectAdjustment: function (proposalId, reason, ctx) { return decideProposal('ADJ', 'REJECT', proposalId, reason, ctx); },
      withdrawAdjustment: function (proposalId, ctx) { return decideProposal('ADJ', 'WITHDRAW', proposalId, '', ctx); },
      reverseDoc: reverseDoc,
      registerOldPart: registerOldPart,
      moveOldPart: moveOldPart,
      signOffScrap: signOffScrap,
      getDoc: getDoc,
      listDocs: listDocs,
      listProposals: listProposals,
      jobStock: jobStock,
      pending: pending,
      oldRegister: oldRegister,
      listSignoffs: listSignoffs,
      fifoState: fifoState,
      movements: movements,
      hasMovements: hasMovements,
      isReferenced: isReferenced,
      onHand: onHand,
      mastersDeps: mastersDeps
    });
    return Object.freeze(api);
  }

  function dcCheckDeps(deps) {
    var s, names, i, f;
    function bad(why) {
      return { ok: false, code: 'DEPS_INVALID', message: MESSAGES.DEPS_INVALID, detail: why };
    }
    if (!dcIsObj(deps)) return bad('deps');
    s = deps.store;
    if (dcIsObj(s) && dcIsObj(s.store)) s = s.store;
    if (!s || typeof s !== 'object') return bad('store');
    names = ['open', 'append', 'head', 'nextAt', 'nextNumber', 'findRef'];
    for (i = 0; i < names.length; i++) if (typeof s[names[i]] !== 'function') return bad('store.' + names[i]);
    f = deps.fifo;
    if (!f || typeof f !== 'object') return bad('fifo');
    names = ['cloneState', 'applyMovement', 'replay', 'planOpening', 'planReceipt', 'planIssueToJob', 'planReturnFromJob',
      'planCounterSale', 'planAdjustment', 'planReversal', 'previewIssue', 'previewExcessCostPaise', 'partBalance', 'jobUsage',
      'normalizePartCode', 'istDate'];
    for (i = 0; i < names.length; i++) if (typeof f[names[i]] !== 'function') return bad('fifo.' + names[i]);
    if (!deps.masters || typeof deps.masters.getRow !== 'function' || typeof deps.masters.canUse !== 'function') return bad('masters');
    if (typeof deps.now !== 'function') return bad('now');
    if (!deps.cases || typeof deps.cases.get !== 'function') return bad('cases');
    return { ok: true, store: s };
  }

  return Object.freeze({
    version: 1,
    CODES: CODES,
    MESSAGES: MESSAGES,
    KINDS: KINDS,
    STATES: STATES,
    ADJ_REASONS: ADJ_REASONS,
    OLD_STATES: OLD_STATES,
    RETURN_REASONS: RETURN_REASONS,
    PAY_MODES: PAY_MODES,
    BILLING_MODES: BILLING_MODES,
    ACTIONS: ACTIONS,
    SHELL_ROLES: SHELL_ROLES,
    financialYear: financialYear,
    create: create
  });
});
