(function (root) {
  'use strict';
  if (root.SaagarShellAssetManifest) return;
  var assets = Object.freeze([
    Object.freeze({
      id: 'shell-module-frame-controller',
      version: 1,
      file: 'shared/shell-module-frame-controller.js',
      bytes: 4276,
      sha256: '295819db2ec8cd82266fe8000507b871254f7d33ff17d3ff6491a8700e04691f'
    }),
    Object.freeze({ id: 'shell-core-css', version: 4, file: 'shell-core.css', bytes: 49254, sha256: '4e6aee5dd63a3f60b09afbd4e4e898c9343df4188c4d164cf3d7b500c375b103' }),
    Object.freeze({ id: 'shell-features-css', version: 1, file: 'shell-features.css', bytes: 3299, sha256: '3e1798eec8cd48748880653bd011a549895f7304c9939fd123bfc32d0d9d3e1d' }),
    Object.freeze({ id: 'shell-fonts-css', version: 1, file: 'shell-fonts.css', bytes: 425, sha256: '6eda39319a36eefff030468230db29f57b902c73ab47b3709a93d26964846852' }),
    Object.freeze({ id: 'shell-mobile-css', version: 1, file: 'shell-mobile.css', bytes: 1367, sha256: '15c86e8fef5b23a6edb748138e17e5991f04646aefaef7356f538a5a14cdbb92' }),
    Object.freeze({ id: 'shell-redesign-css', version: 1, file: 'shell-redesign.css', bytes: 13271, sha256: 'ac3f5723b7e8100719ce2eb61788b81459e09319ffa36471aac36f065c54703c' }),
    Object.freeze({ id: 'shell-report-css', version: 1, file: 'shell-report.css', bytes: 8160, sha256: '31f430a062760841768ccccf2ca8771ff88cbe1534d01d8eeb5de504453e9757' })
  ]);
  var api = Object.freeze({
    schemaVersion: 1,
    assets: assets,
    get: function (id) {
      for (var i = 0; i < assets.length; i += 1) if (assets[i].id === String(id)) return assets[i];
      return null;
    }
  });
  Object.defineProperty(root, 'SaagarShellAssetManifest', {
    value: api, enumerable: true, writable: false, configurable: false
  });
})(window);
