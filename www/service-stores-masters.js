(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceMasters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Parts master and labour master for Service Stores (Phase 1).
  // Pure logic. Every write goes through the opened Stores store (parts and labour streams).
  // No storage calls, no clock, no hashing, no DOM here. Money is integer paise, GST is integer basis points.

  var MASTERS_VERSION = 1;
  var STREAM_OF = Object.freeze({ part: 'parts', labour: 'labour' });
  var RECORD_KINDS = Object.freeze({
    part: Object.freeze({ create: 'PART_CREATE', edit: 'PART_EDIT', deactivate: 'PART_DEACTIVATE', reactivate: 'PART_REACTIVATE', remove: 'PART_REMOVE' }),
    labour: Object.freeze({ create: 'LAB_CREATE', edit: 'LAB_EDIT', deactivate: 'LAB_DEACTIVATE', reactivate: 'LAB_REACTIVATE', remove: 'LAB_REMOVE' })
  });
  var CODE_PATTERN = /^[A-Z0-9][A-Z0-9._\/-]{0,39}$/;
  var UNITS = Object.freeze({ part: Object.freeze(['pc', 'set', 'pair', 'pack']), labour: Object.freeze(['job', 'hour', 'pc']) });
  var FLAG_KEYS = Object.freeze(['battery', 'strap', 'glass', 'crown', 'movement', 'warrantyClaimable', 'counterSaleable']);
  var SENSITIVE_FIELDS = Object.freeze(['sellPricePaise', 'ratePaise', 'gstRateBp', 'hsn', 'sac', 'priceIncludesTax']);
  var TEMPLATE_HEADERS = Object.freeze({
    part: Object.freeze(['code', 'name', 'group', 'unit', 'hsn', 'gst_rate', 'sell_price', 'price_includes_tax', 'reorder_level', 'reorder_qty', 'bin', 'flags']),
    labour: Object.freeze(['code', 'name', 'group', 'unit', 'sac', 'gst_rate', 'rate', 'price_includes_tax'])
  });
  var TEMPLATE_FLAG_TOKENS = Object.freeze({
    battery: 'battery', strap: 'strap', glass: 'glass', crown: 'crown', movement: 'movement',
    warranty_claimable: 'warrantyClaimable', counter_saleable: 'counterSaleable'
  });
  var MAX_ROWS = 10000;
  var MAX_TEMPLATE_ROWS = 200;
  var MAX_TEMPLATE_CHARS = 100000;
  var MAX_PRICE_PAISE = 1000000000;
  var MAX_REORDER = 100000;
  var STEP_UP_WINDOW_MS = 120000;
  var REASON_MIN = 5;
  var REASON_MAX = 200;
  var CLIENT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{2,63}$/;

  var META_FIELDS = Object.freeze(['rev', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deactivatedAt', 'deactivatedBy', 'deactivateReason', 'source', 'batchId', 'kind']);

  // ---------------------------------------------------------------- codes and English messages
  var CODE_TABLE = [
    ['PART_CODE_REQUIRED', 'A code is required.'],
    ['PART_CODE_INVALID', 'The code may use letters, digits, dot, slash, underscore and hyphen only, up to 40 characters, with no spaces.'],
    ['PART_CODE_SCIENTIFIC', 'This code looks like a number that Excel changed to scientific form. Type it as text.'],
    ['PART_CODE_DUPLICATE', 'This code already exists.'],
    ['PART_CODE_ZERO_VARIANT', 'Another code is the same except for leading zeros.'],
    ['CODE_CHANGE_NOT_ALLOWED', 'A code can never be changed after it is created.'],
    ['NAME_REQUIRED', 'A name is required.'],
    ['NAME_INVALID', 'The name must be 1 to 80 characters, with no control characters, and must not start with = or @.'],
    ['GROUP_REQUIRED', 'A group is required.'],
    ['GROUP_INVALID', 'The group must be 1 to 40 characters, with no control characters, and must not start with = or @.'],
    ['UNIT_INVALID', 'This unit is not allowed for this kind of item.'],
    ['HSN_INVALID', 'HSN must be blank or 4, 6 or 8 digits.'],
    ['SAC_INVALID', 'SAC must be blank or 4 or 6 digits.'],
    ['GST_RATE_INVALID', 'GST rate must be blank or between 0 and 100 percent with at most 2 decimals.'],
    ['PRICE_INVALID', 'The price must be a whole number of paise from 0 to 1,000,000,000.'],
    ['PRICE_BASIS_REQUIRED', 'Choose whether the price includes tax.'],
    ['PRICE_BASIS_INVALID', 'Price includes tax must be yes or no.'],
    ['REORDER_INVALID', 'Reorder numbers must be whole numbers from 0 to 100000.'],
    ['BIN_INVALID', 'The bin may use up to 20 letters, digits, spaces, dot, slash, underscore and hyphen.'],
    ['FLAG_INVALID', 'A flag is not known or is not yes or no.'],
    ['NAME_DUPLICATE_WARNING', 'Another active item has the same name.'],
    ['GST_RATE_FRACTION_WARNING', 'This GST rate is below 1 percent. Check that it was not typed as a fraction.'],
    ['PRICE_ZERO_WARNING', 'The price is zero.'],
    ['REORDER_QTY_ZERO_WARNING', 'A reorder level is set but the reorder quantity is zero.'],
    ['STOCK_ON_HAND_WARNING', 'This code has stock on hand. It is now inactive; the stock is still counted.'],
    ['TAX_DETAILS_MISSING', 'Tax details missing: this item cannot be used on an estimate or counter sale yet.'],
    ['NO_CHANGE', 'Nothing changed.'],
    ['REV_CONFLICT', 'Another screen changed this item. Reload and try again.'],
    ['REASON_REQUIRED', 'A reason of at least 5 characters is required.'],
    ['REASON_INVALID', 'The reason may be at most 200 characters.'],
    ['NOT_FOUND', 'This item was not found.'],
    ['ALREADY_INACTIVE', 'This item is already inactive.'],
    ['ALREADY_ACTIVE', 'This item is already active.'],
    ['ACTIVE_NOT_EDITABLE', 'Use deactivate or reactivate to change the active state.'],
    ['HAS_MOVEMENTS', 'This item has stock movements. It can be deactivated but not deleted.'],
    ['HAS_REFERENCES', 'This item is used in another record. It can be deactivated but not deleted.'],
    ['DEPENDENCY_MISSING', 'The stock check needed for this action is not available.'],
    ['MASTER_FULL', 'The master has reached its size limit.'],
    ['ROLE_DENIED', 'Only a Store Manager or the Owner can change the master.'],
    ['SESSION_REQUIRED', 'Service stores are not available for this sign-in.'],
    ['PIN_REQUIRED', 'Owner approval not given. Nothing was changed.'],
    ['ARGS_INVALID', 'The request was not complete.'],
    ['KIND_INVALID', 'The kind of master is not known.'],
    ['PURPOSE_INVALID', 'The purpose is not known.'],
    ['PART_NOT_FOUND', 'This part was not found.'],
    ['PART_INACTIVE', 'This part is inactive.'],
    ['NOT_COUNTER_SALEABLE', 'This part is not marked as counter saleable.'],
    ['TEMPLATE_EMPTY', 'Nothing was pasted.'],
    ['TEMPLATE_HEADER_MISMATCH', 'The first line must be exactly the header shown.'],
    ['TEMPLATE_CUSTOMER_COLUMN', 'The header has a column for personal details. Remove it.'],
    ['TEMPLATE_TOO_LARGE', 'The pasted text is too large.'],
    ['TEMPLATE_TOO_MANY_ROWS', 'Too many rows. Paste at most 200 rows at a time.'],
    ['TEMPLATE_QUOTE_UNBALANCED', 'A quote mark is not closed on this line.'],
    ['TEMPLATE_ROW_WIDTH', 'This row does not have the same number of columns as the header.'],
    ['TEMPLATE_FORMULA_LIKE', 'A text cell must not start with = or @.'],
    ['TEMPLATE_DUPLICATE_IN_FILE', 'The same code appears more than once in the pasted rows.'],
    ['TEMPLATE_NOTHING_TO_CREATE', 'Every code in the pasted rows already exists. Nothing to create.'],
    ['TEMPLATE_HAS_ERRORS', 'The pasted rows have errors. Fix them and check again.']
  ];
  var CODES = {};
  var MESSAGES = {};
  (function buildCodeTables() {
    var i;
    for (i = 0; i < CODE_TABLE.length; i += 1) {
      CODES[CODE_TABLE[i][0]] = CODE_TABLE[i][0];
      MESSAGES[CODE_TABLE[i][0]] = CODE_TABLE[i][1];
    }
  })();
  CODES = Object.freeze(CODES);
  MESSAGES = Object.freeze(MESSAGES);

  // ---------------------------------------------------------------- small helpers
  function masIsInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && Math.abs(n) <= 9007199254740991;
  }
  function masIsObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  function masHas(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }
  function masMessage(code) {
    return MESSAGES[code] || 'The store could not complete this action.';
  }
  function masFail(code, extra) {
    var out = { ok: false, code: code, message: masMessage(code) };
    var k;
    if (extra) {
      for (k in extra) {
        if (masHas(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }
  function masFromStore(res) {
    var code = res && typeof res.code === 'string' ? res.code : 'SVCS_WRITE_FAILED';
    var out = { ok: false, code: code, message: masMessage(code) };
    if (res && res.detail !== undefined) out.detail = res.detail;
    if (res && res.committed === true) out.committed = true;
    return out;
  }
  function masIssue(field, code) {
    return { field: field, code: code, message: masMessage(code) };
  }
  function masCleanText(s) {
    return String(s).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }
  function masHasControl(s) {
    return /[\u0000-\u001f\u007f]/.test(s);
  }
  function masNaturalCompare(a, b) {
    var pa = String(a).match(/\d+|\D+/g) || [];
    var pb = String(b).match(/\d+|\D+/g) || [];
    var i = 0;
    var x;
    var y;
    var tx;
    var ty;
    while (i < pa.length && i < pb.length) {
      x = pa[i];
      y = pb[i];
      if (x !== y) {
        if (/^\d/.test(x) && /^\d/.test(y)) {
          tx = x.replace(/^0+(?=.)/, '');
          ty = y.replace(/^0+(?=.)/, '');
          if (tx.length !== ty.length) return tx.length < ty.length ? -1 : 1;
          if (tx !== ty) return tx < ty ? -1 : 1;
          return x.length < y.length ? -1 : 1;
        }
        return x < y ? -1 : 1;
      }
      i += 1;
    }
    if (pa.length === pb.length) return 0;
    return pa.length < pb.length ? -1 : 1;
  }
  // Two 32-bit FNV style passes joined to a 12 character label. This is a label for a pasted batch, not an integrity hash.
  function masTextLabel(text) {
    var h1 = 0x811c9dc5;
    var h2 = 0x9747b28c;
    var i;
    var c;
    for (i = 0; i < text.length; i += 1) {
      c = text.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0;
      h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
      h2 = (h2 ^ ((c + i) & 0xffff)) >>> 0;
      h2 = (h2 + ((h2 << 1) + (h2 << 4) + (h2 << 7) + (h2 << 8) + (h2 << 24))) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8).slice(0, 4);
  }

  // ---------------------------------------------------------------- public pure helpers
  function normalizeCode(raw) {
    if (typeof raw !== 'string' && typeof raw !== 'number') return '';
    return String(raw).replace(/^\s+|\s+$/g, '').toUpperCase();
  }
  function codeZeroKey(code) {
    return String(code).replace(/^0+(?=.)/, '');
  }
  function parsePercentToBp(text) {
    var s = String(text === undefined || text === null ? '' : text).replace(/\s+/g, '');
    var m;
    var dec;
    var bp;
    if (s.charAt(s.length - 1) === '%') s = s.slice(0, -1);
    if (s === '') return { ok: true, bp: null };
    m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return { ok: false, bp: null };
    dec = m[2] || '';
    while (dec.length < 2) dec += '0';
    bp = parseInt(m[1], 10) * 100 + parseInt(dec, 10);
    if (bp > 10000) return { ok: false, bp: null };
    return { ok: true, bp: bp };
  }
  function parseRupeesToPaise(text, allowCommas) {
    var s = String(text === undefined || text === null ? '' : text).replace(/^\s+|\s+$/g, '');
    var m;
    var intPart;
    var dec;
    if (s.charCodeAt(0) === 0x20b9) s = s.slice(1).replace(/^\s+/, '');
    if (s === '') return { ok: true, paise: 0, blank: true };
    m = allowCommas === true
      ? /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(s)
      : /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return { ok: false, paise: 0, blank: false };
    intPart = m[1].replace(/,/g, '');
    if (intPart.length > 10) return { ok: false, paise: 0, blank: false };
    dec = m[2] || '';
    while (dec.length < 2) dec += '0';
    return { ok: true, paise: parseInt(intPart, 10) * 100 + parseInt(dec, 10), blank: false };
  }
  function paiseToRupeeText(paise) {
    var p = masIsInt(paise) && paise >= 0 ? paise : 0;
    var r = Math.floor(p / 100);
    var d = p % 100;
    return String(r) + '.' + (d < 10 ? '0' : '') + String(d);
  }
  function bpToPercentText(bp) {
    var b = masIsInt(bp) && bp >= 0 ? bp : 0;
    var whole = Math.floor(b / 100);
    var frac = b % 100;
    var f;
    if (frac === 0) return String(whole);
    f = (frac < 10 ? '0' : '') + String(frac);
    return String(whole) + '.' + f.replace(/0$/, '');
  }
  function isTaxPending(row) {
    if (!masIsObj(row)) return true;
    var tax = masHas(row, 'sac') ? row.sac : row.hsn;
    return tax === '' || tax === undefined || tax === null || row.gstRateBp === null || row.gstRateBp === undefined;
  }
  function emptyFlags() {
    var out = {};
    var i;
    for (i = 0; i < FLAG_KEYS.length; i += 1) out[FLAG_KEYS[i]] = false;
    return out;
  }
  function emptyPart() {
    return {
      code: '', name: '', group: '', unit: 'pc', hsn: '', gstRateBp: null, priceIncludesTax: null,
      sellPricePaise: 0, reorderLevel: 0, reorderQty: 0, bin: '', flags: emptyFlags(), active: true
    };
  }
  function emptyLabour() {
    return {
      code: '', name: '', group: '', unit: 'job', sac: '', gstRateBp: null, priceIncludesTax: null,
      ratePaise: 0, active: true
    };
  }
  // Rebuild a stored row in the agreed key order. Stored text has sorted keys, so order is restored here.
  function masShapeRow(kind, raw) {
    var base = kind === 'part' ? emptyPart() : emptyLabour();
    var src = masIsObj(raw) ? raw : {};
    var out = {};
    var keys = Object.keys(base);
    var i;
    var j;
    var f;
    for (i = 0; i < keys.length; i += 1) {
      if (keys[i] === 'flags') {
        f = {};
        for (j = 0; j < FLAG_KEYS.length; j += 1) {
          f[FLAG_KEYS[j]] = masIsObj(src.flags) && src.flags[FLAG_KEYS[j]] === true;
        }
        out.flags = f;
      } else {
        out[keys[i]] = masHas(src, keys[i]) ? src[keys[i]] : base[keys[i]];
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- validation
  function validateRow(kind, input, opts) {
    var errors = [];
    var warnings = [];
    var o = masIsObj(opts) ? opts : {};
    var rows = Array.isArray(o.rows) ? o.rows : [];
    var mode = o.mode === 'edit' ? 'edit' : 'create';
    var existing = masIsObj(o.existing) ? o.existing : null;
    var src = masIsObj(input) ? input : {};
    var isPart = kind === 'part';
    var value;
    var i;
    var raw;
    var code;
    var nameRaw;
    var name;
    var groupRaw;
    var group;
    var unit;
    var tax;
    var taxText;
    var gst;
    var price;
    var priceField = isPart ? 'sellPricePaise' : 'ratePaise';
    var basis;
    var flagsIn;
    var fk;
    var flags;
    var lvl;
    var qty;
    var bin;
    var nameKey;
    function err(field, c) { errors.push(masIssue(field, c)); }
    function warn(field, c) { warnings.push(masIssue(field, c)); }
    function wholeNumber(v) {
      if (v === undefined || v === null || v === '') return 0;
      if (typeof v === 'string' && /^\d{1,7}$/.test(v)) return parseInt(v, 10);
      if (masIsInt(v)) return v;
      return -1;
    }

    if (kind !== 'part' && kind !== 'labour') {
      return { ok: false, errors: [masIssue('kind', 'KIND_INVALID')], warnings: [], value: null };
    }
    value = isPart ? emptyPart() : emptyLabour();

    // code
    code = normalizeCode(src.code);
    if (src.code !== undefined && src.code !== null && typeof src.code !== 'string' && typeof src.code !== 'number') {
      err('code', 'PART_CODE_INVALID');
    } else if (code === '') {
      err('code', 'PART_CODE_REQUIRED');
    } else if (/^\d+(\.\d+)?E\+?\d+$/.test(code)) {
      err('code', 'PART_CODE_SCIENTIFIC');
    } else if (!CODE_PATTERN.test(code)) {
      err('code', 'PART_CODE_INVALID');
    } else {
      value.code = code;
      if (mode === 'create') {
        for (i = 0; i < rows.length; i += 1) {
          if (rows[i].code === code) { err('code', 'PART_CODE_DUPLICATE'); break; }
        }
        if (errors.length === 0) {
          for (i = 0; i < rows.length; i += 1) {
            if (rows[i].code !== code && codeZeroKey(rows[i].code) === codeZeroKey(code)) {
              errors.push({ field: 'code', code: 'PART_CODE_ZERO_VARIANT', message: masMessage('PART_CODE_ZERO_VARIANT'), other: rows[i].code });
              break;
            }
          }
        }
      } else if (existing && existing.code !== code) {
        err('code', 'CODE_CHANGE_NOT_ALLOWED');
      }
    }

    // name
    nameRaw = src.name;
    if (nameRaw === undefined || nameRaw === null || (typeof nameRaw === 'string' && masCleanText(nameRaw) === '')) {
      err('name', 'NAME_REQUIRED');
    } else if (typeof nameRaw !== 'string' || masHasControl(nameRaw)) {
      err('name', 'NAME_INVALID');
    } else {
      name = masCleanText(nameRaw);
      if (name.length > 80 || name.charAt(0) === '=' || name.charAt(0) === '@') {
        err('name', 'NAME_INVALID');
      } else {
        value.name = name;
        nameKey = name.toLowerCase();
        for (i = 0; i < rows.length; i += 1) {
          if (rows[i].active !== false && rows[i].code !== value.code && String(rows[i].name).toLowerCase() === nameKey) {
            warn('name', 'NAME_DUPLICATE_WARNING');
            break;
          }
        }
      }
    }

    // group
    groupRaw = src.group;
    if (groupRaw === undefined || groupRaw === null || (typeof groupRaw === 'string' && masCleanText(groupRaw) === '')) {
      err('group', 'GROUP_REQUIRED');
    } else if (typeof groupRaw !== 'string' || masHasControl(groupRaw)) {
      err('group', 'GROUP_INVALID');
    } else {
      group = masCleanText(groupRaw);
      if (group.length > 40 || group.charAt(0) === '=' || group.charAt(0) === '@') {
        err('group', 'GROUP_INVALID');
      } else {
        for (i = 0; i < rows.length; i += 1) {
          if (String(rows[i].group).toLowerCase() === group.toLowerCase()) { group = rows[i].group; break; }
        }
        value.group = group;
      }
    }

    // unit
    unit = src.unit === undefined || src.unit === null || src.unit === '' ? value.unit : src.unit;
    if (typeof unit === 'string' && UNITS[kind].indexOf(unit) >= 0) {
      value.unit = unit;
    } else {
      err('unit', 'UNIT_INVALID');
    }

    // hsn or sac
    taxText = isPart ? src.hsn : src.sac;
    tax = taxText === undefined || taxText === null ? '' : (typeof taxText === 'string' || typeof taxText === 'number' ? String(taxText).replace(/\s+/g, '') : '?');
    if (tax !== '') {
      if (isPart ? !/^(\d{4}|\d{6}|\d{8})$/.test(tax) : !/^(\d{4}|\d{6})$/.test(tax)) {
        err(isPart ? 'hsn' : 'sac', isPart ? 'HSN_INVALID' : 'SAC_INVALID');
        tax = '';
      }
    }
    value[isPart ? 'hsn' : 'sac'] = tax;

    // gst rate (basis points)
    gst = src.gstRateBp;
    if (gst === undefined || gst === null || gst === '') {
      value.gstRateBp = null;
    } else if (masIsInt(gst) && gst >= 0 && gst <= 10000) {
      value.gstRateBp = gst;
      if (gst > 0 && gst < 100 && gst !== 25) warn('gstRateBp', 'GST_RATE_FRACTION_WARNING');
    } else {
      err('gstRateBp', 'GST_RATE_INVALID');
    }

    // price
    price = src[priceField];
    if (price === undefined || price === null || price === '') price = 0;
    if (masIsInt(price) && price >= 0 && price <= MAX_PRICE_PAISE) {
      value[priceField] = price;
      if (price === 0) warn(priceField, 'PRICE_ZERO_WARNING');
    } else {
      err(priceField, 'PRICE_INVALID');
      price = 0;
    }
    basis = src.priceIncludesTax;
    if (basis === undefined || basis === null) basis = null;
    if (basis === true || basis === false) {
      value.priceIncludesTax = basis;
    } else if (basis === null) {
      value.priceIncludesTax = null;
      if (price > 0) err('priceIncludesTax', 'PRICE_BASIS_REQUIRED');
    } else {
      err('priceIncludesTax', 'PRICE_BASIS_REQUIRED');
    }

    if (isPart) {
      lvl = wholeNumber(src.reorderLevel);
      qty = wholeNumber(src.reorderQty);
      if (lvl < 0 || lvl > MAX_REORDER) { err('reorderLevel', 'REORDER_INVALID'); lvl = 0; }
      if (qty < 0 || qty > MAX_REORDER) { err('reorderQty', 'REORDER_INVALID'); qty = 0; }
      value.reorderLevel = lvl;
      value.reorderQty = qty;
      if (lvl > 0 && qty === 0) warn('reorderQty', 'REORDER_QTY_ZERO_WARNING');

      bin = src.bin === undefined || src.bin === null ? '' : src.bin;
      if (typeof bin !== 'string') {
        err('bin', 'BIN_INVALID');
      } else {
        bin = bin.replace(/^\s+|\s+$/g, '');
        if (/^[A-Za-z0-9 ._\/-]{0,20}$/.test(bin)) value.bin = bin; else err('bin', 'BIN_INVALID');
      }

      flagsIn = src.flags;
      flags = emptyFlags();
      if (flagsIn !== undefined && flagsIn !== null) {
        if (!masIsObj(flagsIn)) {
          err('flags', 'FLAG_INVALID');
        } else {
          for (fk in flagsIn) {
            if (!masHas(flagsIn, fk)) continue;
            if (FLAG_KEYS.indexOf(fk) < 0 || typeof flagsIn[fk] !== 'boolean') {
              err('flags', 'FLAG_INVALID');
              break;
            }
            flags[fk] = flagsIn[fk];
          }
        }
      }
      value.flags = flags;
    }

    value.active = mode === 'edit' && existing ? existing.active !== false : true;
    return { ok: errors.length === 0, errors: errors, warnings: warnings, value: value };
  }

  function diffRows(before, after) {
    var out = [];
    var seen = {};
    var keys = [];
    var k;
    var i;
    var a = masIsObj(before) ? before : {};
    var b = masIsObj(after) ? after : {};
    var j;
    var fa;
    var fb;
    for (k in b) { if (masHas(b, k)) keys.push(k); }
    for (k in a) { if (masHas(a, k) && !masHas(b, k)) keys.push(k); }
    for (i = 0; i < keys.length; i += 1) {
      k = keys[i];
      if (META_FIELDS.indexOf(k) >= 0 || seen[k]) continue;
      seen[k] = true;
      if (k === 'flags') {
        fa = masIsObj(a.flags) ? a.flags : {};
        fb = masIsObj(b.flags) ? b.flags : {};
        for (j = 0; j < FLAG_KEYS.length; j += 1) {
          if ((fa[FLAG_KEYS[j]] === true) !== (fb[FLAG_KEYS[j]] === true)) {
            out.push({ field: 'flags.' + FLAG_KEYS[j], from: fa[FLAG_KEYS[j]] === true, to: fb[FLAG_KEYS[j]] === true });
          }
        }
      } else if (a[k] !== b[k]) {
        out.push({ field: k, from: a[k] === undefined ? null : a[k], to: b[k] === undefined ? null : b[k] });
      }
    }
    return out;
  }
  function isSensitiveDiff(diff) {
    var i;
    if (!Array.isArray(diff)) return false;
    for (i = 0; i < diff.length; i += 1) {
      if (diff[i] && SENSITIVE_FIELDS.indexOf(diff[i].field) >= 0) return true;
    }
    return false;
  }

  function canUse(row, purpose) {
    var inactiveOk = purpose === 'return' || purpose === 'adjust' || purpose === 'count';
    var known = purpose === 'receipt' || purpose === 'issue' || purpose === 'return' || purpose === 'sale' ||
      purpose === 'adjust' || purpose === 'count' || purpose === 'estimate';
    if (!known) return masFail('PURPOSE_INVALID');
    if (!masIsObj(row)) return masFail('PART_NOT_FOUND');
    if (row.active === false && !inactiveOk) return masFail('PART_INACTIVE');
    if (purpose === 'sale') {
      if (!masIsObj(row.flags) || row.flags.counterSaleable !== true) return masFail('NOT_COUNTER_SALEABLE');
      if (isTaxPending(row)) return { ok: true, warnings: [masIssue('', 'TAX_DETAILS_MISSING')] };
    }
    if (purpose === 'estimate' && isTaxPending(row)) return masFail('TAX_DETAILS_MISSING');
    return { ok: true, warnings: [] };
  }

  // ---------------------------------------------------------------- session and step-up
  function masTier(session) {
    if (!masIsObj(session) || session.ok !== true) return '';
    if (session.tier === 'owner' || session.tier === 'manager' || session.tier === 'staff') return session.tier;
    return '';
  }
  function masIsOwner(session) {
    return masTier(session) === 'owner' && session.isOwner === true;
  }
  function masGuardEdit(ctx) {
    var session = masIsObj(ctx) ? ctx.session : null;
    var tier = masTier(session);
    if (tier === '') return masFail('SESSION_REQUIRED');
    if (tier === 'staff') return masFail('ROLE_DENIED');
    if (tier === 'owner' && session.isOwner !== true) return masFail('ROLE_DENIED');
    return null;
  }
  function masNowMs(ctx) {
    var n = masIsObj(ctx) ? ctx.now : null;
    var t;
    if (typeof n === 'function') n = n();
    if (n && typeof n.getTime === 'function') n = n.getTime();
    if (typeof n === 'string') { t = Date.parse(n); n = isNaN(t) ? null : t; }
    return typeof n === 'number' && isFinite(n) ? n : null;
  }
  function masStepUpValid(ctx) {
    var s = masIsObj(ctx) ? ctx.stepUp : null;
    var now;
    var d;
    if (!masIsObj(s) || s.ok !== true || !masIsInt(s.at)) return false;
    now = masNowMs(ctx);
    if (now === null) return false;
    d = now - s.at;
    return d >= 0 && d <= STEP_UP_WINDOW_MS;
  }
  function masActor(session) {
    return {
      t: session.tier,
      r: typeof session.role === 'string' ? session.role.slice(0, 40) : '',
      m: typeof session.actorName === 'string' ? session.actorName.slice(0, 60) : ''
    };
  }
  function masActorLabel(actor) {
    if (!actor) return '';
    return actor.m ? (actor.r ? actor.m + ' (' + actor.r + ')' : actor.m) : actor.r || '';
  }
  function rights(session) {
    var tier = masTier(session);
    return {
      view: tier !== '',
      edit: tier === 'manager' || (tier === 'owner' && session.isOwner === true),
      remove: masIsOwner(session)
    };
  }
  function masClientRef(ctx) {
    var ref = masIsObj(ctx) ? ctx.clientRef : undefined;
    if (ref === undefined || ref === null || ref === '') return { ok: true, ref: '' };
    if (typeof ref === 'string' && CLIENT_REF_PATTERN.test(ref)) return { ok: true, ref: ref };
    return { ok: false, ref: '' };
  }
  function masCheckReason(reason, required) {
    var r = typeof reason === 'string' ? masCleanText(reason) : '';
    if (r.length > REASON_MAX) return { ok: false, code: 'REASON_INVALID' };
    if (required && r.length < REASON_MIN) return { ok: false, code: 'REASON_REQUIRED' };
    return { ok: true, reason: r };
  }

  // ---------------------------------------------------------------- reading the streams
  var foldCache = { part: null, labour: null };

  // The fold is cached by the revision, count and last hash of what store.read returned just now.
  // store.read is called every time, so a blocked store or a reopened store is never served from an old fold.
  function masFold(store, kind) {
    var stream = STREAM_OF[kind];
    var cacheKey = '';
    var cached = foldCache[kind];
    var res;
    var recs;
    var kinds = RECORD_KINDS[kind];
    var map = {};
    var i;
    var rec;
    var b;
    var key;
    var entry;
    var list = [];
    var k;
    var byCode;
    var row;
    var j;
    if (!store || typeof store.read !== 'function' || typeof store.append !== 'function') {
      return masFail('SVCS_STORAGE_UNAVAILABLE');
    }
    res = store.read(stream);
    if (!res || res.ok !== true) return masFromStore(res);
    recs = Array.isArray(res.records) ? res.records : [];
    if (masIsInt(res.rev) && masIsInt(res.n) && typeof res.h === 'string') {
      cacheKey = String(res.rev) + ':' + String(res.n) + ':' + res.h + ':' + String(recs.length);
      if (cached && cached.store === store && cached.key === cacheKey) return cached.result;
    }
    for (i = 0; i < recs.length; i += 1) {
      rec = recs[i];
      b = rec && rec.b;
      if (!masIsObj(b) || typeof b.code !== 'string') continue;
      key = 'k$' + b.code;
      if (rec.k === kinds.create) {
        map[key] = {
          row: b.row, rev: 1, createdAt: rec.at, createdBy: masActorLabel(rec.a), updatedAt: rec.at, updatedBy: masActorLabel(rec.a),
          deactivatedAt: '', deactivatedBy: '', deactivateReason: '', source: b.via === 'template' ? 'template' : 'manual',
          batchId: typeof b.batchId === 'string' ? b.batchId : ''
        };
      } else if (rec.k === kinds.remove) {
        delete map[key];
      } else if ((rec.k === kinds.edit || rec.k === kinds.deactivate || rec.k === kinds.reactivate) && map[key]) {
        entry = map[key];
        entry.row = b.row;
        entry.rev += 1;
        entry.updatedAt = rec.at;
        entry.updatedBy = masActorLabel(rec.a);
        if (rec.k === kinds.deactivate) {
          entry.deactivatedAt = rec.at;
          entry.deactivatedBy = masActorLabel(rec.a);
          entry.deactivateReason = typeof b.reason === 'string' ? b.reason : '';
        } else if (rec.k === kinds.reactivate) {
          entry.deactivatedAt = '';
          entry.deactivatedBy = '';
          entry.deactivateReason = '';
        }
      }
    }
    byCode = {};
    for (k in map) {
      if (!masHas(map, k)) continue;
      entry = map[k];
      row = masShapeRow(kind, entry.row);
      row.code = k.slice(2);
      row.rev = entry.rev;
      row.createdAt = entry.createdAt;
      row.createdBy = entry.createdBy;
      row.updatedAt = entry.updatedAt;
      row.updatedBy = entry.updatedBy;
      row.deactivatedAt = entry.deactivatedAt;
      row.deactivatedBy = entry.deactivatedBy;
      row.deactivateReason = entry.deactivateReason;
      row.source = entry.source;
      row.batchId = entry.batchId;
      if (row.flags) Object.freeze(row.flags);
      Object.freeze(row);
      list.push(row);
    }
    list.sort(function (x, y) { return masNaturalCompare(x.code, y.code); });
    for (j = 0; j < list.length; j += 1) byCode['k$' + list[j].code] = list[j];
    Object.freeze(list);
    res = { ok: true, rows: list, byCode: byCode, rev: masIsInt(res.rev) ? res.rev : 0 };
    if (cacheKey !== '') foldCache[kind] = { store: store, key: cacheKey, result: res };
    return res;
  }

  function loadMasters(store) {
    var p = masFold(store, 'part');
    var l;
    if (!p.ok) return p;
    l = masFold(store, 'labour');
    if (!l.ok) return l;
    return { ok: true, parts: p.rows, labour: l.rows, revs: { parts: p.rev, labour: l.rev } };
  }
  function getRow(store, kind, code) {
    var f;
    var row;
    if (kind !== 'part' && kind !== 'labour') return masFail('KIND_INVALID');
    f = masFold(store, kind);
    if (!f.ok) return f;
    row = f.byCode['k$' + normalizeCode(code)];
    return row ? { ok: true, row: row } : masFail('NOT_FOUND');
  }
  function filterRows(rows, filter) {
    var f = masIsObj(filter) ? filter : {};
    var tokens = typeof f.q === 'string' ? f.q.toLowerCase().split(/\s+/) : [];
    var out = [];
    var i;
    var j;
    var row;
    var hay;
    var ok;
    var list = Array.isArray(rows) ? rows : [];
    for (i = 0; i < list.length; i += 1) {
      row = list[i];
      if (f.active === true && row.active === false) continue;
      if (f.active === false && row.active !== false) continue;
      if (f.taxPending === true && !isTaxPending(row)) continue;
      if (f.taxPending === false && isTaxPending(row)) continue;
      if (typeof f.group === 'string' && f.group !== '' && String(row.group).toLowerCase() !== f.group.toLowerCase()) continue;
      hay = (row.code + ' ' + row.name + ' ' + row.group + ' ' + (row.bin || '')).toLowerCase();
      ok = true;
      for (j = 0; j < tokens.length; j += 1) {
        if (tokens[j] !== '' && hay.indexOf(tokens[j]) < 0) { ok = false; break; }
      }
      if (ok) out.push(row);
    }
    return out;
  }
  function groupsOf(rows) {
    var seen = {};
    var out = [];
    var i;
    var g;
    var list = Array.isArray(rows) ? rows : [];
    for (i = 0; i < list.length; i += 1) {
      g = list[i] && typeof list[i].group === 'string' ? list[i].group : '';
      if (g !== '' && !seen['k$' + g.toLowerCase()]) {
        seen['k$' + g.toLowerCase()] = true;
        out.push(g);
      }
    }
    out.sort(function (x, y) {
      var a = x.toLowerCase();
      var b = y.toLowerCase();
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return out;
  }
  function sortRows(rows) {
    var copy = Array.isArray(rows) ? rows.slice() : [];
    copy.sort(function (x, y) { return masNaturalCompare(x.code, y.code); });
    return copy;
  }

  // ---------------------------------------------------------------- writing
  function masAppend(store, kind, items, ctx, expectRev) {
    var res = store.append(STREAM_OF[kind], items, { expectRev: expectRev, actor: masActor(ctx.session) });
    if (!res || res.ok !== true) return masFromStore(res);
    return { ok: true, records: res.records || [] };
  }
  // A retry with the same client reference after a lost reply finds the saved record and does not write twice.
  // Only a record of the SAME action for the same code counts; any other use of the ref falls through and the
  // store refuses the append with SVCS_DUPLICATE_REF, so a reused ref can never report a write that did not happen.
  function masAlreadyDone(store, kind, ref, code, action) {
    var rec;
    if (ref === '' || typeof store.findRef !== 'function') return null;
    rec = store.findRef(STREAM_OF[kind], ref);
    if (!rec || !masIsObj(rec.b) || rec.b.code !== code) return null;
    return rec.k === RECORD_KINDS[kind][action] ? rec : null;
  }
  function masRowBody(kind, code, row, changes, reason, via, batchId) {
    return { code: code, row: masShapeRow(kind, row), changes: changes, reason: reason, via: via, batchId: batchId };
  }
  function masStart(store, ctx, kind) {
    var g = masGuardEdit(ctx);
    var ref;
    if (kind !== 'part' && kind !== 'labour') return masFail('KIND_INVALID');
    if (g) return g;
    ref = masClientRef(ctx);
    if (!ref.ok) return masFail('ARGS_INVALID');
    return { ok: true, ref: ref.ref };
  }
  function masWarnList(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i += 1) out.push({ field: list[i].field, code: list[i].code, message: list[i].message });
    return out;
  }
  function masFirstError(errors) {
    return masFail(errors[0].code, { field: errors[0].field, errors: errors });
  }

  function createRow(store, ctx, kind, input) {
    var st = masStart(store, ctx, kind);
    var f;
    var v;
    var done;
    var res;
    var got;
    var code;
    if (!st.ok) return st;
    code = normalizeCode(masIsObj(input) ? input.code : '');
    f = masFold(store, kind);
    if (!f.ok) return f;
    done = code === '' ? null : masAlreadyDone(store, kind, st.ref, code, 'create');
    if (done) {
      got = f.byCode['k$' + code];
      return got ? { ok: true, row: got, warnings: [], replayed: true } : masFail('NOT_FOUND');
    }
    if (f.rows.length >= MAX_ROWS) return masFail('MASTER_FULL');
    v = validateRow(kind, input, { rows: f.rows, mode: 'create' });
    if (!v.ok) return masFirstError(v.errors);
    res = masAppend(store, kind, [masItem(kind, 'create', masRowBody(kind, v.value.code, v.value, [], '', 'manual', ''), st.ref)], ctx, f.rev);
    if (!res.ok) return res;
    got = getRow(store, kind, v.value.code);
    return { ok: true, row: got.ok ? got.row : null, warnings: masWarnList(v.warnings), recordId: res.records[0] ? res.records[0].id : '' };
  }
  function masItem(kind, action, body, ref) {
    var item = { k: RECORD_KINDS[kind][action], b: body };
    if (ref) item.r = ref;
    return item;
  }

  function editRow(store, ctx, kind, code, patch, expectedRev, reason) {
    var st = masStart(store, ctx, kind);
    var f;
    var cur;
    var norm;
    var merged;
    var k;
    var fk;
    var v;
    var diff;
    var rs;
    var res;
    var got;
    var done;
    var body;
    var base;
    if (!st.ok) return st;
    norm = normalizeCode(code);
    f = masFold(store, kind);
    if (!f.ok) return f;
    done = masAlreadyDone(store, kind, st.ref, norm, 'edit');
    if (done) {
      got = f.byCode['k$' + norm];
      return got ? { ok: true, row: got, diff: [], warnings: [], replayed: true } : masFail('NOT_FOUND');
    }
    cur = f.byCode['k$' + norm];
    if (!cur) return masFail('NOT_FOUND');
    if (!masIsObj(patch) || !masIsInt(expectedRev)) return masFail('ARGS_INVALID');
    if (masHas(patch, 'code') && normalizeCode(patch.code) !== cur.code) return masFail('CODE_CHANGE_NOT_ALLOWED');
    if (masHas(patch, 'active') && patch.active !== cur.active) return masFail('ACTIVE_NOT_EDITABLE');
    if (expectedRev !== cur.rev) return masFail('REV_CONFLICT');
    base = masShapeRow(kind, cur);
    merged = masShapeRow(kind, cur);
    for (k in patch) {
      if (!masHas(patch, k) || k === 'code' || k === 'active' || !masHas(base, k)) continue;
      if (k === 'flags') {
        if (!masIsObj(patch.flags)) return masFail('FLAG_INVALID', { field: 'flags' });
        for (fk in patch.flags) {
          if (masHas(patch.flags, fk)) merged.flags[fk] = patch.flags[fk];
        }
      } else {
        merged[k] = patch[k];
      }
    }
    v = validateRow(kind, merged, { rows: f.rows, mode: 'edit', existing: cur });
    if (!v.ok) return masFirstError(v.errors);
    diff = diffRows(base, v.value);
    if (diff.length === 0) return masFail('NO_CHANGE');
    rs = masCheckReason(reason, isSensitiveDiff(diff));
    if (!rs.ok) return masFail(rs.code);
    body = masRowBody(kind, cur.code, v.value, diff, rs.reason, 'manual', '');
    res = masAppend(store, kind, [masItem(kind, 'edit', body, st.ref)], ctx, f.rev);
    if (!res.ok) return res;
    got = getRow(store, kind, cur.code);
    return { ok: true, row: got.ok ? got.row : null, diff: diff, warnings: masWarnList(v.warnings), recordId: res.records[0] ? res.records[0].id : '' };
  }

  function setActive(store, ctx, kind, code, active, reason, deps) {
    var st = masStart(store, ctx, kind);
    var f;
    var cur;
    var norm;
    var rs;
    var next;
    var res;
    var got;
    var warnings = [];
    var onHand;
    var done;
    if (!st.ok) return st;
    if (typeof active !== 'boolean') return masFail('ARGS_INVALID');
    norm = normalizeCode(code);
    f = masFold(store, kind);
    if (!f.ok) return f;
    done = masAlreadyDone(store, kind, st.ref, norm, active ? 'reactivate' : 'deactivate');
    if (done) {
      got = f.byCode['k$' + norm];
      return got ? { ok: true, row: got, warnings: [], replayed: true } : masFail('NOT_FOUND');
    }
    cur = f.byCode['k$' + norm];
    if (!cur) return masFail('NOT_FOUND');
    if (active === false && cur.active === false) return masFail('ALREADY_INACTIVE');
    if (active === true && cur.active === true) return masFail('ALREADY_ACTIVE');
    rs = masCheckReason(reason, true);
    if (!rs.ok) return masFail(rs.code);
    next = masShapeRow(kind, cur);
    next.active = active;
    if (active === false && masIsObj(deps) && typeof deps.onHand === 'function') {
      try { onHand = deps.onHand(cur.code); } catch (e) { onHand = 1; }
      if (typeof onHand === 'number' && onHand > 0) warnings.push(masIssue('', 'STOCK_ON_HAND_WARNING'));
    }
    res = masAppend(store, kind, [masItem(kind, active ? 'reactivate' : 'deactivate',
      masRowBody(kind, cur.code, next, [{ field: 'active', from: !active, to: active }], rs.reason, 'manual', ''), st.ref)], ctx, f.rev);
    if (!res.ok) return res;
    got = getRow(store, kind, cur.code);
    return { ok: true, row: got.ok ? got.row : null, warnings: warnings, recordId: res.records[0] ? res.records[0].id : '' };
  }

  function removeUnused(store, ctx, kind, code, reason, deps) {
    var session = masIsObj(ctx) ? ctx.session : null;
    var ref;
    var f;
    var cur;
    var norm;
    var rs;
    var mv;
    var rf;
    var res;
    var done;
    var item;
    if (kind !== 'part' && kind !== 'labour') return masFail('KIND_INVALID');
    if (masTier(session) === '') return masFail('SESSION_REQUIRED');
    if (!masIsOwner(session)) return masFail('ROLE_DENIED');
    if (!masStepUpValid(ctx)) return masFail('PIN_REQUIRED');
    ref = masClientRef(ctx);
    if (!ref.ok) return masFail('ARGS_INVALID');
    norm = normalizeCode(code);
    f = masFold(store, kind);
    if (!f.ok) return f;
    done = masAlreadyDone(store, kind, ref.ref, norm, 'remove');
    if (done) return { ok: true, replayed: true };
    cur = f.byCode['k$' + norm];
    if (!cur) return masFail('NOT_FOUND');
    rs = masCheckReason(reason, true);
    if (!rs.ok) return masFail(rs.code);
    if (!masIsObj(deps) || typeof deps.hasMovements !== 'function' || typeof deps.isReferenced !== 'function') {
      return masFail('DEPENDENCY_MISSING');
    }
    try { mv = deps.hasMovements(cur.code); } catch (e1) { mv = true; }
    if (mv !== false) return masFail('HAS_MOVEMENTS');
    try { rf = deps.isReferenced(kind, cur.code); } catch (e2) { rf = true; }
    if (rf !== false) return masFail('HAS_REFERENCES');
    item = {
      k: RECORD_KINDS[kind].remove,
      b: { code: cur.code, row: null, changes: [{ field: '*', from: masShapeRow(kind, cur), to: null }], reason: rs.reason, via: 'manual', batchId: '' }
    };
    if (ref.ref !== '') item.r = ref.ref;
    res = masAppend(store, kind, [item], ctx, f.rev);
    if (!res.ok) return res;
    return { ok: true, recordId: res.records[0] ? res.records[0].id : '' };
  }

  // ---------------------------------------------------------------- history
  function historyFor(store, kind, code) {
    var res;
    var kinds;
    var norm = normalizeCode(code);
    var out = [];
    var rev = 0;
    var i;
    var rec;
    var b;
    var action;
    if (kind !== 'part' && kind !== 'labour') return masFail('KIND_INVALID');
    if (!store || typeof store.read !== 'function') return masFail('SVCS_STORAGE_UNAVAILABLE');
    res = store.read(STREAM_OF[kind]);
    if (!res || res.ok !== true) return masFromStore(res);
    if (!Array.isArray(res.records)) return masFail('SVCS_STORAGE_UNAVAILABLE');
    kinds = RECORD_KINDS[kind];
    for (i = 0; i < res.records.length; i += 1) {
      rec = res.records[i];
      b = rec && rec.b;
      if (!masIsObj(b) || b.code !== norm) continue;
      if (rec.k === kinds.create) { action = 'create'; rev = 1; }
      else if (rec.k === kinds.edit) { action = 'edit'; rev += 1; }
      else if (rec.k === kinds.deactivate) { action = 'deactivate'; rev += 1; }
      else if (rec.k === kinds.reactivate) { action = 'reactivate'; rev += 1; }
      else if (rec.k === kinds.remove) { action = 'delete'; }
      else continue;
      out.push({
        seq: rec.n, id: rec.id, at: rec.at, action: action, rev: rev,
        changes: Array.isArray(b.changes) ? b.changes : [], reason: typeof b.reason === 'string' ? b.reason : '',
        sensitive: isSensitiveDiff(b.changes), actor: rec.a || null, via: b.via === 'template' ? 'template' : 'manual',
        batchId: typeof b.batchId === 'string' ? b.batchId : ''
      });
    }
    return { ok: true, entries: out };
  }

  // ---------------------------------------------------------------- bulk template
  function masSplitLine(line, delim) {
    var cells = [];
    var quoted = [];
    var cur = '';
    var inQ = false;
    var wasQ = false;
    var i;
    var ch;
    for (i = 0; i < line.length; i += 1) {
      ch = line.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') { cur += '"'; i += 1; } else { inQ = false; }
        } else {
          cur += ch;
        }
      } else if (ch === '"' && cur === '' && !wasQ) {
        inQ = true;
        wasQ = true;
      } else if (ch === delim) {
        cells.push(cur.replace(/^\s+|\s+$/g, ''));
        quoted.push(wasQ);
        cur = '';
        wasQ = false;
      } else {
        cur += ch;
      }
    }
    if (inQ) return { ok: false, cells: [], quoted: [] };
    cells.push(cur.replace(/^\s+|\s+$/g, ''));
    quoted.push(wasQ);
    return { ok: true, cells: cells, quoted: quoted };
  }
  function masTemplateTop(code, extra) {
    var out = { ok: false, code: code, message: masMessage(code), delimiter: ',', headers: [], rows: [], errors: [{ line: 0, field: '', code: code, message: masMessage(code) }] };
    var k;
    if (extra) { for (k in extra) { if (masHas(extra, k)) out[k] = extra[k]; } }
    return out;
  }
  function parseTemplate(kind, text) {
    var lines;
    var hi = -1;
    var i;
    var delim;
    var hdr;
    var want;
    var got = [];
    var missing = [];
    var unexpected = [];
    var rows = [];
    var errors = [];
    var count = 0;
    var line;
    var parsed;
    var bare;
    var j;
    if (kind !== 'part' && kind !== 'labour') return masTemplateTop('KIND_INVALID');
    if (typeof text !== 'string') return masTemplateTop('TEMPLATE_EMPTY');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.length > MAX_TEMPLATE_CHARS) return masTemplateTop('TEMPLATE_TOO_LARGE');
    lines = text.split(/\r\n|\r|\n/);
    for (i = 0; i < lines.length; i += 1) {
      if (lines[i].replace(/[\s,]/g, '') !== '') { hi = i; break; }
    }
    if (hi < 0) return masTemplateTop('TEMPLATE_EMPTY');
    if (/(^|[^a-z0-9])(mobile|phone|email|e-mail|address|customer|gstin|pan|aadhaar)([^a-z0-9]|$)/.test(lines[hi].toLowerCase())) {
      return masTemplateTop('TEMPLATE_CUSTOMER_COLUMN');
    }
    delim = lines[hi].indexOf('\t') >= 0 ? '\t' : ',';
    hdr = masSplitLine(lines[hi], delim);
    if (!hdr.ok) return masTemplateTop('TEMPLATE_QUOTE_UNBALANCED');
    want = TEMPLATE_HEADERS[kind];
    for (i = 0; i < hdr.cells.length; i += 1) got.push(hdr.cells[i].toLowerCase());
    for (i = 0; i < want.length; i += 1) { if (got.indexOf(want[i]) < 0) missing.push(want[i]); }
    for (i = 0; i < got.length; i += 1) { if (want.indexOf(got[i]) < 0) unexpected.push(got[i]); }
    if (missing.length > 0 || unexpected.length > 0 || got.length !== want.length || got.join('|') !== want.join('|')) {
      return masTemplateTop('TEMPLATE_HEADER_MISMATCH', { missing: missing, unexpected: unexpected, headers: got });
    }
    for (i = hi + 1; i < lines.length; i += 1) {
      line = lines[i];
      bare = line.replace(/[\s,]/g, '');
      if (delim === '\t') bare = line.replace(/\s/g, '');
      if (bare === '') continue;
      count += 1;
      if (count > MAX_TEMPLATE_ROWS) return masTemplateTop('TEMPLATE_TOO_MANY_ROWS', { headers: got });
      parsed = masSplitLine(line, delim);
      if (!parsed.ok) {
        errors.push({ line: i + 1, field: '', code: 'TEMPLATE_QUOTE_UNBALANCED', message: masMessage('TEMPLATE_QUOTE_UNBALANCED') });
        continue;
      }
      if (parsed.cells.length !== want.length) {
        errors.push({ line: i + 1, field: '', code: 'TEMPLATE_ROW_WIDTH', message: masMessage('TEMPLATE_ROW_WIDTH') });
        continue;
      }
      rows.push({ line: i + 1, cells: parsed.cells, quoted: parsed.quoted });
    }
    j = errors.length;
    return { ok: j === 0, delimiter: delim, headers: got, rows: rows, errors: errors };
  }
  function masBasisFromCell(cell) {
    var s = cell.toLowerCase();
    if (s === '') return { ok: true, value: null };
    if (s === 'yes' || s === 'y' || s === 'true' || s === '1') return { ok: true, value: true };
    if (s === 'no' || s === 'n' || s === 'false' || s === '0') return { ok: true, value: false };
    return { ok: false, value: null };
  }
  // Turn one parsed template row into a row input. Cell level problems go to cellErrors; bad marks the input fields to ignore later.
  function masRowFromCells(kind, row, headers, cellErrors) {
    var input = {};
    var bad = {};
    var cells = row.cells;
    var i;
    var h;
    var c;
    var pr;
    var parts;
    var j;
    var tok;
    var flagMap;
    var bs;
    function cellErr(field, code) {
      cellErrors.push({ line: row.line, field: field, code: code, message: masMessage(code) });
    }
    function whole(cell, field, key) {
      if (cell === '') return 0;
      if (/^\d{1,7}$/.test(cell)) return parseInt(cell, 10);
      cellErr(field, 'REORDER_INVALID');
      bad[key] = true;
      return 0;
    }
    for (i = 0; i < headers.length; i += 1) {
      h = headers[i];
      c = cells[i];
      if ((h === 'name' || h === 'group' || h === 'bin') && (c.charAt(0) === '=' || c.charAt(0) === '@')) {
        cellErr(h, 'TEMPLATE_FORMULA_LIKE');
        bad[h] = true;
        input[h] = '';
        continue;
      }
      if (h === 'code' || h === 'name' || h === 'group' || h === 'bin') {
        input[h] = c;
      } else if (h === 'unit') {
        input.unit = c === '' ? undefined : c.toLowerCase();
      } else if (h === 'hsn' || h === 'sac') {
        input[h] = c;
      } else if (h === 'gst_rate') {
        pr = parsePercentToBp(c);
        if (pr.ok) { input.gstRateBp = pr.bp; } else { cellErr('gst_rate', 'GST_RATE_INVALID'); bad.gstRateBp = true; input.gstRateBp = null; }
      } else if (h === 'sell_price' || h === 'rate') {
        pr = parseRupeesToPaise(c, row.quoted[i]);
        if (pr.ok) {
          input[h === 'rate' ? 'ratePaise' : 'sellPricePaise'] = pr.paise;
        } else {
          cellErr(h, 'PRICE_INVALID');
          bad[h === 'rate' ? 'ratePaise' : 'sellPricePaise'] = true;
          input[h === 'rate' ? 'ratePaise' : 'sellPricePaise'] = 0;
        }
      } else if (h === 'price_includes_tax') {
        bs = masBasisFromCell(c);
        if (bs.ok) { input.priceIncludesTax = bs.value; } else { cellErr(h, 'PRICE_BASIS_INVALID'); bad.priceIncludesTax = true; input.priceIncludesTax = null; }
      } else if (h === 'reorder_level') {
        input.reorderLevel = whole(c, h, 'reorderLevel');
      } else if (h === 'reorder_qty') {
        input.reorderQty = whole(c, h, 'reorderQty');
      } else if (h === 'flags') {
        flagMap = {};
        if (c !== '') {
          parts = c.split('|');
          for (j = 0; j < parts.length; j += 1) {
            tok = parts[j].replace(/^\s+|\s+$/g, '').toLowerCase();
            if (tok === '') continue;
            if (masHas(TEMPLATE_FLAG_TOKENS, tok)) {
              flagMap[TEMPLATE_FLAG_TOKENS[tok]] = true;
            } else {
              cellErr('flags', 'FLAG_INVALID');
              bad.flags = true;
            }
          }
        }
        input.flags = flagMap;
      }
    }
    return { input: input, bad: bad };
  }
  var HEADER_OF_FIELD = Object.freeze({
    code: 'code', name: 'name', group: 'group', unit: 'unit', hsn: 'hsn', sac: 'sac', gstRateBp: 'gst_rate',
    sellPricePaise: 'sell_price', ratePaise: 'rate', priceIncludesTax: 'price_includes_tax',
    reorderLevel: 'reorder_level', reorderQty: 'reorder_qty', bin: 'bin', flags: 'flags'
  });
  function masNormalizeTemplateText(text) {
    var t = typeof text === 'string' ? text : '';
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    return t.replace(/\r\n|\r/g, '\n').replace(/^\s+|\s+$/g, '');
  }
  function masBlankPlan(kind, text) {
    return {
      ok: false, kind: kind, batchId: 'MB-' + masTextLabel(masNormalizeTemplateText(text)), delimiter: ',', rowCount: 0,
      toCreate: [], skippedExisting: [], errors: [], warnings: [], taxPendingCount: 0
    };
  }
  function planBulkCreate(store, ctx, kind, text) {
    var plan = masBlankPlan(kind, text);
    var g;
    var pt;
    var f;
    var i;
    var j;
    var r;
    var pr;
    var cellErrors;
    var rc;
    var v;
    var existing;
    var lineOf = {};
    var zeroOf = {};
    var codeKey;
    var zk;
    var codeBad = {};
    var seenNew = [];
    var k;
    var e;
    var rowsStored;
    if (kind !== 'part' && kind !== 'labour') { plan.code = 'KIND_INVALID'; plan.message = masMessage('KIND_INVALID'); return plan; }
    g = masGuardEdit(ctx);
    if (g) { plan.code = g.code; plan.message = g.message; return plan; }
    pt = parseTemplate(kind, text);
    plan.delimiter = pt.delimiter || ',';
    if (pt.code) {
      plan.code = pt.code;
      plan.message = pt.message;
      plan.errors = pt.errors;
      if (pt.missing) plan.missing = pt.missing;
      if (pt.unexpected) plan.unexpected = pt.unexpected;
      return plan;
    }
    f = masFold(store, kind);
    if (!f.ok) { plan.code = f.code; plan.message = f.message; return plan; }
    rowsStored = f.rows;
    plan.rowCount = pt.rows.length + pt.errors.length;
    for (i = 0; i < pt.errors.length; i += 1) plan.errors.push(pt.errors[i]);

    // in-file duplicates and zero variants (needs the code of every row first)
    for (i = 0; i < pt.rows.length; i += 1) {
      codeKey = normalizeCode(pt.rows[i].cells[0]);
      if (codeKey === '') continue;
      if (!lineOf['k$' + codeKey]) lineOf['k$' + codeKey] = [];
      lineOf['k$' + codeKey].push(pt.rows[i].line);
      zk = codeZeroKey(codeKey);
      if (!zeroOf['k$' + zk]) zeroOf['k$' + zk] = {};
      zeroOf['k$' + zk]['k$' + codeKey] = pt.rows[i].line;
    }
    for (k in lineOf) {
      if (masHas(lineOf, k) && lineOf[k].length > 1) {
        for (j = 0; j < lineOf[k].length; j += 1) {
          plan.errors.push({ line: lineOf[k][j], field: 'code', code: 'TEMPLATE_DUPLICATE_IN_FILE', message: masMessage('TEMPLATE_DUPLICATE_IN_FILE') });
          codeBad[lineOf[k][j]] = true;
        }
      }
    }
    for (k in zeroOf) {
      if (!masHas(zeroOf, k)) continue;
      e = Object.keys(zeroOf[k]);
      if (e.length > 1) {
        for (j = 0; j < e.length; j += 1) {
          plan.errors.push({ line: zeroOf[k][e[j]], field: 'code', code: 'PART_CODE_ZERO_VARIANT', message: masMessage('PART_CODE_ZERO_VARIANT') });
          codeBad[zeroOf[k][e[j]]] = true;
        }
      }
    }

    for (i = 0; i < pt.rows.length; i += 1) {
      r = pt.rows[i];
      cellErrors = [];
      rc = masRowFromCells(kind, r, pt.headers, cellErrors);
      existing = f.byCode['k$' + normalizeCode(r.cells[0])] || null;
      v = validateRow(kind, rc.input, existing
        ? { rows: rowsStored, mode: 'edit', existing: existing }
        : { rows: rowsStored, mode: 'create' });
      for (j = 0; j < cellErrors.length; j += 1) plan.errors.push(cellErrors[j]);
      for (j = 0; j < v.errors.length; j += 1) {
        if (rc.bad[v.errors[j].field]) continue;
        if (v.errors[j].field === 'code' && codeBad[r.line]) continue;
        plan.errors.push({ line: r.line, field: HEADER_OF_FIELD[v.errors[j].field] || v.errors[j].field, code: v.errors[j].code, message: v.errors[j].message });
      }
      for (j = 0; j < v.warnings.length; j += 1) {
        plan.warnings.push({ line: r.line, field: HEADER_OF_FIELD[v.warnings[j].field] || v.warnings[j].field, code: v.warnings[j].code, message: v.warnings[j].message });
      }
      if (existing) {
        plan.skippedExisting.push({ line: r.line, code: existing.code, diff: v.value ? diffRows(masShapeRow(kind, existing), v.value) : [] });
      } else if (v.ok && rc.input && !codeBad[r.line]) {
        seenNew.push({ line: r.line, row: v.value });
      }
    }
    plan.errors.sort(function (x, y) { return x.line - y.line; });
    if (plan.errors.length === 0) {
      for (i = 0; i < seenNew.length; i += 1) {
        seenNew[i].row.source = 'template';
        plan.toCreate.push(seenNew[i].row);
        if (isTaxPending(seenNew[i].row)) plan.taxPendingCount += 1;
      }
      pr = rowsStored.length + plan.toCreate.length;
      if (pr > MAX_ROWS) {
        plan.code = 'MASTER_FULL';
        plan.message = masMessage('MASTER_FULL');
        plan.toCreate = [];
        plan.taxPendingCount = 0;
        return plan;
      }
      if (plan.toCreate.length === 0) {
        plan.code = 'TEMPLATE_NOTHING_TO_CREATE';
        plan.message = masMessage('TEMPLATE_NOTHING_TO_CREATE');
        return plan;
      }
      plan.ok = true;
      return plan;
    }
    plan.code = 'TEMPLATE_HAS_ERRORS';
    plan.message = masMessage('TEMPLATE_HAS_ERRORS');
    return plan;
  }

  function commitBulkCreate(store, ctx, plan) {
    var g = masGuardEdit(ctx);
    var ref;
    var kind;
    var f;
    var i;
    var row;
    var v;
    var items = [];
    var existCount = 0;
    var firstExist = '';
    var seen = {};
    var res;
    var rows;
    var zk;
    var zseen = {};
    var errors = [];
    var done;
    if (g) return g;
    if (!masIsObj(plan)) return masFail('ARGS_INVALID');
    kind = plan.kind;
    if (kind !== 'part' && kind !== 'labour') return masFail('KIND_INVALID');
    ref = masClientRef(ctx);
    if (!ref.ok) return masFail('ARGS_INVALID');
    if (plan.ok !== true || !Array.isArray(plan.toCreate)) {
      return masFail(plan.code === 'TEMPLATE_NOTHING_TO_CREATE' ? 'TEMPLATE_NOTHING_TO_CREATE' : 'TEMPLATE_HAS_ERRORS', { errors: Array.isArray(plan.errors) ? plan.errors : [] });
    }
    if (plan.toCreate.length === 0) return masFail('TEMPLATE_NOTHING_TO_CREATE');
    if (plan.toCreate.length > MAX_TEMPLATE_ROWS) return masFail('TEMPLATE_TOO_MANY_ROWS');
    if (typeof plan.batchId !== 'string' || !/^MB-[0-9a-f]{12}$/.test(plan.batchId)) return masFail('ARGS_INVALID');
    f = masFold(store, kind);
    if (!f.ok) return f;
    if (ref.ref !== '' && typeof store.findRef === 'function') {
      done = store.findRef(STREAM_OF[kind], ref.ref);
      if (done && done.k === RECORD_KINDS[kind].create && masIsObj(done.b) && done.b.via === 'template' && done.b.batchId === plan.batchId) {
        return { ok: true, created: plan.toCreate.length, batchId: plan.batchId, warnings: [], replayed: true };
      }
    }
    rows = f.rows;
    for (i = 0; i < plan.toCreate.length; i += 1) {
      row = plan.toCreate[i];
      if (f.byCode['k$' + normalizeCode(masIsObj(row) ? row.code : '')]) {
        existCount += 1;
        if (firstExist === '') firstExist = normalizeCode(row.code);
      }
    }
    if (existCount === plan.toCreate.length) return masFail('TEMPLATE_NOTHING_TO_CREATE');
    if (existCount > 0) return masFail('PART_CODE_DUPLICATE', { field: 'code', detail: firstExist });
    if (rows.length + plan.toCreate.length > MAX_ROWS) return masFail('MASTER_FULL');
    for (i = 0; i < plan.toCreate.length; i += 1) {
      v = validateRow(kind, plan.toCreate[i], { rows: rows, mode: 'create' });
      if (!v.ok) { errors = v.errors; break; }
      if (seen['k$' + v.value.code]) { errors = [masIssue('code', 'TEMPLATE_DUPLICATE_IN_FILE')]; break; }
      seen['k$' + v.value.code] = true;
      zk = codeZeroKey(v.value.code);
      if (zseen['k$' + zk] && zseen['k$' + zk] !== v.value.code) { errors = [masIssue('code', 'PART_CODE_ZERO_VARIANT')]; break; }
      zseen['k$' + zk] = v.value.code;
      items.push({ k: RECORD_KINDS[kind].create, b: masRowBody(kind, v.value.code, v.value, [], '', 'template', plan.batchId) });
    }
    if (errors.length > 0) return masFirstError(errors);
    if (ref.ref !== '') items[0].r = ref.ref;
    res = masAppend(store, kind, items, ctx, f.rev);
    if (!res.ok) return res;
    return { ok: true, created: items.length, batchId: plan.batchId, warnings: [] };
  }

  function templateExample(kind) {
    if (kind === 'labour') {
      return TEMPLATE_HEADERS.labour.join(',') + '\nTSTL001,Movement service (example),Service,job,,,500.00,yes';
    }
    return TEMPLATE_HEADERS.part.join(',') + '\nTST0001,Battery 377 (example),Battery,pc,,,150.00,yes,5,10,A1,battery|counter_saleable';
  }

  return Object.freeze({
    VERSION: MASTERS_VERSION,
    CODES: CODES,
    MESSAGES: MESSAGES,
    STREAM_OF: STREAM_OF,
    RECORD_KINDS: RECORD_KINDS,
    CODE_PATTERN: CODE_PATTERN,
    UNITS: UNITS,
    FLAG_KEYS: FLAG_KEYS,
    SENSITIVE_FIELDS: SENSITIVE_FIELDS,
    TEMPLATE_HEADERS: TEMPLATE_HEADERS,
    MAX_ROWS: MAX_ROWS,
    MAX_TEMPLATE_ROWS: MAX_TEMPLATE_ROWS,
    MAX_TEMPLATE_CHARS: MAX_TEMPLATE_CHARS,
    STEP_UP_WINDOW_MS: STEP_UP_WINDOW_MS,
    normalizeCode: normalizeCode,
    codeZeroKey: codeZeroKey,
    parsePercentToBp: parsePercentToBp,
    parseRupeesToPaise: parseRupeesToPaise,
    paiseToRupeeText: paiseToRupeeText,
    bpToPercentText: bpToPercentText,
    isTaxPending: isTaxPending,
    emptyPart: emptyPart,
    emptyLabour: emptyLabour,
    validateRow: validateRow,
    diffRows: diffRows,
    isSensitiveDiff: isSensitiveDiff,
    canUse: canUse,
    rights: rights,
    loadMasters: loadMasters,
    getRow: getRow,
    filterRows: filterRows,
    groupsOf: groupsOf,
    sortRows: sortRows,
    createRow: createRow,
    editRow: editRow,
    setActive: setActive,
    removeUnused: removeUnused,
    historyFor: historyFor,
    parseTemplate: parseTemplate,
    planBulkCreate: planBulkCreate,
    commitBulkCreate: commitBulkCreate,
    templateExample: templateExample
  });
});
