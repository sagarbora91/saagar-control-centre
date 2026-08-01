# V6 Wave 10 — Expense Manager (SHIPPED)

**Status:** BUILT + ADVERSARIALLY VERIFIED + FIXED + RE-VERIFIED + SHIPPED.
`origin/main = 5c9b71b` (base 543cdd8/Wave 9). APK `Retail/SaagarCC-DemoData-V6-Wave10.apk`
(6.78 MB; packaged index.html AND demo-seed.js SHA256 byte-exact vs sources; mojibake-clean).
Device-test pending (as all waves).

## Items (4)
P1-16 recurring expense templates · P1-19 budget alert at entry time + copy-last-month budgets ·
P1-17 GST capture (vendor GSTIN + per-entry GST + per-category rates) · P1-18 month-lock
enforcement + stale-tax-feed warning.

## Build recipe followed
4 spec agents + synthesis (11 collisions incl. the one real cross-spec gap: P1-16's new write path
vs P1-18's gate — resolved via modal-absorbed override since modal() can't chain) → ONE impl owner,
phases A0 (K map + can() once) → A1 (P1-16) → A2 (P1-19) → B (P1-17, normEntry carry FIRST) →
C (P1-18 gate LAST) — 48 diff hunks all spec-mapped, 104 sandbox + 45 grep assertions → orchestrator
embed (byte-verified) + mojiscan + seeded-browser verify → 6-skeptic adversarial workflow →
10 fixes folded → re-verified (sandboxes 149/149 + browser) → ship.

## Data model (all additive)
Ledger rows: OPTIONAL gstAmount/gstRatePct (normEntry carries them undefined-when-absent, so rows
without them serialize byte-identical to pre-wave — proven by JSON compare). New keys: gm_recurring
(templates; tolerant normRecTpl with unknown-key passthrough), gm_gst_rates ({category:pct}, junk
falls back to the flat default). gm_tax_feed months gain gstRates/gstEstimateByCat/
gstPaidOnPurchases (genTaxFeed) and stale/staleAt (markFeedStale ONLY; regeneration's wholesale
replace auto-clears them). gm_vendors rows gain gstin. migrateStmt untouched.

## Key design points
- Recurring posts are ORDINARY ledger rows (source:'recurring', sourceRef 'rec:<tplId>:<YYYY-MM>')
  — zero changes visible to the bridge/PDF/CSV readers; double-post detected via the ref.
- Month lock = the month has a generated tax feed. Enforced in addEntry/editEntry/voidEntry/
  pettyOut/postRecurring/commitRecurringPost (owner override + mandatory reason + audited as
  'locked-month-override' + feed marked stale). Sync/bridge income appends stay UNGATED by design;
  a derived created-after-generation banner catches them. genTaxFeed regeneration clears staleness.
- ONE new can() verb: 'monthoverride' (owner) — used by the override AND the GST-rate editors
  (policy tightening accepted in DECISIONS; revert = 2 guard lines).
- P1-19 alert copy: "<Category> now NN% of <Mon> budget", warn >=90%, err >=100%, silent below,
  1.6s-chained toast after the save toast; recurring posts fire it too (folded from a skeptic note).

## Adversarial verify — 6 skeptics (4 items + expense regression + cross-module readers)
ALL HOLD: **0 P0, 0 P1, 5 P2, 18 notes.** Folded (10 fixes):
1. [P2] Corrupt gm_recurring (valid-JSON non-array) bricked the entire Ledger tab incl. the add
   form (getRecTpls lacked the Array.isArray guard its sibling recurringDue had).
2. [P2] editEntry/voidEntry TOCTOU: a feed generated while the modal sat open committed without the
   override audit/stale flag — both callbacks now re-check isMonthLocked at commit time.
3. [P2] genTaxFeed accepted a FUTURE month from the month picker and locked it permanently (no
   in-app unlock exists) — now rejects future/empty months.
4. [P2] Prototype-key income category ('constructor') poisoned the GST estimate (inherited-member
   lookup) — accumulators now Object.create(null), rateFor uses hasOwnProperty + finite-number
   validation (which also fixed junk rate values silently becoming 0% instead of the default).
5. [P2] The demo seed wrote gm_tax_feed under the CURRENT month → the demo APK was born tax-locked
   (every entry demanded an owner override from first launch). Seed now feeds the PREVIOUS month —
   the lock still demos on backdated edits, live-month entry is friction-free.
6-10. [notes] Recurring posts fire the budget alert; budgetAlertToast clears a pending stale alert
   before the null-return; copyBudgets guards corrupt month values; markFeedStale tolerates a
   corrupt feed blob; the derived stale banner reads RAW rows (a legacy row missing createdAt got a
   fresh normEntry timestamp every read → permanent unclearable banner).
Accepted residuals (documented, no fix): console bypasses (inherent), old-build forward-compat drop
of gst fields, GSTIN dual-master divergence + ungated setVendGstin (future-wave notes), 1e99 percent
copy, postSrc stale-toast wording on stamp-only months, LINK-6 whole-array race (pre-existing,
narrowed), stale wave9/bridge-smoke.js tooling.

## Re-verification after fixes
node --check both files; impl sandboxes re-run green (12+35+57+45 = 149/149 — the TOCTOU change is
order-compatible with the asserted audit sequences); browser: current month unlocked / seeded
prev-month locked, corrupt-gm_recurring Ledger tab renders, future+empty month rejected, junk/proto
rate table proven in-module, ALL TEN tabs render via the real go() switcher (an earlier sweep used
goTab() behind a typeof-guard and was vacuous — fixed), 0 console errors, fresh-seed cold start clean.

## Roadmap
22/52 P1 buildable done (W7:8, W8:4, W9:6, W10:4). Next = Wave 11 People-ops (grooming P1-20/21/22,
CRO audit P1-23/24/25, payroll statutory P1-48/26/27) per P1_LINEUP.md.
