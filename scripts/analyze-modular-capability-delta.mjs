import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as auditA3 } from './audit/audits/a3.mjs';
import { buildContext, compareText, sha256 } from './audit/lib.mjs';
import {
  LEGACY_ASSET,
  LEGACY_MODULE_ALLOWLIST,
  restoreMigratedLegacySource
} from './prepare-phase6c-mobile-legacy-css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = 'verification/audit/2026-08-11-113428-b9f04b5/A3-capabilities.json';
export const LEDGER_PATH = 'verification/MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json';

/* Owner-approved 2026-08-22; see verification/audit/approvals/ETP-CAPABILITY-DELTA-APPROVAL-2026-08-22.json */
const APPROVED_ETP_DELTA_IDS = Object.freeze(new Set([
  "etp:action:etpimportform:1953c5a58d",
  "etp:action:etpvalidate:b07d709f31",
  "etp:action:etpconfirm:4d548862d9",
  "etp:action:etpcoverageconfirmed:696a80d1fc",
  "etp:action:etphistoryrefresh:04874c0f68",
  "etp:action:tab-import:072653f2e1",
  "etp:action:tab-coverage:3ecf856d2c",
  "etp:action:tab-reconciliation:2b8b192693",
  "etp:action:tab-verified:0711690845",
  "etp:action:refresh-verified-views:df04d92f87",
  "etp:action:refresh-exceptions:47fdf2b89f",
  "etp:action:loading-published-scopes:10e05bdcbf",
  "etp:action:loading-published-scopes:f833acd821",
  "etp:route:entry",
]));

const EXPECTED_STRUCTURAL_ACTION_IDS = Object.freeze([
  'dsr:action:st-v5-home-fab:c05eb3ddb3',
  'qms:action:st-v5-home-fab:c05eb3ddb3',
  'tax:action:st-v5-home-fab:c05eb3ddb3'
].sort(compareText));

const PHASE6B_IDENTITY_SURFACES = Object.freeze(new Set([
  'cro_audit', 'dsr', 'etp', 'expense', 'grooming', 'leave', 'payroll', 'planning',
  'qms', 'service', 'shell', 'stock', 'tax'
]));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText)
    .filter(key => value[key] !== undefined)
    .map(key => [key, stableValue(value[key])]));
}

function stableSha256(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

function check(audit, id) {
  const result = audit.checks.find(item => item.id === id);
  assert.ok(result, `${id} is missing`);
  return result;
}

function comparisonValue(capability) {
  return stableValue({ category: capability.category, surface: capability.surface, outcome: capability.outcome });
}

function withoutHandlerBodyHashes(value) {
  if (Array.isArray(value)) return value.map(withoutHandlerBodyHashes);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'bodySha256')
    .map(([key, item]) => [key, withoutHandlerBodyHashes(item)]));
}

function actionBindingSummary(capability) {
  const bindings = capability?.outcome?.bindings || [];
  return {
    bindings: bindings.length,
    expressionSha256: [...new Set(bindings.map(item => item.expressionSha256).filter(Boolean))].sort(compareText),
    handlerNames: [...new Set(bindings.flatMap(item => item.referencedHandlers || []).map(item => item.name))].sort(compareText),
    referencedHandlerBodies: bindings.flatMap(item => item.referencedHandlers || []).length
  };
}

