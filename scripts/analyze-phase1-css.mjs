#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_ASSET, LEGACY_MODULE_ALLOWLIST } from './prepare-phase6c-mobile-legacy-css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['st-v5-mobile-css', 'st-v5-uniform-css', 'st-v5-back-style', 'st-v5-emp-assist-style'];
const rows = [];
for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
  const source = fs.readFileSync(path.join(root, 'www/modules', moduleId, 'index.html'), 'utf8');
  for (const id of ids) {
    const match = source.match(new RegExp(`<style\\s+id=["']${id}["']>([\\s\\S]*?)<\\/style>`, 'i'));
    let body = match && match[1];
    let sourceKind = 'inline';
    if (!body && id === 'st-v5-mobile-css' && source.includes('../../shared/module-mobile-legacy.css')) {
      body = fs.readFileSync(path.join(root, 'www', LEGACY_ASSET), 'utf8');
      sourceKind = 'shared-link';
    }
    if (!body) continue;
    rows.push({ moduleId, id, sourceKind, bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex') });
  }
}
for (const id of ids) {
  const group = rows.filter(row => row.id === id);
  process.stdout.write(`${JSON.stringify({ id, variants: new Set(group.map(row => row.sha256)).size, rows: group })}\n`);
}
