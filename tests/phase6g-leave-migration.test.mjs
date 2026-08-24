import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const renderedApi = require('../www/shared/module-rendered-components.js');

const html = fs.readFileSync(new URL('../www/modules/leave/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../www/modules/leave/leave-ui.css', import.meta.url), 'utf8');

function applicationSource(source) {
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(script => script.length > 1_000)
    .join('\n');
}

test('Leave opts into the frozen shared UI foundation and extracted cascade', () => {
  for (const asset of [
    'module-brand-tokens.css', 'module-responsive.css', 'module-components.css',
    'module-table.css', 'module-ui-runtime.js'
  ]) assert.ok(html.includes(`../../shared/${asset}`), `missing ${asset}`);
  assert.match(html, /<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /href="leave-ui\.css"/);
  assert.doesNotMatch(html, /<!-- Google Fonts[\s\S]*?<style>\s*\/\* ── SHARED DESIGN-SYSTEM TOKENS/, 'module cascade must be extracted');
  assert.doesNotMatch(css, /SaagarUiFoundation|createAuditedControl|SaagarTableFoundation/);
});

test('generated monthly Leave report carries one reviewed grid strategy', () => {
  assert.match(html, /wrap\.className = 'saagar-table-region--grid'/);
  assert.match(html, /tbl\.className = 'report-table saagar-table saagar-table--grid'/);
  assert.match(html, /tbl\.dataset\.saagarTableWorkflow = 'monthly-leave-report'/);
  assert.match(html, /tbl\.dataset\.saagarTableStrategy = 'grid'/);
  assert.match(html, /tbl\.dataset\.saagarGridReason = 'employee leave categories balances and totals require cross-column comparison'/);
  assert.match(css, /\.saagar-table-region--grid \{ overflow-x: auto;/);
  assert.match(css, /\.report-table \{ min-width: 860px;/);
});

test('Leave provides explicit API-23 fallbacks for calendar and form grids', () => {
  for (const selector of ['day-headers', 'cal-grid', 'form-grid', 'capacity-grid', 'detail-grid']) {
    assert.ok(css.includes(selector), `missing fallback coverage for ${selector}`);
  }
  assert.match(css, /html\.saagar-legacy-webview \.day-headers,[\s\S]*display: -webkit-flex; display: flex;/);
  assert.match(css, /-webkit-flex-wrap: wrap; flex-wrap: wrap;/);
});

test('Leave business, storage and calculation identities remain pinned', () => {
  const source = applicationSource(html);
  assert.equal(source.length, 107_195);
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), '634a5712f66d9da0f00c7972fb6e9197a549c95ad99b804fb1c72b484e06b612');
  for (const identity of [
    "localStorage.getItem('leavedesk_v3')", "localStorage.setItem('leavedesk_v3', JSON.stringify(data))", 'function submitLeave()',
    'function decideLeave(', "['approved','rejected'].includes(decision)", "leaveStatus(l) !== 'pending'", 'function fyUsage(', 'function entFor(',
    'function exportReportCSV()', 'function executeClearData()'
  ]) assert.ok(source.includes(identity), `missing preserved Leave identity: ${identity}`);
});

test('generated actions use the frozen schema and delegated encoded arguments', () => {
  assert.match(html, /module-rendered-components\.js/);
  assert.match(html, /SaagarRenderedComponents\.observe\(document\.body,LeaveRenderedPolicy\)/);
  assert.match(html, /SaagarRenderedComponents\.connect\(document\.body, LeaveRenderedPolicy, LeaveDelegatedHandlers\)/);
  for (const action of [
    'approve-pending-leave', 'reject-pending-leave', 'remove-day-leave',
    'remove-day-agenda', 'approve-staff-leave', 'reject-staff-leave',
    'edit-employee-entitlements', 'remove-employee', 'save-employee-entitlements'
  ]) assert.match(html, new RegExp(`dataset\\.action = '${action}'`), `missing generated action ${action}`);
  for (const expression of ['p.key, l.id', 'key, l.id', 'key, i', 'e.id', 'i']) {
    assert.match(html, new RegExp(`SaagarRenderedComponents\\.encodeArgs\\(\\[${expression.replaceAll('.', '\\.')}\\]\\)`));
  }
  assert.doesNotMatch(html, /(?:ok|no|del|cog|sv)\.onclick = \(\) => (?:decideLeave|removeBlackout|removeLeave|removeAgenda|toggleEntEditor|removeEmployee|saveEntOverride)/);
  assert.equal(Object.isFrozen(renderedApi), true);
});
