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

test('MAH-4 frozen inventory matches the exact MAH-3 product tree', () => {
  const profile = validateMah4Profile(root);
  assert.equal(profile.schemaVersion, 3);
  assert.equal(profile.profileId, inventory.profileId);
  assert.equal(profile.upstream.currentWwwTreeSha256, inventory.upstream.currentWwwTreeSha256);
  assert.equal(inventory.upstream.currentWwwTreeSha256, inventory.upstream.mah3TreeSha256);
  assert.equal(inventory.upstream.currentWwwFileCount, 63);
  assert.equal(inventory.upstream.currentWwwTotalBytes, 7752655);
  assert.equal(inventory.upstream.manifest.moduleCount, 11);
  assert.deepEqual(profile.stageAContractOracle.files.map(file => file.path), [
    'scripts/lib/mah4-protocol-contract.mjs',
    'tests/mah4-protocol-contract.test.mjs'
  ]);
  assert.equal(profile.stageAContractOracle.status, 'non-product-executable-specification');
  assert.equal(profile.stageAContractOracle.runtimeLoaded, false);
  assert.ok(profile.stageAContractOracle.files.every(file => file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)));
});

test('MAH-4 distinguishes 15 active messages from 17 lexical tokens', () => {
  assert.deepEqual(inventory.protocol.shellToModuleTypes, [...SHELL_TO_MODULE_TYPES]);
  assert.deepEqual(inventory.protocol.moduleToShellTypes, [...MODULE_TO_SHELL_TYPES]);
  assert.deepEqual(inventory.protocol.activeStTypes, [...new Set([...SHELL_TO_MODULE_TYPES, ...MODULE_TO_SHELL_TYPES])].sort());
  assert.deepEqual(inventory.protocol.lexicalStTokens, [...new Set([
    ...SHELL_TO_MODULE_TYPES,
    ...MODULE_TO_SHELL_TYPES,
    'ST_BACK',
    'ST_READ_ONLY'
  ])].sort());
});

test('MAH-4 separates direct syntactic, configured, dynamic and accepted send sites', () => {
  assert.equal(inventory.protocol.directEntrySyntacticPostMessageCalls, 74);
  assert.equal(inventory.protocol.directEntryClassifiedProducerCalls, 74);
  assert.equal(inventory.protocol.directEntryConfiguredPostMessageCalls, 68);
  assert.equal(inventory.protocol.directEntrySyntacticWildcardPostMessageCalls, 74);
  assert.equal(inventory.protocol.directEntryConfiguredWildcardPostMessageCalls, 68);
  assert.deepEqual(inventory.protocol.configuredProducerSites.ST_OPEN_MODULE.map(site => site.path), [
    'www/modules/dsr/index.html',
    'www/modules/expense/index.html',
    'www/modules/grooming/index.html',
    'www/modules/qms/index.html',
    'www/modules/service/index.html'
  ]);
  assert.equal(inventory.protocol.dynamicSyntacticPostMessageCalls, 1);
  assert.equal(inventory.protocol.dynamicClassifiedProducerCalls, 1);
  assert.equal(inventory.protocol.dynamicConfiguredPostMessageCalls, 1);
  assert.equal(inventory.protocol.dynamicWildcardPostMessageCalls, 1);
  assert.deepEqual(inventory.protocol.dynamicProducerSites.ST_OPEN_MODULE.map(site => site.path), [
    'www/integration-bridge.js'
  ]);
  assert.equal(inventory.protocol.aggregateSyntacticPostMessageCalls, 75);
  assert.equal(inventory.protocol.aggregateConfiguredPostMessageCalls, 69);
  assert.equal(inventory.protocol.aggregateWildcardPostMessageCalls, 75);
  assert.equal(inventory.protocol.aggregateAcceptedConfiguredPostMessageCalls, 68);
  assert.deepEqual(inventory.protocol.knownRejectedConfiguredRoutes, [{
    type: 'ST_OPEN_MODULE',
    path: 'www/integration-bridge.js',
    reason: 'shell-realm sender fails active-iframe source guard'
  }]);
});

