/* Single source of truth for the Android package and in-app build identity. */
(function (root, factory) {
  var identity = factory();
  if (typeof module === 'object' && module.exports) module.exports = identity;
  if (root) root.SaagarBuildIdentity = identity;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return Object.freeze({
    packageId: 'com.saagartraders.bcc',
    appVersion: 'V 1.601',
    versionName: '1.601',
    versionCode: 601,
    minSdk: 33
  });
});
