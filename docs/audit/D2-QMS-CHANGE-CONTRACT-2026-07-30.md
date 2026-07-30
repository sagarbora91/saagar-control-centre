# D2 QMS Fast Front Desk - Change Contract

**Date:** 2026-07-30 (Asia/Kolkata)
**Baseline:** `main` / `origin/main` at `49d531b`
**Source state:** uncommitted working tree; no push authorised
**Scope authority:** `docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md` section 8.5
**Status:** engineering complete and locally verified; acceptance remains **PARTIAL / PENDING**

## 1. Why D2 was interleaved

E1 remains blocked because the required HEMW R022/R025/R013/R003 raw exports
have not been supplied. The available Helios annual-analysis workbook is a
derived summary and is not an acceptable schema-freeze input. D2 was therefore
interleaved as an independently testable Android module. This does not waive
the E1 dependency or any Phase 0/device gate.

PHP/server work remains excluded.

## 2. Approved implementation boundary

D2 deepens the existing local-first QMS module only:

- faster arrive-to-outcome and mandatory skip-review paths;
- exact-mobile, same-India-business-day duplicate review;
- deterministic follow-up prioritisation;
- canonical lost and conversion reasons;
- retry-safe intake persistence and legal evidence capture; and
- safe legacy/default handling without a destructive migration.

It does not add server sync, silent record merging, authenticated store
assignment, a new storage engine, or PHP functionality.

## 3. Product and policy decisions implemented

### Duplicate review

- A suggestion requires a complete normalized 10-digit mobile and the same
  India business date.
- Name, date of birth, partial mobile, no-mobile visits, fuzzy identity, and
  historical-day similarity are not match inputs.
- The only decisions are `OPEN_EXISTING`, `CREATE_SEPARATE`, and `CANCEL`.
- Creating a separate visit requires an explicit review of the complete stable
  candidate-ID set. Missing IDs fail closed.
- There is no merge path.
- Suggestions expose queue/status context, not customer PII.

### Outcomes and follow-ups

- Purchase and converted outcomes require a canonical conversion reason.
- Non-purchase/lost outcomes require a canonical lost reason.
- `OTHER` requires bounded detail; unknown legacy labels remain visibly
  unmapped and are not silently converted to `Other`.
- Service remains a service outcome and is not counted as a conversion.
- The existing purchase rule remains: a purchase amount must be greater than
  zero. Any change to zero-value purchase treatment is a separate product
  decision.
- Follow-ups sort deterministically by due status/date, expected value, last
  contact, missing owner/CRO, creation time, and stable ID.
- Follow-up mutations reject past business dates. Negative or invalid restored
  expected values display as zero/blank rather than producing misleading
  priority.

### Time boundary

Today views, duplicate matching, queue sequencing, and CSV business dates use
the India business day (UTC+05:30), including the UTC-midnight boundary.

## 4. Persistence, schema, and migration treatment

| Area | Treatment |
|---|---|
| Canonical QMS state | Existing key `retail_queue_management_v1` remains the owner. |
| Business-record additions | New records may carry `businessDate`, canonical reason code/label/detail, contact metadata, expected/recovered value, and the legal intake operation ID in audit metadata. Fields are backward-compatible and optional for restored legacy rows. |
| Legacy reasons | Known labels map to stable codes. Unknown values remain `LEGACY_UNMAPPED` for human review. No bulk rewrite occurs on load. |
| Save atomicity | QMS state, the final audit entry, visit creation, queue sequence, and any staged follow-up change are committed through one final persistence write. Failure reloads and renders the last persisted snapshot. |
| Retry token | New key `retail_queue_management_pending_intake_v1` stores only version, customer ID, India business date, queue preview, and creation time. It contains no name, mobile, DOB, consent, or payload. |
| Retry behavior | A verified uncommitted ID is reused after process restart; an already-committed ID rotates; malformed/unreadable data fails before legal or queue mutation; the matching token clears only after successful QMS commit or an idempotency conflict proving it cannot be reused. |
| Backup/restore | Canonical business state continues through the existing QMS module backup path. The pending token is transient retry metadata and was not added as a portable app-control setting. Real-device process-kill and backup/restore behavior remains an acceptance test. |
| Rollback | Older code can ignore the optional fields. If this implementation is rolled back, the retry token may be cleared only after confirming that no intake is awaiting retry; clearing it loses only an uncommitted metadata reservation, not a committed customer/queue record. |

