import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../www/etp-import-policy.js');

/* Synthetic discovery contracts only. Production signatures must come from
   approved raw exports and are deliberately absent from the policy module. */
const definitions = {
  R022: {
    signatures: [[
      'Store Code',
      'InvoiceDate',
      'Trans Type',
      'Document Number',
      'Net Value'
    ]]
  },
  R025: {
    signatures: [[
      'Store Code',
      'InvoiceDate',
      'Trans Type',
      'Variant Code',
      'Quantity'
    ]]
  },
  R013: {
    signatures: [[
      'Store Code',
      'InvoiceDate',
      'Trans Type',
      'CRO Code',
      'Net Value'
    ]]
  },
  R003: {
    signatures: [[
      'Store Code',
      'InvoiceDate',
      'Trans Type',
      'Discount Type',
      'Discount Value'
    ]]
  }
};

const whitelists = {
  R022: {
    fields: {
      'Store Code': 'storeCode',
      InvoiceDate: 'invoiceDateRaw',
      'Trans Type': 'transactionTypeRaw',
      'Document Number': 'documentNumber',
      'Net Value': 'netValue',
      StoreTimestamp: 'sourceTimestamp'
    }
  }
};

function validBatch(overrides = {}) {
  return {
    reportId: 'R022',
    storeCode: 'WLMHW',
    financialYear: '2024-25',
    periodStart: '2024-04-01',
    declaredPeriodEnd: '2025-03-31',
    fileLabel: 'R022-source.xlsx',
    fileSha256: 'A'.repeat(64),
    rowCount: 4398,
    actorId: 'emp:owner-01',
    importedAt: '2026-08-01T10:30:00Z',
    dictionaryVersion: 'retail-etp-v1',
    warningCodes: [],
    outcome: 'VALIDATED',
    ...overrides
  };
}

test('E1 constants fix the approved report and store scope without signatures', () => {
  assert.deepEqual(policy.REPORT_IDS, ['R022', 'R025', 'R013', 'R003']);
  assert.deepEqual(policy.STORE_CODES, ['WLMHW', 'HEMW']);
  assert.deepEqual(policy.TRANSACTION_TYPES, ['INV', 'SR', 'BC']);
  assert.ok(Object.isFrozen(policy.REPORT_IDS));
  assert.equal('REPORT_SIGNATURES' in policy, false);
});

test('header signatures normalize deterministically and reject duplicate headers', () => {
  const left = policy.normalizeHeaderSignature([
    ' Net Value ',
    '\uFEFFinvoiceDate',
    'STORE-CODE'
  ]);
  const right = policy.normalizeHeaderSignature([
    'store code',
    'INVOICEDATE',
    'net_value'
  ]);

  assert.equal(left.ok, true);
  assert.equal(left.key, right.key);
  assert.deepEqual(left.headers, ['INVOICEDATE', 'NET_VALUE', 'STORE_CODE']);

  const duplicate = policy.normalizeHeaderSignature(['Store Code', 'store-code']);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.outcome, 'fatal');
  assert.ok(duplicate.fatalErrors.some(error => error.code === 'HEADER_DUPLICATE'));
});

test('report detection is exact, caller-defined, order-independent, and filename-blind', () => {
  const detected = policy.detectReport([
    'net value',
    'document number',
    'trans_type',
    'invoicedate',
    'store code'
  ], definitions);
  assert.equal(detected.ok, true);
  assert.equal(detected.reportId, 'R022');

  const unknown = policy.detectReport(
    ['not', 'an', 'approved', 'signature'],
    definitions,
    { fileName: 'Revenue Report R022.xlsx' }
  );
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'HEADER_UNKNOWN');

  const noDefinitions = policy.detectReport(['A'], null);
  assert.equal(noDefinitions.ok, false);
  assert.ok(noDefinitions.fatalErrors.some(error => error.code === 'DEFINITIONS_REQUIRED'));
});

test('header detection fails closed when caller definitions are ambiguous', () => {
  const ambiguous = policy.detectReport(['A', 'B'], {
    R022: [['A', 'B']],
    R025: [['B', 'A']]
  });

  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, 'HEADER_AMBIGUOUS');
  assert.deepEqual(ambiguous.matches, ['R022', 'R025']);
});

test('cell normalization preserves text identifiers and refuses complex values', () => {
  assert.equal(policy.normalizeCellText(' 000123 '), '000123');
  assert.equal(policy.normalizeCellText(1250), '1250');
  assert.equal(policy.normalizeCellText(false), 'FALSE');
  assert.equal(policy.normalizeCellText(null), '');
  assert.throws(() => policy.normalizeCellText({ value: '000123' }), TypeError);
  assert.throws(() => policy.normalizeCellText(Number.POSITIVE_INFINITY), TypeError);
});

