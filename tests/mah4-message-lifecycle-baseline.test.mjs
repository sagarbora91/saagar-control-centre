import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createMah4Inventory,
  MODULE_TO_SHELL_TYPES,
  SHELL_TO_MODULE_TYPES,
  validateMah4Profile
} from '../scripts/lib/mah4-contract-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = createMah4Inventory(root);

test('MAH-4 frozen inventory matches the exact Stage B product tree', () => {
  const profile = validateMah4Profile(root);
  assert.equal(profile.schemaVersion, 3);
  assert.equal(profile.profileId, inventory.profileId);
  assert.equal(profile.upstream.currentWwwTreeSha256, inventory.upstream.currentWwwTreeSha256);
  assert.equal(inventory.upstream.currentWwwFileCount, 100);
  // +1208 bytes on 2026-08-10: 38 inert `data-action` attributes added to
  // disambiguate conflicting A3-02 capability IDs, plus the refreshed module
  // manifest identities. No behaviour change; file count is unchanged.
  // +135 bytes on 2026-08-10: SEC-08 fail-closed fix at www/index.html:6358 —
  // a throwing authorize() no longer falls through to window.open.
  // +3792 bytes on 2026-08-11: Phase 3 reuses the Slice D keypad for
  // asynchronous, fail-closed one-action reauthentication and awaits every gate.
  // +3292 bytes on 2026-08-11: API-23 native-first storage boot plus the
  // Chrome-44 flex layout fallback and refreshed shell asset identity.
  // +28 bytes on 2026-08-12: behavior-neutral module bridge version-authority
  // rename closes A2-04 while preserving the public version value.
  // +16 bytes on 2026-08-12: Retail ETP import moves from Settings to Reports
  // and gains a stable Reports-owned card identifier.
  // -192 bytes on 2026-08-12: Phase 4 removes the shell evidence popup fallback
  // and the Service direct-print fallback; both routes now fail closed through
  // their controlled delivery gateways.
  // +5671 bytes on 2026-08-12: R003/R013 exception presentation adds bounded,
  // non-revenue report status UI and shared report/shell Marathi and Hindi text.
  // +16807 bytes on 2026-08-12: the second translation batch localizes the
  // remaining shared report and system messages without changing file count.
  // +178037 bytes on 2026-08-15: the owner-approved final Phase 4A review
  // imports 854 exact Marathi/Hindi phrase pairs without changing file count.
  // +2084 bytes on 2026-08-15: Phase 4A rendered remediation establishes
  // deterministic contrast and 44px target floors without changing file count.
  // -91 bytes on 2026-08-16: Payroll's final emblem and print-button gradients
  // become solid high-contrast surfaces for deterministic rendered evidence.
  // +275 bytes on 2026-08-17: app-i18n defers Marathi/Hindi lookup construction
  // until a non-English language is selected; translations remain unchanged.
  assert.equal(inventory.upstream.currentWwwTotalBytes, 7972494);
  assert.equal(inventory.upstream.manifest.moduleCount, 12);
  assert.deepEqual(profile.stageAContractOracle.files.map(file => file.path), [
    'scripts/lib/mah4-protocol-contract.mjs',
    'tests/mah4-protocol-contract.test.mjs'
  ]);
  assert.equal(profile.stageAContractOracle.status, 'non-product-executable-specification');
  assert.equal(profile.stageAContractOracle.runtimeLoaded, false);
  assert.ok(profile.stageAContractOracle.files.every(file => file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)));
});

