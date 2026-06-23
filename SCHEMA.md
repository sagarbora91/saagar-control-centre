# Saagar Control Centre — Data Schema Reference (for the PHP rebuild)

**Status:** Documentation only. Nothing here changes app behaviour; it describes the
existing client-side data model so a PHP developer can map it to server tables.

**Primary source of truth for this document:** `www/demo-seed.js` — the demo seeder
constructs every module's data with the *exact* field names the modules read, so it is the
de-facto schema. Cross-checked against the 10 module files in `_extracted_modules/*.html`
and the cross-module `www/integration-bridge.js`.

All data today lives in the browser's **`localStorage`** (string keys → JSON string values),
plus one optional on-device archive file (`saagar_qms_archive.json`, written via Capacitor
Filesystem only in the 1-year build). There is no server. Each "key pattern" below becomes a
table (or set of rows) in PHP; the composite key segments become indexed columns.

---

## 0. Key-namespace conventions (read this first)

Three distinct naming conventions coexist. A PHP migration must recognise all three.

| Namespace | Prefix | Owning area | Notes |
|---|---|---|---|
| **A. Saagar shell / cross-module** | `saagar_*` | Shell + most modules + the bridge | The "house style". Masters, DSR, Stock, Grooming, Service, the event bus, gate status, and all bridge-derived feeds. |
| **B. Expense Manager (GM)** | `gm_*` (+ one `tanishq_*`) | Expense Manager only | This module predates the `saagar_*` convention and kept its own `gm_` prefix. Its cash-statement store is the legacy outlier `tanishq_statements`. |
| **C. Legacy module-native (versioned)** | module-specific, version-tagged | QMS, Payroll, Leave, Tax, CRO Audit | Each was an independent app folded into the suite, so each keeps its own single-blob key with a `_vN` / `_<year>` version tag baked into the key name. |

### Composite-key patterns (the keys that are NOT a single fixed string)

Five key patterns embed data in the key itself. In PHP these become **rows with indexed columns**, not one JSON blob.

| Key pattern | Segments embedded in the key | Example |
|---|---|---|
| `saagar_dsr_<date>_<StaffName>` | date (`YYYY-MM-DD`) + staff name with spaces → `_` | `saagar_dsr_2026-06-23_Lakshay_Verma` |
| `saagar_stock_<storeKey>_<date>` | store key (`titanworld`\|`helios`; legacy code `WLMHW`\|`HEMW`) + date | `saagar_stock_titanworld_2026-06-23` |
| `saagar_grooming_<date>` | date (`YYYY-MM-DD`) | `saagar_grooming_2026-06-23` |
| `saagar_bus` event ids | within-value: `<TYPE>:<idSuffix>` | `SALE_CLOSED:cust_ab12` |
| `tanishq_statements[<date>]` | date is an **object key inside** the value, not the LS key | value is `{ "2026-06-23": {…} }` |

> **DSR name-key warning:** the DSR key derives from the display name (`"Lakshay Verma"` →
> `Lakshay_Verma`). It is **not** the `employeeId`. Renaming an employee orphans their history.
> The PHP model should key DSR/attendance on a stable employee id and keep the name as a column.

> **Stock store-key warning:** the Stock module persists under the **internal** key
> (`titanworld`/`helios`), but older shell code referenced the store **code** (`WLMHW`/`HEMW`).
> The bridge maps `WLMHW→titanworld`, `HEMW→helios` (`integration-bridge.js`, `STORE_KEY_MAP`/`skey()`),
> and its `STOCK_RE` regex accepts all four spellings. The PHP store table needs both a code and an internal key.

---

## 1. Master / shared reference data  (namespace A: `saagar_*`, plus a few `gm_*` mirrors)

These are single-blob keys (one fixed key → one JSON value). They are the canonical reference
lists the bridge fans out to every module.

