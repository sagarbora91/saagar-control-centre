# Saagar Traders — R1 Legal-Minimum Control Pack

Version: R1-2026-07-v1  
Prepared: 29 July 2026  
Status: First draft for owner, counsel and CA review — not signed  
In-app wording versions: `R1-NOTICE-2026-07-v1`, `R1-PROMO-WA-2026-07-v1`  
Technical source of truth: `www/legal-control.js`

## 1. Current legal-status note

The Digital Personal Data Protection Act, 2023 and the final Digital Personal Data Protection Rules, 2025 use phased commencement.

- Selected institutional and definitions provisions commenced on 13 November 2025.
- Rule 4 is scheduled one year after publication: 13 November 2026.
- The principal operational provisions relevant to this pack—including notice, consent, safeguards, breach response, children’s data and rights—are scheduled eighteen months after publication: 13 May 2027.

This pack adopts the final Rules as an early operating baseline. It does not state that a provision is already in force when its appointed date has not arrived, and it does not replace advice on other applicable tax, employment, consumer, telecom or sectoral laws.

Official sources:

- [Digital Personal Data Protection Act, 2023 — MeitY](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf)
- [Digital Personal Data Protection Rules, 2025 — Gazette/MeitY](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [Enforcement timeline notification G.S.R. 843(E)](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
- [India Code — Act, Rules and notifications](https://www.indiacode.nic.in/handle/123456789/22037?col=123456789%2F1362&view_type=search)

## 2. LEG-01 — Purpose and personal-data field register

The controlled register is embedded in `www/legal-control.js`. Every registered group contains:

- data principal;
- permitted source scopes and fields;
- specific purpose;
- proposed processing basis;
- permitted roles;
- retention class; and
- owner-approval status.

Registered groups:

1. Customer identity.
2. Queue visit.
3. Watch-service order.
4. Customer promotion.
5. Employee master and operations.
6. Third-party and financial records.
7. Legal evidence.

Permanent release rule:

> A new personal-data field must not be written in production until it is added to the register with a purpose, basis, access rule and retention class and approved through the release gate.

QMS and Watch Service now validate their intake payloads against the field register before writing a new customer record. An unknown field fails closed.

Owner/counsel decision required:

- Confirm each proposed basis.
- Confirm role access.
- Approve the register in Settings → Privacy & rights.

## 3. LEG-02 — Collection notices

### Queue / retail intake

Saagar Traders, Latur uses the details entered at the queue to manage the customer’s visit, allocate staff, provide the requested retail, enquiry, complaint or service interaction, maintain the related store/transaction/service record, and send operational updates about that visit.

Personal data may include:

- name and mobile number, if provided;
- visit type, purpose, queue and staff-allocation details;
- optional birthday, anniversary and product interest; and
- visit outcome and transaction/service follow-up.

Promotional WhatsApp messages are optional and separate. Refusing or withdrawing promotional consent does not affect service or operational updates.

### Watch-service intake

Saagar Traders, Latur uses the service-order details to create and perform the requested watch service, document the item received and its condition, provide estimates/progress/pickup/invoice/warranty communications, collect payment, and maintain records needed for accounts, tax, warranty and dispute handling.

Personal data may include:

- customer contact and service-order identification details;
- watch identity, condition, photographs and custody evidence;
- diagnosis, estimate, approvals, payment and delivery evidence; and
- service communications, follow-ups and warranty/claim records.

Promotional WhatsApp messages are optional and separate. Refusing or withdrawing promotional consent does not affect service or operational updates.

### Rights and contact paragraph

The customer may use Settings → Privacy & rights, or contact the configured business privacy contact, to withdraw promotional consent or request access, correction, erasure or grievance handling. Records may still be retained where law, warranty, payment, security, an unresolved claim or legal hold requires.

Production gate:

- Configure the privacy-contact business phone or email.
- Counsel approves wording version `R1-NOTICE-2026-07-v1`.
- Make an offline/printed notice available where a customer cannot reasonably read the device.

## 4. LEG-03 and LEG-04 — Promotional consent, opt-out and suppression

Rules:

1. Promotional permission is never bundled with queue entry, service entry or operational messages.
2. The promotional checkbox is optional and unticked by default.
3. A consent event records time, channel, purpose, wording version, source and operator.
4. Declining or withdrawing creates a suppression entry.
5. Every controlled WhatsApp route checks suppression and active consent at send time.
6. Operational messages—such as estimate approval, service progress, pickup, salary or leave updates—remain available without promotional consent.
7. Offers, greetings, win-back messages and review requests require active consent.
8. Every promotional message carries: “Promotional message. Reply STOP to opt out.”
9. A fresh explicit consent event may remove suppression; assumed or historical permission may not.
10. Suppression and consent evidence are included in encrypted migration backups so a phone change cannot resurrect opted-out marketing.

## 5. LEG-05 — Rights and grievance procedure

Published channel: Settings → Privacy & rights and the configured privacy-contact phone/email.

Request types:

- access;
- correction;
- erasure;
- promotional-consent withdrawal; and
- grievance.

Procedure:

1. Log the request immediately and provide/retain its request ID.
2. Do not collect unnecessary identity documents.
3. Verify identity against a suitable existing customer, service or employee identifier.
4. For erasure, check open warranty, tax, employment, dispute, security and litigation holds.
5. Correct or erase eligible records; do not erase data subject to an active lawful hold.
6. Issue the response through the verified contact.
7. Store only a response evidence reference in the register, not a duplicate of the full response.
8. Close within the published reasonable period, which must not exceed 90 days. The internal target should be materially shorter.
9. Retain the request history and response evidence under the approved schedule.

## 6. LEG-06 — Personal-data breach and cyber-incident playbook

### Immediate card

1. Record the awareness time. Do not wait for certainty.
2. Contain the incident without destroying evidence.
3. Preserve relevant logs, device state, export entries and affected backup identifiers.
4. Notify the owner/privacy contact immediately.
5. Stop unauthorised access and risky exports; do not factory-reset or wipe the device.
6. Start the in-app incident clock.

### Assessment form

Record:

- incident ID and awareness time;
- nature, extent, timing and location;
- systems and data classes affected;
- estimated affected people;
- likely consequences;
- containment and mitigation;
- person/cause findings, where known;
- recurrence-prevention measures;
- affected-person notification decision/reference;
- Board initial-intimation reference;
- detailed-update reference; and
- closure approval.

Do not copy unnecessary personal data into the incident summary.

### Notification baseline

Under the final Rules baseline adopted by this pack:

- affected Data Principals are to be informed clearly and without delay, with the breach, likely consequences, mitigation, protective steps and contact information;
- the Board receives an initial description without delay; and
- the detailed Board update is due within 72 hours of awareness unless the Board allows a longer period in writing.

Human gate:

- Owner/counsel approves the playbook.
- Conduct one tabletop rehearsal.
- Record participants, scenario, timings, decisions, defects and actions.

## 7. LEG-07 — First-draft manual retention schedule

Legal hold always overrides deletion. These review periods must be approved before operational use.

| Record class | Review point | Proposed action |
|---|---|---|
| Queue visit | 24 months after last visit | Delete or minimise unless linked to open service, transaction, claim or hold. |
| Customer operational | 24 months after last interaction | Retain only while an active purpose, claim or law requires it. |
| Service order | 5 years after closure or later warranty/claim closure | Delete/minimise contact and evidence after statutory and claim needs end. |
| Financial/statutory | 8 completed financial years | Delete only after CA confirms tax, accounting, assessment and litigation needs are closed. |
| Employee record | 8 years after relevant FY or separation, whichever is later | Restrict immediately on separation; delete after payroll, labour, tax and claim needs end. |
| Consent/suppression evidence | 5 years after withdrawal or last promotional send | Keep a minimised suppression token while the number remains in any active customer source. |
| Rights, grievance, incident and disclosure evidence | 5 years after closure | Retain longer for legal hold, Board/court matter or unresolved claim. |
| Security/processing logs | Not less than one year | Delete or aggregate after investigation and legal-hold needs end. |
| Private backups | 7 daily, 5 weekly, 12 monthly | Encrypted rotation; restored data must continue to honour suppression/deletion controls. |

Interim manual deletion log fields:

- deletion ID;
- record class and period;
- count;
- decision/approval;
- legal-hold check;
- backup/suppression impact;
- operator and reviewer;
- date; and
- verification result.

## 8. LEG-08 — Employee privacy acknowledgement

First-draft acknowledgement:

> I understand that Saagar Traders uses necessary employee information for employment administration, attendance, leave, payroll, statutory contributions, store-readiness checks and authorised performance/audit activity. Salary, banking, statutory identifiers and individual performance records are restricted to authorised roles. I will access personal data only for my assigned work, will not copy it to a personal phone/account, will not send live backups to support, and will immediately report suspected loss, misuse or unauthorised access. I may use the Privacy & rights channel for access, correction, erasure or grievance requests, subject to legal retention and hold requirements.

Signature record:

- employee name/code;
- wording version;
- language;
- issued date;
- signature/acknowledgement;
- issuer; and
- withdrawal/supersession date.

## 9. LEG-09 — Third-party and export controls

Required before disclosure:

1. Specific recipient and purpose.
2. Minimum necessary fields/records.
3. Owner-authorised export through the controlled export gate.
4. Encrypted or otherwise approved secure transfer.
5. Disclosure-register entry.
6. Valid engagement/confidentiality/data-processing terms.
7. Recipient deletion/return requirement.
8. No live backup for developer support; sanitised support bundle only.

### First-draft confidentiality/data-processing clause

> The recipient shall process Saagar Traders personal data only for the documented engagement purpose and on documented instructions; restrict access to authorised personnel bound by confidentiality; use reasonable security safeguards; not use the data for its own marketing, analytics or product training; not appoint another processor or transfer data outside the approved arrangement without prior written approval; notify Saagar Traders immediately of suspected loss, unauthorised access or disclosure; assist with rights, audit, incident and legal-hold obligations; and securely return or delete the data and certify deletion when the purpose ends, subject only to retention required by law.

Separate signed clauses are required for the developer and CA. Counsel must tailor this draft to the engagement and current law.

## 10. LEG-10 — Child/minor data rule

1. Do not ask for or record a child’s data unless the retail/service interaction genuinely requires it.
2. A child is an individual under 18 for this workflow.
3. QMS and Watch Service require an age-status declaration before a new customer record is saved.
4. If under 18, the app requires:
   - parent/lawful-guardian name;
   - relationship;
   - an approved adult identity/age verification method; and
   - affirmative guardian consent.
5. Do not store a copy or full number of a guardian identity document in the legal evidence record.
6. Do not send promotional messages to a child. Where a guardian has separately opted in, use the guardian’s verified contact and counsel-approved process.
7. Never track, behaviourally monitor or target advertising at a child.
8. If the guardian process cannot be completed, do not collect the minor’s personal data; serve the accompanying adult or use a non-personal walk-in process where operationally possible.

## 11. Sign-off and acceptance record

The app deliberately leaves these gates pending until a human records actual completion.

| Gate | Name | Date | Reference/signature |
|---|---|---|---|
| Purpose/field register approved |  |  |  |
| Collection notices reviewed by counsel |  |  |  |
| Privacy contact configured |  |  |  |
| Retention schedule approved by owner/counsel/CA |  |  |  |
| Breach playbook approved |  |  |  |
| Breach tabletop completed and minuted |  |  |  |
| Employee acknowledgements issued/signed |  |  |  |
| Developer confidentiality/processor clause signed |  |  |  |
| CA confidentiality/processor clause signed |  |  |  |
| Physical-device legal workflow accepted |  |  |  |