test('MAH-4 Stage B runtime exposes all five controls beside 15 business messages', () => {
  assert.deepEqual(inventory.protocol.shellToModuleTypes, [...SHELL_TO_MODULE_TYPES]);
  assert.deepEqual(inventory.protocol.moduleToShellTypes, [...MODULE_TO_SHELL_TYPES]);
  assert.deepEqual(inventory.protocol.activeStTypes, [...new Set([...SHELL_TO_MODULE_TYPES, ...MODULE_TO_SHELL_TYPES, 'ST_INIT', 'ST_READY', 'ST_ERROR', 'ST_DISPOSE', 'ST_DISPOSED'])].sort());
  assert.deepEqual(inventory.protocol.lexicalStTokens, [...new Set([
    ...SHELL_TO_MODULE_TYPES,
    ...MODULE_TO_SHELL_TYPES,
    'ST_INIT', 'ST_READY', 'ST_ERROR', 'ST_DISPOSE', 'ST_DISPOSED',
    'ST_BACK',
    'ST_READ_ONLY'
  ])].sort());
});

test('MAH-4 separates direct syntactic, configured, dynamic and accepted send sites', () => {
  assert.equal(inventory.protocol.directEntrySyntacticPostMessageCalls, 46);
  assert.equal(inventory.protocol.directEntryClassifiedProducerCalls, 46);
  assert.equal(inventory.protocol.directEntryConfiguredPostMessageCalls, 46);
  assert.equal(inventory.protocol.directEntrySyntacticWildcardPostMessageCalls, 0);
  assert.equal(inventory.protocol.directEntryConfiguredWildcardPostMessageCalls, 0);
  assert.deepEqual(inventory.protocol.configuredProducerSites.ST_OPEN_MODULE.map(site => site.path), [
    'www/shared/module-runtime.js'
  ]);
  assert.equal(inventory.protocol.dynamicSyntacticPostMessageCalls, 1);
  assert.equal(inventory.protocol.dynamicClassifiedProducerCalls, 1);
  assert.equal(inventory.protocol.dynamicConfiguredPostMessageCalls, 1);
  assert.equal(inventory.protocol.dynamicWildcardPostMessageCalls, 1);
  assert.deepEqual(inventory.protocol.dynamicProducerSites.ST_OPEN_MODULE.map(site => site.path), [
    'www/integration-bridge.js'
  ]);
  assert.equal(inventory.protocol.aggregateSyntacticPostMessageCalls, 47);
  assert.equal(inventory.protocol.aggregateConfiguredPostMessageCalls, 47);
  assert.equal(inventory.protocol.aggregateWildcardPostMessageCalls, 1);
  assert.equal(inventory.protocol.aggregateAcceptedConfiguredPostMessageCalls, 46);
  assert.deepEqual(inventory.protocol.knownRejectedConfiguredRoutes, [{
    type: 'ST_OPEN_MODULE',
    path: 'www/integration-bridge.js',
    reason: 'shell-realm sender fails active-iframe source guard'
  }]);
});

test('MAH-4 resolves direct message assets and listener-local trust posture', () => {
  assert.equal(inventory.protocol.directLanguageReceiver, true);
  assert.deepEqual(inventory.directEntryMessageAssets.map(asset => asset.path), [
    'www/app-i18n.js', 'www/etp-worker-client.js', 'www/shared/mah4-runtime.js', 'www/shared/module-runtime.js'
  ]);
  assert.deepEqual(inventory.dynamicMessageAssets.map(asset => asset.path), [
    'www/integration-bridge.js'
  ]);
  assert.equal(inventory.protocol.mainShellRouterSourceGuard, false);
  assert.equal(inventory.protocol.sqliteAuditSourceGuard, false);
  assert.equal(inventory.protocol.shellOriginCheckPresent, true);
  assert.deepEqual(inventory.protocol.consumerSites.ST_AUDIT.map(site => site.path), ['www/shared/mah4-runtime.js']);
  assert.equal(inventory.protocol.consumerTrust.ST_AUDIT, undefined);
  const mah4RuntimeAsset = inventory.directEntryMessageAssets.find(asset => asset.path === 'www/shared/mah4-runtime.js');
  assert.equal(mah4RuntimeAsset.messages.sourceChecks, 1);
  assert.equal(mah4RuntimeAsset.messages.originChecks, 1);
  assert.deepEqual(inventory.protocol.accessContextSourceGuardModules, []);
  assert.deepEqual(inventory.protocol.unsourcedSharedReceiverTypes, ['ST_LANG']);
});

