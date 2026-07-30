(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarQmsPersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function commit(storage, key, state, auditEntry, maxAudit) {
    var auditLimit = Number.isInteger(maxAudit) && maxAudit > 0 ? maxAudit : 600;
    var currentAudit = Array.isArray(state && state.audit) ? state.audit : [];
    var nextAudit = auditEntry
      ? [auditEntry].concat(currentAudit).slice(0, auditLimit)
      : currentAudit.slice(0, auditLimit);
    var nextState = Object.assign({}, state || {}, { audit: nextAudit });

    try {
      storage.setItem(key, JSON.stringify(nextState));
      state.audit = nextAudit;
      return true;
    } catch (error) {
      return false;
    }
  }

  return Object.freeze({ commit: commit });
});
