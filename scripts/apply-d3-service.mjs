/*
 * Deterministic D3 patch for the Service module embedded in www/index.html.
 * Only MODULES[id=service] is decoded and re-encoded; exact UTF-8 bytes and
 * SHA-256 metadata are regenerated before an atomic replacement.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');
const runtimeMarker = 'D3-SERVICE-RUNTIME-2026-07-30';
const htmlMarker = 'D3-SERVICE-HTML-2026-07-30';
const cssMarker = 'D3-SERVICE-CSS-2026-07-30';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (first !== source.lastIndexOf(before)) throw new Error(`${label}: anchor is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceFunction(source, name, replacement) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`${name}: function not found`);
  if (start !== source.lastIndexOf(token)) throw new Error(`${name}: function is not unique`);
  const end = source.indexOf('\nfunction ', start + token.length);
  if (end < 0) throw new Error(`${name}: next function boundary not found`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function functionTokenCount(source, name) {
  return source.split(`function ${name}(`).length - 1;
}

function svcD3PolicyApi() {
  /* D3-SERVICE-RUNTIME-2026-07-30 */
  try {
    return (window.parent && window.parent !== window &&
      window.parent.SaagarServiceWorkboardPolicy) ||
      window.SaagarServiceWorkboardPolicy || null;
  } catch (error) {
    return null;
  }
}

function svcD3PersistenceApi() {
  try {
    return (window.parent && window.parent !== window &&
      window.parent.SaagarServicePersistence) ||
      window.SaagarServicePersistence || null;
  } catch (error) {
    return null;
  }
}

function svcD3RestorePersistedDb() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(parsed)) DB = parsed;
  } catch (error) {}
  try { renderDash(); } catch (error) {}
}

function svcD3CommitCases(nextDb) {
  const persistence = svcD3PersistenceApi();
  if (!persistence || typeof persistence.commit !== 'function' ||
      !persistence.commit(localStorage, STORE_KEY, nextDb)) {
    svcD3RestorePersistedDb();
    toast('⚠ Service change could not be saved. The last saved workboard was restored.');
    return false;
  }
  DB = nextDb;
  return true;
}

function svcD3Reauth(reason) {
  try {
    const gate = (window.parent && window.parent !== window && window.parent.SaagarReauth) ||
      window.SaagarReauth;
    return typeof gate === 'function' ? !!gate(reason) : false;
  } catch (error) {
    return false;
  }
}

function svcD3BoardCaseId(index) {
  const ids = Array.isArray(window.__svcD3BoardCaseIds) ? window.__svcD3BoardCaseIds : [];
  return ids[Number(index)] || '';
}

function svcD3ListTransition(index, targetStage) {
  const ids = Array.isArray(window.__svcD3ListCaseIds) ? window.__svcD3ListCaseIds : [];
  const id = ids[Number(index)] || '';
  if (!id || !targetStage) {
    renderDash();
    return;
  }
  svcD3OpenTransitionById(id, targetStage);
}

function svcD3OpenCase(index) {
  const id = svcD3BoardCaseId(index);
  if (!id || !byId(id)) return;
  openEdit(id);
}

function svcD3CopyStatus(index) {
  const id = svcD3BoardCaseId(index);
  const c = id && byId(id);
  const policy = svcD3PolicyApi();
  if (!c || !policy) return;
  const status = policy.customerSafeStatus(c);
  const text = status && status.text ? status.text : '';
  if (!text) return;
  const fallback = () => {
    try { prompt('Copy this customer-safe status:', text); } catch (error) {}
  };
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      Promise.resolve(navigator.clipboard.writeText(text))
        .then(() => toast('Customer-safe status copied'))
        .catch(fallback);
      return;
    }
  } catch (error) {}
  fallback();
}

function svcD3TransitionOptions() {
  return [
    '<option value="">Change stage…</option>',
    '<option value="received">Received</option>',
    '<option value="estimate_waiting">Estimate Waiting</option>',
    '<option value="repair">Repair</option>',
    '<option value="ready">Ready for Pickup</option>',
    '<option value="on_hold">On Hold</option>'
  ].join('');
}

