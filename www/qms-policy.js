(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarQmsPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DUPLICATE_DECISIONS = Object.freeze(['OPEN_EXISTING', 'CREATE_SEPARATE', 'CANCEL']);
  var CONVERSION_REASONS = Object.freeze([
    Object.freeze({ code: 'CUSTOMER_NEED_MET', label: 'Customer need met' }),
    Object.freeze({ code: 'PRODUCT_AVAILABLE', label: 'Product / service available' }),
    Object.freeze({ code: 'PRICE_OR_OFFER_ACCEPTED', label: 'Price / offer accepted' }),
    Object.freeze({ code: 'DECISION_APPROVED', label: 'Decision approved' }),
    Object.freeze({ code: 'FOLLOWUP_CONTACT', label: 'Follow-up contact converted' }),
    Object.freeze({ code: 'REPEAT_RELATIONSHIP', label: 'Repeat relationship' }),
    Object.freeze({ code: 'OTHER', label: 'Other' })
  ]);
  var LOST_REASONS = Object.freeze([
    Object.freeze({ code: 'PRICE_ISSUE', label: 'Price issue' }),
    Object.freeze({ code: 'STOCK_UNAVAILABLE', label: 'Stock not available' }),
    Object.freeze({ code: 'BROWSING', label: 'Just browsing' }),
    Object.freeze({ code: 'DISCOUNT_EXPECTATION', label: 'Wanted discount' }),
    Object.freeze({ code: 'DECISION_PENDING', label: 'Needs family approval' }),
    Object.freeze({ code: 'COMPETITOR_COMPARISON', label: 'Competitor comparison' }),
    Object.freeze({ code: 'STAFF_EXPERIENCE', label: 'Staff handling / service issue' }),
    Object.freeze({ code: 'WAIT_TOO_LONG', label: 'Waiting time too high' }),
    Object.freeze({ code: 'TIMING_DEFERRED', label: 'Purchase timing deferred' }),
    Object.freeze({ code: 'OTHER', label: 'Other' })
  ]);
  var LOST_ALIASES = Object.freeze({
    'price issue': 'PRICE_ISSUE',
    'price': 'PRICE_ISSUE',
    'stock not available': 'STOCK_UNAVAILABLE',
    'out of stock': 'STOCK_UNAVAILABLE',
    'just browsing': 'BROWSING',
    'wanted discount': 'DISCOUNT_EXPECTATION',
    'need family approval': 'DECISION_PENDING',
    'needs family approval': 'DECISION_PENDING',
    'competitor comparison': 'COMPETITOR_COMPARISON',
    'comparing': 'COMPETITOR_COMPARISON',
    'staff handling issue': 'STAFF_EXPERIENCE',
    'staff handling / service issue': 'STAFF_EXPERIENCE',
    'waiting time too high': 'WAIT_TOO_LONG',
    'purchase timing deferred': 'TIMING_DEFERRED',
    'other': 'OTHER'
  });

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function asciiCompare(left, right) {
    left = cleanText(left);
    right = cleanText(right);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function normalizeMobile(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (digits.length === 12 && digits.slice(0, 2) === '91') digits = digits.slice(2);
    return digits.length === 10 ? digits : '';
  }

  function normalizeDate(value) {
    var text = cleanText(value);
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return '';
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day ? text : '';
  }

  function indiaBusinessDate(value) {
    var time = Date.parse(value || '');
    if (!Number.isFinite(time)) return '';
    return new Date(time + 330 * 60000).toISOString().slice(0, 10);
  }

  function dateOrdinal(value) {
    var normalized = normalizeDate(String(value || '').slice(0, 10));
    if (!normalized) return null;
    var parts = normalized.split('-').map(Number);
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  }

  function finiteNonNegative(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function timestamp(value) {
    var time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  }

  function duplicateSuggestions(draft, candidates, options) {
    draft = draft || {};
    candidates = Array.isArray(candidates) ? candidates : [];
    options = options || {};
    var mobile = normalizeMobile(draft.mobile);
    var asOf = normalizeDate(options.asOf);
    var draftId = cleanText(draft.id);
    var requestedStore = cleanText(options.storeCode).toUpperCase();
    if (!mobile || !asOf) return [];

    return candidates.reduce(function (matches, candidate, index) {
      if (!candidate || typeof candidate !== 'object') return matches;
      var candidateId = cleanText(candidate.id);
      if (draftId && candidateId && draftId === candidateId) return matches;
      if (normalizeMobile(candidate.mobile) !== mobile) return matches;
      var entryDay = normalizeDate(candidate.businessDate) ||
        indiaBusinessDate(candidate.entryTime || candidate.createdAt);
      if (entryDay !== asOf) return matches;
      var candidateStore = cleanText(candidate.storeCode || candidate.branchCode).toUpperCase();
      if (requestedStore && candidateStore && requestedStore !== candidateStore) return matches;
      var open = !candidate.outcome && cleanText(candidate.status).toLowerCase() !== 'closed';
      var kind = open ? 'SAME_DAY_OPEN' : 'SAME_DAY_CLOSED';
      var queueNo = cleanText(candidate.queueNo);
      matches.push({
        candidateId: candidateId,
        queueNo: queueNo,
        kind: kind,
        reasonCodes: ['EXACT_MOBILE'],
        label: (queueNo || 'Existing visit') + ' · ' + asOf + ' · ' +
          cleanText(candidate.outcome || candidate.status || 'Previous record'),
        decisionCodes: DUPLICATE_DECISIONS.slice(),
        _kindRank: open ? 0 : 1,
        _timestamp: timestamp(candidate.entryTime || candidate.createdAt),
        _index: index
      });
      return matches;
    }, []).sort(function (left, right) {
      if (left._kindRank !== right._kindRank) return left._kindRank - right._kindRank;
      if (left._timestamp !== right._timestamp) return right._timestamp - left._timestamp;
      return asciiCompare(left.candidateId, right.candidateId) || left._index - right._index;
    }).map(function (match) {
      delete match._kindRank;
      delete match._timestamp;
      delete match._index;
      return match;
    });
  }

  function duplicateGate(suggestions, review) {
    suggestions = Array.isArray(suggestions) ? suggestions : [];
    review = review || {};
    if (!suggestions.length) {
      return { canCreate: true, action: 'NO_MATCH', audit: { decisionCode: 'NO_MATCH', candidateIds: [], candidateCount: 0 } };
    }
    var expected = suggestions.map(function (item) { return cleanText(item.candidateId); }).filter(Boolean).sort(asciiCompare);
    var reviewed = (Array.isArray(review.candidateIds) ? review.candidateIds : [])
      .map(cleanText).filter(Boolean).sort(asciiCompare);
    var completeSet = expected.length === suggestions.length;
    var sameSet = completeSet && expected.length === reviewed.length && expected.every(function (id, index) {
      return id === reviewed[index];
    });
    var action = cleanText(review.action).toUpperCase();
    var knownAction = DUPLICATE_DECISIONS.indexOf(action) >= 0;
    var canCreate = action === 'CREATE_SEPARATE' && sameSet;
    return {
      canCreate: canCreate,
      action: knownAction ? action : 'REVIEW_REQUIRED',
      audit: {
        decisionCode: knownAction ? action : 'REVIEW_REQUIRED',
        candidateIds: expected,
        candidateCount: expected.length
      }
    };
  }

  function reasonOptions(kind) {
    var source = cleanText(kind).toLowerCase() === 'lost' ? LOST_REASONS : CONVERSION_REASONS;
    return source.map(function (reason) { return { code: reason.code, label: reason.label }; });
  }

  function reasonFor(kind, code) {
    var source = cleanText(kind).toLowerCase() === 'lost' ? LOST_REASONS : CONVERSION_REASONS;
    var wanted = cleanText(code).toUpperCase();
    return source.find(function (reason) { return reason.code === wanted; }) || null;
  }

  function normalizeReason(kind, value) {
    var text = cleanText(value);
    if (!text) return null;
    var canonical = reasonFor(kind, text);
    if (canonical) return { code: canonical.code, label: canonical.label, mapped: true };
    var source = cleanText(kind).toLowerCase() === 'lost' ? LOST_REASONS : CONVERSION_REASONS;
    var lower = text.toLowerCase();
    var byLabel = source.find(function (reason) { return reason.label.toLowerCase() === lower; });
    var aliasCode = cleanText(kind).toLowerCase() === 'lost' ? LOST_ALIASES[lower] : '';
    var mapped = byLabel || reasonFor(kind, aliasCode);
    return mapped ? { code: mapped.code, label: mapped.label, mapped: true } :
      { code: 'LEGACY_UNMAPPED', label: 'Review legacy reason', mapped: false };
  }

  function reasonLabel(kind, code) {
    var reason = reasonFor(kind, code);
    return reason ? reason.label : '';
  }

  function validateOutcome(outcome, data) {
    data = data || {};
    var normalizedOutcome = cleanText(outcome);
    if (normalizedOutcome === 'Service') return { ok: true, kind: 'service' };
    var kind = normalizedOutcome === 'Non Purchase' ? 'lost' :
      (normalizedOutcome === 'Purchase' || normalizedOutcome === 'Converted' ? 'conversion' : '');
    if (!kind) return { ok: false, code: 'OUTCOME_INVALID', message: 'Select a valid outcome.' };
    var field = kind === 'lost' ? 'lostReasonCode' : 'conversionReasonCode';
    var reason = reasonFor(kind, data[field]);
    if (!reason) {
      return {
        ok: false,
        code: kind === 'lost' ? 'LOST_REASON_REQUIRED' : 'CONVERSION_REASON_REQUIRED',
        message: kind === 'lost' ? 'Select why the opportunity was lost.' : 'Select why this converted.'
      };
    }
    var detail = cleanText(data.reasonDetail);
    if (reason.code === 'OTHER' && !detail) {
      return { ok: false, code: 'OTHER_DETAIL_REQUIRED', message: 'Add a short reason when selecting Other.' };
    }
    if (detail.length > 240) {
      return { ok: false, code: 'REASON_DETAIL_TOO_LONG', message: 'Keep reason details within 240 characters.' };
    }
    return { ok: true, kind: kind, reasonCode: reason.code, reasonLabel: reason.label, reasonDetail: detail };
  }

  function followupPriority(followup, options) {
    followup = followup || {};
    options = options || {};
    var today = dateOrdinal(options.asOf);
    if (today == null) return { ok: false, code: 'AS_OF_REQUIRED' };
    var due = dateOrdinal(followup.dueDate);
    var dueRank;
    var dueOrder;
    var dueCode;
    var dueLabel;
    if (due == null) {
      dueRank = 0; dueOrder = 0; dueCode = 'DUE_DATE_MISSING'; dueLabel = 'Due date needs review';
    } else if (due < today) {
      var overdueDays = today - due;
      dueRank = 1; dueOrder = due; dueCode = 'OVERDUE';
      dueLabel = overdueDays + ' day' + (overdueDays === 1 ? '' : 's') + ' overdue';
    } else if (due === today) {
      dueRank = 2; dueOrder = due; dueCode = 'DUE_TODAY'; dueLabel = 'Due today';
    } else {
      dueRank = 3; dueOrder = due; dueCode = 'UPCOMING';
      dueLabel = 'Due in ' + (due - today) + ' day' + (due - today === 1 ? '' : 's');
    }
    var expectedValue = finiteNonNegative(followup.expectedValue);
    var contact = dateOrdinal(followup.lastContactDate) ||
      dateOrdinal(indiaBusinessDate(followup.lastContactAt));
    var ownerId = cleanText(followup.ownerId || followup.croId || followup.assignedCroId);
    var labels = [dueLabel];
    if (expectedValue > 0) labels.push('₹' + Math.round(expectedValue).toLocaleString('en-IN') + ' expected');
    labels.push(contact == null ? 'No contact recorded' :
      (contact === today ? 'Contact logged today' : 'Last contact ' + Math.max(0, today - contact) + ' day(s) ago'));
    if (!ownerId) labels.push('Unassigned');
    return {
      ok: true,
      dueRank: dueRank,
      dueOrder: dueOrder,
      dueCode: dueCode,
      dueLabel: dueLabel,
      expectedValue: expectedValue,
      contactMissingRank: contact == null ? 0 : 1,
      contactOrder: contact == null ? 0 : contact,
      ownerMissingRank: ownerId ? 1 : 0,
      reasonLabels: labels
    };
  }

  function prioritizeFollowups(followups, options) {
    followups = Array.isArray(followups) ? followups : [];
    return followups.map(function (followup, index) {
      return {
        id: cleanText(followup && followup.id),
        sourceIndex: index,
        priority: followupPriority(followup, options),
        createdAt: cleanText(followup && followup.createdAt)
      };
    }).sort(function (left, right) {
      var a = left.priority;
      var b = right.priority;
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      if (!a.ok) return asciiCompare(left.id, right.id) || left.sourceIndex - right.sourceIndex;
      if (a.dueRank !== b.dueRank) return a.dueRank - b.dueRank;
      if (a.dueOrder !== b.dueOrder) return a.dueOrder - b.dueOrder;
      if (a.expectedValue !== b.expectedValue) return b.expectedValue - a.expectedValue;
      if (a.contactMissingRank !== b.contactMissingRank) return a.contactMissingRank - b.contactMissingRank;
      if (a.contactOrder !== b.contactOrder) return a.contactOrder - b.contactOrder;
      if (a.ownerMissingRank !== b.ownerMissingRank) return a.ownerMissingRank - b.ownerMissingRank;
      return asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.id, right.id) ||
        left.sourceIndex - right.sourceIndex;
    }).map(function (ranked) {
      return { id: ranked.id, sourceIndex: ranked.sourceIndex, priority: ranked.priority };
    });
  }

  return Object.freeze({
    DUPLICATE_DECISIONS: DUPLICATE_DECISIONS,
    CONVERSION_REASONS: CONVERSION_REASONS,
    LOST_REASONS: LOST_REASONS,
    normalizeMobile: normalizeMobile,
    indiaBusinessDate: indiaBusinessDate,
    duplicateSuggestions: duplicateSuggestions,
    duplicateGate: duplicateGate,
    reasonOptions: reasonOptions,
    normalizeReason: normalizeReason,
    reasonLabel: reasonLabel,
    validateOutcome: validateOutcome,
    followupPriority: followupPriority,
    prioritizeFollowups: prioritizeFollowups
  });
});