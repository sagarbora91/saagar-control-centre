import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const policy = require('../www/service-workboard-policy.js');
const persistence = require('../www/service-persistence.js');

const at = '2026-07-30T10:00:00.000Z';

test('D3 canonical stages preserve legacy Service rows and derive pickup-overdue', () => {
  assert.equal(policy.canonicalStage({ stage: 'awaiting_approval', status: 'open' }), 'estimate_waiting');
  assert.equal(policy.canonicalStage({ stage: 'in_progress', status: 'open' }), 'repair');
  assert.equal(policy.canonicalStage({ stage: 'ready', status: 'closed' }), 'delivered');
  assert.equal(
    policy.laneFor({ stage: 'ready', status: 'open', expDel: '2026-07-29' }, { asOf: '2026-07-30' }),
    'pickup_overdue'
  );
  assert.equal(
    policy.laneFor({ stage: 'ready', status: 'open', expDel: '2026-07-30' }, { asOf: '2026-07-30' }),
    'ready'
  );
});

test('D3 transition policy distinguishes normal flow, readiness refresh and override', () => {
  assert.deepEqual(
    policy.transitionRequirement({ stage: 'received', status: 'open' }, 'repair'),
    {
      ok: true,
      code: 'NORMAL',
      from: 'received',
      to: 'repair',
      readinessRequired: false,
      overrideRequired: false
    }
  );
  assert.equal(
    policy.transitionRequirement({ stage: 'ready', status: 'open' }, 'repair').overrideRequired,
    true
  );
  assert.equal(
    policy.transitionRequirement({ stage: 'ready', status: 'open' }, 'ready').code,
    'READINESS_REFRESH'
  );
  assert.equal(
    policy.transitionRequirement({ stage: 'ready', status: 'closed' }, 'repair').code,
    'CASE_CLOSED'
  );
  assert.equal(
    policy.transitionRequirement({ stage: 'received', status: 'open' }, 'unknown').code,
    'TARGET_INVALID'
  );
});

test('D3 readiness requires condition, payment, promise, notification, actor and time', () => {
  const valid = {
    conditionConfirmed: true,
    paymentStatus: 'pay_at_pickup',
    promisedDate: '2026-08-01',
    notificationStatus: 'pending',
    actor: 'Service Adviser',
    at
  };
  assert.equal(policy.validateReadiness({}, valid).ok, true);
  for (const [field, code] of [
    ['conditionConfirmed', 'CONDITION_REQUIRED'],
    ['paymentStatus', 'PAYMENT_STATUS_REQUIRED'],
    ['promisedDate', 'PROMISED_DATE_REQUIRED'],
    ['notificationStatus', 'NOTIFICATION_STATUS_REQUIRED'],
    ['actor', 'ACTOR_REQUIRED'],
    ['at', 'READINESS_TIME_REQUIRED']
  ]) {
    const invalid = { ...valid };
    delete invalid[field];
    assert.equal(policy.validateReadiness({}, invalid).code, code);
  }
});

test('D3 transition plans fail closed on overrides and emit bounded metadata audit', () => {
  const record = { id: 'WS-2026-001', stage: 'ready', status: 'open', expDel: '2026-08-01' };
  assert.equal(
    policy.planTransition(record, 'repair', { actor: 'Manager', reason: 'Rework', at }).code,
    'OVERRIDE_APPROVAL_REQUIRED'
  );
  assert.equal(
    policy.planTransition(record, 'repair', { actor: 'Manager', at, overrideApproved: true }).code,
    'OVERRIDE_REASON_REQUIRED'
  );
  const approved = policy.planTransition(record, 'repair', {
    actor: 'Manager',
    reason: 'Customer reported the issue persists',
    at,
    overrideApproved: true
  });
  assert.equal(approved.ok, true);
  assert.deepEqual(approved.audit, {
    from: 'ready',
    to: 'repair',
    at,
    actor: 'Manager',
    reason: 'Customer reported the issue persists',
    reasonCode: 'OVERRIDE',
    override: true
  });
  assert.doesNotMatch(JSON.stringify(approved.audit), /9876543210|mobile|diagnosis/i);
});

