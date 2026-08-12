import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildContext, compareText, sha256 } from './lib.mjs';
import { normalizedApkFingerprint } from './compare-apks.mjs';
import { assertExternalPath, gradleVersionLauncher, verifyIsolatedWorktree } from './runner-support.mjs';
import { canonicalSha256, safeJson, safeError } from './schema.mjs';

const GRADLE_IDENTITY_TIMEOUT_MS = 10 * 60 * 1000;
const COMMAND_MAX_BUFFER = 256 * 1024 * 1024;
const WINDOWS_HELPER_GRACE_MS = 45 * 1000;
const WINDOWS_HELPER_MAX_TIMEOUT_MS = 35 * 60 * 1000;

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

const MAX_SIGNING_SOURCE_BYTES = 256 * 1024;
const MAX_SIGNING_NESTING = 128;
const WINDOWS_ROOTS_JAVA_OPTIONS =
  '-Djavax.net.ssl.trustStore=NUL -Djavax.net.ssl.trustStoreType=Windows-ROOT';

/* ── Receipt v2 bounded closure identity (closure addendum §4) ───────────────
   A9 cannot pass from two equal APK hashes alone; both builds must prove they
   used independently prepared and exactly identified inputs. A closure identity
   is a bounded aggregate over a directory tree: file count, total bytes and a
   canonical hash of (relative path, size, content hash) triples.

   Only aggregates leave this module. Never the paths, never the contents. The
   walk fails closed on symlink escape, special files, case-fold collisions and
   the configured size/count limits, so an unbounded or ambiguous tree yields an
   error rather than a partial identity that would silently compare equal. */
const MAX_CLOSURE_FILES = 250_000;
const MAX_CLOSURE_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_CLOSURE_FILE_BYTES = 512 * 1024 * 1024;

function closureIdentity(root, code, excludedDirectories = new Set()) {
  const base = path.resolve(root);
  const baseReal = fs.realpathSync.native(base);
  const rows = [];
  let totalBytes = 0;
  const seenFold = new Map();
  const walk = directory => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(base, absolute).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) {
        const resolved = fs.realpathSync.native(path.dirname(absolute));
        const target = fs.realpathSync.native(absolute);
        if (!target.startsWith(baseReal + path.sep) && target !== baseReal) throw new Error(code);
        void resolved;
        continue;
      }
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(relative)) walk(absolute);
        continue;
      }
      if (!entry.isFile()) throw new Error(code);
      const fold = relative.toLowerCase();
      if (seenFold.has(fold) && seenFold.get(fold) !== relative) throw new Error(code);
      seenFold.set(fold, relative);
      const stat = fs.statSync(absolute);
      if (stat.size > MAX_CLOSURE_FILE_BYTES) throw new Error(code);
      totalBytes += stat.size;
      if (rows.length >= MAX_CLOSURE_FILES || totalBytes > MAX_CLOSURE_BYTES) throw new Error(code);
      rows.push({ path: relative, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) });
    }
  };
  if (!fs.statSync(base, { throwIfNoEntry: false })?.isDirectory()) throw new Error(code);
  walk(base);
  rows.sort((left, right) => compareText(left.path, right.path));
  /* A Gradle distribution legitimately exceeds the central evidence schema's
     6,000-row array bound. The paths never leave this function, so hash the
     bounded closure incrementally instead of serializing its internal census
     as evidence. Length-delimited fields avoid concatenation ambiguity. */
  const digest = createHash('sha256');
  for (const row of rows) {
    for (const value of [row.path, String(row.bytes), row.sha256]) {
      const bytes = Buffer.from(value, 'utf8');
      digest.update(String(bytes.length));
      digest.update(':');
      digest.update(bytes);
    }
    digest.update('\n');
  }
  return Object.freeze({ fileCount: rows.length, totalBytes, sha256: digest.digest('hex') });
}

function sameClosure(left, right) {
  return !!(left && right && left.fileCount === right.fileCount &&
    left.totalBytes === right.totalBytes && left.sha256 === right.sha256);
}

/* Exported for the controlled probe, which measures the tree it just installed
   so the receipt it hands back can be checked against an independent
   re-measurement here. Same function both sides: a divergence means the tree
   changed, not that two implementations disagree. */
export function dependencyClosureIdentity(nodeModulesRoot) {
  /* Android Gradle treats these installed Capacitor Android projects as
     included builds and writes compiler output back into their conventional
     build/ directories. Exclude only those exact generated directories; every
     package manifest, source, Gradle input, and all other installed bytes remain
     hash-bound before and after the build. */
  const generated = new Set([
    '@capacitor/android/capacitor/build',
    '@capacitor/app/android/build',
    '@capacitor/filesystem/android/build',
    '@capacitor/local-notifications/android/build',
    '@capacitor/share/android/build'
  ]);
  return closureIdentity(nodeModulesRoot, 'AUDIT_BUILD_DEPENDENCY_CLOSURE_UNAVAILABLE', generated);
}
const SIGNING_CREDENTIALS = Object.freeze([
  { field: 'storeFile', environment: 'SAAGAR_KEYSTORE_FILE', kind: 'file' },
  { field: 'storePassword', environment: 'SAAGAR_KEYSTORE_PASSWORD', kind: 'value' },
  { field: 'keyAlias', environment: 'SAAGAR_KEY_ALIAS', kind: 'value' },
  { field: 'keyPassword', environment: 'SAAGAR_KEY_PASSWORD', kind: 'value' }
]);

function signingLexicalViews(source) {
  const masked = source.split('');
  const commentless = source.split('');
  const blank = (index, preserveNewline = true) => {
    if (!preserveNewline || (source[index] !== '\n' && source[index] !== '\r')) {
      masked[index] = ' ';
      commentless[index] = ' ';
    }
  };
  for (let index = 0; index < source.length;) {
    if (source[index] === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') blank(index++, false);
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      blank(index++, false); blank(index++, false);
      let closed = false;
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          blank(index++, false); blank(index++, false); closed = true; break;
        }
        blank(index++);
      }
      if (!closed) return null;
      continue;
    }
    if (source[index] === '"' || source[index] === "'") {
      const quote = source[index];
      const triple = source.slice(index, index + 3) === quote.repeat(3);
      const width = triple ? 3 : 1;
      for (let count = 0; count < width; count += 1) masked[index + count] = ' ';
      index += width;
      let closed = false;
      while (index < source.length) {
        if (!triple && source[index] === '\\') {
          masked[index++] = ' ';
          if (index < source.length) masked[index++] = ' ';
          continue;
        }
        if (source.slice(index, index + width) === quote.repeat(width)) {
          for (let count = 0; count < width; count += 1) masked[index + count] = ' ';
          index += width; closed = true; break;
        }
        if (source[index] !== '\n' && source[index] !== '\r') masked[index] = ' ';
        index += 1;
      }
      if (!closed) return null;
      continue;
    }
    index += 1;
  }
  return { masked: masked.join(''), commentless: commentless.join('') };
}

