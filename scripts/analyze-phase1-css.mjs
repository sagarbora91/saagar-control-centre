#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['st-v5-mobile-css', 'st-v5-uniform-css', 'st-v5-back-style', 'st-v5-emp-assist-style'];
const rows = [];
for (const moduleId of fs.readdirSync(path.join(root, 'www/modules'))) {
  const source = fs.readFileSync(path.join(root, 'www/modules', moduleId, 'index.html'), 'utf8');
  for (const id of ids) {
    const match = source.match(new RegExp(`<style\\s+id=["']${id}["']>([\\s\\S]*?)<\\/style>`, 'i'));
    if (!match) throw new Error(`Missing ${id} in ${moduleId}`);
    rows.push({ moduleId, id, bytes: Buffer.byteLength(match[1]), sha256: crypto.createHash('sha256').update(match[1]).digest('hex') });
  }
}
for (const id of ids) {
  const group = rows.filter(row => row.id === id);
  process.stdout.write(`${JSON.stringify({ id, variants: new Set(group.map(row => row.sha256)).size, rows: group })}\n`);
}
