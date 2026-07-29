/*
 * Settings → Privacy & rights.
 * Personal identifiers are masked in lists; actions which change/close legal
 * evidence require fresh owner re-authentication through the shell.
 */
(function (root) {
  'use strict';

  function legal() {
    if (!root.SaagarLegal) throw new Error('Legal control is unavailable');
    return root.SaagarLegal;
  }
  function el(id) { return root.document && root.document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function actor() {
    try {
      if (typeof root.activeStaff === 'function') {
        var staff = root.activeStaff();
        if (staff && staff.name) return staff.name;
      }
      if (typeof root.ownerName === 'function' && root.ownerName()) return root.ownerName();
    } catch (e) {}
    return 'Staff';
  }
  function toast(message) {
    try { if (typeof root.toast === 'function') root.toast(message); } catch (e) {}
  }
  function audit(action, detail) {
    try { if (typeof root.auditLog === 'function') root.auditLog(action, detail || {}); } catch (e) {}
  }
  function reauth(reason) {
    try {
      if (typeof root.SaagarReauth === 'function') return root.SaagarReauth(reason) !== false;
    } catch (e) { return false; }
    return false;
  }
  function mask(value) {
    var text = String(value || '');
    if (/@/.test(text)) {
      var parts = text.split('@');
      return (parts[0].slice(0, 2) || '*') + '***@' + parts.slice(1).join('@');
    }
    var digits = text.replace(/\D/g, '');
    if (digits.length >= 4) return '••••••' + digits.slice(-4);
    return text ? text.slice(0, 2) + '•••' : '—';
  }
  function fmt(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return String(iso || '—'); }
  }
  function checked(value) { return value ? ' checked' : ''; }
  function statusBadge(done, yes, no) {
    return '<span class="status-pill ' + (done ? 'has' : '') + '">' + esc(done ? yes : no) + '</span>';
  }

  function render() {
    var host = el('privacyControlRoot');
    if (!host) return;
    var L = legal();
    var status = L.status();
    var gov = L.governance();
    var contact = gov.privacyContact || {};
    var rights = L.rightsRows();
    var openRights = rights.filter(function (row) { return row && row.status !== 'closed'; });
    var scheduleRows = L.retentionSchedule.map(function (row) {
      return '<tr><td><b>' + esc(row.id) + '</b></td><td>' + esc(row.review)
        + '</td><td>' + esc(row.action) + '</td><td>' + esc(row.status) + '</td></tr>';
    }).join('');
    var fieldRows = L.fieldRegister.map(function (row) {
      return '<details style="border-bottom:1px solid var(--gray-200);padding:8px 0"><summary style="cursor:pointer;font-weight:800">'
        + esc(row.id) + ' · ' + row.fields.length + ' registered fields</summary>'
        + '<div class="sub" style="margin-top:7px"><b>Purpose:</b> ' + esc(row.purpose)
        + '<br><b>Basis:</b> ' + esc(row.basis)
        + '<br><b>Access:</b> ' + esc(row.access.join(', '))
        + '<br><b>Retention:</b> ' + esc(row.retentionClass)
        + '<br><b>Fields:</b> ' + esc(row.fields.join(', ')) + '</div></details>';
    }).join('');
    var rightsRows = openRights.length ? openRights.slice(0, 50).map(function (row) {
      var due = new Date(row.dueAt), overdue = row.status !== 'closed' && +due < Date.now();
      return '<tr><td><b>' + esc(row.requestId) + '</b><br><span class="sub">' + esc(row.requestType)
        + '</span></td><td>' + esc(row.principalType) + '<br><span class="sub">' + esc(mask(row.contact))
        + '</span></td><td style="color:' + (overdue ? 'var(--red)' : 'inherit') + '">' + esc(fmt(row.dueAt))
        + '</td><td>' + statusBadge(row.identityVerified, 'ID checked', 'ID pending') + '<br>'
        + statusBadge(row.legalHold !== 'unchecked', 'Hold checked', 'Hold pending') + '</td><td>'
        + '<button class="btn tiny" onclick="legalVerifyRight(\'' + esc(row.id) + '\')">Verify ID</button> '
        + '<button class="btn tiny" onclick="legalSetHold(\'' + esc(row.id) + '\',false)">No hold</button> '
        + '<button class="btn tiny red" onclick="legalSetHold(\'' + esc(row.id) + '\',true)">Hold</button> '
        + '<button class="btn tiny green" onclick="legalCloseRight(\'' + esc(row.id) + '\')">Respond</button>'
        + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="sub">No open requests.</td></tr>';

    host.innerHTML =
      '<div class="card card-pad">'
      + '<h4><span class="em">⚖️</span> R1 legal-minimum status</h4>'
      + '<p>Built against the final Digital Personal Data Protection Rules, 2025. Most operating provisions are scheduled for 13 May 2027; these controls prepare the business early and do not replace owner/counsel approval.</p>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">'
      + statusBadge(status.fieldsApproved, 'Field register approved', 'Field register approval pending')
      + statusBadge(status.noticeCounselApproved, 'Notice reviewed', 'Notice review pending')
      + statusBadge(status.retentionApproved, 'Retention approved', 'Retention approval pending')
      + statusBadge(status.breachTabletopCompleted, 'Breach drill complete', 'Breach drill pending')
      + statusBadge(status.processorClausesComplete, 'Processor clauses complete', 'Processor clauses pending')
      + statusBadge(status.employeeAcknowledgementsComplete, 'Employee acknowledgements complete', 'Employee acknowledgements pending')
      + '</div><p class="sub" style="margin-top:9px">Evidence: ' + status.noticeEventCount + ' notices · '
      + status.consentEventCount + ' consent events · ' + status.suppressedCount + ' suppressed numbers · '
      + status.openRights + ' open rights requests · ' + status.openIncidents + ' open incidents.</p>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">'
      + '<button class="btn small" onclick="legalRecordGate(\'fieldRegisterApprovedAt\',\'Approve the personal-data field register\')">Record field-register approval</button>'
      + '<button class="btn small" onclick="legalRecordGate(\'noticeCounselApprovedAt\',\'Record counsel review of the collection notices\')">Record notice review</button>'
      + '<button class="btn small" onclick="legalRecordGate(\'retentionApprovedAt\',\'Approve the retention schedule\')">Record retention approval</button>'
      + '<button class="btn small" onclick="legalRecordGate(\'breachPlaybookApprovedAt\',\'Approve the breach playbook\')">Record playbook approval</button>'
      + '<button class="btn small" onclick="legalRecordGate(\'breachTabletopAt\',\'Record a completed breach tabletop rehearsal\')">Record breach drill</button>'
      + '<button class="btn small" onclick="legalRecordGate(\'processorClausesCompleteAt\',\'Confirm developer and CA clauses are signed\')">Record processor clauses</button>'
      + '<button class="btn small" onclick="legalRecordGate(\'employeeAcknowledgementsCompleteAt\',\'Confirm employee acknowledgements are complete\')">Record employee acknowledgements</button>'
      + '</div></div>'

      + '<div class="card card-pad"><h4><span class="em">☎️</span> Privacy contact</h4>'
      + '<p>This contact appears in collection notices and rights responses. Configure a business phone or email before production acceptance.</p>'
      + '<div class="field-grid"><div class="field"><label>Name / role</label><input id="legalContactName" value="' + esc(contact.name || '') + '" placeholder="Owner / Privacy contact"></div>'
      + '<div class="field"><label>Business phone</label><input id="legalContactPhone" value="' + esc(contact.phone || '') + '" placeholder="Business number"></div>'
      + '<div class="field"><label>Business email</label><input id="legalContactEmail" value="' + esc(contact.email || '') + '" placeholder="privacy@example.com"></div></div>'
      + '<button class="btn primary small" onclick="legalSaveContact()">Save privacy contact</button></div>'

      + '<div class="card card-pad"><h4><span class="em">📣</span> Collection notices</h4>'
      + '<details open><summary style="cursor:pointer;font-weight:800">Queue / retail intake · ' + esc(L.versions.notice) + '</summary>'
      + '<pre style="white-space:pre-wrap;font:500 12px/1.5 inherit;background:var(--gray-100);padding:10px;border-radius:8px;margin-top:8px">' + esc(L.noticeText('qms-intake')) + '</pre></details>'
      + '<details><summary style="cursor:pointer;font-weight:800">Watch-service intake · ' + esc(L.versions.notice) + '</summary>'
      + '<pre style="white-space:pre-wrap;font:500 12px/1.5 inherit;background:var(--gray-100);padding:10px;border-radius:8px;margin-top:8px">' + esc(L.noticeText('service-intake')) + '</pre></details></div>'

      + '<div class="card card-pad"><h4><span class="em">🚫</span> Promotional WhatsApp consent / opt-out</h4>'
      + '<p>Operational updates remain available. Offers, greetings, review requests and relationship messages require active consent and are blocked for suppressed numbers.</p>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap"><input id="legalConsentMobile" placeholder="10-digit customer mobile" style="flex:1;min-width:180px;padding:9px;border:1px solid var(--gray-300);border-radius:8px">'
      + '<button class="btn small" onclick="legalCheckConsent()">Check</button><button class="btn red small" onclick="legalWithdrawConsent()">Opt out</button><button class="btn green small" onclick="legalRecordConsent()">Record fresh opt-in</button></div>'
      + '<div id="legalConsentResult" class="note-banner" style="display:none;margin-top:9px"></div></div>'

      + '<div class="card card-pad"><h4><span class="em">🧾</span> Rights and grievance register</h4>'
      + '<p>Log access, correction, erasure, withdrawal and grievance requests. The app uses a maximum 90-day response period; internal handling should be faster.</p>'
      + '<div class="field-grid"><div class="field"><label>Person</label><select id="legalRightPrincipal"><option value="customer">Customer</option><option value="employee">Employee</option><option value="guardian">Guardian</option></select></div>'
      + '<div class="field"><label>Request</label><select id="legalRightType"><option value="access">Access</option><option value="correction">Correction</option><option value="erasure">Erasure</option><option value="consent-withdrawal">Consent withdrawal</option><option value="grievance">Grievance</option></select></div>'
      + '<div class="field"><label>Identifier</label><input id="legalRightIdentifier" placeholder="Customer/service/employee ID or mobile"></div>'
      + '<div class="field"><label>Response contact</label><input id="legalRightContact" placeholder="Mobile or email"></div>'
      + '<div class="field full"><label>Short summary</label><input id="legalRightSummary" maxlength="500" placeholder="Do not paste unnecessary personal data"></div></div>'
      + '<button class="btn primary small" onclick="legalCreateRight()">Log request</button>'
      + '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Request</th><th>Person</th><th>Due</th><th>Checks</th><th>Actions</th></tr></thead><tbody>'
      + rightsRows + '</tbody></table></div></div>'

      + '<div class="card card-pad"><h4><span class="em">📤</span> Third-party disclosure register</h4>'
      + '<p>Record every approved disclosure to a CA, developer or other recipient. Never send a live backup to support.</p>'
      + '<div class="field-grid"><div class="field"><label>Recipient category</label><select id="legalDisclosureRecipient"><option value="CA">CA</option><option value="Developer">Developer</option><option value="Counsel">Counsel</option><option value="Other approved recipient">Other approved recipient</option></select></div>'
      + '<div class="field"><label>Purpose</label><input id="legalDisclosurePurpose" placeholder="Specific approved purpose"></div>'
      + '<div class="field"><label>Secure method</label><input id="legalDisclosureMethod" placeholder="Encrypted file / controlled export"></div>'
      + '<div class="field"><label>Contract / approval ref</label><input id="legalDisclosureContract" placeholder="NDA / engagement / owner approval"></div>'
      + '<div class="field"><label>Scope</label><input id="legalDisclosureScope" placeholder="Data classes only — no names"></div>'
      + '<div class="field"><label>Record count</label><input id="legalDisclosureCount" type="number" min="0" value="0"></div></div>'
      + '<button class="btn primary small" onclick="legalRecordDisclosure()">Record disclosure</button></div>'

      + '<div class="card card-pad"><h4><span class="em">🚨</span> Personal-data breach clock</h4>'
      + '<p>On awareness: contain and preserve evidence, notify the owner/privacy contact, assess affected people, and begin the notification decision record. The final Rules require Board intimation without delay and a detailed update within 72 hours once applicable.</p>'
      + '<div class="field-grid"><div class="field"><label>Severity</label><select id="legalIncidentSeverity"><option>under-assessment</option><option>high</option><option>critical</option><option>low</option></select></div>'
      + '<div class="field full"><label>Short factual summary</label><input id="legalIncidentSummary" maxlength="500" placeholder="Avoid unnecessary personal data"></div></div>'
      + '<button class="btn red small" onclick="legalOpenIncident()">Start incident clock</button></div>'

      + '<div class="card card-pad"><h4><span class="em">🗂️</span> Purpose and field register</h4>'
      + '<p>No new personal-data field may ship without a registered purpose, basis, access rule and retention class.</p>'
      + fieldRows + '</div>'

      + '<div class="card card-pad"><h4><span class="em">🗓️</span> Manual retention schedule</h4>'
      + '<p>These are first-draft review periods until owner, counsel and CA approval is recorded. Legal hold always overrides deletion.</p>'
      + '<div class="table-wrap"><table><thead><tr><th>Class</th><th>Review point</th><th>Action</th><th>Status</th></tr></thead><tbody>'
      + scheduleRows + '</tbody></table></div></div>';
  }

  function saveContact() {
    if (!reauth('Change privacy contact information')) return;
    var patch = {
      privacyContact: {
        name: (el('legalContactName') || {}).value || '',
        phone: (el('legalContactPhone') || {}).value || '',
        email: (el('legalContactEmail') || {}).value || ''
      }
    };
    legal().setGovernance(patch);
    audit('legal.privacy-contact.updated', { configured: !!(patch.privacyContact.phone || patch.privacyContact.email) });
    toast('Privacy contact saved');
    render();
  }
  function recordGate(key, label) {
    if (!reauth(label)) return;
    if (!root.confirm('Record this human gate as completed?\n\n' + label
      + '\n\nOnly continue if the review, approval, signature or rehearsal actually happened.')) return;
    var patch = {};
    patch[key] = new Date().toISOString();
    patch[key + 'By'] = actor();
    legal().setGovernance(patch);
    audit('legal.gate.completed', { gate: key });
    toast('Gate recorded');
    render();
  }
  function checkConsent() {
    var mobile = (el('legalConsentMobile') || {}).value || '';
    var out = el('legalConsentResult');
    if (!out) return;
    var L = legal(), normal = L.mobile10(mobile);
    if (!normal) { out.style.display = 'block'; out.textContent = 'Enter a valid 10-digit mobile.'; return; }
    var event = L.latestConsent(normal), suppressed = L.isSuppressed(normal);
    out.style.display = 'block';
    out.textContent = suppressed ? 'Promotional messages BLOCKED — number is on the suppression list.'
      : (event && event.granted ? ('Active promotional consent · ' + fmt(event.at) + ' · ' + event.wordingVersion)
        : 'No active promotional consent. Operational messages remain available.');
  }
  function withdrawConsent() {
    var mobile = (el('legalConsentMobile') || {}).value || '';
    try {
      legal().withdrawPromotion({ mobile: mobile, source: 'settings-privacy-rights', actor: actor() });
      audit('legal.promotion.withdrawn', { mobileEnding: legal().mobile10(mobile).slice(-4) });
      toast('Promotional messages blocked for this number');
      checkConsent();
    } catch (e) { toast(e.message || String(e)); }
  }
  function recordConsent() {
    var mobile = (el('legalConsentMobile') || {}).value || '';
    if (!root.confirm('Did this customer actively agree to optional promotional WhatsApp messages using wording '
      + legal().versions.consent + '?\n\nDo not use this for assumed or bundled permission.')) return;
    try {
      legal().recordConsent({ mobile: mobile, granted: true, source: 'settings-recorded-verbal-or-written', actor: actor() });
      audit('legal.promotion.consent-recorded', { mobileEnding: legal().mobile10(mobile).slice(-4) });
      toast('Fresh promotional consent recorded');
      checkConsent();
    } catch (e) { toast(e.message || String(e)); }
  }
  function createRight() {
    try {
      var row = legal().createRightsRequest({
        principalType: (el('legalRightPrincipal') || {}).value,
        requestType: (el('legalRightType') || {}).value,
        identifier: (el('legalRightIdentifier') || {}).value,
        contact: (el('legalRightContact') || {}).value,
        summary: (el('legalRightSummary') || {}).value,
        source: 'settings-privacy-rights',
        actor: actor()
      });
      audit('legal.right.opened', { requestId: row.requestId, type: row.requestType });
      toast('Request logged: ' + row.requestId);
      render();
    } catch (e) { toast(e.message || String(e)); }
  }
  function verifyRight(id) {
    if (!reauth('Verify identity for a privacy request')) return;
    var method = root.prompt('Identity verification method used (do not enter document numbers):', 'Existing customer/employee record checked');
    if (!method) return;
    try {
      var row = legal().verifyIdentity(id, { method: method, actor: actor() });
      audit('legal.right.identity-verified', { requestId: row.requestId });
      render();
    } catch (e) { toast(e.message || String(e)); }
  }
  function setHold(id, active) {
    if (!reauth('Record legal-hold decision for a privacy request')) return;
    var reason = root.prompt(active ? 'Legal-hold reason:' : 'Reason no legal hold applies:', active ? '' : 'No open warranty, tax, employment, dispute or legal matter found');
    if (reason == null) return;
    try {
      var row = legal().setLegalHold(id, { active: !!active, reason: reason, actor: actor() });
      audit('legal.right.hold-checked', { requestId: row.requestId, active: !!active });
      render();
    } catch (e) { toast(e.message || String(e)); }
  }
  function closeRight(id) {
    if (!reauth('Issue and close a privacy-rights response')) return;
    var outcome = root.prompt('Outcome code (responded / corrected / erased / refused-with-reason):', 'responded');
    if (!outcome) return;
    var ref = root.prompt('Response evidence reference (letter/message/file reference; do not paste the response):', '');
    if (!ref) return;
    try {
      var row = legal().closeRightsRequest(id, { outcome: outcome, responseRef: ref, actor: actor() });
      audit('legal.right.closed', { requestId: row.requestId, outcome: row.outcome });
      toast('Request closed: ' + row.requestId);
      render();
    } catch (e) { toast(e.message || String(e)); }
  }
  function recordDisclosure() {
    if (!reauth('Record an approved third-party disclosure')) return;
    try {
      var row = legal().recordDisclosure({
        recipientCategory: (el('legalDisclosureRecipient') || {}).value,
        purpose: (el('legalDisclosurePurpose') || {}).value,
        method: (el('legalDisclosureMethod') || {}).value,
        contractRef: (el('legalDisclosureContract') || {}).value,
        scope: (el('legalDisclosureScope') || {}).value,
        recordCount: (el('legalDisclosureCount') || {}).value,
        actor: actor()
      });
      audit('legal.disclosure.recorded', { recipient: row.recipientCategory, count: row.recordCount });
      toast('Disclosure recorded');
      render();
    } catch (e) { toast(e.message || String(e)); }
  }
  function openIncident() {
    if (!reauth('Start a personal-data breach response clock')) return;
    if (!root.confirm('Start the incident clock now?\n\nUse this only when a suspected or confirmed personal-data breach requires assessment.')) return;
    try {
      var row = legal().openIncident({
        severity: (el('legalIncidentSeverity') || {}).value,
        summary: (el('legalIncidentSummary') || {}).value,
        actor: actor()
      });
      audit('legal.incident.opened', { incidentId: row.incidentId, severity: row.severity });
      toast('Incident clock started: ' + row.incidentId);
      render();
    } catch (e) { toast(e.message || String(e)); }
  }

  root.SaagarLegalUI = Object.freeze({ render: render });
  root.renderPrivacy = render;
  root.legalSaveContact = saveContact;
  root.legalRecordGate = recordGate;
  root.legalCheckConsent = checkConsent;
  root.legalWithdrawConsent = withdrawConsent;
  root.legalRecordConsent = recordConsent;
  root.legalCreateRight = createRight;
  root.legalVerifyRight = verifyRight;
  root.legalSetHold = setHold;
  root.legalCloseRight = closeRight;
  root.legalRecordDisclosure = recordDisclosure;
  root.legalOpenIncident = openIncident;
})(typeof window !== 'undefined' ? window : globalThis);
