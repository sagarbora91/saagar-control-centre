# Phase 4C.2 external closure pack

**Prepared:** 2026-08-19 (Asia/Kolkata)
**State:** operational template. Blank fields are not approvals. No gate may be reported closed until its named authority supplies the completed evidence.
**Companion register:** `verification/audit/PHASE-4C2-FINAL-CLOSURE-REGISTER-2026-08-19.json`

## 0. What this supersedes, and why

This pack replaces `verification/audit/PHASE-4C-EXTERNAL-CLOSURE-PACK-DRAFT-2026-08-17.md`,
SHA-256 `fd44a6d49e93f7e93ec0006d1a439dac89db38005f9f508466a8a233584424bf`.

That draft is bound throughout to the **superseded** identity — product commit
`3f8a37ce`, product fingerprint `47c1e9c0`, APK `F4DDBC1D`, audit tooling `29a09475`. It was
prepared at 04:18 that morning, before the Phase 4C.1 refreeze later the same evening. It contains
zero references to the current identity and therefore cannot close any gate. It is retained
unmodified as history.

Three substantive changes beyond re-identification:

1. **A10-04 and A10-05 are no longer capture targets.** They are carried open as owner-accepted
   exceptions (Section 4). The old Section 4 worksheet and owner statement instructed capturing
   them; those instructions are removed, not merely re-identified.
2. **Samsung SM-T875 is no longer assumed.** The owner has no Android device and acceptance-device
   re-designation has not been recorded. Device routing is now written against device *class*
   (Section 5), which is what the audit code actually requires.
3. **Two structural blockers are documented** (Section 4) so that nobody spends a device session
   attempting a measurement that the frozen tooling cannot accept.
4. **The four Retail ETP gates are carried as owner-accepted exceptions** (Section 4A), by owner
   direction of 2026-08-19, pending that module's separate modular migration. The feature
   nonetheless ships reachable — read Section 4A before approving release.

## 1. Frozen identity

Every device, production, UAT, legal, signing and release record below must repeat these exact
values. A changed APK byte, package/version, product commit or signing certificate invalidates the
affected approval.

| Field | Exact value |
|---|---|
| Product commit | `ad2d643dfa371c05779aafc52e0c2ecf618c1a42` |
| Product fingerprint SHA-256 | `08734dfbb1d82f69849a4d8857cf1c311c0c0054f5a1b46bca41d42d2c15969e` |
| Audited comparison target | `cc9a117c5245f352922da5c9f699daa16226bbf3` |
| Audit tooling | `667ab0d2bc83f8f6347976548f30f5a1ccf6b12a` |
| Approved comparison evidence | `verification/audit/2026-08-17-220000-cc9a117c5245` |
| Approved manifest SHA-256 | `f2741ee762fe39caa0ba8d99b6842611ca6cd98d573ebf70fa874399337bfd5a` |
| Seeded APK filename | `SaagarCC-Phase4C1-Seeded-2Y-v2.9-ad2d643-F7F18EA3.apk` |
| APK SHA-256 | `f7f18ea3e3a0bd1b42b7b390e567993ad46160e0aa844a126509c28a33754287` |
| APK bytes | `7,010,364` |
| Package | `com.saagartraders.bcc` |
| versionName / versionCode | `2.9` / `209` |
| Signing class | `debug-UAT` |
| Signature schemes verified | `v1=true; v2=true; v3=false` |
| Signing certificate SHA-256 | `faae9739c054b88b4c9cee8f62bf1dfa103807b7a45a835d901467cb26fe05dc` |
| Reproducible-build APK SHA-256 | `d79eb9253239352954c82322c0c46bdf17b00837b57a7a89d915272f69cbb32b` |

**Superseded identities that cannot close a gate:** `F4DDBC1D`, `B65AA975`, `47c1e9c0`, `3f8a37ce`,
`29a09475`.

The last row matters and is new. Two distinct artifacts exist and they are not interchangeable:

- **`f7f18ea3`** — the seeded debug-UAT APK, built by `scripts/build-seeded-apk.mjs`. This is the
  artifact for every human-judgment gate: install, smoke, UI review, UAT.
- **`d79eb925`** — the reproducible build output of `npm run build:apk`, recorded twice in
  `A9-BUILD-COMPARISON.json` with `normalizedEqual` true. This is the **only** artifact the A10
  device validator will accept.

