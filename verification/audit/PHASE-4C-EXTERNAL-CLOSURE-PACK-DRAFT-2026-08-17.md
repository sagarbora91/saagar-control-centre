# Phase 4C external closure pack — draft

**Prepared:** 2026-08-17 (Asia/Kolkata)
**State:** template only; blank fields are not approvals and no gate may be
reported closed until its required authority supplies the completed evidence.
**Engineering checkpoint inspected:**
`ca11daa78f755d4993c432d43d733edb2b3782e4`

## 1. Freeze the candidate identity first

Every device, production, UAT, legal, signing and release record below must
repeat these exact values. A changed APK byte, package/version, product commit,
or signing certificate invalidates the affected approval.

| Field | Exact value |
|---|---|
| Product commit | `3f8a37cebf998cf6dd006e3a33de95600d3808f3` |
| Product fingerprint SHA-256 | `47c1e9c04bd94829f8a1987bd49b8466032e12ca6a9248aef9a19dd826a12a06` |
| Seeded APK filename | `SaagarCC-Phase4C-Seeded-2Y-v2.9-3f8a37ce-F4DDBC1D.apk` |
| APK SHA-256 | `F4DDBC1D210AC0FB722333741085FF81B4D20C5B2523DB72ED6ACF2F1B510AED` |
| APK bytes | `7,010,282` |
| Package | `com.saagartraders.bcc` |
| versionName | `2.9` |
| versionCode | `209` |
| Signing class | `debug-UAT` |
| Signature schemes verified | `v1=true; v2=true; v3/v3.1/v4=false` |
| Signing certificate SHA-256 | `faae9739c054b88b4c9cee8f62bf1dfa103807b7a45a835d901467cb26fe05dc` |

Do not put a private signing key, passphrase, provider account identifier,
customer workbook, raw ETP row, or customer data in Git evidence.

## 2. Closure matrix

| Gate | Present state | What can be done locally | Irreducible closing evidence and authority |
|---|---|---|---|
| `GATE-UPDATE-PHYSICAL` | Open for final APK | Emulator update evidence is supporting evidence only | Samsung SM-T875 / Android 13 owner update-in-place result against the exact APK SHA-256; no uninstall or data clear; owner `sagarbora91` accepts preserved state and smoke result |
| `GATE-UPDATE-API23` | Local engineering evidence PASS; ready to close in final register | Exact final APK passed `adb install -r` on `saagar_api23_evidence` / API 23: installed bytes matched, state hashes survived, relaunch and recreation passed, fatal-log matches 0 | Evidence: `verification/audit/PHASE-4C-FINAL-SEEDED-APK-2026-08-17.json`. This does not close physical OEM acceptance |
| `GATE-ETP-PHYSICAL` | Open | API-23 emulator/parser/instrumentation can support but not close it | A physical API-23-class device and at least one relevant OEM document provider must select all four files, retain URI permission, import, relaunch and read verified status using the exact APK; named tester records result |
| `GATE-ETP-INTERRUPTION` | Open composite gate | Emulator may measure process-stop, rotation, incomplete-stage recovery, tamper/corruption and controlled low-space behavior | Each subcase must have exact APK/device identity and PASS. Physical/OEM rows required by the approved plan cannot be replaced by synthetic/unit evidence |
| `GATE-ETP-PRODUCTION` | Open | Real-file parsing/conformance already provides supporting aggregates only | Owner/Admin imports the untouched production R003/R013/R022/R025 set for WLMHW and HEMW, explicitly declares the period complete, reauthorizes publication, and accepts the active native generation and metadata-only receipt |
| `GATE-ETP-EXCEPTIONS` | Open for final APK | `npm run test:etp` proves the bounded, non-revenue UI contract | Owner reviews final-APK screens showing R013 attribution and R003 discount exceptions, confirms they are intelligible and do not alter revenue/sales totals, and accepts exact screenshots/evidence hashes |
| `GATE-PAYMENTTYPE25` | Open | Quarantine behavior is tested and safe | Business owner chooses an approved mapping or explicitly approves continued quarantine/exclusion. The decision must cover 2,802 WLMHW and 18 HEMW non-zero R022 rows in the recorded real-source conformance set |
| `GATE-NATIVE-LANGUAGE` | Closed for the Phase 4B product identity | No further local action | Existing identity-bound approval: `verification/audit/approvals/PHASE-4B-NATIVE-LANGUAGE-APPROVAL-2026-08-16.json`. Re-review only if the final product source/fingerprint changes |
| `GATE-UAT` | Open | Automated suites are prerequisites, not UAT/legal approval | Named representative staff complete role/store workflows; owner accepts results; a named privacy/legal reviewer approves notices, consent, minors/guardian, suppression, rights, retention, disclosures and incident handling |
| `GATE-RELEASE` | Open | Fail-closed release-build controls can be tested locally | Named key custodian produces the production-signed APK outside Git, records certificate/signature/provenance without private material, and an independent release authority accepts the exact signed APK after every preceding gate is closed |

