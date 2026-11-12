/*
 * Build a clearly identified full V6 synthetic-data debug APK without ever
 * enabling demo seeding in www/index.html. Only the generated Android assets are
 * changed, then restored after Gradle has packaged the APK.
 *
 * The synthetic ETP demo wiring (loader, demo gateway selector, composer hook,
 * E7 form defaults and etp-demo-operational.js) does not exist in production
 * source. It is injected here, into generated assets only, behind the seeded
 * guard (owner decision given in chat, 2026-11-11). Injection happens before
 * prepare-api23-assets so the generated manifest pins the patched bytes; the
 * finally block re-syncs so the generated tree is demo-free again.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  DEMO_FILE_PATCHES,
  DEMO_LOADER_STATEMENT,
  DEMO_PUBLIC_NAME,
  DEMO_SOURCE_RELATIVE,
  applyDemoPatch
} from './lib/seeded-demo-injection.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(repoDir, 'android');
const sourceIndexPath = path.join(repoDir, 'www', 'index.html');
const sourceManifestPath = path.join(repoDir, 'www', 'module-manifest.js');
const generatedIndexPath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'assets',
  'public',
  'index.html'
);
const generatedManifestPath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'assets',
  'public',
  'module-manifest.js'
);
const sourceRuntimePath = path.join(repoDir, 'www', 'shared', 'module-runtime.js');
const generatedRuntimePath = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'shared', 'module-runtime.js');
const sourceMah4RuntimePath = path.join(repoDir, 'www', 'shared', 'mah4-runtime.js');
const generatedMah4RuntimePath = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'shared', 'mah4-runtime.js');
const generatedPublicDir = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public');
const generatedDemoPath = path.join(generatedPublicDir, DEMO_PUBLIC_NAME);
const generatedBridgePath = path.join(generatedPublicDir, 'shared', 'module-bridge.js');
const demoSourcePath = path.join(repoDir, ...DEMO_SOURCE_RELATIVE.split('/'));
const productionDemoPath = path.join(repoDir, 'www', DEMO_PUBLIC_NAME);
const builtApkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);
const outputApkPath = path.resolve(
  repoDir,
  '..',
  'SaagarCC-V6-ETP-Full-Demo.apk'
);

const PROFILE = Object.freeze({
  id: 'two-year-review-v1',
  daysBack: 730,
  walkInsPerWorkingDay: 25,
  syntheticOnly: true,
  etpSyntheticOperational: true,
  stores: ['WLMHW', 'HEMW']
});

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (first !== source.lastIndexOf(before)) {
    throw new Error(`${label}: anchor is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd || repoDir,
    stdio: 'inherit',
    windowsHide: true,
    shell: options.shell === true
  });
}

const sourceIndex = fs.readFileSync(sourceIndexPath, 'utf8');
if (!/\bvar\s+DEMO_SEED_ENABLED\s*=\s*false\s*;/.test(sourceIndex) ||
    /\bvar\s+DEMO_SEED_ENABLED\s*=\s*true\s*;/.test(sourceIndex)) {
  throw new Error('Clean source seed flag is not safely disabled');
}

if (fs.existsSync(productionDemoPath)) {
  throw new Error('The demo implementation must not live in production www/; keep it under build-overrides/demo/');
}
if (!fs.existsSync(demoSourcePath)) {
  throw new Error(`Missing demo implementation: ${DEMO_SOURCE_RELATIVE}`);
}

// Same three steps as "npm run build:apk" before Gradle (sync, overrides; the
// API 23 transform is run separately so demo injection can sit between them).
function syncGeneratedAssets() {
  run(process.execPath, [
    '-r',
    path.join(repoDir, 'scripts', 'node-userinfo-shim.cjs'),
    path.join(repoDir, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'),
    'sync',
    'android'
  ]);
  run(process.execPath, [path.join(repoDir, 'build-overrides', 'apply-overrides.js')]);
}

syncGeneratedAssets();

const sourceManifest = fs.readFileSync(sourceManifestPath);
const generatedManifest = fs.readFileSync(generatedManifestPath);
if (!sourceManifest.equals(generatedManifest)) {
  throw new Error('Generated Android manifest does not byte-match www/module-manifest.js');
}
if (!fs.readFileSync(sourceRuntimePath).equals(fs.readFileSync(generatedRuntimePath))) {
  throw new Error('Generated Android shared runtime does not byte-match www/shared/module-runtime.js');
}
if (!fs.readFileSync(sourceMah4RuntimePath).equals(fs.readFileSync(generatedMah4RuntimePath))) {
  throw new Error('Generated Android MAH-4 runtime does not byte-match www/shared/mah4-runtime.js');
}
// The demo patch anchors must apply to production bytes, so the generated
// copies of the three patched files must still match www/ before patching.
for (const patch of DEMO_FILE_PATCHES) {
  const sourceFile = fs.readFileSync(path.join(repoDir, 'www', ...patch.file.split('/')));
  const generatedFile = fs.readFileSync(path.join(generatedPublicDir, ...patch.file.split('/')));
  if (!sourceFile.equals(generatedFile)) {
    throw new Error(`Generated Android ${patch.file} does not byte-match www/${patch.file}`);
  }
}
const generatedClean = fs.readFileSync(generatedIndexPath, 'utf8');
const manifestTag = '<script src=' + JSON.stringify('module-manifest.js') + '></script>';
const manifestAt = generatedClean.indexOf(manifestTag);
const shellAt = generatedClean.indexOf('const MODULES =');
if (generatedClean.split(manifestTag).length - 1 !== 1 || manifestAt < 0 || shellAt <= manifestAt) {
  throw new Error('Generated Android shell does not load one synchronous manifest before the main shell');
}
let generatedSeeded = replaceOnce(
  generatedClean,
  'var DEMO_SEED_ENABLED = false;',
  'var DEMO_SEED_ENABLED = true;',
  'generated seed flag'
);
generatedSeeded = replaceOnce(
  generatedSeeded,
  "if(!window.__SEED_DAYS) window.__SEED_DAYS = 365; if(!window.__SEED_WALK) window.__SEED_WALK = 50;",
  `if(!window.__SEED_DAYS) window.__SEED_DAYS = ${PROFILE.daysBack}; ` +
    `if(!window.__SEED_WALK) window.__SEED_WALK = ${PROFILE.walkInsPerWorkingDay};`,
  'generated two-year seed profile'
);
// Demo loader: parser-blocking, its own statement (not inside a try/catch, so a
// failure is not swallowed) in the seeded-only inline script after the
// strict-boolean guard, at the same place 605002f had it (before the profile line).
generatedSeeded = replaceOnce(
  generatedSeeded,
  `\ntry{ if(!window.__SEED_DAYS) window.__SEED_DAYS = ${PROFILE.daysBack};`,
  `\n${DEMO_LOADER_STATEMENT}\ntry{ if(!window.__SEED_DAYS) window.__SEED_DAYS = ${PROFILE.daysBack};`,
  'generated demo loader'
);
if (!generatedSeeded.includes('two-year-review-v1') &&
    !generatedSeeded.includes('__SAAGAR_DEMO_PROFILE')) {
  throw new Error('Generated shell is missing the demo-profile safety control');
}

try {
  fs.writeFileSync(generatedIndexPath, generatedSeeded, 'utf8');
  for (const patch of DEMO_FILE_PATCHES) {
    const target = path.join(generatedPublicDir, ...patch.file.split('/'));
    fs.writeFileSync(target, applyDemoPatch(fs.readFileSync(target, 'utf8'), patch), 'utf8');
  }
  fs.copyFileSync(demoSourcePath, generatedDemoPath);
  run(process.execPath, [path.join(repoDir, 'scripts', 'prepare-api23-assets.mjs')]);
  if (!fs.existsSync(generatedDemoPath) ||
      !fs.readFileSync(generatedBridgePath, 'utf8').includes('SaagarEtpDemoOperational') ||
      !fs.readFileSync(generatedIndexPath, 'utf8').includes(DEMO_PUBLIC_NAME)) {
    throw new Error('Seeded demo injection is missing from the generated assets; refusing to build a non-demo APK');
  }
  new vm.Script(fs.readFileSync(generatedManifestPath, 'utf8'), { filename: 'generated module-manifest.js' });
  if (process.platform === 'win32') {
    run(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', '.\\gradlew.bat assembleDebug'],
      { cwd: androidDir }
    );
  } else {
    run(path.join(androidDir, 'gradlew'), ['assembleDebug'], { cwd: androidDir });
  }
  if (!fs.existsSync(builtApkPath)) throw new Error('Gradle did not produce app-debug.apk');
  fs.copyFileSync(builtApkPath, outputApkPath);
} finally {
  fs.writeFileSync(generatedIndexPath, generatedClean, 'utf8');
  // The three patched pinned files and the generated manifest were rewritten by
  // prepare-api23-assets, so restoring single files would leave them inconsistent.
  // Remove the demo file and rebuild the whole generated tree from production www.
  try {
    fs.rmSync(generatedDemoPath, { force: true });
    syncGeneratedAssets();
    run(process.execPath, [path.join(repoDir, 'scripts', 'prepare-api23-assets.mjs')]);
    if (fs.existsSync(generatedDemoPath) ||
        fs.readFileSync(generatedBridgePath, 'utf8').includes('SaagarEtpDemoOperational')) {
      throw new Error('demo wiring still present after restore');
    }
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(
      `Generated assets may still contain demo wiring (${error.message}); run npm.cmd run sync before any production build.\n`
    );
  }
}

const apk = fs.readFileSync(outputApkPath);
const result = {
  output: outputApkPath,
  bytes: apk.length,
  sha256: crypto.createHash('sha256').update(apk).digest('hex').toUpperCase(),
  profile: PROFILE
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
