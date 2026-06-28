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
- `cro_audit` `renderHistory()` — all ~1,256 audits inline. ✅ **DONE (build 2.2):** capped to the 150
  most-recent, with a "filter to narrow" notice; stats still cover all.
- `tax` — GSTR/CMP/TDS cards over 365 days of history. *(still open — lower impact)*
- `stock` — full register / all brands as inline inputs. *(still open)*
- `grooming` daily-cards (60+), `leave` staff list / calendar chips. *(still open — assessed small/partial-capped)*

**B. QMS 8 MB blob (the deepest one).** ✅ **RESOLVED (build 2.3) — the safer path: archival, not a sync
disk engine** (Route B was rejected in design review: backing the modules' SYNCHRONOUS localStorage API with
an ASYNC disk DB risks null reads → crash + silent read-modify-write corruption, and isn't cleanly
reversible). Instead, `qmsArchiveOldCustomers()` (index.html) moves OLD + CLOSED customers (older than
`QMS_KEEP_DAYS=45`, only past the `QMS_ARCHIVE_MIN=300` threshold) out of the live blob into a durable
archive file (`DATA/saagar_qms_archive.json`). *(The DEMO seed also caps the QMS LIVE store to the last
**31 days** of walk-ins — `demo-seed.js` — so seeding a full year never bloats the live blob on device;
older days ride in the archive file. On-screen reports cover the last 7/31 days, so nothing is lost.)*
- **Export-first then shrink** (write archive `.tmp`→rename, *then* trim the live array) ⇒ zero loss even if
  killed mid-prune; **idempotent** (dedup by id); **crash-safe** (archive-write failure → live untouched).
- **Auto-runs on boot** (engine ON only, deferred 4 s, Home-only) with a **race guard** (`activeModuleId` /
  pre-shrink re-check) so a mounted QMS iframe's in-memory `state` can never re-bloat the blob.
- **Rides in every backup** (`payload.qmsArchive`) and **re-materializes on restore** (merge-dedup) → history
  survives a wipe / new phone. Recent screens (today/week/month/reports/follow-ups) are unaffected by design.
- Cross-reference safety verified by reading the QMS module: `audit` already capped at 600; `followups` are
  self-contained (denormalized name/mobile/queueNo/croId); `customerById` only ever hits today's queue.
- Proof: `_v/_qms_archive.js` (jsdom, 23/23) + `_v/_qms_archive_e2e.js` (real Chrome engine+iframe+race, 14/14).

**C. Per-module recompute-on-render (O(n), not O(n²) — lower impact):** payroll `calcGM`/`slipRecords`
per row/tab, service full-parse per search keystroke, stock full re-render per field edit, tax
`materializeDueDates` per action, cro_audit dashboard loops. Memoize / debounce as needed.

**D. Memory & stress:** backup `JSON.stringify` peak (~3× data) on export; payroll "export all slips"
builds 15 PDFs sequentially; WAL big-value path. Mostly fine on modern phones; watch on low-end.

**E. Tiny functional nits:** leave allows past-date entries (UX), QMS mobile-lookup is a linear scan.

**F. Integration-bridge ANR fix — RESOLVED (Jun-28).** The cross-module reconcile was the last
on-device force-close: `cycle()` (integration-bridge.js) persisted the bus + CRO feed unconditionally
every cycle — an unbounded ~750 KB whole-DB persist burst that ANR-crashed QMS while idle in the module.
Fix: `cycle()` now **change-gates** the bus/CRO-feed writes (an idle reconcile writes nothing), **bounds
producers** to `RECENT_DAYS=7` (only recent-dated events are emitted), and **prunes** the bus to
`BUS_TTL_DAYS=14`. This closed the QMS on-device force-close.

## Build artifacts
- **Builds 2.4–2.7** (incremental, atop 2.3; current `APK_BUILD=2.7`, engine ON):
  - **2.4** — print preview.
  - **2.5** — QMS allocation.
  - **2.6** — compliance multi-client.
  - **2.7** — watch-photo toggle + photo-safety backup.
- **Clean build 2.3** (empty, real-data ready; QMS archival + render caps; *handles years of data*) →
  `latest` release. `DEMO_SEED_ENABLED=false`, engine ON. Supersedes 2.1/2.2.
- **Clean build 2.1** (empty, real-data ready) → earlier `latest`. `DEMO_SEED_ENABLED=false`.
- **1-year test build** (365 days of dummy data) → `year-test` pre-release, for feeling speed/scroll
  on-device. `DEMO_SEED_ENABLED=true` on branch `test/year-data`. *(Not yet rebuilt with 2.3 archival —
  optional next step to demonstrate auto-archive firing at scale.)*
