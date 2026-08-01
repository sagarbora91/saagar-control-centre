# Post-Wave-3 Full Audit & Fix — APP-SPECIFIC PLAN (v2, replaces v1)

**3 Jul 2026, session b9a88b03. Baseline `origin/main=850ed72` (Waves 1–3 shipped). Execute with Opus.**
Priority order per owner: **1) LAYOUT (mobile AND desktop, every inner screen) · 2) bugs · 3) security.**
App is ENGLISH-ONLY — no localization/multilanguage checks. Audit read-only; fixes partitioned; STOP at checkpoints.

## Phase 0 — Recon: PRE-DONE (copy to 00_MANIFEST.md, don't re-discover)
Offline Capacitor-6 Android app. ONE ~2.4MB `www/index.html` shell + **11 modules as base64 blobs**
(M01 stock · M02 service · M03 qms · M04 dsr · M05 expense+Udhaar · M06 grooming · M07 cro_audit ·
M08 payroll · M09 leave · M10 tax · M11 planning). localStorage over SQLite-WASM (`storage-core.js`/
`sqlite-store.js`/`photo-store.js` = **NEVER edit**). `integration-bridge.js` event bus; `saagar-report.js`
jsPDF engine; `auto-backup.js`. No backend — server/TLS/API pentest N/A.
Blob tool: `node V:\Co work\Projects\Retail\_v6_tools\module_tool.js list|extract|embed|add|remove`.
Syntax gate: vm.Script per inline script; shell has ONE known false-positive (script#5 lazy-PDF-loader).
HARD RULES: additive storage only, no new libs, offline-only, no invented tax numbers, commit only on ask.

## WHY LAYOUT BREAKS INSIDE MODULES (audit agents start from this, not from zero)
Every module opens in an iframe via `srcdoc` after an injection pipeline (`buildModuleSrc` in shell):
`injectUniformCSS` + `injectMobileMode` (adds/removes `bcc-mobile` class from shell `ST_UI_MODE` msg +
width-aware default) + back-button + audit bridge + CSS that HIDES module-internal masters UI
(`injectModuleHideCSS`). So every screen renders under TWO stylesheets: the module's own CSS + the
shell's injected overrides — and in TWO modes (bcc-mobile on/off) × any width. **V5.5 history: this
exact pipeline broke desktop (default-to-mobile-regardless-of-width, clipped QMS sidebar, overlapping
FABs, unreadable Home pills — see saagar-desktop-layout-fix memory). Surface pages were fixed; INNER
screens (tabs, modals, deep forms, wide tables) were never systematically walked.** That is this audit.

## Phase 1 — Audit
### Lane L — LAYOUT (the main event; 1 agent per module + H1 shell = 12 agents, waves of ~4)
**Method — live browser, not just CSS reading:** serve `www/` with a static server; open index.html
with `window.__FORCE_DEMO_SEED=true` (seeds 365 days so tables/lists are FULL — empty-state layouts
hide breakage). Use the preview/browser harness: resize to **360×740, 412×915 (mobile) and 1280×800
(desktop)**; for EACH width also toggle BOTH UI modes via the shell's Display-mode setting (Settings →
Display) — 4 combos minimum per screen. Screenshot + DOM-inspect every screen; log every defect.
**Per-module walk protocol:** open module → enumerate ALL nav targets (tab bars, view switchers,
FABs, row-level buttons) → visit EVERY one → inside each, open EVERY modal/dialog/overlay, expand
every collapsible, scroll every table. Known inner-screen inventories to cover as minimum:
- M05 expense: 10 tabs (dash/ledger/**udhaar**/stmt/petty/vendors/budget/sync/close/audit) + `modal()` dialogs.
- M02 service: dash + multi-section case form (intake→estimate→delivery incl. **new warranty field**),
  follow-up overlay, proforma/print views, CSV export UI.
- M03 qms: queue floor, lead close dialogs, follow-ups, reports/EOD, settings; the historically-clipped sidebar.
- M04 dsr: per-staff day sheet (visitors/sales/nonpurch/tasks/cleaning photo/closing/SM audit).
- M08 payroll: attendance (+import panel), runs, slips, advances, HR letters, reports — heaviest module.
- M01 stock (per-store day sheets, brand grids) · M06 grooming checklist · M07 cro_audit rubric ·
  M09 leave calendar grids · M10 tax calendar + action center · M11 planning (NEW, never device-seen).
