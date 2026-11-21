import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../www/modules/stock/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/stock/stock-ui.css', import.meta.url), 'utf8');

test('Stock opts into the complete Phase 6D token, tier and component foundation', () => {
  for (const asset of [
    'module-brand-tokens.css', 'module-responsive.css', 'module-components.css',
    'module-table.css', 'module-ui-runtime.js'
  ]) assert.match(html, new RegExp(`\.\./\.\./shared/${asset.replaceAll('.', '\\.')}`));
  assert.match(html, /<body[^>]*data-saagar-ui[^>]*data-saagar-width="auto"/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /href="stock-ui\.css"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /<style(?:\s|>)/, 'all page CSS must live in stock-ui.css');
});

test('exactly six main Stock tables declare the reviewed exclusive strategy', () => {
  const mappings = [...html.matchAll(/<table[^>]*data-stock-table-strategy="(cards|priority|grid)"[^>]*data-stock-table-workflow="([^"]+)"[^>]*>/g)]
    .map(match => [match[2], match[1]]);
  assert.deepEqual(mappings, [
    ['opening-counts', 'cards'],
    ['movement-reconciliation', 'grid'],
    ['closing-counts', 'cards'],
    ['daily-summary', 'priority'],
    ['monthly-summary', 'priority'],
    ['theft-log', 'cards']
  ]);
  assert.equal(mappings.filter(([, strategy]) => strategy === 'grid').length, 1);
  assert.match(html, /data-stock-table-workflow="movement-reconciliation"[^>]*data-saagar-grid-reason="movement reconciliation requires cross-column comparison"/);
});

test('summary priorities are explicit and cover all four progressive levels', () => {
  for (const workflow of ['daily-summary', 'monthly-summary']) {
    const start = html.indexOf(`data-stock-table-workflow="${workflow}"`);
    const end = html.indexOf('</table>', start);
    const table = html.slice(start, end);
    for (const priority of [1, 2, 3, 4]) assert.match(table, new RegExp(`data-saagar-priority="${priority}"`));
  }
  assert.match(html, /data-label="Variance" data-saagar-priority="1"/);
  assert.match(html, /data-label="Net Variance" data-saagar-priority="1"/);
});

test('Stock cascade scopes card conversion and sideways scrolling to reviewed strategies', () => {
  const cardBlock = css.slice(css.indexOf('REGISTER CARDS'), css.indexOf('READ-ONLY'));
  for (const selector of cardBlock.match(/^\s*[^@/][^{]+\{/gm) || []) {
    if (!selector.includes('.rtbl')) continue;
    assert.match(selector, /\.saagar-table--cards|\.saagar-table--priority/);
  }
  assert.match(css, /\[data-stock-table-region="movement-reconciliation"\]\s*\{[^}]*overflow-x:\s*auto/);
  for (const region of ['opening-counts', 'closing-counts', 'daily-summary', 'monthly-summary', 'theft-log']) {
    assert.match(css, new RegExp(`data-stock-table-region="${region}"`));
  }
  assert.match(css, /\[data-stock-table-region="opening-counts"\],[\s\S]*\[data-stock-table-region="theft-log"\]\s*\{\s*overflow-x:\s*hidden/);
  assert.match(css, /\.rtbl\.saagar-table--priority\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/);
  assert.match(html, /class="rtbl saagar-table saagar-table--grid"[^>]*data-stock-table-workflow="movement-reconciliation"/);
});

test('API-23 receives explicit non-grid layout fallbacks', () => {
  for (const selector of ['scards', 'set-grid', 'd5-grid', 'clk-triage']) {
    assert.match(css, new RegExp(`html\\.saagar-legacy-webview \\.${selector}`));
  }
  assert.match(css, /display:\s*-webkit-flex;\s*display:\s*flex/);
  assert.match(css, /-webkit-flex-wrap:\s*wrap;\s*flex-wrap:\s*wrap/);
});

test('imported timestamps are escaped before HTML rendering', () => {
  assert.match(html, /id="op-ts2-\$\{bid\(brand\)\}">\$\{esc\(o\.time\|\|''\)\}<\/div>/);
  assert.match(html, /id="cl-ts2-\$\{bid\(brand\)\}">\$\{esc\(c\.time\|\|''\)\}<\/div>/);
  assert.doesNotMatch(html, />\$\{[oc]\.time\|\|''\}<\/div>/);
  const hostile = '<img src=x onerror=alert(1)>';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  assert.equal(esc(hostile), '&lt;img src=x onerror=alert(1)&gt;');
});

test('brand DOM keys are deterministic and collision-free for punctuation variants', () => {
  const match = html.match(/function bid\(brand\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match);
  const bid = Function('brand', match[1]);
  const brands = ['AB', 'A-B', 'A B', 'A_B', "A'B", 'A🔥B'];
  const keys = brands.map(bid);
  assert.equal(new Set(keys).size, brands.length);
  assert.deepEqual(brands.map(bid), keys);
  assert.ok(keys.every(key => /^b_(?:[0-9a-f]+_)*[0-9a-f]+$/.test(key)));
  assert.match(html, /function getBrandByBid\(b\)[\s\S]*find\(br => bid\(br\) === b\)/);
});