The frozen audit-v1 `OPEN_GATES.json` is a static registry generated from
`scripts/audit/config.mjs`; it does not ingest external approvals. Gate closure
therefore requires identity-bound approval records like the existing native-
language record, plus an explicit final closure register. Do not edit historical
audit output to turn `open` into `closed`.

## 3. Emulator interruption/error evidence worksheet

Run these only against the exact frozen candidate and preserve commands and
logs. An emulator PASS remains engineering evidence.

| Case | Procedure | Required observation | Result/evidence |
|---|---|---|---|
| API23-UPDATE | Install a seeded baseline, record package data/state, install candidate with `adb install -r`, relaunch | Package data and seeded business readback retained; no fatal log match | `<PASS/FAIL + refs>` |
| ETP-ROTATE | Start a four-file import; rotate twice during selection/staging and once after completion | No duplicate publication, blank page or lost verified status | `<PASS/FAIL + refs>` |
| ETP-PROCESS | During staging, `adb shell am force-stop com.saagartraders.bcc`; relaunch | No partial generation becomes active; status is recoverable/`STAGING` or cleanly abandoned | `<PASS/FAIL + refs>` |
| ETP-CORRUPT | Use governed instrumentation to tamper with a non-first encrypted chunk | Read refuses with `INTEGRITY_FAILED`; active facts are not partially returned | `<PASS/FAIL + refs>` |
| ETP-DISKFULL | On a sacrificial AVD, reduce free space in a controlled manner and attempt staging/publication | Stable storage-full refusal; prior active generation remains unchanged; no plaintext/partial publication | `<PASS/FAIL + refs>` |
| ETP-LOWSPACE | Enter the app's low-storage warning/block thresholds and retry import | Warning/block follows policy; recovery after space is freed does not publish stale staging | `<PASS/FAIL + refs>` |
| ETP-RECREATE | Recreate the activity with an incomplete stage | Incomplete stage is not active; plugin reports bounded recoverable state | `<PASS/FAIL + refs>` |

On 2026-08-17, `npm run test:etp` passed **129/129** at engineering checkpoint
`ca11daa78f755d4993c432d43d733edb2b3782e4`. It covers the fail-closed
contracts, including incomplete staging, authenticated chunk tamper refusal,
restore fencing, PAYMENTTYPE25 quarantine and R003/R013 presentation. It is not
a substitute for the exact-candidate runtime rows above.

The exact final APK also passed the API-23 install-replace row: emulator
`saagar_api23_evidence` / Android 6.0 / API 23, `adb install -r` in 2,215 ms,
installed `base.apk` SHA-256 matching
`F4DDBC1D210AC0FB722333741085FF81B4D20C5B2523DB72ED6ACF2F1B510AED`,
preserved BCC key and QMS archive state hashes, 680 ms launch, 411 ms process
recreation, and zero fatal-log matches. The commit-ready evidence record is
`verification/audit/PHASE-4C-FINAL-SEEDED-APK-2026-08-17.json`.

## 4. Physical-device evidence block

### What one SM-T875 session can close

One uninterrupted owner session on Samsung SM-T875 / Android 13 can collect:

1. `GATE-UPDATE-PHYSICAL` by updating in place without uninstall/data clear and
   verifying preserved state plus the required module smoke;
2. A10-04 by running the governed five-save DAT-02 measurement at
   representative real or restored-real volume;
3. A10-05 by running the governed memory instrumentation and two collection
   cycles;
4. `GATE-ETP-EXCEPTIONS` by reviewing the final R003/R013 presentation; and
5. the owner/device portion of `GATE-ETP-PRODUCTION` if the untouched four-file
   production packs, complete-period declaration and Manager reauthorization
   are available during the same session.

