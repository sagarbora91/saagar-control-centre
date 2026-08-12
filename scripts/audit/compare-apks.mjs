import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { compareText, sha256 } from './lib.mjs';
import { canonicalSha256, safeError, safeJson } from './schema.mjs';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const GENERATED_ANDROID_FILES = Object.freeze([
  'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/assets/public/build-identity.js', 'android/build.gradle',
  'android/gradle/wrapper/gradle-wrapper.jar', 'android/gradle/wrapper/gradle-wrapper.properties',
  'android/variables.gradle', 'android/settings.gradle', 'android/capacitor.settings.gradle',
  'android/app/capacitor.build.gradle'
]);
const GENERATED_RECIPE_FILES = Object.freeze([
  'android/settings.gradle', 'android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle'
]);
const OPTIONAL_GENERATED_RECIPE_FILES = Object.freeze(['android/gradle.properties']);
const GRADLE_LAUNCHER_FILES = Object.freeze(['android/gradlew', 'android/gradlew.bat']);
const RELEASE_SIGNING_ENV = Object.freeze(['SAAGAR_KEYSTORE_FILE', 'SAAGAR_KEYSTORE_PASSWORD',
  'SAAGAR_KEY_ALIAS', 'SAAGAR_KEY_PASSWORD'].sort(compareText));

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function findEocd(bytes) {
  const lower = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= lower; offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD) return offset;
  }
  throw new Error('AUDIT_APK_EOCD_MISSING');
}

function publicNormalized(value) {
  return { entryCount: value.entryCount, totalUncompressedBytes: value.totalUncompressedBytes,
    sha256: value.sha256, excludedSignatureEntryCount: value.excludedSignatureEntries.length,
    excludedSignatureMetadataSha256: sha256(value.excludedSignatureEntries.slice().sort(compareText).join('\n')) };
}

export function normalizedApkFingerprint(file) {
  const bytes = fs.readFileSync(file);
  const eocd = findEocd(bytes);
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (disk || centralDisk || diskEntries !== entries) throw new Error('AUDIT_APK_MULTIDISK_UNSUPPORTED');
  if (entries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error('AUDIT_APK_ZIP64_UNSUPPORTED');
  }
  if (centralOffset + centralSize > eocd || eocd + 22 > bytes.length) throw new Error('AUDIT_APK_CENTRAL_BOUNDS_INVALID');
  let cursor = centralOffset;
  const normalized = [];
  const excluded = [];
  const names = new Set();
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== CENTRAL) throw new Error('AUDIT_APK_CENTRAL_INVALID');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) throw new Error('AUDIT_APK_ZIP64_UNSUPPORTED');
    const centralEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (centralEnd > bytes.length) throw new Error('AUDIT_APK_CENTRAL_BOUNDS_INVALID');
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const name = rawName.replaceAll('\\', '/');
    cursor = centralEnd;
    if (!name || names.has(name)) throw new Error('AUDIT_APK_ENTRY_NAME_INVALID');
    names.add(name);
    if (flags & 1) throw new Error('AUDIT_APK_ENCRYPTED_ENTRY');
    if (method !== 0 && method !== 8) throw new Error('AUDIT_APK_COMPRESSION_UNSUPPORTED');
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== LOCAL) throw new Error('AUDIT_APK_LOCAL_INVALID');
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localChecksum = bytes.readUInt32LE(localOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localUncompressedSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameEnd = localOffset + 30 + localNameLength;
    const dataOffset = localNameEnd + localExtraLength;
    if (dataOffset > bytes.length || dataOffset + compressedSize > bytes.length) throw new Error('AUDIT_APK_ENTRY_BOUNDS_INVALID');
    const localName = bytes.subarray(localOffset + 30, localNameEnd).toString('utf8').replaceAll('\\', '/');
    if (localName !== name || localFlags !== flags || localMethod !== method) throw new Error('AUDIT_APK_ENTRY_METADATA_MISMATCH');
    if (!(flags & 8) && (localChecksum !== checksum || localCompressedSize !== compressedSize ||
        localUncompressedSize !== uncompressedSize)) throw new Error('AUDIT_APK_ENTRY_METADATA_MISMATCH');
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: uncompressedSize + 1 });
    if (content.length !== uncompressedSize || crc32(content) !== checksum) throw new Error('AUDIT_APK_ENTRY_INTEGRITY_FAILED');
    if (/^META-INF\/(?:[^/]+\.(?:RSA|DSA|EC|SF)|MANIFEST\.MF)$/i.test(name)) excluded.push(name);
    else normalized.push({ name, bytes: content.length, sha256: sha256(content) });
  }
  if (cursor !== centralOffset + centralSize) throw new Error('AUDIT_APK_CENTRAL_SIZE_MISMATCH');
  normalized.sort((a, b) => compareText(a.name, b.name));
  const body = normalized.map(item => `${item.name}\0${item.bytes}\0${item.sha256}\n`).join('');
  return { entryCount: normalized.length,
    totalUncompressedBytes: normalized.reduce((sum, item) => sum + item.bytes, 0),
    sha256: sha256(body), excludedSignatureEntries: excluded.sort(compareText) };
}

function toolchainFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { fingerprint, ...identity } = value;
  return HEX_64.test(String(fingerprint || '')) && canonicalSha256(identity) === fingerprint ? fingerprint : null;
}

function validatedBootstrap(value) {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort(compareText) : [];
  const expected = ['command', 'elapsedMs', 'exitCode', 'outputSha256', 'sourceAndroidAbsent'].sort(compareText);
  return JSON.stringify(keys) === JSON.stringify(expected) && value.command === 'npm run add:android' &&
    value.sourceAndroidAbsent === true && value.exitCode === 0 && Number.isSafeInteger(value.elapsedMs) &&
    value.elapsedMs >= 0 && HEX_64.test(String(value.outputSha256 || '')) ? value : null;
}

function validatedGeneratedAndroid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.files) ||
      !HEX_64.test(String(value.filesSha256 || '')) || canonicalSha256(value.files) !== value.filesSha256) return null;
  if (JSON.stringify(Object.keys(value).sort(compareText)) !==
      JSON.stringify(['configuration', 'files', 'filesSha256', 'generatedRecipe',
        'gradleLauncher', 'gradleWrapper'].sort(compareText))) return null;
  if (value.files.some(row => !row || Object.keys(row).sort(compareText).join(',') !== 'bytes,file,sha256' ||
      !Number.isSafeInteger(row.bytes) || row.bytes < 1 || !HEX_64.test(String(row.sha256 || '')))) return null;
  const names = value.files.map(row => row.file);
  const allowed = new Set([...GENERATED_ANDROID_FILES, ...OPTIONAL_GENERATED_RECIPE_FILES, ...GRADLE_LAUNCHER_FILES]);
  const launchers = names.filter(file => GRADLE_LAUNCHER_FILES.includes(file));
  if (JSON.stringify(names) !== JSON.stringify([...names].sort(compareText)) || new Set(names).size !== names.length ||
      GENERATED_ANDROID_FILES.some(file => !names.includes(file)) || names.some(file => !allowed.has(file)) ||
      launchers.length !== 1) return null;
  const byName = Object.fromEntries(value.files.map(row => [row.file, row]));
  const wrapper = value.gradleWrapper;
  if (!wrapper || Object.keys(wrapper).sort(compareText).join(',') !== 'jarSha256,propertiesSha256' ||
      wrapper.jarSha256 !== byName['android/gradle/wrapper/gradle-wrapper.jar'].sha256 ||
      wrapper.propertiesSha256 !== byName['android/gradle/wrapper/gradle-wrapper.properties'].sha256) return null;
  const launcher = value.gradleLauncher;
  const launcherRow = byName[launchers[0]];
  if (!launcher || Object.keys(launcher).sort(compareText).join(',') !== 'bytes,file,sha256' ||
      launcher.file !== launcherRow.file || launcher.bytes !== launcherRow.bytes || launcher.sha256 !== launcherRow.sha256) return null;
  const generatedRecipe = value.generatedRecipe;
  const expectedRecipeNames = [...GENERATED_RECIPE_FILES,
    ...OPTIONAL_GENERATED_RECIPE_FILES.filter(file => names.includes(file))].sort(compareText);
  if (!generatedRecipe || Object.keys(generatedRecipe).sort(compareText).join(',') !== 'files,filesSha256' ||
      !Array.isArray(generatedRecipe.files) || canonicalSha256(generatedRecipe.files) !== generatedRecipe.filesSha256 ||
      JSON.stringify(generatedRecipe.files.map(row => row && row.file)) !== JSON.stringify(expectedRecipeNames) ||
      generatedRecipe.files.some(row => !row || canonicalSha256(row) !== canonicalSha256(byName[row.file]))) return null;
  const configuration = value.configuration;
  const signing = configuration && configuration.signing;
  const signingKeys = ['captureBuildType', 'debugUsesReleaseConfig', 'releaseBuildUsesReleaseConfig',
    'releaseConfigDeclared', 'releaseDebuggable', 'releaseEnvironmentVariables', 'releaseFailClosed'].sort(compareText);
  if (!configuration || Object.keys(configuration).sort(compareText).join(',') !==
      ['minSdk', 'packageId', 'signing', 'versionCode', 'versionName'].sort(compareText).join(',') ||
      typeof configuration.packageId !== 'string' || !configuration.packageId ||
      !Number.isSafeInteger(configuration.versionCode) || configuration.versionCode < 1 ||
      typeof configuration.versionName !== 'string' || !configuration.versionName ||
      !Number.isSafeInteger(configuration.minSdk) || configuration.minSdk < 1 ||
      !signing || Object.keys(signing).sort(compareText).join(',') !== signingKeys.join(',') ||
      signing.captureBuildType !== 'debug' || signing.releaseConfigDeclared !== true ||
      signing.releaseBuildUsesReleaseConfig !== true || signing.releaseFailClosed !== true ||
      signing.releaseDebuggable !== false || signing.debugUsesReleaseConfig !== false ||
      JSON.stringify(signing.releaseEnvironmentVariables) !== JSON.stringify(RELEASE_SIGNING_ENV)) return null;
  return { sha256: value.filesSha256, wrapper: { ...wrapper }, launcher: { ...launcher },
    generatedRecipeSha256: generatedRecipe.filesSha256,
    configuration: JSON.parse(JSON.stringify(configuration)),
    appGradleSha256: byName['android/app/build.gradle'].sha256,
    manifestSha256: byName['android/app/src/main/AndroidManifest.xml'].sha256,
    buildIdentitySha256: byName['android/app/src/main/assets/public/build-identity.js'].sha256,
    rootGradleSha256: byName['android/build.gradle'].sha256,
    variablesGradleSha256: byName['android/variables.gradle'].sha256 };
}

