import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveCssVariables, transformJavaScriptAsset } from '../scripts/prepare-api23-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = require(path.join(root, 'www', 'module-manifest.js'));
const moduleFiles = manifest.modules.map(module => path.join(root, 'www', module.file));

test('governed shell and module viewports permit user scaling', () => {
  const htmlFiles = [path.join(root, 'www', 'index.html'), ...moduleFiles];
  for (const file of htmlFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /user-scalable\s*=\s*no/i, file);
    assert.doesNotMatch(source, /maximum-scale\s*=\s*1(?:\.0)?/i, file);
  }
});

test('all Phase 6D shared assets are pinned and adoption remains Stock-only', () => {
  const ids = ['module-brand-tokens-css','module-responsive-css','module-ui-runtime','module-table-css','module-table-runtime','module-components-css'];
  for (const id of ids) {
    const asset = manifest.getShared(id);
    assert.ok(asset, id);
    const bytes = fs.readFileSync(path.join(root, 'www', asset.file));
    assert.equal(asset.bytes, bytes.length, id);
    assert.equal(asset.sha256, crypto.createHash('sha256').update(bytes).digest('hex'), id);
  }
  for (const file of moduleFiles) {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith(path.join('stock', 'index.html'))) {
      assert.match(source, /module-responsive\.css/);
      assert.match(source, /module-table\.css/);
      assert.match(source, /module-components\.css/);
      continue;
    }
    assert.doesNotMatch(source, /module-(?:responsive|ui-runtime|table|table-runtime|components)\.(?:css|js)/, file);
  }
});

test('Phase 6D JavaScript and governed CSS have API-23 generated paths', () => {
  for (const name of ['module-ui-runtime.js','module-table-runtime.js']) {
    const source = fs.readFileSync(path.join(root, 'www', 'shared', name), 'utf8');
    const generated = transformJavaScriptAsset(source, name, `shared/${name}`);
    assert.doesNotMatch(generated, /=>|\b(?:const|let)\b/, name);
  }
  const variables = new Map();
  const tokenSource = fs.readFileSync(path.join(root, 'www/shared/module-brand-tokens.css'), 'utf8');
  for (const match of tokenSource.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g)) variables.set(match[1], match[2].trim());
  for (const name of ['module-responsive.css','module-table.css','module-components.css']) {
    const source = fs.readFileSync(path.join(root, 'www', 'shared', name), 'utf8');
    const resolved = resolveCssVariables(source, variables);
    assert.doesNotMatch(resolved, /var\(\s*--(?:space|type|control|touch|toolbar|nav|card|sheet|modal|grid|focus|shadow|z)-/, name);
  }
});

test('ETP stays at its shell-owned authorization boundary and Phase 6C exclusion bytes', () => {
  const source = fs.readFileSync(path.join(root, 'www/modules/etp/index.html'), 'utf8');
  const bytes = Buffer.from(source);
  assert.equal(bytes.length, 34473);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12');
  assert.match(source, /accessContext:false/);
  assert.doesNotMatch(source, /module-mobile-legacy\.css|module-(?:responsive|ui-runtime|table|table-runtime|components)\.(?:css|js)/);
});