That session cannot prove physical Android API 23 behavior because SM-T875 /
Android 13 is not API 23. It also cannot by itself close staff UAT, independent
privacy/legal review, production signing or independent release acceptance.

```text
Phase 4C exact-APK physical acceptance
Date/time (Asia/Kolkata):
Tester:
Owner approver: Sagar (sagarbora91)
APK filename:
APK SHA-256:
Product commit:
Package/versionName/versionCode:

Primary device: Samsung SM-T875
Android: 13
Install method: update-in-place (no uninstall/no data clear)
Pre-update state/control totals:
Post-update state/control totals:
Navigation/module smoke:
Expense Manager:
Retail ETP under Reports and absent from Settings:
Fatal/ANR/blank-screen result:

A10-04 DAT-02 saves (representative real/restored-real volume):
1 export __ ms / frame __ ms / total __ ms / ok __
2 export __ ms / frame __ ms / total __ ms / ok __
3 export __ ms / frame __ ms / total __ ms / ok __
4 export __ ms / frame __ ms / total __ ms / ok __
5 export __ ms / frame __ ms / total __ ms / ok __
p95 export __ ms (limit 150) / frame __ ms (limit 250) /
total __ ms (limit 3000): PASS|FAIL

A10-05 memory:
Instrumentation artifact SHA-256:
Environment identity SHA-256:
Pre-open bytes:
Close/reopen completed: yes|no
Collection cycles: 2
Post-close bytes:
Absolute retained delta:
Allowed delta (10% of pre-open):
Result: PASS|FAIL

Physical API-23/OEM device:
Android/API:
OEM WebView version:
Document provider and version (no account identifier):
Four-file selection + persisted permission:
Import/relaunch/readback:
Process death:
Disk full:
Corruption:
Rotation:
Low storage:
Overall physical/OEM result: PASS|FAIL
Screenshot/log references and SHA-256 values:
Owner decision: APPROVE|REJECT
Owner statement/signature:
```

After all fields above are completed, the owner can send this single exact
identity-bound statement for the rows actually completed in that session:

```text
I, Sagar (sagarbora91), tested the exact Phase 4C candidate APK SHA-256
<APK_SHA256>, product commit <PRODUCT_COMMIT>, package com.saagartraders.bcc,
versionName <VERSION_NAME>, versionCode <VERSION_CODE>, on Samsung SM-T875 /
Android 13 on <DATE_TIME_ASIA_KOLKATA>. I installed it update-in-place without
uninstalling or clearing data and confirm preserved state, successful relaunch,
module smoke, working Expense Manager, and Retail ETP under Reports and absent
from Settings, with no unresolved crash, ANR, or blank screen. The governed
A10-04 five-save run measured export p95 <EXPORT_MS> ms, frame-gap p95
<FRAME_MS> ms and total p95 <TOTAL_MS> ms at <REAL_OR_RESTORED_REAL> volume and
passed its 150/250/3000 ms limits. The governed A10-05 run measured pre-open
<PRE_BYTES> bytes and post-close <POST_BYTES> bytes after two collection cycles,
an absolute retained delta of <DELTA_BYTES> bytes within the allowed
<ALLOWED_BYTES> bytes. I also reviewed the final R013 attribution and R003
discount exception screens and confirm they are intelligible, remain visible,
and do not alter revenue or sales totals. Evidence-pack SHA-256:
<EVIDENCE_SHA256>. Result: PASS. I approve closure of GATE-UPDATE-PHYSICAL,
GATE-ETP-EXCEPTIONS, A10-04 and A10-05 for this exact identity. This statement
does not close physical API-23/OEM, production ETP publication, PAYMENTTYPE25,
staff UAT, legal, production signing or release acceptance.
```

If production ETP publication is also completed in this session, keep its
separate sentence in Section 5 because it binds source/report metadata and a
publication receipt that the physical-smoke statement does not contain.

## 5. Production ETP and business-decision block

The raw workbooks stay outside Git. Record only bounded metadata, hashes,
counts and decisions.