function validatedGradle(value) {
  const expectedKeys = ['actualJvmVersion', 'ant', 'daemonJvmDescriptorSha256',
    'daemonJvmMatchesJavaHome', 'groovy', 'javaHomeJvmVersion', 'javaHomeVersion', 'kotlin',
    'jvmProof', 'launcherJvm', 'os', 'outputSha256', 'plainJvm', 'reportedJvmForm', 'version'].sort(compareText);
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.version !== 'string' ||
      JSON.stringify(Object.keys(value).sort(compareText)) !== JSON.stringify(expectedKeys) ||
      !value.version || typeof value.javaHomeVersion !== 'string' || !value.javaHomeVersion ||
      typeof value.javaHomeJvmVersion !== 'string' || !value.javaHomeJvmVersion ||
      typeof value.actualJvmVersion !== 'string' || value.actualJvmVersion !== value.javaHomeJvmVersion ||
      !['JVM', 'Launcher JVM'].includes(value.reportedJvmForm) ||
      value.jvmProof !== 'gradle-jvm-is-build-jvm' ||
      typeof value.plainJvm !== 'string' || typeof value.launcherJvm !== 'string' ||
      (value.reportedJvmForm === 'JVM' ? !value.plainJvm : !value.launcherJvm) ||
      ['kotlin', 'groovy', 'ant', 'os'].some(field => typeof value[field] !== 'string') ||
      !HEX_64.test(String(value.outputSha256 || '')) ||
      value.daemonJvmMatchesJavaHome !== true ||
      (value.daemonJvmDescriptorSha256 !== '' && !HEX_64.test(String(value.daemonJvmDescriptorSha256 || '')))) return null;
  return JSON.parse(JSON.stringify(value));
}