function matchingDelimiter(masked, opening, open, close) {
  let depth = 0;
  for (let index = opening; index < masked.length; index += 1) {
    if (masked[index] === open) {
      depth += 1;
      if (depth > MAX_SIGNING_NESTING) return -1;
    } else if (masked[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

function bracesValid(masked) {
  let depth = 0;
  for (const character of masked) {
    if (character === '{') {
      depth += 1;
      if (depth > MAX_SIGNING_NESTING) return false;
    } else if (character === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function directNamedBlocks(masked, start, end, name) {
  const rows = [];
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    const character = masked[index];
    if (character === '{') { depth += 1; continue; }
    if (character === '}') { depth -= 1; continue; }
    if (depth !== 0 || masked.slice(index, index + name.length) !== name ||
        /[\w$]/.test(masked[index - 1] || '') || /[\w$]/.test(masked[index + name.length] || '')) continue;
    let opening = index + name.length;
    while (opening < end && /\s/.test(masked[opening])) opening += 1;
    if (masked[opening] !== '{') continue;
    const closing = matchingDelimiter(masked, opening, '{', '}');
    if (closing < 0 || closing >= end) return null;
    rows.push({ start: index, opening, bodyStart: opening + 1, bodyEnd: closing, end: closing + 1 });
    index = closing;
  }
  return rows;
}

function directIfBlocks(source, masked, start, end) {
  const rows = [];
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    if (masked[index] === '{') { depth += 1; continue; }
    if (masked[index] === '}') { depth -= 1; continue; }
    if (depth !== 0 || masked.slice(index, index + 2) !== 'if' ||
        /[\w$]/.test(masked[index - 1] || '') || /[\w$]/.test(masked[index + 2] || '')) continue;
    let conditionOpen = index + 2;
    while (conditionOpen < end && /\s/.test(masked[conditionOpen])) conditionOpen += 1;
    if (masked[conditionOpen] !== '(') continue;
    const conditionClose = matchingDelimiter(masked, conditionOpen, '(', ')');
    if (conditionClose < 0 || conditionClose >= end) return null;
    let bodyOpen = conditionClose + 1;
    while (bodyOpen < end && /\s/.test(masked[bodyOpen])) bodyOpen += 1;
    if (masked[bodyOpen] !== '{') continue;
    const bodyClose = matchingDelimiter(masked, bodyOpen, '{', '}');
    if (bodyClose < 0 || bodyClose >= end) return null;
    rows.push({ start: index, end: bodyClose + 1,
      condition: source.slice(conditionOpen + 1, conditionClose),
      bodyOpen, bodyStart: bodyOpen + 1, bodyEnd: bodyClose, bodyClose });
    index = bodyClose;
  }
  return rows;
}

function codeMatches(source, masked, start, end, expression) {
  const flags = expression.flags.includes('g') ? expression.flags : expression.flags + 'g';
  return [...source.slice(start, end).matchAll(new RegExp(expression.source, flags))]
    .filter(match => masked[start + match.index] === source[start + match.index])
    .map(match => ({ match, index: start + match.index }));
}

function compactExpression(value) {
  return String(value || '').replace(/\s+/g, '');
}

function directDepth(masked, start, offset) {
  let depth = 0;
  for (let index = start; index < offset; index += 1) {
    if (masked[index] === '{') depth += 1;
    else if (masked[index] === '}') depth -= 1;
  }
  return depth;
}

function directCodeMatches(source, masked, start, end, expression) {
  return codeMatches(source, masked, start, end, expression)
    .filter(row => directDepth(masked, start, row.index) === 0)
    .map(row => ({ ...row, start: row.index, end: row.index + row.match[0].length }));
}

function onlyWhitespaceAndSemicolonsOutsideSpans(source, start, end, spans) {
  const residual = source.slice(start, end).split('');
  for (const span of spans) {
    const left = Math.max(start, span.start), right = Math.min(end, span.end);
    for (let index = left; index < right; index += 1) residual[index - start] = ' ';
  }
  return residual.join('').replace(/[\s;]/g, '') === '';
}

export function parseGeneratedSigningConfiguration(input) {
  const source = String(input || '');
  const findings = [];
  const add = (code, details = {}) => {
    if (!findings.some(row => row.code === code && row.field === details.field)) findings.push({ code, ...details });
  };
  const signing = {
    captureBuildType: 'debug', releaseConfigDeclared: false, releaseBuildUsesReleaseConfig: false,
    releaseFailClosed: false, releaseEnvironmentVariables: [], releaseDebuggable: true,
    debugUsesReleaseConfig: false
  };
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_SIGNING_SOURCE_BYTES) {
    add('SIGNING_SOURCE_SIZE_INVALID'); return { valid: false, signing, findings };
  }
  const views = signingLexicalViews(source);
  if (!views || !bracesValid(views.masked)) {
    add('SIGNING_SOURCE_STRUCTURE_INVALID'); return { valid: false, signing, findings };
  }
  const androidRows = directNamedBlocks(views.masked, 0, source.length, 'android');
  if (!androidRows || androidRows.length !== 1) {
    add('ANDROID_BLOCK_INVALID'); return { valid: false, signing, findings };
  }
  const android = androidRows[0];
  const signingConfigsRows = directNamedBlocks(views.masked, android.bodyStart, android.bodyEnd, 'signingConfigs');
  const buildTypesRows = directNamedBlocks(views.masked, android.bodyStart, android.bodyEnd, 'buildTypes');
  if (!signingConfigsRows || signingConfigsRows.length !== 1) add('SIGNING_CONFIGS_BLOCK_INVALID');
  if (!buildTypesRows || buildTypesRows.length !== 1) add('BUILD_TYPES_BLOCK_INVALID');
  if (findings.length) return { valid: false, signing, findings };
  const signingConfigs = signingConfigsRows[0];
  const buildTypes = buildTypesRows[0];
  const signingReleaseRows = directNamedBlocks(views.masked, signingConfigs.bodyStart, signingConfigs.bodyEnd, 'release');
  const buildReleaseRows = directNamedBlocks(views.masked, buildTypes.bodyStart, buildTypes.bodyEnd, 'release');
  const debugRows = directNamedBlocks(views.masked, buildTypes.bodyStart, buildTypes.bodyEnd, 'debug');
  if (!signingReleaseRows || signingReleaseRows.length !== 1) add('RELEASE_SIGNING_BLOCK_INVALID');
  else signing.releaseConfigDeclared = true;
  if (!buildReleaseRows || buildReleaseRows.length !== 1) add('RELEASE_BUILD_TYPE_BLOCK_INVALID');
  if (!debugRows || debugRows.length > 1) add('DEBUG_BUILD_TYPE_BLOCK_INVALID');
  if (findings.length) return { valid: false, signing, findings };
  const signingRelease = signingReleaseRows[0];
  const buildRelease = buildReleaseRows[0];
  const environmentRows = codeMatches(source, views.masked, signingRelease.bodyStart, signingRelease.bodyEnd,
    /\bdef\s+([A-Za-z_$][\w$]*)\s*=\s*System\s*\.\s*getenv\s*\(\s*(["'])([A-Z0-9_]{1,80})\2\s*\)/g);
  const byEnvironment = new Map();
  for (const row of environmentRows) {
    const variable = row.match[1], environment = row.match[3];
    if (byEnvironment.has(environment) || [...byEnvironment.values()].includes(variable)) {
      add('RELEASE_ENVIRONMENT_CONTRACT_INVALID'); continue;
    }
    byEnvironment.set(environment, variable);
  }
  signing.releaseEnvironmentVariables = [...byEnvironment.keys()].sort(compareText);
  if (environmentRows.length !== SIGNING_CREDENTIALS.length ||
      JSON.stringify(signing.releaseEnvironmentVariables) !== JSON.stringify(RELEASE_SIGNING_ENV)) {
    add('RELEASE_ENVIRONMENT_CONTRACT_INVALID');
  }
  const wantsRows = codeMatches(source, views.masked, signingRelease.bodyStart, signingRelease.bodyEnd,
    /\bdef\s+wantsRelease\s*=\s*gradle\s*\.\s*startParameter\s*\.\s*taskNames\s*\.\s*any\s*\{\s*it\s*\.\s*toLowerCase\s*\(\s*\)\s*\.\s*contains\s*\(\s*(["'])release\1\s*\)\s*\}/g);
  if (wantsRows.length !== 1) add('RELEASE_PREDICATE_INVALID');
  const ifRows = directIfBlocks(source, views.masked, signingRelease.bodyStart, signingRelease.bodyEnd);
  if (!ifRows) add('RELEASE_GUARD_STRUCTURE_INVALID');
  const variables = SIGNING_CREDENTIALS.map(item => byEnvironment.get(item.environment));
  const missingExpression = variables.every(Boolean)
    ? 'wantsRelease&&(!' + variables.join('||!') + ')' : '';
  const failClosed = (ifRows || []).filter(row => compactExpression(row.condition) === missingExpression &&
    /^\s*throw\s+new\s+GradleException\s*\(/.test(views.commentless.slice(row.bodyStart, row.bodyEnd)));
  signing.releaseFailClosed = wantsRows.length === 1 && failClosed.length === 1;
  if (!signing.releaseFailClosed) add('RELEASE_FAIL_CLOSED_INVALID');
  const positiveExpression = variables.every(Boolean) ? variables.join('&&') : '';
  const credentialGuards = (ifRows || []).filter(row => compactExpression(row.condition) === positiveExpression);
  if (credentialGuards.length !== 1) add('RELEASE_CREDENTIAL_GUARD_INVALID');
  const credentialGuard = credentialGuards[0];
  for (const item of SIGNING_CREDENTIALS) {
    const expectedVariable = byEnvironment.get(item.environment);
    const expression = item.kind === 'file'
      ? new RegExp('\\b' + item.field + '\\s*(?:=\\s*)?file\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)', 'g')
      : new RegExp('\\b' + item.field + '\\s*(?:=\\s*)?([A-Za-z_$][\\w$]*)\\b', 'g');
    const all = codeMatches(source, views.masked, signingConfigs.bodyStart, signingConfigs.bodyEnd, expression);
    const guarded = credentialGuard
      ? codeMatches(source, views.masked, credentialGuard.bodyStart, credentialGuard.bodyEnd, expression) : [];
    if (all.length !== 1 || guarded.length !== 1 || guarded[0].match[1] !== expectedVariable) {
      add('RELEASE_CREDENTIAL_CONTRACT_INVALID', { field: item.field });
    }
    const literal = item.kind === 'file'
      ? new RegExp("\\b" + item.field + "\\s*(?:=\\s*)?file\\s*\\(\\s*[\"']", 'g')
      : new RegExp("\\b" + item.field + "\\s*(?:=\\s*)?[\"']", 'g');
    if (codeMatches(source, views.masked, signingConfigs.bodyStart, signingConfigs.bodyEnd, literal).length) {
      add('HARDCODED_SIGNING_SECRET', { field: item.field });
    }
  }
  const debuggable = codeMatches(source, views.masked, buildRelease.bodyStart, buildRelease.bodyEnd,
    /\bdebuggable\s+(true|false)\b/g);
  signing.releaseDebuggable = !(debuggable.length === 1 && debuggable[0].match[1] === 'false');
  if (signing.releaseDebuggable) add('RELEASE_NON_DEBUGGABLE_INVALID');
  const releaseBindings = codeMatches(source, views.masked, buildRelease.bodyStart, buildRelease.bodyEnd,
    /\bsigningConfig\s+signingConfigs\s*\.\s*release\b/g);
  const allBindings = codeMatches(source, views.masked, buildTypes.bodyStart, buildTypes.bodyEnd,
    /\bsigningConfig\s+signingConfigs\s*\.\s*release\b/g);
  signing.releaseBuildUsesReleaseConfig = releaseBindings.length === 1 && allBindings.length === 1;
  if (!signing.releaseBuildUsesReleaseConfig) add('RELEASE_SIGNING_BINDING_INVALID');
  const debug = debugRows[0];
  signing.debugUsesReleaseConfig = !!debug && codeMatches(source, views.masked, debug.bodyStart, debug.bodyEnd,
    /\bsigningConfig\s+signingConfigs\s*\.\s*release\b/g).length > 0;
  if (signing.debugUsesReleaseConfig) add('DEBUG_RELEASE_SIGNING_INVALID');

  const exactDeclarations = [
    ['ks', 'SAAGAR_KEYSTORE_FILE'], ['ksp', 'SAAGAR_KEYSTORE_PASSWORD'],
    ['ka', 'SAAGAR_KEY_ALIAS'], ['kap', 'SAAGAR_KEY_PASSWORD']
  ].map(([variable, environment]) => {
    const pattern = new RegExp('\\bdef\\s+' + variable + '\\s*=\\s*System\\s*\\.\\s*getenv\\s*\\(\\s*(["\'])' +
      environment + '\\1\\s*\\)', 'g');
    const matches = directCodeMatches(source, views.masked, signingRelease.bodyStart, signingRelease.bodyEnd, pattern);
    if (matches.length !== 1) add('RELEASE_ENVIRONMENT_CONTRACT_INVALID');
    return matches[0];
  }).filter(Boolean);
  const exactWants = directCodeMatches(source, views.masked, signingRelease.bodyStart, signingRelease.bodyEnd,
    /\bdef\s+wantsRelease\s*=\s*gradle\s*\.\s*startParameter\s*\.\s*taskNames\s*\.\s*any\s*\{\s*it\s*\.\s*toLowerCase\s*\(\s*\)\s*\.\s*contains\s*\(\s*(["'])release\1\s*\)\s*\}/g);
  if (exactWants.length !== 1) add('RELEASE_PREDICATE_INVALID');

  const strictIfRows = directIfBlocks(source, views.masked, signingRelease.bodyStart, signingRelease.bodyEnd);
  if (!strictIfRows || strictIfRows.length !== 2) add('RELEASE_GUARD_STRUCTURE_INVALID');
  const strictFail = strictIfRows && strictIfRows[0];
  const strictCredentials = strictIfRows && strictIfRows[1];
  const failCondition = 'wantsRelease&&(!ks||!ksp||!ka||!kap)';
  const credentialCondition = 'ks&&ksp&&ka&&kap';
  const failBody = strictFail ? views.commentless.slice(strictFail.bodyStart, strictFail.bodyEnd) : '';
  const exactThrow = /^\s*throw\s+new\s+GradleException\s*\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\)\s*;?\s*$/.test(failBody);
  if (!strictFail || compactExpression(strictFail.condition) !== failCondition || !exactThrow) {
    add('RELEASE_FAIL_CLOSED_INVALID');
  }

  const credentialSpans = [];
  const credentialPatterns = [
    ['storeFile', /\bstoreFile\s+file\s*\(\s*ks\s*\)/g],
    ['storePassword', /\bstorePassword\s+ksp\b/g],
    ['keyAlias', /\bkeyAlias\s+ka\b/g],
    ['keyPassword', /\bkeyPassword\s+kap\b/g]
  ];
  if (!strictCredentials || compactExpression(strictCredentials.condition) !== credentialCondition) {
    add('RELEASE_CREDENTIAL_GUARD_INVALID');
  } else {
    for (const [field, pattern] of credentialPatterns) {
      const matches = directCodeMatches(source, views.masked,
        strictCredentials.bodyStart, strictCredentials.bodyEnd, pattern);
      if (matches.length !== 1) add('RELEASE_CREDENTIAL_CONTRACT_INVALID', { field });
      else credentialSpans.push(matches[0]);
    }
    if (!onlyWhitespaceAndSemicolonsOutsideSpans(views.commentless,
      strictCredentials.bodyStart, strictCredentials.bodyEnd, credentialSpans)) {
      add('RELEASE_CREDENTIAL_GUARD_INVALID');
    }
  }

  const releaseSpans = [...exactDeclarations, ...exactWants, ...(strictIfRows || [])];
  if (!onlyWhitespaceAndSemicolonsOutsideSpans(views.commentless,
    signingRelease.bodyStart, signingRelease.bodyEnd, releaseSpans)) {
    add('RELEASE_SIGNING_STATEMENT_INVALID');
  }
  const releaseBody = views.commentless.slice(buildRelease.bodyStart, buildRelease.bodyEnd)
    .replace(/[\s;]/g, '');
  if (releaseBody !== 'debuggablefalsesigningConfigsigningConfigs.release') {
    add('RELEASE_BUILD_TYPE_STATEMENT_INVALID');
  }
  return { valid: findings.length === 0, signing, findings };
}

function parseArgs(argv) {
  const options = { root: '', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') options.root = path.resolve(String(argv[++index] || ''));
    else if (argv[index] === '--output') options.output = path.resolve(String(argv[++index] || ''));
    else throw new Error('AUDIT_BUILD_ARGUMENT_UNKNOWN');
  }
  if (!options.root || !options.output) throw new Error('AUDIT_BUILD_ARGUMENT_REQUIRED');
  return options;
}

/* `gradleUserHome` is threaded through every Gradle-touching invocation so the
   isolated home is the one actually used, not merely the one measured. Without
   it the distribution identity would bind a directory the build never read. */
export function controlledGradleEnvironment(environment, gradleUserHome, platform = process.platform) {
  const env = { ...environment, TZ: 'UTC' };
  if (!gradleUserHome) return env;
  env.GRADLE_USER_HOME = gradleUserHome;
  const javaOptions = [env.GRADLE_OPTS, env.JAVA_TOOL_OPTIONS, env._JAVA_OPTIONS]
    .map(value => String(value || '')).join(' ');
  if (platform === 'win32' &&
      !/(?:^|\s)-Djavax\.net\.ssl\.trustStore(?:Type)?=\S+/.test(javaOptions)) {
    /* GRADLE_OPTS configures the wrapper client but is not reliably inherited
       by the Gradle daemon that resolves Android/Maven dependencies. Windows'
       SunMSCAPI store also requires an explicit NUL store path. Apply both
       properties to JAVA_TOOL_OPTIONS so the wrapper and daemon share the same
       caller-independent trust root. */
    env.JAVA_TOOL_OPTIONS =
      `${String(env.JAVA_TOOL_OPTIONS || '').trim()} ${WINDOWS_ROOTS_JAVA_OPTIONS}`.trim();
  }
  return env;
}

function windowsCommandRequest(encoded) {
  const request = JSON.parse(Buffer.from(String(encoded || ''), 'base64url').toString('utf8'));
  const keys = request && typeof request === 'object' && !Array.isArray(request)
    ? Object.keys(request).sort(compareText) : [];
  if (JSON.stringify(keys) !== JSON.stringify(['args', 'command', 'cwd', 'outputRoot', 'timeout']) ||
      typeof request.command !== 'string' || !request.command || request.command.length > 32_768 ||
      !Array.isArray(request.args) || request.args.length > 256 ||
      request.args.some(value => typeof value !== 'string' || value.length > 32_768) ||
      typeof request.cwd !== 'string' || !path.isAbsolute(request.cwd) ||
      !fs.statSync(request.cwd, { throwIfNoEntry: false })?.isDirectory() ||
      typeof request.outputRoot !== 'string' || !path.isAbsolute(request.outputRoot) ||
      !fs.statSync(request.outputRoot, { throwIfNoEntry: false })?.isDirectory() ||
      !Number.isSafeInteger(request.timeout) || request.timeout < 1 ||
      request.timeout > WINDOWS_HELPER_MAX_TIMEOUT_MS) {
    throw new Error('AUDIT_WINDOWS_COMMAND_REQUEST_INVALID');
  }
  return request;
}

/* This helper owns the live Windows process. Its timer can therefore terminate
   the exact parent and all descendants before the parent PID disappears. A
   post-spawnSync taskkill cannot do that because spawnSync has already killed
   and reaped its direct child by the time it returns. */
function runWindowsCommandHelper(encoded) {
  const request = windowsCommandRequest(encoded);
  const stdoutFile = path.join(request.outputRoot, 'stdout.bin');
  const stderrFile = path.join(request.outputRoot, 'stderr.bin');
  const metadataFile = path.join(request.outputRoot, 'result.json');
  const pidFile = path.join(request.outputRoot, 'pid.txt');
  const stdout = fs.openSync(stdoutFile, 'wx');
  const stderr = fs.openSync(stderrFile, 'wx');
  let child;
  try {
    child = spawn(request.command, request.args, {
      cwd: request.cwd, env: process.env, windowsHide: true,
      stdio: ['ignore', stdout, stderr]
    });
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
  if (Number.isSafeInteger(child.pid) && child.pid > 0) {
    fs.writeFileSync(pidFile, `${child.pid}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  let terminationReason = null;
  let spawnFailure = null;
  let treeKill = null;
  child.once('error', error => {
    spawnFailure = { code: String(error && error.code || 'UNKNOWN').slice(0, 80),
      message: String(error && error.message || 'COMMAND_SPAWN_FAILED').slice(0, 500) };
  });
  const terminateTree = reason => {
    if (terminationReason) return;
    terminationReason = reason;
    const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      cwd: request.cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000,
      maxBuffer: 1024 * 1024, env: process.env
    });
    treeKill = { status: killed.status, signal: killed.signal || null,
      errorCode: killed.error ? String(killed.error.code || 'UNKNOWN').slice(0, 80) : null };
    if ((killed.error || killed.signal || killed.status !== 0) && child.exitCode === null) {
      try { child.kill('SIGKILL'); } catch { /* The process may have exited at the timeout boundary. */ }
    }
  };
  const timer = setTimeout(() => terminateTree('timeout'), request.timeout);
  const outputMonitor = setInterval(() => {
    const bytes = [stdoutFile, stderrFile].reduce((sum, file) =>
      sum + Number(fs.statSync(file, { throwIfNoEntry: false })?.size || 0), 0);
    if (bytes > COMMAND_MAX_BUFFER) terminateTree('output-limit');
  }, 250);
  child.once('close', (status, signal) => {
    clearTimeout(timer);
    clearInterval(outputMonitor);
    const result = { pid: Number.isSafeInteger(child.pid) ? child.pid : null,
      status, signal: signal || null, terminationReason, spawnFailure, treeKill };
    try {
      fs.writeFileSync(metadataFile, `${JSON.stringify(result)}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      process.stderr.write(`${String(error && error.message || error).slice(0, 500)}\n`);
      process.exitCode = 1;
    }
  });
}

function boundedCommandOutput(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) return '';
  if (stat.size > COMMAND_MAX_BUFFER) {
    const error = new Error('AUDIT_COMMAND_OUTPUT_TOO_LARGE');
    error.code = 'ENOBUFS';
    throw error;
  }
  return fs.readFileSync(file, 'utf8');
}

function windowsCommand(commandName, args, cwd, timeout, env) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-audit-command-'));
  const request = { args, command: commandName, cwd: path.resolve(cwd), outputRoot: temporary, timeout };
  try {
    const helper = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--windows-command-helper',
      Buffer.from(JSON.stringify(request), 'utf8').toString('base64url')], {
      cwd, encoding: 'utf8', windowsHide: true, timeout: timeout + WINDOWS_HELPER_GRACE_MS,
      maxBuffer: 1024 * 1024, env
    });
    const pidFile = path.join(temporary, 'pid.txt');
    const metadataFile = path.join(temporary, 'result.json');
    /* If the helper itself failed, its early PID receipt still lets this parent
       kill the exact live command tree rather than relying on a reaped helper
       PID. This is a last-resort path after the helper's own bounded watchdog. */
    if ((helper.error || helper.signal || helper.status !== 0 || !fs.existsSync(metadataFile)) &&
        fs.statSync(pidFile, { throwIfNoEntry: false })?.isFile()) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (Number.isSafeInteger(pid) && pid > 0) {
        spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000,
          maxBuffer: 1024 * 1024, env
        });
      }
    }
    const stdout = boundedCommandOutput(path.join(temporary, 'stdout.bin'));
    const stderr = boundedCommandOutput(path.join(temporary, 'stderr.bin'));
    if (!fs.statSync(metadataFile, { throwIfNoEntry: false })?.isFile()) {
      return { pid: helper.pid, status: null, signal: helper.signal || null,
        error: helper.error || Object.assign(new Error('AUDIT_WINDOWS_COMMAND_HELPER_FAILED'),
          { code: 'AUDIT_WINDOWS_COMMAND_HELPER_FAILED' }), stdout, stderr };
    }
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    let error = null;
    if (metadata.terminationReason === 'timeout') {
      error = Object.assign(new Error(`Command timed out after ${timeout}ms`), { code: 'ETIMEDOUT' });
    } else if (metadata.terminationReason === 'output-limit') {
      error = Object.assign(new Error('AUDIT_COMMAND_OUTPUT_TOO_LARGE'), { code: 'ENOBUFS' });
    }
    else if (metadata.spawnFailure) error = Object.assign(new Error(metadata.spawnFailure.message),
      { code: metadata.spawnFailure.code });
    return { pid: metadata.pid, status: metadata.terminationReason ? null : metadata.status,
      signal: metadata.signal, error, stdout, stderr };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function spawnSyncCommandTree(commandName, args, options) {
  if (process.platform === 'win32') {
    return windowsCommand(commandName, args, options.cwd, options.timeout, options.env);
  }
  return spawnSync(commandName, args, options);
}

function command(command, args, cwd, timeout = 30000, gradleUserHome = '') {
  const env = controlledGradleEnvironment(process.env, gradleUserHome);
  const result = spawnSyncCommandTree(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout,
    maxBuffer: COMMAND_MAX_BUFFER, env });
  return { result, output: `${result.stdout || ''}\n${result.stderr || ''}` };
}

function firstMatchingLines(value, patterns) {
  const rows = String(value || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)
    .map(line => line.trim()).filter(Boolean);
  return patterns.map(pattern => rows.find(line => pattern.test(line)) || 'unavailable');
}

function javaHomeExecutable() {
  const home = String(process.env.JAVA_HOME || '').trim();
  if (!home || home.includes('\0')) throw new Error('AUDIT_BUILD_JAVA_HOME_REQUIRED');
  const executable = path.join(path.resolve(home), 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!fs.statSync(executable, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('AUDIT_BUILD_JAVA_HOME_INVALID');
  }
  return { home: path.resolve(home), executable };
}

function parsedJvmVersion(value) {
  const match = String(value || '').match(/(?:version\s+["']?)?(\d+(?:\.\d+){1,3})/i);
  return match ? match[1] : '';
}

export function parseGradleJvmIdentity(output, javaHome, javaVersion) {
  const lines = String(output || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)
    .map(line => line.trim()).filter(Boolean);
  const read = pattern => lines.find(line => pattern.test(line)) || '';
  const versionLine = read(/^Gradle\s+\S+/);
  const plain = read(/^JVM:/);
  const launcher = read(/^Launcher JVM:/);
  const daemon = read(/^Daemon JVM:/);
  if (!versionLine || Boolean(plain) === Boolean(launcher))
    throw new Error('AUDIT_BUILD_GRADLE_IDENTITY_UNAVAILABLE');
  const descriptor = line => line ? line.replace(/^[^:]+:\s*/, '').slice(0, 240) : '';
  const safeDescriptor = line => {
    const value = descriptor(line);
    if (!value || /^(?:[A-Za-z]:[\\/]|\/)/.test(value)) return '';
    return value;
  };
  const javaHomeJvmVersion = parsedJvmVersion(javaVersion);
  const actualJvmVersion = parsedJvmVersion(descriptor(plain || launcher));
  if (!javaHomeJvmVersion || !actualJvmVersion || actualJvmVersion !== javaHomeJvmVersion) {
    throw new Error('AUDIT_BUILD_GRADLE_JVM_MISMATCH');
  }
  let daemonJvmMatchesJavaHome = true;
  let jvmProof = 'gradle-jvm-is-build-jvm';
  if (launcher) {
    if (!daemon) throw new Error('AUDIT_BUILD_GRADLE_DAEMON_JVM_REQUIRED');
    const value = descriptor(daemon);
    const directory = value.replace(/\s+\([^)]*\)\s*$/, '');
    if (!path.isAbsolute(directory)) throw new Error('AUDIT_BUILD_GRADLE_DAEMON_JVM_REQUIRED');
    try {
      const left = fs.realpathSync.native(directory), right = fs.realpathSync.native(javaHome);
      daemonJvmMatchesJavaHome = process.platform === 'win32'
        ? left.toLowerCase() === right.toLowerCase() : left === right;
    } catch (_) { daemonJvmMatchesJavaHome = false; }
    jvmProof = 'daemon-jvm-matches-java-home';
  }
  if (!daemonJvmMatchesJavaHome) throw new Error('AUDIT_BUILD_GRADLE_JVM_MISMATCH');
  return {
    version: versionLine.replace(/^Gradle\s+/, ''),
    javaHomeVersion: javaVersion, javaHomeJvmVersion, actualJvmVersion,
    jvmProof,
    reportedJvmForm: plain ? 'JVM' : 'Launcher JVM',
    plainJvm: safeDescriptor(plain), launcherJvm: safeDescriptor(launcher),
    daemonJvmMatchesJavaHome,
    daemonJvmDescriptorSha256: daemon ? sha256(descriptor(daemon)) : '',
    kotlin: read(/^Kotlin:/).replace(/^Kotlin:\s*/, '').slice(0, 120),
    groovy: read(/^Groovy:/).replace(/^Groovy:\s*/, '').slice(0, 120),
    ant: read(/^Ant:/).replace(/^Ant:\s*/, '').slice(0, 120),
    os: read(/^OS:/).replace(/^OS:\s*/, '').slice(0, 160),
    outputSha256: sha256(output)
  };
}

function generatedAndroidIdentity(root) {
  const launcher = gradleVersionLauncher(root);
  const launcherFile = path.relative(root, launcher.file).replaceAll('\\', '/');
  if (!GRADLE_LAUNCHER_FILES.includes(launcherFile)) throw new Error('AUDIT_BUILD_GRADLE_LAUNCHER_INVALID');
  const optionalRecipe = OPTIONAL_GENERATED_RECIPE_FILES
    .filter(file => fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile());
  const fileNames = [...new Set([...GENERATED_ANDROID_FILES, ...optionalRecipe, launcherFile])]
    .sort(compareText);
  const files = fileNames.map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const appGradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
  const variables = fs.readFileSync(path.join(root, 'android', 'variables.gradle'), 'utf8');
  const match = (source, expression, code) => {
    const found = [...source.matchAll(new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : `${expression.flags}g`))];
    if (found.length !== 1) throw new Error(code);
    return found[0];
  };
  const packageId = match(appGradle, /\bapplicationId\s+['"]([^'"]+)['"]/, 'AUDIT_BUILD_PACKAGE_ID_INVALID')[1];
  const versionCode = Number(match(appGradle, /\bversionCode\s+(\d+)\b/, 'AUDIT_BUILD_VERSION_CODE_INVALID')[1]);
  const versionName = match(appGradle, /\bversionName\s+['"]([^'"]+)['"]/, 'AUDIT_BUILD_VERSION_NAME_INVALID')[1];
  const indirectMinSdk = /\bminSdkVersion\s+rootProject\.ext\.minSdkVersion\b/.test(appGradle);
  const minSdk = Number((indirectMinSdk
    ? match(variables, /\bminSdkVersion\s*=\s*(\d+)\b/, 'AUDIT_BUILD_MIN_SDK_INVALID')
    : match(appGradle, /\bminSdkVersion\s+(\d+)\b/, 'AUDIT_BUILD_MIN_SDK_INVALID'))[1]);
  if (!Number.isSafeInteger(versionCode) || !Number.isSafeInteger(minSdk) || !packageId || !versionName) {
    throw new Error('AUDIT_BUILD_ANDROID_CONFIGURATION_INVALID');
  }
  const parsedSigning = parseGeneratedSigningConfiguration(appGradle);
  if (!parsedSigning.valid) throw new Error('AUDIT_BUILD_SIGNING_CONFIGURATION_INVALID');
  const signing = parsedSigning.signing;
  const byName = Object.fromEntries(files.map(file => [file.file, file]));
  const generatedRecipeFiles = [...GENERATED_RECIPE_FILES, ...optionalRecipe]
    .map(file => byName[file]).sort((left, right) => compareText(left.file, right.file));
  const launcherIdentity = byName[launcherFile];
  return {
    files, filesSha256: canonicalSha256(files),
    gradleWrapper: {
      jarSha256: byName['android/gradle/wrapper/gradle-wrapper.jar'].sha256,
      propertiesSha256: byName['android/gradle/wrapper/gradle-wrapper.properties'].sha256
    },
    gradleLauncher: { file: launcherIdentity.file, bytes: launcherIdentity.bytes,
      sha256: launcherIdentity.sha256 },
    generatedRecipe: { files: generatedRecipeFiles,
      filesSha256: canonicalSha256(generatedRecipeFiles) },
    configuration: { packageId, versionCode, versionName, minSdk, signing }
  };
}

function validatedBootstrapReceipt(value) {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort(compareText) : [];
  const expected = ['command', 'elapsedMs', 'exitCode', 'outputSha256', 'sourceAndroidAbsent'].sort(compareText);
  if (JSON.stringify(keys) !== JSON.stringify(expected) || value.command !== 'npm run add:android' ||
      value.sourceAndroidAbsent !== true || value.exitCode !== 0 || !Number.isSafeInteger(value.elapsedMs) ||
      value.elapsedMs < 0 || !/^[a-f0-9]{64}$/.test(String(value.outputSha256 || ''))) {
    throw new Error('AUDIT_BUILD_BOOTSTRAP_RECEIPT_INVALID');
  }
  return value;
}

/* Receipt v2: the dependency install is performed by the controlled probe in the
   disposable worktree, never by an ambient node_modules junction. Its receipt is
   validated here on exactly the same fail-closed terms as the bootstrap receipt,
   so a hand-authored or partial install cannot authorize a capture. */
function validatedInstallReceipt(value) {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort(compareText) : [];
  const expected = ['closure', 'command', 'elapsedMs', 'exitCode', 'outputSha256', 'sourceNodeModulesAbsent']
    .sort(compareText);
  const closure = value && value.closure;
  if (JSON.stringify(keys) !== JSON.stringify(expected) ||
      value.command !== 'npm ci --ignore-scripts --no-audit --no-fund' ||
      value.sourceNodeModulesAbsent !== true || value.exitCode !== 0 ||
      !Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < 0 ||
      !/^[a-f0-9]{64}$/.test(String(value.outputSha256 || '')) ||
      !closure || typeof closure !== 'object' || Array.isArray(closure) ||
      JSON.stringify(Object.keys(closure).sort(compareText)) !== JSON.stringify(['fileCount', 'sha256', 'totalBytes']) ||
      !Number.isSafeInteger(closure.fileCount) || closure.fileCount < 1 ||
      !Number.isSafeInteger(closure.totalBytes) || closure.totalBytes < 1 ||
      !/^[a-f0-9]{64}$/.test(String(closure.sha256 || ''))) {
    throw new Error('AUDIT_BUILD_INSTALL_RECEIPT_INVALID');
  }
  return value;
}

/* The Gradle distribution actually selected by the wrapper, identified as a
   bounded closure under the isolated GRADLE_USER_HOME. Captured before and after
   the build so a distribution swapped mid-build is caught rather than averaged
   away. */
export function gradleDistributionClosureIdentity(gradleUserHome, code =
  'AUDIT_BUILD_GRADLE_DISTRIBUTION_UNAVAILABLE') {
  const distributions = path.join(path.resolve(gradleUserHome), 'wrapper', 'dists');
  if (!fs.statSync(distributions, { throwIfNoEntry: false })?.isDirectory()) throw new Error(code);
  /* Gradle writes CACHEDIR.TAG and transient lock/marker files around the
     immutable extracted distribution. Those files are cache bookkeeping, not
     executable distribution bytes, and can legitimately appear between the
     wrapper identity probe and the build. Bind exactly one fail-closed
     distribution family, cache key, and extracted Gradle directory instead. */
  const top = fs.readdirSync(distributions, { withFileTypes: true });
  if (top.some(entry => entry.name !== 'CACHEDIR.TAG' && !entry.isDirectory())) throw new Error(code);
  const families = top.filter(entry => entry.isDirectory());
  if (families.length !== 1 || !/^gradle-[A-Za-z0-9._+-]+$/.test(families[0].name)) throw new Error(code);
  const family = path.join(distributions, families[0].name);
  const keys = fs.readdirSync(family, { withFileTypes: true });
  if (keys.length !== 1 || !keys[0].isDirectory() || !/^[a-z0-9]{8,80}$/i.test(keys[0].name)) {
    throw new Error(code);
  }
  const cache = path.join(family, keys[0].name);
  const cacheEntries = fs.readdirSync(cache, { withFileTypes: true });
  const extracted = cacheEntries.filter(entry => entry.isDirectory());
  if (extracted.length !== 1 || !/^gradle-[A-Za-z0-9._+-]+$/.test(extracted[0].name) ||
      cacheEntries.some(entry => !entry.isDirectory() &&
        !/\.zip\.(?:lck|ok)$/.test(entry.name))) throw new Error(code);
  return closureIdentity(path.join(cache, extracted[0].name), code);
}

function npmVersion(root) {
  const invocation = process.platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd --version'] }
    : { command: 'npm', args: ['--version'] };
  const probe = command(invocation.command, invocation.args, root);
  if (probe.result.status !== 0) throw new Error('AUDIT_BUILD_NPM_UNAVAILABLE');
  return probe.output.trim().split(/\r?\n/)[0].slice(0, 80);
}

function npmDependencyIdentity(root) {
  const invocation = process.platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd ls --all --json'] }
    : { command: 'npm', args: ['ls', '--all', '--json'] };
  const probe = command(invocation.command, invocation.args, root, 120000);
  if (probe.result.status !== 0) throw new Error('AUDIT_BUILD_NPM_TREE_UNAVAILABLE');
  let parsed;
  try { parsed = JSON.parse(probe.result.stdout || ''); }
  catch (_) { throw new Error('AUDIT_BUILD_NPM_TREE_INVALID'); }
  let packageCount = 0;
  function project(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    packageCount += 1;
    const result = {};
    if (typeof value.name === 'string') result.name = value.name;
    if (typeof value.version === 'string') result.version = value.version;
    const dependencies = value.dependencies && typeof value.dependencies === 'object'
      ? Object.keys(value.dependencies).sort(compareText) : [];
    if (dependencies.length) result.dependencies = Object.fromEntries(dependencies
      .map(name => [name, project(value.dependencies[name])]).filter(([, item]) => item));
    return result;
  }
  const projected = project(parsed);
  return { packageCount, sha256: canonicalSha256(projected) };
}

function androidSdkRoot(root) {
  const localProperties = path.join(root, 'android', 'local.properties');
  if (fs.existsSync(localProperties)) {
    const match = fs.readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.+)$/m);
    if (match) return match[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
  }
  return process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || '';
}

function androidSdkIdentity(root) {
  const variables = fs.readFileSync(path.join(root, 'android', 'variables.gradle'), 'utf8');
  const compileMatch = variables.match(/\bcompileSdkVersion\s*=\s*(\d+)\b/);
  if (!compileMatch) throw new Error('AUDIT_BUILD_COMPILE_SDK_UNAVAILABLE');
  const compileSdk = Number(compileMatch[1]);
  const sdkRoot = androidSdkRoot(root);
  if (!sdkRoot) throw new Error('AUDIT_BUILD_ANDROID_SDK_UNAVAILABLE');
  const platformJar = path.join(sdkRoot, 'platforms', `android-${compileSdk}`, 'android.jar');
  if (!fs.existsSync(platformJar)) throw new Error('AUDIT_BUILD_ANDROID_PLATFORM_UNAVAILABLE');
  const buildToolsRoot = path.join(sdkRoot, 'build-tools');
  if (!fs.existsSync(buildToolsRoot)) throw new Error('AUDIT_BUILD_TOOLS_UNAVAILABLE');
  const buildTools = fs.readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[A-Za-z0-9._+-]{1,80}$/.test(entry.name))
    .map(entry => {
      const directory = path.join(buildToolsRoot, entry.name);
      const aapt2 = path.join(directory, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
      const zipalign = path.join(directory, process.platform === 'win32' ? 'zipalign.exe' : 'zipalign');
      return { version: entry.name,
        aapt2Sha256: fs.existsSync(aapt2) ? sha256(fs.readFileSync(aapt2)) : 'unavailable',
        zipalignSha256: fs.existsSync(zipalign) ? sha256(fs.readFileSync(zipalign)) : 'unavailable' };
    }).sort((a, b) => compareText(a.version, b.version));
  if (!buildTools.length) throw new Error('AUDIT_BUILD_TOOLS_UNAVAILABLE');
  const platformBytes = fs.readFileSync(platformJar);
  return { compileSdk, platformAndroidJarBytes: platformBytes.length,
    platformAndroidJarSha256: sha256(platformBytes), buildTools,
    fingerprint: canonicalSha256({ compileSdk, platformAndroidJarSha256: sha256(platformBytes), buildTools }) };
}

export function buildToolchainIdentity(root, gradleUserHome = '') {
  const javaHome = javaHomeExecutable();
  const java = command(javaHome.executable, ['-version'], root);
  if (java.result.status !== 0) throw new Error('AUDIT_BUILD_JAVA_UNAVAILABLE');
  const javaVersion = firstMatchingLines(java.output, [/^(?:openjdk|java) version/i])[0];
  if (javaVersion === 'unavailable') throw new Error('AUDIT_BUILD_JAVA_UNAVAILABLE');
  const gradleInvocation = gradleVersionLauncher(root);
  /* A fresh controlled home must download the frozen distribution before it
     can print its identity. The wrapper's per-read timeout is 120 seconds, so
     the enclosing process timeout must be strictly larger than a valid slow
     download instead of killing its Java child at the same boundary. */
  const gradle = command(gradleInvocation.command, gradleInvocation.args,
    gradleInvocation.cwd, GRADLE_IDENTITY_TIMEOUT_MS, gradleUserHome);
  if (gradle.result.status !== 0) throw new Error('AUDIT_BUILD_GRADLE_UNAVAILABLE');
  const launcherFile = path.relative(root, gradleInvocation.file).replaceAll('\\', '/');
  if (!GRADLE_LAUNCHER_FILES.includes(launcherFile)) throw new Error('AUDIT_BUILD_GRADLE_LAUNCHER_INVALID');
  const optionalRecipe = OPTIONAL_GENERATED_RECIPE_FILES
    .filter(file => fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile());
  const recipeFiles = ['package-lock.json', 'android/gradle/wrapper/gradle-wrapper.jar',
    'android/gradle/wrapper/gradle-wrapper.properties',
    'android/build.gradle', 'android/app/build.gradle', 'android/variables.gradle',
    'build-overrides/apply-overrides.js', ...GENERATED_RECIPE_FILES, ...optionalRecipe, launcherFile];
  const recipe = recipeFiles.map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, bytes: bytes.length, sha256: sha256(bytes) };
  }).sort((a, b) => compareText(a.file, b.file));
  const gradleLauncher = recipe.find(file => file.file === launcherFile);
  const value = {
    node: process.version,
    npm: npmVersion(root),
    java: { source: 'JAVA_HOME', version: javaVersion },
    gradleLauncher: { file: gradleLauncher.file, bytes: gradleLauncher.bytes, sha256: gradleLauncher.sha256 },
    gradle: parseGradleJvmIdentity(gradle.output, javaHome.home, javaVersion),
    androidSdk: androidSdkIdentity(root),
    npmDependencies: npmDependencyIdentity(root),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    recipe,
    recipeSha256: canonicalSha256(recipe)
  };
  return { ...value, fingerprint: canonicalSha256(value) };
}

function buildInvocation() {
  if (process.platform === 'win32') return { command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm.cmd run build:apk'], display: 'npm run build:apk' };
  return { command: 'npm', args: ['run', 'build:apk'], display: 'npm run build:apk' };
}

export function captureBuild(options) {
  const root = path.resolve(options.root);
  const output = path.resolve(options.output);
  const bootstrap = validatedBootstrapReceipt(options.bootstrapReceipt);
  const install = validatedInstallReceipt(options.installReceipt);
  const gradleUserHome = path.resolve(options.gradleUserHome || '');
  if (!fs.statSync(gradleUserHome, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('AUDIT_BUILD_GRADLE_HOME_INVALID');
  }
  assertExternalPath(root, gradleUserHome, 'AUDIT_BUILD_GRADLE_HOME_MUST_BE_EXTERNAL');
  assertExternalPath(root, output, 'AUDIT_BUILD_OUTPUT_MUST_BE_EXTERNAL');
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw new Error('AUDIT_BUILD_OUTPUT_NOT_EMPTY');
  const before = buildContext(root);
  if (before.status) throw new Error('AUDIT_BUILD_TARGET_NOT_CLEAN');
  const isolation = verifyIsolatedWorktree(root);

  /* The dependency closure the probe installed must still be exactly what is
     present now, before anything is generated. An install that drifted between
     `npm ci` and here invalidates the receipt. */
  const dependencyClosureAfterInstall = dependencyClosureIdentity(path.join(root, 'node_modules'));
  if (!sameClosure(dependencyClosureAfterInstall, install.closure)) {
    throw new Error('AUDIT_BUILD_DEPENDENCY_CLOSURE_MUTATED');
  }

  const identity = buildToolchainIdentity(root, gradleUserHome);
  if (typeof options.onGradleReady === 'function') options.onGradleReady();

  /* Re-measured immediately before Gradle: generation runs between these two
     points and must not touch the installed closure. */
  const dependencyClosureBeforeGradle = dependencyClosureIdentity(path.join(root, 'node_modules'));
  if (!sameClosure(dependencyClosureBeforeGradle, dependencyClosureAfterInstall)) {
    throw new Error('AUDIT_BUILD_DEPENDENCY_CLOSURE_MUTATED');
  }

  const gradleDistributionBefore = gradleDistributionClosureIdentity(gradleUserHome,
    'AUDIT_BUILD_GRADLE_DISTRIBUTION_UNAVAILABLE');

  const invocation = buildInvocation();
  const startedAt = new Date();
  const built = command(invocation.command, invocation.args, root, 30 * 60 * 1000, gradleUserHome);
  const endedAt = new Date();
  if (built.result.status !== 0) throw new Error('AUDIT_BUILD_COMMAND_FAILED');

  const gradleDistributionAfter = gradleDistributionClosureIdentity(gradleUserHome,
    'AUDIT_BUILD_GRADLE_DISTRIBUTION_UNAVAILABLE');
  if (!sameClosure(gradleDistributionAfter, gradleDistributionBefore)) {
    throw new Error('AUDIT_BUILD_GRADLE_DISTRIBUTION_MUTATED');
  }
  const dependencyClosureAfterBuild = dependencyClosureIdentity(path.join(root, 'node_modules'));
  if (!sameClosure(dependencyClosureAfterBuild, dependencyClosureBeforeGradle)) {
    throw new Error('AUDIT_BUILD_DEPENDENCY_CLOSURE_MUTATED');
  }
  const after = buildContext(root);
  if (after.status || after.worktreeFingerprint.treeSha256 !== before.worktreeFingerprint.treeSha256 ||
      after.productFingerprint.treeSha256 !== before.productFingerprint.treeSha256) {
    throw new Error('AUDIT_BUILD_TARGET_MUTATED');
  }
  const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error('AUDIT_BUILD_APK_MISSING');
  const apkBytes = fs.readFileSync(apk);
  const normalized = normalizedApkFingerprint(apk);
  const generatedAndroid = generatedAndroidIdentity(root);
  const record = {
    format: 'SAAGAR_AUDIT_BUILD_CAPTURE', schemaVersion: 2,
    sourceSha: before.head,
    productFingerprint: { algorithm: before.productFingerprint.algorithm,
      fileCount: before.productFingerprint.fileCount, totalBytes: before.productFingerprint.totalBytes,
      treeSha256: before.productFingerprint.treeSha256 },
    isolation,
    cleanBefore: true,
    cleanAfter: true,
    command: invocation.display,
    startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), elapsedMs: endedAt - startedAt,
    commandOutputSha256: sha256(built.output),
    toolchain: identity,
    bootstrap,
    install: { command: install.command, exitCode: install.exitCode, elapsedMs: install.elapsedMs,
      outputSha256: install.outputSha256, sourceNodeModulesAbsent: install.sourceNodeModulesAbsent },
    /* Aggregates only — counts and hashes, never paths or contents. Equality of
       these across both controlled builds is what makes two equal APK hashes
       mean "independently prepared identical inputs" rather than "same tree
       measured twice". */
    dependencyClosure: {
      afterInstall: dependencyClosureAfterInstall,
      beforeGradle: dependencyClosureBeforeGradle,
      afterBuild: dependencyClosureAfterBuild,
      stableThroughBuild: true
    },
    gradleDistribution: {
      before: gradleDistributionBefore,
      after: gradleDistributionAfter,
      stableThroughBuild: true,
      isolatedUserHome: true
    },
    generatedAndroid,
    signingMode: 'debug',
    artifact: {
      file: 'app-debug.apk', bytes: apkBytes.length, sha256: sha256(apkBytes),
      normalized: { entryCount: normalized.entryCount, totalUncompressedBytes: normalized.totalUncompressedBytes,
        sha256: normalized.sha256, excludedSignatureEntryCount: normalized.excludedSignatureEntries.length }
    }
  };
  fs.mkdirSync(output, { recursive: true });
  assertExternalPath(root, output, 'AUDIT_BUILD_OUTPUT_MUST_BE_EXTERNAL');
  fs.copyFileSync(apk, path.join(output, 'app-debug.apk'), fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(output, 'BUILD.json'), safeJson(record, { forbiddenRoots: [root, os.homedir()] }),
    { encoding: 'utf8', flag: 'wx' });
  return record;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = captureBuild(options);
  process.stdout.write(`${JSON.stringify({ sourceSha: result.sourceSha, artifactSha256: result.artifact.sha256,
    normalizedSha256: result.artifact.normalized.sha256 })}\n`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--windows-command-helper') runWindowsCommandHelper(process.argv[3]);
    else main();
  } catch (error) { process.stderr.write(`${JSON.stringify(safeError(error))}\n`); process.exitCode = 1; }
}
