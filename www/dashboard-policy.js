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

  return {
    moduleVisible,
    actionModuleId,
    filterModuleItems
  };
});
