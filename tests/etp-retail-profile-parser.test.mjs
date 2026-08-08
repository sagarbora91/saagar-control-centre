import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const foundation = require('../www/etp-import-foundation.js');
const policy = require('../www/etp-xlsx-parser-policy.js');
const profile = require('../www/etp-retail-profile.js');
const parser = require('../www/etp-retail-table-parser.js');

const datePolicy = Object.freeze({ earliestDate: '2024-04-01', asOfDate: '2026-08-08', maxFutureDays: 2 });

function valueFor(output, store) {
  if (output === 'storeCode') return store;
  if (output === 'transactionTypeRaw') return 'INV';
  if (/invoiceDate$/i.test(output)) return '20260701';
  if (/invoiceNumber$/i.test(output)) return '0000123';
  if (output === 'itemNumber') return 'ITEM-01';
  if (output === 'croNumber') return 'CRO-01';
  if (/quantity$/i.test(output)) return policy.numericLexical('1');
  if (/(amount|value|discount|charges|gross|ucp|encircleAmountOrFlag)$/i.test(output)) return policy.numericLexical('10.25');
  return 'X';
}
function table(reportId, store = 'WLMHW') {
  const report = profile.REPORTS[reportId];
  const output = Object.fromEntries(Object.entries(report.fields).map(([raw, canonical]) => [foundation.normalizeHeader(raw), canonical]));
  const pii = new Set(report.dropHeaders.map(foundation.normalizeHeader));
  return [report.exactHeaders.slice(), report.exactHeaders.map((header) => pii.has(foundation.normalizeHeader(header)) ? 'PRIVATE-VALUE' : valueFor(output[foundation.normalizeHeader(header)], store))];
}
function parse(reportId, store = 'WLMHW', overrides = {}) {
  return parser.parse({ rows: table(reportId, store), fileLabel: `${profile.REPORTS[reportId].aliases[0]}.xlsx`,
    expectedStoreCode: store, datePolicy, ...overrides });
}

test('profile is one exact shared schema for WLMHW and HEMW', () => {
  assert.deepEqual(profile.STORES, ['WLMHW', 'HEMW']);
  for (const reportId of ['R003', 'R013', 'R022', 'R025']) {
    assert.equal(parse(reportId, 'WLMHW').ok, true, reportId);
    assert.equal(parse(reportId, 'HEMW').ok, true, reportId);
  }
});

test('all four profiles bind exact authoritative column counts and signatures', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(profile.REPORTS).map(([id, report]) => [id, report.exactHeaders.length])),
    { R003: 34, R013: 28, R022: 46, R025: 41 });
  for (const report of Object.values(profile.REPORTS)) {
    assert.equal(report.signatureKey, foundation.normalizeHeaderSignature(report.exactHeaders).key);
  }
});

test('known PII is consumed but never persisted', () => {
  for (const reportId of ['R003', 'R013', 'R022', 'R025']) {
    const result = parse(reportId);
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify(result.rows).includes('PRIVATE-VALUE'), false);
    assert.equal(Object.keys(result.rows[0].fields).some((key) => /customerName|contact|ulp/i.test(key)), false);
  }
});

test('bare R022 ENCIRCLE is retained as amount/flag, not treated as identifier PII', () => {
  const result = parse('R022');
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].fields.encircleAmountOrFlag, '10.25');
});

test('unknown or changed headers fail the exact signature', () => {
  const rows = table('R025'); rows[0][10] = 'UNAPPROVED COLUMN';
  assert.equal(parser.parse({ rows, fileLabel: 'SDB Variantwise Sales.xlsx', expectedStoreCode: 'WLMHW', datePolicy }).code, 'HEADER_UNKNOWN');
});

test('filename or selected report cannot contradict detected signature', () => {
  assert.equal(parse('R013', 'WLMHW', { fileLabel: 'Revenue Report.xlsx' }).code, 'REPORT_FILENAME_CONTRADICTS_HEADER');
  assert.equal(parse('R013', 'WLMHW', { selectedReportId: 'R025' }).code, 'REPORT_SELECTION_CONTRADICTS_HEADER');
});

test('numeric identifiers continue to fail closed', () => {
  const rows = table('R025');
  rows[1][rows[0].findIndex((header) => foundation.normalizeHeader(header) === 'INVNUMBER')] = policy.numericLexical('123');
  assert.equal(parser.parse({ rows, fileLabel: 'SDB Variantwise Sales.xlsx', expectedStoreCode: 'WLMHW', datePolicy }).code, 'XLSX_IDENTIFIER_NUMERIC_UNVERIFIED');
});

test('wrong and mixed stores fail before publication', () => {
  assert.equal(parse('R003', 'HEMW', { expectedStoreCode: 'WLMHW' }).code, 'RETAIL_STORE_SCOPE_MISMATCH');
  const rows = table('R003'); rows.push(table('R003', 'HEMW')[1]);
  assert.equal(parser.parse({ rows, fileLabel: 'All Discount Type.xlsx', expectedStoreCode: 'WLMHW', datePolicy }).code, 'RETAIL_STORE_SCOPE_MIXED');
});
