#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'verification', 'module-build-golden-hashes.json');
const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = readModuleManifestSource(root).data;
for (const module of manifest.modules) {
  const bytes = fs.readFileSync(path.join(root, 'www', module.file));
  golden[module.id] = {
    ...(golden[module.id] || {}),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}
golden._profile.stageBIdentityRebound = true;
fs.writeFileSync(file, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ modules: manifest.modules.length })}\n`);