function classification(change, before, after) {
  const capability = after || before;
  if ((change === 'added' || change === 'removed') && capability.category === 'visible-action' &&
      PHASE6B_IDENTITY_SURFACES.has(String(capability.surface || '').split(':')[0])) {
    return {
      reviewClass: 'phase6b-stable-identity-annotation',
      reason: 'Phase 6B replaced an analyser-inferred control identity with a stable semantic identity; the module-specific restoration test removes only the annotation and reproduces the frozen pre-annotation bytes.'
    };
  }
  /* Retail ETP became the twelfth modular module. The exact deltas below are
     owner-approved in verification/audit/approvals/ETP-CAPABILITY-DELTA-APPROVAL-2026-08-22.json
     (package SHA-256 cf0b9085...). Anything outside these exact ids stays
     unclassified and fail-closed. */
  if (change === 'added' && APPROVED_ETP_DELTA_IDS.has(capability.capabilityId)) {
    return {
      reviewClass: 'etp-twelfth-module-capability-owner-approved',
      reason: 'New Retail ETP module capability, owner-approved 2026-08-22 as part of the exact 17-delta set.'
    };
  }
  if (change === 'added' && capability.capabilityId ===
    'script-etp-module-gateway:permission:reauthentication') {
    return {
      reviewClass: 'bounded-etp-reauthentication-authority',
      reason: 'The fixed gateway now exposes its explicit action-bound reauthentication contract to the frozen analyser; final owner approval remains identity-bound.'
    };
  }
  if (change === 'added' && capability.capabilityId === 'etp:action:st-v5-home-fab:c05eb3ddb3') {
    return {
      reviewClass: 'shared-runtime-home-fab-binding',
      reason: 'Structural back-to-home control restored to the ETP module; identical stable binding hash to the home-FAB already present in every other module.'
    };
  }
  if (capability.capabilityId === 'shell:action:open-retail-etp:60a39c8e5d' && change === 'added') {
    return {
      reviewClass: 'etp-shell-route-relocation',
      reason: 'ETP entry moved from a direct shell button to the Reports-owned module route; owner-approved 2026-08-22.'
    };
  }
  if (capability.capabilityId === 'shell:action:open-etp-import:8cb1d3b022' && change === 'removed') {
    return {
      reviewClass: 'etp-shell-route-relocation',
      reason: 'The legacy direct ETP import button was retired by the same approved relocation.'
    };
  }
  if (change === 'added' && capability.category === 'permission' && capability.surface.startsWith('script-shared-')) {
    return {
      reviewClass: 'shared-permission-authority-extraction',
      reason: 'Existing owner-session or reauthentication authority moved from module-local code to a shared runtime boundary.'
    };
  }
  if (change === 'added' && capability.category === 'permission') {
    return {
      reviewClass: 'declared-module-access-context',
      reason: 'The module now exposes its existing shared-stage access-context participation to the frozen analyser.'
    };
  }
  if (change === 'added' && capability.category === 'failure-posture') {
    return {
      reviewClass: 'extracted-first-party-failure-surface',
      reason: 'A newly extracted first-party JavaScript boundary now has its own measured failure-posture surface.'
    };
  }
  if (change === 'removed' && capability.category === 'permission') {
    return {
      reviewClass: 'module-permission-authority-relocation',
      reason: 'The module-local authority attribution disappeared when the access or reauthentication decision moved behind the shared bridge/runtime.'
    };
  }
  if (change === 'changed' && capability.category === 'visible-action') {
    const bodyAgnosticBefore = stableValue(withoutHandlerBodyHashes(comparisonValue(before)));
    const bodyAgnosticAfter = stableValue(withoutHandlerBodyHashes(comparisonValue(after)));
    if (JSON.stringify(bodyAgnosticBefore) === JSON.stringify(bodyAgnosticAfter)) {
      return {
        reviewClass: 'handler-body-hash-only',
        reason: 'The stable visible-action binding is unchanged; only the referenced handler implementation hash changed during extraction.'
      };
    }
    if (capability.capabilityId.includes(':action:st-v5-home-fab:')) {
      return {
        reviewClass: 'retired-duplicate-injection-binding',
        reason: 'Retiring duplicated module injection removed repeated home-FAB bindings while preserving the stable action ID and destination expression.'
      };
    }
    return {
      reviewClass: 'reduced-ambiguous-go-handler-set',
      reason: 'Shared delivery removed duplicate ambiguous go() handler bodies while preserving the stable Expense navigation action ID and expression.'
    };
  }
  if (change === 'changed' && capability.category === 'failure-posture') {
    if (capability.capabilityId === 'script-etp-import-ui:failure:posture' &&
      before?.outcome?.explicitFallbackSites === 0 && after?.outcome?.explicitFallbackSites === 1 &&
      before?.outcome?.catchBlocks === after?.outcome?.catchBlocks &&
      before?.outcome?.swallowedCatchBlocks === after?.outcome?.swallowedCatchBlocks &&
      before?.outcome?.throwSites === after?.outcome?.throwSites &&
      before?.outcome?.userVisibleErrorSites === after?.outcome?.userVisibleErrorSites) {
      return {
        reviewClass: 'report-presentation-enrichment-fallback-added',
        reason: 'R003/R013 exception presentation now reads validated enrichments from the receipt or reconciliation result, adding one explicit data-source fallback without changing catch, throw or user-visible-error sites.'
      };
    }
    return {
      reviewClass: 'failure-posture-source-boundary-change',
      reason: 'Catch, throw, visible-error or fallback sites moved as logic was extracted across module and shared-script boundaries.'
    };
  }
  throw new Error(`UNCLASSIFIED_CAPABILITY_DELTA:${capability.capabilityId}:${change}`);
}

function categoryCounts(inventory) {
  return Object.fromEntries(['route', 'visible-action', 'permission', 'persisted-outcome', 'failure-posture']
    .map(category => [category, inventory.filter(item => item.category === category).length]));
}

