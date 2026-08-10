import { hasRunnerControlledProvenance } from '../controlled-probes.mjs';
import { parseGeneratedSigningConfiguration } from '../capture-build.mjs';
import { auditResult, lineNumber, makeCheck, posix, sha256 } from '../lib.mjs';
import { canonicalSha256 } from '../schema.mjs';

const HEX_40 = /^[a-f0-9]{40}$/i;
const HEX_64 = /^[a-f0-9]{64}$/i;
const REQUIRED_SIGNING_ENV = Object.freeze([
  'SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD', 'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD'
]);
const GENERATED_HASH_FIELDS = Object.freeze([
  'generatedAndroidSha256', 'generatedAppGradleSha256', 'generatedManifestSha256',
  'generatedBuildIdentitySha256', 'generatedRootGradleSha256', 'generatedVariablesGradleSha256',
  'gradleWrapperJarSha256', 'gradleWrapperPropertiesSha256', 'gradleWrapperLauncherSha256', 'generatedRecipeSha256'
]);

function safeBuildEvidence(context) {
  const input = context.options && context.options.buildEvidence;
  const source = input ? 'runner-controlled-probe' : 'none';
  if (!input) return { available: false, valid: false, source, code: 'TWO_BUILD_EVIDENCE_ABSENT' };
  if (!hasRunnerControlledProvenance(context.controlledProbeProvenance, input, 'build', context)) {
    return { available: true, valid: false, source: 'untrusted-object', code: 'BUILD_EVIDENCE_NOT_RUNNER_CONTROLLED' };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { available: true, valid: false, source, code: 'BUILD_EVIDENCE_SCHEMA_INVALID' };
  }
  const topKeys = Object.keys(input).sort();
  const expectedTopKeys = ['differenceClass', 'first', 'format', 'identityBound', 'normalizedEqual',
    'rawEqual', 'schemaVersion', 'second', 'toolchainMatch'].sort();
  if (input.format !== 'SAAGAR_AUDIT_APK_COMPARISON' || input.schemaVersion !== 2 ||
      JSON.stringify(topKeys) !== JSON.stringify(expectedTopKeys)) {
    return { available: true, valid: false, source, code: 'BUILD_EVIDENCE_SCHEMA_INVALID' };
  }
  const first = input.first || {};
  const second = input.second || {};
  const firstBuild = first.build;
  const secondBuild = second.build;
  const expectedProduct = context.productFingerprint && context.productFingerprint.treeSha256;
  const buildShape = build => build && typeof build === 'object' && !Array.isArray(build) &&
    HEX_40.test(String(build.sourceSha || '')) && HEX_64.test(String(build.productFingerprintSha256 || '')) &&
    HEX_64.test(String(build.toolchainSha256 || '')) && HEX_64.test(String(build.recipeSha256 || '')) &&
    build.command === 'npm run build:apk' && build.bootstrapCommand === 'npm run add:android' &&
    build.signingMode === 'debug' && GENERATED_HASH_FIELDS.every(field => HEX_64.test(String(build[field] || ''))) &&
    build.androidConfiguration && typeof build.androidConfiguration === 'object' &&
    build.gradle && typeof build.gradle === 'object' && HEX_64.test(String(build.gradle.outputSha256 || '')) &&
    build.gradle.daemonJvmMatchesJavaHome === true && typeof build.gradle.actualJvmVersion === 'string' &&
    build.gradle.actualJvmVersion !== '' && build.gradle.actualJvmVersion === build.gradle.javaHomeJvmVersion;
  if (!buildShape(firstBuild) || !buildShape(secondBuild)) {
    return { available: true, valid: false, source, code: 'BUILD_EVIDENCE_CAPTURE_BINDING_INVALID' };
  }
  if (firstBuild.sourceSha !== context.head || secondBuild.sourceSha !== context.head ||
      firstBuild.productFingerprintSha256 !== expectedProduct || secondBuild.productFingerprintSha256 !== expectedProduct) {
    return { available: true, valid: false, source, code: 'BUILD_EVIDENCE_TARGET_MISMATCH' };
  }
  const values = {
    rawEqual: input.rawEqual,
    normalizedEqual: input.normalizedEqual,
    toolchainMatch: input.toolchainMatch,
    identityBound: input.identityBound,
    apk1Sha256: first.sha256,
    apk2Sha256: second.sha256,
    normalized1Sha256: first.normalized && first.normalized.sha256,
    normalized2Sha256: second.normalized && second.normalized.sha256,
    firstBytes: Number.isSafeInteger(first.bytes) && first.bytes >= 0 ? first.bytes : undefined,
    secondBytes: Number.isSafeInteger(second.bytes) && second.bytes >= 0 ? second.bytes : undefined,
    firstEntries: first.normalized && Number.isSafeInteger(first.normalized.entryCount) ? first.normalized.entryCount : undefined,
    secondEntries: second.normalized && Number.isSafeInteger(second.normalized.entryCount) ? second.normalized.entryCount : undefined,
    firstExcludedSignatures: first.normalized && Number.isSafeInteger(first.normalized.excludedSignatureEntryCount)
      ? first.normalized.excludedSignatureEntryCount : undefined,
    secondExcludedSignatures: second.normalized && Number.isSafeInteger(second.normalized.excludedSignatureEntryCount)
      ? second.normalized.excludedSignatureEntryCount : undefined
  };
  const booleansValid = ['rawEqual', 'normalizedEqual', 'toolchainMatch', 'identityBound']
    .every(key => typeof values[key] === 'boolean');
  const hashesValid = ['apk1Sha256', 'apk2Sha256', 'normalized1Sha256', 'normalized2Sha256']
    .every(key => HEX_64.test(String(values[key] || '')));
  const equalityConsistent = hashesValid &&
    values.rawEqual === (values.apk1Sha256 === values.apk2Sha256) &&
    values.normalizedEqual === (values.normalized1Sha256 === values.normalized2Sha256);
  const differenceConsistent = input.differenceClass === (values.rawEqual ? 'identical'
    : values.normalizedEqual ? 'metadata-or-signing-only' : 'normalized-content');
  const computedIdentityBound = firstBuild.sourceSha === secondBuild.sourceSha &&
    firstBuild.productFingerprintSha256 === secondBuild.productFingerprintSha256 &&
    firstBuild.command === secondBuild.command && firstBuild.bootstrapCommand === secondBuild.bootstrapCommand &&
    firstBuild.signingMode === secondBuild.signingMode;
  const generatedAgreement = GENERATED_HASH_FIELDS.every(field => firstBuild[field] === secondBuild[field]) &&
    canonicalSha256(firstBuild.androidConfiguration) === canonicalSha256(secondBuild.androidConfiguration) &&
    canonicalSha256(firstBuild.gradle) === canonicalSha256(secondBuild.gradle);
  const computedToolchainMatch = computedIdentityBound && generatedAgreement &&
    firstBuild.toolchainSha256 === secondBuild.toolchainSha256 &&
    firstBuild.recipeSha256 === secondBuild.recipeSha256;
  if (!booleansValid || !hashesValid || !equalityConsistent || !differenceConsistent ||
      values.identityBound !== computedIdentityBound || values.toolchainMatch !== computedToolchainMatch) {
    return { available: true, valid: false, source, code: 'BUILD_EVIDENCE_SCHEMA_INVALID' };
  }
  return { available: true, valid: true, source, firstBuild, secondBuild, ...values };
}

