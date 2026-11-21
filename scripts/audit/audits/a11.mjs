import { auditResult, lineNumber, makeCheck, PRODUCT_BASELINE_SHA, runGit, sha256 } from '../lib.mjs';
import { CURRENT_AUTHORITY_DOCUMENTS } from '../config.mjs';

const REPOSITORY_PATH_PREFIX = /^(?:android|build-overrides|docs|scripts|tests|verification|www)\//;
const ROOT_FILES = new Set(['package.json', 'package-lock.json', 'capacitor.config.json']);
const REQUIRED_TEST_SUITES = Object.freeze({
  'test:c1': 'c1',
  'test:mobile': 'mobile',
  'test:settings': 'settings',
  'test:language': 'language',
  'test:etp': 'etp',
  'test:modular': 'modular',
  'test:offline': 'mainOffline'
});
const CURRENT_TEST_CLAIM_DOCUMENTS = new Set([
  'docs/audit/HANDOFF.md',
  'docs/audit/AUDIT-PROGRAM-v1.md'
]);
const EXTERNAL_TEST_CLAIM_DOMAINS = new Set(['api23External', 'auxiliaryFocused', 'largeRecordFocused', 'storageRecoveryFocused']);

function authoritySources(context) {
  return CURRENT_AUTHORITY_DOCUMENTS.map(file => ({ file, available: context.exists(file),
    source: context.exists(file) ? context.read(file) : '' })).sort((a, b) => a.file.localeCompare(b.file));
}

function blankRange(text, start, end) {
  return text.slice(0, start) + text.slice(start, end).replace(/[^\r\n]/g, ' ') + text.slice(end);
}