- H1 shell: Home (hero, **Customer-lookup card + profile render**, attention list, EOD wizard, quick grid),
  Today view, Modules grid, Reports hub, Settings (all subtabs incl. **migration card**), WA composer, modals.
**App-specific defect checklist:** fixed px widths in cards/grids; `grid-2`/`fgrid` not collapsing at
360px; tables without `twrap`/overflow-x (or twrap that clips instead of scrolling); modals (`.mbk`,
fu-overlay) taller than viewport with unreachable buttons; FAB/z-index overlaps; sticky headers over
content; `seg`/tab bars wrapping badly; long ₹ amounts & long customer names overflowing pills/cells;
`bcc-mobile` styles leaking into desktop or missing on mobile; keyboard-covering inputs on forms.
Findings → `docs/audit/layout/<key>.md` (screen path → defect → width/mode combo → severity P0–P3 →
screenshot ref). Write to disk immediately.
### Lane B — BUGS (1 agent per module + bridge/report/backup = ~14, waves of ~5)
Logic/null/edge; bridge 60s-tick races vs module writes; date-boundary (00:30 rule); Service money-as-
string parsing; idempotency (bus events, udhaar-vs-income isolation, invoice seq, warranty follow-up);
backup/restore/migration-export round-trip; storage-quota paths; perf/ANR on seeded data (whole-blob
JSON parse bursts, srcdoc boot cost — the app's historic crash class). → `docs/audit/bugs/<key>.md`.
### Lane S — SECURITY (5 agents)
S1 PIN/roles/admin gating (shell) · S2 XSS via string-concat HTML — stored customer/vendor names are
the prime vector; sweep every innerHTML/esc() gap in shell+modules · S3 data-at-rest + backup/restore/
migration integrity + factory-reset safety · S4 postMessage `ST_*` rails (origin/shape validation),
wa.me/tel URL building · S5 APK hardening (debuggable, allowBackup, exported components, WebView
config) + bundled-lib CVEs (jspdf/jszip/sql.js/pdf.js/html2canvas). → `docs/audit/security/<key>.md`.

**CHECKPOINT 1** — `docs/audit/FINDINGS.md` ranked P0→P3, counts by lane. STOP.

## Phase 2 — Fix Plan
`docs/audit/FIX_PLAN.md`. Partitioning law of THIS app: module fixes = edits to EXTRACTED html
(parallel-safe, 1 agent = 1 module file); **all embeds serialized — never 2 embeds concurrently**
(each embed rewrites index.html). Shell/bridge/report each = solo batch. **Injected-CSS
(injectUniformCSS/injectMobileMode) changes = the most dangerous class: solo batch + mandatory
all-11-module screenshot regression at all 4 width/mode combos before acceptance.** Storage-layer
findings: report-only, micro-step proposals, user approval required (3-crashes-in-3-days history).
**CHECKPOINT 2** — show batches, parallel vs solo. STOP.

## Phase 3 — Fix (order: layout P0/P1 → bug P0/P1 → security P0/P1 → P2/P3)
Hotspot solos first, then module batches 3–4 parallel → serialize embeds → syntax gate + 11-blob
decode after every round. Layout fixes re-verified in the SAME browser harness at the SAME
width/mode combo that caught them. Log every fix to `docs/audit/CHANGELOG.md`.
**CHECKPOINT 3** — after layout wave; summarize closed/remaining. STOP.

## Phase 4 — Verify
Full-app screenshot sweep: every module's every tab at 4 combos, diffed against Phase-1 defect list.
Re-run harnesses (test_bridge_cust 7/7, test_invoice 11/11, test_logic 15/15). Syntax gate baseline-
diff; `node --check` ×3; 11 blobs decode; registries 11/11/11/11. Re-confirm each closed P0/P1.
→ `docs/audit/VERIFICATION.md` + found/fixed/deferred. Then, ON USER ASK: commit → push → seeded APK
(V6-HANDOFF recipe). Final acceptance = user's device test (browser ≠ Android WebView exactly).

## Resume rule
Everything lives in `docs/audit/` (do NOT commit it unless asked). On context loss: state exact
phase + batch; next session reads this file first.