function property(source, name, kind = 'string') {
  const expression = kind === 'number'
    ? new RegExp(`\\b${name}\\s*:\\s*(\\d+)\\b`)
    : new RegExp(`\\b${name}\\s*:\\s*(['"])([^'"]+)\\1`);
  const match = source.match(expression);
  if (!match) return null;
  return kind === 'number' ? Number(match[1]) : match[2];
}

function trackedIdentity(context) {
  const required = ['www/build-identity.js', 'www/index.html', 'build-overrides/apply-overrides.js',
    'scripts/release-register.mjs', 'capacitor.config.json'];
  const rows = [];
  for (const file of required) if (!context.exists(file)) rows.push({ path: file, code: 'IDENTITY_SOURCE_MISSING' });
  if (rows.length) return { rows, identity: null, canonicalSha256: null, comparedSources: 0 };

  const canonicalSource = context.read('www/build-identity.js');
  const identity = {
    packageId: property(canonicalSource, 'packageId'),
    appVersion: property(canonicalSource, 'appVersion'),
    versionName: property(canonicalSource, 'versionName'),
    versionCode: property(canonicalSource, 'versionCode', 'number'),
    minSdk: property(canonicalSource, 'minSdk', 'number')
  };
  if (!identity.packageId || !identity.appVersion || !identity.versionName ||
      !Number.isSafeInteger(identity.versionCode) || !Number.isSafeInteger(identity.minSdk)) {
    rows.push({ path: 'www/build-identity.js', code: 'CANONICAL_IDENTITY_PARSE_FAILURE' });
    return { rows, identity, canonicalSha256: sha256(canonicalSource), comparedSources: 1 };
  }

  try {
    const capacitor = JSON.parse(context.read('capacitor.config.json'));
    if (capacitor.appId !== identity.packageId) {
      rows.push({ path: 'capacitor.config.json', code: 'PACKAGE_ID_MISMATCH', field: 'appId' });
    }
  } catch (_) { rows.push({ path: 'capacitor.config.json', code: 'CAPACITOR_IDENTITY_PARSE_FAILURE' }); }

  const consumers = [
    { path: 'www/index.html', rules: [/SaagarBuildIdentity\.appVersion/, /SaagarBuildIdentity\.versionName/, /SaagarBuildIdentity\.versionCode/] },
    { path: 'build-overrides/apply-overrides.js', rules: [
      /require\(['"]\.\.\/www\/build-identity\.js['"]\)/,
      /BUILD_IDENTITY\.versionCode/, /BUILD_IDENTITY\.versionName/, /BUILD_IDENTITY\.minSdk/
    ] },
    { path: 'scripts/release-register.mjs', rules: [
      /BUILD_IDENTITY\.packageId/, /BUILD_IDENTITY\.appVersion/,
      /BUILD_IDENTITY\.versionName/, /BUILD_IDENTITY\.versionCode/
    ] }
  ];
  for (const consumer of consumers) {
    const source = context.read(consumer.path);
    consumer.rules.forEach((rule, index) => {
      if (!rule.test(source)) rows.push({ path: consumer.path,
        code: 'CENTRAL_IDENTITY_CONSUMER_MISSING', consumerRule: index + 1 });
    });
  }
  return { rows, identity, canonicalSha256: sha256(canonicalSource), comparedSources: required.length };
}

export function assessGeneratedIdentityReceipts(identity, canonicalSourceSha256, firstBuild, secondBuild) {
  const rows = [];
  if (!identity || !HEX_64.test(String(canonicalSourceSha256 || '')) || !firstBuild || !secondBuild) {
    return [{ code: 'GENERATED_ANDROID_IDENTITY_RECEIPT_MISSING' }];
  }
  for (const field of GENERATED_HASH_FIELDS) {
    if (!HEX_64.test(String(firstBuild[field] || '')) || !HEX_64.test(String(secondBuild[field] || ''))) {
      rows.push({ code: 'GENERATED_ANDROID_HASH_MISSING', field });
    } else if (firstBuild[field] !== secondBuild[field]) {
      rows.push({ code: 'GENERATED_ANDROID_RECEIPTS_DISAGREE', field });
    }
  }
  const first = firstBuild.androidConfiguration;
  const second = secondBuild.androidConfiguration;
  if (!first || !second) return [...rows, { code: 'GENERATED_ANDROID_CONFIGURATION_MISSING' }];
  if (canonicalSha256(first) !== canonicalSha256(second)) {
    rows.push({ code: 'GENERATED_ANDROID_RECEIPTS_DISAGREE', field: 'androidConfiguration' });
  }
  for (const [index, configuration] of [first, second].entries()) {
    for (const field of ['packageId', 'versionName', 'versionCode', 'minSdk']) {
      if (configuration[field] !== identity[field]) rows.push({ code: 'GENERATED_ANDROID_IDENTITY_MISMATCH',
        build: index + 1, field });
    }
  }
  [firstBuild, secondBuild].forEach((build, index) => {
    if (build.generatedBuildIdentitySha256 !== canonicalSourceSha256) {
      rows.push({ code: 'GENERATED_BUILD_IDENTITY_HASH_MISMATCH', build: index + 1 });
    }
  });
  return rows;
}
const MAX_SIGNING_OVERRIDE_BYTES = 512 * 1024;

function javascriptCodeMask(source) {
  const masked = source.split('');
  const quoteMark = String.fromCharCode(96);
  for (let index = 0; index < source.length;) {
    if (index === 0 && source.startsWith('#!')) {
      while (index < source.length && source[index] !== '\n') masked[index++] = ' ';
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') masked[index++] = ' ';
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      masked[index++] = ' '; masked[index++] = ' ';
      let closed = false;
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          masked[index++] = ' '; masked[index++] = ' '; closed = true; break;
        }
        if (source[index] !== '\n' && source[index] !== '\r') masked[index] = ' ';
        index += 1;
      }
      if (!closed) return null;
      continue;
    }
    if (source[index] === '/') {
      masked[index++] = ' ';
      let escaped = false, inClass = false, closed = false;
      while (index < source.length) {
        const character = source[index];
        masked[index] = character === '\n' || character === '\r' ? character : ' ';
        if (!escaped && character === '[') inClass = true;
        else if (!escaped && character === ']') inClass = false;
        else if (!escaped && character === '/' && !inClass) {
          index += 1;
          while (index < source.length && /[A-Za-z]/.test(source[index])) masked[index++] = ' ';
          closed = true; break;
        }
        escaped = !escaped && character === '\\';
        if (character !== '\\') escaped = false;
        index += 1;
      }
      if (!closed) return null;
      continue;
    }
    if (source[index] === '"' || source[index] === "'" || source[index] === quoteMark) {
      const quote = source[index]; masked[index++] = ' ';
      let closed = false;
      while (index < source.length) {
        if (source[index] === '\\') {
          masked[index++] = ' ';
          if (index < source.length) masked[index++] = ' ';
          continue;
        }
        if (source[index] === quote) { masked[index++] = ' '; closed = true; break; }
        if (source[index] !== '\n' && source[index] !== '\r') masked[index] = ' ';
        index += 1;
      }
      if (!closed) return null;
      continue;
    }
    index += 1;
  }
  return masked.join('');
}

