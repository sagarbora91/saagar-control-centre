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
    Object.freeze({ id: 'shell-core-css', version: 6, file: 'shell-core.css', bytes: 49939, sha256: '8c442c540626650c268979a0a979739ce5fe2e6199558efeb641129802c3fefb' }),
    Object.freeze({ id: 'shell-features-css', version: 1, file: 'shell-features.css', bytes: 3299, sha256: '3e1798eec8cd48748880653bd011a549895f7304c9939fd123bfc32d0d9d3e1d' }),
    Object.freeze({ id: 'shell-fonts-css', version: 1, file: 'shell-fonts.css', bytes: 425, sha256: '6eda39319a36eefff030468230db29f57b902c73ab47b3709a93d26964846852' }),
    Object.freeze({ id: 'shell-mobile-css', version: 2, file: 'shell-mobile.css', bytes: 1383, sha256: 'a63c3386a9551d8017b9e49110c04b45ab6b75d229a5d3e78c327da42cd18b2d' }),
    Object.freeze({ id: 'shell-redesign-css', version: 2, file: 'shell-redesign.css', bytes: 13247, sha256: '587e8ae7a5bf86aff7e53bc6dd82558cd7c564519af37307ddfdc1a4f5d1521b' }),
    Object.freeze({ id: 'shell-report-css', version: 1, file: 'shell-report.css', bytes: 8160, sha256: '31f430a062760841768ccccf2ca8771ff88cbe1534d01d8eeb5de504453e9757' }),
    Object.freeze({ id: 'shell-responsive-css', version: 1, file: 'shell-responsive.css', bytes: 5099, sha256: 'e648e41ed16409a684af2b9954d14b8c72cfcaa0a11344487f5309be6a8f1ffa' }),
    Object.freeze({ id: 'shell-responsive-runtime', version: 1, file: 'shared/shell-responsive-runtime.js', bytes: 2826, sha256: '81696184c0e31d9af9895dd92ad2064039a5937d54e44559054f42dbba8f5e8f' })
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