Do not put a private signing key, passphrase, provider account identifier, customer workbook, raw
ETP row or customer data into Git evidence.

## 2. Closure matrix

| Gate | State | What is already banked | Irreducible closing evidence and authority |
|---|---|---|---|
| `GATE-UPDATE-API23` | **CLOSED** 2026-08-17 | Exact final APK passed `adb install -r` on API 23: installed hash equals `f7f18ea3`, UID 10056 and first-install time preserved, activity resumed and focused, zero fatal-log matches | Closed by `verification/audit/PHASE-4C1-FINAL-SEEDED-APK-2026-08-17.json`, SHA-256 `0c5cc386…`. Engineering evidence only; not physical acceptance |
| `GATE-NATIVE-LANGUAGE` | **CLOSED** 2026-08-17 | 72 rendered cells including 48 Marathi/Hindi, 2,394 targets, 6,105 contrast samples, zero violations; A6-04 and A6-05 pass | Closed by `verification/audit/approvals/PHASE-4C1-NATIVE-LANGUAGE-APPROVAL-2026-08-17.json`, SHA-256 `9e290f13…`, bound to fingerprint `08734dfb`. Do not re-review |
| `GATE-UPDATE-PHYSICAL` | Open | Emulator install-replace is supporting evidence only | Update-in-place on a genuine physical Android of API level at least 23, no uninstall or data clear, preserved state, module smoke, owner acceptance against `f7f18ea3` |
| `GATE-ETP-PHYSICAL` | **CARRIED EXCEPTION** | API-23 emulator, parser and instrumentation support but cannot close it | A physical API-23-class device with a real OEM document provider selects all four files, retains URI permission, imports, relaunches and reads verified status. Named tester records the result |
| `GATE-ETP-INTERRUPTION` | **CARRIED EXCEPTION** | Emulator banked rotation, force-stop, background process death, incomplete-stage recreation and authenticated chunk-corruption refusal; `npm run test:etp` passed 129/129 | Physical and OEM residue only: document-provider interruption and a safe low-storage case. Do not repeat the banked emulator subset |
| `GATE-ETP-PRODUCTION` | **CARRIED EXCEPTION** | `verification/ETP-CORE-REAL-CONFORMANCE-2026-08-09.json` provides bounded aggregates only | Owner/Admin imports the untouched production R003/R013/R022/R025 set for both stores, declares each period complete, reauthorizes, and accepts the active generation and metadata-only receipt. **Not hardware bound** |
| `GATE-ETP-EXCEPTIONS` | **CARRIED EXCEPTION** | `npm run test:etp` proves the bounded non-revenue UI contract | Owner reviews the R013 attribution and R003 discount exception screens, names the surface reviewed, and confirms neither alters revenue or sales totals |
| `GATE-PAYMENTTYPE25` | Open | Quarantine behaviour is tested and safe | Owner chooses an approved mapping or explicitly approves continued quarantine, covering 2,802 WLMHW and 18 HEMW non-zero R022 rows. No guessed tender mapping |
| `GATE-UAT` | Open | Automated suites are prerequisites, not UAT or legal approval | Named staff complete role and store workflows; owner accepts; a **named** privacy/legal reviewer approves the checklist. No reviewer has been named yet |
| `GATE-RELEASE` | Open | Fail-closed release-build controls are testable locally | Named key custodian produces the production-signed artifact outside Git and records provenance without private material; an **independent** release approver accepts the exact signed artifact |

The frozen audit-v1 `OPEN-GATES.json` is a static registry generated from `scripts/audit/config.mjs`;
it does not ingest external approvals and still lists all ten as open. That is expected. Gate closure
lives in the companion register. **Do not edit historical audit output to turn `open` into `closed`.**

## 3. Emulator evidence already banked

Do not re-run these. They are complete for the frozen identity and re-running them consumes budget
without changing any gate.

| Case | Result | Evidence |
|---|---|---|
| API23-UPDATE | PASS — installed hash equals `f7f18ea3`, UID and first-install time preserved, zero fatal matches | `verification/audit/PHASE-4C1-FINAL-SEEDED-APK-2026-08-17.json` |
| ETP-ROTATE | PASS | `verification/audit/PHASE-4C-API23-RUNTIME-INTERRUPTION-2026-08-17.json` |
| ETP-PROCESS | PASS — force-stop and relaunch, no partial generation became active | same |
| ETP-CORRUPT | PASS — authenticated chunk tamper refused with `INTEGRITY_FAILED` | same |
| ETP-RECREATE | PASS — incomplete stage did not become active | same |
| ETP-DISKFULL | Emulator subset only | same; physical residue remains open |
| ETP-LOWSPACE | **Not run.** Explicitly excluded as unsafe on the emulator | Physical, safe low-storage case required |

