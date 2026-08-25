import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../www/modules/grooming/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/grooming/grooming-ui.css', import.meta.url), 'utf8');

test('Grooming opts into the complete frozen Phase 6D UI foundation', () => {
  for (const asset of [
    'module-brand-tokens.css', 'module-responsive.css', 'module-components.css',
    'module-table.css', 'module-ui-runtime.js'
  ]) assert.ok(html.includes(`../../shared/${asset}`), `missing ${asset}`);
  assert.match(html, /<body[^>]*data-saagar-ui[^>]*data-saagar-width="auto"[^>]*data-saagar-width-resolved="mobile"/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /href="grooming-ui\.css"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /<style(?:\s|>)/, 'module CSS must be extracted');
  assert.doesNotMatch(css, /--navy:\s*#0d2340|--radius:\s*10px/, 'shared foundation owns frozen brand tokens');
});

test('the only static Grooming table has one reviewed grid strategy', () => {
  const tables = [...html.matchAll(/<table\b[^>]*>/g)].map(match => match[0]);
  assert.equal(tables.length, 1);
  assert.match(tables[0], /class="mt saagar-table saagar-table--grid"/);
  assert.match(tables[0], /data-grooming-table-strategy="grid"/);
  assert.match(tables[0], /data-grooming-table-workflow="month-end-comparison"/);
  assert.match(tables[0], /data-saagar-grid-reason="nine-column month-end CRO comparison requires cross-column review"/);
  assert.match(html, /month-table-wrap saagar-table-region--grid/);
});

test('horizontal scrolling is confined to navigation and the justified report grid', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((rules.match(/overflow-x:\s*auto/g) || []).length, 2);
  assert.match(rules, /\.tabs\{[^}]*overflow-x:auto/);
  assert.match(rules, /\.month-table-wrap\{overflow-x:auto/);
  assert.match(rules, /\.mt\{min-width:700px;\}/);
  assert.doesNotMatch(rules, /\.card\s*\{[^}]*overflow-x:\s*auto/);
});

test('API-23 receives explicit flex and block fallbacks for modern layouts', () => {
  for (const selector of ['statgrid', 'frow', 'filter-bar', 'clbar', 'cro-header', 'fg', 'month-table-wrap']) {
    assert.match(css, new RegExp(`html\\.saagar-legacy-webview \\.${selector}`));
  }
  assert.match(css, /display:\s*-webkit-flex;display:\s*flex/);
  assert.match(css, /-webkit-flex-wrap:\s*wrap;flex-wrap:\s*wrap/);
  assert.match(css, /html\.saagar-legacy-webview \.month-table-wrap\{display:block;\}/);
});

test('migration retains storage, access and viewed-date control identities', () => {
  assert.match(html, /id="st-v5-iframe-shim">SaagarModuleRuntime\.run\('storage'/);
  assert.match(html, /moduleId:'grooming',nextSteps:\[\{id:'qms',label:'Open Queue →'\}\],customerSelectors:\[\],accessContext:false/);
  assert.match(html, /const STORE = 'saagar_grooming_';/);
  assert.match(html, /function saveRecord\(record\)/);
  assert.match(html, /function deleteRecord\(dateStr, idx\)/);
  assert.match(html, /function clearDayData\(dateStr\)/);
  assert.match(html, /window\.addEventListener\('st-date'/);
  assert.match(html, /if \(isPastView\(\)\) return;/);
});

test('migration retains checklist scoring, export and action identities', () => {
  for (const identity of [
    'startCL', 'saveCRO', 'renderDaily', 'renderMonthly', 'exportCSV',
    'delDay', 'clearDay', 'applyReadOnly'
  ]) assert.match(html, new RegExp(`function ${identity}\\(`));
  assert.match(html, /const pct = total \? Math\.round\(checked\/total\*100\) : 0;/);
  assert.match(html, /data-action="export-csv"/);
  assert.match(html, /data-action="delete-day-record"/);
  assert.match(html, /data-action="recheck-record"/);
  assert.match(html, /data-action="start-pending-check"/);
  assert.match(html, /type:'ST_SHARE'/);
});