test('D3 on-hold transitions require an operational reason', () => {
  const record = { id: 'WS-2026-001', stage: 'repair', status: 'open' };
  assert.equal(
    policy.planTransition(record, 'on_hold', { actor: 'Adviser', at }).code,
    'HOLD_REASON_REQUIRED'
  );
  const planned = policy.planTransition(record, 'on_hold', {
    actor: 'Adviser',
    reason: 'Awaiting a replacement part',
    at
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.audit.reason, 'Awaiting a replacement part');
});
test('D3 ready transition persists a normalized readiness snapshot', () => {
  const record = { id: 'WS-2026-001', stage: 'repair', status: 'open', expDel: '2026-08-01' };
  const plan = policy.planTransition(record, 'ready', {
    actor: 'Technician',
    at,
    readiness: {
      conditionConfirmed: true,
      paymentStatus: 'estimate_approved',
      promisedDate: '2026-08-01',
      notificationStatus: 'notified'
    }
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.readiness.checkedBy, 'Technician');
  assert.equal(plan.readiness.checkedAt, at);
  assert.equal(policy.readinessValid({ ...record, stage: 'ready', d3Readiness: plan.readiness }), true);
  assert.equal(policy.readinessValid({ ...record, stage: 'ready', d3Readiness: null }), false);
});

test('D3 customer status wording is fixed and excludes internal or customer data', () => {
  const record = {
    stage: 'repair',
    custName: 'Private Customer',
    custMobile: '9876543210',
    diagnosis: 'Internal diagnosis',
    condNotes: 'Internal condition note',
    estTotal: '12500'
  };
  const status = policy.customerSafeStatus(record);
  assert.equal(status.stage, 'repair');
  assert.match(status.text, /currently under service or repair/i);
  assert.doesNotMatch(JSON.stringify(status), /Private Customer|9876543210|Internal|12500/);
});

test('D3 exceptions are deterministic, exact-repeat only and PII-minimized', () => {
  const cases = [
    {
      id: 'WS-2026-001',
      status: 'closed',
      stage: 'ready',
      dateRec: '2026-06-01',
      custMobile: '9876543210',
      serialNo: 'SER-1',
      custName: 'Must not leak'
    },
    {
      id: 'WS-2026-002',
      status: 'open',
      stage: 'ready',
      dateRec: '2026-07-01',
      expDel: '2026-07-29',
      custMobile: '+91 98765 43210',
      serialNo: 'ser-1',
      custName: 'Private Name',
      watchPhoto: false,
      advisor: 'Adviser',
      d3Readiness: { notificationStatus: 'pending' }
    },
    {
      id: 'WS-2026-003',
      status: 'open',
      stage: 'repair',
      dateRec: '2026-07-02',
      expDel: '2026-07-28',
      custMobile: '9999999999',
      serialNo: 'OTHER',
      watchPhoto: true
    }
  ];
  const exceptions = policy.buildExceptions(cases, { asOf: '2026-07-30' });
  assert.deepEqual(
    exceptions.map(item => item.code),
    [
      'SERVICE_OVERDUE',
      'PICKUP_OVERDUE',
      'READY_NOTIFICATION_PENDING',
      'RECEIVED_PHOTO_MISSING',
      'REPEAT_REPAIR_REVIEW'
    ]
  );
  assert.ok(exceptions.every(item => item.caseId && item.code && item.severity));
  assert.doesNotMatch(JSON.stringify(exceptions), /Private Name|Must not leak|9876543210|9999999999/);
});

test('D3 repeat repair requires exact complete mobile and exact item identity', () => {
  const base = {
    id: 'WS-1',
    status: 'closed',
    dateRec: '2026-07-01',
    custMobile: '9876543210',
    brand: 'Titan',
    model: 'Edge'
  };
  const fuzzy = [
    base,
    { ...base, id: 'WS-2', status: 'open', dateRec: '2026-07-02', model: 'Edge XL' },
    { ...base, id: 'WS-3', status: 'open', dateRec: '2026-07-03', custMobile: '987654321' }
  ];
  assert.ok(
    policy.buildExceptions(fuzzy, { asOf: '2026-07-30' })
      .every(item => item.code !== 'REPEAT_REPAIR_REVIEW')
  );
  const exact = [...fuzzy, { ...base, id: 'WS-4', status: 'open', dateRec: '2026-07-04' }];
  assert.ok(
    policy.buildExceptions(exact, { asOf: '2026-07-30' })
      .some(item => item.caseId === 'WS-4' && item.code === 'REPEAT_REPAIR_REVIEW')
  );
});

test('D3 workboard uses stable lanes and carries no customer PII', () => {
  const board = policy.buildWorkboard([
    {
      id: 'WS-2',
      status: 'open',
      stage: 'awaiting_approval',
      expDel: '2026-08-02',
      brand: 'Titan',
      model: 'Edge',
      advisor: 'Adviser',
      custName: 'Private',
      custMobile: '9876543210',
      watchPhoto: true
    },
    {
      id: 'WS-1',
      status: 'open',
      stage: 'received',
      expDel: '2026-08-01',
      watchPhoto: true
    },
    {
      id: 'WS-3',
      status: 'closed',
      stage: 'ready',
      expDel: '2026-07-29'
    }
  ], { asOf: '2026-07-30' });
  assert.deepEqual(board.laneOrder, [
    'received',
    'estimate_waiting',
    'repair',
    'ready',
    'pickup_overdue',
    'on_hold'
  ]);
  assert.equal(board.lanes.received[0].caseId, 'WS-1');
  assert.equal(board.lanes.estimate_waiting[0].caseId, 'WS-2');
  assert.equal(board.lanes.delivered, undefined);
  assert.doesNotMatch(JSON.stringify(board), /Private|9876543210/);
});

test('D3 persistence owns exactly one write and returns false without mutating input', () => {
  const cases = [{ id: 'WS-1', stage: 'repair', d3Transitions: [] }];
  const snapshot = structuredClone(cases);
  const writes = [];
  assert.equal(
    persistence.commit({ setItem: (key, value) => writes.push({ key, value }) }, 'saagar_wsf_v2', cases),
    true
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, 'saagar_wsf_v2');
  assert.deepEqual(JSON.parse(writes[0].value), cases);
  assert.deepEqual(cases, snapshot);

  const failed = persistence.commit({
    setItem: () => {
      throw new Error('disk full');
    }
  }, 'saagar_wsf_v2', cases);
  assert.equal(failed, false);
  assert.deepEqual(cases, snapshot);
});
