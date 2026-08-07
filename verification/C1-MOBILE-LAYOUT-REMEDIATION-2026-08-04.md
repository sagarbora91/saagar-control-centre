# C1 Mobile Layout Remediation Evidence

**Date:** 2026-08-04 (Asia/Kolkata)

**Baseline:** `c04bc98255a78d45b08ac449d88365b22d033f28`

**Working tree:** intentionally uncommitted; commit/push require owner approval

**Scope:** Android shell and all eleven external modules; PHP excluded

## Outcome

The browser-audited phone layout defects have been remediated without changing
the established desktop layout. Two final responsive layers now apply only in
mobile app mode:

- `www/mobile-shell.css` repairs the compact shell header and enforces a
  44-pixel touch floor at phone widths;
- `www/mobile-layout.css` provides shared module containment, scrollable rails,
  coordinated fixed-action positions, and module-specific high-risk repairs.

All eleven external modules load the final module responsive layer. Stock,
Expense, Payroll, Leave, and Tax receive explicit high-risk containment;
Service, QMS, and CRO Audit receive targeted stage/drawer/sticky-action repairs.
DSR, Grooming, and Planning inherit the shared phone rules.

## Rendered responsive evidence

This is browser-rendered engineering evidence, not physical-device acceptance.

| Viewport | Coverage | Result |
|---|---|---|
| 360 x 800 portrait | Shell and all 11 modules | No root horizontal overflow; no visible operational target below 44 px |
| 390 x 844 portrait | Shell, Stock, Payroll, Leave, Tax, CRO Audit | Visual inspection passed; full title visible, action docks separated, local rails/tables contained |
| 412 x 915 portrait | Shell and all 11 modules | No root horizontal overflow; no visible operational target below 44 px |
| 800 x 360 landscape | Expense, Payroll, Tax | Home/Control Desk actions separated; Payroll dock clears bottom navigation; compact Tax actions remain contained |
| 1365 x 768 desktop | Shell, Payroll, Tax | Existing desktop header, hidden Payroll bottom navigation, and sticky Tax header retained |

Specific observations:

- the phone shell uses a two-row header and shows the complete Saagar Traders
  name, build badge, role, and three 44-pixel icon controls;
- phone tab, stage, and month selectors use contained horizontal rails with a
  visible continuation affordance instead of clipping hidden choices;
- Payroll uses a two-row 5+4 navigation dock in portrait and raises shared
  actions above it;
- Leave actions and its calendar stay locally contained;
- the Tax header is reduced from the earlier approximately 283-pixel sticky
  stack to approximately 135 pixels in the audited portrait rendering;
- CRO submit/score/header controls no longer form a triple sticky stack; and
- the C1 Control Desk opens as a phone bottom sheet and no longer overlaps the
  Home action.

## Automated and build evidence

| Gate | Result |
|---|---:|
| Focused mobile suite | 6/6 passed |
| Focused C1 suite | 12/12 passed |
| Focused Settings suite | 6/6 passed after the later Settings redesign |
| Full `tests/*.test.mjs` suite | 283/283 passed |
| Explicit offline suite | 256/256 passed, after 12/12 C1, 6/6 mobile and 6/6 Settings pre-gates |
| Two-year seed runtime | 1/1 passed |
| Gradle debug assembly | passed |
| Clean source/generated seed flag restored | `false` / `false` |
| APK signature | v1 and v2 debug signatures verified |

Review APK:

- `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`
- 6,793,233 bytes
- SHA-256 `CAA15D9409ED5B9973E42CD67B1ACD213F656399454A2E38D79738237DEB1341`
- package `com.saagartraders.bcc`; version 2.9; versionCode 209;
  minSdk 23; targetSdk 34; application-debuggable
- profile `two-year-review-v1`: 730 days, 25 synthetic working-day walk-ins,
  WLMHW and HEMW labels, synthetic only

The earlier C1 review APK hash
`846BC51BFBBC46FE1C4629C3F16E2655BE535B416A7ADFAA8DBFC38397170027`
is superseded by the Settings-redesign build above.

## Boundaries and remaining evidence

- No physical Android device, API-23 device, keyboard/inset combination,
  accessibility service, font-scale variant, or gesture-navigation mode was
  tested in this remediation pass.
- The Settings redesign landed after the browser-rendered matrix. Its source
  and runtime contracts are green, but its phone home/detail/search/Back layout
  still requires owner-device smoke; see
  `verification/C1-SETTINGS-NAVIGATION-REDESIGN-2026-08-04.md`.
- No formal device, UAT, legal, recovery, security, signing, or production
  acceptance is claimed.
- WLMHW/HEMW labels are synthetic seed coverage, not authenticated store
  isolation evidence.
- Owner should perform one consolidated C1 smoke on the named APK, including
  shell rotation and the Stock, Expense, Payroll, Leave, Tax, and CRO Audit
  mobile paths. Record the result only as owner-reported smoke unless the
  formal C3 evidence catalogue is completed.
