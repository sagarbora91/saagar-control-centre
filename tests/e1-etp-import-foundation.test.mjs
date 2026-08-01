import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../www/etp-import-foundation.js');

const signatures = {
  R022: [['TRANS_TYPE', 'STORE_CODE', 'INVNUMBER', 'INVOICEDATE', 'NETVALUE']],
  R025: [['TRANS_TYPE', 'STORE_CODE', 'ITEMNUMBER', 'INVDATE', 'QTY', 'NETVALUE']],
  R013: [['TRANS_TYPE', 'STORE_CODE', 'CRO_NUMBER', 'INVDATE', 'NETVALUE']],
  R003: [['TRANS_TYPE', 'STORE_CODE', 'INVOICE_NUMBER', 'INVOICE_DATE', 'NETVALUE']]
};

const adapters = {
  R022: {
    businessDateHeader: 'INVOICEDATE',
    fields: {
      TRANS_TYPE: 'transactionTypeRaw', STORE_CODE: 'storeCode',
      INVNUMBER: 'invoiceNumber', INVOICEDATE: 'invoiceDateRaw',
      NETVALUE: 'netValue', GIFTCARD: 'giftCardTender'
    }
  },
  R025: {
    businessDateHeader: 'INVDATE',
    fields: {
      TRANS_TYPE: 'transactionTypeRaw', STORE_CODE: 'storeCode',
      ITEMNUMBER: 'itemNumber', INVDATE: 'invoiceDateRaw',
      QTY: 'quantity', NETVALUE: 'netValue'
    }
  },
  R003: {
    businessDateHeader: 'INVOICE_DATE',
    fields: {
      TRANS_TYPE: 'transactionTypeRaw', STORE_CODE: 'storeCode',
      INVOICE_NUMBER: 'invoiceNumber', INVOICE_DATE: 'invoiceDateRaw',
      NETVALUE: 'netValue'
    }
  }
};

function validBatch(overrides = {}) {
  return {
    reportId: 'R022', storeCode: 'WLMHW', financialYear: '2024-25',
    periodStart: '2024-09-16', declaredPeriodEnd: '2025-03-31',
    fileLabel: 'R022-WLMHW.xlsx', fileSha256: 'a'.repeat(64),
    rowCount: 4398, actorId: 'owner:01',
    importedAt: '2026-08-01T12:00:00Z',
    dictionaryVersion: 'etp-provisional-v1', warningCodes: [],
    outcome: 'VALIDATED', ...overrides
  };
}

test('E1 scope is fixed while exact report signatures remain caller supplied', () => {
  assert.deepEqual(policy.REPORT_IDS, ['R022', 'R025', 'R013', 'R003']);
  assert.deepEqual(policy.STORE_CODES, ['WLMHW', 'HEMW']);
  assert.equal('REPORT_SIGNATURES' in policy, false);
  const detected = policy.detectReport(
    ['netvalue', 'InvoiceDate', 'InvNumber', 'Store Code', 'Trans-Type'],
    signatures,
    { fileName: 'misleading-R025.xlsx' }
  );
  assert.equal(detected.ok, true);
  assert.equal(detected.reportId, 'R022');
  assert.equal(policy.detectReport(['STORE_CODE', 'INVDATE'], signatures).code, 'HEADER_UNKNOWN');
  assert.equal(policy.detectReport(['A', 'B'], {
    R022: [['A', 'B']], R025: [['B', 'A']]
  }).code, 'HEADER_AMBIGUOUS');
});

test('text-first identifiers, strict dates, and invoice-date FY are deterministic', () => {
  assert.equal(policy.normalizeCellText(' 000123 '), '000123');
  assert.equal(policy.normalizeCellText(1250.5), '1250.5');
  assert.throws(() => policy.normalizeCellText({ value: '000123' }), TypeError);
  assert.equal(policy.yyyyMmDdToIso('20240229'), '2024-02-29');
  assert.equal(policy.yyyyMmDdToIso('20230229'), '');
  assert.equal(policy.financialYearFromInvoiceDate('20240916'), '2024-25');
  assert.equal(policy.financialYearFromInvoiceDate('20240331'), '2023-24');
});

