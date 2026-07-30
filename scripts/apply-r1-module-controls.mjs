/*
 * Deterministic R1 patch for the decoded QMS and Watch Service modules.
 *
 * The source modules are minified inside base64 blobs in www/index.html. This
 * script keeps the exact decoded edits reproducible before the existing
 * byte-verified embed utility re-encodes each module.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = path.resolve(repoDir, '..');
const decodedDir = path.join(workspaceDir, '_extracted_modules');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`${label}: source anchor not found`);
  if (first !== last) throw new Error(`${label}: source anchor is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchFile(name, transforms) {
  const file = path.join(decodedDir, `${name}.html`);
  let source = fs.readFileSync(file, 'utf8');
  if (name === 'qms' && source.includes('D2-QMS-2026-07-30')) {
    process.stdout.write('R1 controls already carried by D2 QMS; no duplicate patch applied\n');
    return;
  }
  if (name === 'service' && source.includes('D3-SERVICE-RUNTIME-2026-07-30')) {
    process.stdout.write('R1 controls already carried by D3 Service; no duplicate patch applied\n');
    return;
  }
  for (const transform of transforms) {
    source = replaceOnce(source, transform.before, transform.after, `${name}/${transform.label}`);
  }
  fs.writeFileSync(file, source, 'utf8');
  process.stdout.write(`R1 controls applied to ${name}.html\n`);
}

const qmsNoticeHtml = `<div class="info-note" id="qmsLegalNotice" style="margin-bottom:14px;line-height:1.5"><strong>Privacy notice</strong><div style="margin-top:4px">We use the details below to manage this visit, allocate staff, provide the requested retail/service interaction, and keep the related transaction or service record. Promotional WhatsApp is optional and separate.</div><button class="btn sm" type="button" onclick="qmsOpenPrivacyNotice()" style="margin-top:7px">Read full notice & rights</button><div class="form-grid" style="margin-top:10px"><div class="field"><label class="label">Customer age status *</label><select class="select" id="qmsLegalAge"><option value="">Select</option><option value="adult">Adult (18+)</option><option value="minor">Under 18 — guardian present</option></select></div><div class="field"><label class="label">Guardian name (if under 18)</label><input class="input" id="qmsGuardianName" placeholder="Parent / lawful guardian"></div><div class="field"><label class="label">Guardian relationship</label><input class="input" id="qmsGuardianRelation" placeholder="Parent / lawful guardian"></div><div class="field"><label class="label">Guardian verification</label><select class="select" id="qmsGuardianMethod"><option value="">Select if under 18</option><option value="document-seen">Adult identity/age document seen</option><option value="existing-verified-record">Existing verified business record</option><option value="digital-token">Authorised digital token</option><option value="other-lawful-method">Other lawful method</option></select></div></div><label style="display:flex;gap:7px;align-items:flex-start;margin-top:8px;font-size:12px"><input type="checkbox" id="qmsGuardianConsent"> Guardian confirms authority and consents to the necessary processing (required only for under 18).</label><label style="display:flex;gap:7px;align-items:flex-start;margin-top:8px;font-size:12px"><input type="checkbox" id="qmsPromoConsent"> Optional: customer actively agrees to promotional WhatsApp offers, greetings and review requests. Service and visit updates do not depend on this.</label></div>`;

const qmsLegalHelpers = `function qmsLegalApi(){try{return (window.parent&&window.parent!==window&&window.parent.SaagarLegal)||window.SaagarLegal||null}catch(e){return null}}
function qmsOpenPrivacyNotice(){const L=qmsLegalApi();if(!L){toast('Privacy notice is unavailable — do not collect customer data.','error');return}alert(L.noticeText('qms-intake'))}
function qmsLegalCapture(c,noMobile){const L=qmsLegalApi();if(!L)return{ok:false,message:'Privacy control unavailable'};return L.captureIntake({scope:'qms-intake',source:'qms-new-walk-in',actor:role,mobile:noMobile?'':c.mobile,dateOfBirth:c.dob,ageBand:($('qmsLegalAge')&&$('qmsLegalAge').value)||'',guardian:{name:($('qmsGuardianName')&&$('qmsGuardianName').value)||'',relationship:($('qmsGuardianRelation')&&$('qmsGuardianRelation').value)||'',verificationMethod:($('qmsGuardianMethod')&&$('qmsGuardianMethod').value)||'',consent:!!($('qmsGuardianConsent')&&$('qmsGuardianConsent').checked)},promotionalConsent:!noMobile&&!!($('qmsPromoConsent')&&$('qmsPromoConsent').checked),payload:c})}
`;

patchFile('qms', [
  {
    label: 'notice-at-intake',
    before: `<div class="form-grid"><div class="field"><label class="label">Mobile No.</label>`,
    after: `${qmsNoticeHtml}<div class="form-grid"><div class="field"><label class="label">Mobile No.</label>`
  },
  {
    label: 'legal-intake-helper',
    before: `function addCustomer(){`,
    after: `${qmsLegalHelpers}function addCustomer(){`
  },
  {
    label: 'capture-before-write',
    before: `notes:''};state.customers.push(c);`,
    after: `notes:''};const legalResult=qmsLegalCapture(c,noMobile);if(!legalResult.ok){toast(legalResult.message||('Privacy control blocked save: '+(legalResult.code||'check required')),'error');return}state.customers.push(c);`
  },
  {
    label: 'clear-legal-inputs',
    before: `function clearEntryForm(){['custMobile','custName','productInterest','purpose','custDob','custAnniv'].forEach(id=>{if($(id))$(id).value='';});$('peopleCount').value=1;if($('noMobileChk'))$('noMobileChk').checked=false;if($('custMobile')){$('custMobile').disabled=false;$('custMobile').placeholder='10 digit mobile';}/* verify-fix: Clear must also reset the no-number toggle or the next walk-in inherits a disabled mobile field */showCustomerHistory()}`,
    after: `function clearEntryForm(){['custMobile','custName','productInterest','purpose','custDob','custAnniv','qmsLegalAge','qmsGuardianName','qmsGuardianRelation','qmsGuardianMethod'].forEach(id=>{if($(id))$(id).value='';});['qmsGuardianConsent','qmsPromoConsent'].forEach(id=>{if($(id))$(id).checked=false;});$('peopleCount').value=1;if($('noMobileChk'))$('noMobileChk').checked=false;if($('custMobile')){$('custMobile').disabled=false;$('custMobile').placeholder='10 digit mobile';}/* verify-fix: Clear must also reset the no-number toggle or the next walk-in inherits a disabled mobile field */showCustomerHistory()}`
  }
]);

const serviceNoticeHtml = `            <div class="field-group col-span-2" id="svcLegalNotice" style="border:1px solid #cbd6e4;border-radius:10px;padding:12px;background:#f7fafc">
              <label class="field-label">Privacy notice & customer age status</label>
              <div style="font-size:12px;line-height:1.5;color:#52627a">We use these details to create and perform the watch-service order, document item custody and condition, communicate progress, collect payment, and maintain invoice, warranty or claim records. Promotional WhatsApp is optional and separate.</div>
              <button class="btn btn-ghost" type="button" onclick="svcOpenPrivacyNotice()" style="margin-top:8px">Read full privacy notice & rights</button>
              <div class="grid-2" style="margin-top:10px">
                <div class="field-group"><label class="field-label">Customer age status <span class="req">*</span></label><select class="field-input" id="svc-legal-age"><option value="">Select</option><option value="adult">Adult (18+)</option><option value="minor">Under 18 — guardian present</option></select></div>
                <div class="field-group"><label class="field-label">Guardian name (if under 18)</label><input class="field-input" id="svc-guardian-name" placeholder="Parent / lawful guardian"></div>
                <div class="field-group"><label class="field-label">Guardian relationship</label><input class="field-input" id="svc-guardian-relation" placeholder="Parent / lawful guardian"></div>
                <div class="field-group"><label class="field-label">Guardian verification</label><select class="field-input" id="svc-guardian-method"><option value="">Select if under 18</option><option value="document-seen">Adult identity/age document seen</option><option value="existing-verified-record">Existing verified business record</option><option value="digital-token">Authorised digital token</option><option value="other-lawful-method">Other lawful method</option></select></div>
              </div>
              <label style="display:flex;gap:7px;align-items:flex-start;margin-top:8px;font-size:12px"><input type="checkbox" id="svc-guardian-consent"> Guardian confirms authority and consents to necessary processing (under 18 only).</label>
              <label style="display:flex;gap:7px;align-items:flex-start;margin-top:8px;font-size:12px"><input type="checkbox" id="svc-promo-consent"> Optional: customer actively agrees to promotional WhatsApp offers, greetings and review requests. Service updates do not depend on this.</label>
            </div>