function svcD3RenderWorkboard() {
  const host = document.getElementById('svc-d3-workboard');
  if (!host) return;
  const policy = svcD3PolicyApi();
  if (!policy || typeof policy.buildWorkboard !== 'function') {
    host.innerHTML = '<div class="d3-unavailable">Service workboard control unavailable. Existing cases remain unchanged.</div>';
    return;
  }
  const board = policy.buildWorkboard(DB, { asOf: todayStr() });
  const ids = [];
  const indexById = Object.create(null);
  const indexFor = id => {
    const key = '$' + String(id || '');
    if (indexById[key] != null) return indexById[key];
    indexById[key] = ids.length;
    ids.push(String(id || ''));
    return ids.length - 1;
  };
  const labels = {
    received: 'Received',
    estimate_waiting: 'Estimate Waiting',
    repair: 'Repair',
    ready: 'Ready',
    pickup_overdue: 'Pickup Overdue',
    on_hold: 'On Hold'
  };
  const laneHtml = board.laneOrder.map(lane => {
    const cards = board.lanes[lane] || [];
    const visible = cards.slice(0, 8);
    const cardHtml = visible.map(card => {
      const index = indexFor(card.caseId);
      const due = card.promisedDate ? 'Promised ' + card.promisedDate : 'Promised date missing';
      const owner = card.ownerLabel ? 'Owner ' + card.ownerLabel : 'Owner unassigned';
      const item = card.itemLabel || 'Item details pending';
      return `<div class="d3-card">
        <div class="d3-card-top"><strong>${escapeHtml(card.caseId)}</strong>${card.exceptionCount ? `<span class="d3-ex-count">${card.exceptionCount}</span>` : ''}</div>
        <div class="d3-card-item">${escapeHtml(item)}</div>
        <div class="d3-card-meta">${escapeHtml(due)} · ${escapeHtml(owner)}</div>
        <div class="d3-card-safe" title="${escapeHtml(card.safeStatusText)}">${escapeHtml(card.safeStatusLabel)}</div>
        <div class="d3-card-actions">
          <button type="button" onclick="svcD3OpenCase(${index})">Open</button>
          <button type="button" onclick="svcD3CopyStatus(${index})">Copy status</button>
          ${card.stage === 'ready' ? `<button type="button" onclick="svcD3OpenTransition(${index},'ready')">Readiness</button>` : ''}
        </div>
        <select class="d3-stage-select" aria-label="Change service stage" onchange="svcD3BoardTransition(${index},this.value);this.value=''">${svcD3TransitionOptions()}</select>
      </div>`;
    }).join('');
    return `<section class="d3-lane d3-lane-${lane}">
      <div class="d3-lane-head"><span>${escapeHtml(labels[lane] || lane)}</span><b>${cards.length}</b></div>
      <div class="d3-lane-body">${cardHtml || '<div class="d3-empty">No cases</div>'}${cards.length > visible.length ? `<div class="d3-more">+${cards.length - visible.length} more — use the filters below</div>` : ''}</div>
    </section>`;
  }).join('');
  const exceptionHtml = board.exceptions.slice(0, 16).map(item => {
    const index = indexFor(item.caseId);
    const due = item.dueDate ? ' · due ' + item.dueDate : '';
    const owner = item.ownerLabel ? ' · ' + item.ownerLabel : ' · unassigned';
    return `<button class="d3-exception d3-exception-${escapeHtml(item.severity)}" type="button" onclick="svcD3OpenCase(${index})">
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.caseId + due + owner)}</small></span>
      <span class="d3-ex-code">${escapeHtml(item.code)}</span>
    </button>`;
  }).join('');
  window.__svcD3BoardCaseIds = ids;
  host.innerHTML = `<div class="d3-head">
      <div><div class="d3-title">Service Workboard</div><div class="d3-sub">Controlled stages, readiness and exceptions · ${escapeHtml(board.asOf || todayStr())}</div></div>
      <span class="d3-context">Combined / untagged Service data</span>
    </div>
    <div class="d3-board">${laneHtml}</div>
    <div class="d3-ex-wrap"><div class="d3-ex-head"><strong>Exceptions requiring review</strong><span>${board.exceptions.length}</span></div>
      <div class="d3-ex-list">${exceptionHtml || '<div class="d3-empty">No current exceptions</div>'}${board.exceptions.length > 16 ? `<div class="d3-more">+${board.exceptions.length - 16} more</div>` : ''}</div>
    </div>`;
}

function svcD3BoardTransition(index, targetStage) {
  const id = svcD3BoardCaseId(index);
  if (!id || !targetStage) return;
  svcD3OpenTransitionById(id, targetStage);
}

function svcD3OpenTransition(index, targetStage) {
  const id = svcD3BoardCaseId(index);
  if (!id) return;
  svcD3OpenTransitionById(id, targetStage);
}

