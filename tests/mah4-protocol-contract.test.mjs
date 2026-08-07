import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAH4_CHANNEL,
  MAH4_VERSION,
  MAH4_MODULE_IDS,
  MAH4_TIMING,
  MAH4_MESSAGE_CONTRACTS,
  MAH4_PROTOCOL_STATUS,
  Mah4DeadlineOracle,
  Mah4DedupWindow,
  Mah4LifecycleOracle,
  Mah4SessionOracle,
  acceptMah4Message,
  createMah4InstanceId,
  mah4ContractCounts,
  normalizeLegacyMah4Message,
  validateMah4Envelope,
  validateMah4Payload
} from '../scripts/lib/mah4-protocol-contract.mjs';

class FakeClock {
  now = 0;
  #nextId = 1;
  #tasks = new Map();

  setTimeout(callback, delay) {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#tasks.set(id, { callback, due: this.now + delay });
    return id;
  }

  clearTimeout(id) { this.#tasks.delete(id); }

  advance(milliseconds) {
    this.now += milliseconds;
    while (true) {
      const due = [...this.#tasks.entries()]
        .filter(([, task]) => task.due <= this.now)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!due) return;
      this.#tasks.delete(due[0]);
      due[1].callback();
    }
  }
}

const INSTANCE = 'instance_0123456789abcdef';
const OTHER_INSTANCE = 'instance_fedcba9876543210';
const INIT_ID = 'init-message-0001';
const DISPOSE_ID = 'dispose-message-0001';
const HASH = 'a'.repeat(64);

const slip = () => ({
  name: 'Demo Employee',
  empId: 'EMP-001',
  gender: 'Male',
  period: 'August 2026',
  totalDays: '31',
  salaryDays: '31',
  deductionDays: '0',
  otDays: '—',
  bankName: 'Demo Bank',
  accountNo: '0001',
  ifsc: 'DEMO0001',
  paidMode: 'NEFT',
  paidRef: '',
  paidDate: '',
  basic: 1000,
  hra: 400,
  washing: 100,
  ot: 100,
  pt: 10,
  pf: 20,
  esic: 30,
  advance: 40,
  earnings: 1600,
  deductions: 100,
  net: 1500,
  grossPayable: 1500,
  residual: 0,
  showRes: false,
  netWords: 'One thousand five hundred',
  salaryRemark: '',
  approvedBy: 'Owner'
});

const reportPayloads = {
  payrollRegister: {
    period: 'August 2026', locked: false, preparedBy: '', checkedBy: '', approvedBy: 'Owner',
    rows: [{ sr: 1, empId: 'E1', name: 'Demo', designation: 'CRO', gross: 1000.5, ot: 20.25, pt: 10, pf: 20, esic: 5, advance: 0, net: 985.75 }],
    totals: { gross: 1000.5, ot: 20.25, pt: 10, pf: 20, esic: 5, advance: 0, net: 985.75 }
  },
  statutorySummary: {
    period: 'August 2026', preparedBy: '', approvedBy: 'Owner',
    totals: { emp: 1, pt: 10, pfEE: 20, pfER: 20, esEE: 5, esER: 15, net: 965 }
  },
  statutoryRegister: {
    period: 'August 2026', locked: true, preparedBy: '', approvedBy: 'Owner',
    rows: [{ sr: 1, uan: '', name: 'Demo', empId: 'E1', pfWages: 1000, pfEE: 20, pfER: 20, esicIp: '', esicWages: 1000, esicEE: 5, esicER: 15, pt: 10, gross: 1000 }],
    totals: { emp: 1, pfWages: 1000, pfEE: 20, pfER: 20, esicWages: 1000, esicEE: 5, esicER: 15, pt: 10, gross: 1000 }
  },
  payrollSlip: { slip: slip() },
  qmsEodSummary: {
    date: '2026-08-07', store: 'Demo Store', closedAt: null, closedBy: null,
    kpi: { walkins: 2, purchases: 1, service: 0, non: 1, conv: 50, sales: 1000.5, lost: 500.25, avgWait: 4 },
    lostReasons: [{ reason: 'Price', count: 1, value: 500.25 }],
    cros: [{ name: 'Demo CRO', turns: 2, assigned: 2, purchases: 1, conv: 50, sales: 1000.5, skips: 0 }]
  },
  advanceVoucher: {
    voucher: { voucherNo: 'ADV-1', date: '07 Aug 2026', empName: 'Demo', empId: 'E1', amount: 500, amountWords: 'Five hundred', deductMonth: 'August', deductYear: '2026', recoveryPlan: 'Full in August 2026', outstanding: 500, mode: 'Legacy mode', refNo: '—', reason: 'Demo', approvedBy: 'Owner' }
  },
  hrLetter: {
    letter: { type: 'Salary Certificate', name: 'Demo', empId: 'E1', ref: 'GM/HR/2026/E1', dateNice: '07 Aug 2026', paras: ['One', 'Two', 'Three'], closing: 'Yours sincerely,' }
  },
  fnfSettlement: {
    fnf: { id: 'FNF1', empId: 'E1', name: 'Demo', designation: 'CRO', period: 'August 2026', lastDay: '2026-08-07', earnings: [{ label: 'Salary', amt: 1000 }], recoveries: [{ label: 'Advance', amt: 100 }], totEarn: 1000, totRec: 100, net: 900, netWords: 'Nine hundred', ref: 'GM/FNF/2026/E1', generatedAt: '2026-08-07T10:00:00.000Z', generatedBy: 'Owner', status: 'final' }
  }
};

const fixtures = {
  ST_ACCESS_CONTEXT: { moduleId: 'stock', payload: {} },
  ST_LANG: { moduleId: 'planning', payload: { lang: 'mr' } },
  ST_OPEN_FEATURE: { moduleId: 'stock', payload: { target: 'variance' } },
  ST_SET_DATE: { moduleId: 'planning', payload: { date: '2026-08-07' } },
  ST_UI_MODE: { moduleId: 'planning', payload: { mode: 'mobile' } },
  ST_WA_SENT: { moduleId: 'service', payload: { recordId: 'case.1', text: 'Ready for pickup' } },
  ST_AUDIT: { moduleId: 'planning', payload: { action: 'module.storage.set', storageKeyHash: HASH, beforeBytes: 0, afterBytes: 12 } },
  ST_BACK_HOME: { moduleId: 'planning', payload: {} },
  ST_OPEN_MODULE: { moduleId: 'qms', payload: { id: 'dsr' } },
  ST_PRINT: { moduleId: 'service', payload: { title: 'Service card', css: '', html: '<div>Demo</div>' } },
  ST_REPORT: { moduleId: 'qms', payload: { reportType: 'qmsEodSummary', opts: reportPayloads.qmsEodSummary } },
  ST_REPORT_BATCH: { moduleId: 'payroll', payload: { mode: 'combined', slips: [slip()], fileBase: 'Salary Slips - August 2026' } },
  ST_SHARE: { moduleId: 'service', payload: { file: new Blob(['demo']), text: 'Fallback summary', fileName: 'service-cases.csv', title: 'Service cases', exportId: 'service-cases-csv', scopeId: 'service-cases-open', scopeLabel: 'open service cases', rowCount: 1, purposeId: 'service-register' } },
  ST_WA: { moduleId: 'service', payload: { module: 'service', recordId: 'case.1', templateId: 'ready' } },
  ST_WA_LINK: { moduleId: 'qms', payload: { url: 'https://wa.me/?text=Demo', scopeId: 'qms-eod-summary', purposeId: 'owner-operational-summary' } },
  ST_INIT: { moduleId: 'planning', payload: { language: 'en', date: '2026-08-07', uiMode: 'desktop', capabilities: ['lifecycle-v1'] } },
  ST_READY: { moduleId: 'planning', payload: { runtimeVersion: '1.0.0', capabilities: ['lifecycle-v1'] }, replyTo: INIT_ID },
  ST_ERROR: { moduleId: 'planning', payload: { code: 'runtime.failed', phase: 'runtime', recoverable: true } },
  ST_DISPOSE: { moduleId: 'planning', payload: { reason: 'switch', deadlineMs: MAH4_TIMING.disposeTimeoutMs } },
  ST_DISPOSED: { moduleId: 'planning', payload: { reason: 'switch', cleaned: 4, cleanupErrors: 0 }, replyTo: DISPOSE_ID }
};

function envelopeFor(type, overrides = {}) {
  const fixture = fixtures[type];
  const envelope = {
    channel: MAH4_CHANNEL,
    version: MAH4_VERSION,
    type,
    moduleId: fixture.moduleId,
    instanceId: INSTANCE,
    messageId: `message.${type.toLowerCase()}`,
    payload: fixture.payload
  };
  if (fixture.replyTo) envelope.replyTo = fixture.replyTo;
  return { ...envelope, ...overrides };
}

function contextFor(type, overrides = {}) {
  const fixture = fixtures[type];
  const contract = MAH4_MESSAGE_CONTRACTS[type];
  const context = {
    direction: contract.direction,
    activeModuleId: fixture.moduleId,
    activeInstanceId: INSTANCE,
    sourceMatches: true,
    originMatches: true,
    state: contract.business ? 'READY' : 'READY'
  };
  if (type === 'ST_INIT') context.state = 'FRAME_LOADING';
  if (type === 'ST_READY') {
    context.state = 'INIT_SENT';
    context.expectedReplyTo = INIT_ID;
    context.expectedCapabilities = ['lifecycle-v1'];
  }
  if (type === 'ST_DISPOSE') context.state = 'READY';
  if (type === 'ST_DISPOSED') {
    context.state = 'DISPOSING';
    context.expectedReplyTo = DISPOSE_ID;
    context.expectedDisposeReason = 'switch';
  }
  if (contract.externalAuthorizationRequired) context.authorize = () => true;
  return { ...context, ...overrides };
}

test('MAH-4 freezes 15 business types, five controls, exact directions and participant matrices', () => {
  assert.deepEqual(mah4ContractCounts(), { businessTypes: 15, controlTypes: 5, shellToModule: 8, moduleToShell: 12 });
  assert.equal(Object.keys(MAH4_MESSAGE_CONTRACTS).length, 20);
  assert.equal(new Set(MAH4_MODULE_IDS).size, 11);
  assert.deepEqual(MAH4_MESSAGE_CONTRACTS.ST_ACCESS_CONTEXT.moduleIds, ['stock', 'service', 'dsr', 'expense']);
  assert.deepEqual(MAH4_MESSAGE_CONTRACTS.ST_OPEN_MODULE.moduleIds, ['dsr', 'expense', 'grooming', 'qms', 'service']);
  assert.deepEqual(MAH4_MESSAGE_CONTRACTS.ST_REPORT.moduleIds, ['payroll', 'qms']);
  assert.deepEqual(MAH4_MESSAGE_CONTRACTS.ST_REPORT_BATCH.moduleIds, ['payroll']);
  assert.deepEqual(MAH4_MESSAGE_CONTRACTS.ST_WA.moduleIds, ['service', 'tax']);
  assert.ok(Object.isFrozen(MAH4_MESSAGE_CONTRACTS));
  assert.ok(Object.isFrozen(MAH4_MESSAGE_CONTRACTS.ST_SHARE.fields));
});

test('all 20 canonical contract fixtures pass only with complete bound trust context', () => {
  for (const type of Object.keys(fixtures)) {
    const result = validateMah4Envelope(envelopeFor(type), contextFor(type));
    assert.equal(result.ok, true, `${type}: ${result.code}`);
    assert.equal(result.authorization, MAH4_MESSAGE_CONTRACTS[type].authorization);
  }
  assert.equal(validateMah4Envelope(envelopeFor('ST_LANG')).code, 'trust-context');
  assert.equal(validateMah4Envelope(envelopeFor('ST_LANG'), {}).code, 'context-direction');
});

test('envelope validation rejects downgrade, identity, direction, trust, state and schema failures before authorization', () => {
  const valid = envelopeFor('ST_LANG');
  const context = contextFor('ST_LANG');
  assert.equal(validateMah4Envelope({ ...valid, extra: true }, context).code, 'envelope-keys');
  const missingPayload = { ...valid }; delete missingPayload.payload;
  assert.equal(validateMah4Envelope(missingPayload, context).code, 'envelope-keys');
  assert.equal(validateMah4Envelope({ ...valid, channel: 'other' }, context).code, 'channel');
  assert.equal(validateMah4Envelope({ ...valid, version: 2 }, context).code, 'version');
  assert.equal(validateMah4Envelope({ ...valid, type: 'ST_UNKNOWN' }, context).code, 'type');
  assert.equal(validateMah4Envelope({ ...valid, moduleId: 'unknown' }, context).code, 'module');
  assert.equal(validateMah4Envelope({ ...valid, instanceId: 'short' }, context).code, 'instance');
  assert.equal(validateMah4Envelope({ ...valid, messageId: 'short' }, context).code, 'message-id');
  assert.equal(validateMah4Envelope(valid, { ...context, direction: 'module-to-shell' }).code, 'direction');
  assert.equal(validateMah4Envelope(valid, { ...context, activeModuleId: 'qms' }).code, 'active-module');
  assert.equal(validateMah4Envelope(valid, { ...context, activeInstanceId: OTHER_INSTANCE }).code, 'active-instance');
  assert.equal(validateMah4Envelope(valid, { ...context, sourceMatches: false }).code, 'source');
  assert.equal(validateMah4Envelope(valid, { ...context, originMatches: false }).code, 'origin');
  assert.equal(validateMah4Envelope(valid, { ...context, state: 'INIT_SENT' }).code, 'state');
  assert.equal(validateMah4Envelope({ ...valid, payload: { ...valid.payload, unknown: 1 } }, context).code, 'payload-unknown-field');
});

test('module participants, feature targets, transitions, report ownership and WhatsApp pairs are executable rules', () => {
  const feature = envelopeFor('ST_OPEN_FEATURE');
  assert.equal(validateMah4Envelope({ ...feature, payload: { target: 'payrun' } }, contextFor('ST_OPEN_FEATURE')).code, 'feature-target-mismatch');

  const transition = envelopeFor('ST_OPEN_MODULE');
  assert.equal(validateMah4Envelope({ ...transition, payload: { id: 'tax' } }, contextFor('ST_OPEN_MODULE')).code, 'module-target-mismatch');
  assert.equal(validateMah4Envelope({ ...transition, moduleId: 'planning' }, { ...contextFor('ST_OPEN_MODULE'), activeModuleId: 'planning' }).code, 'module-not-authorized-for-type');

  const report = envelopeFor('ST_REPORT');
  assert.equal(validateMah4Envelope({ ...report, moduleId: 'payroll' }, { ...contextFor('ST_REPORT'), activeModuleId: 'payroll' }).code, 'report-module-mismatch');

  const wa = envelopeFor('ST_WA');
  assert.equal(validateMah4Envelope({ ...wa, payload: { ...wa.payload, module: 'tax' } }, contextFor('ST_WA')).code, 'payload-module-mismatch');
  assert.equal(validateMah4Envelope({ ...wa, payload: { ...wa.payload, templateId: 'ca_pack' } }, contextFor('ST_WA')).code, 'wa-template-mismatch');

  const link = envelopeFor('ST_WA_LINK');
  assert.equal(validateMah4Envelope({ ...link, payload: { ...link.payload, scopeId: 'qms-customer-message' } }, contextFor('ST_WA_LINK')).code, 'wa-scope-purpose-mismatch');
});

test('reply correlation, capability echo, disposal reason and exact duplicate-control identity fail closed', () => {
  const ready = envelopeFor('ST_READY');
  assert.equal(validateMah4Envelope({ ...ready, replyTo: 'wrong-init-id' }, contextFor('ST_READY')).code, 'reply-mismatch');
  assert.equal(validateMah4Envelope(ready, { ...contextFor('ST_READY'), expectedReplyTo: undefined }).code, 'expected-reply-context');
  assert.equal(validateMah4Envelope(ready, { ...contextFor('ST_READY'), expectedCapabilities: ['other'] }).code, 'capabilities-mismatch');
  const noReply = { ...ready }; delete noReply.replyTo;
  assert.equal(validateMah4Envelope(noReply, contextFor('ST_READY')).code, 'reply-required');

  const disposed = envelopeFor('ST_DISPOSED');
  assert.equal(validateMah4Envelope(disposed, { ...contextFor('ST_DISPOSED'), expectedDisposeReason: 'home' }).code, 'dispose-reason-mismatch');

  const init = envelopeFor('ST_INIT');
  const duplicateContext = contextFor('ST_INIT', { state: 'INIT_SENT', previousControlEnvelope: init });
  assert.equal(validateMah4Envelope(init, duplicateContext).ok, true);
  assert.equal(validateMah4Envelope({ ...init, messageId: 'different-init-0001' }, duplicateContext).code, 'duplicate-control-mismatch');
  assert.equal(validateMah4Envelope(init, contextFor('ST_INIT', { state: 'INIT_SENT' })).code, 'duplicate-control-context');

  const error = envelopeFor('ST_ERROR');
  assert.equal(validateMah4Envelope({ ...error, payload: { code: 'wrong.phase', phase: 'init', recoverable: true } }, contextFor('ST_ERROR')).code, 'error-phase-state');
  assert.equal(validateMah4Envelope(error, contextFor('ST_ERROR')).ok, true);
});

test('external record, manifest and protected-sink authorization is mandatory and exception-safe', () => {
  const share = envelopeFor('ST_SHARE');
  const base = contextFor('ST_SHARE');
  const noAuthorize = { ...base }; delete noAuthorize.authorize;
  assert.equal(validateMah4Envelope(share, noAuthorize).code, 'authorization-context');
  assert.equal(validateMah4Envelope(share, { ...base, authorize: () => false }).code, 'unauthorized');
  assert.equal(validateMah4Envelope(share, { ...base, authorize: () => Promise.resolve(true) }).code, 'unauthorized');
  assert.equal(validateMah4Envelope(share, { ...base, authorize: () => { throw new Error('no'); } }).code, 'authorization-error');
  let request;
  const accepted = validateMah4Envelope(share, { ...base, authorize: value => { request = value; return true; } });
  assert.equal(accepted.ok, true);
  assert.equal(request.type, 'ST_SHARE');
  assert.equal(request.moduleId, 'service');
  assert.equal(request.authorization, MAH4_MESSAGE_CONTRACTS.ST_SHARE.authorization);
  assert.equal(request.payload.fileName, share.payload.fileName);
  assert.equal(request.payload.text, share.payload.text);
  assert.equal(request.payload.file.size, share.payload.file.size);
  assert.ok(Object.isFrozen(request));
  assert.ok(Object.isFrozen(request.payload));
  assert.ok(Object.isFrozen(accepted.envelope));

  let mutationBlocked = false;
  const protectedResult = validateMah4Envelope(share, {
    ...base,
    authorize: value => {
      try { value.payload.fileName = '../escape'; } catch { mutationBlocked = true; }
      return true;
    }
  });
  assert.equal(protectedResult.ok, true);
  assert.equal(mutationBlocked, true);
  assert.equal(protectedResult.envelope.payload.fileName, 'service-cases.csv');
});

test('payload limits reject unknown keys, invalid dates, unsafe files and unsafe WhatsApp URLs', () => {
  assert.equal(validateMah4Payload('ST_LANG', { lang: 'fr' }).code, 'payload-invalid:lang');
  assert.equal(validateMah4Payload('ST_SET_DATE', { date: '2026-02-30' }).code, 'payload-invalid:date');
  assert.equal(validateMah4Payload('ST_UI_MODE', { mode: 'tablet' }).code, 'payload-invalid:mode');
  assert.equal(validateMah4Payload('ST_PRINT', { title: 'x', css: '', html: '<p>x</p>', fileBase: '../escape' }).code, 'payload-invalid:fileBase');
  assert.equal(validateMah4Payload('ST_PRINT', { title: 'x', css: '', html: '<p>x</p>', fileBase: 'CON.txt' }).code, 'payload-invalid:fileBase');
  assert.equal(validateMah4Payload('ST_PRINT', { title: 'x', css: '', html: '<p>x</p>', fileBase: 'CON .txt' }).code, 'payload-invalid:fileBase');
  assert.equal(validateMah4Payload('ST_PRINT', { title: 'x', css: '', html: '<p>x</p>', fileBase: 'report.pdf' }).ok, true);

  const link = fixtures.ST_WA_LINK.payload;
  for (const url of ['http://wa.me/919999999999?text=x', 'https://wa.me.evil.test/?text=x', 'https://wa.me/path?text=x', 'https://wa.me/919999999999?foo=x', 'https://user@wa.me/?text=x', 'https://wa.me/?text=x#fragment']) {
    assert.equal(validateMah4Payload('ST_WA_LINK', { ...link, url }).code, 'payload-invalid:url', url);
  }
  assert.equal(validateMah4Payload('ST_WA_LINK', { ...link, url: 'https://wa.me/919999999999?text=Hello' }).ok, true);
});

test('share accepts file, text and current file-plus-fallback-text while retaining strict metadata and byte caps', () => {
  const base = { fileName: 'export.csv', title: 'Export', exportId: 'export-1', scopeId: 'scope-1', scopeLabel: 'scope', rowCount: 1, purposeId: 'reporting' };
  assert.equal(validateMah4Payload('ST_SHARE', { ...base, file: new Blob(['x']) }).ok, true);
  assert.equal(validateMah4Payload('ST_SHARE', { ...base, text: 'x' }).ok, true);
  assert.equal(validateMah4Payload('ST_SHARE', { ...base, file: new Blob(['x']), text: 'fallback' }).ok, true);
  assert.equal(validateMah4Payload('ST_SHARE', base).code, 'file-or-text-required');
  assert.equal(validateMah4Payload('ST_SHARE', { ...base, file: null }).code, 'payload-invalid:file');
  const oversized = new Blob([new Uint8Array(10_485_761)]);
  assert.equal(validateMah4Payload('ST_SHARE', { ...base, file: oversized }).code, 'payload-invalid:file');
});

test('all eight report variants and the batch slip schema are exact, bounded and value-free on failure', () => {
  for (const [reportType, opts] of Object.entries(reportPayloads)) {
    assert.equal(validateMah4Payload('ST_REPORT', { reportType, opts }).ok, true, reportType);
  }
  assert.equal(validateMah4Payload('ST_REPORT', { reportType: 'payrollSlip', opts: { slip: { ...slip(), extra: 'no' } } }).code, 'report-schema');
  assert.equal(validateMah4Payload('ST_REPORT', { reportType: 'payrollSlip', opts: { slip: { ...slip(), net: 999 } } }).code, 'report-schema');
  assert.equal(validateMah4Payload('ST_REPORT', { reportType: 'qmsEodSummary', opts: { ...reportPayloads.qmsEodSummary, kpi: { ...reportPayloads.qmsEodSummary.kpi, conv: 100.5 } } }).code, 'report-schema');
  assert.equal(validateMah4Payload('ST_REPORT', { reportType: 'fnfSettlement', opts: { fnf: { ...reportPayloads.fnfSettlement.fnf, net: 901 } } }).code, 'report-schema');
  assert.equal(validateMah4Payload('ST_REPORT_BATCH', { mode: 'zip', slips: [], fileBase: 'Slips' }).code, 'payload-invalid:slips');
  assert.equal(validateMah4Payload('ST_REPORT_BATCH', { mode: 'zip', slips: [slip()], fileBase: 'Slips' }).ok, true);

  assert.equal(validateMah4Payload('ST_INIT', { language: 'en', date: '2026-08-07', uiMode: 'desktop', capabilities: new Array(1) }).code, 'payload-invalid:capabilities');
  const capabilitiesWithProperty = ['lifecycle-v1']; capabilitiesWithProperty.evil = 'x';
  assert.equal(validateMah4Payload('ST_INIT', { language: 'en', date: '2026-08-07', uiMode: 'desktop', capabilities: capabilitiesWithProperty }).code, 'payload-invalid:capabilities');
  assert.equal(validateMah4Payload('ST_REPORT_BATCH', { mode: 'zip', slips: new Array(1), fileBase: 'Slips' }).code, 'payload-invalid:slips');

  const dangerous = Object.assign(Object.create(null), reportPayloads.payrollSlip, { constructor: {} });
  assert.equal(validateMah4Payload('ST_REPORT', { reportType: 'payrollSlip', opts: dangerous }).code, 'payload-invalid:opts');
});

test('audit schema is metadata-only and raw legacy before/after migration remains blocked', () => {
  assert.equal(validateMah4Payload('ST_AUDIT', fixtures.ST_AUDIT.payload).ok, true);
  assert.equal(validateMah4Payload('ST_AUDIT', { action: 'module.storage.set', detail: { key: 'customer' }, before: 'PII', after: 'PII' }).code, 'payload-unknown-field');
  const raw = { type: 'ST_AUDIT', action: 'module.storage.set', detail: { module: 'qms', key: 'customer', beforeBytes: 3, afterBytes: 3 }, before: 'old', after: 'new' };
  assert.equal(normalizeLegacyMah4Message(raw, contextFor('ST_AUDIT', { messageId: 'legacy-audit-0001' })).code, 'blocked-until-raw-before-after-redaction-retention-decision');
});

test('legacy adapter binds trusted identity, preserves share fallback variants and drops undefined optional fields', () => {
  const share = { type: 'ST_SHARE', file: new Blob(['csv']), text: 'fallback', fileName: 'service.csv', title: 'Service', exportId: 'service-csv', scopeId: 'service-open', scopeLabel: 'open cases', rowCount: 1, purposeId: 'service-register' };
  const context = contextFor('ST_SHARE', { messageId: 'legacy-share-0001' });
  const both = normalizeLegacyMah4Message(share, context);
  assert.equal(both.ok, true);
  assert.equal(both.envelope.moduleId, 'service');
  assert.equal(both.envelope.instanceId, INSTANCE);
  assert.ok(both.envelope.payload.file instanceof Blob);
  assert.equal(both.envelope.payload.text, 'fallback');

  const fallback = normalizeLegacyMah4Message({ ...share, file: null }, { ...context, messageId: 'legacy-share-0002' });
  assert.equal(fallback.ok, true);
  assert.equal(Object.hasOwn(fallback.envelope.payload, 'file'), false);
  assert.equal(fallback.envelope.payload.text, 'fallback');

  const print = normalizeLegacyMah4Message({ type: 'ST_PRINT', title: 'Card', css: '', html: '<p>x</p>', orientation: undefined, fileBase: undefined }, contextFor('ST_PRINT', { messageId: 'legacy-print-0001' }));
  assert.equal(print.ok, true);
  assert.deepEqual(print.envelope.payload, { title: 'Card', css: '', html: '<p>x</p>' });

  assert.equal(normalizeLegacyMah4Message({ ...share, moduleId: 'tax' }, context).code, 'legacy-unknown-field');
  assert.equal(normalizeLegacyMah4Message(share, { ...context, originMatches: false }).code, 'legacy-trust');
  assert.equal(normalizeLegacyMah4Message({ type: 'ST_READY' }, context).code, 'legacy-type');
});

test('composed compatibility path normalizes once, format-locks per type and deduplicates before dispatch', () => {
  const legacy = { type: 'ST_BACK_HOME' };
  const legacyContext = contextFor('ST_BACK_HOME', { messageId: 'legacy-back-0001' });
  const window = new Mah4DedupWindow(4);
  assert.equal(acceptMah4Message(legacy, legacyContext, window).ok, true);
  assert.equal(acceptMah4Message(legacy, legacyContext, window).code, 'duplicate');

  const canonical = envelopeFor('ST_BACK_HOME', { messageId: 'canonical-back-0001' });
  assert.equal(acceptMah4Message(canonical, contextFor('ST_BACK_HOME'), window).code, 'compatibility-format-conflict');

  const freshCanonical = { ...canonical, instanceId: OTHER_INSTANCE };
  assert.equal(acceptMah4Message(freshCanonical, contextFor('ST_BACK_HOME', { activeInstanceId: OTHER_INSTANCE }), window).ok, true);
  assert.equal(acceptMah4Message({ ...canonical, channel: 'downgrade' }, contextFor('ST_BACK_HOME'), new Mah4DedupWindow()).code, 'channel');
  assert.equal(acceptMah4Message(canonical, contextFor('ST_BACK_HOME'), {}).code, 'dedup-context');
});

test('deduplication is collision-safe, bounded per instance, isolated and explicitly clearable', () => {
  const window = new Mah4DedupWindow(2);
  assert.equal(window.accept(INSTANCE, 'message-0001'), true);
  assert.equal(window.accept(INSTANCE, 'message-0001'), false);
  assert.equal(window.accept(OTHER_INSTANCE, 'message-0001'), true);
  assert.equal(window.sizeFor(INSTANCE), 1);
  assert.equal(window.sizeFor(OTHER_INSTANCE), 1);
  window.accept(INSTANCE, 'message-0002');
  window.accept(INSTANCE, 'message-0003');
  assert.equal(window.sizeFor(INSTANCE), 2);
  assert.equal(window.accept(INSTANCE, 'message-0001'), true);
  assert.equal(window.clearInstance(INSTANCE), 2);
  assert.equal(window.sizeFor(INSTANCE), 0);
  assert.throws(() => window.accept(`${INSTANCE}\u0000x`, 'message-0004'), /invalid dedup identity/);

  const bounded = new Mah4DedupWindow(1);
  for (let index = 0; index < MAH4_TIMING.dedupInstanceWindows + 1; index += 1) {
    bounded.accept(`instance_${String(index).padStart(16, '0')}`, `message-${String(index).padStart(8, '0')}`);
  }
  assert.equal(bounded.instanceCount, MAH4_TIMING.dedupInstanceWindows);

  const formatOnly = new Mah4DedupWindow(1);
  for (let index = 0; index < MAH4_TIMING.dedupInstanceWindows + 1; index += 1) {
    formatOnly.acceptFormat(`instance_${String(index).padStart(16, '0')}`, 'ST_BACK_HOME', 'canonical');
  }
  assert.equal(formatOnly.instanceCount, MAH4_TIMING.dedupInstanceWindows);
});

test('deadline oracle starts, cancels and fires correlated ready/dispose deadlines at exact synthetic times', () => {
  const clock = new FakeClock();
  const session = new Mah4SessionOracle('qms', INSTANCE);
  const base = { moduleId: 'qms', instanceId: INSTANCE };
  session.apply({ ...base, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  const deadlines = new Mah4DeadlineOracle(clock);
  const ticket = deadlines.arm('ready', INIT_ID, event => session.apply({ ...base, ...event }));
  assert.deepEqual(ticket, { kind: 'ready', correlationId: INIT_ID, delayMs: 5000, idempotent: false });
  assert.equal(deadlines.arm('ready', INIT_ID, () => {}).idempotent, true);
  assert.throws(() => deadlines.arm('ready', 'other-init-0001', () => {}), /correlation mismatch/);
  clock.advance(4999);
  assert.equal(session.state, 'INIT_SENT');
  clock.advance(1);
  assert.equal(session.state, 'FORCED_CLOSED');
  assert.equal(deadlines.size, 0);

  const cancelClock = new FakeClock();
  const cancelDeadlines = new Mah4DeadlineOracle(cancelClock);
  let fired = 0;
  cancelDeadlines.arm('dispose', DISPOSE_ID, () => { fired += 1; });
  assert.equal(cancelDeadlines.cancel('dispose', 'wrong-dispose-id'), false);
  assert.equal(cancelDeadlines.cancel('dispose', DISPOSE_ID), true);
  cancelClock.advance(MAH4_TIMING.disposeTimeoutMs);
  assert.equal(fired, 0);
  assert.equal(cancelDeadlines.size, 0);
});

test('session oracle enforces exact INIT/READY and DISPOSE/DISPOSED correlation and idempotence', () => {
  const session = new Mah4SessionOracle('planning', INSTANCE);
  const base = { moduleId: 'planning', instanceId: INSTANCE };
  assert.deepEqual(session.apply({ ...base, type: 'FRAME_LOADED', initMessageId: INIT_ID }), { ok: true, code: 'ok', state: 'INIT_SENT', idempotent: false });
  assert.equal(session.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: 'wrong-init-id' }).code, 'ready-correlation');
  assert.equal(session.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID }).state, 'READY');
  assert.equal(session.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID }).idempotent, true);
  assert.equal(session.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0002', replyTo: INIT_ID }).code, 'ready-mismatch');
  assert.equal(session.apply({ ...base, type: 'DISPOSE_REQUESTED', messageId: DISPOSE_ID, reason: 'switch' }).state, 'DISPOSING');
  assert.equal(session.apply({ ...base, type: 'DISPOSE_REQUESTED', messageId: DISPOSE_ID, reason: 'switch' }).idempotent, true);
  assert.equal(session.apply({ ...base, type: 'DISPOSED_RECEIVED', messageId: 'disposed-message-0001', replyTo: DISPOSE_ID, reason: 'home' }).code, 'disposed-correlation');
  assert.equal(session.apply({ ...base, type: 'DISPOSED_RECEIVED', messageId: 'disposed-message-0001', replyTo: DISPOSE_ID, reason: 'switch' }).state, 'DISPOSED');
  assert.equal(session.apply({ ...base, type: 'DISPOSED_RECEIVED', messageId: 'disposed-message-0001', replyTo: DISPOSE_ID, reason: 'switch' }).idempotent, true);
});

