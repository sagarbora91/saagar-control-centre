# 1-Year Scale Audit — Findings, Fixes, and Remaining Work

## Scale tested (real, loaded through the live SQLite engine)
50 walk-ins/day × 365 days, 15 employees → **~3,321 keys, ~17 MB DB, ~15 MB in RAM**,
with the QMS Queue blob alone at **8 MB** (15,679 customers in one array).
App **boot at this scale = 1.8 s** (healthy — the storage engine itself scales fine).

## Audit
Multi-agent audit (9 specialist agents, every finding adversarially re-checked): **75 findings,
66 confirmed** — 40 performance, 10 scroll, 6 sync, 4 functionality, 3 stress, 3 memory.
**No data-corruption / functional blockers** — the app is *correct* at 1-year scale; the issues are
**speed and scroll**, which match the owner's reports ("slow at 6 months", "scroll jank in long lists / Home").

## Fixes applied + validated (build 2.1)
1. **Engine key-cache (the big one).** `storage-core.js` now memoizes its key list, so `localStorage.key(i)`
   / `keys()` are O(1)/O(n) instead of rebuilding the array each call. Every module loop that scanned all
   ~3,300 keys was **O(n²) (~11M ops → multi-second freeze)**; now O(n). One change fixes ~12 confirmed
   findings: expense `feedItems` (BLOCKER), DSR `getAllForDate`/`getAllInRange`/`selectAudit`, grooming
   `getAllKeys`, Home `reconcileCardsHTML`/`allStorage`, the integration-bridge scan. Proof: 60k `key(i)`
   calls in **~20 ms** (`_keycache` 9/9); cache nulled on every set(new)/delete/clear → never stale.
2. **Expense ledger render cap (scroll BLOCKER).** Was rendering all ~11k rows (~88k DOM cells) at once.
   Now shows the **200 most-recent** rows + a "use the filters to narrow" notice. Data untouched.
3. **Home QMS-parse memoize.** `buildTodayBrief`/`computeQmsDay`/module cards re-parsed the 8 MB QMS blob
   on every Home render (+60 s refresh). Now parsed once and reused until QMS actually changes (`qmsState()`).

Validated at scale: `_runall` 30/30, `_6mo_qa` 35/35, `_r6_reports` 118/118, `_keycache` 9/9,
`_backup_restore_e2e` 22/22, `_boot_heal` 8/8, `_photo_backup` 21/21, `_1yr_qa` baseline.

## Remaining work (prioritized — best done as smaller, on-device-verified follow-ups)
Many of the 40 perf findings are **already resolved by the key-cache** above. What's left:

**A. Per-module scroll caps (same pattern as the expense fix — cap/paginate long renders):**
- `cro_audit` `renderHistory()` — all ~1,256 audits inline.
- `tax` — GSTR/CMP/TDS cards over 365 days of history.
- `stock` — full register / all brands as inline inputs.
- `grooming` daily-cards (60+), `leave` staff list / calendar chips.

**B. QMS 8 MB blob (the deepest one):** every QMS action re-stringifies the whole 8 MB `customers` array +
triggers a full DB export. Real fix = archive/split closed customers out of the live array (the app already
has a 12-month archive feature). **Larger, riskier change — do deliberately, with on-device validation.**

**C. Per-module recompute-on-render (O(n), not O(n²) — lower impact):** payroll `calcGM`/`slipRecords`
per row/tab, service full-parse per search keystroke, stock full re-render per field edit, tax
`materializeDueDates` per action, cro_audit dashboard loops. Memoize / debounce as needed.

**D. Memory & stress:** backup `JSON.stringify` peak (~3× data) on export; payroll "export all slips"
builds 15 PDFs sequentially; WAL big-value path. Mostly fine on modern phones; watch on low-end.

**E. Tiny functional nits:** leave allows past-date entries (UX), QMS mobile-lookup is a linear scan.

## Build artifacts
- **Clean build 2.1** (empty, real-data ready) → `latest` release. `DEMO_SEED_ENABLED=false`.
- **1-year test build** (365 days of dummy data) → `year-test` pre-release, for feeling speed/scroll
  on-device. `DEMO_SEED_ENABLED=true` on branch `test/year-data`.
