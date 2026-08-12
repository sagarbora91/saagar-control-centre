import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as auditA3 } from './audit/audits/a3.mjs';
import { buildContext, compareText, sha256 } from './audit/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = 'verification/audit/2026-08-11-113428-b9f04b5/A3-capabilities.json';
export const LEDGER_PATH = 'verification/MODULAR-CAPABILITY-DELTA-LEDGER-2026-08-12.json';

const EXPECTED_STRUCTURAL_ACTION_IDS = Object.freeze([
  'cro_audit:action:st-v5-home-fab:c05eb3ddb3',
  'dsr:action:st-v5-home-fab:c05eb3ddb3',
  'expense:action:audittabbtn:0944957676',
  'expense:action:budgets:1999c2cf05',
  'expense:action:cash-statement:adcac5c7b9',
  'expense:action:cross-module-0:35343ca7ae',
  'expense:action:dashboard:37660361a6',
  'expense:action:ledger:3ffef46fff',
  'expense:action:month-amp-tax:14efede75a',
  'expense:action:petty-cash:7422d00bcb',
  'expense:action:st-v5-home-fab:c05eb3ddb3',
  'expense:action:udhaar-0:e484668ce2',
  'expense:action:vendors:37fabef920',
  'grooming:action:st-v5-home-fab:c05eb3ddb3',
  'leave:action:st-v5-home-fab:c05eb3ddb3',
  'payroll:action:st-v5-home-fab:c05eb3ddb3',
  'planning:action:st-v5-home-fab:c05eb3ddb3',
  'qms:action:st-v5-home-fab:c05eb3ddb3',
  'service:action:st-v5-home-fab:c05eb3ddb3',
  'stock:action:st-v5-home-fab:c05eb3ddb3',
  'tax:action:st-v5-home-fab:c05eb3ddb3'
].sort(compareText));

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
  const currentAudit = await auditA3(buildContext(workspaceRoot));
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
  assert.equal(current.length, 660);
  assert.deepEqual(categoryCounts(baseline), { route: 12, 'visible-action': 469, permission: 22, 'persisted-outcome': 86, 'failure-posture': 66 });
  assert.deepEqual(categoryCounts(current), { route: 12, 'visible-action': 469, permission: 24, 'persisted-outcome': 86, 'failure-posture': 69 });
  assert.equal(count('added'), 12);
  assert.equal(count('removed'), 7);
  assert.equal(count('changed'), 88);
  assert.equal(classCount('handler-body-hash-only'), 52);
  assert.equal(classCount('failure-posture-source-boundary-change'), 14);
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
      changedVisibleActions: 73,
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