test('session oracle rejects stale navigation, repeated frame loads, late acknowledgements and models deterministic timeouts', () => {
  const repeated = new Mah4SessionOracle('planning', INSTANCE);
  const base = { moduleId: 'planning', instanceId: INSTANCE };
  repeated.apply({ ...base, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  repeated.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID });
  assert.equal(repeated.apply({ ...base, type: 'FRAME_LOADED', initMessageId: 'init-message-0002' }).code, 'repeated-frame-load');
  assert.equal(repeated.state, 'FORCED_CLOSED');

  const readyTimeout = new Mah4SessionOracle('qms', INSTANCE);
  const qms = { moduleId: 'qms', instanceId: INSTANCE };
  readyTimeout.apply({ ...qms, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  assert.equal(readyTimeout.apply({ ...qms, type: 'READY_TIMEOUT', replyTo: INIT_ID }).code, 'ready-timeout');
  assert.equal(readyTimeout.apply({ ...qms, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID }).code, 'invalid-transition');

  const disposeTimeout = new Mah4SessionOracle('qms', INSTANCE);
  disposeTimeout.apply({ ...qms, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  disposeTimeout.apply({ ...qms, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID });
  disposeTimeout.apply({ ...qms, type: 'DISPOSE_REQUESTED', messageId: DISPOSE_ID, reason: 'reload' });
  assert.equal(disposeTimeout.apply({ ...qms, type: 'DISPOSE_TIMEOUT', replyTo: DISPOSE_ID }).code, 'dispose-timeout');
  assert.equal(disposeTimeout.state, 'FORCED_CLOSED');
  assert.equal(disposeTimeout.apply({ ...qms, type: 'FRAME_ERROR' }).idempotent, true);
  assert.equal(disposeTimeout.apply({ ...qms, instanceId: OTHER_INSTANCE, type: 'FRAME_ERROR' }).code, 'stale-identity');

  const early = new Mah4SessionOracle('qms', INSTANCE);
  assert.equal(early.apply({ ...qms, type: 'DISPOSE_REQUESTED', messageId: DISPOSE_ID, reason: 'home' }).code, 'forced-before-init');
  assert.equal(early.state, 'FORCED_CLOSED');
});

test('session error policy keeps only recoverable runtime/dispose errors alive and closes unsafe boot/fatal errors', () => {
  const base = { moduleId: 'planning', instanceId: INSTANCE };
  const boot = new Mah4SessionOracle('planning', INSTANCE);
  boot.apply({ ...base, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  assert.equal(boot.apply({ ...base, type: 'ERROR_RECEIVED', code: 'boot.failed', phase: 'init', recoverable: true }).state, 'FORCED_CLOSED');

  const runtime = new Mah4SessionOracle('planning', INSTANCE);
  runtime.apply({ ...base, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  runtime.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID });
  assert.equal(runtime.apply({ ...base, type: 'ERROR_RECEIVED', code: 'wrong.phase', phase: 'dispose', recoverable: true }).code, 'error-phase-state');
  assert.equal(runtime.state, 'READY');
  assert.equal(runtime.apply({ ...base, type: 'ERROR_RECEIVED', code: 'retry.later', phase: 'runtime', recoverable: true }).state, 'READY');
  assert.equal(runtime.apply({ ...base, type: 'ERROR_RECEIVED', code: 'fatal.error', phase: 'runtime', recoverable: false }).state, 'FORCED_CLOSED');

  const disposing = new Mah4SessionOracle('planning', INSTANCE);
  disposing.apply({ ...base, type: 'FRAME_LOADED', initMessageId: INIT_ID });
  disposing.apply({ ...base, type: 'READY_RECEIVED', messageId: 'ready-message-0001', replyTo: INIT_ID });
  disposing.apply({ ...base, type: 'DISPOSE_REQUESTED', messageId: DISPOSE_ID, reason: 'home' });
  assert.equal(disposing.apply({ ...base, type: 'ERROR_RECEIVED', code: 'wrong.phase', phase: 'runtime', recoverable: true }).code, 'error-phase-state');
  assert.equal(disposing.apply({ ...base, type: 'ERROR_RECEIVED', code: 'cleanup.retry', phase: 'dispose', recoverable: true }).state, 'DISPOSING');
});

test('lifecycle cleanup is instance-owned, reverse-order, failure-isolated, reentrancy-safe and repeat-safe', () => {
  const registry = new Mah4LifecycleOracle('qms', INSTANCE);
  const calls = [];
  let nestedResult;
  registry.register('cleanup', () => calls.push('first'));
  registry.register('observer', () => { calls.push('throws'); throw new Error('no'); });
  registry.register('cleanup', () => {
    calls.push('reentrant');
    nestedResult = registry.dispose('switch');
    assert.ok(Object.isFrozen(nestedResult));
    assert.equal(nestedResult.pending, true);
    assert.throws(() => { nestedResult.cleaned = 9000; }, TypeError);
    assert.equal(registry.register('cleanup', () => calls.push('registered-during-dispose')), false);
  });
  const result = registry.dispose('switch');
  assert.deepEqual(calls, ['reentrant', 'registered-during-dispose', 'throws', 'first']);
  assert.notEqual(nestedResult, result);
  assert.equal(result.cleaned, 3);
  assert.equal(result.cleanupErrors, 1);
  assert.equal(result.complete, true);
  assert.equal(result.moduleId, 'qms');
  assert.equal(result.instanceId, INSTANCE);
  assert.equal(registry.size, 0);
  assert.equal(registry.dispose('home'), result);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.errors));
  assert.ok(Object.isFrozen(result.errors[0]));

  let late = 0;
  assert.equal(registry.register('cleanup', () => { late += 1; }), false);
  assert.equal(late, 1);
});

test('lifecycle wrappers clear timers, listeners, observers and subscriptions without treating thenables as complete', () => {
  const registry = new Mah4LifecycleOracle('dsr', INSTANCE);
  const calls = [];
  let removedCapture;
  let replacementRemoveCalled = false;
  const target = {
    addEventListener(type) { calls.push(`add:${type}`); },
    removeEventListener(type, listener, capture) { removedCapture = capture; calls.push(`remove:${type}`); }
  };
  const observer = { disconnect: () => calls.push('observer') };
  const listenerOptions = { capture: false, passive: true };
  registry.trackTimeout(1, handle => calls.push(`timeout:${handle}`));
  registry.trackInterval(2, handle => calls.push(`interval:${handle}`));
  registry.addListener(target, 'message', () => {}, listenerOptions);
  listenerOptions.capture = true;
  target.removeEventListener = () => { replacementRemoveCalled = true; };
  registry.trackObserver(observer);
  observer.disconnect = () => calls.push('observer-replaced');
  registry.trackSubscription(() => calls.push('subscription'));
  registry.register('cleanup', () => Promise.resolve());
  const result = registry.dispose('reload');
  assert.deepEqual(calls, ['add:message', 'subscription', 'observer', 'remove:message', 'interval:2', 'timeout:1']);
  assert.equal(result.cleaned, 5);
  assert.equal(result.cleanupErrors, 1);
  assert.equal(result.errors[0].code, 'async-cleanup-not-supported');
  assert.equal(removedCapture, false);
  assert.equal(replacementRemoveCalled, false);
  assert.equal(registry.disposed, true);
});

test('instance IDs require an injectable secure random source and protocol status does not overclaim runtime evidence', () => {
  const id = createMah4InstanceId({
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
      return bytes;
    }
  });
  assert.equal(id, 'mah4_000102030405060708090a0b0c0d0e0f');
  assert.throws(() => createMah4InstanceId(null), /secure random source unavailable/);
  assert.equal(MAH4_TIMING.readyTimeoutMs, 5000);
  assert.equal(MAH4_TIMING.disposeTimeoutMs, 1500);
  assert.equal(MAH4_TIMING.dedupWindowEntriesPerInstance, 256);
  assert.equal(MAH4_PROTOCOL_STATUS.runtimeLoaded, false);
  assert.equal(MAH4_PROTOCOL_STATUS.stageAComplete, true);
  assert.equal(MAH4_PROTOCOL_STATUS.stage, 'stage-a-engineering-complete-runtime-blocked');
  assert.equal(MAH4_PROTOCOL_STATUS.api23TimingAccepted, false);
  assert.equal(MAH4_PROTOCOL_STATUS.api23InstanceEntropyAccepted, false);
  assert.equal(MAH4_PROTOCOL_STATUS.expectedOriginAccepted, false);
  assert.equal(MAH4_PROTOCOL_STATUS.deadlineModel, 'synthetic-injected-scheduler');
  assert.equal(MAH4_PROTOCOL_STATUS.parserLimitationsAcceptedForStageB, false);
  assert.match(MAH4_PROTOCOL_STATUS.auditMigration, /^blocked-/);
});
