# Deferred-items follow-up pass

**Date:** 2026-07-04 · **Base:** `d5d2897` · **Status:** COMMITTED + PUSHED **`origin/main = 971e465`**; seeded
APK **`SaagarCC-DemoData-V6-DeferredFix.apk`** (6.38 MB, notifications live, allowBackup=false) built in the
Retail root. Verified in the seeded browser harness + a Node bridge sandbox. No blob embedding was needed
(see below), no storage-shape changes, no new libraries. (This audit trail itself stays untracked, per rule.)

This pass took the four deferred batches the user selected. Files touched: `www/index.html`,
`www/integration-bridge.js`, `package.json`, new `build-overrides/apply-overrides.js`.

---

## Two discoveries that de-risked the pass
1. **bridge-01 was NOT the feared 2-module change.** QMS's own `load()` (qms.html) already unions
   `saagar_employee_master_v1` into its `cros` at read time — the exact "QMS-side reader" the audit said was
   missing (same read-time-union pattern Stock uses for brands). So the fix is a **pure deletion** of the
   bridge's race-prone `S(QMS,q)` roster write; no QMS blob edit, no roster loss.
2. **No base64 blob embedding needed anywhere.** The ₹-clip fixes were applied as shell-injected per-module
   CSS (`[data-mod=…]`, injected into the iframe) instead of editing the module blobs. Entire pass = shell
   `index.html` + `integration-bridge.js` + build config. No `module_tool.js` embed round-trips.

---

## Batch 1 — Layout + ₹-clip CSS  (all in the `MOBILE_CSS` template literal, `www/index.html`)
| Item | Change | Verified (seeded browser harness) |
|---|---|---|
| **stock-L01/L02** | `[data-mod="stock"] .rtbl td .ni/.si/.cro-sel`: `min-height:0`→`40px`; the fixed `width:48/80px` moved into `@media(min-width:641px)` so phone-width **card** inputs fill the row instead of being crushed | Stock iframe: `.ni` computes `min-height:40px`, `width:130px` (not 48px); 70 inputs across 4 registers |
| **payroll-L05/L06** | `[data-mod="payroll"] .sc-v,.hero-stat-v{overflow-wrap:anywhere}` | Injected + computed `anywhere`; isolated 90px-card test: pre-fix `₹12,34,567` scrollW **92>90 = clipped**, with fix **90 = not clipped** |
| **svc-l2** | `[data-mod="service"] .stat-value{overflow-wrap:anywhere}` | Seeded `₹19,92,200` Est. Revenue: `overflow-wrap:anywhere` applied, `clipped:false` |
| **qms-L02** | **No change — already resolved.** Shell rules `[data-mod="qms"]{--sidebar:0px}` + `.main-area{margin-left:0}` (class-based → fire at 1280 too) + iframe `#st-v5-qms-menu` | QMS iframe: `--sidebar:0px`, main-area margin `0px` (**no 240px gutter**), shell hamburger `display:flex` fixed top-left (nav reachable). Like qms-L01, an auditor false-positive (no shell source at audit time). |

## Batch 2 — Security copy + backup-permanent
- **SEC-PIN-03** (`index.html`): Settings "Protected modules" copy now states it *"restricts the in-app view
  only — it does not encrypt the data on the device (a device backup/restore or direct file access could
  still read it)"*, and the gate toast reworded. Sets the owner's expectation correctly (no encryption promise).
- **allowBackup=false permanent**: new tracked `build-overrides/apply-overrides.js` (Node stdlib only)
  **patches** `android:allowBackup="false"` into the manifest surgically (never rewrites it, so plugin merges
  survive) and is wired into `package.json` `build:apk`/`build:release` after `cap sync`, plus an
  `apply-overrides` script. Survives an `android/` regeneration. Patch branches unit-tested (true→false /
  inject-when-absent / already-false no-op). `android/` is still git-ignored; `build-overrides/` is tracked.
- **sec-apk-1** (debuggable): NOT code — ship a *signed release* build (`npm run build:release` already exists;
  needs a keystore + `key.properties`, which are your secrets). Left as a build-time step for the APK stage.

## Batch 3 — Bridge in-memory bug fixes  (`www/integration-bridge.js`)
- **bridge-02** — attendance feed now buckets by `kk(name)` (+ carries a `display` name) and a **one-time
  guarded migration** collapses any pre-existing case-variant buckets. (Payroll already lowercases feed keys
  on read, so the old `nm`-keying caused a last-wins under-count.)
- **bridge-03** — only **full-day** leave goes into the red floor-gate `blocked[]`; half-day stays in the
  `unavailable`/"half day" map (was: half-day wrongly barred from the floor all day).
