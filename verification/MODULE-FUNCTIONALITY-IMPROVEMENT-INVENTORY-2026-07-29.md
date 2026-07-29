# Saagar Control Centre - Module Functionality and Improvement Inventory

**Prepared:** 2026-07-29 (Asia/Kolkata)  
**Purpose:** a working inventory of what the seeded Android app already does and the best improvement directions after module-wise testing. It is a prioritisation aid, not an approved build scope.

## How to use this list

1. Test the current function first using the seeded APK and the module-wise test report.
2. Log defects before proposing new features; a correct, fast daily workflow is worth more than a larger feature list.
3. Rank each requested improvement by daily frequency, business impact, risk if wrong, and effort.
4. Keep Android improvements small, offline-safe, and protected by the existing backup/export/legal controls. PHP/Track B work remains deferred unless the owner reauthorises it.

## Product-wide functions

| Area | Current functionality | Improvement direction |
|---|---|---|
| Home and shell | Role-aware entry, attention centre, text-size/language settings, module navigation, reports, diagnostics. | Give each role a clear "today" view: due follow-ups, open service jobs, cash/stock exceptions, leave gaps, tax due items, and backup health. |
| Identity and approvals | Named access, PIN/reauthentication, app lock, lockout, sensitive-action gates, access logging. | Reduce friction without weakening control: explain why a reauth is needed, show session/approval state, and make recovery from a cancelled approval obvious. |
| Two-store operation | Titan World (`WLMHW`) and Helios (`HEMW`) are represented in seeded data and store-aware functions. | Make store context impossible to miss in every entry, report, and exception; add clear cross-store comparison only where it is meaningful. |
| Storage and continuity | Encrypted local storage, private backups, portable encrypted backups, restore validation/rollback, failure escalation. | Add guided health checks and operator-friendly recovery instructions; do not change the storage engine until DAT-02 device evidence is complete. |
| Reports and sharing | PDF/CSV outputs, controlled export/WhatsApp/share routes, metadata-only export register. | Make report selection, filters, and "why export is blocked" clearer; preserve owner approval and never add a bypass. |
| Legal and privacy | Intake notices, consent/suppression, rights/grievance register, minor rule, breach/disclosure controls. | Make staff prompts shorter and clearer, add completion/status indicators, and only change policy wording after owner/counsel review. |

## Module inventory

### 1. QMS / customer queue

**Current functionality**

- Queue and walk-in capture, including a valid no-mobile path.
- Customer recognition across QMS and Service intake.
- Follow-up pipeline, conversion/recovered-value view, lost-walk-in view, and birthday/anniversary outreach list.
- Separated promotional consent and operational communication, with suppression/STOP controls.

**Improvement candidates**

- One fast "arrive to outcome" screen that reduces duplicate entry while retaining the notice and consent steps.
- Follow-up priority based on due date, expected value, last contact, and owner/CRO assignment.
- Duplicate-customer suggestion for operator review only; do not auto-merge customer records on Android.
- Clearer reason codes for lost opportunities and conversion outcome, so management can improve the sales process.

### 2. Service centre

**Current functionality**

- Service-order intake, repeat-customer recognition, item/custody details, photo/evidence handling, and legal notice.
- Stage workflow, stage history, turnaround-time visibility, ready-for-pickup notification route, and collected-revenue figures.
- Invoice/receipt/report output through the controlled delivery layer.

**Improvement candidates**

- A visual workboard for received, estimate waiting, repair, ready, and pickup overdue jobs.
- Mandatory readiness checklist before moving a job to pickup: item condition, payment, promised date, and customer notification status.
- Customer-visible status wording that staff can read or copy without exposing internal notes.
- Exception list for overdue jobs, repeated repairs, missing photos, and uncollected completed jobs.

### 3. Daily Staff Register (DSR)

**Current functionality**

- Staff day records, manual sales, customer mobile/payment mode, non-purchase outcome, and daily summary.
- Follow-up hand-off, end-of-day WhatsApp summary route, and manager unlock-for-correction with an audit trail.

**Improvement candidates**

- Faster two-step entry for the common sale/non-purchase flows.
- A live completion meter showing missing mandatory fields before end of day.
- A clearer correction request queue showing who requested, why, who approved, and what changed.
- Data-quality prompts for unusually high/low amounts, missing payment mode, and incomplete customer outcome.

### 4. Stock register

**Current functionality**

- Opening/movement/closing capture, submit/lock/reopen stamps, theft remark and manager-verification gate.
- Store/brand variance and shrinkage reporting, DSR/QMS sales-unit cross-check, and exception generation.

**Improvement candidates**

- Faster stock movement entry with sensible reason-code picklists and last-entry reuse.
- A daily variance triage view: expected cause, owner, next action, and closure evidence.
- Store/brand drill-down that moves from total variance to the affected item or group without losing the original day context.
- Guided reconciliation between stock, DSR, and QMS before close/lock.

### 5. Expense, petty cash, and credit ledger

**Current functionality**

- Expense lifecycle, recurring templates, budgets and alerts, vendor/GST capture, month lock/override, petty cash, and Udhaar/receivable settlement.
- Financial and GST feed inputs protected by approval and export controls.

**Improvement candidates**

- A daily cash health card: opening, receipts, payments, expected closing, physical closing, and variance explanation.
- Better recurring-expense reminder and review flow so monthly costs are confirmed rather than silently copied.
- Receipt/evidence completeness status before an expense can be marked ready for tax reporting.
- Aged receivables list with next action, owner, promised date, and partial-settlement history.