export async function buildCapabilityDeltaLedger(workspaceRoot = root) {
  const baselineAudit = JSON.parse(fs.readFileSync(path.join(workspaceRoot, BASELINE_PATH), 'utf8'));
  const rawContext = buildContext(workspaceRoot);
  const authority = rawContext.read(`www/${LEGACY_ASSET}`);
  const legacyByFile = new Map(LEGACY_MODULE_ALLOWLIST.map(moduleId =>
    [`www/modules/${moduleId}/index.html`, moduleId]));
  const normalize = (file, source) => legacyByFile.has(file)
    ? restoreMigratedLegacySource(legacyByFile.get(file), source, authority)
    : source;
  const currentContext = Object.freeze({
    ...rawContext,
    modules: rawContext.modules.map(module => Object.freeze({
      ...module,
      html: normalize(module.file, module.html)
    })),
    read: file => normalize(file, rawContext.read(file))
  });
  const currentAudit = await auditA3(currentContext);
  const baselineCheck = check(baselineAudit, 'A3-02');
  const currentCheck = check(currentAudit, 'A3-02');
  const baseline = baselineCheck.metric.inventory;
  const current = currentCheck.metric.inventory;
  const before = new Map(baseline.map(item => [item.capabilityId, item]));
  const after = new Map(current.map(item => [item.capabilityId, item]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort(compareText);
  const deltas = [];

  for (const capabilityId of ids) {
    const left = before.get(capabilityId);
    const right = after.get(capabilityId);
    let change = '';
    if (!left) change = 'added';
    else if (!right) change = 'removed';
    else if (JSON.stringify(comparisonValue(left)) !== JSON.stringify(comparisonValue(right))) change = 'changed';
    if (!change) continue;
    const review = classification(change, left, right);
    deltas.push(stableValue({
      capabilityId,
      change,
      category: (right || left).category,
      reviewClass: review.reviewClass,
      reason: review.reason,
      ownerApproval: 'pending',
      baseline: left ? comparisonValue(left) : null,
      current: right ? comparisonValue(right) : null,
      baselineOutcomeSha256: left ? stableSha256(comparisonValue(left)) : null,
      currentOutcomeSha256: right ? stableSha256(comparisonValue(right)) : null,
      bindingReview: (right || left).category === 'visible-action' ? {
        baseline: actionBindingSummary(left), current: actionBindingSummary(right)
      } : undefined
    }));
  }

  const count = change => deltas.filter(item => item.change === change).length;
  const classCount = reviewClass => deltas.filter(item => item.reviewClass === reviewClass).length;
  const structuralIds = deltas.filter(item => item.change === 'changed' && item.category === 'visible-action' &&
    item.reviewClass !== 'handler-body-hash-only').map(item => item.capabilityId).sort(compareText);

  assert.equal(baseline.length, 655);
  assert.equal(current.length, 687);
  assert.deepEqual(categoryCounts(baseline), { route: 12, 'visible-action': 469, permission: 22, 'persisted-outcome': 86, 'failure-posture': 66 });
  assert.deepEqual(categoryCounts(current), { route: 13, 'visible-action': 484, permission: 27, 'persisted-outcome': 86, 'failure-posture': 77 });
  assert.equal(count('added'), 382);
  assert.equal(count('removed'), 350);
  assert.equal(count('changed'), 37);
  assert.equal(classCount('handler-body-hash-only'), 18);
  assert.equal(classCount('failure-posture-source-boundary-change'), 15);
  assert.equal(classCount('report-presentation-enrichment-fallback-added'), 1);
  assert.deepEqual(structuralIds, EXPECTED_STRUCTURAL_ACTION_IDS);
  assert.equal(currentCheck.metric.conflictingIds, 0);

  const comparisonDeltas = deltas.map(({ capabilityId, change }) => ({ capabilityId, change }));
  return stableValue({
    format: 'SAAGAR_MODULAR_CAPABILITY_DELTA_REVIEW',
    schemaVersion: 1,
    approvalStatus: 'pending-owner-approval',
    frozenAnalyserRestoration: {
      status: 'complete',
      reason: 'Removed the candidate-only access-context suppression so current A3 uses the Gate 0 analyser semantics.'
    },
    baseline: {
      auditArtifact: BASELINE_PATH,
      capabilities: baseline.length,
      conflicts: baselineCheck.metric.conflictingIds,
      categories: categoryCounts(baseline),
      inventorySha256: baselineCheck.metric.inventorySha256
    },
    current: {
      capabilities: current.length,
      conflicts: currentCheck.metric.conflictingIds,
      categories: categoryCounts(current),
      inventorySha256: currentCheck.metric.inventorySha256
    },
    summary: {
      added: count('added'),
      removed: count('removed'),
      changed: count('changed'),
      netCapabilities: current.length - baseline.length,
      capabilityApprovalsRequired: deltas.length,
      changedVisibleActions: deltas.filter(item => item.change === 'changed' && item.category === 'visible-action').length,
      handlerBodyHashOnly: classCount('handler-body-hash-only'),
      bindingStructureChanged: structuralIds.length,
      changedFailurePostures: deltas.filter(item => item.change === 'changed' && item.category === 'failure-posture').length,
      reportPresentationFallbacks: classCount('report-presentation-enrichment-fallback-added'),
      comparisonDeltaSha256: stableSha256(comparisonDeltas)
    },
    deltas
  });
}

async function main() {
  const ledger = await buildCapabilityDeltaLedger();
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(root, LEDGER_PATH), serialized);
    process.stdout.write(`${LEDGER_PATH}\n`);
  } else process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
