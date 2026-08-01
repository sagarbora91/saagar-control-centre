/* E1-0 ETP discovery, privacy, and lineage policy.
   This module is deliberately pure and dependency-free. It has no workbook
   reader, persistence, UI, cryptography, production header signatures, or
   report field schema. Approved signatures and per-report adapters are caller
   inputs so missing HEMW evidence cannot be silently replaced with Titan
   assumptions. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarEtpImportFoundation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var REPORT_IDS = Object.freeze(['R022', 'R025', 'R013', 'R003']);
  var STORE_CODES = Object.freeze(['WLMHW', 'HEMW']);
  var TRANSACTION_TYPES = Object.freeze(['INV', 'SR', 'BC']);
  var BATCH_OUTCOMES = Object.freeze(['PREVIEW', 'VALIDATED', 'ACCEPTED', 'REJECTED', 'ABORTED']);
  var MAX_BATCH_ROWS = 10000000;
  var MAX_FILE_LABEL = 120;

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function issue(code, message, field) {
    var output = { code: String(code || 'INVALID'), message: String(message || 'Invalid value.') };
    if (field) output.field = String(field);
    return output;
  }

  function normalizeIssues(values) {
    return (Array.isArray(values) ? values : []).map(function (value) {
      if (isRecord(value) && value.code) return issue(value.code, value.message, value.field);
      return issue(String(value || 'INVALID'), String(value || 'Invalid value.'));
    });
  }

  function validationResult(fatalErrors, warnings) {
    var fatal = normalizeIssues(fatalErrors);
    var warning = normalizeIssues(warnings);
    return {
      ok: fatal.length === 0,
      outcome: fatal.length ? 'fatal' : (warning.length ? 'warning' : 'accepted'),
      fatalErrors: fatal,
      warnings: warning
    };
  }

  function normalizeCellText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.replace(/^\uFEFF/, '').trim();
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Cell number must be finite.');
      return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'bigint') return String(value);
    throw new TypeError('Cell value must be a text-compatible primitive.');
  }

  function normalizeHeader(value) {
    return normalizeCellText(value)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function compactHeader(value) {
    return normalizeHeader(value).replace(/_/g, '');
  }

  /* Exact and structural aliases observed in the WLMHW source set plus the
     privacy categories in the approved plan. GIFTCARD (a tender amount) is
     intentionally allowed; GIFTCARDNO/GIFTCARDNUMBER are not. */
  function isForbiddenPiiHeader(value) {
    var token;
    try { token = compactHeader(value); }
    catch (error) { return true; }
    if (!token) return false;
    if (/^(?:NAME|MOBILE|MOBILENO|MOBILENUMBER|PHONE|PHONENO|PHONENUMBER|CONTACT|CONTACTNO|CONTACTNUMBER|EMAIL|EMAILID|ADDRESS)$/.test(token)) return true;
    if (/^(?:CUSTOMER|CUST).*(?:NAME|NUMBER|MOBILE|PHONE|CONTACT|EMAIL|ADDRESS|PAN)$/.test(token)) return true;
    if (/^(?:CRO|EMPLOYEE|STAFF|ADVISER|ADVISOR)NAME$/.test(token)) return true;
    if (/^(?:LOYALTYCONTACT|ENCIRCLE|ENCIRCLENO|ENCIRCLENUMBER|ULP|ULPNO|ULPNUMBER)$/.test(token)) return true;
    if (/^(?:(?:CREDIT|GIFT)?CARD)(?:NO|NUMBER)$/.test(token)) return true;
    if (/^(?:OTP|APPROVALOTP|APPROVALSECRET|AADHAAR|AADHAARNO|UID)$/.test(token)) return true;
    return false;
  }

  function normalizeHeaderSignature(headers) {
    var fatal = [];
    var normalized = [];
    var seen = Object.create(null);
    if (!Array.isArray(headers) || !headers.length) {
      return Object.assign(validationResult([
        issue('HEADER_ROW_REQUIRED', 'A non-empty header row is required.', 'headers')
      ], []), { headers: [], key: '' });
    }
    headers.forEach(function (header, index) {
      var token = '';
      try { token = normalizeHeader(header); }
      catch (error) {
        fatal.push(issue('HEADER_INVALID', 'Header cells must be text-compatible.', 'headers[' + index + ']'));
        return;
      }
      if (!token) fatal.push(issue('HEADER_EMPTY', 'Blank headers are not allowed.', 'headers[' + index + ']'));
      else if (seen[token]) fatal.push(issue('HEADER_DUPLICATE', 'Duplicate normalized header.', token));
      else {
        seen[token] = true;
        normalized.push(token);
      }
    });
    normalized.sort();
    return Object.assign(validationResult(fatal, []), {
      headers: normalized,
      key: fatal.length ? '' : normalized.join('\u001f')
    });
  }

  function signatureLists(value) {
    if (isRecord(value)) value = value.signatures;
    if (!Array.isArray(value) || !value.length) return [];
    return value.every(function (entry) { return !Array.isArray(entry); }) ? [value] : value;
  }

  function compileSignatures(definitions) {
    var fatal = [];
    var entries = [];
    if (!isRecord(definitions)) {
      return { fatalErrors: [issue('DEFINITIONS_REQUIRED', 'Caller-supplied report signatures are required.', 'definitions')], entries: [] };
    }
    Object.keys(definitions).forEach(function (rawReportId) {
      var reportId = cleanText(rawReportId).toUpperCase();
      var lists = signatureLists(definitions[rawReportId]);
      if (REPORT_IDS.indexOf(reportId) < 0) {
        fatal.push(issue('REPORT_ID_UNKNOWN', 'Unknown report definition.', rawReportId));
        return;
      }
      if (!lists.length) {
        fatal.push(issue('SIGNATURE_REQUIRED', 'At least one signature is required.', reportId));
        return;
      }
      lists.forEach(function (headers) {
        var signature = normalizeHeaderSignature(headers);
        if (!signature.ok) fatal.push(issue('SIGNATURE_INVALID', 'A report signature is invalid.', reportId));
        else entries.push({ reportId: reportId, key: signature.key, headers: signature.headers });
      });
    });
    return { fatalErrors: fatal, entries: entries };
  }

  /* Filename is deliberately not accepted as an argument. */
  function detectReport(headers, definitions) {
    var source = normalizeHeaderSignature(headers);
    var compiled = compileSignatures(definitions);
    var fatal = source.fatalErrors.concat(compiled.fatalErrors);
    if (fatal.length) return Object.assign(validationResult(fatal, []), { code: 'HEADER_DETECTION_INVALID' });
    var matches = compiled.entries
      .filter(function (entry) { return entry.key === source.key; })
      .map(function (entry) { return entry.reportId; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; })
      .sort();
    if (!matches.length) {
      return Object.assign(validationResult([
        issue('HEADER_UNKNOWN', 'The header signature is not approved.', 'headers')
      ], []), { code: 'HEADER_UNKNOWN', signature: source.headers });
    }
    if (matches.length > 1) {
      return Object.assign(validationResult([
        issue('HEADER_AMBIGUOUS', 'The header signature matches more than one report.', 'headers')
      ], []), { code: 'HEADER_AMBIGUOUS', signature: source.headers, matches: matches });
    }
    return Object.assign(validationResult([], []), {
      code: 'REPORT_DETECTED', reportId: matches[0], signature: source.headers
    });
  }

  function yyyyMmDdToIso(value) {
    var text;
    try { text = normalizeCellText(value); }
    catch (error) { return ''; }
    var match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
    if (!match) return '';
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return match[1] + '-' + match[2] + '-' + match[3];
  }

  function normalizeIsoDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanText(value));
    return match ? yyyyMmDdToIso(match[1] + match[2] + match[3]) : '';
  }

  function financialYearFromInvoiceDate(value) {
    var date = normalizeIsoDate(value) || yyyyMmDdToIso(value);
    if (!date) return '';
    var year = Number(date.slice(0, 4));
    var month = Number(date.slice(5, 7));
    var start = month >= 4 ? year : year - 1;
    return String(start) + '-' + String((start + 1) % 100).padStart(2, '0');
  }

  function normalizedRow(sourceRow) {
    var fatal = [];
    var entries = [];
    var seen = Object.create(null);
    if (!isRecord(sourceRow)) {
      return { fatalErrors: [issue('ROW_REQUIRED', 'A source row object is required.', 'row')], entries: [] };
    }
    Object.keys(sourceRow).forEach(function (rawHeader) {
      var token = '';
      try { token = normalizeHeader(rawHeader); }
      catch (error) {
        fatal.push(issue('ROW_HEADER_INVALID', 'Row headers must be text-compatible.', rawHeader));
        return;
      }
      if (!token) fatal.push(issue('ROW_HEADER_EMPTY', 'Blank row headers are not allowed.', rawHeader));
      else if (seen[token]) fatal.push(issue('ROW_HEADER_DUPLICATE', 'Duplicate normalized row header.', token));
      else {
        seen[token] = true;
        entries.push({ header: token, value: sourceRow[rawHeader] });
      }
    });
    return { fatalErrors: fatal, entries: entries };
  }

  function transactionEffect(value) {
    var raw = '';
    try { raw = normalizeCellText(value).toUpperCase(); }
    catch (error) { raw = ''; }
    var sign = raw === 'INV' ? 1 : (raw === 'SR' || raw === 'BC' ? -1 : 0);
    return Object.freeze({
      code: sign ? raw : 'UNKNOWN', raw: raw, known: sign !== 0,
      quantitySign: sign, valueSign: sign, salesEffect: sign, hasEffect: sign !== 0
    });
  }

  function safeOutputField(value) {
    var field = cleanText(value);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)) return '';
    if (field === 'constructor' || field === 'prototype' || field === '__proto__') return '';
    return field;
  }

  function compileReportAdapter(reportId, adapters) {
    var fatal = [];
    var adapter = isRecord(adapters) && isRecord(adapters[reportId]) ? adapters[reportId] : null;
    var fields = Object.create(null);
    var outputs = Object.create(null);
    if (!adapter || !isRecord(adapter.fields)) {
      return { fatalErrors: [issue('WHITELIST_REQUIRED', 'A caller-supplied report whitelist is required.', reportId)], fields: fields, businessDateHeader: '' };
    }
    Object.keys(adapter.fields).forEach(function (rawHeader) {
      var source = '';
      try { source = normalizeHeader(rawHeader); }
      catch (error) { source = ''; }
      var output = safeOutputField(adapter.fields[rawHeader]);
      if (!source || !output) fatal.push(issue('WHITELIST_FIELD_INVALID', 'Whitelist entries need safe source and output fields.', rawHeader));
      else if (isForbiddenPiiHeader(source) || isForbiddenPiiHeader(output)) fatal.push(issue('PII_FIELD_FORBIDDEN', 'PII fields cannot be approved for persistence.', source));
      else if (Object.prototype.hasOwnProperty.call(fields, source)) fatal.push(issue('WHITELIST_HEADER_DUPLICATE', 'Duplicate normalized whitelist header.', source));
      else if (outputs[output]) fatal.push(issue('WHITELIST_OUTPUT_DUPLICATE', 'Duplicate whitelist output field.', output));
      else {
        fields[source] = output;
        outputs[output] = true;
      }
    });
    var businessDateHeader = '';
    try { businessDateHeader = normalizeHeader(adapter.businessDateHeader); }
    catch (error) { businessDateHeader = ''; }
    var compactDate = businessDateHeader.replace(/_/g, '');
    if (!(compactDate === 'INVOICEDATE' || compactDate === 'INVDATE')) {
      fatal.push(issue('BUSINESS_DATE_MAPPING_INVALID', 'Business date must map to an approved invoice-date header.', 'businessDateHeader'));
    }
    if (!Object.prototype.hasOwnProperty.call(fields, businessDateHeader)) {
      fatal.push(issue('BUSINESS_DATE_NOT_WHITELISTED', 'The invoice-date header must be whitelisted.', businessDateHeader || 'businessDateHeader'));
    }
    if (!outputs.storeCode) fatal.push(issue('STORE_CODE_MAPPING_REQUIRED', 'The whitelist must map one field to storeCode.', 'fields'));
    return { fatalErrors: fatal, fields: fields, businessDateHeader: businessDateHeader };
  }

  function findEntry(entries, header) {
    return entries.find(function (entry) { return entry.header === header; }) || null;
  }

  /* No persistableRow is returned until every source field, privacy rule,
     store, business date, and required transaction type has passed. */
  function preparePersistableRow(reportIdValue, sourceRow, adapters) {
    var reportId = cleanText(reportIdValue).toUpperCase();
    var fatal = [];
    var warnings = [];
    if (REPORT_IDS.indexOf(reportId) < 0) fatal.push(issue('REPORT_ID_UNKNOWN', 'Unknown E1 report.', 'reportId'));
    var row = normalizedRow(sourceRow);
    fatal = fatal.concat(row.fatalErrors);
    var adapter = compileReportAdapter(reportId, adapters);
    fatal = fatal.concat(adapter.fatalErrors);

    row.entries.forEach(function (entry) {
      if (isForbiddenPiiHeader(entry.header)) fatal.push(issue('PII_FIELD_FORBIDDEN', 'PII field rejected before persistence.', entry.header));
      else if (!Object.prototype.hasOwnProperty.call(adapter.fields, entry.header)) fatal.push(issue('FIELD_NOT_WHITELISTED', 'Unapproved source field.', entry.header));
    });

    var storeSource = Object.keys(adapter.fields).find(function (source) { return adapter.fields[source] === 'storeCode'; });
    var storeEntry = storeSource ? findEntry(row.entries, storeSource) : null;
    var storeCode = storeEntry ? cleanText(storeEntry.value).toUpperCase() : '';
    if (!storeEntry) fatal.push(issue('STORE_CODE_REQUIRED', 'A store code is required.', storeSource || 'storeCode'));
    else if (STORE_CODES.indexOf(storeCode) < 0) fatal.push(issue('STORE_CODE_UNKNOWN', 'Unknown store code.', storeSource));

    var dateEntry = adapter.businessDateHeader ? findEntry(row.entries, adapter.businessDateHeader) : null;
    var businessDate = dateEntry ? yyyyMmDdToIso(dateEntry.value) : '';
    if (!dateEntry) fatal.push(issue('INVOICE_DATE_REQUIRED', 'The mapped invoice date is required.', adapter.businessDateHeader || 'businessDate'));
    else if (!businessDate) fatal.push(issue('INVOICE_DATE_INVALID', 'Invoice date must be a real YYYYMMDD date.', adapter.businessDateHeader));

    var transEntry = findEntry(row.entries, 'TRANS_TYPE');
    if (!transEntry) fatal.push(issue('TRANS_TYPE_REQUIRED', 'TRANS_TYPE is required.', 'TRANS_TYPE'));
    var effect = transactionEffect(transEntry ? transEntry.value : '');
    if (transEntry && !effect.known) warnings.push(issue('TRANS_TYPE_UNKNOWN_NO_EFFECT', 'Unknown TRANS_TYPE has no financial or quantity effect.', 'TRANS_TYPE'));

    var fields = {};
    if (!fatal.length) {
      row.entries.forEach(function (entry) {
        try { fields[adapter.fields[entry.header]] = normalizeCellText(entry.value); }
        catch (error) { fatal.push(issue('CELL_TYPE_INVALID', 'A field is not text-compatible.', entry.header)); }
      });
      fields.storeCode = storeCode;
    }
    var result = validationResult(fatal, warnings);
    if (result.ok) {
      result.persistableRow = Object.freeze({
        reportId: reportId,
        storeCode: storeCode,
        fields: Object.freeze(fields),
        businessDate: businessDate,
        financialYear: financialYearFromInvoiceDate(businessDate),
        businessDateHeader: adapter.businessDateHeader,
        transaction: effect
      });
    }
    return result;
  }

  function sanitizeFileLabel(value) {
    var original = cleanText(value).replace(/[\u0000-\u001f\u007f]/g, '');
    var leaf = original.split(/[\\/]/).pop() || '';
    return leaf.replace(/[^A-Za-z0-9._() -]+/g, '_')
      .replace(/\s+/g, ' ').replace(/_+/g, '_')
      .replace(/^[ ._-]+|[ ._-]+$/g, '').slice(0, MAX_FILE_LABEL);
  }

  function safeToken(value, maxLength) {
    var text = cleanText(value);
    return text && text.length <= maxLength && /^[A-Za-z0-9._:-]+$/.test(text) ? text : '';
  }

  function normalizeTimestamp(value) {
    var text = cleanText(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)) return '';
    var time = Date.parse(text);
    return Number.isFinite(time) ? new Date(time).toISOString() : '';
  }

  function validFinancialYear(value) {
    var match = /^(\d{4})-(\d{2})$/.exec(cleanText(value));
    return !!match && Number(match[2]) === (Number(match[1]) + 1) % 100;
  }

  function validateBatchMetadata(value) {
    if (!isRecord(value)) {
      return Object.assign(validationResult([
        issue('BATCH_METADATA_REQUIRED', 'Batch metadata is required.', 'metadata')
      ], []), { code: 'BATCH_METADATA_INVALID' });
    }
    var fatal = [];
    var warnings = [];
    var reportId = cleanText(value.reportId).toUpperCase();
    var storeCode = cleanText(value.storeCode).toUpperCase();
    var financialYear = cleanText(value.financialYear);
    var periodStart = normalizeIsoDate(value.periodStart);
    var declaredPeriodEnd = normalizeIsoDate(value.declaredPeriodEnd);
    var rawLabel = cleanText(value.fileLabel).replace(/[\u0000-\u001f\u007f]/g, '');
    var fileLabel = sanitizeFileLabel(value.fileLabel);
    var fileSha256 = cleanText(value.fileSha256).toLowerCase();
    var rowCount = Number(value.rowCount);
    var actorId = safeToken(value.actorId, 80);
    var importedAt = normalizeTimestamp(value.importedAt);
    var dictionaryVersion = safeToken(value.dictionaryVersion, 80);
    var outcome = cleanText(value.outcome).toUpperCase();
    var warningCodes = [];

    if (REPORT_IDS.indexOf(reportId) < 0) fatal.push(issue('REPORT_ID_UNKNOWN', 'Unknown E1 report.', 'reportId'));
    if (STORE_CODES.indexOf(storeCode) < 0) fatal.push(issue('STORE_CODE_UNKNOWN', 'Unknown store code.', 'storeCode'));
    if (!validFinancialYear(financialYear)) fatal.push(issue('FINANCIAL_YEAR_INVALID', 'Financial year must use YYYY-YY.', 'financialYear'));
    if (!periodStart) fatal.push(issue('PERIOD_START_INVALID', 'Period start must be a real ISO date.', 'periodStart'));
    if (!declaredPeriodEnd) fatal.push(issue('PERIOD_END_INVALID', 'Declared period end must be a real ISO date.', 'declaredPeriodEnd'));
    if (periodStart && declaredPeriodEnd && periodStart > declaredPeriodEnd) fatal.push(issue('PERIOD_RANGE_INVALID', 'Period start is after period end.', 'periodStart'));
    if (periodStart && validFinancialYear(financialYear) && financialYearFromInvoiceDate(periodStart) !== financialYear) fatal.push(issue('PERIOD_FY_MISMATCH', 'Period start is outside the financial year.', 'periodStart'));
    if (declaredPeriodEnd && validFinancialYear(financialYear) && financialYearFromInvoiceDate(declaredPeriodEnd) !== financialYear) fatal.push(issue('PERIOD_FY_MISMATCH', 'Period end is outside the financial year.', 'declaredPeriodEnd'));
    if (!fileLabel) fatal.push(issue('FILE_LABEL_INVALID', 'A safe source label is required.', 'fileLabel'));
    else if (fileLabel !== rawLabel) warnings.push(issue('FILE_LABEL_SANITIZED', 'The source label was reduced to a safe leaf.', 'fileLabel'));
    if (!/^[a-f0-9]{64}$/.test(fileSha256)) fatal.push(issue('FILE_HASH_INVALID', 'Source SHA-256 must be 64 hexadecimal characters.', 'fileSha256'));
    if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > MAX_BATCH_ROWS) fatal.push(issue('ROW_COUNT_INVALID', 'Row count is outside the accepted range.', 'rowCount'));
    if (!actorId) fatal.push(issue('ACTOR_ID_INVALID', 'A safe stable actor ID is required.', 'actorId'));
    if (!importedAt) fatal.push(issue('IMPORTED_AT_INVALID', 'Import timestamp must be ISO UTC.', 'importedAt'));
    if (!dictionaryVersion) fatal.push(issue('DICTIONARY_VERSION_INVALID', 'A safe dictionary version is required.', 'dictionaryVersion'));
    if (BATCH_OUTCOMES.indexOf(outcome) < 0) fatal.push(issue('BATCH_OUTCOME_INVALID', 'Unknown batch outcome.', 'outcome'));
    if (!Array.isArray(value.warningCodes) || value.warningCodes.length > 100) fatal.push(issue('WARNING_CODES_INVALID', 'Warning codes must be a bounded array.', 'warningCodes'));
    else value.warningCodes.forEach(function (rawCode, index) {
      var code = cleanText(rawCode).toUpperCase();
      if (!/^[A-Z][A-Z0-9_:-]{0,63}$/.test(code)) fatal.push(issue('WARNING_CODE_INVALID', 'Warning code is unsafe.', 'warningCodes[' + index + ']'));
      else if (warningCodes.indexOf(code) < 0) warningCodes.push(code);
    });
    warningCodes.sort();

    var result = validationResult(fatal, warnings);
    result.code = result.ok ? 'BATCH_METADATA_VALID' : 'BATCH_METADATA_INVALID';
    if (result.ok) result.metadata = Object.freeze({
      reportId: reportId, storeCode: storeCode, financialYear: financialYear,
      periodStart: periodStart, declaredPeriodEnd: declaredPeriodEnd,
      fileLabel: fileLabel, fileSha256: fileSha256, rowCount: rowCount,
      actorId: actorId, importedAt: importedAt,
      dictionaryVersion: dictionaryVersion,
      warningCodes: Object.freeze(warningCodes), outcome: outcome
    });
    return result;
  }

  function batchIdentity(value) {
    var checked = validateBatchMetadata(value);
    if (!checked.ok) return '';
    var metadata = checked.metadata;
    return [metadata.storeCode, metadata.financialYear,
      metadata.periodStart + '..' + metadata.declaredPeriodEnd,
      metadata.reportId, metadata.fileSha256].join('|');
  }

  return Object.freeze({
    REPORT_IDS: REPORT_IDS,
    STORE_CODES: STORE_CODES,
    TRANSACTION_TYPES: TRANSACTION_TYPES,
    BATCH_OUTCOMES: BATCH_OUTCOMES,
    validationResult: validationResult,
    normalizeCellText: normalizeCellText,
    normalizeHeader: normalizeHeader,
    normalizeHeaderSignature: normalizeHeaderSignature,
    detectReport: detectReport,
    isForbiddenPiiHeader: isForbiddenPiiHeader,
    yyyyMmDdToIso: yyyyMmDdToIso,
    financialYearFromInvoiceDate: financialYearFromInvoiceDate,
    transactionEffect: transactionEffect,
    preparePersistableRow: preparePersistableRow,
    sanitizeFileLabel: sanitizeFileLabel,
    validateBatchMetadata: validateBatchMetadata,
    batchIdentity: batchIdentity
  });
});
