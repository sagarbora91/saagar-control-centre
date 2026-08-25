# Phase 6E Stock API-23 and Mobile Layout Review — 2026-08-24

## Decision

The Phase 6E Stock pilot passes the independent source/API-23 contract review. This is not
rendered-browser, emulator, physical-device, staff-UAT, production or release acceptance.

## Reviewed contract

- Stock is the sole module that imports the Phase 6D responsive, general-component and table
  foundations and opts into `data-saagar-ui` with automatic width resolution.
- The six static workflow tables have explicit strategies: opening counts **cards**, movement
  reconciliation **grid**, closing counts **cards**, daily summary **priority**, monthly summary
  **priority**, and theft log **cards**.
- The movement-reconciliation table is the sole justified horizontal-scroll region. The other
  five table regions explicitly suppress horizontal overflow, and the three data-entry/log
  workflows use the card reflow at mobile width.
- The reconciliation grid retains a 720px comparison surface with touch momentum scrolling on
  mobile. Desktop keeps 12px tabular-numeric density. Sticky identity is only an `@supports`
  enhancement; it is not required for the working path, and print restores an unscrolled table.
- Stock's viewport allows pinch scaling. No `user-scalable=no` or one-times maximum scale is
  present.
- API-23 generation processes every CSS asset through custom-property resolution and binds
  shared assets through the manifest. The shared table path uses block/flex and prefixed flex,
  while Stock supplies explicit `html.saagar-legacy-webview` flex fallbacks for its existing
  card, settings, metric and triage grids. CSS Grid and sticky positioning therefore are not the
  only layout paths.
- A module scan confirms no module other than Stock has adopted the Phase 6D component/table
  system during this pilot.

## Reviewer finding resolved during the gate

The first source pass found that extracted Stock CSS still carried a blanket horizontal-scroll
wrapper and CSS-Grid-only paths for `.scards`, `.set-grid`, `.d5-grid` and `.clk-triage`. The Stock
implementation was corrected before closure: non-grid table regions now explicitly hide
horizontal overflow, movement reconciliation remains the only scroll region, and the legacy
WebView receives prefixed flex fallbacks for all four layouts.

## Verification

`node --test tests/phase6e-stock-api23-layout.test.mjs tests/api23-compatibility-build.test.mjs`
passes **14/14**.

The focused review covers source declarations, strategy boundaries, generator policy and
Chrome-44 fallback contracts. It does not claim that pixels were inspected at 360px or the tier
boundaries, that touch/zoom was exercised, or that the generated application was run in an API-23
WebView. Those remain separate rendered/emulator/device acceptance activities.