function svcD3OpenTransitionById(id, targetStage) {
  if (readOnlyGuard()) return;
  const policy = svcD3PolicyApi();
  const c = byId(id);
  if (!policy || !c) {
    toast('⚠ Service transition control unavailable');
    renderDash();
    return;
  }
  const requirement = policy.transitionRequirement(c, targetStage);
  if (!requirement.ok) {
    if (requirement.code !== 'NO_CHANGE') toast('⚠ This stage change is not available');
    renderDash();
    return;
  }
  window.__svcD3TransitionContext = { caseId: id, targetStage: requirement.to };
  const modal = document.getElementById('svc-d3-transition-modal');
  const readiness = c.d3Readiness || {};
  document.getElementById('svc-d3-transition-title').textContent =
    requirement.code === 'READINESS_REFRESH' ? 'Refresh pickup readiness' : 'Change Service stage';
  document.getElementById('svc-d3-transition-path').textContent =
    policy.stageLabel(requirement.from) + ' → ' + policy.stageLabel(requirement.to);
  document.getElementById('svc-d3-actor').value =
    String(c.advisor || c.techName || readiness.checkedBy || '').slice(0, 80);
  document.getElementById('svc-d3-reason').value = '';
  document.getElementById('svc-d3-reason-wrap').style.display =
    requirement.overrideRequired || requirement.to === 'on_hold' ? '' : 'none';
  document.getElementById('svc-d3-override-note').style.display =
    requirement.overrideRequired ? '' : 'none';
  document.getElementById('svc-d3-readiness').style.display =
    requirement.readinessRequired ? '' : 'none';
  document.getElementById('svc-d3-condition').checked =
    readiness.conditionConfirmed === true;
  document.getElementById('svc-d3-payment').value = readiness.paymentStatus ||
    (c.estimateApproval && c.estimateApproval.at ? 'estimate_approved' :
      (parseRupee(c.advancePaid) > 0 ? 'advance_recorded' : 'pay_at_pickup'));
  document.getElementById('svc-d3-promised').value =
    readiness.promisedDate || c.expDel || '';
  document.getElementById('svc-d3-notification').value =
    readiness.notificationStatus || 'pending';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}

