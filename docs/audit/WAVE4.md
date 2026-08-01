# Wave 4 — module-hardening / ops-discipline pass

**Date:** 2026-07-04 · **Base:** `971e465` · **Status:** COMMITTED + PUSHED **`origin/main = 06ce538`**; seeded APK
**`SaagarCC-DemoData-V6-Wave4.apk`** (6.39 MB, notifications live, allowBackup=false) in the Retail root. 9 features from the Product Roadmap Register's
"module-hardening P0s". Specs authored by a 9-agent workflow, then implemented (2 by orchestrator, 5 blobs by a
5-agent workflow, 3 bridge features by orchestrator), verified in a seeded browser harness + a Node bridge sandbox.
Full specs: `_v6_tools`? no — in the session scratch `scratchpad/def/wave4/`. Additive-only, no new libs, offline.

Files touched: `www/index.html` (7 blob embeds: payroll, dsr, service, expense, stock, cro_audit, grooming) +
`www/integration-bridge.js` (3 bridge features). No storage-shape/key changes; blob edits via `module_tool.js`.

## The 9 features

| # | Feature | File(s) | What it does | Verified |
|---|---|---|---|---|
| 1 | **Payroll active-retire** | payroll blob | `Active` unticked → employee excluded from pay grid / slips / register / statutory / bank CSV / CTC / locked snapshot; Master keeps them (dimmed + "excluded from pay" chip) so history + re-activation survive. New `activeGmRows()`; the 5 pay consumers repointed. **Caught + fixed a spec gap:** naive repoint of `renderGM` would mis-bind edits via `gmGlobalIdx(li)` — rebuilt the cache off the true global index. | Harness: retire middle of 3 → grid `data-row` = `["0","2"]` (correct), Master dims + chips |
| 2 | **DSR store-aware brands** | dsr blob | Each CRO's Opening/Closing + validation + scoring counts only their store's brands (from employee-master `store`); unknown/free-typed name → all brands (no lockout). `staffStore/activeGroups/activeStockCats`. | Harness: Titan CRO → 23 brands, Helios → 12, unknown → 35; logged-in render = 23 |
| 3 | **Watch estimate-approval** | service blob | "Mark approved" stamps additive `estimateApproval:{at,via,by,amount}`, shows an "Est. approved" badge + proforma line + follow-up crumb. | Harness: fn loads, `renderDash` clean, stamped case → badge + "✔ Approved" |
| 4 | **Expense bill-photo viewer** | expense blob | 📎 becomes a clickable `viewPhoto` button; edit-entry can attach/replace a photo (reuses existing `billPhoto` + `@photo:` refs / `SaagarPhoto`). | Harness: fns load, `renderLedger` clean, seeded photo row → 📎 button |
| 5 | **Stock variance-reasons** | stock blob | Locking Closing opens an EOD sign-off sheet requiring a reason for every non-zero-variance brand (reasons persist in existing `closing[b].remarks` + additive `closingSignoff`); opening/unlock paths unchanged. | Harness: 5 fns load, `#stock-lock-confirm` modal present, registers render clean |
| 6 | **CRO dup-guard + edit-in-place** | cro_audit blob | Proactive "already audited — edit?" banner on date/store/cro match; Edit loads the record, Save replaces it (preserves id/submittedAt, stamps editedAt) instead of creating a duplicate. | Harness: fns load, `findDupAudit` matches by (date,store,cro)→id + negative case |
| 7 | **Grooming same-day re-check** | grooming blob + bridge | Failed CRO gets a "Re-check" button (bypasses the 17:00 rule, 2/day cap); a passing re-check clears the floor gate. Record gains additive `attempt`; bridge emits attempt-suffixed `GROOMING_RESULT` ids + `computeGate` picks the latest attempt. | Node sandbox: 40%→blocked, re-check 72%→cleared, 2 events, idempotent. Harness: fns load |
| 8 | **Grooming not-checked panel** | grooming blob + bridge | "Pending this morning — N" strip of active-non-leave-unchecked staff (Start-check chips) + a bridge Exceptions-Hub item "N staff not grooming-checked today". | Node sandbox: 2 pending → 1 after leave-exclude. Harness: `grmPendingForDate`→14 |
| 9 | **DSR unsubmitted alert** | bridge | After `cfg.dsrClosingTime` (default 20:30), a high-sev Exceptions-Hub row lists staff logged into DSR but not submitted; skips bridge stubs; today-only. | Node sandbox: fires after cutoff (names unsubmitted only), off before cutoff, clears on submit |

## Verification
- **Node bridge sandbox:** 11/11 pass (grooming re-check clear + idempotency, dsr-unsubmitted time-gate + clear,
  grooming-not-checked count + leave-exclude). Earlier bridge-01..05 sandbox still 9/9.
- **Seeded browser harness:** all 7 blobs embed + round-trip byte-OK, all 11 modules decode, shell boots with **0
  console errors**, and each of the 7 edited modules opens clean (data-mod set, main render fn runs, feature
  functions present + core logic spot-checked).
- **Subagent safety:** the 5 blob agents each confirmed they bind by stable id (c.id / e.id / data-brand-id /
  audit id / name data-attrs), not array index — the exact class of bug caught in feature #1.

## Deliberately deferred (optional, out of scope of the core features)
- **Stock `STOCK_VARIANCE` bus event** (optional bridge add) — the blob sign-off feature ships fully without it.
- **DSR closing-time SM Settings card** (optional dsr UI) — the 20:30 default works; no in-app editor yet.
- **CRO `AUDIT_SUBMITTED` bus emit** (sibling item) — save path left clean for a later idempotent add.
- Interactive flows behind `prompt()`/modals (service approval prompts, stock lock sheet, cro edit rehydration)
  are harness-integrity-verified but their full click-through is a natural **on-device** check.

## Not committed / not built — awaiting go-ahead.
