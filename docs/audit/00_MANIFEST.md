# Audit Manifest — Phase 0 recon (copied from PLAN.md, session 2026-07-03)

Baseline: `origin/main = 850ed72` (Waves 1–3 shipped). Working tree clean (docs/ + package-lock.json untracked).

## App shape
- Offline Capacitor-6 Android app. ONE ~2.4MB `www/index.html` shell + **11 modules as base64 blobs**:
  M01 stock (138,862 B) · M02 service (194,500 B) · M03 qms (128,216 B) · M04 dsr (147,751 B) ·
  M05 expense+Udhaar (100,467 B) · M06 grooming (63,963 B) · M07 cro_audit (107,590 B) ·
  M08 payroll (233,367 B) · M09 leave (129,927 B) · M10 tax (201,791 B) · M11 planning (12,174 B).
- localStorage over SQLite-WASM (`storage-core.js` / `sqlite-store.js` / `photo-store.js` = **NEVER edit**).
- `integration-bridge.js` event bus; `saagar-report.js` jsPDF engine; `auto-backup.js`.
- No backend — server/TLS/API pentest N/A. App is ENGLISH-ONLY.

## Module render pipeline (why layout breaks inside modules)
Every module opens in an iframe via `srcdoc` after `buildModuleSrc` (shell): `injectUniformCSS` +
`injectMobileMode` (bcc-mobile class from shell `ST_UI_MODE` msg + width-aware default) + back-button +
audit bridge + `injectModuleHideCSS`. Two stylesheets (module's own + shell overrides) × two modes
(bcc-mobile on/off) × any width. V5.5 history: this pipeline broke desktop; surface pages fixed, inner
screens never systematically walked.

## Audit harness (this session)
- Scratch copy of `www/` at `<scratchpad>\audit-www\` with `DEMO_SEED_ENABLED=true` (line 810) — repo untouched.
- Static servers: `.claude/launch.json` configs `audit-l1..l4` → ports 4171–4174, all serving the scratch copy.
  Each port = separate origin = isolated localStorage = independent 365-day seed.
- Extracted module HTML (read-only reference for bug/security lanes): `<scratchpad>\extracted\<id>.html`.
- Blob tool: `node V:\Co work\Projects\Retail\_v6_tools\module_tool.js list|extract|embed|add|remove`.
- Syntax gate: vm.Script per inline script; shell has ONE known false-positive (script#5 lazy-PDF-loader).

## Hard rules (audit + fix phases)
Read-only audit; findings to docs/audit/ immediately. Additive storage only. No new libs. Offline-only.
No invented tax numbers. Never edit storage-core/sqlite-store/photo-store. Commit only on user ask.
Do NOT commit docs/audit/. STOP at every checkpoint for user approval.