Customer IDs accepted by the retry token use `cust_` plus a 6-80 character
lowercase alphanumeric/underscore suffix. This is within the legal operation
contract's 1-80 suffix bound.

## 5. Legal, privacy, and messaging controls

- QMS capture uses the deterministic operation ID
  `qms-intake:<customerId>`, bound to the same payload customer ID.
- Legal capture preflights every planned field before writing.
- Notice, promotional consent/decline, suppression, and guardian evidence are
  forward-idempotent. A retry reuses matching evidence and completes only the
  missing later step; it does not delete valid evidence as compensation.
- A conflicting operation fails before mutation.
- Corrupt consent or suppression evidence blocks promotional authorization.
  Operational messaging remains governed by its separate lawful-purpose path.
- Audit details contain the metadata-only intake operation ID and canonical
  reason code; the pending-token audit path does not copy mobile or other PII.
- No physical-device call/WhatsApp, notice readability, guardian, withdrawal,
  or operator-flow acceptance is claimed by automated tests.

## 6. Implementation and permanent evidence

Primary implementation:

- `www/qms-policy.js`
- `www/qms-persistence.js`
- `www/legal-control.js`
- the embedded QMS payload in `www/index.html`
- `scripts/apply-d2-qms.mjs`

Permanent regression coverage:

- `tests/d2-qms-policy.test.mjs`
- `tests/d2-qms-integration.test.mjs`
- `tests/legal-intake-idempotency.test.mjs`
- `tests/legal-minimum.test.mjs`

Local evidence recorded on 2026-07-30:

- focused D2/legal suite: **48/48 passed**;
- full offline suite: **123/123 passed**;
- D2 patch script syntax: passed;
- incomplete-module recovery: each of the seven legal/retry/entry helpers was
  individually removed and deterministically restored to exactly one copy;
- intact patch rerun: byte-identical;
- embedded QMS: 166,462 UTF-8 bytes, SHA-256
  `aa9402cc05aadb430224705d53b75df83b2e4bdac29a8c5fd4f96cf344c018f4`;
- independent final review: no remaining P0/P1/P2 defect in the reviewed scope;
- `npm run build:apk`: passed;
- local debug APK: 7,553,056 bytes, SHA-256
  `D2206B09C199579DE2E4A83F20F070D5C51042700ECB8F701541ED41ABF1141F`;
- packaged identity: version 2.9, versionCode 209, minSdk 23, targetSdk 34.

The APK is an uncommitted, debug-signed review artefact. It is not a controlled
release and does not map to a clean commit.

## 7. Acceptance still required

D2 is not Work-package Done until evidence is recorded for:

- representative primary and API-23-class devices;
- arrive-to-outcome tap/time measurement at representative volume;
- small-screen, keyboard, rotation/relaunch, and process-kill retry journeys;
- India-midnight behavior on a real device;
- duplicate-review readability and operator choice;
- no-mobile, notice, promotional consent/decline, suppression, guardian, and
  controlled call/WhatsApp paths;
- canonical lost/conversion reason usability with staff;
- follow-up ordering and mutations with representative restored data;
- backup/restore/reset treatment for new optional fields and retry metadata;
- authenticated role/store privacy and current-CRO identity decisions;
- staff UAT, owner/process acceptance, legal acceptance, production signing,
  and the remaining Phase 0 gates.

The dashboard store selector remains workflow context, not authenticated store
authorization. Existing QMS data is not thereby proven store-isolated, and the
current role/CRO values must not be represented as programme-wide authenticated
staff identity.

## 8. Resume decision

After owner review of this uncommitted module:

1. run the D2 device/UAT acceptance set without marking device rows passed in
   advance; and
2. obtain the missing HEMW raw ETP samples before E1 schema/parser work resumes.

Do not commit, push, or begin PHP work without explicit owner direction.
