import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const policy = require('../www/stock-variance-policy.js');

test('D5-S1 exposes the approved taxonomy and default owner', () => {
  assert.deepEqual(policy.CAUSES.map(c => c.id), ['miscount','unrecorded_sale','unrecorded_transfer','grn_not_posted','damage_defective','theft','system_error','other']);
  assert.equal(policy.DEFAULT_OWNER, 'Store Manager');
});
test('D5-S1 legacy remarks remain readable as open triage evidence', () => {
  assert.deepEqual(policy.normaliseTriage(null, 'Legacy explanation'), { state:'open', cause:'', note:'Legacy explanation', owner:'Store Manager' });
});
test('D5-S1 closure requires approved cause and evidence', () => {
  assert.equal(policy.validateTriage({state:'closed'}).ok, false);
  assert.equal(policy.validateTriage({state:'closed',cause:'miscount',note:'Count sheet checked'}).ok, true);
  assert.equal(policy.validateTriage({state:'investigating',cause:'other'}).ok, false);
});
test('D5-S2 reconciliation distinguishes match, mismatch and unavailable', () => {
  assert.equal(policy.reconcile('Stock',5,'DSR',5).status, 'match');
  assert.equal(policy.reconcile('Stock',7,'QMS',5).status, 'mismatch');
  assert.equal(policy.reconcile('DSR',null,'QMS',5).status, 'unavailable');
});
test('D5-S3 drill-down ranks absolute gap then brand', () => {
  assert.deepEqual(policy.rankVariances([{brand:'B',variance:-3},{brand:'A',variance:3,state:'closed'},{brand:'C',variance:1},{brand:'Z',variance:0}]), [{brand:'A',variance:3,state:'closed'},{brand:'B',variance:-3,state:'open'},{brand:'C',variance:1,state:'open'}]);
});
