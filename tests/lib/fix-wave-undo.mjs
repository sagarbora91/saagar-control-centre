// tests/lib/fix-wave-undo.mjs  (S16 governance; written by the integrator only)
// Gives every historical helper the exact bytes a file had BEFORE the 2026-11-12 fix wave.
// Rule: undo only when the input is exactly the registered post-wave text (sha256 gate). Anything else is returned
// unchanged, so the frozen hash checks downstream still decide (an unregistered edit stays red).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIX_WAVE_REGISTRY_PATH = path.join(here, '../fixtures/fix-wave/undo-registry.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
let cache;

export function fixWaveRegistry() {
  if (!cache) {
    cache = fs.existsSync(FIX_WAVE_REGISTRY_PATH)
      ? JSON.parse(fs.readFileSync(FIX_WAVE_REGISTRY_PATH, 'utf8'))
      : { schemaVersion: 1, files: {}, created: [] };
  }
  return cache;
}

export function undoFixWaveText(relPath, text) {
  const input = String(text);
  const entry = fixWaveRegistry().files[String(relPath).replace(/\\/g, '/')];
  if (!entry || sha256(Buffer.from(input, 'utf8')) !== entry.postSha256) return input;
  let out = '';
  let at = 0;
  for (const [start, end, pre] of entry.ops) { out += input.slice(at, start) + pre; at = end; }
  out += input.slice(at);
  if (sha256(Buffer.from(out, 'utf8')) !== entry.preSha256) {
    throw new Error(`fix-wave undo did not reproduce the pre-wave hash for ${relPath}`);
  }
  return out;
}

export function undoFixWaveTree(workspaceRoot) {
  const registry = fixWaveRegistry();
  for (const rel of Object.keys(registry.files)) {
    const file = path.join(workspaceRoot, rel);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = undoFixWaveText(rel, before);
    if (after !== before) fs.writeFileSync(file, after, 'utf8');
  }
  for (const rel of registry.created) {
    const file = path.join(workspaceRoot, rel);
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  return workspaceRoot;
}
