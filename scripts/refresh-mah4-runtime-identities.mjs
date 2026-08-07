#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const snapshot = readModuleManifestSource(root);

for (const entry of snapshot.data.modules) {
  const bytes = fs.readFileSync(path.join(root, 'www', entry.file));
  entry.bytes = bytes.length;
  entry.sha256 = sha256(bytes);
}
for (const entry of snapshot.data.sharedAssets) {
  const bytes = fs.readFileSync(path.join(root, 'www', entry.file));
  entry.bytes = bytes.length;
  entry.sha256 = sha256(bytes);
}
fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
process.stdout.write(`${JSON.stringify({ modules: snapshot.data.modules.length, sharedAssets: snapshot.data.sharedAssets.length })}\n`);
