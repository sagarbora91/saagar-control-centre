/*
 * Build a clearly identified two-year synthetic-data debug APK without ever
 * enabling demo seeding in www/index.html. Only the generated Android asset is
 * changed, then restored after Gradle has packaged the APK.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(repoDir, 'android');
const sourceIndexPath = path.join(repoDir, 'www', 'index.html');
const generatedIndexPath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'assets',
  'public',
  'index.html'
);
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
  'SaagarCC-DemoData-2Years-D1-D3-v2.9.apk'
);

const PROFILE = Object.freeze({
  id: 'two-year-review-v1',
  daysBack: 730,
  walkInsPerWorkingDay: 25,
  syntheticOnly: true,
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

run(process.execPath, [
  '-r',
  path.join(repoDir, 'scripts', 'node-userinfo-shim.cjs'),
  path.join(repoDir, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'),
  'sync',
  'android'
]);
run(process.execPath, [path.join(repoDir, 'build-overrides', 'apply-overrides.js')]);

const generatedClean = fs.readFileSync(generatedIndexPath, 'utf8');
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
if (!generatedSeeded.includes('two-year-review-v1') &&
    !generatedSeeded.includes('__SAAGAR_DEMO_PROFILE')) {
  throw new Error('Generated shell is missing the demo-profile safety control');
}

try {
  fs.writeFileSync(generatedIndexPath, generatedSeeded, 'utf8');
  if (process.platform === 'win32') {
    run(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'gradlew.bat assembleDebug'],
      { cwd: androidDir }
    );
  } else {
    run(path.join(androidDir, 'gradlew'), ['assembleDebug'], { cwd: androidDir });
  }
  if (!fs.existsSync(builtApkPath)) throw new Error('Gradle did not produce app-debug.apk');
  fs.copyFileSync(builtApkPath, outputApkPath);
} finally {
  fs.writeFileSync(generatedIndexPath, generatedClean, 'utf8');
}

const apk = fs.readFileSync(outputApkPath);
const result = {
  output: outputApkPath,
  bytes: apk.length,
  sha256: crypto.createHash('sha256').update(apk).digest('hex').toUpperCase(),
  profile: PROFILE
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
