(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingDocs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Billing records for the Service module: estimate versions and approvals, the bill (invoice record),
  // cancel, credit note, no-charge job sheet, void, billing settings and the hand-over of the old bill counter.
  // Pure: no screen, no timer, no clock of its own. The caller passes the shared store, the bill arithmetic,
  // the masters layer, the Stores docs api (read side), the money api (read side), a job lookup and a clock.
  // One business record is ONE record written by ONE store.append call (the first bill after the old
  // counter is handed over is the only two-record write). Money is whole paise, quantity whole pieces.
  // No customer name or contact details is ever stored: only the recipient tax id and state code.

  var SBD_PIN_FRESH_MS = 120000;
  var SBD_IST_MS = 19800000;
  var SBD_SELLER_STATE = '27';
  var SBD_MAX_OTHER = 10;
  var SBD_MAX_LINES = 100;
  var SBD_MAX_QTY = 9999;
  var SBD_LIMIT_CEILING = 100000000;
  var SBD_APPROVAL_DAYS_MS = 7 * 86400000;
  var SBD_BATCH_MAX = 200;
  var SBD_SEED_MAX = 99999;
  var SBD_GENERIC_TEXT = 'The billing area could not finish this. Nothing was recorded.';
  var SBD_SHELL_ROLES = ['Store Manager', 'Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];
  var SBD_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{2,63}$/;
  var SBD_REASON_CLASSES = ['RETURN', 'PRICE', 'SERVICE', 'OTHER'];
  // the exact keys of an old-bill body (plan 2.4): anything else, such as a customer field, is refused
  var SBD_LEGACY_KEYS = ['legacyNo', 'jobId', 'basis', 'invoiceDate', 'gstBp', 'listedPaise', 'adjustmentPaise', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'gstPaise', 'roundOffPaise', 'totalPaise', 'finalPaise', 'payMode', 'lineCount', 'correctionCount', 'snapshotSha', 'warn'];

  function sbdFreeze(o) {
    var keys, i;
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
    keys = Object.keys(o);
    for (i = 0; i < keys.length; i++) sbdFreeze(o[keys[i]]);
    return Object.freeze(o);
  }

  var METHODS = sbdFreeze(['WHATSAPP', 'CALL', 'IN_PERSON', 'SIGNED', 'OTHER']);
  var MODES = sbdFreeze(['CCPT_BILLED', 'NOT_IN_CCPT']);
  var ESTIMATE_STATES = sbdFreeze(['NONE', 'DRAFT', 'APPROVED', 'REAPPROVAL_NEEDED', 'BILLED', 'VOID']);
  var INVOICE_STATES = sbdFreeze(['ISSUED', 'CANCELLED', 'CREDITED_PARTLY', 'CREDITED_FULLY', 'LEGACY']);
  var DEFAULT_CONFIG = sbdFreeze({ discountLimitPaise: 0, billingRoles: [], estimateRoles: ['Technician', 'Assistant Technician'] });
  var ROLE_ACTIONS = sbdFreeze([
    'VIEW_STATUS', 'VIEW_AMOUNTS', 'VIEW_COST', 'VIEW_REGISTERS', 'EST_SAVE', 'EST_OTHER_LINE', 'EST_APPROVE', 'APPROVAL_OVERRIDE',
    'INV_ISSUE', 'DISCOUNT', 'DISCOUNT_ABOVE_LIMIT', 'NOT_IN_CCPT', 'CCPT_ADD', 'CCPT_CHANGE', 'INV_CANCEL', 'CN_ISSUE',
    'CN_STOCK_RETURN', 'NCS_ISSUE', 'NCS_CANCEL', 'JOB_VOID', 'BCFG_SET', 'IMPORT_LEGACY'
  ]);
  var KINDS = sbdFreeze({
    EST_SAVE: 'Estimate version', EST_APPROVE: 'Estimate approval', SERIES_SEED: 'Old bill counter hand-over', INV_ISSUE: 'Service bill',
    INV_CANCEL: 'Bill cancelled', INV_CCPT: 'CCPT invoice number', CN_ISSUE: 'Credit note', NCS_ISSUE: 'No-charge job sheet',
    NCS_CANCEL: 'No-charge sheet cancelled', JOB_VOID: 'Job void', BCFG_SET: 'Billing settings', INV_LEGACY: 'Old bill brought in'
  });

  var MESSAGE_ROWS = [
    ['SESSION_REQUIRED', 'Sign in again. Your user could not be read.'],
    ['PAST_VIEW', 'You are looking at an earlier day. Nothing can be changed here.'],
    ['NOT_ALLOWED', 'Your role cannot do this.'],
    ['PIN_REQUIRED', 'The Owner PIN check is needed for this.'],
    ['DEPS_INVALID', 'Billing is not ready. Reopen the Service module.'],
    ['INPUT_INVALID', 'Some details are missing or not valid.'],
    ['BACKDATE_NOT_ALLOWED', 'Entries are always dated today.'],
    ['LINES_REQUIRED', 'Add at least one line.'],
    ['TOO_MANY_LINES', 'There are too many lines.'],
    ['DUPLICATE_LINE', 'The same item is listed twice. Combine the quantities.'],
    ['PART_UNKNOWN', 'This part code is not in the parts master.'],
    ['PART_INACTIVE', 'This part is switched off in the parts master.'],
    ['LABOUR_UNKNOWN', 'This labour code is not in the labour master.'],
    ['QTY_INVALID', 'The quantity must be a whole number from 1 to 9999.'],
    ['JOB_NOT_FOUND', 'The service job was not found.'],
    ['JOB_CLOSED', 'This job is closed. This cannot be done now.'],
    ['JOB_CLOSED_OLD_WAY', 'This job was closed the old way. CCPT holds its invoice.'],
    ['JOB_VOIDED', 'This job is void.'],
    ['JOB_LOCKED', 'This job already has a bill or a no-charge sheet.'],
    ['JOB_IS_STUB', 'This job is a placeholder (stub). Check the job details later.'],
    ['REASON_REQUIRED', 'A reason of at least 5 characters is needed.'],
    ['DOC_NOT_FOUND', 'That entry was not found.'],
    ['STATE_INVALID', 'This entry is not in a state where this can be done.'],
    ['ABOVE_MANAGER_LIMIT', 'This discount is above the limit set for the Store Manager.'],
    ['INTERNAL_ERROR', 'Unexpected error. Nothing was recorded.'],
    ['BILLING_BLOCKED', 'Billing records failed their safety check. Restore your latest backup.'],
    ['TAX_DETAILS_MISSING', 'Tax details are missing. Add the HSN or SAC code and the GST rate first.'],
    ['PRICE_NOT_FROM_MASTER', 'Prices come from the master. Use a discount on the bill.'],
    ['TOO_MANY_OTHER_LINES', 'At most 10 other lines are allowed. Use the masters.'],
    ['GSTIN_INVALID', 'The customer GSTIN is not in the right format.'],
    ['NO_CHANGE', 'Nothing changed since the last saved version.'],
    ['ESTIMATE_NOT_FOUND', 'That estimate version was not found.'],
    ['ESTIMATE_NOT_LATEST', 'Approve the latest estimate version.'],
    ['AMOUNT_MISMATCH', 'The approved amount must equal the estimate total.'],
    ['APPROVAL_TIME_INVALID', 'The approval time must be after the estimate and within 7 days.'],
    ['ALREADY_APPROVED', 'This estimate version is already approved.'],
    ['NO_APPROVAL', 'The customer approval is not recorded for this estimate.'],
    ['REAPPROVAL_REQUIRED', 'The bill is above the approved amount. Record a new approval.'],
    ['NO_CHARGE_JOB', 'This is a no-charge warranty job. Use the no-charge job sheet.'],
    ['NOT_NO_CHARGE_JOB', 'This job is not marked no-charge warranty.'],
    ['INVOICE_ALREADY_ISSUED', 'This job already has a bill.'],
    ['ISSUED_PART_UNBILLED', 'Some parts issued to this job are not on the bill.'],
    ['BILLED_PART_NOT_ISSUED', 'Some parts on the bill were never issued to this job from Stores.'],
    ['ISSUE_BILLING_MISMATCH', 'Some parts were issued as chargeable on a no-charge job.'],
    ['DISCOUNT_NOT_ALLOWED', 'Staff cannot give a discount. Ask the Store Manager.'],
    ['DISCOUNT_REASON_REQUIRED', 'Write the reason for the discount (5 characters or more).'],
    ['NOT_IN_CCPT_OWNER_ONLY', 'Only the Owner can mark a job as not billed in CCPT.'],
    ['DUPLICATE_CCPT_INVOICE', 'This CCPT invoice number is already on another bill.'],
    ['CALC_INCONSISTENT', 'The bill figures do not add up. Nothing was saved.'],
    ['ADVANCE_EXCEEDS_BILL', 'The advance held is more than this bill. Refund the extra first.'],
    ['INVOICE_CANCELLED', 'This bill is cancelled.'],
    ['CANCEL_SAME_DAY_ONLY', 'A bill can be cancelled only on its day. Use a credit note.'],
    ['CANCEL_HAS_CREDIT', 'A credit note exists on this bill, so it cannot be cancelled.'],
    ['LEGACY_READ_ONLY', 'This is an old bill. It cannot be cancelled or credited here.'],
    ['LEGACY_CONFLICT', 'An old bill record conflicts with one already saved.'],
    ['CREDIT_EXCEEDS_INVOICE', 'The credit is more than what is left on this bill.'],
    ['CREDIT_EMPTY', 'Choose what to credit. A zero-rupee note must take parts back.'],
    ['WARRANTY_NOT_CREDITABLE', 'A warranty line has no money to credit.'],
    ['CREDIT_RETURN_INVALID', 'This stock return does not match the credit note.'],
    ['RECEIPT_SET_OFF', 'This receipt is set off on a live bill. Cancel the bill first.'],
    ['LEGACY_ADVANCE_UNCONFIRMED', 'The Owner must confirm the old advance first.'],
    ['SHEET_ALREADY_ISSUED', 'This job already has a no-charge sheet.'],
    ['VOID_INVOICE_ACTIVE', 'Cancel or fully credit the bill before voiding the job.'],
    ['VOID_STOCK_PENDING', 'Parts credited back are not yet back in stock.'],
    ['VOID_SHEET_ACTIVE', 'Cancel the no-charge sheet before voiding the job.'],
    ['VOID_PARTS_OUTSTANDING', 'Parts are still issued to this job. Return them to stock first.'],
    ['VOID_MONEY_HELD', 'Money is still held for this job. Refund it first.'],
    ['COST_MISMATCH', 'The stored cost does not match the stock records.'],
    ['SVCS_ARGS_INVALID', 'The request was not valid. Check the entries and try again.'],
    ['SVCS_BLOCKED', 'Service data failed its safety check. Restore your latest backup.'],
    ['SVCS_WRITE_FAILED', 'The save could not be confirmed. Reopen and check the list first.'],
    ['SVCS_READBACK_MISMATCH', 'The save could not be read back. Reopen and check the list first.'],
    ['SVCS_HEAD_WRITE_FAILED', 'The save was not finished. Reopen and check the list first.'],
    ['SVCS_HEAD_BEHIND', 'A save was not finished. Reopen and check before posting again.'],
    ['SVCS_REV_CONFLICT', 'The records changed on another screen. Reload and try again.'],
    ['SVCS_SERIES_MISMATCH', 'The bill number changed. Reload and try again.'],
    ['SVCS_CLOCK_BACK', 'The tablet clock is behind the last entry. Fix the clock.'],
    ['SVCS_SERIES_TOO_LONG', 'The number would be too long.'],
    ['SVCS_DOC_TOO_LARGE', 'This entry is too large.'],
    ['SVCS_STORAGE_UNAVAILABLE', 'Storage is not ready yet. Try again in a moment.'],
    ['SVCS_DUPLICATE_REF', 'This was already saved. Check the list first.']
  ];
  var CODES = {}, MESSAGES = {};
  MESSAGE_ROWS.forEach(function (m) { CODES[m[0]] = m[0]; MESSAGES[m[0]] = m[1]; });
  Object.freeze(CODES);
  Object.freeze(MESSAGES);


  function sbdHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function sbdObj(x) { return x !== null && typeof x === 'object' && Object.prototype.toString.call(x) === '[object Object]'; }
  function sbdArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
  function sbdInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && Math.abs(x) <= 9007199254740991; }
  function sbdMap() { return Object.create(null); }
  function sbdPad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function sbdCopy(v) { return v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function sbdMax(a, b) { return a > b ? a : b; }
  function sbdText(v, max) {
    var s;
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') return null;
    s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    return s.length > max ? null : s;
  }
  function sbdIstDate(iso) {
    var ms = typeof iso === 'number' ? iso : Date.parse(iso), d;
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    d = new Date(ms + SBD_IST_MS);
    return sbdPad(d.getUTCFullYear(), 4) + '-' + sbdPad(d.getUTCMonth() + 1, 2) + '-' + sbdPad(d.getUTCDate(), 2);
  }
  function sbdFyLong(iso) {
    var date = sbdIstDate(iso), y;
    if (!date) return '';
    y = +date.slice(0, 4);
    if (+date.slice(5, 7) < 4) y -= 1;
    return sbdPad(y, 4) + '-' + sbdPad((y + 1) % 100, 2);
  }
  // The same lines, prices and recipient give the same key (stored text has its keys sorted, so no text compare).
  function sbdInputKey(inp) {
    var out = [inp.recipientGstin, inp.recipientStateCode, inp.billDiscountPaise], i, l;
    for (i = 0; i < inp.lines.length; i++) {
      l = inp.lines[i];
      out.push([l.kind, l.code, l.name, l.hsnSac, l.rateBp, l.priceBasis, l.unitPricePaise, l.qty, l.discountPaise]);
    }
    return JSON.stringify(out);
  }
  function sbdNormCcpt(s) { return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, ''); }
  function sbdListEq(a, b) {
    var i;
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function sbdRoleList(list) {
    var out = [], i;
    if (!sbdArr(list)) return null;
    for (i = 0; i < list.length; i++) {
      if (typeof list[i] !== 'string' || SBD_SHELL_ROLES.indexOf(list[i]) < 0 || list[i] === 'Store Manager' || out.indexOf(list[i]) >= 0) return null;
      out.push(list[i]);
    }
    return out;
  }
  function sbdLimitOk(v) { return sbdInt(v) && v >= 0 && v <= SBD_LIMIT_CEILING; }
  function sbdIso(v) {
    var ms;
    if (typeof v === 'number') ms = v;
    else if (typeof v === 'string') ms = Date.parse(v);
    else return null;
    return typeof ms === 'number' && isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  function sbdSumsOk(bill) {
    var t, i, ln, a = 0, tx = 0, c = 0, s = 0, g = 0;
    if (!sbdObj(bill) || !sbdObj(bill.totals) || !sbdArr(bill.lines) || !sbdObj(bill.supply)) return false;
    t = bill.totals;
    for (i = 0; i < bill.lines.length; i++) {
      ln = bill.lines[i];
      if (!sbdInt(ln.taxablePaise) || !sbdInt(ln.cgstPaise) || !sbdInt(ln.sgstPaise) || !sbdInt(ln.igstPaise) || !sbdInt(ln.totalPaise)) return false;
      if (ln.totalPaise !== ln.taxablePaise + ln.cgstPaise + ln.sgstPaise + ln.igstPaise) return false;
      a += ln.totalPaise;
      tx += ln.taxablePaise;
      c += ln.cgstPaise;
      s += ln.sgstPaise;
      g += ln.igstPaise;
    }
    if (t.taxablePaise !== tx || t.cgstPaise !== c || t.sgstPaise !== s || t.igstPaise !== g) return false;
    if (!sbdInt(t.roundOffPaise) || Math.abs(t.roundOffPaise) >= 100) return false;
    if (t.totalPaise !== tx + c + s + g + t.roundOffPaise) return false;
    if (bill.supply.type === 'INTRA' && g !== 0) return false;
    if (bill.supply.type === 'INTER' && (c !== 0 || s !== 0)) return false;
    return true;
  }

  // The pure checks of a legacy (old bill) body, exported so the migration can test its output before writing.
  function validateLegacyBody(b) {
    var ints = ['gstBp', 'listedPaise', 'adjustmentPaise', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'gstPaise', 'roundOffPaise', 'totalPaise', 'finalPaise', 'lineCount', 'correctionCount'];
    var i, w;
    if (!sbdObj(b)) return { ok: false, code: 'INPUT_INVALID', message: MESSAGES.INPUT_INVALID, detail: { field: 'body' } };
    function bad(field) { return { ok: false, code: 'INPUT_INVALID', message: MESSAGES.INPUT_INVALID, detail: { field: field } }; }
    var have = Object.keys(b);
    if (have.length !== SBD_LEGACY_KEYS.length) return bad('keys');
    for (i = 0; i < have.length; i++) if (SBD_LEGACY_KEYS.indexOf(have[i]) < 0) return bad('keys');
    if (typeof b.legacyNo !== 'string' || b.legacyNo.length < 1 || b.legacyNo.length > 40) return bad('legacyNo');
    if (typeof b.jobId !== 'string' || b.jobId.length < 1 || b.jobId.length > 60) return bad('jobId');
    if (b.basis !== 'SNAPSHOT_V1' && b.basis !== 'LIVE_CASE') return bad('basis');
    if (typeof b.invoiceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.invoiceDate)) return bad('invoiceDate');
    for (i = 0; i < ints.length; i++) if (!sbdInt(b[ints[i]])) return bad(ints[i]);
    if (b.igstPaise !== 0 || b.gstBp < 0 || b.gstBp > 10000 || b.totalPaise < 0 || b.finalPaise < 0 || b.lineCount < 0 || b.correctionCount < 0) return bad('figures');
    if (typeof b.payMode !== 'string' || b.payMode.length > 40) return bad('payMode');
    if (b.snapshotSha !== null && (typeof b.snapshotSha !== 'string' || !/^[0-9a-f]{64}$/.test(b.snapshotSha))) return bad('snapshotSha');
    if (!sbdArr(b.warn) || b.warn.length > 20) return bad('warn');
    for (i = 0; i < b.warn.length; i++) {
      w = b.warn[i];
      if (typeof w !== 'string' || !/^[A-Z][A-Z0-9_]{1,39}$/.test(w)) return bad('warn');
    }
    return { ok: true };
  }

  function sbdSession(ctx) {
    var s, tier, role = '', name = '';
    try {
      s = sbdObj(ctx) ? ctx.session : null;
      if (!sbdObj(s) || s.ok !== true) return null;
      tier = s.tier;
      if (tier === 'owner' && s.isOwner !== true) return null;
      if (tier === 'manager' && (s.isManager !== true || s.isOwner === true)) return null;
      if (tier === 'staff' && (s.isOwner === true || s.isManager === true)) return null;
      if (tier !== 'owner' && tier !== 'manager' && tier !== 'staff') return null;
      role = typeof s.role === 'string' ? s.role.slice(0, 40) : '';
      name = typeof s.actorName === 'string' ? s.actorName.slice(0, 60) : '';
      return { tier: tier, role: role, name: name, owner: tier === 'owner', manager: tier === 'manager' };
    } catch (e) {
      // a session that cannot be read is a broken session: refused, never trusted
      return null;
    }
  }
  function sbdActor(sess) { return { t: sess.tier, r: sess.role, m: sess.name }; }

  // One table for who may do what (plan 2.11). cfg = the billing settings in force.
  function sbdRule(action, sess, cfg, stockCan) {
    var own = sess.owner, mgr = sess.manager, staff = sess.tier === 'staff';
    var billing = staff && cfg.billingRoles.indexOf(sess.role) >= 0;
    var est = staff && cfg.estimateRoles.indexOf(sess.role) >= 0;
    function yes(pin) { return { ok: true, needsPin: pin === true }; }
    function no(code) { return { ok: false, needsPin: false, code: code || 'NOT_ALLOWED' }; }
    switch (action) {
      case 'VIEW_STATUS': return yes(false);
      case 'VIEW_AMOUNTS':
      case 'INV_ISSUE':
      case 'CCPT_ADD':
        return (own || mgr || billing) ? yes(false) : no();
      case 'EST_SAVE':
      case 'EST_APPROVE':
        return (own || mgr || billing || est) ? yes(false) : no();
      case 'EST_OTHER_LINE':
      case 'DISCOUNT':
      case 'NCS_ISSUE':
      case 'VIEW_COST':
      case 'VIEW_REGISTERS':
        return (own || mgr) ? yes(false) : no();
      case 'NOT_IN_CCPT': return own ? yes(true) : no('NOT_IN_CCPT_OWNER_ONLY');
      case 'APPROVAL_OVERRIDE':
      case 'DISCOUNT_ABOVE_LIMIT':
      case 'CCPT_CHANGE':
      case 'INV_CANCEL':
      case 'CN_ISSUE':
      case 'NCS_CANCEL':
      case 'JOB_VOID':
      case 'BCFG_SET':
      case 'IMPORT_LEGACY':
        return own ? yes(true) : no();
      case 'CN_STOCK_RETURN':
        if (own || mgr) return yes(false);
        return stockCan && stockCan(sess) ? yes(false) : no();
      default: return no('INPUT_INVALID');
    }
  }

  function sbdCheckDeps(deps) {
    var s, names;
    function bad(why) { return { ok: false, code: 'DEPS_INVALID', message: MESSAGES.DEPS_INVALID, detail: why }; }
    function fnsOf(o, list, label) {
      var j;
      if (!o || typeof o !== 'object') return label;
      for (j = 0; j < list.length; j++) if (typeof o[list[j]] !== 'function') return label + '.' + list[j];
      return '';
    }
    if (!sbdObj(deps)) return bad('deps');
    s = deps.store;
    if (sbdObj(s) && sbdObj(s.store)) s = s.store;
    names = fnsOf(s, ['read', 'append', 'findRef', 'head', 'nextAt', 'nextNumber', 'lastNumber', 'open'], 'store');
    if (names) return bad(names);
    names = fnsOf(deps.calc, ['computeBill', 'verifyBill', 'computeCreditNote', 'creditRemaining', 'validateGstin'], 'calc');
    if (names) return bad(names);
    names = fnsOf(deps.masters, ['getRow', 'canUse', 'isTaxPending', 'normalizeCode'], 'masters');
    if (names) return bad(names);
    names = fnsOf(deps.stock, ['jobStock', 'getDoc', 'movements', 'listDocs'], 'stock');
    if (names) return bad(names);
    if (typeof deps.now !== 'function') return bad('now');
    if (!deps.cases || typeof deps.cases.get !== 'function') return bad('cases');
    if (deps.money !== undefined && deps.money !== null) {
      names = fnsOf(deps.money, ['jobMoney'], 'money');
      if (names) return bad(names);
    }
    return { ok: true, store: s };
  }


  function create(deps) {
    var ck = sbdCheckDeps(deps);
    var store, calc, masters, stock, money, cases, clockFn;
    var X = null;          // the adopted index (null until a clean read)
    var dirty = true;      // a write may have landed or failed: read storage again before the next call
    var api;

    if (!ck.ok) return ck;
    store = ck.store;
    calc = deps.calc;
    masters = deps.masters;
    stock = deps.stock;
    money = deps.money || null;
    cases = deps.cases;
    clockFn = deps.now;


    function fail(code, detail) {
      var r = { ok: false, code: code, message: sbdHas(MESSAGES, code) ? MESSAGES[code] : SBD_GENERIC_TEXT };
      if (detail !== undefined) r.detail = detail;
      return r;
    }
    function lowerFail(res, extra) {
      var code = res && typeof res.code === 'string' ? res.code : 'SVCS_STORAGE_UNAVAILABLE', out;
      if (code === 'ROLE_DENIED') code = 'NOT_ALLOWED';
      else if (code === 'REAUTH_REQUIRED') code = 'PIN_REQUIRED';
      else if (code === 'SESSION_INVALID') code = 'SESSION_REQUIRED';
      out = { ok: false, code: code, message: sbdHas(MESSAGES, code) ? MESSAGES[code] : (res && typeof res.message === 'string' && res.message ? res.message : SBD_GENERIC_TEXT) };
      if (res && res.detail !== undefined) out.detail = res.detail;
      if (res && res.committed === true) out.committed = true;
      if (res && typeof res.stream === 'string') out.stream = res.stream;
      if (res && typeof res.key === 'string') out.key = res.key;
      if (extra !== undefined) out.detail = extra;
      return out;
    }
    function blockedFail() {
      return fail('BILLING_BLOCKED', X && X.problems.length ? X.problems[0] : undefined);
    }


    function nowDate() {
      var v;
      try { v = clockFn(); } catch (e) { return null; }
      if (v && typeof v.getTime === 'function' && isFinite(v.getTime())) return v;
      if (typeof v === 'number' && isFinite(v)) return new Date(v);
      return null;
    }
    function nowMs() {
      var d = nowDate();
      return d ? d.getTime() : null;
    }
    function today() {
      var ms = nowMs();
      return ms === null ? '' : sbdIstDate(ms);
    }
    function stampAt(ctx) {
      var st = sbdObj(ctx) ? ctx.stepUp : null, ms = nowMs(), ok, at;
      if (ms === null || !sbdObj(st)) return -1;
      ok = st.ok;
      at = st.at;
      if (ok !== true || !sbdInt(at)) return -1;
      return ms - at >= 0 && ms - at <= SBD_PIN_FRESH_MS ? at : -1;
    }


    function newIndex() {
      return {
        rev: -1, h: '', problems: [], est: sbdMap(), inv: sbdMap(), invList: [], invByJob: sbdMap(), legacyJob: sbdMap(),
        cn: sbdMap(), cnList: [], sheets: sbdMap(), sheetList: [], sheetByJob: sbdMap(), voids: sbdMap(), cfg: [], jobs: sbdMap(),
        legacyLast: sbdMap(), cfgCache: null
      };
    }
    function pushTo(map, key, v) {
      if (!sbdHas(map, key)) map[key] = [];
      map[key].push(v);
    }
    function activeOf(Y, jobId) {
      var list = sbdHas(Y.invByJob, jobId) ? Y.invByJob[jobId] : [], i;
      for (i = list.length - 1; i >= 0; i--) if (Y.inv[list[i]].state !== 'CANCELLED') return Y.inv[list[i]];
      return null;
    }
    function liveBillOf(Y, jobId) {
      var e = activeOf(Y, jobId);
      return e && e.state !== 'CREDITED_FULLY' ? e : null;
    }
    function sheetOf(Y, jobId) {
      var list = sbdHas(Y.sheetByJob, jobId) ? Y.sheetByJob[jobId] : [], i;
      for (i = list.length - 1; i >= 0; i--) if (!Y.sheets[list[i]].cancel) return Y.sheets[list[i]];
      return null;
    }
    function restate(e) {
      var priors = [], r, i, full = true;
      if (e.legacy) { e.state = 'LEGACY'; return ''; }
      if (e.cancel) { e.state = 'CANCELLED'; return ''; }
      if (!e.credits.length) { e.state = 'ISSUED'; e.remaining = null; return ''; }
      for (i = 0; i < e.credits.length; i++) priors.push(e.credits[i].b.credit);
      r = calc.creditRemaining(e.rec.b.bill, priors);
      if (!r || r.ok !== true) return 'credit remainder of ' + e.no;
      for (i = 0; i < r.lines.length; i++) if (r.lines[i].qty > 0 || r.lines[i].taxablePaise > 0) full = false;
      e.remaining = r;
      e.state = full ? 'CREDITED_FULLY' : 'CREDITED_PARTLY';
      return '';
    }
    function billShapeOk(bill) {
      return sbdObj(bill) && bill.ok === true && sbdObj(bill.totals) && sbdInt(bill.totals.totalPaise) && sbdArr(bill.lines) && sbdObj(bill.input) && sbdObj(bill.supply);
    }
    function ingest(Y, rec) {
      var b = rec.b, k = rec.k, jid, e, m, s;
      if (!sbdObj(b)) return 'record body';
      jid = typeof b.jobId === 'string' && b.jobId ? b.jobId : '';
      if (k === 'EST_SAVE') {
        if (!jid || !sbdInt(b.version) || typeof b.prevId !== 'string' || !billShapeOk(b.bill)) return 'estimate record';
        if (sbdHas(Y.voids, jid)) return 'estimate after void';
        if (!sbdHas(Y.est, jid)) Y.est[jid] = { versions: [], approvals: [] };
        if (b.version !== Y.est[jid].versions.length + 1) return 'estimate version';
        Y.est[jid].versions.push(rec);
      } else if (k === 'EST_APPROVE') {
        if (!jid || !sbdInt(b.version) || !sbdInt(b.amountPaise) || typeof b.estimateId !== 'string' || METHODS.indexOf(b.method) < 0) return 'approval record';
        if (!sbdHas(Y.est, jid) || b.version < 1 || b.version > Y.est[jid].versions.length) return 'approval version';
        Y.est[jid].approvals.push(rec);
      } else if (k === 'SERIES_SEED') {
        if (!sbdObj(b.seriesSeed)) return 'series seed';
      } else if (k === 'INV_ISSUE') {
        if (!jid || typeof b.no !== 'string' || MODES.indexOf(b.mode) < 0 || !billShapeOk(b.bill) || !sbdArr(b.stock) || !sbdArr(b.warranty)) return 'bill record';
        if (!sbdObj(b.setOff) || !sbdInt(b.setOff.advancePaise) || !sbdArr(b.setOff.receipts) || !sbdInt(b.balanceDuePaise) || typeof b.ccptInvoiceNo !== 'string') return 'bill record';
        if (sbdHas(Y.inv, b.no)) return 'bill number used twice';
        if (activeOf(Y, jid) || sheetOf(Y, jid) || sbdHas(Y.voids, jid)) return 'second bill on a job';
        e = { rec: rec, legacy: false, no: b.no, jobId: jid, cancel: null, ccpts: [], credits: [], remaining: null, state: 'ISSUED' };
        Y.inv[b.no] = e;
        Y.invList.push(b.no);
        pushTo(Y.invByJob, jid, b.no);
      } else if (k === 'INV_LEGACY') {
        if (!validateLegacyBody(b).ok) return 'old bill record';
        if (sbdHas(Y.inv, b.legacyNo) || sbdHas(Y.legacyJob, jid)) return 'old bill used twice';
        if (activeOf(Y, jid)) return 'old bill on a billed job';
        e = { rec: rec, legacy: true, no: b.legacyNo, jobId: jid, cancel: null, ccpts: [], credits: [], remaining: null, state: 'LEGACY' };
        Y.inv[b.legacyNo] = e;
        Y.invList.push(b.legacyNo);
        pushTo(Y.invByJob, jid, b.legacyNo);
        Y.legacyJob[jid] = b.legacyNo;
        m = /^SV\/(\d{4}-\d{2})\/(\d+)$/.exec(b.legacyNo);
        if (m && (!sbdHas(Y.legacyLast, m[1]) || Y.legacyLast[m[1]] < +m[2])) Y.legacyLast[m[1]] = +m[2];
      } else if (k === 'INV_CANCEL') {
        e = typeof b.invoiceNo === 'string' && sbdHas(Y.inv, b.invoiceNo) ? Y.inv[b.invoiceNo] : null;
        if (!e || e.legacy || e.cancel || e.credits.length) return 'cancel record';
        e.cancel = rec;
        e.state = 'CANCELLED';
      } else if (k === 'INV_CCPT') {
        e = typeof b.invoiceNo === 'string' && sbdHas(Y.inv, b.invoiceNo) ? Y.inv[b.invoiceNo] : null;
        if (!e || e.cancel || typeof b.ccptInvoiceNo !== 'string') return 'CCPT number record';
        e.ccpts.push(rec);
      } else if (k === 'CN_ISSUE') {
        e = typeof b.invoiceNo === 'string' && sbdHas(Y.inv, b.invoiceNo) ? Y.inv[b.invoiceNo] : null;
        if (!e || e.legacy || e.cancel || typeof b.no !== 'string' || sbdHas(Y.cn, b.no) || !sbdObj(b.credit) || b.credit.ok !== true || !sbdInt(b.credit.totalPaise) || !sbdArr(b.stock)) return 'credit note record';
        e.credits.push(rec);
        s = restate(e);
        if (s) return s;
        Y.cn[b.no] = { rec: rec, inv: e };
        Y.cnList.push(b.no);
      } else if (k === 'NCS_ISSUE') {
        if (!jid || !sbdArr(b.parts) || !sbdArr(b.labour)) return 'sheet record';
        if (activeOf(Y, jid) || sheetOf(Y, jid) || sbdHas(Y.voids, jid)) return 'sheet on a billed job';
        Y.sheets[rec.id] = { rec: rec, jobId: jid, cancel: null };
        Y.sheetList.push(rec.id);
        pushTo(Y.sheetByJob, jid, rec.id);
      } else if (k === 'NCS_CANCEL') {
        s = typeof b.sheetId === 'string' && sbdHas(Y.sheets, b.sheetId) ? Y.sheets[b.sheetId] : null;
        if (!s || s.cancel) return 'sheet cancel record';
        s.cancel = rec;
      } else if (k === 'JOB_VOID') {
        if (!jid || sbdHas(Y.voids, jid) || liveBillOf(Y, jid) || sheetOf(Y, jid)) return 'void record';
        Y.voids[jid] = rec;
      } else if (k === 'BCFG_SET') {
        Y.cfg.push(rec);
        return '';
      } else {
        return 'unknown record kind ' + String(k).slice(0, 20);
      }
      if (jid) Y.jobs[jid] = true;
      return '';
    }

    function headOf() {
      var hd = store.head('invoices');
      return hd && hd.ok === true ? hd : lowerFail(hd);
    }
    function ready() {
      var hd = headOf(), rd, o, Y, i, p;
      if (hd.ok !== true) return hd;
      if (X && !dirty && X.rev === hd.rev) return X.problems.length ? blockedFail() : { ok: true };
      rd = store.read('invoices');
      if (!rd || rd.ok !== true) return lowerFail(rd);
      if (rd.rev !== hd.rev) {
        o = store.open();
        if (!o || o.ok !== true) return lowerFail(o);
        rd = store.read('invoices');
        if (!rd || rd.ok !== true) return lowerFail(rd);
      }
      Y = newIndex();
      for (i = 0; i < rd.records.length; i++) {
        p = ingest(Y, rd.records[i]);
        if (p) {
          Y.problems.push('record ' + rd.records[i].n + ': ' + p);
          break;
        }
      }
      Y.rev = rd.rev;
      Y.h = rd.h;
      X = Y;
      dirty = false;
      return Y.problems.length ? blockedFail() : { ok: true };
    }
    function afterFailedWrite(res) {
      var code = res && res.code;
      if (code === 'SVCS_WRITE_FAILED' || code === 'SVCS_READBACK_MISMATCH' || code === 'SVCS_HEAD_WRITE_FAILED' ||
          code === 'SVCS_REV_CONFLICT' || code === 'SVCS_SERIES_MISMATCH' || code === 'SVCS_HEAD_BEHIND') dirty = true;
    }


    function configNow() {
      var out, i, b, lim = null, bl = null, el = null, list;
      if (!X) return { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] };
      if (X.cfgCache) return X.cfgCache;
      out = { discountLimitPaise: DEFAULT_CONFIG.discountLimitPaise, billingRoles: DEFAULT_CONFIG.billingRoles.slice(), estimateRoles: DEFAULT_CONFIG.estimateRoles.slice() };
      // money reads billingRoles from the latest record with a valid limit and a valid billing list; the rest needs a whole valid record
      for (i = X.cfg.length - 1; i >= 0; i--) {
        b = X.cfg[i].b;
        if (!sbdObj(b) || !sbdLimitOk(b.discountLimitPaise)) continue;
        list = sbdRoleList(b.billingRoles);
        if (!list) continue;
        if (bl === null) { bl = list; out.billingRoles = list; }
        if (lim === null && sbdRoleList(b.estimateRoles)) {
          lim = b.discountLimitPaise;
          out.discountLimitPaise = lim;
          el = sbdRoleList(b.estimateRoles);
          out.estimateRoles = el;
        }
      }
      X.cfgCache = out;
      return out;
    }
    function stockCanReturn(sess) {
      var r;
      if (typeof stock.can !== 'function') return false;
      try { r = stock.can('RETURN', { ok: true, tier: sess.tier, isOwner: sess.owner, isManager: sess.manager, role: sess.role, actorName: sess.name }); } catch (e) { return false; }
      return !!(r && r.ok === true);
    }


    function begin(action, ctx) {
      var sess = sbdSession(ctx), rd, ru;
      if (!sess) return fail('SESSION_REQUIRED');
      if (sbdObj(ctx) && ctx.pastView === true) return fail('PAST_VIEW');
      rd = ready();
      if (!rd.ok) return rd;
      ru = sbdRule(action, sess, configNow(), stockCanReturn);
      if (!ru.ok) return fail(ru.code);
      return { ok: true, sess: sess, pin: ru.needsPin === true, pinAt: stampAt(ctx) };
    }
    function needPin(g) { return g.pin && g.pinAt < 0 ? fail('PIN_REQUIRED') : null; }
    function readGate(ctx, action) {
      var sess, rd, ru;
      rd = ready();
      if (!rd.ok) return rd;
      if (ctx === undefined) return { ok: true, internal: true, sess: null };
      sess = sbdSession(ctx);
      if (!sess) return fail('SESSION_REQUIRED');
      ru = sbdRule(action, sess, configNow(), stockCanReturn);
      return ru.ok ? { ok: true, internal: false, sess: sess } : fail(ru.code);
    }
    function clientRef(ctx) {
      var r = sbdObj(ctx) ? ctx.clientRef : undefined;
      if (r === undefined || r === null || r === '') return { ok: true, ref: '' };
      if (typeof r === 'string' && SBD_REF_RE.test(r)) return { ok: true, ref: r };
      return { ok: false };
    }
    function findDone(ref, kinds) {
      var rec;
      if (!ref) return null;
      rec = store.findRef('invoices', ref);
      if (!rec) return null;
      return kinds.indexOf(rec.k) < 0 ? { conflict: true } : { rec: rec };
    }
    function replayOf(ctx, kinds) {
      var rf = clientRef(ctx), dn;
      if (!rf.ok) return fail('INPUT_INVALID', { field: 'clientRef' });
      dn = findDone(rf.ref, kinds);
      if (dn && dn.conflict) return fail('SVCS_DUPLICATE_REF');
      return { ok: true, ref: rf.ref, rec: dn && dn.rec ? dn.rec : null };
    }
    function checkToday(input) {
      if (sbdObj(input) && input.docDate !== undefined && input.docDate !== null && input.docDate !== today()) return fail('BACKDATE_NOT_ALLOWED');
      return null;
    }
    function reasonOf(v, field) {
      var t = sbdText(v, 200);
      if (t === null) return fail('INPUT_INVALID', { field: field || 'reason' });
      if (t.length < 5) return fail('REASON_REQUIRED');
      return { ok: true, value: t };
    }
    function noteOf(v) {
      var t = sbdText(v, 200);
      return t === null ? fail('INPUT_INVALID', { field: 'note' }) : { ok: true, value: t };
    }
    function jobIdOf(v) {
      var t = sbdText(v, 60);
      return t === null || t === '' ? fail('INPUT_INVALID', { field: 'jobId' }) : { ok: true, value: t };
    }


    function byOf(rec) { return { name: rec.a.m, role: rec.a.r, tier: rec.a.t }; }
    function baseView(rec) {
      var out = sbdCopy(rec.b);
      out.id = rec.id;
      out.n = rec.n;
      out.at = rec.at;
      out.kind = rec.k;
      out.by = byOf(rec);
      out.ref = rec.r || '';
      return out;
    }
    function currentCcpt(e) {
      if (e.ccpts.length) return e.ccpts[e.ccpts.length - 1].b.ccptInvoiceNo;
      return e.legacy ? '' : e.rec.b.ccptInvoiceNo;
    }
    function totalOf(e) { return e.legacy ? e.rec.b.totalPaise : e.rec.b.bill.totals.totalPaise; }
    function creditedOf(e) {
      var s = 0, i;
      for (i = 0; i < e.credits.length; i++) s += e.credits[i].b.credit.totalPaise;
      return s;
    }
    function stripCost(v) {
      var i;
      if (v.cost !== undefined) delete v.cost;
      if (v.totals && v.totals.partsCostPaise !== undefined) delete v.totals.partsCostPaise;
      for (i = 0; v.stock && i < v.stock.length; i++) if (sbdObj(v.stock[i])) delete v.stock[i].costPaise;
      for (i = 0; v.warranty && i < v.warranty.length; i++) if (sbdObj(v.warranty[i])) delete v.warranty[i].costPaise;
      for (i = 0; v.parts && i < v.parts.length; i++) if (sbdObj(v.parts[i])) delete v.parts[i].costPaise;
      return v;
    }
    function costAllowed(g) {
      return g.internal === true || sbdRule('VIEW_COST', g.sess, configNow(), null).ok === true;
    }
    function invView(e, costOk) {
      var v = baseView(e.rec), i, cr = [];
      if (e.legacy) {
        v.no = e.no;
        v.legacy = true;
        v.totalPaise = e.rec.b.totalPaise;
      } else {
        v.totalPaise = e.rec.b.bill.totals.totalPaise;
      }
      v.state = e.state;
      v.fy = sbdFyLong(e.rec.at);
      v.ccptInvoiceNo = currentCcpt(e);
      v.cancel = e.cancel ? { at: e.cancel.at, reason: e.cancel.b.reason, by: byOf(e.cancel), pinAt: e.cancel.b.pinAt, docDate: e.cancel.b.docDate } : null;
      for (i = 0; i < e.credits.length; i++) cr.push({ no: e.credits[i].b.no, totalPaise: e.credits[i].b.credit.totalPaise });
      v.credits = cr;
      v.creditedPaise = creditedOf(e);
      v.payablePaise = v.totalPaise - v.creditedPaise;
      return costOk ? v : stripCost(v);
    }
    function cnView(c, costOk) {
      var v = baseView(c.rec);
      v.state = 'ISSUED';
      v.totalPaise = c.rec.b.credit.totalPaise;
      v.fy = sbdFyLong(c.rec.at);
      return costOk ? v : stripCost(v);
    }
    function sheetView(s) {
      var v = baseView(s.rec);
      v.state = s.cancel ? 'CANCELLED' : 'ACTIVE';
      v.cancel = s.cancel ? { at: s.cancel.at, reason: s.cancel.b.reason, by: byOf(s.cancel), pinAt: s.cancel.b.pinAt } : null;
      return v;
    }


    function jobGate(jobId) {
      var id = jobIdOf(jobId), job;
      if (!id.ok) return id;
      try { job = cases.get(id.value); } catch (e) { job = null; }
      if (!sbdObj(job)) return fail('JOB_NOT_FOUND', { jobId: id.value });
      return { ok: true, id: id.value, job: job, voided: job.voided === true || sbdHas(X.voids, id.value), warns: job.stub === true ? ['JOB_IS_STUB'] : [] };
    }
    function moneyOf(jobId) {
      var r;
      if (!money) return fail('DEPS_INVALID', 'money');
      try { r = money.jobMoney(jobId); } catch (e) { r = null; }
      if (!sbdObj(r)) return fail('DEPS_INVALID', 'money');
      if (r.ok !== true) return lowerFail(r);
      return r;
    }
    function hasMoneyRecords(jm) {
      return (sbdArr(jm.receipts) && jm.receipts.length > 0) || (sbdArr(jm.refunds) && jm.refunds.length > 0);
    }
    function headRev(stream) {
      var h = store.head(stream);
      return h && h.ok === true ? h.rev : -1;
    }


    function estimateInfo(jobId) {
      var e = sbdHas(X.est, jobId) ? X.est[jobId] : null, out, last, apr;
      out = { state: 'NONE', version: 0, totalPaise: 0, approvedPaise: null, approvedVersion: null, needsAmountPaise: 0 };
      if (e && e.versions.length) {
        last = e.versions[e.versions.length - 1];
        out.version = last.b.version;
        out.totalPaise = last.b.bill.totals.totalPaise;
        out.state = 'DRAFT';
        out.needsAmountPaise = out.totalPaise;
        if (e.approvals.length) {
          apr = e.approvals[e.approvals.length - 1];
          out.approvedPaise = apr.b.amountPaise;
          out.approvedVersion = apr.b.version;
          if (out.totalPaise > out.approvedPaise) out.state = 'REAPPROVAL_NEEDED';
          else {
            out.state = 'APPROVED';
            out.needsAmountPaise = 0;
          }
        }
      }
      if (activeOf(X, jobId)) { out.state = 'BILLED'; out.needsAmountPaise = 0; }
      if (sbdHas(X.voids, jobId)) { out.state = 'VOID'; out.needsAmountPaise = 0; }
      return out;
    }


    function readRecipient(input, fallback) {
      var g = input.recipientGstin, st = input.recipientStateCode, v;
      if (g === undefined || g === null) g = fallback ? fallback.gstin : '';
      if (typeof g !== 'string') return fail('INPUT_INVALID', { field: 'recipientGstin' });
      g = g.replace(/\s+/g, '').toUpperCase();
      if (g !== '') {
        v = calc.validateGstin(g);
        if (!v || v.ok !== true) return fail('GSTIN_INVALID', { calc: v && v.code ? v.code : '' });
        g = v.gstin;
      }
      if (st === undefined || st === null) st = fallback && (input.recipientGstin === undefined || input.recipientGstin === null) ? fallback.state : '';
      if (typeof st !== 'string' || (st !== '' && !/^\d{2}$/.test(st))) return fail('INPUT_INVALID', { field: 'recipientStateCode' });
      return { ok: true, gstin: g, state: st };
    }
    function lineFail(code, index, extra) {
      var d = { lineNo: index + 1 }, keys, i;
      if (extra) {
        keys = Object.keys(extra);
        for (i = 0; i < keys.length; i++) d[keys[i]] = extra[keys[i]];
      }
      return fail(code, d);
    }
    function masterRow(kind, rawCode, index) {
      var code = typeof rawCode === 'string' ? masters.normalizeCode(rawCode) : '', g2;
      if (!code) return lineFail(kind === 'PART' ? 'PART_UNKNOWN' : 'LABOUR_UNKNOWN', index);
      g2 = masters.getRow(store, kind === 'PART' ? 'part' : 'labour', code);
      if (!g2 || g2.ok !== true) {
        if (g2 && g2.code === 'NOT_FOUND') return lineFail(kind === 'PART' ? 'PART_UNKNOWN' : 'LABOUR_UNKNOWN', index, { code: code });
        return lowerFail(g2);
      }
      return { ok: true, row: g2.row, code: code };
    }
    function lineFromRow(kind, row, qty) {
      return {
        kind: kind, code: row.code, name: String(row.name).slice(0, 80), hsnSac: kind === 'PART' ? row.hsn : row.sac, rateBp: row.gstRateBp,
        priceBasis: row.priceIncludesTax ? 'INCL' : 'EXCL', unitPricePaise: kind === 'PART' ? row.sellPricePaise : row.ratePaise, qty: qty,
        discountPaise: 0, noCharge: false, ref: ''
      };
    }
    function taxMissing(row) { return masters.isTaxPending(row) || typeof row.priceIncludesTax !== 'boolean'; }
    function otherLine(raw, index, qty) {
      var name = sbdText(raw.name, 80), hs = typeof raw.hsnSac === 'string' ? raw.hsnSac.replace(/\s+/g, '') : '';
      if (name === null || name === '') return lineFail('INPUT_INVALID', index, { field: 'name' });
      if (!sbdInt(raw.unitPricePaise) || raw.unitPricePaise < 0) return lineFail('INPUT_INVALID', index, { field: 'unitPricePaise' });
      if (raw.priceBasis !== 'INCL' && raw.priceBasis !== 'EXCL') return lineFail('TAX_DETAILS_MISSING', index, { field: 'priceBasis' });
      if (!sbdInt(raw.rateBp) || raw.rateBp < 0 || raw.rateBp > 10000) return lineFail('TAX_DETAILS_MISSING', index, { field: 'rateBp' });
      if (hs === '') return lineFail('TAX_DETAILS_MISSING', index, { field: 'hsnSac' });
      return {
        ok: true,
        line: { kind: 'OTHER', code: '', name: name, hsnSac: hs, rateBp: raw.rateBp, priceBasis: raw.priceBasis, unitPricePaise: raw.unitPricePaise, qty: qty, discountPaise: 0, noCharge: false, ref: '' }
      };
    }
    function qtyOk(q) { return sbdInt(q) && q >= 1 && q <= SBD_MAX_QTY; }
    function computeFor(lines, billDiscountPaise, rcp) {
      var r = calc.computeBill({ lines: lines, billDiscountPaise: billDiscountPaise, sellerStateCode: SBD_SELLER_STATE, recipientStateCode: rcp.state, recipientGstin: rcp.gstin });
      return r && r.ok === true ? r : lowerFail(r);
    }


    function estimateLines(raw, sess) {
      var lines = [], src = [], seen = sbdMap(), others = 0, i, ln, kind, rw, cl, ol, key;
      if (!sbdArr(raw) || raw.length < 1) return fail('LINES_REQUIRED');
      if (raw.length > SBD_MAX_LINES) return fail('TOO_MANY_LINES');
      for (i = 0; i < raw.length; i++) {
        ln = raw[i];
        if (!sbdObj(ln)) return lineFail('INPUT_INVALID', i);
        kind = ln.kind;
        if (!qtyOk(ln.qty)) return lineFail('QTY_INVALID', i);
        if (kind === 'PART' || kind === 'LABOUR') {
          rw = masterRow(kind, ln.code, i);
          if (!rw.ok) return rw;
          key = kind + ':' + rw.code;
          if (seen[key]) return lineFail('DUPLICATE_LINE', i, { code: rw.code });
          seen[key] = true;
          if (rw.row.active === false) return lineFail('PART_INACTIVE', i, { code: rw.code });
          if (taxMissing(rw.row)) return lineFail('TAX_DETAILS_MISSING', i, { code: rw.code });
          cl = lineFromRow(kind, rw.row, ln.qty);
          if (ln.unitPricePaise !== undefined && ln.unitPricePaise !== cl.unitPricePaise) return lineFail('PRICE_NOT_FROM_MASTER', i, { code: rw.code });
          lines.push(cl);
          src.push({ lineNo: i + 1, masterRev: sbdInt(rw.row.rev) ? rw.row.rev : 0 });
        } else if (kind === 'OTHER') {
          if (!sbdRule('EST_OTHER_LINE', sess, configNow(), null).ok) return fail('NOT_ALLOWED', { lineNo: i + 1 });
          others += 1;
          if (others > SBD_MAX_OTHER) return fail('TOO_MANY_OTHER_LINES');
          ol = otherLine(ln, i, ln.qty);
          if (!ol.ok) return ol;
          lines.push(ol.line);
          src.push({ lineNo: i + 1, masterRev: 0 });
        } else return lineFail('INPUT_INVALID', i, { field: 'kind' });
      }
      return { ok: true, lines: lines, src: src };
    }

    function adopt(res) {
      var i, p;
      for (i = 0; i < res.records.length; i++) {
        p = ingest(X, res.records[i]);
        if (p) {
          dirty = true;
          return;
        }
      }
      X.cfgCache = null;
      X.rev = res.rev;
      X.h = res.h;
    }
    function writeRecords(g, items, at, guard) {
      var opts = { expectRev: X.rev, actor: sbdActor(g.sess), at: at }, res;
      if (guard) opts.guardRevs = guard;
      res = store.append('invoices', items, opts);
      if (!res || res.ok !== true) {
        afterFailedWrite(res);
        return lowerFail(res);
      }
      adopt(res);
      return { ok: true, records: res.records, warnings: res.warnings || [] };
    }
    function recordTime() {
      var ta = store.nextAt('invoices');
      return ta && ta.ok === true ? { ok: true, at: ta.at, docDate: sbdIstDate(ta.at) } : lowerFail(ta);
    }
    function gitem(kind, body, ref, series) {
      var it = { k: kind, b: body };
      if (series) it.series = series;
      if (ref) it.r = ref;
      return it;
    }

    function saveEstimate(input, ctx) {
      var g = begin('EST_SAVE', ctx), rf, dn, bad, jg, nt, rc, el, bill, e, prev, version, reason = '', rs, t, body, res, rcp, info;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['EST_SAVE']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, estimate: baseView(rf.rec), warnings: [], replayed: true };
      if (!sbdObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      jg = jobGate(input.jobId);
      if (!jg.ok) return jg;
      if (jg.voided) return fail('JOB_VOIDED');
      if (jg.job.status !== 'open') return fail('JOB_CLOSED', { jobId: jg.id });
      if (activeOf(X, jg.id) || sheetOf(X, jg.id)) return fail('JOB_LOCKED');
      nt = noteOf(input.note);
      if (!nt.ok) return nt;
      el = estimateLines(input.lines, g.sess);
      if (!el.ok) return el;
      rc = readRecipient(input, null);
      if (!rc.ok) return rc;
      bill = computeFor(el.lines, 0, rc);
      if (!bill.ok) return bill;
      if (!sbdSumsOk(bill)) return fail('CALC_INCONSISTENT');
      e = sbdHas(X.est, jg.id) ? X.est[jg.id] : null;
      prev = e && e.versions.length ? e.versions[e.versions.length - 1] : null;
      if (prev && sbdInputKey(prev.b.bill.input) === sbdInputKey(bill.input)) return fail('NO_CHANGE');
      version = prev ? prev.b.version + 1 : 1;
      if (prev && e.approvals.length) {
        rs = reasonOf(input.reason);
        if (!rs.ok) return rs;
        reason = rs.value;
      } else {
        reason = sbdText(input.reason, 200);
        if (reason === null) return fail('INPUT_INVALID', { field: 'reason' });
      }
      t = recordTime();
      if (!t.ok) return t;
      body = { jobId: jg.id, version: version, prevId: prev ? prev.id : '', docDate: t.docDate, note: nt.value, reason: reason, bill: bill, src: el.src };
      res = writeRecords(g, [gitem('EST_SAVE', body, rf.ref, null)], t.at, null);
      if (!res.ok) return res;
      info = estimateInfo(jg.id);
      return { ok: true, estimate: baseView(res.records[0]), state: info.state, warnings: jg.warns.concat(res.warnings) };
    }

    function recordApproval(input, ctx) {
      var g = begin('EST_APPROVE', ctx), rf, dn, bad, jg, e, last, ver, method, who, ev, at, nowT, ai, nt, t, body, res, prevApr, i;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['EST_APPROVE']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, approval: baseView(rf.rec), state: estimateInfo(rf.rec.b.jobId).state, warnings: [], replayed: true };
      if (!sbdObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      jg = jobGate(input.jobId);
      if (!jg.ok) return jg;
      if (jg.voided) return fail('JOB_VOIDED');
      if (jg.job.status !== 'open') return fail('JOB_CLOSED', { jobId: jg.id });
      if (activeOf(X, jg.id) || sheetOf(X, jg.id)) return fail('JOB_LOCKED');
      e = sbdHas(X.est, jg.id) ? X.est[jg.id] : null;
      if (!e || !e.versions.length) return fail('ESTIMATE_NOT_FOUND');
      ver = input.version;
      if (!sbdInt(ver) || ver < 1 || ver > e.versions.length) return fail('ESTIMATE_NOT_FOUND');
      if (ver !== e.versions.length) return fail('ESTIMATE_NOT_LATEST');
      last = e.versions[ver - 1];
      if (input.amountPaise !== undefined && input.amountPaise !== null && input.amountPaise !== last.b.bill.totals.totalPaise) return fail('AMOUNT_MISMATCH', { totalPaise: last.b.bill.totals.totalPaise });
      for (i = 0; i < e.approvals.length; i++) if (e.approvals[i].b.version === ver) return fail('ALREADY_APPROVED');
      method = input.method;
      if (METHODS.indexOf(method) < 0) return fail('INPUT_INVALID', { field: 'method' });
      who = sbdText(input.takenByName === undefined || input.takenByName === null || input.takenByName === '' ? g.sess.name : input.takenByName, 60);
      if (who === null || who === '') return fail('INPUT_INVALID', { field: 'takenByName' });
      ev = sbdText(input.evidence, 60);
      if (ev === null) return fail('INPUT_INVALID', { field: 'evidence' });
      if (method === 'OTHER' && ev.length < 3) return fail('INPUT_INVALID', { field: 'evidence' });
      nowT = nowMs();
      if (nowT === null) return fail('DEPS_INVALID', 'now');
      ai = input.approvedAt === undefined || input.approvedAt === null || input.approvedAt === '' ? new Date(nowT).toISOString() : sbdIso(input.approvedAt);
      if (ai === null) return fail('APPROVAL_TIME_INVALID');
      at = Date.parse(ai);
      // a time typed to the minute, in the estimate's own minute, is that estimate's time (an earlier minute is still refused)
      if (at < Date.parse(last.at) && at >= Date.parse(last.at) - Date.parse(last.at) % 60000) { at = Date.parse(last.at); ai = last.at; }
      if (at > nowT || at < Date.parse(last.at) || at < nowT - SBD_APPROVAL_DAYS_MS) return fail('APPROVAL_TIME_INVALID');
      nt = noteOf(input.note);
      if (!nt.ok) return nt;
      t = recordTime();
      if (!t.ok) return t;
      prevApr = e.approvals.length ? e.approvals[e.approvals.length - 1].id : '';
      body = {
        jobId: jg.id, version: ver, estimateId: last.id, amountPaise: last.b.bill.totals.totalPaise, method: method, takenBy: { name: who },
        approvedAt: ai, evidence: ev, docDate: t.docDate, note: nt.value, supersedes: prevApr
      };
      res = writeRecords(g, [gitem('EST_APPROVE', body, rf.ref, null)], t.at, null);
      if (!res.ok) return res;
      return { ok: true, approval: baseView(res.records[0]), state: estimateInfo(jg.id).state, warnings: jg.warns.concat(res.warnings) };
    }

    function estimateView(jobId, ctx) {
      var gt = readGate(ctx, 'EST_SAVE'), jg, e, info, vs = [], as = [], i;
      if (!gt.ok) return gt;
      jg = jobGate(jobId);
      if (!jg.ok) return jg;
      e = sbdHas(X.est, jg.id) ? X.est[jg.id] : { versions: [], approvals: [] };
      info = estimateInfo(jg.id);
      for (i = 0; i < e.versions.length; i++) vs.push(baseView(e.versions[i]));
      for (i = 0; i < e.approvals.length; i++) as.push(baseView(e.approvals[i]));
      return {
        ok: true, jobId: jg.id, versions: vs, latest: vs.length ? vs[vs.length - 1] : null, approvals: as, state: info.state, version: info.version,
        totalPaise: info.totalPaise, approvedPaise: info.approvedPaise, approvedVersion: info.approvedVersion, needsAmountPaise: info.needsAmountPaise
      };
    }


    function retDocs() {
      var r = stock.listDocs({ kind: 'RET' });
      return r && r.ok === true && sbdArr(r.docs) ? r.docs : null;
    }
    function movementIndex(docs) {
      var mv = stock.movements(), byId = sbdMap(), rets = sbdMap(), skip = sbdMap(), i, j, d, m;
      if (!sbdArr(mv)) return null;
      for (i = 0; i < docs.length; i++) {
        d = docs[i];
        if (typeof d.creditNoteNo === 'string' && d.creditNoteNo && sbdArr(d.mv)) for (j = 0; j < d.mv.length; j++) skip[d.mv[j].id] = true;
      }
      for (i = 0; i < mv.length; i++) {
        m = mv[i];
        byId[m.id] = m;
        if (typeof m.returnsOf === 'string' && m.returnsOf && !skip[m.id]) pushTo(rets, m.returnsOf, m);
      }
      return { byId: byId, rets: rets };
    }
    function costOfIssues(ids, mi) {
      var cost = 0, est = false, i, j, m, net, rl, ly;
      for (i = 0; i < ids.length; i++) {
        m = mi.byId[ids[i]];
        if (!m || m.type !== 'issue_job' || !sbdInt(m.valuePaise)) return null;
        net = 0 - m.valuePaise;
        rl = sbdHas(mi.rets, m.id) ? mi.rets[m.id] : [];
        for (j = 0; j < rl.length; j++) net -= rl[j].valuePaise;
        cost += net;
        if (m.debt !== null && m.debt !== undefined) est = true;
        ly = sbdArr(m.layers) ? m.layers : [];
        for (j = 0; j < ly.length; j++) if (typeof ly[j].layerId === 'string' && ly[j].layerId.indexOf('DEBT:') === 0) est = true;
      }
      return { costPaise: cost, estimated: est };
    }
    function jobIssueRows(jobId) {
      var st = stock.jobStock(jobId), rows = [], seen = sbdMap(), i, it, gd;
      if (!st || st.ok !== true) return lowerFail(st);
      for (i = 0; i < st.issues.length; i++) {
        it = st.issues[i];
        if (it.reversed || !(it.outstanding > 0)) continue;
        if (!sbdHas(seen, it.docNo)) {
          gd = stock.getDoc(it.docNo);
          if (!gd || gd.ok !== true) return lowerFail(gd);
          seen[it.docNo] = gd.doc.billing === 'WARRANTY' ? 'WARRANTY' : 'CHARGEABLE';
        }
        rows.push({ movementId: it.movementId, docNo: it.docNo, lineNo: it.lineNo, partCode: it.partCode, outstanding: it.outstanding, billing: seen[it.docNo] });
      }
      return { ok: true, rows: rows };
    }
    function sumByPart(rows, billing) {
      var out = sbdMap(), order = [], i, r;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        if (r.billing !== billing) continue;
        if (!sbdHas(out, r.partCode)) { out[r.partCode] = { qty: 0, issues: [] }; order.push(r.partCode); }
        out[r.partCode].qty += r.outstanding;
        out[r.partCode].issues.push({ id: r.movementId, docNo: r.docNo, qty: r.outstanding });
      }
      return { map: out, order: order };
    }
    function partName(code) {
      var g2 = masters.getRow(store, 'part', code);
      return g2 && g2.ok === true && typeof g2.row.name === 'string' && g2.row.name ? g2.row.name.slice(0, 80) : code;
    }


    function ccptTaken(norm, exceptNo) {
      var i, e;
      for (i = 0; i < X.invList.length; i++) {
        e = X.inv[X.invList[i]];
        if (e.no === exceptNo || e.state === 'CANCELLED') continue;
        if (currentCcpt(e) !== '' && sbdNormCcpt(currentCcpt(e)) === norm) return true;
      }
      return false;
    }
    function estLine(jobId, kind, code) {
      var e = sbdHas(X.est, jobId) ? X.est[jobId] : null, ls, i;
      if (!e || !e.versions.length) return null;
      ls = e.versions[e.versions.length - 1].b.bill.input.lines;
      for (i = 0; i < ls.length; i++) if (ls[i].kind === kind && ls[i].code === code) return ls[i];
      return null;
    }
    function listedPart(items, code) {
      var i;
      for (i = 0; i < items.length; i++) if (items[i].code === code) return true;
      return false;
    }
    function readPartInputs(list, field, kind) {
      var out = [], seen = sbdMap(), i, ln, code, d, raw;
      if (list === undefined || list === null) return { ok: true, items: [] };
      if (!sbdArr(list)) return fail('INPUT_INVALID', { field: field });
      for (i = 0; i < list.length; i++) {
        ln = list[i];
        if (!sbdObj(ln)) return lineFail('INPUT_INVALID', i, { field: field });
        raw = kind === 'PART' ? ln.partCode : ln.code;
        code = typeof raw === 'string' ? masters.normalizeCode(raw) : '';
        if (!code) return lineFail(kind === 'PART' ? 'PART_UNKNOWN' : 'LABOUR_UNKNOWN', i);
        if (seen[code]) return lineFail('DUPLICATE_LINE', i, { code: code });
        seen[code] = true;
        if (!qtyOk(ln.qty)) return lineFail('QTY_INVALID', i, { code: code });
        d = ln.discountPaise === undefined || ln.discountPaise === null ? 0 : ln.discountPaise;
        if (!sbdInt(d) || d < 0) return lineFail('INPUT_INVALID', i, { field: 'discountPaise' });
        out.push({ code: code, qty: ln.qty, discountPaise: d });
      }
      return { ok: true, items: out };
    }
    function readOtherInputs(list, sess) {
      var out = [], i, ln, ol, d;
      if (list === undefined || list === null) return { ok: true, items: [] };
      if (!sbdArr(list)) return fail('INPUT_INVALID', { field: 'other' });
      if (list.length && !sbdRule('EST_OTHER_LINE', sess, configNow(), null).ok) return fail('NOT_ALLOWED', { field: 'other' });
      if (list.length > SBD_MAX_OTHER) return fail('TOO_MANY_OTHER_LINES');
      for (i = 0; i < list.length; i++) {
        ln = list[i];
        if (!sbdObj(ln)) return lineFail('INPUT_INVALID', i, { field: 'other' });
        if (!qtyOk(ln.qty)) return lineFail('QTY_INVALID', i);
        ol = otherLine(ln, i, ln.qty);
        if (!ol.ok) return ol;
        d = ln.discountPaise === undefined || ln.discountPaise === null ? 0 : ln.discountPaise;
        if (!sbdInt(d) || d < 0) return lineFail('INPUT_INVALID', i, { field: 'discountPaise' });
        ol.line.discountPaise = d;
        out.push(ol.line);
      }
      return { ok: true, items: out };
    }
    function setOffOf(jm, advancePaise) {
      var out = [], left = advancePaise, i, r, use;
      for (i = 0; i < jm.receipts.length && left > 0; i++) {
        r = jm.receipts[i];
        if (r.status !== 'OK' || !sbdInt(r.amountPaise) || typeof r.no !== 'string') continue;
        use = r.amountPaise < left ? r.amountPaise : left;
        out.push({ no: r.no, amountPaise: use });
        left -= use;
      }
      return left === 0 ? out : null;
    }

    function planInvoice(input, ctx, write) {
      var g = begin('INV_ISSUE', ctx), rf = { ref: '' }, dn, bad, id, jg, jm, hl, hr, mode, ccpt, norm, pins = [], notIn = null, info, si, chg, wrn, pl, wl;
      var partsIn, labIn, othIn, lines = [], stockRows = [], i, r, p, code, row, el, cl, rcp, bd, discTotal, discount = null, bill, total, why, ovr = null;
      var net, setOff, balance, docs, mi, cost = 0, costEst = false, warrantyOut = [], estBody = null, e, last, warns, billDisc, reasonText, lim, partTotalCost = 0, w, ov;
      if (!g.ok) return g;
      if (write) {
      rf = replayOf(ctx, ['INV_ISSUE']);
        if (!rf.ok) return rf;
        if (rf.rec) return { ok: true, replayed: rf.rec, g: g };
      }
      if (!sbdObj(input)) return fail('INPUT_INVALID');
      bad = checkToday(input);
      if (bad) return bad;
      id = jobIdOf(input.jobId);
      if (!id.ok) return id;
      hl = headRev('ledger');
      hr = headRev('receipts');
      jg = jobGate(id.value);
      if (!jg.ok) return jg;
      id = jg.id;
      if (jg.voided) return fail('JOB_VOIDED');
      if (jg.job.paymentStatus === 'no_charge_warranty') return fail('NO_CHARGE_JOB');
      if (activeOf(X, id)) return fail('INVOICE_ALREADY_ISSUED');
      if (sheetOf(X, id)) return fail('JOB_LOCKED');
      jm = moneyOf(id);
      if (!jm.ok) return jm;
      if (jg.job.status === 'closed' && !(sbdHas(X.jobs, id) || hasMoneyRecords(jm))) return fail('JOB_CLOSED_OLD_WAY');
      if (jm.legacyTypedPaise > 0 && !hasMoneyRecords(jm)) return fail('LEGACY_ADVANCE_UNCONFIRMED');
      mode = input.mode === undefined || input.mode === null || input.mode === '' ? 'CCPT_BILLED' : input.mode;
      if (MODES.indexOf(mode) < 0) return fail('INPUT_INVALID', { field: 'mode' });
      ccpt = sbdText(input.ccptInvoiceNo, 40);
      if (ccpt === null) return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
      if (mode === 'NOT_IN_CCPT') {
        if (!g.sess.owner) return fail('NOT_IN_CCPT_OWNER_ONLY');
        if (ccpt !== '') return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
        r = reasonOf(input.notInCcptReason, 'notInCcptReason');
        if (!r.ok) return r;
        notIn = { reason: r.value, pinAt: null };
        pins.push('NOT_IN_CCPT');
      } else if (ccpt !== '') {
        norm = sbdNormCcpt(ccpt);
        if (norm === '') return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
        if (ccptTaken(norm, '')) return fail('DUPLICATE_CCPT_INVOICE');
      }
      info = estimateInfo(id);
      si = jobIssueRows(id);
      if (!si.ok) return si;
      chg = sumByPart(si.rows, 'CHARGEABLE');
      wrn = sumByPart(si.rows, 'WARRANTY');
      partsIn = readPartInputs(input.parts, 'parts', 'PART');
      if (!partsIn.ok) return partsIn;
      labIn = readPartInputs(input.labour, 'labour', 'LABOUR');
      if (!labIn.ok) return labIn;
      othIn = readOtherInputs(input.other, g.sess);
      if (!othIn.ok) return othIn;
      pl = [];
      wl = [];
      for (i = 0; i < partsIn.items.length; i++) {
        code = partsIn.items[i].code;
        r = sbdHas(chg.map, code) ? chg.map[code].qty : 0;
        if (partsIn.items[i].qty > r || r === 0) wl.push({ partCode: code, issued: r, billed: partsIn.items[i].qty });
        else if (partsIn.items[i].qty < r) pl.push({ partCode: code, issued: r, billed: partsIn.items[i].qty });
      }
      for (i = 0; i < chg.order.length; i++) {
        code = chg.order[i];
        if (!listedPart(partsIn.items, code)) pl.push({ partCode: code, issued: chg.map[code].qty, billed: 0 });
      }
      if (pl.length) return fail('ISSUED_PART_UNBILLED', pl);
      if (wl.length) return fail('BILLED_PART_NOT_ISSUED', wl);
      for (i = 0; i < partsIn.items.length; i++) {
        p = partsIn.items[i];
        el = estLine(id, 'PART', p.code);
        if (el) {
          cl = { kind: 'PART', code: el.code, name: el.name, hsnSac: el.hsnSac, rateBp: el.rateBp, priceBasis: el.priceBasis, unitPricePaise: el.unitPricePaise, qty: p.qty, discountPaise: p.discountPaise, noCharge: false, ref: '' };
        } else {
          row = masterRow('PART', p.code, i);
          if (!row.ok) return row;
          if (taxMissing(row.row)) return lineFail('TAX_DETAILS_MISSING', i, { code: p.code });
          cl = lineFromRow('PART', row.row, p.qty);
          cl.discountPaise = p.discountPaise;
        }
        lines.push(cl);
        stockRows.push({ lineNo: lines.length, issues: chg.map[p.code].issues, costPaise: 0 });
      }
      for (i = 0; i < labIn.items.length; i++) {
        p = labIn.items[i];
        el = estLine(id, 'LABOUR', p.code);
        if (el) {
          cl = { kind: 'LABOUR', code: el.code, name: el.name, hsnSac: el.hsnSac, rateBp: el.rateBp, priceBasis: el.priceBasis, unitPricePaise: el.unitPricePaise, qty: p.qty, discountPaise: p.discountPaise, noCharge: false, ref: '' };
        } else {
          row = masterRow('LABOUR', p.code, i);
          if (!row.ok) return row;
          if (taxMissing(row.row)) return lineFail('TAX_DETAILS_MISSING', i, { code: p.code });
          cl = lineFromRow('LABOUR', row.row, p.qty);
          cl.discountPaise = p.discountPaise;
        }
        lines.push(cl);
      }
      for (i = 0; i < othIn.items.length; i++) lines.push(othIn.items[i]);
      billDisc = input.billDiscountPaise === undefined || input.billDiscountPaise === null ? 0 : input.billDiscountPaise;
      if (!sbdInt(billDisc) || billDisc < 0) return fail('INPUT_INVALID', { field: 'billDiscountPaise' });
      discTotal = billDisc;
      for (i = 0; i < lines.length; i++) discTotal += lines[i].discountPaise;
      lim = configNow().discountLimitPaise;
      if (discTotal > 0) {
        if (!sbdRule('DISCOUNT', g.sess, configNow(), null).ok) return fail('DISCOUNT_NOT_ALLOWED');
        if (g.sess.manager && discTotal > lim) return fail('ABOVE_MANAGER_LIMIT', { limitPaise: lim, totalPaise: discTotal });
        reasonText = sbdText(input.discountReason, 200);
        if (reasonText === null || reasonText.length < 5) return fail('DISCOUNT_REASON_REQUIRED');
        if (g.sess.owner && discTotal > lim) pins.push('DISCOUNT_ABOVE_LIMIT');
        discount = { totalPaise: discTotal, reason: reasonText, limitPaise: lim, approvedBy: { name: g.sess.name, role: g.sess.owner ? 'Owner' : g.sess.role }, pinAt: null };
      }
      e = sbdHas(X.est, id) && X.est[id].versions.length ? X.est[id].versions[X.est[id].versions.length - 1].b.bill.input : null;
      rcp = readRecipient(input, e ? { gstin: e.recipientGstin, state: e.recipientStateCode } : null);
      if (rcp.ok !== true) return rcp;
      bill = computeFor(lines, billDisc, rcp);
      if (!bill.ok) return bill;
      r = calc.verifyBill(bill);
      if (!sbdSumsOk(bill) || !r || r.ok !== true) return fail('CALC_INCONSISTENT', r && r.code ? { calc: r.code } : undefined);
      total = bill.totals.totalPaise;
      why = '';
      if (info.state === 'NONE' || info.state === 'DRAFT') why = 'NO_APPROVAL';
      else if (info.state === 'REAPPROVAL_NEEDED' || total > info.approvedPaise) why = 'REAPPROVAL_REQUIRED';
      if (why) {
        ov = sbdText(input.approvalOverrideReason, 200);
        if (ov === null) return fail('INPUT_INVALID', { field: 'approvalOverrideReason' });
        if (ov !== '' && ov.length < 5) return fail('REASON_REQUIRED');
        if (ov === '') return fail(why, why === 'REAPPROVAL_REQUIRED' ? { approvedPaise: info.approvedPaise === null ? 0 : info.approvedPaise, billPaise: total } : undefined);
        if (!sbdRule('APPROVAL_OVERRIDE', g.sess, configNow(), null).ok) return fail('NOT_ALLOWED', { field: 'approvalOverrideReason' });
        ovr = { reason: ov, pinAt: null };
        pins.push('APPROVAL_OVERRIDE');
      }
      if (info.version > 0) {
        last = X.est[id].versions[X.est[id].versions.length - 1];
        estBody = {
          id: last.id, version: info.version, totalPaise: info.totalPaise,
          approvalId: X.est[id].approvals.length ? X.est[id].approvals[X.est[id].approvals.length - 1].id : '', approvedPaise: info.approvedPaise === null ? 0 : info.approvedPaise
        };
      }
      net = jm.netPaise;
      if (!sbdInt(net) || net < 0) return fail('DEPS_INVALID', 'money');
      if (net > total) return fail('ADVANCE_EXCEEDS_BILL', { heldPaise: net, billPaise: total, excessPaise: net - total });
      setOff = setOffOf(jm, net);
      if (!setOff) return fail('DEPS_INVALID', 'money');
      balance = total - net;
      docs = retDocs();
      if (!docs) return fail('DEPS_INVALID', 'stock');
      mi = movementIndex(docs);
      if (!mi) return fail('DEPS_INVALID', 'stock');
      for (i = 0; i < stockRows.length; i++) {
        w = costOfIssues(stockRows[i].issues.map(function (x) { return x.id; }), mi);
        if (!w) return fail('DEPS_INVALID', 'stock');
        stockRows[i].costPaise = w.costPaise;
        partTotalCost += w.costPaise;
        if (w.estimated) costEst = true;
      }
      for (i = 0; i < wrn.order.length; i++) {
        code = wrn.order[i];
        w = costOfIssues(wrn.map[code].issues.map(function (x) { return x.id; }), mi);
        if (!w) return fail('DEPS_INVALID', 'stock');
        cost += w.costPaise;
        if (w.estimated) costEst = true;
        warrantyOut.push({ code: code, name: partName(code), qty: wrn.map[code].qty, issues: wrn.map[code].issues, costPaise: w.costPaise });
      }
      warns = jg.warns.slice();
      if (mode === 'CCPT_BILLED' && ccpt === '') warns.push('CCPT_NUMBER_PENDING');
      if (bill.warnings && bill.warnings.length) for (i = 0; i < bill.warnings.length; i++) warns.push(typeof bill.warnings[i] === 'string' ? bill.warnings[i] : String(bill.warnings[i] && bill.warnings[i].code));
      if (write && pins.length && g.pinAt < 0) return fail('PIN_REQUIRED');
      if (write) {
        if (notIn) notIn.pinAt = g.pinAt;
        if (discount && pins.indexOf('DISCOUNT_ABOVE_LIMIT') >= 0) discount.pinAt = g.pinAt;
        if (ovr) ovr.pinAt = g.pinAt;
      }
      bd = {
        jobId: id, note: '', mode: mode, notInCcpt: notIn, ccptInvoiceNo: mode === 'NOT_IN_CCPT' ? '' : ccpt, estimate: estBody, approvalOverride: ovr, bill: bill,
        stock: stockRows, warranty: warrantyOut, discount: discount, setOff: { advancePaise: net, receipts: setOff }, balanceDuePaise: balance,
        cost: { partsPaise: partTotalCost, warrantyPaise: cost, estimated: costEst }
      };
      r = noteOf(input.note);
      if (!r.ok) return r;
      bd.note = r.value;
      return { ok: true, g: g, id: id, body: bd, pins: pins, warnings: warns, ref: rf.ref, guard: { ledger: hl, receipts: hr }, ccptNorm: norm || '' };
    }

    function previewInvoice(input, ctx) {
      var pl = planInvoice(input, ctx, false), b, v;
      if (!pl.ok) return pl;
      b = sbdCopy(pl.body);
      v = {
        ok: true, jobId: pl.id, mode: b.mode, lines: b.bill.lines, warrantyLines: b.warranty, totals: b.bill.totals, bill: b.bill, discount: b.discount, setOff: b.setOff,
        balanceDuePaise: b.balanceDuePaise, estimate: b.estimate, pinReasons: pl.pins, warnings: pl.warnings, ccptInvoiceNo: b.ccptInvoiceNo
      };
      if (costAllowed({ internal: false, sess: pl.g.sess })) v.cost = b.cost;
      return v;
    }

    // The old bill counter (plan 2.3): when the old counter is ahead of the store, one seed record goes in the same write.
    function legacyLastFor(fy) {
      var f, last = 0;
      if (typeof cases.legacyFloor !== 'function') return fail('DEPS_INVALID', 'cases.legacyFloor');
      try { f = cases.legacyFloor(fy); } catch (e) { f = null; }
      if (!sbdInt(f) || f < 0) return fail('DEPS_INVALID', 'cases.legacyFloor');
      last = sbdHas(X.legacyLast, fy) ? X.legacyLast[fy] : 0;
      return { ok: true, last: sbdMax(f, last) };
    }

    function issueInvoice(input, ctx) {
      var pl = planInvoice(input, ctx, true), t, fy, ll, sl, items = [], no, body, res, e, seeded = false, costOk, rd;
      if (!pl.ok) return pl;
      if (pl.replayed) {
        e = X.inv[pl.replayed.b.no];
        return { ok: true, invoice: invView(e, costAllowed({ internal: false, sess: pl.g.sess })), warnings: [], replayed: true };
      }
      t = recordTime();
      if (!t.ok) return t;
      fy = sbdFyLong(t.at);
      ll = legacyLastFor(fy);
      if (!ll.ok) return ll;
      sl = store.lastNumber('SV', t.at);
      if (!sl || sl.ok !== true) return lowerFail(sl);
      if (ll.last > sl.last) {
        if (ll.last >= SBD_SEED_MAX) return fail('SVCS_SERIES_TOO_LONG');
        no = 'SV/' + fy + '/' + sbdPad(ll.last + 1, 4);
        items.push(gitem('SERIES_SEED', { seriesSeed: { series: 'SV', fy: fy, last: ll.last } }, '', null));
        seeded = true;
      } else {
        no = store.nextNumber('SV', t.at);
        if (!no || no.ok !== true) return lowerFail(no);
        no = no.no;
      }
      body = pl.body;
      body.no = no;
      body.docDate = t.docDate;
      if (pl.ccptNorm && ccptTaken(pl.ccptNorm, '')) return fail('DUPLICATE_CCPT_INVOICE');
      items.push(gitem('INV_ISSUE', body, pl.ref, 'SV'));
      res = writeRecords(pl.g, items, t.at, pl.guard);
      if (!res.ok) return res;
      if (!sbdHas(X.inv, no) || dirty) {
        rd = ready();
        if (!rd.ok) return rd;
      }
      costOk = costAllowed({ internal: false, sess: pl.g.sess });
      return { ok: true, invoice: invView(X.inv[no], costOk), seeded: seeded, warnings: pl.warnings.concat(res.warnings) };
    }

    function prepareInvoice(jobId, ctx) {
      var g = begin('INV_ISSUE', ctx), jg, si, chg, wrn, e, lastIn, parts = [], labour = [], other = [], i, ln, info, jm, input, rows;
      if (!g.ok) return g;
      jg = jobGate(jobId);
      if (!jg.ok) return jg;
      si = jobIssueRows(jg.id);
      if (!si.ok) return si;
      chg = sumByPart(si.rows, 'CHARGEABLE');
      wrn = sumByPart(si.rows, 'WARRANTY');
      for (i = 0; i < chg.order.length; i++) parts.push({ partCode: chg.order[i], qty: chg.map[chg.order[i]].qty, discountPaise: 0 });
      e = sbdHas(X.est, jg.id) && X.est[jg.id].versions.length ? X.est[jg.id].versions[X.est[jg.id].versions.length - 1] : null;
      lastIn = e ? e.b.bill.input : null;
      for (i = 0; lastIn && i < lastIn.lines.length; i++) {
        ln = lastIn.lines[i];
        if (ln.kind === 'LABOUR') labour.push({ code: ln.code, qty: ln.qty, discountPaise: 0 });
        else if (ln.kind === 'OTHER') other.push({ name: ln.name, qty: ln.qty, unitPricePaise: ln.unitPricePaise, priceBasis: ln.priceBasis, hsnSac: ln.hsnSac, rateBp: ln.rateBp, discountPaise: 0 });
      }
      info = estimateInfo(jg.id);
      jm = moneyOf(jg.id);
      rows = [];
      for (i = 0; i < wrn.order.length; i++) rows.push({ partCode: wrn.order[i], qty: wrn.map[wrn.order[i]].qty });
      input = {
        jobId: jg.id, parts: parts, labour: labour, other: other, billDiscountPaise: 0, discountReason: '', mode: 'CCPT_BILLED', notInCcptReason: '', ccptInvoiceNo: '',
        approvalOverrideReason: '', note: '', recipientGstin: lastIn ? lastIn.recipientGstin : '', recipientStateCode: lastIn ? lastIn.recipientStateCode : ''
      };
      return {
        ok: true, input: input, estimate: info, warrantyParts: rows, advanceHeldPaise: jm.ok === true ? jm.netPaise : null,
        locked: !!(activeOf(X, jg.id) || sheetOf(X, jg.id)), noCharge: jg.job.paymentStatus === 'no_charge_warranty', warnings: jg.warns
      };
    }


    function foundInvoice(no) {
      var t = sbdText(no, 40), e;
      if (t === null || t === '' || !sbdHas(X.inv, t)) return fail('DOC_NOT_FOUND');
      e = X.inv[t];
      return { ok: true, e: e };
    }

    function cancelInvoice(invoiceNo, reason, ctx) {
      var g = begin('INV_CANCEL', ctx), rf, dn, pin, f, e, rs, t, body, res;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['INV_CANCEL']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, invoice: invView(X.inv[rf.rec.b.invoiceNo], true), warnings: [], replayed: true };
      pin = needPin(g);
      if (pin) return pin;
      f = foundInvoice(invoiceNo);
      if (!f.ok) return f;
      e = f.e;
      if (e.legacy) return fail('LEGACY_READ_ONLY');
      if (e.cancel) return fail('STATE_INVALID', { state: 'CANCELLED' });
      rs = reasonOf(reason);
      if (!rs.ok) return rs;
      t = recordTime();
      if (!t.ok) return t;
      if (e.rec.b.docDate !== t.docDate) return fail('CANCEL_SAME_DAY_ONLY');
      if (e.credits.length) return fail('CANCEL_HAS_CREDIT');
      body = { jobId: e.jobId, invoiceNo: e.no, invoiceId: e.rec.id, reason: rs.value, pinAt: g.pinAt, docDate: t.docDate };
      res = writeRecords(g, [gitem('INV_CANCEL', body, rf.ref, null)], t.at, null);
      if (!res.ok) return res;
      return { ok: true, invoice: invView(e, true), warnings: res.warnings };
    }

    function linkCcptInvoice(input, ctx) {
      var g = begin('CCPT_ADD', ctx), rf, dn, f, e, nv, cur, norm = '', rs, reason = '', pinned = false, t, body, res;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['INV_CCPT']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, invoice: invView(X.inv[rf.rec.b.invoiceNo], costAllowed({ internal: false, sess: g.sess })), warnings: [], replayed: true };
      if (!sbdObj(input)) return fail('INPUT_INVALID');
      f = foundInvoice(input.invoiceNo);
      if (!f.ok) return f;
      e = f.e;
      if (e.cancel) return fail('INVOICE_CANCELLED');
      if (!e.legacy && e.rec.b.mode === 'NOT_IN_CCPT') return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
      nv = sbdText(input.ccptInvoiceNo, 40);
      if (nv === null) return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
      cur = currentCcpt(e);
      if (nv === cur) return fail('NO_CHANGE');
      if (cur !== '') {
        if (!sbdRule('CCPT_CHANGE', g.sess, configNow(), null).ok) return fail('NOT_ALLOWED');
        if (g.pinAt < 0) return fail('PIN_REQUIRED');
        rs = reasonOf(input.reason);
        if (!rs.ok) return rs;
        reason = rs.value;
        pinned = true;
      } else {
        reason = sbdText(input.reason, 200);
        if (reason === null) return fail('INPUT_INVALID', { field: 'reason' });
      }
      if (nv !== '') {
        norm = sbdNormCcpt(nv);
        if (norm === '') return fail('INPUT_INVALID', { field: 'ccptInvoiceNo' });
        if (ccptTaken(norm, e.no)) return fail('DUPLICATE_CCPT_INVOICE');
      }
      t = recordTime();
      if (!t.ok) return t;
      body = { jobId: e.jobId, invoiceNo: e.no, invoiceId: e.rec.id, ccptInvoiceNo: nv, prev: cur, reason: reason, pinAt: pinned ? g.pinAt : null, docDate: t.docDate };
      res = writeRecords(g, [gitem('INV_CCPT', body, rf.ref, null)], t.at, null);
      if (!res.ok) return res;
      return { ok: true, invoice: invView(e, costAllowed({ internal: false, sess: g.sess })), warnings: res.warnings };
    }

    function creditFail(r) {
      var out = lowerFail(r);
      if (r && r.code === 'CREDIT_LINE_NOCHARGE') {
        out.code = 'WARRANTY_NOT_CREDITABLE';
        out.message = MESSAGES.WARRANTY_NOT_CREDITABLE;
      }
      return out;
    }
    function readCreditStock(list, e, credit) {
      var out = [], seen = sbdMap(), i, s, rows = e.rec.b.stock, j, cl, ln, okLine;
      if (list === undefined || list === null) return { ok: true, list: [] };
      if (!sbdArr(list)) return fail('INPUT_INVALID', { field: 'stock' });
      for (i = 0; i < list.length; i++) {
        s = list[i];
        if (!sbdObj(s) || !sbdInt(s.lineNo) || !sbdInt(s.qty) || s.qty < 1) return fail('INPUT_INVALID', { field: 'stock' });
        if (seen[s.lineNo]) return fail('DUPLICATE_LINE', { lineNo: s.lineNo });
        seen[s.lineNo] = true;
        okLine = false;
        for (j = 0; j < rows.length; j++) if (rows[j].lineNo === s.lineNo) okLine = true;
        ln = e.rec.b.bill.lines[s.lineNo - 1];
        if (!okLine || !ln || ln.kind !== 'PART') return fail('INPUT_INVALID', { field: 'stock', lineNo: s.lineNo });
        cl = null;
        for (j = 0; j < credit.lines.length; j++) if (credit.lines[j].lineNo === s.lineNo) cl = credit.lines[j];
        if (!cl || s.qty > cl.qty) return fail('INPUT_INVALID', { field: 'stock', lineNo: s.lineNo });
        out.push({ lineNo: s.lineNo, qty: s.qty });
      }
      return { ok: true, list: out };
    }

    function issueCreditNote(input, ctx) {
      var g = begin('CN_ISSUE', ctx), rf, dn, pin, f, e, rc, rs, req, priors = [], i, vb, cr, sk, qtyBack = 0, t, nn, body, res, mode, nt, jg;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['CN_ISSUE']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, creditNote: cnView(X.cn[rf.rec.b.no], true), warnings: [], replayed: true };
      pin = needPin(g);
      if (pin) return pin;
      if (!sbdObj(input)) return fail('INPUT_INVALID');
      f = foundInvoice(input.invoiceNo);
      if (!f.ok) return f;
      e = f.e;
      if (e.legacy) return fail('LEGACY_READ_ONLY');
      if (e.cancel) return fail('INVOICE_CANCELLED');
      mode = input.mode;
      if (mode !== 'FULL' && mode !== 'PARTIAL') return fail('INPUT_INVALID', { field: 'mode' });
      rc = input.reasonClass;
      if (SBD_REASON_CLASSES.indexOf(rc) < 0) return fail('INPUT_INVALID', { field: 'reasonClass' });
      rs = reasonOf(input.reason);
      if (!rs.ok) return rs;
      nt = noteOf(input.note);
      if (!nt.ok) return nt;
      req = sbdObj(input.request) ? sbdCopy(input.request) : (mode === 'FULL' && input.request === undefined ? { kind: 'FULL' } : null);
      if (!req || (mode === 'FULL' ? req.kind !== 'FULL' : req.kind !== 'LINES')) return fail('INPUT_INVALID', { field: 'request' });
      jg = jobGate(e.jobId);
      if (jg.ok && jg.voided) return fail('JOB_VOIDED');
      vb = calc.verifyBill(e.rec.b.bill);
      if (!vb || vb.ok !== true) return fail('CALC_INCONSISTENT', vb && vb.code ? { calc: vb.code } : undefined);
      for (i = 0; i < e.credits.length; i++) priors.push(e.credits[i].b.credit);
      cr = calc.computeCreditNote(e.rec.b.bill, req, priors);
      if (!cr || cr.ok !== true) return creditFail(cr);
      sk = readCreditStock(input.stock, e, cr);
      if (!sk.ok) return sk;
      for (i = 0; i < sk.list.length; i++) qtyBack += sk.list[i].qty;
      if (cr.totalPaise === 0 && qtyBack === 0) return fail('CREDIT_EMPTY');
      t = recordTime();
      if (!t.ok) return t;
      nn = store.nextNumber('SCN', t.at);
      if (!nn || nn.ok !== true) return lowerFail(nn);
      body = {
        no: nn.no, docDate: t.docDate, jobId: e.jobId, invoiceNo: e.no, invoiceId: e.rec.id, mode: mode, reasonClass: rc, reason: rs.value, pinAt: g.pinAt,
        request: req, credit: cr, stock: sk.list, note: nt.value
      };
      res = writeRecords(g, [gitem('CN_ISSUE', body, rf.ref, 'SCN')], t.at, null);
      if (!res.ok) return res;
      return { ok: true, creditNote: cnView(X.cn[nn.no], true), invoice: invView(e, true), warnings: res.warnings };
    }


    function issueNoChargeSheet(input, ctx) {
      var g = begin('NCS_ISSUE', ctx), rf, dn, jg, hl, si, wrn, mi, docs, parts = [], labour = [], i, w, code, nt, lab, t, body, res, ln, rw, name, seen = sbdMap(), bad = [], cost = 0, id;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['NCS_ISSUE']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, sheet: sheetView(X.sheets[rf.rec.id]), warnings: [], replayed: true };
      if (!sbdObj(input)) return fail('INPUT_INVALID');
      hl = headRev('ledger');
      jg = jobGate(input.jobId);
      if (!jg.ok) return jg;
      id = jg.id;
      if (jg.voided) return fail('JOB_VOIDED');
      if (sheetOf(X, id)) return fail('SHEET_ALREADY_ISSUED');
      if (activeOf(X, id)) return fail('JOB_LOCKED');
      if (jg.job.paymentStatus !== 'no_charge_warranty') return fail('NOT_NO_CHARGE_JOB');
      si = jobIssueRows(id);
      if (!si.ok) return si;
      for (i = 0; i < si.rows.length; i++) if (si.rows[i].billing !== 'WARRANTY') bad.push({ partCode: si.rows[i].partCode, docNo: si.rows[i].docNo, qty: si.rows[i].outstanding });
      if (bad.length) return fail('ISSUE_BILLING_MISMATCH', bad);
      nt = noteOf(input.note);
      if (!nt.ok) return nt;
      lab = input.labour === undefined || input.labour === null ? [] : input.labour;
      if (!sbdArr(lab)) return fail('INPUT_INVALID', { field: 'labour' });
      if (lab.length > SBD_MAX_LINES) return fail('TOO_MANY_LINES');
      for (i = 0; i < lab.length; i++) {
        ln = lab[i];
        if (!sbdObj(ln) || !qtyOk(ln.qty)) return lineFail('QTY_INVALID', i);
        name = sbdText(ln.name, 80);
        if (name === null) return lineFail('INPUT_INVALID', i, { field: 'name' });
        code = '';
        if (ln.code !== undefined && ln.code !== null && ln.code !== '') {
          rw = masterRow('LABOUR', ln.code, i);
          if (!rw.ok) return rw;
          code = rw.code;
          if (name === '') name = String(rw.row.name).slice(0, 80);
        }
        if (name === '') return lineFail('INPUT_INVALID', i, { field: 'name' });
        if (code && seen[code]) return lineFail('DUPLICATE_LINE', i, { code: code });
        if (code) seen[code] = true;
        labour.push({ code: code, name: name, qty: ln.qty });
      }
      wrn = sumByPart(si.rows, 'WARRANTY');
      if (!wrn.order.length && !labour.length) return fail('LINES_REQUIRED');
      docs = retDocs();
      mi = docs ? movementIndex(docs) : null;
      if (!mi) return fail('DEPS_INVALID', 'stock');
      for (i = 0; i < wrn.order.length; i++) {
        code = wrn.order[i];
        w = costOfIssues(wrn.map[code].issues.map(function (x) { return x.id; }), mi);
        if (!w) return fail('DEPS_INVALID', 'stock');
        cost += w.costPaise;
        parts.push({ code: code, name: partName(code), qty: wrn.map[code].qty, issues: wrn.map[code].issues, costPaise: w.costPaise });
      }
      t = recordTime();
      if (!t.ok) return t;
      body = { jobId: id, docDate: t.docDate, note: nt.value, parts: parts, labour: labour, totals: { partsCostPaise: cost } };
      res = writeRecords(g, [gitem('NCS_ISSUE', body, rf.ref, null)], t.at, { ledger: hl });
      if (!res.ok) return res;
      return { ok: true, sheet: sheetView(X.sheets[res.records[0].id]), warnings: jg.warns.concat(res.warnings) };
    }

    function cancelNoChargeSheet(sheetId, reason, ctx) {
      var g = begin('NCS_CANCEL', ctx), rf, dn, pin, s, rs, t, body, res;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['NCS_CANCEL']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, sheet: sheetView(X.sheets[rf.rec.b.sheetId]), warnings: [], replayed: true };
      pin = needPin(g);
      if (pin) return pin;
      s = typeof sheetId === 'string' && sbdHas(X.sheets, sheetId) ? X.sheets[sheetId] : null;
      if (!s) return fail('DOC_NOT_FOUND');
      if (s.cancel) return fail('STATE_INVALID', { state: 'CANCELLED' });
      rs = reasonOf(reason);
      if (!rs.ok) return rs;
      t = recordTime();
      if (!t.ok) return t;
      if (s.rec.b.docDate !== t.docDate) return fail('CANCEL_SAME_DAY_ONLY');
      body = { jobId: s.jobId, sheetId: sheetId, reason: rs.value, pinAt: g.pinAt, docDate: t.docDate };
      res = writeRecords(g, [gitem('NCS_CANCEL', body, rf.ref, null)], t.at, null);
      if (!res.ok) return res;
      return { ok: true, sheet: sheetView(s), warnings: res.warnings };
    }


    function returnedUnder(docs) {
      var out = sbdMap(), i, j, d, ln;
      for (i = 0; i < docs.length; i++) {
        d = docs[i];
        if (typeof d.creditNoteNo !== 'string' || !d.creditNoteNo || d.state === 'REVERSED' || !sbdArr(d.lines)) continue;
        if (!sbdHas(out, d.creditNoteNo)) out[d.creditNoteNo] = sbdMap();
        for (j = 0; j < d.lines.length; j++) {
          ln = d.lines[j];
          out[d.creditNoteNo][ln.issueMovementId] = (out[d.creditNoteNo][ln.issueMovementId] || 0) + ln.qty;
        }
      }
      return out;
    }
    function lineIssueIds(e, lineNo) {
      var rows = e.rec.b.stock, i, j, out = [];
      for (i = 0; i < rows.length; i++) if (rows[i].lineNo === lineNo) for (j = 0; j < rows[i].issues.length; j++) out.push(rows[i].issues[j].id);
      return out;
    }
    function returnedOnLine(rets, cnNo, ids) {
      var s = 0, i;
      if (!sbdHas(rets, cnNo)) return 0;
      for (i = 0; i < ids.length; i++) s += rets[cnNo][ids[i]] || 0;
      return s;
    }
    // The port the Phase 1 return calls (AM-3): pieces returned under one credit note never exceed what it credited.
    function creditReturnCheck(jobId, cnNo, lines) {
      var rd = ready(), c, docs, rets, per = sbdMap(), i, j, ln, ids, seen = sbdMap(), row, found, ask, cred, k;
      function no(why, d) { var o = fail('CREDIT_RETURN_INVALID', { why: why }), kk; if (d) for (kk in d) if (sbdHas(d, kk)) o.detail[kk] = d[kk]; return o; }
      if (!rd.ok) return rd;
      c = typeof cnNo === 'string' && sbdHas(X.cn, cnNo) ? X.cn[cnNo] : null;
      if (!c) return no('NO_CREDIT_NOTE');
      if (c.rec.b.jobId !== jobId) return no('OTHER_JOB');
      if (c.inv.state === 'CANCELLED') return no('BILL_CANCELLED');
      if (!c.rec.b.stock.length) return no('NO_STOCK_LINES');
      if (!sbdArr(lines) || !lines.length) return no('NO_LINES');
      docs = retDocs();
      if (!docs) return fail('DEPS_INVALID', 'stock');
      rets = returnedUnder(docs);
      for (i = 0; i < lines.length; i++) {
        ln = lines[i];
        if (!sbdObj(ln) || typeof ln.issueMovementId !== 'string' || !sbdInt(ln.qty) || ln.qty < 1) return no('LINE_INVALID');
        if (seen[ln.issueMovementId]) return no('LINE_TWICE');
        seen[ln.issueMovementId] = true;
        found = 0;
        for (j = 0; j < c.rec.b.stock.length && !found; j++) {
          row = c.rec.b.stock[j];
          ids = lineIssueIds(c.inv, row.lineNo);
          if (ids.indexOf(ln.issueMovementId) >= 0) found = row.lineNo;
        }
        if (!found) return no('NOT_A_CREDITED_LINE', { issueMovementId: ln.issueMovementId });
        per[found] = (per[found] || 0) + ln.qty;
      }
      for (k in per) {
        if (!sbdHas(per, k)) continue;
        row = null;
        for (j = 0; j < c.rec.b.stock.length; j++) if (c.rec.b.stock[j].lineNo === +k) row = c.rec.b.stock[j];
        cred = row.qty;
        ask = returnedOnLine(rets, cnNo, lineIssueIds(c.inv, +k));
        if (per[k] + ask > cred) return no('EXCEEDS_CREDITED', { lineNo: +k, credited: cred, returned: ask, asked: per[k] });
      }
      return { ok: true };
    }

    function pendingReturnRows(docs) {
      var rets = returnedUnder(docs), out = [], i, j, c, row, ids, back, ln;
      for (i = 0; i < X.cnList.length; i++) {
        c = X.cn[X.cnList[i]];
        for (j = 0; j < c.rec.b.stock.length; j++) {
          row = c.rec.b.stock[j];
          ids = lineIssueIds(c.inv, row.lineNo);
          back = returnedOnLine(rets, c.rec.b.no, ids);
          ln = c.inv.rec.b.bill.lines[row.lineNo - 1];
          if (row.qty - back > 0) out.push({ cnNo: c.rec.b.no, jobId: c.rec.b.jobId, invoiceNo: c.inv.no, lineNo: row.lineNo, partCode: ln.code, creditedQty: row.qty, returnedQty: back, pendingQty: row.qty - back });
        }
      }
      return out;
    }

    // One outcome for every unit still out on a job (plan 7.3 table).
    function outcomesOf(jobId) {
      var si = jobIssueRows(jobId), docs, rets, map = sbdMap(), i, j, k, e, row, w, c, cs, back, ids, out = [], sh, r, o;
      if (!si.ok) return si;
      docs = retDocs();
      if (!docs) return fail('DEPS_INVALID', 'stock');
      rets = returnedUnder(docs);
      for (i = 0; sbdHas(X.invByJob, jobId) && i < X.invByJob[jobId].length; i++) {
        e = X.inv[X.invByJob[jobId][i]];
        if (e.legacy || e.cancel) continue;
        for (j = 0; j < e.rec.b.stock.length; j++) {
          row = e.rec.b.stock[j];
          o = 'BILLED';
          if (e.state === 'CREDITED_FULLY') {
            cs = 0;
            for (k = 0; k < e.credits.length; k++) for (w = 0; w < e.credits[k].b.stock.length; w++) if (e.credits[k].b.stock[w].lineNo === row.lineNo) cs += e.credits[k].b.stock[w].qty;
            ids = lineIssueIds(e, row.lineNo);
            back = 0;
            for (k = 0; k < e.credits.length; k++) back += returnedOnLine(rets, e.credits[k].b.no, ids);
            o = cs === 0 ? 'CREDIT_KEPT' : (cs - back > 0 ? 'CREDIT_RETURN_PENDING' : 'CREDIT_RETURNED');
          }
          for (k = 0; k < row.issues.length; k++) map[row.issues[k].id] = { outcome: o, invoiceNo: e.no };
        }
        for (j = 0; j < e.rec.b.warranty.length; j++) for (k = 0; k < e.rec.b.warranty[j].issues.length; k++) map[e.rec.b.warranty[j].issues[k].id] = { outcome: 'WARRANTY', invoiceNo: e.no };
      }
      sh = sheetOf(X, jobId);
      for (i = 0; sh && i < sh.rec.b.parts.length; i++) for (k = 0; k < sh.rec.b.parts[i].issues.length; k++) map[sh.rec.b.parts[i].issues[k].id] = { outcome: 'WARRANTY', sheetId: sh.rec.id };
      c = 0;
      for (i = 0; i < si.rows.length; i++) {
        r = si.rows[i];
        o = sbdHas(map, r.movementId) ? map[r.movementId] : { outcome: 'UNBILLED' };
        out.push({ movementId: r.movementId, docNo: r.docNo, lineNo: r.lineNo, partCode: r.partCode, outstanding: r.outstanding, billing: r.billing, outcome: o.outcome, invoiceNo: o.invoiceNo || '', sheetId: o.sheetId || '' });
        c += 1;
      }
      return { ok: true, outcomes: out };
    }

    function voidJob(jobId, reason, ctx) {
      var g = begin('JOB_VOID', ctx), rf, dn, pin, jg, id, hl, hr, rs, docs, pend = [], oc, bad = [], i, jm, st, body, t, res, hadInv;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['JOB_VOID']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, void: baseView(rf.rec), warnings: [], replayed: true };
      pin = needPin(g);
      if (pin) return pin;
      hl = headRev('ledger');
      hr = headRev('receipts');
      jg = jobGate(jobId);
      if (!jg.ok) return jg;
      id = jg.id;
      if (jg.voided) return fail('STATE_INVALID', { state: 'VOID' });
      rs = reasonOf(reason);
      if (!rs.ok) return rs;
      jm = moneyOf(id);
      if (!jm.ok) return jm;
      if (jg.job.status === 'closed' && !(sbdHas(X.jobs, id) || hasMoneyRecords(jm))) return fail('JOB_CLOSED_OLD_WAY');
      if (liveBillOf(X, id)) return fail('VOID_INVOICE_ACTIVE');
      docs = retDocs();
      if (!docs) return fail('DEPS_INVALID', 'stock');
      pend = pendingReturnRows(docs);
      for (i = 0; i < pend.length; i++) if (pend[i].jobId === id) return fail('VOID_STOCK_PENDING', pend[i]);
      if (sheetOf(X, id)) return fail('VOID_SHEET_ACTIVE');
      oc = outcomesOf(id);
      if (!oc.ok) return oc;
      for (i = 0; i < oc.outcomes.length; i++) {
        if (oc.outcomes[i].outcome === 'UNBILLED' || oc.outcomes[i].outcome === 'BILLED' || oc.outcomes[i].outcome === 'WARRANTY') bad.push({ partCode: oc.outcomes[i].partCode, qty: oc.outcomes[i].outstanding });
      }
      if (bad.length) return fail('VOID_PARTS_OUTSTANDING', bad);
      if (jm.legacyTypedPaise > 0 && !hasMoneyRecords(jm)) return fail('LEGACY_ADVANCE_UNCONFIRMED');
      if (jm.netPaise > 0) return fail('VOID_MONEY_HELD', { heldPaise: jm.netPaise });
      st = stock.jobStock(id);
      hadInv = sbdHas(X.invByJob, id) && X.invByJob[id].length > 0;
      t = recordTime();
      if (!t.ok) return t;
      body = { jobId: id, reason: rs.value, pinAt: g.pinAt, docDate: t.docDate, state: { hadInvoice: hadInv, hadMoney: hasMoneyRecords(jm), hadStock: !!(st && st.ok === true && st.issues.length > 0) } };
      res = writeRecords(g, [gitem('JOB_VOID', body, rf.ref, null)], t.at, { ledger: hl, receipts: hr });
      if (!res.ok) return res;
      return { ok: true, void: baseView(res.records[0]), warnings: res.warnings };
    }


    function config() {
      var rd = ready(), c;
      if (!rd.ok) return rd;
      c = configNow();
      return { ok: true, discountLimitPaise: c.discountLimitPaise, billingRoles: c.billingRoles.slice(), estimateRoles: c.estimateRoles.slice() };
    }
    function setBillingConfig(patch, ctx) {
      var g = begin('BCFG_SET', ctx), rf, dn, pin, cur, next, l, t, body, res;
      if (!g.ok) return g;
      rf = replayOf(ctx, ['BCFG_SET']);
      if (!rf.ok) return rf;
      if (rf.rec) return { ok: true, config: configNow(), warnings: [], replayed: true };
      pin = needPin(g);
      if (pin) return pin;
      if (!sbdObj(patch)) return fail('INPUT_INVALID');
      cur = configNow();
      next = { discountLimitPaise: cur.discountLimitPaise, billingRoles: cur.billingRoles.slice(), estimateRoles: cur.estimateRoles.slice() };
      if (patch.discountLimitPaise !== undefined) {
        if (!sbdLimitOk(patch.discountLimitPaise)) return fail('INPUT_INVALID', { field: 'discountLimitPaise' });
        next.discountLimitPaise = patch.discountLimitPaise;
      }
      if (patch.billingRoles !== undefined) {
        l = sbdRoleList(patch.billingRoles);
        if (!l) return fail('INPUT_INVALID', { field: 'billingRoles', rule: 'shell roles only, no Store Manager, no repeats' });
        next.billingRoles = l;
      }
      if (patch.estimateRoles !== undefined) {
        l = sbdRoleList(patch.estimateRoles);
        if (!l) return fail('INPUT_INVALID', { field: 'estimateRoles', rule: 'shell roles only, no Store Manager, no repeats' });
        next.estimateRoles = l;
      }
      if (next.discountLimitPaise === cur.discountLimitPaise && sbdListEq(next.billingRoles, cur.billingRoles) && sbdListEq(next.estimateRoles, cur.estimateRoles)) return fail('NO_CHANGE');
      t = recordTime();
      if (!t.ok) return t;
      body = { discountLimitPaise: next.discountLimitPaise, billingRoles: next.billingRoles, estimateRoles: next.estimateRoles };
      res = writeRecords(g, [gitem('BCFG_SET', body, rf.ref, null)], t.at, null);
      if (!res.ok) return res;
      return { ok: true, config: configNow(), warnings: res.warnings };
    }

    function legacyRefOf(item, jobId) {
      var plain = 'LEGACY:' + jobId, ref = item.ref;
      if (ref !== undefined && ref !== null) {
        if (typeof ref !== 'string' || ref.indexOf('LEGACY:') !== 0 || !SBD_REF_RE.test(ref)) return null;
        if (SBD_REF_RE.test(plain) && ref !== plain) return null;
        return ref;
      }
      return SBD_REF_RE.test(plain) ? plain : null;
    }
    // The migration hook: old bills brought in as INV_LEGACY records, idempotent by reference, one write, all or nothing.
    function importLegacy(items, ctx) {
      var g = begin('IMPORT_LEGACY', ctx), pin, out = [], skipped = [], seenNo = sbdMap(), seenJob = sbdMap(), i, it, b, v, ref, e, t, res;
      if (!g.ok) return g;
      pin = needPin(g);
      if (pin) return pin;
      if (!sbdArr(items) || items.length < 1 || items.length > SBD_BATCH_MAX) return fail('INPUT_INVALID', { field: 'items' });
      for (i = 0; i < items.length; i++) {
        it = sbdObj(items[i]) ? items[i] : {};
        b = sbdObj(it.body) ? it.body : it;
        v = validateLegacyBody(b);
        if (!v.ok) return fail('INPUT_INVALID', { index: i, field: v.detail.field });
        ref = legacyRefOf(it, b.jobId);
        if (!ref) return fail('INPUT_INVALID', { index: i, field: 'ref' });
        if ((e = store.findRef('invoices', ref))) {
          if (e.k !== 'INV_LEGACY' || !sbdObj(e.b) || e.b.jobId !== b.jobId) return fail('LEGACY_CONFLICT', { index: i });
          skipped.push({ jobId: b.jobId, legacyNo: b.legacyNo, reason: 'ALREADY_THERE' });
          continue;
        }
        if (seenNo[b.legacyNo] || seenJob[b.jobId]) return fail('LEGACY_CONFLICT', { index: i });
        e = sbdHas(X.inv, b.legacyNo) ? X.inv[b.legacyNo] : null;
        if (e) {
          if (e.legacy && e.jobId === b.jobId) {
            skipped.push({ jobId: b.jobId, legacyNo: b.legacyNo, reason: 'ALREADY_THERE' });
            continue;
          }
          return fail('LEGACY_CONFLICT', { index: i });
        }
        if (sbdHas(X.legacyJob, b.jobId) || activeOf(X, b.jobId)) return fail('LEGACY_CONFLICT', { index: i });
        seenNo[b.legacyNo] = true;
        seenJob[b.jobId] = true;
        out.push(gitem('INV_LEGACY', sbdCopy(b), ref, null));
      }
      if (!out.length) return { ok: true, written: 0, skipped: skipped, warnings: [] };
      t = recordTime();
      if (!t.ok) return t;
      res = writeRecords(g, out, t.at, null);
      if (!res.ok) return res;
      return { ok: true, written: out.length, skipped: skipped, warnings: res.warnings };
    }


    function fyArg(v) {
      var s = typeof v === 'string' ? v.replace(/^FY/i, '') : '';
      if (/^\d{2}-\d{2}$/.test(s)) return '20' + s;
      return /^\d{4}-\d{2}$/.test(s) ? s : '';
    }
    function pageOf(list, q) {
      var offset = sbdObj(q) && sbdInt(q.offset) && q.offset >= 0 ? q.offset : 0, limit = sbdObj(q) && sbdInt(q.limit) && q.limit >= 0 ? q.limit : -1;
      if (sbdObj(q) && q.newestFirst === true) list = list.slice().reverse();
      return limit < 0 ? list.slice(offset) : list.slice(offset, offset + limit);
    }
    function getInvoice(no, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS'), f;
      if (!gt.ok) return gt;
      f = foundInvoice(no);
      if (!f.ok) return f;
      return { ok: true, invoice: invView(f.e, costAllowed(gt)) };
    }
    function listInvoices(q, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS'), out = [], i, e, fy = '', total, costOk;
      if (!gt.ok) return gt;
      if (sbdObj(q) && q.fy !== undefined && q.fy !== '') {
        fy = fyArg(q.fy);
        if (!fy) return fail('INPUT_INVALID', { field: 'fy' });
      }
      costOk = costAllowed(gt);
      for (i = 0; i < X.invList.length; i++) {
        e = X.inv[X.invList[i]];
        if (sbdObj(q)) {
          if (typeof q.state === 'string' && q.state && e.state !== q.state) continue;
          if (typeof q.jobId === 'string' && q.jobId && e.jobId !== q.jobId) continue;
          if (fy && sbdFyLong(e.rec.at) !== fy) continue;
        }
        out.push(e);
      }
      total = out.length;
      out = pageOf(out, q).map(function (x) { return invView(x, costOk); });
      return { ok: true, invoices: out, total: total };
    }
    function getCreditNote(no, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS');
      if (!gt.ok) return gt;
      if (typeof no !== 'string' || !sbdHas(X.cn, no)) return fail('DOC_NOT_FOUND');
      return { ok: true, creditNote: cnView(X.cn[no], costAllowed(gt)) };
    }
    function listCreditNotes(q, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS'), out = [], i, c, fy = '', costOk;
      if (!gt.ok) return gt;
      if (sbdObj(q) && q.fy !== undefined && q.fy !== '') {
        fy = fyArg(q.fy);
        if (!fy) return fail('INPUT_INVALID', { field: 'fy' });
      }
      costOk = costAllowed(gt);
      for (i = 0; i < X.cnList.length; i++) {
        c = X.cn[X.cnList[i]];
        if (sbdObj(q) && typeof q.invoiceNo === 'string' && q.invoiceNo && c.inv.no !== q.invoiceNo) continue;
        if (fy && sbdFyLong(c.rec.at) !== fy) continue;
        out.push(cnView(c, costOk));
      }
      return { ok: true, creditNotes: out };
    }

    function isNewWay(jobId) {
      var rd = ready(), jm;
      if (!rd.ok) return rd;
      if (sbdHas(X.jobs, jobId)) return true;
      jm = moneyOf(jobId);
      return jm.ok ? hasMoneyRecords(jm) : jm;
    }
    function activeInvoiceNo(jobId) {
      var rd = ready(), e;
      if (!rd.ok) return rd;
      e = activeOf(X, jobId);
      return e ? e.no : '';
    }
    function isLocked(jobId) {
      var rd = ready();
      if (!rd.ok) return rd;
      return !!(activeOf(X, jobId) || sheetOf(X, jobId) || sbdHas(X.voids, jobId));
    }
    function isVoided(jobId) {
      var rd = ready();
      if (!rd.ok) return rd;
      return sbdHas(X.voids, jobId);
    }
    function blocksDelete(jobId) {
      var rd = ready(), reasons = [], jm, i, id = sbdText(jobId, 60);
      if (!rd.ok) return rd;
      if (id === null || id === '') return fail('INPUT_INVALID', { field: 'jobId' });
      if (sbdHas(X.invByJob, id) && X.invByJob[id].length) reasons.push('INVOICE');
      for (i = 0; i < X.cnList.length; i++) if (X.cn[X.cnList[i]].rec.b.jobId === id) { reasons.push('CREDIT_NOTE'); break; }
      if (sbdHas(X.sheetByJob, id)) reasons.push('SHEET');
      if (sbdHas(X.est, id) && X.est[id].approvals.length) reasons.push('APPROVAL');
      if (sbdHas(X.voids, id)) reasons.push('VOIDED');
      jm = moneyOf(id);
      if (!jm.ok) return jm;
      if (hasMoneyRecords(jm)) reasons.push('MONEY');
      return { ok: true, blocks: reasons.length > 0, reasons: reasons };
    }

    function jobBilling(jobId, ctx) {
      var gt = readGate(ctx, 'VIEW_STATUS'), jg, amounts, e, list, i, cn = [], cancelled = [], act, sh, oc, out, costOk, info;
      if (!gt.ok) return gt;
      jg = jobGate(jobId);
      if (!jg.ok) return jg;
      amounts = gt.internal || sbdRule('VIEW_AMOUNTS', gt.sess, configNow(), null).ok;
      costOk = gt.internal ? true : costAllowed(gt);
      list = sbdHas(X.invByJob, jg.id) ? X.invByJob[jg.id] : [];
      act = activeOf(X, jg.id);
      for (i = 0; i < list.length; i++) {
        e = X.inv[list[i]];
        if (e.state === 'CANCELLED') cancelled.push(e.no);
      }
      for (i = 0; i < X.cnList.length; i++) if (X.cn[X.cnList[i]].rec.b.jobId === jg.id) cn.push(amounts ? { no: X.cnList[i], totalPaise: X.cn[X.cnList[i]].rec.b.credit.totalPaise, invoiceNo: X.cn[X.cnList[i]].inv.no } : { no: X.cnList[i] });
      sh = sheetOf(X, jg.id);
      info = estimateInfo(jg.id);
      out = {
        ok: true, jobId: jg.id, voided: jg.voided, locked: !!(act || sh || jg.voided), newWay: sbdHas(X.jobs, jg.id), cancelledNos: cancelled, creditNotes: cn,
        estimate: amounts ? info : { state: info.state }, activeInvoice: null, sheet: null, outcomes: []
      };
      if (act) out.activeInvoice = amounts ? invView(act, costOk) : { no: act.no, state: act.state, mode: act.legacy ? 'LEGACY' : act.rec.b.mode };
      if (sh) out.sheet = amounts ? (costOk ? sheetView(sh) : stripCost(sheetView(sh))) : { id: sh.rec.id, state: 'ACTIVE' };
      if (amounts) {
        oc = outcomesOf(jg.id);
        if (oc.ok) out.outcomes = oc.outcomes;
        else out.outcomesError = oc.code;
      }
      if (act && amounts && !act.legacy) out.setOffStale = staleSetOff(act);
      return out;
    }
    function staleSetOff(e) {
      var out = [], i, r, v, rl = e.rec.b.setOff.receipts;
      if (!money || typeof money.receiptView !== 'function') return out;
      for (i = 0; i < rl.length; i++) {
        try { v = money.receiptView(rl[i].no); } catch (x) { v = null; }
        r = v && v.ok === true ? v.receipt : null;
        if (!r || r.status !== 'OK') out.push(rl[i].no);
      }
      return out;
    }
    // N1: a receipt set off on a live bill must not be reversed until the bill is cancelled.
    function receiptSetOff(no) {
      var rd = ready(), i, e, j, rl;
      if (!rd.ok) return rd;
      for (i = 0; i < X.invList.length; i++) {
        e = X.inv[X.invList[i]];
        if (e.legacy || e.state === 'CANCELLED') continue;
        rl = e.rec.b.setOff.receipts;
        for (j = 0; j < rl.length; j++) if (rl[j].no === no) return { ok: true, setOff: true, invoiceNo: e.no };
      }
      return { ok: true, setOff: false, invoiceNo: '' };
    }

    function issueOutcomes(jobId, ctx) {
      var gt = readGate(ctx, 'VIEW_AMOUNTS'), jg, oc;
      if (!gt.ok) return gt;
      jg = jobGate(jobId);
      if (!jg.ok) return jg;
      oc = outcomesOf(jg.id);
      return oc.ok ? { ok: true, jobId: jg.id, outcomes: oc.outcomes } : oc;
    }
    function jobsWithRecords() {
      var out = sbdMap(), keys, i, r;
      keys = Object.keys(X.jobs);
      for (i = 0; i < keys.length; i++) out[keys[i]] = true;
      if (money && typeof money.listReceipts === 'function') {
        try { r = money.listReceipts({}); } catch (e) { r = null; }
        if (r && r.ok === true && sbdArr(r.receipts)) for (i = 0; i < r.receipts.length; i++) if (typeof r.receipts[i].jobId === 'string') out[r.receipts[i].jobId] = true;
      }
      return Object.keys(out).sort();
    }
    // Parts issued to jobs that have billing records but were never billed, claimed or returned (the exception list).
    function unbilledIssues(ctx) {
      var gt = readGate(ctx, 'VIEW_REGISTERS'), jobs, i, j, oc, rows = [], job, state, docs, mi, w;
      if (!gt.ok) return gt;
      docs = retDocs();
      mi = docs ? movementIndex(docs) : null;
      if (!mi) return fail('DEPS_INVALID', 'stock');
      jobs = jobsWithRecords();
      for (i = 0; i < jobs.length; i++) {
        oc = outcomesOf(jobs[i]);
        if (!oc.ok) return oc;
        try { job = cases.get(jobs[i]); } catch (e) { job = null; }
        state = !sbdObj(job) ? 'unknown' : (job.voided === true || sbdHas(X.voids, jobs[i]) ? 'voided' : (job.status === 'closed' ? 'closed' : 'open'));
        for (j = 0; j < oc.outcomes.length; j++) {
          if (oc.outcomes[j].outcome !== 'UNBILLED') continue;
          // the row value at cost (whole paise, never a per-unit figure); the reader of this list is Manager or Owner
          w = costOfIssues([oc.outcomes[j].movementId], mi);
          if (!w) return fail('DEPS_INVALID', 'stock');
          rows.push({ jobId: jobs[i], jobState: state, movementId: oc.outcomes[j].movementId, docNo: oc.outcomes[j].docNo, partCode: oc.outcomes[j].partCode, qty: oc.outcomes[j].outstanding, billing: oc.outcomes[j].billing, costPaise: w.costPaise });
        }
      }
      return { ok: true, rows: rows };
    }
    function pendingCcpt(ctx) {
      var gt = readGate(ctx, 'VIEW_REGISTERS'), rows = [], i, e;
      if (!gt.ok) return gt;
      for (i = 0; i < X.invList.length; i++) {
        e = X.inv[X.invList[i]];
        if (e.legacy || e.state === 'CANCELLED' || e.rec.b.mode !== 'CCPT_BILLED' || currentCcpt(e) !== '') continue;
        rows.push({ no: e.no, jobId: e.jobId, docDate: e.rec.b.docDate, totalPaise: totalOf(e), state: e.state });
      }
      return { ok: true, rows: rows };
    }
    function pendingCreditReturns(ctx) {
      var gt = readGate(ctx, 'VIEW_REGISTERS'), docs;
      if (!gt.ok) return gt;
      docs = retDocs();
      return docs ? { ok: true, rows: pendingReturnRows(docs) } : fail('DEPS_INVALID', 'stock');
    }

    function costOfSales(q, ctx) {
      var gt = readGate(ctx, 'VIEW_COST'), docs, rows = [], i, j, e, from = '', to = '', fy = '', credit, total = 0, warr = 0, rv;
      if (!gt.ok) return gt;
      if (sbdObj(q)) {
        if (typeof q.from === 'string') from = q.from;
        if (typeof q.to === 'string') to = q.to;
        if (q.fy !== undefined && q.fy !== '') {
          fy = fyArg(q.fy);
          if (!fy) return fail('INPUT_INVALID', { field: 'fy' });
        }
      }
      docs = retDocs();
      if (!docs) return fail('DEPS_INVALID', 'stock');
      rv = sbdMap();
      for (i = 0; i < docs.length; i++) {
        if (typeof docs[i].creditNoteNo !== 'string' || !docs[i].creditNoteNo || docs[i].state === 'REVERSED') continue;
        for (j = 0; j < docs[i].mv.length; j++) rv[docs[i].creditNoteNo] = (rv[docs[i].creditNoteNo] || 0) + docs[i].mv[j].valuePaise;
      }
      for (i = 0; i < X.invList.length; i++) {
        e = X.inv[X.invList[i]];
        if (e.legacy || e.state === 'CANCELLED') continue;
        if ((from && e.rec.b.docDate < from) || (to && e.rec.b.docDate > to) || (fy && sbdFyLong(e.rec.at) !== fy)) continue;
        credit = 0;
        for (j = 0; j < e.credits.length; j++) credit += rv[e.credits[j].b.no] || 0;
        rows.push({ no: e.no, partsPaise: e.rec.b.cost.partsPaise, creditPaise: credit, netPaise: e.rec.b.cost.partsPaise - credit });
        total += e.rec.b.cost.partsPaise - credit;
        warr += e.rec.b.cost.warrantyPaise;
      }
      return { ok: true, invoices: rows, totalPaise: total, warrantyPaise: warr };
    }
    function verifyCost(no, ctx) {
      var gt = readGate(ctx, 'VIEW_COST'), f, e, docs, mi, i, w, ids, sum = 0, wsum = 0, b;
      if (!gt.ok) return gt;
      f = foundInvoice(no);
      if (!f.ok) return f;
      e = f.e;
      if (e.legacy) return fail('LEGACY_READ_ONLY');
      docs = retDocs();
      mi = docs ? movementIndex(docs) : null;
      if (!mi) return fail('DEPS_INVALID', 'stock');
      b = e.rec.b;
      for (i = 0; i < b.stock.length; i++) {
        ids = b.stock[i].issues.map(function (x) { return x.id; });
        w = costOfIssues(ids, mi);
        if (!w || w.costPaise !== b.stock[i].costPaise) return fail('COST_MISMATCH', { lineNo: b.stock[i].lineNo });
        sum += w.costPaise;
      }
      for (i = 0; i < b.warranty.length; i++) {
        ids = b.warranty[i].issues.map(function (x) { return x.id; });
        w = costOfIssues(ids, mi);
        if (!w || w.costPaise !== b.warranty[i].costPaise) return fail('COST_MISMATCH', { code: b.warranty[i].code });
        wsum += w.costPaise;
      }
      if (sum !== b.cost.partsPaise || wsum !== b.cost.warrantyPaise) return fail('COST_MISMATCH');
      return { ok: true, partsPaise: sum, warrantyPaise: wsum };
    }
    function repairLinks() {
      var rd = ready(), jobs, i, id, act, want, job, have, rows = [], list;
      if (!rd.ok) return rd;
      jobs = Object.keys(X.invByJob).sort();
      for (i = 0; i < jobs.length; i++) {
        id = jobs[i];
        act = activeOf(X, id);
        want = act ? act.no : '';
        try { job = cases.get(id); } catch (e) { job = null; }
        if (!sbdObj(job)) continue;
        have = typeof job.invoiceNo === 'string' ? job.invoiceNo : '';
        if (have === want) continue;
        list = X.invByJob[id];
        rows.push({ jobId: id, invoiceNo: want, state: act ? act.state : X.inv[list[list.length - 1]].state, action: want ? 'SET' : 'CLEAR' });
      }
      return { ok: true, links: rows };
    }
    function invoicesOn(date) {
      var rd = ready(), count = 0, paise = 0, cancelled = 0, i, e;
      if (!rd.ok) return rd;
      for (i = 0; i < X.invList.length; i++) {
        e = X.inv[X.invList[i]];
        if (e.legacy || e.rec.b.docDate !== date) continue;
        if (e.state === 'CANCELLED') cancelled += 1;
        else { count += 1; paise += totalOf(e); }
      }
      return { ok: true, count: count, paise: paise, cancelled: cancelled };
    }
    function creditNotesOn(date) {
      var rd = ready(), count = 0, paise = 0, i, c;
      if (!rd.ok) return rd;
      for (i = 0; i < X.cnList.length; i++) {
        c = X.cn[X.cnList[i]];
        if (c.rec.b.docDate !== date) continue;
        count += 1;
        paise += c.rec.b.credit.totalPaise;
      }
      return { ok: true, count: count, paise: paise };
    }


    function mustBeOk(r) {
      if (r && r.ok === false) throw new Error(String(r.code));
      return r;
    }
    function docsView() {
      return {
        invoiceForJob: function (jobId) {
          var list, i, e, last = null;
          mustBeOk(ready());
          list = sbdHas(X.invByJob, jobId) ? X.invByJob[jobId] : [];
          for (i = list.length - 1; i >= 0; i--) {
            e = X.inv[list[i]];
            if (e.legacy) continue;
            if (e.state !== 'CANCELLED') return { no: e.no, status: 'ISSUED', totalPaise: totalOf(e), creditedPaise: creditedOf(e), docDate: e.rec.b.docDate };
            if (!last) last = e;
          }
          return last ? { no: last.no, status: 'CANCELLED', totalPaise: totalOf(last), creditedPaise: 0, docDate: last.rec.b.docDate } : null;
        },
        creditNote: function (no) {
          mustBeOk(ready());
          return typeof no === 'string' && sbdHas(X.cn, no) ? { no: no, jobId: X.cn[no].rec.b.jobId, totalPaise: X.cn[no].rec.b.credit.totalPaise } : null;
        },
        counterSale: function (no) {
          var r = stock.getDoc(no), d;
          if (r && r.ok === false && r.code === 'DOC_NOT_FOUND') return null;
          mustBeOk(r);
          d = r.doc;
          if (d.kind !== 'CSL') return null;
          return { no: d.no, docDate: d.docDate, amountPaise: d.amountPaise, rcptDue: d.rcptDue === true, reversed: d.state === 'REVERSED' };
        },
        counterSalesOpen: function () {
          var r = mustBeOk(stock.listDocs({ kind: 'CSL' })), out = [], i, d;
          for (i = 0; i < r.docs.length; i++) {
            d = r.docs[i];
            if (d.rcptDue === true && d.state !== 'REVERSED') out.push({ no: d.no, docDate: d.docDate, amountPaise: d.amountPaise });
          }
          return out;
        },
        jobVoided: function (jobId) { return mustBeOk(isVoided(jobId)) === true; },
        isNewWay: function (jobId) { return mustBeOk(isNewWay(jobId)) === true; },
        invoicesOn: function (date) { return mustBeOk(invoicesOn(date)); },
        creditNotesOn: function (date) { return mustBeOk(creditNotesOn(date)); },
        receiptSetOff: function (no) { return mustBeOk(receiptSetOff(no)); }
      };
    }
    // The object the Phase 1 core hands to setBillingPort: credit returns (AM-3) and counter sale reversals (AM-2).
    function billingPortTarget() {
      return {
        creditReturn: function (jobId, cnNo, lines) { return creditReturnCheck(jobId, cnNo, lines); },
        saleReversible: function (no) {
          var r;
          if (!money || typeof money.saleMoney !== 'function') return { ok: false, code: 'DEPS_INVALID' };
          try { r = money.saleMoney(no); } catch (e) { r = null; }
          return r && r.ok === true && r.reversible === true ? { ok: true } : { ok: false, code: 'REFUND_FIRST' };
        }
      };
    }


    function safe(fn) {
      return function () {
        try {
          return fn.apply(null, arguments);
        } catch (e) {
          dirty = true;
          return fail('INTERNAL_ERROR', { error: String(e && e.message ? e.message : e).slice(0, 120) });
        }
      };
    }
    function open() {
      var rd = ready(), counts;
      if (!rd.ok && rd.code !== 'BILLING_BLOCKED') return rd;
      counts = X ? { estimates: Object.keys(X.est).length, invoices: X.invList.length, creditNotes: X.cnList.length, sheets: X.sheetList.length, voids: Object.keys(X.voids).length } : {};
      return { ok: rd.ok, blocked: !rd.ok, problems: X ? X.problems.slice() : [], summary: counts };
    }
    function status() {
      var rd = ready();
      if (!rd.ok && rd.code !== 'BILLING_BLOCKED' && !X) return rd;
      return {
        ok: true, opened: !!X, blocked: !!(X && X.problems.length), problems: X ? X.problems.slice() : [], revs: { invoices: X ? X.rev : 0 },
        counts: X ? { estimates: Object.keys(X.est).length, invoices: X.invList.length, creditNotes: X.cnList.length, sheets: X.sheetList.length, voids: Object.keys(X.voids).length } : {}
      };
    }
    function can(action, session) {
      var sess = sbdSession({ session: session }), rd, ru;
      if (!sess) return { ok: false, needsPin: false, code: 'SESSION_REQUIRED' };
      rd = ready();
      ru = sbdRule(typeof action === 'string' ? action : '', sess, rd.ok ? configNow() : { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] }, stockCanReturn);
      return ru.ok ? { ok: true, needsPin: ru.needsPin } : { ok: false, needsPin: false, code: ru.code };
    }

    api = {
      open: safe(open),
      status: safe(status),
      can: safe(can),
      config: safe(config),
      setBillingConfig: safe(setBillingConfig),
      saveEstimate: safe(saveEstimate),
      recordApproval: safe(recordApproval),
      estimateView: safe(estimateView),
      prepareInvoice: safe(prepareInvoice),
      previewInvoice: safe(previewInvoice),
      issueInvoice: safe(issueInvoice),
      linkCcptInvoice: safe(linkCcptInvoice),
      cancelInvoice: safe(cancelInvoice),
      issueCreditNote: safe(issueCreditNote),
      issueNoChargeSheet: safe(issueNoChargeSheet),
      cancelNoChargeSheet: safe(cancelNoChargeSheet),
      voidJob: safe(voidJob),
      importLegacy: safe(importLegacy),
      getInvoice: safe(getInvoice),
      listInvoices: safe(listInvoices),
      getCreditNote: safe(getCreditNote),
      listCreditNotes: safe(listCreditNotes),
      jobBilling: safe(jobBilling),
      activeInvoiceNo: safe(activeInvoiceNo),
      isLocked: safe(isLocked),
      isVoided: safe(isVoided),
      isNewWay: safe(isNewWay),
      issueOutcomes: safe(issueOutcomes),
      unbilledIssues: safe(unbilledIssues),
      pendingCcpt: safe(pendingCcpt),
      pendingCreditReturns: safe(pendingCreditReturns),
      creditReturnCheck: safe(creditReturnCheck),
      blocksDelete: safe(blocksDelete),
      costOfSales: safe(costOfSales),
      verifyCost: safe(verifyCost),
      repairLinks: safe(repairLinks),
      invoicesOn: safe(invoicesOn),
      creditNotesOn: safe(creditNotesOn),
      receiptSetOff: safe(receiptSetOff),
      docsView: docsView,
      billingPortTarget: billingPortTarget
    };
    return api;
  }

  return Object.freeze({
    version: 1,
    CODES: CODES,
    MESSAGES: MESSAGES,
    KINDS: KINDS,
    ESTIMATE_STATES: ESTIMATE_STATES,
    INVOICE_STATES: INVOICE_STATES,
    METHODS: METHODS,
    MODES: MODES,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    ROLE_ACTIONS: ROLE_ACTIONS,
    validateLegacyBody: validateLegacyBody,
    create: create
  });
});
