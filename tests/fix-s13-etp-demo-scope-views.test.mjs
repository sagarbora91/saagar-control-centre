// U13-F04 (demo half), U13-034, U13-F05 (new file): scope detail, per-view analytics and consistent pace figures
// on the demo stand-in, checked against the real presentations and the real renderScopeDetail.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRenderScopeDetail, metricMap } from './lib/fix-s13-dom.mjs';
import { Node, Doc, all, loadDemo, loadWww, text, tick } from './lib/fix-s13-pres-dom.mjs';

const demo = loadDemo();
const verified = loadWww('etp-verified-presentation.js');
const e4p = loadWww('etp-e4-presentation.js');
const publicScope = () => ({ storeCode: demo.scope.storeCode, financialYear: demo.scope.financialYear, periodStart: demo.scope.periodStart, periodEnd: demo.scope.periodEnd });

test('inspectScope returns the real gateway shape and the real panel shows it', async () => {
  const r = await demo.readGateway.inspectScope(demo.scope, { historyLimit: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.scope.scopeKey, demo.scope.scopeKey);
  assert.equal(r.status.status, 'READY_WITH_WARNINGS');
  assert.deepEqual(Object.keys(r.currentReceipt.coverage).sort(), ['R003', 'R013', 'R022', 'R025']);
  for (const id of Object.keys(r.currentReceipt.coverage)) assert.equal(r.currentReceipt.coverage[id].status, 'COMPLETE');
  assert.deepEqual(await demo.readGateway.inspectScope({ scopeKey: 'OTHER|2026-27|2026-08-01..2026-08-31' }, {}), { ok: false, code: 'ETP_SCOPE_UNAVAILABLE' });

  const out = loadRenderScopeDetail()(r);
  assert.equal(out.detail.hidden, false);
  assert.match(out.heading.textContent, /WLMHW · 2026-27 · 2026-08-01 to 2026-08-31/);
  const m = metricMap(out.host);
  assert.equal(m.Status, 'READY_WITH_WARNINGS');
  assert.equal(m.Published, '2026-08-25T09:00:00.000Z');
  assert.equal(m.Reconciliation, 'PASS');
  assert.match(m.Generation, /^etp_d+$/);
  const body = out.host.textContent;
  for (const id of ['R003', 'R013', 'R022', 'R025']) assert.ok(body.includes(id));
  assert.ok(body.includes('COMPLETE'));
  assert.ok(body.includes('No previous accepted generation.'));
});

test('loadSummary is unchanged (5377 rows, PASS)', async () => {
  const s = await demo.readGateway.loadSummary(demo.scope);
  assert.equal(s.rowCount, 5377);
  assert.equal(s.receipt.reconciliationStatus, 'PASS');
  assert.equal(s.summaries.R022.moneyUnits.net_value, 1200000000);
});

test('pace figures follow the days left in the period and the CRO actuals', async () => {
  const model = e4p.cleanModel(demo.models.e4());
  assert.ok(model);
  const left = Math.round((Date.parse(demo.scope.periodEnd + 'T00:00:00Z') - Date.parse(demo.scope.businessDate + 'T00:00:00Z')) / 86400000);
  assert.equal(left, 7);
  const raw = demo.models.e4().pace.cro;
  for (const row of raw) {
    assert.equal(row.requiredRunRatePaisePerFullDay, row.rupeeGapPaise > 0 ? Math.ceil(row.rupeeGapPaise / left) : 0);
    assert.equal(row.rupeeGapPaise, row.monthTargetPaise - row.verifiedActualPaise);
  }
  const by = Object.fromEntries(raw.map((r) => [r.croId, r]));
  assert.deepEqual(
    [by['DEMO-CRO-01'].rupeeGapPaise, by['DEMO-CRO-01'].requiredRunRatePaisePerFullDay, by['DEMO-CRO-01'].projectedLandingPaise, by['DEMO-CRO-01'].achievementBps],
    [59000000, 8428572, 466291667, 8595]);
  assert.deepEqual(
    [by['DEMO-CRO-02'].rupeeGapPaise, by['DEMO-CRO-02'].requiredRunRatePaisePerFullDay, by['DEMO-CRO-02'].projectedLandingPaise, by['DEMO-CRO-02'].achievementBps],
    [-19000000, 0, 515375000, 10500]);
  assert.deepEqual(
    [by['DEMO-CRO-03'].rupeeGapPaise, by['DEMO-CRO-03'].requiredRunRatePaisePerFullDay, by['DEMO-CRO-03'].projectedLandingPaise, by['DEMO-CRO-03'].achievementBps],
    [72000000, 10285715, 423666667, 8200]);
});

test('CRO actuals plus the unassigned invoices equal the store net; E4 and E5 agree per CRO', async () => {
  const mtd = (await demo.readGateway.loadAnalytics(publicScope(), { view: 'MTD', asOfDate: '2026-08-24' })).analytics;
  const sum = demo.models.e4().pace.cro.reduce((a, r) => a + r.verifiedActualPaise, 0);
  assert.equal(sum + mtd.identity.unassigned, 1200000000);
  assert.equal(mtd.identity.croAchievement, sum);
  assert.equal(mtd.identity.storeNet, 1200000000);
  const e5 = Object.fromEntries(demo.models.e5().calculations.map((c) => [c.croId, c.achievement]));
  for (const row of demo.models.e4().pace.cro) if (e5[row.croId] !== undefined) assert.equal(e5[row.croId], row.verifiedActualPaise);
});

test('loadAnalytics: Day and MTD differ, every mix adds up, YTD and LY say coverage is missing', async () => {
  const get = async (view) => (await demo.readGateway.loadAnalytics(publicScope(), { view, asOfDate: '2026-11-12' }));
  const day = (await get('DAY')).analytics, mtd = (await get('MTD')).analytics, ytd = (await get('YTD')).analytics, ly = (await get('LY')).analytics;
  assert.notEqual(day.metrics.netSale, mtd.metrics.netSale);
  assert.notEqual(day.metrics.bills, mtd.metrics.bills);
  assert.notEqual(day.metrics.units, mtd.metrics.units);
  for (const a of [day, mtd]) {
    assert.equal(a.coverage.complete, true);
    for (const k of ['brand', 'cro', 'tender']) assert.equal(a.mixes[k].reduce((s, x) => s + x.value, 0), a.metrics.netSale, `${a.view} ${k}`);
    assert.equal(a.identity.storeNet, a.identity.croAchievement + a.identity.unassigned);
    assert.equal(a.identity.reconciles, true);
  }
  assert.equal(mtd.metrics.netSale, 1200000000);
  assert.equal(mtd.period.start, '2026-08-01');
  assert.equal(day.period.start, '2026-08-24');
  for (const a of [ytd, ly]) {
    assert.equal(a.coverage.complete, false);
    assert.ok(Object.values(a.metrics).every((v) => v === null));
    assert.equal(a.period.label, 'Missing verified coverage');
    assert.equal(a.identity.reconciles, false);
  }
  assert.equal((await demo.readGateway.loadAnalytics(publicScope(), { view: 'WEEK', asOfDate: 'x' })).code, 'ETP_ANALYTICS_REQUEST_INVALID');
  assert.equal((await demo.readGateway.loadAnalytics(publicScope(), { view: 'DAY' })).code, 'ETP_ANALYTICS_REQUEST_INVALID');
  assert.equal((await demo.readGateway.loadAnalytics(publicScope(), { view: 'DAY', asOfDate: 'x', rows: [] })).code, 'ETP_ANALYTICS_REQUEST_INVALID');
  assert.equal((await demo.readGateway.loadAnalytics({ ...publicScope(), storeCode: 'OTHER' }, { view: 'DAY', asOfDate: 'x' })).code, 'ETP_ANALYTICS_NOT_READY');
});

test('the real verified presentation accepts every view and the four view buttons render different figures', async () => {
  for (const view of ['DAY', 'MTD', 'YTD', 'LY']) {
    const res = await demo.readGateway.loadAnalytics(publicScope(), { view, asOfDate: '2026-11-12' });
    assert.ok(verified.safeAnalytics(res, publicScope()), view + ' passes safeAnalytics');
  }

  const doc = new Doc();
  const content = new Node(doc), exceptions = new Node(doc), refresh = new Node(doc, 'button');
  const viewButtons = ['DAY', 'MTD', 'YTD', 'LY'].map((v) => { const b = new Node(doc, 'button'); b.setAttribute('data-etp-analytics-view', v); return b; });
  const root = {
    querySelector: (sel) => (sel === '[data-etp-verified-content]' ? content : sel === '[data-etp-exceptions-content]' ? exceptions : null),
    querySelectorAll: (sel) => (sel === '[data-etp-verified-refresh]' ? [refresh] : sel === '[data-etp-analytics-view]' ? viewButtons : [])
  };
  const made = verified.mount(root, demo.readGateway, { getScope: publicScope });
  assert.equal(made.ok, true);
  const seen = [];
  const first = await made.refresh();
  assert.equal(first.ok, true);
  seen.push(text(content));
  for (const b of viewButtons.slice(1)) { b.listeners.click(); await tick(10); seen.push(text(content)); }
  assert.equal(new Set(seen).size, 4, 'four different screens');
  assert.match(seen[1], /1,20,00,000|12,000,000|1200000000/);
  assert.match(seen[2], /Missing verified coverage|coverage missing/);
  assert.match(seen[3], /Missing verified coverage|coverage missing/);
  assert.ok(all(content).length > 5);
});
