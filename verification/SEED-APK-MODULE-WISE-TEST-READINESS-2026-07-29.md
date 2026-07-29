# Seeded APK v2.9 - Module-Wise Test Readiness Report

**Prepared:** 2026-07-29 (Asia/Kolkata)  
**Status:** PRE-EXECUTION. This is a static/package readiness assessment and test catalogue. No device, provider, restore, or module journey is represented as executed.

## Scope and inputs

| Input | Verified status |
|---|---|
| Seeded APK | `V:\Co work\Projects\Retail\SaagarCC-DemoData-v2.9.apk` - present. The extra `Retail` segment in the supplied absolute path does not exist. |
| Device acceptance script | `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` - present and reviewed. |
| Source/regression evidence | Current local v2.9 worktree; `npm run test:offline` previously passed 54/54. |
| Test goal | Full seeded-APK functional pass, module by module, followed by the BKP-03 / DAT-02 / restore drills. |

## Executive verdict

The APK is a valid **seeded debug device-test build** and is ready to begin a controlled module-wise functional test. Static checks found no packaging mismatch in the 15 key JavaScript assets or in the seeded shell after normalising its intentional seed flag.

This is **not a release approval** and it is **not a functional-pass result**. The device script has not been executed, no physical-device result exists, and most business modules still need their first live user-journey check. The decision after this report should be whether to authorise that controlled test pass and nominate the two devices and test account.

## APK inspection evidence

| Check | Result |
|---|---|
| File size | 7,583,854 bytes |
| SHA-256 | `D6A09597070D3A689BDED8EF91E4676D225B54A616E48F126F9899D11D440E96` |
| Package / Android version | `com.saagartraders.bcc`, version 2.9, versionCode 209 |
| Supported Android floor | min SDK 23; target SDK 34 |
| Seed state inside packaged `index.html` | `DEMO_SEED_ENABLED = true` |
| Package identity | `Saagar Control Centre`; launchable `MainActivity` present |
| Build posture | `aapt` reports `application-debuggable`; use only for device/UAT testing |
| Packaged public assets | 31 assets, including off-device backup, performance acceptance, restore, export, legal, report, storage, and seed layers |
| Key asset parity | 15/15 inspected packaged JavaScript assets match the current local v2.9 source exactly |
| Shell parity | Packaged `index.html` matches clean source after replacing only the intended `DEMO_SEED_ENABLED=true` build flag with `false` |

## What the seed gives the tester

The seeded build provides realistic history for the main operating modules: QMS/customer queue, service jobs and evidence, DSR, stock, expenses/budgets/petty cash, grooming, CRO audits, payroll, leave, tax, employee/master data, and both stores (`WLMHW` / `HEMW`).

The Festival and Season Planner is available but is deliberately a create/edit test: add a fresh festival record, targets, blackout flag, and checklist during the test.

Use the seed only for functional/UAT work. Do not treat it as representative mature-shop data for DAT-02 unless a documented comparison proves that its data volume is at least the real operating volume.

## Static evidence already available

| Coverage | Current evidence | What it does not prove |
|---|---|---|
| Permanent offline suite | 54/54 passed | Real-device UI, Android provider behaviour, or user journeys |
| Embedded module integrity | All 11 embedded module scripts parse; byte/SHA metadata and outbound-route controls are tested | Every screen, validation message, and multi-step operator flow |
| Money/report regressions | Payroll, professional tax, daily cash, GST, leave, and report golden cases pass | User-facing totals after live edits on a device |
| Backup/restore | Encryption, tamper handling, rollback, provider binding, GFS contract, and fail-closed cases pass | Drive/OneDrive delivery, cross-device recovery, 36-hour escalation |
| Legal/export controls | Register, notices, consent/suppression, rights, export denial/approval, and route controls pass | Operator comprehension and live WhatsApp/share behaviour |

## Findings before execution

