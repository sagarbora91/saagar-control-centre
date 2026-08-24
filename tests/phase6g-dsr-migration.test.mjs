import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const renderedApi = require('../www/shared/module-rendered-components.js');
const html = fs.readFileSync(new URL('../www/modules/dsr/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/dsr/dsr-ui.css', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const application = scripts.reduce((longest, source) => source.length > longest.length ? source : longest, '');

test('DSR adopts the frozen shared UI, table and rendered-component foundations', () => {
  for (const asset of ['module-brand-tokens.css','module-responsive.css','module-components.css','module-table.css','module-ui-runtime.js','module-table-runtime.js','module-rendered-components.js']) {
    assert.match(html, new RegExp(`../../shared/${asset.replaceAll('.', '\\.')}`));
  }
  assert.match(html, /<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /SaagarRenderedComponents\.observe\(document\.body,DsrRenderedPolicy\)/);
  assert.match(html, /href="dsr-ui\.css"/);
  assert.doesNotMatch(html, /<style>\s*\/\* ─+/);
});

test('generated DSR report tables carry their reviewed strategy and accessible label', () => {
  assert.match(html, /class="var-tbl saagar-table saagar-table--grid" aria-label="Stock variance" data-saagar-table-strategy="grid" data-saagar-table-workflow="stock-variance" data-saagar-grid-reason="opening closing and variance values require cross-column comparison"/);
  assert.match(html, /class="ptbl saagar-table saagar-table--cards" aria-label="Staff performance" data-saagar-table-strategy="cards" data-saagar-table-workflow="staff-rollup"/);
  assert.match(html, /'stock-variance':\{strategy:'grid',reason:'opening closing and variance values require cross-column comparison'\}/);
  assert.match(html, /'staff-rollup':\{strategy:'cards'\}/);
  assert.match(css, /\.saagar-table-region--grid \{ overflow-x: auto;/);
});

test('persisted and user-derived rendered arguments use delegated bounded encoding', () => {
  for (const action of ['stwalink','markfollowedup','visitorpurchase','visitornonpurch','adjmkt','savesale','savenp']) {
    assert.match(html, new RegExp(`'${action}':\\{handler:'[^']+',args:[12],delegated:true\\}`));
  }
  for (const expression of ["['https://wa.me/91'+f.m10+'?text='+enc]",'[f.date,f.ref]','[sref]','[m.id,-1]','[m.id,1]','[idx]']) {
    assert.ok(html.includes(`SaagarRenderedComponents.encodeArgs(${expression})`), `missing encoded arguments ${expression}`);
  }
  assert.doesNotMatch(html, /onclick="(?:stWaLink|markFollowedUp|visitorPurchase|visitorNonPurch|adjMkt|saveSale|saveNP)\(/);
  assert.match(html, /SaagarRenderedComponents\.connect\(document\.body, DsrRenderedPolicy, DsrDelegatedHandlers\)/);
  assert.equal(Object.isFrozen(renderedApi), true);
});

test('every generated DSR button action is covered by the immutable policy', () => {
  const policySource = html.match(/<script id="phase6g-dsr-render-policy">([\s\S]*?)<\/script>/)?.[1] || '';
  const actions = new Set([...html.matchAll(/<button\b[^>]*data-action=[\\]?['"]([a-z][a-z0-9-]*)/g)].map(match => match[1]));
  assert.ok(actions.size >= 40, 'expected the complete static and rendered DSR control surface');
  for (const action of actions) assert.ok(policySource.includes(`'${action}':`), `policy omits ${action}`);
});

test('DSR supplies explicit Android API-23 flex and table fallbacks', () => {
  for (const selector of ['role-switch','fgrid2','sgrid','mkt-grid','score-grid','audit-ar-grid','dash-kpi-grid']) {
    assert.ok(css.includes(`html.saagar-legacy-webview .${selector}`), `missing ${selector} fallback`);
  }
  assert.match(css, /display: -webkit-flex;\s*display: flex;/);
  assert.match(css, /-webkit-flex-wrap: wrap;\s*flex-wrap: wrap;/);
  assert.match(css, /\.saagar-table-region--grid \.var-tbl \{ min-width: 520px;/);
});

test('D4 close-day, QMS merge, persistence and audit-unlock identities remain present', () => {
  for (const identity of [
    "const SK_DSR   = 'saagar_dsr_'", 'function _mergeBridgeRows(', 'function saveRec(',
    'function flushRec(', 'function dsrD4Summary(', 'function getMissingForSubmit(',
    'function submitDay(', 'function unlockForCorrection(', 'function submitAudit(',
    "api.completionSummary(rec, dsrD4Context())", "api.missingForSubmit(rec, dsrD4Context())"
  ]) assert.ok(application.includes(identity), `missing preserved DSR identity: ${identity}`);
  assert.equal(application.length, 118_337);
  assert.equal(crypto.createHash('sha256').update(application).digest('hex'), '41d0652eeb8ff0183e85264845e2831c00c5a20452b14ef164c6d6887da5aace');
});
