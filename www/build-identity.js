/* Single source of truth for the Android package and in-app build identity.
   Keep current evidence values unchanged until an owner-approved phase release
   assigns a new monotonically increasing versionCode. */
(function (root, factory) {
  var identity = factory();
  if (typeof module === 'object' && module.exports) module.exports = identity;
  if (root) root.SaagarBuildIdentity = identity;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return Object.freeze({
    packageId: 'com.saagartraders.bcc',
    appVersion: 'V5.5',
    versionName: '2.9',
    versionCode: 209,
    minSdk: 23
  });
});