`;

const serviceLegalHelpers = `function svcLegalApi(){try{return (window.parent&&window.parent!==window&&window.parent.SaagarLegal)||window.SaagarLegal||null}catch(e){return null}}
function svcOpenPrivacyNotice(){const L=svcLegalApi();if(!L){toast('Privacy notice is unavailable — do not collect customer data.');return}alert(L.noticeText('service-intake'))}
function svcLegalCapture(data){const L=svcLegalApi();if(!L)return{ok:false,message:'Privacy control unavailable'};return L.captureIntake({scope:'service-intake',source:'watch-service-intake',actor:g('f-adv')||'Service adviser',mobile:data.custMobile,ageBand:g('svc-legal-age'),guardian:{name:g('svc-guardian-name'),relationship:g('svc-guardian-relation'),verificationMethod:g('svc-guardian-method'),consent:!!document.getElementById('svc-guardian-consent').checked},promotionalConsent:!!document.getElementById('svc-promo-consent').checked,payload:data})}
`;

patchFile('service', [
  {
    label: 'notice-at-intake',
    before: `            <div class="field-group">
              <label class="field-label">Alt. Contact</label>
              <input class="field-input" id="f-cal" placeholder="Alternate number">
            </div>
          </div>`,
    after: `            <div class="field-group">
              <label class="field-label">Alt. Contact</label>
              <input class="field-input" id="f-cal" placeholder="Alternate number">
            </div>
${serviceNoticeHtml}          </div>`
  },
  {
    label: 'legal-intake-helper',
    before: `function doSave() {`,
    after: `${serviceLegalHelpers}function doSave() {`
  },
  {
    label: 'capture-before-write',
    before: `  const isNew = !editId;
  const _prevStage`,
    after: `  const isNew = !editId;
  if (isNew) {
    const legalResult = svcLegalCapture(data);
    if (!legalResult.ok) { toast('⚠ ' + (legalResult.message || ('Privacy control blocked save: ' + (legalResult.code || 'check required')))); scrollToSec('sec-1'); return; }
  }
  const _prevStage`
  }
]);