| Priority | Finding | Effect / required treatment |
|---|---|---|
| Release blocker | APK is debug-signed and debuggable | Correct for this test round. It cannot be accepted as the production release. |
| Acceptance blocker | No physical-device test evidence is recorded | Run the script on both accepted devices; blank results are failures. |
| Acceptance blocker | DAT-02 seed data may be below representative shop volume | Run it with representative real/restored-real data, or formally justify the seed volume. |
| Operational limitation | Automatic BKP-03 delivery runs on first app use of a day and during active sessions | Obtain owner acknowledgement; it is not a closed-app Android background job. |
| Test-control risk | Backup/restore and reset drills can alter data | Use the seeded build or a separately backed-up test device only; never use live shop data without a fresh off-device backup. |
| Documentation correction | The actual APK is at `...\Retail\SaagarCC-DemoData-v2.9.apk` | Use this path in the test record, not `...\Retail\Retail\...`. |

## Test protocol and result rules

All cases below are initially **NOT RUN**. For every case record: test ID, tester, device/model/Android version, seeded record used or record created, observed result, screenshot/video reference, and any logcat/browser-console error.

- Test only with seeded data, a dedicated test account, and dummy contact details. Open a WhatsApp/share composer if needed, but do not send a live customer message or disclose real data.
- Tag every record created during testing with `UAT-2026-07-29` so it can be found and removed through the normal UI after evidence is captured.
- After each money, lock, or approval action: close/relaunch the app and verify the result persisted exactly once.
- A crash, data loss, wrong financial total, unauthorized export/message, failed restore rollback, or a blocked owner/admin action is a **stop-and-fix** defect.
- A visual, label, or usability issue without data/control impact is logged separately and triaged after the critical path is stable.

## Module-wise functional test catalogue

### A. Shell, identity, and shared data controls

- **CORE-01 Launch and seed:** fresh install launches without crash; seeded data is visible; no duplicate reseed after restart.
- **CORE-02 Roles and PIN:** exercise staff, manager, and owner paths; wrong PIN, timeout/re-auth, and lockout must give a clear result without bricking access.
- **CORE-03 Store separation:** switch/check both `WLMHW` and `HEMW`; totals, records, and store labels must not bleed across stores.
- **CORE-04 Persistence:** create a tagged record, switch module, force-close/relaunch, and verify one intact record only.
- **CORE-05 Shell settings:** language/text-size/attention behaviour works, then remains correct after relaunch.
- **CORE-06 Diagnostics:** check storage/encryption state, no degraded-mode warning in normal operation, and no customer data appears in diagnostics/support output.

### B. QMS / customer queue

- **QMS-01 Intake notice and fields:** create a queue/walk-in entry; notice is shown, registered fields save, and an unknown/unapproved field is rejected.
- **QMS-02 No-mobile path:** create a valid walk-in with no mobile number; it must not block the visit or create a malformed customer record.
- **QMS-03 Consent and messaging:** decline promotion; operational messaging remains available while promotional action is blocked. Record/withdraw consent and confirm suppression.
- **QMS-04 Customer recognition:** use a seeded repeat customer; verify the repeat-customer indication and customer history without duplicate master creation.
- **QMS-05 Follow-up/outcome:** create/close a follow-up, mark a conversion, and verify recovered value/lost-walk-in views and persistence after relaunch.

### C. Service centre

- **SVC-01 New and repeat service job:** create a tagged service order and a repeat-customer order; verify customer lookup, item/custody fields, and legal notice.
- **SVC-02 Evidence and photos:** add/view permitted evidence photos; verify count/preview and that the record survives navigation/relaunch.
- **SVC-03 Workflow state:** progress estimate/approval/repair/ready/pickup stages; stage history and turnaround information must be coherent.
- **SVC-04 Financial close:** record final amount/payment/delivery; collected-revenue figures and service totals must update once only.
- **SVC-05 Ready-for-pickup route:** invoke the controlled WhatsApp composer with a dummy record, verify correct template/category, then cancel without a false sent marker.
- **SVC-06 Document/output:** preview invoice/receipt/report output and verify export control denies it when policy is disabled.

### D. Daily Staff Register (DSR)

