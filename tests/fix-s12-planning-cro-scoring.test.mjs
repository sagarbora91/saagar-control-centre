import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCro, ymd } from './lib/fix-s12-cro-vm.mjs';

const TITAN = 'Titan World, Latur';
const HELIOS = 'Helios, Latur';
const j = v => JSON.parse(JSON.stringify(v));
const STORE_SETTINGS = { reviews: 30, mktg: 120, byStore: { WLMHW: { reviews: 10, mktg: 20 } } };

function fresh(storage = {}) {
  const m = loadCro({ storage });
  m.run('initTData()');
  m.run('buildTasks()');
  return m;
}

test('F-CRO-2: header points use the same per-store targets as the live strip', () => {
  const m = fresh({ cro_s_v3: STORE_SETTINGS });
  m.setForm({ store: TITAN });
  m.el('rev-cnt').value = 1; m.el('mktg-cnt').value = 4;
  m.run('onRevInput()'); m.run('onMktgInput()');
  assert.equal(m.el('tp-t6').textContent, '10/10');
  assert.equal(m.el('tp-t7').textContent, '10/10');
  assert.equal(m.run("getTaskPts('t6')"), m.run("calcRev(tData.t6, getTargets('WLMHW'))"));
  assert.equal(m.run("getTaskPts('t7')"), m.run("calcMktg(tData.t7, getTargets('WLMHW'))"));
  assert.match(m.el('rev-auto').textContent + m.el('rev-hint').textContent, /10|1/);
});

test('F-CRO-2: a store without an override, and no store at all, use the global targets', () => {
  const m = fresh({ cro_s_v3: STORE_SETTINGS });
  m.setForm({ store: HELIOS });
  m.el('rev-cnt').value = 1; m.el('mktg-cnt').value = 4;
  m.run('onRevInput()'); m.run('onMktgInput()');
  assert.equal(m.run("getTaskPts('t6')"), 5);
  assert.equal(m.run("getTaskPts('t7')"), 8);
  m.setForm({ store: '' });
  m.run('onRevInput()'); m.run('onMktgInput()');
  assert.equal(m.run("getTaskPts('t6')"), 5);
  assert.equal(m.run("getTaskPts('t7')"), 8);
});

test('F-CRO-2: a saved audit stores the per-store points', () => {
  const m = fresh({ cro_s_v3: STORE_SETTINGS });
  m.setForm({ store: TITAN, cro: 'Ravi', sm: 'Meena', date: ymd(new Date()) });
  for (const t of ['t1', 't2', 't3', 't4', 't8', 't10']) m.run(`tData.${t}={pts:7,remarks:''}`);
  m.el('rev-cnt').value = 1; m.el('mktg-cnt').value = 4;
  m.run('onRevInput()'); m.run('onMktgInput()');
  m.run('croSubmitAudit()');
  const [a] = m.audits();
  assert.equal(a.tasks.t6.pts, 10);
  assert.equal(a.tasks.t7.pts, 10);
});

test('F-CRO-3: negative or too-large inputs are corrected and never give negative points', () => {
  const m = fresh();
  m.setForm({ store: TITAN });
  m.el('nps-bills').value = 100; m.el('nps-coll').value = -10; m.el('nps-score-inp').value = -40;
  m.el('rev-cnt').value = -3; m.el('mktg-cnt').value = -2; m.el('groom-pct').value = -30;
  m.run('onNpsInput()'); m.run('onRevInput()'); m.run('onMktgInput()'); m.run('onGroomInput()');
  assert.equal(m.el('nps-coll').value, 0);
  assert.equal(m.el('nps-score-inp').value, 0);
  assert.equal(m.el('mktg-cnt').value, 0);
  assert.equal(m.el('groom-pct').value, 0);
  const t = j(m.run('tData'));
  assert.equal(t.t5.npsCollected, 0); assert.equal(t.t5.npsScore, 0);
  assert.equal(t.t7.activityCount, 0); assert.equal(t.t9.groomingPct, 0);
  for (const id of ['t5', 't6', 't7', 't9']) assert.ok(m.run(`getTaskPts('${id}')`) >= 0, id);
  assert.equal(m.run("getTaskPts('t5')"), 0);
  assert.equal(m.run("getTaskPts('t7')"), 0);
  assert.equal(m.run("getTaskPts('t9')"), 0);
  for (const t2 of ['t1', 't2', 't3', 't4', 't8', 't10']) m.run(`tData.${t2}={pts:7,remarks:''}`);
  assert.equal(m.run('getTotal()'), 42 + m.run("getTaskPts('t6')"));
  m.el('groom-pct').value = 150; m.el('nps-score-inp').value = 120;
  m.run('onGroomInput()'); m.run('onNpsInput()');
  assert.equal(m.el('groom-pct').value, 100);
  assert.equal(m.el('nps-score-inp').value, 100);
  assert.equal(m.run('calcRev({reviewsCount:-5},{reviews:30})'), 0);
  assert.equal(m.run('calcMktg({activityCount:-5},{mktg:120})'), 0);
  assert.equal(m.run('calcGroom({groomingPct:-50})'), 0);
});

function fillSettings(m, v) {
  for (const [id, x] of Object.entries(v)) m.el(id).value = x;
}

