import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'www', 'legal-control.js'), 'utf8');

function controlledStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  let failure = null;
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) {
      const target = String(key);
      if (failure && failure.key === target) {
        failure.remaining -= 1;
        if (failure.remaining === 0) {
          failure = null;
          throw new Error(`injected write failure: ${target}`);
        }
      }
      values.set(target, String(value));
    },
    removeItem(key) { values.delete(String(key)); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
    failWrite(key, occurrence = 1) {
      failure = { key: String(key), remaining: occurrence };
    },
    raw(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    json(key) {
      const raw = values.has(String(key)) ? values.get(String(key)) : null;
      return raw === null ? null : JSON.parse(raw);
    }
  };
}

function loadLegal(storage = controlledStorage()) {
  const context = {
    localStorage: storage,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'legal-control.js' });
  return { legal: context.SaagarLegal, storage };
}

function qmsPayload(id = 'cust_1', mobile = '9876543210') {
  return {
    id,
    queueNo: 'Q001',
    entryTime: '2026-07-30T06:00:00.000Z',
    name: 'Customer',
    mobile,
    noMobile: false,
    visitType: 'Purchase',
    customerType: 'New',
    dob: '',
    anniv: '',
    productInterest: 'Watch',
    source: 'Walk-in',
    peopleCount: 1,
    priority: 'Normal',
    purpose: '',
    status: 'New Entry',
    assignedCroId: null,
    expectedCroId: null,
    attendStart: null,
    exitTime: null,
    outcome: null,
    notes: ''
  };
}

function qmsIntake(options = {}) {
  const id = options.id || 'cust_1';
  const mobile = options.mobile === undefined ? '9876543210' : options.mobile;
  const payload = qmsPayload(id, mobile);
  if (options.dob !== undefined) payload.dob = options.dob;
  return {
    scope: 'qms-intake',
    source: 'qms-new-walk-in',
    actor: 'Greeter',
    operationId: options.operationId === undefined ? `qms-intake:${id}` : options.operationId,
    mobile,
    dateOfBirth: options.dob || '',
    ageBand: options.ageBand || 'adult',
    promotionalConsent: options.consent === undefined ? false : options.consent,
    guardian: options.guardian || {},
    payload
  };
}

function rows(storage, key) {
  return storage.json(key) || [];
}

function suppressionFor(storage, legal, mobile = '9876543210') {
  const state = storage.json(legal.keys.suppression) || { byMobile: {} };
  return state.byMobile[mobile] || null;
}

test('LEG-IDEM-01 identical QMS intake replay returns the original evidence without duplicates', () => {
  const { legal, storage } = loadLegal();
  const input = qmsIntake();
  const first = legal.captureIntake(input);
  const replay = legal.captureIntake(input);

  assert.equal(first.ok, true);
  assert.equal(first.replayed, false);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.operationId, input.operationId);
  assert.equal(replay.noticeEventId, first.noticeEventId);
  assert.equal(replay.consentEventId, first.consentEventId);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
  assert.equal(rows(storage, legal.keys.consent).length, 1);
  assert.equal(suppressionFor(storage, legal).consentEventId, first.consentEventId);
  assert.equal(legal.versions.register, 'R1-FIELD-REGISTER-2026-07-v2');
  const evidenceFields = legal.fieldRegister.find(row => row.id === 'legal-evidence').fields;
  assert.ok(evidenceFields.includes('operationId'));
  assert.ok(evidenceFields.includes('operationStep'));
});

test('LEG-IDEM-02 retry after consent-log failure resumes after one notice', () => {
  const { legal, storage } = loadLegal();
  const input = qmsIntake();
  storage.failWrite(legal.keys.consent);

  assert.throws(() => legal.captureIntake(input), /injected write failure/);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
  assert.equal(storage.raw(legal.keys.consent), null);

  const retry = legal.captureIntake(input);
  assert.equal(retry.ok, true);
  assert.equal(retry.replayed, true);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
  assert.equal(rows(storage, legal.keys.consent).length, 1);
  assert.equal(suppressionFor(storage, legal).consentEventId, retry.consentEventId);
});

