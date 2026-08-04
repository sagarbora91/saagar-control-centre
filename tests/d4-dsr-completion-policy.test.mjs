import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../www/dsr-completion-policy.js');

const STOCK_CATS = [{ id: 'tw_watch' }, { id: 'tw_clock' }, { id: 'he_watch' }];
const TASK_LIST = [{ id: 'greet' }, { id: 'demo' }, { id: 'callback' }];
const CTX = { stockCategories: STOCK_CATS, taskList: TASK_LIST };

function emptyRecord(over) {
  return Object.assign({
    date: '2026-08-04',
    staffName: 'Asha',
    submitted: false,
    opening: { tw_watch: '', tw_clock: '', he_watch: '' },
    closing: { tw_watch: '', tw_clock: '', he_watch: '' },
    tasks: { greet: '', demo: '', callback: '' },
    cleaning: { cp1: { done: false, photo: '' }, cp2: { done: false, photo: '' } },
    inout: [],
    sales: [],
    d4NoSales: null
  }, over || {});
}

function fullRecord() {
  return emptyRecord({
    opening: { tw_watch: '10', tw_clock: '4', he_watch: '7' },
    closing: { tw_watch: '9', tw_clock: '4', he_watch: '6' },
    tasks: { greet: '3', demo: '2', callback: '1' },
    cleaning: { cp1: { done: true, photo: 'p1' }, cp2: { done: true, photo: 'p2' } },
    inout: [{ type: 'in', at: '09:58:00' }],
    sales: [{ billNo: 'B1', amount: 2500 }]
  });
}

test('an empty record reports zero complete — no hardcoded floor', () => {
  const summary = policy.completionSummary(emptyRecord(), CTX);
  assert.equal(summary.done, 0);
  assert.equal(summary.percent, 0);
  // The five previously-hardcoded sections must not all read complete.
  const status = summary.status;
  assert.equal(status.daystart, policy.INCOMPLETE);
  assert.equal(status.inout, policy.INCOMPLETE);
});

test('nonpurch and marketing are not applicable and leave the denominator', () => {
  const summary = policy.completionSummary(emptyRecord(), CTX);
  assert.equal(summary.status.nonpurch, policy.NOT_APPLICABLE);
  assert.equal(summary.status.marketing, policy.NOT_APPLICABLE);
  assert.equal(summary.total, 7);
});

test('a day with recorded sales reaches one hundred percent', () => {
  const summary = policy.completionSummary(fullRecord(), CTX);
  assert.equal(summary.done, 7);
  assert.equal(summary.total, 7);
  assert.equal(summary.percent, 100);
});

/* Owner ruling 2026-08-04: an empty sales list must be affirmed, not assumed. */

test('an empty sales list is incomplete until it is acknowledged', () => {
  const rec = fullRecord();
  rec.sales = [];
  assert.equal(policy.sectionStatus(rec, CTX).sales, policy.INCOMPLETE);
  assert.equal(policy.completionSummary(rec, CTX).done, 6);

  rec.d4NoSales = { at: '18:40:00', by: 'Asha' };
  assert.equal(policy.sectionStatus(rec, CTX).sales, policy.COMPLETE);
  assert.equal(policy.completionSummary(rec, CTX).done, 7);
  assert.equal(policy.completionSummary(rec, CTX).percent, 100);
});

test('submit is refused on an unacknowledged zero-sale day and names why', () => {
  const rec = fullRecord();
  rec.sales = [];
  const missing = policy.missingForSubmit(rec, CTX);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /^Sales — /);
  assert.match(missing[0], /confirm there were no sales today/);

  rec.d4NoSales = { at: '18:40:00', by: 'Asha' };
  assert.deepEqual(policy.missingForSubmit(rec, CTX), []);
});

test('recorded sales need no acknowledgement', () => {
  const rec = fullRecord();
  assert.equal(rec.sales.length, 1);
  assert.equal(rec.d4NoSales, null);
  assert.equal(policy.sectionStatus(rec, CTX).sales, policy.COMPLETE);
  assert.deepEqual(policy.missingForSubmit(rec, CTX), []);
});

test('a malformed acknowledgement does not satisfy the rule', () => {
  for (const ack of [true, 'yes', {}, { by: 'Asha' }, { at: '' }, []]) {
    const rec = fullRecord();
    rec.sales = [];
    rec.d4NoSales = ack;
    assert.equal(policy.noSalesAcknowledged(rec), false,
      `${JSON.stringify(ack)} must not count as an acknowledgement`);
    assert.equal(policy.sectionStatus(rec, CTX).sales, policy.INCOMPLETE);
  }
});

test('a sealed day is not retroactively failed by the new rule', () => {
  // Records submitted before this rule existed carry no acknowledgement and
  // never can; the meter must not mark closed evidence incomplete.
  const legacy = fullRecord();
  legacy.sales = [];
  delete legacy.d4NoSales;
  legacy.submitted = true;
  assert.equal(policy.sectionStatus(legacy, CTX).sales, policy.COMPLETE);

  // Reopening the day re-arms the requirement.
  legacy.submitted = false;
  assert.equal(policy.sectionStatus(legacy, CTX).sales, policy.INCOMPLETE);
});

