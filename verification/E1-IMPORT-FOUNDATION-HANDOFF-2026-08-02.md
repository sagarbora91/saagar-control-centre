# SAAGAR Android - E1 import-foundation continuation handoff

**Date:** 2026-08-02 (Asia/Calcutta)  
**Branch verified:** `agent/storage-recovery-p0`  
**HEAD verified:** `4177701f8fe4cab46de1ff2e7597ccb52e0cda5a`  
**Commit/push:** none  
**PHP/platform work:** excluded; none performed

## Repository safety

The expected intentionally dirty tree was preserved. No reset, checkout,
cleanup, deletion, commit, push, or direct shell file write was performed.
Existing/user-owned `docs/audit/**`, `package-lock.json`, and all unrelated PIN,
storage, native SQLite, documentation, and test changes remain untouched.

Safe `apply_patch` updates to every existing file continue to fail with the
Windows `apply deny-read ACLs` error. This prevented direct correction of
`www/etp-import-foundation.js`, direct replacement of
`tests/e1-etp-import-foundation.test.mjs`, and appending the consolidated plan.
The checkpoint-approved new-file replacement route was therefore used.

## E1 replacement status

Use these as the reviewed replacement candidates:

- `www/etp-import-foundation.e1-reviewed.js`
- `tests/e1-etp-import-foundation.reviewed-v2.test.mjs`

They address all five checkpoint findings: explicit known-PII dropping with a
value-canary test; bare `ENCIRCLE` separation from identifier aliases; explicit
report-specific identifier/measure requirements and mapped transaction type;
exact detected-signature binding; deterministic lower/future date bounds; R013
coverage; and honest reduced-synthetic labels.

Do not commit the earlier failed replacement test
`tests/e1-etp-import-foundation.reviewed.test.mjs`. Its policy module is the same
reviewed candidate, but two assertions were superseded: one incorrectly banned
the safe dropped-header name from lineage, and one expected year 0001 to reach
the lower-bound classification despite JavaScript's 00-99 date quirk. The v2
suite verifies that `00010101` is rejected and separately proves the historical
bound with calendar-valid `20191231`.

The original canonical pair and prior crash drafts remain incomplete and must
also be excluded unless deliberately replaced:

- `www/etp-import-foundation.js`
- `tests/e1-etp-import-foundation.test.mjs`
- `www/etp-import-policy.js`
- `tests/etp-import-policy.test.mjs`
- `tests/etp-import-foundation.test.mjs`
- `www/build-identity.js`

## Verification evidence

- `node --check www/etp-import-foundation.e1-reviewed.js` - passed.
- reviewed focused suite - 8/8 passed.
- reviewed plus original canonical focused suites - 18/18 passed.
- `npm run test:offline` in normal local environment - 209/210; only ENG-02
  failed because the application generated `backup-2026-08-02.json` while the
  test expected UTC `backup-2026-08-01.json`.
- `$env:TZ='UTC'; npm run test:offline` - 210/210 passed.

No APK was built because the policy remains unintegrated and centralized build
identity is not satisfied.

## Evidence and gate language

The latest pre-E1 debug APK remains owner-reported as working fine. Record that
only as owner-reported smoke evidence; it does not prove artifact hash, device
matrix, timed performance, BKP-03/DAT-02, restore cases, E1 behavior, or formal
device acceptance.

Full real WLMHW acceptance is not claimed. The reduced synthetic fixtures only
exercise policy behavior. No HEMW four-report source set exists in the current
evidence, so HEMW and both-store acceptance remain blocked.

## Mandatory next steps

1. Restore safe patch access to existing files.
2. Deliberately promote the reviewed module/test into the canonical filenames,
   preserving batch metadata/identity behavior from the original candidate as
   required, and remove/exclude superseded drafts only with owner approval.
3. Append the material in
   `docs/E1-ETP-IMPORT-FOUNDATION-PLAN-ADDENDUM-2026-08-02.md` to the consolidated
   plan after safe patch access returns.
4. Obtain HEMW R022/R025/R013/R003 exports and sanitized full header fixtures.
5. Complete parser licensing/security/APK-size/memory/API-23 evaluation,
   approve both-store dictionaries and required fields, define R022/R025
   reconciliation, and centralize build identity.
6. Do not begin parsing, SQLite persistence, import UI, schema freeze, or PHP
   platform work before those gates are genuinely satisfied.

No commit or push may occur without explicit owner approval.