test('F-CRO-4: Settings refuse negative and over-100 values and keep the old settings', () => {
  const m = fresh();
  fillSettings(m, { 's-surveys': -5 });
  m.run('croSaveTargets()');
  assert.equal(m.ls.getItem('cro_s_v3'), null);
  assert.match(m.toasts.at(-1), /Survey target cannot be negative/);
  fillSettings(m, { 's-surveys': '', 's-rate': 250 });
  m.run('croSaveTargets()');
  assert.equal(m.ls.getItem('cro_s_v3'), null);
  assert.match(m.toasts.at(-1), /Response-rate target cannot be more than 100/);
  fillSettings(m, { 's-rate': '', 's-WLMHW-reviews': -3 });
  m.run('croSaveTargets()');
  assert.equal(m.ls.getItem('cro_s_v3'), null);
  assert.match(m.toasts.at(-1), /Titan World review target cannot be negative/);
  fillSettings(m, { 's-WLMHW-reviews': '', 's-surveys': -5 });
  m.run('updDerived()');
  assert.match(m.el('d-surveys').textContent, /Survey target cannot be negative - will not be saved/);
});

test('F-CRO-4: valid values save in today\'s shape; blank and 0 fall back to defaults', () => {
  const m = fresh();
  fillSettings(m, { 's-surveys': 90, 's-rate': 40, 's-WLMHW-surveys': 12, 's-nps-score': 0, 's-reviews': '' });
  m.run('croSaveTargets()');
  const s = m.settings();
  assert.equal(s.surveys, 90);
  assert.equal(s.rate, 40);
  assert.equal(s.npsScore, 85);
  assert.equal(s.reviews, 30);
  assert.deepEqual(s.byStore, { WLMHW: { surveys: 12 } });
});

test('F-CRO-4: on a past day nothing saves and the read-only message appears', () => {
  const m = loadCro({ asOf: '2020-01-02' });
  m.run('initTData()');
  fillSettings(m, { 's-surveys': 90 });
  m.run('croSaveTargets()');
  assert.equal(m.ls.getItem('cro_s_v3'), null);
  assert.match(m.toasts.at(-1), /read-only/);
});

test('F-CRO-4: the Save button, its policy entry and the read-only lock follow the wrapper', async () => {
  const { croHtml } = await import('./lib/fix-s12-cro-vm.mjs');
  const html = croHtml();
  assert.match(html, /'save-targets':\{handler:'croSaveTargets',args:0\}/);
  assert.match(html, /data-action="save-targets" class="sbtn" onclick="croSaveTargets\(\)"/);
  assert.match(html, /\.sbtn\[onclick\*="croSaveTargets"\]/);
  assert.match(html, /'submit-audit':\{handler:'croSubmitAudit',args:0\}/);
  assert.match(html, /data-action="submit-audit" class="sbtn green" onclick="croSubmitAudit\(\)"/);
});

function readyToSubmit(m, date) {
  m.setForm({ store: TITAN, cro: 'Ravi', sm: 'Meena', date });
  for (const t of ['t1', 't2', 't3', 't4', 't8', 't10']) m.run(`tData.${t}={pts:7,remarks:''}`);
}

test('F-CRO-6: a future-dated audit is refused; today and yesterday save', () => {
  const m = fresh();
  const d = new Date();
  const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  readyToSubmit(m, ymd(tomorrow));
  m.run('croSubmitAudit()');
  assert.equal(m.audits().length, 0);
  assert.match(m.toasts.at(-1), /Audit date cannot be in the future/);
  readyToSubmit(m, ymd(d));
  m.run('croSubmitAudit()');
  assert.equal(m.audits().length, 1);
  m.run('initTData()');
  readyToSubmit(m, ymd(yesterday));
  m.run('croSubmitAudit()');
  assert.equal(m.audits().length, 2);
});

test('F-CRO-6: the date box is capped at today', () => {
  const m = loadCro();
  m.run('setToday()');
  assert.equal(m.el('f-date').max, ymd(new Date()));
});

function iso(y, mo, da) { return new Date(y, mo - 1, da); }
function refIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.floor((t - Date.UTC(y, 0, 1)) / 864e5 / 7) + 1;
  return { y, w };
}

test('F-CRO-7: ISO week number and year, including the year boundary', () => {
  const m = loadCro();
  const cases = [[2025, 12, 29, 1, 2026], [2026, 1, 5, 2, 2026], [2026, 11, 9, 46, 2026], [2024, 12, 30, 1, 2025], [2021, 1, 3, 53, 2020]];
  for (const [y, mo, da, w, yr] of cases) {
    assert.equal(m.ctx.wkNum(iso(y, mo, da)), w, `${y}-${mo}-${da} week`);
    assert.equal(m.ctx.wkYear(iso(y, mo, da)), yr, `${y}-${mo}-${da} year`);
  }
  for (let y = 2023; y <= 2028; y++) {
    for (let da = 1; da <= 366; da += 1) {
      const d = new Date(y, 0, da);
      if (d.getFullYear() !== y || d.getDay() !== 1) continue;
      const r = refIso(d);
      assert.equal(m.ctx.wkNum(d), r.w, d.toDateString());
      assert.equal(m.ctx.wkYear(d), r.y, d.toDateString());
    }
  }
});

test('F-CRO-3 (audit add): a negative NPS figure already in tData never gives negative points', () => {
  const m = fresh();
  m.run("tData.t5={billsCount:10,npsCollected:-5,npsScore:-40,responseRate:0,remarks:''}");
  assert.equal(m.run("getTaskPts('t5')"), 0);
});

test('F-CRO-7 (audit add): the week breakdown orders a year-boundary month by ISO year, then week', () => {
  const m = fresh();
  const mk = (id, date) => ({ id, date, total: 50, tasks: { t5: { npsCollected: 1, billsCount: 2, npsScore: 80 }, t6: { reviewsCount: 1 }, t7: { activityCount: 1 } } });
  const html = m.run('buildWeekBreakdown')([mk('x1', '2025-12-30'), mk('x2', '2025-12-02')], 2025, 11, m.run('getS()'));
  const weeks = [...html.matchAll(/>Week (\d+)</g)].map(x => +x[1]);
  assert.deepEqual(weeks, [49, 1]);
});
