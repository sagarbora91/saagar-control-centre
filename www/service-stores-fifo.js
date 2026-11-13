(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceStoresFifo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // FIFO stock engine for the Service Stores. Pure: no storage, no screen, no clock.
  // The caller passes the time in. plan* functions never touch the state.
  // applyMovement is the only function that changes a state.
  // Money is whole paise. Quantity is whole pieces.

  var VERSION = 'SVCS_FIFO_V1';
  var MAX_QTY = 1000000;
  var MAX_COST = 100000000;
  var MAX_TOTAL = 1000000000000;
  var MAX_SAFE = 9007199254740991;
  var IST_OFFSET_MS = 19800000;
  var LEDGER_KEY_PREFIX = 'saagar' + '_svcs_' + 'ledger_v1_';

  var MOVEMENT_TYPES = Object.freeze([
    'opening', 'receipt', 'issue_job', 'return_job', 'counter_sale', 'adjust_up', 'adjust_down', 'reversal'
  ]);
  var REASONS_UP = Object.freeze(['found', 'wrong_receipt', 'count_correction', 'other']);
  var REASONS_DOWN = Object.freeze(['damaged', 'lost', 'wrong_receipt', 'count_correction', 'write_off', 'other']);

  function policy(minTier, reauth) {
    return Object.freeze({ minTier: minTier, reauth: reauth });
  }
  var ACTION_POLICY = Object.freeze({
    opening: policy('owner', true),
    receipt: policy('staff', false),
    issue_job: policy('staff', false),
    return_job: policy('staff', false),
    counter_sale: policy('staff', false),
    adjust_up: policy('manager', false),
    adjust_down: policy('manager', false),
    reversal: policy('manager', false),
    negative_override: policy('owner', true)
  });
  var TIER_RANK = { none: 0, staff: 1, manager: 2, owner: 3 };

  var MESSAGE_LIST = [
    ['SESSION_INVALID', 'Your role could not be checked. Nothing was recorded.'],
    ['ROLE_DENIED', 'Your role is not allowed to do this.'],
    ['REAUTH_REQUIRED', 'Owner PIN confirmation is required for this action.'],
    ['INPUT_INVALID', 'The request has missing, unknown or wrongly typed fields.'],
    ['AT_INVALID', 'The time is not a valid date and time.'],
    ['AT_BEFORE_LAST', 'The time is earlier than the last stock entry.'],
    ['PART_CODE_INVALID', 'The part code is not valid.'],
    ['QTY_INVALID', 'The quantity must be a whole number from 1 to 1,000,000.'],
    ['COST_INVALID', 'The unit cost must be a whole number of paise from 0 to 100,000,000.'],
    ['COST_REQUIRED', 'A unit cost is required here.'],
    ['REF_REQUIRED', 'A required reference (GRN, line, job or sale) is missing.'],
    ['REF_INVALID', 'A reference field is not allowed or not valid.'],
    ['REASON_REQUIRED', 'A reason is required.'],
    ['REASON_INVALID', 'This reason cannot be used for this direction.'],
    ['DIRECTION_INVALID', 'The direction must be up or down.'],
    ['INSUFFICIENT_STOCK', 'Not enough stock.'],
    ['OPENING_EXISTS', 'This part already has an opening stock entry.'],
    ['OPENING_AFTER_ACTIVITY', 'Opening stock can only be set before any other entry for the part.'],
    ['DUPLICATE_REF', 'This GRN line is already recorded.'],
    ['ISSUE_NOT_FOUND', 'The issue to return was not found.'],
    ['ISSUE_NOT_JOB', 'That entry is not an issue to a job.'],
    ['ISSUE_REVERSED', 'That issue has been reversed.'],
    ['PART_MISMATCH', 'The part does not match the issue.'],
    ['RETURN_JOB_MISMATCH', 'The job does not match the issue.'],
    ['RETURN_EXCEEDS_ISSUE', 'More than is still out on this issue.'],
    ['RETURN_DEBT_SETTLED', 'This return reaches a shortfall that a later receipt already covered. Use an adjustment.'],
    ['MOVEMENT_NOT_FOUND', 'The entry to reverse was not found.'],
    ['ALREADY_REVERSED', 'This entry is already reversed.'],
    ['CANNOT_REVERSE_REVERSAL', 'A reversal cannot be reversed. Post the action again.'],
    ['OPENING_NOT_REVERSIBLE', 'Opening stock cannot be reversed. Post an adjustment.'],
    ['LAYER_PARTLY_CONSUMED', 'Part of this stock layer has already been used. Reverse the later entries first.'],
    ['ISSUE_HAS_RETURNS', 'This issue has returns. Reverse the returns first.'],
    ['DEBT_ALREADY_SETTLED', 'The shortfall created by this entry was already covered by a later receipt.'],
    ['LEDGER_GAP', 'The stock ledger has a missing or repeated sequence number.'],
    ['LEDGER_ORDER', 'The stock ledger times go backwards.'],
    ['LEDGER_BAD_RECORD', 'A stock ledger record is malformed.'],
    ['LEDGER_MISMATCH', 'A stock ledger record does not match its recomputed cost layers.'],
    ['ASOF_INVALID', 'The as-of date is not valid.'],
    ['BAD_AMOUNT', 'The amount is not valid.'],
    ['BAD_QTY', 'The quantity is not valid.'],
    ['INTERNAL_ERROR', 'Unexpected error. Nothing was recorded.']
  ];
  var CODES = {};
  var MESSAGES = {};
  (function () {
    var i;
    for (i = 0; i < MESSAGE_LIST.length; i++) {
      CODES[MESSAGE_LIST[i][0]] = MESSAGE_LIST[i][0];
      MESSAGES[MESSAGE_LIST[i][0]] = MESSAGE_LIST[i][1];
    }
  })();
  CODES = Object.freeze(CODES);
  MESSAGES = Object.freeze(MESSAGES);

  var MV_KEYS = ['v', 'seq', 'id', 'at', 'docDate', 'type', 'partCode', 'qty', 'valuePaise', 'unitCostPaise',
    'newLayerId', 'layers', 'debt', 'settles', 'trueUpPaise', 'returnsOf', 'reverses', 'ref', 'reason', 'note',
    'proposedBy', 'override', 'actor', 'approval'];
  var REF_KEYS = ['grnNo', 'supplierInvoiceNo', 'jobId', 'saleRef', 'invoiceId', 'countId', 'reconRunId',
    'adjustId', 'lineNo'];
  var DERIVED_KEYS = ['partCode', 'qty', 'valuePaise', 'unitCostPaise', 'newLayerId', 'layers', 'debt',
    'settles', 'trueUpPaise', 'returnsOf', 'reverses'];

  // ---------- small helpers ----------

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function isInt(x) {
    return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && Math.abs(x) <= MAX_SAFE;
  }
  function isStr(x) { return typeof x === 'string'; }
  function zero(x) { return x === 0 ? 0 : x; }
  function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function idFor(seq) { return 'MV' + pad(seq, 8); }
  function isCost(x) { return isInt(x) && x >= 0 && x <= MAX_COST; }
  function isQty(x) { return isInt(x) && x >= 1 && x <= MAX_QTY; }
  function fail(code, detail) {
    var r = { ok: false, code: code, message: MESSAGES[code] };
    if (detail !== undefined) r.detail = detail;
    return r;
  }
  // Sets an own property, also for the key "__proto__" (a plain assignment would change the prototype).
  function setOwn(o, k, v) {
    if (k === '__proto__') {
      Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
    } else {
      o[k] = v;
    }
  }
  function cloneVal(v) {
    var out, i, keys;
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      out = [];
      for (i = 0; i < v.length; i++) out.push(cloneVal(v[i]));
      return out;
    }
    out = {};
    keys = Object.keys(v);
    for (i = 0; i < keys.length; i++) setOwn(out, keys[i], cloneVal(v[keys[i]]));
    return out;
  }
  // Reads every own key of a caller object exactly once, so a getter cannot answer one check
  // and then give a different value later. Inherited keys are not read.
  function snapOne(x) {
    var out = {}, keys, i;
    if (!isObj(x)) return x;
    keys = Object.keys(x);
    for (i = 0; i < keys.length; i++) setOwn(out, keys[i], x[keys[i]]);
    return out;
  }
  function snapInput(x) {
    var out = snapOne(x);
    if (isObj(out) && has(out, 'ref')) out.ref = snapOne(out.ref);
    return out;
  }
  function snapCtx(ctx) {
    var c;
    if (!isObj(ctx)) return ctx;
    c = snapOne(ctx);
    return { session: snapOne(c.session), reauth: c.reauth };
  }
  function deepFreeze(v) {
    var i, keys;
    if (v === null || typeof v !== 'object' || Object.isFrozen(v)) return v;
    keys = Object.keys(v);
    for (i = 0; i < keys.length; i++) deepFreeze(v[keys[i]]);
    return Object.freeze(v);
  }
  function stable(v) {
    var i, keys, parts;
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) {
      parts = [];
      for (i = 0; i < v.length; i++) parts.push(stable(v[i]));
      return '[' + parts.join(',') + ']';
    }
    if (typeof v === 'object') {
      keys = Object.keys(v).sort();
      parts = [];
      for (i = 0; i < keys.length; i++) parts.push(JSON.stringify(keys[i]) + ':' + stable(v[keys[i]]));
      return '{' + parts.join(',') + '}';
    }
    return JSON.stringify(v);
  }

  // ---------- time and text helpers ----------

  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

  function parseIso(s) {
    var m, y, mo, d, h, mi, se, ms, t, dt;
    if (!isStr(s)) return null;
    m = ISO_RE.exec(s);
    if (!m) return null;
    y = +m[1]; mo = +m[2]; d = +m[3]; h = +m[4]; mi = +m[5]; se = +m[6]; ms = +m[7];
    t = Date.UTC(y, mo - 1, d, h, mi, se, ms);
    dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d ||
        dt.getUTCHours() !== h || dt.getUTCMinutes() !== mi || dt.getUTCSeconds() !== se ||
        dt.getUTCMilliseconds() !== ms) return null;
    return t;
  }
  function isIsoInstant(s) { return parseIso(s) !== null; }
  function isDateStr(s) {
    return isStr(s) && /^\d{4}-\d{2}-\d{2}$/.test(s) && parseIso(s + 'T00:00:00.000Z') !== null;
  }
  function istDate(at) {
    var t = parseIso(at);
    if (t === null) return '';
    return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
  }
  function istDayEndInstant(dateStr) {
    if (!isDateStr(dateStr)) return '';
    return dateStr + 'T18:29:59.999Z';
  }
  function ledgerKeyForAt(at) {
    var d = istDate(at);
    if (!d) return '';
    return LEDGER_KEY_PREFIX + d.slice(0, 7);
  }
  function normalizePartCode(raw) {
    var s;
    if (!isStr(raw)) return '';
    s = raw.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._\/-]{0,39}$/.test(s)) return '';
    return s;
  }
  function unitCostFromTotal(totalPaise, qty) {
    var unit;
    if (!isInt(totalPaise) || totalPaise < 0 || totalPaise > MAX_TOTAL) return fail(CODES.BAD_AMOUNT);
    if (!isInt(qty) || qty < 1 || qty > MAX_QTY) return fail(CODES.BAD_QTY);
    unit = Math.floor((2 * totalPaise + qty) / (2 * qty));
    return { ok: true, unitCostPaise: unit, remainderPaise: zero(totalPaise - unit * qty) };
  }
  function avgCostPaise(valuePaise, qty) {
    if (!isInt(valuePaise) || !isInt(qty) || qty <= 0 || valuePaise < 0) return null;
    return Math.floor((2 * valuePaise + qty) / (2 * qty));
  }

  // ---------- state ----------

  function emptyState() {
    return { v: 1, lastSeq: 0, lastAt: '', parts: {}, byId: {}, reversedBy: {}, issues: {}, refKeys: {} };
  }
  function isState(s) {
    return isObj(s) && s.v === 1 && isInt(s.lastSeq) && isStr(s.lastAt) && isObj(s.parts) && isObj(s.byId) &&
      isObj(s.reversedBy) && isObj(s.issues) && isObj(s.refKeys);
  }
  function newPart() {
    return { qty: 0, valuePaise: 0, hasOpening: false, layers: [], layerIdx: {}, head: 0, debts: [], debtIdx: {} };
  }
  function getPart(state, code) {
    return has(state.parts, code) ? state.parts[code] : null;
  }
  function ensurePart(state, code) {
    if (!has(state.parts, code)) state.parts[code] = newPart();
    return state.parts[code];
  }
  function lastCostOf(P) {
    var i;
    if (!P) return null;
    for (i = P.layers.length - 1; i >= 0; i--) {
      if (!P.layers[i].voided) return P.layers[i].unitCostPaise;
    }
    return null;
  }
  function fixHead(P, low) {
    if (low !== undefined && low < P.head) P.head = low;
    while (P.head < P.layers.length && P.layers[P.head].qtyLeft === 0) P.head++;
  }
  function layerOf(P, id) {
    return has(P.layerIdx, id) ? P.layers[P.layerIdx[id]] : null;
  }
  function debtOf(P, id) {
    return has(P.debtIdx, id) ? P.debts[P.debtIdx[id]] : null;
  }
  function removeDebt(P, id) {
    var idx = P.debtIdx[id], i;
    P.debts.splice(idx, 1);
    delete P.debtIdx[id];
    for (i = idx; i < P.debts.length; i++) P.debtIdx[P.debts[i].id] = i;
  }
  function isDebtId(layerId) { return layerId.slice(0, 5) === 'DEBT:'; }

  function cloneState(state) {
    var out, codes, i, j, P, Q, ids, k, src, L;
    if (!isState(state)) return null;
    out = emptyState();
    out.lastSeq = state.lastSeq;
    out.lastAt = state.lastAt;
    codes = Object.keys(state.parts);
    for (i = 0; i < codes.length; i++) {
      P = state.parts[codes[i]];
      Q = newPart();
      Q.qty = P.qty;
      Q.valuePaise = P.valuePaise;
      Q.hasOpening = P.hasOpening;
      Q.head = P.head;
      for (j = 0; j < P.layers.length; j++) {
        L = P.layers[j];
        Q.layers.push({ id: L.id, qtyIn: L.qtyIn, qtyLeft: L.qtyLeft, settled: L.settled,
          unitCostPaise: L.unitCostPaise, voided: L.voided, createdSeq: L.createdSeq });
        Q.layerIdx[L.id] = j;
      }
      for (j = 0; j < P.debts.length; j++) {
        L = P.debts[j];
        Q.debts.push({ id: L.id, qtyOrig: L.qtyOrig, qty: L.qty, unitCostPaise: L.unitCostPaise });
        Q.debtIdx[L.id] = j;
      }
      out.parts[codes[i]] = Q;
    }
    ids = Object.keys(state.byId);
    for (i = 0; i < ids.length; i++) out.byId[ids[i]] = state.byId[ids[i]];
    ids = Object.keys(state.reversedBy);
    for (i = 0; i < ids.length; i++) out.reversedBy[ids[i]] = state.reversedBy[ids[i]];
    ids = Object.keys(state.refKeys);
    for (i = 0; i < ids.length; i++) out.refKeys[ids[i]] = state.refKeys[ids[i]];
    ids = Object.keys(state.issues);
    for (i = 0; i < ids.length; i++) {
      src = state.issues[ids[i]];
      Q = { returned: {}, returnIds: src.returnIds.slice(), total: src.total };
      k = Object.keys(src.returned);
      for (j = 0; j < k.length; j++) Q.returned[k[j]] = src.returned[k[j]];
      out.issues[ids[i]] = Q;
    }
    return out;
  }

  function exportState(state) {
    var out = { v: 1, lastSeq: 0, lastAt: '', parts: {} };
    var codes, i, j, P, L, rec;
    if (!isState(state)) return out;
    out.lastSeq = state.lastSeq;
    out.lastAt = state.lastAt;
    codes = Object.keys(state.parts).sort();
    for (i = 0; i < codes.length; i++) {
      P = state.parts[codes[i]];
      rec = { qty: P.qty, valuePaise: P.valuePaise, lastCostPaise: lastCostOf(P), hasOpening: P.hasOpening,
        layers: [], debts: [] };
      for (j = 0; j < P.layers.length; j++) {
        L = P.layers[j];
        rec.layers.push({ id: L.id, qtyIn: L.qtyIn, qtyLeft: L.qtyLeft, settled: L.settled,
          unitCostPaise: L.unitCostPaise, voided: L.voided });
      }
      for (j = 0; j < P.debts.length; j++) {
        L = P.debts[j];
        rec.debts.push({ id: L.id, qtyOrig: L.qtyOrig, qty: L.qty, unitCostPaise: L.unitCostPaise });
      }
      out.parts[codes[i]] = rec;
    }
    return out;
  }

  function canonicalString(m) {
    var parts = [], i;
    if (!isObj(m)) return '';
    for (i = 0; i < MV_KEYS.length; i++) {
      parts.push(JSON.stringify(MV_KEYS[i]) + ':' + stable(m[MV_KEYS[i]]));
    }
    return '{' + parts.join(',') + '}';
  }

  // ---------- authorization ----------

  function authorize(ctx, action) {
    var pol, s, tier;
    if (!isObj(ctx) || !isObj(ctx.session)) return fail(CODES.SESSION_INVALID);
    s = ctx.session;
    tier = s.tier;
    if (s.ok !== true) return fail(CODES.SESSION_INVALID);
    if (tier !== 'owner' && tier !== 'manager' && tier !== 'staff') return fail(CODES.SESSION_INVALID);
    if (tier === 'owner' && s.isOwner !== true) return fail(CODES.SESSION_INVALID);
    if (tier === 'manager' && s.isManager !== true) return fail(CODES.SESSION_INVALID);
    if (!isStr(action) || !has(ACTION_POLICY, action)) return fail(CODES.INPUT_INVALID);
    pol = ACTION_POLICY[action];
    if (TIER_RANK[tier] < TIER_RANK[pol.minTier]) return fail(CODES.ROLE_DENIED);
    if (pol.reauth && ctx.reauth !== true) return fail(CODES.REAUTH_REQUIRED);
    return { ok: true };
  }
  function actorOf(session) {
    var name = isStr(session.actorName) ? session.actorName : '';
    var role = isStr(session.role) && session.role ? session.role : String(session.tier);
    return { name: name, role: role };
  }

  // ---------- derivation (read only; used by plan and by apply) ----------

  function refKeyOf(ref, partCode) {
    if (!isObj(ref) || !isStr(ref.grnNo) || !ref.grnNo || !isInt(ref.lineNo)) return '';
    return ref.grnNo + '|' + ref.lineNo + '|' + partCode;
  }

  function deriveCreate(state, type, p) {
    var P = getPart(state, p.partCode);
    var key, settles = [], settled = 0, trueUp = 0, settledValue = 0, i, d, s, value;
    if (type === 'opening') {
      if (P && P.hasOpening) return fail(CODES.OPENING_EXISTS);
      if (P) return fail(CODES.OPENING_AFTER_ACTIVITY);
    }
    if (type === 'receipt') {
      key = refKeyOf(p.ref, p.partCode);
      if (!key) return fail(CODES.REF_REQUIRED);
      if (has(state.refKeys, key)) return fail(CODES.DUPLICATE_REF);
    }
    if (!isQty(p.qty)) return fail(CODES.QTY_INVALID);
    if (!isCost(p.unitCostPaise)) return fail(CODES.COST_INVALID);
    if (P) {
      for (i = 0; i < P.debts.length && settled < p.qty; i++) {
        d = P.debts[i];
        if (d.qty <= 0) continue;
        s = Math.min(d.qty, p.qty - settled);
        settles.push({ debtId: d.id, qty: s, debtUnitCostPaise: d.unitCostPaise });
        settled += s;
        trueUp += s * (p.unitCostPaise - d.unitCostPaise);
        settledValue += s * d.unitCostPaise;
      }
    }
    value = (p.qty - settled) * p.unitCostPaise + settledValue;
    return { ok: true, exp: {
      partCode: p.partCode, qty: p.qty, valuePaise: zero(value), unitCostPaise: p.unitCostPaise,
      newLayerId: p.id, layers: [], debt: null, settles: settles, trueUpPaise: zero(trueUp),
      returnsOf: null, reverses: null } };
  }

  function walkConsume(P, q) {
    var taken = [], value = 0, rem = q, i, L, t;
    if (P) {
      for (i = P.head; i < P.layers.length && rem > 0; i++) {
        L = P.layers[i];
        if (L.qtyLeft <= 0) continue;
        t = Math.min(L.qtyLeft, rem);
        taken.push({ layerId: L.id, qty: t, unitCostPaise: L.unitCostPaise });
        value += t * L.unitCostPaise;
        rem -= t;
      }
    }
    return { taken: taken, value: value, short: rem };
  }

  // p: {id, partCode, q, debtCostIn (number or null), negOk}
  function deriveConsume(state, p) {
    var P = getPart(state, p.partCode);
    var avail = P ? Math.max(P.qty, 0) : 0;
    var needOverride = p.q > avail;
    var w, cost = null, layers, debt = null, last;
    if (!isQty(p.q)) return fail(CODES.QTY_INVALID);
    if (needOverride && !p.negOk) return fail(CODES.INSUFFICIENT_STOCK, { available: avail, requested: p.q });
    w = walkConsume(P, p.q);
    layers = w.taken;
    if (w.short > 0) {
      last = lastCostOf(P);
      cost = last !== null ? last : p.debtCostIn;
      if (cost === null || cost === undefined) return fail(CODES.COST_REQUIRED);
      if (!isCost(cost)) return fail(CODES.COST_INVALID);
      layers = layers.concat([{ layerId: 'DEBT:' + p.id, qty: w.short, unitCostPaise: cost }]);
      debt = { qty: w.short, unitCostPaise: cost };
    }
    return { ok: true, needOverride: needOverride, debtCostNeeded: w.short > 0 && lastCostOf(P) === null,
      exp: {
        partCode: p.partCode, qty: zero(0 - p.q), valuePaise: zero(0 - (w.value + (debt ? debt.qty * debt.unitCostPaise : 0))),
        unitCostPaise: null, newLayerId: null, layers: layers, debt: debt, settles: [], trueUpPaise: 0,
        returnsOf: null, reverses: null } };
  }

  // p: {issueId, q, jobId, partCode (or '')}
  function deriveReturn(state, p) {
    var iss, info, issued, outstanding, P, i, e, avail, x, rem, entries = [], value = 0, debtPart = null, D;
    if (!isStr(p.issueId) || !has(state.byId, p.issueId)) return fail(CODES.ISSUE_NOT_FOUND);
    iss = state.byId[p.issueId];
    if (iss.type !== 'issue_job') return fail(CODES.ISSUE_NOT_JOB);
    if (has(state.reversedBy, p.issueId)) return fail(CODES.ISSUE_REVERSED);
    if (p.partCode && p.partCode !== iss.partCode) return fail(CODES.PART_MISMATCH);
    if (p.jobId !== iss.ref.jobId) return fail(CODES.RETURN_JOB_MISMATCH);
    if (!has(state.issues, p.issueId)) return fail(CODES.ISSUE_NOT_FOUND);
    if (!isQty(p.q)) return fail(CODES.QTY_INVALID);
    info = state.issues[p.issueId];
    issued = 0 - iss.qty;
    outstanding = issued - info.total;
    if (p.q > outstanding) return fail(CODES.RETURN_EXCEEDS_ISSUE, { outstanding: outstanding });
    P = getPart(state, iss.partCode);
    rem = p.q;
    for (i = iss.layers.length - 1; i >= 0 && rem > 0; i--) {
      e = iss.layers[i];
      avail = e.qty - (has(info.returned, e.layerId) ? info.returned[e.layerId] : 0);
      if (avail <= 0) continue;
      x = Math.min(avail, rem);
      if (isDebtId(e.layerId)) {
        D = P ? debtOf(P, e.layerId.slice(5)) : null;
        if (!D || D.qty < x) return fail(CODES.RETURN_DEBT_SETTLED);
        debtPart = { qty: x, unitCostPaise: e.unitCostPaise };
      }
      entries.push({ layerId: e.layerId, qty: x, unitCostPaise: e.unitCostPaise });
      value += x * e.unitCostPaise;
      rem -= x;
    }
    if (rem > 0) return fail(CODES.RETURN_EXCEEDS_ISSUE, { outstanding: outstanding });
    return { ok: true, iss: iss, exp: {
      partCode: iss.partCode, qty: p.q, valuePaise: zero(value), unitCostPaise: null, newLayerId: null,
      layers: entries, debt: debtPart, settles: [], trueUpPaise: 0, returnsOf: p.issueId, reverses: null } };
  }

  function deriveReversal(state, id) {
    var orig, P, L, D, i, e;
    if (!isStr(id) || !has(state.byId, id)) return fail(CODES.MOVEMENT_NOT_FOUND);
    orig = state.byId[id];
    if (orig.type === 'reversal') return fail(CODES.CANNOT_REVERSE_REVERSAL);
    if (orig.type === 'opening') return fail(CODES.OPENING_NOT_REVERSIBLE);
    if (has(state.reversedBy, id)) return fail(CODES.ALREADY_REVERSED);
    P = getPart(state, orig.partCode);
    if (!P) return fail(CODES.LEDGER_MISMATCH);
    if (orig.type === 'receipt' || orig.type === 'adjust_up') {
      L = layerOf(P, orig.newLayerId);
      if (!L || L.voided || L.qtyLeft !== L.qtyIn - L.settled) return fail(CODES.LAYER_PARTLY_CONSUMED);
      for (i = 0; i < orig.settles.length; i++) {
        if (!debtOf(P, orig.settles[i].debtId)) return fail(CODES.DEBT_ALREADY_SETTLED);
      }
    } else if (orig.type === 'issue_job' || orig.type === 'counter_sale' || orig.type === 'adjust_down') {
      if (orig.type === 'issue_job' && has(state.issues, id) && state.issues[id].total > 0) {
        return fail(CODES.ISSUE_HAS_RETURNS);
      }
      if (orig.debt) {
        D = debtOf(P, id);
        if (!D || D.qty !== D.qtyOrig) return fail(CODES.DEBT_ALREADY_SETTLED);
      }
    } else if (orig.type === 'return_job') {
      for (i = 0; i < orig.layers.length; i++) {
        e = orig.layers[i];
        if (isDebtId(e.layerId)) {
          D = debtOf(P, e.layerId.slice(5));
          if (!D) return fail(CODES.DEBT_ALREADY_SETTLED);
        } else {
          L = layerOf(P, e.layerId);
          if (!L || L.qtyLeft < e.qty) return fail(CODES.LAYER_PARTLY_CONSUMED);
        }
      }
    } else {
      return fail(CODES.LEDGER_BAD_RECORD);
    }
    return { ok: true, orig: orig, exp: {
      partCode: orig.partCode, qty: zero(0 - orig.qty), valuePaise: zero(0 - orig.valuePaise),
      unitCostPaise: orig.unitCostPaise, newLayerId: orig.newLayerId, layers: cloneVal(orig.layers),
      debt: cloneVal(orig.debt), settles: cloneVal(orig.settles), trueUpPaise: zero(0 - orig.trueUpPaise),
      returnsOf: null, reverses: id } };
  }

  // ---------- commit (changes the state; only called with a checked movement) ----------

  function commitCreate(state, mv) {
    var P = ensurePart(state, mv.partCode), settledSum = 0, i, s, D, L;
    for (i = 0; i < mv.settles.length; i++) {
      s = mv.settles[i];
      D = debtOf(P, s.debtId);
      D.qty -= s.qty;
      settledSum += s.qty;
    }
    L = { id: mv.id, qtyIn: mv.qty, qtyLeft: mv.qty - settledSum, settled: settledSum,
      unitCostPaise: mv.unitCostPaise, voided: false, createdSeq: mv.seq };
    P.layerIdx[L.id] = P.layers.length;
    P.layers.push(L);
    fixHead(P);
    if (mv.type === 'opening') P.hasOpening = true;
    if (mv.type === 'receipt') state.refKeys[refKeyOf(mv.ref, mv.partCode)] = mv.id;
    P.qty += mv.qty;
    P.valuePaise += mv.valuePaise;
  }
  function commitConsume(state, mv) {
    var P = ensurePart(state, mv.partCode), i, e, L;
    for (i = 0; i < mv.layers.length; i++) {
      e = mv.layers[i];
      if (isDebtId(e.layerId)) continue;
      L = layerOf(P, e.layerId);
      L.qtyLeft -= e.qty;
    }
    fixHead(P);
    if (mv.debt) {
      P.debtIdx[mv.id] = P.debts.length;
      P.debts.push({ id: mv.id, qtyOrig: mv.debt.qty, qty: mv.debt.qty, unitCostPaise: mv.debt.unitCostPaise });
    }
    if (mv.type === 'issue_job') state.issues[mv.id] = { returned: {}, returnIds: [], total: 0 };
    P.qty += mv.qty;
    P.valuePaise += mv.valuePaise;
  }
  function commitReturn(state, mv) {
    var P = ensurePart(state, mv.partCode), info = state.issues[mv.returnsOf], i, e, L, low;
    for (i = 0; i < mv.layers.length; i++) {
      e = mv.layers[i];
      if (isDebtId(e.layerId)) {
        debtOf(P, e.layerId.slice(5)).qty -= e.qty;
      } else {
        L = layerOf(P, e.layerId);
        L.qtyLeft += e.qty;
        if (low === undefined || P.layerIdx[e.layerId] < low) low = P.layerIdx[e.layerId];
      }
      info.returned[e.layerId] = (has(info.returned, e.layerId) ? info.returned[e.layerId] : 0) + e.qty;
    }
    info.total += mv.qty;
    info.returnIds.push(mv.id);
    fixHead(P, low);
    P.qty += mv.qty;
    P.valuePaise += mv.valuePaise;
  }
  function commitReversal(state, mv) {
    var orig = state.byId[mv.reverses], P = ensurePart(state, orig.partCode), i, e, L, D, low, info, at;
    if (orig.type === 'receipt' || orig.type === 'adjust_up') {
      L = layerOf(P, orig.newLayerId);
      L.qtyLeft = 0;
      L.voided = true;
      for (i = 0; i < orig.settles.length; i++) debtOf(P, orig.settles[i].debtId).qty += orig.settles[i].qty;
      if (orig.type === 'receipt') delete state.refKeys[refKeyOf(orig.ref, orig.partCode)];
      fixHead(P);
    } else if (orig.type === 'issue_job' || orig.type === 'counter_sale' || orig.type === 'adjust_down') {
      for (i = 0; i < orig.layers.length; i++) {
        e = orig.layers[i];
        if (isDebtId(e.layerId)) continue;
        L = layerOf(P, e.layerId);
        L.qtyLeft += e.qty;
        if (low === undefined || P.layerIdx[e.layerId] < low) low = P.layerIdx[e.layerId];
      }
      if (orig.debt) removeDebt(P, orig.id);
      if (orig.type === 'issue_job') delete state.issues[orig.id];
      fixHead(P, low);
    } else if (orig.type === 'return_job') {
      info = state.issues[orig.returnsOf];
      for (i = 0; i < orig.layers.length; i++) {
        e = orig.layers[i];
        if (isDebtId(e.layerId)) {
          D = debtOf(P, e.layerId.slice(5));
          D.qty += e.qty;
        } else {
          layerOf(P, e.layerId).qtyLeft -= e.qty;
        }
        info.returned[e.layerId] -= e.qty;
      }
      info.total -= orig.qty;
      at = info.returnIds.indexOf(orig.id);
      if (at >= 0) info.returnIds.splice(at, 1);
      fixHead(P);
    }
    state.reversedBy[orig.id] = mv.id;
    P.qty += mv.qty;
    P.valuePaise += mv.valuePaise;
  }

  // ---------- movement records ----------

  function copyExp(exp) {
    return {
      partCode: exp.partCode, qty: exp.qty, valuePaise: exp.valuePaise, unitCostPaise: exp.unitCostPaise,
      newLayerId: exp.newLayerId, layers: cloneVal(exp.layers), debt: cloneVal(exp.debt),
      settles: cloneVal(exp.settles), trueUpPaise: exp.trueUpPaise, returnsOf: exp.returnsOf,
      reverses: exp.reverses
    };
  }
  // o: base fields from the reader plus {type, exp, ref, reason, proposedBy, override, actor, approval}
  function buildMovement(state, o) {
    var seq = state.lastSeq + 1;
    var e = copyExp(o.exp);
    return deepFreeze({
      v: 1, seq: seq, id: idFor(seq), at: o.at, docDate: o.docDate, type: o.type, partCode: e.partCode,
      qty: zero(e.qty), valuePaise: zero(e.valuePaise), unitCostPaise: e.unitCostPaise,
      newLayerId: e.newLayerId, layers: e.layers, debt: e.debt, settles: e.settles,
      trueUpPaise: zero(e.trueUpPaise), returnsOf: e.returnsOf, reverses: e.reverses,
      ref: o.ref || {}, reason: o.reason || '', note: o.note || '', proposedBy: o.proposedBy || '',
      override: o.override || null, actor: o.actor, approval: o.approval || null
    });
  }
  function approvalFor(actor) { return { by: actor.name, role: actor.role }; }

  // ---------- input reading ----------

  function readRef(ref, required) {
    var clean = {}, keys, i, k, val;
    if (ref === undefined) {
      ref = {};
    } else if (!isObj(ref)) {
      return fail(CODES.REF_INVALID);
    }
    keys = Object.keys(ref);
    for (i = 0; i < keys.length; i++) {
      if (REF_KEYS.indexOf(keys[i]) < 0) return fail(CODES.REF_INVALID);
    }
    for (i = 0; i < REF_KEYS.length; i++) {
      k = REF_KEYS[i];
      val = ref[k];
      if (val === undefined) continue;
      if (k === 'lineNo') {
        if (!isInt(val) || val < 1 || val > 9999) return fail(CODES.REF_INVALID);
        clean[k] = val;
      } else {
        if (!isStr(val)) return fail(CODES.REF_INVALID);
        val = val.trim();
        if (val.length < 1 || val.length > 60) return fail(CODES.REF_INVALID);
        clean[k] = val;
      }
    }
    for (i = 0; i < required.length; i++) {
      if (!has(clean, required[i])) return fail(CODES.REF_REQUIRED);
    }
    return { ok: true, ref: clean };
  }

  // spec: {keys, part, qty, cost ('req' | 'opt' | ''), refReq}
  function readCommon(state, input, spec) {
    var keys, i, v = {}, r;
    if (!isObj(input)) return fail(CODES.INPUT_INVALID);
    keys = Object.keys(input);
    for (i = 0; i < keys.length; i++) {
      if (spec.keys.indexOf(keys[i]) < 0) return fail(CODES.INPUT_INVALID);
    }
    if (!isStr(input.at) || parseIso(input.at) === null) return fail(CODES.AT_INVALID);
    if (input.at < state.lastAt) return fail(CODES.AT_BEFORE_LAST);
    v.at = input.at;
    if (input.docDate === undefined) v.docDate = istDate(input.at);
    else if (isDateStr(input.docDate)) v.docDate = input.docDate;
    else return fail(CODES.INPUT_INVALID);
    if (input.note === undefined) v.note = '';
    else if (isStr(input.note) && input.note.length <= 200) v.note = input.note;
    else return fail(CODES.INPUT_INVALID);
    if (spec.part) {
      v.partCode = normalizePartCode(input.partCode);
      if (!v.partCode) return fail(CODES.PART_CODE_INVALID);
    }
    if (spec.qty) {
      if (!isQty(input.qty)) return fail(CODES.QTY_INVALID);
      v.qty = input.qty;
    }
    v.unitCostPaise = null;
    if (spec.cost) {
      if (input.unitCostPaise === undefined) {
        if (spec.cost === 'req') return fail(CODES.COST_REQUIRED);
      } else if (!isCost(input.unitCostPaise)) {
        return fail(CODES.COST_INVALID);
      } else {
        v.unitCostPaise = input.unitCostPaise;
      }
    }
    r = readRef(input.ref, spec.refReq);
    if (!r.ok) return r;
    v.ref = r.ref;
    return { ok: true, v: v };
  }

  function prelude(state, ctx, action) {
    var a = authorize(ctx, action);
    if (!a.ok) return a;
    if (!isState(state)) return fail(CODES.INPUT_INVALID);
    return null;
  }

  // ---------- plan functions ----------

  function planCreating(state, input, ctx, type, spec, extra) {
    var bad = prelude(state, ctx, type), r, v, cost, d, actor, o;
    if (bad) return bad;
    r = readCommon(state, input, spec);
    if (!r.ok) return r;
    v = r.v;
    cost = v.unitCostPaise;
    o = { reason: '', proposedBy: '' };
    if (extra) {
      o = extra(state, input, v);
      if (!o.ok) return o;
      if (cost === null) {
        cost = lastCostOf(getPart(state, v.partCode));
        if (cost === null) return fail(CODES.COST_REQUIRED);
      }
    }
    d = deriveCreate(state, type, { id: idFor(state.lastSeq + 1), partCode: v.partCode, qty: v.qty,
      unitCostPaise: cost, ref: v.ref });
    if (!d.ok) return d;
    actor = actorOf(ctx.session);
    return { ok: true, movement: buildMovement(state, {
      at: v.at, docDate: v.docDate, type: type, exp: d.exp, ref: v.ref, reason: o.reason, note: v.note,
      proposedBy: o.proposedBy, actor: actor,
      approval: (type === 'opening' || type === 'adjust_up') ? approvalFor(actor) : null }) };
  }

  function planOpening(state, input, ctx) {
    return planCreating(state, input, ctx, 'opening', {
      keys: ['partCode', 'qty', 'unitCostPaise', 'at', 'docDate', 'note', 'ref'],
      part: true, qty: true, cost: 'req', refReq: [] });
  }
  function planReceipt(state, input, ctx) {
    return planCreating(state, input, ctx, 'receipt', {
      keys: ['partCode', 'qty', 'unitCostPaise', 'at', 'docDate', 'note', 'ref'],
      part: true, qty: true, cost: 'req', refReq: ['grnNo', 'lineNo'] });
  }

  function readReason(input, list) {
    var reason = input.reason, proposedBy = '';
    if (reason === undefined || reason === '') return fail(CODES.REASON_REQUIRED);
    if (!isStr(reason) || list.indexOf(reason) < 0) return fail(CODES.REASON_INVALID);
    if (input.proposedBy !== undefined) {
      if (!isStr(input.proposedBy) || input.proposedBy.trim().length < 1 || input.proposedBy.trim().length > 60) {
        return fail(CODES.INPUT_INVALID);
      }
      proposedBy = input.proposedBy.trim();
    }
    return { ok: true, reason: reason, proposedBy: proposedBy };
  }

  // type: 'issue_job' | 'counter_sale' | 'adjust_down'
  function planConsuming(state, input, ctx, type, keys, refReq, reasons) {
    var bad = prelude(state, ctx, type), a, r, v, allowNeg = false, rs, d, actor, override = null, extraReason;
    if (bad) return bad;
    if (isObj(input) && input.allowNegative === true) {
      a = authorize(ctx, 'negative_override');
      if (!a.ok) return a;
    }
    r = readCommon(state, input, { keys: keys, part: true, qty: true, cost: 'opt', refReq: refReq });
    if (!r.ok) return r;
    v = r.v;
    if (input.allowNegative !== undefined) {
      if (typeof input.allowNegative !== 'boolean') return fail(CODES.INPUT_INVALID);
      allowNeg = input.allowNegative;
    }
    rs = { ok: true, reason: '', proposedBy: '' };
    if (reasons) {
      rs = readReason(input, reasons);
      if (!rs.ok) return rs;
    }
    if (allowNeg && v.note.trim().length < 3) return fail(CODES.REASON_REQUIRED);
    d = deriveConsume(state, { id: idFor(state.lastSeq + 1), partCode: v.partCode, q: v.qty,
      debtCostIn: v.unitCostPaise, negOk: allowNeg });
    if (!d.ok) return d;
    if (v.unitCostPaise !== null && !d.debtCostNeeded) return fail(CODES.INPUT_INVALID);
    actor = actorOf(ctx.session);
    if (d.needOverride) override = { by: actor.name, note: v.note };
    extraReason = rs.reason;
    return { ok: true, movement: buildMovement(state, {
      at: v.at, docDate: v.docDate, type: type, exp: d.exp, ref: v.ref, reason: extraReason, note: v.note,
      proposedBy: rs.proposedBy, override: override, actor: actor,
      approval: (type === 'adjust_down' || override) ? approvalFor(actor) : null }) };
  }

  function planIssueToJob(state, input, ctx) {
    return planConsuming(state, input, ctx, 'issue_job',
      ['partCode', 'qty', 'at', 'docDate', 'note', 'ref', 'allowNegative', 'unitCostPaise'], ['jobId'], null);
  }
  function planCounterSale(state, input, ctx) {
    return planConsuming(state, input, ctx, 'counter_sale',
      ['partCode', 'qty', 'at', 'docDate', 'note', 'ref', 'allowNegative', 'unitCostPaise'], ['saleRef'], null);
  }

  function planAdjustment(state, input, ctx) {
    var dir = isObj(input) ? input.direction : undefined;
    var bad = prelude(state, ctx, dir === 'down' ? 'adjust_down' : 'adjust_up');
    if (bad) return bad;
    if (!isObj(input)) return fail(CODES.INPUT_INVALID);
    if (dir !== 'up' && dir !== 'down') {
      return fail(CODES.DIRECTION_INVALID);
    }
    if (dir === 'down') {
      return planConsuming(state, deleteKey(input, 'direction'), ctx, 'adjust_down',
        ['partCode', 'qty', 'at', 'docDate', 'note', 'ref', 'allowNegative', 'unitCostPaise', 'reason', 'proposedBy'],
        [], REASONS_DOWN);
    }
    return planCreating(state, deleteKey(input, 'direction'), ctx, 'adjust_up', {
      keys: ['partCode', 'qty', 'unitCostPaise', 'at', 'docDate', 'note', 'ref', 'reason', 'proposedBy'],
      part: true, qty: true, cost: 'opt', refReq: [] }, function (st, inp) {
        return readReason(inp, REASONS_UP);
      });
  }
  function deleteKey(obj, key) {
    var out = {}, keys = Object.keys(obj), i;
    for (i = 0; i < keys.length; i++) {
      if (keys[i] !== key) setOwn(out, keys[i], obj[keys[i]]);
    }
    return out;
  }

  function planReturnFromJob(state, input, ctx) {
    var bad = prelude(state, ctx, 'return_job'), r, v, code = '', d, actor;
    if (bad) return bad;
    r = readCommon(state, input, {
      keys: ['issueId', 'qty', 'at', 'docDate', 'note', 'ref', 'partCode'],
      part: false, qty: true, cost: '', refReq: ['jobId'] });
    if (!r.ok) return r;
    v = r.v;
    if (!isStr(input.issueId) || !input.issueId) return fail(CODES.INPUT_INVALID);
    if (input.partCode !== undefined) {
      code = normalizePartCode(input.partCode);
      if (!code) return fail(CODES.PART_CODE_INVALID);
    }
    d = deriveReturn(state, { issueId: input.issueId, q: v.qty, jobId: v.ref.jobId, partCode: code });
    if (!d.ok) return d;
    actor = actorOf(ctx.session);
    return { ok: true, movement: buildMovement(state, {
      at: v.at, docDate: v.docDate, type: 'return_job', exp: d.exp, ref: v.ref, note: v.note, actor: actor }) };
  }

  function planReversal(state, input, ctx) {
    var bad = prelude(state, ctx, 'reversal'), r, v, d, actor;
    if (bad) return bad;
    r = readCommon(state, input, {
      keys: ['reverses', 'at', 'docDate', 'note', 'ref'], part: false, qty: false, cost: '', refReq: [] });
    if (!r.ok) return r;
    v = r.v;
    if (!isStr(input.reverses) || !input.reverses) return fail(CODES.INPUT_INVALID);
    if (v.note.trim().length < 3) return fail(CODES.REASON_REQUIRED);
    d = deriveReversal(state, input.reverses);
    if (!d.ok) return d;
    actor = actorOf(ctx.session);
    return { ok: true, movement: buildMovement(state, {
      at: v.at, docDate: v.docDate, type: 'reversal', exp: d.exp, ref: v.ref, note: v.note, actor: actor,
      approval: approvalFor(actor) }) };
  }

  function previewIssue(state, partCode, qty) {
    var code, w;
    if (!isState(state)) return fail(CODES.INPUT_INVALID);
    code = normalizePartCode(partCode);
    if (!code) return fail(CODES.PART_CODE_INVALID);
    if (!isQty(qty)) return fail(CODES.QTY_INVALID);
    w = walkConsume(getPart(state, code), qty);
    return { ok: true, layers: w.taken, valuePaise: zero(w.value), shortfallQty: w.short };
  }
  function previewExcessCostPaise(state, partCode) {
    var code;
    if (!isState(state)) return null;
    code = normalizePartCode(partCode);
    if (!code) return null;
    return lastCostOf(getPart(state, code));
  }

  // ---------- apply and replay ----------

  function badShape(m) {
    var keys, i, k, x, e;
    if (!isObj(m)) return 'not an object';
    keys = Object.keys(m);
    for (i = 0; i < keys.length; i++) {
      if (MV_KEYS.indexOf(keys[i]) < 0 && keys[i] !== 'hash' && keys[i] !== 'prev') return 'extra key';
    }
    for (i = 0; i < MV_KEYS.length; i++) {
      if (!has(m, MV_KEYS[i])) return 'missing key ' + MV_KEYS[i];
    }
    if (has(m, 'hash') && !isStr(m.hash)) return 'hash';
    if (has(m, 'prev') && !isStr(m.prev)) return 'prev';
    if (m.v !== 1) return 'v';
    if (!isInt(m.seq) || m.seq < 1) return 'seq';
    if (m.id !== idFor(m.seq)) return 'id';
    if (parseIso(m.at) === null) return 'at';
    if (!isDateStr(m.docDate)) return 'docDate';
    if (MOVEMENT_TYPES.indexOf(m.type) < 0) return 'type';
    if (!isStr(m.partCode) || !m.partCode || normalizePartCode(m.partCode) !== m.partCode) return 'partCode';
    if (!isInt(m.qty) || !isInt(m.valuePaise) || !isInt(m.trueUpPaise)) return 'number';
    if (m.unitCostPaise !== null && !isInt(m.unitCostPaise)) return 'unitCostPaise';
    if (m.newLayerId !== null && !isStr(m.newLayerId)) return 'newLayerId';
    if (m.returnsOf !== null && !isStr(m.returnsOf)) return 'returnsOf';
    if (m.reverses !== null && !isStr(m.reverses)) return 'reverses';
    if (!Array.isArray(m.layers)) return 'layers';
    for (i = 0; i < m.layers.length; i++) {
      e = m.layers[i];
      if (!isObj(e) || Object.keys(e).length !== 3 || !isStr(e.layerId) || !isInt(e.qty) || e.qty < 1 ||
          !isInt(e.unitCostPaise) || e.unitCostPaise < 0) return 'layer entry';
    }
    if (m.debt !== null) {
      if (!isObj(m.debt) || Object.keys(m.debt).length !== 2 || !isInt(m.debt.qty) || m.debt.qty < 1 ||
          !isInt(m.debt.unitCostPaise) || m.debt.unitCostPaise < 0) return 'debt';
    }
    if (!Array.isArray(m.settles)) return 'settles';
    for (i = 0; i < m.settles.length; i++) {
      e = m.settles[i];
      if (!isObj(e) || Object.keys(e).length !== 3 || !isStr(e.debtId) || !isInt(e.qty) || e.qty < 1 ||
          !isInt(e.debtUnitCostPaise) || e.debtUnitCostPaise < 0) return 'settle entry';
    }
    if (!isObj(m.ref)) return 'ref';
    keys = Object.keys(m.ref);
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      x = m.ref[k];
      if (REF_KEYS.indexOf(k) < 0) return 'ref key';
      if (k === 'lineNo' ? !isInt(x) : !isStr(x)) return 'ref value';
    }
    if (!isStr(m.reason) || !isStr(m.note) || !isStr(m.proposedBy)) return 'text';
    if (m.override !== null && (!isObj(m.override) || !isStr(m.override.by) || !isStr(m.override.note) ||
        Object.keys(m.override).length !== 2)) return 'override';
    if (!isObj(m.actor) || !isStr(m.actor.name) || !isStr(m.actor.role) || Object.keys(m.actor).length !== 2) {
      return 'actor';
    }
    if (m.approval !== null && (!isObj(m.approval) || !isStr(m.approval.by) || !isStr(m.approval.role) ||
        Object.keys(m.approval).length !== 2)) return 'approval';
    return '';
  }

  function sameDerived(mv, exp) {
    var i;
    for (i = 0; i < DERIVED_KEYS.length; i++) {
      if (stable(mv[DERIVED_KEYS[i]]) !== stable(exp[DERIVED_KEYS[i]])) return DERIVED_KEYS[i];
    }
    return '';
  }

  // Checks the parts of a record that are not cost results: reasons, references, approval and override.
  function metaProblem(mv, needOverride) {
    var t = mv.type, approvalNeeded;
    if (t === 'adjust_up' && REASONS_UP.indexOf(mv.reason) < 0) return 'reason';
    if (t === 'adjust_down' && REASONS_DOWN.indexOf(mv.reason) < 0) return 'reason';
    if (t !== 'adjust_up' && t !== 'adjust_down' && mv.reason !== '') return 'reason';
    if (t !== 'adjust_up' && t !== 'adjust_down' && mv.proposedBy !== '') return 'proposedBy';
    if ((t === 'issue_job' || t === 'return_job') && !isStr(mv.ref.jobId)) return 'ref';
    if (t === 'counter_sale' && !isStr(mv.ref.saleRef)) return 'ref';
    if (t === 'reversal' && mv.note.trim().length < 3) return 'note';
    if (t === 'issue_job' || t === 'counter_sale' || t === 'adjust_down') {
      if ((mv.override !== null) !== needOverride) return 'override';
      if (mv.override !== null && mv.override.note.trim().length < 3) return 'override';
    } else if (mv.override !== null) {
      return 'override';
    }
    approvalNeeded = t === 'opening' || t === 'adjust_up' || t === 'adjust_down' || t === 'reversal' ||
      mv.override !== null;
    if ((mv.approval !== null) !== approvalNeeded) return 'approval';
    return '';
  }

  function applyMovement(state, mv) {
    var why, d, diff, seqNo, meta, type;
    if (!isState(state)) return fail(CODES.INPUT_INVALID);
    mv = cloneVal(mv); // one read of every field; checks and commit then see the same values
    why = badShape(mv);
    if (why) return fail(CODES.LEDGER_BAD_RECORD, { reason: why });
    seqNo = mv.seq;
    if (mv.seq !== state.lastSeq + 1) return fail(CODES.LEDGER_GAP, { seq: seqNo, expected: state.lastSeq + 1 });
    if (mv.at < state.lastAt) return fail(CODES.LEDGER_ORDER, { seq: seqNo });
    type = mv.type;
    if (type === 'opening' || type === 'receipt' || type === 'adjust_up') {
      d = deriveCreate(state, type, { id: mv.id, partCode: mv.partCode, qty: mv.qty,
        unitCostPaise: mv.unitCostPaise, ref: mv.ref });
    } else if (type === 'issue_job' || type === 'counter_sale' || type === 'adjust_down') {
      d = deriveConsume(state, { id: mv.id, partCode: mv.partCode, q: 0 - mv.qty,
        debtCostIn: mv.debt ? mv.debt.unitCostPaise : null, negOk: true });
    } else if (type === 'return_job') {
      d = deriveReturn(state, { issueId: mv.returnsOf, q: mv.qty, jobId: mv.ref.jobId, partCode: mv.partCode });
    } else {
      d = deriveReversal(state, mv.reverses);
    }
    if (!d.ok) return fail(CODES.LEDGER_MISMATCH, { seq: seqNo, cause: d.code });
    diff = sameDerived(mv, d.exp);
    if (diff) return fail(CODES.LEDGER_MISMATCH, { seq: seqNo, field: diff });
    meta = metaProblem(mv, d.needOverride === true);
    if (meta) return fail(CODES.LEDGER_MISMATCH, { seq: seqNo, field: meta });
    if (type === 'opening' || type === 'receipt' || type === 'adjust_up') commitCreate(state, mv);
    else if (type === 'issue_job' || type === 'counter_sale' || type === 'adjust_down') commitConsume(state, mv);
    else if (type === 'return_job') commitReturn(state, mv);
    else commitReversal(state, mv);
    state.lastSeq = mv.seq;
    state.lastAt = mv.at;
    state.byId[mv.id] = storedCopy(mv);
    return { ok: true };
  }
  function storedCopy(mv) {
    var out = {}, i;
    // mv is already a private copy made at the top of applyMovement, so its parts can be kept.
    for (i = 0; i < MV_KEYS.length; i++) out[MV_KEYS[i]] = mv[MV_KEYS[i]];
    return deepFreeze(out);
  }

  function replayCore(movements, opts) {
    var st = emptyState(), i, mv, r, untilSeq, untilAt;
    if (!Array.isArray(movements)) return fail(CODES.LEDGER_BAD_RECORD, { seq: 0 });
    if (opts !== undefined && opts !== null) {
      if (!isObj(opts)) return fail(CODES.INPUT_INVALID);
      if (opts.untilSeq !== undefined) {
        if (!isInt(opts.untilSeq)) return fail(CODES.INPUT_INVALID);
        untilSeq = opts.untilSeq;
      }
      if (opts.untilAt !== undefined) {
        if (parseIso(opts.untilAt) === null) return fail(CODES.INPUT_INVALID);
        untilAt = opts.untilAt;
      }
    }
    for (i = 0; i < movements.length; i++) {
      mv = movements[i];
      if (isObj(mv)) {
        if (untilSeq !== undefined && isInt(mv.seq) && mv.seq > untilSeq) break;
        if (untilAt !== undefined && parseIso(mv.at) !== null && mv.at > untilAt) break;
      }
      r = applyMovement(st, mv);
      if (!r.ok) {
        r.detail = r.detail || {};
        if (r.detail.seq === undefined) r.detail.seq = isObj(mv) && isInt(mv.seq) ? mv.seq : i + 1;
        return r;
      }
    }
    return { ok: true, state: st };
  }
  function replay(movements, opts) { return replayCore(movements, opts); }
  function validateLedger(movements) {
    var r = replayCore(movements);
    if (!r.ok) return r;
    return { ok: true, count: movements.length, lastSeq: r.state.lastSeq, lastAt: r.state.lastAt };
  }
  function stateAsOf(movements, asOf) {
    var at;
    if (isIsoInstant(asOf)) at = asOf;
    else if (isDateStr(asOf)) at = istDayEndInstant(asOf);
    else return fail(CODES.ASOF_INVALID);
    return replayCore(movements, { untilAt: at });
  }

  // ---------- queries ----------

  function rowFor(P, code) {
    var open = 0, i, oldest = null;
    if (P) {
      for (i = P.head; i < P.layers.length; i++) {
        if (P.layers[i].qtyLeft > 0) {
          open++;
          if (oldest === null) oldest = P.layers[i].id;
        }
      }
    }
    return {
      partCode: code, qty: P ? P.qty : 0, valuePaise: P ? P.valuePaise : 0,
      avgCostPaise: P ? avgCostPaise(P.valuePaise, P.qty) : null, openLayers: open, oldestOpenLayerId: oldest,
      lastCostPaise: lastCostOf(P), negative: !!P && P.qty < 0
    };
  }
  function balances(state, opts) {
    var out = [], codes, i, P, includeZero;
    if (!isState(state)) return out;
    includeZero = isObj(opts) && opts.includeZero === true;
    codes = Object.keys(state.parts).sort();
    for (i = 0; i < codes.length; i++) {
      P = state.parts[codes[i]];
      if (!includeZero && P.qty === 0 && P.valuePaise === 0) continue;
      out.push(rowFor(P, codes[i]));
    }
    return out;
  }
  function partBalance(state, code) {
    var c = normalizePartCode(code);
    if (!isState(state)) return rowFor(null, c);
    return rowFor(c ? getPart(state, c) : null, c);
  }
  function stockValue(state) {
    var out = { qty: 0, valuePaise: 0, parts: 0 }, codes, i, P;
    if (!isState(state)) return out;
    codes = Object.keys(state.parts);
    for (i = 0; i < codes.length; i++) {
      P = state.parts[codes[i]];
      out.qty += P.qty;
      out.valuePaise += P.valuePaise;
      if (P.qty !== 0 || P.valuePaise !== 0) out.parts++;
    }
    return out;
  }
  function layersForPart(state, code, opts) {
    var out = [], c, P, i, L, onlyOpen;
    if (!isState(state)) return out;
    c = normalizePartCode(code);
    P = c ? getPart(state, c) : null;
    if (!P) return out;
    onlyOpen = isObj(opts) && opts.onlyOpen === true;
    for (i = 0; i < P.layers.length; i++) {
      L = P.layers[i];
      if (onlyOpen && L.qtyLeft === 0) continue;
      out.push({ layerId: L.id, createdSeq: L.createdSeq, qtyIn: L.qtyIn, qtyLeft: L.qtyLeft,
        settled: L.settled, unitCostPaise: L.unitCostPaise, voided: L.voided });
    }
    return out;
  }
  function ledgerForPart(movements, code, opts) {
    var c = normalizePartCode(code), fromAt, toAt, revBy = {}, i, m, qty = 0, val = 0, opening = null, rows = [];
    if (!Array.isArray(movements)) return fail(CODES.LEDGER_BAD_RECORD);
    if (!c) return fail(CODES.PART_CODE_INVALID);
    if (isObj(opts)) {
      if (opts.fromAt !== undefined) {
        if (parseIso(opts.fromAt) === null) return fail(CODES.ASOF_INVALID);
        fromAt = opts.fromAt;
      }
      if (opts.toAt !== undefined) {
        if (parseIso(opts.toAt) === null) return fail(CODES.ASOF_INVALID);
        toAt = opts.toAt;
      }
    }
    for (i = 0; i < movements.length; i++) {
      m = movements[i];
      if (isObj(m) && m.type === 'reversal' && isStr(m.reverses)) revBy[m.reverses] = m.id;
    }
    for (i = 0; i < movements.length; i++) {
      m = movements[i];
      if (!isObj(m) || m.partCode !== c) continue;
      if (fromAt !== undefined && m.at < fromAt) {
        qty += m.qty;
        val += m.valuePaise;
        continue;
      }
      if (opening === null) opening = { qty: qty, valuePaise: val };
      if (toAt !== undefined && m.at > toAt) break;
      qty += m.qty;
      val += m.valuePaise;
      rows.push({
        seq: m.seq, id: m.id, at: m.at, type: m.type, qty: m.qty, valuePaise: m.valuePaise, balanceQty: qty,
        balanceValuePaise: val, ref: cloneVal(m.ref), reason: m.reason, note: m.note, actor: cloneVal(m.actor),
        reverses: m.reverses, reversedBy: has(revBy, m.id) ? revBy[m.id] : null
      });
    }
    if (opening === null) opening = { qty: qty, valuePaise: val };
    return { ok: true, opening: opening, rows: rows };
  }
  function reorderList(state, levels) {
    var out = [], keys, i, k, lv, P, qty;
    if (!isState(state) || !isObj(levels)) return out;
    keys = Object.keys(levels);
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      lv = levels[k];
      if (normalizePartCode(k) !== k || !isObj(lv)) continue;
      if (!isInt(lv.level) || lv.level < 0 || !isInt(lv.reorderQty) || lv.reorderQty < 0) continue;
      P = getPart(state, k);
      qty = P ? P.qty : 0;
      if (qty > lv.level) continue;
      out.push({ partCode: k, qty: qty, level: lv.level, reorderQty: lv.reorderQty, shortBy: lv.level - qty });
    }
    out.sort(function (a, b) {
      if (a.shortBy !== b.shortBy) return b.shortBy - a.shortBy;
      return a.partCode < b.partCode ? -1 : (a.partCode > b.partCode ? 1 : 0);
    });
    return out;
  }
  function jobUsage(movements, jobId) {
    var reversed = {}, byPart = {}, i, m, rec, codes, rows = [], issued = 0, returned = 0, netValue = 0;
    if (!Array.isArray(movements) || !isStr(jobId) || !jobId) return fail(CODES.INPUT_INVALID);
    for (i = 0; i < movements.length; i++) {
      m = movements[i];
      if (isObj(m) && m.type === 'reversal' && isStr(m.reverses)) reversed[m.reverses] = true;
    }
    for (i = 0; i < movements.length; i++) {
      m = movements[i];
      if (!isObj(m) || (m.type !== 'issue_job' && m.type !== 'return_job')) continue;
      if (!isObj(m.ref) || m.ref.jobId !== jobId || has(reversed, m.id)) continue;
      if (!has(byPart, m.partCode)) {
        byPart[m.partCode] = { partCode: m.partCode, issuedQty: 0, returnedQty: 0, netQty: 0, netValuePaise: 0 };
      }
      rec = byPart[m.partCode];
      if (m.type === 'issue_job') {
        rec.issuedQty += 0 - m.qty;
        rec.netValuePaise += 0 - m.valuePaise;
      } else {
        rec.returnedQty += m.qty;
        rec.netValuePaise -= m.valuePaise;
      }
    }
    codes = Object.keys(byPart).sort();
    for (i = 0; i < codes.length; i++) {
      rec = byPart[codes[i]];
      rec.netQty = rec.issuedQty - rec.returnedQty;
      rec.netValuePaise = zero(rec.netValuePaise);
      issued += rec.issuedQty;
      returned += rec.returnedQty;
      netValue += rec.netValuePaise;
      rows.push(rec);
    }
    return { ok: true, issuedQty: issued, returnedQty: returned, netQty: issued - returned,
      netValuePaise: zero(netValue), byPart: rows };
  }

  // ---------- safety wrappers ----------

  function guard(fn) {
    return function () {
      try {
        return fn.apply(null, arguments);
      } catch (e) {
        return fail(CODES.INTERNAL_ERROR, { error: String(e && e.message) });
      }
    };
  }
  // Plan entry points: the caller's input and ctx are copied once before any check.
  function planGuard(fn) {
    return guard(function (state, input, ctx) {
      return fn(state, snapInput(input), snapCtx(ctx));
    });
  }
  function safe(fn, neutral) {
    return function () {
      try {
        return fn.apply(null, arguments);
      } catch (e) {
        return typeof neutral === 'function' ? neutral() : neutral;
      }
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    MOVEMENT_TYPES: MOVEMENT_TYPES,
    ACTION_POLICY: ACTION_POLICY,
    REASONS_UP: REASONS_UP,
    REASONS_DOWN: REASONS_DOWN,
    CODES: CODES,
    MESSAGES: MESSAGES,
    normalizePartCode: safe(normalizePartCode, ''),
    isIsoInstant: safe(isIsoInstant, false),
    istDate: safe(istDate, ''),
    istDayEndInstant: safe(istDayEndInstant, ''),
    ledgerKeyForAt: safe(ledgerKeyForAt, ''),
    unitCostFromTotal: guard(unitCostFromTotal),
    avgCostPaise: safe(avgCostPaise, null),
    emptyState: emptyState,
    cloneState: safe(cloneState, null),
    authorize: guard(function (ctx, action) { return authorize(snapCtx(ctx), action); }),
    planOpening: planGuard(planOpening),
    planReceipt: planGuard(planReceipt),
    planIssueToJob: planGuard(planIssueToJob),
    planReturnFromJob: planGuard(planReturnFromJob),
    planCounterSale: planGuard(planCounterSale),
    planAdjustment: planGuard(planAdjustment),
    planReversal: planGuard(planReversal),
    previewIssue: guard(previewIssue),
    previewExcessCostPaise: safe(previewExcessCostPaise, null),
    applyMovement: guard(applyMovement),
    replay: guard(replay),
    validateLedger: guard(validateLedger),
    stateAsOf: guard(stateAsOf),
    balances: safe(balances, function () { return []; }),
    partBalance: safe(partBalance, function () { return rowFor(null, ''); }),
    stockValue: safe(stockValue, function () { return { qty: 0, valuePaise: 0, parts: 0 }; }),
    layersForPart: safe(layersForPart, function () { return []; }),
    ledgerForPart: guard(ledgerForPart),
    reorderList: safe(reorderList, function () { return []; }),
    jobUsage: guard(jobUsage),
    exportState: safe(exportState, function () { return { v: 1, lastSeq: 0, lastAt: '', parts: {} }; }),
    canonicalString: safe(canonicalString, '')
  });
});
