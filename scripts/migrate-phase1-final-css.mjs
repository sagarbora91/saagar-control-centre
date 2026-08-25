#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const tokenModules = ['cro_audit','dsr','leave','qms'];
const tokenBody = `
  --navy:#0d2340; --navy-mid:#1a3a5c; --navy-light:#264d7a;
  --gold:#b8922a; --gold-light:#d4a843; --gold-pale:#fdf6e3;
  --cream:#faf8f3; --paper:#ffffff;
  --red:#b91c1c; --red-pale:#fef2f2; --amber:#b45309; --amber-pale:#fffbeb;
  --green:#166534; --green-pale:#f0fdf4; --blue:#1d4ed8; --blue-pale:#eff6ff;
  --gray-50:#fafafa; --gray-100:#f4f4f5; --gray-200:#e4e4e7; --gray-300:#d4d4d8;
  --gray-400:#a1a1aa; --gray-500:#71717a; --gray-600:#52525b; --gray-700:#3f3f46; --gray-800:#27272a;
  --radius:12px; --radius-lg:16px;
  --font-sans:'DM Sans',system-ui,'Segoe UI',Roboto,Arial,sans-serif;
  --font-serif:'DM Serif Display',Georgia,'Times New Roman',serif;
`;
const tokenExpression = /:root\s*\{([\s\S]*?)\}/g;
for (const moduleId of tokenModules) {
  const file = path.join(root, 'www/modules', moduleId, 'index.html');
  let source = fs.readFileSync(file, 'utf8');
  let found = 0;
  source = source.replace(tokenExpression, (whole, body) => {
    if (body.trim() !== tokenBody.trim()) return whole;
    found++;
    return '';
  });
  if (found !== 1 && !(found === 0 && source.includes('../../shared/module-brand-tokens.css'))) throw new Error(`${moduleId}: expected one shared token block, found ${found}`);
  if (!source.includes('../../shared/module-brand-tokens.css')) source = source.replace('<script src="../../shared/module-runtime.js"></script>', '<script src="../../shared/module-runtime.js"></script>\n<link rel="stylesheet" href="../../shared/module-brand-tokens.css">');
  fs.writeFileSync(file, source, 'utf8');
}
const tokenBytes = Buffer.from(`:root{${tokenBody}}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'www/shared/module-brand-tokens.css'), tokenBytes);

const deleteSelectors = [
  '.gm-tbl-budget td.gm-del-cell','.gm-tbl-firmpl td.gm-del-cell','.gm-tbl-monthsum td.gm-del-cell','.gm-tbl-vendors td.gm-del-cell',
  '#gm-table td.gm-del-cell','#croMasterTbl td.gm-del-cell'
];
let deleteBody = null;
for (const moduleId of ['expense','payroll','qms']) {
  const file = path.join(root, 'www/modules', moduleId, 'index.html');
  let source = fs.readFileSync(file, 'utf8');
  for (const selector of deleteSelectors) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`, 'g');
    source = source.replace(expression, (whole, body) => {
      const normalized = body.replace(/\s+/g, '').trim();
      if (deleteBody === null) deleteBody = normalized;
      if (normalized !== deleteBody) throw new Error(`${moduleId}:${selector} declaration drift`);
      return '';
    });
  }
  if (!source.includes('../../shared/module-delete-cell.css')) source = source.replace('<script src="../../shared/module-runtime.js"></script>', '<script src="../../shared/module-runtime.js"></script>\n<link rel="stylesheet" href="../../shared/module-delete-cell.css">');
  fs.writeFileSync(file, source, 'utf8');
}
if (!deleteBody) throw new Error('Delete-cell authority not found');
const deleteBytes = Buffer.from(`${deleteSelectors.join(',')}{${deleteBody}}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'www/shared/module-delete-cell.css'), deleteBytes);

const assets = [
  { id:'module-brand-tokens-css', file:'shared/module-brand-tokens.css', bytes:tokenBytes },
  { id:'module-delete-cell-css', file:'shared/module-delete-cell.css', bytes:deleteBytes }
];
const snapshot = readModuleManifestSource(root);
snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => !assets.some(asset => asset.id === item.id));
for (const asset of assets) snapshot.data.sharedAssets.push({ id:asset.id, version:1, file:asset.file, bytes:asset.bytes.length, sha256:sha256(asset.bytes) });
for (const module of snapshot.data.modules) { const bytes=fs.readFileSync(path.join(root,'www',module.file)); module.bytes=bytes.length; module.sha256=sha256(bytes); }
fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
process.stdout.write(`${JSON.stringify({ tokenModules:tokenModules.length, deleteSelectors:deleteSelectors.length })}\n`);
