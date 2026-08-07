# Saagar Control Centre — V6 Improvement Road Plan

> **Phase-structure update (2026-08-04):** D6-D12, modular migration, E1-E6,
> and final acceptance are now grouped into three owner-facing phases under
> `docs/SAAGAR-MINIMUM-PHASE-CONSOLIDATED-STRATEGY-2026-08-04.md`. The package
> descriptions below remain the detailed scope catalogue.

> **C1 status update (2026-08-04):** D5 is pushed at `c04bc98`. D6-D12
> non-ETP engineering and the full eleven-module external-file migration are
> complete in the intentionally uncommitted C1 working tree. D7 incentive,
> ETP-derived D10 metrics, owner review, and all formal acceptance remain open.
> Current evidence:
> `verification/C1-CONSOLIDATED-ENGINEERING-CHECKPOINT-2026-08-04.md`.

**Prepared:** 2026-07-29 (Asia/Kolkata)
**Baseline:** build 2.9 / versionCode 209, `origin/main = 49d531b`, 54/54 offline tests green. R0 (all four waves) + R1 legal minimum shipped.
**Supersedes:** `docs/Deepen the Android app.md` (now a pointer to this file).
**Companion sources:**
- `verification/MODULE-FUNCTIONALITY-IMPROVEMENT-INVENTORY-2026-07-29.md` (D-series source)
- `V:\Co work\Titan\audit-program-designer\Saagar_ETP_Service_Report_Master.md` (E-series source — report schemas, dictionaries, reconciliation rules)
- `Developer Documentation\Saagar_Control_Centre_Master_Software_Blueprint_v2.9_2026-07-29.docx` (cross-check reference; consulted chapter-by-chapter at each design gate, not ingested wholesale)
**Status:** DRAFT for owner approval, wave by wave. Nothing here is authorised scope until approved.

---

## 1. Programme structure

Three series, one delivery discipline:

| Series | Theme | Source of scope |
|---|---|---|
| **D** — Deepen | Faster daily work, better exceptions, manager clarity in the existing 11 modules | Improvement inventory |
| **E** — ETP verification layer | Import ETP truth, verify declarations, computed DSR, targets, incentive, anti-gaming monitoring | ETP master doc + owner functional spec |
| **F** — New functionality | Curated backlog of net-new capability (controls, compliance, intelligence) | This plan §6; ranked before any build |

The E-series is the centre of gravity: it changes the premises of DSR and CRO work, so old D4/D10 scopes are folded into it.

## 2. Non-negotiable ground rules

Carried forward from the Deepen plan, plus ETP-specific rules:

