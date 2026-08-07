#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const definitions = Object.freeze({
  dsr: Object.freeze({
    nextSteps: Object.freeze([{ id: 'stock', label: 'Update Stock →' }]),
    customerSelectors: Object.freeze([]),
    accessContext: true
  }),
  qms: Object.freeze({
    nextSteps: Object.freeze([{ id: 'dsr', label: 'Record in DSR →' }]),
    customerSelectors: Object.freeze(['#custName']),
    accessContext: false
  })
});
const stages = Object.freeze([
  ['st-v5-iframe-shim', 'storage'],
  ['st-v5-safety-net', 'safety'],
  ['st-v5-mobile-boot', 'mobile'],
  ['st-v5-back-script', 'back'],
  ['st-v5-emp-assist-script', 'employees'],
  ['st-v5-module-audit-bridge', 'audit']
]);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function literal(value) {
  return JSON.stringify(value).replace(/"([^"\\]+)":/g, '$1:').replace(/"/g, "'");
}

function apply(moduleId) {
  const definition = definitions[moduleId];
  if (!definition) throw new Error(`Unknown MAH canary module: ${moduleId}`);
  const modulePath = path.join(root, 'www', 'modules', moduleId, 'index.html');
  let html = fs.readFileSync(modulePath, 'utf8');
  const config = literal({ schemaVersion: 1, moduleId, ...definition });
  if (!html.includes('../../shared/module-runtime.js')) {
    html = html.replace(/<head>(\r?\n)/, `<head>$1<script src="../../shared/module-runtime.js"></script>$1`);
  }
  for (const [id, stage] of stages) {
    const expression = new RegExp(`(<script\\b[^>]*id=["']${id}["'][^>]*>)[\\s\\S]*?(<\\/script>)`, 'i');
    if (!expression.test(html)) throw new Error(`Missing ${moduleId} helper: ${id}`);
    html = html.replace(expression, `$1SaagarModuleRuntime.run('${stage}',${config});$2`);
  }
  fs.writeFileSync(modulePath, html, 'utf8');
  const bytes = fs.readFileSync(modulePath);
  const snapshot = readModuleManifestSource(root);
  const runtimeBytes = fs.readFileSync(path.join(root, 'www', 'shared', 'module-runtime.js'));
  const runtimeEntry = snapshot.data.sharedAssets.find(item => item.id === 'module-runtime');
  if (!runtimeEntry) throw new Error('Manifest shared runtime missing');
  runtimeEntry.bytes = runtimeBytes.length;
  runtimeEntry.sha256 = sha256(runtimeBytes);
  const entry = snapshot.data.modules.find(item => item.id === moduleId);
  if (!entry) throw new Error(`Manifest module missing: ${moduleId}`);
  entry.bytes = bytes.length;
  entry.sha256 = sha256(bytes);
  fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
  return { moduleId, bytes: bytes.length, sha256: sha256(bytes), config };
}

const requested = process.argv.slice(2);
if (requested.length !== 1) throw new Error('Usage: node scripts/apply-mah-runtime-canary.mjs <dsr|qms>');
process.stdout.write(`${JSON.stringify(apply(requested[0]))}\n`);