function signingTemplateAt(source, opening) {
  const quoteMark = String.fromCharCode(96);
  if (source[opening] !== quoteMark) return null;
  for (let index = opening + 1; index < source.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (source[index] === '$' && source[index + 1] === '{') return null;
    if (source[index] === quoteMark) return source.slice(opening + 1, index);
  }
  return null;
}

function codeNeedleCount(source, masked, needle) {
  let count = 0, index = -1;
  while ((index = source.indexOf(needle, index + 1)) >= 0) {
    if (masked.slice(index, index + 6) === source.slice(index, index + 6)) count += 1;
  }
  return count;
}

export function assessSigningOverrideSource(input) {
  const source = String(input || '').replace(/\r\n/g, '\n');
  const findings = [];
  const add = code => { if (!findings.some(row => row.code === code)) findings.push({ code }); };
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_SIGNING_OVERRIDE_BYTES) {
    add('SIGNING_OVERRIDE_SIZE_INVALID'); return findings;
  }
  const masked = javascriptCodeMask(source);
  if (!masked) { add('SIGNING_OVERRIDE_STRUCTURE_INVALID'); return findings; }
  const declarations = [...source.matchAll(/\bconst\s+signing\s*=\s*/g)]
    .filter(match => masked[match.index] === source[match.index]);
  if (declarations.length !== 1) { add('SIGNING_OVERRIDE_TEMPLATE_INVALID'); return findings; }
  let opening = declarations[0].index + declarations[0][0].length;
  while (opening < source.length && /\s/.test(source[opening])) opening += 1;
  const template = signingTemplateAt(source, opening);
  if (template === null) { add('SIGNING_OVERRIDE_TEMPLATE_INVALID'); return findings; }
  const androidInsertion = 'gradle = gradle.replace(/android\\s*\\{/, match => match + signing);';
  const buildPatch = [
    'gradle = gradle.replace(',
    '      /(buildTypes\\s*\\{\\s*release\\s*\\{)/,',
    "      '$1\\n            debuggable false\\n            signingConfig signingConfigs.release'",
    '    );'
  ].join('\n');
  if (codeNeedleCount(source, masked, androidInsertion) !== 1) add('SIGNING_OVERRIDE_ANDROID_INSERTION_INVALID');
  if (codeNeedleCount(source, masked, buildPatch) !== 1) add('SIGNING_OVERRIDE_BUILD_TYPE_PATCH_INVALID');
  const synthetic = ['android {', template, 'buildTypes {',
    '  release { debuggable false; signingConfig signingConfigs.release }',
    '  debug { debuggable true }', '}', '}'].join('\n');
  const parsed = parseGeneratedSigningConfiguration(synthetic);
  for (const finding of parsed.findings) {
    if (!findings.some(row => row.code === finding.code && row.field === finding.field)) {
      findings.push({ code: finding.code, ...(finding.field ? { field: finding.field } : {}) });
    }
  }
  return findings;
}


