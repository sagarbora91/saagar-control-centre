import { auditResult, makeCheck, sha256 } from '../lib.mjs';
import { browserTimingObservationSha256 } from '../capture-attestation.mjs';
import { baseEvidenceTrust, canonicalFingerprint, DEVICE_RECORD_PREFIX, exactObject, isHex64,
  loadCommittedRecord, TIMING_RECORD_PREFIX, validUtcTimestamp } from '../evidence-contract.mjs';

const DAT02_LIMITS = Object.freeze({ exportP95Ms: 150, frameGapP95Ms: 250, totalP95Ms: 3000 });
const MIN_TIMING_SAMPLES = 5;
const MAX_TIMING_SAMPLES = 30;
const MAX_TIMING_MS = 120000;
const SAFE_BROWSER_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9 ._+:/();-]{0,159}$/;

function finiteNonNegative(value, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum;
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function percentile95(values) {
  const sorted = values.filter(value => finiteNonNegative(value, MAX_TIMING_MS)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function performanceEvidence(context) {
  const value = context.options && context.options.performanceEvidence;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validBuildBinding(context, apkSha256) {
  const build = context.options && context.options.buildEvidence;
  if (!build || build.format !== 'SAAGAR_AUDIT_APK_COMPARISON' || build.schemaVersion !== 2 ||
      build.identityBound !== true || build.toolchainMatch !== true || build.normalizedEqual !== true ||
      !isHex64(apkSha256)) return false;
  const captures = [build.first, build.second];
  if (captures.some(item => !item || !isHex64(item.sha256) || !item.build ||
      item.build.sourceSha !== context.head ||
      item.build.productFingerprintSha256 !== context.productFingerprint.treeSha256)) return false;
  return captures.some(item => item.sha256 === apkSha256);
}

function validDat02(value) {
  if (value === null) return true;
  if (!exactObject(value, ['contract', 'saves']) || value.contract !== 'DAT-02-v1' ||
      !Array.isArray(value.saves) || value.saves.length !== 5) return false;
  return value.saves.every((item, index) => exactObject(item,
    ['sequence', 'ok', 'exportMs', 'frameGapMs', 'totalMs']) && item.sequence === index + 1 &&
    typeof item.ok === 'boolean' && finiteNonNegative(item.exportMs, MAX_TIMING_MS) &&
    finiteNonNegative(item.frameGapMs, MAX_TIMING_MS) && finiteNonNegative(item.totalMs, MAX_TIMING_MS));
}

function validMemory(value) {
  if (value === null) return true;
  return exactObject(value, ['contract', 'closeReopenCompleted', 'collectionCycles',
    'preOpenBytes', 'postCloseBytes']) && value.contract === 'A10-05-v1' &&
    typeof value.closeReopenCompleted === 'boolean' && value.collectionCycles === 2 &&
    safeInteger(value.preOpenBytes, 1) && safeInteger(value.postCloseBytes);
}

function expectedAcceptanceScope(value) {
  const scope = [];
  if (value && value.dat02 !== null) scope.push('A10-04');
  if (value && value.memory !== null) scope.push('A10-05');
  return scope;
}

function validOwnerAcceptance(value, envelope) {
  const expectedScope = expectedAcceptanceScope(envelope);
  return exactObject(value, ['format', 'schemaVersion', 'decision', 'acceptedAt', 'acceptedBySha256',
    'scope', 'statementSha256']) && value.format === 'SAAGAR_OWNER_DEVICE_ACCEPTANCE' &&
    value.schemaVersion === 1 && value.decision === 'accepted' && validUtcTimestamp(value.acceptedAt) &&
    value.acceptedAt >= envelope.capturedAt && isHex64(value.acceptedBySha256) &&
    isHex64(value.statementSha256) && Array.isArray(value.scope) &&
    JSON.stringify(value.scope) === JSON.stringify(expectedScope);
}

export function validateRuntimeEvidence(context, perf = performanceEvidence(context)) {
  const value = perf.deviceRuntime;
  const invalid = reason => ({ valid: false, reason, dat02: null, memory: null });
  const keys = ['apkSha256', 'attestationSignature', 'auditToolingSha', 'captureTool', 'capturedAt', 'dat02', 'device',
    'environment', 'evidenceSha256', 'format', 'instrumentation', 'memory', 'ownerAcceptance',
    'productFingerprintSha256', 'recordPath', 'schemaVersion'];
  if (!exactObject(value, keys) || value.format !== 'SAAGAR_A10_DEVICE_RUNTIME_ACCEPTANCE' ||
      value.schemaVersion !== 2) return invalid('COMMITTED_DEVICE_ACCEPTANCE_REQUIRED');

  const trust = baseEvidenceTrust(context, value, {
    format: 'SAAGAR_A10_DEVICE_RUNTIME_ACCEPTANCE', schemaVersion: 2,
    recordPrefix: DEVICE_RECORD_PREFIX
  });
  if (!trust.integrityValid) return invalid('COMMITTED_DEVICE_ACCEPTANCE_REQUIRED');
  if (!isHex64(value.apkSha256) || !validBuildBinding(context, value.apkSha256)) {
    return invalid('DEVICE_RUNTIME_APK_BINDING_INVALID');
  }

  const device = value.device;
  if (!exactObject(device, ['type', 'identitySha256', 'apiLevel', 'buildFingerprintSha256']) ||
      device.type !== 'physical-android' || !isHex64(device.identitySha256) ||
      !safeInteger(device.apiLevel, 23) || device.apiLevel > 100 ||
      !isHex64(device.buildFingerprintSha256)) return invalid('PHYSICAL_DEVICE_IDENTITY_INVALID');

  const instrumentation = value.instrumentation;
  if (!exactObject(instrumentation, ['format', 'schemaVersion', 'artifactSha256', 'protocolSha256']) ||
      instrumentation.format !== 'SAAGAR_A10_DEVICE_HARNESS' || instrumentation.schemaVersion !== 1 ||
      !isHex64(instrumentation.artifactSha256) || !isHex64(instrumentation.protocolSha256)) {
    return invalid('DEVICE_INSTRUMENTATION_IDENTITY_INVALID');
  }

  const environment = value.environment;
  if (!exactObject(environment, ['identitySha256', 'appDataState', 'networkState', 'powerMode']) ||
      !isHex64(environment.identitySha256) || !['fresh', 'existing', 'seeded'].includes(environment.appDataState) ||
      !['offline', 'online'].includes(environment.networkState) ||
      !['normal', 'battery-saver'].includes(environment.powerMode)) {
    return invalid('DEVICE_ENVIRONMENT_IDENTITY_INVALID');
  }
  if (!validDat02(value.dat02) || !validMemory(value.memory) ||
      (value.dat02 === null && value.memory === null)) return invalid('DEVICE_RUNTIME_MEASUREMENT_INVALID');
  if (!validOwnerAcceptance(value.ownerAcceptance, value)) return invalid('OWNER_DEVICE_ACCEPTANCE_INVALID');

  if (!trust.authorized) return invalid('DEVICE_RUNTIME_TRUST_ROOT_UNAVAILABLE');
  return { valid: true, reason: 'COMMITTED_OWNER_DEVICE_ACCEPTANCE_VERIFIED', envelope: value,
    dat02: value.dat02, memory: value.memory };
}

export function validTimingSamples(value) {
  return Array.isArray(value) && value.length >= MIN_TIMING_SAMPLES && value.length <= MAX_TIMING_SAMPLES &&
    value.every(sample => finiteNonNegative(sample, MAX_TIMING_MS));
}

export function evaluateShellPerformance({ mode, shellBytes, baselineShellBytes,
  shellParseMs, baselineShellParseMs }) {
  const currentMeasured = finiteNonNegative(shellBytes) && finiteNonNegative(shellParseMs, MAX_TIMING_MS);
  if (mode === 'baseline') return {
    comparable: currentMeasured, regression: false, byteRegression: false, parseRegression: false
  };
  const comparable = mode === 'comparison' && currentMeasured &&
    finiteNonNegative(baselineShellBytes) && finiteNonNegative(baselineShellParseMs, MAX_TIMING_MS);
  if (!comparable) return {
    comparable: false, regression: false, byteRegression: false, parseRegression: false
  };
  const byteRegression = shellBytes >= baselineShellBytes;
  const parseRegression = shellParseMs > baselineShellParseMs * 1.05;
  return { comparable: true, regression: byteRegression || parseRegression,
    byteRegression, parseRegression };
}

export function baselineTimingMetricsMatch(value, signedBaseline) {
  return Boolean(value && signedBaseline &&
    finiteNonNegative(value.shellParseMs, MAX_TIMING_MS) &&
    finiteNonNegative(value.moduleOpenP95Ms, MAX_TIMING_MS) &&
    value.shellParseMs === signedBaseline.shellP95Ms &&
    value.moduleOpenP95Ms === signedBaseline.moduleOpenP95Ms);
}

function timingBinding(value) {
  return {
    auditToolingSha: value.auditToolingSha,
    productFingerprintSha256: value.productFingerprintSha256,
    producerSha256: value.captureTool.producerSha256,
    protocolSha256: value.captureTool.protocolSha256,
    browserIdentitySha256: value.browser.identitySha256,
    environmentIdentitySha256: value.environmentIdentitySha256
  };
}

function productSourceSha256(context, file) {
  const entry = context.productFingerprint.entries.find(item => item.path === file);
  return entry && entry.sha256;
}

function timingShape(context, value, requireCurrentProduct) {
  const invalid = reason => ({ valid: false, reason });
  const keys = ['attestationSignature', 'auditToolingSha', 'baselineRecordPath', 'browser', 'captureTool', 'capturedAt',
    'environmentIdentitySha256', 'evidenceSha256', 'format', 'moduleOpen', 'productFingerprintSha256',
    'recordPath', 'schemaVersion', 'shell'];
  if (!exactObject(value, keys) || value.format !== 'SAAGAR_A10_BROWSER_TIMING_ATTESTATION' ||
      value.schemaVersion !== 2) return invalid('BROWSER_TIMING_SCHEMA_INVALID');
  const trust = baseEvidenceTrust(context, value, {
    format: 'SAAGAR_A10_BROWSER_TIMING_ATTESTATION', schemaVersion: 2,
    recordPrefix: TIMING_RECORD_PREFIX, requireCurrentProduct
  });
  if (!trust.integrityValid) return invalid('BROWSER_TIMING_COMMITTED_ATTESTATION_REQUIRED');

  const browser = value.browser;
  if (!exactObject(browser, ['identity', 'identitySha256']) ||
      typeof browser.identity !== 'string' || !SAFE_BROWSER_IDENTITY.test(browser.identity) ||
      browser.identity !== browser.identity.trim() || !isHex64(browser.identitySha256) ||
      browser.identitySha256 !== sha256(browser.identity) || !isHex64(value.environmentIdentitySha256)) {
    return invalid('BROWSER_TIMING_ENVIRONMENT_INVALID');
  }
  if (!(value.baselineRecordPath === null || (typeof value.baselineRecordPath === 'string' &&
      value.baselineRecordPath.startsWith(TIMING_RECORD_PREFIX)))) return invalid('BROWSER_TIMING_BASELINE_REFERENCE_INVALID');

  const binding = timingBinding(value);
  const shell = value.shell;
  const expectedShellSha = productSourceSha256(context, 'www/index.html');
  if (!exactObject(shell, ['observationSha256', 'path', 'samples', 'sourceSha256']) ||
      shell.path !== 'www/index.html' || !isHex64(shell.sourceSha256) ||
      (requireCurrentProduct && shell.sourceSha256 !== expectedShellSha) || !validTimingSamples(shell.samples)) {
    return invalid('BROWSER_TIMING_SHELL_OBSERVATION_INVALID');
  }
  const shellObservation = { kind: 'shell-parse', path: shell.path,
    sourceSha256: shell.sourceSha256, samples: shell.samples };
  if (!isHex64(shell.observationSha256) ||
      shell.observationSha256 !== browserTimingObservationSha256(binding, shellObservation)) {
    return invalid('BROWSER_TIMING_SHELL_HASH_INVALID');
  }

  const expectedModules = [...context.modules].sort((a, b) => a.id.localeCompare(b.id));
  if (!Array.isArray(value.moduleOpen) || value.moduleOpen.length !== expectedModules.length) {
    return invalid('BROWSER_TIMING_MODULE_SET_INVALID');
  }
  const rows = [];
  for (let index = 0; index < expectedModules.length; index += 1) {
    const expected = expectedModules[index];
    const row = value.moduleOpen[index];
    const expectedSourceSha = productSourceSha256(context, expected.file);
    if (!exactObject(row, ['moduleId', 'observationSha256', 'path', 'samples', 'sourceSha256']) ||
        row.moduleId !== expected.id || row.path !== expected.file || !isHex64(row.sourceSha256) ||
        (requireCurrentProduct && row.sourceSha256 !== expectedSourceSha) || !validTimingSamples(row.samples)) {
      return invalid('BROWSER_TIMING_MODULE_OBSERVATION_INVALID');
    }
    const observation = { kind: 'module-open', moduleId: row.moduleId, path: row.path,
      sourceSha256: row.sourceSha256, samples: row.samples };
    if (!isHex64(row.observationSha256) ||
        row.observationSha256 !== browserTimingObservationSha256(binding, observation)) {
      return invalid('BROWSER_TIMING_MODULE_HASH_INVALID');
    }
    rows.push({ moduleId: row.moduleId, samples: row.samples.length, p95Ms: percentile95(row.samples) });
  }

  if (!trust.authorized) return invalid('BROWSER_TIMING_TRUST_ROOT_UNAVAILABLE');
  return { valid: true, reason: 'BROWSER_TIMING_COMMITTED_ATTESTATION_VERIFIED', envelope: value,
    shellP95Ms: percentile95(shell.samples), shellSamples: shell.samples.length, moduleRows: rows,
    moduleOpenP95Ms: percentile95(rows.map(row => row.p95Ms)),
    captureIdentitySha256: canonicalFingerprint({ captureTool: value.captureTool, browser: value.browser,
      environmentIdentitySha256: value.environmentIdentitySha256 }) };
}

export function validateBrowserTimingEvidence(context, perf = performanceEvidence(context), mode = 'baseline') {
  const current = timingShape(context, perf.browserTiming, true);
  if (!current.valid) return current;
  if (mode === 'baseline') {
    return current.envelope.baselineRecordPath === null ? { ...current, comparable: true, baseline: null }
      : { valid: false, reason: 'BROWSER_TIMING_BASELINE_REFERENCE_UNEXPECTED' };
  }
  const baselinePath = current.envelope.baselineRecordPath;
  const baselineRaw = typeof baselinePath === 'string'
    ? loadCommittedRecord(context, baselinePath, TIMING_RECORD_PREFIX) : null;
  const baseline = timingShape(context, baselineRaw, false);
  if (!baseline.valid || baseline.envelope.baselineRecordPath !== null ||
      baseline.captureIdentitySha256 !== current.captureIdentitySha256 ||
      !baselineTimingMetricsMatch(perf.baseline, baseline)) {
    return { valid: false, reason: 'BROWSER_TIMING_COMPARISON_BINDING_INVALID' };
  }
  return { ...current, comparable: true, baseline };
}

function shippedAssets(context) {
  const entries = context.productFingerprint.entries
    .filter(item => item.path.startsWith('www/'))
    .map(item => ({ path: item.path, bytes: item.bytes }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const groups = new Map();
  for (const item of entries) {
    const relative = item.path.slice(4);
    const first = relative.includes('/') ? relative.split('/', 1)[0] : '(root)';
    groups.set(first, (groups.get(first) || 0) + item.bytes);
  }
  const byGroup = [...groups].map(([group, bytes]) => ({ group, bytes }))
    .sort((a, b) => a.group.localeCompare(b.group));
  return { entries, byGroup, totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0) };
}

function moduleSizes(context) {
  return context.modules.map(module => ({ moduleId: module.id, path: module.file,
    bytes: Buffer.byteLength(module.html, 'utf8'), lines: module.html.split(/\r?\n/).length }))
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

export async function run(context) {
  const perf = performanceEvidence(context);
  const mode = context.options && context.options.mode === 'comparison' ? 'comparison' : 'baseline';
  const timing = validateBrowserTimingEvidence(context, perf, mode);
  const runtime = validateRuntimeEvidence(context, perf);
  const shell = context.read('www/index.html');
  const shellBytes = Buffer.byteLength(shell, 'utf8');
  const shellLines = shell.split(/\r?\n/).length;
  const shellParseMs = timing.valid ? timing.shellP95Ms : null;
  const baselineShell = perf.baseline && finiteNonNegative(perf.baseline.shellBytes)
    ? perf.baseline.shellBytes : null;
  const baselineShellParseMs = perf.baseline &&
    finiteNonNegative(perf.baseline.shellParseMs, MAX_TIMING_MS)
    ? perf.baseline.shellParseMs : null;
  const shellDecision = evaluateShellPerformance({ mode, shellBytes,
    baselineShellBytes: baselineShell, shellParseMs, baselineShellParseMs });
  const shellComparable = timing.valid && shellDecision.comparable;
  const shellRegression = shellComparable && shellDecision.regression;

  const sizes = moduleSizes(context);
  const timings = timing.valid ? timing.moduleRows : null;
  const baselineModuleP95 = perf.baseline && finiteNonNegative(perf.baseline.moduleOpenP95Ms, MAX_TIMING_MS)
    ? perf.baseline.moduleOpenP95Ms : null;
  const currentModuleP95 = timing.valid ? timing.moduleOpenP95Ms : null;
  const moduleComparable = timing.valid && (mode === 'baseline' || baselineModuleP95 !== null);
  const moduleRegression = mode === 'comparison' && moduleComparable && currentModuleP95 > baselineModuleP95 * 1.10;

  const assets = shippedAssets(context);
  const baselineAssetBytes = perf.baseline && finiteNonNegative(perf.baseline.totalShippedAssetBytes)
    ? perf.baseline.totalShippedAssetBytes : null;
  const assetComparable = mode === 'baseline' || baselineAssetBytes !== null;
  const assetRegression = mode === 'comparison' && baselineAssetBytes !== null &&
    assets.totalBytes > baselineAssetBytes * 1.05;

  const dat02 = runtime.dat02;
  const dat02Measured = runtime.valid && dat02 !== null;
  const dat02Metrics = dat02Measured ? {
    exportP95Ms: percentile95(dat02.saves.map(item => item.exportMs)),
    frameGapP95Ms: percentile95(dat02.saves.map(item => item.frameGapMs)),
    totalP95Ms: percentile95(dat02.saves.map(item => item.totalMs))
  } : null;
  const dat02Failed = dat02Measured && (dat02.saves.some(item => !item.ok) ||
    dat02Metrics.exportP95Ms > DAT02_LIMITS.exportP95Ms ||
    dat02Metrics.frameGapP95Ms > DAT02_LIMITS.frameGapP95Ms ||
    dat02Metrics.totalP95Ms > DAT02_LIMITS.totalP95Ms);

  const memory = runtime.memory;
  const memoryMeasured = runtime.valid && memory !== null;
  const retainedDelta = memoryMeasured ? Math.abs(memory.postCloseBytes - memory.preOpenBytes) : null;
  const retainedLimit = memoryMeasured ? memory.preOpenBytes * 0.10 : null;
  const memoryFailed = memoryMeasured && (!memory.closeReopenCompleted || retainedDelta > retainedLimit);

  const checks = [
    makeCheck({
      id: 'A10-01', title: 'Shell size and parse performance',
      result: shellComparable ? (shellRegression ? 'fail' : 'pass') : 'unmeasured',
      severity: shellRegression ? 'P2' : 'INFO', mandatory: false,
      metric: { mode, shellBytes, shellLines, shellParseMs, shellTimingSamples: timing.valid ? timing.shellSamples : 0,
        timingIdentityStatus: timing.reason, baselineShellBytes: baselineShell,
        baselineShellParseMs,
        captureIdentitySha256: timing.valid ? timing.captureIdentitySha256 : null,
        byteDeltaPercent: baselineShell === null ? null : Number((((shellBytes - baselineShell) /
          Math.max(1, baselineShell)) * 100).toFixed(3)),
        parseDeltaPercent: baselineShellParseMs === null ? null : Number((((shellParseMs - baselineShellParseMs) /
          Math.max(1, baselineShellParseMs)) * 100).toFixed(3)),
        thresholds: { shellBytesMustDecrease: true, shellParseMaxIncreasePercent: 5 } },
      rule: 'Record shell bytes and identity-bound parse samples; comparison bytes must decrease and parse p95 may not increase by more than five percent.',
      evidence: shellComparable ? [{ path: 'www/index.html',
        code: shellDecision.byteRegression && shellDecision.parseRegression
          ? 'SHELL_SIZE_AND_PARSE_REGRESSION'
          : shellDecision.byteRegression ? 'SHELL_SIZE_REGRESSION'
            : shellDecision.parseRegression ? 'SHELL_PARSE_REGRESSION'
              : 'ATTESTED_SHELL_TIMING_MEASURED',
        samples: timing.shellSamples, p95Ms: shellParseMs }]
        : [{ path: 'www/index.html', code: mode === 'comparison' && timing.valid
          ? 'ATTESTED_BASELINE_SHELL_TIMING_REQUIRED' : 'ATTESTED_SHELL_TIMING_REQUIRED' }],
      notes: shellComparable ? '' : mode === 'comparison' && timing.valid
        ? 'Comparison remains unmeasured without the authoritative baseline shell parse p95.'
        : 'Timing remains unmeasured without a Git-committed, source-bound browser capture containing 5-30 samples.'
    }),
    makeCheck({
      id: 'A10-02', title: 'Per-module size and open performance',
      result: moduleComparable ? (moduleRegression ? 'fail' : 'pass') : 'unmeasured',
      severity: moduleRegression ? 'P2' : 'INFO', mandatory: false,
      metric: { mode, modules: sizes.length, moduleSizes: sizes, measuredTimingModules: timings ? timings.length : 0,
        openP95Ms: currentModuleP95, baselineOpenP95Ms: baselineModuleP95,
        timingIdentityStatus: timing.reason,
        captureIdentitySha256: timing.valid ? timing.captureIdentitySha256 : null,
        sizesSha256: sha256(JSON.stringify(sizes)) },
      rule: 'Record every module byte count and 5-30 source-bound open-time samples; identical-environment comparison p95 may not regress by more than ten percent.',
      evidence: moduleComparable ? timings.map(row => ({
        path: context.modules.find(module => module.id === row.moduleId).file,
        code: moduleRegression ? 'MODULE_OPEN_P95_REGRESSION' : 'ATTESTED_MODULE_OPEN_TIMING_MEASURED',
        moduleId: row.moduleId, samples: row.samples, p95Ms: row.p95Ms }))
        : sizes.map(row => ({ path: row.path, code: 'ATTESTED_MODULE_OPEN_TIMING_REQUIRED',
          moduleId: row.moduleId, bytes: row.bytes })),
      notes: moduleComparable ? '' : 'Module sizes are static; timings remain unmeasured without a complete committed capture and a matching baseline capture in comparison mode.'
    }),
    makeCheck({
      id: 'A10-03', title: 'Total shipped application asset bytes',
      result: assetComparable ? (assetRegression ? 'fail' : 'pass') : 'unmeasured',
      severity: assetRegression ? 'P2' : 'INFO', mandatory: false,
      metric: { mode, fileCount: assets.entries.length, totalBytes: assets.totalBytes,
        baselineTotalBytes: baselineAssetBytes,
        deltaPercent: baselineAssetBytes === null ? null : Number((((assets.totalBytes - baselineAssetBytes) /
          Math.max(1, baselineAssetBytes)) * 100).toFixed(3)),
        byGroup: assets.byGroup, inventorySha256: sha256(JSON.stringify(assets.entries)) },
      rule: 'Total tracked shipped www asset bytes may not increase by more than five percent after migration without an owner-approved reason.',
      evidence: assetRegression ? [{ path: 'www/', code: 'SHIPPED_ASSET_SIZE_REGRESSION',
        currentBytes: assets.totalBytes, baselineBytes: baselineAssetBytes }]
        : [{ path: 'www/', code: assetComparable ? 'SHIPPED_ASSET_SIZE_MEASURED' :
          'SHIPPED_ASSET_BASELINE_UNAVAILABLE', currentBytes: assets.totalBytes }],
      notes: mode === 'baseline' ? 'This freezes the static pre-migration asset-size measurement.' : ''
    }),
    makeCheck({
      id: 'A10-04', title: 'DAT-02 five-save physical-device gate',
      result: dat02Measured ? (dat02Failed ? 'fail' : 'pass') : 'unmeasured', severity: 'P0', mandatory: true,
      metric: { physicalDeviceEvidence: dat02Measured, identityStatus: runtime.reason, requiredSaves: 5,
        measuredSaves: dat02Measured ? dat02.saves.length : 0,
        failedSaves: dat02Measured ? dat02.saves.filter(item => !item.ok).length : null,
        thresholds: DAT02_LIMITS, measurements: dat02Metrics,
        apkSha256: runtime.valid ? runtime.envelope.apkSha256 : null,
        deviceIdentitySha256: runtime.valid ? runtime.envelope.device.identitySha256 : null,
        instrumentationIdentitySha256: runtime.valid ? runtime.envelope.instrumentation.artifactSha256 : null,
        environmentIdentitySha256: runtime.valid ? runtime.envelope.environment.identitySha256 : null },
      rule: 'Five qualifying saves must complete on a physical device under the controlled DAT-02 procedure.',
      evidence: dat02Measured ? dat02.saves.map(item => ({
        code: item.ok ? 'DAT02_SAVE_RECORDED' : 'DAT02_SAVE_ERROR', sequence: item.sequence,
        exportMs: item.exportMs, frameGapMs: item.frameGapMs, totalMs: item.totalMs }))
        : [{ code: 'COMMITTED_OWNER_DEVICE_DAT02_ACCEPTANCE_REQUIRED' }],
      notes: dat02Measured ? '' : 'External or synthetic JSON cannot establish this gate. It requires a source-bound record already committed under the controlled device-acceptance path, explicit owner acceptance, and an APK match.'
    }),
    makeCheck({
      id: 'A10-05', title: 'Close/reopen retained-memory delta',
      result: memoryMeasured ? (memoryFailed ? 'fail' : 'pass') : 'unmeasured', severity: 'P1', mandatory: true,
      metric: { compatibleInstrumentation: memoryMeasured, identityStatus: runtime.reason,
        requiredCollectionCycles: 2, collectionCycles: memoryMeasured ? memory.collectionCycles : 0,
        preOpenBytes: memoryMeasured ? memory.preOpenBytes : null,
        postCloseBytes: memoryMeasured ? memory.postCloseBytes : null,
        retainedDeltaBytes: retainedDelta, allowedDeltaBytes: retainedLimit,
        apkSha256: runtime.valid ? runtime.envelope.apkSha256 : null,
        deviceIdentitySha256: runtime.valid ? runtime.envelope.device.identitySha256 : null,
        instrumentationIdentitySha256: runtime.valid ? runtime.envelope.instrumentation.artifactSha256 : null,
        environmentIdentitySha256: runtime.valid ? runtime.envelope.environment.identitySha256 : null },
      rule: 'After close and two collection cycles, retained memory must return within ten percent of the pre-open baseline.',
      evidence: memoryMeasured ? [{ code: memoryFailed ? 'RETAINED_MEMORY_REGRESSION' :
        'RETAINED_MEMORY_WITHIN_LIMIT', collectionCycles: memory.collectionCycles }]
        : [{ code: 'COMMITTED_OWNER_DEVICE_MEMORY_ACCEPTANCE_REQUIRED' }],
      notes: memoryMeasured ? '' : 'Legacy summaries, external JSON and synthetic fixtures remain unmeasured; only a committed owner/device acceptance record can establish this gate.'
    })
  ];

  return auditResult('A10', 'Performance and resources', checks, {
    shellBytes,
    moduleBytes: sizes.reduce((sum, row) => sum + row.bytes, 0),
    shippedAssetBytes: assets.totalBytes,
    browserTimingAttested: Boolean(timing.valid),
    physicalDeviceChecksMeasured: Number(dat02Measured) + Number(memoryMeasured)
  });
}
