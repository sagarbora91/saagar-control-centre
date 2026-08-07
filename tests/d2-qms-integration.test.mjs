import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadModuleBundle } from './lib/module-bundle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');
const indexSource = fs.readFileSync(path.join(repoDir, 'www', 'index.html'), 'utf8');
const policySource = fs.readFileSync(path.join(repoDir, 'www', 'qms-policy.js'), 'utf8');
const persistenceSource = fs.readFileSync(path.join(repoDir, 'www', 'qms-persistence.js'), 'utf8');
const qmsModule = loadModuleBundle().find(module => module.id === 'qms');
const qms = qmsModule?.html || '';

function functionSource(name) {
  const token = `function ${name}(`;
  const start = qms.indexOf(token);
  assert.notEqual(start, -1, `${name} must exist in embedded QMS`);
  assert.equal(start, qms.lastIndexOf(token), `${name} must be unique in embedded QMS`);
  const end = qms.indexOf('\nfunction ', start + token.length);
  assert.notEqual(end, -1, `${name} must have a following function boundary`);
  return qms.slice(start, end);
}

const pendingIntakeKey = 'retail_queue_management_pending_intake_v1';

function createMemoryStorage(initial = {}) {
  const values = new Map(
    Object.entries(initial).map(([key, value]) => [String(key), String(value)])
  );
  const operations = [];
  return {
    operations,
    getItem(key) {
      const normalized = String(key);
      operations.push({ type: 'get', key: normalized });
      return values.has(normalized) ? values.get(normalized) : null;
    },
    setItem(key, value) {
      const normalized = String(key);
      const serialized = String(value);
      operations.push({ type: 'set', key: normalized, value: serialized });
      values.set(normalized, serialized);
    },
    removeItem(key) {
      const normalized = String(key);
      operations.push({ type: 'remove', key: normalized });
      values.delete(normalized);
    },
    value(key) {
      const normalized = String(key);
      return values.has(normalized) ? values.get(normalized) : null;
    }
  };
}

function installPendingIntake(context) {
  vm.createContext(context);
  vm.runInContext(
    `${functionSource('qmsPendingIntakeKey')};
     ${functionSource('qmsReadPendingIntake')};
     ${functionSource('qmsAcquirePendingIntake')};
     ${functionSource('qmsClearPendingIntake')};
     this.readPendingIntake = qmsReadPendingIntake;
     this.acquirePendingIntake = qmsAcquirePendingIntake;
     this.clearPendingIntake = qmsClearPendingIntake;`,
    context
  );
  return context;
}

test('D2 runtime controls load before the embedded QMS can be opened', () => {
  const policyAt = indexSource.indexOf('<script src="qms-policy.js"></script>');
  const persistenceAt = indexSource.indexOf('<script src="qms-persistence.js"></script>');
  const modulesAt = indexSource.indexOf('const MODULES =');
  assert.ok(policyAt >= 0);
  assert.ok(persistenceAt > policyAt);
  assert.ok(modulesAt > persistenceAt);
  assert.ok(qmsModule, 'QMS module must be present');
  assert.equal(qmsModule.bytes, qmsModule.actualBytes);
  assert.equal(qmsModule.sha256, qmsModule.actualSha256);
  assert.equal(qmsModule.bytes, Buffer.byteLength(qms, 'utf8'));
  assert.equal((qms.match(/D2-QMS-2026-07-30/g) || []).length, 1);
  assert.equal((qms.match(/D2-QMS-RESILIENCE-2026-07-30/g) || []).length, 1);
  assert.equal((qms.match(/D2-QMS-LEGAL-RETRY-2026-07-30/g) || []).length, 1);
  assert.equal((qms.match(/D2-QMS-ENTRY-RECOVERY-2026-07-30/g) || []).length, 1);
  assert.equal((qms.match(/D2-QMS-HARDENING-2026-07-30/g) || []).length, 1);
  assert.equal((qms.match(/D2-QMS-CLEANUP-2026-07-30/g) || []).length, 1);
});

test('D2 embedded save passes the final audit into one persistence commit and renders only on success', () => {
  const calls = [];
  let renders = 0;
  let restores = 0;
  const toasts = [];
  class FixedDate extends Date {
    constructor() {
      super('2026-07-30T10:00:00.000Z');
    }
  }
  const context = {
    Date: FixedDate,
    STORE_KEY: 'retail_queue_management_v1',
    localStorage: {},
    state: { customers: [{ id: 'cust_1' }], audit: [] },
    role: 'SM',
    uid: prefix => `${prefix}_fixed`,
    renderAll: () => { renders += 1; },
    qmsRestorePersistedState: () => { restores += 1; },
    toast: (message, type) => { toasts.push({ message, type }); },
    qmsPersistenceApi: () => ({
      commit(storage, key, state, audit, limit) {
        calls.push({ storage, key, state, audit, limit });
        return true;
      }
    })
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('save')}; this.runSave = save;`, context);

  assert.equal(context.runSave('customer.create', { queueNo: 'Q-001' }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'retail_queue_management_v1');
  assert.equal(calls[0].limit, 600);
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls[0].audit)),
    {
      id: 'aud_fixed',
      at: '2026-07-30T10:00:00.000Z',
      role: 'SM',
      action: 'customer.create',
      details: { queueNo: 'Q-001' }
    }
  );
  assert.equal(renders, 1);
  assert.equal(restores, 0);
  assert.deepEqual(toasts, []);
});

test('D2 embedded save fails closed, restores persisted state and emits no success render', () => {
  let renders = 0;
  let restores = 0;
  const toasts = [];
  const context = {
    Date,
    STORE_KEY: 'retail_queue_management_v1',
    localStorage: {},
    state: { customers: [{ id: 'phantom' }], audit: [] },
    role: 'SM',
    uid: () => 'aud_failed',
    renderAll: () => { renders += 1; },
    qmsRestorePersistedState: () => { restores += 1; },
    toast: (message, type) => { toasts.push({ message, type }); },
    qmsPersistenceApi: () => ({ commit: () => false })
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('save')}; this.runSave = save;`, context);

  assert.equal(context.runSave('customer.create', {}), false);
  assert.equal(restores, 1);
  assert.equal(renders, 0);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'error');
  assert.match(toasts[0].message, /previous saved data is unchanged/i);
});

test('D2 persisted-state recovery loads the saved snapshot before rendering it', () => {
  const calls = [];
  const context = {
    load: () => calls.push('load'),
    renderAll: () => calls.push('renderAll')
  };
  vm.createContext(context);
  vm.runInContext(
    `${functionSource('qmsRestorePersistedState')};
     this.runRestore = qmsRestorePersistedState;`,
    context
  );

  context.runRestore();
  assert.deepEqual(calls, ['load', 'renderAll']);
});

