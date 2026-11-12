(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarDashboardPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function moduleVisible(moduleId, isAdmin, accessRow) {
    if (!moduleId) return true;
    if (isAdmin) return true;
    return !!(accessRow && accessRow[moduleId] === true);
  }

  function actionModuleId(action) {
    const match = String(action || '')
      .match(/(?:openModule|navigateToModule)\(['"]([^'"]+)['"]\)/);
    return match ? match[1] : '';
  }

  function filterModuleItems(items, moduleOf, isAdmin, accessRow) {
    const list = Array.isArray(items) ? items : [];
    const identify = typeof moduleOf === 'function' ? moduleOf : item => item && item.moduleId;
    return list.filter(item => moduleVisible(identify(item), isAdmin, accessRow));
  }

  var PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/, GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function isPan(v) { return PAN_RE.test(up(v)); }
  function isGstin(v) { return GSTIN_RE.test(up(v)); }
  function normMobile(v) {
    var m = String(v == null ? '' : v).replace(/[\s-]/g, '').replace(/^(?:\+?91|0)(?=\d{10}$)/, '');
    return /^[6-9]\d{9}$/.test(m) ? m : '';
  }
  function stableEmpId(seed) {
    var t = String(seed).toLowerCase(), h = 5381, i;
    for (i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return 'emp_s' + h.toString(36) + '_' + t.length.toString(36);
  }
  function ledgerDay(list, dateIso, income) {
    return (Array.isArray(list) ? list : []).filter(function (e) {
      return e && !e.void && ((String(e.type || 'expense').toLowerCase() === 'income') === !!income) &&
        String(e.date || e.entryDate || e.expenseDate || '').slice(0, 10) === dateIso;
    });
  }
  function sumAmount(rows) {
    return (rows || []).reduce(function (s, e) { return s + (Number(e.amount || e.total || 0) || 0); }, 0);
  }
  function payrollSummary(p) {
    p = p || {};
    var meta = p.meta || {}, gross = 0, net = 0;
    var rows = (Array.isArray(p.rows) ? p.rows : []).filter(function (r) { return r && r.active !== false; });
    var run = p.runs && p.runs[String(meta.month) + '-' + (Number(meta.year) || 0)];
    rows.forEach(function (r) {
      gross += Number(r.gross != null ? r.gross : (r.grossPay != null ? r.grossPay : r.salaryAmount)) || 0;
      net += Number(r.net != null ? r.net : (r.netPay != null ? r.netPay : r.payable)) || 0;
    });
    return { month: meta.month || '', year: meta.year || '', status: (run && run.status) || 'draft', firm: meta.firmName || '', headcount: rows.length, gross: gross, net: net };
  }
  function warrantyDue(cases, soonIso) {
    var n = 0;
    (Array.isArray(cases) ? cases : []).forEach(function (c) {
      var fu = c && Array.isArray(c.followUps) ? c.followUps : [];
      fu.forEach(function (f) {
        if (!f || f.auto !== 'warranty' || !f.dueDate || f.dueDate > soonIso || f.done) return;
        var closed = fu.some(function (g) {
          return g && g !== f && g.auto !== 'warranty' && g.outcome === 'Resolved' && String(g.createdAt || '') >= String(f.createdAt || '');
        });
        if (!closed) n++;
      });
    });
    return n;
  }
  function validateOrg(o) {
    var seen = {}, err = '';
    function chk(rows, kind) {
      (rows || []).forEach(function (r, i) {
        if (err || !r) return;
        var code = up(r.code), nm = String(r.name || '').trim(), w = kind + ' ' + (i + 1);
        if (!code) { err = w + ': code is required.'; return; }
        if (!nm) { err = w + ' (' + code + '): name is required.'; return; }
        if (seen[kind + code]) { err = w + ': code ' + code + ' is used twice.'; return; }
        seen[kind + code] = 1;
        if (kind === 'Firm') {
          if (String(r.pan || '').trim() && !isPan(r.pan)) err = w + ' (' + code + '): PAN must look like ABCDE1234F.';
          else if (String(r.gstin || '').trim() && !isGstin(r.gstin)) err = w + ' (' + code + '): GSTIN must be 15 characters, like 27ABCDE1234F1Z5.';
        }
      });
    }
    chk(o && o.firms, 'Firm'); chk(o && o.branches, 'Branch');
    return err;
  }
  function masterError(name, obj) {
    obj = obj || {};
    if (name === 'vendors' && obj.gstin && !isGstin(obj.gstin)) return 'GSTIN must be 15 characters, like 27ABCDE1234F1Z5 (or leave it blank).';
    if (name === 'customers' && obj.mobile && !normMobile(obj.mobile)) return 'Mobile must be 10 digits starting 6 to 9 (or leave it blank).';
    return '';
  }
  var REPORT_CARD_MODULES = [['business today', ['qms']], ['day snapshot', []], ['queue', ['qms']], ['staff register', ['dsr']], ['stock', ['stock']], ['grooming', ['grooming']], ['cash sheet', ['expense']], ['on leave', ['leave']], ['employee performance', ['grooming', 'service', 'expense']], ['payroll', ['payroll']], ['expense', ['expense']], ['cro audit', ['cro_audit']], ['service', ['service']], ['tax', ['tax']]];
  function reportCardVisible(title, isVisible, isAdmin) {
    if (isAdmin) return true;
    var t = String(title || '').toLowerCase(), i;
    for (i = 0; i < REPORT_CARD_MODULES.length; i++) {
      if (t.indexOf(REPORT_CARD_MODULES[i][0]) >= 0) return REPORT_CARD_MODULES[i][1].every(function (m) { return isVisible(m); });
    }
    return false;
  }

  return {
    moduleVisible,
    actionModuleId,
    filterModuleItems,
    isPan,
    isGstin,
    normMobile,
    stableEmpId,
    ledgerDay,
    sumAmount,
    payrollSummary,
    warrantyDue,
    validateOrg,
    masterError,
    reportCardVisible
  };
});
