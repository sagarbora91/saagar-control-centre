#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');
const require = createRequire(import.meta.url);
const manifestApi = require(path.join(repoDir, 'www', 'module-manifest.js'));
const goldenPath = path.join(repoDir, 'verification', 'module-build-golden-hashes.json');
const write = process.argv.includes('--write');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function normalizeOffline(html) {
  return String(html)
    .replace(/\r\n?/g, '\n')
    .replace(/<link\b[^>]*\bhref=["']https?:\/\/[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["'][^>]*>\s*<\/script>\s*/gi, '')
    .replace(/@import\s+(?:url\()?\s*["']?https?:\/\/[^;]+;\s*/gi, '');
}


function injectionRuntime(index) {
  const start = index.indexOf('function injectModuleHideCSS(');
  const end = index.indexOf('function openModal()', start);
  if (start < 0 || end < 0) throw new Error('module injection source boundaries not found');
  const source = index.slice(start, end);
  const context = { EMP_MASTER_KEY:'saagar_employee_master_v1', MK_CUSTOMERS:'saagar_master_customers', getUiMode:()=> 'mobile' };
  vm.createContext(context);
  vm.runInContext(source, context, { filename:'index-module-injections.js' });
  return { context, source };
}

function build(context, module) {
  let html = Buffer.from(module.html_b64, 'base64').toString('utf8');
  html = context.injectLegacyManagerPasswordGuard(html, module.id);
  html = context.injectBackHome(html, module.title, module.id);
  html = context.injectModuleHideCSS(html, module.id);
  html = context.injectEmployeeAssist(html, module.id);
  html = context.injectModuleAuditBridge(html, module.id);
  html = context.injectModuleAccessBridge(html, module.id);
  html = context.injectUniformCSS(html);
  html = context.injectMobileMode(html, module.id);
  html = context.injectSafetyNet(html);
  html = context.injectIframeShim(html);
  return html;
}

const index = fs.readFileSync(indexPath, 'utf8');
const bundle = readModuleManifestSource(repoDir);
const modules = bundle.data.modules;
const runtime = injectionRuntime(index);
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
const outputs = [];
const updatedModules = modules.map(module => {
  const outputPath = path.join(repoDir, 'www', 'modules', module.id, 'index.html');
  let html;
  if (module.html_b64) html = normalizeOffline(build(runtime.context, module));
  else {
    if (!module.src || !fs.existsSync(outputPath)) throw new Error(`external module missing: ${module.id}`);
    html = normalizeOffline(fs.readFileSync(outputPath, 'utf8'));
  }
  const bytes = Buffer.from(html, 'utf8');
  const hash = sha256(bytes);
  outputs.push({ id:module.id, path:`modules/${module.id}/index.html`, bytes:bytes.length, sha256:hash });
  golden[module.id] = { bytes:bytes.length, sha256:hash };
  if (write) { fs.mkdirSync(path.dirname(outputPath), { recursive:true }); fs.writeFileSync(outputPath, bytes); }
  const { html_b64, ...metadata } = module;
  return { ...metadata, file:`modules/${module.id}/index.html`, bytes:bytes.length, sha256:hash, src:`modules/${module.id}/index.html` };
});

const updatedManifest = { ...bundle.data, modules: updatedModules };
manifestApi.validate(updatedManifest);
golden._profile = { ...(golden._profile||{}), uiMode:'mobile', offlineAssetsOnly:true, allModulesExternal:true, injectionSourceSha256:sha256(runtime.source) };
if (write) {
  fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
  fs.writeFileSync(bundle.filePath, renderModuleManifestSource(bundle, updatedManifest), 'utf8');
}
process.stdout.write(`${JSON.stringify({ mode:write?'write':'preview', modules:outputs }, null, 2)}\n`);
