#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const definitions = Object.freeze([
  { styleId: 'st-v5-uniform-css', assetId: 'module-uniform-css', file: 'shared/module-uniform.css' },
  { styleId: 'st-v5-back-style', assetId: 'module-back-css', file: 'shared/module-back.css' },
  { styleId: 'st-v5-emp-assist-style', assetId: 'module-employee-css', file: 'shared/module-employee.css' }
]);
const moduleIds = fs.readdirSync(path.join(root, 'www/modules'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

for (const definition of definitions) {
  let authority = null;
  for (const moduleId of moduleIds) {
    const modulePath = path.join(root, 'www/modules', moduleId, 'index.html');
    const source = fs.readFileSync(modulePath, 'utf8');
    const expression = new RegExp(`<style\\s+id=["']${definition.styleId}["']>([\\s\\S]*?)<\\/style>`, 'i');
    const match = source.match(expression);
    if (!match) throw new Error(`Missing ${definition.styleId} in ${moduleId}`);
    if (authority === null) authority = match[1];
    if (match[1] !== authority) throw new Error(`Shared CSS drift for ${definition.styleId} in ${moduleId}`);
  }
  const assetPath = path.join(root, 'www', definition.file);
  fs.writeFileSync(assetPath, authority, 'utf8');
  for (const moduleId of moduleIds) {
    const modulePath = path.join(root, 'www/modules', moduleId, 'index.html');
    let source = fs.readFileSync(modulePath, 'utf8');
    const expression = new RegExp(`<style\\s+id=["']${definition.styleId}["']>[\\s\\S]*?<\\/style>`, 'i');
    source = source.replace(expression, `<link id="${definition.styleId}" rel="stylesheet" href="../../${definition.file}">`);
    fs.writeFileSync(modulePath, source, 'utf8');
  }
}

const snapshot = readModuleManifestSource(root);
snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => !definitions.some(definition => definition.assetId === item.id));
for (const definition of definitions) {
  const bytes = fs.readFileSync(path.join(root, 'www', definition.file));
  snapshot.data.sharedAssets.push({ id: definition.assetId, version: 1, file: definition.file, bytes: bytes.length, sha256: sha256(bytes) });
}
for (const module of snapshot.data.modules) {
  const bytes = fs.readFileSync(path.join(root, 'www', module.file));
  module.bytes = bytes.length;
  module.sha256 = sha256(bytes);
}
fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
process.stdout.write(`${JSON.stringify({ modules: moduleIds.length, assets: definitions.map(item => item.assetId) })}\n`);
