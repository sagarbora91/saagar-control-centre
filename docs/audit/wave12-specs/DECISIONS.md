# Wave 12 — DECISIONS (orchestrator resolutions)

Base HEAD `1ec464b`. Source of truth for implementation = `synthesis.json` (13 decisions, per-file plans,
edit order, cross-file contracts) in this dir. Below are the orchestrator's resolutions of the 10
`openQuestionsForOwner` — all adopted as recommended except OQ#10 (tightened to keep the diff minimal).

These are additive-design engineering choices with clear best answers; none is a product decision requiring
the user, so they are resolved here (not surfaced) per the pipeline (§2.1 "orchestrator resolves open
questions in DECISIONS before any edit").

| # | Question | Resolution |
|---|---|---|
| OQ1 | P1-28 advisory-only vs wired into add-gating | **Advisory-only.** Over-capacity FLAG only; `getCapacity`/`canAddLeave` unchanged (global MAX_DAY=3 still the only add-gate). |
| OQ2 | P1-35 badge (A) vs filter GST items (B) | **Option A (badge + per-card advisory, NO filtering).** B would leak already-materialized monthly `dueDate` records into shell Reports (double-count) and shift scores — real correctness hazard (D6). |
| OQ3 | P1-31 display-only vs apply-writer | **Display-only.** No write to leavedesk_v3 or payroll state; no apply button. The module already has one guarded writer of `leavesApplied` (att-feed import) — a 2nd source of truth is maker-confusing (D3). |
| OQ4 | P1-32 denominator | **Done-non-NA** ("M of N completed filings have evidence"); FY applicable total shown as secondary context; missing list = done-but-unsatisfied (D7). |
| OQ5 | ensureJSZip contract | **`window.ensureJSZip() → Promise<JSZipConstructor>`**, idempotent + in-flight cached, injects the SAME `jszip.min.js` saagar-report.js uses (one copy). Orchestrator-owned shell edit. |
| OQ6 | P1-34 manifest + folder naming | **Yes** — include `index.csv` (Obligation, Original filename, Stored path, Added-on) + suffix each obligation folder with a short itemId tail for guaranteed uniqueness (D13). |
| OQ7 | bridge store-carry one-liner this wave | **Yes** — `store:e.store||''` in reconcileMasters push. Additive; new-seeds-only; no leave item depends on it (D12). |
| OQ8 | P1-33 convert existing WA_CFG.tax vs new key; in-module button | **Convert** WA_CFG.tax `kind:'summary'→'record'` (synthetic `__all` record reproduces today's owner summary — no regression) **and include** the active-firm "Send CA pack" button (D5). |
| OQ9 | P1-35 Q4 (Jan–Mar) QRMP GSTR items missing from catalogue | **Defer.** Accept advisory-on-monthly-cards for now; authoring Q4 QRMP items is a later (P3-W2 tax) job. |
| OQ10 | P1-31 also fix pre-existing att-feed-panel staleness on month change | **Keep minimal — do NOT touch the existing att-feed-panel.** P1-31's own `renderLeaveReconPanel()` refreshes on `bindMeta`; the pre-existing panel's behaviour is out of Wave-12 scope and altering it risks an unrelated regression a skeptic would flag. |

## Storage-rules (the Wave-11 hard lesson)
- **ONE shell edit** `STORAGE_RULES.leave @1967` → `{ exact:[], prefix:['leavedesk_'] }`. Covers the two new keys
  `leavedesk_caps_v1` + `leavedesk_blackouts_v1` AND retroactively closes the latent `leavedesk_weekoff_v1`
  backup gap. `APP_RE @5563` already has `leavedesk_` + `taxcal` — **no APP_RE change**.
- `firms[i].qrmp` is a NESTED optional boolean on the already-registered `taxcal_v2` — no STORAGE_RULES/APP_RE
  change (the register-every-new-key rule is for new TOP-LEVEL keys, not nested fields).
- Adversarial pass MUST assert `isWhitelistedAppKey('leavedesk_caps_v1')` and `isWhitelistedAppKey('leavedesk_blackouts_v1')` are true.

## Ownership
- 3 parallel blob owners: `leave.html` (P1-28→29→30), `payroll.html` (P1-31), `tax.html` (P1-35→41→32→34, +P1-33 button).
- Orchestrator (serial, by hand): `index.html` shell edits (STORAGE_RULES, WA_CFG.tax + computeFirmTaxStatus +
  buildCaPackText, ensureJSZip) + `integration-bridge.js` one line.
