# R0-W1 Slice B — Step-up re-auth + money-action PIN-confirm (SEC-04 + P1-51)

**Programme:** Track A · R0 (Data Safety & Access Control) · Wave R0-W1 (Named Access) · **Slice B of 4.**
**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = a68a1f0`** + seeded APK `Retail/SaagarCC-DemoData-R0-W1-SliceB.apk`
(6.85 MB; packaged index.html SHA256 byte-exact vs seeded source `369f1c3a…`, mojibake-clean, other 7 blobs byte-identical).
**DEVICE-TEST PENDING — this slice's #1 unproven item is prompt()-null on the Android WebView (see below).**
**Base:** `origin/main = 019f5a8` (Slice A) → `a68a1f0`. File: `www/index.html` only (42+/4−: 4 shell hunks + 4 re-embedded blobs).

> **DEVIATION NOTE:** The owner chose to build the WHOLE slice (shell + blobs) in one wave, overriding the spec's
> shell-first-then-device-test build order. Consequence: the blob-side prompt()-null brick vector ships unproven
> until the owner's device test. R0-W2 (encryption) remains hard-gated on the device test — not started.

## What shipped

**Shell (4 hunks):**
- `SaagarReauth(reason)` (~index.html:2290) — ONE synchronous step-up primitive. `if(!hasAdminPin()) return true`
  (fail-open, the single load-bearing line); built on `promptVerifyOnly` (never flips isAdmin/currentRole);
  try/catch → throwing prompt ALLOWS; guarded `auditLog('reauth.ok'|'reauth.deny',{reason})`; no caching, no
  isAdmin-skip (SEC-04 = presence, not session age). **NO new localStorage key (D7).** `stConfirmMoney` alias omitted (dead).
- Step-up gates on ALL THREE full-data exports: `exportBackup`, `exportMigration`, `shareBackup` (owner D1).
  Double-prompt solved: the `!isAdmin` branch's `unlockAdmin()` IS the fresh PIN entry (audits `reauth.ok{via:'unlock'}`);
  re-auth only in the `else`. Exactly one prompt per path. `exportBackupConfirmed` untouched.

**Blobs (14 gates, one byte-identical fail-open `stReauth` resolver per module — typeof-checked,
`!==false` semantics, catch→true; version-skew = allow):**
- payroll (5): lockRun, unlockRun, closeMonth, fnfGenerate (NEVER fnfSave — PDF-with-no-record hazard), delAdvance
  (owner D2: delete only; createAdvance stays open — separate hand-typed approvedBy means the clicker isn't the approver).
- expense (4): lockedMonthOverrideModal (choke point for addEntry+pettyOut overrides), editEntry/voidEntry/postRecurring
  — **locked-month branch ONLY via `__mLock`/`__lockNow`/`isMonthLocked` (mandatory conditionals; stripping them
  PIN-walls the daily cashier loop = P0)**. Owner D3: genTaxFeed/reopenDay/reopenStoreDay deliberately NOT gated
  (staff/accountant perform them) → **month-lock/reopen remain dropdown-protected only; needs a staff-PIN primitive later.**
- stock (3): toggleLock (opening-branch only; closing/unlock route to K2/K3), doLockClosing, doReopenConfirm (choke point).
- dsr (2): submitAudit (choke for Approve+Reject; before the `.audit` mutation/saveRec/bridge emit),
  unlockForCorrection (PIN then reason prompt — intentional double-dialog).

**Deliberately NOT gated (workflow-lockout verdicts):** dsr submitDay/saveSale/deleteSale/deleteNP;
stock submitMovements (CRO by design + doSubmitTheftRemarks partial-state tail-call); expense
finishClose/closeDay/closeStoreDay (cashier nightly), approveDay (maker-checker separation), per-field
onchange handlers; payroll setRunStatus (maker-checker), createAdvance. Key discovery: stock/dsr "SM mode"
IS admin-PIN possession (smPassOk hashes vs st_v2_admin_pin_hash), while expense roles are an unauthenticated
dropdown — the gate list follows that line exactly.

## Process
6-agent spec workflow (4 blob surveys + shell design + high-effort synthesis; 5 material corrections to the
spec's sample-based site list) → owner decisions D1-D4 → shell by hand + 4 parallel blob owners →
independent orchestrator audit (gate counts, SKIP-site proofs, resolver md5 identical ×4) → embed.js byte-verified
+ mojiscan clean → harness (21 shell assertions + full resolver contract in all 4 real iframes, 0 console errors)
→ **8-skeptic adversarial + triage: 0 P0 / 0 P1 / 0 P2 — nothing to fold.**

## DEVICE-TEST CHECKLIST (DT1–DT12 in the build contract; the essentials)
1. **DT2 (gating test): does `prompt()` render at all on the device WebView?** If prompt() returns null silently,
   every gate denies — including the OWNER's own export/share. Fail-open saves a fresh device (no PIN can exist
   without a working prompt()), but a RESTORED backup imports a PIN → stock/dsr SM (DOM-password login, not prompt)
   could then never lock closing stock / sign off a DSR audit. **DT12 restore-then-gate is the proof.**
2. DT1: PIN-less device — zero prompts anywhere (fail-open proof).
3. DT10: daily staff loop with a PIN set — ZERO prompts (expense entry/close/approve, dsr staff submit, stock CRO submit).
4. DT11: gated loop — exactly one prompt each; cancel ⇒ nothing changes.
5. DT7: wrong PIN retryable immediately (no lockout counter exists until Slice C).

## Pre-existing bugs surfaced (out of scope, not fixed here)
- expense module-local `audit()` (~476) not array-coerced — module-local twin of the Slice A brick vector (task chip spawned).
- payroll `resetAll` (~2335) lacks stGuardWrite → destructive in read-only past view.
- dsr `resetAudit` erases a sign-off with no trail (unlockForCorrection has one).
- stock `importJSON` overwrites a signed-off day with no confirm.
- payroll downloadJSON/downloadSnapshot: ungated full-state export incl. bank a/c — belongs to SEC-07/SEC-08 family.

## Remaining R0-W1 slices
- **Slice C** — SEC-03 PIN policy + escalating-backoff lockout. **Owner SIGNED OFF (2026-07-17):** attempt-key
  `st_v2_pin_attempts_v1` OUT of appControlKeys + IN restoreBlockedKeys (+ APP_RE); params 5 fails · 30s/1m/2m/5m · cap 5 min.
- **Slice D** — app-launch PIN lock (P1-37). The R0 go/no-go; DOM overlay, hard device gate.
