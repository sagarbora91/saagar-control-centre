import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadModuleBundle } from './lib/module-bundle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');
const index = fs.readFileSync(path.join(repoDir, 'www', 'index.html'), 'utf8');
const stockPath = path.join(repoDir, 'www', 'modules', 'stock', 'index.html');
const stock = fs.readFileSync(stockPath);
const modules = loadModuleBundle();
const metadata = modules.find(module => module.id === 'stock');

test('D5-M1 externalizes only Stock with byte-verified metadata', () => {
  assert.equal(modules.length, 11);
  assert.ok(metadata);
  assert.equal(metadata.src, 'modules/stock/index.html');
  assert.equal(metadata.html_b64, undefined);
  assert.equal(metadata.bytes, stock.length);
  assert.equal(metadata.sha256, crypto.createHash('sha256').update(stock).digest('hex'));
  assert.equal(modules.filter(module => module.id !== 'stock' && module.html_b64).length, 10);
});

test('D5-M1 shell uses a relative iframe src only for external modules', () => {
  assert.match(index, /if\(mod\.src\)\{/);
  assert.match(index, /__f\.src = mod\.src/);
  assert.match(index, /else\{[\s\S]*?__f\.srcdoc = buildModuleSrc\(mod\)/);
  assert.doesNotMatch(metadata.src, /^(?:[a-z]+:)?\/\//i);
});

test('D5-M1 golden profile covers every module and pins injection drift', () => {
  const golden = JSON.parse(fs.readFileSync(
    path.join(repoDir, 'verification', 'module-build-golden-hashes.json'), 'utf8'
  ));
  assert.equal(golden._profile.uiMode, 'mobile');
  assert.equal(golden._profile.offlineAssetsOnly, true);
  assert.match(golden._profile.injectionSourceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    Object.keys(golden).filter(key => !key.startsWith('_')).sort(),
    modules.map(module => module.id).sort()
  );
  assert.equal(golden.stock.bytes, stock.length);
  assert.equal(golden.stock.sha256, metadata.sha256);
});

test('extracted Stock contains no remote asset reference', () => {
  const html = stock.toString('utf8');
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=["']https?:\/\//i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["']https?:\/\//i);
  assert.doesNotMatch(html, /@import\s+(?:url\()?\s*["']?https?:\/\//i);
});

test('extracted Stock contains the complete current shell injection chain', () => {
  const html = stock.toString('utf8');
  [
    'st-v5-iframe-shim', 'st-v5-safety-net', 'st-v5-mobile-css',
    'st-v5-module-access-bridge', 'st-v5-module-audit-bridge',
    'st-v5-emp-assist-script', 'st-v5-hide-css', 'st-v5-home-fab'
  ].forEach(marker => {
    const tag = `id="${marker}"`;
    assert.equal((html.match(new RegExp(tag, 'g')) || []).length, 1, marker);
  });
});
