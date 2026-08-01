# Saagar Control Centre — Full Audit FINDINGS (Phase 1)

**Baseline:** `origin/main = 850ed72` (Waves 1–3). **Session:** 2026-07-03. **Scope:** layout · bugs · security. English-only.
**Method:** 31 read-only static agents (12 layout + 14 bug + 5 security) over the 11 extracted module blobs + shell +
integration-bridge + saagar-report + auto-backup, PLUS a live browser layout sweep of the seeded app (366 days) across
4 width/mode combos (360×Mobile, 412×Mobile, 1280×Desktop, 360×Desktop). Read-only — no app files were modified.

## Totals — 204 findings

| Lane      | P0 | P1 | P2 | P3 | Total |
|-----------|----|----|----|----|-------|
| Layout    | 0  | 11 | 43 | 45 | 99    |
| Bugs      | 3  | 21 | 38 | 19 | 81    |
| Security  | 2  | 10 | 7  | 5  | 24    |
| **Total** | **5** | **42** | **88** | **69** | **204** |

Per-finding detail lives in `docs/audit/{layout,bugs,security}/<agent-key>.md`; machine-readable in `_agg_findings.json`.
Live browser evidence in `layout/_live-sweep.md`; static-vs-live reconciliation in `layout/_static-verification.md`;
the `prompt()` gate bug in `bugs/_live-prompt-gate.md`.

**Headline:** No P0 *layout* defects — the per-module mobile CSS is thorough and the V5.5 desktop regressions did not
recur. The 5 P0s are 3 data/crash bugs + 2 stored-XSS. Security posture is the weakest area (shared-device / tampered-
backup threat model): the admin gate is bypassable and the shipped APK is a debug build.

---

## P0 — must fix (5)

### P0-1 · dsr-bug-01 · Bridge-created DSR record crashes the whole staff panel *(bug, high)*
`ensureDsr()` (integration-bridge.js:194) creates a DSR record with `cleaning:{}` / `marketing:{}` (no `cp1`/`cp2`)
whenever a CRO has QMS customers allocated/closed **before** that CRO opens DSR. On login `updateProgress()` (dsr.html:1739)
reads `rec.cleaning.cp1.done` → uncaught TypeError → **the DSR panel is completely unusable for exactly the busiest CROs.**
*Fix:* additively normalize the shape in `normalizeRecord()` (ensure `cleaning.cp1/cp2`, `marketing.*`).

### P0-2 · dsr-bug-02 · Last-writer-wins race: bridge whole-record writes clobber DSR cache → data loss *(bug, high)*
DSR keeps the live record in `_recCache` (300ms debounced write); the bridge's ~60s tick reads the same key fresh, appends
a QMS sale/visitor, and writes the whole record back (integration-bridge.js:219/250). Either direction clobbers the other →
**silent loss of QMS-linked sales/visitors or of staff edits, no error.**
*Fix:* on the DSR write path, re-read + merge bridge-owned `qms*` rows (by `sourceRef`) instead of blind overwrite.

### P0-3 · bug-payroll-01 · Locked-run snapshot keyed by `empId||name` collapses duplicate employees → wrong frozen pay *(bug, high)*
`lockRun()` (payroll.html:3011) keys the frozen snapshot by `empId||name` (lowercased). Two employees can share that key
(duplicate Emp ID — only a *warning*, not blocking; or blank identity). One row's pay overwrites the other in every locked
view/PDF → **wrong money figure paid/filed, silent unless names are cross-checked.**
*Fix:* detect snapshot-key collisions (incl. empty keys) in `runBlockingErrors()`/`lockRun()` and BLOCK the lock.

### P0-4 · xss-cro-audit-history · Stored XSS in CRO Audit (names + remarks → innerHTML) *(security, high)*
`a.cro`, `a.sm`, `a.store`, per-task `remarks` (all free text) are interpolated raw into `innerHTML` in `renderHistory()`
(cro_audit.html:1357), `showModal()` (1292-1294, 1307-1309), `renderWeekDash` (1475), `renderCard` textarea (890). A name/
remark like `<img src=x onerror=…>` saved on one device and moved via migration (`cro_audits_v3`) **executes in another
device's WebView.** *Fix:* wrap every interpolated value in the existing `stEsc()`.

### P0-5 · xss-grooming-names · Stored XSS in Grooming (CRO name → innerHTML) *(security, high)*
`rec.name`/`c.name` (CRO name) interpolated raw into `innerHTML` in `renderDaily()` (grooming.html:809) and
`renderLeaderboard()` (922). Grooming has **no escape helper at all.** Same cross-device migration vector.
*Fix:* add a small `esc()` and wrap both name interpolations.