test('MAH-4 freezes conditional local loaders and persistent iframe hooks separately', () => {
  const dynamic = inventory.scriptDiscovery.dynamicLocal;
  assert.equal(inventory.scriptDiscovery.mode, 'direct-entry-script-tags-plus-explicit-dynamic-local-loader-inventory');
  assert.equal(inventory.scriptDiscovery.directEntryScriptAssetCount, 57);
  assert.equal(inventory.scriptDiscovery.dynamicLocalAssetsInventoried, true);
  assert.equal(dynamic.loaderGroupCount, 5);
  assert.equal(dynamic.scriptRouteCount, 10);
  assert.equal(dynamic.uniqueScriptAssetCount, 9);
  assert.equal(dynamic.scriptLiteralReferenceCount, 12);
  assert.equal(dynamic.resources.length, 10);
  assert.equal(dynamic.totalResourceBytes, 3068524);
  assert.deepEqual(dynamic.directScriptOverlap, []);
  assert.deepEqual(dynamic.injectionSinks, {
    createElementScript: 5,
    documentWriteScript: 2,
    dynamicImport: 0,
    unclassified: 0,
    createElementSites: { 'www/index.html': 4, 'www/saagar-report.js': 1 },
    documentWriteSites: { 'www/index.html': 2 }
  });
  assert.deepEqual(dynamic.resources.find(resource => resource.path === 'www/jszip.min.js').loadedBy, [
    'report-jszip', 'shell-jszip'
  ]);
  assert.deepEqual(inventory.mountLifecycle.iframeLoadHooks, {
    totalSites: 3,
    oneShotSites: 1,
    persistentSites: 2,
    removeLoadListenerSites: 0,
    sites: [
      {
        id: 'shell-open-module', owner: 'www/shared/shell-module-frame-controller.js', sourceKind: 'direct-entry-script',
        once: true, persistent: false, bindGuard: null, perDocumentGuard: null
      },
      {
        id: 'integration-bridge-frame', owner: 'www/integration-bridge.js', sourceKind: 'dynamic-local-script',
        once: false, persistent: true, bindGuard: '__saagarBridgeBound', perDocumentGuard: null
      },
      {
        id: 'whatsapp-share-frame', owner: 'www/whatsapp-share.js', sourceKind: 'direct-entry-script',
        once: false, persistent: true, bindGuard: '__saagarBound', perDocumentGuard: '__saagarPrintHooked'
      }
    ]
  });
});

test('MAH-4 records Service orphan signals outside the active ST protocol', () => {
  assert.ok(Object.hasOwn(inventory.protocol.nonStProducers, '__edit_mode_available'));
  assert.equal(inventory.protocol.nonStProducers.__edit_mode_available[0].path, 'www/modules/service/index.html');
  assert.equal(Object.hasOwn(inventory.protocol.producerSites, '__activate_edit_mode'), false);
  assert.equal(Object.hasOwn(inventory.protocol.producerSites, '__deactivate_edit_mode'), false);
  assert.deepEqual(Object.keys(inventory.protocol.nonStConsumers), [
    '__activate_edit_mode', '__deactivate_edit_mode'
  ]);
  assert.ok(Object.values(inventory.protocol.nonStConsumers).every(sites =>
    sites.length === 1 && sites[0].path === 'www/modules/service/index.html'
  ));
});

