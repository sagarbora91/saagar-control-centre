import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const stockPath = path.join(root, 'www/modules/stock/index.html');
const stock = fs.readFileSync(stockPath, 'utf8');
const stockCss = fs.readFileSync(path.join(root, 'www/modules/stock/stock-ui.css'), 'utf8');
const tableCss = fs.readFileSync(path.join(root, 'www/shared/module-table.css'), 'utf8');
const pipeline = fs.readFileSync(path.join(root, 'scripts/prepare-api23-assets.mjs'), 'utf8');

function adoptedTables(html) {
  return [...html.matchAll(/<table\b[^>]*\bdata-stock-table-strategy="([^"]+)"[^>]*\bdata-stock-table-workflow="([^"]+)"[^>]*>/g)]
    .map(match => ({ strategy: match[1], workflow: match[2], tag: match[0] }));
}

function ruleFor(selector) {
  const rule = [...stockCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find(match => match[1].includes(selector));
  assert.ok(rule, `missing CSS rule for ${selector}`);
  return rule[2];
}

test('Stock declares one reviewed strategy for each of its six workflow tables', () => {
  const tables = adoptedTables(stock);
  assert.equal(tables.length, 6);
  assert.deepEqual(tables.map(({ workflow, strategy }) => [workflow, strategy]), [
    ['opening-counts', 'cards'],
    ['movement-reconciliation', 'grid'],
    ['closing-counts', 'cards'],
    ['daily-summary', 'priority'],
    ['monthly-summary', 'priority'],
    ['theft-log', 'cards']
  ]);
  for (const { strategy, tag } of tables) {
    assert.match(tag, new RegExp(`\\bsaagar-table--${strategy}\\b`));
    assert.match(tag, /\bsaagar-table\b/);
  }
  assert.equal(tables.filter(({ strategy }) => strategy === 'grid').length, 1);
  assert.match(tables.find(({ strategy }) => strategy === 'grid').tag, /data-saagar-grid-reason="[^"]*reconcil[^"]*"/i);
});

test('mobile data entry reflows as cards and only reconciliation owns sideways scrolling', () => {
  assert.match(stock, /data-stock-table-region="opening-counts"/);
  assert.match(stock, /data-stock-table-region="closing-counts"/);
  assert.match(stock, /data-stock-table-region="theft-log"/);
  assert.match(tableCss, /saagar-table--cards[\s\S]*display:block/);
  assert.match(tableCss, /saagar-table--cards td[\s\S]*display:-webkit-flex;\s*display:flex/);
  for (const workflow of ['opening-counts', 'closing-counts', 'daily-summary', 'monthly-summary', 'theft-log']) {
    assert.match(ruleFor(`[data-stock-table-region="${workflow}"]`), /overflow-x:\s*hidden/);
  }
  assert.match(stock, /class="tbl-wrap saagar-table-region--grid" data-stock-table-region="movement-reconciliation"/);
  assert.match(tableCss, /saagar-table-region--grid[\s\S]*overflow-x:auto[\s\S]*-webkit-overflow-scrolling:touch/);
});

test('reconciliation grid remains mobile-usable and desktop-dense without a sticky-only dependency', () => {
  assert.match(tableCss, /saagar-table--grid[^{]*\{[^}]*min-width:720px/);
  assert.match(tableCss, /@supports \(position:sticky\)[\s\S]*data-saagar-grid-key/);
  assert.match(tableCss, /@media print[\s\S]*saagar-table-region--grid\{overflow:visible;\}[\s\S]*saagar-table--grid\{min-width:0;white-space:normal;\}/);
  assert.match(stockCss, /\.rtbl\s*\{[^}]*font-size:\s*12px/);
  assert.match(stockCss, /font-variant-numeric:\s*tabular-nums/);
});

test('Stock keeps user scaling and adopts all Phase 6D source foundations explicitly', () => {
  assert.match(stock, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
  assert.doesNotMatch(stock, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  for (const asset of ['module-brand-tokens.css', 'module-responsive.css', 'module-components.css', 'module-table.css', 'module-ui-runtime.js']) {
    assert.match(stock, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(stock, /<body[^>]*data-saagar-ui[^>]*data-saagar-width="auto"/);
});

test('API-23 preparation resolves Stock CSS variables and Stock supplies non-grid fallbacks', () => {
  assert.match(pipeline, /if \(ext === '\.css'\)[\s\S]*resolveCssVariables/);
  assert.match(pipeline, /manifest\.sharedAssets/);
  for (const selector of ['.scards', '.set-grid', '.d5-grid', '.clk-triage']) {
    const fallback = ruleFor(`html.saagar-legacy-webview ${selector}`);
    assert.match(fallback, /display:\s*-webkit-flex;\s*display:\s*flex|display:\s*block/);
  }
  assert.match(tableCss, /display:-webkit-flex;\s*display:flex/);
  assert.doesNotMatch(tableCss, /display\s*:\s*grid|:has\(|:is\(|:where\(/);
});

test('current adoption remains bounded to Stock plus Family A', () => {
  const moduleRoot = path.join(root, 'www/modules');
  const adopted = new Set(['stock', 'payroll', 'grooming', 'service']);
  for (const entry of fs.readdirSync(moduleRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(moduleRoot, entry.name, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    if (adopted.has(entry.name)) {
      assert.match(html, /module-responsive\.css/);
      assert.match(html, /module-components\.css/);
      assert.match(html, /module-table\.css/);
      assert.match(html, /module-ui-runtime\.js/);
      assert.match(html, /data-saagar-ui/);
      continue;
    }
    assert.doesNotMatch(html, /module-(?:responsive|components|table)\.css|module-ui-runtime\.js|data-saagar-ui|saagar-table--/, entry.name);
  }
});
