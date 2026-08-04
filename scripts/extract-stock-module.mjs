#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');
const outputPath = path.join(repoDir, 'www', 'modules', 'stock', 'index.html');
const goldenPath = path.join(repoDir, 'verification', 'module-build-golden-hashes.json');
const write = process.argv.includes('--write');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeOffline(html) {
  return String(html)
    .replace(/<link\b[^>]*\bhref=["']https?:\/\/[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["'][^>]*>\s*<\/script>\s*/gi, '')
    .replace(/@import\s+(?:url\()?\s*["']?https?:\/\/[^;]+;\s*/gi, '');
}

function hasRemoteAssets(html) {
  return /<link\b[^>]*\bhref=["']https?:\/\//i.test(html) ||
    /<script\b[^>]*\bsrc=["']https?:\/\//i.test(html) ||
    /@import\s+(?:url\()?\s*["']?https?:\/\//i.test(html);
}

function readBundle(index) {
  const match = index.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;(\r?\n)/);
  if (!match) throw new Error('MODULES bundle not found');
  return { match, modules: JSON.parse(match[1]) };
}

function injectionRuntime(index) {
  const start = index.indexOf('function injectModuleHideCSS(');
  const end = index.indexOf('function openModal()', start);
  if (start < 0 || end < 0) throw new Error('module injection source boundaries not found');
  const source = index.slice(start, end);
  const context = {
    EMP_MASTER_KEY: 'saagar_employee_master_v1',
    MK_CUSTOMERS: 'saagar_master_customers',
    getUiMode: () => 'mobile'
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'index-module-injections.js' });
  return { context, source };
}

function build(context, module) {
  const base = context.injectLegacyManagerPasswordGuard(
    Buffer.from(module.html_b64, 'base64').toString('utf8'),
    module.id
  );
  return context.injectIframeShim(
    context.injectSafetyNet(
      context.injectMobileMode(
        context.injectUniformCSS(
          context.injectModuleAccessBridge(
            context.injectModuleAuditBridge(
              context.injectEmployeeAssist(
                context.injectModuleHideCSS(
                  context.injectBackHome(base, module.title, module.id),
                  module.id
                ), module.id
              ), module.id
            ), module.id
          )
        ), module.id
      )
    )
  );
}

const index = fs.readFileSync(indexPath, 'utf8');
const bundle = readBundle(index);
const stock = bundle.modules.find(module => module.id === 'stock');
if (!stock) throw new Error('stock module metadata not found');
if (!stock.html_b64) {
  if (!stock.src || !fs.existsSync(outputPath)) {
    throw new Error('stock is already external but its source file is unavailable');
  }
  let external = fs.readFileSync(outputPath);
  if (write) {
    const normalized = Buffer.from(normalizeOffline(external.toString('utf8')), 'utf8');
    const updatedModules = bundle.modules.map(module => module.id === 'stock'
      ? { ...module, bytes: normalized.length, sha256: sha256(normalized) }
      : module);
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    golden.stock = { bytes: normalized.length, sha256: sha256(normalized) };
    golden._profile = { ...golden._profile, offlineAssetsOnly: true };
    fs.writeFileSync(outputPath, normalized);
    fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
    const replacement = `const MODULES = ${JSON.stringify(updatedModules)};${bundle.match[2]}`;
    const updatedIndex = index.slice(0, bundle.match.index) + replacement +
      index.slice(bundle.match.index + bundle.match[0].length);
    fs.writeFileSync(indexPath, updatedIndex, 'utf8');
    external = normalized;
  }
  const result = {
    mode: write ? 'normalize' : 'verify', src: stock.src, bytes: external.length,
    sha256: sha256(external), remoteAssets: hasRemoteAssets(external.toString('utf8')),
    metadataMatches: write || (external.length === stock.bytes && sha256(external) === stock.sha256)
  };
  if (!result.metadataMatches) throw new Error('external stock metadata mismatch');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

const runtime = injectionRuntime(index);
const golden = {};
for (const module of bundle.modules) {
  const built = build(runtime.context, module);
  golden[module.id] = { bytes: Buffer.byteLength(built), sha256: sha256(built) };
}
golden._profile = {
  uiMode: 'mobile', offlineAssetsOnly: true,
  injectionSourceSha256: sha256(runtime.source)
};

const builtStock = normalizeOffline(build(runtime.context, stock));
const stockBytes = Buffer.from(builtStock, 'utf8');
const updatedModules = bundle.modules.map(module => {
  if (module.id !== 'stock') return module;
  const { html_b64, ...metadata } = module;
  return {
    ...metadata,
    file: 'modules/stock/index.html',
    src: 'modules/stock/index.html',
    bytes: stockBytes.length,
    sha256: sha256(stockBytes)
  };
});

if (write) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stockBytes);
  fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
  const replacement = `const MODULES = ${JSON.stringify(updatedModules)};${bundle.match[2]}`;
  const updatedIndex = index.slice(0, bundle.match.index) + replacement +
    index.slice(bundle.match.index + bundle.match[0].length);
  fs.writeFileSync(indexPath, updatedIndex, 'utf8');
}

process.stdout.write(`${JSON.stringify({
  mode: write ? 'write' : 'preview',
  output: path.relative(repoDir, outputPath).replaceAll('\\', '/'),
  bytes: stockBytes.length,
  sha256: sha256(stockBytes),
  injectionSourceSha256: golden._profile.injectionSourceSha256
}, null, 2)}\n`);