test('day start is incomplete until an in entry exists', () => {
  const before = policy.sectionStatus(emptyRecord(), CTX);
  assert.equal(before.daystart, policy.INCOMPLETE);
  const after = policy.sectionStatus(emptyRecord({ inout: [{ type: 'in' }] }), CTX);
  assert.equal(after.daystart, policy.COMPLETE);
});

test('a dangling out entry keeps the in/out section incomplete', () => {
  const dangling = policy.sectionStatus(
    emptyRecord({ inout: [{ type: 'in' }, { type: 'out' }] }), CTX);
  assert.equal(dangling.inout, policy.INCOMPLETE);
  const resolved = policy.sectionStatus(
    emptyRecord({ inout: [{ type: 'in' }, { type: 'out' }, { type: 'in' }] }), CTX);
  assert.equal(resolved.inout, policy.COMPLETE);
});

test('partial stock entry does not count the section as complete', () => {
  const rec = emptyRecord({ opening: { tw_watch: '10', tw_clock: '', he_watch: '7' } });
  assert.equal(policy.sectionStatus(rec, CTX).opening, policy.INCOMPLETE);
});

test('a zero count is entered data, not missing data', () => {
  const rec = emptyRecord({ opening: { tw_watch: '0', tw_clock: '0', he_watch: '0' } });
  assert.equal(policy.sectionStatus(rec, CTX).opening, policy.COMPLETE);
});

test('cleaning requires photos, matching the submit gate', () => {
  const doneOnly = emptyRecord({
    cleaning: { cp1: { done: true, photo: '' }, cp2: { done: true, photo: '' } }
  });
  // The old meter checked only .done and would have called this complete.
  assert.equal(policy.sectionStatus(doneOnly, CTX).cleaning, policy.INCOMPLETE);
  assert.ok(policy.missingForSubmit(doneOnly, CTX).some(m => /Checkpoint 1/.test(m)));
});

test('the meter and the submit gate cannot disagree', () => {
  const cases = [
    emptyRecord(),
    fullRecord(),
    emptyRecord({ opening: { tw_watch: '1', tw_clock: '1', he_watch: '1' } }),
    emptyRecord({ cleaning: { cp1: { done: true, photo: 'p' }, cp2: { done: true, photo: '' } } })
  ];
  for (const rec of cases) {
    const summary = policy.completionSummary(rec, CTX);
    const missing = policy.missingForSubmit(rec, CTX);
    const meterComplete = summary.done === summary.total;
    assert.equal(meterComplete, missing.length === 0,
      'meter says ' + summary.done + '/' + summary.total + ' but gate lists ' + missing.length);
  }
});

test('submit refusal names each missing section', () => {
  const missing = policy.missingForSubmit(emptyRecord(), CTX);
  assert.equal(missing.length, 6);
  assert.ok(missing.every(line => typeof line === 'string' && line.length > 0));
  assert.ok(missing.some(m => /Opening stock/.test(m)));
  assert.ok(missing.some(m => /^Sales — /.test(m)));
  assert.ok(missing.some(m => /Daily task counts/.test(m)));
  assert.ok(missing.some(m => /Checkpoint 1/.test(m)));
  assert.ok(missing.some(m => /Checkpoint 2/.test(m)));
  assert.ok(missing.some(m => /Closing stock/.test(m)));
});

test('carried opening values are attributed to the prior closing date', () => {
  const prev = { date: '2026-08-03', closing: { tw_watch: '9', tw_clock: '4', he_watch: '6' } };
  const rec = emptyRecord({ opening: { tw_watch: '9', tw_clock: '4', he_watch: '2' } });
  const carried = policy.carriedOpeningFields(rec, prev, STOCK_CATS);
  assert.deepEqual(carried, { tw_watch: '2026-08-03', tw_clock: '2026-08-03' });
  // he_watch was edited away from the carried 6, so it is no longer attributed.
  assert.equal(carried.he_watch, undefined);
});

test('carry-forward attribution is skipped once the day is submitted', () => {
  const prev = { date: '2026-08-03', closing: { tw_watch: '9' } };
  const rec = emptyRecord({ submitted: true, opening: { tw_watch: '9' } });
  assert.deepEqual(policy.carriedOpeningFields(rec, prev, STOCK_CATS), {});
});

test('policy tolerates malformed records without throwing', () => {
  for (const bad of [null, undefined, {}, { opening: null, tasks: 7, inout: 'x' }]) {
    assert.doesNotThrow(() => policy.completionSummary(bad, CTX));
    assert.doesNotThrow(() => policy.missingForSubmit(bad, CTX));
    assert.doesNotThrow(() => policy.carriedOpeningFields(bad, null, STOCK_CATS));
  }
  assert.doesNotThrow(() => policy.completionSummary(fullRecord(), null));
});
