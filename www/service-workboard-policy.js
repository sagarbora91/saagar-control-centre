(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceWorkboardPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STAGES = Object.freeze({
    received: Object.freeze({ code: 'received', label: 'Received' }),
    estimate_waiting: Object.freeze({ code: 'estimate_waiting', label: 'Estimate Waiting' }),
    repair: Object.freeze({ code: 'repair', label: 'Repair' }),
    ready: Object.freeze({ code: 'ready', label: 'Ready for Pickup' }),
    on_hold: Object.freeze({ code: 'on_hold', label: 'On Hold' }),
    delivered: Object.freeze({ code: 'delivered', label: 'Delivered' })
  });
  var LEGACY_STAGE_MAP = Object.freeze({
    awaiting_approval: 'estimate_waiting',
    in_progress: 'repair'
  });
  var BOARD_LANES = Object.freeze([
    'received',
    'estimate_waiting',
    'repair',
    'ready',
    'pickup_overdue',
    'on_hold'
  ]);
  var PAYMENT_STATUSES = Object.freeze([
    'estimate_approved',
    'advance_recorded',
    'pay_at_pickup',
    'no_charge_warranty'
  ]);
  var NOTIFICATION_STATUSES = Object.freeze([
    'pending',
    'notified',
    'declined',
    'unreachable'
  ]);
  var NORMAL_TRANSITIONS = Object.freeze({
    received: Object.freeze(['estimate_waiting', 'repair', 'on_hold']),
    estimate_waiting: Object.freeze(['repair', 'on_hold']),
    repair: Object.freeze(['estimate_waiting', 'ready', 'on_hold']),
    ready: Object.freeze([]),
    on_hold: Object.freeze(['received', 'estimate_waiting', 'repair'])
  });
  var SAFE_STATUS = Object.freeze({
    received: Object.freeze({
      label: 'Received',
      text: 'Your item has been received and safely logged. We will update you after assessment.'
    }),
    estimate_waiting: Object.freeze({
      label: 'Estimate waiting',
      text: 'Assessment is complete and the service estimate is awaiting your decision.'
    }),
    repair: Object.freeze({
      label: 'Under service',
      text: 'Your item is currently under service or repair.'
    }),
    ready: Object.freeze({
      label: 'Ready for pickup',
      text: 'Your item is ready for pickup. Please contact the store before visiting.'
    }),
    on_hold: Object.freeze({
      label: 'On hold',
      text: 'Your service order needs an additional confirmation. Our team will contact you.'
    }),
    delivered: Object.freeze({
      label: 'Delivered',
      text: 'Your item has been handed over and the service order is complete.'
    })
  });

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function asciiCompare(left, right) {
    left = cleanText(left);
    right = cleanText(right);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function normalizeDate(value) {
    var text = cleanText(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    var time = Date.parse(text + 'T00:00:00Z');
    return Number.isFinite(time) ? text : '';
  }

  function normalizeMobile(value) {
    var digits = cleanText(value).replace(/\D/g, '');
    if (digits.length === 12 && digits.slice(0, 2) === '91') digits = digits.slice(2);
    return digits.length === 10 ? digits : '';
  }

  function canonicalStage(recordOrStage) {
    var record = recordOrStage && typeof recordOrStage === 'object' ? recordOrStage : null;
    if (record && cleanText(record.status).toLowerCase() === 'closed') return 'delivered';
    var raw = cleanText(record ? record.stage : recordOrStage).toLowerCase();
    raw = LEGACY_STAGE_MAP[raw] || raw;
    return STAGES[raw] ? raw : 'received';
  }

  function stageLabel(recordOrStage) {
    return STAGES[canonicalStage(recordOrStage)].label;
  }

  function isBefore(left, right) {
    left = normalizeDate(left);
    right = normalizeDate(right);
    return !!left && !!right && left < right;
  }

  function laneFor(record, options) {
    options = options || {};
    var stage = canonicalStage(record);
    if (stage === 'delivered') return 'delivered';
    if (stage === 'ready' && isBefore(record && record.expDel, options.asOf)) {
      return 'pickup_overdue';
    }
    return stage;
  }

  function transitionRequirement(record, targetStage) {
    var from = canonicalStage(record);
    var to = cleanText(targetStage).toLowerCase();
    to = LEGACY_STAGE_MAP[to] || to;
    if (!STAGES[to] || to === 'delivered') {
      return { ok: false, code: 'TARGET_INVALID', from: from, to: to };
    }
    if (from === 'delivered') {
      return { ok: false, code: 'CASE_CLOSED', from: from, to: to };
    }
    if (from === to) {
      return {
        ok: to === 'ready',
        code: to === 'ready' ? 'READINESS_REFRESH' : 'NO_CHANGE',
        from: from,
        to: to,
        readinessRequired: to === 'ready',
        overrideRequired: false
      };
    }
    var normal = (NORMAL_TRANSITIONS[from] || []).indexOf(to) >= 0;
    return {
      ok: true,
      code: normal ? 'NORMAL' : 'OVERRIDE_REQUIRED',
      from: from,
      to: to,
      readinessRequired: to === 'ready',
      overrideRequired: !normal
    };
  }

  function validateReadiness(record, input) {
    input = input || {};
    var actor = cleanText(input.actor).slice(0, 80);
    var checkedAt = cleanText(input.at);
    var promisedDate = normalizeDate(input.promisedDate || (record && record.expDel));
    var paymentStatus = cleanText(input.paymentStatus).toLowerCase();
    var notificationStatus = cleanText(input.notificationStatus).toLowerCase();
    if (input.conditionConfirmed !== true) {
      return { ok: false, code: 'CONDITION_REQUIRED', message: 'Confirm the item condition check.' };
    }
    if (PAYMENT_STATUSES.indexOf(paymentStatus) < 0) {
      return { ok: false, code: 'PAYMENT_STATUS_REQUIRED', message: 'Record the payment expectation.' };
    }
    if (!promisedDate) {
      return { ok: false, code: 'PROMISED_DATE_REQUIRED', message: 'Record the promised pickup date.' };
    }
    if (NOTIFICATION_STATUSES.indexOf(notificationStatus) < 0) {
      return { ok: false, code: 'NOTIFICATION_STATUS_REQUIRED', message: 'Record the customer notification status.' };
    }
    if (!actor) {
      return { ok: false, code: 'ACTOR_REQUIRED', message: 'Record the staff member completing readiness.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(checkedAt)) {
      return { ok: false, code: 'READINESS_TIME_REQUIRED', message: 'A valid readiness timestamp is required.' };
    }
    return {
      ok: true,
      value: {
        conditionConfirmed: true,
        paymentStatus: paymentStatus,
        promisedDate: promisedDate,
        notificationStatus: notificationStatus,
        checkedBy: actor,
        checkedAt: checkedAt
      }
    };
  }

  function planTransition(record, targetStage, input) {
    input = input || {};
    var requirement = transitionRequirement(record, targetStage);
    if (!requirement.ok) return requirement;
    var actor = cleanText(input.actor).slice(0, 80);
    var reason = cleanText(input.reason).slice(0, 240);
    var at = cleanText(input.at);
    if (!actor) {
      return { ok: false, code: 'ACTOR_REQUIRED', message: 'Record the staff member making this change.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) {
      return { ok: false, code: 'TIME_REQUIRED', message: 'A valid transition timestamp is required.' };
    }
    if (requirement.overrideRequired && input.overrideApproved !== true) {
      return {
        ok: false,
        code: 'OVERRIDE_APPROVAL_REQUIRED',
        message: 'Owner approval is required for this stage override.',
        from: requirement.from,
        to: requirement.to
      };
    }
    if (requirement.overrideRequired && !reason) {
      return {
        ok: false,
        code: 'OVERRIDE_REASON_REQUIRED',
        message: 'Record why this stage override is necessary.',
        from: requirement.from,
        to: requirement.to
      };
    }
    if (requirement.to === 'on_hold' && !reason) {
      return {
        ok: false,
        code: 'HOLD_REASON_REQUIRED',
        message: 'Record why this service order is being placed on hold.',
        from: requirement.from,
        to: requirement.to
      };
    }
    var readiness = null;
    if (requirement.readinessRequired) {
      var readinessResult = validateReadiness(record, Object.assign({}, input.readiness || {}, {
        actor: actor,
        at: at
      }));
      if (!readinessResult.ok) return readinessResult;
      readiness = readinessResult.value;
    }
    return {
      ok: true,
      from: requirement.from,
      to: requirement.to,
      readiness: readiness,
      audit: {
        from: requirement.from,
        to: requirement.to,
        at: at,
        actor: actor,
        reason: reason,
        reasonCode: requirement.overrideRequired ? 'OVERRIDE' :
          (requirement.code === 'READINESS_REFRESH' ? 'READINESS_REFRESH' : 'WORKFLOW'),
        override: requirement.overrideRequired === true
      }
    };
  }

  function readinessValid(record) {
    if (canonicalStage(record) !== 'ready') return false;
    var readiness = record && record.d3Readiness;
    if (!readiness) return false;
    return validateReadiness(record, {
      conditionConfirmed: readiness.conditionConfirmed === true,
      paymentStatus: readiness.paymentStatus,
      promisedDate: readiness.promisedDate || (record && record.expDel),
      notificationStatus: readiness.notificationStatus,
      actor: readiness.checkedBy,
      at: readiness.checkedAt
    }).ok;
  }

  function customerSafeStatus(record) {
    var stage = canonicalStage(record);
    var status = SAFE_STATUS[stage] || SAFE_STATUS.received;
    return { stage: stage, label: status.label, text: status.text };
  }

  function repeatIdentityKey(record) {
    var mobile = normalizeMobile(record && record.custMobile);
    if (!mobile) return '';
    var serial = cleanText(record && record.serialNo).toLowerCase();
    if (serial) return mobile + '|serial:' + serial;
    var brand = cleanText(record && record.brand).toLowerCase();
    var model = cleanText(record && record.model).toLowerCase();
    return brand && model ? mobile + '|item:' + brand + '|' + model : '';
  }

  function caseOrder(record) {
    return normalizeDate(record && (record.dateRec || record.createdAt)) || '9999-99-99';
  }

  function exceptionItem(code, record, options) {
    options = options || {};
    return {
      key: code + ':' + cleanText(record && record.id),
      code: code,
      caseId: cleanText(record && record.id),
      stage: canonicalStage(record),
      lane: laneFor(record, { asOf: options.asOf }),
      dueDate: normalizeDate(record && record.expDel),
      ownerLabel: cleanText(record && record.advisor).slice(0, 80),
      severity: options.severity || 'medium',
      title: options.title || code
    };
  }

  function buildExceptions(cases, options) {
    cases = Array.isArray(cases) ? cases : [];
    options = options || {};
    var asOf = normalizeDate(options.asOf);
    var identityGroups = {};
    cases.forEach(function (record) {
      var key = repeatIdentityKey(record);
      if (!key) return;
      if (!identityGroups[key]) identityGroups[key] = [];
      identityGroups[key].push(record);
    });
    Object.keys(identityGroups).forEach(function (key) {
      identityGroups[key].sort(function (left, right) {
        return asciiCompare(caseOrder(left), caseOrder(right)) ||
          asciiCompare(left && left.id, right && right.id);
      });
    });

    var output = [];
    cases.forEach(function (record) {
      if (!record || canonicalStage(record) === 'delivered') return;
      var stage = canonicalStage(record);
      var promisedDate = normalizeDate(record.expDel);
      if (!promisedDate) {
        output.push(exceptionItem('PROMISED_DATE_MISSING', record, {
          asOf: asOf,
          severity: 'high',
          title: 'Promised date missing'
        }));
      } else if (isBefore(promisedDate, asOf)) {
        output.push(exceptionItem(
          stage === 'ready' ? 'PICKUP_OVERDUE' : 'SERVICE_OVERDUE',
          record,
          {
            asOf: asOf,
            severity: 'high',
            title: stage === 'ready' ? 'Pickup overdue' : 'Service overdue'
          }
        ));
      }
      if (record.watchPhoto !== true) {
        output.push(exceptionItem('RECEIVED_PHOTO_MISSING', record, {
          asOf: asOf,
          severity: 'medium',
          title: 'Received-condition photo missing'
        }));
      }
      var key = repeatIdentityKey(record);
      var group = key && identityGroups[key];
      if (group && group.length > 1 && group[0] !== record) {
        output.push(exceptionItem('REPEAT_REPAIR_REVIEW', record, {
          asOf: asOf,
          severity: 'medium',
          title: 'Repeat repair review'
        }));
      }
      if (stage === 'ready') {
        var notification = cleanText(record.d3Readiness && record.d3Readiness.notificationStatus);
        if (notification === 'pending' || notification === 'unreachable' || !notification) {
          output.push(exceptionItem('READY_NOTIFICATION_PENDING', record, {
            asOf: asOf,
            severity: notification === 'unreachable' ? 'high' : 'medium',
            title: notification === 'unreachable' ?
              'Customer unreachable for pickup' : 'Ready notification pending'
          }));
        }
      }
    });

    var severityRank = { high: 0, medium: 1, low: 2 };
    output.sort(function (left, right) {
      var leftRank = severityRank[left.severity] == null ? 9 : severityRank[left.severity];
      var rightRank = severityRank[right.severity] == null ? 9 : severityRank[right.severity];
      return leftRank - rightRank ||
        asciiCompare(left.dueDate || '9999-99-99', right.dueDate || '9999-99-99') ||
        asciiCompare(left.caseId, right.caseId) ||
        asciiCompare(left.code, right.code);
    });
    return output;
  }

  function buildWorkboard(cases, options) {
    cases = Array.isArray(cases) ? cases : [];
    options = options || {};
    var asOf = normalizeDate(options.asOf);
    var exceptions = buildExceptions(cases, { asOf: asOf });
    var counts = {};
    exceptions.forEach(function (item) {
      counts[item.caseId] = (counts[item.caseId] || 0) + 1;
    });
    var lanes = {};
    BOARD_LANES.forEach(function (lane) { lanes[lane] = []; });
    cases.forEach(function (record) {
      var lane = laneFor(record, { asOf: asOf });
      if (!lanes[lane]) return;
      var safe = customerSafeStatus(record);
      lanes[lane].push({
        caseId: cleanText(record && record.id),
        lane: lane,
        stage: canonicalStage(record),
        itemLabel: [cleanText(record && record.brand), cleanText(record && record.model)]
          .filter(Boolean).join(' ').slice(0, 120),
        promisedDate: normalizeDate(record && record.expDel),
        ownerLabel: cleanText(record && record.advisor).slice(0, 80),
        exceptionCount: counts[cleanText(record && record.id)] || 0,
        safeStatusLabel: safe.label,
        safeStatusText: safe.text
      });
    });
    BOARD_LANES.forEach(function (lane) {
      lanes[lane].sort(function (left, right) {
        return asciiCompare(left.promisedDate || '9999-99-99', right.promisedDate || '9999-99-99') ||
          asciiCompare(left.caseId, right.caseId);
      });
    });
    return {
      asOf: asOf,
      laneOrder: BOARD_LANES.slice(),
      lanes: lanes,
      exceptions: exceptions
    };
  }

  return Object.freeze({
    STAGES: STAGES,
    BOARD_LANES: BOARD_LANES,
    PAYMENT_STATUSES: PAYMENT_STATUSES,
    NOTIFICATION_STATUSES: NOTIFICATION_STATUSES,
    normalizeDate: normalizeDate,
    normalizeMobile: normalizeMobile,
    canonicalStage: canonicalStage,
    stageLabel: stageLabel,
    laneFor: laneFor,
    transitionRequirement: transitionRequirement,
    validateReadiness: validateReadiness,
    planTransition: planTransition,
    readinessValid: readinessValid,
    customerSafeStatus: customerSafeStatus,
    repeatIdentityKey: repeatIdentityKey,
    buildExceptions: buildExceptions,
    buildWorkboard: buildWorkboard
  });
});
