#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleIds = fs.readdirSync(path.join(root, 'www/modules'));
const selectors = [
  'html.bcc-mobile[data-mod="qms"] #st-v5-qms-menu',
  'html.bcc-mobile .accordion-header',
  'html.bcc-mobile .sticky-actionbar',
  'html.bcc-mobile .bcc-card-row',
  'html.bcc-mobile .tab-chips',
  'html.bcc-mobile .bcc-card'
];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rule = selector => new RegExp(`${escape(selector)}\\s*\\{([^{}]*)\\}`, 'g');
const authority = new Map();
const planning = fs.readFileSync(path.join(root, 'www/modules/planning/index.html'), 'utf8');
const planningBlock = planning.match(/<style\s+id=["']st-v5-mobile-css["']>([\s\S]*?)<\/style>/i);
if (!planningBlock) throw new Error('Planning mobile CSS authority missing');
for (const selector of selectors) {
  const matches = [...planningBlock[1].matchAll(rule(selector))];
  if (!matches.length) throw new Error(`Planning authority missing ${selector}`);
  const bodies = new Set(matches.map(match => match[1].trim()));
  if (bodies.size !== 1) throw new Error(`Planning authority drift for ${selector}`);
  authority.set(selector, matches[0][1].trim());
}

for (const moduleId of moduleIds) {
  const file = path.join(root, 'www/modules', moduleId, 'index.html');
  let source = fs.readFileSync(file, 'utf8');
  const blockMatch = source.match(/<style\s+id=["']st-v5-mobile-css["']>([\s\S]*?)<\/style>/i);
  if (!blockMatch) throw new Error(`${moduleId}: mobile CSS block missing`);
  let block = blockMatch[1];
  for (const selector of selectors) {
    const matches = [...block.matchAll(rule(selector))];
    for (const match of matches) if (authority.get(selector) !== match[1].trim()) throw new Error(`${moduleId}:${selector} declaration drift`);
    if (!matches.length && !source.includes('../../shared/module-mobile-common.css')) throw new Error(`${moduleId}:${selector} missing before migration`);
    block = block.replace(rule(selector), '');
  }
  source = source.replace(blockMatch[0], `<style id="st-v5-mobile-css">${block}</style>`);
  if (!source.includes('../../shared/module-mobile-common.css')) {
    source = source.replace('<style id="st-v5-mobile-css">', '<link rel="stylesheet" href="../../shared/module-mobile-common.css">\n<style id="st-v5-mobile-css">');
  }
  fs.writeFileSync(file, source, 'utf8');
}

const css = `${selectors.map(selector => `${selector}{${authority.get(selector)}}`).join('\n')}\n`;
const assetFile = 'shared/module-mobile-common.css';
const assetBytes = Buffer.from(css, 'utf8');
fs.writeFileSync(path.join(root, 'www', assetFile), assetBytes);
const snapshot = readModuleManifestSource(root);
snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => item.id !== 'module-mobile-common-css');
snapshot.data.sharedAssets.push({ id: 'module-mobile-common-css', version: 1, file: assetFile, bytes: assetBytes.length, sha256: crypto.createHash('sha256').update(assetBytes).digest('hex') });
for (const module of snapshot.data.modules) {
  const bytes = fs.readFileSync(path.join(root, 'www', module.file));
  module.bytes = bytes.length;
  module.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
}
fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
process.stdout.write(`${JSON.stringify({ modules: moduleIds.length, selectors: selectors.length, bytes: assetBytes.length })}\n`);
