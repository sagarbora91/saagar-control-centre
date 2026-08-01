# Fix CHANGELOG (Phase 3)

Baseline `origin/main = 850ed72`. Working tree only — NO commit/push until the user asks. Each fix: edit extracted
`<id>.html` → re-embed via `module_tool.js` (byte-verified) → `node --check` + 11-blob decode → verify. Format:
`[finding-id] file — what changed`.

## BATCH 0 — P0 ✅ (embedded + verified in browser)
- `[xss-grooming-names]` grooming.html — added `esc()` helper; wrapped `rec.name`/`c.name` + initials in renderDaily/renderLeaderboard. Verified: `esc('<img onerror>')` → `&lt;img…&gt;`.
- `[xss-cro-audit-history]` cro_audit.html — wrapped remarks (textarea + detail), `a.store/a.cro/a.sm` (mpills + history), week-dash `nm` in existing `stEsc()`. Verified escaping.
- `[dsr-bug-01]` dsr.html — `normalizeRecord()` additively restores `cleaning.cp1/cp2` + `marketing` shape so bridge-created records (`cleaning:{}`) no longer crash the staff panel. Verified: `cleaning.cp1.done` no longer throws.
- `[dsr-bug-02]` dsr.html — `_writeRecNow` now `_mergeBridgeRows()`: re-reads storage and merges back `source:'qms'` sales/nonpurch/visitors (by `sourceRef`) before the whole-record overwrite, so the 60s-bridge-tick race no longer drops QMS-linked rows. In-memory wins for existing rows (staff edits preserved).
- `[bug-payroll-01]` payroll.html — `runBlockingErrors()` now blocks the lock on snapshot-key collisions (duplicate `empId||name`, or blank identity `""`) so `lockRun`'s `snapshot[empKeyOf(row)]` can't collapse two employees. Isolated `node --check` OK.
- Integrity: 4 embeds byte-verified round-trip; 11/11 blobs decode; 4 modules load with **zero** iframe errors.

## BATCH 1 — P1 bugs (module fleet, embedded + all 11 modules load clean)
- `[svc-money-comma-finalamt]` `[svc-manual-subtotal-comma]` service.html — added `parseRupee()` helper; strip thousands-commas before parsing Final Amount + manual Sub-Total. **Verified:** `parseRupee('1,200')→1200`, `'₹12,34,567'→1234567` (was 1/12).
- `[exp-bug-01]` `[exp-bug-02]` expense.html — editEntry/voidEntry re-read the ledger fresh at confirm time (no 60s-tick clobber); editEntry now rejects amount ≤0/non-finite.
- `[stock-carryforward-early-return]` stock.html — 7-day opening carry-forward now `continue`s past an unlocked prior day instead of bailing.
- `[qms-bug-01]` qms.html — `rangeStats` window start uses the local date-key, not wall-clock ms (stops dropping early-in-day entries on the oldest day).
- `[leave-bug-01]` leave.html — `loadData` defaults `data.leaves`/`data.agendas` to `[]` (no more blank-screen crash). (`bug-01` multi-day → fixed in report engine, see below.)
- `[dsr-bug-03..06]` dsr.html — re-read storage after cache (bridge rows visible); `calcTimeOut` unit fix; guarded photo-blob parse; write `audit.score` alias so the bridge reads it.
- `[cro-dup-audit]` `[cro-groom-stale]` cro_audit.html — duplicate-audit guard; clear auto-filled grooming % when CRO changes.
- `[bug-payroll-02]` `[bug-payroll-03]` payroll.html — advance date-boundary + closeMonth lock-downgrade guards.

## BATCH 2 — P1 layout (module fleet + planning + qms, embedded)
- `[payroll-L01]` payroll.html — Attendance-Import diff modal `max-height`+scroll (footer reachable on wide viewports).
- `[payroll-L02]` `[payroll-L03]` payroll.html — slip / HR-letter A4 previews `align-items:flex-start` so the 210mm surface scrolls from its left edge (left no longer clipped). **CSS-corroborated + confirmed.**
- `[leave-01]` leave.html — day-modal pending row wraps at 360.
- `[tax-01]` tax.html — compliance done-capture row wraps/stacks on narrow widths.
- `[dsr-01]` dsr.html — wide `.var-tbl`/`.ptbl` header/body alignment in the 641–920 band.
- `[L-planning-01]` planning.html — added `@media(max-width:640px){.grid{grid-template-columns:1fr}}`. **Verified:** planning's old 5px overflow gone.
- `[qms-L03]` qms.html — `switchView` closes the shell mobile drawer + scrim after nav selection. **Verified:** drawer opens via ☰, auto-closes after nav tap.
- `[qms-L01]` **REFUTED** (false positive — module ☰ is `display:none`; no overlap). Not changed.