/* Receipt v2 aggregate validators. A closure aggregate is exactly three fields —
   fileCount, sha256, totalBytes — and nothing else; an extra field would mean the
   capture leaked a path or content, which the evidence contract forbids. */
function validatedClosureAggregate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort(compareText);
  if (keys.join(',') !== 'fileCount,sha256,totalBytes') return null;
  if (!Number.isSafeInteger(value.fileCount) || value.fileCount < 1) return null;
  if (!Number.isSafeInteger(value.totalBytes) || value.totalBytes < 1) return null;
  if (!HEX_64.test(String(value.sha256 || ''))) return null;
  return value;
}

/* Each closure set carries its measurement points plus a stability flag. Every
   aggregate in the set must be present, well formed, and equal to the others:
   the capture already refused to produce the record otherwise, so a set that
   disagrees here means the record was edited after capture. */
function validatedClosureSet(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).sort(compareText).join(',') !== expectedKeys.slice().sort(compareText).join(',')) return null;
  const aggregates = expectedKeys.filter(key => typeof value[key] === 'object')
    .map(key => validatedClosureAggregate(value[key]));
  if (!aggregates.length || aggregates.some(item => !item)) return null;
  const first = canonicalSha256(aggregates[0]);
  if (aggregates.some(item => canonicalSha256(item) !== first)) return null;
  const flags = expectedKeys.filter(key => typeof value[key] !== 'object');
  if (flags.some(key => value[key] !== true)) return null;
  const result = {};
  for (const key of expectedKeys) result[key] = value[key];
  return result;
}

function validatedInstall(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).sort(compareText).join(',') !==
    'command,elapsedMs,exitCode,outputSha256,sourceNodeModulesAbsent') return null;
  if (value.command !== 'npm ci --ignore-scripts --no-audit --no-fund') return null;
  if (value.sourceNodeModulesAbsent !== true || value.exitCode !== 0) return null;
  if (!Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < 0) return null;
  if (!HEX_64.test(String(value.outputSha256 || ''))) return null;
  return value;
}