```text
Production ETP acceptance
Date/time (Asia/Kolkata):
Operator:
Owner/Admin approver:
Exact APK SHA-256:
Store: WLMHW|HEMW
Financial year and exact period:
Owner/Admin complete-period declaration: yes|no
R003 source SHA-256 / rows / columns:
R013 source SHA-256 / rows / columns:
R022 source SHA-256 / rows / columns:
R025 source SHA-256 / rows / columns:
REC-002 status/difference count:
R013 attribution exception count shown to user:
R003 discount exception count shown to user:
Owner confirms exceptions do not change revenue/sales totals: yes|no
Manager reauthorization before publication: PASS|FAIL
Active generation ID/hash (non-sensitive):
Metadata-only receipt reference/hash:
Prior generation retained and no partial generation active: PASS|FAIL
Production publication decision: APPROVE|REJECT
```

After both WLMHW and HEMW blocks are complete, the owner can send:

```text
I, Sagar (sagarbora91), acting as Owner/Admin, reviewed and authorized real
production Retail ETP publication on exact APK SHA-256 <APK_SHA256>, product
commit <PRODUCT_COMMIT>, for the exact WLMHW and HEMW periods and source hashes
recorded in evidence <EVIDENCE_PATH>, SHA-256 <EVIDENCE_SHA256>. I declared all
four R003/R013/R022/R025 reports complete for each recorded period,
reauthenticated before publication, verified REC-002 status PASS with zero
blocking differences, accepted the displayed R013/R003 non-revenue exception
counts, and verified the active native generation, metadata-only receipt,
previous-generation retention and absence of partial publication. Result:
PASS. I approve closure of GATE-ETP-PRODUCTION for this exact identity. This
does not approve a PAYMENTTYPE25 mapping unless the separate PAYMENTTYPE25
decision below is also completed.
```

PAYMENTTYPE25 requires one explicit owner choice:

```text
I, Sagar (sagarbora91), for exact APK SHA-256 <APK_SHA256> and product commit
<PRODUCT_COMMIT>, reviewed the unresolved non-zero PAYMENTTYPE25 population
recorded by retail-etp-core-v1: 2,802 WLMHW R022 rows and 18 HEMW R022 rows.
I choose exactly one: (A) approve the attached versioned business mapping
<MAPPING_ID_AND_SHA256>; or (B) approve continued quarantine and exclusion of
these rows from persisted and verified facts, with no guessed tender mapping.
Decision: <A|B>. This closes GATE-PAYMENTTYPE25 only for this identity.
```

### Separate physical API-23/OEM session

Use a real Android API-23-class device; an AVD or the SM-T875/Android-13 result
cannot fill this record.

```text
I, <TESTER_NAME/IDENTITY>, tested exact APK SHA-256 <APK_SHA256>, product commit
<PRODUCT_COMMIT>, on physical device <MODEL>, Android <VERSION>/API 23, OEM
WebView <VERSION>, using document provider <PROVIDER_AND_VERSION_WITHOUT_ACCOUNT>.
I selected the exact four Retail ETP reports, verified persisted URI access,
completed import/relaunch/readback, and executed process-death, disk-full,
authenticated-corruption, rotation and low-storage cases. Every row in evidence
<EVIDENCE_PATH>, SHA-256 <EVIDENCE_SHA256>, passed: no partial generation became
active, corruption refused with INTEGRITY_FAILED, prior accepted data remained
available where required, and no plaintext or raw customer data entered the
evidence. Result: PASS. I approve closure of GATE-ETP-PHYSICAL and
GATE-ETP-INTERRUPTION for this exact identity. This is device/OEM evidence, not
production publication, UAT, legal, signing or release approval.
```

## 6. Staff UAT and legal block

Minimum named UAT rows:

| Role/tester | Store context | Required workflow | Result/evidence |
|---|---|---|---|
| Cashier/maker | WLMHW or HEMW | Create/edit/read back representative daily records; denied privileged action remains denied | `<PASS/FAIL>` |
| Manager/checker | WLMHW or HEMW | Review/approve, report/export with reauthentication, exception review | `<PASS/FAIL>` |
| Owner/admin | Both stores where applicable | Backup/restore, access/PIN policy, ETP publication and audit review | `<PASS/FAIL>` |

Legal reviewer checklist: notice readability; lawful-purpose/consent capture;
promotion suppression and withdrawal; minors/guardian handling; data-subject
rights; retention/legal hold; disclosure/export authorization; grievance and
incident procedure; provider and recovery limitations. Every item needs a
named reviewer, date, decision and evidence reference.

```text
I, <NAME/IDENTITY>, acting as <staff/owner/legal role>, reviewed the Phase 4C
candidate identified by APK SHA-256 <APK_SHA256>, product commit
<PRODUCT_COMMIT>, and evidence pack SHA-256 <PACK_SHA256>. I confirm the listed
UAT/legal rows are complete with no unresolved P0/P1 issue. Decision:
APPROVE|REJECT. Exceptions/conditions: <NONE or exact list>.
```

