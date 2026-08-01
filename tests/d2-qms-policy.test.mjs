import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const policy = require('../www/qms-policy.js');
const persistence = require('../www/qms-persistence.js');

test('D2 duplicate suggestions are exact-mobile, same-day, scoped, complete and PII-minimised', () => {
  const candidates = [
    {
      id: 'closed',
      queueNo: 'Q-001',
      mobile: '9876543210',
      name: 'Must not leak',
      entryTime: '2026-07-30T09:00:00.000Z',
      status: 'Closed',
      outcome: 'Purchase',
      storeCode: 'WLMHW'
    },
    {
      id: 'open',
      queueNo: 'Q-002',
      mobile: '+91 98765 43210',
      name: 'Must not leak either',
      entryTime: '2026-07-30T10:00:00.000Z',
      status: 'Allocated',
      storeCode: 'WLMHW'
    },
    {
      id: 'old',
      queueNo: 'Q-099',
      mobile: '9876543210',
      entryTime: '2026-07-29T10:00:00.000Z',
      status: 'Closed',
      outcome: 'Non Purchase',
      storeCode: 'WLMHW'
    },
    {
      id: 'other-store',
      queueNo: 'Q-003',
      mobile: '9876543210',
      entryTime: '2026-07-30T11:00:00.000Z',
      status: 'New Entry',
      storeCode: 'HEMW'
    }
  ];
  const snapshot = structuredClone(candidates);
  const suggestions = policy.duplicateSuggestions(
    { mobile: '+91-98765-43210' },
    candidates,
    { asOf: '2026-07-30', storeCode: 'WLMHW' }
  );

  assert.deepEqual(suggestions.map(item => item.candidateId), ['open', 'closed']);
  assert.deepEqual(suggestions.map(item => item.kind), ['SAME_DAY_OPEN', 'SAME_DAY_CLOSED']);
  assert.ok(suggestions.every(item => item.reasonCodes[0] === 'EXACT_MOBILE'));
  assert.ok(suggestions.every(item => !item.decisionCodes.includes('MERGE')));
  assert.doesNotMatch(JSON.stringify(suggestions), /9876543210|Must not leak/);
  assert.deepEqual(candidates, snapshot);
});

test('D2 duplicate suggestions never use no-mobile, historical or fuzzy identity matches', () => {
  const records = [{
    id: 'same-name',
    queueNo: 'Q-001',
    mobile: '',
    name: 'Same Name',
    dob: '1990-01-01',
    entryTime: '2026-07-30T09:00:00.000Z',
    status: 'New Entry'
  }];
  assert.deepEqual(
    policy.duplicateSuggestions({ mobile: '', name: 'Same Name', dob: '1990-01-01' }, records, { asOf: '2026-07-30' }),
    []
  );
  assert.deepEqual(
    policy.duplicateSuggestions({ mobile: '9876543210' }, [{ ...records[0], mobile: '9876543210', entryTime: '2026-07-29T09:00:00.000Z' }], { asOf: '2026-07-30' }),
    []
  );
});

test('D2 duplicate gate requires an explicit matching create-separate review and has no merge path', () => {
  const suggestions = [
    { candidateId: 'cust_1' },
    { candidateId: 'cust_2' }
  ];
  assert.equal(policy.duplicateGate(suggestions, {}).canCreate, false);
  assert.equal(
    policy.duplicateGate(suggestions, { action: 'CREATE_SEPARATE', candidateIds: ['cust_1'] }).canCreate,
    false
  );
  assert.equal(
    policy.duplicateGate(suggestions, { action: 'MERGE', candidateIds: ['cust_1', 'cust_2'] }).canCreate,
    false
  );
  const reviewed = policy.duplicateGate(suggestions, {
    action: 'CREATE_SEPARATE',
    candidateIds: ['cust_2', 'cust_1']
  });
  assert.equal(reviewed.canCreate, true);
  assert.deepEqual(reviewed.audit, {
    decisionCode: 'CREATE_SEPARATE',
    candidateIds: ['cust_1', 'cust_2'],
    candidateCount: 2
  });
  assert.equal(policy.duplicateGate([], {}).canCreate, true);
});

