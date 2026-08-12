import { compareText, stableSha256, stableValue } from './lib.mjs';

export const COMPARISON_APPROVAL_FORMAT = 'SAAGAR_AUDIT_COMPARISON_APPROVALS';

const CHECK_ID = /^A(?:[1-9]|10|11)-\d{2}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const HIGH_SEVERITIES = new Set(['P0', 'P1']);
const SEVERITY_RANK = Object.freeze({ P1: 1, P0: 2 });
const ISSUE_METRIC = /(?:bypass|conflict|duplicate|error|exposure|fail|gap|invalid|malformed|mismatch|missing|stale|unclassified|undeclared|undetected|unprotected|unregistered|unsafe|untested|violation|directReference)/i;

function checkMap(audits) {
  const result = new Map();
  for (const audit of audits || []) for (const check of audit.checks || []) result.set(check.id, check);
  return result;
}

function gate(id, title, result, metric, evidence = [], mandatory = true) {
  return { id, title, result, mandatory, metric, evidence: evidence.slice(0, 200) };
}

export function comparisonFindingSha256(check) {
  return stableSha256({ id: check && check.id, result: check && check.result,
    severity: check && check.severity, metric: check && check.metric,
    evidence: check && check.evidence });
}

function nonEmpty(value, maximum = 1000) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum;
}

function capabilityInventory(checks) {
  const value = checks.get('A3-02');
  return value && value.metric && Array.isArray(value.metric.inventory) ? value.metric.inventory : null;
}

