// U13-F04 real-chain half (new file): the scope detail panel must show the readiness status the gateway
// computes, not a "Native state" that the gateway never returns.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { etpModulePath, loadRenderScopeDetail, metricMap } from './lib/fix-s13-dom.mjs';

const require = createRequire(import.meta.url);

test('module source shows Status from result.status.status and never reads result.status.state', () => {
  const source = fs.readFileSync(etpModulePath, 'utf8');
  assert.ok(source.includes("appendMetric(grid, 'Status', result.status && result.status.status || 'Unavailable');"));
  assert.ok(!source.includes('result.status.state'));
  assert.ok(!source.includes("'Native state'"));
});

test('real foundation-status output renders as a readiness Status, never Unavailable', () => {
  const foundation = require('../www/etp-foundation-status.js');
  const generation = 'etp_' + 'a'.repeat(32);
  const scope = { storeCode: 'WLMHW', financialYear: '2026-27', periodStart: '2026-08-01', periodEnd: '2026-08-31', scopeKey: 'WLMHW|2026-27|2026-08-01..2026-08-31' };
  const coverage = {};
  for (const id of ['R003', 'R013', 'R022', 'R025']) coverage[id] = { status: 'COMPLETE', zeroActivityConfirmed: false };
  const receipt = {
    activeGenerationId: generation, reconciliationStatus: 'PASS', coverage,
    exceptions: { R003: { status: 'PASS', differenceCount: 0 }, R013: { status: 'PASS', differenceCount: 0 }, paymentType25: { status: 'QUARANTINED', rowCount: 2, persisted: false } },
    profileVersion: 'PROFILE-V1', ruleVersion: 'REC-V1', publishedAt: '2026-08-25T09:00:00.000Z'
  };
  const status = foundation.evaluate({
    contractVersion: foundation.VERSION, scope: { storeCode: scope.storeCode, financialYear: scope.financialYear, periodStart: scope.periodStart, periodEnd: scope.periodEnd, scopeKey: scope.scopeKey },
    factStoreAvailable: true, nativeStatus: { state: 'ACCEPTED', restoreFence: false, activeGenerationId: generation }, receipt
  });
  assert.equal(status.ok, true, JSON.stringify(status));
  assert.ok(['READY', 'READY_WITH_WARNINGS'].includes(status.status));
  assert.equal(status.state, undefined, 'the real status object has no state key');

  const render = loadRenderScopeDetail();
  const out = render({ ok: true, scope: status.scope, status, currentReceipt: Object.assign({ scopeKey: scope.scopeKey }, receipt), history: [] });
  assert.equal(out.detail.hidden, false);
  const metrics = metricMap(out.host);
  assert.equal(metrics.Status, status.status);
  assert.notEqual(metrics.Status, 'Unavailable');
  assert.equal(metrics['Native state'], undefined);
});
