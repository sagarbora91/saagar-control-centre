// S11 U11-F04: undoing a filing asks first and keeps only the stub fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, run } from './lib/fix-s11-extract.mjs';

function setup(answer) {
  const comp = { 'item-1': { done: true, filedOn: '2026-11-01', notes: 'N', evidenceRef: 'REF-1', reviewerNote: 'R', dueDate: '2026-11-20', name: 'GSTR-3B', buffer: 3 } };
  const log = { saves: 0, renders: 0, confirms: [], alerts: [] };
  const ctx = buildContext(['clickDone'], {
    isPastAsOf: () => false, isItemNA: () => false,
    isItemDone: id => !!(comp[id] && comp[id].done),
    getActiveFirm: () => ({ id: 'f1' }),
    getFirmCompliance: () => comp,
    saveState: () => { log.saves++; },
    renderMonth: () => { log.renders++; },
    curMonth: 'November',
    confirm: m => { log.confirms.push(m); return answer; },
    alert: m => log.alerts.push(m),
    document: { getElementById: () => null }
  });
  return { ctx, comp, log };
}

test('F04: cancel keeps the record exactly as it was', () => {
  const { ctx, comp, log } = setup(false);
  const before = JSON.stringify(comp);
  run(ctx, "clickDone('item-1')");
  assert.equal(JSON.stringify(comp), before);
  assert.equal(log.saves, 0);
  assert.equal(log.confirms.length, 1);
});

test('F04: confirm clears the filing details but keeps dueDate, name and buffer', () => {
  const { ctx, comp, log } = setup(true);
  run(ctx, "clickDone('item-1')");
  assert.deepEqual(JSON.parse(JSON.stringify(comp['item-1'])), { done: false, dueDate: '2026-11-20', name: 'GSTR-3B', buffer: 3 });
  assert.equal(log.saves, 1);
  assert.equal(log.renders, 1);
  assert.match(log.confirms[0], /notes/);
  assert.match(log.confirms[0], /evidence reference/);
});