test('ETP dates are strict and financial year is derived from invoice date', () => {
  assert.equal(policy.yyyyMmDdToIso('20240229'), '2024-02-29');
  assert.equal(policy.yyyyMmDdToIso('20230229'), '');
  assert.equal(policy.yyyyMmDdToIso('20241301'), '');
  assert.equal(policy.yyyyMmDdToIso('2024-04-01'), '');
  assert.equal(policy.financialYearFromInvoiceDate('20240401'), '2024-25');
  assert.equal(policy.financialYearFromInvoiceDate('2024-03-31'), '2023-24');
  assert.equal(policy.financialYearFromInvoiceDate('bad-date'), '');
});

test('business date uses INVOICEDATE and never STORETIMESTAMP', () => {
  const selected = policy.businessDateFromRow({
    INVOICEDATE: '20240715',
    STORETIMESTAMP: '20300101'
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.businessDate, '2024-07-15');
  assert.equal(selected.financialYear, '2024-25');
  assert.equal(selected.sourceHeader, 'INVOICEDATE');

  const timestampOnly = policy.businessDateFromRow({ STORETIMESTAMP: '20240715' });
  assert.equal(timestampOnly.ok, false);
  assert.ok(timestampOnly.fatalErrors.some(error => error.code === 'INVOICEDATE_REQUIRED'));
});

test('transaction effects use only INV, SR, and BC; unknown values have no effect', () => {
  assert.deepEqual(policy.transactionEffect(' inv '), {
    code: 'INV', raw: 'INV', known: true,
    quantitySign: 1, valueSign: 1, salesEffect: 1, hasEffect: true
  });
  assert.equal(policy.transactionEffect('SR').valueSign, -1);
  assert.equal(policy.transactionEffect('BC').salesEffect, -1);

  const unknown = policy.transactionEffect('-1');
  assert.equal(unknown.code, 'UNKNOWN');
  assert.equal(unknown.known, false);
  assert.equal(unknown.quantitySign, 0);
  assert.equal(unknown.valueSign, 0);
  assert.equal(unknown.salesEffect, 0);
  assert.equal(unknown.hasEffect, false);
});

test('per-report whitelist returns a text-only persistable row with controlled date and signs', () => {
  const source = {
    'Store Code': ' WLMHW ',
    InvoiceDate: '20240715',
    'Trans Type': ' inv ',
    'Document Number': '00001234',
    'Net Value': 1250.5,
    StoreTimestamp: '20300101'
  };
  const result = policy.preparePersistableRow('R022', source, whitelists);

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.persistableRow.businessDate, '2024-07-15');
  assert.equal(result.persistableRow.financialYear, '2024-25');
  assert.equal(result.persistableRow.transaction.code, 'INV');
  assert.equal(result.persistableRow.transaction.valueSign, 1);
  assert.deepEqual(result.persistableRow.fields, {
    storeCode: 'WLMHW',
    invoiceDateRaw: '20240715',
    transactionTypeRaw: 'inv',
    documentNumber: '00001234',
    netValue: '1250.5',
    sourceTimestamp: '20300101'
  });
  assert.deepEqual(source, {
    'Store Code': ' WLMHW ',
    InvoiceDate: '20240715',
    'Trans Type': ' inv ',
    'Document Number': '00001234',
    'Net Value': 1250.5,
    StoreTimestamp: '20300101'
  });
});

test('unknown fields and explicit PII aliases fail before any persistable row is returned', () => {
  const base = {
    'Store Code': 'WLMHW',
    InvoiceDate: '20240715',
    'Trans Type': 'INV',
    'Document Number': '0001',
    'Net Value': '10'
  };
  const unknown = policy.preparePersistableRow('R022', {
    ...base,
    'Unexpected Metric': 'secret'
  }, whitelists);
  assert.equal(unknown.ok, false);
  assert.equal('persistableRow' in unknown, false);
  assert.ok(unknown.fatalErrors.some(error => error.code === 'FIELD_NOT_WHITELISTED'));

  const pii = policy.preparePersistableRow('R022', {
    ...base,
    'Customer Mobile': '9876543210'
  }, {
    R022: {
      fields: {
        ...whitelists.R022.fields,
        'Customer Mobile': 'customerMobile'
      }
    }
  });
  assert.equal(pii.ok, false);
  assert.equal('persistableRow' in pii, false);
  assert.ok(pii.fatalErrors.some(error => error.code === 'PII_FIELD_FORBIDDEN'));
});

