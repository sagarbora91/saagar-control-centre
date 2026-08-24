import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../www/modules/cro_audit/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/cro_audit/cro-audit-ui.css', import.meta.url), 'utf8');

test('CRO Audit opts into the frozen UI foundation and extracted module cascade', () => {
  const assets = [
    '../../shared/module-brand-tokens.css',
    '../../shared/module-responsive.css',
    '../../shared/module-components.css',
    '../../shared/module-table.css',
    '../../shared/module-ui-runtime.js',
    'cro-audit-ui.css'
  ];
  for (const asset of assets) assert.match(html, new RegExp(asset.replace(/[./-]/g, '\\$&')));
  assert.match(html, /<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.doesNotMatch(html, /<style>\s*\/\* ── compatibility aliases/);
  assert.ok(css.length > 20_000, 'the complete CRO Audit cascade must remain in its extracted asset');
});

test('CRO Audit has no live browsing table; its generated print comparison is explicit', () => {
  const withoutScripts = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(withoutScripts, /<table\b/i);
  assert.equal((html.match(/<table\b/g) || []).length, 1);
  assert.match(html, /<table class="stp-table" data-saagar-table-strategy="grid" data-saagar-table-workflow="print-comparison" data-saagar-grid-reason="printed audit review requires task detail and score comparison">/);
  assert.match(html, /function printAudit\(id\)/);
});

test('CRO Audit supplies explicit API-23 flex fallbacks without redefining shared APIs', () => {
  for (const selector of ['rgroup', 'sc-grid', 'kpi-strip', 'stat-grid']) {
    assert.match(css, new RegExp(`html\\.saagar-legacy-webview \\.${selector}`));
  }
  assert.match(css, /display:-webkit-flex;\s*display:flex;/);
  assert.match(css, /-webkit-flex-wrap:wrap;\s*flex-wrap:wrap;/);
  assert.doesNotMatch(css, /SaagarUiFoundation|SaagarRenderedComponents|createAuditedControl/);
});

test('CRO Audit scoring and persistence core remains byte-stable', () => {
  const names = ['getS', 'saveSettings', 'calcNps', 'submitAudit', 'getAudits'];
  const core = names.map(name => {
    const start = html.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing CRO Audit function: ${name}`);
    const end = html.indexOf('\nfunction ', start + 10);
    return html.slice(start, end);
  }).join('\n');
  assert.equal(core.length, 5_482);
  assert.equal(
    crypto.createHash('sha256').update(core).digest('hex'),
    '953f38be70b26acbfe43f7b807fbede98b2b1007c4ee4ce48e949911ee4d5a37'
  );
});

test('persisted and user-derived generated actions use encoded delegated arguments', () => {
  for (const action of ['ask-for-review', 'edit-audit-record', 'print-audit-record', 'delete-audit-record']) {
    assert.match(html, new RegExp(`data-action="${action}" data-saagar-args="\\$\\{croArgs\\(`));
    assert.doesNotMatch(html, new RegExp(`data-action="${action}"[^>]*onclick=`));
  }
  for (const action of ['ask-for-review', 'edit-audit-record', 'print-audit-record', 'delete-audit-record']) {
    assert.match(html, new RegExp(`'${action}':\\{handler:'[^']+',args:1,delegated:true\\}`));
  }
  assert.match(html, /function croArgs\(value\)\{ return SaagarRenderedComponents\.encodeArgs\(\[value\]\); \}/);
  assert.match(html, /SaagarRenderedComponents\.observe\(document\.body,CroAuditRenderedPolicy\)/);
  assert.match(html, /SaagarRenderedComponents\.connect\(document\.body,CroAuditRenderedPolicy,CroAuditDelegatedHandlers\)/);
});
