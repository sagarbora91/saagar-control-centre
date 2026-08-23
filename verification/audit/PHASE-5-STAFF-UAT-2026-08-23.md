# Phase 5 staff UAT — 2026-08-23

Status: **IN PROGRESS — participants named; no human result recorded yet**

## Exact candidate

| Field | Value |
|---|---|
| APK | `SaagarCC-v2.9-production-dfa4ddb.apk` |
| APK SHA-256 | `bc4ea8c17a5688b293e26c3ab18253069555b1744cb87e545878a64996a58bac` |
| Product commit | `dfa4ddb288bdfefb2dca9b249fef430dea370afb` |
| Package/version | `com.saagartraders.bcc` / `2.9` (`209`) |
| Device | Samsung SM-T875, Android 13 / API 33, serial `R52N807PTTE` |
| Installation evidence | `verification/audit/PHASE-5-PRODUCTION-SIGNED-SM-T875-INSTALL-2026-08-23.md` |

The installed APK is production-signed and non-debug. The installed package was
pulled back and matched the APK hash above. This record is limited to human UAT;
it does not substitute for the open API-23/OEM or authorized production-data
gates.

## Named participants and matrix

Human decisions must be stated by the named participant. Codex, ADB evidence and
the owner cannot infer or substitute for those decisions.

| UAT ID | Role/tester | Store context | Required workflow | Expected result | Actual result | Decision/evidence |
|---|---|---|---|---|---|---|
| `UAT-CASHIER-01` | Akash — Cashier/maker | `WLMHW` | Create a representative non-sensitive daily record, save it, edit it, and read it back | Saved values remain accurate after edit and reopen | **OBSERVED PASS** — created synthetic ₹1 Cash / Miscellaneous entry for Titan World (`WLMHW`) as `UAT-AKASH-WLMHW-20260823`; app showed `Saved`; read-back showed `Pending`, ₹1 and the correct store; edit with reason `Akash UAT edit` produced `UAT-AKASH-WLMHW-20260823-EDITED` and `Updated` | Connected-device UI hierarchy and screenshot; zero fatal/ANR signals. Akash decision pending |
| `UAT-CASHIER-02` | Akash — Cashier/maker | Same as above | Attempt a manager/owner-only action without manager authorization | The privileged action is denied or requires manager reauthentication; no unauthorized change occurs | **OBSERVED PASS** — while role remained `Cashier (maker)`, the Pending row exposed Send/Edit/Void but no Approve action; no unauthorized approval occurred | Connected-device UI hierarchy. Akash decision pending |
| `UAT-MANAGER-01` | Shadul — Manager/checker | `WLMHW` | Review the maker record and complete the applicable checker/approval action | Correct record is shown; authorized review/approval is recorded accurately | **PENDING** | Shadul decision pending |
| `UAT-MANAGER-02` | Shadul — Manager/checker | Same as above | Review an exception and open/report/export the relevant result using reauthentication where prompted | Exception is understandable; reauthentication is enforced; output matches the visible record | **PENDING** | Shadul decision pending |
| `UAT-OWNER-01` | Sagar — Owner/admin | Both stores where applicable | Review backup/restore, access/PIN policy, ETP publication state and audit trail | Controls and audit information are understandable and acceptable for use | **PENDING** | Owner decision pending |

Use realistic but synthetic UAT data only. Do not enter private customer data or
publish production ETP files as part of this staff test.

## Session observations

- Akash session pre-check: production home screen opened with no `TEST` badge.
- The owner authorized Codex to operate and inspect the USB-debug-connected
  tablet. This technical operation does not replace Akash's personal UAT
  decision.
- Maker record remains deliberately `Pending` for Shadul's checker session.
- No real customer information or authorized production ETP file was used.

## Defect rule

For any failure, record the exact step, expected result, actual result, severity
(`P0`, `P1`, or `P2`), and a screenshot or other evidence reference. Staff UAT
cannot pass with an unresolved P0/P1 defect.

## Decisions

- Akash cashier/maker decision: **PENDING**
- Shadul manager/checker decision: **PENDING**
- Sagar owner/admin decision: **PENDING**
- Staff-UAT portion of `GATE-UAT`: **OPEN**