test('D2 failed pre-claim save restores typed fields and excludes mobile from audit details', () => {
  let fields = {
    pcCro: { value: 'cro_2' },
    pcName: { value: '  Priya Customer  ' },
    pcMobile: { value: '9876543210' },
    pcNote: { value: '  Requested blue dial  ' }
  };
  const state = { preclaims: [] };
  let saveCall = null;
  const toasts = [];
  const context = {
    Date,
    state,
    role: 'SM',
    guardWrite: () => true,
    $: id => fields[id] || null,
    findActivePreclaim: () => null,
    uid: () => 'pc_failed',
    todayISO: () => '2026-07-30',
    croName: () => 'CRO Two',
    save: (action, details) => {
      saveCall = { action, details: JSON.parse(JSON.stringify(details)) };
      state.preclaims = [];
      fields = {
        pcCro: { value: '' },
        pcName: { value: '' },
        pcMobile: { value: '' },
        pcNote: { value: '' }
      };
      return false;
    },
    toast: (message, type) => toasts.push({ message, type })
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('savePreclaim')}; this.runSavePreclaim = savePreclaim;`, context);

  context.runSavePreclaim();
  assert.deepEqual(saveCall, {
    action: 'preclaim.create',
    details: { croId: 'cro_2', croName: 'CRO Two' }
  });
  assert.equal(Object.hasOwn(saveCall.details, 'mobile'), false);
  assert.doesNotMatch(JSON.stringify(saveCall.details), /9876543210/);
  assert.deepEqual(
    Object.fromEntries(Object.entries(fields).map(([id, field]) => [id, field.value])),
    {
      pcCro: 'cro_2',
      pcName: 'Priya Customer',
      pcMobile: '9876543210',
      pcNote: 'Requested blue dial'
    }
  );
  assert.equal(state.preclaims.length, 0);
  assert.deepEqual(toasts, []);
});

test('D2 setting updates return persistence status and preserve rendered rollback on failure', () => {
  const state = { settings: { waitAlertMins: 20 } };
  const calls = [];
  let saveSucceeds = false;
  const context = {
    state,
    guardPast: () => true,
    requireSM: () => true,
    save: (action, details) => {
      calls.push({ action, details: JSON.parse(JSON.stringify(details)) });
      if (!saveSucceeds) state.settings.waitAlertMins = 20;
      return saveSucceeds;
    }
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('updateSetting')}; this.runUpdateSetting = updateSetting;`, context);

  assert.equal(context.runUpdateSetting('waitAlertMins', '30'), false);
  assert.equal(state.settings.waitAlertMins, 20);
  saveSucceeds = true;
  assert.equal(context.runUpdateSetting('waitAlertMins', '35'), true);
  assert.equal(state.settings.waitAlertMins, 35);
  assert.deepEqual(calls, [
    {
      action: 'settings.update',
      details: { key: 'waitAlertMins', value: 30 }
    },
    {
      action: 'settings.update',
      details: { key: 'waitAlertMins', value: 35 }
    }
  ]);
  assert.match(functionSource('updateSetting'), /return save\('settings\.update',\s*\{ key, value \}\)/);
});

