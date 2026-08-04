(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarStockVariancePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var STATES = ['open', 'investigating', 'closed'];
  var CAUSES = [
    { id: 'miscount', label: 'Miscount' }, { id: 'unrecorded_sale', label: 'Unrecorded sale' },
    { id: 'unrecorded_transfer', label: 'Unrecorded transfer' }, { id: 'grn_not_posted', label: 'GRN not posted' },
    { id: 'damage_defective', label: 'Damage / defective' }, { id: 'theft', label: 'Theft' },
    { id: 'system_error', label: 'System error' }, { id: 'other', label: 'Other' }
  ];
  var CAUSE_IDS = CAUSES.map(function (c) { return c.id; });
  function text(v) { return typeof v === 'string' ? v.trim() : ''; }
  function finiteNonNegative(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }
  function normaliseTriage(raw, legacyRemark) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var out = {
      state: STATES.indexOf(raw.state) >= 0 ? raw.state : 'open',
      cause: CAUSE_IDS.indexOf(raw.cause) >= 0 ? raw.cause : '',
      note: text(raw.note) || text(legacyRemark), owner: text(raw.owner) || 'Store Manager'
    };
    ['openedAt', 'openedBy', 'updatedAt', 'updatedBy', 'closedAt', 'closedBy'].forEach(function (k) { if (text(raw[k])) out[k] = text(raw[k]); });
    return out;
  }
  function validateTriage(raw) {
    var t = normaliseTriage(raw), errors = [];
    if (t.state === 'closed' && !t.cause) errors.push('Select an approved cause before closing.');
    if (t.state === 'closed' && !t.note) errors.push('Add an evidence note before closing.');
    if (t.cause === 'other' && !t.note) errors.push('Add a note for Other.');
    return { ok: errors.length === 0, errors: errors, value: t };
  }
  function reconcile(leftLabel, leftValue, rightLabel, rightValue) {
    var l = finiteNonNegative(leftValue), r = finiteNonNegative(rightValue);
    if (l === null || r === null) return { status: 'unavailable', delta: null, label: leftLabel + ' vs ' + rightLabel };
    return { status: l === r ? 'match' : 'mismatch', delta: l - r, label: leftLabel + ' vs ' + rightLabel };
  }
  function rankVariances(rows) {
    return (Array.isArray(rows) ? rows : []).filter(function (r) { return r && Number.isFinite(Number(r.variance)) && Number(r.variance) !== 0; })
      .map(function (r) { return { brand: String(r.brand || ''), variance: Number(r.variance), state: STATES.indexOf(r.state) >= 0 ? r.state : 'open' }; })
      .sort(function (a, b) { return Math.abs(b.variance) - Math.abs(a.variance) || a.brand.localeCompare(b.brand); });
  }
  return { STATES: STATES.slice(), CAUSES: CAUSES.map(function (c) { return { id: c.id, label: c.label }; }), DEFAULT_OWNER: 'Store Manager', normaliseTriage: normaliseTriage, validateTriage: validateTriage, reconcile: reconcile, rankVariances: rankVariances };
});