test('D2 duplicate gate does not silently cap the reviewed candidate set', () => {
  const records = Array.from({ length: 9 }, (_, index) => ({
    id: `cust_${index}`,
    queueNo: `Q-${index}`,
    mobile: '9876543210',
    entryTime: `2026-07-30T${String(index).padStart(2, '0')}:00:00.000Z`,
    status: 'Closed',
    outcome: 'Non Purchase'
  }));
  assert.equal(
    policy.duplicateSuggestions({ mobile: '9876543210' }, records, { asOf: '2026-07-30' }).length,
    9
  );
});

test('D2 reason catalog uses stable codes, maps legacy labels and never maps unknown to Other', () => {
  assert.equal(policy.normalizeReason('lost', 'Price').code, 'PRICE_ISSUE');
  assert.equal(policy.normalizeReason('lost', 'Out of Stock').code, 'STOCK_UNAVAILABLE');
  assert.equal(policy.normalizeReason('lost', 'Comparing').code, 'COMPETITOR_COMPARISON');
  assert.equal(policy.normalizeReason('lost', 'Unrecognised historical value').code, 'LEGACY_UNMAPPED');
  assert.notEqual(policy.normalizeReason('lost', 'Unrecognised historical value').code, 'OTHER');
  assert.equal(new Set(policy.reasonOptions('lost').map(item => item.code)).size, policy.reasonOptions('lost').length);
  assert.equal(new Set(policy.reasonOptions('conversion').map(item => item.code)).size, policy.reasonOptions('conversion').length);
});

test('D2 outcome validation requires purchase/lost reasons, preserves Service semantics and bounds Other detail', () => {
  assert.equal(policy.validateOutcome('Purchase', {}).code, 'CONVERSION_REASON_REQUIRED');
  assert.equal(
    policy.validateOutcome('Purchase', { conversionReasonCode: 'CUSTOMER_NEED_MET' }).ok,
    true
  );
  assert.equal(policy.validateOutcome('Service', {}).ok, true);
  assert.equal(policy.validateOutcome('Non Purchase', {}).code, 'LOST_REASON_REQUIRED');
  assert.equal(
    policy.validateOutcome('Non Purchase', { lostReasonCode: 'OTHER', reasonDetail: '' }).code,
    'OTHER_DETAIL_REQUIRED'
  );
  assert.equal(
    policy.validateOutcome('Converted', { conversionReasonCode: 'OTHER', reasonDetail: 'x'.repeat(241) }).code,
    'REASON_DETAIL_TOO_LONG'
  );
});

test('D2 follow-up priority is explicit-date, deterministic and returns no customer PII', () => {
  const rows = [
    {
      id: 'future-low',
      customerName: 'Do not return',
      mobile: '9876543210',
      dueDate: '2026-08-02',
      expectedValue: 1000,
      lastContactAt: '2026-07-29T10:00:00.000Z',
      croId: 'cro_1',
      createdAt: '2026-07-20T00:00:00.000Z'
    },
    {
      id: 'overdue-low',
      dueDate: '2026-07-28',
      expectedValue: 1000,
      lastContactAt: '2026-07-29T10:00:00.000Z',
      croId: 'cro_1',
      createdAt: '2026-07-20T00:00:00.000Z'
    },
    {
      id: 'overdue-high',
      dueDate: '2026-07-28',
      expectedValue: 50000,
      lastContactAt: null,
      croId: '',
      createdAt: '2026-07-21T00:00:00.000Z'
    },
    {
      id: 'missing-due',
      dueDate: '',
      createdAt: '2026-07-22T00:00:00.000Z'
    }
  ];
  const snapshot = structuredClone(rows);
  const first = policy.prioritizeFollowups(rows, { asOf: '2026-07-30' });
  const second = policy.prioritizeFollowups(rows, { asOf: '2026-07-30' });

  assert.deepEqual(first.map(item => item.id), ['missing-due', 'overdue-high', 'overdue-low', 'future-low']);
  assert.deepEqual(first, second);
  assert.equal(first[0].priority.dueCode, 'DUE_DATE_MISSING');
  assert.match(first[1].priority.reasonLabels.join(' '), /₹50,000 expected/);
  assert.match(first[1].priority.reasonLabels.join(' '), /No contact recorded/);
  assert.match(first[1].priority.reasonLabels.join(' '), /Unassigned/);
  assert.doesNotMatch(JSON.stringify(first), /Do not return|9876543210/);
  assert.deepEqual(rows, snapshot);
  assert.equal(policy.followupPriority(rows[0], {}).code, 'AS_OF_REQUIRED');
});

