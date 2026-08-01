# Wave 5 — standalone P0 sweep

**Date:** 2026-07-04 · **Base:** `origin/main = 06ce538` (Wave 4) · **Status:** ✅ **COMMITTED + PUSHED
`origin/main = 7249df1`** (batched with Wave 6) · seeded APK `SaagarCC-DemoData-V6-Wave6.apk` (6.41 MB, mojibake-clean)
built in Retail root · device-test pending. The 3 non-security P0s remaining in the Product Roadmap Register
after Wave 4. Specs by a 3-agent workflow → impl by a 3-agent workflow (one owner per blob) → verify. Additive-only,
no new libs, offline. Files: `www/index.html` (3 blob embeds: leave, cro_audit, expense). No shell/bridge/report edits
(the expense per-store bridge `CASH_CLOSED` + report PDF phases are deferred). No storage-shape/key changes.

## The 3 features

| Feature | Blob | What | Verified |
|---|---|---|---|
| **Leave: 7-day / configurable weekly-off** | leave | New sibling key `leavedesk_weekoff_v1` (`{days:[0,6]}`, default = today's Sat+Sun behavior). Replaces 4 hardcoded weekend checks (submitLeave, importJSON, requestedLeaveDays, renderCalendar) with a shared `isWeekOffDate()`. A weekend leave can finally be recorded (was silently dropped) and flows to payroll. Settings panel in Staff Master; export/import/clear plumbing. | Harness: default Sun=off/Mon=on; 7-day mode → Sun recordable; restores; calendar clean |
| **CRO: per-buyer Google-review list (T6)** | cro_audit | T6 becomes a list of today's closed-Purchase buyers (read-only from QMS `retail_queue_management_v1`), each with a one-tap wa.me "Ask" + Requested/Received ticks; `reviewsCount` auto-derives from received ticks. Additive optional `reviewList` on the existing t6 record; ticks bind by customer `cid` (not index). | Agent harness 22/22 (index-binding, old-record, wa.me open, QMS read-only). Harness: `croReviewBuyers` returns 2 of 4 (excludes non-purchase + no-mobile) |
| **Expense: per-store cash** | expense | Optional `store` (WLMHW/HEMW) on new ledger rows + additive nested `byStore` on `tanishq_statements[date]` — per-store deno count / close / carry-forward as a **soft reconciliation overlay** (the hard business-wide day-lock is unchanged). All-business view (`SST=''`) is behaviorally unchanged. Firm (legal entity) stays orthogonal to store (cash drawer). | Harness: **carry-trap passes** — `normEntry` carries `WLMHW`, drops `BOGUS`/legacy→undefined; `computeDayStore` segregates; `renderStmt` clean. Agent harness: independent per-store close + carry-forward |

## The carry-trap (why the expense one was risky, and how it's safe)
An entry pushed with a new `store` field is **silently stripped on the next read** unless `normEntry()` is extended to
carry it (same for `migrateStmt()`/`byStore`). Both were extended + whitelisted (WLMHW/HEMW only), and the
save→read round-trip is verified (`store:'WLMHW'` survives; `BOGUS`→undefined). Old rows/statements without the fields
keep working (undefined = unassigned/legacy, still counted in the business view).

## Verification
- **Browser harness (seeded):** all 3 blobs embed round-trip byte-OK, all 11 decode, shell boots **0 console errors**,
  each module opens clean with feature functions present + core logic spot-checked (isWeekOffDate config, croReviewBuyers
  filter, normEntry carry + computeDayStore).
- **Agent self-harnesses:** cro 22/22 assertions; expense carry + segregation + independent-close; leave default-preservation.
- **Encoding note:** harness re-sync now uses a byte-safe copy (`Copy-Item` + `.NET ReadAllText/WriteAllText(UTF8)`) —
  0 mojibake — after the [[harness-utf8-encoding-caution]] lesson.

## Roadmap status after Wave 5
The register's **P0 tier is now essentially complete** — the only remaining P0s are the **3 Security & Multi-User** items
(PIN-gate role switching, named-staff per-person PIN, gated+audited backup export) + the audit's deferred SEC-PIN-05/07.
Next logical phase = **Wave 6: Security & Multi-User hardening**. Below that: 55 P1 + 32 P2 + 75 quick-wins + the 6
cross-cutting themes (two-store topology is the biggest, partly PHP-rebuild territory).

## Not committed / not built — awaiting go-ahead.
