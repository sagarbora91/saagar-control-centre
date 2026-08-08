/* Shared Retail ETP table parser. Pure/no-write and deliberately not app-loaded. */
(function (root, factory) {
  var api = factory(root && root.SaagarEtpImportFoundation, root && root.SaagarEtpXlsxParserPolicy, root && root.SaagarEtpRetailProfile);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarEtpRetailTableParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (foundation, parserPolicy, profile) {
  'use strict';
  if (typeof require === 'function') {
    foundation = foundation || require('./etp-import-foundation.js');
    parserPolicy = parserPolicy || require('./etp-xlsx-parser-policy.js');
    profile = profile || require('./etp-retail-profile.js');
  }
  function refusal(code, details) { return Object.freeze({ ok: false, code: code, details: details || null }); }
  function isoCompact(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10).replace(/-/g, '');
    var text = String(value == null ? '' : value).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replace(/-/g, '') : text;
  }
  function scalar(value, isIdentifier, isDate, isApprovedNumeric) {
    if (isDate) return isoCompact(value);
    if (parserPolicy.isNumericToken(value)) return isIdentifier ? { error: 'XLSX_IDENTIFIER_NUMERIC_UNVERIFIED' } :
      (isApprovedNumeric ? value.lexical : { error: 'XLSX_NUMERIC_FIELD_UNAPPROVED' });
    if (typeof value === 'number') return { error: 'XLSX_NUMERIC_TYPE_UNTRACKED' };
    if (value instanceof Date) return null;
    if (value == null) return '';
    return typeof value === 'boolean' ? String(value) : String(value).trim();
  }
  function parse(input) {
    if (!input || !Array.isArray(input.rows) || !input.rows.length) return refusal('RETAIL_TABLE_REQUIRED');
    var headers = input.rows[0], detected = profile.detect(headers, input.fileLabel, input.selectedReportId);
    if (!detected.ok) return detected;
    var report = profile.REPORTS[detected.reportId], normalizedHeaders = headers.map(foundation.normalizeHeader);
    var outputByHeader = {};
    Object.keys(report.fields).forEach(function (raw) { outputByHeader[foundation.normalizeHeader(raw)] = report.fields[raw]; });
    var identifierOutputs = Object.create(null);
    report.requiredIdentifiers.forEach(function (name) { identifierOutputs[name] = true; });
    var numericOutputs = Object.create(null);
    report.numericOutputs.forEach(function (name) { numericOutputs[name] = true; });
    var requiredSourceHeaders = Object.keys(outputByHeader).filter(function (header) { return identifierOutputs[outputByHeader[header]]; });
    var structural = parserPolicy.inspectTable(input.rows, requiredSourceHeaders);
    if (!structural.ok) return structural;
    var rows = [], adapters = profile.adapters(), datePolicy = input.datePolicy;
    for (var rowIndex = 1; rowIndex < input.rows.length; rowIndex += 1) {
      var source = {}, row = input.rows[rowIndex] || [];
      for (var column = 0; column < normalizedHeaders.length; column += 1) {
        var output = outputByHeader[normalizedHeaders[column]], value = row[column];
        var converted = scalar(value, !!identifierOutputs[output], normalizedHeaders[column] === foundation.normalizeHeader(report.businessDateHeader), !!numericOutputs[output]);
        if (converted && converted.error) return refusal(converted.error, { row: rowIndex + 1, header: headers[column] });
        if (converted === null) return refusal('XLSX_CELL_TYPE_UNSUPPORTED', { row: rowIndex + 1, header: headers[column] });
        source[headers[column]] = converted;
      }
      var prepared = foundation.preparePersistableRow(detected.reportId, source, adapters, detected, datePolicy);
      if (!prepared.ok) return refusal('RETAIL_ROW_REFUSED', { row: rowIndex + 1, fatalErrors: prepared.fatalErrors, warnings: prepared.warnings });
      rows.push(prepared.persistableRow);
    }
    var stores = Array.from(new Set(rows.map(function (row) { return row.storeCode; })));
    if (stores.length !== 1) return refusal('RETAIL_STORE_SCOPE_MIXED');
    var expectedStore = String(input.expectedStoreCode || '').trim().toUpperCase();
    if (profile.STORES.indexOf(expectedStore) < 0) return refusal('RETAIL_EXPECTED_STORE_REQUIRED');
    if (stores[0] !== expectedStore) return refusal('RETAIL_STORE_SCOPE_MISMATCH');
    return Object.freeze({ ok: true, code: 'RETAIL_TABLE_ACCEPTED', profileVersion: profile.VERSION,
      reportId: detected.reportId, storeCode: stores[0], signatureKey: detected.signatureKey,
      rowCount: rows.length, rows: Object.freeze(rows) });
  }
  return Object.freeze({ parse: parse });
});
