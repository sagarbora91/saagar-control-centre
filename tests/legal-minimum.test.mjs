import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadModuleBundle } from './lib/module-bundle.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'www/legal-control.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(rootDir, 'www/index.html'), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; }
  };
}

function loadLegal() {
  const context = {
    localStorage: memoryStorage(),
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
  return { legal: context.SaagarLegal, storage: context.localStorage };
}

function qmsPayload() {
  return {
    id: 'cust_1',
    queueNo: 'Q001',
    entryTime: '2026-07-29T10:00:00.000Z',
    name: 'Customer',
    mobile: '9876543210',
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

test('LEG-01 register assigns purpose, basis, access and retention to every registered group', () => {
  const { legal } = loadLegal();
  assert.ok(legal.fieldRegister.length >= 7);
  for (const row of legal.fieldRegister) {
    assert.ok(row.id);
    assert.ok(row.fields.length);
    assert.ok(row.purpose);
    assert.ok(row.basis);
    assert.ok(row.access.length);
    assert.ok(row.retentionClass);
  }
  assert.equal(legal.status().fieldsApproved, false);
});

test('LEG-01 rejects an unregistered intake field before the customer record is written', () => {
  const { legal } = loadLegal();
  const payload = qmsPayload();
  payload.unapprovedBiometric = 'must-not-ship';
  const result = legal.captureIntake({
    scope: 'qms-intake',
    source: 'test',
    actor: 'Tester',
    mobile: payload.mobile,
    ageBand: 'adult',
    promotionalConsent: false,
    payload
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNREGISTERED_FIELD');
  assert.deepEqual([...result.unknown], ['unapprovedBiometric']);
  assert.equal(legal.status().noticeEventCount, 0);
});

test('LEG-02 notice is standalone, itemised, purpose-specific and exposes rights/withdrawal', () => {
  const { legal } = loadLegal();
  for (const scope of ['qms-intake', 'service-intake']) {
    const notice = legal.notice(scope);
    assert.ok(notice.fields.length >= 4);
    assert.ok(notice.purposes.length >= 4);
    assert.match(notice.promotion, /optional and separate/i);
    assert.match(notice.rights, /withdraw promotional consent/i);
    assert.match(notice.rights, /access, correction, erasure or grievance/i);
    assert.match(legal.noticeText(scope), /Notice version:/);
  }
});

test('LEG-03/04 operational messages survive no marketing consent while promotion fails closed', () => {
  const { legal } = loadLegal();
  const payload = qmsPayload();
  const captured = legal.captureIntake({
    scope: 'qms-intake',
    source: 'qms-new-walk-in',
    actor: 'Greeter',
    mobile: payload.mobile,
    ageBand: 'adult',
    promotionalConsent: false,
    payload
  });
  assert.equal(captured.ok, true);
  assert.equal(legal.status().noticeEventCount, 1);
  assert.equal(legal.isSuppressed(payload.mobile), true);
  assert.equal(
    legal.authorizeMessage({ mobile: payload.mobile, category: 'operational' }).ok,
    true
  );
  const denied = legal.authorizeMessage({ mobile: payload.mobile, category: 'promotional' });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'recipient-suppressed');

  legal.recordConsent({
    mobile: payload.mobile,
    granted: true,
    source: 'fresh-explicit-test-consent',
    actor: 'Greeter'
  });
  assert.equal(legal.authorizeMessage({ mobile: payload.mobile, category: 'promotional' }).ok, true);

  legal.withdrawPromotion({ mobile: payload.mobile, source: 'customer-stop', actor: 'Greeter' });
  assert.equal(legal.authorizeMessage({ mobile: payload.mobile, category: 'promotional' }).ok, false);
  assert.equal(legal.authorizeMessage({ mobile: payload.mobile, category: 'operational' }).ok, true);
});

test('LEG-05 rights closure requires identity evidence and an erasure hold decision', () => {
  const { legal } = loadLegal();
  const request = legal.createRightsRequest({
    principalType: 'customer',
    requestType: 'erasure',
    identifier: '9876543210',
    contact: '9876543210',
    summary: 'Delete eligible records',
    actor: 'Privacy contact'
  });
  const opened = new Date(request.openedAt).getTime();
  const due = new Date(request.dueAt).getTime();
  assert.equal(Math.round((due - opened) / 86400000), 90);
  assert.throws(
    () => legal.closeRightsRequest(request.id, { outcome: 'erased', responseRef: 'LETTER-1', actor: 'Owner' }),
    /Verify identity/
  );
  legal.verifyIdentity(request.id, { method: 'Existing service record checked', actor: 'Owner' });
  assert.throws(
    () => legal.closeRightsRequest(request.id, { outcome: 'erased', responseRef: 'LETTER-1', actor: 'Owner' }),
    /Check legal hold/
  );
  legal.setLegalHold(request.id, { active: true, reason: 'Open warranty claim', actor: 'Owner' });
  assert.throws(
    () => legal.closeRightsRequest(request.id, { outcome: 'erased', responseRef: 'LETTER-1', actor: 'Owner' }),
    /Active legal hold/
  );
  legal.setLegalHold(request.id, { active: false, reason: 'Warranty claim closed', actor: 'Owner' });
  const closed = legal.closeRightsRequest(request.id, {
    outcome: 'erased',
    responseRef: 'LETTER-1',
    actor: 'Owner'
  });
  assert.equal(closed.status, 'closed');
});

test('LEG-10 minor capture fails without verified guardian consent and passes with it', () => {
  const { legal } = loadLegal();
  const payload = qmsPayload();
  payload.dob = '2012-01-01';
  const denied = legal.captureIntake({
    scope: 'qms-intake',
    source: 'qms-new-walk-in',
    actor: 'Greeter',
    mobile: payload.mobile,
    dateOfBirth: payload.dob,
    ageBand: 'adult',
    promotionalConsent: false,
    payload,
    guardian: {}
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'GUARDIAN_VERIFICATION_REQUIRED');

  const accepted = legal.captureIntake({
    scope: 'qms-intake',
    source: 'qms-new-walk-in',
    actor: 'Greeter',
    mobile: payload.mobile,
    dateOfBirth: payload.dob,
    ageBand: 'minor',
    promotionalConsent: false,
    payload,
    guardian: {
      name: 'Parent',
      relationship: 'Mother',
      verificationMethod: 'document-seen',
      consent: true
    }
  });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.guardianEventId);
});

test('R1 integration gates both intake modules and every shell WhatsApp delivery path', () => {
  const modules = loadModuleBundle();
  const qms = modules.find(module => module.id === 'qms')?.html || '';
  const service = modules.find(module => module.id === 'service')?.html || '';
  assert.match(qms, /qmsLegalCapture\(c,noMobile\)/);
  assert.match(qms, /const legalResult=qmsLegalCapture\(c,noMobile\);if\(!legalResult\.ok\)/);
  assert.match(qms, /qmsPromoConsent/);
  assert.match(service, /svcLegalCapture\(data\)/);
  assert.match(service, /if \(isNew\) \{\s*const legalResult = svcLegalCapture\(data\)/);
  assert.match(service, /svc-promo-consent/);
  assert.match(indexSource, /function waSend\(\)[\s\S]*?SaagarLegal\.authorizeMessage/);
  assert.match(indexSource, /function openControlledWhatsApp[\s\S]*?SaagarLegal\.authorizeMessage/);
  assert.match(indexSource, /Reply STOP to opt out/);
});

test('R1 evidence keys are portable and the legal layer loads before shell routes', () => {
  for (const key of [
    'saagar_legal_notice_events_v1',
    'saagar_legal_consent_events_v1',
    'saagar_legal_promo_suppression_v1',
    'saagar_legal_rights_register_v1',
    'saagar_legal_disclosure_register_v1',
    'saagar_legal_breach_register_v1',
    'saagar_legal_governance_v1'
  ]) {
    assert.match(indexSource, new RegExp(key));
  }
  const legalAt = indexSource.indexOf('<script src="legal-control.js"></script>');
  const modulesAt = indexSource.indexOf('const MODULES');
  assert.ok(legalAt > 0 && modulesAt > legalAt);
  assert.match(indexSource, /data-sub="privacy"/);
  assert.match(indexSource, /privacyControlRoot/);
});