### 6. Grooming

**Current functionality**

- Gender-appropriate checklist, score/count, store-aware views, most-failed parameters, and checker accountability.

**Improvement candidates**

- A simple daily coaching action from the top failed parameter, rather than only showing a score.
- Role/store heatmap for recurring non-compliance and recognition for sustained improvement.
- Reminder cadence for missed audits, with a manager review queue instead of silent gaps.
- Short, clear staff-facing explanation of each standard where it is commonly misunderstood.

### 7. CRO audit

**Current functionality**

- Daily CRO audit, QMS bill/invoice auto-fill, per-store targets, audit-pending exception, and summary views.

**Improvement candidates**

- A CRO action dashboard: target vs actual, audit due, follow-ups due, and coaching priority in one place.
- Transparent score breakdown so a CRO knows the exact action needed to improve.
- A weekly manager view of store vs CRO variance, avoiding a ranking-only screen.
- Alert when a target is at risk early enough to change the day, not only after close.

### 8. Payroll and statutory records

**Current functionality**

- Payroll calculation, professional tax, leave reconciliation, lock/action controls, statutory totals, ECR/ESIC CSV/PDF output, and Full & Final settlement.

**Improvement candidates**

- A payroll-run checklist that prevents lock until attendance, leave, bank/statutory data, and exception review are complete.
- Month-on-month variance explanation for gross pay, deductions, employer cost, and headcount changes.
- Clearer payslip/settlement preview before authorised export, with redaction-safe support view.
- Separation workflow that connects final settlement, access removal, leave balance, and employee privacy acknowledgement.

### 9. Leave calendar and capacity

**Current functionality**

- Leave application and approval, weighted/half-day and weekly-off calculation, per-store capacity, staffing strip, blackout/holiday controls, and register output.

**Improvement candidates**

- Show coverage impact at the moment a leave request is made, not only after approval.
- Offer alternatives when capacity is breached: another date, half-day, or manager review.
- A manager calendar that combines leave, blackout dates, festival periods, and expected sales pressure.
- Clear outstanding-approval and expiring-request reminders.

### 10. Tax and evidence pack

**Current functionality**

- GST/tax feed, evidence completeness, CA pack, controlled evidence ZIP, QRMP flag, and statutory payable card.

**Improvement candidates**

- A filing-readiness timeline with due date, owner, missing evidence, and CA hand-off state.
- Reconciliation reason codes for differences between expense, payroll, tax feed, and CA evidence.
- Pre-export completeness check that explains exactly what is missing before a CA pack can be requested.
- Secure, controlled share history visible to the owner without exposing content in the register.

### 11. Festival and season planner

**Current functionality**

- Festival/season records, dates, store-specific targets, blackout flag, notes, prep checklist, and QMS-derived actuals.

**Improvement candidates**

- Forecast vs actual view by store, day, and festival stage.
- Planning templates for Dhanteras, Diwali, Akshaya Tritiya, Raksha Bandhan, wedding season, and Gudi Padwa.
- Link prep checklist items to an accountable owner and due date.
- A post-event learning note: what worked, what did not, and what target/stock/people change is needed next time.

## Cross-module improvement themes

| Theme | Improvement goal |
|---|---|
| Faster daily work | Common actions should take fewer taps and retain store/date context. |
| Better exceptions | Move from raw reports to a clear owner, reason, due date, and closure state. |
| Data quality | Validate missing/implausible inputs before they damage reports or reconciliation. |
| Better hand-offs | Make QMS -> Service -> DSR -> Stock -> Expense/Tax links understandable and traceable. |
| Management clarity | Show actionable status, not just totals: what requires attention today and why. |
| Safer output | Keep every export/share route behind existing owner approval, reauth, and metadata-only register controls. |
| Recovery confidence | Make backup health, restore readiness, and device status understandable to a non-technical owner. |

## Improvement priority rules

1. **Fix first:** crash, lost/duplicated data, wrong financial total, broken access control, restore failure, or export bypass.
2. **Then reduce daily effort:** frequent tasks that staff repeat many times per day (QMS, service status, DSR, stock, expense).
3. **Then improve decisions:** exception ownership, daily management dashboard, reconciliation visibility, and planning insights.
4. **Only then add new functions:** new capability must have a named business owner, success measure, backup/export/legal review, and a module-level test case.

## Items deliberately outside the current Android improvement scope

- Multi-device live sync, authoritative remote user revocation, immutable server audit, and conflict resolution.
- Cloud messaging delivery status or a closed-app operating-system backup scheduler.
- Structural data-platform changes or bulk refactors of storage architecture.
- New legal policy claims before owner/counsel approval.

These belong to the deferred PHP/Track B programme or require separate authority. They should not be hidden inside a small Android improvement request.

## Suggested first improvement cycle after testing

1. Resolve every P0/P1 defect found in the seeded module pass.
2. Select one high-frequency front-desk improvement (QMS or Service), one financial-control improvement (DSR, Stock, or Expense), and one manager-visibility improvement (Home/Exceptions).
3. Define the before/after measure for each: taps/time, error rate, missed follow-ups, variance closure time, or report completion.
4. Implement one module owner at a time, run its regression tests, build a seeded APK, and repeat its focused device cases before moving to the next module.
