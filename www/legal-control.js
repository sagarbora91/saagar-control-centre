/*
 * Saagar Control Centre — R1 legal-minimum control plane.
 *
 * This is an offline evidence/control layer, not a claim that human legal gates
 * have been completed. Policy wording, retention periods, processor clauses and
 * rehearsals remain visibly pending until the owner/counsel records them.
 */
(function (root, factory) {
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarLegal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var NOTICE_VERSION = 'R1-NOTICE-2026-07-v1';
  var CONSENT_VERSION = 'R1-PROMO-WA-2026-07-v1';
  var REGISTER_VERSION = 'R1-FIELD-REGISTER-2026-07-v2';
  var RIGHTS_SLA_DAYS = 90;
  var KEYS = Object.freeze({
    notice: 'saagar_legal_notice_events_v1',
    consent: 'saagar_legal_consent_events_v1',
    suppression: 'saagar_legal_promo_suppression_v1',
    rights: 'saagar_legal_rights_register_v1',
    disclosures: 'saagar_legal_disclosure_register_v1',
    incidents: 'saagar_legal_breach_register_v1',
    retention: 'saagar_legal_retention_log_v1',
    governance: 'saagar_legal_governance_v1'
  });

  var FIELD_REGISTER = Object.freeze([
    {
      id: 'customer-identity',
      principals: ['customer', 'visitor'],
      scopes: ['customer-master', 'qms-intake', 'service-intake'],
      fields: ['customerId', 'name', 'mobile', 'alternateMobile', 'email', 'address', 'identityTypeAndNumber'],
      purpose: 'Identify the customer, retrieve the correct record and provide the requested retail or service interaction.',
      basis: 'Consent or processing necessary for the customer-requested service; retain where another law or claim requires.',
      access: ['Owner', 'Store Manager', 'Greeter for queue intake', 'Service adviser for service intake'],
      retentionClass: 'CUSTOMER_OPERATIONAL',
      approved: false
    },
    {
      id: 'queue-visit',
      principals: ['customer', 'visitor'],
      scopes: ['qms-intake'],
      fields: [
        'id', 'queueNo', 'entryTime', 'name', 'mobile', 'noMobile', 'visitType',
        'customerType', 'dob', 'anniv', 'productInterest', 'source', 'peopleCount',
        'priority', 'purpose', 'status', 'assignedCroId', 'expectedCroId',
        'attendStart', 'exitTime', 'outcome', 'notes', 'purchaseAmount',
        'purchaseCategory', 'lostReason', 'lostValue', 'lostReasonCode',
        'lostReasonDetail', 'conversionReasonCode', 'conversionReason',
        'conversionReasonDetail', 'allocatedTime', 'closedAt', 'croId', 'dueDate',
        'mode', 'expectedValue', 'lastContactAt',
        'lastContactBy', 'contactCount', 'recoveredValue', 'recoveredBill',
        'billNo', 'paymentMode', 'customerId', 'customerName', 'sourceOutcome',
        'createdAt', 'createdBy', 'closedBy', 'convertedAt'
      ],
      purpose: 'Manage the live queue, allocate a sales adviser, complete the visit and measure store operations.',
      basis: 'Customer-requested retail interaction; optional birthday, anniversary and promotion use require separate consent.',
      access: ['Owner', 'Store Manager', 'Greeter', 'Allocated CRO'],
      retentionClass: 'QUEUE_VISIT',
      approved: false
    },
    {
      id: 'service-order',
      principals: ['customer'],
      scopes: ['service-intake'],
      fields: [
        'id', 'status', 'prog', 'createdAt', 'dateRec', 'advisor', 'expDel',
        'stage', 'watchPhoto', 'watchPhotoAfter', 'custName', 'custMobile',
        'custEmail', 'custWA', 'custAddr', 'custId', 'custAlt', 'brand', 'model',
        'refNo', 'serialNo', 'caseMat', 'caseSize', 'dialColour', 'strap',
        'movement', 'waterRes', 'year', 'estValue', 'lastService', 'condParts',
        'grade', 'condNotes', 'accWatch', 'accDoc', 'accId', 'accAuth', 'issMech',
        'issCosmetic', 'issBrac', 'issOther', 'issOtherText', 'diagnosis',
        'techName', 'techId', 'techDate', 'pointRemarks', 'lineItems', 'subTotal',
        'gst', 'subTotalManual', 'estTotal', 'advancePaid', 'authTC', 'authWork',
        'authPay', 'authCond', 'authName', 'authDate', 'authSig', 'ackBy',
        'ackDesig', 'ackDT', 'ackConfirmed', 'delivery', 'closedAt',
        'stageHistory', 'followUps'
      ],
      purpose: 'Create and perform the watch-service contract, document custody and condition, communicate progress, collect payment and resolve warranty or claims.',
      basis: 'Customer-requested service and performance of the service agreement; statutory invoice and claim records where required.',
      access: ['Owner', 'Store Manager', 'Service adviser', 'Assigned technician', 'Accounts for invoice/payment only'],
      retentionClass: 'SERVICE_ORDER',
      approved: false
    },
    {
      id: 'customer-promotion',
      principals: ['customer'],
      scopes: ['qms-intake', 'service-intake', 'whatsapp'],
      fields: [
        'mobile', 'channel', 'purpose', 'granted', 'wordingVersion', 'source',
        'recordedAt', 'reason', 'operationId', 'operationStep'
      ],
      purpose: 'Send optional offers, greetings, review requests and relationship messages.',
      basis: 'Separate, specific, affirmative consent; withdrawal is effective for every promotional send route.',
      access: ['Owner', 'Store Manager', 'Authorised customer-facing staff'],
      retentionClass: 'CONSENT_EVIDENCE',
      approved: false
    },
    {
      id: 'employee-master-and-operations',
      principals: ['employee'],
      scopes: ['employee-master', 'payroll', 'leave', 'attendance', 'grooming', 'cro-audit', 'dsr'],
      fields: [
        'employeeId', 'name', 'phone', 'gender', 'joiningDate', 'firm', 'store',
        'department', 'role', 'salary', 'salaryType', 'bankName', 'accountNo',
        'ifsc', 'uan', 'esicIp', 'attendance', 'leave', 'groomingResult',
        'performanceResult', 'auditResult', 'payrollResult', 'signature', 'notes'
      ],
      purpose: 'Administer employment, attendance, leave, payroll, statutory contributions, store readiness and role performance.',
      basis: 'Employment administration, legal obligations and legitimate workplace operations; use only what is necessary.',
      access: ['Owner', 'Payroll/Accounts for pay fields', 'Manager for operational fields', 'Employee for own request/response'],
      retentionClass: 'EMPLOYEE_RECORD',
      approved: false
    },
    {
      id: 'third-party-and-financial',
      principals: ['vendor', 'customer', 'employee', 'business contact'],
      scopes: ['expense', 'stock', 'tax', 'reports', 'exports'],
      fields: ['name', 'mobile', 'email', 'gstin', 'bankReference', 'invoiceReference', 'transactionReference', 'recipient', 'disclosurePurpose'],
      purpose: 'Maintain accounts, tax evidence, stock custody, payment evidence, business reporting and controlled professional disclosures.',
      basis: 'Contract, legal obligation or authorised business operation.',
      access: ['Owner', 'Accounts', 'CA for approved scope', 'Developer only through sanitised support bundle'],
      retentionClass: 'FINANCIAL_STATUTORY',
      approved: false
    },
    {
      id: 'legal-evidence',
      principals: ['customer', 'employee', 'guardian', 'business contact'],
      scopes: ['notice', 'consent', 'rights', 'grievance', 'breach', 'disclosure', 'minor-guardian'],
      fields: [
        'requestId', 'principalType', 'identifier', 'contact', 'requestType',
        'identityMethod', 'identityVerifiedAt', 'legalHold', 'responseRef',
        'guardianName', 'guardianRelationship', 'guardianVerificationMethod',
        'noticeVersion', 'consentVersion', 'recipientCategory', 'contractRef',
        'incidentId', 'awarenessAt', 'assessment', 'notificationReference',
        'operationId', 'operationStep', 'ageBand', 'consentExpected', 'guardianExpected'
      ],
      purpose: 'Demonstrate notice, consent, withdrawal, rights handling, guardian verification, disclosure control and incident response.',
      basis: 'Compliance evidence, legal claims and security/accountability obligations.',
      access: ['Owner', 'Privacy contact', 'Counsel for approved matter'],
      retentionClass: 'LEGAL_COMPLIANCE',
      approved: false
    }
  ]);

  var PAYLOAD_FIELDS = Object.freeze({
    'qms-intake': FIELD_REGISTER[1].fields,
    'service-intake': FIELD_REGISTER[2].fields
  });

  var NOTICES = Object.freeze({
    'qms-intake': {
      title: 'Customer Queue Privacy Notice',
      fields: [
        'Name and mobile number (a walk-in may decline to give a number)',
        'Visit type, purpose, queue and staff-allocation details',
        'Optional birthday, anniversary and product interest',
        'Visit outcome and transaction/service follow-up'
      ],
      purposes: [
        'Manage your visit and allocate a staff member',
        'Provide the retail, enquiry, complaint or service interaction you requested',
        'Maintain store, transaction and service records',
        'Send operational updates about this visit'
      ]
    },
    'service-intake': {
      title: 'Watch Service Privacy Notice',
      fields: [
        'Customer contact and service-order identification details',
        'Watch identity, condition, photographs and custody evidence',
        'Diagnosis, estimate, approvals, payment and delivery evidence',
        'Service communications, follow-ups and warranty/claim records'
      ],
      purposes: [
        'Create and perform your watch-service order',
        'Document the item received, its condition and authorised work',
        'Provide estimates, progress, pickup, invoice and warranty communications',
        'Maintain records needed for accounts, tax, warranty and dispute handling'
      ]
    }
  });

  var RETENTION_SCHEDULE = Object.freeze([
    { id: 'QUEUE_VISIT', review: '24 months after last visit', action: 'Delete or minimise unless linked to an open service, transaction, claim or legal hold.', status: 'owner-and-counsel-approval-required' },
    { id: 'CUSTOMER_OPERATIONAL', review: '24 months after last customer interaction', action: 'Review necessity; retain only records required for an open purpose, transaction, claim or law.', status: 'owner-and-counsel-approval-required' },
    { id: 'SERVICE_ORDER', review: '5 years after closure or later warranty/claim closure', action: 'Delete/minimise contact and evidence after claim and statutory needs end.', status: 'owner-and-counsel-approval-required' },
    { id: 'FINANCIAL_STATUTORY', review: '8 completed financial years', action: 'Delete only after CA confirms all tax, accounting, assessment and litigation holds are closed.', status: 'ca-and-counsel-approval-required' },
    { id: 'EMPLOYEE_RECORD', review: '8 years after the relevant FY or separation, whichever is later', action: 'Restrict access immediately on separation; delete only after payroll, labour, tax and claim needs end.', status: 'owner-and-counsel-approval-required' },
    { id: 'CONSENT_EVIDENCE', review: '5 years after withdrawal or last promotional send', action: 'Keep suppression status while the mobile may remain in any active customer source; otherwise retain a minimised suppression token.', status: 'owner-and-counsel-approval-required' },
    { id: 'LEGAL_COMPLIANCE', review: '5 years after request/incident/disclosure closure', action: 'Retain longer for legal hold, Board/court matter or unresolved claim.', status: 'owner-and-counsel-approval-required' },
    { id: 'SECURITY_LOG', review: 'Not less than 1 year from processing/security event', action: 'Delete or aggregate after investigation and legal-hold needs end.', status: 'rule-baseline' },
    { id: 'PRIVATE_BACKUP', review: '7 daily, 5 weekly and 12 monthly generations', action: 'Encrypted rotation; restore must continue to honour suppression and deletion controls.', status: 'implemented' }
  ]);

  function storage() {
    if (!root.localStorage) throw new Error('Legal control storage unavailable');
    return root.localStorage;
  }
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }
  function read(key, fallback) {
    try {
      var raw = storage().getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) { return fallback; }
  }
  function readStrict(key, fallback) {
    var raw = storage().getItem(key);
    if (raw === null) return fallback;
    if (raw === '') throw new Error('Legal control storage is corrupt: ' + key);
    var parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) {
      throw new Error('Legal control storage is corrupt: ' + key);
    }
    return parsed;
  }
  function readArrayStrict(key) {
    var rows = readStrict(key, []);
    if (!Array.isArray(rows)) throw new Error('Legal control event log is corrupt: ' + key);
    return rows;
  }
  function write(key, value) {
    storage().setItem(key, JSON.stringify(value));
    return value;
  }
  function append(key, event, limit) {
    var rows = readArrayStrict(key);
    rows.unshift(event);
    if (limit && rows.length > limit) rows = rows.slice(0, limit);
    write(key, rows);
    return event;
  }
  function mobile10(value) {
    var digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
  }
  function actor(value) {
    return String(value || 'Staff').trim().slice(0, 80) || 'Staff';
  }
  function safeText(value, max) {
    return String(value == null ? '' : value).trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, max || 240);
  }

  var QMS_OPERATION_ID_PATTERN = /^qms-intake:cust_[a-z0-9_]{1,80}$/;
  var GENERIC_OPERATION_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}:[a-z0-9][a-z0-9_-]{0,80}$/;
  function checkOperationId(value, requireQms) {
    var operationId = value == null ? '' : String(value);
    if (!operationId) {
      return requireQms
        ? { ok: false, code: 'OPERATION_ID_REQUIRED', message: 'A QMS intake operation id is required.' }
        : { ok: true, value: null };
    }
    var valid = requireQms || operationId.indexOf('qms-intake:') === 0
      ? QMS_OPERATION_ID_PATTERN.test(operationId)
      : GENERIC_OPERATION_ID_PATTERN.test(operationId);
    return valid
      ? { ok: true, value: operationId }
      : { ok: false, code: 'INVALID_OPERATION_ID', message: 'The intake operation id is invalid.' };
  }
  function operationIdOrThrow(value) {
    var check = checkOperationId(value, false);
    if (check.ok) return check.value;
    var error = new Error(check.message);
    error.code = check.code;
    throw error;
  }
  function idempotencyConflict(message) {
    var error = new Error(message || 'Legal intake operation conflicts with existing evidence.');
    error.code = 'IDEMPOTENCY_CONFLICT';
    throw error;
  }
  function operationEventId(operationId, step) {
    return step + '_' + operationId;
  }
  function eventMatches(existing, expected, fields) {
    return fields.every(function (field) { return existing[field] === expected[field]; });
  }
  function inspectEvent(plan) {
    var rows = readArrayStrict(plan.key);
    if (!plan.event.operationId) return { rows: rows, existing: null };
    var matches = rows.filter(function (row) {
      return row && row.operationId === plan.event.operationId
        && row.operationStep === plan.event.operationStep;
    });
    if (matches.length > 1) idempotencyConflict('Duplicate legal operation evidence requires review.');
    if (!matches.length) return { rows: rows, existing: null };
    var existing = matches[0];
    if (existing.id !== plan.event.id || !eventMatches(existing, plan.event, plan.immutableFields)) {
      idempotencyConflict('The legal operation id was already used with different intake facts.');
    }
    return { rows: rows, existing: existing };
  }
  function preflightEventPlans(plans) {
    plans.forEach(function (plan) { inspectEvent(plan); });
  }
  function ensureEvent(plan) {
    var inspected = inspectEvent(plan);
    if (inspected.existing) return { event: inspected.existing, replayed: true };
    var rows = inspected.rows;
    rows.unshift(plan.event);
    if (plan.limit && rows.length > plan.limit) rows = rows.slice(0, plan.limit);
    write(plan.key, rows);
    var verified = inspectEvent(plan).existing;
    if (!verified) throw new Error('Legal event verification failed: ' + plan.event.operationStep);
    return { event: verified, replayed: false };
  }
  function persistEvent(plan) {
    if (plan.event.operationId) return ensureEvent(plan);
    return { event: append(plan.key, plan.event, plan.limit), replayed: false };
  }
  function suppressionStateStrict() {
    var state = readStrict(KEYS.suppression, { version: 1, byMobile: {} });
    if (!state || typeof state !== 'object' || Array.isArray(state)
        || !state.byMobile || typeof state.byMobile !== 'object' || Array.isArray(state.byMobile)) {
      throw new Error('Legal suppression state is corrupt.');
    }
    return state;
  }
  function latestConsentStrict(mobile) {
    var rows = readArrayStrict(KEYS.consent);
    return rows.find(function (row) {
      return row && row.mobile === mobile && row.purpose === 'promotional-messaging';
    }) || null;
  }
  function reconcileConsentSuppression(event) {
    var latest = latestConsentStrict(event.mobile);
    if (!latest) throw new Error('Consent event verification failed.');
    if (latest.id !== event.id) return { applied: false, superseded: true };
    var suppression = suppressionStateStrict();
    var current = suppression.byMobile[event.mobile];
    if (event.granted) {
      if (!current) return { applied: true, superseded: false };
      delete suppression.byMobile[event.mobile];
    } else {
      var expectedReason = event.reason || 'consent-declined-or-withdrawn';
      if (current && current.consentEventId === event.id && current.reason === expectedReason) {
        return { applied: true, superseded: false };
      }
      suppression.byMobile[event.mobile] = {
        at: event.at,
        source: event.source,
        reason: expectedReason,
        consentEventId: event.id
      };
    }
    write(KEYS.suppression, suppression);
    var verified = suppressionStateStrict().byMobile[event.mobile];
    if ((event.granted && verified)
        || (!event.granted && (!verified || verified.consentEventId !== event.id))) {
      throw new Error('Consent suppression verification failed.');
    }
    return { applied: true, superseded: false };
  }

  function daysFrom(iso, days) {
    var d = iso ? new Date(iso) : new Date();
    return new Date(d.getTime() + Number(days || 0) * 86400000).toISOString();
  }
  function ageOn(dateValue, at) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return null;
    var dob = new Date(String(dateValue) + 'T12:00:00');
    var ref = at ? new Date(at) : new Date();
    if (isNaN(+dob) || dob > ref) return null;
    var years = ref.getFullYear() - dob.getFullYear();
    var beforeBirthday = ref.getMonth() < dob.getMonth()
      || (ref.getMonth() === dob.getMonth() && ref.getDate() < dob.getDate());
    return years - (beforeBirthday ? 1 : 0);
  }
  function config() {
    var cfg = read(KEYS.governance, {});
    return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
  }
  function contactText() {
    var c = config().privacyContact || {};
    var parts = [c.name, c.phone, c.email].map(function (v) { return safeText(v, 120); }).filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Privacy contact not configured — ask the business owner at the store.';
  }
  function notice(scope) {
    var base = NOTICES[scope];
    if (!base) throw new Error('Unknown collection-notice scope');
    return {
      version: NOTICE_VERSION,
      scope: scope,
      title: base.title,
      fields: base.fields.slice(),
      purposes: base.purposes.slice(),
      promotion: 'Promotional WhatsApp messages are optional and separate. Refusing or withdrawing promotional consent does not affect service or operational updates.',
      rights: 'Use Settings → Privacy & rights, or contact ' + contactText()
        + ', to withdraw promotional consent or request access, correction, erasure or grievance handling. Records may still be kept where law, warranty, payment, security, an unresolved claim or legal hold requires.',
      board: 'After using the grievance process, a complaint may be made to the Data Protection Board of India when the applicable provisions are in force.'
    };
  }
  function noticeText(scope) {
    var n = notice(scope);
    return n.title + '\n\nPersonal data: ' + n.fields.join('; ') + '.\n\nPurposes: '
      + n.purposes.join('; ') + '.\n\n' + n.promotion + '\n\n' + n.rights + '\n\n' + n.board
      + '\n\nNotice version: ' + n.version;
  }
  function validatePayload(scope, payload) {
    var allowed = PAYLOAD_FIELDS[scope];
    if (!allowed) return { ok: false, missing: [], unknown: [], error: 'Unknown field-register scope' };
    var keys = Object.keys(payload && typeof payload === 'object' ? payload : {});
    var unknown = keys.filter(function (key) { return allowed.indexOf(key) < 0; });
    return {
      ok: unknown.length === 0,
      missing: [],
      unknown: unknown,
      registerVersion: REGISTER_VERSION
    };
  }
  function buildNoticeEvent(input, operationId) {
    var step = input.operationStep || 'notice';
    var event = {
      id: operationId ? operationEventId(operationId, step) : uid(step),
      at: nowIso(),
      scope: input.scope,
      source: safeText(input.source, 100),
      channel: safeText(input.channel || 'in-app-at-collection', 60),
      wordingVersion: NOTICE_VERSION,
      subjectRef: input.subjectRef ? safeText(input.subjectRef, 80) : null,
      actor: actor(input.actor)
    };
    if (operationId) {
      event.operationId = operationId;
      event.operationStep = step;
    }
    if (input.ageBand !== undefined) event.ageBand = safeText(input.ageBand, 20);
    if (typeof input.consentExpected === 'boolean') event.consentExpected = input.consentExpected;
    if (typeof input.guardianExpected === 'boolean') event.guardianExpected = input.guardianExpected;
    return event;
  }
  function noticePlan(event) {
    return {
      key: KEYS.notice,
      event: event,
      limit: 10000,
      immutableFields: [
        'scope', 'source', 'channel', 'wordingVersion', 'subjectRef',
        'ageBand', 'consentExpected', 'guardianExpected'
      ]
    };
  }
  function recordNotice(input) {
    input = input || {};
    if (!NOTICES[input.scope]) throw new Error('Unknown collection-notice scope');
    var operationId = operationIdOrThrow(input.operationId);
    return persistEvent(noticePlan(buildNoticeEvent(input, operationId))).event;
  }
  function suppressionState() {
    var state = read(KEYS.suppression, { version: 1, byMobile: {} });
    if (!state || typeof state !== 'object' || Array.isArray(state)) state = { version: 1, byMobile: {} };
    if (!state.byMobile || typeof state.byMobile !== 'object' || Array.isArray(state.byMobile)) state.byMobile = {};
    return state;
  }
  function buildConsentEvent(input, operationId) {
    var mobile = mobile10(input.mobile);
    if (!mobile) throw new Error('A valid 10-digit mobile is required for promotional consent');
    if (typeof input.granted !== 'boolean') throw new Error('Consent must be explicitly granted or declined');
    var step = input.operationStep || 'consent';
    var event = {
      id: operationId ? operationEventId(operationId, step) : uid(step),
      at: nowIso(),
      mobile: mobile,
      channel: safeText(input.channel || 'whatsapp', 40),
      purpose: 'promotional-messaging',
      granted: input.granted,
      wordingVersion: CONSENT_VERSION,
      source: safeText(input.source, 100),
      reason: safeText(input.reason || (input.granted ? 'affirmative-consent' : 'consent-declined-or-withdrawn'), 100),
      actor: actor(input.actor)
    };
    if (operationId) {
      event.operationId = operationId;
      event.operationStep = step;
    }
    return event;
  }
  function consentPlan(event) {
    return {
      key: KEYS.consent,
      event: event,
      limit: 10000,
      immutableFields: [
        'mobile', 'channel', 'purpose', 'granted', 'wordingVersion', 'source', 'reason'
      ]
    };
  }
  function recordConsent(input) {
    input = input || {};
    var operationId = operationIdOrThrow(input.operationId);
    var plan = consentPlan(buildConsentEvent(input, operationId));
    inspectEvent(plan);
    suppressionStateStrict();
    var result = persistEvent(plan);
    reconcileConsentSuppression(result.event);
    return result.event;
  }
  function withdrawPromotion(input) {
    input = input || {};
    input.granted = false;
    input.reason = input.reason || 'withdrawn';
    input.source = input.source || 'privacy-rights';
    return recordConsent(input);
  }
  function isSuppressed(value) {
    var mobile = mobile10(value);
    if (!mobile) return false;
    try {
      return !!suppressionStateStrict().byMobile[mobile];
    } catch (error) {
      return true;
    }
  }  function latestConsent(value) {
    var mobile = mobile10(value);
    if (!mobile) return null;
    var rows = read(KEYS.consent, []);
    if (!Array.isArray(rows)) return null;
    return rows.find(function (row) { return row && row.mobile === mobile && row.purpose === 'promotional-messaging'; }) || null;
  }
  function hasPromotionConsent(value) {
    var mobile = mobile10(value);
    if (!mobile) return false;
    try {
      if (suppressionStateStrict().byMobile[mobile]) return false;
      var event = latestConsentStrict(mobile);
      return !!(event && event.granted === true);
    } catch (error) {
      return false;
    }
  }  function classifyMessage(input) {
    input = input || {};
    if (input.category === 'promotional' || input.category === 'operational') return input.category;
    var probe = [
      input.purposeId, input.templateId, input.scopeId, input.module
    ].map(function (v) { return String(v || '').toLowerCase(); }).join(' ');
    return /(promo|marketing|offer|winback|birthday|anniversary|greeting|relationship|review|encourage)/.test(probe)
      ? 'promotional' : 'operational';
  }
  function authorizeMessage(input) {
    input = input || {};
    var category = classifyMessage(input);
    if (category === 'operational') return { ok: true, category: category, reason: 'operational-message' };
    var mobile = mobile10(input.mobile);
    if (!mobile) return { ok: false, category: category, reason: 'promotional-recipient-mobile-required' };
    try {
      if (suppressionStateStrict().byMobile[mobile]) {
        return { ok: false, category: category, reason: 'recipient-suppressed' };
      }
      var consent = latestConsentStrict(mobile);
      if (!consent || consent.granted !== true) {
        return { ok: false, category: category, reason: 'promotional-consent-not-recorded' };
      }
    } catch (error) {
      return { ok: false, category: category, reason: 'privacy-evidence-unavailable' };
    }
    return { ok: true, category: category, reason: 'active-promotional-consent' };
  }  function captureIntake(input) {
    input = input || {};
    var scope = input.scope;
    var check = validatePayload(scope, input.payload || {});
    if (!check.ok) return { ok: false, code: 'UNREGISTERED_FIELD', unknown: check.unknown };
    var operationCheck = checkOperationId(input.operationId, scope === 'qms-intake');
    if (!operationCheck.ok) {
      return { ok: false, code: operationCheck.code, message: operationCheck.message };
    }
    var operationId = operationCheck.value;
    if (scope === 'qms-intake' && operationId !== 'qms-intake:' + String(input.payload.id || '')) {
      return {
        ok: false, code: 'OPERATION_ID_MISMATCH',
        message: 'The QMS intake operation id must match the preallocated customer id.'
      };
    }
    var age = ageOn(input.dateOfBirth);
    var ageBand = age !== null && age < 18 ? 'minor' : safeText(input.ageBand, 20);
    if (ageBand !== 'adult' && ageBand !== 'minor') {
      return { ok: false, code: 'AGE_STATUS_REQUIRED', message: 'Confirm adult customer or guardian process.' };
    }
    var guardian = input.guardian || {};
    if (ageBand === 'minor') {
      var validMethod = ['document-seen', 'existing-verified-record', 'digital-token', 'other-lawful-method']
        .indexOf(guardian.verificationMethod) >= 0;
      if (!safeText(guardian.name, 120) || !safeText(guardian.relationship, 80)
          || !validMethod || guardian.consent !== true) {
        return { ok: false, code: 'GUARDIAN_VERIFICATION_REQUIRED', message: 'Verified guardian consent is required for a customer under 18.' };
      }
    }

    var mobile = mobile10(input.mobile);
    var subjectRef = mobile ? ('mobile-ending-' + mobile.slice(-4)) : 'walk-in-without-mobile';
    var consentExpected = !!(mobile && typeof input.promotionalConsent === 'boolean');
    var guardianExpected = ageBand === 'minor';
    var noticeEvent = buildNoticeEvent({
      scope: scope,
      source: input.source,
      subjectRef: subjectRef,
      actor: input.actor,
      operationStep: 'notice',
      ageBand: ageBand,
      consentExpected: consentExpected,
      guardianExpected: guardianExpected
    }, operationId);
    var consentEvent = consentExpected ? buildConsentEvent({
      mobile: mobile,
      granted: input.promotionalConsent,
      source: input.source,
      actor: input.actor,
      reason: input.promotionalConsent ? 'affirmative-intake-consent' : 'not-opted-in',
      operationStep: 'consent'
    }, operationId) : null;
    var guardianEvent = null;
    if (guardianExpected) {
      guardianEvent = {
        id: operationId ? operationEventId(operationId, 'guardian') : uid('guardian'),
        at: nowIso(),
        scope: 'minor-guardian',
        source: safeText(input.source, 100),
        wordingVersion: NOTICE_VERSION,
        guardianName: safeText(guardian.name, 120),
        guardianRelationship: safeText(guardian.relationship, 80),
        guardianVerificationMethod: guardian.verificationMethod,
        consent: true,
        subjectRef: subjectRef,
        ageBand: ageBand,
        actor: actor(input.actor)
      };
      if (operationId) {
        guardianEvent.operationId = operationId;
        guardianEvent.operationStep = 'guardian';
      }
    }

    var plans = [noticePlan(noticeEvent)];
    if (consentEvent) plans.push(consentPlan(consentEvent));
    if (guardianEvent) {
      plans.push({
        key: KEYS.notice,
        event: guardianEvent,
        limit: 10000,
        immutableFields: [
          'scope', 'source', 'wordingVersion', 'guardianName', 'guardianRelationship',
          'guardianVerificationMethod', 'consent', 'subjectRef', 'ageBand'
        ]
      });
    }

    try {
      preflightEventPlans(plans);
      if (consentEvent) suppressionStateStrict();
      var results = [];
      results.push(persistEvent(plans[0]));
      var planIndex = 1;
      var storedConsent = null;
      if (consentEvent) {
        var consentResult = persistEvent(plans[planIndex++]);
        results.push(consentResult);
        storedConsent = consentResult.event;
        reconcileConsentSuppression(storedConsent);
      }
      var storedGuardian = null;
      if (guardianEvent) {
        var guardianResult = persistEvent(plans[planIndex]);
        results.push(guardianResult);
        storedGuardian = guardianResult.event;
      }
      return {
        ok: true,
        operationId: operationId,
        noticeEventId: results[0].event.id,
        consentEventId: storedConsent && storedConsent.id,
        guardianEventId: storedGuardian && storedGuardian.id,
        replayed: results.some(function (result) { return result.replayed; }),
        ageBand: ageBand,
        registerVersion: REGISTER_VERSION
      };
    } catch (error) {
      if (error && error.code === 'IDEMPOTENCY_CONFLICT') {
        return { ok: false, code: error.code, message: error.message, operationId: operationId };
      }
      throw error;
    }
  }
  function createRightsRequest(input) {
    input = input || {};
    var types = ['access', 'correction', 'erasure', 'consent-withdrawal', 'grievance'];
    if (types.indexOf(input.requestType) < 0) throw new Error('Select a valid rights request type');
    if (['customer', 'employee', 'guardian'].indexOf(input.principalType) < 0) throw new Error('Select customer, employee or guardian');
    var identifier = safeText(input.identifier, 120);
    var contact = safeText(input.contact, 160);
    if (!identifier || !contact) throw new Error('Identifier and response contact are required');
    var at = nowIso();
    var row = {
      id: uid('right'),
      requestId: 'RGT-' + Date.now().toString(36).toUpperCase(),
      openedAt: at,
      dueAt: daysFrom(at, RIGHTS_SLA_DAYS),
      principalType: input.principalType,
      identifier: identifier,
      contact: contact,
      requestType: input.requestType,
      source: safeText(input.source || 'in-app-register', 100),
      summary: safeText(input.summary, 500),
      status: 'open',
      identityVerified: false,
      identityMethod: null,
      identityVerifiedAt: null,
      legalHold: 'unchecked',
      legalHoldReason: null,
      responseRef: null,
      closedAt: null,
      actor: actor(input.actor),
      history: [{ at: at, action: 'opened', actor: actor(input.actor) }]
    };
    append(KEYS.rights, row, 5000);
    if (input.requestType === 'consent-withdrawal') {
      var mobile = mobile10(input.contact) || mobile10(input.identifier);
      if (mobile) withdrawPromotion({ mobile: mobile, source: 'rights-' + row.requestId, actor: input.actor });
    }
    return row;
  }
  function rightsRows() {
    var rows = read(KEYS.rights, []);
    return Array.isArray(rows) ? rows : [];
  }
  function mutateRight(id, mutator) {
    var rows = rightsRows();
    var index = rows.findIndex(function (row) { return row && (row.id === id || row.requestId === id); });
    if (index < 0) throw new Error('Rights request not found');
    mutator(rows[index]);
    write(KEYS.rights, rows);
    return rows[index];
  }
  function verifyIdentity(id, input) {
    input = input || {};
    var method = safeText(input.method, 100);
    if (!method) throw new Error('Identity verification method is required');
    return mutateRight(id, function (row) {
      var at = nowIso();
      row.identityVerified = true;
      row.identityMethod = method;
      row.identityVerifiedAt = at;
      row.history.unshift({ at: at, action: 'identity-verified', actor: actor(input.actor) });
    });
  }
  function setLegalHold(id, input) {
    input = input || {};
    if (typeof input.active !== 'boolean') throw new Error('Legal-hold decision is required');
    return mutateRight(id, function (row) {
      var at = nowIso();
      row.legalHold = input.active ? 'active' : 'clear';
      row.legalHoldReason = safeText(input.reason, 240) || null;
      row.history.unshift({ at: at, action: input.active ? 'legal-hold-active' : 'legal-hold-cleared', actor: actor(input.actor) });
    });
  }
  function closeRightsRequest(id, input) {
    input = input || {};
    return mutateRight(id, function (row) {
      if (!row.identityVerified) throw new Error('Verify identity before issuing a response');
      if (row.requestType === 'erasure' && row.legalHold === 'unchecked') throw new Error('Check legal hold before closing an erasure request');
      if (row.requestType === 'erasure' && row.legalHold === 'active' && input.outcome === 'erased') throw new Error('Active legal hold blocks erasure');
      var ref = safeText(input.responseRef, 180);
      if (!ref) throw new Error('Response evidence reference is required');
      var at = nowIso();
      row.status = 'closed';
      row.outcome = safeText(input.outcome || 'responded', 100);
      row.responseRef = ref;
      row.closedAt = at;
      row.history.unshift({ at: at, action: 'closed-' + row.outcome, actor: actor(input.actor) });
    });
  }
  function recordDisclosure(input) {
    input = input || {};
    if (!safeText(input.recipientCategory, 100) || !safeText(input.purpose, 180)
        || !safeText(input.method, 100) || !safeText(input.contractRef, 120)) {
      throw new Error('Recipient, purpose, secure method and contract reference are required');
    }
    return append(KEYS.disclosures, {
      id: uid('disclosure'),
      at: nowIso(),
      recipientCategory: safeText(input.recipientCategory, 100),
      purpose: safeText(input.purpose, 180),
      method: safeText(input.method, 100),
      contractRef: safeText(input.contractRef, 120),
      scope: safeText(input.scope, 160),
      recordCount: Math.max(0, Math.floor(Number(input.recordCount) || 0)),
      actor: actor(input.actor)
    }, 5000);
  }
  function openIncident(input) {
    input = input || {};
    var at = input.awarenessAt ? new Date(input.awarenessAt).toISOString() : nowIso();
    var incident = {
      id: uid('incident'),
      incidentId: 'INC-' + Date.now().toString(36).toUpperCase(),
      awarenessAt: at,
      boardDetailDeadlineAt: daysFrom(at, 3),
      openedAt: nowIso(),
      severity: safeText(input.severity || 'under-assessment', 40),
      summary: safeText(input.summary, 500),
      status: 'open',
      containedAt: null,
      affectedNoticeRef: null,
      boardInitialRef: null,
      boardDetailRef: null,
      actor: actor(input.actor)
    };
    return append(KEYS.incidents, incident, 1000);
  }
  function governance() { return config(); }
  function setGovernance(patch) {
    patch = patch || {};
    var current = config();
    Object.keys(patch).forEach(function (key) { current[key] = patch[key]; });
    current.updatedAt = nowIso();
    write(KEYS.governance, current);
    return current;
  }
  function status() {
    var rights = rightsRows();
    var incidents = read(KEYS.incidents, []);
    var disclosures = read(KEYS.disclosures, []);
    var consent = read(KEYS.consent, []);
    var notices = read(KEYS.notice, []);
    var suppressed = Object.keys(suppressionState().byMobile).length;
    var gov = config();
    return {
      registerVersion: REGISTER_VERSION,
      noticeVersion: NOTICE_VERSION,
      consentVersion: CONSENT_VERSION,
      fieldsApproved: !!gov.fieldRegisterApprovedAt,
      noticeCounselApproved: !!gov.noticeCounselApprovedAt,
      breachPlaybookApproved: !!gov.breachPlaybookApprovedAt,
      breachTabletopCompleted: !!gov.breachTabletopAt,
      retentionApproved: !!gov.retentionApprovedAt,
      processorClausesComplete: !!gov.processorClausesCompleteAt,
      employeeAcknowledgementsComplete: !!gov.employeeAcknowledgementsCompleteAt,
      privacyContactConfigured: !!(gov.privacyContact && (gov.privacyContact.phone || gov.privacyContact.email)),
      openRights: rights.filter(function (r) { return r && r.status !== 'closed'; }).length,
      openIncidents: (Array.isArray(incidents) ? incidents : []).filter(function (r) { return r && r.status !== 'closed'; }).length,
      disclosureCount: Array.isArray(disclosures) ? disclosures.length : 0,
      consentEventCount: Array.isArray(consent) ? consent.length : 0,
      noticeEventCount: Array.isArray(notices) ? notices.length : 0,
      suppressedCount: suppressed,
      rightsSlaDays: RIGHTS_SLA_DAYS,
      enforcement: {
        finalRulesPublished: '2025-11-13',
        consentManagerRule: '2026-11-13',
        mainOperationalProvisions: '2027-05-13'
      }
    };
  }

  return Object.freeze({
    versions: Object.freeze({
      notice: NOTICE_VERSION,
      consent: CONSENT_VERSION,
      register: REGISTER_VERSION
    }),
    keys: KEYS,
    fieldRegister: FIELD_REGISTER,
    retentionSchedule: RETENTION_SCHEDULE,
    notice: notice,
    noticeText: noticeText,
    validatePayload: validatePayload,
    recordNotice: recordNotice,
    recordConsent: recordConsent,
    withdrawPromotion: withdrawPromotion,
    isSuppressed: isSuppressed,
    latestConsent: latestConsent,
    hasPromotionConsent: hasPromotionConsent,
    classifyMessage: classifyMessage,
    authorizeMessage: authorizeMessage,
    captureIntake: captureIntake,
    createRightsRequest: createRightsRequest,
    rightsRows: rightsRows,
    verifyIdentity: verifyIdentity,
    setLegalHold: setLegalHold,
    closeRightsRequest: closeRightsRequest,
    recordDisclosure: recordDisclosure,
    openIncident: openIncident,
    governance: governance,
    setGovernance: setGovernance,
    status: status,
    mobile10: mobile10,
    ageOn: ageOn,
    contactText: contactText
  });
});