test('D2 legal capture derives its idempotency operation from the pending customer id', () => {
  const customer = {
    id: 'cust_retry_000001',
    mobile: '9876543210',
    dob: '1990-01-01'
  };
  let request = null;
  const context = {
    role: 'SM',
    $: () => null,
    qmsLegalApi: () => ({
      captureIntake(input) {
        request = input;
        return { ok: true };
      }
    })
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('qmsLegalCapture')}; this.runLegalCapture = qmsLegalCapture;`, context);

  assert.equal(context.runLegalCapture(customer, false).ok, true);
  assert.equal(request.operationId, 'qms-intake:cust_retry_000001');
  assert.equal(request.scope, 'qms-intake');
  assert.equal(request.payload, customer);
  assert.match(
    functionSource('qmsLegalCapture'),
    /operationId:\s*'qms-intake:' \+ String\(c\.id \|\| ''\)/
  );
});

test('D2 pending intake token excludes PII and rejects a token that fails read-back verification', () => {
  class FixedDate extends Date {
    constructor() {
      super('2026-07-30T10:00:00.000Z');
    }
  }
  const storage = createMemoryStorage();
  const context = installPendingIntake({
    Date: FixedDate,
    localStorage: storage,
    state: { customers: [] },
    todayISO: () => '2026-07-30',
    uid: () => 'cust_retry_000001'
  });

  const acquired = context.acquirePendingIntake('Q-001');
  assert.equal(acquired.ok, true, JSON.stringify({ acquired, operations: storage.operations }));
  assert.equal(acquired.customerId, 'cust_retry_000001');
  const token = JSON.parse(storage.value(pendingIntakeKey));
  assert.deepEqual(Object.keys(token).sort(), [
    'businessDate',
    'createdAt',
    'customerId',
    'previewQueueNo',
    'version'
  ]);
  assert.equal(token.previewQueueNo, 'Q-001');
  assert.doesNotMatch(
    JSON.stringify(token),
    /Priya Customer|9876543210|customerName|mobile|dateOfBirth|\bdob\b|payload|consent/i
  );
  assert.equal(
    storage.operations.filter(operation => operation.type === 'get').length,
    2,
    'new token must be read once before write and once for verification'
  );

  const tamperedStorage = createMemoryStorage();
  const writeToken = tamperedStorage.setItem.bind(tamperedStorage);
  tamperedStorage.setItem = (key, value) => {
    const altered = JSON.parse(String(value));
    altered.customerId = 'cust_tampered_000002';
    writeToken(key, JSON.stringify(altered));
  };
  const tamperedContext = installPendingIntake({
    Date: FixedDate,
    localStorage: tamperedStorage,
    state: { customers: [] },
    todayISO: () => '2026-07-30',
    uid: () => 'cust_retry_000001'
  });
  const rejected = tamperedContext.acquirePendingIntake('Q-001');
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /retry-safe intake token could not be saved/i);
  assert.match(functionSource('qmsAcquirePendingIntake'), /const verified = qmsReadPendingIntake\(\)/);
  assert.match(functionSource('qmsAcquirePendingIntake'), /verified\.customerId !== token\.customerId/);
});

test('D2 pending intake ID bound matches the legal operation contract', () => {
  const acceptedId = `cust_${'a'.repeat(80)}`;
  const acceptedStorage = createMemoryStorage({
    [pendingIntakeKey]: JSON.stringify({
      version: 1,
      customerId: acceptedId,
      businessDate: '2026-07-30'
    })
  });
  const acceptedContext = installPendingIntake({ localStorage: acceptedStorage });
  assert.equal(acceptedContext.readPendingIntake().customerId, acceptedId);

  const rejectedId = `cust_${'a'.repeat(81)}`;
  const rejectedStorage = createMemoryStorage({
    [pendingIntakeKey]: JSON.stringify({
      version: 1,
      customerId: rejectedId,
      businessDate: '2026-07-30'
    })
  });
  let uidCalls = 0;
  const rejectedContext = installPendingIntake({
    localStorage: rejectedStorage,
    state: { customers: [] },
    todayISO: () => '2026-07-30',
    uid: () => {
      uidCalls += 1;
      return 'cust_fresh_000001';
    }
  });
  assert.throws(
    () => rejectedContext.readPendingIntake(),
    /Pending intake recovery data is invalid/
  );
  const rejected = rejectedContext.acquirePendingIntake('Q-001');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.message, 'Pending intake recovery data is invalid.');
  assert.equal(uidCalls, 0);
  assert.equal(JSON.parse(rejectedStorage.value(pendingIntakeKey)).customerId, rejectedId);
});

test('D2 pending intake reuses an unsaved id across a fresh VM and rotates an already-committed id', () => {
  class FixedDate extends Date {
    constructor() {
      super('2026-07-30T10:00:00.000Z');
    }
  }
  const sharedStorage = createMemoryStorage();
  let firstUidCalls = 0;
  const firstContext = installPendingIntake({
    Date: FixedDate,
    localStorage: sharedStorage,
    state: { customers: [] },
    todayISO: () => '2026-07-30',
    uid: () => {
      firstUidCalls += 1;
      return 'cust_shared_000001';
    }
  });
  const first = firstContext.acquirePendingIntake('Q-001');

  let freshVmUidCalls = 0;
  const freshContext = installPendingIntake({
    Date: FixedDate,
    localStorage: sharedStorage,
    state: { customers: [] },
    todayISO: () => '2026-07-30',
    uid: () => {
      freshVmUidCalls += 1;
      return 'cust_should_not_be_used';
    }
  });
  const reused = freshContext.acquirePendingIntake('Q-999');
  assert.equal(first.customerId, 'cust_shared_000001', JSON.stringify({ first, operations: sharedStorage.operations }));
  assert.equal(first.reused, false);
  assert.equal(reused.customerId, first.customerId);
  assert.equal(reused.reused, true);
  assert.equal(firstUidCalls, 1);
  assert.equal(freshVmUidCalls, 0);
  assert.equal(
    sharedStorage.operations.filter(operation => operation.type === 'set').length,
    1
  );

  const staleId = 'cust_stale_000001';
  const staleStorage = createMemoryStorage({
    [pendingIntakeKey]: JSON.stringify({
      version: 1,
      customerId: staleId,
      businessDate: '2026-07-30',
      previewQueueNo: 'Q-001',
      createdAt: '2026-07-30T09:00:00.000Z'
    })
  });
  const rotatedContext = installPendingIntake({
    Date: FixedDate,
    localStorage: staleStorage,
    state: { customers: [{ id: staleId }] },
    todayISO: () => '2026-07-30',
    uid: () => 'cust_fresh_000002'
  });
  const rotated = rotatedContext.acquirePendingIntake('Q-002');
  assert.equal(rotated.ok, true);
  assert.equal(rotated.reused, false);
  assert.equal(rotated.customerId, 'cust_fresh_000002');
  assert.equal(JSON.parse(staleStorage.value(pendingIntakeKey)).customerId, 'cust_fresh_000002');
});

test('D2 customer creation previews a queue number and advances it only after legal capture succeeds', () => {
  const source = functionSource('addCustomer');
  const reviewAt = source.indexOf('policy.duplicateGate');
  const previewAt = source.indexOf('queueNo: getQueueNo()');
  const legalAt = source.indexOf('qmsLegalCapture(c, noMobile)');
  const legalGateAt = source.indexOf('if (!legalResult.ok)');
  const nextAt = source.indexOf('c.queueNo = nextQueueNo()');
  const pushAt = source.indexOf('state.customers.push(c)');
  const saveAt = source.indexOf("if (!save('customer.create'");
  const clearAt = source.indexOf('clearEntryForm()');

  assert.ok(reviewAt >= 0);
  assert.ok(reviewAt < previewAt);
  assert.ok(previewAt < legalAt);
  assert.ok(legalAt < legalGateAt);
  assert.ok(legalGateAt < nextAt);
  assert.ok(nextAt < pushAt);
  assert.ok(pushAt < saveAt);
  assert.ok(saveAt < clearAt);
  assert.equal((source.match(/qmsLegalCapture\(/g) || []).length, 1);
  assert.equal((source.match(/nextQueueNo\(\)/g) || []).length, 1);
  assert.match(source, /action:\s*'CREATE_SEPARATE'/);
  assert.match(source, /duplicateReview/);
  assert.doesNotMatch(source, /duplicateReview[\s\S]*mobile:/);
});

test('D2 legal-capture exceptions leave queue sequence and customer state untouched', () => {
  const fields = {
    noMobileChk: { checked: true },
    custMobile: { value: '' },
    custName: { value: 'Test walk-in' },
    visitType: { value: 'Purchase' },
    customerType: { value: 'New' },
    custDob: { value: '' },
    custAnniv: { value: '' },
    productInterest: { value: '' },
    source: { value: 'Walk-in' },
    peopleCount: { value: '1' },
    priority: { value: 'Normal' },
    purpose: { value: '' }
  };
  let previews = 0;
  let acquisitions = 0;
  let increments = 0;
  let saves = 0;
  const toasts = [];
  const context = {
    Date,
    window: {},
    state: { customers: [] },
    role: 'SM',
    isPast: () => false,
    eodLockActive: () => false,
    $: id => fields[id] || null,
    uid: () => 'cust_preview',
    qmsCaptureEntryDraft: () => ({ values: {}, checks: {} }),
    getQueueNo: () => {
      previews += 1;
      return 'Q-001';
    },
    qmsAcquirePendingIntake: queueNo => {
      acquisitions += 1;
      assert.equal(queueNo, 'Q-001');
      return { ok: true, customerId: 'cust_preview_001' };
    },
    nextQueueNo: () => {
      increments += 1;
      return 'Q-001';
    },
    qmsLegalCapture: () => {
      throw new Error('legal storage unavailable');
    },
    save: () => {
      saves += 1;
      return true;
    },
    toast: (message, type) => toasts.push({ message, type })
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('addCustomer')}; this.runAddCustomer = addCustomer;`, context);

  context.runAddCustomer();
  assert.equal(previews, 1);
  assert.equal(acquisitions, 1);
  assert.equal(increments, 0);
  assert.equal(saves, 0);
  assert.equal(context.state.customers.length, 0);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'error');
  assert.match(toasts[0].message, /privacy evidence could not be saved/i);
});

