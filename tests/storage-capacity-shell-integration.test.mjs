import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFunction(name) {
  const start = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`).exec(index);
  assert.ok(start, `expected function ${name}`);
  const open = index.indexOf('{', start.index + start[0].length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let position = open; position < index.length; position += 1) {
    const character = index[position];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return index.slice(start.index, position + 1);
  }
  assert.fail(`unterminated function ${name}`);
}

test('capacity policy loads before storage-core and the main shell', () => {
  const policyAt = index.indexOf('<script src="storage-capacity-policy.js"></script>');
  const storageAt = index.indexOf('<script src="storage-core.js"></script>');
  const shellAt = index.indexOf('const MODULES =');
  assert.ok(policyAt >= 0, 'storage capacity policy must load');
  assert.ok(storageAt > policyAt, 'policy must load before storage-core');
  assert.ok(shellAt > storageAt, 'storage-core must load before the main shell');
});

test('Data & backup starts with an accessible Windows-style capacity card', () => {
  const sectionAt = index.indexOf('id="subBackup"');
  const sectionEnd = index.indexOf('</div>', sectionAt);
  const cardAt = index.indexOf('id="storageCapacityCard"', sectionAt);
  const backupAt = index.indexOf('Backup &amp; restore', sectionAt);

  assert.ok(sectionAt >= 0 && cardAt > sectionAt, 'capacity card must be in Data & backup');
  assert.ok(cardAt < backupAt, 'capacity card must be the first data card');
  assert.ok(sectionEnd > sectionAt);
  assert.match(index.slice(cardAt, backupAt), /role="progressbar"/);
  assert.match(index.slice(cardAt, backupAt), /aria-valuemin="0"/);
  assert.match(index.slice(cardAt, backupAt), /aria-valuemax="100"/);
  assert.match(index.slice(cardAt, backupAt), /SAAGAR SQLite database/i);
  assert.match(index, /\.storage-capacity-meter\b/);
  assert.match(index, /\.storage-capacity-fill\b/);
});

test('capacity refresh uses only the public store contract and ignores stale UI results', () => {
  const refresh = extractFunction('refreshStorageCapacityCard');
  const paint = extractFunction('paintStorageCapacityCard');
  const backup = extractFunction('renderConfigBackup');

  assert.match(refresh, /SaagarStore/);
  assert.match(refresh, /refreshStorageInfo\s*\(/);
  assert.match(refresh, /generation|request|token/i);
  assert.match(refresh, /!==/);
  assert.doesNotMatch(refresh + paint, /storageSnapshot|quick_check|freeBytes/);
  assert.match(paint, /SaagarStorageCapacityPolicy/);
  assert.match(paint, /displayModel\s*\(/);
  assert.match(paint, /usedPercent/);
  assert.match(paint, /availableLabel/);
  assert.match(paint, /databaseLabel/);
  assert.match(backup, /refreshStorageCapacityCard\s*\(/);
});

