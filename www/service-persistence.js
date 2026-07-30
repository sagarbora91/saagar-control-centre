(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServicePersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function commit(storage, key, cases) {
    if (!storage || typeof storage.setItem !== 'function' || !Array.isArray(cases)) return false;
    try {
      storage.setItem(key, JSON.stringify(cases));
      return true;
    } catch (error) {
      return false;
    }
  }

  return Object.freeze({ commit: commit });
});