test('D2 unreadable pending intake fails closed before legal capture or queue advancement', () => {
  const fields = {
    noMobileChk: { checked: true },
    custMobile: { value: '' },
    custName: { value: 'Unreadable token walk-in' },
    visitType: { value: 'Purchase' },
    customerType: { value: 'New' },
    custDob: { value: '' },
    custAnniv: { value: '' },
    productInterest: { value: '' },
    source: { value: 'Walk-in' },
    peopleCount: { value: '1' },
    priority: { value: 'Normal' },
    purpose: { value: '' }
  };
  const storage = createMemoryStorage({ [pendingIntakeKey]: '{not-json' });
  let uidCalls = 0;
  let legalCaptures = 0;
  let queueAdvances = 0;
  const toasts = [];
  const context = installPendingIntake({
    Date,
    localStorage: storage,
    window: {},
    state: { customers: [] },
    role: 'SM',
    todayISO: () => '2026-07-30',
    uid: () => {
      uidCalls += 1;
      return 'cust_unreadable_000001';
    },
    isPast: () => false,
    eodLockActive: () => false,
    $: id => fields[id] || null,
    qmsCaptureEntryDraft: () => ({ values: {}, checks: {} }),
    getQueueNo: () => 'Q-001',
    nextQueueNo: () => {
      queueAdvances += 1;
      return 'Q-001';
    },
    qmsLegalCapture: () => {
      legalCaptures += 1;
      return { ok: true };
    },
    toast: (message, type) => toasts.push({ message, type })
  });
  vm.runInContext(`${functionSource('addCustomer')}; this.runAddCustomer = addCustomer;`, context);

  context.runAddCustomer();
  assert.equal(uidCalls, 0);
  assert.equal(legalCaptures, 0);
  assert.equal(queueAdvances, 0);
  assert.equal(context.state.customers.length, 0);
  assert.equal(storage.value(pendingIntakeKey), '{not-json');
  assert.deepEqual(toasts, [{
    message: 'Pending intake recovery data is unreadable.',
    type: 'error'
  }]);
});

test('D2 QMS save retry preserves the token and form, then commits one queue number and clears the match', () => {
  class FixedDate extends Date {
    constructor() {
      super('2026-07-30T10:00:00.000Z');
    }
  }
  const initialValues = {
    custMobile: '9876543210',
    custName: 'Priya Customer',
    visitType: 'Purchase',
    customerType: 'Existing',
    custDob: '1990-01-01',
    custAnniv: '2020-02-02',
    productInterest: 'Blue dial watch',
    source: 'Referral',
    peopleCount: '3',
    priority: 'VIP',
    purpose: 'Anniversary purchase',
    allocCro: 'cro_7',
    qmsLegalAge: 'ADULT',
    qmsGuardianName: 'Guardian Name',
    qmsGuardianRelation: 'Parent',
    qmsGuardianMethod: 'Government ID'
  };
  const initialChecks = {
    noMobileChk: false,
    qmsGuardianConsent: true,
    qmsPromoConsent: true
  };
  const createFields = (values, checks) => ({
    ...Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }])),
    ...Object.fromEntries(Object.entries(checks).map(([id, checked]) => [id, { checked }]))
  });
  let fields = createFields(initialValues, initialChecks);
  const storage = createMemoryStorage();
  const state = { customers: [], settings: { queueSeq: 0 } };
  let uidCalls = 0;
  let queueAdvanceCalls = 0;
  let saveAttempts = 0;
  let clearEntryCalls = 0;
  let noMobileRefreshes = 0;
  let historyRefreshes = 0;
  const legalCustomerIds = [];
  const saveCalls = [];
  const toasts = [];
  const context = installPendingIntake({
    Date: FixedDate,
    localStorage: storage,
    window: {},
    state,
    role: 'SM',
    todayISO: () => '2026-07-30',
    uid: prefix => {
      assert.equal(prefix, 'cust');
      uidCalls += 1;
      return 'cust_retry_000001';
    },
    isPast: () => false,
    eodLockActive: () => false,
    $: id => fields[id] || null,
    qmsPolicyApi: () => ({ duplicateGate: () => ({ canCreate: true }) }),
    qmsDuplicateSuggestions: () => [],
    getQueueNo: () => `Q-${String(state.settings.queueSeq + 1).padStart(3, '0')}`,
    nextQueueNo: () => {
      queueAdvanceCalls += 1;
      state.settings.queueSeq += 1;
      return `Q-${String(state.settings.queueSeq).padStart(3, '0')}`;
    },
    qmsLegalCapture: customer => {
      legalCustomerIds.push(customer.id);
      return { ok: true };
    },
    manualAllocate: () => {},
    allocateCustomer: () => {},
    routeWithPreclaim: () => {},
    save: (action, details) => {
      saveAttempts += 1;
      saveCalls.push({ action, details: JSON.parse(JSON.stringify(details)) });
      if (saveAttempts === 1) {
        state.customers.length = 0;
        state.settings.queueSeq = 0;
        fields = createFields(
          Object.fromEntries(Object.keys(initialValues).map(id => [id, ''])),
          Object.fromEntries(Object.keys(initialChecks).map(id => [id, false]))
        );
        return false;
      }
      return true;
    },
    onNoMobileToggle: () => {
      noMobileRefreshes += 1;
    },
    showCustomerHistory: () => {
      historyRefreshes += 1;
    },
    clearEntryForm: () => {
      clearEntryCalls += 1;
    },
    toast: (message, type) => toasts.push({ message, type }),
    switchView: () => {}
  });
  vm.runInContext(
    `${functionSource('qmsCaptureEntryDraft')};
     ${functionSource('qmsRestoreEntryDraft')};
     ${functionSource('addCustomer')};
     this.runAddCustomer = addCustomer;`,
    context
  );

  context.runAddCustomer();
  const retainedToken = JSON.parse(storage.value(pendingIntakeKey));
  assert.equal(retainedToken.customerId, 'cust_retry_000001');
  assert.equal(uidCalls, 1);
  assert.equal(state.settings.queueSeq, 0);
  assert.equal(state.customers.length, 0);
  assert.equal(clearEntryCalls, 0);
  assert.equal(
    storage.operations.filter(operation => operation.type === 'remove').length,
    0
  );
  for (const [id, expected] of Object.entries(initialValues)) {
    assert.equal(fields[id].value, expected, `${id} must survive failed QMS save`);
  }
  for (const [id, expected] of Object.entries(initialChecks)) {
    assert.equal(fields[id].checked, expected, `${id} must survive failed QMS save`);
  }
  assert.equal(noMobileRefreshes, 1);
  assert.equal(historyRefreshes, 1);

  context.runAddCustomer();
  assert.equal(uidCalls, 1, 'retry must reuse the original pending customer id');
  assert.deepEqual(legalCustomerIds, ['cust_retry_000001', 'cust_retry_000001']);
  assert.equal(queueAdvanceCalls, 2, 'each staged attempt advances from the restored sequence');
  assert.equal(state.settings.queueSeq, 1, 'only the successful queue advance remains committed');
  assert.equal(state.customers.length, 1);
  assert.equal(state.customers[0].id, 'cust_retry_000001');
  assert.equal(state.customers[0].queueNo, 'Q-001');
  assert.deepEqual(saveCalls.map(call => call.details.queueNo), ['Q-001', 'Q-001']);
  assert.deepEqual(
    saveCalls.map(call => call.details.intakeOperationId),
    ['qms-intake:cust_retry_000001', 'qms-intake:cust_retry_000001']
  );
  assert.equal(storage.value(pendingIntakeKey), null);
  assert.deepEqual(
    storage.operations.filter(operation => operation.type === 'remove'),
    [{ type: 'remove', key: pendingIntakeKey }]
  );
  assert.equal(clearEntryCalls, 1);
  assert.match(functionSource('addCustomer'), /qmsRestoreEntryDraft\(entryDraft\)/);
  assert.ok(
    functionSource('addCustomer').indexOf('qmsRestoreEntryDraft(entryDraft)') >
      functionSource('addCustomer').indexOf("if (!save('customer.create'")
  );
  assert.deepEqual(toasts, [{ message: 'Q-001 added.', type: 'success' }]);
});