### `saagar_employee_master_v1`  — **the single source of truth for staff**
Owner: Shell (Settings → People). Bridge pushes it into QMS roster, DSR staff list, Leave staff.
Value: **array** of employee objects.

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Display name (e.g. `"Lakshay Verma"`). Used to derive DSR keys. |
| `gender` | `"M"`\|`"F"` | Drives grooming criteria set + PT slab. |
| `role` | string | `CRO` \| `Technician` \| `Cashier` \| `Store Manager` (also seen: Greeter, Assistant Technician, RSO/SM). |
| `firm` | string | Always `"Saagar Traders"` (single-firm model). |
| `store` | string | `"Titan World"` \| `"Helios"` (the branch the person works at). |
| `monthlySalary` | number | Gross monthly salary (₹). |
| `salaryType` | `"S"`\|`"B"` | `S` = structured (Basic/HRA/Washing split, PF applies); `B` = basic-only (no PF). |
| `employeeId` | string | `EMP001`… (stable id; **not** used in DSR key today). |
| `department` | string | `Sales` \| `Service` \| `Admin` (derived from role). |
| `bankName` / `accountNo` / `ifsc` | string | Salary bank details. |
| `active` | bool | Soft-delete flag; bridge keeps `active!==false`. |
| `joiningDate` | `YYYY-MM-DD` | |
| `phone` | string | |

### `saagar_org_master_v1`  — organisation / firm / branch / store master
Owner: Shell. Bridge "publishes" it into Payroll (`firmName`) and Tax (`firms`).
Value: object `{ firms[], branches[], stores[] }`.

- `firms[]`: `{ code, name, pan, gstin, address, active }` — single firm `SAT` / `"Saagar Traders"`.
- `branches[]`: `{ code (WLMHW|HEMW), name, firmCode, channel, region, rso, active }`.
- `stores[]`: `{ name, storeKey (titanworld|helios) }` — the name↔internal-key bridge for Stock.

### `saagar_master_brands`  — canonical brand master
Owner: Shell/bridge. Value: array of `{ name, store? }`. Stock unions this at read time.

### `saagar_brands`  — per-store brand lists (Stock-native)
Owner: Stock (`SK_BRANDS`). Value: object `{ titanworld: [names…], helios: [names…] }`.

### `saagar_cros`  — flat CRO-name list
Owner: Stock/shell (`SK_CROS`). Value: array of strings (CRO display names). Bridge rewrites it
from the employee master each cycle.

### `saagar_master_vendors`  +  `gm_vendors`  — vendor master (two mirrors)
`saagar_master_vendors` (canonical) and `gm_vendors` (Expense-native) are kept in sync by the
bridge. Value: array of `{ name, gstin }` (gstin may be `""`).

### `saagar_master_customers`  — harvested customer master
Owner: bridge (one-way harvest from QMS + Service). Value: array of `{ name, mobile }`.

