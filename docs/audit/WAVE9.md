# V6 Wave 9 — Stock Register + bridge reads (SHIPPED)

**Status:** BUILT + ADVERSARIALLY VERIFIED + FIXED + RE-VERIFIED. Base: origin/main = 375c1ed (Wave 8).

## Items
P1-5 lock/submit audit stamps (who + when + re-open count) · P1-7 theft remark + SM-verify gate ·
P1-6 monthly variance & shrinkage report per store/brand · P1-8 sales cross-check vs DSR/QMS in
Summary · P1-40 follow-ups-due exception (Exceptions Hub) · P1-43 cash cross-check exception
(QMS cash sales vs Expense cash statement).

## Build recipe followed
6 parallel spec agents + 1 synthesis/collision agent (resolved 12 cross-item collisions, e.g.
theftVerified day-level vs per-row semantics, shared stActor() helper, composed doLockClosing/
submitMovements edit order, DOM order in Summary) → 2 parallel implementation owners (stock.html;
integration-bridge.js) → node --check both → embed.js byte-verified re-encode of the stock blob into
www/index.html → mojiscan clean (0 mojibake) → seeded browser-harness verify (all 6 features,
0 console errors) → 8-agent adversarial verify workflow → fold-in fixes → re-embed → re-verify.

## Data model (all additive, one-pass carry in normaliseImportData)
Stock day blob (`saagar_stock_<store>_<date>`) top-level: `openingLockedBy/At`,
`closingLockedBy/At`, `movementsSubmittedBy/At`, `reopenedCount`, `reopenLog[]` (P1-5);
`theftVerified:{by,at}|null` (P1-7, day-level — NOT per-row). Movements-row: `theftRemark` (P1-7).
Bridge-authored: `_dsrRollup.salesCount` (P1-8, integer, recomputed in full each write). No new
localStorage keys anywhere in the wave.

## Adversarial verify — 8 skeptics (6 items + 2 regression sweeps)
Initial pass: **0 P0, 4 P1 (3 distinct root causes), 3 P2, 9 notes.** All confirmed by hand against
the real files before fixing (not taken on faith):

1. **P1 — EOD close-day wizard bricked for up to 7 days.** Three skeptics (P1-7, STOCK, BRIDGE)
   independently found that the past-day unverified-theft exception (7-day lookback) leaked into
   `www/index.html` `buildCloseDaySteps()` step 3, which had no message filter (unlike the existing
   QMS `/open lead/i` and Cash `/mismatch/i` copy-ban filters). Past days are read-only in Stock, so
   the flag could never be cleared until it aged out — and the step's sub-copy rendered garbled
   ("WLMHW + WLMHW not locked"). **Fix:** bridge theft exception scoped to TODAY ONLY (past-day
   accountability lives in the P1-6 Monthly report instead) + shell step-3 filter
   `/closing not locked/i` mirroring the existing QMS/Cash pattern. Re-verified end-to-end: locking
   today's closing now flips step 3 to `done:true`.
2. **P1 — bridge-first-write day blob silently dropped `_dsrRollup`.** `stock.html loadData()`
   dereferenced `d.opening[b]` assuming the sections always exist; a bridge-authored bare
   `{_dsrRollup:{...}}` blob (the normal order — DSR submits before the SM opens Stock) threw,
   was swallowed by the catch, and the next SM save permanently lost `salesCount`. Wave 9's P1-8 is
   the first-ever reader of `_dsrRollup`, so this pre-existing latent bug became real data loss.
   **Fix:** `loadData()` now rebuilds from `initData()` and carries `_dsrRollup` through when any
   core section is missing. Verified: bare-rollup blob → `loadData()` → save → rollup survives.
3. **P1 — false "cash doesn't tally" flag on legacy expense rows.** The bridge's P1-43 cash reducer
   strict-matched raw `gm_expenses` fields, while Expense normalises at read (`normEntry`); a
   non-canonical legacy row (e.g. lowercase `'cash'`) would be counted by the user's own statement
   but missed by the bridge, undercounting `cIn` and firing an accusatory false positive. **Fix:**
   bridge reducer now mirrors `normEntry`'s type/mode canonicalisation exactly, plus `isFinite`
   guards on both `cIn` and `qCash` (kills a `₹∞` render on non-numeric input).
4. **P2 — `theftRows()` blind to a brand removed mid-day.** `removeBrand()` preserves
   `movements[brand]` data but `theftRows()` only iterated the live brand list, so removing a brand
   with theft>0 let the day submit and lock with `theftVerified:null` — real, unverified theft
   locked in silently. **Fix:** `theftRows()` now unions `getBrands()` with
   `Object.keys(data.movements)`.
5. **P2 — print parity false MISMATCH.** `printSummaryReg()`'s DSR cross-check line only had
   OK/MISMATCH branches, while the on-screen `renderDsrRecon()` has a third "Stock Sales column not
   entered yet" state — printing a false MISMATCH whenever the SM hadn't filled in Sales yet.
   **Fix:** print now mirrors all three `renderDsrRecon()` branches verbatim.
6. **9 defensive hardenings folded in** (all low-risk, reachable only via hand-edited/corrupt
   storage — no supported UI/import path produces them): `reopenLog`/`printSummaryReg` null-element
   guard; `doReopenConfirm` `reopenedCount>=0` clamp (matches the import-side clamp); `monRawDay`
   requires a real-object section (a truthy non-object no longer counts as "day with data");
   `monLabel` clamps month to 1-12 (no more "undefined 2026"); `monCellCalc` coerces theft with
   `Number()` (no string concatenation e.g. `'053'`); zero-brand Summary hides the empty audit-strip
   box instead of showing an empty bordered chrome.

Deferred (documented, no fix needed): P1-40's shared-try containment (spec'd degrade-to-absent
behaviour), a `bid()` name-collision edge (pre-existing pattern, unrelated to this wave), the
IST-midnight UTC axis choice in P1-43 (matches Expense's own Sync axis by design), forward-compat
`theftRemark` drop on import into a **pre-Wave-9** build (unfixable from this wave's files), and the
`MODULES` manifest's stale bytes/sha256 display metadata (pre-existing, unused at runtime).

## Re-verification after fixes
Fresh harness reload (seeded cold-start, no test fixtures): 0 console errors. Targeted re-tests, all
passing: bare-`_dsrRollup` blob survives `loadData()`+`saveData()`; `theftRows()` sees a
brand-list-removed brand's theft; `reopenedCount:-3` clamps to 0 before incrementing; corrupt
`reopenLog:[null,...]` no longer crashes Summary render or Print; corrupt day blob no longer counts
as "day with data"; month 13 renders "Dec" not "undefined"; print mirrors all three DSR-recon
states (not-entered / OK / mismatch); **EOD wizard step 3 correctly flips to `done:true` once
today's closing is locked**, with no garbled sub-copy. `node --check` clean on both owner files;
`index.html` diffed against the pristine Wave-8 commit — only the re-embedded stock blob and the
one-line `sLock` filter changed (no collateral edits).

## Roadmap
18/52 P1 buildable done (Wave 7: 8, Wave 8: 4, Wave 9: 6 — P1-5, P1-7, P1-6, P1-8, P1-40, P1-43).
Next = Wave 10 Expense Manager (P1-16 recurring templates, P1-19 budget alerts, P1-17 GST capture,
P1-18 month-lock enforce) per the P1 lineup.
