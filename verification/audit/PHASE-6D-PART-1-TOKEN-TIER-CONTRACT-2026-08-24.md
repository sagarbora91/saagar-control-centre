# Phase 6D Part 1 — Token and tier contract checkpoint

**Date:** 2026-08-24 (Asia/Kolkata)  
**Scope:** opt-in shared UI contract only; no module adoption.

## Frozen contract

- `www/shared/module-brand-tokens.css` retains every existing brand token value and adds the
  shared spacing, typography, type-floor, control, touch, toolbar, navigation, card, modal,
  grid, focus, shadow and layer metrics.
- `www/shared/module-responsive.css` publishes four exact tiers: mobile `<640`, compact
  `640-899`, tablet `900-1199`, and desktop `>=1200`. Every rule is gated by
  `data-saagar-ui`; `auto` is explicit and is not the default behavior of any module.
- `www/shared/module-ui-runtime.js` exposes a frozen, non-autoboot API for `auto` and the four
  explicit modes. It uses a resize-listener fallback and has no `ResizeObserver` dependency.
- Both new assets and the expanded token asset are byte/SHA bound by `www/module-manifest.js`.
  No module imports either new asset, so all twelve screens remain visual no-ops.
- API-23 generation down-levels the runtime for Chrome 44 and resolves governed CSS variables.
  No APK was built and no device or rendered-browser acceptance is claimed.

## Access-context decision matrix (read-only review)

| Module | Decision | Named authorization consumer |
|---|---:|---|
| Stock | keep `true` | manager workspace and live downgrade revocation |
| Service | keep `true` | Owner-only control visibility and revocation |
| DSR | keep `true` | manager screen and forced logout on downgrade |
| Expense | keep `true` | Owner-only control visibility and revocation |
| QMS | keep `false` | none evidenced |
| Grooming | keep `false` | none evidenced |
| CRO Audit | keep `false` | none evidenced |
| Payroll | keep `false` | none evidenced |
| Leave | keep `false` | none evidenced |
| Tax | keep `false` | none evidenced |
| Planning | keep `false` | none evidenced |
| ETP | keep `false` | shell-owned ETP gateway remains the authorization boundary |

No access adapter changed in Part 1. Any later false-to-true proposal remains gated on a named
consumer and fail-closed behavioral tests. ETP is not eligible for child access-context enablement.

## Verification

- Phase 6D focused UI/manifest/API-23 suite: **29/29**.
- Phase 0: **72/72**.
- Modular: **88/88**.
- Historical MAH3/MAH4 validators still pass only against reconstructed pre-Phase6C authority.
- The recorded Phase 6C current-source profile is now checked against a reconstructed Phase 6C
  boundary; it was not repinned to Phase 6D.
- ETP remains 34,473 bytes, SHA-256
  `b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12`, unlinked from the legacy
  asset and unadopted into the Phase 6D assets.

## Resume boundary

Resume with Phase 6D Part 2: build the opt-in responsive table/card, priority-column and true-grid
components plus safe helpers for static and JavaScript-generated markup. Do not adopt them into
Stock or any module screen; Stock adoption remains Phase 6E.

No APK build/signing, Firebase/device action, external upload, publication, push, billing change,
business-logic change or access-context expansion occurred at this checkpoint.