- **bridge-04** — customer-master `names[]` dedup is now case-insensitive (case variants no longer fill the
  6-name cap and crowd out a distinct name).
- **bridge-05** — `consume()` catch now counts attempts and gives up after 3 (was: a poison event retried
  every cycle for up to 14 days).

## Batch 4 — bridge-01  (`www/integration-bridge.js`)
- Deleted the bridge's `L(QMS)→push→S(QMS,q)` roster seed (the cross-context lost-update race that could wipe
  an in-flight QMS save). QMS's own load-time union covers the roster. DSR-list / `saagar_cros` writes stay
  (plain standalone keys, no wholesale-blob race).

---

## Verification evidence
- **Bridge (adversarial Node sandbox):** seeded localStorage, ran a real `SaagarBridge.runNow()` cycle.
  Edited bridge **9/9 assertions pass**; the same harness on the pre-fix `HEAD` bridge **fails 7/9** (proves
  the assertions catch bridges 01/02/03/04, non-vacuous). bridge-05 = `node --check` + inspection. Full cycle
  ran with no exceptions (produce → all consumers → gate → masters → customer-master → exceptions).
- **Shell CSS integrity:** both injected CSS template literals (`const css`, `const MOBILE_CSS`) brace-balanced,
  no stray `${`; all added rules present/well-formed. App **boots clean in a real browser** (no JS errors;
  `[integration-bridge] event-bus ready`; edited bridge loads).
- **CSS render:** confirmed in the seeded harness (3115 keys, `bcc-mobile`) by reading computed styles inside
  the module iframes — see the Batch-1 table.

## Batch 5 — Cosmetic P2/P3 tail (added 2026-07-04)
Collected via an 11-agent workflow (one per module: read `layout-<mod>.md` + confirm classes in the blob), then
curated. Applied **12** safe, additive, shell-injected `[data-mod=…]` rules as ONE consolidated block at the end
of `MOBILE_CSS` — **no blob edits**. 7 modules needed nothing (stock/dsr/leave/tax were already-fixed or
"no-fix-needed"; notably tax `.cos-banner` + payroll `.hero` clip only a **decorative circle**, not content, and
service `.brand-sub` is already ellipsis-managed). **Dropped 3** proposals: grm-02a (`max-width` on an auto-layout
`td` is unreliable), grm-02b (needs `min-width:0` on the flex child to actually wrap), cro_audit-01 (heavy 62px
pad to dodge the shell FAB — left as a shell/device concern like payroll-L10 / svc-l6).

Applied (all `html.bcc-mobile[data-mod="…"]`):
- **Text/token wrap:** qms `.q-name` (L05) + `.audit-detail` (L08); expense `.kpi .v` (L1) + `.name-cell` (L4).
- **Ellipsis:** cro_audit `.mtitle` (L06) — long CRO name truncates instead of crowding ✕.
- **Chip row:** service `.stage-chips` → `nowrap` + `overflow-x:auto` (svc-l3) instead of ~3 rows of 44px pills.
- **Card cell:** payroll `#ms-table … td[data-label="Send Slip"]` → `flex-wrap` (L09).
- **Module FAB:** grooming `#grm-float-save` → `left:14px` at all mobile widths (grm-01, matches its own ≤640 rule).
- **Toasts clear bottom chrome:** payroll `#app-toast` 88px, qms `.toast` 92px, planning `.toast` 98px, service
  `.toast` wrap+clamp (svc-l7).

Verified: `css_integrity` (MOBILE_CSS brace-balanced, no `${` interpolation) + app boots clean in browser;
render-checked in the seeded harness — service stage-chips scroll (8 chips, `flex-wrap:nowrap`/`overflow-x:auto`),
qms `.q-name` `overflow-wrap:anywhere` + `.toast` `bottom:92px`, cro_audit `.mtitle` ellipsis, payroll `#app-toast`
`bottom:88px`.

## What remains (candidate follow-ups)
- **Cosmetic tail — remaining items deliberately deferred:** the ones needing JS (payroll-L07 / planning
  `scrollIntoView`), desktop-narrow-only combos (641–920px), shell-owned FAB geometry (payroll-L10, svc-l6,
  cro_audit-01), or the shared 44px control-floor. All no-data-loss / no-reachability — not worth the regression surface.
- **sec-apk-1:** signed release build at APK time (needs your keystore).
- **On-device confirmation:** the standing device test (WebView ≠ browser) still applies to these, as for all
  prior waves — especially the layout tweaks at real 360/412 widths.
