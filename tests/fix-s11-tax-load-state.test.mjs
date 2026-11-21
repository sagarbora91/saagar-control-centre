// S11 U11-F13 (stale activeFirmId) and the F06 prune-on-load hook, through the real loadState.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, run, MONTHS } from './lib/fix-s11-extract.mjs';

function load(stored) {
  const store = { taxcal_v2: stored };
  const ctx = buildContext(['loadState', 'saveState', 'pruneOrphanCustomStubs', 'monthAbbr'], {
    MONTHS, Object, Array, String, RegExp, Number, JSON,
    STATE: null,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } }
  });
  run(ctx, 'loadState()');
  return { state: ctx.STATE, store };
}

test('F13: a stale activeFirmId falls back to the first firm and is saved', () => {
  const { state, store } = load(JSON.stringify({ firms: [{ id: 'f1' }, { id: 'f2' }], activeFirmId: 'ghost' }));
  assert.equal(state.activeFirmId, 'f1');
  assert.equal(JSON.parse(store.taxcal_v2).activeFirmId, 'f1');
});

test('F13: no firms gives null; a valid id and an empty id are untouched', () => {
  assert.equal(load(JSON.stringify({ firms: [], activeFirmId: 'ghost' })).state.activeFirmId, null);
  assert.equal(load(JSON.stringify({ firms: [{ id: 'f1' }, { id: 'f2' }], activeFirmId: 'f2' })).state.activeFirmId, 'f2');
  assert.equal(load(JSON.stringify({ firms: [{ id: 'f1' }], activeFirmId: '' })).state.activeFirmId, '');
});

test('F13: corrupt JSON still gives safe defaults', () => {
  const { state } = load('{not json');
  assert.deepEqual(Array.from(state.firms), []);
  assert.equal(state.fyStartYear, 2026);
});

test('F06: loadState prunes an orphan bare stub and keeps an orphan filed record', () => {
  const { state } = load(JSON.stringify({
    firms: [{ id: 'f1' }], activeFirmId: 'f1', custom: [],
    compliance: { f1: { 2026: { 'cust-9-Nov': { done: false }, 'cust-9-Dec': { done: true, filedOn: '2026-12-01' } } } }
  }));
  assert.deepEqual(Object.keys(state.compliance.f1[2026]), ['cust-9-Dec']);
});