function currentClaimScope(file, source) {
  let text = String(source || '');
  if (file === 'docs/audit/HANDOFF.md') {
    const historical = text.search(/\n## Historical record\b/i);
    if (historical >= 0) text = blankRange(text, historical, text.length);
  }
  if (file === 'docs/ETP-RETAIL-VERIFIED-DATA-PATH-DECISION-REGISTER-2026-08-08.md') {
    const latest = text.search(/\n## Core-contract closure reconciliation\b/i);
    if (latest >= 0) text = blankRange(text, 0, latest);
  }
  if (file === 'docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md') {
    const progress = text.search(/\n## 26\. Implementation progress\b/i);
    const latest = text.search(/\n## Retail ETP Core Contract Closure\b/i);
    if (progress >= 0) text = blankRange(text, progress, latest >= progress ? latest : text.length);
  }
  return text;
}

function cleanPathCandidate(value) {
  let candidate = String(value || '').trim().replace(/^<|>$/g, '').replaceAll('\\', '/');
  candidate = candidate.split('#', 1)[0].replace(/:[0-9]+(?:-[0-9]+)?$/, '').replace(/[.,;:]+$/, '');
  candidate = candidate.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!candidate || /^[A-Za-z]:\//.test(candidate) || candidate.includes('://') || /[<>]/.test(candidate)) return null;
  if (candidate.includes(' ') && !/^(?:docs|verification)\//.test(candidate)) return null;
  if (!REPOSITORY_PATH_PREFIX.test(candidate) && !ROOT_FILES.has(candidate)) return null;
  return candidate;
}

function citedPaths(context, sources) {
  const rows = [];
  for (const document of sources.filter(item => item.available)) {
    const source = currentClaimScope(document.file, document.source);
    const candidates = [];
    for (const match of source.matchAll(/`([^`\r\n]+)`/g)) candidates.push({ value: match[1], offset: match.index });
    for (const match of source.matchAll(/\]\(([^)\r\n]+)\)/g)) candidates.push({ value: match[1], offset: match.index });
    for (const item of candidates) {
      const cited = cleanPathCandidate(item.value);
      if (!cited) continue;
      const wildcard = /(?:\/\*\*?|\*)$/.test(cited);
      const base = cited.replace(/\/\*\*?$/, '').replace(/\*$/, '').replace(/\/$/, '');
      const resolves = wildcard
        ? context.files.some(file => file === base || file.startsWith(`${base}/`))
        : context.exists(base);
      rows.push({ document: document.file, line: lineNumber(source, item.offset), path: cited, base, wildcard, resolves });
    }
  }
  const unique = new Map();
  for (const row of rows) {
    const key = `${row.document}\0${row.path}`;
    if (!unique.has(key) || row.line < unique.get(key).line) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => `${a.document}\0${a.path}`.localeCompare(`${b.document}\0${b.path}`));
}

function citedShas(context, sources) {
  const occurrences = [];
  for (const document of sources.filter(item => item.available)) {
    const source = currentClaimScope(document.file, document.source);
    for (const match of source.matchAll(/(?<![a-f0-9])([a-f0-9]{7,40})(?![a-f0-9])/gi)) {
      const start = source.lastIndexOf('\n', match.index) + 1;
      const end = source.indexOf('\n', match.index);
      const line = source.slice(start, end < 0 ? source.length : end);
      const abbreviated = match[1].length < 40;
      if (/sha-?256/i.test(line) || /(?:\.\.\.|…)/.test(line) ||
          (abbreviated && !/(?:commit|head|branch|baseline|anchor|origin\/main)/i.test(line))) continue;
      occurrences.push({ document: document.file, line: lineNumber(source, match.index), sha: match[1].toLowerCase() });
    }
  }
  const availability = new Map();
  for (const sha of [...new Set(occurrences.map(item => item.sha))].sort()) {
    try { runGit(context.root, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]); availability.set(sha, true); }
    catch (_) { availability.set(sha, false); }
  }
  return occurrences.map(item => ({ ...item, exists: availability.get(item.sha) }))
    .sort((a, b) => `${a.document}\0${a.line}\0${a.sha}`.localeCompare(`${b.document}\0${b.line}\0${b.sha}`));
}

function testDomain(line) {
  const value = String(line || '').toLowerCase();
  if (/node\s+--test\s+tests\//.test(value) || /whole-app-audit-runner/.test(value)) return 'auxiliaryFocused';
  if (/api[- ]?23|instrumentation/.test(value)) return 'api23External';
  if (/complete offline|full offline|offline regression|permanent offline|automated baseline/.test(value)) return 'completeOffline';
  if (/main offline|offline\/storage\/security/.test(value)) return 'mainOffline';
  if (/modular/.test(value)) return 'modular';
  if (/\bc1\b/.test(value)) return 'c1';
  if (/mobile layout/.test(value)) return 'mobile';
  if (/settings/.test(value)) return 'settings';
  if (/language/.test(value)) return 'language';
  if (/\betp\b/.test(value)) return 'etp';
  if (/large-record focused/.test(value)) return 'largeRecordFocused';
  if (/storage\/recovery|focused storage/.test(value)) return 'storageRecoveryFocused';
  return 'unclassified';
}

function testClaims(sources) {
  const rows = [];
  for (const document of sources.filter(item => item.available && CURRENT_TEST_CLAIM_DOCUMENTS.has(item.file))) {
    const source = currentClaimScope(document.file, document.source);
    for (const lineMatch of source.matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)) {
      const line = lineMatch[0].replace(/\r?\n$/, '');
      if (!line) continue;
      const patterns = [
        /(\d+)\s*\/\s*(\d+)\s*(?:passed|pass|passing)\b/gi,
        /(\d+)\s+of\s+(\d+)[^\r\n]{0,80}\b(?:tests?|passing|passed)\b/gi
      ];
      for (const pattern of patterns) for (const match of line.matchAll(pattern)) {
        rows.push({ document: document.file, line: lineNumber(source, lineMatch.index + match.index), domain: testDomain(line),
          passed: Number(match[1]), total: Number(match[2]) });
      }
    }
  }
  const unique = new Map();
  for (const row of rows) unique.set(`${row.document}\0${row.line}\0${row.domain}\0${row.passed}\0${row.total}`, row);
  return [...unique.values()].sort((a, b) => `${a.document}\0${a.line}\0${a.domain}`.localeCompare(`${b.document}\0${b.line}\0${b.domain}`));
}

function measuredTestCounts(context) {
  const evidence = context.testEvidence || {};
  const counts = evidence.counts && typeof evidence.counts === 'object' ? evidence.counts : {};
  const supported = ['completeOffline', 'c1', 'mobile', 'settings', 'language', 'etp', 'modular', 'mainOffline'];
  const result = {};
  for (const key of supported) {
    const value = counts[key];
    if (Number.isSafeInteger(value) && value >= 0) result[key] = value;
  }
  const failures = Number.isSafeInteger(counts.fail) && counts.fail >= 0 ? counts.fail : null;
  const cancelled = Number.isSafeInteger(counts.cancelled) && counts.cancelled >= 0 ? counts.cancelled : null;
  const skipped = Number.isSafeInteger(counts.skipped) && counts.skipped >= 0 ? counts.skipped : null;
  const todo = Number.isSafeInteger(counts.todo) && counts.todo >= 0 ? counts.todo : null;
  const suiteFields = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const requiredSuites = Object.keys(REQUIRED_TEST_SUITES).sort();
  const suiteObject = evidence.suites && typeof evidence.suites === 'object' && !Array.isArray(evidence.suites)
    ? evidence.suites : null;
  const suiteKeys = suiteObject ? Object.keys(suiteObject).sort() : [];
  const exactSuiteSet = suiteKeys.length === requiredSuites.length &&
    suiteKeys.every((name, index) => name === requiredSuites[index]);
  const suiteRowsValid = exactSuiteSet && requiredSuites.every(name => {
    const row = suiteObject[name];
    return row && typeof row === 'object' && !Array.isArray(row) &&
      suiteFields.every(field => Number.isSafeInteger(row[field]) && row[field] >= 0);
  });
  const suiteFindings = [];
  if (suiteRowsValid) {
    const derived = { completeOffline: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
    const zeroFields = Object.freeze({ fail: 'FAILURES', cancelled: 'CANCELLATIONS', skipped: 'SKIPS', todo: 'TODO' });
    for (const name of requiredSuites) {
      const row = suiteObject[name];
      derived[REQUIRED_TEST_SUITES[name]] = row.tests;
      derived.completeOffline += row.tests;
      for (const field of ['pass', 'fail', 'cancelled', 'skipped', 'todo']) derived[field] += row[field];
      if (row.pass !== row.tests) suiteFindings.push({ code: 'MEASURED_TEST_SUITE_PASS_TOTAL_MISMATCH',
        suite: name, tests: row.tests, passed: row.pass });
      for (const [field, code] of Object.entries(zeroFields)) {
        if (row[field] !== 0) suiteFindings.push({ code: `MEASURED_TEST_SUITE_${code}`, suite: name, [field]: row[field] });
      }
    }
    for (const key of [...supported, 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      if (Number.isSafeInteger(counts[key]) && counts[key] !== derived[key]) suiteFindings.push({
        code: 'MEASURED_TEST_AGGREGATE_MISMATCH', field: key, measured: counts[key], derived: derived[key]
      });
    }
    if (Number.isSafeInteger(evidence.totalCount) && evidence.totalCount !== derived.completeOffline) suiteFindings.push({
      code: 'MEASURED_TEST_TOTAL_MISMATCH', measured: evidence.totalCount, derived: derived.completeOffline
    });
    if (Number.isSafeInteger(evidence.passedCount) && evidence.passedCount !== derived.pass) suiteFindings.push({
      code: 'MEASURED_TEST_PASSED_MISMATCH', measured: evidence.passedCount, derived: derived.pass
    });
    if (evidence.passed !== true) suiteFindings.push({ code: 'MEASURED_TEST_RUN_NOT_PASSED' });
  }
  const aggregateAvailable = [...supported, 'pass', 'fail', 'cancelled', 'skipped', 'todo']
    .every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0) &&
    Number.isSafeInteger(evidence.totalCount) && evidence.totalCount >= 0 &&
    Number.isSafeInteger(evidence.passedCount) && evidence.passedCount >= 0 && typeof evidence.passed === 'boolean';
  return {
    counts: result,
    passedCount: Number.isSafeInteger(evidence.passedCount) ? evidence.passedCount : counts.pass,
    totalCount: Number.isSafeInteger(evidence.totalCount) ? evidence.totalCount : null,
    failures,
    cancelled,
    skipped,
    todo,
    suites: suiteRowsValid ? requiredSuites.length : null,
    suiteFindings,
    available: supported.every(key => Number.isSafeInteger(result[key])) &&
      aggregateAvailable && suiteRowsValid
  };
}

function declaredBaselines(sources) {
  const rows = [];
  const wanted = new Set(['docs/audit/HANDOFF.md', 'docs/audit/AUDIT-PROGRAM-v1.md']);
  for (const document of sources.filter(item => item.available && wanted.has(item.file))) {
    const source = currentClaimScope(document.file, document.source);
    for (const match of source.matchAll(/(?:Product anchor|Product baseline SHA)\s*(?:\||:)?\s*`([a-f0-9]{40})`/gi)) {
      rows.push({ document: document.file, line: lineNumber(source, match.index), sha: match[1].toLowerCase() });
    }
  }
  return rows.sort((a, b) => `${a.document}\0${a.line}`.localeCompare(`${b.document}\0${b.line}`));
}

function directContradictions(sources) {
  const claims = [];
  const byFile = new Map(sources.filter(item => item.available).map(item => [item.file, currentClaimScope(item.file, item.source)]));
  const addSha = (file, pattern, family) => {
    const source = byFile.get(file) || '';
    for (const match of source.matchAll(pattern)) claims.push({ family, value: match[1].toLowerCase(), document: file,
      line: lineNumber(source, match.index) });
  };
  addSha('docs/audit/HANDOFF.md', /\|\s*Product anchor\s*\|\s*`([a-f0-9]{40})`/gi, 'current-product-sha');
  addSha('docs/audit/AUDIT-PROGRAM-v1.md', /Product anchor:\s*`([a-f0-9]{40})`/gi, 'current-product-sha');
  addSha('docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md', /\|\s*Baseline source\s*\|\s*`([a-f0-9]{40})`/gi, 'current-product-sha');
  addSha('docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md', /main`?\s+and\s+`?origin\/main`?\s+are\s+recorded\s+at\s*\r?\n\s*`([a-f0-9]{40})`/gi, 'current-product-sha');

  const stateClaims = [
    { family: 'etp-core-state', value: 'frozen', document: 'docs/audit/HANDOFF.md', pattern: /retail-etp-core-v1`?\s+is\s+frozen/i },
    { family: 'etp-core-state', value: 'frozen', document: 'verification/ETP-CORE-CONTRACT-CLOSURE-HANDOFF-2026-08-09.md', pattern: /Frozen contract:\s*`retail-etp-core-v1`/i },
    { family: 'formal-device-acceptance', value: 'open', document: 'docs/audit/HANDOFF.md', pattern: /Open acceptance gates/i },
    { family: 'formal-device-acceptance', value: 'open', document: 'verification/ETP-CORE-REAL-CONFORMANCE-2026-08-09.json', pattern: /"formalDeviceAcceptance"\s*:\s*false/i },
    { family: 'modular-hardening', value: 'pending', document: 'docs/audit/HANDOFF.md', pattern: /full modular hardening still pending/i },
    { family: 'php-scope', value: 'excluded', document: 'docs/audit/AUDIT-PROGRAM-v1.md', pattern: /Excludes PHP\/server work/i }
  ];
  for (const claim of stateClaims) {
    const source = byFile.get(claim.document) || '';
    const match = source.match(claim.pattern);
    if (match) claims.push({ family: claim.family, value: claim.value, document: claim.document,
      line: lineNumber(source, match.index) });
  }

  const conflicts = [];
  for (const family of [...new Set(claims.map(item => item.family))].sort()) {
    const familyClaims = claims.filter(item => item.family === family);
    const values = [...new Set(familyClaims.map(item => item.value))];
    if (values.length <= 1) continue;
    familyClaims.forEach(item => conflicts.push({ ...item, code: 'CURRENT_AUTHORITY_CONTRADICTION' }));
  }
  return { claims: claims.sort((a, b) => `${a.family}\0${a.document}\0${a.line}`.localeCompare(`${b.family}\0${b.document}\0${b.line}`)),
    conflicts: conflicts.sort((a, b) => `${a.family}\0${a.document}\0${a.line}`.localeCompare(`${b.family}\0${b.document}\0${b.line}`)) };
}

export async function run(context) {
  const sources = authoritySources(context);
  const missingAuthority = sources.filter(item => !item.available).map(item => ({ path: item.file, code: 'CURRENT_AUTHORITY_DOCUMENT_MISSING' }));
  const paths = citedPaths(context, sources);
  const missingPaths = paths.filter(item => !item.resolves).map(item => ({ path: item.path, document: item.document,
    line: item.line, code: 'CITED_PATH_UNRESOLVED' }));
  const shas = citedShas(context, sources);
  const missingShas = shas.filter(item => !item.exists).map(item => ({ path: item.document, line: item.line,
    code: 'CITED_COMMIT_MISSING', sha: item.sha }));
  const claims = testClaims(sources);
  const externalClaims = claims.filter(claim => EXTERNAL_TEST_CLAIM_DOMAINS.has(claim.domain));
  const comparableClaims = claims.filter(claim => !EXTERNAL_TEST_CLAIM_DOMAINS.has(claim.domain));
  const measured = measuredTestCounts(context);
  const countMismatches = [];
  countMismatches.push(...measured.suiteFindings);
  const unsupportedClaims = [];
  for (const claim of comparableClaims) {
    const expected = measured.counts[claim.domain];
    if (!Number.isSafeInteger(expected)) { unsupportedClaims.push(claim); continue; }
    if (claim.passed !== expected || claim.total !== expected) countMismatches.push({ path: claim.document, line: claim.line,
      code: 'CURRENT_TEST_COUNT_MISMATCH', domain: claim.domain, claimedPassed: claim.passed,
      claimedTotal: claim.total, measuredPassed: expected, measuredTotal: expected });
  }
  if (measured.failures !== null && measured.failures !== 0) countMismatches.push({ code: 'MEASURED_TEST_FAILURES',
    failures: measured.failures });
  if (measured.cancelled !== null && measured.cancelled !== 0) countMismatches.push({ code: 'MEASURED_TEST_CANCELLATIONS',
    cancelled: measured.cancelled });
  if (measured.skipped !== null && measured.skipped !== 0) countMismatches.push({ code: 'MEASURED_TEST_SKIPS',
    skipped: measured.skipped });
  if (measured.todo !== null && measured.todo !== 0) countMismatches.push({ code: 'MEASURED_TEST_TODO',
    todo: measured.todo });
  let countResult = 'unmeasured';
  if (measured.available) countResult = countMismatches.length ? 'fail' : (unsupportedClaims.length ? 'unmeasured' : 'pass');

  const baselines = declaredBaselines(sources);
  const requestedBaseline = context.options && context.options.productBaseline;
  const baselineFindings = [];
  if (!/^[a-f0-9]{40}$/.test(String(requestedBaseline || ''))) baselineFindings.push({ code: 'REQUESTED_BASELINE_INVALID' });
  if (requestedBaseline && requestedBaseline !== PRODUCT_BASELINE_SHA) baselineFindings.push({ code: 'REQUESTED_BASELINE_DISAGREES_WITH_RUNNER',
    requestedSha: requestedBaseline, runnerSha: PRODUCT_BASELINE_SHA });
  for (const row of baselines) if (row.sha !== PRODUCT_BASELINE_SHA) baselineFindings.push({ path: row.document, line: row.line,
    code: 'CONTROLLING_BASELINE_MISMATCH', declaredSha: row.sha, expectedSha: PRODUCT_BASELINE_SHA });
  if (baselines.length < 2) baselineFindings.push({ code: 'CONTROLLING_BASELINE_DECLARATION_MISSING', declarations: baselines.length });

  const contradictions = directContradictions(sources);
  const checks = [
    makeCheck({
      id: 'A11-01', title: 'Current-authority cited paths resolve',
      result: missingAuthority.length || missingPaths.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { authorityDocuments: sources.length, missingAuthorityDocuments: missingAuthority.length,
        citedRepositoryPaths: paths.length, unresolvedPaths: missingPaths.length },
      rule: 'Every repository path cited by a current-authority scope must resolve in the audited snapshot.',
      evidence: [...missingAuthority, ...missingPaths],
      notes: 'External absolute paths and template placeholders are not treated as repository-path claims; explicitly historical sections are excluded.'
    }),
    makeCheck({
      id: 'A11-02', title: 'Current-authority cited commits exist',
      result: missingShas.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { citedCommitOccurrences: shas.length, uniqueCommits: new Set(shas.map(item => item.sha)).size,
        missingCommits: new Set(missingShas.map(item => item.sha)).size },
      rule: 'Every Git commit SHA cited by current-authority scope must resolve as a commit in the repository.',
      evidence: missingShas,
      notes: 'SHA-256 evidence hashes and explicitly historical tail sections are not interpreted as Git commit claims.'
    }),
    makeCheck({
      id: 'A11-03', title: 'Current-authority test counts match measured counts',
      result: countResult, severity: 'P1', mandatory: true,
      metric: { claims: claims.length, comparableClaims: comparableClaims.length,
        supportedClaims: comparableClaims.length - unsupportedClaims.length,
        excludedExternalClaims: externalClaims.length, unsupportedClaims: unsupportedClaims.length,
        mismatches: countMismatches.length,
        measuredCounts: measured.counts, measuredFailures: measured.failures,
        measuredCancelled: measured.cancelled, measuredSkipped: measured.skipped, measuredTodo: measured.todo,
        measuredSuites: measured.suites, measuredTotal: measured.totalCount, measuredPassed: measured.passedCount },
      rule: 'Current-authority test-count claims must equal the identity-bound measured suite counts for this exact target, with zero failures, cancellations, skips or TODO tests.',
      evidence: countMismatches.length ? countMismatches : unsupportedClaims.map(item => ({ path: item.document, line: item.line,
        code: 'TEST_COUNT_ENVIRONMENT_UNMEASURED', domain: item.domain })),
      notes: !measured.available ? 'The test run did not expose safe structured assertion counts; a pass is not inferred from exit code alone.'
        : (unsupportedClaims.length ? 'At least one current claim could not be mapped to a measured suite.' :
          (externalClaims.length ? 'Explicit external/focused-suite claims are recorded but excluded from the seven-suite offline comparison.' : ''))
    }),
    makeCheck({
      id: 'A11-04', title: 'Controlling product baseline identity',
      result: baselineFindings.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { runnerProductBaselineSha: PRODUCT_BASELINE_SHA, requestedProductBaselineSha: requestedBaseline || null,
        declarations: baselines.length, mismatches: baselineFindings.length },
      rule: 'The audit program, current handoff, runner constant and requested baseline must declare the exact same 40-character product anchor.',
      evidence: baselineFindings
    }),
    makeCheck({
      id: 'A11-05', title: 'Current-authority contradictions',
      result: contradictions.conflicts.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { typedClaims: contradictions.claims.length,
        claimFamilies: new Set(contradictions.claims.map(item => item.family)).size,
        conflictingFamilies: new Set(contradictions.conflicts.map(item => item.family)).size,
        conflictingClaims: contradictions.conflicts.length,
        claimSetSha256: sha256(JSON.stringify(contradictions.claims)) },
      rule: 'Typed present-state claims among current-authority scopes must not assign different values to the same fact.',
      evidence: contradictions.conflicts.map(item => ({ path: item.document, line: item.line, code: item.code,
        family: item.family, value: item.value })),
      notes: 'Starting SHAs, superseded decision-register sections, prior APK evidence and explicitly historical sections are excluded from present-state comparison.'
    })
  ];

  return auditResult('A11', 'Documentation currency', checks, {
    authorityDocuments: sources.length,
    unresolvedPaths: missingPaths.length,
    missingCommits: missingShas.length,
    testCountMismatches: countMismatches.length,
    contradictionFamilies: new Set(contradictions.conflicts.map(item => item.family)).size
  });
}
