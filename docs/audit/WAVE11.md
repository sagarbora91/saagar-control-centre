# V6 Wave 11 — People-ops (SHIPPED)

**Status:** BUILT + ADVERSARIALLY VERIFIED + FIXED + RE-VERIFIED + SHIPPED.
`origin/main = 1ec464b` (base 5c9b71b/Wave 10). APK `Retail/SaagarCC-DemoData-V6-Wave11.apk`
(6.80 MB; packaged index.html + integration-bridge.js + saagar-report.js all SHA256 byte-exact;
mojibake-clean). Device-test pending.

## Items (9, three clusters)
Grooming: P1-20 Top-Failed-Checks panel · P1-21 store-wise view · P1-22 checkedBy stamp.
CRO Audit: P1-23 QMS auto-fill Bills · P1-24 per-store targets + store dimension.
Payroll statutory: P1-48 persist statTotals at lock · P1-26 member-wise register · P1-27 F&F.
Bridge: P1-25 'CRO audit pending today' exception.

## Build recipe followed
9 spec agents + synthesis (14 collisions; shell edit + 5 owner plans + 6 cross-file contracts) →
5 parallel implementation owners → 3 blob owners hit two rounds of session-limit/connection deaths;
each time their partial edits were SHA-reverted to pristine and re-run (Wave-9 diff-audit rule), and
a diff-audit workflow confirmed all three COMPLETE_AS_FOUND (17+20+8 hunks, zero gaps/doubles) →
orchestrator embed ×3 (byte-verified) + mojiscan + browser harness (all 3 clusters, 0 console
errors) → 10-skeptic adversarial → 4 fixes folded → re-verified → ship.

## Files touched
Blobs (re-embedded into index.html): grooming.html, cro_audit.html, payroll.html. Plain:
www/integration-bridge.js (P1-25), www/saagar-report.js (P1-48 read + P1-26/27 builders), and 4
shell edits in www/index.html (EXC_AREA_TO_MODULE += CRO; STORAGE_RULES.payroll += payroll_fnf_v1;
factory-reset APP_RE payroll_suite→payroll_; + the re-embedded blob line).

## Data model (all additive)
Grooming records gain OPTIONAL store/empId/checkedBy/checkedByRole/checkedAt (no normaliser — stamped
at the single saveCRO site; renderMonthly croMap was the one read-side carry). cro_s_v3 gains a sparse
byStore map (carried via saveSettings' {...getS()} spread — the write-path trap). Payroll run objects
gain statTotals at lock (normalizeState passes runs through untouched; dropped on unlock by design).
NEW localStorage key: payroll_fnf_v1 (F&F records; own fnfList() normaliser; NOW backup-whitelisted).
gm_tax_feed unaffected. Store-code attribution = per-module text-match ('helios'→HEMW/'titan'→WLMHW),
grooming unresolved→'' (no fallback), cro_audit unresolved→null.

## Adversarial verify — 10 skeptics (9 items + cross-module)
ALL HOLD: **0 P0, 1 P1, 1 P2, 10 notes.** Folded (4 fixes):
1. [P1] payroll_fnf_v1 was NOT in STORAGE_RULES (payroll has no prefix rule, unlike Wave-10's gm_) →
   F&F records silently dropped from manual backup + device-migration export (same class as Wave-2's
   leavedesk_entitlements_v1). Fixed: added to STORAGE_RULES.payroll.exact AND broadened the
   factory-reset APP_RE 'payroll_suite'→'payroll_' (so reset wipes it + includes it in the pre-reset
   safety backup). Verified in-harness: isWhitelistedAppKey('payroll_fnf_v1')===true, APP_RE matches.
2. [P2] getDashTargets doubled the All-stores targets when byStore was a truthy non-object/empty
   (corrupt/bad restore) — getTargets had the shape guard, getDashTargets didn't. Mirrored the guard;
   verified all corrupt byStore values now return globals (80) not the doubled 160.
3. [note] a month locked with zero active employees wrote an all-zero statTotals that the pack
   rendered as a real ₹0 statutory page — _payrollLockedTotals now also gates on emp>0 (renders the
   empty-note; verified 219-char empty model vs 1261-char full page).
4. [bonus] cro_audit renderMonthDash CRO-name interpolation was unescaped while renderWeekDash escaped
   it — folded a stEsc(nm) hardening (out-of-register, from a skeptic's pre-existing-gap note).

Accepted residuals (documented, no fix): CSV spreadsheet-formula injection in name/checkedBy/empId
cells (PRE-EXISTING module-wide, staff names authenticated — deferred to a uniform CSV-hardening
pass); comma-in-numeric-UAN column shift (corrupt-data-only); zero-gross draft F&F (harmless);
proto-key/nameless-master reconcileEmployeeMaster quirks (PRE-EXISTING, shared with the shipped
grooming exception); demo-seed reseeds state each open in demo builds so the pack statutory fallback
needs an in-session lock to demo on the APK.

## Roadmap
31/52 P1 buildable done (W7:8, W8:4, W9:6, W10:4, W11:9). Next = Wave 12 Leave + Payroll-recon + Tax
(P1-28/30/29/31/32/33/34/35/41) per P1_LINEUP.md. Then Wave 13 (Shell/Reports/Security, riskiest last).