`npm run test:etp` passed **129/129** covering fail-closed contracts: incomplete staging,
authenticated chunk tamper refusal, restore fencing, PAYMENTTYPE25 quarantine and R003/R013
presentation. This is not a substitute for the exact-candidate physical rows.

## 4. Carried open exceptions — do not attempt to capture

Three audit checks are carried **open** as owner-accepted exceptions. They are recorded in the
companion register under a distinct decision value and are deliberately not gate rows. **None of
them is a pass, and none may be reported as closed.**

| ID | Result | Owner direction |
|---|---|---|
| `A10-01` | fail, P2 | Sagar, 2026-08-17 — proceed with it open. C-08 fails solely for this |
| `A10-04` | unmeasured, mandatory | Sagar, 2026-08-19 — carry open; do not build a device harness |
| `A10-05` | unmeasured, mandatory | Sagar, 2026-08-19 — carry open; do not build a device harness |

**A10-01** measured shell parse p95 rising from 1070.2 ms to 1151.1 ms, a 7.559 percent increase
against a 5 percent limit, while shell bytes fell from 711,857 to 576,043. Accepted risk: slower
cold start. Do not run another timing measurement or create another performance candidate outside a
separately authorized bounded remediation task.

**A10-04 and A10-05** are blocked by three independent obstacles. The absent device is only one:

- **BLOCKER-APK-BINDING.** `validBuildBinding` in `scripts/audit/audits/a10.mjs` requires the device
  record's `apkSha256` to equal one of the two reproducible-build captures in
  `A9-BUILD-COMPARISON.json`. Both are `d79eb925`. The seeded APK `f7f18ea3` is not among them,
  because it comes from a different build command. **Any device record naming `f7f18ea3` returns
  `DEVICE_RUNTIME_APK_BINDING_INVALID` on any hardware, physical or not.**
- **BLOCKER-NO-PRODUCER.** Nothing in the repository emits `SAAGAR_A10_DEVICE_RUNTIME_ACCEPTANCE`.
  The record prefix `verification/audit/accepted/device-runtime/` does not exist. A valid record
  additionally needs an Ed25519 signature from trusted signer
  `phase4a-renderer-ed25519-9ec3b61bbbdb245f` and a `SAAGAR_A10_DEVICE_HARNESS` instrumentation
  artifact. Building that is engineering against a frozen product.
- **No physical device.** Addressed by Section 5 for the gates that remain achievable.

**Accepted risk, stated plainly.** Backup and restore save latency is unverified on physical
hardware at ship time; the 150 ms export, 250 ms frame-gap and 3000 ms total p95 budgets are
unconfirmed for the shipped artifact at representative volume. Retained memory growth across
Expense open, close and reopen cycles is likewise unverified; a leak there would surface as
progressive slowdown or a low-memory kill during long shop sessions. For an application holding shop
records these are real residual risks, carried by explicit owner direction.

**An emulator cannot substitute.** `a10.mjs` requires `device.type === 'physical-android'`. The
adjacent identity fields are unverifiable hashes, so writing `physical-android` for an emulator would
pass the validator — which is exactly why it must not be done. That would be fabricated acceptance
evidence for a data-durability gate.

## 4A. Retail ETP — four gates carried as exceptions

**Owner direction, 2026-08-19:** the Retail ETP feature completes after its own modular migration,
and until then `GATE-ETP-PHYSICAL`, `GATE-ETP-INTERRUPTION`, `GATE-ETP-PRODUCTION` and
`GATE-ETP-EXCEPTIONS` are carried open as accepted exceptions rather than closed.

**ETP was never migrated.** The eleven migrated modules live under `www/modules/`
(`cro_audit, dsr, expense, grooming, leave, payroll, planning, qms, service, stock, tax`). ETP is
eighteen files at `www/` root.

**But ETP ships, and it is reachable.** This is the fact that makes these exceptions consequential
rather than administrative:

- seventeen `etp-*.js` files load via `<script src>` tags in `www/index.html`;
- the eighteenth, `etp-import-worker.js`, loads as a Web Worker;
- `www/index.html` line 329 exposes a live **Open ETP import** button; and
- **there is no feature flag of any kind.**

So the release puts a reachable financial-report import feature in users' hands while its physical,
OEM and production-publication acceptance is deliberately incomplete.

| Gate | What is unverified | Weight |
|---|---|---|
| `GATE-ETP-PHYSICAL` | No physical API-23/OEM document-provider import has ever been performed. Provider-specific file-selection and persisted-URI behaviour is unknown | High — first failure would appear to a user importing real reports |
| `GATE-ETP-INTERRUPTION` | Document-provider interruption and the safe low-storage case. Low storage has never been run **anywhere**, having been excluded as unsafe on the emulator | Medium — emulator covered rotation, force-stop, process death and corruption refusal |
| `GATE-ETP-PRODUCTION` | No real publication has ever been performed. The first authorized WLMHW or HEMW publication happens unrehearsed against live data | High — though parser conformance on real exports is genuine mitigation, see below |
| `GATE-ETP-EXCEPTIONS` | Owner has not reviewed the exception screens | Low — bounded to two rows by contract and non-revenue by construction |

**Mitigation that is real and should be stated fairly.** `verification/ETP-CORE-REAL-CONFORMANCE-2026-08-09.json`
records both stores parsing clean against the exact four-report profile with zero PII canaries, and
REC-002 reconciling `PASS` with `differenceCount: 0` across 4,658 WLMHW and 708 HEMW groups on both
quantity and net amount. That is meaningful. It is not publication, and it is not a device.

**The option not taken.** Hiding ETP behind a feature flag would remove these four gates from
release scope honestly. It was not chosen because adding a flag is a product change that supersedes
the frozen fingerprint, APK, comparison, capability approval and language approval, restarting
Phase 4C.1.

**`GATE-PAYMENTTYPE25` is deliberately NOT carried here.** It needs no device, no production run and
no modular migration — only an owner decision — and it remains pending in Section 6.

**Cheapest to reverse:** `GATE-ETP-EXCEPTIONS` requires only an owner review of the exception card
with the surface named. If that review happens, flip it to closed and leave the other three carried.

## 5. Device routing without owning a tablet

The audit code checks device **class**, not model:

```js
device.type === 'physical-android'  &&  apiLevel >= 23
```

There is no model check. SM-T875 is project naming, not an audit requirement. Two classes are
implied and conflating them is the trap.

**Class 1 — any modern physical Android**, API at least 23. Closes `GATE-UPDATE-PHYSICAL`.

**Class 2 — a genuine API-23-era OEM device.** Closes `GATE-ETP-PHYSICAL` and the
`GATE-ETP-INTERRUPTION` residue. The point of these gates is old-Android OEM document-provider
behaviour, which a modern device does not exercise and an emulator may not substitute for.

A **remote real device is not an emulator.** Cloud device farms — Samsung Remote Test Lab,
BrowserStack App Live, AWS Device Farm — are genuine physical hardware operated remotely and
satisfy `physical-android` honestly, with no purchase. Verify the catalogue actually offers an
API-23-era handset before booking Class 2 time; free labs skew modern.

**Owner decision still required:** acceptance-device re-designation away from SM-T875 must be
recorded in the register before a substitute device closes `GATE-UPDATE-PHYSICAL`.

**Privacy rule for borrowed or cloud hardware:** never restore real shop data onto third-party
hardware. Because A10-04 is now carried as an exception, the representative-volume requirement no
longer gates any session, so the remaining physical sessions can run on seeded or synthetic data
only.

### Class 1 session worksheet

```text
Phase 4C.2 physical update acceptance
Date/time (Asia/Kolkata):
Tester:
Owner approver: Sagar (sagarbora91)
APK filename:
APK SHA-256:
Product commit:
Package/versionName/versionCode:

Device model:
Android version / API level:
Device provenance: owned | borrowed | cloud device farm (name)
Acceptance-device re-designation recorded in register: yes|no
Install method: update-in-place (no uninstall, no data clear)
Pre-update state/control totals:
Post-update state/control totals:
Navigation/module smoke:
Expense Manager:
Retail ETP under Reports and absent from Settings:
Fatal/ANR/blank-screen result:
Screenshot/log references and SHA-256 values:
Owner decision: APPROVE|REJECT
```