1. **No storage-engine change** until DAT-02 device evidence exists. Improvements use existing store APIs.
2. **ETP facts live in a SEPARATE sealed store** (`etp` store, own file, own persist cycle, written only at import commit). The operational `bcc.sqlite` never carries the fact snapshot. Only non-re-derivable state (declarations, reconciliation states, dispositions, attribution audit, target versions, allocations, incentive/clawback records, tender mapping, import-batch log) lives in the main DB.
3. **STORAGE_RULES split is explicit:** the non-re-derivable keys above are registered in backup/restore; the ETP fact snapshot is *deliberately excluded* (re-derivable from re-import) and this exclusion is documented and test-asserted — never silently forgotten (the V6 Wave-11 lesson).
4. **PII whitelist at the parser.** Each parser keeps only the columns its metrics need (invoice no, dates, CRO code, brand/variant, qty, values, tender split, doc type). Customer names/mobiles/PII columns are dropped at parse time, before any write. Import must never bypass the R1 field register's unknown-field rejection.
5. **Import commit is staged-write + atomic swap**, never delete-then-insert in place. A crash mid-commit must leave the previous snapshot intact.
6. **Signs are assigned from TRANS_TYPE** (INV/SR/BC), never trusted from the source value; raw values retained. Net = INV − SR − BC at the same grain. ISSUED CREDITNOTE never double-counted against CREDITNOTE REDEEM.
7. **"Verified through" = the batch's declared period-end** (store-close date asserted at upload, sanity-checked against file content) — never max invoice date, so zero-sale days don't freeze the banner or false-block incentive.
8. **Refusal to display:** achievement shows `—` when any day in scope is unimported; incentive computation hard-blocked on incomplete periods; FY 2024-25 comparisons before 16/09/2024 labelled partial; restated closed periods raise an alert **and feed the clawback generator** (alert and control are wired together).
9. **The identity `store net sale = Σ CRO achievement + Unassigned` is displayed AND is a permanent offline test**, per store.
10. **Both stores are first-class.** Helios (`HEMW`) has equivalent ETP exports (owner-confirmed 2026-07-29). All batches are keyed (store, FY); detection/validation/commit/reconciliation run per store; cross-store isolation is a standing test. E1 prerequisite: obtain one real sample export set per store and verify header signatures match before freezing them.
11. **Money paths ship last and enter the golden suite.** Incentive (E5) gets golden-case tests like payroll: band boundaries, blocker-on-gap, clawback-on-restatement, the Σ identity.
12. Export control, legal notices, blob pipeline, micro-incremental waves, test-as-we-improve wave openings, offline-only — all unchanged from the Deepen plan. The suite only grows; 54 green is the floor.

## 3. E-series — ETP verification layer (both stores)

Each wave: design note (cross-checked against the Blueprint chapter for the touched module) → build → offline tests → seeded APK → focused device cases → owner demo.

### E1 — Import layer *(no behavior change to any existing module)*
- Report-type detection by **header signature** (not filename) for R022 / R025 / R013 / R003; unknown header, unknown store code, or implausible dates → file rejected, nothing written.
- Bundled offline XLSX parser (SheetJS-class); cells parsed as text; IDs preserved as TEXT with re-padding logic if ETP has already coerced leading zeros (verify against real exports first).
- Four parsers with per-report column whitelists (rule 4); normaliser (YYYYMMDD→ISO, FY derived from invoice date — never INVOICEYEAR; INVOICEDATE is the business day — never STORETIMESTAMP).
- Validator with fatal-vs-warning outcomes; **cross-validation gate: R022 invoice totals must equal R025 line totals for the period, else the batch is refused** (the single most valuable gate).
- Pre-commit summary (rows, period, net value, exceptions) shown to the manager before commit.
- FY snapshot replace per (store, FY) via atomic swap into the separate sealed store.
- `import_batch` log: file, SHA-256, rows, period, user, timestamp, outcome.
- `dim_payment_type` maintenance screen; unmapped tenders display as "Unmapped", never folded into Others.
- **Acceptance test:** import the real historical archive (TITAN ALL REPORT.zip era files) as historical batches — this also backloads LY data for E2's comparisons.

### E2 — DSR computed views *(read-only; instant daily value; builds trust before it judges anyone)*
- Day / MTD / YTD views with LY same-period; metrics: net sale, bills, units, ATV, UPT, ASP.
- Brand mix, CRO mix, tender mix, returns %, manual discount visibility.
- Staleness banner: "Verified through DD/MM/YYYY · N days pending."
- Per-store, with honest coverage labels (rule 8/10).
- Home "Today" view (D1) gains an ETP verified-through tile.

### E3 — CRO reconciliation
- Invoice-grain declaration entry (replaces daily lump-sum).
- Day state machine: OPEN → CLOSED → IMPORTED → RECONCILED/VARIANCE → LOCKED.
- Matcher producing Matched / Misattributed / Unclaimed / Phantom. Grain rule: invoice-grain facts derive from R022; R013 supplies the CRO attribution (aggregated item→invoice); one documented source of CRO-per-invoice.
- Unassigned queue with 24-hour freeze (owner-only thereafter); attribution-change audit log with approval + reason codes; attribution locked once day is LOCKED.
- Variance disposition queue for the manager; auto-reconcile days that tie.

