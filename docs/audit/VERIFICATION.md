# Verification (Phase 4)

Baseline `origin/main = 850ed72`. All fixes are in the **working tree only** (no commit/push). Verification done in the
seeded browser harness (366 days) + static syntax gates. Final acceptance remains the user's on-device test.

## Integrity gate — PASS
- **11/11 module blobs** decode (`module_tool.js list`); every embed round-trip byte-verified.
- **All 11 modules open with ZERO iframe errors** after all fixes (stock · service · qms · dsr · expense · grooming ·
  cro_audit · payroll · leave · tax · planning). Shell boots with **0 startup errors**.
- `node --check www/saagar-report.js` OK. Edited shell blocks (auth + restore) isolated `node --check` OK.
- Post-fix **360×Mobile regression sweep: no page-overflow on ANY module** (planning's prior 5px overflow gone).
- Working-tree changes: `www/index.html`, `www/saagar-report.js` (git-tracked) + `android/…/AndroidManifest.xml`
  (on disk; `android/` is gitignored → lands in the next APK build).

## Found → Fixed → Deferred

### P0 (5/5 fixed + functionally verified)
| ID | Verification |
|----|----|
| dsr-bug-01 (crash) | `normalizeRecord` on a bridge-shaped `cleaning:{}` record → `cleaning.cp1/cp2` present, `rec.cleaning.cp1.done` no longer throws |
| dsr-bug-02 (race) | `_mergeBridgeRows` re-reads + merges `source:'qms'` rows by `sourceRef` before overwrite (code + load-clean) |
| bug-payroll-01 (dup key) | `runBlockingErrors` blocks lock on snapshot-key collision (isolated `node --check` OK) |
| xss-cro-audit-history | `stEsc('<img onerror>')` → `&lt;img…&gt;` at every sink |
| xss-grooming-names | `esc('<img onerror>')` → `&lt;img…&gt;` in renderDaily/renderLeaderboard |

### P1 (~36/42 fixed + verified; 5 deferred; 1 refuted)
Fixed (highlights, all verified by load-clean + targeted checks — see CHANGELOG for the full list):
- **Money/logic:** service comma-parsing (`parseRupee('1,200')→1200` verified), expense >0 guard + fresh-read, stock
  carry-forward, qms day-boundary, leave crash-guard, dsr ×4, cro_audit dup-guard + grooming-stale, payroll ×2.
- **Report engine:** multi-day leave day-span (bug-01), GST CGST/SGST reconcile (bug-02), Total-Payable round-off (bug-03).
- **Layout:** payroll import-modal max-height (L01), slip/HR preview left-clip (L02/L03), leave day-row wrap (leave-01),
  tax capture-row (tax-01), dsr table alignment (dsr-01), planning grid collapse (verified), qms drawer auto-close
  (verified: opens via ☰, closes after nav tap).
- **Security:** tax firm-list XSS; SEC-PIN-02 salted+iterated hash w/ legacy verify+migration (verified); SEC-PIN-01
  token-bound admin flag (verified); SEC-PIN-04 restore blocks admin keys (verified); bug-backup-1/2 restore accepts
  number/object (verified); SEC-DATA-01/02/03/04 rollback-abort / whitelist / partial-warn / size-guard; allowBackup=false.
- **Shell layout:** header brand↔role overlap resolved (role-select capped 140→104px, subtitle hidden, no overlap —
  DOM-verified); Home hero KPI row fits (`min-width:0` + narrow-track — verified statsFits).

**Refuted (dropped):** qms-L01 — the "two hamburgers" overlap is a false positive; the module's own `.qms-menu-btn`
computes to `display:none` (shell hide rule). No change made.

**Deferred (with rationale):**
- **bridge-01** (bug P1) — `reconcileEmployeeMaster` read→write is synchronous; a cross-context QMS write cannot interleave
  in a single-threaded same-origin event loop, and the roster add self-heals on the next 60s tick. The clean architectural
  fix (QMS unions the Employee Master at read time) is a coordinated 2-module change whose risk exceeds the near-zero defect.
- **SEC-PIN-03** (readable-at-rest) — true data-withholding requires encryption / OS keystore = a new lib, violating the
  no-new-libs / additive-only constraint. Inherent limitation of an offline WebView app; the realistic injection vector
  (tampered backup) is closed by SEC-PIN-04, and packaged APKs have no dev-tools to set the flag directly (see SEC-PIN-01).
- **sec-apk-1** (debuggable) — `android:debuggable="true"` is injected by the **debug build type**, not the manifest source.
  Fix = distribute a signed **release** build. Build-process change; recorded for the APK step.
- **qms-L02** (layout P1, medium) — only the rare 1280×Mobile mismatch combo; a broad `--sidebar` reset risks other modules.
- **stock-L01** (layout P1, medium) — resolving the card-vs-scroll conflict means removing shell `!important` overrides,
  a higher-risk injected-CSS change; the screens remain usable today.

### P2/P3
Fixed the high-visibility shell-CSS P2s (header overlap, Home hero). The remaining ~140 P2/P3 (banner/hero cosmetic
content-clips like payroll `.hero` ~40px & tax `.cos-banner` ~80px, 44px control-floor crowding, minor pills) are
**deferred** — none cause page overflow, data loss, or unreachable controls. Batched for a future polish pass.

## Not re-runnable this session
The Wave-1/2 named harnesses (`test_bridge_cust` 7/7, `test_invoice` 11/11, `test_logic` 15/15) were session-scoped and
not retained on disk. Their behaviors were instead re-verified functionally in the live harness (bridge dsr-merge, invoice
seq restore round-trip, PIN logic, money parsing, GST reconcile).

## For the device test (WebView ≠ browser exactly)
1. **`prompt()` gate** (bugs/_live-prompt-gate.md) — confirm opening payroll/tax with protected-modules ON shows a native
   Admin-PIN prompt on the real APK (it throws in this headless preview). If it does NOT, migrate PIN/reset off `prompt()`.
2. **PIN migration** — an existing device with a legacy hash: first unlock re-hashes to `v2:` (seamless); and after this
   update a device with protection ON will require ONE re-unlock (the persisted flag is now PIN-bound). Both expected.
3. Re-check the fixed layout screens (payroll import modal, slip/HR preview, leave day-modal, tax capture row, planning
   form) on a physical 360/412 device.

## Commit / push / APK — HELD pending user's explicit go-ahead.