function signingSourceFindings(context) {
  const file = 'build-overrides/apply-overrides.js';
  if (!context.exists(file)) return [{ path: file, code: 'SIGNING_OVERRIDE_MISSING' }];
  return assessSigningOverrideSource(context.read(file))
    .map(row => ({ path: file, code: row.code, ...(row.field ? { field: row.field } : {}) }));
}

export function assessSigningReceipts(firstBuild, secondBuild) {
  const first = firstBuild && firstBuild.androidConfiguration && firstBuild.androidConfiguration.signing;
  const second = secondBuild && secondBuild.androidConfiguration && secondBuild.androidConfiguration.signing;
  if (!first || !second) return [{ code: 'GENERATED_SIGNING_RECEIPT_MISSING' }];
  const rows = [];
  if (canonicalSha256(first) !== canonicalSha256(second)) {
    rows.push({ code: 'GENERATED_SIGNING_RECEIPTS_DISAGREE' });
  }
  [first, second].forEach((signing, index) => {
    const build = index + 1;
    if (signing.captureBuildType !== 'debug') rows.push({ code: 'CAPTURE_BUILD_TYPE_INVALID', build });
    if (signing.releaseDebuggable !== false) rows.push({ code: 'GENERATED_RELEASE_DEBUGGABLE', build });
    if (signing.releaseConfigDeclared !== true) rows.push({ code: 'GENERATED_RELEASE_CONFIG_MISSING', build });
    if (signing.releaseBuildUsesReleaseConfig !== true) rows.push({ code: 'GENERATED_RELEASE_SIGNING_BINDING_MISSING', build });
    if (signing.releaseFailClosed !== true) rows.push({ code: 'GENERATED_RELEASE_FAIL_CLOSED_MISSING', build });
    if (signing.debugUsesReleaseConfig !== false) rows.push({ code: 'GENERATED_DEBUG_USES_RELEASE_CONFIG', build });
    if (JSON.stringify(signing.releaseEnvironmentVariables) !== JSON.stringify(REQUIRED_SIGNING_ENV)) {
      rows.push({ code: 'GENERATED_RELEASE_ENVIRONMENT_CONTRACT_INVALID', build });
    }
  });
  return rows;
}