test('D2 idempotency conflict clears its matching token while mismatched tokens are preserved', () => {
  const fields = {
    noMobileChk: { checked: true },
    custMobile: { value: '' },
    custName: { value: 'Conflict walk-in' },
    visitType: { value: 'Purchase' },
    customerType: { value: 'New' },
    custDob: { value: '' },
    custAnniv: { value: '' },
    productInterest: { value: '' },
    source: { value: 'Walk-in' },
    peopleCount: { value: '1' },
    priority: { value: 'Normal' },
    purpose: { value: '' }
  };
  const storage = createMemoryStorage();
  let queueAdvances = 0;
  let saves = 0;
  const toasts = [];
  const context = installPendingIntake({
    Date,
    localStorage: storage,
    window: {},
    state: { customers: [] },
    role: 'SM',
    todayISO: () => '2026-07-30',
    uid: () => 'cust_conflict_000001',
    isPast: () => false,
    eodLockActive: () => false,
    $: id => fields[id] || null,
    qmsCaptureEntryDraft: () => ({ values: {}, checks: {} }),
    getQueueNo: () => 'Q-001',
    nextQueueNo: () => {
      queueAdvances += 1;
      return 'Q-001';
    },
    qmsLegalCapture: () => ({
      ok: false,
      code: 'IDEMPOTENCY_CONFLICT'
    }),
    save: () => {
      saves += 1;
      return true;
    },
    toast: (message, type) => toasts.push({ message, type })
  });
  vm.runInContext(`${functionSource('addCustomer')}; this.runAddCustomer = addCustomer;`, context);

  context.runAddCustomer();
  assert.equal(storage.value(pendingIntakeKey), null);
  assert.equal(queueAdvances, 0);
  assert.equal(saves, 0);
  assert.equal(context.state.customers.length, 0);
  assert.deepEqual(
    storage.operations.filter(operation => operation.type === 'remove'),
    [{ type: 'remove', key: pendingIntakeKey }]
  );
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'error');
  assert.match(toasts[0].message, /details changed after a partial attempt/i);

  const preservedId = 'cust_preserve_000001';
  const mismatchStorage = createMemoryStorage({
    [pendingIntakeKey]: JSON.stringify({
      version: 1,
      customerId: preservedId,
      businessDate: '2026-07-30',
      previewQueueNo: 'Q-007',
      createdAt: '2026-07-30T09:00:00.000Z'
    })
  });
  const mismatchContext = installPendingIntake({ localStorage: mismatchStorage });
  assert.equal(mismatchContext.clearPendingIntake('cust_other_000002'), true);
  assert.equal(JSON.parse(mismatchStorage.value(pendingIntakeKey)).customerId, preservedId);
  assert.equal(
    mismatchStorage.operations.filter(operation => operation.type === 'remove').length,
    0
  );
  assert.equal((functionSource('addCustomer').match(/qmsClearPendingIntake\(c\.id\)/g) || []).length, 3);
});

test('D2 embedded QMS resolves India business dates at the UTC midnight boundary', () => {
  const context = {
    Date,
    Number,
    state: {
      customers: [
        { id: 'ist-boundary', entryTime: '2026-07-29T20:00:00.000Z' },
        { id: 'prior-day', entryTime: '2026-07-29T18:00:00.000Z' },
        { id: 'explicit', businessDate: '2026-07-30', entryTime: '2026-07-28T18:00:00.000Z' }
      ]
    },
    viewAsOf: '2026-07-30'
  };
  vm.createContext(context);
  vm.runInContext(
    `${functionSource('indiaBusinessDateFromIso')};
     ${functionSource('customerBusinessDate')};
     ${functionSource('todaysCustomers')};
     this.businessDate = indiaBusinessDateFromIso;
     this.customersForToday = todaysCustomers;`,
    context
  );

  assert.equal(context.businessDate('2026-07-29T20:00:00.000Z'), '2026-07-30');
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.customersForToday().map(customer => customer.id))),
    ['ist-boundary', 'explicit']
  );
  assert.match(policySource, /function indiaBusinessDate\(/);
  assert.match(policySource, /normalizeDate\(candidate\.businessDate\)\s*\|\|\s*indiaBusinessDate/);
  assert.match(policySource, /dateOrdinal\(followup\.lastContactDate\)\s*\|\|/);
});