function validateBuildRecord(value, apkBytes, normalized) {
  if (!value || value.format !== 'SAAGAR_AUDIT_BUILD_CAPTURE' || value.schemaVersion !== 2 ||
      !HEX_40.test(String(value.sourceSha || '')) || !value.productFingerprint ||
      !HEX_64.test(String(value.productFingerprint.treeSha256 || '')) || value.command !== 'npm run build:apk' ||
      value.cleanBefore !== true || value.cleanAfter !== true || value.signingMode !== 'debug' ||
      !value.isolation || value.isolation.rootKind !== 'detached-linked-worktree' ||
      value.isolation.linkedWorktree !== true || value.isolation.detachedHead !== true ||
      !value.artifact || value.artifact.file !== 'app-debug.apk') return null;
  const actualSha = sha256(apkBytes);
  const expectedNormalized = value.artifact.normalized || {};
  if (value.artifact.bytes !== apkBytes.length || value.artifact.sha256 !== actualSha ||
      expectedNormalized.sha256 !== normalized.sha256 || expectedNormalized.entryCount !== normalized.entryCount ||
      expectedNormalized.totalUncompressedBytes !== normalized.totalUncompressedBytes ||
      expectedNormalized.excludedSignatureEntryCount !== normalized.excludedSignatureEntries.length) return null;
  const toolchain = toolchainFingerprint(value.toolchain);
  const bootstrap = validatedBootstrap(value.bootstrap);
  const generatedAndroid = validatedGeneratedAndroid(value.generatedAndroid);
  const gradle = validatedGradle(value.toolchain && value.toolchain.gradle);
  const toolchainLauncher = value.toolchain && value.toolchain.gradleLauncher;
  const toolchainRecipe = value.toolchain && value.toolchain.recipe;
  if (!toolchain || !bootstrap || !generatedAndroid || !gradle || !value.toolchain.java ||
      value.toolchain.java.source !== 'JAVA_HOME' || value.toolchain.java.version !== gradle.javaHomeVersion ||
      !toolchainLauncher || Object.keys(toolchainLauncher).sort(compareText).join(',') !== 'bytes,file,sha256' ||
      canonicalSha256(toolchainLauncher) !== canonicalSha256(generatedAndroid.launcher) ||
      !Array.isArray(toolchainRecipe) || canonicalSha256(toolchainRecipe) !== value.toolchain.recipeSha256) return null;
  const recipeByName = Object.fromEntries(toolchainRecipe.map(row => [row && row.file, row]));
  const sameIdentity = (left, right) => !!(left && right && left.file === right.file &&
    left.bytes === right.bytes && left.sha256 === right.sha256);
  if (toolchainRecipe.some(row => !row || Object.keys(row).sort(compareText).join(',') !== 'bytes,file,sha256' ||
      !Number.isSafeInteger(row.bytes) || row.bytes < 1 || !HEX_64.test(String(row.sha256 || ''))) ||
      !sameIdentity(recipeByName[toolchainLauncher.file], toolchainLauncher) ||
      value.generatedAndroid.generatedRecipe.files.some(row =>
        !sameIdentity(recipeByName[row.file], row))) return null;
  const install = validatedInstall(value.install);
  const dependencyClosure = validatedClosureSet(value.dependencyClosure,
    ['afterBuild', 'afterInstall', 'beforeGradle', 'stableThroughBuild']);
  const gradleDistribution = validatedClosureSet(value.gradleDistribution,
    ['after', 'before', 'isolatedUserHome', 'stableThroughBuild']);
  if (!install || !dependencyClosure || !gradleDistribution) return null;
  return { sourceSha: value.sourceSha, productFingerprintSha256: value.productFingerprint.treeSha256,
    command: value.command, signingMode: value.signingMode, toolchainSha256: toolchain,
    installCommand: install.command, installOutputSha256: install.outputSha256,
    dependencyClosureSha256: dependencyClosure.afterInstall.sha256,
    dependencyClosureFileCount: dependencyClosure.afterInstall.fileCount,
    dependencyClosureTotalBytes: dependencyClosure.afterInstall.totalBytes,
    gradleDistributionSha256: gradleDistribution.before.sha256,
    gradleDistributionFileCount: gradleDistribution.before.fileCount,
    recipeSha256: value.toolchain.recipeSha256, commandOutputSha256: value.commandOutputSha256,
    elapsedMs: value.elapsedMs,
    bootstrapCommand: bootstrap.command, bootstrapOutputSha256: bootstrap.outputSha256,
    generatedAndroidSha256: generatedAndroid.sha256,
    gradleWrapperJarSha256: generatedAndroid.wrapper.jarSha256,
    gradleWrapperPropertiesSha256: generatedAndroid.wrapper.propertiesSha256,
    gradleWrapperLauncherSha256: generatedAndroid.launcher.sha256,
    generatedRecipeSha256: generatedAndroid.generatedRecipeSha256,
    androidConfiguration: generatedAndroid.configuration,
    generatedAppGradleSha256: generatedAndroid.appGradleSha256,
    generatedManifestSha256: generatedAndroid.manifestSha256,
    generatedBuildIdentitySha256: generatedAndroid.buildIdentitySha256,
    generatedRootGradleSha256: generatedAndroid.rootGradleSha256,
    generatedVariablesGradleSha256: generatedAndroid.variablesGradleSha256,
    gradle };
}