function seedFindings(context) {
  const file = 'www/index.html';
  const rows = [];
  if (!context.exists(file)) return { rows: [{ path: file, code: 'PRODUCTION_ENTRY_MISSING' }],
    entryFiles: 0, disabledDeclarations: 0 };
  const source = context.read(file);
  const disabled = [...source.matchAll(/\bvar\s+DEMO_SEED_ENABLED\s*=\s*false\s*;/g)];
  for (const match of source.matchAll(/\b(?:var\s+)?DEMO_SEED_ENABLED\s*=\s*true\s*;/g)) {
    const before = source.slice(Math.max(0, match.index - 100), match.index);
    if (/__FORCE_DEMO_SEED\s*===\s*true[\s\S]{0,80}$/i.test(before)) continue;
    rows.push({ path: file, line: lineNumber(source, match.index), code: 'PRODUCTION_SEED_ENABLED' });
  }
  if (disabled.length !== 1) rows.push({ path: file, code: 'PRODUCTION_SEED_DISABLE_DECLARATION_INVALID',
    declarations: disabled.length });
  return { rows, entryFiles: 1, disabledDeclarations: disabled.length };
}

function manifestFindings(context) {
  const rows = [];
  const identities = [
    ...context.modules.map(module => ({ id: module.id, file: module.file, bytes: module.bytes, expectedSha256: module.sha256 })),
    ...context.sharedAssets.map(asset => ({ id: asset.id, file: `www/${posix(asset.file)}`, bytes: asset.bytes, expectedSha256: asset.sha256 }))
  ];
  for (const identity of identities) {
    if (!context.exists(identity.file)) { rows.push({ path: identity.file, code: 'MANIFEST_FILE_MISSING', identity: identity.id }); continue; }
    const content = Buffer.from(context.read(identity.file), 'utf8');
    if (content.length !== identity.bytes) rows.push({ path: identity.file, code: 'MANIFEST_BYTES_MISMATCH', identity: identity.id,
      expectedBytes: identity.bytes, actualBytes: content.length });
    const actualSha256 = sha256(content);
    if (actualSha256 !== identity.expectedSha256) rows.push({ path: identity.file, code: 'MANIFEST_HASH_MISMATCH', identity: identity.id,
      expectedSha256: identity.expectedSha256, actualSha256 });
  }
  return { rows, identities };
}