test('LEG-IDEM-03 retry after suppression failure reuses consent and repairs suppression', () => {
  const { legal, storage } = loadLegal();
  const input = qmsIntake();
  storage.failWrite(legal.keys.suppression);

  assert.throws(() => legal.captureIntake(input), /injected write failure/);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
  assert.equal(rows(storage, legal.keys.consent).length, 1);
  assert.equal(storage.raw(legal.keys.suppression), null);

  const retry = legal.captureIntake(input);
  assert.equal(retry.ok, true);
  assert.equal(retry.replayed, true);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
  assert.equal(rows(storage, legal.keys.consent).length, 1);
  assert.equal(suppressionFor(storage, legal).consentEventId, retry.consentEventId);
});

test('LEG-IDEM-04 retry after guardian failure completes one minor evidence set', () => {
  const { legal, storage } = loadLegal();
  const input = qmsIntake({
    id: 'cust_minor',
    dob: '2015-01-01',
    ageBand: 'minor',
    guardian: {
      name: 'Parent',
      relationship: 'Mother',
      verificationMethod: 'document-seen',
      consent: true
    }
  });
  storage.failWrite(legal.keys.notice, 2);

  assert.throws(() => legal.captureIntake(input), /injected write failure/);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
  assert.equal(rows(storage, legal.keys.consent).length, 1);

  const retry = legal.captureIntake(input);
  const notices = rows(storage, legal.keys.notice);
  assert.equal(retry.ok, true);
  assert.equal(retry.replayed, true);
  assert.equal(notices.filter(row => row.operationStep === 'notice').length, 1);
  assert.equal(notices.filter(row => row.operationStep === 'guardian').length, 1);
  assert.equal(rows(storage, legal.keys.consent).length, 1);
  assert.ok(retry.guardianEventId);
});