Owner statement for a completed Class 1 session:

```text
I, Sagar (sagarbora91), tested the exact Phase 4C.1 candidate APK SHA-256
<APK_SHA256>, product commit <PRODUCT_COMMIT>, package com.saagartraders.bcc,
versionName <VERSION_NAME>, versionCode <VERSION_CODE>, on physical device
<MODEL>, Android <VERSION> / API <API_LEVEL>, on <DATE_TIME_ASIA_KOLKATA>. I
installed it update-in-place without uninstalling or clearing data and confirm
preserved state, successful relaunch, module smoke, working Expense Manager, and
Retail ETP under Reports and absent from Settings, with no unresolved crash, ANR
or blank screen. Evidence-pack SHA-256: <EVIDENCE_SHA256>. Result: PASS. I
approve closure of GATE-UPDATE-PHYSICAL for this exact identity. This statement
does not close physical API-23/OEM acceptance, production ETP publication,
PAYMENTTYPE25, staff UAT, legal, production signing or release acceptance, and it
does not measure or close A10-04 or A10-05, which are carried open exceptions.
```

### Class 2 session worksheet

Use a real Android API-23-class device. An emulator cannot fill this record.

```text
Physical API-23/OEM device:
Model:
Android / API:
Device provenance: owned | borrowed | cloud device farm (name)
OEM WebView version:
Document provider and version (no account identifier):
Four-file selection + persisted permission:
Import / relaunch / readback:
Document-provider interruption:
Low storage (safe method used):
Overall physical/OEM result: PASS|FAIL
Screenshot/log references and SHA-256 values:
```

```text
I, <TESTER_NAME_OR_IDENTITY>, tested exact APK SHA-256 <APK_SHA256>, product
commit <PRODUCT_COMMIT>, on physical device <MODEL>, Android <VERSION> / API 23,
OEM WebView <VERSION>, using document provider
<PROVIDER_AND_VERSION_WITHOUT_ACCOUNT>. I selected the exact four Retail ETP
reports, verified persisted URI access, completed import, relaunch and readback,
and executed the document-provider interruption and safe low-storage cases not
covered by emulator evidence. Every row in evidence <EVIDENCE_PATH>, SHA-256
<EVIDENCE_SHA256>, passed: no partial generation became active, corruption
refused with INTEGRITY_FAILED, prior accepted data remained available where
required, and no plaintext or raw customer data entered the evidence. Result:
PASS. I approve closure of GATE-ETP-PHYSICAL and GATE-ETP-INTERRUPTION for this
exact identity. This is device and OEM evidence, not production publication, UAT,
legal, signing or release approval.
```

## 6. Production ETP and business decisions

Raw workbooks stay outside Git. Record only bounded metadata, hashes, counts and decisions.
**None of this section needs a device.**

```text
Production ETP acceptance
Date/time (Asia/Kolkata):
Operator:
Owner/Admin approver:
Exact APK SHA-256:
Surface used: packaged app | desktop browser build (name it)
Store: WLMHW|HEMW
Financial year and exact period:
Owner/Admin complete-period declaration: yes|no
R003 source SHA-256 / rows / columns:
R013 source SHA-256 / rows / columns:
R022 source SHA-256 / rows / columns:
R025 source SHA-256 / rows / columns:
REC-002 status / difference count:
R013 attribution exception count shown to user:
R003 discount exception count shown to user:
Owner confirms exceptions do not change revenue/sales totals: yes|no
Manager reauthorization before publication: PASS|FAIL
Active generation ID/hash (non-sensitive):
Metadata-only receipt reference/hash:
Prior generation retained and no partial generation active: PASS|FAIL
Production publication decision: APPROVE|REJECT
```

```text
I, Sagar (sagarbora91), acting as Owner/Admin, reviewed and authorized real
production Retail ETP publication on exact APK SHA-256 <APK_SHA256>, product
commit <PRODUCT_COMMIT>, for the exact WLMHW and HEMW periods and source hashes
recorded in evidence <EVIDENCE_PATH>, SHA-256 <EVIDENCE_SHA256>. I declared all
four R003/R013/R022/R025 reports complete for each recorded period,
reauthenticated before publication, verified REC-002 status PASS with zero
blocking differences, accepted the displayed R013/R003 non-revenue exception
counts, and verified the active native generation, metadata-only receipt,
previous-generation retention and absence of partial publication. Result: PASS.
I approve closure of GATE-ETP-PRODUCTION for this exact identity. This does not
approve a PAYMENTTYPE25 mapping unless the separate decision below is completed.
```