test('D2 follow-up tie-breaks use value, contact, owner, created time and ASCII id', () => {
  const base = {
    dueDate: '2026-07-30',
    expectedValue: 10000,
    lastContactAt: '2026-07-29T00:00:00.000Z',
    croId: 'cro_1',
    createdAt: '2026-07-20T00:00:00.000Z'
  };
  const rows = [
    { ...base, id: 'z-assigned' },
    { ...base, id: 'a-unassigned', croId: '' },
    { ...base, id: 'older-contact', lastContactAt: '2026-07-20T00:00:00.000Z' },
    { ...base, id: 'high-value', expectedValue: 50000 }
  ];
  assert.deepEqual(
    policy.prioritizeFollowups(rows, { asOf: '2026-07-30' }).map(item => item.id),
    ['high-value', 'older-contact', 'a-unassigned', 'z-assigned']
  );
});

test('D2 persistence writes once with the final audit already present', () => {
  const writes = [];
  const storage = {
    setItem(key, value) {
      writes.push({ key, value });
    }
  };
  const state = { customers: [{ id: 'cust_1' }], audit: [{ id: 'older' }] };
  const audit = { id: 'new', action: 'customer.create' };

  assert.equal(persistence.commit(storage, 'retail_queue_management_v1', state, audit, 600), true);
  assert.equal(writes.length, 1);
  const stored = JSON.parse(writes[0].value);
  assert.deepEqual(stored.audit.map(item => item.id), ['new', 'older']);
  assert.deepEqual(state.audit.map(item => item.id), ['new', 'older']);
});

test('D2 persistence failure returns false, leaves audit unchanged and emits no false second write', () => {
  let writes = 0;
  const storage = {
    setItem() {
      writes += 1;
      throw new Error('quota');
    }
  };
  const state = { customers: [{ id: 'cust_1' }], audit: [{ id: 'older' }] };
  assert.equal(
    persistence.commit(storage, 'retail_queue_management_v1', state, { id: 'new' }, 600),
    false
  );
  assert.equal(writes, 1);
  assert.deepEqual(state.audit, [{ id: 'older' }]);
});
test('D2 duplicate gate fails closed when a legacy suggestion has no stable id', () => {
  const result = policy.duplicateGate(
    [{ candidateId: '' }],
    { action: 'CREATE_SEPARATE', candidateIds: [] }
  );
  assert.equal(result.canCreate, false);
});
test('D2 uses the India business day across the UTC midnight boundary', () => {
  assert.equal(policy.indiaBusinessDate('2026-07-29T20:00:00.000Z'), '2026-07-30');
  const suggestions = policy.duplicateSuggestions(
    { mobile: '9876543210' },
    [{
      id: 'after-midnight-ist',
      queueNo: 'Q-001',
      mobile: '9876543210',
      entryTime: '2026-07-29T20:00:00.000Z',
      status: 'New Entry'
    }],
    { asOf: '2026-07-30' }
  );
  assert.equal(suggestions.length, 1);
  const priority = policy.followupPriority({
    dueDate: '2026-07-30',
    lastContactAt: '2026-07-29T20:00:00.000Z'
  }, { asOf: '2026-07-30' });
  assert.match(priority.reasonLabels.join(' '), /Contact logged today/);
});