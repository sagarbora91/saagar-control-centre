# SAAGAR Android - E1 current-state inventory

**Inventory date:** 2026-08-02 (Asia/Calcutta)  
**Repository:** `V:\Co work\Projects\Retail\saagar-control-centre`  
**Branch:** `agent/storage-recovery-p0`  
**HEAD:** `4177701f8fe4cab46de1ff2e7597ccb52e0cda5a`  
**Working tree:** intentionally dirty  
**Commit/push:** none authorized or performed  
**PHP/platform work:** excluded

## 1. Executive status

E1-0 discovery and no-write policy work is substantially complete as a
reviewed replacement candidate. The five findings from the crash checkpoint
have focused automated coverage. The replacement is not yet promoted into the
canonical filenames, loaded by the application, or accepted against full real
WLMHW and HEMW schemas.

Production E1 remains blocked. No workbook parser, SQLite fact persistence,
import UI, schema freeze, runtime integration, or E1 APK has been started.

## 2. Completed inventory

| Area | Status | Evidence/result |
|---|---|---|
| Crash checkpoint recovery | Done | Branch, HEAD, dirty tree, surviving files, and latest handoffs verified |
| WLMHW source discovery | Done for inventory only | Four WLMHW reports R022/R025/R013/R003 found and inspected metadata-only |
| WLMHW structural inventory | Done | Header counts, row counts, hashes, coverage, store and transaction types recorded |
| E1-0 change contract | Done | Pure, dependency-free, no-write policy scope documented |
| Known PII policy | Done in reviewed replacement | Approved PII is explicitly dropped before persistable output; unknown/unapproved fields fail closed |
| `ENCIRCLE` distinction | Done in reviewed replacement | Bare `ENCIRCLE` allowed as amount/flag; identifier aliases remain prohibited |
| Report requirements | Done in reviewed replacement | Explicit required identifiers and measures per report |
| Header binding | Done in reviewed replacement | Rows must match the exact detected approved header signature |
| Date plausibility | Done in reviewed replacement | Deterministic earliest date, as-of date, and bounded future skew |
| R013 policy coverage | Done | Reduced synthetic CRO identifier fixture included; CRO name dropped |
| Coverage language | Corrected | Tests explicitly avoid claiming full WLMHW or HEMW acceptance |
| Reviewed focused tests | Passed | 8/8 |
| Combined E1 tests | Passed | 18/18 |
| Full offline regression | Passed with fixed clock | 210/210 with `TZ=UTC` |
| Normal local-time regression | Known pre-existing flake | 209/210; only ENG-02 UTC/Asia-Calcutta backup filename mismatch |
| Owner APK report | Recorded correctly | Owner-reported smoke evidence only; not formal device acceptance |

## 3. Current file disposition

### Reviewed replacement candidates

| File | Disposition |
|---|---|
| `www/etp-import-foundation.e1-reviewed.js` | Reviewed no-write policy replacement candidate |
| `tests/e1-etp-import-foundation.reviewed-v2.test.mjs` | Current focused replacement test suite; 8/8 passed |
| `docs/E1-ETP-IMPORT-FOUNDATION-PLAN-ADDENDUM-2026-08-02.md` | Current plan addendum |
| `verification/E1-IMPORT-FOUNDATION-HANDOFF-2026-08-02.md` | Current detailed handoff |
| `verification/E1-CURRENT-STATE-INVENTORY-2026-08-02.md` | This controlling inventory |

### Evidence and source-control documents to retain

| File | Purpose |
|---|---|
| `verification/E1-IMPORT-FOUNDATION-CRASH-CHECKPOINT-2026-08-02.md` | Crash recovery baseline and five findings |
| `verification/ETP-WLMHW-SOURCE-INVENTORY-2026-08-02.md` | Privacy-safe real WLMHW metadata inventory |
| `docs/E1-ETP-IMPORT-FOUNDATION-CHANGE-CONTRACT-2026-08-01.md` | Authorized E1-0 scope and exclusions |
| `docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md` | Master programme authority; already contains unrelated dirty changes |

### Incomplete, superseded, or crash-draft files - exclude from commit

