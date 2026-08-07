export const MAH4_CHANNEL = 'saagar.module';
export const MAH4_VERSION = 1;

export const MAH4_MODULE_IDS = Object.freeze([
  'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
  'cro_audit', 'payroll', 'leave', 'tax', 'planning'
]);

export const MAH4_TIMING = Object.freeze({
  readyTimeoutMs: 5000,
  disposeTimeoutMs: 1500,
  dedupWindowEntriesPerInstance: 256,
  dedupInstanceWindows: 16,
  maxCleanupEntriesPerInstance: 10_000
});

export const MAH4_STATES = Object.freeze([
  'FRAME_LOADING', 'INIT_SENT', 'READY', 'DISPOSING', 'DISPOSED', 'FORCED_CLOSED'
]);

const BUSINESS_TYPES = new Set([
  'ST_ACCESS_CONTEXT', 'ST_LANG', 'ST_OPEN_FEATURE', 'ST_SET_DATE', 'ST_UI_MODE', 'ST_WA_SENT',
  'ST_AUDIT', 'ST_BACK_HOME', 'ST_OPEN_MODULE', 'ST_PRINT', 'ST_REPORT', 'ST_REPORT_BATCH',
  'ST_SHARE', 'ST_WA', 'ST_WA_LINK'
]);
const CONTROL_TYPES = new Set(['ST_INIT', 'ST_READY', 'ST_ERROR', 'ST_DISPOSE', 'ST_DISPOSED']);
const DISPOSE_REASONS = Object.freeze(['home', 'switch', 'reload', 'error']);
const ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const INSTANCE_PATTERN = /^[A-Za-z0-9_-]+$/;
const SIMPLE_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const textEncoder = new TextEncoder();

const ALL_MODULES = [...MAH4_MODULE_IDS];
const ACCESS_MODULES = ['stock', 'service', 'dsr', 'expense'];
const OPEN_MODULE_PRODUCERS = ['dsr', 'expense', 'grooming', 'qms', 'service'];
const PRINT_MODULES = ['cro_audit', 'expense', 'leave', 'payroll', 'qms', 'service', 'stock', 'tax'];
const REPORT_MODULES = ['payroll', 'qms'];
const SHARE_MODULES = ['dsr', 'expense', 'grooming', 'leave', 'payroll', 'qms', 'service', 'stock', 'tax'];
const WA_MODULES = ['service', 'tax'];
const WA_LINK_MODULES = ['cro_audit', 'dsr', 'payroll', 'qms'];
const OPEN_FEATURE_TARGETS = Object.freeze({
  payroll: ['advance', 'payrun', 'slip', 'statutory', 'attendance', 'employees'],
  expense: ['cash', 'petty', 'close', 'budget', 'ledger', 'vendors'],
  tax: ['gst', 'advance', 'tds', 'calendar'],
  stock: ['opening', 'closing', 'variance', 'lock', 'movement'],
  dsr: ['register', 'scoring'],
  qms: ['walkin', 'rotation', 'followups'],
  grooming: ['checklist', 'monthly'],
  cro_audit: ['audit', 'dashboard', 'history'],
  leave: ['calendar', 'agendas'],
  service: ['new', 'estimate', 'status'],
  planning: []
});
const OPEN_MODULE_TARGETS = Object.freeze({
  dsr: 'stock',
  expense: 'tax',
  grooming: 'qms',
  qms: 'dsr',
  service: 'qms'
});
const WA_LINK_SCOPE_PURPOSE = Object.freeze({
  cro_audit: Object.freeze({ 'cro-review-request': 'promotional-review-solicitation' }),
  dsr: Object.freeze({
    'dsr-nonbuyer-followup': 'promotional-customer-message',
    'dsr-day-summary': 'owner-operational-summary'
  }),
  payroll: Object.freeze({
    'payroll-salary-message': 'employee-payroll-communication',
    'payroll-advance-message': 'employee-payroll-communication',
    'payroll-hr-message': 'employee-hr-communication'
  }),
  qms: Object.freeze({
    'qms-customer-message': 'customer-relationship-message',
    'qms-followup-message': 'promotional-customer-message',
    'qms-eod-summary': 'owner-operational-summary'
  })
});
const REPORT_TYPES = [
  'payrollRegister', 'payrollSlip', 'statutorySummary', 'statutoryRegister',
  'qmsEodSummary', 'advanceVoucher', 'hrLetter', 'fnfSettlement'
];

const stringField = (maxLength, options = {}) => ({ kind: 'string', maxLength, ...options });
const integerField = (min, max, options = {}) => ({ kind: 'integer', min, max, ...options });
const numberField = (min, max, options = {}) => ({ kind: 'number', min, max, ...options });
const booleanField = (options = {}) => ({ kind: 'boolean', ...options });
const jsonObjectField = (maxBytes, options = {}) => ({ kind: 'json-object', maxBytes, ...options });
const arrayField = (maxItems, item, options = {}) => ({ kind: 'array', maxItems, item, ...options });
const objectField = (fields, options = {}) => ({ kind: 'object', fields, ...options });
const binaryField = (maxBytes, options = {}) => ({ kind: 'binary', maxBytes, ...options });
const urlField = (maxLength, options = {}) => ({ kind: 'approved-whatsapp-url', maxLength, ...options });
const safeFileField = (maxLength, options = {}) => ({ kind: 'safe-file-name', maxLength, ...options });

const requiredText = maxLength => stringField(maxLength, { required: true });
const requiredMoney = numberField(-1_000_000_000_000, 1_000_000_000_000, { required: true });
const requiredRoundedMoney = integerField(-1_000_000_000_000, 1_000_000_000_000, { required: true });
const requiredCount = integerField(0, 1_000_000, { required: true });
const requiredPositiveCount = integerField(1, 1_000_000, { required: true });
const payrollSlipSchema = objectField({
  name: requiredText(160),
  empId: requiredText(128),
  gender: stringField(8, { enum: ['Male', 'Female', '—'], required: true }),
  period: requiredText(64),
  totalDays: requiredText(32),
  salaryDays: requiredText(32),
  deductionDays: requiredText(32),
  otDays: requiredText(32),
  bankName: requiredText(160),
  accountNo: requiredText(64),
  ifsc: requiredText(32),
  paidMode: stringField(16, { enum: ['NEFT', 'IMPS', 'UPI', 'RTGS', 'Cheque', 'Cash'], required: true }),
  paidRef: requiredText(128),
  paidDate: requiredText(32),
  basic: requiredRoundedMoney,
  hra: requiredRoundedMoney,
  washing: requiredRoundedMoney,
  ot: requiredRoundedMoney,
  pt: requiredRoundedMoney,
  pf: requiredRoundedMoney,
  esic: requiredRoundedMoney,
  advance: requiredRoundedMoney,
  earnings: requiredRoundedMoney,
  deductions: requiredRoundedMoney,
  net: requiredRoundedMoney,
  grossPayable: requiredRoundedMoney,
  residual: requiredRoundedMoney,
  showRes: booleanField({ required: true }),
  netWords: requiredText(512),
  salaryRemark: requiredText(1024),
  approvedBy: requiredText(160)
}, {
  required: true,
  maxBytes: 32_768,
  crossValidate: value => value.deductions === value.pt + value.pf + value.esic + value.advance
    && value.net === value.earnings - value.deductions
});