test('MAH-4 resolves direct message assets and listener-local trust posture', () => {
  assert.equal(inventory.protocol.directLanguageReceiver, true);
  assert.deepEqual(inventory.directEntryMessageAssets.map(asset => asset.path), [
    'www/app-i18n.js', 'www/sqlite-store.js'
  ]);
  assert.deepEqual(inventory.dynamicMessageAssets.map(asset => asset.path), [
    'www/integration-bridge.js'
  ]);
  assert.equal(inventory.protocol.mainShellRouterSourceGuard, true);
  assert.equal(inventory.protocol.sqliteAuditSourceGuard, false);
  assert.equal(inventory.protocol.shellOriginCheckPresent, false);
  assert.deepEqual(inventory.protocol.consumerSites.ST_AUDIT.map(site => site.path), [
    'www/index.html', 'www/sqlite-store.js'
  ]);
  assert.deepEqual(inventory.protocol.consumerTrust.ST_AUDIT, [
    { path: 'www/index.html', sourceGuard: true, originGuard: false },
    { path: 'www/sqlite-store.js', sourceGuard: false, originGuard: false }
  ]);
  assert.deepEqual(inventory.protocol.accessContextSourceGuardModules, ['stock', 'service', 'dsr', 'expense']);
  assert.deepEqual(inventory.protocol.unsourcedSharedReceiverTypes, [
    'ST_LANG', 'ST_OPEN_FEATURE', 'ST_SET_DATE', 'ST_UI_MODE', 'ST_WA_SENT'
  ]);
});

test('MAH-4 freezes conditional local loaders and persistent iframe hooks separately', () => {
  const dynamic = inventory.scriptDiscovery.dynamicLocal;
  assert.equal(inventory.scriptDiscovery.mode, 'direct-entry-script-tags-plus-explicit-dynamic-local-loader-inventory');
  assert.equal(inventory.scriptDiscovery.directEntryScriptAssetCount, 33);
  assert.equal(inventory.scriptDiscovery.dynamicLocalAssetsInventoried, true);
  assert.equal(dynamic.loaderGroupCount, 5);
  assert.equal(dynamic.scriptRouteCount, 10);
  assert.equal(dynamic.uniqueScriptAssetCount, 9);
  assert.equal(dynamic.scriptLiteralReferenceCount, 12);
  assert.equal(dynamic.resources.length, 10);
  assert.equal(dynamic.totalResourceBytes, 3070778);
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
        id: 'shell-open-module', owner: 'www/index.html', sourceKind: 'active-inline',
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
    timeouts: 28, intervals: 2, mutationObservers: 2, eventListeners: 29, resizeListeners: 2
  });
  assert.deepEqual(pick(inventory.lifecycle.activeShell), {
    timeouts: 21, intervals: 2, mutationObservers: 0, eventListeners: 16, resizeListeners: 1
  });
  assert.deepEqual(pick(inventory.lifecycle.dormantShell), {
    timeouts: 7, intervals: 0, mutationObservers: 2, eventListeners: 13, resizeListeners: 1
  });
  assert.deepEqual(pick(inventory.lifecycle.uniqueDirectAssetTotals), {
    timeouts: 15, intervals: 2, mutationObservers: 2, eventListeners: 19, resizeListeners: 0
  });
  assert.deepEqual(pick(inventory.lifecycle.configuredEffectiveShell), {
    timeouts: 36, intervals: 4, mutationObservers: 2, eventListeners: 34, resizeListeners: 1
  });
  assert.deepEqual(pick(inventory.lifecycle.moduleTotals), {
    timeouts: 110, intervals: 3, mutationObservers: 22, eventListeners: 183, resizeListeners: 11
  });
  assert.deepEqual(pick(inventory.lifecycle.effectiveModuleTotals), {
    timeouts: 121, intervals: 3, mutationObservers: 33, eventListeners: 223, resizeListeners: 11
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
  assert.equal(inventory.mountLifecycle.controlHandshakeAbsent, true);
  assert.equal(inventory.mountLifecycle.closeRemovesSrc, true);
  assert.equal(inventory.mountLifecycle.closeBlanksSrcdoc, true);
  assert.equal(inventory.mountLifecycle.dormantFallbackPresent, true);
  assert.equal(inventory.mountLifecycle.manifestRequiresSrc, true);
  assert.equal(inventory.mountLifecycle.manifestContainsHtmlB64, false);
  assert.equal(inventory.mountLifecycle.allProposedControlTypesObserved, false);
  assert.deepEqual(inventory.protocol.proposedControlTypesPresent, []);
  assert.equal(inventory.gates.mah3RenderedCasesReviewed, 0);
  assert.equal(inventory.gates.refactorGateReady, false);
  assert.equal(inventory.gates.mah4RuntimeImplemented, false);
  assert.equal(inventory.gates.physicalDeviceAccepted, false);
  assert.equal(inventory.gates.nativeLanguageAccepted, false);
  assert.equal(inventory.gates.productionAccepted, false);
});