test('D2 history waits for a complete mobile and renders duplicate actions by numeric index only', () => {
  function runHistory(mobile, suggestions) {
    const fields = {
      custMobile: { value: mobile },
      historyBox: { innerHTML: '' },
      customerType: { value: 'New' }
    };
    let duplicateCalls = 0;
    const context = {
      window: { __qmsDuplicateSuggestions: [{ candidateId: 'stale' }] },
      state: { customers: [] },
      $: id => fields[id] || null,
      _qmsNorm10: value => {
        const digits = String(value || '').replace(/\D/g, '');
        return digits.length >= 10 ? digits.slice(-10) : '';
      },
      qmsDuplicateSuggestions: () => {
        duplicateCalls += 1;
        return suggestions;
      },
      esc: value => String(value ?? '').replace(/[&<>"]/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
      })[char]),
      fmtDT: value => String(value || ''),
      croName: () => '—',
      _qmsMaster: () => null
    };
    vm.createContext(context);
    vm.runInContext(`${functionSource('showCustomerHistory')}; this.runHistory = showCustomerHistory;`, context);
    context.runHistory();
    return { context, fields, duplicateCalls };
  }

  const partial = runHistory('9876', []);
  assert.equal(partial.duplicateCalls, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(partial.context.window.__qmsDuplicateSuggestions)),
    []
  );
  assert.match(partial.fields.historyBox.innerHTML, /full 10-digit mobile number/i);

  const maliciousId = "cust_1');window.__xssExecuted=true;//";
  const complete = runHistory('9876543210', [{
    candidateId: maliciousId,
    label: 'Q-001 · 2026-07-30 · New Entry'
  }]);
  assert.equal(complete.duplicateCalls, 1);
  assert.match(complete.fields.historyBox.innerHTML, /qmsOpenExistingDuplicateByIndex\(0\)/);
  assert.doesNotMatch(complete.fields.historyBox.innerHTML, /qmsOpenExistingDuplicate\('/);
  assert.doesNotMatch(complete.fields.historyBox.innerHTML, /__xssExecuted|cust_1/);
  assert.equal(complete.context.window.__xssExecuted, undefined);
});

test('D2 fast entry reuses legal capture, allocation, canonical outcome and defers mandatory skip review', () => {
  const entry = functionSource('addCustomer');
  const skip = functionSource('confirmSkip');
  assert.match(qms, /addCustomer\('outcome'\)/);
  assert.match(entry, /qmsPrepareFastOutcome\(c\)/);
  assert.match(entry, /skipPending/);
  assert.match(entry, /openCloseLead\(c\.id\)/);
  assert.match(entry, /assign a CRO before outcome/);
  assert.match(skip, /window\.__qmsFastOutcomeId === c\.id/);
  assert.ok(skip.indexOf('qmsPrepareFastOutcome(c)') < skip.indexOf("if (!save('turn.skip'"));
  const skipSaveAt = skip.indexOf("if (!save('turn.skip'");
  assert.ok(skipSaveAt < skip.indexOf('closeModal()', skipSaveAt));
});

test('D2 skip modal keeps restored ids in modal-scoped data and emits numeric option handlers only', () => {
  const customerId = "cust_1');window.__xssExecuted=true;//";
  const expectedCroId = "cro_expected');window.__xssExecuted=true;//";
  const actualCroId = "cro_actual');window.__xssExecuted=true;//";
  const items = [
    { croId: expectedCroId },
    { croId: actualCroId }
  ];
  let modal = null;
  const context = {
    window: {},
    role: 'SM',
    currentRotation: () => ({ id: 'rot_1' }),
    customerById: id => id === customerId ? { id, queueNo: 'Q-001' } : null,
    nextFreeCro: () => actualCroId,
    firstAvailableCro: () => null,
    activeRotationItems: () => items,
    croName: id => id === expectedCroId ? 'Expected CRO' : 'Actual CRO',
    esc: value => String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    })[char]),
    openModal: (title, body, foot) => {
      modal = { title, body, foot };
    },
    toast: () => {}
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('openSkipTurn')}; this.runOpenSkipTurn = openSkipTurn;`, context);

  context.runOpenSkipTurn(customerId, expectedCroId);
  assert.ok(modal);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.window.__qmsSkipContext)),
    {
      customerId,
      expectedCroId,
      croIds: [expectedCroId, actualCroId]
    }
  );
  assert.deepEqual(
    [...modal.body.matchAll(/<option value="([^"]*)"/g)].map(match => match[1]),
    ['0', '1']
  );
  assert.match(modal.foot, /onclick="confirmSkip\(\)"/);
  assert.doesNotMatch(modal.body + modal.foot, /__xssExecuted|cust_1|cro_expected|cro_actual/);

  const source = functionSource('openSkipTurn');
  assert.match(source, /<option value="\$\{index\}"/);
  assert.doesNotMatch(source, /value="\$\{item\.croId\}"/);
  assert.doesNotMatch(source, /confirmSkip\([^)]*\$\{/);
});

test('D2 skip confirmation rejects invalid indices and resolves a valid CRO from modal context', () => {
  for (const selectedValue of ['-1', '1.5', '2', 'not-a-number']) {
    let rotationReads = 0;
    const toasts = [];
    const context = {
      window: {
        __qmsSkipContext: {
          customerId: 'cust_1',
          expectedCroId: 'cro_1',
          croIds: ['cro_1', 'cro_2']
        }
      },
      guardWrite: () => true,
      $: id => id === 'actualCro' ? { value: selectedValue } : null,
      currentRotation: () => {
        rotationReads += 1;
        return {};
      },
      toast: (message, type) => toasts.push({ message, type }),
      closeModal: () => {}
    };
    vm.createContext(context);
    vm.runInContext(`${functionSource('confirmSkip')}; this.runConfirmSkip = confirmSkip;`, context);

    context.runConfirmSkip();
    assert.equal(rotationReads, 0);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'error');
    assert.match(toasts[0].message, /valid CRO/i);
  }

  const customerId = "cust_1');window.__xssExecuted=true;//";
  const expectedCroId = "cro_expected');window.__xssExecuted=true;//";
  const actualCroId = "cro_actual');window.__xssExecuted=true;//";
  const fields = {
    actualCro: { value: '1' },
    skipReason: { value: 'Washroom' },
    skipNote: { value: '' },
    nextOpp: { checked: false }
  };
  const customer = { id: customerId, queueNo: 'Q-001' };
  const actualItem = { croId: actualCroId, active: true, status: 'On Floor' };
  const rotation = { priorityCroId: null, turnEvents: [] };
  let pointerCroId = null;
  let saveCall = null;
  let modalCloses = 0;
  const toasts = [];
  class FixedDate extends Date {
    constructor() {
      super('2026-07-30T10:00:00.000Z');
    }
  }
  const context = {
    Date: FixedDate,
    window: {
      __qmsFastOutcomeId: null,
      __qmsSkipContext: {
        customerId,
        expectedCroId,
        croIds: [expectedCroId, actualCroId]
      }
    },
    role: 'SM',
    guardWrite: () => true,
    $: id => fields[id] || null,
    currentRotation: () => rotation,
    customerById: id => id === customerId ? customer : null,
    rotationItem: (rot, croId) => croId === actualCroId ? actualItem : null,
    isOffFloor: () => false,
    confirm: () => true,
    croName: () => 'CRO',
    advancePointer: (rot, croId) => {
      pointerCroId = croId;
    },
    uid: () => 'turn_fixed',
    save: (action, details) => {
      saveCall = { action, details: JSON.parse(JSON.stringify(details)) };
      return true;
    },
    qmsPrepareFastOutcome: () => false,
    closeModal: () => {
      modalCloses += 1;
    },
    toast: (message, type) => toasts.push({ message, type }),
    switchView: () => {},
    openCloseLead: () => {}
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('confirmSkip')}; this.runConfirmSkip = confirmSkip;`, context);

  context.runConfirmSkip();
  assert.equal(customer.expectedCroId, expectedCroId);
  assert.equal(customer.assignedCroId, actualCroId);
  assert.equal(customer.status, 'Allocated');
  assert.equal(pointerCroId, actualCroId);
  assert.equal(rotation.turnEvents.length, 1);
  assert.equal(rotation.turnEvents[0].expectedCroId, expectedCroId);
  assert.equal(rotation.turnEvents[0].actualCroId, actualCroId);
  assert.deepEqual(saveCall, {
    action: 'turn.skip',
    details: {
      queueNo: 'Q-001',
      expectedCroId,
      actualCroId,
      reason: 'Washroom',
      nextOpportunity: false,
      fastOutcome: false
    }
  });
  assert.equal(context.window.__qmsSkipContext, null);
  assert.equal(context.window.__xssExecuted, undefined);
  assert.equal(modalCloses, 1);
  assert.deepEqual(toasts, [{ message: 'Skip recorded.', type: 'success' }]);
});