test('MAH-4 freezes qualified lifecycle call-site buckets without claiming cleanup', () => {
  const pick = value => ({
    timeouts: value.timeouts,
    intervals: value.intervals,
    mutationObservers: value.mutationObservers,
    eventListeners: value.eventListeners,
    resizeListeners: value.resizeListeners
  });
  assert.deepEqual(pick(inventory.lifecycle.shell), {
    timeouts: 18, intervals: 3, mutationObservers: 0, eventListeners: 15, resizeListeners: 1
  });
  assert.deepEqual(pick(inventory.lifecycle.activeShell), {
    timeouts: 18, intervals: 3, mutationObservers: 0, eventListeners: 15, resizeListeners: 1
  });
  assert.deepEqual(pick(inventory.lifecycle.dormantShell), {
    timeouts: 0, intervals: 0, mutationObservers: 0, eventListeners: 0, resizeListeners: 0
  });
  assert.deepEqual(pick(inventory.lifecycle.uniqueDirectAssetTotals), {
    timeouts: 29, intervals: 2, mutationObservers: 4, eventListeners: 41, resizeListeners: 1
  });
  assert.deepEqual(pick(inventory.lifecycle.configuredEffectiveShell), {
    timeouts: 47, intervals: 5, mutationObservers: 4, eventListeners: 55, resizeListeners: 2
  });
  assert.deepEqual(pick(inventory.lifecycle.moduleTotals), {
    timeouts: 31, intervals: 3, mutationObservers: 0, eventListeners: 47, resizeListeners: 0
  });
  assert.deepEqual(pick(inventory.lifecycle.effectiveModuleTotals), {
    timeouts: 141, intervals: 3, mutationObservers: 33, eventListeners: 274, resizeListeners: 11
  });
  assert.deepEqual(pick(inventory.lifecycle.applicationDynamicTotals), {
    timeouts: 3, intervals: 2, mutationObservers: 0, eventListeners: 5, resizeListeners: 0
  });
  const byId = Object.fromEntries(inventory.lifecycle.modules.map(module => [module.id, module.lifecycle]));
  const effectiveById = Object.fromEntries(inventory.lifecycle.effectiveModules.map(module => [module.id, module.lifecycle]));
  assert.equal(byId.qms.intervals, 2);
  assert.equal(byId.qms.clearIntervals, 0);
  assert.equal(byId.dsr.intervals, 1);
  assert.equal(byId.dsr.clearIntervals, 1);
  assert.equal(effectiveById.qms.mutationObservers, 3);
  assert.equal(effectiveById.dsr.mutationObservers, 3);
});

test('MAH-4 records observable mount facts and keeps implementation gates honest', () => {
  assert.equal(inventory.mountLifecycle.frameLoadHookPresent, true);
  assert.equal(inventory.mountLifecycle.frameErrorHookPresent, true);
  assert.equal(inventory.mountLifecycle.controlHandshakeAbsent, false);
  assert.equal(inventory.mountLifecycle.closeRemovesSrc, true);
  assert.equal(inventory.mountLifecycle.closeBlanksSrcdoc, true);
  assert.equal(inventory.mountLifecycle.dormantFallbackPresent, false);
  assert.equal(inventory.mountLifecycle.manifestRequiresSrc, true);
  assert.equal(inventory.mountLifecycle.manifestContainsHtmlB64, false);
  assert.equal(inventory.mountLifecycle.allProposedControlTypesObserved, true);
  assert.deepEqual(inventory.protocol.proposedControlTypesPresent, ['ST_INIT', 'ST_READY', 'ST_ERROR', 'ST_DISPOSE', 'ST_DISPOSED']);
  assert.equal(inventory.gates.mah3RenderedCasesReviewed, 168);
  assert.equal(inventory.gates.refactorGateReady, true);
  assert.equal(inventory.gates.planningRuntimeWired, true);
  assert.equal(inventory.gates.dsrCanaryPassed, true);
  assert.equal(inventory.gates.qmsCanaryPassed, true);
  assert.equal(inventory.gates.mah4RuntimeImplemented, true);
  assert.equal(inventory.gates.physicalDeviceAccepted, false);
  assert.equal(inventory.gates.nativeLanguageAccepted, false);
  assert.equal(inventory.gates.productionAccepted, false);
});
