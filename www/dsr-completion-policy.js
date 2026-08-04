(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarDsrCompletionPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* D4: honest per-section completion for the DSR day record.
     Pure — no DOM, no storage, no clock. The caller supplies the record and an
     explicit context (active stock categories, task list) so the policy stays
     testable and store-agnostic.

     Replaces updateProgress()'s nine-element checks array, five entries of which
     were the literal `true` (daystart/inout/sales/nonpurch/marketing), making an
     empty record read "5/9 sections · 56%". */

  const COMPLETE = 'complete';
  const INCOMPLETE = 'incomplete';
  const NOT_APPLICABLE = 'not_applicable';

  const SECTIONS = [
    'daystart', 'opening', 'inout', 'sales', 'nonpurch',
    'tasks', 'marketing', 'cleaning', 'closing'
  ];

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function entered(value) {
    return value !== null && value !== undefined && value !== '' && value !== false;
  }

  function allCategoriesEntered(bucket, categories) {
    const cats = asArray(categories);
    if (!cats.length) return false;
    const source = bucket && typeof bucket === 'object' ? bucket : {};
    return cats.every(cat => {
      const id = cat && typeof cat === 'object' ? cat.id : cat;
      return source[id] !== '' && source[id] !== undefined && source[id] !== null;
    });
  }

  /* The in/out log is a chronological list of {type:'in'|'out'}. The day has
     started once any 'in' exists; it is dangling when the final entry is an
     'out' with no matching return. */
  function inoutState(rec) {
    const log = asArray(rec && rec.inout);
    const started = log.some(row => row && row.type === 'in');
    const last = log.length ? log[log.length - 1] : null;
    const dangling = !!(last && last.type === 'out');
    return { started, dangling, empty: log.length === 0 };
  }

  /* Cleaning parity: the submit gate requires done AND photo for both
     checkpoints. The old meter checked only `.done`, so a record could read
     100% and still be refused at submit. */
  function cleaningComplete(rec) {
    const cleaning = (rec && rec.cleaning) || {};
    const cp1 = cleaning.cp1 || {};
    const cp2 = cleaning.cp2 || {};
    return !!(cp1.done && cp1.photo && cp2.done && cp2.photo);
  }

  function tasksComplete(rec, taskList) {
    const tasks = asArray(taskList);
    if (!tasks.length) return false;
    const source = (rec && rec.tasks) || {};
    return tasks.every(task => {
      const id = task && typeof task === 'object' ? task.id : task;
      return entered(source[id]);
    });
  }

  /* Owner ruling (2026-08-04): a day with no sales must be affirmed, not assumed.
     An empty sales list is only complete once the staff member has explicitly
     acknowledged it, so "I forgot to enter the bills" and "there were genuinely
     no bills" stop looking identical. */
  /* `at` must be a non-empty string, and the carrier must be a plain object.
     An array would otherwise pass: typeof [] === 'object' and [].at resolves to
     Array.prototype.at, a truthy function. */
  function noSalesAcknowledged(rec) {
    const ack = rec && rec.d4NoSales;
    if (!ack || typeof ack !== 'object' || Array.isArray(ack)) return false;
    return typeof ack.at === 'string' && ack.at.length > 0;
  }

  function salesStatus(rec) {
    if (asArray(rec && rec.sales).length > 0) return COMPLETE;
    if (noSalesAcknowledged(rec)) return COMPLETE;
    /* A submitted day is sealed. It closed under whatever gate applied at the
       time, and the meter must not retroactively fail evidence that was already
       accepted — records predating this rule carry no acknowledgement and never
       can. unlockForCorrection() clears `submitted`, which correctly re-arms the
       requirement for anyone reopening the day. */
    if (rec && rec.submitted) return COMPLETE;
    return INCOMPLETE;
  }

  /* nonpurch / marketing carry no per-day obligation in the record's current
     structure, so they are excluded from the denominator rather than counted as
     free passes. Sales was moved out of this group by the ruling above. */
  function sectionStatus(rec, ctx) {
    const record = rec && typeof rec === 'object' ? rec : {};
    const context = ctx && typeof ctx === 'object' ? ctx : {};
    const categories = context.stockCategories;
    const taskList = context.taskList;
    const io = inoutState(record);

    return {
      daystart: io.started ? COMPLETE : INCOMPLETE,
      opening: allCategoriesEntered(record.opening, categories) ? COMPLETE : INCOMPLETE,
      inout: io.empty ? INCOMPLETE : (io.dangling ? INCOMPLETE : COMPLETE),
      sales: salesStatus(record),
      nonpurch: NOT_APPLICABLE,
      tasks: tasksComplete(record, taskList) ? COMPLETE : INCOMPLETE,
      marketing: NOT_APPLICABLE,
      cleaning: cleaningComplete(record) ? COMPLETE : INCOMPLETE,
      closing: allCategoriesEntered(record.closing, categories) ? COMPLETE : INCOMPLETE
    };
  }

  /* done / applicable — not_applicable sections leave the denominator, so an
     empty record reads 0/6 and a zero-sale day can still reach 100%. */
  function completionSummary(rec, ctx) {
    const status = sectionStatus(rec, ctx);
    const applicable = SECTIONS.filter(id => status[id] !== NOT_APPLICABLE);
    const done = applicable.filter(id => status[id] === COMPLETE);
    const total = applicable.length;
    return {
      status,
      done: done.length,
      total,
      percent: total ? Math.round(done.length / total * 100) : 0
    };
  }

  /* The submit gate, expressed over the same policy so the meter and the gate
     can no longer disagree. Wording is carried over verbatim from the module's
     existing getMissingForSubmit(). */
  function missingForSubmit(rec, ctx) {
    const record = rec && typeof rec === 'object' ? rec : {};
    const context = ctx && typeof ctx === 'object' ? ctx : {};
    const cleaning = record.cleaning || {};
    const cp1 = cleaning.cp1 || {};
    const cp2 = cleaning.cp2 || {};
    const missing = [];

    if (!allCategoriesEntered(record.opening, context.stockCategories)) {
      missing.push('Opening stock — enter counts for all brands');
    }
    if (asArray(record.sales).length === 0 && !noSalesAcknowledged(record)) {
      missing.push('Sales — add the day’s bills, or confirm there were no sales today');
    }
    if (!tasksComplete(record, context.taskList)) {
      missing.push('Daily task counts — fill all items');
    }
    if (!cp1.done || !cp1.photo) {
      missing.push('Cleaning Checkpoint 1 — mark done & attach photo');
    }
    if (!cp2.done || !cp2.photo) {
      missing.push('Cleaning Checkpoint 2 — mark done & attach photo');
    }
    if (!allCategoriesEntered(record.closing, context.stockCategories)) {
      missing.push('Closing stock — enter counts for all brands');
    }
    return missing;
  }

  /* Carry-forward provenance. prefillOpeningFromPrev() copies the prior day's
     closing counts into today's opening with no marking, so a stale carry is
     indistinguishable from a fresh count. Derived at render time from the same
     lookback — no persisted field. */
  function carriedOpeningFields(rec, prevRecord, categories) {
    const record = rec && typeof rec === 'object' ? rec : {};
    if (record.submitted) return {};
    const prev = prevRecord && typeof prevRecord === 'object' ? prevRecord : null;
    if (!prev || !prev.closing) return {};
    const opening = record.opening || {};
    const carried = {};
    asArray(categories).forEach(cat => {
      const id = cat && typeof cat === 'object' ? cat.id : cat;
      const prior = prev.closing[id];
      if (prior === '' || prior === undefined || prior === null) return;
      if (String(opening[id]) === String(prior)) carried[id] = String(prev.date || '');
    });
    return carried;
  }

  return {
    COMPLETE,
    INCOMPLETE,
    NOT_APPLICABLE,
    SECTIONS,
    noSalesAcknowledged,
    sectionStatus,
    completionSummary,
    missingForSubmit,
    carriedOpeningFields
  };
});
