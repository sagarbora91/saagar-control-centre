/* V6 ETP: on-demand loader for the operational chain (owner decision given in chat, 2026-11-12). */
(function (root) {
  'use strict';
  if (root.SaagarEtpChainLoader) return;
  var CHAIN = Object.freeze([
    'etp-operational-foundation.js',
    'etp-operational-store.js',
    'etp-operational-adapters.js',
    'etp-operational-runtime.js',
    'etp-e4-authority-intake.js',
    'etp-e6-authority-intake.js',
    'etp-e5-authority-intake.js',
    'etp-e7-authority-intake.js',
    'etp-e7-service-verifier.js',
    'etp-e7-service-operational.js',
    'etp-cro-reconciliation.js',
    'etp-e3-orchestrator.js',
    'etp-e3-presentation.js',
    'etp-target-planning.js',
    'etp-e4-orchestrator.js',
    'etp-e4-presentation.js',
    'etp-e6-presentation.js',
    'etp-e5-presentation.js',
    'etp-e5-payroll-bridge.js',
    'etp-operational-gateway.js',
    'etp-operational-mount.js',
    'etp-e3-verified-join.js',
    'etp-operational-bootstrap.js',
    'etp-operational-shell-composer.js',
    'etp-incentive-control.js'
  ]);
  var TIMEOUT_MS = 20000;
  var OK = Object.freeze({ ok: true });
  var next = 0, running = null;
  function fail(code) { return Object.freeze({ ok: false, code: code }); }
  function injector() {
    var libs = root.__SaagarPdfLibs;
    return libs && typeof libs.injectEtp === 'function' ? libs.injectEtp : null;
  }
  function staticTagPresent() {
    try { return !!root.document.querySelector('script[src="' + CHAIN[0] + '"]:not([data-saagar-pdf-lib])'); } catch (_) { return false; }
  }
  function step() {
    if (next >= CHAIN.length) return Promise.resolve(OK);
    var inject = injector();
    if (!inject) return Promise.resolve(fail('ETP_CHAIN_LOADER_UNAVAILABLE'));
    return inject(CHAIN[next]).then(function () { next += 1; return step(); }, function () { return fail('ETP_CHAIN_LOAD_FAILED'); });
  }
  function ensure() {
    if (next >= CHAIN.length) return Promise.resolve(OK);
    if (next === 0 && !running && staticTagPresent()) { next = CHAIN.length; return Promise.resolve(OK); }
    if (!running) {
      running = step().then(function (result) { running = null; return result; }, function () { running = null; return fail('ETP_CHAIN_LOAD_FAILED'); });
    }
    var pending = running;
    return new Promise(function (resolve) {
      var timer = root.setTimeout(function () { resolve(fail('ETP_CHAIN_LOAD_TIMEOUT')); }, TIMEOUT_MS);
      pending.then(function (result) { root.clearTimeout(timer); resolve(result); });
    });
  }
  function status() {
    return Object.freeze({ total: CHAIN.length, loaded: next, state: next >= CHAIN.length ? 'ready' : running ? 'loading' : next > 0 ? 'partial' : 'idle' });
  }
  Object.defineProperty(root, 'SaagarEtpChainLoader', {
    value: Object.freeze({ version: 1, ensure: ensure, status: status }), enumerable: true, writable: false, configurable: false
  });
})(typeof window !== 'undefined' ? window : this);
