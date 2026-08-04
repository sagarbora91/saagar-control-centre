/*
 * Deterministic D2 patch for the QMS module embedded in www/index.html.
 * Only MODULES[id=qms] is decoded and re-encoded; bytes and sha256 are
 * regenerated from the exact UTF-8 payload written back to the bundle.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');
const marker = 'D2-QMS-2026-07-30';
const hardeningMarker = 'D2-QMS-HARDENING-2026-07-30';
const cleanupMarker = 'D2-QMS-CLEANUP-2026-07-30';
const resilienceMarker = 'D2-QMS-RESILIENCE-2026-07-30';
const legalRetryMarker = 'D2-QMS-LEGAL-RETRY-2026-07-30';
const entryRecoveryMarker = 'D2-QMS-ENTRY-RECOVERY-2026-07-30';

/* Injected blocks come from Function.prototype.toString(), which reproduces this
   file's on-disk source verbatim — line endings included. .gitattributes pins no
   *.mjs rule, so git checks this script out with CRLF on Windows and LF
   elsewhere, and an unnormalised inject would carry the wrong ending into the
   payload. Normalising anchors and injected text to the target payload's own
   ending makes the output platform-independent. Detection is per payload: the
   QMS payload is LF, the DSR payload is CRLF. */
function detectEol(source) {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function toEol(text, eol) {
  return String(text).replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

function replaceOnce(source, before, after, label) {
  const eol = detectEol(source);
  const target = toEol(after, eol);
  const anchor = toEol(before, eol);
  if (source.includes(target)) return source;
  const first = source.indexOf(anchor);
  const last = source.lastIndexOf(anchor);
  if (first < 0) throw new Error(`${label}: source anchor not found`);
  if (first !== last) throw new Error(`${label}: source anchor is not unique`);
  return source.slice(0, first) + target + source.slice(first + anchor.length);
}

function replaceFunction(source, name, replacement) {
  const eol = detectEol(source);
  const startToken = `function ${name}(`;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`${name}: function not found`);
  if (start !== source.lastIndexOf(startToken)) throw new Error(`${name}: function is not unique`);
  const end = source.indexOf(`${eol}function `, start + startToken.length);
  if (end < 0) throw new Error(`${name}: next function boundary not found`);
  return source.slice(0, start) + toEol(replacement, eol) + source.slice(end);
}

function replaceRegexExact(source, expression, replacement, expected, label) {
  const matches = [...source.matchAll(new RegExp(expression.source, expression.flags))];
  if (matches.length !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${matches.length}`);
  }
  return source.replace(expression, replacement);
}

function qmsPendingIntakeKey() {
  return 'retail_queue_management_pending_intake_v1';
}

function qmsReadPendingIntake() {
  /* D2-QMS-LEGAL-RETRY-2026-07-30 */
  const raw = localStorage.getItem(qmsPendingIntakeKey());
  if (!raw) return null;
  let token;
  try {
    token = JSON.parse(raw);
  } catch (error) {
    throw new Error('Pending intake recovery data is unreadable.');
  }
  const customerId = String(token && token.customerId || '');
  const businessDate = String(token && token.businessDate || '');
  if (!token || token.version !== 1 ||
      !/^cust_[a-z0-9_]{6,80}$/.test(customerId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('Pending intake recovery data is invalid.');
  }
  return {
    version: 1,
    customerId,
    businessDate,
    previewQueueNo: String(token.previewQueueNo || '').slice(0, 40),
    createdAt: String(token.createdAt || '')
  };
}

function qmsAcquirePendingIntake(previewQueueNo) {
  const businessDate = todayISO();
  let existing;
  try {
    existing = qmsReadPendingIntake();
  } catch (error) {
    return { ok: false, message: error.message };
  }
  if (existing && existing.businessDate === businessDate &&
      !state.customers.some(customer => customer && customer.id === existing.customerId)) {
    return { ok: true, customerId: existing.customerId, reused: true };
  }
  const token = {
    version: 1,
    customerId: uid('cust'),
    businessDate,
    previewQueueNo: String(previewQueueNo || '').slice(0, 40),
    createdAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(qmsPendingIntakeKey(), JSON.stringify(token));
    const verified = qmsReadPendingIntake();
    if (!verified || verified.customerId !== token.customerId ||
        verified.businessDate !== token.businessDate) {
      throw new Error('Pending intake token verification failed.');
    }
    return { ok: true, customerId: token.customerId, reused: false };
  } catch (error) {
    return {
      ok: false,
      message: 'The retry-safe intake token could not be saved. No privacy evidence or queue visit was created.'
    };
  }
}

function qmsClearPendingIntake(customerId) {
  try {
    const token = qmsReadPendingIntake();
    if (!token || token.customerId !== String(customerId || '')) return true;
    localStorage.removeItem(qmsPendingIntakeKey());
    return localStorage.getItem(qmsPendingIntakeKey()) == null;
  } catch (error) {
    return false;
  }
}

function qmsLegalCapture(c, noMobile) {
  const legal = qmsLegalApi();
  if (!legal) return { ok: false, message: 'Privacy control unavailable' };
  return legal.captureIntake({
    operationId: 'qms-intake:' + String(c.id || ''),
    scope: 'qms-intake',
    source: 'qms-new-walk-in',
    actor: role,
    mobile: noMobile ? '' : c.mobile,
    dateOfBirth: c.dob,
    ageBand: ($('qmsLegalAge') && $('qmsLegalAge').value) || '',
    guardian: {
      name: ($('qmsGuardianName') && $('qmsGuardianName').value) || '',
      relationship: ($('qmsGuardianRelation') && $('qmsGuardianRelation').value) || '',
      verificationMethod: ($('qmsGuardianMethod') && $('qmsGuardianMethod').value) || '',
      consent: !!($('qmsGuardianConsent') && $('qmsGuardianConsent').checked)
    },
    promotionalConsent: !noMobile && !!($('qmsPromoConsent') && $('qmsPromoConsent').checked),
    payload: c
  });
}
function qmsCaptureEntryDraft() {
  /* D2-QMS-ENTRY-RECOVERY-2026-07-30 */
  const valueIds = [
    'custMobile', 'custName', 'visitType', 'customerType', 'custDob', 'custAnniv',
    'productInterest', 'source', 'peopleCount', 'priority', 'purpose', 'allocCro',
    'qmsLegalAge', 'qmsGuardianName', 'qmsGuardianRelation', 'qmsGuardianMethod'
  ];
  const checkIds = ['noMobileChk', 'qmsGuardianConsent', 'qmsPromoConsent'];
  const values = {};
  const checks = {};
  valueIds.forEach(id => {
    if ($(id)) values[id] = $(id).value;
  });
  checkIds.forEach(id => {
    if ($(id)) checks[id] = !!$(id).checked;
  });
  return { values, checks };
}

function qmsRestoreEntryDraft(draft) {
  if (!draft || !draft.values || !draft.checks) return;
  Object.keys(draft.values).forEach(id => {
    if ($(id)) $(id).value = draft.values[id];
  });
  Object.keys(draft.checks).forEach(id => {
    if ($(id)) $(id).checked = !!draft.checks[id];
  });
  onNoMobileToggle();
  showCustomerHistory();
}
/* D2-QMS-2026-07-30 */
function qmsPolicyApi() {
  /* D2-QMS-2026-07-30 */
  try {
    return (window.parent && window.parent !== window && window.parent.SaagarQmsPolicy) ||
      window.SaagarQmsPolicy || null;
  } catch (error) {
    return null;
  }
}

function qmsPersistenceApi() {
  try {
    return (window.parent && window.parent !== window && window.parent.SaagarQmsPersistence) ||
      window.SaagarQmsPersistence || null;
  } catch (error) {
    return null;
  }
}

function qmsRestorePersistedState() {
  /* D2-QMS-RESILIENCE-2026-07-30 */
  load();
  renderAll();
}

function qmsPrepareFastOutcome(customer) {
  if (!customer || !customer.assignedCroId) return false;
  customer.attendStart = customer.attendStart || new Date().toISOString();
  customer.status = 'In Discussion';
  addAudit('customer.attend.start', {
    queueNo: customer.queueNo,
    source: 'fast-outcome'
  }, true);
  return true;
}

function save(action, details) {
  const persistence = qmsPersistenceApi();
  if (!persistence || typeof persistence.commit !== 'function') {
    qmsRestorePersistedState();
    toast('Save control unavailable. Nothing was changed.', 'error');
    return false;
  }
  const auditEntry = action ? {
    id: uid('aud'),
    at: new Date().toISOString(),
    role,
    action,
    details: details || {}
  } : null;
  if (!persistence.commit(localStorage, STORE_KEY, state, auditEntry, 600)) {
    qmsRestorePersistedState();
    toast('Save failed. Your previous saved data is unchanged; retry when storage is available.', 'error');
    return false;
  }
  renderAll();
  return true;
}

function addAudit(action, details = {}, skipSave = false) {
  if (!skipSave) return save(action, details);
  state.audit.unshift({ id: uid('aud'), at: new Date().toISOString(), role, action, details });
  state.audit = state.audit.slice(0, 600);
  return true;
}

function indiaBusinessDateFromIso(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '';
  return new Date(time + 330 * 60000).toISOString().slice(0, 10);
}

function customerBusinessDate(customer) {
  /* D2-QMS-HARDENING-2026-07-30 */
  /* D2-QMS-CLEANUP-2026-07-30 */
  const explicit = String((customer && customer.businessDate) || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(explicit)
    ? explicit
    : indiaBusinessDateFromIso(customer && customer.entryTime);
}

function todaysCustomers() {
  return state.customers.filter(customer => customerBusinessDate(customer) === viewAsOf);
}

function qmsDuplicateSuggestions(mobile) {
  const policy = qmsPolicyApi();
  if (!policy || typeof policy.duplicateSuggestions !== 'function') return null;
  return policy.duplicateSuggestions(
    { mobile },
    state.customers,
    { asOf: todayISO() }
  );
}

function qmsOpenExistingDuplicate(id) {
  const customer = customerById(id);
  if (!customer) {
    toast('The selected visit is no longer available.', 'warn');
    return;
  }
  switchView('live');
  openCustomer(id);
}

function qmsOpenExistingDuplicateByIndex(index) {
  const suggestions = Array.isArray(window.__qmsDuplicateSuggestions)
    ? window.__qmsDuplicateSuggestions : [];
  const suggestion = suggestions[Number(index)];
  if (!suggestion) {
    toast('The duplicate suggestion is no longer available.', 'warn');
    return;
  }
  qmsOpenExistingDuplicate(suggestion.candidateId);
}

function showCustomerHistory() {
  const mobile = $('custMobile')?.value.trim() || '';
  const box = $('historyBox');
  if (!box) return;
  const m10 = _qmsNorm10(mobile);
  if (m10.length !== 10) {
    window.__qmsDuplicateSuggestions = [];
    box.innerHTML = '<div class="empty-state"><p>Enter the full 10-digit mobile number to see history</p></div>';
    return;
  }

  const hist = state.customers.filter(c => _qmsNorm10(c.mobile) === m10).slice(-6).reverse();
  const histHtml = hist.map(c => `<div class="hist-item"><strong>${esc(c.queueNo)} &middot; ${fmtDT(c.entryTime)}</strong><div class="mini">Outcome: ${esc(c.outcome || c.status)} &middot; CRO: ${esc(croName(c.assignedCroId))} &middot; ₹${(+c.purchaseAmount || 0).toLocaleString('en-IN')}</div><div class="mini">${esc(c.notes || c.purpose || '')}</div></div>`).join('') ||
    '<div class="empty-state"><p>No previous visits found</p></div>';

  let duplicateUi = '';
  const suggestions = m10.length === 10 ? qmsDuplicateSuggestions(m10) : [];
  window.__qmsDuplicateSuggestions = Array.isArray(suggestions) ? suggestions : [];
  if (Array.isArray(suggestions) && suggestions.length) {
    duplicateUi = `<div class="warn-note" style="margin-bottom:12px"><strong>Possible same-day visit — operator review required</strong><div class="mini" style="margin:5px 0 8px">These are suggestions only. Records are never merged or deleted automatically.</div>${suggestions.map((s, index) => `<div class="hist-item"><strong>${esc(s.label)}</strong><div style="margin-top:6px"><button class="btn xs ghost" type="button" onclick="qmsOpenExistingDuplicateByIndex(${index})">Open existing visit</button></div></div>`).join('')}</div>`;
  } else if (suggestions === null && m10.length === 10) {
    duplicateUi = '<div class="danger-note" style="margin-bottom:12px">Duplicate review is unavailable. Saving a mobile-number visit is blocked until the control is restored.</div>';
  }

  let banner = '';
  if (m10.length === 10) {
    const cm = _qmsMaster();
    const me = cm && cm.byMobile && cm.byMobile[m10];
    const localVisits = state.customers.filter(c => _qmsNorm10(c.mobile) === m10);
    const pastVisits = localVisits.length;
    if (me || pastVisits > 0) {
      const purchases = localVisits.filter(c => c.outcome === 'Purchase')
        .sort((a, b) => String(b.closedAt || b.exitTime || b.entryTime || '')
          .localeCompare(String(a.closedAt || a.exitTime || a.entryTime || '')));
      const lastBuy = purchases[0];
      const vTxt = pastVisits + ' past visit' + (pastVisits === 1 ? '' : 's');
      let boughtTxt = '';
      if (lastBuy) {
        const cat = lastBuy.purchaseCategory || 'Purchase';
        const amt = +lastBuy.purchaseAmount || 0;
        boughtTxt = ' &middot; last bought ' + esc(cat) + ' ₹' + amt.toLocaleString('en-IN');
      }
      banner = `<div class="info-note" style="margin-bottom:12px">Repeat customer — ${vTxt}${boughtTxt}</div>`;
      const select = $('customerType');
      if (select && select.value === 'New' && window.__qmsTypeFlipFor !== m10) {
        select.value = 'Repeat';
        window.__qmsTypeFlipFor = m10;
      }
    }
  }

  let archiveUi = '';
  if (m10.length === 10) {
    archiveUi = `<div style="margin-top:12px"><button class="btn sm" type="button" onclick="qmsSearchArchive('${esc(m10)}')">Search older visits</button><div id="qmsArchiveResults"></div></div>`;
  }
  box.innerHTML = duplicateUi + banner + histHtml + archiveUi;
}

function addCustomer() {
  const nextAction = arguments[0] || 'live';
  if (isPast()) {
    toast('Viewing a past date — read-only.', 'warn');
    return;
  }
  if (eodLockActive()) {
    toast('EOD is closed — no new walk-ins. Create a fresh rotation to resume.', 'error');
    return;
  }
  const noMobile = !!($('noMobileChk') && $('noMobileChk').checked);
  const mobile = noMobile ? '' : $('custMobile').value.trim();
  const name = $('custName').value.trim();
  if (!noMobile && !/^\d{10}$/.test(mobile)) {
    toast('Mobile must be 10 digits.', 'error');
    return;
  }
  if (!name) {
    toast('Customer name required.', 'error');
    return;
  }

  let duplicateReview = { decisionCode: 'NO_MATCH', candidateIds: [], candidateCount: 0 };
  if (!noMobile) {
    const policy = qmsPolicyApi();
    const suggestions = qmsDuplicateSuggestions(mobile);
    if (!policy || !Array.isArray(suggestions) || typeof policy.duplicateGate !== 'function') {
      toast('Duplicate review unavailable. Nothing was saved.', 'error');
      return;
    }
    if (suggestions.length) {
      const hasOpen = suggestions.some(s => s.kind === 'SAME_DAY_OPEN');
      const prompt = hasOpen
        ? 'This mobile already has an open visit today. Review the suggested visit first. Press OK only to create a separate queue entry; Cancel keeps this form unchanged.'
        : 'This mobile already has a completed visit today. Press OK only to record a genuinely separate visit; Cancel keeps this form unchanged.';
      if (!confirm(prompt)) return;
      const gate = policy.duplicateGate(suggestions, {
        action: 'CREATE_SEPARATE',
        candidateIds: suggestions.map(s => s.candidateId)
      });
      if (!gate.canCreate) {
        toast('Explicit duplicate review is required before creating a separate visit.', 'error');
        return;
      }
      duplicateReview = gate.audit;
    }
  }

  const entryDraft = qmsCaptureEntryDraft();
  const c = {
    id: null,
    queueNo: getQueueNo(),
    entryTime: new Date().toISOString(),
    name,
    mobile,
    noMobile,
    visitType: $('visitType').value,
    customerType: $('customerType').value,
    dob: (($('custDob') && $('custDob').value) || ''),
    anniv: (($('custAnniv') && $('custAnniv').value) || ''),
    productInterest: $('productInterest').value.trim(),
    source: $('source').value,
    peopleCount: +$('peopleCount').value || 1,
    priority: $('priority').value,
    purpose: $('purpose').value.trim(),
    status: 'New Entry',
    assignedCroId: null,
    expectedCroId: null,
    attendStart: null,
    exitTime: null,
    outcome: null,
    notes: ''
  };
  const pendingIntake = qmsAcquirePendingIntake(c.queueNo);
  if (!pendingIntake.ok) {
    toast(pendingIntake.message, 'error');
    return;
  }
  c.id = pendingIntake.customerId;
  let legalResult;
  try {
    legalResult = qmsLegalCapture(c, noMobile);
  } catch (error) {
    if (error && error.code === 'IDEMPOTENCY_CONFLICT') {
      const reset = qmsClearPendingIntake(c.id);
      toast(reset
        ? 'Intake details changed after a partial attempt. Press Save again to start a new retry-safe attempt.'
        : 'Intake details changed, but the pending token could not be reset. Nothing was saved; free storage and retry.', 'error');
      return;
    }
    toast('Privacy evidence could not be saved. The queue visit was not created; retry or review the legal log if this repeats.', 'error');
    return;
  }
  if (!legalResult.ok) {
    if (legalResult.code === 'IDEMPOTENCY_CONFLICT') {
      const reset = qmsClearPendingIntake(c.id);
      toast(reset
        ? 'Intake details changed after a partial attempt. Press Save again to start a new retry-safe attempt.'
        : 'Intake details changed, but the pending token could not be reset. Nothing was saved; free storage and retry.', 'error');
      return;
    }
    toast(legalResult.message || ('Privacy control blocked save: ' + (legalResult.code || 'check required')), 'error');
    return;
  }

  c.queueNo = nextQueueNo();
  state.customers.push(c);
  window.__qmsFastOutcomeId = nextAction === 'outcome' ? c.id : null;
  const selectedCro = (role === 'SM' || role === 'Admin') && $('allocCro') ? $('allocCro').value : '';
  if (selectedCro) {
    manualAllocate(c.id, selectedCro);
  } else if (noMobile) {
    allocateCustomer(c.id);
  } else {
    routeWithPreclaim(c);
  }

  const fastReady = nextAction === 'outcome' && qmsPrepareFastOutcome(c);
  const skipPending = nextAction === 'outcome' && !fastReady &&
    $('modalBackdrop') && !$('modalBackdrop').classList.contains('hidden');
  if (!skipPending && !fastReady) window.__qmsFastOutcomeId = null;

  if (!save('customer.create', {
    queueNo: c.queueNo,
    noMobile: c.noMobile,
    fastOutcome: nextAction === 'outcome',
    intakeOperationId: 'qms-intake:' + c.id,
    duplicateReview
  })) {
    if (skipPending) closeModal();
    window.__qmsFastOutcomeId = null;
    qmsRestoreEntryDraft(entryDraft);
    return;
  }

  qmsClearPendingIntake(c.id);
  clearEntryForm();
  if (fastReady) {
    window.__qmsFastOutcomeId = null;
    toast(`${c.queueNo} added — complete the outcome.`, 'success');
    switchView('live');
    openCloseLead(c.id);
    return;
  }
  if (skipPending) {
    toast(`${c.queueNo} saved. Complete the skip decision to open outcome.`, 'warn');
    return;
  }
  toast(`${c.queueNo} added${nextAction === 'outcome' ? '; assign a CRO before outcome.' : '.'}`, nextAction === 'outcome' ? 'warn' : 'success');
  switchView('live');
}

function savePreclaim() {
  if (!guardWrite()) return;
  const croId = $('pcCro') ? $('pcCro').value : '';
  const name = $('pcName').value.trim();
  const mobile = $('pcMobile').value.trim();
  const note = $('pcNote') ? $('pcNote').value.trim() : '';
  if (!croId) {
    toast('Select a CRO.', 'error');
    return;
  }
  if (!name) {
    toast('Customer name required.', 'error');
    return;
  }
  if (!/^\d{10}$/.test(mobile)) {
    toast('Mobile must be 10 digits.', 'error');
    return;
  }
  const existing = findActivePreclaim(mobile);
  if (existing) {
    toast('Already pre-claimed by ' + croName(existing.croId) + '.', 'error');
    return;
  }
  state.preclaims.push({
    id: uid('pc'),
    croId,
    customerName: name,
    mobile,
    note,
    createdAt: new Date().toISOString(),
    createdBy: role,
    date: todayISO(),
    status: 'Active',
    honoredCustomerId: null
  });
  if (!save('preclaim.create', { croId, croName: croName(croId) })) {
    if ($('pcCro')) $('pcCro').value = croId;
    if ($('pcName')) $('pcName').value = name;
    if ($('pcMobile')) $('pcMobile').value = mobile;
    if ($('pcNote')) $('pcNote').value = note;
    return;
  }
  ['pcName', 'pcMobile'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('pcNote')) $('pcNote').value = '';
  toast('Pre-claim added for ' + croName(croId) + '.', 'success');
}

function updateSetting(key, value) {
  if (!guardPast()) return false;
  if (!requireSM()) return false;
  if (key === 'waitAlertMins') value = +value || 10;
  state.settings[key] = value;
  return save('settings.update', { key, value });
}

function openSkipTurn(customerId, expectedCroId) {
  const rot = currentRotation();
  const c = customerById(customerId);
  if (!rot || !c) {
    toast('The queue visit or rotation is no longer available.', 'error');
    return;
  }
  const actual = nextFreeCro(rot, expectedCroId) || firstAvailableCro(rot, [expectedCroId]) || expectedCroId;
  const items = activeRotationItems(rot);
  const croIds = items.map(item => String(item.croId || ''));
  window.__qmsSkipContext = {
    customerId: String(customerId || ''),
    expectedCroId: String(expectedCroId || ''),
    croIds
  };
  const options = items.map((item, index) =>
    `<option value="${index}" ${item.croId === actual ? 'selected' : ''}>${esc(croName(item.croId))}</option>`
  ).join('');
  openModal(
    'Record Skip Reason',
    `<div class="danger-note" style="margin-bottom:14px">Expected CRO <b>${esc(croName(expectedCroId))}</b> is unavailable for ${esc(c.queueNo)}.</div><div class="form-grid"><div class="field full"><label class="label">Skip Reason *</label><select class="select" id="skipReason"><option>Washroom</option><option>Tea / Lunch Break</option><option>Half Day</option><option>Busy With Existing Customer</option><option>Not Near Entrance</option><option>On Phone Call</option><option>Service Desk Work</option><option>Stock / Billing Work</option><option>Customer Follow-up</option><option>Manager Assigned Work</option><option>Refused Turn</option><option>Other</option></select></div><div class="field full"><label class="label">Allocate Customer To</label><select class="select" id="actualCro">${options}</select></div><div class="field full"><label class="label">Note (optional)</label><input class="input" id="skipNote" placeholder="Additional detail..."></div><div class="field full"><label class="switch"><input type="checkbox" id="nextOpp" ${role === 'Greeter' ? 'disabled' : ''}><div class="switch-track"></div><div class="switch-thumb"></div></label>&nbsp; Give skipped CRO next opportunity ${role === 'Greeter' ? '<span class="badge gray">SM right required</span>' : ''}</div></div>`,
    '<button class="btn ghost" onclick="window.__qmsSkipContext=null;closeModal()">Cancel</button><button class="btn primary" onclick="confirmSkip()">Confirm &amp; Allocate</button>'
  );
}

function confirmSkip() {
  if (!guardWrite()) return;
  const context = window.__qmsSkipContext;
  if (!context || !Array.isArray(context.croIds)) {
    toast('The skip decision expired. Open it again.', 'error');
    closeModal();
    return;
  }
  const customerId = String(context.customerId || '');
  const expectedCroId = String(context.expectedCroId || '');
  const selectedIndex = Number($('actualCro') && $('actualCro').value);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= context.croIds.length) {
    toast('Select a valid CRO.', 'error');
    return;
  }
  const actualCroId = String(context.croIds[selectedIndex] || '');
  const rot = currentRotation();
  if (!rot) {
    toast("Today's rotation is no longer active.", 'error');
    closeModal();
    return;
  }
  const c = customerById(customerId);
  const actualItem = rotationItem(rot, actualCroId);
  if (!c || !actualItem) {
    toast('The queue visit or selected CRO is no longer available.', 'error');
    closeModal();
    return;
  }
  const reason = $('skipReason').value;
  if (!reason) {
    toast('Select a skip reason.', 'error');
    return;
  }
  const note = $('skipNote').value.trim();
  if (reason === 'Other' && !note) {
    toast('Add a note for "Other" reason.', 'error');
    return;
  }
  if (isOffFloor(actualItem) && !confirm(croName(actualCroId) + ' is off-floor. Allocate to them anyway?')) return;
  const nextOpportunity = $('nextOpp').checked && role !== 'Greeter';
  const wasPriority = rot.priorityCroId === expectedCroId;
  let priorityCancelled = false;
  c.expectedCroId = expectedCroId;
  c.assignedCroId = actualCroId;
  c.allocatedTime = new Date().toISOString();
  c.status = 'Allocated';
  if (nextOpportunity) {
    if (wasPriority) {
      rot.priorityCroId = null;
      priorityCancelled = true;
    } else {
      rot.priorityCroId = expectedCroId;
    }
  } else {
    if (rot.priorityCroId === expectedCroId) rot.priorityCroId = null;
    if (wasPriority) priorityCancelled = true;
    advancePointer(rot, actualCroId);
  }
  rot.turnEvents.push({
    id: uid('turn'),
    at: new Date().toISOString(),
    queueNo: c.queueNo,
    expectedCroId,
    actualCroId,
    skipped: true,
    reason,
    note,
    nextOpportunity,
    priorityCancelled,
    by: role
  });
  if (reason === 'Half Day') {
    const item = rotationItem(rot, expectedCroId);
    if (item) {
      item.status = 'Half Day';
      item.active = false;
    }
  }
  const continueFast = window.__qmsFastOutcomeId === c.id && qmsPrepareFastOutcome(c);
  if (!save('turn.skip', {
    queueNo: c.queueNo,
    expectedCroId,
    actualCroId,
    reason,
    nextOpportunity,
    fastOutcome: continueFast
  })) return;
  window.__qmsSkipContext = null;
  closeModal();
  toast('Skip recorded.', 'success');
  if (continueFast) {
    window.__qmsFastOutcomeId = null;
    switchView('live');
    openCloseLead(c.id);
  }
}
function openCustomer(id) {
  const c = customerById(id);
  if (!c) return;
  const reason = c.outcome === 'Non Purchase' ? c.lostReason : c.outcome === 'Purchase' ? c.conversionReason : '';
  const reasonCode = c.outcome === 'Non Purchase' ? c.lostReasonCode : c.outcome === 'Purchase' ? c.conversionReasonCode : '';
  const reasonDetail = c.outcome === 'Non Purchase' ? c.lostReasonDetail : c.outcome === 'Purchase' ? c.conversionReasonDetail : '';
  openModal(`${esc(c.queueNo)} — ${esc(c.name)}`, `<div class="grid-2" style="gap:12px"><div class="report-card"><h4>Customer</h4><div class="report-row"><span class="rk">Mobile</span><span class="rv mono">${esc(c.mobile)}</span></div><div class="report-row"><span class="rk">Visit Type</span><span class="rv">${esc(c.visitType)}</span></div><div class="report-row"><span class="rk">Purpose</span><span class="rv">${esc(c.purpose || '—')}</span></div><div class="report-row"><span class="rk">Product</span><span class="rv">${esc(c.productInterest || '—')}</span></div><div class="report-row"><span class="rk">Source</span><span class="rv">${esc(c.source)}</span></div></div><div class="report-card"><h4>Timeline</h4><div class="report-row"><span class="rk">Entry</span><span class="rv">${fmtDT(c.entryTime)}</span></div><div class="report-row"><span class="rk">Allocated</span><span class="rv">${fmtDT(c.allocatedTime)}</span></div><div class="report-row"><span class="rk">Attend</span><span class="rv">${fmtDT(c.attendStart)}</span></div><div class="report-row"><span class="rk">Exit</span><span class="rv">${fmtDT(c.exitTime)}</span></div><div class="report-row"><span class="rk">Closed</span><span class="rv">${fmtDT(c.closedAt)}</span></div></div></div><div class="report-card" style="margin-top:12px"><h4>Outcome</h4><div class="report-row"><span class="rk">Status</span><span class="rv">${esc(c.status)}</span></div><div class="report-row"><span class="rk">Outcome</span><span class="rv">${esc(c.outcome || '—')}</span></div>${reason ? `<div class="report-row"><span class="rk">Reason</span><span class="rv">${esc(reason)}${reasonCode ? ` <span class="badge gray mono">${esc(reasonCode)}</span>` : ''}</span></div>` : ''}${reasonDetail ? `<div class="report-row"><span class="rk">Reason detail</span><span class="rv">${esc(reasonDetail)}</span></div>` : ''}<div class="report-row"><span class="rk">CRO</span><span class="rv">${esc(croName(c.assignedCroId))}</span></div><div class="report-row"><span class="rk">Notes</span><span class="rv">${esc(c.notes || '—')}</span></div></div>`, `<button class="btn ghost" onclick="closeModal()">Close</button>`);
}

function qmsReasonOptionsHtml(kind) {
  const policy = qmsPolicyApi();
  if (!policy || typeof policy.reasonOptions !== 'function') {
    return '<option value="">Reason control unavailable</option>';
  }
  return '<option value="">Select reason</option>' + policy.reasonOptions(kind)
    .map(reason => `<option value="${esc(reason.code)}">${esc(reason.label)}</option>`).join('');
}

function qmsValidateOutcome(outcome, data) {
  const policy = qmsPolicyApi();
  if (!policy || typeof policy.validateOutcome !== 'function') {
    return { ok: false, message: 'Outcome reason control unavailable.' };
  }
  return policy.validateOutcome(outcome, data);
}

function renderOutcomeFields() {
  const out = $('closeOutcome').value;
  const followup = $('fuReq').value;
  let html = '';
  if (out === 'Purchase') {
    html = `<div class="form-grid"><div class="field"><label class="label">Bill No. ${state.settings.requireBillForPurchase ? '*' : ''}</label><input class="input" id="billNo"></div><div class="field"><label class="label">Amount *</label><input class="input" id="purchaseAmount" type="number" min="0"></div><div class="field"><label class="label">Category</label><input class="input" id="purchaseCategory" placeholder="Watch"></div><div class="field"><label class="label">Payment Mode</label><select class="select" id="paymentMode"><option>Cash</option><option>Card</option><option>UPI</option><option>Mixed</option></select></div><div class="field"><label class="label">Conversion reason *</label><select class="select" id="conversionReasonCode">${qmsReasonOptionsHtml('conversion')}</select></div><div class="field"><label class="label">Reason detail (required for Other)</label><input class="input" id="conversionReasonDetail" maxlength="240"></div></div>`;
  }
  if (out === 'Service') {
    html = `<div class="form-grid"><div class="field"><label class="label">Job Card No. ${state.settings.requireJobForService ? '*' : ''}</label><input class="input" id="jobCardNo"></div><div class="field"><label class="label">Service Type</label><select class="select" id="serviceType"><option>Battery</option><option>Repair</option><option>Strap</option><option>Polishing</option><option>Warranty</option><option>Other</option></select></div><div class="field"><label class="label">Expected Delivery</label><input class="input" id="deliveryDate" type="date"></div><div class="field"><label class="label">Advance</label><input class="input" id="advance" type="number" min="0"></div></div>`;
  }
  if (out === 'Non Purchase') {
    html = `<div class="form-grid"><div class="field"><label class="label">Lost-opportunity reason *</label><select class="select" id="lostReasonCode">${qmsReasonOptionsHtml('lost')}</select></div><div class="field"><label class="label">Reason detail (required for Other)</label><input class="input" id="lostReasonDetail" maxlength="240"></div><div class="field"><label class="label">Estimated Lost Value</label><input class="input" id="lostValue" type="number" min="0"></div></div>`;
  }
  if (followup === 'Yes') {
    html += `<div class="form-grid" style="margin-top:4px"><div class="field"><label class="label">Follow-up Date *</label><input class="input" id="followDate" type="date"></div><div class="field"><label class="label">Expected Value</label><input class="input" id="followExpectedValue" type="number" min="0" placeholder="₹"></div><div class="field"><label class="label">Mode</label><select class="select" id="followMode"><option>Phone Call</option><option>WhatsApp</option><option>In Store</option><option>SMS</option></select></div><div class="field full"><label class="label">Follow-up Notes</label><input class="input" id="followNotes" placeholder="What to follow up about..."></div></div>`;
  }
  $('outcomeFields').innerHTML = html;
}

function confirmCloseLead(id) {
  if (!guardWrite()) return;
  const c = customerById(id);
  if (!c) return;
  const out = $('closeOutcome').value;
  const followupRequired = $('fuReq').value === 'Yes';
  if (followupRequired && !c.mobile) {
    toast('Cannot set a follow-up without a mobile number.', 'error');
    return;
  }

  const staged = {};
  if (out === 'Purchase') {
    const bill = $('billNo').value.trim();
    const amount = Number($('purchaseAmount').value);
    if (state.settings.requireBillForPurchase && !bill) {
      toast('Bill number required.', 'error');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast('Purchase amount must be greater than zero.', 'error');
      return;
    }
    const reason = qmsValidateOutcome('Purchase', {
      conversionReasonCode: $('conversionReasonCode').value,
      reasonDetail: $('conversionReasonDetail').value
    });
    if (!reason.ok) {
      toast(reason.message, 'error');
      return;
    }
    Object.assign(staged, {
      billNo: bill,
      purchaseAmount: amount,
      purchaseCategory: $('purchaseCategory').value.trim(),
      paymentMode: $('paymentMode').value,
      conversionReasonCode: reason.reasonCode,
      conversionReason: reason.reasonLabel,
      conversionReasonDetail: reason.reasonDetail
    });
  }
  if (out === 'Service') {
    const job = $('jobCardNo').value.trim();
    if (state.settings.requireJobForService && !job) {
      toast('Job card required.', 'error');
      return;
    }
    Object.assign(staged, {
      jobCardNo: job,
      serviceType: $('serviceType').value,
      deliveryDate: $('deliveryDate').value,
      advance: +$('advance').value || 0
    });
  }
  if (out === 'Non Purchase') {
    const reason = qmsValidateOutcome('Non Purchase', {
      lostReasonCode: $('lostReasonCode').value,
      reasonDetail: $('lostReasonDetail').value
    });
    if (!reason.ok) {
      toast(reason.message, 'error');
      return;
    }
    const lostValue = Number($('lostValue').value || 0);
    if (!Number.isFinite(lostValue) || lostValue < 0) {
      toast('Estimated lost value must be zero or more.', 'error');
      return;
    }
    Object.assign(staged, {
      lostReasonCode: reason.reasonCode,
      lostReason: reason.reasonLabel,
      lostReasonDetail: reason.reasonDetail,
      lostValue
    });
  }

  let followupDraft = null;
  if (followupRequired) {
    const dueDate = $('followDate').value;
    if (!dueDate) {
      toast('Follow-up date required.', 'error');
      return;
    }
    let expectedValue = Number($('followExpectedValue').value || 0);
    if (!Number.isFinite(expectedValue) || expectedValue < 0) {
      toast('Expected value must be zero or more.', 'error');
      return;
    }
    if (!expectedValue && out === 'Non Purchase') expectedValue = staged.lostValue || 0;
    followupDraft = {
      id: uid('fu'),
      customerId: c.id,
      queueNo: c.queueNo,
      customerName: c.name,
      mobile: c.mobile,
      croId: c.assignedCroId,
      dueDate,
      expectedValue,
      lastContactAt: null,
      contactCount: 0,
      mode: $('followMode').value,
      notes: $('followNotes').value.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
  }

  Object.assign(c, staged);
  if (followupDraft) state.followups.push(followupDraft);
  c.outcome = out;
  c.notes = $('closeNotes').value.trim();
  c.closedAt = new Date().toISOString();
  c.closedBy = role;
  c.status = 'Closed';
  if (!c.exitTime) c.exitTime = new Date().toISOString();
  tryFillFromWaiting();
  if (!save('lead.close', { queueNo: c.queueNo, outcome: out, followup: followupRequired, reasonCode: staged.lostReasonCode || staged.conversionReasonCode || null })) return;
  closeModal();
  toast('Lead closed.', 'success');
}

function qmsPendingFollowupId(index) {
  const ids = Array.isArray(window.__qmsPendingFollowupIds) ? window.__qmsPendingFollowupIds : [];
  return ids[Number(index)] || '';
}

function qmsFollowupAction(index, action) {
  const id = qmsPendingFollowupId(index);
  if (!id) {
    toast('The selected follow-up is no longer available.', 'warn');
    return;
  }
  if (action === 'Contacted') return markFollowupContacted(id);
  return updateFollowup(id, action);
}

function qmsWaFuByIndex(index) {
  const id = qmsPendingFollowupId(index);
  if (!id) {
    toast('The selected follow-up is no longer available.', 'warn');
    return;
  }
  qmsWaFu(id);
}

function qmsFollowupContactBtns(index, mobile) {
  const digits = qmsTel10(mobile);
  if (!digits) return '';
  return `<span style="display:inline-flex;gap:4px;vertical-align:middle;margin-left:6px"><a class="btn xs ghost" style="text-decoration:none;padding:2px 7px" href="tel:+91${digits}" title="Call">📞</a><button class="btn xs ghost" style="padding:2px 7px" onclick="qmsWaFuByIndex(${Number(index)})" title="WhatsApp">📲</button></span>`;
}

function confirmLostFollowupModal() {
  const id = String(window.__qmsFollowupModalId || '');
  if (!id) return toast('The selected follow-up is no longer available.', 'warn');
  return confirmLostFollowup(id);
}

function confirmConvertFollowupModal() {
  const id = String(window.__qmsFollowupModalId || '');
  if (!id) return toast('The selected follow-up is no longer available.', 'warn');
  return confirmConvertFollowup(id);
}

function renderFollowups() {
  const rawPending = state.followups.filter(f => f.status === 'Pending');
  const done = state.followups.filter(f => f.status !== 'Pending')
    .slice().sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')) ||
      String(a.id || '').localeCompare(String(b.id || '')));
  const policy = qmsPolicyApi();
  const ranked = policy && typeof policy.prioritizeFollowups === 'function'
    ? policy.prioritizeFollowups(rawPending, { asOf: todayISO() })
    : rawPending.map((f, sourceIndex) => ({
      id: f.id,
      sourceIndex,
      priority: {
        dueCode: 'CONTROL_UNAVAILABLE',
        dueLabel: 'Priority control unavailable',
        expectedValue: +f.expectedValue || 0,
        reasonLabels: ['Priority control unavailable']
      }
    }));
  const pending = ranked.map(item => ({
    followup: rawPending[item.sourceIndex],
    priority: item.priority
  })).filter(item => item.followup);
  window.__qmsPendingFollowupIds = pending.map(item => item.followup.id);
  const controlWarning = policy ? '' :
    '<div class="danger-note" style="margin:0 16px 14px">Follow-up priority control is unavailable. No automatic ranking claim is shown.</div>';

  $('view-followups').innerHTML = `<div class="page-header"><div class="page-header-left"><h1>Follow-ups</h1><p>${pending.length} pending &middot; ${done.length} closed</p></div></div><div class="card"><div class="card-head"><div><div class="card-title">Pending Follow-ups</div><div class="card-sub">Ordered by due status, expected value, last contact, owner and stable task id</div></div></div>${controlWarning}<div class="card-body" style="padding:0">${pending.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Priority</th><th>Customer</th><th>Owner</th><th>Expected</th><th>Last contact</th><th>Mode</th><th>Actions</th></tr></thead><tbody>${pending.map((item, index) => {
    const f = item.followup;
    const p = item.priority;
    const priorityClass = p.dueCode === 'OVERDUE' || p.dueCode === 'DUE_DATE_MISSING' ? 'red' :
      p.dueCode === 'DUE_TODAY' ? 'orange' : 'navy';
    const expected = Number.isFinite(+p.expectedValue) && +p.expectedValue >= 0 ? +p.expectedValue : 0;
    return `<tr><td><span class="badge ${priorityClass}">${esc(p.dueLabel || f.dueDate || 'Review')}</span><div class="mini" style="max-width:210px;margin-top:5px">${(p.reasonLabels || []).map(esc).join(' &middot; ')}</div></td><td><b>${esc(f.customerName)}</b><div class="sub mono">${esc(f.queueNo)} &middot; ${esc(f.mobile)}</div>${qmsFollowupContactBtns(index, f.mobile)}</td><td>${f.croId ? esc(croName(f.croId)) : '<span class="badge red">Unassigned</span>'}</td><td>${expected ? '₹' + expected.toLocaleString('en-IN') : '—'}</td><td>${f.lastContactAt ? fmtDT(f.lastContactAt) : 'Never'}<div class="mini">${+f.contactCount || 0} logged</div></td><td><span class="badge gray">${esc(f.mode)}</span><div class="mini">${esc(f.notes || '—')}</div></td><td><div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn xs" onclick="qmsFollowupAction(${index},'Contacted')">Contacted</button><button class="btn xs" style="color:var(--green);border-color:#a7f3d0" onclick="qmsFollowupAction(${index},'Done')">Done</button><button class="btn xs" style="color:var(--blue);border-color:#bfdbfe" onclick="qmsFollowupAction(${index},'Converted')">Converted</button><button class="btn xs" style="color:var(--red);border-color:#fca5a5" onclick="qmsFollowupAction(${index},'Lost')">Lost</button></div></td></tr>`;
  }).join('')}</tbody></table></div>` : '<div class="empty-state"><p>No pending follow-ups</p></div>'}</div></div>${done.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><div><div class="card-title">Completed Follow-ups</div></div></div><div class="card-body" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Due</th><th>Customer</th><th>CRO</th><th>Mode</th><th>Status</th></tr></thead><tbody>${done.map(f => {
    const reason = f.status === 'Converted' ? f.conversionReason : f.status === 'Lost' ? f.lostReason : '';
    return `<tr><td>${esc(f.dueDate)}</td><td><b>${esc(f.customerName)}</b><div class="sub mono">${esc(f.queueNo)}</div></td><td>${f.croId ? esc(croName(f.croId)) : 'Unassigned'}</td><td>${esc(f.mode)}</td><td><span class="badge ${f.status === 'Converted' ? 'green' : f.status === 'Lost' ? 'red' : 'gray'}">${esc(f.status)}</span>${reason ? `<div class="mini">${esc(reason)}</div>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div></div></div>` : ''}`;
}

function markFollowupContacted(id) {
  if (!guardWrite()) return;
  const f = state.followups.find(item => item.id === id);
  if (!f || f.status !== 'Pending') return;
  f.lastContactAt = new Date().toISOString();
  f.lastContactBy = role;
  f.contactCount = (+f.contactCount || 0) + 1;
  if (!save('followup.contact', { queueNo: f.queueNo, contactCount: f.contactCount })) return;
  toast('Contact logged.', 'success');
}

function openLostFollowupModal(f) {
  window.__qmsFollowupModalId = f.id;
  openModal('Mark Lost — ' + esc(f.queueNo), `<div class="form-grid"><div class="field"><label class="label">Lost reason *</label><select class="select" id="fuLostReasonCode">${qmsReasonOptionsHtml('lost')}</select></div><div class="field"><label class="label">Estimated lost value</label><input class="input" id="fuLostValue" type="number" min="0" value="${+f.expectedValue || 0}"></div><div class="field full"><label class="label">Reason detail (required for Other)</label><input class="input" id="fuLostReasonDetail" maxlength="240"></div></div>`, `<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmLostFollowupModal()">Mark Lost</button>`, true);
}

function confirmLostFollowup(id) {
  if (!guardWrite()) return;
  const f = state.followups.find(item => item.id === id);
  if (!f || f.status !== 'Pending') return;
  const reason = qmsValidateOutcome('Non Purchase', {
    lostReasonCode: $('fuLostReasonCode').value,
    reasonDetail: $('fuLostReasonDetail').value
  });
  if (!reason.ok) {
    toast(reason.message, 'error');
    return;
  }
  const lostValue = Number($('fuLostValue').value || 0);
  if (!Number.isFinite(lostValue) || lostValue < 0) {
    toast('Estimated lost value must be zero or more.', 'error');
    return;
  }
  f.status = 'Lost';
  f.lostReasonCode = reason.reasonCode;
  f.lostReason = reason.reasonLabel;
  f.lostReasonDetail = reason.reasonDetail;
  f.lostValue = lostValue;
  f.closedAt = new Date().toISOString();
  f.closedBy = role;
  if (!save('followup.lost', { queueNo: f.queueNo, reasonCode: reason.reasonCode })) return;
  window.__qmsFollowupModalId = null;
  closeModal();
  toast('Follow-up marked lost.', 'success');
}

function updateFollowup(id, status) {
  if (!guardWrite()) return;
  const f = state.followups.find(item => item.id === id);
  if (!f || f.status !== 'Pending') return;
  if (status === 'Converted') return openConvertModal(f);
  if (status === 'Lost') return openLostFollowupModal(f);
  if (status !== 'Done') {
    toast('Unsupported follow-up action.', 'error');
    return;
  }
  f.status = 'Done';
  f.closedAt = new Date().toISOString();
  f.closedBy = role;
  if (!save('followup.update', { queueNo: f.queueNo, status: 'Done' })) return;
  toast('Follow-up updated.', 'success');
}

function openConvertModal(f) {
  window.__qmsFollowupModalId = f.id;
  openModal('Mark Converted — ' + esc(f.queueNo), `<div class="form-grid"><div class="field"><label class="label">Recovered Amount (₹) *</label><input class="input" id="fuRecoveredValue" type="number" min="0" inputmode="numeric" placeholder="e.g. 12500"></div><div class="field"><label class="label">Bill No. (optional)</label><input class="input" id="fuRecoveredBill" placeholder="Bill / invoice no."></div><div class="field"><label class="label">Conversion reason *</label><select class="select" id="fuConversionReasonCode">${qmsReasonOptionsHtml('conversion')}</select></div><div class="field"><label class="label">Reason detail (required for Other)</label><input class="input" id="fuConversionReasonDetail" maxlength="240"></div></div>`, `<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmConvertFollowupModal()">Mark Converted</button>`, true);
}

function confirmConvertFollowup(id) {
  if (!guardWrite()) return;
  const f = state.followups.find(item => item.id === id);
  if (!f || f.status !== 'Pending') return;
  const raw = Number($('fuRecoveredValue').value);
  const amount = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  if (!amount) {
    toast('Recovered amount required.', 'error');
    return;
  }
  const reason = qmsValidateOutcome('Converted', {
    conversionReasonCode: $('fuConversionReasonCode').value,
    reasonDetail: $('fuConversionReasonDetail').value
  });
  if (!reason.ok) {
    toast(reason.message, 'error');
    return;
  }
  f.status = 'Converted';
  f.recoveredValue = amount;
  f.recoveredBill = $('fuRecoveredBill').value.trim();
  f.conversionReasonCode = reason.reasonCode;
  f.conversionReason = reason.reasonLabel;
  f.conversionReasonDetail = reason.reasonDetail;
  f.convertedAt = new Date().toISOString();
  f.closedAt = f.convertedAt;
  f.closedBy = role;
  if (!save('followup.convert', {
    queueNo: f.queueNo,
    recovered: amount,
    reasonCode: reason.reasonCode
  })) return;
  window.__qmsFollowupModalId = null;
  closeModal();
  toast('Follow-up converted · ₹' + amount.toLocaleString('en-IN'), 'success');
}

function patchD2Hardening(html) {
  if (html.includes(hardeningMarker)) return patchD2Cleanup(html);
  if (!html.includes(marker)) throw new Error('D2 base marker required before hardening');

  html = replaceFunction(html, 'todaysCustomers', [
    indiaBusinessDateFromIso,
    customerBusinessDate,
    todaysCustomers
  ].map(fn => fn.toString()).join('\n'));
  html = replaceRegexExact(
    html,
    /var d=\(c\.entryTime\|\|''\)\.slice\(0,10\);if\(!d\)return;/g,
    'var d=customerBusinessDate(c);if(!d)return;',
    2,
    'queue sequence business dates'
  );
  html = replaceOnce(
    html,
    "(c.entryTime||'').slice(0,10),c.queueNo",
    'customerBusinessDate(c),c.queueNo',
    'QMS CSV business date'
  );
  html = replaceRegexExact(
    html,
    /id="custName" placeholder="Full name" oninput="showCustomerHistory\(\)"/g,
    'id="custName" placeholder="Full name"',
    1,
    'remove unused name duplicate refresh'
  );
  html = replaceRegexExact(
    html,
    /id="custDob" type="date" onchange="showCustomerHistory\(\)"/g,
    'id="custDob" type="date"',
    1,
    'remove unused DOB duplicate refresh'
  );
  html = replaceOnce(
    html,
    '|updateFollowup|createRotation|',
    '|updateFollowup|markFollowupContacted|confirmLostFollowup|confirmConvertFollowup|createRotation|',
    'past-date follow-up mutators'
  );
  html = replaceFunction(html, 'showCustomerHistory', [
    qmsOpenExistingDuplicateByIndex,
    showCustomerHistory
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'addCustomer', addCustomer.toString());
  html = replaceFunction(html, 'openCustomer', openCustomer.toString());
  html = replaceFunction(html, 'confirmCloseLead', confirmCloseLead.toString());
  html = replaceFunction(html, 'renderFollowups', [
    qmsPendingFollowupId,
    qmsFollowupAction,
    qmsWaFuByIndex,
    qmsFollowupContactBtns,
    confirmLostFollowupModal,
    confirmConvertFollowupModal,
    renderFollowups
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'markFollowupContacted', markFollowupContacted.toString());
  html = replaceFunction(html, 'openLostFollowupModal', openLostFollowupModal.toString());
  html = replaceFunction(html, 'confirmLostFollowup', confirmLostFollowup.toString());
  html = replaceFunction(html, 'openConvertModal', openConvertModal.toString());
  html = replaceFunction(html, 'confirmConvertFollowup', confirmConvertFollowup.toString());
  if (!html.includes(hardeningMarker)) throw new Error('D2 hardening marker missing');
  return patchD2Cleanup(html);
}

function patchD2Cleanup(html) {
  if (!html.includes(hardeningMarker)) throw new Error('D2 hardening required before cleanup');
  if (html.includes('id="custName" placeholder="Full name" oninput="showCustomerHistory()"')) {
    html = replaceRegexExact(
      html,
      /id="custName" placeholder="Full name" oninput="showCustomerHistory\(\)"/g,
      'id="custName" placeholder="Full name"',
      1,
      'remove stale name duplicate refresh'
    );
  }
  if (html.includes('id="custDob" type="date" onchange="showCustomerHistory()"')) {
    html = replaceRegexExact(
      html,
      /id="custDob" type="date" onchange="showCustomerHistory\(\)"/g,
      'id="custDob" type="date"',
      1,
      'remove stale DOB duplicate refresh'
    );
  }
  if (!html.includes(cleanupMarker)) {
    html = replaceOnce(
      html,
      `/* ${hardeningMarker} */`,
      `/* ${hardeningMarker} */\n  /* ${cleanupMarker} */`,
      'D2 cleanup marker'
    );
  }
  if (!html.includes(cleanupMarker)) throw new Error('D2 cleanup marker missing');
  return patchD2Resilience(html);
}

function patchD2Resilience(html) {
  const helperToken = 'function qmsPendingFollowupId(';
  const firstHelper = html.indexOf(helperToken);
  const lastHelper = html.lastIndexOf(helperToken);
  if (firstHelper >= 0 && firstHelper !== lastHelper) {
    const renderAt = html.indexOf('function renderFollowups(', lastHelper);
    if (renderAt < 0 ||
        html.slice(firstHelper, lastHelper) !== html.slice(lastHelper, renderAt)) {
      throw new Error('D2 follow-up helper duplication is not safely repairable');
    }
    html = html.slice(0, firstHelper) + html.slice(lastHelper);
  }
  if (html.indexOf(helperToken) !== html.lastIndexOf(helperToken)) {
    throw new Error('D2 follow-up helpers are not unique');
  }
  if (html.includes(resilienceMarker)) return patchD2LegalRetry(html);
  if (!html.includes(cleanupMarker)) throw new Error('D2 cleanup required before resilience');
  html = replaceFunction(html, 'qmsRestorePersistedState', qmsRestorePersistedState.toString());
  html = replaceFunction(html, 'savePreclaim', savePreclaim.toString());
  html = replaceFunction(html, 'updateSetting', updateSetting.toString());
  html = replaceFunction(html, 'openSkipTurn', openSkipTurn.toString());
  html = replaceFunction(html, 'confirmSkip', confirmSkip.toString());
  html = replaceFunction(html, 'renderFollowups', renderFollowups.toString());
  if (!html.includes(resilienceMarker)) throw new Error('D2 resilience marker missing');
  return patchD2LegalRetry(html);
}

const d2IntakeHelperNames = [
  'qmsPendingIntakeKey',
  'qmsReadPendingIntake',
  'qmsAcquirePendingIntake',
  'qmsClearPendingIntake',
  'qmsLegalCapture',
  'qmsCaptureEntryDraft',
  'qmsRestoreEntryDraft'
];

function functionTokenCount(source, name) {
  return source.split(`function ${name}(`).length - 1;
}

function d2IntakeHelperSource() {
  return [
    qmsPendingIntakeKey,
    qmsReadPendingIntake,
    qmsAcquirePendingIntake,
    qmsClearPendingIntake,
    qmsLegalCapture,
    qmsCaptureEntryDraft,
    qmsRestoreEntryDraft
  ].map(fn => fn.toString()).join('\n');
}

function repairD2IntakeHelperGroup(html) {
  const boundaryToken = 'function addCustomer(';
  if (functionTokenCount(html, 'addCustomer') !== 1) {
    throw new Error('D2 intake helper repair requires one addCustomer function');
  }
  const boundaryAt = html.indexOf(boundaryToken);
  const helpers = d2IntakeHelperNames.map(name => ({
    name,
    count: functionTokenCount(html, name),
    position: html.indexOf(`function ${name}(`)
  }));
  const duplicate = helpers.find(helper => helper.count > 1);
  if (duplicate) throw new Error(`${duplicate.name}: function is not unique`);
  const existing = helpers.filter(helper => helper.count === 1);
  if (existing.some(helper => helper.position >= boundaryAt)) {
    throw new Error('D2 intake helper group is outside its expected boundary');
  }
  const groupAt = existing.length
    ? Math.min(...existing.map(helper => helper.position))
    : boundaryAt;
  const ownedRange = html.slice(groupAt, boundaryAt);
  const foreignFunction = [...ownedRange.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)]
    .map(match => match[1])
    .find(name => !d2IntakeHelperNames.includes(name));
  if (foreignFunction) {
    throw new Error(`D2 intake helper repair would cross ${foreignFunction}`);
  }
  const eol = detectEol(html);
  const repaired = html.slice(0, groupAt) + toEol(d2IntakeHelperSource() + '\n', eol) +
    html.slice(boundaryAt);
  const invalid = d2IntakeHelperNames.find(name => functionTokenCount(repaired, name) !== 1);
  if (invalid || repaired.includes('QMS_PENDING_INTAKE_KEY')) {
    throw new Error(`D2 intake helper repair failed${invalid ? ` for ${invalid}` : ''}`);
  }
  return repaired;
}

function patchD2LegalRetry(html) {
  const partialInstalledGroup = html.includes(entryRecoveryMarker) ||
    d2IntakeHelperNames
      .filter(name => name !== 'qmsLegalCapture')
      .some(name => functionTokenCount(html, name) > 0);
  if (!html.includes(legalRetryMarker) && partialInstalledGroup) {
    html = repairD2IntakeHelperGroup(html);
    html = replaceFunction(html, 'addCustomer', addCustomer.toString());
    if (!html.includes(legalRetryMarker) || !html.includes(entryRecoveryMarker)) {
      throw new Error('D2 intake helper marker recovery failed');
    }
    return patchD2EntryRecovery(html);
  }
  if (html.includes(legalRetryMarker)) {
    html = repairD2IntakeHelperGroup(html);
    return patchD2EntryRecovery(html);
  }
  if (!html.includes(resilienceMarker)) throw new Error('D2 resilience required before legal retry');
  html = replaceFunction(html, 'qmsLegalCapture', [
    qmsPendingIntakeKey,
    qmsReadPendingIntake,
    qmsAcquirePendingIntake,
    qmsClearPendingIntake,
    qmsLegalCapture
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'addCustomer', addCustomer.toString());
  if (!html.includes(legalRetryMarker)) throw new Error('D2 legal retry marker missing');
  return patchD2EntryRecovery(html);
}

function patchD2EntryRecovery(html) {
  if (html.includes(entryRecoveryMarker)) return repairD2IntakeHelperGroup(html);
  if (!html.includes(legalRetryMarker)) throw new Error('D2 legal retry required before entry recovery');
  html = replaceFunction(html, 'qmsLegalCapture', [
    qmsLegalCapture,
    qmsCaptureEntryDraft,
    qmsRestoreEntryDraft
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'addCustomer', addCustomer.toString());
  if (!html.includes(entryRecoveryMarker)) throw new Error('D2 entry recovery marker missing');
  return repairD2IntakeHelperGroup(html);
}
function patchQms(html) {
  if (html.includes(marker)) return patchD2Hardening(html);
  if (html.includes('function qmsPolicyApi()') &&
      html.includes('function markFollowupContacted(') &&
      html.includes("addCustomer('outcome')")) {
    html = replaceOnce(
      html,
      'function qmsPolicyApi() {',
      `function qmsPolicyApi() {\n  /* ${marker} */`,
      'recover D2 idempotency marker'
    );
    return patchD2Hardening(html);
  }

  html = replaceRegexExact(
    html,
    /closeModal\(\);save\(([^;\r\n]+)\);toast/g,
    'if(!save($1))return;closeModal();toast',
    8,
    'modal save guards'
  );
  html = replaceRegexExact(
    html,
    /closeModal\(\);save\(([^;\r\n]+)\);if/g,
    'if(!save($1))return;closeModal();if',
    1,
    'modal conditional save guard'
  );
  html = replaceRegexExact(
    html,
    /save\(([^;\r\n]+)\);toast/g,
    'if(!save($1))return;toast',
    9,
    'remaining success save guards'
  );

  html = replaceFunction(html, 'save', [
    qmsPolicyApi,
    qmsPersistenceApi,
    qmsRestorePersistedState,
    qmsPrepareFastOutcome,
    save
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'addAudit', addAudit.toString());



  html = replaceOnce(
    html,
    '<button class="btn primary" onclick="addCustomer()" style="margin-left:auto">Save & Allocate CRO →</button>',
    '<button class="btn" onclick="addCustomer(\'outcome\')" style="margin-left:auto" ${role===\'Greeter\'&&!state.settings.allowGreeterClose?\'disabled title="Greeter closure disabled"\':\'\'}>Save, start &amp; open outcome</button><button class="btn primary" onclick="addCustomer()">Save & Allocate CRO →</button>',
    'fast outcome action'
  );

  html = replaceFunction(html, 'showCustomerHistory', [
    qmsDuplicateSuggestions,
    qmsOpenExistingDuplicate,
    showCustomerHistory
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'addCustomer', addCustomer.toString());
  html = replaceFunction(html, 'confirmSkip', confirmSkip.toString());
  html = replaceFunction(html, 'renderOutcomeFields', [
    qmsReasonOptionsHtml,
    qmsValidateOutcome,
    renderOutcomeFields
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'confirmCloseLead', confirmCloseLead.toString());
  html = replaceFunction(html, 'renderFollowups', renderFollowups.toString());
  html = replaceFunction(html, 'updateFollowup', [
    markFollowupContacted,
    openLostFollowupModal,
    confirmLostFollowup,
    updateFollowup
  ].map(fn => fn.toString()).join('\n'));
  html = replaceFunction(html, 'openConvertModal', openConvertModal.toString());
  html = replaceFunction(html, 'confirmConvertFollowup', confirmConvertFollowup.toString());
  return patchD2Hardening(html);
}

const index = fs.readFileSync(indexPath, 'utf8');
const modulesMatch = index.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;[ \t]*(\r?\n)/);
if (!modulesMatch) throw new Error('MODULES bundle not found');
const modules = JSON.parse(modulesMatch[1]);
const qms = modules.find(module => module.id === 'qms');
if (!qms) throw new Error('QMS module not found');

const before = Buffer.from(qms.html_b64, 'base64').toString('utf8');
const after = patchQms(before);
const bytes = Buffer.from(after, 'utf8');
qms.html_b64 = bytes.toString('base64');
qms.bytes = bytes.length;
qms.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

const replacement = `const MODULES = ${JSON.stringify(modules)};${modulesMatch[2]}`;
const updated = index.slice(0, modulesMatch.index) + replacement +
  index.slice(modulesMatch.index + modulesMatch[0].length);
const verifyBundle = source => {
  const verifyMatch = source.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n)/);
  if (!verifyMatch) throw new Error('QMS bundle verification failed: MODULES missing');
  const verifyQms = JSON.parse(verifyMatch[1]).find(module => module.id === 'qms');
  if (!verifyQms) throw new Error('QMS bundle verification failed: QMS missing');
  const verifyBytes = Buffer.from(verifyQms.html_b64, 'base64');
  const verifyHash = crypto.createHash('sha256').update(verifyBytes).digest('hex');
  const verifyHtml = verifyBytes.toString('utf8');
  const invalidHelper = d2IntakeHelperNames.find(
    name => functionTokenCount(verifyHtml, name) !== 1
  );
  if (verifyBytes.length !== verifyQms.bytes || verifyHash !== verifyQms.sha256 ||
      !verifyHtml.includes(marker) ||
      !verifyHtml.includes(hardeningMarker) ||
      !verifyHtml.includes(cleanupMarker) ||
      !verifyHtml.includes(resilienceMarker) ||
      !verifyHtml.includes(legalRetryMarker) ||
      !verifyHtml.includes(entryRecoveryMarker) ||
      verifyHtml.includes('QMS_PENDING_INTAKE_KEY') ||
      invalidHelper) {
    throw new Error('QMS bundle verification failed');
  }
  return { qms: verifyQms, bytes: verifyBytes };
};

verifyBundle(updated);
const tempPath = `${indexPath}.d2-${process.pid}.tmp`;
try {
  fs.writeFileSync(tempPath, updated, 'utf8');
  verifyBundle(fs.readFileSync(tempPath, 'utf8'));
  fs.renameSync(tempPath, indexPath);
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}
const verified = verifyBundle(fs.readFileSync(indexPath, 'utf8'));
const verifyQms = verified.qms;
process.stdout.write(
  after === before
    ? `D2 QMS already applied (${verifyQms.bytes} bytes, ${verifyQms.sha256})\n`
    : `D2 QMS applied (${verifyQms.bytes} bytes, ${verifyQms.sha256})\n`
);