test('unknown TRANS_TYPE is a warning and remains strictly no-effect', () => {
  const result = policy.preparePersistableRow('R022', {
    'Store Code': 'WLMHW',
    InvoiceDate: '20240715',
    'Trans Type': 'Mystery',
    'Document Number': '0001',
    'Net Value': '10'
  }, whitelists);

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'warning');
  assert.equal(result.persistableRow.transaction.raw, 'MYSTERY');
  assert.equal(result.persistableRow.transaction.valueSign, 0);
  assert.ok(result.warnings.some(warning => warning.code === 'TRANS_TYPE_UNKNOWN_NO_EFFECT'));
});

test('validation result distinguishes accepted, warning, and fatal outcomes', () => {
  assert.equal(policy.validationResult([], []).outcome, 'accepted');
  assert.equal(policy.validationResult([], [{ code: 'WARN', message: 'Review.' }]).outcome, 'warning');
  const fatal = policy.validationResult([{ code: 'STOP', message: 'Refuse.' }], [{ code: 'WARN', message: 'Review.' }]);
  assert.equal(fatal.ok, false);
  assert.equal(fatal.outcome, 'fatal');
});

test('batch metadata is strictly validated, safely sanitized, and canonically ordered', () => {
  const checked = policy.validateBatchMetadata(validBatch({
    fileLabel: 'C:\\Users\\Owner\\R022 export?.xlsx',
    warningCodes: ['mapping_review', 'MAPPING_REVIEW', 'ZERO_DAY'],
    importedAt: '2026-08-01T10:30:00.000Z'
  }));

  assert.equal(checked.ok, true);
  assert.equal(checked.outcome, 'warning');
  assert.equal(checked.metadata.fileLabel, 'R022 export_.xlsx');
  assert.equal(checked.metadata.fileSha256, 'a'.repeat(64));
  assert.equal(checked.metadata.importedAt, '2026-08-01T10:30:00.000Z');
  assert.deepEqual(checked.metadata.warningCodes, ['MAPPING_REVIEW', 'ZERO_DAY']);
  assert.ok(checked.warnings.some(warning => warning.code === 'FILE_LABEL_SANITIZED'));
});

test('batch identity uses only store, FY, period, report, and supplied hash', () => {
  const first = validBatch();
  const second = validBatch({
    actorId: 'emp:manager-99',
    importedAt: '2026-08-02T09:00:00Z',
    dictionaryVersion: 'retail-etp-v2',
    warningCodes: ['REVIEW'],
    outcome: 'ACCEPTED',
    fileLabel: 'renamed-source.xlsx'
  });
  const identity = 'WLMHW|2024-25|2024-04-01..2025-03-31|R022|' + 'a'.repeat(64);

  assert.equal(policy.batchIdentity(first), identity);
  assert.equal(policy.batchIdentity(second), identity);
  assert.equal(policy.batchIdentity(validBatch({ storeCode: 'HEMW' })).startsWith('HEMW|'), true);
});

test('unsafe batch metadata fails closed and produces no identity', () => {
  const checked = policy.validateBatchMetadata(validBatch({
    reportId: 'R999',
    storeCode: 'ALL',
    financialYear: '2024-26',
    periodStart: '2025-02-30',
    fileSha256: 'not-a-hash',
    rowCount: -1,
    actorId: '../owner',
    importedAt: 'yesterday',
    dictionaryVersion: 'bad version!',
    warningCodes: ['unsafe warning!'],
    outcome: 'PUBLISHED'
  }));
  const codes = checked.fatalErrors.map(error => error.code);

  assert.equal(checked.ok, false);
  assert.equal(checked.outcome, 'fatal');
  assert.equal('metadata' in checked, false);
  assert.ok(codes.includes('REPORT_ID_UNKNOWN'));
  assert.ok(codes.includes('STORE_CODE_UNKNOWN'));
  assert.ok(codes.includes('FILE_HASH_INVALID'));
  assert.ok(codes.includes('ROW_COUNT_INVALID'));
  assert.ok(codes.includes('BATCH_OUTCOME_INVALID'));
  assert.equal(policy.batchIdentity({}), '');
});

test('browser UMD exposes the same pure kernel and contains no crypto implementation', () => {
  const source = fs.readFileSync(
    new URL('../www/etp-import-policy.js', import.meta.url),
    'utf8'
  );
  const context = vm.createContext({});

  vm.runInContext(source, context, { filename: 'etp-import-policy.js' });

  assert.deepEqual(
    Array.from(context.SaagarEtpImportPolicy.STORE_CODES),
    ['WLMHW', 'HEMW']
  );
  assert.equal(
    context.SaagarEtpImportPolicy.detectReport(
      ['InvoiceDate', 'A'],
      { R022: [['A', 'InvoiceDate']] }
    ).reportId,
    'R022'
  );
  assert.doesNotMatch(source, /crypto\.subtle|require\(['"](?:node:)?crypto['"]\)|function\s+sha256/i);
});