test('LEG-IDEM-05 QMS operation ids are required, exact, customer-bound and conflict before mutation', () => {
  const { legal, storage } = loadLegal();
  const missing = qmsIntake({ operationId: '' });
  const invalid = qmsIntake({ operationId: 'qms-intake:cust_1;bad' });
  const mismatch = qmsIntake({ operationId: 'qms-intake:cust_2' });

  assert.equal(legal.captureIntake(missing).code, 'OPERATION_ID_REQUIRED');
  assert.equal(legal.captureIntake(invalid).code, 'INVALID_OPERATION_ID');
  assert.equal(legal.captureIntake(mismatch).code, 'OPERATION_ID_MISMATCH');
  assert.equal(storage.length, 0);

  const input = qmsIntake();
  assert.equal(legal.captureIntake(input).ok, true);
  const beforeNotice = storage.raw(legal.keys.notice);
  const beforeConsent = storage.raw(legal.keys.consent);
  const beforeSuppression = storage.raw(legal.keys.suppression);

  const changedMobile = qmsIntake({ mobile: '9123456789' });
  const mobileConflict = legal.captureIntake(changedMobile);
  assert.equal(mobileConflict.ok, false);
  assert.equal(mobileConflict.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(storage.raw(legal.keys.notice), beforeNotice);
  assert.equal(storage.raw(legal.keys.consent), beforeConsent);
  assert.equal(storage.raw(legal.keys.suppression), beforeSuppression);

  const changedConsent = qmsIntake({ consent: true });
  const consentConflict = legal.captureIntake(changedConsent);
  assert.equal(consentConflict.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(storage.raw(legal.keys.notice), beforeNotice);
  assert.equal(storage.raw(legal.keys.consent), beforeConsent);
  assert.equal(storage.raw(legal.keys.suppression), beforeSuppression);
});

test('LEG-IDEM-06 replay of an older decline never overrides a later explicit grant', () => {
  const { legal, storage } = loadLegal();
  const input = qmsIntake({ consent: false });
  const first = legal.captureIntake(input);
  assert.equal(first.ok, true);

  legal.recordConsent({
    mobile: input.mobile,
    granted: true,
    source: 'fresh-explicit-test-consent',
    actor: 'Greeter'
  });
  assert.equal(legal.authorizeMessage({ mobile: input.mobile, category: 'promotional' }).ok, true);
  const consentCount = rows(storage, legal.keys.consent).length;

  const replay = legal.captureIntake(input);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(rows(storage, legal.keys.consent).length, consentCount);
  assert.equal(suppressionFor(storage, legal, input.mobile), null);
  assert.equal(legal.authorizeMessage({ mobile: input.mobile, category: 'promotional' }).ok, true);
});

test('LEG-IDEM-07 corrupt evidence storage fails closed before any new legal write', () => {
  {
    const storage = controlledStorage({ saagar_legal_notice_events_v1: '{broken' });
    const { legal } = loadLegal(storage);
    assert.throws(() => legal.captureIntake(qmsIntake()), /JSON|Unexpected|property/i);
    assert.equal(storage.raw(legal.keys.notice), '{broken');
    assert.equal(storage.raw(legal.keys.consent), null);
  }
  {
    const storage = controlledStorage({ saagar_legal_consent_events_v1: '{broken' });
    const { legal } = loadLegal(storage);
    assert.throws(() => legal.captureIntake(qmsIntake()), /JSON|Unexpected|property/i);
    assert.equal(storage.raw(legal.keys.notice), null);
    assert.equal(storage.raw(legal.keys.consent), '{broken');
  }
  {
    const storage = controlledStorage({ saagar_legal_promo_suppression_v1: '[]' });
    const { legal } = loadLegal(storage);
    assert.throws(() => legal.captureIntake(qmsIntake()), /suppression state is corrupt/i);
    assert.equal(storage.raw(legal.keys.notice), null);
    assert.equal(storage.raw(legal.keys.consent), null);
    assert.equal(storage.raw(legal.keys.suppression), '[]');
  }
});

test('LEG-IDEM-08 different customer operation ids intentionally create separate evidence', () => {
  const { legal, storage } = loadLegal();
  const first = legal.captureIntake(qmsIntake({ id: 'cust_1' }));
  const second = legal.captureIntake(qmsIntake({ id: 'cust_2' }));

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.noticeEventId, second.noticeEventId);
  assert.notEqual(first.consentEventId, second.consentEventId);
  assert.equal(rows(storage, legal.keys.notice).length, 2);
  assert.equal(rows(storage, legal.keys.consent).length, 2);
  assert.equal(new Set(rows(storage, legal.keys.notice).map(row => row.operationId)).size, 2);
});

test('LEG-IDEM-09 promotional authorization fails closed when consent evidence is corrupt', () => {
  for (const corruptKey of ['suppression', 'consent']) {
    const { legal, storage } = loadLegal();
    const input = qmsIntake({ consent: true });
    assert.equal(legal.captureIntake(input).ok, true);
    assert.equal(legal.authorizeMessage({ mobile: input.mobile, category: 'promotional' }).ok, true);

    storage.setItem(legal.keys[corruptKey], '{broken');

    assert.equal(legal.hasPromotionConsent(input.mobile), false);
    const denied = legal.authorizeMessage({ mobile: input.mobile, category: 'promotional' });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, 'privacy-evidence-unavailable');
    assert.equal(legal.authorizeMessage({ mobile: input.mobile, category: 'operational' }).ok, true);
    assert.equal(storage.raw(legal.keys[corruptKey]), '{broken');
  }
});
test('LEG-IDEM compatibility keeps operation ids optional for non-QMS intake callers', () => {
  const { legal, storage } = loadLegal();
  const result = legal.captureIntake({
    scope: 'service-intake',
    source: 'service-new-intake',
    actor: 'Service adviser',
    mobile: '',
    ageBand: 'adult',
    payload: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.operationId, null);
  assert.equal(rows(storage, legal.keys.notice).length, 1);
});