function svcD3CloseTransition() {
  window.__svcD3TransitionContext = null;
  const modal = document.getElementById('svc-d3-transition-modal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  renderDash();
}

function svcD3ConfirmTransition() {
  if (readOnlyGuard()) return;
  const context = window.__svcD3TransitionContext;
  const policy = svcD3PolicyApi();
  const c = context && byId(context.caseId);
  if (!context || !policy || !c) {
    toast('⚠ Service transition context expired');
    svcD3CloseTransition();
    return;
  }
  const requirement = policy.transitionRequirement(c, context.targetStage);
  if (!requirement.ok) {
    toast('⚠ This Service stage changed elsewhere. Review the workboard again.');
    svcD3CloseTransition();
    return;
  }
  const actor = document.getElementById('svc-d3-actor').value.trim();
  const reason = document.getElementById('svc-d3-reason').value.trim();
  if (!actor) {
    toast('⚠ Record the staff member making this change');
    return;
  }
  if ((requirement.overrideRequired || requirement.to === 'on_hold') && !reason) {
    toast('⚠ Record why this stage change is necessary');
    return;
  }
  let overrideApproved = false;
  if (requirement.overrideRequired) {
    overrideApproved = svcD3Reauth(
      'Override Service stage for ' + String(c.id || '') + ': ' +
      policy.stageLabel(requirement.from) + ' to ' + policy.stageLabel(requirement.to)
    );
    if (!overrideApproved) {
      toast('Owner approval denied. No Service stage was changed.');
      return;
    }
  }
  const at = new Date().toISOString();
  const plan = policy.planTransition(c, requirement.to, {
    actor,
    reason,
    at,
    overrideApproved,
    readiness: {
      conditionConfirmed: document.getElementById('svc-d3-condition').checked,
      paymentStatus: document.getElementById('svc-d3-payment').value,
      promisedDate: document.getElementById('svc-d3-promised').value,
      notificationStatus: document.getElementById('svc-d3-notification').value
    }
  });
  if (!plan.ok) {
    toast('⚠ ' + (plan.message || 'Complete the Service transition details.'));
    return;
  }
  let nextDb;
  try { nextDb = JSON.parse(JSON.stringify(DB)); }
  catch (error) {
    toast('⚠ Service cases could not be prepared for saving');
    return;
  }
  const index = nextDb.findIndex(item => item && item.id === context.caseId);
  if (index < 0) {
    toast('⚠ Service case no longer exists');
    svcD3CloseTransition();
    return;
  }
  const nextCase = nextDb[index];
  nextCase.stage = plan.to;
  if (plan.readiness) {
    nextCase.d3Readiness = plan.readiness;
    nextCase.expDel = plan.readiness.promisedDate;
  } else if (plan.from === 'ready' && plan.to !== 'ready') {
    nextCase.d3ReadinessSupersededAt = at;
  }
  if (!Array.isArray(nextCase.d3Transitions)) nextCase.d3Transitions = [];
  nextCase.d3Transitions.push(Object.assign({
    operationId: 'svc-stage:' + String(nextCase.id || '') + ':' + at
  }, plan.audit));
  nextCase.d3Transitions = nextCase.d3Transitions.slice(-200);
  if (!Array.isArray(nextCase.stageLog)) nextCase.stageLog = [];
  const lastStage = nextCase.stageLog.length ?
    nextCase.stageLog[nextCase.stageLog.length - 1] : null;
  if (!lastStage || lastStage.stage !== plan.to) {
    nextCase.stageLog.push({ stage: plan.to, at, by: actor });
  }
  if (!svcD3CommitCases(nextDb)) return;
  const notificationPending = plan.readiness &&
    plan.readiness.notificationStatus === 'pending';
  const caseId = context.caseId;
  window.__svcD3TransitionContext = null;
  const modal = document.getElementById('svc-d3-transition-modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  renderDash();
  toast('Stage → ' + policy.stageLabel(plan.to));
  if (plan.to === 'ready' && notificationPending) offerReadyNotify(caseId);
}

function quickStage(id, stage) {
  svcD3OpenTransitionById(id, stage);
}

function calcTotal() {
  let sub = 0;
  document.querySelectorAll('#est-tbody tr').forEach(tr => {
    const id = tr.id.replace('er', '');
    if (!id) return;
    const u = parseFloat(document.getElementById('eu' + id)?.value || 0) || 0;
    let q = parseFloat(document.getElementById('eq' + id)?.value || 0) || 0;
    if (!q && u) q = 1;
    sub += q * u;
  });
  const stEl = document.getElementById('f-st');
  if (!subTotalDirty) stEl.value = sub > 0 ? sub.toFixed(2) : '';
  const base = parseRupee(stEl.value);
  const gstPct = parseRupee(document.getElementById('f-gst').value);
  const gstAmt = base * (gstPct / 100);
  const ga = document.getElementById('f-gstamt'); if (ga) ga.textContent = gstAmt.toFixed(2);
  document.getElementById('f-tot').textContent = (base + gstAmt).toFixed(2);
}

function scheduleWarrantyFollowUp(c, del, baseDate, months) {
  try {
    const blob = ((c.diagnosis || '') + ' ' + (c.issOtherText || '') + ' ' +
      ((c.lineItems || []).map(li => (li && li.desc) || '').join(' '))).toLowerCase();
    const isBattery = /batter|cell/.test(blob);
    const isStrap = /strap|bracelet|\bband\b/.test(blob) || !!c.issBrac;
    const till = months > 0 ? addMonthsIso(baseDate, months)
               : (isBattery || isStrap) ? addMonthsIso(baseDate, 18) : '';
    if (!till) return;
    c.followUps = c.followUps || [];
    const label = months > 0 ? 'Warranty expiring — call to renew / service'
                : isBattery ? 'Next battery likely due — call customer'
                : 'Service reminder — call customer';
    const existing = c.followUps.find(f => f && f.auto === 'warranty');
    if (existing) {
      existing.dueDate = till;
      existing.remarks = label;
      existing.updatedAt = new Date().toISOString();
      return;
    }
    c.followUps.push({ type: 'Warranty', datetime: nowLocalDT(), remarks: label, outcome: '',
      dueDate: till, by: 'auto', auto: 'warranty', createdAt: new Date().toISOString() });
  } catch (e) {}
}

const d3HelperNames = [
  'svcD3PolicyApi',
  'svcD3PersistenceApi',
  'svcD3RestorePersistedDb',
  'svcD3CommitCases',
  'svcD3Reauth',
  'svcD3BoardCaseId',
  'svcD3ListTransition',
  'svcD3OpenCase',
  'svcD3CopyStatus',
  'svcD3TransitionOptions',
  'svcD3RenderWorkboard',
  'svcD3BoardTransition',
  'svcD3OpenTransition',
  'svcD3OpenTransitionById',
  'svcD3CloseTransition',
  'svcD3ConfirmTransition'
];

function d3HelperSource() {
  return [
    svcD3PolicyApi,
    svcD3PersistenceApi,
    svcD3RestorePersistedDb,
    svcD3CommitCases,
    svcD3Reauth,
    svcD3BoardCaseId,
    svcD3ListTransition,
    svcD3OpenCase,
    svcD3CopyStatus,
    svcD3TransitionOptions,
    svcD3RenderWorkboard,
    svcD3BoardTransition,
    svcD3OpenTransition,
    svcD3OpenTransitionById,
    svcD3CloseTransition,
    svcD3ConfirmTransition
  ].map(fn => fn.toString()).join('\n');
}

function repairD3HelperGroup(html) {
  if (functionTokenCount(html, 'saveDB') !== 1) {
    throw new Error('D3 helper repair requires one saveDB function');
  }
  const boundaryAt = html.indexOf('function saveDB(');
  const helpers = d3HelperNames.map(name => ({
    name,
    count: functionTokenCount(html, name),
    position: html.indexOf(`function ${name}(`)
  }));
  const duplicate = helpers.find(helper => helper.count > 1);
  if (duplicate) throw new Error(`${duplicate.name}: function is not unique`);
  const existing = helpers.filter(helper => helper.count === 1);
  if (existing.some(helper => helper.position >= boundaryAt)) {
    throw new Error('D3 helper group is outside its expected boundary');
  }
  const groupAt = existing.length ?
    Math.min(...existing.map(helper => helper.position)) : boundaryAt;
  const ownedRange = html.slice(groupAt, boundaryAt);
  const foreign = [...ownedRange.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)]
    .map(match => match[1])
    .find(name => !d3HelperNames.includes(name));
  if (foreign) throw new Error(`D3 helper repair would cross ${foreign}`);
  const repaired = html.slice(0, groupAt) + d3HelperSource() + '\n' +
    html.slice(boundaryAt);
  const invalid = d3HelperNames.find(name => functionTokenCount(repaired, name) !== 1);
  if (invalid) throw new Error(`D3 helper repair failed for ${invalid}`);
  return repaired;
}

const stageBlock = `const STAGES = {
  received:          { label: 'Received',          color: '#0d2340' },
  estimate_waiting:  { label: 'Estimate Waiting',  color: '#b8922a' },
  repair:            { label: 'Repair',            color: '#b45309' },
  ready:             { label: 'Ready for Pickup',  color: '#166534' },
  on_hold:           { label: 'On Hold',           color: '#dc2626' },
  delivered:         { label: 'Delivered',         color: '#166534' }
};
const STAGE_KEYS = Object.keys(STAGES).filter(key => key !== 'delivered');
function stageOf(c) {
  const policy = svcD3PolicyApi();
  if (policy && typeof policy.canonicalStage === 'function') return policy.canonicalStage(c);
  if (c && c.status === 'closed') return 'delivered';
  const raw = c && c.stage === 'awaiting_approval' ? 'estimate_waiting' :
    (c && c.stage === 'in_progress' ? 'repair' : c && c.stage);
  return STAGES[raw] ? raw : 'received';
}
function stageLabel(s) { return (STAGES[s] || STAGES.received).label; }
function stageColor(s) { return (STAGES[s] || STAGES.received).color; }
`;

const stageSelect = `<select class="field-input" id="f-stage" disabled aria-describedby="svc-d3-stage-help">
                <option value="received">Received</option>
                <option value="estimate_waiting">Estimate Waiting</option>
                <option value="repair">Repair</option>
                <option value="ready">Ready for Pickup</option>
                <option value="on_hold">On Hold</option>
              </select>
              <div class="field-hint" id="svc-d3-stage-help">Use the controlled Service Workboard to change stage.</div>`;

const d3DashboardHtml = `<!-- ${htmlMarker} -->
    <div class="d3-workboard-host" id="svc-d3-workboard" role="region" aria-label="Service workboard"></div>

    <div class="d3-modal-overlay" id="svc-d3-transition-modal" aria-hidden="true">
      <div class="d3-modal" role="dialog" aria-modal="true" aria-labelledby="svc-d3-transition-title">
        <div class="d3-modal-head">
          <div><h3 id="svc-d3-transition-title">Change Service stage</h3><p id="svc-d3-transition-path"></p></div>
          <button type="button" class="d3-modal-close" onclick="svcD3CloseTransition()" aria-label="Close">×</button>
        </div>
        <div class="d3-modal-body">
          <div class="field-group"><label class="field-label" for="svc-d3-actor">Staff / actor *</label><input class="field-input" id="svc-d3-actor" maxlength="80"></div>
          <div class="field-group" id="svc-d3-reason-wrap"><label class="field-label" for="svc-d3-reason">Reason *</label><textarea class="field-input" id="svc-d3-reason" maxlength="240" rows="2"></textarea></div>
          <div class="d3-override-note" id="svc-d3-override-note">This is outside the normal forward workflow and requires owner reauthentication.</div>
          <div class="d3-readiness" id="svc-d3-readiness">
            <div class="d3-readiness-title">Pickup readiness</div>
            <label class="d3-check"><input type="checkbox" id="svc-d3-condition"> Item condition and after-service state checked</label>
            <div class="field-group"><label class="field-label" for="svc-d3-payment">Payment expectation *</label><select class="field-input" id="svc-d3-payment"><option value="">Select</option><option value="estimate_approved">Estimate approved</option><option value="advance_recorded">Advance recorded</option><option value="pay_at_pickup">Pay at pickup</option><option value="no_charge_warranty">No-charge warranty</option></select></div>
            <div class="field-group"><label class="field-label" for="svc-d3-promised">Promised pickup date *</label><input type="date" class="field-input" id="svc-d3-promised"></div>
            <div class="field-group"><label class="field-label" for="svc-d3-notification">Customer notification status *</label><select class="field-input" id="svc-d3-notification"><option value="pending">Pending — notify now</option><option value="notified">Notified</option><option value="declined">Customer declined updates</option><option value="unreachable">Unreachable</option></select></div>
          </div>
        </div>
        <div class="d3-modal-actions"><button type="button" class="btn btn-ghost" onclick="svcD3CloseTransition()">Cancel</button><button type="button" class="btn btn-primary" onclick="svcD3ConfirmTransition()">Confirm change</button></div>
      </div>
    </div>

    <div class="svc-search-bar">`;

const d3Css = `
/* ${cssMarker} */
.d3-workboard-host{margin:0 0 18px;background:var(--white);border:1px solid var(--gray-200);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}
.d3-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.d3-title{font-family:'DM Serif Display',serif;color:var(--navy);font-size:22px}
.d3-sub{font-size:12px;color:var(--gray-600);margin-top:3px}
.d3-context{display:inline-flex;background:var(--gold-pale);color:var(--navy);border:1px solid var(--gold);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700}
.d3-board{display:grid;grid-template-columns:repeat(6,minmax(205px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px}
.d3-lane{background:var(--gray-100);border:1px solid var(--gray-200);border-radius:10px;min-width:205px}
.d3-lane-pickup_overdue{background:var(--red-pale);border-color:#fecaca}
.d3-lane-head{display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border-bottom:1px solid var(--gray-200);font-size:12px;font-weight:700;color:var(--navy)}
.d3-lane-head b{background:var(--navy);color:var(--white);min-width:22px;text-align:center;border-radius:999px;padding:2px 6px}
.d3-lane-body{display:grid;gap:8px;padding:8px;max-height:460px;overflow-y:auto}
.d3-card{background:var(--white);border:1px solid var(--gray-200);border-radius:8px;padding:9px;box-shadow:0 1px 5px rgba(13,35,64,.06)}
.d3-card-top{display:flex;justify-content:space-between;gap:8px;color:var(--navy);font-size:12px}
.d3-ex-count{background:var(--red);color:var(--white);border-radius:999px;min-width:20px;text-align:center;padding:1px 5px}
.d3-card-item{font-size:12px;color:var(--gray-800);margin-top:5px;overflow-wrap:anywhere}
.d3-card-meta{font-size:10px;color:var(--gray-600);margin-top:4px;line-height:1.4}
.d3-card-safe{font-size:10px;color:var(--green);font-weight:700;margin-top:5px}
.d3-card-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
.d3-card-actions button{border:1px solid var(--gray-300);background:var(--white);color:var(--navy);border-radius:6px;padding:4px 6px;font-size:10px;cursor:pointer}
.d3-stage-select{width:100%;margin-top:6px;border:1px solid var(--gray-300);border-radius:6px;padding:6px;font-size:11px;background:var(--white)}
.d3-ex-wrap{margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px}
.d3-ex-head{display:flex;justify-content:space-between;align-items:center;color:var(--navy);font-size:13px}
.d3-ex-head span{background:var(--red-pale);color:var(--red);border-radius:999px;padding:2px 7px;font-weight:700}
.d3-ex-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}
.d3-exception{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;border:1px solid var(--gray-200);border-left:4px solid var(--amber);border-radius:7px;background:var(--white);padding:8px;cursor:pointer}
.d3-exception-high{border-left-color:var(--red);background:var(--red-pale)}
.d3-exception span:first-child{min-width:0}.d3-exception strong{display:block;color:var(--navy);font-size:11px}.d3-exception small{display:block;color:var(--gray-600);font-size:10px;margin-top:2px;overflow-wrap:anywhere}
.d3-ex-code{font-size:9px;color:var(--gray-600);font-family:monospace}
.d3-empty,.d3-more,.d3-unavailable{font-size:11px;color:var(--gray-600);padding:9px;text-align:center}
.d3-unavailable{background:var(--red-pale);color:var(--red);border-radius:8px}
.d3-modal-overlay{display:none;position:fixed;inset:0;background:rgba(13,35,64,.55);z-index:5000;padding:18px;align-items:center;justify-content:center}
.d3-modal-overlay.show{display:flex}
.d3-modal{width:min(560px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--white);border-radius:12px;box-shadow:0 24px 60px rgba(13,35,64,.25)}
.d3-modal-head{display:flex;justify-content:space-between;gap:12px;background:var(--navy);color:var(--white);padding:14px 16px}.d3-modal-head h3{font-family:'DM Serif Display',serif;margin:0;font-size:20px}.d3-modal-head p{margin:3px 0 0;color:var(--gold-light);font-size:12px}
.d3-modal-close{border:0;background:transparent;color:var(--white);font-size:26px;cursor:pointer}
.d3-modal-body{display:grid;gap:12px;padding:16px}.d3-modal-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--gray-200);padding:12px 16px}
.d3-override-note{background:var(--amber-pale);color:var(--amber);border:1px solid #fde68a;border-radius:8px;padding:9px;font-size:11px}
.d3-readiness{display:grid;gap:10px;background:var(--gold-pale);border:1px solid #ead79b;border-radius:9px;padding:11px}.d3-readiness-title{font-weight:700;color:var(--navy)}.d3-check{display:flex;align-items:flex-start;gap:7px;font-size:12px;color:var(--gray-800)}
.stat-value{overflow-wrap:anywhere}
@media(max-width:720px){.d3-workboard-host{padding:12px}.d3-head{display:block}.d3-context{margin-top:8px}.d3-ex-list{grid-template-columns:1fr}.stage-chips{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}.stage-chip{flex:0 0 auto}}
`;

function patchService(html) {
  const stageStart = html.indexOf('const STAGES = {');
  const stageEnd = html.indexOf('// P1-10 helpers:', stageStart);
  if (stageStart < 0 || stageEnd < 0) throw new Error('Service stage block not found');
  html = html.slice(0, stageStart) + stageBlock + '\n' + html.slice(stageEnd);

  const stageSelectExpression = /<select class="field-input" id="f-stage"[^>]*>[\s\S]*?<\/select>(?:\s*<div class="field-hint" id="svc-d3-stage-help">[\s\S]*?<\/div>)?/g;
  const stageSelectMatches = [...html.matchAll(stageSelectExpression)];
  if (stageSelectMatches.length !== 1) {
    throw new Error(`Service stage select expected once, found ${stageSelectMatches.length}`);
  }
  html = html.replace(stageSelectExpression, stageSelect);

  if (!html.includes(htmlMarker)) {
    html = replaceOnce(html, '    <div class="svc-search-bar">', d3DashboardHtml, 'D3 dashboard HTML');
  }
  const firstStyleAt = html.indexOf('</style>');
  const installedCssAt = html.indexOf(cssMarker);
  if (installedCssAt >= 0 && firstStyleAt >= 0 && installedCssAt > firstStyleAt) {
    if (!html.includes(d3Css)) throw new Error('Misplaced D3 CSS block could not be identified');
    html = replaceOnce(html, d3Css, '', 'repair misplaced D3 CSS');
  }
  if (!html.includes(cssMarker)) {
    const styleAt = html.indexOf('</style>');
    if (styleAt < 0) throw new Error('Service style boundary not found');
    html = html.slice(0, styleAt) + d3Css + '\n' + html.slice(styleAt);
  }
  const invalidPrintStyle = "SERVICE_PRINT_CSS + '\n</style>' + wrapped;";
  if (html.includes(invalidPrintStyle)) {
    html = replaceOnce(
      html,
      invalidPrintStyle,
      "SERVICE_PRINT_CSS + '\\n</style>' + wrapped;",
      'repair Service print stylesheet separator'
    );
  }

  html = repairD3HelperGroup(html);
  html = replaceFunction(html, 'quickStage', quickStage.toString());
  html = replaceFunction(html, 'calcTotal', calcTotal.toString());
  html = replaceFunction(html, 'scheduleWarrantyFollowUp', scheduleWarrantyFollowUp.toString());

  if (!html.includes('svcD3RenderWorkboard();')) {
    html = replaceOnce(
      html,
      '  renderStageChips(open);',
      '  renderStageChips(open);\n  svcD3RenderWorkboard();',
      'D3 workboard render'
    );
  }
  if (!html.includes('window.__svcD3ListCaseIds = pageItems.map')) {
    html = replaceOnce(
      html,
      '  const pageItems = ordered.slice(start, start + PAGE_SIZE);',
      "  const pageItems = ordered.slice(start, start + PAGE_SIZE);\n  window.__svcD3ListCaseIds = pageItems.map(item => String(item && item.id || ''));",
      'D3 numeric list context'
    );
    html = replaceOnce(
      html,
      '  el.innerHTML = pageItems.map(c => {',
      '  el.innerHTML = pageItems.map((c, cardIndex) => {',
      'D3 numeric list mapping'
    );
    html = replaceOnce(
      html,
      'onchange="quickStage(\'${c.id}\', this.value)"',
      'onchange="svcD3ListTransition(${cardIndex},this.value)"',
      'D3 numeric stage dispatch'
    );
  }
  if (!html.includes('D3 readiness gate before delivery close')) {
    const closeAnchor = "  if (!editId) { toast('Save the order first'); return; }\n  const del = readDelivery();";
    const closeGuard = `  if (!editId) { toast('Save the order first'); return; }
  /* D3 readiness gate before delivery close */
  const d3Policy = svcD3PolicyApi();
  const d3Case = byId(editId);
  if (!d3Policy || !d3Case || !d3Policy.readinessValid(d3Case)) {
    toast('⚠ Complete pickup readiness from the Service Workboard before closing');
    return;
  }
  const del = readDelivery();`;
    html = replaceOnce(html, closeAnchor, closeGuard, 'D3 close readiness gate');
  }

  const required = [
    runtimeMarker,
    htmlMarker,
    cssMarker,
    'svcD3RenderWorkboard();',
    'window.__svcD3ListCaseIds = pageItems.map',
    'onchange="svcD3ListTransition(${cardIndex},this.value)"',
    'id="f-stage" disabled',
    'D3 readiness gate before delivery close',
    "SERVICE_PRINT_CSS + '\\n</style>' + wrapped;",
    "if (!subTotalDirty) stEl.value = sub > 0 ? sub.toFixed(2) : '';",
    'existing.dueDate = till;'
  ];
  const missing = required.find(item => !html.includes(item));
  if (missing) throw new Error(`D3 Service patch missing ${missing}`);
  return html;
}

function patchRuntimeTags(index) {
  const policyTag = '<script src="service-workboard-policy.js"></script>';
  const persistenceTag = '<script src="service-persistence.js"></script>';
  if (!index.includes(policyTag) && !index.includes(persistenceTag)) {
    return replaceOnce(
      index,
      '<script src="qms-policy.js"></script>',
      `${policyTag}\n${persistenceTag}\n<script src="qms-policy.js"></script>`,
      'D3 runtime tags'
    );
  }
  if (!index.includes(policyTag) || !index.includes(persistenceTag)) {
    throw new Error('D3 runtime tags are partially installed');
  }
  return index;
}

const index = fs.readFileSync(indexPath, 'utf8');
const modulesMatch = index.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(\r?\n)/);
if (!modulesMatch) throw new Error('MODULES bundle not found');
const modules = JSON.parse(modulesMatch[1]);
const service = modules.find(module => module.id === 'service');
if (!service) throw new Error('Service module not found');