function capabilityDeltas(baseline, current) {
  if (!baseline || !current) return null;
  const before = new Map(baseline.map(item => [item.capabilityId, item]));
  const after = new Map(current.map(item => [item.capabilityId, item]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort(compareText);
  const rows = [];
  for (const capabilityId of ids) {
    if (!before.has(capabilityId)) rows.push({ capabilityId, change: 'added' });
    else if (!after.has(capabilityId)) rows.push({ capabilityId, change: 'removed' });
    else {
      const left = stableValue({ category: before.get(capabilityId).category,
        surface: before.get(capabilityId).surface, outcome: before.get(capabilityId).outcome });
      const right = stableValue({ category: after.get(capabilityId).category,
        surface: after.get(capabilityId).surface, outcome: after.get(capabilityId).outcome });
      if (JSON.stringify(left) !== JSON.stringify(right)) rows.push({ capabilityId, change: 'changed' });
    }
  }
  return rows;
}

const STORAGE_CONTRACT_KEYS = Object.freeze(['artifactId', 'classification', 'evidenceArtifact', 'kind', 'name',
  'operations', 'owner', 'pattern', 'reset', 'restore', 'unresolved']);

function storageContract(checks) {
  const check = checks.get('A4-01');
  const metric = check && check.metric;
  const inventory = metric && metric.inventory;
  if (!check || check.result !== 'pass' || check.mandatory !== true || !metric ||
      metric.inventoryComplete !== true || !Array.isArray(inventory)) {
    return { valid: false, inventory: null, reason: 'STORAGE_CONTRACT_INVENTORY_UNAVAILABLE' };
  }
  if (!Number.isSafeInteger(metric.artifacts) || metric.artifacts <= 0 || metric.artifacts !== inventory.length ||
      !Number.isSafeInteger(metric.artifactLimit) || metric.artifactLimit < inventory.length ||
      !HEX_64.test(String(metric.inventorySha256 || '')) ||
      metric.inventorySha256 !== stableSha256(inventory)) {
    return { valid: false, inventory: null, reason: 'STORAGE_CONTRACT_INVENTORY_TRUNCATED' };
  }
  let previous = '';
  for (const row of inventory) {
    const keys = row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row).sort(compareText) : [];
    const validOperations = Array.isArray(row && row.operations) && row.operations.length > 0 &&
      row.operations.every(value => nonEmpty(value, 120)) &&
      row.operations.every((value, index) => index === 0 || compareText(value, row.operations[index - 1]) > 0);
    if (JSON.stringify(keys) !== JSON.stringify(STORAGE_CONTRACT_KEYS) || !nonEmpty(row.artifactId, 500) ||
        compareText(row.artifactId, previous) <= 0 || !nonEmpty(row.kind, 120) || !nonEmpty(row.name, 500) ||
        !nonEmpty(row.classification, 120) || !nonEmpty(row.owner, 240) || !nonEmpty(row.restore, 240) ||
        !nonEmpty(row.reset, 240) || typeof row.pattern !== 'boolean' || typeof row.unresolved !== 'boolean' ||
        typeof row.evidenceArtifact !== 'boolean' || !validOperations) {
      return { valid: false, inventory: null, reason: 'STORAGE_CONTRACT_INVENTORY_SCHEMA_INVALID' };
    }
    previous = row.artifactId;
  }
  return { valid: true, inventory, reason: '' };
}

function storageContractDeltas(baseline, current) {
  const before = new Map(baseline.map(row => [row.artifactId, row]));
  const after = new Map(current.map(row => [row.artifactId, row]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort(compareText);
  const rows = [];
  for (const artifactId of ids) {
    if (!before.has(artifactId)) rows.push({ artifactId, change: 'added', code: 'STORAGE_ARTIFACT_ADDED' });
    else if (!after.has(artifactId)) rows.push({ artifactId, change: 'removed', code: 'STORAGE_ARTIFACT_REMOVED' });
    else if (JSON.stringify(stableValue(before.get(artifactId))) !== JSON.stringify(stableValue(after.get(artifactId)))) {
      rows.push({ artifactId, change: 'changed', code: 'STORAGE_ARTIFACT_CONTRACT_CHANGED' });
    }
  }
  return rows;
}

const MESSAGE_CONTRACT_KEYS = Object.freeze(['contractId', 'expressionSha256', 'kind', 'messageType', 'path',
  'receiverContracts', 'senderContracts', 'unresolvedCode']);
const MESSAGE_SENDER_KEYS = Object.freeze(['path', 'payloadFields']);
const MESSAGE_FIELD_KEYS = Object.freeze(['field', 'kind']);

/* C-07 authority (closure addendum §3). A message-contract inventory may only
   authorize a regression verdict when the side that produced it had explicit
   complete static-discovery authority. Both the check result and the metric flag
   are required: the result alone would silently re-enable a pass verdict if
   A7-01's semantics were ever loosened, and the flag alone would accept an
   inventory from a failing run. Without authority on BOTH sides, C-07 is
   unmeasured — the inventory remains evidence, but it does not become proof. */
function messageContract(checks) {
  const check = checks.get('A7-01');
  const metric = check && check.metric;
  const inventory = metric && metric.inventory;
  if (!check || check.result !== 'pass' || check.mandatory !== true || !metric ||
      metric.inventoryComplete !== true || metric.staticDiscoveryComplete !== true ||
      !Array.isArray(inventory)) {
    return { valid: false, inventory: null, reason: 'MESSAGE_CONTRACT_INVENTORY_UNAVAILABLE' };
  }
  const senderCount = inventory.reduce((sum, row) => sum + (Array.isArray(row && row.senderContracts) ? row.senderContracts.length : 0), 0);
  const receiverCount = inventory.reduce((sum, row) => sum + (Array.isArray(row && row.receiverContracts) ? row.receiverContracts.length : 0), 0);
  const resolvedCount = inventory.filter(row => row && row.kind === 'resolved').length;
  const unresolvedCount = inventory.filter(row => row && row.kind === 'unresolved').length;
  if (inventory.length === 0 || !Number.isSafeInteger(metric.messageTypes) || metric.messageTypes < 0 || metric.messageTypes !== resolvedCount ||
      !Number.isSafeInteger(metric.senderSites) || metric.senderSites !== senderCount ||
      !Number.isSafeInteger(metric.receiverSites) || metric.receiverSites !== receiverCount ||
      !Number.isSafeInteger(metric.unresolvedContracts) || metric.unresolvedContracts !== unresolvedCount ||
      !Number.isSafeInteger(metric.discoveredArtifacts) || metric.discoveredArtifacts !== inventory.length ||
      !Number.isSafeInteger(metric.artifactLimit) || metric.artifactLimit < metric.discoveredArtifacts ||
      !HEX_64.test(String(metric.inventorySha256 || '')) ||
      metric.inventorySha256 !== stableSha256(inventory)) {
    return { valid: false, inventory: null, reason: 'MESSAGE_CONTRACT_INVENTORY_TRUNCATED' };
  }
  let previousId = '';
  for (const row of inventory) {
    const keys = row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row).sort(compareText) : [];
    const resolved = row && row.kind === 'resolved';
    const represented = row && row.kind === 'unresolved';
    const validResolved = resolved && row.contractId === `message:${row.messageType}` &&
      /^ST_[A-Z0-9_]+$/.test(row.messageType) && row.path === '' && row.unresolvedCode === '' && row.expressionSha256 === '';
    const validUnresolved = represented && /^unresolved:[a-f0-9]{64}:[1-9]\d*$/.test(String(row.contractId || '')) &&
      (row.messageType === '' || /^ST_[A-Z0-9_]+$/.test(row.messageType)) && nonEmpty(row.path, 500) &&
      nonEmpty(row.unresolvedCode, 160) && HEX_64.test(String(row.expressionSha256 || '')) &&
      Array.isArray(row.senderContracts) && row.senderContracts.length === 0 &&
      Array.isArray(row.receiverContracts) && row.receiverContracts.length === 0;
    if (JSON.stringify(keys) !== JSON.stringify(MESSAGE_CONTRACT_KEYS) || !nonEmpty(row.contractId, 500) ||
        compareText(row.contractId, previousId) <= 0 || (!validResolved && !validUnresolved) ||
        !Array.isArray(row.senderContracts) || !Array.isArray(row.receiverContracts)) {
      return { valid: false, inventory: null, reason: 'MESSAGE_CONTRACT_INVENTORY_SCHEMA_INVALID' };
    }
    let previousSender = '';
    for (const sender of row.senderContracts) {
      const senderKeys = sender && typeof sender === 'object' && !Array.isArray(sender) ? Object.keys(sender).sort(compareText) : [];
      const serialized = JSON.stringify(sender);
      if (JSON.stringify(senderKeys) !== JSON.stringify(MESSAGE_SENDER_KEYS) || !nonEmpty(sender.path, 500) ||
          compareText(serialized, previousSender) < 0 || !Array.isArray(sender.payloadFields)) {
        return { valid: false, inventory: null, reason: 'MESSAGE_CONTRACT_INVENTORY_SCHEMA_INVALID' };
      }
      let previousField = '';
      for (const field of sender.payloadFields) {
        const fieldKeys = field && typeof field === 'object' && !Array.isArray(field) ? Object.keys(field).sort(compareText) : [];
        const fieldKey = `${field && field.field}\0${field && field.kind}`;
        if (JSON.stringify(fieldKeys) !== JSON.stringify(MESSAGE_FIELD_KEYS) || !nonEmpty(field.field, 240) ||
            !nonEmpty(field.kind, 120) || compareText(fieldKey, previousField) <= 0) {
          return { valid: false, inventory: null, reason: 'MESSAGE_CONTRACT_INVENTORY_SCHEMA_INVALID' };
        }
        previousField = fieldKey;
      }
      previousSender = serialized;
    }
    let previousReceiver = '';
    for (const receiver of row.receiverContracts) {
      const receiverKeys = receiver && typeof receiver === 'object' && !Array.isArray(receiver) ? Object.keys(receiver).sort(compareText) : [];
      if (JSON.stringify(receiverKeys) !== JSON.stringify(['path']) || !nonEmpty(receiver.path, 500) || compareText(receiver.path, previousReceiver) < 0) {
        return { valid: false, inventory: null, reason: 'MESSAGE_CONTRACT_INVENTORY_SCHEMA_INVALID' };
      }
      previousReceiver = receiver.path;
    }
    previousId = row.contractId;
  }
  return { valid: true, inventory, reason: '' };
}

function messageContractDeltas(baseline, current) {
  const before = new Map(baseline.map(row => [row.contractId, row]));
  const after = new Map(current.map(row => [row.contractId, row]));
  return [...new Set([...before.keys(), ...after.keys()])].sort(compareText).flatMap(contractId => {
    if (!before.has(contractId)) return [{ contractId, change: 'added', code: 'MESSAGE_CONTRACT_ADDED' }];
    if (!after.has(contractId)) return [{ contractId, change: 'removed', code: 'MESSAGE_CONTRACT_REMOVED' }];
    return JSON.stringify(stableValue(before.get(contractId))) === JSON.stringify(stableValue(after.get(contractId)))
      ? [] : [{ contractId, change: 'changed', code: 'MESSAGE_CONTRACT_CHANGED' }];
  });
}

function exactIdentity(actual, expected) {
  return !!actual && !!expected && JSON.stringify(stableValue(actual)) === JSON.stringify(stableValue(expected));
}

function approvalEnvelope(value, expectedIdentity) {
  const present = value !== null && value !== undefined;
  const errors = [];
  if (!present) return { present: false, valid: false, errors, scope: new Set(),
    capabilityApprovals: [], findingWaivers: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.format !== COMPARISON_APPROVAL_FORMAT || value.schemaVersion !== 1) {
    errors.push('APPROVAL_ENVELOPE_SCHEMA_INVALID');
  }
  if (!exactIdentity(value && value.identity, expectedIdentity)) errors.push('APPROVAL_IDENTITY_MISMATCH');
  const migrationScope = value && value.migrationScope;
  const scopeIds = migrationScope && Array.isArray(migrationScope.checkIds) ? migrationScope.checkIds : [];
  if (!migrationScope || typeof migrationScope !== 'object' || Array.isArray(migrationScope) ||
      !Array.isArray(migrationScope.checkIds) || !nonEmpty(migrationScope.reason) ||
      !nonEmpty(migrationScope.approvedBy, 240) || scopeIds.some(id => !CHECK_ID.test(String(id))) ||
      new Set(scopeIds).size !== scopeIds.length) errors.push('MIGRATION_SCOPE_INVALID');
  const capabilityApprovals = value && Array.isArray(value.capabilityApprovals) ? value.capabilityApprovals : [];
  if (!value || !Array.isArray(value.capabilityApprovals)) errors.push('CAPABILITY_APPROVALS_INVALID');
  const findingWaivers = value && Array.isArray(value.findingWaivers) ? value.findingWaivers : [];
  if (!value || !Array.isArray(value.findingWaivers)) errors.push('FINDING_WAIVERS_INVALID');
  return { present: true, valid: errors.length === 0, errors,
    scope: new Set(scopeIds), capabilityApprovals, findingWaivers };
}

function capabilityApprovalAssessment(envelope, deltas) {
  const invalid = [];
  const byKey = new Map();
  for (const item of envelope.capabilityApprovals) {
    const valid = item && nonEmpty(item.capabilityId, 240) &&
      ['added', 'removed', 'changed'].includes(item.change) && nonEmpty(item.reason) &&
      nonEmpty(item.approvedBy, 240);
    const key = valid ? `${item.capabilityId}\0${item.change}` : '';
    if (!valid || byKey.has(key)) invalid.push(key || 'INVALID_APPROVAL');
    else byKey.set(key, item);
  }
  const deltaKeys = new Set((deltas || []).map(item => `${item.capabilityId}\0${item.change}`));
  const unapproved = (deltas || []).filter(item => !envelope.valid || !byKey.has(`${item.capabilityId}\0${item.change}`));
  const stale = [...byKey.keys()].filter(key => !deltaKeys.has(key));
  return { approvals: byKey.size, invalid, stale, unapproved };
}

function issueMetricMap(check) {
  const rows = new Map();
  const visit = (value, trail) => {
    if (Number.isFinite(value) && ISSUE_METRIC.test(trail)) rows.set(trail, value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of Object.keys(value).sort(compareText)) visit(value[key], trail ? `${trail}.${key}` : key);
    }
  };
  visit(check && check.metric, '');
  return rows;
}

function highRegressions(before, after) {
  const rows = [];
  if ((SEVERITY_RANK[after.severity] || 0) > (SEVERITY_RANK[before.severity] || 0)) {
    rows.push({ checkId: after.id, field: 'severity', code: 'HIGH_FINDING_SEVERITY_REGRESSION' });
  }
  const beforeEvidence = Array.isArray(before.evidence) ? before.evidence.length : 0;
  const afterEvidence = Array.isArray(after.evidence) ? after.evidence.length : 0;
  if (afterEvidence > beforeEvidence) rows.push({ checkId: after.id, field: 'evidence.length',
    baseline: beforeEvidence, current: afterEvidence, code: 'HIGH_FINDING_EVIDENCE_COUNT_REGRESSION' });
  const left = issueMetricMap(before);
  const right = issueMetricMap(after);
  for (const [field, current] of right) {
    const baseline = left.get(field);
    if (Number.isFinite(baseline) && current > baseline) rows.push({ checkId: after.id, field,
      baseline, current, code: 'HIGH_FINDING_ISSUE_COUNT_REGRESSION' });
  }
  return rows;
}

function findingWaiverAssessment(envelope, persistent, currentHigh) {
  const invalid = [];
  const byId = new Map();
  for (const item of envelope.findingWaivers) {
    const check = item && currentHigh.get(item.checkId);
    const valid = item && CHECK_ID.test(String(item.checkId || '')) && HIGH_SEVERITIES.has(item.severity) &&
      HEX_64.test(String(item.findingSha256 || '')) && nonEmpty(item.reason) && nonEmpty(item.approvedBy, 240) &&
      check && item.severity === check.severity && item.findingSha256 === comparisonFindingSha256(check);
    if (!valid || byId.has(item && item.checkId)) invalid.push(item && item.checkId || 'INVALID_WAIVER');
    else byId.set(item.checkId, item);
  }
  const persistentIds = new Set(persistent.map(item => item.id));
  const stale = [...byId.keys()].filter(id => !persistentIds.has(id) || !envelope.scope.has(id));
  return { byId, invalid, stale };
}

function numberMetric(checks, id, field) {
  const check = checks.get(id);
  const value = check && check.metric && check.metric[field];
  return Number.isFinite(value) ? value : null;
}

function totalMetrics(checks, definitions) {
  const values = definitions.map(([id, field]) => numberMetric(checks, id, field));
  return values.some(value => value === null) ? null : values.reduce((sum, value) => sum + value, 0);
}

export function evaluateComparison({ baselineAudits, currentAudits, comparisonApproval,
  approvalIdentity, baselineOpenGates, currentOpenGates }) {
  const baseline = checkMap(baselineAudits);
  const current = checkMap(currentAudits);
  const gates = [];
  const envelope = approvalEnvelope(comparisonApproval, approvalIdentity);

  const lostMeasurements = [];
  for (const [id, before] of baseline) {
    const after = current.get(id);
    if (before.mandatory && !['unmeasured', 'na'].includes(before.result) &&
        (!after || ['unmeasured', 'na'].includes(after.result))) lostMeasurements.push(id);
  }
  gates.push(gate('C-01', 'Mandatory measurement continuity', lostMeasurements.length ? 'fail' : 'pass',
    { lostMeasurements: lostMeasurements.length }, lostMeasurements.map(checkId => ({ checkId, code: 'MEASUREMENT_LOST' }))));

  const deltas = capabilityDeltas(capabilityInventory(baseline), capabilityInventory(current));
  const approvals = capabilityApprovalAssessment(envelope, deltas);
  const capabilityUnmeasured = deltas === null;
  const envelopeBlocksCapability = envelope.present && !envelope.valid;
  const capabilityFailed = !capabilityUnmeasured && (envelopeBlocksCapability ||
    approvals.invalid.length > 0 || approvals.stale.length > 0 || approvals.unapproved.length > 0);
  gates.push(gate('C-02', 'Semantic capability equivalence', capabilityUnmeasured ? 'unmeasured' : capabilityFailed ? 'fail' : 'pass',
    { deltas: deltas ? deltas.length : null, approved: approvals.approvals,
      unapproved: approvals.unapproved.length, invalidApprovals: approvals.invalid.length,
      staleApprovals: approvals.stale.length, envelopeErrors: envelope.errors.length,
      deltaSha256: deltas ? stableSha256(deltas) : null },
    [...approvals.unapproved.map(item => ({ ...item, code: 'CAPABILITY_DELTA_UNAPPROVED' })),
      ...approvals.invalid.map(() => ({ code: 'CAPABILITY_APPROVAL_INVALID' })),
      ...approvals.stale.map(() => ({ code: 'CAPABILITY_APPROVAL_STALE' })),
      ...envelope.errors.map(code => ({ code }))]));

  const baselineHigh = new Map([...baseline.values()]
    .filter(item => item.result === 'fail' && HIGH_SEVERITIES.has(item.severity)).map(item => [item.id, item]));
  const currentHigh = new Map([...current.values()]
    .filter(item => item.result === 'fail' && HIGH_SEVERITIES.has(item.severity)).map(item => [item.id, item]));
  const newHigh = [...currentHigh.values()].filter(item => !baselineHigh.has(item.id));
  const persistent = [...currentHigh.values()].filter(item => baselineHigh.has(item.id));
  const waiver = findingWaiverAssessment(envelope, persistent, currentHigh);
  const scopeMissing = persistent.length > 0 && (!envelope.present || !envelope.valid);
  const inScope = persistent.filter(item => envelope.scope.has(item.id));
  const outOfScope = persistent.filter(item => !envelope.scope.has(item.id));
  const unwaived = inScope.filter(item => !waiver.byId.has(item.id));
  const regressionRows = persistent.flatMap(item => highRegressions(baselineHigh.get(item.id), item));
  const unwaivedRegressionRows = regressionRows.filter(item => !waiver.byId.has(item.checkId));
  const highFailed = newHigh.length > 0 || scopeMissing || unwaived.length > 0 ||
    unwaivedRegressionRows.length > 0 || waiver.invalid.length > 0 || waiver.stale.length > 0 ||
    (envelope.present && !envelope.valid);
  const highEvidence = [
    ...newHigh.map(item => ({ checkId: item.id, severity: item.severity, code: 'NEW_HIGH_SEVERITY_FINDING' })),
    ...(scopeMissing ? persistent.map(item => ({ checkId: item.id, code: 'HIGH_FINDING_SCOPE_UNBOUND' })) : []),
    ...unwaived.map(item => ({ checkId: item.id, severity: item.severity,
      findingSha256: comparisonFindingSha256(item), code: 'IN_SCOPE_HIGH_FINDING_NOT_WAIVED' })),
    ...unwaivedRegressionRows,
    ...waiver.invalid.map(() => ({ code: 'HIGH_FINDING_WAIVER_INVALID' })),
    ...waiver.stale.map(checkId => ({ checkId, code: 'HIGH_FINDING_WAIVER_STALE' })),
    ...((envelope.present && !envelope.valid) ? envelope.errors.map(code => ({ code })) : [])
  ];
  gates.push(gate('C-03', 'No new or unapproved migration-scope P0/P1 findings', highFailed ? 'fail' : 'pass',
    { baselineP0P1: baselineHigh.size, currentP0P1: currentHigh.size, newP0P1: newHigh.length,
      persistentP0P1: persistent.length, inMigrationScope: inScope.length,
      outsideMigrationScope: outOfScope.length, waived: inScope.length - unwaived.length,
      regressions: regressionRows.length, unwaivedRegressions: unwaivedRegressionRows.length,
      invalidWaivers: waiver.invalid.length, staleWaivers: waiver.stale.length,
      approvalIdentityBound: envelope.valid }, highEvidence));

  const storageBefore = storageContract(baseline);
  const storageAfter = storageContract(current);
  const storageClassification = current.get('A4-02');
  const storageUnmeasured = !storageBefore.valid || !storageAfter.valid;
  const storageDeltas = storageUnmeasured ? [] : storageContractDeltas(storageBefore.inventory, storageAfter.inventory);
  const storageFailed = !storageUnmeasured && (storageDeltas.length > 0 ||
    !storageClassification || storageClassification.result !== 'pass');
  gates.push(gate('C-04', 'Storage artifact contract equivalence', storageUnmeasured ? 'unmeasured' : storageFailed ? 'fail' : 'pass',
    { baselineArtifacts: storageBefore.valid ? storageBefore.inventory.length : null,
      currentArtifacts: storageAfter.valid ? storageAfter.inventory.length : null,
      deltas: storageUnmeasured ? null : storageDeltas.length,
      currentClassification: storageClassification ? storageClassification.result : 'missing',
      unclassifiedArtifacts: storageClassification && storageClassification.metric.unclassifiedArtifacts },
    [...(!storageBefore.valid ? [{ checkId: 'A4-01', side: 'baseline', code: storageBefore.reason }] : []),
      ...(!storageAfter.valid ? [{ checkId: 'A4-01', side: 'current', code: storageAfter.reason }] : []),
      ...storageDeltas,
      ...(!storageUnmeasured && (!storageClassification || storageClassification.result !== 'pass')
        ? [{ checkId: 'A4-02', code: 'STORAGE_CLASSIFICATION_NOT_CLOSED' }] : [])]));

  const behavioralBefore = baseline.get('A5-04');
  const behavioralAfter = current.get('A5-04');
  const behavioralResult = !behavioralAfter ? 'unmeasured' :
    behavioralBefore && behavioralBefore.result === 'pass' && behavioralAfter.result !== 'pass' ? 'fail' : 'pass';
  gates.push(gate('C-05', 'Critical behavioral coverage continuity', behavioralResult,
    { baseline: behavioralBefore ? behavioralBefore.result : 'missing', current: behavioralAfter ? behavioralAfter.result : 'missing' },
    behavioralResult === 'fail' ? [{ checkId: 'A5-04', code: 'BEHAVIORAL_COVERAGE_REGRESSION' }] : []));

  const duplicateDefs = [['A2-01', 'duplicateGroups'], ['A2-02', 'nearCopyGroups'], ['A2-03', 'duplicateGroups']];
  const duplicateBefore = totalMetrics(baseline, duplicateDefs);
  const duplicateAfter = totalMetrics(current, duplicateDefs);
  const duplicateResult = duplicateBefore === null || duplicateAfter === null ? 'unmeasured' :
    duplicateAfter === 0 && duplicateBefore === 0 || duplicateAfter < duplicateBefore ? 'pass' : 'fail';
  gates.push(gate('C-06', 'Duplication decreases', duplicateResult,
    { baselineGroups: duplicateBefore, currentGroups: duplicateAfter },
    duplicateResult === 'fail' ? [{ code: 'DUPLICATION_NOT_REDUCED' }] : []));

  const couplingDefs = [['A1-02', 'undeclaredDependencies'], ['A1-05', 'directReferences'], ['A1-07', 'untestedApplicationAssets']];
  const couplingBefore = couplingDefs.map(([id, field]) => ({ id, field, value: numberMetric(baseline, id, field) }));
  const couplingAfter = couplingDefs.map(([id, field]) => ({ id, field, value: numberMetric(current, id, field) }));
  const messageBefore = messageContract(baseline);
  const messageAfter = messageContract(current);
  const continuityUnmeasured = [...couplingBefore, ...couplingAfter].some(item => item.value === null) ||
    !messageBefore.valid || !messageAfter.valid;
  const couplingRegressions = continuityUnmeasured ? [] : couplingAfter.filter((item, index) => item.value > couplingBefore[index].value);
  const messageDeltas = continuityUnmeasured ? [] : messageContractDeltas(messageBefore.inventory, messageAfter.inventory);
  gates.push(gate('C-07', 'Coupling, blast radius and message contracts do not regress', continuityUnmeasured ? 'unmeasured' :
    couplingRegressions.length || messageDeltas.length ? 'fail' : 'pass',
    { baseline: couplingBefore.map(item => item.value), current: couplingAfter.map(item => item.value),
      regressions: couplingRegressions.length, baselineMessageTypes: messageBefore.valid ? messageBefore.inventory.length : null,
      currentMessageTypes: messageAfter.valid ? messageAfter.inventory.length : null,
      messageContractDeltas: continuityUnmeasured ? null : messageDeltas.length },
    [...(!messageBefore.valid ? [{ checkId: 'A7-01', side: 'baseline', code: messageBefore.reason }] : []),
      ...(!messageAfter.valid ? [{ checkId: 'A7-01', side: 'current', code: messageAfter.reason }] : []),
      ...couplingRegressions.map(item => ({ checkId: item.id, field: item.field, code: 'COUPLING_REGRESSION' })),
      ...messageDeltas]));

  const performanceIds = ['A10-01', 'A10-02', 'A10-03'];
  const performanceFailures = performanceIds.map(id => current.get(id)).filter(item => item && item.result === 'fail');
  const performanceLost = performanceIds.filter(id => {
    const before = baseline.get(id); const after = current.get(id);
    return before && before.result === 'pass' && (!after || after.result === 'unmeasured');
  });
  gates.push(gate('C-08', 'Performance comparison gates', performanceLost.length ? 'unmeasured' : performanceFailures.length ? 'fail' : 'pass',
    { failures: performanceFailures.length, lostMeasurements: performanceLost.length },
    [...performanceFailures.map(item => ({ checkId: item.id, code: 'PERFORMANCE_REGRESSION' })),
      ...performanceLost.map(checkId => ({ checkId, code: 'PERFORMANCE_MEASUREMENT_LOST' }))]));

  const beforeGates = (baselineOpenGates || []).map(item => `${item.id}:${item.state}`).sort(compareText);
  const afterGates = (currentOpenGates || []).map(item => `${item.id}:${item.state}`).sort(compareText);
  const externalEqual = JSON.stringify(beforeGates) === JSON.stringify(afterGates);
  gates.push(gate('C-09', 'External acceptance gates remain explicit', externalEqual ? 'pass' : 'fail',
    { baselineGates: beforeGates.length, currentGates: afterGates.length },
    externalEqual ? [] : [{ code: 'EXTERNAL_GATE_SET_CHANGED' }]));

  const failed = gates.filter(item => item.result === 'fail');
  const unmeasured = gates.filter(item => item.mandatory && item.result === 'unmeasured');
  return { schemaVersion: 1, status: failed.length || unmeasured.length ? 'comparison-failed-or-unmeasured' : 'comparison-pass',
    approval: { provided: envelope.present, identityBound: envelope.valid,
      envelopeSha256: envelope.present ? stableSha256(comparisonApproval) : null },
    failed: failed.map(item => item.id), mandatoryUnmeasured: unmeasured.map(item => item.id), gates };
}