### Shell scalar/state keys
| Key | Value | Meaning |
|---|---|---|
| `saagar_demo_seeded` | string | Seed guard. `"v2_6mo"` (light) / `"v3_1yr"` (big) when seeded; `"cleared"` after Factory Reset (blocks re-seed). |
| `saagar_owner_name` | string | Owner's name (`"Sagar"`). |
| `gm_role` | string | Active role (`"owner"`). Shared shell role (note the `gm_` prefix even though it's shell-wide). |
| `saagar_appstate` | object | Stock-module app state (`SK_STATE`); UI state, not business data. |

---

## 2. QMS — Queue Management  (namespace C: `retail_queue_management_v1`)

Owner: `qms.html` (`STORE_KEY='retail_queue_management_v1'`). **Version tag in key:** `_v1`.
Single blob. The 1-year build *splits* this: recent ≤90 days stay here (`customers`), older closed
walk-ins go to the archive file `saagar_qms_archive.json` (same customer shape).

Value object:

| Field | Type | Meaning |
|---|---|---|
| `settings` | object | Store config — see below. |
| `role` | string | `"SM"` (active role in module). |
| `cros[]` | array | `{ id (cro_N), name, code (CRO-0N), active }`. |
| `rotations[]` | array | Daily CRO rotation — see below. |
| `customers[]` | array | The walk-in / lead records — see below (the main table). |
| `followups[]` | array | Follow-up tasks — see below. |
| `audit[]` | array | `{ id, at (ISO), role, action, details }` ring buffer (≤600). |
| `lastBackup` | ISO\|null | Last manual backup time. |

**`settings`:** `storeName, queuePrefix ("Q"), waitAlertMins, autoAllocate, requireBillForPurchase,
requireJobForService, allowGreeterClose, smCanGiveNextOpportunity, lockEditsAfterEOD` (booleans/nums).

**`customers[]` row** (becomes the central QMS table):
| Field | Type | Meaning |
|---|---|---|
| `id` | string | `cust_<base36>` — referenced everywhere downstream as `sourceRef`/`cid`. |
| `queueNo` | string | `Q-001`… |
| `entryTime` / `exitTime` / `allocatedTime` / `closedAt` | ISO datetime | Lifecycle timestamps (`exitTime`/`closedAt` null while open). |
| `attendStart` | ISO | Set when status = `In Discussion`. |
| `name` / `mobile` | string | Customer. |
| `visitType` | `"Purchase"`\|`"Service"` | |
| `customerType` | `"New"`\|`"Repeat"` | |
| `source` | string | `"Walk-in"`. |
| `peopleCount` | number | |
| `priority` | string | `"Normal"`. |
| `status` | string | Open states: `New Entry`\|`Allocated`\|`In Discussion`\|`Awaiting Closure`; closed: `Closed`. |
| `assignedCroId` / `expectedCroId` | string | CRO ids (`cro_N`). |
| `closedBy` | string | `"SM"`. |
| `outcome` | string\|null | `Purchase`\|`Non Purchase`\|`Service` (null while open). **Drives the bus event type.** |
| `purchaseAmount` | number | (Purchase) ₹. |
| `billNo` | string | (Purchase) `INV-####`. |
| `purchaseCategory` | string | (Purchase) Watch\|Smart Watch\|Wall Clock\|Accessory. |
| `paymentMode` | string | (Purchase) Cash\|Card\|UPI\|Mixed. |
| `jobCardNo` / `serviceType` / `advance` | string/num | (Service) job card, type, advance ₹. |
| `lostReason` / `lostValue` | string/num | (Non-Purchase) reason + estimated lost ₹. |
| `notes` | string | |

**`rotations[]` row:** `{ id (rot_*), date, createdAt, createdBy ("SM"), status (Active|Closed),
currentCroId, priorityCroId, closedAt, items[], turnEvents[] }`; each `items[]` =
`{ croId, order, status ("Available"), active, addedAt }`.

**`followups[]` row:** `{ id (fu_*), customerId (→customers.id), queueNo, customerName, mobile,
croId, dueDate (YYYY-MM-DD), mode (Phone Call|WhatsApp|In Store|SMS), notes,
status (Pending|Done|Converted|Lost), createdAt, closedAt, closedBy }`.

---

## 3. DSR — Daily Staff Register  (namespace A, composite: `saagar_dsr_<date>_<StaffName>`)

Owner: `dsr.html` (`recKey = "saagar_dsr_" + date + "_" + name.replace(/\s+/g,'_')`).
**One LS key per (day × staff)** — this is the most row-like pattern in the app.
Plus an index list `saagar_dsr_staff` = array of staff display names that have a DSR.

Per-record value:
| Field | Type | Meaning |
|---|---|---|
| `date` | `YYYY-MM-DD` | |
| `staffName` | string | Display name (matches the key suffix, spaces restored). |
| `role` | string | `"cro"` (seed) / `"CRO"` (bridge). |
| `loginTime` / `submitTime` | `HH:MM:SS`\|null | submitTime null when not yet submitted. |
| `opening` / `closing` | object | Stock-at-counter snapshots (per-category; seed leaves `{}`). |
| `inout[]` | array | In/out movement log (seed: empty). |
| `sales[]` | array | Sales rows — see below (auto-filled by bridge from QMS). |
| `nonpurch[]` | array | Non-purchase rows: `{ customer, mobile, reason, source, sourceRef, _confirmed }`. |
| `visitors[]` | array | (bridge-added) allocated-but-open QMS leads to mark P/NP: `{ sourceRef, customer, mobile, queueNo, visit, product, outcome, source, at, _staffMarked? }`. |
| `tasks` | object | `{ cust, follow, disp, clean_floor, additional }` (counts/notes). |
| `marketing` | object | `{ calls, whatsapp, door, instore }` (counts). |
| `cleaning` | object | `{ cp1:{done,photo,time}, cp2:{done,photo,time} }`. |
| `submitted` | bool | Gate for the bridge to emit `DSR_SUBMITTED`. |
| `audit` | object\|null | SM audit `{ score, … }`. |
| `_bridgeCreated` | bool | Present if the bridge created the stub (vs. staff). |

**`sales[]` row:** `{ amount, billNo, product, customer, mobile, type ("sale"|"service"),
source ("qms"|manual), sourceRef (→QMS customer id, for de-dup), _confirmed }`. Manual counter
sales are added without `source`/`sourceRef`.

---

## 4. Stock — Store Stock Register  (namespace A, composite: `saagar_stock_<storeKey>_<date>`)

Owner: `stock.html` (`SK_PREFIX='saagar_stock_'`, `dataKey = SK_PREFIX + store + '_' + date`).
**One LS key per (store × day).** Store keys: `titanworld`, `helios` (legacy codes `WLMHW`/`HEMW`
map in via the bridge). Brand lists from `saagar_brands` / `saagar_master_brands`.

Per-record value:
| Field | Type | Meaning |
|---|---|---|
| `_v` | number | Record schema version (`2`). |
| `openingLocked` / `closingLocked` | bool | Lock flags (bridge emits `STOCK_LOCKED` when `closingLocked`). |
| `movementsSubmitted` | bool | |
| `opening` | object keyed by **brand** | Per-brand opening count — see below. |
| `movements` | object keyed by brand | `{ inward, outward, sales, grn }` (counts). |
| `closing` | object keyed by brand | Per-brand closing count — see below. |
| `_dsrRollup` | object | (bridge-added, informational) `{ openingTotal, closingTotal, cros[], source:"dsr", note, at }`. |

**`opening[<brand>]`:** `{ display, storage, defective, yLoc, systemStock, remarks, croName,
time (HH:MM), verified, countDone }`.
**`closing[<brand>]`:** same minus `systemStock` (`{ display, storage, defective, yLoc, remarks,
croName, time, verified, countDone }`). `display/storage/defective/yLoc` are physical bin counts;
`systemStock` is the system figure for variance.

---

## 5. Service — Watch Service Centre  (namespace A: `saagar_wsf_v2`)

Owner: `service.html` (`STORE_KEY='saagar_wsf_v2'`). **Version tag:** `_v2`. Single blob = **array**
of case objects. Bridge appends stub cases from QMS service leads.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `WS-<year>-NNN(N)` (seed) or `wsc_<cid>` (bridge stub). |
| `status` | `"open"`\|`"closed"` | |
| `prog` | number | Progress % (100 when closed). |
| `createdAt` / `closedAt` | ISO | |
| `dateRec` | `YYYY-MM-DD` | Date received. |
| `custName` / `custMobile` | string | |
| `brand` / `model` | string | |
| `advisor` / `techName` / `ackBy` | string | CRO advisor, technician, acknowledger. |
| `subTotal` / `gst` / `estTotal` | **string** | Money stored as strings (`"1200"`). |
| `lineItems[]` | array | `{ desc, qty, unit, total }` (all strings). |
| `delivery` | object | (closed) `{ finalAmt, payMode, delTechName, delCustSig }`. |
| `source` / `sourceRef` | string | `"qms"` + QMS customer id for bridge-created cases. |
| `_bridgeStub` | bool | Present on auto-created stubs (need intake completion). |

---

## 6. Expense Manager  (namespace B: `gm_*` + `tanishq_statements`)

Owner: `expense.html`. This module keeps the legacy `gm_` prefix and the outlier
`tanishq_statements`. Multiple single-blob keys (one per "tab").

| Key | Value shape | Meaning |
|---|---|---|
| `gm_expenses` | **array** of ledger rows (see below) | The income/expense ledger (the main table). |
| `tanishq_statements` | object keyed by **date** | Daily cash statements (date is the *inner* key). See below. |
| `gm_petty` | `{ float, history[] }` | Petty-cash float; `history[] = { at, by, add }`. |
| `gm_budgets` | object keyed by **`YYYY-MM`** | Per-month category budgets `{ Inventory, Rent, … }`. |
| `gm_tax_feed` | object keyed by **`YYYY-MM`** | Monthly tax feed `{ month, income, expense, net, gstRate, gstEstimate, byCategory, generatedAt, by }`. Bridge reads `gstEstimate`. |
| `gm_audit` | array | `{ id, at, by, action, detail }`. |
| `gm_settings` | object | `{ migratedV2, gstRate }`. |
| `gm_vendors` | array | `{ name, gstin }` (mirror of vendor master). |
| `gm_role` | string | Active role (shared with shell). |

**`gm_expenses[]` row:**
| Field | Type | Meaning |
|---|---|---|
| `id` | string | `e_<base36>`. |
| `type` | `"income"`\|`"expense"` | |
| `date` | `YYYY-MM-DD` | |
| `amount` | number | ₹. |
| `category` | string | Retail Sale, Inventory, Rent, Utilities, Marketing, Transport, Repairs, Miscellaneous. |
| `mode` | string | Cash\|Bank\|Card\|UPI. |
| `vendor` | string | (may be `""`). |
| `firm` | string | `"Saagar Traders"` / `"Helios by Saagar"`. |
| `description` / `notes` | string | |
| `billPhoto` | string\|null | data-URI of the bill image (used in missing-voucher check). |
| `source` / `sourceRef` | string\|null | `"petty"` for petty disbursements (+ a petty id). |
| `void` | bool | Soft-void flag. |
| `createdAt` / `createdBy` | ISO / string | |
| `editLog[]` | array | Edit history. |

**`tanishq_statements[<date>]` value:** `{ date, openingBalance, physDeno (denomination map
{2000:n,…}), bankDeno, closed, closedAt, closedBy, approved, approvedBy, approvedAt, reopenReason,
mismatchReason, monthLocked, filledBy, total }`. Bridge emits `CASH_CLOSED` when `closed`, and flags
`mismatchReason`.

---

## 7. Grooming  (namespace A, composite: `saagar_grooming_<date>`)

Owner: `grooming.html` (`'saagar_grooming_' + date`). **One LS key per audited day.**
Reads employee master + `saagar_gate_status`. Value = **array** of per-CRO results:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | CRO name. |
| `gender` | `"m"`\|`"f"` | Picks the 15-item criteria set. |
| `pct` | number | Pass % (`checked/total*100`). Bridge gate blocks floor if `< failPct` (default 60). |
| `checked` / `total` | number | Items passed / 15. |
| `date` | `YYYY-MM-DD` | |
| `time` | string | `"10:NN am"`. |
| `items[]` | array | `{ label, passed }` per checklist line. |

---

## 8. CRO Daily Audit  (namespace C: `cro_audits_v3` + `cro_s_v3`)

Owner: `cro_audit.html`. **Version tag:** `_v3`.

| Key | Value | Meaning |
|---|---|---|
| `cro_audits_v3` | **array** of audit records (see below) | The daily CRO score audits. |
| `cro_s_v3` | object `{ surveys, npsScore, rate, reviews, mktg }` | Module-level settings/targets. |

**`cro_audits_v3[]` row:** `{ id (a<epoch+seq>), date, store ("Helios, Latur"|"Titan World, Latur"),
cro, sm, total, grade (Outstanding|Good|Satisfactory|Below Exp.|Poor), tasks, submittedAt }`.
`tasks` = `t1..t10`, each `{ pts }` plus task-specific fields, e.g.:
- `t5`: `{ billsCount, npsCollected, responseRate, npsScore, pts }`
- `t6`: `{ reviewsCount, pts }`  · `t7`: `{ activityCount, pts }`  · `t9`: `{ groomingPct, pts }`.

Also consumes the bridge feed `saagar_cro_audit_feed` (read-only, see §11).

---

## 9. Payroll  (namespace C: `payroll_suite_v1_2026`)

Owner: `payroll.html` (`STORAGE_KEY="payroll_suite_v1_2026"`). **Version + year tag:** `_v1_2026`.
Single blob `{ meta, rows[], advances[], runs{}, nextId }`.

**`meta`:** `{ title, month, year, holidays, totalDaysOverride, preparedBy, checkedBy, approvedBy,
firmName, firmAddr, firmContact, signatory, rules, run }`.
- `rules`: `{ pt:{maleExempt,maleMid,maleMidAmt,stdAmt,febAmt,femaleExempt}, pf:{rateEE,rateER,wageCap},
  esic:{rateEE,rateER,wageCeiling} }` — statutory constants.
- `run`: `{ status (draft|approved), approvedBy, approvedAt, formulaVersion }`. Bridge's org-publish
  only overwrites `firmName` while `status==='draft'`.

**`rows[]` row** (one per employee for the month):
| Field group | Fields |
|---|---|
| Identity | `id, firm, empId (GMNNN), name, phone, designation, joiningDate, uan, esicIp, bankName, accountNo, ifsc, idProof, active` |
| Attendance inputs | `absent, halfDay, late, noThumb, leavesApplied, remarks, signature` |
| Salary inputs | `gross, salaryType (S|B), gender, pfApplicable, esicApplicable, salaryAmount, advance, salaryRemark` |
| **Computed outputs (persisted)** | `pf, esic, pt, net, grossPayable` — mirrored onto the row so read-side consumers (shell Reports, bridge `saagar_tax_payable`) get real numbers without recomputing. |

`advances[]`, `runs{}` empty in seed; `nextId` = next row id.

> The bridge reads `rows[].pf/esic/pt` to build statutory tax-payable (§11).

---

## 10. Leave & Tax  (namespace C: `leavedesk_v3`, `taxcal_v2`)

### `leavedesk_v3`  — LeaveDesk
Owner: `leave.html`. **Version:** `_v3` (migrates from `leavedesk_v2` if present).
Value: `{ employees[], leaves{}, agendas{} }`.
- `employees[]`: `{ id (emp_<slug>), name, empId, department }` (bridge seeds from master).
- `leaves`: object keyed by **date** → array of `{ id (lv_*), name, staffName, type (full_day|
  half_day_am|half_day_pm), category (Casual|Sick|Earned|Compensatory Off), reason, approvedBy,
  leaveFrom, leaveTo }`. Bridge emits `LEAVE_APPROVED` per entry → gate + attendance feed.
- `agendas`: `{}` (per-date agenda notes).

### `taxcal_v2`  — Tax / GST compliance calendar
Owner: `tax.html`. **Version:** `_v2`.
Value: `{ firms[], activeFirmId, fyStartYear, compliance{} }`.
- `firms[]`: `{ id (firm_1 | org_*), name, pan, gstin, entity, type (both|…), notes }`.
- `compliance`: `{ <firmId>: { <FY-year>: { <taskKey>: { done, dueDate, filedOn?, notes? } } } }`.
  Task keys seen: `gstr3b_prev, gstr1_ovd, gstr3b_wk, tds_wk, ptrc_mo, advtax_mo`. `dueDate` drives
  the overdue/due-this-week/due-this-month Reports.

---

## 11. Integration bridge — event bus + derived feeds  (namespace A, all `saagar_*`)

Owner: `integration-bridge.js`. These keys are **produced/consumed by the bridge**, not by a
single UI module — they are the cross-module audit trail and roll-ups. The header note states this
event-bus model is intended to migrate (not be rebuilt) into PHP, so it is the recommended backbone
of the server schema.

| Key | Value | Role |
|---|---|---|
| `saagar_bus` | array of events (cap 2000) | **The append-only event bus.** Each event: `{ id ("<TYPE>:<idSuffix>"), type, at (ISO), src, payload{}, consumed{<who>:true} }`. Event types: `GROOMING_RESULT, SALE_CLOSED, SERVICE_CLOSED, NONPURCHASE_CLOSED, QMS_ALLOCATED, LEAVE_APPROVED, DSR_SUBMITTED, STOCK_LOCKED, CASH_CLOSED, PAYROLL_MONTH`. |
| `saagar_bridge_log` | array (≤250) | Human-readable bridge log `{ at, m }`. |
| `saagar_gate_status` | object | Floor-clearance gate for *today*: `{ date, blocked[ {name,why} ], cleared[], unavailable{ <kk(name)>:{name,reason,leave,type} }, generatedAt }`. Read by QMS, DSR, Grooming, CRO Audit. |
| `saagar_bridge_qms2dsr` | object | De-dup tracker: `{ <qmsCustomerId>: { dsr, at, cro, kind } }`. |
| `saagar_payroll_attendance_feed` | object keyed by `YYYY-MM` | Derived attendance: `{ <name>: { present, leave, half, dsrDays, scoreSum, scoreN, avgScore } }` + `_generatedAt/_note`. Payroll maker reconciles before lock. |
| `saagar_cro_audit_feed` | object keyed by **date → kk(name)** | Derived CRO-audit inputs: `{ cro, date, groomingPct, qmsSales, qmsSalesAmt, qmsNonPurch, dsrSubmitted, dsrScore, dsrSalesCount?, dsrSalesAmt?, dsrNonPurch? }`. |
| `saagar_tax_payable` | object keyed by `YYYY-MM` | `{ month, pf, esic, pt, gstEstimate, sources[], at }` — PF/ESIC/PT summed from Payroll rows + GST from `gm_tax_feed`. |
| `saagar_exceptions` | object | Aggregated red-flag feed for *today*: `{ date, items[ {sev (high|med|low), area, msg, at} ], generatedAt }`. |
| `saagar_bridge_config` | object | `{ failPct, leaveGates, voucherThreshold }` (tunables; defaults 60 / true / 2000). |

**Bus id-suffix conventions** (the composite within each event id): grooming/leave/DSR use
`<date>:<kk(name)>`; SALE/SERVICE/NONPURCHASE/QMS_ALLOCATED use the QMS `customer.id`; stock uses
`<store>:<date>`; cash uses the date; payroll uses `<year>-<month>`.

> **On-device archive file (not localStorage):** `saagar_qms_archive.json` (Capacitor Filesystem,
> `DATA` dir, 1-year build only) — a JSON array of older closed QMS `customers[]` (same shape as §2).
> Written atomically via a `.tmp` + rename. In a plain browser (no Filesystem) these fold back into
> `retail_queue_management_v1.customers` instead.

---

## 12. Quick index — every key pattern → owning module

| Key pattern | Namespace | Owner | Shape |
|---|---|---|---|
| `saagar_employee_master_v1` | A | Shell | array |
| `saagar_org_master_v1` | A | Shell | object |
| `saagar_master_brands` / `saagar_brands` / `saagar_cros` | A | Shell/Stock | array / object / array |
| `saagar_master_vendors` / `saagar_master_customers` | A | bridge | array |
| `saagar_appstate` / `saagar_owner_name` / `saagar_demo_seeded` | A | Shell/Stock | object/string |
| `retail_queue_management_v1` | C | QMS | object |
| `saagar_dsr_<date>_<StaffName>` · `saagar_dsr_staff` | A | DSR | object · array |
| `saagar_stock_<storeKey>_<date>` | A | Stock | object |
| `saagar_wsf_v2` | A | Service | array |
| `gm_expenses` · `tanishq_statements` · `gm_petty` · `gm_budgets` · `gm_tax_feed` · `gm_audit` · `gm_settings` · `gm_vendors` · `gm_role` | B | Expense | mixed |
| `saagar_grooming_<date>` | A | Grooming | array |
| `cro_audits_v3` · `cro_s_v3` | C | CRO Audit | array · object |
| `payroll_suite_v1_2026` | C | Payroll | object |
| `leavedesk_v3` | C | Leave | object |
| `taxcal_v2` | C | Tax | object |
| `saagar_bus` · `saagar_bridge_log` · `saagar_gate_status` · `saagar_bridge_qms2dsr` · `saagar_payroll_attendance_feed` · `saagar_cro_audit_feed` · `saagar_tax_payable` · `saagar_exceptions` · `saagar_bridge_config` | A | Integration bridge | mixed |
| `saagar_qms_archive.json` (file, not LS) | A | QMS/seed | array |

---

### Migration notes for the PHP developer
1. **Composite keys → tables with indexed columns.** `saagar_dsr_*`, `saagar_stock_*`,
   `saagar_grooming_*`, and the date/`YYYY-MM`-keyed objects inside `tanishq_statements`,
   `gm_budgets`, `gm_tax_feed`, `taxcal_v2.compliance`, the attendance feed, etc. all become rows.
2. **Stable ids over names.** DSR keys and most bus suffixes use the display *name*; the server
   should key on `employeeId` and keep name as a mutable column (see warnings in §0).
3. **Two store identities.** Persist both the branch code (`WLMHW`/`HEMW`) and the internal store
   key (`titanworld`/`helios`); the bridge map is the contract.
4. **Money types are inconsistent.** Expense/Payroll/QMS use numbers; **Service stores money as
   strings**. Normalise to a decimal column on import.
5. **The event bus is the intended server backbone** — model `saagar_bus` (events + per-consumer
   idempotency) plus the derived feeds (`saagar_*_feed`, `saagar_tax_payable`, `saagar_exceptions`,
   `saagar_gate_status`) as first-class server constructs rather than reverse-engineering pairwise links.
