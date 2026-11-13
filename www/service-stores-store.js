(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceStoresStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * Service Stores: the one and only storage writer of the Phase 1 wave.
   * Append-only streams, split into shards (one storage key each), each record
   * chained to the one before it with SHA-256. One posting is one record is one write.
   * Pure logic: no screen code, no messages, no network, no clock of its own
   * (time comes from the injected now function) and no random numbers.
   * Money is integer paise, quantity is whole pieces. No customer data is ever stored.
   */

  var VERSION = 'SVCS_STORE_V1';
  var SVCS_PREFIX = 'saagar_svcs_';
  var HEAD_KEY = SVCS_PREFIX + 'head_v1';
  // Device-local, never listed in the backup rules, so it is never backed up or restored.
  var WATERMARK_KEY = 'st_v2_svcs_watermark_v1';
  var WATERMARK_ENABLED = true;
  var DAY_MS = 86400000;
  var INDIA_OFFSET_MS = 19800000;
  var ZERO_HASH = new Array(65).join('0');

  var LIMITS = {
    SHARD_SOFT_CAP_CHARS: 45000,
    SHARD_HARD_CAP_CHARS: 400000,
    MAX_BATCH_RECORDS: 200,
    MAX_PART: 999,
    MAX_STRING_CHARS: 400,
    MAX_DEPTH: 8,
    MAX_NUMBER_CHARS: 16,
    CLOCK_BACK_HOURS: 24
  };

  var STREAMS = {
    parts: { code: 'PRT', period: 'none', base: 'parts' },
    labour: { code: 'LAB', period: 'none', base: 'labour' },
    config: { code: 'CFG', period: 'none', base: 'config' },
    ledger: { code: 'LED', period: 'month', base: 'ledger' },
    docs: { code: 'DOC', period: 'fy', base: 'docs' },
    defective: { code: 'DEF', period: 'none', base: 'defective' },
    audit: { code: 'AUD', period: 'month', base: 'audit' }
  };
  var STREAM_NAMES = ['audit', 'config', 'defective', 'docs', 'labour', 'ledger', 'parts'];

  var SERIES = {
    GRN: { stream: 'ledger', width: 4 },
    OPN: { stream: 'ledger', width: 4 },
    ISS: { stream: 'ledger', width: 4 },
    RET: { stream: 'ledger', width: 4 },
    CSL: { stream: 'ledger', width: 4 },
    ADJ: { stream: 'ledger', width: 4 },
    OLD: { stream: 'defective', width: 4 },
    SCR: { stream: 'defective', width: 4 }
  };

  var KEY_RE = {
    head: new RegExp('^' + HEAD_KEY + '$'),
    noPeriod: new RegExp('^' + SVCS_PREFIX + '(parts|labour|config|defective)_v1(_p([2-9]|[1-9]\\d{1,2}))?$'),
    month: new RegExp('^' + SVCS_PREFIX + '(ledger|audit)_v1_(\\d{4})-(0[1-9]|1[0-2])(_p([2-9]|[1-9]\\d{1,2}))?$'),
    fy: new RegExp('^' + SVCS_PREFIX + 'docs_v1_FY(\\d{4})-(\\d{2})(_p([2-9]|[1-9]\\d{1,2}))?$'),
    watermark: /^st_v2_svcs_watermark_v1$/
  };

  var CODE_LIST = [
    'SVCS_ARGS_INVALID', 'SVCS_ACTOR_INVALID', 'SVCS_OWNER_REQUIRED', 'SVCS_STORAGE_UNAVAILABLE',
    'SVCS_BLOCKED', 'SVCS_REV_CONFLICT', 'SVCS_SHARD_UNREADABLE', 'SVCS_SHARD_NOT_ARRAY',
    'SVCS_SHARD_MISSING', 'SVCS_SEQ_GAP', 'SVCS_CHAIN_BREAK', 'SVCS_DUPLICATE_REF',
    'SVCS_SERIES_GAP', 'SVCS_SERIES_TOO_LONG', 'SVCS_SERIES_MISMATCH', 'SVCS_HEAD_MISSING',
    'SVCS_HEAD_INVALID', 'SVCS_HEAD_BEHIND', 'SVCS_HEAD_AHEAD', 'SVCS_HEAD_WRITE_FAILED',
    'SVCS_PREFIX_VIOLATION', 'SVCS_WRITE_FAILED', 'SVCS_READBACK_MISMATCH',
    'SVCS_BODY_NOT_CANONICAL', 'SVCS_BODY_FORBIDDEN_FIELD', 'SVCS_DOC_TOO_LARGE',
    'SVCS_CLOCK_BACK', 'SVCS_WATERMARK_AHEAD', 'SVCS_WATERMARK_FORK', 'SVCS_ACK_NOT_ALLOWED',
    'SVCS_WATERMARK_WRITE_FAILED', 'SVCS_FIFO_MISMATCH'
  ];
  var CODES = {};
  (function () {
    for (var i = 0; i < CODE_LIST.length; i++) CODES[CODE_LIST[i]] = CODE_LIST[i];
  })();

  var FATAL_TEXT = 'Stores data failed its safety check. Nothing can be posted. Restore your latest backup.';
  var SAVE_TEXT = 'Could not confirm the save. Reopen Stores and check before posting again.';
  var MESSAGES = {
    SVCS_ARGS_INVALID: 'The request was not valid. Check the entries and try again.',
    SVCS_ACTOR_INVALID: 'No signed-in user was found. Sign in again.',
    SVCS_OWNER_REQUIRED: 'Only the Owner can do this, after the PIN check.',
    SVCS_STORAGE_UNAVAILABLE: 'Storage is not ready yet. Wait a moment and try again.',
    SVCS_BLOCKED: FATAL_TEXT,
    SVCS_REV_CONFLICT: 'Stores changed on another screen. Reload and try again.',
    SVCS_SHARD_UNREADABLE: FATAL_TEXT,
    SVCS_SHARD_NOT_ARRAY: FATAL_TEXT,
    SVCS_SHARD_MISSING: FATAL_TEXT,
    SVCS_SEQ_GAP: FATAL_TEXT,
    SVCS_CHAIN_BREAK: FATAL_TEXT,
    SVCS_DUPLICATE_REF: 'This was already saved. Check the list before posting again.',
    SVCS_SERIES_GAP: FATAL_TEXT,
    SVCS_SERIES_TOO_LONG: 'The number would be too long.',
    SVCS_SERIES_MISMATCH: 'The posting number changed. Reload and try again.',
    SVCS_HEAD_MISSING: FATAL_TEXT,
    SVCS_HEAD_INVALID: FATAL_TEXT,
    SVCS_HEAD_BEHIND: 'A save was not finished. Reopen Stores and check before posting again.',
    SVCS_HEAD_AHEAD: FATAL_TEXT,
    SVCS_HEAD_WRITE_FAILED: SAVE_TEXT,
    SVCS_PREFIX_VIOLATION: 'The save was stopped because stored data changed unexpectedly. Reopen Stores.',
    SVCS_WRITE_FAILED: SAVE_TEXT,
    SVCS_READBACK_MISMATCH: SAVE_TEXT,
    SVCS_BODY_NOT_CANONICAL: 'A value in this entry cannot be stored.',
    SVCS_BODY_FORBIDDEN_FIELD: 'This entry has a field that is not allowed.',
    SVCS_DOC_TOO_LARGE: 'This posting is too large. Split it.',
    SVCS_CLOCK_BACK: 'The tablet clock is earlier than the last posting. Fix the clock or ask the Owner.',
    SVCS_WATERMARK_AHEAD: 'This data is older than what this device last saw. Ask the Owner.',
    SVCS_WATERMARK_FORK: 'This data differs from what this device last saw. Ask the Owner.',
    SVCS_ACK_NOT_ALLOWED: 'Nothing can be acknowledged right now.',
    SVCS_WATERMARK_WRITE_FAILED: 'The device check mark could not be saved.',
    SVCS_FIFO_MISMATCH: FATAL_TEXT
  };

  // Problems with these codes block every write and the reads of the damaged stream.
  var FATAL = {
    SVCS_SHARD_NOT_ARRAY: true, SVCS_SHARD_UNREADABLE: true, SVCS_SHARD_MISSING: true,
    SVCS_SEQ_GAP: true, SVCS_CHAIN_BREAK: true, SVCS_DUPLICATE_REF: true, SVCS_SERIES_GAP: true,
    SVCS_HEAD_MISSING: true, SVCS_HEAD_INVALID: true, SVCS_HEAD_AHEAD: true,
    SVCS_WATERMARK_AHEAD: true, SVCS_WATERMARK_FORK: true, SVCS_FIFO_MISMATCH: true
  };

  var KIND_RE = /^[A-Z][A-Z0-9_]{1,31}$/;
  var REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{2,63}$/;
  var HEX64 = /^[0-9a-f]{64}$/;
  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
  var SERIES_NO_RE = /^([A-Z]{3})\/(\d{2}-\d{2})\/(\d+)$/;
  // The Service page's own case fields (cust + name, mobile, addr) are refused too.
  var FORBIDDEN_FIELD_RE = new RegExp('^(mobile|phone|email|address|cust' + 'name|customername|customermobile|cust' + 'mobile|cust' + 'addr|customeraddress|aadhaar|pan)$', 'i');
  function badKeyName(k) { return k === '__proto__' || k === 'constructor' || k === 'prototype'; }
  var TIERS = { owner: true, manager: true, staff: true };

  /* ---------- small helpers ---------- */

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlain(v) { return v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]'; }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && Math.abs(v) <= 9007199254740991; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function clip(v, max) { var s = typeof v === 'string' ? v : ''; return s.length > max ? s.slice(0, max) : s; }
  function errDetail(e) { return String((e && (e.code || e.name)) || 'ERROR').slice(0, 40); }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      var ks = Object.keys(o);
      for (var i = 0; i < ks.length; i++) deepFreeze(o[ks[i]]);
    }
    return o;
  }

  deepFreeze(STREAMS);
  deepFreeze(SERIES);
  deepFreeze(LIMITS);
  deepFreeze(KEY_RE);
  deepFreeze(CODES);
  deepFreeze(MESSAGES);

  function fail(code, extra) {
    var o = { ok: false, status: 'BLOCKED', code: code };
    if (extra) {
      var ks = Object.keys(extra);
      for (var i = 0; i < ks.length; i++) {
        if (extra[ks[i]] !== undefined && extra[ks[i]] !== null) o[ks[i]] = extra[ks[i]];
      }
    }
    return Object.freeze(o);
  }

  function ok(o) { o.ok = true; return Object.freeze(o); }

  function prob(code, stream, key, n, detail) {
    return Object.freeze({
      code: code,
      stream: stream || null,
      key: key || null,
      n: (n === undefined || n === null) ? null : n,
      detail: detail ? String(detail).slice(0, 120) : ''
    });
  }

  /* ---------- time ---------- */

  function parseIsoMs(iso) {
    if (typeof iso !== 'string') return null;
    var m = ISO_RE.exec(iso);
    if (!m) return null;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? +((m[7] + '00').slice(0, 3)) : 0);
    if (!isFinite(ms)) return null;
    var d = new Date(ms);
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3] ||
        d.getUTCHours() !== +m[4] || d.getUTCMinutes() !== +m[5] || d.getUTCSeconds() !== +m[6]) return null;
    return ms;
  }

  function normalizeIso(iso) {
    var ms = parseIsoMs(iso);
    return ms === null ? null : new Date(ms).toISOString();
  }

  function istParts(iso) {
    var ms = parseIsoMs(iso);
    if (ms === null) return null;
    var d = new Date(ms + INDIA_OFFSET_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }

  function istMonth(iso) {
    var p = istParts(iso);
    return p ? pad(p.y, 4) + '-' + pad(p.m, 2) : null;
  }

  function istDate(iso) {
    var p = istParts(iso);
    return p ? pad(p.y, 4) + '-' + pad(p.m, 2) + '-' + pad(p.d, 2) : null;
  }

  function fyStartYear(iso) {
    var p = istParts(iso);
    if (!p) return null;
    return p.m >= 4 ? p.y : p.y - 1;
  }

  function fyLabel(iso) {
    var y = fyStartYear(iso);
    return y === null ? null : 'FY' + pad(y, 4) + '-' + pad((y + 1) % 100, 2);
  }

  function fyShort(iso) {
    var y = fyStartYear(iso);
    return y === null ? null : pad(y % 100, 2) + '-' + pad((y + 1) % 100, 2);
  }

  /* ---------- SHA-256 (FIPS 180-4), synchronous ---------- */

  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(str) {
    var out = [];
    var i = 0;
    var n = str.length;
    var c;
    var d;
    while (i < n) {
      c = str.charCodeAt(i++);
      if (c >= 0xD800 && c <= 0xDBFF) {
        if (i < n) {
          d = str.charCodeAt(i);
          if (d >= 0xDC00 && d <= 0xDFFF) {
            i++;
            c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
          } else {
            c = 0xFFFD;
          }
        } else {
          c = 0xFFFD;
        }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        c = 0xFFFD;
      }
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      } else if (c < 0x10000) {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else {
        out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return out;
  }

  function sha256Hex(text) {
    var bytes = utf8Bytes(String(text));
    var len = bytes.length;
    var padLen = ((len + 9 + 63) >> 6) << 6;
    bytes.push(0x80);
    while (bytes.length < padLen - 8) bytes.push(0);
    var hi = Math.floor(len / 0x20000000);
    var lo = (len << 3) >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    var off;
    var t;
    var x;
    var y;
    var s0;
    var s1;
    var a;
    var b;
    var c;
    var d;
    var e;
    var f;
    var g;
    var h;
    var S1;
    var ch;
    var t1;
    var S0;
    var maj;
    var t2;
    for (off = 0; off < bytes.length; off += 64) {
      for (t = 0; t < 16; t++) {
        w[t] = ((bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3]) | 0;
      }
      for (t = 16; t < 64; t++) {
        x = w[t - 15];
        s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        y = w[t - 2];
        s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (t = 0; t < 64; t++) {
        S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        ch = (e & f) ^ (~e & g);
        t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
        S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        maj = (a & b) ^ (a & c) ^ (b & c);
        t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = '';
    for (t = 0; t < 8; t++) out += ('00000000' + (H[t] >>> 0).toString(16)).slice(-8);
    return out;
  }

  /* ---------- canonical text ---------- */

  // A lone surrogate is written differently by older and newer JSON engines, so its hash would differ.
  function hasLoneSurrogate(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        var d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (d >= 0xDC00 && d <= 0xDFFF) { i++; continue; }
        return true;
      }
      if (c >= 0xDC00 && c <= 0xDFFF) return true;
    }
    return false;
  }

  function canonInner(v, depth) {
    var t = typeof v;
    var i;
    var parts;
    var s;
    var keys;
    if (v === null) return 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!isInt(v)) return null;
      return String(v);
    }
    if (t === 'string') {
      if (v.length > LIMITS.MAX_STRING_CHARS) return null;
      if (hasLoneSurrogate(v)) return null;
      return JSON.stringify(v);
    }
    if (t !== 'object') return null;
    if (depth + 1 > LIMITS.MAX_DEPTH) return null;
    if (isArray(v)) {
      parts = [];
      for (i = 0; i < v.length; i++) {
        s = canonInner(v[i], depth + 1);
        if (s === null) return null;
        parts.push(s);
      }
      return '[' + parts.join(',') + ']';
    }
    if (!isPlain(v)) return null;
    keys = Object.keys(v).sort();
    parts = [];
    for (i = 0; i < keys.length; i++) {
      if (badKeyName(keys[i]) || keys[i].length > LIMITS.MAX_STRING_CHARS || hasLoneSurrogate(keys[i])) return null;
      s = canonInner(v[keys[i]], depth + 1);
      if (s === null) return null;
      parts.push(JSON.stringify(keys[i]) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }

  function canonicalText(value) {
    return canonInner(value, 0);
  }

  function hasForbiddenField(v, depth) {
    var i;
    var keys;
    if (depth > 20 || v === null || typeof v !== 'object') return false;
    if (isArray(v)) {
      for (i = 0; i < v.length; i++) if (hasForbiddenField(v[i], depth + 1)) return true;
      return false;
    }
    keys = Object.keys(v);
    for (i = 0; i < keys.length; i++) {
      if (FORBIDDEN_FIELD_RE.test(keys[i])) return true;
      if (hasForbiddenField(v[keys[i]], depth + 1)) return true;
    }
    return false;
  }

  /* ---------- keys ---------- */

  function buildKey(stream, periodText, part) {
    var s = STREAMS[stream];
    if (!s) return null;
    var p = (part === undefined || part === null) ? 1 : part;
    if (!isInt(p) || p < 1 || p > LIMITS.MAX_PART) return null;
    var per = '';
    if (s.period !== 'none') {
      if (typeof periodText !== 'string' || periodText === '') return null;
      per = '_' + periodText;
    }
    return SVCS_PREFIX + s.base + '_v1' + per + (p > 1 ? '_p' + p : '');
  }

  function periodFor(stream, atIso) {
    var s = STREAMS[stream];
    if (!s) return null;
    if (s.period === 'month') return istMonth(atIso);
    if (s.period === 'fy') return fyLabel(atIso);
    return '';
  }

  function shardKey(stream, atIso, part) {
    var s = STREAMS[stream];
    if (!s) return null;
    var per = periodFor(stream, atIso);
    if (per === null) return null;
    return buildKey(stream, per, part);
  }

  function parseShardKey(key) {
    if (typeof key !== 'string') return null;
    var m = KEY_RE.noPeriod.exec(key);
    if (m) return Object.freeze({ stream: m[1], period: '', part: m[3] ? parseInt(m[3], 10) : 1 });
    m = KEY_RE.month.exec(key);
    if (m) return Object.freeze({ stream: m[1], period: m[2] + '-' + m[3], part: m[5] ? parseInt(m[5], 10) : 1 });
    m = KEY_RE.fy.exec(key);
    if (m) return Object.freeze({ stream: 'docs', period: 'FY' + m[1] + '-' + m[2], part: m[4] ? parseInt(m[4], 10) : 1 });
    return null;
  }

  /* ---------- adapter for the Service page (the wave's only storage write site) ---------- */

  function parentStore(win) {
    try {
      var p = win && win.parent && win.parent.SaagarStore;
      return p || null;
    } catch (e) {
      return null;
    }
  }

  function adapterFromWindow(win) {
    return {
      getItem: function (k) { return win.localStorage.getItem(k); },
      // Storage write: head, shard and watermark keys of this store. May throw (blocked or full).
      setItem: function (k, v) { win.localStorage.setItem(k, v); },
      keys: function () {
        var p = parentStore(win);
        var out = [];
        var i;
        var k;
        if (p && typeof p.keys === 'function') {
          try {
            var got = p.keys();
            if (isArray(got)) return got;
          } catch (e) { /* fall back to one local loop */ }
        }
        for (i = 0; i < win.localStorage.length; i++) {
          k = win.localStorage.key(i);
          if (k !== null && k !== undefined) out.push(k);
        }
        return out;
      },
      authoritative: function () {
        var p = parentStore(win);
        try {
          if (!p || typeof p.authoritative !== 'function') return true;
          return p.authoritative() === true;
        } catch (e) {
          return false;
        }
      }
    };
  }

  /* ---------- head rows ---------- */

  function validHeadRow(r) {
    if (!isPlain(r)) return false;
    var ks = Object.keys(r);
    if (ks.length !== 6) return false;
    if (typeof r.s !== 'string' || !STREAMS[r.s]) return false;
    if (!isInt(r.rev) || r.rev < 1 || !isInt(r.n) || r.n < 1) return false;
    if (typeof r.h !== 'string' || !HEX64.test(r.h)) return false;
    if (typeof r.at !== 'string' || normalizeIso(r.at) !== r.at) return false;
    if (typeof r.key !== 'string') return false;
    var pk = parseShardKey(r.key);
    return !!pk && pk.stream === r.s;
  }

  function parseHeadText(raw) {
    var arr;
    try { arr = JSON.parse(raw); } catch (e) { return { ok: false, code: 'SVCS_SHARD_NOT_ARRAY', detail: 'head is not valid JSON' }; }
    if (!isArray(arr)) return { ok: false, code: 'SVCS_SHARD_NOT_ARRAY', detail: 'head is not an array' };
    var rows = {};
    for (var i = 0; i < arr.length; i++) {
      if (!validHeadRow(arr[i])) return { ok: false, code: 'SVCS_HEAD_INVALID', detail: 'bad head row ' + i };
      if (rows[arr[i].s]) return { ok: false, code: 'SVCS_HEAD_INVALID', detail: 'duplicate head row' };
      rows[arr[i].s] = arr[i];
    }
    return { ok: true, rows: rows };
  }

  function headRowText(r) {
    return '{"s":' + JSON.stringify(r.s) + ',"rev":' + r.rev + ',"n":' + r.n + ',"h":"' + r.h +
      '","at":' + JSON.stringify(r.at) + ',"key":' + JSON.stringify(r.key) + '}';
  }

  function headText(rows) {
    var names = Object.keys(rows).sort();
    var parts = [];
    for (var i = 0; i < names.length; i++) parts.push(headRowText(rows[names[i]]));
    return '[' + parts.join(',') + ']';
  }

  /* ---------- record helpers ---------- */

  function recordHash(stream, p, n, at, k, r, aText, bText) {
    return sha256Hex(stream + '\n' + p + '\n' + n + '\n' + at + '\n' + k + '\n' + (r || '') + '\n' + aText + '\n' + bText);
  }

  function recordIdFor(stream, n) { return STREAMS[stream].code + '-' + pad(n, 6); }

  function actorOk(a) {
    return isPlain(a) && typeof a.t === 'string' && TIERS[a.t] === true && typeof a.r === 'string' && typeof a.m === 'string';
  }

  function normActor(a) {
    if (!isPlain(a)) return null;
    var t = a.t !== undefined ? a.t : a.tier;
    if (typeof t !== 'string' || TIERS[t] !== true) return null;
    var r = a.r !== undefined ? a.r : a.role;
    var m = a.m !== undefined ? a.m : (a.name !== undefined ? a.name : a.actorName);
    return { t: t, r: clip(r, 40), m: clip(m, 60) };
  }

  function recordShapeOk(rec) {
    if (!isPlain(rec)) return false;
    var ks = Object.keys(rec);
    var allowed = { n: 1, id: 1, at: 1, k: 1, r: 1, a: 1, b: 1, p: 1, h: 1 };
    var i;
    for (i = 0; i < ks.length; i++) if (allowed[ks[i]] !== 1) return false;
    if (!isInt(rec.n) || rec.n < 1) return false;
    if (typeof rec.id !== 'string') return false;
    if (typeof rec.at !== 'string' || normalizeIso(rec.at) !== rec.at) return false;
    if (typeof rec.k !== 'string' || !KIND_RE.test(rec.k)) return false;
    if (rec.r !== undefined && (typeof rec.r !== 'string' || !REF_RE.test(rec.r))) return false;
    if (!actorOk(rec.a)) return false;
    if (!isPlain(rec.b)) return false;
    if (typeof rec.p !== 'string' || !HEX64.test(rec.p)) return false;
    if (typeof rec.h !== 'string' || !HEX64.test(rec.h)) return false;
    return true;
  }

  /* ---------- the store ---------- */

  function createStore(adapter, options) {
    if (!adapter || typeof adapter.getItem !== 'function' || typeof adapter.setItem !== 'function') {
      return fail('SVCS_ARGS_INVALID', { detail: 'adapter' });
    }
    if (!options || typeof options.now !== 'function') return fail('SVCS_ARGS_INVALID', { detail: 'now' });
    var nowFn = options.now;
    var wmOn = options.watermark === undefined ? WATERMARK_ENABLED : options.watermark === true;
    var writeFn = adapter.setItem;
    var mem = emptyMem();
    var lastReplay = null;

    function emptyStream() {
      return { records: [], recKey: [], refs: Object.create(null), rev: 0, n: 0, h: ZERO_HASH, at: null, key: null, lastRaw: '', parts: 0 };
    }

    function emptyMem() {
      return { opened: false, streams: {}, series: {}, problems: [], blocked: false, watermark: 'OFF', warnings: [], healed: [] };
    }

    /* adapter wrappers: nothing here throws */

    function isAuth() {
      try {
        if (typeof adapter.authoritative !== 'function') return true;
        return adapter.authoritative() === true;
      } catch (e) {
        return false;
      }
    }

    function getRaw(key) {
      try {
        var v = adapter.getItem(key);
        return { ok: true, raw: (v === undefined || v === null) ? null : String(v) };
      } catch (e) {
        return { ok: false, detail: errDetail(e) };
      }
    }

    function put(key, value) {
      try {
        writeFn.call(adapter, key, value);
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: errDetail(e) };
      }
    }

    function putChecked(key, value) {
      var w = put(key, value);
      if (!w.ok) return { ok: false, code: 'write', detail: w.detail };
      var rb = getRaw(key);
      if (!rb.ok || rb.raw !== value) return { ok: false, code: 'readback', detail: rb.ok ? 'read-back differs' : rb.detail };
      return { ok: true };
    }

    function listKeys() {
      try {
        if (typeof adapter.keys === 'function') {
          var k = adapter.keys();
          return isArray(k) ? k : null;
        }
        if (typeof adapter.length === 'number' && typeof adapter.key === 'function') {
          var out = [];
          for (var i = 0; i < adapter.length; i++) {
            var x = adapter.key(i);
            if (x !== null && x !== undefined) out.push(x);
          }
          return out;
        }
      } catch (e) { /* unreadable */ }
      return null;
    }

    function readClock() {
      var v;
      try { v = nowFn(); } catch (e) { return null; }
      if (v === null || v === undefined) return null;
      try {
        if (typeof v === 'string') return normalizeIso(v);
        if (typeof v === 'number') return isFinite(v) ? normalizeIso(new Date(v).toISOString()) : null;
        if (typeof v === 'object' && typeof v.toISOString === 'function') return normalizeIso(v.toISOString());
      } catch (e2) { return null; }
      return null;
    }

    function computeAt(lastAt, override) {
      var now = readClock();
      if (now === null) return fail('SVCS_ARGS_INVALID', { detail: 'clock' });
      if (lastAt === null || lastAt === undefined || now >= lastAt) return { ok: true, at: now, clamped: false, overridden: false };
      var gap = parseIsoMs(lastAt) - parseIsoMs(now);
      if (gap > LIMITS.CLOCK_BACK_HOURS * 3600000) {
        if (!override) return fail('SVCS_CLOCK_BACK', { detail: 'clock is more than 24 hours behind' });
        return { ok: true, at: lastAt, clamped: true, overridden: true };
      }
      return { ok: true, at: lastAt, clamped: true, overridden: false };
    }

    function readHeadFresh() {
      var rr = getRaw(HEAD_KEY);
      if (!rr.ok) return { ok: false, code: 'SVCS_SHARD_UNREADABLE', detail: rr.detail };
      if (rr.raw === null) return { ok: true, rows: {}, missing: true };
      var ph = parseHeadText(rr.raw);
      if (!ph.ok) return { ok: false, code: ph.code, detail: ph.detail };
      return { ok: true, rows: ph.rows, missing: false };
    }

    /* ---------- verification scan ---------- */

    function checkRecord(stream, rec, st) {
      if (!recordShapeOk(rec)) return { code: 'SVCS_CHAIN_BREAK', detail: 'record shape', n: isInt(rec && rec.n) ? rec.n : st.prevN + 1 };
      if (rec.n !== st.prevN + 1) return { code: 'SVCS_SEQ_GAP', detail: 'expected ' + (st.prevN + 1), n: rec.n };
      if (rec.id !== recordIdFor(stream, rec.n)) return { code: 'SVCS_CHAIN_BREAK', detail: 'record id', n: rec.n };
      if (rec.p !== st.prevH) return { code: 'SVCS_CHAIN_BREAK', detail: 'previous hash', n: rec.n };
      var aText = canonicalText(rec.a);
      var bText = canonicalText(rec.b);
      if (aText === null || bText === null) return { code: 'SVCS_CHAIN_BREAK', detail: 'body not canonical', n: rec.n };
      if (recordHash(stream, rec.p, rec.n, rec.at, rec.k, rec.r, aText, bText) !== rec.h) {
        return { code: 'SVCS_CHAIN_BREAK', detail: 'record hash', n: rec.n };
      }
      if (rec.r !== undefined) {
        if (st.refs[rec.r] !== undefined) return { code: 'SVCS_DUPLICATE_REF', detail: 'reference used twice', n: rec.n };
      }
      var no = rec.b.no;
      if (typeof no === 'string') {
        var m = SERIES_NO_RE.exec(no);
        if (m && SERIES[m[1]] && SERIES[m[1]].stream === stream) {
          var num = parseInt(m[3], 10);
          var lk = m[1] + '|' + m[2];
          var want = (st.series[lk] || 0) + 1;
          if (no !== m[1] + '/' + m[2] + '/' + pad(num, SERIES[m[1]].width) || fyShort(rec.at) !== m[2] || num !== want) {
            return { code: 'SVCS_SERIES_GAP', detail: 'number out of order', n: rec.n };
          }
          st.series[lk] = num;
        }
      }
      return null;
    }

    function walkStream(name, shardList, snap) {
      var S = emptyStream();
      S.broken = false;
      snap.streams[name] = S;
      var st = { prevN: 0, prevH: ZERO_HASH, prevAt: null, refs: S.refs, series: snap.series };
      var si;
      var i;
      var rr;
      var arr;
      var rec;
      var bad;
      var lastKey = null;
      var lastRaw = '';
      var shardCount = 0;
      for (si = 0; si < shardList.length && !S.broken; si++) {
        var key = shardList[si].key;
        rr = getRaw(key);
        if (!rr.ok) { snap.problems.push(prob('SVCS_SHARD_UNREADABLE', name, key, null, rr.detail)); S.broken = true; break; }
        if (rr.raw === null) { snap.problems.push(prob('SVCS_SHARD_MISSING', name, key, null, 'key listed but empty')); S.broken = true; break; }
        arr = undefined;
        try { arr = JSON.parse(rr.raw); } catch (e) { arr = undefined; }
        if (!isArray(arr)) { snap.problems.push(prob('SVCS_SHARD_NOT_ARRAY', name, key, null, 'not a JSON array')); S.broken = true; break; }
        if (arr.length === 0) continue;
        shardCount++;
        lastKey = key;
        lastRaw = rr.raw;
        for (i = 0; i < arr.length; i++) {
          rec = arr[i];
          bad = checkRecord(name, rec, st);
          if (bad) {
            snap.problems.push(prob(bad.code, name, key, bad.n, bad.detail));
            S.broken = true;
            break;
          }
          if (st.prevAt !== null && parseIsoMs(rec.at) < parseIsoMs(st.prevAt) - DAY_MS) {
            snap.warnings.push('SVCS_CLOCK_BACK:' + name + ':' + rec.n);
          }
          deepFreeze(rec);
          S.records.push(rec);
          S.recKey.push(key);
          if (rec.r !== undefined) S.refs[rec.r] = S.records.length - 1;
          st.prevN = rec.n;
          st.prevH = rec.h;
          st.prevAt = rec.at;
        }
      }
      if (!S.broken && S.records.length > 0) {
        S.n = st.prevN;
        S.h = st.prevH;
        S.at = st.prevAt;
        S.key = lastKey;
        S.lastRaw = lastRaw;
        S.parts = shardCount;
      }
      return S;
    }

    function evalWatermark(wm, snap) {
      var found = [];
      var names = Object.keys(wm.streams).sort();
      var forkSeen = false;
      var aheadSeen = false;
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (!STREAMS[name]) continue;
        var w = wm.streams[name];
        var S = snap.streams[name];
        if (!S || S.broken || w.n === 0) continue;
        if (S.n < w.n) {
          aheadSeen = true;
          found.push(prob('SVCS_WATERMARK_AHEAD', name, S.key, S.n, 'device saw ' + w.n + ' records, data has ' + S.n));
        } else if (S.n === w.n) {
          if (S.h !== w.h) {
            forkSeen = true;
            found.push(prob('SVCS_WATERMARK_FORK', name, S.key, S.n, 'same position, different content'));
          }
        } else if (S.records[w.n - 1].h !== w.h) {
          forkSeen = true;
          found.push(prob('SVCS_WATERMARK_FORK', name, S.key, w.n, 'content differs from what the device saw'));
        }
      }
      return { state: forkSeen ? 'FORK' : (aheadSeen ? 'AHEAD' : 'OK'), problems: found };
    }

    function parseWatermark(raw) {
      var o;
      try { o = JSON.parse(raw); } catch (e) { return null; }
      if (!isPlain(o) || o.v !== 1 || !isPlain(o.streams)) return null;
      var names = Object.keys(o.streams);
      for (var i = 0; i < names.length; i++) {
        var w = o.streams[names[i]];
        if (!isPlain(w) || !isInt(w.n) || w.n < 0 || typeof w.h !== 'string' || !HEX64.test(w.h)) return null;
      }
      return o;
    }

    function watermarkTextFor(streams, at) {
      var out = {};
      for (var i = 0; i < STREAM_NAMES.length; i++) {
        var S = streams[STREAM_NAMES[i]];
        if (S && S.n > 0) out[STREAM_NAMES[i]] = { rev: S.rev, n: S.n, h: S.h };
      }
      return canonicalText({ v: 1, at: at, streams: out });
    }

    function latestAt(streams) {
      var best = '';
      for (var i = 0; i < STREAM_NAMES.length; i++) {
        var S = streams[STREAM_NAMES[i]];
        if (S && S.at && S.at > best) best = S.at;
      }
      return best || null;
    }

    function hasHeads(streams) {
      for (var i = 0; i < STREAM_NAMES.length; i++) if (streams[STREAM_NAMES[i]] && streams[STREAM_NAMES[i]].n > 0) return true;
      return false;
    }

    function scan(heal, replayFn) {
      if (!isAuth()) return fail('SVCS_STORAGE_UNAVAILABLE', { detail: 'storage not ready' });
      var keys = listKeys();
      if (keys === null) return fail('SVCS_STORAGE_UNAVAILABLE', { detail: 'key list unreadable' });
      var snap = { streams: {}, problems: [], warnings: [], healed: [], series: {} };
      var byStream = {};
      var i;
      var j;
      var anyShards = false;
      for (i = 0; i < keys.length; i++) {
        var pk = parseShardKey(keys[i]);
        if (pk) {
          if (!byStream[pk.stream]) byStream[pk.stream] = [];
          byStream[pk.stream].push({ key: keys[i], period: pk.period, part: pk.part });
          anyShards = true;
        }
      }
      var headRaw = getRaw(HEAD_KEY);
      var headRows = null;
      var headMissing = false;
      if (!headRaw.ok) {
        snap.problems.push(prob('SVCS_SHARD_UNREADABLE', null, HEAD_KEY, null, headRaw.detail));
      } else if (headRaw.raw === null) {
        headMissing = true;
      } else {
        var ph = parseHeadText(headRaw.raw);
        if (ph.ok) headRows = ph.rows;
        else snap.problems.push(prob(ph.code, null, HEAD_KEY, null, ph.detail));
      }

      for (i = 0; i < STREAM_NAMES.length; i++) {
        var name = STREAM_NAMES[i];
        var list = byStream[name] || [];
        list.sort(function (x, y) {
          if (x.period !== y.period) return x.period < y.period ? -1 : 1;
          return x.part - y.part;
        });
        walkStream(name, list, snap);
      }

      // Compare each stream with its head row, and decide what can be healed.
      var needHeal = [];
      var totalShards = 0;
      var streamsWithData = 0;
      for (i = 0; i < STREAM_NAMES.length; i++) {
        var nm = STREAM_NAMES[i];
        var S = snap.streams[nm];
        totalShards += S.parts;
        if (S.n > 0) streamsWithData++;
      }
      var narrowHeal = false;
      if (headMissing && anyShards) {
        // One record in one shard of one stream: the very first write stopped before its head row. Safe to heal.
        for (i = 0; i < STREAM_NAMES.length; i++) {
          var one = snap.streams[STREAM_NAMES[i]];
          if (one.n === 1 && one.parts === 1 && !one.broken && streamsWithData === 1 && totalShards === 1) narrowHeal = true;
        }
        if (narrowHeal) headRows = {};
        else snap.problems.push(prob('SVCS_HEAD_MISSING', null, HEAD_KEY, null, 'shards exist but the head row list is gone'));
      }
      if (headRows !== null) {
        for (i = 0; i < STREAM_NAMES.length; i++) {
          var sn = STREAM_NAMES[i];
          var X = snap.streams[sn];
          var row = headRows[sn] || null;
          if (X.broken) { X.rev = row ? row.rev : 0; continue; }
          if (!row) {
            if (X.n > 0) { X.rev = 0; needHeal.push(sn); }
            continue;
          }
          X.rev = row.rev;
          if (row.n > X.n) {
            snap.problems.push(prob('SVCS_HEAD_AHEAD', sn, row.key, row.n, 'head expects ' + row.n + ' records, data has ' + X.n));
            X.broken = true;
          } else if (row.n < X.n) {
            if (X.records[row.n - 1].h === row.h) needHeal.push(sn);
            else { snap.problems.push(prob('SVCS_CHAIN_BREAK', sn, row.key, row.n, 'head differs from the chain')); X.broken = true; }
          } else if (row.h !== X.h) {
            snap.problems.push(prob('SVCS_CHAIN_BREAK', sn, row.key, X.n, 'head hash differs from the last record'));
            X.broken = true;
          } else if (row.at !== X.at) {
            // The head time drives the clock clamp of the next posting, so a wrong one is never trusted.
            snap.problems.push(prob('SVCS_HEAD_INVALID', sn, HEAD_KEY, X.n, 'head time differs from the last record'));
            X.broken = true;
          } else if (row.key !== X.key) {
            needHeal.push(sn);
          }
        }
      }

      // Heal the control row only (never a shard).
      if (needHeal.length > 0) {
        var healed = false;
        if (heal && headRows !== null) {
          var newRows = {};
          var hk = Object.keys(headRows);
          for (j = 0; j < hk.length; j++) newRows[hk[j]] = headRows[hk[j]];
          var healRev = {};
          for (j = 0; j < needHeal.length; j++) {
            var hs = snap.streams[needHeal[j]];
            var old = headRows[needHeal[j]] || null;
            healRev[needHeal[j]] = old ? old.rev + 1 : 1;
            newRows[needHeal[j]] = { s: needHeal[j], rev: healRev[needHeal[j]], n: hs.n, h: hs.h, at: hs.at, key: hs.key };
          }
          var wr = putChecked(HEAD_KEY, headText(newRows));
          if (wr.ok) {
            healed = true;
            for (j = 0; j < needHeal.length; j++) {
              snap.streams[needHeal[j]].rev = healRev[needHeal[j]];
              snap.healed.push('HEAD_HEALED:' + needHeal[j]);
            }
          } else {
            for (j = 0; j < needHeal.length; j++) {
              snap.problems.push(prob('SVCS_HEAD_WRITE_FAILED', needHeal[j], HEAD_KEY, null, wr.detail));
            }
          }
        }
        if (!healed && !(heal && headRows !== null)) {
          for (j = 0; j < needHeal.length; j++) {
            snap.problems.push(prob('SVCS_HEAD_BEHIND', needHeal[j], snap.streams[needHeal[j]].key, snap.streams[needHeal[j]].n, 'save not finished'));
          }
        }
      }

      // Number series index from the walked chains.
      var seriesIdx = snap.series;

      // Core replay (FIFO and so on) is supplied by the caller. Any problem it returns blocks.
      var anyBroken = false;
      for (i = 0; i < STREAM_NAMES.length; i++) if (snap.streams[STREAM_NAMES[i]].broken) anyBroken = true;
      var fatalSoFar = anyBroken;
      for (i = 0; i < snap.problems.length; i++) if (FATAL[snap.problems[i].code] === true) fatalSoFar = true;
      if (typeof replayFn === 'function' && !fatalSoFar) {
        var byName = {};
        for (i = 0; i < STREAM_NAMES.length; i++) byName[STREAM_NAMES[i]] = Object.freeze(snap.streams[STREAM_NAMES[i]].records.slice());
        Object.freeze(byName);
        var rp = null;
        try { rp = replayFn(byName); } catch (e3) { rp = [{ code: 'SVCS_FIFO_MISMATCH', detail: 'replay stopped with an error' }]; }
        if (isArray(rp)) {
          for (i = 0; i < rp.length; i++) {
            var q = rp[i] || {};
            snap.problems.push(Object.freeze({
              code: String(q.code || 'SVCS_FIFO_MISMATCH'),
              stream: q.stream || null,
              key: q.key || null,
              n: (q.n === undefined || q.n === null) ? null : q.n,
              detail: q.detail ? String(q.detail).slice(0, 120) : '',
              fatal: q.fatal === false ? false : true
            }));
          }
        }
      }

      // Watermark.
      var wmState = 'OFF';
      var wmWrite = false;
      if (wmOn) {
        var wmRaw = getRaw(WATERMARK_KEY);
        var wm = null;
        var wmBad = false;
        if (wmRaw.ok && wmRaw.raw !== null) {
          wm = parseWatermark(wmRaw.raw);
          if (wm === null) { wmBad = true; snap.warnings.push('SVCS_WATERMARK_INVALID'); }
        }
        fatalSoFar = false;
        for (i = 0; i < snap.problems.length; i++) if (isFatalProblem(snap.problems[i])) fatalSoFar = true;
        for (i = 0; i < STREAM_NAMES.length; i++) if (snap.streams[STREAM_NAMES[i]].broken) fatalSoFar = true;
        if (wm === null) {
          wmState = hasHeads(snap.streams) ? 'INIT' : 'OK';
          wmWrite = hasHeads(snap.streams) && !fatalSoFar;
          if (!wmRaw.ok) { wmState = 'OK'; wmWrite = false; }
          if (wmBad) wmWrite = hasHeads(snap.streams) && !fatalSoFar;
        } else {
          var ev = evalWatermark(wm, snap);
          wmState = ev.state;
          for (i = 0; i < ev.problems.length; i++) snap.problems.push(ev.problems[i]);
          if (ev.state === 'OK' && !fatalSoFar) {
            // Data may be newer than the stored mark: move the mark forward.
            var cur = watermarkTextFor(snap.streams, latestAt(snap.streams));
            if (wmRaw.raw !== cur) wmWrite = true;
          }
        }
        if (wmWrite && heal) {
          var at = latestAt(snap.streams);
          var wt = watermarkTextFor(snap.streams, at);
          var ww = put(WATERMARK_KEY, wt);
          if (!ww.ok) snap.warnings.push('SVCS_WATERMARK_WRITE_FAILED');
        }
      }

      snap.watermark = wmState;
      snap.headRows = headRows;
      snap.seriesIdx = seriesIdx;
      return { ok: true, snap: snap };
    }

    function isFatalProblem(p) {
      if (p.fatal === false) return false;
      if (p.fatal === true) return true;
      return FATAL[p.code] === true;
    }

    function commit(snap) {
      var next = emptyMem();
      next.opened = true;
      var i;
      for (i = 0; i < STREAM_NAMES.length; i++) {
        var S = snap.streams[STREAM_NAMES[i]];
        next.streams[STREAM_NAMES[i]] = S;
      }
      next.series = snap.series;
      next.problems = snap.problems;
      next.warnings = snap.warnings;
      next.healed = snap.healed;
      next.watermark = snap.watermark;
      var blockedNow = false;
      for (i = 0; i < snap.problems.length; i++) if (isFatalProblem(snap.problems[i])) blockedNow = true;
      for (i = 0; i < STREAM_NAMES.length; i++) if (snap.streams[STREAM_NAMES[i]].broken) blockedNow = true;
      next.blocked = blockedNow;
      mem = next;
    }

    function summaryOf() {
      var counts = {};
      var streams = {};
      for (var i = 0; i < STREAM_NAMES.length; i++) {
        var S = mem.streams[STREAM_NAMES[i]];
        counts[STREAM_NAMES[i]] = S.n;
        if (S.n > 0) streams[STREAM_NAMES[i]] = { rev: S.rev, n: S.n, h: S.h, at: S.at, parts: S.parts };
      }
      return { streams: streams, summary: { lastAt: latestAt(mem.streams), counts: counts } };
    }

    function openResult() {
      var s = summaryOf();
      return ok({
        blocked: mem.blocked,
        problems: Object.freeze(mem.problems.slice()),
        healed: Object.freeze(mem.healed.slice()),
        warnings: Object.freeze(mem.warnings.slice()),
        streams: deepFreeze(s.streams),
        watermark: mem.watermark,
        summary: deepFreeze(s.summary)
      });
    }

    function doOpen(openOpts, heal) {
      // A replay check, once given, stays: a later open() or verifyAll() without it must not clear its block.
      if (openOpts && typeof openOpts.replay === 'function') lastReplay = openOpts.replay;
      var replayFn = lastReplay || (typeof options.replay === 'function' ? options.replay : null);
      var r = scan(heal, replayFn);
      if (r.ok !== true) return r;
      commit(r.snap);
      return openResult();
    }

    function ensureOpen() {
      if (mem.opened) return null;
      var r = doOpen({}, true);
      return r.ok === true ? null : r;
    }

    function streamBlocked(stream) {
      if (!mem.blocked) return false;
      for (var i = 0; i < mem.problems.length; i++) {
        var p = mem.problems[i];
        if (isFatalProblem(p) && (!p.stream || p.stream === stream)) return true;
      }
      return mem.streams[stream] ? !!mem.streams[stream].broken : false;
    }

    /* ---------- reads ---------- */

    function readFrom(stream, periodFilter) {
      var ms = mem.streams[stream];
      var out = [];
      for (var i = 0; i < ms.records.length; i++) {
        if (periodFilter !== null) {
          var pk = parseShardKey(ms.recKey[i]);
          if (!pk || pk.period !== periodFilter) continue;
        }
        out.push(ms.records[i]);
      }
      return ok({ records: Object.freeze(out), rev: ms.rev, n: ms.n, h: ms.h });
    }

    function read(stream) {
      if (!STREAMS[stream]) return fail('SVCS_ARGS_INVALID', { detail: 'stream' });
      var f = ensureOpen();
      if (f) return f;
      if (streamBlocked(stream)) return fail('SVCS_BLOCKED', { stream: stream });
      return readFrom(stream, null);
    }

    function readPeriod(stream, period) {
      if (!STREAMS[stream]) return fail('SVCS_ARGS_INVALID', { detail: 'stream' });
      var f = ensureOpen();
      if (f) return f;
      if (streamBlocked(stream)) return fail('SVCS_BLOCKED', { stream: stream });
      var kind = STREAMS[stream].period;
      if (kind === 'none') return readFrom(stream, null);
      if (typeof period !== 'string' || period === '') return fail('SVCS_ARGS_INVALID', { detail: 'period' });
      var p = period;
      if (kind === 'fy' && p.indexOf('FY') !== 0) p = 'FY' + p;
      return readFrom(stream, p);
    }

    function findRef(stream, ref) {
      if (!STREAMS[stream] || typeof ref !== 'string') return null;
      if (ensureOpen()) return null;
      if (streamBlocked(stream)) return null;
      var ms = mem.streams[stream];
      var idx = ms.refs[ref];
      return idx === undefined ? null : ms.records[idx];
    }

    function head(stream) {
      if (!STREAMS[stream]) return fail('SVCS_ARGS_INVALID', { detail: 'stream' });
      if (!isAuth()) return fail('SVCS_STORAGE_UNAVAILABLE');
      var hd = readHeadFresh();
      if (!hd.ok) return fail(hd.code, { detail: hd.detail });
      var row = hd.rows[stream] || null;
      if (!row) return ok({ rev: 0, n: 0, h: ZERO_HASH, at: null, key: null });
      return ok({ rev: row.rev, n: row.n, h: row.h, at: row.at, key: row.key });
    }

    function nextAt(stream, o) {
      if (!STREAMS[stream]) return fail('SVCS_ARGS_INVALID', { detail: 'stream' });
      if (!isAuth()) return fail('SVCS_STORAGE_UNAVAILABLE');
      var hd = readHeadFresh();
      if (!hd.ok) return fail(hd.code, { detail: hd.detail });
      var row = hd.rows[stream] || null;
      var c = computeAt(row ? row.at : null, !!(o && o.clockOverride === true));
      if (c.ok !== true) return c;
      return ok({ at: c.at, clamped: c.clamped, overridden: c.overridden });
    }

    function seriesLast(series, fy) {
      return mem.series[series + '|' + fy] || 0;
    }

    function lastNumber(series, atIso) {
      if (!SERIES[series]) return fail('SVCS_ARGS_INVALID', { detail: 'series' });
      var fy = fyShort(atIso);
      if (fy === null) return fail('SVCS_ARGS_INVALID', { detail: 'at' });
      var f = ensureOpen();
      if (f) return f;
      if (mem.blocked) return fail('SVCS_BLOCKED');
      return ok({ fy: fy, last: seriesLast(series, fy) });
    }

    function nextNumber(series, atIso) {
      var l = lastNumber(series, atIso);
      if (l.ok !== true) return l;
      var no = series + '/' + l.fy + '/' + pad(l.last + 1, SERIES[series].width);
      if (no.length > LIMITS.MAX_NUMBER_CHARS) return fail('SVCS_SERIES_TOO_LONG');
      return ok({ no: no });
    }

    /* ---------- append ---------- */

    function watermarkAfterAppend(at) {
      if (!wmOn) return [];
      var w = put(WATERMARK_KEY, watermarkTextFor(mem.streams, latestAt(mem.streams) || at));
      return w.ok ? [] : ['SVCS_WATERMARK_WRITE_FAILED'];
    }

    function appendCore(stream, items, opts, allowWatermarkBlock) {
      var i;
      var j;
      // 1. arguments
      if (!STREAMS[stream]) return fail('SVCS_ARGS_INVALID', { detail: 'stream' });
      if (!isArray(items) || items.length < 1 || items.length > LIMITS.MAX_BATCH_RECORDS) return fail('SVCS_ARGS_INVALID', { detail: 'items' });
      if (!isPlain(opts) || !isInt(opts.expectRev) || opts.expectRev < 0) return fail('SVCS_ARGS_INVALID', { detail: 'expectRev' });
      if (opts.at !== undefined && opts.at !== null && normalizeIso(opts.at) === null) return fail('SVCS_ARGS_INVALID', { detail: 'at' });
      if (opts.guardRevs !== undefined && opts.guardRevs !== null) {
        if (!isPlain(opts.guardRevs)) return fail('SVCS_ARGS_INVALID', { detail: 'guardRevs' });
        var gk = Object.keys(opts.guardRevs);
        for (i = 0; i < gk.length; i++) {
          if (!STREAMS[gk[i]] || !isInt(opts.guardRevs[gk[i]]) || opts.guardRevs[gk[i]] < 0) return fail('SVCS_ARGS_INVALID', { detail: 'guardRevs' });
        }
      }
      var seenRefs = {};
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (!isPlain(it) || typeof it.k !== 'string' || !KIND_RE.test(it.k) || !isPlain(it.b)) return fail('SVCS_ARGS_INVALID', { detail: 'item ' + i });
        if (it.r !== undefined && it.r !== null && (typeof it.r !== 'string' || !REF_RE.test(it.r))) return fail('SVCS_ARGS_INVALID', { detail: 'ref ' + i });
        if (it.series !== undefined && it.series !== null) {
          if (typeof it.series !== 'string' || !SERIES[it.series] || SERIES[it.series].stream !== stream) return fail('SVCS_ARGS_INVALID', { detail: 'series ' + i });
        } else if (typeof it.b.no === 'string') {
          var nm = SERIES_NO_RE.exec(it.b.no);
          if (nm && SERIES[nm[1]] && SERIES[nm[1]].stream === stream) return fail('SVCS_ARGS_INVALID', { detail: 'number without series' });
        }
      }
      var actor = normActor(opts.actor);
      if (!actor) return fail('SVCS_ACTOR_INVALID');
      // 2. storage ready
      if (!isAuth()) return fail('SVCS_STORAGE_UNAVAILABLE', { detail: 'storage not ready' });
      var fo = ensureOpen();
      if (fo) return fo;
      // 3. blocked
      if (mem.blocked && !allowWatermarkBlock) return fail('SVCS_BLOCKED');
      // 4. revision lock, fresh from storage
      var hd = readHeadFresh();
      if (!hd.ok) return fail(hd.code, { detail: hd.detail, stream: stream });
      var anyMemData = false;
      for (i = 0; i < STREAM_NAMES.length; i++) if (mem.streams[STREAM_NAMES[i]].n > 0) anyMemData = true;
      if (hd.missing && anyMemData) return fail('SVCS_HEAD_MISSING', { stream: stream });
      var cur = hd.rows[stream] || null;
      var curRev = cur ? cur.rev : 0;
      if (curRev !== opts.expectRev) return fail('SVCS_REV_CONFLICT', { stream: stream, detail: 'current revision ' + curRev });
      if (opts.guardRevs) {
        var gks = Object.keys(opts.guardRevs);
        for (i = 0; i < gks.length; i++) {
          var grow = hd.rows[gks[i]] || null;
          if ((grow ? grow.rev : 0) !== opts.guardRevs[gks[i]]) return fail('SVCS_REV_CONFLICT', { stream: stream, detail: 'guard ' + gks[i] });
        }
      }
      // 5. last shard, fresh from storage
      var oldRaw = '';
      var oldCount = 0;
      var oldParsed = [];
      var prevH = ZERO_HASH;
      var prevN = 0;
      var prevAt = null;
      var lastShard = null;
      if (cur) {
        var rr = getRaw(cur.key);
        if (!rr.ok) return fail('SVCS_SHARD_UNREADABLE', { stream: stream, key: cur.key, detail: rr.detail });
        if (rr.raw === null) return fail('SVCS_HEAD_AHEAD', { stream: stream, key: cur.key, detail: 'last shard is missing' });
        try { oldParsed = JSON.parse(rr.raw); } catch (e) { oldParsed = null; }
        if (!isArray(oldParsed)) return fail('SVCS_SHARD_NOT_ARRAY', { stream: stream, key: cur.key });
        if (oldParsed.length === 0) return fail('SVCS_HEAD_AHEAD', { stream: stream, key: cur.key, detail: 'last shard is empty' });
        var lastRec = oldParsed[oldParsed.length - 1];
        if (!isPlain(lastRec) || !isInt(lastRec.n) || typeof lastRec.h !== 'string') return fail('SVCS_CHAIN_BREAK', { stream: stream, key: cur.key });
        if (lastRec.n > cur.n) return fail('SVCS_HEAD_BEHIND', { stream: stream, key: cur.key, n: lastRec.n });
        if (lastRec.n < cur.n) return fail('SVCS_HEAD_AHEAD', { stream: stream, key: cur.key, n: lastRec.n });
        if (lastRec.h !== cur.h) return fail('SVCS_CHAIN_BREAK', { stream: stream, key: cur.key, n: lastRec.n });
        if (lastRec.at !== cur.at) return fail('SVCS_HEAD_INVALID', { stream: stream, key: HEAD_KEY, n: lastRec.n, detail: 'head time differs from the last record' });
        oldRaw = rr.raw;
        oldCount = oldParsed.length;
        prevH = cur.h;
        prevN = cur.n;
        prevAt = cur.at;
        lastShard = parseShardKey(cur.key);
        var ms0 = mem.streams[stream];
        if (ms0.n !== cur.n || ms0.h !== cur.h) return fail('SVCS_REV_CONFLICT', { stream: stream, detail: 'reopen Stores' });
        if (ms0.key === cur.key && ms0.lastRaw !== oldRaw) return fail('SVCS_PREFIX_VIOLATION', { stream: stream, key: cur.key, detail: 'stored shard changed since it was verified' });
      } else {
        var ms1 = mem.streams[stream];
        if (ms1.n !== 0) return fail('SVCS_REV_CONFLICT', { stream: stream, detail: 'reopen Stores' });
      }
      // 6. clock and record time
      var c = computeAt(prevAt, opts.clockOverride === true);
      if (c.ok !== true) return c;
      // Defence in depth: a clock override is an Owner action (after the PIN step-up), never a staff one.
      if (c.overridden && actor.t !== 'owner') return fail('SVCS_OWNER_REQUIRED', { stream: stream, detail: 'clock override needs the Owner' });
      var at = c.at;
      if (opts.at !== undefined && opts.at !== null) {
        var want = normalizeIso(opts.at);
        if ((prevAt !== null && want < prevAt) || want > c.at) return fail('SVCS_ARGS_INVALID', { detail: 'at is out of range' });
        at = want;
      }
      // 7. references
      for (i = 0; i < items.length; i++) {
        var rf = items[i].r;
        if (rf === undefined || rf === null) continue;
        if (mem.streams[stream].refs[rf] !== undefined || seenRefs[rf] === true) return fail('SVCS_DUPLICATE_REF', { stream: stream });
        seenRefs[rf] = true;
      }
      // 8. numbers: the caller supplies b.no, the store checks it
      var counters = {};
      var fy = fyShort(at);
      for (i = 0; i < items.length; i++) {
        var sr = items[i].series;
        if (sr === undefined || sr === null) continue;
        var ck = sr + '|' + fy;
        var lastNo = counters[ck] !== undefined ? counters[ck] : seriesLast(sr, fy);
        var expected = sr + '/' + fy + '/' + pad(lastNo + 1, SERIES[sr].width);
        if (expected.length > LIMITS.MAX_NUMBER_CHARS) return fail('SVCS_SERIES_TOO_LONG', { stream: stream });
        if (items[i].b.no !== expected) return fail('SVCS_SERIES_MISMATCH', { stream: stream, detail: 'expected ' + expected });
        counters[ck] = lastNo + 1;
      }
      // 9. record texts
      var aText = canonicalText(actor);
      var texts = [];
      var n = prevN;
      var p = prevH;
      var lastAtOfBatch = at;
      for (i = 0; i < items.length; i++) {
        var item = items[i];
        if (hasForbiddenField(item.b, 0)) return fail('SVCS_BODY_FORBIDDEN_FIELD', { stream: stream });
        var body = item.b;
        if (c.overridden) {
          body = {};
          var bks = Object.keys(item.b);
          for (j = 0; j < bks.length; j++) body[bks[j]] = item.b[bks[j]];
          body.clockOverride = true;
        }
        var bText = canonicalText(body);
        if (bText === null) return fail('SVCS_BODY_NOT_CANONICAL', { stream: stream });
        n += 1;
        var rv = (item.r === undefined || item.r === null) ? '' : item.r;
        var h = recordHash(stream, p, n, at, item.k, rv, aText, bText);
        texts.push('{"n":' + n + ',"id":"' + recordIdFor(stream, n) + '","at":"' + at + '","k":"' + item.k + '"' +
          (rv ? ',"r":' + JSON.stringify(rv) : '') + ',"a":' + aText + ',"b":' + bText + ',"p":"' + p + '","h":"' + h + '"}');
        p = h;
      }
      var joined = texts.join(',');
      if (joined.length > LIMITS.SHARD_HARD_CAP_CHARS) return fail('SVCS_DOC_TOO_LARGE', { stream: stream });
      // 10. choose the shard; the period never goes backwards
      var targetPeriod = periodFor(stream, at);
      var useKey;
      var newRaw;
      var appendHere = false;
      var newShard = false;
      if (lastShard) {
        var samePeriod = lastShard.period === targetPeriod;
        var laterPeriod = lastShard.period > targetPeriod;
        if (samePeriod || laterPeriod) {
          if (oldRaw.length + joined.length + 1 <= LIMITS.SHARD_SOFT_CAP_CHARS) {
            appendHere = true;
            useKey = cur.key;
          } else {
            useKey = buildKey(stream, lastShard.period, lastShard.part + 1);
            newShard = true;
          }
        } else {
          useKey = buildKey(stream, targetPeriod, 1);
          newShard = true;
        }
      } else {
        useKey = buildKey(stream, targetPeriod, 1);
        newShard = true;
      }
      if (useKey === null) return fail('SVCS_DOC_TOO_LARGE', { stream: stream, detail: 'no shard number left' });
      // 11. build the new text from the old text
      if (appendHere) newRaw = oldRaw.slice(0, -1) + ',' + joined + ']';
      else newRaw = '[' + joined + ']';
      // 12. prefix check
      var parsedNew;
      try { parsedNew = JSON.parse(newRaw); } catch (e2) { parsedNew = null; }
      if (!isArray(parsedNew) || parsedNew.length !== (appendHere ? oldCount : 0) + items.length) return fail('SVCS_PREFIX_VIOLATION', { stream: stream, key: useKey, detail: 'new text is not the old text plus the new records' });
      if (appendHere) {
        if (newRaw.indexOf(oldRaw.slice(0, -1)) !== 0) return fail('SVCS_PREFIX_VIOLATION', { stream: stream, key: useKey });
        var again = getRaw(useKey);
        if (!again.ok || again.raw !== oldRaw) return fail('SVCS_PREFIX_VIOLATION', { stream: stream, key: useKey, detail: 'stored shard changed while saving' });
        for (i = 0; i < oldCount; i++) {
          if (parsedNew[i].h !== oldParsed[i].h || parsedNew[i].n !== oldParsed[i].n) return fail('SVCS_PREFIX_VIOLATION', { stream: stream, key: useKey });
        }
      } else {
        var exists = getRaw(useKey);
        if (!exists.ok) return fail('SVCS_SHARD_UNREADABLE', { stream: stream, key: useKey, detail: exists.detail });
        if (exists.raw !== null) return fail('SVCS_PREFIX_VIOLATION', { stream: stream, key: useKey, detail: 'shard already exists' });
      }
      // 13. write the shard
      var ws = putChecked(useKey, newRaw);
      if (!ws.ok) {
        return fail(ws.code === 'write' ? 'SVCS_WRITE_FAILED' : 'SVCS_READBACK_MISMATCH', { stream: stream, key: useKey, detail: ws.detail });
      }
      // 14. write the head row
      var rows = {};
      var rk = Object.keys(hd.rows);
      for (i = 0; i < rk.length; i++) rows[rk[i]] = hd.rows[rk[i]];
      var newRev = curRev + 1;
      rows[stream] = { s: stream, rev: newRev, n: n, h: p, at: lastAtOfBatch, key: useKey };
      var wh = putChecked(HEAD_KEY, headText(rows));
      if (!wh.ok) return fail('SVCS_HEAD_WRITE_FAILED', { stream: stream, key: HEAD_KEY, detail: wh.detail, committed: true, n: n });
      // 15. memory
      var ms = mem.streams[stream];
      var added = [];
      for (i = parsedNew.length - items.length; i < parsedNew.length; i++) {
        var fr = deepFreeze(parsedNew[i]);
        added.push(fr);
        ms.records.push(fr);
        ms.recKey.push(useKey);
        if (fr.r !== undefined) ms.refs[fr.r] = ms.records.length - 1;
      }
      var ck2 = Object.keys(counters);
      for (i = 0; i < ck2.length; i++) mem.series[ck2[i]] = counters[ck2[i]];
      ms.rev = newRev;
      ms.n = n;
      ms.h = p;
      ms.at = lastAtOfBatch;
      ms.key = useKey;
      ms.lastRaw = newRaw;
      if (newShard) ms.parts += 1;
      var warnings = watermarkAfterAppend(lastAtOfBatch);
      // 16. result
      return ok({ records: Object.freeze(added), rev: newRev, n: n, h: p, key: useKey, warnings: Object.freeze(warnings) });
    }

    function append(stream, items, opts) {
      return appendCore(stream, items, opts, false);
    }

    /* ---------- open, verify, acknowledge ---------- */

    function open(openOpts) {
      return doOpen(openOpts || {}, true);
    }

    function verifyAll(verifyOpts) {
      return doOpen(verifyOpts || {}, false);
    }

    function status() {
      return Object.freeze({
        opened: mem.opened,
        blocked: mem.blocked,
        problems: Object.freeze(mem.problems.slice()),
        watermark: mem.watermark
      });
    }

    function acknowledgeRestore(o) {
      if (!isPlain(o)) return fail('SVCS_ARGS_INVALID', { detail: 'arguments' });
      var actor = normActor(o.actor);
      if (!actor) return fail('SVCS_ACTOR_INVALID');
      if (actor.t !== 'owner') return fail('SVCS_OWNER_REQUIRED');
      if (o.stepUpOk !== true) return fail('SVCS_OWNER_REQUIRED', { detail: 'Owner PIN step-up is required' });
      if (typeof o.reason !== 'string' || o.reason.length < 5 || o.reason.length > 200) return fail('SVCS_ARGS_INVALID', { detail: 'reason' });
      var fo = ensureOpen();
      if (fo) return fo;
      var wmProblems = 0;
      var other = 0;
      var i;
      for (i = 0; i < mem.problems.length; i++) {
        var pc = mem.problems[i].code;
        if (pc === 'SVCS_WATERMARK_AHEAD' || pc === 'SVCS_WATERMARK_FORK') wmProblems++;
        else if (isFatalProblem(mem.problems[i])) other++;
      }
      for (i = 0; i < STREAM_NAMES.length; i++) if (mem.streams[STREAM_NAMES[i]].broken) other++;
      if (wmProblems === 0 || other > 0) return fail('SVCS_ACK_NOT_ALLOWED');
      var oldWm = null;
      var wr = getRaw(WATERMARK_KEY);
      if (wr.ok && wr.raw !== null) oldWm = parseWatermark(wr.raw);
      var from = {};
      var to = {};
      if (oldWm) {
        var names = Object.keys(oldWm.streams);
        for (i = 0; i < names.length; i++) {
          if (!STREAMS[names[i]]) continue;
          from[names[i]] = { n: oldWm.streams[names[i]].n, h: oldWm.streams[names[i]].h };
        }
      }
      for (i = 0; i < STREAM_NAMES.length; i++) {
        var S = mem.streams[STREAM_NAMES[i]];
        if (S.n > 0 || from[STREAM_NAMES[i]]) to[STREAM_NAMES[i]] = { n: S.n, h: S.h };
      }
      var ah = head('audit');
      if (ah.ok !== true) return ah;
      var res = appendCore('audit', [{ k: 'WATERMARK_RESET', b: { from: from, to: to, reason: o.reason } }], { expectRev: ah.rev, actor: actor }, true);
      if (res.ok !== true) return res;
      // The append wrote a fresh watermark from the current heads. Re-check from memory.
      var keep = [];
      for (i = 0; i < mem.problems.length; i++) {
        var q = mem.problems[i];
        if (q.code !== 'SVCS_WATERMARK_AHEAD' && q.code !== 'SVCS_WATERMARK_FORK') keep.push(q);
      }
      mem.problems = keep;
      var stillBlocked = false;
      for (i = 0; i < keep.length; i++) if (isFatalProblem(keep[i])) stillBlocked = true;
      mem.blocked = stillBlocked;
      mem.watermark = wmOn ? 'OK' : 'OFF';
      return ok({ record: res.records[0], warnings: res.warnings, watermark: mem.watermark });
    }

    return ok({
      store: Object.freeze({
        open: open,
        status: status,
        read: read,
        readPeriod: readPeriod,
        append: append,
        findRef: findRef,
        head: head,
        nextAt: nextAt,
        nextNumber: nextNumber,
        lastNumber: lastNumber,
        verifyAll: verifyAll,
        acknowledgeRestore: acknowledgeRestore
      })
    });
  }

  return Object.freeze({
    VERSION: VERSION,
    STREAMS: STREAMS,
    SERIES: SERIES,
    LIMITS: LIMITS,
    KEY_RE: KEY_RE,
    CODES: CODES,
    MESSAGES: MESSAGES,
    SVCS_PREFIX: SVCS_PREFIX,
    WATERMARK_KEY: WATERMARK_KEY,
    HEAD_KEY: HEAD_KEY,
    sha256Hex: sha256Hex,
    canonicalText: canonicalText,
    istMonth: istMonth,
    istDate: istDate,
    fyLabel: fyLabel,
    fyShort: fyShort,
    shardKey: shardKey,
    parseShardKey: parseShardKey,
    adapterFromWindow: adapterFromWindow,
    createStore: createStore
  });
});
