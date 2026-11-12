/* ETP report-engine bridge: signed pack verifier (pure: no DOM, no storage, no network, no timers).
   One file frame (.scc-etp), ECDSA P-256 / SHA-256 over "SCC-ETP-BRIDGE-v1\n" plus the exact manifest bytes.
   The pack is authenticated BEFORE any of its content is parsed. A pack is accepted completely or not at all.
   The trust anchor is a parameter. The shipped anchor is empty, so every pack is refused with ETP_BRIDGE_TRUST_GATE_CLOSED.
   Format: docs/ETP-BRIDGE-PACK-FORMAT-V1.md. Owner decisions given in chat, 2026-11-12 (Q3, Q5, Q6, Q7, Q8). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  /* Node (CommonJS) gets the factory. A browser page gets only the frozen instance below, never the factory. */
  if (typeof module === 'object' && module && module.exports) { module.exports = api.cjs; return; }
  if (!root) return;
  /* Defined once and never replaced: an existing property with this name is left alone, never trusted. */
  if (Object.prototype.hasOwnProperty.call(root, 'SaagarEtpBridgePackVerifier')) return;
  try {
    Object.defineProperty(root, 'SaagarEtpBridgePackVerifier', { value: api.instance(), writable: false, configurable: false, enumerable: true });
  } catch (_) { /* no instance: the facade treats the bridge as closed */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var PACK_VERSION = 1;
  var CONTRACT = 'SCC_ETP_BRIDGE_V1';
  var GATE_ID = 'GATE-ETP-BRIDGE-TRUST';
  var SIGN_DOMAIN = 'SCC-ETP-BRIDGE-v1\n';
  var MAGIC = 'SCCETP1\n';
  var REPORT_IDS = Object.freeze(['R003', 'R013', 'R022', 'R025']);
  var LIMITS = Object.freeze({
    FILE_BYTES: 33554432, MANIFEST_BYTES: 262144, HEADER_BYTES: 81, MIN_FILE_BYTES: 102,
    ROWS_PER_REPORT: 50000, LINE_BYTES: 16384, CELL_CHARS: 4096, DAYS: 366, DEPTH: 8,
    FIGURES: 32, TRUSTED_KEYS: 2, MANIFEST_STRING_CHARS: 120, ROW_DIGITS: 11, SUM_DIGITS: 16,
    EARLIEST_PERIOD_START: '2024-04-01', FUTURE_DAYS: 2
  });
  var FRAME = Object.freeze({ MAGIC: MAGIC, HEADER_BYTES: 81, SIG_ALG_ECDSA_P256_SHA256: 1 });

  /* ---- codes and messages ------------------------------------------------------------------------------- */
  var CODE_NAMES = ['TRUST_GATE_CLOSED', 'TRUST_ANCHOR_INVALID', 'CRYPTO_UNAVAILABLE', 'INPUT_INVALID', 'FILE_TOO_LARGE',
    'FRAME_INVALID', 'MAGIC_INVALID', 'SIGNATURE_ALGORITHM_UNSUPPORTED', 'KEY_UNKNOWN', 'SIGNATURE_INVALID', 'CRYPTO_FAILED',
    'MANIFEST_INVALID', 'CONTRACT_UNSUPPORTED', 'VERSION_UNSUPPORTED', 'SCHEMA_INVALID', 'ROW_LIMIT_EXCEEDED', 'KEY_ID_MISMATCH',
    'FIELD_FORBIDDEN', 'COLUMNS_MISMATCH', 'EXPORT_ROLE_REFUSED', 'STORE_HEMW_BLOCKED', 'STORE_REFUSED', 'PERIOD_INVALID',
    'PERIOD_INCOMPLETE', 'TENDER_DICTIONARY_MISMATCH', 'HASH_MISMATCH', 'ROW_INVALID', 'ROW_OUT_OF_PERIOD', 'ROW_COUNT_MISMATCH',
    'TOTALS_MISMATCH', 'INTERNAL_ERROR'];
  var C = {};
  var CODES = (function () {
    var list = [];
    for (var i = 0; i < CODE_NAMES.length; i += 1) { C[CODE_NAMES[i]] = 'ETP_BRIDGE_' + CODE_NAMES[i]; list.push(C[CODE_NAMES[i]]); }
    return Object.freeze(list);
  })();
  Object.freeze(C);
  var MESSAGES = Object.freeze((function () {
    var text = {};
    text[C.TRUST_GATE_CLOSED] = 'Engine packs cannot be used yet: no trusted engine key is installed in this app. Keep using the four ETP Excel files.';
    text[C.TRUST_ANCHOR_INVALID] = 'The trusted engine key list inside this app is not valid, so engine packs are switched off.';
    text[C.CRYPTO_UNAVAILABLE] = 'This device cannot check engine pack signatures, so the pack was not used.';
    text[C.INPUT_INVALID] = 'The pack could not be read as a file. Pick the engine pack file again.';
    text[C.FILE_TOO_LARGE] = 'The pack file is larger than 32 MB, so it was not used.';
    text[C.FRAME_INVALID] = 'The pack file is incomplete or damaged and was not used.';
    text[C.MAGIC_INVALID] = 'This file is not an engine pack.';
    text[C.SIGNATURE_ALGORITHM_UNSUPPORTED] = 'The pack uses a signature type this app does not support.';
    text[C.KEY_UNKNOWN] = 'The pack was signed with a key this app does not trust.';
    text[C.SIGNATURE_INVALID] = 'The pack signature does not match its contents. The pack may have been altered.';
    text[C.CRYPTO_FAILED] = 'The signature check could not run on this device. The pack was not used.';
    text[C.MANIFEST_INVALID] = 'The pack description is not in the agreed form and was not used.';
    text[C.CONTRACT_UNSUPPORTED] = 'The pack follows a different contract than this app supports.';
    text[C.VERSION_UNSUPPORTED] = 'The pack format version is not supported by this app.';
    text[C.SCHEMA_INVALID] = 'The pack description has missing or unexpected items and was not used.';
    text[C.ROW_LIMIT_EXCEEDED] = 'A report in the pack has more rows than this app accepts.';
    text[C.KEY_ID_MISMATCH] = 'The key named inside the pack does not match the key on the file header.';
    text[C.FIELD_FORBIDDEN] = 'The pack contains a column that is not allowed because it could identify a person or a file.';
    text[C.COLUMNS_MISMATCH] = 'The pack columns differ from the columns this app expects.';
    text[C.EXPORT_ROLE_REFUSED] = 'The pack was not exported by the Owner role and was not used.';
    text[C.STORE_HEMW_BLOCKED] = 'HEMW packs are blocked. Only the WLMHW store is accepted for now.';
    text[C.STORE_REFUSED] = 'The pack is for a store this app does not accept. Only WLMHW is accepted.';
    text[C.PERIOD_INVALID] = 'The pack period or financial year is not valid.';
    text[C.PERIOD_INCOMPLETE] = 'The engine has not finalised every day of the pack period.';
    text[C.TENDER_DICTIONARY_MISMATCH] = 'The pack uses a different payment dictionary than this app.';
    text[C.HASH_MISMATCH] = 'A report section does not match the size or checksum written in the pack.';
    text[C.ROW_INVALID] = 'A report row in the pack is not in the agreed form.';
    text[C.ROW_OUT_OF_PERIOD] = 'A report row in the pack is dated outside the pack period.';
    text[C.ROW_COUNT_MISMATCH] = 'The number of rows in a report does not match the pack description.';
    text[C.TOTALS_MISMATCH] = 'The report rows do not add up exactly to the engine totals in the pack.';
    text[C.INTERNAL_ERROR] = 'The pack could not be checked because of an unexpected problem.';
    return text;
  })());

  /* ---- report layout: the tablet's own analytics projections (etp-module-gateway.js) -------------------------- */
  var SPEC = {
    R003: [['invoice_date', 'date'], ['transaction_type_raw', 'type'], ['net_amount', 'm2'], ['scheme_discount', 'm2'], ['user_discount', 'm2']],
    R013: [['invoice_date', 'date'], ['invoice_number', 'text'], ['transaction_type_raw', 'type'], ['quantity', 'm3'], ['net_amount', 'm2'], ['cro_number', 'text']],
    R022: [['invoice_date', 'date'], ['invoice_number', 'text'], ['transaction_type_raw', 'type'], ['invoice_quantity', 'm3'], ['net_value', 'm2'],
      ['cash_amount', 'm2'], ['card_amount', 'm2'], ['bhim_upi_amount', 'm2'], ['phonepe_amount', 'm2'], ['paytm_amount', 'm2'], ['razorpay_amount', 'm2'],
      ['bharatpe_amount', 'm2'], ['cheque_amount', 'm2'], ['others_amount', 'm2'], ['payment_type24_amount', 'm2']],
    R025: [['invoice_date', 'date'], ['invoice_number', 'text'], ['transaction_type_raw', 'type'], ['quantity', 'm3'], ['net_amount', 'm2'], ['brand', 'text'],
      ['cluster', 'text'], ['gender', 'text'], ['scheme_discount', 'm2'], ['user_discount', 'm2'], ['tax_amount', 'm2']]
  };
  var STRING_LITERAL = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.source;
  var LAYOUT = {}, REPORT_COLUMNS = {}, MEASURES = {};
  (function () {
    for (var r = 0; r < REPORT_IDS.length; r += 1) {
      var id = REPORT_IDS[r], list = SPEC[id], names = [], kinds = [], measures = [], measureIndex = [], mi = 0;
      for (var i = 0; i < list.length; i += 1) {
        names.push(list[i][0]); kinds.push(list[i][1]);
        if (list[i][1] === 'm2' || list[i][1] === 'm3') {
          measures.push(Object.freeze({ name: list[i][0], scale: list[i][1] === 'm3' ? 3 : 2 }));
          measureIndex.push(mi); mi += 1;
        } else measureIndex.push(-1);
      }
      REPORT_COLUMNS[id] = Object.freeze(names);
      MEASURES[id] = Object.freeze(measures);
      LAYOUT[id] = { names: names, kinds: kinds, measureIndex: measureIndex, measures: measures, line: lineExpression(names) };
    }
    Object.freeze(REPORT_COLUMNS); Object.freeze(MEASURES);
  })();
  function lineExpression(names) {
    var parts = [];
    for (var i = 0; i < names.length; i += 1) parts.push('"' + names[i] + '":(' + STRING_LITERAL + '|null)');
    return new RegExp('^\\{' + parts.join(',') + '\\}$');
  }

  /* ---- shared patterns ---------------------------------------------------------------------------------- */
  var FORBIDDEN_FIELD = /(?:^|_)(?:workbook|worksheet|filename|file_label|file_path|source_name|source_bytes|blob|base64|customer|consumer|mobile|phone|email|address|name|aadhaar|pan|dob)(?:$|_)/i;
  var MANIFEST_STRING = /^[A-Za-z0-9 ._:|\/+-]{0,120}$/;
  var DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var CREATED_AT = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)Z$/;
  var HEX16 = /^[0-9a-f]{16}$/, HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/;
  var POINT_HEX = /^04[0-9a-f]{128}$/;
  var FY_SHAPE = /^(\d{4})-(\d{2})$/;
  var DEC2 = /^(-?)(0|[1-9][0-9]*)\.([0-9]{2})$/, DEC3 = /^(-?)(0|[1-9][0-9]*)\.([0-9]{3})$/;
  var INT_TEXT = /^-?(0|[1-9][0-9]*)$/;
  var CONTROL = /[\u0000-\u001f]/;
  var TOP_KEYS = ['contract', 'createdAtUtc', 'engine', 'engineFigures', 'engineGeneration', 'exportId', 'exportedByRole', 'finalisedThrough', 'keyId',
    'paymentType25RowCount', 'reports', 'schemaVersion', 'scope', 'supersedesExportId', 'tenderDictionaryVersion'];
  var ENGINE_KEYS = ['migrationLevel', 'product', 'version'];
  var SCOPE_KEYS = ['financialYear', 'periodEnd', 'periodStart', 'scopeKey', 'storeCode'];
  var REPORT_KEYS = ['bytes', 'columns', 'engineTotals', 'rowCount', 'sha256', 'sourceFileCount', 'sourceSetSha256', 'zeroActivity'];
  var TOTALS_KEYS = ['byDay', 'sums'];
  var DAY_KEYS = ['date', 'rowCount', 'sums'];
  var FIGURE_KEYS = ['date', 'figureId', 'kind', 'reportId', 'ruleRef', 'value'];
  var FIGURE_ID = /^[A-Z0-9][A-Z0-9_.]{0,47}$/, RULE_REF = /^[A-Za-z0-9._:-]{1,64}$/;
  var FIGURE_KINDS = ['COUNT', 'MONEY_UNITS', 'QUANTITY_UNITS'];

  /* ---- captured platform primitives (bound at load so a later script cannot swap them for this instance) -------- */
  var jsonParse = JSON.parse;
  var hasOwn = Object.prototype.hasOwnProperty;
  var typedTag = (function () {
    try { return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get; } catch (_) { return null; }
  })();
  var typedLength = (function () {
    try { return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get; } catch (_) { return null; }
  })();
  var bufferLength = (function () {
    try { return Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get; } catch (_) { return null; }
  })();

  /* ---- small helpers ------------------------------------------------------------------------------------- */
  var HEX_DIGITS = '0123456789abcdef';
  function hex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) out += HEX_DIGITS.charAt(bytes[i] >> 4) + HEX_DIGITS.charAt(bytes[i] & 15);
    return out;
  }
  function hexToBytes(text) {
    var out = new Uint8Array(text.length / 2);
    for (var i = 0; i < out.length; i += 1) out[i] = parseInt(text.substr(i * 2, 2), 16);
    return out;
  }
  function asciiBytes(text) {
    var out = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
    return out;
  }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isInt(value, min, max) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
  function isString(value, min, max) { return typeof value === 'string' && value.length >= min && value.length <= max; }
  function sameList(left, right) {
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
    return true;
  }
  function pad2(value) { return (value < 10 ? '0' : '') + value; }
  function u32(bytes, at) { return bytes[at] * 16777216 + bytes[at + 1] * 65536 + bytes[at + 2] * 256 + bytes[at + 3]; }
  function bad(code, field, report) { return { code: code, field: field, report: report }; }

  function dateParts(text) {
    var match = DATE_SHAPE.exec(text);
    if (!match) return null;
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
    return [year, month, day];
  }
  function financialYearOf(parts) {
    var start = parts[1] >= 4 ? parts[0] : parts[0] - 1;
    return start + '-' + pad2((start + 1) % 100);
  }
  function dayNumber(parts) { return Math.round(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000); }
  function isoOfDayNumber(number) {
    var date = new Date(number * 86400000);
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  /* Decimal text to integer units (cents, or thousandths). Canonical text only; a negative zero is refused. */
  function decimalUnits(text, scale, maxDigits) {
    if (typeof text !== 'string') return null;
    var match = (scale === 3 ? DEC3 : DEC2).exec(text);
    if (!match) return null;
    var digits = match[2] + match[3];
    if (digits.length > maxDigits) return null;
    var units = Number(digits);
    if (!Number.isSafeInteger(units)) return null;
    if (units === 0 && match[1] === '-') return null;
    return match[1] === '-' ? -units : units;
  }
  function formatUnits(units, scale) {
    var negative = units < 0, digits = String(negative ? -units : units);
    while (digits.length <= scale) digits = '0' + digits;
    return (negative ? '-' : '') + digits.substring(0, digits.length - scale) + '.' + digits.substring(digits.length - scale);
  }

  /* Canonical manifest text: keys sorted by UTF-16 code unit, no whitespace, non-negative safe integers only,
     strings from a closed character set (so no escape sequence ever appears). Throws on anything else. */
  function canon(value) {
    if (value === null) return 'null';
    var type = typeof value;
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'number') {
      if (!Number.isSafeInteger(value) || value < 0 || (value === 0 && 1 / value < 0)) throw new TypeError('ETP_BRIDGE_CANON_NUMBER');
      return String(value);
    }
    if (type === 'string') {
      if (!MANIFEST_STRING.test(value)) throw new TypeError('ETP_BRIDGE_CANON_STRING');
      return '"' + value + '"';
    }
    if (Array.isArray(value)) {
      var items = [];
      for (var i = 0; i < value.length; i += 1) items.push(canon(value[i]));
      return '[' + items.join(',') + ']';
    }
    if (type === 'object') {
      var names = Object.keys(value).sort(), members = [];
      for (var k = 0; k < names.length; k += 1) {
        if (!MANIFEST_STRING.test(names[k])) throw new TypeError('ETP_BRIDGE_CANON_KEY');
        members.push('"' + names[k] + '":' + canon(value[names[k]]));
      }
      return '{' + members.join(',') + '}';
    }
    throw new TypeError('ETP_BRIDGE_CANON_TYPE');
  }
  function canonOrNull(value) { try { return canon(value); } catch (_) { return null; } }
  function textDepth(text) {
    var depth = 0, max = 0;
    for (var i = 0; i < text.length; i += 1) {
      var c = text.charCodeAt(i);
      if (c === 123 || c === 91) { depth += 1; if (depth > max) max = depth; } else if (c === 125 || c === 93) depth -= 1;
    }
    return max;
  }
  function asciiText(bytes) {
    for (var i = 0; i < bytes.length; i += 1) if (bytes[i] < 32 || bytes[i] > 126) return null;
    var parts = [];
    for (var at = 0; at < bytes.length; at += 4096) parts.push(String.fromCharCode.apply(null, bytes.subarray(at, Math.min(bytes.length, at + 4096))));
    return parts.join('');
  }

  /* ---- trust anchor ---------------------------------------------------------------------------------------- */
  function entryShape(entry) {
    if (!isObject(entry)) return null;
    var names = Object.keys(entry).sort();
    if (names.length !== 2 || names[0] !== 'keyId' || names[1] !== 'publicKeyHex') return null;
    if (typeof entry.keyId !== 'string' || !HEX16.test(entry.keyId) || typeof entry.publicKeyHex !== 'string' || !POINT_HEX.test(entry.publicKeyHex)) return null;
    return { keyId: entry.keyId, publicKeyHex: entry.publicKeyHex };
  }
  /* ABSENT: nothing supplied or an empty list (gate closed). INVALID: malformed (gate closed). KEYS: usable shape. */
  function classifyAnchor(list) {
    try {
      if (list === undefined || list === null) return { state: 'ABSENT', keys: [] };
      if (!Array.isArray(list)) return { state: 'INVALID', keys: [] };
      if (list.length === 0) return { state: 'ABSENT', keys: [] };
      if (list.length > LIMITS.TRUSTED_KEYS) return { state: 'INVALID', keys: [] };
      var keys = [], seen = {};
      for (var i = 0; i < list.length; i += 1) {
        var entry = entryShape(list[i]);
        if (!entry || seen[entry.keyId] === true) return { state: 'INVALID', keys: [] };
        seen[entry.keyId] = true; keys.push(entry);
      }
      return { state: 'KEYS', keys: keys };
    } catch (_) { return { state: 'INVALID', keys: [] }; }
  }
  /* The browser reads the trust object once, at load, and accepts it only if it is the frozen, non-writable
     global that etp-bridge-trust.js defines. Anything else, including an earlier hostile definition, closes the gate. */
  function readTrustGlobal(rootObject) {
    try {
      if (!rootObject) return { state: 'ABSENT', keys: [] };
      var descriptor = Object.getOwnPropertyDescriptor(rootObject, 'SaagarEtpBridgeTrust');
      if (!descriptor) return { state: 'ABSENT', keys: [] };
      if (descriptor.writable !== false || descriptor.configurable !== false || !('value' in descriptor)) return { state: 'INVALID', keys: [] };
      var trust = descriptor.value;
      if (!isObject(trust) || !Object.isFrozen(trust)) return { state: 'INVALID', keys: [] };
      var names = Object.keys(trust).sort();
      if (!sameList(names, ['CONTRACT', 'GATE_ID', 'VERSION', 'gate', 'keys'])) return { state: 'INVALID', keys: [] };
      if (trust.VERSION !== 1 || trust.GATE_ID !== GATE_ID || trust.CONTRACT !== CONTRACT || typeof trust.gate !== 'function') return { state: 'INVALID', keys: [] };
      if (!Array.isArray(trust.keys) || !Object.isFrozen(trust.keys)) return { state: 'INVALID', keys: [] };
      return classifyAnchor(trust.keys);
    } catch (_) { return { state: 'INVALID', keys: [] }; }
  }
  function captureCrypto(source) {
    try {
      var subtle = source && source.subtle;
      if (!subtle || typeof subtle.digest !== 'function' || typeof subtle.importKey !== 'function' || typeof subtle.verify !== 'function') return null;
      return { digest: subtle.digest.bind(subtle), importKey: subtle.importKey.bind(subtle), verify: subtle.verify.bind(subtle) };
    } catch (_) { return null; }
  }
  function captureDecoder() {
    try {
      var Decoder = root && root.TextDecoder;
      if (typeof Decoder !== 'function') return null;
      var decoder = new Decoder('utf-8', { fatal: true, ignoreBOM: true });
      return function (bytes) { return decoder.decode(bytes); };
    } catch (_) { return null; }
  }

  /* ---- input ----------------------------------------------------------------------------------------------- */
  function readInput(value) {
    try {
      if (typedTag && typedTag.call(value) === 'Uint8Array') return value;
      if (bufferLength) { bufferLength.call(value); return new Uint8Array(value); }
    } catch (_) { /* not bytes */ }
    return null;
  }
  function readOptions(value) {
    try {
      if (!isObject(value)) return null;
      var dictionary = value.tenderDictionaryVersionId, today = value.today;
      if (!isString(dictionary, 1, 120) || typeof today !== 'string') return null;
      var parts = dateParts(today);
      if (!parts || parts[0] < 2000 || parts[0] > 9000) return null;
      return { dictionary: dictionary, today: today, todayParts: parts };
    } catch (_) { return null; }
  }

  /* ---- manifest schema ------------------------------------------------------------------------------------ */
  function keyProblem(object, expected, field, report) {
    var names = Object.keys(object), unknown = false, forbidden = false;
    for (var i = 0; i < names.length; i += 1) {
      if (expected.indexOf(names[i]) < 0) { unknown = true; if (FORBIDDEN_FIELD.test(names[i])) forbidden = true; }
    }
    if (forbidden) return bad(C.FIELD_FORBIDDEN, field, report);
    if (unknown || names.length !== expected.length) return bad(C.SCHEMA_INVALID, field, report);
    return null;
  }
  function sumsProblem(sums, reportId, field) {
    if (!isObject(sums)) return bad(C.SCHEMA_INVALID, field, reportId);
    var measures = MEASURES[reportId], names = [], i;
    for (i = 0; i < measures.length; i += 1) names.push(measures[i].name);
    var problem = keyProblem(sums, names, field, reportId);
    if (problem) return problem;
    for (i = 0; i < measures.length; i += 1) {
      if (decimalUnits(sums[measures[i].name], measures[i].scale, LIMITS.SUM_DIGITS) === null) return bad(C.SCHEMA_INVALID, field, reportId);
    }
    return null;
  }
  function totalsProblem(totals, reportId) {
    var base = 'reports.' + reportId + '.engineTotals';
    if (!isObject(totals)) return bad(C.SCHEMA_INVALID, base, reportId);
    var problem = keyProblem(totals, TOTALS_KEYS, base, reportId);
    if (problem) return problem;
    problem = sumsProblem(totals.sums, reportId, base + '.sums');
    if (problem) return problem;
    if (!Array.isArray(totals.byDay) || totals.byDay.length > LIMITS.DAYS) return bad(C.SCHEMA_INVALID, base + '.byDay', reportId);
    var previous = '';
    for (var i = 0; i < totals.byDay.length; i += 1) {
      var day = totals.byDay[i];
      if (!isObject(day)) return bad(C.SCHEMA_INVALID, base + '.byDay', reportId);
      problem = keyProblem(day, DAY_KEYS, base + '.byDay', reportId);
      if (problem) return problem;
      if (typeof day.date !== 'string' || !DATE_SHAPE.test(day.date) || !isInt(day.rowCount, 0, LIMITS.ROWS_PER_REPORT) || day.date <= previous) return bad(C.SCHEMA_INVALID, base + '.byDay', reportId);
      previous = day.date;
      problem = sumsProblem(day.sums, reportId, base + '.byDay.sums');
      if (problem) return problem;
    }
    return null;
  }
  function figuresProblem(figures) {
    if (!Array.isArray(figures) || figures.length > LIMITS.FIGURES) return bad(C.SCHEMA_INVALID, 'engineFigures');
    for (var i = 0; i < figures.length; i += 1) {
      var figure = figures[i];
      if (!isObject(figure)) return bad(C.SCHEMA_INVALID, 'engineFigures');
      var problem = keyProblem(figure, FIGURE_KEYS, 'engineFigures');
      if (problem) return problem;
      if (!(figure.date === null || (typeof figure.date === 'string' && dateParts(figure.date) !== null)) ||
        typeof figure.figureId !== 'string' || !FIGURE_ID.test(figure.figureId) ||
        FIGURE_KINDS.indexOf(figure.kind) < 0 || REPORT_IDS.indexOf(figure.reportId) < 0 ||
        typeof figure.ruleRef !== 'string' || !RULE_REF.test(figure.ruleRef) ||
        typeof figure.value !== 'string' || !INT_TEXT.test(figure.value) || figure.value === '-0' || figure.value.length > LIMITS.SUM_DIGITS + 1 ||
        !Number.isSafeInteger(Number(figure.value))) return bad(C.SCHEMA_INVALID, 'engineFigures');
    }
    return null;
  }
  function schemaProblem(manifest, headerKeyId) {
    var problem = keyProblem(manifest, TOP_KEYS, 'manifest'), i, id;
    if (problem) return problem;
    var engine = manifest.engine, scope = manifest.scope, reports = manifest.reports;
    if (typeof manifest.createdAtUtc !== 'string' || !CREATED_AT.test(manifest.createdAtUtc) || !dateParts(manifest.createdAtUtc.substring(0, 10))) return bad(C.SCHEMA_INVALID, 'createdAtUtc');
    if (!isObject(engine)) return bad(C.SCHEMA_INVALID, 'engine');
    problem = keyProblem(engine, ENGINE_KEYS, 'engine');
    if (problem) return problem;
    if (typeof engine.migrationLevel !== 'string' || !/^\d{4}$/.test(engine.migrationLevel) || engine.product !== 'ETP-Reporting-Engine' ||
      typeof engine.version !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(engine.version)) return bad(C.SCHEMA_INVALID, 'engine');
    problem = figuresProblem(manifest.engineFigures);
    if (problem) return problem;
    if (!isInt(manifest.engineGeneration, 1, 99999)) return bad(C.SCHEMA_INVALID, 'engineGeneration');
    if (typeof manifest.exportId !== 'string' || !HEX32.test(manifest.exportId)) return bad(C.SCHEMA_INVALID, 'exportId');
    if (!isString(manifest.exportedByRole, 1, 40)) return bad(C.SCHEMA_INVALID, 'exportedByRole');
    if (typeof manifest.finalisedThrough !== 'string' || !DATE_SHAPE.test(manifest.finalisedThrough)) return bad(C.SCHEMA_INVALID, 'finalisedThrough');
    if (typeof manifest.keyId !== 'string' || !HEX16.test(manifest.keyId)) return bad(C.SCHEMA_INVALID, 'keyId');
    if (!isInt(manifest.paymentType25RowCount, 0, 9007199254740991)) return bad(C.SCHEMA_INVALID, 'paymentType25RowCount');
    if (!isObject(scope)) return bad(C.SCHEMA_INVALID, 'scope');
    problem = keyProblem(scope, SCOPE_KEYS, 'scope');
    if (problem) return problem;
    if (!isString(scope.storeCode, 1, 40) || typeof scope.financialYear !== 'string' || !FY_SHAPE.test(scope.financialYear) ||
      typeof scope.periodStart !== 'string' || !DATE_SHAPE.test(scope.periodStart) || typeof scope.periodEnd !== 'string' || !DATE_SHAPE.test(scope.periodEnd) ||
      !isString(scope.scopeKey, 1, 120)) return bad(C.SCHEMA_INVALID, 'scope');
    if (!(manifest.supersedesExportId === null || (typeof manifest.supersedesExportId === 'string' && HEX32.test(manifest.supersedesExportId)))) return bad(C.SCHEMA_INVALID, 'supersedesExportId');
    if (!isString(manifest.tenderDictionaryVersion, 1, 80)) return bad(C.SCHEMA_INVALID, 'tenderDictionaryVersion');
    if (!isObject(reports)) return bad(C.SCHEMA_INVALID, 'reports');
    problem = keyProblem(reports, REPORT_IDS, 'reports');
    if (problem) return problem;
    for (i = 0; i < REPORT_IDS.length; i += 1) {
      id = REPORT_IDS[i];
      var report = reports[id], base = 'reports.' + id;
      if (!isObject(report)) return bad(C.SCHEMA_INVALID, base, id);
      problem = keyProblem(report, REPORT_KEYS, base, id);
      if (problem) return problem;
      if (!isInt(report.bytes, 0, LIMITS.FILE_BYTES) || !isInt(report.rowCount, 0, 9007199254740991) || typeof report.sha256 !== 'string' || !HEX64.test(report.sha256) ||
        !isInt(report.sourceFileCount, 0, 13) || typeof report.sourceSetSha256 !== 'string' || !HEX64.test(report.sourceSetSha256) ||
        typeof report.zeroActivity !== 'boolean' || !Array.isArray(report.columns) || report.columns.length > 64) return bad(C.SCHEMA_INVALID, base, id);
      for (var c = 0; c < report.columns.length; c += 1) if (typeof report.columns[c] !== 'string') return bad(C.SCHEMA_INVALID, base + '.columns', id);
      problem = totalsProblem(report.engineTotals, id);
      if (problem) return problem;
    }
    for (i = 0; i < REPORT_IDS.length; i += 1) {
      if (reports[REPORT_IDS[i]].rowCount > LIMITS.ROWS_PER_REPORT) return bad(C.ROW_LIMIT_EXCEEDED, 'reports.' + REPORT_IDS[i] + '.rowCount', REPORT_IDS[i]);
    }
    if (manifest.keyId !== headerKeyId) return bad(C.KEY_ID_MISMATCH, 'keyId');
    for (i = 0; i < REPORT_IDS.length; i += 1) {
      id = REPORT_IDS[i];
      for (var d = 0; d < reports[id].columns.length; d += 1) if (FORBIDDEN_FIELD.test(reports[id].columns[d])) return bad(C.FIELD_FORBIDDEN, 'reports.' + id + '.columns', id);
    }
    for (i = 0; i < REPORT_IDS.length; i += 1) {
      if (!sameList(reports[REPORT_IDS[i]].columns, REPORT_COLUMNS[REPORT_IDS[i]])) return bad(C.COLUMNS_MISMATCH, 'reports.' + REPORT_IDS[i] + '.columns', REPORT_IDS[i]);
    }
    return null;
  }

  /* ---- policy: role, store, period, dictionary -------------------------------------------------------------- */
  function policyProblem(manifest, options) {
    var scope = manifest.scope;
    if (manifest.exportedByRole !== 'OWNER') return bad(C.EXPORT_ROLE_REFUSED, 'exportedByRole');
    if (scope.storeCode === 'HEMW') return bad(C.STORE_HEMW_BLOCKED, 'scope.storeCode');
    if (scope.storeCode !== 'WLMHW') return bad(C.STORE_REFUSED, 'scope.storeCode');
    var start = dateParts(scope.periodStart), end = dateParts(scope.periodEnd), finalised = dateParts(manifest.finalisedThrough);
    if (!start) return bad(C.PERIOD_INVALID, 'scope.periodStart');
    if (!end) return bad(C.PERIOD_INVALID, 'scope.periodEnd');
    if (!finalised) return bad(C.PERIOD_INVALID, 'finalisedThrough');
    if (scope.periodStart > scope.periodEnd) return bad(C.PERIOD_INVALID, 'scope.periodEnd');
    var yearTwo = FY_SHAPE.exec(scope.financialYear);
    if (Number(yearTwo[2]) !== (Number(yearTwo[1]) + 1) % 100) return bad(C.PERIOD_INVALID, 'scope.financialYear');
    if (financialYearOf(start) !== scope.financialYear || financialYearOf(end) !== scope.financialYear) return bad(C.PERIOD_INVALID, 'scope.financialYear');
    if (scope.periodStart < LIMITS.EARLIEST_PERIOD_START) return bad(C.PERIOD_INVALID, 'scope.periodStart');
    if (scope.periodEnd > isoOfDayNumber(dayNumber(options.todayParts) + LIMITS.FUTURE_DAYS)) return bad(C.PERIOD_INVALID, 'scope.periodEnd');
    if (dayNumber(end) - dayNumber(start) + 1 > LIMITS.DAYS) return bad(C.PERIOD_INVALID, 'scope.periodEnd');
    if (scope.scopeKey !== scope.storeCode + '|' + scope.financialYear + '|' + scope.periodStart + '..' + scope.periodEnd) return bad(C.PERIOD_INVALID, 'scope.scopeKey');
    var createdDate = manifest.createdAtUtc.substring(0, 10);
    if (createdDate < scope.periodEnd) return bad(C.PERIOD_INVALID, 'createdAtUtc');
    if (manifest.finalisedThrough > createdDate) return bad(C.PERIOD_INVALID, 'finalisedThrough');
    if (manifest.finalisedThrough < scope.periodEnd) return bad(C.PERIOD_INCOMPLETE, 'finalisedThrough');
    if (manifest.tenderDictionaryVersion !== options.dictionary) return bad(C.TENDER_DICTIONARY_MISMATCH, 'tenderDictionaryVersion');
    return null;
  }

  /* ---- rows ----------------------------------------------------------------------------------------------- */
  function cellText(literal) {
    if (literal === 'null') return null;
    if (literal.indexOf('\\') < 0) return literal.substring(1, literal.length - 1);
    return jsonParse(literal);
  }
  function emptyTotals(count) { var out = []; for (var i = 0; i < count; i += 1) out.push(0); return out; }
  /* Returns {rows, totals, days} or {problem}. Work is bounded by the manifest row count (at most 50,000). */
  function parseSection(data, start, end, reportId, report, scope, decode) {
    var layout = LAYOUT[reportId], names = layout.names, kinds = layout.kinds, measureIndex = layout.measureIndex, measures = layout.measures;
    var rows = [], totals = emptyTotals(measures.length), days = Object.create(null), position = start, lineNumber = 0;
    if (report.zeroActivity !== (report.rowCount === 0)) return { problem: bad(C.ROW_COUNT_MISMATCH, 'reports.' + reportId + '.zeroActivity', reportId) };
    while (position < end) {
      var stop = position;
      while (stop < end && data[stop] !== 10) stop += 1;
      lineNumber += 1;
      if (lineNumber > report.rowCount) return { problem: bad(C.ROW_COUNT_MISMATCH, 'reports.' + reportId + '.rowCount', reportId) };
      if (stop >= end || stop - position > LIMITS.LINE_BYTES) return { problem: failLine(reportId, lineNumber) };
      var text;
      try { text = decode(data.subarray(position, stop)); } catch (_) { return { problem: failLine(reportId, lineNumber) }; }
      var match = layout.line.exec(text);
      if (!match) return { problem: failLine(reportId, lineNumber) };
      var row = {}, deltas = null, date = '';
      for (var i = 0; i < names.length; i += 1) {
        var value;
        try { value = cellText(match[i + 1]); } catch (_) { return { problem: failLine(reportId, lineNumber, names[i]) }; }
        var kind = kinds[i], units = 0;
        if (kind === 'date') {
          if (typeof value !== 'string' || !dateParts(value)) return { problem: failLine(reportId, lineNumber, names[i]) };
          if (value < scope.periodStart || value > scope.periodEnd) return { problem: { code: C.ROW_OUT_OF_PERIOD, field: names[i], report: reportId, line: lineNumber } };
          date = value;
        } else if (kind === 'type') {
          if (value !== 'INV' && value !== 'SR' && value !== 'BC') return { problem: failLine(reportId, lineNumber, names[i]) };
        } else if (kind === 'text') {
          if (value !== null && (typeof value !== 'string' || value.length > LIMITS.CELL_CHARS || CONTROL.test(value))) return { problem: failLine(reportId, lineNumber, names[i]) };
        } else {
          units = decimalUnits(value, kind === 'm3' ? 3 : 2, LIMITS.ROW_DIGITS);
          if (units === null) return { problem: failLine(reportId, lineNumber, names[i]) };
          if (deltas === null) deltas = emptyTotals(measures.length);
          deltas[measureIndex[i]] = units;
        }
        row[names[i]] = value;
      }
      var day = days[date];
      if (day === undefined) { day = { rowCount: 0, sums: emptyTotals(measures.length) }; days[date] = day; }
      day.rowCount += 1;
      for (var m = 0; m < measures.length; m += 1) {
        totals[m] += deltas[m]; day.sums[m] += deltas[m];
        if (!Number.isSafeInteger(totals[m]) || !Number.isSafeInteger(day.sums[m])) return { problem: failLine(reportId, lineNumber, measures[m].name) };
      }
      rows.push(row);
      position = stop + 1;
    }
    if (lineNumber !== report.rowCount) return { problem: bad(C.ROW_COUNT_MISMATCH, 'reports.' + reportId + '.rowCount', reportId) };
    return { rows: rows, totals: totals, days: days };
  }
  function failLine(reportId, lineNumber, field) { return { code: C.ROW_INVALID, field: field, report: reportId, line: lineNumber }; }

  function totalsMismatch(report, reportId, parsed) {
    var measures = MEASURES[reportId], engine = report.engineTotals, i, j;
    for (i = 0; i < measures.length; i += 1) {
      if (decimalUnits(engine.sums[measures[i].name], measures[i].scale, LIMITS.SUM_DIGITS) !== parsed.totals[i]) return bad(C.TOTALS_MISMATCH, measures[i].name, reportId);
    }
    var dates = Object.keys(parsed.days).sort();
    if (dates.length !== engine.byDay.length) return bad(C.TOTALS_MISMATCH, 'DAY', reportId);
    for (i = 0; i < dates.length; i += 1) {
      var expected = engine.byDay[i], actual = parsed.days[dates[i]];
      if (expected.date !== dates[i] || expected.rowCount !== actual.rowCount) return bad(C.TOTALS_MISMATCH, 'DAY', reportId);
      for (j = 0; j < measures.length; j += 1) {
        if (decimalUnits(expected.sums[measures[j].name], measures[j].scale, LIMITS.SUM_DIGITS) !== actual.sums[j]) return bad(C.TOTALS_MISMATCH, 'DAY', reportId);
      }
    }
    return null;
  }
  function sumsText(reportId, units) {
    var measures = MEASURES[reportId], out = {};
    for (var i = 0; i < measures.length; i += 1) out[measures[i].name] = formatUnits(units[i], measures[i].scale);
    return Object.freeze(out);
  }

  /* ---- the verifier ---------------------------------------------------------------------------------------- */
  function build(anchor, cryptoSource) {
    var subtle = captureCrypto(cryptoSource), decode = captureDecoder();
    var domainBytes = asciiBytes(SIGN_DOMAIN);

    function fail(code, check, problem) {
      var out = { ok: false, code: code, stage: 'BRIDGE_VERIFY', check: check, message: MESSAGES[code] };
      if (problem && typeof problem.report === 'string') out.report = problem.report;
      if (problem && typeof problem.field === 'string') out.field = problem.field;
      if (problem && typeof problem.line === 'number') out.line = problem.line;
      return Object.freeze(out);
    }
    function failProblem(problem, check) { return fail(problem.code, check, problem); }

    function gate() {
      var open = anchor.state === 'KEYS';
      return Object.freeze({ id: GATE_ID, open: open, state: open ? 'OPEN' : 'CLOSED',
        code: open ? null : (anchor.state === 'INVALID' ? C.TRUST_ANCHOR_INVALID : C.TRUST_GATE_CLOSED) });
    }

    async function prepareKeys() {
      var prepared = [];
      for (var i = 0; i < anchor.keys.length; i += 1) {
        var point = hexToBytes(anchor.keys[i].publicKeyHex), digest;
        try { digest = new Uint8Array(await subtle.digest('SHA-256', point)); } catch (_) { return { failure: fail(C.CRYPTO_FAILED, 'GATE') }; }
        if (hex(digest.subarray(0, 8)) !== anchor.keys[i].keyId) return { failure: fail(C.TRUST_ANCHOR_INVALID, 'GATE') };
        var key;
        try { key = await subtle.importKey('raw', point, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); } catch (_) { return { failure: fail(C.TRUST_ANCHOR_INVALID, 'GATE') }; }
        prepared.push({ keyId: anchor.keys[i].keyId, key: key });
      }
      return { keys: prepared };
    }
    async function digestHex(bytes) { return hex(new Uint8Array(await subtle.digest('SHA-256', bytes))); }

    async function run(input, rawOptions) {
      /* 0 GATE: first, before any digest, import, parse or read of the input. */
      if (anchor.state === 'ABSENT') return fail(C.TRUST_GATE_CLOSED, 'GATE');
      if (anchor.state !== 'KEYS') return fail(C.TRUST_ANCHOR_INVALID, 'GATE');
      /* 1 ENV */
      if (!subtle || !decode) return fail(C.CRYPTO_UNAVAILABLE, 'ENV');
      /* The bytes are copied here, before the first await, so the caller cannot change them while the checks run.
         A file over the limit is never copied. The refusals for input and size follow the trust-list check. */
      var view = readInput(input), options = readOptions(rawOptions), length = 0, data = null;
      if (view && options) {
        length = typedLength ? typedLength.call(view) : view.length;
        if (length <= LIMITS.FILE_BYTES) { data = new Uint8Array(length); data.set(view); }
      }
      /* The key ids of the trusted list are recomputed from their points (a list that fails keeps the gate closed). */
      var prepared = await prepareKeys();
      if (prepared.failure) return prepared.failure;
      /* 2 INPUT and 3 SIZE */
      if (!view || !options) return fail(C.INPUT_INVALID, 'INPUT');
      if (length > LIMITS.FILE_BYTES) return fail(C.FILE_TOO_LARGE, 'SIZE');
      if (length < LIMITS.MIN_FILE_BYTES) return fail(C.FRAME_INVALID, 'SIZE');
      /* 4 FRAME: structure only, nothing is decoded. */
      var i;
      for (i = 0; i < MAGIC.length; i += 1) if (data[i] !== MAGIC.charCodeAt(i)) return fail(C.MAGIC_INVALID, 'FRAME');
      if (data[16] !== FRAME.SIG_ALG_ECDSA_P256_SHA256) return fail(C.SIGNATURE_ALGORITHM_UNSUPPORTED, 'FRAME');
      var manifestLength = u32(data, 81), manifestStart = 85, manifestEnd = manifestStart + manifestLength;
      if (manifestLength < 1 || manifestLength > LIMITS.MANIFEST_BYTES || manifestEnd > length) return fail(C.FRAME_INVALID, 'FRAME');
      var sections = [], position = manifestEnd;
      for (i = 0; i < REPORT_IDS.length; i += 1) {
        if (position + 4 > length) return fail(C.FRAME_INVALID, 'FRAME');
        var sectionLength = u32(data, position), sectionStart = position + 4;
        if (sectionStart + sectionLength > length) return fail(C.FRAME_INVALID, 'FRAME');
        sections.push([sectionStart, sectionStart + sectionLength]);
        position = sectionStart + sectionLength;
      }
      if (position !== length) return fail(C.FRAME_INVALID, 'FRAME');
      /* 5 KEY */
      var headerKeyId = hex(data.subarray(8, 16)), trusted = null;
      for (i = 0; i < prepared.keys.length; i += 1) if (prepared.keys[i].keyId === headerKeyId) trusted = prepared.keys[i];
      if (!trusted) return fail(C.KEY_UNKNOWN, 'KEY');
      /* 6 SIGNATURE over the domain prefix and the exact manifest bytes. */
      var manifestBytes = data.subarray(manifestStart, manifestEnd), signed = new Uint8Array(domainBytes.length + manifestLength);
      signed.set(domainBytes, 0); signed.set(manifestBytes, domainBytes.length);
      var verified;
      try { verified = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, trusted.key, new Uint8Array(data.subarray(17, 81)), signed); } catch (_) { return fail(C.CRYPTO_FAILED, 'SIGNATURE'); }
      if (verified !== true) return fail(C.SIGNATURE_INVALID, 'SIGNATURE');
      /* From here the manifest is authenticated and may be parsed. */
      var manifestSha256;
      try { manifestSha256 = await digestHex(manifestBytes); } catch (_) { return fail(C.CRYPTO_FAILED, 'MANIFEST'); }
      /* 7 MANIFEST */
      var text = asciiText(manifestBytes);
      if (text === null || textDepth(text) > LIMITS.DEPTH) return fail(C.MANIFEST_INVALID, 'MANIFEST');
      var manifest;
      try { manifest = jsonParse(text); } catch (_) { return fail(C.MANIFEST_INVALID, 'MANIFEST'); }
      if (!isObject(manifest) || canonOrNull(manifest) !== text) return fail(C.MANIFEST_INVALID, 'MANIFEST');
      /* 8 VERSION */
      if (!hasOwn.call(manifest, 'contract') || manifest.contract !== CONTRACT) return fail(C.CONTRACT_UNSUPPORTED, 'VERSION');
      if (!hasOwn.call(manifest, 'schemaVersion') || manifest.schemaVersion !== 1) return fail(C.VERSION_UNSUPPORTED, 'VERSION');
      /* 9 SCHEMA and 10 POLICY */
      var problem = schemaProblem(manifest, headerKeyId);
      if (problem) return failProblem(problem, 'SCHEMA');
      problem = policyProblem(manifest, options);
      if (problem) return failProblem(problem, 'POLICY');
      /* 11 HASH */
      var reports = manifest.reports;
      for (i = 0; i < REPORT_IDS.length; i += 1) {
        var section = data.subarray(sections[i][0], sections[i][1]);
        if (section.length !== reports[REPORT_IDS[i]].bytes) return fail(C.HASH_MISMATCH, 'HASH', { report: REPORT_IDS[i], field: 'bytes' });
        var sectionHash;
        try { sectionHash = await digestHex(section); } catch (_) { return fail(C.CRYPTO_FAILED, 'HASH'); }
        if (sectionHash !== reports[REPORT_IDS[i]].sha256) return fail(C.HASH_MISMATCH, 'HASH', { report: REPORT_IDS[i], field: 'sha256' });
      }
      /* 12 ROWS */
      var parsed = {};
      for (i = 0; i < REPORT_IDS.length; i += 1) {
        var result = parseSection(data, sections[i][0], sections[i][1], REPORT_IDS[i], reports[REPORT_IDS[i]], manifest.scope, decode);
        if (result.problem) return failProblem(result.problem, 'ROWS');
        parsed[REPORT_IDS[i]] = result;
        await Promise.resolve();
      }
      /* 13 TOTALS: zero tolerance. */
      for (i = 0; i < REPORT_IDS.length; i += 1) {
        problem = totalsMismatch(reports[REPORT_IDS[i]], REPORT_IDS[i], parsed[REPORT_IDS[i]]);
        if (problem) return failProblem(problem, 'TOTALS');
      }
      var packSha256;
      try { packSha256 = await digestHex(data); } catch (_) { return fail(C.CRYPTO_FAILED, 'DONE'); }
      /* 14 DONE */
      var outReports = {};
      for (i = 0; i < REPORT_IDS.length; i += 1) {
        var id = REPORT_IDS[i], source = reports[id], keep = parsed[id], dates = Object.keys(keep.days).sort(), byDay = [];
        for (var d = 0; d < dates.length; d += 1) {
          byDay.push(Object.freeze({ date: dates[d], rowCount: keep.days[dates[d]].rowCount, sums: sumsText(id, keep.days[dates[d]].sums) }));
        }
        outReports[id] = Object.freeze({ columns: REPORT_COLUMNS[id], rowCount: source.rowCount, rows: Object.freeze(keep.rows), sums: sumsText(id, keep.totals),
          byDay: Object.freeze(byDay), sourceFileCount: source.sourceFileCount, sourceSetSha256: source.sourceSetSha256, zeroActivity: source.zeroActivity });
      }
      var figures = [];
      for (i = 0; i < manifest.engineFigures.length; i += 1) {
        var figure = manifest.engineFigures[i];
        figures.push(Object.freeze({ date: figure.date, figureId: figure.figureId, kind: figure.kind, reportId: figure.reportId, ruleRef: figure.ruleRef, value: figure.value }));
      }
      var scope = manifest.scope;
      return Object.freeze({
        ok: true, stage: 'BRIDGE_VERIFIED', contract: CONTRACT, keyId: headerKeyId, exportId: manifest.exportId, engineVersion: manifest.engine.version,
        engineGeneration: manifest.engineGeneration, supersedesExportId: manifest.supersedesExportId, createdAtUtc: manifest.createdAtUtc,
        finalisedThrough: manifest.finalisedThrough, tenderDictionaryVersion: manifest.tenderDictionaryVersion,
        scope: Object.freeze({ storeCode: scope.storeCode, financialYear: scope.financialYear, periodStart: scope.periodStart, periodEnd: scope.periodEnd, scopeKey: scope.scopeKey }),
        manifestSha256: manifestSha256, packSha256: packSha256, reports: Object.freeze(outReports), paymentType25RowCount: manifest.paymentType25RowCount,
        engineFigures: Object.freeze(figures), warnings: Object.freeze([])
      });
    }

    /* The only inputs are the bytes and {tenderDictionaryVersionId, today}. Any other option, including
       a crypto, trust or key option, is never read. */
    function verify(bytes, options) {
      try {
        return run(bytes, options).then(function (result) { return result; }, function () { return fail(C.INTERNAL_ERROR, 'INTERNAL'); });
      } catch (_) { return Promise.resolve(fail(C.INTERNAL_ERROR, 'INTERNAL')); }
    }
    return Object.freeze({ VERSION: PACK_VERSION, CONTRACT: CONTRACT, GATE_ID: GATE_ID, CODES: CODES, MESSAGES: MESSAGES, gate: gate, verify: verify });
  }

  /* Node only: the single place where a trust list can be supplied. */
  function create(options) {
    var supplied;
    try { supplied = options && typeof options === 'object' ? options.trustedKeys : undefined; } catch (_) { supplied = {}; }
    var cryptoSource;
    try { cryptoSource = options && typeof options === 'object' && options.crypto !== undefined ? options.crypto : (root && root.crypto); } catch (_) { cryptoSource = null; }
    return build(classifyAnchor(supplied), cryptoSource);
  }
  async function keyIdOf(point, cryptoSource) {
    var api = captureCrypto(cryptoSource !== undefined ? cryptoSource : (root && root.crypto));
    if (!api) throw new TypeError('ETP_BRIDGE_CRYPTO_UNAVAILABLE');
    return hex(new Uint8Array(await api.digest('SHA-256', point)).subarray(0, 8));
  }

  var cjs = Object.freeze({
    create: create, keyIdOf: keyIdOf, canon: canon, decimalUnits: decimalUnits, formatUnits: formatUnits,
    VERSION: PACK_VERSION, CONTRACT: CONTRACT, GATE_ID: GATE_ID, SIGN_DOMAIN: SIGN_DOMAIN, FRAME: FRAME, LIMITS: LIMITS,
    REPORT_IDS: REPORT_IDS, REPORT_COLUMNS: REPORT_COLUMNS, MEASURES: MEASURES, CODES: CODES, MESSAGES: MESSAGES,
    FORBIDDEN_FIELD: FORBIDDEN_FIELD, TOP_KEYS: Object.freeze(TOP_KEYS.slice())
  });
  return { cjs: cjs, instance: function () { return build(readTrustGlobal(root), root && root.crypto); } };
});