const payrollRegisterRowSchema = objectField({
  sr: integerField(1, 1_000_000, { required: true }),
  empId: requiredText(128),
  name: requiredText(160),
  designation: requiredText(160),
  gross: requiredMoney,
  ot: requiredMoney,
  pt: requiredMoney,
  pf: requiredMoney,
  esic: requiredMoney,
  advance: requiredMoney,
  net: requiredMoney
}, { required: true });
const payrollRegisterTotalsSchema = objectField({
  gross: requiredMoney,
  ot: requiredMoney,
  pt: requiredMoney,
  pf: requiredMoney,
  esic: requiredMoney,
  advance: requiredMoney,
  net: requiredMoney
}, { required: true });
const statutoryTotalsSchema = objectField({
  emp: requiredPositiveCount,
  pt: requiredMoney,
  pfEE: requiredMoney,
  pfER: requiredMoney,
  esEE: requiredMoney,
  esER: requiredMoney,
  net: requiredMoney
}, { required: true });
const statutoryMemberRowSchema = objectField({
  sr: integerField(1, 1_000_000, { required: true }),
  uan: requiredText(32),
  name: requiredText(160),
  empId: requiredText(128),
  pfWages: requiredRoundedMoney,
  pfEE: requiredRoundedMoney,
  pfER: requiredRoundedMoney,
  esicIp: requiredText(32),
  esicWages: requiredRoundedMoney,
  esicEE: requiredRoundedMoney,
  esicER: requiredRoundedMoney,
  pt: requiredRoundedMoney,
  gross: requiredRoundedMoney
}, { required: true });
const statutoryMemberTotalsSchema = objectField({
  emp: requiredPositiveCount,
  pfWages: requiredRoundedMoney,
  pfEE: requiredRoundedMoney,
  pfER: requiredRoundedMoney,
  esicWages: requiredRoundedMoney,
  esicEE: requiredRoundedMoney,
  esicER: requiredRoundedMoney,
  pt: requiredRoundedMoney,
  gross: requiredRoundedMoney
}, { required: true });
const qmsKpiSchema = objectField({
  walkins: requiredCount,
  purchases: requiredCount,
  service: requiredCount,
  non: requiredCount,
  conv: integerField(0, 100, { required: true }),
  sales: requiredMoney,
  lost: requiredMoney,
  avgWait: requiredCount
}, { required: true });
const qmsLostReasonSchema = objectField({
  reason: requiredText(160),
  count: requiredPositiveCount,
  value: requiredMoney
}, { required: true });
const qmsCroSchema = objectField({
  name: requiredText(160),
  turns: requiredCount,
  assigned: requiredCount,
  purchases: requiredCount,
  conv: integerField(0, 100, { required: true }),
  sales: requiredMoney,
  skips: requiredCount
}, { required: true });
const advanceVoucherSchema = objectField({
  voucherNo: requiredText(128),
  date: requiredText(32),
  empName: requiredText(160),
  empId: requiredText(128),
  amount: requiredRoundedMoney,
  amountWords: requiredText(512),
  deductMonth: stringField(16, { enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], required: true }),
  deductYear: requiredText(16),
  recoveryPlan: requiredText(512),
  outstanding: integerField(0, 1_000_000_000_000, { required: true }),
  mode: requiredText(64),
  refNo: requiredText(128),
  reason: requiredText(512),
  approvedBy: requiredText(160)
}, { required: true });
const hrLetterSchema = objectField({
  type: stringField(64, { enum: ['Appointment Letter', 'Confirmation Letter', 'Salary Certificate', 'Experience / Relieving Letter', 'Increment Letter', 'Warning Letter', 'Employment Verification Letter', 'No Objection Certificate (NOC)', 'Termination Letter'], required: true }),
  name: requiredText(160),
  empId: requiredText(128),
  ref: requiredText(128),
  dateNice: requiredText(64),
  paras: arrayField(5, requiredText(4096), { required: true, minItems: 3, maxBytes: 32_768 }),
  closing: stringField(32, { enum: ['Yours sincerely,'], required: true })
}, { required: true });
const fnfLineSchema = objectField({
  label: requiredText(160),
  amt: requiredRoundedMoney
}, { required: true });
const fnfSchema = objectField({
  id: requiredText(128),
  empId: requiredText(128),
  name: requiredText(160),
  designation: requiredText(160),
  period: requiredText(64),
  lastDay: requiredText(32),
  earnings: arrayField(6, fnfLineSchema, { required: true, minItems: 1, maxBytes: 16_384 }),
  recoveries: arrayField(8, fnfLineSchema, { required: true, maxBytes: 16_384 }),
  totEarn: requiredRoundedMoney,
  totRec: requiredRoundedMoney,
  net: requiredRoundedMoney,
  netWords: requiredText(512),
  ref: requiredText(128),
  generatedAt: requiredText(64),
  generatedBy: requiredText(160),
  status: stringField(16, { enum: ['final'], required: true })
}, {
  required: true,
  crossValidate: value => value.totEarn === value.earnings.reduce((sum, item) => sum + item.amt, 0)
    && value.totRec === value.recoveries.reduce((sum, item) => sum + item.amt, 0)
    && value.net === value.totEarn - value.totRec
});

const REPORT_SCHEMAS = Object.freeze({
  payrollRegister: objectField({
    period: requiredText(64),
    locked: booleanField({ required: true }),
    preparedBy: requiredText(160),
    checkedBy: requiredText(160),
    approvedBy: requiredText(160),
    rows: arrayField(1000, payrollRegisterRowSchema, { required: true, minItems: 1, maxBytes: 524_288 }),
    totals: payrollRegisterTotalsSchema
  }, { maxBytes: 524_288 }),
  statutorySummary: objectField({
    period: requiredText(64),
    preparedBy: requiredText(160),
    approvedBy: requiredText(160),
    totals: statutoryTotalsSchema
  }, { maxBytes: 524_288 }),
  statutoryRegister: objectField({
    period: requiredText(64),
    locked: booleanField({ required: true }),
    preparedBy: requiredText(160),
    approvedBy: requiredText(160),
    rows: arrayField(1000, statutoryMemberRowSchema, { required: true, minItems: 1, maxBytes: 524_288 }),
    totals: statutoryMemberTotalsSchema
  }, { maxBytes: 524_288 }),
  payrollSlip: objectField({ slip: payrollSlipSchema }, { maxBytes: 524_288 }),
  qmsEodSummary: objectField({
    date: stringField(10, { format: 'date', required: true }),
    store: requiredText(160),
    closedAt: stringField(64, { nullable: true, required: true }),
    closedBy: stringField(160, { nullable: true, required: true }),
    kpi: qmsKpiSchema,
    lostReasons: arrayField(200, qmsLostReasonSchema, { required: true, maxBytes: 262_144 }),
    cros: arrayField(1000, qmsCroSchema, { required: true, maxBytes: 524_288 })
  }, { maxBytes: 524_288 }),
  advanceVoucher: objectField({ voucher: advanceVoucherSchema }, { maxBytes: 524_288 }),
  hrLetter: objectField({ letter: hrLetterSchema }, { maxBytes: 524_288 }),
  fnfSettlement: objectField({ fnf: fnfSchema }, { maxBytes: 524_288 })
});

function validateReportPayload(payload) {
  const schema = REPORT_SCHEMAS[payload.reportType];
  return schema && validateField(payload.opts, schema) ? null : 'report-schema';
}