| File | Reason |
|---|---|
| `www/etp-import-foundation.js` | Original canonical candidate still contains the five reviewed defects |
| `tests/e1-etp-import-foundation.test.mjs` | Original canonical synthetic suite; useful comparison only |
| `tests/e1-etp-import-foundation.reviewed.test.mjs` | Superseded first replacement test attempt with two incorrect assertions |
| `www/etp-import-policy.js` | Duplicative/incomplete crash draft |
| `tests/etp-import-policy.test.mjs` | Duplicative/incomplete crash draft |
| `tests/etp-import-foundation.test.mjs` | Duplicative/incomplete crash draft |
| `www/build-identity.js` | Incomplete and unconsumed build-identity draft |

No file in this table should be deleted, replaced, or committed without owner
approval and a reviewed promotion/cleanup step.

## 4. Pending engineering work

| Priority | Work | Current condition |
|---:|---|---|
| 1 | Promote reviewed policy/test into canonical filenames | Pending deliberate merge that preserves required original batch metadata and identity behavior |
| 2 | Cleanly classify/remove superseded drafts | Pending owner approval; no deletion authorized |
| 3 | Make ENG-02 clock deterministic | Pending; current failure is a test-timezone issue, not an E1 regression |
| 4 | Centralize build identity | Pending across web UI, Android override/build, and release register |
| 5 | Obtain HEMW four-report exports | Blocked on source availability |
| 6 | Build sanitized full-header fixtures | Pending full WLMHW plus missing HEMW schemas |
| 7 | Approve report dictionaries | Pending both-store evidence and business approval |
| 8 | Define required fields/grains | Policy mechanism exists; production mappings remain unapproved |
| 9 | Define R022-to-R025 reconciliation | Pending approved common grain, strict rule, and tolerance |
| 10 | Evaluate XLSX parser | Pending licensing, security, APK-size, memory, and API-23 testing |

## 5. Production work explicitly not started

- workbook/XLSX parsing;
- CSV parsing;
- sealed ETP SQLite schema or persistence;
- staged write or atomic-swap implementation;
- import file picker or UI;
- ETP fact-store backup/re-import lifecycle;
- R022/R025 reconciliation execution;
- E2-E6 verified metrics or views;
- schema/header freeze;
- E1 APK build or device test; and
- PHP/server platform work.

## 6. Blocking gates

| Gate | Status | What closes it |
|---|---|---|
| HEMW source gate | Blocked | Real R022/R025/R013/R003 HEMW export set |
| Both-store header gate | Blocked | Sanitized exact WLMHW and HEMW header fixtures |
| Dictionary gate | Blocked | Approved identifiers, measures, transaction/tender mappings, and version |
| Reconciliation gate | Blocked | Approved R022/R025 common grain, rule, and tolerance |
| Parser gate | Blocked | Dependency decision plus licensing/security/size/memory evidence |
| API-23 parser gate | Blocked | Representative Android API-23 resource and failure tests |
| Build-identity gate | Blocked | One centralized, tested source consumed by UI/build/release tooling |
| Formal device acceptance | Pending | Real device evidence; owner smoke alone is insufficient |

## 7. Required next sequence

1. Review and deliberately promote the E1 reviewed replacement into the
   canonical module/test while retaining valid batch lineage functionality.
2. Rerun syntax, focused E1, and full offline regressions.
3. Resolve the ENG-02 test clock deterministically.
4. Centralize and test build identity.
5. Obtain HEMW exports and create sanitized full-header fixtures for both stores.
6. Approve dictionaries, report grains, required fields, and R022/R025
   reconciliation.
7. Evaluate the parser, including API-23 memory, time, security, licensing, and
   APK-size gates.
8. Only after all gates pass, seek authorization for parsing and sealed ETP
   persistence. Import UI and schema freeze follow later.

## 8. Repository protection

The working tree contains unrelated and user-owned work, especially
`docs/audit/**`, `package-lock.json`, PIN/storage/native SQLite changes, and
their tests and handoffs. Preserve all of it. Do not reset, overwrite, delete,
commit, or push without explicit owner approval.
