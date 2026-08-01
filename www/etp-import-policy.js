/* E1-0 ETP import discovery and control policy.
   This dependency-free kernel deliberately contains no production report
   signatures, XLSX reader, persistence, UI, or cryptography. Report signatures
   and per-report field whitelists must be supplied by the caller from approved
   source evidence. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarEtpImportPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var REPORT_IDS = Object.freeze(['R022', 'R025', 'R013', 'R003']);
  var STORE_CODES = Object.freeze(['WLMHW', 'HEMW']);
  var TRANSACTION_TYPES = Object.freeze(['INV', 'SR', 'BC']);
  var BATCH_OUTCOMES = Object.freeze([
    'PREVIEW',
    'VALIDATED',
    'ACCEPTED',
    'REJECTED',
    'ABORTED'
  ]);
  var MAX_BATCH_ROWS = 10000000;
  var MAX_FILE_LABEL = 120;

  /* Explicitly blocked before a row can become persistable. These aliases are
     normalized through normalizeHeader(), so spacing/punctuation variants map
     to the same token. The list is intentionally conservative: E1 facts do not
     need customer/contact/payment-instrument secrets. */
  var PII_HEADER_ALIASES = Object.freeze([
    'CUSTOMER_NAME',
    'CUSTOMER_MOBILE',
    'CUSTOMERMOBILE',
    'MOBILE',
    'MOBILE_NO',
    'MOBILE_NUMBER',
    'PHONE',
    'PHONE_NO',
    'PHONE_NUMBER',
    'CONTACT',
    'CONTACT_NO',
    'CONTACT_NUMBER',
    'EMAIL',
    'EMAIL_ID',
    'CUSTOMER_EMAIL',
    'ADDRESS',
    'CUSTOMER_ADDRESS',
    'LOYALTY_CONTACT',
    'ENCIRCLE_NO',
    'ENCIRCLE_NUMBER',
    'ULP_NO',
    'ULP_NUMBER',
    'CARD_NO',
    'CARD_NUMBER',
    'CREDIT_CARD_NO',
    'CREDIT_CARD_NUMBER',
    'CREDITCARDNO',
    'GIFT_CARD_NO',
    'GIFT_CARD_NUMBER',
    'GIFTCARDNO',
    'OTP',
    'APPROVAL_OTP',
    'APPROVAL_SECRET',
    'CUSTOMER_PAN',
    'AADHAAR',
    'AADHAAR_NO',
    'UID'
  ]);
  var PII_LOOKUP = PII_HEADER_ALIASES.reduce(function (lookup, header) {
    lookup[header] = true;
    return lookup;
  }, Object.create(null));

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function issue(code, message, field) {
    var value = { code: String(code || 'INVALID'), message: String(message || 'Invalid value.') };
    if (field) value.field = String(field);
    return value;
  }

  function normalizeIssues(values) {
    return (Array.isArray(values) ? values : []).map(function (value) {
      if (isRecord(value) && value.code) {
        return issue(value.code, value.message, value.field);
      }
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

  function normalizedSignature(headers) {
    var fatal = [];
    if (!Array.isArray(headers) || !headers.length) {
      return Object.assign(validationResult([
        issue('HEADER_ROW_REQUIRED', 'A non-empty header row is required.', 'headers')
      ], []), { headers: [], key: '' });
    }
    var normalized = [];
    var seen = Object.create(null);
    headers.forEach(function (header, index) {
      var value = '';
      try { value = normalizeHeader(header); }
      catch (error) {
        fatal.push(issue('HEADER_INVALID', 'Header cells must be text-compatible.', 'headers[' + index + ']'));
        return;
      }
      if (!value) {
        fatal.push(issue('HEADER_EMPTY', 'Blank headers are not allowed.', 'headers[' + index + ']'));
      } else if (seen[value]) {
        fatal.push(issue('HEADER_DUPLICATE', 'Duplicate normalized header: ' + value, value));
      } else {
        seen[value] = true;
        normalized.push(value);
      }
    });
    normalized.sort();
    return Object.assign(validationResult(fatal, []), {
      headers: normalized,
      key: fatal.length ? '' : normalized.join('\u001f')
    });
  }

  function signaturesForDefinition(value) {
    if (isRecord(value)) value = value.signatures;
    if (!Array.isArray(value)) return [];
    if (!value.length) return [];
    return value.every(function (item) { return !Array.isArray(item); }) ? [value] : value;
  }

  function definitionEntries(definitions) {
    var fatal = [];
    var entries = [];
    if (!isRecord(definitions)) {
      return { fatalErrors: [issue('DEFINITIONS_REQUIRED', 'Caller-supplied report signatures are required.', 'definitions')], entries: [] };
    }
    Object.keys(definitions).forEach(function (rawReportId) {
      var reportId = cleanText(rawReportId).toUpperCase();
      if (REPORT_IDS.indexOf(reportId) < 0) {
        fatal.push(issue('REPORT_ID_UNKNOWN', 'Unknown report definition: ' + reportId, rawReportId));
        return;
      }
      var signatures = signaturesForDefinition(definitions[rawReportId]);
      if (!signatures.length) {
        fatal.push(issue('SIGNATURE_REQUIRED', 'At least one signature is required for ' + reportId + '.', reportId));
        return;
      }
      signatures.forEach(function (headers, index) {
        var signature = normalizedSignature(headers);
        if (!signature.ok) {
          signature.fatalErrors.forEach(function (entry) {
            fatal.push(issue('SIGNATURE_INVALID', reportId + ' signature ' + (index + 1) + ': ' + entry.message, reportId));
          });
          return;
        }
        entries.push({ reportId: reportId, key: signature.key, headers: signature.headers });
      });
    });
    return { fatalErrors: fatal, entries: entries };
  }

  /* Exact, order-independent header-set matching only. Filename is not an input
     and therefore cannot influence detection. */
  function detectReport(headers, definitions) {
    var source = normalizedSignature(headers);
    var normalizedDefinitions = definitionEntries(definitions);
    var fatal = source.fatalErrors.concat(normalizedDefinitions.fatalErrors);
    if (fatal.length) {
      return Object.assign(validationResult(fatal, []), { code: 'HEADER_DETECTION_INVALID' });
    }
    var reportIds = normalizedDefinitions.entries
      .filter(function (entry) { return entry.key === source.key; })
      .map(function (entry) { return entry.reportId; })
      .filter(function (reportId, index, values) { return values.indexOf(reportId) === index; });
    if (!reportIds.length) {
      return Object.assign(validationResult([
        issue('HEADER_UNKNOWN', 'The header signature is not approved for an E1 report.', 'headers')
      ], []), { code: 'HEADER_UNKNOWN', signature: source.headers });
    }
    if (reportIds.length > 1) {
      return Object.assign(validationResult([
        issue('HEADER_AMBIGUOUS', 'The header signature matches more than one report.', 'headers')
      ], []), { code: 'HEADER_AMBIGUOUS', signature: source.headers, matches: reportIds.slice().sort() });
    }
    return Object.assign(validationResult([], []), {
      code: 'REPORT_DETECTED',
      reportId: reportIds[0],
      signature: source.headers
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

  function isoDate(value) {
    var text = cleanText(value);
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return '';
    return yyyyMmDdToIso(match[1] + match[2] + match[3]);
  }

  function financialYearFromInvoiceDate(value) {
    var date = isoDate(value) || yyyyMmDdToIso(value);
    if (!date) return '';
    var year = Number(date.slice(0, 4));
    var month = Number(date.slice(5, 7));
    var start = month >= 4 ? year : year - 1;
    return String(start).padStart(4, '0') + '-' + String((start + 1) % 100).padStart(2, '0');
  }

  function normalizedRowEntries(sourceRow) {
    var fatal = [];
    var entries = [];
    var seen = Object.create(null);
    if (!isRecord(sourceRow)) {
      return { fatalErrors: [issue('ROW_REQUIRED', 'A source row object is required.', 'row')], entries: [] };
    }
    Object.keys(sourceRow).forEach(function (rawHeader) {
      var header = '';
      try { header = normalizeHeader(rawHeader); }
      catch (error) {
        fatal.push(issue('ROW_HEADER_INVALID', 'Row headers must be text-compatible.', rawHeader));
        return;
      }
      if (!header) {
        fatal.push(issue('ROW_HEADER_EMPTY', 'Blank row headers are not allowed.', rawHeader));
      } else if (seen[header]) {
        fatal.push(issue('ROW_HEADER_DUPLICATE', 'Duplicate normalized row header: ' + header, header));
      } else {
        seen[header] = true;
        entries.push({ rawHeader: rawHeader, header: header, value: sourceRow[rawHeader] });
      }
    });
    return { fatalErrors: fatal, entries: entries };
  }

  function businessDateFromRow(sourceRow) {
    var normalized = normalizedRowEntries(sourceRow);
    var fatal = normalized.fatalErrors.slice();
    var invoiceDate = normalized.entries.find(function (entry) { return entry.header === 'INVOICEDATE'; });
    if (!invoiceDate) {
      fatal.push(issue('INVOICEDATE_REQUIRED', 'INVOICEDATE is required as the business date.', 'INVOICEDATE'));
    }
    var date = invoiceDate ? yyyyMmDdToIso(invoiceDate.value) : '';
    if (invoiceDate && !date) {
      fatal.push(issue('INVOICEDATE_INVALID', 'INVOICEDATE must be a real YYYYMMDD date.', 'INVOICEDATE'));
    }
    var result = validationResult(fatal, []);
    if (result.ok) {
      result.businessDate = date;
      result.financialYear = financialYearFromInvoiceDate(date);
      result.sourceHeader = 'INVOICEDATE';
    }
    return result;
  }

  function transactionEffect(value) {
    var raw = '';
    try { raw = normalizeCellText(value).toUpperCase(); }
    catch (error) { raw = ''; }
    var sign = raw === 'INV' ? 1 : (raw === 'SR' || raw === 'BC' ? -1 : 0);
    return Object.freeze({
      code: sign ? raw : 'UNKNOWN',
      raw: raw,
      known: sign !== 0,
      quantitySign: sign,
      valueSign: sign,
      salesEffect: sign,
      hasEffect: sign !== 0
    });
  }

  function safeOutputField(value) {
    var field = cleanText(value);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)) return '';
    if (field === 'constructor' || field === 'prototype' || field === '__proto__') return '';
    return field;
  }

  function whitelistForReport(reportId, reportWhitelists) {
    var value = isRecord(reportWhitelists) ? reportWhitelists[reportId] : null;
    if (isRecord(value) && isRecord(value.fields)) value = value.fields;
    return isRecord(value) ? value : null;
  }

  function normalizedWhitelist(reportId, reportWhitelists) {
    var fatal = [];
    var source = whitelistForReport(reportId, reportWhitelists);
    var fields = Object.create(null);
    var outputs = Object.create(null);
    if (!source) {
      return { fatalErrors: [issue('WHITELIST_REQUIRED', 'A caller-supplied whitelist is required for ' + reportId + '.', reportId)], fields: fields };
    }
    Object.keys(source).forEach(function (rawHeader) {
      var header = '';
      try { header = normalizeHeader(rawHeader); }
      catch (error) {
        fatal.push(issue('WHITELIST_HEADER_INVALID', 'Whitelist headers must be text-compatible.', rawHeader));
        return;
      }
      var output = safeOutputField(source[rawHeader]);
      if (!header || !output) {
        fatal.push(issue('WHITELIST_FIELD_INVALID', 'Whitelist entries need a safe source and output field.', rawHeader));
      } else if (PII_LOOKUP[header]) {
        fatal.push(issue('PII_FIELD_FORBIDDEN', 'PII fields cannot be approved for ETP persistence.', header));
      } else if (Object.prototype.hasOwnProperty.call(fields, header)) {
        fatal.push(issue('WHITELIST_HEADER_DUPLICATE', 'Duplicate normalized whitelist header: ' + header, header));
      } else if (outputs[output]) {
        fatal.push(issue('WHITELIST_OUTPUT_DUPLICATE', 'Two source fields map to ' + output + '.', output));
      } else {
        fields[header] = output;
        outputs[output] = true;
      }
    });
    return { fatalErrors: fatal, fields: fields };
  }

  /* Returns persistableRow only after every source field is approved and no
     explicit PII alias is present. Unknown TRANS_TYPE is retained as raw text
     for traceability but receives zero financial/quantity effect. */
  function preparePersistableRow(reportIdValue, sourceRow, reportWhitelists) {
    var reportId = cleanText(reportIdValue).toUpperCase();
    var fatal = [];
    var warnings = [];
    if (REPORT_IDS.indexOf(reportId) < 0) {
      fatal.push(issue('REPORT_ID_UNKNOWN', 'The row report is not an approved E1 report.', 'reportId'));
    }
    var normalized = normalizedRowEntries(sourceRow);
    fatal = fatal.concat(normalized.fatalErrors);
    var whitelist = normalizedWhitelist(reportId, reportWhitelists);
    fatal = fatal.concat(whitelist.fatalErrors);

    normalized.entries.forEach(function (entry) {
      if (PII_LOOKUP[entry.header]) {
        fatal.push(issue('PII_FIELD_FORBIDDEN', 'PII field rejected before persistence: ' + entry.header, entry.header));
      } else if (!Object.prototype.hasOwnProperty.call(whitelist.fields, entry.header)) {
        fatal.push(issue('FIELD_NOT_WHITELISTED', 'Unapproved source field: ' + entry.header, entry.header));
      }
    });

    var dateResult = businessDateFromRow(sourceRow);
    fatal = fatal.concat(dateResult.fatalErrors);
    var transEntry = normalized.entries.find(function (entry) { return entry.header === 'TRANS_TYPE'; });
    var effect = transactionEffect(transEntry ? transEntry.value : '');
    if (!effect.known) {
      warnings.push(issue('TRANS_TYPE_UNKNOWN_NO_EFFECT', 'Unknown TRANS_TYPE has no financial or quantity effect.', 'TRANS_TYPE'));
    }

    var fields = {};
    if (!fatal.length) {
      normalized.entries.forEach(function (entry) {
        try {
          fields[whitelist.fields[entry.header]] = normalizeCellText(entry.value);
        } catch (error) {
          fatal.push(issue('CELL_TYPE_INVALID', 'Field must contain a text-compatible primitive.', entry.header));
        }
      });
    }
    var result = validationResult(fatal, warnings);
    if (result.ok) {
      result.persistableRow = Object.freeze({
        reportId: reportId,
        fields: Object.freeze(fields),
        businessDate: dateResult.businessDate,
        financialYear: dateResult.financialYear,
        transaction: effect
      });
    }
    return result;
  }

  function sanitizeFileLabel(value) {
    var original = cleanText(value).replace(/[\u0000-\u001f\u007f]/g, '');
    var leaf = original.split(/[\\/]/).pop() || '';
    return leaf
      .replace(/[^A-Za-z0-9._() -]+/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/_+/g, '_')
      .replace(/^[ ._-]+|[ ._-]+$/g, '')
      .slice(0, MAX_FILE_LABEL);
  }

  function normalizeTimestamp(value) {
    var text = cleanText(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)) return '';
    var time = Date.parse(text);
    return Number.isFinite(time) ? new Date(time).toISOString() : '';
  }

  function safeToken(value, maxLength) {
    var text = cleanText(value);
    return text && text.length <= maxLength && /^[A-Za-z0-9._:-]+$/.test(text) ? text : '';
  }

  function validFinancialYear(value) {
    var match = /^(\d{4})-(\d{2})$/.exec(cleanText(value));
    return !!match && Number(match[2]) === (Number(match[1]) + 1) % 100;
  }

  function validateBatchMetadata(value) {
    var fatal = [];
    var warnings = [];
    if (!isRecord(value)) {
      return Object.assign(validationResult([
        issue('BATCH_METADATA_REQUIRED', 'Batch metadata is required.', 'metadata')
      ], []), { code: 'BATCH_METADATA_INVALID' });
    }
    var reportId = cleanText(value.reportId).toUpperCase();
    var storeCode = cleanText(value.storeCode).toUpperCase();
    var financialYear = cleanText(value.financialYear);
    var periodStart = isoDate(value.periodStart);
    var declaredPeriodEnd = isoDate(value.declaredPeriodEnd);
    var fileLabel = sanitizeFileLabel(value.fileLabel);
    var rawFileLabel = cleanText(value.fileLabel).replace(/[\u0000-\u001f\u007f]/g, '');
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
    if (periodStart && declaredPeriodEnd && periodStart > declaredPeriodEnd) fatal.push(issue('PERIOD_RANGE_INVALID', 'Period start is after declared period end.', 'periodStart'));
    if (periodStart && validFinancialYear(financialYear) && financialYearFromInvoiceDate(periodStart) !== financialYear) {
      fatal.push(issue('PERIOD_FY_MISMATCH', 'Period start is outside the declared financial year.', 'periodStart'));
    }
    if (declaredPeriodEnd && validFinancialYear(financialYear) && financialYearFromInvoiceDate(declaredPeriodEnd) !== financialYear) {
      fatal.push(issue('PERIOD_FY_MISMATCH', 'Period end is outside the declared financial year.', 'declaredPeriodEnd'));
    }
    if (!fileLabel) fatal.push(issue('FILE_LABEL_INVALID', 'A safe source file label is required.', 'fileLabel'));
    else if (fileLabel !== rawFileLabel) warnings.push(issue('FILE_LABEL_SANITIZED', 'The source file label was reduced to a safe leaf label.', 'fileLabel'));
    if (!/^[a-f0-9]{64}$/.test(fileSha256)) fatal.push(issue('FILE_HASH_INVALID', 'Source SHA-256 must be 64 hexadecimal characters.', 'fileSha256'));
    if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > MAX_BATCH_ROWS) fatal.push(issue('ROW_COUNT_INVALID', 'Row count is outside the accepted range.', 'rowCount'));
    if (!actorId) fatal.push(issue('ACTOR_ID_INVALID', 'A safe stable actor ID is required.', 'actorId'));
    if (!importedAt) fatal.push(issue('IMPORTED_AT_INVALID', 'Import timestamp must be an ISO UTC timestamp.', 'importedAt'));
    if (!dictionaryVersion) fatal.push(issue('DICTIONARY_VERSION_INVALID', 'A safe dictionary version is required.', 'dictionaryVersion'));
    if (BATCH_OUTCOMES.indexOf(outcome) < 0) fatal.push(issue('BATCH_OUTCOME_INVALID', 'Unknown batch outcome.', 'outcome'));
    if (!Array.isArray(value.warningCodes)) {
      fatal.push(issue('WARNING_CODES_INVALID', 'Warning codes must be an array.', 'warningCodes'));
    } else if (value.warningCodes.length > 100) {
      fatal.push(issue('WARNING_CODES_INVALID', 'Too many warning codes.', 'warningCodes'));
    } else {
      value.warningCodes.forEach(function (warningCode, index) {
        var code = cleanText(warningCode).toUpperCase();
        if (!/^[A-Z][A-Z0-9_:-]{0,63}$/.test(code)) {
          fatal.push(issue('WARNING_CODE_INVALID', 'Warning code is unsafe.', 'warningCodes[' + index + ']'));
        } else if (warningCodes.indexOf(code) < 0) {
          warningCodes.push(code);
        }
      });
      warningCodes.sort();
    }

    var result = validationResult(fatal, warnings);
    result.code = result.ok ? 'BATCH_METADATA_VALID' : 'BATCH_METADATA_INVALID';
    if (result.ok) {
      result.metadata = Object.freeze({
        reportId: reportId,
        storeCode: storeCode,
        financialYear: financialYear,
        periodStart: periodStart,
        declaredPeriodEnd: declaredPeriodEnd,
        fileLabel: fileLabel,
        fileSha256: fileSha256,
        rowCount: rowCount,
        actorId: actorId,
        importedAt: importedAt,
        dictionaryVersion: dictionaryVersion,
        warningCodes: Object.freeze(warningCodes),
        outcome: outcome
      });
    }
    return result;
  }

  /* This is a canonical identity string, not a digest. The caller supplies and
     separately computes the validated source SHA-256. */
  function batchIdentity(value) {
    var checked = validateBatchMetadata(value);
    if (!checked.ok) return '';
    var metadata = checked.metadata;
    return [
      metadata.storeCode,
      metadata.financialYear,
      metadata.periodStart + '..' + metadata.declaredPeriodEnd,
      metadata.reportId,
      metadata.fileSha256
    ].join('|');
  }

  return Object.freeze({
    REPORT_IDS: REPORT_IDS,
    STORE_CODES: STORE_CODES,
    TRANSACTION_TYPES: TRANSACTION_TYPES,
    BATCH_OUTCOMES: BATCH_OUTCOMES,
    PII_HEADER_ALIASES: PII_HEADER_ALIASES,
    validationResult: validationResult,
    normalizeCellText: normalizeCellText,
    normalizeHeader: normalizeHeader,
    normalizeHeaderSignature: normalizedSignature,
    detectReport: detectReport,
    yyyyMmDdToIso: yyyyMmDdToIso,
    financialYearFromInvoiceDate: financialYearFromInvoiceDate,
    businessDateFromRow: businessDateFromRow,
    transactionEffect: transactionEffect,
    preparePersistableRow: preparePersistableRow,
    sanitizeFileLabel: sanitizeFileLabel,
    validateBatchMetadata: validateBatchMetadata,
    batchIdentity: batchIdentity
  });
});