> Both XSS P0s are "self-inflicted" on a single device but become real once data crosses devices via backup/migration
> import (the Wave-3 feature). Escaping is additive and low-risk.

---

## P1 — high priority (40)

### Bugs (21)
- **stock-carryforward-early-return** — opening carry-forward abandons the 7-day lookback at the first prior day that exists but isn't closing-locked *(high)*
- **svc-money-comma-finalamt** — comma-formatted Final Amount parses to a tiny number → closes case + feeds ledger with wrong money *(high)*
- **svc-manual-subtotal-comma** — comma in manually-typed Sub-Total collapses the printed/estimate TOTAL *(high)*
- **qms-bug-01** — `rangeStats` time-of-day boundary drops early-in-day entries on the oldest day (weekly/monthly under-count) *(high)*
- **dsr-bug-03** — DSR never re-reads storage after caching → bridge-injected QMS visitors/sales invisible all session *(high)*
- **dsr-bug-04** — `calcTimeOut` mixes Unix epoch seconds with seconds-since-midnight → garbage "time out" *(high)*
- **dsr-bug-05** — dashboard/range queries `JSON.parse` photo-laden records → large-blob parse burst (ANR risk) *(medium)*
- **dsr-bug-06** — `DSR_SUBMITTED` score always null — bridge reads `audit.score`, DSR writes `audit.total` *(high)*
- **exp-bug-01** — ledger edit/void races the 60s bridge tick → synced income silently lost *(medium)*
- **exp-bug-02** — `editEntry` accepts negative/zero amount (no `>0` guard) → wrong totals, cash statement, tax feed *(high)*
- **cro-dup-audit** — no duplicate-audit guard: same CRO/date/store saved repeatedly double-counts all dashboard KPIs *(high)*
- **cro-groom-stale** — auto-filled grooming % not cleared when CRO changes → wrong CRO's grooming score stored *(high)*
- **bug-payroll-02** — advance mid-month Absent proposal caps at today only when payroll month == real month → date-boundary mis-proration *(medium)*
- **bug-payroll-03** — `closeMonth` into an already-locked month silently downgrades it to draft, keeping a stale snapshot *(medium)*
- **bridge-01** — `reconcileEmployeeMaster` writes the QMS blob → read-modify-write lost-update race can wipe an in-flight QMS session *(medium)*
- **leave-bug-01** — `loadData()` can leave `data.leaves`/`data.agendas` undefined → module crashes to a blank screen on load *(high)*
- **bug-01 (leave)** — multi-day leave collapses to 1 day unless duplicated under every date-key *(medium)*
- **bug-02 (service GST)** — CGST+SGST halves can display ₹1 more/less than Total GST *(high)*
- **bug-03 (service GST)** — invoice Total Payable can use owner-entered `finalAmt` that doesn't reconcile with taxable+GST shown *(medium)*
- **bug-backup-1** — restore rejects `saagar_invoice_seq_v1` (a number) because the validator demands an array → counter dropped → **duplicate invoice numbers reissued** on a restored device *(high)*
- **bug-backup-2** — restore also rejects `saagar_wsf_settings_v1` (object) → watch-photo-mandatory policy silently reverts on restore *(high)*

