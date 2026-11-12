/* ETP report-engine bridge: compare mode (pure: no DOM, no storage, no network, no timers, no calculation output).
   It compares a VERIFIED engine pack with the rows of the published four-report XLSX import, report by report and day by day.
   Rows are matched as a multiset inside a key: (date, invoice, type) for R013, R022 and R025 and (date, type) for R003,
   because today's columns carry no item number and R003 carries no invoice number. A MATCH therefore proves sums and
   per-invoice sums, not one-to-one line equality. Money is compared in exact paise and quantity in exact thousandths with zero tolerance.
   Engine figures (rule-based, such as the invoice count) are reported beside the result and are never applied to anything.
   Owner decisions given in chat, 2026-11-12: Q2 (not yet granted), Q3 (the engine's figure counts for business-rule differences later;
   this wave changes no calculation), Q6 (four reports, today's columns). Nothing here publishes a generation. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; return; }
  if (!root) return;
  /* Defined once and never replaced: an existing property with this name is left alone, never trusted. */
  if (Object.prototype.hasOwnProperty.call(root, 'SaagarEtpBridgeCompare')) return;
  try {
    Object.defineProperty(root, 'SaagarEtpBridgeCompare', { value: api, writable: false, configurable: false, enumerable: true });
  } catch (_) { /* absent: the facade treats the bridge as unavailable */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COMPARE_VERSION = 1;
  var CONTRACT = 'ETP_BRIDGE_COMPARE_V1';
  var COMPARE_STORE = 'WLMHW';
  var MAX_ROWS = 50000;
  var MAX_DAYS_LISTED = 62;
  var MAX_FIGURES = 32;
  var SEP = '\u001f';
  var REPORT_IDS = Object.freeze(['R003', 'R013', 'R022', 'R025']);
  var hasOwn = Object.prototype.hasOwnProperty;

  /* ---- codes (every code matches ^ETP_[A-Z0-9_]{1,80}$) ----------------------------------------------------- */
  var CODE_NAMES = ['INPUT_INVALID', 'PACK_NOT_VERIFIED', 'STORE_REFUSED', 'SCOPE_MISMATCH', 'NO_TABLET_GENERATION', 'TABLET_READ_INCOMPLETE',
    'REPORT_MISSING', 'ROW_LIMIT_EXCEEDED', 'ROW_SHAPE_INVALID', 'ROW_VALUE_UNPARSEABLE', 'TXN_TYPE_UNKNOWN', 'TABLET_COUNT_MISMATCH',
    'AGGREGATE_OVERFLOW', 'PACK_TOTALS_INCONSISTENT', 'PAIRING_AMBIGUOUS', 'LEADING_ZERO_KEY_SUSPECT', 'SIGN_CONVENTION_SUSPECT', 'DAYS_TRUNCATED'];
  var C = {};
  var CODES = (function () {
    var list = [];
    for (var i = 0; i < CODE_NAMES.length; i += 1) { C[CODE_NAMES[i]] = 'ETP_BRIDGE_COMPARE_' + CODE_NAMES[i]; list.push(C[CODE_NAMES[i]]); }
    return Object.freeze(list);
  })();
  Object.freeze(C);
  /* Informational codes never change a status or the outcome. */
  var INFORMATIONAL = Object.freeze([C.PAIRING_AMBIGUOUS, C.LEADING_ZERO_KEY_SUSPECT, C.SIGN_CONVENTION_SUSPECT, C.DAYS_TRUNCATED]);

  /* ---- column table: the tablet's analytics projections (etp-module-gateway.js) ---------------------------------- */
  /* kinds: date, txn, id (exact text), text (trimmed text), m2 (money, 2 places), m3 (quantity, 3 places). A 1 marks a required value. */
  var SPEC = {
    R003: [['invoice_date', 'date'], ['transaction_type_raw', 'txn'], ['net_amount', 'm2', 1], ['scheme_discount', 'm2'], ['user_discount', 'm2']],
    R013: [['invoice_date', 'date'], ['invoice_number', 'id'], ['transaction_type_raw', 'txn'], ['quantity', 'm3', 1], ['net_amount', 'm2', 1], ['cro_number', 'text']],
    R022: [['invoice_date', 'date'], ['invoice_number', 'id'], ['transaction_type_raw', 'txn'], ['invoice_quantity', 'm3', 1], ['net_value', 'm2', 1],
      ['cash_amount', 'm2'], ['card_amount', 'm2'], ['bhim_upi_amount', 'm2'], ['phonepe_amount', 'm2'], ['paytm_amount', 'm2'], ['razorpay_amount', 'm2'],
      ['bharatpe_amount', 'm2'], ['cheque_amount', 'm2'], ['others_amount', 'm2'], ['payment_type24_amount', 'm2']],
    R025: [['invoice_date', 'date'], ['invoice_number', 'id'], ['transaction_type_raw', 'txn'], ['quantity', 'm3', 1], ['net_amount', 'm2', 1], ['brand', 'text'],
      ['cluster', 'text'], ['gender', 'text'], ['scheme_discount', 'm2'], ['user_discount', 'm2'], ['tax_amount', 'm2']]
  };
  var LAYOUT = {}, COLUMNS = {}, MEASURES = {};
  (function () {
    for (var r = 0; r < REPORT_IDS.length; r += 1) {
      var id = REPORT_IDS[r], list = SPEC[id], names = [], kinds = [], required = [], keyIndex = [], measures = [], measureOf = [], invoiceIndex = -1, typeIndex = -1;
      for (var i = 0; i < list.length; i += 1) {
        names.push(list[i][0]); kinds.push(list[i][1]); required.push(list[i][2] === 1);
        if (list[i][1] === 'date' || list[i][1] === 'txn' || list[i][1] === 'id') keyIndex.push(i);
        if (list[i][1] === 'id') invoiceIndex = i;
        if (list[i][1] === 'txn') typeIndex = i;
        if (list[i][1] === 'm2' || list[i][1] === 'm3') { measureOf.push(measures.length); measures.push(Object.freeze({ name: list[i][0], scale: list[i][1] === 'm3' ? 3 : 2 })); } else measureOf.push(-1);
      }
      COLUMNS[id] = Object.freeze(names);
      MEASURES[id] = Object.freeze(measures);
      LAYOUT[id] = { names: names, kinds: kinds, required: required, keyIndex: keyIndex, measures: measures, measureOf: measureOf, invoiceIndex: invoiceIndex, typeIndex: typeIndex };
    }
    Object.freeze(COLUMNS); Object.freeze(MEASURES);
  })();

  /* Closed table of comparable engine figures (data, not logic). R022.INVOICE_COUNT is a PROPOSED derivation that
     still has to be checked against ETP decision 41: distinct invoice numbers among R022 sale (INV) rows. */
  var FIGURES = Object.freeze({
    'R022.INVOICE_COUNT': Object.freeze({ reportId: 'R022', kind: 'COUNT', status: 'PROPOSED' })
  });
  var LABEL_RULE_DIFFERENCE = 'business-rule difference';

  /* ---- small helpers ------------------------------------------------------------------------------------------ */
  var DECIMAL = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
  var DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var HEX16 = /^[0-9a-f]{16}$/, HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/;
  var GENERATION = /^etp_[a-f0-9]{32}$/;
  var INT_TEXT = /^-?(0|[1-9][0-9]*)$/;
  var FIGURE_ID = /^[A-Z0-9][A-Z0-9_.]{0,47}$/, RULE_REF = /^[A-Za-z0-9._:-]{1,64}$/;
  var TXN_LOWER = Object.freeze({ inv: 'INV', sr: 'SR', bc: 'BC' });
  var SIGN = Object.freeze({ INV: 1, SR: -1, BC: -1 });

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isIntBetween(value, min, max) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
  function zeros(count) { var out = ''; while (out.length < count) out += '0'; return out.substring(0, count); }
  function zeroList(count) { var out = []; for (var i = 0; i < count; i += 1) out.push(0); return out; }
  function uniqueSorted(list) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < list.length; i += 1) if (!seen[list[i]]) { seen[list[i]] = true; out.push(list[i]); }
    return out.sort();
  }
  function realDate(text) {
    var match = DATE_SHAPE.exec(text);
    if (!match) return false;
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return month >= 1 && month <= 12 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      var names = Object.keys(value);
      for (var i = 0; i < names.length; i += 1) deepFreeze(value[names[i]]);
    }
    return value;
  }
  function formatUnits(units, scale) {
    var negative = units < 0, digits = String(negative ? -units : units);
    while (digits.length <= scale) digits = '0' + digits;
    return (negative ? '-' : '') + digits.substring(0, digits.length - scale) + '.' + digits.substring(digits.length - scale);
  }
  function addSafe(list, index, delta) {
    var next = list[index] + delta;
    if (!Number.isSafeInteger(next)) return false;
    list[index] = next;
    return true;
  }
  function escapeText(text) { return text.replace(/\\/g, '\\\\').replace(/\u001f/g, '\\u'); }

  /* Exact decimal text to integer units. Returns null when the cell cannot be read. A non-zero digit beyond the
     scale is never rounded. Exponent notation is shifted by exact string arithmetic (magnitude at most 30). */
  function parseUnits(value, scale, optional, norm) {
    var text;
    if (value === null || value === undefined) text = '';
    else if (typeof value === 'number') { if (!isFinite(value)) return null; text = String(value); }
    else if (typeof value === 'string') text = value.trim();
    else return null;
    if (text === '') { if (optional) { norm.blankAsZero += 1; return 0; } return null; }
    var match = DECIMAL.exec(text);
    if (!match) return null;
    var whole = match[2], fraction = match[3] || '', exponent = 0;
    if (match[4] !== undefined) {
      exponent = parseInt(match[4], 10);
      if (!isFinite(exponent) || Math.abs(exponent) > 30) return null;
      norm.exponentExpanded += 1;
    }
    var digits = whole + fraction, point = whole.length + exponent;
    if (point < 0) { digits = zeros(-point) + digits; point = 0; }
    if (point > digits.length) digits += zeros(point - digits.length);
    var integerPart = digits.substring(0, point), fractionPart = digits.substring(point);
    if (fractionPart.length > scale) {
      if (/[1-9]/.test(fractionPart.substring(scale))) return null;
      fractionPart = fractionPart.substring(0, scale);
      norm.trailingZerosTrimmed += 1;
    } else fractionPart += zeros(scale - fractionPart.length);
    var all = (integerPart + fractionPart).replace(/^0+(?=.)/, '');
    if (all.length > 16) return null;
    var units = Number(all);
    if (!Number.isSafeInteger(units)) return null;
    return match[1] === '-' && units !== 0 ? -units : units;
  }

  /* ---- ingest one side of one report --------------------------------------------------------------------------- */
  function emptyNorm() { return { blankAsZero: 0, exponentExpanded: 0, trailingZerosTrimmed: 0, caseFolded: 0 }; }
  function ingest(layout, rows, trackInvoices) {
    var names = layout.names, kinds = layout.kinds, measureCount = layout.measures.length;
    var out = { groups: Object.create(null), rowCount: 0, shape: 0, value: 0, txn: 0, overflow: false, signed: zeroList(measureCount), plain: zeroList(measureCount),
      days: Object.create(null), norm: emptyNorm(), invoicesByDay: Object.create(null), invoices: Object.create(null) };
    for (var r = 0; r < rows.length; r += 1) {
      var row = rows[r];
      if (!isObject(row)) { out.shape += 1; continue; }
      var keys = Object.keys(row), shapeOk = keys.length === names.length, i;
      var raw = [];
      if (shapeOk) {
        for (i = 0; i < names.length; i += 1) {
          if (!hasOwn.call(row, names[i])) { shapeOk = false; break; }
          var cell = row[names[i]];
          if (!(cell === null || typeof cell === 'string' || (typeof cell === 'number' && isFinite(cell)))) { shapeOk = false; break; }
          raw.push(cell);
        }
      }
      if (!shapeOk) { out.shape += 1; continue; }
      var values = [], units = [], sign = 0, date = '', invoice = '', problem = '';
      var rowNorm = emptyNorm();
      for (i = 0; i < names.length && problem === ''; i += 1) {
        var kind = kinds[i], cellValue = raw[i];
        if (kind === 'date') {
          var dateText = typeof cellValue === 'string' ? cellValue.trim() : '';
          if (!realDate(dateText)) problem = 'value'; else { date = dateText; values.push(dateText); }
        } else if (kind === 'txn') {
          var type = typeof cellValue === 'string' ? cellValue : '';
          if (type === 'INV' || type === 'SR' || type === 'BC') { sign = SIGN[type]; values.push(type); }
          else if (hasOwn.call(TXN_LOWER, type)) { type = TXN_LOWER[type]; rowNorm.caseFolded += 1; sign = SIGN[type]; values.push(type); }
          else problem = 'txn';
        } else if (kind === 'id' || kind === 'text') {
          var text = cellValue === null ? '' : String(cellValue).trim();
          if (kind === 'id') invoice = text;
          values.push(escapeText(text));
        } else {
          var parsed = parseUnits(cellValue, kind === 'm3' ? 3 : 2, !layout.required[i], rowNorm);
          if (parsed === null) problem = 'value'; else { units.push(parsed); values.push(String(parsed)); }
        }
      }
      if (problem === 'value') { out.value += 1; continue; }
      if (problem === 'txn') { out.txn += 1; continue; }
      var day = out.days[date];
      if (day === undefined) { day = { rowCount: 0, sums: zeroList(measureCount) }; out.days[date] = day; }
      var fine = true;
      for (i = 0; i < measureCount; i += 1) {
        if (!addSafe(out.signed, i, sign * units[i]) || !addSafe(out.plain, i, units[i]) || !addSafe(day.sums, i, sign * units[i])) { fine = false; break; }
      }
      if (!fine) { out.overflow = true; continue; }
      day.rowCount += 1; out.rowCount += 1;
      out.norm.blankAsZero += rowNorm.blankAsZero; out.norm.exponentExpanded += rowNorm.exponentExpanded;
      out.norm.trailingZerosTrimmed += rowNorm.trailingZerosTrimmed; out.norm.caseFolded += rowNorm.caseFolded;
      var keyParts = [];
      for (i = 0; i < layout.keyIndex.length; i += 1) keyParts.push(values[layout.keyIndex[i]]);
      var key = keyParts.join(SEP), tuple = values.join(SEP);
      var group = out.groups[key];
      if (group === undefined) { group = Object.create(null); out.groups[key] = group; }
      group[tuple] = (group[tuple] || 0) + 1;
      if (trackInvoices && sign === 1 && invoice !== '') {
        if (out.invoicesByDay[date] === undefined) out.invoicesByDay[date] = Object.create(null);
        out.invoicesByDay[date][invoice] = true; out.invoices[invoice] = true;
      }
    }
    return out;
  }
  function problemRows(side) { return side.shape + side.value + side.txn; }

  /* ---- matching ------------------------------------------------------------------------------------------------ */
  function stripZeros(text) { return text.replace(/^0+(?=.)/, ''); }
  function matchGroups(layout, tablet, pack, sampleLimit, sampleSink) {
    var names = layout.names, kinds = layout.kinds, keyed = Object.create(null), i, j;
    for (i = 0; i < layout.keyIndex.length; i += 1) keyed[layout.keyIndex[i]] = true;
    var allKeys = Object.create(null), key;
    for (key in tablet.groups) allKeys[key] = true;
    for (key in pack.groups) allKeys[key] = true;
    var sortedKeys = Object.keys(allKeys).sort();
    var stats = { matched: 0, differing: 0, onlyTablet: 0, onlyPack: 0, ambiguousGroups: 0, signSuspect: 0, leadingZeroSuspect: 0, overflow: false };
    var columns = Object.create(null);
    for (i = 0; i < names.length; i += 1) if (!keyed[i]) columns[names[i]] = { rows: 0, deltaUnits: kinds[i] === 'm2' || kinds[i] === 'm3' ? 0 : null };
    var tabletOnlyKeys = [], packOnlyKeys = [], sampled = 0;
    function sample(kind, tupleText, difference) {
      if (sampled >= sampleLimit) return;
      sampled += 1;
      var parts = tupleText.split(SEP), keyView = {};
      for (var k = 0; k < layout.keyIndex.length; k += 1) keyView[names[layout.keyIndex[k]]] = parts[layout.keyIndex[k]];
      sampleSink.push({ kind: kind, key: keyView, columns: difference || [] });
    }
    for (var n = 0; n < sortedKeys.length; n += 1) {
      key = sortedKeys[n];
      var left = tablet.groups[key] || Object.create(null), right = pack.groups[key] || Object.create(null);
      var leftover = [], rightover = [], tuple, count, other, shared;
      for (tuple in left) {
        count = left[tuple]; other = right[tuple] || 0; shared = count < other ? count : other;
        stats.matched += shared;
        for (j = shared; j < count; j += 1) leftover.push(tuple);
      }
      for (tuple in right) {
        count = right[tuple]; other = left[tuple] || 0; shared = count < other ? count : other;
        for (j = shared; j < count; j += 1) rightover.push(tuple);
      }
      if (leftover.length === 0 && rightover.length === 0) continue;
      leftover.sort(); rightover.sort();
      if (leftover.length > 1 || rightover.length > 1) stats.ambiguousGroups += 1;
      if (tablet.groups[key] === undefined) packOnlyKeys.push(key);
      else if (pack.groups[key] === undefined) tabletOnlyKeys.push(key);
      var pairs = leftover.length < rightover.length ? leftover.length : rightover.length;
      for (j = 0; j < pairs; j += 1) {
        stats.differing += 1;
        var a = leftover[j].split(SEP), b = rightover[j].split(SEP), differs = [], allMeasures = true, allNegated = true;
        for (i = 0; i < names.length; i += 1) {
          if (keyed[i] || a[i] === b[i]) continue;
          columns[names[i]].rows += 1;
          differs.push({ column: names[i], tablet: a[i], pack: b[i] });
          if (kinds[i] === 'm2' || kinds[i] === 'm3') {
            var delta = Number(b[i]) - Number(a[i]);
            var next = columns[names[i]].deltaUnits + delta;
            if (!Number.isSafeInteger(next)) stats.overflow = true; else columns[names[i]].deltaUnits = next;
            if (!(Number(b[i]) === -Number(a[i]) && Number(a[i]) !== 0)) allNegated = false;
          } else { allMeasures = false; allNegated = false; }
        }
        var type = layout.typeIndex >= 0 ? a[layout.typeIndex] : '';
        if (differs.length > 0 && allMeasures && allNegated && (type === 'SR' || type === 'BC')) stats.signSuspect += 1;
        sample('VALUE_DIFFERENCE', leftover[j], differs);
      }
      for (j = pairs; j < leftover.length; j += 1) { stats.onlyTablet += 1; sample('ONLY_TABLET', leftover[j]); }
      for (j = pairs; j < rightover.length; j += 1) { stats.onlyPack += 1; sample('ONLY_PACK', rightover[j]); }
    }
    if (layout.invoiceIndex >= 0 && tabletOnlyKeys.length > 0 && packOnlyKeys.length > 0) {
      var strippedPack = Object.create(null), at = layout.keyIndex.indexOf(layout.invoiceIndex);
      var transform = function (text) { var parts = text.split(SEP); parts[at] = stripZeros(parts[at]); return parts.join(SEP); };
      for (i = 0; i < packOnlyKeys.length; i += 1) strippedPack[transform(packOnlyKeys[i])] = packOnlyKeys[i];
      for (i = 0; i < tabletOnlyKeys.length; i += 1) {
        var twin = strippedPack[transform(tabletOnlyKeys[i])];
        if (twin !== undefined && twin !== tabletOnlyKeys[i]) stats.leadingZeroSuspect += 1;
      }
    }
    return { stats: stats, columns: columns };
  }

  /* ---- one report ----------------------------------------------------------------------------------------------- */
  function blankReport(status, reasons, tabletRows, packRows) {
    return { status: status, reasonCodes: uniqueSorted(reasons), flags: [],
      rows: { tablet: tabletRows, pack: packRows, matched: 0, differing: 0, onlyTablet: 0, onlyPack: 0, ambiguousGroups: 0 },
      shapeErrors: { tablet: 0, pack: 0 }, unparseableRows: { tablet: 0, pack: 0 }, columns: {}, totals: null, daysDiffering: 0, days: [],
      normalisations: emptyNorm() };
  }
  function sumsObject(layout, list) {
    var out = {};
    for (var i = 0; i < layout.measures.length; i += 1) out[layout.measures[i].name] = list[i];
    return out;
  }
  function packTotalsProblem(layout, side, totals, packRowCount) {
    if (!isObject(totals) || !isObject(totals.sums) || !isIntBetween(totals.rowCount, 0, MAX_ROWS) || totals.rowCount !== packRowCount) return true;
    var names = Object.keys(totals.sums);
    if (names.length !== layout.measures.length) return true;
    var scratch = emptyNorm();
    for (var i = 0; i < layout.measures.length; i += 1) {
      var measure = layout.measures[i];
      if (!hasOwn.call(totals.sums, measure.name)) return true;
      var declared = totals.sums[measure.name];
      if (typeof declared !== 'string') return true;
      var units = parseUnits(declared, measure.scale, false, scratch);
      if (units === null || units !== side.plain[i]) return true;
    }
    return false;
  }
  function compareReport(id, tabletRows, packRows, packTotals, expectedCount, sampleLimit, sampleSink) {
    var layout = LAYOUT[id], reasons = [];
    if (!Array.isArray(tabletRows) || !Array.isArray(packRows)) return { report: blankReport('CANNOT_COMPARE', [C.REPORT_MISSING], 0, 0) };
    if (tabletRows.length > MAX_ROWS || packRows.length > MAX_ROWS) return { report: blankReport('CANNOT_COMPARE', [C.ROW_LIMIT_EXCEEDED], tabletRows.length, packRows.length) };
    if (expectedCount !== undefined && expectedCount !== tabletRows.length) reasons.push(C.TABLET_COUNT_MISMATCH);
    var tablet = ingest(layout, tabletRows, id === 'R022'), pack = ingest(layout, packRows, false);
    if (tablet.shape > 0 || pack.shape > 0) reasons.push(C.ROW_SHAPE_INVALID);
    if (tablet.value > 0 || pack.value > 0) reasons.push(C.ROW_VALUE_UNPARSEABLE);
    if (tablet.txn > 0 || pack.txn > 0) reasons.push(C.TXN_TYPE_UNKNOWN);
    if (tablet.overflow || pack.overflow) reasons.push(C.AGGREGATE_OVERFLOW);
    if (reasons.length === 0 && packTotalsProblem(layout, pack, packTotals, packRows.length)) reasons.push(C.PACK_TOTALS_INCONSISTENT);
    var norm = emptyNorm();
    norm.blankAsZero = tablet.norm.blankAsZero + pack.norm.blankAsZero; norm.exponentExpanded = tablet.norm.exponentExpanded + pack.norm.exponentExpanded;
    norm.trailingZerosTrimmed = tablet.norm.trailingZerosTrimmed + pack.norm.trailingZerosTrimmed; norm.caseFolded = tablet.norm.caseFolded + pack.norm.caseFolded;
    if (reasons.length > 0) {
      var blocked = blankReport('CANNOT_COMPARE', reasons, tabletRows.length, packRows.length);
      blocked.shapeErrors = { tablet: tablet.shape, pack: pack.shape };
      blocked.unparseableRows = { tablet: tablet.value + tablet.txn, pack: pack.value + pack.txn };
      blocked.normalisations = norm;
      return { report: blocked };
    }
    var samples = [];
    var matched = matchGroups(layout, tablet, pack, sampleLimit, samples);
    var stats = matched.stats, flags = [];
    if (stats.overflow) { var overflowed = blankReport('CANNOT_COMPARE', [C.AGGREGATE_OVERFLOW], tabletRows.length, packRows.length); overflowed.normalisations = norm; return { report: overflowed }; }
    if (stats.ambiguousGroups > 0) flags.push(C.PAIRING_AMBIGUOUS);
    if (stats.leadingZeroSuspect > 0) flags.push(C.LEADING_ZERO_KEY_SUSPECT);
    if (stats.signSuspect > 0) flags.push(C.SIGN_CONVENTION_SUSPECT);
    /* totals */
    var totalsDiffer = tablet.rowCount !== pack.rowCount, i;
    for (i = 0; i < layout.measures.length; i += 1) if (tablet.signed[i] !== pack.signed[i]) totalsDiffer = true;
    /* days: the union of the days of both sides, ascending */
    var dateSet = Object.create(null), date;
    for (date in tablet.days) dateSet[date] = true;
    for (date in pack.days) dateSet[date] = true;
    var dates = Object.keys(dateSet).sort(), days = [], daysDiffering = 0;
    for (var d = 0; d < dates.length; d += 1) {
      var left = tablet.days[dates[d]], right = pack.days[dates[d]], diffs = [];
      var leftCount = left ? left.rowCount : 0, rightCount = right ? right.rowCount : 0;
      if (leftCount !== rightCount) diffs.push({ key: 'rowCount', pack: rightCount, tablet: leftCount });
      for (i = 0; i < layout.measures.length; i += 1) {
        var leftSum = left ? left.sums[i] : 0, rightSum = right ? right.sums[i] : 0;
        if (leftSum !== rightSum) diffs.push({ key: layout.measures[i].name, pack: rightSum, tablet: leftSum });
      }
      if (diffs.length > 0) { daysDiffering += 1; if (days.length < MAX_DAYS_LISTED) days.push({ date: dates[d], diffs: diffs }); }
    }
    if (daysDiffering > MAX_DAYS_LISTED) flags.push(C.DAYS_TRUNCATED);
    var columnsOut = {}, columnNames = Object.keys(matched.columns);
    for (i = 0; i < columnNames.length; i += 1) columnsOut[columnNames[i]] = { rows: matched.columns[columnNames[i]].rows, deltaUnits: matched.columns[columnNames[i]].deltaUnits };
    var differs = stats.differing + stats.onlyTablet + stats.onlyPack > 0 || totalsDiffer || daysDiffering > 0;
    for (var q = 0; q < samples.length; q += 1) sampleSink.push(samples[q]);
    return { report: {
      status: differs ? 'DIFFERENCES' : 'MATCH', reasonCodes: [], flags: uniqueSorted(flags),
      rows: { tablet: tablet.rowCount, pack: pack.rowCount, matched: stats.matched, differing: stats.differing, onlyTablet: stats.onlyTablet, onlyPack: stats.onlyPack, ambiguousGroups: stats.ambiguousGroups },
      shapeErrors: { tablet: 0, pack: 0 }, unparseableRows: { tablet: 0, pack: 0 }, columns: columnsOut,
      totals: { tablet: { rowCount: tablet.rowCount, sums: sumsObject(layout, tablet.signed) }, pack: { rowCount: pack.rowCount, sums: sumsObject(layout, pack.signed) } },
      daysDiffering: daysDiffering, days: days, normalisations: norm
    }, tabletSide: tablet };
  }

  /* ---- engine figures ----------------------------------------------------------------------------------------- */
  function countKeys(set) { return Object.keys(set).length; }
  function figureResults(figures, reportResults, tabletSides) {
    var out = [], counts = { business: 0, matched: 0, notComparable: 0, rowDifference: 0 };
    var list = Array.isArray(figures) ? figures.slice(0, MAX_FIGURES) : [];
    for (var i = 0; i < list.length; i += 1) {
      var figure = list[i];
      var shapeOk = isObject(figure) && typeof figure.figureId === 'string' && FIGURE_ID.test(figure.figureId) && REPORT_IDS.indexOf(figure.reportId) >= 0 &&
        (figure.kind === 'COUNT' || figure.kind === 'MONEY_UNITS' || figure.kind === 'QUANTITY_UNITS') &&
        typeof figure.value === 'string' && INT_TEXT.test(figure.value) && figure.value !== '-0' && figure.value.length <= 17 && Number.isSafeInteger(Number(figure.value)) &&
        (figure.date === null || (typeof figure.date === 'string' && realDate(figure.date)));
      var entry = { figureId: shapeOk ? figure.figureId : '', reportId: shapeOk ? figure.reportId : '', date: shapeOk ? figure.date : null, kind: shapeOk ? figure.kind : '',
        status: 'NOT_COMPARABLE', tabletUnits: null, engineUnits: shapeOk ? Number(figure.value) : null, deltaUnits: null,
        ruleRef: shapeOk && typeof figure.ruleRef === 'string' && RULE_REF.test(figure.ruleRef) ? figure.ruleRef : '', label: '' };
      var known = shapeOk && hasOwn.call(FIGURES, figure.figureId) ? FIGURES[figure.figureId] : null;
      if (known && known.reportId === figure.reportId && known.kind === figure.kind) {
        var status = reportResults[figure.reportId].status;
        if (status === 'MATCH' && tabletSides[figure.reportId]) {
          var side = tabletSides[figure.reportId];
          var tabletUnits = figure.date === null ? countKeys(side.invoices) : (side.invoicesByDay[figure.date] ? countKeys(side.invoicesByDay[figure.date]) : 0);
          entry.tabletUnits = tabletUnits;
          entry.deltaUnits = entry.engineUnits - tabletUnits;
          if (entry.deltaUnits === 0) entry.status = 'MATCH';
          else { entry.status = 'BUSINESS_RULE_DIFFERENCE'; entry.label = LABEL_RULE_DIFFERENCE; }
        } else if (status === 'DIFFERENCES') entry.status = 'ROW_DIFFERENCE_PRESENT';
      }
      if (entry.status === 'BUSINESS_RULE_DIFFERENCE') counts.business += 1;
      else if (entry.status === 'MATCH') counts.matched += 1;
      else if (entry.status === 'ROW_DIFFERENCE_PRESENT') counts.rowDifference += 1;
      else counts.notComparable += 1;
      out.push(entry);
    }
    return { list: out, counts: counts };
  }

  /* ---- the comparison -------------------------------------------------------------------------------------------- */
  function misuse() { return Object.freeze({ ok: false, code: C.INPUT_INVALID, stage: 'COMPARE' }); }
  function text(value, max) { return typeof value === 'string' && value.length <= max ? value : ''; }
  function fullCalendarMonth(start, end) {
    if (!realDate(start) || !realDate(end) || start.substring(0, 7) !== end.substring(0, 7) || start.substring(8) !== '01') return false;
    var last = new Date(Date.UTC(Number(end.substring(0, 4)), Number(end.substring(5, 7)), 0)).getUTCDate();
    return Number(end.substring(8)) === last;
  }
  function run(input) {
    if (!isObject(input)) return misuse();
    var scope = input.scope, tablet = input.tablet, pack = input.pack, options = input.options;
    if (!isObject(scope) || !isObject(tablet) || !isObject(pack)) return misuse();
    var sampleLimit = 0;
    if (options !== undefined) {
      if (!isObject(options) || !(options.sampleLimitPerReport === undefined || isIntBetween(options.sampleLimitPerReport, 0, 5))) return misuse();
      if (options.sampleLimitPerReport !== undefined) sampleLimit = options.sampleLimitPerReport;
    }
    var scopeCodes = [];
    if (pack.verified !== true || typeof pack.manifestSha256 !== 'string' || !HEX64.test(pack.manifestSha256) || typeof pack.exportId !== 'string' || !HEX32.test(pack.exportId) ||
      typeof pack.keyId !== 'string' || !HEX16.test(pack.keyId)) scopeCodes.push(C.PACK_NOT_VERIFIED);
    if (scope.storeCode !== COMPARE_STORE || pack.storeCode !== COMPARE_STORE) scopeCodes.push(C.STORE_REFUSED);
    var builtKey = COMPARE_STORE + '|' + text(scope.financialYear, 7) + '|' + text(scope.periodStart, 10) + '..' + text(scope.periodEnd, 10);
    if (typeof scope.scopeKey !== 'string' || scope.scopeKey !== pack.scopeKey || scope.scopeKey !== builtKey) scopeCodes.push(C.SCOPE_MISMATCH);
    if (tablet.ok !== true || typeof tablet.generationId !== 'string' || !GENERATION.test(tablet.generationId)) scopeCodes.push(C.NO_TABLET_GENERATION);
    else if (tablet.complete !== true) scopeCodes.push(C.TABLET_READ_INCOMPLETE);
    var scopeFailed = scopeCodes.length > 0;

    var tabletRows = isObject(tablet.rows) ? tablet.rows : {}, packRows = isObject(pack.rows) ? pack.rows : {}, packTotals = isObject(pack.engineTotals) ? pack.engineTotals : {};
    var expected = isObject(tablet.expectedRowCounts) ? tablet.expectedRowCounts : null;
    var reports = {}, tabletSides = {}, samples = [], i, id;
    for (i = 0; i < REPORT_IDS.length; i += 1) {
      id = REPORT_IDS[i];
      if (scopeFailed) { reports[id] = blankReport('CANNOT_COMPARE', [], 0, 0); continue; }
      var expectedCount = expected && hasOwn.call(expected, id) ? expected[id] : undefined;
      if (expected && expectedCount !== undefined && !isIntBetween(expectedCount, 0, 9007199254740991)) expectedCount = -1;
      var perReport = [];
      var made = compareReport(id, hasOwn.call(tabletRows, id) ? tabletRows[id] : undefined, hasOwn.call(packRows, id) ? packRows[id] : undefined,
        hasOwn.call(packTotals, id) ? packTotals[id] : undefined, expectedCount, sampleLimit, perReport);
      reports[id] = made.report;
      if (made.tabletSide) tabletSides[id] = made.tabletSide;
      for (var s = 0; s < perReport.length; s += 1) { perReport[s].report = id; samples.push(perReport[s]); }
    }
    var counts = { reportsMatch: 0, reportsDifferent: 0, reportsCannotCompare: 0, rowsTablet: 0, rowsPack: 0, rowsMatched: 0, rowsDiffering: 0, rowsOnlyTablet: 0, rowsOnlyPack: 0,
      columnDifferences: 0, daysDiffering: 0, businessRuleDifferences: 0, figuresMatched: 0, figuresNotComparable: 0, figuresRowDifferencePresent: 0 };
    var allReasons = scopeCodes.slice();
    for (i = 0; i < REPORT_IDS.length; i += 1) {
      var report = reports[REPORT_IDS[i]];
      if (report.status === 'MATCH') counts.reportsMatch += 1; else if (report.status === 'DIFFERENCES') counts.reportsDifferent += 1; else counts.reportsCannotCompare += 1;
      counts.rowsTablet += report.rows.tablet; counts.rowsPack += report.rows.pack; counts.rowsMatched += report.rows.matched; counts.rowsDiffering += report.rows.differing;
      counts.rowsOnlyTablet += report.rows.onlyTablet; counts.rowsOnlyPack += report.rows.onlyPack; counts.daysDiffering += report.daysDiffering;
      var columnNames = Object.keys(report.columns);
      for (var c = 0; c < columnNames.length; c += 1) counts.columnDifferences += report.columns[columnNames[c]].rows;
      allReasons = allReasons.concat(report.reasonCodes, report.flags);
    }
    var figures = { list: [], counts: { business: 0, matched: 0, notComparable: 0, rowDifference: 0 } };
    if (!scopeFailed) figures = figureResults(pack.engineFigures, reports, tabletSides);
    counts.businessRuleDifferences = figures.counts.business; counts.figuresMatched = figures.counts.matched;
    counts.figuresNotComparable = figures.counts.notComparable; counts.figuresRowDifferencePresent = figures.counts.rowDifference;
    var outcome;
    if (scopeFailed) outcome = 'CANNOT_COMPARE';
    else if (counts.reportsDifferent > 0) outcome = 'DIFFERENCES';
    else if (counts.reportsCannotCompare > 0) outcome = 'CANNOT_COMPARE';
    else outcome = 'MATCH';
    var limited = samples.slice(0, 20);
    return deepFreeze({
      ok: true, contract: CONTRACT, level: 'ROWS', outcome: outcome, reasonCodes: uniqueSorted(allReasons),
      scope: { storeCode: text(scope.storeCode, 12), financialYear: text(scope.financialYear, 7), periodStart: text(scope.periodStart, 10), periodEnd: text(scope.periodEnd, 10),
        scopeKey: text(scope.scopeKey, 80), fullCalendarMonth: fullCalendarMonth(text(scope.periodStart, 10), text(scope.periodEnd, 10)) },
      tablet: { generationId: tablet.ok === true && typeof tablet.generationId === 'string' && GENERATION.test(tablet.generationId) ? tablet.generationId : null },
      pack: { exportId: text(pack.exportId, 32), manifestSha256: text(pack.manifestSha256, 64), keyId: text(pack.keyId, 16),
        engineGeneration: isIntBetween(pack.engineGeneration, 0, 99999) ? pack.engineGeneration : 0 },
      counts: counts, reports: reports, figures: figures.list, appliedToCalculations: false, publishes: false, samples: limited
    });
  }
  function compare(input) {
    try { return run(input); } catch (_) { return misuse(); }
  }

  return Object.freeze({
    VERSION: COMPARE_VERSION, CONTRACT: CONTRACT, CODES: CODES, INFORMATIONAL: INFORMATIONAL, REPORT_IDS: REPORT_IDS, COLUMNS: COLUMNS, MEASURES: MEASURES,
    FIGURES: FIGURES, MAX_ROWS: MAX_ROWS, MAX_DAYS_LISTED: MAX_DAYS_LISTED, LABEL_RULE_DIFFERENCE: LABEL_RULE_DIFFERENCE,
    compare: compare, formatUnits: formatUnits
  });
});