`GATE-ETP-EXCEPTIONS` may be reviewed on the packaged app or a desktop build, but the surface
reviewed must be named in the record:

```text
I, Sagar (sagarbora91), for exact APK SHA-256 <APK_SHA256> and product commit
<PRODUCT_COMMIT>, reviewed the R013 attribution and R003 discount exception
screens on <SURFACE_REVIEWED>. I confirm the exception counts are bounded,
visible and intelligible, and that neither alters revenue or sales totals.
Evidence <EVIDENCE_PATH>, SHA-256 <EVIDENCE_SHA256>. Decision: APPROVE|REJECT.
This closes GATE-ETP-EXCEPTIONS only for this identity.
```

`GATE-PAYMENTTYPE25` requires exactly one explicit owner choice:

```text
I, Sagar (sagarbora91), for exact APK SHA-256 <APK_SHA256> and product commit
<PRODUCT_COMMIT>, reviewed the unresolved non-zero PAYMENTTYPE25 population
recorded by retail-etp-core-v1: 2,802 WLMHW R022 rows and 18 HEMW R022 rows.
I choose exactly one: (A) approve the attached versioned business mapping
<MAPPING_ID_AND_SHA256>; or (B) approve continued quarantine and exclusion of
these rows from persisted and verified facts, with no guessed tender mapping.
Decision: <A_OR_B>. Excluded values must not be silently published. This closes
GATE-PAYMENTTYPE25 only for this identity.
```

## 7. Staff UAT and legal

Minimum named UAT rows:

| Role/tester | Store context | Required workflow | Result |
|---|---|---|---|
| Cashier/maker | WLMHW or HEMW | Create, edit and read back representative daily records; a denied privileged action stays denied | `PASS_OR_FAIL` |
| Manager/checker | WLMHW or HEMW | Review and approve, report and export with reauthentication, exception review | `PASS_OR_FAIL` |
| Owner/admin | Both stores where applicable | Backup and restore, access and PIN policy, ETP publication and audit review | `PASS_OR_FAIL` |

Legal reviewer checklist: notice readability; lawful-purpose and consent capture; promotion
suppression and withdrawal; minors and guardian handling; data-subject rights; retention and legal
hold; disclosure and export authorization; grievance and incident procedure; provider and recovery
limitations. Every item needs a named reviewer, date, decision and evidence reference.

Staff UAT and privacy/legal approval must be separate records unless one person is formally named
and authorized for both roles.

```text
We, <NAMED_UAT_TESTERS_AND_ROLES>, completed the Phase 4C.2 UAT matrix for exact
APK SHA-256 <APK_SHA256>, product commit <PRODUCT_COMMIT>, across the recorded
roles and store contexts. Evidence <EVIDENCE_PATH>, SHA-256 <EVIDENCE_SHA256>,
contains the expected and actual result for every row. All rows passed with no
unresolved P0 or P1 issue. We approve the staff-UAT portion of GATE-UAT for this
exact identity.
```

```text
I, <LEGAL_REVIEWER_NAME_OR_IDENTITY>, acting as the authorized privacy and legal
reviewer, reviewed the Phase 4C.2 legal checklist and exact candidate APK SHA-256
<APK_SHA256>, product commit <PRODUCT_COMMIT>, with evidence <EVIDENCE_PATH>,
SHA-256 <EVIDENCE_SHA256>. I approve the recorded notices, consent and
withdrawal, minors and guardian handling, suppression, data-subject rights,
retention and legal hold, disclosure and export authorization, grievance and
incident procedures, and documented provider and recovery limitations, with no
unresolved release-blocking condition. I was informed that A10-01, A10-04 and
A10-05 are carried open exceptions. I approve the legal-review portion of
GATE-UAT for this exact identity. Decision: APPROVE.
```

## 8. Production signing and final release