function gatedResult(sourceRows, receiptRows, build) {
  if (sourceRows.length) return { result: 'fail', severity: 'P0', evidence: sourceRows };
  if (!build.valid) return { result: 'unmeasured', severity: 'INFO', evidence: [{ code: build.code }] };
  if (receiptRows.length) return { result: 'fail', severity: 'P0', evidence: receiptRows };
  return { result: 'pass', severity: 'INFO', evidence: [] };
}

export async function run(context) {
  const build = safeBuildEvidence(context);
  const tracked = trackedIdentity(context);
  const generatedRows = build.valid
    ? assessGeneratedIdentityReceipts(tracked.identity, tracked.canonicalSha256, build.firstBuild, build.secondBuild) : [];
  const identityGate = gatedResult(tracked.rows, generatedRows, build);
  const signingSource = signingSourceFindings(context);
  const signingRows = build.valid ? assessSigningReceipts(build.firstBuild, build.secondBuild) : [];
  const signingGate = gatedResult(signingSource, signingRows, build);
  const seed = seedFindings(context);
  const manifest = manifestFindings(context);

  let buildResult = 'unmeasured';
  let buildSeverity = 'INFO';
  if (build.valid && build.toolchainMatch && build.identityBound) {
    if (!build.normalizedEqual) { buildResult = 'fail'; buildSeverity = 'P1'; }
    else if (!build.rawEqual) { buildResult = 'fail'; buildSeverity = 'P2'; }
    else buildResult = 'pass';
  }
  const buildMetric = build.valid ? {
    source: build.source, identityBound: build.identityBound, toolchainMatch: build.toolchainMatch,
    rawEqual: build.rawEqual, normalizedEqual: build.normalizedEqual,
    firstBytes: build.firstBytes, secondBytes: build.secondBytes,
    firstEntries: build.firstEntries, secondEntries: build.secondEntries,
    firstExcludedSignatureEntries: build.firstExcludedSignatures,
    secondExcludedSignatureEntries: build.secondExcludedSignatures
  } : { source: build.source, available: build.available, valid: false };
  const reproducibilityEvidence = build.valid ? [{ code: 'TWO_BUILD_COMPARISON',
    apk1Sha256: build.apk1Sha256, apk2Sha256: build.apk2Sha256,
    normalized1Sha256: build.normalized1Sha256, normalized2Sha256: build.normalized2Sha256 }]
    : [{ code: build.code }];

  const checks = [
    makeCheck({
      id: 'A9-01', title: 'Isolated APK reproducibility', result: buildResult, severity: buildSeverity, mandatory: true,
      metric: buildMetric,
      rule: 'Two runner-controlled isolated builds under the same recorded toolchain must have equal normalized entry-name/content hashes; raw APK hashes are compared separately.',
      evidence: reproducibilityEvidence,
      notes: build.valid && (!build.toolchainMatch || !build.identityBound)
        ? 'Controlled build outputs did not bind the same target and toolchain; no reproducibility conclusion is made.'
        : (!build.available ? 'No runner-controlled two-build comparison was captured.' : '')
    }),
    makeCheck({
      id: 'A9-02', title: 'Version and build identity agreement', result: identityGate.result,
      severity: identityGate.severity, mandatory: true,
      metric: { comparedTrackedSources: tracked.comparedSources, trackedMismatches: tracked.rows.length,
        generatedMismatches: generatedRows.length, generatedBuilds: build.valid ? 2 : 0,
        canonical: tracked.identity },
      rule: 'Tracked centralized identity consumers and both runner-generated Android receipts must agree on package, version, minimum SDK and generated source identities.',
      evidence: identityGate.evidence,
      notes: identityGate.result === 'unmeasured'
        ? 'Tracked identity sources were checked, but no trusted generated Android receipt was available.' : ''
    }),
    makeCheck({
      id: 'A9-03', title: 'Production seed enablement', result: seed.rows.length ? 'fail' : 'pass',
      severity: 'P0', mandatory: true,
      metric: { committedProductionEntries: seed.entryFiles, disabledDeclarations: seed.disabledDeclarations,
        enablementFindings: seed.rows.length },
      rule: 'Every committed production entry asset must contain exactly one disabled demo-seed declaration and no unconditional enabled declaration.',
      evidence: seed.rows,
      notes: 'The explicit test-harness force flag and the separate seeded-build transformer are not production enablement.'
    }),
    makeCheck({
      id: 'A9-04', title: 'Module manifest byte and hash integrity', result: manifest.rows.length ? 'fail' : 'pass',
      severity: 'P0', mandatory: true,
      metric: { boundEntries: manifest.identities.length, modules: context.modules.length,
        sharedAssets: context.sharedAssets.length, mismatches: manifest.rows.length },
      rule: 'Every manifest-bound module and shared runtime must match its declared byte count and SHA-256.',
      evidence: manifest.rows
    }),
    makeCheck({
      id: 'A9-05', title: 'Fail-closed release signing', result: signingGate.result,
      severity: signingGate.severity, mandatory: true,
      metric: { requiredEnvironmentInputs: REQUIRED_SIGNING_ENV.length,
        trackedSourceFindings: signingSource.length, generatedReceiptFindings: signingRows.length,
        generatedBuilds: build.valid ? 2 : 0 },
      rule: 'Tracked signing enforcement and both post-override generated receipts must prove non-debuggable fail-closed release signing without committed secrets.',
      evidence: signingGate.evidence,
      notes: signingGate.result === 'unmeasured'
        ? 'Tracked signing enforcement was checked, but no trusted post-override signing receipt was available.' : ''
    })
  ];

  return auditResult('A9', 'Build and release reproducibility', checks, {
    twoBuildEvidence: build.valid,
    identityMismatches: tracked.rows.length + generatedRows.length,
    manifestMismatches: manifest.rows.length,
    signingMismatches: signingSource.length + signingRows.length
  });
}