function contract(direction, authorization, fields, options = {}) {
  return {
    direction,
    authorization,
    moduleIds: [...(options.moduleIds || ALL_MODULES)],
    allowedStates: [...(options.allowedStates || ['READY'])],
    fields,
    business: options.business !== false,
    replyRequired: options.replyRequired === true,
    externalAuthorizationRequired: options.externalAuthorizationRequired === true,
    crossValidate: options.crossValidate || null,
    envelopeCrossValidate: options.envelopeCrossValidate || null,
    legacyKeys: options.legacyKeys || Object.keys(fields),
    legacyMigration: options.legacyMigration || 'allowed-after-source-origin-instance-binding'
  };
}

const payloadContracts = {
  ST_ACCESS_CONTEXT: contract('shell-to-module', 'active-shell-instance', {}, {
    moduleIds: ACCESS_MODULES,
    legacyKeys: []
  }),
  ST_LANG: contract('shell-to-module', 'active-shell-instance', {
    lang: stringField(2, { enum: ['en', 'mr', 'hi'], required: true })
  }),
  ST_OPEN_FEATURE: contract('shell-to-module', 'active-shell-instance', {
    target: stringField(64, { pattern: SIMPLE_ID_PATTERN, required: true })
  }, {
    envelopeCrossValidate: envelope => OPEN_FEATURE_TARGETS[envelope.moduleId]?.includes(envelope.payload.target)
      ? null : 'feature-target-mismatch'
  }),
  ST_SET_DATE: contract('shell-to-module', 'active-shell-instance', {
    date: stringField(10, { format: 'date', required: true })
  }),
  ST_UI_MODE: contract('shell-to-module', 'active-shell-instance', {
    mode: stringField(7, { enum: ['mobile', 'desktop'], required: true })
  }),
  ST_WA_SENT: contract('shell-to-module', 'active-shell-instance-and-service-record', {
    recordId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true }),
    text: stringField(4096, { required: true })
  }, {
    moduleIds: ['service'],
    externalAuthorizationRequired: true
  }),

  ST_AUDIT: contract('module-to-shell', 'active-module-instance-and-metadata-only-audit', {
    action: stringField(32, { enum: ['module.storage.set', 'module.storage.remove'], required: true }),
    storageKeyHash: stringField(64, { pattern: SHA256_PATTERN, required: true }),
    beforeBytes: integerField(0, 10_000_000, { required: true }),
    afterBytes: integerField(0, 10_000_000, { required: true })
  }, {
    legacyKeys: ['action', 'detail', 'before', 'after'],
    legacyMigration: 'blocked-until-raw-before-after-redaction-retention-decision'
  }),
  ST_BACK_HOME: contract('module-to-shell', 'active-module-instance', {}, { legacyKeys: [] }),
  ST_OPEN_MODULE: contract('module-to-shell', 'active-module-instance-and-configured-manifest-target', {
    id: stringField(32, { enum: MAH4_MODULE_IDS, required: true }),
    date: stringField(10, { format: 'date' })
  }, {
    moduleIds: OPEN_MODULE_PRODUCERS,
    externalAuthorizationRequired: true,
    envelopeCrossValidate: envelope => OPEN_MODULE_TARGETS[envelope.moduleId] === envelope.payload.id
      ? null : 'module-target-mismatch'
  }),
  ST_PRINT: contract('module-to-shell', 'active-module-instance-and-protected-export-sink', {
    title: stringField(160, { required: true }),
    css: stringField(262_144, { required: true }),
    html: stringField(2_097_152, { required: true }),
    orientation: stringField(9, { enum: ['portrait', 'landscape'] }),
    fileBase: safeFileField(192)
  }, {
    moduleIds: PRINT_MODULES,
    externalAuthorizationRequired: true
  }),
  ST_REPORT: contract('module-to-shell', 'active-module-instance-and-protected-report-sink', {
    reportType: stringField(64, { enum: REPORT_TYPES, required: true }),
    opts: jsonObjectField(524_288, { required: true })
  }, {
    moduleIds: REPORT_MODULES,
    externalAuthorizationRequired: true,
    crossValidate: validateReportPayload,
    envelopeCrossValidate: envelope => ((envelope.moduleId === 'qms') === (envelope.payload.reportType === 'qmsEodSummary'))
      ? null : 'report-module-mismatch'
  }),
  ST_REPORT_BATCH: contract('module-to-shell', 'active-module-instance-and-protected-report-sink', {
    mode: stringField(8, { enum: ['zip', 'combined'], required: true }),
    slips: arrayField(200, payrollSlipSchema, { required: true, minItems: 1, maxBytes: 2_097_152 }),
    fileBase: safeFileField(192, { required: true })
  }, {
    moduleIds: ['payroll'],
    externalAuthorizationRequired: true
  }),
  ST_SHARE: contract('module-to-shell', 'active-module-instance-and-protected-export-sink', {
    file: binaryField(10_485_760),
    text: stringField(1_048_576),
    fileName: safeFileField(192, { required: true }),
    title: stringField(160, { required: true }),
    exportId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true }),
    scopeId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true }),
    scopeLabel: stringField(160, { required: true }),
    rowCount: integerField(0, 1_000_000, { required: true }),
    purposeId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true })
  }, {
    moduleIds: SHARE_MODULES,
    externalAuthorizationRequired: true,
    crossValidate: payload => (Object.hasOwn(payload, 'file') || Object.hasOwn(payload, 'text'))
      ? null : 'file-or-text-required'
  }),
  ST_WA: contract('module-to-shell', 'active-module-instance-and-controlled-whatsapp-sink', {
    module: stringField(32, { enum: WA_MODULES, required: true }),
    recordId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true }),
    templateId: stringField(64, { pattern: SIMPLE_ID_PATTERN })
  }, {
    moduleIds: WA_MODULES,
    externalAuthorizationRequired: true,
    envelopeCrossValidate: envelope => {
      if (envelope.payload.module !== envelope.moduleId) return 'payload-module-mismatch';
      if (envelope.moduleId === 'tax' && envelope.payload.templateId !== 'ca_pack') return 'wa-template-mismatch';
      if (envelope.moduleId === 'service' && ![undefined, 'ready'].includes(envelope.payload.templateId)) return 'wa-template-mismatch';
      return null;
    }
  }),
  ST_WA_LINK: contract('module-to-shell', 'active-module-instance-and-controlled-whatsapp-sink', {
    url: urlField(2048, { required: true }),
    scopeId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true }),
    purposeId: stringField(128, { pattern: SIMPLE_ID_PATTERN, required: true })
  }, {
    moduleIds: WA_LINK_MODULES,
    externalAuthorizationRequired: true,
    envelopeCrossValidate: envelope => WA_LINK_SCOPE_PURPOSE[envelope.moduleId]?.[envelope.payload.scopeId] === envelope.payload.purposeId
      ? null : 'wa-scope-purpose-mismatch'
  }),

  ST_INIT: contract('shell-to-module', 'shell-issued-active-instance', {
    language: stringField(2, { enum: ['en', 'mr', 'hi'], required: true }),
    date: stringField(10, { format: 'date', required: true }),
    uiMode: stringField(7, { enum: ['mobile', 'desktop'], required: true }),
    capabilities: arrayField(32, stringField(64, { pattern: SIMPLE_ID_PATTERN }), { required: true, maxBytes: 4096 })
  }, {
    business: false,
    allowedStates: ['FRAME_LOADING', 'INIT_SENT'],
    crossValidate: payload => new Set(payload.capabilities).size === payload.capabilities.length
      ? null : 'duplicate-capability',
    legacyKeys: [],
    legacyMigration: 'not-legacy'
  }),
  ST_READY: contract('module-to-shell', 'matching-init-correlation-and-capabilities', {
    runtimeVersion: stringField(32, { pattern: SIMPLE_ID_PATTERN, required: true }),
    capabilities: arrayField(32, stringField(64, { pattern: SIMPLE_ID_PATTERN }), { required: true, maxBytes: 4096 })
  }, {
    business: false,
    replyRequired: true,
    allowedStates: ['INIT_SENT', 'READY'],
    crossValidate: payload => new Set(payload.capabilities).size === payload.capabilities.length
      ? null : 'duplicate-capability',
    legacyKeys: [],
    legacyMigration: 'not-legacy'
  }),
  ST_ERROR: contract('module-to-shell', 'active-module-instance-metadata-only-error', {
    code: stringField(64, { pattern: SIMPLE_ID_PATTERN, required: true }),
    phase: stringField(16, { enum: ['load', 'init', 'ready', 'runtime', 'dispose'], required: true }),
    recoverable: booleanField({ required: true })
  }, {
    business: false,
    allowedStates: ['INIT_SENT', 'READY', 'DISPOSING'],
    envelopeCrossValidate: (envelope, context) => ({
      INIT_SENT: ['load', 'init', 'ready'],
      READY: ['runtime'],
      DISPOSING: ['dispose']
    })[context.state]?.includes(envelope.payload.phase) ? null : 'error-phase-state',
    legacyKeys: [],
    legacyMigration: 'not-legacy'
  }),
  ST_DISPOSE: contract('shell-to-module', 'shell-issued-active-instance', {
    reason: stringField(16, { enum: DISPOSE_REASONS, required: true }),
    deadlineMs: integerField(MAH4_TIMING.disposeTimeoutMs, MAH4_TIMING.disposeTimeoutMs, { required: true })
  }, {
    business: false,
    allowedStates: ['INIT_SENT', 'READY', 'DISPOSING'],
    legacyKeys: [],
    legacyMigration: 'not-legacy'
  }),
  ST_DISPOSED: contract('module-to-shell', 'matching-dispose-correlation-and-reason', {
    reason: stringField(16, { enum: DISPOSE_REASONS, required: true }),
    cleaned: integerField(0, MAH4_TIMING.maxCleanupEntriesPerInstance, { required: true }),
    cleanupErrors: integerField(0, MAH4_TIMING.maxCleanupEntriesPerInstance, { required: true })
  }, {
    business: false,
    replyRequired: true,
    allowedStates: ['DISPOSING', 'DISPOSED'],
    crossValidate: payload => payload.cleaned + payload.cleanupErrors <= MAH4_TIMING.maxCleanupEntriesPerInstance
      ? null : 'cleanup-count-limit',
    legacyKeys: [],
    legacyMigration: 'not-legacy'
  })
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const MAH4_MESSAGE_CONTRACTS = deepFreeze(payloadContracts);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidInstanceId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 96 && INSTANCE_PATTERN.test(value);
}