## BATCH 3 — security (shell / report / manifest, verified end-to-end)
- `[xss-tax-firm-list]` tax.html — escapeHtml firm name/entity/PAN/GSTIN in renderFirmList.
- `[SEC-PIN-02]` index.html — PIN hash → per-install-salted, 50k-iterated `pinHashV2` ("v2:"); `verifyPin` accepts legacy hashes and auto-migrates. **Verified:** correct/wrong PIN, legacy verify + migration.
- `[SEC-PIN-01]` index.html — persisted admin flag bound to a PIN-derived token (`adminToken`); boot only grants admin on a token match, not a bare "true". **Verified:** token≠"true" when a PIN is set.
- `[SEC-PIN-04]` index.html — `restoreBlockedKeys()` + validateRestoreData reject `ADMIN_PIN_KEY`/`ADMIN_MODE_KEY` on import. **Verified:** both rejected.
- `[bug-backup-1]` `[bug-backup-2]` index.html — restore validator accepts `saagar_invoice_seq_v1` (number) + `saagar_wsf_settings_v1` (object). **Verified:** both accepted.
- `[SEC-DATA-01]` index.html — restore aborts if the rollback snapshot fails to save/read-back (no more false "undo" promise).
- `[SEC-DATA-02]` index.html — `saagar_bridge_config` whitelisted for backup/restore. **Verified:** whitelisted.
- `[SEC-DATA-03]` index.html — restore warns + points at the rollback if `written<keys.length` (partial restore surfaced).
- `[SEC-DATA-04]` index.html — 64 MB size guard on imported JSON (OOM/freeze protection).
- `[bug-01]` `[bug-02]` `[bug-03]` saagar-report.js — leaveRegister uses inclusive from→to day-span (no more multi-day-as-1) with `_spanned` anti-double-count; GST invoice CGST/SGST halves derived to always sum to Total GST; Round-Off line reconciles Total Payable with Taxable+GST. **`node --check` OK.**
- `[sec-apk-2]` AndroidManifest.xml — `android:allowBackup="false"` (blocks adb-backup exfiltration).

## BATCH 4 — shell-CSS layout (verified DOM)
- `[L-LIVE-1]` index.html — top-bar: cap role-select (`.topbar .role-select` beats base 140px), let actions compress, hide redundant subtitle on ≤480px → **brand↔role overlap gone** (was brand-meta 0px + subtitle spill).
- `[L-LIVE-2]` index.html — Home hero KPI grid `min-width:0` + wider min-track/smaller value font ≤420px → **KPI row fits** (residual hero scrollWidth is the decorative `::before`, not content).

## DEFERRED (documented in VERIFICATION.md — not fixed)
- `[bridge-01]` — read→write is synchronous (no cross-context interleave window in a single-threaded same-origin loop); roster addition self-heals every 60s tick; the clean fix needs a coordinated QMS-side reader (higher risk than the near-zero defect).
- `[SEC-PIN-03]` — true data-withholding needs encryption (a new lib / OS keystore) — out of the additive/no-libs constraint; documented as an inherent offline-app limitation.
- `[sec-apk-1]` — `debuggable` is injected by the DEBUG build type, not the manifest — the fix is to distribute a signed RELEASE build (build-process change, not source).
- `[qms-L02]` (medium, rare 1280×Mobile combo), `[stock-L01]` (medium, risky shell-override change).
- Residual banner/hero cosmetic content-clips (payroll `.hero` ~40px, tax `.cos-banner` ~80px, service `.brand-sub`) and the long-tail P2/P3 (~140) — no functional impact, no page overflow, no unreachable controls; batched for a future polish pass.
