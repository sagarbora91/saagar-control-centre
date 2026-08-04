import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const stock = fs.readFileSync(new URL('../www/modules/stock/index.html', import.meta.url), 'utf8');

test('D5 Stock loads the local policy and stores triage additively on the day blob', () => {
  assert.match(stock, /<script src="\.\.\/\.\.\/stock-variance-policy\.js"><\/script>/);
  assert.match(stock, /theftVerified:null, d5Triage:\{\}/);
  assert.match(stock, /data\.d5Triage\[brand\]=\{state:state,cause:/);
  assert.doesNotMatch(stock, /localStorage\.setItem\([^)]*d5Triage/);
});

test('D5-S1 lock sheet provides all triage fields and policy validation', () => {
  for (const marker of ['clk-state', 'clk-cause', 'clk-remark', 'clk-owner', 'validateTriage']) assert.match(stock, new RegExp(marker));
  assert.match(stock, /state==='closed'/);
  assert.match(stock, /closedAt=now/);
});

test('D5-S2 reconciliation is explicitly advisory with provenance and unavailable states', () => {
  assert.match(stock, /Advisory sales reconciliation/);
  assert.match(stock, /Never blocks Stock count or lock/);
  assert.match(stock, /QMS has no store field/);
  assert.match(stock, /Submitted DSRs · selected store\/date/);
  assert.match(stock, /QMS live blob · whole business\/date/);
  assert.match(stock, /p\.reconcile\('Stock',stockValue,'DSR',dsrN\)/);
});

test('D5-S3 drill-down preserves date/store context and routes to triage', () => {
  assert.match(stock, /function renderVarianceDrilldown/);
  assert.match(stock, /p\.rankVariances\(rows\)/);
  assert.match(stock, /fmtDate\(st\.date\)/);
  assert.match(stock, /d5OpenTriage/);
});

test('D5 Stock inline JavaScript remains syntactically valid', () => {
  const scripts = [...stock.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
  assert.ok(scripts.length > 0);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new vm.Script(source, { filename: `stock-inline-${index}.js` })));
});