function isValidMessageId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && ID_PATTERN.test(value);
}

export function createMah4InstanceId(randomSource = globalThis.crypto) {
  if (!randomSource || typeof randomSource.getRandomValues !== 'function') throw new Error('secure random source unavailable');
  const bytes = new Uint8Array(16);
  randomSource.getRandomValues(bytes);
  return `mah4_${[...bytes].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function safeJsonMetrics(value, depth = 0, seen = new Set()) {
  if (depth > 8) return { ok: false, code: 'json-depth' };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { ok: true };
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true } : { ok: false, code: 'json-number' };
  if (typeof value !== 'object' || seen.has(value)) return { ok: false, code: 'json-value' };
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 1000) return { ok: false, code: 'json-items' };
    for (const item of value) {
      const result = safeJsonMetrics(item, depth + 1, seen);
      if (!result.ok) return result;
    }
  } else {
    if (!isPlainObject(value)) return { ok: false, code: 'json-object' };
    const keys = Object.keys(value);
    if (keys.length > 200) return { ok: false, code: 'json-keys' };
    if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) {
      return { ok: false, code: 'json-dangerous-key' };
    }
    for (const key of keys) {
      const result = safeJsonMetrics(value[key], depth + 1, seen);
      if (!result.ok) return result;
    }
  }
  seen.delete(value);
  return { ok: true };
}

function jsonByteLength(value) {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? textEncoder.encode(encoded).length : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function immutableSnapshot(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return Object.freeze(value.slice(0, value.size, value.type));
  if (Array.isArray(value)) return Object.freeze(value.map(item => immutableSnapshot(item)));
  const copy = {};
  for (const key of Object.keys(value)) copy[key] = immutableSnapshot(value[key]);
  return Object.freeze(copy);
}

function validateApprovedWhatsAppUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'wa.me') return false;
    if (parsed.username || parsed.password || parsed.port || parsed.hash) return false;
    if (!/^\/(?:\d{1,15})?$/.test(parsed.pathname)) return false;
    const keys = [...parsed.searchParams.keys()];
    return keys.length === 1 && keys[0] === 'text' && parsed.searchParams.get('text') !== null;
  } catch {
    return false;
  }
}

function validateSafeFileName(value, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false;
  if (value.trim() !== value || value.endsWith('.') || /[\\/:*?"<>|\u0000-\u001f]/.test(value)) return false;
  if (value === '.' || value === '..' || value.startsWith('.')) return false;
  const segments = value.split('.');
  if (segments.some(segment => segment.length === 0 || segment.trim() !== segment)) return false;
  const stem = segments[0].toUpperCase();
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) return false;
  return true;
}

function validateField(value, descriptor) {
  if (value === null && descriptor.nullable === true) return true;
  if (descriptor.kind === 'string') {
    if (typeof value !== 'string' || value.length > descriptor.maxLength) return false;
    if (descriptor.enum && !descriptor.enum.includes(value)) return false;
    if (descriptor.pattern && !descriptor.pattern.test(value)) return false;
    if (descriptor.format === 'date' && !isRealDate(value)) return false;
    return true;
  }
  if (descriptor.kind === 'integer') {
    return Number.isSafeInteger(value) && value >= descriptor.min && value <= descriptor.max;
  }
  if (descriptor.kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value) && value >= descriptor.min && value <= descriptor.max;
  }
  if (descriptor.kind === 'boolean') return typeof value === 'boolean';
  if (descriptor.kind === 'json-object') {
    return isPlainObject(value) && safeJsonMetrics(value).ok && jsonByteLength(value) <= descriptor.maxBytes;
  }
  if (descriptor.kind === 'array') {
    if (!Array.isArray(value) || value.length > descriptor.maxItems || value.length < (descriptor.minItems || 0)) return false;
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) return false;
    if (descriptor.maxBytes && jsonByteLength(value) > descriptor.maxBytes) return false;
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index) || !validateField(value[index], descriptor.item)) return false;
    }
    return true;
  }
  if (descriptor.kind === 'object') {
    if (!isPlainObject(value)) return false;
    if (descriptor.maxBytes && jsonByteLength(value) > descriptor.maxBytes) return false;
    const allowed = Object.keys(descriptor.fields);
    if (Object.keys(value).some(key => !allowed.includes(key))) return false;
    const fieldsValid = Object.entries(descriptor.fields).every(([key, child]) => {
      if (!Object.hasOwn(value, key)) return child.required !== true;
      return validateField(value[key], child);
    });
    return fieldsValid && (!descriptor.crossValidate || descriptor.crossValidate(value) === true);
  }
  if (descriptor.kind === 'binary') {
    return typeof Blob !== 'undefined' && value instanceof Blob && value.size <= descriptor.maxBytes;
  }
  if (descriptor.kind === 'approved-whatsapp-url') return validateApprovedWhatsAppUrl(value);
  if (descriptor.kind === 'safe-file-name') return validateSafeFileName(value, descriptor.maxLength);
  return false;
}

export function validateMah4Payload(type, payload) {
  const messageContract = MAH4_MESSAGE_CONTRACTS[type];
  if (!messageContract) return { ok: false, code: 'unknown-type' };
  if (!isPlainObject(payload)) return { ok: false, code: 'payload-object' };
  const allowed = Object.keys(messageContract.fields);
  const keys = Object.keys(payload);
  if (keys.some(key => !allowed.includes(key))) return { ok: false, code: 'payload-unknown-field' };
  for (const [key, descriptor] of Object.entries(messageContract.fields)) {
    if (!Object.hasOwn(payload, key)) {
      if (descriptor.required) return { ok: false, code: `payload-required:${key}` };
      continue;
    }
    if (!validateField(payload[key], descriptor)) return { ok: false, code: `payload-invalid:${key}` };
  }
  const crossError = messageContract.crossValidate?.(payload);
  if (crossError) return { ok: false, code: crossError };
  return { ok: true, code: 'ok' };
}

function sameUniqueStrings(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (new Set(left).size !== left.length || new Set(right).size !== right.length) return false;
  return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}

function exactDataEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, index) => exactDataEqual(item, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && exactDataEqual(left[key], right[key]));
}

function duplicateControlState(type, state) {
  return (type === 'ST_INIT' && state === 'INIT_SENT')
    || (type === 'ST_READY' && state === 'READY')
    || (type === 'ST_DISPOSE' && state === 'DISPOSING')
    || (type === 'ST_DISPOSED' && state === 'DISPOSED');
}

export function validateMah4Envelope(envelope, context) {
  if (!isPlainObject(envelope)) return { ok: false, code: 'envelope-object' };
  const requiredKeys = ['channel', 'version', 'type', 'moduleId', 'instanceId', 'messageId', 'payload'];
  const allowedKeys = [...requiredKeys, 'replyTo'];
  const keys = Object.keys(envelope);
  if (requiredKeys.some(key => !Object.hasOwn(envelope, key)) || keys.some(key => !allowedKeys.includes(key))) {
    return { ok: false, code: 'envelope-keys' };
  }
  if (envelope.channel !== MAH4_CHANNEL) return { ok: false, code: 'channel' };
  if (envelope.version !== MAH4_VERSION) return { ok: false, code: 'version' };
  const messageContract = MAH4_MESSAGE_CONTRACTS[envelope.type];
  if (!messageContract) return { ok: false, code: 'type' };
  if (!MAH4_MODULE_IDS.includes(envelope.moduleId)) return { ok: false, code: 'module' };
  if (!messageContract.moduleIds.includes(envelope.moduleId)) return { ok: false, code: 'module-not-authorized-for-type' };
  if (!isValidInstanceId(envelope.instanceId)) return { ok: false, code: 'instance' };
  if (!isValidMessageId(envelope.messageId)) return { ok: false, code: 'message-id' };
  const replyTo = Object.hasOwn(envelope, 'replyTo') ? envelope.replyTo : null;
  if (replyTo !== null && !isValidMessageId(replyTo)) return { ok: false, code: 'reply-to' };
  if (messageContract.replyRequired && !Object.hasOwn(envelope, 'replyTo')) return { ok: false, code: 'reply-required' };
  if (messageContract.replyRequired && replyTo === null) return { ok: false, code: 'reply-required' };

  if (!isPlainObject(context)) return { ok: false, code: 'trust-context' };
  if (!['shell-to-module', 'module-to-shell'].includes(context.direction)) return { ok: false, code: 'context-direction' };
  if (!MAH4_MODULE_IDS.includes(context.activeModuleId)) return { ok: false, code: 'context-module' };
  if (!isValidInstanceId(context.activeInstanceId)) return { ok: false, code: 'context-instance' };
  if (!MAH4_STATES.includes(context.state)) return { ok: false, code: 'context-state' };
  if (messageContract.direction !== context.direction) return { ok: false, code: 'direction' };
  if (envelope.moduleId !== context.activeModuleId) return { ok: false, code: 'active-module' };
  if (envelope.instanceId !== context.activeInstanceId) return { ok: false, code: 'active-instance' };
  if (context.sourceMatches !== true) return { ok: false, code: 'source' };
  if (context.originMatches !== true) return { ok: false, code: 'origin' };
  if (!messageContract.allowedStates.includes(context.state)) return { ok: false, code: 'state' };
  if (messageContract.business && context.state !== 'READY') return { ok: false, code: 'not-ready' };

  if (messageContract.replyRequired) {
    if (!isValidMessageId(context.expectedReplyTo)) return { ok: false, code: 'expected-reply-context' };
    if (replyTo !== context.expectedReplyTo) return { ok: false, code: 'reply-mismatch' };
  }

  if (duplicateControlState(envelope.type, context.state)) {
    if (!isPlainObject(context.previousControlEnvelope)) return { ok: false, code: 'duplicate-control-context' };
    if (!exactDataEqual(envelope, context.previousControlEnvelope)) return { ok: false, code: 'duplicate-control-mismatch' };
  }

  const payloadResult = validateMah4Payload(envelope.type, envelope.payload);
  if (!payloadResult.ok) return payloadResult;

  if (envelope.type === 'ST_READY') {
    if (!sameUniqueStrings(envelope.payload.capabilities, context.expectedCapabilities)) {
      return { ok: false, code: 'capabilities-mismatch' };
    }
  }
  if (envelope.type === 'ST_DISPOSED' && envelope.payload.reason !== context.expectedDisposeReason) {
    return { ok: false, code: 'dispose-reason-mismatch' };
  }

  const acceptedEnvelope = immutableSnapshot(envelope);
  const snapshotPayloadResult = validateMah4Payload(acceptedEnvelope.type, acceptedEnvelope.payload);
  if (!snapshotPayloadResult.ok) return snapshotPayloadResult;
  const envelopeError = messageContract.envelopeCrossValidate?.(acceptedEnvelope, context);
  if (envelopeError) return { ok: false, code: envelopeError };

  if (messageContract.externalAuthorizationRequired) {
    if (typeof context.authorize !== 'function') return { ok: false, code: 'authorization-context' };
    let authorized = false;
    try {
      authorized = context.authorize(Object.freeze({
        type: acceptedEnvelope.type,
        moduleId: acceptedEnvelope.moduleId,
        payload: acceptedEnvelope.payload,
        authorization: messageContract.authorization
      })) === true;
    } catch {
      return { ok: false, code: 'authorization-error' };
    }
    if (!authorized) return { ok: false, code: 'unauthorized' };
  }

  return { ok: true, code: 'ok', authorization: messageContract.authorization, envelope: acceptedEnvelope };
}

export class Mah4DedupWindow {
  #limit;
  #instances = new Map();
  #formats = new Map();

  constructor(limit = MAH4_TIMING.dedupWindowEntriesPerInstance) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4096) throw new Error('invalid dedup limit');
    this.#limit = limit;
  }

  accept(instanceId, messageId) {
    if (!isValidInstanceId(instanceId) || !isValidMessageId(messageId)) throw new Error('invalid dedup identity');
    let entries = this.#instances.get(instanceId);
    if (!entries) {
      entries = new Map();
      this.#instances.set(instanceId, entries);
      while (this.#instances.size > MAH4_TIMING.dedupInstanceWindows) {
        const oldest = this.#instances.keys().next().value;
        this.#instances.delete(oldest);
        this.#formats.delete(oldest);
      }
    }
    if (entries.has(messageId)) return false;
    entries.set(messageId, true);
    while (entries.size > this.#limit) entries.delete(entries.keys().next().value);
    return true;
  }

  clearInstance(instanceId) {
    const count = this.#instances.get(instanceId)?.size || 0;
    this.#instances.delete(instanceId);
    this.#formats.delete(instanceId);
    return count;
  }

  acceptFormat(instanceId, type, format) {
    if (!isValidInstanceId(instanceId) || !MAH4_MESSAGE_CONTRACTS[type] || !['legacy', 'canonical'].includes(format)) {
      throw new Error('invalid compatibility identity');
    }
    if (!this.#instances.has(instanceId)) {
      this.#instances.set(instanceId, new Map());
      while (this.#instances.size > MAH4_TIMING.dedupInstanceWindows) {
        const oldest = this.#instances.keys().next().value;
        this.#instances.delete(oldest);
        this.#formats.delete(oldest);
      }
    }
    let formats = this.#formats.get(instanceId);
    if (!formats) {
      formats = new Map();
      this.#formats.set(instanceId, formats);
    }
    const existing = formats.get(type);
    if (existing && existing !== format) return false;
    formats.set(type, format);
    return true;
  }

  sizeFor(instanceId) { return this.#instances.get(instanceId)?.size || 0; }
  get instanceCount() { return this.#instances.size; }
  get size() {
    let total = 0;
    for (const entries of this.#instances.values()) total += entries.size;
    return total;
  }
}

function normalizeLegacyShare(data, legacyKeys) {
  const payload = {};
  for (const key of legacyKeys) {
    if (!Object.hasOwn(data, key) || data[key] === undefined) continue;
    if (key === 'file' || key === 'text') continue;
    payload[key] = data[key];
  }
  if (typeof Blob !== 'undefined' && data.file instanceof Blob) payload.file = data.file;
  else if (data.file !== null && data.file !== undefined) return { ok: false, code: 'legacy-share-file' };
  if (typeof data.text === 'string') payload.text = data.text;
  return { ok: true, payload };
}

export function normalizeLegacyMah4Message(data, context) {
  if (!isPlainObject(data) || typeof data.type !== 'string') return { ok: false, code: 'legacy-object' };
  const messageContract = MAH4_MESSAGE_CONTRACTS[data.type];
  if (!messageContract || CONTROL_TYPES.has(data.type)) return { ok: false, code: 'legacy-type' };
  if (messageContract.legacyMigration.startsWith('blocked-')) {
    return { ok: false, code: messageContract.legacyMigration };
  }
  if (!isPlainObject(context) || context.sourceMatches !== true || context.originMatches !== true) {
    return { ok: false, code: 'legacy-trust' };
  }
  const allowed = ['type', ...messageContract.legacyKeys];
  if (Object.keys(data).some(key => !allowed.includes(key))) return { ok: false, code: 'legacy-unknown-field' };

  let payload;
  if (data.type === 'ST_SHARE') {
    const normalized = normalizeLegacyShare(data, messageContract.legacyKeys);
    if (!normalized.ok) return normalized;
    payload = normalized.payload;
  } else {
    payload = Object.fromEntries(messageContract.legacyKeys
      .filter(key => Object.hasOwn(data, key) && data[key] !== undefined)
      .map(key => [key, data[key]]));
  }

  const envelope = {
    channel: MAH4_CHANNEL,
    version: MAH4_VERSION,
    type: data.type,
    moduleId: context.activeModuleId,
    instanceId: context.activeInstanceId,
    messageId: context.messageId,
    payload
  };
  const result = validateMah4Envelope(envelope, context);
  return result.ok ? { ok: true, code: 'ok', envelope: result.envelope } : result;
}

export function acceptMah4Message(data, context, dedupWindow) {
  if (!(dedupWindow instanceof Mah4DedupWindow)) return { ok: false, code: 'dedup-context' };
  if (!isPlainObject(data)) return { ok: false, code: 'message-object' };
  const identityKeys = ['channel', 'version', 'moduleId', 'instanceId', 'messageId', 'replyTo', 'payload'];
  const canonicalCandidate = identityKeys.some(key => Object.hasOwn(data, key));
  let envelope;
  let legacy = false;
  if (canonicalCandidate) {
    const validation = validateMah4Envelope(data, context);
    if (!validation.ok) return validation;
    envelope = validation.envelope;
  } else {
    const normalized = normalizeLegacyMah4Message(data, context);
    if (!normalized.ok) return normalized;
    envelope = normalized.envelope;
    legacy = true;
  }
  if (!dedupWindow.acceptFormat(envelope.instanceId, envelope.type, legacy ? 'legacy' : 'canonical')) {
    return { ok: false, code: 'compatibility-format-conflict', envelope, legacy };
  }
  if (!dedupWindow.accept(envelope.instanceId, envelope.messageId)) {
    return { ok: false, code: 'duplicate', envelope, legacy };
  }
  return { ok: true, code: 'ok', envelope, legacy };
}

const stateTransitions = Object.freeze({
  FRAME_LOADING: Object.freeze({ FRAME_LOADED: 'INIT_SENT', FRAME_ERROR: 'FORCED_CLOSED' }),
  INIT_SENT: Object.freeze({ READY_RECEIVED: 'READY', READY_TIMEOUT: 'FORCED_CLOSED', FRAME_ERROR: 'FORCED_CLOSED', DISPOSE_REQUESTED: 'DISPOSING', ERROR_FATAL: 'FORCED_CLOSED' }),
  READY: Object.freeze({ DISPOSE_REQUESTED: 'DISPOSING', FRAME_ERROR: 'FORCED_CLOSED', ERROR_FATAL: 'FORCED_CLOSED', ERROR_RECOVERABLE: 'READY' }),
  DISPOSING: Object.freeze({ DISPOSED_RECEIVED: 'DISPOSED', DISPOSE_TIMEOUT: 'FORCED_CLOSED', FRAME_ERROR: 'FORCED_CLOSED', ERROR_FATAL: 'FORCED_CLOSED', ERROR_RECOVERABLE: 'DISPOSING' }),
  DISPOSED: Object.freeze({}),
  FORCED_CLOSED: Object.freeze({})
});

export class Mah4SessionOracle {
  #moduleId;
  #instanceId;
  #state = 'FRAME_LOADING';
  #initMessageId = null;
  #readyMessageId = null;
  #disposeMessageId = null;
  #disposedMessageId = null;
  #disposeReason = null;

  constructor(moduleId, instanceId) {
    if (!MAH4_MODULE_IDS.includes(moduleId) || !isValidInstanceId(instanceId)) throw new Error('invalid session identity');
    this.#moduleId = moduleId;
    this.#instanceId = instanceId;
  }

  #result(ok, code, idempotent = false) {
    return { ok, code, state: this.#state, idempotent };
  }

  #identity(event) {
    if (!isPlainObject(event)) return 'event-object';
    if (event.moduleId !== this.#moduleId || event.instanceId !== this.#instanceId) return 'stale-identity';
    return null;
  }

  apply(event) {
    const identityError = this.#identity(event);
    if (identityError) return this.#result(false, identityError);
    const type = event.type;

    if (type === 'FRAME_LOADED') {
      if (!isValidMessageId(event.initMessageId)) return this.#result(false, 'init-message-id');
      if (this.#state === 'FRAME_LOADING') {
        this.#initMessageId = event.initMessageId;
        this.#state = stateTransitions.FRAME_LOADING.FRAME_LOADED;
        return this.#result(true, 'ok');
      }
      if (['INIT_SENT', 'READY', 'DISPOSING'].includes(this.#state)) {
        this.#state = 'FORCED_CLOSED';
        return this.#result(false, 'repeated-frame-load');
      }
      return this.#result(false, 'invalid-transition');
    }

    if (type === 'READY_RECEIVED') {
      if (!isValidMessageId(event.messageId) || !isValidMessageId(event.replyTo)) return this.#result(false, 'ready-identity');
      if (event.replyTo !== this.#initMessageId) return this.#result(false, 'ready-correlation');
      if (this.#state === 'INIT_SENT') {
        this.#readyMessageId = event.messageId;
        this.#state = stateTransitions.INIT_SENT.READY_RECEIVED;
        return this.#result(true, 'ok');
      }
      if (this.#state === 'READY' && event.messageId === this.#readyMessageId) return this.#result(true, 'idempotent', true);
      return this.#result(false, this.#state === 'READY' ? 'ready-mismatch' : 'invalid-transition');
    }

    if (type === 'DISPOSE_REQUESTED') {
      if (!isValidMessageId(event.messageId) || !DISPOSE_REASONS.includes(event.reason)) return this.#result(false, 'dispose-identity');
      if (this.#state === 'FRAME_LOADING') {
        this.#state = 'FORCED_CLOSED';
        return this.#result(true, 'forced-before-init');
      }
      if (this.#state === 'INIT_SENT' || this.#state === 'READY') {
        this.#disposeMessageId = event.messageId;
        this.#disposeReason = event.reason;
        this.#state = 'DISPOSING';
        return this.#result(true, 'ok');
      }
      if (this.#state === 'DISPOSING' && event.messageId === this.#disposeMessageId && event.reason === this.#disposeReason) {
        return this.#result(true, 'idempotent', true);
      }
      return this.#result(false, this.#state === 'DISPOSING' ? 'dispose-mismatch' : 'invalid-transition');
    }

    if (type === 'DISPOSED_RECEIVED') {
      if (!isValidMessageId(event.messageId) || !isValidMessageId(event.replyTo) || !DISPOSE_REASONS.includes(event.reason)) {
        return this.#result(false, 'disposed-identity');
      }
      if (event.replyTo !== this.#disposeMessageId || event.reason !== this.#disposeReason) {
        return this.#result(false, 'disposed-correlation');
      }
      if (this.#state === 'DISPOSING') {
        this.#disposedMessageId = event.messageId;
        this.#state = 'DISPOSED';
        return this.#result(true, 'ok');
      }
      if (this.#state === 'DISPOSED' && event.messageId === this.#disposedMessageId) return this.#result(true, 'idempotent', true);
      return this.#result(false, this.#state === 'DISPOSED' ? 'disposed-mismatch' : 'invalid-transition');
    }

    if (type === 'READY_TIMEOUT') {
      if (this.#state !== 'INIT_SENT') return this.#result(false, 'invalid-transition');
      if (event.replyTo !== this.#initMessageId) return this.#result(false, 'ready-correlation');
      this.#state = 'FORCED_CLOSED';
      return this.#result(true, 'ready-timeout');
    }

    if (type === 'DISPOSE_TIMEOUT') {
      if (this.#state !== 'DISPOSING') return this.#result(false, 'invalid-transition');
      if (event.replyTo !== this.#disposeMessageId) return this.#result(false, 'dispose-correlation');
      this.#state = 'FORCED_CLOSED';
      return this.#result(true, 'dispose-timeout');
    }

    if (type === 'FRAME_ERROR') {
      if (this.#state === 'DISPOSED') return this.#result(false, 'invalid-transition');
      if (this.#state === 'FORCED_CLOSED') return this.#result(true, 'idempotent', true);
      this.#state = 'FORCED_CLOSED';
      return this.#result(true, 'frame-error');
    }

    if (type === 'ERROR_RECEIVED') {
      const payloadResult = validateMah4Payload('ST_ERROR', {
        code: event.code,
        phase: event.phase,
        recoverable: event.recoverable
      });
      if (!payloadResult.ok) return this.#result(false, payloadResult.code);
      if (!['INIT_SENT', 'READY', 'DISPOSING'].includes(this.#state)) return this.#result(false, 'invalid-transition');
      const allowedPhases = {
        INIT_SENT: ['load', 'init', 'ready'],
        READY: ['runtime'],
        DISPOSING: ['dispose']
      };
      if (!allowedPhases[this.#state].includes(event.phase)) return this.#result(false, 'error-phase-state');
      const transition = event.recoverable ? 'ERROR_RECOVERABLE' : 'ERROR_FATAL';
      if (this.#state === 'INIT_SENT' || !event.recoverable) this.#state = 'FORCED_CLOSED';
      else this.#state = stateTransitions[this.#state][transition];
      return this.#result(true, event.recoverable && this.#state !== 'FORCED_CLOSED' ? 'recoverable-error' : 'fatal-error');
    }

    return this.#result(false, 'unknown-event');
  }

  get moduleId() { return this.#moduleId; }
  get instanceId() { return this.#instanceId; }
  get state() { return this.#state; }
  get initMessageId() { return this.#initMessageId; }
  get disposeMessageId() { return this.#disposeMessageId; }
  get disposeReason() { return this.#disposeReason; }
}

const DEADLINE_CONTRACTS = Object.freeze({
  ready: Object.freeze({ delayMs: MAH4_TIMING.readyTimeoutMs, eventType: 'READY_TIMEOUT' }),
  dispose: Object.freeze({ delayMs: MAH4_TIMING.disposeTimeoutMs, eventType: 'DISPOSE_TIMEOUT' })
});

export class Mah4DeadlineOracle {
  #scheduler;
  #entries = new Map();

  constructor(scheduler) {
    if (!scheduler || typeof scheduler.setTimeout !== 'function' || typeof scheduler.clearTimeout !== 'function') {
      throw new Error('invalid deadline scheduler');
    }
    this.#scheduler = scheduler;
  }

  arm(kind, correlationId, onExpire) {
    const deadline = DEADLINE_CONTRACTS[kind];
    if (!deadline || !isValidMessageId(correlationId) || typeof onExpire !== 'function') {
      throw new Error('invalid deadline');
    }
    const existing = this.#entries.get(kind);
    if (existing) {
      if (existing.correlationId !== correlationId) throw new Error('deadline correlation mismatch');
      return Object.freeze({ ...existing.ticket, idempotent: true });
    }
    const token = {};
    const ticket = Object.freeze({ kind, correlationId, delayMs: deadline.delayMs, idempotent: false });
    const handle = this.#scheduler.setTimeout(() => {
      const current = this.#entries.get(kind);
      if (!current || current.token !== token) return;
      this.#entries.delete(kind);
      onExpire(Object.freeze({ type: deadline.eventType, replyTo: correlationId }));
    }, deadline.delayMs);
    this.#entries.set(kind, { token, handle, correlationId, ticket });
    return ticket;
  }

  cancel(kind, correlationId) {
    const current = this.#entries.get(kind);
    if (!current || current.correlationId !== correlationId) return false;
    this.#entries.delete(kind);
    this.#scheduler.clearTimeout(current.handle);
    return true;
  }

  cancelAll() {
    let cancelled = 0;
    for (const [kind, current] of this.#entries) {
      this.#entries.delete(kind);
      this.#scheduler.clearTimeout(current.handle);
      cancelled += 1;
    }
    return cancelled;
  }

  get size() { return this.#entries.size; }
}

const CLEANUP_KINDS = new Set(['timeout', 'interval', 'listener', 'observer', 'subscription', 'cleanup']);

export class Mah4LifecycleOracle {
  #moduleId;
  #instanceId;
  #entries = [];
  #lateEntries = [];
  #result = null;
  #pendingView = null;
  #disposing = false;
  #registrations = 0;

  constructor(moduleId, instanceId) {
    if (!MAH4_MODULE_IDS.includes(moduleId) || !isValidInstanceId(instanceId)) throw new Error('invalid lifecycle identity');
    this.#moduleId = moduleId;
    this.#instanceId = instanceId;
  }

  #runCleanup(entry, executionIndex) {
    try {
      const output = entry.cleanup();
      if (output && typeof output.then === 'function') {
        if (typeof output.catch === 'function') output.catch(() => {});
        this.#result.errors.push({ kind: entry.kind, executionIndex, code: 'async-cleanup-not-supported' });
        this.#result.cleanupErrors += 1;
        return;
      }
      this.#result.cleaned += 1;
    } catch {
      this.#result.errors.push({ kind: entry.kind, executionIndex, code: 'cleanup-failed' });
      this.#result.cleanupErrors += 1;
    }
  }

  register(kind, cleanup) {
    if (!CLEANUP_KINDS.has(kind) || typeof cleanup !== 'function') throw new Error('invalid cleanup registration');
    if (this.#result && !this.#disposing) {
      try {
        const output = cleanup();
        if (output && typeof output.catch === 'function') output.catch(() => {});
      } catch { /* late cleanup is isolated after the frozen result */ }
      return false;
    }
    if (this.#registrations >= MAH4_TIMING.maxCleanupEntriesPerInstance) throw new Error('cleanup registration limit');
    this.#registrations += 1;
    const entry = { kind, cleanup };
    if (this.#disposing) {
      this.#lateEntries.push(entry);
      return false;
    }
    this.#entries.push(entry);
    return true;
  }

  trackTimeout(handle, cancel = globalThis.clearTimeout) {
    if (typeof cancel !== 'function') throw new Error('invalid timeout cancel');
    const cleanup = () => cancel(handle);
    try { return this.register('timeout', cleanup); }
    catch (error) { try { cleanup(); } catch { /* rollback is best-effort */ } throw error; }
  }

  trackInterval(handle, cancel = globalThis.clearInterval) {
    if (typeof cancel !== 'function') throw new Error('invalid interval cancel');
    const cleanup = () => cancel(handle);
    try { return this.register('interval', cleanup); }
    catch (error) { try { cleanup(); } catch { /* rollback is best-effort */ } throw error; }
  }

  addListener(target, type, listener, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function'
      || typeof type !== 'string' || typeof listener !== 'function') throw new Error('invalid listener');
    let normalizedOptions;
    let capture = false;
    if (typeof options === 'boolean') {
      normalizedOptions = options;
      capture = options;
    } else if (options !== undefined && options !== null) {
      if (!isPlainObject(options)) throw new Error('invalid listener options');
      capture = options.capture === true;
      normalizedOptions = Object.freeze({
        capture,
        once: options.once === true,
        passive: options.passive === true,
        ...(options.signal ? { signal: options.signal } : {})
      });
    }
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    add(type, listener, normalizedOptions);
    const cleanup = () => remove(type, listener, capture);
    try { return this.register('listener', cleanup); }
    catch (error) { try { cleanup(); } catch { /* rollback is best-effort */ } throw error; }
  }

  trackObserver(observer) {
    if (!observer || typeof observer.disconnect !== 'function') throw new Error('invalid observer');
    const disconnect = observer.disconnect.bind(observer);
    const cleanup = () => disconnect();
    try { return this.register('observer', cleanup); }
    catch (error) { try { cleanup(); } catch { /* rollback is best-effort */ } throw error; }
  }

  trackSubscription(unsubscribe) {
    try { return this.register('subscription', unsubscribe); }
    catch (error) { try { unsubscribe(); } catch { /* rollback is best-effort */ } throw error; }
  }

  dispose(reason) {
    if (!DISPOSE_REASONS.includes(reason)) throw new Error('invalid dispose reason');
    if (this.#disposing) return this.#pendingView;
    if (this.#result) return this.#result;
    this.#result = {
      moduleId: this.#moduleId,
      instanceId: this.#instanceId,
      reason,
      cleaned: 0,
      cleanupErrors: 0,
      errors: [],
      complete: false
    };
    this.#pendingView = Object.freeze({
      moduleId: this.#moduleId,
      instanceId: this.#instanceId,
      reason,
      pending: true
    });
    this.#disposing = true;
    const original = this.#entries;
    this.#entries = [];
    let executionIndex = 0;
    for (let index = original.length - 1; index >= 0; index -= 1) {
      this.#runCleanup(original[index], executionIndex);
      executionIndex += 1;
      while (this.#lateEntries.length) {
        this.#runCleanup(this.#lateEntries.pop(), executionIndex);
        executionIndex += 1;
      }
    }
    while (this.#lateEntries.length) {
      this.#runCleanup(this.#lateEntries.pop(), executionIndex);
      executionIndex += 1;
    }
    this.#disposing = false;
    this.#result.complete = true;
    this.#result.errors.forEach(Object.freeze);
    Object.freeze(this.#result.errors);
    Object.freeze(this.#result);
    return this.#result;
  }

  get moduleId() { return this.#moduleId; }
  get instanceId() { return this.#instanceId; }
  get disposing() { return this.#disposing; }
  get disposed() { return this.#result?.complete === true; }
  get size() { return this.#entries.length + this.#lateEntries.length; }
}

export const MAH4_PROTOCOL_STATUS = deepFreeze({
  stage: 'stage-b-runtime-complete',
  runtimeLoaded: true,
  stageAComplete: true,
  api23TimingAccepted: true,
  api23InstanceEntropyAccepted: true,
  expectedOriginAccepted: true,
  deadlineModel: 'api23-emulator-measured-plus-synthetic-injected-scheduler',
  auditMigration: 'retired-metadata-only-runtime',
  parserLimitationsAcceptedForStageB: true
});

export function mah4ContractCounts() {
  const entries = Object.entries(MAH4_MESSAGE_CONTRACTS);
  return {
    businessTypes: entries.filter(([type]) => BUSINESS_TYPES.has(type)).length,
    controlTypes: entries.filter(([type]) => CONTROL_TYPES.has(type)).length,
    shellToModule: entries.filter(([, value]) => value.direction === 'shell-to-module').length,
    moduleToShell: entries.filter(([, value]) => value.direction === 'module-to-shell').length
  };
}
