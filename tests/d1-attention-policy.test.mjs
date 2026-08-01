import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const policy = require('../www/attention-policy.js');
const shell = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

test('backup health consolidates simultaneous local and off-device failures into one action', () => {
  const item = policy.backupHealth({
    failureEscalated: true,
    plaintextWarning: true,
    legacyPurgeNeeded: true,
    backupRecency: 'missing'
  });
  assert.equal(item.key, 'backup-health');
  assert.equal(item.color, 'red');
  assert.equal(item.priority, 112);
  assert.equal(item.action, "switchView('config');switchConfigTab('backup')");
  assert.match(item.msg, /failed beyond 36 hours/);
  assert.match(item.msg, /plaintext fallback/);
  assert.match(item.msg, /old shared-storage plaintext/);
  assert.match(item.msg, /No verified off-device backup/);
  assert.match(item.msg, /fresh encrypted backup/);
});

test('backup health keeps a due-soon portable backup directly actionable', () => {
  const item = policy.backupHealth({ backupRecency: 'amber', backupDays: 5 });
  assert.equal(item.color, 'orange');
  assert.equal(item.priority, 80);
  assert.equal(item.action, 'shareBackup()');
  assert.equal(item.cta, 'Share now');
  assert.match(item.msg, /5 days old/);
  assert.equal(policy.backupHealth({ backupRecency: 'quiet' }), null);
});

test('attention normalization collapses stable duplicates and retains the strongest item', () => {
  const result = policy.normalize([
    { key: 'same', priority: 20, color: 'orange', title: 'Earlier' },
    { key: 'same', priority: 100, color: 'red', title: 'Strongest' },
    { key: 'other', priority: 10, title: 'Distinct' }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Strongest');
  assert.equal(result[0].duplicateCount, 2);
  assert.equal(result[1].title, 'Distinct');
});

test('Home integrates one backup-health item and one staff-sync attention item', () => {
  assert.match(shell, /<script src="attention-policy\.js"><\/script>/);
  assert.match(shell, /attentionPolicy\.backupHealth/);
  assert.match(shell, /backupPolicyFailed/);
  assert.match(shell, /attentionPolicy\.normalize\(items\)/);
  assert.match(shell, /key:'staff-master-sync'/);
  assert.doesNotMatch(shell, /key:'backup-(?:plaintext-warning|private-failure|legacy-purge|offdevice-red|offdevice-amber|offdevice-missing)'/);
});