Staff/owner UAT approval and privacy/legal approval should be separate records
unless the same person is formally named and authorized for both roles.

To minimize follow-up while preserving role separation, collect exactly these
two statements after attaching the completed matrix/checklist:

```text
We, <NAMED_UAT_TESTERS_AND_ROLES>, completed the Phase 4C UAT matrix for exact
APK SHA-256 <APK_SHA256>, product commit <PRODUCT_COMMIT>, across the recorded
roles and store contexts. Evidence <EVIDENCE_PATH>, SHA-256 <EVIDENCE_SHA256>,
contains the expected and actual result for every row. All rows passed with no
unresolved P0/P1 issue. We approve the staff-UAT portion of GATE-UAT for this
exact identity.
```

```text
I, <LEGAL_REVIEWER_NAME/IDENTITY>, acting as the authorized privacy/legal
reviewer, reviewed the Phase 4C legal checklist and exact candidate APK SHA-256
<APK_SHA256>, product commit <PRODUCT_COMMIT>, with evidence <EVIDENCE_PATH>,
SHA-256 <EVIDENCE_SHA256>. I approve the recorded notices, consent and
withdrawal, minors/guardian handling, suppression, data-subject rights,
retention/legal hold, disclosure/export authorization, grievance and incident
procedures, and documented provider/recovery limitations, with no unresolved
release-blocking condition. I approve the legal-review portion of GATE-UAT for
this exact identity. Decision: APPROVE.
```

## 7. Production signing and final release block

```text
Production signing receipt (no secrets)
Unsigned/frozen input APK SHA-256:
Signed output APK filename and SHA-256:
Product commit/fingerprint:
Package/versionName/versionCode:
Signing schemes verified:
Signing certificate subject/fingerprint SHA-256:
Build provenance/recipe SHA-256:
Signing date/time and environment identity:
Key custodian name/role:
Second-custodian or witnessed-control evidence:
Private key outside repository: yes|no
Release build debuggable=false: yes|no
Debug certificate absent: yes|no
Install/launch verification after signing: PASS|FAIL
```

The final release approver must confirm the exact production-signed APK hash,
all prerequisite evidence hashes, zero unresolved P0/P1 issues, and the PR #5
merge/release decision. Production signing alone is not release approval.

The key custodian can close only the signing half with:

```text
I, <KEY_CUSTODIAN_NAME/IDENTITY>, acting as production signing-key custodian,
produced exact production APK SHA-256 <SIGNED_APK_SHA256> from frozen input APK
SHA-256 <INPUT_APK_SHA256> and product commit <PRODUCT_COMMIT>. Receipt
<RECEIPT_PATH>, SHA-256 <RECEIPT_SHA256>, verifies package/version, build
provenance, signing schemes, certificate SHA-256 <CERT_SHA256>,
debuggable=false, absence of the debug certificate, post-sign install/launch,
private-key exclusion from Git, and the recorded two-custodian control. Result:
PASS. I approve the production-signing portion of GATE-RELEASE for this exact
signed artifact; I do not grant final release approval.
```

```text
I, <RELEASE_AUTHORITY>, approve release of exact APK SHA-256 <SIGNED_APK_SHA256>,
package/version <PACKAGE_VERSION>, product commit <PRODUCT_COMMIT>, signing
certificate SHA-256 <CERT_SHA256>, and Phase 4C closure-register SHA-256
<REGISTER_SHA256>. I confirm every Phase 4C prerequisite is closed and approve
PR #5 for merge and this exact artifact for release. Decision: APPROVE|REJECT.
```

## 8. Final closure register requirements

The final register should contain one row for each of the ten gate IDs, with:

- `state: closed`;
- the frozen product commit, product fingerprint and exact final APK SHA-256;
- evidence record path and SHA-256;
- reviewer identity, role, decision and received timestamp;
- explicit scope and non-claims; and
- for composite gates, every required subcase marked PASS.

Before declaring Phase 4 complete, verify that the native-language approval is
still identity-compatible, A10-04/A10-05 pass through the governed committed
device-attestation path, all ten final-register rows are closed, and the final
production-signed artifact—not an earlier debug APK—is the release-approved
identity.