export function compareApks(firstFile, secondFile, firstRecord = null, secondRecord = null) {
  const firstBytes = fs.readFileSync(firstFile);
  const secondBytes = fs.readFileSync(secondFile);
  const normalized1 = normalizedApkFingerprint(firstFile);
  const normalized2 = normalizedApkFingerprint(secondFile);
  const bound1 = firstRecord ? validateBuildRecord(firstRecord, firstBytes, normalized1) : null;
  const bound2 = secondRecord ? validateBuildRecord(secondRecord, secondBytes, normalized2) : null;
  const identityBound = !!(bound1 && bound2 && bound1.sourceSha === bound2.sourceSha &&
    bound1.productFingerprintSha256 === bound2.productFingerprintSha256 && bound1.command === bound2.command &&
    bound1.signingMode === bound2.signingMode && bound1.bootstrapCommand === bound2.bootstrapCommand);
  const toolchainMatch = !!(identityBound && bound1.toolchainSha256 === bound2.toolchainSha256 &&
    bound1.recipeSha256 === bound2.recipeSha256 &&
    bound1.generatedAndroidSha256 === bound2.generatedAndroidSha256 &&
    bound1.gradleWrapperJarSha256 === bound2.gradleWrapperJarSha256 &&
    bound1.gradleWrapperPropertiesSha256 === bound2.gradleWrapperPropertiesSha256 &&
    bound1.gradleWrapperLauncherSha256 === bound2.gradleWrapperLauncherSha256 &&
    bound1.generatedRecipeSha256 === bound2.generatedRecipeSha256 &&
    canonicalSha256(bound1.androidConfiguration) === canonicalSha256(bound2.androidConfiguration) &&
    canonicalSha256(bound1.gradle) === canonicalSha256(bound2.gradle) &&
    /* Receipt v2: the two builds must have installed byte-identical dependency
       closures and used byte-identical Gradle distributions. Equal APKs from
       differently prepared inputs is exactly the false pass A9 must not make. */
    bound1.installCommand === bound2.installCommand &&
    bound1.dependencyClosureSha256 === bound2.dependencyClosureSha256 &&
    bound1.dependencyClosureFileCount === bound2.dependencyClosureFileCount &&
    bound1.dependencyClosureTotalBytes === bound2.dependencyClosureTotalBytes &&
    bound1.gradleDistributionSha256 === bound2.gradleDistributionSha256 &&
    bound1.gradleDistributionFileCount === bound2.gradleDistributionFileCount);
  const firstSha = sha256(firstBytes);
  const secondSha = sha256(secondBytes);
  const rawEqual = firstSha === secondSha;
  const normalizedEqual = normalized1.sha256 === normalized2.sha256;
  return {
    format: 'SAAGAR_AUDIT_APK_COMPARISON',
    schemaVersion: 2,
    identityBound,
    toolchainMatch,
    differenceClass: rawEqual ? 'identical' : normalizedEqual ? 'metadata-or-signing-only' : 'normalized-content',
    first: { bytes: firstBytes.length, sha256: firstSha, normalized: publicNormalized(normalized1), build: bound1 },
    second: { bytes: secondBytes.length, sha256: secondSha, normalized: publicNormalized(normalized2), build: bound2 },
    rawEqual,
    normalizedEqual
  };
}

function readRecord(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 1024 * 1024) throw new Error('AUDIT_BUILD_RECORD_TOO_LARGE');
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (_) { throw new Error('AUDIT_BUILD_RECORD_INVALID'); }
}

function main() {
  const [first, firstRecord, second, secondRecord, output] = process.argv.slice(2);
  if (!first || !firstRecord || !second || !secondRecord || !output) throw new Error('AUDIT_APK_COMPARE_ARGUMENT_REQUIRED');
  const result = compareApks(path.resolve(first), path.resolve(second), readRecord(path.resolve(firstRecord)),
    readRecord(path.resolve(secondRecord)));
  fs.writeFileSync(path.resolve(output), safeJson(result, { forbiddenRoots: [os.homedir()] }), { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ identityBound: result.identityBound, toolchainMatch: result.toolchainMatch,
    rawEqual: result.rawEqual, normalizedEqual: result.normalizedEqual })}\n`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${JSON.stringify(safeError(error))}\n`); process.exitCode = 1; }
}