- **DSR-01 Staff/session entry:** log a CRO/SM day entry, including manual sales, mobile/payment mode, and required validation.
- **DSR-02 Non-purchase follow-up:** save a tagged non-purchase outcome, verify it reaches the follow-up pipeline once.
- **DSR-03 Daily totals:** compare DSR sales/cash/payment totals to the seeded and newly entered rows; test date switching.
- **DSR-04 Corrective unlock:** request an SM unlock, make one justified correction, and verify the audit trail/re-emitted bridge result.
- **DSR-05 EOD sharing:** open the controlled EOD WhatsApp summary and cancel; no unauthorized send/export marker may be created.

### E. Stock register and cross-module bridge

- **STK-01 Opening/movement/closing:** create a tagged movement and verify opening, movement, closing, and variance calculations.
- **STK-02 Submit/lock/reopen:** submit/lock a day, confirm edits are blocked, then reopen through the controlled path and inspect stamps/reopen count.
- **STK-03 Theft gate:** zero-theft flow remains usable; non-zero theft requires a remark and SM verification before submission.
- **STK-04 Variance/shrinkage:** verify monthly/store/brand variance and shrinkage output against a known seeded day.
- **STK-05 Sales-unit bridge:** compare stock sales units with DSR/QMS; deliberate mismatch should surface a clear exception rather than corrupting stock.
- **STK-06 Cross-store isolation:** repeat one read-only check for both stores and confirm no records move between them.

### F. Expense, petty cash, and credit ledger

- **EXP-01 Expense lifecycle:** add, edit, void, and view a tagged expense; ledger and cash totals remain correct after relaunch.
- **EXP-02 Recurring/budget controls:** apply a recurring template, check copy-last-month budget, and force a budget alert.
- **EXP-03 GST capture:** enter vendor GSTIN, rate, and GST amount; validate tax feed/category totals.
- **EXP-04 Month lock:** lock the month, prove normal edits are refused, then use the authorised override-with-reason path and audit it.
- **EXP-05 Petty cash / income:** test cash in/out and verify daily cash carries across date gaps without duplication.
- **EXP-06 Udhaar ledger:** create a receivable and part-settlement; ageing/balance stays correct.

### G. Grooming

- **GRM-01 Checklist:** complete male and female checklist paths; score, checked/total count, and save acknowledgement are correct.
- **GRM-02 Accountability:** record `checkedBy`; ensure it persists with the date/store record.
- **GRM-03 Reporting:** inspect most-failed parameters and store-wise view for both stores.
- **GRM-04 Data lifecycle:** re-open the same day/month after relaunch and verify no duplicate checklist or lost record.

### H. CRO audit

- **CRO-01 Daily audit:** add/update a CRO audit; validate score calculation and persistence.
- **CRO-02 QMS auto-fill:** use seeded QMS bills/invoices; verify auto-fill and no unintended write-back to QMS.
- **CRO-03 Targets:** set/check per-store targets for Titan World and Helios; totals and store dimension must be distinct.
- **CRO-04 Exceptions/report:** trigger/check the audit-pending exception and the summary/report view.

### I. Payroll and statutory outputs

- **PAY-01 Input/calculation:** select a seeded payroll month and confirm gross-to-net, deductions, employer totals, and professional-tax boundary behaviour.
- **PAY-02 Leave reconciliation:** verify approved leave feeds payroll once and the reconciliation view identifies a deliberate mismatch.
- **PAY-03 Lock/action controls:** lock a payroll run; verify PIN/re-auth and that post-lock edits follow the authorised path.
- **PAY-04 Statutory totals:** confirm stored statutory totals appear in month-end output.
- **PAY-05 ECR/ESIC output:** preview CSV/PDF output with dummy/seeded data; test export denied before approval and controlled route after approval without sending externally.
- **PAY-06 Full and Final:** build a tagged F&F settlement and verify calculation/document fields without changing a real employee record.

### J. Leave calendar and capacity

- **LEV-01 Application lifecycle:** create, approve/reject, and view a tagged leave request; weighted/half-day and weekly-off calculations must be correct.
- **LEV-02 Capacity:** set/check store-specific capacity for both stores; no cross-store carry.
- **LEV-03 Next-seven-days view:** validate staffing strip against approved leaves.
- **LEV-04 Blackout/holiday:** create peak-season blackout and store holiday; prohibited leave should be refused clearly.
- **LEV-05 Register/report:** verify leave register and export route are controlled and persistence survives relaunch.

