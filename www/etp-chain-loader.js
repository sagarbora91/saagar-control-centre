/* V6 ETP: on-demand loader for the operational chain (owner decision given in chat, 2026-11-12).
   The four ETP bridge files load through the same injector, in their own small group, the first time the Engine pack screen asks the bridge. */
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
  var BRIDGE = Object.freeze(['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js']);
  var BRIDGE_NAMES = Object.freeze(['SaagarEtpBridgeTrust', 'SaagarEtpBridgePackVerifier', 'SaagarEtpBridgeCompare', 'SaagarEtpBridgeFacade']);
  var TIMEOUT_MS = 20000;
  var OK = Object.freeze({ ok: true });
  var BRIDGE_OFF = Object.freeze({ ok: false, code: 'ETP_BRIDGE_UNAVAILABLE' });
  var BRIDGE_NONE = Object.freeze({ ok: true, state: 'DISCARDED' });
  var chain = { list: CHAIN, names: null, next: 0, running: null };
  var bridge = { list: BRIDGE, names: BRIDGE_NAMES, next: 0, running: null };
  function fail(code) { return Object.freeze({ ok: false, code: code }); }
  function injector() {
    var libs = root.__SaagarPdfLibs;
    return libs && typeof libs.injectEtp === 'function' ? libs.injectEtp : null;
  }
  function staticTagPresent(group) {
    try { return !!root.document.querySelector('script[src="' + group.list[0] + '"]:not([data-saagar-pdf-lib])'); } catch (_) { return false; }
  }
  function taken(group) {
    return !!group.names && Object.prototype.hasOwnProperty.call(root, group.names[group.next]);
  }
  function step(group) {
    if (group.next >= group.list.length) return Promise.resolve(OK);
    var inject = injector();
    if (!inject) return Promise.resolve(fail('ETP_CHAIN_LOADER_UNAVAILABLE'));
    if (taken(group)) return Promise.resolve(fail('ETP_CHAIN_GLOBAL_TAKEN'));
    return inject(group.list[group.next]).then(function () { group.next += 1; return step(group); }, function () { return fail('ETP_CHAIN_LOAD_FAILED'); });
  }
  function ensureGroup(group) {
    if (group.next >= group.list.length) return Promise.resolve(OK);
    if (group.next === 0 && !group.running && staticTagPresent(group)) { group.next = group.list.length; return Promise.resolve(OK); }
    if (!group.running) {
      group.running = step(group).then(function (result) { group.running = null; return result; }, function () { group.running = null; return fail('ETP_CHAIN_LOAD_FAILED'); });
    }
    var pending = group.running;
    return new Promise(function (resolve) {
      var timer = root.setTimeout(function () { resolve(fail('ETP_CHAIN_LOAD_TIMEOUT')); }, TIMEOUT_MS);
      pending.then(function (result) { root.clearTimeout(timer); resolve(result); });
    });
  }
  function ensure() { return ensureGroup(chain); }
  function status() {
    return Object.freeze({ total: CHAIN.length, loaded: chain.next, state: chain.next >= CHAIN.length ? 'ready' : chain.running ? 'loading' : chain.next > 0 ? 'partial' : 'idle' });
  }
  /* The facade is used only when it is the locked, frozen global the bridge file defines. Anything else counts as closed. */
  function realBridge() {
    var found = Object.getOwnPropertyDescriptor(root, 'SaagarEtpBridgeFacade'), value = found && found.value;
    var good = !!found && found.writable === false && found.configurable === false && !!value && Object(value) === value && typeof value !== 'function' && Object.isFrozen(value) &&
      typeof value.status === 'function' && typeof value.stage === 'function' && typeof value.compare === 'function' && typeof value.discard === 'function';
    return good ? value : void 0;
  }
  function viaBridge(name, request) {
    return ensureGroup(bridge).then(function (made) {
      var real = made && made.ok === true ? realBridge() : void 0;
      return real ? real[name](request) : BRIDGE_OFF;
    }, function () { return BRIDGE_OFF; });
  }
  /* Stand-in the ETP module reaches before the bridge files are loaded: it loads them, then hands every call to the real facade, and answers closed when it cannot. */
  var bridgeGateway = Object.freeze({
    status: function (request) { return viaBridge('status', request); },
    stage: function (request) { return viaBridge('stage', request); },
    compare: function (request) { return viaBridge('compare', request); },
    discard: function (request) { var real = realBridge(); return real ? real.discard(request) : Promise.resolve(BRIDGE_NONE); }
  });
  Object.defineProperty(root, 'SaagarEtpChainLoader', {
    value: Object.freeze({ version: 1, ensure: ensure, status: status, bridge: bridgeGateway }), enumerable: true, writable: false, configurable: false
  });
})(typeof window !== 'undefined' ? window : this);