test('D2 closure stages reason/follow-up fields and commits close plus task in one guarded write', () => {
  const fields = functionSource('renderOutcomeFields');
  const close = functionSource('confirmCloseLead');
  assert.match(fields, /id="conversionReasonCode"/);
  assert.match(fields, /id="lostReasonCode"/);
  assert.match(fields, /id="followExpectedValue"/);
  assert.match(fields, /out === 'Service'/);
  assert.doesNotMatch(
    fields.slice(fields.indexOf("if (out === 'Service')"), fields.indexOf("if (out === 'Non Purchase')")),
    /conversionReasonCode/
  );
  assert.match(close, /lostReasonCode:\s*reason\.reasonCode/);
  assert.match(close, /lostReason:\s*reason\.reasonLabel/);
  assert.match(close, /conversionReasonCode:\s*reason\.reasonCode/);
  assert.match(close, /lastContactAt:\s*null/);
  assert.match(close, /contactCount:\s*0/);
  assert.ok(close.indexOf('state.followups.push(followupDraft)') < close.indexOf("if (!save('lead.close'"));
  assert.ok(close.indexOf("if (!save('lead.close'") < close.indexOf('closeModal()'));
  assert.equal((close.match(/save\('lead\.close'/g) || []).length, 1);
});

test('D2 follow-up UI uses numeric dispatch, deterministic policy metadata and guarded actions', () => {
  const render = functionSource('renderFollowups');
  const pendingId = functionSource('qmsPendingFollowupId');
  const action = functionSource('qmsFollowupAction');
  const contactButtons = functionSource('qmsFollowupContactBtns');
  const lostModal = functionSource('openLostFollowupModal');
  const convertModal = functionSource('openConvertModal');
  const contacted = functionSource('markFollowupContacted');
  const lost = functionSource('confirmLostFollowup');
  const converted = functionSource('confirmConvertFollowup');
  assert.match(render, /policy\.prioritizeFollowups\(rawPending,\s*\{\s*asOf:\s*todayISO\(\)\s*\}\)/);
  assert.match(render, /Expected/);
  assert.match(render, /Last contact/);
  assert.match(render, /Unassigned/);
  assert.match(render, /qmsFollowupAction\(\$\{index\},'Contacted'\)/);
  assert.match(render, /qmsFollowupAction\(\$\{index\},'Converted'\)/);
  assert.match(render, /qmsFollowupAction\(\$\{index\},'Lost'\)/);
  assert.doesNotMatch(render, /\$\{f\.id\}/);
  assert.match(pendingId, /ids\[Number\(index\)\]/);
  assert.match(action, /qmsPendingFollowupId\(index\)/);
  assert.match(contactButtons, /qmsWaFuByIndex\(\$\{Number\(index\)\}\)/);
  assert.doesNotMatch(contactButtons, /\$\{[^}]*id/);
  assert.match(lostModal, /confirmLostFollowupModal\(\)/);
  assert.match(convertModal, /confirmConvertFollowupModal\(\)/);
  assert.doesNotMatch(lostModal + convertModal, /\$\{f\.id\}/);
  assert.match(contacted, /lastContactAt = new Date\(\)\.toISOString\(\)/);
  assert.match(contacted, /contactCount = \(\+f\.contactCount \|\| 0\) \+ 1/);
  assert.match(lost, /lostReasonCode = reason\.reasonCode/);
  assert.match(lost, /lostReason = reason\.reasonLabel/);
  assert.match(converted, /conversionReasonCode = reason\.reasonCode/);
  assert.match(converted, /conversionReason = reason\.reasonLabel/);
  for (const source of [contacted, lost, converted]) assert.match(source, /if\s*\(!save\(/);
});

test('D2 follow-up numeric dispatcher keeps restored ids out of generated handler source', () => {
  const maliciousId = "fu_1');window.__xssExecuted=true;//";
  const calls = [];
  const context = {
    window: {
      __qmsPendingFollowupIds: [maliciousId]
    },
    toast: () => {},
    markFollowupContacted: id => calls.push({ action: 'Contacted', id }),
    updateFollowup: (id, action) => calls.push({ action, id })
  };
  vm.createContext(context);
  vm.runInContext(
    `${functionSource('qmsPendingFollowupId')};
     ${functionSource('qmsFollowupAction')};
     this.runFollowupAction = qmsFollowupAction;`,
    context
  );

  context.runFollowupAction(0, 'Contacted');
  context.runFollowupAction(0, 'Lost');
  assert.deepEqual(calls, [
    { action: 'Contacted', id: maliciousId },
    { action: 'Lost', id: maliciousId }
  ]);
  assert.equal(context.window.__xssExecuted, undefined);
});

test('D2 follow-up display uses policy-normalized expected value instead of negative legacy data', () => {
  const view = { innerHTML: '' };
  const rawFollowup = {
    id: 'fu_1',
    status: 'Pending',
    dueDate: '2026-07-30',
    expectedValue: -999999,
    customerName: 'Customer',
    queueNo: 'Q-001',
    mobile: '9876543210',
    croId: 'cro_1',
    mode: 'Call',
    notes: '',
    lastContactAt: null,
    contactCount: 0
  };
  let policyInput = null;
  const context = {
    window: {},
    state: { followups: [rawFollowup] },
    todayISO: () => '2026-07-30',
    qmsPolicyApi: () => ({
      prioritizeFollowups(followups, options) {
        policyInput = {
          followups: JSON.parse(JSON.stringify(followups)),
          options: JSON.parse(JSON.stringify(options))
        };
        return [{
          id: 'fu_1',
          sourceIndex: 0,
          priority: {
            dueCode: 'DUE_TODAY',
            dueLabel: 'Due today',
            expectedValue: 2500,
            reasonLabels: ['Due today']
          }
        }];
      }
    }),
    $: id => id === 'view-followups' ? view : null,
    esc: value => String(value ?? ''),
    qmsFollowupContactBtns: () => '',
    croName: () => 'CRO One',
    fmtDT: value => String(value || '')
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('renderFollowups')}; this.runRenderFollowups = renderFollowups;`, context);

  context.runRenderFollowups();
  assert.deepEqual(policyInput, {
    followups: [rawFollowup],
    options: { asOf: '2026-07-30' }
  });
  assert.match(view.innerHTML, /2,500/);
  assert.doesNotMatch(view.innerHTML, /-999999/);
  const render = functionSource('renderFollowups');
  assert.match(render, /const expected = Number\.isFinite\(\+p\.expectedValue\)[\s\S]*\+p\.expectedValue >= 0/);
  assert.doesNotMatch(render, /const expected\s*=\s*\+f\.expectedValue/);
});

test('D2 past-date controls disable every new follow-up mutation entry point', () => {
  const mutators = qms.match(/const RO_MUTATORS=([^;]+);/)?.[1] || '';
  for (const name of [
    'markFollowupContacted',
    'confirmLostFollowup',
    'confirmConvertFollowup'
  ]) {
    assert.match(mutators, new RegExp(`\\b${name}\\b`));
  }
  assert.match(functionSource('applyReadOnly'), /RO_MUTATORS\.test\(oc\)/);
});

test('D2 canonical reason label, code and detail are visible and every outcome audit carries its code', () => {
  let modal = null;
  const customer = {
    id: 'cust_1',
    queueNo: 'Q-001',
    name: 'Customer',
    mobile: '9876543210',
    visitType: 'Purchase',
    purpose: '',
    productInterest: '',
    source: 'Walk-in',
    entryTime: '2026-07-30T10:00:00.000Z',
    allocatedTime: null,
    attendStart: null,
    exitTime: null,
    closedAt: '2026-07-30T10:30:00.000Z',
    status: 'Closed',
    outcome: 'Purchase',
    conversionReason: 'Customer need met',
    conversionReasonCode: 'CUSTOMER_NEED_MET',
    conversionReasonDetail: 'Requested model available',
    assignedCroId: 'cro_1',
    notes: ''
  };
  const context = {
    customerById: id => id === customer.id ? customer : null,
    esc: value => String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    })[char]),
    fmtDT: value => String(value || '—'),
    croName: () => 'CRO One',
    openModal: (title, body, foot) => {
      modal = { title, body, foot };
    }
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('openCustomer')}; this.runOpenCustomer = openCustomer;`, context);
  context.runOpenCustomer(customer.id);

  assert.ok(modal);
  assert.match(modal.body, /Customer need met/);
  assert.match(modal.body, /CUSTOMER_NEED_MET/);
  assert.match(modal.body, /Requested model available/);
  assert.match(
    functionSource('confirmCloseLead'),
    /save\('lead\.close',\s*\{[\s\S]*?reasonCode:\s*staged\.lostReasonCode\s*\|\|\s*staged\.conversionReasonCode\s*\|\|\s*null/
  );
  assert.match(
    functionSource('confirmLostFollowup'),
    /save\('followup\.lost',\s*\{[\s\S]*?reasonCode:\s*reason\.reasonCode/
  );
  assert.match(
    functionSource('confirmConvertFollowup'),
    /save\('followup\.convert',\s*\{[\s\S]*?reasonCode:\s*reason\.reasonCode/
  );
});

test('D2 resilience marker and follow-up helper group remain unique and idempotent', () => {
  const helperNames = [
    'qmsPendingFollowupId',
    'qmsFollowupAction',
    'qmsWaFuByIndex',
    'qmsFollowupContactBtns',
    'confirmLostFollowupModal',
    'confirmConvertFollowupModal'
  ];
  const positions = helperNames.map(name => {
    const token = `function ${name}(`;
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.equal((qms.match(new RegExp(escapedToken, 'g')) || []).length, 1);
    return qms.indexOf(token);
  });
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index]);
  }
  assert.equal((qms.match(/D2-QMS-RESILIENCE-2026-07-30/g) || []).length, 1);
});

test('D2 legal-retry and entry-recovery helpers and markers remain unique and idempotent', () => {
  const helperNames = [
    'qmsPendingIntakeKey',
    'qmsReadPendingIntake',
    'qmsAcquirePendingIntake',
    'qmsClearPendingIntake',
    'qmsLegalCapture',
    'qmsCaptureEntryDraft',
    'qmsRestoreEntryDraft'
  ];
  const positions = helperNames.map(name => {
    const token = `function ${name}(`;
    assert.equal(qms.indexOf(token), qms.lastIndexOf(token), `${name} must be unique`);
    return qms.indexOf(token);
  });
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index]);
  }
  assert.equal((qms.match(/D2-QMS-LEGAL-RETRY-2026-07-30/g) || []).length, 1);
  assert.equal((qms.match(/D2-QMS-ENTRY-RECOVERY-2026-07-30/g) || []).length, 1);
  assert.doesNotMatch(qms, /QMS_PENDING_INTAKE_KEY/);
});

test('D2 persistence adapter owns one write and external metadata is verified', () => {
  assert.equal((persistenceSource.match(/\.setItem\(/g) || []).length, 1);
  assert.doesNotMatch(persistenceSource, /\.getItem\(/);
  assert.match(persistenceSource, /state\.audit = nextAudit/);
  assert.equal(qmsModule.actualBytes, qmsModule.bytes);
  assert.equal(qmsModule.actualSha256, qmsModule.sha256);
  assert.match(policySource, /DUPLICATE_DECISIONS/);
  assert.doesNotMatch(policySource, /MERGE/);
});