test('real WLMHW invoice-date header variants work and store timestamp cannot substitute', () => {
  const r022 = policy.preparePersistableRow('R022', {
    TRANS_TYPE: 'INV', STORE_CODE: 'WLMHW', INVNUMBER: '0001',
    INVOICEDATE: '20240916', NETVALUE: '100', GIFTCARD: '0'
  }, adapters);
  assert.equal(r022.ok, true);
  assert.equal(r022.persistableRow.businessDate, '2024-09-16');
  assert.equal(r022.persistableRow.businessDateHeader, 'INVOICEDATE');

  const r025 = policy.preparePersistableRow('R025', {
    TRANS_TYPE: 'SR', STORE_CODE: 'WLMHW', ITEMNUMBER: '000045',
    INVDATE: '20260701', QTY: '1', NETVALUE: '50'
  }, adapters);
  assert.equal(r025.ok, true);
  assert.equal(r025.persistableRow.businessDate, '2026-07-01');
  assert.equal(r025.persistableRow.transaction.valueSign, -1);

  const unsafe = structuredClone(adapters);
  unsafe.R022.businessDateHeader = 'STORETIMESTAMP';
  unsafe.R022.fields.STORETIMESTAMP = 'sourceTimestamp';
  const rejected = policy.preparePersistableRow('R022', {
    TRANS_TYPE: 'INV', STORE_CODE: 'WLMHW', INVNUMBER: '1',
    INVOICEDATE: '20240916', NETVALUE: '100', GIFTCARD: '0',
    STORETIMESTAMP: '20300101'
  }, unsafe);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.fatalErrors.some(error => error.code === 'BUSINESS_DATE_MAPPING_INVALID'));
});

test('store isolation and required TRANS_TYPE fail closed before persistence', () => {
  const base = {
    INVNUMBER: '1', INVOICEDATE: '20240916', NETVALUE: '100', GIFTCARD: '0'
  };
  const missingStore = policy.preparePersistableRow('R022', { ...base, TRANS_TYPE: 'INV' }, adapters);
  assert.equal(missingStore.ok, false);
  assert.ok(missingStore.fatalErrors.some(error => error.code === 'STORE_CODE_REQUIRED'));
  const unknownStore = policy.preparePersistableRow('R022', {
    ...base, TRANS_TYPE: 'INV', STORE_CODE: 'ALL'
  }, adapters);
  assert.ok(unknownStore.fatalErrors.some(error => error.code === 'STORE_CODE_UNKNOWN'));
  const missingTrans = policy.preparePersistableRow('R022', {
    ...base, STORE_CODE: 'WLMHW'
  }, adapters);
  assert.ok(missingTrans.fatalErrors.some(error => error.code === 'TRANS_TYPE_REQUIRED'));
  const helios = policy.preparePersistableRow('R022', {
    ...base, TRANS_TYPE: 'INV', STORE_CODE: 'HEMW'
  }, adapters);
  assert.equal(helios.ok, true);
  assert.equal(helios.persistableRow.storeCode, 'HEMW');
});

test('INV/SR/BC signs are canonical and unknown values remain no-effect warnings', () => {
  assert.equal(policy.transactionEffect('INV').valueSign, 1);
  assert.equal(policy.transactionEffect('SR').valueSign, -1);
  assert.equal(policy.transactionEffect('BC').valueSign, -1);
  const unknown = policy.preparePersistableRow('R022', {
    TRANS_TYPE: 'MYSTERY', STORE_CODE: 'WLMHW', INVNUMBER: '1',
    INVOICEDATE: '20240916', NETVALUE: '100', GIFTCARD: '0'
  }, adapters);
  assert.equal(unknown.ok, true);
  assert.equal(unknown.outcome, 'warning');
  assert.equal(unknown.persistableRow.transaction.valueSign, 0);
});

