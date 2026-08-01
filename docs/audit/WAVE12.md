# V6 Wave 12 — Leave + Payroll-recon + Tax (programme Phase 0, step 0.1)

**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = 78c9d7f`** + seeded APK `Retail/SaagarCC-DemoData-V6-Wave12.apk` (6.83 MB; packaged index.html + integration-bridge.js SHA256 byte-exact vs seeded source, mojibake-clean). Device-test PENDING.
**Base:** `origin/main = 1ec464b` (Wave 11) → `78c9d7f`. Committed files: `www/index.html` + `www/integration-bridge.js`; `docs/` untracked.
**9 items across 3 owner blobs + shell + 1 bridge line.** Additive-only; offline; no new libs.

## Features shipped
| Item | Module | What |
|---|---|---|
| P1-28 | leave | Per-store leave-capacity view (WLMHW Titan World / HEMW Helios). NEW sibling key `leavedesk_caps_v1` `{WLMHW,HEMW}` (default MAX_DAY=3). Store resolved authoritatively from central master (`grmStoreCode` logic). Advisory-only (getCapacity/canAddLeave unchanged). |
| P1-30 | leave | Next-7-days staffing strip (reads P1-28 caps/resolver + feature-detected blackouts). Read-only, no key. |
| P1-29 | leave | Peak-season blackout dates + store-holiday markers. NEW sibling key `leavedesk_blackouts_v1` `{v:1,entries:[…]}`. Calendar hatch/dot + live add-leave warning + submit soft-confirm/hard-block gate. |
| P1-31 | payroll | Display-only leave↔payroll reconciliation panel (Attendance tab). Reads `leavedesk_v3`, sums approved+legacy leave-days per name for the payroll month (attFeedKey bucket), flags vs entered `leavesApplied`. NEVER writes leavedesk_v3 or payroll state. |
| P1-35 | tax | QRMP per-firm flag (nested `firms[i].qrmp` on taxcal_v2). Advisory badge + per-card advisory (Option A — NO getVisibleItems filtering, scores byte-identical). |
| P1-41 | tax | Statutory-payable card (dashboard panel + current-month calendar strip) from bridge `saagar_tax_payable`. Current-month keyed. |
| P1-32 | tax | Evidence-pack completeness meter (done-non-NA denominator; async via SaagarEvidence.count). |
| P1-34 | tax | Audit-ready evidence ZIP (firm+FY) via shell JSZip; index.csv manifest; itemId-suffixed folders; ST_SHARE delivery. |
| P1-33 | tax+shell | CA WhatsApp pack. Shell `WA_CFG.tax` converted summary→record (synthetic `__all` reproduces old owner summary — no regression); `computeFirmTaxStatus` + `buildCaPackText`; in-module "Send CA pack" button posts ST_WA. |

## Shell/bridge edits (orchestrator, `www/index.html` + `www/integration-bridge.js`)
- `STORAGE_RULES.leave` → `{ exact:[], prefix:["leavedesk_"] }` — covers caps + blackouts + closes latent `leavedesk_weekoff_v1` backup gap. `APP_RE` already had `leavedesk_`+`taxcal` (no change).
- `window.ensureJSZip()` idempotent JSZip loader (P1-34).
- `computeFirmTaxStatus(firmId,fy)` + `buildCaPackText(firmId)` (P1-33).
- `WA_CFG.tax` → `kind:'record'` (P1-33).
- Bridge `reconcileMasters` push gains `store:e.store||''` (P1-28 companion, new-seeds only, advisory).

## Process
Spec fleet (9 agents) + collision synthesis (13 decisions) → DECISIONS.md → 3 parallel impl owners + orchestrator shell edits → embed (byte-verified) → mojiscan CLEAN → seeded browser harness (all 9 features, 0 console errors) → 12-skeptic adversarial fleet.

**Adversarial: 0 P0, 1 P1, 7 P2.** Folded 6 fixes (1 P1 + 5 P2), each re-verified individually in the harness; 2 P2 accepted as by-design/low-priority (noted below).

### P1 (fixed + re-verified end-to-end)
- **Restore silently dropped the leave sibling configs.** `validateRestoreKeyValue` leave branch hard-required `employees[]`, so caps/blackouts/weekoff/entitlements went INTO backup but were rejected on restore (also a pre-existing entitlements bug). FIX: per-key leave branch — `leavedesk_v3/v2` require `employees[]`, config siblings validate as plain objects. Verified: `validateRestoreData` now puts all 5 leave keys in `result.valid`.

### P2 folded (each re-verified)
1. Tax `index.csv` "Added-on" showed epoch-ms not date → `fmtAdded` (new Date→ISO date).
2. Tax stale QRMP badge on Composition firm (via UI type-change) → `saveFirm` gates `qrmp` by GST type (`regular`/`both` only). Verified: composition+ticked → `false`; regular+ticked → `true`.
3. Leave blank cap field saved `0` (spurious over-cap) → blank = keep current, explicit `0` honored. Verified 8→(blank)→8, explicit 0→0.
4. Tax `snapshotAll()` decoded the WHOLE evidence store (incl. watch photos) for one firm's ZIP → added shell `SaagarEvidence.snapshotByPrefix(prefix)`; export uses it (fallback to snapshotAll). Avoids device OOM/ANR.
5. Tax `__evCompToken` shared between fy-meter & month-chip → split into `__evCompTok{fy,month}`.

### P2 accepted (by-design / low-priority — not changed)
- P1-41 current-month card total vs per-item P-1 deposit badges differ (D9 accrual-vs-deposit; skeptic confirmed no correctness issue).
- P1-30 staffing-strip `avail` derives headcount from central master and on-leave from leavedesk records (advisory; edge only if a leave exists for a non-master name).

## Harness verification highlights (0 console errors throughout)
- Store resolver maps all 15 seeded staff (Arjun→HEMW etc.); per-store tally + over-cap flag correct; caps/blackouts are true siblings (`leavedesk_v3` shape untouched).
- Payroll recon: 15 rows, mismatches flagged, `leavedesk_v3` + payroll state byte-identical before/after (non-mutating).
- Tax: statutory card ₹15,649 (PF 12,540/ESIC 1,509/PT 1,600); completeness `{applicableTotal:113,done:0}`; QRMP advisory fires on all 6 real GST items (monthly→amber, quarterly→green); ZIP empty-path safe.
- Shell live: `isWhitelistedAppKey('leavedesk_weekoff_v1'|'_caps_v1'|'_blackouts_v1')===true`; `WA_CFG.tax.kind==='record'`; `ensureJSZip`+`snapshotByPrefix` present.
- **Note:** tax + payroll are admin-gated — harness needs `setAdmin(true)` before `openModule('tax'|'payroll')`.

## Trail
`docs/audit/wave12-specs/` — synthesis.json, DECISIONS.md, spec-P1-*.json, spec-fleet-raw.json, impl-owners-raw.json, adversarial-raw.json.

## On ship (owner go)
`git add www/index.html www/integration-bridge.js` → commit (Wave 12 message) → push → seeded APK `SaagarCC-DemoData-V6-Wave12.apk` (flip seed, cap sync, apply-overrides, gradlew assembleDebug --offline, SHA-verify packaged assets/public/index.html). Then update this file + `saagar-v6-wave12` memory + `MEMORY.md` + `HANDOFF.md`. 40/52 P1 done after this; next = Wave 13-lite.