### K. Tax and evidence pack

- **TAX-01 Tax feed:** validate GST/tax feed totals from seeded expenses and payroll/statutory inputs.
- **TAX-02 Completeness:** inspect evidence-pack completeness and deliberately leave one required item incomplete; the warning must be visible.
- **TAX-03 QRMP:** change/check QRMP filing-frequency display for the correct firm only.
- **TAX-04 Payable card:** confirm statutory payable figures against the current tax feed.
- **TAX-05 CA pack:** open the controlled CA-share pack route with dummy data; disabled policy must deny and enabled policy must require PIN/reauth/register entry.
- **TAX-06 Evidence ZIP:** generate/preview the evidence ZIP through the controlled route; verify no plaintext backup or unregistered delivery path.

### L. Festival and season planner

- **PLN-01 Create/edit/delete:** create a `UAT-2026-07-29` festival with name, dates, targets, notes, and blackout flag; edit and delete it.
- **PLN-02 Store targets:** enter separate Titan World/Helios targets and confirm display/persistence.
- **PLN-03 Actuals:** compare the planner's QMS-derived actuals with the relevant seeded queue records.
- **PLN-04 Checklist:** add, toggle, delete, and reopen checklist items; completion count must remain correct after relaunch.

### M. Reports, export, legal, and security paths

- **RPT-01 Report accuracy:** preview the stock, expense, leave, payroll, and weekly report views; reconcile a sampled total to the source module.
- **RPT-02 CSV/PDF parity:** compare visible rows/totals with the CSV/PDF preview; verify spreadsheet-safe CSV values.
- **SEC-01 Export default denial:** with exports disabled, each attempted output/share route is denied and registered as metadata only.
- **SEC-02 Approval path:** enable only in the test profile, verify Admin PIN + fresh re-auth + one-use approval + register entry; then disable again.
- **LEG-01 Rights and incident UI:** create a dummy rights/grievance request, identity evidence, hold decision, and incident record; ensure no real personal data is used.
- **SEC-03 Sensitive display:** on payroll/tax, verify screenshot/recording blocking where the device supports it; capture any gap as a device-security defect.

## Device script integration (run after the module pass)

The existing device script remains the authoritative acceptance checklist for these drills:

| Drill | Required result before it can be marked PASS |
|---|---|
| A - DAT-02 five-save | Five complete samples on each accepted device, at representative data volume: export p95 <=150 ms, frame-gap p95 <=250 ms, total p95 <=3000 ms, no ANR. |
| B - BKP-03 provider delivery | Enrol Drive/OneDrive folder, create ciphertext-only backup, verify binding, GFS behaviour, failure closure, and 36-hour escalation/recovery. |
| C - Cross-device restore | Wrong passphrase refused; correct portable restore previews/reconciles/applies; tamper is rejected; device-bound private snapshot refuses on the second device. |
| D - Legacy migration | Only where pre-encryption data exists: upgrade, confirm ciphertext/migration state, and verify sidecar cleanup. |

## Recommended execution order

1. Prepare two API-23-or-newer test devices and a dedicated Drive/OneDrive folder. Back up any real test-device data before destructive drills.
2. Install the seeded APK and run the Core, QMS, Service, DSR, Stock, Expense, Grooming, CRO, Payroll, Leave, Tax, Planning, and Reports/security cases above.
3. After every high-risk action, force-close/relaunch and record the persistence result. Stop on any P0/P1 defect rather than continuing with contaminated evidence.
4. Run Drills A through D from `DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` on both devices, using representative real/restored-real data for DAT-02.
5. Consolidate screenshots, exact timing values, provider evidence, control-total reconciliation, and defects in a dated execution log. Only then decide whether a correction wave is needed or whether release acceptance can proceed.

## Decision requested after this report

Authorise a controlled two-device test pass only if the following are available: the two nominated devices, an approved test provider folder/account, a 12+ character recovery passphrase, and either representative test data or approval to restore a real `.sccbak` onto the test device.

Until those inputs are available, the accurate result is: **package and automated evidence PASS; module/device acceptance NOT RUN.**
