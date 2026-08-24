import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../www/modules/service/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/service/service-ui.css', import.meta.url), 'utf8');

test('Service opts into the frozen shared UI foundation and extracted cascade', () => {
  for (const asset of [
    'module-brand-tokens.css', 'module-responsive.css', 'module-components.css',
    'module-table.css', 'module-ui-runtime.js'
  ]) assert.ok(html.includes(`../../shared/${asset}`), `missing ${asset}`);
  assert.match(html, /<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /href="service-ui\.css"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /<style(?:\s|>)/, 'module CSS must be extracted');
  assert.doesNotMatch(css, /--navy:\s*#0d2340|--radius:\s*10px/, 'frozen shared tokens must own brand values');
});

test('both static Service tables carry one reviewed exclusive strategy', () => {
  const tables = [...html.matchAll(/<table\b[^>]*>/g)]
    .map(match => match[0])
    .filter(tag => /cond-table|est-table/.test(tag));
  assert.equal(tables.length, 2);
  assert.match(tables[0], /class="cond-table saagar-table saagar-table--cards"/);
  assert.match(tables[0], /data-service-table-strategy="cards"/);
  assert.match(tables[0], /data-service-table-workflow="condition-report"/);
  assert.match(tables[1], /class="est-table saagar-table saagar-table--grid"/);
  assert.match(tables[1], /data-service-table-strategy="grid"/);
  assert.match(tables[1], /data-service-table-workflow="service-estimate"/);
  assert.match(tables[1], /data-saagar-grid-reason="quantity unit price and authorized total require cross-column comparison"/);
});

test('mobile table overflow is confined to the justified estimate ledger', () => {
  assert.match(css, /\[data-saagar-ui\] \.tbl-scroll \{ overflow-x: hidden;/);
  assert.match(css, /\[data-saagar-ui\] \.saagar-table-region--grid \{ overflow-x: auto;/);
  assert.match(css, /data-service-table-region="condition-report"[\s\S]*\.cond-table thead \{ display: none;/);
  assert.match(css, /\.cond-table td:nth-child\(4\)::before \{ content: "Notes"; \}/);
  assert.equal((html.match(/saagar-table-region--grid/g) || []).length, 1);
});

test('Service provides explicit API-23 fallbacks for modern layouts', () => {
  for (const selector of ['stats-grid', 'grid-2', 'grid-3', 'grid-4', 'check-columns', 'd3-board', 'd3-ex-list', 'deno-body']) {
    assert.ok(css.includes(selector), `missing fallback coverage for ${selector}`);
  }
  assert.match(css, /display: -webkit-flex; display: flex; -webkit-flex-wrap: wrap; flex-wrap: wrap;/);
  assert.match(css, /html\.saagar-legacy-webview \.d3-board,[\s\S]*display: block;/);
  assert.doesNotMatch(css, /SaagarUiFoundation|createAuditedControl|SaagarTableFoundation/);
});

test('Service business, persistence, action and evidence source remains byte-stable', () => {
  const applicationScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(source => source.length > 1_000)
    .join('\n');
  assert.equal(applicationScripts.length, 123_385);
  assert.equal(crypto.createHash('sha256').update(applicationScripts).digest('hex'), '3353bc332f581fc00ab38e909652883b1f8ea18acafb2e2c893f92a0cacae265');
  for (const identity of [
    "const STORE_KEY = 'saagar_wsf_v2'", 'function saveDB()', 'function doSave()',
    'function closeCase()', 'function delCase(', 'function svcD3RenderWorkboard(',
    'function watchKey(id)', 'function watchKeyAfter(id)', 'function compressWatchImage(',
    'function persistWatchPhoto(id)', 'function loadWatchPhoto(id)', 'function svcEv()'
  ]) assert.ok(applicationScripts.includes(identity), `missing preserved Service identity: ${identity}`);
  assert.match(applicationScripts, /return 'wsf\|' \+ \(id \|\| g\('f-ono'\) \|\| 'DRAFT'\);/);
  assert.match(applicationScripts, /\+ '\|after';/);
  assert.match(applicationScripts, /api\.delByKey\|\|api\.delByMatch/);
  assert.match(applicationScripts, /persistWatchPhoto\(editId \|\| id\)/);
});

test('D3 Service workboard and custody integration contracts remain wired', () => {
  for (const identity of ['serviceWorkboardPolicy', 'servicePersistence', 'svcD3PolicyApi', 'svcD3PersistenceApi']) {
    assert.ok(html.includes(identity), `missing D3 Service contract: ${identity}`);
  }
  assert.match(html, /moduleId:'service'[\s\S]*accessContext:true/);
  assert.match(html, /customerSelectors:\['#f-cn','#f-an','#f-dcs'\]/);
});