### Layout (11)  — see `_static-verification.md` for confirm/refute
- **stock-L01** — register tables get TWO conflicting mobile treatments (card-conversion vs shell scroll-table) that fight in Mobile mode *(high; 360/412 Mobile)*
- **qms-L01** — ⚠️ **REFUTED (false positive)**: static claimed two overlapping hamburgers; live check shows the module's `.qms-menu-btn` is `display:none` (shell hide rule). No overlap. *Drop.*
- **qms-L02** — 1280×Mobile: sidebar pushed off-canvas but `--sidebar` stays 240px → 240px empty gutter, no visible nav *(medium; 1280×Mobile)*
- **qms-L03** — mobile nav drawer doesn't auto-close after selecting a nav item *(high; 360/412 Mobile, 360 Desktop)*
- **dsr-01** — wide `.var-tbl`/`.ptbl` lose header/body column alignment at 1280×Mobile and in the 641–920px band *(medium)*
- **payroll-L01** — Attendance-Import diff modal footer (Cancel/Apply) unreachable on wide viewports — no modal max-height *(high; 1280)*
- **payroll-L02** — ✅ **CONFIRMED**: salary-slip preview clips the left edge of the 210mm slip (`align-items:center` + overflow) *(high; mobile widths)*
- **payroll-L03** — ✅ **CONFIRMED**: HR-letter preview clips the left edge of the 210mm letter (same pattern) *(high; mobile widths)*
- **leave-01** — day-modal pending-leave row overflows: avatar + 2 badges + three 44px buttons in a no-wrap flex row *(high; 360×Mobile)*
- **tax-01** — compliance-card done-capture row: 5 labels + 4 inputs + file input on one flex row, all forced 44px/16px by the shell floor *(high)*
- **L-planning-01** — festival form grid stays 2-column at 360px (no `@media`; containment doesn't change columns) *(high; 360/412)*

### Security (10)  — offline / shared-device / tampered-backup threat model
- **SEC-PIN-01** — admin session flag is a plaintext localStorage boolean → **staff can self-promote to owner without the PIN** *(high)*
- **SEC-PIN-02** — PIN "hash" is a fast 32-bit non-crypto hash, no salt, no throttling → trivially brute-forced offline *(high)*
- **SEC-PIN-03** — protected-module data is only navigation-gated, not withheld → payroll/tax figures readable straight from localStorage regardless of PIN/role *(high)*
- **SEC-PIN-04** — restore accepts an attacker-supplied admin PIN hash + admin-mode flag from a backup file → tampered migration file can preset owner access / swap the PIN *(high)*
- **xss-tax-firm-list** — stored XSS in Tax: firm name/entity/PAN/GSTIN rendered unescaped in the Firms list *(high)*
- **SEC-DATA-01** — restore's rollback-snapshot write is unchecked; on a near-full device it silently fails and the overwrite proceeds → **the promised undo doesn't exist, data unrecoverable** (index.html:5285) *(high)*
- **SEC-DATA-02** — `saagar_bridge_config` (integration thresholds) is a *third* whitelist gap: dropped by backup/restore, wiped by factory-reset → rules silently revert to defaults *(high)*
- **SEC-DATA-03** — restore is non-atomic additive-merge with no pre-clear → half-restored / Frankenstein cross-module state on partial failure or stale file *(medium)*
- **sec-apk-1** — the distributed APK is a **debug build** (`android:debuggable="true"`) *(high)*
- **sec-apk-2** — `android:allowBackup="true"` permits `adb backup` exfiltration of the offline financial data *(high)*

*(also SEC-DATA-04 P2: no size guard on imported JSON → OOM/freeze risk on a huge/hostile file.)*

---

## P2 (87) and P3 (68)
Full detail in the per-agent files. Distribution: layout 43 P2 / 45 P3 (mostly the recurring `overflow-x:hidden`
hero/banner clips, 44px control-floor crowding in dense rows, minor grid/pill overflows); bugs 38 P2 / 19 P3 (edge-case
date/rounding/idempotency); security 6 P2 / 4 P3 (unescaped fields with only self-inflicted reach, minor hardening).
These are triaged in Phase 2 and fixed after all P0/P1 per the plan's order.

---

## Live browser layout pass (mine) — corroboration + additions
Confirmed objectively across 4 combos (`_live-sweep.md`), complementing the static layout agents:
- Recurring **`overflow-x:hidden` clip** on hero/banner rows: shell Home hero (~34px), payroll `.hero` (~40px, every pane,
  all combos), tax `.cos-banner` (~80px). *(P2 — consistent, width-independent → a fixed-width inner row.)*
- **Shell top-bar brand text overlaps the role selector at 360px** (screenshot-caught z-overlap; scanner can't see it). *(P2)*
- service `.brand-sub` clipped *(P3)*; planning festival grid 5px overflow + run-together headers *(P3)*.
- **Confirmed CLEAN** at all combos (no page-overflow / clipped table / unreachable modal): stock, qms, dsr (all 9 day-sheet
  sections), expense (10 tabs), grooming, cro_audit, the service New-Order 12-step form (warranty field renders), and the
  leave/qms/expense modals. QMS off-canvas drawer works — no V5.5 regression.

## Cross-cutting / device-verify items
- **`prompt()` gate (bugs/_live-prompt-gate.md):** payroll/tax open path + factory-reset + Admin-PIN set/change use
  `window.prompt()`, which throws in this preview and *may* be a no-op on some WebViews. Likely preview-only (Capacitor
  usually shows a native prompt) but **device-verify** — if broken, it's latent P0. Also feeds the "migrate off prompt()"
  direction that overlaps SEC-PIN.
- Threat model for the security lane: offline, no network. "Breach" = a shared shop device (staff vs owner) or a hostile
  imported backup/migration file — NOT remote attack. Severities are rated against that model.

## Notes on completeness
- All 31 agents accounted for. The sec-data-integrity (S3) agent first returned a stub; it was **re-run** and produced
  5 real findings (SEC-DATA-01…04), now folded in (SDI-1 stub removed).
- Remaining module dialogs not opened in the live pass (some print/voucher previews) are covered from code by the static
  layout agents; final acceptance is the user's on-device test.