```text
Production signing receipt (no secrets)
Unsigned/frozen input APK SHA-256:
Signed output APK filename and SHA-256:
Product commit / fingerprint:
Package / versionName / versionCode:
Signing schemes verified:
Signing certificate subject and fingerprint SHA-256:
Build provenance / recipe SHA-256:
Signing date/time and environment identity:
Key custodian name/role:
Second-custodian or witnessed-control evidence:
Private key outside repository: yes|no
Release build debuggable=false: yes|no
Debug certificate absent: yes|no
Install and launch verification after signing: PASS|FAIL
```

The key custodian and the release approver must not be the same person. Production signing alone is
not release approval.

```text
I, <KEY_CUSTODIAN_NAME_OR_IDENTITY>, acting as production signing-key custodian,
produced exact production APK SHA-256 <SIGNED_APK_SHA256> from frozen input APK
SHA-256 <INPUT_APK_SHA256> and product commit <PRODUCT_COMMIT>. Receipt
<RECEIPT_PATH>, SHA-256 <RECEIPT_SHA256>, verifies package and version, build
provenance, signing schemes, certificate SHA-256 <CERT_SHA256>,
debuggable=false, absence of the debug certificate, post-sign install and launch,
private-key exclusion from Git, and the recorded two-custodian control. Result:
PASS. I approve the production-signing portion of GATE-RELEASE for this exact
signed artifact; I do not grant final release approval.
```

```text
I, <RELEASE_AUTHORITY>, approve release of exact APK SHA-256
<SIGNED_APK_SHA256>, package and version <PACKAGE_VERSION>, product commit
<PRODUCT_COMMIT>, signing certificate SHA-256 <CERT_SHA256>, and Phase 4C.2
closure-register SHA-256 <REGISTER_SHA256>. I confirm every Phase 4C.2 gate
carries a completed decision, and I acknowledge that C-08 is failed and that
A10-01, A10-04 and A10-05 are carried open owner-accepted exceptions with their
risks stated in the register. I further acknowledge that the four Retail ETP
gates are carried open, that the Retail ETP feature nonetheless ships reachable
with no feature flag, and that it therefore reaches users without physical
API-23/OEM acceptance, without any real production publication, and without owner
review of its exception screens. I am independent of the signing custodian. I
approve PR #5 for merge and this exact artifact for release.
Decision: APPROVE|REJECT.
```

## 9. Final closure register requirements

The register contains one row for each of the ten gate IDs. Every row must resolve to exactly one of
three states, and never to a blank:

- **closed** — `decision` of `pass` or `approve`, with the frozen product commit, product
  fingerprint and exact final APK SHA-256; evidence record path and SHA-256; reviewer identity,
  role, decision and timestamp; explicit scope and non-claims; and for composite gates, every
  required subcase recorded.
- **pending-external-authority** — `reason`, `requiredAuthority` and `requiredEvidence`.
- **open-owner-accepted-exception** — `ownerDirection`, `riskAccepted`, `doesNotClaim`,
  `reopenCondition`, and the `requiredAuthority`/`requiredEvidence` that would still close it.

Separately, the register retains `A10-01`, `A10-04` and `A10-05` as carried open audit-check
exceptions with the same fields. **A carried exception is never counted as a closed gate**, and the
register enforces this with `carriedExceptionCountsAsClosedAllowed: false`.

Current standing: **2 closed, 4 pending, 4 carried** gate rows, plus **3 carried audit checks**.

Before declaring Phase 4 complete, verify that:

1. the native-language approval is still identity-compatible with the released product;
2. every gate row carries a completed decision — closed, or explicitly carried with its risk stated;
3. `A10-01`, `A10-04` and `A10-05` are still truthfully recorded as open, unless a separately
   authorized remediation closed them;
4. the four Retail ETP gates are still truthfully recorded as carried, and the release approver has
   acknowledged **in writing** that ETP ships reachable without physical, OEM or production
   acceptance;
5. the release-approved identity is the **production-signed artifact**, not the debug APK
   `f7f18ea3`; and
6. no physical, UAT, legal, production-data, signing or release authority rests on emulator-only
   evidence.

The honest status sentence until then:

> Modular HTML migration and Phase 4C.1 engineering and evidence execution are complete. Phase 4C.2
> external release acceptance is pending, with C-08 failed, A10-01, A10-04 and A10-05 carried open
> as owner-accepted exceptions, and the four Retail ETP gates carried open pending that module's
> separate modular migration while the feature nonetheless ships reachable.
