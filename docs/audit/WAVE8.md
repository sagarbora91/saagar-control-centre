# Wave 8 — Daily Staff Register (DSR) — second P1 wave

**Date:** 2026-07-06 · **Base:** `origin/main = b33f9c4` (Wave 7) · **Status:** ✅ **COMMITTED + PUSHED
`origin/main = 375c1ed`** · seeded APK `SaagarCC-DemoData-V6-Wave8.apk` (6.43 MB, packaged index.html SHA-verified
byte-exact vs the harness-verified copy + mojibake-clean) in Retail root · device-test pending. Per
[P1_LINEUP.md](P1_LINEUP.md). Additive-only, no new libs, offline; the DSR blob is ONE file with ONE owner.

## Build story
4 parallel spec agents (each reading live dsr.html/bridge/whatsapp-share.js, resolving the two open design
decisions) → ONE dsr.html owner agent implemented all 4 in dependency order (a single blob = single writer) →
I applied the 2 integration-bridge.js edits myself (I own that file) → seeded-harness functional pass + a node
bridge test → 6-agent adversarial verify → 7 fixes → re-verified → batch commit/APK.

## The 4 features (all in the dsr.html blob)
| # | Feature | Notes |
|---|---|---|
| P1-13 | Customer mobile + payment mode on manual sales | Optional `#s-mobile` + `#s-paymode` (—/Cash/UPI/Card) on Add/Edit Sale → persisted → SM audit rows + CSV. New optional `sales[].mobile` / `.paymentMode`. |
| P1-14 | Non-purchase follow-up pipeline | Day-Start card of prior-3-day non-buyers with a mobile + not-yet-contacted; tel:/wa.me + Mark-contacted. STRICT flag-only writer keyed by stable `_fuRef` (or content sig for ref-less rows). New optional `nonpurch[].followedUp` / `.followUpDate` / `._fuRef`. |
| P1-12 | SM "Unlock for correction" | Manager-gated, reason-required; clears submitted/submitTime, re-audits (audit=null), appends `unlockLog[{by,time,reason,prevScore,prevAudit}]`, bumps `submitRev`. Re-submit re-fires DSR_SUBMITTED. |
| P1-15 | EOD WhatsApp day summary | One-tap SM Dashboard button → per-store (present/submitted/pending/bills/₹/top-CRO) WhatsApp text for TODAY, via new pure-read `computeDsrDayByStore()`. No record field. |

**Bridge (2 edits, load-bearing together):** DSR_SUBMITTED emitter appends `:v<rev>` when `submitRev>0` (rev 0 = byte-identical id → no orphaned events); payroll consumer keeps a per-(date:name) guard map so a corrected re-submit **replaces** the day's score without re-counting presence. CRO-audit/stock consumers self-heal.

All new record fields default in the ONE `normalizeRecord` block (~L1485-1504); `blankRecord` gained `unlockLog:[]`/`submitRev:0`. No key renames / shape changes — old records round-trip.

## Verification
- **Harness (seeded browser):** P1-13 legacy-default + carry; P1-14 scan/flag-only-write/submitted-preserved/only-flag-changed/idempotent/missing-ref/**ref-less-legacy-now-markable**; P1-12 unlock clears + unlockLog + prevAudit snapshot + submitRev; P1-15 per-store grouping + today-date + stub-exclusion + empty-guard; past-view guard. **0 console errors.**
- **Node bridge test:** first submit counts presence once (score 80) → corrected re-submit REPLACES score (95), present still 1 — no payroll double-count; rev 0 id byte-identical.
- **Adversarial (6 skeptics):** initial 0 P0 / **1 P1** / 5 P2 / 13 notes → all HOLD after fixes.

### 7 fixes folded in from the adversarial pass
1. **(P1) ref-less follow-up rows** — legacy + QMS-bridge non-purchase rows have no `_fuRef`, so "Mark contacted" silently failed forever (customer re-surfaced daily). Now `scanFollowUps` emits a stable content sig (`sig:<mobile10>|<customer>`) for ref-less rows and `_writeFollowUpFlag` matches by `_fuRef` OR sig, prefers an unfollowed row, and stamps a stable `_fuRef` on first mark. Verified end-to-end.
2. (P2) unlock now snapshots the full `prevAudit` (approved/remarks/breakdown), not just the score.
3. (P2) sale mobile validation requires ≥6 real digits (rejects symbol-only junk `++++++`).
4. (P2) "Send Day Summary" always uses `todayStr()` (the Dashboard is a 30-day rollup; was coupled to the Submissions-tab date).
5. (P2) phantom bridge stubs (`_bridgeCreated && !submitted && !loginTime`) excluded from Present/Pending.
6. (note) follow-up card suppressed on a read-only past-day view (no mutation from history).
7. (design) confirmed the strict flag-only writer never reopens a locked record's other fields.

**Accepted residuals (documented):** QMS-source mobile hygiene is trusted at the bridge injection point (advisory); scanFollowUps JSON-parses up to 3 full prior records (incl. base64 cleaning photos) per Day-Start render — acceptable for a navigation-triggered render; top-performer tie-break is storage-order.

## Roadmap position
P1 tier: **12 of 52** buildable items done. Next per the line-up: **Wave 9 — Stock Register + its bridge reads**
(P1-5 lock stamps, P1-7 theft remark+verify, P1-6 shrinkage report, P1-8 sales cross-check, P1-40 follow-ups-due
exception, P1-43 cash cross-check exception).