test('real WLMHW PII aliases are rejected while safe tender/brand/CRO codes remain eligible', () => {
  [
    'CUSTOMERNAME', 'CUSTOMERNUMBER', 'CONTACTNO', 'CRO_NAME',
    'ENCIRCLE', 'ULPNUMBER', 'CARDNUMBER', 'GIFTCARDNO', 'APPROVAL_OTP'
  ].forEach(alias => assert.equal(policy.isForbiddenPiiHeader(alias), true, alias));
  assert.equal(policy.isForbiddenPiiHeader('BRANDNAME'), false);
  assert.equal(policy.isForbiddenPiiHeader('CRO_NUMBER'), false);
  assert.equal(policy.isForbiddenPiiHeader('GIFTCARD'), false);

  const unsafe = structuredClone(adapters);
  unsafe.R022.fields.CUSTOMERNAME = 'customerName';
  const result = policy.preparePersistableRow('R022', {
    TRANS_TYPE: 'INV', STORE_CODE: 'WLMHW', INVNUMBER: '1',
    INVOICEDATE: '20240916', NETVALUE: '100', GIFTCARD: '0',
    CUSTOMERNAME: 'PRIVATE-CANARY'
  }, unsafe);
  assert.equal(result.ok, false);
  assert.equal('persistableRow' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CANARY/);
});

test('unknown source fields never produce a partial row', () => {
  const result = policy.preparePersistableRow('R003', {
    TRANS_TYPE: 'INV', STORE_CODE: 'WLMHW', INVOICE_NUMBER: '1',
    INVOICE_DATE: '20240916', NETVALUE: '100', UNKNOWN_FIELD: 'canary'
  }, adapters);
  assert.equal(result.ok, false);
  assert.equal('persistableRow' in result, false);
  assert.ok(result.fatalErrors.some(error => error.code === 'FIELD_NOT_WHITELISTED'));
});

test('safe batch lineage and idempotency identity are deterministic', () => {
  const checked = policy.validateBatchMetadata(validBatch({
    fileLabel: 'C:\\Owner\\R022 WLMHW?.xlsx', warningCodes: ['ZERO_DAY', 'zero_day']
  }));
  assert.equal(checked.ok, true);
  assert.equal(checked.outcome, 'warning');
  assert.equal(checked.metadata.fileLabel, 'R022 WLMHW_.xlsx');
  assert.deepEqual(checked.metadata.warningCodes, ['ZERO_DAY']);
  const identity = 'WLMHW|2024-25|2024-09-16..2025-03-31|R022|' + 'a'.repeat(64);
  assert.equal(policy.batchIdentity(validBatch()), identity);
  assert.equal(policy.batchIdentity(validBatch({ actorId: 'manager:02' })), identity);
  assert.equal(policy.batchIdentity(validBatch({ storeCode: 'HEMW' })).startsWith('HEMW|'), true);
});

test('invalid lineage has no metadata or identity', () => {
  const result = policy.validateBatchMetadata(validBatch({
    reportId: 'R999', storeCode: 'ALL', financialYear: '2024-26',
    fileSha256: 'bad', rowCount: -1, actorId: '../owner', outcome: 'PUBLISHED'
  }));
  assert.equal(result.ok, false);
  assert.equal('metadata' in result, false);
  assert.equal(policy.batchIdentity({}), '');
});

test('browser UMD exposes a pure no-write kernel', () => {
  const source = fs.readFileSync(new URL('../www/etp-import-foundation.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'etp-import-foundation.js' });
  assert.deepEqual(Array.from(context.SaagarEtpImportFoundation.STORE_CODES), ['WLMHW', 'HEMW']);
  assert.doesNotMatch(source, /localStorage|SaagarNativeStore|SQLite|crypto\.subtle|FileReader|\.xlsx/i);
});
