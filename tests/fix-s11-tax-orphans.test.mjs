// S11 U11-F06: no orphan records after deleting a custom obligation or a firm; old bare stubs pruned on load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, run, MONTHS } from './lib/fix-s11-extract.mjs';

function setup(state) {
  const log = { saves: 0, evPurges: [] };
  const ctx = buildContext(
    ['purgeCustomRecords', 'deleteCustomObligation', 'deleteFirm', 'pruneOrphanCustomStubs', 'monthAbbr'],
    {
      MONTHS, Object, Array, String, RegExp, Number,
      STATE: state,
      confirm: () => true,
      saveState: () => { log.saves++; },
      resetMasterForm: () => {}, renderMasterList: () => {}, rerender: () => {},
      populateFirmSelector: () => {}, renderFirmList: () => {},
      evApi: () => ({ delByMatch: p => log.evPurges.push(p) })
    });
  return { ctx, log, state: ctx.STATE };
}
const plain = o => JSON.parse(JSON.stringify(o));

function baseState() {
  return {
    firms: [{ id: 'firm_1', name: 'A' }, { id: 'firm_2', name: 'B' }],
    activeFirmId: 'firm_1',
    custom: [{ id: 'cust-111', firmId: null }, { id: 'cust-1111', firmId: null }, { id: 'cust-222', firmId: 'firm_2' }, { id: 'cust-333', firmId: 'firm_1' }, { id: 'cust-444', firmId: null }],
    archived: ['cust-111', 'cust-444', 'gst-1'],
    compliance: {
      firm_1: {
        2026: { 'cust-111-Nov': { done: true, filedOn: '2026-11-01' }, 'cust-111-Dec': { done: false }, 'cust-1111-Nov': { done: false }, 'gst-1-Nov': { done: true }, 'cust-333-Nov': { done: false } },
        2027: { 'cust-111-Nov': { done: false } }
      },
      firm_2: { 2026: { 'cust-111-Nov': { done: false }, 'cust-222-Nov': { done: false }, 'cust-222-Dec': { done: true, filedOn: 'x' } } }
    }
  };
}

test('F06a: deleting a custom obligation removes every record, in every firm and FY, and the archive entry', () => {
  const { ctx, state } = setup(baseState());
  run(ctx, "deleteCustomObligation('cust-111')");
  const all = JSON.stringify(plain(state.compliance));
  assert.ok(!all.includes('"cust-111-'), 'no cust-111-* key left');
  assert.ok(all.includes('"cust-1111-Nov"'), 'neighbour with a longer id untouched');
  assert.ok(all.includes('"gst-1-Nov"'));
  assert.deepEqual(plain(state.archived), ['cust-444', 'gst-1']);
  assert.ok(!state.custom.some(c => c.id === 'cust-111'));
});

test('F06b: deleting a firm removes obligations scoped only to it', () => {
  const { ctx, state } = setup(baseState());
  run(ctx, "deleteFirm('firm_2')");
  const ids = state.custom.map(c => c.id).sort();
  assert.deepEqual(ids, ['cust-111', 'cust-1111', 'cust-333', 'cust-444']);
  assert.ok(!state.compliance.firm_2);
  assert.equal(state.activeFirmId, 'firm_1');
  assert.ok(!state.archived.includes('cust-222'));
});

test('F06c: load prunes orphan bare stubs, keeps orphan done records and records of existing customs', () => {
  const st = {
    firms: [{ id: 'firm_1' }], custom: [{ id: 'cust-5' }], archived: [],
    compliance: { firm_1: { 2026: {
      'cust-9-Nov': { done: false, dueDate: '2026-11-30' },             // orphan stub -> removed
      'cust-9-Dec': { done: true, filedOn: '2026-12-01' },               // orphan done -> kept
      'cust-9-Jan': { done: false, notes: 'typed by user' },             // orphan with details -> kept
      'cust-9-Feb': { done: false, na: true },                           // orphan NA -> kept
      'cust-5-Nov': { done: false },                                     // existing custom -> kept
      'gst-1-Nov': { done: false }                                       // built-in -> kept
    } } }
  };
  const { ctx, state, log } = setup(st);
  run(ctx, 'pruneOrphanCustomStubs()');
  assert.deepEqual(Object.keys(state.compliance.firm_1[2026]).sort(), ['cust-5-Nov', 'cust-9-Dec', 'cust-9-Feb', 'cust-9-Jan', 'gst-1-Nov']);
  assert.equal(log.saves, 1);
  run(ctx, 'pruneOrphanCustomStubs()');
  assert.equal(log.saves, 1, 'nothing more to remove, no extra save');
});
