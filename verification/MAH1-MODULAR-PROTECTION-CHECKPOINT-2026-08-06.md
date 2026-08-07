# MAH-1 modular protection checkpoint — 2026-08-06

## Resume identity and safety

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; preserve all existing/user-owned changes.
- No reset, discard, delete, commit or push was performed.
- `package-lock.json` remains untouched. PHP, ETP and storage work remain
  excluded.

## Findings reported before product editing

1. External-file extraction is complete, but the historical full M0–M6 target
   is not: shared runtime/assets, module splits, shell slimming and rendered
   baselines remain open.
2. The project has no pinned screenshot/browser comparison dependency. Existing
   responsive tests were source-contract tests only.
3. `www/mobile-shell.css` was viewport-gated but not `bcc-mobile`-gated, so a
   forced Desktop mode in a narrow window could receive phone shell layout.
4. Only Stock, Service, DSR and Expense currently receive the live
   `ST_ACCESS_CONTEXT` bridge. Other modules must not be falsely described as
   having it.
5. The active shell uses external `iframe.src`, but its historical
   `srcdoc/buildModuleSrc` fallback remains.

## Saved implementation

- Named this post-C1 workstream **MAH-1 — Modular Architecture Protection &
  Visual Baselines** to avoid collision with the legacy ETP “Phase 1”.
- Added reproducible inventory command:
  `node scripts/audit-modular-architecture.mjs`.
- Added `verification/MH1-MODULAR-PROTECTION-PROFILE.json`:
  - exactly 11 modules;
  - 14 protected surfaces;
  - English, Marathi and Hindi;
  - 360×800, 412×915, 800×600 and 1365×768 viewports;
  - 168 minimum visual cases;
  - module risk, review-state and responsive-selector ownership;
  - explicit `visualBaselinesCaptured=false` and
    `physicalDeviceAccepted=false`.
- Added dependency-free tests:
  - `tests/mh1-modular-inventory.test.mjs`;
  - `tests/mh1-modular-protection.test.mjs`.
- Registered `npm run test:modular` and added it to the existing offline
  pre-gate.
- Corrected the verified narrow-Desktop leak by requiring every phone-shell CSS
  selector to start with `html.bcc-mobile` inside the 480 px media query.
- Added MAH-1 change contract, measured module inventory and historical M0–M6
  clarification without rewriting earlier evidence.

## Verification

- MAH-1 modular suite: 8/8 passed.
- Settings focused suite: 8/8 passed.
- Language focused suite: 4/4 passed.
- Offline suite: 256/256 passed; its pre-gates include MAH-1.
- Complete test glob: 297/297 passed.
- The inventory reports the shell at 723,205 bytes and all eleven registry
  module byte/SHA values match their files.

## Evidence limits and remaining MAH-1 work

- Source protection is implemented and green.
- Rendered geometry and screenshot evidence is not captured. The in-app browser
  previously rejected the local URL under its safety policy; no alternate
  browser bypass was attempted.
- A supported deterministic run must still check root overflow, clipped or
  covered controls, fixed-action collisions, local table/tab scrolling,
  Settings home/detail and translation-driven expansion across the 168-case
  matrix.
- Screenshots should remain review artifacts until browser engine/version,
  fonts, date, seed profile and animation state are pinned.
- Physical-device and native-language acceptance remain separate and open.
- The intentionally dirty baseline cannot become immutable until Sagar approves
  the exact commit scope.

## Exact next actions

1. Establish a supported deterministic geometry runner without adding an
   unreviewed dependency or bypassing browser safety policy.
2. Capture the 168-case baseline with synthetic data and report defects before
   further layout edits.
3. Add targeted 800×360 checks for the densest fixed-action modules if the
   baseline confirms that viewport is representative.
4. Rerun `npm run test:modular`, `npm run test:offline` and the complete glob
   after any visual defect repair.
5. Build one consolidated seeded review APK only after MAH-1 browser evidence is
   green. Commit/push only with explicit owner approval.
