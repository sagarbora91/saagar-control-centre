(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Service billing arithmetic. Pure: no storage, no screen, no clock, no random numbers.
  // Money is whole paise. GST rates are whole basis points (1800 = 18.00 percent). Quantity is whole pieces.
  // Every public function is total (never throws) and never changes what it is given.
  // The only rounding is divRound: round half up on integers.

  var SBC_CALC_VERSION = 'SBC-1';
  var SBC_MAX_SAFE = 9007199254740991;
  var SBC_MAX_LINES = 100;
  var SBC_MAX_QTY = 9999;
  var SBC_MAX_LINE_PAISE = 50000000;
  var SBC_MAX_BILL_PAISE = 90000000;
  var SBC_MAX_NAME_CHARS = 80;
  var SBC_MAX_REF_CHARS = 60;
  var SBC_MAX_RATE_BP = 10000;
  var SBC_UNUSUAL_RATE_BP = 2800;
  var SBC_DEFAULT_STATE = '27';
  var SBC_MAX_ITEMS = 10000;
  var SBC_MAX_MONEY = 100000000000;
  var SBC_ALLOC_CAP = 9000000000000000;
  var SBC_MAX_LEGACY_RUPEES = 1000000000;
  var SBC_GSTIN_HARD = true;
  var SBC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  var SBC_LIMITS = Object.freeze({
    maxLines: SBC_MAX_LINES,
    maxQty: SBC_MAX_QTY,
    maxLinePaise: SBC_MAX_LINE_PAISE,
    maxBillPaise: SBC_MAX_BILL_PAISE,
    maxNameChars: SBC_MAX_NAME_CHARS,
    maxRefChars: SBC_MAX_REF_CHARS
  });

  var SBC_STATE_CODES = (function () {
    var out = [];
    var i;
    for (i = 1; i <= 38; i += 1) out.push(i < 10 ? '0' + i : String(i));
    out.push('97');
    out.push('99');
    return Object.freeze(out);
  })();

  var SBC_CODE_LIST = [
    'INPUT_INVALID', 'LINES_REQUIRED', 'TOO_MANY_LINES', 'LINE_KIND_INVALID', 'LINE_NAME_REQUIRED', 'LINE_NAME_INVALID',
    'CODE_INVALID', 'HSN_REQUIRED', 'HSN_INVALID', 'SAC_REQUIRED', 'SAC_INVALID', 'RATE_REQUIRED', 'RATE_INVALID',
    'BASIS_REQUIRED', 'BASIS_INVALID', 'PRICE_INVALID', 'QTY_INVALID', 'DISCOUNT_INVALID', 'DISCOUNT_EXCEEDS_LINE',
    'NOCHARGE_HAS_DISCOUNT', 'REF_INVALID', 'LINE_TOO_LARGE', 'BILL_DISCOUNT_INVALID', 'DISCOUNT_EXCEEDS_BILL',
    'BILL_TOO_LARGE', 'SELLER_STATE_INVALID', 'CUSTOMER_STATE_INVALID', 'GSTIN_FORMAT', 'GSTIN_STATE', 'GSTIN_CHECKSUM',
    'GSTIN_STATE_MISMATCH', 'ALLOC_INVALID', 'AMOUNT_INVALID', 'PERCENT_INVALID', 'TARGET_INVALID', 'TARGET_ABOVE_TOTAL',
    'TARGET_NOT_REACHABLE', 'BILL_RECORD_INVALID', 'CALC_VERSION_UNKNOWN', 'BILL_MISMATCH', 'APPROVAL_INVALID',
    'CREDIT_BILL_INVALID', 'NOCHARGE_NO_CREDIT', 'CREDIT_PRIOR_INVALID', 'CREDIT_REQUEST_INVALID', 'CREDIT_LINE_UNKNOWN',
    'CREDIT_DUPLICATE_LINE', 'CREDIT_LINE_NOCHARGE', 'CREDIT_KIND_CONFLICT', 'CREDIT_QTY_INVALID', 'CREDIT_TAXABLE_INVALID',
    'CREDIT_EXCEEDS_LINE', 'CREDIT_EXCEEDS_TAXABLE', 'CREDIT_NOTHING', 'CREDIT_EXCEEDS_REMAINING', 'SETTLE_INVALID',
    'CREDIT_EXCEEDS_INVOICE', 'REFUNDS_EXCEED_RECEIPTS', 'LEGACY_INVALID', 'LEGACY_QTY_FRACTION', 'INTERNAL_ERROR',
    'OTHER_LINE_PRESENT', 'PRICE_ZERO', 'RATE_UNUSUAL', 'ZERO_VALUE_BILL', 'OTHER_STATE_UNREGISTERED_INTRA', 'LEGACY_GST_BLANK'
  ];

  var SBC_MESSAGES = Object.freeze({
    INPUT_INVALID: 'The bill details are not in the expected form. Check the entries and try again.',
    LINES_REQUIRED: 'Add at least one line to the bill.',
    TOO_MANY_LINES: 'A bill can have at most 100 lines.',
    LINE_KIND_INVALID: 'Each line must be a part line, a labour line or an other line.',
    LINE_NAME_REQUIRED: 'Each line needs a name.',
    LINE_NAME_INVALID: 'The line name is too long (80 characters at most), has a hidden character, or starts with = or @.',
    CODE_INVALID: 'The item code of a line is missing or not valid.',
    HSN_REQUIRED: 'A part line has no HSN code. Add the HSN code in the Parts master first.',
    HSN_INVALID: 'The HSN code must have 4, 6 or 8 digits.',
    SAC_REQUIRED: 'A labour line has no SAC code. Add the SAC code in the Labour master first.',
    SAC_INVALID: 'The SAC code must have 4 or 6 digits.',
    RATE_REQUIRED: 'A line has no GST rate.',
    RATE_INVALID: 'The GST rate of a line is not valid. It must be from 0 to 100 percent.',
    BASIS_REQUIRED: 'A line does not say whether its price includes GST.',
    BASIS_INVALID: 'The price basis of a line must be "includes GST" or "excludes GST".',
    PRICE_INVALID: 'The price of a line is not valid. Use a whole number of paise, zero or more.',
    QTY_INVALID: 'The quantity of a line must be a whole number from 1 to 9999.',
    DISCOUNT_INVALID: 'The discount of a line is not valid. Use a whole number of paise, zero or more.',
    DISCOUNT_EXCEEDS_LINE: 'The discount of a line is more than the line amount.',
    NOCHARGE_HAS_DISCOUNT: 'A no-charge line cannot also have a discount.',
    REF_INVALID: 'The reference of a line has characters that are not allowed or is too long.',
    LINE_TOO_LARGE: 'A line is above the limit of Rs 5,00,000. Split it into smaller lines.',
    BILL_DISCOUNT_INVALID: 'The bill discount is not valid. Use a whole number of paise, zero or more.',
    DISCOUNT_EXCEEDS_BILL: 'The bill discount is more than the amount payable.',
    BILL_TOO_LARGE: 'The bill is above the limit of Rs 9,00,000.',
    SELLER_STATE_INVALID: 'The shop state code is not valid.',
    CUSTOMER_STATE_INVALID: 'The customer state code is not valid.',
    GSTIN_FORMAT: 'The GST number must have 15 letters and digits in the standard pattern.',
    GSTIN_STATE: 'The first two digits of the GST number are not a valid state code.',
    GSTIN_CHECKSUM: 'The last character of the GST number does not match. Check the number for a typing mistake.',
    GSTIN_STATE_MISMATCH: 'The state of the customer does not match the first two digits of the GST number.',
    ALLOC_INVALID: 'The amount could not be shared over the lines.',
    AMOUNT_INVALID: 'The amount is not valid. Use rupees with at most 2 decimals.',
    PERCENT_INVALID: 'The percentage is not valid. Use 0 to 100 with at most 2 decimals.',
    TARGET_INVALID: 'The final amount must be a whole number of rupees.',
    TARGET_ABOVE_TOTAL: 'The final amount is more than the bill total. Add a line for the extra charge instead.',
    TARGET_NOT_REACHABLE: 'No discount gives that final amount.',
    BILL_RECORD_INVALID: 'The saved bill is damaged or incomplete.',
    CALC_VERSION_UNKNOWN: 'The saved bill was made by a version of the bill rules this app does not know.',
    BILL_MISMATCH: 'The saved bill figures do not match its lines. The bill may have been changed.',
    APPROVAL_INVALID: 'The approved amount and the total must be whole numbers of paise.',
    CREDIT_BILL_INVALID: 'The invoice to credit is damaged or not a finished invoice.',
    NOCHARGE_NO_CREDIT: 'A no-charge invoice cannot be credited.',
    CREDIT_PRIOR_INVALID: 'The earlier credit notes do not agree with the invoice.',
    CREDIT_REQUEST_INVALID: 'The credit note request is not valid.',
    CREDIT_LINE_UNKNOWN: 'The credit note names a line that is not on the invoice.',
    CREDIT_DUPLICATE_LINE: 'A line is named twice in the credit note.',
    CREDIT_LINE_NOCHARGE: 'A no-charge line cannot be credited.',
    CREDIT_KIND_CONFLICT: 'For each line give either the quantity returned or the price to take back, not both and not neither.',
    CREDIT_QTY_INVALID: 'The quantity to credit must be a whole number, 1 or more.',
    CREDIT_TAXABLE_INVALID: 'The amount to take back must be a whole number of paise, 1 or more.',
    CREDIT_EXCEEDS_LINE: 'The quantity to credit is more than what is left on that line.',
    CREDIT_EXCEEDS_TAXABLE: 'The amount to take back is more than what is left on that line.',
    CREDIT_NOTHING: 'There is nothing left to credit.',
    CREDIT_EXCEEDS_REMAINING: 'The credit note would be more than what is left of the invoice.',
    SETTLE_INVALID: 'The amounts for the balance are not valid. Use whole numbers of paise, zero or more.',
    CREDIT_EXCEEDS_INVOICE: 'The credit notes are more than the invoice.',
    REFUNDS_EXCEED_RECEIPTS: 'The refunds are more than the money received.',
    LEGACY_INVALID: 'The old job figures are not valid.',
    LEGACY_QTY_FRACTION: 'An old job line has a fraction as quantity. Change it to a whole number.',
    INTERNAL_ERROR: 'Something went wrong in the bill calculation. Nothing was changed.',
    OTHER_LINE_PRESENT: 'The bill has a free-text line.',
    PRICE_ZERO: 'A line has a price of zero.',
    RATE_UNUSUAL: 'A line has a GST rate above 28 percent.',
    ZERO_VALUE_BILL: 'The bill total is zero.',
    OTHER_STATE_UNREGISTERED_INTRA: 'The customer is in another state without a GST number, so CGST and SGST were used.',
    LEGACY_GST_BLANK: 'The old job had no GST rate. Zero percent was used.'
  });

  var SBC_CODES = (function () {
    var o = {};
    var i;
    for (i = 0; i < SBC_CODE_LIST.length; i += 1) o[SBC_CODE_LIST[i]] = SBC_CODE_LIST[i];
    return Object.freeze(o);
  })();

  // ---- small helpers ----

  function isInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && Math.abs(n) <= SBC_MAX_SAFE;
  }

  // a plain data object: no prototype, or the prototype is itself a root prototype (also true across page frames)
  function isPlain(v) {
    var p;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    p = Object.getPrototypeOf(v);
    return p === null || Object.getPrototypeOf(p) === null;
  }

  function hasOwn(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  function fail(code, detail) {
    var r = { ok: false, code: code, message: SBC_MESSAGES[code] };
    if (detail !== undefined) r.detail = detail;
    return r;
  }

  function internalFail(e) {
    return fail('INTERNAL_ERROR', { error: String(e && e.message) });
  }

  function wrap(fn, fallback) {
    return function () {
      try {
        return fn.apply(null, arguments);
      } catch (e) {
        return fallback === undefined ? internalFail(e) : fallback;
      }
    };
  }

  // floor(n / d) for integers n >= 0, d > 0, exact even when the float quotient is a hair off
  function idiv(n, d) {
    var q = Math.floor(n / d);
    var r = n - q * d;
    while (r < 0) { q -= 1; r += d; }
    while (r >= d) { q += 1; r -= d; }
    return q;
  }

  function rdiv(n, d) {
    return idiv(2 * n + d, 2 * d);
  }

  function divRoundPublic(n, d) {
    if (!isInt(n) || !isInt(d) || n < 0 || d <= 0) return null;
    if (2 * n + d > SBC_MAX_SAFE) return null;
    return rdiv(n, d);
  }

  function inList(list, v) {
    var i;
    for (i = 0; i < list.length; i += 1) if (list[i] === v) return true;
    return false;
  }

  function trimText(s) {
    return s.replace(/^\s+|\s+$/g, '');
  }

  // ---- amounts and percentages typed by staff ----

  function rupeesToPaise(x) {
    var s, m, p, frac;
    if (typeof x === 'number') {
      if (!isFinite(x) || x < 0 || x > 999999999.99) return fail('AMOUNT_INVALID');
      p = Math.floor(x * 100 + 0.5);
      if (p / 100 !== x) return fail('AMOUNT_INVALID');
      return { ok: true, paise: p };
    }
    if (typeof x !== 'string') return fail('AMOUNT_INVALID');
    s = trimText(x).replace(/^(Rs\.?|\u20b9)/i, '').replace(/^\s+/, '').replace(/,/g, '');
    m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return fail('AMOUNT_INVALID');
    frac = m[2] === undefined ? '00' : (m[2].length === 1 ? m[2] + '0' : m[2]);
    return { ok: true, paise: parseInt(m[1], 10) * 100 + parseInt(frac, 10) };
  }

  function paiseToRupeesText(p) {
    var neg, a, rup, ps, s, head, tail;
    if (!isInt(p)) return '';
    neg = p < 0;
    a = neg ? -p : p;
    rup = idiv(a, 100);
    ps = a - rup * 100;
    s = String(rup);
    if (s.length > 3) {
      head = s.slice(0, s.length - 3);
      tail = s.slice(s.length - 3);
      s = head.replace(/\B(?=(\d{2})+$)/g, ',') + ',' + tail;
    }
    return (neg ? '-' : '') + s + '.' + (ps < 10 ? '0' : '') + ps;
  }

  function percentToBp(x) {
    var s, m, bp, frac;
    if (typeof x === 'number') {
      if (!isFinite(x) || x < 0 || x > 100) return fail('PERCENT_INVALID');
      bp = Math.floor(x * 100 + 0.5);
      if (bp / 100 !== x) return fail('PERCENT_INVALID');
      return { ok: true, bp: bp };
    }
    if (typeof x !== 'string') return fail('PERCENT_INVALID');
    s = trimText(x).replace(/\s*%$/, '');
    m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return fail('PERCENT_INVALID');
    frac = m[2] === undefined ? '00' : (m[2].length === 1 ? m[2] + '0' : m[2]);
    bp = parseInt(m[1], 10) * 100 + parseInt(frac, 10);
    if (bp > SBC_MAX_RATE_BP) return fail('PERCENT_INVALID');
    return { ok: true, bp: bp };
  }

  function percentOfPaise(base, bp) {
    if (!isInt(base) || base < 0 || base > SBC_MAX_BILL_PAISE) return fail('AMOUNT_INVALID');
    if (!isInt(bp) || bp < 0 || bp > SBC_MAX_RATE_BP) return fail('PERCENT_INVALID');
    return { ok: true, paise: rdiv(base * bp, 10000) };
  }

  // ---- GSTIN, state codes, supply type ----

  function gstinCheckChar(first14) {
    var sum = 0;
    var i, v, f, p;
    if (typeof first14 !== 'string' || !/^[0-9A-Z]{14}$/.test(first14)) return '';
    for (i = 0; i < 14; i += 1) {
      v = SBC_CHARSET.indexOf(first14.charAt(i));
      f = i % 2 === 0 ? 1 : 2;
      p = v * f;
      sum += Math.floor(p / 36) + (p % 36);
    }
    return SBC_CHARSET.charAt((36 - (sum % 36)) % 36);
  }

  function validateGstin(raw) {
    var s, state, r;
    if (typeof raw !== 'string') return fail('GSTIN_FORMAT');
    s = trimText(raw).toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return fail('GSTIN_FORMAT');
    state = s.slice(0, 2);
    if (!inList(SBC_STATE_CODES, state)) return fail('GSTIN_STATE');
    r = { ok: true, gstin: s, stateCode: state };
    if (gstinCheckChar(s.slice(0, 14)) !== s.charAt(14)) {
      if (SBC_GSTIN_HARD) return fail('GSTIN_CHECKSUM');
      r.checksumOk = false;
    }
    return r;
  }

  // a state code that may be missing: returns {ok, code} with code '' when missing
  function stateOf(v) {
    var t;
    if (v === undefined || v === null) return { ok: true, code: '' };
    if (typeof v !== 'string') return { ok: false };
    t = trimText(v);
    if (t === '') return { ok: true, code: '' };
    if (!inList(SBC_STATE_CODES, t)) return { ok: false };
    return { ok: true, code: t };
  }

  // the full supply decision; also reports the recipient state to echo into the bill input
  function decideCore(sellerRaw, recipientStateRaw, gstinRaw) {
    var sel = stateOf(sellerRaw);
    var rec = stateOf(recipientStateRaw);
    var seller, g, v;
    if (!sel.ok) return { fail: fail('SELLER_STATE_INVALID'), field: 'sellerStateCode' };
    seller = sel.code === '' ? SBC_DEFAULT_STATE : sel.code;
    if (!rec.ok) return { fail: fail('CUSTOMER_STATE_INVALID'), field: 'recipientStateCode' };
    if (gstinRaw === undefined || gstinRaw === null) g = '';
    else if (typeof gstinRaw !== 'string') return { fail: fail('GSTIN_FORMAT'), field: 'recipientGstin' };
    else g = trimText(gstinRaw);
    if (g === '') {
      return {
        ok: true, supplyType: 'INTRA', placeOfSupplyStateCode: seller, recipientGstin: '', reason: 'UNREGISTERED',
        sellerStateCode: seller, recipientStateCode: rec.code === '' ? seller : rec.code
      };
    }
    v = validateGstin(g);
    if (!v.ok) return { fail: v, field: 'recipientGstin' };
    if (rec.code !== '' && rec.code !== v.stateCode) return { fail: fail('GSTIN_STATE_MISMATCH'), field: 'recipientStateCode' };
    return {
      ok: true, supplyType: v.stateCode === seller ? 'INTRA' : 'INTER', placeOfSupplyStateCode: v.stateCode,
      recipientGstin: v.gstin, reason: 'REGISTERED', sellerStateCode: seller, recipientStateCode: v.stateCode
    };
  }

  function decideSupply(o) {
    var d;
    if (!isPlain(o)) return fail('INPUT_INVALID');
    d = decideCore(o.sellerStateCode, o.recipientStateCode, o.recipientGstin);
    if (!d.ok) return d.fail;
    return {
      ok: true, supplyType: d.supplyType, placeOfSupplyStateCode: d.placeOfSupplyStateCode,
      recipientGstin: d.recipientGstin, reason: d.reason
    };
  }

  // ---- exact proportional split ----

  function allocateProportional(total, weights) {
    var n, i, w, sum, parts, base, rem, left, order, prod, q, k;
    if (!isInt(total) || total < 0 || !Array.isArray(weights)) return fail('ALLOC_INVALID');
    n = weights.length;
    if (n > SBC_MAX_ITEMS) return fail('ALLOC_INVALID');
    sum = 0;
    for (i = 0; i < n; i += 1) {
      w = weights[i];
      if (!isInt(w) || w < 0) return fail('ALLOC_INVALID');
      sum += w;
      if (sum > SBC_MAX_SAFE) return fail('ALLOC_INVALID');
    }
    if (total > sum) return fail('ALLOC_INVALID');
    parts = [];
    for (i = 0; i < n; i += 1) parts.push(0);
    if (total === 0) return { ok: true, parts: parts };
    base = [];
    rem = [];
    left = total;
    for (i = 0; i < n; i += 1) {
      prod = total * weights[i];
      if (prod > SBC_ALLOC_CAP) return fail('ALLOC_INVALID');
      q = idiv(prod, sum);
      base.push(q);
      rem.push(prod - q * sum);
      left -= q;
    }
    order = [];
    for (i = 0; i < n; i += 1) if (weights[i] > 0) order.push(i);
    order.sort(function (a, b) { return rem[b] - rem[a] || a - b; });
    for (i = 0; i < n; i += 1) parts[i] = base[i];
    for (k = 0; k < left; k += 1) parts[order[k]] += 1;
    return { ok: true, parts: parts };
  }

  // ---- bill input checking ----

  var SBC_TOP_KEYS = ['lines', 'billDiscountPaise', 'sellerStateCode', 'recipientStateCode', 'recipientGstin'];
  var SBC_LINE_KEYS = ['kind', 'code', 'name', 'hsnSac', 'rateBp', 'priceBasis', 'unitPricePaise', 'qty', 'discountPaise', 'noCharge', 'ref'];

  function checkLine(raw, no) {
    var issues = [];
    var out = {
      kind: '', code: '', name: '', hsnSac: '', rateBp: 0, priceBasis: '', unitPricePaise: 0, qty: 0,
      discountPaise: 0, noCharge: false, ref: ''
    };
    var keys, i, v, t, kindOk, priceOk, qtyOk, discOk, isSac;
    function bad(field, code) { issues.push({ lineNo: no, field: field, code: code }); }
    if (!isPlain(raw)) {
      bad('line', 'INPUT_INVALID');
      return { issues: issues, line: null };
    }
    keys = Object.keys(raw);
    for (i = 0; i < keys.length; i += 1) if (!inList(SBC_LINE_KEYS, keys[i])) bad(keys[i], 'INPUT_INVALID');

    v = raw.kind;
    kindOk = v === 'PART' || v === 'LABOUR' || v === 'OTHER';
    if (kindOk) out.kind = v; else bad('kind', 'LINE_KIND_INVALID');

    v = raw.code;
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') {
      if (kindOk) bad('code', 'CODE_INVALID');
    } else {
      t = trimText(v).toUpperCase();
      if (t === '' ? (kindOk && out.kind !== 'OTHER') : !/^[A-Z0-9][A-Z0-9._\/-]{0,39}$/.test(t)) bad('code', 'CODE_INVALID');
      else out.code = t;
    }

    v = raw.name;
    if (typeof v !== 'string' || trimText(v) === '') bad('name', 'LINE_NAME_REQUIRED');
    else {
      t = trimText(v);
      if (t.length > SBC_MAX_NAME_CHARS || /[\u0000-\u001f\u007f]/.test(t) || /^[=@]/.test(t)) bad('name', 'LINE_NAME_INVALID');
      else out.name = t;
    }

    v = raw.hsnSac;
    if (v === undefined || v === null) v = '';
    isSac = out.kind === 'LABOUR';
    if (kindOk) {
      if (typeof v !== 'string' || !/^\d*$/.test(v.replace(/\s+/g, ''))) bad('hsnSac', isSac ? 'SAC_INVALID' : 'HSN_INVALID');
      else {
        t = v.replace(/\s+/g, '');
        if (t === '') {
          if (out.kind !== 'OTHER') bad('hsnSac', isSac ? 'SAC_REQUIRED' : 'HSN_REQUIRED');
        } else if (!(out.kind === 'LABOUR' ? /^(\d{4}|\d{6})$/ : /^(\d{4}|\d{6}|\d{8})$/).test(t)) bad('hsnSac', isSac ? 'SAC_INVALID' : 'HSN_INVALID');
        else out.hsnSac = t;
      }
    }

    v = raw.rateBp;
    if (v === undefined) bad('rateBp', 'RATE_REQUIRED');
    else if (!isInt(v) || v < 0 || v > SBC_MAX_RATE_BP) bad('rateBp', 'RATE_INVALID');
    else out.rateBp = v;

    v = raw.priceBasis;
    if (v === undefined) bad('priceBasis', 'BASIS_REQUIRED');
    else if (v !== 'INCL' && v !== 'EXCL') bad('priceBasis', 'BASIS_INVALID');
    else out.priceBasis = v;

    v = raw.unitPricePaise;
    priceOk = isInt(v) && v >= 0;
    if (!priceOk) bad('unitPricePaise', 'PRICE_INVALID'); else out.unitPricePaise = v;

    v = raw.qty;
    qtyOk = isInt(v) && v >= 1 && v <= SBC_MAX_QTY;
    if (!qtyOk) bad('qty', 'QTY_INVALID'); else out.qty = v;

    v = raw.discountPaise;
    if (v === undefined) v = 0;
    discOk = isInt(v) && v >= 0;
    if (!discOk) bad('discountPaise', 'DISCOUNT_INVALID');
    else {
      out.discountPaise = v;
      if (priceOk && qtyOk && out.unitPricePaise * out.qty <= SBC_MAX_LINE_PAISE && v > out.unitPricePaise * out.qty) {
        bad('discountPaise', 'DISCOUNT_EXCEEDS_LINE');
      }
    }

    v = raw.noCharge;
    if (v === undefined) v = false;
    if (typeof v !== 'boolean') bad('noCharge', 'INPUT_INVALID');
    else {
      out.noCharge = v;
      if (v && discOk && out.discountPaise > 0) bad('discountPaise', 'NOCHARGE_HAS_DISCOUNT');
    }

    v = raw.ref;
    if (v === undefined) v = '';
    if (typeof v !== 'string' || v.length > SBC_MAX_REF_CHARS || !/^[A-Za-z0-9._:\/#-]*$/.test(v)) bad('ref', 'REF_INVALID');
    else out.ref = v;

    if (priceOk && (out.unitPricePaise > SBC_MAX_LINE_PAISE || (qtyOk && out.unitPricePaise * out.qty > SBC_MAX_LINE_PAISE))) {
      bad('unitPricePaise', 'LINE_TOO_LARGE');
    }
    return { issues: issues, line: issues.length === 0 ? out : null };
  }

  // steps 1 to 5 of the validation order; returns {issues, norm}
  function inspect(input) {
    var issues = [];
    var keys, i, d, lines, outLines, one, bd;
    if (!isPlain(input)) return { issues: [{ lineNo: 0, field: 'input', code: 'INPUT_INVALID' }] };
    keys = Object.keys(input);
    for (i = 0; i < keys.length; i += 1) {
      if (!inList(SBC_TOP_KEYS, keys[i])) issues.push({ lineNo: 0, field: keys[i], code: 'INPUT_INVALID' });
    }
    if (issues.length) return { issues: issues };
    d = decideCore(input.sellerStateCode, input.recipientStateCode, input.recipientGstin);
    if (!d.ok) return { issues: [{ lineNo: 0, field: d.field, code: d.fail.code }] };
    lines = input.lines;
    if (!Array.isArray(lines) || lines.length === 0) return { issues: [{ lineNo: 0, field: 'lines', code: 'LINES_REQUIRED' }] };
    if (lines.length > SBC_MAX_LINES) return { issues: [{ lineNo: 0, field: 'lines', code: 'TOO_MANY_LINES' }] };
    outLines = [];
    for (i = 0; i < lines.length; i += 1) {
      one = checkLine(lines[i], i + 1);
      if (one.issues.length) issues = issues.concat(one.issues);
      else outLines.push(one.line);
    }
    bd = input.billDiscountPaise;
    if (bd === undefined) bd = 0;
    if (!isInt(bd) || bd < 0) issues.push({ lineNo: 0, field: 'billDiscountPaise', code: 'BILL_DISCOUNT_INVALID' });
    if (issues.length) return { issues: issues };
    return {
      issues: [],
      norm: {
        lines: outLines, billDiscountPaise: bd, sellerStateCode: d.sellerStateCode,
        recipientStateCode: d.recipientStateCode, recipientGstin: d.recipientGstin, decision: d
      }
    };
  }

  function failFromIssues(issues) {
    var first = issues[0];
    var detail = { field: first.field };
    var r;
    if (first.lineNo > 0) detail = { lineNo: first.lineNo, field: first.field };
    r = fail(first.code, detail);
    r.issues = issues;
    return r;
  }

  function checkBillInput(input) {
    var r = inspect(input);
    if (r.issues.length) return failFromIssues(r.issues);
    return { ok: true };
  }

  // ---- the bill ----

  function emptySums() {
    return { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0, totalPaise: 0 };
  }

  function addFig(target, ln) {
    target.taxablePaise += ln.taxablePaise;
    target.cgstPaise += ln.cgstPaise;
    target.sgstPaise += ln.sgstPaise;
    target.igstPaise += ln.igstPaise;
    target.taxPaise += ln.taxPaise;
    target.totalPaise += ln.totalPaise;
  }

  function computeBillUnsafe(input) {
    var ins = inspect(input);
    var norm, dec, lines, i, src, listAmt, afterDisc, payWeight, weightSum, discount, al, shares, s, e, netAmt, taxable, tax, cgst, sgst, igst, ln;
    var out, sums, rate, groups, hsns, g, j, split, warnings, noChargeCount, anyChargeable, key;
    if (ins.issues.length) return failFromIssues(ins.issues);
    norm = ins.norm;
    dec = norm.decision;
    lines = norm.lines;
    weightSum = 0;
    out = [];
    for (i = 0; i < lines.length; i += 1) {
      src = lines[i];
      listAmt = src.unitPricePaise * src.qty;
      if (src.noCharge) {
        afterDisc = 0;
        payWeight = 0;
      } else {
        afterDisc = listAmt - src.discountPaise;
        payWeight = src.priceBasis === 'INCL' ? afterDisc : afterDisc + rdiv(afterDisc * src.rateBp, 10000);
      }
      weightSum += payWeight;
      out.push({ listAmt: listAmt, afterDisc: afterDisc, payWeight: payWeight });
    }
    if (weightSum > SBC_MAX_BILL_PAISE) return fail('BILL_TOO_LARGE', { weightPaise: weightSum });
    discount = norm.billDiscountPaise;
    if (discount > weightSum) return fail('DISCOUNT_EXCEEDS_BILL', { billDiscountPaise: discount, payablePaise: weightSum });
    if (discount > 0) {
      al = allocateProportional(discount, out.map(function (o) { return o.payWeight; }));
      if (!al.ok) return al;
      shares = al.parts;
    } else {
      shares = out.map(function () { return 0; });
    }
    sums = emptySums();
    sums.listPaise = 0;
    sums.lineDiscountPaise = 0;
    sums.linesTotalPaise = 0;
    split = { part: { taxablePaise: 0, totalPaise: 0 }, labour: { taxablePaise: 0, totalPaise: 0 }, other: { taxablePaise: 0, totalPaise: 0 } };
    groups = [];
    hsns = [];
    warnings = [];
    noChargeCount = 0;
    anyChargeable = false;
    var billLines = [];
    for (i = 0; i < lines.length; i += 1) {
      src = lines[i];
      listAmt = out[i].listAmt;
      afterDisc = out[i].afterDisc;
      payWeight = out[i].payWeight;
      s = shares[i];
      if (src.noCharge) {
        netAmt = 0; taxable = 0; tax = 0;
        noChargeCount += 1;
      } else if (src.priceBasis === 'INCL') {
        netAmt = afterDisc - s;
        taxable = rdiv(netAmt * 10000, 10000 + src.rateBp);
        tax = netAmt - taxable;
      } else {
        e = s === payWeight ? afterDisc : Math.min(afterDisc, rdiv(s * 10000, 10000 + src.rateBp));
        netAmt = afterDisc - e;
        taxable = netAmt;
        tax = rdiv(netAmt * src.rateBp, 10000);
      }
      if (dec.supplyType === 'INTRA') {
        cgst = idiv(tax + 1, 2);
        sgst = tax - cgst;
        igst = 0;
      } else {
        cgst = 0; sgst = 0; igst = tax;
      }
      ln = {
        lineNo: i + 1, kind: src.kind, other: src.kind === 'OTHER', code: src.code, name: src.name, hsnSac: src.hsnSac, rateBp: src.rateBp,
        priceBasis: src.priceBasis, noCharge: src.noCharge, qty: src.qty, unitPricePaise: src.unitPricePaise, ref: src.ref,
        listPaise: listAmt, lineDiscountPaise: src.noCharge ? 0 : src.discountPaise, priceAfterLineDiscountPaise: afterDisc, payableWeightPaise: payWeight,
        billDiscountSharePaise: s, netPaise: netAmt, taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
        taxPaise: tax, totalPaise: taxable + tax
      };
      billLines.push(ln);
      addFig(sums, ln);
      sums.listPaise += listAmt;
      sums.lineDiscountPaise += ln.lineDiscountPaise;
      sums.linesTotalPaise += ln.totalPaise;
      key = src.kind === 'PART' ? 'part' : (src.kind === 'LABOUR' ? 'labour' : 'other');
      split[key].taxablePaise += taxable;
      split[key].totalPaise += ln.totalPaise;
      if (src.kind === 'OTHER') warnings.push({ code: 'OTHER_LINE_PRESENT', lineNo: i + 1 });
      if (src.unitPricePaise === 0 && !src.noCharge) warnings.push({ code: 'PRICE_ZERO', lineNo: i + 1 });
      if (src.rateBp > SBC_UNUSUAL_RATE_BP) warnings.push({ code: 'RATE_UNUSUAL', lineNo: i + 1 });
      if (!src.noCharge) {
        anyChargeable = true;
        rate = -1;
        for (j = 0; j < groups.length; j += 1) if (groups[j].rateBp === src.rateBp) rate = j;
        if (rate < 0) {
          g = emptySums();
          g.rateBp = src.rateBp;
          groups.push(g);
          rate = groups.length - 1;
        }
        addFig(groups[rate], ln);
        rate = -1;
        for (j = 0; j < hsns.length; j += 1) if (hsns[j].hsnSac === src.hsnSac && hsns[j].rateBp === src.rateBp) rate = j;
        if (rate < 0) {
          g = emptySums();
          g.hsnSac = src.hsnSac;
          g.rateBp = src.rateBp;
          g.qty = 0;
          hsns.push(g);
          rate = hsns.length - 1;
        }
        addFig(hsns[rate], ln);
        hsns[rate].qty += src.qty;
      }
    }
    groups.sort(function (a, b) { return a.rateBp - b.rateBp; });
    hsns.sort(function (a, b) {
      if (a.hsnSac !== b.hsnSac) return a.hsnSac < b.hsnSac ? -1 : 1;
      return a.rateBp - b.rateBp;
    });
    var rateGroups = groups.map(function (x) {
      return {
        rateBp: x.rateBp, taxablePaise: x.taxablePaise, cgstPaise: x.cgstPaise, sgstPaise: x.sgstPaise,
        igstPaise: x.igstPaise, taxPaise: x.taxPaise, totalPaise: x.totalPaise
      };
    });
    var hsnSummary = hsns.map(function (x) {
      return {
        hsnSac: x.hsnSac, rateBp: x.rateBp, qty: x.qty, taxablePaise: x.taxablePaise, cgstPaise: x.cgstPaise,
        sgstPaise: x.sgstPaise, igstPaise: x.igstPaise, taxPaise: x.taxPaise
      };
    });
    var grand = rdiv(sums.linesTotalPaise, 100) * 100;
    var isNoCharge = lines.length > 0 && noChargeCount === lines.length;
    if (grand === 0 && !isNoCharge) warnings.push({ code: 'ZERO_VALUE_BILL' });
    if (dec.reason === 'UNREGISTERED' && norm.recipientStateCode !== norm.sellerStateCode) {
      warnings.push({ code: 'OTHER_STATE_UNREGISTERED_INTRA' });
    }
    return {
      ok: true,
      calcVersion: SBC_CALC_VERSION,
      input: {
        lines: lines.map(function (x) {
          return {
            kind: x.kind, code: x.code, name: x.name, hsnSac: x.hsnSac, rateBp: x.rateBp, priceBasis: x.priceBasis,
            unitPricePaise: x.unitPricePaise, qty: x.qty, discountPaise: x.discountPaise, noCharge: x.noCharge, ref: x.ref
          };
        }),
        billDiscountPaise: discount,
        sellerStateCode: norm.sellerStateCode,
        recipientStateCode: norm.recipientStateCode,
        recipientGstin: norm.recipientGstin
      },
      supply: {
        type: dec.supplyType, sellerStateCode: norm.sellerStateCode, placeOfSupplyStateCode: dec.placeOfSupplyStateCode,
        recipientGstin: dec.recipientGstin, reason: dec.reason
      },
      lines: billLines,
      rateGroups: rateGroups,
      hsnSummary: hsnSummary,
      split: split,
      totals: {
        listPaise: sums.listPaise, lineDiscountPaise: sums.lineDiscountPaise, billDiscountPaise: discount,
        taxablePaise: sums.taxablePaise, cgstPaise: sums.cgstPaise, sgstPaise: sums.sgstPaise, igstPaise: sums.igstPaise,
        taxPaise: sums.taxPaise, linesTotalPaise: sums.linesTotalPaise, roundOffPaise: grand - sums.linesTotalPaise,
        totalPaise: grand
      },
      isNoCharge: isNoCharge,
      warnings: warnings
    };
  }

  // a copy of the input with another bill discount, never touching the original
  function withDiscount(input, d) {
    var o = {};
    var keys = Object.keys(input);
    var i;
    for (i = 0; i < keys.length; i += 1) o[keys[i]] = input[keys[i]];
    o.billDiscountPaise = d;
    return o;
  }

  function solveBillDiscountUnsafe(input, target) {
    var base, discount, i, b;
    if (!isInt(target) || target < 0 || target % 100 !== 0) return fail('TARGET_INVALID');
    if (!isPlain(input)) return fail('INPUT_INVALID');
    if (input.billDiscountPaise !== undefined && input.billDiscountPaise !== 0) return fail('INPUT_INVALID', { field: 'billDiscountPaise' });
    base = computeBillUnsafe(input);
    if (!base.ok) return base;
    if (target > base.totals.totalPaise) return fail('TARGET_ABOVE_TOTAL');
    if (target === base.totals.totalPaise) return { ok: true, billDiscountPaise: 0, bill: base };
    discount = Math.max(0, base.totals.linesTotalPaise - target);
    for (i = 0; i < 6; i += 1) {
      b = computeBillUnsafe(withDiscount(input, discount));
      if (!b.ok) return fail('TARGET_NOT_REACHABLE');
      if (b.totals.totalPaise === target) return { ok: true, billDiscountPaise: discount, bill: b };
      discount = discount + (b.totals.totalPaise - target);
      if (discount < 0) return fail('TARGET_NOT_REACHABLE');
    }
    return fail('TARGET_NOT_REACHABLE');
  }

  // first path where two values differ, or '' when equal
  function diffPath(exp, act, path) {
    var keys, i, k, d;
    if (exp === act) return '';
    if (exp === null || typeof exp !== 'object') return path;
    if (act === null || typeof act !== 'object' || Array.isArray(exp) !== Array.isArray(act)) return path;
    if (Array.isArray(exp)) {
      if (exp.length !== act.length) return path + '.length';
      for (i = 0; i < exp.length; i += 1) {
        d = diffPath(exp[i], act[i], path + '[' + i + ']');
        if (d) return d;
      }
      return '';
    }
    keys = Object.keys(exp);
    for (i = 0; i < keys.length; i += 1) {
      k = keys[i];
      if (!hasOwn(act, k)) return path + '.' + k;
      d = diffPath(exp[k], act[k], path + '.' + k);
      if (d) return d;
    }
    keys = Object.keys(act);
    for (i = 0; i < keys.length; i += 1) if (!hasOwn(exp, keys[i])) return path + '.' + keys[i];
    return '';
  }

  var SBC_VERIFY_FIELDS = ['input', 'supply', 'lines', 'rateGroups', 'hsnSummary', 'totals', 'split', 'isNoCharge', 'warnings'];

  function verifyBillUnsafe(bill) {
    var again, i, d;
    if (!isPlain(bill) || bill.ok !== true || typeof bill.calcVersion !== 'string') return fail('BILL_RECORD_INVALID');
    if (bill.calcVersion !== SBC_CALC_VERSION) return fail('CALC_VERSION_UNKNOWN', { calcVersion: bill.calcVersion });
    if (!isPlain(bill.input)) return fail('BILL_RECORD_INVALID');
    again = computeBillUnsafe(bill.input);
    if (!again.ok) return fail('BILL_MISMATCH', { path: 'input', code: again.code });
    for (i = 0; i < SBC_VERIFY_FIELDS.length; i += 1) {
      d = diffPath(again[SBC_VERIFY_FIELDS[i]], bill[SBC_VERIFY_FIELDS[i]], SBC_VERIFY_FIELDS[i]);
      if (d) return fail('BILL_MISMATCH', { path: d });
    }
    return { ok: true };
  }

  function approvalCheck(o) {
    var a, t;
    if (!isPlain(o)) return fail('APPROVAL_INVALID');
    a = o.approvedPaise;
    t = o.totalPaise;
    if (!isInt(t) || t < 0) return fail('APPROVAL_INVALID');
    if (a === null) return { ok: true, status: 'NONE', deltaPaise: 0 };
    if (!isInt(a) || a < 0) return fail('APPROVAL_INVALID');
    return { ok: true, status: t > a ? 'ABOVE' : 'WITHIN', deltaPaise: t - a };
  }

  // ---- credit notes ----

  // the figures of an issued bill that a credit note needs; null when the record is not usable
  function billView(bill) {
    var view = { lines: [], supplyType: '', total: 0, linesTotal: 0, isNoCharge: false };
    var i, ln, sum;
    if (!isPlain(bill) || bill.ok !== true || bill.calcVersion !== SBC_CALC_VERSION) return null;
    if (!Array.isArray(bill.lines) || bill.lines.length < 1 || bill.lines.length > SBC_MAX_LINES) return null;
    if (!isPlain(bill.supply) || (bill.supply.type !== 'INTRA' && bill.supply.type !== 'INTER')) return null;
    if (!isPlain(bill.totals) || typeof bill.isNoCharge !== 'boolean') return null;
    view.supplyType = bill.supply.type;
    view.isNoCharge = bill.isNoCharge;
    sum = 0;
    for (i = 0; i < bill.lines.length; i += 1) {
      ln = bill.lines[i];
      if (!isPlain(ln) || ln.lineNo !== i + 1 || typeof ln.noCharge !== 'boolean') return null;
      if (!nonNegInts(ln, ['qty', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise', 'totalPaise'])) return null;
      if (ln.taxPaise !== ln.cgstPaise + ln.sgstPaise + ln.igstPaise || ln.totalPaise !== ln.taxablePaise + ln.taxPaise) return null;
      if (ln.qty > SBC_MAX_QTY) return null;
      sum += ln.totalPaise;
      if (sum > SBC_MAX_BILL_PAISE) return null;
      view.lines.push({
        lineNo: ln.lineNo, noCharge: ln.noCharge, qty: ln.qty, taxablePaise: ln.taxablePaise, cgstPaise: ln.cgstPaise,
        sgstPaise: ln.sgstPaise, igstPaise: ln.igstPaise, taxPaise: ln.taxPaise
      });
    }
    if (!isInt(bill.totals.totalPaise) || bill.totals.totalPaise < 0 || bill.totals.linesTotalPaise !== sum) return null;
    if (bill.totals.totalPaise !== rdiv(sum, 100) * 100) return null;
    view.total = bill.totals.totalPaise;
    view.linesTotal = sum;
    return view;
  }

  function nonNegInts(o, names) {
    var i;
    for (i = 0; i < names.length; i += 1) if (!isInt(o[names[i]]) || o[names[i]] < 0) return false;
    return true;
  }

  // earlier notes taken off the bill line by line; returns {rem, priorLines, priorTotal} or a failure
  function remainders(view, priors) {
    var rem = [];
    var priorLines = 0;
    var priorTotal = 0;
    var i, j, p, pl, r, lsum;
    var bad = fail('CREDIT_PRIOR_INVALID');
    if (!Array.isArray(priors) || priors.length > SBC_MAX_ITEMS) return bad;
    for (i = 0; i < view.lines.length; i += 1) {
      r = view.lines[i];
      rem.push({
        qty: r.qty, taxablePaise: r.taxablePaise, cgstPaise: r.cgstPaise, sgstPaise: r.sgstPaise, igstPaise: r.igstPaise,
        taxPaise: r.taxPaise
      });
    }
    for (i = 0; i < priors.length; i += 1) {
      p = priors[i];
      if (!isPlain(p) || !Array.isArray(p.lines) || !isInt(p.linesTotalPaise) || !isInt(p.totalPaise) || p.totalPaise < 0) return bad;
      lsum = 0;
      for (j = 0; j < p.lines.length; j += 1) {
        pl = p.lines[j];
        if (!isPlain(pl) || !isInt(pl.lineNo) || pl.lineNo < 1 || pl.lineNo > rem.length) return bad;
        if (!nonNegInts(pl, ['qty', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise', 'totalPaise'])) return bad;
        if (pl.taxPaise !== pl.cgstPaise + pl.sgstPaise + pl.igstPaise || pl.totalPaise !== pl.taxablePaise + pl.taxPaise) return bad;
        r = rem[pl.lineNo - 1];
        r.qty -= pl.qty;
        r.taxablePaise -= pl.taxablePaise;
        r.cgstPaise -= pl.cgstPaise;
        r.sgstPaise -= pl.sgstPaise;
        r.igstPaise -= pl.igstPaise;
        r.taxPaise -= pl.taxPaise;
        if (r.qty < 0 || r.taxablePaise < 0 || r.cgstPaise < 0 || r.sgstPaise < 0 || r.igstPaise < 0 || r.taxPaise < 0) return bad;
        lsum += pl.totalPaise;
      }
      if (lsum !== p.linesTotalPaise) return bad;
      priorLines += p.linesTotalPaise;
      priorTotal += p.totalPaise;
    }
    if (priorTotal !== rdiv(priorLines, 100) * 100 || priorTotal > view.total) return bad;
    return { ok: true, rem: rem, priorLines: priorLines, priorTotal: priorTotal };
  }

  function creditRemainingUnsafe(bill, priors) {
    var view = billView(bill);
    var rr, i, lines;
    if (!view) return fail('CREDIT_BILL_INVALID');
    rr = remainders(view, priors);
    if (!rr.ok) return rr;
    lines = [];
    for (i = 0; i < rr.rem.length; i += 1) {
      lines.push({
        lineNo: i + 1, qty: rr.rem[i].qty, taxablePaise: rr.rem[i].taxablePaise, cgstPaise: rr.rem[i].cgstPaise,
        sgstPaise: rr.rem[i].sgstPaise, igstPaise: rr.rem[i].igstPaise, taxPaise: rr.rem[i].taxPaise
      });
    }
    return { ok: true, lines: lines, billRemainingPaise: view.total - rr.priorTotal };
  }

  // split the tax of one credit line without taking more CGST or SGST than the invoice still has
  function splitCreditTax(tax, r, supplyType) {
    var cgst, sgst;
    if (supplyType === 'INTER') return { cgstPaise: 0, sgstPaise: 0, igstPaise: tax };
    cgst = Math.min(idiv(tax + 1, 2), r.cgstPaise);
    sgst = tax - cgst;
    if (sgst > r.sgstPaise) {
      sgst = r.sgstPaise;
      cgst = tax - sgst;
    }
    return { cgstPaise: cgst, sgstPaise: sgst, igstPaise: 0 };
  }

  function creditLine(lineNo, qty, taxable, tax, r, supplyType) {
    var sp = splitCreditTax(tax, r, supplyType);
    return {
      lineNo: lineNo, qty: qty, taxablePaise: taxable, cgstPaise: sp.cgstPaise, sgstPaise: sp.sgstPaise, igstPaise: sp.igstPaise,
      taxPaise: tax, totalPaise: taxable + tax
    };
  }

  function creditFromRequest(view, rem, request) {
    var out = [];
    var seen = {};
    var i, q, r, el, keys, j, hasQty, hasTax, n, taxable, tax, lineNo;
    if (!isPlain(request)) return fail('CREDIT_REQUEST_INVALID');
    if (request.kind === 'FULL') {
      if (Object.keys(request).length !== 1) return fail('CREDIT_REQUEST_INVALID');
      for (i = 0; i < view.lines.length; i += 1) {
        r = rem[i];
        if (view.lines[i].noCharge) continue;
        if (r.qty > 0 || r.taxablePaise > 0 || r.taxPaise > 0) {
          out.push(creditLine(i + 1, r.qty, r.taxablePaise, r.taxPaise, r, view.supplyType));
        }
      }
      return { ok: true, kind: 'FULL', lines: out };
    }
    if (request.kind !== 'LINES' || !Array.isArray(request.lines) || Object.keys(request).length !== 2) return fail('CREDIT_REQUEST_INVALID');
    if (request.lines.length > SBC_MAX_LINES) return fail('CREDIT_REQUEST_INVALID');
    for (i = 0; i < request.lines.length; i += 1) {
      el = request.lines[i];
      if (!isPlain(el)) return fail('CREDIT_REQUEST_INVALID', { index: i });
      keys = Object.keys(el);
      for (j = 0; j < keys.length; j += 1) {
        if (keys[j] !== 'lineNo' && keys[j] !== 'qty' && keys[j] !== 'taxablePaise') return fail('CREDIT_REQUEST_INVALID', { index: i });
      }
      lineNo = el.lineNo;
      if (!isInt(lineNo) || lineNo < 1) return fail('CREDIT_REQUEST_INVALID', { index: i });
      if (lineNo > view.lines.length) return fail('CREDIT_LINE_UNKNOWN', { lineNo: lineNo });
      if (seen[lineNo] === true) return fail('CREDIT_DUPLICATE_LINE', { lineNo: lineNo });
      seen[lineNo] = true;
      if (view.lines[lineNo - 1].noCharge) return fail('CREDIT_LINE_NOCHARGE', { lineNo: lineNo });
      r = rem[lineNo - 1];
      hasQty = el.qty !== undefined;
      hasTax = el.taxablePaise !== undefined;
      if (hasQty === hasTax) return fail('CREDIT_KIND_CONFLICT', { lineNo: lineNo });
      if (hasQty) {
        q = el.qty;
        if (!isInt(q) || q < 1) return fail('CREDIT_QTY_INVALID', { lineNo: lineNo });
        if (q > r.qty) return fail('CREDIT_EXCEEDS_LINE', { lineNo: lineNo });
        if (q === r.qty) {
          taxable = r.taxablePaise;
          tax = r.taxPaise;
        } else {
          taxable = rdiv(r.taxablePaise * q, r.qty);
          tax = rdiv(r.taxPaise * q, r.qty);
        }
        out.push({ line: creditLine(lineNo, q, taxable, tax, r, view.supplyType) });
      } else {
        n = el.taxablePaise;
        if (!isInt(n) || n < 1) return fail('CREDIT_TAXABLE_INVALID', { lineNo: lineNo });
        if (n > r.taxablePaise) return fail('CREDIT_EXCEEDS_TAXABLE', { lineNo: lineNo });
        tax = n === r.taxablePaise ? r.taxPaise : rdiv(r.taxPaise * n, r.taxablePaise);
        out.push({ line: creditLine(lineNo, 0, n, tax, r, view.supplyType) });
      }
    }
    out = out.map(function (x) { return x.line; });
    out.sort(function (a, b) { return a.lineNo - b.lineNo; });
    return { ok: true, kind: 'LINES', lines: out };
  }

  function computeCreditNoteUnsafe(bill, request, priors) {
    var view = billView(bill);
    var rr, cr, lines, i, ln, sum, cum, total, tot, after, rm, qtyBack;
    if (!view) return fail('CREDIT_BILL_INVALID');
    if (view.isNoCharge) return fail('NOCHARGE_NO_CREDIT');
    rr = remainders(view, priors);
    if (!rr.ok) return rr;
    cr = creditFromRequest(view, rr.rem, request);
    if (!cr.ok) return cr;
    lines = cr.lines;
    tot = emptySums();
    sum = 0;
    qtyBack = 0;
    for (i = 0; i < lines.length; i += 1) {
      ln = lines[i];
      addFig(tot, ln);
      sum += ln.totalPaise;
      qtyBack += ln.qty;
    }
    // a note with no money is allowed only when it takes goods back (so they can return to stock)
    if (lines.length === 0 || (sum === 0 && qtyBack === 0)) return fail('CREDIT_NOTHING');
    cum = rdiv(rr.priorLines + sum, 100) * 100;
    if (cum > view.total) return fail('CREDIT_EXCEEDS_REMAINING');
    total = cum - rr.priorTotal;
    after = [];
    for (i = 0; i < rr.rem.length; i += 1) {
      rm = rr.rem[i];
      after.push({ lineNo: i + 1, qty: rm.qty, taxablePaise: rm.taxablePaise, taxPaise: rm.taxPaise });
    }
    for (i = 0; i < lines.length; i += 1) {
      ln = lines[i];
      after[ln.lineNo - 1].qty -= ln.qty;
      after[ln.lineNo - 1].taxablePaise -= ln.taxablePaise;
      after[ln.lineNo - 1].taxPaise -= ln.taxPaise;
    }
    return {
      ok: true,
      kind: cr.kind,
      lines: lines,
      linesTotalPaise: sum,
      taxablePaise: tot.taxablePaise,
      cgstPaise: tot.cgstPaise,
      sgstPaise: tot.sgstPaise,
      igstPaise: tot.igstPaise,
      taxPaise: tot.taxPaise,
      roundOffPaise: total - sum,
      totalPaise: total,
      remainingAfter: { lines: after, billRemainingPaise: view.total - rr.priorTotal - total }
    };
  }

  // ---- balance, advance set-off, refund ----

  function sumMoney(list) {
    var s = 0;
    var i;
    if (list === undefined) return 0;
    if (!Array.isArray(list) || list.length > SBC_MAX_ITEMS) return -1;
    for (i = 0; i < list.length; i += 1) {
      if (!isInt(list[i]) || list[i] < 0 || list[i] > SBC_MAX_MONEY) return -1;
      s += list[i];
    }
    return s;
  }

  function settle(input) {
    var keys, i, payable, credit, received, refunded, netPayable, netReceived, applied, balance, refund, status;
    if (!isPlain(input)) return fail('SETTLE_INVALID');
    keys = Object.keys(input);
    for (i = 0; i < keys.length; i += 1) {
      if (keys[i] !== 'payablePaise' && keys[i] !== 'receiptsPaise' && keys[i] !== 'refundsPaise' && keys[i] !== 'creditTotalPaise') {
        return fail('SETTLE_INVALID', { field: keys[i] });
      }
    }
    payable = input.payablePaise;
    credit = input.creditTotalPaise === undefined ? 0 : input.creditTotalPaise;
    if (!isInt(payable) || payable < 0 || payable > SBC_MAX_MONEY) return fail('SETTLE_INVALID', { field: 'payablePaise' });
    if (!isInt(credit) || credit < 0 || credit > SBC_MAX_MONEY) return fail('SETTLE_INVALID', { field: 'creditTotalPaise' });
    if (!Array.isArray(input.receiptsPaise)) return fail('SETTLE_INVALID', { field: 'receiptsPaise' });
    received = sumMoney(input.receiptsPaise);
    if (received < 0) return fail('SETTLE_INVALID', { field: 'receiptsPaise' });
    refunded = sumMoney(input.refundsPaise);
    if (refunded < 0) return fail('SETTLE_INVALID', { field: 'refundsPaise' });
    if (credit > payable) return fail('CREDIT_EXCEEDS_INVOICE');
    if (refunded > received) return fail('REFUNDS_EXCEED_RECEIPTS');
    netPayable = payable - credit;
    netReceived = received - refunded;
    applied = Math.min(netReceived, netPayable);
    balance = Math.max(0, netPayable - netReceived);
    refund = Math.max(0, netReceived - netPayable);
    if (refund > 0) status = 'OVERPAID';
    else if (balance === 0) status = 'PAID';
    else if (netReceived > 0) status = 'PART_PAID';
    else status = 'UNPAID';
    return {
      ok: true, payablePaise: payable, creditTotalPaise: credit, netPayablePaise: netPayable, receivedPaise: received,
      refundedPaise: refunded, netReceivedPaise: netReceived, appliedPaise: applied, balanceDuePaise: balance,
      refundDuePaise: refund, status: status
    };
  }

  // ---- old (version 1) jobs ----

  function legacyBlank(v) {
    return v === undefined || v === null || (typeof v === 'string' && trimText(v) === '');
  }

  function legacyQty(v) {
    var t;
    if (typeof v === 'number') {
      if (!isInt(v)) return { code: isFinite(v) ? 'LEGACY_QTY_FRACTION' : 'LEGACY_INVALID' };
      return v >= 1 && v <= SBC_MAX_QTY ? { qty: v } : { code: 'LEGACY_INVALID' };
    }
    if (typeof v !== 'string') return { code: 'LEGACY_INVALID' };
    t = trimText(v);
    if (/^\d+(\.0+)?$/.test(t)) {
      t = parseInt(t.replace(/\..*$/, ''), 10);
      return t >= 1 && t <= SBC_MAX_QTY ? { qty: t } : { code: 'LEGACY_INVALID' };
    }
    if (/^\d*\.\d+$/.test(t)) return { code: 'LEGACY_QTY_FRACTION' };
    return { code: 'LEGACY_INVALID' };
  }

  function legacyLinesToInputUnsafe(lineItems, gstText) {
    var warnings = [];
    var lines = [];
    var rate = 0;
    var i, it, desc, q, unit, total, u, t, p;
    if (!Array.isArray(lineItems) || lineItems.length > SBC_MAX_ITEMS) return fail('LEGACY_INVALID');
    if (legacyBlank(gstText)) {
      warnings.push({ code: 'LEGACY_GST_BLANK' });
    } else {
      p = percentToBp(typeof gstText === 'number' ? gstText : String(gstText));
      if (!p.ok) return p;
      rate = p.bp;
    }
    for (i = 0; i < lineItems.length; i += 1) {
      it = lineItems[i];
      if (!isPlain(it)) return fail('LEGACY_INVALID', { lineNo: i + 1 });
      desc = typeof it.desc === 'string' ? trimText(it.desc) : '';
      if (desc === '') continue;
      q = legacyQty(it.qty);
      if (q.code) return fail(q.code, { lineNo: i + 1 });
      unit = it.unit;
      total = it.total;
      if (!legacyBlank(unit)) {
        u = rupeesToPaise(unit);
        if (!u.ok) return fail('AMOUNT_INVALID', { lineNo: i + 1 });
        u = u.paise;
      } else if (!legacyBlank(total)) {
        t = rupeesToPaise(total);
        if (!t.ok || t.paise % q.qty !== 0) return fail('AMOUNT_INVALID', { lineNo: i + 1 });
        u = t.paise / q.qty;
      } else {
        return fail('AMOUNT_INVALID', { lineNo: i + 1 });
      }
      lines.push({
        kind: 'OTHER', code: '', name: desc, hsnSac: '', rateBp: rate, priceBasis: 'EXCL', unitPricePaise: u, qty: q.qty
      });
    }
    return { ok: true, lines: lines, warnings: warnings };
  }

  function rupeeInt(v, optional) {
    if (v === undefined && optional) return 0;
    if (!isInt(v) || Math.abs(v) > SBC_MAX_LEGACY_RUPEES) return null;
    return v;
  }

  function fromLegacyFigsUnsafe(figs) {
    var taxable, gst, cgst, sgst, total, adj, ro;
    if (!isPlain(figs)) return fail('LEGACY_INVALID');
    taxable = rupeeInt(figs.taxable, false);
    gst = rupeeInt(figs.gst, false);
    cgst = rupeeInt(figs.cgst, false);
    sgst = rupeeInt(figs.sgst, false);
    total = rupeeInt(figs.total, false);
    adj = rupeeInt(figs.adjustment, true);
    ro = rupeeInt(figs.roundOff, true);
    if (taxable === null || gst === null || cgst === null || sgst === null || total === null || adj === null || ro === null) {
      return fail('LEGACY_INVALID');
    }
    return {
      ok: true, taxablePaise: taxable * 100, cgstPaise: cgst * 100, sgstPaise: sgst * 100, igstPaise: 0, taxPaise: gst * 100,
      roundOffPaise: ro * 100, totalPaise: total * 100, discountPaise: adj < 0 ? -adj * 100 : 0, additionalPaise: adj > 0 ? adj * 100 : 0
    };
  }

  return Object.freeze({
    CALC_VERSION: SBC_CALC_VERSION,
    LIMITS: SBC_LIMITS,
    STATE_CODES: SBC_STATE_CODES,
    CODES: SBC_CODES,
    MESSAGES: SBC_MESSAGES,
    GSTIN_CHECKSUM_HARD: SBC_GSTIN_HARD,
    divRound: wrap(divRoundPublic, null),
    rupeesToPaise: wrap(rupeesToPaise),
    paiseToRupeesText: wrap(paiseToRupeesText, ''),
    percentToBp: wrap(percentToBp),
    percentOfPaise: wrap(percentOfPaise),
    gstinCheckChar: wrap(gstinCheckChar, ''),
    validateGstin: wrap(validateGstin),
    decideSupply: wrap(decideSupply),
    allocateProportional: wrap(allocateProportional),
    checkBillInput: wrap(checkBillInput),
    computeBill: wrap(computeBillUnsafe),
    solveBillDiscount: wrap(solveBillDiscountUnsafe),
    verifyBill: wrap(verifyBillUnsafe),
    approvalCheck: wrap(approvalCheck),
    creditRemaining: wrap(creditRemainingUnsafe),
    computeCreditNote: wrap(computeCreditNoteUnsafe),
    settle: wrap(settle),
    legacyLinesToInput: wrap(legacyLinesToInputUnsafe),
    fromLegacyFigs: wrap(fromLegacyFigsUnsafe)
  });
});
