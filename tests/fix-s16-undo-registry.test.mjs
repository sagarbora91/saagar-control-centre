import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createWwwFingerprint } from '../scripts/mah3-visual-review-server.mjs';
import { fixWaveRegistry, undoFixWaveText, undoFixWaveTree } from './lib/fix-wave-undo.mjs';

// S16 governance (fix wave 2026-11-12). The registry gives the historical helpers the exact pre-wave bytes of every
// www file the wave changed. These tests prove the registry is complete, current, exact and cannot hide a later edit.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const registry = fixWaveRegistry();
const AUDIT_MUTATION_ANCHORS = ['www/etp-reconciliation-policy.js', 'www/storage-core.js', 'www/reauth-policy.js', 'www/portable-backup.js', 'www/export-control.js'];

function copyWww() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-fixwave-undo-'));
  fs.cpSync(path.join(root, 'www'), path.join(dir, 'www'), { recursive: true });
  return dir;
}

test('the undo registry exists, is versioned and registers only www text files', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.ok(Object.keys(registry.files).length > 0, 'registry has no entries: run make-undo-registry after the last www edit');
  for (const rel of Object.keys(registry.files)) assert.match(rel, /^www\/[^\\]+$/, rel);
  for (const rel of registry.created) assert.match(rel, /^www\/[^\\]+$/, rel);
  assert.match(registry.preWaveFreeze.treeSha256, /^[a-f0-9]{64}$/);
});

test('every registered file still has exactly its registered post-wave bytes', () => {
  for (const [rel, entry] of Object.entries(registry.files)) {
    const bytes = fs.readFileSync(path.join(root, rel));
    assert.equal(bytes.length, entry.postBytes, `${rel}: bytes differ from the registry (regenerate the registry after any www edit)`);
    assert.equal(sha256(bytes), entry.postSha256, `${rel}: content differs from the registry (regenerate the registry after any www edit)`);
  }
});

test('undo gives back the exact pre-wave bytes of every registered file', () => {
  for (const [rel, entry] of Object.entries(registry.files)) {
    const restored = undoFixWaveText(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    const bytes = Buffer.from(restored, 'utf8');
    assert.equal(bytes.length, entry.preBytes, rel);
    assert.equal(sha256(bytes), entry.preSha256, rel);
  }
});

test('undoing a copy of www reproduces the frozen pre-wave www fingerprint (completeness of the registry)', () => {
  const dir = copyWww();
  try {
    undoFixWaveTree(dir);
    const fp = createWwwFingerprint(dir);
    assert.equal(fp.fileCount, registry.preWaveFreeze.fileCount);
    assert.equal(fp.totalBytes, registry.preWaveFreeze.totalBytes);
    assert.equal(fp.treeSha256, registry.preWaveFreeze.treeSha256,
      'a www file changed by the wave is missing from the registry, or a registered file changed after the registry was made');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the undo is gated by the post-wave hash and is idempotent', () => {
  const [rel] = Object.keys(registry.files);
  const current = fs.readFileSync(path.join(root, rel), 'utf8');
  const undone = undoFixWaveText(rel, current);
  assert.notEqual(undone, current, 'a registered file must differ from its pre-wave text');
  assert.equal(undoFixWaveText(rel, undone), undone, 'undo twice must be a no-op');
  const unregisteredEdit = current + '\n<!-- later unregistered edit -->\n';
  assert.equal(undoFixWaveText(rel, unregisteredEdit), unregisteredEdit, 'unregistered text must pass through so the frozen hashes stay red');
  assert.equal(undoFixWaveText('www/not-registered.js', 'x'), 'x');
});

test('files created by the wave exist now and are removed by the tree undo', () => {
  const dir = copyWww();
  try {
    for (const rel of registry.created) assert.ok(fs.existsSync(path.join(root, rel)), `${rel} is listed as created but missing`);
    undoFixWaveTree(dir);
    for (const rel of registry.created) assert.equal(fs.existsSync(path.join(dir, rel)), false, rel);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no audit mutation-anchor file is registered unless the owner approved that change', () => {
  const approved = new Set(registry.ownerApprovedAuditAnchorChanges || []);
  for (const rel of AUDIT_MUTATION_ANCHORS) {
    if (registry.files[rel]) assert.ok(approved.has(rel), `${rel} changed: the audit mutation allow-list needs an owner decision (S16 OD-6)`);
  }
});
