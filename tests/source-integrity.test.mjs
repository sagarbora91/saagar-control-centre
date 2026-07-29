import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const autoBackup = fs.readFileSync(path.join(root, 'www/auto-backup.js'), 'utf8');
const overrides = fs.readFileSync(path.join(root, 'build-overrides/apply-overrides.js'), 'utf8');
const nativeSecurity = fs.readFileSync(path.join(root, 'build-overrides/native/SaagarSecurityPlugin.java'), 'utf8');

test('all inline shell scripts parse and the clean source seed stays disabled', () => {
  const withoutHtmlComments = index.replace(/<!--[\s\S]*?-->/g, '');
  const scripts = [...withoutHtmlComments.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 6, 'expected shell inline scripts');
  scripts.forEach((match, i) => {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: `index-inline-${i + 1}.js` }));
  });
  assert.match(index, /\b(?:const|let|var)\s+DEMO_SEED_ENABLED\s*=\s*false\s*;/);
  assert.doesNotMatch(index, /\b(?:const|let|var)\s+DEMO_SEED_ENABLED\s*=\s*true\s*;/);
});

test('export control loads before report/share layers and module messages are origin-bound', () => {
  const exportPos = index.indexOf('<script src="export-control.js"></script>');
  const portablePos = index.indexOf('<script src="portable-backup.js"></script>');
  const restorePos = index.indexOf('<script src="restore-engine.js"></script>');
  const whatsappPos = index.indexOf('<script src="whatsapp-share.js"></script>');
  const reportPos = index.indexOf('<script src="saagar-report.js"></script>');
  assert.ok(exportPos > 0 && exportPos < whatsappPos && exportPos < reportPos);
  assert.ok(portablePos > exportPos && portablePos < whatsappPos);
  assert.ok(restorePos > portablePos && restorePos < whatsappPos);
  assert.match(index, /e\.source===__mf\.contentWindow/);
  assert.match(index, /module\.message\.denied/);
});

test('export register is device-local, restore-blocked and has no erase control', () => {
  const appKeys = index.match(/function appControlKeys\(\)\{[\s\S]*?\}/)?.[0] || '';
  const blocked = index.match(/function restoreBlockedKeys\(\)\{[\s\S]*?\}/)?.[0] || '';
  const control = fs.readFileSync(path.join(root, 'www/export-control.js'), 'utf8');
  assert.doesNotMatch(appKeys, /EXPORT_REGISTER_KEY/);
  assert.match(blocked, /EXPORT_REGISTER_KEY/);
  assert.doesNotMatch(control, /clearRegister/);
});

test('portable egress is encrypted and no raw sqlite companion is emitted', () => {
  assert.match(index, /\.sccbak/);
  assert.match(index, /SaagarPortableBackup\.seal/);
  assert.match(index, /SaagarRestoreEngine\.run/);
  assert.doesNotMatch(index, /Saagar_Traders_\$\{todayIso\(\)\}\.sqlite/);
  assert.doesNotMatch(index, /__db\.export\(\)/);
});

test('R0-W3 permanent restore and backup safety contracts are present', () => {
  assert.match(index, /SaagarRestoreEngine\.run/);
  assert.match(index, /quarantineRejectedRestore/);
  assert.match(index, /RESTORE_ACCEPTANCE_KEY/);
  assert.match(index, /RESTORE_DRILL_KEY/);
  assert.match(index, /qmsReplaceArchive/);
  assert.match(index, /undoLastModuleReset/);
  assert.match(autoBackup, /KEEP_DAYS\s*=\s*7/);
  assert.match(autoBackup, /KEEP_WEEKS\s*=\s*5/);
  assert.match(autoBackup, /KEEP_MONTHS\s*=\s*12/);
  assert.match(autoBackup, /failureThresholdHours:\s*36/);
});

test('SEC-09/10/11/12/13 release controls are permanent source gates', () => {
  assert.match(index, /function auditSanitize\(/);
  assert.match(index, /format:'saagar-sanitised-support'/);
  assert.match(index, /liveBackupProhibited:true/);
  assert.match(index, /HIGHEST_BUILD_KEY/);
  assert.match(index, /setSecureWindowForModule/);
  assert.match(nativeSecurity, /FLAG_SECURE/);
  assert.match(nativeSecurity, /FLAG_DEBUGGABLE/);
  assert.match(nativeSecurity, /rootArtifact/);
  assert.match(overrides, /SAAGAR_KEYSTORE_FILE/);
  assert.match(overrides, /versionCode 208/);
  assert.match(overrides, /buildTypes\\s\*\\\{[\s\S]*signingConfig/);
  assert.match(overrides, /SaagarSecurityPlugin/);
});
