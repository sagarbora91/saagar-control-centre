// S11 U11-F09: a filed-on date in the future is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, run } from './lib/fix-s11-extract.mjs';

function setup(dateValue) {
  const comp = {};
  const log = { saves: 0, alerts: [] };
  const ctx = buildContext(['confirmDone', 'todayStr'], {
    String, Date,
    isPastAsOf: () => false, isItemNA: () => false,
    getActiveFirm: () => ({ id: 'f1' }),
    getFirmCompliance: () => comp,
    findItemMonth: () => null,
    getMonthItems: () => [],
    dueDateIso: () => null,
    saveState: () => { log.saves++; },
    renderMonth: () => {},
    curMonth: 'November',
    evAdd: () => Promise.resolve(), hydrateEvidence: () => {},
    alert: m => log.alerts.push(m),
    document: { getElementById: id => (id === 'ddate-i1' ? { value: dateValue } : null) }
  });
  return { ctx, comp, log };
}
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

test('F09: tomorrow is refused, nothing is written', () => {
  const t = new Date(); t.setDate(t.getDate() + 1);
  const { ctx, comp, log } = setup(iso(t));
  run(ctx, "confirmDone('i1')");
  assert.deepEqual(comp, {});
  assert.equal(log.saves, 0);
  assert.equal(log.alerts.length, 1);
  assert.match(log.alerts[0], /cannot be in the future/);
});

test('F09: today and a past date save', () => {
  const t = new Date();
  let s = setup(iso(t)); run(s.ctx, "confirmDone('i1')");
  assert.equal(s.comp.i1.filedOn, iso(t));
  const p = new Date(); p.setDate(p.getDate() - 20);
  s = setup(iso(p)); run(s.ctx, "confirmDone('i1')");
  assert.equal(s.comp.i1.filedOn, iso(p));
  assert.equal(s.log.alerts.length, 0);
});

test('F09: an empty date falls back to today (no-regression guard)', () => {
  const s = setup('');
  run(s.ctx, "confirmDone('i1')");
  assert.equal(s.comp.i1.filedOn, iso(new Date()));
});
