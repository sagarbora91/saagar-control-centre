(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingAreaUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Billing area (Service wave 2): the Billing view, its tabs and its two small dialogs.
     Screens only. Every read and write goes through the billing facade given by host.billing().
     The role is read fresh from host.session() at every guard. The Owner PIN is asked only through host.reauth().
     Every control carries data-svcs-action; row context rides in data-svs-key; listeners are delegated.
     No storage, no network, no messages. The only timer is the 200 ms pause of the bill search box. */

  var SBA_VERSION = 1;
  var SBA_PAGE = 20;
  var SBA_LABEL_MAX = 170;
  var SBA_MAX_LIMIT_PAISE = 100000000;
  var SBA_DEBOUNCE_MS = 200;
  var SBA_NO_SESSION = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });
  var SBA_HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  var SBA_ROLES = ['Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];
  var SBA_MODES = ['Cash', 'UPI', 'Card', 'Bank'];
  var SBA_RS_PREFIX = new RegExp('^(rs\\.?|' + String.fromCharCode(8377) + ')\\s*', 'i');
  var SBA_DECIDE_NOW = 'POST_NOW';
  var SBA_DECIDE_BOOK = 'IN_BOOK';

  var SBA_TEXT = Object.freeze({
    billing: 'Billing',
    billing_sub: 'Money for service jobs',
    tabs_label: 'Billing sections',
    tab_today: 'Today',
    tab_advances: 'Advances held',
    tab_unbilled: 'Not billed yet',
    tab_bills: 'Bills',
    tab_receipts: 'Receipts',
    tab_old: 'Old items',
    tab_settings: 'Settings',
    chip_ledger_ok: 'Ledger OK',
    chip_ledger_bad: 'Ledger check failed',
    chip_past: 'Past date: read-only',
    chip_view_only: 'View only',
    closed_core: 'Billing is not available in this build. Nothing was changed.',
    closed_session: 'Your session could not be read. Billing is closed. Go back to Home and sign in again.',
    closed_role: 'The Billing area is for the Store Manager and the Owner.',
    starting: 'Billing is starting. Check again in a moment.',
    check_again: 'Check again',
    loading: 'Loading...',
    na: 'not available',
    refresh: 'Refresh',
    print_day: 'Print day summary',
    date: 'Date',
    prev: 'Previous',
    next: 'Next',
    page: 'Page',
    of: 'of',
    open_job: 'Open job',
    view: 'View',
    close: 'Close',
    cancel: 'Cancel',
    saving: 'Saving...',
    job_open: 'Open',
    job_closed: 'Closed',
    job_voided: 'Voided',
    job_bill_cancelled: 'Bill cancelled',
    job_unknown: 'Unknown',
    days: 'days',
    day_one: 'day',
    day_receipts_mode: 'Receipts by mode',
    day_receipts_type: 'Receipts by type',
    day_refunds: 'Refunds',
    day_net: 'Net cash from service',
    day_net_hint: 'Compare this with the cash in the drawer.',
    day_net_all: 'Net, all modes',
    day_total_receipts: 'Total receipts',
    day_total_refunds: 'Total refunds',
    day_advances: 'Advances',
    day_balances: 'Balances',
    day_counter: 'Counter sales',
    day_reversed: 'Reversed receipts',
    day_held_now: 'Advances held now',
    day_bills: 'Bills issued',
    day_credit: 'Credit notes',
    day_discounts: 'Discounts given',
    day_nocharge: 'No-charge jobs',
    day_empty: 'No money was taken or paid out on this day.',
    mode_cash: 'Cash',
    mode_upi: 'UPI',
    mode_card: 'Card',
    mode_bank: 'Bank Transfer',
    drawer_label: 'Cash counted (Rs)',
    drawer_diff: 'Difference',
    drawer_hint: 'Nothing is saved. Type the cash in the drawer to compare.',
    drawer_check: 'Check the receipts before you count again.',
    adv_head: 'Advances held: {amount} on {n} jobs.',
    adv_empty: 'No advances are being held.',
    adv_held: 'Held',
    adv_refund: 'Refund advance',
    unb_head: '{n} jobs have parts issued and no bill.',
    unb_empty: 'Every job with issued parts has a bill, a no-charge mark or no parts left.',
    unb_pieces: 'Parts with job',
    unb_pieces_unit: 'pieces',
    unb_cost: 'FIFO cost',
    unb_oldest: 'Oldest issue',
    unb_warranty: 'Warranty parts',
    bills_search: 'Search bill, CCPT number or job',
    bills_status: 'Status',
    st_all: 'All',
    st_issued: 'Issued',
    st_paid: 'Paid',
    st_cancelled: 'Cancelled',
    st_credited: 'Credited',
    st_old: 'Old bill',
    bills_empty: 'No bills in this period.',
    bills_ccpt: 'CCPT',
    bills_total: 'Total',
    bills_after_credit: 'After credit notes',
    bv_title: 'Bill',
    bv_print_summary: 'Print bill summary',
    bv_print_tax: 'Print tax invoice',
    bv_credit: 'Credit note and refund',
    bv_cancel: 'Cancel bill',
    bv_job: 'Job',
    bv_ccpt: 'CCPT invoice number',
    bv_mode_ccpt: 'Billed in CCPT. This is a service bill summary, not a tax invoice.',
    bv_mode_own: 'Not billed in CCPT. The app prints the tax invoice.',
    bv_old_note: 'This bill was brought in from the old records. It is shown as a summary only.',
    bv_gstin: 'Customer GST number',
    bv_state: 'State code',
    bv_lines: 'Lines',
    bv_taxable: 'Taxable value',
    bv_cgst: 'CGST',
    bv_sgst: 'SGST',
    bv_igst: 'IGST',
    bv_discount: 'Discount',
    bv_discount_reason: 'Discount reason',
    bv_roundoff: 'Round off',
    bv_grand: 'Bill total',
    bv_setoff: 'Advance set off',
    bv_balance: 'Balance due',
    bv_legacy_no: 'Old number',
    bv_loading: 'Loading the bill...',
    line_qty: 'Qty',
    line_code: 'Tax code',
    line_rate: 'Rate',
    rcpt_from: 'From',
    rcpt_to: 'To',
    rcpt_type: 'Type',
    rcpt_paid_by: 'Paid by',
    rcpt_empty: 'No receipts in this period.',
    rcpt_print: 'Print',
    rcpt_reversed: 'Reversed',
    rcpt_posted: 'Posted',
    rcpt_in_book: 'Already in cash book',
    rcpt_ref: 'Ref',
    type_advance: 'Advance',
    type_balance: 'Balance',
    type_counter: 'Counter sale',
    type_refund: 'Refund',
    cs_head: 'Counter sales without a receipt',
    cs_empty: 'Every counter sale has a receipt.',
    cs_none: 'No receipt yet',
    cs_reversed: 'Receipt reversed',
    cs_take: 'Take receipt',
    cs_reversed_hint: 'Reverse this sale in Stores, Counter sale. It cannot take a second receipt.',
    old_adv_head: 'Old advances to confirm',
    old_adv_note: 'These amounts were typed on open jobs before receipts existed. They may already be in the cash book.',
    old_adv_typed: 'Typed on the job',
    old_adv_book: 'Confirm, already in cash book',
    old_adv_post: 'Confirm and post to cash book today',
    old_adv_owner_only: 'Only the Owner can confirm old advances.',
    old_adv_empty: 'There are no old items to confirm.',
    old_dlg_title: 'Confirm old advance',
    old_dlg_text: 'This turns the amount typed on the job into a receipt.',
    old_dlg_book: 'It will not be posted again to the cash book.',
    old_dlg_post: 'It will be posted to the cash book today as an advance.',
    old_dlg_confirm: 'Confirm',
    old_note: 'Note (optional)',
    old_choice_book: 'already in cash book',
    old_choice_post: 'post to cash book today',
    old_done: 'Old advance confirmed.',
    mig_head: 'Old invoices not yet in the billing records',
    mig_note: 'Bringing them in posts nothing to the cash book and changes nothing on the jobs.',
    mig_count: '{n} old invoices are not in the billing records yet.',
    mig_none: 'Every old invoice is already in the billing records.',
    mig_run: 'Bring in these records',
    mig_more: 'and {n} more',
    mig_skipped: 'Skipped: {n}',
    mig_skip_row: 'Job {job} (old invoice {no}): {why}',
    mig_skip_unknown: 'Left out by the bring-in checks.',
    mig_owner_only: 'Only the Owner can bring in old invoices.',
    mig_done: 'Old invoices brought in: {n}.',
    mig_warn: 'Check the figures',
    set_head: 'Billing settings',
    set_note: 'These settings apply to estimates, bills and receipts.',
    set_limit: 'Store Manager discount limit (Rs)',
    set_limit_hint: 'A discount above this needs the Owner and the PIN. Zero means every discount needs the Owner.',
    set_bill_roles: 'Roles that can take money and make bills',
    set_bill_hint: 'Store Manager and Owner can always do this. Staff roles that are not ticked cannot.',
    set_est_roles: 'Roles that can build estimates and record approvals',
    set_est_hint: 'Store Manager and Owner can always do this.',
    set_save: 'Save billing settings',
    set_saved: 'Billing settings saved.',
    hint_credit: 'The job is open. Use Credit note and refund on the job card.',
    hint_cancel: 'The job is open. Use Cancel bill on the job card.',
    hint_refund: 'The job is open. Use Refund advance on the job card.',
    pin_old_adv: 'Confirm old advance of {amount} on job {job}: {choice}.',
    pin_mig: 'Bring {n} old invoices into the billing records. Nothing is posted to the cash book.',
    pin_set: 'Change billing settings: discount limit {amount}, {n} billing roles.'
  });

  var SBA_ERR = Object.freeze({
    SVB_CORE_MISSING: 'Billing is not available in this build. Nothing was changed.',
    SVB_ROLE_DENIED: 'Your role cannot do this. Ask the Store Manager or the Owner.',
    SVB_OWNER_ONLY: 'Only the Owner can do this. Unlock Owner mode in the app header, then try again.',
    SVB_PIN_DENIED: 'Owner approval was not given. Nothing was changed.',
    SVB_PAST_VIEW: 'You are viewing a past date. Billing cannot be changed.',
    SVB_ACCESS_CHANGED: 'Your access changed. Nothing was saved.',
    SVB_BUSY: 'Another save is in progress. Wait a moment.',
    SVB_INTEGRITY: 'The billing records failed their check. Posting is stopped. Tell the Owner.',
    SVB_PRINT_UNAVAILABLE: 'Printing is not available in this build.',
    SVB_MONEY_INVALID: 'Enter an amount in rupees, for example 149.50.',
    SVB_DATE_FUTURE: 'The date cannot be in the future.',
    SVB_DATE_INVALID: 'Enter a valid date.',
    SVB_NOTHING_TO_DO: 'There is nothing to bring in.',
    SVB_BAD_REPLY: 'Something went wrong. Nothing was changed. Code: {code}.',
    NO_CHANGE: 'Nothing was changed. These are already the settings.',
    SESSION_REQUIRED: 'Your session could not be read. Billing is closed. Go back to Home and sign in again.',
    NOT_ALLOWED: 'Your role cannot do this. Ask the Store Manager or the Owner.',
    BILLING_BLOCKED: 'The billing records failed their check. Posting is stopped. Tell the Owner.'
  });

  /* ---------- small pure helpers ---------- */

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"'`]/g, function (c) { return SBA_HTML_ESC[c]; });
  }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function asText(v) { return v === null || v === undefined ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function has(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
  function trim(s) { return asText(s).replace(/^\s+|\s+$/g, ''); }
  function fill(str, vars) {
    return String(str).replace(/\{([a-z]+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? String(vars[k]) : m; });
  }
  function t(id) { return has(SBA_TEXT, id) ? SBA_TEXT[id] : id; }
  function cls() {
    var out = [], i;
    for (i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); }
    return out.join(' ');
  }
  function fail(code, detail) { return { ok: false, code: code, detail: detail }; }
  function thrown(e) { return fail('SVB_BAD_REPLY', { message: String(e && e.message ? e.message : e) }); }

  /* Money text: the kit's wording when it has one, else the same rule written here. */
  function localMoney(paise) {
    var neg, a, rupees, head, cents;
    if (!isInt(paise)) return '-';
    neg = paise < 0;
    a = Math.abs(paise);
    rupees = String(Math.floor(a / 100));
    cents = a % 100;
    if (rupees.length > 3) {
      head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      rupees = head + ',' + rupees.slice(-3);
    }
    return (neg ? '-' : '') + 'Rs ' + rupees + '.' + (cents < 10 ? '0' : '') + cents;
  }
  function localParse(text, opts) {
    var s = trim(text).replace(/,/g, '').replace(SBA_RS_PREFIX, ''), m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s), frac, paise;
    if (!m) return { ok: false, code: 'SVB_MONEY_INVALID' };
    frac = m[2] === undefined ? '00' : (m[2] + '0').slice(0, 2);
    paise = parseInt(m[1], 10) * 100 + parseInt(frac, 10);
    if (paise === 0 && !(opts && opts.allowZero)) return { ok: false, code: 'SVB_MONEY_INVALID' };
    return { ok: true, paise: paise };
  }
  /* The date rule lives once, in the kit (A2-02). Without the main UI (lists work alone) a date is valid when its day number
     gives the same text back. */
  function isoOk(s) {
    var f = kitFn('validIso'), n;
    if (f) { try { return f(s) === true; } catch (e) { return false; } }
    n = dayNo(s);
    return isFinite(n) && new Date(n * 86400000).toISOString().slice(0, 10) === asText(s);
  }
  function dayNo(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asText(iso));
    return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN;
  }
  function localDay(at) {
    var s = asText(at), ms;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    ms = Date.parse(s);
    return isFinite(ms) ? new Date(ms + 19800000).toISOString().slice(0, 10) : '';
  }
  function localAt(at) {
    var s = asText(at), ms;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    ms = Date.parse(s);
    return isFinite(ms) ? new Date(ms + 19800000).toISOString().slice(0, 16).replace('T', ' ') : s;
  }
  function monthStart(iso) { return asText(iso).slice(0, 7) + '-01'; }
  function ratePct(bp) {
    var whole, rest;
    if (!isInt(bp) || bp < 0) return '-';
    whole = Math.floor(bp / 100);
    rest = bp % 100;
    return whole + (rest ? '.' + (rest < 10 ? '0' : '') + rest : '') + '%';
  }

  /* ---------- rights (mirror of the single role table; core.can is the authority) ---------- */

  function tierOf(s) {
    if (!s || s.ok !== true) return 'none';
    if (s.isOwner === true) return 'owner';
    if (s.isManager === true) return 'manager';
    return 'staff';
  }
  function normaliseSession(s) {
    var tier;
    if (!s || typeof s !== 'object' || s.ok !== true) return SBA_NO_SESSION;
    tier = tierOf(s);
    return Object.freeze({ ok: true, isOwner: tier === 'owner', isManager: tier === 'owner' || tier === 'manager', role: asText(s.role), tier: tier, actorName: asText(s.actorName) });
  }
  /* Day summary, advances held, not billed yet, registers and old items: Store Manager and Owner only.
     Everything that moves money, and the settings: Owner only (with the PIN). */
  function rightsFor(session) {
    var s = normaliseSession(session), own = s.tier === 'owner', mgr = own || s.tier === 'manager';
    return {
      tier: s.tier, owner: own, manager: mgr,
      viewDay: mgr, viewLists: mgr, viewCost: mgr, printDocs: mgr,
      refundAdvance: own, creditNote: own, cancelBill: own, confirmOld: own, migrate: own, settings: own
    };
  }
  var SBA_OWNER_KEYS = { refundAdvance: 1, creditNote: 1, cancelBill: 1, confirmOld: 1, migrate: 1, settings: 1 };
  var SBA_WRITE_KEYS = ['refundAdvance', 'creditNote', 'cancelBill', 'confirmOld', 'migrate', 'settings'];

  /* ---------- state (memory only) ---------- */

  var H = null;
  var SBA_UI = null;
  var SBA_KIT = null;
  var S = freshState();

  function freshState() {
    return {
      tab: 'today', active: false, busy: false, tok: 0, counter: 0, status: null, cfg: { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] },
      day: { date: '', counted: '', net: null }, adv: { page: 1 }, unb: { page: 1 }, bills: { text: '', from: '', to: '', status: '', page: 1 },
      rcpt: { from: '', to: '', kind: '', mode: '', page: 1 }, old: { plan: null, advances: null }, set: null,
      seq: {}, dlg: null, binds: [], timer: null
    };
  }

  function nowIso() {
    var v = H && typeof H.nowIso === 'function' ? H.nowIso() : '';
    return v ? String(v) : new Date().toISOString();
  }
  function nowMs() {
    var ms = Date.parse(nowIso());
    return isFinite(ms) ? ms : new Date().getTime();
  }
  function todayIso() {
    var v = H && typeof H.today === 'function' ? H.today() : '';
    return isoOk(v) ? v : localDay(nowIso());
  }
  function viewDateIso() {
    var v = H && typeof H.viewDate === 'function' ? H.viewDate() : '';
    return isoOk(v) ? v : todayIso();
  }
  function readSession() {
    var s = null;
    try { s = H && typeof H.session === 'function' ? H.session() : null; } catch (e) { s = null; }
    return normaliseSession(s);
  }
  function isPast() {
    try { return !!(H && typeof H.isPast === 'function' && H.isPast()); } catch (e) { return false; }
  }
  function toast(msg) {
    try { if (H && typeof H.toast === 'function') H.toast(String(msg)); } catch (e) { /* the toast is a courtesy */ }
  }
  function newRef() {
    S.counter += 1;
    return 'svb-a-' + nowMs().toString(36) + '-' + S.counter;
  }
  function kitFn(name) { return SBA_KIT && typeof SBA_KIT[name] === 'function' ? SBA_KIT[name] : null; }
  function money(p) {
    var f = kitFn('money');
    var out;
    if (f) { try { out = f(p); } catch (e) { out = null; } if (typeof out === 'string') return out; }
    return localMoney(p);
  }
  function parsePaise(text, opts) {
    var f = kitFn('parsePaise');
    var out;
    if (f) { try { out = f(text, opts); } catch (e) { out = null; } if (out && typeof out === 'object' && typeof out.ok === 'boolean') return out; }
    return localParse(text, opts);
  }
  function fmtAt(at) {
    var f = kitFn('fmtAt');
    var out;
    if (f) { try { out = f(at); } catch (e) { out = null; } if (typeof out === 'string') return out; }
    return localAt(at);
  }
  function istDay(at) {
    var f = kitFn('istDay');
    var out;
    if (f) { try { out = f(at); } catch (e) { out = null; } if (typeof out === 'string') return out; }
    return localDay(at);
  }
  /* A figure the facade marks not available (or cannot give as whole paise) is never shown as zero. */
  function moneyOrNa(p) { return isInt(p) ? money(p) : t('na'); }
  function countOrNa(n) { return isInt(n) && n >= 0 ? String(n) : t('na'); }

  function billing() {
    var b = null;
    try { b = H && typeof H.billing === 'function' ? H.billing() : null; } catch (e) { b = null; }
    if (!b) { try { b = kitFn('billing') ? SBA_KIT.billing() : null; } catch (e2) { b = null; } }
    return b && typeof b === 'object' ? b : null;
  }
  function normalise(r) {
    if (r && r.ok === true) return r;
    return { ok: false, code: r && r.code ? String(r.code) : 'SVB_BAD_REPLY', message: r && r.message, detail: r && r.detail };
  }
  /* Call a facade method; sync or promise replies both work; nothing throws out. */
  function call(name, args) {
    var b = billing(), out;
    if (!b || typeof b[name] !== 'function') return Promise.resolve(fail('SVB_CORE_MISSING'));
    try { out = b[name].apply(b, args || []); } catch (e) { return Promise.resolve(thrown(e)); }
    return Promise.resolve(out).then(normalise, function (e2) { return thrown(e2); });
  }
  function makeCtx(session, stepUp, clientRef) { return { session: session, stepUp: stepUp || null, clientRef: clientRef || '' }; }
  function readCtx() { return makeCtx(readSession(), null, ''); }

  function errText(r) {
    var code = r && r.code ? String(r.code) : 'SVB_BAD_REPLY', f, out;
    if (has(SBA_ERR, code)) return fill(SBA_ERR[code], { code: code });
    f = kitFn('errText');
    if (f) { try { out = f(r); } catch (e) { out = null; } if (typeof out === 'string' && out) return out; }
    if (r && typeof r.message === 'string' && r.message.length > 3) return r.message.slice(0, 300);
    return fill(SBA_ERR.SVB_BAD_REPLY, { code: code });
  }

  /* Rights as the screen may show them: write rights vanish in a past view or when the ledger check failed. */
  function integrityOk() {
    var st = S.status;
    if (!st) return true;
    if (st.billingBlocked === true || st.blocked === true) return false;
    return !(st.integrity && st.integrity.ok === false);
  }
  function shownRights() {
    var R = rightsFor(readSession()), i;
    if (isPast() || !integrityOk()) { for (i = 0; i < SBA_WRITE_KEYS.length; i++) R[SBA_WRITE_KEYS[i]] = false; }
    return R;
  }
  /* The guard of every write: a readable session, not a past view, one named right. Returns a failure or null. */
  function gate(rightKey) {
    var s = readSession(), R;
    if (s.ok !== true) return fail('SVB_ROLE_DENIED');
    if (isPast()) return fail('SVB_PAST_VIEW');
    R = rightsFor(s);
    if (rightKey && !R[rightKey]) return fail(SBA_OWNER_KEYS[rightKey] && R.tier !== 'none' && R.tier !== 'staff' ? 'SVB_OWNER_ONLY' : 'SVB_ROLE_DENIED');
    if (!integrityOk()) return fail('SVB_INTEGRITY');
    return null;
  }
  function viewGate(rightKey) {
    var s = readSession(), R;
    if (s.ok !== true) return fail('SVB_ROLE_DENIED');
    R = rightsFor(s);
    return R[rightKey] ? null : fail('SVB_ROLE_DENIED');
  }

  /* One exclusive action at a time: a second press while busy is refused and the facade sees one call. */
  function exclusive(fn) {
    var b, p;
    if (S.busy) {
      b = fail('SVB_BUSY');
      showFailure(b);
      return Promise.resolve(b);
    }
    S.busy = true;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.resolve(thrown(e)); }
    return p.then(function (r) { S.busy = false; return r; }, function (e2) {
      var f = thrown(e2);
      S.busy = false;
      showFailure(f);
      return f;
    });
  }
  /* Owner step (pattern P) lives once, in the kit (A2-02): Owner check, PIN, a fresh session read, then the work.
     Without the kit nothing is asked and the facade is not called. */
  function ownerStep(label, work, ref) {
    var f = kitFn('ownerStep');
    if (!f || !H || typeof H.reauth !== 'function') return Promise.resolve(fail('SVB_PIN_DENIED'));
    try {
      return Promise.resolve(f(String(label).slice(0, SBA_LABEL_MAX), work, ref || newRef(), function (l) { return H.reauth(l); }));
    } catch (e) { return Promise.resolve(fail('SVB_PIN_DENIED')); }
  }

  /* ---------- html builders (every dynamic value goes through esc) ---------- */

  function btn(action, label, o) {
    o = o || {};
    var h = '<button type="button" class="' + esc(cls('svs-btn', o.cls)) + '" data-svcs-action="' + esc(action) + '"';
    if (o.key !== undefined && o.key !== null) h += ' data-svs-key="' + esc(o.key) + '"';
    if (o.focus) h += ' data-svs-focus="1"';
    if (o.disabled) h += ' disabled';
    return h + '>' + esc(label) + '</button>';
  }
  function badge(kind, label) { return '<span class="' + esc('svs-badge svs-badge-' + kind) + '">' + esc(label) + '</span>'; }
  function notice(kind, text) { return '<div class="' + esc('svs-note svs-note-' + kind) + '">' + esc(text) + '</div>'; }
  function emptyHtml(text) { return '<div class="svs-empty">' + esc(text) + '</div>'; }
  function optionHtml(list, current) {
    var h = '', i;
    for (i = 0; i < list.length; i++) h += '<option value="' + esc(list[i].v) + '"' + (String(list[i].v) === String(current) ? ' selected' : '') + '>' + esc(list[i].l) + '</option>';
    return h;
  }
  /* A labelled control. o: name, label, value, kind (text|date|select|check), options, err, hint, mode, max, focus. */
  function field(o) {
    var id = 'svb-fa-' + o.name.replace(/[^a-z0-9]/gi, '-'), common, control, label, hint, err;
    common = ' id="' + esc(id) + '" data-svs-field="' + esc(o.name) + '"';
    if (o.focus) common += ' data-svs-focus="1"';
    if (o.err) common += ' aria-invalid="true" aria-describedby="' + esc(id) + '-err"';
    if (o.kind === 'select') control = '<select class="svs-input"' + common + '>' + optionHtml(o.options || [], o.value) + '</select>';
    else if (o.kind === 'check') control = '<input type="checkbox" class="svs-check"' + common + (o.value ? ' checked' : '') + '>';
    else control = '<input type="' + (o.kind === 'date' ? 'date' : 'text') + '" class="svs-input"' + common + ' value="' + esc(o.value === undefined ? '' : o.value) + '"' +
      (o.max ? ' maxlength="' + esc(o.max) + '"' : '') + (o.mode ? ' inputmode="' + esc(o.mode) + '"' : '') +
      ' autocomplete="off" autocorrect="off" spellcheck="false">';
    label = '<label for="' + esc(id) + '">' + esc(o.label) + '</label>';
    hint = o.hint ? '<div class="svs-hint">' + esc(o.hint) + '</div>' : '';
    err = o.err ? '<div class="svs-field-err" id="' + esc(id) + '-err" role="alert">' + esc(o.err) + '</div>' : '';
    if (o.kind === 'check') return '<div class="svs-field svs-field-check">' + control + label + hint + err + '</div>';
    return '<div class="svs-field">' + label + control + hint + err + '</div>';
  }
  function kv(label, valueHtml, extra) {
    return '<div class="' + esc(cls('svs-row', 'svb-kv', extra)) + '"><span class="svb-row-label">' + esc(label) + '</span> <span class="svb-row-value">' + valueHtml + '</span></div>';
  }
  function block(title, inner) {
    return '<div class="svb-block"><h3 class="svs-h3">' + esc(title) + '</h3><div class="svb-rows">' + inner + '</div></div>';
  }
  function pagesOf(total) { return Math.max(1, Math.ceil((isInt(total) ? total : 0) / SBA_PAGE)); }
  function pagerHtml(prefix, page, total) {
    var pages = pagesOf(total), h;
    if (pages <= 1) return '';
    h = '<div class="svs-pager">';
    if (page > 1) h += btn(prefix + '-page-prev', t('prev'), { cls: 'svs-btn-quiet' });
    h += '<span class="svs-pageof">' + esc(t('page')) + ' ' + page + ' ' + esc(t('of')) + ' ' + pages + '</span>';
    if (page < pages) h += btn(prefix + '-page-next', t('next'), { cls: 'svs-btn-quiet' });
    return h + '</div>';
  }

  /* ---------- minimal DOM helpers ---------- */

  function qsa(container, sel) {
    var list;
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    try { list = container.querySelectorAll(sel); } catch (e) { return []; }
    return Array.prototype.slice.call(list || []);
  }
  function qs(container, sel) {
    if (!container || typeof container.querySelector !== 'function') return null;
    try { return container.querySelector(sel); } catch (e) { return null; }
  }
  function getAttr(el, name) { return el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null; }
  function byId(container, id) { return qs(container, '#' + id); }
  function setHtml(el, html) { if (el) el.innerHTML = html; }
  function fieldValue(el) {
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    return el.value === undefined || el.value === null ? '' : String(el.value);
  }
  function fieldIn(container, name) { return qs(container, '[data-svs-field="' + name + '"]'); }
  function focusEl(el) { try { if (el && typeof el.focus === 'function') el.focus(); } catch (e) { /* focus is best effort */ } }
  function inActiveView(el) {
    var v;
    if (!el) return false;
    if (typeof el.closest !== 'function') return true;
    v = el.closest('.view');
    return !!(v && v.classList && v.classList.contains('active'));
  }
  function areaActive() { return !!(H && H.root && S.active && inActiveView(H.root)); }

  /* ---------- failure display ---------- */

  function setAlert(text) { setHtml(H && H.root ? byId(H.root, 'svb-alert') : null, esc(text)); }
  function showFailure(r) {
    var text = errText(r);
    if (S.dlg && layerMarked()) {
      S.dlg.error = text;
      redraw(false);
    } else setAlert(text);
    toast(text);
  }
  function setStatusLine(text) { setHtml(H && H.root ? byId(H.root, 'svb-status') : null, esc(text)); }

  /* ---------- the Billing view: shell, tabs, status ---------- */

  var SBA_TABS = [
    { id: 'today', action: 'svb-tab-today', label: 'tab_today', need: 'viewDay' },
    { id: 'advances', action: 'svb-tab-advances', label: 'tab_advances', need: 'viewLists' },
    { id: 'unbilled', action: 'svb-tab-unbilled', label: 'tab_unbilled', need: 'viewLists' },
    { id: 'bills', action: 'svb-tab-bills', label: 'tab_bills', need: 'viewLists' },
    { id: 'receipts', action: 'svb-tab-receipts', label: 'tab_receipts', need: 'viewLists' },
    { id: 'old', action: 'svb-tab-old', label: 'tab_old', need: 'viewLists' },
    { id: 'settings', action: 'svb-tab-settings', label: 'tab_settings', need: 'settings' }
  ];
  function tabsFor(R) {
    var out = [], i;
    for (i = 0; i < SBA_TABS.length; i++) { if (R[SBA_TABS[i].need]) out.push(SBA_TABS[i]); }
    return out;
  }
  function chipsHtml(R) {
    var h = '', code;
    if (S.status) {
      code = S.status.integrity && S.status.integrity.code ? ' ' + S.status.integrity.code : '';
      h += integrityOk() ? badge('ok', t('chip_ledger_ok')) : badge('bad', t('chip_ledger_bad') + code);
    }
    if (R.tier === 'manager') h += badge('info', t('chip_view_only'));
    if (isPast()) h += badge('warn', t('chip_past'));
    return h;
  }
  function headHtml(R) {
    return '<div class="svs-head"><div><h2 id="svb-title" class="svs-title">' + esc(t('billing')) + '</h2><div class="svs-dim">' + esc(t('billing_sub')) + '</div></div>' +
      '<div class="svs-chips">' + chipsHtml(R) + '</div></div>';
  }
  function closedHtml(textKey) { return headHtml(rightsFor(null)) + notice('bad', t(textKey)); }
  function normCfg(c) {
    var o = c && typeof c === 'object' ? c : {};
    return {
      discountLimitPaise: isInt(o.discountLimitPaise) && o.discountLimitPaise >= 0 ? o.discountLimitPaise : 0,
      billingRoles: arr(o.billingRoles).filter(function (x) { return typeof x === 'string'; }),
      estimateRoles: arr(o.estimateRoles).filter(function (x) { return typeof x === 'string'; })
    };
  }

  function render() {
    var rootEl = H && H.root, tok, sess;
    if (!rootEl) return;
    tok = ++S.tok;
    sess = readSession();
    if (!billing()) { rootEl.innerHTML = closedHtml('closed_core'); return; }
    if (sess.ok !== true) { rootEl.innerHTML = closedHtml('closed_session'); return; }
    call('status', []).then(function (st) {
      if (tok !== S.tok) return;
      S.status = st.ok ? st : null;
      if (!st.ok) {
        rootEl.innerHTML = headHtml(rightsFor(sess)) + notice('bad', errText(st)) + '<div class="svs-bar">' + btn('svb-area-retry', t('check_again'), { cls: 'svs-btn-primary' }) + '</div>';
        return;
      }
      S.cfg = normCfg(st.config);
      if (st.ready === false && st.blocked !== true) {
        rootEl.innerHTML = headHtml(rightsFor(sess)) + notice('info', t('starting')) + '<div class="svs-bar">' + btn('svb-area-retry', t('check_again'), { cls: 'svs-btn-primary' }) + '</div>';
        return;
      }
      renderShell();
    });
  }
  function renderShell() {
    var rootEl = H && H.root, R, tabs, current = null, i, tabHtml, banner = '', on;
    if (!rootEl) return;
    R = shownRights();
    if (readSession().ok !== true) { rootEl.innerHTML = closedHtml('closed_session'); return; }
    tabs = tabsFor(rightsFor(readSession()));
    if (!tabs.length) { rootEl.innerHTML = headHtml(R) + notice('bad', t('closed_role')); return; }
    for (i = 0; i < tabs.length; i++) { if (tabs[i].id === S.tab) current = tabs[i]; }
    if (!current) { current = tabs[0]; S.tab = current.id; }
    tabHtml = '<div class="svs-tabs" role="tablist" aria-label="' + esc(t('tabs_label')) + '">';
    for (i = 0; i < tabs.length; i++) {
      on = tabs[i].id === S.tab;
      tabHtml += '<button type="button" class="' + esc(cls('svs-tab', on ? 'is-active' : '')) + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" tabindex="' + (on ? '0' : '-1') + '" data-svcs-action="' + esc(tabs[i].action) + '">' + esc(t(tabs[i].label)) + '</button>';
    }
    tabHtml += '</div>';
    if (!integrityOk()) banner += '<div class="svs-note svs-note-bad" role="alert">' + esc(SBA_ERR.SVB_INTEGRITY) + '</div>';
    if (isPast()) banner += notice('warn', SBA_ERR.SVB_PAST_VIEW);
    rootEl.innerHTML = headHtml(R) + tabHtml + '<div id="svb-status" class="svs-status" role="status" aria-live="polite"></div>' +
      '<div id="svb-alert" class="svs-alert" role="alert"></div>' + banner + '<div id="svb-body" class="svs-body" role="tabpanel"></div>';
    renderTab(R);
  }
  function renderTab(R) {
    var body = byId(H.root, 'svb-body');
    if (!body) return;
    if (S.tab === 'today') tabToday(body, R);
    else if (S.tab === 'advances') tabAdvances(body, R);
    else if (S.tab === 'unbilled') tabUnbilled(body, R);
    else if (S.tab === 'bills') tabBills(body, R);
    else if (S.tab === 'receipts') tabReceipts(body, R);
    else if (S.tab === 'old') tabOld(body, R);
    else if (S.tab === 'settings') tabSettings(body, R);
  }
  function sbaSwitchTab(id) {
    if (S.dlg && layerMarked()) return;
    S.tab = id;
    if (id === 'settings') S.set = null;
    renderShell();
  }

  /* A list region is refreshed on its own so the controls above it keep focus. */
  function region(id, seqKey, loader, paint) {
    var el = H && H.root ? byId(H.root, id) : null, mine, tab = S.tab;
    if (!el) return;
    S.seq[seqKey] = (S.seq[seqKey] || 0) + 1;
    mine = S.seq[seqKey];
    el.innerHTML = '<div class="svs-dim" role="status">' + esc(t('loading')) + '</div>';
    loader().then(function (r) {
      var target;
      if (!H || mine !== S.seq[seqKey] || tab !== S.tab) return;
      target = byId(H.root, id);
      if (!target) return;
      if (!r.ok) { target.innerHTML = '<div class="svs-note svs-note-bad" role="alert">' + esc(errText(r)) + '</div>'; return; }
      paint(target, r);
    });
  }
  /* Rows of one page: a facade that already cut the page is kept; one that returned everything is cut here. */
  function pageOf(rows, page, totalHint) {
    var total = rows.length, out = rows;
    if (rows.length > SBA_PAGE) out = rows.slice((page - 1) * SBA_PAGE, page * SBA_PAGE);
    else if (isInt(totalHint) && totalHint > rows.length) total = totalHint;
    return { rows: out, total: total };
  }
  function ageClass(days) { return !isInt(days) ? '' : (days >= 90 ? 'svb-age-bad' : (days >= 30 ? 'svb-age-warn' : '')); }
  function ageDays(fromDay) {
    var a = dayNo(todayIso()), b = dayNo(fromDay);
    return isFinite(a) && isFinite(b) && a >= b ? a - b : null;
  }
  function jobChip(state) {
    var s = asText(state).toUpperCase();
    if (s === 'OPEN') return badge('ok', t('job_open'));
    if (s === 'CLOSED' || s === 'CLOSED_NO_INVOICE') return badge('info', t('job_closed'));
    if (s === 'VOID' || s === 'VOIDED') return badge('bad', t('job_voided'));
    if (s === 'INVOICE_CANCELLED') return badge('warn', t('job_bill_cancelled'));
    return badge('warn', t('job_unknown'));
  }
  function jobTitle(row) {
    var id = asText(row.jobId), label = trim(row.label);
    return '<b class="svs-code">' + esc(id) + '</b>' + (label && label !== id ? ' <span class="svs-dim">' + esc(label) + '</span>' : '');
  }

  /* ---------- Today ---------- */

  function modeLabel(m) { return t(m === 'Cash' ? 'mode_cash' : (m === 'UPI' ? 'mode_upi' : (m === 'Card' ? 'mode_card' : 'mode_bank'))); }
  function tabToday(body, R) {
    if (!isoOk(S.day.date)) S.day.date = viewDateIso();
    body.innerHTML = '<div class="svs-bar">' + field({ name: 'day-date', label: t('date'), kind: 'date', value: S.day.date, focus: true }) +
      btn('svb-today-refresh', t('refresh')) + btn('svb-today-print', t('print_day'), { disabled: !R.viewDay }) + '</div>' +
      '<div id="svb-day-flag"></div><div id="svb-day-body" class="svb-day" aria-live="polite"></div>';
    loadDay();
  }
  function loadDay() {
    var date = S.day.date;
    setHtml(H && H.root ? byId(H.root, 'svb-day-flag') : null, isoOk(date) && date < todayIso() ? badge('warn', t('chip_past')) : '');
    if (!isoOk(date)) { setHtml(byId(H.root, 'svb-day-body'), notice('bad', SBA_ERR.SVB_DATE_INVALID)); return; }
    if (date > todayIso()) { setHtml(byId(H.root, 'svb-day-body'), notice('bad', SBA_ERR.SVB_DATE_FUTURE)); return; }
    region('svb-day-body', 'day', function () { return call('daySummary', [date, readCtx()]); }, paintDay);
  }
  function modeAmount(group, m) {
    var v = group && group[m];
    return isInt(v) ? v : (v && isInt(v.paise) ? v.paise : null);
  }
  function modeRows(group) {
    var h = '', i, m, v, count;
    for (i = 0; i < SBA_MODES.length; i++) {
      m = SBA_MODES[i];
      v = modeAmount(group, m);
      count = group && group[m] && isInt(group[m].count) ? ' <span class="svs-dim">(' + group[m].count + ')</span>' : '';
      h += kv(modeLabel(m), esc(moneyOrNa(v)) + count);
    }
    return h;
  }
  function figureOf(obj, k) { return obj && obj.available !== false && isInt(obj[k]) ? obj[k] : null; }
  function typeRow(label, obj) {
    var c = obj && isInt(obj.count) ? obj.count : null, p = obj && isInt(obj.paise) ? obj.paise : null;
    return kv(label, c === null || p === null ? esc(t('na')) : esc(c + ' / ' + money(p)));
  }
  function paintDay(el, s) {
    var rec = s.receipts || {}, ref = s.refunds || {}, h = '', net = isInt(s.netCash) ? s.netCash : null, all = isInt(s.netAll) ? s.netAll : null, inv = s.invoicesIssued, cn = s.creditNotes, na = arr(s.notAvailable), empty;
    S.day.net = net;
    empty = isInt(rec.total) && rec.total === 0 && isInt(ref.total) && ref.total === 0 && na.length === 0 && (!s.advancesHeldNow || s.advancesHeldNow.count === 0) &&
      (!inv || inv.available === false || inv.count === 0) && (!cn || cn.available === false || cn.count === 0);
    if (empty) h += emptyHtml(t('day_empty'));
    h += block(t('day_receipts_mode'), modeRows(rec) + kv(t('day_total_receipts'), esc(moneyOrNa(isInt(rec.total) ? rec.total : null)), 'svb-total'));
    h += block(t('day_receipts_type'), typeRow(t('day_advances'), s.advancesTaken) + typeRow(t('day_balances'), s.balanceReceipts) + typeRow(t('day_counter'), s.counterReceipts) +
      (s.reversed ? typeRow(t('day_reversed'), s.reversed) : ''));
    h += block(t('day_refunds'), modeRows(ref) + kv(t('day_total_refunds'), esc(moneyOrNa(isInt(ref.total) ? ref.total : null)), 'svb-total'));
    h += '<div class="svb-block svb-net"><h3 class="svs-h3">' + esc(t('day_net')) + '</h3><div class="' + esc(cls('svb-big', net !== null && net < 0 ? 'svb-neg' : '')) + '">' + esc(moneyOrNa(net)) + '</div>' +
      '<div class="svs-hint">' + esc(t('day_net_hint')) + '</div>' + kv(t('day_net_all'), esc(moneyOrNa(all))) + '</div>';
    h += block(t('day_held_now'), kv(t('day_held_now'), s.advancesHeldNow && isInt(s.advancesHeldNow.paise) && isInt(s.advancesHeldNow.count) ? esc(s.advancesHeldNow.count + ' / ' + money(s.advancesHeldNow.paise)) : esc(t('na'))));
    h += block(t('day_bills'), kv(t('day_bills'), figureOf(inv, 'count') === null || figureOf(inv, 'paise') === null ? esc(t('na')) : esc(inv.count + ' / ' + money(inv.paise))) +
      kv(t('st_cancelled'), esc(countOrNa(figureOf(inv, 'cancelled')))));
    h += block(t('day_credit'), kv(t('day_credit'), figureOf(cn, 'count') === null || figureOf(cn, 'paise') === null ? esc(t('na')) : esc(cn.count + ' / ' + money(cn.paise))));
    if (s.discounts) h += block(t('day_discounts'), typeRow(t('day_discounts'), s.discounts.available === false ? null : s.discounts));
    if (s.noCharge) h += block(t('day_nocharge'), kv(t('day_nocharge'), esc(countOrNa(figureOf(s.noCharge, 'count')))));
    h += '<div class="svb-block svb-drawer">' + field({ name: 'drawer', label: t('drawer_label'), value: S.day.counted, mode: 'decimal', hint: t('drawer_hint') }) + '<div id="svb-drawer-out" role="status"></div></div>';
    el.innerHTML = h;
    paintDrawer();
  }
  /* Drawer check: nothing is saved; the difference is counted minus net cash. */
  function paintDrawer() {
    var out = H && H.root ? byId(H.root, 'svb-drawer-out') : null, p, diff;
    if (!out) return;
    if (trim(S.day.counted) === '') { out.innerHTML = ''; return; }
    p = parsePaise(S.day.counted, { allowZero: true });
    if (!p.ok) { out.innerHTML = '<div class="svs-field-err">' + esc(SBA_ERR.SVB_MONEY_INVALID) + '</div>'; return; }
    if (!isInt(S.day.net)) { out.innerHTML = '<div class="svs-dim">' + esc(t('drawer_diff') + ': ' + t('na')) + '</div>'; return; }
    diff = p.paise - S.day.net;
    out.innerHTML = '<div class="' + esc(cls('svb-diff', diff === 0 ? 'svb-diff-ok' : 'svb-diff-warn')) + '">' + esc(t('drawer_diff') + ' ' + money(diff)) + '</div>' +
      (diff === 0 ? '' : '<div class="svs-hint">' + esc(t('drawer_check')) + '</div>');
  }

  /* ---------- Advances held ---------- */

  function tabAdvances(body, R) {
    body.innerHTML = '<div id="svb-adv-list" role="list"></div>';
    loadAdvances(R);
  }
  function loadAdvances(R) {
    var page = S.adv.page, rights = R || shownRights();
    region('svb-adv-list', 'adv', function () { return call('advancesHeld', [{ offset: (page - 1) * SBA_PAGE, limit: SBA_PAGE }, readCtx()]); }, function (el, r) {
      var rows = arr(r.rows), pg = pageOf(rows, page, isInt(r.count) ? r.count : r.total), h = '', i, row, held, age, rc, list, n;
      n = isInt(r.count) ? r.count : pg.total;
      h += '<div class="svs-sum">' + esc(fill(t('adv_head'), { amount: moneyOrNa(isInt(r.totalPaise) ? r.totalPaise : null), n: n })) + '</div>';
      if (!rows.length) { el.innerHTML = h + emptyHtml(t('adv_empty')); return; }
      for (i = 0; i < pg.rows.length; i++) {
        row = pg.rows[i];
        held = isInt(row.netPaise) ? row.netPaise : (isInt(row.heldPaise) ? row.heldPaise : null);
        age = isInt(row.ageDays) ? row.ageDays : ageDays(row.oldestDocDate || localDay(row.oldestAt));
        list = arr(row.receipts).map(function (x) { return x && typeof x === 'object' ? asText(x.no) : asText(x); }).filter(function (x) { return x; });
        rc = list.length ? '<div class="svs-dim">' + esc(t('tab_receipts') + ' ' + list.join(', ')) + '</div>' : '';
        h += '<div class="svs-row svb-adv" role="listitem"><div class="svb-row-main">' + jobTitle(row) + ' ' + jobChip(row.jobState || row.jobStatus) + rc +
          '<div>' + esc(t('adv_held')) + ' <b class="svb-money">' + esc(moneyOrNa(held)) + '</b>' +
          (age === null ? '' : ' <span class="' + esc(cls('svb-age', ageClass(age))) + '">' + esc(age + ' ' + (age === 1 ? t('day_one') : t('days'))) + '</span>') + '</div></div>' +
          '<div class="svb-row-act">' + btn('svb-adv-open-job', t('open_job'), { key: row.jobId, cls: 'svs-btn-quiet' }) +
          (rights.refundAdvance ? btn('svb-adv-refund', t('adv_refund'), { key: row.jobId }) : '') + '</div></div>';
      }
      el.innerHTML = h + pagerHtml('svb-adv', page, pg.total);
    });
  }

  /* ---------- Not billed yet ---------- */

  function tabUnbilled(body, R) {
    body.innerHTML = '<div id="svb-unb-list" role="list"></div>';
    loadUnbilled(R);
  }
  /* One row per issue comes from the bill layer; the screen shows one line per job. The bill layer gives no issue date, so the oldest-issue line
     is shown only when a row carries one. */
  function groupByJob(rows) {
    var order = [], by = {}, i, x, g;
    for (i = 0; i < rows.length; i++) {
      x = rows[i];
      if (!x || typeof x !== 'object') continue;
      g = by[asText(x.jobId)];
      if (!g) {
        g = by[asText(x.jobId)] = { jobId: x.jobId, jobState: x.jobState || x.jobStatus, pieces: 0, costPaise: 0, costOk: true, warranty: 0, oldestDocDate: '' };
        order.push(g);
      }
      if (isInt(x.qty)) g.pieces += x.qty; else if (isInt(x.qtyOpen)) g.pieces += x.qtyOpen;
      if (isInt(x.costPaise)) g.costPaise += x.costPaise; else g.costOk = false;
      if (x.billing === 'WARRANTY') g.warranty += 1;
      if (x.docDate && (!g.oldestDocDate || x.docDate < g.oldestDocDate)) g.oldestDocDate = x.docDate;
    }
    return order;
  }
  function loadUnbilled(R) {
    var page = S.unb.page, rights = R || shownRights();
    region('svb-unb-list', 'unb', function () { return call('unbilledIssues', [{}, readCtx()]); }, function (el, r) {
      var jobs = groupByJob(arr(r.rows)), pg = pageOf(jobs, page, jobs.length), h = '', i, row, oldest, age, cost;
      h += '<div class="svs-sum">' + esc(fill(t('unb_head'), { n: jobs.length })) + '</div>';
      if (!jobs.length) { el.innerHTML = h + emptyHtml(t('unb_empty')); return; }
      for (i = 0; i < pg.rows.length; i++) {
        row = pg.rows[i];
        oldest = row.oldestDocDate;
        age = oldest ? ageDays(oldest) : null;
        cost = rights.viewCost ? '<div>' + esc(t('unb_cost')) + ' <b>' + esc(row.costOk ? money(row.costPaise) : t('na')) + '</b></div>' : '';
        h += '<div class="svs-row svb-unb" role="listitem"><div class="svb-row-main">' + jobTitle(row) + ' ' + jobChip(row.jobState) + (row.warranty ? ' ' + badge('info', t('unb_warranty')) : '') +
          '<div>' + esc(t('unb_pieces')) + ' <b>' + esc(isInt(row.pieces) ? row.pieces + ' ' + t('unb_pieces_unit') : t('na')) + '</b></div>' + cost +
          (oldest ? '<div class="svs-dim">' + esc(t('unb_oldest') + ' ' + oldest) + (age === null ? '' : ' ' + esc('(' + age + ' ' + (age === 1 ? t('day_one') : t('days')) + ')')) + '</div>' : '') + '</div>' +
          '<div class="svb-row-act">' + btn('svb-unb-open-job', t('open_job'), { key: row.jobId, cls: 'svs-btn-quiet' }) + '</div></div>';
      }
      el.innerHTML = h + pagerHtml('svb-unb', page, pg.total);
    });
  }

  /* ---------- Bills ---------- */

  var SBA_BILL_STATUS = [{ v: '', l: 'st_all' }, { v: 'ISSUED', l: 'st_issued' }, { v: 'CREDITED', l: 'st_credited' }, { v: 'CANCELLED', l: 'st_cancelled' }, { v: 'OLD', l: 'st_old' }];
  function tOptions(list) {
    var out = [], i;
    for (i = 0; i < list.length; i++) out.push({ v: list[i].v, l: t(list[i].l) });
    return out;
  }
  function tabBills(body, R) {
    var b = S.bills;
    if (!isoOk(b.from)) b.from = monthStart(viewDateIso());
    if (!isoOk(b.to)) b.to = viewDateIso();
    body.innerHTML = '<div class="svb-filters">' + field({ name: 'b-text', label: t('bills_search'), value: b.text, max: 60 }) +
      field({ name: 'b-from', label: t('rcpt_from'), kind: 'date', value: b.from }) + field({ name: 'b-to', label: t('rcpt_to'), kind: 'date', value: b.to }) +
      field({ name: 'b-status', label: t('bills_status'), kind: 'select', value: b.status, options: tOptions(SBA_BILL_STATUS) }) + '</div>' +
      '<div id="svb-bills-list" role="list"></div>';
    loadBills(R);
  }
  function billState(row) {
    var st = asText(row.state || row.status).toUpperCase();
    if (row.legacy === true || asText(row.kind).toUpperCase() === 'INV_LEGACY' || st === 'LEGACY') return 'OLD';
    if (st === 'CANCELLED') return 'CANCELLED';
    if (st === 'CREDITED_PARTLY' || st === 'CREDITED_FULLY' || (isInt(row.creditedPaise) && row.creditedPaise > 0)) return 'CREDITED';
    if (st === 'PAID') return 'PAID';
    return 'ISSUED';
  }
  function billChip(state) {
    if (state === 'OLD') return badge('info', t('st_old'));
    if (state === 'CANCELLED') return badge('bad', t('st_cancelled'));
    if (state === 'CREDITED') return badge('warn', t('st_credited'));
    if (state === 'PAID') return badge('ok', t('st_paid'));
    return badge('info', t('st_issued'));
  }
  function billDay(row) { return asText(row.docDate || row.invoiceDate) || istDay(row.at); }
  function billMatches(row, b, text) {
    var d = billDay(row), hay;
    if (b.from && d && d < b.from) return false;
    if (b.to && d && d > b.to) return false;
    if (b.status && billState(row) !== b.status) return false;
    if (text) {
      hay = (asText(row.no) + ' ' + asText(row.legacyNo) + ' ' + asText(row.ccptInvoiceNo) + ' ' + asText(row.jobId)).toLowerCase();
      if (hay.indexOf(text) < 0) return false;
    }
    return true;
  }
  function loadBills() {
    var b = S.bills, page = b.page, text = trim(b.text).toLowerCase();
    region('svb-bills-list', 'bills', function () { return call('listBills', [{ newestFirst: true }, readCtx()]); }, function (el, r) {
      var all = arr(r.invoices || r.rows), rows, pg, h = '', i, row, no, date;
      rows = all.filter(function (x) { return x && typeof x === 'object' && billMatches(x, b, text); });
      pg = pageOf(rows, page, rows.length);
      if (!rows.length) { el.innerHTML = emptyHtml(t('bills_empty')); return; }
      for (i = 0; i < pg.rows.length; i++) {
        row = pg.rows[i];
        no = asText(row.no || row.legacyNo);
        date = billDay(row);
        h += '<div class="svs-row svb-bill" role="listitem"><div class="svb-row-main"><b class="svs-code">' + esc(no) + '</b> <span class="svs-dim">' + esc(date) + '</span> ' + billChip(billState(row)) +
          '<div>' + jobTitle(row) + '</div>' + (row.ccptInvoiceNo ? '<div class="svs-dim">' + esc(t('bills_ccpt') + ' ' + row.ccptInvoiceNo) + '</div>' : '') +
          '<div>' + esc(t('bills_total')) + ' <b class="svb-money">' + esc(moneyOrNa(row.totalPaise)) + '</b>' +
          (isInt(row.creditedPaise) && row.creditedPaise > 0 ? ' ' + esc(t('bills_after_credit')) + ' <b class="svb-money">' + esc(moneyOrNa(isInt(row.payablePaise) ? row.payablePaise : null)) + '</b>' : '') + '</div></div>' +
          '<div class="svb-row-act">' + btn('svb-bill-view', t('view'), { key: no, cls: 'svs-btn-quiet' }) + '</div></div>';
      }
      el.innerHTML = h + pagerHtml('svb-bills', page, pg.total);
    });
  }

  /* ---------- Receipts ---------- */

  var SBA_RCPT_KINDS = [{ v: '', l: 'st_all' }, { v: 'advance', l: 'type_advance' }, { v: 'balance', l: 'type_balance' }, { v: 'counter', l: 'type_counter' }, { v: 'refund', l: 'type_refund' }];
  var SBA_RCPT_MODES = [{ v: '', l: 'st_all' }, { v: 'Cash', l: 'mode_cash' }, { v: 'UPI', l: 'mode_upi' }, { v: 'Card', l: 'mode_card' }, { v: 'Bank', l: 'mode_bank' }];
  function receiptKind(row) {
    var k = asText(row.kind).toUpperCase(), sale = asText(row.saleNo) !== '';
    if (k === 'SRF' || k === 'REFUND') return 'refund';
    if (k === 'SAR' || k === 'ADVANCE') return 'advance';
    if (k === 'SRC' || k === 'BALANCE' || k === 'COUNTER') return sale || k === 'COUNTER' ? 'counter' : 'balance';
    return 'balance';
  }
  function tabReceipts(body, R) {
    var r = S.rcpt;
    if (!isoOk(r.from)) r.from = monthStart(viewDateIso());
    if (!isoOk(r.to)) r.to = viewDateIso();
    body.innerHTML = '<div id="svb-cs-list"></div><div class="svb-filters">' + field({ name: 'r-from', label: t('rcpt_from'), kind: 'date', value: r.from }) +
      field({ name: 'r-to', label: t('rcpt_to'), kind: 'date', value: r.to }) + field({ name: 'r-kind', label: t('rcpt_type'), kind: 'select', value: r.kind, options: tOptions(SBA_RCPT_KINDS) }) +
      field({ name: 'r-mode', label: t('rcpt_paid_by'), kind: 'select', value: r.mode, options: tOptions(SBA_RCPT_MODES) }) + '</div><div id="svb-rcpt-list" role="list"></div>';
    loadCounterSales(R);
    loadReceipts();
  }
  function loadCounterSales(R) {
    var rights = R || shownRights();
    region('svb-cs-list', 'cs', function () { return call('unreceiptedCounterSales', [readCtx()]); }, function (el, r) {
      var rows = arr(r.rows), h = '<h3 class="svs-h3">' + esc(t('cs_head')) + '</h3>', i, row, reversed;
      if (!rows.length) { el.innerHTML = h + emptyHtml(t('cs_empty')); return; }
      for (i = 0; i < rows.length; i++) {
        row = rows[i];
        reversed = row.state === 'RECEIPT_REVERSED';
        h += '<div class="svs-row svb-cs" role="listitem"><div class="svb-row-main"><b class="svs-code">' + esc(row.no) + '</b> <span class="svs-dim">' + esc(row.docDate) + '</span> ' +
          (reversed ? badge('warn', t('cs_reversed')) : badge('info', t('cs_none'))) + '<div><b class="svb-money">' + esc(moneyOrNa(row.amountPaise)) + '</b></div>' +
          (reversed ? '<div class="svs-hint">' + esc(t('cs_reversed_hint')) + '</div>' : '') + '</div>' +
          '<div class="svb-row-act">' + (!reversed && rights.viewLists && !isPast() && integrityOk() ? btn('svb-cs-receipt', t('cs_take'), { key: row.no }) : '') + '</div></div>';
      }
      el.innerHTML = h;
    });
  }
  function loadReceipts() {
    var f = S.rcpt, page = f.page, q = { from: f.from, to: f.to, kind: f.kind, mode: f.mode, offset: (page - 1) * SBA_PAGE, limit: SBA_PAGE };
    region('svb-rcpt-list', 'rcpt', function () { return call('listReceipts', [q, readCtx()]); }, function (el, r) {
      var all = arr(r.rows).concat(has(r, 'rows') ? [] : arr(r.receipts)), rows, pg, h = '', i, row, kind, date, refund, reversed, pay;
      rows = all.filter(function (x) {
        var d = x.docDate || istDay(x.at);
        if (asText(x.kind).toUpperCase() === 'RRV') return false;
        if (f.from && d && d < f.from) return false;
        if (f.to && d && d > f.to) return false;
        if (f.kind && receiptKind(x) !== f.kind) return false;
        if (f.mode && asText(x.payMode || x.mode).toLowerCase() !== f.mode.toLowerCase()) return false;
        return true;
      });
      rows.sort(function (a, b2) { return asText(b2.at) < asText(a.at) ? -1 : (asText(b2.at) > asText(a.at) ? 1 : (asText(b2.no) < asText(a.no) ? -1 : 1)); });
      pg = pageOf(rows, page, rows.length);
      if (!rows.length) { el.innerHTML = emptyHtml(t('rcpt_empty')); return; }
      for (i = 0; i < pg.rows.length; i++) {
        row = pg.rows[i];
        kind = receiptKind(row);
        refund = kind === 'refund';
        reversed = asText(row.status).toUpperCase() === 'REVERSED';
        date = row.docDate || istDay(row.at);
        pay = asText(row.payMode || row.mode);
        h += '<div class="svs-row svb-rcpt" role="listitem"><div class="svb-row-main"><b class="svs-code">' + esc(row.no) + '</b> <span class="svs-dim">' + esc(fmtAt(row.at || date)) + '</span> ' +
          badge(refund ? 'warn' : 'info', t('type_' + kind)) + ' ' + (reversed ? badge('bad', t('rcpt_reversed')) : badge('ok', t('rcpt_posted'))) +
          (row.inBook === true ? ' ' + badge('info', t('rcpt_in_book')) : '') +
          '<div>' + (row.saleNo ? esc(t('type_counter')) : jobTitle(row)) + ' <span class="svs-dim">' + esc(pay) + (row.payRef ? ' ' + esc(t('rcpt_ref') + ' ' + row.payRef) : '') + '</span></div>' +
          '<div class="' + esc(cls('svb-money', refund ? 'svb-neg' : '')) + '"><b>' + esc(refund && isInt(row.amountPaise) ? money(-row.amountPaise) : moneyOrNa(row.amountPaise)) + '</b></div></div>' +
          '<div class="svb-row-act">' + btn('svb-rcpt-reprint', t('rcpt_print'), { key: row.no, cls: 'svs-btn-quiet' }) + '</div></div>';
      }
      el.innerHTML = h + pagerHtml('svb-rcpts', page, pg.total);
    });
  }

  /* ---------- Old items (old advances and old invoices; the Owner confirms) ---------- */

  function tabOld(body, R) {
    body.innerHTML = '<div id="svb-old-adv" role="list"></div><div id="svb-old-mig"></div>';
    loadOldAdvances(R);
    loadMigration(R);
  }
  function loadOldAdvances(R) {
    var rights = R || shownRights();
    region('svb-old-adv', 'oldadv', function () { return call('legacyAdvances', [readCtx()]); }, function (el, r) {
      var rows = arr(r.rows), h = '<h3 class="svs-h3">' + esc(t('old_adv_head')) + '</h3>', i, row, typed, key, own = readSession().isOwner === true;
      if (r.available === false) { el.innerHTML = h + emptyHtml(t('na')); return; }
      if (!rows.length) { el.innerHTML = h + emptyHtml(t('old_adv_empty')); return; }
      h += notice('info', t('old_adv_note'));
      for (i = 0; i < rows.length; i++) {
        row = rows[i];
        typed = isInt(row.typedPaise) ? row.typedPaise : null;
        h += '<div class="svs-row svb-oldadv" role="listitem"><div class="svb-row-main">' + jobTitle(row) + ' ' + jobChip(row.state || row.jobState || 'OPEN') +
          '<div>' + esc(t('old_adv_typed')) + ' <b class="svb-money">' + esc(moneyOrNa(typed)) + '</b></div></div><div class="svb-row-act">';
        if (rights.confirmOld) {
          key = asText(row.jobId) + '|';
          h += btn('svb-old-confirm', t('old_adv_book'), { key: key + SBA_DECIDE_BOOK }) + btn('svb-old-confirm', t('old_adv_post'), { key: key + SBA_DECIDE_NOW });
        } else if (own === false) h += '<span class="svs-dim">' + esc(t('old_adv_owner_only')) + '</span>';
        h += '</div></div>';
      }
      el.innerHTML = h;
    });
  }
  /* The dry run: planMigration reads only. Nothing is written until the Owner presses the button and gives the PIN. */
  function loadMigration(R) {
    var rights = R || shownRights();
    // Stage E round 2 (B): name each skipped old job and say why, from the reasons the facade adds (skippedWhy)
    function skippedHtml(plan, skipped) {
      var why = arr(plan.skippedWhy);
      if (!skipped.length) return '';
      return '<div class="svs-dim">' + esc(fill(t('mig_skipped'), { n: skipped.length })) + '</div>' + skipped.map(function (x, k) {
        var w = why[k] && typeof why[k] === 'object' ? why[k] : {};
        return '<div class="svs-dim svb-mig-skip" role="listitem">' + esc(fill(t('mig_skip_row'), { job: asText(w.jobId || (x && x.jobId)), no: asText(w.legacyNo || (x && x.legacyNo)) || '-', why: asText(w.why) || t('mig_skip_unknown') })) + '</div>';
      }).join('');
    }
    region('svb-old-mig', 'mig', function () { return call('planMigration', [readCtx()]); }, function (el, r) {
      var plan = has(r, 'plan') && r.plan && typeof r.plan === 'object' ? r.plan : r, rows = arr(plan.invoices), skipped = arr(plan.skipped), h = '<h3 class="svs-h3">' + esc(t('mig_head')) + '</h3>', i, row, show, n;
      S.old.plan = rows.length ? plan : null;
      n = rows.length;
      if (!n) { el.innerHTML = h + emptyHtml(t('mig_none')) + skippedHtml(plan, skipped) + '<div class="svs-bar">' + btn('svb-migrate-check', t('check_again'), { cls: 'svs-btn-quiet' }) + '</div>'; return; }
      h += notice('info', fill(t('mig_count'), { n: n })) + '<div class="svs-hint">' + esc(t('mig_note')) + '</div>';
      show = Math.min(n, SBA_PAGE);
      for (i = 0; i < show; i++) {
        row = rows[i];
        h += '<div class="svs-row svb-mig" role="listitem"><div class="svb-row-main"><b class="svs-code">' + esc(row.legacyNo || row.no) + '</b> <span class="svs-dim">' + esc(row.invoiceDate || row.docDate) + '</span> ' + jobTitle(row) +
          (arr(row.warn).length ? ' ' + badge('warn', t('mig_warn')) : '') + '<div><b class="svb-money">' + esc(moneyOrNa(isInt(row.totalPaise) ? row.totalPaise : row.finalPaise)) + '</b></div></div></div>';
      }
      if (n > show) h += '<div class="svs-dim">' + esc(fill(t('mig_more'), { n: n - show })) + '</div>';
      h += skippedHtml(plan, skipped);
      h += '<div class="svs-bar">' + btn('svb-migrate-check', t('check_again'), { cls: 'svs-btn-quiet' }) + (rights.migrate ? btn('svb-migrate-run', t('mig_run'), { cls: 'svs-btn-primary' }) : '<span class="svs-dim">' + esc(t('mig_owner_only')) + '</span>') + '</div>';
      el.innerHTML = h;
    });
  }
  function migrateRun() {
    var g = gate('migrate'), plan = S.old.plan, n;
    if (g) { showFailure(g); return Promise.resolve(g); }
    n = plan ? arr(plan.invoices).length : 0;
    if (!n) { g = fail('SVB_NOTHING_TO_DO'); showFailure(g); return Promise.resolve(g); }
    return exclusive(function () {
      return ownerStep(fill(t('pin_mig'), { n: n }), function (ctx) { return call('runMigration', [plan, ctx]); }).then(function (r) {
        var written;
        if (!r.ok) { showFailure(r); return r; }
        written = r.written && typeof r.written === 'object' ? r.written.invoices : r.written;
        toast(fill(t('mig_done'), { n: isInt(written) ? written : 0 }));
        S.old.plan = null;
        if (areaActive() && S.tab === 'old') renderShell();
        return r;
      });
    });
  }

  /* ---------- Settings (Owner only) ---------- */

  function initSettings() {
    var s = { limit: '', bill: {}, est: {}, limitErr: '' }, i, p = S.cfg.discountLimitPaise;
    s.limit = Math.floor(p / 100) + '.' + (p % 100 < 10 ? '0' : '') + (p % 100);
    for (i = 0; i < SBA_ROLES.length; i++) {
      s.bill[SBA_ROLES[i]] = S.cfg.billingRoles.indexOf(SBA_ROLES[i]) >= 0;
      s.est[SBA_ROLES[i]] = S.cfg.estimateRoles.indexOf(SBA_ROLES[i]) >= 0;
    }
    return s;
  }
  function tabSettings(body, R) {
    var s, i, h;
    if (!rightsFor(readSession()).settings) { body.innerHTML = notice('bad', SBA_ERR.SVB_OWNER_ONLY); return; }
    if (!S.set) S.set = initSettings();
    s = S.set;
    h = '<div id="svb-set-form" class="svb-settings"><h3 class="svs-h3">' + esc(t('set_head')) + '</h3><div class="svs-hint">' + esc(t('set_note')) + '</div>' +
      field({ name: 'limit', label: t('set_limit'), value: s.limit, mode: 'decimal', hint: t('set_limit_hint'), err: s.limitErr ? SBA_ERR.SVB_MONEY_INVALID : '' }) +
      '<fieldset class="svb-roles"><legend>' + esc(t('set_bill_roles')) + '</legend>';
    for (i = 0; i < SBA_ROLES.length; i++) h += field({ name: 'br' + i, label: SBA_ROLES[i], kind: 'check', value: s.bill[SBA_ROLES[i]] });
    h += '<div class="svs-hint">' + esc(t('set_bill_hint')) + '</div></fieldset><fieldset class="svb-roles"><legend>' + esc(t('set_est_roles')) + '</legend>';
    for (i = 0; i < SBA_ROLES.length; i++) h += field({ name: 'er' + i, label: SBA_ROLES[i], kind: 'check', value: s.est[SBA_ROLES[i]] });
    h += '<div class="svs-hint">' + esc(t('set_est_hint')) + '</div></fieldset><div class="svs-bar">' +
      btn('svb-set-save', t('set_save'), { cls: 'svs-btn-primary', disabled: !R.settings }) + '</div></div>';
    body.innerHTML = h;
  }
  function collectSettings() {
    var form = H && H.root ? byId(H.root, 'svb-set-form') : null, s = S.set, i, el, lim;
    if (!form || !s) return;
    lim = fieldIn(form, 'limit');
    if (lim) s.limit = fieldValue(lim);
    for (i = 0; i < SBA_ROLES.length; i++) {
      el = fieldIn(form, 'br' + i);
      if (el) s.bill[SBA_ROLES[i]] = fieldValue(el) === true;
      el = fieldIn(form, 'er' + i);
      if (el) s.est[SBA_ROLES[i]] = fieldValue(el) === true;
    }
  }
  function settingsSave() {
    var g = gate('settings'), s, p, patch, i, bill = [], est = [];
    if (g) { showFailure(g); return Promise.resolve(g); }
    collectSettings();
    s = S.set || initSettings();
    p = parsePaise(s.limit, { allowZero: true });
    if (!p.ok || p.paise > SBA_MAX_LIMIT_PAISE) {
      s.limitErr = 'x';
      S.set = s;
      g = fail('SVB_MONEY_INVALID');
      renderShell();
      showFailure(g);
      return Promise.resolve(g);
    }
    s.limitErr = '';
    for (i = 0; i < SBA_ROLES.length; i++) {
      if (s.bill[SBA_ROLES[i]]) bill.push(SBA_ROLES[i]);
      if (s.est[SBA_ROLES[i]]) est.push(SBA_ROLES[i]);
    }
    patch = { discountLimitPaise: p.paise, billingRoles: bill, estimateRoles: est };
    return exclusive(function () {
      return ownerStep(fill(t('pin_set'), { amount: money(p.paise), n: bill.length }), function (ctx) { return call('setConfig', [patch, ctx]); }).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        toast(t('set_saved'));
        S.set = null;
        S.tok += 1;
        return call('status', []).then(function (st) {
          if (st.ok) { S.status = st; S.cfg = normCfg(st.config); }
          if (areaActive()) renderShell();
          return r;
        });
      });
    });
  }

  /* ---------- printing (through the page's print helper, or the report engine) ---------- */

  function printDoc(type, args) {
    var g = viewGate('printDocs'), f = kitFn('print'), out, rep;
    if (g) { showFailure(g); return Promise.resolve(g); }
    if (f) {
      try { out = f(type, args); } catch (e) { out = thrown(e); }
      return Promise.resolve(out).then(function (r) {
        if (r && r.ok === false) { showFailure(r); return r; }
        return r || { ok: true };
      }, function (e2) { var x = thrown(e2); showFailure(x); return x; });
    }
    try { rep = H && typeof H.report === 'function' ? H.report() : null; } catch (e3) { rep = null; }
    if (!rep || typeof rep.preview !== 'function') { g = fail('SVB_PRINT_UNAVAILABLE'); showFailure(g); return Promise.resolve(g); }
    return call('printData', [type, args, readCtx()]).then(function (r) {
      var opts = { svcData: r.svcData }, k;
      if (!r.ok) { showFailure(r); return r; }
      for (k in args) { if (has(args, k)) opts[k] = args[k]; }
      try { rep.preview(type, opts); } catch (e4) { var x2 = thrown(e4); showFailure(x2); return x2; }
      return { ok: true };
    });
  }

  /* ---------- the two small dialogs: bill detail and old advance (drawn in the main file's dialog layer) ---------- */

  var SBA_MARK = 'data-svb-area';
  /* True while one of this file's dialogs is on screen (the main file may close it on its own: Escape, the head Close button). */
  function layerMarked() {
    var doc = H && H.root ? H.root.ownerDocument : null, layer = doc && typeof doc.getElementById === 'function' ? doc.getElementById('svb-layer') : null;
    return !!(layer && qs(layer, '[' + SBA_MARK + ']'));
  }
  function dialogField(name, el) {
    var d = S.dlg;
    if (d && d.data) d.data[name] = fieldValue(el);
  }
  function openAreaDialog(kind, data, build, right) {
    var f = kitFn('openDialog'), d;
    if (!f) return null;
    d = f(kind, data, { build: build, actions: SBA_DLG_ACT, onInput: dialogField, right: right });
    S.dlg = d && typeof d === 'object' ? d : null;
    return S.dlg;
  }
  function closeDlg() {
    var f = kitFn('closeDialog');
    S.dlg = null;
    if (f) f();
  }
  function redraw(focusFirst) {
    var f = kitFn('renderDialog');
    if (f) f(focusFirst === true);
  }
  function liveDlg(kind) {
    var d = S.dlg;
    return d && d.kind === kind && layerMarked() ? d : null;
  }
  function marker(kind) { return '<div ' + SBA_MARK + '="' + esc(kind) + '"></div>'; }

  function billLines(b) {
    var lines = arr(b && b.lines), h = '', i, ln;
    for (i = 0; i < lines.length; i++) {
      ln = lines[i];
      h += '<div class="svs-row svb-bline"><div class="svb-row-main"><b>' + esc(ln.name || ln.desc || ln.code) + '</b>' + (ln.code ? ' <span class="svs-code">' + esc(ln.code) + '</span>' : '') +
        '<div class="svs-dim">' + esc(t('line_qty') + ' ' + (isInt(ln.qty) ? ln.qty : '-') + '  ' + t('line_code') + ' ' + asText(ln.hsnSac || ln.hsn) + '  ' + t('line_rate') + ' ' + ratePct(ln.rateBp)) + '</div>' +
        '<div class="svs-dim">' + esc(t('bv_taxable') + ' ' + moneyOrNa(ln.taxablePaise) + '  ' + t('bv_cgst') + ' ' + moneyOrNa(ln.cgstPaise) + '  ' + t('bv_sgst') + ' ' + moneyOrNa(ln.sgstPaise) + '  ' + t('bv_igst') + ' ' + moneyOrNa(ln.igstPaise)) + '</div></div>' +
        '<div class="svb-row-act"><b class="svb-money">' + esc(moneyOrNa(ln.totalPaise)) + '</b></div></div>';
    }
    return h;
  }
  function billDialog(d) {
    var v = d.data.view, R = shownRights(), b, tot, body = '', foot = '', st, legacy, sub, discount, setOff, supply, ccpt, mode, today = todayIso(), docDate;
    if (!v) return { title: t('bv_title') + ' ' + d.data.no, body: marker('areabill') + '<div class="svs-dim" role="status">' + esc(t('bv_loading')) + '</div>', footer: btn('svb-bv-close', t('close'), { cls: 'svs-btn-quiet', focus: true }) };
    b = v.bill && typeof v.bill === 'object' ? v.bill : v;
    tot = b.totals || v.totals || {};
    st = billState(v);
    legacy = st === 'OLD';
    mode = asText(v.mode);
    docDate = v.docDate || v.invoiceDate || istDay(v.at);
    supply = b.supply || v.supply || {};
    discount = v.discount && typeof v.discount === 'object' ? v.discount : null;
    setOff = v.setOff && typeof v.setOff === 'object' ? v.setOff : null;
    ccpt = asText(v.ccptInvoiceNo);
    sub = esc(t('bv_job') + ' ') + '<b class="svs-code">' + esc(v.jobId) + '</b> ' + billChip(st);
    body += marker('areabill') + kv(t('date'), esc(docDate)) + (ccpt ? kv(t('bv_ccpt'), esc(ccpt)) : '') + (legacy && v.legacyNo ? kv(t('bv_legacy_no'), esc(v.legacyNo)) : '');
    if (legacy) body += notice('info', t('bv_old_note'));
    else if (mode === 'NOT_IN_CCPT') body += notice('info', t('bv_mode_own'));
    else if (mode) body += notice('info', t('bv_mode_ccpt'));
    if (asText(supply.recipientGstin)) body += kv(t('bv_gstin'), esc(supply.recipientGstin));
    if (asText(supply.placeOfSupplyStateCode)) body += kv(t('bv_state'), esc(supply.placeOfSupplyStateCode));
    if (arr(b.lines).length) body += '<h3 class="svs-h3">' + esc(t('bv_lines')) + '</h3><div class="svb-lines">' + billLines(b) + '</div>';
    body += '<div class="svb-totals">' + kv(t('bv_taxable'), esc(moneyOrNa(tot.taxablePaise))) + kv(t('bv_cgst'), esc(moneyOrNa(tot.cgstPaise))) + kv(t('bv_sgst'), esc(moneyOrNa(tot.sgstPaise))) +
      kv(t('bv_igst'), esc(moneyOrNa(tot.igstPaise)));
    if (isInt(tot.billDiscountPaise) && tot.billDiscountPaise > 0) body += kv(t('bv_discount'), esc(money(tot.billDiscountPaise)));
    else if (discount && isInt(discount.totalPaise) && discount.totalPaise > 0) body += kv(t('bv_discount'), esc(money(discount.totalPaise)));
    if (discount && discount.reason) body += kv(t('bv_discount_reason'), esc(discount.reason));
    body += kv(t('bv_roundoff'), esc(moneyOrNa(tot.roundOffPaise))) + kv(t('bv_grand'), esc(moneyOrNa(isInt(tot.totalPaise) ? tot.totalPaise : (isInt(v.totalPaise) ? v.totalPaise : (isInt(v.finalPaise) ? v.finalPaise : null)))), 'svb-totals-grand');
    if (setOff) body += kv(t('bv_setoff'), esc(moneyOrNa(setOff.advancePaise)));
    if (has(v, 'balanceDuePaise')) body += kv(t('bv_balance'), esc(moneyOrNa(v.balanceDuePaise)));
    body += '</div>';
    if (!legacy && R.printDocs) foot += btn('svb-bv-print', t(mode === 'NOT_IN_CCPT' ? 'bv_print_tax' : 'bv_print_summary'), { cls: 'svs-btn-primary', disabled: d.busy });
    if (R.creditNote && st !== 'CANCELLED') foot += btn('svb-bv-credit', t('bv_credit'), { disabled: d.busy });
    if (R.cancelBill && !legacy && st !== 'CANCELLED' && docDate === today) foot += btn('svb-bv-cancel', t('bv_cancel'), { cls: 'svs-btn-danger', disabled: d.busy });
    foot += btn('svb-bv-close', t('close'), { cls: 'svs-btn-quiet', focus: true });
    return { title: t('bv_title') + ' ' + asText(v.no || v.legacyNo || d.data.no), subHtml: sub, body: body, footer: foot, wide: true };
  }
  function openBill(no) {
    var g = viewGate('viewLists'), d;
    if (g) { showFailure(g); return Promise.resolve(g); }
    d = openAreaDialog('areabill', { no: no, view: null }, billDialog, 'viewLists');
    if (!d) { g = fail('SVB_CORE_MISSING'); showFailure(g); return Promise.resolve(g); }
    return call('getBill', [no, readCtx()]).then(function (r) {
      if (!H || S.dlg !== d || !layerMarked()) return r;
      if (!r.ok) { d.error = errText(r); redraw(false); toast(d.error); return r; }
      d.data.view = r.invoice && typeof r.invoice === 'object' ? r.invoice : (r.bill && typeof r.bill === 'object' && !r.bill.totals ? r.bill : r);
      redraw(true);
      return r;
    });
  }
  function billPrint() {
    var d = liveDlg('areabill'), v;
    if (!d || !d.data.view) return Promise.resolve(fail('SVB_ROLE_DENIED'));
    v = d.data.view;
    return printDoc(asText(v.mode) === 'NOT_IN_CCPT' ? 'serviceTaxInvoiceV2' : 'serviceBillSummary', { invoiceNo: asText(v.no || d.data.no) });
  }
  /* The credit note, bill cancel and advance refund dialogs live on the job card (they work on one open job); the area opens the job. */
  function goToJob(rightKey, jobId, hintKey) {
    var g = gate(rightKey);
    if (g) { showFailure(g); return Promise.resolve(g); }
    if (layerMarked()) closeDlg();
    openJob(jobId);
    toast(t(hintKey));
    return Promise.resolve({ ok: true });
  }
  function billCredit() {
    var d = liveDlg('areabill'), v = d && d.data.view;
    if (!v) return Promise.resolve(fail('SVB_ROLE_DENIED'));
    return goToJob('creditNote', asText(v.jobId), 'hint_credit');
  }
  function billCancel() {
    var d = liveDlg('areabill'), v = d && d.data.view;
    if (!v) return Promise.resolve(fail('SVB_ROLE_DENIED'));
    return goToJob('cancelBill', asText(v.jobId), 'hint_cancel');
  }

  function oldAdvDialog(d) {
    var x = d.data, post = x.decision === SBA_DECIDE_NOW, body, foot;
    body = marker('areaold') + '<p>' + esc(t('old_dlg_text') + ' ' + t(post ? 'old_dlg_post' : 'old_dlg_book')) + '</p>' + kv(t('old_adv_typed'), '<b>' + esc(moneyOrNa(x.amountPaise)) + '</b>') +
      (post ? field({ name: 'payMode', label: t('rcpt_paid_by'), kind: 'select', value: x.payMode, options: SBA_MODES.map(function (m) { return { v: m, l: modeLabel(m) }; }) }) : '') +
      field({ name: 'note', label: t('old_note'), value: x.note, max: 200 });
    foot = btn('svb-old-confirm-save', d.busy ? t('saving') : t('old_dlg_confirm'), { cls: 'svs-btn-primary', focus: true, disabled: d.busy }) + btn('svb-old-confirm-cancel', t('cancel'), { cls: 'svs-btn-quiet', disabled: d.busy });
    return { title: t('old_dlg_title'), subHtml: esc(x.jobId), body: body, footer: foot };
  }
  function openOldConfirm(key) {
    var g = gate('confirmOld'), parts = asText(key).split('|'), jobId = parts[0], decision = parts[1], rows, row, i;
    if (g) { showFailure(g); return Promise.resolve(g); }
    if (decision !== SBA_DECIDE_NOW && decision !== SBA_DECIDE_BOOK) { g = fail('SVB_BAD_REPLY', { code: 'KEY' }); showFailure(g); return Promise.resolve(g); }
    return call('legacyAdvances', [readCtx()]).then(function (r) {
      if (!H) return r;
      rows = r.ok ? arr(r.rows) : [];
      for (i = 0; i < rows.length; i++) { if (rows[i].jobId === jobId) row = rows[i]; }
      if (!r.ok) { showFailure(r); return r; }
      if (!row || !isInt(row.typedPaise)) { g = fail('SVB_NOTHING_TO_DO'); showFailure(g); return g; }
      if (!openAreaDialog('areaold', { jobId: jobId, decision: decision, amountPaise: row.typedPaise, payMode: 'Cash', note: '' }, oldAdvDialog, 'confirmOld')) { g = fail('SVB_CORE_MISSING'); showFailure(g); return g; }
      return { ok: true };
    });
  }
  function oldConfirmSave() {
    var d = liveDlg('areaold'), g = gate('confirmOld'), x, post, label, input;
    if (!d) return Promise.resolve(fail('SVB_ROLE_DENIED'));
    if (g) { showFailure(g); return Promise.resolve(g); }
    x = d.data;
    post = x.decision === SBA_DECIDE_NOW;
    label = fill(t('pin_old_adv'), { amount: money(x.amountPaise), job: x.jobId, choice: t(post ? 'old_choice_post' : 'old_choice_book') });
    input = { jobId: x.jobId, decision: x.decision, amountPaise: x.amountPaise, payMode: post ? (asText(x.payMode) || 'Cash') : 'Cash', note: trim(x.note).slice(0, 200) };
    return exclusive(function () {
      d.busy = true;
      redraw(false);
      return ownerStep(label, function (ctx) { return call('decideLegacyAdvance', [input, ctx]); }, d.clientRef).then(function (r) {
        d.busy = false;
        if (!H || S.dlg !== d || !layerMarked()) return r;
        if (!r.ok) { redraw(false); showFailure(r); return r; }
        closeDlg();
        toast(t('old_done'));
        if (areaActive() && S.tab === 'old') renderShell();
        return r;
      });
    });
  }

  /* ---------- actions and events ---------- */

  function openJob(id) {
    try { if (H && typeof H.openJob === 'function') H.openJob(String(id)); } catch (e) { showFailure(thrown(e)); }
    return { ok: true };
  }
  function pageMove(slot, prefixLoad, delta) {
    var cur = S[slot].page + delta;
    S[slot].page = cur < 1 ? 1 : cur;
    prefixLoad();
  }
  function counterReceipt(no) {
    var g = gate('viewLists'), out;
    if (g) { showFailure(g); return Promise.resolve(g); }
    if (!SBA_UI || typeof SBA_UI.afterCounterSale !== 'function') { g = fail('SVB_CORE_MISSING'); showFailure(g); return Promise.resolve(g); }
    try { out = SBA_UI.afterCounterSale(no); } catch (e) { g = thrown(e); showFailure(g); return Promise.resolve(g); }
    return Promise.resolve(out).then(function (r) { return r && r.ok === false ? r : { ok: true }; }, function (e2) { var x = thrown(e2); showFailure(x); return x; });
  }
  function dayPrint() {
    if (!isoOk(S.day.date) || S.day.date > todayIso()) { var g = fail('SVB_DATE_INVALID'); showFailure(g); return Promise.resolve(g); }
    return printDoc('serviceDaySummary', { date: S.day.date });
  }
  function refundAdvance(jobId) { return goToJob('refundAdvance', asText(jobId), 'hint_refund'); }

  var SBA_ACT = {
    'svb-tab-today': function () { sbaSwitchTab('today'); },
    'svb-tab-advances': function () { S.adv.page = 1; sbaSwitchTab('advances'); },
    'svb-tab-unbilled': function () { S.unb.page = 1; sbaSwitchTab('unbilled'); },
    'svb-tab-bills': function () { S.bills.page = 1; sbaSwitchTab('bills'); },
    'svb-tab-receipts': function () { S.rcpt.page = 1; sbaSwitchTab('receipts'); },
    'svb-tab-old': function () { sbaSwitchTab('old'); },
    'svb-tab-settings': function () { sbaSwitchTab('settings'); },
    'svb-area-retry': function () { render(); },
    'svb-today-refresh': function () { loadDay(); },
    'svb-today-print': function () { return dayPrint(); },
    'svb-adv-open-job': function (key) { return openJob(key); },
    'svb-adv-refund': function (key) { return refundAdvance(key); },
    'svb-adv-page-prev': function () { pageMove('adv', loadAdvances, -1); },
    'svb-adv-page-next': function () { pageMove('adv', loadAdvances, 1); },
    'svb-unb-open-job': function (key) { return openJob(key); },
    'svb-unb-page-prev': function () { pageMove('unb', loadUnbilled, -1); },
    'svb-unb-page-next': function () { pageMove('unb', loadUnbilled, 1); },
    'svb-bill-view': function (key) { return openBill(asText(key)); },
    'svb-bills-page-prev': function () { pageMove('bills', loadBills, -1); },
    'svb-bills-page-next': function () { pageMove('bills', loadBills, 1); },
    'svb-rcpt-reprint': function (key) { return printDoc('serviceReceipt', { receiptNo: asText(key) }); },
    'svb-rcpts-page-prev': function () { pageMove('rcpt', loadReceipts, -1); },
    'svb-rcpts-page-next': function () { pageMove('rcpt', loadReceipts, 1); },
    'svb-cs-receipt': function (key) { return counterReceipt(asText(key)); },
    'svb-old-confirm': function (key) { return openOldConfirm(key); },
    'svb-migrate-run': function () { return migrateRun(); },
    'svb-migrate-check': function () { loadMigration(); },
    'svb-set-save': function () { return settingsSave(); }
  };
  /* The buttons inside this file's two dialogs; the main file's dialog layer routes their clicks here. */
  var SBA_DLG_ACT = {
    'svb-bv-print': function () { return billPrint(); },
    'svb-bv-credit': function () { return billCredit(); },
    'svb-bv-cancel': function () { return billCancel(); },
    'svb-bv-close': function () { closeDlg(); },
    'svb-old-confirm-save': function () { return oldConfirmSave(); },
    'svb-old-confirm-cancel': function () { if (!S.busy) closeDlg(); }
  };

  function dispatch(action, key, el) {
    var fn = has(SBA_ACT, action) ? SBA_ACT[action] : (has(SBA_DLG_ACT, action) ? SBA_DLG_ACT[action] : null), out;
    if (!fn) return Promise.resolve(fail('SVB_BAD_REPLY', { code: 'ACTION' }));
    try { out = fn(key, el); } catch (e) { out = thrown(e); showFailure(out); }
    return Promise.resolve(out);
  }
  function actionTarget(el, container) {
    var n = el, guard = 0;
    while (n && guard < 12) {
      if (getAttr(n, 'data-svcs-action')) return n;
      if (n === container) return null;
      n = n.parentNode;
      guard++;
    }
    return null;
  }
  function onClick(ev, container) {
    var target = ev && ev.target, hit, act;
    if (!target) return;
    hit = actionTarget(target, container);
    if (hit) {
      if (hit.disabled === true) return;
      act = getAttr(hit, 'data-svcs-action');
      if (!has(SBA_ACT, act)) return;
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      dispatch(act, getAttr(hit, 'data-svs-key'), hit);
    }
  }
  function afterPause(fn) {
    if (S.timer !== null && typeof clearTimeout === 'function') clearTimeout(S.timer);
    S.timer = null;
    if (typeof setTimeout !== 'function') { fn(); return; }
    S.timer = setTimeout(function () { S.timer = null; fn(); }, SBA_DEBOUNCE_MS);
  }
  function onInput(ev) {
    var el = ev && ev.target, name = getAttr(el, 'data-svs-field'), val;
    if (!name) return;
    val = fieldValue(el);
    if (name === 'day-date') { if (ev.type === 'change') { S.day.date = val; loadDay(); } return; }
    if (name === 'drawer') { S.day.counted = val; paintDrawer(); return; }
    if (name === 'b-text') { S.bills.text = val; S.bills.page = 1; afterPause(loadBills); return; }
    if (ev.type !== 'change') {
      if (name === 'limit' && S.set) S.set.limit = val;
      return;
    }
    if (name === 'b-from') { S.bills.from = val; S.bills.page = 1; loadBills(); return; }
    if (name === 'b-to') { S.bills.to = val; S.bills.page = 1; loadBills(); return; }
    if (name === 'b-status') { S.bills.status = val; S.bills.page = 1; loadBills(); return; }
    if (name === 'r-from') { S.rcpt.from = val; S.rcpt.page = 1; loadReceipts(); return; }
    if (name === 'r-to') { S.rcpt.to = val; S.rcpt.page = 1; loadReceipts(); return; }
    if (name === 'r-kind') { S.rcpt.kind = val; S.rcpt.page = 1; loadReceipts(); return; }
    if (name === 'r-mode') { S.rcpt.mode = val; S.rcpt.page = 1; loadReceipts(); return; }
    if (S.set && /^(br|er)\d$/.test(name)) collectSettings();
  }
  function onKeydown(ev, container) {
    var key = ev && ev.key, el = ev && ev.target, tabs, at, nextTab;
    if (!key || !el) return;
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && getAttr(el, 'role') === 'tab') {
      tabs = qsa(container, '[role="tab"]');
      at = tabs.indexOf(el);
      if (at < 0) return;
      nextTab = tabs[(at + (key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (nextTab) { focusEl(nextTab); dispatch(getAttr(nextTab, 'data-svcs-action'), '', nextTab); }
    }
  }
  function listen(el, type, fn, capture) {
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener(type, fn, capture === true);
    S.binds.push({ el: el, type: type, fn: fn, capture: capture === true });
  }
  function bindContainer(el) {
    listen(el, 'click', function (ev) { onClick(ev, el); });
    listen(el, 'keydown', function (ev) { onKeydown(ev, el); });
    listen(el, 'input', function (ev) { onInput(ev); });
    listen(el, 'change', function (ev) { onInput(ev); });
  }

  /* ---------- mount and the public API ---------- */

  function mount(host, ui) {
    if (!host || !host.root) return false;
    if (H) unmount();
    H = host;
    SBA_UI = ui && typeof ui === 'object' ? ui : (typeof SaagarServiceBillingUI !== 'undefined' ? SaagarServiceBillingUI : null);
    SBA_KIT = SBA_UI && SBA_UI.kit && typeof SBA_UI.kit === 'object' ? SBA_UI.kit : null;
    bindContainer(host.root);
    return true;
  }
  function unmount() {
    var i, b;
    if (S.timer !== null && typeof clearTimeout === 'function') clearTimeout(S.timer);
    if (H && layerMarked()) closeDlg();
    for (i = 0; i < S.binds.length; i++) {
      b = S.binds[i];
      try { b.el.removeEventListener(b.type, b.fn, b.capture === true); } catch (e) { /* element already gone */ }
    }
    S = freshState();
    H = null;
    SBA_UI = null;
    SBA_KIT = null;
  }
  function show() {
    if (!H || !H.root) return;
    S.active = true;
    S.status = null;
    S.day.date = '';
    render();
  }
  function onContextChange() {
    var R, need;
    if (!H) return;
    if (S.dlg && layerMarked()) {
      R = shownRights();
      need = S.dlg.kind === 'areaold' ? R.confirmOld : R.viewLists;
      if (!need) { closeDlg(); toast(SBA_ERR.SVB_ACCESS_CHANGED); }
    }
    if (areaActive()) render();
  }
  function click(el) {
    var a = getAttr(el, 'data-svcs-action');
    if (!a) return Promise.resolve(fail('SVB_BAD_REPLY'));
    return dispatch(a, getAttr(el, 'data-svs-key'), el);
  }
  function phrases() {
    var seen = {}, out = [], k;
    for (k in SBA_TEXT) { if (has(SBA_TEXT, k) && !seen[SBA_TEXT[k]]) { seen[SBA_TEXT[k]] = true; out.push(SBA_TEXT[k]); } }
    for (k in SBA_ERR) { if (has(SBA_ERR, k) && !seen[SBA_ERR[k]]) { seen[SBA_ERR[k]] = true; out.push(SBA_ERR[k]); } }
    return out.sort();
  }

  return Object.freeze({
    version: SBA_VERSION,
    mount: mount,
    unmount: unmount,
    show: show,
    refresh: render,
    onContextChange: onContextChange,
    click: click,
    phrases: phrases,
    internals: Object.freeze({
      esc: esc, rightsFor: rightsFor, tabsFor: tabsFor, errorText: errText, dispatch: dispatch, actions: Object.keys(SBA_ACT).concat(Object.keys(SBA_DLG_ACT)),
      TEXT: SBA_TEXT, ERR: SBA_ERR, state: function () { return S; }, billState: billState, receiptKind: receiptKind
    })
  });
});
