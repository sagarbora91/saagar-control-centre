import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const renderedApi = require('../www/shared/module-rendered-components.js');
const html = fs.readFileSync(new URL('../www/modules/tax/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/tax/tax-ui.css', import.meta.url), 'utf8');

function applicationSource(source) {
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(script => script.length > 1_000).join('\n');
}

test('Tax adopts the frozen responsive, rendered and table foundations', () => {
  for (const asset of ['module-brand-tokens.css','module-responsive.css','module-components.css','module-table.css','module-ui-runtime.js','module-table-runtime.js','module-rendered-components.js'])
    assert.ok(html.includes(`../../shared/${asset}`), `missing ${asset}`);
  assert.match(html, /<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /href="tax-ui\.css"/);
  assert.doesNotMatch(html, /<style>/);
});

test('the only Tax table is an explicit external print workflow grid', () => {
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.match(html, /<table class="stp-table saagar-table saagar-table--grid" data-saagar-table-strategy="grid" data-saagar-table-workflow="compliance-print" data-saagar-grid-reason="six compliance fields require cross-column comparison">/);
  assert.match(html, /print table is generated for[\s\S]*outside document\.body/);
  assert.match(html, /'compliance-print':\{strategy:'grid',reason:'six compliance fields require cross-column comparison'\}/);
});

test('Tax rendered policy and delegated handlers are immutable and observed', () => {
  assert.match(html, /const TaxRenderedPolicy = SaagarRenderedComponents\.createPolicy\(Object\.freeze\(\{/);
  assert.match(html, /const TaxDelegatedHandlers = Object\.freeze\(\{/);
  assert.match(html, /SaagarRenderedComponents\.observe\(document\.body,TaxRenderedPolicy\)/);
  assert.match(html, /SaagarRenderedComponents\.connect\(document\.body,TaxRenderedPolicy,TaxDelegatedHandlers\)/);
  assert.equal(Object.isFrozen(renderedApi), true);
});

test('persisted and user-derived generated button arguments use encodeArgs delegation', () => {
  for (const action of ['editfirm','deletefirm','editcustomobligation','deletecustomobligation','togglearchive','action-center-open-item','evview','evdelete','show-compliance-month','completion-toggle','donebuttonclass','togglena','togglenote','confirmdone','canceldone']) {
    assert.match(html, new RegExp(`data-action="${action}"[^>]*data-saagar-args=`), `missing delegated arguments for ${action}`);
  }
  assert.match(html, /function taxArgs\(values\)\{ return SaagarRenderedComponents\.encodeArgs\(values\); \}/);
  assert.doesNotMatch(html, /<button[^>]*data-action="(?:editfirm|deletefirm|editcustomobligation|deletecustomobligation|togglearchive|action-center-open-item|evview|evdelete|show-compliance-month|completion-toggle|donebuttonclass|togglena|togglenote|confirmdone|canceldone)"[^>]*onclick=/);
});

test('intentional Tax presentation escaping and FY rendering remain intact', () => {
  const source = applicationSource(html);
  assert.doesNotThrow(() => Function(source));
  for (const identity of ['function renderFYText(text)','function stEsc(s)','function attrJsStr(s)','function saveState()','function materializeDueDates()','function computeEvidenceCompleteness(','function getTaxPayableFeed()'])
    assert.ok(source.includes(identity), `missing preserved identity: ${identity}`);
  assert.equal(source.length, 170_677);
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), 'c14aa2555d56b3aca5e9338ba126902f1d1db49f6e95f049cea47dc3d1a2e5ef');
});

test('Tax has explicit API-23 flex fallbacks for every migrated layout family', () => {
  for (const selector of ['firm-grid','mf-grid','dash-grid-2','cos-grid','owner-grid','ng']) assert.ok(css.includes(selector));
  assert.match(css, /display: -webkit-flex; display: flex;/);
  assert.match(css, /-webkit-flex-wrap: wrap; flex-wrap: wrap;/);
});