const before = Buffer.from(service.html_b64, 'base64').toString('utf8');
const after = patchService(before);
const bytes = Buffer.from(after, 'utf8');
service.html_b64 = bytes.toString('base64');
service.bytes = bytes.length;
service.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

const replacement = `const MODULES = ${JSON.stringify(modules)};${modulesMatch[2]}`;
let updated = index.slice(0, modulesMatch.index) + replacement +
  index.slice(modulesMatch.index + modulesMatch[0].length);
updated = patchRuntimeTags(updated);

const verifyBundle = source => {
  const match = source.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n)/);
  if (!match) throw new Error('D3 verification failed: MODULES missing');
  const module = JSON.parse(match[1]).find(item => item.id === 'service');
  if (!module) throw new Error('D3 verification failed: Service missing');
  const verifyBytes = Buffer.from(module.html_b64, 'base64');
  const verifyHtml = verifyBytes.toString('utf8');
  const verifyHash = crypto.createHash('sha256').update(verifyBytes).digest('hex');
  const invalidHelper = d3HelperNames.find(name => functionTokenCount(verifyHtml, name) !== 1);
  const policyTag = '<script src="service-workboard-policy.js"></script>';
  const persistenceTag = '<script src="service-persistence.js"></script>';
  if (verifyBytes.length !== module.bytes || verifyHash !== module.sha256 ||
      !verifyHtml.includes(runtimeMarker) ||
      !verifyHtml.includes(htmlMarker) ||
      !verifyHtml.includes(cssMarker) ||
      invalidHelper ||
      source.split(policyTag).length - 1 !== 1 ||
      source.split(persistenceTag).length - 1 !== 1 ||
      source.indexOf(policyTag) > source.indexOf('const MODULES')) {
    throw new Error('D3 Service bundle verification failed');
  }
  return { module, bytes: verifyBytes };
};

verifyBundle(updated);
const tempPath = `${indexPath}.d3-${process.pid}.tmp`;
try {
  fs.writeFileSync(tempPath, updated, 'utf8');
  verifyBundle(fs.readFileSync(tempPath, 'utf8'));
  fs.renameSync(tempPath, indexPath);
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}
const verified = verifyBundle(fs.readFileSync(indexPath, 'utf8'));
process.stdout.write(
  after === before
    ? `D3 Service already applied (${verified.module.bytes} bytes, ${verified.module.sha256})\n`
    : `D3 Service applied (${verified.module.bytes} bytes, ${verified.module.sha256})\n`
);