### E4 — Planning and targets
- Store target versioning (Titan doc ref, date received, version N+1 on revision; version 1 never edited).
- CRO allocation with day-0 lock; re-allocation only on a new Titan target version; Σ CRO vs store target with explicit stretch %.
- Day-weight curve from LY daily actuals with festive-calendar override, stored per plan version.
- Leave pro-rating for individual targets with "Coverage shortfall" as a named line (integrates with the Leave module).
- CRO screen: month target, MTD pace target, MTD verified actual, gap in ₹, required run-rate, projected landing.
- Achievement is a computed view, never stored.

### E5 — Incentive *(money — last, golden-tested)*
- Versioned scheme band table (from %, to %, basis, rate).
- Provisional compute at month close; final at close + 15 days (hold-back window).
- Computed from ETP only — declarations are never a payment basis.
- Hard blocker when any day in the period is unimported (per rule 7's verified-zero distinction).
- Clawback record generator (fed by the restated-period alert); no silent reversal.
- **Bridge to Payroll:** finalised incentive feeds the payroll module as a controlled earning line (pre-lock checklist item), never manual re-entry.

### E6 — Exception monitoring
- Attribution changes in last 5 days / post-close; unassigned % trend.
- CROs within ±5% of target in the final week; sale concentration in the final 48 hours.
- Bills dated 1st–3rd vs prior-month goods movement; declared-vs-actual variance trend by CRO.
- Surfaced on the owner/manager Home view with owner, age, and closure state.

### E7 — Service-centre ETP verification *(optional extension, after E1–E6 prove the pattern)*
- Same import pattern for service exports (S003 Revenue, S004 Tender Detailed; repair/TAT/pending snapshots).
- Service revenue vs tender reconciliation, TAT and pending-ageing views, purchase created-vs-received gap tracking.

## 4. D-series — module deepening (restructured)

Unchanged in intent from the Deepen plan; D4/D10 scopes adjusted for the E-series. Each wave still opens with its module's test-catalogue pass (test-as-we-improve).

Since 2026-08-04 each D-wave also carries the **modular extraction of the module
it touches** (see §4b). The "Module" column below is therefore load-bearing, not
descriptive.

| Wave | Module | Status | Scope | Notes |
|---|---|---|---|---|
| **D1** | *shell* | ✅ shipped `4177701` | Home "Today" view, unmissable store context, reauth explanations, backup health | Later gains ETP tile (E2) and exception feed (E6) |
| **D2** | qms | ✅ shipped `4177701` | QMS fast arrive→outcome, follow-up priority, duplicate suggestion, reason codes | **Not extracted** — see §4b orphans |
| **D3** | service | ✅ shipped `4177701` | Service workboard, pickup-readiness checklist, customer-visible status, exception list | **Not extracted** — see §4b orphans |
| **D4** | dsr | ✅ shipped `9b54a44` | DSR completion meter, data-quality prompts, no-sales acknowledgement | **Not extracted** — see §4b orphans |
| **D5** | stock | contract drafted `594aa83` | Stock variance triage, drill-down, guided stock↔DSR↔QMS reconciliation | **Carries M1, the first extraction.** Reconciliation gains ETP-verified sales units after E2 |
| **D6** | expense | not started | Cash health card, recurring-expense review, tax-ready gate, Udhaar ageing | Unchanged |
| **D7** | payroll | not started | Payroll pre-lock checklist, MoM variance, redaction-safe preview, separation workflow | Gains the E5 incentive earning line |
| **D8** | leave | not started | Leave coverage-at-request, alternatives, manager calendar, reminders | Feeds E4 leave pro-rating |
| **D9** | tax | not started | Tax filing-readiness timeline, reason codes, pre-export completeness, share history | Unchanged |
| **D10** | grooming + cro_audit | not started | Grooming coaching + CRO coaching dashboard | **Two modules in one wave** |
| **D11** | planning | not started | Festival planner forecast-vs-actual, templates, owned checklist, learning notes | Links to E4 festive-calendar override |
| **D12** | *shell* | not started | Reports polish, cross-module traceability, backup-health guidance, defect sweep | Closure wave |

## 4b. Modular extraction — coverage and the orphan gap

**Owner decision 2026-08-04: incremental variant.** Rather than a separate
big-bang migration stage, each D-wave extracts the module it touches from the
base64 `MODULES` payload into real files under `www/modules/<id>/`. Full plan:
`docs/MODULAR-HTML-MIGRATION-STRATEGY-2026-08-04.md`.

There are **11 modules** and the remaining waves cover only **8** of them:

- **Covered by D5–D11:** stock, expense, payroll, leave, tax, grooming,
  cro_audit, planning.
- **Orphans — no future wave to ride on:** **qms, service, dsr**. They shipped as
  D2/D3/D4 *before* the incremental decision, so nothing later touches them.

This matters more than it looks. **`scripts/apply-d2-qms.mjs`,
`apply-d3-service.mjs` and `apply-d4-dsr.mjs` exist for exactly those three
modules.** While they survive, the whole base64-patcher fragility class stays
alive for the rest of the programme.

**Recommended:** a dedicated **M1-catchup** phase for qms/service/dsr immediately
after D5 proves the extraction works on one module. All three patchers can then
be deleted (strategy M5), and D6–D12 run entirely on real files with no patcher
machinery at all.

The alternative — folding the orphans into D12 — keeps the patchers alive for
seven more waves and is not recommended.

## 5. Sequence

> **SUPERSEDED 2026-08-04.** The original plan interleaved the E-series early:
> `D1 → E1…E6 → D2…D12 → F`. The owner has since set a different order — finish
> the D-series and the migration first, then ETP, then PHP — and selected the
> incremental migration variant. The live sequence is below.

```
[done]  D1 → D2 → D3 → D4
        ↓
Stage A M0 harness → D5 (+M1 stock) → M1-catchup (qms, service, dsr) + retire patchers
        → D6 → D7 → D8 → D9 → D10 → D11 → D12
        → M2 shared assets → M4 shell slimming → M6 guard rails
        ↓
Stage C device acceptance + error fixing   (Phase 0's 69 cases + 4 drills + 9 gates, plus per-wave cases)
        ↓
Stage E E1 → E2 → E3 → E4 → E5 → E6 [→ E7 optional]
        ↓
Stage F PHP platform / Track B
```

- **M3 (split module internals) is folded into each D-wave**, not run as a
  separate pass — the wave is already editing that module.
- **M5 (retire the patchers) lands with M1-catchup**, not at the end; that is the
  whole reason to do the catchup early (§4b).
- The four pending device drills (`verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`)
  need owner time and two devices, not engineering, and can run in parallel with
  Stage A once the nominations form arrives.
- **E1's separate-store design remains insurance for DAT-02:** if the five-save
  gate fails on device, the ETP layer is unaffected.
- Each wave bumps versionCode, ships a debug APK verified by unpacking, and runs
  its focused device cases before the next starts.

### Phase count

| Stage | Phases | Detail |
|---|---|---|
| **A** — build + incremental migration | **13** | M0 · D5 · M1-catchup+M5 · D6–D12 (7) · M2 · M4 · M6 |
| **C** — device acceptance and fixes | **1** | Large but owner-time bound, not engineering bound |
| **E** — ETP verification layer | **6–7** | E1–E6, plus optional E7 |
| **F** — PHP platform | unscoped | Deferred; needs fresh owner direction |
| | **≈20–21** | to the end of ETP, excluding PHP |

Four waves (D1–D4) are already complete, so the programme is roughly **4 done,
20 remaining** before PHP.

## 6. F-series — new functionality candidate backlog

Curated from the ETP master's blind-spot register (§13–14), the app's data, and the business. **Not authorised scope.** Rank by daily frequency × business impact × risk-if-wrong × effort after the E-series lands; every selected item needs a named business owner, success measure, backup/export/legal review, and module test cases.

### Money controls
- **F1 Banking & deposit reconciliation** — daily deposit register vs collections vs banked; the ETP data shows ~₹96.6L open/unbanked, the single largest control gap in the business.
- **F2 Manual-discount approval workflow** — pre-approval + register for manual/user discounts (₹8.76L with no system approver field).
- **F3 Liability registers** — advance, credit note, gift card liabilities with monthly close (ETP advance reports are header-only; the app becomes the register).
- **F4 Cash-variance investigation workflow** — named owner, cause, evidence, closure for every till variance (extends D6's cash card).

### Compliance
- **F5 PAN/Form-60 register** — KYC capture gate for bills ≥ ₹2 lakh, prompted at QMS/billing time.
- **F6 GST outward split check** — CGST vs SGST/UTGST mismatch alert computed from ETP import (known live discrepancy).
- **F7 Compliance calendar** — licence renewals, CCTV log, monthly attestations with reminders.

### Customer & revenue
- **F8 Footfall & conversion** — manual door-count/enquiry log; conversion % against QMS entries; the metric ETP cannot give.
- **F9 Loyalty capture improvement** — Encircle enrolment-rate target and blank-contact chase list (~1,116 contacts blank).
- **F10 Warranty & service reminder outreach** — consent-gated, controlled-route reminders: battery due, service due, warranty expiry from sales history.

### Operational intelligence
- **F11 Dead-stock & ageing** — closing-stock snapshots over time → ageing buckets, sell-through by brand/cluster, transfer/liquidation suggestions.
- **F12 Purchase pipeline tracker** — created-not-received gap with ageing and vouching state (the 14-document/₹29k class, both arms).
- **F13 Staff scorecard** — DSR + grooming + CRO + leave discipline in one monthly view; feeds appraisals; reads only verified data.
- **F14 Titan ledger completeness audit mode** — owner uploads ledger export; GRN matching and missing-invoice list in-app (93.88% matched today; makes the audit repeatable).

### Service centre
- **F15 Custody & consent completion** — full customer-property intake/handover with condition photos and estimate-consent capture (closes the master doc's blank-field gaps: WatchCondition, ReasonForPending).
- *(E7 — service ETP verification — sits here if not taken as an E-wave.)*

## 7. Blueprint cross-check protocol

At each wave's design gate, the relevant chapter(s) of `Saagar_Control_Centre_Master_Software_Blueprint_v2.9_2026-07-29.docx` are read and reconciled: screen inventory, field definitions, and control statements for the touched module. Deviations are recorded in the wave's design note. The blueprint is not ingested wholesale; it is consulted per-module, and any blueprint statement contradicted by shipped code is flagged to the owner rather than silently overridden.

## 8. Deliberately outside this plan

- Multi-device live sync, remote revocation, server audit, conflict resolution → Track B (deferred; fresh owner direction required).
- Cloud messaging delivery status; closed-app OS background scheduler → separate authority.
- Storage architecture / bulk refactors → blocked until DAT-02 device evidence.
- New legal policy claims → owner/counsel path only.
- Production signing, device drills, staff UAT, incident rehearsal → HANDOFF acceptance gates; run in parallel, not satisfied by anything here.

## 9. Decision requested

1. Approve **D1** (Home "Today" view) as the first build wave.
2. Approve **E1** (import layer) as the second, with its prerequisite: one real sample export set from **each** store (WLMHW and HEMW) to freeze header signatures and verify ID/leading-zero handling.
3. Confirm the incentive scheme band table source (Titan scheme document or owner-defined) ahead of E5.
