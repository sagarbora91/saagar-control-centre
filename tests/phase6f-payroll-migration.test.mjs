import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../www/modules/payroll/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/payroll/payroll-ui.css', import.meta.url), 'utf8');

test('Payroll opts into the frozen shared UI foundation and extracted module cascade', () => {
  const assets = [
    '../../shared/module-brand-tokens.css',
    '../../shared/module-responsive.css',
    '../../shared/module-components.css',
    '../../shared/module-table.css',
    '../../shared/module-ui-runtime.js',
    'payroll-ui.css'
  ];
  for (const asset of assets) assert.match(html, new RegExp(asset.replace(/[./-]/g, '\\$&')));
  assert.match(html, /<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.doesNotMatch(html, /<style>\s*\/\* ── SHARED DESIGN-SYSTEM TOKENS/);
  assert.ok(css.length > 45_000, 'the complete Payroll cascade must remain in its extracted asset');
});

test('all seven static Payroll tables carry an explicit reviewed strategy', () => {
  const expected = new Map([
    ['att-table', 'cards'],
    ['gm-table', 'cards'],
    ['ms-table', 'cards'],
    ['adv-table', 'grid'],
    ['ap-table', 'grid'],
    ['rp-table', 'grid'],
    ['slipTbl', 'cards']
  ]);
  for (const [id, strategy] of expected) {
    const tag = html.match(new RegExp(`<table[^>]*\\bid="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `missing static table ${id}`);
    assert.match(tag, new RegExp(`data-payroll-table-strategy="${strategy}"`));
    assert.match(tag, new RegExp(`saagar-table--${strategy}`));
  }
  assert.equal((html.match(/data-payroll-table-strategy=/g) || []).length, expected.size);
});

test('sideways scrolling is confined to justified comparison ledgers', () => {
  const reasons = [...html.matchAll(/data-saagar-grid-reason="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(reasons, [
    'voucher recovery requires cross-column comparison',
    'payrun approval requires gross-to-net comparison',
    'statutory payroll reporting requires cross-column comparison'
  ]);
  assert.equal((html.match(/saagar-table-region--grid/g) || []).length, 3);
  assert.match(css, /@media\(max-width:899px\)\{[\s\S]*\[data-saagar-ui\] \.table-scroll\{overflow-x:hidden;\}/);
  assert.match(css, /\.saagar-table-region--grid > \.table-scroll\{overflow-x:auto;\}/);
  assert.match(css, /#pane-slips \.stbl-wrap\{overflow-x:hidden;\}/);
});

test('Payroll compact tablet reflow ends before the desktop contract begins', () => {
  assert.match(css, /MOBILE \/ COMPACT RESPONSIVE LAYER\s+\(≤899px\)[\s\S]*?@media \(max-width:899px\)\{/);
  assert.equal((css.match(/@media \(max-width:899px\)\{/g) || []).length, 3);
  assert.match(css, /@media\(max-width:899px\)\{[\s\S]*?\.saagar-table--cards\{min-width:0!important;white-space:normal;\}/);
  assert.doesNotMatch(css, /@media\s*\(min-width:\s*900px\)/, 'desktop styles stay on the original base cascade');
});

test('Payroll supplies explicit API-23 flex fallbacks without redefining shared APIs', () => {
  for (const selector of ['grid', 'controls', 'summary', 'hero', 'sheet-actions', 'stiles']) {
    assert.match(css, new RegExp(`html\\.saagar-legacy-webview \\.${selector}`));
  }
  assert.match(css, /display:-webkit-flex;\s*display:flex;/);
  assert.match(css, /-webkit-flex-wrap:wrap;\s*flex-wrap:wrap;/);
  assert.doesNotMatch(css, /SaagarUiFoundation|createAuditedControl|SaagarTableFoundation/);
});

test('Payroll calculation, persistence and action source remains byte-stable', () => {
  const applicationScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(source => source.length > 1_000)
    .join('\n');
  assert.equal(applicationScripts.length, 161_183);
  assert.equal(
    crypto.createHash('sha256').update(applicationScripts).digest('hex'),
    'dd1a5ef80d46bbaebf8e1bff03a2ebfedeea2d9f4e56cd9f5538a535d440c9d6'
  );
  for (const invariant of ['function calcGM', 'function save', 'function lockRun', 'payroll_suite_v1_2026']) {
    assert.ok(applicationScripts.includes(invariant), `missing Payroll invariant: ${invariant}`);
  }
});
