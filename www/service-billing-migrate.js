(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingMigrate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Service billing migration: brings the old closed, invoiced jobs into the new invoice records.
  // Detection is silent and read only. The bring-in is an Owner step with a fresh PIN stamp.
  // One record per old invoice (kind INV_LEGACY), written by the billing documents layer (importLegacy), never here.
  // It never writes the job list or the settings. No personal detail of any person is copied: only numbers, dates and counts.
  // Typed advances on open jobs are NOT written here; the Owner decides them per job through the money layer.
  // Pure: no screen, no timer, no storage calls of its own. The clock is injected.

  var SBG_BATCH_MAX = 100;
  var SBG_PIN_FRESH_MS = 120000;
  var SBG_MAX_PAISE = 999999999;
  var SBG_SAFE_PAISE = 10000000000000;
  var SBG_JOB_ID_MAX = 60;
  var SBG_NO_MAX = 40;
  var SBG_PAYMODE_MAX = 40;
  var SBG_STREAM = 'invoices';
  var SBG_REF_PREFIX = 'LEGACY:';
  var SBG_REF_FIT = 57;
  var SBG_REF_CHARS = /^[A-Za-z0-9][A-Za-z0-9._:\/#-]*$/;
  var SBG_BASES = ['SNAPSHOT_V1', 'LIVE_CASE'];
  var SBG_WARN_CODES = ['FIGURES_INCONSISTENT', 'DUPLICATE_LEGACY_NUMBER', 'NO_COLLECT_DATE', 'AMOUNT_OUT_OF_RANGE'];
  var SBG_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // The exact key list of an INV_LEGACY body (plan 2.4), in order.
  var BODY_KEYS = Object.freeze(('legacyNo jobId basis invoiceDate gstBp listedPaise adjustmentPaise taxablePaise cgstPaise sgstPaise igstPaise ' +
    'gstPaise roundOffPaise totalPaise finalPaise payMode lineCount correctionCount snapshotSha warn').split(' '));

  var CODES = Object.freeze({
    DEPS_INVALID: 'DEPS_INVALID',
    SESSION_REQUIRED: 'SESSION_REQUIRED',
    NOT_ALLOWED: 'NOT_ALLOWED',
    PIN_REQUIRED: 'PIN_REQUIRED',
    PAST_VIEW: 'PAST_VIEW',
    BUSY: 'BUSY',
    STORE_NOT_READY: 'STORE_NOT_READY',
    STORE_BLOCKED: 'STORE_BLOCKED',
    READ_FAILED: 'READ_FAILED',
    CASES_UNAVAILABLE: 'CASES_UNAVAILABLE',
    PLAN_INVALID: 'PLAN_INVALID',
    PLAN_STALE: 'PLAN_STALE',
    WRITE_FAILED: 'WRITE_FAILED',
    JOB_ID_INVALID: 'JOB_ID_INVALID',
    DUPLICATE_JOB: 'DUPLICATE_JOB',
    NUMBER_INVALID: 'NUMBER_INVALID',
    JOB_ALREADY_BILLED: 'JOB_ALREADY_BILLED',
    NUMBER_USED_BY_NEW_BILL: 'NUMBER_USED_BY_NEW_BILL',
    SNAPSHOT_UNBUILDABLE: 'SNAPSHOT_UNBUILDABLE',
    FIGURES_INVALID: 'FIGURES_INVALID',
    BODY_INVALID: 'BODY_INVALID',
    FIGURES_INCONSISTENT: 'FIGURES_INCONSISTENT',
    DUPLICATE_LEGACY_NUMBER: 'DUPLICATE_LEGACY_NUMBER',
    NO_COLLECT_DATE: 'NO_COLLECT_DATE',
    AMOUNT_OUT_OF_RANGE: 'AMOUNT_OUT_OF_RANGE'
  });
  var MESSAGES = Object.freeze({
    DEPS_INVALID: 'The old invoice bring-in is not set up correctly on this device.',
    SESSION_REQUIRED: 'Sign in again before using the old invoice bring-in.',
    NOT_ALLOWED: 'Only the Owner can bring old invoices into the new records.',
    PIN_REQUIRED: 'The Owner PIN is needed. Enter it again and retry.',
    PAST_VIEW: 'Go back to today before bringing in old invoices.',
    BUSY: 'The bring-in is already running. Wait for it to finish.',
    STORE_NOT_READY: 'The Service records are not open yet. Try again in a moment.',
    STORE_BLOCKED: 'The Service records failed their integrity check. Nothing was written. Ask the Owner.',
    READ_FAILED: 'The invoice records could not be read. Nothing was written.',
    CASES_UNAVAILABLE: 'The job list could not be read. Nothing was written.',
    PLAN_INVALID: 'The list to bring in is not valid. Open the list again.',
    PLAN_STALE: 'The records changed since the list was made. Open the list again. Nothing more was written.',
    WRITE_FAILED: 'A batch could not be written. Batches already written stay. Run it again to finish the rest.',
    JOB_ID_INVALID: 'The job number is empty or too long, so this old invoice was left out.',
    DUPLICATE_JOB: 'The same job number appears twice, so the second one was left out.',
    NUMBER_INVALID: 'The old invoice number is empty or too long, so this old invoice was left out.',
    JOB_ALREADY_BILLED: 'This job already has a new invoice record, so the old one was left out.',
    NUMBER_USED_BY_NEW_BILL: 'This old number is already used by a new invoice record, so it was left out.',
    SNAPSHOT_UNBUILDABLE: 'The old invoice figures could not be rebuilt, so this old invoice was left out.',
    FIGURES_INVALID: 'The old invoice figures are damaged or not whole amounts, so this old invoice was left out.',
    BODY_INVALID: 'The rebuilt record was refused by the invoice checks, so this old invoice was left out.',
    FIGURES_INCONSISTENT: 'Taxable value, tax and round-off do not add up to the total.',
    DUPLICATE_LEGACY_NUMBER: 'Another old job carries the same invoice number.',
    NO_COLLECT_DATE: 'The old job has no collection date, so no invoice date is known.',
    AMOUNT_OUT_OF_RANGE: 'An amount is negative or larger than the allowed limit.'
  });

  function sbgFreeze(o) {
    var keys, i;
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
    keys = Object.keys(o);
    for (i = 0; i < keys.length; i++) sbgFreeze(o[keys[i]]);
    return Object.freeze(o);
  }
  function sbgFail(code, detail) {
    var r = { ok: false, code: code, message: MESSAGES[code] || MESSAGES.WRITE_FAILED };
    if (detail !== undefined) r.detail = detail;
    return r;
  }
  function sbgObj(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }
  function sbgWholeNumber(x) {
    return typeof x === 'number' && isFinite(x) && Math.floor(x) === x;
  }
  function sbgDict() {
    return Object.create(null);
  }
  function sbgSortById(a, b) {
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  }

  // An amount in the old snapshot is a number or a numeric text in rupees (two decimals at most). Result: whole
  // paise, or null when it is missing, not a number, has more than two decimals, or is absurdly large.
  function sbgPaise(v, optional) {
    var x, neg, a, p;
    if (v === undefined || v === null || v === '') return optional ? 0 : null;
    if (typeof v === 'string') {
      if (!/^\s*-?\d{1,12}(\.\d{1,2})?\s*$/.test(v.replace(/,/g, ''))) return null;
      x = Number(v.replace(/,/g, ''));
    } else if (typeof v === 'number') {
      x = v;
    } else {
      return null;
    }
    if (!isFinite(x)) return null;
    neg = x < 0;
    a = neg ? -x : x;
    p = Math.floor(a * 100 + 0.5);
    if (p >= SBG_SAFE_PAISE) return null;
    if (Math.abs(p / 100 - a) > 0.0000001) return null;
    return neg ? -p : p;
  }
  function sbgRateBp(v) {
    var x, bp;
    if (typeof v === 'string' && /^\s*\d{1,3}(\.\d{1,2})?\s*%?\s*$/.test(v)) x = Number(v.replace(/[\s%]/g, ''));
    else if (typeof v === 'number') x = v;
    else return null;
    if (!isFinite(x) || x < 0 || x > 100) return null;
    bp = Math.floor(x * 100 + 0.5);
    return Math.abs(bp / 100 - x) < 0.0000001 ? bp : null;
  }
  function sbgCount(v) {
    return sbgWholeNumber(v) && v >= 0 && v <= 100000 ? v : 0;
  }
  function sbgText(v, max) {
    return typeof v === 'string' ? v.replace(/^\s+|\s+$/g, '').slice(0, max) : '';
  }

  // The reference of one old invoice: one per job, so a second run finds it. A job number that does not fit the
  // store reference pattern is hashed (first 20 hex characters of the digest).
  function refFor(jobId, hashHex) {
    var h;
    if (typeof jobId !== 'string' || jobId === '') return '';
    if (jobId.length <= SBG_REF_FIT && SBG_REF_CHARS.test(SBG_REF_PREFIX + jobId)) return SBG_REF_PREFIX + jobId;
    if (typeof hashHex !== 'function') return '';
    h = hashHex(jobId);
    return typeof h === 'string' && /^[0-9a-f]{20,}$/.test(h) ? SBG_REF_PREFIX + 'h' + h.slice(0, 20) : '';
  }

  function create(deps) {
    var store, docs, cases, clock, hashHex, validateBody, batchSize, busy = false;

    if (!sbgObj(deps)) return { ok: false, code: 'DEPS_INVALID' };
    store = deps.store;
    docs = deps.docs;
    cases = deps.cases;
    clock = deps.now;
    hashHex = deps.hashHex;
    validateBody = deps.validateBody;
    if (!store || typeof store.status !== 'function' || typeof store.read !== 'function' || typeof store.findRef !== 'function' ||
        typeof store.head !== 'function') return { ok: false, code: 'DEPS_INVALID' };
    if (!docs || typeof docs.importLegacy !== 'function') return { ok: false, code: 'DEPS_INVALID' };
    if (!cases || typeof cases.list !== 'function' || typeof cases.legacyInput !== 'function') return { ok: false, code: 'DEPS_INVALID' };
    if (typeof clock !== 'function' || typeof hashHex !== 'function') return { ok: false, code: 'DEPS_INVALID' };
    if (validateBody !== undefined && validateBody !== null && typeof validateBody !== 'function') return { ok: false, code: 'DEPS_INVALID' };
    batchSize = SBG_BATCH_MAX;
    if (deps.batchSize !== undefined) {
      if (!sbgWholeNumber(deps.batchSize) || deps.batchSize < 1 || deps.batchSize > SBG_BATCH_MAX) return { ok: false, code: 'DEPS_INVALID' };
      batchSize = deps.batchSize;
    }

    function nowMs() {
      var v;
      try {
        v = clock();
      } catch (e) {
        return null;
      }
      if (v instanceof Date) v = v.getTime();
      else if (typeof v === 'string') v = Date.parse(v);
      return typeof v === 'number' && isFinite(v) ? v : null;
    }

    // Who is asking. The session is read fresh from ctx on every call and never kept.
    function tierOf(ctx) {
      var s;
      try {
        s = sbgObj(ctx) ? ctx.session : null;
        if (!sbgObj(s) || s.ok !== true) return '';
        if (s.tier === 'owner' && s.isOwner === true) return 'owner';
        if (s.tier === 'manager' && s.isManager === true && s.isOwner !== true) return 'manager';
        if (s.tier === 'staff' && s.isManager !== true && s.isOwner !== true) return 'staff';
      } catch (e) {
        return '';
      }
      return '';
    }
    function pinFresh(ctx) {
      var st = sbgObj(ctx) ? ctx.stepUp : null, n = nowMs(), d;
      if (!sbgObj(st) || st.ok !== true || !sbgWholeNumber(st.at) || n === null) return false;
      d = n - st.at;
      return d >= 0 && d <= SBG_PIN_FRESH_MS;
    }

    function storeGate() {
      var st;
      try {
        st = store.status();
      } catch (e) {
        return sbgFail('STORE_NOT_READY');
      }
      if (!st || st.opened !== true) return sbgFail('STORE_NOT_READY');
      if (st.blocked === true) return sbgFail('STORE_BLOCKED');
      return null;
    }
    function headRev() {
      var h;
      try {
        h = store.head(SBG_STREAM);
      } catch (e) {
        return -1;
      }
      return h && h.ok === true && sbgWholeNumber(h.rev) ? h.rev : -1;
    }

    // What the invoice stream already holds that touches old numbers: new bills by job and by number.
    function scanStream() {
      var rd, i, rec, out = { byJob: sbgDict(), byNo: sbgDict(), oldNo: sbgDict(), rev: -1 };
      try {
        rd = store.read(SBG_STREAM);
      } catch (e) {
        return null;
      }
      if (!rd || rd.ok !== true || !rd.records) return null;
      out.rev = rd.rev;
      for (i = 0; i < rd.records.length; i++) {
        rec = rd.records[i];
        if (rec && rec.k === 'INV_ISSUE' && sbgObj(rec.b)) {
          if (typeof rec.b.jobId === 'string') out.byJob[rec.b.jobId] = true;
          if (typeof rec.b.no === 'string') out.byNo[rec.b.no] = rec.b.jobId;
        } else if (rec && rec.k === 'INV_LEGACY' && sbgObj(rec.b) && typeof rec.b.legacyNo === 'string') {
          out.oldNo[rec.b.legacyNo] = rec.b.jobId;
        }
      }
      return out;
    }

    function buildBody(cand, inp, dupCount) {
      var f, v, warn = [], b, gst, sum;
      if (!sbgObj(inp) || inp.ok === false || !sbgObj(inp.figs)) return { code: 'SNAPSHOT_UNBUILDABLE' };
      if (SBG_BASES.indexOf(inp.basis) < 0) return { code: 'SNAPSHOT_UNBUILDABLE' };
      f = inp.figs;
      gst = sbgRateBp(f.gstPct);
      if (gst === null) return { code: 'SNAPSHOT_UNBUILDABLE' };
      v = {
        listed: sbgPaise(f.listed, false), adj: sbgPaise(f.adjustment, true), taxable: sbgPaise(f.taxable, false),
        cgst: sbgPaise(f.cgst, false), sgst: sbgPaise(f.sgst, false), tax: sbgPaise(f.gst, false), ro: sbgPaise(f.roundOff, true),
        total: sbgPaise(f.total, false), fin: sbgPaise(f.finalAmt, false)
      };
      if (v.listed === null || v.adj === null || v.taxable === null || v.cgst === null || v.sgst === null || v.tax === null ||
          v.ro === null || v.total === null || v.fin === null) return { code: 'FIGURES_INVALID' };
      sum = v.taxable + v.tax + v.ro;
      if (sum !== v.total) warn.push('FIGURES_INCONSISTENT');
      if (dupCount > 1) warn.push('DUPLICATE_LEGACY_NUMBER');
      if (typeof inp.invoiceDate !== 'string' || !SBG_DATE_RE.test(inp.invoiceDate)) warn.push('NO_COLLECT_DATE');
      if (v.total < 0 || v.fin < 0 || v.taxable < 0 || v.tax < 0 || v.cgst < 0 || v.sgst < 0 || v.total > SBG_MAX_PAISE || v.fin > SBG_MAX_PAISE) {
        warn.push('AMOUNT_OUT_OF_RANGE');
      }
      b = {
        legacyNo: cand.no,
        jobId: cand.id,
        basis: inp.basis,
        invoiceDate: typeof inp.invoiceDate === 'string' && SBG_DATE_RE.test(inp.invoiceDate) ? inp.invoiceDate : '',
        gstBp: gst,
        listedPaise: v.listed,
        adjustmentPaise: v.adj,
        taxablePaise: v.taxable,
        cgstPaise: v.cgst,
        sgstPaise: v.sgst,
        igstPaise: 0,
        gstPaise: v.tax,
        roundOffPaise: v.ro,
        totalPaise: v.total,
        finalPaise: v.fin,
        payMode: sbgText(inp.payMode, SBG_PAYMODE_MAX),
        lineCount: sbgCount(inp.lineCount),
        correctionCount: sbgCount(inp.correctionCount),
        snapshotSha: typeof inp.snapshotSha === 'string' && /^[0-9a-f]{64}$/.test(inp.snapshotSha) ? inp.snapshotSha : null,
        warn: warn
      };
      return { body: b };
    }

    // The dry run. Read only: no write of any kind, no change to the job list, no clock-dependent value in a body.
    function buildPlan() {
      var gate = storeGate(), seen, list, cands = [], closedNoNumber = 0, i, c, rec, dup = sbgDict(), claimed = sbgDict(),
        out, ref, found, inp, built, vb, no, item, bodies = [];
      if (gate) return gate;
      seen = scanStream();
      if (!seen) return sbgFail('READ_FAILED');
      try {
        list = cases.list();
      } catch (e2) {
        return sbgFail('CASES_UNAVAILABLE');
      }
      if (!Array.isArray(list)) return sbgFail('CASES_UNAVAILABLE');
      out = { ok: true, rev: seen.rev, invoices: [], items: [], refs: [], skipped: [], alreadyThere: 0, closedWithoutNumber: 0,
        pending: { invoices: 0 }, advancesWritten: 0 };
      for (i = 0; i < list.length; i++) {
        c = list[i];
        if (!sbgObj(c) || c.status !== 'closed') continue;
        no = typeof c.invoiceNo === 'string' ? c.invoiceNo.replace(/^\s+|\s+$/g, '') : '';
        if (no === '') {
          closedNoNumber++;
          continue;
        }
        cands.push({ id: typeof c.id === 'string' ? c.id : '', no: no });
      }
      out.closedWithoutNumber = closedNoNumber;
      cands.sort(sbgSortById);
      for (i = 0; i < cands.length; i++) dup[cands[i].no] = (dup[cands[i].no] || 0) + 1;
      for (i = 0; i < cands.length; i++) {
        c = cands[i];
        if (c.id === '' || c.id.length > SBG_JOB_ID_MAX) {
          out.skipped.push({ jobId: c.id.slice(0, SBG_JOB_ID_MAX), code: 'JOB_ID_INVALID', legacyNo: c.no.slice(0, SBG_NO_MAX) });
          continue;
        }
        if (claimed[c.id] === true) {
          out.skipped.push({ jobId: c.id, code: 'DUPLICATE_JOB', legacyNo: c.no.slice(0, SBG_NO_MAX) });
          continue;
        }
        claimed[c.id] = true;
        if (c.no.length > SBG_NO_MAX) {
          out.skipped.push({ jobId: c.id, code: 'NUMBER_INVALID', legacyNo: c.no.slice(0, SBG_NO_MAX) });
          continue;
        }
        ref = refFor(c.id, hashHex);
        if (ref === '') {
          out.skipped.push({ jobId: c.id, code: 'JOB_ID_INVALID', legacyNo: c.no });
          continue;
        }
        try {
          found = store.findRef(SBG_STREAM, ref);
        } catch (e3) {
          return sbgFail('READ_FAILED');
        }
        if (found) {
          out.alreadyThere++;
          continue;
        }
        if (seen.byJob[c.id] === true) {
          out.skipped.push({ jobId: c.id, code: 'JOB_ALREADY_BILLED', legacyNo: c.no });
          continue;
        }
        if (seen.byNo[c.no] !== undefined && seen.byNo[c.no] !== c.id) {
          out.skipped.push({ jobId: c.id, code: 'NUMBER_USED_BY_NEW_BILL', legacyNo: c.no });
          continue;
        }
        // the same old number on two or more jobs (or on an old bill already brought in for another job): the bill layer
        // holds one old bill per number, so none of them is brought in. The Owner sees each one in the list.
        if (dup[c.no] > 1 || (seen.oldNo[c.no] !== undefined && seen.oldNo[c.no] !== c.id)) {
          out.skipped.push({ jobId: c.id, code: 'DUPLICATE_LEGACY_NUMBER', legacyNo: c.no });
          continue;
        }
        try {
          inp = cases.legacyInput(c.id);
        } catch (e4) {
          inp = null;
        }
        built = buildBody(c, inp, dup[c.no]);
        if (!built.body) {
          out.skipped.push({ jobId: c.id, code: built.code, legacyNo: c.no });
          continue;
        }
        if (validateBody) {
          try {
            vb = validateBody(built.body);
          } catch (e5) {
            vb = null;
          }
          if (!vb || vb.ok !== true) {
            out.skipped.push({ jobId: c.id, code: 'BODY_INVALID', legacyNo: c.no, detail: vb && vb.code ? vb.code : '' });
            continue;
          }
        }
        item = { ref: ref, body: built.body };
        bodies.push(item);
        out.refs.push(ref);
        out.invoices.push({ ref: ref, jobId: c.id, legacyNo: c.no, basis: built.body.basis, invoiceDate: built.body.invoiceDate,
          totalPaise: built.body.totalPaise, finalPaise: built.body.finalPaise, warn: built.body.warn.slice() });
      }
      out.items = bodies;
      out.pending.invoices = bodies.length;
      return sbgFreeze(out);
    }

    function pending(ctx) {
      var p;
      if (ctx !== undefined && tierOf(ctx) === '') return sbgFail('SESSION_REQUIRED');
      p = buildPlan();
      if (p.ok !== true) return p;
      return { ok: true, invoices: p.pending.invoices, alreadyThere: p.alreadyThere, skipped: p.skipped.length };
    }

    function plan(ctx) {
      var t;
      if (ctx !== undefined) {
        t = tierOf(ctx);
        if (t === '') return sbgFail('SESSION_REQUIRED');
        if (t !== 'owner' && t !== 'manager') return sbgFail('NOT_ALLOWED');
      }
      return buildPlan();
    }

    function sameRefs(a, b) {
      var i;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    // What the Owner saw for each old bill: reference, old number and the two amounts. A change of any of them is stale.
    function sameShown(a, b) {
      var i, x, y;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) {
        x = a[i];
        y = b[i];
        if (!sbgObj(x) || !sbgObj(y) || x.ref !== y.ref || x.legacyNo !== y.legacyNo || x.totalPaise !== y.totalPaise ||
            x.finalPaise !== y.finalPaise) return false;
      }
      return true;
    }

    // The bring-in. The list the Owner saw is only a promise: the work is made from a fresh plan, and it must name
    // the same references. Batches are all-or-nothing; a stop leaves finished batches in place; a new run resumes.
    function run(shown, ctx) {
      var fresh, rev, pos, written = 0, docsSkipped = 0, batch, res, items, nextRev, warned = 0, i, why;
      if (tierOf(ctx) === '') return sbgFail('SESSION_REQUIRED');
      if (tierOf(ctx) !== 'owner') return sbgFail('NOT_ALLOWED');
      if (!pinFresh(ctx)) return sbgFail('PIN_REQUIRED');
      if (ctx.pastView === true) return sbgFail('PAST_VIEW');
      if (!sbgObj(shown) || shown.ok !== true || !Array.isArray(shown.refs) || !sbgWholeNumber(shown.rev)) return sbgFail('PLAN_INVALID');
      if (busy) return sbgFail('BUSY');
      busy = true;
      try {
        fresh = buildPlan();
        if (fresh.ok !== true) return fresh;
        if (fresh.rev !== shown.rev || !sameRefs(fresh.refs, shown.refs) || !sameShown(fresh.invoices, shown.invoices)) return sbgFail('PLAN_STALE');
        items = fresh.items;
        rev = fresh.rev;
        for (i = 0; i < items.length; i++) if (items[i].body.warn.length > 0) warned++;
        for (pos = 0; pos < items.length; pos += batchSize) {
          batch = items.slice(pos, pos + batchSize);
          try {
            res = docs.importLegacy(batch, ctx);
          } catch (e) {
            res = null;
          }
          if (!res || res.ok !== true) {
            why = sbgFail(res && typeof res.code === 'string' ? res.code : 'WRITE_FAILED');
            // LEGACY_CONFLICT: an old bill clashes with a record already saved. Stop here; a fresh list shows the clash.
            if (why.code === 'LEGACY_CONFLICT') why.message = MESSAGES.PLAN_STALE;
            why.stopped = true;
            if (res && res.detail !== undefined) why.detail = res.detail;
            why.written = { invoices: written, advances: 0 };
            why.remaining = items.length - pos;
            return why;
          }
          if (sbgWholeNumber(res.written) && res.written >= 0 && res.written <= batch.length) {
            written += res.written;
            docsSkipped += batch.length - res.written;
          } else {
            written += batch.length;
          }
          nextRev = headRev();
          if (nextRev < 0) {
            why = sbgFail('READ_FAILED');
            why.written = { invoices: written, advances: 0 };
            why.remaining = items.length - pos - batch.length;
            return why;
          }
          // one batch is one append: the head moves by one at most. Anything more is another writer: stop, resume later.
          if (nextRev > rev + 1) {
            why = sbgFail('PLAN_STALE');
            why.written = { invoices: written, advances: 0 };
            why.remaining = items.length - pos - batch.length;
            return why;
          }
          rev = nextRev;
        }
        return sbgFreeze({ ok: true, written: { invoices: written, advances: 0 }, alreadyThere: fresh.alreadyThere + docsSkipped,
          skipped: fresh.skipped, warnings: warned, batches: Math.ceil(items.length / batchSize) });
      } finally {
        busy = false;
      }
    }

    function ready() {
      return storeGate() === null;
    }

    return {
      ok: true,
      api: Object.freeze({ ready: ready, pending: pending, plan: plan, run: run })
    };
  }

  return Object.freeze({
    version: 1,
    CODES: CODES,
    MESSAGES: MESSAGES,
    BODY_KEYS: BODY_KEYS,
    BATCH_MAX: SBG_BATCH_MAX,
    refFor: refFor,
    create: create
  });
});
