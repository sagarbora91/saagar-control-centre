import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { inlineModuleScripts } from './lib/module-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'www/modules/etp/index.html'), 'utf8');

test('ETP-2 module scripts parse and expose exact scope and four-file controls', () => {
  inlineModuleScripts(html).forEach((source, index) => assert.doesNotThrow(() => new vm.Script(source, { filename: `etp-ui-${index}.js` })));
  for (const field of ['storeCode', 'financialYear', 'periodStart', 'periodEnd']) {
    assert.match(html, new RegExp(`data-etp-scope="${field}"`));
  }
  for (const report of ['R003', 'R013', 'R022', 'R025']) {
    assert.match(html, new RegExp(`data-etp-file="${report}"`));
  }
  assert.equal((html.match(/type="file"/g) || []).length, 4);
  assert.match(html, /accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
});

test('validation sends only scope and files while trusted gateway owns coverage authority', () => {
  assert.match(html, /api\.run\(\{\s*scope: selectedScope,\s*files: REPORTS\.map/);
  assert.match(html, /return \{ selectedReportId: id, file: state\.files\[id\] \}/);
  assert.match(html, /coverageConfirmed: true/);
  assert.doesNotMatch(html, /confirmedByRole|coverageDeclaration: declaration/);
  assert.match(html, /if \(!filesReady\(\)\)/);
  assert.match(html, /if \(!document\.getElementById\('etpCoverageConfirmed'\)\.checked\)/);
});

test('terminal success releases selected workbooks and coverage state', () => {
  assert.match(html, /function resetImportFiles\(\)/);
  assert.match(html, /state\.files\[id\] = null/);
  assert.match(html, /input\.value = ''/);
  assert.match(html, /etpCoverageConfirmed'\)\.checked = false/);
  assert.ok((html.match(/resetImportFiles\(\);/g) || []).length >= 2);
  assert.match(html, /Selected workbook bytes are used only for validation and are released after a terminal success/);
});

test('scope validation checks a real consecutive financial year and period membership', () => {
  assert.match(html, /Number\(match\[2\]\) !== \(Number\(match\[1\]\) \+ 1\) % 100/);
  assert.match(html, /function fy\(date\)/);
  assert.match(html, /toISOString\(\)\.slice\(0, 10\) !== value\.periodStart/);
  assert.match(html, /fy\(start\) === value\.financialYear && fy\(end\) === value\.financialYear/);
});

test('publication consumes only the opaque confirmation token and defaults fail closed', () => {
  assert.match(html, /\^confirm_\[a-f0-9\]\{32\}_\\d\+\$/);
  assert.match(html, /api\.confirm\(\{ confirmationToken: token \}\)/);
  assert.match(html, /state\.confirmationToken = '';/);
  assert.match(html, /Nothing was published/);
  assert.match(html, /Publication stopped safely/);
  assert.doesNotMatch(html, /lifecycle\s*:/);
});

test('coverage/history is bounded, metadata-only and rendered without HTML injection', () => {
  assert.match(html, /api\.listScopes\(\{ limit: 20 \}\)/);
  assert.match(html, /api\.inspectScope\(selectedScope, \{ historyLimit: 10 \}\)/);
  assert.match(html, /currentReceipt\.coverage/);
  assert.match(html, /result\.history/);
  assert.match(html, /function renderScopeError\(code\)/);
  assert.doesNotMatch(html, /text\(document\.getElementById\('etpScopeList'\), 'Scope unavailable/);
  assert.doesNotMatch(html, /\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
});

test('module has no direct native, fact, storage, export or parent capability', () => {
  assert.match(html, /SaagarModuleBridge/);
  assert.match(html, /bridge\.etpGateway/);
  assert.doesNotMatch(html, /SaagarEtp(?:NativeStore|VerifiedReader|ImportRuntime)|readFacts\s*\(|Capacitor\.Plugins|localStorage|indexedDB|window\.parent|parent\.postMessage|navigator\.share|\.download\s*=/);
});

test('ETP-3 integration hooks coexist with accessible tab and live-status behavior', () => {
  for (const hook of ['data-etp-verified-root', 'data-etp-view-tab="verified"', 'data-etp-view-tab="exceptions"', 'data-etp-verified-refresh', 'data-etp-verified-content', 'data-etp-exceptions-content']) {
    assert.match(html, new RegExp(hook));
  }
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /event\.key !== 'ArrowRight' && event\.key !== 'ArrowLeft'/);
});
